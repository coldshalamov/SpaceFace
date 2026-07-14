// Tether gameplay system (GDD 2.0 §4.3, BUILD_PLAN WS-D1).
// Consumes the locked input action contract and wires the existing SG-03/SG-02 attachment
// service into player flight. SG-02 owns momentum exchange; this system only targets,
// reels, cuts, and emits player-facing gameplay events.
import { lockedHostileEntity } from '../combat/autoTargetMode.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { isHostileToPlayer } from './scanner.js';
import { massline2Flag } from '../data/featureFlags.js';

const TETHER_DEF_ID = 'tether_standard';
const STRAIN_EVENT_INTERVAL_S = 0.2;
const RELATCH_COOLDOWN_S = 0.25;   // after cut/break — prevents same-press ghost re-latches
const TAP_CUT_DELAY_S = 0.22;       // lets held G become reel-in instead of immediate release
const CAPTURE_SLACK_S = 0.1;
const STRETCH_EPSILON = 0.05;
// Overnight B1: soft latch was pixel-tight at combat speed. Base grace is generous; Flyby Focus
// multiplies further via latchGraceScale(state). Exported for check:overnight:playable.
export const CURSOR_LATCH_GRACE = 36;
export const CURSOR_LATCH_GRACE_MAX = 96;
export const AIM_RAY_GRACE = 22;
export const AIM_RAY_GRACE_MAX = 64;
const MIN_AIM_RAY_LENGTH = 18;
const SLINGSHOT_STATE_S = 1.0;
const SLINGSHOT_SPEED_MULT = 1.4;
// Presentation load (massline rung 04): phase floors so the cable reads "working" the moment the
// phase says so, even while the physical break ratio (strain) is still low. strain*2.5 lets real
// tension overtake the floor well before break. tether.load is presentation-only — tether.strain
// stays the untouched physical break ratio (near-break sparks, break threshold).
const LOAD_STRAIN_GAIN = 2.5;
const LOAD_BASE_BY_PHASE = Object.freeze({ slack: 0, capture: 0.35, loaded: 0.55, overload: 0.9 });
// Pickups are valid massline targets now; attachment liveness sweeps cut the line if a pickup is
// collected/despawned, so the old invisible-anchor failure mode stays closed.
const ATTACHABLE_TYPES = new Set(['asteroid', 'wreck', 'ship', 'drone', 'station', 'payload', 'pickup']);
const TOW_TARGET_COM_TYPES = new Set(['wreck', 'ship', 'drone', 'payload', 'pickup']);

