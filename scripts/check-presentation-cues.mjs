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
import { createBus } from '../src/core/eventBus.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const checkedSources = [
  'src/presentation/cueSchema.js',
  'src/presentation/cueRecipes.js',
  'src/systems/presentationOrchestrator.js',
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
const bus = createBus();
const runtimeState = {
  playerId: 1,
  tick: 12,
  simTime: 0.2,
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
presentationOrchestrator.init({ state: runtimeState, bus });

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

bus.emit('tether:attached', { actorId: 1, targetId: 2, attachmentId: 'att_1', restLength: 90 });
bus.flush();
assert.equal(cueRecords.length, 2, 'tether attach should emit a presentation cue');
assert.equal(cueRecords[1].id, 'tether.attach', 'tether attach should map to the semantic cue id');
assert.equal(cueRecords[1].material, 'massline', 'tether attach cue should carry Massline material');

bus.emit('tether:attached', { actorId: 1, targetId: 2, attachmentId: 'att_1', restLength: 90 });
bus.flush();
assert.equal(cueRecords.length, 2, 'duplicate tether attach in the dedupe window should be suppressed');
assert.equal(suppressedRecords[0].reason, 'dedupe_window', 'suppressed duplicate should name the dedupe reason');

runtimeState.tick += 10;
runtimeState.simTime += 0.166667;
bus.emit('combat:damage', { attackerId: 3, targetId: 1, brokeShield: true, applied: 22, type: 'thermal' });
bus.flush();
assert.equal(cueRecords.at(-1).id, 'shield.collapse', 'shield breaks should route to shield.collapse');
assert.equal(cueRecords.at(-1).playerRelevance, 1, 'shield collapse against player should be maximally relevant');

runtimeState.tick += 2;
runtimeState.simTime += 0.033333;
bus.emit('combat:subsystemDisabled', { targetId: 3, subsystemId: 'subsystem_drive', cueId: 'combat.subsystem.drive.disabled' });
bus.flush();
assert.equal(cueRecords.at(-1).id, 'subsystem.disabled', 'subsystem disable event should route to SG-08');
assert.equal(cueRecords.at(-1).subsystemId, 'subsystem_drive', 'subsystem cue should preserve subsystem id');

const inspect = presentationOrchestrator.inspect();
assert.equal(inspect.emitted, 4, 'orchestrator inspect should count emitted cues');
assert.equal(inspect.suppressed, 1, 'orchestrator inspect should count suppressed cues');
presentationOrchestrator.dispose();

console.log('Presentation cue schema checks OK');
