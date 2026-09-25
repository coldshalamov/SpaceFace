/**
 * Primary KPI: StuntFlightObserver threat walk residual after #40 index lanes.
 * Before = isHostileForAI before combat/activity targetId gate; scan every tick.
 * After  = lock/targetId first + quiet cadence (period 2) when no tracks + empty projectiles.
 * Soft-GPU fps not claimed.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';

function isHostileForAI(state, owner, player) {
  if (!owner || !player) return false;
  if (owner.team === player.team || owner.team === 0 || owner.team === 2) return false;
  const data = owner.data || {};
  const ai = data.ai || null;
  const combat = data.combat || null;
  if (ai && ai.passive) return false;
  if (ai && ai.lawful) {
    return ai.securityTargetId === player.id || !!(state.lawSecurity && state.lawSecurity.wanted);
  }
  if (ai && ai.retaliationTargetId === player.id) return true;
  if (ai && Array.isArray(ai.hostileTeams) && ai.hostileTeams.includes(player.team)) return true;
  if (combat && (combat.targetId === player.id || combat.lockTarget === player.id)) return true;
  if (ai && (ai.forcePlayerTarget || ai.huntPlayer)) return true;
  if (data.encounter) return true;
  const context = String((ai && (ai.spawnContext || ai.context)) || '');
  if (context === 'ambush' || context === 'raid') return true;
  const archetype = String((ai && (ai.archetype || ai.role)) || data.role || '').toLowerCase();
  if (archetype.includes('trad') || archetype.includes('miner') || archetype.includes('civilian')) return false;
  if (context !== 'ambient' && archetype.includes('pirate')) return true;
  return false;
}

function hostileBefore(state, e, player) {
  const owner = e.ownerId != null ? state.entities.get(e.ownerId) : e;
  if (!owner || !isHostileForAI(state, owner, player)) return false;
  return e.type === 'projectile'
    || (e.data?.ai?.activity?.targetId === player.id)
    || (e.data?.combat?.targetId === player.id);
}

function hostileAfter(state, e, player) {
  if (e.type !== 'projectile') {
    const data = e.data;
    if (!data) return false;
    if (!(data.combat && data.combat.targetId === player.id)
      && !(data.ai && data.ai.activity && data.ai.activity.targetId === player.id)) return false;
  }
  const owner = e.ownerId != null ? state.entities.get(e.ownerId) : e;
  return !!(owner && isHostileForAI(state, owner, player));
}

function makeWorld(nShips, attackers, withProjectiles = false) {
  const player = {
    id: 'player', type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8,
  };
  const ships = [player];
  const map = new Map([['player', player]]);
  for (let i = 0; i < nShips; i++) {
    const far = i % 5 !== 0;
    const r = far ? 900 + (i % 50) * 20 : 80 + (i % 20) * 15;
    const ang = i * 0.37;
    const isAtk = i < attackers;
    const role = i % 7 === 0 ? 'pirate' : (i % 3 === 0 ? 'miner' : 'trader');
    const e = {
      id: `s${i}`, type: 'ship', alive: true,
      team: role === 'pirate' ? 1 : (role === 'miner' ? 2 : 3),
      pos: { x: Math.cos(ang) * r, z: Math.sin(ang) * r },
      vel: { x: 0, z: 0 }, radius: 6,
      data: {
        role,
        ai: {
          passive: role !== 'pirate',
          archetype: role,
          spawnContext: role === 'pirate' ? 'raid' : 'ambient',
          activity: isAtk ? { targetId: 'player' } : null,
        },
        combat: isAtk ? { targetId: 'player' } : { targetId: null },
      },
    };
    ships.push(e);
    map.set(e.id, e);
  }
  for (let i = 0; i < 10; i++) {
    const e = {
      id: `d${i}`, type: 'drone', alive: true, team: 1,
      pos: { x: 200 + i * 40, z: 80 }, vel: { x: 0, z: 0 }, radius: 2,
      data: { ai: { passive: true, activity: null }, combat: { targetId: null } },
    };
    ships.push(e);
    map.set(e.id, e);
  }
  const projectiles = [];
  if (withProjectiles) {
    for (let i = 0; i < 6; i++) {
      const owner = ships[1];
      const e = {
        id: `p${i}`, type: 'projectile', alive: true, ownerId: owner.id,
        pos: { x: 40 + i * 8, z: 10 }, vel: { x: 2, z: 0 }, radius: 1, data: {},
      };
      projectiles.push(e);
      map.set(e.id, e);
    }
  }
  return {
    playerId: 'player',
    lawSecurity: { wanted: false },
    entities: { get: (id) => map.get(id), values: () => ships.concat(projectiles) },
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ready: true,
      ships: ships.filter((e) => e.type === 'ship'),
      drones: ships.filter((e) => e.type === 'drone'),
      projectiles,
    },
  };
}

const R2 = 2400 * 2400;

function walkLanes(state, hostileThreat) {
  const player = state.entities.get(state.playerId);
  let hits = 0;
  for (const lane of [state.entityIndex.ships, state.entityIndex.drones, state.entityIndex.projectiles]) {
    for (let i = 0; i < lane.length; i++) {
      const e = lane[i];
      if (!e?.pos || !e.vel || e.alive === false || e.id === player.id) continue;
      const dx = e.pos.x - player.pos.x;
      const dz = e.pos.z - player.pos.z;
      if (dx * dx + dz * dz > R2) continue;
      if (!hostileThreat(state, e, player)) continue;
      hits++;
    }
  }
  return hits;
}

/** Master residual after #40: hostility-first, every tick. */
function scanBefore(state, tick) {
  return walkLanes(state, hostileBefore);
}

