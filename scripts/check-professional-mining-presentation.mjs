import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { createBus } from '../src/core/eventBus.js';
import { validatePresentationRecipes } from '../src/presentation/cueRecipes.js';
import {
  MINING_CHOREOGRAPHY_PHASES,
  MINING_PRESENTATION_CUE_IDS,
  classifyDrillWarning,
  drillHardnessBand,
  fieldDepletionBand,
  seamQualityTag,
  validateMiningChoreography,
} from '../src/presentation/miningChoreography.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { PRESENTATION_AUDIO_CUE_BY_ID, presentationAdapters } from '../src/systems/presentationAdapters.js';
import { AUDIO_RECIPE_BY_ID, resolveAudioCueRecipeId } from '../src/audio/audioSystem.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const choreography = validateMiningChoreography();
assert(choreography.ok, choreography.issues.join('\n'));
assert.equal(MINING_CHOREOGRAPHY_PHASES.length, 9);
assert.equal(MINING_PRESENTATION_CUE_IDS.length, 29);
assert.equal(classifyDrillWarning('DRILL OVERHEATED! Cool down active.'), 'overheated');
assert.equal(classifyDrillWarning('Drill cooling down — release the bore.'), 'overheated');
assert.equal(classifyDrillWarning('Drill system cooled. Ready to dig.'), 'vent_ready');
assert.equal(classifyDrillWarning('Upgrade required!'), null);
assert.equal(fieldDepletionBand(0.5), 'thin');
assert.equal(seamQualityTag({ seamHit: true, yieldMult: 1 }), 'on_seam');
assert.equal(seamQualityTag({ seamHit: false, yieldMult: 0.35 }), 'off_seam');
assert.equal(drillHardnessBand(0.6), 'soft');
assert.equal(drillHardnessBand(1.1), 'firm');
assert.equal(drillHardnessBand(1.8), 'hard');
const recipes = validatePresentationRecipes();
assert(recipes.ok, recipes.issues.join('\n'));

const player = { id: 1, alive: true, pos: { x: 0, y: 0, z: 0 } };
const asteroid = {
  id: 2,
  alive: true,
  type: 'asteroid',
  radius: 14,
  pos: { x: 70, y: 0, z: 0 },
  data: { oreHP: 100, oreHPMax: 100, fieldId: 'field_1' },
};
const chunk = {
  id: 3,
  alive: true,
  type: 'asteroid',
  radius: 8,
  mass: 90,
  pos: { x: 80, y: 0, z: 4 },
  data: { isChunk: true, bulkMassU: 28, commodityId: 'cmdty_ore_iron' },
};
const state = {
  playerId: 1,
  tick: 100,
  simTime: 100 / 60,
  settings: { video: { motionReduce: false }, accessibility: { flashReduce: false, highContrast: false } },
  entities: new Map([[1, player], [2, asteroid], [3, chunk]]),
  drill: { asteroidId: 2, scan: { serial: 1 } },
};
const bus = createBus();
const cues = [];
const applied = [];
const vfx = [];
const alerts = [];
const audioCues = [];
const suppressed = [];
bus.on('presentation:cue', (payload) => cues.push(payload));
bus.on('presentation:cueApplied', (payload) => applied.push(payload));
bus.on('presentation:vfxCue', (payload) => vfx.push(payload));
bus.on('presentation:cueSuppressed', (payload) => suppressed.push(payload));
bus.on('alert', (payload) => alerts.push(payload));
bus.on('audio:cue', (payload) => audioCues.push(payload));
presentationOrchestrator.init({ state, bus });
presentationAdapters.init({ state, bus });

bus.emit('scan:pulse', { pos: { x: 0, z: 0 } });
bus.flush();
state.tick++;
bus.emit('scan:completed', { targetId: null, sectorId: 'sector_1', found: { asteroids: 4, wrecks: 1, anomalies: 0 } });
bus.flush();
assert(cues.some((cue) => cue.id === 'mining.survey.pulse' && cue.sourceId === 1));
assert(cues.some((cue) => cue.id === 'mining.survey.resolved' && cue.tags.includes('asteroids_4')));

