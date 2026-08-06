-- ============================================================================
-- DEVICE LEASING / THEFT-PREVENTION — BASE SCHEMA
--
-- This is a trimmed, standalone adaptation of uchi-c/dube-man-system's core
-- schema (organizations/users/customers/computers/computer_commands),
-- scoped to the device-leasing business model instead of walk-in café PC
-- rental. Table names, column names and the anon-key agent access pattern
-- match dube-man-system's `computers` / `computer_commands` intentionally,
-- so that:
--   1. This file can stand alone for a fresh Supabase project, AND
--   2. database/migrations/001_leasing_theft_prevention.sql (which adds the
--      leasing/theft columns) is realistically appliable as-is against a
--      real dube-man-system project too — it only ever ADDs columns/tables,
--      it never renames or drops anything from the original.
--
-- Dropped from the original `computers` shape: hourly_rate, rate_per_minute,
-- and the Available/Occupied/Maintenance status enum. Those model walk-in
-- café billing by the minute, which doesn't apply once a device leaves the
-- premises on a lease — a leased device doesn't have a rental status, it
-- has a *lease* status and a *security* status (see the migration file).
--
-- Run this file first, then database/migrations/001_leasing_theft_prevention.sql.
-- Safe to re-run (every statement is idempotent).
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- 1. ROLES + USERS
-- ---------------------------------------------------------------------------

do $$
begin
    if not exists (select 1 from pg_type where typname = 'user_role') then
        create type public.user_role as enum ('ADMIN', 'STAFF');
    end if;
end $$;

create table if not exists public.users (
    id uuid primary key references auth.users(id) on delete cascade,
    name text not null,
    email text not null unique,
    role public.user_role default 'STAFF'::public.user_role not null,
    created_at timestamptz default timezone('utc'::text, now()) not null
);

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
    select role from public.users where id = auth.uid()
$$;

