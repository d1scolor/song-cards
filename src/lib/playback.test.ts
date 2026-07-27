import assert from "node:assert/strict";
import test from "node:test";
import {
  getPlayerStatus,
  playerAction,
  playSong
} from "@/lib/playback";
import type { Song } from "@/lib/types";

const song: Song = {
  id: "test-song",
  title: "Test Song",
  artist: "Test Artist",
  filename: "test.mp3",
  originalName: "test.mp3",
  mimeType: "audio/mpeg",
  coverUrl: "/api/covers/test-song",
  createdAt: new Date(0).toISOString()
};

test("mock playback supports play, pause, resume, stop, and volume", async () => {
  const playing = await playSong(song);
  assert.equal(playing.state, "play");
  assert.equal(playing.song?.title, song.title);
  assert.equal(playing.song?.coverUrl, song.coverUrl);

  const paused = await playerAction({ action: "pause" });
  assert.equal(paused.state, "pause");

  const resumed = await playerAction({ action: "play" });
  assert.equal(resumed.state, "play");

  const volume = await playerAction({ action: "volume", volume: 42 });
  assert.equal(volume.volume, 42);

  const stopped = await playerAction({ action: "stop" });
  assert.equal(stopped.state, "stop");
  assert.equal((await getPlayerStatus()).progressMs, 0);
});
