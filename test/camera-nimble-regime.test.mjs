import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHASE_ZOOM_DEFAULT,
  SPEED_ZOOM_MAX,
  PHYSICS_EARNED_SPEED_ZOOM_MAX,
  SPEED_ZOOM_MIN,
  createChaseCamera,
  resolveSpeedZoomFactor,
  resolveExceptionalSpeedZoomFactor,
} from '../src/render/camera.js';
import { resolveGovernedCombatSpeed } from '../src/core/flight/propulsionCatalog.js';
import { feel } from '../src/render/feel.js';
import { readOwnedExceptionalSpeed } from '../src/render/velocityLanguage.js';
import {
  chaseCameraRefs,
  screenDepthWuAtSpeed,
  sampleOpeningCurve,
} from '../scripts/lib/bench/scenarios/feel.screen_crossing.mjs';

const VISION_SENTENCE =
  'Nimble in a fight. Zip around, stay in control of the combat area, turn NOW when I twitch, stop when I brake, drift when I choose to. Response starts instantly. The ship feels like a controllable mass, not a cursor.';

const HITCH_LEGACY_MAX = 172.07;
const HITCH_GOVERNED_CRUISE = 95;
const FOV_DEG = 50;
const EPS = 1e-9;

function hitchPlayer(speed, { physicsEarned = true, motionReduce = false } = {}) {
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: speed, z: 0 },
    radius: 14,
    maxSpeed: HITCH_LEGACY_MAX,
    propulsion: {
      family: 'reaction',
      combatSpeed: HITCH_GOVERNED_CRUISE,
      maxSpeed: HITCH_GOVERNED_CRUISE,
    },
    flags: { boosting: false },
    _flightFrame: { governor: { physicsEarned } },
  };
  const state = {
    playerId: player.id,
    entities: new Map([[player.id, player]]),
    player: { tether: { active: false, targetId: null } },
    camera: {
      zoom: CHASE_ZOOM_DEFAULT,
      tilt: 60,
      lookAhead: 0,
      lerp: 6,
      trauma: 0,
    },
    settings: { video: { fov: FOV_DEG, motionReduce } },
    render: {},
    world: { frameOrigin: { x: 0, z: 0 }, frameOriginSeq: 0 },
    input: { aimWorld: null },
  };
  return { player, state };
}

function settleChaseDistance(speed, options = {}) {
  if (!globalThis.window) globalThis.window = { innerWidth: 1600, innerHeight: 900 };
  const published = publishHitchFeel(speed, options);
  const camera = createChaseCamera(published.state);
  camera.snapToPlayer();
  const dt = 1 / 60;
  for (let i = 0; i < 360; i++) camera.follow(dt);
  return camera.obj.position.distanceTo(published.state.camera.focus);
}

function publishHitchFeel(speed, options = {}) {
  const { player, state } = hitchPlayer(speed, options);
  const system = Object.create(feel);
  system.state = state;
  system._slCanvas = { isConnected: true, style: { opacity: '0' } };
  system._slCtx = {};
  system._slOpacity = 0;
  system._slGrain = 0;
  system._updateSpeedLines(0);
  return { player, state, exceptional: readOwnedExceptionalSpeed(state) };
}

function visibleDepthFromPublisher(speed, exceptional, maxSpeedRef) {
  const ordinary = resolveSpeedZoomFactor(speed, maxSpeedRef, false);
  const factor = resolveExceptionalSpeedZoomFactor(exceptional, ordinary);
  return 2 * Math.tan((FOV_DEG * Math.PI / 180) * 0.5) * CHASE_ZOOM_DEFAULT * factor * 0.72;
}

test('camera and instrument key off governed combat speed rather than legacy maxSpeed', () => {
  const dummyState = { settings: { video: { fov: FOV_DEG } } };
  const player = {
    maxSpeed: HITCH_LEGACY_MAX,
    propulsion: {
      family: 'reaction',
      combatSpeed: HITCH_GOVERNED_CRUISE,
      maxSpeed: HITCH_GOVERNED_CRUISE,
    },
  };

  const governedCap = resolveGovernedCombatSpeed(player, dummyState, player.maxSpeed || 120);
  assert.equal(
    governedCap,
    HITCH_GOVERNED_CRUISE,
    `${VISION_SENTENCE}: Hitch governed combat speed must resolve to ${HITCH_GOVERNED_CRUISE}, not legacy maxSpeed (${HITCH_LEGACY_MAX})`,
  );

  const refs = chaseCameraRefs(dummyState, player);
  assert.equal(
    refs.maxSpeedRef,
    HITCH_GOVERNED_CRUISE,
    `${VISION_SENTENCE}: bench instrument chaseCameraRefs must re-key to Hitch governed cruise (${HITCH_GOVERNED_CRUISE})`,
  );
  assert.equal(
    refs.earnedRef,
    undefined,
    `${VISION_SENTENCE}: the screen-crossing instrument must not keep a second legacy earnedRef`,
  );

  const factorAtCruiseGoverned = resolveSpeedZoomFactor(HITCH_GOVERNED_CRUISE, governedCap, false);
  assert.equal(
    factorAtCruiseGoverned,
    SPEED_ZOOM_MAX,
    `${VISION_SENTENCE}: at ${HITCH_GOVERNED_CRUISE} WU/s the governed reference must reach ordinary framing (${SPEED_ZOOM_MAX})`,
  );

  const factorAtCruiseLegacy = resolveSpeedZoomFactor(HITCH_GOVERNED_CRUISE, HITCH_LEGACY_MAX, false);
  assert.ok(
    factorAtCruiseLegacy < SPEED_ZOOM_MAX,
    `${VISION_SENTENCE}: at ${HITCH_GOVERNED_CRUISE} WU/s a legacy ${HITCH_LEGACY_MAX} reference leaves the frame too tight (got ${factorAtCruiseLegacy} < ${SPEED_ZOOM_MAX})`,
  );
  assert.ok(
    factorAtCruiseLegacy > SPEED_ZOOM_MIN,
    `${VISION_SENTENCE}: the legacy-keyed cruise frame must still be above idle (${SPEED_ZOOM_MIN})`,
  );
});

