// Prompt 03 acceptance check: tether:releaseRated produces tiered player-facing feedback through
// the existing presentation pipeline (presentationOrchestrator -> presentation:cue ->
// presentationAdapters -> alert/audio:cue/presentation:vfxCue/camera:shake/presentation:caption).
//
// We instantiate the real orchestrator + adapters against an in-memory bus and state, so the test
// exercises the actual emit/subscribe wiring rather than a parallel mock.
//
// The payload is built by the REAL emitter (tetherGameplay.rateRelease) rather than hand-written
// here. That is deliberate and load-bearing: this check previously invented its own payload, so it
// could not see that production's payload named no source. cueSchema.inferRelevance therefore fell
// back to a pure distance table, every release landed under presentationAdapters'
// PLAYER_LANE_RELEVANCE_FLOOR, and the HUD toast, the accessibility caption and the camera kick for
// a clean Massline release were dropped for months while this file still passed its own fiction.
// Drive the shipped function or the same class of bug walks straight back in.
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { presentationAdapters, PLAYER_LANE_RELEVANCE_FLOOR } from '../src/systems/presentationAdapters.js';
import { PRESENTATION_RECIPES, validatePresentationRecipes } from '../src/presentation/cueRecipes.js';
import { rateRelease } from '../src/systems/tetherGameplay.js';

const PLAYER_ID = 1;
const TARGET_ID = 2;

// Telemetry that drives rateRelease() to each classification band. releaseScore =
// tangentQuality * clamp01(strain/0.65) * (1 - overloadPenalty); at strain 0.65 the load term is 1
// and the score is exactly the tangential fraction, so these are the bands' own thresholds.
const TELEMETRY_BY_CLASSIFICATION = Object.freeze({
  messy: { tangentialSpeed: 20, radialSpeed: 80 },  // 0.20 -> messy  (< 0.35)
  good: { tangentialSpeed: 50, radialSpeed: 50 },   // 0.50 -> good   (>= 0.35)
  clean: { tangentialSpeed: 75, radialSpeed: 25 },  // 0.75 -> clean  (>= 0.65)
  razor: { tangentialSpeed: 90, radialSpeed: 10 },  // 0.90 -> razor  (>= 0.85)
});

// Sanity: the new recipes exist, validate, and escalate good -> clean -> razor.
const recipeReport = validatePresentationRecipes();
assert(recipeReport.ok, `presentation recipes must validate: ${recipeReport.issues.join('; ')}`);
for (const id of ['tether.release.good', 'tether.release.clean', 'tether.release.razor']) {
  assert.ok(PRESENTATION_RECIPES[id], `recipe ${id} must exist`);
}
const goodRecipe = PRESENTATION_RECIPES['tether.release.good'];
const cleanRecipe = PRESENTATION_RECIPES['tether.release.clean'];
const razorRecipe = PRESENTATION_RECIPES['tether.release.razor'];
assert.ok(razorRecipe.importance > goodRecipe.importance,
  `razor cue must be more important than good; razor=${razorRecipe.importance} good=${goodRecipe.importance}`);
assert.ok((razorRecipe.budgets.particles || 0) > (goodRecipe.budgets.particles || 0),
  `razor cue must budget more particles than good`);

assertRateReleaseNamesThePlayerAsTheSource();
await assertMessyReleaseEmitsNoPremiumFeedback();
await assertCleanReleaseEmitsAtLeastOnePlayerFacingCue();
await assertCleanReleaseStaysPlayerFacingAtEveryRange();
await assertRazorReleaseStrongerThanGood();
await assertReducedMotionAndFlashDoNotCrashAndSuppressMotion();

console.log('Massline release feedback checks OK');

// 0. The shipped payload must identify the player as the actor being rated. This is the single
//    field the whole player-facing half of the pipeline hangs on — see the header.
function assertRateReleaseNamesThePlayerAsTheSource() {
  const state = stateWithTelemetry(TELEMETRY_BY_CLASSIFICATION.clean);
  const payload = rateRelease(state, TARGET_ID);
  assert.equal(payload.classification, 'clean',
    `fixture telemetry must produce a clean release; got ${payload.classification} @ ${payload.releaseScore}`);
  assert.equal(payload.sourceId, state.playerId,
    'a release rating judges the PLAYER\'s technique, so the emitted payload must name the player as '
    + 'the cue source; without it cueSchema.inferRelevance falls back to a distance table and every '
    + `player-scoped lane is dropped below PLAYER_LANE_RELEVANCE_FLOOR (${PLAYER_LANE_RELEVANCE_FLOOR})`);
  assert.equal(payload.targetId, TARGET_ID, 'the tethered body stays the cue target');
}

