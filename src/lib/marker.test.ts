import assert from "node:assert/strict";
import test from "node:test";
import { generateMarkerSvg, markerCapacity } from "@/lib/marker";

test("generates a printable marker from the configured dictionary", () => {
  const svg = generateMarkerSvg(0);
  assert.match(svg, /^<svg/);
  assert.match(svg, /viewBox=/);
  assert.match(svg, /fill="black"/);
});

test("rejects marker identifiers outside the fixed dictionary", () => {
  assert.throws(() => generateMarkerSvg(markerCapacity));
  assert.throws(() => generateMarkerSvg(-1));
});
