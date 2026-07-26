import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import {
  CRITICAL_SLICE_EVENT_IDS,
  PRESENTATION_EVENT_SCHEMA,
  PRESENTATION_EVENT_VERSION,
  normalizePresentationEvent,
  presentationDedupeKey,
  validatePresentationEvent,
} from '../src/presentation/cueSchema.js';
import {
  PRESENTATION_RECIPES,
  getPresentationRecipe,
  validatePresentationRecipes,
} from '../src/presentation/cueRecipes.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';
import { AUDIO_RECIPE_BY_ID, alertCueOwnsAudio, resolveAudioCueRecipeId } from '../src/audio/audioSystem.js';
import { createBus } from '../src/core/eventBus.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const checkedSources = [
  'src/presentation/cueSchema.js',
  'src/presentation/cueRecipes.js',
  'src/systems/presentationOrchestrator.js',
  'src/systems/presentationAdapters.js',
];

for (const rel of checkedSources) {
  const source = readFileSync(resolve(ROOT, rel), 'utf8');
  for (const forbidden of ['document.', 'window.', 'THREE.', 'Date.now', 'Math.random']) {
    assert(!source.includes(forbidden), `${rel} must stay headless/deterministic: ${forbidden}`);
  }
}

assert.equal(PRESENTATION_EVENT_VERSION, 1, 'presentation event version should be pinned');
assert.equal(PRESENTATION_EVENT_SCHEMA.$id, 'spaceface.presentation-event.v1', 'schema id should be versioned');
assert.deepEqual(CRITICAL_SLICE_EVENT_IDS, [
  'tether.attach',
  'tether.near_break',
  'tether.break',
  'shield.collapse',
  'subsystem.disabled',
], 'critical slice event ids should stay declared');

const recipeReport = validatePresentationRecipes();
assert(recipeReport.ok, recipeReport.issues.join('\n'));

const scenario = JSON.parse(readFileSync(resolve(ROOT, 'src/data/scenarios/47a.scenario.json'), 'utf8'));
for (const cueId of scenario.presentationEventIds) {
  assert(getPresentationRecipe(cueId), `47-A cue ${cueId} must resolve to an SG-08 presentation recipe`);
}
for (const cueId of CRITICAL_SLICE_EVENT_IDS) {
  const recipe = PRESENTATION_RECIPES[cueId];
  assert(recipe, `critical cue ${cueId} must have a presentation recipe`);
  for (const lane of ['camera', 'vfx', 'audio', 'ui', 'accessibility']) {
    assert(recipe.lanes[lane], `${cueId} recipe must declare ${lane} lane`);
  }
}

const state = {
  playerId: 1,
  simTime: 12.5,
  entities: new Map([
    [1, { id: 1, pos: { x: 10, y: 0, z: -5 } }],
    [2, { id: 2, pos: { x: 110, y: 0, z: -5 } }],
  ]),
};

const normalized = normalizePresentationEvent({
  id: 'tether.attach',
  sourceId: 1,
  targetId: 2,
  material: 'massline',
  magnitude: 3,
  tags: ['slice', 'slice', 'tether'],
}, state, 13000);

assert.equal(normalized.version, 1, 'normalized event should carry schema version');
assert.equal(normalized.id, 'tether.attach', 'event id should be preserved');
assert.equal(normalized.position.x, 110, 'target entity position should be inferred');
assert.equal(normalized.distance, 100, 'distance from player should be inferred');
assert.equal(normalized.direction.x, 1, 'direction from player to target should be normalized');
assert.equal(normalized.playerRelevance, 0.88, 'player source should produce high relevance');
assert.deepEqual(normalized.tags, ['slice', 'tether'], 'tags should be deduplicated in order');
assert.equal(normalized.simTimeMs, 12500, 'sim time should become milliseconds');
assert.equal(normalized.presentationTimeMs, 13000, 'presentation timestamp should be normalized');
assert.equal(
  normalized.dedupeKey,
  presentationDedupeKey(normalized),
  'dedupe key should be stable after normalization',
);

assert.equal(validatePresentationEvent({ id: 'bad' }).ok, false, 'undotted ids should be rejected');
assert.equal(
  validatePresentationEvent({ id: 'tether.break', direction: { x: 0, z: 0 } }).ok,
  false,
  'zero direction should be rejected',
);
assert.throws(
  () => normalizePresentationEvent({ id: 'bad' }, state),
  /Invalid presentation event/,
  'normalization should throw on invalid events',
);

