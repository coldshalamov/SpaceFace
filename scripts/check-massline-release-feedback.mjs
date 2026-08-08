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
const MISSED_CUE_ID = 'massline.release.missed';

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
assert.ok(PRESENTATION_RECIPES[MISSED_CUE_ID], `${MISSED_CUE_ID} recipe must exist`);
assert.deepEqual(PRESENTATION_RECIPES[MISSED_CUE_ID].lanes, {
  camera: 'camera.none',
  vfx: 'vfx.none',
  audio: 'audio.none',
  ui: 'ui.massline_release_missed',
  accessibility: 'accessibility.release_missed_caption',
}, 'Missed is a bounded HUD/accessibility fact, not a physical presentation effect');
assert.deepEqual(PRESENTATION_RECIPES[MISSED_CUE_ID].budgets, {
  cameraTrauma: 0,
  particles: 0,
  lights: 0,
  voices: 0,
  uiPulses: 1,
});
assert.ok(PRESENTATION_RECIPES[MISSED_CUE_ID].importance < 0.85,
  'Missed must remain below the assertive-caption importance threshold');
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
assertMissedReleaseUsesStrictPredictionTruth();
assertMissedReleaseIgnoresToleranceAndDedupesExactReceipts();
assertMissedReleasePreservesThrowAndSelfSlingIdentity();
assertMalformedReleaseValidationFailsClosed();
assertOtherReleaseEventsNeverInventMissed();
assertMissedReleaseUsesOnlyPoliteHudAndCaptionLanes();

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

// 6. The attempted-window truth is the producer's strict frozen prediction boolean. Values that
//    happen to be falsy are not equivalent evidence and must fail closed.
function assertMissedReleaseUsesStrictPredictionTruth() {
  const strict = createHarness();
  emitReleaseValidation(strict, { prediction: { onSolution: false } });
  assert.equal(missedCues(strict).length, 1, 'strict onSolution=false should emit Missed once');

  for (const value of [true, undefined, null, 0, '', 'false', {}, []]) {
    const harness = createHarness();
    const prediction = value === undefined ? {} : { onSolution: value };
    emitReleaseValidation(harness, { prediction });
    assert.equal(missedCues(harness).length, 0,
      `onSolution=${String(value)} must not be coerced into a Missed receipt`);
    assertNoMissedOutputs(harness, `onSolution=${String(value)}`);
  }
}

// 7. withinTolerance describes next-tick trajectory divergence, not release-window timing. It may
//    vary without changing Missed. The exact release identity is also the dedupe authority.
function assertMissedReleaseIgnoresToleranceAndDedupesExactReceipts() {
  for (const withinTolerance of [true, false]) {
    const harness = createHarness();
    emitReleaseValidation(harness, {
      releaseId: `massline:throw:tolerance:${withinTolerance}`,
      prediction: { onSolution: false },
      withinTolerance,
    });
    assert.equal(missedCues(harness).length, 1,
      `withinTolerance=${withinTolerance} must not suppress a strict attempted-window miss`);
  }

  const dedupe = createHarness();
  const receipt = {
    releaseId: 'massline:throw:dedupe:1',
    prediction: { onSolution: false },
    importance: 1,
    tags: ['critical'],
    dedupeKey: 'forged:first',
  };
  emitReleaseValidation(dedupe, receipt);
  emitReleaseValidation(dedupe, { ...receipt, dedupeKey: 'forged:second' });
  assert.equal(missedCues(dedupe).length, 1, 'duplicate delivery of one releaseId must dedupe');
  assert.equal(missedCues(dedupe)[0].importance, PRESENTATION_RECIPES[MISSED_CUE_ID].importance,
    'the gameplay receipt must not promote Missed into a critical presentation cue');
  assert.deepEqual(missedCues(dedupe)[0].tags, ['massline', 'release', 'missed', 'throw'],
    'the gameplay receipt must not inject presentation-control tags');
  assert.equal(dedupe.captions[0].assertive, false,
    'injected importance must not turn the Missed caption assertive');

  emitReleaseValidation(dedupe, {
    ...receipt,
    releaseId: 'massline:throw:dedupe:2',
    dedupeKey: 'forged:first',
  });
  assert.equal(missedCues(dedupe).length, 2, 'a distinct releaseId must remain a distinct Missed fact');
}

