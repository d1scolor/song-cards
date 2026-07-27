"use client";

import { Camera, CameraOff, Check, Music2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { PlayerControls } from "@/components/player-controls";

type ScanStage = "idle" | "opening" | "scanning" | "starting" | "success" | "error";
type ScannedSong = { title: string; coverUrl: string | null };

export function Scanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const detectorRef = useRef<{
    detect(image: ImageData): { id: number }[];
  } | null>(null);
  const candidateRef = useRef<{ id: number; seen: number } | null>(null);
  const processingRef = useRef(false);
  const lastFrameRef = useRef(0);
  const [stage, setStage] = useState<ScanStage>("idle");
  const [message, setMessage] = useState("Pick a card and tap the button.");
  const [lastSong, setLastSong] = useState<ScannedSong | null>(null);

  const stopCamera = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const submitMarker = useCallback(
    async (markerId: number) => {
      if (processingRef.current) return;
      processingRef.current = true;
      setStage("starting");
      setMessage("Starting your song…");
      stopCamera();
      try {
        const response = await fetch("/api/scan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ markerId })
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "That card did not work.");
        setLastSong({
          title: body.song.title,
          coverUrl: body.song.coverUrl ?? null
        });
        setStage("success");
        setMessage(`${body.song.title} is playing!`);
      } catch (error) {
        setStage("error");
        setMessage(
          error instanceof Error ? error.message : "That card did not work."
        );
      } finally {
        processingRef.current = false;
      }
    },
    [stopCamera]
  );

  function scanFrame(time: number) {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !detectorRef.current || !streamRef.current) return;

    if (time - lastFrameRef.current >= 120 && video.readyState >= 2) {
      lastFrameRef.current = time;
      const maxWidth = 640;
      const scale = Math.min(1, maxWidth / video.videoWidth);
      canvas.width = Math.max(1, Math.floor(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.floor(video.videoHeight * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const markers = detectorRef.current.detect(
          context.getImageData(0, 0, canvas.width, canvas.height)
        );
        const marker = markers[0];
        if (marker) {
          if (candidateRef.current?.id === marker.id) {
            candidateRef.current.seen += 1;
          } else {
            candidateRef.current = { id: marker.id, seen: 1 };
          }
          if (candidateRef.current.seen >= 2) {
            void submitMarker(marker.id);
            return;
          }
        } else {
          candidateRef.current = null;
        }
      }
    }
    frameRef.current = requestAnimationFrame(scanFrame);
  }

  async function startCamera() {
    setStage("opening");
    setMessage("Opening the camera…");
    setLastSong(null);
    candidateRef.current = null;
    try {
      const arucoModule = await import("js-aruco2");
      detectorRef.current = new arucoModule.AR.Detector({
        dictionaryName: "ARUCO_MIP_36h12",
        maxHammingDistance: 5
      });
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      streamRef.current = stream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setStage("scanning");
      setMessage("Hold the whole square inside the frame.");
      frameRef.current = requestAnimationFrame(scanFrame);
    } catch (error) {
      stopCamera();
      setStage("error");
      setMessage(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Camera access was blocked. Allow the camera and try again."
          : "The camera could not be opened."
      );
    }
  }

  const scanning = stage === "opening" || stage === "scanning";

  return (
    <main className="kiosk-shell">
      <div className="kiosk-orb kiosk-orb--one" />
      <div className="kiosk-orb kiosk-orb--two" />
      <header className="kiosk-header">
        <div className="brand-mark" aria-hidden="true">
          <Music2 size={29} />
        </div>
        <div>
          <span className="brand-name">Song Cards</span>
          <span className="brand-subtitle">Pick · Scan · Listen</span>
        </div>
      </header>

      <section className="scanner-stage" aria-live="polite">
        <div className={`camera-card ${scanning ? "is-active" : ""}`}>
          <video
            ref={videoRef}
            className="camera-preview"
            muted
            playsInline
            aria-label="Camera preview"
          />
          <canvas ref={canvasRef} hidden />

          {!scanning && (
            <div
              className={`camera-placeholder ${
                stage === "success" && lastSong?.coverUrl
                  ? "camera-placeholder--cover"
                  : ""
              }`}
            >
              {stage === "success" && lastSong?.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="playback-cover"
                  src={lastSong.coverUrl}
                  alt={`${lastSong.title} cover`}
                />
              ) : (
                <>
                  <div
                    className={`camera-symbol ${
                      stage === "success" ? "is-success" : ""
                    }`}
                  >
                    {stage === "success" ? (
                      <Check size={66} strokeWidth={3} />
                    ) : stage === "error" ? (
                      <CameraOff size={62} />
                    ) : (
                      <Music2 size={64} />
                    )}
                  </div>
                  {lastSong && (
                    <strong className="last-song">{lastSong.title}</strong>
                  )}
                </>
              )}
            </div>
          )}

          {scanning && (
            <div className="scan-guide" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <i />
            </div>
          )}
        </div>

        <div className="scanner-copy">
          <h1>
            {stage === "scanning"
              ? "Show me your card"
              : stage === "success"
                ? "Great choice!"
                : "Ready for a song?"}
          </h1>
          <p>{message}</p>
        </div>

        {scanning ? (
          <button
            className="scan-button scan-button--cancel"
            type="button"
            onClick={() => {
              stopCamera();
              setStage("idle");
              setMessage("Pick a card and tap the button.");
            }}
          >
            <CameraOff size={32} />
            Cancel
          </button>
        ) : (
          <button
            className="scan-button"
            type="button"
            disabled={stage === "starting"}
            onClick={() => void startCamera()}
          >
            {stage === "starting" ? (
              <RefreshCw className="spin" size={34} />
            ) : (
              <Camera size={36} />
            )}
            {stage === "success" ? "Scan another card" : "Scan my card"}
          </button>
        )}
      </section>

      <PlayerControls compact />
    </main>
  );
}
