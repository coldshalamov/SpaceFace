import { entityLocalPointToWorld, socketLocalPosition, socketWorldPosition, worldPointToEntityLocal } from './geometry.js';
import { ensureCombatant, entityKey } from './runtime.js';
import { appendCombatTrace } from './trace.js';
import { createMasslineRuntime, stepMassline } from '../core/constraints/masslineController.js';
import { SIM_DT } from '../core/sim.js';
import { massline2Flag } from '../data/featureFlags.js';

// Production action_attach envelope. Its ordinary endpoints share the fail-closed durability
// contract; only 47-A's explicitly marked false-mass spindle uses this legacy break envelope.
const LEGACY_47A_MASSLINE_BREAK = Object.freeze({ maxTension: 175, maxImpulse: 112.5, graceTicks: 1 });
const STANDARD_TETHER_STRENGTH_REVISION = 2;
const PREVIOUS_STANDARD_TETHER_BREAK = Object.freeze({
  maxTension: 1_050_000,
  maxImpulse: 19_000,
  maxYank: 15_000,
});
// PQ-029 Tractor head. This remains a rope: the SG-02 owner applies only one-sided radial tension.
// The head changes that tension profile to an overdamped, finite-force tow so it settles a payload
// without becoming a position/velocity controller. Standard lines retain the catalog spring.
const TRACTOR_TETHER_SPRING = Object.freeze({
  K: 110,
  zeta: 1.35,
  captureS: 0.45,
  maxForce: 4_200,
});
// PQ-029 Elastic Whip head. Higher stiffness and low damping turn extension the pilot physically
// earns into a lively return stroke. There is no release impulse or control writer here: SG-02
// still applies only equal/opposite radial rope tension, and cutting simply preserves real velocity.
const ELASTIC_WHIP_TETHER_SPRING = Object.freeze({
  K: 260,
  zeta: 0.28,
  captureS: 0.20,
});
// PQ-029 Frame Coupler head. SG-02 interprets this snapshotted mode as a bounded momentum
// exchange while the line is taut. It never seeks a position, assigns velocity, or steers a body.
const FRAME_COUPLER_TETHER_SPRING = Object.freeze({
  mode: 'frame_coupler',
  velocityGain: 1.6,
  captureS: 0.35,
  maxForce: 5_200,
});
const SPECIALIZED_TETHER_HEADS = Object.freeze({
  tractor: Object.freeze({ flag: 'masslineHeadTractor', spring: TRACTOR_TETHER_SPRING }),
  elastic_whip: Object.freeze({ flag: 'masslineHeadElasticWhip', spring: ELASTIC_WHIP_TETHER_SPRING }),
  frame_coupler: Object.freeze({ flag: 'masslineHeadFrameCoupler', spring: FRAME_COUPLER_TETHER_SPRING }),
});

/** Resolve player spool strength from immutable attachment data. Ratings are max-folded by ships;
 *  this layer scales only the standard tether's break policy and never mutates the catalog. */
export function effectiveTetherBreak(def, owner) {
  const base = def && def.break ? def.break : null;
  if (!base) return null;
  if (!def || def.id !== 'tether_standard') return { ...base };
  const raw = Number(owner && owner.data && owner.data.derived && owner.data.derived.tetherSpoolMult);
  const mult = Number.isFinite(raw) ? Math.max(1, Math.min(6, raw)) : 1;
  return {
    ...base,
    maxTension: Number.isFinite(base.maxTension) ? base.maxTension * mult : base.maxTension,
    maxImpulse: Number.isFinite(base.maxImpulse) ? base.maxImpulse * mult : base.maxImpulse,
    maxYank: Number.isFinite(base.maxYank) ? base.maxYank * mult : base.maxYank,
  };
}

/** Resolve every player-facing tether capability from immutable catalog data. Strength and reel
 * rate are independent max-folded ratings; active attachments snapshot this policy at creation so
 * a refit cannot silently rewrite an already-deployed line. */
export function effectiveTetherPolicy(def, owner, features = null) {
  const baseReelRate = Number.isFinite(def && def.reelRate) ? def.reelRate : 0;
  if (!def || def.id !== 'tether_standard') {
    return { break: effectiveTetherBreak(def, owner), reelRate: baseReelRate };
  }
  const rawReel = Number(owner && owner.data && owner.data.derived && owner.data.derived.tetherReelRateMult);
  const reelMult = Number.isFinite(rawReel) ? Math.max(1, rawReel) : 1;
  const policy = {
    break: effectiveTetherBreak(def, owner),
    reelRate: baseReelRate * reelMult,
    strengthRevision: STANDARD_TETHER_STRENGTH_REVISION,
  };
  const headId = owner && owner.data && owner.data.derived && owner.data.derived.masslineHeadId;
  const head = SPECIALIZED_TETHER_HEADS[headId];
  if (!head || !massline2Flag(head.flag, features)) return policy;
  return {
    ...policy,
    headId,
    spring: {
      ...((def && def.spring) || {}),
      ...head.spring,
    },
  };
}

/** Preserve a deployed line's snapshotted spool rating across Continue while rebasing saves made
 * before the normal-play durability contract. This prevents an old 1.05M policy from surviving in
 * a save as misleading strain telemetry, without letting a mid-deployment refit change its rating. */
