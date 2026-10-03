// World-owned activity pass. Classifies every live entity once per tick, then
// names the Rapier/AI active set. Does not despawn, hide, or reroll identities.
// Visibility never equals death; pins and physics-reach decide fidelity.

import { isDynamicPhysicsBodyEntity, shouldSyncPhysicsBodyEntity } from '../core/physicsAuthority.js';
import {
  TABLE_REFERENCE_SPEED_WU,
  TABLE_SIM_ASPECT,
  glassHalfExtents,
  residencyPrefetchRadius,
  submitCullHalfExtents,
} from '../render/tabletopPolicy.js';
import {
  COLLISION_LOOKAHEAD_S,
  DEFAULT_GRACE_S,
  NEAR_EXIT_PAD_WU,
  PHYSICS_SAFETY_PAD_WU,
  PRESENTATION_TIER,
  SIM_TIER,
  classifyActivity,
  entityPresenceRadius,
  physicsReachWu,
  resolveSimTier,
  PIN_REASON,
} from './activityClassification.js';
import { hasActiveSpatialHash, queryNearbyEntities } from '../core/spatialQuery.js';
import { packPoseTable, poseTableDiscoveryScan } from './poseTable.js';
import { hasNearWorkSlot, shouldOwnerThink } from '../core/activityScheduler.js';
import { ballisticDrift, consumeScheduledWorldWake } from './worldCatchup.js';
import {
  captureEntityRecord,
  ensureWorldRecords,
  entityIsDurableCandidate,
  upsertRecord,
} from './worldRecords.js';
import { registerEntityWorldRecordId } from './livingWorldViews.js';

const RUNTIMES = new WeakMap();
const RECENT_DAMAGE_TICKS = 120;
const DAMAGE_PIN_S = 2;

// Glass/runway membership is tested per entity per rendered frame
// (entityMeshVisibility.shouldSubmitEntityMesh + renderer hold-exempt paths), so these must be
// Sets — the old array publish made every visible root pay an O(n) includes scan. `includes` is
// kept as an O(1) alias of `has` because callers written against the array publish still spell
// the lookup that way; both paths now cost the same.
class ActivityIdSet extends Set {
  includes(id) { return this.has(id); }
}

function finite(n, fallback = 0) {
  return Number.isFinite(n) ? n : fallback;
}

function isExactTier(tier) {
  return tier === SIM_TIER.S0_EXACT || tier === SIM_TIER.S1_NEAR;
}

// Owner views describe which actors are resident in an owner's active domain. S0/S1 actors stay
// in the view even on a skipped near cadence tick; each owner applies entityNeedsAiThink at its
// actual work boundary. S2/S3/S4 actors enter only for a deterministic scheduled wake (or an
// explicit exact pin), so far passive actors still do zero per-tick owner work.
function ownerViewNeedsWake(entity, state) {
  if (!entity || entity.alive === false) return false;
  const activity = entity.activity;
  const data = entity.data || {};
  const presence = data.factionPresence;
  // Authored K1 fixed-route craft are an explicit maneuver-owner wake, even when their global
  // route anchor is outside the player's current bubble. Generic far passive traffic has no such
  // admission and remains asleep until its durable nextEventAtT.
  if (presence && presence.source === 'depth-program-k1' && presence.fixedRoute === true) return true;
  if (!activity || !activity.simTier || isExactTier(activity.simTier) || activity.pinnedExact) return true;
  const due = Number(activity.nextEventAtT);
  const simTime = state && Number.isFinite(state.simTime)
    ? state.simTime
    : (state && Number.isInteger(state.tick) ? state.tick / 60 : -1);
  return Number.isFinite(due) && due >= 0 && simTime >= due;
}

function ownerViewNeedsWakeWithEdge(entity, state, wakeDue) {
  return wakeDue === true || ownerViewNeedsWake(entity, state);
}

function ownerAiRecord(entity) {
  if (!entity) return null;
  if (entity.ai && typeof entity.ai === 'object') return entity.ai;
  const data = entity.data;
  return data && data.ai && typeof data.ai === 'object' ? data.ai : null;
}

function dueAt(value, simTime) {
  return Number.isFinite(value) && value >= 0 && simTime >= value ? value : null;
}

function durableWakeDue(record, simTime) {
  return record && dueAt(record.nextEventAtT, simTime) != null;
}

function liveWakeDue(entity, simTime) {
  if (!entity) return null;
  const activity = entity.activity;
  const data = entity.data || {};
  const ai = ownerAiRecord(entity);
  const aiActivity = ai && ai.activity && typeof ai.activity === 'object' ? ai.activity : null;
  return dueAt(activity && activity.nextEventAtT, simTime)
    ?? dueAt(data.nextEventAtT, simTime)
    ?? dueAt(ai && ai.nextEventAtT, simTime)
    ?? dueAt(aiActivity && aiActivity.nextEventAtT, simTime);
}

function wakeEventForEntity(entity) {
  if (!entity) return null;
  const activity = entity.activity;
  const data = entity.data || {};
  return (activity && (activity.wakeEvent || activity.event))
    || data.wakeEvent
    || data.scheduledEvent
    || null;
}

function simCamera(state) {
  const camera = state && state.camera || {};
  const video = state && state.settings && state.settings.video || {};
  const zoom = Number.isFinite(camera.zoom) ? camera.zoom : 144;
  const fov = Number.isFinite(video.fov) ? video.fov : 50;
  const tilt = Number.isFinite(camera.tilt) ? camera.tilt : 60;
  return { zoom, fov, tilt };
}

export function simGlassHalfExtentsFromState(state) {
  const cam = simCamera(state);
  return glassHalfExtents(cam.zoom, cam.fov, TABLE_SIM_ASPECT, cam.tilt);
}

export function physicsReachWuFromState(state, originEntity = null) {
  const glass = simGlassHalfExtentsFromState(state);
  const player = originEntity || null;
  const speed = Math.max(
    TABLE_REFERENCE_SPEED_WU,
    finite(player && player.maxSpeed),
  );
  return physicsReachWu({
    glassDiagonalWu: 2 * Math.hypot(glass.halfX, glass.halfZ),
    maxRelativeSpeedWu: speed,
    collisionLookaheadS: COLLISION_LOOKAHEAD_S,
    largestColliderRadiusWu: Math.max(12, finite(player && player.radius)),
    safetyPadWu: PHYSICS_SAFETY_PAD_WU,
  });
}

function emptyPinFacts() {
  return {
    targetId: null,
    miningId: null,
    dockId: null,
    hailId: null,
    tether: new Set(),
    aggro: new Set(),
    projectileThreat: new Set(),
    tracked: new Set(),
    damagedByPlayerUntil: new Map(),
    damagedPlayerUntil: new Map(),
  };
}

function ensureRuntime(state) {
  let runtime = RUNTIMES.get(state);
  if (!runtime) {
    runtime = {
      classifiedTick: -1,
      classifiedMembership: null,
      classifiedStaticAuthority: null,
      ready: false,
      physicsReachWu: 0,
      glassHalfX: 0,
      glassHalfZ: 0,
      runwayHalfX: 0,
      runwayHalfZ: 0,
      physicsStatics: [],
      physicsDynamics: [],
      physicsStaticVersion: 0,
      physicsDynamicsVersion: 0,
      _staticEntities: [],
      _dynamicEntities: [],
      _staticAuthorityVersion: entityIndexPhysicsStaticVersion(state),
      _staticMembershipDirty: false,
      exactIds: [],
      nearIds: [],
      abstractIds: [],
      dormantIds: [],
      activeAiEntities: [],
      activeTrafficEntities: [],
      activityTransitionAiEntities: [],
      initialInactiveAiEntities: [],
      wakeCandidates: [],
      wakeTokensById: new Map(),
      wakeEventsById: new Map(),
      wakeBoundaryTick: -1,
      glassIds: new ActivityIdSet(),
      runwayIds: new ActivityIdSet(),
      counts: { s0: 0, s1: 0, s2: 0, s3: 0, s4: 0, physics: 0, r0: 0, r1: 0, r2: 0, r3: 0 },
      pinFacts: emptyPinFacts(),
      contextScratch: {},
      published: null,
      publishedCounts: null,
      reasonsById: new Map(),
      changedIds: [],
      signaturesById: new Map(),
      // Perf: per-entity cache of the last activitySignature string and the scalar parts it was
      // built from, so an unchanged entity between ticks costs zero string builds. The signature
      // string is a pure function of (simTier, presentationTier, nextEventAtT, pinnedExact,
      // pins content); reusablePins reports whether pins content changed this pass via
      // `_pinsChanged`, and the scalars compare directly. Same values in, same string out —
      // equality decisions and changedIds content are identical to rebuilding every tick.
      signatureCacheById: new Map(),
      _pinsChanged: false,
      pinBuffersById: new Map(),
      currentEntityIds: new Set(),
      frame: null,
      seenEntityIds: new Set(),
      classifyVisits: 0,
      classifyMode: 'full',
      radiusScratch: [],
      classifyEmptyFallback: [],
      unstampedScratch: [],
      classifyOutScratch: [],
      classifySeenScratch: new Set(),
      requestedReclassifyIds: new Set(),
      lastLiveCount: 0,
      pinResolveScratch: [],
      pinNormalizeScratch: { out: [], seen: new Set() },
    };
    RUNTIMES.set(state, runtime);
  }
  return runtime;
}

function publishScalars(state, runtime) {
  const counts = runtime.counts;
  const published = runtime.published || (runtime.published = {
    classifiedTick: -1,
    physicsReachWu: 0,
    physicsStaticVersion: 0,
    physicsStaticCount: 0,
    physicsDynamicCount: 0,
    counts: runtime.publishedCounts || (runtime.publishedCounts = {
      s0: 0, s1: 0, s2: 0, s3: 0, s4: 0, physics: 0,
      r0: 0, r1: 0, r2: 0, r3: 0,
    }),
    glassCount: 0,
    runwayCount: 0,
    exactCount: 0,
    aggregatePopulation: 0,
    reasonsById: runtime.reasonsById,
    changedIds: runtime.changedIds,
  });
  published.classifiedTick = runtime.classifiedTick;
  published.physicsReachWu = runtime.physicsReachWu;
  published.physicsStaticVersion = runtime.physicsStaticVersion;
  published.physicsStaticCount = runtime.physicsStatics.length;
  published.physicsDynamicCount = runtime.physicsDynamics.length;
  const target = published.counts;
  target.s0 = counts.s0;
  target.s1 = counts.s1;
  target.s2 = counts.s2;
  target.s3 = counts.s3;
  target.s4 = counts.s4;
  target.physics = counts.physics;
  target.r0 = counts.r0;
  target.r1 = counts.r1;
  target.r2 = counts.r2;
  target.r3 = counts.r3;
  published.glassCount = runtime.glassIds.size;
  published.runwayCount = runtime.runwayIds.size;
  published.exactCount = runtime.exactIds.length;
  published.aggregatePopulation = counts.s4;
  state.activityRuntime = published;
}

function captureDematerialized(state, entity, simTime, abstractTier) {
  if (!state || !entityIsDurableCandidate(entity, state.playerId)) return null;
  const d = entity.data || {};
  const sectorId = entity.homeSectorId || d.homeSectorId || d.sectorId
    || (state.world && state.world.currentSectorId);
  if (!sectorId) return null;
  const bag = ensureWorldRecords(state.world);
  const captured = captureEntityRecord(entity, {
    sectorId,
    seed: (state.meta && state.meta.seed) || 1,
    tick: state.tick | 0,
    simTime,
    previousRecord: d.worldRecordId && bag.byId[d.worldRecordId] ? bag.byId[d.worldRecordId] : null,
    recordsBag: bag,
    stationSource: state,
    extra: d.worldRecordId && bag.byId[d.worldRecordId] ? bag.byId[d.worldRecordId].extra : null,
    abstractTier: abstractTier || SIM_TIER.S2_ABSTRACT,
  });
  if (!captured) return null;
  upsertRecord(bag, captured);
  if (!entity.data) entity.data = {};
  entity.data.worldRecordId = captured.recordId;
  // Post-spawn stamp — register it so byWorldRecordId/count answer O(1) and the per-tick
  // miss-memos see the new carrier instead of walking entities until some hit reseeds.
  registerEntityWorldRecordId(state && state.entityIndex, entity);
  return captured;
}

