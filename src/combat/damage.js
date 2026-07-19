import { selectHitSubsystem } from './geometry.js';
import { ensureCombatant, syncCombatantBounds } from './runtime.js';
import { damageSubsystem } from './subsystems.js';
import { appendCombatTrace } from './trace.js';
import { difficultyDamageScale } from '../data/difficulty.js';

export function createDamageRouter(context, statusService, options = {}) {
  const { state, catalog, bus, helpers } = context;
  const physics = helpers && helpers.combatPhysics;
  const onKill = typeof options.onKill === 'function' ? options.onKill : null;

  // Reusable scratch channel objects for routeDamage. routeDamage is non-reentrant within a router
  // (damage routing never synchronously triggers another route), so six stable slots cover the full
  // coexisting lifetime of the transient channel buffers: penetratingRaw, postShieldRaw, postFlatRaw,
  // terminalRaw, subsystemInput, hullInput. (hullByChannel is intentionally still allocated — it is
  // returned in the result object.) This removes ~6 small-object allocations per projectile hit,
  // which is the dominant per-hit GC pressure during firefights. Arithmetic is unchanged: the *Into
  // helpers produce byte-identical channel values in the same iteration order.
  const ROUTE_SCRATCH = [{}, {}, {}, {}, {}, {}];

  function routeDamage(input) {
    const packet = normalizeDamagePacket(input && input.packet, catalog.damageModel.channelOrder);
    // Run difficulty only scales hits involving the local player (outgoing or incoming). Ambient
    // NPC brawls stay on the authored baseline so sector ecology is not difficulty-rewritten.
    const diffScale = difficultyDamageScale(state, input && input.attackerId, input && input.targetId);
    if (diffScale !== 1) {
      for (const channel of catalog.damageModel.channelOrder) {
        packet.channels[channel] = (packet.channels[channel] || 0) * diffScale;
      }
      packet.heat = (packet.heat || 0) * diffScale;
    }
    const target = entity(input && input.targetId);
    const attacker = entity(input && input.attackerId);
    const origin = input && input.origin || null;
    const rawTotal = sumChannels(packet.channels);

    if (!target || !target.alive) return rejected('target_missing', input, packet);
    if (!packet.flags.allowAnyTarget && !['ship', 'station', 'drone', 'mine'].includes(target.type)) return rejected('target_not_damageable', input, packet);
    if (!packet.flags.ignoreInvulnerability && playerDockProtected(state, target)) return rejected('target_docked', input, packet);
    if (target.flags && target.flags.invuln && !packet.flags.ignoreInvulnerability) return rejected('target_invulnerable', input, packet);
    if (!packet.flags.ignoreFriendlyFire && attacker && attacker.id !== target.id && attacker.team != null && target.team != null && attacker.team === target.team) {
      return rejected('friendly_fire', input, packet);
    }
    if (!(rawTotal > 0) && !(packet.heat > 0) && !packet.statuses.length && !hasImpulse(packet.impulse)) return rejected('empty_packet', input, packet);

    const runtime = ensureCombatant(state, target, catalog);
    const before = snapshotVitals(target, runtime);
    const model = catalog.damageModel;
    const penetration = clamp01(packet.penetration);
    // Shield bypass (EMP/disable verb, spec §9): a fraction of the damage couples through the
    // shield directly to armor/hull/subsystems. 1.0 = shields ignored entirely.
    const shieldBypass = clamp01(Number(packet.shieldBypass) || 0);
    // Scratch slots: [0]=penetratingRaw, [1]=postShieldRaw, [2]=postFlatRaw, [3]=terminalRaw,
    // [4]=subsystemInput, [5]=hullInput. Zeroed across the active channel order before each use.
    const penetratingRaw = emptyChannelsInto(model.channelOrder, ROUTE_SCRATCH[0]);
    const postShieldRaw = emptyChannelsInto(model.channelOrder, ROUTE_SCRATCH[1]);
    let shieldDamage = 0;

    for (const channel of model.channelOrder) {
      const raw = packet.channels[channel] || 0;
      penetratingRaw[channel] = raw * penetration;
      // The bypassed fraction skips the shield pool entirely.
      const bypassed = raw * shieldBypass;
      const normal = (raw - penetratingRaw[channel] - bypassed);
      const multiplier = positiveMultiplier(model.shieldMultipliers[channel]);
      const potentialHp = normal * multiplier;
      const absorbedHp = Math.min(Math.max(0, target.shield || 0), potentialHp);
      target.shield = Math.max(0, (target.shield || 0) - absorbedHp);
      shieldDamage += absorbedHp;
      const consumedRaw = multiplier > 0 ? absorbedHp / multiplier : 0;
      // The bypassed fraction (EMP coupling through the shield) passes onward to armor/hull.
      postShieldRaw[channel] = Math.max(0, normal - consumedRaw) + bypassed;
    }

    const shieldBroke = before.shield > 0 && target.shield <= 0;
    const postFlatRaw = applyArmorFlatInto(postShieldRaw, Math.max(0, Number(target.armorFlat) || 0), model.channelOrder, ROUTE_SCRATCH[2]);
    const terminalRaw = emptyChannelsInto(model.channelOrder, ROUTE_SCRATCH[3]);
    let armorDamage = 0;
    for (const channel of model.channelOrder) {
      const raw = postFlatRaw[channel] || 0;
      const multiplier = positiveMultiplier(model.armorMultipliers[channel]);
      const potentialHp = raw * multiplier;
      const absorbedHp = Math.min(Math.max(0, target.armorHp || 0), potentialHp);
      target.armorHp = Math.max(0, (target.armorHp || 0) - absorbedHp);
      armorDamage += absorbedHp;
      const consumedRaw = multiplier > 0 ? absorbedHp / multiplier : 0;
      terminalRaw[channel] = Math.max(0, raw - consumedRaw) + penetratingRaw[channel];
    }

    const subsystemId = selectHitSubsystem(target, runtime, catalog, packet.hit || {});
    const subsystemShare = subsystemId ? clamp01(packet.subsystemShare == null ? model.subsystemShare : packet.subsystemShare) : 0;
    const subsystemInput = scaleChannelsInto(terminalRaw, subsystemShare, model.channelOrder, ROUTE_SCRATCH[4]);
    const hullInput = scaleChannelsInto(terminalRaw, 1 - subsystemShare, model.channelOrder, ROUTE_SCRATCH[5]);
    const subsystemInputTotal = sumChannels(subsystemInput);
    let subsystemResult = null;
    let subsystemDamage = 0;
    if (subsystemId && subsystemInputTotal > 0) {
      context.currentAttackerId = input && input.attackerId;
      subsystemResult = damageSubsystem(context, target, runtime, subsystemId, subsystemInputTotal, subsystemInput, penetration);
      context.currentAttackerId = null;
      subsystemDamage = subsystemResult.applied;
      if (subsystemResult.overflow > 0) addProportional(hullInput, subsystemInput, subsystemResult.overflow, model.channelOrder);
    }

    const damageReduction = clamp(Number(target.data && target.data.derived && target.data.derived.damageReductionMult) || 1, 0, 1);
    let hullDamage = 0;
    const hullByChannel = emptyChannels(model.channelOrder);
    for (const channel of model.channelOrder) {
      const applied = (hullInput[channel] || 0) * positiveMultiplier(model.hullMultipliers[channel]) * damageReduction;
      hullByChannel[channel] = applied;
      hullDamage += applied;
    }
    hullDamage = Math.min(Math.max(0, target.hull || 0), hullDamage);
    target.hull = Math.max(0, (target.hull || 0) - hullDamage);
    target.lastDamageT = Number.isFinite(state.simTime) ? state.simTime : (state.tick || 0) / 60;

    const heatBefore = runtime.heat;
    runtime.heat = clamp(runtime.heat + packet.heat, 0, runtime.heatMax);
    const heatApplied = runtime.heat - heatBefore;
    for (const status of packet.statuses) {
      statusService.schedule(target, runtime, status, {
        attackerId: input && input.attackerId,
        actionId: origin && origin.kind === 'action' ? origin.id : null,
      });
    }

    const impulseResult = applyImpulse(target, attacker, packet.impulse, input);
    syncCombatantBounds(target, runtime);
    const after = snapshotVitals(target, runtime);
    const totalApplied = shieldDamage + armorDamage + subsystemDamage + hullDamage;
    const result = {
      ok: true,
      attackerId: input && input.attackerId == null ? null : input.attackerId,
      targetId: target.id,
      rawTotal,
      totalApplied,
      shieldDamage,
      armorDamage,
      hullDamage,
      hullByChannel,
      subsystemId,
      subsystemDamage,
      subsystemResult,
      heatApplied,
      shieldBroke,
      dominantLayer: hullDamage > 0 ? 'hull' : armorDamage > 0 ? 'armor' : shieldDamage > 0 ? 'shield' : null,
      before,
      after,
      impulseApplied: impulseResult.applied,
      packet,
    };

    appendCombatTrace(state.combat, state.tick, 'damage.routed', {
      actorId: result.attackerId,
      targetId: target.id,
      origin,
      rawTotal,
      applied: totalApplied,
      shieldDamage,
      armorDamage,
      hullDamage,
      subsystemId,
      subsystemDamage,
      penetration,
      heatApplied,
      shieldBroke,
      before,
      after,
      channels: packet.channels,
    });

    if (shieldBroke && bus) bus.emit('shieldDown', { combatantId: target.id, pos: packet.hit && packet.hit.pos || target.pos });
    if (bus) {
      const factionLawful = !!(target.data && target.data.ai && target.data.ai.lawful);
      bus.emit('combat:damage', {
        targetId: target.id,
        attackerId: result.attackerId,
        amount: rawTotal,
        rawTotal,
        applied: totalApplied,
        type: dominantChannel(packet.channels, model.channelOrder),
        channels: { ...packet.channels },
        shieldDamage,
        armorDamage,
        hullDamage,
        subsystemDamage,
        before,
        after,
        shieldHit: shieldDamage > 0,
        armorHit: armorDamage > 0,
        hullHit: hullDamage > 0,
        dominantLayer: result.dominantLayer,
        brokeShield: shieldBroke,
        shieldAbsorbed: shieldDamage > 0,
        isPlayer: target.id === state.playerId,
        pos: packet.hit && packet.hit.pos || { x: target.pos.x, z: target.pos.z },
        approach: packet.hit && packet.hit.approach || null,
        normal: packet.hit && packet.hit.normal || null,
        factionId: target.factionId || null,
        factionLawful,
        subsystemId,
        origin,
        weaponId: origin && origin.kind === 'weapon' ? (origin.weaponId || origin.id || null) : null,
      });
    }

    if (before.hull > 0 && target.hull <= 0) {
      if (onKill) onKill(target, result.attackerId, { origin, packet, result });
      else fallbackKill(target, result.attackerId);
    }
    return result;
  }

  function applyImpulse(target, attacker, impulse, input) {
    const vector = resolveImpulseVector(target, attacker, impulse);
    if (!vector) return { applied: false, reason: 'none' };
    if (!physics || typeof physics.applyImpulse !== 'function') {
      appendCombatTrace(state.combat, state.tick, 'physics.portMissing', {
        actorId: input && input.attackerId,
        targetId: target.id,
        operation: 'applyImpulse',
      });
      return { applied: false, reason: 'physics_port_unavailable' };
    }
    try {
      const accepted = physics.applyImpulse({
        entityId: target.id,
        impulse: vector,
        point: input && input.packet && input.packet.hit && input.packet.hit.pos || null,
        reason: 'damage',
        tick: state.tick,
      });
      if (accepted === false) return { applied: false, reason: 'physics_rejected' };
      appendCombatTrace(state.combat, state.tick, 'physics.impulse', {
        actorId: input && input.attackerId,
        targetId: target.id,
        impulse: vector,
        reason: 'damage',
      });
      return { applied: true, impulse: vector };
    } catch (error) {
      appendCombatTrace(state.combat, state.tick, 'physics.error', {
        actorId: input && input.attackerId,
        targetId: target.id,
        operation: 'applyImpulse',
        error: String(error && error.message || error),
      });
      return { applied: false, reason: 'physics_error' };
    }
  }

  function fallbackKill(target, killerId) {
    target.alive = false;
    if (bus) bus.emit('entity:killed', {
      id: target.id,
      killerId,
      type: target.type,
      pos: { x: target.pos.x, z: target.pos.z },
      factionId: target.factionId || null,
      victimClass: target.data && target.data.shipClass || target.type,
    });
  }

  function rejected(reason, input, packet) {
    appendCombatTrace(state.combat, state.tick, 'damage.rejected', {
      actorId: input && input.attackerId == null ? null : input.attackerId,
      targetId: input && input.targetId == null ? null : input.targetId,
      reason,
      channels: packet.channels,
    });
    return { ok: false, reason, packet };
  }

  function entity(id) {
    return state.entities && state.entities.get ? state.entities.get(id) || null : null;
  }

  return routeDamage;
}

