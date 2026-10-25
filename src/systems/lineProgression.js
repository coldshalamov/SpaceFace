// LINE-03/04/05 (build_map rows 498–501): the Line's own memory. Tonnage the player has
// actually held on the line advances the Line Class ladder; the current class sets the
// control ceiling the strain contract reads (`fullControlMassT`), and record holds /
// class-ups stamp CORRECT. marks on the wall. The bag lives at `state.lineProgression`
// and serializes through the standard system-bag envelope so old saves normalize to
// defaults. Strain (row 499): while a held body exceeds the class ceiling the Line
// strains — the bag exposes `overClass`/`winchHeat`, the reel/turn clamps below are
// exported for the tether owner to read, and at the heat cap this system cuts the line
// through the shared attachments authority after the grace window so the break emits
// the ordinary receipts (tether:broke + release rating) and stays honest in replays.

import {
  normalizeLineProgression,
  lineClassForTonnage,
  lineClassForIndex,
  stampLineRecord,
} from '../data/lineProgression.js';

// Sustained-overclass strain constants. Heat is normalized 0→1 at the cap.
const OVERCLASS_REEL_FACTOR = 0.62;
const OVERCLASS_TURN_FACTOR = 0.55;
const OVERCLASS_SNAP_TENSION_FACTOR = 1.35;
const OVERCLASS_HEAT_PER_S = 0.16;
const OVERCLASS_HEAT_DECAY_PER_S = 0.22;
const OVERCLASS_SNAP_GRACE_S = 1.6;

function bodyMassOf(entity) {
  const pb = entity && entity.physicsBody && Number(entity.physicsBody.mass);
  if (Number.isFinite(pb) && pb > 0) return pb;
  const m = entity && Number(entity.mass);
  return Number.isFinite(m) && m > 0 ? m : 1;
}

function simNow(state) {
  return Number.isFinite(state && state.simTime) ? state.simTime : 0;
}

