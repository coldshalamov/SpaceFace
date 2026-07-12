// src/data/shipRoleLattice.js — Milestone-5 thirteen-ship role lattice.
// Pure data + pure helpers. Consumed by systems/ships.js (derived behavior authority)
// and ui/screens/shipyard.js (why-this-ship + owned-hull compare). No Three.js, no RNG.
//
// Contract:
// - Exactly one lattice row per canonical player hull in SHIPS (13).
// - Roles drive real derived behavior through ships.getDerivedStats (flight class +
//   operational biases), not labels alone.
// - Adjacency / counter / career fit are authored progression metadata; unlock truth
//   still lives on hull.requiresTech + tech.js.
// - Dimension scores used for same-tier dominance checks are computed from live hull
//   catalog numbers (slots/mass/handling/tank/cargo) so declared identity cannot lie.

import { SHIPS } from './ships.js';
import { MODULES } from './modules.js';
import { WEAPONS } from './weapons.js';
import { TECH_NODES } from './tech.js';

export const LATTICE_SCHEMA_ID = 'spaceface.shipRoleLattice.v1';
export const LATTICE_SCHEMA_VERSION = 1;

/** Ordered dimension keys used for same-tier Pareto checks and shipyard compare. */
export const LATTICE_DIMENSIONS = Object.freeze([
  'combat', 'cargo', 'mining', 'handling', 'tank', 'utility', 'speed',
]);

export const CAREER_IDS = Object.freeze(['hauler', 'hunter', 'prospector']);

