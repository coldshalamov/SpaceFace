// The Machine: the swarm's second faction (SWARM_EXPANSION §B2).
//
// The Brood is flesh — it flocks, hides, splits and floods. The Machine is the other thing
// the room fields: light metal bodies on the SAME population law, folded out of the same
// mite share as the late families, each row carrying one authored mechanism the engine
// (src/systems/swarmBrood.js) executes as flags — exactly like burrows/splits/births.
// Data only: no bus, no state, no RNG source but the stream the caller owns.
//
// THE FACTION'S READ
// ------------------
// Every Brood family is solved by the room's mass — throw the world at it. The Machine
// keeps that law but adds a second axis: its bodies are hostile to EVERYTHING, the pack
// included. A beam turret's sweep cuts the flock as happily as the hull, a sawblade
// carves mites off a ricochet, and a repair drone's rebuilds spend out of the wave's own
// budget — never a free body. The player who herds the Machine into the Brood gets the
// room working for them twice.
//
// DEBUT CLOCK
// -----------
// The roster-clock law is one new silhouette at a time, with each debut keeping its own
// slam card. The Brood's clock runs 1–23, the late band 19–75, the strains 83+; boss
// waves (every tenth) keep the champion's story clear. The Machine's seven debuts sit
// in the open waves between them — 26, 32, 38, 44, 52, 58, 64 — so the card always
// speaks and the population band never moves.

import {
  SWARM_BROOD_FAMILIES,
  SWARM_BROOD_QUEEN_ID,
  swarmBroodBossFor,
} from './swarmBrood.js';
import { SWARM_BROOD_LATE_FAMILIES } from './swarmBroodLate.js';
import { isSwarmBossWave } from './swarmMode.js';

