import { Button } from '../ui/Button';
import { Icon } from '../Icon';
import type { DesktopSetup } from '../../api/textBlastHooks';

interface SetupBarProps {
  available: boolean;
  setup: DesktopSetup | null;
  checking: boolean;
  onRecheck: () => void;
  onOpenSettings: (pane: 'automation' | 'full-disk-access') => void;
}

type ItemState = 'ok' | 'off' | 'unknown';

function Item({ state, label, detail, action }: { state: ItemState; label: string; detail: string; action?: React.ReactNode }) {
  const icon = state === 'ok' ? 'circle-check' : state === 'off' ? 'circle-xmark' : 'circle-question';
  return (
    <li className={`text-blast-setup-item is-${state}`}>
      <Icon name={icon} />
      <div>
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
      {action}
    </li>
  );
}

/** What the desktop app reports about Messages and macOS permissions (TextBlast's setup bar). */
export function SetupBar({ available, setup, checking, onRecheck, onOpenSettings }: SetupBarProps) {
  if (!available) {
    return (
      <div className="text-blast-notice">
        <Icon name="laptop" />
        <div>
          <strong>Sending needs the Yello desktop app for Mac.</strong>
          <span>You can build and save a blast here, then open Yello on your Mac to send it through Messages.</span>
        </div>
      </div>
    );
  }
  if (!setup) {
    return <div className="text-blast-notice"><Icon name="spinner" spin /> Checking Messages…</div>;
  }
  if (!setup.macos) {
    return <div className="text-blast-notice is-error"><Icon name="circle-xmark" /> Text Blast sends through Apple Messages, so it only works on a Mac.</div>;
  }

  const blocked = !!setup.accountsError && /-1743|blocked/i.test(setup.accountsError);
  const automation: ItemState = blocked ? 'off' : setup.imessage === null ? 'unknown' : 'ok';
  const imessage: ItemState = setup.imessage ? 'ok' : setup.imessage === false ? 'off' : 'unknown';
  const sms: ItemState = setup.sms ? 'ok' : setup.sms === false ? 'off' : 'unknown';

  return (
    <div className="text-blast-setup">
      <ul>
        <Item
          state={automation}
          label="Control Messages"
          detail={automation === 'ok' ? 'Allowed' : blocked ? 'Blocked by macOS' : setup.accountsError ?? 'Not checked yet'}
          action={automation === 'off' && (
            <Button size="sm" variant="secondary" onClick={() => onOpenSettings('automation')}>Open Automation</Button>
          )}
        />
        <Item
          state={imessage}
          label="iMessage"
          detail={imessage === 'ok' ? 'Signed in' : imessage === 'off' ? 'Turn on iMessage in Messages › Settings' : 'Unknown'}
        />
        <Item
          state={sms}
          label="SMS fallback"
          detail={sms === 'ok' ? 'Through your iPhone' : sms === 'off' ? 'Off: iPhone › Settings › Apps › Messages › Text Message Forwarding' : 'Unknown'}
        />
        <Item
          state={setup.chatDb ? 'ok' : 'off'}
          label="Delivery checks"
          detail={setup.chatDb ? 'Full Disk Access granted' : 'Needs Full Disk Access for Yello. Without it, texts show as "Sent (not checked)".'}
          action={!setup.chatDb && (
            <Button size="sm" variant="secondary" onClick={() => onOpenSettings('full-disk-access')}>Open Full Disk Access</Button>
          )}
        />
      </ul>
      <Button size="sm" variant="ghost" icon="rotate" loading={checking} onClick={onRecheck}>Check again</Button>
    </div>
  );
}
