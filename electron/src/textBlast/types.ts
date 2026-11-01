// Shapes shared by the Text Blast engine, its IPC layer and the backend API
// (backend/src/services/textBlast/store.ts holds the server side of these).

export type RecipientStatus = '' | 'in_flight' | 'delivered' | 'sent' | 'sent_sms' | 'dispatched' | 'failed'
  | 'error' | 'pending' | 'not_found' | 'needs_review' | 'skipped' | 'simulated';

export type BlastStatus = 'draft' | 'running' | 'stopped' | 'finished';

export interface BlastRecipient {
  id: number;
  name: string;
  phone: string;
  text: string;
  status: RecipientStatus;
  service: string | null;
  sentAt: string | null;
  note: string | null;
}

export interface Blast {
  id: number;
  simulate: boolean;
  status: BlastStatus;
  recipients?: BlastRecipient[];
}

/** One outgoing message row from the Messages database. */
export interface OutgoingMessage {
  ROWID: number;
  service: string | null;
  is_sent: number;
  is_delivered: number;
  error: number;
}

export interface SendResult {
  status: RecipientStatus;
  service: string;
  note: string;
  /** osascript error number, e.g. "-1743" when macOS blocked control of Messages. */
  code?: string | null;
}

export interface SetupState {
  macos: boolean;
  imessage: boolean | null;
  sms: boolean | null;
  accountsError: string | null;
  chatDb: boolean;
  chatDbError: string | null;
  checkedAt: string;
}

export interface LogLine { at: number; level: 'info' | 'ok' | 'warn' | 'error'; text: string }

export interface RunnerProgress {
  running: boolean;
  blastId: number | null;
  simulate: boolean;
  total: number;
  processed: number;
  sent: number;
  failed: number;
  current: { recipientId: number; name: string; phone: string } | null;
  /** Epoch ms when the next text goes out, while waiting between texts. */
  nextAt: number | null;
  log: LogLine[];
}
