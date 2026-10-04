# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The macOS desktop app (`electron/`) is a thin client that loads the hosted deployment, and phones get the same React app responsively (with a bottom tab bar). Both use the web design language, so neither makes the platform native.

## Users

**Super connectors and freelancers**: people whose network is their working capital. They know a lot of people across many contexts, and their contacts are scattered across iCloud, Google, LinkedIn, Gmail and old exports. A typical book has thousands of entries and many duplicates. The reference book this product grew out of has 12,116 cards.

Jobs, in their words and ours:

1. **Collect everything about people in one place.** Unify their contacts and community into a single book, whatever the source.
2. **Find the right person.** Search a large network by company, place, role or group to make an introduction or fill a need.
3. **Present themselves.** Share their own public contact card with new people.

Reach-out (copy a number, text, call, WhatsApp, email) is a supporting job, mostly done from the phone.

A secondary audience is the **recipients of a public card** (`/p/:slug`). They are not Yello users. They arrive from a shared link, often on a phone, and see only what the card owner chose to publish.

## Product Purpose

Yello is a personal CRM for people with big networks. It pulls every contact source into one book the user owns, keeps that book clean at a scale where Apple and Google Contacts give up, and makes the right person quick to find and reach.

Success means the user trusts Yello as the single place for everyone they know. They can find the right person for an intro in seconds, and nobody is lost in an ecosystem they can't export from.

## Positioning

Four pillars, all core:

- **You own the data.** Each user's book is a separate SQLite file. Every imported vCard property is modelled, and an export then re-import comes back lossless (verified on the 12,116-card book, 2026-09-27). Nothing is locked into an ecosystem.
- **One book, every source.** VCF, iCloud, Google Contacts, LinkedIn connections and Gmail email history all merge into one record per person.
- **Hygiene at scale.** Merge (dedupe by email, phone, address, social, or a recommended multi-signal match), cleanup, address geocoding and link repair, all built for 10K+ contacts.
- **Relationship memory.** Birthdays, email history, related people, groups, a map of where people are, and LinkedIn enrichment. A relationship tool, not an address list.

**Tiebreaker: relationships win.** If hygiene, enrichment or completeness pull against helping the user stay connected with people, staying connected wins.

## Operating Context

- **Desktop, for both quick lookups and long sessions** (Mac app or browser): imports, merging, cleanup, enrichment, groups, map. Sessions can run long, and large imports run as background jobs that survive navigation and reloads.
- **Phone, for lookup and reach-out on the go**: find someone, copy a value, or text, call, WhatsApp or email them from the contact card.
- **One account everywhere.** The desktop app, browser and phone all hit the same Railway deployment and data. Sign-in is Google OAuth only. On desktop it runs in the system browser and hands back over `yello://`.
- **Trying before signing up.** A demo account gives visitors 20 fabricated contacts and a 2-hour session, and suggests sign-in after 3 minutes.
- **Sharing.** Public cards travel as links through iMessage, Slack, LinkedIn and the like, so Open Graph previews matter.
- **External services the user may connect:** Google People API, iCloud, Gmail (email history), Apify (LinkedIn enrichment, using the user's own key) and HERE (paid geocoding).

## Capabilities and Constraints

**Surfaces:** Dashboard (upcoming birthdays, new contacts, locations) · Contacts (search, list/grid/card views, detail, add, related people, photos) · Map · Groups · Tools (Import: VCF, LinkedIn, Google, iCloud · Cleanup · Merge · Enrich · Export · Danger Zone) · Archive · Profile and public card · Onboarding · Admin and Docs (admin only).

**Terminology in use:** *Merge* (dedupe), *Cleanup*, *Enrich*, *Tools*, *Archive* (soft delete, restorable), *Groups* (backed by vCard `CATEGORIES`), *Profile* and *public card*.

**Constraints future work must keep:**

- **One book per person.** Multi-tenancy means one SQLite file per user, so there are no shared or team books. No decision has been recorded to add them.
- **Scale.** Every feature has to work with 10K+ contacts and photos. The original targets were search under 100 ms and a 60 fps list scroll.
- **vCard fidelity.** Whatever is imported can be exported. New fields need a vCard mapping or a lossless carrier, as `X-YELLO-LINKEDIN` does for enrichment.
- **Paid APIs.** HERE geocoding and Apify cost money per call. Never re-bill for data already held (imported coordinates are stamped so they are not re-geocoded).
- **Public by consent.** Nothing is served at `/p/:slug` until the user makes the card public. Only name and avatar default to visible; every other field is opt-in, per field.

**Undecided or not yet built:** pricing and licensing; team or shared books; a per-contact change log as a backup; AI-assisted group creation (the last two are in `docs/IDEAS.md`).

## Brand Commitments

- **Name: Yello.** It is used in the app UI, Open Graph tags, the desktop app, the `yello://` protocol and `demo.yello.app`. Two strays disagree: `frontend/index.html` has `<title>Yellow</title>`, and the Mintlify docs (`introduction.mdx`) say "Ello".
- **Assets:** `logo/logo-light.svg`, `logo/logo-dark.svg`, `favicon.svg`, `frontend/public/og-image.png`, and the desktop icon in `build-resources/` (`icon.svg`, `.png`, `.icns`).
- **Existing copy, not confirmed as voice:** "Manage and organize your contacts with ease" (meta description, login) and "Your contacts are stored securely and never shared" (login).

## Evidence on Hand

- **Real proof point:** the lossless vCard export/import round trip on a 12,116-card book (2026-09-27, `docs/readme.md`). Other real measurements: a live book of 8,054 contacts, and databases that shrank from 124 to 72 MB once `raw_vcard` was retired.
- **Demo data:** 20 fabricated contacts seeded for demo accounts (`docs/plans/2026-03-05-demo-account-design.md`). These are safe for screenshots, demos and marketing.
- **Private, never for public surfaces:** `docs/contacts.vcf`, `docs/LinkedIn-Connections.csv` and the sample `.vcf` files in `docs/` are real people's data.
- **Earlier design explorations:** `docs/stitch directory/` and `docs/stitch expanded card/` (an HTML file and a screenshot each).
- **Absent, and must not be fabricated:** testimonials, customer or user counts, press, pricing, and comparisons with named competitors.

## Product Principles

1. **Relationships win.** Each tool earns its place by helping someone stay connected with people. Completeness, automation and tidiness serve that goal.
2. **One person, one record.** Every source flows into a single record per person. The user should never have to reconcile the same person across apps.
3. **Yours to take.** Whatever enters Yello can leave with nothing lost. Portability is the minimum, not a feature.
4. **Fast at any size.** Design for 10K+ contacts. Finding someone takes seconds on a desktop or a phone, and reaching them takes one tap.
5. **Public only by choice.** The user decides, field by field, what strangers see. Defaults stay private.