// A role path is the smallest authored, costed fit that makes the hull's promise concrete.
// These are recommendations, never free grants: purchase price remains the bare hull price and
// planHullRolePath() reports the exact additional module + research cost. Quantities matter.
export const SHIP_ROLE_PATHS = Object.freeze({
  ship_kestrel: Object.freeze({
    id: 'path_field_skiff', signatureVerb: 'Mine, tow, or fight without changing hulls.',
    counterplay: 'Cut the tether and boost away before a specialist can pin the light frame.',
    kit: Object.freeze([{ defId: 'wpn_pulse_laser_s', count: 1 }, { defId: 'mod_mining_laser_s', count: 1 }, { defId: 'mod_winch_hd', count: 1 }]),
  }),
  ship_pelican: Object.freeze({
    id: 'path_belt_prospector', signatureVerb: 'Run twin extraction heads and stay in the belt longer.',
    counterplay: 'Use the winch to manage mass, then retreat instead of accepting a dogfight.',
    kit: Object.freeze([{ defId: 'mod_mining_laser_s', count: 2 }, { defId: 'mod_cargo_pod_m', count: 1 }, { defId: 'mod_drill_amp', count: 1 }]),
  }),
  ship_wasp: Object.freeze({
    id: 'path_light_interdictor', signatureVerb: 'Commit twin light guns and an impulse charge on one fast pass.',
    counterplay: 'Disengage before heavier arcs settle; the hull wins initiative, not attrition.',
    kit: Object.freeze([{ defId: 'wpn_pulse_laser_s', count: 1 }, { defId: 'wpn_autocannon_s', count: 1 }, { defId: 'mod_charge_rack', count: 1 }]),
  }),
  ship_mule: Object.freeze({
    id: 'path_low_profile_runner', signatureVerb: 'Move valuable cargo behind a rear deterrent and market read.',
    counterplay: 'Point the rear mount at pursuit and leave; never turn a freight run into a duel.',
    kit: Object.freeze([{ defId: 'wpn_flak_turret_s', count: 1 }, { defId: 'mod_smuggler_hold', count: 1 }, { defId: 'mod_market_data_s', count: 1 }]),
  }),
  ship_drifter: Object.freeze({
    id: 'path_control_multirole', signatureVerb: 'Survey, extract, haul, and reposition targets in one field fit.',
    counterplay: 'Scout the contact first, then use the mixed fit to choose engagement or escape.',
    kit: Object.freeze([{ defId: 'mod_mining_beam_m', count: 1 }, { defId: 'mod_cargo_pod_m', count: 1 }, { defId: 'mod_survey_suite', count: 1 }, { defId: 'mod_winch_hd', count: 1 }]),
  }),
  ship_hornet: Object.freeze({
    id: 'path_pursuit_striker', signatureVerb: 'Stack three attack arcs with charge-and-ram tools for decisive flybys.',
    counterplay: 'Break contact after the pass; planted capitals punish a second orbit.',
    kit: Object.freeze([{ defId: 'wpn_pulse_laser_m', count: 2 }, { defId: 'wpn_autocannon_m', count: 1 }, { defId: 'mod_charge_rack', count: 1 }, { defId: 'mod_ram_plate', count: 1 }]),
  }),
  ship_ironback: Object.freeze({
    id: 'path_industrial_stripmine', signatureVerb: 'Work four seams at capital scale while the winch controls fragments.',
    counterplay: 'Anchor the worksite and reel mass inward; do not chase raiders in a barge.',
    kit: Object.freeze([{ defId: 'mod_mining_beam_m', count: 4 }, { defId: 'mod_drill_amp', count: 1 }, { defId: 'mod_winch_hd', count: 1 }]),
  }),
  ship_bastion: Object.freeze({
    id: 'path_broadside_anchor', signatureVerb: 'Plant a four-gun broadside and hold the contract lane.',
    counterplay: 'Chaff the opening salvo and deny pursuit instead of chasing agile targets.',
    kit: Object.freeze([{ defId: 'wpn_heavy_beam_l', count: 2 }, { defId: 'wpn_torpedo_l', count: 2 }, { defId: 'mod_targeting_computer_m', count: 1 }, { defId: 'mod_chaff_dispenser_m', count: 1 }]),
  }),
  ship_atlas: Object.freeze({
    id: 'path_bulk_logistics', signatureVerb: 'Move six capital cargo loads and recover freight with a massline.',
    counterplay: 'Trade turn rate for route planning, tether control, and an early escape decision.',
    kit: Object.freeze([{ defId: 'mod_cargo_expander_l', count: 6 }, { defId: 'mod_massline_spool_m', count: 1 }, { defId: 'mod_market_data_s', count: 1 }]),
  }),
  ship_ranger: Object.freeze({
    id: 'path_deep_recon', signatureVerb: 'Detect first, jump around danger, and jam the contact that closes.',
    counterplay: 'Win with information and range; a pinned explorer loses its main advantage.',
    kit: Object.freeze([{ defId: 'mod_sensor_array_l', count: 1 }, { defId: 'mod_jump_drive_m', count: 1 }, { defId: 'mod_survey_suite', count: 1 }, { defId: 'mod_ecm_jammer_l', count: 1 }]),
  }),
  ship_warden: Object.freeze({
    id: 'path_lane_gunship', signatureVerb: 'Alternate heavy beams and torpedoes while fire control owns the lane.',
    counterplay: 'Jam priority threats and keep the firing face forward; flanks defeat the gun wall.',
    kit: Object.freeze([{ defId: 'wpn_heavy_beam_l', count: 2 }, { defId: 'wpn_torpedo_l', count: 2 }, { defId: 'mod_targeting_computer_m', count: 1 }, { defId: 'mod_ecm_jammer_l', count: 1 }]),
  }),
  ship_colossus: Object.freeze({
    id: 'path_capital_center', signatureVerb: 'Plant five capital mounts and absorb the fight around a protected center.',
    counterplay: 'Use chaff before the focus volley; mass makes late disengagement expensive.',
    kit: Object.freeze([{ defId: 'wpn_heavy_beam_l', count: 3 }, { defId: 'wpn_torpedo_l', count: 2 }, { defId: 'mod_targeting_computer_m', count: 1 }, { defId: 'mod_chaff_dispenser_m', count: 1 }]),
  }),
  ship_leviathan: Object.freeze({
    id: 'path_command_flagship', signatureVerb: 'Coordinate seven capital arcs and use the massline to shape the battlefield.',
    counterplay: 'Protect the slow core with escorts, ECM, and deliberate target order.',
    kit: Object.freeze([{ defId: 'wpn_siege_lance_l', count: 1 }, { defId: 'wpn_heavy_beam_l', count: 4 }, { defId: 'wpn_torpedo_l', count: 2 }, { defId: 'mod_massline_spool_l', count: 1 }, { defId: 'mod_targeting_computer_m', count: 1 }, { defId: 'mod_ecm_jammer_l', count: 1 }]),
  }),
});

const SIZE_RANK = Object.freeze({ S: 1, M: 2, L: 3 });

function slotEntries(def, type) {
  return (def && def.slots && def.slots[type]) || [];
}

function slotSizeScore(entries) {
  let score = 0;
  for (const entry of entries) {
    const size = typeof entry === 'string' ? entry : (entry && entry.size) || 'S';
    score += SIZE_RANK[size] || 1;
  }
  return score;
}

/**
 * Compute 0..100-ish dimension scores from a live ship def.
 * Pure function of catalog numbers — no fake UI stats.
 */
