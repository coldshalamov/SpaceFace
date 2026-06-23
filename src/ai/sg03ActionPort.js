import { getCombatKernel } from '../combat/kernel.js';
import { ContactKind, wrapAngle } from './contracts.js';

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
  return Object.freeze({
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
  });
}

/**
 * Adapter over the live SG-03 action kernel. Prediction is advisory; SG-03 remains the authoritative
 * gate and executes every request through the same queue used by player input.
 */
export function createSG03ActionPort(ctx, { controllerId = 'sg06' } = {}) {
  if (!ctx || !ctx.state) throw new TypeError('SG-03 action port requires simulation context');
  const kernel = getCombatKernel(ctx);
  const state = ctx.state;

  return Object.freeze({
    list(entityId) {
      const capabilityView = kernel.capabilities(entityId);
      const capabilities = capabilityView && capabilityView.capabilities || {};
      const blockedTags = new Set(capabilityView && capabilityView.blockedActionTags || []);
      const out = [];
      for (const def of [...kernel.catalog.actions.values()].sort((a, b) => a.id.localeCompare(b.id))) {
        if ((def.requiresCapabilities || []).some((name) => capabilities[name] === false)) continue;
        if ((def.tags || []).some((tag) => blockedTags.has(tag))) continue;
        const view = toTacticalActionDef(def);
        if (view) out.push(view);
      }
      return Object.freeze(out);
    },

    canStart(entityId, actionId, request = {}) {
      const def = kernel.catalog.actions.get(actionId);
      if (!def) return { ok: false, reason: 'unknown_action' };
      const inspection = kernel.inspect({ entityId, limit: 0 });
      const entity = inspection && inspection.entity;
      if (!entity || !entity.alive) return { ok: false, reason: 'actor_missing' };
      const combat = entity.combat || {};
      const capabilities = combat.capabilities || {};
      for (const capability of def.requiresCapabilities || []) {
        if (capabilities[capability] === false) return { ok: false, reason: `disabled:${capability}` };
      }
      const blocked = new Set(combat.blockedActionTags || []);
      const blockedTag = (def.tags || []).find((tag) => blocked.has(tag));
      if (blockedTag) return { ok: false, reason: `disabled:${blockedTag}` };
      const actionStatus = kernel.actions.inspect(entityId);
      const readyTick = Number(actionStatus && actionStatus.cooldownReadyTick && actionStatus.cooldownReadyTick[actionId]) || 0;
      if (state.tick < readyTick) return { ok: false, reason: `cooldown:${readyTick}` };
      const capCost = Math.max(0, Number(def.costs && def.costs.capacitor) || 0);
      const heatCost = Math.max(0, Number(def.costs && def.costs.heat) || 0);
      if ((entity.vitals && entity.vitals.capacitor || 0) < capCost) return { ok: false, reason: 'insufficient_capacitor' };
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
      const inspected = kernel.actions.inspect(entityId);
      if (inspected.active && inspected.active.requestId === handle) return 'running';
      if ((inspected.queued || []).some((request) => request.id === handle)) return 'queued';
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
      const inspected = kernel.actions.inspect(entityId);
      const current = inspected.active;
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
