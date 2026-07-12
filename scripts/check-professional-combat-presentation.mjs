import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { createBus } from '../src/core/eventBus.js';
import { Masks } from '../src/core/entity.js';
import { physics } from '../src/core/physics.js';
import { getPresentationRecipe, validatePresentationRecipes } from '../src/presentation/cueRecipes.js';
import {
  DOCTRINE_IDS,
  damageLayerHierarchy,
  deepestDamageLayer,
  doctrinePhaseStage,
  validateCombatChoreography,
} from '../src/presentation/combatChoreography.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { PRESENTATION_AUDIO_CUE_BY_ID, presentationAdapters } from '../src/systems/presentationAdapters.js';
import {
  AUDIO_RECIPE_BY_ID,
  DOCTRINE_AUDIO_SIGNATURES,
  resolveAudioCueRecipeId,
  resolveWeaponAudioSignature,
} from '../src/audio/audioSystem.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const choreography = validateCombatChoreography();
assert(choreography.ok, choreography.issues.join('\n'));
assert.equal(DOCTRINE_IDS.length, 3, 'all three live combat doctrines need choreography');
assert.equal(doctrinePhaseStage('interceptor_flyby', 'extend'), 'break');
assert.equal(doctrinePhaseStage('interceptor_flyby', 'reform'), 'withdraw');
assert.equal(doctrinePhaseStage('tether_control_raider', 'escape'), 'break');
assert.equal(doctrinePhaseStage('ranged_disengager', 'retreat'), 'break');
assert.equal(doctrinePhaseStage('ranged_disengager', 'outer_standoff'), 'withdraw');
assert.deepEqual(damageLayerHierarchy({ shieldDamage: 4, armorDamage: 3, hullDamage: 2 }), ['shield', 'armor', 'hull']);
assert.equal(deepestDamageLayer({ shieldDamage: 4, armorDamage: 3, hullDamage: 2 }), 'hull');
const recipes = validatePresentationRecipes();
assert(recipes.ok, recipes.issues.join('\n'));

const state = {
  playerId: 1,
  tick: 100,
  simTime: 100 / 60,
  settings: { video: { motionReduce: false }, accessibility: { flashReduce: false, highContrast: false } },
  entities: new Map([
    [1, { id: 1, alive: true, team: 1, radius: 5, pos: { x: 0, y: 0, z: 0 } }],
    [2, { id: 2, alive: true, team: 2, radius: 5, pos: { x: 80, y: 0, z: 0 } }],
    [3, { id: 3, alive: true, team: 2, radius: 5, pos: { x: -90, y: 0, z: 20 } }],
    [4, { id: 4, alive: true, team: 2, radius: 5, pos: { x: 140, y: 0, z: -40 } }],
  ]),
};
const bus = createBus();
const cues = [];
const applied = [];
const vfx = [];
const alerts = [];
const audioCues = [];
bus.on('presentation:cue', (payload) => cues.push(payload));
bus.on('presentation:cueApplied', (payload) => applied.push(payload));
bus.on('presentation:vfxCue', (payload) => vfx.push(payload));
bus.on('alert', (payload) => alerts.push(payload));
bus.on('audio:cue', (payload) => audioCues.push(payload));
presentationOrchestrator.init({ state, bus });
presentationAdapters.init({ state, bus });

bus.emit('ai:telegraph', {
  entityId: 2,
  targetId: 1,
  doctrineId: 'interceptor_flyby',
  phase: 'engine_flare',
  kind: 'engine_flare',
  durationTicks: 30,
  tick: state.tick,
});
bus.flush();
assert.deepEqual(cues.slice(-2).map((cue) => cue.id), ['combat.doctrine.setup', 'combat.doctrine.telegraph']);
assert(cues.slice(-2).every((cue) => cue.sourceId === 2 && cue.targetId === 1), 'doctrine cues must name exact attacker and target');
assert.equal(vfx.length, 0, 'semantic doctrine receipts must not double-spawn direct doctrine VFX');
assert.equal(audioCues.filter((cue) => cue.cueId && cue.cueId.startsWith('combat.doctrine.')).length, 1,
  'setup+telegraph from one raw event must own one doctrine audio floor');
assert.equal(audioCues.at(-1).id, 'presentation.combat.interceptor_flyby.setup');
assert.equal(audioCues.at(-1).position.x, 80, 'doctrine setup must remain spatially attached to the attacker');

state.tick++;
bus.emit('combat:fire', { ownerId: 2, weaponId: 'pulse', origin: { x: 80, z: 0 }, dir: { x: -1, z: 0 } });
bus.flush();
assert.equal(cues.at(-1).id, 'combat.doctrine.action');
assert.equal(cues.at(-1).targetId, 1);
assert.equal(audioCues.filter((cue) => cue.cueId === 'combat.doctrine.action').length, 0,
  'gun commit keeps its doctrine-modulated physical weapon voice instead of stacking presentation audio');

