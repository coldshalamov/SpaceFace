// PR95 Wave 1 — THE SWARMER FAMILY grammar (design/arcade-core/12_SWARMER_FAMILY.md).
//
// One grammar, six entries. This file is the single place that answers, for every light-class
// hostile, the six questions 11_ENEMY_ARCHITECTURE demands of a shipped enemy:
//
//   mass → group → capability (what it does to your physics) → counter verb (what your physics
//   does to it) → tell (silhouette + motion + sound) → loot read.
//
// It is NOT a second stat table. Gameplay numbers stay in `src/data/enemies.js` (which is
// import-free by contract); this module imports THAT and binds the design record to it, so a
// grammar row that names a hull the catalog does not ship fails `validateSwarmerFamily()` instead
// of quietly describing nothing. This is the shared contract for the upcoming behavior,
// presentation, and encounter packets; it does not claim those consumers already exist.
//
// Bans this grammar enforces by construction (12_SWARMER_FAMILY "Bans"):
//   • mass ≤ SWARMER_MASS_CEILING — no light ship that "acts heavy".
//   • every entry owns a DISTINCT silhouette id — no recolor shipped as new content.
//   • every entry declares one capability that is not "shoots at you", one counter verb, and a
//     tell with all three channels filled.
//   • difficulty is composition, never level stat inflation: nothing here scales with level.

import { ENEMY_TYPES } from './enemies.js';

/** 11_ENEMY_ARCHITECTURE mass ladder: light / swarm is the ≤ 20 band. */
export const SWARMER_MASS_CEILING = 20;

/**
 * The kernel's readable-tumble threshold is 18 wu/s (src/combat/impulseKernel.js
 * COLLISION_CONSEQUENCE_LIMITS.tumbleDeltaV). The family rule is that ONE center-mass concussion
 * hit must cross it. The reference source is the Concussion Cannon M (impulsePerHit 420), so the
 * heaviest admissible swarmer is 420 / 18 = 23.3 — every entry below sits under that with margin
 * (Ember, the heaviest at 15, takes 28 wu/s). This constant exists so the invariant is checkable
 * rather than asserted in a comment.
 */
export const SWARMER_REFERENCE_CONCUSSION_IMPULSE = 420;
export const SWARMER_TUMBLE_DELTA_V = 18;

/**
 * Capability vocabulary. A capability is a verb the entry performs ON the player's physics — not a
 * stat. Every swarmer must own at least one that is not `pack_strafe` (bare shooting), because an
 * enemy that is only a gun with HP is a defect (11_ENEMY_ARCHITECTURE).
 */
export const SWARMER_CAPABILITY = Object.freeze({
  /** Straight-line high-velocity passes. Never orbits; turns badly on purpose. */
  SPEED_PASS: 'speed_pass',
  /** Classic strafe/regroup swarm behaviour (the Wasp baseline). */
  PACK_STRAFE: 'pack_strafe',
  /** Screen-fill count: individually near-harmless, exists to be vacuumed/bowled/clumped. */
  SCREEN_FILL: 'screen_fill',
  /** A weak hull-anchored drag field with a visible wind-up, then a real disengage. */
  ANCHOR_SNARE_LIGHT: 'anchor_snare_light',
  /** Hugs terrain, opens from behind a rock, re-hides between passes. */
  TERRAIN_AMBUSH: 'terrain_ambush',
  /** Death is a bounded radial impulse on nearby bodies — a free physics event. */
  REACTOR_COOK_OFF: 'reactor_cook_off',
});

const CAPABILITY_IDS = Object.freeze(Object.values(SWARMER_CAPABILITY));

/** Capabilities that are only "it shoots"; an entry may not be defined by these alone. */
const PASSIVE_CAPABILITIES = Object.freeze([SWARMER_CAPABILITY.PACK_STRAFE]);

/**
 * Counter verbs. Each is a PHYSICAL verb the player already owns — no entry introduces a new
 * player tool, and none is answered by "shoot it more".
 */
