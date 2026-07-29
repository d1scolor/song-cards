"use client";

import {
  CircleCheck,
  Download,
  FileMusic,
  ImagePlus,
  Library,
  Plus,
  RefreshCw,
  TriangleAlert
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import type { YouTubeImportJob } from "@/lib/types";

export function SongManager({
  initialNextMarker
}: {
  initialNextMarker: number;
}) {
  const [nextMarker, setNextMarker] = useState(initialNextMarker);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [coverFileName, setCoverFileName] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [importJob, setImportJob] = useState<YouTubeImportJob | null>(null);
  const [importError, setImportError] = useState("");
  const [addedMessage, setAddedMessage] = useState("");

  const refreshNextMarker = useCallback(async () => {
    const response = await fetch("/api/admin/catalog", { cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json();
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
          if (cancelled) return;
          setImportError("");
          setImportJob(body.job);
          if (body.job.stage === "complete") {
            setImportUrl("");
            setAddedMessage("The imported song is ready in your library.");
            void refreshNextMarker();
          }
        })
        .catch((pollError) => {
          if (cancelled) return;
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
        });
    }, 1_000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [importJob, refreshNextMarker]);

  async function addCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setAddedMessage("");
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
    setAddedMessage(`${body.card?.title ?? "The song"} is ready in your library.`);
    await refreshNextMarker();
    setFileName("");
    setCoverFileName("");
    form.reset();
  }

  async function importFromLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setImportError("");
    setAddedMessage("");
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

  return (
    <main className="admin-shell add-songs-page">
      <section className="admin-hero">
        <div>
          <span className="section-kicker">Add songs</span>
          <h1>Grow the library.</h1>
          <p>Upload an audio file or import media from a supported public link.</p>
        </div>
        <Link className="secondary-button" href="/admin/library">
          <Library size={20} aria-hidden="true" />
          Open library
        </Link>
      </section>

      {addedMessage && (
        <p className="add-song-success" aria-live="polite">
          <CircleCheck size={20} aria-hidden="true" />
          {addedMessage}
        </p>
      )}

      <div className="admin-create-grid">
        <section className="surface add-song-card">
          <div className="surface-heading">
            <span className="step-number">1</span>
            <div>
              <h2>Upload a song</h2>
              <p>Most audio formats are accepted and converted when needed.</p>
            </div>
          </div>
          <form onSubmit={addCard}>
            <label>
              Song title
              <input
                name="title"
                maxLength={120}
                required
                placeholder="Here Comes the Sun"
              />
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
                  <FileMusic size={21} aria-hidden="true" />
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
                <ImagePlus size={21} aria-hidden="true" />
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
              <Plus size={21} aria-hidden="true" />
              {busy ? "Uploading…" : "Add song"}
            </button>
          </form>
        </section>

        <section className="surface youtube-import-card">
          <div className="surface-heading">
            <span className="step-number step-number--youtube">
              <Download size={18} aria-hidden="true" />
            </span>
            <div>
              <h2>Import from a link</h2>
              <p>
                yt-dlp collects audio, title, artist, and artwork from
                supported sites.
              </p>
            </div>
          </div>
          <form onSubmit={importFromLink}>
            <label>
              Media link
              <input
                name="url"
                type="url"
                required
                value={importUrl}
                placeholder="https://youtube.com/… or https://bilibili.com/…"
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
                key={`import-${nextMarker}`}
                required
              />
            </label>

            {importJob && (
              <div
                className={`import-status import-status--${importJob.stage}`}
                aria-live="polite"
              >
                {importJob.stage === "complete" ? (
                  <CircleCheck size={21} aria-hidden="true" />
                ) : importJob.stage === "error" ? (
                  <TriangleAlert size={21} aria-hidden="true" />
                ) : (
                  <RefreshCw className="spin" size={20} aria-hidden="true" />
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
              <Download size={21} aria-hidden="true" />
              {importJob && !["complete", "error"].includes(importJob.stage)
                ? "Importing…"
                : "Import song and cover"}
            </button>
            <p className="import-notice">
              Single public HTTPS media pages only. Import media you have
              permission to download.
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}
