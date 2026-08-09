import { type NextRequest, NextResponse } from "next/server";
import {
  adminLoginAllowed,
  adminLoginKey,
  adminCookieName,
  adminSessionMaxAgeSeconds,
  clearAdminLoginFailures,
  createAdminSessionToken,
  isSameOriginAdminRequest,
  recordAdminLoginFailure,
  verifyAdminPassword
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!isSameOriginAdminRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const loginKey = adminLoginKey(request);
  const limit = adminLoginAllowed(loginKey);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      {
        status: 429,
        headers: { "retry-after": String(limit.retryAfterSeconds) }
      }
    );
  }
  const body = (await request.json()) as { password?: unknown };
  if (
    typeof body.password !== "string" ||
    !verifyAdminPassword(body.password)
  ) {
    recordAdminLoginFailure(loginKey);
    return NextResponse.json(
      { error: "Incorrect password." },
      { status: 401 }
    );
  }

  clearAdminLoginFailures(loginKey);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminCookieName, createAdminSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: adminSessionMaxAgeSeconds
  });
  return response;
}
