const { loadEnvConfig } = require("@next/env");

loadEnvConfig(process.cwd(), true);

const required = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "ELEVENLABS_API_KEY",
  "ANTHROPIC_API_KEY",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "ACCOUNTING_EMAIL",
  "MFI_ADMIN_EMAIL",
  "MFI_ADMIN_PASSWORD",
  "ADMIN_SESSION_SECRET",
];

for (const name of required) {
  const value = process.env[name];

  console.log(
    `${value && value.trim() ? "OK     " : "MISSING"} ${name}`
  );
}
