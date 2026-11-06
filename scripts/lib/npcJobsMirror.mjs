// Main-facade projection for the live NPC-job ledger.
//
// npcJobsRuntime owns the complete entry in the worker realm.  The render/UI realm only needs
// the bounded presentation contract below; shipping the kernel's planning fields, transient
// sidecars, and arbitrary cargo payloads made `npcJobs.byId` one of the largest signed leaves.
// Keep this projector deliberately explicit.  A generic key-drop rule would make it too easy for
// a new reader to start depending on an authoritative field without updating the wire contract.

import { LANTERN_WARD_ID } from '../../src/data/lanternWardLayout.js';
import { isLanternWardHardwareEntity, LANTERN_WARD_RECORD_IDS } from '../../src/data/lanternWardHardware.js';

// These scalars describe the work already performed in the simulation. They never carry a
// clamp receipt, native body, cargo quantity, or job writer across the presentation boundary.
export const LANTERN_WARD_VITAL_KEYS = Object.freeze([
  'lanternWardLife', 'lanternWardRecordId', 'lanternWardPhase',
  'lanternWardProgress01', 'lanternWardDamage01', 'lanternWardClamp01',
  'lanternWardLit', 'lanternWardWorkerPresent', 'lanternWardRepaired', 'lanternWardYielding',
  'lanternWardCarrying', 'lanternWardInstalledPartRecordId',
  'lanternWardCustodyHolder', 'lanternWardCargoHolderId',
]);
const WARD_ACTORS = new Set(['tug', 'commuter', 'maintenance']);
const WARD_PHASES = new Set(['waiting', 'approach', 'brace', 'connect', 'finish', 'retreat', 'damaged']);
const WARD_HOLDERS = new Set(['ward', 'source', 'cradle', 'receiver', 'player', 'maintenance', 'service_face', 'loose']);
const WARD_CARGO_HOLDERS = new Set([
  ...WARD_HOLDERS, ...Object.values(LANTERN_WARD_RECORD_IDS), 'lantern-ward:maintenance-source',
]);
const WARD_HISTORY_FLAGS = Object.freeze([
  'playerCleared', 'playerCarried', 'repaired', 'ignored', 'cradleStolen', 'lampStolen', 'damaged', 'recovered', 'borrowed',
]);
const wardUnit = value => Math.round(Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 256) / 256;

export function lanternWardPresentationLife(entity) {
  const data = entity?.data, life = entity?.occupantGeneration;
  if (!Number.isSafeInteger(life) || life < 1) return null;
  const actor = data?.lanternWardActor;
  return isLanternWardHardwareEntity(entity)
    || (entity.type === 'ship' && data?.lanternWardId === LANTERN_WARD_ID
      && WARD_ACTORS.has(actor) && data.worldRecordId === LANTERN_WARD_RECORD_IDS[actor]) ? life : null;
}

// Shared scalar normalization keeps the host's allocation-free shadow comparison identical to
// its emitted row. Progress has 256 steps; unchanged work sends no repeated serialized payload.
export function lanternWardVitalValue(entity, key, life) {
  const data = entity.data;
  if (key === 'lanternWardLife') return life;
  if (key === 'lanternWardRecordId') return data.worldRecordId;
  if (key === 'lanternWardPhase') return WARD_PHASES.has(data[key]) ? data[key] : 'waiting';
  if (key === 'lanternWardProgress01' || key === 'lanternWardDamage01' || key === 'lanternWardClamp01') return wardUnit(data[key]);
  if (key === 'lanternWardCarrying') return data[key] === LANTERN_WARD_RECORD_IDS.lamp
    || data[key] === LANTERN_WARD_RECORD_IDS.maintenance_part ? data[key] : null;
  if (key === 'lanternWardInstalledPartRecordId') return data[key] === LANTERN_WARD_RECORD_IDS.maintenance_part ? data[key] : null;
  if (key === 'lanternWardCustodyHolder') return WARD_HOLDERS.has(data.lanternWardCustody?.holder) ? data.lanternWardCustody.holder : null;
  if (key === 'lanternWardCargoHolderId') return WARD_CARGO_HOLDERS.has(data.cargoManifest?.custody?.holderId) ? data.cargoManifest.custody.holderId : null;
  return data[key] === true;
}

/** The Hail reader needs causal facts, not the private work journal or completion receipt. */
export function projectLanternWard(ward) {
  if (!isObject(ward) || ward.version !== 1) return null;
  const history = {};
  for (const key of WARD_HISTORY_FLAGS) history[key] = ward.history?.[key] === true;
  return { version: 1, phase: typeof ward.phase === 'string' && ward.phase.length < 32 ? ward.phase : null,
    blocked: ward.blocked === true, lampMissing: ward.lampMissing === true || ward.objects?.lamp?.lost === true,
    cradleAway: ward.cradleAway === true, initialized: ward.initialized === true,
    needsReinstall: ward.needsReinstall === true,
    workS: ward.phase === 'connect' && Number.isFinite(ward.workS) ? Math.min(18, Math.max(0, ward.workS)) : 0,
    history,
    // Only bounded availability flags reach Hail; custody and service receipts stay private.
    objects: {
      lamp: { lost: ward.objects?.lamp?.lost === true },
      cradle: { lost: ward.objects?.cradle?.lost === true },
      receiver: { lost: ward.objects?.receiver?.lost === true },
    },
  };
}

