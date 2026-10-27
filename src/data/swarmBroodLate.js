// Late Brood families. The base roster in src/data/swarmBrood.js stays the early clock.
// This module is the continuation: each row is a light instanced body, budget-counted
// by folding its count out of the mite share. The engine merges the tables.

import {
  SWARM_BROOD_FAMILIES,
  SWARM_BROOD_QUEEN_ID,
  swarmBroodBossFor,
} from './swarmBrood.js';
import { isSwarmBossWave } from './swarmMode.js';

export const SWARM_BROOD_LATE_FAMILIES = Object.freeze([
  {
    id: 'burrower',
    name: 'Burrower',
    role: 'ambush',
    fromWave: 19,
    weight: 2,
    // How many of this family replace mites on a wave that has unlocked it.
    cohort: 8,
    radius: 3.2,
    mass: 18,
    hull: 16,
    speed: 48,
    turn: 3.2,
    credits: 3,
    score: 28,
    telegraph: {
      bark: 'warn',
      line: 'The rock cracks — a burrower is coming out.',
      cue: 'weapon_charge',
    },
    counter: 'It hides in the rock. Clear the silhouette before it bursts.',
    deathLeaves: 'a cracked shell',
    bodyColor: [0.28, 0.22, 0.16],
    bodyEmissive: [0.18, 0.10, 0.04],
    // Low and wide: a rock-crab, not the mite dart.
    stretch: Object.freeze([0.72, 0.48, 1.28]),
    burrows: true,
    burstRange: 64,
    windupS: 0.5,
  },
  {
    id: 'splitter',
    name: 'Splitter',
    role: 'brood',
    fromWave: 21,
    weight: 2,
    cohort: 8,
    radius: 5.4,
    mass: 28,
    hull: 20,
    speed: 34,
    turn: 2.4,
    credits: 4,
    score: 36,
    telegraph: {
      bark: 'warn',
      line: 'The splitter cracks — three smaller bodies take its place.',
      cue: 'weapon_charge',
    },
    counter: 'Kill it and three mites step out of the same budget. Sweep the pieces.',
    deathLeaves: 'three mites',
    bodyColor: [0.45, 0.18, 0.32],
    bodyEmissive: [0.40, 0.08, 0.22],
    stretch: Object.freeze([1.15, 1.05, 1.15]),
    splits: true,
  },
  {
    id: 'brood_mother',
    name: 'Brood Mother',
    role: 'sac',
    fromWave: 23,
    weight: 2,
    cohort: 1,
    radius: 6.4,
    mass: 70,
    hull: 48,
    speed: 22,
    turn: 1.2,
    credits: 6,
    score: 60,
    telegraph: {
      bark: 'warn',
      line: 'The brood mother is walking — she is dropping mites.',
      cue: 'engine_flare',
    },
    counter: 'Kill the mother. Her mite tide stops when she does.',
    deathLeaves: 'the rest of her tide, unspent',
    bodyColor: [0.36, 0.14, 0.18],
    bodyEmissive: [0.42, 0.10, 0.12],
    stretch: Object.freeze([1.35, 1.2, 1.45]),
    births: true,
    birthEveryS: 1,
    birthBudget: 12,
  },
  // ── The deep band: waves 31–55 ────────────────────────────────────────────────────────
  // Ship silhouettes stop arriving at 22 and this table's own clock stopped at 23; the rows
  // below keep the late clock moving inside the same mite share, so the room reads different
  // instead of simply fuller. The ship catalog holds no legal late body (the only unfielded
  // silhouette, the scissorwake, outruns every starter at stock stats — the handling law
  // forbids it), so the band lives here: five veteran variants through flag recipes the
  // engine already runs — no new kill math, no stat scaling, same population band.
  {
    id: 'remora',
    name: 'Remora',
    role: 'wake-mine',
    fromWave: 31,
    weight: 2,
    cohort: 5,
    radius: 2.6,
    mass: 10,
    hull: 12,
    speed: 66,
    turn: 3.6,
    credits: 3,
    score: 30,
    telegraph: {
      bark: 'warn',
      line: 'A remora rides your wake — it is winding up astern.',
      cue: 'weapon_charge',
    },
    counter: 'It swims your own wake and bursts at your stern. Turn hard to shed it, or pop it far out.',
    deathLeaves: 'a spent charge',
    bodyColor: [0.60, 0.26, 0.10],
    bodyEmissive: [0.50, 0.14, 0.04],
    // A dart, not a boulder: low and long like the burrower, hot like the cyst.
    stretch: Object.freeze([0.72, 0.50, 1.30]),
    // `trails` rides astern of the signature; `primeRange` arms the fuse once it has your
    // stern — the escape line feeds the bomb to you. Shed the trail or pop it far out.
    trails: true,
    primeRange: 46,
    primeS: 1.5,
    burstRadius: 78,
    burstDv: 135,
  },
  {
    id: 'gloomcap',
    name: 'Gloomcap',
    role: 'armed-sac',
    fromWave: 37,
    weight: 2,
    cohort: 3,
    radius: 4.5,
    mass: 20,
    hull: 22,
    speed: 30,
    turn: 1.6,
    credits: 4,
    score: 38,
    telegraph: {
      bark: 'warn',
      line: 'The rock splits — a gloomcap swells out.',
      cue: 'weapon_charge',
    },
    counter: 'Your hit arms it; the fuse finishes it. Strike it twice far from you — or not at all.',
    deathLeaves: 'a burst on the pack',
    bodyColor: [0.30, 0.26, 0.34],
    bodyEmissive: [0.26, 0.10, 0.30],
    stretch: Object.freeze([1.15, 1.05, 1.15]),
    // The burrower's ambush carrying the bellows' law: `burrows` sleeps it in a rock
    // silhouette until the pilot is inside `burstRange` — the eruption IS its debut tell —
    // and `swells` means the first strike only arms the fuse. Your fire, not the room, turns
    // it into the bomb; where it floats when the fuse ends is the placement the pilot owns.
    burrows: true,
    burstRange: 72,
    windupS: 0.6,
    swells: true,
    swellS: 2.8,
    burstRadius: 88,
    burstDv: 110,
  },
  {
    id: 'ashwisp',
    name: 'Ash Wisp',
    role: 'fused-seeker',
    fromWave: 43,
    weight: 2,
    cohort: 4,
    radius: 2.0,
    mass: 5,
    hull: 9,
    speed: 46,
    turn: 4.0,
    credits: 3,
    score: 34,
    telegraph: {
      bark: 'warn',
      line: 'An ash wisp is alight — your shots pass through the glow.',
      cue: 'weapon_charge',
    },
    counter: 'No shot stops it. It bursts on its own fuse — run the fuse out, or feed it a blast.',
    deathLeaves: 'grey ash',
    bodyColor: [0.42, 0.40, 0.38],
    bodyEmissive: [0.48, 0.20, 0.05],
    // `blastOnly` refuses every cause but 'explosive' — guns, whips and walls all ping off.
    // It still seeks the signature and still primes in range, so the body is a deadline the
    // pilot answers by moving, not by shooting; a blast (or a long carry) pops it early.
    blastOnly: true,
    primeRange: 60,
    primeS: 1.7,
    burstRadius: 80,
    burstDv: 125,
  },
  {
    id: 'keelback',
    name: 'Keelback',
    role: 'armored-tail',
    fromWave: 49,
    weight: 2,
    cohort: 3,
    radius: 5.0,
    mass: 70,
    hull: 40,
    speed: 58,
    turn: 2.2,
    credits: 4,
    score: 44,
    telegraph: {
      bark: 'warn',
      line: 'A keelback has your wake — guns will only sing off the shell.',
      cue: 'pd_curtain',
    },
    counter: 'Armor on your six. Only mass cracks it — turn and feed it, and it shatters its own pack.',
    deathLeaves: 'a shatter on the pack',
    bodyColor: [0.34, 0.30, 0.30],
    bodyEmissive: [0.30, 0.12, 0.08],
    stretch: Object.freeze([1.20, 0.90, 1.25]),
    // The glassback's law moved to a pursuit body: `massOnly` means no shot moves it off
    // your tail, `trails` keeps it astern, and its `shardRadius` pays the feed by shattering
    // the pack around it when it finally cracks.
    trails: true,
    massOnly: true,
    shardRadius: 44,
  },
  {
    id: 'undertow',
    name: 'Undertow',
    role: 'drag-field',
    fromWave: 55,
    weight: 2,
    cohort: 4,
    radius: 3.0,
    mass: 12,
    hull: 14,
    speed: 58,
    turn: 3.8,
    credits: 3,
    score: 36,
    telegraph: {
      bark: 'warn',
      line: 'The undertow holds your wake — the drag is on you until you shed it.',
      cue: 'engine_flare',
    },
    counter: 'A brake that follows your escape line. Cut hard across your own wake to shed it, or burn it down.',
    deathLeaves: 'a slack eddy',
    bodyColor: [0.16, 0.30, 0.40],
    bodyEmissive: [0.06, 0.20, 0.30],
    // The drift's hazard law made mobile: `trails` keeps it on the pilot's escape line while
    // `hazard`+`slowRadius` brakes the signature inside it. A leech brakes by latching; the
    // undertow brakes by outrunning you along your own trail — shedding the wake sheds it.
    trails: true,
    hazard: true,
    slowRadius: 84,
    slowAccel: 18,
  },
  // ── The third band: waves 61–75 ────────────────────────────────────────────────────
  // The deep band's clock stops at 55 and the roster then runs silent until the wrapped
  // champions at 140 — an 85-wave plateau of rooms the pilot has already solved. These
  // three keep the band's own law: flag recipes the engine already runs, folded out of
  // the mite share, gated on the same 6-8 wave cadence. Each is a problem the roster
  // does not already pose — a brake that is also the bomb, an egg only mass can hatch,
  // and a mother only a blast can stop.
  {
    id: 'mirebulb',
    name: 'Mirebulb',
    role: 'brake-bomb',
    fromWave: 61,
    weight: 2,
    cohort: 4,
    radius: 3.4,
    mass: 14,
    hull: 16,
    speed: 40,
    turn: 2.6,
    credits: 4,
    score: 40,
    telegraph: {
      bark: 'warn',
      line: 'A mirebulb\'s pitch drags your hull — and the bulb is cooking.',
      cue: 'engine_flare',
    },
    counter: 'The drag is the fuse\'s delivery. Burn out of the pitch before the pop — or burst it far out.',
    deathLeaves: 'a pitch burst that shoves the pack',
    bodyColor: [0.46, 0.40, 0.12],
    bodyEmissive: [0.40, 0.30, 0.04],
    // A round bladder on the drift's hazard law carrying the wisp's deadline:
    // `hazard`+`slowRadius` brakes the signature inside its reach while `primeRange`+
    // `primeS` runs the fuse — the undertow's grip with a pop at the end of it. The
    // brake bites first (slowRadius > primeRange), so the fuse arms while the escape
    // is already taxed. Where it dies it bursts: kill it close and the shove still
    // lands — burst it far out, or burn clear before primeS ends.
    stretch: Object.freeze([1.05, 0.90, 1.10]),
    hazard: true,
    slowRadius: 80,
    slowAccel: 26,
    primeRange: 56,
    primeS: 1.6,
    burstRadius: 78,
    burstDv: 115,
  },
  {
    id: 'clutchstone',
    name: 'Clutchstone',
    role: 'armored-egg',
    fromWave: 67,
    weight: 2,
    cohort: 3,
    radius: 5.4,
    mass: 60,
    hull: 34,
    speed: 24,
    turn: 1.4,
    credits: 5,
    score: 48,
    telegraph: {
      bark: 'warn',
      line: 'The clutchstone cracks — three mites spill out of the shell.',
      cue: 'weapon_charge',
    },
    counter: 'Guns only sing off the egg. Crack it with mass — and crack it away from you.',
    deathLeaves: 'three mites out of the shell',
    bodyColor: [0.38, 0.34, 0.30],
    bodyEmissive: [0.16, 0.10, 0.06],
    stretch: Object.freeze([1.20, 1.00, 1.15]),
    // The glassback's armor wrapped around the splitter's law: `massOnly` means a
    // collision is the only way to hatch it — a thrown body, a fast rock, a ram —
    // and `splits` pays the splitter's three mites out of the wave's own held share
    // the moment the shell gives. Where it hatches is where the brood lands, so the
    // feed is the placement the pilot owns: crack it out there, never on the hull.
    massOnly: true,
    splits: true,
  },
  {
    id: 'poxsac',
    name: 'Pox Sac',
    role: 'blast-mother',
    fromWave: 75,
    weight: 2,
    cohort: 1,
    radius: 6.0,
    mass: 75,
    hull: 44,
    speed: 20,
    turn: 1.0,
    credits: 6,
    score: 64,
    telegraph: {
      bark: 'warn',
      line: 'The pox sac is walking — her tide only stops for a blast.',
      cue: 'engine_flare',
    },
    counter: 'Guns, walls and whips all ping off her. Only a detonation stops the tide — carry her a bomb.',
    deathLeaves: 'the rest of her tide, unspent',
    bodyColor: [0.42, 0.30, 0.36],
    bodyEmissive: [0.36, 0.10, 0.20],
    stretch: Object.freeze([1.30, 1.15, 1.40]),
    // The brood mother's tide behind the wisp's kill-gate: `births` walks her dropping
    // mites paid from the wave's own held share, and `blastOnly` means every cause but
    // 'explosive' pings off — guns, whips, rocks, rams. The answer the mother taught
    // (focus fire) is inverted: a cyst, an acid sac, a mine, a charge — bring a blast
    // or eat the whole tide. Excluded from the late reserve by her own `births` flag.
    blastOnly: true,
    births: true,
    birthEveryS: 1.2,
    birthBudget: 10,
  },
]);