function catchUpEntity(entity, rec, simTime) {
  if (!entity || !entity.pos) return;
  if (entity.type === 'projectile' || entity.type === 'fx') return;
  if (entity.alive === false) return;
  const dt = simTime - finite(rec.lastExactT, -1);
  if (!(dt > 0)) return;
  const next = ballisticDrift(entity.pos, entity.vel, entity.rot, entity.angVel, dt);
  entity.pos.x = next.pos.x;
  entity.pos.z = next.pos.z;
  if (!entity.vel || typeof entity.vel !== 'object') entity.vel = { x: next.vel.x, z: next.vel.z };
  else {
    entity.vel.x = next.vel.x;
    entity.vel.z = next.vel.z;
  }
  entity.rot = next.rot;
  entity.angVel = next.angVel;
}

function authoritativeCollisionIds(state) {
  const physics = state && (state.physics || state.physicsRuntime || state.physicsAuthority);
  if (!physics) return null;
  return physics.imminentCollisionIds
    || physics.lookaheadIds
    || physics.collisionLookaheadIds
    || (physics.lookahead && (physics.lookahead.ids || physics.lookahead.imminentIds))
    || null;
}

function imminentCollisionFor(state, player, entity, collisionIds) {
  if (!player || !entity || entity.id === player.id || !player.pos || !entity.pos) return false;
  const ids = collisionIds != null ? collisionIds : authoritativeCollisionIds(state);
  if (ids && (typeof ids.has === 'function' ? ids.has(entity.id) : Array.isArray(ids) && ids.includes(entity.id))) {
    return true;
  }
  const rvx = finite(entity.vel && entity.vel.x) - finite(player.vel && player.vel.x);
  const rvz = finite(entity.vel && entity.vel.z) - finite(player.vel && player.vel.z);
  const rpx = finite(entity.pos.x) - finite(player.pos.x);
  const rpz = finite(entity.pos.z) - finite(player.pos.z);
  const radius = Math.max(0, finite(entity.radius)) + Math.max(0, finite(player.radius));
  const d2 = rpx * rpx + rpz * rpz;
  const c = d2 - radius * radius;
  if (c <= 0) return true;
  const a = rvx * rvx + rvz * rvz;
  if (!(a > 1e-8)) return false;
  // Coarse reach: even a head-on close at full relative speed cannot arrive inside the
  // combined radius within the lookahead window. Skips the discriminant/sqrt for the
  // far majority of the classify near-disc (quiet rocks / parked traffic).
  const reach = radius + Math.sqrt(a) * COLLISION_LOOKAHEAD_S;
  if (d2 > reach * reach) return false;
  const b = 2 * (rpx * rvx + rpz * rvz);
  if (b >= 0) return false;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return false;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= COLLISION_LOOKAHEAD_S;
}

function makeStamp(classified, simTime) {
  return {
    simTier: classified.simTier,
    presentationTier: classified.presentationTier,
    nextEventAtT: classified.nextEventAtT != null ? classified.nextEventAtT : -1,
    pins: classified.pins,
    pinnedExact: classified.pinnedExact,
    lastExactT: simTime,
    lastObservedT: simTime,
    graceUntilT: -1,
  };
}

function reusablePins(runtime, id, pins) {
  let stable = runtime.pinBuffersById.get(id);
  if (!stable) {
    stable = [];
    runtime.pinBuffersById.set(id, stable);
  }
  let same = stable.length === pins.length;
  for (let i = 0; same && i < pins.length; i++) {
    if (stable[i] !== pins[i]) same = false;
  }
  if (!same) {
    stable.length = 0;
    for (let i = 0; i < pins.length; i++) stable.push(pins[i]);
  }
  // Perf scratch: tells cachedActivitySignature (the only caller between here and the next
  // reusablePins call) whether the stable pin buffer's CONTENT changed this pass.
  runtime._pinsChanged = !same;
  return stable;
}

function activitySignature(stamp) {
  return `${stamp.simTier}|${stamp.presentationTier}|${stamp.nextEventAtT}|${stamp.pinnedExact ? 1 : 0}|${stamp.pins.join(',')}`;
}

// Perf: identical output to activitySignature(stamp), but a stable entity between ticks (the
// common case — the same ~60 actors re-stamp at 60 Hz) reuses the cached string instead of
// rebuilding a template string + join every pass. Cache entries follow the exact lifecycle of
// pinBuffersById (deleted when the signature map's end-of-pass cleanup drops the entity).
function cachedActivitySignature(runtime, id, stamp) {
  let cache = runtime.signatureCacheById.get(id);
  if (cache
    && !runtime._pinsChanged
    && cache.simTier === stamp.simTier
    && cache.presentationTier === stamp.presentationTier
    && cache.nextEventAtT === stamp.nextEventAtT
    && cache.pinnedExact === stamp.pinnedExact) {
    return cache.signature;
  }
  const signature = activitySignature(stamp);
  if (!cache) {
    cache = {
      simTier: stamp.simTier,
      presentationTier: stamp.presentationTier,
      nextEventAtT: stamp.nextEventAtT,
      pinnedExact: stamp.pinnedExact,
      signature,
    };
    runtime.signatureCacheById.set(id, cache);
  } else {
    cache.simTier = stamp.simTier;
    cache.presentationTier = stamp.presentationTier;
    cache.nextEventAtT = stamp.nextEventAtT;
    cache.pinnedExact = stamp.pinnedExact;
    cache.signature = signature;
  }
  return signature;
}

function attachStamp(entity, rec) {
  const desc = Object.getOwnPropertyDescriptor(entity, 'activity');
  if (desc && desc.enumerable === false && desc.writable) {
    entity.activity = rec;
    return rec;
  }
  Object.defineProperty(entity, 'activity', {
    value: rec,
    enumerable: false,
    writable: true,
    configurable: true,
  });
  return rec;
}

function applyStamp(entity, classified, simTime) {
  let rec = entity.activity;
  if (!rec) {
    rec = makeStamp(classified, simTime);
    attachStamp(entity, rec);
    // Fresh stamp — physics partition depends on tier/pin; fill cache for classify.
    refreshPhysicsPartition(entity);
    return rec;
  }
  const prior = rec.simTier;
  const priorPinned = rec.pinnedExact;
  const wasExact = isExactTier(prior);
  let tier = classified.simTier;
  let nowExact = isExactTier(tier);
  if (wasExact && !nowExact) {
    if (!(rec.graceUntilT >= 0)) rec.graceUntilT = simTime + DEFAULT_GRACE_S;
    if (simTime <= rec.graceUntilT) {
      tier = prior;
    } else {
      rec.graceUntilT = -1;
      rec.lastExactT = simTime;
    }
  } else if (nowExact) {
    if (!wasExact && rec.lastExactT >= 0 && simTime > rec.lastExactT + 1e-4) {
      catchUpEntity(entity, rec, simTime);
    }
    rec.lastExactT = simTime;
    rec.graceUntilT = -1;
  }
  rec.simTier = tier;
  rec.presentationTier = classified.presentationTier;
  rec.pins = classified.pins;
  rec.pinnedExact = classified.pinnedExact;
  rec.lastObservedT = simTime;
  if (classified.nextEventAtT != null) rec.nextEventAtT = classified.nextEventAtT;
  else if (!Number.isFinite(rec.nextEventAtT) || rec.nextEventAtT < 0) rec.nextEventAtT = -1;
  // entityNeedsPhysics / shouldSync partition follows simTier + pinnedExact. Refresh only
  // when those flip so quiet revisits read the cached byte (profile shouldSyncPhysicsBodyEntity
  // + isDynamicPhysicsBodyEntity under classifyWorld).
  if (prior !== rec.simTier || priorPinned !== rec.pinnedExact || entity._physicsPartition == null) {
    refreshPhysicsPartition(entity);
  }
  return rec;
}

function setMatchesList(set, list) {
  if (set.size === 0 && list.length === 0) return true;
  if (list.length === 0 && set.size > 0) return false;
  if (set.size > list.length) return false;
  for (let i = 0; i < list.length; i++) {
    if (!set.has(list[i])) return false;
  }
  for (const item of set) {
    if (!list.includes(item)) return false;
  }
  return true;
}

