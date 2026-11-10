// build_map.md §33 row 485 — "Arenas that scale with you": the four-tier swarm arena ladder.
//
// The swarm debris field today is one size band (16–44 wu monoliths) no matter the wave or the
// Line rating, so a wave-1 pilot with an empty line faces a room of rocks that are ALL above the
// pebble class — the toy (mass is ammunition) is invisible exactly when it must be unmissable,
// and a wave-10 pilot hauling 180 t still sees the same room. This ladder climbs the room with
// the run so the screen always holds something you can *just barely* move:
//
//   pebble field → boulder belt → giant-rock graveyard → derelict-station yard
//
// NOTHING HERE COMMISSIONS NEW ART. Every tier dresses from assets that already exist: the six
// census `ast_*` rock types, the 24 ROCK_BODIES substance bodies, the wreck-aftermath family
// shed (37 source + 8 authored-down), and the census place props. The test
// (test/zc-a34-arena-ladder.test.mjs) refuses any id that is not in the model-truth census.
//
// NOT swarmLadder.js — that file owns the curated zone/seed/checkpoint ladder (The Pack, The
// Wing, …). This file owns the arena COMPOSITION scale axis. The two compose: whichever circuit
// arena the run launched in keeps its law (banks, wells, current, freeze, conduct); this ladder
// decides what MASS CLASSES the room holds as the waves and the Line rating climb.
//
// HOW IT BINDS (the CULL_ARENA_LADDER precedent, survivalArenas.js): the live selection seam is
// arenaId-keyed inside registered owners (src/systems/swarmArena.js reads
// debrisLayoutForArena(run.arenaId)), so this ladder is self-gating pure data the owners can
// read without a new event: each tier carries its own wave band (`waveMin`) and Line-rating gate
// (`lineRatingMinT`), and `swarmArenaTierForRun({ wave, ratingT })` resolves the tier from the
// run's wave and state.rockCore.ratingT. `swarmArenaDebrisLayout(tier)` returns a record in the
// exact shape planSwarmDebris already reads ({ id, inner, outer, target, safeRadius, separation
// }) plus the tier's body size band — one consumer hunk on the owner's existing call, no fork.
//
// Mass classes come from the landed Line ladder (src/data/lineRating.js): pebble ≤ 9 wu is
// always throwable (T0), boulder ≤ 18 (T1, 25 t), monolith ≤ 30 (T2, 80 t), wreck chunk ≤ 45
// (T3, 180 t). The rating gates below are the same thresholds lineTierForRating reads, so the
// room and the Line agree on what "just barely movable" means. Body classes are radius-gated
// (lineThrowTierForBody), which keeps the ladder honest whichever tonnage stamp a body carries.
//
// Camera: each tier carries `cameraOpenBias` = lineCameraOpen(tier) from the landed per-tier
// table — rockCore already publishes it as state.rockCore.cameraZoomFloor and the chase
// composition floor widens with it (row 485 seam). Reused, not re-authored: one designer.

import {
  LINE_THROW_CLASSES,
  LINE_THROW_RADIUS_MAX,
  lineArenaScale,
  lineCameraOpen,
  lineTierForRating,
} from './lineRating.js';

export const SWARM_ARENA_LADDER_SCHEMA = 1;

/**
 * Short fly time for the wave-1 pocket: 300 wu is ~2 s at the stock cruise speed
 * (150 wu/s, propulsionCatalog drive_gravimetric_m) and inside the standard
 * massline's 390 wu reach — a pebble in the pocket is latchable without flying to it.
 */
export const OPENING_POCKET_FLY_WU = 300;
/** Stock cruise the fly-time figure is measured against (propulsionCatalog mid drive). */
export const OPENING_POCKET_CRUISE_WU_S = 150;
/**
 * The authored opening spots, in the spawn-local frame (bearing 0 = spawn heading).
 * Fixed, not rolled — the same five spots for every run, like the circuit node spots:
 * a stranger's first throwable must not be a dice roll. Three sit inside ~185 wu
 * (unmissable), two more at the pocket edge. The tier's first wave places them as
 * cap-class bodies (planOpeningThrowables).
 */
