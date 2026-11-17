import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { encodeVoiceWav, validateVoiceWav } from "@/lib/voice-audio";

const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "song-cards-voice-tests-")
);
process.env.DATA_DIR = directory;
process.env.PLAYBACK_BACKEND = "mock";
const { parseYoutubeResults } = await import("@/lib/voice-youtube");
const { saveVoiceSettings, getVoiceSettings, publicVoiceSettings } =
  await import("@/lib/voice-settings");
const {
  createSongCard,
  createSong,
  cacheVoiceSong,
  findVoiceCachedSong,
  searchVoiceSongs,
  listSongCards,
  nextMarkerId,
  voiceCacheCount,
  findSongById,
  updatePlaybackSettings
} = await import("@/lib/repository");
const { startVoiceJob, findVoiceJob, cancelVoiceJob, playVoiceJob } =
  await import("@/lib/voice-jobs");
const { getPlayerStatus } = await import("@/lib/playback");
const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
  fs.rmSync(directory, { recursive: true, force: true });
});

const defaults = {
  ...getVoiceSettings(),
  enabled: true,
  asrUrl: "https://asr.test/v1/audio/transcriptions",
  asrModel: "test-asr",
  llmUrl: "https://llm.test/v1/chat/completions",
  llmModel: "test-llm"
};

test("voice settings stay opt-in and keys are retained, redacted, and explicitly removable", () => {
  assert.equal(getVoiceSettings().enabled, false);
  const saved = saveVoiceSettings({
    ...defaults,
    asrApiKey: "fixture-asr-key",
    llmApiKey: "fixture-llm-key"
  });
  assert.equal(saved.asrKeyConfigured, true);
  assert.equal(JSON.stringify(saved).includes("fixture-"), false);
  const {
    asrApiKey: _asr,
    llmApiKey: _llm,
    ...withoutKeys
  } = getVoiceSettings();
  assert.equal(_asr, "fixture-asr-key");
  assert.equal(_llm, "fixture-llm-key");
  saveVoiceSettings({ ...withoutKeys, language: "French" });
  assert.equal(getVoiceSettings().asrApiKey, "fixture-asr-key");
  saveVoiceSettings({ ...withoutKeys, asrApiKey: "" });
  assert.equal(publicVoiceSettings().asrKeyConfigured, false);
  assert.throws(() =>
    saveVoiceSettings({
      ...defaults,
      llmUrl: "https://user:password@example.com/api"
    })
  );
});

test("canonical voice recordings are bounded and malformed audio is rejected", () => {
  const samples = new Float32Array(16000).fill(0.1);
  assert.equal(validateVoiceWav(new Uint8Array(encodeVoiceWav(samples))), true);
  assert.equal(
    validateVoiceWav(
      new Uint8Array(encodeVoiceWav(new Float32Array(31 * 16000)))
    ),
    false
  );
  const malformed = new Uint8Array(encodeVoiceWav(samples));
  malformed[24] = 0;
  assert.equal(validateVoiceWav(malformed), false);
  assert.equal(validateVoiceWav(new Uint8Array([1, 2, 3])), false);
});

test("YouTube results exclude playlists, other channels, unknown durations and long or live videos", () => {
  const channel = "UC7EFWpvc1wYuUwrtZ_BLi9A";
  const good = {
    id: "OOk1fNHrKCY",
    title: "Pluto",
    channel: "KLT",
    channel_id: channel,
    duration: 109
  };
  const rows = [
    good,
    { ...good, id: "PLplaylist" },
    { ...good, channel_id: "another" },
    { ...good, duration: null },
    { ...good, duration: 2000 },
    { ...good, is_live: true }
  ];
  assert.equal(
    parseYoutubeResults(
      { entries: rows },
      { preferredChannels: [channel], maxSongSeconds: 600 }
    ).length,
    1
  );
});

test("voice cache is searchable, bounded, and never allocates a marker", () => {
  const firstMarker = nextMarkerId();
  const created = [];
  for (let index = 0; index < 21; index++) {
    const song = createSong({
      title: `Cached Pluto ${index}`,
      artist: "KLT",
      filename: `cached-${index}.m4a`,
      originalName: "cached.m4a",
      mimeType: "audio/mp4",
      coverFilename: null
    });
    cacheVoiceSong(`video-${index}`, song);
    created.push(song);
  }
  assert.equal(voiceCacheCount(), 20);
  assert.equal(nextMarkerId(), firstMarker);
  assert.equal(listSongCards().length, 0);
  assert.equal(findSongById(created[0].id), null);
  assert.equal(findVoiceCachedSong("video-20")?.id, created[20].id);
  assert.ok(searchVoiceSongs("Pluto").length > 0);
});

