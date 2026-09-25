/**
 * #157 sync-entity-lod-retain — offline microbench (portable CPU).
 * Soft-GPU fps is NOT a KPI. Picture contract ON (same hysteresis band ⇒ identical LOD).
 *
 * Before = always call updateLod with asteroid/station-style always-traverse (bare master).
 * After  = central retain gate (skip updateLod when band unchanged), matching production patch.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as THREE from 'three';
import { projectedWidthPx, createLodState } from '../src/render/lod.js';
import { applyProjectedDetailLod } from '../src/render/hlod.js';

const ITERS = 20000;
const WARM = 500;

function makeTree(nChildren, greebleEvery = 3) {
  const root = {
    visible: true, name: 'root', userData: {}, children: [],
    position: new THREE.Vector3(),
    traverse(fn) { fn(this); for (const c of this.children) c.traverse(fn); },
  };
  for (let i = 0; i < nChildren; i++) {
    const greeble = i % greebleEvery === 0;
    root.children.push({
      isMesh: true, visible: true,
      name: greeble ? `greeble_${i}` : `part_${i}`,
      userData: { spacefaceTags: greeble ? { greeble: true } : {} },
      children: [], traverse(fn) { fn(this); },
    });
  }
  return root;
}

function buildEntities() {
  const ents = [];
  for (let i = 0; i < 36; i++) {
    const mesh = makeTree(4, 99); // ships: no greeble traverse cost; self-retain inside updateLod
    mesh.position.set((i % 10) * 40, 0, Math.floor(i / 10) * 40);
    let last = null;
    mesh.userData.updateLod = (level) => {
      if (level === last) return;
      last = level;
      const show = level !== 'lod2';
      for (const c of mesh.children) if (c.name.startsWith('decal')) c.visible = show;
    };
    ents.push({ mesh, radius: 8, lod: createLodState(), applied: undefined, kind: 'ship' });
  }
  for (let i = 0; i < 11; i++) {
    const mesh = makeTree(6, 2);
    mesh.position.set(200 + (i % 5) * 60, 0, 200 + Math.floor(i / 5) * 60);
    // Bare-master asteroid: always traverse
    mesh.userData.updateLod = (level) => { applyProjectedDetailLod(mesh, level); };
    ents.push({ mesh, radius: 12, lod: createLodState(), applied: undefined, kind: 'asteroid' });
  }
  for (let i = 0; i < 3; i++) {
    const mesh = makeTree(80, 3);
    mesh.position.set(-300 - i * 150, 0, 100);
    mesh.userData.updateLod = (level) => { applyProjectedDetailLod(mesh, level); };
    ents.push({ mesh, radius: 80, lod: createLodState(), applied: undefined, kind: 'station' });
  }
  return ents;
}

function runPass(ents, retain, camera, viewport) {
  let calls = 0;
  for (const e of ents) {
    const px = projectedWidthPx(e.mesh.position, e.radius, camera, viewport);
    const level = e.lod.resolve(px);
    if (!retain || e.applied !== level) {
      e.mesh.userData.updateLod(level);
      e.applied = level;
      calls++;
    }
  }
  return calls;
}

function benchOnce(retain) {
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 1, 20000);
  camera.position.set(0, 140, 0);
  const viewport = { width: 1280, height: 720 };
  const ents = buildEntities();
  // Warm / settle hysteresis so retain path is the steady state
  for (let i = 0; i < WARM; i++) runPass(ents, retain, camera, viewport);
  // Reset applied so first timed iter re-applies once, then retains — matches cold-then-steady.
  // For fair steady-state, set applied after warm already:
  // (warm already filled e.applied when retain=true)
  const t0 = performance.now();
  let calls = 0;
  for (let i = 0; i < ITERS; i++) calls += runPass(ents, retain, camera, viewport);
  const us = ((performance.now() - t0) * 1000) / ITERS;
  return { us, calls, callsPerIter: calls / ITERS };
}

function pairOnce() {
  // Isolated ordering: before then after, fresh graphs each
  const before = benchOnce(false);
  const after = benchOnce(true);
  return {
    beforeUs: +before.us.toFixed(3),
    afterUs: +after.us.toFixed(3),
    speedup: +(before.us / Math.max(1e-9, after.us)).toFixed(3),
    beforeCallsPerIter: +before.callsPerIter.toFixed(2),
    afterCallsPerIter: +after.callsPerIter.toFixed(2),
  };
}

function dirtyWakeProof() {
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 1, 20000);
  camera.position.set(0, 140, 0);
  const viewport = { width: 1280, height: 720 };
  const ents = buildEntities();
  // Settle at current camera
  for (let i = 0; i < 30; i++) runPass(ents, true, camera, viewport);
  const callsQuiet = runPass(ents, true, camera, viewport);
  // Move camera close so projected size jumps across hysteresis
  camera.position.set(200, 20, 200);
  const callsWake = runPass(ents, true, camera, viewport);
  return { callsQuiet, callsWake, woke: callsWake > callsQuiet };
}

function main() {
  const pairs = [];
  for (let i = 0; i < 11; i++) pairs.push(pairOnce());
  const speedups = pairs.map((p) => p.speedup).sort((a, b) => a - b);
  const median = speedups[Math.floor(speedups.length / 2)];
  const floor = speedups[0];
  const beforeMed = pairs.map((p) => p.beforeUs).sort((a, b) => a - b)[5];
  const afterMed = pairs.map((p) => p.afterUs).sort((a, b) => a - b)[5];
  const wake = dirtyWakeProof();
  const out = {
    scenario: 'quiet-mix-36ship+11asteroid+3station × 20k frames (11 isolated pairs)',
    medianSpeedup: median,
    floorMinSpeedup: floor,
    beforeUsMedian: beforeMed,
    afterUsMedian: afterMed,
    pairs,
    dirtyWake: wake,
    pictureContract: 'ON — identical LOD band retained; updateLod only on band change',
    softGpuFpsClaimed: false,
  };
  writeFileSync('artifacts/sync-entity-lod-retain-microbench.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify({
    medianSpeedup: median,
    floorMinSpeedup: floor,
    beforeUsMedian: beforeMed,
    afterUsMedian: afterMed,
    dirtyWake: wake,
  }, null, 2));
}

if (process.argv.includes('--child-pair')) {
  const r = pairOnce();
  writeFileSync(process.argv[process.argv.indexOf('--child-pair') + 1], JSON.stringify(r));
  process.exit(0);
}

main();
