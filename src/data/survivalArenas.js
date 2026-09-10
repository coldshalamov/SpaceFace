// Survival arena catalog for the ten-wave shell (PQ-133.02 / CRU-009)
// and the PQ-174.04/.05 law/boss measurements.
//
// The queue row for PQ-133.02 names `src/data/survivalArenas.js` as the greybox-arena
// owner. The authored prototypes live in `src/data/combatLabSetups.js` as
// COMBAT_LAB_ARENAS (shared with Combat Lab, leaf .01); this module is the Survival
// view over that catalog: lookup by id, the Phase-2 exercised set, and the spawn
// mapping the materializer needs. Pure data + pure helpers: no bus, no registry,
// no state, no side effects.

import { resolveCollisionConsequence } from '../combat/impulseKernel.js';
import {
  couplingScale,
  normalizeField,
  projectFieldTrajectory,
  sampleFieldAcceleration,
} from '../core/fields/fieldKernel.js';
import { GRAVITY_MARK_FIELD_COUPLING } from './combatDefs.js';
import {
  COMBAT_LAB_ARENAS,
  COMBAT_LAB_STARTER_PACKAGES,
} from './combatLabSetups.js';
import { listArenaToys } from './arenaModuleLibrary.js';
import { ENEMY_TYPES } from './enemies.js';
import { SHIPS } from './ships.js';
import { WEAPONS } from './weapons.js';
import { SWARM_BOSS_ROTATION, swarmBossFor } from './swarmMode.js';
import { SURVIVAL_LIVE_CIRCUIT_ARENAS } from './survivalWaves.js';
import { CINDER_ARENA_ID } from '../systems/cinderSluiceArena.js';
import { CRYO_ARENA_ID } from '../systems/cryoDriftArena.js';
import { LAGRANGE_ARENA_ID, LAGRANGE_PYLON_SEP } from '../systems/lagrangeCrucible.js';
import { STORM_ARENA_ID } from '../systems/stormLatticeArena.js';
import { debrisLayoutForArena, FOUNDRY_ARENA_ID } from '../systems/swarmArena.js';
import { planArenaInstall } from '../systems/survivalArena.js';
import { compactRunResult } from '../systems/survivalRecords.js';
import { buildCodeFor, buildNameFor } from '../systems/survivalResults.js';
import { estimateBoardScore, killScoreFor } from '../systems/survivalRewards.js';
import { SHOVE_WEAPON_ID } from '../systems/survivalStyle.js';

export const SURVIVAL_ARENA_SCHEMA_VERSION = 1;

/** Every arena a Survival run may launch in. Identity is owned by combatLabSetups.js. */
export const SURVIVAL_ARENAS = COMBAT_LAB_ARENAS;

/** Arenas with a route capture behind them. Phase 2 exercised `helios_core`. */
export const SURVIVAL_EXERCISED_ARENAS = Object.freeze(['helios_core']);

const ARENA_BY_ID = new Map(SURVIVAL_ARENAS.map((arena) => [arena.id, arena]));

/** The arena record for `arenaId`, or null when unknown. */
export function survivalArenaById(arenaId) {
  if (typeof arenaId !== 'string' || arenaId.length === 0) return null;
  return ARENA_BY_ID.get(arenaId) || null;
}

/** Sector + spawn mapping the run launch needs. Null when the arena is unknown.
 * `pos` is null unless BOTH coordinates are finite — a half-written spawn point
 * must read as "no mapping", never as a NaN coordinate. */
export function survivalArenaSpawn(arenaId) {
  const arena = survivalArenaById(arenaId);
  if (!arena) return null;
  const raw = arena.spawnPos;
  const x = raw && (typeof raw.x === 'number' || typeof raw.x === 'string') ? Number(raw.x) : NaN;
  const z = raw && (typeof raw.z === 'number' || typeof raw.z === 'string') ? Number(raw.z) : NaN;
  return {
    sectorId: arena.sectorId || null,
    pos: Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null,
  };
}

