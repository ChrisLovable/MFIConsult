-- MFI Consult
-- Release 3: Instant draft invoices from received consultation information

create sequence if not exists
  public.consultbill_invoice_number_seq
  start with 1
  increment by 1
  no minvalue
  no maxvalue
  cache 20;

create table if not exists
  public.consultbill_submission_invoice_links (
    submission_id uuid primary key
      references public.consultbill_submissions(id)
      on delete restrict,

    invoice_id uuid not null unique
      references public.consultbill_invoices(id)
      on delete cascade,

    created_at timestamptz not null default now()
  );

create index if not exists
  consultbill_submission_invoice_links_invoice_idx
  on public.consultbill_submission_invoice_links(invoice_id);

insert into public.consultbill_submission_invoice_links (
  submission_id,
  invoice_id
)
select
  ranked.submission_id,
  ranked.invoice_id
from (
  select
    il.submission_id,
    il.invoice_id,
    row_number() over (
      partition by il.submission_id
      order by il.created_at, il.id
    ) as position
  from public.consultbill_invoice_lines il
  where il.submission_id is not null
) ranked
where ranked.position = 1
on conflict do nothing;

alter table
  public.consultbill_submission_invoice_links
enable row level security;

revoke all on
  public.consultbill_submission_invoice_links
from anon, authenticated;

create or replace function
  public.consultbill_safe_numeric(
    p_value text
  )
returns numeric
language plpgsql
immutable
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;

  return regexp_replace(
    p_value,
    '[^0-9.-]',
    '',
    'g'
  )::numeric;
exception
  when others then
    return null;
end;
$$;

create or replace function
  public.consultbill_safe_date(
    p_value text
  )
returns date
language plpgsql
immutable
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;

  return p_value::date;
exception
  when others then
    return null;
end;
$$;

create or replace function
  public.consultbill_create_instant_invoice(
    p_organisation_id uuid,
    p_submission_id uuid,
    p_actor_email text,
    p_due_days integer default 30
  )
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission public.consultbill_submissions%rowtype;
  v_existing_invoice_id uuid;
  v_existing_invoice_number text;

  v_invoice_id uuid;
  v_invoice_number text;
  v_invoice_date date;
  v_due_date date;

  v_extraction jsonb := '{}'::jsonb;
  v_calculation jsonb := '{}'::jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_row jsonb;

  v_service_date date;
  v_patient_reference text;
  v_payer_name text;
  v_description text;
  v_tariff_code text;

  v_quantity numeric(12,2);
  v_unit_rate numeric(14,2);
  v_line_total numeric(14,2);
  v_total numeric(14,2) := 0;
  v_fallback_amount numeric(14,2) := 0;
  v_line_count integer := 0;

  v_tariff_first jsonb;
  v_notes text;
