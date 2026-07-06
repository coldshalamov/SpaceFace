// Massline rung 05 acceptance check: snap-catch detection.
//
// Snap-catch (the "snag something passing by" trick read): a latch where the line goes taut FAST
// (within SNAP_CATCH_WINDOW_S=1.0s of latch) on a genuinely moving catch (relSpeed >=
// SNAP_CATCH_MIN_SPEED=25 at the taut moment) and the capture LANDS (phase reaches loaded/overload
// without stalling back to slack). Quality = |tangentialSpeed at completion| / relSpeed at snap:
// >=0.85 clean, >=0.55 good, else rough. Emitted ONCE per latch as `tether:snapCatch` and mirrored
// at telemetry.snapCatch.
//
// Contract (src/systems/masslineTelemetry.js, SNAP_CATCH_* constants):
//   - fast-taut + moving + lands  -> emits tether:snapCatch + sets telemetry.snapCatch (once)
//   - window expired (slow reel)  -> no emit, disqualified
//   - stalled to slack            -> no emit, disqualified
//   - static catch (relSpeed<25)  -> no emit (never arms a candidate)
//   - once per latch              -> a second taut->land on the same latch emits nothing
//   - observer-only               -> tether.strain and tether.load are never mutated by detection
//
// Same harness shape as check-massline-load.mjs: real tetherGameplay.update + masslineTelemetry.update
// in registry order, mocking only the attachments service. Scenarios drive REAL phase transitions
// (taut via geometry, capture->loaded via the captureS window) across multiple ticks.
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { SIM_DT } from '../src/core/sim.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { masslineTelemetry } from '../src/systems/masslineTelemetry.js';

const DT = SIM_DT;
const TARGET_ID = 5305;
const PLAYER_ID = 7;
const ATT_ID = 'att_snap_1';
const TETHER_DEF_ID = 'tether_standard';
const BREAK_TENSION = 1000;
// captureS default is 0.35s; at 60Hz that is ~21 ticks. Run a few past to guarantee loaded.
const CAPTURE_TICKS = 25;

assertCleanSnapCatch();
assertStaticCatchNeverArms();
assertWindowExpiredDisqualifies();
assertStalledToSlackDisqualifies();
assertOncePerLatch();
assertObserverOnly();

console.log('Massline snap-catch checks OK');

// A perpendicular-moving catch at 30 wu/s: line unit ~(1,0), tangentialSpeed ~ 30, so quality ~1.0.
// Goes taut on the latch tick (distance 100 > restLength 90), capture for ~0.35s, then lands loaded.
function assertCleanSnapCatch() {
  const h = createHarness();
  // Target moving perpendicular at 30 wu/s (relSpeed = 30 >= SNAP_CATCH_MIN_SPEED=25).
  h.target.vel = { x: 0, z: 30 };
  primeActiveTether(h, { restLength: 90, lastTension: 0.3 * BREAK_TENSION });

  const events = captureSnapEvents(h);
  stepTicks(h, CAPTURE_TICKS);

  const sc = h.state.player.masslineTelemetry.snapCatch;
  assert.ok(sc, 'clean snap-catch must set telemetry.snapCatch');
  assert.equal(events.length, 1, 'clean snap-catch must emit exactly one tether:snapCatch');
  const payload = events[0];
  assert.equal(payload.targetId, TARGET_ID, 'payload targetId must match');
  assert.ok(payload.snapRelSpeed >= 25, `snap relSpeed must be >=25; got ${payload.snapRelSpeed}`);
  assert.ok(payload.quality >= 0.85, `clean quality must be >=0.85; got ${payload.quality}`);
  assert.equal(payload.rating, 'clean', `clean rating; got ${payload.rating}`);
  // Payload must exactly match the mirrored telemetry record (single source of truth).
  assert.deepEqual(payload, sc, 'emitted payload must equal telemetry.snapCatch');
}

// Taut on a slow catch (relSpeed 10 < 25): candidate never arms, eventually window-disqualified.
function assertStaticCatchNeverArms() {
  const h = createHarness();
  h.target.vel = { x: 0, z: 10 };           // relSpeed 10 < 25
  primeActiveTether(h, { restLength: 90, lastTension: 0.3 * BREAK_TENSION });

  const events = captureSnapEvents(h);
  // Run well past SNAP_CATCH_WINDOW_S (1.0s = 60 ticks) so the expiry branch fires.
  stepTicks(h, 70);

  assert.equal(events.length, 0, 'static catch must not emit');
  assert.equal(h.state.player.masslineTelemetry.snapCatch, null, 'static catch must not set snapCatch');
}

