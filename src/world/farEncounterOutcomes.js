// Off-glass NPC vs NPC is a scheduled outcome, not a 60 Hz dogfight.
// Deterministic from seed + ids + simTime. Does not promote either body.

import { hash32 } from '../core/rng.js';

const DELAY_MIN_S = 8;
const DELAY_SPAN_S = 12;
const WINNER_COOLDOWN_S = 30;

function hostileRole(rec) {
  const role = rec && (rec.trafficRole || (rec.data && rec.data.trafficRole));
  const intent = rec && rec.intent && (rec.intent.kind || rec.intent.type);
  return role === 'pirate' || role === 'raider' || role === 'hunter'
    || intent === 'hunt' || intent === 'attack' || intent === 'intercept';
}

function liveShip(rec) {
  return !!(rec && rec.alive !== false && rec.type !== 'wreck' && rec.pos);
}

export function resolveFarEncounters(state, simTime) {
  const table = state && state.world && state.world.farActors;
  if (!table || !Array.isArray(table.rows) || table.rows.length < 2) return 0;
  const grid = table.grid;
  if (!(grid instanceof Map)) return 0;
  const t = Number.isFinite(simTime) ? simTime : 0;
  const seed = (state.meta && state.meta.seed) >>> 0 || 1;
  let resolved = 0;

  for (const bucket of grid.values()) {
    if (!bucket || bucket.length < 2) continue;
    for (let i = 0; i < bucket.length; i++) {
      const a = bucket[i];
      if (!liveShip(a)) continue;
      for (let j = i + 1; j < bucket.length; j++) {
        const b = bucket[j];
        if (!liveShip(b)) continue;
        if (a.team == null || b.team == null || a.team === b.team) continue;
        if (!hostileRole(a) && !hostileRole(b)) continue;

        const dueA = Number(a.nextEventAtT);
        const dueB = Number(b.nextEventAtT);
        const due = Number.isFinite(dueA) && dueA >= 0 ? dueA
          : (Number.isFinite(dueB) && dueB >= 0 ? dueB : NaN);
        if (!Number.isFinite(due)) {
          const when = t + DELAY_MIN_S + (hash32(seed, a.id, b.id) % DELAY_SPAN_S);
          a.nextEventAtT = when;
          b.nextEventAtT = when;
          continue;
        }
        if (t < due) continue;

        const roll = hash32(seed, a.id, b.id, Math.floor(due));
        const aWins = (roll & 1) === 0;
        const winner = aWins ? a : b;
        const loser = aWins ? b : a;
        loser.hull = 0;
        loser.type = 'wreck';
        loser.vel = { x: 0, z: 0 };
        loser.nextEventAtT = -1;
        winner.nextEventAtT = t + WINNER_COOLDOWN_S;
        resolved++;
      }
    }
  }
  return resolved;
}