export const tetherGameplay = {
  id: 'tetherGameplay',
  name: 'tetherGameplay',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this.registry = ctx.registry;
    this._targetScratch = [];
    this._active = null;
    this._lastStrainT = -Infinity;
    this._noRelatchUntil = -Infinity;
    this._pendingCut = null;
    this._ignoreReleaseCutUntilReelIdle = false;
    this._latchGraceUntil = 0;
    this._reelStrength = 0;
    this._resetPhaseMirror();
  },

  update(dt, state) {
    this._tickSlingshotState(state, dt);
    if (state.mode !== 'flight') { this._resetGestureState(); this._resetPhaseMirror(); this._mirror(state, null, 0); return; }
    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    if (!player || !player.alive || (player.flags && player.flags.docked)) { this._resetGestureState(); this._resetPhaseMirror(); this._mirror(state, null, 0); return; }

    const kernel = combatKernel(this);
    const attachments = kernel && kernel.attachments;
    if (!attachments) return;

    this._reconcileActive(attachments, state);
    this._adoptExisting(attachments, state);
    const actions = state.input?.actions;
    const now = Number.isFinite(state.simTime) ? state.simTime : state.tick / 60;
    const reelHeld = !!(actions?.reelDelta < 0);

    // After latch, ignore tap-to-cut until the player has held to reel or a short grace expires —
    // otherwise latch → release → press-again to winch reads as a cut on release.
    if (this._ignoreReleaseCutUntilReelIdle) {
      if (reelHeld) this._ignoreReleaseCutUntilReelIdle = false;
      else if (this._latchGraceUntil > 0 && now >= this._latchGraceUntil) this._ignoreReleaseCutUntilReelIdle = false;
    }

    if (this._active && !this._pendingCut && !this._ignoreReleaseCutUntilReelIdle && actions?.tetherCut) {
      this._pendingCut = {
        attachmentId: this._active.attachmentId,
        targetId: this._active.targetId,
        requestedAt: now,
        firstTick: state.tick,
      };
    }

    if (this._active && this._pendingCut) {
      const releasedAfterPress = !reelHeld && state.tick !== this._pendingCut.firstTick;
      const heldLongEnough = now - this._pendingCut.requestedAt >= TAP_CUT_DELAY_S;
      if (releasedAfterPress) {
        const targetId = this._active.targetId;
        const cutPayload = this._cutPayload(state, player, targetId);
        const result = attachments.cut(this._active.attachmentId, player.id, 'tether_cut');
        // attachment_missing = the orphan sweep already broke it (target died) and reconcile
        // emitted the event — only emit released on a cut WE performed.
        if (result && result.ok) {
          if (cutPayload.slingshot) this._grantSlingshotState(state, SLINGSHOT_STATE_S);
          this.bus.emit('tether:cut', cutPayload);
          this.bus.emit('tether:released', { targetId });
          this.bus.emit('tether:releaseRated', rateRelease(state, targetId));
        }
        this._active = null;
        this._pendingCut = null;
        this._noRelatchUntil = now + RELATCH_COOLDOWN_S;
        this._resetPhaseMirror();
        this._mirror(state, null, 0);
        return;
      }
      // Holding F is reel intent — cancel the pending cut once the tap window expires so release
      // does not cut. Reeling itself is never blocked by pendingCut (see _reelActive below).
      if (reelHeld && heldLongEnough) {
        this._pendingCut = null;
      }
    }

    if (this._active) {
      // Liveness belt-and-braces on the gameplay side: if the target vanished this tick and the
      // service sweep hasn't caught it yet, force the cut ourselves rather than orbit a ghost.
      const target = state.entities.get(this._active.targetId);
      if (!target || target.alive === false) {
        attachments.cut(this._active.attachmentId, player.id, 'target_lost');
        this.bus.emit('tether:broke', { targetId: this._active.targetId });
        this.bus.emit('tether:releaseRated', rateRelease(state, this._active.targetId));
        this._active = null;
        this._pendingCut = null;
        this._ignoreReleaseCutUntilReelIdle = false;
        this._noRelatchUntil = now + RELATCH_COOLDOWN_S;
        this._resetPhaseMirror();
        this._mirror(state, null, 0);
        return;
      }
      const reeled = this._reelActive(attachments, actions?.reelDelta, dt);
      this._updateReelStrength(reelHeld, reeled, dt);
      this._emitStrain(attachments, state);
      const att = attachments.get(this._active.attachmentId);
      const phase = this._phaseFor(state, att, dt, this._lastStrainRatio || 0);
      this._mirror(state, this._active.targetId, this._lastStrainRatio || 0, att ? att.restLength : 0, phase, reelHeld);
      return;
    }

    this._reelStrength = 0;
    this._resetPhaseMirror();
    this._mirror(state, null, 0);
    if (!actions?.tetherFire) return;
    if (now < this._noRelatchUntil) return;
    const def = attachmentDef(kernel, TETHER_DEF_ID);
    if (!def) return;
    const nearestMode = state.input?.tetherMode === 'nearest' || softNearestPreferred(state, player);
    const latch = this._acquireTarget(player, def, state, nearestMode);
    const target = latch && latch.entity;
    if (!target) return;

    // Context-aware attachment (Wave M2 §3.2, flag massline2.contextAttach — OFF headless): one
    // tether key, intent read from the target. A HOSTILE ship keeps the authored nose anchor —
    // facing him is the point (flee-chases keep your guns on him; orbits hold him at your focal
    // point). Everything else is a TOW: the player-side anchor moves to the hull center so
    // hauling a rock/wreck/neutral (hitchhiking, §5.1) pulls through the center of mass instead
    // of torquing the nose around.
    const attachWorlds = contextualAttachmentWorlds(player, target, latch.targetWorld, state);
    const result = attachments.create({
      defId: TETHER_DEF_ID,
      ownerId: player.id,
      targetId: target.id,
      ...attachWorlds,
    });
    if (!result || !result.ok || !result.attachment) return;

    this._active = {
      attachmentId: result.attachment.id,
      targetId: target.id,
      type: TETHER_DEF_ID,
    };
    this._resetPhaseMirror();
    this._lastStrainT = -Infinity;
    this._ignoreReleaseCutUntilReelIdle = true;
    this._latchGraceUntil = now + 0.55;
    this.bus.emit('tether:latched', { targetId: target.id, type: TETHER_DEF_ID });
    // Juice: acknowledge latch within one frame (constitution input ACK).
    this.bus.emit('audio:cue', { id: 'ui_confirm' });
    this.bus.emit('camera:shake', { amount: 0.06 });
  },

  _acquireTarget(player, def, state, nearestMode = false) {
    const maxLength = positive(def && def.maxLength, positive(def && def.break && def.break.maxLength, 390));
    // Flyby Focus is an exact-target lease, not a request for generic nearest-object assistance.
    // Validate the leased entity at the moment F is consumed, then resolve it before every lower-
    // authority selected-target/cursor/nearest path so dense rocks and traffic cannot steal it.
    const focus = state.player?.flybyFocus;
    const focusTarget = focus?.active && focus.targetId != null
      ? state.entities?.get(focus.targetId)
      : null;
    if (isAuthorizedFocusTarget(state, player, focusTarget)) {
      const focusDx = focusTarget.pos.x - player.pos.x;
      const focusDz = focusTarget.pos.z - player.pos.z;
      const focusDistance = Math.hypot(focusDx, focusDz);
      if (focusDistance <= maxLength + (focusTarget.radius || 0)) {
        return { entity: focusTarget, targetWorld: surfacePointToward(focusTarget, player.pos) };
      }
    }
    const locked = lockedHostileEntity(state);
    if (locked && isAttachable(locked, player.id) && isHostileToPlayer(locked, player.team, state)) {
      const lockDx = locked.pos.x - player.pos.x;
      const lockDz = locked.pos.z - player.pos.z;
      const lockDistance = Math.hypot(lockDx, lockDz);
      if (lockDistance <= maxLength + (locked.radius || 0)) {
        return { entity: locked, targetWorld: surfacePointToward(locked, player.pos) };
      }
    }
    const aim = aimWorldFor(player, state, maxLength);
    const candidates = queryNearbyEntities(
      state,
      player.pos,
      maxLength,
      this._targetScratch,
      state.entityList || [],
    );

    let best = null;
    let bestScore = Infinity;
    let bestId = Infinity;
    let bestTargetWorld = null;
    const aimDx = aim.x - player.pos.x;
    const aimDz = aim.z - player.pos.z;
    const aimLen = Math.hypot(aimDx, aimDz);
    const ux = aimLen > 1e-6 ? aimDx / aimLen : Math.cos(state.input?.aimAngle || player.rot || 0);
    const uz = aimLen > 1e-6 ? aimDz / aimLen : Math.sin(state.input?.aimAngle || player.rot || 0);
    const rayLength = Math.max(MIN_AIM_RAY_LENGTH, Math.min(maxLength, aimLen || maxLength));

    for (const entity of candidates) {
      if (!isAttachable(entity, player.id)) continue;
      const dxPlayer = entity.pos.x - player.pos.x;
      const dzPlayer = entity.pos.z - player.pos.z;
      const playerDistance = Math.hypot(dxPlayer, dzPlayer);
      if (playerDistance > maxLength + (entity.radius || 0)) continue;

      let score = Infinity;
      let targetWorld = null;
      if (nearestMode) {
        score = Math.max(0, playerDistance - (entity.radius || 0));
        targetWorld = surfacePointToward(entity, player.pos);
      } else {
        const hit = cursorAimScore(entity, aim, player, ux, uz, rayLength, state);
        score = hit.score;
        targetWorld = hit.targetWorld;
      }
      if (!Number.isFinite(score)) continue;
      const id = sortableId(entity.id);
      if (score < bestScore || (score === bestScore && id < bestId)) {
        best = entity;
        bestScore = score;
        bestId = id;
        bestTargetWorld = targetWorld;
      }
    }
    return best ? { entity: best, targetWorld: bestTargetWorld || surfacePointToward(best, player.pos) } : null;
  },

  // Adopt a player-owned active tether we aren't tracking: after save-reload (this._active is
  // system-private and does not persist) or when a scenario script created the attachment. Keeps
  // the mirror/HUD/cable deterministic across reloads — without this, an uninterrupted run and a
  // reloaded run disagree about state.player.tether and the replay hash diverges.
  _adoptExisting(attachments, state) {
    if (this._active || typeof attachments.listForEntity !== 'function') return;
    const owned = attachments.listForEntity(state.playerId, true);
    for (const attachment of owned) {
      if (attachment.ownerId !== state.playerId) continue;
      this._active = {
        attachmentId: attachment.id,
        targetId: attachment.targetId,
        type: attachment.defId,
      };
      this._resetPhaseMirror();
      this._lastStrainT = -Infinity;
      return;
    }
  },

  _reconcileActive(attachments, state) {
    if (!this._active) return;
    const attachment = attachments.get(this._active.attachmentId);
    if (attachment && attachment.state === 'active') return;
    const targetId = this._active.targetId;
    const reason = attachment && attachment.breakReason;
    this._active = null;
    this._pendingCut = null;
    const now = Number.isFinite(state.simTime) ? state.simTime : state.tick / 60;
    this._noRelatchUntil = now + RELATCH_COOLDOWN_S;
    if (reason === 'tether_cut') {
      this.bus.emit('tether:released', { targetId });
      this.bus.emit('tether:releaseRated', rateRelease(state, targetId));
    } else {
      this.bus.emit('tether:broke', { targetId });
      this.bus.emit('tether:releaseRated', rateRelease(state, targetId));
    }
    this._lastStrainT = -Infinity;
    this._resetPhaseMirror();
  },

  _reelActive(attachments, reelDelta, dt) {
    if (!this._active || !Number.isFinite(reelDelta) || reelDelta === 0) return false;
    const attachment = attachments.get(this._active.attachmentId);
    if (!attachment || attachment.state !== 'active') return false;
    const kernel = combatKernel(this);
    const def = attachmentDef(kernel, attachment.defId);
    if (!def) return false;

    const policy = typeof attachments.reelPolicy === 'function' ? attachments.reelPolicy(attachment.id) : null;
    const reelRate = policy && Number.isFinite(policy.reelRate) ? policy.reelRate : def.reelRate;
    const maxStep = positive(reelRate, 0) * Math.max(0, Number(dt) || 0);
    if (!(maxStep > 0)) return false;
    const requested = clamp(reelDelta, -maxStep, maxStep);
    const minLength = positive(def.minLength, 0);
    const maxLength = positive(def.maxLength, Infinity);
    const before = attachment.restLength || 0;
    const next = clamp(before + requested, minLength, maxLength);
    const delta = next - before;
    if (Math.abs(delta) <= 1e-6) return false;
    const result = attachments.reel(attachment.id, delta, minLength);
    if (!result || !result.ok) return false;
    const after = result.attachment && result.attachment.restLength;
    return Number.isFinite(after) && after < before - 1e-6;
  },

  _updateReelStrength(reelHeld, reeled, dt) {
    const step = Math.max(0, Number(dt) || 0);
    const target = reelHeld ? (reeled ? 1 : 0.42) : 0;
    const rate = target > this._reelStrength ? 9 : 5;
    this._reelStrength += (target - this._reelStrength) * (1 - Math.exp(-rate * step));
    if (!reelHeld && this._reelStrength < 0.01) this._reelStrength = 0;
  },

  _emitStrain(attachments, state) {
    if (!this._active) return;
    const now = Number.isFinite(state.simTime) ? state.simTime : state.tick / 60;
    if (now - this._lastStrainT < STRAIN_EVENT_INTERVAL_S) return;
    const attachment = attachments.get(this._active.attachmentId);
    if (!attachment || attachment.state !== 'active') return;
    const kernel = combatKernel(this);
    const def = attachmentDef(kernel, attachment.defId);
    const policy = typeof attachments.breakPolicy === 'function' ? attachments.breakPolicy(attachment.id) : null;
    const threshold = positive(
      (policy && policy.maxTension) || (def && (def.breakTension || (def.break && def.break.maxTension))),
      0,
    );
    if (!(threshold > 0)) return;
    const ratio = Math.max(0, finite(attachment.lastTension) / threshold);
    this._lastStrainT = now;
    this._lastStrainRatio = ratio;
    this.bus.emit('tether:strain', { ratio });
  },

  _phaseFor(state, attachment, dt, strain) {
    if (!attachment || attachment.state !== 'active') return 'slack';
    const telemetry = attachmentTelemetry(this.helpers, attachment, state);
    if (telemetry && telemetry.phase) return normalizePhase(telemetry.phase);

    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    const target = state.entities && state.entities.get ? state.entities.get(attachment.targetId) : null;
    if (!player || !target || !player.pos || !target.pos) return strain >= 0.75 ? 'overload' : 'loaded';

    const restLength = positive(attachment.restLength, 0);
    const distance = Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z);
    const stretch = Math.max(0, distance - restLength);
    const phase = this._phaseMirror || (this._phaseMirror = createPhaseMirror());
    const step = Math.max(0, Number(dt) || 0);
    if (!(stretch > STRETCH_EPSILON)) {
      phase.slackS += step;
      phase.captureT = 0;
      phase.captureActive = false;
      phase.wasTaut = false;
      return 'slack';
    }

    if (!phase.wasTaut && phase.slackS >= CAPTURE_SLACK_S) {
      phase.captureActive = true;
      phase.captureT = 0;
    }
    phase.wasTaut = true;
    phase.slackS = 0;
    const def = attachmentDef(combatKernel(this), attachment.defId);
    const captureS = positive(def && def.spring && def.spring.captureS, 0.35);
    if (phase.captureActive && phase.captureT < captureS) {
      phase.captureT += step;
      if (phase.captureT >= captureS) phase.captureActive = false;
      return 'capture';
    }
    return strain >= 0.75 ? 'overload' : 'loaded';
  },

  _resetPhaseMirror() {
    this._phaseMirror = createPhaseMirror();
  },

  _resetGestureState() {
    this._pendingCut = null;
    this._ignoreReleaseCutUntilReelIdle = false;
    this._latchGraceUntil = 0;
  },

  _tickSlingshotState(state, dt) {
    const t = state && state.player && state.player.tether;
    if (!t) return;
    const next = Math.max(0, finite(t.slingshotT, 0) - Math.max(0, finite(dt, 0)));
    t.slingshotT = next;
    t.slingshot = next > 0;
  },

  _grantSlingshotState(state, seconds) {
    const player = state.player || (state.player = {});
    const t = player.tether || (player.tether = { active: false, targetId: null, strain: 0, load: 0, attachmentId: null, restLength: 0, phase: 'slack' });
    t.slingshotT = Math.max(finite(t.slingshotT, 0), positive(seconds, SLINGSHOT_STATE_S));
    t.slingshot = t.slingshotT > 0;
  },

  _cutPayload(state, player, targetId) {
    const vx = finite(player && player.vel && player.vel.x, 0);
    const vz = finite(player && player.vel && player.vel.z, 0);
    const speed = Math.hypot(vx, vz);
    const maxSpeed = positive(player && player.maxSpeed, 120);
    return {
      targetId,
      velocity: { x: vx, z: vz },
      speed,
      slingshot: speed >= maxSpeed * SLINGSHOT_SPEED_MULT,
    };
  },

  // Mirror the tether state onto state.player.tether for HUD/VFX consumers (single-owner rule:
  // they read, we write). null targetId = no tether. restLength lets the cable visual compute
  // real slack (restLength - distance) instead of guessing from strain.
  _mirror(state, targetId, strain, restLength = 0, phase = 'slack', reelHeld = false) {
    const player = state.player || (state.player = {});
    const t = player.tether || (player.tether = { active: false, targetId: null, strain: 0, load: 0, attachmentId: null, restLength: 0, phase: 'slack' });
    t.active = targetId != null;
    t.targetId = targetId;
    t.strain = strain || 0;
    t.restLength = restLength || 0;
    t.phase = t.active ? normalizePhase(phase) : 'slack';
    t.load = t.active ? computeTetherLoad(t.phase, t.strain) : 0;
    t.attachmentId = this._active ? this._active.attachmentId : null;
    t.reeling = !!(t.active && reelHeld);
    t.reelStrength = t.active ? finite(this._reelStrength, 0) : 0;
    t.slingshotT = Math.max(0, finite(t.slingshotT, 0));
    t.slingshot = t.slingshotT > 0;
  },
};

