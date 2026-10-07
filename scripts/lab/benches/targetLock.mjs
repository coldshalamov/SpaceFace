// Phase 2b system #8 bench: target selection and lock. The REAL selection path: autoTargetAssist's
// quiet refresh (every AUTO_TARGET_REFRESH_S) emits 'ui:targetNearestHostileToPlayer', which in the
// browser uiRoot answers with targetNearestHostileToPlayer(); uiRoot is not a sim system, so the bench
// wires that same exported function to the bus. Nothing sets state.player.targetId by hand.
//
// Families (player at the origin, nose +x, Hitch, invulnerable):
//   pick:   4 hostiles at seeded bearings/ranges (150-900 wu), pinned; the cursor sits on one of them
//           (the intended target). Is the first auto-lock the one under the cursor?
//   chain:  same pack; each time the lock is on the intended target it is killed (real damage
//           route) and the cursor moves to another live hostile. Re-acquire accuracy after kills.
//   live:   4 wasps with free SG-06 AI swarm the player for 20 s; the cursor follows the current
//           lock (a player tracking it). Lock switches per minute with no kills = flicker.
//   threat: one wasp 70 wu behind, cursor on a hostile 600-900 wu ahead. Recorded, not scored.
// Metrics: intended-pick %, picks of the nearest, time to lock (s), switches/min (live), and the
// cursor-to-lock distance.
import { createLabWorld, SIM_DT } from '../labWorld.mjs';
import { targetNearestHostileToPlayer } from '../../../src/ui/uiRoot.js';
import * as uiRootModule from '../../../src/ui/uiRoot.js';

