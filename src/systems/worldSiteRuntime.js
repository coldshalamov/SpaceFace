// PQ-017 — imported materialization helper. asteroidSites remains the sole registered owner.

import { planWorldSiteMaterialization } from './worldSiteKernel.js';
import {
  PRESENTATION_OWNER_ADMISSION,
  presentationOwnerAdmissionForWorldRecord,
  presentationOwnerIsAdmitted,
} from '../core/presentationAdmission.js';

export const WORLD_SITE_PAYLOAD_CAPTURE_EPSILON = 0.25;

export function syncWorldSiteMaterialization({ state, helpers, manifest, record }) {
  if (!state || !state.entities || !manifest || !record) return { entities: [], spawned: 0, removed: 0 };
  const plan = planWorldSiteMaterialization(manifest, record);
  const desired = new Map(plan.entities.map((entry) => [entry.worldRecordId, entry]));
  const existing = existingByWorldRecord(state, manifest.id);
  // Entity ids are intentionally recyclable runtime handles. Preserve player-facing references by
  // the site's durable worldRecordId before a stage/admission change retires static bodies, then
  // bind those references to the replacement entity after materialization. Otherwise a recycled id
  // can silently steer or target a different component on the following tick.
  const trackedReferences = captureWorldSiteEntityReferences(state, manifest.id, desired);
  const rootWorldRecordId = `${manifest.worldObjectId}/root`;
  const wantedRoot = desired.get(rootWorldRecordId);
  const currentRoot = (existing.get(rootWorldRecordId) || [])
    .filter((entity) => entity && entity.alive !== false)
    .sort((a, b) => stableEntityId(a) - stableEntityId(b))[0] || null;
  const rootWillBeReplaced = !!(currentRoot && wantedRoot && rootNeedsReplacement(currentRoot, wantedRoot));
  const observedAdmission = presentationOwnerAdmissionForWorldRecord(rootWorldRecordId, state);
  const admissionAtSync = rootWillBeReplaced && observedAdmission !== PRESENTATION_OWNER_ADMISSION.headless
    ? PRESENTATION_OWNER_ADMISSION.pending
    : observedAdmission;
  const componentAdmitted = presentationOwnerIsAdmitted(admissionAtSync);
  let spawned = 0;
  let removed = 0;

  for (const [worldRecordId, entities] of existing) {
    const wanted = desired.get(worldRecordId);
    entities.sort((a, b) => stableEntityId(a) - stableEntityId(b));
    let keeper = entities[0] || null;
    if (keeper && wanted && wanted.type === 'fx' && rootNeedsReplacement(keeper, wanted)) {
      removeEntity(helpers, keeper);
      removed += 1;
      keeper = null;
    }
    if (keeper && wanted && wanted.type === 'wreck'
      && staticProxyNeedsReplacement(keeper, wanted, componentAdmitted)) {
      // Static Rapier bodies are never teleported. A stage/socket transform change retires the old
      // materialization and lets the physics owner create a fresh body at its authoritative pose.
      removeEntity(helpers, keeper);
      removed += 1;
      keeper = null;
    }
    for (const duplicate of entities.slice(keeper ? 1 : 0)) {
      removeEntity(helpers, duplicate);
      removed += 1;
    }
    if (!wanted) {
      if (keeper) { removeEntity(helpers, keeper); removed += 1; }
      continue;
    }
    if (keeper) updateExisting(keeper, wanted, manifest, record, componentAdmitted);
  }

  const after = existingByWorldRecord(state, manifest.id);
  const spawnEntity = helpers && helpers.spawnEntity;
  if (typeof spawnEntity === 'function') {
    for (const wanted of plan.entities) {
      const present = after.get(wanted.worldRecordId) || [];
      if (present.some((entity) => entity.alive !== false)) continue;
      const entity = spawnEntity(entitySpec(wanted, manifest, record, componentAdmitted));
      if (entity) spawned += 1;
    }
  }
  const references = rebindWorldSiteEntityReferences(state, manifest.id, trackedReferences);
  return {
    entities: liveWorldSiteEntities(state, manifest.id), spawned, removed, plan,
    admissionState: presentationOwnerAdmissionForWorldRecord(rootWorldRecordId, state),
    references,
  };
}

