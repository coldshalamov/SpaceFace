// Phase 2b #10 side bench: scripted mining loop. Starter Hitch (mining laser S + drill amp), a seeded
// field of N ast_common_rock / ast_metallic rocks; the pilot parks 70 wu off the nearest unmined rock,
// holds the mining beam on it (state.input.fireGroup = 2 after the input system, cursor on the rock)
// until it is depleted, then flies to the next (pose carry at 120 wu/s). 120 s.
// Metrics: units/min accepted into cargo (mining:yield acceptedAmount + pickup:collected), base-price
// credits/min, rocks finished, longest gap between yields, rich cores exposed/completed (released at
// a perfect 50% here: the timing law is measured separately by richCore.mjs).
import { createLabWorld, SIM_DT } from '../labWorld.mjs';
import * as miningModule from '../../../src/systems/mining.js';
import { ASTEROIDS, ORES } from '../../../src/data/mining.js';
import { COMMODITIES } from '../../../src/data/commodities.js';
const AST = new Map(ASTEROIDS.map((a) => [a.id, a]));
const PRICE = new Map([...ORES.map((o) => [o.id, o.baseValue]), ...COMMODITIES.map((c) => [c.id, c.basePrice])]);
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export const SCENARIOS = { 'loop|common': { typeId: 'ast_common_rock' }, 'loop|metallic': { typeId: 'ast_metallic' } };
export const DEFAULT_SCENARIOS = Object.keys(SCENARIOS);

export const VARIANTS = { cheapest: { richPick: 'cheapest' } };
export async function runScenario(id, { seed = 1, bundle = 'focused', params = {} } = {}) {
  const sc = SCENARIOS[id];
  if (typeof miningModule.setMiningLab === 'function') miningModule.setMiningLab(params);
  const world = await createLabWorld({ seed, bundle, settings: { controlScheme: 'pilot' }, extraSystems: ['mining', 'cargo', 'inventory', 'economy'] });
  try {
    const st = world.state; const rt = world.runtime; const rng = mulberry32(seed * 911 + 5);
    const pl = world.spawnPlayer({ pos: { x: 0, z: 0 }, rot: 0 });
    pl.flags = pl.flags || {}; pl.flags.invuln = true;
    const def = AST.get(sc.typeId); const rocks = [];
    for (let i = 0; i < 10; i++) {
      const size = def.sizeRange[0] + rng() * (def.sizeRange[1] - def.sizeRange[0]);
      const oreHP = def.hp[0] + rng() * (def.hp[1] - def.hp[0]);
      const yieldU = Math.round(def.yieldU[0] + rng() * (def.yieldU[1] - def.yieldU[0]));
      rocks.push(rt.spawn({ type: 'asteroid', pos: { x: 200 + i * 160, z: (rng() * 2 - 1) * 60 }, radius: size, mass: size * 40, angVel: 0, hull: oreHP, hullMax: oreHP, collides: true,
        physicsBody: { radius: size },
        data: { typeId: def.id, tier: def.tierCap, tierCap: def.tierCap, oreHP, oreHPMax: oreHP, yieldU, size, pctEjected: 0, respawnSec: 1e9 } }));
    }
    await world.prepare();
    // the focused bundle has no cargo writer: widen the mining stub hold so pace, not capacity, is measured
    st.player.cargo = st.player.cargo || {}; st.player.cargo.capVolume = 1e6;
    const orig = world.inputSys.update;
    let mine = false;
    world.inputSys.update = function (dt, s) { const r = orig.call(this, dt, s); if (mine) { s.input.fireGroup = 2; } return r; };
    let units = 0, credits = 0, lastYield = 0, maxGap = 0, cores = 0, coresDone = 0;
    const byC = {}; let richCredits = 0;
    const credit = (cid, q, rich = false) => { units += q; const v = q * (PRICE.get(cid) || 1); credits += v; if (rich) richCredits += v; byC[cid] = (byC[cid] || 0) + q; const now = st.simTime; maxGap = Math.max(maxGap, now - lastYield); lastYield = now; };
    rt.bus.on('mining:yield', (p) => { if (p && p.minerId === st.playerId && Number(p.acceptedAmount) > 0) credit(p.commodityId, Number(p.acceptedAmount), !!p.richCore); });
    rt.bus.on('pickup:collected', (p) => { const q = Number(p && (p.acceptedAmount ?? p.amount)) || 0; if (q > 0) credit(p.commodityId || (p.data && p.data.commodityId), q); });
    rt.bus.on('mining:richCoreExposed', () => { cores++; });
    rt.bus.on('mining:richCoreCompleted', () => { coresDone++; });
    const T = Math.round(120 / SIM_DT); let target = null; let done = 0;
    for (let t = 0; t < T; t++) {
      if (!target || target.alive === false || !st.entities.get(target.id)) {
        if (target) done++;
        target = rocks.filter((r) => r.alive !== false && st.entities.get(r.id)).sort((a, b) => Math.hypot(a.pos.x - pl.pos.x, a.pos.z - pl.pos.z) - Math.hypot(b.pos.x - pl.pos.x, b.pos.z - pl.pos.z))[0] || null;
        if (!target) break;
      }
      const goal = { x: target.pos.x - 70, z: target.pos.z };
      const d = Math.hypot(goal.x - pl.pos.x, goal.z - pl.pos.z);
      const step = 120 * SIM_DT;
      if (d > step) { pl.pos.x += (goal.x - pl.pos.x) / d * step; pl.pos.z += (goal.z - pl.pos.z) / d * step; mine = false; }
      else { pl.pos.x = goal.x; pl.pos.z = goal.z; mine = true; }
      pl.vel.x = 0; pl.vel.z = 0; pl.rot = Math.atan2(target.pos.z - pl.pos.z, target.pos.x - pl.pos.x);
      world.aim.x = target.pos.x; world.aim.z = target.pos.z;
      // a rich core: hold the beam (in place) and release at a perfect 50 %
      const core = st.player.mining && st.player.mining.richCore;
      if (core && !core.resolved) {
        mine = !(core.chargeStartedAt != null && st.simTime - core.chargeStartedAt >= core.durationS * 0.5);
        if (d > step) { pl.pos.x -= (goal.x - pl.pos.x) / d * step; pl.pos.z -= (goal.z - pl.pos.z) / d * step; }
      }
      world.keys([]);
      world.step();
    }
    const min = st.simTime / 60;
    return { key: id, seed, units, unitsPerMin: +(units / min).toFixed(1), creditsPerMin: +(credits / min).toFixed(0), rocksDone: done, maxGapS: +maxGap.toFixed(1), cores, coresDone, richCreditShare: +(richCredits / Math.max(1, credits)).toFixed(2), ordinaryCreditsPerMin: +((credits - richCredits) / min).toFixed(0), byC };
  } finally { world.dispose(); if (typeof miningModule.setMiningLab === 'function') miningModule.setMiningLab({}); }
}
