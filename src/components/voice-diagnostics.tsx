"use client";
import { useEffect, useState, useCallback } from "react";
import type { VoiceDiagnosticRecord } from "@/lib/voice-diagnostics";
import { voiceErrorDescriptions } from "@/lib/voice-errors";

export function VoiceDiagnostics() {
  const [records, setRecords] = useState<VoiceDiagnosticRecord[]>([]);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/voice/diagnostics", {
        cache: "no-store"
      });
      if (!response.ok) throw new Error();
      const body = await response.json();
      setRecords(body.requests);
      setMessage("");
    } catch {
      setMessage("Voice diagnostics could not be loaded.");
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  const text = records
    .map(
      (record) =>
        `Request ${record.request} · ${new Date(record.startedAt).toLocaleString()}\n` +
        (record.transcript !== undefined
          ? `ASR transcript: ${JSON.stringify(record.transcript)}\n`
          : "") +
        record.events
          .map((entry) => {
            const { at, phase, event, ...details } = entry;
            return `${new Date(at).toLocaleTimeString()} ${phase} ${event} ${JSON.stringify(details)}${entry.code ? "\n  " + voiceErrorDescriptions[entry.code] : ""}`;
          })
          .join("\n")
    )
    .join("\n\n");
  return (
    <section className="voice-diagnostics" aria-label="Voice diagnostics">
      <h3>Recent voice activity</h3>
      <p className="system-message">
        Shows the last 20 requests for this running server, including capture,
        ASR, selection, YouTube download, audio processing, and speaker
        indexing. ASR transcripts are included here and in copied diagnostics,
        kept only in server memory until restart or history pruning.
        Recordings, API keys, and signed download URLs are not retained here.
      </p>
      <div className="voice-diagnostic-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={() => void refresh()}
        >
          Refresh voice activity
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={!text}
          onClick={() => {
            void navigator.clipboard.writeText(text).then(
              () => setMessage("Diagnostics copied."),
              () => setMessage("Select and copy the log text below.")
            );
          }}
        >
          Copy diagnostics
        </button>
      </div>
      {text ? (
        <pre className="voice-diagnostic-log" tabIndex={0}>
          {text}
        </pre>
      ) : (
        <p className="system-message">
          No voice activity recorded since this server started. Try a request,
          then refresh.
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <p className="system-message">
        Stage events also appear in Portainer’s container Logs view, prefixed
        with [voice]. Transcripts appear only in this protected admin history.
      </p>
    </section>
  );
}
