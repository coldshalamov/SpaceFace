// Massline rung 06 acceptance check: reel-pump detection.
//
// Reel-pump (the "pump a loaded line" trick read): a pump stroke is a sustained reel-in
// (tether.reelStrength rising to >= REEL_PUMP_ARM=0.55) while the line is under REAL tension
// (phase loaded/overload, not slack/capture-only) and shortening. reelRisk = strain at the pump
// moment (high >=0.75, medium >=0.45, else low) — pumping an overloaded line risks a snap.
// tether:reelPump fires at most once per stroke; the stroke debounces (won't re-arm until
// reelStrength decays below REEL_PUMP_RESET=0.15) so a continuous held reel is ONE pump.
// Mirrored at telemetry.reelPump.
//
// Contract (src/systems/masslineTelemetry.js, REEL_PUMP_* constants):
//   - loaded reel stroke             -> emits tether:reelPump + sets telemetry.reelPump (once)
//   - slack reel (no load)           -> no emit (nothing to pump against)
//   - sub-threshold reel (<0.55)     -> no emit (held-but-blocked caps reelStrength at 0.42)
//   - debounce: held continuous reel -> exactly ONE event, not one per tick
//   - re-arm after release+re-hold   -> a second distinct stroke fires a second event
//   - latch reset                    -> re-arms (idle), prior pump cleared
//   - observer-only                  -> tether.strain/load/reelStrength untouched by detection
//
// Same harness shape as check-massline-load.mjs/snapcatch.mjs: real tetherGameplay.update +
// masslineTelemetry.update in registry order, mocking only the attachments service.
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { SIM_DT } from '../src/core/sim.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { masslineTelemetry } from '../src/systems/masslineTelemetry.js';

const DT = SIM_DT;
const TARGET_ID = 5606;
const PLAYER_ID = 7;
const ATT_ID = 'att_pump_1';
const TETHER_DEF_ID = 'tether_standard';
const BREAK_TENSION = 1000;
// reelStrength approaches its target exponentially (rate ~9 rising). ~10 ticks comfortably clears
// the 0.55 arm threshold from a cold start; ~15 guarantees it's near 1.0.
const REEL_WARMUP_TICKS = 15;

assertLoadedReelPumpFires();
assertSlackReelNeverPumps();
assertSubThresholdReelNeverPumps();
assertDebounceOneEventPerStroke();
assertReArmFiresSecondStroke();
assertLatchResetClearsAndRearms();
assertObserverOnly();
assertRiskTiers();

console.log('Massline reel-pump checks OK');

// Positive: hold reel on a loaded line. reelStrength rises past 0.55 while phase=loaded -> fires once.
function assertLoadedReelPumpFires() {
  const h = createHarness();
  // Loaded geometry: target at 100, restLength 90 -> taut; pastCapture skips the capture window so
  // phase reads loaded straight away. lastTension 0.3*break -> strain 0.3 (loaded, not overload).
  primeActiveTether(h, { restLength: 90, lastTension: 0.3 * BREAK_TENSION, pastCapture: true });

  const events = capturePumpEvents(h);
  startReeling(h);                           // reelDelta < 0 each tick
  stepTicks(h, REEL_WARMUP_TICKS);

  const rp = h.state.player.masslineTelemetry.reelPump;
  assert.ok(rp, 'loaded reel-pump must set telemetry.reelPump');
  assert.equal(events.length, 1, 'loaded reel-pump must emit exactly one tether:reelPump');
  const p = events[0];
  assert.equal(p.targetId, TARGET_ID, 'payload targetId must match');
  assert.ok(p.reelStrength >= 0.55, `arm reelStrength must be >=0.55; got ${p.reelStrength}`);
  assert.equal(p.risk, 'low', `strain 0.3 must rate risk 'low'; got ${p.risk}`);
  assert.deepEqual(p, rp, 'emitted payload must equal telemetry.reelPump');
}

// Negative: reeling on a SLACK line (distance < restLength). No load to pump -> no emit.
function assertSlackReelNeverPumps() {
  const h = createHarness();
  // Slack geometry: restLength 200 > distance 100. Even with reel held, phase stays slack.
  primeActiveTether(h, { restLength: 200, lastTension: 0, pastCapture: true });

  const events = capturePumpEvents(h);
  startReeling(h);
  stepTicks(h, REEL_WARMUP_TICKS);

  assert.equal(events.length, 0, 'slack reel must not emit');
  assert.equal(h.state.player.masslineTelemetry.reelPump, null, 'slack reel must not set reelPump');
}

