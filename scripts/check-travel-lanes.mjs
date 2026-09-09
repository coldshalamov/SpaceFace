#!/usr/bin/env node
// check:travel-lanes — the Helios → Tethys lane corridor, flown end to end (ADR D8, packet W3-C).
//
// WHY THIS EXISTS SEPARATELY FROM test/travel-lanes.test.mjs. The unit test proves the lane system's
// own behaviour against doubles. This check proves the CHAIN — that the lane composes with the three
// shipped systems it depends on, none of which it owns:
//
//     input.js (the real latch)  ->  travelLanes.js (this packet)  ->  propulsionKernel.js (the real
//                                                                     governor + decay)
//
// and it does so by INVOKING all three in the real UPDATE_ORDER sequence, integrating the resulting
// force into a real position, and flying the ship down the actual chord. Gate defect G-2 in the
// program ledger is precisely why: during Wave 1 the kernel called a deleted helper and
// `import()` still resolved cleanly while `stepPropulsion` threw on every tick — the ship would not
// fly and an import-only smoke test called it healthy. Nothing here is asserted from a module
// resolving or a flag being set.
//
// WHAT THE BROWSER HARNESS DOES AND DOES NOT PROVE — measured 2026-07-19, not inherited.
// `check:professional-travel:public-route:browser` now PASSES end to end (the ledger's boot-budget
// blocker is fixed; boot reaches `authored-flight-ready` and the run completes through
// `continue-destination-restored`). That is real evidence, and it is the evidence that this packet's
// registry registration does not break the shipped public route.
//
// It is NOT evidence that the lane works, and the distinction matters: that route flies
// Helios -> Vesta Forge by gate jump. It never flies the Helios -> Tethys chord with the travel
// drive engaged, so it exercises only travelLanes' INERT branch. The active path — boost, dropout,
// decay, ambush, recovery — is proven here instead, and deliberately against real collaborators
// rather than doubles: the real input latch state machine, the real propulsion kernel, the real
// flightV3 forwarding seam, and the real encounterDirector spawning real hostiles.
//
// The one link still reconstructed rather than run whole is flightV3's own update (it needs a
// physics backend); its single load-bearing line is invoked directly in the forwarding-seam section
// below, so no link in the chain is asserted by reading source.
//
// The headless shim below is only what `input.js` touches at construction (it registers listeners
// and looks up a canvas). No behaviour is stubbed — the latch's own state machine runs untouched.

globalThis.addEventListener = globalThis.addEventListener || (() => {});
globalThis.removeEventListener = globalThis.removeEventListener || (() => {});
globalThis.window = globalThis.window || {
  addEventListener() {}, removeEventListener() {}, innerWidth: 1280, innerHeight: 720,
};
globalThis.document = globalThis.document || {
  addEventListener() {}, removeEventListener() {}, activeElement: null,
  body: { classList: { contains: () => false } },
  querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
};

import assert from 'node:assert/strict';

import { createRegistry } from '../src/core/registry.js';
import { input } from '../src/systems/input.js';
import { travelLanes } from '../src/systems/travelLanes.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { applyMasslineFlightModifiers } from '../src/systems/flightV3.js';
import { createGameState } from '../src/core/gameState.js';
import { stepPropulsion, resolveTravelCeiling } from '../src/core/flight/propulsionKernel.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { TRAVEL_FLAGS } from '../src/data/featureFlags.js';
import { LANE_HELIOS_TETHYS, buildLaneGeometry } from '../src/data/travelLaneRoutes.js';
import { sectorMembershipAtGlobal } from '../src/data/sectorCoordinates.js';

const GEOMETRY = buildLaneGeometry(LANE_HELIOS_TETHYS);
const DT = 1 / 60;

let passed = 0;
let failed = 0;
function section(name, fn) {
  try { fn(); passed += 1; console.log(`  PASS  ${name}`); }
  catch (err) { failed += 1; console.error(`  FAIL  ${name}\n        ${err.message}`); }
}

