// W-BLOOM (build_map §34 rows 503/504/507/508, bible 03 §1).
//
// The Bloom is a fungus that couples nervous systems. This file is the single data spine the
// ladder's two owners share: the arena-side Brood engine (src/systems/swarmBrood.js) and the
// adventure-side bloom runtime (src/systems/faction_bloom.js). It is pure data + pure helpers,
// like swarmBrood.js and rockSubstances.js: no bus, no state, no RNG source but a stream it is
// handed. Same (sectorId, tideSeq) always yields the same tide plan.
//
// THE LADDER (03 §1.3)
//   Mass bands are authored tonnes and set the Katamari ordering: the player should always see
//   a Bloom body they can *just barely* move. `kind` names which sim population carries it:
//     'brood'       — light bodies in the swarm-brood engine's typed arrays
//     'entity'      — kinematic entities steered by the bloom runtime
//     'environment' — sector-scale presence, no body
//     'nonhostile'  — texture/wonder, never a target (03 §1.3 law)
//   `broodId` joins the swarm-brood family roster; `speciesId` names the fauna-table row a
//   tide pack's member count reads from. Both optional.
//
// THE PATHOLOGIES (03 §1.1–1.2)
//   Coupling filaments, panic/aggression/grief cascades, pain loop, route-memory and
//   host-shadow are behavior law, not flavor. The timings below are the authored windows both
//   owners read, so an arena mite and an adventure needle pack flinch on the same clock.
//
// ROUTE-MEMORY (03 §1.4)
//   A sector's tide class says how often the Bloom runs there; `policy` says what killing a
//   tide changes. 'around' routes the next tide off the kill line; 'denser' brings it back
//   heavier. bloomTidePlan() is the deterministic read both owners use.

import { mulberry32 } from '../core/rng.js';

// ── The ladder ─────────────────────────────────────────────────────────────────────────