export function computeHullDimensions(shipDef) {
  if (!shipDef) {
    return Object.freeze({
      combat: 0, cargo: 0, mining: 0, handling: 0, tank: 0, utility: 0, speed: 0,
    });
  }
  const combat = slotSizeScore(slotEntries(shipDef, 'weapon')) * 14
    + (shipDef.tier || 0) * 4;
  const cargo = Math.min(100, (shipDef.cargo || 0) / 5.2);
  const mining = slotSizeScore(slotEntries(shipDef, 'mining')) * 18;
  const mass = Math.max(1, shipDef.mass || 1);
  const handling = Math.min(100, (shipDef.handling || 1) * 48);
  const tank = Math.min(100, ((shipDef.hull || 0) + (shipDef.shield || 0)) / 62);
  const utility = slotSizeScore(slotEntries(shipDef, 'utility')) * 12
    + slotSizeScore(slotEntries(shipDef, 'shield')) * 4;
  // Speed proxy: handling / sqrt(mass) scaled into a readable band.
  const speed = Math.min(100, ((shipDef.handling || 1) / Math.sqrt(mass / 18)) * 42);
  return Object.freeze({
    combat: Math.round(combat * 10) / 10,
    cargo: Math.round(cargo * 10) / 10,
    mining: Math.round(mining * 10) / 10,
    handling: Math.round(handling * 10) / 10,
    tank: Math.round(tank * 10) / 10,
    utility: Math.round(utility * 10) / 10,
    speed: Math.round(speed * 10) / 10,
  });
}

/**
 * Authored lattice rows. Biases are small multipliers applied only inside ships.js
 * getDerivedStats (single writer). Starter stays forgiving (slight thrust/handling ease).
 * Do not touch visuals — hull visuals stay on ships.js `visuals` blocks.
 */
