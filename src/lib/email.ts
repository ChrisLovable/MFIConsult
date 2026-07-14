import nodemailer from "nodemailer";
import { getServerEnv } from "@/lib/env";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) {
    return transporter;
  }

  const env = getServerEnv();

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });

  return transporter;
}

export interface BillingEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;

  csvFilename: string;
  csvContent: string;

  xlsxFilename: string;
  xlsxContent: Buffer;
}

export async function sendBillingEmail(
  input: BillingEmailInput,
): Promise<{
  messageId: string;
  accepted: string[];
  rejected: string[];
}> {
  const env = getServerEnv();

  const result = await getTransporter().sendMail({
    from: env.SMTP_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: [
      {
        filename: input.csvFilename,
        content: Buffer.from(
          `\uFEFF${input.csvContent}`,
          "utf8",
        ),
        contentType: "text/csv; charset=utf-8",
      },
      {
        filename: input.xlsxFilename,
        content: input.xlsxContent,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ],
  });

  return {
    messageId: result.messageId,
    accepted: result.accepted.map(String),
    rejected: result.rejected.map(String),
  };
}
