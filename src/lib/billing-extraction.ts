import { z } from "zod";
import { getServerEnv } from "@/lib/env";

const codeSourceSchema = z.enum([
  "doctor_stated",
  "ai_suggested",
]);

const billingCodeSchema = z.object({
  code: z.string(),
  description: z.string(),
  source: codeSourceSchema,
});

export const billingExtractionSchema = z.object({
  patient_reference: z.string().nullable(),
  patient_name: z.string().nullable(),

  consultation_date: z.string().nullable(),
  consultation_time: z.string().nullable(),
  consultation_type: z.string().nullable(),
  duration_minutes: z.number().nullable(),
  place_of_service: z.string().nullable(),

  diagnosis_summary: z.string().nullable(),

  icd10_codes: z.array(billingCodeSchema),
  tariff_codes: z.array(billingCodeSchema),
  procedures: z.array(z.string()),

  medical_aid: z.string().nullable(),
  authorisation_number: z.string().nullable(),
  notes: z.string().nullable(),

  missing_fields: z.array(z.string()),
  warnings: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export type BillingExtraction = z.infer<
  typeof billingExtractionSchema
>;

const BILLING_JSON_SCHEMA = {
  type: "object",
  properties: {
    patient_reference: {
      type: ["string", "null"],
      description:
        "Patient account, file, or billing reference explicitly stated.",
    },
    patient_name: {
      type: ["string", "null"],
      description:
        "Patient name only when explicitly stated.",
    },
    consultation_date: {
      type: ["string", "null"],
      description:
        "Consultation date as YYYY-MM-DD. Resolve relative dates using supplied South African current date.",
    },
    consultation_time: {
      type: ["string", "null"],
      description:
        "Consultation time as HH:MM in 24-hour format.",
    },
    consultation_type: {
      type: ["string", "null"],
      description:
        "Type of consultation, visit, operation, or service explicitly stated.",
    },
    duration_minutes: {
      type: ["number", "null"],
      description:
        "Duration in minutes when explicitly stated or directly calculable from stated start and end times.",
    },
    place_of_service: {
      type: ["string", "null"],
      description:
        "Practice, hospital, theatre, ward, home, or other place explicitly stated.",
    },
    diagnosis_summary: {
      type: ["string", "null"],
      description:
        "Short administrative diagnosis summary. Do not add clinical facts.",
    },
    icd10_codes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string" },
          description: { type: "string" },
          source: {
            type: "string",
            enum: ["doctor_stated", "ai_suggested"],
          },
        },
        required: ["code", "description", "source"],
        additionalProperties: false,
      },
    },
    tariff_codes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string" },
          description: { type: "string" },
          source: {
            type: "string",
            enum: ["doctor_stated", "ai_suggested"],
          },
        },
        required: ["code", "description", "source"],
        additionalProperties: false,
      },
    },
    procedures: {
      type: "array",
      items: { type: "string" },
    },
    medical_aid: {
      type: ["string", "null"],
    },
    authorisation_number: {
      type: ["string", "null"],
    },
    notes: {
      type: ["string", "null"],
      description:
        "Billing-relevant note only. Exclude unnecessary clinical detail.",
    },
    missing_fields: {
      type: "array",
      items: { type: "string" },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
    confidence: {
      type: "number",
      description:
        "Overall extraction confidence from 0 to 1.",
    },
  },
  required: [
    "patient_reference",
    "patient_name",
    "consultation_date",
    "consultation_time",
    "consultation_type",
    "duration_minutes",
    "place_of_service",
    "diagnosis_summary",
    "icd10_codes",
    "tariff_codes",
    "procedures",
    "medical_aid",
    "authorisation_number",
    "notes",
    "missing_fields",
    "warnings",
    "confidence",
  ],
  additionalProperties: false,
} as const;

interface AnthropicResponse {
  content?: Array<{
    type: string;
    text?: string;
  }>;
  stop_reason?: string;
}

function getJohannesburgContext(): string {
  const now = new Date();

  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Johannesburg",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  return `${date} ${time} SAST`;
}

export async function extractBillingDetails(
  transcript: string,
  billingProfile: Record<string, unknown>,
): Promise<BillingExtraction> {
  const env = getServerEnv();

  const response = await fetch(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 1800,
        system: [
          "You extract administrative medical billing information from a doctor's consultation voice-note transcript for a South African accounting workflow.",
          "This is not clinical decision-making.",
          "Extract only information stated in the transcript or directly calculable from it.",
          "Never invent a patient, diagnosis, procedure, tariff code, ICD-10 code, duration, time, or price.",
          "Use null or an empty array when information is absent.",
          "The missing_fields array must contain only configured required_fields from the doctor billing profile that are absent. If required_fields is not configured, require only patient_reference, consultation_date, consultation_type, and duration_minutes.",
          "Preserve every letter and number in dictated ICD-10 and tariff codes. Never silently change I10 to 10. If a code is ambiguous, add a warning.",
          "A code explicitly dictated by the doctor must have source doctor_stated.",
          "A code inferred by you must have source ai_suggested and must also create a warning requiring doctor confirmation.",
          "Keep notes limited to information needed for billing.",
          "The doctor must review this draft before submission.",
        ].join(" "),
        messages: [
          {
            role: "user",
            content: [
              `Current date and time in South Africa: ${getJohannesburgContext()}`,
              "",
              "Doctor billing profile configuration:",
              JSON.stringify(billingProfile),
              "",
              "Consultation voice-note transcript:",
              transcript,
            ].join("\n"),
          },
        ],
        output_config: {
          format: {
            type: "json_schema",
            schema: BILLING_JSON_SCHEMA,
          },
        },
      }),
      signal: AbortSignal.timeout(30000),
    },
  );

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(
      `Anthropic extraction failed: ${response.status} ${raw.slice(0, 500)}`,
    );
  }

  const data = JSON.parse(raw) as AnthropicResponse;

  if (data.stop_reason === "refusal") {
    throw new Error("Anthropic refused the extraction request.");
  }

  if (data.stop_reason === "max_tokens") {
    throw new Error("Anthropic extraction reached its token limit.");
  }

  const text = data.content
    ?.filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Anthropic returned no extraction text.");
  }

  return billingExtractionSchema.parse(JSON.parse(text));
}

