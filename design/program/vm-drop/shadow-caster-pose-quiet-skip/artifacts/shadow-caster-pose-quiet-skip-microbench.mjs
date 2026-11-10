/**
 * Primary KPI: noteRealtimeShadowCasterPose under quiet parked cast-band roots.
 * Before = always call note* (sub-texel compare returns false).
 * After  = call-site quiet skip when pose/visibility/policy unchanged.
 * Soft-GPU fps not claimed.
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from 'three';
import {
  noteRealtimeShadowCasterPose,
  shouldNoteRealtimeShadowCasterPose,
  setShadowCasterPoseQuietSkipForBench,
  syncShadowCasterPolicy,
  SHADOW_ORTHO_EXTENT,
  SHADOW_MAP_SIZE,
} from '../src/render/shadowCasterPolicy.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ROOTS = 80;
const ITERS = 40000;

function makeRoots(n) {
  const roots = [];
  for (let i = 0; i < n; i++) {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(
      new THREE.BoxGeometry(8, 4, 12),
      new THREE.MeshStandardMaterial({ color: 0x8899aa }),
    ));
    root.position.set((i % 10) * 12, 0, Math.floor(i / 10) * 14);
    root.updateMatrixWorld(true);
    syncShadowCasterPolicy(root, 'lod0', { allowCast: true });
    // Seed pose.
    noteRealtimeShadowCasterPose(root, {
      visualRadius: 10,
      extent: SHADOW_ORTHO_EXTENT,
      mapSize: SHADOW_MAP_SIZE,
    });
    roots.push(root);
  }
  return roots;
}

function runOnce(skipOn, iters = ITERS) {
  setShadowCasterPoseQuietSkipForBench(skipOn);
  const roots = makeRoots(ROOTS);
  const opts = { visualRadius: 10, extent: SHADOW_ORTHO_EXTENT, mapSize: SHADOW_MAP_SIZE };
  // Warm
  for (let w = 0; w < 8; w++) {
    for (const root of roots) {
      if (shouldNoteRealtimeShadowCasterPose(root, {
        poseApplied: false, visibilityChanged: false, policyRefreshed: false,
      })) {
        noteRealtimeShadowCasterPose(root, opts);
      }
    }
  }
  const t0 = performance.now();
  let notes = 0;
  for (let i = 0; i < iters; i++) {
    for (const root of roots) {
      if (shouldNoteRealtimeShadowCasterPose(root, {
        poseApplied: false, visibilityChanged: false, policyRefreshed: false,
      })) {
        noteRealtimeShadowCasterPose(root, opts);
        notes++;
      }
    }
  }
  return { ms: performance.now() - t0, notes, skipOn, iters };
}

function isolatedPair() {
  const worker = `
    import * as THREE from 'three';
    import {
      noteRealtimeShadowCasterPose,
      shouldNoteRealtimeShadowCasterPose,
      setShadowCasterPoseQuietSkipForBench,
      syncShadowCasterPolicy,
      SHADOW_ORTHO_EXTENT,
      SHADOW_MAP_SIZE,
    } from '../src/render/shadowCasterPolicy.js';
    const ROOTS = ${ROOTS};
    const ITERS = ${ITERS};
    function makeRoots(n) {
      const roots = [];
      for (let i = 0; i < n; i++) {
        const root = new THREE.Group();
        root.add(new THREE.Mesh(new THREE.BoxGeometry(8, 4, 12), new THREE.MeshStandardMaterial({ color: 0x8899aa })));
        root.position.set((i % 10) * 12, 0, Math.floor(i / 10) * 14);
        root.updateMatrixWorld(true);
        syncShadowCasterPolicy(root, 'lod0', { allowCast: true });
        noteRealtimeShadowCasterPose(root, { visualRadius: 10, extent: SHADOW_ORTHO_EXTENT, mapSize: SHADOW_MAP_SIZE });
        roots.push(root);
      }
      return roots;
    }
    function runOnce(skipOn) {
      setShadowCasterPoseQuietSkipForBench(skipOn);
      const roots = makeRoots(ROOTS);
      const opts = { visualRadius: 10, extent: SHADOW_ORTHO_EXTENT, mapSize: SHADOW_MAP_SIZE };
      for (let w = 0; w < 8; w++) {
        for (const root of roots) {
          if (shouldNoteRealtimeShadowCasterPose(root, { poseApplied: false, visibilityChanged: false, policyRefreshed: false })) {
            noteRealtimeShadowCasterPose(root, opts);
          }
        }
      }
      const t0 = performance.now();
      let notes = 0;
      for (let i = 0; i < ITERS; i++) {
        for (const root of roots) {
          if (shouldNoteRealtimeShadowCasterPose(root, { poseApplied: false, visibilityChanged: false, policyRefreshed: false })) {
            noteRealtimeShadowCasterPose(root, opts);
            notes++;
          }
        }
      }
      return { ms: performance.now() - t0, notes };
    }
    runOnce(false); runOnce(true);
    const before = runOnce(false);
    const after = runOnce(true);
    console.log(JSON.stringify({
      beforeMs: before.ms, afterMs: after.ms,
      speedup: before.ms / Math.max(after.ms, 1e-9),
      beforeNotes: before.notes, afterNotes: after.notes,
    }));
  `;
  const scriptPath = join(__dirname, '_shadow-pose-quiet-worker.mjs');
  writeFileSync(scriptPath, worker);
  const r = spawnSync(process.execPath, [scriptPath], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`worker failed: ${r.stderr || r.stdout}`);
  const lines = String(r.stdout || '').trim().split(/\r?\n/).filter(Boolean);
  const jsonLine = [...lines].reverse().find((line) => line.startsWith('{'));
  if (!jsonLine) throw new Error(`no JSON: ${r.stdout}`);
  return JSON.parse(jsonLine);
}

runOnce(false, 2000);
runOnce(true, 2000);
const before = runOnce(false);
const after = runOnce(true);
const inProcess = {
  beforeMs: +before.ms.toFixed(3),
  afterMs: +after.ms.toFixed(3),
  speedup: +(before.ms / Math.max(after.ms, 1e-9)).toFixed(3),
  beforeNotes: before.notes,
  afterNotes: after.notes,
};
const isolated = [];
for (let i = 0; i < 11; i++) isolated.push(isolatedPair());
const speedups = isolated.map((p) => p.speedup).sort((a, b) => a - b);
const out = {
  label: 'shadow-caster-pose-quiet-skip',
  scenario: { roots: ROOTS, iters: ITERS },
  inProcess,
  isolatedPairs: isolated.map((p) => ({
    speedup: +p.speedup.toFixed(3),
    beforeMs: +p.beforeMs.toFixed(3),
    afterMs: +p.afterMs.toFixed(3),
    beforeNotes: p.beforeNotes,
    afterNotes: p.afterNotes,
  })),
  medianSpeedup: +speedups[Math.floor(speedups.length / 2)].toFixed(3),
  floorMinSpeedup: +speedups[0].toFixed(3),
};
writeFileSync(join(__dirname, 'shadow-caster-pose-quiet-skip-microbench.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