// Negative: reel held but BLOCKED. _updateReelStrength caps at 0.42 when reelHeld but not reeled
// (e.g. at minLength). 0.42 < 0.55 arm threshold -> no pump.
function assertSubThresholdReelNeverPumps() {
  const h = createHarness();
  // restLength already at minLength (10): reel() can't shrink it further -> reeled=false -> target 0.42.
  primeActiveTether(h, { restLength: 10, lastTension: 0.3 * BREAK_TENSION, pastCapture: true });

  const events = capturePumpEvents(h);
  startReeling(h);
  stepTicks(h, REEL_WARMUP_TICKS);

  assert.ok(h.state.player.tether.reelStrength < 0.55,
    `blocked reel must cap reelStrength <0.55; got ${h.state.player.tether.reelStrength}`);
  assert.equal(events.length, 0, 'sub-threshold reel must not emit');
}

// Debounce: a continuous held reel fires exactly ONE event across many ticks, not one per tick.
function assertDebounceOneEventPerStroke() {
  const h = createHarness();
  primeActiveTether(h, { restLength: 90, lastTension: 0.3 * BREAK_TENSION, pastCapture: true });
  const events = capturePumpEvents(h);
  startReeling(h);
  stepTicks(h, REEL_WARMUP_TICKS * 4);        // 60 ticks of continuous reel
  assert.equal(events.length, 1, 'continuous held reel must fire exactly once (debounce)');
}

// Re-arm: release the reel (reelStrength decays below 0.15 -> idle), then re-hold -> second stroke.
function assertReArmFiresSecondStroke() {
  const h = createHarness();
  primeActiveTether(h, { restLength: 90, lastTension: 0.3 * BREAK_TENSION, pastCapture: true });
  const events = capturePumpEvents(h);

  // First stroke.
  startReeling(h);
  stepTicks(h, REEL_WARMUP_TICKS);
  assert.equal(events.length, 1, 'first stroke must fire');

  // Release: reelDelta 0 -> reelStrength decays toward 0. Decay rate is 5, so it takes ~25 ticks
  // to clear the 0.15 reset floor from ~1.0 (each tick multiplies residual by ~0.92).
  stopReeling(h);
  stepTicks(h, 28);
  assert.ok(h.state.player.tether.reelStrength < 0.15,
    `released reel must decay <0.15; got ${h.state.player.tether.reelStrength}`);

  // Second stroke: re-hold. restLength has shrunk from stroke 1, so re-prime geometry to keep it taut.
  h.attachments.seed({ restLength: 90, lastTension: 0.3 * BREAK_TENSION });
  startReeling(h);
  stepTicks(h, REEL_WARMUP_TICKS);
  assert.equal(events.length, 2, 're-armed second stroke must fire a second event');
}

// Latch reset: a new targetId re-arms the pump state. If the reel is released first (reelStrength
// decayed to idle), the new latch starts with reelPump cleared; a fresh reel on the new target fires
// a new pump. This is the "once per latch" guarantee across latches.
function assertLatchResetClearsAndRearms() {
  const h = createHarness();
  primeActiveTether(h, { restLength: 90, lastTension: 0.3 * BREAK_TENSION, pastCapture: true });
  const events = capturePumpEvents(h);
  startReeling(h);
  stepTicks(h, REEL_WARMUP_TICKS);
  assert.equal(events.length, 1, 'first latch pump fires');
  assert.equal(events[0].targetId, TARGET_ID, 'first pump targets first target');
  assert.ok(h.state.player.masslineTelemetry.reelPump, 'first latch sets reelPump');

  // Release the reel and let reelStrength decay to idle BEFORE relatching, so the new latch starts clean.
  stopReeling(h);
  stepTicks(h, 28);
  assert.ok(h.state.player.tether.reelStrength < 0.15, 'reel must decay to idle before relatch');

  // Latch onto a DIFFERENT target (new targetId is what telemetry uses to detect a new latch).
  const ALT_ID = 6606;
  relatchNewTarget(h, ALT_ID, { restLength: 90, lastTension: 0.3 * BREAK_TENSION, pastCapture: true });
  assert.equal(h.state.player.masslineTelemetry.reelPump, null, 'new latch must clear reelPump');

  // New latch can pump again, on the new target.
  startReeling(h);
  stepTicks(h, REEL_WARMUP_TICKS);
  assert.equal(events.length, 2, 'new latch pump must fire');
  assert.equal(events[1].targetId, ALT_ID, 'second pump targets the new target');
}

