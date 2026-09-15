// BREAKAWAY BW-02 — the capture fork arrests a REAL SG-02 body, and only through physics.
//
// Every scenario runs the production Rapier owner (`physicsBackend: 'rapier-dynamic'`) with the real
// `heistFacilities` owner. A fixture places the freshly launched load BEFORE its first physics step
// (an initial condition of a new body); after that the only thing touching it is physics: the fork's
// queued braking impulses and, where a scenario says so, a test "tug" queued through the same
// physics authority. Nothing here writes a pose mid-flight.
//
// Contracts proven:
//   * clean free-flight entry at 80 WU/s and a slow 20 WU/s tow-in both settle into custody
//   * overspeed and side entry are refused truthfully and never acquire
//   * dragging the load back out loses capture and produces no custody receipt
//   * custody is re-proven fresh at prepare AND at commit
//   * the load never teleports, and the Capsule Run's contact custody is untouched (existing suites)

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { world } from '../src/systems/world.js';
import { heistFacilities } from '../src/systems/heistFacilities.js';
import {
  BREAKAWAY_CAPTURE_FORK,
  BREAKAWAY_SP07,
  BREAKAWAY_THIRD_SHIFT_VARIANT_ID,
  PQ019_FACILITIES,
  PQ019_HEIST_SECTOR_ID,
  heistLaunchVariant,
  projectBreakawayForkMouth,
  projectPq019FacilitySocket,
} from '../src/data/heistFacilities.js';

const SCHEDULE = 'bw02-fork';

async function boot(seed = 70707) {
  const bus = createBus();
  const sim = createSimulation({ seed, bus, systems: [physics, world, heistFacilities] });
  const { state } = sim;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  sim.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID);
  assert.equal(await sim.registry.get('physics').prepareBackend(state), true,
    'the fork is proven against the production Rapier owner');

  const events = [];
  const candidates = [];
  bus.on('heist:captureFork', (p) => events.push(p));
  bus.on('heist:facilityCandidate', (p) => candidates.push(p));
  const system = sim.registry.get('heistFacilities');
  const receiver = system._forkReceiver(heistLaunchVariant(BREAKAWAY_THIRD_SHIFT_VARIANT_ID));
  return { sim, state, bus, system, receiver, events, candidates };
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

/** Initial condition of the new body, in receiver-local terms, before its first physics step. */
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
    speed: Math.hypot(load.vel.x, load.vel.z),
  };
}

/**
 * Step until `until()` or `max` ticks. Tracks the largest per-tick displacement beyond what the
 * body's own velocity explains, so a hidden pose write would show up as a teleport.
 */
function run(t, load, max, until = () => false, beforeStep = null) {
  let worstTeleport = 0;
  let maxDepth = -Infinity;
  for (let i = 0; i < max; i++) {
    const before = { x: load.pos.x, z: load.pos.z, v: Math.hypot(load.vel.x, load.vel.z) };
    if (beforeStep) beforeStep(i);
    t.sim.step(SIM_DT);
    if (load.alive === false) break;
    const moved = Math.hypot(load.pos.x - before.x, load.pos.z - before.z);
    const explained = Math.max(before.v, Math.hypot(load.vel.x, load.vel.z)) * SIM_DT;
    worstTeleport = Math.max(worstTeleport, moved - explained);
    maxDepth = Math.max(maxDepth, local(t, load).depth);
    if (until()) return { ticks: i + 1, worstTeleport, maxDepth };
  }
  return { ticks: max, worstTeleport, maxDepth };
}

/**
 * Receiver-local depth at which the load's collider touches the catcher's static head (the fork's
 * rear stop). Measured geometrically: contact-force events are feature-gated off in this harness,
 * so an event watcher could never fire and "no contact" would be vacuous.
 */
function rearStopDepth(t, load) {
  const head = t.state.entityList.find((e) => e?.alive !== false && e.data?.heistFacilityRole === 'lawful_catcher_head');
  assert.ok(head, 'the catcher head exists');
  return local(t, head).depth - head.radius - load.radius;
}

const settledCandidate = (t) => t.candidates.find((c) => c.kind === 'capture_settled') || null;
const eventsNamed = (t, name) => t.events.filter((e) => e.event === name);

function prepareRequest(receiptId = 'heist:receipt:bw02') {
  return { receiptId, facilityId: 'lawful_catcher', payloadStableId: BREAKAWAY_SP07.stableId };
}

// ── geometry ────────────────────────────────────────────────────────────────────────────────────

