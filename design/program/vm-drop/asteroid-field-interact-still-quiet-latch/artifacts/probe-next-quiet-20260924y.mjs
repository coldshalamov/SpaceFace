/**
 * Hunt probe 20260924y — post-#134 poles.
 * Soft-GPU fps not a KPI. Picture contract assumed ON.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import {
  ensureAsteroidField,
  insertAsteroidFieldRock,
  queryAsteroidField,
} from '../src/world/asteroidField.js';

const ITERS = 40000;
const RUNS = 11;
function med(a){const s=[...a].sort((x,y)=>x-y);return s[(s.length-1)>>1];}
function summarize(name, pairs) {
  return {
    name,
    medianSpeedup: +med(pairs).toFixed(3),
    minSpeedup: +Math.min(...pairs).toFixed(3),
    maxSpeedup: +Math.max(...pairs).toFixed(3),
  };
}

function bootCore() {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.meta.seed = 4242;
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  player.maxSpeed = 160;
  return { state, helpers, player, bus };
}

function fieldInteractBody(state, player, scratch) {
  const reach = (player.radius || 8) + 36;
  const hits = queryAsteroidField(state, player.pos, reach, scratch);
  let promoted = 0;
  for (let i = 0; i < hits.length; i++) {
    const rec = hits[i];
    if (!rec || !rec.pos) continue;
    const dx = rec.pos.x - player.pos.x;
    const dz = rec.pos.z - player.pos.z;
    const rad = (player.radius || 8) + (rec.radius || 8);
    if (dx * dx + dz * dz <= rad * rad) promoted++;
  }
  return { hits: hits.length, promoted };
}

/** Still-player skip: arm after first probe; skip while player still + field.version same. */
function benchFieldInteractStillPlayer({ rocksNear = true, rocksTouching = false } = {}) {
  const pairs = [];
  for (let r = 0; r < RUNS; r++) {
    const { state, player } = bootCore();
    ensureAsteroidField(state);
    // Place rocks: near but not touching, or touching, or far/empty.
    if (rocksNear || rocksTouching) {
      for (let i = 0; i < 48; i++) {
        const ang = (i / 48) * Math.PI * 2;
        const dist = rocksTouching ? 10 : 30; // radius 8+8=16 collide; 30 is near-query but no collide
        insertAsteroidFieldRock(state, {
          pos: { x: Math.cos(ang) * dist, z: Math.sin(ang) * dist },
          radius: 8,
        });
      }
    }
    const scratch = [];
    // BEFORE
    for (let i = 0; i < 1500; i++) fieldInteractBody(state, player, scratch);
    const t0 = performance.now();
    for (let i = 0; i < ITERS; i++) fieldInteractBody(state, player, scratch);
    const before = performance.now() - t0;

    // AFTER: still-player latch
    let quiet = null;
    let tick = 0;
    const field = state.world.asteroidField;
    function latched() {
      tick++;
      const version = field && field.version;
      if (quiet
        && quiet.version === version
        && ((tick - quiet.armedTick) < 30)) {
        const mdx = player.pos.x - quiet.x;
        const mdz = player.pos.z - quiet.z;
        if (mdx * mdx + mdz * mdz <= quiet.wakeMove2) {
          return quiet.last;
        }
      }
      const last = fieldInteractBody(state, player, scratch);
      // Arm whenever player is essentially parked (vel~0). Works even if hits non-empty.
      const vx = player.vel ? player.vel.x : 0;
      const vz = player.vel ? player.vel.z : 0;
      if (vx * vx + vz * vz <= 0.25) {
        quiet = {
          version,
          armedTick: tick,
          x: player.pos.x,
          z: player.pos.z,
          wakeMove2: 4, // ~2 WU
          last,
        };
      } else quiet = null;
      return last;
    }
    for (let i = 0; i < 1500; i++) latched();
    const t1 = performance.now();
    for (let i = 0; i < ITERS; i++) latched();
    const after = performance.now() - t1;
    pairs.push(before / Math.max(1e-9, after));
  }
  const label = rocksTouching ? 'touching' : (rocksNear ? 'near-nonempty' : 'empty');
  return summarize(`field-interact-still-player-${label}`, pairs);
}