export const SWARM_MACHINE_FAMILIES = Object.freeze([
  {
    id: 'formation_drone',
    name: 'Formation Drone',
    role: 'mass',
    fromWave: 26,
    weight: 2,
    cohort: 12,
    radius: 2.2,
    mass: 9,
    hull: 8,
    speed: 52,
    turn: 6,
    credits: 1,
    score: 14,
    telegraph: {
      bark: 'warn',
      line: 'The drone wing peels — a dive line is drawing on you.',
      cue: 'weapon_charge',
    },
    counter: 'They fly the pattern and peel one at a time. Sidestep the dive; the pass ends in a rock.',
    deathLeaves: 'a scrap plate (throwable)',
    remains: { kind: 'scrap_plate', name: 'Scrap plate', mass: 12, radius: 2.6 },
    bodyColor: [0.36, 0.42, 0.48],
    bodyEmissive: [0.10, 0.24, 0.30],
    // Tighter and flatter than the mite dart — stamped metal, not flesh.
    stretch: Object.freeze([0.85, 0.55, 1.05]),
    // `formation` bodies hold a squad anchor weave instead of the free seek; the peel
    // clock feeds one member at a time into the authored dive (a committed pass, same
    // dodge law as the charger's: sidestep and the rock gets the body).
    formation: true,
    squadSize: 6,
    peelEveryS: 2.4,
    dashRange: 130,
    dashWindupS: 0.7,
    dashSpeed: 150,
    dashDamage: 7,
    dashMaxS: 1.6,
    dashRecoverS: 0.9,
  },
  {
    id: 'sawblade',
    name: 'Sawblade',
    role: 'hazard',
    fromWave: 32,
    weight: 2,
    cohort: 4,
    radius: 3.4,
    mass: 34,
    hull: 40,
    speed: 60,
    turn: 0.8,
    credits: 4,
    score: 38,
    telegraph: {
      bark: 'warn',
      line: 'A sawblade is loose — it ricochets and it does not care what it cuts.',
      cue: 'engine_flare',
    },
    counter: 'It bounces off rocks and carves whatever it crosses — the pack included. Feed it the room, or feed the room to it.',
    deathLeaves: 'a spent blade (throwable)',
    remains: { kind: 'spent_blade', name: 'Spent blade', mass: 26, radius: 3.4 },
    bodyColor: [0.52, 0.50, 0.44],
    bodyEmissive: [0.30, 0.20, 0.05],
    // Flat wide disc — the blade reads spinning at any heading.
    stretch: Object.freeze([1.35, 0.35, 1.35]),
    // `bounces`: ballistic, no steering. Still rock reflects it; thrown mass still cracks
    // it (the mass law is for every body). At speed it plows the pack by the same relative-
    // velocity rule the whip uses — and it touches the hull for authored contact damage.
    bounces: true,
    bounceSpeed: 60,
    bounceBounds: 320,
    contactDamage: 18,
    contactCooldownS: 0.5,
  },
  {
    id: 'repair_drone',
    name: 'Repair Drone',
    role: 'support',
    fromWave: 38,
    weight: 2,
    cohort: 3,
    radius: 2.8,
    mass: 12,
    hull: 14,
    speed: 55,
    turn: 4.5,
    credits: 3,
    score: 30,
    telegraph: {
      bark: 'warn',
      line: 'The repair drone is channeling on the wreck — it is building.',
      cue: 'weapon_charge',
    },
    counter: 'It welds wreckage back into drones — out of the wave’s own budget. Kill the channel or spend the debris first.',
    deathLeaves: 'a drone hull (throwable)',
    remains: { kind: 'drone_hull', name: 'Drone hull', mass: 14, radius: 2.8 },
    bodyColor: [0.30, 0.40, 0.34],
    bodyEmissive: [0.08, 0.30, 0.18],
    stretch: Object.freeze([0.80, 0.60, 1.0]),
    // `repairs`: seeks a latched remain (the same bodies the whip throws), channels for
    // repairS inside repairRange, then consumes the remain and mints repairYieldId from
    // the wave's held-back machine reserve. No reserve, no free bodies — the budget law
    // the sacs and splitters already keep.
    repairs: true,
    repairRange: 14,
    repairS: 3,
    repairYieldId: 'formation_drone',
    repairBudget: 5,
  },
  {
    id: 'magnet_sentry',
    name: 'Magnet Sentry',
    role: 'control',
    fromWave: 44,
    weight: 2,
    cohort: 3,
    radius: 4,
    mass: 60,
    hull: 34,
    speed: 4,
    turn: 0.4,
    credits: 4,
    score: 36,
    telegraph: {
      bark: 'warn',
      line: 'The magnet sentry is planted — your shots bend onto it.',
      cue: 'weapon_charge',
    },
    counter: 'It eats every shot that passes near it. Aim wide, or crack it with mass — it cannot dodge a rock.',
    deathLeaves: 'a magnet core (heavy throwable)',
    remains: { kind: 'magnet_core', name: 'Magnet core', mass: 55, radius: 4.2, whipMult: 1.6 },
    bodyColor: [0.26, 0.30, 0.42],
    bodyEmissive: [0.10, 0.14, 0.40],
    stretch: Object.freeze([1.0, 0.9, 1.0]),
    // `rooted` plants the body at its rock face; `magnets` widens its catch circle to
    // magnetRadius against every projectile sweep, so the sentry commits shots that
    // would have flown past — it takes the hit itself. Plated plating it is not: shots
    // still crack it, mass cracks it faster.
    rooted: true,
    magnets: true,
    magnetRadius: 34,
  },
  {
    id: 'shield_linker',
    name: 'Shield Linker',
    role: 'support',
    fromWave: 52,
    weight: 2,
    cohort: 2,
    radius: 2.8,
    mass: 12,
    hull: 16,
    speed: 58,
    turn: 4.5,
    credits: 4,
    score: 36,
    telegraph: {
      bark: 'warn',
      line: 'The linker has a beam on a packmate — the shield is up.',
      cue: 'weapon_charge',
    },
    counter: 'Its beam shields whatever it touches. Throw something through the beam — or kill the linker.',
    deathLeaves: 'a link cell (throwable)',
    remains: { kind: 'link_cell', name: 'Link cell', mass: 12, radius: 2.6, splashRadius: 22 },
    bodyColor: [0.34, 0.30, 0.50],
    bodyEmissive: [0.20, 0.14, 0.44],
    stretch: Object.freeze([0.80, 0.65, 1.0]),
    // `linkShield`: pairs with the nearest unshielded body and beams a full kill-refusal
    // onto it — every cause refused, shots absorbed. The beam is the weak point: a thrown
    // body crossing the link breaks it for linkReformS; the linker itself is soft.
    linkShield: true,
    linkRange: 90,
    linkReformS: 7,
  },
  {
    id: 'assembler',
    name: 'Assembler',
    role: 'support',
    fromWave: 58,
    weight: 2,
    cohort: 1,
    radius: 4.2,
    mass: 40,
    hull: 30,
    speed: 24,
    turn: 2.0,
    credits: 5,
    score: 48,
    telegraph: {
      bark: 'warn',
      line: 'The assembler is feeding on the debris field — something is taking shape.',
      cue: 'weapon_charge',
    },
    counter: 'Five seconds over the wreckage and it mints a blade. Break the channel or clear the debris.',
    deathLeaves: 'an assembler shell (throwable)',
    remains: { kind: 'assembler_shell', name: 'Assembler shell', mass: 34, radius: 4.4 },
    bodyColor: [0.40, 0.34, 0.28],
    bodyEmissive: [0.30, 0.22, 0.06],
    stretch: Object.freeze([1.2, 0.8, 1.2]),
    // `assembles`: like repairs but heavier — it needs a debris cluster (assembleDebrisMin
    // remains inside assembleRange), channels assembleS, consumes the cluster and mints
    // assembleYieldId out of the same held-back reserve.
    assembles: true,
    assembleRange: 30,
    assembleDebrisMin: 2,
    assembleS: 5,
    assembleYieldId: 'sawblade',
    assembleBudget: 3,
  },
  {
    id: 'beam_turret',
    name: 'Beam Turret',
    role: 'reach',
    fromWave: 64,
    weight: 2,
    cohort: 2,
    radius: 4.4,
    mass: 70,
    hull: 46,
    speed: 4,
    turn: 0.4,
    credits: 6,
    score: 55,
    telegraph: {
      bark: 'warn',
      line: 'The turret is winding — a beam sweep is drawing across the room.',
      cue: 'weapon_charge',
    },
    counter: 'Its sweep arcs where you were. Move off the pivot — the beam cuts the pack as happily as you.',
    deathLeaves: 'a turret housing (heavy throwable)',
    remains: { kind: 'turret_housing', name: 'Turret housing', mass: 62, radius: 4.6, whipMult: 1.5 },
    bodyColor: [0.44, 0.38, 0.30],
    bodyEmissive: [0.40, 0.26, 0.06],
    stretch: Object.freeze([1.1, 0.9, 1.1]),
    // `rooted`+`beam`: planted on the nearest rock face. The windup draws the pivot and
    // arc for beamWindupS; the sweep walks a beamWidth edge from one arc end to the other
    // over beamSweepS, burning the hull it crosses and cutting pack cells by the room's
    // own 'terrain' law — credited only when the player's hand was already on the body.
    rooted: true,
    beam: true,
    beamRange: 130,
    beamArc: 1.7,
    beamWindupS: 1.2,
    beamSweepS: 1.0,
    beamDamage: 22,
    beamCooldownS: 4.2,
    beamWidth: 5,
  },
]);