/** Resolve context-aware world anchors once at latch time. Hostile ships retain the authored
 * nose-to-surface combat line. Towable dynamic bodies use COM-to-COM so neither endpoint gains
 * accidental steering torque; immovable asteroids/stations retain a readable surface endpoint. */
export function contextualAttachmentWorlds(player, target, acquiredTargetWorld, state) {
  const hostileCraft = (target && (target.type === 'ship' || target.type === 'drone'))
    && isHostileToPlayer(target, player && player.team, state);
  const towAttach = massline2Flag('contextAttach') && !hostileCraft;
  if (!towAttach) return { targetWorld: acquiredTargetWorld };
  const targetWorld = target && TOW_TARGET_COM_TYPES.has(target.type)
    ? { x: target.pos.x, y: 0, z: target.pos.z }
    : acquiredTargetWorld;
  return {
    sourceWorld: { x: player.pos.x, y: 0, z: player.pos.z },
    targetWorld,
  };
}

function combatKernel(host) {
  const actions = host.registry && host.registry.get && host.registry.get('actions');
  if (actions && actions.kernel) return actions.kernel;
  const combat = host.registry && host.registry.get && host.registry.get('combat');
  return combat && combat.kernel ? combat.kernel : null;
}

function attachmentDef(kernel, id) {
  return kernel && kernel.catalog && kernel.catalog.attachments && kernel.catalog.attachments.get(id) || null;
}

