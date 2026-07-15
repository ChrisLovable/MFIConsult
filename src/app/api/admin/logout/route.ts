import { NextRequest, NextResponse } from "next/server";
import { clearAdminSession } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  await clearAdminSession();

  return NextResponse.redirect(
    new URL("/admin/login", request.url),
    303,
  );
}