// 1. "messy" release does not emit premium feedback.
async function assertMessyReleaseEmitsNoPremiumFeedback() {
  const harness = createHarness();

  emitRelease(harness, 'messy');

  assert.equal(harness.cues.length, 0, 'messy release must not emit a presentation:cue');
  assert.equal(harness.alerts.length, 0, 'messy release must not emit a UI alert');
  assert.equal(harness.audioCues.length, 0, 'messy release must not emit audio:cue');
  assert.equal(harness.vfxCues.length, 0, 'messy release must not emit a vfx cue');
  assert.equal(harness.cameraShakes.length, 0, 'messy release must not shake the camera');
}

// 2. "clean" release emits player-facing feedback on every lane the recipe declares — exactly one
//    UI alert (not zero, and not a double-toast), plus its caption and camera kick.
async function assertCleanReleaseEmitsAtLeastOnePlayerFacingCue() {
  const harness = createHarness();

  emitRelease(harness, 'clean');

  assert.equal(harness.cues.length, 1, 'clean release should emit exactly one presentation:cue');
  assert.equal(harness.cues[0], 'tether.release.clean', 'clean release should map to tether.release.clean');

  const playerFacing = harness.alerts.length + harness.audioCues.length + harness.vfxCues.length + harness.captions.length;
  assert.ok(playerFacing >= 1,
    `clean release should emit at least one player-facing cue; got alerts=${harness.alerts.length} audio=${harness.audioCues.length} vfx=${harness.vfxCues.length} captions=${harness.captions.length}`);
  assert.equal(harness.alerts.length, 1,
    'clean release should emit exactly one UI alert — one, not zero (dropped by the player-lane '
    + 'relevance floor) and not two (double-toast)');
  assert.equal(harness.captions.length, 1,
    'clean release should also speak its accessibility caption; that lane is gated by the same floor');
  assert.equal(harness.cameraShakes.length, 1,
    'clean release should kick the camera; that lane is gated by the same floor');
}

// 3. Range must not decide whether the player is told. The dropped-toast bug was invisible for
//    exactly this reason: the cue's relevance was being derived from how far away the body was,
//    so a release at arm's length behaved differently from one at the end of the line.
async function assertCleanReleaseStaysPlayerFacingAtEveryRange() {
  for (const distance of [10, 100, 260, 389]) {
    const harness = createHarness({ targetDistance: distance });
    emitRelease(harness, 'clean');
    assert.equal(harness.alerts.length, 1,
      `a clean release ${distance} wu away must still surface exactly one UI alert; got ${harness.alerts.length}`);
    assert.equal(harness.captions.length, 1,
      `a clean release ${distance} wu away must still speak its caption; got ${harness.captions.length}`);
  }
}

// 4. "razor" release emits a stronger/different cue than "good".
async function assertRazorReleaseStrongerThanGood() {
  const good = createHarness();
  emitRelease(good, 'good');

  const razor = createHarness();
  emitRelease(razor, 'razor');

  assert.equal(good.cues[0], 'tether.release.good', 'good release should map to tether.release.good');
  assert.equal(razor.cues[0], 'tether.release.razor', 'razor release should map to tether.release.razor');
  assert.notEqual(good.cues[0], razor.cues[0], 'razor and good must produce different cue ids');

  // Razor cue must be observably stronger than good on at least one motion/particle axis.
  const goodParticles = particleBudgetOf(good);
  const razorParticles = particleBudgetOf(razor);
  assert.ok(razorParticles > goodParticles,
    `razor vfx particle budget (${razorParticles}) should exceed good (${goodParticles})`);

  const goodTrauma = cameraTraumaOf(good);
  const razorTrauma = cameraTraumaOf(razor);
  assert.ok(razorTrauma > goodTrauma,
    `razor camera trauma (${razorTrauma}) should exceed good (${goodTrauma})`);

  // Razor UI text must differ from good (stronger/different copy).
  assert.ok(harnessAlertText(razor) !== harnessAlertText(good),
    `razor alert text must differ from good; razor="${harnessAlertText(razor)}" good="${harnessAlertText(good)}"`);
}