const ENTRY_KEYS = Object.freeze([
  'kind', 'sectorId', 'worldRecordId', 'entityId',
]);

const JOB_KEYS = Object.freeze([
  // Ceres action receipts and the working-light presentation contract.
  'schema', 'id', 'kind', 'phase', 'progress', 'sequence', 'simTime', 'materialized', 'corrupt',
  // Careers and the route/contact VFX read these live kernel values.
  'routeIndex', 'loopCount', 'route', 'payload',
]);

const ROUTE_KEYS = Object.freeze(['id', 'pos', 'label', 'targetRef']);
const PAYLOAD_KEYS = Object.freeze(['role', 'activityRunSeq']);
const PALLAS_SEAM_FLAGS = Object.freeze(['pallasSeamFinished', 'pallasSeamWaiting', 'pallasSeamUnavailable']);
const CLAIM_DEPOT_KEYS = Object.freeze(['bodyId', 'legSeq']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function copyOwn(source, target, key) {
  if (source && Object.hasOwn(source, key) && source[key] !== undefined) target[key] = source[key];
}

function projectWaypoint(waypoint) {
  if (!isObject(waypoint)) return waypoint;
  const out = {};
  for (const key of ROUTE_KEYS) {
    if (key === 'pos') {
      const pos = waypoint.pos;
      if (isObject(pos)) {
        const projectedPos = {};
        copyOwn(pos, projectedPos, 'x');
        copyOwn(pos, projectedPos, 'z');
        out.pos = projectedPos;
      }
      continue;
    }
    copyOwn(waypoint, out, key);
  }
  return out;
}

function projectRoute(route) {
  return Array.isArray(route) ? route.map(projectWaypoint) : route;
}

function projectPayload(payload) {
  if (!isObject(payload)) return payload;
  const out = {};
  for (const key of PAYLOAD_KEYS) copyOwn(payload, out, key);
  // Finite Independent Seam presentation only; never ship its source identity or work authority.
  for (const key of PALLAS_SEAM_FLAGS) {
    if (typeof payload[key] === 'boolean') out[key] = payload[key];
  }
  // The map draws claim-depot freight from this identity and leg.  The worker keeps the full
  // manifest/cargo payload for traffic, economy, and save; only this small public marker crosses.
  if (isObject(payload.claimDepot)) {
    const claimDepot = {};
    for (const key of CLAIM_DEPOT_KEYS) copyOwn(payload.claimDepot, claimDepot, key);
    if (Object.keys(claimDepot).length > 0) out.claimDepot = claimDepot;
  }
  return out;
}

function projectJob(job) {
  if (!isObject(job)) return job;
  const out = {};
  for (const key of JOB_KEYS) {
    if (key === 'route') {
      if (Object.hasOwn(job, key)) out.route = projectRoute(job.route);
      continue;
    }
    if (key === 'payload') {
      if (Object.hasOwn(job, key)) out.payload = projectPayload(job.payload);
      continue;
    }
    copyOwn(job, out, key);
  }
  return out;
}

function projectEntry(entry) {
  if (!isObject(entry)) return entry;
  const out = {};
  for (const key of ENTRY_KEYS) copyOwn(entry, out, key);
  // Consumers only test these as presence flags.  Preserve their truth value without transporting
  // transient claim/tow sidecars or their entity-id graph.
  if (Object.hasOwn(entry, 'control')) out.control = !!entry.control;
  if (Object.hasOwn(entry, 'towAssist')) out.towAssist = !!entry.towAssist;
  if (Object.hasOwn(entry, 'job')) out.job = projectJob(entry.job);
  return out;
}

/**
 * Project the authoritative `state.npcJobs.byId` object for the main presentation facade.
 *
 * The input is never mutated.  Simulation, worker-side systems, save serialization, and restore
 * continue to use the original object; only the value passed to domain canonicalization/shipping
 * is projected.  Unknown/malformed values remain visible to fail-closed consumers rather than
 * becoming fabricated job records.
 */
export function projectNpcJobsById(byId) {
  if (!isObject(byId)) return byId;
  const out = {};
  for (const jobId of Object.keys(byId)) out[jobId] = projectEntry(byId[jobId]);
  return out;
}

export const NPC_JOB_MIRROR_CONTRACT = Object.freeze({
  entry: ENTRY_KEYS,
  job: JOB_KEYS,
  route: ROUTE_KEYS,
  payload: PAYLOAD_KEYS,
  claimDepot: CLAIM_DEPOT_KEYS,
  pallasSeamFlags: PALLAS_SEAM_FLAGS,
});
