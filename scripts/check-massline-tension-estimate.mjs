// SFQ-B026 focused check — the displayed tension estimate is actionable.
//
// Packet: design/finish-expansion-2026-09/builds/SFQ-B026.md — "Players can anticipate a line
// failure and choose release, reel or reduced thrust." Implementation law: use the REAL constraint
// load and breaking threshold (the same three legs the attachment authority's break decision
// reads, src/combat/attachments.js updateTelemetryAndBreak) and smooth ONLY the displayed
// estimate. PIC-13 (rope glow) and the strain scale warning (tetherGameplay SCALE WARNING) are
// already-true work this must not disturb.
//
// Done check (fixed seed 4242):
//   · the displayed estimate pins against real constraint load vs break threshold — converges to
//     the same max(tension, impulse, yank)/envelope ratio the authority computes;
//   · smoothing is display-only: tether.strain stays the untouched physical tension ratio;
//   · slack reads empty (inactive → exactly 0; released load decays back below the readable band);
//   · an approaching break is readable in time to act — including a yank-dominant approach the
//     old tension-only display could not see — inside the authority's 15-tick warning lease.
//
// Shape follows scripts/check-massline-load.mjs: formula units, then the REAL tetherGameplay +
// masslineTelemetry systems over a fake attachments service, in production update order.
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { SIM_DT } from '../src/core/sim.js';
import {
  stepTensionEstimate,
  tetherGameplay,
} from '../src/systems/tetherGameplay.js';
import { masslineTelemetry } from '../src/systems/masslineTelemetry.js';
import { PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import {
  LINE_LOAD_WARN_RISING_ON,
  masslineHud,
  resolveLineLoadWarning,
} from '../src/ui/masslineHud.js';

const SEED = 4242;
const DT = SIM_DT;
const TARGET_ID = 4242;
const PLAYER_ID = 7;
const ATT_ID = 'att_estimate_1';
const DEF_ID = 'tether_estimate_def';
// The live envelope shape of the player's ordinary Massline (attachment_massline,
// src/data/combatDefs.js) — a legged break policy, not one scalar.
const POLICY = { maxTension: 10250, maxImpulse: 206.25, maxYank: 525 };

// Update-order guard, same as check-massline-load.mjs: the estimate is mirrored by tetherGameplay
// and relayed by masslineTelemetry, so production must run them in that order.
{
  const tetherIdx = PRODUCTION_UPDATE_ORDER.indexOf('tetherGameplay');
  const teleIdx = PRODUCTION_UPDATE_ORDER.indexOf('masslineTelemetry');
  assert.ok(tetherIdx >= 0 && teleIdx > tetherIdx,
    'masslineTelemetry must run after tetherGameplay in production UPDATE_ORDER');
}

assertFormulaSmoothing();
assertInactiveReadsEmpty();
assertSlackReadsEmpty();
assertEstimatePinsToRealLoadVsThreshold();
assertDisplaySmoothingLeavesStrainUntouched();
assertYankDominantApproachReadableInTimeToAct();
assertImpulseLegCounts();
assertMissingThresholdLegsDegradeToZero();
assertReleasedLineReadsEmptyAgain();
assertDefBreakDegradeWithoutPolicyAccessor();
assertHudPillDisplaysEstimate();

console.log('Massline tension-estimate checks OK');

// ---- formula: display smoothing only ------------------------------------

function assertFormulaSmoothing() {
  assert.equal(stepTensionEstimate(0, 0, DT), 0, 'zero load stays exactly 0');
  assert.equal(stepTensionEstimate(0.5, 0.5, DT), 0.5, 'settled estimate holds');
  // Garbage raw reads as zero load: the display decays, it never fabricates or holds a fake load.
  const poisoned = stepTensionEstimate(0.4, NaN, DT);
  assert.ok(poisoned < 0.4, `garbage raw decays toward 0 instead of poisoning; got ${poisoned}`);
  assert.equal(stepTensionEstimate(0.4, 0.8, 0), 0.4, 'zero dt holds (no wall-clock smuggling)');
  // Attack rises from below without overshoot.
  const rising = stepTensionEstimate(0, 0.9, DT);
  assert.ok(rising > 0 && rising < 0.9, `attack approaches from below; got ${rising}`);
  // Release decays toward 0 and reaches the exact-zero floor.
  const falling = stepTensionEstimate(0.9, 0, DT);
  assert.ok(falling > 0 && falling < 0.9, `release decays from above; got ${falling}`);
  let v = 0.9;
  for (let i = 0; i < 300; i++) v = stepTensionEstimate(v, 0, DT);
  assert.equal(v, 0, 'a released line settles to an exact 0');
}

// ---- integration: real systems, fixed seed --------------------------------

function assertInactiveReadsEmpty() {
  const h = harness();
  stepOnce(h);
  assert.equal(h.state.player.tether.active, false, 'harness starts with no tether');
  assert.equal(h.state.player.tether.tensionEstimate, 0, 'inactive tether estimate must be exactly 0');
  assert.equal(h.state.player.masslineTelemetry.tensionEstimate, 0, 'inactive telemetry estimate must be 0');
}

function assertSlackReadsEmpty() {
  const h = harness();
  primeActiveTether(h, { restLength: 150, lastTension: 0, lastImpulse: 0, lastYank: 0 });
  stepOnce(h);
  const t = h.state.player.tether;
  assert.equal(t.active, true, 'tether should be live');
  assert.equal(t.phase, 'slack', 'slack geometry phases slack');
  assert.equal(t.tensionEstimate, 0, 'slack with zero real load must read empty');
  assert.equal(h.state.player.masslineTelemetry.tensionEstimate, 0, 'telemetry relays the empty read');
}

function assertEstimatePinsToRealLoadVsThreshold() {
  const h = harness();
  const tension = 0.9 * POLICY.maxTension;
  primeActiveTether(h, {
    restLength: 90, lastTension: tension, lastImpulse: 0, lastYank: 0, pastCapture: true,
  });
  for (let i = 0; i < 120; i++) stepOnce(h);
  const realRatio = tension / POLICY.maxTension;
  const t = h.state.player.tether;
  assert.ok(Math.abs(t.tensionEstimate - realRatio) < 0.05,
    `displayed estimate must pin to real load vs break threshold (${realRatio}); got ${t.tensionEstimate}`);
  assert.ok(Math.abs(h.state.player.masslineTelemetry.tensionEstimate - realRatio) < 0.05,
    'telemetry relays the pinned estimate');
  // The relayed read is a smoothed copy, not a second authority: the physical ratio is untouched.
  assertNear(t.strain, realRatio, 'strain stays the untouched tension/breakTension ratio');
}

function assertDisplaySmoothingLeavesStrainUntouched() {
  const h = harness();
  primeActiveTether(h, {
    restLength: 90, lastTension: 0.5 * POLICY.maxTension, lastImpulse: 0, lastYank: 0, pastCapture: true,
  });
  // First tick: estimate is far from settled, strain must already be exact.
  stepOnce(h);
  assertNear(h.state.player.tether.strain, 0.5, 'strain is exact on the first tick');
  assert.ok(h.state.player.tether.tensionEstimate < 0.5,
    'the displayed estimate is the smoothed copy, below raw on attack');
  for (let i = 0; i < 90; i++) stepOnce(h);
  assertNear(h.state.player.tether.strain, 0.5, 'strain never drifts while the estimate settles');
  assert.ok(Math.abs(h.state.player.tether.tensionEstimate - 0.5) < 0.05,
    'settled estimate converges to the raw ratio');
}

// The core SFQ-B026 pin: a snap-class approach is a SHARP yank (masslineController snap policy),
// and the old tension-only display sat near zero while it built. The estimate must surface it
// inside the 15-tick (250 ms) counterplay lease the break authority grants after nearBreak.
function assertYankDominantApproachReadableInTimeToAct() {
  const h = harness();
  primeActiveTether(h, {
    restLength: 90,
    lastTension: 0.001 * POLICY.maxTension,   // tension leg: invisible (old display read ~0.001)
    lastImpulse: 0,
    lastYank: 0.9 * POLICY.maxYank,           // yank leg: the real story, 90% of the envelope
    pastCapture: true,
  });
  let crossedInTicks = -1;
  let warnedSeen = false;
  for (let i = 1; i <= 60; i++) {
    stepOnce(h);
    const t = h.state.player.tether;
    if (crossedInTicks < 0 && t.tensionEstimate >= LINE_LOAD_WARN_RISING_ON) crossedInTicks = i;
    // A climbing estimate carries a positive trend into the same INF-014 resolver the pill uses.
    if (resolveLineLoadWarning(t.tensionEstimate, 1, false)) warnedSeen = true;
    assert.ok(t.strain < 0.01, `old strain read stays near zero; got ${t.strain}`);
  }
  assert.ok(crossedInTicks > 0 && crossedInTicks <= 15,
    `approaching break must be readable within the 15-tick warning lease; crossed at tick ${crossedInTicks}`);
  assert.ok(warnedSeen, 'the INF-014 warn band is reachable from the estimate during the approach');
  // And it pins the yank leg itself, not an invented number.
  assert.ok(Math.abs(h.state.player.tether.tensionEstimate - 0.9) < 0.05,
    `estimate must read the real yank ratio (0.9); got ${h.state.player.tether.tensionEstimate}`);
}

function assertImpulseLegCounts() {
  const h = harness();
  primeActiveTether(h, {
    restLength: 90,
    lastTension: 0.05 * POLICY.maxTension,
    lastImpulse: 0.85 * POLICY.maxImpulse,
    lastYank: 0,
    pastCapture: true,
  });
  for (let i = 0; i < 120; i++) stepOnce(h);
  assert.ok(Math.abs(h.state.player.tether.tensionEstimate - 0.85) < 0.05,
    `the impulse leg must reach the displayed estimate; got ${h.state.player.tether.tensionEstimate}`);
}

function assertMissingThresholdLegsDegradeToZero() {
  const h = harness();
  // A leg with NO authored threshold contributes 0 — an unbounded load never fakes an overload.
  primeActiveTether(h, {
    restLength: 90,
    lastTension: 0.1 * POLICY.maxTension,
    lastImpulse: 0,
    lastYank: 1e6, // enormous yank against a policy that names no yank limit
    pastCapture: true,
    policyOverride: { maxTension: POLICY.maxTension, maxImpulse: POLICY.maxImpulse },
  });
  for (let i = 0; i < 120; i++) stepOnce(h);
  assert.ok(Math.abs(h.state.player.tether.tensionEstimate - 0.1) < 0.05,
    `unthesholded leg contributes 0, not a fake overload; got ${h.state.player.tether.tensionEstimate}`);
}

function assertReleasedLineReadsEmptyAgain() {
  const h = harness();
  primeActiveTether(h, {
    restLength: 90, lastTension: 0.9 * POLICY.maxTension, lastImpulse: 0, lastYank: 0, pastCapture: true,
  });
  for (let i = 0; i < 120; i++) stepOnce(h);
  assert.ok(h.state.player.tether.tensionEstimate > 0.8, 'loaded line reads high before the release');
  // Pilot releases/reels: real load drops to zero (slack geometry, no constraint load).
  h.attachments.updateLast({ lastTension: 0, lastImpulse: 0, lastYank: 0 });
  for (let i = 0; i < 90; i++) stepOnce(h); // 1.5 s
  assert.ok(h.state.player.tether.tensionEstimate < 0.02,
    `a released line must read empty again; got ${h.state.player.tether.tensionEstimate}`);
}

function assertDefBreakDegradeWithoutPolicyAccessor() {
  // Same outcome with NO breakPolicy accessor: the def's break block carries the envelope, the
  // same degrade chain the strain read has always used.
  const h = harness({ defBreak: { maxTension: 4000, maxImpulse: 80, maxYank: 200 } });
  primeActiveTether(h, {
    restLength: 90,
    lastTension: 0.001 * 4000,
    lastImpulse: 0,
    lastYank: 0.8 * 200,
    pastCapture: true,
    omitPolicyAccessor: true,
  });
  let crossedInTicks = -1;
  for (let i = 1; i <= 60; i++) {
    stepOnce(h);
    if (crossedInTicks < 0 && h.state.player.tether.tensionEstimate >= 0.6) crossedInTicks = i;
  }
  assert.ok(crossedInTicks > 0 && crossedInTicks <= 15,
    `def-break degrade still reads the approach in time; crossed at tick ${crossedInTicks}`);
  assert.ok(Math.abs(h.state.player.tether.tensionEstimate - 0.8) < 0.05,
    `estimate pins to the def-break yank ratio (0.8); got ${h.state.player.tether.tensionEstimate}`);
}

// ---- HUD pill: the estimate is what the pilot reads -----------------------

function assertHudPillDisplaysEstimate() {
  const dom = fakeMetersDom();
  const state = {
    simTime: 1.0,
    massline2: {},
    player: {
      tether: { active: true, targetId: TARGET_ID, strain: 0.001, tensionEstimate: 0.6, phase: 'loaded' },
      masslineTelemetry: { strain: 0.001, tensionEstimate: 0.6 },
      remoteMassline: null,
    },
  };
  masslineHud._updateMeters(dom, {}, state);
  assert.equal(dom.strainPill.style.display, 'flex', 'a loaded line shows the LINE pill');
  const scaleX = /scaleX\(([^)]+)\)/.exec(dom.strainFill.style.transform);
  assert.ok(scaleX && Math.abs(Number(scaleX[1]) - 0.6) < 0.001,
    `the pill bar displays the estimate, not tension-only strain; got ${dom.strainFill.style.transform}`);
  assert.match(String(dom.strainPill.getAttribute('aria-label')), /60 percent/,
    'the announced load percent is the estimate, not the ~0 strain');
  // High estimate: the warn branch speaks the counterplay copy instead of the percent.
  const hot = {
    simTime: 2.0,
    massline2: {},
    player: {
      tether: { active: true, targetId: TARGET_ID, strain: 0.001, tensionEstimate: 0.84, phase: 'loaded' },
      masslineTelemetry: { strain: 0.001, tensionEstimate: 0.84 },
      remoteMassline: null,
    },
  };
  masslineHud._updateMeters(dom, {}, hot);
  assert.match(String(dom.strainPill.getAttribute('aria-label')), /ease the turn/,
    'an approaching break announces the actionable read');
  // Degrade: a save/fixture without the field falls back to the physical strain read.
  const legacy = {
    simTime: 1.0,
    massline2: {},
    player: {
      tether: { active: true, targetId: TARGET_ID, strain: 0.5, phase: 'loaded' },
      masslineTelemetry: { strain: 0.5 },
      remoteMassline: null,
    },
  };
  masslineHud._updateMeters(dom, {}, legacy);
  const legacyScaleX = /scaleX\(([^)]+)\)/.exec(dom.strainFill.style.transform);
  assert.ok(legacyScaleX && Math.abs(Number(legacyScaleX[1]) - 0.5) < 0.001,
    'without the estimate the pill degrades to the strain read');
}

