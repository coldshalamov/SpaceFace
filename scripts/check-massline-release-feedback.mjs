// Prompt 03 acceptance check: tether:releaseRated produces tiered player-facing feedback through
// the existing presentation pipeline (presentationOrchestrator -> presentation:cue ->
// presentationAdapters -> alert/audio:cue/presentation:vfxCue/camera:shake/presentation:caption).
//
// We instantiate the real orchestrator + adapters against an in-memory bus and state, so the test
// exercises the actual emit/subscribe wiring rather than a parallel mock.
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';
import { PRESENTATION_RECIPES, validatePresentationRecipes } from '../src/presentation/cueRecipes.js';

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

await assertMessyReleaseEmitsNoPremiumFeedback();
await assertCleanReleaseEmitsAtLeastOnePlayerFacingCue();
await assertRazorReleaseStrongerThanGood();
await assertReducedMotionAndFlashDoNotCrashAndSuppressMotion();

console.log('Massline release feedback checks OK');

// 1. "messy" release does not emit premium feedback.
async function assertMessyReleaseEmitsNoPremiumFeedback() {
  const harness = createHarness();

  emitRelease(harness, { classification: 'messy', releaseScore: 0.1 });

  assert.equal(harness.cues.length, 0, 'messy release must not emit a presentation:cue');
  assert.equal(harness.alerts.length, 0, 'messy release must not emit a UI alert');
  assert.equal(harness.audioCues.length, 0, 'messy release must not emit audio:cue');
  assert.equal(harness.vfxCues.length, 0, 'messy release must not emit a vfx cue');
  assert.equal(harness.cameraShakes.length, 0, 'messy release must not shake the camera');
}

// 2. "clean" release emits at least one player-facing cue.
async function assertCleanReleaseEmitsAtLeastOnePlayerFacingCue() {
  const harness = createHarness();

  emitRelease(harness, { classification: 'clean', releaseScore: 0.75 });

  assert.equal(harness.cues.length, 1, 'clean release should emit exactly one presentation:cue');
  assert.equal(harness.cues[0], 'tether.release.clean', 'clean release should map to tether.release.clean');

  const playerFacing = harness.alerts.length + harness.audioCues.length + harness.vfxCues.length + harness.captions.length;
  assert.ok(playerFacing >= 1,
    `clean release should emit at least one player-facing cue; got alerts=${harness.alerts.length} audio=${harness.audioCues.length} vfx=${harness.vfxCues.length} captions=${harness.captions.length}`);
  assert.equal(harness.alerts.length, 1, 'clean release should emit exactly one UI alert (no double-toast)');
}

// 3. "razor" release emits a stronger/different cue than "good".
async function assertRazorReleaseStrongerThanGood() {
  const good = createHarness();
  emitRelease(good, { classification: 'good', releaseScore: 0.5 });

  const razor = createHarness();
  emitRelease(razor, { classification: 'razor', releaseScore: 0.9 });

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

// 4. Reduced-motion/reduced-flash settings do not crash and suppress any motion-heavy cue if such
//    a cue exists. The motion-heavy cue here is camera shake (and particle VFX); under motionReduce
//    the camera trauma is dampened and under flashReduce the particle count is reduced.
async function assertReducedMotionAndFlashDoNotCrashAndSuppressMotion() {
  const baseline = createHarness({ motionReduce: false, flashReduce: false });
  emitRelease(baseline, { classification: 'razor', releaseScore: 0.9 });
  const baselineTrauma = cameraTraumaOf(baseline);
  const baselineParticles = particleBudgetOf(baseline);
  assert.ok(baselineTrauma > 0, 'razor release should shake the camera at default settings');

  // Must not throw with accessibility flags on.
  const reduced = createHarness({ motionReduce: true, flashReduce: true });
  assert.doesNotThrow(() => emitRelease(reduced, { classification: 'razor', releaseScore: 0.9 }));

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

function createHarness({ motionReduce = false, flashReduce = false } = {}) {
  const bus = createBus();
  const state = {
    tick: 1,
    simTime: 1 / 60,
    playerId: 1,
    entities: new Map([
      [1, { id: 1, pos: { x: 0, z: 0 } }],
      [2, { id: 2, pos: { x: 100, z: 0 } }],
    ]),
    settings: {
      video: { motionReduce },
      accessibility: { flashReduce },
    },
  };
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

function emitRelease(harness, overrides) {
  // Advance the tick each call so dedupe windows don't suppress back-to-back releases in tests
  // that compare good vs razor across separate harnesses (each harness is fresh, but we keep the
  // habit defensive).
  harness.state.tick += 10;
  const payload = {
    targetId: 2,
    classification: 'good',
    releaseScore: 0.5,
    radialSpeed: 5,
    tangentialSpeed: 50,
    angularSpeed: 0.5,
    strain: 0.5,
    distance: 100,
    restLength: 100,
    playerSpeed: 90,
    maxStrainSinceLatch: 0.5,
    maxTangentialSpeedSinceLatch: 50,
    maxAngularSpeedSinceLatch: 0.5,
    ...overrides,
  };
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
