import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CommandError, runCommand } from "@/lib/command";
import { config } from "@/lib/config";
import { coverDirectory, mediaDirectory } from "@/lib/db";
import {
  MediaValidationError,
  storeAudioFile,
  storeCoverBuffer
} from "@/lib/media";
import { triggerOwnToneScan } from "@/lib/playback";
import { createSongCard } from "@/lib/repository";
import type {
  SongCard,
  YouTubeImportJob,
  YtDlpStatus
} from "@/lib/types";

type UpdateRecord = {
  lastCheckedAt?: string;
  lastUpdatedAt?: string;
  message?: string;
};

type DownloadMetadata = {
  artist?: string;
  channel?: string;
  duration?: number;
  id?: string;
  title?: string;
  track?: string;
  uploader?: string;
};

type BinaryInfo = {
  path: string;
  managed: boolean;
  version: string;
  bundledVersion: string | null;
};

export class ImportBusyError extends Error {}
export class YouTubeUrlError extends Error {}

const toolsDirectory = path.join(
  /* turbopackIgnore: true */ config.dataDirectory,
  "db",
  "tools"
);
const activeBinaryPath = path.join(
  /* turbopackIgnore: true */ toolsDirectory,
  "yt-dlp"
);
const updateRecordPath = path.join(
  /* turbopackIgnore: true */ toolsDirectory,
  "yt-dlp-status.json"
);

declare global {
  var __songCardsToolOperation: Promise<unknown> | undefined;
  var __songCardsImportJobs: Map<string, YouTubeImportJob> | undefined;
  var __songCardsActiveImportId: string | undefined;
}

globalThis.__songCardsToolOperation ??= Promise.resolve();
const importJobs =
  globalThis.__songCardsImportJobs ?? new Map<string, YouTubeImportJob>();
globalThis.__songCardsImportJobs = importJobs;

