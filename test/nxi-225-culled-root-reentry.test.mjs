// NXI-225 — a dynamic root that re-enters the visible set must present at its CURRENT
// transform, not the pose it froze at when culled. The world keeps tracking the entity
// while hidden (applyTransform updates slot position + TRANSFORM dirty), the query marks
// the re-entered slot VISIBILITY-dirty, and the renderer unfreezes matrixAutoUpdate and
// re-applies the presentation pose before the visibility submit — all proven here except
// the final pose write, which is pinned at source order.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { createPresentationWorld, PRESENTATION_DIRTY } from '../src/render/presentationWorld.js';
import { createPresentationQueries } from '../src/render/presentationQueries.js';

const BOUNDS_NEAR = { x: 0, z: 0, halfX: 100, halfZ: 100 };
const BOUNDS_FAR = { x: 5000, z: 5000, halfX: 50, halfZ: 50 };

function recordFor(entity, revision) {
  return {
    entityId: entity.id,
    generation: 0,
    revision,
    entityType: entity.type,
    x: entity.pos.x, y: 0, z: entity.pos.z,
    prevX: entity.prevPos ? entity.prevPos.x : entity.pos.x,
    prevY: 0,
    prevZ: entity.prevPos ? entity.prevPos.z : entity.pos.z,
    rot: entity.rot || 0,
    bank: 0, pitch: 0,
    prevRot: entity.prevRot ?? entity.rot ?? 0,
    prevBank: 0, prevPitch: 0,
    visualRevision: 0,
  };
}

test('a moving body that re-enters carries VISIBILITY|TRANSFORM dirty and its current pose', () => {
  const world = createPresentationWorld({ capacity: 16, cellSize: 128 });
  const queries = createPresentationQueries(world);
  const entity = {
    id: 7, type: 'ship', alive: true, radius: 6,
    pos: { x: 10, z: 10 }, prevPos: { x: 10, z: 10 }, rot: 0,
  };
  const mesh = new THREE.Group();
  mesh.matrixAutoUpdate = true;

  const handle = world.allocateEntity(entity, 0);
  assert.ok(handle, 'entity allocated');
  world.bindMesh(handle, mesh, entity, 6);
  const slot = handle.slot;

  // Present: inside the cull rect.
  let q = queries.query({ bounds: BOUNDS_NEAR, origin: { x: 0, z: 0 }, playerId: 99 });
  assert.ok(q.visibleSlots.includes(slot), 'starts on the glass');
  world.clearDirty(slot, PRESENTATION_DIRTY.ALL);

  // Culled: out of the rect — mirrors the hidden pass (pose + freeze are renderer-side).
  q = queries.query({ bounds: BOUNDS_FAR, origin: { x: 0, z: 0 }, playerId: 99 });
  assert.ok(q.hiddenSlots.includes(slot), 'root leaves the visible set');
  world.clearDirty(slot, PRESENTATION_DIRTY.ALL); // hidden exit consumes the pose write

  // Hidden: the body keeps moving. The snapshot keeps feeding applyTransform — the slot
  // tracks the live position and accumulates TRANSFORM dirty for the re-entry write.
  entity.pos.x = 40; entity.pos.z = 20;
  entity.prevPos.x = 10; entity.prevPos.z = 10;
  world.applyTransform(recordFor(entity, 2), entity);
  assert.ok((world.dirtyMasks[slot] & PRESENTATION_DIRTY.TRANSFORM) !== 0,
    'a hidden slot must keep accruing transform dirty');
  assert.equal(world.x[slot], 40, 'the slot tracks the live position while hidden');

  // Re-enter: the query puts it back and marks visibility.
  q = queries.query({ bounds: BOUNDS_NEAR, origin: { x: 0, z: 0 }, playerId: 99 });
  assert.ok(q.newlyVisibleSlots.includes(slot), 'root re-enters the visible set');
  const mask = world.dirtyMasks[slot];
  assert.ok((mask & PRESENTATION_DIRTY.VISIBILITY) !== 0,
    're-entry marks VISIBILITY dirty — the pose-apply gate opens before the submit');
  assert.ok((mask & PRESENTATION_DIRTY.TRANSFORM) !== 0,
    'hidden motion keeps TRANSFORM dirty so the fresh pose is applied, not the frozen one');
  world.dispose();
});

test('the renderer unfreezes a re-entered root and applies the pose before the submit', async () => {
  const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  // Order is the contract: unfreeze matrixAutoUpdate first, the dirty gate (which includes
  // VISIBILITY) re-applies _applyPresentationPose, and only then does the root submit.
  const unfreeze = source.indexOf('userData.sfHiddenFrozen === true');
  const gate = source.indexOf('| PRESENTATION_DIRTY.VISIBILITY)) !== 0 || world.poseHasDelta(slot)');
  const submitOrder = source.indexOf('const visibilityChanged = !(!posed && protectedRoot)');
  assert.ok(unfreeze > 0, 'hidden-frozen restore exists in the visible walk');
  assert.ok(gate > unfreeze, 'the dirty-gated pose apply runs after unfreeze');
  assert.match(source, /_applyPresentationPose\(slot, mesh, alpha/);
  // The hidden exit writes the final current pose THEN freezes — never the reverse.
  const hiddenApply = source.indexOf('this._applyPresentationPose(slot, mesh, alpha, true)');
  const freeze = source.indexOf('mesh.matrixAutoUpdate = false;', hiddenApply);
  assert.ok(hiddenApply > 0 && freeze > hiddenApply,
    'the hidden exit applies the current pose before freezing the root');
  assert.ok(submitOrder > 0);
});