export const BLOOM_LADDER = Object.freeze([
  // T0 — dust. Hazards and texture, not targets.
  {
    id: 'spore_drift', tier: 0, name: 'Spore Drift', kind: 'brood', broodId: 'spore_drift',
    massBand: { min: 0, max: 0.5 }, source: 'new',
    roleInFight: 'sticky clouds that slow hulls',
    telegraph: 'green haze', counter: 'burn it with heat or blow it with a Repulsor',
    deathLeaves: 'nothing; clears',
  },
  {
    id: 'lostcalls', tier: 0, name: 'Lostcalls', kind: 'nonhostile',
    massBand: { min: 0, max: 0.5 }, source: 'new',
    roleInFight: 'harmless; a lonely chirping light whose calls mark a dead pocket where the field cannot reach — follow it to a clue',
    telegraph: '—', counter: '—', deathLeaves: '—',
  },
  // T1 — the ammunition families. The first four are the live brood roster.
  {
    id: 'mite', tier: 1, name: 'Needle Mite', kind: 'brood', broodId: 'mite',
    massBand: { min: 5, max: 15 }, source: 'existing',
    roleInFight: 'the ammunition: flocks that dive',
    telegraph: 'flock-shimmer', counter: 'sweep them with anything', deathLeaves: 'husk shards (throwable)',
  },
  {
    id: 'leecher', tier: 1, name: 'Hull Leech', kind: 'brood', broodId: 'leecher',
    massBand: { min: 10, max: 15 }, source: 'existing',
    roleInFight: 'latches and adds mass, slowing you',
    telegraph: 'the hull flashes green', counter: 'scrape a wall or spin hard',
    deathLeaves: 'the leech, still sticky (glue ammunition)',
  },
  {
    id: 'spitter', tier: 1, name: 'Spitter', kind: 'brood', broodId: 'spitter',
    massBand: { min: 10, max: 20 }, source: 'existing',
    roleInFight: 'lobs acid from range',
    telegraph: 'marker on the floor', counter: 'dodge, then throw',
    deathLeaves: 'acid sac (a thrown sac splashes)',
  },
  {
    id: 'lantern_cyst', tier: 1, name: 'Lantern Cyst', kind: 'brood', broodId: 'lantern_cyst',
    massBand: { min: 15, max: 30 }, source: 'new', speciesId: 'lantern_cyst',
    roleInFight: 'drifts toward heat, then bursts in a spore shove',
    telegraph: 'its glow brightens', counter: 'grab and throw it as a bomb',
    deathLeaves: 'spore burst (shoves everything)',
  },
  // Non-hostile ecology is mandatory (03 §1.3): wonder and texture, never targets. The two
  // non-hostile rows sit inside their own tier so the ladder reads in nondecreasing order.
  {
    id: 'archive_crab', tier: 1, name: 'Archive Crab', kind: 'nonhostile', speciesId: 'archive_crab',
    massBand: { min: 5, max: 40 }, source: 'existing',
    roleInFight: 'piles fragments into geometric heaps that hold salvage',
    telegraph: '—', counter: '—', deathLeaves: '—',
  },
  // T2 — juveniles and armored grazers.
  {
    id: 'charger', tier: 2, name: 'Charger', kind: 'brood', broodId: 'charger',
    massBand: { min: 25, max: 60 }, source: 'existing',
    roleInFight: 'lines a dash',
    telegraph: 'dash line', counter: 'sidestep and feed it a rock',
    deathLeaves: 'horn plate (heavy throwable)',
  },
  {
    id: 'glassback', tier: 2, name: 'Glassback', kind: 'brood', broodId: 'glassback',
    massBand: { min: 40, max: 120 }, source: 'new', speciesId: 'glassback',
    roleInFight: 'silicate-armoured grazers that reflect gunfire, so only mass kills them',
    telegraph: 'glints — guns ping off', counter: 'smash them',
    deathLeaves: 'glass shards (they shatter on impact, splash damage)',
  },
  {
    id: 'wake_eel', tier: 2, name: 'Wake Eel', kind: 'brood', broodId: 'wake_eel',
    massBand: { min: 60, max: 200 }, source: 'new', speciesId: 'wake_eel',
    roleInFight: 'trails your wake, then wraps small ships',
    telegraph: 'a ribbon in your trail', counter: 'turn hard and grab its tail',
    deathLeaves: 'the eel body, which is a whip while held',
  },
  {
    id: 'bellows', tier: 2, name: 'Bellows', kind: 'brood', broodId: 'bellows',
    massBand: { min: 80, max: 250 }, source: 'new',
    roleInFight: 'swells and bursts when struck hard',
    telegraph: 'it inflates on a hit', counter: 'grab it before it bursts and fling it into a pack',
    deathLeaves: 'a shockwave that shoves the pack',
  },
  // T3 — wreck-dwellers, predators, carriers, and the colonised hull.
  {
    id: 'bristle_ram', tier: 3, name: 'Bristle Ram', kind: 'entity', speciesId: 'bristle_ram',
    massBand: { min: 300, max: 900 }, source: 'new',
    roleInFight: 'territorial rammer, no ranged attack',
    telegraph: 'it lowers its horn cage', counter: 'bait it into a rock or another ram',
    deathLeaves: 'the horn cage (a ram you can throw)',
  },
  {
    id: 'casket_worm', tier: 3, name: 'Casket Worm', kind: 'entity', speciesId: 'casket_worm',
    broodId: 'brood_tendril',
    massBand: { min: 400, max: 1500 }, source: 'existing',
    roleInFight: 'emerges from wreck breaches in a segmented chain',
    telegraph: 'the wreck rattles', counter: 'cut a middle segment (pain loop)',
    deathLeaves: 'segments (each throwable)',
  },
  {
    id: 'furnace_maw', tier: 3, name: 'Furnace Maw', kind: 'entity', speciesId: 'furnace_maw',
    massBand: { min: 600, max: 2000 }, source: 'new',
    roleInFight: 'a heavy predator drawn to reactor output',
    telegraph: 'its plates glow', counter: 'feed it hot slag or a reactor core to stun it',
    deathLeaves: 'radiator plates (hot; they ignite spore drift)',
  },
  {
    id: 'spindle_mother', tier: 3, name: 'Spindle Mother', kind: 'entity', speciesId: 'spindle_mother',
    broodId: 'brood_queen',
    massBand: { min: 800, max: 2500 }, source: 'existing',
    roleInFight: 'a slow carrier wreathed in juveniles',
    telegraph: 'the sacs pulse', counter: 'break the sacs, then the grief loop gathers the flock',
    deathLeaves: 'the carcass (the biggest T3 throwable)',
  },
  {
    id: 'husk', tier: 3, name: 'Husk', kind: 'entity',
    massBand: { min: 1000, max: 3000 }, source: 'new',
    roleInFight: "a colonised human hull that flies its dead crew's patterns (host-shadow)",
    telegraph: 'old faction lights flicker green', counter: 'treat it like the old faction',
    deathLeaves: 'the hull, which spills mites',
  },
  // T4 — relays and the membrane.
  {
    id: 'veil_ray', tier: 4, name: 'Veil Ray', kind: 'entity', speciesId: 'veil_ray',
    massBand: { min: 3000, max: 10000 }, source: 'new',
    roleInFight: 'a membrane surfer; infected rays tow swarms',
    telegraph: 'the membrane ripples', counter: 'tear the edge (centre hits are absorbed)',
    deathLeaves: 'membrane sheets that catch and hold thrown bodies',
  },
  {
    id: 'blind_shepherd', tier: 4, name: 'Blind Shepherd', kind: 'entity', speciesId: 'blind_shepherd',
    massBand: { min: 5000, max: 20000 }, source: 'new',
    roleInFight: 'a relay: packs within its pulse fly coherent',
    telegraph: 'visible pulse rings', counter: 'kill or drive it off, and every linked pack panics',
    deathLeaves: 'the pulse organ; carrying it calls swarms to where you drop it',
  },
  {
    id: 'anchor_beast', tier: 4, name: 'Anchor Beast', kind: 'entity', speciesId: 'anchor_beast',
    massBand: { min: 5000, max: 30000 }, source: 'new',
    roleInFight: 'sessile, grown around an asteroid; a territory anchor and relay',
    telegraph: 'the rock is wrapped in growth', counter: 'move the whole rock with the beast still on it',
    deathLeaves: 'a living rock',
  },
  {
    id: 'mourning_kite', tier: 4, name: 'Mourning Kite', kind: 'nonhostile', speciesId: 'mourning_kite',
    massBand: { min: 100, max: 400 }, source: 'existing',
    roleInFight: 'follows a grief route around old wrecks',
    telegraph: '—', counter: '—', deathLeaves: '—',
  },
  // T5 — the nest you dismantle.
  {
    id: 'hive_hulk', tier: 5, name: 'Hive-hulk', kind: 'entity',
    massBand: { min: 30000, max: 150000 }, source: 'new',
    roleInFight: 'a colonised capital ship; a nest you dismantle piece by piece',
    telegraph: 'glowing nodes', counter: 'break nodes, rip plates, empty the bays',
    deathLeaves: 'its plates, bays and nodes; the endgame ammo pile',
  },
  {
    id: 'bolus', tier: 5, name: 'The Bolus', kind: 'environment',
    massBand: { min: 150000, max: 150000 }, source: 'existing',
    roleInFight: 'an interior: one volume, one fungus, one Line',
    telegraph: '—', counter: '—', deathLeaves: '—',
  },
  // T6 — the coupling field itself.
  {
    id: 'long_field', tier: 6, name: 'The Long Field', kind: 'environment',
    massBand: { min: 150000, max: 150000 }, source: 'new',
    roleInFight: 'the field itself, drawn as filaments across the whole sky',
    telegraph: 'sky-filaments', counter: 'break the shepherds that anchor it',
    deathLeaves: 'the field thins and the tide line falls back',
  },
]);

