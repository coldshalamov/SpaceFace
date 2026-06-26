import { getCombatKernel } from '../combat/kernel.js';
import { ContactKind, wrapAngle } from './contracts.js';

const TACTICAL_ACTION_DEF_FLAG = '__spacefaceTacticalActionDef';
const TACTICAL_PROFILE = Object.freeze({
  action_dash: Object.freeze({
    tags: Object.freeze(['evade', 'retreat', 'counter_tether_overload']),
    targetKinds: Object.freeze([]),
    preferredRange: 0,
    requiresEscapeAlignment: true,
  }),
  action_attach: Object.freeze({
    tags: Object.freeze(['tug', 'steal']),
    targetKinds: Object.freeze([ContactKind.OBJECTIVE, ContactKind.SHIP]),
    preferredRange: 90,
  }),
  action_reel: Object.freeze({
    tags: Object.freeze(['tug']),
    targetKinds: Object.freeze([ContactKind.TETHER]),
    preferredRange: 0,
  }),
  action_sling: Object.freeze({
    tags: Object.freeze(['attack']),
    targetKinds: Object.freeze([ContactKind.TETHER]),
    preferredRange: 0,
  }),
  action_cut: Object.freeze({
    tags: Object.freeze(['counter_tether_cut']),
    targetKinds: Object.freeze([ContactKind.TETHER]),
    preferredRange: 0,
    requiresOwnedAttachment: true,
  }),
  action_burst: Object.freeze({
    tags: Object.freeze(['attack', 'ranged']),
    targetKinds: Object.freeze([ContactKind.SHIP]),
    preferredRange: 180,
  }),
});

/** Convert the canonical SG-03 ActionDef into the read-only tactical view consumed by SG-06. */
export function toTacticalActionDef(def) {
  if (!def || typeof def.id !== 'string') return null;
  const profile = TACTICAL_PROFILE[def.id] || {};
  const tags = new Set([...(def.tags || []), ...(profile.tags || [])]);
  if (Number(def.costs && def.costs.capacitor) > 0) tags.add('energy');
  if (Number(def.costs && def.costs.heat) > 0) tags.add('heat');
  const totalTicks = ['startupTicks', 'activeTicks', 'recoveryTicks']
    .reduce((sum, key) => sum + Math.max(0, Number(def.phases && def.phases[key]) || 0), 0);
  const view = {
    id: def.id,
    tags: Object.freeze([...tags].sort()),
    minCommitTicks: Math.max(1, totalTicks),
    switchMargin: 0.08,
    range: Math.max(0, Number(def.target && def.target.maxRange) || 0),
    preferredRange: Number.isFinite(profile.preferredRange)
      ? profile.preferredRange
      : Math.max(0, Number(def.target && def.target.maxRange) || 0) * 0.75,
    targetKinds: Object.freeze((profile.targetKinds || inferTargetKinds(def.target)).slice().sort()),
    metadata: Object.freeze({
      actionDefVersion: def.version || 1,
      targetKind: def.target && def.target.kind || 'none',
      requiresCapabilities: Object.freeze((def.requiresCapabilities || []).slice().sort()),
      requiresEscapeAlignment: !!profile.requiresEscapeAlignment,
      requiresOwnedAttachment: !!profile.requiresOwnedAttachment,
      capacitorCost: Math.max(0, Number(def.costs && def.costs.capacitor) || 0),
      heatCost: Math.max(0, Number(def.costs && def.costs.heat) || 0),
    }),
  };
  Object.defineProperty(view, TACTICAL_ACTION_DEF_FLAG, { value: true });
  return Object.freeze(view);
}

/**
 * Adapter over the live SG-03 action kernel. Prediction is advisory; SG-03 remains the authoritative
 * gate and executes every request through the same queue used by player input.
 */
