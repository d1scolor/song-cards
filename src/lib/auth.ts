import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

export const adminCookieName = "song_cards_admin";

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "song-cards-development-only";
  throw new Error("SESSION_SECRET must be configured in production.");
}

function adminPassword() {
  const password = process.env.ADMIN_PASSWORD;
  if (password) return password;
  if (process.env.NODE_ENV !== "production") return "admin";
  throw new Error("ADMIN_PASSWORD must be configured in production.");
}

export function expectedSessionToken() {
  return crypto
    .createHmac("sha256", sessionSecret())
    .update("song-cards-admin-v1")
    .digest("hex");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function verifyAdminPassword(password: string) {
  return safeEqual(password, adminPassword());
}

export function isAdminRequest(request: NextRequest) {
  return safeEqual(
    request.cookies.get(adminCookieName)?.value ?? "",
    expectedSessionToken()
  );
}

export async function isAdminPage() {
  const cookieStore = await cookies();
  return safeEqual(
    cookieStore.get(adminCookieName)?.value ?? "",
    expectedSessionToken()
  );
}