// Read the physics owner's latest live payload transform into the sole persistent site record.
// This never writes entity pose/velocity; rematerialization is the only reverse direction.
export function captureWorldSitePayloadState({
  state,
  manifest,
  record,
  tick = 0,
  force = false,
  epsilon = WORLD_SITE_PAYLOAD_CAPTURE_EPSILON,
}) {
  if (!state || !state.entities || !manifest || !record) return { record, changed: false };
  let next = record;
  let changed = false;
  for (const payload of manifest.payloads) {
    const durable = record.payloads && record.payloads[payload.id];
    if (!durable || durable.status !== 'released') continue;
    const live = [...state.entities.values()]
      .filter((entity) => entity && entity.alive !== false && entity.data
        && entity.data.worldSiteId === manifest.id
        && entity.data.worldSitePayloadId === payload.id
        && entity.data.worldRecordId === payload.worldObjectId)
      .sort((a, b) => stableEntityId(a) - stableEntityId(b))[0];
    if (!live || !finitePoint(live.pos) || !finitePoint(live.vel)) continue;
    const motion = { pos: { x: live.pos.x, z: live.pos.z }, vel: { x: live.vel.x, z: live.vel.z } };
    if (sameMotion(durable.motion, motion, force ? 0 : epsilon)) continue;
    if (!changed) next = JSON.parse(JSON.stringify(record));
    next.payloads[payload.id].motion = motion;
    changed = true;
  }
  if (changed) {
    next.updatedTick = Math.max(Number(next.updatedTick) || 0, Math.max(0, Math.trunc(Number(tick) || 0)));
    next.revision = Math.max(0, Math.trunc(Number(next.revision) || 0)) + 1;
  }
  return { record: next, changed };
}

export function removeWorldSiteMaterialization({ state, helpers, siteId, sectorId = null }) {
  if (!state || !state.entities) return 0;
  const existing = existingByWorldRecord(state, siteId);
  const trackedReferences = captureWorldSiteEntityReferences(state, siteId, existing);
  let removed = 0;
  for (const entity of state.entities.values()) {
    const data = entity && entity.data || {};
    if (entity.alive === false || data.worldSiteId !== siteId) continue;
    if (sectorId && data.homeSectorId && data.homeSectorId !== sectorId) continue;
    removeEntity(helpers, entity);
    removed += 1;
  }
  clearWorldSiteEntityReferences(trackedReferences, { retainStableNavIdentity: true });
  return removed;
}

export function liveWorldSiteEntities(state, siteId) {
  if (!state || !state.entities) return [];
  return [...state.entities.values()]
    .filter((entity) => entity && entity.alive !== false && entity.data && entity.data.worldSiteId === siteId)
    .sort((a, b) => String(a.data.worldRecordId).localeCompare(String(b.data.worldRecordId)) || stableEntityId(a) - stableEntityId(b));
}

function existingByWorldRecord(state, siteId) {
  const out = new Map();
  for (const entity of state.entities.values()) {
    const data = entity && entity.data || {};
    if (entity.alive === false || data.worldSiteId !== siteId || !data.worldRecordId) continue;
    if (!out.has(data.worldRecordId)) out.set(data.worldRecordId, []);
    out.get(data.worldRecordId).push(entity);
  }
  return out;
}

function captureWorldSiteEntityReferences(state, siteId, eligibleWorldRecords = null) {
  const candidates = [
    { holder: state.player, key: 'targetId', pointKey: null, kind: 'player-target' },
    { holder: state.nav && state.nav.waypoint, key: 'targetEntityId', pointKey: 'pos', kind: 'waypoint' },
    { holder: state.nav && state.nav.autopilot, key: 'targetEntityId', pointKey: 'target', kind: 'autopilot' },
  ];
  const tracked = [];
  for (const candidate of candidates) {
    if (!candidate.holder) continue;
    const id = candidate.holder[candidate.key];
    const stableWorldRecordId = candidate.kind === 'player-target'
      ? null
      : cleanWorldRecordId(candidate.holder.targetWorldRecordId);
    if (stableWorldRecordId && (!eligibleWorldRecords || eligibleWorldRecords.has(stableWorldRecordId))) {
      tracked.push({
        ...candidate,
        worldRecordId: stableWorldRecordId,
        priorEntityId: entityByRuntimeId(state, id)?.id ?? null,
      });
      continue;
    }
    if (id == null) continue;
    const entity = entityByRuntimeId(state, id);
    const data = entity && entity.data || {};
    if (!entity || entity.alive === false || data.worldSiteId !== siteId || !data.worldRecordId) continue;
    tracked.push({ ...candidate, worldRecordId: data.worldRecordId, priorEntityId: entity.id });
  }
  return tracked;
}

