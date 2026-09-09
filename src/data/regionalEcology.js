// Milestone 4 regional ecology profiles.
//
// This is authored-data composition, not a random biome generator: every profile is derived once
// from the shipped sector, named-zone, and regional-economy catalogs. The resulting 24 stable
// identities feed simulation consumers (traffic, resources, law, encounter selection, POI affinity)
// without creating another world authority.

import { hash32 } from '../core/rng.js';
import { dangerIndex, SECTORS } from './sectors.js';
import { zonesForSector } from './sectorZones.js';
import { getRegionalEconomyProfile } from './regionalEconomyProfiles.js';
import { POI_BEHAVIOR_FAMILIES, POI_FAMILY_IDS } from './poiBehaviorFamilies.js';

export const REGIONAL_ECOLOGY_SCHEMA_VERSION = 2;

/** Six-plus macro families that must remain pairwise distinguishable in role + encounter space. */
export const REGIONAL_ECOLOGY_FAMILY_IDS = Object.freeze([
  'civic_core',
  'industrial_belt',
  'trade_corridor',
  'contested_frontier',
  'salvage_frontier',
  'outlaw_predation',
  'anomaly_research',
]);

const FAMILY_RULES = Object.freeze({
  civic_core: Object.freeze({
    label: 'Civic Core',
    traffic: { hauler: 1.25, courier: 1.20, miner: 0.70, patrol: 1.65, escort: 1.35, smuggler: 0.20, pirate: 0, rescue: 1.20 },
    encounters: { patrol_scan: 1.65, patrol_beat: 1.55, convoy_departure: 1.35, trader_run: 1.25, pirate_toll: 0.10, ambush_snare: 0.10 },
  }),
  industrial_belt: Object.freeze({
    label: 'Industrial Belt',
    traffic: { hauler: 1.65, courier: 0.80, miner: 1.85, patrol: 0.90, escort: 1.25, smuggler: 0.65, pirate: 0.65, rescue: 0.90 },
    encounters: { convoy_departure: 1.70, trader_run: 1.35, salvage_signal: 1.25, distress_call: 1.10, ambush_snare: 1.05 },
  }),
  trade_corridor: Object.freeze({
    label: 'Trade Corridor',
    traffic: { hauler: 1.55, courier: 1.45, miner: 0.55, patrol: 1.25, escort: 1.45, smuggler: 0.75, pirate: 0.45, rescue: 0.90 },
    encounters: { convoy_departure: 1.65, trader_run: 1.60, patrol_beat: 1.25, patrol_scan: 1.20, pirate_toll: 0.75 },
  }),
  contested_frontier: Object.freeze({
    label: 'Contested Frontier',
    traffic: { hauler: 0.85, courier: 0.75, miner: 1.00, patrol: 1.15, escort: 1.75, smuggler: 1.15, pirate: 1.55, rescue: 1.10 },
    encounters: { ambush_snare: 1.55, pirate_toll: 1.35, bounty_hunter: 1.25, patrol_beat: 1.30, distress_call: 1.25 },
  }),
  salvage_frontier: Object.freeze({
    label: 'Salvage Frontier',
    traffic: { hauler: 0.75, courier: 0.65, miner: 0.90, patrol: 0.70, escort: 1.05, smuggler: 1.25, pirate: 1.05, rescue: 1.60 },
    encounters: { salvage_signal: 1.80, distress_call: 1.55, trader_run: 0.80, ambush_snare: 1.20, bounty_hunter: 1.10 },
  }),
  outlaw_predation: Object.freeze({
    label: 'Outlaw Predation',
    traffic: { hauler: 0.45, courier: 0.45, miner: 0.75, patrol: 0.25, escort: 1.15, smuggler: 2.15, pirate: 2.40, rescue: 0.45 },
    encounters: { pirate_toll: 2.10, ambush_snare: 2.00, bounty_hunter: 1.35, named_hunter: 1.40, patrol_scan: 0.20, patrol_beat: 0.25 },
  }),
  anomaly_research: Object.freeze({
    label: 'Anomaly Research',
    traffic: { hauler: 0.45, courier: 1.10, miner: 0.75, patrol: 0.45, escort: 0.85, smuggler: 0.70, pirate: 0.55, rescue: 1.45 },
    encounters: { anomaly_whisper: 2.10, distress_call: 1.35, salvage_signal: 1.25, trader_run: 0.55, pirate_toll: 0.35 },
  }),
});

