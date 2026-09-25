/**
 * Primary KPI: cameraClearanceFloorAt under quiet chase drift after #73.
 * Before = retain on, pos-quantize OFF (bit-identical keys — drift misses every frame).
 * After  = retain on, pos-quantize ON (0.25 WU cell — drift hits within cell).
 * Soft-GPU fps not claimed.
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
  setCameraClearanceFloorRetainPosQuantizeForBench,
  setCameraClearanceAsteroidSpanRejectForBench,
  setCameraClearanceAsteroidNeverRoofExcludeForBench,
} from '../src/render/renderer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const STATIONS = 8;
const FIELD_ROCKS = 40;
const ITERS = 400000;

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

function runTimed(quantizeOn) {
  setCameraClearanceAsteroidSpanRejectForBench(true);
  setCameraClearanceAsteroidNeverRoofExcludeForBench(true);
  setCameraClearanceFloorRetainForBench(true);
  setCameraClearanceFloorRetainPosQuantizeForBench(quantizeOn);

  const owner = makeOwner();
  owner._clearanceFloorCache = null;

  // Off-roof quiet chase: base far from stations; drift ≪ 0.25 WU cell.
  const base = { x: 50, z: 50, y: 90 };

  for (let i = 0; i < 32; i++) {
    cameraClearanceFloorAt(owner, base.x, base.z, base.y);
  }

  let sink = 0;
  const t0 = performance.now();
  // Stay strictly inside one 0.25 WU retain cell (half-cell = 0.125).
  for (let i = 0; i < ITERS; i++) {
    const x = base.x + ((i * 0.011) % 0.12);
    const z = base.z + ((i * 0.007) % 0.12);
    const y = base.y + ((i * 0.003) % 0.12);
    const floor = cameraClearanceFloorAt(owner, x, z, y);
    sink += floor === -Infinity ? 1 : 0;
  }
  const ms = performance.now() - t0;
  return { ms, sink, quantizeOn, iters: ITERS };
}

if (process.argv[2] === 'child') {
  const quantizeOn = process.argv[3] === '1';
  const result = runTimed(quantizeOn);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(0);
}

function isolated(quantizeOn) {
  const r = spawnSync(
    process.execPath,
    [__filename, 'child', quantizeOn ? '1' : '0'],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'child failed');
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

const PAIR_RUNS = 11;
const pairs = [];
for (let i = 0; i < PAIR_RUNS; i++) {
  const before = isolated(false);
  const after = isolated(true);
  const speedup = after.ms > 0 ? before.ms / after.ms : 0;
  pairs.push({ beforeMs: before.ms, afterMs: after.ms, speedup, beforeSink: before.sink, afterSink: after.sink });
  console.log(`pair ${i}: before=${before.ms.toFixed(1)}ms after=${after.ms.toFixed(1)}ms speedup=${speedup.toFixed(3)}× sink ${before.sink}/${after.sink}`);
}

const speedups = pairs.map((p) => p.speedup).sort((a, b) => a - b);
const median = speedups[Math.floor(speedups.length / 2)];
const floorMin = Math.min(...speedups);
const out = {
  label: 'camera-clearance-floor-retain-pos-quantize',
  scenario: 'quiet-chase-drift-off-roof',
  iters: ITERS,
  stations: STATIONS,
  fieldRocks: FIELD_ROCKS,
  pairs,
  medianSpeedup: median,
  floorMinSpeedup: floorMin,
  note: 'Before=retain+bit-identical (drift miss); After=retain+0.25WU quantize (drift hit). Soft-GPU fps not claimed.',
};
writeFileSync(
  join(__dirname, 'camera-clearance-floor-retain-pos-quantize-microbench.json'),
  `${JSON.stringify(out, null, 2)}\n`,
);
console.log(JSON.stringify({ medianSpeedup: median, floorMinSpeedup: floorMin }, null, 2));
if (median < 1.5 || floorMin < 1.35) {
  console.error('BELOW BAR');
  process.exit(2);
}