export const SWARMER_COUNTER_VERB = Object.freeze({
  /** Stop leading it and cut across the pass line — the Dart cannot re-aim mid-run. */
  CROSS_THE_LANE: 'cross_the_lane',
  /** Clump the pack with a Well / plow it with the Cone, then collect. */
  FIELD_CLUMP: 'field_clump',
  /** Shove the snare's SOURCE hull away; the field is anchored to it and travels with it. */
  DISPLACE_THE_ANCHOR: 'displace_the_anchor',
  /** Take the rock away — break, tether or shove the cover it is hiding behind. */
  STRIP_THE_COVER: 'strip_the_cover',
  /** Choose where it dies: park it next to what you want moved, then pop it. */
  AIM_THE_BLAST: 'aim_the_blast',
});

const COUNTER_VERB_IDS = Object.freeze(Object.values(SWARMER_COUNTER_VERB));

// ── Ember: the death physics event ─────────────────────────────────────────────────────────────
//
// Bounded and honest. The impulse is a straight radial kick with linear falloff, applied through
// the same physics-authority port the Vector Mine uses, so an Ember-thrown body that then meets
// terrain is attributed and receipted by the EXISTING collision-consequence path — that is what
// makes it real chain bait rather than a decorative shockwave.
//
// Ladder check at the centre (impulse / mass, versus tumbleDeltaV 18 and staggerDeltaV 3):
//   Dart 10 → 34 (tumbles) · Wasp 16 → 21 (tumbles) · Ember 15 → 22 (tumbles)
//   Reaver 60 → 5.7 (staggers, does not tumble) · Bruiser 70 → 4.9 (staggers)
//   heavy 150 → 2.3 (shrugs entirely)
// Light bodies are thrown, mediums are nudged, heavies are unmoved. Zero damage: the Ember does
// not add DPS to the light tier, it adds a place to stand.
export const EMBER_COOK_OFF = Object.freeze({
  /** Blast radius in world units. Deliberately shorter than the Vector Mine's 150. */
  radiusWu: 130,
  /** Peak impulse at the centre; scales down linearly to zero at the rim. */
  impulse: 340,
  /** Hard bound on bodies moved by one cook-off, for a bounded per-death cost. */
  maxAffected: 12,
  /** Provenance tag: distinct from vector_mine_pulse so receipts never collapse together. */
  provenance: 'ember_cook_off',
  /** Zero. The Ember's threat is geometry, never damage (12_SWARMER_FAMILY bans). */
  hullDamage: 0,
});

// ── Skitter: deterministic rock placement + fair reveal ────────────────────────────────────────
//
// "Deterministic" means: same seed + same rocks → same nest, with no RNG draw and no wall clock.
// Candidate rocks are chosen by a stable id sort, the hiding offset is a hash of (squadId, rock
// id), and the nest is rebuilt identically on save-reload.
//
// "Fair" means the player can see the trap before it costs anything: the pack spawns PASSIVE, a
// dust-kick cue fires at each occupied rock at spawn time, and the spring needs the player to come
// inside AMBUSH_SPRING_R of their own accord. Shooting the nest springs it early — the reveal is
// never a gotcha the player could not have read.
export const SKITTER_ROCK_NEST = Object.freeze({
  /** Only rocks at least this big can hide a Skitter — no "hidden" behind a pebble. */
  minRockRadiusWu: 18,
  /** Rocks further than this from the encounter anchor are not part of the nest. */
  searchRadiusWu: 900,
  /** How far off the rock's far side the hull sits: readable as *behind cover*, not *inside*. */
  standoffPadWu: 14,
  /** Bounded scan + bounded nest: a pack never sweeps the whole sector's rock list. */
  maxCandidateRocks: 24,
  /** Audible + visible pre-reveal fired once per occupied rock at spawn. */
  revealCueId: 'swarmer_rock_dust',
});

