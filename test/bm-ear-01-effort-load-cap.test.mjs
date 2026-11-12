// BM-01 — first-flight engine effort voice: load tracks the governed combat speed.
//
// readDriveSpeed01 feeds engineEffortVoice's throttle-vs-speed load law. It normalized by
// the legacy derived top speed (~137 on the starter kestrel), which sits ~30% under the
// governed combat speed (195) the assisted governor actually holds — so the loaded growl
// dropped out a third of the way through every spool-up while the ship was still visibly
// gaining speed, and the calibration drifted with engine fittings the governor ignores.
// The propulsion catalog names resolveGovernedCombatSpeed as the reference presentation
// must key to; this pins that the effort voice does.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ENGINE_TIER_HZ,
  engineEffortVoice,
  readDriveSpeed01,
} from '../src/audio/elementaryVoices.js';

// The starter's governed combat speed (drive_reaction_m, fixed by the resolved drive).
const GOVERNED_COMBAT_SPEED = 195;
// A legacy-shaped derived cap in the measured band (live starter: ~136.8). Whatever it
// is, it must not set the load fraction.
const LEGACY_CAP = 140;

function starterAt(speed) {
  return {
    vel: { x: speed, z: 0 },
    driveId: 'drive_reaction_m',
    data: { derived: { maxSpeed: LEGACY_CAP } },
  };
}

test('seed 4242: half governed speed at full stick is loaded, not free', () => {
  const speed01 = readDriveSpeed01(starterAt(GOVERNED_COMBAT_SPEED / 2));
  assert.equal(speed01, 0.5);
  const voice = engineEffortVoice(ENGINE_TIER_HZ.thrust, { throttle: 1, speed01, braking: false });
  assert.equal(voice.kind, 'loaded');
  assert.ok(voice.hz < ENGINE_TIER_HZ.thrust);
});

test('seed 4242: governed cruise at full stick settles to free at the tier', () => {
  const speed01 = readDriveSpeed01(starterAt(GOVERNED_COMBAT_SPEED));
  assert.equal(speed01, 1);
  const voice = engineEffortVoice(ENGINE_TIER_HZ.thrust, { throttle: 1, speed01, braking: false });
  assert.equal(voice.kind, 'free');
  assert.equal(voice.hz, ENGINE_TIER_HZ.thrust);
});

test('seed 4242: a missing velocity leaves the authored tier (null, never zero)', () => {
  assert.equal(readDriveSpeed01(null), null);
  assert.equal(readDriveSpeed01({}), null);
  assert.equal(readDriveSpeed01({ id: 3, flags: {}, _flightFrame: { throttle: 1 } }), null);
  assert.equal(readDriveSpeed01({ vel: { x: Number.NaN, z: 0 }, driveId: 'drive_reaction_m' }), null);
  const voice = engineEffortVoice(ENGINE_TIER_HZ.thrust, { throttle: 1, speed01: null, braking: false });
  assert.equal(voice.kind, 'free');
  assert.equal(voice.hz, ENGINE_TIER_HZ.thrust);
});

test('seed 4242: zeroed authored speeds degrade to the legacy cap, not to silence', () => {
  const player = {
    vel: { x: 70, z: 0 },
    data: {
      derived: {
        maxSpeed: LEGACY_CAP,
        propulsion: {
          schemaVersion: 1, id: 'drive_reaction_m', label: 'x', family: 'reaction',
          travelCeiling: 438.75, solverSpeedLimit: Number.POSITIVE_INFINITY,
          combatSpeed: 0, maxSpeed: 0,
        },
      },
    },
  };
  assert.equal(readDriveSpeed01(player), 0.5);
});
