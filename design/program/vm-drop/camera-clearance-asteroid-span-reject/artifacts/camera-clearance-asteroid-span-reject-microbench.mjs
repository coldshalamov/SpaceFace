/**
 * Primary KPI: cameraClearanceFloorAt under quiet Ceres-shaped structural lists
 * where field rocks drift (cache invalidates every WU) but cannot clear the 120 WU
 * span bar. Before = always setFromObject on miss; After = asteroid radius hint
 * rejects before setFromObject. Soft-GPU fps not claimed.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from 'three';
import {
  cameraClearanceFloorAt,
  setCameraClearanceAsteroidSpanRejectForBench,
  getCameraClearanceAsteroidSpanRejectForBench,
} from '../src/render/renderer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const mode = process.argv[2] || 'all';

const ASTEROIDS = 60;
const STATIONS = 3;
const FRAMES = 8000;
const DRIFT_WU = 1.05; // forces Math.round pos cache miss every frame

function makeAsteroid(id, radius) {
  const root = new THREE.Group();
  root.name = `asteroid:${id}`;
  root.position.set(id * 17, 0, (id % 7) * 13);
  root.userData.kind = 'asteroid';
  const geo = new THREE.SphereGeometry(1, 8, 6);
  const body = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  body.scale.setScalar(radius);
  root.add(body);
  root.userData.asteroidBody = body;
  return root;
}

function makeStation(id) {
  const root = new THREE.Group();
  root.name = `station:${id}`;
  root.position.set(200 + id * 40, 0, 0);
  root.userData.kind = 'station';
  root.userData.authoredAssetState = 'authored';
  root.add(new THREE.Mesh(
    new THREE.BoxGeometry(180, 80, 160),
    new THREE.MeshBasicMaterial(),
  ));
  return root;
}

function makeOwner() {
  const meshes = new Map();
  let id = 1;
  for (let i = 0; i < ASTEROIDS; i++) {
    // Quiet field rocks — common radius ~8–16; span hint 2.5R << 120.
    meshes.set(id++, makeAsteroid(i, 8 + (i % 5)));
  }
  for (let i = 0; i < STATIONS; i++) {
    meshes.set(id++, makeStation(i));
  }
  // One capital rock that MUST still take setFromObject (hint >= 120).
  const capital = makeAsteroid(999, 70);
  capital.position.set(-400, 0, 0);
  meshes.set(id++, capital);
  return {
    _meshes: meshes,
    _meshesVersion: 1,
    _clearanceMeshesVersion: -1,
    _clearanceMeshes: null,
  };
}

function runFloor(owner, rejectEnabled) {
  setCameraClearanceAsteroidSpanRejectForBench(rejectEnabled);
  // Cold structural rebuild + clear caches so both modes pay first-touch equally.
  owner._clearanceMeshesVersion = -1;
  for (const mesh of owner._meshes.values()) {
    if (mesh.userData) delete mesh.userData.cameraClearanceBox;
  }
  let sink = 0;
  const camY = 10;
  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) {
    // Drift every structural mesh so the numeric cache misses each frame.
    for (const mesh of owner._meshes.values()) {
      mesh.position.x += DRIFT_WU;
    }
    const floor = cameraClearanceFloorAt(owner, 200, 0, camY);
    sink += Number.isFinite(floor) ? floor : 0;
  }
  const ms = performance.now() - t0;
  return { ms, sink, reject: getCameraClearanceAsteroidSpanRejectForBench() };
}

function oracle(owner) {
  // Capital rock (R=70, hint=175, sphere span=140) must still roof under reject path.
  function clearCaches() {
    owner._clearanceMeshesVersion = -1;
    for (const mesh of owner._meshes.values()) {
      if (mesh.userData) delete mesh.userData.cameraClearanceBox;
    }
  }
  const capital = [...owner._meshes.values()].find((m) => m.name === 'asteroid:999');
  const station = [...owner._meshes.values()].find((m) => m.name === 'station:0');
  const cy = 10;
  setCameraClearanceAsteroidSpanRejectForBench(true);
  clearCaches();
  const capitalWith = cameraClearanceFloorAt(owner, capital.position.x, capital.position.z, cy);
  clearCaches();
  const stationWith = cameraClearanceFloorAt(owner, station.position.x, station.position.z, cy);
  setCameraClearanceAsteroidSpanRejectForBench(false);
  clearCaches();
  const capitalWithout = cameraClearanceFloorAt(owner, capital.position.x, capital.position.z, cy);
  clearCaches();
  const stationWithout = cameraClearanceFloorAt(owner, station.position.x, station.position.z, cy);
  setCameraClearanceAsteroidSpanRejectForBench(true);
  clearCaches();
  const small = [...owner._meshes.values()].find((m) => m.name === 'asteroid:0');
  const smallFloor = cameraClearanceFloorAt(owner, small.position.x, small.position.z, cy);
  return {
    capitalWithReject: capitalWith,
    capitalWithoutReject: capitalWithout,
    capitalParity: capitalWith === capitalWithout && Number.isFinite(capitalWith) && capitalWith > -Infinity,
    stationParity: stationWith === stationWithout && Number.isFinite(stationWith) && stationWith > -Infinity,
    smallRejected: smallFloor === -Infinity,
  };
}

if (mode === 'before' || mode === 'after') {
  const owner = makeOwner();
  const result = runFloor(owner, mode === 'after');
  writeFileSync(join(__dirname, `camera-clearance-asteroid-span-reject-${mode}.json`), JSON.stringify(result));
  console.log(JSON.stringify(result));
  process.exit(0);
}

function isolated(which) {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), which], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    throw new Error(`child ${which} failed: ${r.status}`);
  }
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

const owner = makeOwner();
const oracleResult = oracle(owner);
const runs = [];
for (let i = 0; i < 5; i++) {
  const before = isolated('before');
  const after = isolated('after');
  runs.push({
    beforeMs: +before.ms.toFixed(3),
    afterMs: +after.ms.toFixed(3),
    speedup: +(before.ms / Math.max(after.ms, 1e-9)).toFixed(3),
    beforeSink: before.sink,
    afterSink: after.sink,
  });
}
runs.sort((a, b) => a.speedup - b.speedup);
const primary = runs[Math.floor(runs.length / 2)];
const out = {
  label: 'camera-clearance-asteroid-span-reject',
  asteroids: ASTEROIDS,
  stations: STATIONS,
  frames: FRAMES,
  driftWu: DRIFT_WU,
  oracle: oracleResult,
  runs,
  primary,
  minSpeedup: runs[0].speedup,
  note: 'Portable clearance floor. Soft-GPU fps not claimed. Before=setFromObject on every drifted miss; After=asteroid 2.5R hint reject.',
};
writeFileSync(join(__dirname, 'camera-clearance-asteroid-span-reject-microbench.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
