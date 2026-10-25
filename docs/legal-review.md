# Legal review: Terms of Service and Privacy Policy

**Status:** draft for counsel, 2026-10-25. Not yet live-ready: see *Blockers*.

**Pages:**
- `/terms`: `frontend/src/components/legal/TermsOfService.tsx`
- `/privacy`: `frontend/src/components/legal/PrivacyPolicy.tsx`

**How to read the pages:** every value comes from one file,
`frontend/src/components/legal/legalDetails.ts`. Any value still in `[square brackets]` shows
highlighted in yellow on the page; none are left. Values marked *Estimate* in the table below
render as normal text, so confirm them with counsel before launch. The pages also print cleanly
(Cmd+P), without the nav or the contents list.

The policy was written from an audit of the code, not from a template. *Claims and where they come
from* lists each factual statement with its source, so counsel can check that the text matches what
the product does.

---

## 1. Filled values (`legalDetails.ts`)

| Key | Value | Basis | Notes |
|---|---|---|---|
| `entityName` | Office for Visual Affairs | Owner | Counsel: confirm the exact registered name, including any suffix (e.g. LLC), since this entity is the party to the Terms. |
| `entityAddress` | 19 Morris Ave, Brooklyn, NY 11205 | Owner | Used for notices; it also satisfies GDPR Art. 13's controller contact details. |
| `contactEmail` | frontdesk@officeforvisualaffairs.com | Owner | Privacy and account deletion requests go here (see Blocker 2). Someone must watch this inbox. |
| `governingLaw` | the laws of the State of New York | Owner | Arbitration and a class-action waiver were left out on purpose. Counsel should decide whether to add them for US users. |
| `venue` | State courts in Kings County, NY, or the US District Court for the Eastern District of New York | Owner (Kings County) | The federal court that covers Kings County is the Eastern District of New York, which is why it's added. |
| `hostingRegion` | the United States | Verified | Railway's production service runs in `us-west2` (checked 2026-10-25). |
| `logRetention` | up to 30 days | *Estimate* | Railway keeps logs for 7 to 30 days depending on the plan. Confirm the plan. |
| `deletionDays` | 30 | *Estimate* | Within GDPR's one-month window for answering requests. |
| `shutdownNoticeDays` | 30 | *Estimate* | |
| `termsNoticeDays` | 14 | *Estimate* | |
| `liabilityCap` | US$100 | *Estimate* | A common floor while the service is free. |
| `minimumAge` | 16 | *Estimate* | 16 covers the GDPR consent age everywhere in the EU. 13 would be enough for the US alone. |
| `effectiveDate` | November 1, 2026 | *Estimate* | Set it to the day the pages go live. |
| `lastUpdated` | October 25, 2026 | | Update it with every published change. |

---

## 2. Blockers: fix these in the product, or change the text, before publishing

1. **Cross-user use of Google data (Limited Use risk).**
   - At sign-in, Yello reads the signing-in user's Google "other contacts".
   - If a photo there belongs to an email that matches a **different** Yello user, Yello saves it as
     that other user's profile picture.
   - Code: `backend/src/routes/auth.ts:462-466`, `backend/src/services/profileImageService.ts:266-305`.
   - This moves one user's Google data into another user's account. That likely breaks Google's
     Limited Use rules, and the policy's Limited Use statement assumes it doesn't happen.
   - **Recommendation:** remove the feature. The text was **not** written to disclose it.
2. **No account deletion in the product.** There's no endpoint that deletes a user or the
   `/data/users/<id>` folder.
   - The policy promises deletion on request by email within `deletionDays`, which is currently a
     manual job.
   - Either build self-serve deletion, or keep the email process and write a runbook for it. The
     runbook must cover the auth row, the user folder (database, photos, backups, archive, imports)
     and profile images.
3. **Profile images location: probably resolved.**
   - The repo's Dockerfile doesn't set `PHOTOS_PATH`, but Railway production does (seen 2026-10-25).
   - Confirm that it points under `/data`, so the deletion runbook knows where profile images live.
4. **Personal data in logs.**
   - Fastify logs every request with the client IP.
   - Several services also log contacts' email addresses and names: `contactPhotoService.ts:134,158`,
     `googlePeopleService.ts:306`, `apifyEnrichmentService.ts:896,997,1141,1157`.
   - The policy discloses this. Removing those log lines would let the sentence be softened.

---

## 3. Decisions counsel should confirm

- **Controller or processor for contacts.** The policy says Yello is controller for account data and
  processes book contents on the user's behalf. Should we offer a DPA (data processing agreement)
  for business users? The Terms put compliance on users who use Yello for business.
- **LinkedIn enrichment through Apify.**
  - It sends contacts' LinkedIn URLs to a third-party scraper (`supreme_coder~linkedin-profile-scraper`)
    that runs on the user's own Apify key, and stores what it returns.
  - The Terms put responsibility on the user. The real risk is LinkedIn's terms and scraping law
    (e.g. hiQ v. LinkedIn, and GDPR for EU data subjects).
  - Counsel should decide whether to keep the feature, gate it, or remove it.
