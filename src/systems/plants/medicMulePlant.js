// PL-323 The medic mule — "Come off a round badly hurt and a medic drone trundles across to patch
// one bar, free, no bill, once per run. Accept the patch; or farm it by self-harm — the mule stops
// coming, mid-run."
//
// The between-round seam (`run:transitioned` into cleanup/draft/refit) after a badly hurt round
// (player hull fraction <= hurtFraction) sends one medic-mule prop trundling across the floor to
// you. When it reaches you it patches ONE bar — a single clamped hull write, the same contract
// swarmSupply uses for its own repair cells ("no healing kernel; the clamp to hullMax is the
// whole contract", src/systems/swarmSupply.js:303) — free, no bill, once per run. While the mule
// is en route, hurting yourself (a crush receipt or a self kill receipt naming your hull) reads
// as farming the mercy: the mule stops, turns, and will not come again this run.
//
// Invariants:
// - Deterministic: state.simTime / hash32 only; no Math.random/Date.now.
// - Observes via bus events + polling; zero edits to swarm files; never writes state.run.
//   The one clamped player-hull write is the patch itself, mirroring swarmSupply.js:303.
// - The mule is a plant-owned prop; despawned on arrival, offense, round start and run end.
// - Bounded state; one offer per run; per-run reset on run:ended.

import { isSwarmRuleset } from '../survivalSwarm.js';
import { hash32 } from '../../core/rng.js';

export const PLANTS_MEDIC_MULE_EVENT = 'plants:medicMule';

export const MEDIC_MULE_TUNING = Object.freeze({
  plId: 'pl323',
  betweenRoundPhases: Object.freeze(['cleanup', 'refit', 'draft']),
  hurtFraction: 0.35,        // "come off a round badly hurt"
  patchFraction: 0.25,       // one bar
  muleSpeedWuS: 90,
  arriveRangeWu: 48,
  spawnOffsetWu: 300,        // trundles across from out on the floor
  muleTtlS: 120,             // gives up if it can never reach you
  muleRadiusWu: 14,
  muleHull: 300,
  ventChimeGain: 0.4,
  memoryCap: 8,
});

/** Pure: the patch size for a hull max — one bar, clamped positive. */
export function patchAmountFor(hullMax, tuning = MEDIC_MULE_TUNING) {
  const max = Number.isFinite(hullMax) && hullMax > 0 ? hullMax : 0;
  return max > 0 ? Math.max(1, Math.round(max * tuning.patchFraction)) : 0;
}

/** Pure: clamped post-patch hull. */
export function patchedHull(hull, hullMax, tuning = MEDIC_MULE_TUNING) {
  const max = Number.isFinite(hullMax) && hullMax > 0 ? hullMax : 0;
  const cur = Number.isFinite(hull) ? hull : max;
  return Math.min(max, cur + patchAmountFor(max, tuning));
}

/** Pure: the mule's stance for a run. */
export function muleVerdict({ patchGiven = false, offended = false } = {}) {
  if (offended) return 'stopped_coming';
  return patchGiven ? 'patched_once' : 'available';
}

/** Pure: where the mule sets out from — deterministic per run seed. */
export function muleStartFor(pos, seed, tuning = MEDIC_MULE_TUNING) {
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
  const angle = (hash32(String(seed), tuning.plId, 'mule') % 6283) / 1000;
  return {
    x: pos.x + Math.cos(angle) * tuning.spawnOffsetWu,
    z: pos.z + Math.sin(angle) * tuning.spawnOffsetWu,
  };
}

