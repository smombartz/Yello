# 2026-10-30 — Cleanup, Dashboard and Contacts list fixes

Seven user-requested fixes, one commit each.

## Approach

- The main session oversees. Subagents can't spawn their own subagents, so the overseer is the
  main session, not a separate agent.
- Three subagents, one per area, each in its own git worktree so parallel edits and commits don't
  collide. Each fix is its own commit on the worktree branch.
- Subagents leave `docs/log.md` alone (every fix would conflict there). They return a log entry
  per commit; the overseer cherry-picks each commit onto `master` and amends it with its log entry.
- The overseer runs `npm run build` (frontend) and the backend tests after integrating.

## Fixes

### A. Tools > Cleanup (subagent A)
- [x] A1. (5c67431) "Truly empty (no name)" / "Name only" selector behaves like tabs
- [x] A2. (60d6cd0) "No Name" lists only one contact although production has many (e.g. #31231, #31229)

### B. Dashboard (subagent B)
- [x] B1. (5e840c6) Merge the Cities square into the Countries square; link it to the map
- [x] B2. (ddbdaf5) "Contacts with photos" square links to the contacts list with the photos filter on
- [x] B3. (fbb6240) Today's birthdays: outline plus a "Today" label sitting on the outline

### C. Contacts list (subagent C)
- [x] C1. (b58c99e) Full email and full phone in aligned columns; long titles truncate first
- [x] C2. (b281705) Show how many contacts the current view/search/filter lists

## Changes
- A1 also turned Problematic Emails' Many Domains / Same Domain into tabs (same component).
- A2 root cause: No Name matched only `placeholder_name`, which is NULL for nameless contacts
  imported before stand-in names; the rule now also recognises stand-ins already in the display
  name (email local part, email, phone, "No Name"/"Unknown"). Not yet confirmed on production data.
- B2 needed no new filter: the list already supported `?filter=has-photo`.
- C2 needed no backend change: the list API already returned `total`. The count moved from the
  Contacts page header into the list toolbar, so group lists show it too. The list loads only the
  first 100 matches, so the count can exceed what's scrollable (tooltip says so).
- Integrated on master: frontend build passes, backend 407/407 tests pass. Worktrees removed.
