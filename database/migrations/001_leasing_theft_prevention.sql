-- ============================================================================
-- MIGRATION 001: DEVICE LEASING / THEFT-PREVENTION
--
-- Adds everything needed to track devices leased to CUSTOMERS (not internal
-- staff PCs): who currently holds a device, whether the lease/device is in
-- good standing, an IP location history, an immutable audit trail for the
-- sensitive actions (flagging lost/stolen, issuing WIPE), and widens the
-- command queue to allow WIPE now that its safety constraints exist.
--
-- Everything here is additive (ADD COLUMN / CREATE TABLE IF NOT EXISTS) —
-- nothing is renamed or dropped, so this is safe to run on a fresh project
-- seeded from schema.sql, or apply directly against an already-live
-- dube-man-system-style project that has a `computers` / `computer_commands`
-- table of the same shape.
--
-- Run AFTER schema.sql (or after dube-man-system's schema.sql + agent_schema.sql).
-- Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. CUSTOMER-TO-DEVICE LINKAGE + LEASE / SECURITY STATUS
--
-- Two separate status fields, deliberately not one:
--   lease_status    — the business state of the lease itself. Billing /
--                      handover concerns. Never drives agent behaviour.
--   security_status — the ONLY field the agent's persistent-lockdown check
--                      (pc-agent/theft_monitor.py) reads. Kept independent
--                      of lease_status so a still-active, fully-paid lease
--                      is never accidentally locked by a lease-side status
--                      change, and so "flag stolen" works even mid-lease.
-- ---------------------------------------------------------------------------

alter table public.computers add column if not exists customer_id uuid references public.customers(id) on delete set null;

alter table public.computers add column if not exists lease_status text not null default 'ACTIVE'
    check (lease_status in ('ACTIVE','RETURNED','DEFAULTED'));

alter table public.computers add column if not exists security_status text not null default 'NORMAL'
    check (security_status in ('NORMAL','FLAGGED_LOST','FLAGGED_STOLEN','RECOVERED'));

-- Shown on the device's lock/overlay screen while security_status is
-- FLAGGED_LOST or FLAGGED_STOLEN. Free text so staff can put a real contact
-- number / reward note / "please return to X" message, not a canned string.
alter table public.computers add column if not exists recovery_message text;

alter table public.computers add column if not exists flagged_at timestamptz;
alter table public.computers add column if not exists flagged_by uuid references public.users(id) on delete set null;
alter table public.computers add column if not exists recovered_at timestamptz;

-- Set once a WIPE command actually completes (pc-agent/wipe.py writes this
-- after a successful run, not the console) — the one source of truth for
-- "has this specific device already been wiped", independent of whatever
-- the command queue's row status/result says.
alter table public.computers add column if not exists wiped_at timestamptz;

create index if not exists computers_customer_id_idx on public.computers (customer_id);
create index if not exists computers_security_status_idx on public.computers (security_status) where security_status <> 'NORMAL';

-- ---------------------------------------------------------------------------
-- 2. WIDEN COMPUTER_COMMANDS: allow WIPE, and record a result payload
--
-- WIPE is intentionally still just a queue row like LOCK/UNLOCK/REFRESH —
-- no separate table — so the existing sendComputerCommand-style plumbing
-- and the agent's existing get_pending_commands/complete_command functions
-- need no structural changes, only the allowed-values list.
-- ---------------------------------------------------------------------------

alter table public.computer_commands drop constraint if exists computer_commands_command_check;
alter table public.computer_commands add constraint computer_commands_command_check
    check (command in ('LOCK','UNLOCK','WIPE','REFRESH'));

-- Free-form result the agent reports back on completion (e.g. wipe.py's
-- folder-by-folder summary, or why it refused to run). Nothing upstream
-- can SSH into a lost/stolen device to check afterwards, so this is the
-- only record of what actually happened.
alter table public.computer_commands add column if not exists result jsonb;

-- WIPE is destructive and must never fire without an explicit operator
-- confirmation in the payload — enforced here too (not just agent-side) so
-- a console bug can't insert a bare {"command":"WIPE"} row and have the
-- agent treat missing confirmation as implicit yes.
alter table public.computer_commands drop constraint if exists computer_commands_wipe_requires_confirm;
alter table public.computer_commands add constraint computer_commands_wipe_requires_confirm
    check (command <> 'WIPE' or (payload ->> 'confirm') = 'true');

-- ---------------------------------------------------------------------------
-- 3. DEVICE_LOCATION_HISTORY — append-only IP/timestamp trail
--
-- No GPS on a Windows laptop, so this is the only location signal available.
-- ip_address is the device's public/WAN-facing address (resolved by the
-- agent via an external echo service) since that's what can actually change
-- as a stolen device moves between networks; local_ip_address is kept too
-- as the same LAN-address diagnostic dube-man-system already reports via
-- computers.ip_address, for continuity when the device never leaves one
-- network. The agent only inserts a new row when the public IP has changed
-- since the last one (see pc-agent/database.py:log_location_if_changed) —
-- polling every heartbeat would otherwise turn this into an unbounded log
-- of "same IP" rows for a device sitting on one network for months.
-- ---------------------------------------------------------------------------