const cueRecords = [];
const suppressedRecords = [];
const appliedRecords = [];
const cameraRecords = [];
const vfxRecords = [];
const audioRecords = [];
const uiRecords = [];
const alertRecords = [];
const captionRecords = [];
const bus = createBus();
const runtimeState = {
  playerId: 1,
  tick: 12,
  simTime: 0.2,
  settings: {
    video: { motionReduce: false },
    accessibility: { flashReduce: false, highContrast: false },
  },
  entities: new Map([
    [1, { id: 1, pos: { x: 0, y: 0, z: 0 } }],
    [2, { id: 2, pos: { x: 90, y: 0, z: 0 } }],
    [3, { id: 3, pos: { x: -40, y: 0, z: 20 } }],
  ]),
  scenario: {
    actorBindings: {
      evidence_spindle_47a: { status: 'bound', entityId: 2 },
      official_recovery_tug: { status: 'bound', entityId: 3 },
    },
  },
};
bus.on('presentation:cue', (payload) => cueRecords.push(payload));
bus.on('presentation:cueSuppressed', (payload) => suppressedRecords.push(payload));
bus.on('presentation:cueApplied', (payload) => appliedRecords.push(payload));
bus.on('presentation:cameraCue', (payload) => cameraRecords.push(payload));
bus.on('presentation:vfxCue', (payload) => vfxRecords.push(payload));
bus.on('presentation:audioCue', (payload) => audioRecords.push(payload));
bus.on('presentation:uiCue', (payload) => uiRecords.push(payload));
bus.on('alert', (payload) => alertRecords.push(payload));
bus.on('presentation:caption', (payload) => captionRecords.push(payload));
presentationOrchestrator.init({ state: runtimeState, bus });
presentationAdapters.init({ state: runtimeState, bus });

bus.emit('scenario:beatEntered', {
  scenarioId: 'scenario.47a.mass-discrepancy',
  beatId: 'drop_wreck_field',
  presentationEventIds: ['scenario.signal.pulse', 'tether.attach'],
});
bus.flush();
assert.equal(cueRecords.length, 1, 'scenario beat should emit only scenario-owned cue ids');
assert.equal(cueRecords[0].id, 'scenario.signal.pulse', 'scenario signal cue should route through SG-08');
assert.equal(cueRecords[0].targetId, 2, 'scenario signal cue should bind to the evidence spindle actor');
assert.equal(cueRecords[0].lanes.camera, 'camera.threat_composition', 'cue should carry camera lane recipe');
assert.equal(appliedRecords.length, 1, 'presentation adapter should consume the scenario cue');
assert.equal(audioRecords.at(-1).id, 'presentation.scenario.signal', 'scenario cue should route to semantic audio');
assert.equal(alertRecords.at(-1).text, 'UNREGISTERED SIGNAL', 'scenario cue should route to UI alert copy');
assert.equal(captionRecords.at(-1).shape, 'pulse', 'scenario cue should carry a non-color accessibility shape');
assert.equal(alertRecords.at(-1).audioOwnedByPresentation, true, 'scenario UI mirror must not add a generic alert voice');
assert.equal(alertCueOwnsAudio(alertRecords.at(-1)), false, 'scenario signal must own one audible floor');

bus.emit('tether:attached', { actorId: 1, targetId: 2, attachmentId: 'att_1', restLength: 90 });
bus.flush();
assert.equal(cueRecords.length, 2, 'tether attach should emit a presentation cue');
assert.equal(cueRecords[1].id, 'tether.attach', 'tether attach should map to the semantic cue id');
assert.equal(cueRecords[1].material, 'massline', 'tether attach cue should carry Massline material');
assert.equal(appliedRecords.length, 2, 'presentation adapter should consume the tether cue');
assert.equal(cameraRecords.at(-1).amount, 0.12, 'tether attach should route camera trauma from the recipe budget');
assert.equal(audioRecords.at(-1).id, 'presentation.tether.attach', 'tether attach should route to a semantic audio cue');
assert.equal(uiRecords.at(-1).shape, 'arc', 'tether attach UI cue should use shape coding');
assert.equal(captionRecords.at(-1).text, 'Massline attached.', 'tether attach should route an accessibility caption');
assert.deepEqual(appliedRecords.at(-1).outputs.camera,
  { event: 'camera:shake', amount: 0.12, reducedMotion: false },
  'applied record should summarize the concrete camera output');