// Line stays slack past the 1.0s window, then goes taut: must be disqualified (slow reel, not snag).
function assertWindowExpiredDisqualifies() {
  const h = createHarness();
  h.target.vel = { x: 0, z: 30 };
  // restLength > distance -> slack geometry (target at 100, restLength 200).
  primeActiveTether(h, { restLength: 200, lastTension: 0 });

  const events = captureSnapEvents(h);
  // 70 ticks of slack: simTime advances past 1.0s window while never going taut.
  stepTicks(h, 70);

  assert.equal(events.length, 0, 'window-expired latch must not emit');
  assert.equal(h.state.player.masslineTelemetry.snapCatch, null, 'window-expired must not set snapCatch');
}

// Goes taut fast + moving (candidate armed), then geometry returns to slack before landing:
// must disqualify (stalled, not caught).
function assertStalledToSlackDisqualifies() {
  const h = createHarness();
  h.target.vel = { x: 0, z: 30 };
  primeActiveTether(h, { restLength: 90, lastTension: 0.3 * BREAK_TENSION });

  const events = captureSnapEvents(h);
  // Tick 0 (latch): taut, candidate armed.
  stepOnce(h);
  // Now force slack: grow restLength beyond distance so the phase machine reports slack.
  h.attachments.seed({ restLength: 200, lastTension: 0 });
  stepTicks(h, 5);

  assert.equal(events.length, 0, 'stalled-to-slack must not emit');
  assert.equal(h.state.player.masslineTelemetry.snapCatch, null, 'stalled-to-slack must not set snapCatch');
}

// After a snap-catch completes, a second taut->land on the SAME latch must not emit again.
function assertOncePerLatch() {
  const h = createHarness();
  h.target.vel = { x: 0, z: 30 };
  primeActiveTether(h, { restLength: 90, lastTension: 0.3 * BREAK_TENSION });

  const events = captureSnapEvents(h);
  stepTicks(h, CAPTURE_TICKS);               // first snap-catch lands
  assert.equal(events.length, 1, 'first snap-catch must emit once');
  const first = h.state.player.masslineTelemetry.snapCatch;

  // Keep same latch, keep ticking: no second emission even though phase stays loaded.
  stepTicks(h, 30);
  assert.equal(events.length, 1, 'same-latch second window must not re-emit');
  assert.deepEqual(h.state.player.masslineTelemetry.snapCatch, first, 'snapCatch record must be stable');
}

// Observer-only: across a full clean snap-catch, tether.strain/load are owned by tetherGameplay,
// not warped by masslineTelemetry. Strain must equal lastTension/breakTension exactly.
function assertObserverOnly() {
  const h = createHarness();
  h.target.vel = { x: 0, z: 30 };
  primeActiveTether(h, { restLength: 90, lastTension: 0.3 * BREAK_TENSION });
  captureSnapEvents(h);
  stepTicks(h, CAPTURE_TICKS);

  const t = h.state.player.tether;
  assertNear(t.strain, 0.3, 'strain must remain lastTension/breakTension — detection must not warp it');
  assert.ok(t.load > 0, 'load must be set by tetherGameplay (positive)');
  // load is computeTetherLoad(phase, strain): max(0.3*2.5, 0.55) = 0.75 for loaded.
  assertNear(t.load, 0.75, 'loaded load must be strain*2.5=0.75 (untouched by detection)');
}

// ---- harness (mirrors check-massline-load.mjs) ----

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

function primeActiveTether(harness, { restLength = 100, lastTension = 0 } = {}) {
  const { state, tether, attachments } = harness;
  attachments.seed({ restLength, lastTension });
  tether._active = { attachmentId: ATT_ID, targetId: TARGET_ID, type: TETHER_DEF_ID };
  tether._ignoreReleaseCutUntilReelIdle = false;
  tether._pendingCut = null;
  tether._latchGraceUntil = 0;
  state.player.tether = {
    active: true, targetId: TARGET_ID, strain: 0, load: 0, restLength,
    phase: 'slack', attachmentId: ATT_ID,
  };
}

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

function captureSnapEvents(harness) {
  const events = [];
  harness.state.bus && harness.state.bus.on
    ? harness.state.bus.on('tether:snapCatch', (p) => events.push(p))
    : null;
  // The harness ctx.bus is separate from state; subscribe on the telemetry system's bus instead.
  if (harness.telemetry.bus && harness.telemetry.bus.on) {
    harness.telemetry.bus.on('tether:snapCatch', (p) => events.push(p));
  }
  return events;
}

function assertNear(actual, expected, label, eps = 1e-6) {
  assert.ok(Math.abs(actual - expected) < eps, `${label}: expected ~${expected}; got ${actual}`);
}
