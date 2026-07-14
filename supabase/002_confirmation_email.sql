alter table public.consultbill_submissions
  add column if not exists confirmed_extraction jsonb;

create table if not exists public.consultbill_email_deliveries (
  id uuid primary key default gen_random_uuid(),

  submission_id uuid not null unique
    references public.consultbill_submissions(id)
    on delete cascade,

  organisation_id uuid not null
    references public.consultbill_organisations(id)
    on delete restrict,

  doctor_id uuid not null
    references public.consultbill_doctors(id)
    on delete restrict,

  recipient text not null,
  subject text not null,

  status text not null default 'queued'
    check (status in ('queued', 'sent', 'failed')),

  smtp_message_id text,
  accepted_recipients jsonb not null default '[]'::jsonb,
  rejected_recipients jsonb not null default '[]'::jsonb,

  error_message text,
  sent_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists
  consultbill_email_deliveries_status_idx
  on public.consultbill_email_deliveries(status);

drop trigger if exists
  consultbill_email_deliveries_updated_at
  on public.consultbill_email_deliveries;

create trigger consultbill_email_deliveries_updated_at
before update on public.consultbill_email_deliveries
for each row execute function public.consultbill_set_updated_at();

alter table public.consultbill_email_deliveries
  enable row level security;

revoke all on public.consultbill_email_deliveries
  from anon, authenticated;

update public.consultbill_organisations
set
  default_accounting_email =
    'chrisdevries.personal@gmail.com',
  updated_at = now()
where slug = 'mfi';
