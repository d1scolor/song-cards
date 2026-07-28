"use client";

import {
  CircleCheck,
  CircleX,
  Download,
  RefreshCw,
  Speaker
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { PlayerStatus, YtDlpStatus } from "@/lib/types";

export function SystemDashboard() {
  const [player, setPlayer] = useState<PlayerStatus | null>(null);
  const [downloader, setDownloader] = useState<YtDlpStatus | null>(null);
  const [updating, setUpdating] = useState(false);

  const refresh = useCallback(async () => {
    const [playerResponse, toolResponse] = await Promise.all([
      fetch("/api/player", { cache: "no-store" }),
      fetch("/api/admin/tools/yt-dlp", { cache: "no-store" })
    ]);
    if (playerResponse.ok) setPlayer(await playerResponse.json());
    if (toolResponse.ok) {
      const body = await toolResponse.json();
      setDownloader(body.status);
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
              <h2>OwnTone speaker</h2>
            </div>
          </div>
          <div
            className={`system-state ${
              player !== null && !player.connected ? "is-error" : ""
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
              <dt>Volume</dt>
              <dd>{player ? `${player.volume}%` : "—"}</dd>
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
      </div>
    </main>
  );
}
