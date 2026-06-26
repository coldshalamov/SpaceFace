import { createActionService } from './actions.js';
import { createAttachmentService } from './attachments.js';
import { createDamageRouter } from './damage.js';
import { createCombatCatalog, ensureCombatant, ensureCombatState, entityKey, removeCombatantRuntime, resolveCombatProfile, syncCombatantBounds } from './runtime.js';
import { createStatusService } from './statuses.js';
import { applyPendingSubsystemTransitions, recomputeCombatantModifiers, repairSubsystem } from './subsystems.js';
import { appendCombatTrace, canonicalize, readCombatTrace } from './trace.js';
import { assertValidCombatCatalog } from './validate.js';

const KERNELS = new WeakMap();

export function getCombatKernel(ctx, options = {}) {
  if (!ctx || !ctx.state) throw new TypeError('Combat kernel requires ctx.state');
  let kernel = KERNELS.get(ctx.state);
  if (!kernel) {
    kernel = createCombatKernel(ctx, options);
    KERNELS.set(ctx.state, kernel);
  } else if (typeof options.onKill === 'function') {
    kernel.setKillHandler(options.onKill);
  }
  return kernel;
}

export function createCombatKernel(ctx, options = {}) {
  const state = ctx.state;
  const bus = ctx.bus;
  const helpers = ctx.helpers || (ctx.helpers = {});
  const catalog = options.catalog || createCombatCatalog(options.catalogOverrides || {});
  assertValidCombatCatalog(catalog, options.validation || {});
  ensureCombatState(state);

  const hooks = { onKill: typeof options.onKill === 'function' ? options.onKill : null };
  const context = { state, bus, helpers, registry: ctx.registry || null, catalog, currentAttackerId: null };
  const attachments = createAttachmentService(context);
  const attachmentContext = { ...context, attachments };
  const statuses = createStatusService(context);
  const routeDamage = createDamageRouter(context, statuses, {
    onKill: (target, killerId) => {
      if (hooks.onKill) hooks.onKill(target, killerId);
      else {
        target.alive = false;
        if (bus) bus.emit('entity:killed', { id: target.id, killerId, type: target.type, pos: { x: target.pos.x, z: target.pos.z } });
      }
    },
  });
  const actions = createActionService(context, attachments, routeDamage);
  const subscriptions = [];
  let sortedCacheTick = -1;
  let sortedCacheRevision = 0;
  let sortedCacheSeenRevision = -1;
  let sortedCacheSource = null;
  let sortedCacheLength = -1;
  let sortedCache = null;

  for (const entity of sortedEntitiesForTick()) initializeEntity(entity);
  if (bus && typeof bus.on === 'function') {
    subscriptions.push(bus.on('entity:spawned', (payload) => {
      invalidateSortedCache();
      const entity = payload && (payload.entity || getEntity(payload.id));
      if (entity) initializeEntity(entity);
    }));
    subscriptions.push(bus.on('entity:destroyed', (payload) => {
      invalidateSortedCache();
      onEntityGone(payload);
    }));
    subscriptions.push(bus.on('physics:attachmentBroken', (payload) => attachments.onPhysicsBreak(payload)));
    subscriptions.push(bus.on('combat:requestAction', (payload) => actions.requestAction(payload || {})));
    subscriptions.push(bus.on('combat:routeDamage', (payload) => routeDamage(payload || {})));
    subscriptions.push(bus.on('combat:repairSubsystem', (payload) => {
      if (payload) repair(payload.entityId, payload.subsystemId, payload.amount, payload.reason);
    }));
  }

  Object.assign(helpers, {
    requestCombatAction: (request) => actions.requestAction(request || {}),
    routeCombatDamage: (request) => routeDamage(request || {}),
    inspectCombat: (request) => inspect(request || {}),
    repairCombatSubsystem: (request) => repair(request && request.entityId, request && request.subsystemId, request && request.amount, request && request.reason),
    getCombatCapabilities: (entityId) => capabilities(entityId),
    reconcileCombatPhysicsAttachments: () => reconcilePhysicsAttachments(),
  });

  const kernel = Object.freeze({
    schemaVersion: 1,
    catalog,
    actions,
    attachments,
    statuses,
    routeDamage,
    prePhysics,
    postPhysics,
    reconcilePhysicsAttachments,
    inspect,
    repair,
    capabilities,
    capRegenMultiplier,
    setKillHandler(handler) { hooks.onKill = typeof handler === 'function' ? handler : null; },
    dispose,
  });
  appendCombatTrace(state.combat, state.tick, 'combat.kernelReady', {
    actionDefs: catalog.actions.size,
    statusDefs: catalog.statuses.size,
    subsystemDefs: catalog.subsystems.size,
    attachmentDefs: catalog.attachments.size,
  });
  return kernel;

  function prePhysics(dt) {
    for (const entity of sortedEntitiesForTick()) {
      if (!entity.alive || !isCombatantType(entity.type)) continue;
      const runtime = ensureCombatant(state, entity, catalog);
      applyPendingSubsystemTransitions(attachmentContext, entity, runtime);
      const statusChanged = statuses.advance(entity, runtime, routeDamage);
      if (statusChanged) recomputeCombatantModifiers(context, entity, runtime, attachments);
      coolCombatHeat(entity, runtime, dt);
      syncCombatantBounds(entity, runtime, resolveCombatProfile(entity, catalog));
    }
    actions.advance();
  }

  function postPhysics() {
    reconcilePhysicsAttachments();
    attachments.updateTelemetryAndBreak();
    for (const entity of sortedEntitiesForTick()) {
      if (!entity.alive || !isCombatantType(entity.type)) continue;
      const runtime = ensureCombatant(state, entity, catalog);
      syncCombatantBounds(entity, runtime, resolveCombatProfile(entity, catalog));
    }
  }

  function reconcilePhysicsAttachments() {
    return attachments.reconcilePhysics();
  }

  function initializeEntity(entity) {
    if (!entity || !entity.alive || !isCombatantType(entity.type)) return null;
    const runtime = ensureCombatant(state, entity, catalog);
    recomputeCombatantModifiers(context, entity, runtime, attachments, false);
    appendCombatTrace(state.combat, state.tick, 'combat.entityInitialized', {
      targetId: entity.id,
      profileId: runtime.profileId,
      subsystems: Object.keys(runtime.subsystems).sort(),
    });
    return runtime;
  }

  function onEntityGone(payload) {
    const entityId = payload && payload.id;
    if (entityId == null) return;
    if (payload && payload.reason === 'save_restore') return;
    for (const attachment of attachments.listForEntity(entityId, true)) attachments.breakAttachment(attachment, 'entity_destroyed', entityId);
    removeCombatantRuntime(state, entityId);
    appendCombatTrace(state.combat, state.tick, 'combat.entityRemoved', { targetId: entityId });
  }

  function repair(entityId, subsystemId, amount, reason = 'repair') {
    const entity = getEntity(entityId);
    if (!entity || !entity.alive) return { ok: false, reason: 'entity_missing' };
    const runtime = ensureCombatant(state, entity, catalog);
    const result = repairSubsystem(context, entity, runtime, subsystemId, Math.max(0, Number(amount) || 0), reason);
    return { ok: result.applied > 0, ...result };
  }

  function capabilities(entityId) {
    const entity = getEntity(entityId);
    if (!entity) return null;
    const runtime = ensureCombatant(state, entity, catalog);
    return canonicalize({
      capabilities: runtime.capabilities,
      multipliers: runtime.multipliers,
      blockedActionTags: runtime.blockedActionTags,
    });
  }

  function capRegenMultiplier(entityId) {
    const entity = getEntity(entityId);
    if (!entity) return 1;
    const runtime = ensureCombatant(state, entity, catalog);
    const value = runtime.multipliers && runtime.multipliers.capRegen;
    return Number.isFinite(value) ? Math.max(0, value) : 1;
  }

  function inspect(request = {}) {
    const entityId = request.entityId;
    const entity = entityId == null ? null : getEntity(entityId);
    const runtime = entity ? ensureCombatant(state, entity, catalog) : null;
    return canonicalize({
      schemaVersion: 1,
      tick: state.tick,
      traceDigest: state.combat.trace && state.combat.trace.digest,
      entity: entity && runtime ? {
        id: entity.id,
        alive: entity.alive,
        vitals: { hull: entity.hull, hullMax: entity.hullMax, armor: entity.armorHp, armorMax: entity.armorMax, shield: entity.shield, shieldMax: entity.shieldMax, capacitor: entity.cap, capacitorMax: entity.capMax },
        combat: runtime,
        actions: actions.inspect(entity.id),
        attachments: attachments.listForEntity(entity.id, false),
      } : null,
      activeActions: entityId == null ? state.combat.actions.activeByActor : undefined,
      attachments: entityId == null ? state.combat.attachments.byId : undefined,
      trace: readCombatTrace(state.combat, {
        sinceSeq: request.sinceSeq,
        kinds: request.kinds,
        actorId: request.actorId,
        targetId: request.targetId,
        limit: request.limit,
      }),
    });
  }

  function coolCombatHeat(entity, runtime, dt) {
    const profile = resolveCombatProfile(entity, catalog);
    const basePerTick = profile && profile.heat && Number(profile.heat.dissipationPerTick) || 0;
    const normalizedTicks = Number.isFinite(dt) && dt > 0 ? dt * 60 : 1;
    const multiplier = runtime.multipliers && Number.isFinite(runtime.multipliers.heatDissipation) ? runtime.multipliers.heatDissipation : 1;
    runtime.heat = Math.max(0, runtime.heat - basePerTick * multiplier * normalizedTicks);
  }

  function getEntity(id) {
    return state.entities && state.entities.get ? state.entities.get(id) || null : null;
  }

  function sortedEntitiesForTick() {
    const source = entitySource(state);
    const length = source.length;
    if (
      sortedCache &&
      sortedCacheTick === state.tick &&
      sortedCacheSeenRevision === sortedCacheRevision &&
      sortedCacheSource === source &&
      sortedCacheLength === length
    ) {
      return sortedCache;
    }
    sortedCache = sortedEntitiesFromSource(source);
    sortedCacheTick = state.tick;
    sortedCacheSeenRevision = sortedCacheRevision;
    sortedCacheSource = source;
    sortedCacheLength = length;
    return sortedCache;
  }

  function invalidateSortedCache() {
    sortedCacheRevision++;
    sortedCacheTick = -1;
    sortedCache = null;
  }

  function dispose() {
    for (const unsubscribe of subscriptions) if (typeof unsubscribe === 'function') unsubscribe();
    KERNELS.delete(state);
  }
}

function entitySource(state) {
  if (Array.isArray(state.entityList)) return state.entityList;
  if (state.entities && typeof state.entities.values === 'function') return [...state.entities.values()];
  return [];
}

function sortedEntitiesFromSource(list) {
  if (!Array.isArray(list) || !list.length) return [];
  for (let i = 1; i < list.length; i++) {
    if (compareIds(list[i - 1] && list[i - 1].id, list[i] && list[i].id) > 0) {
      return [...list].sort((a, b) => compareIds(a && a.id, b && b.id));
    }
  }
  return list.slice();
}

function compareIds(a, b) {
  if (Number.isFinite(a) && Number.isFinite(b)) return a - b;
  const aa = String(a), bb = String(b);
  return aa < bb ? -1 : aa > bb ? 1 : 0;
}

function isCombatantType(type) {
  return type === 'ship' || type === 'station' || type === 'drone';
}