// 5. Reduced-motion/reduced-flash settings do not crash and suppress any motion-heavy cue if such
//    a cue exists. The motion-heavy cue here is camera shake (and particle VFX); under motionReduce
//    the camera trauma is dampened and under flashReduce the particle count is reduced.
async function assertReducedMotionAndFlashDoNotCrashAndSuppressMotion() {
  const baseline = createHarness({ motionReduce: false, flashReduce: false });
  emitRelease(baseline, 'razor');
  const baselineTrauma = cameraTraumaOf(baseline);
  const baselineParticles = particleBudgetOf(baseline);
  assert.ok(baselineTrauma > 0, 'razor release should shake the camera at default settings');

  // Must not throw with accessibility flags on.
  const reduced = createHarness({ motionReduce: true, flashReduce: true });
  assert.doesNotThrow(() => emitRelease(reduced, 'razor'));

  const reducedTrauma = cameraTraumaOf(reduced);
  const reducedParticles = particleBudgetOf(reduced);
  assert.ok(reducedTrauma < baselineTrauma,
    `motionReduce should suppress camera trauma; reduced=${reducedTrauma} baseline=${baselineTrauma}`);
  assert.ok(reducedParticles < baselineParticles,
    `flashReduce should suppress particles; reduced=${reducedParticles} baseline=${baselineParticles}`);
  assert.equal(reduced.cameraShakes.length, 1, 'reduced motion should still emit the cue (dampened, not removed)');
  assert.equal(reduced.cameraShakes[0].reducedMotion, true, 'camera cue should report reducedMotion=true');
  assert.equal(reduced.vfxCues[0].flashReduced, true, 'vfx cue should report flashReduced=true');
}

// ---- harness ----

// A state shaped the way the live sim hands it to rateRelease(): a player id, the two bodies, and
// the masslineTelemetry subtree masslineTelemetry.js publishes each tick.
function stateWithTelemetry(telemetry, { targetDistance = 100 } = {}) {
  return {
    tick: 1,
    simTime: 1 / 60,
    playerId: PLAYER_ID,
    entities: new Map([
      [PLAYER_ID, { id: PLAYER_ID, pos: { x: 0, z: 0 } }],
      [TARGET_ID, { id: TARGET_ID, pos: { x: targetDistance, z: 0 } }],
    ]),
    player: {
      masslineTelemetry: {
        targetId: TARGET_ID,
        strain: 0.65,
        distance: targetDistance,
        restLength: targetDistance,
        angularSpeed: 0.5,
        playerSpeed: 90,
        maxStrainSinceLatch: 0.65,
        maxTangentialSpeedSinceLatch: 90,
        maxAngularSpeedSinceLatch: 0.5,
        ...telemetry,
      },
    },
  };
}

function createHarness({ motionReduce = false, flashReduce = false, targetDistance = 100 } = {}) {
  const bus = createBus();
  const state = stateWithTelemetry(TELEMETRY_BY_CLASSIFICATION.clean, { targetDistance });
  state.settings = {
    video: { motionReduce },
    accessibility: { flashReduce },
  };
  state.targetDistance = targetDistance;
  const ctx = { state, bus, helpers: {} };

  const orchestrator = Object.create(presentationOrchestrator);
  orchestrator.init(ctx);
  const adapters = Object.create(presentationAdapters);
  adapters.init(ctx);

  const harness = {
    state, bus, orchestrator, adapters,
    cues: [], alerts: [], audioCues: [], vfxCues: [], cameraShakes: [], captions: [],
  };
  bus.on('presentation:cue', (p) => harness.cues.push(p.id));
  bus.on('alert', (p) => harness.alerts.push(p));
  bus.on('audio:cue', (p) => harness.audioCues.push(p));
  bus.on('presentation:vfxCue', (p) => harness.vfxCues.push(p));
  bus.on('camera:shake', (p) => harness.cameraShakes.push(p));
  bus.on('presentation:caption', (p) => harness.captions.push(p));
  return harness;
}

// Build the payload with the SHIPPED emitter, then put it on the bus exactly as tetherGameplay
// does. Nothing here hand-writes a payload field, so the check cannot drift away from production.
function emitRelease(harness, classification) {
  const telemetry = TELEMETRY_BY_CLASSIFICATION[classification];
  assert.ok(telemetry, `unknown release classification fixture: ${classification}`);
  Object.assign(harness.state.player.masslineTelemetry, telemetry);
  // Advance the tick each call so dedupe windows don't suppress back-to-back releases in tests
  // that compare good vs razor across separate harnesses (each harness is fresh, but we keep the
  // habit defensive).
  harness.state.tick += 10;

  const payload = rateRelease(harness.state, TARGET_ID);
  assert.equal(payload.classification, classification,
    `fixture telemetry for "${classification}" produced "${payload.classification}" `
    + `(releaseScore ${payload.releaseScore}) — update TELEMETRY_BY_CLASSIFICATION, not the assertion`);

  harness.bus.emit('tether:releaseRated', payload);
  // presentation:cue is queued (deferred) by the orchestrator; flush dispatches it to adapters.
  harness.bus.flush();
}

function particleBudgetOf(harness) {
  const cue = harness.vfxCues[harness.vfxCues.length - 1];
  return cue ? cue.particles : 0;
}

function cameraTraumaOf(harness) {
  const cue = harness.cameraShakes[harness.cameraShakes.length - 1];
  return cue ? cue.amount : 0;
}

function harnessAlertText(harness) {
  const alert = harness.alerts[harness.alerts.length - 1];
  return alert ? alert.text : null;
}
