# Terms of Service and Privacy Policy pages

**Date:** 2026-10-25
**Status:** built. Waiting on legal review and the blockers in `docs/legal-review.md`.

## Request

"Add a terms of service and a privacy page to the landing page. Create a solid version that I can
review with legal."

## Approach

1. **Inventory the real data practices first** (scopes, stored tokens, third parties, retention,
   admin access, logs) so the policy describes what the code does, not a template.
2. **Routes** `/privacy` and `/terms`, public, reachable signed in or out and from the desktop app.
   They must be declared before the `*` catch-all, which redirects to `/dashboard`.
3. **One layout** (`LegalPage`) in the landing page's world: the landing nav (logo back to `/`,
   Sign in), a readable single column, an "On this page" contents list, and the shared footer.
4. **Shared footer**: extract the landing footer so both the landing page and the legal pages carry
   Privacy and Terms links.
5. **Placeholders in one file**: the legal entity, address, contact email, governing law and
   effective date live in `legal/legalDetails.ts`. Unfilled values render highlighted so nothing
   ships unnoticed.
6. **Login page** gets "By signing in you agree to the Terms and Privacy Policy", and its "never
   shared" line is corrected (data does go to processors such as Railway and HERE).
7. **Counsel notes**: `docs/legal-review.md` lists every placeholder, each factual claim and where
   in the code it comes from, and the open questions for the lawyer.

## Changes

- All seven steps are done.
- The audit found four issues that block publishing. They are recorded in `docs/legal-review.md`
  rather than fixed here, because they are product decisions:
  - cross-user Google photo enrichment (a Limited Use risk),
  - no account deletion endpoint,
  - profile images stored off the volume,
  - personal data in logs.
- Notice periods and the liability cap were added to `legalDetails.ts` as placeholders too.