state.tick++;
bus.emit('combat:damage', {
  attackerId: 2,
  targetId: 1,
  applied: 17,
  shieldDamage: 8,
  armorDamage: 6,
  hullDamage: 3,
  shieldHit: true,
  armorHit: true,
  hullHit: true,
  dominantLayer: 'hull',
  before: { hull: 20 },
  after: { hull: 17 },
  isPlayer: true,
  pos: { x: 0, z: 0 },
});
bus.flush();
assert(cues.some((cue) => cue.id === 'combat.damage.applied' && cue.tags.includes('hull')));
assert(cues.some((cue) => cue.id === 'combat.player.hit' && cue.targetId === 1));
assert(cues.some((cue) => cue.id === 'combat.doctrine.aftermath' && cue.tags.includes('hit')));
assert.equal(vfx.length, 0, 'direct damage receipts must leave existing combat VFX as owner');
assert.equal(audioCues.filter((cue) => cue.cueId === 'combat.doctrine.aftermath').length, 0,
  'damage/kill own their impacts; doctrine aftermath remains a silent semantic receipt');

state.tick++;
bus.emit('ai:doctrinePhase', {
  entityId: 2, targetId: 1, doctrineId: 'interceptor_flyby', phase: 'extend',
  fireWindow: false, maneuverKind: 'intercept', tick: state.tick,
});
bus.flush();
state.tick++;
bus.emit('ai:doctrinePhase', {
  entityId: 2, targetId: 1, doctrineId: 'interceptor_flyby', phase: 'reform',
  fireWindow: false, maneuverKind: 'formation', tick: state.tick,
});
bus.flush();
assert(cues.some((cue) => cue.id === 'combat.doctrine.break' && cue.tags.includes('extend')));
assert(cues.some((cue) => cue.id === 'combat.doctrine.withdraw' && cue.tags.includes('reform')));

// Tether raider: mechanical setup, truthful attach action, escape break, reform withdraw.
state.tick++;
bus.emit('ai:telegraph', {
  entityId: 3, targetId: 1, doctrineId: 'tether_control_raider', phase: 'spool_cue',
  kind: 'attach_spool', durationTicks: 30, tick: state.tick,
});
bus.flush();
state.tick++;
bus.emit('combat:actionStarted', {
  actorId: 3, actionId: 'action_attach', actionInstanceId: 'attach-3', target: { entityId: 1 }, startedTick: state.tick,
});
bus.flush();
state.tick++;
bus.emit('tether:attached', { actorId: 3, targetId: 1, attachmentId: 'line-3' });
bus.flush();
state.tick++;
bus.emit('ai:doctrinePhase', {
  entityId: 3, targetId: 1, doctrineId: 'tether_control_raider', phase: 'escape',
  fireWindow: false, maneuverKind: 'retreat', tick: state.tick,
});
bus.flush();
state.tick++;
bus.emit('ai:doctrinePhase', {
  entityId: 3, targetId: 1, doctrineId: 'tether_control_raider', phase: 'reform',
  fireWindow: false, maneuverKind: 'formation', tick: state.tick,
});
bus.flush();

// Ranged disengager: capacitor setup, physical shot commit, reset break, standoff recovery.
state.tick++;
bus.emit('ai:telegraph', {
  entityId: 4, targetId: 1, doctrineId: 'ranged_disengager', phase: 'charge_cue',
  kind: 'weapon_charge', durationTicks: 30, tick: state.tick,
});
bus.flush();
state.tick++;
bus.emit('combat:fire', { ownerId: 4, weaponId: 'pulse', origin: { x: 140, z: -40 }, dir: { x: -1, z: 0 } });
bus.flush();
state.tick++;
bus.emit('projectile:nearMiss', {
  projectileId: 79, ownerId: 4, targetId: 1, distance: 18, damageType: 'energy',
  pos: { x: 2, z: 14 }, direction: { x: 1, z: 0 },
});
bus.flush();
state.tick++;
bus.emit('ai:doctrinePhase', {
  entityId: 4, targetId: 1, doctrineId: 'ranged_disengager', phase: 'reset',
  fireWindow: false, maneuverKind: 'orbit', tick: state.tick,
});
bus.flush();
state.tick++;
bus.emit('ai:doctrinePhase', {
  entityId: 4, targetId: 1, doctrineId: 'ranged_disengager', phase: 'outer_standoff',
  fireWindow: false, maneuverKind: 'orbit', tick: state.tick,
});
bus.flush();