function rng(seed) {
  // mulberry32 over a mixed seed (small consecutive seeds must not give correlated first draws)
  let a = Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  a = Math.imul(a ^ (a >>> 13), 0xc2b2ae35) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SCENARIOS = {
  'pick-4': { family: 'pick', n: 4 },
  'pick-6': { family: 'pick', n: 6 },
  'chain-4': { family: 'chain', n: 4 },
  'chain-6': { family: 'chain', n: 6 },
  'live-4': { family: 'live', n: 4, capS: 20 },
  'threat': { family: 'threat', n: 2 },
  'nopointer-4': { family: 'pick', n: 4, pointer: false },
  // human cursor: parked up to 60 wu off the intended hull, seeded direction (contacts >= 90 apart)
  'pick-6j': { family: 'pick', n: 6, jitter: 60 },
  'chain-6j': { family: 'chain', n: 6, jitter: 60 },
  // human reaction: after a kill the cursor stays on the wreck's spot for 0.25 s before moving on
  'chain-6d': { family: 'chain', n: 6, jitter: 60, reactS: 0.25 },
  'chain-6d15': { family: 'chain', n: 6, jitter: 60, reactS: 0.15 },
  'chain-6d40': { family: 'chain', n: 6, jitter: 60, reactS: 0.40 },
};
export const DEFAULT_SCENARIOS = Object.keys(SCENARIOS);

function layout(sc, seed) {
  const r = rng(seed * 7919 + sc.n);
  const pts = [];
  if (sc.family === 'threat') {
    pts.push({ x: -70, z: (r() - 0.5) * 30 });
    const d = 600 + r() * 300, a = (r() - 0.5) * 0.8;
    pts.push({ x: Math.cos(a) * d, z: Math.sin(a) * d });
    return pts;
  }
  let guard = 0;
  while (pts.length < sc.n && guard++ < 500) {
    const d = 150 + r() * 750, a = (r() * 2 - 1) * Math.PI;
    const p = { x: Math.cos(a) * d, z: Math.sin(a) * d };
    // keep hulls apart so "under the cursor" is unambiguous (>= 90 wu between contacts)
    if (pts.every((q) => Math.hypot(q.x - p.x, q.z - p.z) >= 90)) pts.push(p);
  }
  return pts;
}

export async function runScenario(id, { seed = 1, bundle = 'focused', params = {} } = {}) {
  const sc = SCENARIOS[id];
  if (!sc) throw new Error(`unknown scenario ${id}`);
  if (typeof uiRootModule.setTargetLockLab === 'function') uiRootModule.setTargetLockLab(params.lockLab || {});
  const world = await createLabWorld({ seed, bundle, settings: { controlScheme: 'pilot' } });
  try {
    const { state } = world;
    const bus = world.runtime.bus;
    bus.on('ui:targetNearestHostileToPlayer', ({ quiet } = {}) => targetNearestHostileToPlayer(state, bus, { quiet }));
    world.spawnPlayer({ pos: { x: 0, z: 0 }, rot: 0 });
    const pts = layout(sc, seed);
    const enemies = pts.map((p) => world.spawnEnemy({ typeId: 'wasp_swarmer', level: 1, pos: p, rot: Math.PI }));
    await world.prepare();
    const pl = world.player();
    pl.flags = pl.flags || {}; pl.flags.invuln = true; pl._invulnUntil = Infinity;
    const combat = world.runtime.getSystem('combat');
    const r = rng(seed * 104729 + 3);
    const alive = (e) => e && e.alive !== false && state.entities.get(e.id) === e;
    const pinned = sc.family !== 'live';
    const pins = new Map(enemies.map((e, i) => [e.id, pts[i]]));
    const nearestTo = () => { let best = null, bd = Infinity; for (const e of enemies) if (alive(e)) { const d = Math.hypot(e.pos.x - pl.pos.x, e.pos.z - pl.pos.z); if (d < bd) { bd = d; best = e; } } return best; };
    // intended target: pick = seeded choice that is NOT forced to be nearest (uniform over contacts)
    let intended = sc.family === 'threat' ? enemies[1] : enemies[Math.floor(r() * enemies.length)];
    const picks = [];          // { tick, lockId, intendedId, nearestId, cursorDist }
    let switches = 0, lastLock = null, firstLockTick = null, killCount = 0;
    let jit = { x: 0, z: 0 }, jitterFor = null, killTick = null, gapTicks = 0;
    let decideAt = null;       // tick at which a re-pick is expected (after a kill / at start)
    const capTicks = Math.round((sc.capS || (sc.family === 'chain' ? 30 : 4)) / SIM_DT);
    decideAt = 0;
    for (let t = 0; t < capTicks; t++) {
      // cursor: on the intended target (pick/chain/threat) or on the current lock (live)
      const lockNow = state.player.targetId != null ? state.entities.get(state.player.targetId) : null;
      const cursorOn = sc.family === 'live' ? (alive(lockNow) ? lockNow : null) : intended;
      const reacting = sc.reactS && killTick != null && (t - killTick) * SIM_DT < sc.reactS;
      if (!reacting && cursorOn && alive(cursorOn)) {
        if (sc.jitter && cursorOn !== jitterFor) { jitterFor = cursorOn; const a = r() * 2 * Math.PI, m = r() * sc.jitter; jit = { x: Math.cos(a) * m, z: Math.sin(a) * m }; }
        world.aim.x = cursorOn.pos.x + jit.x; world.aim.z = cursorOn.pos.z + jit.z;
      }
      world.keys([], { fire: false, pointer: sc.pointer !== false });
      if (sc.pointer === false && world.inputSys._screen) world.inputSys._screen.active = false;
      world.step();
      if (pinned) for (const e of enemies) if (alive(e)) { const p = pins.get(e.id); e.pos.x = p.x; e.pos.z = p.z; e.vel.x = 0; e.vel.z = 0; }
      pl.pos.x = 0; pl.pos.z = 0; pl.vel.x = 0; pl.vel.z = 0;
      const lockId = state.player.targetId;
      if (lockId != null && firstLockTick == null) firstLockTick = t;
      if (firstLockTick != null && (lockId == null || !alive(state.entities.get(lockId))) && enemies.some(alive)) gapTicks++;
      if (lockId !== lastLock) {
        if (lastLock != null && lockId != null) switches++;
        if (lockId != null && decideAt != null) {
          const lockE = state.entities.get(lockId);
          const near = nearestTo();
          picks.push({ tick: t, dtS: +((t - decideAt) * SIM_DT).toFixed(3), lockId, intendedId: intended ? intended.id : null,
            nearestId: near ? near.id : null, ok: intended ? lockId === intended.id : null,
            nearestPick: near ? lockId === near.id : null, intendedIsNearest: !!(near && intended && near.id === intended.id),
            cursorDist: lockE ? +Math.hypot(lockE.pos.x - world.aim.x, lockE.pos.z - world.aim.z).toFixed(1) : null,
            lockRange: lockE ? +Math.hypot(lockE.pos.x, lockE.pos.z).toFixed(1) : null });
          decideAt = null;
        }
        lastLock = lockId;
      }
      if (sc.family === 'pick' || sc.family === 'threat') { if (picks.length) break; continue; }
      if (sc.family === 'chain' && lockId != null && decideAt == null && t > 0) {
        // kill whatever is locked (the player shoots the lock), then the cursor moves on
        const victim = state.entities.get(lockId);
        if (victim && alive(victim) && (t - picks[picks.length - 1].tick) >= 6) {
          combat.onHit({ targetId: victim.id, ownerId: state.playerId, damage: 1e6, damageType: 'kinetic', pos: { ...victim.pos } });
          killCount++; killTick = t;
          const rest = enemies.filter((e) => alive(e) && e !== victim);
          if (!rest.length) break;
          intended = rest[Math.floor(r() * rest.length)];
          decideAt = t + 1;
          lastLock = state.player.targetId; // the kill clears/keeps the id; the next change is the re-pick
        }
      }
    }
    const scored = picks.filter((p) => p.ok != null);
    return {
      scenario: id, family: sc.family, seed, n: enemies.length,
      picks: picks.length, ok: scored.filter((p) => p.ok).length,
      okWhenNotNearest: scored.filter((p) => !p.intendedIsNearest && p.ok).length,
      notNearest: scored.filter((p) => !p.intendedIsNearest).length,
      nearestPicks: picks.filter((p) => p.nearestPick).length,
      timeToLockS: firstLockTick == null ? null : +(firstLockTick * SIM_DT).toFixed(3),
      repickS: picks.length > 1 ? +(picks.slice(1).reduce((a, p) => a + p.dtS, 0) / (picks.length - 1)).toFixed(3) : null,
      switches, switchesPerMin: sc.family === 'live' ? +(switches / ((sc.capS || 20) / 60)).toFixed(2) : null,
      kills: killCount, gapPerKillS: killCount ? +(gapTicks * SIM_DT / killCount).toFixed(3) : null, cursorDistP50: picks.length ? picks.map((p) => p.cursorDist).sort((a, b) => a - b)[Math.floor(picks.length / 2)] : null,
      detail: picks,
    };
  } finally {
    world.dispose();
    if (typeof uiRootModule.setTargetLockLab === 'function') uiRootModule.setTargetLockLab({});
  }
}
