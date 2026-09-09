// Deterministic identity + causal aftermath grammar for living-universe encounters.
// Pure data/functions: no state writes, no Three.js, no wall clock, no ambient randomness.

import { hash32 } from '../core/rng.js';

export const ENCOUNTER_CAUSALITY_SCHEMA_VERSION = 1;

const MOTIVES = Object.freeze({
  pirate_toll: Object.freeze({ id: 'extortion', actor: 'Reach toll crew', evidence: 'Cargo-lane telemetry shows a deliberate toll intercept.' }),
  ambush_snare: Object.freeze({ id: 'predation', actor: 'Reach ambush wing', evidence: 'Snare harmonics and attack vectors identify a prepared ambush.' }),
  patrol_scan: Object.freeze({ id: 'lawful_screening', actor: 'Concord patrol', evidence: 'Patrol records show a scheduled security inspection.' }),
  bounty_hunter: Object.freeze({ id: 'contract_collection', actor: 'licensed hunter', evidence: 'The hunter broadcast a registered collection contract.' }),
  claim_threat: Object.freeze({ id: 'territorial_pressure', actor: 'claim raiders', evidence: 'The attack vector converged on a registered claim.' }),
  named_hunter: Object.freeze({ id: 'personal_grudge', actor: 'named hunter', evidence: 'A persistent hunter signature links this contact to prior encounters.' }),
  convoy_departure: Object.freeze({ id: 'supply_delivery', actor: 'MTS convoy', evidence: 'Freight manifests identify the route and intended market delivery.' }),
  trader_run: Object.freeze({ id: 'commerce', actor: 'independent trader', evidence: 'The filed itinerary names an origin, cargo, and destination.' }),
  patrol_beat: Object.freeze({ id: 'route_security', actor: 'Concord patrol', evidence: 'The flight plan follows a published security beat.' }),
  distress_call: Object.freeze({ id: 'distress_response', actor: 'distress contact', evidence: 'The transponder history identifies when and where the mayday began.' }),
  salvage_signal: Object.freeze({ id: 'wreck_recovery', actor: 'salvage beacon', evidence: 'A black-box carrier signal identifies recoverable evidence.' }),
  anomaly_whisper: Object.freeze({ id: 'anomalous_signal', actor: 'unknown signal', evidence: 'A repeatable bearing trace distinguishes the signal from sensor noise.' }),
});

const AFTERMATH_BY_SHAPE = Object.freeze({
  pirate_toll: Object.freeze({ kind: 'security', remedyType: 'patrol_clear', remedy: 'Clear the toll crew from the recorded lane.' }),
  ambush_snare: Object.freeze({ kind: 'security', remedyType: 'patrol_clear', remedy: 'Break the ambush cell using its recorded attack vector.' }),
  patrol_scan: Object.freeze({ kind: 'security', remedyType: 'recon_scan', remedy: 'Verify the corridor record and restore a clean security picture.' }),
  bounty_hunter: Object.freeze({ kind: 'security', remedyType: 'bounty_hunt', remedy: 'Close the registered hunter contract at its source.' }),
  claim_threat: Object.freeze({ kind: 'security', remedyType: 'patrol_clear', remedy: 'Drive the raiders off the affected claim corridor.' }),
  named_hunter: Object.freeze({ kind: 'security', remedyType: 'bounty_hunt', remedy: 'Use the signature trail to finish the hunter grudge.' }),
  convoy_departure: Object.freeze({ kind: 'economic', remedyType: 'cargo_delivery', remedy: 'Replace the freight lost from the recorded delivery.' }),
  trader_run: Object.freeze({ kind: 'economic', remedyType: 'cargo_delivery', remedy: 'Restore the interrupted trade flow with a replacement load.' }),
  distress_call: Object.freeze({ kind: 'distress', remedyType: 'salvage_retrieval', remedy: 'Recover the recorder and account for the distress contact.' }),
  salvage_signal: Object.freeze({ kind: 'wreck', remedyType: 'salvage_retrieval', remedy: 'Recover the black-box evidence from the marked wreck.' }),
});

function clean(value, fallback = '') {
  return value == null || value === '' ? fallback : String(value);
}

