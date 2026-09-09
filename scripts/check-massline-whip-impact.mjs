// Massline rung 13 acceptance check: whip-impact detection.
//
// masslineImpacts is its own registered observer system running immediately after
// masslineThreats. It reads the settled tether mirror + entities and emits `tether:whipImpact`
// ({ targetId, victimId, relSpeed, massSpeed, mass, momentum, slung, severity, rating, tick,
// time }), mirroring the record at state.player.masslineImpacts (its OWN subtree — observer
// discipline). The whipped mass is the tether TARGET, latched or inside the 6 s post-release
// sling window — never the player.
//
// Contract (src/systems/masslineImpacts.js, WHIP_* constants):
//   - latched mass crosses into a body at speed      -> one impact, slung:false
//   - relative contact speed < 25                    -> no emit (not energetic)
//   - parked tow rammed by a mover                   -> no emit (mass world speed < 25;
//                                                       the mass must do the hitting)
//   - sustained contact                              -> once per victim per run, not per tick
//   - new latch                                      -> re-arms the per-victim throttle
//   - released moving mass hits within 6 s           -> one impact, slung:true (tether inactive)
//   - contact would land after the 6 s window        -> no emit; tracking ends at expiry
//   - released STATIC mass                           -> never tracked as a sling
//   - no tether ever                                 -> nothing emits, nothing tracked
//   - the player as victim                           -> never (reeling home is not a whip)
//   - observer-only                                  -> tether/telemetry/entities untouched
//
// Same harness shape as check-massline-threats.mjs: real tetherGameplay.update +
// masslineTelemetry.update + masslineThreats.update + masslineImpacts.update in registry order,
// mocking only the attachments service. Entities move only when the check integrates them
// (there is no physics here), which keeps every crossing deterministic.
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { SIM_DT } from '../src/core/sim.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { masslineTelemetry } from '../src/systems/masslineTelemetry.js';
import { masslineThreats } from '../src/systems/masslineThreats.js';
import { masslineImpacts } from '../src/systems/masslineImpacts.js';
import { PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';

// Harness chain order matches production UPDATE_ORDER (manifest-backed, not registry literals).
// masslineTelemetry/Threats/Impacts are contiguous; tetherGameplay precedes them with
// surrender/custody observers in between.
{
  const chain = ['masslineTelemetry', 'masslineThreats', 'masslineImpacts'];
  for (let i = 1; i < chain.length; i++) {
    const prev = PRODUCTION_UPDATE_ORDER.indexOf(chain[i - 1]);
    const next = PRODUCTION_UPDATE_ORDER.indexOf(chain[i]);
    assert.ok(prev >= 0 && next === prev + 1,
      `${chain[i]} must run immediately after ${chain[i - 1]} in production UPDATE_ORDER`);
  }
  const tetherIdx = PRODUCTION_UPDATE_ORDER.indexOf('tetherGameplay');
  const teleIdx = PRODUCTION_UPDATE_ORDER.indexOf('masslineTelemetry');
  const physicsIdx = PRODUCTION_UPDATE_ORDER.indexOf('physics');
  assert.ok(tetherIdx >= 0 && teleIdx > tetherIdx,
    'masslineTelemetry must run after tetherGameplay');
  assert.ok(physicsIdx >= 0 && physicsIdx < tetherIdx,
    'physics must settle before the massline observer chain');
}

const DT = SIM_DT;
const TARGET_ID = 5909;
const ALT_ID = 6909;
const PLAYER_ID = 7;
const ROCK_ID = 9100;
const ROCK_2_ID = 9101;
const ATT_ID = 'att_whip_1';
const TETHER_DEF_ID = 'tether_standard';
const BREAK_TENSION = 1000;
const TARGET_MASS = 640;

assertLatchedWhipFiresWithFullRecord();
assertSlowContactNeverFires();
assertParkedTowRammedNeverFires();
assertOncePerVictimAndRelatchRearms();
assertSlungWhipFires();
assertSlingWindowExpires();
assertStaticReleaseNeverSlings();
assertNoTetherEmitsNothing();
assertPlayerNeverVictim();
assertObserverOnly();

console.log('Massline whip-impact checks OK');

// Latched mass swings at 60 wu/s into a static rock: exactly one impact with the full record
// shape, mirrored in the system's own subtree, payload === mirror record.
function assertLatchedWhipFiresWithFullRecord() {
  const h = createHarness();
  h.target.vel = { x: 0, z: 60 };
  primeActiveTether(h, { restLength: 200, lastTension: 0.3 * BREAK_TENSION, pastCapture: true });
  const rock = addRock(h, ROCK_ID, { x: 100, z: 90 });   // combined R 22 -> contact near z=68

  const events = captureWhipEvents(h);
  stepTicksMoving(h, 80, [h.target]);

  assert.equal(events.length, 1, `latched whip must emit exactly once; got ${events.length}`);
  const p = events[0];
  assert.equal(p.targetId, TARGET_ID, 'targetId must be the whipped mass (the tether target)');
  assert.equal(p.victimId, ROCK_ID, 'victimId must be the body that was hit');
  assert.equal(p.slung, false, 'a latched whip must read slung:false');
  assert.ok(Math.abs(p.relSpeed - 60) < 1e-6, `relSpeed must be the contact speed; got ${p.relSpeed}`);
  assert.ok(Math.abs(p.massSpeed - 60) < 1e-6, `massSpeed must be the mass world speed; got ${p.massSpeed}`);
  assert.equal(p.mass, TARGET_MASS, 'record must carry the whipped mass\'s mass');
  assert.ok(Math.abs(p.momentum - TARGET_MASS * 60) < 1e-6, 'momentum must be mass * relSpeed');
  assert.equal(p.rating, 'solid', `60 wu/s sits in the solid band [55,95); got ${p.rating}`);
  assert.ok(p.severity > 0 && p.severity <= 1, `severity in (0,1]; got ${p.severity}`);
  assert.ok(Number.isFinite(p.tick) && Number.isFinite(p.time), 'record must be sim-clock stamped');

  const runtime = h.state.player.masslineImpacts;
  assert.ok(runtime && runtime.tracking, 'impacts subtree must be tracking during the latch');
  assert.equal(runtime.slung, false, 'mirror must read latched (not slung) while on the line');
  assert.equal(runtime.massId, TARGET_ID, 'mirror must name the tracked mass');
  assert.deepEqual(runtime.latest, p, 'emitted payload must equal the mirrored latest record');
  assert.ok(runtime.impacts.includes(p), 'mirrored impacts log must include the record');

  assert.equal(rock.pos.z, 90, 'the check only integrates the mass; the rock must not have moved');
}

// Mass and rock drift together overlapped (relSpeed 2 < 25): contact is not energetic — no emit.
function assertSlowContactNeverFires() {
  const h = createHarness();
  h.target.vel = { x: 0, z: 60 };
  primeActiveTether(h, { restLength: 200, lastTension: 0.3 * BREAK_TENSION, pastCapture: true });
  const rock = addRock(h, ROCK_ID, { x: 100, z: 15 });   // overlapped from the start (15 < 22)
  rock.vel = { x: 0, z: 58 };                            // relSpeed 2, both genuinely moving

  const events = captureWhipEvents(h);
  stepTicksMoving(h, 60, [h.target, rock]);
  assert.equal(events.length, 0, 'relative contact speed below 25 must not emit');
}

// A rock rams the PARKED tow at 60 wu/s: relSpeed qualifies but the mass is not moving — the mass
// must do the hitting, so nothing emits.
function assertParkedTowRammedNeverFires() {
  const h = createHarness();
  primeActiveTether(h, { restLength: 200, lastTension: 0.3 * BREAK_TENSION, pastCapture: true });
  const rock = addRock(h, ROCK_ID, { x: 100, z: 90 });
  rock.vel = { x: 0, z: -60 };

  const events = captureWhipEvents(h);
  stepTicksMoving(h, 100, [rock]);                       // rock crosses through the parked mass
  assert.equal(events.length, 0, 'a body ramming the parked tow is not the player\'s whip');
}

// Sustained qualifying contact fires once per victim per run; a new latch re-arms the throttle.
function assertOncePerVictimAndRelatchRearms() {
  const h = createHarness();
  h.target.vel = { x: 0, z: 60 };
  primeActiveTether(h, { restLength: 200, lastTension: 0.3 * BREAK_TENSION, pastCapture: true });
  addRock(h, ROCK_ID, { x: 100, z: 10 });                // overlapped, static; relSpeed 60

  const events = captureWhipEvents(h);
  stepTicks(h, 30);                                      // positions held: contact persists
  assert.equal(events.length, 1, `sustained contact must fire once, not per tick; got ${events.length}`);
  assert.equal(events[0].targetId, TARGET_ID);

  // New latch on a fresh mass overlapping the same rock: the per-victim throttle re-arms.
  h.state.entities.delete(TARGET_ID);
  relatchNewTarget(h, ALT_ID, { restLength: 200, lastTension: 0.3 * BREAK_TENSION, pastCapture: true });
  h.state.entities.get(ALT_ID).vel = { x: 0, z: 60 };
  stepTicks(h, 10);
  assert.equal(events.length, 2, 'a new latch must re-arm the per-victim throttle');
  assert.equal(events[1].targetId, ALT_ID, 'the re-armed impact must name the new mass');
  assert.equal(events[1].victimId, ROCK_ID, 'the re-armed impact may name the same victim');
}

// Cut the line while the mass flies at a distant rock: the released mass stays "the player's
// whip" through the sling window and the impact lands with slung:true while the tether is dead.
function assertSlungWhipFires() {
  const h = createHarness();
  h.target.vel = { x: 0, z: 60 };
  primeActiveTether(h, { restLength: 200, lastTension: 0.3 * BREAK_TENSION, pastCapture: true });
  addRock(h, ROCK_ID, { x: 100, z: 150 });               // contact near z=128, ~2 s after cut

  const events = captureWhipEvents(h);
  stepTicksMoving(h, 10, [h.target]);                    // brief latched flight, still far away
  assert.equal(events.length, 0, 'no contact yet while latched');

  cutTether(h);
  stepTicksMoving(h, 5, [h.target]);
  const runtime = h.state.player.masslineImpacts;
  assert.ok(!h.state.player.tether.active, 'tether must be inactive after the cut');
  assert.ok(runtime.tracking && runtime.slung, 'released moving mass must be sling-tracked');
  assert.equal(runtime.massId, TARGET_ID, 'sling tracker must name the released mass');

  stepTicksMoving(h, 150, [h.target]);                   // coast into the rock inside the window
  assert.equal(events.length, 1, `slung whip must emit exactly once; got ${events.length}`);
  assert.equal(events[0].slung, true, 'a post-release impact must read slung:true');
  assert.equal(events[0].targetId, TARGET_ID);
  assert.equal(events[0].victimId, ROCK_ID);

  stepTicksMoving(h, 30, [h.target]);
  assert.equal(events.length, 1, 'the sling throttles per victim too');
  assert.deepEqual(runtime.latest, events[0], 'the record must persist after the run for late readers');
}

// Same sling but the rock sits beyond the window's reach (contact ~7.6 s > 6 s): the ballistic
// window closes first — no emit, and tracking ends at expiry.
function assertSlingWindowExpires() {
  const h = createHarness();
  h.target.vel = { x: 0, z: 30 };
  primeActiveTether(h, { restLength: 200, lastTension: 0.3 * BREAK_TENSION, pastCapture: true });
  addRock(h, ROCK_ID, { x: 100, z: 250 });               // contact would land near z=228

  const events = captureWhipEvents(h);
  stepTicksMoving(h, 1, [h.target]);
  cutTether(h);
  stepTicksMoving(h, 510, [h.target]);                   // 8.5 s — past window AND past the rock

  assert.equal(events.length, 0, 'contact after the sling window must not emit');
  const runtime = h.state.player.masslineImpacts;
  assert.ok(!runtime.tracking, 'sling tracking must end at window expiry');
  assert.equal(runtime.massId, null, 'no tracked mass after expiry');
}

// Releasing a STATIC mass is a drop, not a throw: no sling tracking, and a rock crossing through
// the dropped mass afterwards emits nothing.
function assertStaticReleaseNeverSlings() {
  const h = createHarness();
  primeActiveTether(h, { restLength: 200, lastTension: 0.3 * BREAK_TENSION, pastCapture: true });
  const rock = addRock(h, ROCK_ID, { x: 100, z: 90 });
  rock.vel = { x: 0, z: -60 };

  const events = captureWhipEvents(h);
  stepTicks(h, 5);
  cutTether(h);
  const runtime = h.state.player.masslineImpacts;
  stepTicksMoving(h, 100, [rock]);

  assert.equal(events.length, 0, 'a dropped static mass is never the player\'s whip');
  assert.ok(!runtime.tracking, 'a static release must not arm the sling tracker');
}

// No tether at any point: bodies collide around the player, but with no whip there is nothing to
// read — zero events, nothing tracked, no stale records.
function assertNoTetherEmitsNothing() {
  const h = createHarness();
  const rock = addRock(h, ROCK_ID, { x: 100, z: 40 });
  rock.vel = { x: 0, z: -60 };
  addRock(h, ROCK_2_ID, { x: 100, z: -40 });

  const events = captureWhipEvents(h);
  stepTicksMoving(h, 120, [rock]);                       // rock crosses through rock 2

  assert.equal(events.length, 0, 'no tether must mean no whip-impact reads');
  const runtime = h.state.player.masslineImpacts;
  assert.ok(runtime && !runtime.tracking, 'nothing must be tracked without a tether');
  assert.equal(runtime.impacts.length, 0, 'no stale impact records');
  assert.equal(runtime.latest, null, 'no stale latest record');
}

// The mass reeled home crosses into the player's own hull: the player is never a victim
// (that contact is the reel — and self-collision danger is masslineThreats' domain).
function assertPlayerNeverVictim() {
  const h = createHarness();
  h.target.vel = { x: -60, z: 0 };                       // straight at the player at the origin
  primeActiveTether(h, { restLength: 200, lastTension: 0.3 * BREAK_TENSION, pastCapture: true });

  const events = captureWhipEvents(h);
  stepTicksMoving(h, 120, [h.target]);                   // crosses through the player position
  assert.equal(events.length, 0, 'the player must never be a whip-impact victim');
}

// Observer-only: across a full detection pass, tether strain/load stay tetherGameplay's values,
// the telemetry subtree stays telemetry-owned, and bodies the check never integrates are
// untouched (positions/velocities exactly as seeded).
function assertObserverOnly() {
  const h = createHarness();
  h.target.vel = { x: 0, z: 60 };
  primeActiveTether(h, { restLength: 200, lastTension: 0.8 * BREAK_TENSION, pastCapture: true });
  const rock = addRock(h, ROCK_ID, { x: 100, z: 90 });
  const events = captureWhipEvents(h);
  stepTicksMoving(h, 80, [h.target]);

  assert.equal(events.length, 1, 'sanity: the whip landed during the observer-only pass');
  const t = h.state.player.tether;
  assertNear(t.strain, 0.8, 'strain must remain lastTension/breakTension — detection must not warp it');
  assertNear(t.load, 1.0, 'load must stay computeTetherLoad value (untouched by detection)');
  assert.deepEqual(rock.pos, { x: 100, z: 90 }, 'detection must not move entities');
  assert.deepEqual(rock.vel, { x: 0, z: 0 }, 'detection must not steer entities');
  assertNear(h.state.player.masslineTelemetry.strain, 0.8, 'telemetry subtree must stay telemetry-owned');
  assert.equal(h.target.vel.z, 60, 'detection must not steer the whipped mass');
}

// ---- harness (mirrors check-massline-threats.mjs; adds masslineImpacts to the step chain) ----

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
    pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 }, radius: 11, mass: TARGET_MASS,
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
  const impacts = Object.create(masslineImpacts);
  impacts.init(ctx);

  return { state, tether, telemetry, threats, impacts, attachments, player, target };
}

