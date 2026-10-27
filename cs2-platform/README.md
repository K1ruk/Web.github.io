# NEXUS / CS2

A desktop-first, bilingual **Next.js 16 + Supabase + Stripe + Steam + FACEIT** tournament foundation.

The visual style follows the black editorial references: oversized typography, restrained orange ambient light, subtle glass surfaces and thin outline controls. The decorative northeast/upward arrow has been removed.

## Current implementation
- English / Mongolian Cyrillic interface toggle saved locally.
- Primary Discord OAuth sign-in with Supabase SSR sessions; optional email magic-link fallback.
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
4. In Supabase SQL Editor run the migrations in order: `001_init.sql`, `002_hardening.sql`, then `003_rules_and_limits.sql`, then `004_match_format.sql`, then `005_restrict_internal_triggers.sql`.
5. Configure Discord OAuth (see below) as primary sign-in. Email OTP remains an optional fallback, subject to the Supabase project's email provider limits. Set Supabase Auth **Site URL** to your deployed website, and allow both localhost and preview callback URLs.
6. Sign in yourself once, then run **in the SQL editor** (replace the value with your actual Supabase Auth user UUID):
```sql
insert into public.admin_users(user_id)
values ('YOUR_AUTH_USER_UUID');
```
Never accept a client-submitted `admin=true` flag. Admin access is assigned manually in the database.

## Set up Discord sign-in (no email service or domain required)

1. Open https://discord.com/developers/applications and create an app named `NEXUS`. Discord application creation is performed by the owner.
2. Under **OAuth2**, add this redirect URL, then save:
   `https://soyvzdmzfbfqwydtkrlc.supabase.co/auth/v1/callback`
   This is the **Supabase callback**, not the app's `/auth/callback` route. For other Supabase projects, obtain their callback from Authentication > Providers > Discord.
3. Copy Discord's Client ID and Client Secret. In the Supabase dashboard, open **Authentication > Sign In / Providers > Discord**, turn it on, and paste both values there. **Never put the Discord Client Secret in `.env.local`, GitHub, Vercel public variables, or chat.**
4. In Supabase **Authentication > URL Configuration > Redirect URLs**, add both:
   - `http://localhost:3000/auth/callback`
   - `https://nexus-cs2-arena-git-feat-cs2-secure-platform-k1ruk.vercel.app/auth/callback`
5. In `cs2-platform/.env.local`, set `NEXT_PUBLIC_SITE_URL=http://localhost:3000` and ensure the Supabase URL and public publishable key exist. Run `npm run dev`, then press **Continue with Discord** on `/login`.
6. Discord signs in the person; it does **not** replace the separate Steam OpenID verification requirement for entering tournaments. The dashboard still requires `SUPABASE_SECRET_KEY` server-side.

OAuth does not require Resend SMTP, a custom email-sending domain, a Discord server, or a Discord bot. Do not request unnecessary Discord permissions such as bot access or guild membership. Keep the existing magic-link fallback until an alternate account-recovery policy is designed.

## Troubleshooting Steam account linking

The NEXUS account and Steam OpenID login are separate. Steam linking requires a working **server-side Supabase secret key** because the server—not the browser—must verify and save the Steam identity.

- Find the **Secret key** (starts with `sb_secret_`) for the same project as `NEXT_PUBLIC_SUPABASE_URL` in Supabase Dashboard > Project Settings > API Keys.
- On the local machine, store it only in `cs2-platform/.env.local` as `SUPABASE_SECRET_KEY=sb_secret_...`. Do not copy the `sb_publishable_` key into this field. Never paste a secret key into GitHub, chat or a client-side `NEXT_PUBLIC_` variable.
- Stop and restart `npm run dev` after changing local env settings. For Vercel preview, configure the secret in the project's **Preview** environment variables (preferably restricted to the feature branch) and redeploy; the deployed environment cannot read local `.env.local`.
- To verify the local private key without displaying it, execute this command inside `cs2-platform` using Node 22+:

```bash
node --env-file=.env.local -e "fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+'/rest/v1/',{headers:{apikey:process.env.SUPABASE_SECRET_KEY||''}}).then(r=>console.log('Supabase key HTTP status:',r.status)).catch(e=>console.error(e.message))"
```

A `200` response confirms the administrative Data API key is accepted; `401` indicates a rejected key. This sends only a server-side request and prints the HTTP status, not the key. When the key is accepted, retry `/register` > **CONNECT STEAM**. The site now checks administrative Supabase access before the Steam OpenID handoff and returns a specific setup error if the check fails.

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

## Admin FACEIT assessment and fair-play review (provisional multi-signal v3)

