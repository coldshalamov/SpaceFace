// SWARM-07 B1 — the Brood tier: the swarm's second population (SWARM_EXPANSION §4 B1).
//
// Beside today's 10-30 smart ships, a swarm run fields 100-400 light Brood bodies. This file is
// the pure data + pure plan layer, exactly like swarmMode.js is for ships: no bus, no state, no
// registry, no DOM, no RNG source but the stream it is handed. Same (seed, wave) always yields
// the same cohort. The engine lives in src/systems/swarmBrood.js; the renderer in
// src/render/broodPresentation.js.
//
// LAWS
//   * Pressure is still concurrency of SHIPS. Brood are never counted by swarmConcurrent,
//     swarmQuota or the spawn budget — the quota/concurrency semantics of the ship wave are
//     untouched, and no brood body consumes a ship slot.
//   * The population cap is absolute: every live population sits in [SWARM_BROOD_MIN,
//     SWARM_BROOD_MAX]. Boss waves field fewer bodies so the champion stays legible — but never
//     below the minimum, and never above the maximum.
//   * Composition is lawful: a wave's cohort may only name families the roster clock has
//     unlocked (fromWave <= wave). swarmBroodIssues() is the catalog check every authoring
//     change has to walk past, mirroring swarmCatalogIssues().
//   * Every family telegraphs {bark,line,cue} — the FB-016/017 attack language. Attacks are
//     dodgeable by construction: the telegraph windows are authored here and the engine renders
//     them before every hit.
//   * Brood are DESIGNED bodies, not sprites: each family carries its own silhouette scale and
//     hull colour recipe consumed by the instanced renderer.

import { isSwarmBossWave, swarmBossFor } from './swarmMode.js';
import { HIVE_ARENA_ID } from '../systems/theHiveArena.js';
// The late table continues this file's roster clock (foldBroodLatePlan spends mites into it).
// Read inside functions only — the sibling module already imports this one, so a top-level
// dereference here would race the cycle.
import { SWARM_BROOD_LATE_FAMILIES } from './swarmBroodLate.js';
// The Bloom's authored pathology windows live in one place; the BROOD_* names below are this
// engine's aliases of them (values are never restated here).
import {
  BLOOM_AGGRESSION_S,
  BLOOM_CASCADE_RADIUS,
  BLOOM_FILAMENT_FLARE_S,
  BLOOM_GRIEF_RING,
  BLOOM_GRIEF_S,
  BLOOM_PANIC_KILL_MASS,
  BLOOM_PANIC_REFORM_S,
  BLOOM_PANIC_SCATTER_MAX_S,
  BLOOM_PANIC_SCATTER_MIN_S,
  BLOOM_THRASH_RADIUS,
  BLOOM_THRASH_S,
  BLOOM_THRASH_SWEEP,
} from './bloomLadder.js';

export const SWARM_BROOD_SCHEMA_VERSION = 1;

/** Population law. Every active population holds inside this band — the cap never moves. */
export const SWARM_BROOD_MIN = 100;
export const SWARM_BROOD_MAX = 400;
/** Wave the population ceiling is reached at (then it stays there). */
export const SWARM_BROOD_FULL_WAVE = 21;
/** Boss waves field this fraction of the wave's population — the champion stays legible. */
export const SWARM_BROOD_BOSS_FRACTION = 0.4;

/** The champion ids whose waves bend the brood cohort's size or composition. */
export const SWARM_BROOD_QUEEN_ID = 'brood_queen';
export const SWARM_BROOD_TENDRIL_ID = 'brood_tendril';

/**
 * The champion this wave fields when it is one of the Brood's own named set-pieces —
 * 'brood_queen' or 'brood_tendril' — or null for every other wave (including capital waves
 * that are not the Brood's own). Pure read of the rotation; the engine keys segment mode
 * and the flood off this instead of re-deriving the wave table.
 */
export function swarmBroodBossFor(wave) {
  if (!isSwarmBossWave(wave)) return null;
  const boss = swarmBossFor(wave);
  if (!boss || (boss.id !== SWARM_BROOD_QUEEN_ID && boss.id !== SWARM_BROOD_TENDRIL_ID)) return null;
  return boss.id;
}

/**
 * The population this wave fields. 100 at wave one, the 400 ceiling by SWARM_BROOD_FULL_WAVE,
 * boss waves pulled down toward the minimum but never under it — with ONE exception: the
 * Brood Queen's wave fields the FULL curve, because her flood IS the fight (the spec's
 * "she floods the room with mites" is the population law, not a flag). Pure; the engine and
 * the tests both read this — there is no second population formula anywhere.
 */
