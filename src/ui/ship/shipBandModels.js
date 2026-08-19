import { SHIPS } from '../../data/ships.js';
import { MODULES } from '../../data/modules.js';
import { TECH_NODES } from '../../data/tech.js';
import {
  LIVING_HULL_HEAT_SCORCH_MAX,
  LIVING_HULL_KILL_TALLY_MAX,
  LIVING_HULL_REPAIR_PATCH_MAX,
  livingHullCyclesSinceWash,
  livingHullGrimeAt,
  normalizeLivingHull,
} from '../../core/livingHull.js';
import { getDerivedStats } from '../../systems/ships.js';
import { handlingProfileForShip } from '../panels/handlingProfile.js';
import { stopDistanceEstimate } from '../panels/massDelta.js';
import { describeTechNodeReadiness } from '../screens/techTree.js';

const SHIP_BY_ID = new Map(SHIPS.map((shipDef) => [shipDef.id, shipDef]));
const MODULE_BY_ID = new Map(MODULES.map((moduleDef) => [moduleDef.id, moduleDef]));

const MASSLINE_BANK = Object.freeze({
  tractor: Object.freeze({ id: 'tractor', verb: 'Tow things that do not want to be towed', sub: 'TRACTOR' }),
  elastic_whip: Object.freeze({ id: 'elastic_whip', verb: 'Store a swing and give it back', sub: 'SPRING' }),
  frame_coupler: Object.freeze({ id: 'frame_coupler', verb: 'Hold two hulls together without tearing', sub: 'COUPLER' }),
  monofilament_sweep: Object.freeze({ id: 'monofilament_sweep', verb: 'Cut a hostile line', sub: 'SWEEP' }),
  transverse_snare: Object.freeze({ id: 'transverse_snare', verb: 'Snare something crossing your path', sub: 'SNARE' }),
  twin_bridle: Object.freeze({ id: 'twin_bridle', verb: 'Anchor to two points at once', sub: 'BRIDLE' }),
});

const PATCH_ANCHORS = Object.freeze([
  Object.freeze([-0.30, 0.335, 0.23]),
  Object.freeze([0.32, 0.326, -0.22]),
  Object.freeze([-0.06, 0.35, -0.31]),
  Object.freeze([-0.48, 0.295, -0.06]),
]);

const SCORCH_ANCHORS = Object.freeze([
  Object.freeze([-0.42, 0.372, 0.18]),
  Object.freeze([-0.56, 0.34, -0.18]),
  Object.freeze([-0.28, 0.36, -0.30]),
]);

const KILL_ANCHOR = Object.freeze([0.12, 0.37, 0.19]);
const GRIME_ANCHOR = Object.freeze([-0.08, 0.366, 0]);
const GRAFFITI_ANCHOR = Object.freeze([-0.20, 0.382, -0.05]);

const TECH_NODE_BY_ID = new Map(TECH_NODES.map((node) => [node.id, node]));
const NODE_DEPTH_BY_ID = new Map();

function nodeDepth(nodeId, visited = new Set()) {
  if (NODE_DEPTH_BY_ID.has(nodeId)) return NODE_DEPTH_BY_ID.get(nodeId);
  if (visited.has(nodeId)) return 0;
  visited.add(nodeId);
  const node = TECH_NODE_BY_ID.get(nodeId);
  if (!node || !Array.isArray(node.prereqs) || !node.prereqs.length) {
    NODE_DEPTH_BY_ID.set(nodeId, 0);
    visited.delete(nodeId);
    return 0;
  }
  let depth = 0;
  for (const prereq of node.prereqs) {
    depth = Math.max(depth, nodeDepth(prereq, visited) + 1);
  }
  visited.delete(nodeId);
  NODE_DEPTH_BY_ID.set(nodeId, depth);
  return depth;
}

function shortestNodeForModule(moduleId) {
  let best = null;
  for (const node of TECH_NODES) {
    const modules = (node && node.unlocks && node.unlocks.modules) || [];
    if (!modules.includes(moduleId)) continue;
    const depth = nodeDepth(node.id);
    if (!best || depth < best.depth || (depth === best.depth && byCost(node, best.node) < 0)) {
      best = { node, depth };
    }
  }
  return best;
}