function mockServices() {
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("asr.test"))
      return Response.json({ text: "Play Pluto" });
    const request = JSON.parse(options!.body as string);
    const last = request.messages.at(-1);
    const name = last.role === "tool" ? "play_result" : "search_library";
    const args =
      last.role === "tool"
        ? { candidateId: JSON.parse(last.content).results[0].candidateId }
        : { query: "Pluto" };
    return Response.json({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "call-1",
                type: "function",
                function: { name, arguments: JSON.stringify(args) }
              }
            ]
          }
        }
      ]
    });
  };
}
async function settled(id: string) {
  for (let turn = 0; turn < 100; turn++) {
    const job = findVoiceJob(id)!;
    if (["ready", "declined", "cancelled", "error"].includes(job.stage))
      return job;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("Voice job did not settle");
}
const recording = () =>
  new File([encodeVoiceWav(new Float32Array(16000))], "request.wav", {
    type: "audio/wav"
  });

test("a prepared voice decision requires a separate single-use playback commit for either target", async () => {
  saveVoiceSettings(defaults);
  mockServices();
  createSongCard({
    title: "Pluto Song",
    artist: "KLT",
    markerId: 1,
    filename: "local-pluto.m4a",
    originalName: "pluto.m4a",
    mimeType: "audio/mp4",
    coverFilename: null,
    durationMs: 109000
  });
  for (const target of ["local", "owntone"] as const) {
    updatePlaybackSettings({ kioskPlaybackTarget: target });
    const job = startVoiceJob(recording());
    assert.equal((await settled(job.id)).stage, "ready");
    const result = await playVoiceJob(job.id);
    assert.equal(result.playbackTarget, target);
    if (target === "local") assert.ok("localPlayback" in result);
    else assert.equal((await getPlayerStatus()).state, "play");
    await assert.rejects(playVoiceJob(job.id));
  }
});

test("cancelled and disabled requests cannot commit playback", async () => {
  saveVoiceSettings(defaults);
  mockServices();
  const job = startVoiceJob(recording());
  await settled(job.id);
  await cancelVoiceJob(job.id);
  assert.equal(findVoiceJob(job.id)?.stage, "cancelled");
  await assert.rejects(playVoiceJob(job.id));
  saveVoiceSettings({ ...defaults, enabled: false });
  assert.throws(() => startVoiceJob(recording()));
});

test("cancelling an in-flight transcription prevents later model calls and releases the job slot", async () => {
  saveVoiceSettings(defaults);
  let release: ((response: Response) => void) | undefined;
  let modelCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes("asr.test")) {
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    }
    modelCalls++;
    throw new Error("Unexpected model request");
  };
  const job = startVoiceJob(recording());
  assert.throws(() => startVoiceJob(recording()));
  await cancelVoiceJob(job.id);
  release!(Response.json({ text: "Play Pluto" }));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(findVoiceJob(job.id)?.stage, "cancelled");
  assert.equal(modelCalls, 0);
  await assert.rejects(playVoiceJob(job.id));
  mockServices();
  const next = startVoiceJob(recording());
  assert.equal((await settled(next.id)).stage, "ready");
  await cancelVoiceJob(next.id);
});

test("voice configuration requires administrator authentication and redacts saved keys over HTTP", async () => {
  const { NextRequest } = await import("next/server");
  const { createAdminSessionToken, adminCookieName } =
    await import("@/lib/auth");
  const { GET, PUT } = await import("@/app/api/admin/settings/voice/route");
  const url = "http://localhost:3000/api/admin/settings/voice";
  assert.equal(GET(new NextRequest(url)).status, 401);
  const cookie = `${adminCookieName}=${createAdminSessionToken()}`;
  assert.equal(
    (
      await PUT(
        new NextRequest(url, { method: "PUT", headers: { cookie }, body: "{}" })
      )
    ).status,
    401
  );
  saveVoiceSettings({ ...defaults, asrApiKey: "fixture-http-secret" });
  const response = GET(new NextRequest(url, { headers: { cookie } }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.settings.asrKeyConfigured, true);
  assert.equal(JSON.stringify(body).includes("fixture-http-secret"), false);
  assert.equal("asrApiKey" in body.settings, false);
});
