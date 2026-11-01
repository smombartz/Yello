import { useMutation } from '@tanstack/react-query';
import { API_BASE } from './client';

export type ExportFormat = 'vcf' | 'csv';

/** What to export: picked contacts, or every active contact in a group. */
export type ExportTarget = { ids: number[] } | { group: string };

/** The two formats, as the export menus list them. */
export const EXPORT_FORMATS: Array<{ format: ExportFormat; label: string; icon: string }> = [
  { format: 'vcf', label: 'vCard (.vcf)', icon: 'address-card' },
  { format: 'csv', label: 'CSV (Google Contacts)', icon: 'file-csv' },
];

/** The filename from Content-Disposition, preferring the UTF-8 filename*. */
function filenameFrom(disposition: string | null): string | null {
  if (!disposition) return null;
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) {
    try { return decodeURIComponent(utf8[1]); } catch { /* fall through */ }
  }
  return disposition.match(/filename="([^"]+)"/i)?.[1] ?? null;
}

/**
 * Posts the export and saves the response as a download. A POST (not a link)
 * because a selection can be thousands of IDs.
 */
async function downloadExport(format: ExportFormat, target: ExportTarget): Promise<void> {
  const response = await fetch(`${API_BASE}/api/contacts/export`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format, ...target }),
  });
  if (!response.ok) {
    let message = 'Export failed. Please try again.';
    try {
      const body = await response.json();
      if (body.error) message = body.error;
    } catch { /* keep default */ }
    throw new Error(message);
  }

  const fallback = 'group' in target ? `${target.group}.${format}` : `yello-contacts.${format}`;
  const filename = filenameFrom(response.headers.get('Content-Disposition')) ?? fallback;
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next tick: revoking straight away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function useExportContacts() {
  return useMutation({
    mutationFn: ({ format, target }: { format: ExportFormat; target: ExportTarget }) =>
      downloadExport(format, target),
  });
}