const AGILITY_MEDIAN = (() => {
  const values = [];
  for (const shipDef of SHIPS) {
    const profile = handlingProfileForShip(shipDef.id, { fittings: [], player: null });
    const axis = profile && Array.isArray(profile.axes)
      ? profile.axes.find((row) => row.id === 'agility')
      : null;
    if (axis && Number.isFinite(Number(axis.raw))) values.push(Number(axis.raw));
  }
  if (!values.length) return 1;
  values.sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : ((values[mid - 1] + values[mid]) * 0.5);
})();

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round1(value) {
  return Math.round(finite(value, 0) * 10) / 10;
}

function roundInt(value) {
  return Math.round(finite(value, 0));
}

function signedPercent(value) {
  const rounded = Math.round(Math.abs(finite(value, 0)));
  return `${rounded}%`;
}

function ratioFor(derived, shipDef) {
  const base = Math.max(0.001, finite(shipDef && shipDef.mass, 1));
  const feelMass = finite(
    derived && (derived.operationalFeelMass != null ? derived.operationalFeelMass : derived.operationalMass),
    finite(derived && derived.operationalMass, base),
  );
  return feelMass / base;
}

function turnMassForRatio(ratio) {
  return 1.4 / (0.4 + Math.max(0.001, finite(ratio, 1)));
}

function speedMassForRatio(ratio) {
  return 2 / (1 + Math.max(0.001, finite(ratio, 1)));
}

function percentDelta(after, before) {
  const b = finite(before, 0);
  if (Math.abs(b) < 1e-6) return 0;
  return ((finite(after, 0) / b) - 1) * 100;
}

function withCargoMass(player, usedMass) {
  const source = player && typeof player === 'object' ? player : {};
  return {
    ...source,
    cargo: {
      ...(source.cargo && typeof source.cargo === 'object' ? source.cargo : {}),
      usedMass: Math.max(0, finite(usedMass, 0)),
    },
  };
}

function formatMass(value) {
  return `${Math.round(Math.max(0, finite(value, 0))).toLocaleString('en-US')} t`;
}

function formatUnits(value, suffix = '') {
  const rounded = roundInt(value).toLocaleString('en-US');
  return `${rounded}${suffix}`;
}

function formatMultiplier(value) {
  const n = round1(value);
  return Number.isInteger(n) ? String(n) : String(n.toFixed(1));
}

function conditionToneForRatio(ratio) {
  if (ratio == null) return 'calm';
  if (ratio >= 0.95) return 'calm';
  if (ratio >= 0.75) return 'calm';
  if (ratio >= 0.45) return 'goal';
  return 'foe';
}

export function conditionFromEntity(entity) {
  if (!entity) {
    return {
      verb: 'STOWED',
      tone: 'calm',
      ratio: null,
      percentText: '',
      why: '',
    };
  }
  const hullMax = Math.max(0, finite(entity.hullMax, 0));
  const hullNow = clamp(finite(entity.hull, 0), 0, hullMax);
  const ratio = hullMax > 0 ? hullNow / hullMax : 0;
  let verb = 'WRECKED';
  if (ratio >= 0.95) verb = 'SOUND';
  else if (ratio >= 0.75) verb = 'SCRAPED';
  else if (ratio >= 0.45) verb = 'HURT';
  else if (ratio >= 0.20) verb = 'BADLY HURT';
  else if (ratio > 0) verb = 'FAILING';
  const shieldNow = Math.round(Math.max(0, finite(entity.shield, 0)));
  const shieldMax = Math.round(Math.max(0, finite(entity.shieldMax, 0)));
  const armorMax = Math.round(Math.max(0, finite(entity.armorMax, 0)));
  const armorNow = Math.round(Math.max(0, finite(entity.armorHp, 0)));
  const pieces = [
    `Hull ${Math.round(hullNow)}/${Math.round(hullMax)}`,
    `Shield ${shieldNow}/${shieldMax}`,
  ];
  if (armorMax > 0) pieces.push(`Armour ${armorNow}/${armorMax}`);
  return {
    verb,
    tone: conditionToneForRatio(ratio),
    ratio,
    percentText: `${Math.round(ratio * 100)}%`,
    why: pieces.join(' | '),
  };
}

