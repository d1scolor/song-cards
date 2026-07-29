import assert from "node:assert/strict";
import test from "node:test";
import { validateYouTubeUrl, YouTubeUrlError } from "@/lib/ytdlp";

test("accepts public HTTPS media URLs", () => {
  assert.equal(
    validateYouTubeUrl("https://www.youtube.com/watch?v=BaW_jenozKc"),
    "https://www.youtube.com/watch?v=BaW_jenozKc"
  );
  assert.equal(
    validateYouTubeUrl("https://youtu.be/BaW_jenozKc"),
    "https://youtu.be/BaW_jenozKc"
  );
  assert.equal(
    validateYouTubeUrl("https://www.bilibili.com/video/BV1xx411c7mD"),
    "https://www.bilibili.com/video/BV1xx411c7mD"
  );
});

test("rejects insecure, credential-bearing, and local URLs", () => {
  for (const url of [
    "http://youtube.com/watch?v=BaW_jenozKc",
    "https://user:password@youtube.com/watch?v=BaW_jenozKc",
    "https://localhost/video",
    "https://server.local/video",
    "https://127.0.0.1/video",
    "https://192.168.1.180/video",
    "https://example.com:8443/video"
  ]) {
    assert.throws(() => validateYouTubeUrl(url), YouTubeUrlError);
  }
});
