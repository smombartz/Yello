# Landing page at `/`

**Date:** 2026-10-06
**Status:** built. The maker's note copy is waiting for the owner's edit.

## Request

"A landing page for Yello that's simple, quiet and features some of the product's highlights. Inspired by apple.com and liumichelle.com/about."

## Decisions

| Question | Answer |
| --- | --- |
| Where it lives | `/` in the React app. Signed-in users go to `/dashboard`, and the desktop app goes to `/login`. |
| Primary action | Sign in with Google. "Try the demo" is secondary. |
| Voice | Product voice, plus one first-person maker's note |
| Structure | "The Highlights": a calm hero over a live contact list, then uneven tiles that each show working UI. It was chosen from three structures on the Impeccable decision round (seed `283b49e7`). |
| Build path | Code-led. No image generation was available, so there were no comps. |

The direction contract lives in `.impeccable/surfaces/frontend-src-components-landingpage-tsx.md`.

## Page

1. **Nav:** logo, then "Try the demo" (ghost) and "Sign in" (secondary).
2. **Hero:**
   - "Everyone you know. / One book."
   - A one-sentence lede.
   - Sign in with Google (new `Button size="lg"`) and a "Try the demo" text link.
   - The Contacts view at real scale, with a live search over the 20 sample people.
3. **Highlights:** on a Gray Wash band, six tiles in a 7/5 then 5/7 then 7/5 zigzag:
   - Merge, with the one authored motion.
   - Sources.
   - Birthdays, computed from today.
   - Map: a static OSM snapshot with projected, clustered pins.
   - Public card, with working per-field switches.
   - Export, as a vCard 3.0 excerpt with the 12,116-card proof.

   Below the tiles, one "Also in Yello" sentence.
4. **Maker's note:** first person, signed Sascha.
5. **Close:** a headline and the same actions, with a demo note.
6. **Footer.**

## Constraints honoured

- DESIGN.md's world is kept: Geist only, Signal Violet as signal, hairlines, the radius ladder.
- The gradient appears only inside the public-card tile, under the Front Door Rule.
- Display sizes above 30px are scoped to `.landing` as `--lp-*`.
- There are no testimonials, user counts, pricing or competitor comparisons.
- The sample people are invented and labelled as such.

## Follow-ups (not done)

- Replace the maker's note draft with the owner's own words.
- `index.html`'s meta and Open Graph description still say "Manage and organize your contacts with ease". Consider matching the landing lede.
- `LoginPage.tsx` still has `alt="Yellow"`.
