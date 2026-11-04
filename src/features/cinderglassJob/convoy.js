// Cinderglass convoy: native originals + finite npcJobs itinerary. No movement/health writer.
import { Masks } from '../../core/entity.js';
import { currentRole } from './identity.js';
import { makeShipEntitySpec } from '../../systems/ships.js';
import { modelTruthRow } from '../../data/modelTruth.js';
import {
  CINDERGLASS_JOB_SECTOR_ID, CINDERGLASS_JOB_POINTS, CINDERGLASS_JOB_ROUTE,
  CINDERGLASS_JOB_ESCORT_ROUTE, CINDERGLASS_JOB_ESCORT_B_ROUTE, CINDERGLASS_JOB_LAYBY_LEG, CINDERGLASS_JOB_LAYBY_HOLD_S,
  CINDERGLASS_JOB_SPEED_WU, CINDERGLASS_JOB_CARRIER_ID, CINDERGLASS_JOB_ESCORT_A_ID,
  CINDERGLASS_JOB_ESCORT_B_ID, CINDERGLASS_JOB_POD_ID, CINDERGLASS_JOB_CRADLE_ID,
  CINDERGLASS_JOB_BROKER_ID, CINDERGLASS_JOB_LAYBY_ID, CINDERGLASS_JOB_CARRIER_SHIP_ID,
  CINDERGLASS_JOB_ESCORT_SHIP_ID, CINDERGLASS_JOB_CARRIER_FACTION,
  CINDERGLASS_JOB_POD_MASS, CINDERGLASS_JOB_POD_RADIUS, CINDERGLASS_JOB_POD_HULL,
  CINDERGLASS_JOB_POD_ASSET, CINDERGLASS_JOB_POD_MARKING, CINDERGLASS_JOB_POD_NAME,
  CINDERGLASS_JOB_POD_LEGAL_OWNER, CINDERGLASS_JOB_LATCH_LOCAL, CINDERGLASS_JOB_ROLES,
} from './definition.js';
import {
  cinderglassJobBodyMatches, cinderglassJobIndustrialSpec, cinderglassJobLatchSpec,
  cinderglassJobPhysicalOwnersReady, cinderglassJobCohortReady,
  cinderglassJobEnsureLatchMount,
} from './physical.js';

const FEATURE_ROLE = 'cinderglassJob';
const CLAIM_ID = 'cinderglassJob:inspection';
const entity = (state, id) => id != null ? state.entities?.get(id) : null;
const jobsService = sys => sys.helpers?.npcJobs;
const routeFor = points => points.map(w => ({ id: w.id, pos: { ...w.pos } }));

function shipSpec(shipId, role, worldRecordId, pos, rot, operationId, displayName) {
  const spec = makeShipEntitySpec(shipId, { team: 2, factionId: CINDERGLASS_JOB_CARRIER_FACTION,
    pos: { ...pos }, rot, ai: { archetype: role === 'escort' ? 'escort' : 'civilian' } });
  Object.assign(spec, { vel: { x: 0, z: 0 }, ttl: Infinity, collides: true,
    flags: { missionPinned: true, persistent: true }, homeSectorId: CINDERGLASS_JOB_SECTOR_ID });
  Object.assign(spec.data, { cinderglassRole: role, worldRecordId, cinderglassOperationId: operationId,
    cinderglassAssetId: shipId, cinderglassAssetFile: modelTruthRow(shipId)?.url,
    displayName, scannable: true, scanLabel: role === 'carrier'
      ? 'Meridian Mule · paid consignment · external yellow rack latch' : `${displayName} · contract escort`,
    runtimeOwner: FEATURE_ROLE, sectorId: CINDERGLASS_JOB_SECTOR_ID, homeSectorId: CINDERGLASS_JOB_SECTOR_ID });
  if (role === 'carrier') spec.data.combatProfileId = 'combat_profile_heist_carrier';
  return spec;
}

