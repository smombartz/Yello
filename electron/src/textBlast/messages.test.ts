import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { describe, it, expect } from 'vitest';
import { ACCOUNTS_SCRIPT, LAUNCH_SCRIPT, SEND_SCRIPT } from './messages';

// Compiles each AppleScript without running it (nothing talks to Messages). A script that
// doesn't compile fails at runtime with "syntax error … (-2741)", as `st` did on macOS 27.
describe.runIf(process.platform === 'darwin')('AppleScripts compile', () => {
  const scripts = { SEND_SCRIPT, ACCOUNTS_SCRIPT, LAUNCH_SCRIPT };
  for (const [name, lines] of Object.entries(scripts)) {
    it(name, () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'yello-osa-'));
      try {
        const args = ['-o', path.join(dir, 'out.scpt'), ...lines.flatMap((l) => ['-e', l])];
        expect(() => execFileSync('osacompile', args, { stdio: 'pipe' })).not.toThrow();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});
