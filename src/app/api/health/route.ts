import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "ConsultBill",
    version: "0.2.0",
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
    },
  });
}
