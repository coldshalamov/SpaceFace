// PQ-195.01: the capture fork's static steel — two rails and a rear arrestor.
//
// The fork kernel refuses an overspeed load, but until now a refused load passed THROUGH the machine
// because only the catcher's custody HEAD was a collider. These tests prove the authored rails and
// arrestor are real physics: an overspeed load is refused by the kernel AND arrested by the steel (it
// never reaches the rear plane and never crosses a rail line), capture stays reachable afterwards,
// the player's PQ-137.11 give contract is untouched, and the colliders live exactly as long as the
// facility is materialized.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { heistFacilities } from '../src/systems/heistFacilities.js';
import {
  BREAKAWAY_CAPTURE_FORK,
  BREAKAWAY_FORK_COLLIDERS,
  BREAKAWAY_SP07,
  BREAKAWAY_THIRD_SHIFT_VARIANT_ID,
  PQ019_HEIST_SECTOR_ID,
  heistLaunchVariant,
  projectBreakawayForkMouth,
} from '../src/data/heistFacilities.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';

const SEED = 19501;
const SCHEDULE = 'pq195-01-fork';
const COLLIDER_ROLES = ['lawful_catcher_rail_a', 'lawful_catcher_rail_b', 'lawful_catcher_arrestor'];

function wrap(a) {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}

async function boot({ seed = SEED, enter = true } = {}) {
  const bus = createBus();
  const sim = createSimulation({ seed, bus, systems: [physics, world, heistFacilities] });
  const { state } = sim;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true, isPlayer: true, combatSpeed: 60,
  });
  state.playerId = player.id;
  if (enter) sim.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID);
  const events = [];
  const candidates = [];
  bus.on('heist:captureFork', (p) => events.push(p));
  bus.on('heist:facilityCandidate', (p) => candidates.push(p));
  const system = sim.registry.get('heistFacilities');
  assert.equal(await sim.registry.get('physics').prepareBackend(state), true,
    'the fork is proven against the production Rapier owner');
  return { sim, state, bus, system, events, candidates, player };
}

function launch(t) {
  const receipt = t.system.requestLaunchSchedule({
    scheduleId: SCHEDULE, launchAtSimT: t.state.simTime, variantId: BREAKAWAY_THIRD_SHIFT_VARIANT_ID,
  });
  assert.equal(receipt.accepted, true);
  t.sim.step(SIM_DT);
  const load = t.state.entities.get(t.state.heistFacilities.capsuleEntityId);
  assert.ok(load, 'the variant launches a real load');
  assert.equal(load.data.heistPayloadStableId, BREAKAWAY_SP07.stableId);
  return load;
}

/** Initial condition of a new body, in receiver-local terms, before its next physics step. */
function place(t, load, { depth, lateral = 0, vIn = 0, vLat = 0, spin = 0 }) {
  const { x, z, nx, nz } = t.receiver;
  const px = x + nx * depth - nz * lateral;
  const pz = z + nz * depth + nx * lateral;
  load.pos.x = px; load.pos.z = pz;
  if (load.prevPos) { load.prevPos.x = px; load.prevPos.z = pz; }
  load.vel.x = nx * vIn - nz * vLat;
  load.vel.z = nz * vIn + nx * vLat;
  load.angVel = spin;
}

function local(t, load) {
  const dx = load.pos.x - t.receiver.x;
  const dz = load.pos.z - t.receiver.z;
  return {
    depth: dx * t.receiver.nx + dz * t.receiver.nz,
    lateral: -dx * t.receiver.nz + dz * t.receiver.nx,
    inward: load.vel.x * t.receiver.nx + load.vel.z * t.receiver.nz,
    speed: Math.hypot(load.vel.x, load.vel.z),
  };
}

function colliders(state) {
  return [...(state.entityList || [])].filter((e) => e?.alive !== false
    && e.data?.heistFacilityId === 'lawful_catcher'
    && COLLIDER_ROLES.includes(e.data?.heistFacilityRole));
}

const eventsNamed = (t, name) => t.events.filter((e) => e.event === name);
const settledCandidate = (t) => t.candidates.find((c) => c.kind === 'capture_settled') || null;

function receiver(t) {
  return t.system._forkReceiver(heistLaunchVariant(BREAKAWAY_THIRD_SHIFT_VARIANT_ID));
}

// ── the machine materializes its steel ──────────────────────────────────────────────────────────