function attachmentTelemetry(helpers, attachment, state) {
  const physics = helpers && helpers.combatPhysics;
  if (!physics || typeof physics.getAttachmentTelemetry !== 'function') return null;
  try {
    return physics.getAttachmentTelemetry({
      attachmentId: attachment.id,
      physicsHandle: attachment.physicsHandle,
      tick: state && state.tick,
    });
  } catch (_) {
    return null;
  }
}

function normalizePhase(value) {
  if (value === 'capture' || value === 'loaded' || value === 'overload') return value;
  return 'slack';
}

// Presentation load (rung 04): 0..1 "how worked is the line" for HUD/VFX ordinary glow.
// load = clamp(max(strain * LOAD_STRAIN_GAIN, LOAD_BASE_BY_PHASE[phase]), 0, 1)
// Guarantees: inactive/slack ≈ 0 (no floor, strain ~0), capture ≥ 0.35 the moment the line goes
// taut, loaded ≥ 0.55 even at low strain, overload ≥ 0.9. Never mutates strain.
export function computeTetherLoad(phase, strain) {
  const base = LOAD_BASE_BY_PHASE[normalizePhase(phase)] || 0;
  const s = Number.isFinite(strain) && strain > 0 ? strain : 0;
  return clamp(Math.max(s * LOAD_STRAIN_GAIN, base), 0, 1);
}

