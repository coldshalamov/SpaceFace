/**
 * Primary KPI: cameraClearanceFloorAt residual after #63 span-reject.
 * Quiet Ceres field rocks drift every WU; #63 still walks them (pos-cache miss →
 * re-reject). After = sticky never-roof + structural exclude so undersized
 * asteroids leave the per-frame walk. Soft-GPU fps not claimed.
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
  setCameraClearanceAsteroidNeverRoofExcludeForBench,
  getCameraClearanceAsteroidNeverRoofExcludeForBench,
} from '../src/render/renderer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const mode = process.argv[2] || 'all';

const ASTEROIDS = 60;
const STATIONS = 3;
const FRAMES = 20000;
const DRIFT_WU = 1.05;

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
    meshes.set(id++, makeAsteroid(i, 8 + (i % 5)));
  }
  for (let i = 0; i < STATIONS; i++) {
    meshes.set(id++, makeStation(i));
  }
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

function clearCaches(owner) {
  owner._clearanceMeshesVersion = -1;
  owner._clearanceMeshes = null;
  for (const mesh of owner._meshes.values()) {
    if (!mesh.userData) continue;
    delete mesh.userData.cameraClearanceBox;
    delete mesh.userData.cameraClearanceNeverRoof;
    delete mesh.userData.cameraClearanceNeverRoofScale;
  }
}

function runFloor(owner, excludeEnabled) {
  setCameraClearanceAsteroidSpanRejectForBench(true);
  setCameraClearanceAsteroidNeverRoofExcludeForBench(excludeEnabled);
  clearCaches(owner);
  let sink = 0;
  const camY = 10;
  // Warm rebuild outside the timed window.
  cameraClearanceFloorAt(owner, 200, 0, camY);
  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) {
    // Bust #63 pos-keyed caches on the structural walk only — same miss rate as
    // 1.05 WU drift without O(all-meshes) position writes diluting the pole.
    const list = owner._clearanceMeshes;
    if (list) {
      for (let i = 0; i < list.length; i++) {
        const c = list[i].userData && list[i].userData.cameraClearanceBox;
        if (c) c.posX = (c.posX + 1) | 0;
      }
    }
    const floor = cameraClearanceFloorAt(owner, 200, 0, camY);
    sink += Number.isFinite(floor) ? floor : 0;
  }
  const ms = performance.now() - t0;
  const structural = owner._clearanceMeshes ? owner._clearanceMeshes.length : -1;
  return {
    ms,
    sink,
    structural,
    exclude: getCameraClearanceAsteroidNeverRoofExcludeForBench(),
  };
}

function oracle(owner) {
  const capital = [...owner._meshes.values()].find((m) => m.name === 'asteroid:999');
  const station = [...owner._meshes.values()].find((m) => m.name === 'station:0');
  const small = [...owner._meshes.values()].find((m) => m.name === 'asteroid:0');
  const cy = 10;

  setCameraClearanceAsteroidSpanRejectForBench(true);
  setCameraClearanceAsteroidNeverRoofExcludeForBench(true);
  clearCaches(owner);
  const capitalEx = cameraClearanceFloorAt(owner, capital.position.x, capital.position.z, cy);
  const structuralEx = owner._clearanceMeshes.length;
  clearCaches(owner);
  const stationEx = cameraClearanceFloorAt(owner, station.position.x, station.position.z, cy);
  clearCaches(owner);
  const smallEx = cameraClearanceFloorAt(owner, small.position.x, small.position.z, cy);

  setCameraClearanceAsteroidNeverRoofExcludeForBench(false);
  clearCaches(owner);
  const capitalNo = cameraClearanceFloorAt(owner, capital.position.x, capital.position.z, cy);
  const structuralNo = owner._clearanceMeshes.length;
  clearCaches(owner);
  const stationNo = cameraClearanceFloorAt(owner, station.position.x, station.position.z, cy);
  clearCaches(owner);
  const smallNo = cameraClearanceFloorAt(owner, small.position.x, small.position.z, cy);

  setCameraClearanceAsteroidNeverRoofExcludeForBench(true);
  return {
    capitalParity: capitalEx === capitalNo && Number.isFinite(capitalEx) && capitalEx > -Infinity,
    stationParity: stationEx === stationNo && Number.isFinite(stationEx) && stationEx > -Infinity,
    smallRejectedBoth: smallEx === -Infinity && smallNo === -Infinity,
    structuralWithExclude: structuralEx,
    structuralWithoutExclude: structuralNo,
    structuralReduced: structuralEx < structuralNo && structuralEx === STATIONS + 1, // stations + capital
  };
}

if (mode === 'before' || mode === 'after') {
  const owner = makeOwner();
  const result = runFloor(owner, mode === 'after');
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
    beforeStructural: before.structural,
    afterStructural: after.structural,
  });
}
runs.sort((a, b) => a.speedup - b.speedup);
const primary = runs[Math.floor(runs.length / 2)];
const out = {
  label: 'camera-clearance-never-roof-exclude',
  asteroids: ASTEROIDS,
  stations: STATIONS,
  frames: FRAMES,
  driftWu: DRIFT_WU,
  oracle: oracleResult,
  runs,
  primary,
  minSpeedup: runs[0].speedup,
  medSpeedup: primary.speedup,
  maxSpeedup: runs[runs.length - 1].speedup,
  note: 'Portable clearance residual after #63. Soft-GPU fps not claimed. Before=#63 span-reject structural walk with pos-cache bust; After=sticky never-roof structural exclude.',
};
writeFileSync(join(__dirname, 'camera-clearance-never-roof-exclude-microbench.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
