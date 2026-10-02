import { appendCombatTrace } from './trace.js';

/** The capital opening follows this battery, not a hull-fraction act. */
export const CAPITAL_OPENING_SUBSYSTEM_ID = 'subsystem_weapon';

function subsystemBag(source) {
  if (!source || typeof source !== 'object') return null;
  if (source.subsystems && typeof source.subsystems === 'object') return source.subsystems;
  const data = source.data;
  if (data && data.subsystems && typeof data.subsystems === 'object') return data.subsystems;
  if (data && data.combatRuntime && data.combatRuntime.subsystems) return data.combatRuntime.subsystems;
  if (source.combatRuntime && source.combatRuntime.subsystems) return source.combatRuntime.subsystems;
  return null;
}

export function capitalSubsystemDisabled(source, subsystemId = CAPITAL_OPENING_SUBSYSTEM_ID) {
  const bag = subsystemBag(source);
  const row = bag && bag[subsystemId];
  if (row && (row.effectiveDisabled === true || row.destroyed === true)) return true;
  const fractions = (source && source.subsystemFractions)
    || (source && source.data && source.data.subsystemFractions)
    || null;
  const fraction = fractions && fractions[subsystemId];
  return Number.isFinite(fraction) && fraction <= 0;
}

/**
 * Open only after the weapon battery is actually disabled. Hull fraction is ignored,
 * so a health-bar phase cannot open or close the window. Guns and collisions share
 * this flag — no hidden equipment is required.
 */
export function resolveCapitalOpening(source) {
  const open = capitalSubsystemDisabled(source, CAPITAL_OPENING_SUBSYSTEM_ID);
  return {
    open,
    subsystemId: CAPITAL_OPENING_SUBSYSTEM_ID,
    transitionId: open ? `opening:${CAPITAL_OPENING_SUBSYSTEM_ID}` : null,
    reason: open ? 'subsystem_disabled' : 'subsystem_live',
  };
}

/** One cue per real transition. Repeated damage while open announces nothing. */
export function capitalOpeningAnnouncement(previousTransitionId, opening) {
  const open = !!(opening && opening.open);
  const id = open ? opening.transitionId : null;
  if (open && previousTransitionId === id) return null;
  if (!open && !previousTransitionId) return null;
  if (!open) return { cue: 'combat.subsystem.restored', transitionId: null, close: true };
  return { cue: 'combat.subsystem.weapon.disabled', transitionId: id, close: false };
}

/**
 * Count destroyed/disabled turrets on an entity (e.g. dreadnought capital).
 * Supports both entity.subsystems and entity.data.subsystems.turrets.
 */
export function countTurretsLost(source) {
  if (!source || typeof source !== 'object') return 0;
  const bag = (source.data && source.data.subsystems && source.data.subsystems.turrets) || subsystemBag(source);
  if (!bag) return 0;
  let lost = 0;
  for (const [id, sub] of Object.entries(bag)) {
    if (id.startsWith('turret_') || (sub && sub.isTurret)) {
      if (sub.destroyed === true || sub.effectiveDisabled === true || (Number.isFinite(sub.health) && sub.health <= 0)) {
        lost++;
      }
    }
  }
  return lost;
}

/**
 * Scripted or direct turret disable on an entity.
 */
export function destroyTurret(source, turretId) {
  if (!source || typeof source !== 'object') return false;
  const dataTurrets = source.data && source.data.subsystems && source.data.subsystems.turrets;
  const bag = dataTurrets || subsystemBag(source);
  if (!bag) return false;
  const key = typeof turretId === 'number' ? `turret_${turretId}` : turretId;
  const sub = bag[key];
  if (sub) {
    sub.health = 0;
    sub.destroyed = true;
    sub.effectiveDisabled = true;
    if (source.subsystems && source.subsystems[key]) {
      source.subsystems[key].health = 0;
      source.subsystems[key].destroyed = true;
      source.subsystems[key].effectiveDisabled = true;
    }
    return true;
  }
  return false;
}

