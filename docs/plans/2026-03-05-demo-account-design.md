# Demo Account Feature — Design

**Status:** Approved
**Date:** 2026-03-05

## Goal

Allow anyone visiting Yello to try the app instantly via a "Try Demo" button. Each visitor gets an isolated, temporary demo environment with 20 pre-populated contacts. After 3 minutes of use, a non-blocking prompt encourages sign-in with Google.

## Approach: Runtime Seed Script (Approach B)

On each "Try Demo" click, create a temporary demo user and seed their database with 20 contacts via SQL inserts. No external files or templates — all data lives in code.

## Auth & Session Flow

- **New endpoint:** `POST /api/auth/demo`
- Creates a demo user in `auth.db` with `is_demo = 1` flag (new column on `users` table)
- Generated `google_id`: `demo-{uuid}`, email: `demo-{uuid}@demo.yello.app`
- Session expiry: **2 hours** (vs 30 days for real users)
- Runs seed function to populate `data/users/{demoUserId}/contacts.db`
- Returns session cookie, redirects to `/dashboard`
- **Rate limited:** 5 requests/minute per IP
- **Frontend:** "Try Demo" button on `LoginPage.tsx`

## Demo Data — 20 Contacts

Diverse professional mix, all fabricated. Each has: name, company, title, 1-2 emails, 1 phone, address. ~10 have LinkedIn enrichment (headline, about, skills, positions).

| # | Name | Title | Company | Industry |
|---|------|-------|---------|----------|
| 1 | Sarah Chen | Real Estate Broker | Greenfield Realty | Real Estate |
| 2 | Marcus Johnson | Cardiologist | St. James Medical | Healthcare |
| 3 | Elena Rodriguez | Immigration Attorney | Rodriguez & Partners | Legal |
| 4 | David Kim | Head Chef / Owner | Kimchi & Co | Restaurant |
| 5 | Priya Sharma | VP of Engineering | NovaTech Solutions | Tech |
| 6 | James O'Brien | General Contractor | O'Brien Construction | Construction |
| 7 | Aisha Patel | Financial Advisor | Meridian Wealth | Finance |
| 8 | Tom Andersson | Creative Director | Pixel & Ink Studio | Design |
| 9 | Lisa Nakamura | School Principal | Westfield Academy | Education |
| 10 | Carlos Mendez | Vineyard Owner | Mendez Estate Wines | Wine/Agriculture |
| 11 | Rachel Green | Marketing Director | BrightPath Media | Marketing |
| 12 | Omar Hassan | Civil Engineer | Atlas Infrastructure | Engineering |
| 13 | Sophie Laurent | Gallery Owner | Laurent Contemporary | Art |
| 14 | Michael Torres | Fitness Studio Owner | CorePower Athletics | Fitness |
| 15 | Hannah Berg | Veterinarian | Riverside Animal Care | Veterinary |
| 16 | Raj Kapoor | Product Manager | CloudScale Inc | Tech |
| 17 | Emma Williams | Journalist | The Morning Chronicle | Media |
| 18 | Daniel Okafor | Architect | Okafor Design Studio | Architecture |
| 19 | Julia Rossi | Pastry Chef | La Dolce Vita Bakery | Food |
| 20 | Ben Calloway | Music Producer | Echo Sound Studios | Entertainment |

No photos in V1 (avoids bundling/generating images).

## Demo Restrictions

**CAN do:** Browse, search, filter, view details, view LinkedIn data, edit contacts, add notes, use dedup/cleanup, view map, add contacts manually.

**CANNOT do:** Import VCF files, trigger LinkedIn enrichment (Apify credits), Gmail sync, access admin panel, change external-service settings.

**Implementation:** `isDemoUser(request)` check in restricted routes. `request.user` gets `is_demo` flag from session/user lookup.

## Hybrid Email Prompt

Frontend timer in `AuthContext` when `user.is_demo === true`. After 3 minutes, shows dismissible modal:

> "Enjoying Yello? Sign in with Google to keep your contacts and unlock all features."
> [Sign in with Google] [Maybe later]

Dismissed = won't show again for that session.

## Cleanup Strategy

- **Lazy cleanup:** On each `POST /api/auth/demo`, delete all demo users with expired sessions before creating new one
- Delete `data/users/{id}/` directories (contacts.db + photos)
- Delete rows from `auth.db` (users, sessions)
- No cron job needed

## Edge Cases

- **Concurrent demos:** Fully isolated — each gets own user ID + database
- **Demo user signs in with Google:** Normal OAuth flow, demo session abandoned, cleaned up later
- **Disk space:** ~100KB per demo DB. 1000 concurrent = ~100MB — negligible

## Files to Create/Modify

**Backend:**
- `backend/src/routes/auth.ts` — Add `POST /api/auth/demo` endpoint
- `backend/src/services/demoService.ts` — New: seed function, cleanup function, demo contact data
- `backend/src/middleware/auth.ts` — Add `is_demo` to user object
- `backend/src/services/authDatabase.ts` — Add `is_demo` column to users table
- Restricted routes — Add `isDemoUser` checks (import, enrich, emailSync, gmailEnrich, admin)

**Frontend:**
- `frontend/src/components/LoginPage.tsx` — Add "Try Demo" button
- `frontend/src/contexts/AuthContext.tsx` — Add `is_demo` flag, 3-minute prompt timer
- `frontend/src/components/DemoPromptModal.tsx` — New: email capture modal
