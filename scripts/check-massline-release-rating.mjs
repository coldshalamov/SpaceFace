// Prompt 02 acceptance check: tether:releaseRated is emitted exactly once per successful cut,
// tether:released still fires, and the rating formula behaves per spec.
//
// The spec explicitly permits "a mock bus and mock tetherGameplay helper if full harness is too
// large." We split the check into two layers:
//   1. Formula unit tests against the exported rateRelease() helper — deterministic, no harness.
//   2. Integration tests against the REAL tetherGameplay.update that exercise the actual
//      tether:cut / tether:released / tether:releaseRated emit sites via a mock attachments
//      service. These confirm exactly-once emission and that legacy events still fire.
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { SIM_DT } from '../src/core/sim.js';
import { tetherGameplay, rateRelease } from '../src/systems/tetherGameplay.js';

const DT = SIM_DT;
const TARGET_ID = 4242;
const PLAYER_ID = 7;
const ATT_ID = 'att_test_1';
const TETHER_DEF_ID = 'tether_standard';

// --- formula unit tests (assertions 1-3) ---
await assertTangentialLoadedReleaseClassifiesCleanOrRazor();
await assertRadialLoadedReleaseClassifiesLowerThanTangential();
await assertHighOverloadStrainIsPenalized();
await assertMissingTelemetryStillEmitsMessy();

// --- integration tests against real tetherGameplay.update (assertions 4-5 + break path) ---
await assertTetherReleasedStillFires();
await assertReleaseRatedFiresExactlyOncePerSuccessfulCut();
await assertBreakPathAlsoEmitsReleaseRated();

console.log('Massline release rating checks OK');

// 1. A tangential loaded release classifies "clean" or "razor".
function assertTangentialLoadedReleaseClassifiesCleanOrRazor() {
  // Spec formula:
  //   tangentQuality = 80/(80+2) = 0.976
  //   usefulLoad     = clamp(0.5/0.65,0,1) = 0.769
  //   overloadPenalty= clamp((0.5-0.85)/0.35,0,1) = 0
  //   releaseScore   = 0.976 * 0.769 * 1 = 0.750  -> "clean"
  const rated = rateRelease(stateWithTelemetry({
    targetId: TARGET_ID,
    tangentialSpeed: 80,
    radialSpeed: 2,
    strain: 0.5,
    distance: 100,
    restLength: 100,
    playerSpeed: 90,
    maxStrainSinceLatch: 0.55,
    maxTangentialSpeedSinceLatch: 82,
    maxAngularSpeedSinceLatch: 0.8,
  }), TARGET_ID);

  assert.ok(rated.classification === 'clean' || rated.classification === 'razor',
    `tangential loaded release should rate clean or razor; got ${rated.classification} (${rated.releaseScore})`);
  assertRoundedEqual(rated.tangentialSpeed, 80, 'tangentialSpeed');
  assertRoundedEqual(rated.radialSpeed, 2, 'radialSpeed');
  assertRoundedEqual(rated.strain, 0.5, 'strain');
  assert.equal(rated.targetId, TARGET_ID, 'rating payload should carry targetId');
}

// 2. A radial loaded release classifies lower than the tangential case.
function assertRadialLoadedReleaseClassifiesLowerThanTangential() {
  const tangentialScore = rateRelease(stateWithTelemetry({
    targetId: TARGET_ID, tangentialSpeed: 80, radialSpeed: 2, strain: 0.5,
  }), TARGET_ID).releaseScore;

  const radialRating = rateRelease(stateWithTelemetry({
    targetId: TARGET_ID, tangentialSpeed: 2, radialSpeed: 80, strain: 0.5,
  }), TARGET_ID);

  assert.ok(radialRating.releaseScore < tangentialScore,
    `radial cut should classify lower than tangential; radial=${radialRating.releaseScore} tangential=${tangentialScore}`);
  assert.ok(radialRating.classification === 'messy' || radialRating.classification === 'good',
    `radial-dominant cut should land in messy/good band; got ${radialRating.classification}`);
}

