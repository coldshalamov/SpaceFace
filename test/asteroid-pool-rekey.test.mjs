import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  asteroidInstanceMembership,
  createAsteroidInstancePool,
  registerAsteroidBaseLeaf,
  rekeyAsteroidInstanceEntity,
  releaseAsteroidInstancesForEntity,
  syncAsteroidInstancePool,
} from '../src/render/asteroidInstancePool.js';
import { createPersistentSubmitLanes, SUBMIT_LANE } from '../src/render/persistentSubmitLanes.js';
import { reattachResidentGpuMeshes, render } from '../src/render/renderer.js';

function makeCommonRock(id, variant, geometry, material) {
  const root = new THREE.Group();
  const leaf = new THREE.Mesh(geometry, material);
  leaf.userData.asteroidInstanceTypeId = 'ast_common_rock';
  leaf.userData.asteroidInstanceVariant = variant;
  root.userData.asteroidInstanceBody = leaf;
  root.add(leaf);
  return { entity: { id, type: 'asteroid', alive: true, pos: { x: 0, z: 0 } }, root, leaf };
}

function makeKeepGpuOwner(pool, meshes, entities) {
  return {
    _meshes: meshes,
    _asteroidInstancePool: pool,
    state: {
      mode: 'loading',
      entities: new Map(entities.map((e) => [e.id, e])),
      entityList: entities.slice(),
      world: {},
      sessionEntityIdRemap: new Map(),
    },
    rebound: [],
    _unbindPresentationMesh() {},
    _bindPresentationMesh(entity, mesh) { this.rebound.push([entity.id, mesh]); },
  };
}

test('keep-Gpu reattach rekeys the pool record onto the restored entity id', () => {
  const scene = new THREE.Scene();
  const pool = createAsteroidInstancePool(scene);
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const material = new THREE.MeshStandardMaterial();

  // A pooled common rock whose boundary is kept across the same-sector F9 recook.
  const rock = makeCommonRock(42, 0, geometry, material);
  rock.root.userData.sfStableEntityKey = 'wr:rock-1';
  scene.add(rock.root);
  assert.equal(registerAsteroidBaseLeaf(pool, rock.entity, rock.root), true);
  assert.equal(rock.leaf.userData.asteroidInstanceAdopted, true);

  // The restore reissues the entity under a fresh id; the kept mesh re-binds by stable key.
  const restored = {
    id: 7, type: 'asteroid', alive: true, pos: { x: 0, z: 0 },
    data: { worldRecordId: 'rock-1' },
  };
  const owner = makeKeepGpuOwner(pool, new Map([[42, rock.root]]), [restored]);

  assert.equal(reattachResidentGpuMeshes(owner), 1, 'the kept mesh reattaches to the restored entity');
  assert.equal(owner._meshes.get(7), rock.root);
  assert.equal(owner._meshes.has(42), false);

  // The D24 defect: the pool record used to stay keyed under the dead id, so every
  // releaseAsteroidInstancesForEntity missed and the record pinned the retained tree.
  assert.equal(pool.byEntity.has(42), false, 'no stranded record under the pre-restore id');
  const membership = asteroidInstanceMembership(pool, 7);
  assert.equal(membership.registered, true, 'pool record follows the reissued id');
  assert.equal(membership.sourceRootUuid, rock.root.uuid);
  assert.equal(membership.sourceLeafUuid, rock.leaf.uuid);
  assert.equal(pool.byEntity.get(7).record.entityId, 7, 'record entityId follows for instance-id resolution');

  // A later destroy/release under the live id actually frees the slot.
  assert.equal(releaseAsteroidInstancesForEntity(pool, 7), true, 'release by the new id hits');
  assert.equal(pool.byEntity.size, 0, 'the record no longer pins ownerRoot+leaf');
  assert.equal(rock.leaf.visible, true);
  assert.equal(rock.leaf.userData.asteroidInstanceAdopted, false);
});