export function rebasePersistedTetherPolicy(def, policy) {
  if (!def || def.id !== 'tether_standard' || !policy || typeof policy !== 'object') return policy;
  if (Number(policy.strengthRevision) >= STANDARD_TETHER_STRENGTH_REVISION) return policy;
  const savedBreak = policy.break && typeof policy.break === 'object' ? policy.break : {};
  const ratios = [
    Number(savedBreak.maxTension) / PREVIOUS_STANDARD_TETHER_BREAK.maxTension,
    Number(savedBreak.maxImpulse) / PREVIOUS_STANDARD_TETHER_BREAK.maxImpulse,
    Number(savedBreak.maxYank) / PREVIOUS_STANDARD_TETHER_BREAK.maxYank,
  ].filter((value) => Number.isFinite(value) && value > 0);
  const savedRating = Math.max(1, Math.min(6, ratios.length ? Math.max(...ratios) : 1));
  return {
    ...policy,
    break: {
      ...(def.break || {}),
      ...savedBreak,
      maxTension: Number(def.break && def.break.maxTension) * savedRating,
      maxImpulse: Number(def.break && def.break.maxImpulse) * savedRating,
      maxYank: Number(def.break && def.break.maxYank) * savedRating,
    },
    strengthRevision: STANDARD_TETHER_STRENGTH_REVISION,
  };
}

/** Automatic load breakage is fail-closed for every controller-backed Massline. Ordinary ships,
 * asteroids, payloads, and structures cannot turn a piloting mistake into a severed line. Both the
 * definition and a future station/singularity-scale endpoint must opt in explicitly; manual pilot
 * cut and subsystem-owned severing remain separate attachment-service paths. */
export function automaticMasslineBreakAllowed(def, owner, target) {
  if (entitySuppressesMasslineAutoBreak(owner) || entitySuppressesMasslineAutoBreak(target)) return false;
  const massline = def && def.massline;
  if (!massline || massline.enabled !== true) return true;
  if (massline.automaticBreakPolicy === 'extreme_load_only') {
    return entityEnablesExtremeMasslineBreak(owner) || entityEnablesExtremeMasslineBreak(target);
  }
  // A Massline definition must name an explicit supported failure policy. Omission is never
  // permission to restore the old load-induced snap behavior.
  return false;
}

// Builds the winch/heat/overload policy def that masslineController.stepMassline consumes. The
// physical envelope comes from the attachment def's `break` block (authored in combatDefs); the
// winch/heat/reel policy comes from the generated DEFAULT_MASSLINE_DEF. Heavy targets still stall
// the winch through mass-ratio physics. Automatic overload failure is enabled only by the explicit
// endpoint policy passed below, never inferred from ordinary load.
function masslineDefFor(def, tetherPolicy = null, automaticBreak = true) {
  const breakPolicy = tetherPolicy && tetherPolicy.break;
  const brk = breakPolicy || (def && def.break) || {};
  const reelRate = Number.isFinite(tetherPolicy && tetherPolicy.reelRate)
    ? tetherPolicy.reelRate
    : (Number.isFinite(def && def.reelRate) ? def.reelRate : null);
  // Authored massline.overloadGraceS controls failure-capable extreme operations. Ordinary standard
  // lines pass automaticBreak=false and keep the controller's load/heat telemetry without cutting.
  const authoredGrace = def && def.massline && Number(def.massline.overloadGraceS);
  const overloadGraceS = Number.isFinite(authoredGrace) && authoredGrace > 0 ? authoredGrace : 0.22;
  const authoredCat = def && def.massline && Number(def.massline.catastrophicRatio);
  const catastrophicRatio = Number.isFinite(authoredCat) && authoredCat > 1 ? authoredCat : 1.75;
  return {
    minLength: Number.isFinite(def && def.minLength) ? def.minLength : undefined,
    maxLength: Number.isFinite(def && def.maxLength) ? def.maxLength : undefined,
    reelInSpeed: reelRate == null ? undefined : reelRate,
    reelOutSpeed: reelRate == null ? undefined : reelRate,
    maxTension: Number.isFinite(brk.maxTension) ? brk.maxTension : 140,
    maxImpulse: Number.isFinite(brk.maxImpulse) ? brk.maxImpulse : 90,
    maxYank: Number.isFinite(brk.maxYank) ? brk.maxYank : 420,
    overloadGraceS,
    catastrophicRatio,
    automaticBreak: automaticBreak !== false,
  };
}