// 3. A high-overload strain release is penalized.
function assertHighOverloadStrainIsPenalized() {
  const baselineScore = rateRelease(stateWithTelemetry({
    targetId: TARGET_ID, tangentialSpeed: 80, radialSpeed: 2, strain: 0.7,
  }), TARGET_ID).releaseScore;

  // Same kinematics but strain deep into the overload band (>=0.85) — overloadPenalty kicks in.
  const overloadScore = rateRelease(stateWithTelemetry({
    targetId: TARGET_ID, tangentialSpeed: 80, radialSpeed: 2, strain: 1.0,
  }), TARGET_ID).releaseScore;

  assert.ok(overloadScore < baselineScore,
    `high-overload strain should be penalized vs loaded; overload=${overloadScore} loaded=${baselineScore}`);
  // At strain = 1.0 the overload penalty is (1.0-0.85)/0.35 ≈ 0.429, so the score must drop by
  // at least that fraction relative to the no-penalty ceiling.
  assert.ok(overloadScore <= baselineScore * (1 - 0.42),
    `overload penalty should materially reduce the score; overload=${overloadScore} baseline=${baselineScore}`);
}

// Spec: if telemetry is missing, still emit tether:releaseRated with classification "messy" and
// numeric fields set to 0 where needed.
function assertMissingTelemetryStillEmitsMessy() {
  const state = createGameState(0x5a);
  delete state.player.masslineTelemetry;
  const rated = rateRelease(state, TARGET_ID);

  assert.equal(rated.classification, 'messy', 'missing telemetry should classify messy');
  assert.equal(rated.releaseScore, 0, 'missing telemetry should score 0');
  for (const field of ['radialSpeed', 'tangentialSpeed', 'angularSpeed', 'strain', 'distance', 'restLength', 'playerSpeed', 'maxStrainSinceLatch', 'maxTangentialSpeedSinceLatch', 'maxAngularSpeedSinceLatch']) {
    assert.equal(rated[field], 0, `missing telemetry should zero ${field}; got ${rated[field]}`);
  }
  assert.equal(rated.targetId, TARGET_ID, 'rating payload should still carry targetId when telemetry is missing');
}

// 4. tether:released still fires. (Integration: real tetherGameplay.update through its cut path.)
async function assertTetherReleasedStillFires() {
  const harness = createHarness();
  seedTelemetry(harness.state, { targetId: TARGET_ID, tangentialSpeed: 50, radialSpeed: 5, strain: 0.4 });
  performPlayerCut(harness);

  assert.equal(harness.events.cut.length, 1, 'player cut should still emit tether:cut');
  assert.equal(harness.events.released.length, 1, 'player cut should still emit tether:released');
  assert.equal(harness.events.released[0].targetId, TARGET_ID, 'tether:released should carry targetId');
}

// 5. tether:releaseRated fires exactly once per successful cut.
async function assertReleaseRatedFiresExactlyOncePerSuccessfulCut() {
  const harness = createHarness();
  seedTelemetry(harness.state, { targetId: TARGET_ID, tangentialSpeed: 50, radialSpeed: 5, strain: 0.4 });
  performPlayerCut(harness);

  assert.equal(harness.events.releaseRated.length, 1,
    'releaseRated must fire exactly once per successful player cut');

  // Holding tetherCut after the cut must not re-emit — _active is null so no second cut can occur.
  harness.state.input.actions.tetherCut = true;
  for (let i = 0; i < 5; i++) stepOnce(harness);
  assert.equal(harness.events.releaseRated.length, 1,
    'releaseRated must not fire again with tetherCut held after a completed cut');
}

// Extra: the target-lost break path also emits releaseRated (so a latch that ends in a break is
// still rated exactly once), and does NOT also emit tether:released.
async function assertBreakPathAlsoEmitsReleaseRated() {
  const harness = createHarness();
  seedTelemetry(harness.state, { targetId: TARGET_ID, tangentialSpeed: 30, radialSpeed: 30, strain: 0.6 });
  primeActiveTether(harness);

  // Mark the target dead and step — tetherGameplay's target-lost branch should fire tether:broke
  // and tether:releaseRated.
  const target = harness.state.entities.get(TARGET_ID);
  target.alive = false;
  stepOnce(harness);

  assert.equal(harness.events.broke.length, 1, 'dead target should emit tether:broke');
  assert.equal(harness.events.released.length, 0, 'break path should not also emit tether:released');
  assert.equal(harness.events.releaseRated.length, 1, 'break path should emit releaseRated exactly once');
}

// ---- harness ----

function stateWithTelemetry(overrides) {
  const state = createGameState(0x5a);
  const base = {
    active: true,
    targetId: TARGET_ID,
    phase: 'loaded',
    previousPhase: 'loaded',
    distance: 100,
    restLength: 100,
    strain: 0.5,
    radialSpeed: 0,
    tangentialSpeed: 0,
    angularSpeed: 0,
    playerSpeed: 90,
    targetSpeed: 0,
    maxStrainSinceLatch: 0,
    maxTangentialSpeedSinceLatch: 0,
    maxAngularSpeedSinceLatch: 0,
    latchTick: 100,
    latchTime: 100 / 60,
  };
  state.player.masslineTelemetry = { ...base, ...overrides };
  return state;
}