const RESOURCE_KIND = Object.freeze({
  ast_common_rock: 'common',
  ast_metallic: 'metallic',
  ast_icy: 'volatile',
  ast_crystalline: 'crystalline',
  ast_rare_exotic: 'exotic',
  ast_gas_cloud: 'gas',
});

const RESOURCE_YIELD = Object.freeze({
  common: 0.92,
  metallic: 1.05,
  volatile: 1.08,
  crystalline: 1.13,
  exotic: 1.20,
  gas: 1.16,
});

const HAZARD_ANOMALY_TYPES = Object.freeze(new Set(['nebula', 'radiation']));
const ZONE_ANOMALY_TYPES = Object.freeze(new Set(['anomaly_deep', 'nebula_fog', 'radiation_field']));

function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

function frozenRecord(input) {
  return Object.freeze(Object.fromEntries(Object.entries(input || {}).map(([key, value]) => [key, Number(value) || 0])));
}

function familyFor(sector, zones) {
  const count = (type) => zones.filter((zone) => zone && zone.type === type).length;
  const anomaly = count('anomaly_deep') + count('nebula_fog') + count('radiation_field');
  const outlaw = count('outlaw_zone') + count('ambush_lane');
  const industry = count('mining_belt') + count('refinery_approach');
  const trade = count('trade_lane') + count('border_checkpoint') + count('patrol_corridor') + count('civilian_core');
  if (sector.security >= 0.80) return 'civic_core';
  if (count('anomaly_deep') >= 2 || (anomaly >= 2 && sector.security < 0.22)) return 'anomaly_research';
  if (outlaw >= 2 || (outlaw >= 1 && sector.security < 0.11)) return 'outlaw_predation';
  if (industry >= 2) return 'industrial_belt';
  if (count('derelict_field') || count('colony')) return 'salvage_frontier';
  if (trade >= 2) return 'trade_corridor';
  return 'contested_frontier';
}

function dominantResource(sector) {
  const counts = new Map();
  let best = 'common';
  let bestCount = 0;
  for (const field of sector.fields || []) {
    const kind = RESOURCE_KIND[field && field.type] || 'common';
    const next = (counts.get(kind) || 0) + 1;
    counts.set(kind, next);
    if (next > bestCount) { best = kind; bestCount = next; }
  }
  return best;
}

/** Distinct authored hazard types, stable order, plus zone-derived anomaly flags. */
function hazardComposition(sector, zones) {
  const hazards = [];
  const seen = new Set();
  for (const hz of sector.hazards || []) {
    const type = hz && hz.type;
    if (!type || seen.has(type)) continue;
    seen.add(type);
    hazards.push(type);
  }
  hazards.sort((a, b) => a.localeCompare(b));
  let anomalyZones = 0;
  for (const zone of zones) {
    if (zone && ZONE_ANOMALY_TYPES.has(zone.type)) anomalyZones += 1;
  }
  const hazardAnomalies = hazards.filter((type) => HAZARD_ANOMALY_TYPES.has(type)).length;
  return Object.freeze({
    types: Object.freeze(hazards.slice()),
    count: hazards.length,
    anomalyScore: clamp((anomalyZones * 0.35) + (hazardAnomalies * 0.25), 0, 1),
  });
}

/**
 * Compact faction pressure: how hard the local authority / opposing presence presses the lanes.
 * Derived from security, enemy density, economy pressure, and whether the flagship role is military.
 */