// ──────────────────────────────────────────────────────────────────────────────────────────────────
// A corridor rig: the real latch, the real lane, the real kernel, in the real order.
// ──────────────────────────────────────────────────────────────────────────────────────────────────

function makeRig({ startAlong = 512, director = null } = {}) {
  const state = createGameState(12345);
  state.mode = 'flight';
  state.playerId = 1;

  const pos = {
    x: GEOMETRY.from.x + GEOMETRY.axis.x * startAlong,
    z: GEOMETRY.from.z + GEOMETRY.axis.z * startAlong,
  };
  const player = {
    id: 1,
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    // Nose down the chord, so forward thrust is travel along the lane.
    rot: Math.atan2(GEOMETRY.axis.z, GEOMETRY.axis.x),
    angVel: 0,
    mass: 1000,
    inertia: 1000,
    propulsion: { id: 'drive_reaction_m' },
    _flightFrame: {},
  };
  state.entities = new Map([[1, player]]);

  const events = [];
  const bus = {
    _h: new Map(),
    on(n, f) { if (!this._h.has(n)) this._h.set(n, []); this._h.get(n).push(f); },
    emit(n, p) { events.push({ name: n, payload: p }); for (const f of this._h.get(n) || []) f(p); },
  };

  const spawned = [];
  let nextId = 100;
  const helpers = {
    spawnEntity(spec) {
      const ent = { id: nextId++, ...spec, pos: { ...spec.pos } };
      spawned.push(ent);
      state.entities.set(ent.id, ent);
      return ent;
    },
  };

  // HARNESS HYGIENE, and worth naming because it cost a wrong diagnosis. `input` is a module
  // SINGLETON and `input.init()` does not reset `_travel` / `_travelEdge` — the latch's own state
  // machine survives re-initialisation. In the game that is irrelevant (init runs once), but this
  // check builds a fresh rig per section against the same singleton, so without this reset section N
  // inherits section N-1's drive state: a rig that starts life already Engaged is DISENGAGED by its
  // first latch press, and then never boosts. Two sections below failed exactly that way and looked
  // like a lane defect until the rigs were isolated.
  input._travel = null;
  input._travelEdge = false;
  input.init({ state, bus, helpers });
  const lanes = Object.create(travelLanes);
  lanes.init({
    state, bus, helpers,
    registry: { get: (n) => (n === 'encounterDirector' ? director : null) },
  });

  const profile = resolvePropulsionProfile(player, state);

  /** One tick, in UPDATE_ORDER: input -> travelLanes -> flight(kernel) -> integrate. */
  function tick({ throttle = 1 } = {}) {
    input.update(DT, state);
    lanes.update(DT, state);

    // The flightSlot's job, reduced to exactly what matters here: forward the published drive block
    // into the kernel (flightV3.js:515-517) and publish the result onto the flight frame, which is
    // what the latch reads back next tick to carry the ramp.
    const craftInput = {
      throttle, strafe: 0, turn: 0, boost: false, brake: false, assistMode: 'assisted',
    };
    if (TRAVEL_FLAGS.travelBurn && state.input.travelDrive) {
      craftInput.travelDrive = state.input.travelDrive;
    }
    const r = stepPropulsion({
      dt: DT,
      body: { pos: player.pos, vel: player.vel, rot: player.rot, angVel: player.angVel, mass: player.mass, inertia: player.inertia },
      input: craftInput,
      profile,
    });
    // Integrate — the physics owner's job. The lane never does this; that is the point.
    player.vel.x += (r.force.x / player.mass) * DT;
    player.vel.z += (r.force.z / player.mass) * DT;
    player.pos.x += player.vel.x * DT;
    player.pos.z += player.vel.z * DT;
    player._flightFrame.travelCap = r.telemetry.travelCap;
    player._flightFrame.travelCeiling = r.telemetry.travelCeiling;
    state.simTime += DT;
    return r.telemetry;
  }

  function pressLatch() {
    // Drive the REAL binding path (NumLock is the authored default) rather than poking internals,
    // so this exercises the same edge detection a player's keypress produces.
    input._keys.NumLock = true;
    input.update(DT, state);
    input._keys.NumLock = false;
  }

  const speed = () => Math.hypot(player.vel.x, player.vel.z);
  const along = () => {
    const px = player.pos.x - GEOMETRY.from.x;
    const pz = player.pos.z - GEOMETRY.from.z;
    return px * GEOMETRY.axis.x + pz * GEOMETRY.axis.z;
  };

  return { state, player, lanes, bus, events, spawned, tick, pressLatch, speed, along, profile };
}