/** The machine family def for an id, or null. Pure. */
export function swarmMachineFamily(id) {
  if (typeof id !== 'string') return null;
  for (const family of SWARM_MACHINE_FAMILIES) if (family.id === id) return family;
  return null;
}

/**
 * Replace mite count with machine families the wave has unlocked — the same law as
 * foldBroodLatePlan, run after it, so the two folds never race: late families spend
 * first, then the Machine spends what the late fold left. The plan total does not grow;
 * the queen's flood stays mites. Unknown plans pass through as a copy.
 */
export function foldMachinePlan(plan, wave) {
  const w = Math.max(1, Math.trunc(Number(wave) || 1));
  const copy = Array.isArray(plan)
    ? plan.map((part) => ({ id: part.id, count: part.count }))
    : [];
  if (swarmBroodBossFor(w) === SWARM_BROOD_QUEEN_ID) return copy;
  const legal = SWARM_MACHINE_FAMILIES.filter((fam) => w >= fam.fromWave);
  if (legal.length === 0) return copy;
  const mite = copy.find((part) => part.id === 'mite');
  if (!mite || !(mite.count > 1)) return copy;
  for (const fam of legal) {
    const room = mite.count - 1;
    if (room <= 0) break;
    const authored = Math.max(1, Math.trunc(Number(fam.cohort) || 6));
    const take = Math.min(room, authored);
    mite.count -= take;
    const row = copy.find((part) => part.id === fam.id);
    if (row) row.count += take;
    else copy.push({ id: fam.id, count: take });
  }
  return copy.filter((part) => part.count > 0);
}

/**
 * The bodies a machine wave holds back for its rebuild machinery — repairs and
 * assembles mint out of this reserve, never out of thin air. Same budget law as the
 * sac/splitter/mother hold-backs: the engine spends it out of the mite share at
 * prepareWave, so immediate plus minted never exceeds swarmBroodPopulation(wave).
 * Pure: given the folded plan, returns the count the wave should hold.
 */
export function swarmMachineReserveCount(plan) {
  let reserve = 0;
  if (!Array.isArray(plan)) return 0;
  for (const part of plan) {
    const fam = swarmMachineFamily(part && part.id);
    if (!fam) continue;
    const count = Math.max(0, Math.trunc(Number(part.count) || 0));
    if (fam.repairs) reserve += count * Math.max(1, Math.trunc(Number(fam.repairBudget) || 4));
    if (fam.assembles) reserve += count * Math.max(1, Math.trunc(Number(fam.assembleBudget) || 3));
  }
  return reserve;
}

