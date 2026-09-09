// PQ-155.00 — committed hour → verb → cost → gate table for TECH_NODES.
//
// Hours are honest, not the §15.1 wish. First research is RP-gated at 60–90 min
// (recon_scan), not 15 min. Do not retune these hours to hide the canyon.
// PQ-155.01 owns the ten-hour sim; this file also holds unlock helpers.
//
// tech.js stays import-free; this file is the table.

import { NEW_GAME } from './newGameDefaults.js';
import { TECH_NODES } from './tech.js';

/** Gemini / recon_scan: 10 RP takes 60–90 min. Midpoint 75 min → 8 RP/h. */
export const FIRST_UPGRADE_MINUTES = Object.freeze({ min: 60, max: 90, midpoint: 75 });
export const TARGET_FIRST_UPGRADE_MINUTES = 15;

/**
 * Characterization rates only. Credits use the hunter cohort floor (62.5 cr/min
 * in missions.js comments) as an optimistic early faucet. RP uses the Gemini
 * recon_scan midpoint. Late nodes will look slow; do not invent a late-game
 * credit rate to hide the canyon.
 */
export const VERB_LADDER_RATES = Object.freeze({
  startCredits: NEW_GAME.credits,
  startRp: NEW_GAME.researchPoints || 0,
  rpPerHour: 10 / (FIRST_UPGRADE_MINUTES.midpoint / 60),
  creditsPerHour: 62.5 * 60,
});

/** Already folded before this leaf. No new fold in PQ-155.00. */
export const FOLDED_TECH_NODES = Object.freeze([
  Object.freeze({
    id: 'tech_advanced_navigation',
    foldedInto: 'tech_long_range_survey',
    reason: 'Pure jump-range / cooldown stats. Saves keep persisted efficiencyMods.',
  }),
]);

/** Strict leftover: no ship and no module. */
export const STRICT_STAT_ONLY_IDS = Object.freeze([
  'tech_drone_swarm',
  'tech_autonomous_fleets',
  'tech_outpost_charter',
]);

/**
 * Broad leftover: hull-license-only ships, plus two modules that only enlarge
 * a verb the player already has (shield / hold).
 */
export const BROAD_PASSIVE_IDS = Object.freeze([
  'tech_hardened_deflectors',
  'tech_matter_compression',
]);

export const STAT_ONLY_JUSTIFICATIONS = Object.freeze({
  tech_drone_swarm:
    'No ship or module. Raises droneTierCap and extraDronePerBay on the bay unlocked at drone_control. Folding into drone_control would collapse the tier ladder bay tests pin. Keep until a distinct swarm chassis exists.',
  tech_autonomous_fleets:
    'No ship or module. Hire-trader flag plus a tier cap. Hiring is a menu, not a field verb. Folding into drone_swarm would bury the hire behind a cap bump.',
  tech_outpost_charter:
    'No ship or module. Outpost-construction flag plus a tier cap. Placement is not yet a field verb on the default route. Folding into fleets would bury a late flag.',
  tech_industrial_mining:
    'Hull license only (Ironback). Same mining verb as the starter laser, on a barge. Not folded: ships.js keys the hull to this id (ships.js is out of this write set).',
  tech_strike_craft:
    'Hull license only (Hornet). Same guns as combat_basics, on a faster body. Not folded: a T2 interceptor at first upgrade would smash the ladder.',
  tech_warship_license:
    'Hull license only (Bastion). A heavier body, not a new shot or line. Not folded: the corvette buy is a distinct save key.',
  tech_capital_hulls:
    'Hull license only (Colossus). The siege verbs sit on capital_weapons / flagship. Not folded: merging would skip the hull gate ships.js requires.',
  tech_hardened_deflectors:
    'Aegis L plus 5% regen. Same "raise a shield" verb as deflector_theory. Not folded: Aegis is a distinct module id in modules.js (out of this write set).',
  tech_matter_compression:
    'Cargo compactor. More hold, not a new carry verb — bulk_logistics already gives the Atlas and an expander. Not folded: module id lives in modules.js.',
});

