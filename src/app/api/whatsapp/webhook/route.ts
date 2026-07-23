import { NextRequest, NextResponse } from "next/server";

// ============================================================
// WhatsApp Cloud API Webhook Handler
// src/app/api/whatsapp/webhook/route.ts
//
// Handles:
//   GET  — Meta webhook verification (challenge/response)
//   POST — Incoming messages (voice notes, text, images)
//
// After downloading a voice note, hands off to the same
// transcription → extraction → draft-creation pipeline
// used by the Telegram handler.
// ============================================================

const VERIFY_TOKEN = "myaipartner_webhook_2026";       // You choose this — any random string
const ACCESS_TOKEN = "EAAWXdd7B9Y0BSHNH0GwnLwmGKf4bSpu2Yd4fULcfHD2ofdHG9PlbZAsnWT7LOyLa1m5zTBxM9G5oVZCCJkc8esZBs6ZAO6TkOwZAcxyRWZCsu5TJHyNn8tu8d5afol8BS4RZBiuG0LUOkIiE4deZBYgZBhFRM7KbCDAFztNCl0rP79RmJUWP6LTLCZCtiGZAHd0ffZBJDbCBHdVp6NcsnrEJZBrYJIcmOzZCkIPWe4d3WZCxPD1KbM37m8feSBLYM62cGZB7kxsaa6i0ohAYRoorIFMU4CPNWKf16uBZCudK92AZDZD";       // From Meta app dashboard
const GRAPH_API    = "https://graph.facebook.com/v21.0";

// ----------------------------------------------------------
// GET — Meta Webhook Verification
// Meta sends: hub.mode, hub.verify_token, hub.challenge
// We confirm the token matches and echo the challenge back.
// ----------------------------------------------------------
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode      = params.get("hub.mode");
  const token     = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[WhatsApp] Webhook verified");
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn("[WhatsApp] Verification failed — token mismatch");
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ----------------------------------------------------------
// POST — Incoming WhatsApp Messages
// ----------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Meta always wraps in { object: "whatsapp_business_account", entry: [...] }
    if (body.object !== "whatsapp_business_account") {
      return NextResponse.json({ error: "Not a WhatsApp event" }, { status: 400 });
    }

    // Process each entry (usually one)
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "messages") continue;

        const value    = change.value;
        const metadata = value.metadata;                    // { phone_number_id, display_phone_number }
        const contacts = value.contacts ?? [];              // [{ profile: { name }, wa_id }]
        const messages = value.messages ?? [];

        for (const message of messages) {
          const from      = message.from;                   // sender's WhatsApp number (e.g. "27648588748")
          const timestamp = message.timestamp;              // Unix timestamp string
          const msgType   = message.type;                   // "audio", "text", "image", etc.
          const senderName = contacts.find(
            (c: any) => c.wa_id === from
          )?.profile?.name ?? "Unknown";

          console.log(`[WhatsApp] ${msgType} from ${senderName} (${from})`);

          // ---- VOICE NOTE ----
          if (msgType === "audio") {
            const mediaId  = message.audio.id;
            const mimeType = message.audio.mime_type;       // "audio/ogg; codecs=opus"

            // Step 1: Get the download URL from Meta
            const audioBuffer = await downloadWhatsAppMedia(mediaId);

            if (!audioBuffer) {
              console.error("[WhatsApp] Failed to download voice note", mediaId);
              // Optionally send a reply: "Sorry, couldn't process your voice note"
              await sendTextReply(
                metadata.phone_number_id,
                from,
                "Sorry, I couldn't process that voice note. Please try again."
              );
              continue;
            }

            // Step 2: Hand off to the existing transcription + extraction pipeline
            // Import your shared service — adjust the path to match your project:
            //
            //   import { processVoiceNote } from "@/lib/voice-pipeline";
            //   await processVoiceNote({
            //     audioBuffer,
            //     mimeType,
            //     senderPhone: from,
            //     senderName,
            //     timestamp: parseInt(timestamp),
            //     source: "whatsapp",
            //     phoneNumberId: metadata.phone_number_id,  // needed for replies
            //   });
            //
            // For now, log success and send a confirmation:
            console.log(`[WhatsApp] Voice note downloaded: ${audioBuffer.byteLength} bytes`);

            await sendTextReply(
              metadata.phone_number_id,
              from,
              "✅ Voice note received. Processing your billing record now..."
            );

            // TODO: Uncomment and wire up:
            // await processVoiceNote({ audioBuffer, mimeType, senderPhone: from, senderName, timestamp: parseInt(timestamp), source: "whatsapp", phoneNumberId: metadata.phone_number_id });
          }

          // ---- TEXT MESSAGE ----
          else if (msgType === "text") {
            const textBody = message.text.body;
            console.log(`[WhatsApp] Text: "${textBody}"`);

            // Handle text commands if needed (e.g. "status", "help")
            await sendTextReply(
              metadata.phone_number_id,
              from,
              "Thanks for your message. Please send a voice note to create a billing record."
            );
          }

          // ---- OTHER (image, document, etc.) ----
          else {
            console.log(`[WhatsApp] Unhandled message type: ${msgType}`);
          }
        }
      }
    }

    // Always return 200 quickly — Meta retries on non-200
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (error) {
    console.error("[WhatsApp] Webhook error:", error);
    // Still return 200 to prevent Meta from retrying
    return NextResponse.json({ status: "error" }, { status: 200 });
  }
}

// ============================================================
// HELPER: Download media from WhatsApp Cloud API
// Two-step: GET media URL → GET the actual file
// ============================================================
async function downloadWhatsAppMedia(mediaId: string): Promise<Buffer | null> {
  try {
    // Step 1: Get the media URL
    const metaRes = await fetch(`${GRAPH_API}/${mediaId}`, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    });

    if (!metaRes.ok) {
      console.error("[WhatsApp] Media metadata fetch failed:", metaRes.status);
      return null;
    }

    const metaData = await metaRes.json();
    const mediaUrl = metaData.url;

    if (!mediaUrl) {
      console.error("[WhatsApp] No URL in media metadata");
      return null;
    }

    // Step 2: Download the actual audio file
    const fileRes = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    });

    if (!fileRes.ok) {
      console.error("[WhatsApp] Media download failed:", fileRes.status);
      return null;
    }

    const arrayBuffer = await fileRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error("[WhatsApp] Media download error:", error);
    return null;
  }
}

// ============================================================
// HELPER: Send a text reply via WhatsApp Cloud API
// ============================================================
async function sendTextReply(
  phoneNumberId: string,
  to: string,
  text: string
): Promise<void> {
  try {
    const res = await fetch(`${GRAPH_API}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[WhatsApp] Reply failed:", err);
    }
  } catch (error) {
    console.error("[WhatsApp] Reply error:", error);
  }
}
