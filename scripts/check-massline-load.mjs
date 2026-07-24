// Massline rung 04 acceptance check: state.player.tether.load — the 0..1 PRESENTATION signal —
// exists, obeys the phase floors, and never disturbs state.player.tether.strain (the physical
// break ratio).
//
// Contract (tetherGameplay.computeTetherLoad):
//   load = clamp(max(strain * 2.5, baseByPhase[phase]), 0, 1)
//   baseByPhase = { slack: 0, capture: 0.35, loaded: 0.55, overload: 0.9 }
// Required behaviors: inactive -> 0 · slack ~ 0 · capture >= 0.25 under tension ·
// loaded >= 0.5 even at low strain · overload >= 0.9 · strain untouched.
//
// Two layers, same shape as check-massline-release-rating.mjs:
//   1. Formula unit tests against the exported computeTetherLoad() — deterministic, no harness.
//   2. Integration through the REAL tetherGameplay.update + masslineTelemetry.update, driving
//      phase/strain via a mock attachments service, asserting the mirrored tether.load AND that
//      strain still equals lastTension/breakTension exactly.
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { SIM_DT } from '../src/core/sim.js';
import { tetherGameplay, computeTetherLoad } from '../src/systems/tetherGameplay.js';
import { masslineTelemetry } from '../src/systems/masslineTelemetry.js';
import { PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';

// Harness order matches production: tetherGameplay then masslineTelemetry
// (surrenderRecovery + custodyConsequences may sit between them).
{
  const tetherIdx = PRODUCTION_UPDATE_ORDER.indexOf('tetherGameplay');
  const teleIdx = PRODUCTION_UPDATE_ORDER.indexOf('masslineTelemetry');
  assert.ok(tetherIdx >= 0 && teleIdx > tetherIdx,
    'masslineTelemetry must run after tetherGameplay in production UPDATE_ORDER');
}

const DT = SIM_DT;
const TARGET_ID = 4242;
const PLAYER_ID = 7;
const ATT_ID = 'att_load_1';
const TETHER_DEF_ID = 'tether_standard';
const BREAK_TENSION = 1000;

// --- formula unit tests ---
assertFormulaFloors();

// --- integration tests against the real systems ---
assertInactiveLoadIsZero();
assertSlackLoadIsNearZero();
assertCaptureLoadUnderTension();
assertLoadedLowStrainLoad();
assertOverloadLoad();

console.log('Massline load checks OK');

function assertFormulaFloors() {
  assert.equal(computeTetherLoad('slack', 0), 0, 'slack + no strain must be exactly 0');
  assert.ok(computeTetherLoad('slack', 0.02) < 0.1,
    'slack + trace strain must stay near 0');
  assert.ok(computeTetherLoad('capture', 0) >= 0.25,
    `capture floor must be >= 0.25; got ${computeTetherLoad('capture', 0)}`);
  assert.ok(computeTetherLoad('loaded', 0.1) >= 0.5,
    `loaded + low strain must be >= 0.5; got ${computeTetherLoad('loaded', 0.1)}`);
  assert.ok(computeTetherLoad('overload', 0) >= 0.9,
    `overload floor must be >= 0.9; got ${computeTetherLoad('overload', 0)}`);
  // Strain dominates the floor once real tension arrives: 0.3 * 2.5 = 0.75 > 0.55.
  assertNear(computeTetherLoad('loaded', 0.3), 0.75, 'strain*2.5 should overtake the loaded floor');
  assert.equal(computeTetherLoad('overload', 2), 1, 'load must clamp to 1');
  assert.equal(computeTetherLoad('bogus_phase', NaN), 0, 'garbage inputs must degrade to 0');
}

// No tether at all -> tether.load 0 and telemetry.load 0.
function assertInactiveLoadIsZero() {
  const h = createHarness();
  stepOnce(h);
  const t = h.state.player.tether;
  assert.equal(t.active, false, 'harness starts with no tether');
  assert.equal(t.load, 0, `inactive tether.load must be 0; got ${t.load}`);
  assert.equal(h.state.player.masslineTelemetry.load, 0, 'inactive telemetry.load must be 0');
}

// Active but slack (distance < restLength, zero tension) -> load ~ 0, strain untouched at 0.
function assertSlackLoadIsNearZero() {
  const h = createHarness();
  primeActiveTether(h, { restLength: 150, lastTension: 0 });   // target at 100 -> real slack
  stepOnce(h);
  const t = h.state.player.tether;
  assert.equal(t.active, true, 'tether should be live');
  assert.equal(t.phase, 'slack', `slack geometry must phase slack; got ${t.phase}`);
  assert.ok(t.load <= 0.01, `slack load must be ~0; got ${t.load}`);
  assert.equal(t.strain, 0, `slack strain must remain 0; got ${t.strain}`);
}

// First taut tick enters capture -> load >= 0.25 even before strain builds.
function assertCaptureLoadUnderTension() {
  const h = createHarness();
  primeActiveTether(h, { restLength: 90, lastTension: 0.05 * BREAK_TENSION });  // taut: 100 > 90
  stepOnce(h);
  const t = h.state.player.tether;
  assert.equal(t.phase, 'capture', `first taut tick must phase capture; got ${t.phase}`);
  assert.ok(t.load >= 0.25, `capture under tension must be >= 0.25; got ${t.load}`);
  assertNear(t.strain, 0.05, 'capture strain must remain lastTension/breakTension');
}

// Loaded phase at LOW strain -> load >= 0.5, and strain stays exactly the physical ratio.
function assertLoadedLowStrainLoad() {
  const h = createHarness();
  primeActiveTether(h, { restLength: 90, lastTension: 0.1 * BREAK_TENSION, pastCapture: true });
  stepOnce(h);
  const t = h.state.player.tether;
  assert.equal(t.phase, 'loaded', `taut past capture must phase loaded; got ${t.phase}`);
  assert.ok(t.load >= 0.5, `loaded + low strain load must be >= 0.5; got ${t.load}`);
  assertNear(t.strain, 0.1, 'loaded strain must remain lastTension/breakTension — load must not warp it');
  const telemetry = h.state.player.masslineTelemetry;
  assertNear(telemetry.strain, 0.1, 'telemetry.strain must relay the untouched physical ratio');
  assertNear(telemetry.load, t.load, 'telemetry.load must relay tether.load');
}

// Overload phase (strain >= 0.75) -> load >= 0.9, strain still the raw ratio.
function assertOverloadLoad() {
  const h = createHarness();
  primeActiveTether(h, { restLength: 90, lastTension: 0.8 * BREAK_TENSION, pastCapture: true });
  stepOnce(h);
  const t = h.state.player.tether;
  assert.equal(t.phase, 'overload', `strain 0.8 must phase overload; got ${t.phase}`);
  assert.ok(t.load >= 0.9, `overload load must be >= 0.9; got ${t.load}`);
  assertNear(t.strain, 0.8, 'overload strain must remain lastTension/breakTension');
  assertNear(h.state.player.masslineTelemetry.strain, 0.8, 'telemetry.strain must stay physical under overload');
}

// ---- harness (mirrors check-massline-release-rating.mjs) ----

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

  return { state, tether, telemetry, attachments };
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
  // pastCapture: pretend the line has been taut long enough that the capture window elapsed —
  // the geometric phase fallback then reports loaded/overload straight away.
  if (pastCapture) tether._phaseMirror = { slackS: 0, captureT: 999, captureActive: false, wasTaut: true };
  state.player.tether = {
    active: true, targetId: TARGET_ID, strain: 0, load: 0, restLength,
    phase: 'slack', attachmentId: ATT_ID,
  };
}

// One sim step: tetherGameplay (mirrors tether.load) then masslineTelemetry (relays it) —
// same relative order as PRODUCTION_UPDATE_ORDER in the authoritative runtime manifest.
function stepOnce(harness) {
  const { state, tether, telemetry } = harness;
  state.tick += 1;
  state.simTime = state.tick * DT;
  tether.update(DT, state);
  telemetry.update(DT, state);
}

function assertNear(actual, expected, label, eps = 1e-6) {
  assert.ok(Math.abs(actual - expected) < eps, `${label}: expected ~${expected}; got ${actual}`);
}