create table if not exists public.device_location_history (
    id uuid default uuid_generate_v4() primary key,
    computer_id uuid not null references public.computers(id) on delete cascade,
    computer_code text not null,
    ip_address text not null,
    local_ip_address text,
    recorded_at timestamptz default timezone('utc', now()) not null
);

alter table public.device_location_history enable row level security;
create index if not exists device_location_history_computer_id_idx on public.device_location_history (computer_id, recorded_at desc);

drop policy if exists "Org members read device location history" on public.device_location_history;
create policy "Org members read device location history" on public.device_location_history for select
    using (
        computer_id in (
            select c.id from public.computers c
            where c.organization_id in (select public.current_org_ids())
        )
    );

grant select, insert on public.device_location_history to anon;
drop policy if exists "Agent inserts location history" on public.device_location_history;
create policy "Agent inserts location history" on public.device_location_history for insert to anon with check (true);
drop policy if exists "Agent reads own location history" on public.device_location_history;
create policy "Agent reads own location history" on public.device_location_history for select to anon using (true);

-- ---------------------------------------------------------------------------
-- 4. COMPUTER_AUDIT_LOG — immutable trail for the actions that matter most:
--    who flagged a device lost/stolen or marked it recovered, and who issued
--    which command (especially WIPE). Populated ONLY by triggers below, not
--    by application code, so it can't be silently skipped by a caller that
--    forgets to log — see docs/CONSENT-AND-LEGAL.md for why this matters
--    for a customer-facing (not internal-staff) device.
-- ---------------------------------------------------------------------------

create table if not exists public.computer_audit_log (
    id uuid default uuid_generate_v4() primary key,
    organization_id uuid not null references public.organizations(id),
    computer_id uuid not null references public.computers(id) on delete cascade,
    event text not null check (event in ('STATUS_CHANGED','COMMAND_ISSUED')),
    detail jsonb,
    actor uuid references public.users(id) on delete set null,
    created_at timestamptz default timezone('utc', now()) not null
);

alter table public.computer_audit_log enable row level security;
create index if not exists computer_audit_log_computer_id_idx on public.computer_audit_log (computer_id, created_at desc);

drop policy if exists "Org admins read audit log" on public.computer_audit_log;
create policy "Org admins read audit log" on public.computer_audit_log for select
    using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN']::public.user_role[]));

-- No insert/update/delete policy for any role: rows only ever come from the
-- security-definer trigger functions below, which bypass RLS by design.
-- This is what makes the log tamper-resistant against the app layer, not
-- just "usually written to".

create or replace function public.log_computer_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.lease_status is distinct from old.lease_status
       or new.security_status is distinct from old.security_status then
        insert into public.computer_audit_log (organization_id, computer_id, event, detail, actor)
        values (
            new.organization_id,
            new.id,
            'STATUS_CHANGED',
            jsonb_build_object(
                'lease_status_from', old.lease_status, 'lease_status_to', new.lease_status,
                'security_status_from', old.security_status, 'security_status_to', new.security_status,
                'recovery_message', new.recovery_message
            ),
            auth.uid()
        );
    end if;
    return new;
end;
$$;

drop trigger if exists tr_log_computer_status_change on public.computers;
create trigger tr_log_computer_status_change
    after update on public.computers
    for each row execute function public.log_computer_status_change();

create or replace function public.log_computer_command_issued()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_computer public.computers%rowtype;
begin
    select * into v_computer from public.computers where computer_code = new.computer_code limit 1;
    if not found then
        return new;
    end if;

    insert into public.computer_audit_log (organization_id, computer_id, event, detail, actor)
    values (
        v_computer.organization_id,
        v_computer.id,
        'COMMAND_ISSUED',
        jsonb_build_object('command', new.command, 'payload', new.payload),
        auth.uid()
    );
    return new;
end;
$$;

drop trigger if exists tr_log_computer_command_issued on public.computer_commands;
create trigger tr_log_computer_command_issued
    after insert on public.computer_commands
    for each row execute function public.log_computer_command_issued();

comment on table public.computer_audit_log is 'Immutable trail (trigger-populated only) of lease/security status changes and command issuance, for every device. Exists specifically to make WIPE and lost/stolen flags accountable — see docs/CONSENT-AND-LEGAL.md.';
comment on column public.computers.security_status is 'Drives pc-agent/theft_monitor.py persistent lockdown. FLAGGED_LOST/FLAGGED_STOLEN -> agent re-locks + shows recovery_message on every poll until this becomes RECOVERED. Independent of lease_status.';
comment on column public.computer_commands.result is 'Agent-reported outcome of a completed/failed command — e.g. wipe.py''s per-folder summary or refusal reason. The only record available for a device nobody can otherwise reach.';
