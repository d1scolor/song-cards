export const maxVoiceUploadBytes = 1_100_000;

// The kiosk sends a canonical 16 kHz mono PCM WAV, not arbitrary media.
export function validateVoiceWav(bytes: Uint8Array) {
  if (bytes.byteLength < 44 || bytes.byteLength > maxVoiceUploadBytes)
    return false;
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number, text: string) =>
    [...text].every(
      (char, index) => bytes[offset + index] === char.charCodeAt(0)
    );
  const samples = data.getUint32(40, true);
  return (
    tag(0, "RIFF") &&
    tag(8, "WAVE") &&
    tag(12, "fmt ") &&
    tag(36, "data") &&
    data.getUint32(16, true) === 16 &&
    data.getUint16(20, true) === 1 &&
    data.getUint16(22, true) === 1 &&
    data.getUint32(24, true) === 16000 &&
    data.getUint32(28, true) === 32000 &&
    data.getUint16(32, true) === 2 &&
    data.getUint16(34, true) === 16 &&
    samples === bytes.byteLength - 44 &&
    samples >= 3200 &&
    samples <= 30 * 32000 &&
    samples % 2 === 0 &&
    data.getUint32(4, true) === bytes.byteLength - 8
  );
}

export function encodeVoiceWav(samples: Float32Array): ArrayBuffer {
  const output = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(output);
  const tag = (offset: number, text: string) => {
    [...text].forEach((char, index) =>
      view.setUint8(offset + index, char.charCodeAt(0))
    );
  };
  tag(0, "RIFF");
  view.setUint32(4, output.byteLength - 8, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => {
    const value = Math.max(-1, Math.min(1, sample));
    view.setInt16(
      44 + index * 2,
      value < 0 ? value * 32768 : value * 32767,
      true
    );
  });
  return output;
}