function factionPressure(sector, economy) {
  const security = clamp(Number(sector.security) || 0, 0, 1);
  const density = clamp(Number(sector.enemyDensity) || 0, 0, 1);
  const pressureBias = Number(economy && economy.pressureBias);
  const economyTerm = Number.isFinite(pressureBias) ? clamp(pressureBias, 0, 1) : 0.5;
  const military = economy && (economy.primaryRole === 'military' || (economy.secondaryRoles || []).includes('military'))
    ? 0.12 : 0;
  // High security + military = lawful pressure; low security + density = outlaw pressure.
  const lawful = security * 0.55 + military;
  const outlaw = (1 - security) * 0.45 + density * 0.40;
  const net = clamp(outlaw * 0.6 + lawful * 0.4 + (economyTerm - 0.5) * 0.15, 0, 1);
  return Object.freeze({
    factionId: sector.factionId || null,
    lawful: clamp(lawful, 0, 1),
    outlaw: clamp(outlaw, 0, 1),
    net,
  });
}

/** Which POI behavior families this region's zones can host (affinity weights 0..1). */
function poiAffinity(zones) {
  const counts = Object.create(null);
  for (const familyId of POI_FAMILY_IDS) counts[familyId] = 0;
  for (const zone of zones) {
    if (!zone || !zone.type) continue;
    for (const familyId of POI_FAMILY_IDS) {
      const family = POI_BEHAVIOR_FAMILIES[familyId];
      if (family && family.zoneTypes.includes(zone.type)) counts[familyId] += 1;
    }
  }
  const max = Math.max(1, ...Object.values(counts));
  const affinity = {};
  for (const familyId of POI_FAMILY_IDS) {
    affinity[familyId] = clamp(counts[familyId] / max, 0, 1);
  }
  // Stable dominant family for concise readouts.
  let dominant = POI_FAMILY_IDS[0];
  let best = -1;
  for (const familyId of POI_FAMILY_IDS) {
    if (counts[familyId] > best) {
      best = counts[familyId];
      dominant = familyId;
    }
  }
  return Object.freeze({
    affinity: frozenRecord(affinity),
    dominantFamilyId: best > 0 ? dominant : null,
    hostedCount: Object.values(counts).filter((n) => n > 0).length,
  });
}

function buildProfile(sector) {
  const zones = zonesForSector(sector.id);
  const economy = getRegionalEconomyProfile(sector.id);
  const familyId = familyFor(sector, zones);
  const family = FAMILY_RULES[familyId];
  const resourceKind = dominantResource(sector);
  const pressureBias = Number(economy && economy.pressureBias) || 0.5;
  const yieldMultiplier = clamp((RESOURCE_YIELD[resourceKind] || 1) + (pressureBias - 0.5) * 0.08, 0.75, 1.35);
  const baselineDanger = clamp(dangerIndex(sector), 0, 1);
  const identityKey = economy && economy.identityKey || `${sector.id}:${familyId}`;
  const hazards = hazardComposition(sector, zones);
  const faction = factionPressure(sector, economy);
  const poi = poiAffinity(zones);
  const fingerprint = `eco_${hash32(
    'regional-ecology-v2', sector.id, identityKey, familyId, resourceKind,
    Math.round(yieldMultiplier * 1000), Math.round(sector.security * 1000), Math.round(baselineDanger * 1000),
    hazards.types.join('|'), Math.round(hazards.anomalyScore * 1000),
    faction.factionId || '', Math.round(faction.net * 1000),
    poi.dominantFamilyId || '', poi.hostedCount,
  ).toString(36)}`;
  return Object.freeze({
    schemaVersion: REGIONAL_ECOLOGY_SCHEMA_VERSION,
    sectorId: sector.id,
    identityKey,
    familyId,
    familyLabel: family.label,
    fingerprint,
    traffic: Object.freeze({
      baselinePerMin: Math.max(0, Number(sector.trafficPerMin) || 0),
      densityMultiplier: clamp(0.70 + Math.min(18, Math.max(0, Number(sector.trafficPerMin) || 0)) / 30, 0.70, 1.30),
      roleBias: frozenRecord(family.traffic),
    }),
    resource: Object.freeze({ kind: resourceKind, yieldMultiplier }),
    hazards,
    faction,
    poi,
    law: Object.freeze({ security: clamp(Number(sector.security) || 0, 0, 1) }),
    danger: Object.freeze({ baseline: baselineDanger }),
    encounters: Object.freeze({ shapeBias: frozenRecord(family.encounters) }),
  });
}

