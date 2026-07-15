import { randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export interface AdminDoctor {
  id: string;
  organisation_id: string;
  full_name: string;
  practice_name: string | null;
  practice_number: string | null;
  speciality: string | null;
  email: string | null;
  mobile_number: string | null;
  telegram_user_id: string | number | null;
  telegram_username: string | null;
  email_recipient: string | null;
  billing_profile: Record<string, unknown> | null;
  billing_profile_version: number;
  onboarding_status: string;
  invite_code: string | null;
  invite_created_at: string | null;
  invite_accepted_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DashboardSubmission {
  id: string;
  reference: string;
  doctor_id: string;
  status: string;
  created_at: string;
  doctorName: string;
}

async function getCount(
  table: string,
  filter?: {
    column: string;
    value: string;
  },
): Promise<number> {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from(table)
    .select("*", {
      count: "exact",
      head: true,
    });

  if (filter) {
    query = query.eq(filter.column, filter.value);
  }

  const { count, error } = await query;

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function getMfiOrganisation() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("consultbill_organisations")
    .select(`
      id,
      name,
      slug,
      default_accounting_email,
      is_active
    `)
    .eq("slug", "mfi")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getAdminDashboardData() {
  const supabase = getSupabaseAdmin();
  const organisation = await getMfiOrganisation();

  const [
    doctorCount,
    activeDoctorCount,
    pendingCount,
    failedCount,
    sentCount,
  ] = await Promise.all([
    getCount("consultbill_doctors", {
      column: "organisation_id",
      value: organisation.id,
    }),
    getCount("consultbill_doctors", {
      column: "is_active",
      value: "true",
    }),
    getCount("consultbill_submissions", {
      column: "status",
      value: "needs_confirmation",
    }),
    getCount("consultbill_submissions", {
      column: "status",
      value: "failed",
    }),
    getCount("consultbill_submissions", {
      column: "status",
      value: "email_sent",
    }),
  ]);

  const { data: submissions, error: submissionError } =
    await supabase
      .from("consultbill_submissions")
      .select(`
        id,
        reference,
        doctor_id,
        status,
        created_at
      `)
      .eq("organisation_id", organisation.id)
      .order("created_at", {
        ascending: false,
      })
      .limit(10);

  if (submissionError) {
    throw submissionError;
  }

  const doctorIds = Array.from(
    new Set(
      (submissions ?? []).map(
        (submission) => submission.doctor_id,
      ),
    ),
  );

  const doctorMap = new Map<string, string>();

  if (doctorIds.length) {
    const { data: doctors, error: doctorError } =
      await supabase
        .from("consultbill_doctors")
        .select("id, full_name")
        .in("id", doctorIds);

    if (doctorError) {
      throw doctorError;
    }

    for (const doctor of doctors ?? []) {
      doctorMap.set(doctor.id, doctor.full_name);
    }
  }

  const recentSubmissions: DashboardSubmission[] =
    (submissions ?? []).map((submission) => ({
      ...submission,
      doctorName:
        doctorMap.get(submission.doctor_id) ??
        "Unknown doctor",
    }));

  return {
    organisation,
    counts: {
      doctors: doctorCount,
      activeDoctors: activeDoctorCount,
      pending: pendingCount,
      failed: failedCount,
      sent: sentCount,
    },
    recentSubmissions,
  };
}

export async function getDoctors():
  Promise<AdminDoctor[]> {
  const supabase = getSupabaseAdmin();
  const organisation = await getMfiOrganisation();

  const { data, error } = await supabase
    .from("consultbill_doctors")
    .select("*")
    .eq("organisation_id", organisation.id)
    .order("full_name", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return (data ?? []) as AdminDoctor[];
}

export async function getDoctor(
  id: string,
): Promise<AdminDoctor | null> {
  const supabase = getSupabaseAdmin();
  const organisation = await getMfiOrganisation();

  const { data, error } = await supabase
    .from("consultbill_doctors")
    .select("*")
    .eq("id", id)
    .eq("organisation_id", organisation.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as AdminDoctor | null;
}

export function createInviteCode(): string {
  return randomBytes(8)
    .toString("hex")
    .toUpperCase();
}
