import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  resolveFlightProfile,
  stepPlayerFlight,
} from '../src/core/flightDynamics.js';

const ROOT = new URL('../', import.meta.url);
const DT = 1 / 60;

const checks = [];

check('SPEC3-16 helm assist is cursor-to-nose leash input, not rotation snap', () => {
  const inputSrc = readFileSync(new URL('src/systems/input.js', ROOT), 'utf8');
  assert.match(inputSrc, /HELM_SOFT_ANGLE\s*=\s*0\.55/, 'helm assist must use a soft-angle leash');
  assert.match(inputSrc, /HELM_DEADBAND\s*=\s*0\.012/, 'helm assist must have a deadband against cursor jitter');
  assert.match(inputSrc, /wrapAngle\(inp\.aimAngle - p\.rot\)/, 'helm assist must chase cursor aim angle relative to the ship nose');
  assert.match(inputSrc, /inp\.turnIntent\s*=.*err \/ HELM_SOFT_ANGLE/s, 'helm assist must output turnIntent through the normal yaw controller');
});

check('SPEC3-16 scout scripted 90-degree turn starts immediately and lands inside the feel target', () => {
  const result = simulateTurn({
    flightClass: 'scout',
    turnRate: 5.0,
    mass: 18,
    thrust: 42,
  });
  assert(result.firstMotionS <= DT, `scout did not answer within one tick: ${result.firstMotionS.toFixed(3)}s`);
  assert(result.turnTimeS <= 0.45 + 1e-9, `scout 90-degree turn ${result.turnTimeS.toFixed(3)}s > 0.45s`);
});

check('SPEC3-16 hauler scripted 90-degree turn reads as mass, not a snap', () => {
  const result = simulateTurn({
    flightClass: 'hauler',
    turnRate: 1.8,
    mass: 92,
    thrust: 30,
  });
  assert(result.turnTimeS >= 1.05, `hauler 90-degree turn ${result.turnTimeS.toFixed(3)}s is too twitchy`);
  assert(result.turnTimeS <= 1.55, `hauler 90-degree turn ${result.turnTimeS.toFixed(3)}s misses the ~1.4s target`);
});

check('SPEC3-16 turn closure is rate-limited by hull stats', () => {
  const scout = simulateTurn({ flightClass: 'scout', turnRate: 5.0, mass: 18, thrust: 42 });
  const hauler = simulateTurn({ flightClass: 'hauler', turnRate: 1.8, mass: 92, thrust: 30 });
  assert(scout.profile.maxYawRate > hauler.profile.maxYawRate, 'scout must have higher yaw authority than hauler');
  assert(hauler.turnTimeS > scout.turnTimeS * 2.4,
    `hauler should visibly lag scout (${hauler.turnTimeS.toFixed(3)}s vs ${scout.turnTimeS.toFixed(3)}s)`);
});

const failed = checks.filter((entry) => !entry.ok);
for (const entry of checks) {
  console.log(entry.ok ? `PASS ${entry.name}` : `FAIL ${entry.name}: ${entry.error}`);
}
if (failed.length) {
  console.log(`\n${failed.length}/${checks.length} helm-leash checks failed.`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} helm-leash checks passed.`);

function simulateTurn({ flightClass, turnRate, mass, thrust }) {
  const entity = {
    id: 1,
    type: 'ship',
    alive: true,
    flightClass,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    turnRate,
    thrust,
    drag: 1.2,
    maxSpeed: 120,
    mass,
    bankFactor: 0.6,
    flags: {},
  };
  const profile = resolveFlightProfile(entity, 'assisted');
  let firstMotionS = Infinity;
  let t = 0;
  while (Math.abs(entity.rot) < Math.PI / 2 && t < 5) {
    stepPlayerFlight(entity, {
      turnIntent: 1,
      moveX: 0,
      moveZ: 0,
      boost: false,
      brake: false,
    }, DT, profile);
    t += DT;
    if (firstMotionS === Infinity && Math.abs(entity.angVel) > 1e-6) firstMotionS = t;
  }
  return {
    turnTimeS: t,
    firstMotionS,
    profile,
    finalRot: entity.rot,
    finalYawRate: entity.angVel,
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
