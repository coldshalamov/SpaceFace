import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CAMERA_TRAUMA_TUNING,
  decayCameraTrauma,
  traumaFromMomentumExchange,
} from '../src/render/camera.js';
import { resolveCollisionFeel, traumaFromContact } from '../src/render/feel.js';
import { collisionImpactMagnitude } from '../src/render/combat/collisionImpactScale.js';
import { physics } from '../src/core/physics.js';
import { createGameState } from '../src/core/gameState.js';

const ROOT = new URL('../', import.meta.url);
const checks = [];

check('SPEC3-18 trauma scalar is resolveCollisionFeel', () => {
  assert.equal(CAMERA_TRAUMA_TUNING.decayPerSecond, 1.8, 'trauma must decay at 1.8/s');
  assert.equal(CAMERA_TRAUMA_TUNING.maxMomentumTrauma, 0.5, 'ordinary impact trauma cap must be 0.5');
  assert.equal(traumaFromMomentumExchange(0), 0);
  const samples = [20, 80, 150];
  let previous = 0;
  for (const deltaV of samples) {
    const feel = resolveCollisionFeel(
      { dp: deltaV * 20 },
      { mode: 'flight', deltaV, feelDeltaV: deltaV, momentum: deltaV * 20, playerDistance: 0 },
    );
    const trauma = traumaFromMomentumExchange(deltaV * 20, { deltaV, feelDeltaV: deltaV });
    assert.equal(trauma, feel.trauma);
    assert.equal(trauma, traumaFromContact(deltaV * 20, { deltaV, feelDeltaV: deltaV }));
    assert.ok(trauma >= previous);
    previous = trauma;
    const flash = collisionImpactMagnitude({ feelDeltaV: deltaV, deltaV, dp: deltaV * 20 });
    assert.equal(flash, feel.trauma);
  }
});

check('SPEC3-18 trauma decays deterministically without sim state mutation', () => {
  assert.equal(decayCameraTrauma(0.5, 0), 0.5);
  assert(Math.abs(decayCameraTrauma(0.5, 0.1) - 0.32) < 1e-9, '0.5 trauma should decay by 0.18 over 0.1s');
  assert.equal(decayCameraTrauma(0.1, 1), 0, 'trauma must clamp at zero');
});

check('SPEC3-18 physics emits impact dp without writing camera state', () => {
  const state = createGameState(17);
  state.mode = 'flight';
  state.playerId = 1;
  state.camera.trauma = 0;
  const events = [];
  const bus = { emit(name, payload) { events.push({ name, payload }); } };
  const player = makeEntity({ id: 1, type: 'ship', x: 0, z: 0, vx: 90, vz: 0, radius: 10, mass: 20 });
  const asteroid = makeEntity({ id: 2, type: 'asteroid', x: 18, z: 0, vx: 0, vz: 0, radius: 10, mass: 220 });

  const host = Object.create(physics);
  host._pairMaterialScratch = {};
  // resolvePair routes impact options through _impactOptionsScratch (backend/tick/normal);
  // the lightweight mock must carry it, mirroring test/pq-159-00-impact-kick.test.mjs.
  host._impactOptionsScratch = {
    backend: 'custom', tick: 0, normal: { x: 0, z: 0 }, causalActorId: null, preSolveClosingSpeed: 0,
  };
  host.resolvePair(player, asteroid, 18, 18, 0, bus, state);

  const impact = events.find((entry) => entry.name === 'physics:impact');
  assert(impact, 'resolvePair must emit physics:impact');
  assert(impact.payload.dp > 0, `impact dp should be positive, got ${impact.payload.dp}`);
  assert.equal(impact.payload.trauma, traumaFromMomentumExchange(impact.payload.dp, {
    playerDeltaV: impact.payload.playerDeltaV,
    feelDeltaV: impact.payload.preSolveClosingSpeed,
    mode: 'flight',
  }), 'impact payload trauma must match resolveCollisionFeel');
  assert.equal(impact.payload.playerInvolved, true, 'impact payload should mark player involvement');
  assert.equal(state.camera.trauma, 0, 'physics event emission must not mutate render camera state');
});

check('SPEC3-18 source hooks keep camera juice render-side', () => {
  const cameraSrc = readFileSync(new URL('src/render/camera.js', ROOT), 'utf8');
  const physicsSrc = readFileSync(new URL('src/core/physics.js', ROOT), 'utf8');
  assert.match(cameraSrc, /const t2 = c\.trauma \* c\.trauma/, 'shake amplitude must use trauma squared');
  assert.match(physicsSrc, /physics:impact/, 'physics must expose impact momentum for render-side trauma consumers');
  assert.doesNotMatch(physicsSrc, /state\.camera\.trauma\s*=/, 'sim physics must not write camera trauma');
  assert.doesNotMatch(physicsSrc, /dp\s*\/\s*8000/, 'physics must not keep a second trauma scale');
  assert.doesNotMatch(cameraSrc, /dp\s*\/\s*8000/, 'camera trauma helper must not keep a second trauma scale');
  assert.match(physicsSrc, /traumaFromContact/, 'physics trauma comes from resolveCollisionFeel');
});

const failed = checks.filter((entry) => !entry.ok);
for (const entry of checks) {
  console.log(entry.ok ? `PASS ${entry.name}` : `FAIL ${entry.name}: ${entry.error}`);
}
if (failed.length) {
  console.log(`\n${failed.length}/${checks.length} camera-trauma checks failed.`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} camera-trauma checks passed.`);

function makeEntity({ id, type, x, z, vx, vz, radius, mass }) {
  return {
    id,
    type,
    alive: true,
    collides: true,
    collisionMask: 0xffff,
    pos: { x, z },
    vel: { x: vx, z: vz },
    radius,
    mass,
    flags: {},
    data: {},
  };
}

function check(name, fn) {
  try {
    fn();
    checks.push({ name, ok: true });
  } catch (error) {
    checks.push({ name, ok: false, error: error && error.message ? error.message : String(error) });
  }
}