export { FOUNDRY_ARENA_ID };

/** Fixed seed for the build-vs-arena matrix. Same kits, same sixty-second budget. */
export const PQ_174_04_SEED = 17404;
/** Fixed seed for the boss physics scenarios. */
export const PQ_174_05_SEED = 17405;
/** The sixty-second harvest wave is the fair comparison window. */
export const ARENA_LAW_WINDOW_S = 60;
/** Done-when for a physics-only boss kill. */
export const PHYSICS_BOSS_BUDGET_S = 90;
/** Committed thrown-mass cadence: one slam per 0.60 s using the room, not a gun. */
export const PHYSICS_SLAM_INTERVAL_S = 0.6;

export const ARENA_LAW_KITS = Object.freeze(
  COMBAT_LAB_STARTER_PACKAGES.map((pkg) => pkg.id),
);

export const ARENA_LAWS = Object.freeze({
  [FOUNDRY_ARENA_ID]: Object.freeze({
    id: FOUNDRY_ARENA_ID,
    law: 'banks',
    verb: 'bank',
    line: 'banks and machinery kills',
  }),
  [LAGRANGE_ARENA_ID]: Object.freeze({
    id: LAGRANGE_ARENA_ID,
    law: 'pull',
    verb: 'sling',
    line: 'wells and slings',
  }),
  [CINDER_ARENA_ID]: Object.freeze({
    id: CINDER_ARENA_ID,
    law: 'current',
    verb: 'ride',
    line: 'riding the current',
  }),
  [CRYO_ARENA_ID]: Object.freeze({
    id: CRYO_ARENA_ID,
    law: 'freeze',
    verb: 'plate',
    line: 'ice plates and thermal shock',
  }),
  [STORM_ARENA_ID]: Object.freeze({
    id: STORM_ARENA_ID,
    law: 'conduct',
    verb: 'conduct',
    line: 'conducted lattice',
  }),
});

const ENEMY_BY_ID = new Map(ENEMY_TYPES.map((row) => [row.id, row]));
const WEAPON_BY_ID = new Map(WEAPONS.map((row) => [row.id, row]));
const SHIP_BY_ID = new Map(SHIPS.map((row) => [row.id, row]));
const KIT_BY_ID = new Map(COMBAT_LAB_STARTER_PACKAGES.map((row) => [row.id, row]));

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function kitDefIds(pkg) {
  return new Set((pkg && Array.isArray(pkg.loadout) ? pkg.loadout : [])
    .map((entry) => entry && entry.defId)
    .filter(Boolean));
}

function signatureWeapon(pkg) {
  const ids = kitDefIds(pkg);
  if (ids.has('wpn_pulse_laser_s')) return 'wpn_pulse_laser_s';
  if (ids.has('wpn_autocannon_m')) return 'wpn_autocannon_m';
  if (ids.has('mod_elastic_whip_m')) return 'mod_elastic_whip_m';
  if (ids.has('wpn_concussion_cannon_m')) return 'wpn_concussion_cannon_m';
  const first = pkg && Array.isArray(pkg.loadout) ? pkg.loadout[0] : null;
  return first && first.defId ? first.defId : null;
}

/**
 * What this kit is good at, from the loadout it actually carries — not a second stat sheet.
 * Plate-bank is projectile ricochet; rock-bank is shove-into-monolith.
 */