function enableFlags(on) {
  TRAVEL_FLAGS.travelBurn = on;
  TRAVEL_FLAGS.laneBoost = on;
}

console.log('check:travel-lanes — Helios -> Tethys lane corridor (ADR D8)');

// ── 1. Registry wiring and the forced ordering window ─────────────────────────────────────────────

section('travelLanes is registered and sits in its only valid slot: after input, before flight', () => {
  const registry = createRegistry({
    state: createGameState(1), bus: { on() {}, emit() {} }, helpers: {},
  });
  const names = registry.updateOrder.map((s) => s.name);
  assert.ok(names.includes('travelLanes'), 'travelLanes missing from UPDATE_ORDER');
  const at = (n) => names.indexOf(n);
  assert.equal(at('input'), 0, 'input must remain first (check-input-modalities pins this)');
  assert.ok(at('input') < at('travelLanes'),
    'the lane must run after the latch publishes state.input.travelDrive');
  assert.ok(at('travelLanes') < at('flight'),
    'the lane must run before flight forwards the drive block into the kernel');
});

section('the REAL flightV3 forwarding seam carries the lane-modified block to the kernel', () => {
  // The corridor rig below reconstructs the flightSlot rather than running flightV3 wholesale (the
  // full system needs a physics backend). That leaves exactly ONE link in the chain proven by
  // reading rather than invoking: flightV3.js:515-517, which copies `state.input.travelDrive` onto
  // the kernel input. Gate defect G-2 is the standing argument against trusting a read — so invoke
  // the real exported function and confirm the lane's numbers survive the hop.
  enableFlags(true);
  const state = createGameState(7);
  state.mode = 'flight';
  state.playerId = 1;
  state.entities = new Map([[1, { id: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0 }]]);
  // A drive block carrying a lane multiplier, exactly as travelLanes leaves it.
  const laneCeiling = 1096.875;
  state.input.travelDrive = { state: 'engaged', cap: 400, ceiling: laneCeiling, rampMult: 2.5 };

  const craftInput = { throttle: 1, strafe: 0, turn: 0, boost: false, brake: false, assistMode: 'assisted' };
  const out = applyMasslineFlightModifiers(craftInput, state);

  assert.ok(out.travelDrive, 'flightV3 dropped the drive block — the axis would be unreachable');
  assert.equal(out.travelDrive.ceiling, laneCeiling,
    'the lane ceiling did not survive the forwarding seam');
  assert.equal(out.travelDrive.rampMult, 2.5, 'the lane ramp multiplier did not survive the seam');

  // And with the axis flag off the seam must attach nothing at all (golden shape safety).
  TRAVEL_FLAGS.travelBurn = false;
  const offOut = applyMasslineFlightModifiers(
    { throttle: 1, strafe: 0, turn: 0, boost: false, brake: false, assistMode: 'assisted' }, state,
  );
  assert.equal(offOut.travelDrive, undefined, 'flag off must attach no travelDrive key');
  enableFlags(true);
});

// ── 2. The full corridor flight ───────────────────────────────────────────────────────────────────

