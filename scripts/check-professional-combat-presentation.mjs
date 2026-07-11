import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { createBus } from '../src/core/eventBus.js';
import { Masks } from '../src/core/entity.js';
import { physics } from '../src/core/physics.js';
import { validatePresentationRecipes } from '../src/presentation/cueRecipes.js';
import {
  DOCTRINE_IDS,
  damageLayerHierarchy,
  deepestDamageLayer,
  validateCombatChoreography,
} from '../src/presentation/combatChoreography.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const choreography = validateCombatChoreography();
assert(choreography.ok, choreography.issues.join('\n'));
assert.equal(DOCTRINE_IDS.length, 3, 'all three live combat doctrines need choreography');
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
  ]),
};
const bus = createBus();
const cues = [];
const applied = [];
const vfx = [];
const alerts = [];
bus.on('presentation:cue', (payload) => cues.push(payload));
bus.on('presentation:cueApplied', (payload) => applied.push(payload));
bus.on('presentation:vfxCue', (payload) => vfx.push(payload));
bus.on('alert', (payload) => alerts.push(payload));
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

state.tick++;
bus.emit('combat:fire', { ownerId: 2, weaponId: 'pulse', origin: { x: 80, z: 0 }, dir: { x: -1, z: 0 } });
bus.flush();
assert.equal(cues.at(-1).id, 'combat.doctrine.action');
assert.equal(cues.at(-1).targetId, 1);

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
assert(vfxSource.includes("id === 'combat.near_miss'"), 'VFX needs a bounded near-miss style');
assert(!vfxSource.includes('} else if (p.armorHit)'), 'penetrating damage must be able to show shield and armor layers');
assert(!vfxSource.includes('} else if (p.hullHit)'), 'penetrating damage must be able to show armor and hull layers');
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
}, null, 2));

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