function rebuildPinFacts(state, player, facts, simTime) {
  const playerId = player && player.id;
  const cache = facts._cache || (facts._cache = {
    playerId: null,
    targetId: null,
    miningId: null,
    dockId: null,
    hailId: null,
    trackedSignal: null,
    attachments: null,
    events: null,
    eventsLen: -1,
    damageExpiry: Infinity,
  });

  // Cheap scalar pins first — needed both for the cache key and for callers this tick.
  let nextTargetId = null;
  let nextMiningId = null;
  let nextDockId = null;
  let nextHailId = null;
  if (player && player.data && player.data.miningTargetId != null) {
    nextMiningId = player.data.miningTargetId;
  }
  const playerCombat = player && player.data && player.data.combat;
  if (playerCombat && playerCombat.targetId != null) nextTargetId = playerCombat.targetId;
  else if (playerCombat && playerCombat.lockTarget != null) nextTargetId = playerCombat.lockTarget;
  const dockId = player && (
    (player.data && (player.data.dockStationId || player.data.dockTargetId))
    || (player.flags && player.flags.dockStationId)
  );
  if (dockId != null) nextDockId = dockId;
  const hail = state && (state.comms && (state.comms.hailTargetId || state.comms.targetId)
    || state.ui && state.ui.hailTargetId);
  if (hail != null) nextHailId = hail;
  const signalState = state && state.signalInvestigation;
  const trackedSignal = signalState && signalState.trackedId;
  const attachments = state && state.combat && state.combat.attachments && state.combat.attachments.byId;
  const events = state && state.combat && state.combat.trace && Array.isArray(state.combat.trace.events)
    ? state.combat.trace.events
    : null;
  const eventsLen = events ? events.length : 0;

  facts.targetId = nextTargetId;
  facts.miningId = nextMiningId;
  facts.dockId = nextDockId;
  facts.hailId = nextHailId;

  const aggroScratch = facts._aggroScratch || (facts._aggroScratch = []);
  aggroScratch.length = 0;
  const trackedScratch = facts._trackedScratch || (facts._trackedScratch = []);
  trackedScratch.length = 0;
  const tetherScratch = facts._tetherScratch || (facts._tetherScratch = []);
  tetherScratch.length = 0;
  const threatScratch = facts._threatScratch || (facts._threatScratch = []);
  threatScratch.length = 0;

  // SG-06: player-intent pins arrive only through entity-carried state (see scalar
  // block above). Scanner owns the durable tracked contact — resolve its signal record
  // without asking the HUD to decide residency.
  const trackedId = trackedSignal;
  const trackedRecord = trackedId && signalState && signalState.records && signalState.records[trackedId];
  if (trackedRecord) {
    if (trackedRecord.entityId != null) trackedScratch.push(trackedRecord.entityId);
    if (trackedRecord.sourceId != null) trackedScratch.push(trackedRecord.sourceId);
  }

  if (attachments && typeof attachments === 'object') {
    for (const key of Object.keys(attachments)) {
      const att = attachments[key];
      if (!att || att.state === 'cut' || att.state === 'dead') continue;
      if (att.ownerId != null) tetherScratch.push(att.ownerId);
      if (att.targetId != null) tetherScratch.push(att.targetId);
    }
  }

  const index = state && state.entityIndex;
  const ships = index && Array.isArray(index.aiShips) ? index.aiShips : null;
  const scan = ships || (state && state.entityList) || [];
  for (let i = 0; i < scan.length; i++) {
    const e = scan[i];
    if (!e || e.alive === false) continue;
    const data = e.data || {};
    if (data.tracked === true || data.scannerTracked === true
      || (data.scanStatus === 'tracked' && data.scanned === true)) {
      trackedScratch.push(e.id);
    }
    const combat = data.combat || {};
    const ai = ownerAiRecord(e) || {};
    const activity = ai.activity && typeof ai.activity === 'object' ? ai.activity : {};
    if (playerId != null && (
      combat.targetId === playerId
      || combat.lockTarget === playerId
      || activity.targetId === playerId
      || ai.retaliationTargetId === playerId
      || ai.securityTargetId === playerId
    )) {
      aggroScratch.push(e.id);
    }
  }
  if (facts.targetId != null) aggroScratch.push(facts.targetId);

  const projectiles = index && Array.isArray(index.projectiles)
    ? index.projectiles
    : (state && state.entityList) || [];
  for (let i = 0; i < projectiles.length; i++) {
    const p = projectiles[i];
    if (!p || p.alive === false || p.type !== 'projectile') continue;
    const data = p.data || {};
    const tid = data.targetId;
    if (tid != null) threatScratch.push(tid);
    if (playerId != null && (data.ownerId === playerId || p.ownerId === playerId) && tid != null) {
      aggroScratch.push(tid);
    }
  }

  const damageStillValid = !(Number.isFinite(cache.damageExpiry) && simTime >= cache.damageExpiry);
  const damageChanged = !damageStillValid || cache.events !== events || cache.eventsLen !== eventsLen;

  const changed = (
    cache.playerId !== playerId
    || cache.targetId !== nextTargetId
    || cache.miningId !== nextMiningId
    || cache.dockId !== nextDockId
    || cache.hailId !== nextHailId
    || cache.trackedSignal !== trackedSignal
    || cache.attachments !== attachments
    || damageChanged
    || !setMatchesList(facts.aggro, aggroScratch)
    || !setMatchesList(facts.tracked, trackedScratch)
    || !setMatchesList(facts.tether, tetherScratch)
    || !setMatchesList(facts.projectileThreat, threatScratch)
  );

  if (changed) {
    facts.tether.clear();
    for (let i = 0; i < tetherScratch.length; i++) facts.tether.add(tetherScratch[i]);
    facts.aggro.clear();
    for (let i = 0; i < aggroScratch.length; i++) facts.aggro.add(aggroScratch[i]);
    facts.projectileThreat.clear();
    for (let i = 0; i < threatScratch.length; i++) facts.projectileThreat.add(threatScratch[i]);
    facts.tracked.clear();
    for (let i = 0; i < trackedScratch.length; i++) facts.tracked.add(trackedScratch[i]);

    if (damageChanged) {
      facts.damagedByPlayerUntil.clear();
      facts.damagedPlayerUntil.clear();
      if (events && playerId != null) {
        const tick = state.tick | 0;
        const untilT = simTime + DAMAGE_PIN_S;
        const start = Math.max(0, events.length - 48);
        for (let i = events.length - 1; i >= start; i--) {
          const event = events[i];
          if (!event) continue;
          const eventTick = Number.isInteger(event.tick) ? event.tick : tick;
          if (tick - eventTick > RECENT_DAMAGE_TICKS) break;
          if (event.kind && event.kind !== 'damage.routed' && event.kind !== 'damage') continue;
          if (event.attackerId === playerId && event.targetId != null) {
            facts.damagedByPlayerUntil.set(event.targetId, untilT);
            facts.aggro.add(event.targetId);
          }
          if (event.targetId === playerId && event.attackerId != null) {
            facts.damagedPlayerUntil.set(event.attackerId, untilT);
            facts.aggro.add(event.attackerId);
          }
        }
      }
      let damageExpiry = Infinity;
      if (facts.damagedByPlayerUntil.size || facts.damagedPlayerUntil.size) {
        damageExpiry = simTime + DAMAGE_PIN_S;
        for (const until of facts.damagedByPlayerUntil.values()) {
          if (Number.isFinite(until) && until < damageExpiry) damageExpiry = until;
        }
        for (const until of facts.damagedPlayerUntil.values()) {
          if (Number.isFinite(until) && until < damageExpiry) damageExpiry = until;
        }
      }
      cache.damageExpiry = damageExpiry;
    }

    facts._revision = (facts._revision | 0) + 1;
    cache.playerId = playerId;
    cache.targetId = nextTargetId;
    cache.miningId = nextMiningId;
    cache.dockId = nextDockId;
    cache.hailId = nextHailId;
    cache.trackedSignal = trackedSignal;
    cache.attachments = attachments;
    cache.events = events;
    cache.eventsLen = eventsLen;
  }
}

function countTier(counts, tier) {
  if (tier === SIM_TIER.S0_EXACT) counts.s0++;
  else if (tier === SIM_TIER.S1_NEAR) counts.s1++;
  else if (tier === SIM_TIER.S2_ABSTRACT) counts.s2++;
  else if (tier === SIM_TIER.S4_AGGREGATE) counts.s4++;
  else counts.s3++;
}

function countPresentation(counts, tier) {
  if (tier === PRESENTATION_TIER.R0_GLASS) counts.r0++;
  else if (tier === PRESENTATION_TIER.R1_RUNWAY) counts.r1++;
  else if (tier === PRESENTATION_TIER.R2_METADATA) counts.r2++;
  else counts.r3++;
}

function pushActivityIds(runtime, entity, stamp) {
  const id = entity.id;
  if (stamp.simTier === SIM_TIER.S0_EXACT) runtime.exactIds.push(id);
  else if (stamp.simTier === SIM_TIER.S1_NEAR) runtime.nearIds.push(id);
  else if (stamp.simTier === SIM_TIER.S2_ABSTRACT) runtime.abstractIds.push(id);
  else runtime.dormantIds.push(id);
  if (stamp.presentationTier === PRESENTATION_TIER.R0_GLASS) runtime.glassIds.add(id);
  else if (stamp.presentationTier === PRESENTATION_TIER.R1_RUNWAY) runtime.runwayIds.add(id);
}

/**
 * Sanctioned membership is the entity-index version. When it is unchanged,
 * no new ids exist and the incremental classifier must not rescan the fat
 * list just to prove that. A missing index cannot skip — raw entityList
 * edits have no cheap change signal.
 */
export function skipUnstampedRescan(membershipVersion, lastMembershipVersion) {
  return Number.isFinite(membershipVersion)
    && membershipVersion === lastMembershipVersion;
}

/**
 * Ask the next classify pass to re-stamp an entity that may sit outside the incremental visit
 * set (for example a far ambient patrol that a law dispatch just enlisted). Without the request
 * the actor keeps its shelved tier until the player-side discovery walk reaches it — physics-
 * unmaterialized hulls are invisible to the spatial-hash radius query and only the walk's
 * discovery disc can pick them up on its own.
 */
export function requestActivityReclassify(state, entity) {
  const runtime = state && RUNTIMES.get(state);
  if (!runtime || !entity || entity.id == null) return;
  runtime.requestedReclassifyIds.add(entity.id);
}

/**
 * Weapons fire mid-tick and bump the entity-index version. Re-running classifyWorld
 * for those shots is the crowded-combat hitch. Projectiles always need physics
 * without an activity stamp; append them to this tick's dynamics and keep the
 * already-classified world. Any non-projectile spawn or a shrink of the live
 * list still takes the full classify.
 */
export function admitSameTickProjectiles(state, runtime, membership) {
  if (!state || !runtime || !runtime.ready) return false;
  if (runtime.classifiedTick !== (state.tick | 0)) return false;
  const list = state.entityList || [];
  const lastN = runtime.lastLiveCount | 0;
  if (list.length < lastN) return false;
  const unseen = runtime.unstampedScratch || (runtime.unstampedScratch = []);
  unseen.length = 0;
  const index = state.entityIndex;
  const projectiles = index && index.__spacefaceEntityIndexV1 && index.ready === true
    && Array.isArray(index.projectiles)
    ? index.projectiles
    : list;
  for (let i = 0; i < projectiles.length; i++) {
    const entity = projectiles[i];
    if (!entity || entity.alive === false) continue;
    if (runtime.seenEntityIds.has(entity.id)) continue;
    if (entity.type !== 'projectile') return false;
    unseen.push(entity);
  }
  if (unseen.length === 0) return false;
  if (unseen.length !== list.length - lastN) return false;
  for (let i = 0; i < unseen.length; i++) {
    const entity = unseen[i];
    runtime.seenEntityIds.add(entity.id);
    runtime.currentEntityIds.add(entity.id);
    const partitionBefore = entity._physicsPartition;
    entity._physicsPartition = 2;
    if (partitionBefore !== 2) PHYSICS_PARTITION_EPOCH += 1;
    runtime.physicsDynamics.push(entity);
    runtime.physicsDynamicsVersion++;
    runtime.exactIds.push(entity.id);
    runtime.counts.physics += 1;
  }
  runtime.classifiedMembership = membership;
  runtime.lastLiveCount = list.length;
  runtime.classifyMode = 'projectile-append';
  return true;
}

