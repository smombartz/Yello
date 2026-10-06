---
version: 1
slug: "frontend-src-components-landingpage-tsx"
primary_target: "frontend/src/components/LandingPage.tsx"
related_targets: ["frontend/src/styles/pages/landing.css"]
---

# Surface brief: / (landing page)

**Scope and mode:** the public page at `/` for signed-out visitors. Persuade mode. Signed-in users go straight to `/dashboard`, and the desktop app (Electron user agent) goes straight to `/login`, so neither sees it.

**Audience and job:** super connectors and freelancers arriving cold, often from a shared link. They should leave believing Yello is the one book for everyone they know, and act by signing in with Google. The demo (20 sample contacts, two hours, no account) is the quieter second action.

**Proof and content:**
- The product itself is the imagery. Every vignette is real Yello UI built from the demo book's fabricated contacts, labelled as sample data.
- The real proof point is the lossless vCard export and re-import of a 12,116-card book (2026-09-27).
- A first-person maker's note, drafted for the user to correct.

**Constraints:**
- The user asked for simple and quiet, inspired by apple.com and liumichelle.com/about.
- There are no testimonials, user counts, pricing or named competitor comparisons.
- Real contact files in `docs/` never appear.
- Demo photos have no recorded provenance, so avatars are initials only.

## Direction contract

THESIS: a calm Apple-style highlights page where every tile is a working piece of Yello, not an icon with a caption. It refuses the same-size feature-card grid and the marketing illustration.

OWN-WORLD: Yello's desk, at front-door scale.
- White hero, then a Gray Wash band holding white tiles of uneven size with 24px corners and hairline borders.
- Geist alone, at a new display step (44 to 88px, 600, tight tracking).
- Signal Violet only on the primary action and active states. Hash-hued initial avatars carry the colour.
- The Iris to Cobalt gradient appears only inside the public-card tile.

STORY: the visitor reads one line, sees their kind of book (a real contact list), searches it, then scans six highlights. Merge collapses a duplicate pair into one record as it enters view. The visitor reads the maker's note and signs in with Google.

FIRST VIEWPORT:
- A quiet nav: logo left; "Try the demo" and "Sign in" right.
- A centred two-line headline, "Everyone you know. / One book.", with a one-sentence lede.
- Sign in with Google as the violet primary, beside a "Try the demo" link.
- Below the actions, a wide framed Contacts list from the demo book. Its top edge shows inside the fold.

FORM: The Highlights, position 6 of 7 on the grounded list, seed key 283b49e7. Signature interaction: the hero frame is a small working copy of the app (added 2026-10-06 at the user's request). The rail switches Dashboard, Contacts, Map, Groups and Tools; rows expand into the real `ContactCardView`; search, group cards, map pins and dashboard items all lead back to a person. The frame only scrolls once clicked or tabbed into. The one authored motion is the Merge tile collapsing its duplicate pair when it scrolls into view.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
