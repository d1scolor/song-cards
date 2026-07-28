"use client";

import { KeyRound, Music2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLogin() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: form.get("password") })
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? "Unable to sign in.");
      return;
    }
    router.replace("/admin/songs");
    router.refresh();
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark brand-mark--large" aria-hidden="true">
          <Music2 size={36} />
        </div>
        <span className="section-kicker">Song Cards</span>
        <h1>Caregivers only</h1>
        <p>Sign in to add songs, assign markers, and print cards.</p>
        <form onSubmit={submit}>
          <label>
            Password
            <span className="input-with-icon">
              <KeyRound size={20} aria-hidden="true" />
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                autoFocus
              />
            </span>
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