function rebindWorldSiteEntityReferences(state, siteId, tracked) {
  if (!tracked.length) return { tracked: 0, rebound: 0, cleared: 0 };
  const liveByWorldRecord = new Map();
  for (const entity of state.entities.values()) {
    if (!entity || entity.alive === false || entity.data?.worldSiteId !== siteId
      || !entity.data?.worldRecordId) continue;
    const current = liveByWorldRecord.get(entity.data.worldRecordId);
    if (!current || stableEntityId(entity) < stableEntityId(current)) {
      liveByWorldRecord.set(entity.data.worldRecordId, entity);
    }
  }
  let rebound = 0;
  let cleared = 0;
  for (const reference of tracked) {
    const replacement = liveByWorldRecord.get(reference.worldRecordId) || null;
    if (!replacement) {
      clearWorldSiteEntityReference(reference, { retainStableNavIdentity: false });
      cleared += 1;
      continue;
    }
    reference.holder[reference.key] = replacement.id;
    if (reference.kind !== 'player-target') {
      reference.holder.targetWorldRecordId = reference.worldRecordId;
    }
    if (reference.pointKey && finitePoint(replacement.pos)) {
      reference.holder[reference.pointKey] = { x: replacement.pos.x, z: replacement.pos.z };
    }
    if (replacement.id !== reference.priorEntityId) rebound += 1;
  }
  return { tracked: tracked.length, rebound, cleared };
}

function clearWorldSiteEntityReferences(tracked, options) {
  for (const reference of tracked) clearWorldSiteEntityReference(reference, options);
}

function clearWorldSiteEntityReference(reference, { retainStableNavIdentity = false } = {}) {
  reference.holder[reference.key] = null;
  if (reference.kind !== 'player-target') {
    if (retainStableNavIdentity) reference.holder.targetWorldRecordId = reference.worldRecordId;
    else delete reference.holder.targetWorldRecordId;
  }
  if (reference.kind === 'autopilot') {
    reference.holder.active = false;
    reference.holder.status = 'lost-target';
  }
}

function cleanWorldRecordId(value) {
  return typeof value === 'string' && value ? value : null;
}

function entityByRuntimeId(state, id) {
  let entity = state.entities.get(id) || null;
  if (!entity && typeof id === 'string') {
    const numeric = Number(id);
    if (Number.isFinite(numeric)) entity = state.entities.get(numeric) || null;
  }
  return entity;
}

function entitySpec(entry, manifest, record, componentAdmitted) {
  const commonData = {
    worldSiteId: manifest.id,
    worldObjectId: manifest.worldObjectId,
    worldRecordId: entry.worldRecordId,
    persistenceOwner: 'asteroidSites',
    presentationOwnerWorldRecordId: `${manifest.worldObjectId}/root`,
    homeSectorId: manifest.sectorId,
    sectorId: manifest.sectorId,
    siteStage: record.stageId,
  };
  if (entry.type === 'fx') {
    return {
      type: 'fx',
      pos: { ...entry.pos },
      rot: entry.rot,
      radius: entry.visualRadius,
      mass: 0,
      collides: false,
      ttl: Infinity,
      flags: { noInterp: true },
      data: {
        ...commonData,
        role: 'world_site_root',
        placeId: entry.placeId,
        placeScale: entry.scale,
        worldSitePresentation: entry.presentation,
        name: entry.label,
        worldDressing: true,
        visualRadius: entry.visualRadius,
        placeRadius: entry.visualRadius,
      },
    };
  }
  if (entry.type === 'payload') {
    return {
      type: 'payload',
      pos: { ...entry.pos },
      vel: { ...entry.vel },
      radius: entry.radius,
      mass: entry.mass,
      hull: 100,
      hullMax: 100,
      // Authored payloads are physical Massline targets, but sensor bodies: spawning inside the
      // authored site assembly must not create component impacts and roll the site back.
      collides: false,
      // `collides:false` removes the payload from the legacy broadphase, but SG-02 intentionally
      // retains non-colliding dynamic bodies so Massline can attach to them. Give that body an
      // explicit no-contact material instead of opting out of physics and breaking attachment.
      physicsBody: {
        dynamic: true,
        radius: entry.radius,
        mass: entry.mass,
        inertiaY: 0.5 * entry.mass * entry.radius * entry.radius,
        ccd: false,
        material: 'massline_sensor',
      },
      data: {
        ...commonData,
        role: 'world_site_payload',
        kind: 'payload',
        // Released site payloads are ordinary scanner contacts. This gives players a public,
        // deterministic Tab -> waypoint -> Massline path instead of requiring cursor-perfect aim
        // or a harness-only entity id. Presentation admission still gates the owning site root.
        worldSiteTargetable: true,
        worldSitePresentationAdmitted: true,
        worldSitePayloadId: entry.payloadId,
        payloadType: entry.payloadId,
        salvagePool: { ...entry.salvagePool },
        transientSector: false,
      },
    };
  }
  const collisionOnly = entry.proxyRole === 'collision';
  const hideComponentProxy = manifest.visualRoot?.componentProxyPresentation === 'hidden';
  const solid = componentAdmitted && entry.bodyType === 'solid';
  return {
    type: 'wreck',
    _noMesh: collisionOnly || hideComponentProxy,
    pos: { ...entry.pos },
    vel: { x: 0, z: 0 },
    radius: entry.radius,
    mass: solid ? 1e9 : 0,
    hull: 1e9,
    hullMax: 1e9,
    collides: solid,
    physicsBody: solid ? {
      dynamic: false,
      radius: entry.radius,
      mass: 1e9,
      inertiaY: 1e9,
      ccd: false,
      material: 'station',
    } : false,
    data: {
      ...commonData,
      role: collisionOnly ? 'world_site_collision' : 'world_site_component',
      kind: collisionOnly ? 'world_site_collision' : 'world_site_component',
      name: entry.label,
      ...(collisionOnly ? {
        worldSiteCollisionProxyId: entry.proxyId,
        worldSiteImpactComponentId: entry.failureComponentId || null,
      } : {
        worldSiteComponentId: entry.componentId,
        worldSiteComponentStatus: entry.status,
      }),
      worldSiteProxy: { ...entry.proxy },
      worldSitePresentationAdmitted: componentAdmitted,
      worldSiteTargetable: collisionOnly ? false : componentAdmitted,
      ...(collisionOnly ? {} : { operationOwner: 'asteroidSites' }),
    },
  };
}