const LATTICE_ROWS = Object.freeze([
  Object.freeze({
    shipId: 'ship_kestrel',
    role: 'starter',
    roleLabel: 'Starter Scout',
    flightClass: 'scout',
    shortWhy: 'Forgiving first hull — enough hold, drill, and a gun to try every loop.',
    careerFit: Object.freeze({ hauler: 0.55, hunter: 0.55, prospector: 0.70 }),
    primaryCareers: Object.freeze(['prospector', 'hauler', 'hunter']),
    opMassBias: 0.98,
    handlingBias: 1.04,
    thrustBias: 1.06,
    turnBias: 1.04,
    strengths: Object.freeze(['forgiving start', 'mixed slots', 'low mass']),
    weaknesses: Object.freeze(['low peak power', 'thin shields']),
    upgradeAdjacency: Object.freeze(['ship_pelican', 'ship_wasp', 'ship_mule']),
    counterRoles: Object.freeze(['interceptor', 'gunship']),
    identityLine: 'Light scout that teaches every verb without punishing mistakes.',
  }),
  Object.freeze({
    shipId: 'ship_pelican',
    role: 'mining',
    roleLabel: 'Prospect Miner',
    flightClass: 'miner',
    shortWhy: 'Doubles mining hardpoints and grows the hold for sustained belt work.',
    careerFit: Object.freeze({ hauler: 0.35, hunter: 0.15, prospector: 0.95 }),
    primaryCareers: Object.freeze(['prospector']),
    opMassBias: 1.04,
    handlingBias: 0.96,
    thrustBias: 0.97,
    turnBias: 0.95,
    strengths: Object.freeze(['mining slots', 'ore hold', 'steady drill work']),
    weaknesses: Object.freeze(['thin combat loadout', 'modest dash']),
    upgradeAdjacency: Object.freeze(['ship_ironback', 'ship_drifter']),
    counterRoles: Object.freeze(['interceptor', 'fighter']),
    identityLine: 'Belt workhorse — two mining mounts and room for the haul home.',
  }),
  Object.freeze({
    shipId: 'ship_wasp',
    role: 'fighter',
    roleLabel: 'Light Fighter',
    flightClass: 'fighter',
    shortWhy: 'Trades cargo for twin guns, shield room, and chase speed.',
    careerFit: Object.freeze({ hauler: 0.10, hunter: 0.95, prospector: 0.15 }),
    primaryCareers: Object.freeze(['hunter']),
    opMassBias: 0.96,
    handlingBias: 1.06,
    thrustBias: 1.05,
    turnBias: 1.08,
    strengths: Object.freeze(['twin hardpoints', 'agility', 'shield focus']),
    weaknesses: Object.freeze(['tiny hold', 'no mining']),
    upgradeAdjacency: Object.freeze(['ship_hornet', 'ship_drifter']),
    counterRoles: Object.freeze(['corvette', 'gunship', 'mining_barge']),
    identityLine: 'Knife-range hunter — wins the first pass or dies trying.',
  }),
  Object.freeze({
    shipId: 'ship_mule',
    role: 'freighter',
    roleLabel: 'Light Freighter',
    flightClass: 'hauler',
    shortWhy: 'Triples the Hitch hold for clean trade legs with a rear deterrent gun.',
    careerFit: Object.freeze({ hauler: 0.95, hunter: 0.10, prospector: 0.30 }),
    primaryCareers: Object.freeze(['hauler']),
    opMassBias: 1.08,
    handlingBias: 0.94,
    thrustBias: 0.95,
    turnBias: 0.92,
    strengths: Object.freeze(['cargo volume', 'escape dash', 'rear coverage']),
    weaknesses: Object.freeze(['slow turns', 'one light gun']),
    upgradeAdjacency: Object.freeze(['ship_atlas', 'ship_drifter']),
    counterRoles: Object.freeze(['interceptor', 'fighter', 'gunship']),
    identityLine: 'Bulk legs for credits — run the route, do not win the duel.',
  }),
  Object.freeze({
    shipId: 'ship_drifter',
    role: 'multirole',
    roleLabel: 'Multirole Cruiser',
    flightClass: 'scout',
    shortWhy: 'Front and rear mounts plus mixed utility — pivot careers without a full rebuy.',
    careerFit: Object.freeze({ hauler: 0.65, hunter: 0.60, prospector: 0.70 }),
    primaryCareers: Object.freeze(['prospector', 'hauler', 'hunter']),
    opMassBias: 1.0,
    handlingBias: 1.0,
    thrustBias: 1.0,
    turnBias: 1.0,
    strengths: Object.freeze(['flexible slots', 'front+rear guns', 'career pivot']),
    weaknesses: Object.freeze(['master of none', 'mid-tier price wall']),
    upgradeAdjacency: Object.freeze(['ship_bastion', 'ship_ranger', 'ship_atlas']),
    counterRoles: Object.freeze(['interceptor', 'specialist barges']),
    identityLine: 'The career hinge — outfitting decides the fantasy this week.',
  }),
  Object.freeze({
    shipId: 'ship_hornet',
    role: 'interceptor',
    roleLabel: 'Interceptor',
    flightClass: 'fighter',
    shortWhy: 'Three-aspect fire and best-in-class dash for closing bounties fast.',
    careerFit: Object.freeze({ hauler: 0.05, hunter: 1.0, prospector: 0.10 }),
    primaryCareers: Object.freeze(['hunter']),
    opMassBias: 0.94,
    handlingBias: 1.10,
    thrustBias: 1.08,
    turnBias: 1.12,
    strengths: Object.freeze(['burst speed', 'turret coverage', 'duel burst']),
    weaknesses: Object.freeze(['no cargo', 'no mining', 'thin margins if pinned']),
    upgradeAdjacency: Object.freeze(['ship_bastion', 'ship_warden']),
    counterRoles: Object.freeze(['corvette', 'battlecruiser', 'flagship']),
    identityLine: 'Pursuit specialist — spend boost, land the pass, leave.',
  }),
  Object.freeze({
    shipId: 'ship_ironback',
    role: 'mining_barge',
    roleLabel: 'Mining Barge',
    flightClass: 'miner',
    shortWhy: 'Quad mining arrays and a brick hold — industrial extraction platform.',
    careerFit: Object.freeze({ hauler: 0.40, hunter: 0.05, prospector: 1.0 }),
    primaryCareers: Object.freeze(['prospector']),
    opMassBias: 1.12,
    handlingBias: 0.90,
    thrustBias: 0.92,
    turnBias: 0.88,
    strengths: Object.freeze(['mining throughput', 'hull mass', 'ore capacity']),
    weaknesses: Object.freeze(['brick handling', 'weak dash', 'one turret']),
    upgradeAdjacency: Object.freeze(['ship_atlas', 'ship_ranger']),
    counterRoles: Object.freeze(['interceptor', 'fighter', 'gunship']),
    identityLine: 'Industrial slab — the field empties before the barge does.',
  }),
  Object.freeze({
    shipId: 'ship_bastion',
    role: 'corvette',
    roleLabel: 'Corvette',
    flightClass: 'capital',
    shortWhy: 'Broadside warship for harder combat contracts and faction pressure.',
    careerFit: Object.freeze({ hauler: 0.15, hunter: 0.90, prospector: 0.15 }),
    primaryCareers: Object.freeze(['hunter']),
    opMassBias: 1.02,
    handlingBias: 0.98,
    thrustBias: 0.98,
    turnBias: 0.96,
    strengths: Object.freeze(['broadside battery', 'shield depth', 'warship slots']),
    weaknesses: Object.freeze(['low cargo', 'no mining', 'capital inertia']),
    upgradeAdjacency: Object.freeze(['ship_warden', 'ship_colossus']),
    counterRoles: Object.freeze(['interceptor', 'explorer']),
    identityLine: 'Patrol-grade brawler — owns mid-range trades, not chases.',
  }),
  Object.freeze({
    shipId: 'ship_atlas',
    role: 'heavy_hauler',
    roleLabel: 'Heavy Hauler',
    flightClass: 'hauler',
    shortWhy: 'Six large cargo slots for bulk logistics that fund the mid-late game.',
    careerFit: Object.freeze({ hauler: 1.0, hunter: 0.05, prospector: 0.25 }),
    primaryCareers: Object.freeze(['hauler']),
    opMassBias: 1.15,
    handlingBias: 0.88,
    thrustBias: 0.90,
    turnBias: 0.85,
    strengths: Object.freeze(['bulk hold', 'escape dash pool', 'route tank']),
    weaknesses: Object.freeze(['ponderous turns', 'light guns', 'huge target mass']),
    upgradeAdjacency: Object.freeze(['ship_colossus', 'ship_leviathan']),
    counterRoles: Object.freeze(['interceptor', 'gunship', 'fighter']),
    identityLine: 'The credit pump — loaded it wallows; empty it still escapes.',
  }),
  Object.freeze({
    shipId: 'ship_ranger',
    role: 'explorer',
    roleLabel: 'Deep Explorer',
    flightClass: 'scout',
    shortWhy: 'Utility-heavy scout for recon, salvage, and long-range survey work.',
    careerFit: Object.freeze({ hauler: 0.45, hunter: 0.40, prospector: 0.75 }),
    primaryCareers: Object.freeze(['prospector', 'hunter']),
    opMassBias: 0.97,
    handlingBias: 1.06,
    thrustBias: 1.04,
    turnBias: 1.05,
    strengths: Object.freeze(['utility density', 'endurance energy', 'self-defense turrets']),
    weaknesses: Object.freeze(['not a pure gun platform', 'mid cargo']),
    upgradeAdjacency: Object.freeze(['ship_warden', 'ship_colossus']),
    counterRoles: Object.freeze(['interceptor', 'corvette']),
    identityLine: 'Sensor nose first — read the lane, then decide to fight or leave.',
  }),
  Object.freeze({
    shipId: 'ship_warden',
    role: 'gunship',
    roleLabel: 'Gunship',
    flightClass: 'capital',
    shortWhy: 'Weapons platform that holds a lane — more agile than a battlecruiser.',
    careerFit: Object.freeze({ hauler: 0.10, hunter: 0.95, prospector: 0.10 }),
    primaryCareers: Object.freeze(['hunter']),
    opMassBias: 1.03,
    handlingBias: 1.0,
    thrustBias: 0.97,
    turnBias: 0.98,
    strengths: Object.freeze(['weapon focus', 'shield banks', 'lane control']),
    weaknesses: Object.freeze(['low cargo', 'no mining', 'commits to the face']),
    upgradeAdjacency: Object.freeze(['ship_colossus', 'ship_leviathan']),
    counterRoles: Object.freeze(['interceptor', 'explorer']),
    identityLine: 'Wall of guns that advances — not a freighter, not a scout.',
  }),
  Object.freeze({
    shipId: 'ship_colossus',
    role: 'battlecruiser',
    roleLabel: 'Battlecruiser',
    flightClass: 'capital',
    shortWhy: 'Capital wedge with deeper tank and broadside mass for late combat.',
    careerFit: Object.freeze({ hauler: 0.25, hunter: 0.90, prospector: 0.15 }),
    primaryCareers: Object.freeze(['hunter']),
    opMassBias: 1.08,
    handlingBias: 0.92,
    thrustBias: 0.93,
    turnBias: 0.90,
    strengths: Object.freeze(['EHP depth', 'five-mount battery', 'capital cargo']),
    weaknesses: Object.freeze(['slow recovery', 'price wall', 'hard to disengage']),
    upgradeAdjacency: Object.freeze(['ship_leviathan']),
    counterRoles: Object.freeze(['interceptor', 'swarm fighters']),
    identityLine: 'Center-mass capital — owns the fight if it gets to plant its feet.',
  }),
  Object.freeze({
    shipId: 'ship_leviathan',
    role: 'flagship',
    roleLabel: 'Flagship',
    flightClass: 'capital',
    shortWhy: 'End-game command hull — unmatched slot depth and combat presence.',
    careerFit: Object.freeze({ hauler: 0.35, hunter: 0.95, prospector: 0.20 }),
    primaryCareers: Object.freeze(['hunter', 'hauler']),
    opMassBias: 1.10,
    handlingBias: 0.88,
    thrustBias: 0.90,
    turnBias: 0.86,
    strengths: Object.freeze(['seven mounts', 'command tank', 'utility depth']),
    weaknesses: Object.freeze(['highest mass', 'slowest recovery', 'flagship price']),
    upgradeAdjacency: Object.freeze([]),
    counterRoles: Object.freeze(['massed interceptors', 'kite explorers']),
    identityLine: 'The fight bends around it — escorts first, then the core.',
  }),
]);

