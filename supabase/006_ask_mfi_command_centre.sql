-- MFI Consult
-- Release 1: Ask MFI conversational intelligence foundation
-- Creates saved threads, messages, and read-only query audit history.

create extension if not exists pgcrypto;

create table if not exists public.consultbill_ask_threads (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'New MFI analysis',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.consultbill_ask_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null
    references public.consultbill_ask_threads(id)
    on delete cascade,
  role text not null
    check (role in ('user', 'assistant')),
  content text not null,
  plan jsonb,
  result_rows jsonb,
  totals jsonb,
  verification text,
  created_at timestamptz not null default now()
);

create table if not exists public.consultbill_ask_audit (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid
    references public.consultbill_ask_threads(id)
    on delete set null,
  question text not null,
  intent text,
  date_from date,
  date_to date,
  threshold numeric(14,2),
  result_count integer not null default 0,
  status text not null
    check (status in ('completed', 'failed')),
  duration_ms integer,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists consultbill_ask_threads_updated_idx
  on public.consultbill_ask_threads(updated_at desc);

create index if not exists consultbill_ask_messages_thread_created_idx
  on public.consultbill_ask_messages(thread_id, created_at);

create index if not exists consultbill_ask_audit_created_idx
  on public.consultbill_ask_audit(created_at desc);

create index if not exists consultbill_ask_audit_thread_idx
  on public.consultbill_ask_audit(thread_id, created_at desc);

alter table public.consultbill_ask_threads enable row level security;
alter table public.consultbill_ask_messages enable row level security;
alter table public.consultbill_ask_audit enable row level security;

comment on table public.consultbill_ask_threads is
  'MFI staff-only saved Ask MFI conversations. Accessed through the server service role.';

comment on table public.consultbill_ask_messages is
  'Questions and verified Ask MFI answers, including supporting evidence.';

comment on table public.consultbill_ask_audit is
  'Immutable read-only analysis audit trail. No unrestricted SQL is stored or executed.';

select
  to_regclass('public.consultbill_ask_threads') as ask_threads,
  to_regclass('public.consultbill_ask_messages') as ask_messages,
  to_regclass('public.consultbill_ask_audit') as ask_audit;
