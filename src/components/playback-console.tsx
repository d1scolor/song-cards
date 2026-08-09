"use client";

import { Radio, Smartphone } from "lucide-react";
import { useState } from "react";
import {
  LocalPlayerControls,
  useLocalPlayback
} from "@/components/local-playback";
import { PlayerControls } from "@/components/player-controls";

export function PlaybackConsole({
  speakerPlaybackEnabled
}: {
  speakerPlaybackEnabled: boolean;
}) {
  const localPlayer = useLocalPlayback();
  const [target, setTarget] = useState<"speaker" | "local">(
    localPlayer.track || !speakerPlaybackEnabled ? "local" : "speaker"
  );

  return (
    <>
      <div className="playback-target" role="group" aria-label="Playback target">
        {speakerPlaybackEnabled && (
          <button
            type="button"
            className={target === "speaker" ? "is-active" : ""}
            onClick={() => setTarget("speaker")}
          >
            <Radio size={19} aria-hidden="true" />
            OwnTone speaker
          </button>
        )}
        <button
          type="button"
          className={target === "local" ? "is-active" : ""}
          onClick={() => setTarget("local")}
        >
          <Smartphone size={19} aria-hidden="true" />
          This device
        </button>
      </div>
      {target === "speaker" ? (
        <PlayerControls allowTrimEditing />
      ) : (
        <LocalPlayerControls />
      )}
    </>
  );
}
