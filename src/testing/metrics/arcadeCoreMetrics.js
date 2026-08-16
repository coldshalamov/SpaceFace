// Arcade Core Layer-1 metric battery (design/arcade-core/09_VALIDATION.md).
//
// One owner for the plain numbers plan 09 names, so `check:arcade-core`, the lab oracle, and
// `_combatlab.html` all read the SAME computation instead of three copies of a formula. Every
// number here is derived from live production owners:
//
//   mass / hull / shield  -> src/data/enemies.js            (ENEMY_TYPES)
//   weapon                -> src/data/weapons.js            (WEAPONS)
//   weapon impulse        -> src/combat/impulseKernel.js    (resolveWeaponImpulseForHit)
//   field impulse         -> src/core/fields/fieldKernel.js (fieldRawAcceleration, couplingScale)
//                            src/data/fields.js             (FIELD_DEFS, FIELD_MAX_ACCEL)
//   reward burst          -> src/data/killRewards.js        (KILL_REWARD_RECIPES, rollKillRewardItems)
//   vacuum                -> src/systems/pickupAttraction.js(applyPickupAttraction, MAGNET_*)
//
// `overrides` everywhere is a BOUNDED IN-MEMORY candidate (the lab's slider state). It is never
// written back to source; the lab exports it and the controller lands the values in src/data/.
//
// Tolerance bands come from authored constants where they exist, and from explicit product
// boundaries where the plans require a threshold. The measured candidate never becomes its own
// passing band.

import { registerMetric } from '../lab/metricRegistry.js';
import { mulberry32, hash32 } from '../../core/rng.js';
import { COMMODITIES } from '../../data/commodities.js';
import { ENEMY_TYPES } from '../../data/enemies.js';
import { PLANET_SITE } from '../../data/planets.js';
import { WEAPONS } from '../../data/weapons.js';
import {
  KILL_REWARD_TIER_IDS,
  creditChipItemsOf,
  killRewardRecipeFor,
  materialItemsOf,
  rollKillRewardItems,
} from '../../data/killRewards.js';
import { FIELD_DEFS, FIELD_MAX_ACCEL } from '../../data/fields.js';
import { couplingScale, fieldRawAcceleration, normalizeField } from '../../core/fields/fieldKernel.js';
import { COLLISION_CONSEQUENCE_LIMITS, resolveWeaponImpulseForHit } from '../../combat/impulseKernel.js';
import {
  CHAIN_MULTIPLIER_CAP,
  KILL_CAUSE_IDS,
  KILL_ZONE_ATMOSPHERE_BURN,
  KILL_ZONE_WELL_INNER,
  chainMultiplierForDepth,
  classifyKillCause,
} from '../../combat/killCause.js';
import { overwhelmsAttitudeControl } from '../../combat/tumbleStatus.js';
import { arcadeIslandContactDelay } from '../../systems/encounterDirector.js';
import {
  _test as economyCycleTest,
  CYCLE_FACTOR_HI,
  CYCLE_FACTOR_LO,
  applyCycleToMid,
  createCycle,
  cycleFactorAt,
  maybeAdvanceRegime,
  predictPriceCurve,
} from '../../systems/economyCycles.js';
import {
  MAGNET_APPROACH_MAX,
  MAGNET_APPROACH_MIN,
  MAGNET_RANGE,
  applyPickupAttraction,
} from '../../systems/pickupAttraction.js';

const SIM_DT = 1 / 60;

/** Plan 09 "Physics kit" reference masses. */
export const ARCADE_REFERENCE_MASSES = Object.freeze([16, 60, 150]);

/** The fits a player actually opens an island with. */
export const STARTER_WEAPON_IDS = Object.freeze(['wpn_pulse_laser_s', 'wpn_autocannon_s']);

/** The classes the starter fit is paced against. */
export const PACING_ENEMY_IDS = Object.freeze([
  'mote_swarmer', 'wasp_swarmer', 'lancer_sniper', 'reaver_pirate',
]);

export const ARCADE_CORE_ROUTE_IDS = Object.freeze([
  'contact-ttk',
  'physics-kit',
  'reward-vacuum',
  'style-death',
  'pacing-composition',
  'market-atmosphere',
]);

const ENEMY_BY_ID = new Map(ENEMY_TYPES.map((enemy) => [enemy.id, enemy]));
const WEAPON_BY_ID = new Map(WEAPONS.map((weapon) => [weapon.id, weapon]));

export function arcadeEnemy(id) {
  const enemy = ENEMY_BY_ID.get(id);
  if (!enemy) throw new Error(`unknown enemy id: ${id}`);
  return enemy;
}

