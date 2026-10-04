// The curated ladder (SWARM_ARCADE §6, SWARM-04).
//
// Pure data + pure functions. No bus, no state, no DOM — the same inputs always answer
// the same ladder. Three things live here:
//
//   * THE SEED — "more or less the same each time, but you get further if you're better."
//     The wave planner is already pure; the ladder is one authored seed per arena so the
//     thirty rounds a player meets are learnable. Daily and a typed Custom seed stay as
//     side doors: a run only settles onto the ladder when its seed IS the arena's seed.
//
//   * ZONES — the endless wave count reads as named zones of ten rounds, each ending in
//     its boss (the boss rotation already rides every tenth wave). Zone 1 The Pack,
//     Zone 2 The Wing, Zone 3 The Anvil, Zone 4 The Choir — then the cycle repeats under
//     a hardened numeral (The Pack II, The Wing II, …) so deep runs still name a place.
//
//   * STARS + CHECKPOINTS — a cleared zone boss pays up to three stars (beat it / never
//     went down inside the zone / hit the zone's chain target) and unlocks a checkpoint
//     start at the NEXT zone with a purse sized to a typical run's purse at that point.
//     Cumulative stars open the next arena in the authored order.
//
// Ownership: survivalRecords owns the profile slice (migrate + settle call applySwarm-
// LadderResult from here). The door reads the pure helpers to seed launches, list
// checkpoints, and gate arenas. swarmChain deliberately never touches run state, so the
// run's tally owner (survivalResults) records per-zone chains and deaths into the
// result; this module only ever sees plain facts.

import {
  swarmPlanBlock,
  swarmRosterFor,
} from './swarmMode.js';
import { swarmEventFor } from './swarmEvents.js';

/** One zone is ten rounds, boss on the tenth — the same cadence the boss rotation ships. */
export const SWARM_ZONE_LENGTH = 10;

/** The four authored names. A fifth zone repeats the first under a numeral. */
export const SWARM_ZONE_NAMES = Object.freeze(['The Pack', 'The Wing', 'The Anvil', 'The Choir']);

const ROMAN = ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/**
 * The wave's zone. Wave 1..10 is zone 0 (The Pack), 11..20 zone 1, and so on — same
 * indexing the boss rotation uses (isSwarmBossWave rides wave % 10 === 0).
 */
export function swarmZoneIndexFor(wave) {
  const w = Number.isInteger(wave) && wave > 0 ? wave : 1;
  return Math.floor((w - 1) / SWARM_ZONE_LENGTH);
}

function romanSuffix(cycle) {
  if (cycle <= 0) return '';
  return ` ${ROMAN[Math.min(ROMAN.length - 1, cycle - 1)]}`;
}

/** The zone the wave belongs to: name, bounds, and which cycle of hardening it is on. */
export function swarmZoneFor(wave) {
  const index = swarmZoneIndexFor(wave);
  const cycle = Math.floor(index / SWARM_ZONE_NAMES.length);
  const base = SWARM_ZONE_NAMES[index % SWARM_ZONE_NAMES.length];
  return {
    index,
    number: index + 1,
    cycle,
    name: base + romanSuffix(cycle),
    startWave: index * SWARM_ZONE_LENGTH + 1,
    bossWave: (index + 1) * SWARM_ZONE_LENGTH,
  };
}

/**
 * ONE AUTHORED SEED PER ARENA — the ladder. The planner is pure, so the whole difference
 * between "the same each time" and "a fresh run" is which seed the launch was handed.
 * Daily keeps its date seed and a typed number stays a Custom run: neither lands on the
 * ladder, so neither pays stars or checkpoints (isSwarmLadderRun is the gate).
 */
export const SWARM_ARCADE_SEEDS = Object.freeze({
  helios_core: 73311,
  lagrange_crucible: 73312,
  cinder_sluice: 73313,
  cryo_drift: 73314,
  storm_lattice: 73315,
  asteroid_mill: 73316,
  the_hive: 73317,
});