function handlingSentence(profile, derived, emptyDerived) {
  if (!profile || !Array.isArray(profile.axes) || !profile.axes.length) return '';
  const agilityAxis = profile.axes.find((axis) => axis.id === 'agility');
  const brakeAxis = profile.axes.find((axis) => axis.id === 'brake');
  const clauses = [];
  if (agilityAxis) {
    if (agilityAxis.bar >= 67) clauses.push('Turns hard.');
    else if (agilityAxis.bar >= 34) clauses.push('Turns steadily.');
    else clauses.push('Turns wide.');
  }
  const shipDef = SHIP_BY_ID.get(profile.shipId);
  const massRatio = ratioFor(derived, shipDef);
  if (massRatio < 0.9) clauses.push('Light on the stick.');
  else if (massRatio > 1.15) clauses.push('Sluggish under load.');
  if (brakeAxis) clauses.push(brakeAxis.bar >= 55 ? 'Stops clean.' : 'Stops badly.');
  const cargoMass = finite(derived && derived.cargoMass, 0);
  if (cargoMass > 0) {
    const loadedStop = stopDistanceEstimate(derived && derived.flightModel);
    const emptyStop = stopDistanceEstimate(emptyDerived && emptyDerived.flightModel);
    const extra = Math.max(0, Math.round(loadedStop - emptyStop));
    if (extra > 0) clauses.push(`Loaded, it stops ${extra} m later.`);
  }
  return clauses.join(' ');
}

function agilityWhy({ shipDef, derived, dryDerived, bareDerived }) {
  const cargoMass = finite(derived && derived.cargoMass, 0);
  const moduleMass = Math.max(0, finite(derived && derived.dryMass, finite(shipDef && shipDef.mass, 0)) - finite(shipDef && shipDef.mass, 0));
  const loadedRatio = ratioFor(derived, shipDef);
  const dryRatio = ratioFor(dryDerived, shipDef);
  const bareRatio = ratioFor(bareDerived, shipDef);
  const cargoPenalty = cargoMass > 0
    ? percentDelta(turnMassForRatio(loadedRatio), turnMassForRatio(dryRatio))
    : 0;
  const modulePenalty = moduleMass > 0
    ? percentDelta(turnMassForRatio(dryRatio), turnMassForRatio(bareRatio))
    : 0;
  const agilityRaw = finite(derived && derived.flightModel && derived.flightModel.angularAccel, 0);
  const hullShift = percentDelta(agilityRaw, AGILITY_MEDIAN);
  const rows = [];
  if (cargoMass > 0) {
    rows.push({
      key: 'cargo',
      magnitude: Math.abs(cargoPenalty),
      why: `${formatMass(cargoMass)} of cargo. That is why you turn ${signedPercent(cargoPenalty)} slower than empty.`,
    });
  }
  if (moduleMass > 0) {
    rows.push({
      key: 'modules',
      magnitude: Math.abs(modulePenalty),
      why: `${formatMass(moduleMass)} of fitted modules. That is why you turn ${signedPercent(modulePenalty)} slower than bare.`,
    });
  }
  rows.push({
    key: 'hull',
    magnitude: Math.abs(hullShift),
    why: `This frame turns ${signedPercent(hullShift)} ${hullShift >= 0 ? 'faster' : 'slower'} than the roster median.`,
  });
  rows.sort((left, right) => right.magnitude - left.magnitude);
  return rows.length ? rows[0].why : '';
}

