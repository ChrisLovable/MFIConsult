import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import {
  getAskMessages,
  getAskThread,
  validAskThreadId,
} from "@/lib/ask-mfi-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  const session = await requireAdminSession();

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorised." },
      { status: 401 },
    );
  }

  try {
    const { id } = await context.params;

    if (!validAskThreadId(id)) {
      return NextResponse.json(
        { error: "Invalid conversation." },
        { status: 400 },
      );
    }

    const thread = await getAskThread(id);

    if (!thread) {
      return NextResponse.json(
        { error: "Conversation not found." },
        { status: 404 },
      );
    }

    const messages = await getAskMessages(id);

    return NextResponse.json({
      thread,
      messages,
    });
  } catch (error) {
    console.error("Ask MFI thread read failed:", error);

    return NextResponse.json(
      { error: "The conversation could not be loaded." },
      { status: 500 },
    );
  }
}