/** The late family def for an id, or null. Pure. */
export function swarmBroodLateFamily(id) {
  if (typeof id !== 'string') return null;
  for (const family of SWARM_BROOD_LATE_FAMILIES) if (family.id === id) return family;
  return null;
}

/**
 * Replace mite count with late families the wave has unlocked. The plan total does not
 * grow. The queen's flood stays mites. Unknown plans pass through as a copy.
 */
export function foldBroodLatePlan(plan, wave) {
  const w = Math.max(1, Math.trunc(Number(wave) || 1));
  const copy = Array.isArray(plan)
    ? plan.map((part) => ({ id: part.id, count: part.count }))
    : [];
  if (swarmBroodBossFor(w) === SWARM_BROOD_QUEEN_ID) return copy;
  const legal = SWARM_BROOD_LATE_FAMILIES.filter((fam) => w >= fam.fromWave);
  if (legal.length === 0) return copy;
  const mite = copy.find((part) => part.id === 'mite');
  if (!mite || !(mite.count > 1)) return copy;
  for (const fam of legal) {
    const room = mite.count - 1;
    if (room <= 0) break;
    const authored = Math.max(1, Math.trunc(Number(fam.cohort) || 8));
    const take = Math.min(room, authored);
    mite.count -= take;
    const row = copy.find((part) => part.id === fam.id);
    if (row) row.count += take;
    else copy.push({ id: fam.id, count: take });
  }
  return copy.filter((part) => part.count > 0);
}