const LADDER_BY_ID = new Map(BLOOM_LADDER.map((row) => [row.id, row]));

/** The ladder row for a family id, or null. Pure. */
export function bloomLadderFamily(id) {
  return (typeof id === 'string' && LADDER_BY_ID.get(id)) || null;
}

/** The ladder row a swarm-brood family id maps to (mite → 'mite'), or null. Pure. */
export function bloomLadderForBrood(broodId) {
  for (const row of BLOOM_LADDER) if (row.broodId === broodId) return row;
  return null;
}

/** The ladder row a fauna species id maps to (blind_shepherd → 'blind_shepherd'), or null. */
export function bloomLadderForSpecies(speciesId) {
  for (const row of BLOOM_LADDER) if (row.speciesId === speciesId) return row;
  return null;
}

// ── Pathology tuning (03 §1.2), shared by both owners ──────────────────────────────────

/** Faint green filaments join members within this radius; a node's death flares the web. */
export const BLOOM_FILAMENT_RADIUS = 28;
/** Flare window after a linked node dies — the pack's flinch reads on the filaments. */
export const BLOOM_FILAMENT_FLARE_S = 0.7;

/**
 * Panic cascade: a mass kill above this total mass inside a pack scatters it. The band is
 * authored (1.5–2.5 s scatter, then a tight knot — the knot is the best throw of the fight).
 */
