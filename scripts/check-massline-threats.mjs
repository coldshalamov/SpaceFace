// Massline rung 09 acceptance check: threat-event detection.
//
// masslineThreats is its own registered observer system running immediately after
// masslineTelemetry. It reads the settled tether mirror + telemetry kinematics + entities and
// emits `massline:threat` ({ kind, targetId, severity, tick, time }), mirroring the record at
// state.player.masslineThreats (its OWN subtree — observer discipline).
//
// Contract (src/systems/masslineThreats.js, THREAT_* constants):
//   - strain >= 0.75 (overload floor)      -> 'line-near-break', once per latch (first cross)
//   - strain below the floor               -> no near-break emit
//   - hostile closing while swinging       -> 'hostile-on-arc', once per hostile per latch;
//     resolved via scanner.isHostileToPlayer (never factionId); requires a genuine swing
//     (|tangentialSpeed| >= 25, the SNAP_CATCH_MIN_SPEED bar)
//   - not swinging                          -> no hostile-on-arc emit
//   - velocity carries into a body <=1.5 s -> 'collision-course', once per obstacle per latch
//   - slow approach (impact beyond 1.5 s)  -> no collision emit
//   - inactive tether                      -> nothing emits; subtree inactive + cleared
//   - latch reset                          -> throttles re-arm on a new targetId
//   - observer-only                        -> tether.strain/load + entities untouched by detection
//
// Same harness shape as check-massline-snapcatch.mjs/reelpump.mjs: real tetherGameplay.update +
// masslineTelemetry.update + masslineThreats.update in registry order, mocking only the
// attachments service.
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { SIM_DT } from '../src/core/sim.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { masslineTelemetry } from '../src/systems/masslineTelemetry.js';
import { masslineThreats } from '../src/systems/masslineThreats.js';

const DT = SIM_DT;
const TARGET_ID = 5909;
const PLAYER_ID = 7;
const HOSTILE_ID = 9001;
const HOSTILE_2_ID = 9002;
const NEUTRAL_ID = 9003;
const ROCK_ID = 9100;
const ATT_ID = 'att_threat_1';
const TETHER_DEF_ID = 'tether_standard';
const BREAK_TENSION = 1000;

assertNearBreakFiresOncePerLatch();
assertBelowFloorNeverFires();
assertHostileOnArcFiresPerHostile();
assertNoSwingNoHostileThreat();
assertCollisionCourseFiresOncePerObstacle();
assertSlowApproachNeverFires();
assertInactiveTetherEmitsNothing();
assertLatchResetRearms();
assertObserverOnly();

console.log('Massline threat checks OK');

// strain 0.8 >= 0.75 (overload floor): exactly one 'line-near-break' per latch, mirrored in the
// system's own subtree, payload === mirror record.
function assertNearBreakFiresOncePerLatch() {
  const h = createHarness();
  primeActiveTether(h, { restLength: 90, lastTension: 0.8 * BREAK_TENSION, pastCapture: true });

  const events = captureThreatEvents(h);
  stepTicks(h, 5);

  const fired = events.filter((e) => e.kind === 'line-near-break');
  assert.equal(fired.length, 1, `near-break must emit exactly once; got ${fired.length}`);
  const p = fired[0];
  assert.equal(p.targetId, TARGET_ID, 'near-break targetId must be the latched target');
  assert.ok(p.severity >= 0.75 && p.severity <= 1, `near-break severity must be strain-scaled; got ${p.severity}`);
  const runtime = h.state.player.masslineThreats;
  assert.ok(runtime && runtime.active, 'threats subtree must be active during the latch');
  assert.deepEqual(runtime.latest, p, 'emitted payload must equal the mirrored latest record');
  assert.ok(runtime.threats.includes(p), 'mirrored threats log must include the record');

  // Throttle: strain stays at 0.8 for 30 more ticks — still exactly one event (not per-tick).
  stepTicks(h, 30);
  assert.equal(events.filter((e) => e.kind === 'line-near-break').length, 1,
    'near-break must not re-emit on the same latch');
}

// strain 0.6 < 0.75: the near-break read must not fire.
function assertBelowFloorNeverFires() {
  const h = createHarness();
  primeActiveTether(h, { restLength: 90, lastTension: 0.6 * BREAK_TENSION, pastCapture: true });
  const events = captureThreatEvents(h);
  stepTicks(h, 30);
  assert.equal(events.filter((e) => e.kind === 'line-near-break').length, 0,
    'strain below the overload floor must not emit near-break');
}