/** Package: lock-first + quiet cadence when no tracks and empty projectile lane. */
function scanAfter(state, tick, tracksSize) {
  const projectiles = state.entityIndex.projectiles;
  const quietNoAmmo = tracksSize === 0 && Array.isArray(projectiles) && projectiles.length === 0;
  const scanThreats = !quietNoAmmo || ((tick & 1) === 0);
  if (!scanThreats) return 0;
  return walkLanes(state, hostileAfter);
}

const ITERS = 8000;
function time(fn) {
  fn(0);
  const t0 = performance.now();
  let hits = 0;
  for (let i = 0; i < ITERS; i++) hits = fn(i);
  return { ms: performance.now() - t0, hits };
}

const quiet = makeWorld(120, 0, false);
const combat = makeWorld(80, 3, false);
const combatProj = makeWorld(80, 3, true);

const qB = time((t) => scanBefore(quiet, t));
const qA = time((t) => scanAfter(quiet, t, 0));
const cB = time((t) => scanBefore(combat, t));
const cA = time((t) => scanAfter(combat, t, 2)); // active tracks → no cadence
const cLockOnly = time((t) => {
  // lock-prefilter every tick (no cadence) — combat residual when tracks open
  return walkLanes(combat, hostileAfter);
});
const pB = time((t) => scanBefore(combatProj, t));
const pA = time((t) => scanAfter(combatProj, t, 0)); // projectiles present → no cadence

const out = {
  label: 'stunt-threat-lock-prefilter',
  iters: ITERS,
  quiet_120ships_0atk: {
    before: { ms: +qB.ms.toFixed(3), hits: qB.hits },
    after: { ms: +qA.ms.toFixed(3), hits: qA.hits },
    speedup: +(qB.ms / qA.ms).toFixed(3),
  },
  combat_80ships_3atk_active_tracks: {
    before: { ms: +cB.ms.toFixed(3), hits: cB.hits },
    after: { ms: +cA.ms.toFixed(3), hits: cA.hits },
    speedup: +(cB.ms / cA.ms).toFixed(3),
    lockOnlyEveryTick: { ms: +cLockOnly.ms.toFixed(3), hits: cLockOnly.hits, speedup: +(cB.ms / cLockOnly.ms).toFixed(3) },
    sameHits: cB.hits === cA.hits,
  },
  combat_with_projectiles: {
    before: { ms: +pB.ms.toFixed(3), hits: pB.hits },
    after: { ms: +pA.ms.toFixed(3), hits: pA.hits },
    speedup: +(pB.ms / pA.ms).toFixed(3),
    sameHits: pB.hits === pA.hits,
  },
  oracle: {
    quietSame: walkLanes(quiet, hostileBefore) === walkLanes(quiet, hostileAfter),
    combatSame: walkLanes(combat, hostileBefore) === walkLanes(combat, hostileAfter),
    projSame: walkLanes(combatProj, hostileBefore) === walkLanes(combatProj, hostileAfter),
  },
};
console.log(JSON.stringify(out, null, 2));
writeFileSync('artifacts/stunt-threat-lock-prefilter-microbench.json', JSON.stringify(out, null, 2));
