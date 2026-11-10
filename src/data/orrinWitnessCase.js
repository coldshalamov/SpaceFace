// PQ-048.18 — durable source readers for Warrant Orrin's corridor-original case.
//
// This module is deliberately pure. The published H5 completion record is the sole authority;
// flags, encounter history, and generic witness content are not admissible substitutes.
import { sectorLocalToGlobalForSector } from './sectorCoordinates.js';

export const ORRIN_WITNESS_SOURCE_SHAPE_ID = 'depth_h5_corridor_massacre';
export const ORRIN_WITNESS_SOURCE_OUTCOME = 'published';
export const ORRIN_WITNESS_SECTOR_ID = 'sector_io_reach';
export const ORRIN_WITNESS_CONTACT_ID = 'contact_orrin';
export const ORRIN_WITNESS_STATION_ID = 'station_coalition';
export const ORRIN_WITNESS_ROUTE_SECTOR_ID = 'sector_tethys_junction';
export const ORRIN_WITNESS_ROUTE_STATION_ID = 'station_customs';
export const ORRIN_WITNESS_MARKER_ID = 'orrin_witness_corridor_original';
export const ORRIN_WITNESS_SOURCE_PREFIX = 'orrin-witness:depth_h5_corridor_massacre:published';
export const ORRIN_WITNESS_SUBMISSION_EVENT = 'orrinWitness:submitEvidence';
export const ORRIN_WITNESS_PERSISTENCE_OWNER = 'worldRecords';

// Old H5 saves did not retain the live encounter anchor. The authored Contested Lane centre is a
// deterministic, reachable fallback, not a new reward location or a generic wreck substitution.
export const ORRIN_WITNESS_LEGACY_ANCHOR = Object.freeze(
  sectorLocalToGlobalForSector({ x: 200, z: 0 }, ORRIN_WITNESS_SECTOR_ID),
);

function finiteWhole(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : fallback;
}

function finiteAnchor(value) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.z)) return null;
  return { x: Number(value.x), z: Number(value.z) };
}

function validSourceId(value) {
  return typeof value === 'string' && value.startsWith(`${ORRIN_WITNESS_SOURCE_PREFIX}:`);
}

/** Return a deterministic source identity for a valid H5 completion record. */
export function orrinWitnessSourceIdForRecord(record, state = null) {
  if (!record || record.outcome !== ORRIN_WITNESS_SOURCE_OUTCOME
    || record.sectorId !== ORRIN_WITNESS_SECTOR_ID) return null;
  const seed = finiteWhole(record.seed, finiteWhole(state?.meta?.seed, 0));
  const tick = finiteWhole(record.tick, 0);
  return `${ORRIN_WITNESS_SOURCE_PREFIX}:${seed}:${tick}`;
}

/** Stable world-record id; the world record is the one physical body for this source. */
export function orrinWitnessRecordId(sourceId) {
  if (!validSourceId(sourceId)) return null;
  return `wr_aftermath_${sourceId.replace(/[^a-z0-9_-]+/gi, '_').slice(-96)}`;
}

/** Read the exact durable publish transition; every other H5 outcome fails closed. */
export function orrinWitnessSource(state) {
  const record = state?.story?.depthProgramEncounters?.completed?.[ORRIN_WITNESS_SOURCE_SHAPE_ID];
  const id = orrinWitnessSourceIdForRecord(record, state);
  if (!id) return null;
  return {
    id,
    shapeId: ORRIN_WITNESS_SOURCE_SHAPE_ID,
    sectorId: ORRIN_WITNESS_SECTOR_ID,
    anchor: finiteAnchor(record.sourceAnchor) || { ...ORRIN_WITNESS_LEGACY_ANCHOR },
    record,
  };
}

/** Return the current case only when it still belongs to the exact durable source. */
export function orrinWitnessCase(state) {
  const source = orrinWitnessSource(state);
  const record = state?.story?.orrinWitnessCase;
  if (!source || !record || record.sourceId !== source.id || !validCase(record)) return null;
  return record;
}

/** Presentation-only referral for the normal map authority after Orrin accepts the original. */
export function orrinWitnessMapTarget(state) {
  const record = orrinWitnessCase(state);
  if (!record || !Number.isFinite(record.routeReferredAt)) return null;
  return {
    id: `orrin-witness-route:${ORRIN_WITNESS_ROUTE_STATION_ID}`,
    kind: 'station',
    stationId: ORRIN_WITNESS_ROUTE_STATION_ID,
    sectorId: ORRIN_WITNESS_ROUTE_SECTOR_ID,
    name: 'Customs Gate',
    statusLine: 'ORRIN CASE · CHAIN-OF-CUSTODY INTAKE',
    courseLabel: 'Customs Gate — Orrin case intake',
    courseArrivalRadius: 90,
  };
}

/** Exact live-recorder identity check used by the story observer after scanner resolution. */
export function isOrrinWitnessRecorder(entity, sourceId) {
  const data = entity && entity.data;
  return !!(entity && entity.alive !== false && entity.type === 'wreck' && data
    && data.markerId === ORRIN_WITNESS_MARKER_ID
    && data.worldRecordId === orrinWitnessRecordId(sourceId)
    && data.orrinWitnessSourceId === sourceId
    && data.persistenceOwner === ORRIN_WITNESS_PERSISTENCE_OWNER);
}

function validCase(record) {
  const recovered = record.evidence === 'recovered';
  const unrecovered = record.evidence === 'unrecovered';
  const recoveredAt = Number.isFinite(record.recoveredAt);
  const submittedAt = Number.isFinite(record.submittedAt);
  const referredAt = Number.isFinite(record.routeReferredAt);
  if (unrecovered) {
    return record.phase === 'unrecovered' && !recoveredAt && !submittedAt && !referredAt;
  }
  if (!recovered || !recoveredAt) return false;
  if (!submittedAt) return record.phase === 'recovered' && !referredAt;
  if (!referredAt) return record.phase === 'submitted';
  return record.phase === 'referral';
}