function selectClassifyEntities(state, runtime, list, origin, reach, discoverWu) {
  if (!runtime.ready || runtime.seenEntityIds.size === 0) {
    return { mode: 'full', entities: list };
  }
  if (!(state && state.runtime && state.runtime.profileId === 'production')) {
    return { mode: 'full', entities: list };
  }
  const unstamped = runtime.unstampedScratch || (runtime.unstampedScratch = []);
  unstamped.length = 0;
  if (!skipUnstampedRescan(entityIndexVersion(state), runtime.classifiedMembership)) {
    for (let i = 0; i < list.length; i++) {
      const entity = list[i];
      // Entity ids are recycled through state.freeIds, so a live entity can carry an id that
      // seenEntityIds still holds from its previous holder — the end-of-pass cleanup retains it
      // because entities.get(id) answers live. "Unstamped" therefore has to mean the object has
      // no stamp, not merely that its id is new; otherwise the recycled actor is never visited,
      // never enters the owner views or physics dynamics, and drifts inert (D38 wave wasps).
      if (entity && entity.alive !== false
        && (!runtime.seenEntityIds.has(entity.id) || entity.activity == null)) {
        unstamped.push(entity);
      }
    }
    if (unstamped.length > 48) return { mode: 'full', entities: list };
  }

  const out = runtime.classifyOutScratch || (runtime.classifyOutScratch = []);
  out.length = 0;
  const seen = runtime.classifySeenScratch || (runtime.classifySeenScratch = new Set());
  seen.clear();
  const add = (entity) => {
    if (!entity || entity.alive === false || seen.has(entity.id)) return;
    seen.add(entity.id);
    out.push(entity);
  };
  for (let i = 0; i < unstamped.length; i++) add(unstamped[i]);
  // Owner systems can promote a shelved actor mid-tick (a law dispatch enlisting a far ambient
  // patrol is the live case): the incremental visit set would never reach it again, so the
  // request queue forces one re-stamp on the next classify pass.
  if (runtime.requestedReclassifyIds.size) {
    for (const id of runtime.requestedReclassifyIds) {
      add(state.entities && state.entities.get(id));
    }
    runtime.requestedReclassifyIds.clear();
  }
  for (let i = 0; i < runtime.exactIds.length; i++) {
    add(state.entities && state.entities.get(runtime.exactIds[i]));
  }
  for (let i = 0; i < runtime.nearIds.length; i++) {
    add(state.entities && state.entities.get(runtime.nearIds[i]));
  }
  const projectileIndex = state.entityIndex;
  const projectiles = projectileIndex && projectileIndex.__spacefaceEntityIndexV1
    && projectileIndex.ready === true && Array.isArray(projectileIndex.projectiles)
    ? projectileIndex.projectiles
    : list;
  for (let i = 0; i < projectiles.length; i++) {
    const entity = projectiles[i];
    if (entity && entity.alive !== false && entity.type === 'projectile') add(entity);
  }
  const scratch = runtime.radiusScratch;
  scratch.length = 0;
  const radius = Math.max(0, reach) + NEAR_EXIT_PAD_WU;
  // The classify disc is the same player-centred rect every pass, and the result is consumed as
  // a broad near-superset (never an exact circle). The coherent cache replays last pass's
  // candidates whenever the rect stays in the same cells and membership is unchanged; any
  // spawn/despawn/cell-crossing bumps the version and forces a fresh query, so correctness
  // is identical to an unconditional radius query.
  const classifyHash = state && state.spatialHash;
  if (origin && typeof classifyHash?.queryRadiusCoherent === 'function'
      && hasActiveSpatialHash(classifyHash)) {
    classifyHash.queryRadiusCoherent('activity:classify', origin.x, origin.z, radius, scratch);
  } else {
    queryNearbyEntities(state, origin, radius, scratch, runtime.classifyEmptyFallback);
  }
  for (let i = 0; i < scratch.length; i++) add(scratch[i]);
  // The spatial hash is rebuilt each tick from the PREVIOUS pass's physics set
  // (physics._rebuildSpatialHash -> spatialHashLayersFromState reads runtime.physicsStatics/
  // physicsDynamics). Anything that dropped out of that set — a station or rock shelved to
  // S3/R3 when the player flew past reach — is not in the hash, so the radius query can
  // never find it again no matter how close the player returns. The hash query is therefore
  // only a cache of last pass's neighbourhood; THIS walk is the discovery authority: every
  // live, positioned entity whose presence envelope reaches inside the discovery disc
  // (physics reach + exit pad, the residency prefetch radius, or the submit-cull corner —
  // whichever reaches furthest) is re-stamped this pass. The per-entity test is two
  // subtracts and a compare against scratch state — no allocation.
  if (origin) {
    const discover = Math.max(0, finite(discoverWu));
    const poseTable = packPoseTable(state);
    const byId = state.entities;
    const useColumns = poseTable
      && poseTable.source === list
      && poseTable._idlessCount === 0
      && byId && typeof byId.get === 'function';
    if (useColumns) {
      poseTableDiscoveryScan(poseTable, byId, seen, add, discover, origin);
    } else {
      for (let i = 0; i < list.length; i++) {
        const entity = list[i];
        if (!entity || entity.alive === false || !entity.pos || seen.has(entity.id)) continue;
        const limit = discover + entityPresenceRadius(entity);
        const dx = finite(entity.pos.x) - origin.x;
        const dz = finite(entity.pos.z) - origin.z;
        if (dx * dx + dz * dz <= limit * limit) add(entity);
      }
    }
  }
  return { mode: 'incremental', entities: out };
}


/** Bench A/B: production default ON. setClassifyFrameQuietRetainForBench(false) forces per-entity path. */
let CLASSIFY_FRAME_QUIET_RETAIN = true;
export function setClassifyFrameQuietRetainForBench(enabled) {
  CLASSIFY_FRAME_QUIET_RETAIN = enabled !== false;
}
export function getClassifyFrameQuietRetainForBench() {
  return CLASSIFY_FRAME_QUIET_RETAIN !== false;
}

/**
 * Bench A/B: production default ON. Early quiet latch short-circuits classifyWorld before
 * extents / rebuildPinFacts / selectClassify / frame-retain re-arm when the parked frame is
 * already proven stable. Different angle from held selectClassify id-replay (~1.16×) which
 * still paid extents+pinFacts+retain walk.
 */
let CLASSIFY_EARLY_QUIET_LATCH = true;
export function setClassifyEarlyQuietLatchForBench(enabled) {
  CLASSIFY_EARLY_QUIET_LATCH = enabled !== false;
}
export function getClassifyEarlyQuietLatchForBench() {
  return CLASSIFY_EARLY_QUIET_LATCH !== false;
}

/**
 * Bench A/B: production default ON. Flying rock retain republishes a rock stamp when the
 * player is moving but that rock's glass/runway membership, pin bits, sim tier, pose, and
 * pinFacts revision are unchanged — skips resolvePins / classifyActivity / applyStamp /
 * signature. Different angle from parked rock-visit (#127) / frame-retain (#128) / early
 * latch (#138), and from held rock context-only resolvePins (~1.09×).
 */
let CLASSIFY_FLYING_ROCK_RETAIN = true;
export function setClassifyFlyingRockRetainForBench(enabled) {
  CLASSIFY_FLYING_ROCK_RETAIN = enabled !== false;
}
export function getClassifyFlyingRockRetainForBench() {
  return CLASSIFY_FLYING_ROCK_RETAIN !== false;
}

const EMPTY_PIN_REASONS = Object.freeze([]);

const PIN_REASON_BIT = Object.freeze({
  [PIN_REASON.PLAYER]: 1,
  [PIN_REASON.CURRENT_TARGET]: 2,
  [PIN_REASON.RECENTLY_DAMAGED_BY_PLAYER]: 4,
  [PIN_REASON.RECENTLY_DAMAGED_PLAYER]: 8,
  [PIN_REASON.HOSTILE_AGGRO]: 16,
  [PIN_REASON.PROJECTILE_THREAT]: 32,
  [PIN_REASON.TETHER_OR_ATTACHMENT_COMPONENT]: 64,
  [PIN_REASON.DOCKING_OR_LANDING]: 128,
  [PIN_REASON.MISSION_CRITICAL]: 256,
  [PIN_REASON.ESCORT_OR_FOLLOW_RELATION]: 512,
  [PIN_REASON.HAIL_OR_SCRIPTED_CONVERSATION]: 1024,
  [PIN_REASON.PLAYER_MINING_TARGET]: 2048,
  [PIN_REASON.PLAYER_SCANNED_AND_TRACKED]: 4096,
  [PIN_REASON.IMMINENT_COLLISION]: 8192,
  [PIN_REASON.VISIBLE_ON_GLASS]: 16384,
});

function pinBitsOf(pins) {
  let bits = 0;
  if (!pins || pins.length === 0) return 0;
  for (let i = 0; i < pins.length; i++) {
    bits |= PIN_REASON_BIT[pins[i]] || 0;
  }
  return bits;
}

/** Rescan while early-latched (0.5 s @ 60 Hz). */
const CLASSIFY_EARLY_QUIET_RESCAN_TICKS = 30;

function retainOnlyExactOwnerEntities(entities) {
  if (!entities || entities.length === 0) return;
  let write = 0;
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (e && e.activity && isExactTier(e.activity.simTier)) {
      entities[write++] = e;
    }
  }
  entities.length = write;
}

function tryEarlyQuietClassifyLatch(state, runtime, player, origin) {
  if (CLASSIFY_EARLY_QUIET_LATCH === false) return false;
  const latch = runtime._earlyQuietLatch;
  if (!latch || latch.armed !== true) return false;
  if (!player || !player.pos) return false;
  const pvx = finite(player.vel && player.vel.x);
  const pvz = finite(player.vel && player.vel.z);
  if ((pvx * pvx + pvz * pvz) > 0.25) return false;
  const tick = state.tick | 0;
  if ((tick - (latch.armedTick | 0)) >= CLASSIFY_EARLY_QUIET_RESCAN_TICKS) return false;
  if (latch.originX !== origin.x || latch.originZ !== origin.z) return false;
  const cam = simCamera(state);
  if (latch.zoom !== cam.zoom || latch.fov !== cam.fov || latch.tilt !== cam.tilt) return false;
  const membership = entityIndexVersion(state);
  if (latch.membership !== membership) return false;
  const staticAuthority = entityIndexPhysicsStaticVersion(state);
  if (latch.staticAuthority !== staticAuthority) return false;
  const maxSpeed = Math.max(TABLE_REFERENCE_SPEED_WU, finite(player.maxSpeed));
  if (latch.maxSpeed !== maxSpeed) return false;
  // Cheap pin-intent smoke: mining/dock/hail/target flips must wake without waiting for rescan.
  const data = player.data || {};
  const combat = data.combat || {};
  if (latch.miningId !== (data.miningTargetId ?? null)) return false;
  if (latch.dockId !== (data.dockTargetId ?? null)) return false;
  if (latch.hailId !== (data.hailTargetId ?? null)) return false;
  if (latch.targetId !== (combat.targetId ?? data.targetId ?? null)) return false;
  // Durable scheduled wake due: cannot stay asleep when an actor's timer expires.
  const simTime = Number.isFinite(state.simTime) ? state.simTime : (tick / 60);
  const bag = state && state.world && state.world.records && state.world.records.byId;
  if (bag) {
    for (const id in bag) {
      if (durableWakeDue(bag[id], simTime)) return false;
    }
  }
  // Pose-key verify (same contract as frame-retain): any visit pose drift wakes so a
  // teleported rock cannot keep a stale glass/runway stamp under the early latch.
  const retain = runtime._rockVisitRetain;
  if (!retain || retain.framePrimed !== true) return false;
  const n = retain.frameVisitCount | 0;
  const ids = retain.frameVisitIds;
  const poseKeys = retain.poseKeys;
  const entities = state.entities;
  if (!entities || typeof entities.get !== 'function' || !Array.isArray(ids) || !poseKeys) {
    return false;
  }
  for (let i = 0; i < n; i++) {
    const id = ids[i];
    const entity = entities.get(id);
    if (!entity || entity.alive === false) return false;
    if (poseKeys.get(id) !== rockPoseRetainKey(entity)) return false;
  }
  runtime.classifyMode = 'early-quiet-latch';
  runtime.classifyVisits = 0;
  runtime.changedIds.length = 0;
  runtime.wakeCandidates.length = 0;
  runtime.wakeTokensById.clear();
  runtime.wakeEventsById.clear();
  runtime.wakeBoundaryTick = -1;
  retainOnlyExactOwnerEntities(runtime.activeAiEntities);
  retainOnlyExactOwnerEntities(runtime.activeTrafficEntities);
  return true;
}

function armEarlyQuietClassifyLatch(state, runtime, player, origin) {
  if (CLASSIFY_EARLY_QUIET_LATCH === false) {
    runtime._earlyQuietLatch = null;
    return;
  }
  if (runtime.wakeCandidates && runtime.wakeCandidates.length > 0) {
    runtime._earlyQuietLatch = null;
    return;
  }
  const cam = simCamera(state);
  const data = player && player.data || {};
  const combat = data.combat || {};
  runtime._earlyQuietLatch = {
    armed: true,
    armedTick: state.tick | 0,
    originX: origin.x,
    originZ: origin.z,
    zoom: cam.zoom,
    fov: cam.fov,
    tilt: cam.tilt,
    membership: entityIndexVersion(state),
    staticAuthority: entityIndexPhysicsStaticVersion(state),
    maxSpeed: Math.max(TABLE_REFERENCE_SPEED_WU, finite(player && player.maxSpeed)),
    miningId: data.miningTargetId ?? null,
    dockId: data.dockTargetId ?? null,
    hailId: data.hailTargetId ?? null,
    targetId: combat.targetId ?? data.targetId ?? null,
  };
}

function clearEarlyQuietClassifyLatch(runtime) {
  if (runtime && runtime._earlyQuietLatch) runtime._earlyQuietLatch = null;
}