/** The star-unlock order — Foundry first, the Hive last (§6.3 + SWARM-07 B4). */
export const SWARM_LADDER_ARENA_ORDER = Object.freeze(
  Object.keys(SWARM_ARCADE_SEEDS),
);

/** Cumulative ladder stars required before the arena's Play opens. Foundry is always open. */
export const SWARM_ARENA_STAR_GATES = Object.freeze({
  helios_core: 0,
  lagrange_crucible: 2,
  cinder_sluice: 4,
  cryo_drift: 6,
  storm_lattice: 8,
  asteroid_mill: 10,
  the_hive: 12,
});

/** The arena's authored ladder seed, or null for a room with no ladder. */
export function swarmArcadeSeedFor(arenaId) {
  const seed = SWARM_ARCADE_SEEDS[arenaId];
  return Number.isInteger(seed) ? seed : null;
}

/** Total stars the profile has banked across every ladder arena. */
export function swarmLadderStarTotal(ladder) {
  const arenas = ladder && typeof ladder === 'object' ? ladder.arenas : null;
  if (!arenas || typeof arenas !== 'object') return 0;
  let total = 0;
  for (const rec of Object.values(arenas)) {
    const zones = rec && rec.zones;
    if (!zones || typeof zones !== 'object') continue;
    for (const z of Object.values(zones)) {
      total += Number.isInteger(z && z.stars) ? Math.max(0, Math.min(3, z.stars)) : 0;
    }
  }
  return total;
}

/** Can the arena's ladder Play be launched? Gates read the CUMULATIVE star total. */
export function swarmArenaIsUnlocked(ladder, arenaId) {
  const gate = SWARM_ARENA_STAR_GATES[arenaId];
  if (!Number.isInteger(gate)) return false;
  return swarmLadderStarTotal(ladder) >= gate;
}

/** The star a checkpoint start pays toward — the first wave of the zone. */
export function swarmCheckpointStartWave(zoneIndex) {
  const idx = Number.isInteger(zoneIndex) && zoneIndex >= 0 ? zoneIndex : 0;
  return idx * SWARM_ZONE_LENGTH + 1;
}

/**
 * A typical run's purse at that point — sized so the checkpoint armory can actually fit a
 * mid-build, not so the player coasts. Clear credits pay roughly 700–900 a zone before
 * chip pickups and armory spending, so zone 2 opens at 800 and each later zone adds ~350.
 */
export function swarmCheckpointPurseFor(zoneIndex) {
  const idx = Number.isInteger(zoneIndex) ? zoneIndex : 0;
  if (idx < 1) return 0;
  return 800 + 350 * (idx - 1);
}

/** The chain that earns a zone's third star. Climbs so the late zones still ask for play. */
export function swarmZoneChainTarget(zoneIndex) {
  const idx = Number.isInteger(zoneIndex) && zoneIndex >= 0 ? zoneIndex : 0;
  return 12 + idx * 6;
}

/**
 * The star a finished zone awards. `deathsInZone` counts player defeats that landed inside
 * the zone's rounds — today a defeat ends the run (so a cleared zone always reads zero),
 * which is exactly the clause Second Wind flips when it ships: a spent revive inside the
 * zone takes the flawless star and leaves the other two.
 */
export function swarmZoneStars({ zoneIndex, deathsInZone = 0, bestChainInZone = 0 } = {}) {
  const flawless = (Number.isInteger(deathsInZone) ? deathsInZone : 0) === 0;
  const chain = Number.isFinite(bestChainInZone) ? bestChainInZone : 0;
  const stars = 1 + (flawless ? 1 : 0) + (chain >= swarmZoneChainTarget(zoneIndex) ? 1 : 0);
  return {
    stars,
    cleared: true,
    flawless,
    chainTarget: swarmZoneChainTarget(zoneIndex),
    chainHit: chain >= swarmZoneChainTarget(zoneIndex),
  };
}

