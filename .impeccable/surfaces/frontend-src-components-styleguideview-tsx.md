---
version: 1
slug: "frontend-src-components-styleguideview-tsx"
primary_target: "frontend/src/components/StyleGuideView.tsx"
related_targets: []
---

# Surface brief: /styleguide

**Scope and mode:** an admin-only reference page inside the app shell (linked beside Admin and Docs in the nav rail). Read mode. The reader came to understand the system and take something away: a token name, a component and its props, or a rule.

**Audience and job:** the admin (and the agents who build Yello) answering "what exists, what does it look like, what is it called, and when do I use it?" in seconds.

**Content:**
- Every `--ds-*` token, read live from the shipped stylesheets so the page can't drift.
- The real `components/ui` primitives rendered live in their variants and states.
- DESIGN.md's named rules set beside the specimens they govern.

**Constraints:**
- The established Yello world from DESIGN.md is fixed; this page adds no new visual language.
- No fabricated claims. Sample names are labelled as samples.
- Desktop-first, but it must read at phone width.

## Direction contract

THESIS: a live specimen book. Every token appears as its effect (the colour, the size, the gap, the curve, the shadow, the motion), never as a bare value table. It refuses the category default of a static token dump or a Storybook clone.

OWN-WORLD: Yello's desk, unchanged:
- Desk White sections on the shell.
- Specimens laid out on hairline-ruled sheets.
- Token names in a small code face, with Signal Violet only on what's active or copyable on hover.
- Rules set as quiet Shaded Paper notes with a run-in bold name.

STORY: the reader scans the contents rail, lands on a section, sees the token rendered, copies its name with one click, reads the governing rule, and uses the live component knowing its exact props.

FIRST VIEWPORT:
- Header: "Admin › Style guide", a "Filter tokens" search and a live token count.
- Main column: a one-paragraph intro naming the North Star and how to copy; then Color opens with the brand row (Signal Violet family and the front-door gradient strip) and the Signal Only rule.
- Right: a sticky contents rail grouped Foundations / Components.

FORM: the Docs reference pattern (main column plus sticky TOC), shaped directly. Seed key: none. The user's request named the route and the content ("a style guide page at /styleguide that renders the --ds-* tokens and the real components") and confirmed admin access and depth, inside an established world. new-work §3 says never run concept-seed for a precisely specified narrow request. Signature interaction: click any token to copy `var(--ds-…)`, confirmed by the app's own toast. The header filter narrows every token section at once.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
