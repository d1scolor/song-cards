export type Song = {
  id: string;
  title: string;
  artist: string;
  filename: string;
  originalName: string;
  mimeType: string;
  coverUrl: string | null;
  durationMs: number;
  integratedLufs: number | null;
  shortTermP95Lufs: number | null;
  loudnessRangeLu: number | null;
  analyzedAt: string | null;
  analysisError: string | null;
  manualGainDb: number;
  startMs: number;
  endMs: number | null;
  createdAt: string;
};

export type SongCard = Song & {
  markerId: number;
  active: boolean;
};

export type PlaybackState = "play" | "pause" | "stop";

export type PlayerStatus = {
  backend: "mock" | "owntone";
  connected: boolean;
  state: PlaybackState;
  /** The stable volume selected by the caregiver. */
  volume: number;
  maxVolume: number;
  /** The compensated volume sent to OwnTone for the current song. */
  effectiveVolume: number;
  progressMs: number;
  durationMs: number;
  song: Pick<Song, "id" | "title" | "artist" | "coverUrl"> | null;
  trim: Pick<Song, "startMs" | "endMs"> | null;
  compensation: {
    automaticGainDb: number;
    manualGainDb: number;
    totalGainDb: number;
  } | null;
  message?: string;
};

export type LoudnessAnalysis = {
  integratedLufs: number;
  shortTermP95Lufs: number;
  loudnessRangeLu: number;
};

export type PlaybackSettings = {
  masterVolume: number;
  loudnessCompensationEnabled: boolean;
  integratedTargetLufs: number;
  shortTermTargetLufs: number;
  curveDivisor: number;
};

export type YtDlpStatus = {
  available: boolean;
  managed: boolean;
  version: string | null;
  bundledVersion: string | null;
  autoUpdate: boolean;
  updateChannel: string;
  lastCheckedAt: string | null;
  lastUpdatedAt: string | null;
  message: string;
};

export type YouTubeImportJob = {
  id: string;
  stage:
    | "queued"
    | "preparing"
    | "downloading"
    | "processing"
    | "complete"
    | "error";
  message: string;
  progress: number | null;
  createdAt: string;
  updatedAt: string;
  card?: SongCard;
};