export function swarmBroodPopulation(wave) {
  const w = Math.max(1, Math.trunc(Number(wave) || 1));
  const raw = SWARM_BROOD_MIN + Math.round((w - 1) * ((SWARM_BROOD_MAX - SWARM_BROOD_MIN) / (SWARM_BROOD_FULL_WAVE - 1)));
  const target = Math.min(SWARM_BROOD_MAX, Math.max(SWARM_BROOD_MIN, raw));
  if (!isSwarmBossWave(w)) return target;
  const boss = swarmBossFor(w);
  if (boss && boss.id === SWARM_BROOD_QUEEN_ID) return target; // the flood is the fight
  return Math.max(SWARM_BROOD_MIN, Math.round(target * SWARM_BROOD_BOSS_FRACTION));
}

/**
 * The roster clock — one new silhouette at a time, the FB-023 pattern. B1 landed the Mite (the
 * whole tier arrives with the mode); B2 adds the family attack language behind the same clock:
 * Spitters lob marked acid arcs, Chargers line-telegraph a committed dash, Leechers latch and
 * slow until a wall scrape sheds them. `weight` is a composition share once unlocked; role
 * names the problem the family poses.
 */
export const SWARM_BROOD_FAMILIES = Object.freeze([
  {
    id: 'mite',
    name: 'Mite',
    role: 'mass',
    fromWave: 1,
    weight: 10,
    radius: 2.4,
    mass: 8,
    hull: 5,
    speed: 44,
    turn: 5.2,
    // Per-brood pay. Brood are fodder: one credit, a third of a wasp's score — the chain is
    // where their value lives, exactly like the ship grammar (style pays, quota stays ships).
    credits: 1,
    score: 12,
    telegraph: { bark: 'warn', line: 'The mites flock and dive. The room is full of ammunition.', cue: 'engine_flare' },
    counter: 'They flock and dive. Sweep them with the room.',
    deathLeaves: 'husk shards (throwable)',
    // W-BLOOM-LOW remains: `kind` names the authored throwable; `splashRadius`>0 bursts and
    // spends on impact, `glueS`>0 sticks and slows instead of killing, `whipMult` widens the
    // player's swing while the body is held on the line. Bare `{kind,mass,radius}` is plain
    // thrown mass that keeps flying until it despawns.
    remains: { kind: 'husk_shards', name: 'Husk shards', mass: 6, radius: 2.6 },
    bodyColor: [0.62, 0.30, 0.16],
    bodyEmissive: [0.55, 0.14, 0.05],
  },
  {
    id: 'spitter',
    name: 'Spitter',
    role: 'reach',
    fromWave: 3,
    weight: 3,
    radius: 3.4,
    mass: 14,
    hull: 14,
    speed: 30,
    turn: 3.4,
    credits: 2,
    score: 25,
    telegraph: { bark: 'warn', line: 'A spitter arcs acid — the marker is where it lands.', cue: 'weapon_charge' },
    counter: 'It lobs acid. Dodge the marker, work the throw.',
    deathLeaves: 'acid sac (a thrown sac splashes)',
    remains: { kind: 'acid_sac', name: 'Acid sac', mass: 14, radius: 4, splashRadius: 30 },
    bodyColor: [0.18, 0.46, 0.22],
    bodyEmissive: [0.10, 0.34, 0.10],
  },
  {
    id: 'spore_drift',
    name: 'Spore Drift',
    role: 'hazard',
    fromWave: 5,
    weight: 2,
    radius: 7.0,
    mass: 4,
    hull: 1,
    speed: 14,
    turn: 0.9,
    credits: 1,
    score: 8,
    telegraph: { bark: 'warn', line: 'A green haze drifts across the field — it clings to a warm hull.', cue: 'engine_flare' },
    counter: 'It is only a cloud. Burn it or blow it apart — never fly through it slow.',
    // W-BLOOM-LOW T0: a sticky cloud, not a hunter. `hazard` marks it out of the attack
    // language; `blastOnly` means only an explosion cause kills it — whips, plows and
    // terrain just blow it around, which is the counter the spec authors.
    hazard: true,
    blastOnly: true,
    slowRadius: 26,
    slowAccel: 34,
    deathLeaves: 'nothing; it clears',
    bodyColor: [0.16, 0.52, 0.22],
    bodyEmissive: [0.06, 0.34, 0.10],
  },
  {
    id: 'charger',
    name: 'Charger',
    role: 'pressure',
    fromWave: 7,
    weight: 3,
    radius: 3.8,
    mass: 26,
    hull: 22,
    speed: 36,
    turn: 2.6,
    credits: 2,
    score: 30,
    telegraph: { bark: 'warn', line: 'The charger squares up — the line is its committed pass.', cue: 'engine_flare' },
    counter: 'It lines a dash. Sidestep — feed it a rock.',
    deathLeaves: 'horn plate (heavy throwable)',
    remains: { kind: 'horn_plate', name: 'Horn plate', mass: 60, radius: 6 },
    bodyColor: [0.50, 0.16, 0.16],
    bodyEmissive: [0.40, 0.06, 0.04],
  },
  {
    id: 'lantern_cyst',
    name: 'Lantern Cyst',
    role: 'bomb',
    fromWave: 9,
    weight: 2,
    radius: 4.4,
    mass: 22,
    hull: 6,
    speed: 18,
    turn: 1.4,
    credits: 3,
    score: 34,
    telegraph: { bark: 'warn', line: 'The cyst\'s glow brightens as it closes — it is about to burst.', cue: 'weapon_charge' },
    counter: 'It is a bomb drifting to your heat. Grab it, throw it into the pack.',
    // W-BLOOM-LOW T1: seeks the hot signature; PRIME (its glow) telegraphs the burst that
    // fires whenever it dies — thrown into a pack it is the player's bomb, untouched it is
    // the pack's. `deathShove` is the spore burst that shoves everything near the kill.
    seeksHeat: true,
    primeRange: 70,
    primeS: 1.1,
    burstRadius: 90,
    burstDv: 120,
    deathLeaves: 'spore burst (shoves everything)',
    bodyColor: [0.55, 0.62, 0.14],
    bodyEmissive: [0.55, 0.50, 0.08],
  },
  {
    id: 'leecher',
    name: 'Leecher',
    role: 'control',
    fromWave: 11,
    weight: 2,
    radius: 3.0,
    mass: 10,
    hull: 9,
    speed: 54,
    turn: 4.4,
    credits: 2,
    score: 22,
    telegraph: { bark: 'warn', line: 'The leecher wants your hull — it drags until you shed it.', cue: 'pd_curtain' },
    counter: 'It latches and slows you. Scrape a wall to shed it.',
    deathLeaves: 'the leech, still sticky (glue ammunition)',
    remains: { kind: 'leech_glue', name: 'Still leech', mass: 9, radius: 3.2, glueS: 3 },
    bodyColor: [0.36, 0.20, 0.52],
    bodyEmissive: [0.22, 0.10, 0.38],
  },
  {
    id: 'glassback',
    name: 'Glassback',
    role: 'armor',
    fromWave: 13,
    weight: 2,
    radius: 6.2,
    mass: 80,
    hull: 60,
    speed: 16,
    turn: 1.1,
    credits: 4,
    score: 42,
    telegraph: { bark: 'warn', line: 'The grazer\'s shell glints — your guns will only sing off it.', cue: 'pd_curtain' },
    counter: 'Guns ping off. Only mass kills it — smash it with the room.',
    // W-BLOOM-LOW T2: the silicate grazer. `massOnly` is the reflect-gunfire law — it dies
    // by collision/terrain (mass), never by explosive or direct causes. `deathShards` is
    // the shatter: the shell becomes a splash that takes nearby bodies with it.
    massOnly: true,
    shardRadius: 40,
    shardDamage: 14,
    deathLeaves: 'glass shards (they shatter on impact, splash damage)',
    remains: { kind: 'glass_shards', name: 'Glass shards', mass: 20, radius: 5, splashRadius: 40 },
    bodyColor: [0.55, 0.62, 0.58],
    bodyEmissive: [0.20, 0.30, 0.26],
  },
  {
    id: 'wake_eel',
    name: 'Wake Eel',
    role: 'trail',
    fromWave: 15,
    weight: 2,
    radius: 4.8,
    mass: 120,
    hull: 34,
    speed: 62,
    turn: 3.0,
    credits: 4,
    score: 46,
    telegraph: { bark: 'warn', line: 'A ribbon rides your wake — it is wrapping the hull.', cue: 'engine_flare' },
    counter: 'It trails you. Turn hard and grab its tail — held, it is a whip.',
    // W-BLOOM-LOW T2: `trails` steers to a point astern of the signature's velocity, and a
    // whip bat WRAPS it onto the line — held, the eel widens the swing's kill width, which
    // is exactly the "a whip while held" the ladder promises.
    trails: true,
    wrapRange: 14,
    wrapS: 6,
    deathLeaves: 'the eel body — a whip while held',
    remains: { kind: 'eel_body', name: 'Eel body', mass: 30, radius: 5, whipMult: 1.9 },
    bodyColor: [0.22, 0.44, 0.50],
    bodyEmissive: [0.08, 0.24, 0.30],
  },
  {
    id: 'bellows',
    name: 'Bellows',
    role: 'bomb',
    fromWave: 17,
    weight: 2,
    radius: 5.6,
    mass: 160,
    hull: 46,
    speed: 12,
    turn: 0.8,
    credits: 5,
    score: 52,
    telegraph: { bark: 'warn', line: 'The bellows is swelling — strike it again and it bursts.', cue: 'weapon_charge' },
    counter: 'It inflates on a hit. Grab it before it bursts and fling it into a pack.',
    // W-BLOOM-LOW T2: `swells` is the two-hit rule — a strike that does not kill inflates
    // it (the readable tell); a second strike while swollen, or the timer running out,
    // detonates a shockwave that shoves the whole pack.
    swells: true,
    swellS: 2.6,
    burstRadius: 110,
    burstDv: 150,
    deathLeaves: 'a shockwave that shoves the pack',
    bodyColor: [0.42, 0.30, 0.14],
    bodyEmissive: [0.34, 0.20, 0.06],
  },
]);

