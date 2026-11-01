import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGroups } from '../../api/hooks';
import {
  normalizeTestPhone, useBlasts, useCreateBlast, useSentToday, useTextBlastPreview,
  type DesktopSendResult, type PreviewRecipient,
} from '../../api/textBlastHooks';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { FilePicker } from '../ui/FilePicker';
import { useToast } from '../ui/Toast';
import { Icon } from '../Icon';
import { COUNTRIES, RECIPIENT_STATUS } from './statusLabels';

interface ComposerProps {
  /** The desktop app's sender, or null in a browser. */
  desktop: {
    start(blastId: number): Promise<unknown>;
    testSend(phone: string, text: string, simulate: boolean): Promise<DesktopSendResult>;
  } | null;
  /** A blast is sending right now (only one at a time). */
  busy: boolean;
}

const TEST_PHONE_KEY = 'yello.textBlast.testPhone';
const SOURCE_LABEL = { group: 'Group', csv: 'CSV', both: 'Group + CSV' } as const;

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Build a blast: pick groups and/or a CSV, write the message, check every text, test, start. */
export function Composer({ desktop, busy }: ComposerProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { data: groupsData } = useGroups();
  const { data: blasts } = useBlasts();
  const { data: sentToday } = useSentToday();
  const createBlast = useCreateBlast();

  const [groups, setGroups] = useState<string[]>([]);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csv, setCsv] = useState<{ name: string; text: string } | null>(null);
  const [csvVersion, setCsvVersion] = useState(0);
  const [country, setCountry] = useState<string | null>(null);
  const [template, setTemplate] = useState('Hi {first_name|there}! ');
  const [phoneOverrides, setPhoneOverrides] = useState<Record<string, string>>({});
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [simulate, setSimulate] = useState(false);
  const [testPhone, setTestPhone] = useState(() => localStorage.getItem(TEST_PHONE_KEY) ?? '');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const templateRef = useRef<HTMLTextAreaElement>(null);

  // Default country: whatever the last blast used.
  const effectiveCountry = country ?? blasts?.[0]?.country ?? 'US';
  const debouncedTemplate = useDebounced(template, 350);
  const hasSource = groups.length > 0 || !!csv;
  const preview = useTextBlastPreview(
    { groups, csv, template: debouncedTemplate, country: effectiveCountry, phoneOverrides },
    csvVersion,
    hasSource,
  );
  const recipients = useMemo(() => (hasSource ? preview.data?.recipients ?? [] : []), [hasSource, preview.data]);

  const sendable = recipients.filter((r) => !r.problems.length && r.phone);
  const selected = sendable.filter((r) => !excluded.has(r.key));
  const heldBack = recipients.length - sendable.length;
  const firstText = selected[0]?.text ?? '';

  const onCsvChange = async (file: File | null) => {
    setCsvFile(file);
    if (!file) {
      setCsv(null);
    } else if (file.size > 5 * 1024 * 1024) {
      showToast('That CSV is over 5 MB', { type: 'error' });
      setCsvFile(null);
      return;
    } else {
      setCsv({ name: file.name, text: await file.text() });
    }
    setCsvVersion((v) => v + 1);
  };

  const toggleGroup = (g: string) =>
    setGroups((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));

  const toggleRow = (key: string) =>
    setExcluded((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const toggleAll = () =>
    setExcluded(selected.length ? new Set(sendable.map((r) => r.key)) : new Set());

  const insertField = (field: string) => {
    const el = templateRef.current;
    const token = `{${field}}`;
    if (!el) { setTemplate((t) => t + token); return; }
    const start = el.selectionStart ?? template.length;
    const end = el.selectionEnd ?? template.length;
    const next = template.slice(0, start) + token + template.slice(end);
    setTemplate(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const sendTest = async () => {
    if (!desktop || !firstText) return;
    setTesting(true);
    setTestResult(null);
    try {
      const n = await normalizeTestPhone(testPhone, effectiveCountry);
      if ('problem' in n) { setTestResult(`Test number: ${n.problem}.`); return; }
      localStorage.setItem(TEST_PHONE_KEY, testPhone);
      const res = await desktop.testSend(n.e164, firstText, simulate);
      setTestResult(`${RECIPIENT_STATUS[res.status].label} to ${n.e164}: ${res.note}`);
    } catch (e) {
      setTestResult(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  };

  const create = async (start: boolean) => {
    try {
      const blast = await createBlast.mutateAsync({
        groups, csv, template, country: effectiveCountry, phoneOverrides, simulate,
        excludeKeys: [...excluded],
      });
      if (start && desktop) await desktop.start(blast.id);
      navigate(`/tools/text-blast/${blast.id}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not create the blast', { type: 'error' });
    }
  };

  const remainingToday = sentToday ? Math.max(0, sentToday.cap - sentToday.count) : null;

  return (
    <>
      <section className="settings-section">
        <div className="settings-section-header">
          <Icon name="users" />
          <h2>1 · Who gets a text</h2>
        </div>
        <div className="settings-section-content text-blast-stack">
          <div>
            <div className="text-blast-label">Groups</div>
            <div className="text-blast-chips">
              {(groupsData?.groups ?? []).map((g) => (
                <button
                  key={g.category}
                  type="button"
                  className={`text-blast-chip${groups.includes(g.category) ? ' is-selected' : ''}`}
                  aria-pressed={groups.includes(g.category)}
                  onClick={() => toggleGroup(g.category)}
                >
                  {g.category} <span>{g.contactCount}</span>
                </button>
              ))}
              {groupsData && !groupsData.groups.length && <span className="text-blast-muted">No groups yet.</span>}
            </div>
          </div>
          <div>
            <div className="text-blast-label">CSV (optional)</div>
            <FilePicker id="text-blast-csv" accept=".csv,.tsv,.txt,text/csv" file={csvFile} onChange={onCsvChange} prompt="Choose a CSV" />
            <p className="text-blast-muted">
              A Google Sheet (File › Download › CSV), a Google Contacts export or any list with a phone column. Other
              columns become placeholders, and a <code>message</code> column replaces the template for that row.
              People in both the CSV and a group appear once. CSV people aren't added to your contacts.
            </p>
            {preview.data?.csv && !preview.data.csv.phoneColumn && (
              <p className="text-blast-warning"><Icon name="triangle-exclamation" /> No phone column found. Name one "phone".</p>
            )}
          </div>
          <label className="text-blast-inline">
            <span className="text-blast-label">Numbers without +country code are in</span>
            <select value={effectiveCountry} onChange={(e) => setCountry(e.target.value)}>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-header">
          <Icon name="message" />
          <h2>2 · Message</h2>
        </div>
        <div className="settings-section-content text-blast-stack">
          <textarea
            ref={templateRef}
            className="text-blast-template"
            rows={5}
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            placeholder="Hi {first_name}! …"
          />
          <div className="text-blast-chips">
            {(preview.data?.fields ?? ['first_name', 'last_name', 'nickname', 'company']).map((f) => (
              <button key={f} type="button" className="text-blast-chip is-field" onClick={() => insertField(f)}>{`{${f}}`}</button>
            ))}
          </div>
          <p className="text-blast-muted">
            <code>{'{first_name}'}</code> fills in from the contact or CSV. <code>{'{first_name|there}'}</code> uses "there" when
            it's empty. Without a fallback, people with an empty field are held back, so nobody gets "Hi !".
            Personal texts without links get reported as junk less often.
          </p>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-header">
          <Icon name="list-check" />
          <h2>3 · Check every text</h2>
          {preview.isFetching && <Icon name="spinner" className="fa-spin text-blast-muted" />}
        </div>
        <div className="settings-section-content text-blast-stack">
          {!hasSource ? (
            <p className="text-blast-muted">Pick a group or choose a CSV to see who gets what.</p>
          ) : preview.isError ? (
            <p className="text-blast-warning"><Icon name="triangle-exclamation" /> {(preview.error as Error).message}</p>
          ) : (
            <>
              <div className="text-blast-summary">
                <strong>{selected.length}</strong> will get a text
                {heldBack > 0 && <> · <span className="text-blast-warning-text">{heldBack} held back</span></>}
                {excluded.size > 0 && <> · {sendable.length - selected.length} unticked</>}
              </div>
              <PreviewTable
                recipients={recipients}
                excluded={excluded}
                onToggle={toggleRow}
                onToggleAll={toggleAll}
                allChecked={selected.length > 0 && selected.length === sendable.length}
                onPickNumber={(contactId, e164) => setPhoneOverrides((o) => ({ ...o, [contactId]: e164 }))}
              />
            </>
          )}
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-header">
          <Icon name="paper-plane" />
          <h2>4 · Test and send</h2>
        </div>
        <div className="settings-section-content text-blast-stack">
          <div className="text-blast-inline">
            <input
              type="tel"
              className="text-blast-input"
              placeholder="Your own number"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
            />
            <Button variant="secondary" icon="vial" loading={testing} disabled={!desktop || !firstText || !testPhone.trim() || busy} onClick={sendTest}>
              Send test
            </Button>
            <span className="text-blast-muted">Sends the first person's text to you. The blast isn't touched.</span>
          </div>
          {testResult && <p className="text-blast-test-result">{testResult}</p>}

          <label className="text-blast-inline">
            <input type="checkbox" checked={simulate} onChange={(e) => setSimulate(e.target.checked)} />
            <span>Simulate: run the whole thing without sending anything</span>
          </label>

          <div className="text-blast-actions">
            {desktop ? (
              <Button
                icon="paper-plane"
                loading={createBlast.isPending}
                disabled={!selected.length || busy || preview.isFetching}
                onClick={() => create(true)}
              >
                {simulate ? `Simulate ${selected.length}` : `Send ${selected.length} text${selected.length === 1 ? '' : 's'}`}
              </Button>
            ) : null}
            <Button
              variant={desktop ? 'ghost' : 'primary'}
              loading={createBlast.isPending && !desktop}
              disabled={!selected.length || preview.isFetching}
              onClick={() => create(false)}
            >
              Save without sending
            </Button>
            {remainingToday !== null && !simulate && (
              <span className="text-blast-muted">
                {sentToday!.count} of {sentToday!.cap} sent today.
                {selected.length > remainingToday && ` The rest wait until tomorrow (resume the blast then).`}
              </span>
            )}
            {busy && <span className="text-blast-muted">Another blast is sending.</span>}
          </div>
          <p className="text-blast-muted">
            Texts go out one at a time, 25–45 seconds apart, from your own number. Each person gets their own conversation.
            Yello stops on its own after 3 failures in a row, and you can stop any time.
          </p>
        </div>
      </section>
    </>
  );
}

function PreviewTable({ recipients, excluded, onToggle, onToggleAll, allChecked, onPickNumber }: {
  recipients: PreviewRecipient[];
  excluded: Set<string>;
  onToggle: (key: string) => void;
  onToggleAll: () => void;
  allChecked: boolean;
  onPickNumber: (contactId: number, e164: string) => void;
}) {
  if (!recipients.length) return <p className="text-blast-muted">Nobody here yet.</p>;
  return (
    <div className="text-blast-table-wrap">
      <table className="text-blast-table">
        <thead>
          <tr>
            <th><input type="checkbox" aria-label="Select all" checked={allChecked} onChange={onToggleAll} /></th>
            <th>Name</th>
            <th>Number</th>
            <th>Text</th>
          </tr>
        </thead>
        <tbody>
          {recipients.map((r) => {
            const blocked = r.problems.length > 0 || !r.phone;
            return (
              <tr key={r.key} className={blocked ? 'is-blocked' : excluded.has(r.key) ? 'is-unticked' : ''}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Send to ${r.name || r.phone}`}
                    disabled={blocked}
                    checked={!blocked && !excluded.has(r.key)}
                    onChange={() => onToggle(r.key)}
                  />
                </td>
                <td>
                  <div className="text-blast-name">{r.name || <span className="text-blast-muted">No name</span>}</div>
                  <Badge variant="neutral">{SOURCE_LABEL[r.source]}{r.csvRow ? ` · row ${r.csvRow}` : ''}</Badge>
                </td>
                <td className="text-blast-phone">
                  {r.contactId !== null && r.phones.length > 1 && r.csvRow === null ? (
                    <select value={r.phone ?? ''} onChange={(e) => onPickNumber(r.contactId!, e.target.value)}>
                      {r.phones.map((p) => <option key={p.e164} value={p.e164}>{p.e164} · {p.label}</option>)}
                    </select>
                  ) : (r.phone ?? <span className="text-blast-muted">No number</span>)}
                </td>
                <td>
                  {r.text && <div className="text-blast-text">{r.text}</div>}
                  {r.isCustom && <Badge variant="brand">custom</Badge>}
                  {r.problems.map((p) => (
                    <div key={p} className="text-blast-warning"><Icon name="triangle-exclamation" /> {p}</div>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
