# DeviceGuard

A theft-prevention platform for PCs — for a **personal owner** protecting
their own laptop, a **business** protecting its own fleet, or a business
**leasing/issuing devices to customers**. Self-serve signup, a 30-day free
trial, then a paid subscription (Stripe).

On theft/loss, it gives you:

- **Persistent lockdown** — once a device is flagged, the agent re-locks
  it on *every* poll (not just once) until staff explicitly mark it
  recovered. See `pc-agent/theft_monitor.py`.
- **An on-screen recovery message** — a full-screen, always-on-top notice
  shown on the locked device with custom text you control (a contact
  number, "please return to X", etc). See `pc-agent/overlay.py` +
  `pc-agent/overlay_display.py`.
- **IP-based location history** — no GPS on Windows, so this is the
  available signal: a timestamped log of the device's public IP as it
  changes. See `database/schema.sql` (`device_location_history`).
- **Remote wipe**, deliberately scoped to a fixed set of personal-data
  folders (Desktop/Documents/Downloads/Pictures/Videos/Music) under real
  user profiles — never the OS or installed applications. See
  `pc-agent/wipe.py` for the full reasoning and safety checks.

## ⚠ Read before enabling this for real customers

Locking/wiping your **own** device needs none of this. Locking/wiping a
device that's leased or issued to **someone else** does — disclosure in
the agreement, a defined data-retention period for location history, and a
dispute path, at minimum. See
**[docs/CONSENT-AND-LEGAL.md](docs/CONSENT-AND-LEGAL.md)** before shipping
that scenario to a real customer.

## Architecture

```
console/    React + Vite + TypeScript admin console (signup, device list, flag/command actions)
api/        Node + Express backend over Postgres — auth, device/customer CRUD, agent-facing
            endpoints, Stripe billing. See api/README.md.
database/   database/schema.sql -- run once against a fresh Postgres (targets Neon)
pc-agent/   Windows Python agent: heartbeat, persistent lockdown, recovery overlay, wipe
docs/       CONSENT-AND-LEGAL.md
```

Plain Postgres (Neon), not Supabase: there's no bundled auth, auto-REST-API,
or row-level security here, so `api/` is a real backend, not a thin proxy —
see `api/README.md` for what it does and why. Authorization lives in its
route handlers (`api/src/middleware/requireAuth.ts`), and the
`computer_audit_log` tamper-resistance guarantee that used to come from
Supabase RLS triggers is preserved with plain Postgres triggers instead
(see the comments in `database/schema.sql`).

### Built on uchi-c/dube-man-system's Uruu Agent

The pc-agent still reuses, rather than reinvents, the parts of
dube-man-system's café-PC-tracking agent that already solve the hard
problems here:

| Reused | Notes |
|---|---|
| Session-0-crossing lock pattern | `pc-agent/lockscreen.py`'s `lock_pc()` -- reused unchanged, then refactored to expose `run_in_active_session()` so `overlay.py` can use the same `CreateProcessAsUser` technique to show the recovery message in the logged-in user's session. |
| Heartbeat + remote-command-queue shape | The general "agent polls a commands table, heartbeats its metrics" pattern. Adapted to talk to `api/` instead of Supabase directly — see `pc-agent/database.py`. |
| Thread supervisor | `pc-agent/watchdog.py` -- reused verbatim. |

New, specific to DeviceGuard: `theft_monitor.py` (persistent lockdown check
every poll, independent of the one-shot command queue), `overlay.py` /
`overlay_display.py` (the recovery-message window), `wipe.py` (the
conservative, targeted wipe), and the whole `api/` backend + self-serve
`console/`.

## Setup

1. **Database**: create a [Neon](https://neon.tech) project (or point at
   any Postgres), then `psql "$DATABASE_URL" -f database/schema.sql` once.
2. **API**: see `api/README.md` — `cp .env.example .env`, fill in
   `DATABASE_URL` + `JWT_SECRET`, `npm install && npm run dev`.
3. **Console**: see `console/README.md` — point `VITE_API_URL` at the API,
   `npm install && npm run dev`, then just sign up from the login screen.
4. **A device**: from an elevated PowerShell on the machine to protect:
   ```powershell
   cd pc-agent
   .\install.ps1 -ApiBaseUrl "https://api.yourdomain.com" `
                 -AgentSecret "<this organization's agent_api_key>" `
                 -ComputerCode "DEV-01"
   ```
   Find `agent_api_key` in the `organizations` table for now (there's no
   console UI for it yet — see console/README.md's "what it deliberately
   doesn't do").

## Flagging a device lost/stolen

Normally from the console (sign in → click a device → Flag lost/stolen),
or directly against the API:

```bash
curl -X POST https://api.yourdomain.com/devices/<device-id>/flag \
  -H "Authorization: Bearer <your session token>" \
  -H 'Content-Type: application/json' \
  -d '{"security_status":"FLAGGED_STOLEN","recovery_message":"This laptop was reported stolen. Please call 555-0100 to arrange its return."}'
```

Within one `LOCKDOWN_CHECK_INTERVAL` (default 20s), the agent locks the
screen and shows the recovery message — and keeps re-locking on every
subsequent poll, regardless of anyone unlocking it in between, until
`security_status` is set back to `RECOVERED`.

To wipe (only takes effect if the device is still flagged — see
`pc-agent/wipe.py` and `POST /devices/:id/commands` in `api/`):

```bash
curl -X POST https://api.yourdomain.com/devices/<device-id>/commands \
  -H "Authorization: Bearer <your session token>" \
  -H 'Content-Type: application/json' \
  -d '{"command":"WIPE","payload":{"confirm":true}}'
```