state.tick++;
bus.emit('signal:scanResults', {
  sectorId: 'sector_1', scannedAt: state.simTime, total: 2,
  primary: {
    id: 'signal-1', entityId: 2, pos: { x: 100, z: 20 }, classification: 'UNCERTAIN_TRAFFIC',
    sourceKind: 'ship_signature', status: 'classified',
  },
  signals: [],
});
bus.flush();
state.tick++;
bus.emit('signal:tracked', {
  id: 'signal-1', entityId: 2, pos: { x: 100, z: 20 }, classification: 'UNCERTAIN_TRAFFIC',
  sourceKind: 'ship_signature', course: { pos: { x: 100, z: 20 }, targetEntityId: 2 },
});
bus.flush();
state.tick++;
bus.emit('signal:investigated', {
  id: 'signal-receipt:signal-1', signalId: 'signal-1', entityId: 2, pos: { x: 100, z: 20 },
  classification: 'UNCERTAIN_TRAFFIC', sourceKind: 'ship_signature', outcome: 'investigated',
});
bus.flush();
const beforeReceipt = cues.length;
bus.emit('signal:receipt', { signalId: 'signal-1', outcome: 'investigated' });
bus.flush();
assert.equal(cues.length, beforeReceipt, 'durable signal receipt must not duplicate investigated audio/presentation');

state.tick++;
bus.emit('mining:start', { minerId: 1, targetId: 2, position: { x: 70, z: 0 } });
bus.flush();
assert.equal(cues.at(-1).id, 'mining.extraction.locked');
assert.equal(cues.at(-1).sourceId, 1);
assert.equal(cues.at(-1).targetId, 2);

state.tick++;
bus.emit('mining:tick', { contactPos: { x: 58, z: 0 }, oreType: 'cmdty_ore_iron', seamHit: false, yieldMult: 0.35 });
bus.flush();
assert(cues.some((cue) => cue.id === 'mining.seam.quality' && cue.tags.includes('off_seam')));
asteroid.data.oreHP = 15;
state.tick++;
bus.emit('mining:tick', { contactPos: { x: 58, z: 0 }, oreType: 'cmdty_ore_iron', seamHit: true, yieldMult: 1 });
bus.flush();
assert(cues.some((cue) => cue.id === 'mining.seam.quality' && cue.tags.includes('on_seam')));
assert(cues.some((cue) => cue.id === 'mining.fracture.anticipation' && cue.targetId === 2));
const anticipationCount = cues.filter((cue) => cue.id === 'mining.fracture.anticipation').length;
state.tick++;
bus.emit('mining:tick', { contactPos: { x: 58, z: 0 }, oreType: 'cmdty_ore_iron', seamHit: true, yieldMult: 1 });
bus.flush();
assert.equal(cues.filter((cue) => cue.id === 'mining.fracture.anticipation').length, anticipationCount,
  'fracture anticipation is one-shot per target cycle');

state.tick++;
bus.emit('mining:seamHit', { asteroidId: 2 });
bus.flush();
state.tick++;
bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 2, pos: { x: 70, z: 0 }, minerId: 1 });
bus.flush();

state.tick++;
for (const chunkId of [3, 4, 5]) bus.emit('asteroid:chunked', { parentId: 2, chunkId, minerId: 1 });
bus.flush();
assert.equal(cues.filter((cue) => cue.id === 'mining.fracture.released').length, 1,
  'multi-chunk fracture collapses to one presentation receipt');
assert(suppressed.some((item) => item.id === 'mining.fracture.released' && item.reason === 'dedupe_window'));

for (const event of [
  ['mining:richCoreExposed', { asteroidId: 2, commodityId: 'cmdty_ore_platinoid', multiplier: 5, minerId: 1 }],
  ['mining:richCoreChargeStart', { asteroidId: 2 }],
  ['mining:richCoreCompleted', { asteroidId: 2, commodityId: 'cmdty_ore_platinoid', qty: 5, multiplier: 5 }],
]) {
  state.tick++;
  bus.emit(event[0], event[1]);
  bus.flush();
}
state.tick += 31;
bus.emit('mining:richCoreFizzle', { asteroidId: 2, commodityId: 'cmdty_ore_platinoid' });
bus.flush();
assert(cues.some((cue) => cue.id === 'mining.rich_core.exposed' && cue.targetId === 2));
assert(cues.some((cue) => cue.id === 'mining.rich_core.charge' && cue.targetId === 2));
assert(cues.some((cue) => cue.id === 'mining.rich_core.completed' && cue.tags.includes('cmdty_ore_platinoid')));

state.tick++;
bus.emit('mining:bulkRequiresTether', { asteroidId: 3, massU: 28, commodityId: 'cmdty_ore_iron' });
bus.flush();
assert(cues.some((cue) => cue.id === 'mining.chunk.tether_required' && cue.targetId === 3));
state.tick++;
bus.emit('tether:attached', { actorId: 1, targetId: 3, attachmentId: 'attachment_1' });
bus.flush();
assert(cues.some((cue) => cue.id === 'mining.chunk.mass_engaged' && cue.sourceId === 1 && cue.targetId === 3));

