import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { askMfi } from "@/lib/ask-mfi";

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

  try {
    const body = (await request.json()) as {
      question?: unknown;
    };

    const question =
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

    const result = await askMfi(question);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Ask MFI failed:", error);

    return NextResponse.json(
      {
        error:
          "MFI could not complete that analysis. Try a more specific financial question.",
      },
      { status: 500 },
    );
  }
}