bus.emit('tether:attached', { actorId: 1, targetId: 2, attachmentId: 'att_1', restLength: 90 });
bus.flush();
assert.equal(cueRecords.length, 2, 'duplicate tether attach in the dedupe window should be suppressed');
assert.equal(suppressedRecords[0].reason, 'dedupe_window', 'suppressed duplicate should name the dedupe reason');
assert.equal(appliedRecords.length, 2, 'suppressed cues should not run presentation adapters');

runtimeState.tick += 10;
runtimeState.simTime += 0.166667;
bus.emit('combat:damage', { attackerId: 3, targetId: 1, brokeShield: true, applied: 22, type: 'thermal' });
bus.flush();
assert.equal(cueRecords.at(-1).id, 'shield.collapse', 'shield breaks should route to shield.collapse');
assert.equal(cueRecords.at(-1).playerRelevance, 1, 'shield collapse against player should be maximally relevant');
assert.equal(audioRecords.at(-1).id, 'presentation.shield.collapse', 'shield collapse should route audio');
assert.equal(alertRecords.at(-1).sev, 'danger', 'shield collapse should route danger UI');
assert.equal(captionRecords.at(-1).assertive, true, 'player-relevant shield collapse should be assertive');

runtimeState.tick += 2;
runtimeState.simTime += 0.033333;
// The real emitter always attributes the hit — src/combat/subsystems.js:73 sends `attackerId` from
// runtime.transitionAttackerId — so the realistic case for a HUD readout is "the PLAYER disabled that
// ship's drive", which is the payoff of a deliberate disabling shot. Omitting the attacker here made
// this fixture an unattributed disable on a distant NPC, which is precisely the case that must NOT
// raise a player-facing banner. Both cases are now covered: this one, and the negative below.
bus.emit('combat:subsystemDisabled', { attackerId: 1, targetId: 3, subsystemId: 'subsystem_drive', cueId: 'combat.subsystem.drive.disabled' });
bus.flush();
assert.equal(cueRecords.at(-1).id, 'subsystem.disabled', 'subsystem disable event should route to SG-08');
assert.equal(cueRecords.at(-1).subsystemId, 'subsystem_drive', 'subsystem cue should preserve subsystem id');
assert.equal(vfxRecords.at(-1).lane, 'vfx.subsystem_sparks', 'subsystem disable should route VFX lane evidence');
assert.equal(audioRecords.at(-1).id, 'presentation.subsystem.drive_disabled', 'drive disable needs its mechanical rundown identity');
assert.deepEqual(audioRecords.at(-1).position, { x: -40, y: 0, z: 20 }, 'subsystem failure must stay spatially attached to the disabled ship');
assert.equal(audioRecords.at(-1).duck, false, 'a routine subsystem failure must not duck music');
assert.equal(alertRecords.at(-1).audioOwnedByPresentation, true, 'subsystem UI must declare the semantic sound owner');
assert.equal(alertCueOwnsAudio(alertRecords.at(-1)), false, 'the UI alert must not spawn a duplicate generic warning voice');
assert.equal(getPresentationRecipe('subsystem.disabled').budgets.voices, 1, 'subsystem failure owns one voice');
const subsystemRecipeIds = [
  'presentation.subsystem.drive_disabled',
  'presentation.subsystem.sensor_disabled',
  'presentation.subsystem.weapon_disabled',
].map(resolveAudioCueRecipeId);
assert.equal(new Set(subsystemRecipeIds).size, 3, 'drive, sensor, and weapon failures need distinct signatures');
for (const recipeId of subsystemRecipeIds) assert(AUDIO_RECIPE_BY_ID[recipeId], `${recipeId} must be authored`);

// --- lane audience split (GDD 2.0 pillar 3) ---------------------------------------------------
// An entity-scoped combat event that the player neither caused nor suffered must not reach the
// PLAYER-scoped lanes. Before this was enforced, any NPC's shield breaking anywhere in the sector
// raised a red "SHIELDS COLLAPSED" banner, spoke the caption, and kicked the player's camera — which
// trains players to ignore the HUD's highest-severity channel. The world-scoped lanes still fire, so
// the event stays visible and audible where it actually happened.
runtimeState.tick += 60;
runtimeState.simTime += 1;
const uiBefore = alertRecords.length;
const captionBefore = captionRecords.length;
const cameraBefore = cameraRecords.length;
const vfxBefore = vfxRecords.length;
const audioBefore = audioRecords.length;
// NPC 3 breaks NPC 2's shield. Player is 1 and is neither attacker nor target.
bus.emit('combat:damage', { attackerId: 3, targetId: 2, brokeShield: true, applied: 22, type: 'thermal' });
bus.flush();
assert.equal(cueRecords.at(-1).id, 'shield.collapse', 'an NPC-on-NPC shield break still produces the cue');
assert(cueRecords.at(-1).playerRelevance < 0.8,
  `NPC-on-NPC shield break should score below the player-lane floor (got ${cueRecords.at(-1).playerRelevance})`);
