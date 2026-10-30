# Nameless cards come in; Cleanup gets a No Name list and a stricter Name Only

**Status:** done

## Goal
- iCloud cards with no name stop failing sync ("Unreadable card: Missing required FN or N field").
  They import with a stand-in name (company, email or phone) and show in Cleanup → No Name.
- Cleanup → Name Only lists only contacts with a name and no other information at all.

## Steps
- [x] `placeholderName()` in `vcardParser.ts`; parser sets `displayName` + `namePlaceholder` instead of throwing
- [x] Google mapper uses the same fallback and flag
- [x] `contacts.placeholder_name` column (+ migration), written on insert and on sync name rewrites
- [x] `cleanupService`: shared SQL for "no real name" / "no data"; `no_name` type; Name Only checks every data field
- [x] Route/schema/frontend: No Name filter chip, badge, card shows emails/phones/company
- [x] Tests (`nameless.test.ts`), docs (`database.md`, `reference.md`), log
