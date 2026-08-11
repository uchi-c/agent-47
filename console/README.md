# DeviceGuard Console

A console for protecting devices from theft/loss — flag a device lost or
stolen, send remote commands, review IP location history — for a personal
owner protecting their own laptop, a business protecting its own fleet, or
a business issuing/leasing devices to customers. Self-serve signup with a
30-day free trial, then a paid subscription. React + Vite + TypeScript,
talking to `api/` (a plain Node/Express backend over Neon Postgres — see
the root README for why there's no Supabase here despite the visual DNA).

The visual design deliberately reuses uchi-c/dube-man-system's "Uruu OS"
design system (same tokens, fonts, and `dm-*` component classes) rather
than inventing a new one, so this reads as a polished, coherent product
from day one.

## What it does

- Self-serve signup (30-day trial, no card required) and sign-in.
- Lists every device with assignment/security status, who it's assigned to
  (optional), agent online state, last known IP, and last-seen time. Search
  + filter (All / Flagged / Online).
- Per-device drawer:
  - Assign/reassign to a customer, or leave unassigned for a personally- or
    business-owned device with no separate holder. Quick-add a customer
    inline.
  - Change assignment status (Active/Returned/Defaulted) — only meaningful
    once a device is leased or issued to someone.
  - **Flag lost / Flag stolen**, with an editable recovery message shown on
    the device's lock screen (`pc-agent/overlay.py`).
  - **Mark recovered** — the one action that stops
    `pc-agent/theft_monitor.py`'s persistent re-locking.
  - Send LOCK / UNLOCK / REFRESH commands immediately.
  - **Wipe device** — gated behind a type-the-device-code confirmation
    dialog, and the button itself is disabled unless the device is
    currently flagged lost/stolen (the agent enforces this independently
    too — see `pc-agent/wipe.py`).
  - IP location history and the (admin-only) audit log, both read-only.
- Trial banner + a "Billing" link (Stripe-hosted portal) once subscribed;
  a full-screen upgrade prompt once the trial ends or a subscription lapses.

## What it deliberately doesn't do

Kept out to stay lightweight: no dedicated customers page (assign/quick-add
only, from the device drawer), no realtime subscription (a 20s poll
instead), no charts/analytics, no device-provisioning UI (an admin gets the
org's `agent_api_key` straight from the database for now — see
`pc-agent/README.md`). All of that is straightforward to add later against
the same `api/` endpoints if needed.

## Setup

1. Have `api/` running first (see its README) and copy `.env.example` to
   `.env`:
   ```
   VITE_API_URL=http://localhost:8080
   ```
2. `npm install`
3. `npm run dev` — opens on `http://localhost:3000`. Sign up straight from
   the login screen; there's no separate admin-provisioning step needed
   the way an RLS-based backend would require.

## Notes

- STAFF-role accounts can view everything but the drawer hides all
  mutating actions (`canManage` in `src/pages/Console.tsx`) — this mirrors
  the authorization checks in `api/src/middleware/requireAuth.ts`, it
  doesn't replace them. The API is the actual enforcement point (there's
  no database-level RLS on plain Postgres/Neon — see the root README).
- The audit log section is visibly empty for non-admins rather than
  erroring, since `GET /devices/:id/audit-log` is ADMIN-only in `api/`
  (`fetchAuditLog` in `src/services/devices.ts` catches the 403 and
  returns `[]` rather than surfacing a permissions error for an expected,
  role-gated read).
- Auth is a JWT in `localStorage` (`src/apiClient.ts`), not a cookie or a
  Supabase session object — there's no CSRF surface to think about, but it
  also means there's no server-side session revocation short of rotating
  `JWT_SECRET` in `api/`.