function withToolLock<T>(operation: () => Promise<T>) {
  const pending = globalThis.__songCardsToolOperation ?? Promise.resolve();
  const next = pending.then(operation, operation);
  globalThis.__songCardsToolOperation = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

async function fileExists(filename: string) {
  try {
    await fs.access(/* turbopackIgnore: true */ filename);
    return true;
  } catch {
    return false;
  }
}

async function binaryVersion(binaryPath: string) {
  const { stdout } = await runCommand(binaryPath, ["--version"], {
    timeoutMs: 20_000,
    maxOutputCharacters: 2_000
  });
  return stdout.trim().split(/\s+/)[0] ?? "";
}

function versionIsNewer(candidate: string, installed: string) {
  return (
    candidate.localeCompare(installed, undefined, {
      numeric: true,
      sensitivity: "base"
    }) > 0
  );
}

async function readUpdateRecord(): Promise<UpdateRecord> {
  try {
    return JSON.parse(
      await fs.readFile(/* turbopackIgnore: true */ updateRecordPath, "utf8")
    ) as UpdateRecord;
  } catch {
    return {};
  }
}

async function writeUpdateRecord(record: UpdateRecord) {
  await fs.mkdir(toolsDirectory, { recursive: true });
  await fs.writeFile(updateRecordPath, JSON.stringify(record, null, 2), {
    mode: 0o640
  });
}

async function resolveBinary(): Promise<BinaryInfo> {
  if (config.ytDlpPath) {
    return {
      path: config.ytDlpPath,
      managed: false,
      version: await binaryVersion(config.ytDlpPath),
      bundledVersion: null
    };
  }

  await fs.mkdir(toolsDirectory, { recursive: true });
  const bundledAvailable = await fileExists(config.ytDlpBundledPath);
  if (!bundledAvailable) {
    return {
      path: "yt-dlp",
      managed: false,
      version: await binaryVersion("yt-dlp"),
      bundledVersion: null
    };
  }

  const bundledVersion = await binaryVersion(config.ytDlpBundledPath);
  let activeVersion = "";
  if (await fileExists(activeBinaryPath)) {
    try {
      activeVersion = await binaryVersion(activeBinaryPath);
    } catch {
      activeVersion = "";
    }
  }
  if (!activeVersion || versionIsNewer(bundledVersion, activeVersion)) {
    await fs.copyFile(
      /* turbopackIgnore: true */ config.ytDlpBundledPath,
      activeBinaryPath
    );
    await fs.chmod(activeBinaryPath, 0o750);
    activeVersion = bundledVersion;
  }

  return {
    path: activeBinaryPath,
    managed: true,
    version: activeVersion,
    bundledVersion
  };
}

function updateIsDue(record: UpdateRecord) {
  if (!record.lastCheckedAt) return true;
  const checked = Date.parse(record.lastCheckedAt);
  return (
    !Number.isFinite(checked) ||
    Date.now() - checked >= config.ytDlpUpdateIntervalHours * 60 * 60 * 1000
  );
}

async function statusFrom(
  binary: BinaryInfo,
  record: UpdateRecord
): Promise<YtDlpStatus> {
  return {
    available: true,
    managed: binary.managed,
    version: binary.version,
    bundledVersion: binary.bundledVersion,
    autoUpdate: config.ytDlpAutoUpdate && binary.managed,
    updateChannel: config.ytDlpUpdateChannel,
    lastCheckedAt: record.lastCheckedAt ?? null,
    lastUpdatedAt: record.lastUpdatedAt ?? null,
    message:
      record.message ??
      (binary.managed
        ? "The bundled downloader is ready."
        : "This yt-dlp installation is managed outside Song Cards.")
  };
}

async function updateManagedBinary(force: boolean) {
  const binary = await resolveBinary();
  let record = await readUpdateRecord();
  if (
    !binary.managed ||
    (!force && (!config.ytDlpAutoUpdate || !updateIsDue(record)))
  ) {
    return statusFrom(binary, record);
  }

  const checkedAt = new Date().toISOString();
  try {
    await runCommand(
      binary.path,
      ["--update-to", config.ytDlpUpdateChannel],
      { timeoutMs: 120_000, maxOutputCharacters: 16_000 }
    );
    const version = await binaryVersion(binary.path);
    const updated = version !== binary.version;
    record = {
      lastCheckedAt: checkedAt,
      lastUpdatedAt: updated ? checkedAt : record.lastUpdatedAt,
      message: updated
        ? `Updated yt-dlp to ${version}.`
        : `yt-dlp ${version} is current.`
    };
    await writeUpdateRecord(record);
    return statusFrom({ ...binary, version }, record);
  } catch {
    record = {
      ...record,
      lastCheckedAt: checkedAt,
      message: `Update check failed; continuing with yt-dlp ${binary.version}.`
    };
    await writeUpdateRecord(record);
    return statusFrom(binary, record);
  }
}

export function getYtDlpStatus(checkForUpdates = true) {
  return withToolLock(async () => {
    try {
      return checkForUpdates
        ? await updateManagedBinary(false)
        : await statusFrom(await resolveBinary(), await readUpdateRecord());
    } catch (error) {
      return {
        available: false,
        managed: false,
        version: null,
        bundledVersion: null,
        autoUpdate: false,
        updateChannel: config.ytDlpUpdateChannel,
        lastCheckedAt: null,
        lastUpdatedAt: null,
        message:
          error instanceof Error
            ? error.message
            : "yt-dlp is not available."
      } satisfies YtDlpStatus;
    }
  });
}

export function updateYtDlp() {
  return withToolLock(async () => {
    const status = await updateManagedBinary(true);
    if (!status.managed) {
      return {
        ...status,
        message: "This yt-dlp installation must be updated outside Song Cards."
      };
    }
    return status;
  });
}

export function validateYouTubeUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new YouTubeUrlError("Enter a valid YouTube URL.");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const youtubeHost =
    hostname === "youtu.be" ||
    hostname === "youtube.com" ||
    hostname.endsWith(".youtube.com");
  if (
    url.protocol !== "https:" ||
    !youtubeHost ||
    url.username ||
    url.password
  ) {
    throw new YouTubeUrlError(
      "Only public HTTPS YouTube and youtu.be links are supported."
    );
  }
  return url.toString();
}