export const OPENING_THROWABLE_SPOTS = Object.freeze([
  Object.freeze({ bearingRad: 0.0, radiusWu: 120 }),
  Object.freeze({ bearingRad: 2.2, radiusWu: 150 }),
  Object.freeze({ bearingRad: 4.3, radiusWu: 185 }),
  Object.freeze({ bearingRad: 1.1, radiusWu: 240 }),
  Object.freeze({ bearingRad: 3.3, radiusWu: OPENING_POCKET_FLY_WU }),
]);
/** How many of the authored spots must survive placement for the guarantee to hold. */
export const OPENING_THROWABLE_MIN = 3;
/** Separation the opening placement keeps from other solid bodies (wu, surface gap). */
export const OPENING_THROWABLE_SEPARATION_WU = 18;
/** Deterministic nudge step when an authored spot lands on an existing body (wu outward). */
export const OPENING_THROWABLE_NUDGE_WU = 14;
/** Nudge attempts before the spot is skipped (the ≥3 margin absorbs two skips). */
export const OPENING_THROWABLE_NUDGE_TRIES = 8;

/**
 * The four tiers. `waveMin` is the wave band floor (the tier holds until the next rung's
 * waveMin); `lineRatingMinT` is the Line-rating gate in tonnes on the Line (state.rockCore.
 * ratingT). Selection takes the deepest tier EITHER axis unlocks, so a heavy line opens the
 * room early and the wave band guarantees the climb for lighter lines. `compositionClasses`
 * is cumulative on purpose: every tier keeps the classes below its cap, so whatever the
 * player's rating, the field still holds their just-barely-movable class.
 */
export const SWARM_ARENA_LADDER = Object.freeze([
  Object.freeze({
    step: 1,
    id: 'pebble_field',
    name: 'Pebble Field',
    waveMin: 1,
    lineRatingMinT: 0,
    ratingTierMin: 0,
    capClass: 'pebble',
    compositionClasses: Object.freeze(['pebble']),
    newlyMovableVisibleMin: 3,
    // The whole tier-1 band is the readable pocket: every rock ≤ 300 wu from the pilot.
    debris: Object.freeze({
      id: 'pebble_field',
      inner: 96,
      outer: 300,
      target: 14,
      safeRadius: 90,
      separation: 26,
      sizeMinWu: 5,
      sizeMaxWu: LINE_THROW_RADIUS_MAX[0],
    }),
    rockTypeIds: Object.freeze(['ast_common_rock', 'ast_icy', 'ast_metallic']),
    bodyIds: Object.freeze([
      'rock_silicate_pebble', 'rock_ice_pebble', 'rock_metallic_ore_pebble', 'rock_junk_pebble',
    ]),
    placeIds: Object.freeze(['place_asteroid_rock_a', 'place_asteroid_rock_b', 'place_asteroid_rock_c']),
    note: 'First room. Pebbles are always throwable at T0 — the first throw is nearly unavoidable.',
  }),
  Object.freeze({
    step: 2,
    id: 'boulder_belt',
    name: 'Boulder Belt',
    waveMin: 4,
    lineRatingMinT: 25,
    ratingTierMin: 1,
    capClass: 'boulder',
    compositionClasses: Object.freeze(['pebble', 'boulder']),
    newlyMovableVisibleMin: 3,
    debris: Object.freeze({
      id: 'boulder_belt',
      inner: 115,
      outer: 391,
      target: 16,
      safeRadius: 105,
      separation: 32,
      sizeMinWu: 5,
      sizeMaxWu: LINE_THROW_RADIUS_MAX[1],
    }),
    rockTypeIds: Object.freeze(['ast_common_rock', 'ast_metallic', 'ast_crystalline']),
    bodyIds: Object.freeze([
      'rock_silicate_boulder', 'rock_metallic_ore_boulder', 'rock_crystal_boulder', 'rock_junk_boulder',
    ]),
    placeIds: Object.freeze([
      'place_asteroid_rock_a', 'place_asteroid_rock_b', 'place_asteroid_rock_c', 'place_asteroid_graffiti',
    ]),
    note: 'Boulders light up with the 25 t line — the pebbles stay, the belt is what you can just move.',
  }),
  Object.freeze({
    step: 3,
    id: 'rock_graveyard',
    name: 'Giant-Rock Graveyard',
    waveMin: 7,
    lineRatingMinT: 80,
    ratingTierMin: 2,
    capClass: 'monolith',
    compositionClasses: Object.freeze(['pebble', 'boulder', 'monolith']),
    newlyMovableVisibleMin: 3,
    debris: Object.freeze({
      id: 'rock_graveyard',
      inner: 138,
      outer: 459,
      target: 18,
      safeRadius: 120,
      separation: 40,
      sizeMinWu: 5,
      sizeMaxWu: LINE_THROW_RADIUS_MAX[2],
    }),
    rockTypeIds: Object.freeze(['ast_rare_exotic', 'ast_crystalline', 'ast_gas_cloud', 'ast_common_rock']),
    bodyIds: Object.freeze([
      'rock_silicate_monolith', 'rock_metallic_ore_monolith', 'rock_crystal_monolith', 'rock_reef_metal_monolith',
    ]),
    placeIds: Object.freeze(['place_asteroid_seamed', 'place_ceres_grave_shard', 'place_asteroid_graffiti']),
    note: 'Monoliths stand like grave markers — 80 t on the line swings one, and one is a wall.',
  }),
  Object.freeze({
    step: 4,
    id: 'derelict_yard',
    name: 'Derelict-Station Yard',
    waveMin: 10,
    lineRatingMinT: 180,
    ratingTierMin: 3,
    capClass: 'wreck',
    compositionClasses: Object.freeze(['pebble', 'boulder', 'monolith', 'wreck']),
    newlyMovableVisibleMin: 3,
    // The wave-10 boss fight lands here on purpose: the thrown-mass boss kills
    // (physicsBossWaves, waves 10/20/30) need hulls lying around to throw.
    debris: Object.freeze({
      id: 'derelict_yard',
      inner: 160,
      outer: 544,
      target: 20,
      safeRadius: 132,
      separation: 46,
      sizeMinWu: 5,
      sizeMaxWu: LINE_THROW_RADIUS_MAX[3],
    }),
    rockTypeIds: Object.freeze(['ast_common_rock', 'ast_metallic']),
    bodyIds: Object.freeze([]),
    // The yard's movable composition is the wreck-aftermath shed (fragment/debris/component
    // chunks, radius 5–45); the hero hulls are its skyline dressing.
    wreckStems: Object.freeze([
      'frag_plate_curl', 'frag_strut_shard', 'deb_corvette_barbette_ring',
      'deb_ore_freighter_drive_bell', 'aft_cockpit_section', 'aft_pressure_tank',
    ]),
    placeIds: Object.freeze([
      'place_aftermath_wreck_corvette_forward',
      'place_aftermath_wreck_liner_drum__derelict',
      'place_aftermath_wreck_ore_freighter_bow__derelict',
      'place_dead_hulk',
    ]),
    note: 'Dead stations and whole hulls — the 180 t line drags a wreck chunk, and the yard is ammunition.',
  }),
]);