/** The family def for an id, or null. Pure. */
export function swarmBroodFamily(id) {
  if (typeof id !== 'string') return null;
  for (const family of SWARM_BROOD_FAMILIES) if (family.id === id) return family;
  return null;
}

/** The archetypes legal at this wave, in roster order. Pure. */
export function swarmBroodRosterFor(wave) {
  const w = Math.max(1, Math.trunc(Number(wave) || 1));
  return SWARM_BROOD_FAMILIES.filter((entry) => w >= entry.fromWave);
}

/**
 * The archetype that first becomes legal on exactly this wave, or null (wave 1 is all-new).
 * The folded set is the law: the late families continue this same roster clock, so a debut
 * on the late rows earns the same first-arrival read a base family gets.
 */
export function swarmBroodNewcomerFor(wave) {
  const w = Math.max(1, Math.trunc(Number(wave) || 1));
  if (w <= 1) return null;
  return SWARM_BROOD_FAMILIES.find((entry) => entry.fromWave === w)
    || SWARM_BROOD_LATE_FAMILIES.find((entry) => entry.fromWave === w)
    || null;
}

const BROOD_FAMILY_IDS = new Set(SWARM_BROOD_FAMILIES.map((row) => row.id));

/**
 * Compose ONE wave's cohort: weighted share per unlocked family, remainder to the base fodder,
 * total exactly swarmBroodPopulation(wave). Deterministic given the rng — the caller owns the
 * stream (the engine seeds it off run seed + wave; tests pass their own).
 *
 * Returns [{ id, count }] in roster order. Never empty; always inside the cap band.
 */
