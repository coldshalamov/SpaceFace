import { selectHitSubsystem } from './geometry.js';
import { ensureCombatant, syncCombatantBounds } from './runtime.js';
import { damageSubsystem } from './subsystems.js';
import { appendCombatTrace } from './trace.js';
import { difficultyDamageScale } from '../data/difficulty.js';
import { combatFlag } from '../data/featureFlags.js';
import { recordImpulseProvenance } from './impulseKernel.js';
import {
  IMPULSE_TUMBLE_KIND,
  overwhelmsAttitudeControl,
  resolveTumbleEntry,
  resolveTumbleEntrySpin,
  resolveTumbleInertiaY,
  stableTumbleSpinSign,
  TUMBLE_ENTRY_DURATION_TICKS,
  TUMBLE_STATUS_ID,
} from './tumbleStatus.js';
import { verbAcceptsType } from '../data/interactionDescriptorCatalog.js';
import { isHostileToPlayer } from '../systems/scanner.js';
import { activeBulwarkProjectionFor } from '../systems/mediumEnemyRuntime.js';
import {
  currentPlayerRewardIdentity,
  readPlayerFirstHitTruth,
  writePlayerFirstHitTruth,
} from './rewardEligibility.js';

export function createDamageRouter(context, statusService, options = {}) {
  const { state, catalog, bus, helpers } = context;
  const physics = helpers && helpers.combatPhysics;
  const onKill = typeof options.onKill === 'function' ? options.onKill : null;

  // AI victims persist first-hit legal/reward provenance inside their existing data.ai world record,
  // so sector capture/rematerialization and Continue cannot turn later retaliation into pre-existing
  // hostility. Non-AI/local-only targets have no durable record and use this object-lifetime fallback.
  const playerDamageTruthByTarget = new WeakMap();

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
    const diffScale = difficultyInvariantDisablePacket(packet)
      ? 1
      : difficultyDamageScale(state, input && input.attackerId, input && input.targetId);
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
    // PQ-011: 'massSeed' joins the damageable deployed-device family (mine parity) — the anchor
    // is shootable in every phase by ordinary hostile fire; own-team fire stays gated by the
    // friendly-fire rule below, exactly like own mines.
    // PQ-015: damageable type-membership from the shared catalog (identical to the former
    // ship|station|drone|mine|massSeed literal). The allowAnyTarget bypass, dock/invuln/friendly-fire
    // layers below, and the 'target_not_damageable' reason string are ALL UNCHANGED.
    if (!packet.flags.allowAnyTarget && !verbAcceptsType('damage', target.type)) return rejected('target_not_damageable', input, packet);
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
    const projection = activeBulwarkProjectionFor(state, target);
    const projectedBy = projection && projection.source || null;
    const projectedShieldBefore = projectedBy ? Math.max(0, Number(projectedBy.shield) || 0) : 0;
    let projectedShieldDamage = 0;
    let shieldDamage = 0;

    for (const channel of model.channelOrder) {
      const raw = packet.channels[channel] || 0;
      penetratingRaw[channel] = raw * penetration;
      // The bypassed fraction skips the shield pool entirely.
      const bypassed = raw * shieldBypass;
      const normal = (raw - penetratingRaw[channel] - bypassed);
      const multiplier = positiveMultiplier(model.shieldMultipliers[channel]);
      // Plan 13 Bulwark projection is a real upstream shield pool. Its own current shield absorbs
      // ordinary shield-coupled damage before the wing member's pool; penetration and EMP bypass
      // still pass through. The damage router remains the only shield writer.
      const projectedPotentialHp = normal * multiplier;
      const projectedAbsorbedHp = projectedBy
        ? Math.min(Math.max(0, projectedBy.shield || 0), projectedPotentialHp)
        : 0;
      if (projectedBy) projectedBy.shield = Math.max(0, (projectedBy.shield || 0) - projectedAbsorbedHp);
      projectedShieldDamage += projectedAbsorbedHp;
      const projectedConsumedRaw = multiplier > 0 ? projectedAbsorbedHp / multiplier : 0;
      const afterProjection = Math.max(0, normal - projectedConsumedRaw);
      const potentialHp = afterProjection * multiplier;
      const absorbedHp = Math.min(Math.max(0, target.shield || 0), potentialHp);
      target.shield = Math.max(0, (target.shield || 0) - absorbedHp);
      shieldDamage += absorbedHp;
      const consumedRaw = multiplier > 0 ? absorbedHp / multiplier : 0;
      // The bypassed fraction (EMP coupling through the shield) passes onward to armor/hull.
      postShieldRaw[channel] = Math.max(0, afterProjection - consumedRaw) + bypassed;
    }
    if (projectedShieldDamage > 0) {
      projectedBy.lastDamageT = Number.isFinite(state.simTime) ? state.simTime : (state.tick || 0) / 60;
    }

    const shieldBroke = before.shield > 0 && target.shield <= 0;
    const projectedShieldBroke = !!projectedBy && projectedShieldBefore > 0 && projectedBy.shield <= 0;
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

    // PQ-015 component targeting: when the local player has sub-selected a serviceable combat
    // subsystem on their CURRENT target, their weapon hits concentrate on it (focus fire) by seeding
    // packet.hit.subsystemId, which selectHitSubsystem honors. Validated against the live runtime
    // (must exist and not be destroyed). Guarded to player fire on the locked target only, and skips
    // when a projectile already carries an explicit subsystemId — so NPC fire and the 47a golden
    // (which never populates state.ui.componentSelection) are byte-identical / determinism-safe.
    applySelectedComponentHit(state, input, target, runtime, packet);
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
    // Plan 14 heavy parents cannot be erased through the abstract hull while their authored
    // physical-part route is live. They bottom out at one hull and become disabled assets only
    // through the heavy-parts runtime's strip condition.
    const heavyLethalFloor = target.data && target.data.heavyPartsRuntime?.lethalLocked ? 1 : 0;
    hullDamage = Math.min(Math.max(0, (target.hull || 0) - heavyLethalFloor), hullDamage);
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

    const impulseResult = applyImpulse(target, attacker, packet, input, origin);
    syncCombatantBounds(target, runtime);
    const after = snapshotVitals(target, runtime);
    const totalApplied = projectedShieldDamage + shieldDamage + armorDamage + subsystemDamage + hullDamage;
    const result = {
      ok: true,
      attackerId: input && input.attackerId == null ? null : input.attackerId,
      targetId: target.id,
      rawTotal,
      totalApplied,
      shieldDamage,
      projectedShieldDamage,
      projectedById: projectedBy && projectedBy.id || null,
      armorDamage,
      hullDamage,
      hullByChannel,
      subsystemId,
      subsystemDamage,
      subsystemResult,
      heatApplied,
      shieldBroke,
      dominantLayer: hullDamage > 0 ? 'hull' : armorDamage > 0 ? 'armor' : (shieldDamage > 0 || projectedShieldDamage > 0) ? 'shield' : null,
      before,
      after,
      impulseApplied: impulseResult.applied,
      packet,
    };
    // Freeze canonical target truth on the player's first accepted hit for this victim lifetime.
    // Synchronous combat:damage listeners may grant retaliation authority, and later projectiles
    // must not reinterpret that self-defense response as pre-existing hostility. AI receipts travel
    // through world-record capture/save/rematerialization; the WeakMap is only for non-durable targets.
    // Non-player hits still publish current truth but never seed or replace player provenance.
    const playerId = state.playerId;
    const player = entity(playerId);
    const playerAttack = !!player && result.attackerId === playerId;
    const playerIdentity = playerAttack ? currentPlayerRewardIdentity(state, player) : null;
    const durableTruth = playerAttack ? readPlayerFirstHitTruth(target, playerIdentity) : null;
    const fallbackTruth = playerAttack && !durableTruth ? playerDamageTruthByTarget.get(target) : null;
    const frozenTruth = durableTruth || (
      fallbackTruth && fallbackTruth.playerIdentity === playerIdentity ? fallbackTruth : null
    );
    let factionLawful;
    let targetHostileToPlayer;
    if (frozenTruth) {
      factionLawful = frozenTruth.factionLawful;
      targetHostileToPlayer = frozenTruth.targetHostileToPlayer;
    } else {
      factionLawful = !!(target.data && target.data.ai && target.data.ai.lawful);
      targetHostileToPlayer = !!isHostileToPlayer(target, player && player.team, state);
      if (playerAttack) {
        const durableRecord = writePlayerFirstHitTruth(
          target,
          playerIdentity,
          factionLawful,
          targetHostileToPlayer,
        );
        if (!durableRecord) {
          playerDamageTruthByTarget.set(target, Object.freeze({
            playerIdentity,
            factionLawful,
            targetHostileToPlayer,
          }));
        }
      }
    }

    appendCombatTrace(state.combat, state.tick, 'damage.routed', {
      actorId: result.attackerId,
      targetId: target.id,
      origin,
      rawTotal,
      applied: totalApplied,
      shieldDamage,
      projectedShieldDamage,
      projectedById: projectedBy && projectedBy.id || null,
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
    if (projectedShieldBroke && bus) bus.emit('shieldDown', {
      combatantId: projectedBy.id,
      pos: projectedBy.pos,
      reason: 'wing_projection_depleted',
    });
    if (bus) {
      if (projectedShieldDamage > 0) bus.emit('combat:projectedShieldHit', {
        sourceId: projectedBy.id,
        targetId: target.id,
        attackerId: result.attackerId,
        absorbed: projectedShieldDamage,
        brokeShield: projectedShieldBroke,
        cueId: 'medium.bulwark.link.hit',
      });
      bus.emit('combat:damage', {
        targetId: target.id,
        attackerId: result.attackerId,
        amount: rawTotal,
        rawTotal,
        applied: totalApplied,
        type: dominantChannel(packet.channels, model.channelOrder),
        channels: { ...packet.channels },
        shieldDamage,
        projectedShieldDamage,
        projectedById: projectedBy && projectedBy.id || null,
        armorDamage,
        hullDamage,
        subsystemDamage,
        before,
        after,
        shieldHit: shieldDamage > 0 || projectedShieldDamage > 0,
        armorHit: armorDamage > 0,
        hullHit: hullDamage > 0,
        dominantLayer: result.dominantLayer,
        brokeShield: shieldBroke,
        shieldAbsorbed: shieldDamage > 0 || projectedShieldDamage > 0,
        isPlayer: target.id === state.playerId,
        pos: packet.hit && packet.hit.pos || { x: target.pos.x, z: target.pos.z },
        approach: packet.hit && packet.hit.approach || null,
        normal: packet.hit && packet.hit.normal || null,
        factionId: target.factionId || null,
        factionLawful,
        targetHostileToPlayer,
        subsystemId,
        origin,
        weaponId: origin && origin.kind === 'weapon' ? (origin.weaponId || origin.id || null) : null,
      });
    }

    if (before.hull > 0 && target.hull <= 0) {
      if (target.type === 'heavyPart' && bus) {
        // The part runtime converts this exact child into debris synchronously. It deliberately
        // bypasses combat.kill, so no bounty, loot, AI death roster, or aftermath marker fires.
        bus.emit('heavyPart:lethal', {
          targetId: target.id,
          attackerId: result.attackerId,
          origin,
          packet,
          result,
        });
      } else if (onKill) onKill(target, result.attackerId, {
        origin,
        packet,
        result,
        factionLawful,
        targetHostileToPlayer,
      });
      else fallbackKill(target, result.attackerId);
    }
    return result;
  }

  function difficultyInvariantDisablePacket(packet) {
    // The canonical EMP is a non-lethal capability verb, tuned to the 45-point starter drive.
    // Scaling its pure subsystem packet turns the Fulfillment's authored stop-and-board route into
    // an effectively unreachable multi-hit lottery. Keep the authored 45 damage—never a boosted
    // shortcut—while ordinary hull, heat, mixed-ion, and legacy packets retain difficulty scaling.
    const channels = packet && packet.channels;
    return packet && channels && packet.subsystemShare === 1 && packet.shieldBypass === 1
      && packet.source && packet.source.kind === 'weapon'
      && packet.source.weaponId === 'wpn_emp_disruptor_m'
      && channels.kinetic === 0 && channels.thermal === 0
      && channels.plasma === 0 && channels.phase === 0;
  }

  function applyImpulse(target, attacker, packet, input, origin) {
    const tag = packet.source && packet.source.impulseProvenance || null;
    if (tag && !combatFlag('weaponImpulseConsequences')) {
      return { applied: false, reason: 'weapon_impulse_disabled' };
    }
    const vector = resolveImpulseVector(target, attacker, packet.impulse, packet.hit);
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
      const weaponId = packet.source && packet.source.weaponId
        || (origin && origin.kind === 'weapon' && (origin.weaponId || origin.id)) || null;
      const provenance = tag ? {
        actorId: input && input.attackerId == null ? null : input.attackerId,
        weaponId,
        tag,
        appliedTick: state.tick,
      } : null;
      const reason = tag ? 'weapon_hit' : 'damage';
      const accepted = physics.applyImpulse({
        entityId: target.id,
        impulse: vector,
        point: input && input.packet && input.packet.hit && input.packet.hit.pos || null,
        reason,
        tick: state.tick,
        provenance,
      });
      if (accepted === false) return { applied: false, reason: 'physics_rejected' };
      let torqueApplied = false;
      const torqueY = resolveTumbleTorque(target, vector, packet.tumbleTorque, packet.hit);
      if (torqueY && typeof physics.applyTorqueImpulse === 'function') {
        torqueApplied = physics.applyTorqueImpulse({
          entityId: target.id,
          impulse: { x: 0, y: torqueY, z: 0 },
          reason: tag ? 'weapon_hit_tumble' : 'damage_tumble',
          tick: state.tick,
          provenance,
        }) !== false;
      }
      if (provenance) {
        recordImpulseProvenance(target, { ...provenance, magnitude: Math.hypot(vector.x, vector.z) });
      }
      // AC-04: an authored impulse this body cannot hold enters the SAME first-class tumble state as
      // a contact or Massline tumble. Threshold and entry-spin band are the shared physical ones; the
      // make-up torque still crosses this port, so no parallel physics implementation appears here.
      const tumble = enterImpulseTumble(target, vector, packet, input, torqueY, weaponId, tag);
      appendCombatTrace(state.combat, state.tick, 'physics.impulse', {
        actorId: input && input.attackerId,
        targetId: target.id,
        impulse: vector,
        reason,
        weaponId,
        provenance: tag,
        torqueApplied,
        tumbleEntered: !!tumble,
      });
      return { applied: true, impulse: vector, torqueApplied, tumble };
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

  /**
   * AC-04 — a direct authored impulse enters the canonical tumble state only from a deterministic,
   * physical threshold: the delta-v this impulse actually imparts to THIS hull's mass. The same
   * impulse that flips a light swarmer therefore leaves a heavy hull merely shoved, with no global
   * difficulty knob anywhere in the path. Returns the entry receipt, or null when refused.
   */
  function enterImpulseTumble(target, vector, packet, input, authoredTorqueY, weaponId, tag) {
    if (!combatFlag('weaponImpulseConsequences')) return null;
    if (!target || target.alive === false) return null;
    if (target.id === state.playerId) return null;                       // players never tumble
    if (target.type !== 'ship' && target.type !== 'drone') return null;  // rocks/stations don't flail
    const mass = Math.max(0.1, Number(target.mass) || 1);
    const deltaV = Math.hypot(vector.x, vector.z) / mass;
    if (!overwhelmsAttitudeControl(deltaV)) return null;

    const tick = Math.max(0, Math.trunc(Number(state.tick) || 0));
    const entry = resolveTumbleEntry(state, target, {
      kind: IMPULSE_TUMBLE_KIND,
      durationTicks: TUMBLE_ENTRY_DURATION_TICKS,
      tick,
    });
    // Refused: this hull already tumbles from an authored impulse. A sustained beam past the
    // threshold must not restart its own spin every tick.
    if (!entry) return null;

    const runtime = ensureCombatant(state, target, catalog);
    const now = Number.isFinite(state.simTime) ? state.simTime : tick / 60;
    const spin = resolveTumbleEntrySpin(deltaV, Number(target.radius) || 1);
    const scheduled = statusService.schedule(target, runtime, {
      id: TUMBLE_STATUS_ID,
      stacks: 1,
      durationTicks: entry.durationTicks,
      applyTick: tick + 1,
      data: {
        kind: entry.kind,
        source: entry.source,
        cause: tag || weaponId || 'impulse',
        startedAt: now,
        until: now + entry.durationTicks / 60,
        spin,
      },
    }, { attackerId: input && input.attackerId == null ? null : input.attackerId, actionId: null });
    if (!(scheduled && scheduled.ok)) return null;

    // Real angular physics through the existing port: entry torque is inertia × Δω, so a wide, heavy
    // hull demands proportionally more of it. Whatever the weapon's authored per-hit tumbleTorque
    // already delivered counts toward the entry spin; this only queues the shortfall, and never
    // reduces or reverses an authored torque that already exceeds it.
    const inertia = resolveTumbleInertiaY(target);
    const sign = authoredTorqueY
      ? Math.sign(authoredTorqueY)
      : (impulseLeverSign(target, vector, packet.hit) || stableTumbleSpinSign(target.id));
    const makeupY = sign * inertia * spin - (Number(authoredTorqueY) || 0);
    let entryTorqueApplied = false;
    if (sign * makeupY > 1e-9 && typeof physics.applyTorqueImpulse === 'function') {
      entryTorqueApplied = physics.applyTorqueImpulse({
        entityId: target.id,
        impulse: { x: 0, y: makeupY, z: 0 },
        reason: 'weapon_impulse_tumble_entry',
        tick: state.tick,
        provenance: {
          actorId: input && input.attackerId == null ? null : input.attackerId,
          weaponId: weaponId || null,
          tag: tag || null,
          appliedTick: state.tick,
        },
      }) !== false;
    }
    appendCombatTrace(state.combat, state.tick, 'tumble.entered', {
      actorId: input && input.attackerId,
      targetId: target.id,
      kind: entry.kind,
      source: entry.source,
      deltaV,
      spin,
      durationTicks: entry.durationTicks,
      entryTorqueApplied,
    });
    return { kind: entry.kind, source: entry.source, deltaV, spin, durationTicks: entry.durationTicks };
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

// PQ-015: seed the selected combat subsystem as the hit target for player focus-fire. Pure guard,
// no writes to sim state beyond the transient packet it was handed. See routeDamage call site.
function applySelectedComponentHit(state, input, target, runtime, packet) {
  const attackerId = input && input.attackerId;
  if (attackerId == null || state == null || attackerId !== state.playerId) return;
  const player = state.player;
  if (!player || target.id !== player.targetId) return;
  const sel = state.ui && state.ui.componentSelection;
  if (!sel || sel.kind !== 'subsystem' || sel.targetId !== target.id || sel.componentId == null) return;
  if (packet.hit && packet.hit.subsystemId != null) return; // never override an explicit projectile hit
  const sub = runtime && runtime.subsystems ? runtime.subsystems[sel.componentId] : null;
  if (!sub || sub.destroyed) return; // not serviceable → fall back to geometric selection (truthful)
  if (!packet.hit) packet.hit = {};
  packet.hit.subsystemId = sel.componentId;
}

export function normalizeDamagePacket(packet = {}, channelOrder = ['kinetic', 'thermal', 'ion', 'plasma', 'phase']) {
  const channels = emptyChannels(channelOrder);
  for (const channel of channelOrder) channels[channel] = finiteNonNegative(packet.channels && packet.channels[channel]);
  return {
    schemaVersion: 1,
    channels,
    penetration: clamp01(Number(packet.penetration) || 0),
    impulse: normalizeImpulse(packet.impulse),
    tumbleTorque: finiteNonNegative(packet.tumbleTorque),
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

export function scalarHitToDamagePacket({ damage = 0, damageType = 'kinetic', pos = null, penetration = 0, impulse = null, tumbleTorque = 0, heat = 0, statuses = [], source = null, subsystemShare = null, shieldBypass = 0 } = {}) {
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
    tumbleTorque: Math.max(0, Number(tumbleTorque) || 0),
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

function resolveImpulseVector(target, attacker, impulse, hit) {
  if (!impulse) return null;
  if (Number.isFinite(impulse.x) || Number.isFinite(impulse.z)) {
    const x = Number(impulse.x) || 0, z = Number(impulse.z) || 0;
    return x || z ? { x, z } : null;
  }
  const magnitude = Math.max(0, Number(impulse.magnitude) || 0);
  if (!(magnitude > 0)) return null;
  let dx = Number(impulse.dirX), dz = Number(impulse.dirZ);
  if ((!Number.isFinite(dx) || !Number.isFinite(dz)) && hit && hit.approach) {
    dx = Number(hit.approach.x);
    dz = Number(hit.approach.z);
  }
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) {
    dx = (target.pos && target.pos.x || 0) - (attacker && attacker.pos && attacker.pos.x || 0);
    dz = (target.pos && target.pos.z || 0) - (attacker && attacker.pos && attacker.pos.z || 0);
  }
  const length = Math.hypot(dx, dz) || 1;
  return { x: dx / length * magnitude, z: dz / length * magnitude };
}

// Sign of the angular lever an off-centre impulse applies, matching resolveTumbleTorque's
// convention. Returns 0 when the hit carries no usable position, so the caller can fall back to a
// stable per-entity parity instead of an arbitrary direction.
function impulseLeverSign(target, impulse, hit) {
  if (!hit || !hit.pos || !target || !target.pos) return 0;
  const rx = (Number(hit.pos.x) || 0) - (Number(target.pos.x) || 0);
  const rz = (Number(hit.pos.z) || 0) - (Number(target.pos.z) || 0);
  const cross = rz * impulse.x - rx * impulse.z;
  return Math.abs(cross) > 1e-9 ? Math.sign(cross) : 0;
}

function resolveTumbleTorque(target, impulse, authoredTorque, hit) {
  const torque = Math.max(0, Number(authoredTorque) || 0);
  if (!(torque > 0) || !hit || !hit.pos || !target || !target.pos) return 0;
  const magnitude = Math.hypot(impulse.x, impulse.z);
  if (!(magnitude > 1e-9)) return 0;
  const radius = Math.max(0.1, Number(target.radius) || 1);
  const rx = (Number(hit.pos.x) || 0) - (Number(target.pos.x) || 0);
  const rz = (Number(hit.pos.z) || 0) - (Number(target.pos.z) || 0);
  const cross = (rz * impulse.x - rx * impulse.z) / (radius * magnitude);
  return torque * Math.max(-1, Math.min(1, cross));
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