/**
 * The family table. Row order is the mass ladder, low to high.
 *
 * `enemyId`     — must exist in ENEMY_TYPES; validate() binds and cross-checks it.
 * `capabilities`— from SWARMER_CAPABILITY.
 * `counterVerb` — from SWARMER_COUNTER_VERB; the ONE physical answer the entry is built around.
 * `tell`        — all three readable channels. `silhouette` must be unique across the family and
 *                 must be a hard-geometry builder id in visualFactory's ENEMY_FAMILY_BUILDERS.
 * `audio`       — real recipe ids from src/data/audioRecipes.js, resolved through
 *                 AUDIO_CUE_TO_RECIPE. `signatureRecipeId` is the sound of the entry's own verb.
 * `lootRead`    — the one-glance story of what falls out, matched to the enemies.js loot block.
 */
export const SWARMER_FAMILY = Object.freeze([
  Object.freeze({
    key: 'mote',
    enemyId: 'mote_swarmer',
    mass: 6,
    group: Object.freeze([8, 14]),
    capabilities: Object.freeze([SWARMER_CAPABILITY.SCREEN_FILL]),
    counterVerb: SWARMER_COUNTER_VERB.FIELD_CLUMP,
    tell: Object.freeze({
      silhouette: 'mote_quad',
      motion: 'loose cloud, bodies crossing and banking out of phase with each other',
      sound: 'no telegraph of its own — the pack is the sound',
    }),
    audio: Object.freeze({
      telegraphCue: 'engine_flare',
      doctrineRecipeId: 'sfx_doctrine_flyby',
      signatureRecipeId: 'sfx_doctrine_flyby',
    }),
    lootRead: 'one pickup each — a cloud of pickups',
  }),
  Object.freeze({
    key: 'dart',
    enemyId: 'dart_swarmer',
    mass: 10,
    group: Object.freeze([4, 7]),
    capabilities: Object.freeze([SWARMER_CAPABILITY.SPEED_PASS]),
    counterVerb: SWARMER_COUNTER_VERB.CROSS_THE_LANE,
    tell: Object.freeze({
      silhouette: 'dart_needle',
      motion: 'straight high-velocity passes, wide slow re-entry — it can never turn inside you',
      sound: 'thin rising sawtooth Doppler on the run-in, hard break on the pass',
    }),
    audio: Object.freeze({
      telegraphCue: 'engine_flare',
      doctrineRecipeId: 'sfx_doctrine_flyby',
      signatureRecipeId: 'sfx_doctrine_flyby_break',
    }),
    lootRead: 'mostly credit chips — they carry payroll',
  }),
  Object.freeze({
    key: 'flea',
    enemyId: 'flea_swarmer',
    mass: 12,
    group: Object.freeze([3, 5]),
    capabilities: Object.freeze([SWARMER_CAPABILITY.ANCHOR_SNARE_LIGHT]),
    counterVerb: SWARMER_COUNTER_VERB.DISPLACE_THE_ANCHOR,
    tell: Object.freeze({
      silhouette: 'flea_grapnel',
      motion: 'closes, plants and holds for the wind-up, then genuinely runs — it does not re-commit',
      sound: 'capacitor charge climbing through the wind-up, cooling sine on the run',
    }),
    audio: Object.freeze({
      telegraphCue: 'field_spool',
      doctrineRecipeId: 'sfx_doctrine_ranged_charge',
      signatureRecipeId: 'sfx_doctrine_ranged_withdraw',
    }),
    lootRead: 'field components',
  }),
  Object.freeze({
    key: 'skitter',
    enemyId: 'skitter_swarmer',
    mass: 14,
    group: Object.freeze([3, 6]),
    capabilities: Object.freeze([SWARMER_CAPABILITY.TERRAIN_AMBUSH]),
    counterVerb: SWARMER_COUNTER_VERB.STRIP_THE_COVER,
    tell: Object.freeze({
      silhouette: 'skitter_lowprofile',
      motion: 'flat against the rock, opens from its far side, threads back into the field between passes',
      sound: 'dust-kick crack off the rock at reveal, then ordinary interceptor language',
    }),
    audio: Object.freeze({
      telegraphCue: 'rock_dust',
      doctrineRecipeId: 'sfx_doctrine_flyby',
      signatureRecipeId: 'sfx_mining_fracture_warning',
    }),
    lootRead: 'mining-grade ores — they nest in rocks',
  }),
  Object.freeze({
    key: 'ember',
    enemyId: 'ember_swarmer',
    mass: 15,
    group: Object.freeze([2, 4]),
    capabilities: Object.freeze([SWARMER_CAPABILITY.REACTOR_COOK_OFF]),
    counterVerb: SWARMER_COUNTER_VERB.AIM_THE_BLAST,
    tell: Object.freeze({
      silhouette: 'ember_corecage',
      motion: 'presses in and stays close — it wants to die next to something',
      sound: 'low square growl on the commit, kinetic shunt crack on the cook-off',
    }),
    audio: Object.freeze({
      telegraphCue: 'engine_flare',
      doctrineRecipeId: 'sfx_doctrine_brawler_commit',
      signatureRecipeId: 'sfx_vector_mine',
    }),
    lootRead: 'fewer materials (it burns), more credits',
  }),
  Object.freeze({
    key: 'wasp',
    enemyId: 'wasp_swarmer',
    mass: 16,
    group: Object.freeze([3, 5]),
    capabilities: Object.freeze([SWARMER_CAPABILITY.PACK_STRAFE]),
    counterVerb: SWARMER_COUNTER_VERB.FIELD_CLUMP,
    tell: Object.freeze({
      silhouette: 'drone_swarm',
      motion: 'strafe runs, extend, regroup',
      sound: 'insectoid engine buzz',
    }),
    audio: Object.freeze({
      telegraphCue: 'engine_flare',
      doctrineRecipeId: 'sfx_doctrine_flyby',
      signatureRecipeId: 'sfx_doctrine_flyby',
    }),
    lootRead: 'small scrap spray',
  }),
]);

