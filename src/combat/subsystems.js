import { appendCombatTrace } from './trace.js';

export function applyPendingSubsystemTransitions(context, entity, runtime) {
  const { state, catalog, attachments } = context;
  const tick = state.tick >>> 0;
  let changed = false;
  for (const subsystemId of Object.keys(runtime.subsystems || {}).sort()) {
    const subsystem = runtime.subsystems[subsystemId];
    const pending = subsystem.pendingTransition;
    if (!pending || pending.atTick > tick) continue;
    subsystem.pendingTransition = null;
    if (subsystem.destroyed !== !!pending.destroyed) {
      subsystem.destroyed = !!pending.destroyed;
      changed = true;
      appendCombatTrace(state.combat, tick, subsystem.destroyed ? 'subsystem.destroyed' : 'subsystem.repaired', {
        targetId: entity.id,
        subsystemId,
        reason: pending.reason || null,
        health: subsystem.health,
      });
    }
  }
  if (changed) recomputeCombatantModifiers(context, entity, runtime, attachments);
  else recomputeCombatantModifiers(context, entity, runtime, attachments, false);
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
    for (const id of Object.keys(runtime.subsystems || {}).sort()) {
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
  const blocked = new Set();

  for (const id of Object.keys(runtime.subsystems || {}).sort()) {
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
    scheduleSubsystemTransition(subsystem, state.tick + 1, true, 'health_zero');
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
    scheduleSubsystemTransition(subsystem, context.state.tick + 1, false, reason);
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

export function scheduleSubsystemTransition(subsystem, atTick, destroyed, reason) {
  const next = { atTick: Math.max(0, Math.floor(atTick)), destroyed: !!destroyed, reason: reason || null };
  const current = subsystem.pendingTransition;
  if (!current || next.atTick < current.atTick || (next.atTick === current.atTick && next.destroyed)) subsystem.pendingTransition = next;
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