export function createSG03ActionPort(ctx, { controllerId = 'sg06' } = {}) {
  if (!ctx || !ctx.state) throw new TypeError('SG-03 action port requires simulation context');
  const kernel = getCombatKernel(ctx);
  const state = ctx.state;
  const sortedActions = [...kernel.catalog.actions.values()].sort((a, b) => a.id.localeCompare(b.id));
  const tacticalViews = new Map();
  const listCache = new Map();
  const signatureCache = new Map();
  const tacticalViewFor = (def) => {
    let view = tacticalViews.get(def.id);
    if (!view) {
      view = toTacticalActionDef(def);
      tacticalViews.set(def.id, view);
    }
    return view;
  };

  return Object.freeze({
    list(entityId) {
      const capabilityView = fastCapabilityView(state, kernel, entityId);
      const capabilities = capabilityView && capabilityView.capabilities || {};
      const blockedTags = Array.isArray(capabilityView && capabilityView.blockedActionTags)
        ? capabilityView.blockedActionTags
        : [];
      const cacheKey = String(entityId);
      const signature = cachedActionListSignature(signatureCache, cacheKey, state.tick, capabilities, blockedTags);
      const cached = listCache.get(cacheKey);
      if (cached && cached.signature === signature) return cached.list;
      const out = [];
      for (const def of sortedActions) {
        if ((def.requiresCapabilities || []).some((name) => capabilities[name] === false)) continue;
        if ((def.tags || []).some((tag) => blockedTags.includes(tag))) continue;
        const view = tacticalViewFor(def);
        if (view) out.push(view);
      }
      const list = Object.freeze(out);
      listCache.set(cacheKey, { signature, list });
      return list;
    },

    canStart(entityId, actionId, request = {}) {
      const def = kernel.catalog.actions.get(actionId);
      if (!def) return { ok: false, reason: 'unknown_action' };
      const entity = liveEntity(state, entityId);
      if (!entity || !entity.alive) return { ok: false, reason: 'actor_missing' };
      const capabilityView = fastCapabilityView(state, kernel, entityId) || {};
      const combat = liveCombatRuntime(state, entityId) || {};
      const capabilities = capabilityView.capabilities || combat.capabilities || {};
      for (const capability of def.requiresCapabilities || []) {
        if (capabilities[capability] === false) return { ok: false, reason: `disabled:${capability}` };
      }
      const blockedTags = capabilityView.blockedActionTags || combat.blockedActionTags || [];
      const blockedTag = (def.tags || []).find((tag) => blockedTags.includes(tag));
      if (blockedTag) return { ok: false, reason: `disabled:${blockedTag}` };
      const readyTick = cooldownReadyTick(state, entityId, actionId);
      if (state.tick < readyTick) return { ok: false, reason: `cooldown:${readyTick}` };
      const capCost = Math.max(0, Number(def.costs && def.costs.capacitor) || 0);
      const heatCost = Math.max(0, Number(def.costs && def.costs.heat) || 0);
      if ((Number(entity.cap) || 0) < capCost) return { ok: false, reason: 'insufficient_capacitor' };
      if ((combat.heat || 0) + heatCost > (combat.heatMax || Infinity)) return { ok: false, reason: 'heat_limit' };
      if (def.target && def.target.required && request.targetId == null) return { ok: false, reason: 'target_required' };
      if (def.target && def.target.ownedByActor) {
        const tags = new Set(request.target && request.target.tags || []);
        if (!request.target || (!request.target.ownedBySelf && !tags.has('owned_by_self') && !tags.has('cuttable_by_self'))) {
          return { ok: false, reason: 'not_attachment_owner' };
        }
      }
      return { ok: true, reason: 'sg03_predictive_gate' };
    },

    start(entityId, actionId, request = {}) {
      const def = kernel.catalog.actions.get(actionId);
      if (!def) return null;
      const payload = {
        actorId: entityId,
        actionId,
        source: { kind: 'ai', controllerId: String(controllerId) },
        notBeforeTick: Number.isInteger(request.tick) ? request.tick : state.tick,
        metadata: {
          squadId: request.squadId == null ? null : String(request.squadId),
          objective: request.objective || null,
        },
      };
      if (def.target && def.target.kind === 'entity') {
        payload.targetId = request.targetId;
        payload.sourceSocketId = request.target && request.target.sourceSocketId || null;
        payload.targetSocketId = request.target && request.target.targetSocketId || null;
      } else if (def.target && def.target.kind === 'attachment') {
        payload.attachmentId = request.target && request.target.attachmentId || request.targetId;
      } else if (def.target && def.target.kind === 'point') {
        payload.point = request.target && request.target.pos || null;
      }
      const result = kernel.actions.requestAction(payload);
      return result && result.ok ? result.requestId : null;
    },

    status(entityId, handle) {
      if (handle == null) return 'failed';
      const active = activeActionFor(state, entityId);
      if (active && active.requestId === handle) return 'running';
      if (queuedActionExists(state, entityId, handle)) return 'queued';
      const events = state.combat && state.combat.trace && state.combat.trace.events || [];
      let instanceId = null;
      for (let index = events.length - 1; index >= 0; index--) {
        const event = events[index];
        if (event.requestId !== handle) continue;
        if (event.kind === 'action.rejected') return 'failed';
        if (event.kind === 'action.started') { instanceId = event.actionInstanceId; break; }
      }
      if (!instanceId) return 'queued';
      for (let index = events.length - 1; index >= 0; index--) {
        const event = events[index];
        if (event.actionInstanceId !== instanceId) continue;
        if (event.kind === 'action.completed') return 'completed';
        if (event.kind === 'action.cancelled') return 'cancelled';
      }
      return 'running';
    },

    interrupt(entityId, _handle, context = {}) {
      const nextDef = kernel.catalog.actions.get(context.nextActionId);
      const current = activeActionFor(state, entityId);
      if (!current) return true;
      const currentDef = kernel.catalog.actions.get(current.actionId);
      if (!currentDef || !nextDef) return false;
      const timeline = kernel.actions.phaseAt(current.actionId, state.tick - current.startedTick);
      return canCancelInto(currentDef, timeline, nextDef);
    },

    inspect(entityId) {
      return kernel.inspect({ entityId, actorId: entityId, limit: 128 });
    },
  });
}

