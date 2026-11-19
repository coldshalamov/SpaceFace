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
  assert.equal(owner._shadowSettingOn, true);
  assert.deepEqual([...entities], [[1, player]]);
  assert.equal(owner._syncFoundrySet('sector:enter', run), true);
  assert.equal(owner.scene.children.length, 0);
  assert.equal(owner._shadowSettingOn, false);
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
  set.dispose();
  assert.equal(scene.children.length, 0);
});