export function normalizeDamagePacket(packet = {}, channelOrder = ['kinetic', 'thermal', 'ion', 'plasma', 'phase']) {
  const channels = emptyChannels(channelOrder);
  for (const channel of channelOrder) channels[channel] = finiteNonNegative(packet.channels && packet.channels[channel]);
  return {
    schemaVersion: 1,
    channels,
    penetration: clamp01(Number(packet.penetration) || 0),
    impulse: normalizeImpulse(packet.impulse),
    heat: finiteNonNegative(packet.heat),
    statuses: Array.isArray(packet.statuses) ? packet.statuses
      .filter((status) => status && typeof status.id === 'string')
      .map((status) => ({ id: status.id, stacks: Math.max(1, Math.floor(status.stacks || 1)), durationTicks: integerOrUndefined(status.durationTicks) })) : [],
    hit: normalizeHit(packet.hit),
    subsystemShare: packet.subsystemShare == null ? null : clamp01(Number(packet.subsystemShare) || 0),
    shieldBypass: clamp01(Number(packet.shieldBypass) || 0),
    flags: packet.flags && typeof packet.flags === 'object' ? { ...packet.flags } : {},
    source: packet.source && typeof packet.source === 'object' ? { ...packet.source } : null,
  };
}

export function scalarHitToDamagePacket({ damage = 0, damageType = 'kinetic', pos = null, penetration = 0, impulse = null, heat = 0, statuses = [], source = null, subsystemShare = null, shieldBypass = 0 } = {}) {
  const amount = Math.max(0, Number(damage) || 0);
  const channels = { kinetic: 0, thermal: 0, ion: 0, plasma: 0, phase: 0 };
  switch (damageType) {
    case 'kinetic': channels.kinetic = amount; break;
    case 'thermal': channels.thermal = amount; break;
    case 'ion': channels.ion = amount; break;
    case 'plasma': channels.plasma = amount; break;
    case 'phase': channels.phase = amount; break;
    case 'energy': channels.thermal = amount * 0.72; channels.ion = amount * 0.28; break;
    case 'explosive': channels.kinetic = amount * 0.65; channels.thermal = amount * 0.35; break;
    // EMP (spec §9): pure ion disruption — couples through shields to fry subsystems. The weapon's
    // subsystemShare routes this to components (drive/weapon/power), not the hull.
    case 'emp': channels.ion = amount; break;
    default: channels.thermal = amount; break;
  }
  return {
    channels,
    penetration: clamp01(Number(penetration) || 0),
    impulse,
    heat: Math.max(0, Number(heat) || 0),
    statuses,
    hit: pos ? { pos: { x: Number(pos.x) || 0, z: Number(pos.z) || 0 } } : null,
    source: source && typeof source === 'object' ? { ...source } : null,
    // Subsystem-targeting + shield coupling (EMP/disable verb, spec §9). subsystemShare 1.0 = all
    // damage to components; shieldBypass 1.0 = ignores shields entirely.
    subsystemShare: subsystemShare == null ? null : clamp01(Number(subsystemShare) || 0),
    shieldBypass: clamp01(Number(shieldBypass) || 0),
  };
}

