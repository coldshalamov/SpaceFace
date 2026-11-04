// Physical authoring and the narrow npcJobs target reader. No body/health/intent writer.
import { modelTruthRow, modelTruthProxyManifest } from '../../data/modelTruth.js';
import { ceresWorkfleetCollision } from '../../data/ceresWorkfleet.js';
import { physicsBodyNativeReady } from '../../core/physicsAuthority.js';
import { presentationAllowsPlayerFacingAction } from '../../core/presentationAdmission.js';
import {
  CINDERGLASS_JOB_SECTOR_ID, CINDERGLASS_JOB_ROLES, CINDERGLASS_JOB_ROUTE,
  CINDERGLASS_JOB_POINTS, CINDERGLASS_JOB_LATCH_HULL, CINDERGLASS_JOB_LATCH_ID,
  CINDERGLASS_JOB_LATCH_PROFILE, CINDERGLASS_JOB_LATCH_MOUNT_DEF,
  CINDERGLASS_JOB_LATCH_ASSET, CINDERGLASS_JOB_LATCH_ACCESS,
} from './definition.js';

export { CINDERGLASS_JOB_COMBAT_PROFILE, CINDERGLASS_JOB_MOUNT_DEFINITION } from './definition.js';

export function cinderglassJobBodyMatches(entity, descriptor, operationId) {
  return !!entity && entity.alive !== false && entity.data?.cinderglassRole === descriptor.role
    && entity.data.worldRecordId === descriptor.worldRecordId
    && entity.data.cinderglassOperationId === operationId;
}

// The packaged body fits its longest dimension to 2*packagedPropRadius, independently of
// gameplay radius. Use the measured source dimensions and reference radius so presentation,
// socket access and native measured proxies all share exactly the same planar scale.
export function cinderglassJobIndustrialSpec({ worldRecordId, role, assetId, pos, rot = 0,
  scale = 1, name, scanLabel, operationId, dynamic = false, hull = 800, mass = 80 }) {
  const row = modelTruthRow(assetId);
  if (!row?.bounds?.size || !(row.gameplay?.entityRadius > 0)
    || (!row.proposedSkin?.adopted && assetId !== 'place_ceres_section_cradle')) return null;
  const reference = row.gameplay.entityRadius;
  const radius = reference * scale;
  const spec = {
    type: role === 'latch' ? 'drone' : 'wreck', factionId: role === 'latch' ? 'faction_mts' : role === 'broker' ? 'faction_quiet' : 'faction_free', team: 2,
    pos: { x: pos.x, z: pos.z }, vel: { x: 0, z: 0 }, rot, radius, mass,
    hull, hullMax: hull, collides: true, ttl: Infinity, presentationAdmission: 'pending',
    flags: { missionPinned: true, persistent: true }, homeSectorId: CINDERGLASS_JOB_SECTOR_ID,
    physicsBody: { dynamic, radius, mass, inertiaY: Math.max(1, 0.5 * mass * radius * radius), ccd: dynamic, material: 'debris' },
    data: {
      cinderglassRole: role, cinderglassOperationId: operationId, worldRecordId,
      runtimeOwner: 'cinderglassJob', sectorId: CINDERGLASS_JOB_SECTOR_ID, homeSectorId: CINDERGLASS_JOB_SECTOR_ID,
      placeId: assetId, cinderglassAssetId: assetId, cinderglassAssetFile: row.url,
      packagedPropFile: row.url.replace('assets/ships/release/parts/', ''),
      packagedPropSlot: 'place', packagedPropRadius: Math.max(...row.bounds.size) * scale / 2,
      displayName: name, scannable: true, scanLabel,
      combatProfileId: role === 'latch' ? CINDERGLASS_JOB_LATCH_PROFILE : 'combat_profile_ceres_cradle',
    },
  };
  // The Ceres cradle's released geometry has a drawScale of 2. Its measured proxy is
  // already authored on that scale; packaged fit must retain it rather than shrink it.
  spec.data.packagedPropRadius *= row.drawScale || 1;
  const proxy = assetId === 'place_ceres_section_cradle'
    ? { ...ceresWorkfleetCollision('cradle', 'open', 'keepers-v2'),
      flags: { collides: true, renderable: false, targetable: false, radarVisible: false } }
    : modelTruthProxyManifest(spec);
  if (!proxy) return null;
  spec.physicsBody.collisionProxyManifest = proxy;
  return spec;
}

