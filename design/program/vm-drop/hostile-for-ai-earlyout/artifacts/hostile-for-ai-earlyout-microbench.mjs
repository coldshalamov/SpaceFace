/**
 * Structural early-outs for isHostileForAI (no tick-Map cache).
 * Before = master body; After = no ||{}, gate Ceres/first-fire, null ai.
 */
import {
  isHostileForAI as liveAfter,
  isAuthorizedCeresAmbushPreyRelation,
  isAuthorizedPredationRelation,
} from '../hostile-for-ai-earlyout/src/ai/engagementAuthority.js';
import { normalizeFactionBehaviorProfile } from '../hostile-for-ai-earlyout/src/ai/factionBehavior.js';
import { isHostileToPlayer } from '../hostile-for-ai-earlyout/src/systems/scanner.js';
import { isPlayerWanted } from '../hostile-for-ai-earlyout/src/systems/heat.js';

const CERES_ACTIVITY_AMBUSH_ZONE_ID = 'zone_ceres_ambush';

function hasFactionFirstFireAuthorityBefore(actor, ai, target) {
  if (!actor || !target || !ai || ai.passive) return false;
  const profile = normalizeFactionBehaviorProfile(ai.factionPresenceDoctrine);
  return !!profile && profile.firstFire === true
    && profile.firstFireAgainst.includes(target.factionId);
}

function hasFactionFirstFireAuthorityAfter(actor, ai, target) {
  if (!actor || !target || !ai || ai.passive) return false;
  const doctrine = ai.factionPresenceDoctrine;
  if (!doctrine) return false;
  const profile = normalizeFactionBehaviorProfile(doctrine);
  return !!profile && profile.firstFire === true
    && profile.firstFireAgainst.includes(target.factionId);
}

function before(state, self, other) {
  if (!self || !other || self.team == null || other.team == null) return false;
  if (self.id === other.id) return false;

  const selfAi = self.data && self.data.ai || {};
  const otherAi = other.data && other.data.ai || {};
  if (self.data?.predationRole === 'raider'
    && (selfAi.predationStatus === 'standby'
      || selfAi.predationStatus === 'telegraph'
      || selfAi.predationStatus === 'active')) {
    return isAuthorizedPredationRelation(state, self, other);
  }
  if (isAuthorizedCeresAmbushPreyRelation(state, self, other)) return true;
  if (selfAi.lawful && selfAi.securityTargetId === other.id) return true;
  if (otherAi.lawful && otherAi.securityTargetId === self.id) return true;
  if (selfAi.retaliationTargetId === other.id) return true;
  if (otherAi.retaliationTargetId === self.id) return true;
  if (hasFactionFirstFireAuthorityBefore(self, selfAi, other)) return true;
  if (hasFactionFirstFireAuthorityBefore(other, otherAi, self)) return true;
  if (self.team === other.team) return false;

  const selfIsPlayer = !!(state && self.id === state.playerId);
  const otherIsPlayer = !!(state && other.id === state.playerId);
  const selfIsPlayerSide = selfIsPlayer || self.team === 0;
  const otherIsPlayerSide = otherIsPlayer || other.team === 0;
  if (selfIsPlayer) return isHostileToPlayer(other, self.team, state);
  if (otherIsPlayer) return isHostileToPlayer(self, other.team, state);

  if (selfAi.passive || otherAi.passive || self.team === 2 || other.team === 2) return false;
  if (selfAi.lawful && otherIsPlayerSide) return isPlayerWanted(state);
  if (otherAi.lawful && selfIsPlayerSide) return isPlayerWanted(state);
  return self.team !== other.team;
}

function after(state, self, other) {
  if (!self || !other || self.team == null || other.team == null) return false;
  if (self.id === other.id) return false;

  const selfData = self.data;
  const otherData = other.data;
  const selfAi = selfData ? selfData.ai : null;
  const otherAi = otherData ? otherData.ai : null;

  if (selfData && selfData.predationRole === 'raider') {
    const predationStatus = selfAi && selfAi.predationStatus;
    if (predationStatus === 'standby'
      || predationStatus === 'telegraph'
      || predationStatus === 'active') {
      return isAuthorizedPredationRelation(state, self, other);
    }
  }
  if (other.team === 2
    && selfAi
    && selfAi.zoneId === CERES_ACTIVITY_AMBUSH_ZONE_ID
    && isAuthorizedCeresAmbushPreyRelation(state, self, other)) {
    return true;
  }
  if (selfAi) {
    if (selfAi.lawful && selfAi.securityTargetId === other.id) return true;
    if (selfAi.retaliationTargetId === other.id) return true;
    if (selfAi.factionPresenceDoctrine && hasFactionFirstFireAuthorityAfter(self, selfAi, other)) {
      return true;
    }
  }
  if (otherAi) {
    if (otherAi.lawful && otherAi.securityTargetId === self.id) return true;
    if (otherAi.retaliationTargetId === self.id) return true;
    if (otherAi.factionPresenceDoctrine && hasFactionFirstFireAuthorityAfter(other, otherAi, self)) {
      return true;
    }
  }
  if (self.team === other.team) return false;

  const playerId = state && state.playerId;
  const selfIsPlayer = playerId != null && self.id === playerId;
  const otherIsPlayer = playerId != null && other.id === playerId;
  if (selfIsPlayer) return isHostileToPlayer(other, self.team, state);
  if (otherIsPlayer) return isHostileToPlayer(self, other.team, state);
  const selfIsPlayerSide = self.team === 0;
  const otherIsPlayerSide = other.team === 0;

  if ((selfAi && selfAi.passive) || (otherAi && otherAi.passive)
    || self.team === 2 || other.team === 2) return false;
  if (selfAi && selfAi.lawful && otherIsPlayerSide) return isPlayerWanted(state);
  if (otherAi && otherAi.lawful && selfIsPlayerSide) return isPlayerWanted(state);
  return self.team !== other.team;
}

