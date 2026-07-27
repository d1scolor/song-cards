"use client";

import {
  FileMusic,
  LogOut,
  Plus,
  Printer,
  Radio,
  Trash2
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { SongCard } from "@/lib/types";

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
    setCards((current) => [body.card, ...current]);
    setNextMarker((current) => {
      const used = new Set([...cards.map((card) => card.markerId), body.card.markerId]);
      for (let id = current; id < 250; id += 1) if (!used.has(id)) return id;
      return current;
    });
    setFileName("");
    form.reset();
  }

  async function removeCard(card: SongCard) {
    if (!window.confirm(`Remove “${card.title}” and its audio file?`)) return;
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
        <section className="surface add-song-card">
          <div className="surface-heading">
            <span className="step-number">1</span>
            <div>
              <h2>Add a song</h2>
              <p>The audio is stored locally and indexed by OwnTone.</p>
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
                    accept="audio/*,.flac,.m4a"
                    required
                    onChange={(event) =>
                      setFileName(event.target.files?.[0]?.name ?? "")
                    }
                  />
                </span>
              </label>
            </div>
            {error && <p className="form-error">{error}</p>}
            <button className="primary-button" type="submit" disabled={busy}>
              <Plus size={21} />
              {busy ? "Uploading…" : "Add song card"}
            </button>
          </form>
        </section>

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
                    <strong>{card.title}</strong>
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