// ── The late reserve: a specialist group held back for a mid-wave drop ─────────
//
// The last base/early-late family gate is wave 23 and the population ceiling arrives
// at wave 21 — from wave 25 on, every non-Hive room fields the same full-strength
// cohort at the open and then runs dry. The Hive answers that plateau with its sac
// reserve (src/data/swarmBrood.js §B4); every other arena gets the same pressure axis
// through the late band itself: one small group of an unlocked late family is held
// out of the wave's own plan and dropped mid-wave, so clearing the room still has a
// second act. Champion waves are exempt — the boss is already the wave's pressure
// story and the population law keeps it legible (SWARM_BROOD_BOSS_FRACTION).
//
// Budget law is identical to the sac reserve and to foldBroodLatePlan: the held
// bodies spend out of the mite share, so immediate plus reserve never exceeds
// swarmBroodPopulation(wave) — texture, never population growth.

/** First wave a non-Hive, non-champion room may hold a late specialist reserve. */
export const SWARM_BROOD_RESERVE_FROM_WAVE = 25;
/** Reserve size band — small on purpose; the reserve is texture, not a second wave. */
export const SWARM_BROOD_RESERVE_MIN = 4;
export const SWARM_BROOD_RESERVE_MAX = 8;
/** Seconds after the wave's spawn lands before the reserve drops (a mid-wave beat). */
export const SWARM_BROOD_RESERVE_DELAY_S = 45;

