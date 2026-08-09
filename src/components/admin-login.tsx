"use client";

import { KeyRound, Music2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { adminLoginErrorMessage } from "@/lib/admin-login-error";

export function AdminLogin() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: form.get("password") })
      });
      if (!response.ok) {
        setError(await adminLoginErrorMessage(response));
        return;
      }
      router.replace("/admin/now-playing");
      router.refresh();
    } catch {
      setError(
        "Song Cards could not reach the server to check the password. Check your connection and try again."
      );
    } finally {
      setBusy(false);
    }
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
                aria-describedby={error ? "admin-login-error" : undefined}
                aria-invalid={Boolean(error)}
                required
                autoFocus
              />
            </span>
          </label>
          {error && (
            <p className="form-error" id="admin-login-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
