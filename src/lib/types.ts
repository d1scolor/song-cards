export type Song = {
  id: string;
  title: string;
  artist: string;
  filename: string;
  originalName: string;
  mimeType: string;
  coverUrl: string | null;
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
  volume: number;
  progressMs: number;
  durationMs: number;
  song: Pick<Song, "id" | "title" | "artist" | "coverUrl"> | null;
  message?: string;
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
