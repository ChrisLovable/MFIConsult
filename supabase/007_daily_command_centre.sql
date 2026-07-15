-- MFI Consult
-- Release 2: Daily Command Centre

create or replace function public.consultbill_daily_command_centre(
  p_organisation_id uuid,
  p_today date default (timezone('Africa/Johannesburg', now()))::date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := coalesce(p_today, (timezone('Africa/Johannesburg', now()))::date);
  v_yesterday date := v_today - 1;
  v_current_month date := date_trunc('month', v_today)::date;
  v_previous_month date := (date_trunc('month', v_today) - interval '1 month')::date;
  v_previous_compare_end date;
  v_result jsonb;
begin
  if p_organisation_id is null then
    raise exception 'Organisation ID is required.';
  end if;

  v_previous_compare_end := least(
    (v_previous_month + interval '1 month - 1 day')::date,
    v_previous_month + greatest(extract(day from v_today)::integer - 1, 0)
  );

  with
  doctor_stats as (
    select
      count(*)::integer as total,
      count(*) filter (where is_active)::integer as active
    from public.consultbill_doctors
    where organisation_id = p_organisation_id
  ),
  submission_stats as (
    select
      count(*) filter (
        where (timezone('Africa/Johannesburg', created_at))::date = v_today
      )::integer as today,
      count(*) filter (
        where (timezone('Africa/Johannesburg', created_at))::date = v_yesterday
      )::integer as yesterday,
      count(*) filter (
        where status = 'email_sent'
          and financial_status in ('ready_to_invoice', 'not_invoiced')
      )::integer as ready_to_invoice,
      count(*) filter (
        where status in ('failed', 'email_failed')
          or (
            jsonb_typeof(coalesce(extraction -> 'missing_information', '[]'::jsonb)) = 'array'
            and jsonb_array_length(coalesce(extraction -> 'missing_information', '[]'::jsonb)) > 0
          )
      )::integer as needs_review
    from public.consultbill_submissions
    where organisation_id = p_organisation_id
  ),
  invoice_stats as (
    select
      coalesce(sum(total_amount) filter (where invoice_date = v_today), 0)::numeric(14,2) as today,
      coalesce(sum(total_amount) filter (where invoice_date = v_yesterday), 0)::numeric(14,2) as yesterday,
      coalesce(sum(total_amount) filter (where invoice_date between v_current_month and v_today), 0)::numeric(14,2) as current_mtd,
      coalesce(sum(total_amount) filter (where invoice_date between v_previous_month and v_previous_compare_end), 0)::numeric(14,2) as previous_mtd,
      coalesce(sum(balance_due) filter (where balance_due > 0), 0)::numeric(14,2) as outstanding,
      coalesce(sum(balance_due) filter (where balance_due > 0 and due_date < v_today), 0)::numeric(14,2) as overdue,
      coalesce(sum(balance_due) filter (where balance_due > 0 and due_date = v_yesterday), 0)::numeric(14,2) as new_overdue
    from public.consultbill_invoices
    where organisation_id = p_organisation_id
      and status <> 'void'
  ),
  payment_stats as (
    select
      coalesce(sum(amount) filter (where payment_date = v_today and status <> 'reversed'), 0)::numeric(14,2) as today,
      coalesce(sum(amount) filter (where payment_date = v_yesterday and status <> 'reversed'), 0)::numeric(14,2) as yesterday,
      coalesce(sum(amount) filter (where payment_date between v_current_month and v_today and status <> 'reversed'), 0)::numeric(14,2) as current_mtd,
      coalesce(sum(amount) filter (where payment_date between v_previous_month and v_previous_compare_end and status <> 'reversed'), 0)::numeric(14,2) as previous_mtd
    from public.consultbill_payments
    where organisation_id = p_organisation_id
  ),
  top_payers as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.outstanding desc), '[]'::jsonb) as value
    from (
      select
        coalesce(nullif(trim(payer_name), ''), 'Unspecified payer') as payer,
        sum(balance_due)::numeric(14,2) as outstanding,
        count(*)::integer as invoice_count
      from public.consultbill_invoices
      where organisation_id = p_organisation_id
        and status <> 'void'
        and balance_due > 0
      group by 1
      order by outstanding desc
      limit 6
    ) x
  ),
  top_doctors as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.invoiced desc), '[]'::jsonb) as value
    from (
      select
        d.id as doctor_id,
        d.full_name as doctor,
        d.practice_name as practice,
        sum(i.total_amount)::numeric(14,2) as invoiced,
        count(i.id)::integer as invoice_count
      from public.consultbill_invoices i
      join public.consultbill_doctors d on d.id = i.doctor_id
      where i.organisation_id = p_organisation_id
        and i.status <> 'void'
        and i.invoice_date between v_current_month and v_today
      group by d.id, d.full_name, d.practice_name
      order by invoiced desc
      limit 6
    ) x
  ),
  current_values as (
    select doctor_id, sum(total_amount)::numeric(14,2) as amount
    from public.consultbill_invoices
    where organisation_id = p_organisation_id
      and status <> 'void'
      and invoice_date between v_current_month and v_today
    group by doctor_id
  ),
  previous_values as (
    select doctor_id, sum(total_amount)::numeric(14,2) as amount
    from public.consultbill_invoices
    where organisation_id = p_organisation_id
      and status <> 'void'
      and invoice_date between v_previous_month and v_previous_compare_end
    group by doctor_id
  ),
  movements as (
    select coalesce(jsonb_agg(to_jsonb(x) order by abs(x.change_amount) desc), '[]'::jsonb) as value
    from (
      select
        d.id as doctor_id,
        d.full_name as doctor,
        d.practice_name as practice,
        coalesce(c.amount, 0)::numeric(14,2) as current_amount,
        coalesce(p.amount, 0)::numeric(14,2) as previous_amount,
        (coalesce(c.amount, 0) - coalesce(p.amount, 0))::numeric(14,2) as change_amount,
        case
          when coalesce(p.amount, 0) > 0 then round((coalesce(c.amount, 0) - p.amount) / p.amount * 100, 1)
          else null
        end as change_percent
      from public.consultbill_doctors d
      left join current_values c on c.doctor_id = d.id
      left join previous_values p on p.doctor_id = d.id
      where d.organisation_id = p_organisation_id
        and (coalesce(c.amount, 0) > 0 or coalesce(p.amount, 0) > 0)
      order by abs(coalesce(c.amount, 0) - coalesce(p.amount, 0)) desc
      limit 10
    ) x
  ),
  recent_submissions as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) as value
    from (
      select
        s.id,
        s.reference,
        s.doctor_id,
        d.full_name as doctor,
        s.status,
        s.created_at
      from public.consultbill_submissions s
      left join public.consultbill_doctors d on d.id = s.doctor_id
      where s.organisation_id = p_organisation_id
      order by s.created_at desc
      limit 10
    ) x
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'today', v_today,
    'yesterday', v_yesterday,
    'currentMonthStart', v_current_month,
    'previousMonthStart', v_previous_month,
    'previousCompareEnd', v_previous_compare_end,
    'doctors', jsonb_build_object('total', ds.total, 'active', ds.active),
    'submissions', jsonb_build_object(
      'today', ss.today,
      'yesterday', ss.yesterday,
      'readyToInvoice', ss.ready_to_invoice,
      'needsReview', ss.needs_review
    ),
    'invoices', jsonb_build_object(
      'today', isx.today,
      'yesterday', isx.yesterday,
      'currentMtd', isx.current_mtd,
      'previousMtd', isx.previous_mtd
    ),
    'payments', jsonb_build_object(
      'today', ps.today,
      'yesterday', ps.yesterday,
      'currentMtd', ps.current_mtd,
      'previousMtd', ps.previous_mtd
    ),
    'balances', jsonb_build_object(
      'outstanding', isx.outstanding,
      'overdue', isx.overdue,
      'newOverdue', isx.new_overdue
    ),
    'topPayers', tp.value,
    'topDoctors', td.value,
    'doctorMovements', mv.value,
    'recentSubmissions', rs.value
  )
  into v_result
  from doctor_stats ds
  cross join submission_stats ss
  cross join invoice_stats isx
  cross join payment_stats ps
  cross join top_payers tp
  cross join top_doctors td
  cross join movements mv
  cross join recent_submissions rs;

  return v_result;
end;
$$;

revoke all on function public.consultbill_daily_command_centre(uuid, date)
from public, anon, authenticated;

grant execute on function public.consultbill_daily_command_centre(uuid, date)
to service_role;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'consultbill_daily_command_centre';