- **Two-way sync liability.** The sync section discloses that Yello deletes remote contacts and can
  overwrite them. Is that disclosure plus the disclaimers enough, or should enabling sync also need
  click-through consent?
- **Consumer carve-outs.** The draft keeps mandatory EU and UK consumer rights and local courts.
  Check this against the chosen governing law.
- **CCPA.** Yello is probably below the CCPA thresholds. The rights section is written generally, so
  it holds either way.

## 4. Google OAuth verification

These go beyond the legal text, but publishing depends on them:

- **`gmail.readonly` is a restricted scope.** Public use needs Google's verification and an annual
  CASA security assessment.
- **`contacts` and `contacts.readonly` are sensitive scopes.** They need verification.
- **Consent screen links:** Google requires the privacy policy link on the consent screen and the
  homepage. After this change the landing footer links to `/privacy` and `/terms`.
- **Limited Use text:** the required statement is in the Privacy Policy, section *Google user data*.

---

## 5. Claims and where they come from

| Claim in the text | Source |
|---|---|
| Sign-in stores Google ID, name, email, picture | `backend/src/services/authDatabase.ts:30-62` |
| Scopes: profile, email, contacts.other.readonly at sign-in; contacts.readonly or contacts (write) on import or sync; gmail.readonly on Gmail connect | `backend/src/routes/auth.ts:248, 487-520, 534-539` |
| Tokens and the iCloud and Apify credentials are encrypted at rest (AES-256-GCM) | `backend/src/services/tokenEncryption.ts`; `routes/icloud.ts:43-45`; `routes/enrich.ts:92` |
| iCloud uses an app-specific password over CardDAV | `backend/src/services/icloudService.ts:20-29` |
| Disconnecting iCloud deletes the credentials | `backend/src/routes/icloud.ts:51-53` |
| Gmail: headers (From, To, Cc, Subject, Date) and the snippet only; stores subject, date, direction and snippet | `backend/src/services/emailSyncService.ts:26,125`; `userDatabase.ts:340-351` |
| The Gmail discovery scan is counted in memory and not stored | `backend/src/services/emailDiscoveryService.ts:101-146` |
| Apify gets LinkedIn URLs; the profile data it returns is stored | `backend/src/services/apifyEnrichmentService.ts`; `userDatabase.ts:302-324` |
| HERE gets the address string only | `backend/src/services/geocoding.ts:66-79` |
| Gravatar gets a hash of the user's email and of contacts' emails | `profileImageService.ts:118-126`; `contactPhotoService.ts:150-161` |
| Browser-side requests go to OSM tiles, Google Fonts, Font Awesome and api.qrserver.com | `frontend/index.html:7-10`; `MapView.tsx:74`; `PublicContactCard.tsx:312` |
| No analytics, ad trackers, payments, AI or email sending | Searched the code and `package.json` files: none present |
| The desktop app has no telemetry or crash reports | `electron/package.json`, `electron/electron-builder.yml` |
| Session cookie lasts 30 days (2 hours for the demo); flow cookies last 10 minutes; httpOnly | `backend/src/routes/auth.ts:57,175-183,495-567`; `demoService.ts:16` |
| localStorage: view mode, a dismissed banner, a running import | `frontend/src/api/hooks.ts:83`; `LaunchBanner.tsx`; `GroupsView.tsx:20` |
| Public card: off by default; name and photo when on; other fields opt-in; notes never shown | `backend/src/routes/profile.ts:144-162, 201, 921-956` |
| Photos are served only to their signed-in owner | `backend/src/server.ts:131-136,168-202` |
| Backups, earlier versions and the original-cards archive are kept with the account | `remoteBackupService.ts:21-36`; `userDatabase.ts:536-547`; `rawVcardRetirement.ts` |
| Remote deletes need a confirmed backup from the last 24 hours | `remoteBackupService.ts:82, 388-412` |
| Failed import files are kept; successful ones are deleted | `routes/import.ts:92`; `docs/reference.md` |
| Each user has a separate database | `backend/src/services/userDatabase.ts` (one SQLite file per user) |
| HTTPS, Helmet/CSP, rate limits | `backend/src/server.ts:83-106` |
| Demo deleted after 2 hours | `demoService.ts:473-500`. **Caveat:** cleanup only runs when the next demo starts, so "deleted after that" is accurate but not prompt. A scheduled sweep would tighten it. |

## 6. Wording deliberately avoided

- **"Never shared"**, which the login page used to say. Data does go to processors (Railway, HERE,
  Gravatar), so the login page now says "We never sell them or use them for ads".
- **"Encrypted at rest" for the whole book.** Only credentials are encrypted. The SQLite files and
  photos rely on Railway's volume security.
- **"We never read your data."** The operator can technically read the volume, so the policy says
  access is limited to the people who run Yello.

## 7. Keeping this current

When a data practice changes (a new provider, OAuth scope, cookie or retention rule), update the
page and the table in section 5 in the same change, and bump `LEGAL.lastUpdated`.
