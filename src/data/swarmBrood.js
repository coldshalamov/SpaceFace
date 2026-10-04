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
    bodyColor: [0.18, 0.46, 0.22],
    bodyEmissive: [0.10, 0.34, 0.10],
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
    bodyColor: [0.50, 0.16, 0.16],
    bodyEmissive: [0.40, 0.06, 0.04],
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
    bodyColor: [0.36, 0.20, 0.52],
    bodyEmissive: [0.22, 0.10, 0.38],
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

/** The archetype that first becomes legal on exactly this wave, or null (wave 1 is all-new). */
export function swarmBroodNewcomerFor(wave) {
  const w = Math.max(1, Math.trunc(Number(wave) || 1));
  if (w <= 1) return null;
  return SWARM_BROOD_FAMILIES.find((entry) => entry.fromWave === w) || null;
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

/** The state subtree the engine publishes its live buffers under (never saved, never snapshotted). */
export const SWARM_BROOD_STATE_KEY = 'swarmBrood';
