import { useState } from 'react';
import { LIMIT_RANGE, useSaveSendLimits, useSendLimits, useSentToday, type SendLimits as Limits } from '../../api/textBlastHooks';
import { useToast } from '../ui/Toast';

/**
 * The daily and hourly send limits (all blasts combined), saved when a field loses focus.
 * Daily: the run stops and resumes tomorrow. Hourly: the run waits, then carries on.
 */
export function SendLimits() {
  const { data: limits } = useSendLimits();
  const { data: counts } = useSentToday();
  const save = useSaveSendLimits();
  const { showToast } = useToast();
  // Typed values, until saved. null = show the saved value.
  const [draft, setDraft] = useState<{ daily: string | null; hourly: string | null }>({ daily: null, hourly: null });

  if (!limits) return null;

  const commit = async (key: keyof Limits) => {
    const raw = draft[key];
    if (raw === null) return;
    const [min, max] = LIMIT_RANGE[key];
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) {
      showToast(`The ${key} limit has to be a whole number from ${min} to ${max}`, { type: 'error' });
      setDraft((d) => ({ ...d, [key]: null }));
      return;
    }
    if (n === limits[key]) { setDraft((d) => ({ ...d, [key]: null })); return; }
    try {
      await save.mutateAsync({ ...limits, [key]: n });
      showToast('Limit saved', { type: 'success' });
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not save the limit', { type: 'error' });
    } finally {
      setDraft((d) => ({ ...d, [key]: null }));
    }
  };

  const field = (key: keyof Limits, label: string) => (
    <label className="text-blast-limit">
      <input
        type="number"
        className="text-blast-input text-blast-limit-input"
        min={LIMIT_RANGE[key][0]}
        max={LIMIT_RANGE[key][1]}
        step={1}
        value={draft[key] ?? String(limits[key])}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        onBlur={() => void commit(key)}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        aria-label={label}
      />
      <span>{label}</span>
    </label>
  );

  return (
    <div className="text-blast-limits">
      <div className="text-blast-inline">
        <span className="text-blast-label">Limits</span>
        {field('daily', 'texts a day')}
        {field('hourly', 'texts an hour')}
      </div>
      <p className="text-blast-muted">
        {counts && <>{counts.count} sent today, {counts.hourCount} in the last hour. </>}
        For all blasts together. At the daily limit sending stops until tomorrow; at the hourly limit it waits, then
        carries on. Apple publishes no limits, so keep these modest: many texts from a new sender get reported as junk.
      </p>
    </div>
  );
}
