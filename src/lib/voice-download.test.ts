import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const directory = await fs.mkdtemp(
  path.join(os.tmpdir(), "song-cards-download-test-")
);
const downloader = path.join(directory, "downloader.cjs");
const probe = path.join(directory, "probe.cjs");
await fs.writeFile(
  downloader,
  `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2026.11.01'); process.exit(0); }
const output = args[args.indexOf('--output') + 1];
const id = new URL(args.at(-1)).searchParams.get('v');
if (args.includes('--dump-single-json')) {
  const counter = require('node:path').join(__dirname, 'inspect-count');
  const count = fs.existsSync(counter) ? Number(fs.readFileSync(counter, 'utf8')) : 0;
  fs.writeFileSync(counter, String(count + 1));
  console.log(JSON.stringify({id,artist:'Recording artist',channel:'Uploader channel',view_count:42,track:'Track',album:'Album'}));
  process.exit(0);
}
if (id !== 'missing0001') fs.writeFileSync(output.replace('%(ext)s', 'm4a'), id === 'badaudio001' ? 'invalid' : 'audio fixture');
if (id === 'changed0001') fs.writeFileSync(output.replace('%(ext)s', 'info.json'), JSON.stringify({id:'different',channel_id:'different',duration:999999,is_live:true}));
`,
  { mode: 0o700 }
);
await fs.writeFile(
  probe,
  `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args.includes('lavfi')) { console.log(JSON.stringify({frames:[]})); process.exit(0); }
try { if (fs.readFileSync(args.at(-1), 'utf8') === 'invalid') process.exit(1); }
catch { process.exit(1); }
console.log(JSON.stringify({format:{duration:'5'},streams:[{codec_name:'aac',codec_type:'audio'}]}));
`,
  { mode: 0o700 }
);
process.env.DATA_DIR = path.join(directory, "data");
process.env.YTDLP_PATH = downloader;
process.env.FFPROBE_PATH = probe;
await fs.mkdir(path.join(directory, "data", "db"), { recursive: true });
const Database = (await import("better-sqlite3")).default;
const legacy = new Database(
  path.join(directory, "data", "db", "song-cards.db")
);
legacy.exec(
  "CREATE TABLE voice_cache (video_id TEXT PRIMARY KEY, song_id TEXT NOT NULL UNIQUE REFERENCES songs(id) ON DELETE CASCADE, last_used_at INTEGER NOT NULL)"
);
legacy.close();
const { prepareVoiceYoutube, inspectVoiceYoutube } =
  await import("@/lib/voice-youtube");
const { getVoiceSettings } = await import("@/lib/voice-settings");
const { VoiceOperationError } = await import("@/lib/voice-errors");
const { voiceCachedSources } = await import("@/lib/repository");
after(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

const candidate = (videoId: string) => ({
  source: "youtube" as const,
  videoId,
  channelId: "UC_fixture_channel",
  title: "Selected song",
  artist: "Selected artist",
  durationMs: 120000
});

test("metadata inspection extracts without downloading and reuses a bounded-age cache", async () => {
  const first = await inspectVoiceYoutube(
    "inspect0001",
    new AbortController().signal
  );
  assert.equal(first.artist, "Recording artist");
  assert.equal(first.channel, "Uploader channel");
  assert.equal(first.viewCount, 42);
  const second = await inspectVoiceYoutube(
    "inspect0001",
    new AbortController().signal
  );
  assert.deepEqual(second, first);
  assert.equal(
    await fs.readFile(path.join(directory, "inspect-count"), "utf8"),
    "1"
  );
});

test("usable downloaded audio proceeds without a metadata sidecar or despite mismatching metadata", async () => {
  for (const videoId of ["nometa00001", "changed0001"]) {
    const phases: string[] = [];
    const song = await prepareVoiceYoutube(
      candidate(videoId),
      getVoiceSettings(),
      new AbortController().signal,
      (phase) => phases.push(phase)
    );
    assert.equal(song.title, "Selected song");
    assert.equal(song.durationMs, 5000);
    assert.equal(voiceCachedSources().get(song.id)?.videoId, videoId);
    assert.equal(
      voiceCachedSources().get(song.id)?.metadata?.artist,
      "Selected artist"
    );
    assert.deepEqual(phases, ["download", "audio_processing"]);
    assert.ok(
      (await fs.stat(path.join(directory, "data", "media", song.filename)))
        .size > 0
    );
  }
});

test("missing or unreadable audio still fails actual media processing", async () => {
  for (const videoId of ["badaudio001", "missing0001"]) {
    await assert.rejects(
      prepareVoiceYoutube(
        candidate(videoId),
        getVoiceSettings(),
        new AbortController().signal
      ),
      (error) =>
        error instanceof VoiceOperationError &&
        error.code === "audio_processing_failed"
    );
  }
});
