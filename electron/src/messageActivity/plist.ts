// Minimal property-list reader for iPhone backups (Info.plist, Manifest.plist
// and the NSKeyedArchiver blobs in Manifest.db). Binary (bplist00) and XML.

export type PlistValue =
  | string | number | bigint | boolean | null | Date | Buffer
  | PlistUid | PlistValue[] | { [key: string]: PlistValue };

/** A reference into an NSKeyedArchiver's $objects */
export class PlistUid {
  constructor(public readonly value: number) {}
}

const APPLE_EPOCH_MS = Date.UTC(2001, 0, 1);

export function parsePlist(buf: Buffer): PlistValue {
  if (buf.subarray(0, 8).toString('latin1') === 'bplist00') return parseBinary(buf);
  return parseXml(buf.toString('utf8'));
}

function readUInt(buf: Buffer, offset: number, size: number): number {
  let n = 0;
  for (let i = 0; i < size; i++) n = n * 256 + buf[offset + i];
  return n;
}

function parseBinary(buf: Buffer): PlistValue {
  const trailer = buf.length - 32;
  const offsetSize = buf[trailer + 6];
  const refSize = buf[trailer + 7];
  const count = readUInt(buf, trailer + 8, 8);
  const top = readUInt(buf, trailer + 16, 8);
  const tableStart = readUInt(buf, trailer + 24, 8);
  const offsets: number[] = [];
  for (let i = 0; i < count; i++) offsets.push(readUInt(buf, tableStart + i * offsetSize, offsetSize));

  const depth = new Set<number>();
  const read = (ref: number): PlistValue => {
    if (ref >= count) throw new Error('bad plist reference');
    if (depth.has(ref)) throw new Error('circular plist');
    depth.add(ref);
    try {
      return readObject(offsets[ref]);
    } finally {
      depth.delete(ref);
    }
  };

  // Length of a data/string/array/dict: the low nibble, or a following int when it's 0xF
  const lengthAt = (pos: number): { length: number; start: number } => {
    const info = buf[pos] & 0x0f;
    if (info !== 0x0f) return { length: info, start: pos + 1 };
    const size = 1 << (buf[pos + 1] & 0x0f);
    return { length: readUInt(buf, pos + 2, size), start: pos + 2 + size };
  };

  const readObject = (pos: number): PlistValue => {
    const marker = buf[pos];
    const type = marker >> 4;
    const info = marker & 0x0f;
    switch (type) {
      case 0x0:
        return info === 0x09 ? true : info === 0x08 ? false : null;
      case 0x1: {
        const size = 1 << info;
        if (size === 8) {
          const big = buf.readBigInt64BE(pos + 1);
          return big >= BigInt(Number.MIN_SAFE_INTEGER) && big <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(big) : big;
        }
        if (size > 8) return buf.readBigUInt64BE(pos + 1 + size - 8);
        return readUInt(buf, pos + 1, size);
      }
      case 0x2:
        return info === 2 ? buf.readFloatBE(pos + 1) : buf.readDoubleBE(pos + 1);
      case 0x3:
        return new Date(APPLE_EPOCH_MS + buf.readDoubleBE(pos + 1) * 1000);
      case 0x4: {
        const { length, start } = lengthAt(pos);
        return Buffer.from(buf.subarray(start, start + length));
      }
      case 0x5: {
        const { length, start } = lengthAt(pos);
        return buf.toString('latin1', start, start + length);
      }
      case 0x6: {
        const { length, start } = lengthAt(pos);
        const chars = Buffer.from(buf.subarray(start, start + length * 2));
        chars.swap16();
        return chars.toString('utf16le');
      }
      case 0x8:
        return new PlistUid(readUInt(buf, pos + 1, info + 1));
      case 0xa: {
        const { length, start } = lengthAt(pos);
        const out: PlistValue[] = [];
        for (let i = 0; i < length; i++) out.push(read(readUInt(buf, start + i * refSize, refSize)));
        return out;
      }
      case 0xd: {
        const { length, start } = lengthAt(pos);
        const out: { [key: string]: PlistValue } = {};
        for (let i = 0; i < length; i++) {
          const key = read(readUInt(buf, start + i * refSize, refSize));
          out[String(key)] = read(readUInt(buf, start + (length + i) * refSize, refSize));
        }
        return out;
      }
      default:
        throw new Error(`unsupported plist object 0x${marker.toString(16)}`);
    }
  };

  return read(top);
}