export function swarmBroodPlan(wave, rng) {
  const w = Math.max(1, Math.trunc(Number(wave) || 1));
  const total = swarmBroodPopulation(w);
  // THE QUEEN'S FLOOD: her wave is nothing but mites — the spec's signature is the room
  // drowning in the base family, not a specialist mix. Still lawful: the mite unlocks at
  // wave 1 and the population law above already held the count inside the band.
  if (swarmBroodBossFor(w) === SWARM_BROOD_QUEEN_ID) {
    return [{ id: 'mite', count: total }];
  }
  const roster = swarmBroodRosterFor(w);
  const roll = typeof rng === 'function' ? rng : () => 0.5;
  // Weighted draws: each non-base family claims its weight's share of the room first; the base
  // fodder (first roster row, the mite) takes the remainder so the population law is exact.
  const base = roster[0];
  let left = total;
  const out = [];
  // Specialist families stay specialists: their whole budget is at most 40% of the room, so
  // the mite floor is at least half the room at every wave — the tier stays a swarm.
  let budget = Math.min(left - Math.ceil(total * 0.5), Math.round(total * 0.4));
  let weightSum = 0;
  for (let i = 1; i < roster.length; i++) weightSum += Math.max(0.001, roster[i].weight);
  for (let i = 1; i < roster.length && budget > 0; i++) {
    const entry = roster[i];
    const take = Math.min(budget, Math.max(4, Math.round(budget * Math.max(0.001, entry.weight) / weightSum)));
    if (take > 0) {
      out.push({ id: entry.id, count: take });
      budget -= take;
      left -= take;
    }
  }
  out.push({ id: base.id, count: left });
  return out;
}