// Subsystem id sets are fixed at ensureCombatant(); damage toggles destroyed flags but never
// adds/removes keys. Cache the sorted id list on the runtime so applyPending + recompute skip
// Object.keys().sort() every combat prePhysics (fresh profile: ~36 ms self).
function sortedSubsystemIds(runtime) {
  const map = runtime && runtime.subsystems;
  if (!map) return EMPTY_ID_LIST;
  let cached = runtime._sfSortedSubsystemIds;
  if (cached) return cached;
  cached = Object.keys(map).sort();
  runtime._sfSortedSubsystemIds = cached;
  return cached;
}

const EMPTY_ID_LIST = [];

export function applyPendingSubsystemTransitions(context, entity, runtime) {
  const { state, catalog, attachments } = context;
  const tick = state.tick >>> 0;
  // Quiet combatants: no pending transitions and no dirty modifier flag → skip the
  // sorted-subsystem walk entirely (profile: applyPending under combat prePhysics).
  let pendingCount = runtime.pendingSubsystemTransitionCount | 0;
  if (!Number.isInteger(runtime.pendingSubsystemTransitionCount) || pendingCount < 0) {
    // Restored saves or hand-built runtimes can carry pendings without the count
    // (the field postdates the save schema) — recount once so they apply.
    pendingCount = 0;
    for (const id in runtime.subsystems) {
      const subsystem = runtime.subsystems[id];
      if (subsystem && subsystem.pendingTransition) pendingCount += 1;
    }
    runtime.pendingSubsystemTransitionCount = pendingCount;
  }
  const hasPending = pendingCount > 0;
  const dirty = runtime.statusModifiersDirty === true;
  if (!hasPending && !dirty) return false;
  let changed = false;
  let transitionAttackerId = null;
  if (hasPending) {
    for (const subsystemId of sortedSubsystemIds(runtime)) {
      const subsystem = runtime.subsystems[subsystemId];
      const pending = subsystem.pendingTransition;
      if (!pending || pending.atTick > tick) continue;
      subsystem.pendingTransition = null;
      if ((runtime.pendingSubsystemTransitionCount | 0) > 0) {
        runtime.pendingSubsystemTransitionCount -= 1;
      }
      if (subsystem.destroyed !== !!pending.destroyed) {
        subsystem.destroyed = !!pending.destroyed;
        changed = true;
        if (pending.destroyed && pending.attackerId != null) transitionAttackerId = pending.attackerId;
        appendCombatTrace(state.combat, tick, subsystem.destroyed ? 'subsystem.destroyed' : 'subsystem.repaired', {
          targetId: entity.id,
          subsystemId,
          reason: pending.reason || null,
          health: subsystem.health,
        });
      }
    }
  }
  if (changed) {
    runtime.transitionAttackerId = transitionAttackerId;
    recomputeCombatantModifiers(context, entity, runtime, attachments);
    delete runtime.transitionAttackerId;
  }
  else if (dirty) {
    // Statuses cleared outside advance() still change modifier inputs; statuses.advance would
    // recompute after consuming this flag anyway, so derive here once instead.
    delete runtime.statusModifiersDirty;
    recomputeCombatantModifiers(context, entity, runtime, attachments, false);
  }
  return changed;
}