function inertiaWhy(derived) {
  const mass = finite(derived && (derived.operationalMass != null ? derived.operationalMass : derived.mass), 0);
  const linearDrag = Math.max(0.001, finite(derived && derived.flightModel && derived.flightModel.linearDrag, 0));
  const settleSeconds = 1 / linearDrag;
  return `${formatMass(mass)} moving. It takes ${round1(settleSeconds)}s to change your mind.`;
}

function topSpeedWhy(profile, derived, dryDerived, shipDef) {
  const loadedRatio = ratioFor(derived, shipDef);
  const dryRatio = ratioFor(dryDerived, shipDef);
  const loadedFactor = speedMassForRatio(loadedRatio);
  const dryFactor = speedMassForRatio(dryRatio);
  const massLoss = (1 - (loadedFactor / Math.max(0.001, dryFactor))) * 100;
  if (massLoss > 1) return `Mass costs you ${Math.round(massLoss)}% of your ceiling.`;
  if (profile && profile.driveLabel) return `The ${profile.driveLabel} sets your ceiling.`;
  return '';
}

function brakeWhy(derived) {
  const stop = Math.round(stopDistanceEstimate(derived && derived.flightModel));
  if (stop <= 0) return '';
  return `From flat out you need ${stop} m to stop.`;
}

export function handlingBandModel({ shipId, fittings = [], player = null, domain = null }) {
  const shipDef = SHIP_BY_ID.get(shipId);
  if (!shipDef) return null;
  const profile = handlingProfileForShip(shipId, { fittings, player, domain });
  if (!profile) return null;
  const derived = getDerivedStats(shipId, fittings, player);
  const dryPlayer = withCargoMass(player, 0);
  const dryDerived = getDerivedStats(shipId, fittings, dryPlayer);
  const bareDerived = getDerivedStats(shipId, [], dryPlayer);
  const bars = [];
  for (const axis of profile.axes) {
    let why = '';
    if (axis.id === 'agility') why = agilityWhy({ shipDef, derived, dryDerived, bareDerived });
    else if (axis.id === 'inertia') why = inertiaWhy(derived);
    else if (axis.id === 'topSpeed') why = topSpeedWhy(profile, derived, dryDerived, shipDef);
    else if (axis.id === 'brake') why = brakeWhy(derived);
    bars.push({
      id: axis.id,
      label: axis.label,
      raw: finite(axis.raw, 0),
      bar: clamp(Math.round(finite(axis.bar, 0)), 0, 100),
      why,
    });
  }
  return {
    shipId,
    profile,
    derived,
    bars,
    crestSentence: handlingSentence(profile, derived, dryDerived),
  };
}

function subFromDerivedChip(chipId, derived, moduleDef = null) {
  switch (chipId) {
    case 'tractor':
    case 'elastic_whip':
    case 'frame_coupler':
    case 'monofilament_sweep':
    case 'transverse_snare':
    case 'twin_bridle':
      return MASSLINE_BANK[chipId === 'elastic_whip' ? 'elastic_whip' : chipId].sub;
    case 'spool':
      return `x${formatMultiplier(derived.tetherSpoolMult)} line`;
    case 'reel':
      return `x${formatMultiplier(derived.tetherReelRateMult)} reel`;
    case 'magnet':
      return `${formatUnits(derived.magnetRange, ' wu')}`;
    case 'drone':
      return `${formatUnits(derived.droneBayCount)} bay`;
    case 'jump': {
      const tier = String(derived.jumpDriveTier || '').replace(/^jump_/, '').toUpperCase();
      return tier || 'T1';
    }
    case 'repair':
      return `${formatUnits(derived.hullRepairOOC, '/s')}`;
    case 'hidden':
      return `${formatUnits(Math.round(finite(derived.hiddenCargoPct, 0) * 100), '% hidden')}`;
    case 'cloak':
      return `${formatUnits(Math.round(finite(derived.scannerCloak, 0) * 100), '%')}`;
    case 'ram':
      return `x${formatMultiplier(derived.ramDamageDealtMult)}`;
    case 'dash':
      return `${formatUnits(derived.boost && derived.boost.dashImpulse, ' impulse')}`;
    case 'tough': {
      const cut = Math.max(0, 1 - finite(derived.damageReductionMult, 1));
      return `-${formatUnits(Math.round(cut * 100), '%')}`;
    }
    case 'range': {
      const plus = Math.max(0, Math.round((finite(derived.weaponRangeMult, 1) - 1) * 100));
      return `+${formatUnits(plus, '%')}`;
    }
    case 'radar':
      return `${formatUnits(derived.radarRange, ' wu')}`;
    case 'cargo':
      return `${formatUnits(derived.cargoCap, ' u')}`;
    default:
      if (moduleDef && moduleDef.mods && moduleDef.mods.masslineHeadId && MASSLINE_BANK[moduleDef.mods.masslineHeadId]) {
        return MASSLINE_BANK[moduleDef.mods.masslineHeadId].sub;
      }
      return '';
  }
}

