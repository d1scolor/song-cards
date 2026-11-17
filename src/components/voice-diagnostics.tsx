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
        indexing. Recordings, transcripts, API keys, and signed URLs are not
        logged.
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
        The same redacted events appear in Portainer’s container Logs view,
        prefixed with [voice].
      </p>
    </section>
  );
}