export function kitVerbWeights(kitId) {
  const pkg = KIT_BY_ID.get(kitId);
  const ids = kitDefIds(pkg);
  const has = (id) => ids.has(id);
  return {
    gun: has('wpn_pulse_laser_s') || has('wpn_autocannon_m') ? 1 : 0.35,
    plateBank: has('wpn_autocannon_m') ? 1.35 : (has('wpn_pulse_laser_s') ? 0.45 : 0.35),
    rockBank: has('wpn_momentum_sink_s') ? 1.25 : (has('wpn_concussion_cannon_m') ? 1 : 0.4),
    well: has('wpn_gravity_marker_s') ? 1 : 0,
    sling: has('mod_elastic_whip_m') ? 1 : (has('wpn_gravity_marker_s') ? 0.35 : 0),
    ride: has('mod_engine_fusion_m') ? 1 : (has('wpn_concussion_cannon_m') ? 0.55 : 0.25),
    machinery: has('wpn_concussion_cannon_m') ? 1 : 0.15,
    conduct: has('wpn_pulse_laser_s') ? 1 : (has('mod_elastic_whip_m') ? 0.45 : 0.1),
  };
}

function magAccel(vec) {
  return Math.hypot(finite(vec && vec.ax), finite(vec && vec.az));
}

function kitFieldProfile(kitId) {
  const pkg = KIT_BY_ID.get(kitId);
  const ship = pkg ? SHIP_BY_ID.get(pkg.hullId) : null;
  const marked = kitDefIds(pkg).has('wpn_gravity_marker_s');
  return {
    mass: ship && Number.isFinite(ship.mass) ? ship.mass : 24,
    type: 'ship',
    fieldResponseMult: marked ? GRAVITY_MARK_FIELD_COUPLING : 1,
  };
}

function idleInstall(arenaId, seed) {
  return planArenaInstall({
    arenaId,
    arenaPhase: 'idle',
    seed,
    wave: 1,
    anchor: { x: 0, z: 0 },
    laneGate: 'front',
  });
}

function countToys(install, kind) {
  return listArenaToys(install).filter((toy) => toy && toy.kind === kind).length;
}

function wellRide(fields, profile) {
  if (!fields.length) return { peak: 0, ride: 0, couple: couplingScale(profile) };
  const start = { x: 40, z: 0 };
  const a0 = sampleFieldAcceleration(start, { x: 0, z: 0 }, fields, 0, profile, { ax: 0, az: 0 });
  const traj = projectFieldTrajectory(start, { x: 0, z: 0 }, fields, profile, {
    dt: 1 / 60,
    steps: 180,
  });
  const ride = Math.hypot(traj.end.x - start.x, traj.end.z - start.z);
  return { peak: magAccel(a0), ride, couple: couplingScale(profile) };
}

function currentPush(install, fields) {
  const toyPush = listArenaToys(install)
    .filter((toy) => toy && toy.kind === 'current')
    .reduce((sum, toy) => sum + finite(toy.strength), 0);
  const conePush = fields
    .filter((field) => field && field.kind === 'cone')
    .reduce((sum, field) => sum + finite(field.strength), 0);
  // Cinder authors the same current as both a cone slot and a toy. Count it once.
  return Math.max(toyPush, conePush);
}

/**
 * What the ROOM pays, measured from the live idle install + debris law. Not a lookup table
 * of winners — the matrix scores kits against these yields.
 */
export function measureArenaYields(arenaId, seed = PQ_174_04_SEED) {
  const install = idleInstall(arenaId, seed);
  const toys = listArenaToys(install);
  const fields = (install.fields || []).map((spec) => normalizeField(spec));
  const wells = fields.filter((field) => field.kind === 'well' && field.strength > 0);
  const layout = debrisLayoutForArena(arenaId);
  const physics = kitFieldProfile('physics_toolkit');
  const ride = wellRide(wells, physics);
  const current = currentPush(install, fields);
  const plates = countToys(install, 'plate');
  const crushers = countToys(install, 'crusher');
  const relays = countToys(install, 'relay');
  const sling = wells.length >= 2 ? LAGRANGE_PYLON_SEP * 0.55 : 0;
  return {
    arenaId,
    seed,
    law: ARENA_LAWS[arenaId] ? ARENA_LAWS[arenaId].law : 'unknown',
    verb: ARENA_LAWS[arenaId] ? ARENA_LAWS[arenaId].verb : 'gun',
    toyIds: toys.map((toy) => toy.id),
    debrisTarget: layout.target,
    gun: 12,
    plateBank: plates * 55,
    rockBank: layout.target * 8,
    well: ride.ride,
    sling,
    ride: current,
    machinery: crushers * 55,
    conduct: relays * 45,
    couple: ride.couple,
  };
}