export const BLOOM_PANIC_KILL_MASS = 90;
export const BLOOM_PANIC_SCATTER_MIN_S = 1.5;
export const BLOOM_PANIC_SCATTER_MAX_S = 2.5;
/** The knot beats the scatter's end by this much — a readable second act. */
export const BLOOM_PANIC_REFORM_S = 1.3;
/** Cascade reach: members inside this radius of the trigger join the pathology. */
export const BLOOM_CASCADE_RADIUS = 220;

/** Aggression cascade: a relay or the Queen taking a hit turns every linked member on you. */
export const BLOOM_AGGRESSION_S = 4.0;
/** Aggression speed multiplier over the member's cruise. */
export const BLOOM_AGGRESSION_SPEED_MULT = 2.2;

/** Grief loop: a Mother or Hive node death clusters linked members around the body. */
export const BLOOM_GRIEF_S = 5.0;
/** The cluster tightens to this ring around the corpse. */
export const BLOOM_GRIEF_RING = 30;

/** Pain loop: a cut long body thrashes a fixed arc around its cut point. */
export const BLOOM_THRASH_S = 2.2;
export const BLOOM_THRASH_RADIUS = 14;
/** A thrashing stump kills pack bodies it sweeps — the hazard you can aim enemies into. */
export const BLOOM_THRASH_SWEEP = true;

// ── Route-memory (03 §1.4) ──────────────────────────────────────────────────────────────

/**
 * The tide map. `klass` says how present the Bloom is; `policy` is the route-memory law —
 * what the NEXT tide in the sector does after the last one died somewhere:
 *   'around' — routes off the kill line (perpendicular shift)
 *   'denser' — comes back heavier on the same line (more members, tighter pack)
 * Clean sectors never field a tide. Endemic sectors always do.
 */
export const BLOOM_TIDE_SECTORS = Object.freeze({
  sector_ashfall_reach: Object.freeze({ klass: 'endemic', policy: 'denser' }),
  sector_charon_expanse: Object.freeze({ klass: 'tidal', policy: 'around' }),
  sector_eunomia_gulf: Object.freeze({ klass: 'tidal', policy: 'around' }),
  sector_rhea_cinder: Object.freeze({ klass: 'tidal', policy: 'around' }),
  sector_haumea_rift: Object.freeze({ klass: 'tidal', policy: 'around' }),
  sector_pallas_drift: Object.freeze({ klass: 'incursion', policy: 'denser' }),
  sector_sker_haven: Object.freeze({ klass: 'incursion', policy: 'around' }),
  sector_vesta_forge: Object.freeze({ klass: 'incursion', policy: 'denser' }),
});

/** The tide class record for a sector, or null when the sector is Bloom-clean. Pure. */
export function bloomTideSector(sectorId) {
  return (typeof sectorId === 'string' && BLOOM_TIDE_SECTORS[sectorId]) || null;
}

/** Tide pack member count by class — the ladder's tide sizes. */
export const BLOOM_TIDE_COUNT = Object.freeze({ endemic: 14, tidal: 9, incursion: 6 });

