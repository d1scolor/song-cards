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
    let results;
    if (last.role === "tool") results = JSON.parse(last.content).results;
    else {
      try {
        results = JSON.parse(last.content).tool_result?.results;
      } catch {
        /* initial transcription */
      }
    }
    if (!results) {
      for (const message of request.messages) {
        try {
          const library = JSON.parse(message.content).localLibrary;
          if (Array.isArray(library)) results = library;
        } catch {
          /* prompts and transcript are plain text */
        }
      }
    }
    const name = results?.length ? "play_result" : "search_library";
    const args = results?.length
      ? { candidateId: results[0].candidateId }
      : { query: "Pluto" };
    return Response.json({
      choices: [
        {
          message: request.response_format
            ? { content: JSON.stringify({ tool: name, arguments: args }) }
            : {
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

test("a prepared voice decision starts playback once and safely replays its commit response for either target", async () => {
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
    const replay = await playVoiceJob(job.id);
    assert.deepEqual(replay, result);
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

test("saved selection behavior supports 50 channels and structured output without losing service keys", () => {
  const channels = Array.from(
    { length: 50 },
    (_, index) => "UC" + String(index).padStart(22, "0")
  );
  saveVoiceSettings({
    ...defaults,
    preferredChannels: channels,
    systemPrompt: "Choose a related astronomy song.",
    asrApiKey: "fixture-config-key"
  });
  const saved = getVoiceSettings();
  assert.equal(saved.preferredChannels.length, 50);
  assert.equal(saved.systemPrompt, "Choose a related astronomy song.");
  assert.equal(saved.outputMode, "json_schema");
  assert.equal(saved.asrApiKey, "fixture-config-key");
});

test("a request cancelled during upload cannot start later as an orphan job", async () => {
  saveVoiceSettings(defaults);
  const id = crypto.randomUUID();
  await cancelVoiceJob(id);
  assert.throws(() => startVoiceJob(recording(), undefined, id), /cancelled/);
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
  const { GET: diagnostics } =
    await import("@/app/api/admin/voice/diagnostics/route");
  assert.equal(diagnostics(new NextRequest(url)).status, 401);
  const activity = await diagnostics(
    new NextRequest(url, { headers: { cookie } })
  ).json();
  assert.ok(activity.requests.length > 0);
  assert.equal(JSON.stringify(activity).includes("fixture-http-secret"), false);
});

test("capture diagnostics reject free-form text and accept only redacted fields", async () => {
  saveVoiceSettings(defaults);
  const { NextRequest } = await import("next/server");
  const { POST } = await import("@/app/api/voice/capture-diagnostics/route");
  const input = {
    requestId: crypto.randomUUID(),
    event: "failed",
    capturePhase: "vad_loading",
    code: "vad_loading_failed",
    errorName: "Error"
  };
  const request = (body: unknown) =>
    new NextRequest("http://localhost:3000/api/voice/capture-diagnostics", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
  assert.equal(
    (await POST(request({ ...input, message: "fixture-not-for-logs" }))).status,
    400
  );
  assert.equal((await POST(request(input))).status, 204);
});

test("service failures preserve their failing stage and status without recording response bodies", async () => {
  saveVoiceSettings(defaults);
  const { recentVoiceDiagnostics } = await import("@/lib/voice-diagnostics");
  const { publicVoiceJob } = await import("@/lib/voice-jobs");
  for (const phase of ["transcription", "selection"] as const) {
    globalThis.fetch = async (url) =>
      phase === "selection" && String(url).includes("asr.test")
        ? Response.json({ text: "private fixture transcript" })
        : new Response("private fixture service response", { status: 503 });
    const job = startVoiceJob(recording());
    const result = await settled(job.id);
    assert.equal(result.stage, "error");
    assert.deepEqual(publicVoiceJob(result).failure, {
      phase,
      code: "service_http_error",
      httpStatus: 503
    });
    const diagnostic = recentVoiceDiagnostics().find(
      (record) => record.request === job.id.slice(0, 8)
    )!;
    assert.equal(diagnostic.events.at(-1)?.event, "failed");
    assert.equal(diagnostic.events.at(-1)?.phase, phase);
    assert.equal(
      JSON.stringify(diagnostic.events).includes("private fixture"), false
    );
    assert.equal(
      diagnostic.transcript,
      phase === "selection" ? "private fixture transcript" : undefined
    );
    assert.equal("transcript" in publicVoiceJob(result), false);
  }
});

test("voice history records playback outcomes per session and confirms device playback only after acknowledgement", async () => {
  saveVoiceSettings(defaults);
  updatePlaybackSettings({ kioskPlaybackTarget: "local" });
  mockServices();
  const { voiceSessionHistory } = await import("@/lib/voice-session");
  const { NextRequest } = await import("next/server");
  const { POST: played } = await import("@/app/api/voice/[jobId]/played/route");
  const sessionId = crypto.randomUUID();
  const job = startVoiceJob(recording(), undefined, undefined, sessionId);
  assert.equal((await settled(job.id)).stage, "ready");
  assert.equal(voiceSessionHistory(sessionId)[0].outcome, "ready");
  await playVoiceJob(job.id);
  assert.equal(voiceSessionHistory(sessionId)[0].outcome, "playback_requested");
  const request = new NextRequest(`http://localhost:3000/api/voice/${job.id}/played`, { method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000" } });
  assert.equal((await played(request, { params: Promise.resolve({ jobId: job.id }) })).status, 204);
  assert.equal(voiceSessionHistory(sessionId)[0].outcome, "playing");
  const fixtureFetch = globalThis.fetch;
  let modelContext = "";
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("llm.test")) modelContext = String(init?.body);
    return fixtureFetch(url, init);
  };
  const next = startVoiceJob(recording(), undefined, undefined, sessionId);
  assert.equal((await settled(next.id)).stage, "ready");
  assert.ok(modelContext.includes("recentRequests"));
  assert.ok(modelContext.includes("Play Pluto"));
  assert.equal(modelContext.includes(job.id), false);
  await cancelVoiceJob(next.id);
  assert.equal(voiceSessionHistory(sessionId).at(-1)?.outcome, "cancelled");
  const other = startVoiceJob(recording(), undefined, undefined, crypto.randomUUID());
  assert.equal((await settled(other.id)).stage, "ready");
  assert.ok(modelContext.includes('recentRequests\\\":[]'));
  await cancelVoiceJob(other.id);
});