export const SHIP_ROLE_LATTICE = Object.freeze(Object.fromEntries(
  LATTICE_ROWS.map((row) => [row.shipId, row]),
));

export const LATTICE_SHIP_IDS = Object.freeze(LATTICE_ROWS.map((row) => row.shipId));

const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const FITTABLE_BY_ID = new Map([...MODULES, ...WEAPONS].map((entry) => [entry.id, entry]));
const TECH_BY_ID = new Map(TECH_NODES.map((entry) => [entry.id, entry]));

function techClosure(ids) {
  const ordered = [];
  const seen = new Set();
  function visit(id) {
    if (!id || seen.has(id)) return;
    const node = TECH_BY_ID.get(id);
    if (!node) return;
    for (const prereq of node.prereqs || []) visit(prereq);
    seen.add(id);
    ordered.push(id);
  }
  for (const id of ids) visit(id);
  return ordered;
}

/** Exact bare-hull + recommended-role-kit + missing-research cost, with no free-item fiction. */
export function planHullRolePath(shipId, researchedNodes = []) {
  const def = SHIP_BY_ID.get(shipId);
  const path = SHIP_ROLE_PATHS[shipId];
  if (!def || !path) return null;
  const researched = researchedNodes instanceof Set ? researchedNodes : new Set(researchedNodes || []);
  const items = path.kit.map((entry) => {
    const fitDef = FITTABLE_BY_ID.get(entry.defId);
    const count = Math.max(1, Math.floor(Number(entry.count) || 1));
    return Object.freeze({
      defId: entry.defId,
      count,
      name: fitDef ? fitDef.name : entry.defId,
      slotType: fitDef ? fitDef.slotType : null,
      size: fitDef ? fitDef.size : null,
      unitCredits: fitDef ? fitDef.price : 0,
      credits: fitDef ? fitDef.price * count : 0,
      requiresTech: fitDef ? fitDef.requiresTech || null : null,
    });
  });
  const directTech = [def.requiresTech, ...items.map((item) => item.requiresTech)].filter(Boolean);
  const techPathIds = techClosure(directTech);
  const missingTechIds = techPathIds.filter((id) => !researched.has(id));
  const hullCredits = Math.max(0, Number(def.price) || 0);
  const kitCredits = items.reduce((sum, item) => sum + item.credits, 0);
  const researchCredits = missingTechIds.reduce((sum, id) => sum + (TECH_BY_ID.get(id)?.cost?.credits || 0), 0);
  const researchPoints = missingTechIds.reduce((sum, id) => sum + (TECH_BY_ID.get(id)?.cost?.rp || 0), 0);
  return Object.freeze({
    id: path.id,
    shipId,
    signatureVerb: path.signatureVerb,
    counterplay: path.counterplay,
    hullCredits,
    kitCredits,
    roleReadyCredits: hullCredits + kitCredits,
    researchCredits,
    researchPoints,
    allInCredits: hullCredits + kitCredits + researchCredits,
    techPathIds: Object.freeze(techPathIds),
    missingTechIds: Object.freeze(missingTechIds),
    items: Object.freeze(items),
  });
}