// Swinging (target drifts z=30 -> |tangentialSpeed| = 30 >= 25) with two closing hostiles and one
// closing NEUTRAL: one 'hostile-on-arc' per hostile, none for the neutral, throttled per hostile.
function assertHostileOnArcFiresPerHostile() {
  const h = createHarness();
  h.target.vel = { x: 0, z: 30 };
  primeActiveTether(h, { restLength: 90, lastTension: 0.3 * BREAK_TENSION, pastCapture: true });
  addHostile(h, HOSTILE_ID, { x: 0, z: 200 }, { x: 0, z: -60 });   // closing 60 wu/s, 200 wu out
  addHostile(h, HOSTILE_2_ID, { x: 200, z: 0 }, { x: -50, z: 0 }); // closing 50 wu/s
  addNeutral(h, NEUTRAL_ID, { x: 0, z: -180 }, { x: 0, z: 55 });   // closing but passive/neutral

  const events = captureThreatEvents(h);
  stepTicks(h, 10);

  const arc = events.filter((e) => e.kind === 'hostile-on-arc');
  assert.equal(arc.length, 2, `one hostile-on-arc per hostile; got ${arc.length}`);
  const ids = arc.map((e) => e.targetId).sort();
  assert.deepEqual(ids, [HOSTILE_ID, HOSTILE_2_ID], 'threats must name the two hostiles, not the neutral');
  for (const e of arc) {
    assert.ok(e.severity > 0 && e.severity <= 1, `severity must be in (0,1]; got ${e.severity}`);
  }

  // Throttle: hostiles keep closing for 30 more ticks — still one event each.
  stepTicks(h, 30);
  assert.equal(events.filter((e) => e.kind === 'hostile-on-arc').length, 2,
    'hostile-on-arc must throttle per hostile, not per tick');
}

// Same closing hostile but NO swing (static target, static player -> tangentialSpeed 0): the
// on-arc read requires a genuine swing, so nothing fires.
function assertNoSwingNoHostileThreat() {
  const h = createHarness();
  primeActiveTether(h, { restLength: 90, lastTension: 0.3 * BREAK_TENSION, pastCapture: true });
  addHostile(h, HOSTILE_ID, { x: 0, z: 200 }, { x: 0, z: -60 });
  const events = captureThreatEvents(h);
  stepTicks(h, 10);
  assert.equal(events.filter((e) => e.kind === 'hostile-on-arc').length, 0,
    'no swing (tangential < 25) must mean no hostile-on-arc');
}

// Player velocity carries into a rock: gap = 90 - (11+6) = 73 wu at 55 wu/s -> impact ~1.33 s
// inside the 1.5 s horizon -> exactly one 'collision-course' for that rock.
function assertCollisionCourseFiresOncePerObstacle() {
  const h = createHarness();
  h.player.vel = { x: 0, z: 55 };
  primeActiveTether(h, { restLength: 90, lastTension: 0.3 * BREAK_TENSION, pastCapture: true });
  addRock(h, ROCK_ID, { x: 0, z: 90 });

  const events = captureThreatEvents(h);
  stepTicks(h, 5);

  const hits = events.filter((e) => e.kind === 'collision-course');
  assert.equal(hits.length, 1, `collision-course must emit exactly once; got ${hits.length}`);
  assert.equal(hits[0].targetId, ROCK_ID, 'collision threat must name the obstacle');
  assert.ok(hits[0].severity > 0 && hits[0].severity <= 1, `severity in (0,1]; got ${hits[0].severity}`);

  stepTicks(h, 30);
  assert.equal(events.filter((e) => e.kind === 'collision-course').length, 1,
    'collision-course must throttle per obstacle, not per tick');
}

// Same rock, slower approach (30 wu/s -> impact ~2.4 s beyond the 1.5 s horizon): no emit.
function assertSlowApproachNeverFires() {
  const h = createHarness();
  h.player.vel = { x: 0, z: 30 };
  primeActiveTether(h, { restLength: 90, lastTension: 0.3 * BREAK_TENSION, pastCapture: true });
  addRock(h, ROCK_ID, { x: 0, z: 90 });
  const events = captureThreatEvents(h);
  stepTicks(h, 10);
  assert.equal(events.filter((e) => e.kind === 'collision-course').length, 0,
    'impact predicted beyond the horizon must not emit');
}

