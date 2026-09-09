// PQ-027.03 named leaf. Live Rapier hold is test/environmental-aperture-jam.test.mjs
// seed 2703. This file pins the contract; it does not boot a second Rapier world.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  APERTURE_HOLD_FIELD,
  APERTURE_JAM_HOLD_S,
  APERTURE_PINCH_FIELD,
  APERTURE_SECTOR_ID,
  apertureHazardZones,
  aperturePhase,
} from '../src/data/environmentalMachinery.js';

const PROOF = join(dirname(fileURLToPath(import.meta.url)), 'environmental-aperture-jam.test.mjs');

test('PQ-027.03 leaf names the live Rapier hold on seed 2703', () => {
  assert.equal(APERTURE_JAM_HOLD_S, 20);
  assert.equal(APERTURE_HOLD_FIELD.kind, 'cone');
  assert.ok(APERTURE_HOLD_FIELD.strength > 0, 'hold cone writes force, not a spawn lock');
  assert.equal(APERTURE_PINCH_FIELD.kind, 'sheet');
  assert.ok(APERTURE_PINCH_FIELD.strength > 0, 'pinch sheet writes force');

  const jamStart = 8;
  const stillHeld = aperturePhase(jamStart + APERTURE_JAM_HOLD_S - 0.05, {
    occupied: false,
    jammedAtS: jamStart,
  });
  assert.equal(stillHeld.phase, 'jam');
  const released = aperturePhase(jamStart + APERTURE_JAM_HOLD_S + 0.05, {
    occupied: false,
    jammedAtS: jamStart,
  });
  assert.equal(released.phase, 'open');

  const zones = apertureHazardZones(APERTURE_SECTOR_ID);
  assert.equal(zones.length, 1);
  assert.equal(zones[0].type, 'debris_current');
  assert.notEqual(zones[0].type, 'radiation');

  assert.equal(existsSync(PROOF), true, 'Rapier hold lives in environmental-aperture-jam.test.mjs');
});