const VERBS = Object.freeze({
  tech_combat_basics: 'Fit a second gun and fly the Wasp',
  tech_beam_focusing: 'Hold a beam on a hull',
  tech_kinetic_drivers: 'Throw a rail slug or a concussion shove',
  tech_guided_ordnance: 'Fire a seeking rack or drop a vector mine',
  tech_plasma_dynamics: 'EMP a ship or kill its RCS',
  tech_deflector_theory: 'Raise a capacitor shield or throw chaff',
  tech_hardened_deflectors: 'Fit a larger Aegis (same shield verb)',
  tech_strike_craft: 'Fly the Hornet (hull license)',
  tech_fire_control: 'Sweep, snare, or bridle on the Massline; 6x spool',
  tech_warship_license: 'Fly the Bastion (hull license)',
  tech_capital_weapons: 'Fly the Warden; fire a heavy beam or torpedo',
  tech_capital_hulls: 'Fly the Colossus (hull license)',
  tech_flagship_command: 'Fly the Leviathan; fire the siege lance',
  tech_attack_topology: 'Twin or triad mount; pierce or fork a shot',
  tech_ricochet_ballistics: 'Bank a shot off a hull',
  tech_payload_conduction: 'Ion, burn, cryo, or gravity-tag a payload',
  tech_orbit_cryo: 'Lock a target in a cryo orbit',
  tech_industrial_mining: 'Fly the Ironback barge (hull license)',
  tech_focused_extraction: 'Cut rock with a medium mining beam',
  tech_deep_core_mining: 'Pulverize or industrial-extract a rock',
  tech_bulk_logistics: 'Fly the Atlas; run an industrial spool',
  tech_matter_compression: 'Compact the hold (same carry verb)',
  tech_drive_tuning: 'Fit fusion, afterburner, jump, or cloak',
  tech_impulse_ballistics: 'Throw a vector charge',
  tech_graviton_drives: 'Mark gravity, sink momentum, or shunt inertia',
  tech_long_range_survey: 'Fly the Ranger; open a wormhole',
  tech_tractor_systems: 'Tow, whip, or couple a body',
  tech_drone_control: 'Launch a drone from a bay',
  tech_drone_swarm: 'More drones / higher tier (no new chassis)',
  tech_autonomous_fleets: 'Hire an NPC trader (menu, not a field verb)',
  tech_nanofabrication: 'Repair with nanobots',
  tech_outpost_charter: 'Plant an outpost flag (not yet a field verb)',
});

function list(value) {
  return Array.isArray(value) ? value : [];
}

export function nodeUnlocksShipOrModule(node) {
  const unlocks = node && node.unlocks ? node.unlocks : {};
  return list(unlocks.ships).length + list(unlocks.modules).length > 0;
}

export function isHullLicenseOnly(node) {
  const unlocks = node && node.unlocks ? node.unlocks : {};
  return list(unlocks.ships).length > 0 && list(unlocks.modules).length === 0;
}

export function classifyTechNode(node, mode = 'strict') {
  if (!nodeUnlocksShipOrModule(node)) return 'stat-only';
  if (mode === 'broad' && (isHullLicenseOnly(node) || BROAD_PASSIVE_IDS.includes(node.id))) {
    return 'stat-only';
  }
  return 'verb';
}

export function countVerbVsStatOnly(nodes = TECH_NODES, mode = 'strict') {
  let verb = 0;
  let statOnly = 0;
  const statOnlyIds = [];
  for (const node of nodes) {
    if (classifyTechNode(node, mode) === 'verb') verb += 1;
    else {
      statOnly += 1;
      statOnlyIds.push(node.id);
    }
  }
  return { verb, statOnly, statOnlyIds, total: nodes.length };
}

