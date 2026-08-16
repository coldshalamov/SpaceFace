// Selective point-defense projectile interception.
//
// This is deliberately not a projectile-v-projectile collision mode. A projectile is eligible for
// this sweep only when the weapons owner bound it to one exact hostile ordnance id at launch. The
// physics owner resolves that one moving/moving contact and ordinary projectiles remain mutually
// non-colliding.

export const PD_INTERCEPT_SCHEMA_VERSION = 1;
export const PD_INTERCEPT_WEAPON_ID = 'wpn_flak_turret_s';
export const IRON_MAW_RECIPE_ID = 'capital_parts_iron_maw_v1';
export const PD_INTERCEPT_MAX_CHARGES = 2;
export const PD_INTERCEPT_RECOVERY_TICKS = 45;
export const PD_INTERCEPT_CONTACT_RADIUS = 4;

export function isInterceptableOrdnance(entity) {
  if (!entity || entity.alive === false || entity.type !== 'projectile') return false;
  const data = entity.data || {};
  return data.kind === 'missile'
    && data.armed !== false
    && !data.pdIntercept
    && data.pdIntercepted !== true;
}

export function isPdInterceptorProjectile(entity) {
  const binding = entity && entity.data && entity.data.pdIntercept;
  return !!(entity && entity.alive !== false && entity.type === 'projectile'
    && binding && binding.schemaVersion === PD_INTERCEPT_SCHEMA_VERSION
    && binding.incomingId != null);
}

export function isIronMawPdActor(entity) {
  return !!(entity && entity.data && entity.data.heavyPartRecipeId === IRON_MAW_RECIPE_ID);
}

export function isDedicatedPdActor(entity) {
  if (!entity) return false;
  if (entity.pdScreen === true) return true;
  const data = entity.data || {};
  if (data.pdScreen === true) return true;
  const role = String(data.lootTableId || data.enemyTypeId || data.role || entity.lootTableId || entity.role || '');
  return role === 'pd_screen_escort' || (Array.isArray(data.tags) && data.tags.includes('pd_screen'));
}

export function isPdDefenseActor(entity) {
  return isDedicatedPdActor(entity) || isIronMawPdActor(entity);
}

export function liveIronMawPdMounts(entity, state) {
  if (!isIronMawPdActor(entity)) return [];
  const runtime = entity.data && entity.data.heavyPartsRuntime;
  if (!runtime || !Array.isArray(runtime.parts)) return [];
  const entities = state && state.entities;
  return runtime.parts
    .filter((record) => record && !record.destroyed
      && record.binding && record.binding.kind === 'weapon'
      && record.binding.weaponId === PD_INTERCEPT_WEAPON_ID)
    .filter((record) => {
      const part = entities && typeof entities.get === 'function' ? entities.get(record.entityId) : null;
      return !!(part && part.alive !== false && part.data && part.data.heavyPartState === 'mounted');
    })
    .sort((a, b) => stableId(a.partId).localeCompare(stableId(b.partId)));
}

/**
 * Resolve the physical source which authorizes one PD shot. Dedicated escorts use their hull;
 * Iron Maw must use the exact surviving mounted heavyPart bound to this weapon instance.
 */
export function resolvePdShotSource(shooter, weapon, state) {
  if (!shooter || !weapon) return null;
  if (!isIronMawPdActor(shooter)) {
    if (!isDedicatedPdActor(shooter)) return null;
    return {
      sourceId: shooter.id,
      sourcePartId: null,
      liveCapacity: 2,
      saturationModel: 'two_intercept_recovery',
    };
  }
  const records = liveIronMawPdMounts(shooter, state);
  const record = records.find((row) => row.partId === weapon.heavyPartId);
  if (!record) return null;
  return {
    sourceId: record.entityId,
    sourcePartId: record.partId,
    liveCapacity: records.length,
    saturationModel: 'surviving_pd_mounts',
  };
}

