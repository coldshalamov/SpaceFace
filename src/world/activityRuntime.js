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
  PHYSICS_SAFETY_PAD_WU,
  PRESENTATION_TIER,
  SIM_TIER,
  classifyActivity,
  physicsReachWu,
} from './activityClassification.js';
import { shouldOwnerThink } from '../core/activityScheduler.js';
import { ballisticDrift, consumeScheduledWorldWake } from './worldCatchup.js';
import {
  captureEntityRecord,
  ensureWorldRecords,
  entityIsDurableCandidate,
  upsertRecord,
} from './worldRecords.js';

const RUNTIMES = new WeakMap();
const RECENT_DAMAGE_TICKS = 120;
const DAMAGE_PIN_S = 2;

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

function mixId(id) {
  if (typeof id === 'number' && Number.isFinite(id)) return id | 0;
  const text = String(id == null ? '' : id);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
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
      ready: false,
      physicsReachWu: 0,
      glassHalfX: 0,
      glassHalfZ: 0,
      runwayHalfX: 0,
      runwayHalfZ: 0,
      physicsStatics: [],
      physicsDynamics: [],
      physicsStaticVersion: 0,
      _staticHash: 0,
      _staticCount: 0,
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
      glassIds: [],
      runwayIds: [],
      counts: { s0: 0, s1: 0, s2: 0, s3: 0, s4: 0, physics: 0, r0: 0, r1: 0, r2: 0, r3: 0 },
      pinFacts: emptyPinFacts(),
      contextScratch: {},
      published: null,
      publishedCounts: null,
      reasonsById: new Map(),
      changedIds: [],
      signaturesById: new Map(),
      pinBuffersById: new Map(),
      currentEntityIds: new Set(),
      frame: null,
      seenEntityIds: new Set(),
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
  published.glassCount = runtime.glassIds.length;
  published.runwayCount = runtime.runwayIds.length;
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

function imminentCollisionFor(state, player, entity) {
  if (!player || !entity || entity.id === player.id || !player.pos || !entity.pos) return false;
  const ids = authoritativeCollisionIds(state);
  if (ids && (typeof ids.has === 'function' ? ids.has(entity.id) : Array.isArray(ids) && ids.includes(entity.id))) {
    return true;
  }
  const rvx = finite(entity.vel && entity.vel.x) - finite(player.vel && player.vel.x);
  const rvz = finite(entity.vel && entity.vel.z) - finite(player.vel && player.vel.z);
  const rpx = finite(entity.pos.x) - finite(player.pos.x);
  const rpz = finite(entity.pos.z) - finite(player.pos.z);
  const radius = Math.max(0, finite(entity.radius)) + Math.max(0, finite(player.radius));
  const c = rpx * rpx + rpz * rpz - radius * radius;
  if (c <= 0) return true;
  const a = rvx * rvx + rvz * rvz;
  if (!(a > 1e-8)) return false;
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
  return stable;
}

function activitySignature(stamp) {
  return `${stamp.simTier}|${stamp.presentationTier}|${stamp.nextEventAtT}|${stamp.pinnedExact ? 1 : 0}|${stamp.pins.join(',')}`;
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
    return rec;
  }
  const prior = rec.simTier;
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
  return rec;
}

function rebuildPinFacts(state, player, facts, simTime) {
  facts.targetId = null;
  facts.miningId = null;
  facts.dockId = null;
  facts.hailId = null;
  facts.tether.clear();
  facts.aggro.clear();
  facts.projectileThreat.clear();
  facts.tracked.clear();
  facts.damagedByPlayerUntil.clear();
  facts.damagedPlayerUntil.clear();

  const playerId = player && player.id;
  // SG-06: this pass is reachable from the AI production ports and may not read the player
  // meta record (`state.player`) — that record couples a reader to credits/heat/cargo data it
  // was denied. Player-intent pins therefore arrive only through entity-carried state the pass
  // already owns: the combat-owned target id and weapons-owned missile lock on the player craft.
  // UI selection and the mining lock have no sanctioned source here yet; until UI and mining
  // publish those pins outside the meta record, `facts.miningId` stays null (the
  // PLAYER_MINING_TARGET pin plumbing remains ready for that publication).
  const playerCombat = player && player.data && player.data.combat;
  if (playerCombat && playerCombat.targetId != null) facts.targetId = playerCombat.targetId;
  else if (playerCombat && playerCombat.lockTarget != null) facts.targetId = playerCombat.lockTarget;

  // Scanner owns the durable tracked contact. Resolve its stable signal record back to the live
  // entity id without asking the HUD or a render list to decide residency. Explicit live scanner
  // marks are accepted as the same authoritative seam for older saves/fixtures.
  const signalState = state && state.signalInvestigation;
  const trackedId = signalState && signalState.trackedId;
  const trackedRecord = trackedId && signalState.records && signalState.records[trackedId];
  if (trackedRecord) {
    if (trackedRecord.entityId != null) facts.tracked.add(trackedRecord.entityId);
    if (trackedRecord.sourceId != null) facts.tracked.add(trackedRecord.sourceId);
  }

  const attachments = state && state.combat && state.combat.attachments && state.combat.attachments.byId;
  if (attachments && typeof attachments === 'object') {
    for (const key of Object.keys(attachments)) {
      const att = attachments[key];
      if (!att || att.state === 'cut' || att.state === 'dead') continue;
      if (att.ownerId != null) facts.tether.add(att.ownerId);
      if (att.targetId != null) facts.tether.add(att.targetId);
    }
  }

  const dockId = player && (
    (player.data && (player.data.dockStationId || player.data.dockTargetId))
    || (player.flags && player.flags.dockStationId)
  );
  if (dockId != null) facts.dockId = dockId;

  const hail = state && (state.comms && (state.comms.hailTargetId || state.comms.targetId)
    || state.ui && state.ui.hailTargetId);
  if (hail != null) facts.hailId = hail;

  const index = state && state.entityIndex;
  const ships = index && Array.isArray(index.aiShips) ? index.aiShips : null;
  const scan = ships || (state && state.entityList) || [];
  for (let i = 0; i < scan.length; i++) {
    const e = scan[i];
    if (!e || e.alive === false) continue;
    const data = e.data || {};
    if (data.tracked === true || data.scannerTracked === true
      || (data.scanStatus === 'tracked' && data.scanned === true)) {
      facts.tracked.add(e.id);
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
      facts.aggro.add(e.id);
    }
  }
  if (facts.targetId != null) facts.aggro.add(facts.targetId);

  const projectiles = index && Array.isArray(index.projectiles)
    ? index.projectiles
    : (state && state.entityList) || [];
  for (let i = 0; i < projectiles.length; i++) {
    const p = projectiles[i];
    if (!p || p.alive === false || p.type !== 'projectile') continue;
    const data = p.data || {};
    const tid = data.targetId;
    if (tid != null) facts.projectileThreat.add(tid);
    if (playerId != null && (data.ownerId === playerId || p.ownerId === playerId) && tid != null) {
      facts.aggro.add(tid);
    }
  }

  const events = state && state.combat && state.combat.trace && Array.isArray(state.combat.trace.events)
    ? state.combat.trace.events
    : null;
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
  if (stamp.presentationTier === PRESENTATION_TIER.R0_GLASS) runtime.glassIds.push(id);
  else if (stamp.presentationTier === PRESENTATION_TIER.R1_RUNWAY) runtime.runwayIds.push(id);
}

