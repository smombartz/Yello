# Mobile adaptation: phone lookup and reach-out

Date: 2026-10-25 · Command: `/impeccable adapt` (requested as "optimize the mobile version of yello")

On a phone, Yello does three jobs: **find someone**, **reach them** (copy, text, call, WhatsApp,
email), and **share your own card**. This pass refines the existing ≤768px layer for those jobs. It
keeps the design system (DESIGN.md) as it is. No redesign, no new breakpoints.

## Audit findings (before)

1. Inputs are 14px, so iOS Safari zooms the page whenever a field gets focus (the search field included).
2. The phone header shrinks to `height: auto` (48px), but `--ds-header-height` stays 64px. That leaves a
   16px gap above the content, and between the header and the sticky list toolbar rows show through.
3. Reach-out links (text, call, WhatsApp, email) are 24×24px: half the minimum touch size, on
   the phone's main job.
4. At ≤640px, rows hide the role/company line, so two people with the same name look identical.
5. The toast sits at `bottom: 1.5rem`, behind the 56px tab bar.
6. The header is cramped. The title's 120px slot plus "Add Contact" (which repeats the + tab) leave
   search about 90px wide.
7. Dashboard and Profile can't be reached on a phone. The logo column and nav rail are hidden, and
   the tab bar has neither.
8. The filter popover runs off the right edge and its rows are about 28px tall. Bulk selection ("Select Page",
   avatar tap-to-select) has no place on a phone: tapping an avatar selects instead of opening the row.
9. Hover lift sticks after a tap, tall modals can overflow the viewport, and landscape ignores the
   safe-area insets on the left and right.

## Decisions

- **Navigation (user's choice):** keep the tabs. On phones the header shows the Yello mark on the left
  (→ Dashboard) and the user's avatar on the right (→ Profile).
- Bulk selection is a desk job, like Merge, Cleanup and Archive, which are already desktop-only routes. It is off on phones.
- Fields render at 16px on phones (an iOS zoom guard). Controls keep their 32px look. Touch targets
  grow where it matters (reach-out, filter rows).

## Steps

- [x] Shell: `--ds-header-height` is 56px (+ top safe area) on phones, and the header uses it. Content and the
      sticky toolbar line up with no gap.
- [x] Header: the Yello mark (→ /dashboard) and the user avatar (→ /profile) on phones; the title drops its
      fixed 120px slot; "Add Contact" is hidden on phones (Contacts and Dashboard), and so is the email on Profile.
- [x] iOS zoom guard: text fields, selects and textareas are 16px at ≤768px.
- [x] Reach-out bar: on phones, an expanded contact opens with Text · Call · WhatsApp · Email tiles
      for the primary phone and email (one tap, like iOS Contacts). Inline reach-out links grow to 40px.
- [x] Rows: the role/company line is back on narrow phones; a tap shows pressed feedback; no sticky hover lift on touch.
- [x] List toolbar: selection controls are hidden and avatar-select is off on phones.
- [x] Filter: becomes a bottom sheet with a backdrop on phones; rows are 44px.
- [x] Toast and modal: the toast clears the tab bar; modals cap at the viewport height and scroll.
- [x] Landscape: the content and tab bar respect the left and right safe-area insets.
- [x] Tab bar: the Tools icon matches the desktop rail (screwdriver-wrench).
- [x] Docs: DESIGN.md (phone header, reach-out bar, 16px fields), docs/log.md.

## Out of scope

Map view on phones, Tools subpages, onboarding/landing (they have their own responsive passes).

## Changes

- Implementation found that the sticky list toolbar is a stacking context below the header and tab bar, so
  it is lifted (`:has(.filter-popover)`) while the phone filter sheet is open.
- The filter backdrop needed its own close-on-click, because the popover's document `mousedown` handler would remove it before the
  click and let the tap fall through to the row behind.
- The filter sheet's slide-up was added to DESIGN.md's short list of sanctioned entrances.