export const medicMulePlant = {
  name: 'plants323',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._resetRun();
    this._offended = false;
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('run:transitioned', (p) => this._onTransitioned(p));
    on('run:waveStarted', () => this._despawn('round_started'));
    on('combat:crushed', (p) => this._onSelfHarm(p && p.entityId));
    on('entity:killed', (p) => this._onSelfHarm(p && p.id, p));
    on('run:ended', () => this._reset());
  },

  update(dt) {
    const run = this._liveRun();
    if (!run || this._muleId == null) return;
    const now = this._now();
    const mule = this._entity(this._muleId);
    if (!mule || mule.alive === false) return this._despawn('gone');
    if (now >= this._expiresAt) return this._despawn('ttl');
    const player = this._player();
    if (!player || !player.pos) return;
    const step = MEDIC_MULE_TUNING.muleSpeedWuS * finite(dt, 0);
    const dx = player.pos.x - mule.pos.x;
    const dz = player.pos.z - mule.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= MEDIC_MULE_TUNING.arriveRangeWu) return this._patch(player, mule, run);
    if (dist > step) {
      mule.pos.x += (dx / dist) * step;
      mule.pos.z += (dz / dist) * step;
    } else {
      mule.pos.x = player.pos.x;
      mule.pos.z = player.pos.z;
    }
    mule.data = mule.data || {};
    mule.data.lampsFlashing = true;
    mule.data.lampFlashUntil = now + 0.3;
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    this._despawn('destroy');
    this._offended = false;
  },

  // ---- internals ----

  _liveRun() {
    const run = this.state && this.state.run;
    if (!run || run.kind !== 'survival' || !isSwarmRuleset(run.ruleset)) return null;
    if (run.phase === 'inactive' || run.phase === 'ended' || run.phase === 'victory') return null;
    return run;
  },

  _now() {
    return finite(this.state && this.state.simTime, 0);
  },

  _player() {
    const s = this.state;
    return s && s.entities && typeof s.entities.get === 'function' ? s.entities.get(s.playerId) : null;
  },

  _entity(id) {
    const s = this.state;
    if (id == null || !s || !s.entities || typeof s.entities.get !== 'function') return null;
    return s.entities.get(id) || null;
  },

  _hullFraction(player) {
    if (!player) return 1;
    const max = Number.isFinite(player.hullMax) && player.hullMax > 0 ? player.hullMax : 0;
    if (max <= 0) return 1;
    const hull = Number.isFinite(player.hull) ? player.hull : max;
    return Math.max(0, Math.min(1, hull / max));
  },

  _resetRun() {
    this._muleId = null;
    this._patchGiven = false;
    this._expiresAt = 0;
  },

  _reset() {
    this._resetRun();
    this._offended = false;
  },

  _despawn() {
    if (this._muleId != null && this.helpers && typeof this.helpers.removeEntity === 'function') {
      this.helpers.removeEntity(this._muleId);
    }
    this._muleId = null;
  },

  _onTransitioned(payload) {
    const run = this._liveRun();
    if (!run) return;
    const phase = payload && payload.phase;
    if (!MEDIC_MULE_TUNING.betweenRoundPhases.includes(phase)) return;
    if (this._patchGiven || this._offended) return; // once per run; farming stops the mule
    const player = this._player();
    if (!player || this._hullFraction(player) > MEDIC_MULE_TUNING.hurtFraction) return;
    const start = muleStartFor(player.pos, run.seed);
    if (!start) return;
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return;
    const spawned = spawnEntity({
      type: 'debris',
      pos: start,
      vel: { x: 0, z: 0 },
      radius: MEDIC_MULE_TUNING.muleRadiusWu,
      hull: MEDIC_MULE_TUNING.muleHull,
      collides: true,
      data: {
        runtimeOwner: 'plants',
        parentType: 'story_prop',
        scanLabel: 'the medic mule',
        swarmFloorPad: { label: 'MEDIC MULE' },
        plants: { [MEDIC_MULE_TUNING.plId]: { role: 'medic_mule' } },
      },
    });
    const id = spawned && typeof spawned === 'object' ? spawned.id : spawned;
    if (id == null) return;
    this._muleId = id;
    this._expiresAt = this._now() + MEDIC_MULE_TUNING.muleTtlS;
    this.bus.emit(PLANTS_MEDIC_MULE_EVENT, {
      kind: 'mule_coming', muleId: id, start: { x: start.x, z: start.z }, t: this._now(),
    });
  },

  _patch(player, mule, run) {
    const max = Number.isFinite(player.hullMax) && player.hullMax > 0 ? player.hullMax : 0;
    const before = Number.isFinite(player.hull) ? player.hull : max;
    const healed = patchedHull(before, max);
    if (max > 0 && healed > before) {
      // The patch itself: one clamped write, the swarmSupply repair-cell contract.
      player.hull = healed;
    }
    this._patchGiven = true;
    const now = this._now();
    mule.data.lampsFlashing = true;
    mule.data.lampFlashUntil = now + 1.0;
    this.bus.emit('audio:cue', {
      id: 'sfx_vent_chime',
      position: { x: player.pos.x, z: player.pos.z },
      gain: MEDIC_MULE_TUNING.ventChimeGain,
      rate: 1,
    });
    this.bus.emit(PLANTS_MEDIC_MULE_EVENT, {
      kind: 'patched',
      muleId: this._muleId,
      restored: Math.max(0, Math.round(healed - before)),
      hull: player.hull,
      hullMax: max,
      free: true,
      bill: 0,
      wave: run.wave,
      t: now,
    });
    this._despawn();
  },

  _onSelfHarm(entityId, payload) {
    const run = this._liveRun();
    if (!run || this._muleId == null) return;
    if (entityId !== this.state.playerId) return;
    // Farming it by self-harm while the mule trundles toward you: the mule stops coming.
    this._offended = true;
    const muleId = this._muleId;
    this._despawn();
    this.bus.emit('audio:cue', { id: 'ui_deny', position: null, gain: 0.4, rate: 1 });
    this.bus.emit(PLANTS_MEDIC_MULE_EVENT, {
      kind: 'mule_offended',
      muleId,
      selfHarm: payload && payload.cause ? payload.cause : 'crushed',
      t: this._now(),
    });
  },
};

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