test('fork colliders exist exactly while the facility is materialized', async () => {
  const t = await boot({ enter: false });
  assert.equal(colliders(t.state).length, 0, 'absent before sector entry');
  t.sim.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID);
  assert.equal(colliders(t.state).length, 3, 'rail A, rail B and arrestor after materialize');
  const roles = colliders(t.state).map((e) => e.data.heistFacilityRole).sort();
  assert.deepEqual(roles, COLLIDER_ROLES.slice().sort());
  for (const c of colliders(t.state)) {
    assert.equal(c.collides, true);
    assert.equal(c.physicsBody?.dynamic, false);
    assert.equal(c.physicsBody?.shape, 'capsule');
    assert.equal(c.data?.payloadCustodyOnly, true);
  }
  assert.equal(t.system.materializeForSector(PQ019_HEIST_SECTOR_ID), 0,
    're-materialize creates nothing');
  assert.equal(colliders(t.state).length, 3, 'no duplicates while materialized');
  t.system._dematerializeSector(PQ019_HEIST_SECTOR_ID);
  assert.equal(colliders(t.state).length, 0, 'gone with the sector');
  t.sim.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID);
  assert.equal(colliders(t.state).length, 3, 're-materialize after a hop rebinds exactly three');
});

// ── overspeed: kernel refuses, steel arrests ────────────────────────────────────────────────────

test('an overspeed entry is refused and physically arrested by the steel', async () => {
  const t = await boot();
  t.receiver = receiver(t);
  const load = launch(t);
  // Through the mouth at 155 WU/s, drifting outward so it must also deal with a rail. The drift is
  // small enough at the mouth plane to be a lawful crossing line-wise, but grows to a rail strike.
  place(t, load, { depth: -60, lateral: 0, vIn: 155, vLat: 24 });

  let maxDepth = -Infinity;
  let maxLat = 0;
  let minInward = Infinity;
  for (let i = 0; i < 300; i++) {
    t.sim.step(SIM_DT);
    if (load.alive === false) break;
    const p = local(t, load);
    maxDepth = Math.max(maxDepth, p.depth);
    maxLat = Math.max(maxLat, Math.abs(p.lateral));
    minInward = Math.min(minInward, p.inward);
  }

  // The kernel refused the pass outright.
  assert.equal(eventsNamed(t, 'capture_acquired').length, 0, 'never acquired');
  assert.equal(eventsNamed(t, 'capture_ready').length, 0, 'never ready');
  assert.ok(eventsNamed(t, 'capture_refused').some((e) => e.reason === 'too_fast'),
    JSON.stringify(t.events));
  assert.equal(settledCandidate(t), null, 'no custody from an overspeed pass');
  assert.equal(load.alive, true, 'a refused load is not consumed');

  // Physically arrested: never through the rear plane, never across a rail line.
  assert.ok(maxDepth < BREAKAWAY_CAPTURE_FORK.depth,
    `never exits the rear plane (deepest ${maxDepth.toFixed(2)} < ${BREAKAWAY_CAPTURE_FORK.depth})`);
  assert.ok(maxLat < BREAKAWAY_CAPTURE_FORK.halfWidth,
    `never crosses a rail line (lateral ${maxLat.toFixed(2)} < ${BREAKAWAY_CAPTURE_FORK.halfWidth})`);

  // The kernel has already cleared once depth > depth - radius, so anything past that is steel.
  assert.ok(maxDepth > BREAKAWAY_CAPTURE_FORK.depth - BREAKAWAY_SP07.radius + 1,
    `ran past the kernel's capture volume into the steel (deepest ${maxDepth.toFixed(2)})`);
  const arrestorFace = BREAKAWAY_FORK_COLLIDERS.arrestorAxialCenter
    - BREAKAWAY_FORK_COLLIDERS.arrestorThickness / 2;
  const expectedStop = arrestorFace - BREAKAWAY_SP07.radius;
  assert.ok(Math.abs(maxDepth - expectedStop) <= 4,
    `stopped at the arrestor face (${maxDepth.toFixed(2)} vs ${expectedStop.toFixed(2)})`);
  // Contact evidence: the load's inward motion is arrested to a stop at the steel face, not carried
  // through. The kernel cannot do this — it had already cleared the capture volume.
  assert.ok(minInward <= 0.5,
    `the steel arrested the load's inward motion (min inward velocity ${minInward.toFixed(3)})`);
  // Non-vacuous rail engagement: an unobstructed drift would have crossed the rail long ago.
  assert.ok(maxLat > BREAKAWAY_CAPTURE_FORK.halfWidth - BREAKAWAY_SP07.radius - 2,
    `the load actually reached the rail face (lateral ${maxLat.toFixed(2)})`);
});