for (const doctrineId of DOCTRINE_IDS) {
  for (const stage of ['setup', 'break', 'withdraw']) {
    const semanticId = `presentation.combat.${doctrineId}.${stage}`;
    const recipeId = resolveAudioCueRecipeId(semanticId);
    assert(AUDIO_RECIPE_BY_ID[recipeId], `${semanticId} must resolve to a concrete doctrine recipe`);
    assertFiniteRecipe(recipeId);
    assert(audioCues.some((cue) => cue.id === semanticId), `${semanticId} must be audible in its truthful phase`);
  }
}
assert.equal(new Set(DOCTRINE_IDS.map((id) => resolveAudioCueRecipeId(`presentation.combat.${id}.setup`))).size, 3,
  'the three doctrine setups must remain aurally distinct');
assert(audioCues.filter((cue) => cue.cueId && cue.cueId.startsWith('combat.doctrine.')).every((cue) => cue.duck === false),
  'routine doctrine choreography must not duck music');
const weaponSignatures = DOCTRINE_IDS.map((doctrineId) => resolveWeaponAudioSignature({
  weaponId: 'pulse', doctrineId,
}, state));
assert.equal(new Set(weaponSignatures.map((signature) => signature.rate)).size, 3,
  'physical gun commit must retain distinct doctrine rate identity without a stacked semantic voice');
for (const doctrineId of DOCTRINE_IDS) {
  assert(AUDIO_RECIPE_BY_ID[DOCTRINE_AUDIO_SIGNATURES[doctrineId].recipeId], `${doctrineId} setup recipe must remain authored`);
}

// Full flee owns a bark/combat-outcome voice; normalized withdraw remains a silent receipt.
state.tick++;
bus.emit('ai:telegraph', {
  entityId: 4, targetId: 1, doctrineId: 'ranged_disengager', phase: 'charge_cue',
  kind: 'weapon_charge', durationTicks: 30, tick: state.tick,
});
bus.flush();
const doctrineAudioBeforeFlee = audioCues.filter((cue) => cue.cueId && cue.cueId.startsWith('combat.doctrine.')).length;
state.tick++;
bus.emit('ai:flee', { entityId: 4, reason: 'wingMorale:leaderDown' });
bus.flush();
assert(cues.some((cue) => cue.id === 'combat.doctrine.withdraw' && cue.sourceEvent === 'ai:flee'));
assert.equal(audioCues.filter((cue) => cue.cueId && cue.cueId.startsWith('combat.doctrine.')).length, doctrineAudioBeforeFlee,
  'ai:flee must not stack a doctrine tone under its existing bark/outcome voice');

for (const cueId of [
  'combat.doctrine.setup', 'combat.doctrine.telegraph', 'combat.doctrine.action',
  'combat.doctrine.aftermath', 'combat.doctrine.break', 'combat.doctrine.withdraw',
]) {
  const semanticId = PRESENTATION_AUDIO_CUE_BY_ID[cueId];
  assert(semanticId, `${cueId} needs a total SG-08 semantic mapping`);
  assert(AUDIO_RECIPE_BY_ID[resolveAudioCueRecipeId(semanticId)], `${cueId} static semantic must resolve`);
  assert(Number.isFinite(getPresentationRecipe(cueId).budgets.voices), `${cueId} needs a finite SG-08 voice budget`);
}