export function createAttachmentService(context) {
  const { state, catalog, helpers, bus } = context;

  function get(attachmentId) {
    return state.combat.attachments.byId[String(attachmentId)] || null;
  }

  function breakPolicy(attachmentId) {
    const attachment = get(attachmentId);
    if (!attachment) return null;
    const def = catalog.attachments.get(attachment.defId);
    if (!def) return null;
    return breakForAttachment(def, entity(attachment.ownerId), entity(attachment.targetId), attachment);
  }

  function reelPolicy(attachmentId) {
    const attachment = get(attachmentId);
    if (!attachment) return null;
    const def = catalog.attachments.get(attachment.defId);
    if (!def) return null;
    return policyForAttachment(def, entity(attachment.ownerId), attachment);
  }

  function create(spec) {
    const def = catalog.attachments.get(spec && spec.defId);
    const owner = entity(spec && spec.ownerId);
    const target = entity(spec && spec.targetId);
    const physics = combatPhysics();
    if (!def) return fail('unknown_attachment_def');
    if (!owner || !owner.alive) return fail('owner_missing');
    if (!target || !target.alive || target.id === owner.id) return fail('target_missing');
    if (!physics || typeof physics.createAttachment !== 'function') return fail('physics_port_unavailable');

    const ownerRuntime = ensureCombatant(state, owner, catalog);
    const targetRuntime = ensureCombatant(state, target, catalog);
    const sourceSocket = selectSocket(ownerRuntime, def.sourceSocketTags, spec.sourceSocketId, owner.id);
    const targetSocket = selectSocket(targetRuntime, def.targetSocketTags, spec.targetSocketId, target.id);
    if (!sourceSocket) return fail('source_socket_unavailable');
    if (!targetSocket) return fail('target_socket_unavailable');

    const activeOwned = Object.values(state.combat.attachments.byId)
      .filter((attachment) => attachment.state === 'active' && attachment.ownerId === owner.id && attachment.defId === def.id).length;
    if (def.limits && Number.isInteger(def.limits.maxPerOwner) && activeOwned >= def.limits.maxPerOwner) return fail('owner_attachment_limit');

    const id = `att_${String(state.combat.attachments.nextId++).padStart(6, '0')}`;
    const requestedSourceWorld = validWorldPoint(spec && spec.sourceWorld);
    const requestedTargetWorld = validWorldPoint(spec && spec.targetWorld);
    const sourceWorld = requestedSourceWorld || socketWorldPosition(owner, sourceSocket);
    const targetWorld = requestedTargetWorld || socketWorldPosition(target, targetSocket);
    const restLength = Math.hypot(targetWorld.x - sourceWorld.x, targetWorld.z - sourceWorld.z);
    const attachment = {
      id,
      defId: def.id,
      ownerId: owner.id,
      targetId: target.id,
      sourceSocketId: sourceSocket.id,
      targetSocketId: targetSocket.id,
      sourceAnchorLocal: requestedSourceWorld
        ? worldPointToEntityLocal(owner, sourceWorld)
        : socketLocalPosition(owner, sourceSocket),
      targetAnchorLocal: requestedTargetWorld
        ? worldPointToEntityLocal(target, targetWorld)
        : socketLocalPosition(target, targetSocket),
      physicsHandle: null,
      state: 'active',
      createdTick: state.tick,
      brokenTick: null,
      breakReason: null,
      restLength,
      lastTension: 0,
      lastImpulse: 0,
      nearBreakWarned: false,
      actionInstanceId: spec.actionInstanceId || null,
      tetherPolicy: effectiveTetherPolicy(def, owner, state.runtime && state.runtime.features),
    };
    const physicsResult = createPhysicsAttachment(attachment, def);
    if (!physicsResult.ok) return fail(physicsResult.reason, physicsResult.error);
    attachment.physicsHandle = serializableHandle(physicsResult.physicsHandle);
    state.combat.attachments.byId[id] = attachment;
    appendCombatTrace(state.combat, state.tick, 'attachment.created', {
      actorId: owner.id,
      targetId: target.id,
      attachmentId: id,
      attachmentDefId: def.id,
      sourceSocketId: sourceSocket.id,
      targetSocketId: targetSocket.id,
      restLength,
      cueId: def.cues && def.cues.created,
    });
    if (bus) bus.emit('tether:attached', {
      actorId: owner.id,
      targetId: target.id,
      attachmentId: id,
      attachmentDefId: def.id,
      sourceSocketId: sourceSocket.id,
      targetSocketId: targetSocket.id,
      restLength,
      cueId: def.cues && def.cues.created,
    });
    return { ok: true, attachment };
  }

  function reel(attachmentId, restLengthDelta, minRestLength = 0) {
    const attachment = get(attachmentId);
    const physics = combatPhysics();
    if (!attachment || attachment.state !== 'active') return fail('attachment_missing');
    if (!physics || typeof physics.setAttachmentReel !== 'function') return fail('physics_port_unavailable');
    const next = Math.max(Math.max(0, Number(minRestLength) || 0), attachment.restLength + (Number(restLengthDelta) || 0));
    const nextReelRevision = Math.max(0, Math.trunc(Number(attachment.reelRevision) || 0)) + 1;
    try {
      const accepted = physics.setAttachmentReel({
        attachmentId: attachment.id,
        physicsHandle: attachment.physicsHandle,
        restLength: next,
        previousRestLength: attachment.restLength,
        reelRevision: nextReelRevision,
        springState: attachment.physicsSpringState,
        tick: state.tick,
      });
      if (accepted === false) return fail('physics_reel_rejected');
      const acceptedRestLength = accepted && typeof accepted === 'object' && Number.isFinite(accepted.restLength)
        ? accepted.restLength
        : next;
      const before = attachment.restLength;
      attachment.restLength = acceptedRestLength;
      attachment.reelRevision = nextReelRevision;
      attachment.lastReelTick = state.tick;
      if (attachment.masslineRuntime) {
        attachment.masslineRuntime.restLength = acceptedRestLength;
        attachment.masslineRuntime.targetLength = acceptedRestLength;
        attachment.masslineRuntime.reelVelocity = 0;
      }
      appendCombatTrace(state.combat, state.tick, 'attachment.reel', {
        actorId: attachment.ownerId,
        targetId: attachment.targetId,
        attachmentId: attachment.id,
        before,
        after: acceptedRestLength,
      });
      if (bus) bus.emit('tether:reel', {
        actorId: attachment.ownerId,
        targetId: attachment.targetId,
        attachmentId: attachment.id,
        before,
        after: acceptedRestLength,
      });
      return { ok: true, attachment };
    } catch (error) {
      return fail('physics_reel_failed', error);
    }
  }

  function cut(attachmentId, actorId, reason = 'cut') {
    const attachment = get(attachmentId);
    if (!attachment || attachment.state !== 'active') return fail('attachment_missing');
    if (actorId != null && attachment.ownerId !== actorId) return fail('not_attachment_owner');
    return breakAttachment(attachment, reason, actorId);
  }

  function breakAttachment(attachmentOrId, reason = 'break', actorId = null, telemetry = null) {
    const attachment = typeof attachmentOrId === 'string' ? get(attachmentOrId) : attachmentOrId;
    const physics = combatPhysics();
    if (!attachment || attachment.state !== 'active') return fail('attachment_missing');
    if (physics && typeof physics.cutAttachment === 'function') {
      try {
        physics.cutAttachment({
          attachmentId: attachment.id,
          physicsHandle: attachment.physicsHandle,
          reason,
          tick: state.tick,
        });
      } catch (error) {
        // Do NOT leave the record 'active' when the physics cut throws (typically a stale body
        // after the target despawned). An active record with an ungovernable joint is the
        // immortal-ghost-tether bug: reconcilePhysics resurrects the joint every tick, the
        // owner-limit then blocks all future latches, and no input can ever cut it. Mark broken,
        // trace the failure, and let reconcile/liveness sweeps skip broken records.
        appendCombatTrace(state.combat, state.tick, 'attachment.physicsCutFailed', {
          actorId: actorId == null ? attachment.ownerId : actorId,
          attachmentId: attachment.id,
          reason,
          error: error && error.message ? String(error.message) : 'unknown',
        });
      }
    } else if (reason !== 'physics_break') {
      return fail('physics_port_unavailable');
    }
    attachment.state = 'broken';
    attachment.brokenTick = state.tick;
    attachment.breakReason = reason;
    if (telemetry) {
      attachment.lastTension = finiteOrZero(telemetry.tension);
      attachment.lastImpulse = finiteOrZero(telemetry.impulse);
      attachment.lastYank = Math.abs(finiteOrZero(telemetry.yank));
    }
    const def = catalog.attachments.get(attachment.defId);
    appendCombatTrace(state.combat, state.tick, 'attachment.broken', {
      actorId: actorId == null ? attachment.ownerId : actorId,
      targetId: attachment.targetId,
      attachmentId: attachment.id,
      reason,
      tension: attachment.lastTension,
      impulse: attachment.lastImpulse,
      cueId: def && def.cues && def.cues.broken,
    });
    if (bus) bus.emit('tether:broken', {
      actorId: actorId == null ? attachment.ownerId : actorId,
      targetId: attachment.targetId,
      attachmentId: attachment.id,
      reason,
      tension: attachment.lastTension,
      impulse: attachment.lastImpulse,
      cueId: def && def.cues && def.cues.broken,
    });
    return { ok: true, attachment };
  }

  function breakOwnedBy(ownerId, reason = 'owner_disabled') {
    const broken = [];
    for (const attachment of Object.values(state.combat.attachments.byId).sort(byId)) {
      if (attachment.state !== 'active' || attachment.ownerId !== ownerId) continue;
      const result = breakAttachment(attachment, reason, ownerId);
      if (result.ok) broken.push(attachment.id);
    }
    return broken;
  }

  // Liveness sweep: an attachment whose owner or target no longer exists (despawned pickup,
  // mined-out asteroid, killed ship) must break — never persist as an invisible anchor. Runs
  // before physics reconcile so a dead-ended joint is cut instead of resurrected.
  function breakOrphans() {
    let broken = 0;
    for (const attachment of Object.values(state.combat.attachments.byId).sort(byId)) {
      if (!attachment || attachment.state !== 'active') continue;
      const owner = entity(attachment.ownerId);
      const target = entity(attachment.targetId);
      // Orphaned = the entity is GONE (despawned) or explicitly dead (alive === false). An entity
      // without an `alive` field (harness stubs, minimal records) is NOT an orphan — only a
      // positive death signal or a missing record may break a line.
      const ownerLost = !owner || owner.alive === false;
      const targetLost = !target || target.alive === false;
      if (!ownerLost && !targetLost) continue;
      const result = breakAttachment(attachment, 'target_lost', attachment.ownerId);
      if (result.ok) broken++;
    }
    return broken;
  }

  function reconcilePhysics() {
    const physics = combatPhysics();
    if (!physics || typeof physics.createAttachment !== 'function' || typeof physics.getAttachmentTelemetry !== 'function') {
      return { recreated: 0, pending: 0 };
    }
    breakOrphans();
    let recreated = 0;
    let pending = 0;
    for (const attachment of Object.values(state.combat.attachments.byId).sort(byId)) {
      if (!attachment || attachment.state !== 'active') continue;
      let telemetry = null;
      try {
        telemetry = physics.getAttachmentTelemetry({
          attachmentId: attachment.id,
          physicsHandle: attachment.physicsHandle,
          tick: state.tick,
        });
      } catch (_) {
        telemetry = null;
      }
      if (telemetry) continue;
      const def = catalog.attachments.get(attachment.defId);
      if (!def) { pending++; continue; }
      const result = createPhysicsAttachment(attachment, def);
      if (!result.ok) { pending++; continue; }
      attachment.physicsHandle = serializableHandle(result.physicsHandle);
      recreated++;
      appendCombatTrace(state.combat, state.tick, 'attachment.physicsReconciled', {
        actorId: attachment.ownerId,
        targetId: attachment.targetId,
        attachmentId: attachment.id,
        attachmentDefId: attachment.defId,
      });
    }
    return { recreated, pending };
  }

  function transfer(attachmentId, fromOwnerId, toOwnerId) {
    const attachment = get(attachmentId);
    const def = attachment && catalog.attachments.get(attachment.defId);
    if (!attachment || attachment.state !== 'active') return fail('attachment_missing');
    if (attachment.ownerId !== fromOwnerId) return fail('not_attachment_owner');
    if (!def || !def.ownership || !def.ownership.transferable) return fail('ownership_not_transferable');
    const nextOwner = entity(toOwnerId);
    if (!nextOwner || nextOwner.alive === false) return fail('new_owner_missing');
    const nextRuntime = ensureCombatant(state, nextOwner, catalog);
    const nextSocket = selectSocket(nextRuntime, def.sourceSocketTags, null, nextOwner.id, attachment.id);
    if (!nextSocket) return fail('source_socket_unavailable');
    const physics = combatPhysics();
    if (!physics || typeof physics.cutAttachment !== 'function' || typeof physics.createAttachment !== 'function') {
      return fail('physics_port_unavailable');
    }
    const previous = {
      ownerId: attachment.ownerId,
      sourceSocketId: attachment.sourceSocketId,
      sourceAnchorLocal: attachment.sourceAnchorLocal && { ...attachment.sourceAnchorLocal },
    };
    try {
      const released = physics.cutAttachment({
        attachmentId: attachment.id,
        physicsHandle: attachment.physicsHandle,
        reason: 'owner_transfer',
        tick: state.tick,
      });
      if (released === false) return fail('physics_transfer_cut_rejected');
    } catch (error) {
      return fail('physics_transfer_cut_failed', error);
    }
    attachment.ownerId = toOwnerId;
    attachment.sourceSocketId = nextSocket.id;
    attachment.sourceAnchorLocal = socketLocalPosition(nextOwner, nextSocket);
    attachment.physicsHandle = null;
    const rebound = createPhysicsAttachment(attachment, def);
    if (!rebound.ok) {
      attachment.ownerId = previous.ownerId;
      attachment.sourceSocketId = previous.sourceSocketId;
      attachment.sourceAnchorLocal = previous.sourceAnchorLocal;
      const rollback = createPhysicsAttachment(attachment, def);
      if (!rollback.ok) {
        attachment.physicsHandle = null;
        breakAttachment(attachment, 'physics_transfer_rollback_failed', previous.ownerId);
        return fail('physics_transfer_rollback_failed', rollback.error || rebound.error);
      }
      attachment.physicsHandle = serializableHandle(rollback.physicsHandle);
      return fail('physics_transfer_rebind_failed', rebound.error);
    }
    attachment.physicsHandle = serializableHandle(rebound.physicsHandle);
    appendCombatTrace(state.combat, state.tick, 'attachment.ownerTransferred', {
      actorId: fromOwnerId,
      targetId: toOwnerId,
      attachmentId,
    });
    return { ok: true, attachment };
  }

  function updateTelemetryAndBreak() {
    const physics = combatPhysics();
    if (!physics || typeof physics.getAttachmentTelemetry !== 'function') return;
    for (const attachment of Object.values(state.combat.attachments.byId).sort(byId)) {
      if (attachment.state !== 'active') continue;
      const def = catalog.attachments.get(attachment.defId);
      if (!def) continue;
      const owner = entity(attachment.ownerId);
      const target = entity(attachment.targetId);
      const breakPolicy = breakForAttachment(def, owner, target, attachment);
      let telemetry;
      try {
        telemetry = physics.getAttachmentTelemetry({ attachmentId: attachment.id, physicsHandle: attachment.physicsHandle, tick: state.tick });
      } catch (_) {
        continue;
      }
      if (!telemetry) continue;
      attachment.lastTension = finiteOrZero(telemetry.tension);
      attachment.lastImpulse = finiteOrZero(telemetry.impulse);
      attachment.lastYank = Math.abs(finiteOrZero(telemetry.yank));
      attachment.physicsSpringState = telemetry.springState && typeof telemetry.springState === 'object'
        ? { ...telemetry.springState }
        : null;
      const grace = Math.max(0, Number(breakPolicy && breakPolicy.graceTicks) || 0);

      // Warning is an ordered, player-visible receipt, not post-break decoration. Detect it before
      // stepping the cut authority; the bounded warning lease below then keeps the line recoverable
      // for presentation and pilot counterplay before `tether:broken` may be emitted.
      const automaticBreak = automaticMasslineBreakAllowed(def, owner, target);
      if (state.tick - attachment.createdTick >= grace && breakPolicy && automaticBreak) {
        const tensionRatio = breakPolicy.maxTension > 0 ? attachment.lastTension / breakPolicy.maxTension : 0;
        const impulseRatio = breakPolicy.maxImpulse > 0 ? attachment.lastImpulse / breakPolicy.maxImpulse : 0;
        // The controller's effective yank budget can only be wider than maxYank due to battle
        // hardening. Therefore raw yank/maxYank > .75 safely catches every yank-dominant cut while
        // allowing an intentionally conservative early warning.
        const yankRatio = breakPolicy.maxYank > 0 ? attachment.lastYank / breakPolicy.maxYank : 0;
        const nearBreakRatio = Math.max(tensionRatio, impulseRatio, yankRatio);
        if (nearBreakRatio > 0.75 && !attachment.nearBreakWarned) {
          attachment.nearBreakWarned = true;
          // Fifteen fixed ticks is a visible 250 ms counterplay window at 60 Hz. Catastrophic loads
          // still fail promptly, but never before presentation has rendered at least one warning.
          attachment.breakWarningUntilTick = state.tick + 15;
          if (bus) bus.emit('tether:nearBreak', {
            actorId: attachment.ownerId,
            targetId: attachment.targetId,
            attachmentId: attachment.id,
            attachmentDefId: attachment.defId,
            tension: attachment.lastTension,
            impulse: attachment.lastImpulse,
            yank: attachment.lastYank,
            ratio: nearBreakRatio,
            warningUntilTick: attachment.breakWarningUntilTick,
          });
        }
      }

      // Massline controller: run the winch/heat/overload policy (spec §8) one step per fixed tick
      // and apply its rest-length command to the Rapier joint. Rapier still owns momentum exchange
      // (mass-ratio-driven swing/reel); the controller only owns the winch + break policy. This is
      // what turns the scripted tether into a physical mass-ratio-driven Massline.
      // Massline controller (spec §8): run the winch/heat/overload policy one step per fixed tick
      // and apply its rest-length command to the Rapier joint. Opt-in per attachment def via a
      // `massline: { enabled: true }` block, so existing scenario tethers keep their proven
      // dynamics until a def deliberately adopts the controller. When enabled, Rapier still owns
      // momentum exchange (mass-ratio-driven swing/reel); the controller only owns the winch +
      // break policy. Joint rebuilds are conservative (only on a meaningful length change) to
      // avoid destabilizing the solver with per-tick joint recreation.
      const masslinePolicy = def.massline && def.massline.enabled;
      if (masslinePolicy && state.tick - attachment.createdTick >= grace) {
        const activePolicy = policyForAttachment(def, owner, attachment);
        const masslineDef = masslineDefFor(def, { ...activePolicy, break: breakPolicy }, automaticBreak);
        if (!attachment.masslineRuntime) {
          // Seed the winch from the ACTUAL attachment rest length, not the def's defaultLength,
          // so a neutral (no-reel) command holds the engagement distance rather than drifting the
          // ships toward an arbitrary 70-unit separation. The controller only moves the joint when
          // a reel command is issued or physics stretches the line.
          const runtime = createMasslineRuntime(masslineDef);
          const seed = attachment.restLength > 0 ? attachment.restLength : runtime.restLength;
          runtime.restLength = seed;
          runtime.targetLength = seed;
          attachment.masslineRuntime = runtime;
        }
        const ml = stepMassline({
          dt: SIM_DT,
          def: masslineDef,
          runtime: attachment.masslineRuntime,
          telemetry: {
            attachmentId: attachment.id,
            restLength: telemetry.restLength,
            distance: telemetry.distance,
            stretch: telemetry.stretch,
            relativeSpeed: telemetry.relativeSpeed,
            yank: telemetry.yank,
            tension: telemetry.tension,
            impulse: telemetry.impulse,
          },
          command: { reel: 0, hold: true, cut: false },
          ownerBody: owner && { mass: finiteOrZero(owner.physicsBody && owner.physicsBody.mass) || finiteOrZero(owner.mass) || 1 },
          targetBody: target && { mass: finiteOrZero(target.physicsBody && target.physicsBody.mass) || finiteOrZero(target.mass) || 1 },
        });
        attachment.masslineRuntime = ml.runtime;
        attachment.masslineTelemetry = ml.telemetry;
        // Apply the controller's rest length only on a meaningful change (>= 2 units). Rebuilding
        // a Rapier rope joint every tick resets solver contact state and destabilizes the tether;
        // the winch is a slow actuator, so a coarse threshold is physically appropriate.
        if (ml.action.restLength > 0 && Math.abs(ml.action.restLength - attachment.restLength) >= 2.0) {
          try {
            if (physics.setAttachmentReel) {
              const accepted = physics.setAttachmentReel({
                attachmentId: attachment.id,
                physicsHandle: attachment.physicsHandle,
                restLength: ml.action.restLength,
                previousRestLength: attachment.restLength,
                tick: state.tick,
              });
              attachment.restLength = accepted && typeof accepted === 'object' && Number.isFinite(accepted.restLength)
                ? accepted.restLength
                : ml.action.restLength;
            }
          } catch (_) { /* joint update is best-effort; the next tick retries */ }
        }
        // The controller's overload cut is still the authored threshold break at the SG-03
        // boundary: checks and AI consume the public 'threshold' reason while the controller keeps
        // its internal cut reason for telemetry/debugging.
        if (ml.action.cut) {
          if (Number.isFinite(attachment.breakWarningUntilTick)
            && state.tick < attachment.breakWarningUntilTick) {
            attachment.masslineRuntime = {
              ...ml.runtime,
              state: 'holding',
              cutReason: null,
            };
            attachment.masslineTelemetry = { ...ml.telemetry, state: 'holding' };
            continue;
          }
          const rawCutReason = ml.runtime.cutReason || 'overload';
          const cutReason = rawCutReason === 'catastrophic-overload' || rawCutReason === 'sustained-overload' || rawCutReason === 'snap'
            ? 'threshold'
            : rawCutReason;
          breakAttachment(attachment, cutReason, attachment.ownerId, {
            tension: ml.telemetry.tension,
            impulse: ml.telemetry.impulse,
          });
          continue;
        }
      }

      if (state.tick - attachment.createdTick < grace) continue;
      if (!masslinePolicy && ((breakPolicy && attachment.lastTension > breakPolicy.maxTension) || (breakPolicy && attachment.lastImpulse > breakPolicy.maxImpulse))) {
        breakAttachment(attachment, 'threshold', attachment.ownerId, telemetry);
      }
    }
  }

  function onPhysicsBreak(payload) {
    if (!payload || !payload.attachmentId) return false;
    const attachment = get(payload.attachmentId);
    if (!attachment || attachment.state !== 'active') return false;
    return breakAttachment(attachment, 'physics_break', attachment.ownerId, payload).ok;
  }

  function listForEntity(entityId, activeOnly = true) {
    return Object.values(state.combat.attachments.byId)
      .filter((attachment) => (!activeOnly || attachment.state === 'active') && (attachment.ownerId === entityId || attachment.targetId === entityId))
      .sort(byId);
  }

  return Object.freeze({ get, breakPolicy, reelPolicy, create, reel, cut, breakAttachment, breakOwnedBy, breakOrphans, reconcilePhysics, transfer, updateTelemetryAndBreak, onPhysicsBreak, listForEntity });

  function combatPhysics() {
    return helpers && helpers.combatPhysics;
  }

  function createPhysicsAttachment(attachment, def) {
    const physics = combatPhysics();
    if (!physics || typeof physics.createAttachment !== 'function') return { ok: false, reason: 'physics_port_unavailable' };
    const owner = entity(attachment.ownerId);
    const target = entity(attachment.targetId);
    if (!owner || !owner.alive) return { ok: false, reason: 'owner_missing' };
    if (!target || !target.alive || target.id === owner.id) return { ok: false, reason: 'target_missing' };
    const ownerRuntime = ensureCombatant(state, owner, catalog);
    const targetRuntime = ensureCombatant(state, target, catalog);
    const sourceSocket = selectSocket(ownerRuntime, def.sourceSocketTags, attachment.sourceSocketId, owner.id, attachment.id);
    const targetSocket = selectSocket(targetRuntime, def.targetSocketTags, attachment.targetSocketId, target.id, attachment.id);
    if (!sourceSocket) return { ok: false, reason: 'source_socket_unavailable' };
    if (!targetSocket) return { ok: false, reason: 'target_socket_unavailable' };
    const sourceAnchorLocal = validLocalPoint(attachment.sourceAnchorLocal) || socketLocalPosition(owner, sourceSocket);
    const targetAnchorLocal = validLocalPoint(attachment.targetAnchorLocal) || socketLocalPosition(target, targetSocket);
    const sourceWorld = entityLocalPointToWorld(owner, sourceAnchorLocal);
    const targetWorld = entityLocalPointToWorld(target, targetAnchorLocal);
    const fallbackRestLength = Math.hypot(targetWorld.x - sourceWorld.x, targetWorld.z - sourceWorld.z);
    const restLength = Number.isFinite(attachment.restLength) && attachment.restLength > 0
      ? attachment.restLength
      : fallbackRestLength;
    try {
      const physicsHandle = physics.createAttachment({
        attachmentId: attachment.id,
        defId: def.id,
        ownerId: owner.id,
        targetId: target.id,
        sourceSocketId: sourceSocket.id,
        targetSocketId: targetSocket.id,
        sourceAnchorLocal,
        targetAnchorLocal,
        sourceWorld,
        targetWorld,
        restLength,
        break: breakForAttachment(def, owner, target, attachment) || {},
        spring: springForAttachment(def, owner, target, attachment),
        forceScale: masslineForceScale(attachment),
        reelRevision: attachment.reelRevision,
        springState: attachment.physicsSpringState,
        tick: state.tick,
      });
      if (physicsHandle === false || physicsHandle == null) return { ok: false, reason: 'physics_create_rejected' };
      attachment.sourceSocketId = sourceSocket.id;
      attachment.targetSocketId = targetSocket.id;
      attachment.sourceAnchorLocal = sourceAnchorLocal;
      attachment.targetAnchorLocal = targetAnchorLocal;
      attachment.restLength = restLength;
      return { ok: true, physicsHandle };
    } catch (error) {
      return { ok: false, reason: 'physics_create_failed', error };
    }
  }

  function selectSocket(runtime, requiredTags, explicitId, entityId, ignoreAttachmentId = null) {
    const sockets = runtime && runtime.sockets ? Object.values(runtime.sockets).sort(byId) : [];
    const required = new Set(requiredTags || []);
    for (const socket of sockets) {
      if (explicitId && socket.id !== explicitId) continue;
      if (![...required].some((tag) => socket.tags.includes(tag))) continue;
      const used = Object.values(state.combat.attachments.byId).filter((attachment) =>
        attachment.id !== ignoreAttachmentId &&
        attachment.state === 'active' && ((attachment.ownerId === entityId && attachment.sourceSocketId === socket.id) ||
        (attachment.targetId === entityId && attachment.targetSocketId === socket.id))).length;
      if (used < socket.maxAttachments) return socket;
    }
    return null;
  }

  function entity(id) {
    return state.entities && state.entities.get ? state.entities.get(id) || null : null;
  }

  function masslineForceScale(attachment) {
    const ownerScale = entityMasslineForceScale(entity(attachment && attachment.ownerId));
    const targetScale = entityMasslineForceScale(entity(attachment && attachment.targetId));
    return Math.min(ownerScale, targetScale);
  }

  function springForAttachment(def, owner, target, attachment = null) {
    if (uses47aLegacyMassline(def, owner, target, state)) {
      const reelRevision = Math.max(0, Math.trunc(Number(attachment && attachment.reelRevision) || 0));
      if (reelRevision <= 0) return { mode: 'legacy_rope' };
    }
    const policy = policyForAttachment(def, owner, attachment);
    if (policy && policy.headId && policy.spring && typeof policy.spring === 'object') {
      return { ...policy.spring };
    }
    return { ...((def && def.spring) || {}) };
  }

  function breakForAttachment(def, owner, target, attachment = null) {
    if (uses47aLegacyMassline(def, owner, target, state)) {
      const reelRevision = Math.max(0, Math.trunc(Number(attachment && attachment.reelRevision) || 0));
      if (reelRevision <= 0) return { ...LEGACY_47A_MASSLINE_BREAK };
    }
    return policyForAttachment(def, owner, attachment).break;
  }

  function policyForAttachment(def, owner, attachment = null) {
    if (attachment && attachment.tetherPolicy && typeof attachment.tetherPolicy === 'object') {
      const rebased = rebasePersistedTetherPolicy(def, attachment.tetherPolicy);
      if (rebased !== attachment.tetherPolicy) attachment.tetherPolicy = rebased;
      return rebased;
    }
    const policy = effectiveTetherPolicy(def, owner, state.runtime && state.runtime.features);
    if (attachment) attachment.tetherPolicy = policy;
    return policy;
  }

  function fail(reason, error = null) {
    appendCombatTrace(state.combat, state.tick, 'attachment.rejected', {
      reason,
      error: error && error.message ? String(error.message) : null,
    });
    return { ok: false, reason };
  }
}