/**
 * Ladder eligibility. A run counts only when it is THE ladder run: swarm ruleset, an
 * arena that has an authored seed, that seed, and none of the side-door flags (daily,
 * weekly mutator, practice, challenge mutators). A typed Custom seed is honest play that
 * simply does not pay stars.
 */
export function isSwarmLadderRun(source = {}) {
  const src = source && typeof source === 'object' ? source : {};
  const ruleset = src.ruleset || (src.run && src.run.ruleset) || null;
  const mode = src.mode || (src.recordRules && src.recordRules.mode) || ruleset;
  if (mode !== 'swarm' && ruleset !== 'swarm') return false;
  if (mode === 'practice') return false;
  const arenaId = src.arenaId || (src.run && src.run.arenaId) || null;
  const seed = Number.isInteger(src.seed) ? src.seed
    : (src.run && Number.isInteger(src.run.seed) ? src.run.seed : null);
  if (swarmArcadeSeedFor(arenaId) == null || seed !== swarmArcadeSeedFor(arenaId)) return false;
  if (typeof src.dailyDateKey === 'string' && src.dailyDateKey) return false;
  if (typeof src.weeklyMutatorId === 'string' && src.weeklyMutatorId) return false;
  // Challenge mutators rewrite the waves, so a mutator run is a custom contract even on the
  // arena's own seed. A ghost raced on the ladder seed is still the ladder — same waves,
  // same fight; the tape never touched generation.
  if (Array.isArray(src.mutators) && src.mutators.length > 0) return false;
  return true;
}

/** The ladder slice a fresh or migrated profile carries. */
export function emptySwarmLadder() {
  return { arenas: {} };
}

/**
 * Normalizer — unknown/garbage content decays to the empty slice; zone rows keep only the
 * fields the ladder owns. Schema stays the crucible-meta envelope's business.
 */
export function migrateSwarmLadder(raw) {
  const out = emptySwarmLadder();
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
  if (!src) return out;
  const arenas = src.arenas && typeof src.arenas === 'object' && !Array.isArray(src.arenas)
    ? src.arenas : {};
  for (const [arenaId, rec] of Object.entries(arenas)) {
    if (typeof arenaId !== 'string' || !arenaId || !rec || typeof rec !== 'object') continue;
    const zones = {};
    const srcZones = rec.zones && typeof rec.zones === 'object' && !Array.isArray(rec.zones)
      ? rec.zones : {};
    for (const [key, z] of Object.entries(srcZones)) {
      const idx = Number(key);
      if (!Number.isInteger(idx) || idx < 0 || !z || typeof z !== 'object') continue;
      zones[String(idx)] = {
        stars: Math.max(0, Math.min(3, Number.isInteger(z.stars) ? z.stars : 0)),
        bestChain: Number.isInteger(z.bestChain) && z.bestChain > 0 ? z.bestChain : 0,
      };
    }
    out.arenas[arenaId] = {
      zones,
      bestWave: Number.isInteger(rec.bestWave) && rec.bestWave > 0 ? rec.bestWave : 0,
      checkpoint: Number.isInteger(rec.checkpoint) && rec.checkpoint > 0 ? rec.checkpoint : 0,
    };
  }
  return out;
}

/**
 * The zones a run's clear span finished. `startWave` is where the run began (1, or a
 * checkpoint's first wave); `lastClearedWave` is the deepest round fully cleared — a zone
 * counts when its BOSS wave falls inside the span.
 */
export function swarmLadderZonesCleared(startWave, lastClearedWave) {
  const start = Number.isInteger(startWave) && startWave > 0 ? startWave : 1;
  const last = Number.isInteger(lastClearedWave) ? lastClearedWave : 0;
  if (last < start) return [];
  const firstZone = swarmZoneIndexFor(start);
  const lastZone = Math.floor(last / SWARM_ZONE_LENGTH) - 1;
  const out = [];
  for (let z = firstZone; z <= lastZone; z++) out.push(z);
  return out;
}

