import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

export const adminCookieName = "song_cards_admin";
export const adminSessionMaxAgeSeconds = 12 * 60 * 60;

const loginAttemptWindowMs = 15 * 60 * 1_000;
const loginBlockDurationMs = 15 * 60 * 1_000;
const maximumLoginFailures = 5;

type LoginAttempt = {
  failures: number;
  firstFailureAt: number;
  blockedUntil: number;
};

declare global {
  var __songCardsLoginAttempts: Map<string, LoginAttempt> | undefined;
}

const loginAttempts =
  globalThis.__songCardsLoginAttempts ?? new Map<string, LoginAttempt>();
globalThis.__songCardsLoginAttempts = loginAttempts;

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret) {
    if (
      process.env.NODE_ENV === "production" &&
      (secret.length < 32 || secret === "change-this-to-a-long-random-value")
    ) {
      throw new Error(
        "SESSION_SECRET must contain at least 32 characters and must not use the example value."
      );
    }
    return secret;
  }
  if (process.env.NODE_ENV !== "production") return "song-cards-development-only";
  throw new Error("SESSION_SECRET must be configured in production.");
}

function adminPassword() {
  const password = process.env.ADMIN_PASSWORD;
  if (password) {
    if (
      process.env.NODE_ENV === "production" &&
      (password.length < 12 || password === "change-this-password")
    ) {
      throw new Error(
        "ADMIN_PASSWORD must contain at least 12 characters and must not use the example value."
      );
    }
    return password;
  }
  if (process.env.NODE_ENV !== "production") return "admin";
  throw new Error("ADMIN_PASSWORD must be configured in production.");
}

function adminSessionSignature(expires: string, nonce: string) {
  return crypto
    .createHmac("sha256", sessionSecret())
    .update(`song-cards-admin-v2:${expires}:${nonce}`)
    .digest("hex");
}

export function createAdminSessionToken(
  expiresAt = Date.now() + adminSessionMaxAgeSeconds * 1_000
) {
  const expires = String(Math.floor(expiresAt));
  const nonce = crypto.randomBytes(16).toString("hex");
  return `${expires}.${nonce}.${adminSessionSignature(expires, nonce)}`;
}

export function verifyAdminSessionToken(token: string) {
  const [expires, nonce, signature, extra] = token.split(".");
  if (
    extra !== undefined ||
    !/^\d{13}$/.test(expires ?? "") ||
    !/^[a-f0-9]{32}$/.test(nonce ?? "") ||
    !/^[a-f0-9]{64}$/.test(signature ?? "")
  ) {
    return false;
  }
  if (Number.parseInt(expires, 10) < Date.now()) return false;
  return safeEqual(signature, adminSessionSignature(expires, nonce));
}

export function createKioskMediaToken(
  songId: string,
  expiresAt = Date.now() + 2 * 60 * 60 * 1_000
) {
  const expires = Math.floor(expiresAt);
  const signature = crypto
    .createHmac("sha256", sessionSecret())
    .update(`song-cards-kiosk-media:${songId}:${expires}`)
    .digest("hex");
  return `${expires}.${signature}`;
}

export function verifyKioskMediaToken(songId: string, token: string) {
  const separator = token.indexOf(".");
  if (separator < 1) return false;
  const expiresText = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!/^\d{13}$/.test(expiresText) || !/^[a-f0-9]{64}$/.test(signature)) {
    return false;
  }
  const expires = Number.parseInt(expiresText, 10);
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  const expected = crypto
    .createHmac("sha256", sessionSecret())
    .update(`song-cards-kiosk-media:${songId}:${expires}`)
    .digest("hex");
  return safeEqual(signature, expected);
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function verifyAdminPassword(password: string) {
  return safeEqual(password, adminPassword());
}

export function adminLoginKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0];
  return (
    request.headers.get("x-real-ip")?.trim() ||
    forwarded?.trim() ||
    "unknown"
  ).slice(0, 128);
}

export function adminLoginAllowed(key: string, now = Date.now()) {
  const attempt = loginAttempts.get(key);
  if (!attempt) return { allowed: true, retryAfterSeconds: 0 };
  if (
    attempt.blockedUntil <= now &&
    now - attempt.firstFailureAt >= loginAttemptWindowMs
  ) {
    loginAttempts.delete(key);
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (attempt.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((attempt.blockedUntil - now) / 1_000)
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordAdminLoginFailure(key: string, now = Date.now()) {
  const current = loginAttempts.get(key);
  const attempt =
    !current || now - current.firstFailureAt >= loginAttemptWindowMs
      ? { failures: 0, firstFailureAt: now, blockedUntil: 0 }
      : current;
  attempt.failures += 1;
  if (attempt.failures >= maximumLoginFailures) {
    attempt.blockedUntil = now + loginBlockDurationMs;
  }
  loginAttempts.set(key, attempt);
  return adminLoginAllowed(key, now);
}

export function clearAdminLoginFailures(key: string) {
  loginAttempts.delete(key);
}

export function isSameOriginAdminRequest(request: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const origin = request.headers.get("origin");
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const requestHost = forwardedHost || request.headers.get("host");
  if (!origin || !requestHost) return false;
  try {
    return new URL(origin).host === requestHost;
  } catch {
    return false;
  }
}

export function isAdminRequest(request: NextRequest) {
  return (
    isSameOriginAdminRequest(request) &&
    verifyAdminSessionToken(
      request.cookies.get(adminCookieName)?.value ?? ""
    )
  );
}

export async function isAdminPage() {
  const cookieStore = await cookies();
  return verifyAdminSessionToken(
    cookieStore.get(adminCookieName)?.value ?? ""
  );
}
