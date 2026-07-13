// Bullet time (Wave M2 §3.6, design/revamp/MASSLINE_PHYSICS_IDENTITY.md).
//
// A fast Newtonian game needs a timing-widener: hold the bulletTime verb (CapsLock by default)
// and the sim dilates while render/input stay live. This system NEVER writes state.timeScale —
// it owns one source on the core/timeEffects service ('player:bullet-time') exactly like
// flybyFocus ('flyby-focus', 0.5) and feel ('feel:hit-stop', 0.12); min-wins composition with
// those and with pause is automatic and contract-tested (test/time-effects.test.mjs).
//
// Determinism: the sim never reads state.timeScale and the replay harness steps fixed dt, so an
// engaged dilation cannot alter the 47-A telemetry; the flag is belt-and-suspenders. The meter
// drains in SIM seconds by design — reading state.timeScale to normalize into real seconds would
// make a sim system timeScale-sensitive, which is the one forbidden coupling (see the
// time-effects writer-contract notes). Runtime lives at state.massline2.bulletTime (unsaved,
// outside the snapshot whitelist).
import { massline2Flag } from '../data/featureFlags.js';
import { createTimeEffects } from '../core/timeEffects.js';

const TIME_SOURCE = 'player:bullet-time';
// --- Dials (design doc §12) -----------------------------------------------------------------
const BT_SCALE = 0.35;          // sim time scale while held
const BT_DRAIN_PER_S = 0.55;    // meter drain per SIM second while active
const BT_RECHARGE_PER_S = 0.18; // meter recharge per SIM second while inactive
const BT_MIN_ENGAGE = 0.15;     // meter floor required to (re-)engage — prevents stutter at empty
const BT_REQUEST = Object.freeze({ scale: BT_SCALE });

export const bulletTime = {
  id: 'bulletTime',
  name: 'bulletTime',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.timeEffects = ctx.timeEffects || createTimeEffects(ctx.state);
    // Depletion latch: once the meter runs dry the verb must be RELEASED before it can engage
    // again — otherwise a held key stutters on/off around the engage floor.
    this._requireRelease = false;
    this._unsubs = [];
    const clearOn = (event) => {
      if (!this.bus || typeof this.bus.on !== 'function') return;
      this._unsubs.push(this.bus.on(event, () => this._disengage(true)));
    };
    // Same lease-safety set flybyFocus uses: a restore/new-game/death/dock must never leave a
    // stale slow-time request behind.
    clearOn('save:restoring');
    clearOn('save:loaded');
    clearOn('game:started');
    clearOn('dock:docked');
    clearOn('player:death');
  },

  destroy() {
    this._disengage(true);
    for (const off of this._unsubs || []) { if (typeof off === 'function') off(); }
    this._unsubs = [];
  },

  update(dt, state) {
    const runtime = ensureBulletTime(state);
    if (!massline2Flag('bulletTime') || state.mode !== 'flight') {
      if (runtime.active) this._disengage(false);
      // Meter recovers even while the flag path idles so a menu detour is never punished.
      runtime.energy = Math.min(1, runtime.energy + BT_RECHARGE_PER_S * Math.max(0, dt));
      return;
    }

    const held = !!(state.input && state.input.actions && state.input.actions.bulletTime);
    const step = Math.max(0, Number(dt) || 0);

    if (!held) this._requireRelease = false;

    if (runtime.active) {
      if (!held) {
        this._disengage(false);
      } else {
        runtime.energy = Math.max(0, runtime.energy - BT_DRAIN_PER_S * step);
        this.timeEffects.set(TIME_SOURCE, BT_REQUEST);
        if (runtime.energy <= 0) {
          this._requireRelease = true;
          this._disengage(false);
        }
      }
    } else {
      runtime.energy = Math.min(1, runtime.energy + BT_RECHARGE_PER_S * step);
      if (held && !this._requireRelease && runtime.energy >= BT_MIN_ENGAGE) this._engage(state);
    }
  },

  _engage(state) {
    const runtime = ensureBulletTime(state);
    if (runtime.active) return;
    runtime.active = true;
    this.timeEffects.set(TIME_SOURCE, BT_REQUEST);
    if (this.bus) {
      this.bus.emit('bulletTime:start', { energy: runtime.energy, scale: BT_SCALE });
      this.bus.emit('audio:cue', { id: 'massline.bulletTimeIn' });
      // Small zoom kiss when the chase camera owns composition (pushZoom is ignored while a
      // director pair/gate mode owns the frame — exactly the behavior we want).
      const ctrl = state.render && state.render.cameraCtrl;
      if (ctrl && typeof ctrl.pushZoom === 'function') ctrl.pushZoom(-0.05, 0.3);
    }
  },

  _disengage(hardReset) {
    const state = this.state;
    const runtime = state ? ensureBulletTime(state) : null;
    const wasActive = !!(runtime && runtime.active);
    if (runtime) runtime.active = false;
    if (this.timeEffects) this.timeEffects.clear(TIME_SOURCE);
    if (wasActive && !hardReset && this.bus) {
      this.bus.emit('bulletTime:end', { energy: runtime ? runtime.energy : 0 });
      this.bus.emit('audio:cue', { id: 'massline.bulletTimeOut' });
    }
  },
};

function ensureBulletTime(state) {
  const root = state.massline2 || (state.massline2 = {});
  if (!root.bulletTime) root.bulletTime = { active: false, energy: 1 };
  return root.bulletTime;
}