test('feel publisher at 2x and 3x Hitch cruise opens the frame for B3', () => {
  const cap = HITCH_GOVERNED_CRUISE;

  assert.equal(
    SPEED_ZOOM_MAX,
    1.35,
    `${VISION_SENTENCE}: SPEED_ZOOM_MAX must be 1.35`,
  );
  assert.equal(
    PHYSICS_EARNED_SPEED_ZOOM_MAX,
    3.5,
    `${VISION_SENTENCE}: PHYSICS_EARNED_SPEED_ZOOM_MAX must be 3.5`,
  );

  const published2x = publishHitchFeel(2 * cap);
  const published3x = publishHitchFeel(3 * cap);
  assert.ok(
    Math.abs(published2x.exceptional - 0.5) <= EPS,
    `${VISION_SENTENCE}: feel publisher at 2x Hitch cruise must emit exceptional 0.5 (got ${published2x.exceptional})`,
  );
  assert.ok(
    Math.abs(published3x.exceptional - 1) <= EPS,
    `${VISION_SENTENCE}: feel publisher at 3x Hitch cruise must emit exceptional 1.0 (got ${published3x.exceptional})`,
  );

  const depthCruise = screenDepthWuAtSpeed(cap, { fovDeg: FOV_DEG, maxSpeedRef: cap, physicsEarned: false });
  const depth2x = visibleDepthFromPublisher(2 * cap, published2x.exceptional, cap);
  const depth3x = visibleDepthFromPublisher(3 * cap, published3x.exceptional, cap);

  const growth2x = depth2x / depthCruise;
  const growth3x = depth3x / depthCruise;

  assert.ok(
    growth2x >= 1.5,
    `${VISION_SENTENCE}: visible depth growth at 2x cruise must be >= 1.5x (got ${growth2x.toFixed(4)}x)`,
  );
  assert.ok(
    growth3x >= 2.5,
    `${VISION_SENTENCE}: visible depth growth at 3x cruise must be >= 2.5x (got ${growth3x.toFixed(4)}x)`,
  );

  const helper2x = screenDepthWuAtSpeed(2 * cap, { fovDeg: FOV_DEG, maxSpeedRef: cap, physicsEarned: true });
  const helper3x = screenDepthWuAtSpeed(3 * cap, { fovDeg: FOV_DEG, maxSpeedRef: cap, physicsEarned: true });
  assert.ok(
    Math.abs(helper2x - depth2x) <= EPS,
    `${VISION_SENTENCE}: the screen-crossing helper at 2x must match the feel publisher path`,
  );
  assert.ok(
    Math.abs(helper3x - depth3x) <= EPS,
    `${VISION_SENTENCE}: the screen-crossing helper at 3x must match the feel publisher path`,
  );

  const starterHullWidthWu = 28; // 2 * radius 14
  const curve = sampleOpeningCurve({
    fromSpeed: cap,
    toSpeed: 3 * cap,
    fovDeg: FOV_DEG,
    maxSpeedRef: cap,
    hullWidthWu: starterHullWidthWu,
  });

  assert.ok(
    curve.monotonic,
    `${VISION_SENTENCE}: camera opening curve above cap must be monotonic`,
  );
  assert.ok(
    curve.minHullFramePct >= 4.0,
    `${VISION_SENTENCE}: smallest hull share of frame width must be >= 4% (got ${curve.minHullFramePct.toFixed(2)}%)`,
  );
});

test('shipping chase camera opens 1.5x and 2.5x at 2x and 3x Hitch cruise', () => {
  const cruiseDistance = settleChaseDistance(HITCH_GOVERNED_CRUISE);
  const distance2x = settleChaseDistance(2 * HITCH_GOVERNED_CRUISE);
  const distance3x = settleChaseDistance(3 * HITCH_GOVERNED_CRUISE);
  const growth2x = distance2x / cruiseDistance;
  const growth3x = distance3x / cruiseDistance;
  assert.ok(
    growth2x >= 1.5,
    `${VISION_SENTENCE}: live chase distance at 2x cruise must be >= 1.5x (got ${growth2x.toFixed(4)}x, ${distance2x.toFixed(2)} vs ${cruiseDistance.toFixed(2)} WU)`,
  );
  assert.ok(
    growth3x >= 2.5,
    `${VISION_SENTENCE}: live chase distance at 3x cruise must be >= 2.5x (got ${growth3x.toFixed(4)}x, ${distance3x.toFixed(2)} vs ${cruiseDistance.toFixed(2)} WU)`,
  );
});
