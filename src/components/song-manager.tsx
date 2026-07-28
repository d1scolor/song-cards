"use client";

import {
  CircleCheck,
  Download,
  FileMusic,
  ImagePlus,
  Plus,
  Printer,
  RefreshCw,
  TriangleAlert,
  Trash2
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import type { SongCard, YouTubeImportJob } from "@/lib/types";

export function SongManager({
  initialSongs,
  initialNextMarker
}: {
  initialSongs: SongCard[];
  initialNextMarker: number;
}) {
  const [songs, setSongs] = useState(initialSongs);
  const [nextMarker, setNextMarker] = useState(initialNextMarker);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [coverFileName, setCoverFileName] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [importJob, setImportJob] = useState<YouTubeImportJob | null>(null);
  const [importError, setImportError] = useState("");

  const refreshCatalog = useCallback(async () => {
    const response = await fetch("/api/admin/catalog", { cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json();
    setSongs(body.cards);
    setNextMarker(body.nextMarkerId);
  }, []);

  useEffect(() => {
    if (!importJob || ["complete", "error"].includes(importJob.stage)) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetch(`/api/admin/import/${importJob.id}`, { cache: "no-store" })
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok) throw new Error(body.error);
          if (!cancelled) {
            setImportError("");
            setImportJob(body.job);
            if (body.job.stage === "complete") {
              setImportUrl("");
              void refreshCatalog();
            }
          }
        })
        .catch((pollError) => {
          if (!cancelled) {
            setImportError(
              pollError instanceof Error
                ? pollError.message
                : "Unable to check the import."
            );
            setImportJob((current) =>
              current
                ? { ...current, updatedAt: new Date().toISOString() }
                : current
            );
          }
        });
    }, 1_000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [importJob, refreshCatalog]);

  async function addCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    const response = await fetch("/api/admin/catalog", {
      method: "POST",
      body: new FormData(form)
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? "Unable to add the song.");
      return;
    }
    await refreshCatalog();
    setFileName("");
    setCoverFileName("");
    form.reset();
  }

  async function importFromYouTube(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setImportError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: form.get("url"),
        markerId: Number(form.get("markerId"))
      })
    });
    const body = await response.json();
    if (!response.ok) {
      setImportError(body.error ?? "Unable to start the import.");
      return;
    }
    setImportJob(body.job);
  }

  async function removeSong(song: SongCard) {
    if (!window.confirm(`Remove “${song.title}” and its files?`)) return;
    const response = await fetch(`/api/admin/catalog/${song.id}`, {
      method: "DELETE"
    });
    if (!response.ok) {
      const body = await response.json();
      setError(body.error ?? "Unable to remove the song.");
      return;
    }
    setSongs((current) => current.filter((item) => item.id !== song.id));
  }

  return (
    <main className="admin-shell">
      <section className="admin-hero">
        <div>
          <span className="section-kicker">Song management</span>
          <h1>Make music tangible.</h1>
          <p>Add songs and assign the markers used by printable cards.</p>
        </div>
        <Link
          className={`secondary-button ${songs.length === 0 ? "is-disabled" : ""}`}
          href={songs.length ? "/admin/print" : "#"}
          aria-disabled={songs.length === 0}
        >
          <Printer size={20} />
          Print card sheet
        </Link>
      </section>

      <div className="admin-grid">
        <div className="admin-create-stack">
          <section className="surface add-song-card">
          <div className="surface-heading">
            <span className="step-number">1</span>
            <div>
              <h2>Add a song</h2>
              <p>Most audio formats are accepted and normalized when needed.</p>
            </div>
          </div>
          <form onSubmit={addCard}>
            <label>
              Song title
              <input name="title" maxLength={120} required placeholder="Here Comes the Sun" />
            </label>
            <label>
              Artist <span className="optional">optional</span>
              <input name="artist" maxLength={120} placeholder="The Beatles" />
            </label>
            <div className="form-split">
              <label>
                Marker number
                <input
                  name="markerId"
                  type="number"
                  min="0"
                  max="249"
                  defaultValue={nextMarker}
                  key={nextMarker}
                  required
                />
              </label>
              <label className="file-field">
                Audio file
                <span className="file-picker">
                  <FileMusic size={21} />
                  <span>{fileName || "Choose a file"}</span>
                  <input
                    name="audio"
                    type="file"
                    accept="audio/*,video/webm,.webm,.opus,.wma,.aif,.aiff,.ape,.mpc"
                    required
                    onChange={(event) =>
                      setFileName(event.target.files?.[0]?.name ?? "")
                    }
                  />
                </span>
              </label>
            </div>
            <label className="file-field">
              Cover image <span className="optional">optional</span>
              <span className="file-picker">
                <ImagePlus size={21} />
                <span>{coverFileName || "Choose a JPEG, PNG, WebP, or AVIF"}</span>
                <input
                  name="cover"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  onChange={(event) =>
                    setCoverFileName(event.target.files?.[0]?.name ?? "")
                  }
                />
              </span>
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="primary-button" type="submit" disabled={busy}>
              <Plus size={21} />
              {busy ? "Uploading…" : "Add song"}
            </button>
          </form>
          </section>

          <section className="surface youtube-import-card">
            <div className="surface-heading">
              <span className="step-number step-number--youtube">
                <Download size={18} />
              </span>
              <div>
                <h2>Import from YouTube</h2>
                <p>Audio, title, artist, and thumbnail are collected for you.</p>
              </div>
            </div>
            <form onSubmit={importFromYouTube}>
              <label>
                YouTube link
                <input
                  name="url"
                  type="url"
                  required
                  value={importUrl}
                  placeholder="https://www.youtube.com/watch?v=…"
                  onChange={(event) => setImportUrl(event.target.value)}
                />
              </label>
              <label>
                Marker number
                <input
                  name="markerId"
                  type="number"
                  min="0"
                  max="249"
                  defaultValue={nextMarker}
                  key={`youtube-${nextMarker}`}
                  required
                />
              </label>

              {importJob && (
                <div
                  className={`import-status import-status--${importJob.stage}`}
                  aria-live="polite"
                >
                  {importJob.stage === "complete" ? (
                    <CircleCheck size={21} />
                  ) : importJob.stage === "error" ? (
                    <TriangleAlert size={21} />
                  ) : (
                    <RefreshCw className="spin" size={20} />
                  )}
                  <div>
                    <strong>{importJob.message}</strong>
                    {importJob.progress !== null &&
                      !["complete", "error"].includes(importJob.stage) && (
                        <span className="import-progress">
                          <i style={{ width: `${importJob.progress}%` }} />
                        </span>
                      )}
                  </div>
                </div>
              )}
              {importError && <p className="form-error">{importError}</p>}

              <button
                className="primary-button primary-button--youtube"
                type="submit"
                disabled={
                  Boolean(importJob) &&
                  !["complete", "error"].includes(importJob?.stage ?? "")
                }
              >
                <Download size={21} />
                {importJob &&
                !["complete", "error"].includes(importJob.stage)
                  ? "Importing…"
                  : "Import song and cover"}
              </button>
              <p className="import-notice">
                Single public videos only. Import media you have permission to
                download.
              </p>
            </form>

          </section>
        </div>

        <section className="surface admin-song-list">
          <div className="surface-heading">
            <span className="step-number">2</span>
            <div>
              <h2>Your songs</h2>
              <p>{songs.length} of 250 marker numbers assigned</p>
            </div>
          </div>

          {songs.length === 0 ? (
            <div className="empty-library">
              <FileMusic size={36} />
              <strong>No songs yet</strong>
              <span>Your first song will appear here.</span>
            </div>
          ) : (
            <div className="catalog-list">
              {songs.map((song) => (
                <article className="catalog-item" key={song.id}>
                  {/* SVG is generated by our marker endpoint. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/markers/${song.markerId}`}
                    alt={`ArUco marker ${song.markerId}`}
                  />
                  <div>
                    <span className="catalog-title-row">
                      <strong>{song.title}</strong>
                      {song.coverUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={song.coverUrl} alt="" className="catalog-cover" />
                      )}
                    </span>
                    <span>{song.artist || "Unknown artist"}</span>
                    <small>Marker {song.markerId}</small>
                  </div>
                  <button
                    type="button"
                    className="icon-button icon-button--danger"
                    aria-label={`Remove ${song.title}`}
                    onClick={() => void removeSong(song)}
                  >
                    <Trash2 size={19} />
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
