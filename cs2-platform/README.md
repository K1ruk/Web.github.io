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

## FACEIT Club reference and match diagnostics

NEXUS has a reference to the supplied Club page:

- Club: `https://www.faceit.com/en/club/a89ac9ff-8702-40df-b62d-8140719d481e/parties`
- Identifier: `a89ac9ff-8702-40df-b62d-8140719d481e`
- **Only tracked Club queue:** `https://www.faceit.com/en/club/a89ac9ff-8702-40df-b62d-8140719d481e/queue/26ca1fb5-eb37-4b3c-9005-402eca7a9008`
- Queue ID: `26ca1fb5-eb37-4b3c-9005-402eca7a9008` (provided by the queue owner)
- Admin diagnostic page: `/admin/faceit-club`

**Read-only queue API diagnosis:** The owner can click
**CHECK OWNER QUEUE API ACCESS** at `/admin/faceit-club`. NEXUS calls
`GET /games/cs2/queues/26ca1fb5-eb37-4b3c-9005-402eca7a9008`
with the private server-side `FACEIT_API_KEY`. FACEIT documents this route
for developers/organizers. The result is interpreted precisely:

- **200 + exact queue ID and `game=cs2`:** API key can read this queue's
  details (not proof of FACEIT account ownership).
- **403:** the key is denied access to this protected endpoint, which is
  different from the human's status as Club/queue owner.
- **404:** **inconclusive**. This is not proof of insufficient permissions,
  a nonexistent queue, or a mistaken Club link. As a bounded read-only
  fallback, NEXUS tries the documented filtered list endpoint
  `GET /games/cs2/queues?entity_type=<candidate>&entity_id=<the-Club-ID>`
  with plausible `clan`, `club`, and `hub` entity types. It only accepts
  an item with the **exact** supplied queue ID, `game=cs2`, and the exact
  supplied Club entity ID. FACEIT does not document which entity type
  applies to newer Club queues, so these attempts are exploratory, not
  definitive. If still not found, NEXUS inspects the **one** matchroom
  provided by the organizer to show its competition ID, type, and organizer
  as independent context; this does not establish queue membership.
- **401/429:** the API key was rejected or rate-limited. These remain
  explicit errors, not a false empty match history.

The diagnostics don't fetch all Club queues, authenticate the FACEIT owner,
or write registrations/results to Supabase. They use the documented Data API
only; they don't scrape private Club endpoints.

The public Data API currently does **not document a queue-specific match
history listing**. The official FACEIT Club admin interface **does** show
Queue Matches; that browser view is not authorization to scrape private
endpoints. A possible future route is organizer-scoped FACEIT webhooks,
which document `match_status_finished` and `match_object_created` events,
but we must verify each event belongs to this precise queue and authenticate
incoming webhooks before importing anything. Webhooks alone also do not
backfill historical matches. Do not enable synchronization before ownership,
scope and data provenance are confirmed.

**Current integration: read-only, match-by-match.** A NEXUS administrator may
paste a FACEIT CS2 matchroom URL, such as
`https://www.faceit.com/en/cs2/room/1-<match-uuid>`. The server validates the
match ID, requests official FACEIT Data API `GET /matches/{match_id}` and
`GET /matches/{match_id}/stats` with the existing private `FACEIT_API_KEY`,
and shows the actual match result and available player metrics (ADR, KAST,
opening duel win %, K/D, kills, deaths). Missing values display `—`; nothing
is fabricated or deduced from unrelated fields. The endpoint is restricted
to verified NEXUS administrators and always returns `no-store` responses.

**Important limits:** This Club ID is *not* assumed to be an old FACEIT Hub ID
or competition ID. Public FACEIT Data API documentation currently exposes
Hub, tournament, and match endpoints, but does not document a method for
enumerating all matches in a Club by Club ID. A public matchroom alone does
not prove association with the supplied Club. The inspector explicitly
labels Club membership **unverified** and never writes an imported result,
tournament standing or player rating to NEXUS. Actual Club-to-match
discovery, ownership verification and automated synchronization require
additional verified provider support or organizer-provided competition
details. Never scrape authenticated Club pages as an undocumented API.

To test with real data: configure the server-side FACEIT key, open the FACEIT
Club's `Club Queues → MATCHES` section, copy a completed CS2 matchroom link
and inspect it via the new NEXUS admin page. Keep match identifiers separate
from the NEXUS paid-tournament roster until their provenance is confirmed.

## Admin FACEIT assessment and fair-play review (core four v4 — provisional)

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

**Core rating signals (provisional v4)**

- **FACEIT Elo** stays the main input to the NEXUS 0–100 skill recommendation.
  ADR, KAST (Kill/Assist/Survive/Trade), opening-duel win %, and K/D form
  the only four additional performance signals.
- The four bounded bonus contributions are **ADR +2.5**, **KAST +2.0**,
  **opening-duel win % +1.5**, and **K/D +1.5**. Maximum combined bonus
  is **+7.5** out of 100. These are initial engineering heuristics,
  **not calibrated player ability measurements**.
- The FACEIT Data API documents the player's recent-match and lifetime
  statistics endpoints but does **not guarantee** all four fields are included
  for every CS2 player. Missing stats remain unavailable (—); NEXUS never
  infers KAST from kills or substitutes entry-attempt share for opening wins.
  Opening win % can be computed from explicit opening-kill and opening-death
  counts when BOTH are supplied by the provider.
- Recent metric bonuses require at least 10 matches with that particular
  field. Lifetime bonuses need 60+ FACEIT matches. Choose the strongest
  of recent or lifetime evidence instead of adding the same stats twice.
  The admin screen shows sample counts and which time horizon was chosen.
- Poor recent stats cannot subtract from the Elo baseline; strong recent
  performance can only raise the suggestion slightly. Headshots, match-win
  rate, other raw metrics and perceived leadership are **not** used as
  proxy measurements. Do not conclude a player intentionally lost matches.
- Verified Elo history from the **same SteamID** over NEXUS's last 180 days
  limits sudden downward shifts (historical peak minus 150 Elo).
  That observation is **not** FACEIT's all-time peak and does not exist for
  first-time players.
- Large Elo drops or unusually high ADR, KAST, opening win %, or K/D
  compared with a low Elo create **review flags**, not accusations. Review,
  player explanations, match evidence and a documented admin decision are
  required before approving competitive tiers.
- FACEIT API rate limits and incomplete data may prevent complete analysis.
  A server-side `FACEIT_API_KEY` is the only shared provider key for NEXUS;
  players do not supply developer keys. Validate the rating thresholds on
  real tournament outcomes before relying on them for fair team formation.

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
- The four-signal model is **provisional**; it does not adjust performance by opponent strength, ingest Leetify or demo-level data, or establish reliable IGL/role impact. Never present it as an objective AI decision.
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