function addRock(harness, id, pos) {
  const e = {
    id, type: 'asteroid', alive: true,
    pos: { ...pos }, vel: { x: 0, z: 0 }, radius: 11, mass: TARGET_MASS,
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
    pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 }, radius: 11, mass: TARGET_MASS,
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

// Release emulation: drop tetherGameplay's live handle + break the fake attachment. Next update
// mirrors inactive, which is the transition masslineImpacts self-clocks the sling from.
function cutTether(harness) {
  harness.tether._active = null;
  harness.tether._pendingCut = null;
  harness.attachments.cut(ATT_ID, PLAYER_ID, 'tether_cut');
}

function stepOnce(harness) {
  const { state, tether, telemetry, threats, impacts } = harness;
  state.tick += 1;
  state.simTime = state.tick * DT;
  tether.update(DT, state);
  telemetry.update(DT, state);
  threats.update(DT, state);
  impacts.update(DT, state);
}

function stepTicks(harness, n) {
  for (let i = 0; i < n; i += 1) stepOnce(harness);
}

// There is no physics in this harness: bodies the scenario needs in motion are integrated here,
// BEFORE the system chain (mirroring physics running earlier in UPDATE_ORDER).
function stepTicksMoving(harness, n, movers) {
  for (let i = 0; i < n; i += 1) {
    for (const m of movers) {
      m.pos.x += m.vel.x * DT;
      m.pos.z += m.vel.z * DT;
    }
    stepOnce(harness);
  }
}

function captureWhipEvents(harness) {
  const events = [];
  if (harness.impacts.bus && harness.impacts.bus.on) {
    harness.impacts.bus.on('tether:whipImpact', (p) => events.push(p));
  }
  return events;
}

function assertNear(actual, expected, label, eps = 1e-6) {
  assert.ok(Math.abs(actual - expected) < eps, `${label}: expected ~${expected}; got ${actual}`);
}
