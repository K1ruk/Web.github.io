# NEXUS CS2 Arena — interactive UI prototype

A static, responsive bilingual (English / Монгол) frontend concept for a paid-solo-entry CS2 tournament platform.

## Preview locally
Open `cs2-arena/index.html` in a browser. No build tool required.

## Features included
- Futuristic black / cyan / violet visual system with neon-outline buttons and glassmorphism.
- Responsive desktop/mobile navigation, EN/МН toggle.
- Tournament overview with sample stats and fixtures.
- Search/filter player directory with tier and role badges.
- Example team directory and match schedule.
- Illustrative admin Skill Intelligence analyzer and tier approval interaction.
- Client-side signup form mockup with main and secondary roles.

## Not implemented yet
This is a **visual prototype**, not a real tournament platform. No Steam authentication, FACEIT/Leetify API connections, real skill model, payment processing, persistence, team-generation algorithm, real admin authorization, scheduling backend, or notifications. All names/ratings/dates/prices are placeholders. The skill analyzer uses fictional inputs and outputs regardless of entered Steam URL.

## Next engineering steps
1. Move UI into Next.js / TypeScript components and establish tested translation resources.
2. Add PostgreSQL data model (users, profiles, tournament registration, payments, skill scores, teams, matches).
3. Integrate verified Steam OpenID, FACEIT data retrieval, optional extra statistics, and data-quality flagging.
4. Implement reproducible, tested team balancing with admin review, draft/publish workflow and auditing.
5. Connect a merchant-approved payment provider with secure webhooks and refund handling.
6. Build actual roles/permissions, match management, messaging and notification system.
7. Replace demo content, validate accessibility, and deploy to a staging environment.

Keep API credentials on the server. Do not use demo skill scores for real competitive decisions.
