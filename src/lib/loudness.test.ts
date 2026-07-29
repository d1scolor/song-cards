import assert from "node:assert/strict";
import test from "node:test";
import {
  automaticGainDb,
  effectiveVolume,
  songCompensation
} from "@/lib/loudness";
import type { PlaybackSettings } from "@/lib/types";

const settings: PlaybackSettings = {
  masterVolume: 40,
  kioskPlaybackTarget: "owntone",
  loudnessCompensationEnabled: true,
  integratedTargetLufs: -16,
  shortTermTargetLufs: -13.5,
  curveDivisor: 74
};

test("balances average loudness while guarding loud sections", () => {
  assert.equal(
    automaticGainDb(
      { integratedLufs: -8.4, shortTermP95Lufs: -6.4 },
      settings
    ),
    -7.6
  );
  assert.equal(
    automaticGainDb(
      { integratedLufs: -21.1, shortTermP95Lufs: -17.7 },
      settings
    ),
    4.2
  );
});

test("combines automatic and manual gain using the calibrated curve", () => {
  const compensation = songCompensation(
    {
      integratedLufs: -21.1,
      shortTermP95Lufs: -17.7,
      manualGainDb: -1
    },
    settings
  );
  assert.deepEqual(compensation, {
    automaticGainDb: 4.2,
    manualGainDb: -1,
    totalGainDb: 3.2
  });
  assert.equal(effectiveVolume(40, compensation.totalGainDb, 74, 65), 44);
});

test("leaves unanalyzed songs at their manual correction", () => {
  assert.deepEqual(
    songCompensation(
      {
        integratedLufs: null,
        shortTermP95Lufs: null,
        manualGainDb: 2
      },
      settings
    ),
    {
      automaticGainDb: 0,
      manualGainDb: 2,
      totalGainDb: 2
    }
  );
});
