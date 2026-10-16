# MPL Backend (My Profile Live)

Node.js + Express + MongoDB API for the MPL hiring platform frontend
(job seekers ↔ companies). Implements every field, flow and condition
in the React frontend: signup, mobile+email OTP verification, login,
profile management, candidate browsing/filtering, save/shortlist/contact
with a lead-based paywall, dashboards, activity feeds, and subscription
plans.

## Stack

- Node.js 20+, Express 4
- MongoDB + Mongoose 8
- **Twilio Verify** — mobile OTP (send + check), no OTP storage on our side
- **Brevo** (`@getbrevo/brevo`) — email OTP + transactional emails (welcome, password reset)
- JWT auth (`jsonwebtoken`), `bcryptjs` password hashing
- `zod` request validation, `multer` file uploads (photo/logo), `helmet` / `cors` / `express-rate-limit` / `express-mongo-sanitize` for hardening

## Setup

```bash
cp .env.example .env     # fill in MongoDB URI, JWT secret, Twilio + Brevo keys
npm install
npm run seed              # optional: creates demo accounts (see below)
npm run dev                # nodemon, http://localhost:5000
```

### Twilio Verify setup
1. Create a **Verify Service** in the Twilio console → copy its SID into `TWILIO_VERIFY_SERVICE_SID`.
2. `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` come from the Twilio console home page.
3. Twilio Verify generates, sends and expires the OTP itself — this backend only calls `verifications.create` (send) and `verificationChecks.create` (check).

### Brevo setup
1. Create an API key in Brevo → Settings → SMTP & API → `BREVO_API_KEY`.
2. Verify a sender identity/domain → set `BREVO_SENDER_EMAIL`.
3. Used for: email OTP during signup, password-reset codes, welcome email.

## Demo accounts (after `npm run seed`)
- Job seeker: `user@example.com` / `password123`
- Company: `company@example.com` / `password123`
(Log in via `POST /api/auth/login/email`.)

## API overview

### Auth — `/api/auth`
| Method | Path | Notes |
|---|---|---|
| POST | `/signup/company` | multipart/form-data, field `companyLogo` optional. All Basic Info / Contact & Location / Company Profile fields. Sends mobile + email OTP. |
| POST | `/signup/jobseeker` | multipart/form-data, field `photo` optional. All Personal / Professional / Employment / Education / Skills fields. Sends mobile + email OTP. |
| POST | `/signup/verify-otp` | `{ pendingSignupId, channel: "mobile"|"email", otp }`. Account is created once **both** channels are verified. |
| POST | `/signup/resend-otp` | `{ pendingSignupId, channel }` |
| POST | `/login/mobile/request` | `{ userType, mobileNumber }` — sends login OTP to an existing account |
| POST | `/login/mobile/verify` | `{ userType, mobileNumber, otp }` → returns JWT |
| POST | `/login/email` | `{ email, password }` — tries job-seeker then company accounts, mirrors the frontend demo's dual-account lookup |
| POST | `/logout` | stateless |
| POST | `/forgot-password` | `{ userType, email }` |
| POST | `/reset-password` | `{ userType, email, otp, newPassword }` |
| GET | `/me` | requires Bearer token |

### Profile — `/api/profile` (auth required)
| Method | Path | Notes |
|---|---|---|
| GET | `/me` | |
| PUT | `/me` | partial update, same tabbed-section UX as `ProfileEdit.jsx`; recomputes `profileCompletion` |
| POST | `/photo` | job seeker only, multipart `photo` |
| POST | `/logo` | company only, multipart `companyLogo` |
| POST | `/change-password` | `{ currentPassword, newPassword }` |

### Candidates — `/api/candidates` (company role only)
| Method | Path | Notes |
|---|---|---|
| GET | `/?industry=&state=&district=&experience=&education=&noticePeriod=&wfh=&immediateJoiner=&search=&page=&limit=` | matches `FilterSidebar.jsx` filters exactly |
| GET | `/:id` | logs a "view" interaction; contact info masked until contacted |
| GET | `/saved` | |
| GET | `/shortlisted` | |
| POST | `/:id/save` | toggle |
| POST | `/:id/shortlist` | toggle |
| POST | `/:id/contact` | spends 1 lead, reveals full contact details; 402 if no leads remain |

### Dashboard — `/api/dashboard`
- `GET /jobseeker` — completion %, profile views / shortlists / interview invites, recent activity
- `GET /company` — status, leads remaining, saved/shortlisted/contacted counts, recent activity

### Activity — `GET /api/activity` (job seeker) / `GET /api/company/activity` (company)
Filterable (`?filter=view|save|shortlist|contact`), paginated.

### Plans — `/api/plans` (mirrors `src/data/plans.js` on the frontend exactly)
- `GET /` — plan list for the caller's role + extra-lead pricing
- `GET /my-subscription`
- `POST /subscribe` `{ planId }` — plan checkout uses Cashfree redirect (`CASHFREE_APP_ID` / `CASHFREE_SECRET_KEY`)
- `POST /buy-extra-leads` `{ count }`

## Data model notes
- `JobSeeker` and `Company` are separate collections (not a single discriminated `User`), matching the frontend's two distinct profile shapes.
- `PendingSignup` holds an unverified signup (payload + hashed password) with a 30-minute TTL index; the real account is created only once both OTP channels succeed.
- `Interaction` is a single polymorphic log (`view` / `save` / `shortlist` / `contact` between a Company and a JobSeeker) that powers saved/shortlist toggles, the lead-gated contact reveal, both dashboards, and both activity feeds.
- `Subscription` records each plan activation; the owning `Company`/`JobSeeker` document also keeps a denormalized `currentPlan` / `planExpiry` / `leadsRemaining` for fast reads.

## Security
- Passwords hashed with bcrypt (never stored/returned in plaintext).
- JWT bearer auth (`Authorization: Bearer <token>`), role-gated routes (`requireRole("company")`).
- OTP endpoints rate-limited (10 requests / 10 min / IP) to prevent Twilio/Brevo abuse.
- `helmet`, `cors` (restricted to `CLIENT_URL`), `express-mongo-sanitize` against NoSQL injection.
- Uploaded files validated by MIME type and size (`MAX_LOGO_SIZE_MB`, `MAX_PHOTO_SIZE_MB`).

## Wiring the frontend to this backend
Replace the fake functions inside the frontend's `src/context/AppContext.jsx`
(`requestOtp`, `verifyOtp`, `updateProfile`, `toggleSavedCandidate`, etc.)
with real calls to the endpoints above — the response shapes
(`{ token, userType, profile }` on auth, `{ profile }` on updates) were
designed to drop in with minimal changes to the existing components.