/**
 * Catalog + law check for the whole family table, checkable without a game. Empty when honest.
 * Mirrors swarmCatalogIssues(): an authoring defect fails here, never at spawn time.
 */
export function swarmBroodIssues() {
  const issues = [];
  const seen = new Set();
  SWARM_BROOD_FAMILIES.forEach((family, i) => {
    const path = `swarmBroodFamilies[${i}]`;
    if (!family || typeof family.id !== 'string' || !family.id) {
      issues.push({ path, message: 'family has no id' });
      return;
    }
    if (seen.has(family.id)) issues.push({ path, message: `duplicate family id ${family.id}` });
    seen.add(family.id);
    if (!(family.fromWave >= 1)) issues.push({ path, message: `${family.id} has no fromWave` });
    if (!(family.weight > 0)) issues.push({ path, message: `${family.id} has no composition weight` });
    if (!(family.radius > 0) || !(family.radius < 12)) {
      issues.push({ path, message: `${family.id} radius outside the light-body band` });
    }
    if (!(family.hull > 0)) issues.push({ path, message: `${family.id} has no hull` });
    if (!(family.speed > 0)) issues.push({ path, message: `${family.id} has no speed` });
    const tele = family.telegraph;
    if (!tele || typeof tele.bark !== 'string' || typeof tele.line !== 'string' || typeof tele.cue !== 'string'
      || !tele.bark || !tele.line || !tele.cue) {
      issues.push({ path, message: `${family.id} telegraph is not {bark,line,cue}` });
    }
    if (typeof family.counter !== 'string' || family.counter.length < 10) {
      issues.push({ path, message: `${family.id} has no counter card line` });
    }
    if (!Array.isArray(family.bodyColor) || family.bodyColor.length !== 3) {
      issues.push({ path, message: `${family.id} has no body colour recipe` });
    }
    const rem = family.remains;
    if (rem != null) {
      if (typeof rem !== 'object' || typeof rem.kind !== 'string' || !rem.kind) {
        issues.push({ path, message: `${family.id} remains has no kind` });
      } else {
        if (!(rem.mass > 0) || !(rem.radius > 0)) {
          issues.push({ path, message: `${family.id} remains has no physical size` });
        }
        if (rem.splashRadius != null && !(rem.splashRadius > 0)) {
          issues.push({ path, message: `${family.id} remains splashRadius is not positive` });
        }
        if (rem.glueS != null && !(rem.glueS > 0)) {
          issues.push({ path, message: `${family.id} remains glueS is not positive` });
        }
        if (rem.whipMult != null && !(rem.whipMult > 1)) {
          issues.push({ path, message: `${family.id} remains whipMult does not widen the whip` });
        }
      }
    }
  });
  // The roster clock must be monotonic and the first family must own wave one: the Brood tier
  // arrives with the mode, exactly like the wasp does for ships.
  if (SWARM_BROOD_FAMILIES.length && SWARM_BROOD_FAMILIES[0].fromWave !== 1) {
    issues.push({ path: 'swarmBroodFamilies[0]', message: 'the base family must unlock at wave 1' });
  }
  if (!BROOD_FAMILY_IDS.has('mite')) {
    issues.push({ path: 'swarmBroodFamilies', message: 'the mite is missing — the Brood tier is not landed' });
  }
  return issues;
}

// --- Kill attribution law (the room is the player's weapon) -------------------------------
//
// A brood death is the player's kill when it came from the room under the player's influence:
// rocks (mined/terrain), thrown or swung bodies, the whip line, explosions, deployed fields.
// Brood are not entities: they pay through run:awardRequested and the chain owner, never
// entity:killed, so no other consumer can double-count them. Causes reuse the style families
// the kill words already speak (SWARM_KILL_WORDS): terrain / collision / explosive / direct.

export const SWARM_BROOD_KILL_CAUSES = Object.freeze(['terrain', 'collision', 'explosive', 'direct']);

// --- B4: THE HIVE'S RESERVE ----------------------------------------------------------
//
// The Hive's spawn sacs do not invent bodies — they hold back a share of the wave's own
// planned cohort and release it on their cadence. The population law therefore reads
// exactly the same in the Hive as anywhere else: immediate arrivals plus the sac
// reserve can never exceed swarmBroodPopulation(wave), and a sac killed early simply
// strands its share of the budget — the tide the player cut, not bodies refunded.