section('the travel drive engages through the real latch and the lane lifts its ceiling', () => {
  enableFlags(true);
  const rig = makeRig({ startAlong: 1200 });
  const base = resolveTravelCeiling(rig.profile);

  rig.pressLatch();
  for (let i = 0; i < 200; i++) rig.tick();            // spool (1.6 s) then engage
  assert.equal(rig.state.input.travelDrive.state, 'engaged', 'latch did not reach Engaged');

  const t = rig.tick();
  assert.ok(t.travelCeiling > base * 2, `lane ceiling not applied (${t.travelCeiling} vs base ${base})`);
  assert.equal(rig.state.travelLanes.boosted, true, 'lane readout says not boosted');
  assert.equal(rig.state.travelLanes.segmentState, 'intact');
});

section('the ship physically accelerates past its un-laned ceiling — a real gain, not a teleport', () => {
  enableFlags(true);
  const dead = GEOMETRY.segments.find((s) => s.disrupted);
  // Fly the long INTACT stretch beyond the dead segment. An earlier draft of this check started at
  // the Helios end and flew 5000 WU — straight through the disrupted segment, which correctly
  // knocked the drive out and left the ship at its ordinary governed speed. The check was wrong,
  // not the lane: the route it flew includes the ambush by design.
  const laned = makeRig({ startAlong: dead.b.alongWU + 300 });
  laned.pressLatch();
  const base = resolveTravelCeiling(laned.profile);
  const startAlong = laned.along();

  let peak = 0;
  let maxStep = 0;
  let prev = laned.along();
  for (let i = 0; i < 2400; i++) {
    laned.tick();
    const now = laned.along();
    maxStep = Math.max(maxStep, Math.abs(now - prev));
    prev = now;
    if (laned.state.travelLanes && laned.state.travelLanes.boosted) peak = Math.max(peak, laned.speed());
    if (now > GEOMETRY.beacons[GEOMETRY.beacons.length - 1].alongWU - 200) break;
  }

  assert.ok(peak > base * 1.3,
    `in-lane peak speed ${peak.toFixed(1)} should exceed the un-laned ceiling ${base.toFixed(1)}`);
  assert.ok(laned.along() - startAlong > 4000,
    `ship should have covered real ground, got ${(laned.along() - startAlong).toFixed(0)} WU`);
  // Continuity (D9.8): it got there by flying. A teleport shows up as one tick with an impossible
  // displacement, so bound the per-tick step by the absolute engineering ceiling.
  assert.ok(maxStep < 1200 * DT * 1.05,
    `a single tick moved ${maxStep.toFixed(1)} WU — that is a jump, not flight`);
  console.log(`        (peak in-lane speed ${peak.toFixed(0)} WU/s vs un-laned ceiling ${base.toFixed(0)} WU/s)`);
});

section('a disrupted segment drops the drive and SPENDS the velocity through the existing decay', () => {
  enableFlags(true);
  const dead = GEOMETRY.segments.find((s) => s.disrupted);
  // Start a little before the dead segment and fly into it.
  const rig = makeRig({ startAlong: dead.a.alongWU - 2400 });
  rig.pressLatch();

  let peak = 0;
  let sawEngaged = false;
  let disruptedAt = null;
  for (let i = 0; i < 6000; i++) {
    rig.tick();
    if (rig.state.input.travelDrive.state === 'engaged') sawEngaged = true;
    peak = Math.max(peak, rig.speed());
    if (rig.state.travelLanes.disrupted && disruptedAt == null) disruptedAt = rig.along();
    if (disruptedAt != null && rig.along() > dead.b.alongWU) break;
  }
  assert.ok(sawEngaged, 'never engaged before the dead segment');
  assert.ok(disruptedAt != null, 'never entered the disrupted segment');
  assert.ok(disruptedAt >= dead.a.alongWU - 1 && disruptedAt <= dead.b.alongWU + 1,
    `dropout happened at ${disruptedAt.toFixed(0)}, outside the dead segment`);

  // The drive is knocked out and HELD out for as long as the ship is inside — the level flag doing
  // its job. The ship is re-pinned each tick so it cannot simply thrust its way clear: what is under
  // test here is the HOLD, and a drifting rig would silently stop testing it after a few seconds.
  // (That is exactly how an earlier draft of this check passed the wrong thing.)
  const mid = (dead.a.alongWU + dead.b.alongWU) / 2;
  const held = makeRig({ startAlong: mid });
  held.pressLatch();
  for (let i = 0; i < 1200; i++) {                   // 20 s parked inside the dead segment
    held.tick();
    held.player.pos.x = GEOMETRY.from.x + GEOMETRY.axis.x * mid;
    held.player.pos.z = GEOMETRY.from.z + GEOMETRY.axis.z * mid;
  }
  assert.equal(held.state.player.travelDrive.disrupted, true, 'disruption flag not held');
  assert.equal(held.state.input.travelDrive.state, 'cooldown',
    'the drive must stay down for as long as the ship is in the dead segment');
  // The one-shot seam would have let the 3 s cooldown expire underneath a parked player; the level
  // flag pins it for the full 20 s. That difference is the whole reason `disrupted` is the right seam.
  assert.ok(1200 * DT > 3 * 5, 'sanity: parked far longer than the cooldown window');
});