// Release rating (Prompt 02). Reads state.player.masslineTelemetry, which masslineTelemetry.js
// writes immediately after tetherGameplay in UPDATE_ORDER. Because telemetry runs after this
// system, at cut time the subtree reflects the most recent observed tick — exactly what the spec
// means by "use the current state.player.masslineTelemetry if available." If telemetry is absent
// (no system ran, fresh state, etc.) we still emit a release rating with classification "messy"
// and zeroed numeric fields, per spec.
export function rateRelease(state, targetId) {
  const telemetry = state && state.player && state.player.masslineTelemetry;
  if (!telemetry) {
    return {
      targetId,
      classification: 'messy',
      releaseScore: 0,
      radialSpeed: 0,
      tangentialSpeed: 0,
      angularSpeed: 0,
      strain: 0,
      distance: 0,
      restLength: 0,
      playerSpeed: 0,
      maxStrainSinceLatch: 0,
      maxTangentialSpeedSinceLatch: 0,
      maxAngularSpeedSinceLatch: 0,
    };
  }

  const strain = finite(telemetry.strain, 0);
  const absTangential = Math.abs(finite(telemetry.tangentialSpeed, 0));
  const absRadial = Math.abs(finite(telemetry.radialSpeed, 0));
  const tangentQuality = absTangential / Math.max(absTangential + absRadial, 1e-6);
  const usefulLoad = clamp01(strain / 0.65);
  const overloadPenalty = clamp01((strain - 0.85) / 0.35);
  const releaseScore = clamp01(tangentQuality * usefulLoad * (1 - overloadPenalty));

  let classification;
  if (releaseScore >= 0.85) classification = 'razor';
  else if (releaseScore >= 0.65) classification = 'clean';
  else if (releaseScore >= 0.35) classification = 'good';
  else classification = 'messy';

  return {
    targetId,
    classification,
    releaseScore,
    radialSpeed: finite(telemetry.radialSpeed, 0),
    tangentialSpeed: finite(telemetry.tangentialSpeed, 0),
    angularSpeed: finite(telemetry.angularSpeed, 0),
    strain,
    distance: finite(telemetry.distance, 0),
    restLength: finite(telemetry.restLength, 0),
    playerSpeed: finite(telemetry.playerSpeed, 0),
    maxStrainSinceLatch: finite(telemetry.maxStrainSinceLatch, 0),
    maxTangentialSpeedSinceLatch: finite(telemetry.maxTangentialSpeedSinceLatch, 0),
    maxAngularSpeedSinceLatch: finite(telemetry.maxAngularSpeedSinceLatch, 0),
  };
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function createPhaseMirror() {
  return { slackS: CAPTURE_SLACK_S, captureT: 0, captureActive: false, wasTaut: false };
}

function aimWorldFor(player, state, range) {
  const aim = state.input?.aimWorld;
  if (Number.isFinite(aim?.x) && Number.isFinite(aim?.z)) return { x: aim.x, z: aim.z };
  const angle = Number.isFinite(state.input?.aimAngle) ? state.input.aimAngle : (player.rot || 0);
  return {
    x: player.pos.x + Math.cos(angle) * range,
    z: player.pos.z + Math.sin(angle) * range,
  };
}

function isAttachable(entity, playerId) {
  if (!entity || !entity.alive || !entity.pos || entity.id === playerId) return false;
  return ATTACHABLE_TYPES.has(entity.type);
}

function isAuthorizedFocusTarget(state, player, target) {
  if (!isAttachable(target, player?.id)) return false;
  if (target.type !== 'ship' && target.type !== 'drone') return false;
  const training = target.data?.onboardingTraining === true
    && target.data?.trainingFocusEligible === true;
  return training || isHostileToPlayer(target, player?.team, state);
}

/** Presentation/play scale: Flyby Focus and future assists widen latch without changing physics. */
export function latchGraceScale(state) {
  const focus = state && state.player && state.player.flybyFocus;
  if (focus && focus.active) return Math.max(1, Number(focus.latchScale) || 2.4);
  return 1;
}

function softNearestPreferred(state, player) {
  if (!player || !player.pos) return false;
  // Flyby Focus is the authored high-speed assist. Ordinary fast travel keeps cursor/ray scoring
  // so nearby stations, rocks, and pickups cannot steal an aimed massline shot.
  const focus = state && state.player && state.player.flybyFocus;
  return !!(focus && focus.active);
}

export function cursorAimScore(entity, aim, player, ux, uz, rayLength, state = null) {
  const radius = Math.max(0, finite(entity && entity.radius));
  const dxAim = aim.x - entity.pos.x;
  const dzAim = aim.z - entity.pos.z;
  const aimDistance = Math.hypot(dxAim, dzAim);
  const surfaceMiss = Math.max(0, aimDistance - radius);
  const scale = latchGraceScale(state);
  const cursorGrace = Math.min(CURSOR_LATCH_GRACE_MAX * scale, (CURSOR_LATCH_GRACE + radius * 0.85) * scale);
  if (surfaceMiss <= cursorGrace) {
    return {
      score: surfaceMiss * 2 + Math.max(0, Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z) - radius) * 0.015,
      targetWorld: surfacePointToward(entity, aim),
    };
  }

  const dx = entity.pos.x - player.pos.x;
  const dz = entity.pos.z - player.pos.z;
  const along = dx * ux + dz * uz;
  if (along < -radius || along > rayLength + radius) return { score: Infinity, targetWorld: null };
  const perp = Math.abs(dx * uz - dz * ux);
  const rayGrace = Math.min(AIM_RAY_GRACE_MAX * scale, (AIM_RAY_GRACE + radius * 0.7) * scale);
  if (Math.max(0, perp - radius) > rayGrace) return { score: Infinity, targetWorld: null };
  const closest = {
    x: player.pos.x + ux * clamp(along, 0, rayLength),
    z: player.pos.z + uz * clamp(along, 0, rayLength),
  };
  return {
    score: 1000 + Math.max(0, perp - radius) * 12 + along * 0.04,
    targetWorld: surfacePointToward(entity, closest),
  };
}

function surfacePointToward(entity, worldPoint) {
  const radius = Math.max(0, finite(entity && entity.radius));
  if (!(radius > 0) || !worldPoint) return { x: entity.pos.x, y: 0, z: entity.pos.z };
  const dx = finite(worldPoint.x, entity.pos.x) - entity.pos.x;
  const dz = finite(worldPoint.z, entity.pos.z) - entity.pos.z;
  const d = Math.hypot(dx, dz);
  if (!(d > 1e-6)) return { x: entity.pos.x, y: 0, z: entity.pos.z };
  const contactRadius = radius * 0.72;
  return {
    x: entity.pos.x + dx / d * contactRadius,
    y: 0,
    z: entity.pos.z + dz / d * contactRadius,
  };
}

function sortableId(id) {
  return Number.isFinite(id) ? id : String(id).charCodeAt(0);
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}
