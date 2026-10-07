// Phase 2b system #10 bench: mining pickup magnet (MAGNET_RANGE / ACCEL / APPROACH, collect pad).
// REAL mining._updatePickups on the focused bundle + mining. Ore pickups are spawned with the
// production _spawnPickup spec (radius 2.2, mass 0.1) around the player:
//   ring: N chips at seeded bearings, distance D, scatter velocity up to S wu/s (random dir)
//   burst: a depletion-style tight cluster 120 wu ahead (the "scoop the corpse" pass)
// Player motion: hold (parked), cruise (100 wu/s straight), orbit (90 wu/s circle r 200), flyby
// (160 wu/s straight past a ring 200 wu off the lane).
// Metrics per chip: collected (entity gone with the cargo accepting it), time to collect, angle the
// chip swept around the player before collection (orbit count = swept / 2π), max distance reached.
import { createLabWorld, SIM_DT } from '../labWorld.mjs';
import * as miningModule from '../../../src/systems/mining.js';

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export const SCENARIOS = {};
for (const motion of ['hold', 'cruise', 'orbit']) for (const D of [60, 200, 500, 780]) for (const S of [0, 40, 120]) {
  SCENARIOS[`ring|${motion}|${D}|${S}`] = { kind: 'ring', motion, D, S, n: 12 };
}
for (const motion of ['hold', 'cruise', 'orbit', 'flyby']) SCENARIOS[`burst|${motion}`] = { kind: 'burst', motion, n: 16 };
export const DEFAULT_SCENARIOS = Object.keys(SCENARIOS);

export async function runScenario(id, { seed = 1, bundle = 'focused', params = {} } = {}) {
  const sc = typeof id === 'object' ? id : SCENARIOS[id];
  if (!sc) throw new Error(`unknown scenario ${id}`);
  if (typeof miningModule.setMiningLab === 'function') miningModule.setMiningLab(params);
  const world = await createLabWorld({ seed, bundle, settings: { controlScheme: 'pilot' }, extraSystems: ['mining', 'cargo', 'inventory'] });
  try {
    const st = world.state; const rt = world.runtime; const rng = mulberry32(seed * 2654435761 + 17);
    const pl = world.spawnPlayer({ pos: { x: 0, z: 0 }, rot: 0 });
    pl.flags = pl.flags || {}; pl.flags.invuln = true;
    const chips = [];
    const spawnChip = (pos, vel) => {
      const e = rt.spawn({ type: 'pickup', pos, vel, radius: 2.2, mass: 0.1, collides: true,
        data: { kind: 'ore', commodityId: 'cmdty_silicate', amount: 1, despawnAt: 1e9 } });
      chips.push({ e, t0: null, tC: null, swept: 0, lastAng: null, maxD: 0 });
    };
    if (sc.kind === 'ring') {
      for (let i = 0; i < sc.n; i++) {
        const a = (i / sc.n) * Math.PI * 2 + rng() * 0.3; const va = rng() * Math.PI * 2; const vs = sc.S * rng();
        spawnChip({ x: Math.cos(a) * sc.D, z: Math.sin(a) * sc.D }, { x: Math.cos(va) * vs, z: Math.sin(va) * vs });
      }
    } else {
      const c = sc.motion === 'flyby' ? { x: 300, z: 200 } : { x: 120, z: 0 };
      for (let i = 0; i < sc.n; i++) { const a = rng() * Math.PI * 2; const r = 22 * 0.45 + rng() * 2.5; const sp = 2 + rng() * 3.5; spawnChip({ x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r }, { x: Math.cos(a) * sp, z: Math.sin(a) * sp }); }
    }
    await world.prepare();
    let accepted = 0;
    rt.bus.on('pickup:collected', () => { accepted++; });
    const cap = Math.round(12 / SIM_DT);
    for (let t = 0; t < cap; t++) {
      world.keys([]);
      world.step();
      // scripted player motion (pose carry, so the chip law is measured against a known path)
      const T = (t + 1) * SIM_DT;
      if (sc.motion === 'hold') { pl.pos.x = 0; pl.pos.z = 0; pl.vel.x = 0; pl.vel.z = 0; }
      else if (sc.motion === 'cruise') { pl.pos.x = 100 * T; pl.pos.z = 0; pl.vel.x = 100; pl.vel.z = 0; pl.rot = 0; }
      else if (sc.motion === 'flyby') { pl.pos.x = -200 + 160 * T; pl.pos.z = 0; pl.vel.x = 160; pl.vel.z = 0; pl.rot = 0; }
      else { const w = 90 / 200; const a = w * T - Math.PI / 2; pl.pos.x = Math.cos(a) * 200; pl.pos.z = 200 + Math.sin(a) * 200; pl.vel.x = -Math.sin(a) * 90; pl.vel.z = Math.cos(a) * 90; pl.rot = a + Math.PI / 2; }
      let left = 0;
      for (const c of chips) {
        const alive = c.e.alive !== false && st.entities.get(c.e.id) === c.e;
        if (!alive) { if (c.tC == null) c.tC = T; continue; }
        left++;
        const dx = c.e.pos.x - pl.pos.x, dz = c.e.pos.z - pl.pos.z; const d = Math.hypot(dx, dz);
        c.maxD = Math.max(c.maxD, d);
        const ang = Math.atan2(dz, dx);
        if (c.lastAng != null) { let da = ang - c.lastAng; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; if (d < 600) c.swept += Math.abs(da); }
        c.lastAng = ang;
      }
      if (!left) break;
    }
    const got = chips.filter((c) => c.tC != null); const times = got.map((c) => c.tC).sort((a, b) => a - b);
    const orbits = chips.map((c) => c.swept / (2 * Math.PI));
    return {
      key: sc.kind === 'ring' ? `ring|${sc.motion}|${sc.D}|${sc.S}` : `burst|${sc.motion}`, kind: sc.kind, motion: sc.motion, D: sc.D ?? null, S: sc.S ?? null, seed,
      n: chips.length, collected: got.length, accepted, meanS: times.length ? +(times.reduce((s, x) => s + x, 0) / times.length).toFixed(2) : null,
      p90S: times.length ? +times[Math.min(times.length - 1, Math.floor(times.length * 0.9))].toFixed(2) : null, lastS: times.length ? +times[times.length - 1].toFixed(2) : null,
      maxOrbits: +Math.max(...orbits).toFixed(2), orbiters: orbits.filter((o) => o >= 1).length,
      maxDist: +Math.max(...chips.map((c) => c.maxD)).toFixed(0),
    };
  } finally { world.dispose(); if (typeof miningModule.setMiningLab === 'function') miningModule.setMiningLab({}); }
}
