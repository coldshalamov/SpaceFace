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

export const SWARM_BROOD_SCHEMA_VERSION = 1;

/** Population law. Every active population holds inside this band — the cap never moves. */
export const SWARM_BROOD_MIN = 100;
export const SWARM_BROOD_MAX = 400;
/** Wave the population ceiling is reached at (then it stays there). */
export const SWARM_BROOD_FULL_WAVE = 21;
/** Boss waves field this fraction of the wave's population — the champion stays legible. */
export const SWARM_BROOD_BOSS_FRACTION = 0.4;

/**
 * The population this wave fields. 100 at wave one, the 400 ceiling by SWARM_BROOD_FULL_WAVE,
 * boss waves pulled down toward the minimum but never under it. Pure; the engine and the tests
 * both read this — there is no second population formula anywhere.
 */
export function swarmBroodPopulation(wave) {
  const w = Math.max(1, Math.trunc(Number(wave) || 1));
  const raw = SWARM_BROOD_MIN + Math.round((w - 1) * ((SWARM_BROOD_MAX - SWARM_BROOD_MIN) / (SWARM_BROOD_FULL_WAVE - 1)));
  const target = Math.min(SWARM_BROOD_MAX, Math.max(SWARM_BROOD_MIN, raw));
  return target;
}

/**
 * The roster clock — one new silhouette at a time, the FB-023 pattern. B1 lands the Mite (the
 * whole tier arrives with the mode); B2 adds the family attack language behind the same clock.
 * `weight` is a composition share once unlocked; role names the problem the family poses.
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
  const roster = swarmBroodRosterFor(w);
  const roll = typeof rng === 'function' ? rng : () => 0.5;
  // Weighted draws: each non-base family claims its weight's share of the room first; the base
  // fodder (first roster row, the mite) takes the remainder so the population law is exact.
  const base = roster[0];
  let left = total;
  const out = [];
  let weightSum = 0;
  for (let i = 1; i < roster.length; i++) weightSum += Math.max(0.001, roster[i].weight);
  for (let i = roster.length - 1; i >= 1; i--) {
    const entry = roster[i];
    const share = Math.max(0.001, entry.weight) / Math.max(weightSum, 1);
    // Specialist families stay specialists: a readable pack, never half the room.
    const count = Math.min(left, Math.max(4, Math.round(total * share)));
    if (count > 0) {
      out.push({ id: entry.id, count });
      left -= count;
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

/** The state subtree the engine publishes its live buffers under (never saved, never snapshotted). */
export const SWARM_BROOD_STATE_KEY = 'swarmBrood';
