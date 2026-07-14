const webhookUrl =
  "https://mfi-consult.vercel.app/api/telegram/webhook";

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token || !secret) {
  console.error("Missing Telegram production environment variables.");
  process.exit(1);
}

const setResponse = await fetch(
  `https://api.telegram.org/bot${token}/setWebhook`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    }),
  },
);

const setResult = await setResponse.json();

console.log("\nSET WEBHOOK RESULT");
console.log(JSON.stringify(setResult, null, 2));

if (!setResponse.ok || !setResult.ok) {
  process.exit(1);
}

const infoResponse = await fetch(
  `https://api.telegram.org/bot${token}/getWebhookInfo`,
);

const infoResult = await infoResponse.json();

console.log("\nWEBHOOK INFO");
console.log(
  JSON.stringify(
    {
      ok: infoResult.ok,
      url: infoResult.result?.url,
      pending_update_count:
        infoResult.result?.pending_update_count,
      last_error_message:
        infoResult.result?.last_error_message ?? null,
      allowed_updates:
        infoResult.result?.allowed_updates,
    },
    null,
    2,
  ),
);
