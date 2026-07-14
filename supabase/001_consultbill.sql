create extension if not exists pgcrypto;

create table if not exists public.consultbill_organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  default_accounting_email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.consultbill_doctors (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null
    references public.consultbill_organisations(id)
    on delete cascade,

  full_name text not null,
  practice_name text,
  practice_number text,

  telegram_user_id bigint unique,
  telegram_username text,

  email_recipient text,
  billing_profile jsonb not null default '{}'::jsonb,

  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.consultbill_submissions (
  id uuid primary key default gen_random_uuid(),

  reference text not null unique default (
    'CB-' ||
    to_char(now(), 'YYYYMMDD') ||
    '-' ||
    upper(
      substr(
        replace(gen_random_uuid()::text, '-', ''),
        1,
        8
      )
    )
  ),

  organisation_id uuid not null
    references public.consultbill_organisations(id)
    on delete restrict,

  doctor_id uuid not null
    references public.consultbill_doctors(id)
    on delete restrict,

  telegram_update_id bigint not null unique,
  telegram_chat_id bigint not null,
  telegram_message_id bigint not null,

  telegram_file_id text not null,
  telegram_file_unique_id text not null,

  audio_duration_seconds integer,
  audio_mime_type text,
  audio_size_bytes bigint,

  transcript text,
  extraction jsonb,
  billing_calculation jsonb,

  status text not null default 'received'
    check (
      status in (
        'received',
        'transcribing',
        'extracting',
        'needs_confirmation',
        'confirmed',
        'email_queued',
        'email_sent',
        'failed',
        'cancelled'
      )
    ),

  error_message text,

  doctor_confirmed_at timestamptz,
  email_sent_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (telegram_chat_id, telegram_message_id)
);

create index if not exists consultbill_doctors_organisation_idx
  on public.consultbill_doctors(organisation_id);

create index if not exists consultbill_submissions_doctor_idx
  on public.consultbill_submissions(doctor_id);

create index if not exists consultbill_submissions_status_idx
  on public.consultbill_submissions(status);

create index if not exists consultbill_submissions_created_idx
  on public.consultbill_submissions(created_at desc);

create or replace function public.consultbill_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists consultbill_organisations_updated_at
  on public.consultbill_organisations;

create trigger consultbill_organisations_updated_at
before update on public.consultbill_organisations
for each row execute function public.consultbill_set_updated_at();

drop trigger if exists consultbill_doctors_updated_at
  on public.consultbill_doctors;

create trigger consultbill_doctors_updated_at
before update on public.consultbill_doctors
for each row execute function public.consultbill_set_updated_at();

drop trigger if exists consultbill_submissions_updated_at
  on public.consultbill_submissions;

create trigger consultbill_submissions_updated_at
before update on public.consultbill_submissions
for each row execute function public.consultbill_set_updated_at();

alter table public.consultbill_organisations enable row level security;
alter table public.consultbill_doctors enable row level security;
alter table public.consultbill_submissions enable row level security;

revoke all on public.consultbill_organisations from anon, authenticated;
revoke all on public.consultbill_doctors from anon, authenticated;
revoke all on public.consultbill_submissions from anon, authenticated;