export function podSpec(pos, rot = 0, operationId = null) {
  const mass = CINDERGLASS_JOB_POD_MASS, radius = CINDERGLASS_JOB_POD_RADIUS;
  return { type: 'payload', factionId: CINDERGLASS_JOB_POD_LEGAL_OWNER,
    ownerId: 'manifest_oren_dask', team: 2, pos: { ...pos }, vel: { x: 0, z: 0 }, rot,
    radius, mass, hull: CINDERGLASS_JOB_POD_HULL, hullMax: CINDERGLASS_JOB_POD_HULL,
    collides: true, collisionMask: Masks.SHIP | Masks.ASTEROID | Masks.STATION | Masks.PROJECTILE,
    ttl: Infinity, flags: { missionPinned: true, persistent: true }, homeSectorId: CINDERGLASS_JOB_SECTOR_ID,
    physicsBody: { dynamic: true, radius, mass, inertiaY: 0.5 * mass * radius * radius, ccd: true, material: 'payload' },
    data: { cinderglassRole: 'pod', worldRecordId: CINDERGLASS_JOB_POD_ID,
      originalId: CINDERGLASS_JOB_POD_ID, cinderglassOperationId: operationId,
      sealed: true, marking: CINDERGLASS_JOB_POD_MARKING, name: CINDERGLASS_JOB_POD_NAME,
      authoredPayloadAssetId: CINDERGLASS_JOB_POD_ASSET,
      cinderglassAssetId: CINDERGLASS_JOB_POD_ASSET, cinderglassAssetFile: modelTruthRow(CINDERGLASS_JOB_POD_ASSET)?.url,
      legalOwnerFactionId: CINDERGLASS_JOB_POD_LEGAL_OWNER, ownerId: 'manifest_oren_dask',
      scannable: true, scanLabel: `${CINDERGLASS_JOB_POD_NAME} · sealed · disputed title`,
      runtimeOwner: FEATURE_ROLE, sectorId: CINDERGLASS_JOB_SECTOR_ID, homeSectorId: CINDERGLASS_JOB_SECTOR_ID } };
}

function localAt(origin, rot, x, z) {
  return { x: origin.x + Math.cos(rot) * x - Math.sin(rot) * z,
    z: origin.z + Math.sin(rot) * x + Math.cos(rot) * z };
}

