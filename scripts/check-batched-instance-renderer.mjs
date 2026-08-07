#!/usr/bin/env node
// Gate the batched instance renderer on draw calls and transform parity.
//
// Two things have to hold at once, and checking either alone would be misleading. Draw calls must
// stop tracking population — that is the scaling claim. And the matrices it writes must equal what
// the per-entity path would have produced — a batcher that is fast and wrong is worse than the path
// it replaces, because the error shows up as subtly misplaced geometry rather than a crash.
//
// Parity is checked against THREE's own Matrix4.compose, not against a second copy of the inline
// math, so the two sides cannot be wrong together.

import * as THREE from 'three';

import { createPresentationSnapshot, SNAPSHOT_FLAG } from '../src/render/presentationSnapshot.js';
import { createBatchedInstanceRenderer } from '../src/render/batchedInstanceRenderer.js';

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) { console.log(`ok   ${name}`); return; }
  failures++;
  console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}

const ARCHETYPES = 6;

/** Populate a snapshot with a deterministic, non-degenerate spread of transforms. */
function fill(snapshot, population, { hideEvery = 0 } = {}) {
  snapshot.beginFrame(population);
  for (let i = 0; i < population; i++) {
    const angle = (i % 360) * (Math.PI / 180);
    const half = angle * 0.5;
    const s = Math.sin(half);
    const visible = hideEvery > 0 && i % hideEvery === 0 ? 0 : SNAPSHOT_FLAG.VISIBLE;
    snapshot.write(
      i, i % ARCHETYPES,
      i * 0.5, i * -0.25, i * 0.125,
      s * 0.0, s * 1.0, s * 0.0, Math.cos(half),
      1 + (i % 3) * 0.1, 1 + (i % 5) * 0.05, 1 + (i % 7) * 0.02,
      visible,
    );
  }
  return snapshot;
}

// --- parity: the batched matrices must equal Matrix4.compose ------------------------------------
{
  const population = 240;
  const snapshot = fill(createPresentationSnapshot({ capacity: 256 }), population);
  const batcher = createBatchedInstanceRenderer();
  batcher.build(snapshot);

  const expected = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const perArchetypeCursor = new Map();
  let worst = 0;

  for (let i = 0; i < population; i++) {
    const archetype = snapshot.columns.archetype[i];
    const slot = perArchetypeCursor.get(archetype) || 0;
    perArchetypeCursor.set(archetype, slot + 1);

    const p = i * 3;
    const q = i * 4;
    pos.set(snapshot.columns.position[p], snapshot.columns.position[p + 1], snapshot.columns.position[p + 2]);
    quat.set(snapshot.columns.quaternion[q], snapshot.columns.quaternion[q + 1],
      snapshot.columns.quaternion[q + 2], snapshot.columns.quaternion[q + 3]);
    scl.set(snapshot.columns.scale[p], snapshot.columns.scale[p + 1], snapshot.columns.scale[p + 2]);
    expected.compose(pos, quat, scl);

    const batch = batcher.batches.get(archetype);
    for (let e = 0; e < 16; e++) {
      const delta = Math.abs(batch.matrices[slot * 16 + e] - expected.elements[e]);
      if (delta > worst) worst = delta;
    }
  }
  // Float32 storage against THREE's Float64 math, so exact equality is the wrong bar; this is
  // single-precision epsilon territory.
  check('batched matrices match THREE.Matrix4.compose', worst < 1e-5, `worst element delta ${worst}`);
  check('every visible entity is written', batcher.instancesWritten === population,
    `${batcher.instancesWritten} of ${population}`);
}

// --- the scaling claim: draw calls stop tracking population --------------------------------------
{
  const base = 400;
  const scaled = base * 5;

  const smallBatcher = createBatchedInstanceRenderer();
  smallBatcher.build(fill(createPresentationSnapshot({ capacity: 2048 }), base));
  const smallDraws = smallBatcher.drawCalls;

  const bigBatcher = createBatchedInstanceRenderer();
  const bigSnapshot = createPresentationSnapshot({ capacity: 2048 });
  bigBatcher.build(fill(bigSnapshot, scaled));
  const bigDraws = bigBatcher.drawCalls;

  check('draw calls equal the archetype count, not the population',
    smallDraws === ARCHETYPES && bigDraws === ARCHETYPES, `${smallDraws} and ${bigDraws}`);
  check('5x population does not increase draw calls', bigDraws === smallDraws,
    `${smallDraws} -> ${bigDraws}`);

  // Steady state: rebuild repeatedly at the high population and confirm buffers stop growing.
  bigBatcher.resetCounters();
  for (let frame = 0; frame < 60; frame++) bigBatcher.build(fill(bigSnapshot, scaled));
  check('instance buffers reach steady state and stop reallocating', bigBatcher.bufferGrows === 0,
    `grew ${bigBatcher.bufferGrows} times over 60 settled frames`);

  const perEntityDraws = scaled;
  const reduction = perEntityDraws / bigDraws;
  check('draw calls drop by at least 5x at 5x population', reduction >= 5,
    `per-entity ${perEntityDraws} vs batched ${bigDraws}`);

  console.log(`\n  population ${base} -> ${scaled}, ${ARCHETYPES} archetypes`);
  console.log(`  per-entity draw calls : ${base} -> ${perEntityDraws}`);
  console.log(`  batched draw calls    : ${smallDraws} -> ${bigDraws}`);
  console.log(`  reduction at 5x       : ${reduction.toFixed(0)}x`);
  console.log(`  buffer reallocations in steady state : ${bigBatcher.bufferGrows}`);
}

// --- culling must be visible in the draw-call metric ---------------------------------------------
{
  const batcher = createBatchedInstanceRenderer();
  const snapshot = createPresentationSnapshot({ capacity: 64 });
  // Every entity of every archetype hidden.
  snapshot.beginFrame(12);
  for (let i = 0; i < 12; i++) snapshot.write(i, i % ARCHETYPES, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0);
  batcher.build(snapshot);
  check('a fully culled frame issues no draws', batcher.drawCalls === 0, String(batcher.drawCalls));
}

console.log(`\n${failures === 0 ? 'batched instance renderer: parity and scaling hold' : `${failures} assertion(s) failed`}`);
if (failures > 0) process.exit(1);
