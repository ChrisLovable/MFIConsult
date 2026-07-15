import {
  cancelLatestBillingDraft,
  confirmLatestBillingDraft,
  isCancellationText,
  isConfirmationText,
} from "@/lib/consultbill-actions";
import { getServerEnv } from "@/lib/env";
import {
  escapeTelegramHtml,
  sendTelegramMessage,
  telegramApi,
} from "@/lib/telegram";
import { transcribeConsultationAudio } from "@/lib/transcription";

interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

interface VoiceDraftResponseInput {
  doctorId: string;
  chatId: number;
  fileId: string;
  mimeType: string | null;
  reference: string;
}

function normalizeResponse(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function classifyResponse(
  transcript: string,
): "confirm" | "cancel" | "unknown" {
  const normalized = normalizeResponse(transcript);

  if (
    isCancellationText(normalized) ||
    /\b(CANCEL|CANCELLED|NO|STOP|REJECT)\b/u.test(normalized)
  ) {
    return "cancel";
  }

  if (
    isConfirmationText(normalized) ||
    /\b(CONFIRM|CONFIRMED|YES|APPROVE|APPROVED|SEND IT|GO AHEAD|PROCEED)\b/u.test(
      normalized,
    )
  ) {
    return "confirm";
  }

  return "unknown";
}

async function downloadTelegramAudio(
  fileId: string,
): Promise<{
  audio: Buffer;
  mimeType: string;
}> {
  const env = getServerEnv();

  const file = await telegramApi<TelegramFile>("getFile", {
    file_id: fileId,
  });

  if (!file.file_path) {
    throw new Error(
      "Telegram returned no downloadable file path for the voice response.",
    );
  }

  const response = await fetch(
    `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`,
    {
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Telegram voice-response download failed: ${response.status}`,
    );
  }

  return {
    audio: Buffer.from(await response.arrayBuffer()),
    mimeType:
      response.headers.get("content-type") || "audio/ogg",
  };
}

export async function processPendingDraftVoiceResponse(
  input: VoiceDraftResponseInput,
): Promise<void> {
  try {
    const downloaded = await downloadTelegramAudio(
      input.fileId,
    );

    const transcript = await transcribeConsultationAudio(
      downloaded.audio,
      input.mimeType || downloaded.mimeType,
      [
        "confirm",
        "confirmed",
        "yes",
        "approve",
        "send it",
        "go ahead",
        "cancel",
        "no",
      ],
    );

    const action = classifyResponse(transcript);

    if (action === "confirm") {
      await sendTelegramMessage(
        input.chatId,
        [
          "<b>Voice confirmation recognised</b>",
          `I heard: <i>${escapeTelegramHtml(transcript)}</i>`,
          "",
          "Preparing the accounting email, CSV, and Excel workbook.",
        ].join("\n"),
      );

      await confirmLatestBillingDraft(
        input.doctorId,
        input.chatId,
      );

      return;
    }

    if (action === "cancel") {
      await sendTelegramMessage(
        input.chatId,
        [
          "<b>Voice cancellation recognised</b>",
          `I heard: <i>${escapeTelegramHtml(transcript)}</i>`,
        ].join("\n"),
      );

      await cancelLatestBillingDraft(
        input.doctorId,
        input.chatId,
      );

      return;
    }

    await sendTelegramMessage(
      input.chatId,
      [
        "<b>Voice response not recognised</b>",
        `I heard: <i>${escapeTelegramHtml(transcript)}</i>`,
        "",
        "Please say only confirm or cancel, or type CONFIRM or CANCEL.",
        `Draft reference: <code>${escapeTelegramHtml(input.reference)}</code>`,
      ].join("\n"),
    );
  } catch (error) {
    console.error(
      "[ConsultBill] Voice draft response failed:",
      error,
    );

    await sendTelegramMessage(
      input.chatId,
      [
        "<b>Voice confirmation could not be processed</b>",
        `Draft reference: <code>${escapeTelegramHtml(input.reference)}</code>`,
        "",
        "The billing draft remains available. Type CONFIRM to continue, or send another short voice note saying confirm.",
      ].join("\n"),
    );
  }
}
