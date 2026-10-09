// FB-059 — the heavy ladder's drive feel, measured through the REAL spawn chain and the REAL
// kernel (the test/propulsion-spawned-ship-authority.test.mjs standard: the product, not a
// fixture adjacent to it).
//
// WHAT THIS FILE PINS TODAY (2026-10-02, board row 236) — and why it is a residual, not a pass:
//
//   The five heavy hulls (hawser, bastion, warden, colossus, leviathan) ALL resolve
//   `drive_torch_l`. The kernel's linear/angular accelerations are mass-independent at stock
//   (force = accel x mass, torque = yawAccel x inertia — the hull constant cancels), so all five
//   fly BYTE-IDENTICAL handling triples. Measured, not assumed:
//
//     hull         mass   time to 90% of 320 WU/s cap   180° turn   stop distance
//     hawser        68         3.62 s                    2.75 s      957 WU
//     bastion       80         3.62 s                    2.75 s      957 WU
//     warden       150         3.62 s                    2.75 s      957 WU
//     colossus     300         3.62 s                    2.75 s      957 WU
//     leviathan    600         3.62 s                    2.75 s      957 WU
//
//   A 600-ton flagship answers the throttle exactly like a 68-ton tug. FB-059's mechanism fixes
//   this by REASSIGNING authored drives per hull: `drive_gravimetric_m` (already authored in
//   PROPULSION_PROFILES, fitted to no hull) to the Bastion and the Warden, a new torch XL
//   variant for the Colossus/Leviathan mass band, Hawser staying on the torch.
//
// WHY THE FIX IS NOT IN THIS COMMIT: the hull→drive assignment (`driveId` per hull) lives in
// `src/data/ships.js`, which is under an active foreign writer (protected path — preserved, not
// edited, per the concurrent-work rules). This sitting owns `src/core/flight/propulsionCatalog.js`
// and pins the truth instead. The differentiation is ONE data edit away; when the data owner
// lands it, the "identical triples" assertion below goes red BY DESIGN — rewrite it then to pin
// the three distinct handling triples the packet's done-when asks for ("three distinct handling
// triples across the five heavies").
//
// Determinism: scripted fixed-step integration only; no Math.random, no wall time.
import assert from 'node:assert/strict';
import test from 'node:test';

import { makeShipEntitySpec } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';
import {
  PROPULSION_PROFILES,
  resolvePropulsionProfile,
} from '../src/core/flight/propulsionCatalog.js';
import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';

const DT = 1 / 60;
const HEAVIES = ['ship_hawser', 'ship_bastion', 'ship_warden', 'ship_colossus', 'ship_leviathan'];
const NPC_STATE = { playerId: -1, player: {} };

/** The real spawned hull, the way bootstrapScene builds it (stock fittings). */
function spawnHull(id) {
  const spec = makeShipEntitySpec(id, {
    team: 0,
    factionId: 'faction_free',
    isPlayer: false,
    player: null,
    pos: { x: 0, z: 0 },
  });
  const entity = { ...spec, id: 'probe', alive: true, vel: { x: 0, z: 0 }, angVel: 0 };
  return { entity, profile: resolvePropulsionProfile(entity, NPC_STATE) };
}

function kernelBody(entity) {
  return {
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    mass: entity.mass,
    inertia: (entity.flightModel && entity.flightModel.inertia) || 1,
    radius: entity.radius || 14,
  };
}

/**
 * The handling triple, measured the way a pilot feels it: full throttle from rest until the
 * governed cap, a full 180° pivot from rest, and a full stop from the cap.
 */
