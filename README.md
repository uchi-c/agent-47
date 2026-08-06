# Device Leasing / Theft-Prevention Agent

A theft-prevention system for devices **leased or given to customers** —
laptops/PCs that leave the premises and belong (for the duration of the
lease) to someone outside the organization. This is a different business
model from a walk-in café PC: there's no billing-by-the-minute session,
but there is a customer who currently holds the device, and a real chance
the device is lost, stolen, or not returned.

On theft/loss, this gives an operator:

- **Persistent lockdown** — once a device is flagged, the agent re-locks
  it on *every* poll (not just once) until staff explicitly mark it
  recovered. See `pc-agent/theft_monitor.py`.
- **An on-screen recovery message** — a full-screen, always-on-top notice
  shown on the locked device with custom text staff control (a contact
  number, "please return to X", etc). See `pc-agent/overlay.py` +
  `pc-agent/overlay_display.py`.
- **IP-based location history** — no GPS on Windows, so this is the
  available signal: a timestamped log of the device's public IP as it
  changes. See `database/migrations/001_leasing_theft_prevention.sql`
  (`device_location_history`) and `pc-agent/database.py`.
- **Remote wipe**, deliberately scoped to a fixed set of personal-data
  folders (Desktop/Documents/Downloads/Pictures/Videos/Music) under real
  user profiles — never the OS or installed applications. See
  `pc-agent/wipe.py` for the full reasoning and safety checks.

## Built on uchi-c/dube-man-system's Uruu Agent

This reuses, rather than reinvents, the parts of dube-man-system's
café-PC-tracking agent that already solve the hard problems here:

| Reused | From | Notes |
|---|---|---|
| `computers` table shape (code/name/ip/hostname/metrics/last_seen) | `database/schema.sql` | Café-specific billing columns (`hourly_rate`, `rate_per_minute`, Available/Occupied/Maintenance status) dropped — they don't apply to a leased device. |
| `computer_commands` queue + anon-key agent polling pattern | `agent_schema.sql` | Same LOCK/UNLOCK/REFRESH commands; WIPE added in the migration once its safety constraints exist. |
| Heartbeat / `ip_address` reporting | `pc-agent/heartbeat.py`, `metrics.py` | Extended with a public-IP lookup (`metrics.get_public_ip()`) and dedup'd history logging — LAN IP alone is meaningless once a device leaves the original network. |
| Session-0-crossing lock pattern | `pc-agent/lockscreen.py` | `lock_pc()` reused unchanged. Refactored to expose `run_in_active_session()` so `overlay.py` can use the same `CreateProcessAsUser` technique to show the recovery message in the logged-in user's session. |
| Thread supervisor | `pc-agent/watchdog.py` | Reused verbatim. |

New work, specific to leasing/theft-prevention:

- **Customer-to-device linkage** — `computers.customer_id` (nullable FK to
  a new `customers` table).
- **Lease/security status fields** — `computers.lease_status` (business
  lifecycle: ACTIVE/RETURNED/DEFAULTED) kept deliberately **separate**
  from `computers.security_status` (ACTION_STATUS: NORMAL/FLAGGED_LOST/
  FLAGGED_STOLEN/RECOVERED — the only field the persistent-lockdown loop
  reads). See the migration file for why they're split.
- **`device_location_history`** table — append-only IP/timestamp trail,
  written only when the public IP actually changes.
- **`computer_audit_log`** table — trigger-populated (not
  application-populated) immutable log of every status change and every
  command issued, specifically so WIPE and lost/stolen flags are
  accountable. See `docs/CONSENT-AND-LEGAL.md`.
- **New agent-side handlers**: `theft_monitor.py` (persistent lockdown
  check every poll, independent of the one-shot command queue),
  `overlay.py`/`overlay_display.py` (the recovery message window), and
  `wipe.py` (the conservative, targeted wipe).

## ⚠ Read before enabling this for real customers