// No active tether: danger conditions abound (hostile closing, collision imminent, would-be
// overload tension seeded) but the observer only reads during an active swing -> zero events.
function assertInactiveTetherEmitsNothing() {
  const h = createHarness();
  h.player.vel = { x: 0, z: 55 };
  h.attachments.seed({ restLength: 90, lastTension: 0.9 * BREAK_TENSION });
  addHostile(h, HOSTILE_ID, { x: 0, z: 200 }, { x: 0, z: -60 });
  addRock(h, ROCK_ID, { x: 0, z: 90 });
  // No primeActiveTether: tetherGameplay mirrors inactive each tick.

  const events = captureThreatEvents(h);
  stepTicks(h, 10);

  assert.equal(events.length, 0, 'inactive tether must emit nothing');
  const runtime = h.state.player.masslineThreats;
  assert.ok(runtime && !runtime.active, 'threats subtree must read inactive');
  assert.equal(runtime.threats.length, 0, 'no stale threat records on inactive');
  assert.equal(runtime.latest, null, 'no stale latest record on inactive');
}

// A new latch (new targetId) re-arms the per-latch throttles: near-break fires again on latch 2.
function assertLatchResetRearms() {
  const h = createHarness();
  primeActiveTether(h, { restLength: 90, lastTension: 0.8 * BREAK_TENSION, pastCapture: true });
  const events = captureThreatEvents(h);
  stepTicks(h, 5);
  assert.equal(events.filter((e) => e.kind === 'line-near-break').length, 1, 'latch 1 near-break fires');

  const ALT_ID = 6909;
  relatchNewTarget(h, ALT_ID, { restLength: 90, lastTension: 0.8 * BREAK_TENSION, pastCapture: true });
  stepTicks(h, 5);
  const fired = events.filter((e) => e.kind === 'line-near-break');
  assert.equal(fired.length, 2, 'new latch must re-arm the near-break throttle');
  assert.equal(fired[1].targetId, ALT_ID, 'second near-break must name the new latch target');
}

// Observer-only: across a full detection pass, tether.strain/load stay tetherGameplay's values and
// scanned entities are untouched (positions/velocities exactly as seeded).
function assertObserverOnly() {
  const h = createHarness();
  h.target.vel = { x: 0, z: 30 };
  primeActiveTether(h, { restLength: 90, lastTension: 0.8 * BREAK_TENSION, pastCapture: true });
  const hostile = addHostile(h, HOSTILE_ID, { x: 0, z: 200 }, { x: 0, z: -60 });
  captureThreatEvents(h);
  stepTicks(h, 10);

  const t = h.state.player.tether;
  assertNear(t.strain, 0.8, 'strain must remain lastTension/breakTension — detection must not warp it');
  // load = computeTetherLoad('overload', 0.8) = clamp(max(0.8*2.5, 0.9), 0, 1) = 1.
  assertNear(t.load, 1.0, 'load must stay computeTetherLoad value (untouched by detection)');
  assert.deepEqual(hostile.pos, { x: 0, z: 200 }, 'detection must not move entities');
  assert.deepEqual(hostile.vel, { x: 0, z: -60 }, 'detection must not steer entities');
  assertNear(h.state.player.masslineTelemetry.strain, 0.8, 'telemetry subtree must stay telemetry-owned');
}

// ---- harness (mirrors check-massline-snapcatch.mjs; adds masslineThreats to the step chain) ----

function createHarness() {
  const state = createGameState(0x5a);
  state.mode = 'flight';
  state.tick = 100;
  state.simTime = state.tick * DT;
  state.playerId = PLAYER_ID;
  state.entities.clear();

  const player = {
    id: PLAYER_ID, type: 'ship', alive: true, team: 'player',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, maxSpeed: 120, radius: 6,
  };
  const target = {
    id: TARGET_ID, type: 'asteroid', alive: true,
    pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 }, radius: 11, mass: 640,
  };
  state.entities.set(PLAYER_ID, player);
  state.entities.set(TARGET_ID, target);

  state.input.aimWorld = { x: target.pos.x, z: target.pos.z };
  state.input.aimAngle = 0;
  state.input.actions = { tetherFire: false, tetherCut: false, reelDelta: 0 };

  const attachments = makeFakeAttachments();
  const kernel = {
    attachments,
    catalog: { attachments: new Map([[TETHER_DEF_ID, { maxLength: 390, reelRate: 60, minLength: 10, breakTension: BREAK_TENSION }]]) },
  };
  const registry = {
    get(name) {
      if (name === 'actions' || name === 'combat') return { kernel };
      return null;
    },
  };
  const ctx = { state, bus: createBus(), helpers: {}, registry };

  const tether = Object.create(tetherGameplay);
  tether.init(ctx);
  const telemetry = Object.create(masslineTelemetry);
  telemetry.init(ctx);
  const threats = Object.create(masslineThreats);
  threats.init(ctx);

  return { state, tether, telemetry, threats, attachments, player, target };
}

