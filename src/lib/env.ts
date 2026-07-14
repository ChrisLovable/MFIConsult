import { z } from "zod";

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(20),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(24),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(40),

  ELEVENLABS_API_KEY: z.string().min(20),
  ANTHROPIC_API_KEY: z.string().min(20),
  ANTHROPIC_MODEL: z
    .string()
    .min(3)
    .default("claude-haiku-4-5-20251001"),
});

export type ServerEnv = z.infer<typeof envSchema>;

let cachedEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse({
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,

    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,

    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL:
      process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
  });

  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");

    throw new Error(
      `Missing or invalid server environment variables: ${missing}`,
    );
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}