function capabilityDefinitions(derived) {
  const defs = [];
  if (derived.masslineHeadId && MASSLINE_BANK[derived.masslineHeadId]) {
    const row = MASSLINE_BANK[derived.masslineHeadId];
    defs.push({ id: row.id, verb: row.verb, tone: 'you' });
  }
  if (finite(derived.tetherSpoolMult, 1) > 1) defs.push({ id: 'spool', verb: 'Swing off things further away', tone: 'you' });
  if (finite(derived.tetherReelRateMult, 1) > 1) defs.push({ id: 'reel', verb: 'Reel in faster than they can pull away', tone: 'you' });
  if (finite(derived.magnetRange, 0) > 0) defs.push({ id: 'magnet', verb: 'Scoop cargo without stopping', tone: 'you' });
  if (finite(derived.droneBayCount, 0) > 0) defs.push({ id: 'drone', verb: `Put ${formatUnits(derived.droneBayCount)} drone(s) in the water`, tone: 'you' });
  if (String(derived.jumpDriveTier || '') !== 'jump_t1') defs.push({ id: 'jump', verb: 'Reach further out', tone: 'you' });
  if (finite(derived.hullRepairOOC, 0) > 0) defs.push({ id: 'repair', verb: 'Heal between fights', tone: 'you' });
  if (finite(derived.hiddenCargoPct, 0) > 0) defs.push({ id: 'hidden', verb: 'Carry what you should not be carrying', tone: 'foe' });
  if (finite(derived.scannerCloak, 0) > 0) defs.push({ id: 'cloak', verb: 'Read quieter than you are', tone: 'foe' });
  if (finite(derived.ramDamageDealtMult, 0) > 0) defs.push({ id: 'ram', verb: 'Use your own hull as the weapon', tone: 'you' });
  if (derived.boost && finite(derived.boost.dashImpulse, 0) > 0) defs.push({ id: 'dash', verb: 'Break away instantly', tone: 'you' });
  if (finite(derived.damageReductionMult, 1) < 1) defs.push({ id: 'tough', verb: 'Take the hit and keep going', tone: 'you' });
  if (finite(derived.weaponRangeMult, 1) > 1) defs.push({ id: 'range', verb: 'Reach them before they reach you', tone: 'you' });
  if (finite(derived.radarRangeMult, 1) > 1) defs.push({ id: 'radar', verb: 'See them first', tone: 'you' });
  if (finite(derived.cargoCap, 0) > 0) defs.push({ id: 'cargo', verb: `Carry ${formatUnits(derived.cargoCap)} units`, tone: 'calm' });
  const unique = [];
  const seen = new Set();
  for (const row of defs) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    unique.push(row);
  }
  return unique;
}