test('rekeyed pool records satisfy the classified dirty check (no per-frame reclassify)', () => {
  const scene = new THREE.Scene();
  const pool = createAsteroidInstancePool(scene);
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const material = new THREE.MeshStandardMaterial();

  const rock = makeCommonRock(42, 1, geometry, material);
  rock.root.userData.sfStableEntityKey = 'wr:rock-2';
  scene.add(rock.root);
  registerAsteroidBaseLeaf(pool, rock.entity, rock.root);

  const restored = {
    id: 7, type: 'asteroid', alive: true, pos: { x: 0, z: 0 },
    data: { worldRecordId: 'rock-2' },
  };
  const owner = makeKeepGpuOwner(pool, new Map([[42, rock.root]]), [restored]);
  reattachResidentGpuMeshes(owner);

  // The frame classifier hands sync the live records; after the rekey the record resolves
  // under the live id, so an unchanged frame reuses the static submission instead of forcing
  // a full matrix reclassify (the D24 secondary defect).
  const frame = [{ id: 7, mesh: rock.root, renderDirty: false }];
  const first = syncAsteroidInstancePool(pool, { records: frame });
  assert.equal(first.submitted, 1, 'the rekeyed rock still submits through its kept leaf');
  const second = syncAsteroidInstancePool(pool, { records: frame });
  assert.equal(second.matrixEvaluations, 0, 'classified records match — static submission reused');
  assert.equal(second.matrixUploads, 0);
  assert.equal(second.matrixReuses, 1, 'the visible batch is reused, not re-evaluated');

  // Control: a record keyed by a dead id must still force the reclassify.
  const stale = [{ id: 42, mesh: rock.root, renderDirty: false }];
  const forced = syncAsteroidInstancePool(pool, { records: stale });
  assert.equal(forced.matrixEvaluations, 1, 'a dead-keyed record still triggers reclassification');
});

test('rekey is a no-op for absent, colliding, or same-id records', () => {
  const scene = new THREE.Scene();
  const pool = createAsteroidInstancePool(scene);
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const material = new THREE.MeshStandardMaterial();

  assert.equal(rekeyAsteroidInstanceEntity(pool, 1, 2), false, 'no record, no move');
  assert.equal(rekeyAsteroidInstanceEntity(null, 1, 2), false);

  const a = makeCommonRock(10, 0, geometry, material);
  const b = makeCommonRock(11, 0, geometry, material);
  registerAsteroidBaseLeaf(pool, a.entity, a.root);
  registerAsteroidBaseLeaf(pool, b.entity, b.root);

  assert.equal(rekeyAsteroidInstanceEntity(pool, 10, 10), false, 'same-id rekey is a no-op');
  assert.equal(rekeyAsteroidInstanceEntity(pool, 10, 11), false,
    'rekeying onto an owned id releases the orphan rather than clobbering the live record');
  assert.equal(pool.byEntity.has(10), false);
  assert.equal(pool.byEntity.has(11), true, 'the live record is untouched');
  assert.equal(pool.byEntity.get(11).record.leaf, b.leaf);
  assert.equal(a.leaf.userData.asteroidInstanceAdopted, false, 'orphan leaf un-adopts');
  assert.equal(b.leaf.userData.asteroidInstanceAdopted, true);
});

test('unbind releases the submit-lane slot even when the presentation handle is gone', () => {
  const lanes = createPersistentSubmitLanes();
  lanes.reserve(42, SUBMIT_LANE.OPAQUE);
  lanes.reserve(43, SUBMIT_LANE.OPAQUE);
  assert.equal(lanes.diagnostics().liveSlots, 2);

  const unbindCalls = [];
  const context = {
    state: { playerId: 1 },
    _livingHullPresentation: null,
    _presentationHandleScratch: {},
    _persistentSubmitLanes: lanes,
    _presentationWorld: {
      // Id 42's handle is already gone (save restore reissued ids); 43 still resolves.
      handleForEntityId: (id) => (id === 43 ? { slot: 3 } : null),
      unbindMesh: (handle, mesh) => { unbindCalls.push([handle.slot, mesh]); return true; },
    },
  };

  // The D24 defect: release sat behind the handle early-return, so a dead handle stranded
  // the lane reservation for the rest of the session.
  assert.equal(render._unbindPresentationMesh.call(context, 42, new THREE.Group()), false,
    'no handle means no world unbind');
  assert.equal(lanes.diagnostics().liveSlots, 1, 'the dead-handle slot is still released');
  assert.equal(lanes.release(42), false, 'slot 42 was actually freed, not just reported');

  assert.equal(render._unbindPresentationMesh.call(context, 43, null), true);
  assert.deepEqual(unbindCalls, [[3, null]], 'a live handle still unbinds normally');
  assert.equal(lanes.diagnostics().liveSlots, 0, 'both reservations released');
});