const LADDER_BY_ID = new Map(SWARM_ARENA_LADDER.map((tier) => [tier.id, tier]));

/** Ladder tier by id, or null for an unknown id. */
export function swarmArenaTierById(id) {
  return typeof id === 'string' ? LADDER_BY_ID.get(id) || null : null;
}

/** Ladder tier by 1-based step (clamped), or null for an out-of-range input. */
export function swarmArenaTierByStep(step) {
  const s = step | 0;
  return s >= 1 && s <= SWARM_ARENA_LADDER.length ? SWARM_ARENA_LADDER[s - 1] : null;
}

/** The deepest tier whose wave band the wave has reached (wave < 1 clamps to tier 1). */
export function swarmArenaTierByWave(wave) {
  const w = Number.isFinite(wave) ? wave : 1;
  let best = SWARM_ARENA_LADDER[0];
  for (const tier of SWARM_ARENA_LADDER) {
    if (w >= tier.waveMin) best = tier;
  }
  return best;
}

/** The deepest tier the Line rating unlocks (rating in tonnes; negative clamps to tier 1). */
export function swarmArenaTierByRating(ratingT) {
  const t = Number.isFinite(ratingT) ? ratingT : 0;
  let best = SWARM_ARENA_LADDER[0];
  for (const tier of SWARM_ARENA_LADDER) {
    if (t >= tier.lineRatingMinT) best = tier;
  }
  return best;
}

/**
 * The tier a live run plays in: the deepest rung EITHER the wave band or the Line rating
 * unlocks (monotone in both arguments). The composition is cumulative, so when the wave band
 * outruns a light line the field still holds the pilot's just-bearable class.
 */
export function swarmArenaTierForRun({ wave = 1, ratingT = 0 } = {}) {
  const byWave = swarmArenaTierByWave(wave);
  const byRating = swarmArenaTierByRating(ratingT);
  return byWave.step >= byRating.step ? byWave : byRating;
}

/** The tier's debris-field layout record — the shape planSwarmDebris reads, plus the size band. */
export function swarmArenaDebrisLayout(tier) {
  const record = typeof tier === 'string' ? swarmArenaTierById(tier) : tier;
  return record && record.debris ? record.debris : null;
}