/** Fraction of a Hive wave's cohort the sacs hold back to birth on their own clock. */
export const SWARM_HIVE_SAC_FRACTION = 0.3;
/** Sacs birth the base fodder — the hive's tide is mites, specialists ride the gates. */
export const SWARM_HIVE_SAC_FAMILY = 'mite';
/** A hive sac's acid drip outlives a spitter splash — the room's own hazard stays longer. */
export const HIVE_POOL_TTL_S = 4;

/**
 * The bodies a Hive wave holds in reserve for its sacs. Pure: `total` is the planned
 * population (immediate + reserve together). Zero outside the Hive — every other arena
 * receives its whole cohort at the wave's open.
 */
export function swarmBroodSacReserve(total, arenaId) {
  const t = Math.max(0, Math.trunc(Number(total) || 0));
  if (arenaId !== HIVE_ARENA_ID || t <= 1) return 0;
  return Math.min(t - 1, Math.round(t * SWARM_HIVE_SAC_FRACTION));
}

/** Per-brood pay for a cause. Pure; one credit + family score, explosion kills nothing extra. */
export function swarmBroodKillPay(familyId) {
  const family = swarmBroodFamily(familyId);
  if (!family) return { credits: 0, score: 0 };
  return { credits: family.credits, score: family.score };
}

// --- Behaviour tuning shared by the engine (kept beside the families that feel them) -------

/** Flocking radii (wu). Separation is a hard push; cohesion/alignment a soft steer. */
export const BROOD_SEP_RADIUS = 7;
export const BROOD_LINK_RADIUS = 16;
/** Hard speed clamp so no impulse pile-up can fling a body faster than the swarm reads. */
export const BROOD_MAX_SPEED = 120;
/** Velocity damping per second while outside every field — the swarm settles, never drifts. */
export const BROOD_DRAG_PER_S = 0.55;
/** Contact death: a body dies when a moving solid this much heavier comes this fast. */
export const BROOD_PLOW_MIN_SPEED = 26;
export const BROOD_PLOW_MIN_MASS = 30;
/** Terrain death: a body only dies on a STILL rock when it hits it this many times faster than
 *  its family cruises — flung by a blast, a well or a charge. A body steering itself into a rock
 *  slides along it: the room kills what the player throws at it, not what wanders into it. */
export const BROOD_TERRAIN_SLAM_FACTOR = 1.5;
/** Arrival clearance (wu) between a fresh body and any rock surface. */
export const BROOD_SPAWN_ROCK_CLEARANCE = 8;
/** The whip line sweeps brood aside (and shreds when the swing is solid). */
export const BROOD_WHIP_KILL_SPEED = 60;
export const BROOD_WHIP_BAT_SPEED = 34;
/** Player ram: hull contact shreds mites — the ship is a plow too. */
export const BROOD_PLAYER_RAM_SPEED = 12;

/** Explosion receipts the engine listens to (the shared blast seams, mines/darts included). */
export const BROOD_EXPLOSION_EVENTS = Object.freeze(['charge:detonated', 'bombs:detonated', 'detonator:detonated']);

// --- B2 attack language: authored windows, all dodgeable by construction --------------------
//
// Every attack speaks BEFORE it lands (FB-016/017): the spitter paints its marker for the whole
// windup, the charger draws its line for the whole windup, and the leecher's shed verb is a
// physical move the player already owns. Windows are data, so tests pin the dodge budget.

/** Spitter: how far it lobs from, how often, and how long the marker leads the splash. */
export const BROOD_SPITTER_LOB_RANGE = 210;
export const BROOD_SPITTER_COOLDOWN_S = 3.4;
export const BROOD_SPITTER_WINDUP_S = 0.8;
export const BROOD_SPITTER_LOB_SPEED = 95;
export const BROOD_SPITTER_SPLASH_RADIUS = 26;
export const BROOD_SPITTER_SPLASH_DAMAGE = 12;
export const BROOD_SPITTER_POOL_TTL_S = 2.5;
export const BROOD_SPITTER_POOL_DPS = 7;
export const BROOD_SPITTER_POOL_RADIUS = 18;
export const BROOD_LOB_MAX = 24;
export const BROOD_POOL_MAX = 12;

/** Charger: the telegraphed committed pass. */
export const BROOD_CHARGER_WINDUP_S = 0.7;
export const BROOD_CHARGER_DASH_SPEED = 210;
export const BROOD_CHARGER_DASH_MAX_S = 1.0;
export const BROOD_CHARGER_RECOVER_S = 0.9;
export const BROOD_CHARGER_SLAM_DAMAGE = 10;
export const BROOD_CHARGER_RANGE = 260;
/** The shove a landed charger pass applies to the hull, in wu/s of Δv at the player's mass. */
export const BROOD_CHARGER_SHOVE_DV = 46;