/**
 * The specialist group a late wave holds back, or null when the wave keeps no
 * reserve: below the band, a champion wave (the boss is that room's pressure
 * story), or no eligible late family unlocked yet. `roll` is the caller's
 * deterministic stream (run seed + wave); exactly two draws — family, then size —
 * so the same (seed, wave) always fields the same reserve. Families carrying their
 * own hold-back machinery (`births`, `splits`) are ineligible: a reserve mother or
 * splitter would drop bodies the plan never budgeted. The seeded size is capped by
 * the family's authored cohort, so the group stays inside the family's own scale.
 */
export function swarmBroodLateReserve(wave, roll) {
  const w = Math.max(1, Math.trunc(Number(wave) || 1));
  if (w < SWARM_BROOD_RESERVE_FROM_WAVE) return null;
  if (isSwarmBossWave(w)) return null;
  const eligible = SWARM_BROOD_LATE_FAMILIES.filter(
    (fam) => w >= fam.fromWave && !fam.births && !fam.splits,
  );
  if (eligible.length === 0) return null;
  const draw = typeof roll === 'function' ? roll : () => 0.5;
  const family = eligible[Math.min(eligible.length - 1, Math.floor(draw() * eligible.length))];
  const authored = Math.max(1, Math.trunc(Number(family.cohort) || SWARM_BROOD_RESERVE_MAX));
  const count = Math.max(1, Math.min(
    authored,
    SWARM_BROOD_RESERVE_MIN
      + Math.floor(draw() * (SWARM_BROOD_RESERVE_MAX - SWARM_BROOD_RESERVE_MIN + 1)),
  ));
  return { familyId: family.id, count };
}