function createHarness() {
  const state = createGameState(0x5a);
  state.mode = 'flight';
  state.tick = 100;
  state.simTime = state.tick * DT;
  state.playerId = PLAYER_ID;
  state.entities.clear();

  const player = {
    id: PLAYER_ID, type: 'ship', alive: true, team: 'player',
    pos: { x: 0, z: 0 }, vel: { x: 60, z: 60 }, rot: 0, angVel: 0, maxSpeed: 120,
    boost: { energy: 1, max: 1 },
  };
  const target = {
    id: TARGET_ID, type: 'asteroid', alive: true,
    pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 }, radius: 11, mass: 640,
    hull: 360, hullMax: 360, collides: true,
  };
  state.entities.set(PLAYER_ID, player);
  state.entities.set(TARGET_ID, target);

  state.input.aimWorld = { x: target.pos.x, z: target.pos.z };
  state.input.aimAngle = 0;
  state.input.actions = { tetherFire: false, tetherCut: false, reelDelta: 0 };

  const bus = createBus();
  const events = { cut: [], released: [], broke: [], releaseRated: [] };
  bus.on('tether:cut', (p) => events.cut.push(p));
  bus.on('tether:released', (p) => events.released.push(p));
  bus.on('tether:broke', (p) => events.broke.push(p));
  bus.on('tether:releaseRated', (p) => events.releaseRated.push(p));

  const attachments = makeFakeAttachments();
  const kernel = {
    attachments,
    catalog: { attachments: new Map([[TETHER_DEF_ID, { maxLength: 390, reelRate: 60, minLength: 10, breakTension: 100000 }]]) },
  };
  const registry = {
    get(name) {
      if (name === 'actions' || name === 'combat') return { kernel };
      return null;
    },
  };
  const helpers = {};
  const ctx = { state, bus, helpers, registry };

  const runtime = Object.create(tetherGameplay);
  runtime.init(ctx);

  return { state, bus, events, ctx, runtime, attachments };
}

function makeFakeAttachments() {
  // A single in-flight attachment controlled by the harness. primeActiveTether seeds it.
  let att = null;
  return {
    create() { att = { id: ATT_ID, state: 'active', restLength: 100, lastTension: 0 }; return { ok: true, attachment: att }; },
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

function seedTelemetry(state, overrides) {
  state.player.masslineTelemetry = { ...stateWithTelemetry(overrides).player.masslineTelemetry };
}

// Place the system into a state indistinguishable from "player just latched and is now flying
// with an active tether," without running the full latch ceremony (which needs the spatial hash).
function primeActiveTether(harness) {
  const { state, runtime, attachments } = harness;
  // Seed a backing attachment so _reconcileActive sees state:'active' and does not break it.
  attachments.create({});
  runtime._active = { attachmentId: ATT_ID, targetId: TARGET_ID, type: TETHER_DEF_ID };
  runtime._ignoreReleaseCutUntilReelIdle = false;
  runtime._pendingCut = null;
  runtime._latchGraceUntil = 0;
  state.player.tether = {
    active: true, targetId: TARGET_ID, strain: 0.4, restLength: 100,
    phase: 'loaded', attachmentId: ATT_ID,
  };
}

// Drive the real player-cut gesture: press tetherCut on tick N (records _pendingCut), then
// release the press on tick N+1 (releasedAfterPress becomes true -> cut path fires).
function performPlayerCut(harness) {
  primeActiveTether(harness);
  const { state, runtime } = harness;
  state.input.actions.tetherCut = true;
  state.input.actions.reelDelta = 0;
  runtime.update(DT, state);
  assert.ok(runtime._pendingCut, 'press tick should record a pending cut');
  state.tick += 1;
  state.simTime = state.tick * DT;
  runtime.update(DT, state);
  state.input.actions.tetherCut = false;
}

function stepOnce(harness) {
  const { state, runtime } = harness;
  state.tick += 1;
  state.simTime = state.tick * DT;
  runtime.update(DT, state);
}

function assertRoundedEqual(actual, expected, label, eps = 1e-6) {
  assert.ok(Math.abs(actual - expected) < eps, `${label} should be ~${expected}; got ${actual}`);
}
