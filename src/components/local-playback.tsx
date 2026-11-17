"use client";

import {
  CirclePause,
  CirclePlay,
  Music2,
  Square,
  Volume1,
  Volume2
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

export type LocalPlaybackTrack = {
  id: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  mediaUrl: string;
  durationMs: number;
  startMs: number;
  endMs: number | null;
  masterVolume: number;
  maxVolume: number;
  curveDivisor: number;
  totalGainDb: number;
  rememberVolume?: boolean;
};

type LocalPlaybackState = {
  track: LocalPlaybackTrack | null;
  state: "loading" | "play" | "pause" | "stop";
  progressMs: number;
  durationMs: number;
  masterVolume: number;
  effectiveVolume: number;
  error: string;
};

type LocalPlaybackContextValue = LocalPlaybackState & {
  unlock: () => Promise<void>;
  playTrack: (track: LocalPlaybackTrack) => Promise<void>;
  toggle: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  seek: (positionMs: number) => void;
  setMasterVolume: (volume: number) => void;
};

const LocalPlaybackContext = createContext<LocalPlaybackContextValue | null>(
  null
);

function effectiveVolume(
  masterVolume: number,
  totalGainDb: number,
  curveDivisor: number,
  maximum: number
) {
  return Math.max(
    0,
    Math.min(
      maximum,
      Math.round(
        masterVolume * 10 ** (totalGainDb / Math.max(1, curveDivisor))
      )
    )
  );
}

function storedVolume(fallback: number, maximum: number) {
  const saved = Number.parseInt(
    window.localStorage.getItem("song-cards-local-volume") ?? "",
    10
  );
  return Math.max(
    0,
    Math.min(maximum, Number.isFinite(saved) ? saved : fallback)
  );
}

export function LocalPlaybackProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const trackRef = useRef<LocalPlaybackTrack | null>(null);
  const [player, setPlayer] = useState<LocalPlaybackState>({
    track: null,
    state: "stop",
    progressMs: 0,
    durationMs: 0,
    masterVolume: 0,
    effectiveVolume: 0,
    error: ""
  });

  const applyGain = useCallback(
    (track: LocalPlaybackTrack, masterVolume: number) => {
      const adjusted = effectiveVolume(
        masterVolume,
        track.totalGainDb,
        track.curveDivisor,
        track.maxVolume
      );
      if (gainRef.current) gainRef.current.gain.value = adjusted / 100;
      if (audioRef.current && !gainRef.current) {
        audioRef.current.volume = Math.min(1, adjusted / 100);
      }
      setPlayer((current) => ({
        ...current,
        masterVolume,
        effectiveVolume: adjusted
      }));
    },
    []
  );

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.setAttribute("playsinline", "");
    audioRef.current = audio;

    const updateProgress = () => {
      const track = trackRef.current;
      if (!track) return;
      const progressMs = Math.round(audio.currentTime * 1_000);
      if (track.endMs !== null && progressMs >= track.endMs) {
        audio.pause();
        audio.currentTime = track.startMs / 1_000;
        setPlayer((current) => ({
          ...current,
          state: "stop",
          progressMs: track.startMs
        }));
        return;
      }
      setPlayer((current) => ({
        ...current,
        progressMs,
        durationMs:
          Number.isFinite(audio.duration) && audio.duration > 0
            ? Math.round(audio.duration * 1_000)
            : track.durationMs
      }));
    };
    const markPlaying = () => {
      if (!trackRef.current) return;
      setPlayer((current) => ({ ...current, state: "play", error: "" }));
    };
    const markPaused = () =>
      setPlayer((current) =>
        !trackRef.current ||
        current.state === "stop" ||
        current.state === "loading"
          ? current
          : { ...current, state: "pause" }
      );
    const markEnded = () => {
      const track = trackRef.current;
      if (track) audio.currentTime = track.startMs / 1_000;
      setPlayer((current) => ({
        ...current,
        state: "stop",
        progressMs: track?.startMs ?? 0
      }));
    };
    const markError = () =>
      setPlayer((current) => ({
        ...current,
        state: "stop",
        error:
          "This browser could not play the stored audio format on this device."
      }));

    audio.addEventListener("loadedmetadata", updateProgress);
    audio.addEventListener("timeupdate", updateProgress);
    audio.addEventListener("play", markPlaying);
    audio.addEventListener("pause", markPaused);
    audio.addEventListener("ended", markEnded);
    audio.addEventListener("error", markError);
    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", updateProgress);
      audio.removeEventListener("timeupdate", updateProgress);
      audio.removeEventListener("play", markPlaying);
      audio.removeEventListener("pause", markPaused);
      audio.removeEventListener("ended", markEnded);
      audio.removeEventListener("error", markError);
      audio.removeAttribute("src");
      audio.load();
      void audioContextRef.current?.close();
      audioRef.current = null;
    };
  }, []);

  const ensureAudioGraph = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audioContextRef.current) {
      const AudioContextClass =
        window.AudioContext ??
        (
          window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const source = context.createMediaElementSource(audio);
      const gain = context.createGain();
      source.connect(gain);
      gain.connect(context.destination);
      audioContextRef.current = context;
      sourceRef.current = source;
      gainRef.current = gain;
    }
    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }
  }, []);

  const unlock = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || trackRef.current) {
      await ensureAudioGraph();
      return;
    }
    const wav = new Uint8Array(46);
    const view = new DataView(wav.buffer);
    const writeText = (offset: number, value: string) => {
      for (let index = 0; index < value.length; index += 1) {
        view.setUint8(offset + index, value.charCodeAt(index));
      }
    };
    writeText(0, "RIFF");
    view.setUint32(4, 38, true);
    writeText(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 8_000, true);
    view.setUint32(28, 8_000, true);
    view.setUint16(32, 1, true);
    view.setUint16(34, 8, true);
    writeText(36, "data");
    view.setUint32(40, 2, true);
    view.setUint8(44, 128);
    view.setUint8(45, 128);
    const silentUrl = URL.createObjectURL(
      new Blob([wav], { type: "audio/wav" })
    );
    try {
      const audioGraph = ensureAudioGraph();
      audio.src = silentUrl;
      audio.load();
      const playback = audio.play();
      await Promise.all([audioGraph, playback]);
      if (!trackRef.current) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
    } catch {
      // playTrack reports a useful message if the later playback attempt is
      // still blocked. Camera access should continue either way.
    } finally {
      URL.revokeObjectURL(silentUrl);
    }
  }, [ensureAudioGraph]);

  const playTrack = useCallback(
    async (track: LocalPlaybackTrack) => {
      const audio = audioRef.current;
      if (!audio) return;
      trackRef.current = track;
      const volume =
        track.rememberVolume === false
          ? track.masterVolume
          : storedVolume(track.masterVolume, track.maxVolume);
      setPlayer({
        track,
        state: "loading",
        progressMs: track.startMs,
        durationMs: track.durationMs,
        masterVolume: volume,
        effectiveVolume: effectiveVolume(
          volume,
          track.totalGainDb,
          track.curveDivisor,
          track.maxVolume
        ),
        error: ""
      });
      try {
        const audioGraph = ensureAudioGraph();
        applyGain(track, volume);
        const nextSource = new URL(track.mediaUrl, window.location.href).href;
        if (audio.src !== nextSource) {
          audio.addEventListener(
            "loadedmetadata",
            () => {
              audio.currentTime = track.startMs / 1_000;
            },
            { once: true }
          );
          audio.src = track.mediaUrl;
          audio.load();
        } else {
          audio.currentTime = track.startMs / 1_000;
        }
        const playback = audio.play();
        await Promise.all([audioGraph, playback]);
      } catch (error) {
        setPlayer((current) => ({
          ...current,
          state: "stop",
          error:
            error instanceof DOMException && error.name === "NotAllowedError"
              ? "Tap play again to allow audio on this device."
              : "Local playback could not be started."
        }));
        throw error;
      }
    },
    [applyGain, ensureAudioGraph]
  );

  const toggle = useCallback(async () => {
    const audio = audioRef.current;
    const track = trackRef.current;
    if (!audio || !track) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    if (
      audio.ended ||
      audio.currentTime * 1_000 < track.startMs ||
      (track.endMs !== null && audio.currentTime * 1_000 >= track.endMs)
    ) {
      audio.currentTime = track.startMs / 1_000;
    }
    try {
      await ensureAudioGraph();
      await audio.play();
    } catch {
      setPlayer((current) => ({
        ...current,
        error: "Tap play again to allow audio on this device."
      }));
    }
  }, [ensureAudioGraph]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setPlayer((current) => current.track ? { ...current, state: "pause" } : current);
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    const track = trackRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = (track?.startMs ?? 0) / 1_000;
    setPlayer((current) => ({
      ...current,
      state: "stop",
      progressMs: track?.startMs ?? 0
    }));
  }, []);

  const seek = useCallback((positionMs: number) => {
    const audio = audioRef.current;
    const track = trackRef.current;
    if (!audio || !track) return;
    const maximum = track.endMs ?? player.durationMs ?? track.durationMs;
    const next = Math.max(track.startMs, Math.min(maximum, positionMs));
    audio.currentTime = next / 1_000;
    setPlayer((current) => ({ ...current, progressMs: next }));
  }, [player.durationMs]);

  const setMasterVolume = useCallback(
    (volume: number) => {
      const track = trackRef.current;
      if (!track) return;
      const next = Math.max(0, Math.min(track.maxVolume, Math.round(volume)));
      if (track.rememberVolume !== false) {
        window.localStorage.setItem("song-cards-local-volume", String(next));
      }
      applyGain(track, next);
    },
    [applyGain]
  );

  const value = useMemo(
    () => ({
      ...player,
      unlock,
      pause,
      playTrack,
      toggle,
      stop,
      seek,
      setMasterVolume
    }),
    [player, playTrack, seek, setMasterVolume, stop, toggle, unlock, pause]
  );

  return (
    <LocalPlaybackContext.Provider value={value}>
      {children}
    </LocalPlaybackContext.Provider>
  );
}