function weightedYield(weights, yields) {
  return weights.gun * yields.gun
    + weights.plateBank * yields.plateBank
    + weights.rockBank * yields.rockBank
    + weights.well * yields.well
    + weights.sling * yields.sling
    + weights.ride * yields.ride
    + weights.machinery * yields.machinery
    + weights.conduct * yields.conduct;
}

function physicsShare(weights, yields) {
  const physics = weights.rockBank * yields.rockBank
    + weights.well * yields.well
    + weights.sling * yields.sling
    + weights.ride * yields.ride
    + weights.machinery * yields.machinery
    + weights.plateBank * yields.plateBank
    + weights.conduct * yields.conduct;
  const gun = weights.gun * yields.gun;
  const total = physics + gun;
  if (!(total > 0)) return 0;
  return physics / total;
}

/**
 * Equal-skill score for one kit in one arena over the sixty-second wave.
 * Physics-attributed kills pay the force table; gun kills pay Pulse rate.
 */
export function scoreKitInArena(kitId, arenaId, seed = PQ_174_04_SEED) {
  const yields = measureArenaYields(arenaId, seed);
  const weights = kitVerbWeights(kitId);
  const raw = weightedYield(weights, yields);
  const kills = Math.max(0, raw / 14);
  const share = physicsShare(weights, yields);
  const physicsKills = Math.round(kills * share);
  const gunKills = Math.max(0, Math.round(kills - physicsKills));
  const shove = kitDefIds(KIT_BY_ID.get(kitId)).has(SHOVE_WEAPON_ID);
  const score = estimateBoardScore({
    gunKills,
    physicsKills,
    shoveGun: shove,
    playerPhysics: shove || physicsKills > 0,
  });
  const pkg = KIT_BY_ID.get(kitId);
  const verb = ARENA_LAWS[arenaId] ? ARENA_LAWS[arenaId].verb : 'gun';
  const defId = signatureWeapon(pkg);
  const picks = [{ verb, defId, wave: 1 }];
  return {
    kitId,
    arenaId,
    seed,
    windowS: ARENA_LAW_WINDOW_S,
    raw: Math.round(raw * 10) / 10,
    gunKills,
    physicsKills,
    score,
    verb,
    defId,
    picks,
    buildCode: buildCodeFor(picks),
    buildName: buildNameFor(picks),
    yields,
  };
}

export function arenaBuildMatrix(seed = PQ_174_04_SEED) {
  const arenas = SURVIVAL_LIVE_CIRCUIT_ARENAS.slice();
  const kits = ARENA_LAW_KITS.slice();
  const cells = [];
  for (const arenaId of arenas) {
    for (const kitId of kits) {
      cells.push(scoreKitInArena(kitId, arenaId, seed));
    }
  }
  const byArena = {};
  for (const arenaId of arenas) {
    const rows = cells.filter((cell) => cell.arenaId === arenaId)
      .slice()
      .sort((a, b) => b.score - a.score || a.kitId.localeCompare(b.kitId));
    byArena[arenaId] = {
      arenaId,
      law: ARENA_LAWS[arenaId],
      ranking: rows,
      top: rows[0],
    };
  }
  const foundryTop = byArena[FOUNDRY_ARENA_ID] && byArena[FOUNDRY_ARENA_ID].top
    ? byArena[FOUNDRY_ARENA_ID].top.kitId
    : null;
  const differsFromFoundry = {};
  for (const arenaId of arenas) {
    const top = byArena[arenaId].top.kitId;
    differsFromFoundry[arenaId] = arenaId === FOUNDRY_ARENA_ID ? null : top !== foundryTop;
  }
  return {
    seed,
    windowS: ARENA_LAW_WINDOW_S,
    kits,
    arenas,
    cells,
    byArena,
    foundryTop,
    differsFromFoundry,
  };
}

