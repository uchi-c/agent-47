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
| `/billing/*` | bearer JWT (webhook: none, Stripe signature instead) | Checkout/portal sessions + the Stripe webhook that moves `subscription_status` out of `TRIALING`. |

## Deploy

Any Node host works (Fly.io, Render, Railway, a VM). Build with `npm run
build`, run `node dist/index.js`. Point `DATABASE_URL` at Neon, set
`CONSOLE_ORIGIN` to wherever `console/` is actually hosted, and see the
root README's Stripe section for the billing-specific secrets.