One server-side `FACEIT_API_KEY` belongs to **NEXUS**; players supply no API
keys and never see the secret. To configure it, add it to `cs2-platform/.env.local`
for local tests and to Vercel's **private server environment** when ready.
Do not prefix it with `NEXT_PUBLIC_`.

**Admin workflow**

1. A player signs in with Discord, links their SteamID64, and joins a real
   tournament. Stripe confirms a paid entry via its signed webhook.
2. Open `/admin`, select an event, and use **SCAN NEXT 3** to analyze up to
   three paid, unapproved players sequentially. The button can be used again
   until the queue is exhausted. This operator-triggered process does not run
   on every login or inside the payment webhook.
3. NEXUS stores a FACEIT observation tied to the verified SteamID64 and
   registration, and skips repeated scans within 24 hours for that identity.
4. Review stored evidence using **REVIEW SAVED**, which does not consume
   another FACEIT request. Approve final tiers manually. Flagged, downgraded,
   or completely manual decisions require a documented reason (15+ characters).
5. A paid player's approved 0–100 score is used by the existing five-player
   team-balancing algorithm only after tournament registration is locked.

**Fair-play safeguards**

- FACEIT Elo remains the primary signal. In addition to K/D, NEXUS
  attempts to retrieve ADR, kills per round, assists per match, utility
  damage, enemies flashed, entry attempts/success, 1v1 and 1v2 clutch
  rates, and lifetime statistics, when available from the FACEIT Data API.
- A missing stat is `—`, **not zero**. Each recent metric tracks how many
  matches provided the field; fewer than ten usable matches cannot earn a
  recent-match bonus for that metric. Lifetime bonuses require at least
  60 recorded matches.
- Positive performance evidence is grouped into **damage/impact (max +3)**,
  **teamplay/utility (+2.4)**, **entry performance (+1.2)** and
  **clutch situations (+0.9)**, capped at **+7.5 overall**. Recent and
  lifetime scores are compared, not added together, to avoid double counting.
- Poor recent stats cannot lower the Elo-based recommendation. Headshot
  percentage, sniper usage, MVPs and win rate are displayed as context,
  but currently do not change the tier because of role bias, metric overlap
  and the lack of outcome calibration.
- The model is **provisional, not validated**. Signal thresholds and
  bonuses are initial engineering heuristics that require calibration
  against independently reviewed matches and tournament outcomes; no
  statistical claim that they reflect true skill is being made.
- If the platform previously observed the *same verified Steam account*,
  its highest recorded Elo from the last 180 days provides a protective
  seeding baseline (previous peak minus 150 Elo, if higher than current Elo).
  This is NEXUS-observed history, **not** FACEIT's all-time peak.
- Large declines from the verified baseline, unusually high K/D, damage
  or utility relative to a low Elo, and limited lifetime match history
  trigger **review flags**.
  Flags are uncertain signals, **never proof of cheating or intentionally
  losing**, and do not automatically punish or reject players.
- New accounts with no historical observations cannot be reliably identified
  as smurfs solely from a SteamID or one set of statistics. Manual review,
  published competition rules, player appeals and match evidence remain
  necessary. There is currently no automated deliberate-throw detection.
- External FACEIT lookups require a configured key, provider availability
  and remaining rate-limit capacity. The backend reports unavailable data
  explicitly rather than fabricating a tier. Real-provider integration and
  full tournament registration/payment flow still require staging tests.

The separate `/admin/skill-lab` analyzes an admin's own verified Steam account
for diagnostics **without** creating a paid entry, approving a tier, or saving
a tournament rating snapshot.

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
- [ ] Run `npm run build`, `npm run lint`, `npm test`, and end-to-end tests on a staging deployment. **Automated builds and unit checks are performed by CI; complete real-provider staging and user-journey tests before launch.**
- [ ] Perform a security review before replacing `sk_test_` with a live key.
- [ ] Remove the preview-only robots noindex setting once approved for publication.
- [ ] Conduct manual end-to-end testing of the match scheduling and results admin flow with real team rosters.

## Data notes
- Only paid registrations may be graded and assigned teams.
- Team publication requires a locked tournament, all scores approved, exactly 5 players per team and no active checkout holds.
- Tournament capacity should be a **multiple of five** (50 or 60; not 64 for pure five-person teams).
- The model is **provisional**; it does not adjust metrics for opponent strength, ingest Leetify or demo-level data, or establish reliable IGL/role impact. Never present its result as an objective AI decision.
- Administrators can override provisional suggestions; flagged, downward and manual approvals require a meaningful written reason.
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

**Release gate:** keep this pull request as draft until CI passes, provider test-mode flows work, all four migrations have been applied, and an independent security review is complete.
