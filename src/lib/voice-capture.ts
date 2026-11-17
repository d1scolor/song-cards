import { withDeadline } from "@/lib/async-deadline";

export type VoiceCaptureResources = {
  stream?: MediaStream;
  vad?: { destroy: () => Promise<void> };
  context?: AudioContext;
  cleanup?: Promise<void>;
};

export function releaseVoiceCapture(
  resources: VoiceCaptureResources
): Promise<void> {
  if (resources.cleanup) return resources.cleanup;
  const { stream, vad, context } = resources;
  resources.stream = undefined;
  resources.vad = undefined;
  resources.context = undefined;
  // Release the device immediately, even if WASM disposal or AudioContext.close
  // stalls. A request finishing or cancelling later must not destroy it twice.
  stream?.getTracks().forEach((track) => track.stop());
  resources.cleanup = Promise.allSettled([
    withDeadline(
      Promise.resolve().then(() => vad?.destroy()),
      1500
    ),
    withDeadline(
      Promise.resolve().then(() =>
        context && context.state !== "closed" ? context.close() : undefined
      ),
      1500
    )
  ]).then(() => undefined);
  return resources.cleanup;
}