// ---- harness (mirrors check-massline-load.mjs) -----------------------------

function harness({ defBreak = null } = {}) {
  const state = createGameState(SEED);
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
  const def = defBreak
    ? { maxLength: 390, reelRate: 60, minLength: 10, break: defBreak }
    : { maxLength: 390, reelRate: 60, minLength: 10 };
  const kernel = {
    attachments,
    catalog: { attachments: new Map([[DEF_ID, def]]) },
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
    seed(props) {
      att = {
        id: ATT_ID, state: 'active', defId: DEF_ID, targetId: TARGET_ID,
        restLength: 100, lastTension: 0, lastImpulse: 0, lastYank: 0, ...props,
      };
      return att;
    },
    updateLast(props) { if (att) Object.assign(att, props); },
    get(id) { return att && att.id === id ? att : null; },
    breakPolicy(id) {
      if (!att || att.id !== id) return null;
      if (att.omitPolicyAccessor) return null;
      return att.policyOverride || POLICY;
    },
  };
}

function primeActiveTether(harnessObj, {
  restLength = 100,
  lastTension = 0,
  lastImpulse = 0,
  lastYank = 0,
  pastCapture = false,
  policyOverride = undefined,
  omitPolicyAccessor = false,
  ...attachmentProps
} = {}) {
  const { state, tether, attachments } = harnessObj;
  attachments.seed({ restLength, lastTension, lastImpulse, lastYank, policyOverride, omitPolicyAccessor, ...attachmentProps });
  tether._active = { attachmentId: ATT_ID, targetId: TARGET_ID, type: DEF_ID };
  tether._ignoreReleaseCutUntilReelIdle = false;
  tether._pendingCut = null;
  tether._latchGraceUntil = 0;
  if (pastCapture) tether._phaseMirror = { slackS: 0, captureT: 999, captureActive: false, wasTaut: true };
  state.player.tether = {
    active: true, targetId: TARGET_ID, strain: 0, load: 0, restLength,
    phase: 'slack', attachmentId: ATT_ID,
  };
}

function stepOnce(harnessObj) {
  const { state, tether, telemetry } = harnessObj;
  state.tick += 1;
  state.simTime = state.tick * DT;
  tether.update(DT, state);
  telemetry.update(DT, state);
}

function fakeMetersDom() {
  const pill = () => ({
    style: {},
    classList: { toggle() {} },
    setAttribute(name, value) { this[name] = value; },
    getAttribute(name) { return this[name]; },
  });
  return {
    btPill: pill(), btFill: pill(), ckPill: pill(), ckFill: pill(),
    strainPill: pill(), strainFill: pill(), strainText: { textContent: '' },
    ridePill: pill(), rideFill: pill(),
  };
}

function assertNear(actual, expected, label, eps = 1e-9) {
  assert.ok(Math.abs(actual - expected) < eps, `${label}: expected ~${expected}; got ${actual}`);
}
