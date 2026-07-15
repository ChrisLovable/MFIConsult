import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "ConsultBill",
    version: "0.6.0",
    timestamp: new Date().toISOString(),
    configured: {
      telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      webhookSecret: Boolean(
        process.env.TELEGRAM_WEBHOOK_SECRET,
      ),
      supabase: Boolean(
        process.env.SUPABASE_URL &&
          process.env.SUPABASE_SECRET_KEY,
      ),
      transcription: Boolean(
        process.env.ELEVENLABS_API_KEY,
      ),
      extraction: Boolean(
        process.env.ANTHROPIC_API_KEY,
      ),
      email: Boolean(
        process.env.SMTP_HOST &&
          process.env.SMTP_USER &&
          process.env.SMTP_PASS &&
          process.env.SMTP_FROM &&
          process.env.ACCOUNTING_EMAIL,
      ),
      admin: Boolean(
        process.env.MFI_ADMIN_EMAIL &&
          process.env.MFI_ADMIN_PASSWORD &&
          process.env.ADMIN_SESSION_SECRET,
      ),
    },
  });
}

