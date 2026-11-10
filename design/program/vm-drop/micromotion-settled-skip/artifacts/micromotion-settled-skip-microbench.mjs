/**
 * Primary KPI: quiet updateCraftMicroMotion cost for parked craft.
 * Before = always full RCS/gimbal/bell/haul springs (bench toggle off).
 * After  = settled fast-path (idle breath + turret/drill only).
 * Soft-GPU fps not claimed.
 */
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import {
  createShipMicroMotionTracker,
  setCraftMicroMotionSettledSkipForBench,
  getCraftMicroMotionSettledSkipForBench,
} from '../src/render/shipMicroMotion.js';

const SHIPS = 80;
const FRAMES = 4000;

function makeEntity(id) {
  return {
    id,
    type: 'ship',
    mass: 400,
    radius: 12,
    rot: 0,
    bank: 0,
    pitch: 0,
    angVel: 0,
    hull: 100,
    hullMax: 100,
    shield: 50,
    pos: { x: id * 10, z: 0 },
    vel: { x: 0, z: 0 },
    flags: {},
    data: {},
  };
}

function makeMesh() {
  const hull = {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: {
      x: 1, y: 1, z: 1,
      set(x, y, z) { this.x = x; this.y = y; this.z = z; },
    },
    userData: {},
  };
  return {
    userData: { hull },
    visible: true,
    position: { x: 0, y: 0, z: 0 },
    rotation: { y: 0 },
  };
}

function run(settledSkip) {
  const restore = getCraftMicroMotionSettledSkipForBench();
  setCraftMicroMotionSettledSkipForBench(settledSkip);
  const tracker = createShipMicroMotionTracker();
  const entities = [];
  const meshes = [];
  for (let i = 0; i < SHIPS; i++) {
    entities.push(makeEntity(i + 1));
    meshes.push(makeMesh());
  }
  const entityMap = new Map(entities.map((e) => [e.id, e]));
  const opts = {
    motionReduce: false,
    playerId: 1,
    entities: entityMap,
    tetherActive: false,
  };
  let t = 0;
  // warm — reach settled state
  for (let f = 0; f < 120; f++) {
    t += 1 / 60;
    for (let i = 0; i < SHIPS; i++) {
      // Pose-apply stand-in: production resets bank/pitch before micromotion when dirty.
      meshes[i].userData.hull.rotation.x = entities[i].bank || 0;
      meshes[i].userData.hull.rotation.z = entities[i].pitch || 0;
      tracker.updateCraftMicroMotion(entities[i], meshes[i], t, 1 / 60, opts);
    }
  }
  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) {
    t += 1 / 60;
    for (let i = 0; i < SHIPS; i++) {
      meshes[i].userData.hull.rotation.x = entities[i].bank || 0;
      meshes[i].userData.hull.rotation.z = entities[i].pitch || 0;
      tracker.updateCraftMicroMotion(entities[i], meshes[i], t, 1 / 60, opts);
    }
  }
  const ms = performance.now() - t0;
  // Sample idle breath still alive on ship 0
  const heave = meshes[0].userData.hull.position.y;
  const roll = meshes[0].userData.hull.rotation.x;
  setCraftMicroMotionSettledSkipForBench(restore);
  return {
    ms: +ms.toFixed(3),
    ships: SHIPS,
    frames: FRAMES,
    calls: SHIPS * FRAMES,
    heave: +heave.toFixed(6),
    roll: +roll.toFixed(6),
    settledSkip: !!settledSkip,
  };
}

const before = run(false);
const after = run(true);
const speedup = before.ms / Math.max(1e-9, after.ms);
const out = {
  label: 'micromotion-settled-skip',
  before,
  after,
  speedup: +speedup.toFixed(3),
  breathAlive: Math.abs(after.heave) > 1e-6 || Math.abs(after.roll) > 1e-6,
  note: 'Portable CPU. Soft-GPU fps not claimed. Before=full path; After=settled fast-path (idle breath kept).',
};
writeFileSync(
  new URL('./micromotion-settled-skip-microbench.json', import.meta.url),
  `${JSON.stringify(out, null, 2)}\n`,
);
console.log(JSON.stringify(out, null, 2));