export function arcadeWeapon(id) {
  const weapon = WEAPON_BY_ID.get(id);
  if (!weapon) throw new Error(`unknown weapon id: ${id}`);
  return weapon;
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round4(n) {
  return Math.round((Number(n) || 0) * 1e4) / 1e4;
}

// ---------------------------------------------------------------------------------------------
// Contact / TTK route
// ---------------------------------------------------------------------------------------------

/**
 * Health a shot stack has to chew through. Same surface the shipped arcade-core pacing route
 * uses (shield + armor + hull); `overrides` is the lab's mass/hull/shield candidate.
 */
export function enemyEffectiveHealth(enemy, overrides = {}) {
  return num(overrides.shield, enemy.shield || 0)
    + num(overrides.armor, enemy.armor || 0)
    + num(overrides.hull, enemy.hull || 0);
}

/** Sustained perfect-hit damage per second for one weapon (hitscan beams author rof 0). */
export function weaponSustainedDps(weapon, overrides = {}) {
  const dmg = num(overrides.dmg, weapon.dmg || 0);
  const rof = num(overrides.rof, weapon.rof || 0);
  if (rof > 0) return dmg * rof;
  return num(overrides.dps, weapon.dps || 0);
}

/**
 * Perfect-hit time to kill, in seconds. `mounts` is how many copies of the weapon are fitted.
 * Returns Infinity when the fit cannot kill at all — a real, reportable pacing failure.
 */
export function computeTtk({ weaponId, enemyId, weaponOverrides = {}, enemyOverrides = {}, mounts = 1 } = {}) {
  const weapon = arcadeWeapon(weaponId);
  const enemy = arcadeEnemy(enemyId);
  const dps = weaponSustainedDps(weapon, weaponOverrides) * Math.max(1, Math.floor(mounts));
  const health = enemyEffectiveHealth(enemy, enemyOverrides);
  if (!(dps > 0)) return Infinity;
  return health / dps;
}

/** Shots (not seconds) a fit needs — the "Motes die in two starter hits" read. */
export function computeShotsToKill({ weaponId, enemyId, weaponOverrides = {}, enemyOverrides = {} } = {}) {
  const weapon = arcadeWeapon(weaponId);
  const dmg = num(weaponOverrides.dmg, weapon.dmg || 0);
  if (!(dmg > 0)) return Infinity;
  return Math.ceil(enemyEffectiveHealth(arcadeEnemy(enemyId), enemyOverrides) / dmg);
}

/** Plan 09 "TTK table (starter weapons x enemy classes)". */
export function computeTtkTable({
  weaponIds = STARTER_WEAPON_IDS,
  enemyIds = PACING_ENEMY_IDS,
  weaponOverrides = {},
  enemyOverrides = {},
  mounts = 1,
} = {}) {
  const rows = [];
  for (const weaponId of weaponIds) {
    for (const enemyId of enemyIds) {
      const ttk = computeTtk({
        weaponId,
        enemyId,
        mounts,
        weaponOverrides: weaponOverrides[weaponId] || {},
        enemyOverrides: enemyOverrides[enemyId] || {},
      });
      rows.push({
        weaponId,
        enemyId,
        ttkS: Number.isFinite(ttk) ? round4(ttk) : null,
        shots: computeShotsToKill({
          weaponId,
          enemyId,
          weaponOverrides: weaponOverrides[weaponId] || {},
          enemyOverrides: enemyOverrides[enemyId] || {},
        }),
      });
    }
  }
  return rows;
}

/**
 * Group pressure: incoming sustained DPS from `count` copies of one class, using each class's own
 * authored per-mount overrides. This is the "is a cloud a nibble or a wall" number.
 */
export function computeGroupPressure({ enemyId, count = 1, enemyOverrides = {} } = {}) {
  const enemy = arcadeEnemy(enemyId);
  const mounts = Array.isArray(enemy.weapons) ? enemy.weapons : [];
  let perShip = 0;
  for (const mount of mounts) {
    if (mount.defensiveOnly) continue;
    const weapon = WEAPON_BY_ID.get(mount.id);
    if (!weapon) continue;
    const copies = Math.max(1, Math.floor(num(mount.count, 1)));
    const dmg = num(mount.dmgOverride, weapon.dmg || 0);
    const rof = num(mount.rofOverride, weapon.rof || 0);
    const dps = rof > 0 ? dmg * rof : num(weapon.dps, 0);
    perShip += dps * copies * (mount.occasional ? 0.5 : 1);
  }
  const size = Math.max(0, Math.floor(num(enemyOverrides.count, count)));
  const targetHealth = num(enemyOverrides.targetHealth, 0);
  return {
    enemyId,
    count: size,
    perShipDps: round4(perShip),
    groupDps: round4(perShip * size),
    // Seconds a target of `targetHealth` survives the group's undivided attention.
    timeToKillPlayerS: targetHealth > 0 && perShip * size > 0
      ? round4(targetHealth / (perShip * size))
      : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Impulse / physics kit
// ---------------------------------------------------------------------------------------------

/**
 * Delta-v a deployed field delivers to a reference mass over one second at a sample radius,
 * through the real field kernel (falloff * coupling, clamped by FIELD_MAX_ACCEL).
 */
export function computeFieldDeltaV({
  fieldKey = 'well',
  mass = 16,
  sampleFraction = 0.4,
  seconds = 1,
  fieldOverrides = {},
  fieldResponseMult = 1,
  bodyType = 'ship',
} = {}) {
  const def = FIELD_DEFS[fieldKey];
  if (!def) throw new Error(`unknown field key: ${fieldKey}`);
  const field = normalizeField({
    ...def,
    center: { x: 0, z: 0 },
    dir: { x: 1, z: 0 },
    radius: num(fieldOverrides.radius, def.radius),
    strength: num(fieldOverrides.strength, def.strength),
    falloff: num(fieldOverrides.falloff, def.falloff),
    damping: num(fieldOverrides.damping, def.damping),
    durationS: 1,
    createdAt: 0,
  });
  const r = Math.max(0, Math.min(0.999, sampleFraction)) * field.radius;
  const raw = fieldRawAcceleration(field, r, 0, { ax: 0, az: 0 }, { x: 0, z: 0 });
  const couple = couplingScale({ type: bodyType, mass: num(mass, 16), fieldResponseMult });
  let ax = raw.ax * couple;
  let az = raw.az * couple;
  const mag = Math.hypot(ax, az);
  if (mag > FIELD_MAX_ACCEL) {
    const k = FIELD_MAX_ACCEL / mag;
    ax *= k; az *= k;
  }
  const accel = Math.hypot(ax, az);
  return {
    fieldKey,
    mass: num(mass, 16),
    sampleRadius: round4(r),
    coupling: round4(couple),
    accel: round4(accel),
    deltaV: round4(accel * Math.max(0, seconds)),
  };
}

/** Delta-v one weapon hit imparts, via the production impulse owner. */
export function computeWeaponHitDeltaV({ weaponId, mass = 16, damage = null, weaponOverrides = {} } = {}) {
  const weapon = arcadeWeapon(weaponId);
  const candidate = { ...weapon, ...weaponOverrides };
  const dmg = damage == null
    ? num(weaponOverrides.dmg, weapon.dmg || 0)
    : num(damage, num(weaponOverrides.dmg, weapon.dmg || 0));
  const impulse = resolveWeaponImpulseForHit(candidate, dmg);
  const m = Math.max(1e-6, num(mass, 16));
  return {
    weaponId,
    mass: num(mass, 16),
    magnitude: impulse ? round4(impulse.magnitude) : 0,
    tumbleTorque: impulse ? round4(impulse.tumbleTorque) : 0,
    provenance: impulse ? impulse.provenance : null,
    deltaV: impulse ? round4(impulse.magnitude / m) : 0,
  };
}

/** Plan 09 "delta-v delivered by each impulse source on reference masses (16 / 60 / 150)". */
export function computeImpulseTable({ masses = ARCADE_REFERENCE_MASSES, fieldOverrides = {}, seconds = 1 } = {}) {
  const rows = [];
  for (const fieldKey of ['well', 'repulsor', 'cone']) {
    for (const mass of masses) {
      rows.push(computeFieldDeltaV({
        fieldKey,
        mass,
        seconds,
        fieldOverrides: fieldOverrides[fieldKey] || {},
      }));
    }
  }
  return rows;
}

/** Reference-mass crossings for the authored setup weapon and field coupling ladder. */
export function computePhysicsKit({
  masses = ARCADE_REFERENCE_MASSES,
  weaponId = 'wpn_concussion_cannon_m',
  weaponOverrides = {},
  fieldOverrides = {},
} = {}) {
  const impulseTable = computeImpulseTable({ masses, fieldOverrides });
  const weaponRows = masses.map((mass) => computeWeaponHitDeltaV({
    weaponId, mass, weaponOverrides,
  }));
  const light = impulseTable.find((row) => row.fieldKey === 'well' && row.mass === masses[0]);
  const heavy = impulseTable.find((row) => row.fieldKey === 'well' && row.mass === masses[masses.length - 1]);
  return {
    impulseTable,
    weaponRows,
    tumbleCrossings: weaponRows.map((row) => ({
      mass: row.mass,
      deltaV: row.deltaV,
      tumbles: overwhelmsAttitudeControl(row.deltaV),
    })),
    lightHeavyCouplingRatio: light && heavy && heavy.coupling > 0
      ? round4(light.coupling / heavy.coupling)
      : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Style / death route
// ---------------------------------------------------------------------------------------------

const FABRICATED_KILL_CASES = Object.freeze([
  Object.freeze({ expected: 'ordinary', input: Object.freeze({ cause: 'kinetic' }) }),
  Object.freeze({ expected: 'terrain_smash', input: Object.freeze({
    cause: 'terrain_collision', tumbleState: Object.freeze({ victim: true }),
    impactVelocity: COLLISION_CONSEQUENCE_LIMITS.tumbleDeltaV,
  }) }),
  Object.freeze({ expected: 'chain', input: Object.freeze({
    cause: 'ship_collision', tumbleState: Object.freeze({ source: true }), chainDepth: 2,
  }) }),
  Object.freeze({ expected: 'well_collapse', input: Object.freeze({ zone: KILL_ZONE_WELL_INNER }) }),
  Object.freeze({ expected: 'burn_up', input: Object.freeze({ zone: KILL_ZONE_ATMOSPHERE_BURN }) }),
]);

export function computeStyleClassifier({ cases = FABRICATED_KILL_CASES, chainDepths = [1, 2, 3, 4] } = {}) {
  const classified = cases.map((entry) => {
    const style = classifyKillCause(entry.input);
    return { expected: entry.expected, actual: style.id, multiplier: style.multiplier };
  });
  const ladder = chainDepths.map((depth) => chainMultiplierForDepth(depth));
  const compounds = ladder.every((value, index) => index === 0 || value > ladder[index - 1]);
  return {
    classified,
    bucketAccuracy: classified.length
      ? round4(classified.filter((entry) => entry.actual === entry.expected).length / classified.length)
      : 0,
    coversEveryBucket: KILL_CAUSE_IDS.every((id) => classified.some((entry) => entry.actual === id)),
    ladder,
    chainCompounds: compounds,
    chainCap: chainMultiplierForDepth(99),
  };
}

// ---------------------------------------------------------------------------------------------
// Reward / vacuum route
// ---------------------------------------------------------------------------------------------

function tierVictim(tier) {
  if (tier === 'mote') return { id: 1, type: 'ship', data: { lootTableId: 'mote_swarmer', worldRecordId: 'battery-mote' } };
  if (tier === 'light') return { id: 2, type: 'ship', data: { shipClass: 'fighter', worldRecordId: 'battery-light' } };
  if (tier === 'medium') return { id: 3, type: 'ship', data: { shipClass: 'brawler', aiArchetype: 'brawler', worldRecordId: 'battery-medium' } };
  if (tier === 'heavy') return { id: 4, type: 'ship', data: { shipClass: 'gunship', worldRecordId: 'battery-heavy' } };
  return { id: 5, type: 'ship', data: { shipClass: 'fighter', namedAceId: 'ace_yara_no_cut', worldRecordId: 'battery-ace' } };
}

/** Pickup count a recipe promises before any roll — the band the burst must land inside. */
export function recipePickupCount(recipe) {
  const materials = (recipe.materials || []).reduce((sum, line) => sum + Math.max(0, Math.floor(line.pickups || 0)), 0);
  const chips = Math.max(0, Math.floor((recipe.creditChips && recipe.creditChips.count) || 0));
  return { materials, chips, total: materials + chips };
}

/**
 * Plan 09 "pickups spawned per kill by victim class" + "credit/material values vs data-table
 * bands", rolled through the live reward owner on a seeded victim-local stream.
 */
export function computeRewardBurst({ tier = 'light', seed = 0x47a, victim = null } = {}) {
  const target = victim || tierVictim(tier);
  const recipe = killRewardRecipeFor(target);
  const rng = mulberry32(hash32(seed, recipe.id, 'arcade-core-battery'));
  const items = rollKillRewardItems(rng, target);
  const materials = materialItemsOf(items);
  const chips = creditChipItemsOf(items);
  const promised = recipePickupCount(recipe);
  const chipCredits = chips.reduce((sum, chip) => sum + Number(chip.credits || 0), 0);
  const spec = recipe.creditChips || { amountMin: 0, amountMax: 0, count: 0 };
  return {
    tier: recipe.id,
    pickups: items.length,
    materialPickups: materials.length,
    chipPickups: chips.length,
    promisedPickups: promised.total,
    chipCredits,
    chipCreditsMin: spec.amountMin * spec.count,
    chipCreditsMax: spec.amountMax * spec.count,
    materialQtyTotal: materials.reduce((sum, item) => sum + Number(item.qty || 0), 0),
  };
}

export function computeRewardTable({ tiers = KILL_REWARD_TIER_IDS, seed = 0x47a } = {}) {
  return tiers.map((tier) => computeRewardBurst({ tier, seed }));
}

/**
 * Vacuum route. Integrates the REAL `applyPickupAttraction` step at sim dt and reports when the
 * magnet engages and when the pickup reaches the collect radius. `lateral` offsets the pickup off
 * the flight line so a moving player measures fly-over collection instead of a head-on suck.
 */
export function computeVacuumProfile({
  distance = MAGNET_RANGE,
  lateral = 0,
  magnetRange = MAGNET_RANGE,
  collectRadius = 22,
  playerSpeed = 0,
  maxSeconds = 12,
  dt = SIM_DT,
} = {}) {
  const player = { pos: { x: 0, z: 0 }, vel: { x: playerSpeed, z: 0 } };
  const pickup = { type: 'pickup', pos: { x: distance, z: lateral }, vel: { x: 0, z: 0 }, data: { kind: 'ore' } };
  const ticks = Math.max(1, Math.ceil(maxSeconds / dt));
  let onsetS = null;
  let captureS = null;
  let minDistance = Infinity;

  for (let tick = 0; tick < ticks; tick++) {
    const dx = player.pos.x - pickup.pos.x;
    const dz = player.pos.z - pickup.pos.z;
    const d = Math.hypot(dx, dz);
    minDistance = Math.min(minDistance, d);
    if (d <= collectRadius) { captureS = tick * dt; break; }
    const engaged = applyPickupAttraction(pickup, player, dt, magnetRange, collectRadius, dx, dz, d);
    if (engaged && onsetS == null) onsetS = tick * dt;
    pickup.pos.x += pickup.vel.x * dt;
    pickup.pos.z += pickup.vel.z * dt;
    player.pos.x += player.vel.x * dt;
    player.pos.z += player.vel.z * dt;
  }

  return {
    distance,
    lateral,
    magnetRange,
    playerSpeed,
    onsetS: onsetS == null ? null : round4(onsetS),
    captureS: captureS == null ? null : round4(captureS),
    captured: captureS != null,
    minDistance: round4(minDistance),
  };
}

/**
 * Plan 09 "% collected under fly-over steering". The fan sits AHEAD of the player (`lead` along
 * the flight line) at lateral offsets expressed as fractions of the magnet radius, so the run
 * measures sweep-up inside the authored radius rather than whether the radius reaches the fan.
 */
export const FLYOVER_LATERAL_FRACTIONS = Object.freeze([0, 0.15, 0.3, 0.45, 0.6, 0.75]);

export function computeFlyoverCollection({
  playerSpeed = 140,
  lead = 300,
  lateralFractions = FLYOVER_LATERAL_FRACTIONS,
  magnetRange = MAGNET_RANGE,
  collectRadius = 22,
  maxSeconds = 12,
} = {}) {
  const runs = lateralFractions.map((fraction) => computeVacuumProfile({
    distance: lead,
    lateral: Math.round(fraction * magnetRange),
    magnetRange,
    collectRadius,
    playerSpeed,
    maxSeconds,
  }));
  const captured = runs.filter((run) => run.captured).length;
  return {
    playerSpeed,
    runs,
    collectedFraction: runs.length ? round4(captured / runs.length) : 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Pacing / composition route
// ---------------------------------------------------------------------------------------------

/**
 * Fast lab projection for the pacing sliders. This is deliberately not acceptance evidence; the
 * production battery consumes measureArcadeCorePacingRoute() instead.
 */
export function computePacingMinute({
  seed = 10010,
  weaponId = 'wpn_pulse_laser_s',
  enemyId = 'wasp_swarmer',
  sectorId = 'sector_ceres_belt',
  zoneId = 'zone_ceres_belt',
  reacquireS = 0.5,
  weaponOverrides = {},
  enemyOverrides = {},
} = {}) {
  const firstContactS = arcadeIslandContactDelay(seed, sectorId, zoneId, 0);
  const ttkS = computeTtk({ weaponId, enemyId, weaponOverrides, enemyOverrides });
  const cycleS = ttkS + Math.max(0, num(reacquireS, 0.5));
  const kills = Number.isFinite(cycleS) && cycleS > 0
    ? Math.max(0, Math.floor((60 - firstContactS) / cycleS))
    : 0;
  let credits = 0;
  for (let kill = 0; kill < kills; kill++) {
    credits += computeRewardBurst({ tier: 'light', seed: hash32(seed, kill, 'pacing-minute') }).chipCredits;
  }
  return {
    seed,
    firstContactS: round4(firstContactS),
    ttkS: Number.isFinite(ttkS) ? round4(ttkS) : null,
    killsPerMinute: kills,
    creditsPerMinute: credits,
  };
}

function summarizePacingReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object') return null;
  const seeds = Array.isArray(receipt.seeds) ? receipt.seeds : [];
  return {
    source: 'production-route',
    firstContactS: Number(receipt.timeToFirstContactS),
    killsPerMinute: Number(receipt.killsPerMinute),
    creditsPerMinute: Number(receipt.creditsPerMinute),
    survivalRate: Number(receipt.survivalRate),
    wingsPerSeed: seeds.length ? Number(receipt.wingsCompleted) / seeds.length : null,
    receipt,
  };
}

// ---------------------------------------------------------------------------------------------
// Market / atmosphere route
// ---------------------------------------------------------------------------------------------

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

/** Numeric versions of plan 06 continuity, smoothness, learnability, and blend checks. */
export function computeMarketScores({ seed = 0x6ac, sampleS = 600, stepS = 5, transitionCount = 1000 } = {}) {
  let maxDelta = 0;
  let maxSecondDelta = 0;
  const forecastErrors = [];
  const commodityRows = [];
  const definitions = COMMODITIES.filter((entry) => entry && entry.id && entry.basePrice > 0);

  for (const def of definitions) {
    const rng = mulberry32(hash32(seed, def.id, 'market-series'));
    const cycle = createCycle(rng, def, 0);
    cycle.cmdtyId = def.id;
    const samples = [];
    for (let t = 0; t <= sampleS; t += stepS) samples.push(cycleFactorAt(cycle, t));
    for (let index = 1; index < samples.length; index++) {
      maxDelta = Math.max(maxDelta, Math.abs(samples[index] - samples[index - 1]));
    }
    for (let index = 2; index < samples.length; index++) {
      maxSecondDelta = Math.max(maxSecondDelta,
        Math.abs(samples[index] - 2 * samples[index - 1] + samples[index - 2]));
    }

    const stock = 100;
    const state = {
      simTime: sampleS,
      economy: {
        cycles: { station_battery: { [def.id]: cycle } },
        markets: { station_battery: { [def.id]: { stock, baseEq: stock, demandMult: 1 } } },
      },
    };
    const forecast = predictPriceCurve(state, 'station_battery', def.id, 24, stepS);
    for (const point of forecast) {
      const actual = Math.max(1, Math.round(applyCycleToMid(def.basePrice, def.basePrice, cycle, point.t)));
      forecastErrors.push(Math.abs(point.mid - actual) / actual);
    }
    commodityRows.push({ id: def.id, regime: cycle.regime, samples: samples.length });
  }

  let maxBlendJump = 0;
  let blendBoundsOk = true;
  for (let index = 0; index < Math.max(1, Math.floor(transitionCount)); index++) {
    const def = definitions[index % definitions.length];
    const rng = mulberry32(hash32(seed, def.id, index, 'market-transition'));
    const old = createCycle(rng, def, 0);
    old.cmdtyId = def.id;
    const transitionAt = old.regimeEndT;
    const next = maybeAdvanceRegime(old, rng, transitionAt);
    maxBlendJump = Math.max(maxBlendJump,
      Math.abs(cycleFactorAt(next, transitionAt) - cycleFactorAt(old, transitionAt)));
    const blendS = Number(next.blendEndT) - Number(next.blendStartT);
    if (!(blendS >= economyCycleTest.REGIME_BLEND_MIN_S
      && blendS <= economyCycleTest.REGIME_BLEND_MAX_S)) blendBoundsOk = false;
  }

  const forecastMedianRelativeError = median(forecastErrors) ?? 1;
  const authoredFactorSpan = Math.max(1e-9, CYCLE_FACTOR_HI - CYCLE_FACTOR_LO);
  return {
    continuityScore: round4(clamp01(1 - maxDelta / authoredFactorSpan)),
    smoothnessScore: round4(clamp01(1 - maxSecondDelta / authoredFactorSpan)),
    learnabilityScore: round4(clamp01(1 - forecastMedianRelativeError / 0.15)),
    maxDelta: round4(maxDelta),
    maxSecondDelta: round4(maxSecondDelta),
    forecastMedianRelativeError: round4(forecastMedianRelativeError),
    maxBlendJump: round4(maxBlendJump),
    blendBoundsOk,
    transitionCount: Math.max(1, Math.floor(transitionCount)),
    commodityRows,
  };
}

/**
 * Fast analytic projection for lab sliders. This never substitutes for the production
 * flightV3 → fields → planetRuntime → physics route used by the acceptance battery.
 */
export function computeAtmosphereOutcomes({
  entryVelocities = [80, 140, 220],
  referenceHull = 45,
  assistAccel = PLANET_SITE.recovery.assistAccel,
} = {}) {
  const p = PLANET_SITE.plunge;
  const bandWidth = PLANET_SITE.bands.skim - PLANET_SITE.bands.danger;
  const cases = [];
  for (const entryVelocityRaw of entryVelocities) {
    const entryVelocity = Math.max(1, num(entryVelocityRaw, 1));
    const escapeDistance = entryVelocity * p.regressS + 0.5 * Math.max(0, assistAccel) * p.regressS ** 2;
    cases.push({
      control: 'full-burn',
      entryVelocity,
      outcome: escapeDistance >= bandWidth ? 'escape' : 'burn',
      escapeDistance: round4(escapeDistance),
    });

    const timeToDescent = (PLANET_SITE.bands.danger - p.descentRadius) / entryVelocity;
    const timeToBreakup = p.breakupHeat / PLANET_SITE.heat.reentryRate;
    const burnS = Math.max(timeToDescent, timeToBreakup) + Math.max(0, referenceHull) / p.descentDps;
    cases.push({
      control: 'tumbling',
      entryVelocity,
      outcome: 'burn',
      burnS: round4(burnS),
    });
  }
  const controlled = cases.filter((entry) => entry.control === 'full-burn');
  const tumbling = cases.filter((entry) => entry.control === 'tumbling');
  return {
    cases,
    controlledEscapeFraction: controlled.length
      ? round4(controlled.filter((entry) => entry.outcome === 'escape').length / controlled.length)
      : 0,
    tumblingBurnFraction: tumbling.length
      ? round4(tumbling.filter((entry) => entry.outcome === 'burn').length / tumbling.length)
      : 0,
    tumblingBurnMedianS: round4(median(tumbling.map((entry) => entry.burnS)) ?? 0),
  };
}

function summarizeAtmosphereReceipt(receipt) {
  if (!receipt || !Array.isArray(receipt.cases)) return null;
  const controlled = receipt.cases.filter((entry) => entry.control === 'full-burn');
  const tumbling = receipt.cases.filter((entry) => entry.control === 'uncontrolled');
  return {
    source: 'production-route',
    cases: receipt.cases,
    controlledEscapeFraction: controlled.length
      ? round4(controlled.filter((entry) => entry.outcome === 'escape' && entry.finalHull > 0).length / controlled.length)
      : null,
    tumblingBurnFraction: tumbling.length
      ? round4(tumbling.filter((entry) => entry.outcome === 'burn').length / tumbling.length)
      : null,
    tumblingBurnMedianS: tumbling.length
      ? round4(median(tumbling.map((entry) => entry.burnS).filter(Number.isFinite)) ?? 0)
      : null,
    receipt,
  };
}

// ---------------------------------------------------------------------------------------------
// Tolerance bands — derived from the authored constants, never from a measured candidate.
// ---------------------------------------------------------------------------------------------

const MOTE_PER_MOUNT_DPS_CAP = 1;      // shipped contract: one Mote is a shield nibble
const MOTE_CLOUD_MAX = 14;             // shipped contract: tier-1 cloud is 8-14
const STARTER_MOTE_MAX_SHOTS = 2;      // shipped contract: Motes die in two starter hits

export const ARCADE_CORE_BANDS = Object.freeze({
  'contact.ttk.pulseVsWasp': Object.freeze({
    op: 'range', min: 2, max: 4,
    why: 'starter Pulse Laser vs Wasp is the pacing anchor (2-4 s perfect-hit)',
  }),
  'contact.shots.pulseVsMote': Object.freeze({
    op: '<=', value: STARTER_MOTE_MAX_SHOTS,
    why: 'a Mote must fall inside two starter trigger pulls',
  }),
  'contact.ttk.starterFitMax': Object.freeze({
    op: '<=', value: 12,
    why: 'no starter weapon x paced class may exceed a 12 s perfect-hit grind',
  }),
  'contact.groupDps.moteCloud': Object.freeze({
    op: '<=', value: MOTE_PER_MOUNT_DPS_CAP * MOTE_CLOUD_MAX,
    why: 'the largest admitted Mote cloud stays inside per-mount nibble cap x max cloud size',
  }),
  'physics.deltaV.allFinite': Object.freeze({
    op: '==', value: 1,
    why: 'every authored field source reports a finite delta-v on all three reference masses',
  }),
  'physics.tumble.light': Object.freeze({
    op: '==', value: 1,
    why: 'one authored concussion hit crosses the shared tumble threshold on mass 16',
  }),
  'physics.tumble.heavy': Object.freeze({
    op: '==', value: 0,
    why: 'the same concussion hit does not erase the mass-150 heavy-hull shrug',
  }),
  'physics.coupling.lightHeavyRatio': Object.freeze({
    op: 'range', min: 5, max: 12,
    why: 'field coupling keeps a strong but bounded light-vs-heavy distinction',
  }),
  'reward.pickups.mote': Object.freeze({
    op: '==', value: 1,
    why: 'a Mote erupts exactly one physical pickup',
  }),
  'reward.pickupsMatchRecipe': Object.freeze({
    op: '==', value: 1,
    why: 'every tier rolls at least the pickup count its recipe promises (cargo spill may add)',
  }),
  'reward.creditsInBand': Object.freeze({
    op: '==', value: 1,
    why: 'rolled chip credits stay inside the recipe amountMin/amountMax table',
  }),
  'vacuum.onsetS': Object.freeze({
    op: '<=', value: SIM_DT * 2,
    why: 'a pickup sitting at the magnet radius engages on the entry tick',
  }),
  'vacuum.captureS': Object.freeze({
    op: 'range',
    min: MAGNET_RANGE / MAGNET_APPROACH_MAX,
    max: MAGNET_RANGE / MAGNET_APPROACH_MIN,
    why: 'closing the full magnet radius is bounded by the authored approach-speed ramp',
  }),
  'vacuum.flyoverCollected': Object.freeze({
    op: '>=', value: 0.5,
    why: 'at least half a lateral fan inside the magnet radius is swept up in one pass',
  }),
  'style.bucketAccuracy': Object.freeze({
    op: '==', value: 1,
    why: 'fabricated physical death truth resolves to every authored cause bucket',
  }),
  'style.chainCompounds': Object.freeze({
    op: '==', value: 1,
    why: 'successive physical chain links compound before the authored ceiling',
  }),
  'style.chainCap': Object.freeze({
    op: '==', value: CHAIN_MULTIPLIER_CAP,
    why: 'chain compounding stops at the single authored payout ceiling',
  }),
  'pacing.firstContactS': Object.freeze({
    op: 'range', min: 6, max: 20,
    why: 'a populated-island contact lands inside the accepted entry window and deadline',
  }),
  'pacing.killsPerMinute': Object.freeze({
    op: 'range', min: 2, max: 6,
    why: 'three minimum-size wings remain a brisk multi-minute fight without becoming bounty-farm churn',
  }),
  'pacing.creditsPerMinute': Object.freeze({
    op: 'range', min: 250, max: 900,
    why: 'one combat minute pays materially more than a full starter repair while remaining below a trivial hull-upgrade farm',
  }),
  'pacing.survivalRate': Object.freeze({
    op: '==', value: 1,
    why: 'the scripted competent starter pilot survives every measured route seed',
  }),
  'pacing.wingsPerSeed': Object.freeze({
    op: '>=', value: 3,
    why: 'the starter pilot clears at least three physical wings per route seed',
  }),
  'market.maxFactorDelta': Object.freeze({
    op: '<=', value: 0.04,
    why: 'five-second chart samples move by at most four factor points inside a regime',
  }),
  'market.maxFactorSecondDelta': Object.freeze({
    op: '<=', value: 0.01,
    why: 'charted curvature stays below one factor point per five-second sample',
  }),
  'market.forecastMedianRelativeError': Object.freeze({
    op: '<=', value: 0.15,
    why: 'the projected mid stays within fifteen percent median relative error while the regime holds',
  }),
  'market.blendJump': Object.freeze({
    op: '==', value: 0,
    why: 'seeded regime transitions begin at the exact old curve value',
  }),
  'market.blendBounds': Object.freeze({
    op: '==', value: 1,
    why: 'every seeded transition stays in the authored two-to-five-minute blend window',
  }),
  'atmosphere.controlledEscape': Object.freeze({
    op: '==', value: 1,
    why: 'a conscious full-burn reference ship clears the middle band at every reference entry speed',
  }),
  'atmosphere.tumblingBurn': Object.freeze({
    op: '==', value: 1,
    why: 'the same reference entries are terminal without attitude control',
  }),
  'atmosphere.tumblingBurnS': Object.freeze({
    op: 'range', min: 3, max: 6,
    why: 'the authored tumbling-to-burn envelope preserves the three-to-six-second show',
  }),
});

function bandOk(band, value) {
  if (!band) return false;
  if (band.op === 'calibration') return false;
  if (value == null || !Number.isFinite(value)) return false;
  if (band.op === '<=') return value <= band.value;
  if (band.op === '>=') return value >= band.value;
  if (band.op === '==') return Math.abs(value - band.value) <= 1e-9;
  if (band.op === 'range') return value >= band.min && value <= band.max;
  return false;
}

/**
 * The whole Layer-1 battery for all six route families, as plain numbers with their bands.
 * Runtime-dependent pacing and atmosphere claims must arrive as receipts from their real async
 * routes. Omitting them fails closed instead of replacing gameplay with arithmetic.
 */
export function evaluateArcadeCoreBattery(overrides = {}, runtimeReceipts = {}) {
  const weaponOverrides = overrides.weapons || {};
  const enemyOverrides = overrides.enemies || {};
  const fieldOverrides = overrides.fields || {};
  const vacuum = overrides.vacuum || {};
  const physicsOverrides = overrides.physics || {};
  const styleOverrides = overrides.style || {};
  const pacingOverrides = overrides.pacing || {};
  const marketOverrides = overrides.market || {};
  const atmosphereOverrides = overrides.atmosphere || {};
  const magnetRange = num(vacuum.magnetRange, MAGNET_RANGE);
  const collectRadius = num(vacuum.collectRadius, 22);

  const ttkTable = computeTtkTable({ weaponOverrides, enemyOverrides });
  const finiteTtk = ttkTable.filter((row) => row.ttkS != null).map((row) => row.ttkS);
  const pulseVsWasp = computeTtk({
    weaponId: 'wpn_pulse_laser_s',
    enemyId: 'wasp_swarmer',
    weaponOverrides: weaponOverrides.wpn_pulse_laser_s || {},
    enemyOverrides: enemyOverrides.wasp_swarmer || {},
  });
  const moteShots = computeShotsToKill({
    weaponId: 'wpn_pulse_laser_s',
    enemyId: 'mote_swarmer',
    weaponOverrides: weaponOverrides.wpn_pulse_laser_s || {},
    enemyOverrides: enemyOverrides.mote_swarmer || {},
  });
  const moteCloud = computeGroupPressure({
    enemyId: 'mote_swarmer',
    count: num(overrides.groupSize, MOTE_CLOUD_MAX),
    enemyOverrides: { targetHealth: num(overrides.playerHealth, 200) },
  });

  const rewardTable = computeRewardTable({ seed: num(overrides.seed, 0x47a) });
  const moteReward = rewardTable.find((row) => row.tier === 'mote');
  const pickupsMatch = rewardTable.every((row) => row.pickups >= row.promisedPickups) ? 1 : 0;
  const creditsInBand = rewardTable.every((row) => (
    row.chipCredits >= row.chipCreditsMin && row.chipCredits <= row.chipCreditsMax
  )) ? 1 : 0;

  const edge = computeVacuumProfile({
    distance: magnetRange, magnetRange, collectRadius, playerSpeed: 0,
  });
  const flyover = computeFlyoverCollection({
    lead: num(vacuum.lead, Math.min(300, magnetRange)),
    magnetRange,
    collectRadius,
    playerSpeed: num(vacuum.playerSpeed, 140),
  });
  const physicsKit = computePhysicsKit({
    fieldOverrides,
    weaponOverrides: weaponOverrides.wpn_concussion_cannon_m || {},
    ...physicsOverrides,
  });
  const style = computeStyleClassifier(styleOverrides);
  const pacingProjection = computePacingMinute({
    weaponOverrides: weaponOverrides.wpn_pulse_laser_s || {},
    enemyOverrides: enemyOverrides.wasp_swarmer || {},
    seed: num(overrides.seed, 10010),
    ...pacingOverrides,
  });
  const market = computeMarketScores({ seed: num(overrides.seed, 0x6ac), ...marketOverrides });
  const atmosphereProjection = computeAtmosphereOutcomes(atmosphereOverrides);
  const pacing = runtimeReceipts.mode === 'projection'
    ? { ...pacingProjection, source: 'lab-projection', survivalRate: null, wingsPerSeed: null }
    : summarizePacingReceipt(runtimeReceipts.pacing);
  const atmosphere = runtimeReceipts.mode === 'projection'
    ? { ...atmosphereProjection, source: 'lab-projection' }
    : summarizeAtmosphereReceipt(runtimeReceipts.atmosphere);
  const lightCrossing = physicsKit.tumbleCrossings.find((entry) => entry.mass === ARCADE_REFERENCE_MASSES[0]);
  const heavyCrossing = physicsKit.tumbleCrossings.find((entry) => entry.mass === ARCADE_REFERENCE_MASSES.at(-1));

  const values = {
    'contact.ttk.pulseVsWasp': Number.isFinite(pulseVsWasp) ? round4(pulseVsWasp) : null,
    'contact.shots.pulseVsMote': Number.isFinite(moteShots) ? moteShots : null,
    'contact.ttk.starterFitMax': finiteTtk.length === ttkTable.length ? round4(Math.max(...finiteTtk)) : null,
    'contact.groupDps.moteCloud': moteCloud.groupDps,
    'physics.deltaV.allFinite': physicsKit.impulseTable.every((row) => Number.isFinite(row.deltaV)) ? 1 : 0,
    'physics.tumble.light': lightCrossing && lightCrossing.tumbles ? 1 : 0,
    'physics.tumble.heavy': heavyCrossing && heavyCrossing.tumbles ? 1 : 0,
    'physics.coupling.lightHeavyRatio': physicsKit.lightHeavyCouplingRatio,
    'reward.pickups.mote': moteReward ? moteReward.pickups : null,
    'reward.pickupsMatchRecipe': pickupsMatch,
    'reward.creditsInBand': creditsInBand,
    'vacuum.onsetS': edge.onsetS,
    'vacuum.captureS': edge.captureS,
    'vacuum.flyoverCollected': flyover.collectedFraction,
    'style.bucketAccuracy': style.bucketAccuracy,
    'style.chainCompounds': style.chainCompounds ? 1 : 0,
    'style.chainCap': style.chainCap,
    'pacing.firstContactS': pacing?.firstContactS ?? null,
    'pacing.killsPerMinute': pacing?.killsPerMinute ?? null,
    'pacing.creditsPerMinute': pacing?.creditsPerMinute ?? null,
    'pacing.survivalRate': pacing?.survivalRate ?? null,
    'pacing.wingsPerSeed': pacing?.wingsPerSeed ?? null,
    'market.maxFactorDelta': market.maxDelta,
    'market.maxFactorSecondDelta': market.maxSecondDelta,
    'market.forecastMedianRelativeError': market.forecastMedianRelativeError,
    'market.blendJump': market.maxBlendJump,
    'market.blendBounds': market.blendBoundsOk ? 1 : 0,
    'atmosphere.controlledEscape': atmosphere?.controlledEscapeFraction ?? null,
    'atmosphere.tumblingBurn': atmosphere?.tumblingBurnFraction ?? null,
    'atmosphere.tumblingBurnS': atmosphere?.tumblingBurnMedianS ?? null,
  };

  const routes = {
    'contact-ttk': [
      'contact.ttk.pulseVsWasp',
      'contact.shots.pulseVsMote',
      'contact.ttk.starterFitMax',
      'contact.groupDps.moteCloud',
    ],
    'physics-kit': [
      'physics.deltaV.allFinite',
      'physics.tumble.light',
      'physics.tumble.heavy',
      'physics.coupling.lightHeavyRatio',
    ],
    'reward-vacuum': [
      'reward.pickups.mote',
      'reward.pickupsMatchRecipe',
      'reward.creditsInBand',
      'vacuum.onsetS',
      'vacuum.captureS',
      'vacuum.flyoverCollected',
    ],
    'style-death': [
      'style.bucketAccuracy',
      'style.chainCompounds',
      'style.chainCap',
    ],
    'pacing-composition': [
      'pacing.firstContactS',
      'pacing.killsPerMinute',
      'pacing.creditsPerMinute',
      'pacing.survivalRate',
      'pacing.wingsPerSeed',
    ],
    'market-atmosphere': [
      'market.maxFactorDelta',
      'market.maxFactorSecondDelta',
      'market.forecastMedianRelativeError',
      'market.blendJump',
      'market.blendBounds',
      'atmosphere.controlledEscape',
      'atmosphere.tumblingBurn',
      'atmosphere.tumblingBurnS',
    ],
  };

  const results = [];
  for (const [route, keys] of Object.entries(routes)) {
    for (const key of keys) {
      const band = ARCADE_CORE_BANDS[key];
      const calibrationOpen = band?.op === 'calibration';
      const passes = calibrationOpen ? null : bandOk(band, values[key]);
      results.push({
        route,
        metric: key,
        value: values[key],
        band,
        ok: passes,
        status: calibrationOpen ? 'open' : passes ? 'pass' : 'fail',
      });
    }
  }

  const failures = results.filter((row) => row.status === 'fail');
  const calibrationOpen = results.filter((row) => row.status === 'open');

  return {
    schema: 'spaceface.arcadeCoreBattery.v1',
    ok: failures.length === 0 && calibrationOpen.length === 0,
    regressionsOk: failures.length === 0,
    values,
    results,
    failures,
    calibrationOpen,
    detail: {
      ttkTable,
      moteCloud,
      physicsKit,
      weaponImpulse: STARTER_WEAPON_IDS.map((weaponId) => computeWeaponHitDeltaV({
        weaponId, mass: 16, weaponOverrides: weaponOverrides[weaponId] || {},
      })),
      rewardTable,
      vacuumEdge: edge,
      flyover,
      style,
      pacing,
      pacingProjection,
      market,
      atmosphere,
      atmosphereProjection,
    },
  };
}

/** Stable, key-sorted export payload — the lab's candidate hand-off shape. */
export function arcadeCoreCandidateJson(overrides = {}) {
  const battery = evaluateArcadeCoreProjection(overrides);
  return {
    schema: 'spaceface.arcadeCoreCandidate.v1',
    version: 1,
    overrides: sortedClone(overrides),
    ok: battery.ok,
    regressionsOk: battery.regressionsOk,
    values: sortedClone(battery.values),
    failures: battery.failures.map((row) => ({ metric: row.metric, value: row.value, band: row.band })),
    calibrationOpen: battery.calibrationOpen.map((row) => ({ metric: row.metric, value: row.value, band: row.band })),
    detail: sortedClone(battery.detail),
  };
}

/** Fast slider preview. Runtime-only rows are labelled projections and never close acceptance. */
export function evaluateArcadeCoreProjection(overrides = {}) {
  return evaluateArcadeCoreBattery(overrides, { mode: 'projection' });
}

function sortedClone(value) {
  if (Array.isArray(value)) return value.map(sortedClone);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortedClone(value[key]);
    return out;
  }
  return value;
}

// ---------------------------------------------------------------------------------------------
// Lab metric registration — all six route families.
// ---------------------------------------------------------------------------------------------

function batteryFrom(params, ctx) {
  return evaluateArcadeCoreProjection((params && params.overrides) || (ctx && ctx.arcadeOverrides) || {});
}

function routeValue(route, params, ctx) {
  const battery = batteryFrom(params, ctx);
  const rows = battery.results.filter((row) => row.route === route);
  if (params && params.metric) {
    const row = rows.find((entry) => entry.metric === params.metric);
    return row ? row.value : null;
  }
  return rows.every((row) => row.ok) ? 1 : 0;
}

registerMetric('arcade.contactTtk', 1, {
  description: 'Arcade Core contact/TTK route: 1 when every banded pacing number holds; '
    + 'params.metric selects one raw value instead',
  compute(trace, params, ctx) {
    return routeValue('contact-ttk', params, ctx);
  },
});

registerMetric('arcade.physicsKit', 1, {
  description: 'Arcade Core physics-kit route: reference delta-v, tumble crossings, and mass coupling',
  compute(trace, params, ctx) {
    return routeValue('physics-kit', params, ctx);
  },
});

registerMetric('arcade.rewardVacuum', 1, {
  description: 'Arcade Core reward/vacuum route: 1 when every banded reward and magnet number holds; '
    + 'params.metric selects one raw value instead',
  compute(trace, params, ctx) {
    return routeValue('reward-vacuum', params, ctx);
  },
});

registerMetric('arcade.styleDeath', 1, {
  description: 'Arcade Core style/death route: fabricated truth buckets and bounded chain compounding',
  compute(trace, params, ctx) {
    return routeValue('style-death', params, ctx);
  },
});

registerMetric('arcade.pacingComposition', 1, {
  description: 'Arcade Core pacing lab projection; check:arcade-core owns real route acceptance',
  compute(trace, params, ctx) {
    return routeValue('pacing-composition', params, ctx);
  },
});

registerMetric('arcade.marketAtmosphere', 1, {
  description: 'Arcade Core market metrics plus atmosphere lab projection; real route runs in the check',
  compute(trace, params, ctx) {
    return routeValue('market-atmosphere', params, ctx);
  },
});
