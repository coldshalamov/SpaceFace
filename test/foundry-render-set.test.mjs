import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { FOUNDRY_DECK_Y, createFoundrySet, isFoundrySetEntry } from '../src/render/arenaSets/foundrySet.js';
import { render } from '../src/render/renderer.js';
import { FOUNDRY_ARENA_ID } from '../src/systems/swarmArena.js';
import { planFoundryRim } from '../src/systems/survivalArena.js';
import { foundryPlateShape } from '../src/data/foundryPlate.js';

test('Foundry scenery mounts exclusively on Swarm Foundry entry and retires with the renderer', () => {
  const run = Object.freeze({ arenaId: FOUNDRY_ARENA_ID });
  const player = Object.freeze({ pos: Object.freeze({ x: 600, z: 400 }) });
  const entities = new Map([[1, player]]);
  const state = Object.freeze({ run, entities, playerId: 1,
    settings: Object.freeze({ video: Object.freeze({ shadows: false }) }) });
  const owner = {
    state,
    scene: new THREE.Scene(),
    _markShadowReceiversDirty() {},
    _ensureKeyLightShadows() {},
    _syncShadowMapEnabled() {},
    _updateShadowFollow() {},
    _syncFoundrySet: render._syncFoundrySet,
  };
  for (const [event, arena] of [['sector:enter', run.arenaId], ['swarm:arenaEntered', 'lagrange_crucible']]) {
    assert.equal(isFoundrySetEntry(event, arena), false);
    assert.equal(owner._syncFoundrySet(event, { arenaId: arena }), false);
    assert.equal(owner.scene.children.length, 0);
  }
  assert.equal(owner._syncFoundrySet('swarm:arenaEntered', run), true);
  assert.equal(owner._syncFoundrySet('swarm:arenaEntered', run), false);
  assert.equal(owner.scene.children.length, 1);
  // Owner release checklist 2026-11-20: Shadows Off must mean off in the Foundry too. The set
  // used to force the sun shadow map on over the player's setting.
  assert.equal(owner._shadowSettingOn, false, 'the Foundry honours Shadows Off');
  assert.deepEqual([...entities], [[1, player]]);
  assert.equal(owner._syncFoundrySet('sector:enter', run), true);
  assert.equal(owner.scene.children.length, 0);
  assert.equal(owner._shadowSettingOn, false);
});

test('the Foundry keeps shadows when the player turns them on', () => {
  const run = Object.freeze({ arenaId: FOUNDRY_ARENA_ID });
  const state = Object.freeze({ run, entities: new Map(), playerId: 1,
    settings: Object.freeze({ video: Object.freeze({ shadows: true }) }) });
  const owner = {
    state,
    scene: new THREE.Scene(),
    _markShadowReceiversDirty() {},
    _ensureKeyLightShadows() {},
    _syncShadowMapEnabled() {},
    _updateShadowFollow() {},
    _syncFoundrySet: render._syncFoundrySet,
  };
  assert.equal(owner._syncFoundrySet('swarm:arenaEntered', run), true);
  assert.equal(owner._shadowSettingOn, true);
  owner._syncFoundrySet('sector:enter', run);
});

test('bank foundations use the existing contact footprint and follow the render origin', () => {
  const scene = new THREE.Scene();
  const set = createFoundrySet(scene);
  const at = { x: 1800, z: 2500 };
  const banks = planFoundryRim({ at }).map(toy => {
    const shape = foundryPlateShape(toy);
    return Object.freeze({ pos: Object.freeze(toy.pos), rot: shape.rot,
      data: Object.freeze({ roomKind: toy.kind, roomToyId: toy.id, foundryPlate: Object.freeze(shape) }) });
  });
  set.installBanks(Object.freeze(banks));
  set.frame(0, { toLocal: (p, out) => { out.x = p.x - 1800; out.z = p.z - 2500; } });
  set.root.updateMatrixWorld(true);
  assert.ok(set.root.position.length() < 1e-8);
  const walls = set.root.getObjectByName('Foundry bank foundations');
  assert.equal(walls.count, 9 * banks.length);
  const matrix = new THREE.Matrix4();
  walls.getMatrixAt(0, matrix);
  const foundation = new THREE.Box3().copy(walls.geometry.boundingBox).applyMatrix4(matrix);
  assert.ok(Math.abs(foundation.max.y + banks[0].data.foundryPlate.halfHeight) < 1e-5);
  assert.ok(Math.abs(foundation.min.y - FOUNDRY_DECK_Y) < 1e-5);
  assert.ok(Math.abs(matrix.elements[12] + at.x - banks[0].pos.x) < 1e-4);
  assert.ok(Math.abs(matrix.elements[14] + at.z - banks[0].pos.z) < 1e-4);
  const workLenses = set.root.getObjectByName('Foundry work-lamp lenses');
  const bankLenses = set.root.getObjectByName('Foundry bank marker lenses');
  assert.equal(workLenses.instanceColor, null);
  assert.equal(bankLenses.instanceColor, null, 'bank marker lenses omit unused instanceColor to share program');
  set.dispose();
  assert.equal(scene.children.length, 0);
});

test('Foundry set pieces mount their authored LOD1 body, once per source record', async () => {
  const { recordAtLod } = await import('../src/render/arenaSets/foundrySet.js');
  const prim = (name, tags) => ({ name, tags, geometry: {}, material: {} });
  const record = { assetId: 'x', primitives: [prim('COLLISION_HULL'), prim('LOD0_Hull'), prim('LOD1_Hull'), prim('LOD2_Hull'), prim('Trim', { lod: 'lod1' })] };
  const at = recordAtLod(record);
  assert.deepEqual(at.primitives.map((p) => p.name), ['COLLISION_HULL', 'LOD0_Hull', 'Trim']);
  assert.ok(at.primitives.slice(1).every((p) => p.tags.lod === 'lod0'), 'presented as the mount path\'s lod0');
  assert.equal(recordAtLod(record), at, 'cached per source record');
  const lod0Only = { primitives: [prim('LOD0_Hull')] };
  assert.equal(recordAtLod(lod0Only), lod0Only, 'a package without LOD1 is mounted unchanged');
});