export function useLocalPlayback() {
  const value = useContext(LocalPlaybackContext);
  if (!value) {
    throw new Error("Local playback must be used inside its provider.");
  }
  return value;
}

function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function LocalPlayerControls({ compact = false }: { compact?: boolean }) {
  const player = useLocalPlayback();
  const track = player.track;
  const minimum = track?.startMs ?? 0;
  const maximum = track?.endMs ?? player.durationMs ?? minimum;
  const progress =
    maximum > minimum
      ? ((player.progressMs - minimum) / (maximum - minimum)) * 100
      : 0;

  return (
    <section className={`player-panel ${compact ? "player-panel--compact" : ""}`}>
      <div className="player-heading">
        <span className="connection-dot is-online" aria-hidden="true" />
        <span>This device</span>
        <span className="demo-chip local-chip">Local</span>
      </div>
      <div className="now-playing">
        <div className="now-playing__art">
          {track?.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={track.coverUrl} alt={`${track.title} cover`} />
          ) : (
            <Music2 size={compact ? 28 : 38} aria-hidden="true" />
          )}
        </div>
        <div className="now-playing__copy">
          <span className="eyebrow">
            {player.state === "play"
              ? "Now playing"
              : player.state === "pause"
                ? "Paused"
                : "Ready"}
          </span>
          <strong>{track?.title ?? "Choose a song from the library"}</strong>
          <span>{track?.artist || "Playback stays on this browser"}</span>
        </div>
      </div>
      {!compact && (
        <div className="progress-row">
          <span>{formatTime(player.progressMs)}</span>
          <div
            className="progress-track progress-track--seekable"
            style={{ "--seek-progress": `${Math.max(0, Math.min(100, progress))}%` } as React.CSSProperties}
          >
            <input
              aria-label="Local song position"
              type="range"
              min={minimum}
              max={Math.max(minimum, maximum)}
              step="250"
              value={Math.max(minimum, Math.min(maximum, player.progressMs))}
              disabled={!track || maximum <= minimum}
              onChange={(event) => player.seek(Number(event.target.value))}
            />
          </div>
          <span>{formatTime(maximum)}</span>
        </div>
      )}
      <div className="transport-row">
        <button
          className="round-control"
          type="button"
          aria-label={player.state === "play" ? "Pause" : "Play"}
          disabled={!track || player.state === "loading"}
          onClick={() => void player.toggle()}
        >
          {player.state === "play" ? (
            <CirclePause size={compact ? 44 : 54} />
          ) : (
            <CirclePlay size={compact ? 44 : 54} />
          )}
        </button>
        <button
          className="round-control round-control--stop"
          type="button"
          aria-label="Stop"
          disabled={!track}
          onClick={player.stop}
        >
          <Square
            size={compact ? 22 : 28}
            fill="currentColor"
            strokeWidth={2.5}
          />
        </button>
      </div>
      {!compact && (
        <div className="volume-row">
          <Volume1 size={22} aria-hidden="true" />
          <input
            aria-label="Local playback volume"
            type="range"
            min="0"
            max={track?.maxVolume ?? 100}
            value={player.masterVolume}
            disabled={!track}
            onChange={(event) =>
              player.setMasterVolume(Number(event.target.value))
            }
          />
          <Volume2 size={24} aria-hidden="true" />
          <output>{player.masterVolume}%</output>
        </div>
      )}
      {!compact && track && (
        <p className="local-volume-note">
          Browser output: {player.effectiveVolume}% after this song’s loudness
          correction. Your device’s hardware volume still applies.
        </p>
      )}
      {player.error && <p className="inline-error">{player.error}</p>}
    </section>
  );
}
