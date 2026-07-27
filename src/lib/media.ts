import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { runCommand } from "@/lib/command";
import { config } from "@/lib/config";
import {
  coverDirectory,
  ensureStorageDirectories,
  mediaDirectory
} from "@/lib/db";

type ProbeStream = {
  codec_name?: string;
  codec_type?: string;
  duration?: string;
};

type ProbeResult = {
  format?: {
    duration?: string;
    format_name?: string;
  };
  streams?: ProbeStream[];
};

export class MediaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaValidationError";
  }
}

const directFormats: Record<string, RegExp> = {
  ".aac": /^aac$/,
  ".aif": /^pcm_/,
  ".aiff": /^pcm_/,
  ".ape": /^ape$/,
  ".flac": /^flac$/,
  ".m4a": /^(aac|alac)$/,
  ".mp3": /^mp3$/,
  ".mp4": /^(aac|alac)$/,
  ".mpc": /^musepack/,
  ".ogg": /^vorbis$/,
  ".wav": /^(pcm_|adpcm_)/,
  ".wma": /^(wma|wmav|wmapro|wmalossless)/
};

const mimeTypes: Record<string, string> = {
  ".aac": "audio/aac",
  ".aif": "audio/aiff",
  ".aiff": "audio/aiff",
  ".ape": "audio/x-ape",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".mp4": "audio/mp4",
  ".mpc": "audio/x-musepack",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".wma": "audio/x-ms-wma"
};

function safeExtension(filename: string) {
  const extension = path.extname(filename).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : ".media";
}

function numericDuration(value: string | undefined) {
  const duration = Number.parseFloat(value ?? "");
  return Number.isFinite(duration) ? duration : 0;
}

export async function probeAudio(filename: string) {
  let result: { stdout: string };
  try {
    result = await runCommand(
      config.ffprobePath,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration,format_name:stream=codec_name,codec_type,duration",
        "-of",
        "json",
        filename
      ],
      { timeoutMs: 30_000 }
    );
  } catch {
    throw new MediaValidationError(
      "The file could not be read as audio. Check that FFmpeg supports it."
    );
  }

  let probe: ProbeResult;
  try {
    probe = JSON.parse(result.stdout) as ProbeResult;
  } catch {
    throw new MediaValidationError("FFprobe returned invalid media information.");
  }

  const streams = probe.streams ?? [];
  const audio = streams.find((stream) => stream.codec_type === "audio");
  if (!audio?.codec_name) {
    throw new MediaValidationError("The selected file has no audio stream.");
  }

  const durationSeconds =
    numericDuration(probe.format?.duration) || numericDuration(audio.duration);
  if (
    durationSeconds > 0 &&
    durationSeconds > config.maxSongDurationSeconds
  ) {
    throw new MediaValidationError(
      `Songs must be ${Math.round(config.maxSongDurationSeconds / 60)} minutes or shorter.`
    );
  }

  return {
    audioCodec: audio.codec_name,
    durationSeconds,
    formatName: probe.format?.format_name ?? "",
    hasVideo: streams.some((stream) => stream.codec_type === "video")
  };
}

function canStoreWithoutConversion(
  extension: string,
  audioCodec: string,
  hasVideo: boolean
) {
  return !hasVideo && Boolean(directFormats[extension]?.test(audioCodec));
}

export async function storeAudioFile(
  sourcePath: string,
  originalName: string
): Promise<{
  filename: string;
  mimeType: string;
  normalized: boolean;
}> {
  ensureStorageDirectories();
  const probe = await probeAudio(sourcePath);
  const sourceExtension = safeExtension(originalName);
  const direct = canStoreWithoutConversion(
    sourceExtension,
    probe.audioCodec,
    probe.hasVideo
  );
  const extension = direct ? sourceExtension : ".m4a";
  const filename = `${crypto.randomUUID()}${extension}`;
  const target = path.join(mediaDirectory, filename);

  try {
    if (direct) {
      await fs.copyFile(sourcePath, target, fs.constants.COPYFILE_EXCL);
    } else {
      await runCommand(
        config.ffmpegPath,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-nostdin",
          "-i",
          sourcePath,
          "-map",
          "0:a:0",
          "-vn",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-movflags",
          "+faststart",
          target
        ],
        { timeoutMs: config.mediaProcessingTimeoutMs }
      );
    }

    const stored = await fs.stat(target);
    if (stored.size > config.maxUploadBytes) {
      throw new MediaValidationError(
        "The processed audio is larger than the configured upload limit."
      );
    }
    await fs.chmod(target, 0o640);
  } catch (error) {
    await fs.unlink(target).catch(() => undefined);
    if (error instanceof MediaValidationError) throw error;
    throw new MediaValidationError(
      "The audio could not be converted to a supported format."
    );
  }

  return {
    filename,
    mimeType: mimeTypes[extension] ?? "application/octet-stream",
    normalized: !direct
  };
}

export async function storeAudioBuffer(buffer: Buffer, originalName: string) {
  ensureStorageDirectories();
  const temporaryDirectory = await fs.mkdtemp(
    path.join(mediaDirectory, ".upload-")
  );
  const temporaryFile = path.join(
    temporaryDirectory,
    `source${safeExtension(originalName)}`
  );
  try {
    await fs.writeFile(temporaryFile, buffer, { flag: "wx", mode: 0o640 });
    return await storeAudioFile(temporaryFile, originalName);
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function normalizeCover(buffer: Buffer) {
  try {
    return await sharp(buffer)
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true
      })
      .webp({ quality: 86 })
      .toBuffer();
  } catch {
    throw new MediaValidationError("The selected cover is not a valid image.");
  }
}

export async function storeCoverBuffer(buffer: Buffer) {
  ensureStorageDirectories();
  const coverFilename = `${crypto.randomUUID()}.webp`;
  const target = path.join(coverDirectory, coverFilename);
  await fs.writeFile(target, await normalizeCover(buffer), {
    flag: "wx",
    mode: 0o640
  });
  return { coverFilename, target };
}