export function escapeAlignment(self, target) {
  if (!self || !target) return 0;
  const desired = Math.atan2(self.pos.z - target.pos.z, self.pos.x - target.pos.x);
  return Math.abs(wrapAngle(desired - self.rot));
}

function inferTargetKinds(target = {}) {
  if (target.kind === 'attachment') return [ContactKind.TETHER];
  if (target.kind === 'entity') return [ContactKind.SHIP, ContactKind.OBJECTIVE];
  if (target.kind === 'point') return [ContactKind.WAYPOINT];
  return [];
}

function canCancelInto(currentDef, phase, nextDef) {
  for (const window of currentDef.cancelWindows || []) {
    if (window.phase !== phase.phase) continue;
    if (phase.localTick < window.fromTick || phase.localTick >= window.toTick) continue;
    if (!(window.intoTags || []).length) return true;
    if ((nextDef.tags || []).some((tag) => window.intoTags.includes(tag))) return true;
  }
  return false;
}

function fastCapabilityView(state, kernel, entityId) {
  const runtime = state && state.combat && state.combat.entities && state.combat.entities[String(entityId)];
  if (runtime) {
    return {
      capabilities: runtime.capabilities || {},
      blockedActionTags: Array.isArray(runtime.blockedActionTags) ? runtime.blockedActionTags : [],
    };
  }
  return kernel.capabilities(entityId);
}

function liveEntity(state, entityId) {
  return state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(entityId) || null
    : null;
}

function liveCombatRuntime(state, entityId) {
  return state && state.combat && state.combat.entities && state.combat.entities[String(entityId)] || null;
}

function activeActionFor(state, entityId) {
  return state && state.combat && state.combat.actions && state.combat.actions.activeByActor
    ? state.combat.actions.activeByActor[String(entityId)] || null
    : null;
}

function queuedActionExists(state, entityId, handle) {
  const requests = state && state.combat && state.combat.actions && state.combat.actions.requests || [];
  for (const request of requests) {
    if (request && request.id === handle && request.actorId === entityId) return true;
  }
  return false;
}

function cooldownReadyTick(state, entityId, actionId) {
  const cooldowns = state && state.combat && state.combat.actions && state.combat.actions.cooldownReadyTickByActor || {};
  const byActor = cooldowns[String(entityId)] || {};
  return Number(byActor[actionId]) || 0;
}

function actionListSignature(capabilities, blockedTags) {
  const caps = Object.keys(capabilities || {}).sort()
    .map((key) => `${key}:${capabilities[key] === false ? 0 : 1}`)
    .join(',');
  const blocked = (blockedTags || []).slice().sort().join(',');
  return `${caps}|${blocked}`;
}

function cachedActionListSignature(cache, entityKey, tick, capabilities, blockedTags) {
  const cached = cache.get(entityKey);
  if (cached && cached.tick === tick && cached.capabilities === capabilities && cached.blockedTags === blockedTags) {
    return cached.signature;
  }
  const signature = actionListSignature(capabilities, blockedTags);
  cache.set(entityKey, { tick, capabilities, blockedTags, signature });
  return signature;
}
