// Frozen-subtree matrix continuity under the vendored updateMatrixWorld prune.
// The prune skips a subtree on the marked ROOT's clean flag alone — a pending
// matrixWorldNeedsUpdate on a strict descendant is invisible to it. These tests pin the
// writers that stay correct under that contract (root pose paths, grafts, re-entry) and the
// one shape that goes stale: a node awakened inside a marked subtree without clearing the
// ancestor marks — the grammar name-bound visual drivers use (position write + updateMatrix()
// + matrixWorldNeedsUpdate). refreshStaticTransform is the sanctioned awaken and must release
// the chain, matching what vendored add()/attach() and markAnimated() already do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAST_ARGUMENT } from '../src/data/lastArgument.js';
import { createLastArgumentVisualDriver } from '../src/render/lastArgumentVisuals.js';

const THREE = await import(new URL('../vendor/three.module.js', import.meta.url).href);
const { freezeStaticChildMatrices, refreshStaticTransform } = await import('../src/render/staticChildMatrices.js');
const { updatePresentedSceneMatrices } = await import('../src/render/presentedSceneMatrices.js');

const worldPos = (o) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).toArray();

function scene() {
  const s = new THREE.Scene();
  s.matrixAutoUpdate = false;
  s.matrixWorldAutoUpdate = false;
  return s;
}

// scene -> ship (live root, stationary after settle -> signature-clean) -> chain -> hook,
// with chain and hook frozen + sfMatrixFrozen-marked the way freezeStaticChildMatrices
// leaves a packaged subtree. hook carries a nonzero local offset so parent scale reads.
function frozenHull() {
  const root = scene();
  const ship = new THREE.Group();
  const chain = new THREE.Group();
  const hook = new THREE.Object3D();
  hook.position.set(1, 0, 0);
  ship.add(chain);
  chain.add(hook);
  root.add(ship);
  freezeStaticChildMatrices(ship);
  assert.equal(ship.matrixAutoUpdate, true, 'entity root stays live');
  assert.equal(chain.userData.sfMatrixFrozen, true);
  assert.equal(hook.userData.sfMatrixFrozen, true);
  // First pass stores transform signatures; the second is a genuinely clean frame —
  // the marked subtree must actually be pruned on it for the scenarios below to mean
  // anything.
  root.updateMatrixWorld();
  root.updateMatrixWorld();
  assert.equal(chain.matrixWorldNeedsUpdate, false);
  assert.equal(hook.matrixWorldNeedsUpdate, false);
  return { root, ship, chain, hook };
}

test('a flag-dirtied descendant stays stale while a clean marked ancestor prunes the walk', () => {
  const { root, chain, hook } = frozenHull();
  // Name-bound driver grammar: un-freeze the interior node, then per-frame position write +
  // updateMatrix()/needsUpdate without clearing the ancestor marks (the shape a driver that
  // binds interior nodes by name uses).
  hook.matrixAutoUpdate = true;
  hook.position.set(5, 0, 0);
  hook.updateMatrix();
  hook.matrixWorldNeedsUpdate = true;
  root.updateMatrixWorld();
  assert.equal(hook.matrixWorldNeedsUpdate, true, 'the unreachable flag is never consumed');
  assert.deepEqual(worldPos(hook), [1, 0, 0], 'marked chain hides the write — world is stale');
  hook.position.set(9, 0, 0);
  hook.updateMatrix();
  hook.matrixWorldNeedsUpdate = true;
  root.updateMatrixWorld();
  assert.deepEqual(worldPos(hook), [1, 0, 0], 'still stale on the next clean frame');
  assert.equal(chain.userData.sfMatrixFrozen, true);
});