// Creates at most one original cohort in an operation. Partial synchronous failure rolls back
// only the exact newly spawned objects; restoration never calls this to replace absent roles.
export function cinderglassJobAdmit(sys, state) {
  const st = sys._cg, spawn = sys.helpers?.spawnEntity;
  if (!st.operationId || typeof spawn !== 'function' || !cinderglassJobPhysicalOwnersReady(sys)) {
    st.admissionReason = 'physical_owners_unavailable'; return false;
  }
  if (!st.everAdmitted) {
    const start = CINDERGLASS_JOB_POINTS.marshal, next = CINDERGLASS_JOB_POINTS.pullOff;
    const heading = Math.atan2(next.z - start.z, next.x - start.x);
    const statics = [
      ['cradleId', CINDERGLASS_JOB_CRADLE_ID, 'cradle', CINDERGLASS_JOB_POINTS.cradle, 'Rook’s receiving cradle'],
      ['brokerId', CINDERGLASS_JOB_BROKER_ID, 'broker', CINDERGLASS_JOB_POINTS.broker, 'Vesi Khand’s receiving berth'],
      ['laybyId', CINDERGLASS_JOB_LAYBY_ID, 'layby', localAt(CINDERGLASS_JOB_POINTS.pullOff, heading, 0, -80), 'Pull-off service gantry'],
    ];
    const specs = [
      ['carrierId', shipSpec(CINDERGLASS_JOB_CARRIER_SHIP_ID, 'carrier', CINDERGLASS_JOB_CARRIER_ID, start, heading, st.operationId, 'Meridian Haulage · Oren Dask')],
      ['escortAId', shipSpec(CINDERGLASS_JOB_ESCORT_SHIP_ID, 'escort', CINDERGLASS_JOB_ESCORT_A_ID, localAt(start, heading, 55, -65), heading, st.operationId, 'Kestrel Nine')],
      ['escortBId', shipSpec(CINDERGLASS_JOB_ESCORT_SHIP_ID, 'escort', CINDERGLASS_JOB_ESCORT_B_ID, localAt(start, heading, -55, 65), heading, st.operationId, 'Kestrel Eleven')],
      ['podId', podSpec(localAt(start, heading, -35, 0), heading, st.operationId)],
      ['latchId', cinderglassJobLatchSpec(localAt(start, heading, CINDERGLASS_JOB_LATCH_LOCAL.x, CINDERGLASS_JOB_LATCH_LOCAL.z), heading, st.operationId)],
      ...statics.map(([key, worldRecordId, role, pos, name]) => [key, cinderglassJobIndustrialSpec({
        worldRecordId, role, pos, name, rot: 0, operationId: st.operationId,
        assetId: role === 'layby' ? 'place_maintenance_gantry' : 'place_ceres_section_cradle',
        scale: role === 'layby' ? 3 : 0.4,
        scanLabel: role === 'layby' ? 'Freight inspection work bay · external service access'
          : `${name} · low-speed exterior receiving clamp`,
      })]),
    ];
    if (specs.some(([, spec]) => !spec)) { st.admissionReason = 'released_asset_unmeasured'; return false; }
    const created = [];
    const operation = st.operationId;
    for (const [key, spec] of specs) {
      const e = spawn(spec);
      if (!e || e.id == null || sys._cg !== st || st.operationId !== operation) {
        // A spawn receipt may synchronously reset the run. Include the just-created old-life
        // occupant in rollback; a recycled id in the new life never authorizes removal.
        for (const own of e ? [...created, e] : created) {
          if (entity(state, own.id) === own && own.data?.cinderglassOperationId === operation) {
            sys.helpers.removeEntity?.(own.id);
          }
        }
        st.admissionReason = 'cohort_spawn_refused'; return false;
      }
      st.entities[key] = e.id; created.push(e);
    }
    st.everAdmitted = true;
    st.entities.pendingClamp = true;
    st.entities.clampAttempts = 0;
    st.runStartedAtS = Number(state.simTime) || 0;
  }
  if (!cinderglassJobCohortReady(sys, state)) { st.admissionReason = 'cohort_admission_pending'; return false; }
  if (!cinderglassJobEnsureLatchMount(sys, state)) { st.admissionReason = 'external_latch_mount_pending'; return false; }
  const jobs = jobsService(sys);
  for (const [bodyKey, jobKey, kind, route] of [
    ['carrierId', 'carrierJobId', 'hauler', CINDERGLASS_JOB_ROUTE],
    ['escortAId', 'escortAJobId', 'patrol', CINDERGLASS_JOB_ESCORT_ROUTE],
    ['escortBId', 'escortBJobId', 'patrol', CINDERGLASS_JOB_ESCORT_B_ROUTE],
  ]) {
    const e = entity(state, st.entities[bodyKey]);
    if (!cinderglassJobBodyMatches(e, CINDERGLASS_JOB_ROLES[bodyKey], st.operationId)) return false;
    const expectedId = `job:${CINDERGLASS_JOB_ROLES[bodyKey].worldRecordId}`;
    const heldId = st.entities[jobKey];
    const held = heldId && state.npcJobs?.byId?.[heldId];
    const canonical = state.npcJobs?.byId?.[expectedId];
    const matches = entry => entry?.job?.id === expectedId && entry.job.kind === kind
      && entry.kind === kind && entry.worldRecordId === e.data.worldRecordId
      && entry.entityId === e.id && entry.entityRef === e && e.data.jobId === expectedId;
    if ((heldId && (heldId !== expectedId || !held || currentRole(sys, state, bodyKey) !== e || !matches(held)))
      || (canonical && (currentRole(sys, state, bodyKey) !== e || !matches(canonical)))) {
      st.admissionReason = 'traffic_assignment_conflict'; return false;
    }
    const id = heldId || (canonical ? expectedId : jobs.assign(e, { kind, route: routeFor(route), speed: CINDERGLASS_JOB_SPEED_WU,
        commissionS: 1, departS: 1, approachS: 1, loadS: 1, unloadS: 1, dwellS: 1,
        sectorId: CINDERGLASS_JOB_SECTOR_ID, homeStationId: 'station_tethys' }));
    if (id !== expectedId || !matches(state.npcJobs?.byId?.[id])) { st.admissionReason = 'traffic_assignment_refused'; return false; }
    st.entities[jobKey] = id;
  }
  st.admissionReason = null;
  return true;
}