function benchFieldInteractEmptyLatch() {
  const pairs = [];
  for (let r = 0; r < RUNS; r++) {
    const { state, player } = bootCore();
    ensureAsteroidField(state);
    // Rocks far away so query returns empty at reach~44
    for (let i = 0; i < 48; i++) {
      insertAsteroidFieldRock(state, {
        pos: { x: 2000 + (i % 8) * 40, z: 2000 + Math.floor(i / 8) * 40 },
        radius: 8,
      });
    }
    const scratch = [];
    for (let i = 0; i < 1500; i++) fieldInteractBody(state, player, scratch);
    const t0 = performance.now();
    for (let i = 0; i < ITERS; i++) fieldInteractBody(state, player, scratch);
    const before = performance.now() - t0;

    let quiet = null;
    let tick = 0;
    const field = state.world.asteroidField;
    function latched() {
      tick++;
      const version = field && field.version;
      if (quiet
        && quiet.version === version
        && quiet.hits === 0
        && ((tick - quiet.armedTick) < 30)) {
        const mdx = player.pos.x - quiet.x;
        const mdz = player.pos.z - quiet.z;
        if (mdx * mdx + mdz * mdz <= quiet.wakeMove2) return quiet.last;
      }
      const last = fieldInteractBody(state, player, scratch);
      if (last.hits === 0) {
        quiet = {
          version, hits: 0, armedTick: tick,
          x: player.pos.x, z: player.pos.z, wakeMove2: 16, last,
        };
      } else quiet = null;
      return last;
    }
    for (let i = 0; i < 1500; i++) latched();
    const t1 = performance.now();
    for (let i = 0; i < ITERS; i++) latched();
    const after = performance.now() - t1;
    pairs.push(before / Math.max(1e-9, after));
  }
  return summarize('field-interact-empty-latch-far-rocks', pairs);
}

function hazardsBody(player, zones, inside, nowInside, busEmit) {
  nowInside.clear();
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    const dx = player.pos.x - z.center.x, dz = player.pos.z - z.center.z;
    if (dx * dx + dz * dz <= z.radius * z.radius) {
      nowInside.add(i);
      if (!inside.has(i) && busEmit) busEmit('enter', i);
    }
  }
  for (const i of inside) {
    if (!nowInside.has(i) && busEmit) busEmit('exit', i);
  }
  inside.clear();
  for (const i of nowInside) inside.add(i);
  return inside.size;
}

function benchHazardsFarLatch(playerPos) {
  const pairs = [];
  // Ceres hazards
  const zones = [
    { type: 'dense_asteroid', center: { x: 600, z: -400 }, radius: 700, intensity: 0.5 },
  ];
  for (let r = 0; r < RUNS; r++) {
    const player = { pos: { x: playerPos.x, z: playerPos.z }, id: 1, alive: true };
    let inside = new Set();
    let nowInside = new Set();
    for (let i = 0; i < 1500; i++) hazardsBody(player, zones, inside, nowInside, null);
    const t0 = performance.now();
    for (let i = 0; i < ITERS; i++) hazardsBody(player, zones, inside, nowInside, null);
    const before = performance.now() - t0;

    let quiet = null;
    let tick = 0;
    function latched() {
      tick++;
      // Compute min distance to any zone boundary (outside = dist - radius)
      let minOutside = Infinity;
      let anyInside = false;
      for (let i = 0; i < zones.length; i++) {
        const z = zones[i];
        const dx = player.pos.x - z.center.x, dz = player.pos.z - z.center.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d <= z.radius) { anyInside = true; minOutside = 0; break; }
        minOutside = Math.min(minOutside, d - z.radius);
      }
      if (quiet
        && !anyInside
        && quiet.minOutside > 20
        && ((tick - quiet.armedTick) < 30)) {
        const mdx = player.pos.x - quiet.x;
        const mdz = player.pos.z - quiet.z;
        if (mdx * mdx + mdz * mdz <= quiet.wakeMove2) return 0;
      }
      const n = hazardsBody(player, zones, inside, nowInside, null);
      // Recompute outside margin after body
      minOutside = Infinity;
      anyInside = false;
      for (let i = 0; i < zones.length; i++) {
        const z = zones[i];
        const dx = player.pos.x - z.center.x, dz = player.pos.z - z.center.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d <= z.radius) { anyInside = true; minOutside = 0; break; }
        minOutside = Math.min(minOutside, d - z.radius);
      }
      if (!anyInside && minOutside > 20) {
        quiet = {
          minOutside, armedTick: tick,
          x: player.pos.x, z: player.pos.z,
          wakeMove2: Math.min(225, (minOutside * 0.5) ** 2), // wake before boundary
        };
      } else quiet = null;
      return n;
    }
    for (let i = 0; i < 1500; i++) latched();
    const t1 = performance.now();
    for (let i = 0; i < ITERS; i++) latched();
    const after = performance.now() - t1;
    pairs.push(before / Math.max(1e-9, after));
  }
  return summarize(`hazards-far-latch@${playerPos.x},${playerPos.z}`, pairs);
}