export function recomputeCombatantModifiers(context, entity, runtime, attachments = null, emitTransitions = true) {
  const { state, catalog } = context;
  const previousEffective = {};
  for (const [id, subsystem] of Object.entries(runtime.subsystems || {})) previousEffective[id] = !!subsystem.effectiveDisabled;

  const disabled = new Set();
  for (const [id, subsystem] of Object.entries(runtime.subsystems || {})) if (subsystem.destroyed) disabled.add(id);
  let progress = true;
  while (progress) {
    progress = false;
    for (const id of sortedSubsystemIds(runtime)) {
      if (disabled.has(id)) continue;
      const def = catalog.subsystems.get(id);
      if (!def) continue;
      if ((def.dependencies || []).some((dependencyId) => disabled.has(dependencyId))) {
        disabled.add(id);
        progress = true;
      }
    }
  }

  runtime.capabilities = { ...(runtime.baseCapabilities || {}) };
  runtime.multipliers = { movement: 1, capRegen: 1, heatDissipation: 1 };
  runtime.physicsResponse = { massScale: 1, inertiaScale: 1 };
  const blocked = new Set();

  for (const id of sortedSubsystemIds(runtime)) {
    const subsystem = runtime.subsystems[id];
    subsystem.effectiveDisabled = disabled.has(id);
    if (subsystem.effectiveDisabled) applyEffects(runtime, blocked, catalog.subsystems.get(id)?.disabledBehavior, 1);
    if (emitTransitions && previousEffective[id] !== subsystem.effectiveDisabled) {
      const def = catalog.subsystems.get(id);
      appendCombatTrace(state.combat, state.tick, subsystem.effectiveDisabled ? 'subsystem.disabled' : 'subsystem.enabled', {
        targetId: entity.id,
        subsystemId: id,
        dependencyDisabled: !subsystem.destroyed && subsystem.effectiveDisabled,
        cueId: subsystem.effectiveDisabled ? (def && def.cueId) || null : 'combat.subsystem.restored',
      });
      if (context.bus) {
        context.bus.emit(subsystem.effectiveDisabled ? 'combat:subsystemDisabled' : 'combat:subsystemEnabled', {
          attackerId: subsystem.effectiveDisabled && runtime.transitionAttackerId != null
            ? runtime.transitionAttackerId
            : null,
          targetId: entity.id,
          subsystemId: id,
          dependencyDisabled: !subsystem.destroyed && subsystem.effectiveDisabled,
          cueId: subsystem.effectiveDisabled ? (def && def.cueId) || null : 'combat.subsystem.restored',
        });
      }
      if (subsystem.effectiveDisabled && def && def.disabledBehavior && def.disabledBehavior.breakOwnedAttachments && attachments) {
        attachments.breakOwnedBy(entity.id, 'subsystem_disabled');
      }
    }
  }

  for (const statusId of Object.keys(runtime.statuses || {}).sort()) {
    const status = runtime.statuses[statusId];
    if (!status || status.pending || status.expiresTick <= state.tick) continue;
    const def = catalog.statuses.get(statusId);
    if (def) applyEffects(runtime, blocked, def.effects, Math.max(1, status.stacks || 1));
  }

  runtime.blockedActionTags = [...blocked].sort();
  runtime.revision = (runtime.revision || 0) + 1;
  return runtime;
}

export function damageSubsystem(context, entity, runtime, subsystemId, incomingDamage, channelWeights, penetration = 0) {
  const { state, catalog } = context;
  const subsystem = runtime && runtime.subsystems && runtime.subsystems[subsystemId];
  const def = subsystem && catalog.subsystems.get(subsystemId);
  if (!subsystem || !def || !(incomingDamage > 0)) {
    return { subsystemId: subsystemId || null, applied: 0, overflow: Math.max(0, incomingDamage || 0), before: subsystem ? subsystem.health : 0, after: subsystem ? subsystem.health : 0 };
  }

  const armor = def.armor || {};
  const flat = Math.max(0, Number(armor.flat) || 0) * (1 - clamp01(penetration));
  const afterFlat = Math.max(0, incomingDamage - flat);
  const multiplier = weightedMultiplier(channelWeights, armor.multipliers || {});
  const effective = afterFlat * multiplier;
  const before = subsystem.health;
  const applied = Math.min(before, effective);
  subsystem.health = Math.max(0, before - applied);
  subsystem.lastDamageTick = state.tick;
  const rawConsumed = multiplier > 0 ? applied / multiplier + Math.min(flat, incomingDamage) : 0;
  const overflow = Math.max(0, incomingDamage - rawConsumed);

  if (before > 0 && subsystem.health <= 0) {
    scheduleSubsystemTransition(subsystem, state.tick + 1, true, 'health_zero', context.currentAttackerId, runtime);
  }
  appendCombatTrace(state.combat, state.tick, 'subsystem.damage', {
    attackerId: context.currentAttackerId == null ? null : context.currentAttackerId,
    targetId: entity.id,
    subsystemId,
    raw: incomingDamage,
    applied,
    overflow,
    before,
    after: subsystem.health,
    disableTick: subsystem.pendingTransition && subsystem.pendingTransition.destroyed ? subsystem.pendingTransition.atTick : null,
  });
  return { subsystemId, applied, overflow, before, after: subsystem.health };
}