export function cinderglassJobStepConvoy(sys, state) {
  const st = sys._cg, jobs = jobsService(sys);
  const carrier = entity(state, st.entities.carrierId);
  if (!cinderglassJobBodyMatches(carrier, CINDERGLASS_JOB_ROLES.carrierId, st.operationId)) return;
  const entry = state.npcJobs?.byId?.[st.entities.carrierJobId];
  // Missing/restoring/retired job is never a destination receipt.
  if (!entry?.job || entry.entityId !== carrier.id || entry.entityRef && entry.entityRef !== carrier
    || entry.worldRecordId !== CINDERGLASS_JOB_CARRIER_ID) { st.atLayby = false; st.laybyHoldActive = false; return; }
  const job = entry.job;
  st.routeLeg = job.routeIndex;
  const speed = Math.hypot(carrier.vel?.x || 0, carrier.vel?.z || 0);
  const near = Math.hypot(carrier.pos.x - CINDERGLASS_JOB_POINTS.pullOff.x,
    carrier.pos.z - CINDERGLASS_JOB_POINTS.pullOff.z) <= 18;
  const simT = Number(state.simTime) || 0;
  const elapsed = st._laybyLastAtS == null ? 0 : Math.max(0, Math.min(0.25, simT - st._laybyLastAtS));
  st._laybyLastAtS = simT;
  const claim = jobs?.controlClaim?.(st.entities.carrierJobId);
  st.laybyHoldActive = claim?.claimId === CLAIM_ID && claim.holder === FEATURE_ROLE;
  if (st.laybyHoldActive) {
    st.laybyRemainingS = Math.max(0, (st.laybyRemainingS || 0) - elapsed);
    if (st.laybyRemainingS <= 0) {
      jobs.releaseControl(st.entities.carrierJobId, CLAIM_ID);
      st.laybyHoldActive = false; st.laybyDone = true;
    }
  }
  // Canonical transit has reached the actual pull-off; lease the same hull once, resume
  // a saved remaining hold without jumping any elapsed wall time or route progress.
  if (!st.laybyDone && near && speed < 3.5 && job.routeIndex === CINDERGLASS_JOB_LAYBY_LEG
    && !st.laybyHoldActive) {
    const remaining = st.laybyRemainingS > 0 ? st.laybyRemainingS
      : st.suspicion >= 2 ? Math.max(6, CINDERGLASS_JOB_LAYBY_HOLD_S * 0.4) : CINDERGLASS_JOB_LAYBY_HOLD_S;
    const out = jobs.heaveToEntity?.(carrier.id, { claimId: CLAIM_ID, holder: FEATURE_ROLE,
      durationS: remaining + 1, cooldownS: 0 });
    if (out?.granted) { st.laybyRemainingS = remaining; st.laybyHoldS = remaining; st.laybyHoldActive = true; }
  }
  st.atLayby = near && speed < 3.5 && st.laybyHoldActive;
}

export function cinderglassJobDismissConvoy(sys, state) {
  const st = sys._cg, jobs = jobsService(sys);
  for (const [key, bodyKey] of [['carrierJobId', 'carrierId'], ['escortAJobId', 'escortAId'], ['escortBJobId', 'escortBId']]) {
    const id = st.entities[key] || `job:${CINDERGLASS_JOB_ROLES[bodyKey].worldRecordId}`;
    const e = entity(state, st.entities[bodyKey]);
    if (id === `job:${CINDERGLASS_JOB_ROLES[bodyKey].worldRecordId}`
      && cinderglassJobBodyMatches(e, CINDERGLASS_JOB_ROLES[bodyKey], st.operationId)) {
      const claim = jobs?.controlClaim?.(id);
      if (claim?.holder === FEATURE_ROLE) jobs.releaseControl?.(id, claim.claimId);
      jobs?.release?.(id);
    }
    st.entities[key] = null;
  }
  st.atLayby = false; st.laybyHoldActive = false;
  // Surviving hulls remain real aftermath actors; teardown's root exact-identity retirement
  // decides body lifetime. This helper never deletes a surviving escort by story convention.
}

export { cinderglassJobClearLatchMount, cinderglassJobCohortReady } from './physical.js';