create or replace function public.is_role(allowed public.user_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(public.current_user_role() = any(allowed), false)
$$;

alter table public.users enable row level security;

drop policy if exists "Users can read own profile" on public.users;
create policy "Users can read own profile" on public.users for select
    using (id = auth.uid() or public.is_role(array['ADMIN']::public.user_role[]));
drop policy if exists "Users can create own staff profile" on public.users;
create policy "Users can create own staff profile" on public.users for insert
    with check (id = auth.uid() and role = 'STAFF'::public.user_role);
drop policy if exists "Admins manage users" on public.users;
create policy "Admins manage users" on public.users for all
    using (public.is_role(array['ADMIN']::public.user_role[]))
    with check (public.is_role(array['ADMIN']::public.user_role[]));

-- ---------------------------------------------------------------------------
-- 2. ORGANIZATIONS (multi-tenant: one deployment can serve several lessors)
-- ---------------------------------------------------------------------------

create table if not exists public.organizations (
    id uuid default uuid_generate_v4() primary key,
    name text not null unique,
    created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.organizations enable row level security;

create table if not exists public.user_organization_memberships (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid not null references public.users(id) on delete cascade,
    org_id uuid not null references public.organizations(id) on delete cascade,
    created_at timestamptz default timezone('utc'::text, now()) not null,
    unique (user_id, org_id)
);

alter table public.user_organization_memberships enable row level security;

drop policy if exists "Members and admins read organizations" on public.organizations;
create policy "Members and admins read organizations" on public.organizations for select
    using (
        id in (select org_id from public.user_organization_memberships where user_id = auth.uid())
        or public.is_role(array['ADMIN']::public.user_role[])
    );
drop policy if exists "Admins manage organizations" on public.organizations;
create policy "Admins manage organizations" on public.organizations for all
    using (public.is_role(array['ADMIN']::public.user_role[]))
    with check (public.is_role(array['ADMIN']::public.user_role[]));

drop policy if exists "Users read own memberships" on public.user_organization_memberships;
create policy "Users read own memberships" on public.user_organization_memberships for select
    using (user_id = auth.uid() or public.is_role(array['ADMIN']::public.user_role[]));
drop policy if exists "Admins manage memberships" on public.user_organization_memberships;
create policy "Admins manage memberships" on public.user_organization_memberships for all
    using (public.is_role(array['ADMIN']::public.user_role[]))
    with check (public.is_role(array['ADMIN']::public.user_role[]));

create or replace function public.default_organization_id()
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
    v_org_id uuid;
begin
    select id into v_org_id from public.organizations order by created_at asc limit 1;
    if v_org_id is null then
        insert into public.organizations (name) values ('Default Organization')
        returning id into v_org_id;
    end if;
    return v_org_id;
end;
$$;

create or replace function public.current_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
    select org_id from public.user_organization_memberships where user_id = auth.uid()
$$;

create or replace function public.bootstrap_default_organization()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_org_id uuid;
begin
    v_org_id := public.default_organization_id();

    insert into public.user_organization_memberships (user_id, org_id)
    select u.id, v_org_id
    from public.users u
    on conflict (user_id, org_id) do nothing;
end;
$$;

create or replace function public.auto_enroll_default_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_org_count integer;
begin
    select count(*) into v_org_count from public.organizations;
    if v_org_count = 1 then
        insert into public.user_organization_memberships (user_id, org_id)
        select new.id, o.id from public.organizations o
        on conflict (user_id, org_id) do nothing;
    end if;
    return new;
end;
$$;

drop trigger if exists tr_auto_enroll_default_organization on public.users;
create trigger tr_auto_enroll_default_organization
    after insert on public.users
    for each row execute function public.auto_enroll_default_organization();

-- ---------------------------------------------------------------------------
-- 3. CUSTOMERS (the people devices are leased to — not internal staff)
-- ---------------------------------------------------------------------------

create table if not exists public.customers (
    id uuid default uuid_generate_v4() primary key,
    organization_id uuid not null references public.organizations(id) default public.default_organization_id(),
    name text not null,
    phone text,
    email text,
    id_number text,
    address text,
    created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.customers enable row level security;

create index if not exists customers_organization_id_idx on public.customers (organization_id);
create index if not exists customers_email_idx on public.customers (email) where email is not null;
create index if not exists customers_phone_idx on public.customers (phone) where phone is not null;

drop policy if exists "Org members read customers" on public.customers;
create policy "Org members read customers" on public.customers for select
    using (organization_id in (select public.current_org_ids()));
drop policy if exists "Org admins and staff manage customers" on public.customers;
create policy "Org admins and staff manage customers" on public.customers for all
    using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF']::public.user_role[]))
    with check (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF']::public.user_role[]));

-- ---------------------------------------------------------------------------
-- 4. COMPUTERS (the leased devices themselves — one row per physical unit)
-- Same identity model as dube-man-system: a human-assigned `computer_code`
-- is what the field agent authenticates itself as, so it can register and
-- heartbeat with no login of its own (see agent_schema.sql-equivalent anon
-- grants below). `computer_code` stays globally unique across every tenant
-- for the same reason as dube-man-system — the anon-key agent has no
-- organization context of its own to disambiguate a collision.
-- ---------------------------------------------------------------------------

create table if not exists public.computers (
    id uuid default uuid_generate_v4() primary key,
    organization_id uuid not null references public.organizations(id) default public.default_organization_id(),
    computer_name text not null,
    computer_code text not null unique,
    hostname text,
    ip_address text,
    cpu_usage numeric(5,2),
    ram_usage numeric(5,2),
    disk_usage numeric(5,2),
    last_seen timestamptz default timezone('utc'::text, now()),
    created_at timestamptz default timezone('utc'::text, now()) not null,
    unique (organization_id, computer_name)
);

alter table public.computers enable row level security;

create index if not exists computers_organization_id_idx on public.computers (organization_id);

drop policy if exists "Org members read computers" on public.computers;
create policy "Org members read computers" on public.computers for select
    using (organization_id in (select public.current_org_ids()));
drop policy if exists "Org admins and staff manage computers" on public.computers;
create policy "Org admins and staff manage computers" on public.computers for all
    using (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF']::public.user_role[]))
    with check (organization_id in (select public.current_org_ids()) and public.is_role(array['ADMIN','STAFF']::public.user_role[]));

-- ---------------------------------------------------------------------------
-- 5. COMPUTER_COMMANDS (remote command queue — LOCK / UNLOCK / REFRESH here;
--    WIPE is added by the migration once its safety constraints are in place)
-- ---------------------------------------------------------------------------

create table if not exists public.computer_commands (
    id uuid default uuid_generate_v4() primary key,
    computer_code text not null,
    command text not null check (command in ('LOCK','UNLOCK','REFRESH')),
    payload jsonb,
    status text not null default 'PENDING' check (status in ('PENDING','COMPLETED','FAILED')),
    created_at timestamptz default timezone('utc', now()) not null,
    completed_at timestamptz
);

alter table public.computer_commands enable row level security;
create index if not exists computer_commands_code_status_idx on public.computer_commands (computer_code, status);

drop policy if exists "Staff manage computer commands" on public.computer_commands;
create policy "Staff manage computer commands" on public.computer_commands for all
    using (public.is_role(array['ADMIN','STAFF']::public.user_role[]))
    with check (public.is_role(array['ADMIN','STAFF']::public.user_role[]));

-- ---------------------------------------------------------------------------
-- 6. AGENT (anon / publishable key) ACCESS
-- Same MVP posture as dube-man-system's agent_schema.sql: the field agent
-- authenticates with the project's public anon key. That key is public (it
-- ships inside the installed agent), so these policies grant `anon` ONLY
-- the narrow operations the agent needs. See docs/CONSENT-AND-LEGAL.md for
-- why this posture needs a hardening pass (per-device signed tokens) before
-- this is used to lock/wipe devices belonging to people outside the org.
-- ---------------------------------------------------------------------------

grant select, insert, update on public.computers        to anon;
grant select, update          on public.computer_commands to anon;

drop policy if exists "Agent reads computers"    on public.computers;
drop policy if exists "Agent registers computer" on public.computers;
drop policy if exists "Agent updates computer"   on public.computers;
create policy "Agent reads computers"    on public.computers for select to anon using (true);
create policy "Agent registers computer" on public.computers for insert to anon with check (true);
create policy "Agent updates computer"   on public.computers for update to anon using (true) with check (true);

drop policy if exists "Agent reads commands"     on public.computer_commands;
drop policy if exists "Agent completes commands" on public.computer_commands;
create policy "Agent reads commands"     on public.computer_commands for select to anon using (true);
create policy "Agent completes commands" on public.computer_commands for update to anon using (true) with check (true);

do $$ begin
  alter publication supabase_realtime add table public.computer_commands;
exception when duplicate_object then null;
         when undefined_object then null; end $$;

select public.bootstrap_default_organization();

comment on table public.computers is 'One row per leased device. Extended by migrations/001_leasing_theft_prevention.sql with customer linkage, lease/security status, and recovery messaging.';
comment on table public.computer_commands is 'Remote command queue the field agent polls. WIPE is added to the allowed set by the leasing migration.';