export function legacyHitToDamagePacket(input = {}) {
  return scalarHitToDamagePacket(input);
}

function applyArmorFlat(channels, flat, order) {
  const total = sumChannels(channels);
  if (!(total > 0) || !(flat > 0)) return { ...channels };
  const remaining = Math.max(0, total - Math.min(total, flat));
  return scaleChannels(channels, remaining / total, order);
}

// Allocation-free variants of the channel helpers above. The damage router is called once per
// projectile hit and previously allocated ~6 transient channel objects per call (postShieldRaw,
// penetratingRaw, postFlatRaw, terminalRaw, subsystemInput, hullInput). These *Into helpers write
// into a caller-provided target object that is zeroed across the active channel order first, so the
// arithmetic is byte-identical to the allocating versions (same values, same iteration order). The
// caller owns a small pool of stable scratch channel objects (see ROUTE_SCRATCH below) so no per-hit
// garbage is produced.
function emptyChannelsInto(order, target) {
  for (const channel of order) target[channel] = 0;
  return target;
}

function scaleChannelsInto(channels, scale, order, target) {
  for (const channel of order) target[channel] = Math.max(0, (channels[channel] || 0) * scale);
  return target;
}

// Replicates applyArmorFlat's arithmetic but writes into `target` instead of allocating. When there
// is no flat armor to apply, the result is a copy of the input channels (same as the allocating
// path's `{ ...channels }`), realized here by copying each channel value into the target.
function applyArmorFlatInto(channels, flat, order, target) {
  const total = sumChannels(channels);
  if (!(total > 0) || !(flat > 0)) {
    for (const channel of order) target[channel] = channels[channel] || 0;
    return target;
  }
  const remaining = Math.max(0, total - Math.min(total, flat));
  return scaleChannelsInto(channels, remaining / total, order, target);
}