/** Quantize XZ to ~0.25 wu so quiet parked rocks share a stable retain key. */
function rockPoseRetainKey(entity) {
  const pos = entity && entity.pos;
  const x = Math.round(finite(pos && pos.x) * 4);
  const z = Math.round(finite(pos && pos.z) * 4);
  return x * 73856093 + z * 19349663;
}

/**
 * Quiet Ceres near-disc is rock-dominated. When the player is essentially parked,
 * glass/runway extents are unchanged, pinFacts are unchanged, and a rock's quantized
 * pose matches last visit, re-publish the prior stamp into this tick's id lists without
 * re-running classifyActivity + applyStamp + signature. Different angle from the held
 * rock resolvePins / visit-context cuts (~1.09×) — those still paid classify+stamp.
 * Dirty-wake: player speed, origin/extents, pinFacts._revision, per-rock pose, scheduled
 * wake due, first observation, missing stamp/partition.
 */
function rockVisitRetainGlobalsMatch(runtime, origin, glass, submit, prefetchR, facts, player) {
  const retain = runtime._rockVisitRetain;
  if (!retain || retain.primed !== true) return false;
  const pvx = finite(player && player.vel && player.vel.x);
  const pvz = finite(player && player.vel && player.vel.z);
  // Flying / drifting player changes relative glass membership and collision threat.
  if ((pvx * pvx + pvz * pvz) > 0.25) return false;
  return retain.originX === origin.x
    && retain.originZ === origin.z
    && retain.glassHalfX === glass.halfX
    && retain.glassHalfZ === glass.halfZ
    && retain.runwayHalfX === submit.halfX
    && retain.runwayHalfZ === submit.halfZ
    && retain.prefetchR === prefetchR
    && retain.factsRevision === (facts._revision | 0)
    && retain.miningId === facts.miningId;
}

function armRockVisitRetain(runtime, origin, glass, submit, prefetchR, facts) {
  let retain = runtime._rockVisitRetain;
  if (!retain) {
    retain = {
      primed: false,
      framePrimed: false,
      frameVisitCount: 0,
      frameVisitIds: [],
      originX: 0,
      originZ: 0,
      glassHalfX: 0,
      glassHalfZ: 0,
      runwayHalfX: 0,
      runwayHalfZ: 0,
      prefetchR: 0,
      factsRevision: 0,
      miningId: null,
      poseKeys: new Map(),
    };
    runtime._rockVisitRetain = retain;
  }
  retain.primed = true;
  retain.originX = origin.x;
  retain.originZ = origin.z;
  retain.glassHalfX = glass.halfX;
  retain.glassHalfZ = glass.halfZ;
  retain.runwayHalfX = submit.halfX;
  retain.runwayHalfZ = submit.halfZ;
  retain.prefetchR = prefetchR;
  retain.factsRevision = facts._revision | 0;
  retain.miningId = facts.miningId;
  return retain;
}

function publishRetainedRockVisit(runtime, entity, stamp, statics, dynamics, counts) {
  runtime.currentEntityIds.add(entity.id);
  runtime.seenEntityIds.add(entity.id);
  pushActivityIds(runtime, entity, stamp);
  countTier(counts, stamp.simTier);
  countPresentation(counts, stamp.presentationTier);
  let partition = entity._physicsPartition;
  if (partition !== 0 && partition !== 1 && partition !== 2) {
    partition = refreshPhysicsPartition(entity);
  }
  if (partition === 2) dynamics.push(entity);
  else if (partition === 1) statics.push(entity);
}

/**
 * After #127 per-rock republish, quiet parked frames still cleared and rebuilt every
 * id list / physics partition / glass set. When globals match and every visit entity
 * still has a stable stamp + pose key (rocks and the parked player), keep last tick's
 * lists and skip the clear+visit loop. Dirty-wake: same as rock-visit retain, plus
 * visit-set identity (count/ids) and any non-retainable entity in the disc.
 */
function tryRetainClassifyFrame(runtime, visit, simTime, state) {
  if (CLASSIFY_FRAME_QUIET_RETAIN === false) return false;
  if (runtime.wakeCandidates && runtime.wakeCandidates.length > 0) return false;
  const bag = state && state.world && state.world.records && state.world.records.byId;
  if (bag) {
    for (const id in bag) {
      if (durableWakeDue(bag[id], simTime)) return false;
    }
  }
  const retain = runtime._rockVisitRetain;
  if (!retain || retain.framePrimed !== true) return false;
  const n = visit.length;
  if (n !== (retain.frameVisitCount | 0)) return false;
  const ids = retain.frameVisitIds;
  const poseKeys = retain.poseKeys;
  for (let i = 0; i < n; i++) {
    const entity = visit[i];
    if (!entity || entity.alive === false) return false;
    if (ids[i] !== entity.id) return false;
    const stamp = entity.activity;
    if (!stamp || !stamp.simTier || !stamp.presentationTier) return false;
    if (!runtime.seenEntityIds.has(entity.id)) return false;
    if (stamp.graceUntilT >= 0) return false;
    const data = entity.data || {};
    if (dueAt(stamp.nextEventAtT, simTime) != null) return false;
    if (dueAt(data.nextEventAtT, simTime) != null) return false;
    if (poseKeys.get(entity.id) !== rockPoseRetainKey(entity)) return false;
  }
  // Prior lists / counts / glass / runway / physics partitions stay valid.
  runtime.changedIds.length = 0;
  runtime.wakeCandidates.length = 0;
  runtime.wakeTokensById.clear();
  runtime.wakeEventsById.clear();
  runtime.wakeBoundaryTick = -1;
  runtime.classifyVisits = 0;
  runtime.classifyMode = 'frame-retain';
  retainOnlyExactOwnerEntities(runtime.activeAiEntities);
  retainOnlyExactOwnerEntities(runtime.activeTrafficEntities);
  return true;
}

function armClassifyFrameVisit(runtime, visit) {
  const retain = runtime._rockVisitRetain;
  if (!retain) return;
  if (runtime.wakeCandidates && runtime.wakeCandidates.length > 0) {
    retain.framePrimed = false;
    return;
  }
  const n = visit.length;
  let ids = retain.frameVisitIds;
  if (!Array.isArray(ids)) ids = retain.frameVisitIds = [];
  if (ids.length !== n) ids.length = n;
  const poseKeys = retain.poseKeys;
  for (let i = 0; i < n; i++) {
    const entity = visit[i];
    if (!entity) {
      retain.framePrimed = false;
      return;
    }
    ids[i] = entity.id;
    poseKeys.set(entity.id, rockPoseRetainKey(entity));
  }
  retain.frameVisitCount = n;
  retain.framePrimed = true;
}

/**
 * Flying / rescan residual under #138: when parked globals do not match (player moving or
 * origin drifted) but this rock's membership + pins + sim tier would be unchanged, republish
 * the prior stamp. Cheap geometry + pin-bit compare replaces resolvePins/normalize/classify/
 * applyStamp/signature. Dirty-wake: pose, facts revision, glass/runway size, glass membership
 * flip, pin input flip, sim-tier boundary, scheduled wake, grace, first observation.
 */
/**
 * Pre-clear flying frame retain: visit set is rock-only and each rock passes flying
 * eligibility. Keeps prior lists (no clear/republish). Any non-rock or failed rock aborts.
 */
function tryRetainFlyingClassifyFrame(runtime, visit, state, player, origin, glass, submit, prefetchR, facts, reach, simTime) {
  const retain = runtime._rockVisitRetain;
  if (!retain || !retain.poseKeys) return false;
  if ((retain.factsRevision | 0) !== (facts._revision | 0)) return false;
  if (retain.glassHalfX !== glass.halfX || retain.glassHalfZ !== glass.halfZ) return false;
  if (retain.runwayHalfX !== submit.halfX || retain.runwayHalfZ !== submit.halfZ) return false;
  if (retain.prefetchR !== prefetchR) return false;
  const n = visit.length;
  if (n === 0) return false;
  // Visit identity must match the last armed frame exactly. A shrunk/grown disc (player
  // flew far enough that selectClassify dropped rocks) must fall through so stale glass /
  // exact id lists cannot survive under a smaller visit.
  const ids = retain.frameVisitIds;
  if (!Array.isArray(ids) || (retain.frameVisitCount | 0) !== n) return false;
  for (let i = 0; i < n; i++) {
    const entity = visit[i];
    if (!entity || entity.alive === false) return false;
    if (ids[i] !== entity.id) return false;
    const type = entity.type;
    if (type !== 'asteroid' && type !== 'payload') {
      // Player moves every flying tick — pose key always changes. Player is always S0 /
      // on-glass at the classify origin, so the prior stamp stays valid without a pose check.
      // Any other non-rock (NPC ship/drone) must stay pose-stable or we fall through.
      if (entity.isPlayer === true || (player && entity.id === player.id)) continue;
      const stamp = entity.activity;
      if (!stamp || !stamp.simTier || !stamp.presentationTier) return false;
      if (stamp.graceUntilT >= 0) return false;
      const data = entity.data || {};
      if (dueAt(stamp.nextEventAtT, simTime) != null || dueAt(data.nextEventAtT, simTime) != null) {
        return false;
      }
      if (retain.poseKeys.get(entity.id) !== rockPoseRetainKey(entity)) return false;
      continue;
    }
    if (!flyingRockRetainEligible(
      runtime, entity, entity.activity, state, player, origin, glass, submit, prefetchR,
      facts, reach, simTime,
    )) return false;
  }
  runtime.changedIds.length = 0;
  runtime.wakeCandidates.length = 0;
  runtime.wakeTokensById.clear();
  runtime.wakeEventsById.clear();
  runtime.wakeBoundaryTick = -1;
  return true;
}

function flyingRockRetainEligible(runtime, entity, stamp, state, player, origin, glass, submit, prefetchR, facts, reach, simTime) {
  if (!stamp || !stamp.simTier || !stamp.presentationTier) return false;
  const retain = runtime._rockVisitRetain;
  if (!retain || !retain.poseKeys) return false;
  if (retain.poseKeys.get(entity.id) !== rockPoseRetainKey(entity)) return false;
  const data = entity.data || {};
  if (dueAt(stamp.nextEventAtT, simTime) != null || dueAt(data.nextEventAtT, simTime) != null) return false;
  if (stamp.graceUntilT >= 0) return false;

  const px = finite(entity.pos && entity.pos.x);
  const pz = finite(entity.pos && entity.pos.z);
  const dx = px - origin.x;
  const dz = pz - origin.z;
  const dist2 = dx * dx + dz * dz;
  const visual = Math.max(0, finite(entity.radius));
  const onGlass = Math.abs(dx) <= glass.halfX + visual && Math.abs(dz) <= glass.halfZ + visual;
  const submitRunway = Math.abs(dx) <= submit.halfX + visual && Math.abs(dz) <= submit.halfZ + visual;
  const prefetchKeep = dist2 <= (prefetchR + visual) * (prefetchR + visual);
  const onRunway = submitRunway || prefetchKeep;
  const expectedPres = onGlass
    ? PRESENTATION_TIER.R0_GLASS
    : (onRunway ? PRESENTATION_TIER.R1_RUNWAY : PRESENTATION_TIER.R3_UNLOADED);
  if (stamp.presentationTier !== expectedPres) return false;

  let bits = 0;
  if (onGlass) bits |= PIN_REASON_BIT[PIN_REASON.VISIBLE_ON_GLASS];
  const tether = facts.tether.has(entity.id)
    || !!(entity.flags && entity.flags.tethered)
    || data.tethered === true;
  if (tether) bits |= PIN_REASON_BIT[PIN_REASON.TETHER_OR_ATTACHMENT_COMPONENT];
  if (facts.miningId != null && entity.id === facts.miningId) {
    bits |= PIN_REASON_BIT[PIN_REASON.PLAYER_MINING_TARGET];
  }
  if (facts.tracked.has(entity.id)) bits |= PIN_REASON_BIT[PIN_REASON.PLAYER_SCANNED_AND_TRACKED];
  const mission = !!(entity.flags && entity.flags.missionPinned)
    || !!(data.missionPinned || data.missionId || data.missionTag || data.jobId);
  if (mission) bits |= PIN_REASON_BIT[PIN_REASON.MISSION_CRITICAL];
  const damagedUntil = facts.damagedByPlayerUntil.has(entity.id)
    ? facts.damagedByPlayerUntil.get(entity.id)
    : -1;
  if (damagedUntil >= 0 && simTime <= damagedUntil) {
    bits |= PIN_REASON_BIT[PIN_REASON.RECENTLY_DAMAGED_BY_PLAYER];
  }
  const stampBits = pinBitsOf(stamp.pins);
  const hadImminent = (stampBits & PIN_REASON_BIT[PIN_REASON.IMMINENT_COLLISION]) !== 0;
  if (hadImminent || imminentCollisionFor(state, player, entity)) return false;
  if (bits !== stampBits) return false;

  let expectedSim;
  if (bits !== 0) {
    expectedSim = SIM_TIER.S0_EXACT;
  } else {
    expectedSim = resolveSimTier(entity, EMPTY_PIN_REASONS, {
      pinsNormalized: true,
      origin,
      physicsReachWu: reach,
      priorSimTier: stamp.simTier,
      hasItinerary: !!data.itinerary,
    });
  }
  return stamp.simTier === expectedSim;
}

