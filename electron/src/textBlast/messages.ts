import { execFile } from 'child_process';

// Messages.app over AppleScript. Data goes in as osascript arguments, never pasted into
// the script, so quotes, emoji and line breaks are safe. Each person is addressed by number
// on an account chosen by type: the form that still works on macOS 15 Sequoia and 26 Tahoe
// (Tahoe changed chat IDs, so they're never built or used). Ported from TextBlast.

const SEND_SCRIPT = [
  'on run argv',
  'set theHandle to item 1 of argv',
  'set theText to item 2 of argv',
  'set theService to item 3 of argv',
  'tell application "Messages"',
  'if not running then launch',
  'with timeout of 120 seconds',
  'if theService is "SMS" then',
  'set acct to 1st account whose service type = SMS and enabled is true',
  'else',
  'set acct to 1st account whose service type = iMessage and enabled is true',
  'end if',
  'send theText to participant theHandle of acct',
  'end timeout',
  'end tell',
  'return "dispatched"',
  'end run',
];

const ACCOUNTS_SCRIPT = [
  'tell application "Messages"',
  'set out to ""',
  'repeat with a in (every account)',
  'try',
  'set st to (service type of a) as text',
  'on error',
  'set st to "unknown"',
  'end try',
  'try',
  'set en to (enabled of a) as text',
  'on error',
  'set en to "unknown"',
  'end try',
  'set out to out & st & "=" & en & linefeed',
  'end repeat',
  'return out',
  'end tell',
];

const LAUNCH_SCRIPT = ['tell application "Messages"', 'if not running then launch', 'end tell'];

const ERROR_HINTS: Record<string, string> = {
  '-1743': 'macOS blocked Yello from controlling Messages. Allow it in System Settings › Privacy & Security › '
    + 'Automation (Yello › Messages), then try again.',
  '-1728': "Messages couldn't find that account or recipient. Check iMessage is on in Messages › Settings "
    + '(for SMS: Text Message Forwarding on your iPhone).',
  '-1700': 'Messages rejected the request.',
  '-1712': 'Messages timed out.',
  '-600': "Messages isn't running.",
};

export interface OsascriptResult { ok: boolean; stdout: string; stderr: string; timedOut: boolean }

export function runOsascript(lines: string[], args: string[] = [], timeoutMs = 150_000): Promise<OsascriptResult> {
  const argv = lines.flatMap((line) => ['-e', line]).concat(args);
  return new Promise((resolve) => {
    execFile('osascript', argv, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      const err = error as (NodeJS.ErrnoException & { killed?: boolean }) | null;
      if (err?.code === 'ENOENT') {
        resolve({ ok: false, stdout: '', stderr: 'osascript not found (this only works on macOS)', timedOut: false });
        return;
      }
      resolve({ ok: !err, stdout: String(stdout).trim(), stderr: String(stderr).trim(), timedOut: !!err?.killed });
    });
  });
}

/** Plain-language version of an osascript error, plus its error number. */
export function explainError(stderr: string): { code: string | null; message: string } {
  const code = /\((-?\d+)\)\s*$/.exec(stderr ?? '')?.[1] ?? null;
  const lines = (stderr || 'unknown error').trim().split('\n');
  const last = lines[lines.length - 1].replace(/^\d+:\d+: execution error: /, '');
  const hint = code ? ERROR_HINTS[code] : undefined;
  return { code, message: hint ? `${hint} (${last})` : last };
}

export interface MessagesSendOutcome { ok: boolean; timedOut: boolean; code: string | null; message: string }

export async function sendViaMessages(handle: string, text: string, service: 'iMessage' | 'SMS'): Promise<MessagesSendOutcome> {
  const r = await runOsascript(SEND_SCRIPT, [handle, text, service]);
  if (r.ok) return { ok: true, timedOut: false, code: null, message: 'dispatched' };
  if (r.timedOut) return { ok: false, timedOut: true, code: null, message: 'Messages was slow to respond' };
  return { ok: false, timedOut: false, ...explainError(r.stderr) };
}

export async function launchMessages(): Promise<{ ok: boolean; message: string }> {
  const r = await runOsascript(LAUNCH_SCRIPT, [], 120_000);
  return { ok: r.ok, message: r.ok ? '' : explainError(r.stderr).message };
}

/** Which Messages accounts are signed in and enabled. Asking also triggers macOS's Automation prompt. */
export async function checkAccounts(): Promise<{ imessage: boolean | null; sms: boolean | null; error: string | null }> {
  const r = await runOsascript(ACCOUNTS_SCRIPT, [], 120_000);
  if (!r.ok) {
    return { imessage: null, sms: null, error: r.timedOut ? "Messages didn't answer in time." : explainError(r.stderr).message };
  }
  let imessage = false;
  let sms = false;
  for (const line of r.stdout.split('\n')) {
    const [type, enabled] = line.split('=').map((s) => s.trim().toLowerCase());
    const on = enabled === 'true';
    if (type.includes('imessage') || type.includes('imsg')) imessage = imessage || on;
    else if (type.includes('sms')) sms = sms || on;
  }
  return { imessage, sms, error: null };
}
