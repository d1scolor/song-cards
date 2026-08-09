import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import {
  adminLoginAllowed,
  clearAdminLoginFailures,
  createAdminSessionToken,
  createKioskMediaToken,
  isSameOriginAdminRequest,
  recordAdminLoginFailure,
  verifyAdminSessionToken,
  verifyKioskMediaToken
} from "@/lib/auth";

test("unsafe admin requests must come from the served origin", () => {
  const matching = new NextRequest("https://songs.example.com/api/admin/test", {
    method: "POST",
    headers: {
      host: "songs.example.com",
      origin: "https://songs.example.com"
    }
  });
  const crossOrigin = new NextRequest(
    "https://songs.example.com/api/admin/test",
    {
      method: "POST",
      headers: {
        host: "songs.example.com",
        origin: "https://attacker.example"
      }
    }
  );
  assert.equal(isSameOriginAdminRequest(matching), true);
  assert.equal(isSameOriginAdminRequest(crossOrigin), false);
});

test("admin sessions are random, signed, and expiring", () => {
  const first = createAdminSessionToken(Date.now() + 60_000);
  const second = createAdminSessionToken(Date.now() + 60_000);
  assert.notEqual(first, second);
  assert.equal(verifyAdminSessionToken(first), true);
  const tampered = `${first.slice(0, -1)}${first.endsWith("0") ? "1" : "0"}`;
  assert.equal(verifyAdminSessionToken(tampered), false);
  assert.equal(
    verifyAdminSessionToken(createAdminSessionToken(Date.now() - 1)),
    false
  );
});

test("admin login failures are temporarily rate limited", () => {
  const key = "auth-test-client";
  const now = Date.now();
  clearAdminLoginFailures(key);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    assert.equal(recordAdminLoginFailure(key, now).allowed, true);
  }
  assert.equal(recordAdminLoginFailure(key, now).allowed, false);
  assert.equal(adminLoginAllowed(key, now).allowed, false);
  assert.equal(adminLoginAllowed(key, now + 15 * 60 * 1_000).allowed, true);
  clearAdminLoginFailures(key);
});

test("accepts valid kiosk media tokens only for their song", () => {
  const token = createKioskMediaToken("song-one", Date.now() + 60_000);
  assert.equal(verifyKioskMediaToken("song-one", token), true);
  assert.equal(verifyKioskMediaToken("song-two", token), false);
  const tampered = `${token.slice(0, -1)}${token.endsWith("0") ? "1" : "0"}`;
  assert.equal(
    verifyKioskMediaToken("song-one", tampered),
    false
  );
});

test("rejects expired kiosk media tokens", () => {
  const token = createKioskMediaToken("song-one", Date.now() - 1);
  assert.equal(verifyKioskMediaToken("song-one", token), false);
});