function updateJob(
  job: YouTubeImportJob,
  patch: Partial<YouTubeImportJob>
) {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
}

function cleanMetadataValue(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.replace(/\s+/g, " ").trim().slice(0, 120) || fallback;
}

function friendlyDownloadError(error: unknown) {
  if (error instanceof MediaValidationError) return error.message;
  if (error instanceof CommandError) {
    const details = `${error.stderr}\n${error.stdout}`
      .replace(/\x1b\[[0-9;]*m/g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-3)
      .join(" ")
      .slice(0, 500);
    return details || "yt-dlp could not download that video.";
  }
  return error instanceof Error ? error.message : "The import failed.";
}

async function findDownloadedFiles(directory: string) {
  const files = await fs.readdir(/* turbopackIgnore: true */ directory);
  const infoName = files.find((name) => name.endsWith(".info.json"));
  const audioName = files.find(
    (name) =>
      name.startsWith("audio.") &&
      !name.endsWith(".info.json") &&
      /\.(aac|aif|aiff|ape|flac|m4a|mp3|mp4|mpc|ogg|opus|wav|webm|wma)$/i.test(
        name
      )
  );
  const coverName = files.find((name) =>
    /^thumbnail\.(avif|jpe?g|png|webp)$/i.test(name)
  );
  if (!infoName || !audioName) {
    throw new Error("yt-dlp finished without producing an audio file.");
  }
  return {
    audioPath: path.join(/* turbopackIgnore: true */ directory, audioName),
    coverPath: coverName
      ? path.join(/* turbopackIgnore: true */ directory, coverName)
      : null,
    infoPath: path.join(/* turbopackIgnore: true */ directory, infoName)
  };
}

async function runImport(
  job: YouTubeImportJob,
  input: { url: string; markerId: number }
) {
  let temporaryDirectory: string | null = null;
  let storedAudio: Awaited<ReturnType<typeof storeAudioFile>> | null = null;
  let storedCover: Awaited<ReturnType<typeof storeCoverBuffer>> | null = null;

  try {
    updateJob(job, {
      stage: "preparing",
      message: "Checking the downloader…",
      progress: null
    });
    const toolStatus = await getYtDlpStatus(true);
    if (!toolStatus.available) throw new Error(toolStatus.message);
    const binary = await withToolLock(() => resolveBinary());

    temporaryDirectory = await fs.mkdtemp(
      path.join(/* turbopackIgnore: true */ os.tmpdir(), "song-cards-youtube-")
    );
    updateJob(job, {
      stage: "downloading",
      message: "Downloading audio and artwork…",
      progress: 0
    });

    await runCommand(
      binary.path,
      [
        "--ignore-config",
        "--no-playlist",
        "--abort-on-error",
        "--newline",
        "--socket-timeout",
        "20",
        "--retries",
        "3",
        "--fragment-retries",
        "3",
        "--max-filesize",
        String(config.maxUploadBytes),
        "--match-filters",
        `duration <= ${config.maxSongDurationSeconds}`,
        "--js-runtimes",
        "node",
        "--format",
        "bestaudio[ext=m4a]/bestaudio/best",
        "--extract-audio",
        "--audio-format",
        "m4a",
        "--audio-quality",
        "192K",
        "--write-thumbnail",
        "--convert-thumbnails",
        "webp",
        "--write-info-json",
        "--output",
        path.join(
          /* turbopackIgnore: true */ temporaryDirectory,
          "audio.%(ext)s"
        ),
        "--output",
        `thumbnail:${path.join(
          /* turbopackIgnore: true */ temporaryDirectory,
          "thumbnail.%(ext)s"
        )}`,
        "--",
        input.url
      ],
      {
        timeoutMs: config.youtubeImportTimeoutMs,
        maxOutputCharacters: 64_000,
        onOutput(output) {
          const match = output.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
          if (match) {
            updateJob(job, {
              progress: Math.min(100, Number.parseFloat(match[1]))
            });
          }
        }
      }
    );

    updateJob(job, {
      stage: "processing",
      message: "Preparing the song card…",
      progress: null
    });
    const files = await findDownloadedFiles(temporaryDirectory);
    const metadata = JSON.parse(
      await fs.readFile(/* turbopackIgnore: true */ files.infoPath, "utf8")
    ) as DownloadMetadata;
    if (
      typeof metadata.duration === "number" &&
      metadata.duration > config.maxSongDurationSeconds
    ) {
      throw new MediaValidationError(
        `Songs must be ${Math.round(config.maxSongDurationSeconds / 60)} minutes or shorter.`
      );
    }
    const downloadedSize = (await fs.stat(files.audioPath)).size;
    if (downloadedSize > config.maxUploadBytes) {
      throw new MediaValidationError(
        "The downloaded audio is larger than the configured upload limit."
      );
    }

    const title = cleanMetadataValue(
      metadata.track,
      cleanMetadataValue(metadata.title, "Imported song")
    );
    const artist = cleanMetadataValue(
      metadata.artist,
      cleanMetadataValue(metadata.uploader, cleanMetadataValue(metadata.channel))
    );
    storedAudio = await storeAudioFile(
      files.audioPath,
      `${title}${path.extname(files.audioPath)}`
    );
    if (files.coverPath) {
      const cover = await fs.readFile(
        /* turbopackIgnore: true */ files.coverPath
      );
      if (cover.byteLength <= config.maxCoverBytes) {
        storedCover = await storeCoverBuffer(cover);
      }
    }

    let card: SongCard;
    try {
      card = createSongCard({
        title,
        artist,
        markerId: input.markerId,
        filename: storedAudio.filename,
        originalName: `${title}${path.extname(files.audioPath)}`,
        mimeType: storedAudio.mimeType,
        coverFilename: storedCover?.coverFilename ?? null
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE")) {
        throw new Error("That marker number was assigned while importing.");
      }
      throw error;
    }

    triggerOwnToneScan().catch((error) => {
      console.error("Unable to trigger OwnTone scan", error);
    });
    updateJob(job, {
      stage: "complete",
      message: `${card.title} is ready.`,
      progress: 100,
      card
    });
  } catch (error) {
    if (storedAudio) {
      await fs
        .unlink(path.join(mediaDirectory, storedAudio.filename))
        .catch(() => undefined);
    }
    if (storedCover) {
      await fs
        .unlink(path.join(coverDirectory, storedCover.coverFilename))
        .catch(() => undefined);
    }
    updateJob(job, {
      stage: "error",
      message: friendlyDownloadError(error),
      progress: null
    });
  } finally {
    if (temporaryDirectory) {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
    if (globalThis.__songCardsActiveImportId === job.id) {
      globalThis.__songCardsActiveImportId = undefined;
    }
  }
}

export function startYouTubeImport(input: {
  url: string;
  markerId: number;
}) {
  const url = validateYouTubeUrl(input.url);
  const activeId = globalThis.__songCardsActiveImportId;
  if (activeId) {
    const active = importJobs.get(activeId);
    if (active && !["complete", "error"].includes(active.stage)) {
      throw new ImportBusyError(
        "Another YouTube song is already being imported."
      );
    }
  }

  for (const [id, existing] of importJobs) {
    if (
      importJobs.size <= 20 ||
      !["complete", "error"].includes(existing.stage)
    ) {
      continue;
    }
    importJobs.delete(id);
  }

  const now = new Date().toISOString();
  const job: YouTubeImportJob = {
    id: crypto.randomUUID(),
    stage: "queued",
    message: "Import queued…",
    progress: null,
    createdAt: now,
    updatedAt: now
  };
  importJobs.set(job.id, job);
  globalThis.__songCardsActiveImportId = job.id;
  void runImport(job, { ...input, url });
  return job;
}

export function getYouTubeImportJob(jobId: string) {
  return importJobs.get(jobId) ?? null;
}
