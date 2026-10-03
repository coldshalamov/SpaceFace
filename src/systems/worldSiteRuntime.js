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
      && keeper.farResident !== true
      && staticProxyNeedsReplacement(keeper, wanted, componentAdmitted)) {
      // Static Rapier bodies are never teleported. A stage/socket transform change retires the old
      // materialization and lets the physics owner create a fresh body at its authoritative pose.
      // Far-ledger rows are not live bodies — leave them shelved until promote.
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
  let cloned = false;
  // Writes go through a shallow chain — copy the record and per-payload rows lazily rather than
  // JSON-cloning the whole site record every capture.
  const writablePayload = (id, durable) => {
    if (!cloned) { next = { ...record, payloads: { ...(record.payloads || {}) } }; cloned = true; }
    if (next.payloads[id] === durable) next.payloads[id] = { ...durable };
    return next.payloads[id];
  };
  // The entity index answers the payload lookup directly — payloads stamp
  // data.worldRecordId === payload.worldObjectId — and the pickups bucket bounds the spill
  // walk, so a forever-released pod no longer costs two full-map scans per capture.
  const index = state.entityIndex;
  const byWorldRecordId = index && index.byWorldRecordId instanceof Map ? index.byWorldRecordId : null;
  const pickupScan = index && Array.isArray(index.pickups) ? index.pickups : null;
  // Coverage-provable index: when _indexedIds mirrors every live entities entry, a
  // byWorldRecordId miss is the authoritative answer — a consumed pod would walk the
  // whole map forever for a provably-absent holder.
  const entities = state.entities instanceof Map ? state.entities : null;
  const covered = !!(byWorldRecordId && entities
    && index.ready === true
    && index._indexedIds instanceof Set
    && index._indexedIds.size === entities.size);
  for (const payload of manifest.payloads) {
    const durable = record.payloads && record.payloads[payload.id];
    if (!durable || durable.status !== 'released') continue;
    let live = null;
    let indexAnswered = false;
    if (byWorldRecordId) {
      const holder = byWorldRecordId.get(payload.worldObjectId);
      if (holder) {
        // A dead corpse can still hold the slot during mark→sweep (or a wrong twin under a
        // duplicated worldRecordId): only let a failed-predicate hit suppress the walk when
        // the row is provably unique — otherwise the walk may still find the live carrier.
        const twins = index.byWorldRecordIdCount instanceof Map
          ? index.byWorldRecordIdCount.get(payload.worldObjectId)
          : undefined;
        indexAnswered = twins === 1;
        // Under twins>1 the index holder is the first registrant, not necessarily the
        // walk's min-stableEntityId pick — accept the hit only when provably unique.
        if (twins === 1 && holder.alive !== false && holder.data
            && holder.data.worldSiteId === manifest.id
            && holder.data.worldSitePayloadId === payload.id) live = holder;
      } else if (covered) {
        indexAnswered = true;
      }
    }
    if (!live && !indexAnswered) {
      live = [...state.entities.values()]
        .filter((entity) => entity && entity.alive !== false && entity.data
          && entity.data.worldSiteId === manifest.id
          && entity.data.worldSitePayloadId === payload.id
          && entity.data.worldRecordId === payload.worldObjectId)
        .sort((a, b) => stableEntityId(a) - stableEntityId(b))[0] || null;
    }
    // The released pod's live pool plus any beam-split spills carrying the same payload
    // provenance together are the durable remainder; depletion and scattering both persist.
    const mergedPool = {};
    let sawContents = false;
    if (live && live.data && live.data.salvagePool && typeof live.data.salvagePool === 'object') {
      sawContents = true;
      for (const [commodityId, qty] of Object.entries(live.data.salvagePool)) {
        const whole = Math.floor(Number(qty));
        if (commodityId && Number.isFinite(whole) && whole > 0) mergedPool[commodityId] = (mergedPool[commodityId] || 0) + whole;
      }
    }
    for (const entity of (pickupScan || state.entities.values())) {
      const d = entity && entity.data;
      if (!entity || entity.alive === false || !d || entity.type !== 'pickup') continue;
      if (d.worldSiteId !== manifest.id || d.worldSitePayloadId !== payload.id) continue;
      const whole = Math.floor(Number(d.amount));
      if (typeof d.commodityId === 'string' && d.commodityId && Number.isFinite(whole) && whole > 0) {
        sawContents = true;
        mergedPool[d.commodityId] = (mergedPool[d.commodityId] || 0) + whole;
      }
    }
    const stored = durable.remainingPool && typeof durable.remainingPool === 'object'
      ? durable.remainingPool : null;
    const poolChanged = sawContents
      && (!stored || !sameCommodityPool(stored, mergedPool));
    if (!live || !finitePoint(live.pos) || !finitePoint(live.vel)) {
      if (!poolChanged) continue;
      writablePayload(payload.id, durable).remainingPool = mergedPool;
      changed = true;
      continue;
    }
    const motion = { pos: { x: live.pos.x, z: live.pos.z }, vel: { x: live.vel.x, z: live.vel.z } };
    if (!poolChanged && sameMotion(durable.motion, motion, force ? 0 : epsilon)) continue;
    const writable = writablePayload(payload.id, durable);
    writable.motion = motion;
    if (poolChanged) writable.remainingPool = mergedPool;
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
  for (const entity of worldSiteEntitySource(state, siteId)) {
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
  return [...worldSiteEntitySource(state, siteId)]
    .filter((entity) => entity && entity.alive !== false && entity.data && entity.data.worldSiteId === siteId)
    .sort((a, b) => String(a.data.worldRecordId).localeCompare(String(b.data.worldRecordId)) || stableEntityId(a) - stableEntityId(b));
}

// The byWorldSiteId bucket carries every live site entity (worldSiteId is spawn-literal only);
// fall back to the whole map when the index is absent or mid-build so headless paths keep working.
function worldSiteEntitySource(state, siteId) {
  const index = state && state.entityIndex;
  const bucket = index && index.__spacefaceEntityIndexV1 === true && index.ready === true
    && index.byWorldSiteId instanceof Map ? index.byWorldSiteId.get(siteId) : null;
  return bucket || state.entities.values();
}

function existingByWorldRecord(state, siteId) {
  const out = new Map();
  const add = (entity) => {
    if (!entity || entity.alive === false) return;
    const data = entity.data || {};
    const worldRecordId = data.worldRecordId || entity.worldRecordId;
    const worldSiteId = data.worldSiteId || entity.worldSiteId;
    if (worldSiteId !== siteId || !worldRecordId) return;
    if (!out.has(worldRecordId)) out.set(worldRecordId, []);
    out.get(worldRecordId).push(entity);
  };
  for (const entity of worldSiteEntitySource(state, siteId)) add(entity);
  const far = state.world && state.world.farActors;
  if (far && Array.isArray(far.rows)) {
    for (let i = 0; i < far.rows.length; i++) add(far.rows[i]);
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
  for (const entity of worldSiteEntitySource(state, siteId)) {
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

function sameCommodityPool(a, b) {
  const aKeys = Object.keys(a), bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (Math.floor(Number(a[key])) !== Math.floor(Number(b[key]))) return false;
  }
  return true;
}

function sameMotion(a, b, epsilon = 0) {
  const tolerance = Math.max(0, Number(epsilon) || 0);
  return finitePoint(a && a.pos) && finitePoint(a && a.vel)
    && Math.abs(a.pos.x - b.pos.x) <= tolerance
    && Math.abs(a.pos.z - b.pos.z) <= tolerance
    && Math.abs(a.vel.x - b.vel.x) <= tolerance
    && Math.abs(a.vel.z - b.vel.z) <= tolerance;
}

function wholeUnits(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// --- Industry receiver, power, convoy, lineage, and collateral (PB-IND / NXB-006 / NXB-023) ---
// Pure site results. Success credit exists only for a positive accepted quantity, and that
// quantity never exceeds the room left in the receiver. Convoy hulls stay with traffic.js.

const LOT_LINEAGE_CAP = 4;

function copyPoint(point) {
  return finitePoint(point) ? { x: point.x, z: point.z } : null;
}

function receiverSentence({ reason, successCredit, acceptedQty, remainderQty, commodityId }) {
  const name = commodityId || 'load';
  if (reason === 'closed') return 'Intake is closed.';
  if (reason === 'blocked-geometry') return 'The way in is blocked. The load stays put.';
  if (reason === 'jam-occupied') return 'Intake is jammed. Sort the blocking load or pull it clear.';
  if (reason === 'lip-contact') return 'The load kissed the lip. It did not enter.';
  if (reason === 'speed-window') return 'Too fast for the intake window. The load is still free.';
  if (reason === 'envelope') return 'The load is wider than the opening.';
  if (reason === 'wrong-class') return 'This intake will not take that cargo class.';
  if (reason === 'capacity-full') return `Receiver is full. ${remainderQty} ${name} stayed with the carrier.`;
  if (reason === 'zero-unit') return 'Receiver accepted nothing. No delivery credit.';
  if (reason === 'not-entered') return 'The load missed the intake and can be recovered.';
  if (successCredit && remainderQty > 0) return `Accepted ${acceptedQty} ${name}. ${remainderQty} redirected.`;
  if (successCredit) return `Accepted ${acceptedQty} ${name}.`;
  return null;
}

export function evaluateReceiverAcceptance(input = {}) {
  const offered = wholeUnits(input.quantity);
  const capacity = wholeUnits(input.capacity);
  const stored = Math.max(0, Math.floor(Number(input.stored) || 0));
  const remaining = Math.max(0, capacity - stored);
  const phase = typeof input.phase === 'string' ? input.phase : 'open';
  const entered = input.entered === true;
  const lip = input.lipContact === true && !entered;
  const occupied = input.occupied === true || phase === 'jam';
  const speed = Number.isFinite(input.relativeSpeed)
    ? Math.abs(input.relativeSpeed)
    : Math.hypot(Number(input.relVelX) || 0, Number(input.relVelZ) || 0);
  const maxSpeed = Number.isFinite(input.maxRelativeSpeed) ? input.maxRelativeSpeed : 22;
  const mouthHalf = Math.max(0, Number(input.mouthHalfWidth) || 0);
  const bodyRadius = Math.max(0, Number(input.bodyRadius) || 0);
  const damagedScale = Number.isFinite(input.damagedHalfWidthScale) && input.damagedHalfWidthScale > 0
    ? input.damagedHalfWidthScale
    : 0.55;
  const envelope = input.damaged === true ? mouthHalf * damagedScale : mouthHalf;
  const fits = mouthHalf <= 0 || bodyRadius <= envelope;
  const accepts = Array.isArray(input.acceptsClasses) ? input.acceptsClasses : null;
  const cargoClass = typeof input.cargoClass === 'string' ? input.cargoClass : null;
  const wrongClass = !!(cargoClass && accepts && !accepts.includes(cargoClass));
  let reason = null;
  if (phase === 'locked' || phase === 'closing' || phase === 'closed' || phase === 'shut' || input.open === false) reason = 'closed';
  else if (phase === 'jam' || (occupied && input.jamCleared !== true)) reason = 'jam-occupied';
  else if (!entered) reason = lip ? 'lip-contact' : 'not-entered';
  else if (speed > maxSpeed) reason = 'speed-window';
  else if (!fits) reason = 'envelope';
  else if (wrongClass) reason = 'wrong-class';
  else if (input.blockedGeometry === true) reason = 'blocked-geometry';
  else if (offered <= 0) reason = 'zero-unit';
  else if (remaining <= 0) reason = 'capacity-full';
  const acceptedQty = reason ? 0 : Math.min(offered, remaining);
  if (acceptedQty <= 0 && !reason) reason = 'zero-unit';
  const successCredit = acceptedQty > 0;
  const remainderQty = Math.max(0, offered - acceptedQty);
  const redirect = remainderQty > 0 && (reason === 'capacity-full' || successCredit)
    ? Object.freeze({
      commodityId: input.commodityId || null,
      qty: remainderQty,
      destinationId: input.alternateDestinationId || null,
    })
    : null;
  const sortingJob = reason === 'jam-occupied'
    ? Object.freeze({
      obstructingClass: input.obstructClass || 'scrap',
      validClass: input.intakeClass || 'ore',
      actions: Object.freeze(['remove', 'redirect']),
    })
    : null;
  const lotSentence = input.lot ? lotScanSentence(input.lot) : null;
  return Object.freeze({
    ok: successCredit,
    reason: successCredit ? null : reason,
    acceptedQty,
    remainderQty,
    storedAfter: stored + acceptedQty,
    successCredit,
    recoverable: !successCredit,
    relativeSpeed: speed,
    envelope,
    fits,
    inventoryCapApplied: false,
    handlingMass: Number.isFinite(input.mass) ? input.mass : null,
    teleported: false,
    payloadPos: copyPoint(input.payloadPos),
    sortingJob,
    redirect,
    phase,
    scanSentence: lotSentence || receiverSentence({
      reason: successCredit ? null : reason,
      successCredit,
      acceptedQty,
      remainderQty,
      commodityId: input.commodityId || null,
    }),
  });
}

export function commitReceiverAcceptance(ledger, contact, receiptId) {
  if (!ledger || !contact || contact.successCredit !== true || !(contact.acceptedQty > 0)) {
    return {
      ledger,
      committed: false,
      credit: 0,
      acceptedQty: 0,
      reason: contact && contact.reason || 'zero-unit',
    };
  }
  const id = String(receiptId);
  if (ledger.acceptedReceipts && ledger.acceptedReceipts[id]) {
    return { ledger, committed: false, credit: 0, acceptedQty: 0, duplicate: true, reason: 'duplicate' };
  }
  const room = Math.max(0, wholeUnits(ledger.capacity) - Math.max(0, Math.floor(Number(ledger.stored) || 0)));
  const accepted = Math.min(wholeUnits(contact.acceptedQty), room);
  if (accepted <= 0) {
    return { ledger, committed: false, credit: 0, acceptedQty: 0, reason: 'capacity-full' };
  }
  return {
    ledger: {
      ...ledger,
      stored: Math.max(0, Math.floor(Number(ledger.stored) || 0)) + accepted,
      acceptedReceipts: { ...(ledger.acceptedReceipts || {}), [id]: accepted },
    },
    committed: true,
    credit: accepted,
    acceptedQty: accepted,
    duplicate: false,
    reason: null,
  };
}

export function clearJamByShape(input = {}) {
  const radius = Math.max(0, Number(input.bodyRadius) || 0);
  const mouth = Math.max(0, Number(input.mouthHalfWidth) || 0);
  const damaged = input.damaged === true;
  if (input.action === 'withdraw') {
    return { cleared: true, inputsPreserved: true, parts: null, reason: null };
  }
  if (input.action === 'rotate') {
    const fits = mouth <= 0 || radius <= mouth;
    return { cleared: fits, inputsPreserved: true, parts: null, reason: fits ? null : 'envelope' };
  }
  if (input.action === 'salvage') {
    const limit = mouth <= 0 ? radius : mouth * (damaged ? 0.55 : 1);
    const portion = Math.min(radius, limit > 0 ? limit * 0.9 : radius);
    const fits = mouth <= 0 || portion <= limit;
    return {
      cleared: fits,
      inputsPreserved: false,
      parts: Object.freeze({ radius: portion, usable: fits }),
      reason: fits ? null : 'envelope',
    };
  }
  return { cleared: false, inputsPreserved: true, parts: null, reason: 'unknown-action' };
}

export function stepMachinePreconditions(state = {}, dt = 0) {
  const step = Math.max(0, Number(dt) || 0);
  const rate = Number.isFinite(state.rate) && state.rate > 0 ? state.rate : 1;
  const unconsumed = Math.max(0, Number(state.unconsumed) || 0);
  const scaleOf = Number.isFinite(state.bypassScale) && state.bypassScale > 0 ? state.bypassScale : 0.4;
  if (state.repaired === true) {
    const produced = Math.min(unconsumed, rate * step);
    return {
      ...state,
      running: produced > 0,
      outputScale: 1,
      produced,
      unconsumed: unconsumed - produced,
      reason: null,
      workaround: false,
      risk: false,
      superseded: true,
      collisionAuthority: true,
    };
  }
  if (state.safetyWeightSeated === true) {
    return {
      ...state,
      running: false,
      outputScale: 0,
      produced: 0,
      reason: 'interlock',
      risk: false,
      retained: unconsumed,
      collisionAuthority: true,
      accidentalBypass: false,
    };
  }
  if (state.bypassDeliberate === true) {
    const produced = Math.min(unconsumed, rate * step);
    return {
      ...state,
      running: produced > 0,
      outputScale: 1,
      produced,
      unconsumed: unconsumed - produced,
      reason: null,
      risk: true,
      collisionAuthority: true,
      lawNote: state.workerNearby === true ? 'worker-exposed' : 'bypass-unwatched',
      accidentalBypass: false,
    };
  }
  if (state.damaged === true && state.braceHeld === true && state.braceDisturbed !== true) {
    const produced = Math.min(unconsumed, rate * step * scaleOf);
    return {
      ...state,
      running: produced > 0,
      outputScale: scaleOf,
      produced,
      unconsumed: unconsumed - produced,
      reason: null,
      workaround: true,
      risk: false,
      collisionAuthority: true,
    };
  }
  if (state.damaged === true) {
    return {
      ...state,
      running: false,
      outputScale: 0,
      produced: 0,
      reason: 'brace-lost',
      retained: unconsumed,
      workaround: false,
      collisionAuthority: true,
    };
  }
  const produced = Math.min(unconsumed, rate * step);
  return {
    ...state,
    running: produced > 0,
    outputScale: 1,
    produced,
    unconsumed: unconsumed - produced,
    reason: null,
    collisionAuthority: true,
  };
}

export function createPowerBoard(spec = {}) {
  const budget = Number.isFinite(spec.budget) ? spec.budget : 10;
  const list = Array.isArray(spec.ops) && spec.ops.length ? spec.ops : [
    { id: 'refine', demand: Number.isFinite(spec.refineDemand) ? spec.refineDemand : 7 },
    { id: 'sort', demand: Number.isFinite(spec.sortDemand) ? spec.sortDemand : 6 },
  ];
  return {
    budget,
    heat: Math.max(0, Number(spec.heat) || 0),
    priorityId: null,
    simTime: Math.max(0, Number(spec.simTime) || 0),
    refused: false,
    reason: null,
    ops: list.map((op) => {
      const demand = Math.max(0, Number(op.demand) || 0);
      return {
        id: op.id,
        demand,
        baseDemand: Number.isFinite(op.baseDemand) ? op.baseDemand : demand,
        progress: Math.max(0, Number(op.progress) || 0),
        inputQty: Math.max(0, Number(op.inputQty) || 0),
        outputQty: Math.max(0, Number(op.outputQty) || 0),
      };
    }),
  };
}

export function setPowerParticipants(board, activeIds) {
  const active = new Set(activeIds || []);
  return {
    ...board,
    ops: board.ops.map((op) => ({
      ...op,
      demand: active.has(op.id) ? op.baseDemand : 0,
    })),
  };
}

export function choosePowerPriority(board, priorityId) {
  const known = board && board.ops && board.ops.some((op) => op.id === priorityId);
  return {
    ...board,
    priorityId: known ? priorityId : null,
    ops: board.ops.map((op) => ({ ...op })),
  };
}

export function stepPowerPriority(board, dt = 0) {
  const step = Math.max(0, Number(dt) || 0);
  const ops = board.ops.map((op) => ({ ...op }));
  const demand = ops.reduce((sum, op) => sum + (op.demand > 0 ? op.demand : 0), 0);
  const over = demand > board.budget;
  let heat = Math.max(0, Number(board.heat) || 0);
  if (over && !board.priorityId) {
    heat = Math.min(1, heat + step * 0.25);
    return {
      ...board,
      heat,
      ops,
      refused: true,
      reason: 'over-budget',
      simTime: board.simTime + step,
    };
  }
  let left = board.budget;
  const ordered = board.priorityId
    ? [ops.find((op) => op.id === board.priorityId), ...ops.filter((op) => op.id !== board.priorityId)]
    : ops;
  for (const op of ordered) {
    if (!op || !(op.demand > 0)) continue;
    const grant = Math.min(op.demand, Math.max(0, left));
    left -= grant;
    if (!(grant > 0) || !(op.inputQty > 0)) continue;
    const produced = Math.min(op.inputQty, (grant / op.demand) * step);
    op.inputQty -= produced;
    op.outputQty += produced;
    op.progress += produced;
  }
  heat = over ? Math.min(1, heat + step * 0.05) : Math.max(0, heat - step * 0.5);
  return {
    ...board,
    heat,
    ops,
    refused: false,
    reason: null,
    simTime: board.simTime + step,
  };
}

export function describePower(board) {
  if (!board) return null;
  const demand = board.ops.reduce((sum, op) => sum + (op.demand > 0 ? op.demand : 0), 0);
  return {
    budget: board.budget,
    demand,
    overBudget: demand > board.budget,
    priorityId: board.priorityId,
    heat: board.heat,
    refused: board.refused === true,
    reason: board.reason || null,
    simTime: board.simTime,
  };
}

export function createIndustryLedger(profile = {}) {
  return {
    stored: 0,
    capacity: wholeUnits(profile.capacity) || 8,
    acceptedReceipts: {},
    repair: null,
    sorting: null,
    worker: null,
    shortage: null,
    salvage: null,
    power: createPowerBoard({
      budget: profile.powerBudget,
      refineDemand: profile.refineDemand,
      sortDemand: profile.sortDemand,
      simTime: profile.simTime,
    }),
  };
}

export function reserveRepairOrder(ledger, order = {}) {
  if (ledger && ledger.repair && ledger.repair.orderId === order.orderId) {
    return { ledger, duplicate: true, order: ledger.repair };
  }
  const qty = wholeUnits(order.qty);
  const repair = {
    orderId: order.orderId,
    commodityId: order.commodityId,
    qty,
    received: 0,
    sourceId: order.sourceId || null,
    destId: order.destId || null,
    status: 'reserved',
    simTime: Math.max(0, Number(order.simTime) || 0),
    receipts: {},
    spawned: false,
    trafficIntent: {
      type: 'traffic:repair-parts',
      sourceId: order.sourceId || null,
      destId: order.destId || null,
      commodityId: order.commodityId,
      qty,
      ownerNotCalled: 'src/systems/traffic.js',
    },
  };
  return { ledger: { ...ledger, repair }, duplicate: false, order: repair };
}

export function deliverRepairParts(ledger, delivery = {}) {
  const order = ledger && ledger.repair;
  if (!order || order.orderId !== delivery.orderId) {
    return { ledger, ok: false, reason: 'no-order', consumed: 0, spawned: false };
  }
  if (delivery.receiptId && order.receipts[delivery.receiptId]) {
    return { ledger, ok: true, duplicate: true, consumed: 0, surplus: 0, order, spawned: false };
  }
  if (delivery.lost === true) {
    const next = {
      ...order,
      status: 'incomplete',
      spawned: false,
      recoverableCarrier: delivery.carrier || null,
      receipts: {
        ...order.receipts,
        [delivery.receiptId || 'lost']: { lost: true, qty: wholeUnits(delivery.qty), carrier: delivery.carrier || null },
      },
    };
    return {
      ledger: { ...ledger, repair: next },
      ok: false,
      reason: 'convoy-lost',
      consumed: 0,
      recoverable: true,
      spawned: false,
      order: next,
    };
  }
  if (delivery.commodityId !== order.commodityId) {
    return { ledger, ok: false, reason: 'incompatible', consumed: 0, surplus: wholeUnits(delivery.qty), order, spawned: false };
  }
  const offered = wholeUnits(delivery.qty);
  if (order.received >= order.qty || order.status === 'repaired') {
    return { ledger, ok: true, consumed: 0, surplus: offered, reason: 'already-filled', order, spawned: false };
  }
  const consumed = Math.min(order.qty - order.received, offered);
  const surplus = offered - consumed;
  const received = order.received + consumed;
  const next = {
    ...order,
    received,
    status: received >= order.qty ? 'repaired' : 'partial',
    spawned: false,
    receipts: {
      ...order.receipts,
      [delivery.receiptId || `recv-${received}`]: { consumed, surplus, carrier: delivery.carrier || null },
    },
  };
  const shortage = next.status === 'repaired' && ledger.shortage && ledger.shortage.closed !== true
    ? { ...ledger.shortage, status: 'closed', closed: true }
    : ledger.shortage;
  return {
    ledger: { ...ledger, repair: next, shortage },
    ok: consumed > 0,
    consumed,
    surplus,
    duplicate: false,
    spawned: false,
    order: next,
  };
}

export function offerSortingJob(ledger, spec = {}) {
  if (ledger && ledger.sorting && ledger.sorting.status === 'open') {
    return { ledger, job: ledger.sorting, duplicate: true };
  }
  const job = {
    status: 'open',
    workerId: spec.workerId || 'receiver-hauler',
    obstructClass: spec.obstructClass || 'scrap',
    validClass: spec.validClass || 'ore',
    obstructionId: spec.obstructionId || 'obstruction',
    obstructionAlive: true,
    receipts: {},
  };
  const worker = { id: job.workerId, stage: 'waiting-sort', ownerNotCalled: 'src/systems/traffic.js' };
  return { ledger: { ...ledger, sorting: job, worker }, job, duplicate: false };
}

export function resolveSortingJob(ledger, action = {}) {
  const job = ledger && ledger.sorting;
  if (!job) return { ledger, ok: false, reason: 'no-job', credit: 0 };
  if (action.receiptId && job.receipts[action.receiptId]) {
    return { ledger, ok: job.receipts[action.receiptId].ok === true, duplicate: true, credit: 0, job };
  }
  if (job.status !== 'open') return { ledger, ok: false, reason: 'no-job', credit: 0 };
  const match = action.cargoClass === job.obstructClass && (action.action === 'remove' || action.action === 'redirect');
  const receipts = { ...job.receipts };
  if (action.receiptId) receipts[action.receiptId] = { ok: match, cargoClass: action.cargoClass || null };
  if (!match) {
    const sorting = { ...job, receipts, obstructionAlive: true };
    return {
      ledger: { ...ledger, sorting },
      ok: false,
      reason: 'wrong-class',
      credit: 0,
      identityKept: true,
      job: sorting,
    };
  }
  const sorting = { ...job, status: 'cleared', receipts, obstructionAlive: true, obstructionRole: 'salvage' };
  const worker = { id: job.workerId, stage: 'resume-delivery', ownerNotCalled: 'src/systems/traffic.js' };
  const salvage = { id: job.obstructionId, interactable: true, role: 'salvage' };
  return {
    ledger: { ...ledger, sorting, worker, salvage },
    ok: true,
    credit: 1,
    throughput: 'resumed',
    worker,
    salvage,
  };
}

export function redirectFullDepot(ledger, contact) {
  if (!contact || !contact.redirect) return { ledger, redirected: false };
  const worker = {
    id: (ledger && ledger.worker && ledger.worker.id) || 'depot-hauler',
    stage: 'redirect',
    destinationId: contact.redirect.destinationId,
    qty: contact.redirect.qty,
    commodityId: contact.redirect.commodityId,
    ownerNotCalled: 'src/systems/traffic.js',
  };
  return { ledger: { ...ledger, worker }, redirected: true, worker };
}

export function openOutage(ledger, spec = {}) {
  if (ledger && ledger.shortage && ledger.shortage.closed !== true) {
    return { ledger, contract: ledger.shortage, duplicate: true };
  }
  const contract = {
    status: 'open',
    closed: false,
    cause: spec.cause || 'halted',
    missingCommodity: spec.missingCommodity || null,
    remedy: spec.remedy || null,
    recoveryOffer: spec.remedy || null,
    marketOwnerNotCalled: 'src/systems/economy.js',
  };
  return { ledger: { ...ledger, shortage: contract }, contract, duplicate: false };
}

export function closeOutage(ledger) {
  if (!ledger || !ledger.shortage) return { ledger, closed: false, duplicate: false };
  if (ledger.shortage.closed === true) return { ledger, closed: true, duplicate: true };
  return {
    ledger: { ...ledger, shortage: { ...ledger.shortage, status: 'closed', closed: true } },
    closed: true,
    duplicate: false,
  };
}

export function stampLot(spec = {}) {
  const qty = wholeUnits(spec.qty);
  const lotId = spec.lotId;
  return {
    lotId,
    originSiteId: spec.originSiteId || null,
    commodityId: spec.commodityId || null,
    qty,
    owner: spec.owner || 'player',
    committed: Math.min(qty, wholeUnits(spec.committed)),
    disputed: Math.min(qty, wholeUnits(spec.disputed)),
    delivered: 0,
    lost: 0,
    lineage: [lotId].slice(-LOT_LINEAGE_CAP),
  };
}

export function splitLot(lot, request = {}) {
  const taken = Math.min(wholeUnits(lot && lot.qty), wholeUnits(request.takenQty));
  const lineage = [...(lot.lineage || []), lot.lotId].slice(-LOT_LINEAGE_CAP);
  const child = {
    lotId: request.childLotId || `${lot.lotId}#${taken}`,
    parentLotId: lot.lotId,
    originSiteId: lot.originSiteId,
    commodityId: lot.commodityId,
    qty: taken,
    owner: request.newOwner || lot.owner,
    committed: request.committed === true ? taken : 0,
    disputed: request.disputed === true ? taken : 0,
    delivered: 0,
    lost: 0,
    lineage,
  };
  return { parent: { ...lot, qty: lot.qty - taken, lineage }, child };
}

export function loseLot(lot, qty) {
  const lost = Math.min(wholeUnits(lot && lot.qty), wholeUnits(qty));
  return { ...lot, qty: lot.qty - lost, lost: wholeUnits(lot.lost) + lost };
}

export function deliverLot(lot, qty) {
  const eligible = Math.max(0, wholeUnits(lot && lot.qty) - wholeUnits(lot && lot.committed) - wholeUnits(lot && lot.disputed));
  const sold = Math.min(eligible, wholeUnits(qty));
  return {
    lot: { ...lot, qty: lot.qty - sold, delivered: wholeUnits(lot.delivered) + sold },
    sold,
    sellable: eligible,
  };
}

export function recoverLot(lot, owner = 'player') {
  return { ...lot, disputed: 0, owner };
}

export function lotScanSentence(lot) {
  if (!lot || !lot.lotId) return null;
  const qty = wholeUnits(lot.qty);
  const committed = Math.min(qty, wholeUnits(lot.committed));
  const disputed = Math.min(Math.max(0, qty - committed), wholeUnits(lot.disputed));
  const owned = qty - committed - disputed;
  return `${lot.commodityId} from ${lot.originSiteId}, lot ${lot.lotId}: ${owned} owned, ${committed} committed, ${disputed} disputed.`;
}

export function judgeKillMachineCollateral(input = {}) {
  const phase = input.phase;
  const inside = (Array.isArray(input.occupants) ? input.occupants : []).filter((row) => row && row.inside === true);
  const visible = phase === 'surge' || phase === 'warning';
  if (!visible || inside.length === 0) {
    return {
      contact: false,
      credit: 0,
      collateral: [],
      attackerIds: [],
      playerExposed: false,
      dangerWindow: phase === 'warning',
      escape: 'leave-volume',
      usesExistingVolume: true,
      scriptedKill: false,
    };
  }
  const attackers = inside.filter((row) => row.role === 'attacker').map((row) => row.id);
  const collateral = inside
    .filter((row) => row.role === 'worker' || row.role === 'cargo')
    .map((row) => ({ id: row.id, role: row.role, kept: true }));
  return {
    contact: phase === 'surge' && attackers.length > 0,
    credit: 0,
    collateral,
    attackerIds: attackers,
    playerExposed: inside.some((row) => row.role === 'player'),
    dangerWindow: phase === 'warning',
    escape: 'leave-volume',
    usesExistingVolume: true,
    scriptedKill: false,
  };
}

export function projectIndustrySiteResult(ledger, contact = null, lot = null) {
  const repair = ledger && ledger.repair;
  return {
    scanSentence: (contact && contact.scanSentence) || (lot ? lotScanSentence(lot) : null),
    contact: contact || null,
    repairOffer: repair ? {
      ...repair.trafficIntent,
      status: repair.status,
      received: repair.received,
      qty: repair.qty,
      spawned: repair.spawned === true,
      ownerNotCalled: repair.spawned === true
        ? ((repair.trafficIntent && repair.trafficIntent.ownerNotCalled) || null)
        : 'src/systems/traffic.js',
    } : null,
    sortingJob: ledger && ledger.sorting || null,
    worker: ledger && ledger.worker || null,
    shortage: ledger && ledger.shortage || null,
    salvage: ledger && ledger.salvage || null,
    power: ledger && ledger.power ? describePower(ledger.power) : null,
    stored: ledger ? ledger.stored : 0,
    capacity: ledger ? ledger.capacity : 0,
  };
}

export default {
  syncWorldSiteMaterialization,
  removeWorldSiteMaterialization,
  liveWorldSiteEntities,
  captureWorldSitePayloadState,
  evaluateReceiverAcceptance,
  commitReceiverAcceptance,
  clearJamByShape,
  stepMachinePreconditions,
  createPowerBoard,
  setPowerParticipants,
  choosePowerPriority,
  stepPowerPriority,
  describePower,
  createIndustryLedger,
  reserveRepairOrder,
  deliverRepairParts,
  offerSortingJob,
  resolveSortingJob,
  redirectFullDepot,
  openOutage,
  closeOutage,
  stampLot,
  splitLot,
  loseLot,
  deliverLot,
  recoverLot,
  lotScanSentence,
  judgeKillMachineCollateral,
  projectIndustrySiteResult,
};