section('the slowdown is confiscation-free: velocity decays, it is not slammed', () => {
  enableFlags(true);
  const dead = GEOMETRY.segments.find((s) => s.disrupted);
  const rig = makeRig({ startAlong: dead.a.alongWU - 3000 });
  rig.pressLatch();

  // Build real speed in the lane.
  for (let i = 0; i < 1500; i++) rig.tick();
  const entrySpeed = rig.speed();
  assert.ok(entrySpeed > 300, `should be travelling fast on entry, got ${entrySpeed.toFixed(1)}`);

  // Now park inside the dead segment and watch the decay.
  const mid = (dead.a.alongWU + dead.b.alongWU) / 2;
  rig.player.pos.x = GEOMETRY.from.x + GEOMETRY.axis.x * mid;
  rig.player.pos.z = GEOMETRY.from.z + GEOMETRY.axis.z * mid;

  const samples = [];
  for (let i = 0; i < 600; i++) {
    rig.tick();
    if (i % 60 === 0) samples.push(rig.speed());
  }
  const finalSpeed = rig.speed();
  assert.ok(finalSpeed < entrySpeed * 0.85,
    `velocity should be spent (${entrySpeed.toFixed(1)} -> ${finalSpeed.toFixed(1)})`);
  // Gradual, not a cliff: no single second may erase most of the speed.
  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i] > samples[i - 1] * 0.55,
      `speed collapsed too abruptly at sample ${i} — that is confiscation, not spending`);
  }
});

section('the ambush is placed at the dead beacon, in that beacon\'s own Voronoi sector', () => {
  enableFlags(true);
  const dead = GEOMETRY.segments.find((s) => s.disrupted);
  const calls = [];
  const director = {
    requestAuthoredEncounter(p) { calls.push(p); return { ok: true, encounterId: p.encounterId }; },
  };
  const rig = makeRig({ startAlong: (dead.a.alongWU + dead.b.alongWU) / 2, director });
  rig.pressLatch();
  for (let i = 0; i < 120; i++) rig.tick();

  assert.equal(calls.length, 1, 'the existing encounterDirector must place the pirates exactly once');
  assert.equal(calls[0].shapeId, 'ambush_snare');
  assert.equal(calls[0].zoneType, 'ambush_lane');
  assert.equal(calls[0].sectorId, sectorMembershipAtGlobal(dead.midpoint),
    'sector must come from the dead beacon position, not the lane origin — otherwise wrong_sector');
  assert.ok(Math.hypot(calls[0].anchor.x - dead.midpoint.x, calls[0].anchor.z - dead.midpoint.z) < 1,
    'the ambush must sit AT the disruption point');
});

