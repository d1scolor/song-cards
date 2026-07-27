export type Song = {
  id: string;
  title: string;
  artist: string;
  filename: string;
  originalName: string;
  mimeType: string;
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
  song: Pick<Song, "id" | "title" | "artist"> | null;
  message?: string;
};
