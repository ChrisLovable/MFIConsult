import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "mfi_consult_admin";
const SESSION_SECONDS = 8 * 60 * 60;

interface AdminSession {
  email: string;
  expiresAt: number;
}

function getAdminConfig() {
  const email = process.env.MFI_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.MFI_ADMIN_PASSWORD ?? "";
  const secret = process.env.ADMIN_SESSION_SECRET ?? "";

  if (!email || password.length < 10 || secret.length < 32) {
    throw new Error(
      "MFI admin authentication is not fully configured.",
    );
  }

  return {
    email,
    password,
    secret,
  };
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function encodeSession(session: AdminSession): string {
  const { secret } = getAdminConfig();
  const payload = Buffer.from(
    JSON.stringify(session),
    "utf8",
  ).toString("base64url");

  return `${payload}.${signPayload(payload, secret)}`;
}

function decodeSession(value: string): AdminSession | null {
  const { secret } = getAdminConfig();
  const [payload, signature] = value.split(".");

  if (!payload || !signature) {
    return null;
  }

  const expected = signPayload(payload, secret);

  if (!safeEqual(signature, expected)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as AdminSession;

    if (
      typeof parsed.email !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Date.now()
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function verifyAdminCredentials(
  email: string,
  password: string,
): boolean {
  const config = getAdminConfig();

  return (
    safeEqual(
      email.trim().toLowerCase(),
      config.email,
    ) &&
    safeEqual(password, config.password)
  );
}

export async function createAdminSession(
  email: string,
): Promise<void> {
  const store = await cookies();
  const expiresAt = Date.now() + SESSION_SECONDS * 1000;

  store.set(
    COOKIE_NAME,
    encodeSession({
      email: email.trim().toLowerCase(),
      expiresAt,
    }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_SECONDS,
      path: "/",
    },
  );
}

export async function clearAdminSession(): Promise<void> {
  const store = await cookies();

  store.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}

export async function getAdminSession():
  Promise<AdminSession | null> {
  try {
    const store = await cookies();
    const value = store.get(COOKIE_NAME)?.value;

    return value ? decodeSession(value) : null;
  } catch {
    return null;
  }
}

export async function requireAdminSession():
  Promise<AdminSession> {
  const session = await getAdminSession();

  if (!session) {
    redirect("/admin/login");
  }

  return session;
}