/** The species a tide pack fields, in fill order — the low ladder at tide scale. */
export const BLOOM_TIDE_ROSTER = Object.freeze([
  'needle_swarm', 'needle_swarm', 'hull_leech', 'lantern_cyst',
  'glassback', 'wake_eel', 'bristle_ram', 'blind_shepherd',
]);

/** Deterministic tide stream seed — own stream, never the shared rng. */
export function bloomTideSeed(sectorId, seq) {
  const label = `bloom-tide|${sectorId}|${Math.max(0, Math.trunc(Number(seq) || 0))}`;
  let h = 0x9e3779b9;
  for (let i = 0; i < label.length; i++) h = Math.imul(h ^ label.charCodeAt(i), 0x01000193);
  return (h >>> 0) || 1;
}

/**
 * Compose the sector's NEXT tide. Pure. `record` is the persisted route-memory row
 * ({ kills, lastX, lastZ, seq }) or null for the first tide: the same seed always plans the
 * same route, and a kill record bends it by the sector's policy.
 * Returns { seq, count, anchor:{x,z}, spread, memberIds } — memberIds indexes
 * BLOOM_TIDE_ROSTER cyclically, one blind shepherd at the tail (the pack's relay).
 */
export function bloomTidePlan(sectorId, record) {
  const def = bloomTideSector(sectorId);
  if (!def) return null;
  const seq = Math.max(0, Math.trunc(Number(record && record.seq) || 0));
  const rng = mulberry32(bloomTideSeed(sectorId, seq));
  const baseCount = BLOOM_TIDE_COUNT[def.klass] || 6;
  const kills = Math.max(0, Math.trunc(Number(record && record.kills) || 0));
  // 'denser' sectors answer a kill with a heavier tide; 'around' keeps size but moves the line.
  const count = def.policy === 'denser' ? Math.min(baseCount + kills * 2, baseCount * 2) : baseCount;
  // The route line: a seeded lane across the sector, remembered kills bend it.
  const bearing = rng() * Math.PI * 2;
  const reach = 900 + rng() * 700;
  let ax = Math.cos(bearing) * reach;
  let az = Math.sin(bearing) * reach;
  if (record && Number.isFinite(record.lastX) && Number.isFinite(record.lastZ)) {
    if (def.policy === 'around') {
      // Route off the kill line: shift the anchor perpendicular to the remembered lane.
      const px = -record.lastZ;
      const pz = record.lastX;
      const pl = Math.hypot(px, pz) || 1;
      const sign = (kills % 2 === 0) ? 1 : -1;
      ax = record.lastX + (px / pl) * 1400 * sign;
      az = record.lastZ + (pz / pl) * 1400 * sign;
    } else {
      // 'denser': same lane, tighter — the tide returns to where the last one died.
      ax = record.lastX;
      az = record.lastZ;
    }
  }
  const memberIds = [];
  for (let i = 0; i < count; i++) memberIds.push(BLOOM_TIDE_ROSTER[i % BLOOM_TIDE_ROSTER.length]);
  return {
    seq,
    count,
    anchor: { x: ax, z: az },
    spread: def.policy === 'denser' && kills > 0 ? 160 : 320,
    memberIds,
    policy: def.policy,
    klass: def.klass,
  };
}

// ── Host-shadow (03 §1.2): the colonised hull flies its dead crew's patterns ────────────

/**
 * The dead crew's flight pattern by faction. 'passes' = Reach strafing runs (close, pass,
 * turn out, re-attack); 'lines' = Concord ordered line work (a slow weave around the
 * approach axis); 'hold' = anything else falls back to a circling hold. The husk's steering
 * reads this record — the player recognises the old faction in the new monster.
 */
export const HOST_SHADOW_PATTERNS = Object.freeze({
  faction_reach: Object.freeze({ pattern: 'passes', weaveRadS: 0, passSpeed: 1.35 }),
  faction_concord: Object.freeze({ pattern: 'lines', weaveRadS: 1.1, passSpeed: 0.8 }),
  faction_scn: Object.freeze({ pattern: 'passes', weaveRadS: 0, passSpeed: 1.35 }),
  faction_helix: Object.freeze({ pattern: 'lines', weaveRadS: 1.4, passSpeed: 0.9 }),
});