assert.equal(alertRecords.length, uiBefore, 'NPC-on-NPC shield break must not raise a player HUD alert');
assert.equal(captionRecords.length, captionBefore, 'NPC-on-NPC shield break must not speak a player caption');
assert.equal(cameraRecords.length, cameraBefore, 'NPC-on-NPC shield break must not shake the player camera');
assert(vfxRecords.length > vfxBefore, 'the world-scoped VFX lane must still fire at the NPC');
assert(audioRecords.length > audioBefore, 'the world-scoped audio lane must still fire at the NPC');

runtimeState.tick += 20;
runtimeState.simTime += 0.333333;
runtimeState.settings.video.motionReduce = true;
runtimeState.settings.accessibility.flashReduce = true;
bus.emit('tether:broken', { actorId: 1, targetId: 2, attachmentId: 'att_2', tension: 9, impulse: 5 });
bus.flush();
assert.equal(cueRecords.at(-1).id, 'tether.break', 'tether break should route through SG-08');
assert.equal(cameraRecords.at(-1).amount, 0.055, 'reduced motion should scale camera trauma down');
assert.equal(cameraRecords.at(-1).reducedMotion, true, 'camera cue should record reduced-motion transform');
assert.equal(vfxRecords.at(-1).particles, 48, 'reduced flashing should halve tether break particle budget');
assert.equal(vfxRecords.at(-1).lights, 0, 'reduced flashing should suppress event lights');
assert.equal(captionRecords.at(-1).flashReduced, true, 'caption evidence should record flash reduction');

const inspect = presentationOrchestrator.inspect();
// 6, not 5: the NPC-on-NPC shield break added above is emitted by the orchestrator like any other
// cue. The audience split lives in the ADAPTER, so a world-scoped cue is still emitted and still
// applied — it simply reaches fewer lanes. That is why `applied` below tracks `emitted`.
assert.equal(inspect.emitted, 6, 'orchestrator inspect should count emitted cues');
assert.equal(inspect.suppressed, 1, 'orchestrator inspect should count suppressed cues');
const adapterInspect = presentationAdapters.inspect();
assert.equal(adapterInspect.applied, 6, 'adapter inspect should count applied cues');
assert.deepEqual(adapterInspect.lastApplied.outputLanes,
  ['accessibility', 'audio', 'camera', 'ui', 'vfx'],
  'adapter inspect should summarize all output lanes');
presentationAdapters.dispose();
presentationOrchestrator.dispose();

// Long campaigns continually introduce new source/target/sequence ids. Exercise
// the real suppression/record path at production scale and pin every boundary
// that can otherwise turn pruning into a cue-timing or long-session regression.
function makeRetentionOrchestrator(tick = 0) {
  const orchestrator = Object.create(presentationOrchestrator);
  Object.assign(orchestrator, {
    state: { tick },
    _lastByDedupeKey: new Map(),
    _nextDedupeSweepTick: 0,
    _lastDedupeTick: -Infinity,
    _dedupeKeysPruned: 0,
    _dedupeSweepCount: 0,
    _dedupeSweepScanned: 0,
    _dedupeSweepMaxEntries: 0,
    _dedupePeakKeys: 0,
    _laneCounts: {},
    _laneTick: -1,
    _emitted: 0,
    _suppressed: 0,
    _lastCue: null,
  });
  return orchestrator;
}

function attemptCue(orchestrator, event, recipe) {
  const reason = orchestrator._suppressionReason(event, recipe);
  if (reason == null) orchestrator._recordEmission(event, recipe);
  return reason;
}

const zeroWindowRecipe = { dedupeWindowTicks: 0, lanes: {} };
const authoredWindowRecipe = { dedupeWindowTicks: 30, lanes: {} };
const edgeOrchestrator = makeRetentionOrchestrator(100);
const zeroWindowEvent = {
  id: 'combat.damage.applied',
  dedupeKey: 'combat.damage.applied|pirate_1|player',
  sourceEvent: 'combat:damage',
};
assert.equal(attemptCue(edgeOrchestrator, zeroWindowEvent, zeroWindowRecipe), null,
  'zero-window cues must emit on first observation');