// ── The strain mark: waves 83+ hatch a cooked share of the fodder ──────────────
//
// Band 3's clock stops at 75 and the roster then runs silent until the wrapped
// champions at 140 — the last plateau. The flag matrix is also nearly spent: every
// composition left is a kill-gate mirror of a family already fielded (blastOnly+splits
// is the clutchstone's egg, massOnly+births is the poxsac's tide), so a fourth band
// would be padding. Instead the Hive stops inventing silhouettes and adulterates the
// flesh it already floods: from wave 83 a seeded share of the wave's MITE share hatches
// carrying a strain — the ship-side veteran-affix law (swarmThreats.js §6.4) moved onto
// the brood's own per-body buffers. One strain, one honored effect, one mark byte per
// body: 'volatile' pops where it dies — a small blast and a shove on the signature,
// never a kill on the pack — so the solved verb (sweep the fodder where it lands on
// your hull) is taxed for the rest of the run. Champion waves stay exempt — the boss
// is that room's pressure story, same law as the late reserve.

/** First wave a non-champion room may hatch marked fodder. */
export const SWARM_BROOD_STRAIN_FROM_WAVE = 83;
/** The marked share of the wave's mite row, seeded inside this band each wave. */
export const SWARM_BROOD_STRAIN_SHARE_MIN = 0.12;
export const SWARM_BROOD_STRAIN_SHARE_MAX = 0.22;
/** A wave that fields a strain always marks at least this many bodies (mite count permitting). */
export const SWARM_BROOD_STRAIN_MIN_MARKED = 6;