/** Every census id the tier references (rock types + place props), for reachability checks. */
export function swarmArenaTierCensusIds(tier) {
  const record = typeof tier === 'string' ? swarmArenaTierById(tier) : tier;
  if (!record) return [];
  return [...record.rockTypeIds, ...record.placeIds];
}

/**
 * The tier's Line-ladder facts, derived — never re-authored: the cap class radius ceiling and
 * the camera-open bias come from the landed lineRating tables so the room and the Line agree.
 */
export function swarmArenaTierRatingFacts(tier) {
  const record = typeof tier === 'string' ? swarmArenaTierById(tier) : tier;
  if (!record) return null;
  const t = record.ratingTierMin;
  return Object.freeze({
    tier: t,
    capClass: LINE_THROW_CLASSES[t],
    capRadiusWu: LINE_THROW_RADIUS_MAX[t],
    arenaRadiusScale: lineArenaScale(t),
    cameraOpenBias: lineCameraOpen(t),
  });
}

/**
 * The opening throwable pocket for a tier's first wave: the five authored spots mapped through
 * the spawn heading onto cap-class bodies, nudged outward off any existing solid. Pure — the
 * same inputs always place the same rocks (no rng, no wall clock). Returns
 * [{ x, z, radiusWu, sizeClass, tierId }] in the world frame.
 */
export function planOpeningThrowables({ anchor = { x: 0, z: 0 }, headingRad = 0, tier = null, existing = [] } = {}) {
  const record = typeof tier === 'string' ? swarmArenaTierById(tier) : tier;
  if (!record) return [];
  const facts = swarmArenaTierRatingFacts(record);
  const ax = Number.isFinite(anchor.x) ? anchor.x : 0;
  const az = Number.isFinite(anchor.z) ? anchor.z : 0;
  const h = Number.isFinite(headingRad) ? headingRad : 0;
  const solids = (Array.isArray(existing) ? existing : [])
    .filter((e) => e && Number.isFinite(e.x) && Number.isFinite(e.z))
    .map((e) => ({ x: e.x, z: e.z, radius: Number.isFinite(e.radius) ? e.radius : 0 }));
  const out = [];
  for (const spot of OPENING_THROWABLE_SPOTS) {
    const angle = h + spot.bearingRad;
    let radiusWu = Math.max(record.debris.safeRadius, spot.radiusWu);
    let placed = null;
    for (let attempt = 0; attempt <= OPENING_THROWABLE_NUDGE_TRIES; attempt++) {
      const x = ax + Math.cos(angle) * radiusWu;
      const z = az + Math.sin(angle) * radiusWu;
      const blocked = solids.some((s) => {
        const dx = x - s.x;
        const dz = z - s.z;
        const gap = facts.capRadiusWu + s.radius + OPENING_THROWABLE_SEPARATION_WU;
        return dx * dx + dz * dz < gap * gap;
      });
      // A nudge must not walk the rock out of the pocket — the guarantee is a radius promise.
      if (!blocked && radiusWu <= OPENING_POCKET_FLY_WU + 1e-9) {
        placed = { x, z };
        break;
      }
      radiusWu += OPENING_THROWABLE_NUDGE_WU;
      if (radiusWu > OPENING_POCKET_FLY_WU) break;
    }
    if (!placed) continue;
    out.push(Object.freeze({
      x: placed.x,
      z: placed.z,
      radiusWu: facts.capRadiusWu,
      sizeClass: record.capClass,
      tierId: record.id,
    }));
  }
  return out;
}

/**
 * Ladder sanity against an id universe. `censusIds` is a Set of model-truth census row ids;
 * `rockBodyIds` (optional) a Set of ROCK_BODIES ids; `wreckModelIds` (optional) a Set of
 * wreck-aftermath model ids. Every tier must reference only existing assets — no commissions —
 * with ordered steps, non-regressing wave/rating gates, cumulative composition, a size band
 * that ends on the cap class radius, and a target that can hold the newly-movable minimum.
 */
