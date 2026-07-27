import assert from "node:assert/strict";
import test from "node:test";
import {
  makePrintSheets,
  mirrorPrintRows
} from "@/lib/print-layout";

test("pads print sheets and mirrors each back row for long-edge duplex", () => {
  const [front] = makePrintSheets(["A", "B", "C", "D"]);

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
  assert.deepEqual(mirrorPrintRows(front), [
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

test("splits card collections across nine-card print sheets", () => {
  const sheets = makePrintSheets(
    Array.from({ length: 10 }, (_, index) => index)
  );

  assert.equal(sheets.length, 2);
  assert.deepEqual(sheets[0], [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(sheets[1], [
    9,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null
  ]);
});
