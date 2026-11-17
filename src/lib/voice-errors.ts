export const voiceErrorDescriptions = {
  microphone_permission_denied:
    "Microphone permission was denied by the browser or operating system.",
  microphone_busy:
    "The microphone could not be read; another application or device setting may be blocking it.",
  microphone_missing: "No usable microphone was found.",
  capture_timeout: "Browser microphone or audio-context setup timed out.",
  sample_rate_mismatch:
    "Firefox could not connect the microphone and audio context at their sample rates.",
  audio_context_failed:
    "The browser could not initialize the capture audio graph.",
  vad_loading_failed:
    "The browser could not load or initialize the VAD model/WASM runtime; check its browser Console and the /voice assets.",
  vad_start_failed:
    "The browser could not start the voice-detection audio worklet or connect its microphone stream.",
  service_http_error:
    "The ASR or model endpoint rejected the request; check the HTTP status and service configuration.",
  invalid_response: "The service or media tool returned an invalid response.",
  network_error: "The configured service could not be reached.",
  timeout: "The operation exceeded its time limit.",
  youtube_auth_required:
    "YouTube requires sign-in, a bot check, or a proof-of-origin token for this video/server.",
  youtube_forbidden: "YouTube rejected the media request with HTTP 403.",
  youtube_rate_limited: "YouTube is rate-limiting this server (HTTP 429).",
  youtube_format_unavailable:
    "The selected video has no available audio format.",
  youtube_unavailable:
    "The video is unavailable, private, or region restricted.",
  tool_missing:
    "yt-dlp, FFmpeg, or FFprobe could not be started; check the configured tool paths.",
  youtube_search_failed: "The YouTube search command failed.",
  download_failed: "The audio download failed.",
  no_downloaded_audio:
    "No audio file was produced; the video may have been skipped by the duration/size filters.",
  video_changed:
    "Downloaded video metadata did not match the selected search result or configured limits.",
  audio_processing_failed:
    "FFmpeg/FFprobe could not prepare or analyze the downloaded audio.",
  speaker_http_error:
    "OwnTone rejected a request; check the HTTP status and OwnTone container logs.",
  speaker_index_timeout:
    "The downloaded file was not indexed by OwnTone within 30 seconds; check the shared media volume and OwnTone library directory.",
  invalid_model_action:
    "The model returned prose or an invalid action instead of one supported tool action.",
  operation_failed:
    "The operation failed; inspect the recorded stage to locate the failing service."
} as const;

export type VoiceErrorCode = keyof typeof voiceErrorDescriptions;
export class VoiceOperationError extends Error {
  constructor(
    readonly code: VoiceErrorCode,
    readonly httpStatus?: number,
    message?: string
  ) {
    super(message ?? voiceErrorDescriptions[code]);
    this.name = "VoiceOperationError";
  }
}