function tryFlyingRockRetain(runtime, entity, stamp, state, player, origin, glass, submit, prefetchR, facts, reach, simTime, statics, dynamics, counts) {
  if (CLASSIFY_FLYING_ROCK_RETAIN === false) return false;
  const retain = runtime._rockVisitRetain;
  if (!retain) return false;
  if ((retain.factsRevision | 0) !== (facts._revision | 0)) return false;
  if (retain.glassHalfX !== glass.halfX || retain.glassHalfZ !== glass.halfZ) return false;
  if (retain.runwayHalfX !== submit.halfX || retain.runwayHalfZ !== submit.halfZ) return false;
  if (retain.prefetchR !== prefetchR) return false;
  if (!flyingRockRetainEligible(
    runtime, entity, stamp, state, player, origin, glass, submit, prefetchR, facts, reach, simTime,
  )) return false;
  publishRetainedRockVisit(runtime, entity, stamp, statics, dynamics, counts);
  return true;
}

function classifyWorld(state, runtime) {
  const list = state.entityList || [];
  const player = state.playerId != null && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  const origin = player && player.pos ? player.pos : { x: 0, z: 0 };
  // Early quiet latch: parked + prior frame-retain proven → skip extents / pinFacts /
  // selectClassify / retain re-arm. Wakes on move, camera, membership, pin intent, rescan.
  if (tryEarlyQuietClassifyLatch(state, runtime, player, origin)) return;
  const simTime = Number.isFinite(state.simTime) ? state.simTime : (state.tick | 0) / 60;
  const cam = simCamera(state);
  const glass = glassHalfExtents(cam.zoom, cam.fov, TABLE_SIM_ASPECT, cam.tilt);
  const speed = Math.max(
    TABLE_REFERENCE_SPEED_WU,
    finite(player && player.maxSpeed),
  );
  const submit = submitCullHalfExtents(cam.zoom, cam.fov, TABLE_SIM_ASPECT, speed, cam.tilt);
  const prefetchR = residencyPrefetchRadius(speed, cam.zoom, cam.fov, TABLE_SIM_ASPECT, cam.tilt);
  const reach = physicsReachWuFromState(state, player);
  const facts = runtime.pinFacts;
  rebuildPinFacts(state, player, facts, simTime);

  runtime.physicsReachWu = reach;
  runtime.glassHalfX = glass.halfX;
  runtime.glassHalfZ = glass.halfZ;
  runtime.runwayHalfX = submit.halfX;
  runtime.runwayHalfZ = submit.halfZ;
  runtime.prefetchRadiusWu = prefetchR;

  // The incremental visit set must be able to rediscover anything whose footprint could
  // matter to this pass: inside physics reach (plus the near exit pad), inside the
  // residency prefetch disc, or inside the submit-cull corner. The widest of those is the
  // discovery radius; entityPresenceRadius then keeps big-hulled bodies (a station's dock
  // envelope) discoverable while their centre is still outside it.
  const discoverWu = Math.max(
    reach + NEAR_EXIT_PAD_WU,
    prefetchR,
    Math.hypot(submit.halfX, submit.halfZ),
  );

  const selection = selectClassifyEntities(state, runtime, list, origin, reach, discoverWu);
  runtime.classifyMode = selection.mode;
  runtime.classifyVisits = 0;

  const statics = runtime.physicsStatics;
  const dynamics = runtime.physicsDynamics;
  const counts = runtime.counts;
  const visit = selection.entities;
  // Hoist parked-frame retain eligibility once; rocks then only pay a pose-key map hit.
  const rockRetainFrame = rockVisitRetainGlobalsMatch(
    runtime, origin, glass, submit, prefetchR, facts, player,
  );
  const rockRetain = rockRetainFrame ? runtime._rockVisitRetain : null;
  // Full-frame retain AFTER #127: when every visit entity is stamp+pose stable, keep
  // last tick's id lists / partitions / counts and skip clear+visit republish.
  let frameRetained = false;
  if (rockRetainFrame && tryRetainClassifyFrame(runtime, visit, simTime, state)) {
    frameRetained = true;
    const pvx = finite(player && player.vel && player.vel.x);
    const pvz = finite(player && player.vel && player.vel.z);
    if ((pvx * pvx + pvz * pvz) <= 0.25) {
      armRockVisitRetain(runtime, origin, glass, submit, prefetchR, facts);
      armClassifyFrameVisit(runtime, visit);
      armEarlyQuietClassifyLatch(state, runtime, player, origin);
    } else if (runtime._rockVisitRetain) {
      runtime._rockVisitRetain.primed = false;
      runtime._rockVisitRetain.framePrimed = false;
      clearEarlyQuietClassifyLatch(runtime);
    }
  } else {
    clearEarlyQuietClassifyLatch(runtime);
  }
  // Flying frame retain: when parked frame-retain missed (origin moved) but every visit
  // entity is a rock that still flying-retains, keep prior id lists / partitions / counts.
  // Saves clear+republish on top of the per-rock resolvePins skip.
  if (!frameRetained && CLASSIFY_FLYING_ROCK_RETAIN !== false) {
    const pvx = finite(player && player.vel && player.vel.x);
    const pvz = finite(player && player.vel && player.vel.z);
    if ((pvx * pvx + pvz * pvz) > 0.25) {
      if (tryRetainFlyingClassifyFrame(
        runtime, visit, state, player, origin, glass, submit, prefetchR, facts, reach, simTime,
      )) {
        frameRetained = true;
        runtime.classifyMode = 'flying-frame-retain';
        runtime.classifyVisits = 0;
        const retain = runtime._rockVisitRetain;
        if (retain) {
          retain.factsRevision = facts._revision | 0;
          retain.miningId = facts.miningId;
          retain.glassHalfX = glass.halfX;
          retain.glassHalfZ = glass.halfZ;
          retain.runwayHalfX = submit.halfX;
          retain.runwayHalfZ = submit.halfZ;
          retain.prefetchR = prefetchR;
          retain.primed = false;
          retain.framePrimed = false;
        }
        clearEarlyQuietClassifyLatch(runtime);
      }
    }
  }
  if (!frameRetained) {
  statics.length = 0;
  dynamics.length = 0;
  runtime.exactIds.length = 0;
  runtime.nearIds.length = 0;
  runtime.abstractIds.length = 0;
  runtime.dormantIds.length = 0;
  runtime.activeAiEntities.length = 0;
  runtime.activeTrafficEntities.length = 0;
  runtime.activityTransitionAiEntities.length = 0;
  runtime.initialInactiveAiEntities.length = 0;
  runtime.wakeCandidates.length = 0;
  runtime.wakeTokensById.clear();
  runtime.wakeEventsById.clear();
  runtime.wakeBoundaryTick = -1;
  runtime.changedIds.length = 0;
  runtime.currentEntityIds.clear();
  runtime.glassIds.clear();
  runtime.runwayIds.clear();
  counts.s0 = 0;
  counts.s1 = 0;
  counts.s2 = 0;
  counts.s3 = 0;
  counts.s4 = 0;
  counts.physics = 0;
  counts.r0 = 0;
  counts.r1 = 0;
  counts.r2 = 0;
  counts.r3 = 0;

  const ctx = runtime.contextScratch;
  ctx.playerId = player && player.id;
  ctx.simTime = simTime;
  ctx.origin = origin;
  ctx.physicsReachWu = reach;
  ctx.currentTargetId = facts.targetId;
  ctx.pinScratch = runtime.pinResolveScratch;
  ctx.pinNormalizeScratch = runtime.pinNormalizeScratch;
  ctx.classifiedOut = runtime.classifiedOut || (runtime.classifiedOut = {
    pins: null,
    simTier: null,
    presentationTier: null,
    pinnedExact: false,
  });
  ctx.pinsNormalized = false;

  // Perf: per-pass invariants hoisted out of the visit loop. The physics lookahead set does not
  // change during this pass (it is republished by the physics system later in the same tick), and
  // the world-record bag is the same object for every entity this pass.
  const passCollisionIds = authoritativeCollisionIds(state);
  const passWorldRecordBag = state.world && state.world.records && state.world.records.byId;
  for (let i = 0; i < visit.length; i++) {
    const entity = visit[i];
    if (!entity || entity.alive === false) continue;
    runtime.classifyVisits++;
    const data = entity.data || {};
    const entityType = entity.type;
    // Quiet near-disc is rock-dominated. Asteroids/payloads never need ship AI / ace / authored
    // combat / escort / hail / dock / aggro context — fill the pin-relevant subset only.
    const rockBody = entityType === 'asteroid' || entityType === 'payload';
    // Quiet rock retain: parked player + stable extents/facts + stable pose → republish stamp
    // before glass/runway math, ctx fill, classifyActivity, applyStamp, or signature work.
    if (rockBody && rockRetain) {
      const stamp = entity.activity;
      const firstActivityObservation = !runtime.seenEntityIds.has(entity.id);
      const scheduledWakeDue = liveWakeDue(entity, simTime) != null;
      // Grace must be re-evaluated inside applyStamp (exact→far demotion). A retained
      // stamp would freeze graceUntilT and keep a far rock on the physics list forever.
      const gracePending = !!(stamp && stamp.graceUntilT >= 0);
      if (
        !firstActivityObservation
        && stamp
        && stamp.simTier
        && stamp.presentationTier
        && !scheduledWakeDue
        && !gracePending
        && rockRetain.poseKeys.get(entity.id) === rockPoseRetainKey(entity)
      ) {
        publishRetainedRockVisit(runtime, entity, stamp, statics, dynamics, counts);
        continue;
      }
    }
    // Flying / rescan residual: parked globals missed, but this rock may still be stable.
    if (rockBody && !rockRetain && runtime.seenEntityIds.has(entity.id)) {
      const stamp = entity.activity;
      if (tryFlyingRockRetain(
        runtime, entity, stamp, state, player, origin, glass, submit, prefetchR,
        facts, reach, simTime, statics, dynamics, counts,
      )) {
        continue;
      }
    }
    const px = finite(entity.pos && entity.pos.x);
    const pz = finite(entity.pos && entity.pos.z);
    const dx = px - origin.x;
    const dz = pz - origin.z;
    const dist2 = dx * dx + dz * dz;
    const visual = entityPresenceRadius(entity);
    const onGlass = Math.abs(dx) <= glass.halfX + visual && Math.abs(dz) <= glass.halfZ + visual;
    const submitRunway = Math.abs(dx) <= submit.halfX + visual && Math.abs(dz) <= submit.halfZ + visual;
    const prefetchKeep = dist2 <= (prefetchR + visual) * (prefetchR + visual);
    const onRunway = submitRunway || prefetchKeep;
    const ai = rockBody ? null : ownerAiRecord(entity);
    runtime.currentEntityIds.add(entity.id);
    const firstActivityObservation = !runtime.seenEntityIds.has(entity.id);
    runtime.seenEntityIds.add(entity.id);
    ctx.visibleOnGlass = onGlass;
    ctx.onGlass = onGlass;
    ctx.onRunway = onRunway;
    ctx.mapOrRadar = entity.type === 'ship' || entity.type === 'station' || entity.type === 'drone';
    ctx.hostileAggro = facts.aggro.has(entity.id);
    ctx.projectileThreat = facts.projectileThreat.has(entity.id);
    ctx.tetherOrAttachment = facts.tether.has(entity.id)
      || !!(entity.flags && entity.flags.tethered)
      || data.tethered === true;
    ctx.dockingOrLanding = facts.dockId != null && entity.id === facts.dockId;
    ctx.escortOrFollow = !!(data.escort || (ai && (ai.escort || ai.follow)));
    ctx.hailOrConversation = facts.hailId != null && entity.id === facts.hailId;
    ctx.playerMiningTarget = facts.miningId != null && entity.id === facts.miningId;
    ctx.playerScannedAndTracked = facts.tracked.has(entity.id);
    ctx.damagedByPlayerUntilT = facts.damagedByPlayerUntil.has(entity.id)
      ? facts.damagedByPlayerUntil.get(entity.id)
      : -1;
    ctx.damagedPlayerUntilT = facts.damagedPlayerUntil.has(entity.id)
      ? facts.damagedPlayerUntil.get(entity.id)
      : -1;
    const recId = data.worldRecordId;
    const worldRec = recId && passWorldRecordBag ? passWorldRecordBag[recId] : null;
    const scheduledWakeDue = durableWakeDue(worldRec, simTime)
      || liveWakeDue(entity, simTime) != null;
    if (scheduledWakeDue) runtime.wakeCandidates.push(entity);
    ctx.hasItinerary = !!data.itinerary || scheduledWakeDue;
    ctx.priorSimTier = entity.activity && entity.activity.simTier;
    ctx.graceUntilT = entity.activity && entity.activity.graceUntilT;
    const authoredPresence = data.factionPresence
      && data.factionPresence.source === 'depth-program-k1';
    // Combat-postured hull — carries an authored reason to fight: an explicit combatant flag,
    // an escalation trigger, or an attack_run activity. Such ships are never "ordinary
    // traffic": they keep the ordinary distance tiers (live to the physics rim, dormant past
    // it) instead of aggregating into anonymous population.
    const combatPostured = !!(ai && (ai.combatant === true || ai.engagementTrigger != null
      || (ai.activity && ai.activity.kind === 'attack_run')));
    const authoredActiveCombat = authoredPresence && ai && ai.passive === false
      && combatPostured;
    const namedAceActor = !!(
      data.namedAceId
      || (data.aceMemory && data.aceMemory.aceId)
      || (ai && ai.namedAceId)
    );
    ctx.missionCritical = !!(data.jobId || data.missionId || data.missionTag || data.missionPinned
      || data.activityActorSlotId
      || (typeof data.activityObjectSlotId === 'string' && /[a-z]/i.test(data.activityObjectSlotId))
      || namedAceActor
      || (entity.flags && entity.flags.missionPinned)
      // A lawful ship answering a law-security incident — chasing an aggressor or holding a
      // witnessed wreck — is mission-critical even when it began as far ambient traffic; without
      // this the aggregate gate below shelved the enlisted patrol in S4_AGGREGATE where it could
      // never think or move (seed 8008 witnessed-kill chaser frozen at 250 WU with pins:[]).
      // Mirrors the pin rule in activityClassification.classifyEntityPins.
      || (ai && (ai.securityTargetId != null || ai.witnessRole != null))
      // K1 authored active presence is a named, durable combat actor even when its global sector
      // coordinates place it beyond the current player's ordinary activity bubble. Preserve it in
      // the exact owner view; generic far passive traffic remains wake-gated below.
      || authoredActiveCombat);
    ctx.imminentCollision = imminentCollisionFor(state, player, entity, passCollisionIds);
    // Distant-sleep gate: a generic ship off the submit (draw) runway is aggregate population.
    // Test against `submitRunway` alone — `onRunway` also includes `prefetchKeep`, the mesh
    // residency decode-ahead band (TABLE_RESIDENCY_PREFETCH_SECONDS past the glass). That band
    // is a render-resource horizon, not a sim-liveness boundary: when the prefetch window grew
    // 2.0 s → 3.5 s the keep rim reached ~1070 WU and ordinary traffic ~900 WU out re-entered
    // S1_NEAR and the SG-06 roster instead of sleeping on the far ledger (D133). Combat-postured
    // hulls are exempt: an inbound attacker lives to the physics rim regardless of the runway.
    ctx.aggregateOnly = entity.type === 'ship'
      && !onGlass
      && !submitRunway
      && !data.itinerary
      && !data.named
      && !combatPostured
      && !ctx.missionCritical;
    ctx.dormant = false;

    const classified = classifyActivity(entity, ctx);
    const priorTier = entity.activity && entity.activity.simTier;
    classified.pins = reusablePins(runtime, entity.id, classified.pins);
    const stamp = applyStamp(entity, classified, simTime);
    if (worldRec && Number.isFinite(worldRec.nextEventAtT)) {
      stamp.nextEventAtT = worldRec.nextEventAtT;
    }
    if (isExactTier(priorTier) && !isExactTier(stamp.simTier)) {
      captureDematerialized(state, entity, simTime, stamp.simTier);
      if (ai) runtime.activityTransitionAiEntities.push(entity);
    }
    if (firstActivityObservation && ai && !isExactTier(stamp.simTier)) {
      const intent = (entity.data && entity.data.intent) || entity.intent;
      if (intent && (intent.fire === true || intent.fireGroup != null)) {
        runtime.initialInactiveAiEntities.push(entity);
      }
    }
    const signature = cachedActivitySignature(runtime, entity.id, stamp);
    // '' is a valid sentinel: real signatures always contain '|' separators.
    if ((runtime.signaturesById.get(entity.id) ?? '') !== signature) {
      runtime.signaturesById.set(entity.id, signature);
      runtime.changedIds.push(entity.id);
    }
    runtime.reasonsById.set(entity.id, stamp.pins);
    countTier(counts, stamp.simTier);
    countPresentation(counts, stamp.presentationTier);
    pushActivityIds(runtime, entity, stamp);
    // Owner systems consume these live views instead of walking entityList and then filtering
    // aggregate/dormant actors. Keep all S0/S1 owners resident in the view so a skipped near
    // cadence tick cannot make a tactical roster disappear; owner systems apply the cadence at
    // their actual work boundary. S2/S3/S4 enter only at their deterministic wake.
    if (ai && ownerViewNeedsWakeWithEdge(entity, state, scheduledWakeDue)) runtime.activeAiEntities.push(entity);
    if (data.trafficRole && ownerViewNeedsWakeWithEdge(entity, state, scheduledWakeDue)) {
      runtime.activeTrafficEntities.push(entity);
    }

    // Physics partition cache: 0=skip, 1=static, 2=dynamic. applyStamp refreshes on
    // tier/pin flips; first touch fills. Avoids re-entering authoredPhysicsBody/defaultDynamic
    // on every quiet classify revisit.
    let partition = entity._physicsPartition;
    if (partition !== 0 && partition !== 1 && partition !== 2) {
      partition = refreshPhysicsPartition(entity);
    }
    if (partition === 2) dynamics.push(entity);
    else if (partition === 1) statics.push(entity);
    if (rockBody) {
      const retain = runtime._rockVisitRetain || armRockVisitRetain(
        runtime, origin, glass, submit, prefetchR, facts,
      );
      retain.poseKeys.set(entity.id, rockPoseRetainKey(entity));
    }
  }

  // Arm/refresh rock-visit retain globals after a quiet parked pass so the next tick can
  // republish. Flying player leaves primed/framePrimed=false but refreshes facts/extents
  // meta so flying rock retain can key off an up-to-date revision (pose keys already set).
  {
    const pvx = finite(player && player.vel && player.vel.x);
    const pvz = finite(player && player.vel && player.vel.z);
    if ((pvx * pvx + pvz * pvz) <= 0.25) {
      armRockVisitRetain(runtime, origin, glass, submit, prefetchR, facts);
      armClassifyFrameVisit(runtime, visit);
      // Do not arm early latch here — first parked pass must prove frame-retain next tick.
      clearEarlyQuietClassifyLatch(runtime);
    } else {
      const retain = runtime._rockVisitRetain || armRockVisitRetain(
        runtime, origin, glass, submit, prefetchR, facts,
      );
      // Keep facts/extents + visit ids current for flying frame retain; do not claim parked primed.
      retain.factsRevision = facts._revision | 0;
      retain.miningId = facts.miningId;
      retain.glassHalfX = glass.halfX;
      retain.glassHalfZ = glass.halfZ;
      retain.runwayHalfX = submit.halfX;
      retain.runwayHalfZ = submit.halfZ;
      retain.prefetchR = prefetchR;
      retain.primed = false;
      armClassifyFrameVisit(runtime, visit);
      retain.framePrimed = false; // parked frame-retain must not fire on these ids while flying
      clearEarlyQuietClassifyLatch(runtime);
    }
  }
  } // end !frameRetained visit path

  if (runtime.classifyMode === 'incremental') {
    const liveN = (state.entityList || []).length;
    counts.s3 = Math.max(0, liveN - counts.s0 - counts.s1 - counts.s2 - counts.s4);
  }

  // frame-retain keeps the prior incremental lists — same prune gate as incremental.
  const pruneLikeIncremental = runtime.classifyMode === 'incremental'
    || runtime.classifyMode === 'frame-retain'
    || runtime.classifyMode === 'early-quiet-latch'
    || runtime.classifyMode === 'flying-frame-retain';
  for (const id of runtime.signaturesById.keys()) {
    const stillLive = pruneLikeIncremental
      ? !!(state.entities && typeof state.entities.get === 'function'
        && state.entities.get(id) && state.entities.get(id).alive !== false)
      : runtime.currentEntityIds.has(id);
    if (stillLive) continue;
    runtime.signaturesById.delete(id);
    runtime.reasonsById.delete(id);
    runtime.pinBuffersById.delete(id);
    runtime.signatureCacheById.delete(id);
    runtime.seenEntityIds.delete(id);
  }
  counts.physics = statics.length + dynamics.length;
  runtime.lastLiveCount = (state.entityList || []).length;
  const priorStatics = runtime._staticEntities;
  let staticMembershipChanged = runtime._staticMembershipDirty
    || priorStatics.length !== statics.length;
  for (let i = 0; !staticMembershipChanged && i < statics.length; i++) {
    if (priorStatics[i] !== statics[i]) staticMembershipChanged = true;
  }
  const staticAuthorityVersion = entityIndexPhysicsStaticVersion(state);
  if (staticMembershipChanged || staticAuthorityVersion !== runtime._staticAuthorityVersion) {
    runtime.physicsStaticVersion++;
    priorStatics.length = statics.length;
    for (let i = 0; i < statics.length; i++) priorStatics[i] = statics[i];
    runtime._staticAuthorityVersion = staticAuthorityVersion;
    runtime._staticMembershipDirty = false;
  }
  // Dynamics get the same membership-version treatment: the classify pass rebuilds the lane
  // each run, but the layered hash's stale-member sweep only needs to fire when the member
  // set actually changed. Identity order can shuffle without membership changing — a reorder
  // over-bumps, which only costs a sweep, never correctness.
  const priorDynamics = runtime._dynamicEntities;
  let dynamicMembershipChanged = priorDynamics.length !== dynamics.length;
  for (let i = 0; !dynamicMembershipChanged && i < dynamics.length; i++) {
    if (priorDynamics[i] !== dynamics[i]) dynamicMembershipChanged = true;
  }
  if (dynamicMembershipChanged) {
    runtime.physicsDynamicsVersion++;
    priorDynamics.length = dynamics.length;
    for (let i = 0; i < dynamics.length; i++) priorDynamics[i] = dynamics[i];
  }

}

