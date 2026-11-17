import { mkdir, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const vad = path.dirname(require.resolve("@ricky0123/vad-web"));
const ort = path.dirname(require.resolve("onnxruntime-web/wasm"));
const destination = path.resolve("public/voice");
await mkdir(destination, { recursive: true });
for (const file of ["silero_vad_v5.onnx", "vad.worklet.bundle.min.js"]) {
  await copyFile(path.join(vad, file), path.join(destination, file));
}
for (const file of [
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.mjs"
]) {
  await copyFile(path.join(ort, file), path.join(destination, file));
}
