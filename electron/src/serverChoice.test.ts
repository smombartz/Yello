import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LOCAL_URL, RAILWAY_URL, appUrl, isAppUrl, serverTarget } from './config';
import { adminSeen, loadServerChoice, markAdminSeen, saveServerTarget } from './serverChoice';

describe('server choice', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yello-server-choice-'));
    delete process.env.YELLO_URL;
  });

  afterEach(() => {
    delete process.env.YELLO_URL;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('starts on Railway with the Server menu hidden', () => {
    expect(loadServerChoice(dir)).toEqual({ target: 'railway', adminSeen: false });
    expect(appUrl()).toBe(RAILWAY_URL);
    expect(serverTarget()).toBe('railway');
  });

  it('remembers a switch to Local and follows it in isAppUrl', () => {
    loadServerChoice(dir);
    saveServerTarget('local');
    expect(appUrl()).toBe(LOCAL_URL);
    expect(isAppUrl('http://localhost:3456/admin')).toBe(true);
    expect(isAppUrl(`${RAILWAY_URL}/dashboard`)).toBe(false);

    expect(loadServerChoice(dir).target).toBe('local');
    expect(appUrl()).toBe(LOCAL_URL);
  });

  it('remembers that the admin was seen', () => {
    loadServerChoice(dir);
    expect(markAdminSeen()).toBe(true);
    expect(markAdminSeen()).toBe(false);
    expect(loadServerChoice(dir).adminSeen).toBe(true);
    expect(adminSeen()).toBe(true);
  });

  it('falls back to Railway when server.json is unreadable', () => {
    fs.writeFileSync(path.join(dir, 'server.json'), '{not json');
    expect(loadServerChoice(dir)).toEqual({ target: 'railway', adminSeen: false });
  });

  it('lets YELLO_URL win over the saved choice', () => {
    loadServerChoice(dir);
    saveServerTarget('railway');
    process.env.YELLO_URL = 'http://localhost:4000/some/path';
    expect(appUrl()).toBe('http://localhost:4000');
    expect(serverTarget()).toBe('local');

    process.env.YELLO_URL = RAILWAY_URL;
    expect(serverTarget()).toBe('railway');
  });
});
