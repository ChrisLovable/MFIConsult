import type { SupabaseClient } from "@supabase/supabase-js";
import type { TelegramUser } from "@/types/telegram";

export function getTelegramStartPayload(
  text: string | undefined,
): string | null {
  if (!text) {
    return null;
  }

  const match = text
    .trim()
    .match(
      /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{6,64})$/i,
    );

  return match?.[1]?.toUpperCase() ?? null;
}

export async function linkDoctorFromInvite(
  supabase: SupabaseClient,
  inviteCode: string,
  telegramUser: TelegramUser,
): Promise<
  | {
      status: "linked";
      fullName: string;
    }
  | {
      status: "invalid";
    }
  | {
      status: "already_used";
      fullName: string;
    }
> {
  const { data: doctor, error } = await supabase
    .from("consultbill_doctors")
    .select(`
      id,
      full_name,
      telegram_user_id,
      is_active
    `)
    .eq("invite_code", inviteCode)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!doctor || !doctor.is_active) {
    return {
      status: "invalid",
    };
  }

  const existingTelegramId =
    doctor.telegram_user_id === null
      ? null
      : String(doctor.telegram_user_id);

  if (
    existingTelegramId &&
    existingTelegramId !== String(telegramUser.id)
  ) {
    return {
      status: "already_used",
      fullName: doctor.full_name,
    };
  }

  const { error: updateError } = await supabase
    .from("consultbill_doctors")
    .update({
      telegram_user_id: String(telegramUser.id),
      telegram_username:
        telegramUser.username ?? null,
      onboarding_status: "active",
      invite_accepted_at: new Date().toISOString(),
    })
    .eq("id", doctor.id);

  if (updateError) {
    throw updateError;
  }

  return {
    status: "linked",
    fullName: doctor.full_name,
  };
}
