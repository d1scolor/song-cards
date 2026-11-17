import assert from "node:assert/strict";
import { test } from "node:test";
import { youtubeMetadata, modelVoiceMetadata } from "@/lib/voice-metadata";

test("YouTube metadata distinguishes recording artists from uploaders and channels", () => {
  const metadata = youtubeMetadata({
    artist: "Recording artist",
    channel: "Upload channel",
    uploader: "Uploader",
    view_count: 12345,
    track: "Track",
    album: "Album",
    description: "d".repeat(1000),
    url: "https://signed.test/private?token=fixture"
  });
  assert.equal(metadata.artist, "Recording artist");
  assert.equal(metadata.channel, "Upload channel");
  assert.equal(metadata.uploader, "Uploader");
  assert.equal(metadata.viewCount, 12345);
  assert.equal(metadata.description?.length, 600);
  assert.equal(
    JSON.stringify(modelVoiceMetadata(metadata)).includes("signed.test"),
    false
  );
  assert.equal(youtubeMetadata({ channel: "Only a channel" }).artist, "");
  assert.equal(youtubeMetadata({ view_count: undefined }).viewCount, undefined);
  assert.equal(youtubeMetadata({ view_count: 0 }).viewCount, 0);
  assert.equal(youtubeMetadata({ view_count: NaN }).viewCount, undefined);
  assert.equal(youtubeMetadata({ artists: ["One", "Two"] }).artist, "One, Two");
});
