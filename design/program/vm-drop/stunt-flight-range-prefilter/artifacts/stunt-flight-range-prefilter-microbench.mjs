/**
 * StuntFlightObserver threat scan: type+range prefilter before isHostileForAI.
 */
import { StuntFlightObserver } from '../stunt-flight-range-prefilter/src/combat/stuntFlightEvidence.js';
import { bindStuntEvidence } from '../stunt-flight-range-prefilter/src/combat/stuntEvidence.js';
import { isHostileForAI } from '../stunt-flight-range-prefilter/src/ai/engagementAuthority.js';

const THREAT_SCAN_RANGE_SQ = 2400 * 2400;
function isThreatCandidateType(type) {
  return type === 'ship' || type === 'projectile' || type === 'drone';
}
function hostileThreat(state, e, player) {
  const owner = e.ownerId != null ? state.entities.get(e.ownerId) : e;
  if (!owner || !isHostileForAI(state, owner, player)) return false;
  return e.type === 'projectile'
    || e.data?.ai?.activity?.targetId === player.id
    || e.data?.combat?.targetId === player.id;
}

/** Master threat-scan body (no track bookkeeping) for fair wall compare. */
function scanBefore(state, player) {
  let hits = 0;
  for (const e of state.entities.values()) {
    if (!e?.pos || !e.vel || e.alive === false || e.id === player.id || !hostileThreat(state, e, player)) continue;
    const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
    hits += (dx * dx + dz * dz) < 1e12 ? 1 : 0;
  }
  return hits;
}
function scanAfter(state, player) {
  let hits = 0;
  for (const e of state.entities.values()) {
    if (!e?.pos || !e.vel || e.alive === false || e.id === player.id) continue;
    if (!isThreatCandidateType(e.type)) continue;
    const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
    if (dx * dx + dz * dz > THREAT_SCAN_RANGE_SQ) continue;
    if (!hostileThreat(state, e, player)) continue;
    hits += 1;
  }
  return hits;
}

function world(n) {
  const entities = new Map();
  const player = {
    id: 1, team: 0, type: 'ship', alive: true, name: 'player',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 40 }, rot: 0, mass: 10, radius: 8, hull: 100, hullMax: 100,
    data: { shipId: 'ship_kestrel' },
  };
  entities.set(1, player);
  for (let i = 2; i <= n; i++) {
    const kind = i % 8;
    const type = kind === 0 ? 'asteroid' : kind === 1 ? 'pickup' : kind === 2 ? 'projectile'
      : kind === 3 ? 'drone' : 'ship';
    const team = type === 'ship' || type === 'drone' ? (i % 5 === 0 ? 2 : 1) : 1;
    const near = i % 4 === 0;
    const dist = near ? (80 + (i % 15) * 40) : (2800 + (i % 40) * 100);
    const ang = i * 0.41;
    const ownerId = type === 'projectile' ? (2 + (i % 12)) : null;
    entities.set(i, {
      id: i, type, team, alive: true, name: `${type}-${i}`,
      pos: { x: Math.cos(ang) * dist, z: Math.sin(ang) * dist },
      vel: { x: 12, z: 4 }, rot: 0, mass: 5, radius: type === 'projectile' ? 1 : 10,
      hull: 50, hullMax: 50, ownerId,
      data: {
        shipId: 'ship_kestrel',
        ai: type === 'ship' ? { huntPlayer: i % 9 === 0, passive: team === 2, spawnContext: 'zone_hostile' } : {},
        combat: type === 'ship' && i % 9 === 0 ? { targetId: 1 } : {},
      },
    });
  }
  const state = {
    tick: 0, playerId: 1, entities, mode: 'flight',
    playerWanted: false, heat: { wanted: false },
    input: { turn: 0, throttle: 1, strafe: 0 },
  };
  bindStuntEvidence(state);
  return state;
}

const state = world(350);
const player = state.entities.get(1);
const obs = new StuntFlightObserver();

// Warm + equivalence on near hostiles counted
let sink = 0;
for (let i = 0; i < 30; i++) {
  state.tick = i;
  sink += scanBefore(state, player);
  sink += scanAfter(state, player);
  obs.update(state);
}

const ITER = 1500;
let t0 = performance.now();
for (let i = 0; i < ITER; i++) {
  state.tick = 1000 + i;
  sink += scanBefore(state, player);
}
const beforeMs = performance.now() - t0;

t0 = performance.now();
for (let i = 0; i < ITER; i++) {
  state.tick = 1000 + i;
  sink += scanAfter(state, player);
}
const afterMs = performance.now() - t0;

// Full observer smoke (patched)
t0 = performance.now();
for (let i = 0; i < ITER; i++) {
  state.tick = 3000 + i;
  sink += obs.update(state).length;
}
const liveMs = performance.now() - t0;

const result = {
  entities: state.entities.size,
  iters: ITER,
  beforeMs,
  afterMs,
  liveObserverMs: liveMs,
  speedup: beforeMs / afterMs,
  sink,
};
console.log(JSON.stringify(result, null, 2));