export const lineProgression = {
  name: 'lineProgression',

  init(ctx = {}) {
    this.state = ctx.state || null;
    this.bus = ctx.bus || null;
    this.registry = ctx.registry || null;
    this._heldTargetId = null;
    this._heldMassT = 0;
    this._heldAttachmentId = null;
    this._snapGraceUntil = 0;
    this._restoreLoadedHold = false;
    if (!this.state) return;
    this._ensureBag(this.state);
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('tether:latched', (payload = {}) => this._onLatched(payload));
      this.bus.on('tether:released', (payload = {}) => this._onLineEnd(payload));
      this.bus.on('tether:broke', (payload = {}) => this._onLineEnd(payload));
      this.bus.on('save:loaded', () => {
        this._restoreLoadedHold = true;
        this._reconcileLoadedHold();
      });
    }
  },

  _ensureBag(state) {
    state.lineProgression = normalizeLineProgression(state.lineProgression);
    return state.lineProgression;
  },

  _player() {
    const s = this.state;
    if (!s) return null;
    if (s.player && s.player.id != null) return s.player;
    return (s.playerId != null && s.entities && typeof s.entities.get === 'function')
      ? s.entities.get(s.playerId) || null
      : null;
  },

  _attachments() {
    // The registered combat owner holds the attachments kernel — the init context carries
    // no `kernel` key on the production route.
    const registry = this.registry;
    const combat = registry && typeof registry.get === 'function' ? registry.get('combat') : null;
    const kernel = combat
      ? (typeof combat.ensureKernel === 'function' ? combat.ensureKernel() : combat.kernel)
      : null;
    return kernel && kernel.attachments ? kernel.attachments : null;
  },

  _onLatched(payload = {}) {
    const state = this.state;
    if (!state) return;
    const bag = this._ensureBag(state);
    const target = state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(payload.targetId)
      : null;
    this._heldTargetId = payload.targetId ?? null;
    this._heldMassT = target ? bodyMassOf(target) : 0;
    this._snapGraceUntil = 0;
    this._restoreLoadedHold = false;
    const player = this._player();
    const attachments = this._attachments();
    this._heldAttachmentId = null;
    if (player && attachments && typeof attachments.listForEntity === 'function') {
      const held = attachments.listForEntity(player.id, true)
        .find((a) => a && a.state === 'active' && a.targetId === this._heldTargetId);
      this._heldAttachmentId = held ? held.id : null;
    }
    if (this._heldMassT > bag.highestHeldMassT) {
      bag.highestHeldMassT = this._heldMassT;
      if (this._heldMassT > 0) {
        this._stampRecord(bag, 'heaviest_hold', `${Math.round(this._heldMassT)} T. CORRECT.`);
      }
    }
    if (Math.abs(this._heldMassT - 12.4) <= .05) {
      this._stampRecord(bag, 'exact_mass', '12,400 KG. THEY KNEW THE MASS. SO DO YOU.');
    }
  },

  _stampRecord(bag, kind, text) {
    const stamp = stampLineRecord(bag, kind, text, simNow(this.state));
    if (stamp && typeof this.bus?.emit === 'function') this.bus.emit('line:recordStamped', { ...stamp, playerId: this.state.playerId });
    return stamp;
  },

  _reconcileLoadedHold() {
    if (!this._restoreLoadedHold) return;
    const state = this.state, tether = state?.player?.tether;
    const player = state?.entities?.get?.(state.playerId);
    const target = state?.entities?.get?.(tether?.targetId);
    const attachments = this._attachments();
    if (!attachments || typeof attachments.listForEntity !== 'function') return;
    this._restoreLoadedHold = false;
    this._heldTargetId = null; this._heldMassT = 0; this._heldAttachmentId = null; this._snapGraceUntil = 0;
    if (!tether?.active || !player || player.alive === false || !target || target.alive === false) return;
    // A serialized UI mirror cannot recreate a constraint. Only an active, player-controlled
    // attachment in the loaded combat authority can resume heat, control costs and a snap.
    const held = attachments.listForEntity(player.id, true).find(a => a?.state === 'active'
      && (a.ownerId === player.id || a.controllerId === player.id)
      && a.targetId === target.id && (tether.attachmentId == null || a.id === tether.attachmentId));
    if (!held) return;
    this._heldTargetId = target.id;
    this._heldMassT = bodyMassOf(target);
    this._heldAttachmentId = held.id;
  },

  _onLineEnd(payload = {}) {
    const state = this.state;
    if (!state) {
      this._heldTargetId = null;
      this._heldMassT = 0;
      this._heldAttachmentId = null;
      return;
    }
    const bag = this._ensureBag(state);
    const targetId = payload.targetId ?? this._heldTargetId;
    if (targetId != null && targetId === this._heldTargetId && this._heldMassT > 0) {
      bag.tonnageLoggedT += this._heldMassT;
      this._recomputeClass(state, bag);
    }
    this._heldTargetId = null;
    this._heldMassT = 0;
    this._heldAttachmentId = null;
    this._snapGraceUntil = 0;
  },

  _recomputeClass(state, bag) {
    const nextIndex = lineClassForTonnage(bag.tonnageLoggedT, bag.grantedClassSteps + bag.trialClassSteps);
    if (nextIndex > (bag.classIndex || 1)) {
      bag.classIndex = nextIndex;
      const cls = lineClassForIndex(nextIndex);
      this._stampRecord(bag, 'class_up', `LINE CLASS ${cls.label} — CORRECT.`);
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit('line:classChanged', {
          classIndex: nextIndex,
          classId: cls.id || null,
          label: cls.label,
          fullControlMassT: cls.fullControlMassT,
          tonnageLoggedT: bag.tonnageLoggedT,
        });
      }
    } else {
      bag.classIndex = nextIndex;
    }
  },

  update(dt, state) {
    this._reconcileLoadedHold();
    const bag = this._ensureBag(state);
    const cls = lineClassForIndex(bag.classIndex);
    const over = this._heldMassT > 0 && this._heldMassT > cls.fullControlMassT;
    bag.overClass = over === true;
    bag.classFullControlMassT = cls.fullControlMassT;
    bag.overClassReelFactor = over ? OVERCLASS_REEL_FACTOR : 1;
    bag.overClassTurnFactor = over ? OVERCLASS_TURN_FACTOR : 1;
    bag.overClassSnapTensionFactor = over ? OVERCLASS_SNAP_TENSION_FACTOR : 1;
    if (over) {
      bag.winchHeat = Math.min(1, (bag.winchHeat || 0) + OVERCLASS_HEAT_PER_S * dt);
      if (bag.winchHeat >= 1 && this._heldTargetId != null) {
        const now = simNow(state);
        if (!this._snapGraceUntil) this._snapGraceUntil = now + OVERCLASS_SNAP_GRACE_S;
        if (now >= this._snapGraceUntil) {
          const player = this._player();
          const attachments = this._attachments();
          if (player && attachments && this._heldAttachmentId != null
              && typeof attachments.cut === 'function') {
            attachments.cut(this._heldAttachmentId, player.id, 'line_overclass_snap');
          }
          bag.winchHeat = 0;
          this._snapGraceUntil = 0;
        }
      }
    } else {
      bag.winchHeat = Math.max(0, (bag.winchHeat || 0) - OVERCLASS_HEAT_DECAY_PER_S * dt);
      this._snapGraceUntil = 0;
    }
  },

  // FRESH_RUN_SYSTEMS — New Game starts at class I with an empty ledger and no held body.
  newGame() {
    this._restoreLoadedHold = false;
    this._heldTargetId = null;
    this._heldMassT = 0;
    this._heldAttachmentId = null;
    this._snapGraceUntil = 0;
    if (this.state) this.state.lineProgression = normalizeLineProgression(null);
  },

  // The save dispatcher calls serialize() with no arguments and deserialize(bag) with
  // one; live state comes from this.state (set at init), not parameters.
  serialize() {
    return this.state ? { data: this._ensureBag(this.state) } : {};
  },

  deserialize(entry) {
    const state = this.state;
    if (!state) return;
    const data = entry && entry.data !== undefined ? entry.data : entry;
    state.lineProgression = normalizeLineProgression(data);
    this._heldTargetId = null; this._heldMassT = 0; this._heldAttachmentId = null; this._snapGraceUntil = 0;
    this._restoreLoadedHold = true;
  },
};

export default lineProgression;