const BY_ENEMY_ID = new Map(SWARMER_FAMILY.map((row) => [row.enemyId, row]));
const BY_KEY = new Map(SWARMER_FAMILY.map((row) => [row.key, row]));

/** The four entries this wave adds; the Wasp and Mote already shipped. */
export const SWARMER_WAVE1_ENEMY_IDS = Object.freeze([
  'dart_swarmer', 'flea_swarmer', 'skitter_swarmer', 'ember_swarmer',
]);

/** Grammar record for a live enemy type id, or null. Pure. */
export function swarmerRecordFor(enemyId) {
  return BY_ENEMY_ID.get(String(enemyId || '')) || null;
}

/** Grammar record by family key ('dart', 'ember', …), or null. Pure. */
export function swarmerRecordByKey(key) {
  return BY_KEY.get(String(key || '')) || null;
}

/** True when the enemy type owns the named capability. Pure. */
export function swarmerHasCapability(enemyId, capabilityId) {
  const row = swarmerRecordFor(enemyId);
  return !!row && row.capabilities.includes(capabilityId);
}

/**
 * The (lootTableId, silhouette) pairs that must render as their OWN authored hard geometry.
 *
 * Reference map for the presentation packet. These hulls are designed procedural bodies: the
 * silhouette is the enemy's identity, so the render track must not substitute a stand-in ship.
 * Returning this map does not by itself prove that the current renderer consumes the contract.
 */
export function designedProceduralSilhouettes() {
  const out = new Map();
  for (const row of SWARMER_FAMILY) {
    if (row.tell.silhouette === 'drone_swarm') continue; // the Wasp keeps its production whole-ship
    out.set(row.enemyId, row.tell.silhouette);
  }
  return out;
}

/**
 * Check the grammar against the live catalog. Pure: returns a list of human-readable problems,
 * empty when the family is coherent. Called by the family test; safe to call anywhere.
 */