/**
 * The brood strain catalog — the veteran-affix vocabulary's brood half. `familyId` is
 * the carrier: which family's bodies may hatch marked (the strain rides the wave's
 * own planned bodies — it never adds one). `blastRadius`/`blastDamage`/`shoveDv` are
 * the volatile pop's authored size: a burst, never a kill on neighbouring cells —
 * the pop is the pilot's problem, not free crowd-clearing. `counter` is the slam-card
 * lesson at the debut; `tint` is the standing read on the field. A strain owns no
 * telegraph — the mark is a standing property, like the glassback's shell: the card
 * says it once, the colour keeps saying it.
 */
export const SWARM_BROOD_STRAINS = Object.freeze([
  Object.freeze({
    id: 'volatile',
    name: 'Volatile Brood',
    fromWave: SWARM_BROOD_STRAIN_FROM_WAVE,
    familyId: 'mite',
    blastRadius: 46,
    blastDamage: 5,
    shoveDv: 58,
    counter: 'The pale-hot mites pop where they die. Sweep the marked ones out there — never on your hull.',
    // The presentation tint the marked bodies burn toward — pale-hot over the mite's rust.
    tint: Object.freeze([1.0, 0.74, 0.22]),
  }),
]);

/**
 * The wave's strain pick, or null when the room hatches clean: below the gate, a
 * champion wave, or too few mites to mark. `miteCount` is the wave's planned mite row
 * AFTER every hold-back — the share is of the fodder that actually fields. Exactly
 * two draws (strain, then share) so the same (seed, wave) hatches the same mark.
 */
export function swarmBroodStrainFor(wave, miteCount, roll) {
  const w = Math.max(1, Math.trunc(Number(wave) || 1));
  if (isSwarmBossWave(w)) return null;
  const eligible = SWARM_BROOD_STRAINS.filter((strain) => w >= strain.fromWave);
  if (eligible.length === 0) return null;
  const mites = Math.max(0, Math.trunc(Number(miteCount) || 0));
  if (mites <= 1) return null;
  const draw = typeof roll === 'function' ? roll : () => 0.5;
  const strain = eligible[Math.min(eligible.length - 1, Math.floor(draw() * eligible.length))];
  const share = SWARM_BROOD_STRAIN_SHARE_MIN
    + draw() * (SWARM_BROOD_STRAIN_SHARE_MAX - SWARM_BROOD_STRAIN_SHARE_MIN);
  const count = Math.max(0, Math.min(
    mites - 1,
    Math.max(Math.min(mites - 1, SWARM_BROOD_STRAIN_MIN_MARKED), Math.round(mites * share)),
  ));
  if (count <= 0) return null;
  return { strain, count };
}

/** The strain row debuting on exactly this wave (the slam-card seam), or null. Pure. */
export function swarmBroodStrainDebutFor(wave) {
  const w = Math.max(1, Math.trunc(Number(wave) || 1));
  for (const strain of SWARM_BROOD_STRAINS) {
    if (strain.fromWave === w) return strain;
  }
  return null;
}

/** The strain row for an id, or null. Pure. */
export function swarmBroodStrainById(id) {
  if (typeof id !== 'string') return null;
  for (const strain of SWARM_BROOD_STRAINS) if (strain.id === id) return strain;
  return null;
}

/** The mark byte a strain writes into the per-slot affix buffer (1-based; 0 = unmarked). */
export function swarmBroodStrainMark(id) {
  const idx = SWARM_BROOD_STRAINS.findIndex((strain) => strain.id === id);
  return idx < 0 ? 0 : idx + 1;
}