begin
  if p_organisation_id is null
    or p_submission_id is null
    or nullif(btrim(p_actor_email), '') is null
  then
    raise exception 'INVALID_INVOICE_REQUEST';
  end if;

  select s.*
  into v_submission
  from public.consultbill_submissions s
  where s.id = p_submission_id
    and s.organisation_id = p_organisation_id
  for update;

  if not found then
    raise exception 'SUBMISSION_NOT_FOUND';
  end if;

  select
    l.invoice_id,
    i.invoice_number
  into
    v_existing_invoice_id,
    v_existing_invoice_number
  from public.consultbill_submission_invoice_links l
  join public.consultbill_invoices i
    on i.id = l.invoice_id
  where l.submission_id = p_submission_id;

  if found then
    return jsonb_build_object(
      'invoiceId', v_existing_invoice_id,
      'invoiceNumber', v_existing_invoice_number,
      'doctorId', v_submission.doctor_id,
      'alreadyExists', true
    );
  end if;

  if v_submission.status <> 'email_sent'
    or coalesce(
      v_submission.financial_status,
      'not_invoiced'
    ) not in (
      'ready_to_invoice',
      'not_invoiced'
    )
  then
    raise exception 'SUBMISSION_NOT_READY';
  end if;

  v_extraction :=
    coalesce(v_submission.extraction, '{}'::jsonb);

  v_calculation :=
    coalesce(
      v_submission.billing_calculation,
      '{}'::jsonb
    );

  if jsonb_typeof(v_calculation -> 'rows') = 'array' then
    v_rows := v_calculation -> 'rows';
  end if;

  v_invoice_date :=
    (
      timezone(
        'Africa/Johannesburg',
        now()
      )
    )::date;

  v_due_date :=
    v_invoice_date
    + greatest(
        least(coalesce(p_due_days, 30), 365),
        0
      );

  v_service_date :=
    coalesce(
      public.consultbill_safe_date(
        v_extraction ->> 'consultation_date'
      ),
      (
        timezone(
          'Africa/Johannesburg',
          v_submission.created_at
        )
      )::date
    );

  v_patient_reference :=
    nullif(
      btrim(
        coalesce(
          v_extraction ->> 'patient_reference',
          ''
        )
      ),
      ''
    );

  v_payer_name :=
    nullif(
      btrim(
        coalesce(
          v_extraction ->> 'medical_aid',
          v_calculation ->> 'payer_name',
          ''
        )
      ),
      ''
    );

  v_tariff_first :=
    case
      when jsonb_typeof(
        v_extraction -> 'tariff_codes'
      ) = 'array'
      and jsonb_array_length(
        v_extraction -> 'tariff_codes'
      ) > 0
      then (v_extraction -> 'tariff_codes') -> 0
      else null
    end;

  v_tariff_code :=
    nullif(
      btrim(
        coalesce(
          case
            when jsonb_typeof(v_tariff_first) = 'object'
            then coalesce(
              v_tariff_first ->> 'code',
              v_tariff_first ->> 'tariff_code',
              v_tariff_first ->> 'value'
            )
            when jsonb_typeof(v_tariff_first) = 'string'
            then trim(
              both '"'
              from v_tariff_first::text
            )
            else null
          end,
          v_extraction ->> 'tariff_code',
          ''
        )
      ),
      ''
    );

  v_description :=
    nullif(
      btrim(
        coalesce(
          v_extraction ->> 'consultation_type',
          v_extraction ->> 'consultation',
          case
            when jsonb_typeof(
              v_extraction -> 'procedures'
            ) = 'array'
            and jsonb_array_length(
              v_extraction -> 'procedures'
            ) > 0
            then trim(
              both '"'
              from (
                (v_extraction -> 'procedures') -> 0
              )::text
            )
            else null
          end,
          'Consultation'
        )
      ),
      ''
    );

  v_invoice_number :=
    'MFI-'
    || to_char(v_invoice_date, 'YYYY')
    || '-'
    || lpad(
      nextval(
        'public.consultbill_invoice_number_seq'
      )::text,
      6,
      '0'
    );

  v_notes :=
    'Draft created automatically from submission '
    || v_submission.reference
    || '. Review all details before issuing or sending.';

  insert into public.consultbill_invoices (
    organisation_id,
    doctor_id,
    invoice_number,
    invoice_date,
    due_date,
    payer_name,
    status,
    currency,
    total_amount,
    amount_paid,
    balance_due,
    notes,
    created_by_email
  )
  values (
    p_organisation_id,
    v_submission.doctor_id,
    v_invoice_number,
    v_invoice_date,
    v_due_date,
    v_payer_name,
    'draft',
    'ZAR',
    0,
    0,
    0,
    v_notes,
    lower(btrim(p_actor_email))
  )
  returning id into v_invoice_id;

  insert into
    public.consultbill_submission_invoice_links (
      submission_id,
      invoice_id
    )
  values (
    p_submission_id,
    v_invoice_id
  );

  if jsonb_array_length(v_rows) > 0 then
    for v_row in
      select value
      from jsonb_array_elements(v_rows)
    loop
      v_quantity :=
        coalesce(
          public.consultbill_safe_numeric(
            v_row ->> 'quantity'
          ),
          public.consultbill_safe_numeric(
            v_row ->> 'Quantity'
          ),
          1
        );

      if v_quantity <= 0 then
        v_quantity := 1;
      end if;

      v_unit_rate :=
        coalesce(
          public.consultbill_safe_numeric(
            v_row ->> 'unit_rate'
          ),
          public.consultbill_safe_numeric(
            v_row ->> 'rate'
          ),
          public.consultbill_safe_numeric(
            v_row ->> 'Rate'
          ),
          0
        );

      v_line_total :=
        coalesce(
          public.consultbill_safe_numeric(
            v_row ->> 'line_total'
          ),
          public.consultbill_safe_numeric(
            v_row ->> 'amount'
          ),
          public.consultbill_safe_numeric(
            v_row ->> 'Amount'
          ),
          public.consultbill_safe_numeric(
            v_row ->> 'total'
          ),
          v_quantity * v_unit_rate,
          0
        );

      if v_line_total <= 0
        and v_unit_rate > 0
      then
        v_line_total := v_quantity * v_unit_rate;
      end if;

      if v_line_total <= 0 then
        continue;
      end if;

      if v_unit_rate <= 0 then
        v_unit_rate := v_line_total / v_quantity;
      end if;

      insert into public.consultbill_invoice_lines (
        invoice_id,
        submission_id,
        service_date,
        patient_reference,
        description,
        tariff_code,
        quantity,
        unit_rate,
        line_total,
        metadata
      )
      values (
        v_invoice_id,
        p_submission_id,
        coalesce(
          public.consultbill_safe_date(
            coalesce(
              v_row ->> 'service_date',
              v_row ->> 'date'
            )
          ),
          v_service_date
        ),
        coalesce(
          nullif(
            btrim(
              coalesce(
                v_row ->> 'patient_reference',
                ''
              )
            ),
            ''
          ),
          v_patient_reference
        ),
        coalesce(
          nullif(
            btrim(
              coalesce(
                v_row ->> 'description',
                v_row ->> 'procedure',
                v_row ->> 'Procedure',
                v_row ->> 'service',
                ''
              )
            ),
            ''
          ),
          v_description,
          'Consultation'
        ),
        coalesce(
          nullif(
            btrim(
              coalesce(
                v_row ->> 'tariff_code',
                v_row ->> 'tariffCode',
                v_row ->> 'code',
                v_row ->> 'Code',
                ''
              )
            ),
            ''
          ),
          v_tariff_code
        ),
        v_quantity,
        v_unit_rate,
        v_line_total,
        jsonb_build_object(
          'source',
          'instant_invoice',
          'submission_reference',
          v_submission.reference,
          'source_row',
          v_row
        )
      );

      v_total := v_total + v_line_total;
      v_line_count := v_line_count + 1;
    end loop;
  end if;

  if v_line_count = 0 then
    v_fallback_amount :=
      coalesce(
        public.consultbill_safe_numeric(
          v_calculation ->> 'total_amount'
        ),
        public.consultbill_safe_numeric(
          v_calculation ->> 'grand_total'
        ),
        public.consultbill_safe_numeric(
          v_calculation ->> 'total'
        ),
        public.consultbill_safe_numeric(
          v_calculation ->> 'amount'
        ),
        0
      );

    if v_fallback_amount <= 0 then
      raise exception 'NO_BILLABLE_AMOUNT';
    end if;

    insert into public.consultbill_invoice_lines (
      invoice_id,
      submission_id,
      service_date,
      patient_reference,
      description,
      tariff_code,
      quantity,
      unit_rate,
      line_total,
      metadata
    )
    values (
      v_invoice_id,
      p_submission_id,
      v_service_date,
      v_patient_reference,
      coalesce(v_description, 'Consultation'),
      v_tariff_code,
      1,
      v_fallback_amount,
      v_fallback_amount,
      jsonb_build_object(
        'source',
        'instant_invoice_fallback',
        'submission_reference',
        v_submission.reference
      )
    );

    v_total := v_fallback_amount;
    v_line_count := 1;
  end if;

  update public.consultbill_invoices
  set
    total_amount = v_total,
    amount_paid = 0,
    balance_due = v_total,
    updated_at = now()
  where id = v_invoice_id;

  update public.consultbill_submissions
  set
    financial_status = 'invoiced',
    updated_at = now()
  where id = p_submission_id;

  insert into public.consultbill_admin_audit (
    organisation_id,
    actor_email,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    p_organisation_id,
    lower(btrim(p_actor_email)),
    'invoice.instant_created',
    'invoice',
    v_invoice_id,
    jsonb_build_object(
      'doctor_id',
      v_submission.doctor_id,
      'submission_id',
      p_submission_id,
      'submission_reference',
      v_submission.reference,
      'invoice_number',
      v_invoice_number,
      'total_amount',
      v_total,
      'line_count',
      v_line_count,
      'status',
      'draft'
    )
  );

  return jsonb_build_object(
    'invoiceId', v_invoice_id,
    'invoiceNumber', v_invoice_number,
    'doctorId', v_submission.doctor_id,
    'totalAmount', v_total,
    'lineCount', v_line_count,
    'alreadyExists', false
  );
end;
$$;

revoke all on function
  public.consultbill_create_instant_invoice(
    uuid,
    uuid,
    text,
    integer
  )
from public, anon, authenticated;

grant execute on function
  public.consultbill_create_instant_invoice(
    uuid,
    uuid,
    text,
    integer
  )
to service_role;

revoke all on function
  public.consultbill_safe_numeric(text)
from public, anon, authenticated;

revoke all on function
  public.consultbill_safe_date(text)
from public, anon, authenticated;

grant execute on function
  public.consultbill_safe_numeric(text)
to service_role;

grant execute on function
  public.consultbill_safe_date(text)
to service_role;

select
  routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'consultbill_create_instant_invoice',
    'consultbill_safe_numeric',
    'consultbill_safe_date'
  )
order by routine_name;