/** The compact card the results screen already knows how to print. */
export function resultsCardForCell(cell) {
  const compact = compactRunResult({
    outcome: 'extracted',
    seed: cell.seed,
    arenaId: cell.arenaId,
    kitId: cell.kitId,
    score: cell.score,
    kills: cell.gunKills + cell.physicsKills,
    physicsKills: cell.physicsKills,
    stuntScore: cell.physicsKills * killScoreFor(1),
    picks: cell.picks,
    wave: 1,
    deepestWave: 1,
    wavesCleared: 1,
    credits: 0,
    xp: 0,
  }, {
    kind: 'survival',
    seed: cell.seed,
    arenaId: cell.arenaId,
    ruleset: 'swarm',
  }, []);
  return {
    ...compact,
    buildCode: cell.buildCode,
    buildName: cell.buildName,
    verb: cell.verb,
  };
}

export function catalogCombatant(enemyId) {
  const def = ENEMY_BY_ID.get(enemyId);
  if (!def) return null;
  return {
    id: enemyId,
    type: 'ship',
    alive: true,
    mass: def.mass,
    hull: def.hull,
    hullMax: def.hull,
    armor: def.armor,
    armorMax: def.armor,
    armorFlat: def.armorFlat || 0,
    shield: def.shield,
    shieldMax: def.shield,
    shieldRegen: def.shieldRegen || 0,
    shieldRegenDelay: def.shieldRegenDelay || 0,
    flags: { invuln: false },
    pos: { x: 0, z: 0 },
  };
}

function cloneCombatant(src) {
  return {
    ...src,
    flags: { ...(src.flags || {}), invuln: false },
    pos: { ...(src.pos || { x: 0, z: 0 }) },
  };
}

function applyHit(combatant, rawDamage) {
  if (combatant.flags && combatant.flags.invuln) return 0;
  let dmg = Math.max(0, finite(rawDamage));
  if (!(dmg > 0) || combatant.hull <= 0) return 0;
  if (combatant.shield > 0) {
    const absorbed = Math.min(combatant.shield, dmg);
    combatant.shield -= absorbed;
    dmg -= absorbed;
  }
  if (!(dmg > 0)) return rawDamage - dmg;
  dmg = Math.max(0, dmg - Math.max(0, combatant.armorFlat || 0));
  if (!(dmg > 0)) return rawDamage;
  if (combatant.armor > 0) {
    const absorbed = Math.min(combatant.armor, dmg);
    combatant.armor -= absorbed;
    dmg -= absorbed;
  }
  const hullHit = Math.min(combatant.hull, dmg);
  combatant.hull -= hullHit;
  if (combatant.hull <= 0) combatant.alive = false;
  return rawDamage;
}

function thrownMassDamage(combatant) {
  const rock = { id: 'thrown_bank', type: 'asteroid', mass: 36000 };
  const receipt = resolveCollisionConsequence({
    target: combatant,
    other: rock,
    exchangedMomentum: Math.max(1, finite(combatant.mass) * 28),
    tick: 0,
    provenance: {
      actorId: 1,
      weaponId: SHOVE_WEAPON_ID,
      tag: 'concussion',
      appliedTick: 0,
    },
  });
  return receipt && Number.isFinite(receipt.impactDamage) ? receipt.impactDamage : 0;
}

function gunDamage(weaponId) {
  const def = WEAPON_BY_ID.get(weaponId);
  return def && Number.isFinite(def.dmg) ? def.dmg : 0;
}

function gunInterval(weaponId) {
  const def = WEAPON_BY_ID.get(weaponId);
  const rof = def && Number.isFinite(def.rof) ? def.rof : 0;
  if (!(rof > 0)) return 1;
  return 1 / rof;
}