export function bindPdInterceptorProjectile(projectile, descriptor) {
  if (!projectile || !descriptor || descriptor.incomingId == null) return false;
  const defenderId = descriptor.defenderId == null ? null : descriptor.defenderId;
  projectile.data = projectile.data || {};
  projectile.data.pdIntercept = Object.freeze({
    schemaVersion: PD_INTERCEPT_SCHEMA_VERSION,
    defenderId,
    sourceId: descriptor.sourceId,
    sourcePartId: descriptor.sourcePartId == null ? null : descriptor.sourcePartId,
    shooterId: descriptor.shooterId,
    interceptorId: projectile.id,
    incomingId: descriptor.incomingId,
    contactRadius: Math.max(
      Number(projectile.radius) || 0,
      Number(descriptor.contactRadius) || PD_INTERCEPT_CONTACT_RADIUS,
    ),
    assignedTick: Math.max(0, Math.trunc(Number(descriptor.assignedTick) || 0)),
  });
  return true;
}

export function ensurePdInterceptionRuntime(entity) {
  const data = entity.data || (entity.data = {});
  const runtime = data.pdScreenRuntime || (data.pdScreenRuntime = {});
  if (!Number.isFinite(runtime.activeIntercepts)) runtime.activeIntercepts = 0;
  if (!Number.isFinite(runtime.lastReleaseTick)) runtime.lastReleaseTick = -Infinity;
  if (!Number.isFinite(runtime.maxIntercepts)) runtime.maxIntercepts = PD_INTERCEPT_MAX_CHARGES;
  if (!Number.isFinite(runtime.recoveryTicks)) runtime.recoveryTicks = PD_INTERCEPT_RECOVERY_TICKS;
  if (!runtime.saturationModel) runtime.saturationModel = 'two_intercept_recovery';
  if (runtime.pendingIncomingId === undefined) runtime.pendingIncomingId = null;
  if (runtime.pendingInterceptorId === undefined) runtime.pendingInterceptorId = null;
  return runtime;
}

export function recoverPdInterceptionRuntime(runtime, tick) {
  if (!runtime || !(runtime.activeIntercepts > 0)) return runtime;
  const recovery = Number.isFinite(runtime.recoveryTicks)
    ? runtime.recoveryTicks : PD_INTERCEPT_RECOVERY_TICKS;
  const last = Number.isFinite(runtime.lastReleaseTick) ? runtime.lastReleaseTick : -Infinity;
  if (!Number.isInteger(tick) || tick - last < recovery) return runtime;
  const steps = Math.floor((tick - last) / recovery);
  runtime.activeIntercepts = Math.max(0, runtime.activeIntercepts - steps);
  runtime.lastReleaseTick = last + steps * recovery;
  return runtime;
}

export function pdInterceptionAvailable(runtime, tick) {
  if (!runtime) return true;
  recoverPdInterceptionRuntime(runtime, tick);
  const max = Number.isFinite(runtime.maxIntercepts)
    ? Math.max(0, runtime.maxIntercepts) : PD_INTERCEPT_MAX_CHARGES;
  return runtime.activeIntercepts < max;
}

export function claimPdInterceptionAssignment(entity, incomingId, interceptorId, tick) {
  if (!entity || incomingId == null || interceptorId == null) return false;
  const runtime = ensurePdInterceptionRuntime(entity);
  if (runtime.pendingInterceptorId != null) return false;
  runtime.pendingIncomingId = incomingId;
  runtime.pendingInterceptorId = interceptorId;
  runtime.assignmentTick = Math.max(0, Math.trunc(Number(tick) || 0));
  return true;
}

export function clearStalePdInterceptionAssignment(entity, state) {
  if (!entity || !entity.data || !entity.data.pdScreenRuntime) return;
  const runtime = entity.data.pdScreenRuntime;
  if (runtime.pendingInterceptorId == null) return;
  const interceptor = state && state.entities && state.entities.get(runtime.pendingInterceptorId);
  const incoming = state && state.entities && state.entities.get(runtime.pendingIncomingId);
  if (interceptor && interceptor.alive !== false && incoming && incoming.alive !== false) return;
  runtime.pendingIncomingId = null;
  runtime.pendingInterceptorId = null;
}