export function validateSwarmArenaLadder(censusIds, { rockBodyIds = null, wreckModelIds = null } = {}) {
  const issues = [];
  const census = censusIds instanceof Set ? censusIds : new Set(Array.isArray(censusIds) ? censusIds : []);
  const rockBodies = rockBodyIds instanceof Set ? rockBodyIds
    : new Set(Array.isArray(rockBodyIds) ? rockBodyIds : []);
  const wreckModels = wreckModelIds instanceof Set ? wreckModelIds
    : new Set(Array.isArray(wreckModelIds) ? wreckModelIds : []);
  if (SWARM_ARENA_LADDER.length !== 4) {
    issues.push({ path: 'ladder', rule: 'tiers', message: 'the ladder has four tiers' });
  }
  let prevStep = 0;
  let prevWaveMin = -Infinity;
  let prevRatingMin = -Infinity;
  for (const tier of SWARM_ARENA_LADDER) {
    const at = `${tier.id}`;
    if (tier.step !== prevStep + 1) {
      issues.push({ path: at, rule: 'step', message: `step ${tier.step} is not ${prevStep + 1}` });
    }
    prevStep = tier.step;
    if (tier.waveMin < prevWaveMin) {
      issues.push({ path: `${at}.waveMin`, rule: 'band', message: 'wave band regressed' });
    }
    prevWaveMin = tier.waveMin;
    if (tier.lineRatingMinT < prevRatingMin) {
      issues.push({ path: `${at}.lineRatingMinT`, rule: 'gate', message: 'rating gate regressed' });
    }
    prevRatingMin = tier.lineRatingMinT;
    const facts = swarmArenaTierRatingFacts(tier);
    if (tier.ratingTierMin !== facts.tier) {
      issues.push({ path: `${at}.ratingTierMin`, rule: 'gate', message: 'rating tier must match the landed ladder' });
    }
    if (tier.capClass !== facts.capClass) {
      issues.push({ path: `${at}.capClass`, rule: 'class', message: `cap class must be ${facts.capClass}` });
    }
    if (tier.debris.sizeMaxWu !== facts.capRadiusWu) {
      issues.push({
        path: `${at}.debris.sizeMaxWu`,
        rule: 'band',
        message: `size band must end on the cap class radius ${facts.capRadiusWu}`,
      });
    }
    if (!(tier.debris.sizeMinWu > 0 && tier.debris.sizeMinWu < tier.debris.sizeMaxWu)) {
      issues.push({ path: `${at}.debris.sizeMinWu`, rule: 'band', message: 'size band must be positive and open' });
    }
    if (tier.debris.target < tier.newlyMovableVisibleMin) {
      issues.push({
        path: `${at}.debris.target`,
        rule: 'target',
        message: 'target cannot hold the newly-movable minimum',
      });
    }
    if (tier.compositionClasses[tier.compositionClasses.length - 1] !== tier.capClass
      || tier.compositionClasses.length !== tier.ratingTierMin + 1) {
      issues.push({
        path: `${at}.compositionClasses`,
        rule: 'composition',
        message: 'composition must be cumulative and end on the cap class',
      });
    }
    if (tier.newlyMovableVisibleMin < 3) {
      issues.push({ path: `${at}.newlyMovableVisibleMin`, rule: 'visible', message: 'each step keeps ≥3 newly-movable throwables visible' });
    }
    for (const id of tier.rockTypeIds) {
      if (!census.has(id)) issues.push({ path: `${at}.rockTypeIds`, rule: 'census', message: `${id} is not in the model census` });
    }
    for (const id of tier.placeIds) {
      if (!census.has(id)) issues.push({ path: `${at}.placeIds`, rule: 'census', message: `${id} is not in the model census` });
    }
    if (rockBodies.size) {
      for (const id of tier.bodyIds) {
        if (!rockBodies.has(id)) issues.push({ path: `${at}.bodyIds`, rule: 'bodies', message: `${id} is not a ROCK_BODIES id` });
      }
    }
    if (wreckModels.size) {
      for (const stem of tier.wreckStems || []) {
        if (!wreckModels.has(`place_aftermath_${stem}`)) {
          issues.push({ path: `${at}.wreckStems`, rule: 'wrecks', message: `${stem} is not a wreck-aftermath body` });
        }
      }
    }
  }
  // Gating sanity: selection is monotone in both axes and the run selector agrees with both.
  for (const wave of [1, 3, 4, 6, 7, 9, 10, 12, 25, 60]) {
    if (swarmArenaTierByWave(wave).step < swarmArenaTierByWave(wave - 1).step) {
      issues.push({ path: 'swarmArenaTierByWave', rule: 'monotone', message: `wave ${wave} regressed the ladder` });
    }
  }
  for (const rating of [0, 24.9, 25, 79.9, 80, 179.9, 180, 2000, 50000]) {
    if (swarmArenaTierByRating(rating).step < swarmArenaTierByRating(rating - 1).step) {
      issues.push({ path: 'swarmArenaTierByRating', rule: 'monotone', message: `rating ${rating} regressed the ladder` });
    }
  }
  return { ok: issues.length === 0, issues };
}