export function getLatticeRow(shipId) {
  if (shipId == null) return null;
  return SHIP_ROLE_LATTICE[String(shipId)] || null;
}

export function getLatticeRowForDef(shipDef) {
  if (!shipDef) return null;
  return getLatticeRow(shipDef.id) || null;
}

/** Flight-class identity for derived stats — lattice is source of truth when present. */
export function flightClassForHull(shipDefOrId) {
  const def = typeof shipDefOrId === 'string' ? SHIP_BY_ID.get(shipDefOrId) : shipDefOrId;
  const row = def ? getLatticeRow(def.id) : getLatticeRow(shipDefOrId);
  if (row && row.flightClass) return row.flightClass;
  const role = String((def && def.role) || '').toLowerCase();
  if (role.includes('fighter') || role.includes('interceptor')) return 'fighter';
  if (role.includes('hauler') || role.includes('freighter')) return 'hauler';
  if (role.includes('mining')) return 'miner';
  if (role.includes('corvette') || role.includes('gunship') || role.includes('battlecruiser') || role.includes('flagship')) {
    return 'capital';
  }
  return 'scout';
}

/** Operational biases applied only by ships.getDerivedStats. */
export function roleOperationalBiases(shipId) {
  const row = getLatticeRow(shipId);
  if (!row) {
    return Object.freeze({
      opMassBias: 1, handlingBias: 1, thrustBias: 1, turnBias: 1,
    });
  }
  return Object.freeze({
    opMassBias: row.opMassBias ?? 1,
    handlingBias: row.handlingBias ?? 1,
    thrustBias: row.thrustBias ?? 1,
    turnBias: row.turnBias ?? 1,
  });
}