function pathIdsFor(nodeId, byId) {
  const seen = new Set();
  const stack = [nodeId];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (!node) {
      throw new Error(`techVerbLadder: unknown tech id ${id}`);
    }
    for (const prereq of list(node.prereqs)) stack.push(prereq);
  }
  return seen;
}

export function pathCostFor(nodeId, nodes = TECH_NODES) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let credits = 0;
  let rp = 0;
  for (const id of pathIdsFor(nodeId, byId)) {
    const cost = byId.get(id).cost || {};
    credits += Number(cost.credits) || 0;
    rp += Number(cost.rp) || 0;
  }
  return { credits, rp };
}

export function honestHoursForCost(cost, rates = VERB_LADDER_RATES) {
  const creditNeed = Math.max(0, (Number(cost.credits) || 0) - rates.startCredits);
  const rpNeed = Math.max(0, (Number(cost.rp) || 0) - rates.startRp);
  const creditHours = creditNeed / rates.creditsPerHour;
  const rpHours = rpNeed / rates.rpPerHour;
  const hour = Math.max(creditHours, rpHours);
  return {
    hour,
    creditHours,
    rpHours,
    bottleneck: rpHours >= creditHours ? 'rp' : 'credits',
  };
}

function buildLadder(nodes) {
  const rows = nodes.map((node) => {
    const pathCost = pathCostFor(node.id, nodes);
    const timing = honestHoursForCost(pathCost);
    const kindStrict = classifyTechNode(node, 'strict');
    const kindBroad = classifyTechNode(node, 'broad');
    const justification = STAT_ONLY_JUSTIFICATIONS[node.id] || null;
    return Object.freeze({
      hour: Number(timing.hour.toFixed(2)),
      nodeId: node.id,
      name: node.name,
      branch: node.branch,
      verb: VERBS[node.id] || node.name,
      cost: Object.freeze({
        credits: Number(node.cost && node.cost.credits) || 0,
        rp: Number(node.cost && node.cost.rp) || 0,
      }),
      gate: Object.freeze({
        prereqs: Object.freeze(list(node.prereqs).slice()),
        pathCredits: pathCost.credits,
        pathRp: pathCost.rp,
        creditHours: Number(timing.creditHours.toFixed(2)),
        rpHours: Number(timing.rpHours.toFixed(2)),
        bottleneck: timing.bottleneck,
      }),
      kindStrict,
      kindBroad,
      justification,
    });
  });
  rows.sort((a, b) => a.hour - b.hour || a.nodeId.localeCompare(b.nodeId));
  return Object.freeze(rows);
}

export const TECH_VERB_LADDER = buildLadder(TECH_NODES);

const firstRow = TECH_VERB_LADDER[0];

export const FIRST_UPGRADE = Object.freeze({
  nodeId: firstRow.nodeId,
  hour: firstRow.hour,
  hourMinutes: FIRST_UPGRADE_MINUTES,
  targetMinutes: TARGET_FIRST_UPGRADE_MINUTES,
  meetsTarget: firstRow.hour * 60 <= TARGET_FIRST_UPGRADE_MINUTES,
  bottleneck: firstRow.gate.bottleneck,
  startCredits: VERB_LADDER_RATES.startCredits,
  startRp: VERB_LADDER_RATES.startRp,
  cost: firstRow.cost,
  shortfallCredits: Math.max(0, firstRow.cost.credits - VERB_LADDER_RATES.startCredits),
  shortfallRp: Math.max(0, firstRow.cost.rp - VERB_LADDER_RATES.startRp),
});

/** Preferred branch order when the ten-hour sim spends on the next affordable node. */
export const ECONOMY_CURVE_BRANCH_ORDER = Object.freeze({
  hunter: Object.freeze(['combat', 'drives', 'logistics', 'industry']),
  trader: Object.freeze(['industry', 'logistics', 'drives', 'combat']),
  miner: Object.freeze(['industry', 'logistics', 'drives', 'combat']),
});

