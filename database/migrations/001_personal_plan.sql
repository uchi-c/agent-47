-- Adds a 'personal' plan tier alongside the existing 'business' plan
-- (renamed from 'standard' -- no live org had subscribed yet, so this is a
-- straight rename, not a data migration). Run once against the existing
-- Neon database; database/schema.sql already reflects this for anyone
-- running the schema fresh.

update public.organizations set plan = 'business' where plan = 'standard';

alter table public.organizations drop constraint if exists organizations_plan_check;
alter table public.organizations add constraint organizations_plan_check
    check (plan in ('trial', 'personal', 'business'));