/** Player-facing "why this ship" packet for shipyard / advisors. */
export function describeHullRole(shipId) {
  const row = getLatticeRow(shipId);
  const def = SHIP_BY_ID.get(shipId);
  if (!row || !def) return null;
  const dims = computeHullDimensions(def);
  const careers = CAREER_IDS
    .map((id) => ({ id, score: row.careerFit[id] || 0 }))
    .sort((a, b) => b.score - a.score);
  return Object.freeze({
    shipId: row.shipId,
    name: def.name,
    role: row.role,
    roleLabel: row.roleLabel,
    tier: def.tier,
    shortWhy: row.shortWhy,
    identityLine: row.identityLine,
    flightClass: row.flightClass,
    strengths: row.strengths,
    weaknesses: row.weaknesses,
    primaryCareers: row.primaryCareers,
    careerFit: row.careerFit,
    topCareers: Object.freeze(careers),
    upgradeAdjacency: row.upgradeAdjacency,
    counterRoles: row.counterRoles,
    rolePath: planHullRolePath(shipId),
    dimensions: dims,
    requiresTech: def.requiresTech || null,
  });
}

/**
 * Compare candidate hull vs owned/current hull using real catalog + optional derived stats.
 * Never invents numbers — derived block must come from getDerivedStats when provided.
 */
export function compareHulls(candidateId, currentId, derivedCandidate = null, derivedCurrent = null) {
  const cand = SHIP_BY_ID.get(candidateId);
  const cur = SHIP_BY_ID.get(currentId);
  if (!cand) return null;
  const candDesc = describeHullRole(candidateId);
  const curDesc = cur ? describeHullRole(currentId) : null;

  function pair(label, a, b, higherIsBetter = true) {
    const av = Number(a) || 0;
    const bv = Number(b) || 0;
    let delta = av - bv;
    let tone = 'same';
    if (Math.abs(delta) < 1e-6) tone = 'same';
    else if (higherIsBetter ? delta > 0 : delta < 0) tone = 'better';
    else tone = 'worse';
    return Object.freeze({ label, candidate: av, current: bv, delta, tone, higherIsBetter });
  }

  const rows = [];
  if (derivedCandidate && derivedCurrent) {
    rows.push(pair('Hull', derivedCandidate.hullMax, derivedCurrent.hullMax));
    rows.push(pair('Shield', derivedCandidate.shieldMax, derivedCurrent.shieldMax));
    rows.push(pair('Cargo', derivedCandidate.cargoCap, derivedCurrent.cargoCap));
    rows.push(pair('Max speed', derivedCandidate.maxSpeed, derivedCurrent.maxSpeed));
    rows.push(pair('Turn rate', derivedCandidate.turnRate, derivedCurrent.turnRate));
    rows.push(pair('Thrust', derivedCandidate.thrust, derivedCurrent.thrust));
    rows.push(pair('Op. mass', derivedCandidate.operationalMass ?? derivedCandidate.mass,
      derivedCurrent.operationalMass ?? derivedCurrent.mass, false));
  } else {
    rows.push(pair('Hull', cand.hull, cur ? cur.hull : 0));
    rows.push(pair('Shield', cand.shield, cur ? cur.shield : 0));
    rows.push(pair('Cargo', cand.cargo, cur ? cur.cargo : 0));
    rows.push(pair('Handling', cand.handling, cur ? cur.handling : 0));
    rows.push(pair('Mass', cand.mass, cur ? cur.mass : 0, false));
  }

  rows.push(pair('Weapons', slotEntries(cand, 'weapon').length, cur ? slotEntries(cur, 'weapon').length : 0));
  rows.push(pair('Mining', slotEntries(cand, 'mining').length, cur ? slotEntries(cur, 'mining').length : 0));
  rows.push(pair('Utility', slotEntries(cand, 'utility').length, cur ? slotEntries(cur, 'utility').length : 0));

  return Object.freeze({
    candidateId,
    currentId: currentId || null,
    candidateName: cand.name,
    currentName: cur ? cur.name : null,
    candidateWhy: candDesc ? candDesc.shortWhy : '',
    currentWhy: curDesc ? curDesc.shortWhy : '',
    candidateRole: candDesc ? candDesc.roleLabel : cand.role,
    currentRole: curDesc ? curDesc.roleLabel : (cur && cur.role) || null,
    adjacencyFromCurrent: curDesc
      ? curDesc.upgradeAdjacency.includes(candidateId)
      : false,
    rows: Object.freeze(rows),
  });
}

/** True if a is strictly dominated by b on every lattice dimension (Pareto). */
export function isDominatedBy(dimA, dimB, dimensions = LATTICE_DIMENSIONS) {
  if (!dimA || !dimB) return false;
  let strictlyWorse = false;
  for (const key of dimensions) {
    const a = Number(dimA[key]) || 0;
    const b = Number(dimB[key]) || 0;
    if (a > b + 1e-9) return false;
    if (a < b - 1e-9) strictlyWorse = true;
  }
  return strictlyWorse;
}