state.tick++;
bus.emit('pickup:collected', { collectorId: 1, kind: 'ore', commodityId: 'cmdty_ore_iron', amount: 2 });
bus.emit('cargo:massSettled', { cargo: { usedVolume: 36, usedMass: 24, capVolume: 40 }, usedU: 36, massT: 24 });
bus.flush();
assert(cues.some((cue) => cue.id === 'mining.cargo.mass_settled' && cue.tags.includes('heavy')));
state.tick++;
bus.emit('cargo:full', { commodityId: 'cmdty_ore_iron' });
bus.flush();
assert(cues.some((cue) => cue.id === 'mining.cargo.full'));

state.tick++;
bus.emit('fieldDepletion:changed', {
  fieldId: 'field_1', sectorId: 'sector_1', depleted: 0.5, richnessMult: 0.725,
  extractedU: 80, destroyedCount: 4, reason: 'asteroid_destroyed',
});
bus.flush();
assert(cues.some((cue) => cue.id === 'mining.field.aftermath' && cue.targetId === 'field_1' && cue.tags.includes('thin')));

state.tick++;
bus.emit('drill:warn', { text: 'Drill cooling down — release the bore.' });
bus.flush();
state.tick += 60;
bus.emit('drill:warn', { text: 'Drill system cooled. Ready to dig.' });
bus.flush();
assert(cues.some((cue) => cue.id === 'mining.heat.overheated'));
assert(cues.some((cue) => cue.id === 'mining.vent.ready'));

for (const [event, payload] of [
  ['drill:scanPulse', { col: 10, row: 4, radius: 7, contacts: 3 }],
  ['drill:spark', { col: 10, row: 5, type: 'rock', hpFrac: 0.6, hardness: 1.7, energy: 72 }],
  ['drill:break', { col: 10, row: 5, type: 'rock', wasVein: false, wasGas: false }],
  ['drill:yield', { commodityId: 'cmdty_ore_iron', qty: 3, pos: { col: 10, row: 6 } }],
  ['drill:gasHit', { dmg: 7, pos: { col: 10, row: 7 } }],
  ['drill:end', { asteroidId: 2, reason: 'aborted' }],
  ['drill:retry', { asteroidId: 2, previous: { reason: 'retry' } }],
]) {
  state.tick++;
  bus.emit(event, payload);
  bus.flush();
}

for (const id of MINING_PRESENTATION_CUE_IDS) {
  assert(cues.some((cue) => cue.id === id), `missing mining presentation cue: ${id}`);
  const semanticId = PRESENTATION_AUDIO_CUE_BY_ID[id];
  assert(semanticId, `missing semantic mining audio mapping: ${id}`);
  const recipeId = resolveAudioCueRecipeId(semanticId);
  assert(AUDIO_RECIPE_BY_ID[recipeId], `missing concrete mining audio recipe: ${id} -> ${semanticId}`);
  assertFiniteRecipe(recipeId);
}

