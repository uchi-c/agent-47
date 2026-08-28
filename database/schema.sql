-- ============================================================================
-- DEVICE GUARD — SCHEMA (plain Postgres, targets Neon)
--
-- This used to be layered on Supabase (Postgres + Auth + auto-REST-API +
-- Row Level Security keyed on auth.uid()). It now runs on Neon, which is
-- Postgres only -- no bundled auth, no PostgREST, no RLS-enforcing client.
-- Everything that used to be a Supabase RLS policy is now an authorization
-- check in api/'s route handlers instead; this file has no RLS in it.
--
-- What that trade costs, and what it doesn't:
--   - Authorization now lives in application code (api/src/routes/*.ts),
--     not the database. A bug there is a real bug, same as it would be in
--     an RLS policy -- there's no free lunch either way, just a different
--     place the logic lives.
--   - The one thing worth calling out specifically: computer_audit_log
--     used to be populated ONLY by database triggers keyed off auth.uid(),
--     specifically so no application code path could skip logging a WIPE
--     or a lost/stolen flag. That guarantee is preserved here, not
--     dropped -- see section 5. The triggers still exist; they just read
--     who-did-this from an explicit updated_by/created_by column the API
--     sets on the same statement, instead of a Postgres session variable
--     Supabase used to set for us.
--
-- Run this once against a fresh Neon database. Safe to re-run.
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto"; -- gen_random_bytes(), used for organizations.agent_api_key

do $$
begin
    if not exists (select 1 from pg_type where typname = 'user_role') then
        create type public.user_role as enum ('ADMIN', 'STAFF');
    end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. ORGANIZATIONS -- the account. Could be a personal owner protecting
--    their own laptop, a business protecting its own fleet, or a business
--    issuing/leasing devices to customers -- all just "an organization
--    with devices", see computers.customer_id below.
-- ---------------------------------------------------------------------------

create table public.organizations (
    id uuid default uuid_generate_v4() primary key,
    name text not null,
    created_at timestamptz default timezone('utc', now()) not null,

    -- Subscription / trial. TRIALING (before trial_ends_at) or ACTIVE grant
    -- access; PAST_DUE/CANCELED/an-expired-TRIALING don't -- see
    -- api/src/middleware/requireActiveSubscription.ts. Only the Stripe
    -- webhook (api/src/routes/billing.ts) writes subscription_status after
    -- the initial signup-time TRIALING.
    -- 'personal' and 'business' differ only in price and the device cap
    -- api/src/routes/agent.ts enforces at registration (PERSONAL_PLAN_DEVICE_LIMIT)
    -- -- same schema, same features either way.
    plan text not null default 'trial' check (plan in ('trial', 'personal', 'business')),
    subscription_status text not null default 'TRIALING' check (subscription_status in ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED')),
    trial_ends_at timestamptz not null default (timezone('utc', now()) + interval '30 days'),
    stripe_customer_id text,
    stripe_subscription_id text unique,

    -- Bearer secret the pc-agent authenticates with (api/src/middleware/
    -- requireAgentKey.ts) -- replaces the old Supabase-anon-key-plus-
    -- ORGANIZATION_ID-env-var model. One shared secret per org; the agent
    -- no longer needs to be told its organization id separately, the key
    -- IS how the server knows which org a device belongs to.
    agent_api_key text not null unique default encode(gen_random_bytes(24), 'hex')
);

create index organizations_agent_api_key_idx on public.organizations (agent_api_key);

-- ---------------------------------------------------------------------------
-- 2. USERS -- console staff/owners. Auth lives here now (password_hash),
--    not in a separate Supabase auth.users table.
-- ---------------------------------------------------------------------------

create table public.users (
    id uuid default uuid_generate_v4() primary key,
    name text not null,
    email text not null unique,
    password_hash text not null,
    role public.user_role not null default 'STAFF',
    created_at timestamptz default timezone('utc', now()) not null
);

create table public.user_organization_memberships (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid not null references public.users(id) on delete cascade,
    org_id uuid not null references public.organizations(id) on delete cascade,
    created_at timestamptz default timezone('utc', now()) not null,
    unique (user_id, org_id)
);

create index user_org_memberships_user_idx on public.user_organization_memberships (user_id);
create index user_org_memberships_org_idx on public.user_organization_memberships (org_id);

-- ---------------------------------------------------------------------------
-- 3. CUSTOMERS -- optional. The person a device is currently held by, when
--    that's someone other than the org itself (a leasing customer, an
--    employee a business fleet PC is issued to). Leave computers.customer_id
--    null for a personally- or business-owned device with no separate
--    holder -- the org IS the owner and user.
-- ---------------------------------------------------------------------------

create table public.customers (
    id uuid default uuid_generate_v4() primary key,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    name text not null,
    phone text,
    email text,
    id_number text,
    address text,
    created_at timestamptz default timezone('utc', now()) not null
);

create index customers_organization_id_idx on public.customers (organization_id);

-- ---------------------------------------------------------------------------
-- 4. COMPUTERS -- one row per protected device.
-- ---------------------------------------------------------------------------

create table public.computers (
    id uuid default uuid_generate_v4() primary key,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    computer_name text not null,
    computer_code text not null unique,
    hostname text,
    ip_address text,
    cpu_usage numeric(5,2),
    ram_usage numeric(5,2),
    disk_usage numeric(5,2),
    last_seen timestamptz,
    created_at timestamptz default timezone('utc', now()) not null,

    customer_id uuid references public.customers(id) on delete set null,

    -- Business lifecycle of the device's assignment. Rarely relevant for a
    -- personally-owned device (stays ACTIVE); meaningful once a device is
    -- leased/issued to someone (RETURNED when they give it back, DEFAULTED
    -- if a lease goes unpaid).
    lease_status text not null default 'ACTIVE' check (lease_status in ('ACTIVE', 'RETURNED', 'DEFAULTED')),

    -- The ONLY field the pc-agent's persistent-lockdown loop
    -- (pc-agent/theft_monitor.py) reads. Deliberately independent of
    -- lease_status -- a routine lease-lifecycle change must never
    -- accidentally trigger lockdown.
    security_status text not null default 'NORMAL' check (security_status in ('NORMAL', 'FLAGGED_LOST', 'FLAGGED_STOLEN', 'RECOVERED')),
    recovery_message text,
    flagged_at timestamptz,
    flagged_by uuid references public.users(id) on delete set null,
    recovered_at timestamptz,
    wiped_at timestamptz,

    -- Set by api/ on every UPDATE that changes lease_status/security_status,
    -- purely so the audit trigger below (section 5) can attribute the
    -- change without a Postgres session variable. Not meant to be read for
    -- anything else.
    updated_by uuid references public.users(id) on delete set null
);

create index computers_organization_id_idx on public.computers (organization_id);
create index computers_customer_id_idx on public.computers (customer_id);
create index computers_security_status_idx on public.computers (security_status) where security_status <> 'NORMAL';

-- ---------------------------------------------------------------------------
-- 5. COMPUTER_COMMANDS -- the remote command queue the agent polls.
-- ---------------------------------------------------------------------------

create table public.computer_commands (
    id uuid default uuid_generate_v4() primary key,
    computer_code text not null,
    command text not null check (command in ('LOCK', 'UNLOCK', 'WIPE', 'REFRESH')),
    payload jsonb,
    status text not null default 'PENDING' check (status in ('PENDING', 'COMPLETED', 'FAILED')),
    result jsonb,
    created_at timestamptz default timezone('utc', now()) not null,
    completed_at timestamptz,

    -- WIPE is destructive and must never fire without an explicit operator
    -- confirmation in the payload -- enforced here (not just in api/), so a
    -- bug that inserts a bare {"command":"WIPE"} row can't be treated as
    -- implicit confirmation.
    constraint computer_commands_wipe_requires_confirm check (command <> 'WIPE' or (payload ->> 'confirm') = 'true'),

    -- Set by api/ on insert, purely for the audit trigger below (same
    -- reasoning as computers.updated_by). Null for agent-originated writes
    -- (the agent only ever completes commands, never inserts them).
    created_by uuid references public.users(id) on delete set null
);

create index computer_commands_code_status_idx on public.computer_commands (computer_code, status);

-- ---------------------------------------------------------------------------
-- 6. DEVICE_LOCATION_HISTORY -- append-only IP/timestamp trail. No GPS on
--    Windows, so this is the available location signal. api/'s heartbeat
--    handler only inserts a row when the public IP actually changed since
--    the last one -- see api/src/routes/agent.ts -- otherwise a 30s
--    heartbeat would turn this into an unbounded "still here" log.
-- ---------------------------------------------------------------------------

create table public.device_location_history (
    id uuid default uuid_generate_v4() primary key,
    computer_id uuid not null references public.computers(id) on delete cascade,
    computer_code text not null,
    ip_address text not null,
    local_ip_address text,
    recorded_at timestamptz default timezone('utc', now()) not null
);

create index device_location_history_computer_id_idx on public.device_location_history (computer_id, recorded_at desc);

-- ---------------------------------------------------------------------------
-- 7. COMPUTER_AUDIT_LOG -- immutable, trigger-populated only (see the two
--    triggers below). Nothing in api/ inserts into this table directly --
--    that's what makes it tamper-resistant against an application bug, not
--    just usually-written-to. Read-access is enforced in api/ (ADMIN role
--    only), since there's no RLS here to do it for us.
-- ---------------------------------------------------------------------------

create table public.computer_audit_log (
    id uuid default uuid_generate_v4() primary key,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    computer_id uuid not null references public.computers(id) on delete cascade,
    event text not null check (event in ('STATUS_CHANGED', 'COMMAND_ISSUED')),
    detail jsonb,
    actor uuid references public.users(id) on delete set null,
    created_at timestamptz default timezone('utc', now()) not null
);

create index computer_audit_log_computer_id_idx on public.computer_audit_log (computer_id, created_at desc);

create or replace function public.log_computer_status_change()
returns trigger
language plpgsql
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
            new.updated_by
        );
    end if;
    return new;
end;
$$;

create trigger tr_log_computer_status_change
    after update on public.computers
    for each row execute function public.log_computer_status_change();

create or replace function public.log_computer_command_issued()
returns trigger
language plpgsql
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
        new.created_by
    );
    return new;
end;
$$;

create trigger tr_log_computer_command_issued
    after insert on public.computer_commands
    for each row execute function public.log_computer_command_issued();

comment on table public.computer_audit_log is 'Immutable trail (trigger-populated only) of lease/security status changes and command issuance. See docs/CONSENT-AND-LEGAL.md for why this exists specifically for WIPE and lost/stolen flags.';
comment on column public.computers.security_status is 'Drives pc-agent/theft_monitor.py persistent lockdown. FLAGGED_LOST/FLAGGED_STOLEN -> agent re-locks + shows recovery_message on every poll until this becomes RECOVERED.';
comment on column public.computer_commands.result is 'Agent-reported outcome of a completed/failed command -- e.g. wipe.py''s per-folder summary or refusal reason. The only record available for a device nobody can otherwise reach.';