test('the fork faces the launch line, sits in front of the catcher head, and the launch misses it', async () => {
  const t = await boot();
  const catcher = PQ019_FACILITIES.lawful_catcher;
  const launcher = PQ019_FACILITIES.heist_launcher;
  const mouth = projectBreakawayForkMouth();
  const socketC = projectPq019FacilitySocket(catcher);
  const socketL = projectPq019FacilitySocket(launcher);
  const lineLen = Math.hypot(socketC.x - socketL.x, socketC.z - socketL.z);
  const ux = (socketC.x - socketL.x) / lineLen;
  const uz = (socketC.z - socketL.z) / lineLen;
  const angle = Math.acos(Math.min(1, mouth.nx * ux + mouth.nz * uz));
  assert.ok(angle < (2 * Math.PI) / 180, `inward normal within 2° of the launch line (${angle} rad)`);

  const back = Math.hypot(socketC.x - mouth.x, socketC.z - mouth.z);
  assert.equal(Math.round(back * 1e6) / 1e6,
    BREAKAWAY_CAPTURE_FORK.depth + catcher.headRadius + BREAKAWAY_CAPTURE_FORK.rearClearanceWu,
    'the catcher head is the rear stop, just behind the usable bay');

  // The breakaway heading passes the fork mouth far wider than its rails: it never self-delivers.
  const heading = Math.atan2(uz, ux) + BREAKAWAY_SP07.launchHeadingOffsetRad;
  const hx = Math.cos(heading);
  const hz = Math.sin(heading);
  const mx = mouth.x - socketL.x;
  const mz = mouth.z - socketL.z;
  const miss = Math.abs(mx * hz - mz * hx);
  assert.ok(miss > 500, `launch ray misses the fork mouth by ${Math.round(miss)} WU`);
  assert.ok(t.receiver.halfWidth === 27 && t.receiver.depth === 72);
});

// ── successful approaches ───────────────────────────────────────────────────────────────────────

test('a clean 80 WU/s free-flight entry is braked by bounded force and settles into custody', async () => {
  const t = await boot();
  const load = launch(t);
  place(t, load, { depth: -60, vIn: 80, spin: 0.3 });
  const stopDepth = rearStopDepth(t, load);
  const { worstTeleport, maxDepth } = run(t, load, 600, () => !!settledCandidate(t));

  // The FORK stopped it, not the rear stop: the load never came near the catcher head.
  assert.ok(maxDepth <= BREAKAWAY_CAPTURE_FORK.depth - BREAKAWAY_SP07.radius,
    `bounded braking arrested the load inside the bay (deepest ${maxDepth} WU)`);
  assert.ok(maxDepth < stopDepth - 2, `deepest ${maxDepth} WU stays short of the rear stop at ${stopDepth} WU`);

  const candidate = settledCandidate(t);
  assert.ok(candidate, 'a settled-capture custody receipt was produced');
  assert.equal(candidate.facilityId, 'lawful_catcher');
  assert.equal(candidate.scheduleId, SCHEDULE);
  assert.equal(eventsNamed(t, 'capture_acquired').length, 1);
  assert.equal(eventsNamed(t, 'capture_ready').length, 1, 'exactly one readiness event');

  const p = local(t, load);
  assert.ok(p.depth >= BREAKAWAY_SP07.radius && p.depth <= BREAKAWAY_CAPTURE_FORK.depth - BREAKAWAY_SP07.radius,
    `the whole load is inside the bay (depth ${p.depth})`);
  assert.ok(Math.abs(p.lateral) <= BREAKAWAY_CAPTURE_FORK.halfWidth - BREAKAWAY_SP07.radius);
  assert.ok(p.speed <= BREAKAWAY_CAPTURE_FORK.settleSpeed, `settled speed ${p.speed}`);
  assert.ok(Math.abs(load.angVel) <= BREAKAWAY_CAPTURE_FORK.settleOmega, `settled spin ${load.angVel}`);
  assert.ok(worstTeleport < 0.75, `no pose write: worst unexplained displacement ${worstTeleport} WU`);

  // Custody passes only through the owner's two-phase handoff, re-proven fresh at each phase.
  const prepared = t.system.prepareReceiverHandoff(prepareRequest());
  assert.equal(prepared.prepared, true, JSON.stringify(prepared));
  const committed = t.system.commitReceiverHandoff('heist:receipt:bw02');
  assert.equal(committed.committed, true, JSON.stringify(committed));
  t.sim.step(SIM_DT);
  assert.equal(t.state.entities.get(load.id)?.alive === true, false, 'the receiver consumed the load');
});

test('a slow 20 WU/s tow-in advances fully into the bay before braking, then settles', async () => {
  const t = await boot();
  const load = launch(t);
  place(t, load, { depth: -30, vIn: 20 });
  const stopDepth = rearStopDepth(t, load);
  const { maxDepth } = run(t, load, 600, () => !!settledCandidate(t));
  assert.ok(settledCandidate(t), 'a slow approach is not stranded at the mouth');
  assert.ok(maxDepth < stopDepth - 2, 'the slow load is arrested by the fork, not the rear stop');
  const p = local(t, load);
  assert.ok(p.depth >= BREAKAWAY_SP07.radius, `the load advanced past one radius (depth ${p.depth})`);
});

// ── refusals ────────────────────────────────────────────────────────────────────────────────────