function classifyWorld(state, runtime) {
  const list = state.entityList || [];
  const player = state.playerId != null && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  const origin = player && player.pos ? player.pos : { x: 0, z: 0 };
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

  const statics = runtime.physicsStatics;
  const dynamics = runtime.physicsDynamics;
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
  runtime.glassIds.length = 0;
  runtime.runwayIds.length = 0;
  const counts = runtime.counts;
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

  let staticHash = 0;
  let staticCount = 0;

  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!entity || entity.alive === false) continue;
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
    const data = entity.data || {};
    const ai = ownerAiRecord(entity);
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
    const bag = state.world && state.world.records && state.world.records.byId;
    const worldRec = recId && bag ? bag[recId] : null;
    const scheduledWakeDue = durableWakeDue(worldRec, simTime)
      || liveWakeDue(entity, simTime) != null;
    if (scheduledWakeDue) runtime.wakeCandidates.push(entity);
    ctx.hasItinerary = !!data.itinerary || scheduledWakeDue;
    ctx.priorSimTier = entity.activity && entity.activity.simTier;
    ctx.graceUntilT = entity.activity && entity.activity.graceUntilT;
    const authoredPresence = data.factionPresence
      && data.factionPresence.source === 'depth-program-k1';
    const authoredActiveCombat = authoredPresence && ai && ai.passive === false
      && (ai.combatant === true || ai.engagementTrigger != null
        || (ai.activity && ai.activity.kind === 'attack_run'));
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
      // K1 authored active presence is a named, durable combat actor even when its global sector
      // coordinates place it beyond the current player's ordinary activity bubble. Preserve it in
      // the exact owner view; generic far passive traffic remains wake-gated below.
      || authoredActiveCombat);
    ctx.imminentCollision = imminentCollisionFor(state, player, entity);
    ctx.aggregateOnly = entity.type === 'ship'
      && !onGlass
      && !onRunway
      && !data.itinerary
      && !data.named
      && !(ai && ai.combatant === true)
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
    const signature = activitySignature(stamp);
    if (runtime.signaturesById.get(entity.id) !== signature) {
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

    if (!entityNeedsPhysics(entity)) continue;
    if (!shouldSyncPhysicsBodyEntity(entity)) continue;
    if (isDynamicPhysicsBodyEntity(entity) || entity.type === 'projectile') {
      dynamics.push(entity);
    } else {
      statics.push(entity);
      staticHash = (staticHash ^ mixId(entity.id)) >>> 0;
      staticCount++;
    }
  }

  for (const id of runtime.signaturesById.keys()) {
    if (runtime.currentEntityIds.has(id)) continue;
    runtime.signaturesById.delete(id);
    runtime.reasonsById.delete(id);
    runtime.pinBuffersById.delete(id);
    runtime.seenEntityIds.delete(id);
  }
  counts.physics = statics.length + dynamics.length;
  if (staticHash !== runtime._staticHash || staticCount !== runtime._staticCount) {
    runtime.physicsStaticVersion++;
    runtime._staticHash = staticHash;
    runtime._staticCount = staticCount;
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
  if (membership != null && runtime.ready && runtime.classifiedTick === tick
    && runtime.classifiedMembership === membership) {
    return runtime;
  }
  classifyWorld(state, runtime);
  runtime.classifiedTick = tick;
  runtime.classifiedMembership = membership;
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

/**
 * Force one deterministic static-version bump after an in-place entity rebuild (save/load
 * respawn). A respawn keeps entity ids and counts stable, so the staticHash gate alone would
 * never move physicsStaticVersion and the layered physics sync would keep trusting records
 * bound to the retired (alive=false) objects. Poisoning the comparison makes the next
 * classification bump exactly once; ordinary ticks never call this.
 */
export function resetActivityRuntimeForRestore(state) {
  if (!state || typeof state !== 'object') return false;
  const runtime = RUNTIMES.get(state);
  if (!runtime) return false;
  runtime.ready = false;
  runtime.classifiedTick = -1;
  runtime._staticHash = null;
  runtime._staticCount = -1;
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
