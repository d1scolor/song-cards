import assert from "node:assert/strict";
import test from "node:test";
import {
  makePrintSheets,
  mirrorPrintRows
} from "@/lib/print-layout";

test("pads print sheets and mirrors each back row for long-edge duplex", () => {
  const [front] = makePrintSheets(["A", "B", "C", "D"], 9);

  assert.deepEqual(front, [
    "A",
    "B",
    "C",
    "D",
    null,
    null,
    null,
    null,
    null
  ]);
  assert.deepEqual(mirrorPrintRows(front, 3), [
    "C",
    "B",
    "A",
    null,
    null,
    "D",
    null,
    null,
    null
  ]);
});

test("splits card collections at the selected print density", () => {
  const sheets = makePrintSheets(
    Array.from({ length: 10 }, (_, index) => index),
    4
  );

  assert.equal(sheets.length, 3);
  assert.deepEqual(sheets[0], [0, 1, 2, 3]);
  assert.deepEqual(sheets[1], [4, 5, 6, 7]);
  assert.deepEqual(sheets[2], [8, 9, null, null]);
});