const duplicateMiningVfx = vfx.filter((event) => event.id && event.id.startsWith('mining.'));
assert.equal(duplicateMiningVfx.length, 0, 'direct mining VFX ownership must not double-spawn presentation:vfxCue');
const duplicateMiningAlerts = alerts.filter((event) => event.cueId && event.cueId.startsWith('mining.'));
assert.equal(duplicateMiningAlerts.length, 0, 'semantic mining receipts must not duplicate existing HUD/drill/cargo alerts');
assert(applied.some((record) => record.id === 'mining.rich_core.completed' && record.outputs.vfx.reconciled === true));
const miningAudioFloors = new Map();
for (const record of applied.filter((entry) => entry.id.startsWith('mining.') && entry.outputs.audio)) {
  const key = `${record.tick}:${record.sourceEvent || record.id}`;
  miningAudioFloors.set(key, (miningAudioFloors.get(key) || 0) + 1);
}
const duplicateAudioFloors = [...miningAudioFloors.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
assert.equal(duplicateAudioFloors, 0, 'each mining source event must own at most one semantic audio floor');
assert.equal(audioCues.find((cue) => cue.cueId === 'mining.survey.pulse').duck, false,
  'routine scan pulse must not duck music');
assert.equal(audioCues.find((cue) => cue.cueId === 'mining.yield.collected').duck, false,
  'routine ore yield must not duck music');
assert.equal(audioCues.find((cue) => cue.cueId === 'mining.drill.gas_hazard').duck, true,
  'gas hazard must own the critical duck');
assert.equal(audioCues.find((cue) => cue.cueId === 'mining.survey.classified').position.x, 100,
  'classified scan return must preserve signal world position');
assert.equal(audioCues.find((cue) => cue.cueId === 'mining.yield.collected').position.x, 70,
  'flight mining yield must preserve ore world position');

const miningSource = readFileSync(resolve(ROOT, 'src/systems/mining.js'), 'utf8');
const drillSource = readFileSync(resolve(ROOT, 'src/systems/drill.js'), 'utf8');
const vfxSource = readFileSync(resolve(ROOT, 'src/render/vfx.js'), 'utf8');
const audioSource = readFileSync(resolve(ROOT, 'src/audio/audioSystem.js'), 'utf8');
// REMOVED: `assert(miningSource.includes('delete beam.heat;') && miningSource.includes('delete
// beam.overheated;'), 'flight mining must retain its shipped no-heat-lockout contract')`.
// That was a source-string scan freezing the DELETION of the flight beam's heat/vent rhythm into CI,
// while cueRecipes.js still declared mining.heat.overheated / mining.vent.ready and audioSystem.js
// still shipped sfx_vent_chime. PHYSICAL_PLAY_GRAMMAR §9.5.2 amputation 1 reverses that decision.
// It is not replaced by an inverted string scan: the rhythm is a behaviour, and it is driven through
// the live sim and asserted on outcomes in scripts/check-mining-2.mjs
// (checkBeamHeatLocksOutAndRecovers / checkVentBonusPaysRealOre / checkPulsingOutEarnsPegging).
assert(drillSource.includes('Drill cooling down — release the bore.') && drillSource.includes('d.overheated && d.drillTemp <= 10'),
  'heat warning must consume the registered drill authority and cooling threshold');
assert(vfxSource.includes("add('presentation:cue', (p) => this._onDirectMiningPresentationCue(p))"));
assert(vfxSource.includes("id === 'mining.fracture.anticipation'"));
assert(vfxSource.includes("id === 'mining.rich_core.completed'"));
assert(vfxSource.includes('new THREE.InstancedMesh(geo, mat, CAP)'), 'seam readability must reuse the fixed instanced marker pool');
assert(!/bus\.on\('scan:pulse'/.test(audioSource), 'raw scan pulse must not double presentation audio');
assert(!/bus\.on\('mining:(?:yield|seamHit)'/.test(audioSource),
  'raw mining rewards must not double presentation audio');
const miningTickBody = audioSource.slice(audioSource.indexOf('  _onMiningTick(p) {'), audioSource.indexOf('  _startLoopVoice(', audioSource.indexOf('  _onMiningTick(p) {')));
assert(!miningTickBody.includes('this.play('), 'cutter contact must modulate its continuous loop instead of spawning voice storms');
for (const rel of ['src/presentation/miningChoreography.js', 'src/systems/presentationOrchestrator.js']) {
  const source = readFileSync(resolve(ROOT, rel), 'utf8');
  for (const forbidden of ['document.', 'window.', 'THREE.', 'Date.now', 'Math.random']) {
    assert(!source.includes(forbidden), `${rel} must remain headless and deterministic: ${forbidden}`);
  }
}

presentationAdapters.dispose();
presentationOrchestrator.dispose();
console.log(JSON.stringify({
  schema: 'spaceface.professionalMiningPresentation.v1',
  ok: true,
  phases: MINING_CHOREOGRAPHY_PHASES,
  cueCount: cues.filter((cue) => cue.id.startsWith('mining.')).length,
  fractureReceipts: cues.filter((cue) => cue.id === 'mining.fracture.released').length,
  duplicateVfxEvents: duplicateMiningVfx.length,
  duplicateAlerts: duplicateMiningAlerts.length,
  audioVoices: audioCues.filter((cue) => cue.cueId && cue.cueId.startsWith('mining.')).length,
  duplicateAudioFloors,
  headlessErrors: 0,
}, null, 2));

function assertFiniteRecipe(recipeId, seen = new Set()) {
  if (seen.has(recipeId)) return;
  seen.add(recipeId);
  const recipe = AUDIO_RECIPE_BY_ID[recipeId];
  assert(recipe, `missing recipe ${recipeId}`);
  assert(!String(recipe.type || '').startsWith('continuous'), `${recipeId} must remain a finite mining one-shot`);
  if (recipe.type === 'layered') {
    assert(Array.isArray(recipe.layers) && recipe.layers.length > 0, `${recipeId} must own authored layers`);
    for (const layerId of recipe.layers) assertFiniteRecipe(layerId, seen);
    return;
  }
  const envelope = recipe.gainEnvelope || {};
  assert(Number.isFinite(envelope.attack) && Number.isFinite(envelope.sustain) && Number.isFinite(envelope.release),
    `${recipeId} must declare a finite one-shot envelope`);
}