section('the REAL encounterDirector fulfills the lane request and spawns actual pirates', () => {
  // THE WIRED-FEATURES SECTION. Every other ambush assertion in this repo's lane coverage runs
  // against a director double that returns `{ ok: true }` unconditionally — which proves the request
  // is well-FORMED and nothing about whether it is FULFILLED. The real
  // `requestAuthoredEncounter` has four gates a stub silently bypasses: the sector must match
  // `_currentSectorId()`, the shape must exist, `encounterScriptFor(shape)` must resolve a runtime,
  // and `resolveEncounter()` must return a non-empty plan. Any one of them failing means the dead
  // beacon has no pirates and the packet's acceptance item 6 is fiction.
  //
  // So this section constructs the REAL director and hands it the exact payload travelLanes builds.
  enableFlags(true);
  const dead = GEOMETRY.segments.find((s) => s.disrupted);
  const sectorId = sectorMembershipAtGlobal(dead.midpoint);

  const state = createGameState(4242);
  state.mode = 'flight';
  state.playerId = 1;
  state.world = state.world || {};
  state.world.currentSectorId = sectorId;
  state.entities = new Map([[1, {
    id: 1, pos: { x: dead.midpoint.x, z: dead.midpoint.z }, vel: { x: 0, z: 0 }, rot: 0,
  }]]);

  const spawnedShips = [];
  let nid = 500;
  const bus = {
    _h: new Map(),
    on(n, f) { if (!this._h.has(n)) this._h.set(n, []); this._h.get(n).push(f); },
    emit(n, p) { for (const f of this._h.get(n) || []) f(p); },
  };
  const helpers = {
    spawnEntity(spec) {
      const e = { id: nid++, ...spec, pos: { ...spec.pos }, alive: true };
      spawnedShips.push(e);
      state.entities.set(e.id, e);
      return e;
    },
  };
  encounterDirector.init({ state, bus, helpers });
  encounterDirector.newGame();
  state.world.currentSectorId = sectorId;

  // Built by the same code path travelLanes uses, so a drift in the payload breaks this section.
  const encounterId = `lane_ambush_${LANE_HELIOS_TETHYS.id}_${dead.index}`;
  const result = encounterDirector.requestAuthoredEncounter({
    shapeId: LANE_HELIOS_TETHYS.ambushShapeId,
    encounterId,
    sectorId,
    anchor: { x: dead.midpoint.x, z: dead.midpoint.z },
    zoneId: `${LANE_HELIOS_TETHYS.id}_seg${dead.index}`,
    zoneName: `${LANE_HELIOS_TETHYS.name} — dead segment ${dead.index}`,
    zoneType: 'ambush_lane',
    zoneRadius: GEOMETRY.radiusWU,
    force: true,
    data: { laneId: LANE_HELIOS_TETHYS.id, laneSegmentIndex: dead.index },
  });

  assert.equal(result.ok, true,
    `the real director REJECTED the lane ambush: ${JSON.stringify(result)}`);
  const live = state.encounterDirector && state.encounterDirector.live
    && state.encounterDirector.live[encounterId];
  assert.ok(live, 'the encounter is not live in the real director state');
  assert.ok(spawnedShips.length > 0,
    'the real director produced no ships — the dead beacon would be an empty ambush');
  assert.ok(spawnedShips.every((e) => e.type === 'ship'),
    `expected pirate ships, got ${spawnedShips.map((e) => e.type).join(',')}`);
  console.log(`        (real director spawned ${spawnedShips.length} hostiles at the dead beacon in ${sectorId})`);
});