/** The host-shadow record for a dead crew's faction id. Pure; 'hold' is the fallback. */
export function hostShadowPattern(hostFactionId) {
  const row = (typeof hostFactionId === 'string' && HOST_SHADOW_PATTERNS[hostFactionId]) || null;
  return row || Object.freeze({ pattern: 'hold', weaveRadS: 0, passSpeed: 1.0 });
}

/** The transponder line LOG reads off a dying Husk — the old crew's callsign, flickering. */
export function hostShadowTransponder(hostFactionId) {
  const names = {
    faction_reach: 'Reach',
    faction_scn: 'SCN',
    faction_concord: 'Concord',
    faction_helix: 'Helix',
  };
  const name = names[hostFactionId] || 'unfiled';
  return `Transponder echo — a dead ${name} callsign, repeating under the growth.`;
}

// ── Catalog check ──────────────────────────────────────────────────────────────────────

/**
 * Catalog + law check for the whole ladder, checkable without a game. Empty when honest.
 * Mirrors swarmBroodIssues(): an authoring defect fails here, never at spawn time.
 */
export function bloomLadderIssues() {
  const issues = [];
  const seen = new Set();
  let lastTier = -1;
  BLOOM_LADDER.forEach((row, i) => {
    const path = `bloomLadder[${i}]`;
    if (!row || typeof row.id !== 'string' || !row.id) {
      issues.push({ path, message: 'row has no id' });
      return;
    }
    if (seen.has(row.id)) issues.push({ path, message: `duplicate family id ${row.id}` });
    seen.add(row.id);
    if (!Number.isInteger(row.tier) || row.tier < 0 || row.tier > 6) {
      issues.push({ path, message: `${row.id} tier outside T0–T6` });
    }
    if (row.tier < lastTier) issues.push({ path, message: `${row.id} tiers must be nondecreasing` });
    lastTier = Math.max(lastTier, row.tier);
    if (!row.massBand || !(row.massBand.min >= 0) || !(row.massBand.max >= row.massBand.min)) {
      issues.push({ path, message: `${row.id} mass band is malformed` });
    }
    if (!['brood', 'entity', 'environment', 'nonhostile'].includes(row.kind)) {
      issues.push({ path, message: `${row.id} kind ${row.kind} is not a sim population` });
    }
    if (row.kind === 'nonhostile' && (row.telegraph !== '—' || row.counter !== '—')) {
      issues.push({ path, message: `${row.id} non-hostile families carry no fight language` });
    }
    if (row.kind !== 'nonhostile' && row.kind !== 'environment') {
      if (typeof row.telegraph !== 'string' || row.telegraph.length < 4) {
        issues.push({ path, message: `${row.id} has no telegraph` });
      }
      if (typeof row.counter !== 'string' || row.counter.length < 8) {
        issues.push({ path, message: `${row.id} has no counter line` });
      }
      if (typeof row.deathLeaves !== 'string' || row.deathLeaves.length < 3) {
        issues.push({ path, message: `${row.id} has no death-throwable line` });
      }
    }
  });
  // The ladder must be complete: every tier the spec names must be present.
  for (const tier of [0, 1, 2, 3, 4, 5, 6]) {
    if (!BLOOM_LADDER.some((row) => row.tier === tier && row.kind !== 'nonhostile')) {
      issues.push({ path: 'bloomLadder', message: `tier ${tier} has no member — the ladder is not landed` });
    }
  }
  // The tide map must speak a lawful policy for every sector it names.
  for (const [sectorId, def] of Object.entries(BLOOM_TIDE_SECTORS)) {
    if (!['endemic', 'tidal', 'incursion'].includes(def.klass)) {
      issues.push({ path: `bloomTideSectors.${sectorId}`, message: `tide class ${def.klass} is not lawful` });
    }
    if (!['around', 'denser'].includes(def.policy)) {
      issues.push({ path: `bloomTideSectors.${sectorId}`, message: `route-memory policy ${def.policy} is not lawful` });
    }
  }
  return issues;
}
