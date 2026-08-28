# api

The backend for `console/` and `pc-agent/` — a plain Node/Express service
over a Neon (or any) Postgres database. Replaces what Supabase used to
provide for free: auth, an auto-generated REST API with row-level security,
and Edge Functions for Stripe.

Verified end-to-end against a local Postgres 16 in development (signup →
login → agent register/heartbeat → flag → command → audit log → agent
completes command) — see the route files for what each endpoint does.

## Run locally

```bash
cp .env.example .env   # fill in DATABASE_URL (a Neon connection string) and JWT_SECRET
npm install
psql "$DATABASE_URL" -f ../database/schema.sql   # once, against a fresh database
npm run dev             # tsx watch, http://localhost:8080
```

## Endpoints

| Group | Auth | Notes |
|---|---|---|
| `POST /auth/signup`, `POST /auth/login`, `GET /auth/me` | none / bearer JWT | Signup creates an org (30-day trial) + ADMIN user + membership in one transaction. No email confirmation step. |
| `/devices/*` | bearer JWT | List/flag/recover/command a device; `GET /:id/audit-log` is ADMIN-only. Every query is scoped to the caller's own organization — a device from another org 404s, not 403. |
| `/customers/*` | bearer JWT | List/create. |
| `/agent/*` | `X-Agent-Key: <organizations.agent_api_key>` | register/heartbeat/commands for `pc-agent/` — see its README. Not a user JWT; the key alone identifies the organization. |
| `/billing/*` | bearer JWT (webhook: none, Stripe signature instead) | `GET /plans` (real prices for the personal/business picker), checkout/portal sessions, and the Stripe webhook that moves `subscription_status` out of `TRIALING`. |

## Deploy

Two ways to run this, same `src/app.ts` either way:

- **Any traditional Node host** (Fly.io, Render, Railway, a VM): build with
  `npm run build`, run `node dist/src/index.js` (a real process, holds the
  `pg` pool open, listens on `PORT`).
- **Vercel** (serverless): `api/index.ts` re-exports the same app with no
  listener, and `vercel.json` rewrites every path to it. Deploy with
  `rootDirectory` set to this `api/` folder. Works well specifically
  *because* the recommended Neon connection string is the pooled one (the
  `-pooler` hostname, PgBouncer-backed) — a plain `pg.Pool` per warm
  function instance is exactly what that pooler exists to absorb; point a
  serverless deploy at Neon's *unpooled* connection string and you'll
  exhaust Postgres's own connection limit under concurrent load instead.

Either way: point `DATABASE_URL` at Neon, set `CONSOLE_ORIGIN` to wherever
`console/` is actually hosted, and see the root README's Stripe section for
the billing-specific secrets.
