// World-owned activity pass. Classifies every live entity once per tick, then
// names the Rapier/AI active set. Does not despawn, hide, or reroll identities.
// Visibility never equals death; pins and physics-reach decide fidelity.

import { isDynamicPhysicsBodyEntity, shouldSyncPhysicsBodyEntity } from '../core/physicsAuthority.js';
import {
  TABLE_REFERENCE_SPEED_WU,
  TABLE_SIM_ASPECT,
  glassHalfExtents,
  submitCullHalfExtents,
} from '../render/tabletopPolicy.js';
import {
  COLLISION_LOOKAHEAD_S,
  DEFAULT_GRACE_S,
  PHYSICS_SAFETY_PAD_WU,
  SIM_TIER,
  classifyActivity,
  physicsReachWu,
} from './activityClassification.js';
import { ballisticDrift } from './worldCatchup.js';

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
    finite(player && player.vel && Math.hypot(player.vel.x, player.vel.z)),
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
      counts: { s0: 0, s1: 0, s2: 0, s3: 0, s4: 0, physics: 0 },
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
    },
  };
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
      nowExact = true;
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
  if (state && state.player && state.player.miningTargetId != null) {
    facts.miningId = state.player.miningTargetId;
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
    const combat = e.data.combat;
    if (!combat) continue;
    if (playerId != null && (combat.targetId === playerId || combat.lockTarget === playerId)) {
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
  const reach = physicsReachWuFromState(state, player);
  const facts = runtime.pinFacts;
  rebuildPinFacts(state, player, facts, simTime);

  runtime.physicsReachWu = reach;
  runtime.glassHalfX = glass.halfX;
  runtime.glassHalfZ = glass.halfZ;
  runtime.runwayHalfX = submit.halfX;
  runtime.runwayHalfZ = submit.halfZ;

  const statics = runtime.physicsStatics;
  const dynamics = runtime.physicsDynamics;
  statics.length = 0;
  dynamics.length = 0;
  const counts = runtime.counts;
  counts.s0 = 0;
  counts.s1 = 0;
  counts.s2 = 0;
  counts.s3 = 0;
  counts.s4 = 0;
  counts.physics = 0;

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
    const onGlass = Math.abs(dx) <= glass.halfX && Math.abs(dz) <= glass.halfZ;
    const onRunway = Math.abs(dx) <= submit.halfX && Math.abs(dz) <= submit.halfZ;
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
    ctx.priorSimTier = entity.activity && entity.activity.simTier;
    ctx.graceUntilT = entity.activity && entity.activity.graceUntilT;
    ctx.missionCritical = !!(data.jobId || data.missionId || data.missionTag || data.missionPinned
      || (entity.flags && entity.flags.missionPinned));
    ctx.imminentCollision = false;
    ctx.aggregateOnly = false;
    ctx.dormant = false;

    const classified = classifyActivity(entity, ctx);
    const stamp = applyStamp(entity, classified, simTime);
    countTier(counts, stamp.simTier);

    if (!entityNeedsPhysics(entity)) continue;
    if (!shouldSyncPhysicsBodyEntity(entity)) continue;
    if (isDynamicPhysicsBodyEntity(entity) || entity.type === 'projectile') {
      dynamics.push(entity);
    } else {
      statics.push(entity);
      staticHash = (Math.imul(staticHash, 16777619) ^ mixId(entity.id)) >>> 0;
      staticCount++;
    }
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

export function entityNeedsAiThink(entity) {
  if (!entity || entity.alive === false) return false;
  const activity = entity.activity;
  if (!activity || !activity.simTier) return true;
  if (activity.pinnedExact) return true;
  return isExactTier(activity.simTier);
}
