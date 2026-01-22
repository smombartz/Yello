import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDatabase, closeDatabase } from '../database.js';

describe('database', () => {
  beforeAll(() => {
    process.env.DATABASE_PATH = ':memory:';
  });

  afterAll(() => {
    closeDatabase();
  });

  it('should create contacts table', () => {
    const db = getDatabase();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contacts'").get();
    expect(tables).toBeDefined();
  });

  it('should create FTS5 virtual tables', () => {
    const db = getDatabase();
    const fts = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contacts_fts'").get();
    expect(fts).toBeDefined();
  });
});
