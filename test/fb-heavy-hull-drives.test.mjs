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
//   A 600-ton flagship answered the throttle exactly like a 68-ton tug — until the data
//   owner landed the FB-059 fit exactly as the packet drew it: `drive_gravimetric_m` to the
//   Bastion and the Warden, a torch XL variant for the Colossus/Leviathan mass band, the
//   Hawser keeping its torch. The "identical triples" residual went red by design; this
//   file now pins the landed three-band contract the packet's done-when named.
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

  // LANDED (FB-059): the data owner's fit is in — three authored drive bands.
  const EXPECTED_DRIVES = {
    ship_hawser: 'drive_torch_l',
    ship_bastion: 'drive_gravimetric_m',
    ship_warden: 'drive_gravimetric_m',
    ship_colossus: 'drive_torch_xl',
    ship_leviathan: 'drive_torch_xl',
  };
  for (const id of HEAVIES) {
    assert.equal(triples[id].driveId, EXPECTED_DRIVES[id],
      `${id} rides its authored FB-059 band`);
  }

  // The packet done-when: three distinct handling triples across the five heavies —
  // the tug keeps its torch, the mid band runs the gravimetric's short leash, the
  // flagships carry the XL's long reach. Within a band the feel stays byte-identical
  // (kernel acceleration is mass-independent at stock): measured, not assumed.
  const tripleKey = (t) => `${t.t90}|${t.t180}|${t.vCap}|${t.stopDist}`;
  const distinct = new Set(HEAVIES.map((id) => tripleKey(triples[id])));
  assert.equal(distinct.size, 3,
    `three distinct handling triples across the five heavies (got ${distinct.size})`);
  assert.equal(tripleKey(triples.ship_bastion), tripleKey(triples.ship_warden),
    'the gravimetric pair share one feel');
  assert.equal(tripleKey(triples.ship_colossus), tripleKey(triples.ship_leviathan),
    'the XL pair share one feel');

  // The measured landed receipt — the numbers this file's header once called the residual.
  assert.equal(triples.ship_hawser.cap, 320, 'the tug keeps the torch governor cap');
  assert.equal(triples.ship_bastion.cap, 156, 'the gravimetric band caps lower, answers sooner');
  assert.equal(triples.ship_colossus.cap, 280, 'the XL band trades cap for reach');
});

test('FB-059 the landed fit: all three authored drives are in the catalog and in service', () => {
  // The packet's direction held: no new reaction clones — the authored gravimetric profile
  // took the mid band and the XL variant took the flagships. Both are live service now.
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
  assert.equal(fittedDriveIds.has('drive_gravimetric_m'), true,
    'the gravimetric band is in live service (bastion, warden)');
  assert.equal(fittedDriveIds.has('drive_torch_l'), true,
    'the torch family is in live service (the tug keeps it)');
  assert.equal(fittedDriveIds.has('drive_torch_xl'), true,
    'the XL variant is in live service (colossus, leviathan)');
});
