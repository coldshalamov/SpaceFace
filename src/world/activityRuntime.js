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
import {
  applyAbstractCatchupToEntities,
  ensureSimWorker,
} from '../core/simWorkerHost.js';
import { ballisticDrift } from './worldCatchup.js';
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
      glassIds: [],
      runwayIds: [],
      counts: { s0: 0, s1: 0, s2: 0, s3: 0, s4: 0, physics: 0, r0: 0, r1: 0, r2: 0, r3: 0 },
      pinFacts: emptyPinFacts(),
      contextScratch: {},
    };
    RUNTIMES.set(state, runtime);
  }
  return runtime;
}

function publishScalars(state, runtime) {
  const counts = runtime.counts;
  state.activityRuntime = {
    classifiedTick: runtime.classifiedTick,
    physicsReachWu: runtime.physicsReachWu,
    physicsStaticVersion: runtime.physicsStaticVersion,
    physicsStaticCount: runtime.physicsStatics.length,
    physicsDynamicCount: runtime.physicsDynamics.length,
    counts: {
      s0: counts.s0,
      s1: counts.s1,
      s2: counts.s2,
      s3: counts.s3,
      s4: counts.s4,
      physics: counts.physics,
      r0: counts.r0,
      r1: counts.r1,
      r2: counts.r2,
      r3: counts.r3,
    },
    glassCount: runtime.glassIds.length,
    runwayCount: runtime.runwayIds.length,
    exactCount: runtime.exactIds.length,
    aggregatePopulation: counts.s4,
  };
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
  const playerCombat = player && player.data && player.data.combat;
  const selected = state && state.player && state.player.targetId;
  if (selected != null) facts.targetId = selected;
  if (playerCombat && playerCombat.targetId != null) facts.targetId = playerCombat.targetId;
  else if (playerCombat && playerCombat.lockTarget != null && facts.targetId == null) {
    facts.targetId = playerCombat.lockTarget;
  }
  if (state && state.player) {
    if (state.player.miningTargetId != null) facts.miningId = state.player.miningTargetId;
    else if (state.player.beamTargetId != null) facts.miningId = state.player.beamTargetId;
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
    if (!e || e.alive === false || !e.data) continue;
    const combat = e.data.combat || {};
    const ai = e.data.ai || {};
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
    ctx.escortOrFollow = !!(data.escort || (data.ai && (data.ai.escort || data.ai.follow)));
    ctx.hailOrConversation = facts.hailId != null && entity.id === facts.hailId;
    ctx.playerMiningTarget = facts.miningId != null && entity.id === facts.miningId;
    ctx.playerScannedAndTracked = facts.tracked.has(entity.id);
    ctx.damagedByPlayerUntilT = facts.damagedByPlayerUntil.has(entity.id)
      ? facts.damagedByPlayerUntil.get(entity.id)
      : -1;
    ctx.damagedPlayerUntilT = facts.damagedPlayerUntil.has(entity.id)
      ? facts.damagedPlayerUntil.get(entity.id)
      : -1;
    ctx.hasItinerary = !!data.itinerary;
    const recId = data.worldRecordId;
    const bag = state.world && state.world.records && state.world.records.byId;
    const worldRec = recId && bag ? bag[recId] : null;
    if (worldRec && Number.isFinite(worldRec.nextEventAtT) && worldRec.nextEventAtT >= 0
      && simTime >= worldRec.nextEventAtT) {
      ctx.hasItinerary = true;
    }
    ctx.priorSimTier = entity.activity && entity.activity.simTier;
    ctx.graceUntilT = entity.activity && entity.activity.graceUntilT;
    ctx.missionCritical = !!(data.jobId || data.missionId || data.missionTag || data.missionPinned
      || data.activityActorSlotId
      || (typeof data.activityObjectSlotId === 'string' && /[a-z]/i.test(data.activityObjectSlotId))
      || (entity.flags && entity.flags.missionPinned));
    ctx.imminentCollision = false;
    ctx.aggregateOnly = entity.type === 'ship'
      && !onGlass
      && !onRunway
      && !data.itinerary
      && !data.named
      && !(data.ai && data.ai.combatant === true)
      && !ctx.missionCritical;
    ctx.dormant = false;

    const classified = classifyActivity(entity, ctx);
    const priorTier = entity.activity && entity.activity.simTier;
    const stamp = applyStamp(entity, classified, simTime);
    if (worldRec && Number.isFinite(worldRec.nextEventAtT)) {
      stamp.nextEventAtT = worldRec.nextEventAtT;
    }
    if (isExactTier(priorTier) && !isExactTier(stamp.simTier)) {
      captureDematerialized(state, entity, simTime, stamp.simTier);
    }
    countTier(counts, stamp.simTier);
    countPresentation(counts, stamp.presentationTier);
    pushActivityIds(runtime, entity, stamp);

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

  counts.physics = statics.length + dynamics.length;
  if (staticHash !== runtime._staticHash || staticCount !== runtime._staticCount) {
    runtime.physicsStaticVersion++;
    runtime._staticHash = staticHash;
    runtime._staticCount = staticCount;
  }

  const worker = ensureSimWorker(state);
  if (worker) {
    const prior = worker.takeResults();
    if (prior && prior.length) applyAbstractCatchupToEntities(state, prior);
    const abstracts = [];
    for (let i = 0; i < runtime.abstractIds.length; i++) {
      const entity = state.entities && state.entities.get && state.entities.get(runtime.abstractIds[i]);
      if (!entity || !entity.pos) continue;
      abstracts.push({
        id: entity.id,
        pos: { x: entity.pos.x, z: entity.pos.z },
        vel: entity.vel ? { x: entity.vel.x || 0, z: entity.vel.z || 0 } : { x: 0, z: 0 },
        rot: entity.rot || 0,
        angVel: entity.angVel || 0,
        lastExactT: entity.activity && entity.activity.lastExactT,
        alive: entity.alive !== false,
      });
    }
    const fromT = simTime - 1 / 60;
    const immediate = worker.submitAbstract(abstracts, fromT, simTime);
    if (immediate && immediate.length) applyAbstractCatchupToEntities(state, immediate);
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
  if (runtime.classifiedTick === tick && runtime.ready) return runtime;
  classifyWorld(state, runtime);
  runtime.classifiedTick = tick;
  runtime.ready = true;
  publishScalars(state, runtime);
  return runtime;
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