// Hostility is resolved via scanner.isHostileToPlayer: opposing team + declared hostileTeams is a
// clean hostile read; passive AI + opposing team reads neutral (trader), never hostile.
function addHostile(harness, id, pos, vel) {
  const e = {
    id, type: 'ship', alive: true, team: 1,
    pos: { ...pos }, vel: { ...vel }, radius: 5, mass: 120,
    data: { ai: { hostileTeams: ['player'] } },
  };
  harness.state.entities.set(id, e);
  return e;
}

function addNeutral(harness, id, pos, vel) {
  const e = {
    id, type: 'ship', alive: true, team: 1,
    pos: { ...pos }, vel: { ...vel }, radius: 5, mass: 120,
    data: { ai: { passive: true } },
  };
  harness.state.entities.set(id, e);
  return e;
}

function addRock(harness, id, pos) {
  const e = {
    id, type: 'asteroid', alive: true,
    pos: { ...pos }, vel: { x: 0, z: 0 }, radius: 11, mass: 640,
  };
  harness.state.entities.set(id, e);
  return e;
}

function makeFakeAttachments() {
  let att = null;
  return {
    seed(props) { att = { id: ATT_ID, state: 'active', defId: TETHER_DEF_ID, targetId: TARGET_ID, restLength: 100, lastTension: 0, ...props }; return att; },
    create() { return { ok: true, attachment: this.seed({}) }; },
    cut(id, ownerId, reason) {
      if (att && att.id === id) { att.state = 'broken'; att.breakReason = reason; }
      return { ok: true };
    },
    get(id) { return att && att.id === id ? att : null; },
    reel(id, delta, min) {
      if (att && att.id === id) att.restLength = Math.max(min || 0, att.restLength + delta);
      return { ok: true, attachment: att };
    },
    listForEntity() { return []; },
  };
}

function primeActiveTether(harness, { restLength = 100, lastTension = 0, pastCapture = false } = {}) {
  const { state, tether, attachments } = harness;
  attachments.seed({ restLength, lastTension });
  tether._active = { attachmentId: ATT_ID, targetId: TARGET_ID, type: TETHER_DEF_ID };
  tether._ignoreReleaseCutUntilReelIdle = false;
  tether._pendingCut = null;
  tether._latchGraceUntil = 0;
  if (pastCapture) tether._phaseMirror = { slackS: 0, captureT: 999, captureActive: false, wasTaut: true };
  state.player.tether = {
    active: true, targetId: TARGET_ID, strain: 0, load: 0, restLength,
    phase: 'slack', attachmentId: ATT_ID,
  };
}

function relatchNewTarget(harness, altId, opts) {
  const { state, tether, attachments } = harness;
  state.entities.set(altId, {
    id: altId, type: 'asteroid', alive: true,
    pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 }, radius: 11, mass: 640,
  });
  attachments.seed({ restLength: opts.restLength, lastTension: opts.lastTension, targetId: altId });
  tether._active = { attachmentId: ATT_ID, targetId: altId, type: TETHER_DEF_ID };
  tether._ignoreReleaseCutUntilReelIdle = false;
  tether._pendingCut = null;
  tether._latchGraceUntil = 0;
  if (opts.pastCapture) tether._phaseMirror = { slackS: 0, captureT: 999, captureActive: false, wasTaut: true };
  state.input.aimWorld = { x: 100, z: 0 };
  state.player.tether = {
    active: true, targetId: altId, strain: 0, load: 0, restLength: opts.restLength,
    phase: 'slack', attachmentId: ATT_ID,
  };
}

function stepOnce(harness) {
  const { state, tether, telemetry, threats } = harness;
  state.tick += 1;
  state.simTime = state.tick * DT;
  tether.update(DT, state);
  telemetry.update(DT, state);
  threats.update(DT, state);
}

function stepTicks(harness, n) {
  for (let i = 0; i < n; i += 1) stepOnce(harness);
}

function captureThreatEvents(harness) {
  const events = [];
  if (harness.threats.bus && harness.threats.bus.on) {
    harness.threats.bus.on('massline:threat', (p) => events.push(p));
  }
  return events;
}

function assertNear(actual, expected, label, eps = 1e-6) {
  assert.ok(Math.abs(actual - expected) < eps, `${label}: expected ~${expected}; got ${actual}`);
}
