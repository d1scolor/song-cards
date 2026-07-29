import assert from "node:assert/strict";
import test from "node:test";
import {
  createKioskMediaToken,
  verifyKioskMediaToken
} from "@/lib/auth";

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