const doctrineAudioFloors = new Map();
for (const record of applied.filter((entry) => entry.id.startsWith('combat.doctrine.') && entry.outputs.audio)) {
  const key = `${record.tick}:${record.sourceEvent || record.id}`;
  doctrineAudioFloors.set(key, (doctrineAudioFloors.get(key) || 0) + 1);
}
const duplicateDoctrineFloors = [...doctrineAudioFloors.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
assert.equal(duplicateDoctrineFloors, 0, 'one source event must never spawn two normalized doctrine voices');

state.tick++;
bus.emit('entity:killed', { id: 2, killerId: 1, type: 'ship', pos: { x: 80, z: 0 } });
bus.flush();
assert.equal(cues.at(-1).id, 'combat.player.kill');
assert.equal(cues.at(-1).sourceId, 1);
assert.equal(cues.at(-1).targetId, 2);
assert.equal(alerts.at(-1).text, 'TARGET DESTROYED');

state.tick++;
bus.emit('projectile:nearMiss', {
  projectileId: 77,
  ownerId: 2,
  targetId: 1,
  distance: 14,
  damageType: 'kinetic',
  pos: { x: 0, z: 14 },
  direction: { x: 1, z: 0 },
});
bus.flush();
assert.equal(cues.at(-1).id, 'combat.near_miss');
assert.equal(vfx.at(-1).particles, 12);
assert.equal(vfx.at(-1).lights, 0);

const nearMisses = [];
const hits = [];
const physicsBus = createBus();
physicsBus.on('projectile:nearMiss', (payload) => nearMisses.push(payload));
physicsBus.on('projectile:hit', (payload) => hits.push(payload));
const player = state.entities.get(1);
player.collides = true;
player.collisionMask = Masks.PROJECTILE;
const projectile = makeProjectile(88, 15);
const physicsState = {
  playerId: 1,
  tick: 140,
  entities: new Map([[1, player], [88, projectile]]),
  entityList: [player, projectile],
  entityIndex: { projectiles: [projectile], collidables: [player] },
  spatialHash: null,
};
const host = Object.create(physics);
host.init({ state: physicsState, bus: physicsBus, helpers: {} });
host.sweepProjectiles(1 / 60, physicsState);
host.sweepProjectiles(1 / 60, physicsState);
assert.equal(nearMisses.length, 1, 'a projectile close pass should emit exactly one deterministic receipt');
assert.equal(hits.length, 0);
assert.equal(nearMisses[0].ownerId, 2);
assert.equal(nearMisses[0].targetId, 1);

const hitProjectile = makeProjectile(89, 0);
physicsState.entities.set(89, hitProjectile);
physicsState.entityIndex.projectiles = [hitProjectile];
host.sweepProjectiles(1 / 60, physicsState);
assert.equal(hits.length, 1, 'a true collision must remain a hit, not a near miss');
assert.equal(nearMisses.length, 1);

const vfxSource = readFileSync(resolve(ROOT, 'src/render/vfx.js'), 'utf8');
const audioSource = readFileSync(resolve(ROOT, 'src/audio/audioSystem.js'), 'utf8');
assert(vfxSource.includes("id === 'combat.near_miss'"), 'VFX needs a bounded near-miss style');
assert(!vfxSource.includes('} else if (p.armorHit)'), 'penetrating damage must be able to show shield and armor layers');
assert(!vfxSource.includes('} else if (p.hullHit)'), 'penetrating damage must be able to show armor and hull layers');
const rawTelegraphBody = audioSource.slice(
  audioSource.indexOf('  _onDoctrineTelegraphAudio(p) {'),
  audioSource.indexOf('  _onEncounterTelegraphAudio(p) {'),
);
assert(!rawTelegraphBody.includes('this.play('),
  'raw ai:telegraph may maintain encounter pressure but presentation must own its only audible voice');
for (const rel of ['src/presentation/combatChoreography.js', 'src/systems/presentationOrchestrator.js']) {
  const source = readFileSync(resolve(ROOT, rel), 'utf8');
  for (const forbidden of ['document.', 'window.', 'THREE.', 'Date.now', 'Math.random']) {
    assert(!source.includes(forbidden), `${rel} must remain headless and deterministic: ${forbidden}`);
  }
}

presentationAdapters.dispose();
presentationOrchestrator.dispose();
console.log(JSON.stringify({
  schema: 'spaceface.professionalCombatPresentation.v1',
  ok: true,
  doctrines: DOCTRINE_IDS,
  cueCount: cues.length,
  nearMissReceipts: nearMisses.length,
  pooledNearMissParticles: 12,
  doctrineAudioVoices: audioCues.filter((cue) => cue.cueId && cue.cueId.startsWith('combat.doctrine.')).length,
  duplicateDoctrineFloors,
  headlessErrors: 0,
}, null, 2));

function assertFiniteRecipe(recipeId, seen = new Set()) {
  if (seen.has(recipeId)) return;
  seen.add(recipeId);
  const recipe = AUDIO_RECIPE_BY_ID[recipeId];
  assert(recipe, `missing recipe ${recipeId}`);
  assert(!String(recipe.type || '').startsWith('continuous'), `${recipeId} must remain a finite doctrine one-shot`);
  if (recipe.type === 'layered') {
    assert(Array.isArray(recipe.layers) && recipe.layers.length > 0, `${recipeId} must own authored layers`);
    for (const layerId of recipe.layers) assertFiniteRecipe(layerId, seen);
    return;
  }
  const envelope = recipe.gainEnvelope || {};
  assert(Number.isFinite(envelope.attack) && Number.isFinite(envelope.sustain) && Number.isFinite(envelope.release),
    `${recipeId} must declare a finite one-shot envelope`);
}

function makeProjectile(id, z) {
  return {
    id,
    type: 'projectile',
    alive: true,
    collides: true,
    collisionMask: Masks.SHIP,
    ownerId: 2,
    team: 2,
    radius: 1,
    prevPos: { x: -20, z },
    pos: { x: 20, z },
    vel: { x: 2400, z: 0 },
    data: { weaponId: 'test_pulse', damageType: 'kinetic' },
  };
}
