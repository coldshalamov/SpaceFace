// Massline rung 11 acceptance check: arc-preview data.
//
// telemetry.arcPreview is the PREDICTED sling if the player cut right now, recomputed each active
// tick from the same kinematics telemetry already computes. Pure data (rung 12 renders it):
//   exitSpeed  = current world speed (ballistic after a cut)
//   exitAngle  = world heading of the cut-now exit vector, in [-PI, PI]
//   peakSpeed  = targetSpeed + |relVel| >= current speed (best fully-converted swing exit)
//   timeToWhip = s until the line goes taut on the current heading (0 taut, null never/beyond 8 s)
//   viable     = loaded/overload phase + tangential-dominant (>= 0.5 quality) + genuinely moving
//                (>= 25 wu/s, the SNAP_CATCH_MIN_SPEED bar) + exit ray clears the anchor body
//
// Contract (src/systems/masslineTelemetry.js, ARC_* constants):
//   - populated under swing conditions; fields finite & sensible
//   - null when the tether is inactive / after release (writeInactive clears it)
//   - radial rush     -> viable false (tangent quality gate)
//   - slack line      -> viable false (load gate) but timeToWhip finite/positive when drifting taut
//   - static swing    -> viable false (exit-speed gate) while peakSpeed still reads the conversion
//   - anchor impact   -> viable false (exit ray enters the anchor body) at equal speed/quality
//   - observer-only   -> tether.strain/load and player velocity untouched
//
// Same harness shape as check-massline-snapcatch.mjs/reelpump.mjs: real tetherGameplay.update +
// masslineTelemetry.update in registry order, mocking only the attachments service.
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { SIM_DT } from '../src/core/sim.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { masslineTelemetry } from '../src/systems/masslineTelemetry.js';

const DT = SIM_DT;
const TARGET_ID = 5911;
const PLAYER_ID = 7;
const ATT_ID = 'att_arc_1';
const TETHER_DEF_ID = 'tether_standard';
const BREAK_TENSION = 1000;

assertPopulatedAndViableUnderSwing();
assertClearedOnReleaseAndWhenNeverActive();
assertRadialRushNotViable();
assertSlackDriftTimeToWhipAndLoadGate();
assertStaticSwingExitSpeedGateAndPeakConversion();
assertAnchorImpactGate();
assertObserverOnly();

console.log('Massline arc-preview data checks OK');

// Clean taut swing: player orbits at 30 wu/s perpendicular to the line (loaded phase). Preview is
// populated, finite, sensible: peakSpeed >= current speed, exitAngle in range, taut -> whip now.
function assertPopulatedAndViableUnderSwing() {
  const h = createHarness();
  h.player.vel = { x: 0, z: 30 };
  primeActiveTether(h, { restLength: 90, lastTension: 0.3 * BREAK_TENSION, pastCapture: true });
  stepTicks(h, 3);

  const p = h.state.player.masslineTelemetry.arcPreview;
  assert.ok(p, 'swing conditions must populate arcPreview');
  assertFinite(p.exitSpeed, 'exitSpeed');
  assertFinite(p.exitAngle, 'exitAngle');
  assertFinite(p.peakSpeed, 'peakSpeed');
  assert.ok(p.exitAngle >= -Math.PI && p.exitAngle <= Math.PI, `exitAngle in [-PI,PI]; got ${p.exitAngle}`);
  assertNear(p.exitSpeed, 30, 'exitSpeed must be current world speed', 1e-6);
  assertNear(p.exitAngle, Math.PI / 2, 'exit heading must follow the velocity (+z)', 1e-6);
  assert.ok(p.peakSpeed >= p.exitSpeed - 1e-9,
    `peakSpeed must be >= current speed; peak=${p.peakSpeed} exit=${p.exitSpeed}`);
  assert.equal(p.timeToWhip, 0, 'a taut line whips now (timeToWhip 0)');
  assert.equal(p.viable, true, 'a fast tangential swing on a loaded line converts (viable)');
}

// Populated while latched, null after release; a never-active harness also reads null.
function assertClearedOnReleaseAndWhenNeverActive() {
  const h = createHarness();
  h.player.vel = { x: 0, z: 30 };
  primeActiveTether(h, { restLength: 90, lastTension: 0.3 * BREAK_TENSION, pastCapture: true });
  stepTicks(h, 3);
  assert.ok(h.state.player.masslineTelemetry.arcPreview, 'active latch populates arcPreview');

  // Release: tetherGameplay mirrors inactive; telemetry writeInactive must clear the preview.
  h.tether._active = null;
  stepTicks(h, 2);
  assert.equal(h.state.player.masslineTelemetry.arcPreview, null,
    'released tether must clear arcPreview');

  const cold = createHarness();
  stepTicks(cold, 3);
  assert.equal(cold.state.player.masslineTelemetry.arcPreview, null,
    'never-active tether must leave arcPreview null');
}

// Radial rush: full speed straight at the anchor. Loaded and fast, but zero tangential — cutting
// now would not convert (and the ray dives into the rock). viable must be false; fields stay sane.
function assertRadialRushNotViable() {
  const h = createHarness();
  h.player.vel = { x: 60, z: 0 };
  primeActiveTether(h, { restLength: 90, lastTension: 0.3 * BREAK_TENSION, pastCapture: true });
  stepTicks(h, 3);

  const p = h.state.player.masslineTelemetry.arcPreview;
  assert.ok(p, 'radial rush still populates the preview (data, not judgement)');
  assert.equal(p.viable, false, 'a radial rush must not read viable');
  assertNear(p.exitAngle, 0, 'rush heading is +x', 1e-6);
  assert.ok(p.peakSpeed >= p.exitSpeed - 1e-9, 'peakSpeed >= current speed holds on a rush too');
}