/** Authoring check for the machine table. Empty when honest. */
export function swarmMachineIssues() {
  const issues = [];
  const seen = new Set();
  for (const row of SWARM_BROOD_FAMILIES) seen.add(row.id);
  for (const row of SWARM_BROOD_LATE_FAMILIES) seen.add(row.id);
  const occupiedWaves = new Set();
  for (const row of SWARM_BROOD_FAMILIES) occupiedWaves.add(row.fromWave);
  for (const row of SWARM_BROOD_LATE_FAMILIES) occupiedWaves.add(row.fromWave);
  let prevWave = 0;
  SWARM_MACHINE_FAMILIES.forEach((family, i) => {
    const path = `swarmMachineFamilies[${i}]`;
    if (!family || typeof family.id !== 'string' || !family.id) {
      issues.push({ path, message: 'family has no id' });
      return;
    }
    if (seen.has(family.id)) issues.push({ path, message: `duplicate family id ${family.id}` });
    seen.add(family.id);
    if (!(family.fromWave > 0)) {
      issues.push({ path, message: `${family.id} has no fromWave` });
    }
    // The Machine runs its own clock — debuts must be strictly ordered inside the
    // table and never share a card with a brood silhouette or a champion wave.
    if (family.fromWave <= prevWave) {
      issues.push({ path, message: `${family.id} regresses the machine clock` });
    }
    prevWave = Math.max(prevWave, family.fromWave);
    if (occupiedWaves.has(family.fromWave)) {
      issues.push({ path, message: `${family.id} debuts under a brood silhouette` });
    }
    if (isSwarmBossWave(family.fromWave)) {
      issues.push({ path, message: `${family.id} lands on a champion row` });
    }
    if (!(family.weight > 0)) issues.push({ path, message: `${family.id} has no composition weight` });
    if (!(family.cohort > 0)) issues.push({ path, message: `${family.id} has no cohort` });
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
    // Machine law: every family owns exactly one mechanism flag, and the flags carry
    // their own honest numbers.
    const flags = ['formation', 'bounces', 'repairs', 'magnets', 'linkShield', 'assembles', 'beam']
      .filter((flag) => family[flag] === true);
    if (flags.length !== 1) {
      issues.push({ path, message: `${family.id} must own exactly one machine flag (${flags.join(',') || 'none'})` });
    }
    if (family.formation) {
      if (!(family.squadSize >= 3)) issues.push({ path, message: `${family.id} squadSize under 3` });
      if (!(family.peelEveryS > 0)) issues.push({ path, message: `${family.id} has no peelEveryS` });
      if (!(family.dashSpeed > 0) || !(family.dashDamage > 0) || !(family.dashWindupS > 0)) {
        issues.push({ path, message: `${family.id} dive is not honestly authored` });
      }
    }
    if (family.bounces && !(family.bounceSpeed > 0 && family.bounceBounds > 0 && family.contactDamage > 0)) {
      issues.push({ path, message: `${family.id} bounce fields are not honestly authored` });
    }
    if (family.repairs) {
      if (!(family.repairRange > 0) || !(family.repairS > 0) || !(family.repairBudget > 0)) {
        issues.push({ path, message: `${family.id} repair fields are not honestly authored` });
      }
      if (!swarmMachineFamily(family.repairYieldId) && !seen.has(family.repairYieldId)) {
        issues.push({ path, message: `${family.id} repairYieldId names an unknown family` });
      }
    }
    if (family.assembles) {
      if (!(family.assembleRange > 0) || !(family.assembleDebrisMin >= 2)
        || !(family.assembleS > 0) || !(family.assembleBudget > 0)) {
        issues.push({ path, message: `${family.id} assemble fields are not honestly authored` });
      }
      if (!swarmMachineFamily(family.assembleYieldId) && !seen.has(family.assembleYieldId)) {
        issues.push({ path, message: `${family.id} assembleYieldId names an unknown family` });
      }
    }
    if (family.linkShield && !(family.linkRange > 0 && family.linkReformS > 0)) {
      issues.push({ path, message: `${family.id} link fields are not honestly authored` });
    }
    if (family.magnets && !(family.magnetRadius > family.radius)) {
      issues.push({ path, message: `${family.id} magnetRadius must exceed its body radius` });
    }
    if (family.beam && !(family.beamRange > 0 && family.beamArc > 0 && family.beamWindupS > 0
      && family.beamSweepS > 0 && family.beamDamage > 0 && family.beamCooldownS > 0 && family.beamWidth > 0)) {
      issues.push({ path, message: `${family.id} beam fields are not honestly authored` });
    }
    // A rooted body is planted — a speed stat above a crawl lies about the read.
    if ((family.rooted || family.magnets || family.beam) && !(family.rooted === true)) {
      issues.push({ path, message: `${family.id} beam/magnet bodies must be rooted` });
    }
    if (family.rooted && family.speed > 8) {
      issues.push({ path, message: `${family.id} is rooted but authors a cruise speed` });
    }
  });
  return issues;
}
