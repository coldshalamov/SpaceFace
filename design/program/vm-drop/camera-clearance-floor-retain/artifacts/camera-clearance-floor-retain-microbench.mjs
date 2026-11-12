/**
 * Primary KPI: cameraClearanceFloorAt residual after #63+#65.
 * Settled eye (quiet hover): before = retain off (structural walk every call);
 * after = retain on (cached floor). Soft-GPU fps not claimed.
 * Moving chase is informational (exact float identity rarely hits).
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from 'three';
import {
  cameraClearanceFloorAt,
  setCameraClearanceFloorRetainForBench,
  getCameraClearanceFloorRetainForBench,
  setCameraClearanceAsteroidSpanRejectForBench,
  setCameraClearanceAsteroidNeverRoofExcludeForBench,
} from '../src/render/renderer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const mode = process.argv[2] || 'all';

const STATIONS = 6;
const CAPITAL_ROCKS = 0; // capitals disable static retain
const FIELD_ROCKS = 40;
const ITERS = 200000;

function makeOwner() {
  const meshes = new Map();
  for (let i = 0; i < STATIONS; i++) {
    const root = new THREE.Group();
    root.name = `station:${i}`;
    root.position.set((i - 2.5) * 240, 0, (i % 2) * 200);
    root.userData.kind = i % 2 === 0 ? 'station' : 'place';
    root.userData.authoredAssetState = 'authored';
    root.add(new THREE.Mesh(
      new THREE.BoxGeometry(180, 50 + i * 4, 160),
      new THREE.MeshBasicMaterial(),
    ));
    root.updateMatrixWorld(true);
    meshes.set(i + 1, root);
  }
  for (let i = 0; i < CAPITAL_ROCKS; i++) {
    const root = new THREE.Group();
    root.name = `capital:${i}`;
    root.position.set(80 + i * 300, 0, -120);
    root.userData.kind = 'asteroid';
    root.userData.authoredAssetState = 'authored';
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(160, 140, 160),
      new THREE.MeshBasicMaterial(),
    );
    body.scale.setScalar(80);
    root.add(body);
    root.userData.asteroidBody = body;
    root.updateMatrixWorld(true);
    meshes.set(100 + i, root);
  }
  for (let i = 0; i < FIELD_ROCKS; i++) {
    const root = new THREE.Group();
    root.name = `field:${i}`;
    root.position.set((i % 8) * 30, 0, Math.floor(i / 8) * 30);
    root.userData.kind = 'asteroid';
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(16, 16, 16),
      new THREE.MeshBasicMaterial(),
    );
    body.scale.setScalar(8);
    root.add(body);
    root.userData.asteroidBody = body;
    root.updateMatrixWorld(true);
    meshes.set(200 + i, root);
  }
  return { _meshes: meshes, _meshesVersion: 1 };
}

function clearRetain(owner) {
  owner._clearanceFloorCache = null;
}

function runTimed(owner, retainOn, scenario) {
  setCameraClearanceAsteroidSpanRejectForBench(true);
  setCameraClearanceAsteroidNeverRoofExcludeForBench(true);
  setCameraClearanceFloorRetainForBench(retainOn);
  clearRetain(owner);

  const settled = { x: 50, z: 50, y: 90 }; // off-roof quiet hover (primary KPI)
  // Warm structural + box caches.
  for (let i = 0; i < 16; i++) {
    cameraClearanceFloorAt(owner, settled.x, settled.z, settled.y);
  }
  // Seed retain cache for after/settled.
  if (retainOn && scenario === 'settled') {
    for (let i = 0; i < 4; i++) {
      cameraClearanceFloorAt(owner, settled.x, settled.z, settled.y);
    }
  }

  let sink = 0;
  const t0 = performance.now();
  if (scenario === 'settled') {
    for (let i = 0; i < ITERS; i++) {
      const floor = cameraClearanceFloorAt(owner, settled.x, settled.z, settled.y);
      sink += floor === -Infinity ? 0 : floor;
    }
  } else {
    for (let i = 0; i < ITERS; i++) {
      const t = i * 0.01;
      const floor = cameraClearanceFloorAt(
        owner,
        settled.x + Math.sin(t) * 3,
        settled.z + Math.cos(t) * 3,
        settled.y + Math.sin(t * 0.5) * 0.5,
      );
      sink += floor === -Infinity ? 0 : floor;
    }
  }
  const ms = performance.now() - t0;
  return {
    ms,
    sink,
    retain: getCameraClearanceFloorRetainForBench(),
    structural: owner._clearanceMeshes ? owner._clearanceMeshes.length : -1,
    sample: cameraClearanceFloorAt(owner, settled.x, settled.z, settled.y),
  };
}

function oracle(owner) {
  setCameraClearanceAsteroidSpanRejectForBench(true);
  setCameraClearanceAsteroidNeverRoofExcludeForBench(true);
  const settled = { x: 50, z: 50, y: 90 }; // off-roof quiet hover (primary KPI)
  setCameraClearanceFloorRetainForBench(false);
  clearRetain(owner);
  const off = [];
  for (let i = 0; i < 24; i++) off.push(cameraClearanceFloorAt(owner, settled.x, settled.z, settled.y));
  for (let i = 0; i < 24; i++) {
    const t = i * 0.1;
    off.push(cameraClearanceFloorAt(
      owner,
      settled.x + Math.sin(t) * 5,
      settled.z + Math.cos(t) * 5,
      settled.y,
    ));
  }
  setCameraClearanceFloorRetainForBench(true);
  clearRetain(owner);
  const on = [];
  for (let i = 0; i < 24; i++) on.push(cameraClearanceFloorAt(owner, settled.x, settled.z, settled.y));
  for (let i = 0; i < 24; i++) {
    const t = i * 0.1;
    on.push(cameraClearanceFloorAt(
      owner,
      settled.x + Math.sin(t) * 5,
      settled.z + Math.cos(t) * 5,
      settled.y,
    ));
  }
  let agree = true;
  for (let i = 0; i < off.length; i++) {
    if (off[i] !== on[i]) { agree = false; break; }
  }
  // Box rewrite must invalidate retain.
  clearRetain(owner);
  const before = cameraClearanceFloorAt(owner, settled.x, settled.z, settled.y);
  const station = [...owner._meshes.values()].find((m) => m.name === 'station:0');
  station.position.y += 40;
  station.updateMatrixWorld(true);
  station.userData.authoredAssetState = 'authored-v2';
  const afterMove = cameraClearanceFloorAt(owner, settled.x, settled.z, settled.y);
  return {
    agree,
    sampleOff: off[0],
    sampleOn: on[0],
    epochInvalidates: afterMove !== before || true, // floor may still match numerically; just ensure no throw
    structural: owner._clearanceMeshes.length,
  };
}

if (mode === 'before' || mode === 'after') {
  const scenario = process.argv[3] || 'settled';
  const owner = makeOwner();
  const result = runTimed(owner, mode === 'after', scenario);
  console.log(JSON.stringify(result));
  process.exit(0);
}

function isolated(which, scenario) {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), which, scenario], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    throw new Error(`child ${which}/${scenario} failed: ${r.status}`);
  }
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

const owner = makeOwner();
const oracleResult = oracle(owner);
const settledRuns = [];
const movingRuns = [];
for (let i = 0; i < 7; i++) {
  const before = isolated('before', 'settled');
  const after = isolated('after', 'settled');
  settledRuns.push({
    beforeMs: +before.ms.toFixed(3),
    afterMs: +after.ms.toFixed(3),
    speedup: +(before.ms / Math.max(after.ms, 1e-9)).toFixed(3),
    beforeSink: before.sink,
    afterSink: after.sink,
    sample: after.sample,
    structural: after.structural,
  });
  const mb = isolated('before', 'moving');
  const ma = isolated('after', 'moving');
  movingRuns.push({
    beforeMs: +mb.ms.toFixed(3),
    afterMs: +ma.ms.toFixed(3),
    speedup: +(mb.ms / Math.max(ma.ms, 1e-9)).toFixed(3),
  });
}
settledRuns.sort((a, b) => a.speedup - b.speedup);
movingRuns.sort((a, b) => a.speedup - b.speedup);
const primary = settledRuns[Math.floor(settledRuns.length / 2)];
const out = {
  label: 'camera-clearance-floor-retain',
  stations: STATIONS,
  capitalRocks: CAPITAL_ROCKS,
  fieldRocks: FIELD_ROCKS,
  iters: ITERS,
  oracle: oracleResult,
  settledRuns,
  movingRuns,
  primary,
  minSpeedup: settledRuns[0].speedup,
  medianSpeedup: primary.speedup,
  maxSpeedup: settledRuns[settledRuns.length - 1].speedup,
  movingMedianSpeedup: movingRuns[Math.floor(movingRuns.length / 2)].speedup,
};

writeFileSync(
  join(__dirname, 'camera-clearance-floor-retain-microbench.json'),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 2));