function addProportional(target, weights, amount, order) {
  const total = sumChannels(weights);
  if (!(amount > 0)) return target;
  if (!(total > 0)) {
    target.kinetic = (target.kinetic || 0) + amount;
    return target;
  }
  for (const channel of order) target[channel] = (target[channel] || 0) + amount * ((weights[channel] || 0) / total);
  return target;
}

function resolveImpulseVector(target, attacker, impulse) {
  if (!impulse) return null;
  if (Number.isFinite(impulse.x) || Number.isFinite(impulse.z)) {
    const x = Number(impulse.x) || 0, z = Number(impulse.z) || 0;
    return x || z ? { x, z } : null;
  }
  const magnitude = Math.max(0, Number(impulse.magnitude) || 0);
  if (!(magnitude > 0)) return null;
  let dx = Number(impulse.dirX), dz = Number(impulse.dirZ);
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) {
    dx = (target.pos && target.pos.x || 0) - (attacker && attacker.pos && attacker.pos.x || 0);
    dz = (target.pos && target.pos.z || 0) - (attacker && attacker.pos && attacker.pos.z || 0);
  }
  const length = Math.hypot(dx, dz) || 1;
  return { x: dx / length * magnitude, z: dz / length * magnitude };
}

function normalizeImpulse(impulse) {
  if (!impulse || typeof impulse !== 'object') return null;
  if (Number.isFinite(impulse.x) || Number.isFinite(impulse.z)) return { x: Number(impulse.x) || 0, z: Number(impulse.z) || 0 };
  return {
    magnitude: Math.max(0, Number(impulse.magnitude) || 0),
    dirX: Number.isFinite(impulse.dirX) ? impulse.dirX : undefined,
    dirZ: Number.isFinite(impulse.dirZ) ? impulse.dirZ : undefined,
  };
}

