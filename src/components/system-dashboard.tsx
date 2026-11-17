"use client";

import {
  CircleCheck,
  CircleX,
  Download,
  RefreshCw,
  SlidersHorizontal,
  Speaker
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type {
  PlaybackSettings,
  PlayerStatus,
  YtDlpStatus
} from "@/lib/types";
import { VoiceSettingsPanel } from "@/components/voice-settings";

export function SystemDashboard() {
  const [player, setPlayer] = useState<PlayerStatus | null>(null);
  const [downloader, setDownloader] = useState<YtDlpStatus | null>(null);
  const [settings, setSettings] = useState<PlaybackSettings | null>(null);
  const [updating, setUpdating] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");

  const refresh = useCallback(async () => {
    const [playerResponse, toolResponse, settingsResponse] = await Promise.all([
      fetch("/api/player", { cache: "no-store" }),
      fetch("/api/admin/tools/yt-dlp", { cache: "no-store" }),
      fetch("/api/admin/settings/playback", { cache: "no-store" })
    ]);
    if (playerResponse.ok) setPlayer(await playerResponse.json());
    if (toolResponse.ok) {
      const body = await toolResponse.json();
      setDownloader(body.status);
    }
    if (settingsResponse.ok) {
      const body = await settingsResponse.json();
      setSettings(body.settings);
    }
  }, []);

  useEffect(() => {
    const firstLoad = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(firstLoad);
  }, [refresh]);

  async function updateDownloader() {
    setUpdating(true);
    const response = await fetch("/api/admin/tools/yt-dlp", {
      method: "POST"
    });
    const body = await response.json();
    setUpdating(false);
    if (response.ok) setDownloader(body.status);
  }

  async function savePlaybackSettings(
    nextSettings = settings,
    successMessage = "Playback settings saved."
  ) {
    if (!nextSettings) return;
    const previousSettings = settings;
    setSettings(nextSettings);
    setSavingSettings(true);
    setSettingsMessage("");
    try {
      const response = await fetch("/api/admin/settings/playback", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(nextSettings)
      });
      const body = await response.json();
      if (!response.ok) {
        setSettings(previousSettings);
        setSettingsMessage(body.error ?? "Unable to save playback settings.");
        return;
      }
      setSettings(body.settings);
      setSettingsMessage(successMessage);
    } catch {
      setSettings(previousSettings);
      setSettingsMessage("Unable to save playback settings.");
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <main className="admin-shell system-page">
      <section className="admin-hero">
        <div>
          <span className="section-kicker">System</span>
          <h1>Keep the music moving.</h1>
          <p>Check the speaker connection and maintain import tooling.</p>
        </div>
        <button
          className="secondary-button system-refresh"
          type="button"
          onClick={() => void refresh()}
        >
          <RefreshCw size={19} aria-hidden="true" />
          Refresh status
        </button>
      </section>

      <div className="system-grid">
        <section className="surface system-panel">
          <div className="system-panel__heading">
            <span className="system-panel__icon">
              <Speaker size={26} aria-hidden="true" />
            </span>
            <div>
              <span className="section-kicker">Playback</span>
              <h2>
                {player?.backend === "disabled"
                  ? "External speaker"
                  : player?.backend === "mock"
                    ? "Development player"
                    : "OwnTone speaker"}
              </h2>
            </div>
          </div>
          <div
            className={`system-state ${
              player?.backend === "owntone" && !player.connected
                ? "is-error"
                : ""
            }`}
          >
            {player?.connected ? (
              <CircleCheck size={22} aria-hidden="true" />
            ) : (
              <CircleX size={22} aria-hidden="true" />
            )}
            <strong>
              {player === null
                ? "Checking…"
                : player.backend === "disabled"
                  ? "Not configured"
                  : player.backend === "mock"
                    ? "Development mode"
                    : player.connected
                  ? "Connected"
                  : "Unavailable"}
            </strong>
          </div>
          <dl className="system-details">
            <div>
              <dt>Backend</dt>
              <dd>{player?.backend ?? "—"}</dd>
            </div>
            <div>
              <dt>Playback</dt>
              <dd>{player?.state ?? "—"}</dd>
            </div>
            <div>
              <dt>Master volume</dt>
              <dd>{player ? `${player.volume}%` : "—"}</dd>
            </div>
            <div>
              <dt>Output volume</dt>
              <dd>{player ? `${player.effectiveVolume}%` : "—"}</dd>
            </div>
          </dl>
          {player?.message && <p className="system-message">{player.message}</p>}
        </section>

        <section className="surface system-panel">
          <div className="system-panel__heading">
            <span className="system-panel__icon system-panel__icon--download">
              <Download size={26} aria-hidden="true" />
            </span>
            <div>
              <span className="section-kicker">Imports</span>
              <h2>yt-dlp downloader</h2>
            </div>
          </div>
          <div
            className={`system-state ${
              downloader !== null && !downloader.available ? "is-error" : ""
            }`}
          >
            {downloader?.available ? (
              <CircleCheck size={22} aria-hidden="true" />
            ) : (
              <CircleX size={22} aria-hidden="true" />
            )}
            <strong>
              {downloader === null
                ? "Checking…"
                : downloader.available
                  ? `Version ${downloader.version}`
                  : "Unavailable"}
            </strong>
          </div>
          <dl className="system-details">
            <div>
              <dt>Channel</dt>
              <dd>{downloader?.updateChannel ?? "—"}</dd>
            </div>
            <div>
              <dt>Updates</dt>
              <dd>{downloader?.autoUpdate ? "Automatic" : "Manual"}</dd>
            </div>
            <div>
              <dt>Last checked</dt>
              <dd>
                {downloader?.lastCheckedAt
                  ? new Date(downloader.lastCheckedAt).toLocaleString()
                  : "Never"}
              </dd>
            </div>
          </dl>
          <p className="system-message">
            {downloader?.message ?? "Checking the downloader…"}
          </p>
          <button
            className="secondary-button system-update"
            type="button"
            disabled={updating || !downloader?.managed}
            onClick={() => void updateDownloader()}
          >
            <RefreshCw
              className={updating ? "spin" : ""}
              size={17}
              aria-hidden="true"
            />
            {updating ? "Updating…" : "Check for update"}
          </button>
        </section>

        <section className="surface system-panel system-panel--wide">
          <div className="system-panel__heading">
            <span className="system-panel__icon system-panel__icon--loudness">
              <SlidersHorizontal size={26} aria-hidden="true" />
            </span>
            <div>
              <span className="section-kicker">Playback</span>
              <h2>Kiosk and song balancing</h2>
            </div>
          </div>
          {settings && (
            <div className="loudness-settings">
              <fieldset className="kiosk-target-settings">
                <legend>Kiosk playback target</legend>
                <p>
                  This setting applies to every kiosk in this deployment and
                  saves as soon as you select an option.
                </p>
                <div>
                  <label>
                    <input
                      type="radio"
                      name="kioskPlaybackTarget"
                      value="owntone"
                      checked={settings.kioskPlaybackTarget === "owntone"}
                      disabled={
                        savingSettings || player?.backend === "disabled"
                      }
                      onChange={() =>
                        void savePlaybackSettings(
                          {
                            ...settings,
                            kioskPlaybackTarget: "owntone"
                          },
                          "Kiosk playback target saved."
                        )
                      }
                    />
                    <span>
                      <strong>OwnTone speaker</strong>
                      <small>
                        {player?.backend === "disabled"
                          ? "Enable the OwnTone backend to use AirPlay."
                          : "Play through the configured AirPlay output."}
                      </small>
                    </span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="kioskPlaybackTarget"
                      value="local"
                      checked={settings.kioskPlaybackTarget === "local"}
                      disabled={savingSettings}
                      onChange={() =>
                        void savePlaybackSettings(
                          {
                            ...settings,
                            kioskPlaybackTarget: "local"
                          },
                          "Kiosk playback target saved."
                        )
                      }
                    />
                    <span>
                      <strong>Kiosk device</strong>
                      <small>Play on whichever device scans the card.</small>
                    </span>
                  </label>
                </div>
              </fieldset>
              <label className="toggle-field">
                <input
                  type="checkbox"
                  checked={settings.loudnessCompensationEnabled}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      loudnessCompensationEnabled: event.target.checked
                    })
                  }
                />
                <span>
                  <strong>Automatically balance songs</strong>
                  <small>
                    Keep the master volume familiar while adjusting either
                    playback target per song.
                  </small>
                </span>
              </label>
              <div className="loudness-fields">
                <label>
                  Average target
                  <span>
                    <input
                      type="number"
                      min="-24"
                      max="-8"
                      step="0.5"
                      value={settings.integratedTargetLufs}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          integratedTargetLufs: Number(event.target.value)
                        })
                      }
                    />
                    LUFS
                  </span>
                  <small>Lower values produce a quieter reference.</small>
                </label>
                <label>
                  Loud-section guard
                  <span>
                    <input
                      type="number"
                      min="-20"
                      max="-5"
                      step="0.5"
                      value={settings.shortTermTargetLufs}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          shortTermTargetLufs: Number(event.target.value)
                        })
                      }
                    />
                    LUFS
                  </span>
                  <small>Prevents dynamic stories becoming too loud.</small>
                </label>
                <label>
                  Curve divisor
                  <span>
                    <input
                      type="number"
                      min="30"
                      max="120"
                      step="1"
                      value={settings.curveDivisor}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          curveDivisor: Number(event.target.value)
                        })
                      }
                    />
                  </span>
                  <small>Higher values make compensation gentler.</small>
                </label>
              </div>
              <p className="system-message">
                Targets control automatic song balancing. The curve controls
                how strongly gain corrections change the playback volume.
                Changes apply on the next song or volume adjustment.
              </p>
              {settingsMessage && (
                <p className="settings-result" aria-live="polite">
                  {settingsMessage}
                </p>
              )}
              <button
                className="secondary-button system-update"
                type="button"
                disabled={savingSettings}
                onClick={() => void savePlaybackSettings()}
              >
                {savingSettings ? "Saving…" : "Save playback settings"}
              </button>
            </div>
          )}
        </section>
        <VoiceSettingsPanel />
      </div>
    </main>
  );
}