Remote lock/wipe against a device in a **customer's** possession (not
internal staff) has consumer-protection and consent implications this
codebase does not resolve on its own — disclosure in the lease agreement,
a defined data-retention period for location history, and a dispute path,
at minimum. See **[docs/CONSENT-AND-LEGAL.md](docs/CONSENT-AND-LEGAL.md)**
before shipping this to a real lessor.

## Layout

```
database/
  schema.sql                                   -- base tables (org/users/customers/computers/commands)
  migrations/001_leasing_theft_prevention.sql   -- leasing/theft additions (additive; safe to re-run)
pc-agent/
  agent.py               -- entrypoint: wires up the watched threads
  service.py              -- Windows service wrapper
  config.py                -- env config
  database.py               -- all Supabase reads/writes
  heartbeat.py               -- metrics + location-history reporting
  metrics.py                  -- CPU/RAM/disk + public-IP resolution
  command_manager.py           -- polls computer_commands (LOCK/UNLOCK/REFRESH/WIPE)
  theft_monitor.py               -- persistent lockdown poll loop (NEW)
  lockscreen.py                    -- session-0-crossing lock (reused)
  overlay.py / overlay_display.py   -- recovery-message overlay (NEW)
  wipe.py                             -- targeted wipe (NEW)
  watchdog.py                          -- thread supervisor (reused)
  install.ps1                           -- Windows installer (adapted)
console/
  src/pages/Console.tsx   -- device list, KPIs, search/filter (NEW)
  src/components/DeviceDrawer.tsx -- flag lost/stolen, commands, wipe confirm, history (NEW)
  ...                      -- see console/README.md
docs/
  CONSENT-AND-LEGAL.md
```

## Admin console

`console/` is a lightweight React admin console for flagging devices and
issuing commands — device list with lease/security status and search/filter,
a per-device drawer to flag lost/stolen (with a custom recovery message),
mark recovered, send LOCK/UNLOCK/REFRESH, and a type-the-device-code-to-confirm
WIPE dialog, plus IP location history and the audit log. See
**[console/README.md](console/README.md)** for setup (it needs its own
Supabase Auth user with an ADMIN/STAFF `public.users` row — there's no
self-serve signup, deliberately, given what this console can do to a
device).

## Setup

1. Run `database/schema.sql` against a fresh Supabase project, then
   `database/migrations/001_leasing_theft_prevention.sql`. (If layering
   this onto an existing dube-man-system project instead, the migration
   file alone is additive and safe to run directly against its live
   `computers`/`computer_commands` tables.)
2. On the device to be leased, from an **elevated** PowerShell:
   ```powershell
   cd pc-agent
   .\install.ps1 -SupabaseUrl "https://<project-ref>.supabase.co" `
                 -SupabaseAnonKey "<anon-key>" `
                 -OrganizationId "<organizations.id>" `
                 -ComputerCode "DEV-01"
   ```
3. Link the device to a customer and set `lease_status` from your admin
   tooling (Supabase table editor, or a console — this repo ships the
   agent + schema, not an admin UI).

## Flagging a device lost/stolen

```sql
update computers
set security_status = 'FLAGGED_STOLEN',
    recovery_message = 'This laptop was reported stolen. Please call 555-0100 to arrange its return.',
    flagged_at = now(),
    flagged_by = '<staff user id>'
where computer_code = 'DEV-01';
```

Within one `LOCKDOWN_CHECK_INTERVAL` (default 20s), the agent locks the
screen and shows the recovery message — and keeps re-locking on every
subsequent poll, regardless of anyone unlocking it in between, until
`security_status` is set back to `RECOVERED`.

To wipe (only takes effect if the device is still flagged — see
`pc-agent/wipe.py`):

```sql
insert into computer_commands (computer_code, command, payload)
values ('DEV-01', 'WIPE', '{"confirm": true}'::jsonb);
```