function simulateHits({ combatant, damagePerHit, intervalS, maxS, count = 1 }) {
  const bodies = [];
  for (let i = 0; i < count; i++) bodies.push(cloneCombatant(combatant));
  let elapsed = 0;
  let hits = 0;
  while (elapsed < maxS - 1e-9 && bodies.some((body) => body.hull > 0)) {
    elapsed += intervalS;
    hits += 1;
    for (const body of bodies) {
      if (body.hull > 0) applyHit(body, damagePerHit);
    }
  }
  const dead = bodies.every((body) => body.hull <= 0);
  return {
    dead,
    seconds: dead ? elapsed : maxS + intervalS,
    hits,
    hullLeft: bodies.reduce((sum, body) => sum + body.hull, 0),
    invuln: bodies.some((body) => body.flags && body.flags.invuln),
  };
}

export function physicsBossWaves() {
  return [10, 20, 30].map((wave) => {
    const rotation = swarmBossFor(wave) || SWARM_BOSS_ROTATION[0];
    const packages = (rotation.packages || []).map((pkg) => ({
      enemyId: pkg.enemyId,
      count: pkg.count || 1,
      role: pkg.role || 'elite',
    }));
    const lead = packages[0] || { enemyId: 'dreadnought_boss', count: 1 };
    return {
      wave,
      rotationId: rotation.id,
      label: rotation.label,
      enemyId: lead.enemyId,
      count: packages.reduce((sum, pkg) => sum + pkg.count, 0),
      packages,
      method: wave === 30 ? 'machinery' : (wave === 20 ? 'tumbling_subsystems' : 'thrown_mass'),
    };
  });
}

function mergeSims(parts) {
  return {
    dead: parts.every((part) => part.dead),
    seconds: Math.max(0, ...parts.map((part) => part.seconds)),
    hits: parts.reduce((sum, part) => sum + part.hits, 0),
    hullLeft: parts.reduce((sum, part) => sum + part.hullLeft, 0),
    invuln: parts.some((part) => part.invuln),
  };
}

/**
 * Kill the champion with thrown mass (or the same slam used as machinery payoff).
 * Guns use the named weapon. No invuln flag, catalog hull, fixed seed.
 */
export function simulateBossKill({ wave, weaponId = 'wpn_pulse_laser_s', seed = PQ_174_05_SEED } = {}) {
  const spec = physicsBossWaves().find((row) => row.wave === wave);
  const lead = catalogCombatant(spec.enemyId);
  const physicsParts = [];
  const gunParts = [];
  let slam = 0;
  for (const pkg of spec.packages) {
    const combatant = catalogCombatant(pkg.enemyId);
    const physicsDmg = thrownMassDamage(combatant);
    slam = Math.max(slam, physicsDmg);
    physicsParts.push(simulateHits({
      combatant,
      damagePerHit: physicsDmg,
      intervalS: PHYSICS_SLAM_INTERVAL_S,
      maxS: PHYSICS_BOSS_BUDGET_S,
      count: pkg.count,
    }));
    gunParts.push(simulateHits({
      combatant,
      damagePerHit: gunDamage(weaponId),
      intervalS: gunInterval(weaponId),
      maxS: 600,
      count: pkg.count,
    }));
  }
  const physics = mergeSims(physicsParts);
  const gun = mergeSims(gunParts);
  return {
    seed,
    wave: spec.wave,
    rotationId: spec.rotationId,
    label: spec.label,
    enemyId: spec.enemyId,
    count: spec.count,
    method: spec.method,
    catalogHull: lead.hullMax,
    catalogArmorFlat: lead.armorFlat,
    invuln: !!(lead.flags && lead.flags.invuln),
    physicsDamagePerSlam: slam,
    physics,
    gun: { ...gun, weaponId },
  };
}
