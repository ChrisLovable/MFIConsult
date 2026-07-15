import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import {
  createAskThread,
  listAskThreads,
} from "@/lib/ask-mfi-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireAdminSession();

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorised." },
      { status: 401 },
    );
  }

  try {
    const threads = await listAskThreads();
    return NextResponse.json({ threads });
  } catch (error) {
    console.error("Ask MFI thread list failed:", error);

    return NextResponse.json(
      { error: "Conversation history could not be loaded." },
      { status: 500 },
    );
  }
}

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
      title?: unknown;
    };

    const title =
      typeof body.title === "string"
        ? body.title.trim()
        : "New MFI analysis";

    const thread = await createAskThread(title);
    return NextResponse.json({ thread }, { status: 201 });
  } catch (error) {
    console.error("Ask MFI thread creation failed:", error);

    return NextResponse.json(
      { error: "A new conversation could not be created." },
      { status: 500 },
    );
  }
}