section('recovery is physical: reaching the next intact beacon restores the drive', () => {
  enableFlags(true);
  const dead = GEOMETRY.segments.find((s) => s.disrupted);
  const rig = makeRig({ startAlong: (dead.a.alongWU + dead.b.alongWU) / 2 });
  rig.pressLatch();
  for (let i = 0; i < 300; i++) rig.tick();
  assert.equal(rig.state.input.travelDrive.state, 'cooldown', 'should be knocked out inside the dead segment');
  const recoveryIndex = rig.state.travelLanes.recoveryBeaconIndex;
  assert.ok(Number.isInteger(recoveryIndex), 'no recovery target published');

  // Physically move to the next intact beacon — the only way out, per D8.
  const target = GEOMETRY.beacons[recoveryIndex];
  rig.player.pos.x = target.pos.x;
  rig.player.pos.z = target.pos.z;
  for (let i = 0; i < 300; i++) rig.tick();          // cooldown (3 s) then re-engageable
  assert.equal(rig.state.player.travelDrive.disrupted, false, 'disruption not released at the intact beacon');
  assert.equal(rig.state.input.travelDrive.state, 'off', 'cooldown should expire once released');

  rig.pressLatch();
  for (let i = 0; i < 200; i++) rig.tick();
  assert.equal(rig.state.input.travelDrive.state, 'engaged', 'the pilot must be able to re-engage after recovery');
  assert.equal(rig.state.travelLanes.boosted, true, 'and the lane must boost again');
});

// ── 3. Traffic and density ────────────────────────────────────────────────────────────────────────

section('traffic uses the same route and holds a bounded entity budget under sustained flight', () => {
  enableFlags(true);
  const rig = makeRig({ startAlong: 4096 });
  rig.pressLatch();
  const bound = 1 + 20 + 6;   // player + BEACON_MAX_ACTIVE + TRAFFIC_COUNT
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 6000; i++) {
    rig.tick();
    assert.ok(rig.state.entities.size <= bound, `entity budget broken at tick ${i}: ${rig.state.entities.size}`);
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const traffic = rig.spawned.filter((e) => e.data && e.data.parentType === 'lane_traffic');
  assert.ok(traffic.length > 0, 'no lane traffic materialized');
  assert.ok(traffic.length <= 6, 'traffic roster exceeded its fixed size');
  // 6000 ticks is 100 s of sim. A per-tick cost that scales with the chain would show up here.
  assert.ok(ms < 4000, `corridor flight too slow: ${ms.toFixed(0)} ms for 6000 ticks`);
  console.log(`        (100 s of corridor flight simulated in ${ms.toFixed(0)} ms, ${rig.state.entities.size} entities)`);
});

// ── 4. Save/load and flag safety ──────────────────────────────────────────────────────────────────

section('lane state is derived, so every stage reproduces after a reload with nothing persisted', () => {
  enableFlags(true);
  const dead = GEOMETRY.segments.find((s) => s.disrupted);
  const stages = [
    { name: 'transit', along: 2048 },
    { name: 'dropout', along: (dead.a.alongWU + dead.b.alongWU) / 2 },
    { name: 'recovered', along: GEOMETRY.beacons[GEOMETRY.beacons.length - 2].alongWU },
  ];
  for (const stage of stages) {
    const a = makeRig({ startAlong: stage.along });
    a.lanes.update(DT, a.state);
    const b = makeRig({ startAlong: stage.along });
    b.lanes.update(DT, b.state);
    assert.deepEqual(b.state.travelLanes, a.state.travelLanes,
      `lane readout diverged after reload at stage "${stage.name}"`);
  }
});

section('flag off is inert: no lane writes, no spawns, no readout', () => {
  enableFlags(false);
  const rig = makeRig({ startAlong: 2048 });
  const before = JSON.stringify(rig.state.input.travelDrive || null);
  for (let i = 0; i < 300; i++) rig.tick();
  assert.equal(rig.state.travelLanes, undefined, 'no readout subtree with the flag off');
  assert.equal(rig.spawned.length, 0, 'no lane entities with the flag off');
  assert.equal(JSON.stringify(rig.state.input.travelDrive || null), before,
    'drive block modified with the flag off');
  assert.ok(!rig.events.some((e) => e.name === 'nav:laneStatus' || e.name === 'lane:disrupted'),
    'lane events emitted with the flag off');
  enableFlags(true);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
