import assert from "node:assert/strict";
import test from "node:test";
import { validateYouTubeUrl, YouTubeUrlError } from "@/lib/ytdlp";

test("accepts public HTTPS YouTube video URLs", () => {
  assert.equal(
    validateYouTubeUrl("https://www.youtube.com/watch?v=BaW_jenozKc"),
    "https://www.youtube.com/watch?v=BaW_jenozKc"
  );
  assert.equal(
    validateYouTubeUrl("https://youtu.be/BaW_jenozKc"),
    "https://youtu.be/BaW_jenozKc"
  );
});

test("rejects non-YouTube, insecure, and credential-bearing URLs", () => {
  for (const url of [
    "https://example.com/watch?v=BaW_jenozKc",
    "https://notyoutube.com/watch?v=BaW_jenozKc",
    "http://youtube.com/watch?v=BaW_jenozKc",
    "https://user:password@youtube.com/watch?v=BaW_jenozKc"
  ]) {
    assert.throws(() => validateYouTubeUrl(url), YouTubeUrlError);
  }
});
