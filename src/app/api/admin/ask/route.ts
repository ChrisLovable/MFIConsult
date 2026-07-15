import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { askMfi } from "@/lib/ask-mfi";
import {
  createAskThread,
  getAskMessages,
  getAskThread,
  saveAskAudit,
  saveAskMessage,
  validAskThreadId,
} from "@/lib/ask-mfi-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireAdminSession();

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorised." },
      { status: 401 },
    );
  }

  const startedAt = Date.now();
  let question = "";
  let threadId: string | null = null;

  try {
    const body = (await request.json()) as {
      question?: unknown;
      threadId?: unknown;
    };

    question =
      typeof body.question === "string"
        ? body.question.trim()
        : "";

    if (question.length < 3) {
      return NextResponse.json(
        { error: "Enter a financial question." },
        { status: 400 },
      );
    }

    if (question.length > 500) {
      return NextResponse.json(
        {
          error:
            "The question is too long. Keep it under 500 characters.",
        },
        { status: 400 },
      );
    }

    if (validAskThreadId(body.threadId)) {
      const existingThread = await getAskThread(body.threadId);

      if (!existingThread) {
        return NextResponse.json(
          { error: "The selected conversation no longer exists." },
          { status: 404 },
        );
      }

      threadId = existingThread.id;
    } else {
      const newThread = await createAskThread(question);
      threadId = newThread.id;
    }

    const priorMessages = await getAskMessages(threadId, 12);

    await saveAskMessage({
      threadId,
      role: "user",
      content: question,
    });

    const conversationContext = priorMessages.length
      ? priorMessages
          .slice(-8)
          .map((message) =>
            `${message.role === "user" ? "MFI staff" : "MFI analyst"}: ${
              message.content
            }`,
          )
          .join("\n")
      : "";

    const analysisQuestion = conversationContext
      ? [
          "Use the saved conversation context to resolve references such as",
          "\"those doctors\", \"them\", \"the previous month\" or \"which of these\".",
          "",
          "Saved conversation:",
          conversationContext,
          "",
          `Current question: ${question}`,
        ].join("\n")
      : question;

    const result = await askMfi(analysisQuestion);

    await saveAskMessage({
      threadId,
      role: "assistant",
      content: result.answer,
      plan: result.plan as unknown as Record<string, unknown>,
      rows: result.rows,
      totals: result.totals,
      verification: result.verification,
    });

    await saveAskAudit({
      threadId,
      question,
      intent: result.plan.intent,
      from: result.plan.from,
      to: result.plan.to,
      threshold: result.plan.threshold,
      resultCount: result.rows.length,
      status: "completed",
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      ...result,
      threadId,
    });
  } catch (error) {
    console.error("Ask MFI failed:", error);

    try {
      if (question) {
        await saveAskAudit({
          threadId,
          question,
          status: "failed",
          durationMs: Date.now() - startedAt,
          errorMessage:
            error instanceof Error ? error.message : String(error),
        });
      }
    } catch (auditError) {
      console.error("Ask MFI audit write failed:", auditError);
    }

    return NextResponse.json(
      {
        error:
          "MFI could not complete that analysis. Try a more specific financial question.",
      },
      { status: 500 },
    );
  }
}
