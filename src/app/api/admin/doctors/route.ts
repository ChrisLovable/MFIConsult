import { NextRequest, NextResponse } from "next/server";
import {
  requireAdminSession,
} from "@/lib/admin-auth";
import {
  createInviteCode,
  getMfiOrganisation,
} from "@/lib/admin-data";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function text(
  formData: FormData,
  name: string,
): string {
  return String(formData.get(name) ?? "").trim();
}

function optionalText(
  formData: FormData,
  name: string,
): string | null {
  const value = text(formData, name);
  return value || null;
}

function optionalNumber(
  formData: FormData,
  name: string,
): number | null {
  const value = text(formData, name);

  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildBillingProfile(formData: FormData) {
  const services = [
    {
      name: text(formData, "service_1_name"),
      tariff_code: text(
        formData,
        "service_1_tariff",
      ),
      rate: optionalNumber(
        formData,
        "service_1_rate",
      ),
    },
    {
      name: text(formData, "service_2_name"),
      tariff_code: text(
        formData,
        "service_2_tariff",
      ),
      rate: optionalNumber(
        formData,
        "service_2_rate",
      ),
    },
    {
      name: text(formData, "service_3_name"),
      tariff_code: text(
        formData,
        "service_3_tariff",
      ),
      rate: optionalNumber(
        formData,
        "service_3_rate",
      ),
    },
  ].filter(
    (service) =>
      service.name ||
      service.tariff_code ||
      service.rate !== null,
  );

  return {
    billing_basis:
      text(formData, "billing_basis") ||
      "per_consultation",
    currency: "ZAR",
    requires_confirmation: true,
    default_place_of_service: optionalText(
      formData,
      "default_place_of_service",
    ),
    required_fields: formData
      .getAll("required_fields")
      .map(String),
    hourly: {
      rate: optionalNumber(
        formData,
        "hourly_rate",
      ),
      minimum_minutes: optionalNumber(
        formData,
        "minimum_minutes",
      ),
      increment_minutes: optionalNumber(
        formData,
        "increment_minutes",
      ),
      rounding:
        text(formData, "rounding") || "up",
    },
    services,
    time_rules: {
      after_hours_start: optionalText(
        formData,
        "after_hours_start",
      ),
      after_hours_end: optionalText(
        formData,
        "after_hours_end",
      ),
      after_hours_markup_percent:
        optionalNumber(
          formData,
          "after_hours_markup_percent",
        ),
      weekend_markup_percent:
        optionalNumber(
          formData,
          "weekend_markup_percent",
        ),
    },
    transcription_keyterms: text(
      formData,
      "transcription_keyterms",
    )
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

export async function POST(request: NextRequest) {
  const session = await requireAdminSession();
  const formData = await request.formData();

  const fullName = text(formData, "full_name");

  if (!fullName) {
    return NextResponse.redirect(
      new URL(
        "/admin/doctors/new?error=name",
        request.url,
      ),
      303,
    );
  }

  const organisation = await getMfiOrganisation();
  const supabase = getSupabaseAdmin();
  const telegramId = optionalText(
    formData,
    "telegram_user_id",
  );

  const billingProfile =
    buildBillingProfile(formData);

  const { data: doctor, error } = await supabase
    .from("consultbill_doctors")
    .insert({
      organisation_id: organisation.id,
      full_name: fullName,
      practice_name: optionalText(
        formData,
        "practice_name",
      ),
      practice_number: optionalText(
        formData,
        "practice_number",
      ),
      speciality: optionalText(
        formData,
        "speciality",
      ),
      email: optionalText(formData, "email"),
      mobile_number: optionalText(
        formData,
        "mobile_number",
      ),
      telegram_user_id: telegramId,
      email_recipient: optionalText(
        formData,
        "email_recipient",
      ),
      billing_profile: billingProfile,
      billing_profile_version: 1,
      onboarding_status: telegramId
        ? "active"
        : "invited",
      invite_code: createInviteCode(),
      invite_created_at: new Date().toISOString(),
      is_active:
        formData.get("is_active") === "on",
    })
    .select("id")
    .single();

  if (error) {
    console.error(
      "[ConsultBill Admin] Create doctor failed:",
      error,
    );

    return NextResponse.redirect(
      new URL(
        "/admin/doctors/new?error=save",
        request.url,
      ),
      303,
    );
  }

  await supabase
    .from("consultbill_admin_audit")
    .insert({
      organisation_id: organisation.id,
      actor_email: session.email,
      action: "doctor.created",
      entity_type: "doctor",
      entity_id: doctor.id,
      details: {
        full_name: fullName,
      },
    });

  return NextResponse.redirect(
    new URL(
      `/admin/doctors/${doctor.id}?created=1`,
      request.url,
    ),
    303,
  );
}
