import { NextResponse } from "next/server";
import {
  adminCookieName,
  expectedSessionToken,
  verifyAdminPassword
} from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json()) as { password?: unknown };
  if (
    typeof body.password !== "string" ||
    !verifyAdminPassword(body.password)
  ) {
    return NextResponse.json(
      { error: "Incorrect password." },
      { status: 401 }
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminCookieName, expectedSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 12
  });
  return response;
}