/**
 * Apply a finished ladder run to the ladder slice. Pure — returns the next slice plus the
 * delta the results screen celebrates. Stars never decay: a worse attempt never loses one.
 */
export function applySwarmLadderResult(ladder, facts = {}) {
  const next = migrateSwarmLadder(ladder);
  const delta = { zones: {}, newStars: 0, newCheckpoint: null, arenaId: null };
  const arenaId = typeof facts.arenaId === 'string' ? facts.arenaId : null;
  if (!arenaId) return { ladder: next, delta };
  delta.arenaId = arenaId;
  const zoneChains = facts.zoneChains && typeof facts.zoneChains === 'object' ? facts.zoneChains : {};
  const zoneDeaths = facts.zoneDeaths && typeof facts.zoneDeaths === 'object' ? facts.zoneDeaths : {};
  const cleared = swarmLadderZonesCleared(facts.startWave, facts.lastClearedWave);
  const arena = next.arenas[arenaId] || { zones: {}, bestWave: 0, checkpoint: 0 };
  next.arenas[arenaId] = arena;
  const deepest = Number.isInteger(facts.deepestWave) ? facts.deepestWave : 0;
  if (deepest > arena.bestWave) arena.bestWave = deepest;
  let maxCleared = -1;
  for (const z of cleared) {
    const key = String(z);
    const prev = arena.zones[key] || { stars: 0, bestChain: 0 };
    const evald = swarmZoneStars({
      zoneIndex: z,
      deathsInZone: Number.isInteger(zoneDeaths[key]) ? zoneDeaths[key] : 0,
      bestChainInZone: Math.max(
        Number.isInteger(zoneChains[key]) ? zoneChains[key] : 0,
        prev.bestChain,
      ),
    });
    const stars = Math.max(prev.stars, evald.stars);
    const bestChain = Math.max(prev.bestChain,
      Number.isInteger(zoneChains[key]) ? zoneChains[key] : 0);
    arena.zones[key] = { stars, bestChain };
    delta.zones[key] = {
      stars,
      gained: stars - prev.stars,
      flawless: evald.flawless,
      chainHit: evald.chainHit,
      chainTarget: evald.chainTarget,
    };
    delta.newStars += Math.max(0, stars - prev.stars);
    maxCleared = Math.max(maxCleared, z);
  }
  if (maxCleared >= 0 && maxCleared + 1 > (arena.checkpoint || 0)) {
    arena.checkpoint = maxCleared + 1;
    delta.newCheckpoint = {
      zoneIndex: arena.checkpoint,
      startWave: swarmCheckpointStartWave(arena.checkpoint),
      purse: swarmCheckpointPurseFor(arena.checkpoint),
    };
  }
  return { ladder: next, delta };
}

/**
 * The armory's next-round card (§6.5): body count, archetypes, any newcomer, the event
 * card, the boss — all of it already authored on the plan. Pure: same inputs, same card.
 */
export function swarmRoundPreview({ arenaId, wave, seed } = {}) {
  const w = Number.isInteger(wave) && wave > 0 ? wave : 1;
  const block = swarmPlanBlock(w);
  const zone = swarmZoneFor(w);
  const names = new Map(swarmRosterFor(w).map((entry) => [entry.enemyId, entry.name]));
  const roster = (block.roster || [])
    .map((entry) => names.get(entry.enemyId) || entry.enemyId)
    .filter(Boolean);
  const event = swarmEventFor({ arenaId, wave: w, seed });
  return {
    wave: w,
    zone,
    killTarget: block.killTarget,
    concurrent: block.concurrent,
    roster,
    newcomer: block.newcomer ? block.newcomer.name : null,
    boss: block.boss ? { label: block.bossLabel, line: block.bossLine } : null,
    event: event ? { name: event.name, telegraph: event.telegraph } : null,
  };
}