function normalizeHit(hit) {
  if (!hit || typeof hit !== 'object') return null;
  const out = {};
  if (hit.pos) out.pos = { x: Number(hit.pos.x) || 0, z: Number(hit.pos.z) || 0 };
  const approach = normalizeHitDirection(hit.approach);
  const normal = normalizeHitDirection(hit.normal);
  if (approach) out.approach = approach;
  if (normal) out.normal = normal;
  if (typeof hit.subsystemId === 'string') out.subsystemId = hit.subsystemId;
  return Object.keys(out).length ? out : null;
}

function normalizeHitDirection(value) {
  if (!value || typeof value !== 'object') return null;
  const x = Number(value.x) || 0;
  const z = Number(value.z) || 0;
  const length = Math.hypot(x, z);
  if (length < 1e-8) return null;
  return { x: x / length, z: z / length };
}

function snapshotVitals(entity, runtime) {
  return {
    shield: Math.max(0, Number(entity.shield) || 0),
    shieldMax: Math.max(0, Number(entity.shieldMax) || 0),
    armor: Math.max(0, Number(entity.armorHp) || 0),
    armorMax: Math.max(0, Number(entity.armorMax) || 0),
    hull: Math.max(0, Number(entity.hull) || 0),
    hullMax: Math.max(0, Number(entity.hullMax) || 0),
    heat: Math.max(0, Number(runtime && runtime.heat) || 0),
  };
}

function dominantChannel(channels, order) {
  let best = order[0], amount = -1;
  for (const channel of order) if ((channels[channel] || 0) > amount) { amount = channels[channel] || 0; best = channel; }
  return best;
}

function emptyChannels(order) {
  const out = {};
  for (const channel of order) out[channel] = 0;
  return out;
}

function scaleChannels(channels, scale, order) {
  const out = {};
  for (const channel of order) out[channel] = Math.max(0, (channels[channel] || 0) * scale);
  return out;
}

function sumChannels(channels) {
  let sum = 0;
  for (const amount of Object.values(channels || {})) if (amount > 0 && Number.isFinite(amount)) sum += amount;
  return sum;
}

function positiveMultiplier(value) {
  return Number.isFinite(value) ? Math.max(0.000001, value) : 1;
}

function finiteNonNegative(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function integerOrUndefined(value) {
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function hasImpulse(impulse) {
  return !!resolveImpulseVector({ pos: { x: 0, z: 0 } }, null, impulse);
}

function playerDockProtected(state, target) {
  if (!state || !target || target.id !== state.playerId) return false;
  if (target.flags && target.flags.docked) return true;
  return !!(state.ui && state.ui.docked);
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