function benchPoiAllIdentified() {
  const pairs = [];
  const pois = [];
  for (let i = 0; i < 24; i++) {
    pois.push({
      id: `p${i}`, poiId: `poi${i}`, type: 'wreck',
      pos: { x: 100 + i * 30, z: 50 },
    });
  }
  for (let r = 0; r < RUNS; r++) {
    const disc = { pois: {} };
    for (const p of pois) disc.pois[p.poiId] = { discovered: true, identified: true };
    const player = { pos: { x: 0, z: 0 } };
    const carriers = new Map();
    for (const p of pois) {
      carriers.set(p.id, {
        id: p.id, alive: true, pos: p.pos,
        data: { scanRange: 400, name: p.poiId },
      });
    }
    function body() {
      let checked = 0;
      for (const p of pois) {
        const ent = carriers.get(p.id);
        if (!ent || ent.alive === false) continue;
        const rec = disc.pois[p.poiId];
        if (rec.identified) { checked++; continue; }
        const dx = ent.pos.x - player.pos.x, dz = ent.pos.z - player.pos.z;
        const distSq = dx * dx + dz * dz;
        const sr = 400;
        if (distSq <= sr * sr) checked++;
      }
      return checked;
    }
    for (let i = 0; i < 1500; i++) body();
    const t0 = performance.now();
    for (let i = 0; i < ITERS; i++) body();
    const before = performance.now() - t0;

    let quiet = null;
    let tick = 0;
    function latched() {
      tick++;
      if (quiet && quiet.allIdentified && ((tick - quiet.armedTick) < 60)) {
        return quiet.n;
      }
      // Probe: are all identified?
      let all = true;
      for (const p of pois) {
        const rec = disc.pois[p.poiId];
        if (!rec || !rec.identified) { all = false; break; }
      }
      if (all) {
        quiet = { allIdentified: true, armedTick: tick, n: pois.length };
        return quiet.n;
      }
      quiet = null;
      return body();
    }
    for (let i = 0; i < 1500; i++) latched();
    const t1 = performance.now();
    for (let i = 0; i < ITERS; i++) latched();
    const after = performance.now() - t1;
    pairs.push(before / Math.max(1e-9, after));
  }
  return summarize('poi-scan-all-identified-latch', pairs);
}

function benchPoiUnidentifiedResidual() {
  // When some unidentified remain, latch should not fire — measure body cost only vs partial.
  const pairs = [];
  const pois = [];
  for (let i = 0; i < 24; i++) {
    pois.push({ id: `p${i}`, poiId: `poi${i}`, type: 'wreck', pos: { x: 100 + i * 30, z: 50 } });
  }
  for (let r = 0; r < RUNS; r++) {
    const disc = { pois: {} };
    for (let i = 0; i < pois.length; i++) {
      disc.pois[pois[i].poiId] = { discovered: i < 20, identified: i < 18 };
    }
    const player = { pos: { x: 0, z: 0 } };
    const carriers = new Map();
    for (const p of pois) {
      carriers.set(p.id, { id: p.id, alive: true, pos: p.pos, data: { scanRange: 400 } });
    }
    function body() {
      let checked = 0;
      for (const p of pois) {
        const ent = carriers.get(p.id);
        if (!ent || ent.alive === false) continue;
        const rec = disc.pois[p.poiId] || (disc.pois[p.poiId] = { discovered: false, identified: false });
        if (rec.identified) continue;
        const dx = ent.pos.x - player.pos.x, dz = ent.pos.z - player.pos.z;
        const distSq = dx * dx + dz * dz;
        if (distSq <= 400 * 400) checked++;
      }
      return checked;
    }
    // "after" = early-out counting unidentified remaining via a retained counter
    let unidentified = 0;
    for (const p of pois) if (!disc.pois[p.poiId].identified) unidentified++;
    function latched() {
      if (unidentified === 0) return 0;
      return body();
    }
    for (let i = 0; i < 1500; i++) body();
    const t0 = performance.now();
    for (let i = 0; i < ITERS; i++) body();
    const before = performance.now() - t0;
    for (let i = 0; i < 1500; i++) latched();
    const t1 = performance.now();
    for (let i = 0; i < ITERS; i++) latched();
    const after = performance.now() - t1;
    pairs.push(before / Math.max(1e-9, after));
  }
  return summarize('poi-scan-unidentified-counter-noop', pairs);
}

const results = [
  benchFieldInteractStillPlayer({ rocksNear: true, rocksTouching: false }),
  benchFieldInteractStillPlayer({ rocksNear: true, rocksTouching: true }),
  benchFieldInteractStillPlayer({ rocksNear: false }),
  benchFieldInteractEmptyLatch(),
  benchHazardsFarLatch({ x: 0, z: 0 }),          // ~21 WU outside Ceres hazard
  benchHazardsFarLatch({ x: -2000, z: 2000 }),   // clearly far
  benchHazardsFarLatch({ x: 600, z: -400 }),     // inside hazard center
  benchPoiAllIdentified(),
  benchPoiUnidentifiedResidual(),
];
console.log(JSON.stringify(results, null, 2));
writeFileSync('artifacts/probe-next-quiet-20260924y.json', JSON.stringify(results, null, 2));
