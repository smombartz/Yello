# Contact details: click to copy, plus text, call, WhatsApp and email icons

## Context

In the contact detail view, phone numbers are `tel:` links and email addresses are `mailto:` links. Clicking a value opens the dialer or mail app, which is rarely what you want on a desktop CRM. Usually you want the value on your clipboard.

The change has two parts:
- **Click to copy:** clicking a phone number or email copies it to the clipboard.
- **Action icons:** small icons next to each value handle reaching out.
  - **Phone:** text (`sms:`), call (`tel:`) and WhatsApp (`wa.me`).
  - **Email:** email (`mailto:`).

A WhatsApp icon already sits next to each phone number (`WhatsAppLink`). It gets folded into the new icon group.

## Where it lives

Everything is in `frontend/src/components/ContactFormSections.tsx`:
- `PhoneSection` and `EmailSection` view mode (lines ~294–328 and ~409–439).
- Both render through `InfoField` (line 46).

These sections render in three places:
- the contact detail page (`ContactDetailPage` → `ContactRowExpanded` → `ContactCardView`)
- the expanded row in the contact list (same chain; `ContactRowExpanded` already stops click propagation, so clicks won't collapse the row)
- the profile editor's view mode (`UserProfilePage`, with visibility-toggle suffixes)

Reused pieces:
- `useToast()` from `components/ui/Toast.tsx`, mounted app-wide in `App.tsx`. It gives copy feedback.
- `Icon` from `components/Icon.tsx` (Font Awesome kit). Icons: `comment-sms`, `phone`, `whatsapp` (brands), `envelope`.
- The `--ds-color-whatsapp` and `--ds-color-whatsapp-hover` tokens (`styles/design-system.css:60-61`).
- The global `:focus-visible` ring (`index.css:81-89`), which already covers buttons and links.

Electron needs no change:
- `electron/src/main.ts` `EXTERNAL_PROTOCOLS` already allows `tel:`, `sms:`, `mailto:` and `https:`.
- `wa.me` opens in the system browser through `setWindowOpenHandler`.

## Changes

### 1. `ContactFormSections.tsx`

- **`InfoField`:** add an optional `actions?: React.ReactNode` prop.
  - Render it after `.info-field-value` as `<div className="info-field-actions">`.
  - Because it's a sibling, the value can still truncate with an ellipsis while the icons stay visible. Long emails won't push the icons out.
- **New `CopyableValue({ value, title })`:** a `<button type="button" className="copyable-value">` showing the value.
  - On click: `stopPropagation`, then `navigator.clipboard.writeText(value)`.
  - On success: `showToast(\`Copied ${value}\`, { duration: 2000 })`.
  - On failure: `showToast("Couldn't copy to clipboard", { type: 'error' })`.
  - Default `title` is "Click to copy". For phones it becomes `"<Country> · Click to copy"`, so the country-name tooltip that was on the old `tel:` anchor isn't lost.
- **New `ContactActionLink({ href, icon, iconStyle, label, external?, className? })`:** an `<a className="contact-action-link">` with:
  - `title` and `aria-label` set to `label`
  - `stopPropagation` on click
  - `target="_blank" rel="noopener noreferrer"` when `external`
- **New `PhoneActions({ phone })`:** renders Text, Call and WhatsApp, in the order the request gave.
  - Text and Call use a dialable number, `phone.replace(/[^\d+]/g, '')`. Manually edited numbers aren't E.164 (`updatePhone` stores raw input), so this keeps the hrefs clean.
  - WhatsApp keeps the existing digits-only `wa.me` logic.
  - Renders nothing if the number is empty.
- **New `EmailActions({ email })`:** renders a `mailto:` link with the `envelope` icon, labelled "Send email".
- **`PhoneSection` view:** replace the `tel:` anchor and `WhatsAppLink` with `<InfoField … actions={<PhoneActions phone={phone.phone} />}><CopyableValue value={phone.phoneDisplay} … /></InfoField>`.
- **`EmailSection` view:** the same pattern with `CopyableValue value={email.email}` and `EmailActions`.
- **Legacy `ContactInfoSection` view branch (~552–579):** swap its `tel:`/`mailto:` anchors and `WhatsAppLink` for `CopyableValue` plus the new action components, so `WhatsAppLink` can be deleted.
  - Its only caller (`AddContactPage`) uses edit mode, so this branch never renders today. The swap just keeps it consistent.
- **Delete `WhatsAppLink`.**

### 2. `frontend/src/index.css`

Put this next to the `.info-field` rules (~1910–1967), replacing the `a.whatsapp-link` rules:
- **`.copyable-value`:**
  - Button reset: no background or border, `padding: 0`, `font: inherit`, `color: inherit`, `text-align: left`.
  - `cursor: pointer`.
  - Truncation: `display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`.
  - Underline on hover, to match today's link hover.
- **`.info-field-actions`:** `display: flex; align-items: center; gap: 2px; flex-shrink: 0`.
- **`.contact-action-link`:**
  - Size: 24×24 `inline-flex`, centred, `border-radius: var(--ds-radius-sm)`.
  - Colour: `var(--ds-text-secondary)`, with font size `var(--ds-font-sm)`.
  - Hover: `var(--ds-text-primary)` on `var(--ds-bg-hover)`, no underline.
- **`.contact-action-link.whatsapp`:** `var(--ds-color-whatsapp)`, and `-hover` on hover.

### 3. Docs (per CLAUDE.md)

- Copy this plan to `docs/plans/2026-10-03-contact-detail-copy-and-actions.md`.
- Add a `docs/log.md` entry at the top.
- Add a short note to `docs/readme.md` on how contact detail interactions work.

## Out of scope

- **Public contact card (`PublicContactCard.tsx`):** visitors see it, mostly on phones, where tap-to-call is the right behavior.
- **Addresses, URLs and social links:** the request didn't mention them.
- **The list row (`ContactRow`):** it shows the primary phone and email as plain text, not links.
- **Your own numbers in the profile editor:** they'll also get the action icons. That's harmless; a hide flag can come later if it bothers you.

## Verification

- `cd frontend && npm run build`, which type-checks through `tsconfig.app.json` with `noUnusedLocals`. This catches a leftover `WhatsAppLink`.
- `cd frontend && npm run lint`.
- Grep for any remaining `tel:` or `mailto:` anchors in `ContactFormSections.tsx`, and for `whatsapp-link` in CSS and TSX.
- No visual check from me: per CLAUDE.md you do that. On your dev server, open a contact and check:
  - Clicking a number or email copies it and shows a toast.
  - The Text, Call and WhatsApp icons open Messages, FaceTime and WhatsApp.
  - The email icon opens the mail client.
  - In the expanded list row, clicks don't collapse the row.
  - Long emails truncate while their icons stay visible.