assert.equal(attemptCue(edgeOrchestrator, zeroWindowEvent, zeroWindowRecipe), null,
  'zero-window cues must remain unsuppressed on the same tick');

const authoredWindowEvent = {
  id: 'tether.attach',
  dedupeKey: 'tether.attach|player|rock_1',
  sourceEvent: 'tether:attached',
};
assert.equal(attemptCue(edgeOrchestrator, authoredWindowEvent, authoredWindowRecipe), null);
assert.equal(attemptCue(edgeOrchestrator, authoredWindowEvent, authoredWindowRecipe), 'dedupe_window',
  'positive authored windows must suppress repeats on the same tick');
edgeOrchestrator.state.tick = 129;
assert.equal(attemptCue(edgeOrchestrator, authoredWindowEvent, authoredWindowRecipe), 'dedupe_window',
  'positive authored windows must suppress through the final inside-window tick');
edgeOrchestrator.state.tick = 130;
assert.equal(attemptCue(edgeOrchestrator, authoredWindowEvent, authoredWindowRecipe), null,
  'a cue must become eligible at the exact authored expiry tick');

const rewindOrchestrator = makeRetentionOrchestrator(1_000);
assert.equal(attemptCue(rewindOrchestrator, authoredWindowEvent, authoredWindowRecipe), null);
rewindOrchestrator.state.tick = 900;
assert.equal(attemptCue(rewindOrchestrator, authoredWindowEvent, authoredWindowRecipe), null,
  'a tick rewind must discard future dedupe records instead of suppressing indefinitely');
assert(rewindOrchestrator.inspect().dedupeKeysPruned >= 1,
  'tick rewind must reclaim future-timeline dedupe records');

const boundaryOrchestrator = makeRetentionOrchestrator(2 ** 31 - 4);
const boundaryEvent = {
  id: 'travel.jump.committed',
  dedupeKey: 'travel.jump.committed|helios|tethys',
  sourceEvent: 'jump:start',
};
assert.equal(attemptCue(boundaryOrchestrator, boundaryEvent, authoredWindowRecipe), null);
boundaryOrchestrator.state.tick = 2 ** 31 + 4;
assert.equal(attemptCue(boundaryOrchestrator, boundaryEvent, authoredWindowRecipe), 'dedupe_window',
  'dedupe windows must remain ordered across the signed 32-bit boundary');
boundaryOrchestrator.state.tick = 2 ** 31 + 26;
assert.equal(attemptCue(boundaryOrchestrator, boundaryEvent, authoredWindowRecipe), null,
  'exact expiry must remain correct across the signed 32-bit boundary');
boundaryOrchestrator.state.tick = 2 ** 31 + 100.75;
assert.equal(attemptCue(boundaryOrchestrator, {
  ...boundaryEvent,
  dedupeKey: `${boundaryEvent.dedupeKey}|fractional`,
}, authoredWindowRecipe), null);
assert.equal(boundaryOrchestrator.inspect().lastCue.tick, 2 ** 31 + 100,
  'presentation ticks must use Math.trunc semantics without signed 32-bit wrap');

const resetBus = createBus();
const resetOrchestrator = Object.create(presentationOrchestrator);
const resetState = { tick: 50 };
resetOrchestrator.init({ state: resetState, bus: resetBus });
assert.equal(attemptCue(resetOrchestrator, authoredWindowEvent, authoredWindowRecipe), null);
resetBus.emit('save:loaded');
resetBus.flush();
assert.equal(resetOrchestrator.inspect().activeDedupeKeys, 0,
  'save load must reset dedupe state');
assert.equal(attemptCue(resetOrchestrator, authoredWindowEvent, authoredWindowRecipe), null,
  'a loaded timeline must not inherit prior suppression');
resetBus.emit('game:new');
resetBus.flush();
assert.equal(resetOrchestrator.inspect().activeDedupeKeys, 0,
  'new game must reset dedupe state');
resetOrchestrator.dispose();

const stressOrchestrator = makeRetentionOrchestrator();
const uniqueEventCount = 200_000;
const stressStartedAt = performance.now();
for (let tick = 0; tick < uniqueEventCount; tick++) {
  stressOrchestrator.state.tick = tick;
  assert.equal(attemptCue(stressOrchestrator, {
    id: 'combat.damage.applied',
    dedupeKey: `combat.damage.applied|npc_${tick}|target_${tick}`,
    sourceEvent: 'combat:damage',
  }, authoredWindowRecipe), null);
}
const stressElapsedMs = performance.now() - stressStartedAt;
const stressInspect = stressOrchestrator.inspect();
const retentionBound = 60 + authoredWindowRecipe.dedupeWindowTicks;
assert(stressInspect.activeDedupeKeys <= retentionBound,
  '200k unique identities must retain only the sweep interval plus active authored window');