// 8. The validated throw body is the cue target; self-sling validates the player body itself. Both
//    retain exact player causality, receipt sequence, kind tag, and polite relevance.
function assertMissedReleasePreservesThrowAndSelfSlingIdentity() {
  const throwHarness = createHarness();
  emitReleaseValidation(throwHarness, {
    releaseId: 'massline:throw:identity',
    kind: 'throw',
    entityId: TARGET_ID,
    prediction: { onSolution: false },
  });
  assertMissedCueIdentity(throwHarness, {
    releaseId: 'massline:throw:identity', kind: 'throw', targetId: TARGET_ID,
  });

  const selfSling = createHarness();
  emitReleaseValidation(selfSling, {
    releaseId: 'massline:self-sling:identity',
    kind: 'self-sling',
    entityId: PLAYER_ID,
    prediction: { onSolution: false },
  });
  assertMissedCueIdentity(selfSling, {
    releaseId: 'massline:self-sling:identity', kind: 'self-sling', targetId: PLAYER_ID,
  });
}

// 9. Only the real versioned validation receipt can create Missed. Missing/dead/mismatched actors,
//    invalid kinds, and empty sequence identities all fail before presentation dedupe or lane use.
function assertMalformedReleaseValidationFailsClosed() {
  const cases = [
    ['bad schema', { schema: 'spaceface.masslineReleaseValidation.v0' }],
    ['missing schema', { schema: undefined }],
    ['empty release id', { releaseId: '' }],
    ['whitespace release id', { releaseId: '   ' }],
    ['non-string release id', { releaseId: 47 }],
    ['bad kind', { kind: 'release' }],
    ['missing entity', { entityId: 999 }],
    ['self-sling targets another body', { kind: 'self-sling', entityId: TARGET_ID }],
    ['throw targets the player', { kind: 'throw', entityId: PLAYER_ID }],
  ];
  for (const [label, overrides] of cases) {
    const harness = createHarness();
    emitReleaseValidation(harness, overrides);
    assert.equal(missedCues(harness).length, 0, `${label} must fail closed`);
    assertNoMissedOutputs(harness, label);
  }

  for (const [label, mutate] of [
    ['missing player entity', (h) => h.state.entities.delete(PLAYER_ID)],
    ['dead player entity', (h) => { h.state.entities.get(PLAYER_ID).alive = false; }],
    ['dead target entity', (h) => { h.state.entities.get(TARGET_ID).alive = false; }],
    ['unknown player liveness', (h) => { delete h.state.entities.get(PLAYER_ID).alive; }],
    ['unknown target liveness', (h) => { delete h.state.entities.get(TARGET_ID).alive; }],
    ['mismatched player identity', (h) => { h.state.entities.get(PLAYER_ID).id = 91; }],
    ['mismatched target identity', (h) => { h.state.entities.get(TARGET_ID).id = 92; }],
    ['missing player id', (h) => { h.state.playerId = null; }],
  ]) {
    const harness = createHarness();
    mutate(harness);
    emitReleaseValidation(harness);
    assert.equal(missedCues(harness).length, 0, `${label} must fail closed`);
    assertNoMissedOutputs(harness, label);
  }
}

// 10. Ordinary rating and break events keep their established behavior, but never synthesize the
//     attempted-window Missed cue.
function assertOtherReleaseEventsNeverInventMissed() {
  const harness = createHarness();
  emitRelease(harness, 'messy');
  emitRelease(harness, 'clean');
  harness.bus.emit('tether:broken', {
    reason: 'physics_break', actorId: PLAYER_ID, targetId: TARGET_ID, tension: 1,
  });
  harness.bus.flush();
  assert.equal(missedCues(harness).length, 0,
    'releaseRated and tether:broken must not manufacture massline.release.missed');
}