/** The only saturation advance: a physics-owned contact receipt from the bound projectile pair. */
export function recordPdInterceptionOutcome(entity, receipt) {
  if (!entity || !receipt) return false;
  const runtime = ensurePdInterceptionRuntime(entity);
  if (runtime.lastReceiptInterceptorId === receipt.interceptorId) return false;
  runtime.activeIntercepts = Math.min(
    Math.max(0, Number(runtime.maxIntercepts) || PD_INTERCEPT_MAX_CHARGES),
    Math.max(0, Number(runtime.activeIntercepts) || 0) + 1,
  );
  runtime.lastReleaseTick = receipt.tick;
  runtime.lastReceiptInterceptorId = receipt.interceptorId;
  runtime.lastInterceptedIncomingId = receipt.incomingId;
  if (runtime.pendingInterceptorId === receipt.interceptorId) {
    runtime.pendingIncomingId = null;
    runtime.pendingInterceptorId = null;
  }
  return true;
}

/**
 * Moving-circle intersection in the relative frame. Both endpoints come from the authoritative
 * pre/post physics poses for this fixed tick. Returns the first contact in stable [0,1] time.
 */
export function sweptAssignedProjectileContact(interceptor, incoming, dt) {
  if (!isPdInterceptorProjectile(interceptor) || !isInterceptableOrdnance(incoming)) return null;
  if (interceptor.data.pdIntercept.incomingId !== incoming.id) return null;
  if (interceptor.team != null && incoming.team != null && interceptor.team === incoming.team) return null;

  const a0 = previousPosition(interceptor, dt);
  const b0 = previousPosition(incoming, dt);
  const rx = a0.x - b0.x;
  const rz = a0.z - b0.z;
  const rvx = (interceptor.pos.x - a0.x) - (incoming.pos.x - b0.x);
  const rvz = (interceptor.pos.z - a0.z) - (incoming.pos.z - b0.z);
  const radius = Math.max(
    0,
    Number(interceptor.data.pdIntercept.contactRadius) || Number(interceptor.radius) || 0,
  ) + Math.max(0, Number(incoming.radius) || 0);
  const radius2 = radius * radius;
  const c = rx * rx + rz * rz - radius2;
  let t = 0;
  if (c > 0) {
    const a = rvx * rvx + rvz * rvz;
    if (a <= 1e-12) return null;
    const b = 2 * (rx * rvx + rz * rvz);
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const root = Math.sqrt(disc);
    const first = (-b - root) / (2 * a);
    const second = (-b + root) / (2 * a);
    if (first >= 0 && first <= 1) t = first;
    else if (second >= 0 && second <= 1) t = second;
    else return null;
  }
  return {
    t,
    position: {
      x: a0.x + (interceptor.pos.x - a0.x) * t,
      z: a0.z + (interceptor.pos.z - a0.z) * t,
    },
  };
}

export function immutableProjectileInterceptReceipt(interceptor, incoming, contact, tick) {
  const binding = interceptor.data.pdIntercept;
  return Object.freeze({
    schemaVersion: PD_INTERCEPT_SCHEMA_VERSION,
    tick: Math.max(0, Math.trunc(Number(tick) || 0)),
    defenderId: binding.defenderId,
    sourceId: binding.sourceId,
    sourcePartId: binding.sourcePartId,
    shooterId: binding.shooterId,
    interceptorId: interceptor.id,
    incomingId: incoming.id,
    position: Object.freeze({
      x: Number(contact && contact.position && contact.position.x) || 0,
      z: Number(contact && contact.position && contact.position.z) || 0,
    }),
  });
}

function previousPosition(entity, dt) {
  if (entity.prevPos && Number.isFinite(entity.prevPos.x) && Number.isFinite(entity.prevPos.z)) {
    return entity.prevPos;
  }
  return {
    x: entity.pos.x - ((entity.vel && entity.vel.x) || 0) * dt,
    z: entity.pos.z - ((entity.vel && entity.vel.z) || 0) * dt,
  };
}

function stableId(value) {
  return `${typeof value}:${String(value)}`;
}
