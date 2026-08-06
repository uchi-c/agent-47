# Device Leasing Console

A lightweight admin console for flagging leased devices lost/stolen,
issuing remote commands, and reviewing IP location history — the operator
side of the `pc-agent`/`database` in this repo. React + Vite + TypeScript,
talking directly to Supabase (no separate backend).

The visual design deliberately reuses uchi-c/dube-man-system's "Uruu OS"
design system (same tokens, fonts, and `dm-*` component classes) rather
than inventing a new one, so this reads as one product family, not a
bolted-on internal tool.

## What it does

- Lists every device with lease/security status, assigned customer, agent
  online state, last known IP, and last-seen time. Search + filter
  (All / Flagged / Online).
- Per-device drawer:
  - Assign/reassign a customer (or quick-add a new one inline).
  - Change lease status (Active/Returned/Defaulted).
  - **Flag lost / Flag stolen**, with an editable recovery message that
    gets shown on the device's lock screen (`pc-agent/overlay.py`) — see
    `handleFlagConfirm` in `src/components/DeviceDrawer.tsx`.
  - **Mark recovered** — the one action that stops
    `pc-agent/theft_monitor.py`'s persistent re-locking.
  - Send LOCK / UNLOCK / REFRESH commands immediately.
  - **Wipe device** — gated behind a type-the-device-code confirmation
    dialog (`src/components/ConfirmDialog.tsx`), and the button itself is
    disabled unless the device is currently flagged lost/stolen (the
    agent enforces this independently too — see `pc-agent/wipe.py`).
  - IP location history and the (admin-only) audit log, both read-only.

## What it deliberately doesn't do

Kept out to stay "lightweight": no dedicated customers page (assign/quick-add
only, from the device drawer), no realtime subscription (a 20s poll instead),
no charts/analytics, no PC-agent provisioning flow. All of that is
straightforward to add later against the same schema/services if needed.

## Setup

1. Copy `.env.example` to `.env` and fill in your Supabase project's URL
   and anon/publishable key:
   ```
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon-key>
   ```
2. `npm install`
3. **Create the first admin.** This console authenticates real Supabase
   Auth users against `public.users` (role ADMIN/STAFF) — there's no
   self-serve signup here on purpose (device lock/wipe access shouldn't be
   self-service). To bootstrap the first account:
   - Create a user in Supabase Auth (dashboard → Authentication → Add user,
     or `supabase.auth.admin.createUser`).
   - Insert their profile: `insert into public.users (id, name, email, role) values ('<auth-user-id>', 'Your Name', 'you@company.com', 'ADMIN');`
4. `npm run dev` — opens on `http://localhost:3000`.

## Notes

- STAFF-role accounts can view everything but the drawer hides all
  mutating actions (`canManage` in `src/pages/Console.tsx`) — this mirrors
  the RLS policies in `database/schema.sql`/migrations, it doesn't replace
  them. The database is the actual enforcement point.
- The audit log section is visibly empty for non-admins rather than
  erroring, since `computer_audit_log` is admin-only per RLS
  (`fetchAuditLog` in `src/services/devices.ts` swallows that as "nothing
  to show" rather than surfacing a permissions error).