export function validateSwarmerFamily(enemyTypes = ENEMY_TYPES) {
  const problems = [];
  const byId = new Map((enemyTypes || []).map((def) => [def.id, def]));
  const silhouettes = new Map();

  for (const row of SWARMER_FAMILY) {
    const def = byId.get(row.enemyId);
    if (!def) {
      problems.push(`${row.key}: names enemy id "${row.enemyId}" which the catalog does not ship`);
      continue;
    }
    if (!(def.mass > 0) || def.mass > SWARMER_MASS_CEILING) {
      problems.push(`${row.key}: mass ${def.mass} is outside the light band (0, ${SWARMER_MASS_CEILING}]`);
    }
    if (def.mass !== row.mass) {
      problems.push(`${row.key}: grammar mass ${row.mass} disagrees with catalog mass ${def.mass}`);
    }
    if (def.fixedCombatStats !== true) {
      problems.push(`${row.key}: difficulty must come from composition; fixedCombatStats is not enabled`);
    }
    const oneHitDeltaV = SWARMER_REFERENCE_CONCUSSION_IMPULSE / Math.max(1, def.mass);
    if (oneHitDeltaV < SWARMER_TUMBLE_DELTA_V) {
      problems.push(`${row.key}: one concussion hit gives ${oneHitDeltaV.toFixed(1)} wu/s, under tumbleDeltaV ${SWARMER_TUMBLE_DELTA_V}`);
    }
    if (def.silhouette !== row.tell.silhouette) {
      problems.push(`${row.key}: grammar silhouette "${row.tell.silhouette}" disagrees with catalog "${def.silhouette}"`);
    }
    if (silhouettes.has(row.tell.silhouette)) {
      problems.push(`${row.key}: silhouette "${row.tell.silhouette}" is already used by ${silhouettes.get(row.tell.silhouette)} — recolors are banned`);
    }
    silhouettes.set(row.tell.silhouette, row.key);

    if (!row.capabilities.length) problems.push(`${row.key}: declares no capability`);
    for (const capability of row.capabilities) {
      if (!CAPABILITY_IDS.includes(capability)) {
        problems.push(`${row.key}: unknown capability "${capability}"`);
      }
    }
    if (row.key !== 'wasp' && row.capabilities.every((c) => PASSIVE_CAPABILITIES.includes(c))) {
      problems.push(`${row.key}: its only capability is shooting — an enemy that is a gun with HP is a defect`);
    }
    if (!COUNTER_VERB_IDS.includes(row.counterVerb)) {
      problems.push(`${row.key}: unknown counter verb "${row.counterVerb}"`);
    }
    for (const channel of ['silhouette', 'motion', 'sound']) {
      if (!row.tell[channel]) problems.push(`${row.key}: tell is missing the ${channel} channel`);
    }
    for (const channel of ['telegraphCue', 'doctrineRecipeId', 'signatureRecipeId']) {
      if (!row.audio[channel]) problems.push(`${row.key}: audio mapping is missing ${channel}`);
    }
    if (!row.lootRead) problems.push(`${row.key}: declares no loot read`);
    if (!Array.isArray(row.group) || row.group.length !== 2 || !(row.group[0] > 0) || row.group[1] < row.group[0]) {
      problems.push(`${row.key}: group size ${JSON.stringify(row.group)} is not a valid [min, max]`);
    }
  }

  const ember = byId.get('ember_swarmer');
  if (!ember || !ember.deathCookOff) {
    problems.push('ember: catalog is missing the cook-off runtime contract');
  } else {
    for (const key of ['radiusWu', 'impulse', 'maxAffected', 'provenance']) {
      if (ember.deathCookOff[key] !== EMBER_COOK_OFF[key]) {
        problems.push(`ember: catalog cook-off ${key} disagrees with the family owner`);
      }
    }
  }
  const skitter = byId.get('skitter_swarmer');
  if (!skitter || skitter.terrainAmbush?.nest !== 'rock') {
    problems.push('skitter: catalog is missing its rock-nest runtime contract');
  }

  // Reverse check, deliberately narrow. A faction reskin of an existing entry (choir_zealot is a
  // Wasp with a creed) is NOT a new family member and must not be forced to invent a silhouette.
  // Only hulls that claim the family name in their id owe a grammar row.
  for (const def of enemyTypes || []) {
    if (String(def.id || '').endsWith('_swarmer') && !BY_ENEMY_ID.has(def.id)) {
      problems.push(`catalog: "${def.id}" claims the swarmer family with no grammar row`);
    }
  }

  return problems;
}