// Observer-only: across a full pump, tether.strain/load/reelStrength are owned by tetherGameplay.
function assertObserverOnly() {
  const h = createHarness();
  primeActiveTether(h, { restLength: 90, lastTension: 0.3 * BREAK_TENSION, pastCapture: true });
  capturePumpEvents(h);
  startReeling(h);
  stepTicks(h, REEL_WARMUP_TICKS);

  const t = h.state.player.tether;
  // strain must still equal lastTension/breakTension exactly (detection must not warp it).
  assertNear(t.strain, 0.3, 'strain must remain lastTension/breakTension — detection must not warp it');
  // load is computeTetherLoad('loaded', 0.3) = max(0.3*2.5, 0.55) = 0.75; untouched by detection.
  assertNear(t.load, 0.75, 'load must stay computeTetherLoad value (untouched by detection)');
}

// Risk tiers: low (strain<0.45), medium (0.45..0.75), high (>=0.75=overload).
function assertRiskTiers() {
  // medium
  let h = createHarness();
  primeActiveTether(h, { restLength: 90, lastTension: 0.5 * BREAK_TENSION, pastCapture: true });
  let ev = capturePumpEvents(h);
  startReeling(h); stepTicks(h, REEL_WARMUP_TICKS);
  assert.equal(ev[0].risk, 'medium', `strain 0.5 must rate 'medium'; got ${ev[0] && ev[0].risk}`);

  // high (overload: strain 0.8 >= 0.75)
  h = createHarness();
  primeActiveTether(h, { restLength: 90, lastTension: 0.8 * BREAK_TENSION, pastCapture: true });
  ev = capturePumpEvents(h);
  startReeling(h); stepTicks(h, REEL_WARMUP_TICKS);
  assert.equal(ev[0].risk, 'high', `strain 0.8 must rate 'high'; got ${ev[0] && ev[0].risk}`);
  assert.equal(h.state.player.tether.phase, 'overload', 'strain 0.8 must be overload phase');
}

// ---- harness (mirrors check-massline-snapcatch.mjs) ----

function createHarness() {
  const state = createGameState(0x5a);
  state.mode = 'flight';
  state.tick = 100;
  state.simTime = state.tick * DT;
  state.playerId = PLAYER_ID;
  state.entities.clear();

  const player = {
    id: PLAYER_ID, type: 'ship', alive: true, team: 'player',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, maxSpeed: 120,
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

  return { state, tether, telemetry, attachments, target };
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
  // Place the alt target in the world and re-prime the tether against it.
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
  // First step lets telemetry observe the targetId change -> latch-reset fires -> _pump re-armed,
  // reelPump cleared. Skip reeling this step (reelDelta still 0 from prior stopReeling).
  stepOnce(harness);
}

function startReeling(harness) { harness.state.input.actions.reelDelta = -60; }
function stopReeling(harness) { harness.state.input.actions.reelDelta = 0; }

function stepOnce(harness) {
  const { state, tether, telemetry } = harness;
  state.tick += 1;
  state.simTime = state.tick * DT;
  tether.update(DT, state);
  telemetry.update(DT, state);
}

function stepTicks(harness, n) {
  for (let i = 0; i < n; i += 1) stepOnce(harness);
}

function capturePumpEvents(harness) {
  const events = [];
  if (harness.telemetry.bus && harness.telemetry.bus.on) {
    harness.telemetry.bus.on('tether:reelPump', (p) => events.push(p));
  }
  return events;
}

function assertNear(actual, expected, label, eps = 1e-6) {
  assert.ok(Math.abs(actual - expected) < eps, `${label}: expected ~${expected}; got ${actual}`);
}
