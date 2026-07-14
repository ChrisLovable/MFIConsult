import { getServerEnv } from "@/lib/env";

interface ElevenLabsTranscription {
  text?: string;
  language_code?: string;
  language_probability?: number;
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("webm")) return "webm";
  return "audio";
}

export async function transcribeConsultationAudio(
  audio: Buffer,
  mimeType: string,
): Promise<string> {
  const env = getServerEnv();

  if (!audio.length) {
    throw new Error("The downloaded audio file is empty.");
  }

  if (audio.length > 25 * 1024 * 1024) {
    throw new Error("The voice note exceeds the 25 MB pilot limit.");
  }

  const form = new FormData();
  const bytes = new Uint8Array(audio);

  form.append(
    "file",
    new Blob([bytes], { type: mimeType }),
    `consultation.${extensionForMime(mimeType)}`,
  );
  form.append("model_id", "scribe_v2");
  form.append("tag_audio_events", "false");
  form.append("timestamps_granularity", "none");
  form.append("diarize", "false");
  form.append("num_speakers", "1");
  form.append("no_verbatim", "true");

  const response = await fetch(
    "https://api.elevenlabs.io/v1/speech-to-text",
    {
      method: "POST",
      headers: {
        "xi-api-key": env.ELEVENLABS_API_KEY,
      },
      body: form,
      signal: AbortSignal.timeout(45000),
    },
  );

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(
      `ElevenLabs transcription failed: ${response.status} ${raw.slice(0, 500)}`,
    );
  }

  const data = JSON.parse(raw) as ElevenLabsTranscription;
  const transcript = data.text?.trim();

  if (!transcript) {
    throw new Error("ElevenLabs returned an empty transcript.");
  }

  return transcript;
}