export function repairSubsystem(context, entity, runtime, subsystemId, amount, reason = 'repair') {
  const subsystem = runtime && runtime.subsystems && runtime.subsystems[subsystemId];
  if (!subsystem || !(amount > 0)) return { applied: 0, health: subsystem ? subsystem.health : 0 };
  const before = subsystem.health;
  subsystem.health = Math.min(subsystem.maxHealth, subsystem.health + amount);
  const applied = subsystem.health - before;
  if (subsystem.destroyed && subsystem.health > 0) {
    scheduleSubsystemTransition(subsystem, context.state.tick + 1, false, reason, null, runtime);
  }
  appendCombatTrace(context.state.combat, context.state.tick, 'subsystem.repair', {
    targetId: entity.id,
    subsystemId,
    applied,
    before,
    after: subsystem.health,
    enableTick: subsystem.pendingTransition && !subsystem.pendingTransition.destroyed ? subsystem.pendingTransition.atTick : null,
  });
  return { applied, health: subsystem.health };
}

export function actionBlockedByCombatant(runtime, actionDef) {
  for (const capability of actionDef.requiresCapabilities || []) {
    if (runtime.capabilities && runtime.capabilities[capability] === false) return `capability:${capability}`;
  }
  const blocked = new Set(runtime.blockedActionTags || []);
  for (const tag of actionDef.tags || []) if (blocked.has(tag)) return `tag:${tag}`;
  return null;
}

export function scheduleSubsystemTransition(subsystem, atTick, destroyed, reason, attackerId = null, runtime = null) {
  const next = {
    atTick: Math.max(0, Math.floor(atTick)),
    destroyed: !!destroyed,
    reason: reason || null,
    attackerId: attackerId == null ? null : attackerId,
  };
  const current = subsystem.pendingTransition;
  if (!current || next.atTick < current.atTick || (next.atTick === current.atTick && next.destroyed)) {
    const wasPending = !!current;
    subsystem.pendingTransition = next;
    // Count only freshly armed pendings so quiet applyPending can skip the walk.
    if (!wasPending && runtime && typeof runtime === 'object') {
      runtime.pendingSubsystemTransitionCount = (runtime.pendingSubsystemTransitionCount | 0) + 1;
    }
  }
}

function applyEffects(runtime, blocked, effects, stacks) {
  if (!effects) return;
  for (const [capability, value] of Object.entries(effects.capabilities || {})) {
    if (value === false) runtime.capabilities[capability] = false;
    else if (!(capability in runtime.capabilities)) runtime.capabilities[capability] = !!value;
  }
  for (const [name, value] of Object.entries(effects.multipliers || {})) {
    const factor = Number.isFinite(value) ? Math.max(0, value) : 1;
    runtime.multipliers[name] = (runtime.multipliers[name] == null ? 1 : runtime.multipliers[name]) * Math.pow(factor, stacks);
  }
  for (const [name, value] of Object.entries(effects.physicsResponse || {})) {
    if (name !== 'massScale' && name !== 'inertiaScale') continue;
    const factor = Number.isFinite(value) && value > 0 ? value : 1;
    runtime.physicsResponse[name] = (runtime.physicsResponse[name] == null ? 1 : runtime.physicsResponse[name])
      * Math.pow(factor, stacks);
  }
  for (const tag of effects.blockedActionTags || []) blocked.add(tag);
}

function weightedMultiplier(weights, multipliers) {
  let total = 0, weighted = 0;
  for (const [channel, amount] of Object.entries(weights || {})) {
    if (!(amount > 0)) continue;
    total += amount;
    weighted += amount * (Number.isFinite(multipliers[channel]) ? multipliers[channel] : 1);
  }
  return total > 0 ? weighted / total : 1;
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
