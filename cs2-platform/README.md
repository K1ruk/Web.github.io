# NEXUS / CS2

A desktop-first, bilingual **Next.js 16 + Supabase + Stripe + Steam + FACEIT** tournament foundation.

The visual style follows the black editorial references: oversized typography, restrained orange ambient light, subtle glass surfaces and thin outline controls. The decorative northeast/upward arrow has been removed.

## Current implementation
- English / Mongolian Cyrillic interface toggle saved locally.
- Email magic-link sign-in with Supabase SSR sessions.
- Authenticated player profiles with two different CS2 positions.
- Steam OpenID account linking verified by a Steam server-side signature check.
- Admin Steam URL analyzer (direct SteamID64 or vanity URL with an optional Steam Web API key), plus FACEIT lookup using **exact Elo** and available recent K/D; explicitly provisional 0–100 skill model and admin-controlled Tier 1–5 approval.
- Admin tournament creation, opening and locking; protected admin-only tier assessment and team-generation endpoints.
- Server-side checkout using real tournament fee/currency, Stripe-hosted payment and verified, idempotent webhooks.
- Database migrations with Row Level Security (RLS), minimum client grants, payment/audit records and atomic roster publication.
- Public players/teams visible only after publication; authenticated dashboard.
- Admin match scheduling and verified BO1/BO3 result entry, plus public read-only schedule page.
- Algorithmic role-aware skill balancing with tests.

**This is an implementation foundation, not a security-certified production service.** No test payment or real Steam/FACEIT account has been executed. Do not enable live payments until the deployment checklist and end-to-end security tests are completed.

## Install
Requirements: Node.js 22+, npm, a new Supabase project and a Stripe account.

```bash
cd cs2-platform
npm install
cp .env.example .env.local
npm run dev
```
Open http://localhost:3000.

## Set up Supabase
1. Create a project at https://supabase.com .
2. Copy the Project URL and publishable key into `NEXT_PUBLIC_SUPABASE_*` environment variables.
3. Copy the Supabase server **secret key** to `SUPABASE_SECRET_KEY` (server only; never expose it or use NEXT_PUBLIC).
4. In Supabase SQL Editor run the migrations in order: `001_init.sql`, `002_hardening.sql`, then `003_rules_and_limits.sql`, then `004_match_format.sql`.
5. Enable email magic-link / OTP authentication. Set the Site URL to the exact `NEXT_PUBLIC_SITE_URL` and allow redirect `https://YOUR-DOMAIN/auth/callback` (and the equivalent local URL for development).
6. Sign in yourself once, then run **in the SQL editor** (replace the value with your actual Supabase Auth user UUID):
```sql
insert into public.admin_users(user_id)
values ('YOUR_AUTH_USER_UUID');
```
Never accept a client-submitted `admin=true` flag. Admin access is assigned manually in the database.

## Set up FACEIT
Create a server-side FACEIT Data API key at https://developers.faceit.com/ (see their Data API documentation). Store in `FACEIT_API_KEY` on the server. Rankings will be unavailable without this key, but admins can manually approve a tier and score.

## Set up Stripe **test mode first**
1. Create a Stripe account and confirm your business, payment, and tournament prize-pool eligibility with Stripe.
2. Set `STRIPE_SECRET_KEY=sk_test_...`.
3. Create a Stripe webhook endpoint at `https://YOUR-DOMAIN/api/stripe/webhook` subscribed to:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.expired`
4. Put the webhook signing secret in `STRIPE_WEBHOOK_SECRET`.
5. Use Stripe's local webhook forwarding during testing.
6. Set up automatic or documented manual refund handling for `needs_refund` payment records before live operation.
8. Publish tournament rules, privacy policy, eligibility, cancellation/refund and prize-distribution terms **before checkout is enabled**.

**Payment confirmation occurs only after verified Stripe webhooks.** Returning to the success page never marks a player paid.

## Deployment
Deploy the `cs2-platform` subdirectory as a **Vercel project** (Root Directory = `cs2-platform`). Do not deploy this server app using GitHub Pages: GitHub Pages cannot execute server routes or safely store private API keys.

Set all environment variables in Vercel's server-side settings. Set `NEXT_PUBLIC_SITE_URL` to your real HTTPS domain. Register that domain in Supabase Auth Redirect URLs and Stripe webhook destinations. Rotate keys immediately if exposed.

## Security checklist before going live
- [ ] Complete testing with real Steam OpenID sign-in, sign-out and account relinking.
- [ ] Verify Supabase RLS/grants with anon, regular user, and admin accounts. Add database policy regression tests.
- [ ] Test duplicate checkout requests, webhook replay, delayed/out-of-order webhook delivery, declined cards, refunds, full capacity, and payment-session expiration.
- [ ] Add abuse controls for registration/authentication and strict monitoring of server errors.
- [ ] Finish public-facing privacy notice, cookies, tournament rules, refund policy, age requirements, anti-cheat and moderation process.
- [ ] Configure email domain authentication, delivery and rate limiting.
- [ ] Verify payment provider eligibility for your jurisdiction and prize format.
- [ ] Add logging, monitoring, automated backups, secret rotation, and an incident response plan.
- [ ] Run `npm run build`, `npm run lint`, `npm test`, and end-to-end tests on a staging deployment. **The build could not be run in this session because npm registry access is unavailable.**
- [ ] Perform a security review before replacing `sk_test_` with a live key.
- [ ] Remove the preview-only robots noindex setting once approved for publication.
- [ ] Conduct manual end-to-end testing of the match scheduling and results admin flow with real team rosters.

## Data notes
- Only paid registrations may be graded and assigned teams.
- Team publication requires a locked tournament, all scores approved, exactly 5 players per team and no active checkout holds.
- Tournament capacity should be a **multiple of five** (50 or 60; not 64 for pure five-person teams).
- The model is **provisional**; it does not currently adjust K/D for opponent strength, ingest Leetify or demo-level data, or establish reliable role impact. Never present its result as an objective AI decision.
- An administrator can override suggestions and must document the reason.
- Team-generation algorithm randomizes candidates within similar skill bands and optimizes skill/role balance; the exact previewed roster is submitted for database publication. It can be extended to randomize between near-equivalent solutions after comprehensive testing.
- `needs_refund` flags require immediate operator intervention. They are not automatically refunded by this version.
- Do not paste credentials into ChatGPT or commit them to GitHub.

## Folder layout
```
app/                 Next.js pages and API endpoints
components/          Reusable UI and language toggle
lib/                 Steam, FACEIT, skill and team logic
supabase/migrations/ Database schema + security
tests/               Skill/team algorithm unit tests
```