/** Leecher: latch, brake, and the shed verb. */
export const BROOD_LEECHER_LATCH_RANGE = 11;
/** Braking acceleration applied to a latched host, wu/s². */
export const BROOD_LEECHER_BRAKE_ACCEL = 46;
/** A wall scrape at least this fast sheds every latched leecher. */
export const BROOD_SHED_SPEED = 8;

/** The damage channel brood hazards burn on (acid reads thermal in the damage model). */
export const BROOD_PLASMA_TYPE = 'thermal';

// --- B3: THE TENDRIL'S BODY ---------------------------------------------------------------
//
// The Tendril head is a real combat entity (enemies.js / the capital score) — the BODY behind
// it is this tier's own light bodies: an instanced segment chain the engine owns, follows the
// head by constraint, splits Centipede-style when a middle segment dies, and collapses when
// the head dies. The head entity is discovered by its lootTableId stamp, never by a registry
// hook — the same read-only seam the rock/mover caches already use.

/** Entity `data.lootTableId` the Tendril head carries (the enemy catalog id verbatim). */
export const TENDRIL_HEAD_LOOT_ID = 'brood_tendril';
/** Segment chain law: at most this many live chains (initial + splits), this many bodies. */
export const TENDRIL_CHAIN_MAX = 4;
export const TENDRIL_SEG_MAX = 48;
/** Segments trailing the head when the worm lands. */
export const TENDRIL_SEG_PER_WORM = 14;
/** Follow-the-leader spacing between segment centres (wu). */
export const TENDRIL_SEG_SPACING = 9;
/** Segment body. Bigger than a mite, lighter than the head — a link, not a ship. */
export const TENDRIL_SEG_RADIUS = 4.2;
export const TENDRIL_SEG_MASS = 18;
export const TENDRIL_SEG_HULL = 30;
/** Free-chain lead speed: a split body still hunts, at a fraction of the head's weave. */
export const TENDRIL_SEG_SPEED = 62;
/** The serpentine wiggle a free lead carries while it hunts (rad/s, blend fraction). */
export const TENDRIL_SEG_WIGGLE_RAD_S = 3.1;
export const TENDRIL_SEG_WIGGLE_BLEND = 0.45;
/** Hull contact with a live segment: light damage plus a shove, at most this often per chain. */
export const TENDRIL_SEG_CONTACT_DAMAGE = 8;
export const TENDRIL_SEG_CONTACT_COOLDOWN_S = 0.9;
export const TENDRIL_SEG_CONTACT_SHOVE_DV = 30;
/** Kill pay for one segment — brood fodder rates, keyed off the mite's family row. */
export const TENDRIL_SEG_PAY_FAMILY = 'mite';

// --- W-COUPLING (build_map row 503): the Bloom's pathologies, arena-side ------------------
//
// The Bloom couples nervous systems (bible 03 §1.1–1.2): linked members draw faint green
// coupling filaments, a node's death flares and snaps them, and the pack breaks like one
// animal through three authored pathologies. These constants are the engine's half of the
// shared timings in src/data/bloomLadder.js — the adventure runtime reads the same numbers
// so a mite in the Crucible and a needle pack on the tide flinch on the same clock.
//
//   * Panic cascade: a mass kill above BLOOM_PANIC_KILL_MASS inside the pack scatters it for
//     1.5–2.5 s (fixed-seed per body), then re-forms it into a tight knot — the best throw
//     of the fight.
//   * Aggression cascade: the Queen (or a relay) taking a hit turns every linked member on
//     the player at once; the filaments flush red.
//   * Grief loop: the Mother or a Hive node dying clusters linked members around the body.
//
// Each cascade REPLACES the ordinary jitter for its window — the pack reads as one
// coordinated animal, which is the row-491 legibility answer the spec demands.

/** Entity `data.lootTableId` the Brood Queen champion carries — the cascade's relay node. */
export const BROOD_QUEEN_LOOT_ID = 'brood_queen';

/**
 * Linked members within this radius draw coupling filaments (the flock's link radius). This one
 * stays arena-local on purpose: bloomLadder's BLOOM_FILAMENT_RADIUS is the tide-scale reach,
 * and the arena's tight flocks read at their own link radius.
 */
export const BROOD_FILAMENT_RADIUS = BROOD_LINK_RADIUS;
/** Filaments flare this long after a linked node dies — the pack's visible flinch. */
export const BROOD_FILAMENT_FLARE_S = BLOOM_FILAMENT_FLARE_S;
/** The flinch: a node's death pushes linked members outward this hard (wu/s of Δv). */
export const BROOD_FILAMENT_FLINCH_DV = 26;