// Slack drifting line (restLength 200 > distance 100), drifting perpendicular at 30 wu/s: the whip
// prediction solves |r + w t| = L -> sqrt((200^2-100^2)/30^2) ~ 5.77 s. Not loaded -> not viable.
function assertSlackDriftTimeToWhipAndLoadGate() {
  const h = createHarness();
  h.player.vel = { x: 0, z: 30 };
  primeActiveTether(h, { restLength: 200, lastTension: 0 });
  stepTicks(h, 2);

  const p = h.state.player.masslineTelemetry.arcPreview;
  assert.ok(p, 'slack latch still populates the preview');
  assert.ok(Number.isFinite(p.timeToWhip) && p.timeToWhip > 0,
    `drifting slack line must predict a finite positive whip; got ${p.timeToWhip}`);
  assertNear(p.timeToWhip, Math.sqrt((200 * 200 - 100 * 100) / (30 * 30)), 'whip solve', 0.05);
  assert.equal(p.viable, false, 'an unloaded (slack) line must not read viable');
}

// Static player, moving anchor (the snap-catch scenario): peakSpeed reads the CONVERSION
// (targetSpeed + relSpeed = 60), strictly above the current speed (0) — a real prediction, not an
// echo of |vel|. And a zero-speed exit is not viable (the genuinely-moving bar).
function assertStaticSwingExitSpeedGateAndPeakConversion() {
  const h = createHarness();
  h.target.vel = { x: 0, z: 30 };
  primeActiveTether(h, { restLength: 90, lastTension: 0.3 * BREAK_TENSION, pastCapture: true });
  stepTicks(h, 3);

  const p = h.state.player.masslineTelemetry.arcPreview;
  assert.ok(p, 'moving-anchor swing populates the preview');
  assertNear(p.exitSpeed, 0, 'static player exits at 0', 1e-9);
  assertNear(p.peakSpeed, 60, 'peak must read the full conversion (targetSpeed + relSpeed)', 1e-6);
  assert.ok(p.peakSpeed > p.exitSpeed, 'peak must exceed current speed here (strict)');
  assert.equal(p.viable, false, 'a 0 wu/s exit is below the genuinely-moving bar (not viable)');
}

// Anchor-clearance gate isolated: close-in latch (distance 20, combined radius 17). Same speed and
// swing-dominant quality both times; only the exit ray differs.
//   50 deg off the line: quality 0.54, ray dips inside the body (perp 15.3 < 17) -> NOT viable.
//   80 deg off the line: quality 0.85, ray clears (perp 19.7 > 17)               -> viable.
function assertAnchorImpactGate() {
  const hitCase = createHarness({ targetPos: { x: 20, z: 0 } });
  hitCase.player.vel = { x: 40 * Math.cos(50 * Math.PI / 180), z: 40 * Math.sin(50 * Math.PI / 180) };
  primeActiveTether(hitCase, { restLength: 18, lastTension: 0.3 * BREAK_TENSION, pastCapture: true });
  stepTicks(hitCase, 2);
  const hitPreview = hitCase.state.player.masslineTelemetry.arcPreview;
  assert.ok(hitPreview, 'close-in latch populates the preview');
  assert.equal(hitPreview.viable, false, 'an exit ray into the anchor body must not read viable');

  const clearCase = createHarness({ targetPos: { x: 20, z: 0 } });
  clearCase.player.vel = { x: 40 * Math.cos(80 * Math.PI / 180), z: 40 * Math.sin(80 * Math.PI / 180) };
  primeActiveTether(clearCase, { restLength: 18, lastTension: 0.3 * BREAK_TENSION, pastCapture: true });
  stepTicks(clearCase, 2);
  const clearPreview = clearCase.state.player.masslineTelemetry.arcPreview;
  assert.equal(clearPreview.viable, true,
    'same speed, ray clearing the anchor must read viable (isolates the clearance gate)');
}

// Observer-only: the projection must not warp the sim reads it derives from.
function assertObserverOnly() {
  const h = createHarness();
  h.player.vel = { x: 0, z: 30 };
  primeActiveTether(h, { restLength: 90, lastTension: 0.3 * BREAK_TENSION, pastCapture: true });
  stepTicks(h, 10);

  const t = h.state.player.tether;
  assertNear(t.strain, 0.3, 'strain must remain lastTension/breakTension — preview must not warp it');
  assertNear(t.load, 0.75, 'load must stay computeTetherLoad value (untouched by preview)');
  assert.deepEqual(h.player.vel, { x: 0, z: 30 }, 'preview must not steer the player');
  assert.deepEqual(h.target.pos, { x: 100, z: 0 }, 'preview must not move the anchor');
}

// ---- harness (mirrors check-massline-snapcatch.mjs) ----

function createHarness({ targetPos = { x: 100, z: 0 } } = {}) {
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
    pos: { ...targetPos }, vel: { x: 0, z: 0 }, radius: 11, mass: 640,
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

  return { state, tether, telemetry, attachments, player, target };
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

function assertFinite(value, label) {
  assert.ok(Number.isFinite(value), `${label} must be finite; got ${value}`);
}

function assertNear(actual, expected, label, eps = 1e-6) {
  assert.ok(Math.abs(actual - expected) < eps, `${label}: expected ~${expected}; got ${actual}`);
}
