import path from "node:path";
import { runCommand } from "@/lib/command";
import { config } from "@/lib/config";
import type {
  LoudnessAnalysis,
  PlaybackSettings,
  Song
} from "@/lib/types";

type AnalysisFrame = {
  tags?: {
    "lavfi.r128.I"?: string;
    "lavfi.r128.LRA"?: string;
    "lavfi.r128.S"?: string;
  };
};

function finiteNumber(value: string | undefined) {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number, digits = 1) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function escapeLavfiFilename(filename: string) {
  return filename
    .replaceAll("\\", "\\\\")
    .replaceAll(":", "\\:")
    .replaceAll("'", "\\'");
}

export async function analyzeAudioLoudness(
  filename: string
): Promise<LoudnessAnalysis> {
  const input = `amovie='${escapeLavfiFilename(path.resolve(filename))}',ebur128=metadata=1`;
  const { stdout } = await runCommand(
    config.ffprobePath,
    [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      input,
      "-show_entries",
      "frame_tags=lavfi.r128.I,lavfi.r128.LRA,lavfi.r128.S",
      "-of",
      "json"
    ],
    {
      timeoutMs: config.mediaProcessingTimeoutMs,
      maxOutputCharacters: 8_000_000
    }
  );

  let frames: AnalysisFrame[];
  try {
    frames = (JSON.parse(stdout) as { frames?: AnalysisFrame[] }).frames ?? [];
  } catch {
    throw new Error("FFprobe returned invalid loudness information.");
  }
  const finalTags = frames
    .slice()
    .reverse()
    .find((frame) => frame.tags)?.tags;
  const integratedLufs = finiteNumber(finalTags?.["lavfi.r128.I"]);
  const loudnessRangeLu = finiteNumber(finalTags?.["lavfi.r128.LRA"]);
  const shortTermValues = frames
    .map((frame) => finiteNumber(frame.tags?.["lavfi.r128.S"]))
    .filter((value): value is number => value !== null && value > -70)
    .sort((left, right) => left - right);

  if (
    integratedLufs === null ||
    loudnessRangeLu === null ||
    integratedLufs <= -70
  ) {
    throw new Error("The audio did not contain enough signal to analyze.");
  }
  const percentileIndex =
    shortTermValues.length > 0
      ? Math.min(
          shortTermValues.length - 1,
          Math.ceil(shortTermValues.length * 0.95) - 1
        )
      : -1;
  return {
    integratedLufs: round(integratedLufs),
    shortTermP95Lufs:
      percentileIndex >= 0
        ? round(shortTermValues[percentileIndex])
        : round(integratedLufs),
    loudnessRangeLu: round(loudnessRangeLu)
  };
}

export function automaticGainDb(
  song: Pick<Song, "integratedLufs" | "shortTermP95Lufs">,
  settings: PlaybackSettings
) {
  if (
    !settings.loudnessCompensationEnabled ||
    song.integratedLufs === null ||
    song.shortTermP95Lufs === null
  ) {
    return 0;
  }
  return round(
    Math.min(
      settings.integratedTargetLufs - song.integratedLufs,
      settings.shortTermTargetLufs - song.shortTermP95Lufs
    )
  );
}

export function songCompensation(
  song: Pick<
    Song,
    "integratedLufs" | "shortTermP95Lufs" | "manualGainDb"
  >,
  settings: PlaybackSettings
) {
  const automatic = automaticGainDb(song, settings);
  return {
    automaticGainDb: automatic,
    manualGainDb: song.manualGainDb,
    totalGainDb: round(automatic + song.manualGainDb)
  };
}

export function effectiveVolume(
  masterVolume: number,
  totalGainDb: number,
  curveDivisor: number,
  maximum = config.maxVolume
) {
  const safeDivisor = Math.max(1, curveDivisor);
  return Math.max(
    0,
    Math.min(
      maximum,
      Math.round(masterVolume * 10 ** (totalGainDb / safeDivisor))
    )
  );
}
