// Controlled Chaos packet 08 - the failing hull's forces are real, finite and momentum-preserving.
//
// The dying successor carries the victim's velocity and spin; the only added motion is ONE
// damaged-nozzle impulse and ONE yaw impulse through the physics command membrane. Driven through
// the real rapier-dynamic owner so "real impulse, not a render offset" is a measurement.
import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { ships, fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { queuePhysicsImpulse, queuePhysicsTorqueImpulse, ensurePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import {
  applyFeatureConfigToMaps,
  PRODUCTION_FEATURES,
  restoreFeatureMaps,
  snapshotFeatureMaps,
} from '../src/data/featureFlags.js';
import { DYING_FORCE_LAW, dyingForces } from '../src/systems/dyingHull.js';

const DT = 1 / 60;
let previousFlags;
let sims;
beforeEach(() => { previousFlags = snapshotFeatureMaps(); applyFeatureConfigToMaps(PRODUCTION_FEATURES); sims = []; });
afterEach(() => {
  for (const sim of sims) { sim.registry.get('physics')?._sg02?.dispose?.(); sim.dispose(); }
  restoreFeatureMaps(previousFlags);
});

test('dyingForces is pure, hash-seeded, bounded, and scales down (never to zero) with mass', () => {
  const base = { speed: 120, rot: 0.7, seed: 4242, markerId: 'aft_x', spinNow: 0.4, inertia: 30 };
  const light = dyingForces({ ...base, mass: 16 });
  const again = dyingForces({ ...base, mass: 16 });
  assert.deepEqual(again, light, 'same inputs, same forces - no ambient randomness');
  const heavy = dyingForces({ ...base, mass: 400 });
  const lightDv = Math.hypot(light.impulse.x, light.impulse.z) / 16;
  const heavyDv = Math.hypot(heavy.impulse.x, heavy.impulse.z) / 400;
  assert.ok(lightDv >= DYING_FORCE_LAW.nozzleMinDv * DYING_FORCE_LAW.massScaleFloor && lightDv <= DYING_FORCE_LAW.nozzleMaxDv);
  assert.ok(heavyDv > 0 && heavyDv < lightDv, `heavy veers less (${heavyDv} < ${lightDv}) but is not inert`);
  assert.ok(Math.abs(heavy.spinDelta) > 0 && Math.abs(heavy.spinDelta) < Math.abs(light.spinDelta) + 1e-9);
  assert.equal(light.impulse.y, 0, 'XZ plane only');
  // different kills fan out differently
  const other = dyingForces({ ...base, mass: 16, markerId: 'aft_y' });
  assert.notDeepEqual(other.impulse, light.impulse);
  // never spins past the cap even from an already-fast tumble
  const fast = dyingForces({ ...base, mass: 16, spinNow: 5.9 });
  assert.ok(Math.abs(5.9 + fast.spinDelta) <= DYING_FORCE_LAW.maxSpin + 1e-9);
});

test('through real physics: momentum is retained, the added velocity is the bounded nozzle dv, spin gains the tumble', async () => {
  const sim = createSimulation({
    seed: 4242,
    runtimeConfig: { profileId: 'production', features: PRODUCTION_FEATURES },
    systems: [ships, physics],
    updateOrder: [physics],
    helpers: {},
  });
  sims.push(sim);
  const { state } = sim;
  state.mode = 'flight';
  state.ui.screenStack.length = 0;
  sim.registry.get('ships').newGame();
  const player = sim.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
    isPlayer: true, team: 0, pos: { x: 0, z: 0 }, rot: 0,
    fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules),
  }));
  state.playerId = player.id;
  const ph = sim.registry.get('physics');
  for (let i = 0; i < 300 && !(ph._diag && ph._diag.sg02Ready); i++) {
    sim.runTicks(1, DT);
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  assert.ok(ph._diag.sg02Ready, 'fixture: real rapier-dynamic physics is up');

  const wreck = sim.spawn({
    type: 'wreck', pos: { x: -250, z: 0 }, vel: { x: 90, z: -30 }, rot: 0.5, angVel: 0.6,
    radius: 11, mass: 16, hull: 1, hullMax: 1, physicsBody: { shape: 'capsule', mass: 16 },
    data: { killedAt: 0, markerId: 'm', proportions: { length: 1, width: 1 } },
  });
  sim.runTicks(3, DT);
  const v0 = { x: wreck.vel.x, z: wreck.vel.z };
  const w0 = wreck.angVel;
  const forces = dyingForces({
    mass: 16, speed: Math.hypot(v0.x, v0.z), rot: wreck.rot, seed: 4242, markerId: 'm',
    spinNow: w0, inertia: ensurePhysicsBodySpec(wreck).inertiaY,
  });
  queuePhysicsImpulse(wreck, forces.impulse, { kind: 'dying_nozzle' });
  queuePhysicsTorqueImpulse(wreck, forces.torque, { kind: 'dying_tumble' });
  sim.runTicks(2, DT);
  const dv = { x: wreck.vel.x - v0.x, z: wreck.vel.z - v0.z };
  assert.ok(Math.abs(Math.hypot(dv.x, dv.z) - forces.dv) < 0.75,
    `the velocity change is the one finite nozzle dv (${Math.hypot(dv.x, dv.z)} vs ${forces.dv})`);
  assert.ok(Math.hypot(dv.x, dv.z) <= DYING_FORCE_LAW.nozzleMaxDv + 0.75, 'bounded');
  assert.ok(Math.hypot(wreck.vel.x, wreck.vel.z) > 0.8 * Math.hypot(v0.x, v0.z), 'inherited momentum survives - not a reset');
  assert.ok(Math.abs((wreck.angVel - w0) - forces.spinDelta) < 0.5,
    `spin gained the tumble (${wreck.angVel - w0} vs ${forces.spinDelta})`);
  // and it keeps coasting afterwards: no hidden second impulse, no thrust
  const vAfter = { x: wreck.vel.x, z: wreck.vel.z };
  sim.runTicks(30, DT);
  assert.ok(Math.hypot(wreck.vel.x - vAfter.x, wreck.vel.z - vAfter.z) < 2, 'ballistic after the one impulse');
});

test('dyingPose is pure, eased, signed by side and silent under reduced motion', async () => {
  const { dyingPose, DYING_POSE_LAW } = await import('../src/systems/dyingHull.js');
  assert.deepEqual(dyingPose(0, 1), { pitch: 0, bank: 0 });
  const mid = dyingPose(0.5, 1);
  const end = dyingPose(1, 1);
  assert.ok(mid.bank > 0 && mid.bank < end.bank, 'eased in');
  assert.ok(Math.abs(end.bank - DYING_POSE_LAW.bank) < 1e-9 && Math.abs(end.pitch - DYING_POSE_LAW.pitch) < 1e-9);
  assert.equal(dyingPose(1, -1).bank, -end.bank, 'rolls the other way on the other side');
  assert.deepEqual(dyingPose(1, 1, true), { pitch: 0, bank: 0 });
  assert.deepEqual(dyingPose(7, 1), dyingPose(1, 1), 'clamped');
  assert.deepEqual(dyingPose(NaN, 1), dyingPose(0, 1));
});