function capabilityFromModule(moduleId) {
  const moduleDef = MODULE_BY_ID.get(moduleId);
  if (!moduleDef) return null;
  const mods = moduleDef.mods || {};
  if (mods.masslineHeadId && MASSLINE_BANK[mods.masslineHeadId]) {
    const entry = MASSLINE_BANK[mods.masslineHeadId];
    return { id: entry.id, verb: entry.verb };
  }
  if (finite(mods.tetherSpoolMult, 1) > 1) return { id: 'spool', verb: 'Swing off things further away' };
  if (finite(mods.tetherReelRateMult, 1) > 1) return { id: 'reel', verb: 'Reel in faster than they can pull away' };
  if (finite(mods.magnetRange, 0) > 0) return { id: 'magnet', verb: 'Scoop cargo without stopping' };
  if (finite(mods.droneBay, 0) > 0) return { id: 'drone', verb: `Put ${formatUnits(mods.droneBay)} drone(s) in the water` };
  if (finite(mods.jumpDriveTier, 1) > 1) return { id: 'jump', verb: 'Reach further out' };
  if (finite(mods.hullRepairOOC, 0) > 0) return { id: 'repair', verb: 'Heal between fights' };
  if (finite(mods.hiddenCargoPct, 0) > 0) return { id: 'hidden', verb: 'Carry what you should not be carrying' };
  if (finite(mods.scannerCloak, 0) > 0) return { id: 'cloak', verb: 'Read quieter than you are' };
  if (finite(mods.ramDamageDealtMult, 0) > 0) return { id: 'ram', verb: 'Use your own hull as the weapon' };
  if (finite(mods.damageReductionPct, 0) > 0) return { id: 'tough', verb: 'Take the hit and keep going' };
  if (finite(mods.weaponRangePct, 0) > 0) return { id: 'range', verb: 'Reach them before they reach you' };
  if (finite(mods.radarRangePct, 0) > 0) return { id: 'radar', verb: 'See them first' };
  if (finite(mods.cargoFlat, 0) > 0 || finite(mods.cargoCapPct, 0) > 0) return { id: 'cargo', verb: 'Carry more units' };
  return null;
}

function byCost(left, right) {
  const leftRp = finite(left && left.cost && left.cost.rp, 0);
  const rightRp = finite(right && right.cost && right.cost.rp, 0);
  if (leftRp !== rightRp) return leftRp - rightRp;
  const leftCr = finite(left && left.cost && left.cost.credits, 0);
  const rightCr = finite(right && right.cost && right.cost.credits, 0);
  if (leftCr !== rightCr) return leftCr - rightCr;
  return String(left && left.id || '').localeCompare(String(right && right.id || ''));
}

function readinessPhrase(readiness) {
  if (!readiness || !readiness.state) return '';
  if (readiness.state === 'available') return 'Ready to research.';
  if (readiness.state === 'funding') {
    const missing = Array.isArray(readiness.missingCost) ? readiness.missingCost.filter(Boolean) : [];
    return missing.length ? `Short ${missing.join(' and ')}.` : '';
  }
  if (readiness.state === 'locked') {
    const prereqs = Array.isArray(readiness.missingPrereqs) ? readiness.missingPrereqs.filter(Boolean) : [];
    if (prereqs.length === 1) return `Needs ${prereqs[0]} first.`;
    if (prereqs.length > 1) return `Needs ${prereqs.length} earlier steps.`;
  }
  return '';
}

function pickNextNode(state) {
  const available = [];
  const funding = [];
  const locked = [];
  for (const node of TECH_NODES) {
    const modules = (node && node.unlocks && node.unlocks.modules) || [];
    if (!modules.length) continue;
    const moduleId = modules[0];
    const cap = capabilityFromModule(moduleId);
    if (!cap) continue;
    const readiness = describeTechNodeReadiness(node, state, TECH_NODES);
    const packet = { node, moduleId, capability: cap, readiness, depth: nodeDepth(node.id) };
    if (readiness.state === 'available') available.push(packet);
    else if (readiness.state === 'funding') funding.push(packet);
    else if (readiness.state === 'locked') locked.push(packet);
  }
  available.sort((a, b) => byCost(a.node, b.node));
  funding.sort((a, b) => byCost(a.node, b.node));
  locked.sort((a, b) => (a.depth - b.depth) || byCost(a.node, b.node));
  return available[0] || funding[0] || locked[0] || null;
}