export function cinderglassJobLatchSpec(pos, rot, operationId) {
  const spec = cinderglassJobIndustrialSpec({ worldRecordId: CINDERGLASS_JOB_LATCH_ID,
    role: 'latch', assetId: CINDERGLASS_JOB_LATCH_ASSET, pos, rot, operationId,
    dynamic: true, hull: CINDERGLASS_JOB_LATCH_HULL, mass: 0.8,
    name: 'CG-7 · yellow external rack latch', scanLabel: 'CG-7 external latch · 60 HP · service jaw' });
  if (spec) spec.data.cinderglassAccessPoint = { ...CINDERGLASS_JOB_LATCH_ACCESS };
  return spec;
}

export function cinderglassJobPhysicalOwnersReady(sys) {
  const combat = sys.registry?.get?.('combat');
  const kernel = combat?.ensureKernel?.() || combat?.kernel;
  return !!(kernel?.catalog?.profiles?.has(CINDERGLASS_JOB_LATCH_PROFILE)
    && kernel.catalog.attachments.has(CINDERGLASS_JOB_LATCH_MOUNT_DEF)
    && typeof sys.helpers?.npcJobs?.assign === 'function');
}

export function cinderglassJobCohortReady(sys, state) {
  for (const [key, descriptor] of Object.entries(CINDERGLASS_JOB_ROLES)) {
    const e = state.entities?.get(sys._cg.entities[key]);
    if (!cinderglassJobBodyMatches(e, descriptor, sys._cg.operationId)
      || !physicsBodyNativeReady(e) || !presentationAllowsPlayerFacingAction(e, state)) return false;
    // Explicit packaged wreck/drone boundaries are not generic authored-place types.
    if (state.render?.scene && e.data.packagedPropFile && e.presentationAdmission !== 'ready') return false;
  }
  return true;
}

export function cinderglassJobEnsureLatchMount(sys, state) {
  const st = sys._cg;
  const carrier = state.entities?.get(st.entities.carrierId), latch = state.entities?.get(st.entities.latchId);
  if (!cinderglassJobBodyMatches(carrier, CINDERGLASS_JOB_ROLES.carrierId, st.operationId)
    || !cinderglassJobBodyMatches(latch, CINDERGLASS_JOB_ROLES.latchId, st.operationId)) return false;
  const service = sys.registry?.get?.('combat')?.kernel?.attachments;
  if (!service) return false;
  const previous = service.get(st.entities.latchMountId);
  if (previous?.state === 'active' && previous.defId === CINDERGLASS_JOB_LATCH_MOUNT_DEF
    && previous.ownerId === carrier.id && previous.targetId === latch.id) return true;
  // Adopt a canonical restored mount by its exact two original endpoints.
  const retained = service.listForEntity(carrier.id).find(a => a.state === 'active'
    && a.defId === CINDERGLASS_JOB_LATCH_MOUNT_DEF && a.ownerId === carrier.id && a.targetId === latch.id);
  if (retained) { st.entities.latchMountId = retained.id; return true; }
  if (st.latchMountCreated === true) return false; // a broken mount is not re-created
  const made = service.create({ defId: CINDERGLASS_JOB_LATCH_MOUNT_DEF,
    ownerId: carrier.id, targetId: latch.id, sourceSocketId: 'socket_hull', targetSocketId: 'socket_hull',
    sourceWorld: { x: latch.pos.x, z: latch.pos.z }, targetWorld: { x: latch.pos.x, z: latch.pos.z } });
  if (!made?.ok) return false;
  st.entities.latchMountId = made.attachment.id;
  st.latchMountCreated = true;
  return true;
}