function handlingTriple(id) {
  const { entity, profile } = spawnHull(id);
  // 1. Full-throttle run: time to 90% of the governor cap.
  const runner = kernelBody(entity);
  let runtime = createPropulsionRuntime(profile);
  let t90 = null;
  let cap = 0;
  for (let tick = 0; tick < 60 * 30; tick += 1) {
    const result = stepPropulsion({
      dt: DT, body: runner,
      input: { moveZ: 1, moveX: 0, turnIntent: 0, boost: false, brake: false },
      profile, runtime, environment: {},
    });
    runtime = result.runtime;
    runner.vel.x += (result.force.x / runner.mass) * DT;
    runner.vel.z += (result.force.z / runner.mass) * DT;
    runner.pos.x += runner.vel.x * DT;
    runner.pos.z += runner.vel.z * DT;
    cap = Math.max(cap, result.maxSpeed);
    const speed = Math.hypot(runner.vel.x, runner.vel.z);
    if (t90 === null && speed >= 0.9 * result.maxSpeed) t90 = (tick + 1) * DT;
    if (t90 !== null && (tick + 1) * DT > 5 && speed >= result.maxSpeed * 0.999) break;
  }
  const vCap = Math.hypot(runner.vel.x, runner.vel.z);
  // 2. 180° turn from rest.
  const turner = kernelBody(entity);
  let turnRuntime = createPropulsionRuntime(profile);
  let t180 = null;
  for (let tick = 0; tick < 60 * 30; tick += 1) {
    const result = stepPropulsion({
      dt: DT, body: turner,
      input: { moveZ: 0, moveX: 0, turnIntent: 1, boost: false, brake: false },
      profile, runtime: turnRuntime, environment: {},
    });
    turnRuntime = result.runtime;
    turner.angVel += (result.torque.y / turner.inertia) * DT;
    turner.rot += turner.angVel * DT;
    if (turner.rot >= Math.PI) { t180 = (tick + 1) * DT; break; }
  }
  // 3. Full stop from the cap.
  const stopper = kernelBody(entity);
  stopper.vel.x = vCap;
  let stopRuntime = createPropulsionRuntime(profile);
  let stopDist = 0;
  for (let tick = 0; tick < 60 * 60; tick += 1) {
    const result = stepPropulsion({
      dt: DT, body: stopper,
      input: { moveZ: 0, moveX: 0, turnIntent: 0, boost: false, brake: true },
      profile, runtime: stopRuntime, environment: {},
    });
    stopRuntime = result.runtime;
    const speedBefore = Math.hypot(stopper.vel.x, stopper.vel.z);
    stopper.vel.x += (result.force.x / stopper.mass) * DT;
    stopper.vel.z += (result.force.z / stopper.mass) * DT;
    stopDist += Math.hypot(stopper.vel.x, stopper.vel.z) * DT;
    if (Math.hypot(stopper.vel.x, stopper.vel.z) < 1 || speedBefore < 1) break;
  }
  return { mass: entity.mass, driveId: profile.id, t90, t180, vCap, stopDist, cap };
}

test('FB-059 the heavy ladder is the real fleet: five distinct hulls, one shared drive law', () => {
  const triples = Object.fromEntries(HEAVIES.map((id) => [id, handlingTriple(id)]));

  // The hulls themselves are genuinely five different machines: distinct masses, distinct
  // inertias, distinct identities. The drive is what they share.
  const masses = HEAVIES.map((id) => triples[id].mass);
  assert.equal(new Set(masses).size, HEAVIES.length, 'the five heavies must be distinct hulls');
  assert.deepEqual(masses, [...masses].sort((a, b) => a - b), 'hawser→leviathan ascend in mass');

  // RESIDUAL (FB-059): every heavy still resolves the same authored drive.
  for (const id of HEAVIES) {
    assert.equal(triples[id].driveId, 'drive_torch_l',
      `${id} resolves drive_torch_l today — when this fails, the data owner's FB-059 fit has landed`);
  }

  // And because kernel acceleration is mass-independent at stock, the FEEL is byte-identical:
  // the measured clone receipt (numbers in the file header; re-measured here every run).
  for (const key of ['t90', 't180', 'vCap', 'stopDist']) {
    const values = HEAVIES.map((id) => triples[id][key]);
    assert.equal(new Set(values).size, 1,
      `${key} identical across the five heavies (${values.join(', ')}) — the shared-drive clone, ` +
      'pinned as the FB-059 residual. When the authored drive fit lands in ships.js, this ' +
      'assertion is REPLACED by three-distinct-triples pinning (the packet done-when).');
  }
  assert.equal(triples.ship_hawser.cap, 320, 'the torch governor cap the heavies all share');
});

test('FB-059 the fix mechanism exists authored: drive_gravimetric_m is in the catalog and unfitted', () => {
  // The packet's direction: no new profiles — fit the authored one. The catalog ships it; the
  // fleet does not use it yet. This is the one-edit-away receipt.
  const grav = PROPULSION_PROFILES.drive_gravimetric_m;
  assert.ok(grav, 'drive_gravimetric_m is authored in PROPULSION_PROFILES');
  assert.equal(grav.family, 'gravimetric');
  assert.ok(grav.maxAccel > 0 && grav.responseHz > 0,
    'the gravimetric envelope carries its own hard-envelope law (not a reaction clone)');

  const fittedDriveIds = new Set();
  for (const hull of SHIPS) {
    const { profile } = spawnHull(hull.id);
    fittedDriveIds.add(profile.id);
  }
  assert.equal(fittedDriveIds.has('drive_gravimetric_m'), false,
    'drive_gravimetric_m is authored and fitted to no hull — the FB-059 mechanism is a data edit');
  assert.equal(fittedDriveIds.has('drive_torch_l'), true,
    'the torch family is in live service (the drive the heavies share)');
});