export function otherAttachmentEndpoint(attachment, actorId) {
  if (!attachment) return null;
  if (attachment.ownerId === actorId) return attachment.targetId;
  if (attachment.targetId === actorId) return attachment.ownerId;
  return null;
}

function serializableHandle(handle) {
  if (handle == null) return null;
  if (typeof handle === 'string' || typeof handle === 'number' || typeof handle === 'boolean') return handle;
  if (typeof handle === 'object' && (typeof handle.id === 'string' || typeof handle.id === 'number')) return { id: handle.id };
  return { external: true };
}

function byId(a, b) {
  return compareText(String(a.id), String(b.id));
}

function finiteOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function entitySuppressesMasslineAutoBreak(value) {
  const data = value && value.data;
  return !!data && (data.masslineAutoBreak === false || data.masslineBreakPolicy === 'manual_cut_only');
}

function entityEnablesExtremeMasslineBreak(value) {
  const data = value && value.data;
  return !!data && (data.masslineExtremeLoad === true || data.masslineBreakPolicy === 'extreme_overload');
}

function entityMasslineForceScale(value) {
  const data = value && value.data;
  const scale = data && Number(data.masslineForceScale);
  if (!Number.isFinite(scale)) return 1;
  return scale < 0 ? 0 : scale > 4 ? 4 : scale;
}

function validWorldPoint(value) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.z)) return null;
  return { x: value.x, y: Number.isFinite(value.y) ? value.y : 0, z: value.z };
}

function validLocalPoint(value) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.z)) return null;
  return { x: value.x, z: value.z };
}

function uses47aLegacyMassline(def, owner, target, state = null) {
  if (!def || def.id !== 'attachment_massline') return false;
  if (state && state.settings && state.settings.gameplay && state.settings.gameplay.flightBackend === 'v3') return false;
  const targetData = target && target.data;
  return !!targetData && targetData.scenarioActorId === 'evidence_spindle_47a';
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