export function encounterFingerprint(input = {}) {
  const seed = Number(input.seed) >>> 0 || 1;
  const encounterId = clean(input.encounterId, 'encounter');
  const shapeId = clean(input.shapeId || input.shape, 'unknown');
  const sectorId = clean(input.sectorId, 'unknown-sector');
  const zoneId = clean(input.zoneId, 'unknown-zone');
  return `efp_${hash32(seed, 'encounter-fingerprint-v1', encounterId, shapeId, sectorId, zoneId).toString(36)}`;
}

export function encounterVarietyKey(input = {}) {
  const objective = clean(input.objective || input.shapeId || input.shape, 'unknown');
  const doctrine = clean(input.doctrineId || input.doctrine, 'civilian');
  const topology = clean(input.topology || input.zoneType || input.zoneId, 'open_space');
  const complication = clean(input.complication || input.variantKind || input.script, 'none');
  return [objective, doctrine, topology, complication].join('|');
}

function rewardClass(shapeId, outcome) {
  const result = clean(outcome, 'none');
  if (['paid', 'rescued', 'guarded'].includes(result)) return 'credits_rep';
  if (['fined', 'bribed'].includes(result)) return 'security_cost';
  if (['recovered', 'stripped'].includes(result)) return 'salvage';
  if (['cleared', 'killed', 'completed', 'bait_broken'].includes(result)) return 'security_relief';
  if (shapeId === 'convoy_departure' && result === 'arrived') return 'market_delivery';
  return 'none';
}

export function resolvedEncounterFingerprint(causality, outcome) {
  if (!causality) return null;
  const consequence = clean(outcome, 'unknown');
  const reward = rewardClass(causality.shapeId, consequence);
  const tuple = [
    causality.objective || causality.shapeId,
    causality.doctrine || 'civilian',
    causality.topology || causality.zoneId,
    causality.complication || causality.variantKind,
    consequence,
    reward,
  ];
  return {
    fingerprint: `efx_${hash32(1, 'encounter-experience-v1', ...tuple).toString(36)}`,
    tuple,
    consequence,
    reward,
  };
}

export function buildEncounterCausality(input = {}) {
  const shapeId = clean(input.shapeId || input.shape, 'unknown');
  const motive = MOTIVES[shapeId] || Object.freeze({
    id: 'unknown', actor: 'unknown contact', evidence: 'The contact has no verified causal signature.',
  });
  const fingerprint = encounterFingerprint({ ...input, shapeId });
  const objective = clean(input.objective, shapeId);
  const doctrine = clean(input.doctrineId || input.doctrine, 'civilian');
  const topology = clean(input.topology || input.zoneType, input.zoneId || 'open_space');
  const complication = clean(input.complication || input.variantKind || input.script, shapeId);
  return {
    schemaVersion: ENCOUNTER_CAUSALITY_SCHEMA_VERSION,
    fingerprint,
    encounterId: clean(input.encounterId, 'encounter'),
    shapeId,
    variantKind: clean(input.variantKind || input.kind, shapeId),
    sectorId: clean(input.sectorId, 'unknown-sector'),
    zoneId: clean(input.zoneId, 'unknown-zone'),
    zoneName: clean(input.zoneName, input.zoneId || 'unknown zone'),
    factionId: input.factionId || null,
    motiveId: motive.id,
    actor: motive.actor,
    evidence: motive.evidence,
    objective,
    doctrine,
    topology,
    complication,
    varietyKey: encounterVarietyKey({ objective, doctrine, topology, complication }),
  };
}