/** Authoring check for the late table. Empty when honest. Does not touch the base table. */
export function swarmBroodLateIssues() {
  const issues = [];
  const seen = new Set(SWARM_BROOD_FAMILIES.map((row) => row.id));
  let prevWave = 0;
  for (const family of SWARM_BROOD_FAMILIES) {
    if (family && family.fromWave > prevWave) prevWave = family.fromWave;
  }
  SWARM_BROOD_LATE_FAMILIES.forEach((family, i) => {
    const path = `swarmBroodLateFamilies[${i}]`;
    if (!family || typeof family.id !== 'string' || !family.id) {
      issues.push({ path, message: 'family has no id' });
      return;
    }
    if (seen.has(family.id)) issues.push({ path, message: `duplicate family id ${family.id}` });
    seen.add(family.id);
    if (!(family.fromWave > prevWave)) {
      issues.push({ path, message: `${family.id} does not continue the roster clock` });
    }
    prevWave = family.fromWave;
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
  // The strain table: each row needs an id, a carrier family the roster actually
  // fields, and a counter like any debut. A telegraph is OPTIONAL — only a strain
  // with a real transition would speak (the mark itself is standing, like the
  // glassback's shell) — and honest blast numbers: a pop that kills the pack
  // would be free clearing, not a problem.
  const strainSeen = new Set();
  let strainPrevWave = 0;
  SWARM_BROOD_STRAINS.forEach((strain, i) => {
    const path = `swarmBroodStrains[${i}]`;
    if (!strain || typeof strain.id !== 'string' || !strain.id) {
      issues.push({ path, message: 'strain has no id' });
      return;
    }
    if (strainSeen.has(strain.id)) issues.push({ path, message: `duplicate strain id ${strain.id}` });
    strainSeen.add(strain.id);
    if (!(strain.fromWave > 0)) issues.push({ path, message: `${strain.id} has no fromWave` });
    // Same ten-clock law as the families: a debut on a champion row would deal the
    // card while the engine stamps nothing — the boss is that room's pressure story.
    if (isSwarmBossWave(strain.fromWave)) {
      issues.push({ path, message: `${strain.id} lands on a champion row` });
    }
    // A silhouette debut outranks the mark on the slam card — a strain sharing the
    // wave would debut silent. Give the strain its own wave so its counter speaks.
    const shadow = SWARM_BROOD_LATE_FAMILIES.some((family) => family.fromWave === strain.fromWave)
      || SWARM_BROOD_FAMILIES.some((family) => family.fromWave === strain.fromWave);
    if (shadow) issues.push({ path, message: `${strain.id} debuts under a family silhouette` });
    if (strain.fromWave < strainPrevWave) {
      issues.push({ path, message: `${strain.id} regresses the strain clock` });
    }
    strainPrevWave = Math.max(strainPrevWave, strain.fromWave);
    if (!seen.has(strain.familyId)) {
      issues.push({ path, message: `${strain.id} marks an unknown carrier family ${strain.familyId}` });
    }
    const tele = strain.telegraph;
    if (tele !== undefined
      && (!tele || typeof tele.bark !== 'string' || typeof tele.line !== 'string' || typeof tele.cue !== 'string'
        || !tele.bark || !tele.line || !tele.cue)) {
      issues.push({ path, message: `${strain.id} telegraph is not {bark,line,cue}` });
    }
    if (typeof strain.counter !== 'string' || strain.counter.length < 10) {
      issues.push({ path, message: `${strain.id} has no counter card line` });
    }
    if (strain.id === 'volatile') {
      if (!(strain.blastRadius > 0) || !(strain.blastDamage >= 0) || !(strain.shoveDv > 0)) {
        issues.push({ path, message: 'volatile needs a positive blast radius and shove' });
      }
      if (!Array.isArray(strain.tint) || strain.tint.length !== 3) {
        issues.push({ path, message: 'volatile needs a mark tint' });
      }
    }
  });
  return issues;
}
