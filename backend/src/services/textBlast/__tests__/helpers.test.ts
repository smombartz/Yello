import { describe, it, expect } from 'vitest';
import { normalizePhone } from '../phone.js';
import { renderTemplate, cleanText, normKey } from '../template.js';
import { parseCsv } from '../csv.js';

describe('normalizePhone', () => {
  it('formats national numbers with the default country', () => {
    expect(normalizePhone('(917) 555-0199', 'US')).toEqual({ e164: '+19175550199' });
    expect(normalizePhone('0151 23456789', 'DE')).toEqual({ e164: '+4915123456789' });
  });

  it('treats a leading 00 as the international prefix', () => {
    expect(normalizePhone('0049 151 23456789', 'US')).toEqual({ e164: '+4915123456789' });
  });

  it('keeps +country numbers regardless of the default country', () => {
    expect(normalizePhone('+44 7911 123456', 'US')).toEqual({ e164: '+447911123456' });
  });

  it('accepts iMessage email addresses, lowercased', () => {
    expect(normalizePhone(' Ana@Example.com ', 'US')).toEqual({ e164: 'ana@example.com' });
    expect(normalizePhone('ana@', 'US')).toEqual({ problem: 'not a valid email address' });
  });

  it('explains empty and invalid numbers', () => {
    expect(normalizePhone('', 'US')).toEqual({ problem: 'no phone number' });
    const bad = normalizePhone('123', 'US');
    expect('problem' in bad && bad.problem).toMatch(/\+country code/);
  });
});

describe('renderTemplate', () => {
  it('fills placeholders, matching keys loosely', () => {
    expect(renderTemplate('Hi {First Name}!', { first_name: 'Ana' })).toEqual({ text: 'Hi Ana!', problems: [] });
    expect(renderTemplate('Hi {first-name}!', { first_name: 'Ana' }).text).toBe('Hi Ana!');
  });

  it('uses the fallback when the value is empty', () => {
    expect(renderTemplate('Hi {first_name|there}!', { first_name: '  ' }).text).toBe('Hi there!');
  });

  it('flags an empty value without a fallback and leaves the token', () => {
    const r = renderTemplate('Hi {first_name}!', { first_name: '' });
    expect(r.text).toBe('Hi {first_name}!');
    expect(r.problems[0]).toMatch(/is empty/);
  });

  it('flags unknown placeholders', () => {
    expect(renderTemplate('{nope}', {}).problems).toEqual(['no column called {nope}']);
  });

  it('turns {{ and }} into literal braces', () => {
    expect(renderTemplate('{{a}} {x}', { x: '1' }).text).toBe('{a} 1');
  });

  it('cleans whitespace', () => {
    expect(cleanText('  hi  \r\n\r\n\r\n\nthere  ')).toBe('hi\n\nthere');
    expect(normKey(' First  Name ')).toBe('first_name');
  });
});

describe('parseCsv', () => {
  it('reads comma, semicolon and tab files, dropping BOM and blank rows', () => {
    for (const d of [',', ';', '\t']) {
      const csv = `﻿phone${d}first_name\n+19175550101${d}Ana\n${d}\n+19175550102${d}Ben\n`;
      const p = parseCsv(csv);
      expect(p.header).toEqual(['phone', 'first_name']);
      expect(p.rows).toHaveLength(2);
      expect(p.rows[1]).toEqual({ phone: '+19175550102', first_name: 'Ben' });
      expect(p.phoneColumn).toBe('phone');
    }
  });

  it('handles quoted fields with commas, quotes and line breaks', () => {
    const p = parseCsv('phone,message\n+19175550101,"Hi, ""Ana""\nsee you"\n');
    expect(p.rows[0].message).toBe('Hi, "Ana"\nsee you');
    expect(p.overrideColumn).toBe('message');
  });

  it('renames duplicate and empty headers', () => {
    const p = parseCsv('name,name,,phone\na,b,c,1\n');
    expect(p.header).toEqual(['name', 'name_2', 'column_3', 'phone']);
  });

  it('finds the phone column by name or by content', () => {
    expect(parseCsv('Name,Mobile Phone\nA,+1 917 555 0101\n').phoneColumn).toBe('Mobile Phone');
    expect(parseCsv('Name,Contact\nA,+1 917 555 0101\nB,(917) 555-0102\n').phoneColumn).toBe('Contact');
    expect(parseCsv('Name,Notes\nA,hello\n').phoneColumn).toBeNull();
  });

  it('rejects an empty file', () => {
    expect(() => parseCsv('\n\n')).toThrow(/empty/);
  });
});