export function causalAftermath(causality, outcome, at = {}) {
  if (!causality || !causality.fingerprint) return null;
  const result = clean(outcome, 'unknown');
  if (result.startsWith('aborted:') || result === 'faded' || result === 'spoken' || result === 'unmet') return null;
  const grammar = AFTERMATH_BY_SHAPE[causality.shapeId];
  if (!grammar) return null;
  const status = [
    'paid', 'cleared', 'rescued', 'guarded', 'recovered', 'clean', 'completed', 'killed',
    'arrived', 'bait_broken', 'defended',
  ].includes(result)
    ? 'contained'
    : 'open';
  return {
    schemaVersion: ENCOUNTER_CAUSALITY_SCHEMA_VERSION,
    causeId: `cause_${causality.fingerprint}`,
    fingerprint: causality.fingerprint,
    encounterId: causality.encounterId,
    shapeId: causality.shapeId,
    variantKind: causality.variantKind,
    sectorId: causality.sectorId,
    zoneId: causality.zoneId,
    zoneName: causality.zoneName,
    factionId: causality.factionId,
    motiveId: causality.motiveId,
    actor: causality.actor,
    outcome: result,
    consequenceKind: grammar.kind,
    evidence: causality.evidence,
    resolvedFingerprint: at.resolvedFingerprint || causality.resolvedFingerprint || null,
    remedyType: grammar.remedyType,
    remedy: grammar.remedy,
    status,
    createdTick: Number.isFinite(at.tick) ? at.tick : 0,
    createdAt: Number.isFinite(at.t) ? at.t : 0,
    offerId: null,
    missionId: null,
    attempts: 0,
    rewardSettled: false,
  };
}

export function causeContractOffer(cause, station, seed = 1) {
  if (!cause || !cause.fingerprint || cause.status !== 'open' || !station || !station.id) return null;
  const attempt = Math.max(0, cause.attempts | 0);
  const riskTier = 1 + (hash32(seed >>> 0 || 1, cause.fingerprint, 'risk') % 3);
  const reward_cr = 480 + riskTier * 180 + (hash32(seed >>> 0 || 1, cause.fingerprint, 'reward') % 121);
  const id = `aftc_${cause.fingerprint.slice(4)}_${attempt}`;
  const params = cause.remedyType === 'patrol_clear'
    ? { clearCount: 2, killCount: 0, targetStrength: 1.4 + riskTier * 0.45, fValue: 1.4 + riskTier * 0.45, taskTime: 90 }
    : cause.remedyType === 'bounty_hunt'
      ? { clearCount: 1, killCount: 0, targetStrength: 1.8 + riskTier * 0.5, fValue: 1.8 + riskTier * 0.5, taskTime: 75 }
      : cause.remedyType === 'recon_scan'
        ? { scanTargets: 1, progress: 0, fValue: 1.25, taskTime: 35 }
        : cause.remedyType === 'cargo_delivery'
          ? { cmdtyId: 'cmdty_fuel_cells', qty: 6 + riskTier * 2, cargoValue: 600 + riskTier * 160, fValue: 1.25, taskTime: 30, passengers: 0 }
          : { cmdtyId: 'cmdty_salvage_electronics', qty: 2 + riskTier, cargoValue: 360 + riskTier * 120, fValue: 1.2, taskTime: 30 };
  return {
    id,
    source: 'encounterAftermath',
    type: cause.remedyType,
    stationId: station.id,
    factionId: station.factionId || null,
    reward_cr,
    time_limit_s: 900,
    collateral_cr: 0,
    riskTier,
    destStationId: station.id,
    destSectorId: cause.sectorId,
    distance: 600,
    params,
    title: `Aftermath: ${cause.actor} at ${cause.zoneName}`,
    summary: `Evidence: ${cause.evidence} Remedy: ${cause.remedy}`,
    cause: {
      tag: cause.consequenceKind,
      fingerprint: cause.fingerprint,
      motiveId: cause.motiveId,
      evidence: cause.evidence,
      remedy: cause.remedy,
    },
    expiresAtEpoch: null,
    storyTag: null,
  };
}

export function normalizeCausalAftermath(input) {
  if (!input || typeof input !== 'object' || !input.fingerprint || !input.sectorId) return null;
  const status = ['open', 'offered', 'active', 'remedied', 'contained', 'exhausted'].includes(input.status)
    ? input.status : 'open';
  return {
    ...input,
    schemaVersion: ENCOUNTER_CAUSALITY_SCHEMA_VERSION,
    fingerprint: String(input.fingerprint),
    causeId: input.causeId || `cause_${input.fingerprint}`,
    sectorId: String(input.sectorId),
    status,
    attempts: Math.max(0, input.attempts | 0),
    rewardSettled: !!input.rewardSettled,
  };
}