/**
 * Next-verb goals. The curve sim saves for these instead of dumping RP into
 * whichever cheap combat node is affordable. Off-goal buys are skipped.
 */
export const ECONOMY_CURVE_GOALS = Object.freeze({
  hunter: Object.freeze([
    'tech_combat_basics',
    'tech_beam_focusing',
    'tech_kinetic_drivers',
    'tech_attack_topology',
    'tech_guided_ordnance',
    'tech_deflector_theory',
  ]),
  trader: Object.freeze([
    'tech_tractor_systems',
    'tech_bulk_logistics',
    'tech_drive_tuning',
    'tech_deflector_theory',
    'tech_matter_compression',
  ]),
  miner: Object.freeze([
    'tech_industrial_mining',
    'tech_focused_extraction',
    'tech_bulk_logistics',
    'tech_tractor_systems',
    'tech_drive_tuning',
  ]),
});

export function treePathCost(nodes = TECH_NODES) {
  let credits = 0;
  let rp = 0;
  for (const node of nodes) {
    const cost = node && node.cost ? node.cost : {};
    credits += Number(cost.credits) || 0;
    rp += Number(cost.rp) || 0;
  }
  return Object.freeze({ credits, rp, nodes: nodes.length });
}

export function verbForNodeId(nodeId, ladder = TECH_VERB_LADDER) {
  const row = ladder.find((entry) => entry.nodeId === nodeId);
  if (row) return row.verb;
  return VERBS[nodeId] || nodeId;
}

export function verbIdsOf(researched, mode = 'strict', nodes = TECH_NODES) {
  const have = new Set(Array.isArray(researched) ? researched : []);
  const ids = [];
  for (const node of nodes) {
    if (!have.has(node.id)) continue;
    if (classifyTechNode(node, mode) === 'verb') ids.push(node.id);
  }
  return ids;
}

export function listAffordableTechNodes(wallet, nodes = TECH_NODES) {
  const have = new Set(wallet && Array.isArray(wallet.researched) ? wallet.researched : []);
  const credits = Number(wallet && wallet.credits) || 0;
  const rp = Number(wallet && wallet.rp) || 0;
  const out = [];
  for (const node of nodes) {
    if (have.has(node.id)) continue;
    const prereqs = list(node.prereqs);
    let ready = true;
    for (const id of prereqs) {
      if (!have.has(id)) { ready = false; break; }
    }
    if (!ready) continue;
    const cost = node.cost || {};
    if (credits < (Number(cost.credits) || 0)) continue;
    if (rp < (Number(cost.rp) || 0)) continue;
    out.push(node);
  }
  return out;
}

export function pickNextTechUnlock(wallet, archetype, nodes = TECH_NODES, ladder = TECH_VERB_LADDER) {
  const candidates = listAffordableTechNodes(wallet, nodes);
  if (!candidates.length) return null;
  const goals = ECONOMY_CURVE_GOALS[archetype] || [];
  if (goals.length) {
    const researched = new Set(wallet && Array.isArray(wallet.researched) ? wallet.researched : []);
    const affordable = new Map(candidates.map((node) => [node.id, node]));
    for (const id of goals) {
      if (researched.has(id)) continue;
      return affordable.get(id) || null;
    }
    return null;
  }
  const prefs = ECONOMY_CURVE_BRANCH_ORDER[archetype] || [];
  const hourById = new Map(ladder.map((row) => [row.nodeId, row.hour]));
  let best = null;
  let bestPref = 99;
  let bestHour = Infinity;
  for (const node of candidates) {
    const prefIdx = prefs.indexOf(node.branch);
    const pref = prefIdx === -1 ? 99 : prefIdx;
    const hour = hourById.has(node.id) ? hourById.get(node.id) : Infinity;
    if (
      !best
      || pref < bestPref
      || (pref === bestPref && hour < bestHour)
      || (pref === bestPref && hour === bestHour && node.id.localeCompare(best.id) < 0)
    ) {
      best = node;
      bestPref = pref;
      bestHour = hour;
    }
  }
  return best;
}