/** A mass kill above this total mass (wu) inside the pack triggers the panic cascade. */
export const BROOD_PANIC_KILL_MASS = BLOOM_PANIC_KILL_MASS;
/** The scatter band — per-body fixed-seed, authored 1.5–2.5 s. */
export const BROOD_PANIC_SCATTER_MIN_S = BLOOM_PANIC_SCATTER_MIN_S;
export const BROOD_PANIC_SCATTER_MAX_S = BLOOM_PANIC_SCATTER_MAX_S;
/** Then the knot: members re-form tight for this long (the throw window the spec promises). */
export const BROOD_PANIC_REFORM_S = BLOOM_PANIC_REFORM_S;
/** Members inside this radius of the trigger join the pathology. */
export const BROOD_CASCADE_RADIUS = BLOOM_CASCADE_RADIUS;
/** Scatter speed: how hard the pack bolts during the panic window (wu/s² accel). */
export const BROOD_PANIC_SCATTER_ACCEL = 260;
/** Knot accel: how hard the pack converges when the knot reforms. */
export const BROOD_PANIC_REFORM_ACCEL = 220;
/** The knot's target radius around the panic centroid — tight enough to read as one ball. */
export const BROOD_PANIC_KNOT_RADIUS = 26;

/** Aggression cascade: the relay/Queen hit turns linked members on the player this long. */
export const BROOD_AGGRESSION_S = BLOOM_AGGRESSION_S;
/** Rush speed multiplier over family cruise during the aggression window. */
export const BROOD_AGGRESSION_ACCEL = 300;

/** Grief loop: cluster around the corpse for this long. */
export const BROOD_GRIEF_S = BLOOM_GRIEF_S;
/** The mourning ring the members orbit/crowd around the corpse. */
export const BROOD_GRIEF_RING = BLOOM_GRIEF_RING;
export const BROOD_GRIEF_ACCEL = 140;

/** Cascade kinds (published on the view; the renderer flushes the filaments on them). */
export const BROOD_CASCADE_NONE = 0;
export const BROOD_CASCADE_PANIC = 1;
export const BROOD_CASCADE_AGGRESSION = 2;
export const BROOD_CASCADE_GRIEF = 3;

/** Events the arena wires to the engine's cascade seams (queen hits, node deaths). */
export const BROOD_CASCADE_EVENTS = Object.freeze(['entity:killed', 'swarm:hiveSacKilled']);

// --- W-PATHOLOGY pain loop (row 504): a cut long body thrashes a fixed arc ---------------
//
// Killing a middle Tendril link frees the chain behind it; the freed lead is the stump and
// its first act is the pain loop — a fixed arc around the cut point (constant angular
// speed, constant radius, duration below), readable as the body flailing before it hunts.
// The thrash is a hazard: it sweeps pack bodies it touches, so the player can aim the
// stump into the swarm — the opening the spec sells.

/** Thrash duration after a cut frees a chain lead (fixed-seed jitter, ±20%). */
export const TENDRIL_THRASH_S = BLOOM_THRASH_S;
/** The arc's radius around the cut point (wu). */
export const TENDRIL_THRASH_RADIUS = BLOOM_THRASH_RADIUS;
/** Fixed angular speed of the arc (rad/s), seeded direction per segment. */
export const TENDRIL_THRASH_OMEGA = 4.2;
/** A thrashing stump sweeps pack bodies in its path — kills them on contact. */
export const TENDRIL_THRASH_SWEEP = BLOOM_THRASH_SWEEP;

// --- W-BLOOM-LOW family tuning (row 507), kept beside the families that feel them ---------

/** Lantern cyst: prime range/seconds, burst radius and shove (the spore burst). */
export const BROOD_CYST_PRIME_DAMAGE = 8;
export const BROOD_CYST_BURST_DAMAGE = 16;

/** Glassback: the shatter — glass shards splash this far and this hard on its death. */
export const BROOD_GLASS_SHARD_DAMAGE = 14;

/** Spore drift: the sticky cloud's brake on a slow hull inside its reach. */
export const BROOD_SPORE_SLOW_BUDGET_MULT = 1.0;

/** Bellows: the swell's burst damages the hull it lands on, not just shoves it. */
export const BROOD_BELLOWS_BURST_DAMAGE = 18;

/** The state subtree the engine publishes its live buffers under (never saved, never snapshotted). */
export const SWARM_BROOD_STATE_KEY = 'swarmBrood';