function decodeEntities(s: string): string {
  return s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) => {
    switch (e.toLowerCase()) {
      case 'lt': return '<';
      case 'gt': return '>';
      case 'amp': return '&';
      case 'quot': return '"';
      case 'apos': return "'";
      default: return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    }
  });
}

function parseXml(xml: string): PlistValue {
  const tokens = xml
    .replace(/<\?xml[^>]*\?>|<!DOCTYPE[^>]*>|<!--[\s\S]*?-->/g, '')
    .match(/<[^>]+>|[^<]+/g) ?? [];
  let i = 0;
  const skipSpace = () => { while (i < tokens.length && !tokens[i].startsWith('<') && !tokens[i].trim()) i++; };
  const text = (tag: string): string => {
    let out = '';
    while (i < tokens.length && tokens[i] !== `</${tag}>`) out += tokens[i++];
    i++;
    return decodeEntities(out);
  };

  const value = (): PlistValue => {
    skipSpace();
    const tag = tokens[i++];
    if (!tag) throw new Error('unexpected end of plist');
    if (/^<(\w+)\s*\/>$/.test(tag)) {
      const name = tag.slice(1).replace(/\s*\/>$/, '');
      if (name === 'true') return true;
      if (name === 'false') return false;
      if (name === 'array') return [];
      if (name === 'dict') return {};
      return name === 'string' || name === 'data' ? (name === 'data' ? Buffer.alloc(0) : '') : null;
    }
    const name = tag.slice(1, -1).split(/\s/)[0];
    switch (name) {
      case 'plist': {
        const v = value();
        skipSpace();
        return v;
      }
      case 'dict': {
        const out: { [key: string]: PlistValue } = {};
        for (;;) {
          skipSpace();
          if (tokens[i] === '</dict>') { i++; break; }
          if (tokens[i++] !== '<key>') throw new Error('expected <key> in plist dict');
          const key = text('key');
          out[key] = value();
        }
        // XML archives write UIDs as { CF$UID: n }
        const keys = Object.keys(out);
        if (keys.length === 1 && keys[0] === 'CF$UID' && typeof out['CF$UID'] === 'number') return new PlistUid(out['CF$UID']);
        return out;
      }
      case 'array': {
        const out: PlistValue[] = [];
        for (;;) {
          skipSpace();
          if (tokens[i] === '</array>') { i++; break; }
          out.push(value());
        }
        return out;
      }
      case 'string': return text('string');
      case 'integer': {
        const t = text('integer').trim();
        const n = Number(t);
        return Number.isSafeInteger(n) ? n : BigInt(t);
      }
      case 'real': return Number(text('real').trim());
      case 'date': return new Date(text('date').trim());
      case 'data': return Buffer.from(text('data').replace(/\s+/g, ''), 'base64');
      default: throw new Error(`unsupported plist element <${name}>`);
    }
  };
  return value();
}

/** Resolve an NSKeyedArchiver blob's root object, following UIDs one level for each of its fields. */
export function unarchive(archive: PlistValue): { [key: string]: PlistValue } {
  const a = archive as { $objects?: PlistValue[]; $top?: { root?: PlistValue } };
  const objects = a.$objects;
  const rootRef = a.$top?.root;
  if (!Array.isArray(objects) || !(rootRef instanceof PlistUid)) throw new Error('not a keyed archive');
  const deref = (v: PlistValue): PlistValue => (v instanceof PlistUid ? objects[v.value] : v);
  const root = deref(rootRef) as { [key: string]: PlistValue };
  const out: { [key: string]: PlistValue } = {};
  for (const [key, v] of Object.entries(root)) out[key] = deref(v);
  return out;
}