/**
 * Classify the live world if this tick has not already done so.
 * Returns the scratch runtime (entity arrays are not saved).
 */
export function ensureActivityClassified(state) {
  if (!state || typeof state !== 'object') return null;
  const runtime = ensureRuntime(state);
  const tick = state.tick | 0;
  // Sanctioned membership moves through the entity index: spawnEntity/removeEntityIndex bump
  // `version` immediately, so a mid-tick spawn must be admitted to this same tick's owner views —
  // SG-06 samples a roster factionPresence just populated, and the SG-02 owner must step
  // projectiles weapons fired this tick (both run after their spawners in update order). Raw
  // entityList edits are not sanctioned membership; without an index there is no cheap change
  // signal, so the frame is never cached and every caller classifies fresh.
  const membership = entityIndexVersion(state);
  const staticAuthority = entityIndexPhysicsStaticVersion(state);
  const list = state.entityList || [];
  const sameRawList = membership == null && runtime.lastEntityList === list && runtime.lastLiveCount === list.length;
  if ((membership != null || sameRawList) && runtime.ready && runtime.classifiedTick === tick
    && (membership == null || runtime.classifiedMembership === membership)
    && runtime.classifiedStaticAuthority === staticAuthority) {
    return runtime;
  }
  if (admitSameTickProjectiles(state, runtime, membership)) {
    runtime.classifiedTick = tick;
    runtime.classifiedStaticAuthority = staticAuthority;
    runtime.ready = true;
    publishScalars(state, runtime);
    return runtime;
  }
  classifyWorld(state, runtime);
  runtime.classifiedTick = tick;
  runtime.classifiedMembership = membership;
  runtime.classifiedStaticAuthority = staticAuthority;
  runtime.lastEntityList = list;
  runtime.lastLiveCount = list.length;
  runtime.ready = true;
  publishScalars(state, runtime);
  return runtime;
}

