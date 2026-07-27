"use client";

import {
  CircleCheck,
  Download,
  FileMusic,
  ImagePlus,
  LogOut,
  Plus,
  Printer,
  Radio,
  RefreshCw,
  TriangleAlert,
  Trash2
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import type {
  SongCard,
  YouTubeImportJob,
  YtDlpStatus
} from "@/lib/types";

export function AdminClient({
  initialCards,
  initialNextMarker
}: {
  initialCards: SongCard[];
  initialNextMarker: number;
}) {
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);
  const [nextMarker, setNextMarker] = useState(initialNextMarker);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [coverFileName, setCoverFileName] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [importJob, setImportJob] = useState<YouTubeImportJob | null>(null);
  const [importError, setImportError] = useState("");
  const [toolStatus, setToolStatus] = useState<YtDlpStatus | null>(null);
  const [updatingTool, setUpdatingTool] = useState(false);

  const refreshCatalog = useCallback(async () => {
    const response = await fetch("/api/admin/catalog", { cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json();
    setCards(body.cards);
    setNextMarker(body.nextMarkerId);
  }, []);

  useEffect(() => {
    void fetch("/api/admin/tools/yt-dlp", { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => setToolStatus(body.status))
      .catch(() => undefined);
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

  async function updateDownloader() {
    setUpdatingTool(true);
    const response = await fetch("/api/admin/tools/yt-dlp", { method: "POST" });
    const body = await response.json();
    setUpdatingTool(false);
    if (response.ok) setToolStatus(body.status);
  }

  async function removeCard(card: SongCard) {
    if (!window.confirm(`Remove “${card.title}” and its files?`)) return;
    const response = await fetch(`/api/admin/catalog/${card.id}`, {
      method: "DELETE"
    });
    if (!response.ok) {
      const body = await response.json();
      setError(body.error ?? "Unable to remove the song.");
      return;
    }
    setCards((current) => current.filter((item) => item.id !== card.id));
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <main className="admin-shell">
      <header className="dashboard-header admin-header">
        <Link href="/play" className="dashboard-brand">
          <span className="brand-mark">
            <FileMusic size={25} />
          </span>
          <span>Song Cards</span>
        </Link>
        <nav>
          <Link className="text-link" href="/control">
            <Radio size={18} />
            Controls
          </Link>
          <button className="text-button" type="button" onClick={() => void logout()}>
            <LogOut size={18} />
            Sign out
          </button>
        </nav>
      </header>

      <section className="admin-hero">
        <div>
          <span className="section-kicker">Card library</span>
          <h1>Make music tangible.</h1>
          <p>Add a song, assign its marker, then print a card ready to scan.</p>
        </div>
        <Link
          className={`secondary-button ${cards.length === 0 ? "is-disabled" : ""}`}
          href={cards.length ? "/admin/print" : "#"}
          aria-disabled={cards.length === 0}
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
              {busy ? "Uploading…" : "Add song card"}
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

            <div className="tool-status">
              <div>
                <strong>
                  yt-dlp {toolStatus?.version ?? "checking…"}
                </strong>
                <span>{toolStatus?.message ?? "Checking the downloader…"}</span>
              </div>
              <button
                type="button"
                className="tool-update-button"
                disabled={updatingTool || !toolStatus?.managed}
                onClick={() => void updateDownloader()}
              >
                <RefreshCw
                  className={updatingTool ? "spin" : ""}
                  size={16}
                />
                Update
              </button>
            </div>
          </section>
        </div>

        <section className="surface library-card">
          <div className="surface-heading">
            <span className="step-number">2</span>
            <div>
              <h2>Your cards</h2>
              <p>{cards.length} of 250 marker numbers assigned</p>
            </div>
          </div>

          {cards.length === 0 ? (
            <div className="empty-library">
              <FileMusic size={36} />
              <strong>No song cards yet</strong>
              <span>Your first card will appear here.</span>
            </div>
          ) : (
            <div className="catalog-list">
              {cards.map((card) => (
                <article className="catalog-item" key={card.id}>
                  {/* SVG is generated by our marker endpoint. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/markers/${card.markerId}`}
                    alt={`ArUco marker ${card.markerId}`}
                  />
                  <div>
                    <span className="catalog-title-row">
                      <strong>{card.title}</strong>
                      {card.coverUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={card.coverUrl} alt="" className="catalog-cover" />
                      )}
                    </span>
                    <span>{card.artist || "Unknown artist"}</span>
                    <small>Marker {card.markerId}</small>
                  </div>
                  <button
                    type="button"
                    className="icon-button icon-button--danger"
                    aria-label={`Remove ${card.title}`}
                    onClick={() => void removeCard(card)}
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