export function purchaseAffordableTech(wallet, archetype, nodes = TECH_NODES, ladder = TECH_VERB_LADDER) {
  const bought = [];
  if (!wallet || typeof wallet !== 'object') return bought;
  if (!Array.isArray(wallet.researched)) wallet.researched = [];
  while (true) {
    const next = pickNextTechUnlock(wallet, archetype, nodes, ladder);
    if (!next) break;
    const cost = next.cost || {};
    wallet.credits = (Number(wallet.credits) || 0) - (Number(cost.credits) || 0);
    wallet.rp = (Number(wallet.rp) || 0) - (Number(cost.rp) || 0);
    wallet.researched.push(next.id);
    bought.push({
      id: next.id,
      name: next.name,
      branch: next.branch,
      verb: verbForNodeId(next.id, ladder),
      credits: Number(cost.credits) || 0,
      rp: Number(cost.rp) || 0,
    });
  }
  return bought;
}

export function assertCommittedLadder(ladder = TECH_VERB_LADDER) {
  const errors = [];
  if (ladder.length !== TECH_NODES.length) {
    errors.push(`ladder rows ${ladder.length} !== nodes ${TECH_NODES.length}`);
  }
  const nodeIds = new Set(TECH_NODES.map((node) => node.id));
  for (const row of ladder) {
    if (!nodeIds.has(row.nodeId)) errors.push(`unknown ladder row ${row.nodeId}`);
    if (!(typeof row.hour === 'number' && row.hour > 0)) errors.push(`${row.nodeId} missing hour`);
    if (!(typeof row.verb === 'string' && row.verb.length > 0)) errors.push(`${row.nodeId} missing verb`);
    if (!row.cost || !Number.isFinite(row.cost.credits) || !Number.isFinite(row.cost.rp)) {
      errors.push(`${row.nodeId} missing cost`);
    }
    if (!row.gate || (row.gate.bottleneck !== 'rp' && row.gate.bottleneck !== 'credits')) {
      errors.push(`${row.nodeId} missing gate`);
    }
    const node = TECH_NODES.find((entry) => entry.id === row.nodeId);
    if (node) {
      if (row.cost.credits !== (Number(node.cost && node.cost.credits) || 0)) {
        errors.push(`${row.nodeId} credit cost drifted from tech.js`);
      }
      if (row.cost.rp !== (Number(node.cost && node.cost.rp) || 0)) {
        errors.push(`${row.nodeId} RP cost drifted from tech.js`);
      }
    }
  }
  if (FIRST_UPGRADE.nodeId !== 'tech_combat_basics') {
    errors.push(`first upgrade is ${FIRST_UPGRADE.nodeId}, expected tech_combat_basics`);
  }
  if (FIRST_UPGRADE.meetsTarget) {
    errors.push('first upgrade was faked to the 15-minute wish');
  }
  const minutes = FIRST_UPGRADE.hour * 60;
  if (minutes < FIRST_UPGRADE_MINUTES.min - 0.01 || minutes > FIRST_UPGRADE_MINUTES.max + 0.01) {
    errors.push(`first upgrade ${minutes} min is outside the honest 60–90 band`);
  }
  if (FIRST_UPGRADE.bottleneck !== 'rp') {
    errors.push(`first upgrade bottleneck is ${FIRST_UPGRADE.bottleneck}, expected rp`);
  }
  if (FIRST_UPGRADE.targetMinutes !== TARGET_FIRST_UPGRADE_MINUTES) {
    errors.push('15-minute wish constant drifted');
  }
  return { ok: errors.length === 0, errors, firstUpgrade: FIRST_UPGRADE };
}
