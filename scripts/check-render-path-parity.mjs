#!/usr/bin/env node
// Run the per-entity path and the batched path over the same frame and prove they agree.
//
// This is the bounded parity window the chunk requires before the old path can be deleted. Deleting
// it on the strength of "the new one has a green unit check" would be deleting the only reference
// that can prove the new one right — parity has to be demonstrated against the incumbent, on the
// same data, before the incumbent goes.
//
// Parity is asserted on the composed world matrix, because that is what the GPU actually consumes.
// Comparing the intermediate fields instead would let a transposition or an axis-order mistake pass:
// both sides would hold the same numbers and still draw the ship pointing the wrong way.

import * as THREE from 'three';

import {
  createRenderEntityFrame,
  beginRenderEntityFrame,
  classifyRenderEntity,
  projectRenderEntityFrame,
  endRenderEntityFrame,
} from '../src/render/renderEntityFrame.js';
import { createPresentationSnapshot, SNAPSHOT_FLAG } from '../src/render/presentationSnapshot.js';
import { createBatchedInstanceRenderer } from '../src/render/batchedInstanceRenderer.js';

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) { console.log(`ok   ${name}`); return; }
  failures++;
  console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}

const POPULATION = 300;
const ARCHETYPES = 5;

/** Deterministic, non-degenerate poses — an identity-heavy fixture would hide axis-order bugs. */
function buildEntities() {
  const entities = [];
  for (let i = 0; i < POPULATION; i++) {
    const mesh = new THREE.Mesh();
    mesh.position.set(Math.sin(i * 0.3) * 40, i * 0.15, Math.cos(i * 0.7) * 40);
    mesh.rotation.set(i * 0.017, i * 0.031, i * 0.011);
    mesh.scale.set(1 + (i % 4) * 0.1, 1 + (i % 3) * 0.15, 1 + (i % 5) * 0.05);
    mesh.visible = i % 11 !== 0;
    mesh.userData = {};
    entities.push({ entity: { id: i, type: 'ship', alive: true }, mesh, culled: i % 17 === 0 });
  }
  return entities;
}

const archetypeOf = (record) => record.id % ARCHETYPES;

const entities = buildEntities();
const frame = createRenderEntityFrame();
beginRenderEntityFrame(frame);
for (const { entity, mesh, culled } of entities) classifyRenderEntity(frame, entity, mesh, culled);

// --- the incumbent: compose each entity's matrix individually, as the per-entity path does --------
const perEntity = new Map();
{
  const matrix = new THREE.Matrix4();
  for (const record of frame.records) {
    if (!record.visible || record.viewCulled) continue;
    const mesh = record.mesh;
    mesh.updateMatrix();
    matrix.copy(mesh.matrix);
    perEntity.set(record.id, matrix.elements.slice());
  }
}

// --- the challenger: project into the dense snapshot, then batch by archetype ---------------------
const snapshot = createPresentationSnapshot({ capacity: 512 });
projectRenderEntityFrame(frame, snapshot, archetypeOf, SNAPSHOT_FLAG.VISIBLE);
const batcher = createBatchedInstanceRenderer({ visibleFlag: SNAPSHOT_FLAG.VISIBLE });
batcher.build(snapshot);

// Walk the snapshot in order, tracking each archetype's cursor, so every instance can be traced back
// to the entity that produced it.
const batched = new Map();
{
  const cursor = new Map();
  for (let i = 0; i < snapshot.count; i++) {
    if ((snapshot.columns.flags[i] & SNAPSHOT_FLAG.VISIBLE) === 0) continue;
    const archetype = snapshot.columns.archetype[i];
    const slot = cursor.get(archetype) || 0;
    cursor.set(archetype, slot + 1);
    const batch = batcher.batches.get(archetype);
    batched.set(snapshot.columns.entityId[i], batch.matrices.slice(slot * 16, slot * 16 + 16));
  }
}

check('both paths render the same entity set', batched.size === perEntity.size,
  `per-entity ${perEntity.size}, batched ${batched.size}`);

let worst = 0;
let worstId = -1;
for (const [id, expected] of perEntity) {
  const actual = batched.get(id);
  if (!actual) { worst = Infinity; worstId = id; break; }
  for (let e = 0; e < 16; e++) {
    const delta = Math.abs(actual[e] - expected[e]);
    if (delta > worst) { worst = delta; worstId = id; }
  }
}
// Float32 instance storage against THREE's Float64 composition — single-precision epsilon is the bar.
check('batched world matrices match the per-entity path', worst < 1e-4,
  `worst delta ${worst} on entity ${worstId}`);

check('culled and hidden entities are excluded from both', perEntity.size < POPULATION,
  'the fixture produced no culling, so exclusion was never exercised');

check('draw calls collapse to the archetype count', batcher.drawCalls === ARCHETYPES,
  `${batcher.drawCalls} draws for ${ARCHETYPES} archetypes`);

endRenderEntityFrame(frame);

console.log(`\n  entities ${POPULATION}, visible ${perEntity.size}, archetypes ${ARCHETYPES}`);
console.log(`  per-entity draw calls : ${perEntity.size}`);
console.log(`  batched draw calls    : ${batcher.drawCalls}`);
console.log(`  worst matrix delta    : ${worst.toExponential(2)}`);
console.log(`\n${failures === 0 ? 'render path parity: batched matches per-entity' : `${failures} assertion(s) failed`}`);
if (failures > 0) process.exit(1);
