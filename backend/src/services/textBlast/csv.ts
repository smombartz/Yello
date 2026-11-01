import { normKey } from './template.js';

export interface ParsedCsv {
  header: string[];
  rows: Record<string, string>[];
  /** Header of the column holding numbers, or null when none was found. */
  phoneColumn: string | null;
  /** Header of a per-row `message` column that replaces the template. */
  overrideColumn: string | null;
}

const PHONE_KEYS = ['phone', 'phone_number', 'mobile', 'mobile_phone', 'mobile_number', 'cell',
  'cell_phone', 'number', 'tel', 'telephone', 'handle', 'imessage', 'phone_1_value'];
const OVERRIDE_KEYS = ['message', 'custom_message', 'override'];
const PHONE_LIKE = /^[+()\-.\s\d]{7,}$/;

/** Split CSV text into rows, honouring quotes (commas, quotes and line breaks inside fields). */
function splitRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"' && field === '') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * Parse a CSV export (comma, semicolon or tab; with or without BOM) the way TextBlast does:
 * first row is the header, blank rows are dropped, duplicate headers get a _2 suffix.
 */
export function parseCsv(input: string): ParsedCsv {
  const text = input.replace(/^﻿/, '');
  const firstLine = text.split('\n', 1)[0];
  const delimiter = [',', ';', '\t'].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best, ',');

  const all = splitRows(text, delimiter).filter((r) => r.some((c) => c.trim()));
  if (!all.length) throw new Error('The CSV is empty.');

  const width = Math.max(...all.map((r) => r.length));
  const seen = new Set<string>();
  const header: string[] = [];
  for (let i = 0; i < width; i++) {
    const base = (all[0][i] ?? '').trim() || `column_${i + 1}`;
    let h = base;
    for (let n = 2; seen.has(h); n++) h = `${base}_${n}`;
    seen.add(h);
    header.push(h);
  }
  const rows = all.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));

  const byKey = (keys: string[]) => keys.map((k) => header.find((h) => normKey(h) === k)).find(Boolean) ?? null;
  let phoneColumn = byKey(PHONE_KEYS);
  if (!phoneColumn) {
    // No obvious name: take a column where most values look like phone numbers.
    phoneColumn = header.find((h) => {
      const vals = rows.map((r) => r[h].trim()).filter(Boolean);
      return vals.length > 0 && vals.filter((v) => PHONE_LIKE.test(v)).length / vals.length >= 0.8;
    }) ?? null;
  }
  return { header, rows, phoneColumn, overrideColumn: byKey(OVERRIDE_KEYS) };
}