test('after a refusal the load is still alive and a slow approach still settles', async () => {
  const t = await boot();
  t.receiver = receiver(t);
  const load = launch(t);

  place(t, load, { depth: -60, vIn: 155 });
  for (let i = 0; i < 200; i++) {
    t.sim.step(SIM_DT);
    if (load.alive === false) break;
  }
  assert.equal(load.alive, true, 'survives the refused entry');
  assert.equal(settledCandidate(t), null);

  // A later lawful approach: below the 100 WU/s limit, it is braked and settles into custody.
  place(t, load, { depth: -60, vIn: 80 });
  for (let i = 0; i < 600 && !settledCandidate(t); i++) t.sim.step(SIM_DT);
  assert.ok(settledCandidate(t),
    `capture is still reachable after a refusal (${JSON.stringify(t.events.slice(-6))})`);
  assert.ok(eventsNamed(t, 'capture_ready').length >= 1);
  const p = local(t, load);
  assert.ok(p.depth >= BREAKAWAY_SP07.radius
    && p.depth <= BREAKAWAY_CAPTURE_FORK.depth - BREAKAWAY_SP07.radius, `load inside the bay (${p.depth})`);
  assert.ok(p.speed <= BREAKAWAY_CAPTURE_FORK.settleSpeed, `settled speed ${p.speed}`);
});

// ── the player's give contract is unmodified ────────────────────────────────────────────────────

test('a player hull driven into a rail gets bounded give and no heading kick', async () => {
  const t = await boot();
  t.receiver = receiver(t);
  const mouth = projectBreakawayForkMouth(BREAKAWAY_CAPTURE_FORK);
  const lx = -mouth.nz;
  const lz = mouth.nx;
  const cruise = 60;
  const start = sectorLocalToGlobalForSector({
    x: mouth.x + mouth.nx * BREAKAWAY_FORK_COLLIDERS.railAxialCenter + lx * 0,
    z: mouth.z + mouth.nz * BREAKAWAY_FORK_COLLIDERS.railAxialCenter + lz * 0,
  }, PQ019_HEIST_SECTOR_ID);
  t.player.pos.x = start.x; t.player.pos.z = start.z;
  if (t.player.prevPos) { t.player.prevPos.x = start.x; t.player.prevPos.z = start.z; }
  t.player.vel.x = lx * cruise; t.player.vel.z = lz * cruise;
  t.player.rot = Math.atan2(-lz, lx);
  t.player.angVel = 0;
  const course0 = Math.atan2(t.player.vel.z, t.player.vel.x);
  const rot0 = t.player.rot;

  let maxSpeedDelta = 0;
  let maxCourseChange = 0;
  let maxRotChange = 0;
  let maxLat = 0;
  for (let i = 0; i < 120; i++) {
    t.sim.step(SIM_DT);
    const speed = Math.hypot(t.player.vel.x, t.player.vel.z);
    maxSpeedDelta = Math.max(maxSpeedDelta, Math.abs(speed - cruise));
    maxCourseChange = Math.max(maxCourseChange,
      Math.abs(wrap(Math.atan2(t.player.vel.z, t.player.vel.x) - course0)));
    maxRotChange = Math.max(maxRotChange, Math.abs(wrap(t.player.rot - rot0)));
    const p = local(t, t.player);
    maxLat = Math.max(maxLat, Math.abs(p.lateral));
  }

  assert.ok(maxLat > 8, `the player actually reached the rail (lateral ${maxLat.toFixed(2)})`);
  assert.ok(maxLat < BREAKAWAY_CAPTURE_FORK.halfWidth,
    `the rail blocks the hull (lateral ${maxLat.toFixed(2)})`);
  assert.ok(maxSpeedDelta <= 0.10 * cruise + 0.75,
    `bounded give: max speed change ${maxSpeedDelta.toFixed(3)} <= 10% of ${cruise}`);
  assert.ok(maxCourseChange < 0.05, `no course kick (${maxCourseChange.toFixed(4)} rad)`);
  assert.ok(maxRotChange < 0.05, `no heading kick (${maxRotChange.toFixed(4)} rad)`);
});