function mkShip(id, team, ai = null, extraData = {}) {
  const data = { ...extraData };
  if (ai) data.ai = ai;
  return {
    id,
    team,
    type: 'ship',
    alive: true,
    factionId: ai && ai.factionId || extraData.factionId || null,
    data,
    pos: { x: (id % 17) * 40, z: (id % 13) * 40 },
  };
}

function world(n) {
  const entities = [];
  // 0: player
  entities.push(mkShip(1, 0, null));
  for (let i = 1; i < n; i++) {
    const id = i + 1;
    const r = i % 10;
    if (r === 0) {
      entities.push(mkShip(id, 2, { passive: true, role: 'trader' }));
    } else if (r === 1) {
      entities.push(mkShip(id, 1, { lawful: true, securityTargetId: null }));
    } else if (r === 2) {
      entities.push(mkShip(id, 1, {
        lawful: true,
        securityTargetId: 1,
      }));
    } else if (r === 3) {
      entities.push(mkShip(id, 1, {
        huntPlayer: true,
        spawnContext: 'zone_hostile',
      }));
    } else if (r === 4) {
      entities.push(mkShip(id, 1, {
        passive: false,
        retaliationTargetId: id % 3 === 0 ? 1 : null,
      }));
    } else if (r === 5) {
      // rare doctrine first-fire
      entities.push(mkShip(id, 1, {
        factionPresenceDoctrine: {
          pursuitCommitment: 0.5,
          preferredRange: 400,
          liveFormation: 'line',
          retreatHullFraction: 0.3,
          combatDoctrineId: 'brawler_commit',
          disableThenRun: false,
          firstFire: true,
          firstFireAgainst: ['faction_scn'],
          stationDefenseAggression: 0.2,
          disableChance: 0.1,
          destroyTarget: true,
        },
      }, { factionId: 'faction_outlaw' }));
    } else if (r === 6) {
      entities.push(mkShip(id, 1, { zoneId: 'somewhere_else' }));
    } else if (r === 7) {
      entities.push(mkShip(id, 3, { })); // rival team, no ai object
    } else if (r === 8) {
      entities.push(mkShip(id, 1, null)); // no ai
    } else {
      entities.push(mkShip(id, 1, { motive: 'patrol' }));
    }
  }
  const map = new Map(entities.map((e) => [e.id, e]));
  return {
    tick: 0,
    playerId: 1,
    playerWanted: false,
    entities: map,
    heat: { wanted: false },
  };
}

const N = 80;
const TICKS = 2500;
const PAIRS_PER = 500;
const stateB = world(N);
const stateA = world(N);
const entsB = [...stateB.entities.values()];
const entsA = [...stateA.entities.values()];

// Equivalence
let mismatches = 0;
for (let t = 0; t < 20; t++) {
  stateB.tick = t; stateA.tick = t;
  stateB.playerWanted = t % 7 === 0;
  stateA.playerWanted = stateB.playerWanted;
  if (stateB.heat) stateB.heat.wanted = stateB.playerWanted;
  if (stateA.heat) stateA.heat.wanted = stateA.playerWanted;
  for (let p = 0; p < 2000; p++) {
    const i = p % N;
    const j = (p * 11 + t) % N;
    const vb = before(stateB, entsB[i], entsB[j]);
    const va = after(stateA, entsA[i], entsA[j]);
    const vl = liveAfter(stateA, entsA[i], entsA[j]);
    if (vb !== va || va !== vl) mismatches += 1;
  }
}
if (mismatches) {
  console.error(JSON.stringify({ error: 'equivalence_failed', mismatches }));
  process.exit(1);
}

// Warmup
for (let t = 0; t < 30; t++) {
  for (let p = 0; p < 200; p++) {
    const i = p % N, j = (p * 7) % N;
    before(stateB, entsB[i], entsB[j]);
    after(stateA, entsA[i], entsA[j]);
    liveAfter(stateA, entsA[i], entsA[j]);
  }
}

let sink = 0;
let t0 = performance.now();
for (let t = 0; t < TICKS; t++) {
  stateB.tick = t;
  stateB.playerWanted = (t & 15) === 0;
  for (let p = 0; p < PAIRS_PER; p++) {
    const i = p % N, j = (p * 7 + t) % N;
    if (before(stateB, entsB[i], entsB[j])) sink++;
  }
}
const beforeMs = performance.now() - t0;

t0 = performance.now();
for (let t = 0; t < TICKS; t++) {
  stateA.tick = t;
  stateA.playerWanted = (t & 15) === 0;
  for (let p = 0; p < PAIRS_PER; p++) {
    const i = p % N, j = (p * 7 + t) % N;
    if (after(stateA, entsA[i], entsA[j])) sink++;
  }
}
const afterMs = performance.now() - t0;

t0 = performance.now();
for (let t = 0; t < TICKS; t++) {
  stateA.tick = t;
  stateA.playerWanted = (t & 15) === 0;
  for (let p = 0; p < PAIRS_PER; p++) {
    const i = p % N, j = (p * 7 + t) % N;
    if (liveAfter(stateA, entsA[i], entsA[j])) sink++;
  }
}
const liveMs = performance.now() - t0;

const result = {
  pairs: TICKS * PAIRS_PER,
  ships: N,
  beforeMs,
  afterMs,
  liveMs,
  speedup: beforeMs / afterMs,
  liveSpeedup: beforeMs / liveMs,
  sink,
  mismatches,
};
console.log(JSON.stringify(result, null, 2));
