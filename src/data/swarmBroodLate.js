// Late Brood families. The base roster in src/data/swarmBrood.js stays the early clock.
// This module is the continuation: each row is a light instanced body, budget-counted
// by folding its count out of the mite share. The engine merges the tables.

import {
  SWARM_BROOD_FAMILIES,
  SWARM_BROOD_QUEEN_ID,
  swarmBroodBossFor,
} from './swarmBrood.js';

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
  return issues;
}