export function cinderglassJobClearLatchMount(sys, state, reason = 'cinderglass_teardown') {
  const st = sys._cg, service = sys.registry?.get?.('combat')?.kernel?.attachments;
  const a = service?.get(st.entities.latchMountId);
  if (a?.state === 'active' && a.defId === CINDERGLASS_JOB_LATCH_MOUNT_DEF
    && cinderglassJobBodyMatches(state.entities?.get(a.ownerId), CINDERGLASS_JOB_ROLES.carrierId, st.operationId)
    && cinderglassJobBodyMatches(state.entities?.get(a.targetId), CINDERGLASS_JOB_ROLES.latchId, st.operationId)) {
    service.cut(a.id, null, reason);
  }
  st.entities.latchMountId = null;
}

// Read by the canonical npcJobs owner only. A matching nested job and original occupant
// must exist; no missing handle or feature projection can fabricate an arrival.
export function cinderglassJobTrafficTarget(state, entry, entity) {
  const st = state.world?.cinderglassJob;
  if (!st || !entry?.job || entry.entityId !== entity?.id || entry.entityRef && entry.entityRef !== entity
    || entity.data?.cinderglassOperationId !== st.operationId || entity.data?.jobId !== entry.job.id) return null;
  const descriptor = Object.values(CINDERGLASS_JOB_ROLES).find(r => r.worldRecordId === entry.worldRecordId);
  if (!descriptor || !['carrier', 'escort'].includes(descriptor.role)
    || !cinderglassJobBodyMatches(entity, descriptor, st.operationId)) return null;
  const job = entry.job;
  if (job.phase === 'flee' || job.phase === 'complete') return null;
  const moving = job.phase === 'transit' || job.phase === 'return';
  let index = moving ? job.routeIndex + 1 : job.routeIndex;
  if (job.kind === 'patrol') index %= job.route.length;
  const escortInspection = descriptor.role === 'escort' && job.routeIndex === 1 && !st.laybyDone;
  if (escortInspection) index = 1;
  const waypoint = job.route[index];
  if (!waypoint?.pos) return null;
  const held = entry.control?.holder === 'cinderglassJob' || escortInspection;
  const pos = held && descriptor.role === 'carrier' ? CINDERGLASS_JOB_POINTS.pullOff : waypoint.pos;
  const distance = Math.hypot(entity.pos.x - pos.x, entity.pos.z - pos.z);
  const speed = Math.hypot(entity.vel?.x || 0, entity.vel?.z || 0);
  return { cinderglassPhysical: true, pos, vel: { x: 0, z: 0 }, reach: 18,
    workPose: entity, navigationSpeed: job.speed, stopRadius: 10,
    settled: distance <= 18 && speed < 3.5, moving, held,
    blocked: !st.cohortAdmitted,
  };
}

// Advance a real travelled leg only after the low-speed native arrival. The kernel
// still emits its own route transition/complete receipts and remains its sole writer.
export function cinderglassJobTrafficDt(job, target, dt) {
  if (target.blocked || target.held || !target.settled) return 0;
  if (!target.moving) return dt;
  const a = job.route[job.routeIndex]?.pos;
  const b = target.pos;
  if (!a || !b || !(job.speed > 0)) return 0;
  return Math.max(0.000001, Math.hypot(a.x - b.x, a.z - b.z) / job.speed * (1 - job.progress) + 0.000001);
}

export function cinderglassJobLatchPaint(entity, materialName) {
  return entity?.data?.cinderglassRole === 'latch' && entity.data.worldRecordId === CINDERGLASS_JOB_LATCH_ID
    && materialName === 'esk_paint_rust' ? 0xd9b43a : null;
}
