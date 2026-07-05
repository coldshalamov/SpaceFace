// Tether gameplay system (GDD 2.0 §4.3, BUILD_PLAN WS-D1).
// Consumes the locked input action contract and wires the existing SG-03/SG-02 attachment
// service into player flight. SG-02 owns momentum exchange; this system only targets,
// reels, cuts, and emits player-facing gameplay events.
import { queryNearbyEntities } from '../core/spatialQuery.js';

const TETHER_DEF_ID = 'tether_standard';
const STRAIN_EVENT_INTERVAL_S = 0.2;
const RELATCH_COOLDOWN_S = 0.25;   // after cut/break — prevents same-press ghost re-latches
const TAP_CUT_DELAY_S = 0.22;       // lets held G become reel-in instead of immediate release
const CAPTURE_SLACK_S = 0.1;
const STRETCH_EPSILON = 0.05;
const CURSOR_LATCH_GRACE = 18;
const CURSOR_LATCH_GRACE_MAX = 42;
const AIM_RAY_GRACE = 10;
const AIM_RAY_GRACE_MAX = 28;
const MIN_AIM_RAY_LENGTH = 18;
const SLINGSHOT_STATE_S = 1.0;
const SLINGSHOT_SPEED_MULT = 1.4;
// Pickups are valid massline targets now; attachment liveness sweeps cut the line if a pickup is
// collected/despawned, so the old invisible-anchor failure mode stays closed.
const ATTACHABLE_TYPES = new Set(['asteroid', 'wreck', 'ship', 'drone', 'station', 'payload', 'pickup']);

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
    this._resetPhaseMirror();
  },

  update(dt, state) {
    this._tickSlingshotState(state, dt);
    if (state.mode !== 'flight') { this._resetPhaseMirror(); this._mirror(state, null, 0); return; }
    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    if (!player || !player.alive || (player.flags && player.flags.docked)) { this._resetPhaseMirror(); this._mirror(state, null, 0); return; }

    const kernel = combatKernel(this);
    const attachments = kernel && kernel.attachments;
    if (!attachments) return;

    this._reconcileActive(attachments, state);
    this._adoptExisting(attachments, state);
    const actions = state.input?.actions;
    const now = Number.isFinite(state.simTime) ? state.simTime : state.tick / 60;

    if (this._active && actions?.tetherCut && !this._pendingCut) {
      this._pendingCut = {
        attachmentId: this._active.attachmentId,
        targetId: this._active.targetId,
        requestedAt: now,
        firstTick: state.tick,
      };
    }

    if (this._active && this._pendingCut && actions?.reelDelta < 0 && state.tick !== this._pendingCut.firstTick) {
      this._pendingCut = null;
    }

    if (this._active && this._pendingCut && now - this._pendingCut.requestedAt >= TAP_CUT_DELAY_S) {
      const targetId = this._active.targetId;
      const cutPayload = this._cutPayload(state, player, targetId);
      const result = attachments.cut(this._active.attachmentId, player.id, 'tether_cut');
      // attachment_missing = the orphan sweep already broke it (target died) and reconcile
      // emitted the event — only emit released on a cut WE performed.
      if (result && result.ok) {
        if (cutPayload.slingshot) this._grantSlingshotState(state, SLINGSHOT_STATE_S);
        this.bus.emit('tether:cut', cutPayload);
        this.bus.emit('tether:released', { targetId });
      }
      this._active = null;
      this._pendingCut = null;
      this._noRelatchUntil = now + RELATCH_COOLDOWN_S;
      this._resetPhaseMirror();
      this._mirror(state, null, 0);
      return;
    }

    if (this._active) {
      // Liveness belt-and-braces on the gameplay side: if the target vanished this tick and the
      // service sweep hasn't caught it yet, force the cut ourselves rather than orbit a ghost.
      const target = state.entities.get(this._active.targetId);
      if (!target || target.alive === false) {
        attachments.cut(this._active.attachmentId, player.id, 'target_lost');
        this.bus.emit('tether:broke', { targetId: this._active.targetId });
        this._active = null;
        this._pendingCut = null;
        this._noRelatchUntil = now + RELATCH_COOLDOWN_S;
        this._resetPhaseMirror();
        this._mirror(state, null, 0);
        return;
      }
      this._reelActive(attachments, actions?.reelDelta, dt);
      this._emitStrain(attachments, state);
      const att = attachments.get(this._active.attachmentId);
      const phase = this._phaseFor(state, att, dt, this._lastStrainRatio || 0);
      this._mirror(state, this._active.targetId, this._lastStrainRatio || 0, att ? att.restLength : 0, phase);
      return;
    }

    this._resetPhaseMirror();
    this._mirror(state, null, 0);
    if (!actions?.tetherFire) return;
    if (now < this._noRelatchUntil) return;
    const def = attachmentDef(kernel, TETHER_DEF_ID);
    if (!def) return;
    const latch = this._acquireTarget(player, def, state, state.input?.tetherMode === 'nearest');
    const target = latch && latch.entity;
    if (!target) return;

    const result = attachments.create({
      defId: TETHER_DEF_ID,
      ownerId: player.id,
      targetId: target.id,
      targetWorld: latch.targetWorld,
    });
    if (!result || !result.ok || !result.attachment) return;

    this._active = {
      attachmentId: result.attachment.id,
      targetId: target.id,
      type: TETHER_DEF_ID,
    };
    this._resetPhaseMirror();
    this._lastStrainT = -Infinity;
    this.bus.emit('tether:latched', { targetId: target.id, type: TETHER_DEF_ID });
  },

  _acquireTarget(player, def, state, nearestMode = false) {
    const maxLength = positive(def && def.maxLength, positive(def && def.break && def.break.maxLength, 260));
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
        const hit = cursorAimScore(entity, aim, player, ux, uz, rayLength);
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
    if (reason === 'tether_cut') this.bus.emit('tether:released', { targetId });
    else this.bus.emit('tether:broke', { targetId });
    this._lastStrainT = -Infinity;
    this._resetPhaseMirror();
  },

  _reelActive(attachments, reelDelta, dt) {
    if (!this._active || !Number.isFinite(reelDelta) || reelDelta === 0) return;
    const attachment = attachments.get(this._active.attachmentId);
    if (!attachment || attachment.state !== 'active') return;
    const kernel = combatKernel(this);
    const def = attachmentDef(kernel, attachment.defId);
    if (!def) return;

    const maxStep = positive(def.reelRate, 0) * Math.max(0, Number(dt) || 0);
    if (!(maxStep > 0)) return;
    const requested = clamp(reelDelta, -maxStep, maxStep);
    const minLength = positive(def.minLength, 0);
    const maxLength = positive(def.maxLength, Infinity);
    const next = clamp((attachment.restLength || 0) + requested, minLength, maxLength);
    const delta = next - (attachment.restLength || 0);
    if (Math.abs(delta) <= 1e-6) return;
    attachments.reel(attachment.id, delta, minLength);
  },

  _emitStrain(attachments, state) {
    if (!this._active) return;
    const now = Number.isFinite(state.simTime) ? state.simTime : state.tick / 60;
    if (now - this._lastStrainT < STRAIN_EVENT_INTERVAL_S) return;
    const attachment = attachments.get(this._active.attachmentId);
    if (!attachment || attachment.state !== 'active') return;
    const kernel = combatKernel(this);
    const def = attachmentDef(kernel, attachment.defId);
    const threshold = positive(def && (def.breakTension || (def.break && def.break.maxTension)), 0);
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

  _tickSlingshotState(state, dt) {
    const t = state && state.player && state.player.tether;
    if (!t) return;
    const next = Math.max(0, finite(t.slingshotT, 0) - Math.max(0, finite(dt, 0)));
    t.slingshotT = next;
    t.slingshot = next > 0;
  },

  _grantSlingshotState(state, seconds) {
    const player = state.player || (state.player = {});
    const t = player.tether || (player.tether = { active: false, targetId: null, strain: 0, attachmentId: null, restLength: 0, phase: 'slack' });
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
  _mirror(state, targetId, strain, restLength = 0, phase = 'slack') {
    const player = state.player || (state.player = {});
    const t = player.tether || (player.tether = { active: false, targetId: null, strain: 0, attachmentId: null, restLength: 0, phase: 'slack' });
    t.active = targetId != null;
    t.targetId = targetId;
    t.strain = strain || 0;
    t.restLength = restLength || 0;
    t.phase = t.active ? normalizePhase(phase) : 'slack';
    t.attachmentId = this._active ? this._active.attachmentId : null;
    t.slingshotT = Math.max(0, finite(t.slingshotT, 0));
    t.slingshot = t.slingshotT > 0;
  },
};

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

function cursorAimScore(entity, aim, player, ux, uz, rayLength) {
  const radius = Math.max(0, finite(entity && entity.radius));
  const dxAim = aim.x - entity.pos.x;
  const dzAim = aim.z - entity.pos.z;
  const aimDistance = Math.hypot(dxAim, dzAim);
  const surfaceMiss = Math.max(0, aimDistance - radius);
  const cursorGrace = Math.min(CURSOR_LATCH_GRACE_MAX, CURSOR_LATCH_GRACE + radius * 0.65);
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
  const rayGrace = Math.min(AIM_RAY_GRACE_MAX, AIM_RAY_GRACE + radius * 0.55);
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
