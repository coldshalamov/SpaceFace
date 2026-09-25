/**
 * Portable microbench: emergent hot-path with vs without spatial hash.
 * Soft-GPU fps is not a KPI — walk time only.
 */
import { SpatialHash } from './src/core/spatialHash.js';
import { ensureEmergent, tickEmergent } from './src/systems/emergentPrimitives.js';
import { EMERGENT_TUNING as T } from './src/data/emergentPrimitives.js';

function makeEntity(id, x, z, extras = {}) {
  return {
    id,
    type: extras.type || 'ship',
    alive: true,
    collides: true,
    radius: extras.radius || 4,
    mass: extras.mass || 24,
    pos: { x, z },
    vel: { x: (id % 5) - 2, z: (id % 3) - 1 },
    rot: 0,
    angVel: 0,
    heat: 0,
    hull: 100,
    hullMax: 100,
    shield: 0,
    conductivity: extras.conductivity || 0.2,
    data: {},
    ...extras,
  };
}

function buildCrowd(n) {
  const list = [makeEntity(1, 0, 0, { type: 'ship', isPlayer: true, radius: 5, conductivity: 0.9 })];
  for (let i = 2; i <= n; i++) {
    const a = (i * 2.399963) % (Math.PI * 2);
    const r = 20 + (i % 120) * 8;
    list.push(makeEntity(i, Math.cos(a) * r, Math.sin(a) * r, {
      type: i % 7 === 0 ? 'asteroid' : 'ship',
      radius: 3 + (i % 5),
      conductivity: i % 3 === 0 ? 0.9 : 0.1,
    }));
  }
  return list;
}

function rebuildHash(state) {
  if (!state.spatialHash) state.spatialHash = new SpatialHash(64);
  state.spatialHash.rebuild(state.entityList);
  return state.spatialHash.diagnostics.activeBuckets;
}

function disarmHash(state) {
  if (state.spatialHash && state.spatialHash.diagnostics) {
    state.spatialHash.diagnostics.activeBuckets = 0;
  }
}

function armHot(state) {
  const world = ensureEmergent(state);
  world.hot = true;
  world.fields.length = 0;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    world.fields.push({
      x: Math.cos(a) * 80, z: Math.sin(a) * 80,
      radius: T.viscosityRadius || 56,
      axisX: 1, axisZ: 0, life: 100,
    });
  }
  world.gongs.length = 0;
  for (let i = 0; i < 12; i++) {
    world.gongs.push({ hostId: 1 + i * 17, mass: 24, left: 99, next: 0 });
  }
  world.projectileLive = 0;
  for (let i = 0; i < Math.min(48, world.projectiles.length); i++) {
    const slot = world.projectiles[i];
    slot.alive = true;
    slot.kind = 'primer';
    slot.x = (i % 12) * 10;
    slot.z = (i % 7) * 10;
    slot.vx = 40; slot.vz = 10;
    slot.age = 0; slot.life = 30;
    slot.ownerId = 1; slot.ignoreId = 1; slot.mass = 1;
    slot.bounces = 0; slot.skipPrism = -1;
    world.projectileLive++;
  }
  // Coatings to exercise arcFrom / contact paths when energy hits fire
  world.coatings.length = 0;
  for (let i = 0; i < 16; i++) {
    world.coatings.push({ hostId: 2 + i * 5, kind: 'conductor', until: 1e9, arcTick: -100 });
  }
  state.simTime = 1;
  state.tick = 60;
  state.mode = 'flight';
}

function rearm(state) {
  const world = state.emergent;
  world.hot = true;
  for (const f of world.fields) f.life = 100;
  for (const g of world.gongs) { g.left = 99; g.next = 0; }
  for (let i = 0; i < world.projectiles.length; i++) {
    const slot = world.projectiles[i];
    if (i < 48) {
      slot.alive = true; slot.age = 0; slot.life = 30;
      slot.x = (i % 12) * 10; slot.z = (i % 7) * 10;
    }
  }
  world.projectileLive = 48;
  for (const c of world.coatings) { c.until = 1e9; c.arcTick = -100; }
}

function timeMs(fn, iters) {
  fn();
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) fn();
  return performance.now() - t0;
}

const CROWD = 2500;
const ITERS = 400;
const list = buildCrowd(CROWD);
const state = {
  mode: 'flight',
  tick: 0,
  simTime: 0,
  entityList: list,
  entities: new Map(list.map((e) => [e.id, e])),
  input: { actions: {} },
};

armHot(state);
const buckets = rebuildHash(state);

const withHashMs = timeMs(() => { rearm(state); tickEmergent(state, 1 / 60, { bus: null }); }, ITERS);
disarmHash(state);
const noHashMs = timeMs(() => { rearm(state); tickEmergent(state, 1 / 60, { bus: null }); }, ITERS);
const speedup = noHashMs / Math.max(withHashMs, 1e-9);

const report = {
  crowd: CROWD,
  activeBuckets: buckets,
  fields: state.emergent.fields.length,
  gongs: state.emergent.gongs.length,
  projectiles: 48,
  iters: ITERS,
  withHashMs: +withHashMs.toFixed(3),
  noHashMs: +noHashMs.toFixed(3),
  speedup: +speedup.toFixed(3),
  pass: speedup >= 1.5,
};
console.log(JSON.stringify(report, null, 2));
