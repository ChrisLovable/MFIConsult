import { NextRequest, NextResponse } from "next/server";
import {
  createAdminSession,
  verifyAdminCredentials,
} from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const formData = await request.formData();

  const email = String(
    formData.get("email") ?? "",
  );
  const password = String(
    formData.get("password") ?? "",
  );

  const rememberMe =
    formData.get("remember_me") === "yes";

  if (!verifyAdminCredentials(email, password)) {
    return NextResponse.redirect(
      new URL("/admin/login?error=1", request.url),
      303,
    );
  }

  await createAdminSession(email, rememberMe);

  return NextResponse.redirect(
    new URL("/admin", request.url),
    303,
  );
}