/** Same-tier pairs where one hull is Pareto-dominated under live dimensions. */
export function findDominatedSameTierHulls(ships = SHIPS) {
  const byTier = new Map();
  for (const def of ships) {
    if (!byTier.has(def.tier)) byTier.set(def.tier, []);
    byTier.get(def.tier).push(def);
  }
  const dominated = [];
  for (const [tier, group] of byTier) {
    if (group.length < 2) continue;
    for (const a of group) {
      const dimA = computeHullDimensions(a);
      for (const b of group) {
        if (a.id === b.id) continue;
        const dimB = computeHullDimensions(b);
        if (isDominatedBy(dimA, dimB)) {
          dominated.push(Object.freeze({
            tier, dominatedId: a.id, byId: b.id, dimA, dimB,
          }));
        }
      }
    }
  }
  return dominated;
}

/** Validate lattice covers SHIPS 1:1 and adjacency/role consistency. */
export function validateRoleLattice(ships = SHIPS) {
  const errors = [];
  const shipIds = ships.map((s) => s.id);
  if (shipIds.length !== 13) errors.push('expected exactly 13 ships, got ' + shipIds.length);
  if (LATTICE_SHIP_IDS.length !== 13) errors.push('lattice rows must be exactly 13');

  for (const id of shipIds) {
    if (!SHIP_ROLE_LATTICE[id]) errors.push('missing lattice row for ' + id);
  }
  for (const id of LATTICE_SHIP_IDS) {
    if (!SHIP_BY_ID.has(id)) errors.push('lattice orphan shipId ' + id);
    if (!SHIP_ROLE_PATHS[id]) errors.push('missing role path for ' + id);
  }

  const roles = new Set();
  for (const def of ships) {
    const row = SHIP_ROLE_LATTICE[def.id];
    if (!row) continue;
    if (row.role !== def.role) {
      errors.push(def.id + ' lattice.role ' + row.role + ' != hull.role ' + def.role);
    }
    roles.add(row.role);
    for (const nextId of row.upgradeAdjacency || []) {
      const next = SHIP_BY_ID.get(nextId);
      if (!next) {
        errors.push(def.id + ' adjacency to unknown ' + nextId);
        continue;
      }
      if ((next.tier || 0) < (def.tier || 0)) {
        errors.push(def.id + ' adjacency ' + nextId + ' drops tier');
      }
    }
    for (const career of CAREER_IDS) {
      const s = row.careerFit[career];
      if (!(s >= 0 && s <= 1)) errors.push(def.id + ' careerFit.' + career + ' out of range');
    }
    for (const biasKey of ['opMassBias', 'handlingBias', 'thrustBias', 'turnBias']) {
      const v = row[biasKey];
      if (!(v >= 0.8 && v <= 1.2)) errors.push(def.id + ' ' + biasKey + ' outside safe band');
    }

    const path = planHullRolePath(def.id);
    if (!path || !path.signatureVerb || !path.counterplay || path.items.length < 2) {
      errors.push(def.id + ' role path must name a verb, counterplay, and at least two fittings');
    }
    const freeSlots = [];
    for (const [type, entries] of Object.entries(def.slots || {})) {
      for (const entry of entries) {
        freeSlots.push({ type, size: typeof entry === 'string' ? entry : (entry && entry.size) || 'S' });
      }
    }
    for (const item of (path && path.items) || []) {
      const fitDef = FITTABLE_BY_ID.get(item.defId);
      if (!fitDef) {
        errors.push(def.id + ' role path references unknown fitting ' + item.defId);
        continue;
      }
      for (let n = 0; n < item.count; n++) {
        const slotIndex = freeSlots.findIndex((slot) => slot.type === fitDef.slotType
          && (SIZE_RANK[slot.size] || 0) >= (SIZE_RANK[fitDef.size] || 0));
        if (slotIndex < 0) errors.push(def.id + ' role path cannot fit ' + item.defId + ' x' + item.count);
        else freeSlots.splice(slotIndex, 1);
      }
    }
  }

  // Starter must remain the only free T0 and keep mixed slots.
  const starter = ships.find((s) => s.id === 'ship_kestrel');
  if (!starter || starter.tier !== 0 || starter.price !== 0) {
    errors.push('starter Hitch must remain free T0');
  }
  if (starter) {
    const hasMine = slotEntries(starter, 'mining').length > 0;
    const hasWpn = slotEntries(starter, 'weapon').length > 0;
    const hasCargo = (starter.cargo || 0) >= 30;
    if (!hasMine || !hasWpn || !hasCargo) errors.push('starter must keep mixed weapon/mining/cargo identity');
  }

  const dominated = findDominatedSameTierHulls(ships);
  for (const d of dominated) {
    errors.push('dominated same-tier: ' + d.dominatedId + ' by ' + d.byId + ' (T' + d.tier + ')');
  }

  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
    roleCount: roles.size,
    shipCount: shipIds.length,
    latticeCount: LATTICE_SHIP_IDS.length,
    dominated,
  });
}