assert(stressInspect.dedupePeakKeys <= retentionBound,
  'peak retained key allocation must stay bounded by sweep cadence plus authored window');
assert(stressInspect.dedupeSweepMaxEntries <= retentionBound,
  'each sweep must inspect only a bounded sweep-cadence window');
assert(stressInspect.dedupeSweepScanned <= uniqueEventCount * 2,
  'aggregate sweep work must stay linear in emitted cues with a small constant factor');
assert(stressInspect.dedupeSweepCount <= Math.ceil(uniqueEventCount / 60) + 1,
  'sweeps must run at most once per simulated second');
assert(stressInspect.dedupeKeysPruned >= uniqueEventCount - retentionBound,
  'expired identities must be reclaimed across the full 200k stress');

// The 47-A information chain must teach five meanings with five finite identities, one voice each.
const narrativeBus = createBus();
const narrativeAudio = [];
const narrativeAlerts = [];
const narrativeState = {
  playerId: 1,
  tick: 90,
  simTime: 1.5,
  settings: runtimeState.settings,
  entities: runtimeState.entities,
};
narrativeBus.on('presentation:audioCue', (payload) => narrativeAudio.push(payload));
narrativeBus.on('alert', (payload) => narrativeAlerts.push(payload));
presentationAdapters.init({ state: narrativeState, bus: narrativeBus });
const narrativeCueIds = [
  'scenario.signal.pulse',
  'scenario.comms.kessler',
  'scenario.comms.denial',
  'scenario.objective.priority_split',
  'scenario.branch.resolved',
];
for (const [index, cueId] of narrativeCueIds.entries()) {
  const recipe = getPresentationRecipe(cueId);
  narrativeState.tick++;
  narrativeBus.emit('presentation:cue', {
    id: cueId,
    sourceEvent: `test:${cueId}`,
    sourceId: 'scenario.47a',
    targetId: 2,
    position: { x: 90, y: 0, z: 0 },
    importance: recipe.importance,
    playerRelevance: 1,
    material: recipe.material,
    lanes: { ...recipe.lanes },
    budgets: { ...recipe.budgets },
    tags: [...recipe.tags],
    simTimeMs: 1500 + index * 20,
    presentationTimeMs: 1500 + index * 20,
  });
  narrativeBus.flush();
}
assert.deepEqual(narrativeAudio.map((cue) => cue.id), [
  'presentation.scenario.signal',
  'presentation.comms.kessler',
  'presentation.comms.denial',
  'presentation.objective.split',
  'presentation.branch.resolved',
], '47-A information beats need distinct semantic audio identities');
assert.deepEqual(narrativeAudio.map((cue) => cue.duck), [false, true, true, false, false],
  'only actual comms should briefly own the music bed');
assert.equal(new Set(narrativeAudio.map((cue) => resolveAudioCueRecipeId(cue.id))).size, 5,
  '47-A information meanings must resolve to five distinct recipes');
assert(narrativeAudio.filter((cue) => cue.cueId.startsWith('scenario.comms.')).every((cue) => cue.position === null),
  'radio signatures must be non-spatial');
assert(narrativeAudio.filter((cue) => !cue.cueId.startsWith('scenario.comms.')).every((cue) => cue.position && cue.position.x === 90),
  'signal, objective, and branch cues must stay spatially truthful');
assert(narrativeAlerts.every((alert) => !alertCueOwnsAudio(alert)), 'scenario UI mirrors must remain silent');
assert(narrativeCueIds.every((cueId) => getPresentationRecipe(cueId).budgets.voices === 1),
  'each 47-A information beat owns exactly one voice');
presentationAdapters.dispose();

console.log(`Presentation cue schema checks OK; dedupeStress=${uniqueEventCount}`
  + ` active=${stressInspect.activeDedupeKeys} peak=${stressInspect.dedupePeakKeys}`
  + ` sweeps=${stressInspect.dedupeSweepCount} scanned=${stressInspect.dedupeSweepScanned}`
  + ` pruned=${stressInspect.dedupeKeysPruned} elapsedMs=${stressElapsedMs.toFixed(1)}`);
