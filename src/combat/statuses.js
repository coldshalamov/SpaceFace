import { appendCombatTrace } from './trace.js';

export function createStatusService(context) {
  const { state, catalog, bus } = context;

  function schedule(targetEntity, runtime, application, source = {}) {
    const def = catalog.statuses.get(application && application.id);
    if (!def) return { ok: false, reason: 'unknown_status' };
    const immunity = new Set(runtime.immunityTags || []);
    if ((def.immunityTags || []).some((tag) => immunity.has(tag))) {
      appendCombatTrace(state.combat, state.tick, 'status.immune', {
        actorId: source.attackerId == null ? null : source.attackerId,
        targetId: targetEntity.id,
        statusId: def.id,
      });
      return { ok: false, reason: 'immune' };
    }
    const stacks = Math.max(1, Math.floor(application.stacks || 1));
    const applyTick = Number.isInteger(application.applyTick) ? application.applyTick : state.tick + 1;
    if (!Number.isInteger(state.combat.statusNextPendingSeq) || state.combat.statusNextPendingSeq < 1) {
      state.combat.statusNextPendingSeq = 1;
    }
    runtime.pendingStatuses.push({
      seq: state.combat.statusNextPendingSeq++,
      id: def.id,
      stacks,
      durationTicks: Number.isInteger(application.durationTicks) ? application.durationTicks : def.durationTicks,
      applyTick: Math.max(state.tick, applyTick),
      attackerId: source.attackerId == null ? null : source.attackerId,
      actionId: source.actionId || null,
    });
    runtime.pendingStatuses.sort((a, b) => a.applyTick - b.applyTick || a.seq - b.seq);
    appendCombatTrace(state.combat, state.tick, 'status.scheduled', {
      actorId: source.attackerId == null ? null : source.attackerId,
      targetId: targetEntity.id,
      statusId: def.id,
      stacks,
      applyTick: Math.max(state.tick, applyTick),
    });
    return { ok: true };
  }

  function advance(targetEntity, runtime, routeDamage) {
    const tick = state.tick >>> 0;
    let changed = false;

    for (const statusId of Object.keys(runtime.statuses || {}).sort()) {
      const active = runtime.statuses[statusId];
      if (active.expiresTick > tick) continue;
      delete runtime.statuses[statusId];
      changed = true;
      appendCombatTrace(state.combat, tick, 'status.expired', { targetId: targetEntity.id, statusId });
      if (bus) bus.emit('combat:statusExpired', { targetId: targetEntity.id, statusId });
    }

    const due = [];
    while (runtime.pendingStatuses.length && runtime.pendingStatuses[0].applyTick <= tick) due.push(runtime.pendingStatuses.shift());
    for (const pending of due) {
      if (applyActive(targetEntity, runtime, pending)) changed = true;
    }

    for (const statusId of Object.keys(runtime.statuses || {}).sort()) {
      const active = runtime.statuses[statusId];
      const def = catalog.statuses.get(statusId);
      if (!active || !def || !def.periodic || !(def.periodic.everyTicks > 0)) continue;
      while (active.nextPeriodicTick != null && active.nextPeriodicTick <= tick && active.expiresTick > active.nextPeriodicTick) {
        if (typeof routeDamage === 'function') {
          const packet = scalePacket(def.periodic.packet, Math.max(1, active.stacks || 1));
          packet.flags = { ...(packet.flags || {}), ignoreFriendlyFire: true, statusPeriodic: true };
          packet.source = { statusId, attackerId: active.attackerId };
          routeDamage({
            attackerId: active.attackerId,
            targetId: targetEntity.id,
            packet,
            origin: { kind: 'status', id: statusId },
          });
        }
        appendCombatTrace(state.combat, active.nextPeriodicTick, 'status.periodic', {
          actorId: active.attackerId,
          targetId: targetEntity.id,
          statusId,
          stacks: active.stacks,
        });
        active.nextPeriodicTick += def.periodic.everyTicks;
      }
    }
    return changed;
  }

  function clear(targetEntity, runtime, statusId, reason = 'cleared') {
    if (!runtime.statuses[statusId]) return false;
    delete runtime.statuses[statusId];
    appendCombatTrace(state.combat, state.tick, 'status.cleared', { targetId: targetEntity.id, statusId, reason });
    return true;
  }

  function applyActive(targetEntity, runtime, pending) {
    const def = catalog.statuses.get(pending.id);
    if (!def) return false;
    const existing = runtime.statuses[def.id];
    const maxStacks = Math.max(1, Math.floor(def.stacking && def.stacking.maxStacks || 1));
    const duration = Math.max(1, Math.floor(pending.durationTicks || def.durationTicks || 1));
    const mode = def.stacking && def.stacking.mode || 'refresh';
    let active = existing;
    if (!active) {
      active = runtime.statuses[def.id] = {
        id: def.id,
        stacks: Math.min(maxStacks, pending.stacks),
        appliedTick: state.tick,
        expiresTick: state.tick + duration,
        nextPeriodicTick: def.periodic ? state.tick + def.periodic.everyTicks : null,
        attackerId: pending.attackerId,
        actionId: pending.actionId,
      };
    } else if (mode === 'ignore') {
      return false;
    } else if (mode === 'replace') {
      active.stacks = Math.min(maxStacks, pending.stacks);
      active.appliedTick = state.tick;
      active.expiresTick = state.tick + duration;
      active.nextPeriodicTick = def.periodic ? state.tick + def.periodic.everyTicks : null;
      active.attackerId = pending.attackerId;
      active.actionId = pending.actionId;
    } else if (mode === 'stack') {
      active.stacks = Math.min(maxStacks, active.stacks + pending.stacks);
      active.expiresTick = Math.max(active.expiresTick, state.tick + duration);
      if (active.attackerId == null) active.attackerId = pending.attackerId;
    } else {
      active.stacks = Math.min(maxStacks, Math.max(active.stacks, pending.stacks));
      active.expiresTick = state.tick + duration;
      if (active.attackerId == null) active.attackerId = pending.attackerId;
    }

    appendCombatTrace(state.combat, state.tick, 'status.applied', {
      actorId: pending.attackerId,
      targetId: targetEntity.id,
      statusId: def.id,
      stacks: active.stacks,
      expiresTick: active.expiresTick,
      cueId: def.cueId || null,
    });
    if (bus) bus.emit('combat:statusApplied', {
      attackerId: pending.attackerId,
      targetId: targetEntity.id,
      statusId: def.id,
      stacks: active.stacks,
      expiresTick: active.expiresTick,
      cueId: def.cueId || null,
    });

    for (const interaction of def.interactions || []) {
      if (!runtime.statuses[interaction.with]) continue;
      if (interaction.consumeWith) delete runtime.statuses[interaction.with];
      if (interaction.apply && interaction.apply !== def.id) {
        const interactionDef = catalog.statuses.get(interaction.apply);
        if (interactionDef) {
          applyActive(targetEntity, runtime, {
            id: interaction.apply,
            stacks: 1,
            durationTicks: interactionDef.durationTicks,
            attackerId: pending.attackerId,
            actionId: pending.actionId,
          });
        }
      }
    }
    return true;
  }

  return Object.freeze({ schedule, advance, clear });
}

function scalePacket(packet, scale) {
  const out = {
    channels: {},
    penetration: Number(packet && packet.penetration) || 0,
    impulse: packet && packet.impulse ? { ...packet.impulse } : null,
    heat: (Number(packet && packet.heat) || 0) * scale,
    statuses: (packet && packet.statuses || []).map((status) => ({ ...status })),
  };
  for (const [channel, amount] of Object.entries(packet && packet.channels || {})) out.channels[channel] = (Number(amount) || 0) * scale;
  return out;
}