test('an overspeed entry is refused truthfully and never acquires', async () => {
  const t = await boot();
  const load = launch(t);
  place(t, load, { depth: -40, vIn: 130 });
  const stopDepth = rearStopDepth(t, load);
  const { maxDepth } = run(t, load, 150);
  // Control for the clean-catch assertion: an unbraked load really does run into the rear stop, so
  // "stays short of the stop" there is a measured difference, not a bound nothing could exceed.
  assert.ok(maxDepth >= stopDepth - 1.5, `the refused load reaches the rear stop (${maxDepth} vs ${stopDepth})`);
  const refusals = eventsNamed(t, 'capture_refused');
  assert.ok(refusals.some((e) => e.reason === 'too_fast'), JSON.stringify(t.events));
  assert.equal(eventsNamed(t, 'capture_acquired').length, 0);
  assert.equal(settledCandidate(t), null, 'no custody from an overspeed pass');
  assert.equal(t.system.prepareReceiverHandoff(prepareRequest()).prepared, false);
});

test('a side entry through the rails never acquires', async () => {
  const t = await boot();
  const load = launch(t);
  place(t, load, { depth: 36, lateral: 70, vLat: -40 });
  run(t, load, 180);
  assert.equal(eventsNamed(t, 'capture_acquired').length, 0);
  assert.equal(settledCandidate(t), null);
});

test('dragging the load back out of the fork loses capture and produces no custody', async () => {
  const t = await boot();
  const load = launch(t);
  place(t, load, { depth: -30, vIn: 40 });
  run(t, load, 240, () => eventsNamed(t, 'capture_acquired').length > 0 && local(t, load).depth > 20);
  assert.equal(eventsNamed(t, 'capture_acquired').length, 1);

  // A strong tug straight back out, queued through the physics authority like any other force.
  const tug = () => queuePhysicsImpulse(load, {
    x: -t.receiver.nx * 900, y: 0, z: -t.receiver.nz * 900,
  }, { provenance: 'test:tug', tick: t.state.tick, kind: 'tow' });
  run(t, load, 240, () => eventsNamed(t, 'capture_lost').length > 0, tug);
  assert.equal(eventsNamed(t, 'capture_lost').length, 1, 'pulling the load out loses capture');
  assert.equal(settledCandidate(t), null, 'no custody receipt for a load that left');
});

// ── fresh custody at prepare and commit ─────────────────────────────────────────────────────────

test('a load moved after settling has no custody at prepare', async () => {
  const t = await boot();
  const load = launch(t);
  place(t, load, { depth: -60, vIn: 80 });
  run(t, load, 600, () => !!settledCandidate(t));
  assert.ok(settledCandidate(t));
  const tug = () => queuePhysicsImpulse(load, {
    x: -t.receiver.nx * 900, y: 0, z: -t.receiver.nz * 900,
  }, { provenance: 'test:tug', tick: t.state.tick, kind: 'tow' });
  run(t, load, 240, () => t.state.heistFacilities.capture.phase === 'outside', tug);

  const prepared = t.system.prepareReceiverHandoff(prepareRequest());
  assert.equal(prepared.prepared, false, 'a historical settle is not custody');
  assert.equal(prepared.reason, 'not_ready_or_stale');
  assert.equal(load.alive, true, 'the load is untouched by a refused prepare');
});

test('custody lost between prepare and commit is refused at commit, and nothing is consumed', async () => {
  const t = await boot();
  const load = launch(t);
  place(t, load, { depth: -60, vIn: 80 });
  run(t, load, 600, () => !!settledCandidate(t));
  assert.equal(t.system.prepareReceiverHandoff(prepareRequest()).prepared, true);

  // One hard shove through physics, then the owner's next mechanical tick sees an unsettled load.
  queuePhysicsImpulse(load, { x: -t.receiver.nx * 9000, y: 0, z: -t.receiver.nz * 9000 },
    { provenance: 'test:shove', tick: t.state.tick, kind: 'impact' });
  t.sim.step(SIM_DT);
  const committed = t.system.commitReceiverHandoff('heist:receipt:bw02');
  assert.equal(committed.committed, false);
  assert.equal(committed.reason, 'not_ready_or_stale');
  assert.equal(t.state.entities.get(load.id)?.alive, true, 'nothing is consumed without fresh custody');
});

test('touching the catcher head is a collision, never a delivery, for the fork variant', async () => {
  const t = await boot();
  const load = launch(t);
  const head = t.state.entityList.find((e) => e?.alive !== false && e.data?.heistFacilityRole === 'lawful_catcher_head');
  assert.ok(head);
  t.bus.emit('physics:impact', {
    tick: t.state.tick, aId: load.id, bId: head.id, dp: 500, pos: { x: head.pos.x, z: head.pos.z },
  });
  assert.equal(t.candidates.length, 0, 'no touch custody for a capture-fork load');
});
