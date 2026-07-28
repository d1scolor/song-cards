import assert from "node:assert/strict";
import test from "node:test";
import {
  formatCardRange,
  parseCardRange
} from "@/lib/card-selection";

test("parses printer-style card ranges", () => {
  assert.deepEqual(parseCardRange("1, 2, 4-6, 9-10", 10), [
    1,
    2,
    4,
    5,
    6,
    9,
    10
  ]);
  assert.deepEqual(parseCardRange("3-5, 4, 1", 5), [1, 3, 4, 5]);
  assert.deepEqual(parseCardRange("", 5), []);
});

test("rejects invalid or out-of-range card ranges", () => {
  assert.throws(() => parseCardRange("0-2", 5), /between 1 and 5/);
  assert.throws(() => parseCardRange("4-2", 5), /lower number first/);
  assert.throws(() => parseCardRange("1, hello", 5), /numbers and ranges/);
});

test("formats selected card numbers as compact ranges", () => {
  assert.equal(formatCardRange([1, 2, 3, 7, 9, 8, 3]), "1-3, 7-9");
  assert.equal(formatCardRange([]), "");
});
