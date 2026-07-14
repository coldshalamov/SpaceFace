// Six authored POI behavior grammars for Milestone 4.
//
// These rows describe what the player does, what proves completion, and what durable mark the
// world keeps. They deliberately contain no spawn/fire instructions: danger is telegraphed by the
// behavior layer and remains subject to the existing encounter/AI hostility authorities.

function row(def) {
  return Object.freeze({
    ...def,
    zoneTypes: Object.freeze(def.zoneTypes.slice()),
    contract: Object.freeze({ ...def.contract, channels: Object.freeze(def.contract.channels.slice()) }),
    aftermath: Object.freeze({ ...def.aftermath }),
  });
}

export const POI_BEHAVIOR_FAMILIES = Object.freeze({
  lawful_station_yard: row({
    id: 'lawful_station_yard',
    zoneTypes: ['civilian_core', 'patrol_corridor', 'border_checkpoint', 'colony'],
    budgetCost: 1,
    entryLine: 'Licensed yard. Hold vector for traffic control.',
    mapLabel: 'YARD CONTROL',
    radarKind: 'lawful-yard',
    dangerMode: 'protected',
    riskLabel: 'LAWFUL INSPECTION',
    rewardLabel: 'LOCAL TRUST',
    contract: {
      verb: 'dock', required: 1, targetKind: 'station',
      cause: 'licensed traffic requires a clean arrival',
      objective: 'Dock cleanly inside local traffic control.',
      resolutionEvent: 'dock:docked', successOutcome: 'cleared',
      channels: ['faction:repDelta'],
    },
    aftermath: { kind: 'cleared_manifest', persistsDays: 2 },
  }),
  mining_field: row({
    id: 'mining_field',
    zoneTypes: ['mining_belt'],
    budgetCost: 2,
    entryLine: 'Active seam. Work clean and clear the haul lane.',
    mapLabel: 'WORKING SEAM',
    radarKind: 'mining-field',
    dangerMode: 'managed',
    riskLabel: 'ACTIVE CUTTING LANE',
    rewardLabel: 'LOCAL ORE DEMAND',
    contract: {
      verb: 'mine', required: 3, targetKind: 'field',
      cause: 'local buyers need fresh ore from this seam',
      objective: 'Recover three registered yields from the field.',
      resolutionEvent: 'mining:yield', successOutcome: 'worked',
      channels: ['cargo:changed', 'economy:applyTradePressure'],
    },
    aftermath: { kind: 'worked_seam', persistsDays: 2 },
  }),
  derelict_salvage: row({
    id: 'derelict_salvage',
    zoneTypes: ['derelict_field'],
    budgetCost: 2,
    entryLine: 'Cold hull. Scan first; salvage only what answers.',
    mapLabel: 'SALVAGE CLAIM',
    radarKind: 'derelict-salvage',
    dangerMode: 'uncertain',
    riskLabel: 'UNSTABLE HULL',
    rewardLabel: 'RECOVERY LEAD',
    contract: {
      verb: 'salvage', required: 1, targetKind: 'wreck',
      cause: 'a registered loss left recoverable evidence',
      objective: 'Finish one physical salvage recovery.',
      resolutionEvent: 'salvage:completed', successOutcome: 'recovered',
      channels: ['mission:offered'],
    },
    aftermath: { kind: 'stripped_hulk', persistsDays: 4 },
  }),
  anomaly_research: row({
    id: 'anomaly_research',
    zoneTypes: ['anomaly_deep', 'nebula_fog', 'radiation_field'],
    budgetCost: 2,
    entryLine: 'Research signal unstable. Triangulate before closing range.',
    mapLabel: 'RESEARCH SIGNAL',
    radarKind: 'anomaly-research',
    dangerMode: 'instrumented',
    riskLabel: 'SIGNAL INTERFERENCE',
    rewardLabel: 'RESEARCH LEAD',
    contract: {
      verb: 'triangulate', required: 3, targetKind: 'signal',
      cause: 'three bearings can stabilize the local signal',
      objective: 'Scan from three distinct local bearings.',
      resolutionEvent: 'scan:pulse', successOutcome: 'stabilized',
      channels: ['mission:offered'],
    },
    aftermath: { kind: 'stabilized_echo', persistsDays: 6 },
  }),
  convoy_industrial_route: row({
    id: 'convoy_industrial_route',
    zoneTypes: ['trade_lane', 'refinery_approach'],
    budgetCost: 1,
    entryLine: 'Industrial traffic inbound. Match vector or clear the lane.',
    mapLabel: 'FREIGHT ROUTE',
    radarKind: 'industrial-route',
    dangerMode: 'traffic',
    riskLabel: 'CONVOY EXPOSURE',
    rewardLabel: 'ROUTE LIQUIDITY',
    contract: {
      verb: 'escort', required: 1, targetKind: 'convoy',
      cause: 'scheduled freight is moving through the route',
      objective: 'See one convoy through the lane.',
      resolutionEvent: 'encounter:resolved', successOutcome: 'route_open',
      channels: ['economy:applyTradePressure'],
    },
    aftermath: { kind: 'freight_wake', persistsDays: 1 },
  }),
  pirate_contested_nest: row({
    id: 'pirate_contested_nest',
    zoneTypes: ['outlaw_zone', 'ambush_lane'],
    budgetCost: 3,
    entryLine: 'Raider claim ahead. Read the warning before committing.',
    mapLabel: 'CONTESTED CLAIM',
    radarKind: 'contested-nest',
    dangerMode: 'telegraphed',
    riskLabel: 'AUTHORIZED HOSTILES',
    rewardLabel: 'SECURITY REPUTATION',
    contract: {
      verb: 'clear', required: 2, targetKind: 'raider',
      cause: 'documented raider losses trace back to this claim',
      objective: 'Break two hostile actors after engagement is authorized.',
      resolutionEvent: 'entity:killed', successOutcome: 'nest_broken',
      channels: ['faction:repDelta'],
    },
    aftermath: { kind: 'broken_nest', persistsDays: 5 },
  }),
});

export const POI_FAMILY_IDS = Object.freeze(Object.keys(POI_BEHAVIOR_FAMILIES));

export function validatePoiBehaviorFamily(family) {
  if (!family || typeof family !== 'object') return false;
  if (!family.id || !Array.isArray(family.zoneTypes) || family.zoneTypes.length === 0) return false;
  if (!Number.isFinite(family.budgetCost) || family.budgetCost < 1) return false;
  if (!family.entryLine || !family.mapLabel || !family.radarKind || !family.riskLabel || !family.rewardLabel) return false;
  const contract = family.contract;
  if (!contract || !contract.verb || !Number.isInteger(contract.required) || contract.required < 1) return false;
  if (!contract.cause || !contract.objective || !contract.resolutionEvent || !contract.successOutcome) return false;
  if (!Array.isArray(contract.channels) || contract.channels.length === 0) return false;
  return !!(family.aftermath && family.aftermath.kind && family.aftermath.persistsDays > 0);
}

export default POI_BEHAVIOR_FAMILIES;
