create extension if not exists pgcrypto;

alter table public.consultbill_doctors
  add column if not exists speciality text,
  add column if not exists email text,
  add column if not exists mobile_number text,
  add column if not exists onboarding_status text not null default 'draft',
  add column if not exists invite_code text,
  add column if not exists invite_created_at timestamptz,
  add column if not exists invite_accepted_at timestamptz,
  add column if not exists billing_profile_version integer not null default 1,
  add column if not exists billing_profile_approved_at timestamptz,
  add column if not exists email_recipient text,
  add column if not exists billing_profile jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists
  consultbill_doctors_invite_code_uidx
  on public.consultbill_doctors(invite_code)
  where invite_code is not null;

create index if not exists
  consultbill_doctors_org_name_idx
  on public.consultbill_doctors(
    organisation_id,
    full_name
  );

create index if not exists
  consultbill_doctors_onboarding_status_idx
  on public.consultbill_doctors(onboarding_status);

create or replace function public.consultbill_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists
  consultbill_doctors_set_updated_at
  on public.consultbill_doctors;

create trigger consultbill_doctors_set_updated_at
before update on public.consultbill_doctors
for each row
execute function public.consultbill_set_updated_at();

update public.consultbill_doctors
set onboarding_status =
  case
    when telegram_user_id is not null then 'active'
    when invite_code is not null then 'invited'
    else 'draft'
  end
where onboarding_status is null
   or onboarding_status = '';

create table if not exists public.consultbill_admin_audit (
  id uuid primary key default gen_random_uuid(),

  organisation_id uuid not null
    references public.consultbill_organisations(id)
    on delete cascade,

  actor_email text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists
  consultbill_admin_audit_org_created_idx
  on public.consultbill_admin_audit(
    organisation_id,
    created_at desc
  );

alter table public.consultbill_admin_audit
  enable row level security;

revoke all on public.consultbill_admin_audit
  from anon, authenticated;
