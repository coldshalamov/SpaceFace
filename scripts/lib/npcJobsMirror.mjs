// Main-facade projection for the live NPC-job ledger.
//
// npcJobsRuntime owns the complete entry in the worker realm.  The render/UI realm only needs
// the bounded presentation contract below; shipping the kernel's planning fields, transient
// sidecars, and arbitrary cargo payloads made `npcJobs.byId` one of the largest signed leaves.
// Keep this projector deliberately explicit.  A generic key-drop rule would make it too easy for
// a new reader to start depending on an authoritative field without updating the wire contract.

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
});