// 11. Missed is intentionally calm and nonphysical in both default and reduced modes: one bounded
//     HUD pulse, one polite caption, and zero camera/VFX/audio output.
function assertMissedReleaseUsesOnlyPoliteHudAndCaptionLanes() {
  for (const settings of [
    { motionReduce: false, flashReduce: false },
    { motionReduce: true, flashReduce: true },
  ]) {
    const harness = createHarness(settings);
    emitReleaseValidation(harness, {
      releaseId: `massline:throw:lanes:${settings.motionReduce}`,
      prediction: { onSolution: false },
    });
    assert.equal(harness.alerts.length, 1, 'Missed should emit exactly one bounded HUD alert');
    assert.equal(harness.alerts[0].text, 'MISSED WINDOW');
    assert.equal(harness.alerts[0].shape, 'arc');
    assert.equal(harness.captions.length, 1, 'Missed should emit exactly one accessibility caption');
    assert.equal(harness.captions[0].text, 'Massline release window missed.');
    assert.equal(harness.captions[0].assertive, false, 'Missed caption must remain polite');
    assert.equal(harness.cameraShakes.length, 0, 'Missed must not shake the camera');
    assert.equal(harness.vfxCues.length, 0, 'Missed must not emit presentation VFX');
    assert.equal(harness.audioCues.length, 0, 'Missed must not emit audio');
  }
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
      [PLAYER_ID, { id: PLAYER_ID, alive: true, pos: { x: 0, z: 0 } }],
      [TARGET_ID, { id: TARGET_ID, alive: true, pos: { x: targetDistance, z: 0 } }],
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
    cues: [], cueEvents: [], alerts: [], audioCues: [], vfxCues: [], cameraShakes: [], captions: [],
  };
  bus.on('presentation:cue', (p) => {
    harness.cues.push(p.id);
    harness.cueEvents.push(p);
  });
  bus.on('alert', (p) => harness.alerts.push(p));
  bus.on('audio:cue', (p) => harness.audioCues.push(p));
  bus.on('presentation:vfxCue', (p) => harness.vfxCues.push(p));
  bus.on('camera:shake', (p) => harness.cameraShakes.push(p));
  bus.on('presentation:caption', (p) => harness.captions.push(p));
  return harness;
}

function emitReleaseValidation(harness, overrides = {}) {
  harness.state.tick += 1;
  harness.bus.emit('massline:releaseValidated', {
    schema: 'spaceface.masslineReleaseValidation.v1',
    releaseId: 'massline:throw:validation:1',
    kind: 'throw',
    entityId: TARGET_ID,
    releaseTick: harness.state.tick - 1,
    validatedTick: harness.state.tick,
    prediction: { onSolution: false },
    withinTolerance: true,
    ...overrides,
  });
  harness.bus.flush();
}

function missedCues(harness) {
  return harness.cueEvents.filter((cue) => cue.id === MISSED_CUE_ID);
}

function assertMissedCueIdentity(harness, { releaseId, kind, targetId }) {
  const cues = missedCues(harness);
  assert.equal(cues.length, 1, `${kind} should emit exactly one Missed cue`);
  const cue = cues[0];
  assert.equal(cue.sourceEvent, 'massline:releaseValidated');
  assert.equal(cue.sourceId, PLAYER_ID);
  assert.equal(cue.targetId, targetId);
  assert.equal(cue.sequence, releaseId);
  assert.equal(cue.subsystemId, kind);
  assert.equal(cue.material, 'massline');
  assert.equal(cue.playerRelevance, 0.88);
  assert.deepEqual(cue.tags, ['massline', 'release', 'missed', kind]);
}

function assertNoMissedOutputs(harness, label) {
  const missedAlerts = harness.alerts.filter((event) => event.cueId === MISSED_CUE_ID);
  const missedCaptions = harness.captions.filter((event) => event.id === MISSED_CUE_ID);
  assert.equal(missedAlerts.length, 0, `${label} must not emit a Missed HUD alert`);
  assert.equal(missedCaptions.length, 0, `${label} must not emit a Missed caption`);
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