function updateExisting(entity, entry, manifest, record, componentAdmitted) {
  if (entry.type === 'fx') {
    entity.pos.x = entry.pos.x;
    entity.pos.z = entry.pos.z;
  }
  const data = entity.data || (entity.data = {});
  data.siteStage = record.stageId;
  data.presentationOwnerWorldRecordId = `${manifest.worldObjectId}/root`;
  data.homeSectorId = manifest.sectorId;
  data.sectorId = manifest.sectorId;
  if (entry.type === 'fx') {
    data.placeId = entry.placeId;
    data.placeScale = entry.scale;
    data.worldSitePresentation = entry.presentation;
    data.name = entry.label;
    entity.radius = entry.visualRadius;
    data.visualRadius = entry.visualRadius;
    data.placeRadius = entry.visualRadius;
  } else if (entry.type === 'wreck') {
    const collisionOnly = entry.proxyRole === 'collision';
    if (!collisionOnly) data.worldSiteComponentStatus = entry.status;
    data.name = entry.label;
    data.worldSiteProxy = { ...entry.proxy };
    data.worldSitePresentationAdmitted = componentAdmitted;
    data.worldSiteTargetable = collisionOnly ? false : componentAdmitted;
    entity._noMesh = collisionOnly || manifest.visualRoot?.componentProxyPresentation === 'hidden';
    // Pose, radius, collision shape, and body definition are immutable for a live static body.
    // staticProxyNeedsReplacement has already retired any proxy whose authored physics changed.
  } else if (entry.type === 'payload') {
    data.worldSiteTargetable = true;
    data.worldSitePresentationAdmitted = true;
  }
}

function staticProxyNeedsReplacement(entity, wanted, componentAdmitted) {
  const solid = componentAdmitted && wanted.bodyType === 'solid';
  return !finitePoint(entity.pos)
    || entity.pos.x !== wanted.pos.x
    || entity.pos.z !== wanted.pos.z
    || entity.radius !== wanted.radius
    || !!entity.collides !== solid
    || !!(entity.data && entity.data.worldSitePresentationAdmitted) !== componentAdmitted;
}

function rootNeedsReplacement(entity, wanted) {
  const data = entity.data || {};
  return data.placeId !== wanted.placeId
    || data.placeScale !== wanted.scale
    || data.siteStage !== wanted.stageId
    || data.visualRadius !== wanted.visualRadius;
}

function removeEntity(helpers, entity) {
  if (!entity || entity.alive === false) return;
  const remove = helpers && (helpers.removeEntity || helpers.despawnEntity);
  if (typeof remove === 'function') remove(entity.id);
  else entity.alive = false;
}

function stableEntityId(entity) {
  const id = Number(entity && entity.id);
  return Number.isFinite(id) ? id : Number.MAX_SAFE_INTEGER;
}

function finitePoint(value) {
  return !!value && Number.isFinite(value.x) && Number.isFinite(value.z);
}

function sameMotion(a, b, epsilon = 0) {
  const tolerance = Math.max(0, Number(epsilon) || 0);
  return finitePoint(a && a.pos) && finitePoint(a && a.vel)
    && Math.abs(a.pos.x - b.pos.x) <= tolerance
    && Math.abs(a.pos.z - b.pos.z) <= tolerance
    && Math.abs(a.vel.x - b.vel.x) <= tolerance
    && Math.abs(a.vel.z - b.vel.z) <= tolerance;
}

export default {
  syncWorldSiteMaterialization,
  removeWorldSiteMaterialization,
  liveWorldSiteEntities,
  captureWorldSitePayloadState,
};