export function capabilityBandModel({ derived, state }) {
  if (!derived) return { chips: [], next: null };
  const baseChips = capabilityDefinitions(derived).map((row) => {
    const source = row.id;
    let depth = 0;
    if (row.id === 'cargo') depth = 0;
    else if (row.id === 'dash') depth = 0;
    else {
      const modCandidate = MODULES.find((moduleDef) => {
        const mapped = capabilityFromModule(moduleDef.id);
        return mapped && mapped.id === row.id;
      });
      const techNode = modCandidate ? shortestNodeForModule(modCandidate.id) : null;
      depth = techNode ? techNode.depth : 0;
    }
    return {
      id: row.id,
      verb: row.verb,
      sub: subFromDerivedChip(source, derived),
      tone: row.tone,
      depth,
      why: row.verb,
    };
  });
  baseChips.sort((a, b) => (a.depth - b.depth) || a.verb.localeCompare(b.verb));
  const nextPacket = pickNextNode(state);
  const next = nextPacket
    ? {
      id: `next:${nextPacket.node.id}`,
      verb: nextPacket.capability.verb,
      sub: 'NEXT',
      tone: 'goal',
      nodeId: nextPacket.node.id,
      why: readinessPhrase(nextPacket.readiness),
    }
    : null;
  return {
    chips: baseChips,
    next,
  };
}

export function scarCalloutsForHull({ shipId, livingHull, simTime }) {
  const shipDef = SHIP_BY_ID.get(shipId);
  const anchorKind = shipDef && shipDef.id === 'ship_kestrel' ? 'authored' : 'approx';
  const anchorLabel = anchorKind === 'authored' ? 'AUTHORED' : 'APPROX';
  const approxSuffix = anchorKind === 'approx'
    ? ' Marked approximately - this hull has no authored plate for it.'
    : '';
  const record = normalizeLivingHull(livingHull, simTime);
  const rows = [];
  const killTally = clamp(Math.floor(finite(record.killTally, 0)), 0, LIVING_HULL_KILL_TALLY_MAX);
  if (killTally > 0) {
    rows.push({
      id: 'kills',
      label: `${killTally} KILLS`,
      sub: anchorLabel,
      kind: anchorKind,
      local: KILL_ANCHOR,
      why: `${killTally} confirmed kill(s) painted on the nose.${approxSuffix}`,
    });
  }
  const weldCount = clamp(Math.floor(finite(record.repairPatches, 0)), 0, LIVING_HULL_REPAIR_PATCH_MAX);
  for (let i = 0; i < weldCount; i += 1) {
    rows.push({
      id: `weld:${i}`,
      label: 'WELD',
      sub: anchorLabel,
      kind: anchorKind,
      local: PATCH_ANCHORS[i],
      why: `A heavy repair left this plate.${approxSuffix}`,
    });
  }
  const scorchCount = clamp(Math.floor(finite(record.heatScorch, 0)), 0, LIVING_HULL_HEAT_SCORCH_MAX);
  for (let i = 0; i < scorchCount; i += 1) {
    rows.push({
      id: `scorch:${i}`,
      label: 'SCORCH',
      sub: anchorLabel,
      kind: anchorKind,
      local: SCORCH_ANCHORS[i],
      why: `A weapon vent burned this panel.${approxSuffix}`,
    });
  }
  const grime = livingHullGrimeAt(record, simTime);
  if (grime > 0.01) {
    const cycles = Math.max(0, livingHullCyclesSinceWash(record, simTime));
    rows.push({
      id: 'grime',
      label: `GRIMY | ${cycles} CYCLES`,
      sub: anchorLabel,
      kind: anchorKind,
      local: GRIME_ANCHOR,
      why: `${cycles} cycle(s) since the last wash.${approxSuffix}`,
    });
  }
  if (record.graffitiLine) {
    rows.push({
      id: 'graffiti',
      label: record.graffitiLine,
      sub: record.graffitiAuthor ? `- ${record.graffitiAuthor}` : anchorLabel,
      kind: anchorKind,
      local: GRAFFITI_ANCHOR,
      why: record.graffitiLine + approxSuffix,
    });
  }
  return rows;
}
