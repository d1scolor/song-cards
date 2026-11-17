"use client";

import { Mic } from "lucide-react";
import { useEffect, useState } from "react";
import type { PublicVoiceSettings } from "@/lib/voice-settings";

export function VoiceSettingsPanel() {
  const [settings, setSettings] = useState<PublicVoiceSettings | null>(null);
  const [asrKey, setAsrKey] = useState("");
  const [llmKey, setLlmKey] = useState("");
  const [clearAsr, setClearAsr] = useState(false);
  const [clearLlm, setClearLlm] = useState(false);
  const [channels, setChannels] = useState("");
  const [cacheCount, setCacheCount] = useState(0);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/settings/voice", {
      cache: "no-store",
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const body = await response.json();
        setSettings(body.settings);
        setChannels(body.settings.preferredChannels.join("\n"));
        setCacheCount(body.cacheCount);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setMessage("Voice settings could not be loaded.");
      });
    return () => controller.abort();
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    setMessage("");
    try {
      const values = {
        ...settings,
        asrKeyConfigured: undefined,
        llmKeyConfigured: undefined
      };
      const response = await fetch("/api/admin/settings/voice", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...values,
          preferredChannels: [
            ...new Set(channels.split(/[\s,]+/).filter(Boolean))
          ],
          ...(asrKey || clearAsr ? { asrApiKey: clearAsr ? "" : asrKey } : {}),
          ...(llmKey || clearLlm ? { llmApiKey: clearLlm ? "" : llmKey } : {})
        })
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Voice settings could not be saved.");
      setSettings(body.settings);
      setCacheCount(body.cacheCount);
      setAsrKey("");
      setLlmKey("");
      setClearAsr(false);
      setClearLlm(false);
      setMessage(
        "Voice settings saved. Reload the kiosk to update its voice button."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Voice settings could not be saved."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="surface system-panel system-panel--wide">
      <div className="system-panel__heading">
        <span className="system-panel__icon system-panel__icon--loudness">
          <Mic size={26} aria-hidden="true" />
        </span>
        <div>
          <span className="section-kicker">Optional</span>
          <h2>Ask for a song</h2>
        </div>
      </div>
      {settings ? (
        <form className="voice-settings" onSubmit={(event) => void save(event)}>
          <fieldset disabled={saving}>
            <label className="toggle-field">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(event) =>
                  setSettings({ ...settings, enabled: event.target.checked })
                }
              />
              <span>
                <strong>Enable voice requests</strong>
                <small>Add a microphone button to the kiosk.</small>
              </span>
            </label>
            <div className="voice-service-fields">
              <fieldset>
                <legend>Speech recognition</legend>
                <label>
                  Transcription endpoint
                  <input
                    type="url"
                    value={settings.asrUrl}
                    placeholder="http://server:8000/v1/audio/transcriptions"
                    onChange={(event) =>
                      setSettings({ ...settings, asrUrl: event.target.value })
                    }
                  />
                </label>
                <label>
                  ASR model
                  <input
                    value={settings.asrModel}
                    onChange={(event) =>
                      setSettings({ ...settings, asrModel: event.target.value })
                    }
                  />
                </label>
                <label>
                  API key
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={asrKey}
                    disabled={clearAsr}
                    placeholder={
                      settings.asrKeyConfigured
                        ? "Saved — leave blank to keep"
                        : "Optional"
                    }
                    onChange={(event) => setAsrKey(event.target.value)}
                  />
                </label>
                {settings.asrKeyConfigured && (
                  <label className="voice-key-clear">
                    <input
                      type="checkbox"
                      checked={clearAsr}
                      onChange={(event) => setClearAsr(event.target.checked)}
                    />
                    Remove saved key
                  </label>
                )}
              </fieldset>
              <fieldset>
                <legend>Song selection</legend>
                <label>
                  Chat completions endpoint
                  <input
                    type="url"
                    value={settings.llmUrl}
                    placeholder="http://server:8000/v1/chat/completions"
                    onChange={(event) =>
                      setSettings({ ...settings, llmUrl: event.target.value })
                    }
                  />
                </label>
                <label>
                  LLM model
                  <input
                    value={settings.llmModel}
                    onChange={(event) =>
                      setSettings({ ...settings, llmModel: event.target.value })
                    }
                  />
                </label>
                <label>
                  API key
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={llmKey}
                    disabled={clearLlm}
                    placeholder={
                      settings.llmKeyConfigured
                        ? "Saved — leave blank to keep"
                        : "Optional"
                    }
                    onChange={(event) => setLlmKey(event.target.value)}
                  />
                </label>
                {settings.llmKeyConfigured && (
                  <label className="voice-key-clear">
                    <input
                      type="checkbox"
                      checked={clearLlm}
                      onChange={(event) => setClearLlm(event.target.checked)}
                    />
                    Remove saved key
                  </label>
                )}
              </fieldset>
            </div>
            <label>
              Preferred language
              <input
                value={settings.language}
                maxLength={80}
                onChange={(event) =>
                  setSettings({ ...settings, language: event.target.value })
                }
              />
            </label>
            <label className="toggle-field">
              <input
                type="checkbox"
                checked={settings.onlineEnabled}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    onlineEnabled: event.target.checked
                  })
                }
              />
              <span>
                <strong>Allow YouTube discovery</strong>
                <small>
                  Search online when the local library has no suitable song.
                </small>
              </span>
            </label>
            <label>
              Preferred YouTube channel IDs (up to three)
              <textarea
                value={channels}
                rows={3}
                placeholder="UC… — one channel ID per line; leave empty to search all YouTube"
                onChange={(event) => setChannels(event.target.value)}
              />
            </label>
            <small>
              When channels are supplied, online results are restricted to those
              channels.
            </small>
            <label>
              Maximum online song length (seconds)
              <input
                type="number"
                min={30}
                max={1800}
                value={settings.maxSongSeconds}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    maxSongSeconds: Number(event.target.value)
                  })
                }
              />
            </label>
            <p className="system-message">
              Downloaded voice songs use a separate cache: {cacheCount} of 20
              songs. Older entries are removed as new ones arrive. Card numbers
              are never assigned automatically.
            </p>
            <p className="system-message">
              API keys are stored in the server database and are never sent back
              to this page. Include that database in your private backups.
            </p>
            <button
              className="secondary-button"
              type="submit"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save voice settings"}
            </button>
          </fieldset>
        </form>
      ) : (
        <p className="system-message">Loading voice settings…</p>
      )}
      {message && (
        <p role="status" className="settings-result">
          {message}
        </p>
      )}
    </section>
  );
}
