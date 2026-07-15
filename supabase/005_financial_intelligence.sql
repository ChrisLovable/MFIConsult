create extension if not exists pgcrypto;

alter table public.consultbill_submissions
  add column if not exists financial_status text
    not null default 'not_invoiced';

create index if not exists
  consultbill_submissions_doctor_financial_idx
  on public.consultbill_submissions(
    doctor_id,
    financial_status,
    created_at desc
  );

update public.consultbill_submissions
set financial_status = 'ready_to_invoice'
where financial_status = 'not_invoiced'
  and status = 'email_sent';

create table if not exists public.consultbill_invoices (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.consultbill_organisations(id) on delete cascade,
  doctor_id uuid not null references public.consultbill_doctors(id) on delete restrict,
  invoice_number text not null,
  invoice_date date not null default current_date,
  due_date date,
  payer_name text,
  status text not null default 'issued'
    check (status in ('draft','issued','submitted','partially_paid','paid','overdue','rejected','credited','written_off')),
  currency text not null default 'ZAR',
  total_amount numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  balance_due numeric(14,2) not null default 0,
  notes text,
  created_by_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, invoice_number)
);

create index if not exists consultbill_invoices_doctor_date_idx
  on public.consultbill_invoices(doctor_id, invoice_date desc);

create index if not exists consultbill_invoices_status_due_idx
  on public.consultbill_invoices(status, due_date);

create table if not exists public.consultbill_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.consultbill_invoices(id) on delete cascade,
  submission_id uuid references public.consultbill_submissions(id) on delete set null,
  service_date date,
  patient_reference text,
  description text not null,
  tariff_code text,
  quantity numeric(12,2) not null default 1,
  unit_rate numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists consultbill_invoice_lines_submission_idx
  on public.consultbill_invoice_lines(submission_id);

create table if not exists public.consultbill_payments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.consultbill_organisations(id) on delete cascade,
  doctor_id uuid not null references public.consultbill_doctors(id) on delete restrict,
  payment_date date not null default current_date,
  payer_name text,
  reference text,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'ZAR',
  status text not null default 'unallocated'
    check (status in ('unallocated','partially_allocated','allocated','reversed')),
  notes text,
  created_by_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.consultbill_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.consultbill_payments(id) on delete cascade,
  invoice_id uuid not null references public.consultbill_invoices(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (payment_id, invoice_id)
);

create table if not exists public.consultbill_financial_tasks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.consultbill_organisations(id) on delete cascade,
  doctor_id uuid not null references public.consultbill_doctors(id) on delete cascade,
  submission_id uuid references public.consultbill_submissions(id) on delete cascade,
  invoice_id uuid references public.consultbill_invoices(id) on delete cascade,
  task_type text not null,
  title text not null,
  priority text not null default 'normal'
    check (priority in ('low','normal','high','urgent')),
  status text not null default 'open'
    check (status in ('open','in_progress','resolved','dismissed')),
  due_date date,
  assigned_to_email text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create or replace function public.consultbill_invoice_before_write()
returns trigger
language plpgsql
as $$
begin
  new.total_amount = greatest(coalesce(new.total_amount, 0), 0);
  new.amount_paid = greatest(coalesce(new.amount_paid, 0), 0);
  new.balance_due = greatest(new.total_amount - new.amount_paid, 0);
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists consultbill_invoice_before_write_trigger
  on public.consultbill_invoices;

create trigger consultbill_invoice_before_write_trigger
before insert or update on public.consultbill_invoices
for each row execute function public.consultbill_invoice_before_write();

create or replace function public.consultbill_refresh_invoice(p_invoice_id uuid)
returns void
language plpgsql
as $$
declare
  v_paid numeric(14,2);
  v_total numeric(14,2);
  v_due date;
  v_existing_status text;
  v_new_status text;
begin
  select coalesce(sum(a.amount), 0)
  into v_paid
  from public.consultbill_payment_allocations a
  join public.consultbill_payments p on p.id = a.payment_id
  where a.invoice_id = p_invoice_id
    and p.status <> 'reversed';

  select total_amount, due_date, status
  into v_total, v_due, v_existing_status
  from public.consultbill_invoices
  where id = p_invoice_id;

  if not found then
    return;
  end if;

  if v_existing_status in ('credited','written_off','rejected') then
    v_new_status := v_existing_status;
  elsif v_total > 0 and v_paid >= v_total then
    v_new_status := 'paid';
  elsif v_paid > 0 then
    v_new_status := 'partially_paid';
  elsif v_due is not null and v_due < current_date then
    v_new_status := 'overdue';
  elsif v_existing_status = 'draft' then
    v_new_status := 'draft';
  else
    v_new_status := 'issued';
  end if;

  update public.consultbill_invoices
  set amount_paid = v_paid,
      balance_due = greatest(v_total - v_paid, 0),
      status = v_new_status,
      updated_at = now()
  where id = p_invoice_id;

  update public.consultbill_submissions s
  set financial_status =
    case
      when v_total > 0 and v_paid >= v_total then 'paid'
      when v_paid > 0 then 'partially_paid'
      else 'invoiced'
    end
  where s.id in (
    select l.submission_id
    from public.consultbill_invoice_lines l
    where l.invoice_id = p_invoice_id
      and l.submission_id is not null
  );
end;
$$;

create or replace function public.consultbill_refresh_payment(p_payment_id uuid)
returns void
language plpgsql
as $$
declare
  v_allocated numeric(14,2);
  v_amount numeric(14,2);
  v_existing_status text;
  v_new_status text;
begin
  select amount, status
  into v_amount, v_existing_status
  from public.consultbill_payments
  where id = p_payment_id;

  if not found or v_existing_status = 'reversed' then
    return;
  end if;

  select coalesce(sum(amount), 0)
  into v_allocated
  from public.consultbill_payment_allocations
  where payment_id = p_payment_id;

  if v_allocated <= 0 then
    v_new_status := 'unallocated';
  elsif v_allocated >= v_amount then
    v_new_status := 'allocated';
  else
    v_new_status := 'partially_allocated';
  end if;

  update public.consultbill_payments
  set status = v_new_status,
      updated_at = now()
  where id = p_payment_id;
end;
$$;

create or replace function public.consultbill_allocation_after_write()
returns trigger
language plpgsql
as $$
declare
  v_invoice_id uuid;
  v_payment_id uuid;
begin
  v_invoice_id := coalesce(new.invoice_id, old.invoice_id);
  v_payment_id := coalesce(new.payment_id, old.payment_id);
  perform public.consultbill_refresh_invoice(v_invoice_id);
  perform public.consultbill_refresh_payment(v_payment_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists consultbill_allocation_after_write_trigger
  on public.consultbill_payment_allocations;

create trigger consultbill_allocation_after_write_trigger
after insert or update or delete on public.consultbill_payment_allocations
for each row execute function public.consultbill_allocation_after_write();

alter table public.consultbill_invoices enable row level security;
alter table public.consultbill_invoice_lines enable row level security;
alter table public.consultbill_payments enable row level security;
alter table public.consultbill_payment_allocations enable row level security;
alter table public.consultbill_financial_tasks enable row level security;

revoke all on public.consultbill_invoices from anon, authenticated;
revoke all on public.consultbill_invoice_lines from anon, authenticated;
revoke all on public.consultbill_payments from anon, authenticated;
revoke all on public.consultbill_payment_allocations from anon, authenticated;
revoke all on public.consultbill_financial_tasks from anon, authenticated;