test('refreshStaticTransform releases the frozen chain so later flag writes land', () => {
  const { root, chain, hook } = frozenHull();
  hook.position.set(5, 0, 0);
  refreshStaticTransform(hook);
  assert.deepEqual(worldPos(hook), [5, 0, 0], 'immediate refresh bypasses the pruned walk');
  assert.notEqual(hook.userData.sfMatrixFrozen, true, 'awakened node drops its stale mark');
  assert.notEqual(chain.userData.sfMatrixFrozen, true, 'stale ancestor mark is released');
  // Follow-up writes in the plain flag grammar (updateMatrix only — what a live writer does
  // per frame after awakening) must now reach the node through the normal walk.
  hook.position.set(9, 0, 0);
  hook.updateMatrix();
  root.updateMatrixWorld();
  assert.deepEqual(worldPos(hook), [9, 0, 0]);
  // And with no writes the re-marked-honest chain is inert: hook composes but chain and any
  // still-frozen siblings prune again exactly as before.
  chain.userData.sfMatrixFrozen = true;
  hook.matrixWorldNeedsUpdate = false;
  root.updateMatrixWorld();
  assert.deepEqual(worldPos(hook), [9, 0, 0]);
});

test('the live Last Argument driver awakens interior hooks on a stationary frozen hull', () => {
  const { root, ship, hook } = frozenHull();
  hook.name = 'HOOK_ARMOR_LA_VENT_PORT';
  ship.userData.lastArgumentAuthoredSource = { assetId: LAST_ARGUMENT.assetId, file: LAST_ARGUMENT.file };
  const entity = { id: 17, type: 'ship', data: {
    lootTableId: LAST_ARGUMENT.enemyId, lastArgumentKey: 'fixture',
  } };
  const fight = { phase: 'recovery', clock: 0, suspended: false, terminal: false };
  const state = { simTime: 0, entities: new Map([[entity.id, entity]]),
    capitalBossEncounters: { fights: { fixture: fight }, lastArgument: { active: null } } };
  const driver = createLastArgumentVisualDriver(ship, entity);
  assert.ok(driver);
  driver.update(entity, 0, {}, state);
  root.updateMatrixWorld();
  assert.ok(Math.abs(hook.matrixWorld.elements[5] - Math.cos(0.78)) < 1e-9,
    'the actual animated vent reaches its drawn world matrix through the frozen ancestors');
  fight.phase = 'active';
  driver.update(entity, 1, {}, state);
  root.updateMatrixWorld();
  assert.ok(Math.abs(hook.matrixWorld.elements[5] - 1) < 1e-9, 'a later clean frame keeps following the driver');
  driver.dispose();
});

test('moved ancestor, scaled root, and grafted content still reach frozen subtrees', () => {
  const { root, ship, chain, hook } = frozenHull();
  // Moved ancestor: the entity-root pose path dirties the root, which mints force and
  // descends through every mark — tethered boxes and repose paths ride this.
  ship.position.set(4, 0, 2);
  ship.updateMatrix();
  root.updateMatrixWorld();
  assert.deepEqual(worldPos(hook), [5, 0, 2]);
  // Scaled root through the same gated-updateMatrix grammar production pose paths use.
  ship.scale.setScalar(2);
  ship.position.set(0, 0, 0);
  ship.updateMatrix();
  root.updateMatrixWorld();
  assert.deepEqual(worldPos(hook), [2, 0, 0]);
  // Entity-rebind shape: content grafted under a frozen subtree clears marks via add() and
  // walks normally even while every ancestor stays signature-clean.
  const graft = new THREE.Object3D();
  graft.position.set(1, 0, 1);
  chain.add(graft);
  assert.notEqual(chain.userData.sfMatrixFrozen, true, 'add() cleared the stale mark');
  root.updateMatrixWorld();
  assert.deepEqual(worldPos(graft), [2, 0, 2]);
});

test('hidden scene child keeps its dirty flag and re-poses on re-entry', () => {
  const { root, ship, hook } = frozenHull();
  ship.visible = false;
  updatePresentedSceneMatrices(root);
  ship.position.set(7, 0, 3);
  ship.updateMatrix();
  updatePresentedSceneMatrices(root);
  assert.deepEqual(worldPos(hook), [1, 0, 0], 'hidden subtree keeps its last world pose');
  assert.equal(ship.matrixWorldNeedsUpdate, true, 'root flag stays armed while hidden');
  ship.visible = true;
  updatePresentedSceneMatrices(root);
  assert.deepEqual(worldPos(hook), [8, 0, 3], 're-entry refreshes the whole subtree');
});
