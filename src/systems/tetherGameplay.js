// Tether gameplay system (GDD 2.0 §4.3, BUILD_PLAN WS-D1).
// Consumes the locked input action contract and wires the existing SG-03/SG-02 attachment
// service into player flight. Rapier owns momentum exchange; this system only targets,
// reels, cuts, and emits player-facing gameplay events.
import { queryNearbyEntities } from '../core/spatialQuery.js';

const TETHER_DEF_ID = 'tether_standard';
const STRAIN_EVENT_INTERVAL_S = 0.2;
const RELATCH_COOLDOWN_S = 0.25;   // after cut/break — prevents same-press ghost re-latches
// Pickups are deliberately NOT attachable: the magnet system owns them, and a magnet-collected
// (despawned) tether target is how the invisible-anchor bug was born. Tether targets are things
// with presence: rocks, wrecks, ships, stations, mission payloads.
const ATTACHABLE_TYPES = new Set(['asteroid', 'wreck', 'ship', 'drone', 'station', 'payload']);

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
  },

  update(dt, state) {
    if (state.mode !== 'flight') { this._mirror(state, null, 0); return; }
    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    if (!player || !player.alive || (player.flags && player.flags.docked)) { this._mirror(state, null, 0); return; }

    const kernel = combatKernel(this);
    const attachments = kernel && kernel.attachments;
    if (!attachments) return;

    this._reconcileActive(attachments, state);
    this._adoptExisting(attachments, state);
    const actions = state.input?.actions;
    const now = Number.isFinite(state.simTime) ? state.simTime : state.tick / 60;

    if (this._active && actions?.tetherCut) {
      const targetId = this._active.targetId;
      const result = attachments.cut(this._active.attachmentId, player.id, 'tether_cut');
      // attachment_missing = the orphan sweep already broke it (target died) and reconcile
      // emitted the event — only emit released on a cut WE performed.
      if (result && result.ok) this.bus.emit('tether:released', { targetId });
      this._active = null;
      this._noRelatchUntil = now + RELATCH_COOLDOWN_S;
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
        this._noRelatchUntil = now + RELATCH_COOLDOWN_S;
        this._mirror(state, null, 0);
        return;
      }
      this._reelActive(attachments, actions?.reelDelta, dt);
      this._emitStrain(attachments, state);
      const att = attachments.get(this._active.attachmentId);
      this._mirror(state, this._active.targetId, this._lastStrainRatio || 0, att ? att.restLength : 0);
      return;
    }

    this._mirror(state, null, 0);
    if (!actions?.tetherFire) return;
    if (now < this._noRelatchUntil) return;
    const def = attachmentDef(kernel, TETHER_DEF_ID);
    if (!def) return;
    const target = this._acquireTarget(player, def, state);
    if (!target) return;

    const result = attachments.create({
      defId: TETHER_DEF_ID,
      ownerId: player.id,
      targetId: target.id,
    });
    if (!result || !result.ok || !result.attachment) return;

    this._active = {
      attachmentId: result.attachment.id,
      targetId: target.id,
      type: TETHER_DEF_ID,
    };
    this._lastStrainT = -Infinity;
    this.bus.emit('tether:latched', { targetId: target.id, type: TETHER_DEF_ID });
  },

  _acquireTarget(player, def, state) {
    const maxLength = positive(def && def.maxLength, positive(def && def.break && def.break.maxLength, 260));
    const aim = aimWorldFor(player, state, maxLength);
    const candidates = queryNearbyEntities(
      state,
      aim,
      maxLength,
      this._targetScratch,
      state.entityList || [],
    );

    let best = null;
    let bestAimD2 = Infinity;
    let bestId = Infinity;
    for (const entity of candidates) {
      if (!isAttachable(entity, player.id)) continue;
      const dxPlayer = entity.pos.x - player.pos.x;
      const dzPlayer = entity.pos.z - player.pos.z;
      const playerDistance = Math.hypot(dxPlayer, dzPlayer);
      if (playerDistance > maxLength + (entity.radius || 0)) continue;

      const dxAim = entity.pos.x - aim.x;
      const dzAim = entity.pos.z - aim.z;
      const aimD2 = dxAim * dxAim + dzAim * dzAim;
      if (aimD2 > maxLength * maxLength) continue;
      const id = sortableId(entity.id);
      if (aimD2 < bestAimD2 || (aimD2 === bestAimD2 && id < bestId)) {
        best = entity;
        bestAimD2 = aimD2;
        bestId = id;
      }
    }
    return best;
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
    const now = Number.isFinite(state.simTime) ? state.simTime : state.tick / 60;
    this._noRelatchUntil = now + RELATCH_COOLDOWN_S;
    if (reason === 'tether_cut') this.bus.emit('tether:released', { targetId });
    else this.bus.emit('tether:broke', { targetId });
    this._lastStrainT = -Infinity;
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

  // Mirror the tether state onto state.player.tether for HUD/VFX consumers (single-owner rule:
  // they read, we write). null targetId = no tether. restLength lets the cable visual compute
  // real slack (restLength - distance) instead of guessing from strain.
  _mirror(state, targetId, strain, restLength = 0) {
    const player = state.player || (state.player = {});
    const t = player.tether || (player.tether = { active: false, targetId: null, strain: 0, attachmentId: null, restLength: 0 });
    t.active = targetId != null;
    t.targetId = targetId;
    t.strain = strain || 0;
    t.restLength = restLength || 0;
    t.attachmentId = this._active ? this._active.attachmentId : null;
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