export const REGIONAL_ECOLOGY_PROFILES = Object.freeze(SECTORS.map(buildProfile));

export const REGIONAL_ECOLOGY_BY_ID = Object.freeze(
  Object.fromEntries(REGIONAL_ECOLOGY_PROFILES.map((profile) => [profile.sectorId, profile])),
);

export function getRegionalEcologyProfile(sectorId) {
  return sectorId && REGIONAL_ECOLOGY_BY_ID[sectorId] || null;
}

export function getRegionalEcologyFamilyRules(familyId) {
  return familyId && FAMILY_RULES[familyId] || null;
}

/** L1 distance over shared numeric role/encounter keys — used by acceptance to prove macro diversity. */
export function regionalEcologyFamilyDistance(a, b) {
  if (!a || !b) return 0;
  let role = 0;
  let enc = 0;
  const roles = new Set([
    ...Object.keys(a.traffic && a.traffic.roleBias || {}),
    ...Object.keys(b.traffic && b.traffic.roleBias || {}),
  ]);
  for (const key of roles) {
    role += Math.abs((a.traffic.roleBias[key] || 0) - (b.traffic.roleBias[key] || 0));
  }
  const shapes = new Set([
    ...Object.keys(a.encounters && a.encounters.shapeBias || {}),
    ...Object.keys(b.encounters && b.encounters.shapeBias || {}),
  ]);
  for (const key of shapes) {
    enc += Math.abs((a.encounters.shapeBias[key] || 0) - (b.encounters.shapeBias[key] || 0));
  }
  return { role, enc, total: role + enc };
}

export function validateRegionalEcologyProfile(profile) {
  if (!profile || profile.schemaVersion !== REGIONAL_ECOLOGY_SCHEMA_VERSION) return false;
  if (!profile.sectorId || !profile.identityKey || !FAMILY_RULES[profile.familyId] || !profile.fingerprint) return false;
  if (!profile.familyLabel || typeof profile.familyLabel !== 'string') return false;
  if (!profile.traffic || !Number.isFinite(profile.traffic.baselinePerMin) || !profile.traffic.roleBias) return false;
  if (!profile.resource || !RESOURCE_YIELD[profile.resource.kind]) return false;
  if (!(profile.resource.yieldMultiplier >= 0.75 && profile.resource.yieldMultiplier <= 1.35)) return false;
  if (!profile.hazards || !Array.isArray(profile.hazards.types) || !Number.isFinite(profile.hazards.anomalyScore)) return false;
  if (!(profile.hazards.anomalyScore >= 0 && profile.hazards.anomalyScore <= 1)) return false;
  if (!profile.faction || !(profile.faction.net >= 0 && profile.faction.net <= 1)) return false;
  if (!(profile.faction.lawful >= 0 && profile.faction.lawful <= 1)) return false;
  if (!(profile.faction.outlaw >= 0 && profile.faction.outlaw <= 1)) return false;
  if (!profile.poi || !profile.poi.affinity || !Number.isFinite(profile.poi.hostedCount)) return false;
  if (!profile.law || !(profile.law.security >= 0 && profile.law.security <= 1)) return false;
  if (!profile.danger || !(profile.danger.baseline >= 0 && profile.danger.baseline <= 1)) return false;
  return !!(profile.encounters && profile.encounters.shapeBias);
}

export default REGIONAL_ECOLOGY_PROFILES;
