import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SPEED_ZOOM_MAX,
  PHYSICS_EARNED_SPEED_ZOOM_MAX,
  SPEED_ZOOM_MIN,
  resolveSpeedZoomFactor,
  resolveExceptionalSpeedZoomFactor,
} from '../src/render/camera.js';
import { resolveGovernedCombatSpeed } from '../src/core/flight/propulsionCatalog.js';
import {
  chaseCameraRefs,
  screenDepthWuAtSpeed,
  sampleOpeningCurve,
} from '../scripts/lib/bench/scenarios/feel.screen_crossing.mjs';

const VISION_SENTENCE =
  'Nimble in a fight. Zip around, stay in control of the combat area, turn NOW when I twitch, stop when I brake, drift when I choose to. Response starts instantly. The ship feels like a controllable mass, not a cursor.';

test('camera and instrument key off governed combat speed rather than legacy maxSpeed', () => {
  const dummyState = { settings: { video: { fov: 50 } } };
  const player = {
    maxSpeed: 172.07, // legacy derived stat
    propulsion: {
      family: 'reaction',
      combatSpeed: 195,
      maxSpeed: 195,
    },
  };

  const governedCap = resolveGovernedCombatSpeed(player, dummyState, player.maxSpeed || 120);
  assert.equal(
    governedCap,
    195,
    `${VISION_SENTENCE}: governed combat speed must resolve to propulsion profile combatSpeed (195), not legacy maxSpeed (172.07)`
  );

  const refs = chaseCameraRefs(dummyState, player);
  assert.equal(
    refs.maxSpeedRef,
    195,
    `${VISION_SENTENCE}: bench instrument chaseCameraRefs must re-key to governed combat speed (195)`
  );

  // At legacy maxSpeed (172.07), ordinary factor must not yet be saturated at SPEED_ZOOM_MAX.
  const factorAtLegacy = resolveSpeedZoomFactor(player.maxSpeed, governedCap, false);
  assert.ok(
    factorAtLegacy < SPEED_ZOOM_MAX,
    `${VISION_SENTENCE}: frame must not be saturated at legacy maxSpeed (got ${factorAtLegacy} < ${SPEED_ZOOM_MAX})`
  );

  // At governed cap, ordinary factor reaches SPEED_ZOOM_MAX.
  const factorAtCap = resolveSpeedZoomFactor(governedCap, governedCap, false);
  assert.equal(
    factorAtCap,
    SPEED_ZOOM_MAX,
    `${VISION_SENTENCE}: frame must reach SPEED_ZOOM_MAX at governed cap`
  );
});

test('depth growth at 2x and 3x the cap clears 1.5x and 2.5x with monotonic opening', () => {
  const cap = 95; // governed cruise speed
  const fovDeg = 50;

  assert.equal(
    SPEED_ZOOM_MAX,
    1.35,
    `${VISION_SENTENCE}: SPEED_ZOOM_MAX must be 1.35`
  );
  assert.equal(
    PHYSICS_EARNED_SPEED_ZOOM_MAX,
    3.5,
    `${VISION_SENTENCE}: PHYSICS_EARNED_SPEED_ZOOM_MAX must be 3.5`
  );

  const depthCruise = screenDepthWuAtSpeed(cap, { fovDeg, maxSpeedRef: cap, physicsEarned: false });
  const depth2x = screenDepthWuAtSpeed(2 * cap, { fovDeg, maxSpeedRef: cap, physicsEarned: true });
  const depth3x = screenDepthWuAtSpeed(3 * cap, { fovDeg, maxSpeedRef: cap, physicsEarned: true });

  const growth2x = depth2x / depthCruise;
  const growth3x = depth3x / depthCruise;

  assert.ok(
    growth2x >= 1.5,
    `${VISION_SENTENCE}: visible depth growth at 2x cruise must be >= 1.5x (got ${growth2x.toFixed(4)}x)`
  );
  assert.ok(
    growth3x >= 2.5,
    `${VISION_SENTENCE}: visible depth growth at 3x cruise must be >= 2.5x (got ${growth3x.toFixed(4)}x)`
  );

  // Monotonic curve and starter hull share >= 4%
  const starterHullWidthWu = 28; // 2 * radius 14
  const curve = sampleOpeningCurve({
    fromSpeed: cap,
    toSpeed: 3 * cap,
    fovDeg,
    maxSpeedRef: cap,
    hullWidthWu: starterHullWidthWu,
  });

  assert.ok(
    curve.monotonic,
    `${VISION_SENTENCE}: camera opening curve above cap must be monotonic`
  );
  assert.ok(
    curve.minHullFramePct >= 4.0,
    `${VISION_SENTENCE}: smallest hull share of frame width must be >= 4% (got ${curve.minHullFramePct.toFixed(2)}%)`
  );
});