function entityIndexVersion(state) {
  const index = state && state.entityIndex;
  return index && index.__spacefaceEntityIndexV1 && Number.isFinite(index.version)
    ? index.version
    : null;
}

function entityIndexPhysicsStaticVersion(state) {
  const index = state && state.entityIndex;
  return index && index.__spacefaceEntityIndexV1 && Number.isFinite(index.physicsStaticVersion)
    ? index.physicsStaticVersion
    : null;
}

/**
 * Force one deterministic static-version bump after an in-place entity rebuild (save/load
 * respawn). A respawn may keep entity ids and counts stable, so exact object membership must be
 * compared again before the layered physics sync can trust its retained static records.
 */
export function resetActivityRuntimeForRestore(state) {
  if (!state || typeof state !== 'object') return false;
  const runtime = RUNTIMES.get(state);
  if (!runtime) return false;
  runtime.ready = false;
  runtime.classifiedTick = -1;
  runtime.classifiedStaticAuthority = null;
  runtime._staticMembershipDirty = true;
  if (runtime._dynamicEntities) runtime._dynamicEntities.length = 0;
  return true;
}

/**
 * Return the live owner view for this tick. These arrays are scratch-owned by the activity pass;
 * callers must consume them synchronously and never persist or mutate the array itself.
 */
export function getActivityOwnerEntities(state, owner = 'ai') {
  const runtime = ensureActivityClassified(state);
  if (!runtime) return [];
  consumeActivityWakesAtOwnerBoundary(state, runtime);
  return owner === 'traffic' ? runtime.activeTrafficEntities : runtime.activeAiEntities;
}

function setDueLiveWake(entity, simTime, nextEventAtT) {
  if (!entity) return;
  const next = Number.isFinite(nextEventAtT) && nextEventAtT > simTime ? nextEventAtT : null;
  const activity = entity.activity;
  if (activity && dueAt(activity.nextEventAtT, simTime) != null) {
    activity.nextEventAtT = next == null ? -1 : next;
  }
  const data = entity.data;
  if (data && dueAt(data.nextEventAtT, simTime) != null) data.nextEventAtT = next;
  const ai = ownerAiRecord(entity);
  if (ai && dueAt(ai.nextEventAtT, simTime) != null) ai.nextEventAtT = next;
  const aiActivity = ai && ai.activity && typeof ai.activity === 'object' ? ai.activity : null;
  if (aiActivity && dueAt(aiActivity.nextEventAtT, simTime) != null) {
    aiActivity.nextEventAtT = next == null ? -1 : next;
  }
}

/**
 * Resolve and acknowledge all due world wakes exactly once at the first owner boundary of a
 * classified tick. Classification only admits the due edge; this operation owns mutation so a
 * live-only wake and its durable record cannot remain level-triggered on the next tick.
 */
function consumeActivityWakesAtOwnerBoundary(state, runtime) {
  const tick = state.tick | 0;
  if (runtime.wakeBoundaryTick === tick) return runtime.wakeEventsById;
  runtime.wakeBoundaryTick = tick;
  const simTime = Number.isFinite(state.simTime) ? state.simTime : tick / 60;
  const bag = state.world && state.world.records && state.world.records.byId;
  for (let i = 0; i < runtime.wakeCandidates.length; i++) {
    const entity = runtime.wakeCandidates[i];
    if (!entity || entity.alive === false) continue;
    const data = entity.data || {};
    const recId = data.worldRecordId;
    const durable = recId && bag ? bag[recId] : null;
    const durableDue = durableWakeDue(durable, simTime);
    const liveDue = liveWakeDue(entity, simTime);
    if (!durableDue && liveDue == null) continue;
    const source = durableDue
      ? durable
      : {
        nextEventAtT: liveDue,
        scheduledEventIds: Array.isArray(data.scheduledEventIds) ? data.scheduledEventIds : [],
        resultSeed: Number.isFinite(data.resultSeed) ? data.resultSeed : 0,
      };
    const consumed = consumeScheduledWorldWake(source, simTime, {
      event: wakeEventForEntity(entity),
    });
    if (!consumed.consumed) continue;
    const nextEventAtT = consumed.record && Number.isFinite(consumed.record.nextEventAtT)
      ? consumed.record.nextEventAtT
      : null;
    if (durableDue && durable) Object.assign(durable, consumed.record);
    setDueLiveWake(entity, simTime, nextEventAtT);
    runtime.wakeTokensById.set(entity.id, tick);
    runtime.wakeEventsById.set(entity.id, {
      entityId: entity.id,
      event: consumed.event,
      nextEventAtT,
      source: durableDue ? 'durable' : 'live',
    });
  }
  return runtime.wakeEventsById;
}

/** Return the resolved wake events for this owner tick; the map is runtime-owned and stable. */
export function getActivityWakeEvents(state) {
  const runtime = ensureActivityClassified(state);
  if (!runtime) return new Map();
  return consumeActivityWakesAtOwnerBoundary(state, runtime);
}

/**
 * Actors that crossed from exact/near into an inactive tier during this pass. Transition owners
 * get one fail-closed cleanup opportunity (for example clearing a stale fire intent) without
 * forcing every inactive entity back through an owner scan each fixed step.
 */
export function getActivityTransitionEntities(state) {
  const runtime = ensureActivityClassified(state);
  return runtime ? runtime.activityTransitionAiEntities : [];
}

/** One-shot admission for an initially inactive actor carrying an offensive intent. */
export function getActivityInitialInactiveEntities(state) {
  const runtime = ensureActivityClassified(state);
  return runtime ? runtime.initialInactiveAiEntities : [];
}

export function entityNeedsPhysics(entity) {
  if (!entity || entity.alive === false) return false;
  if (entity.type === 'projectile') return true;
  if (entity.type === 'station') return true;
  const activity = entity.activity;
  if (!activity || !activity.simTier) return true;
  if (activity.pinnedExact) return true;
  return isExactTier(activity.simTier);
}

/**
 * Cached classify physics partition: 0 = skip, 1 = static sync, 2 = dynamic sync.
 * Mirrors entityNeedsPhysics + shouldSyncPhysicsBodyEntity + isDynamicPhysicsBodyEntity
 * (projectile forced dynamic). Quiet revisits read the byte; applyStamp refreshes on
 * simTier / pinnedExact flips.
 *
 * Partition flips take an entity in or out of the spatial-hash physics layers — a
 * consumer caching "members the hash cannot see" (the travel-infrastructure
 * uncovered set) latches on this epoch rather than walking entityList every call.
 */
let PHYSICS_PARTITION_EPOCH = 0;
export function physicsPartitionEpoch() { return PHYSICS_PARTITION_EPOCH; }

export function refreshPhysicsPartition(entity) {
  const before = entity && entity._physicsPartition;
  if (!entity || entity.alive === false) {
    if (entity) {
      entity._physicsPartition = 0;
      if (before === 1 || before === 2) PHYSICS_PARTITION_EPOCH += 1;
    }
    return 0;
  }
  if (!entityNeedsPhysics(entity) || !shouldSyncPhysicsBodyEntity(entity)) {
    entity._physicsPartition = 0;
    if (before === 1 || before === 2) PHYSICS_PARTITION_EPOCH += 1;
    return 0;
  }
  const kind = (isDynamicPhysicsBodyEntity(entity) || entity.type === 'projectile') ? 2 : 1;
  entity._physicsPartition = kind;
  if (kind !== before) PHYSICS_PARTITION_EPOCH += 1;
  return kind;
}

/**
 * Exact/near craft keep the 60 Hz flight integrator. Abstract/dormant/aggregate craft are
 * owned by catch-up / scheduled wakes — continuous drag on a shelved actor fights that
 * authority and burns registry.step on the settled long-tail. A live intent on a wake edge
 * still steps once so the command is consumed.
 */
export function entityNeedsFlightStep(entity) {
  if (!entity || entity.alive === false) return false;
  const activity = entity.activity;
  if (!activity || !activity.simTier) return true;
  if (activity.pinnedExact) return true;
  if (isExactTier(activity.simTier)) return true;
  const intent = entity.data && entity.data.intent;
  return !!(intent && typeof intent === 'object');
}

export function entityNeedsAiThink(entity, state = null) {
  if (!entity || entity.alive === false) return false;
  const runtime = state && RUNTIMES.get(state);
  if (runtime && runtime.wakeTokensById.get(entity.id) === (state.tick | 0)) return true;
  const activity = entity.activity;
  if (!activity || !activity.simTier) return true;
  if (activity.pinnedExact) return true;
  const tier = activity.simTier;
  if (tier === SIM_TIER.S0_EXACT) return true;
  if (tier === SIM_TIER.S1_NEAR) {
    if (!hasNearWorkSlot(state, entity)) return false;
    const tick = state && Number.isInteger(state.tick) ? state.tick : 0;
    return shouldOwnerThink(tick, entity, {
      nearPeriodTicks: 2,
      playerId: state && state.playerId,
    });
  }
  if (tier === SIM_TIER.S2_ABSTRACT || tier === SIM_TIER.S3_DORMANT || tier === SIM_TIER.S4_AGGREGATE) {
    const due = Number(activity.nextEventAtT);
    const simTime = state && Number.isFinite(state.simTime) ? state.simTime : -1;
    return Number.isFinite(due) && due >= 0 && simTime >= due;
  }
  return isExactTier(tier);
}
