// CV-AMMO-1 verification probe — does the opening spread bodies to gun range and delete
// them? Runs a wave-1 cell on a fixed seed per loadout and measures spawn distance,
// engagement distance at each kill, and kill cause. The claim is broken if wave-1 bodies
// spawn spread at gun range AND die to 'weapon' from beyond physical-verb reach.
//
//   node scripts/probe-opening-spread.mjs [seed]

import { simulateCrucibleSwarm } from './lib/bench/crucibleBench.mjs';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';

const SEED = Number.isFinite(Number(process.argv[2])) ? Number(process.argv[2]) : 8008;
const GUN_RANGE_WU = 240;         // starter pulse reach (src/data/weapons.js)
const ROPE_RANGE_WU = 390;        // massline latch reach

for (const loadoutId of ['energy_baseline', 'physics_toolkit', 'massline_rig']) {
  const firstSeen = new Map();    // id -> spawn distance from player
  const posByTick = new Map();    // id -> Map(tick -> pos)
  const playerPosByTick = new Map();

  const run = await simulateCrucibleSwarm({
    arenaId: 'helios_core', loadoutId, seed: SEED, waveCount: 1, tickCap: 5400,
    onTick({ state, tick, player }) {
      if (player && player.pos) playerPosByTick.set(tick, { x: player.pos.x, z: player.pos.z });
      for (const e of state.entityList || []) {
        if (!e || e.alive === false || !e.pos) continue;
        if (!(e.data && e.data.runCohort === SURVIVAL_COHORT_TAG)) continue;
        let byTick = posByTick.get(e.id);
        if (!byTick) { byTick = new Map(); posByTick.set(e.id, byTick); }
        byTick.set(tick, { x: e.pos.x, z: e.pos.z });
        if (!firstSeen.has(e.id) && player && player.pos) {
          firstSeen.set(e.id, Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z));
        }
      }
    },
  });

  const trace = run.eventTrace || [];
  const kills = [];
  const verbs = [];
  const shots = [];
  const spawns = [];
  for (const ev of trace) {
    if (ev.type === 'entity:killed' && ev.data) {
      const byTick = posByTick.get(ev.data.targetId);
      const pp = playerPosByTick.get(ev.tick);
      // The victim's last recorded position is one tick before the kill lands.
      const p2 = byTick ? byTick.get(ev.tick) || byTick.get(ev.tick - 1) : null;
      kills.push({
        cause: ev.data.cause,
        dist: p2 && pp ? Math.hypot(p2.x - pp.x, p2.z - pp.z) : null,
        tick: ev.tick,
      });
    } else if (ev.type === 'verb:used' && ev.data && ev.data.verb) {
      verbs.push(ev.data.verb);
    } else if (ev.type === 'player:shot') {
      shots.push(ev.tick);
    } else if (ev.type === 'hostile:spawned' && ev.data) {
      spawns.push({ id: ev.data.entityId, wave: ev.data.wave, tick: ev.tick });
    }
  }

  const spawnDists = [...firstSeen.values()];
  const med = (a) => a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : null;
  const killsByCause = {};
  for (const k of kills) killsByCause[k.cause] = (killsByCause[k.cause] || 0) + 1;
  const weaponDists = kills.filter((k) => k.cause === 'weapon').map((k) => k.dist).filter(Number.isFinite);

  console.log(`loadout=${loadoutId} stop=${run.stopReason} ticks=${run.ticks}`);
  console.log(`  wave-1 spawns: ${spawns.length} hostiles, dist median=${med(spawnDists)?.toFixed(0)}wu ` +
    `min=${spawnDists.length ? Math.min(...spawnDists).toFixed(0) : 'n/a'} ` +
    `max=${spawnDists.length ? Math.max(...spawnDists).toFixed(0) : 'n/a'}`);
  console.log(`  kills: ${kills.length} by cause ${JSON.stringify(killsByCause)}`);
  console.log(`  weapon-kill distance median=${weaponDists.length ? med(weaponDists).toFixed(0) : 'n/a'}wu ` +
    `(gun range ${GUN_RANGE_WU}, rope ${ROPE_RANGE_WU})`);
  console.log(`  player shots: ${shots.length}  verbs used: ${verbs.length} [${[...new Set(verbs)].join(',')}]`);
}
