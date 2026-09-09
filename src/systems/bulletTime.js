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

// --- Moment detector (PQ-146.03) -----------------------------------------------------------
// Rates `stunt:trickDetected` receipts (rarity x momentum x collateral) and exposes one stable
// bus event — `moment:holyShit` — for slow-mo (this system), camera, audio stingers and the
// clip recorder. Detection is from physics receipts only (never button presses): ordinary
// traffic produces no tricks, so it can never produce a moment.
//
// The feel pulse is a SEPARATE time-effects source ('moment:slow-mo') that min-wins with the
// held 'player:bullet-time' source and every other request. It NEVER touches the player's
// held bullet-time meter (no drain, no engage floor, no require-release latch).
export const MOMENT_EVENT = 'moment:holyShit';
const MOMENT_TIME_SOURCE = 'moment:slow-mo';
export const MOMENT_THRESHOLD = 6;        // minimum rated score that counts as a moment
export const MOMENT_SLOWMO_SCALE = 0.45;  // moment pulse bound (shallower than the held 0.35)
export const MOMENT_SLOWMO_DUR_S = 0.7;   // pulse length in SIM seconds (deterministic)
export const MOMENT_COOLDOWN_S = 2.0;     // pulse re-arm gap; bus events still fire inside it
const MOMENT_RECENT_MAX = 16;
const MOMENT_AUDIO_CUE = 'moment.stinger';
const RARITY_WEIGHT = Object.freeze({ common: 1, uncommon: 2, rare: 4, legendary: 8 });

function finiteNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Rate one `stunt:trickDetected` receipt as a potential holy-shit moment.
 * Pure and deterministic: no RNG, no wall clock, no allocation beyond the result.
 * score = rarityWeight x momentumFactor x collateralFactor.
 */
export function rateMoment(trick) {
  if (!trick || typeof trick !== 'object') {
    return { score: 0, rarityWeight: 0, momentumFactor: 1, collateralFactor: 1, qualifies: false };
  }
  const rarityWeight = RARITY_WEIGHT[trick.rarity] || 0;
  const metrics = (trick.metrics && typeof trick.metrics === 'object') ? trick.metrics : {};
  const secondaryIds = Array.isArray(trick.secondaryIds) ? trick.secondaryIds : [];
  const causeChain = Array.isArray(trick.causeChain) ? trick.causeChain : [];

  // A trick without a consequence chain is not a trick (PQ-146) — never a moment.
  if (causeChain.length < 2 || rarityWeight <= 0) {
    return { score: 0, rarityWeight, momentumFactor: 1, collateralFactor: 1, qualifies: false };
  }

  const momentum = Math.max(
    0,
    finiteNum(metrics.momentum),
    finiteNum(metrics.exchangedMomentum),
  );
  const speed = Math.max(
    0,
    finiteNum(metrics.relSpeed),
    finiteNum(metrics.deltaV),
    finiteNum(metrics.speed),
    finiteNum(metrics.tangentialSpeed),
  );
  const momentumFactor = 1 + Math.min(2, momentum / 1500 + speed / 60);
  const chainBonus = Math.min(0.5, Math.max(0, causeChain.length - 2) * 0.25);
  const collateralFactor = 1 + 0.75 * Math.min(2, secondaryIds.length) + chainBonus;
  const score = rarityWeight * momentumFactor * collateralFactor;
  return {
    score,
    rarityWeight,
    momentumFactor,
    collateralFactor,
    qualifies: score >= MOMENT_THRESHOLD,
  };
}

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
      this._unsubs.push(this.bus.on(event, () => { this._disengage(true); this._clearMoment(); }));
    };
    // Same lease-safety set flybyFocus uses: a restore/new-game/death/dock must never leave a
    // stale slow-time request behind.
    clearOn('save:restoring');
    clearOn('save:loaded');
    clearOn('game:started');
    clearOn('dock:docked');
    clearOn('player:death');
    // The moment detector consumes physics receipts, never button presses.
    if (this.bus && typeof this.bus.on === 'function') {
      this._onTrickBound = (trick) => this._onTrickDetected(trick);
      this._unsubs.push(this.bus.on('stunt:trickDetected', this._onTrickBound));
    }
  },

  destroy() {
    this._disengage(true);
    this._clearMoment();
    for (const off of this._unsubs || []) { if (typeof off === 'function') off(); }
    this._unsubs = [];
    this._onTrickBound = null;
  },

  update(dt, state) {
    const runtime = ensureBulletTime(state);
    this._updateMomentPulse(state);
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

  // --- Moment detector wiring ------------------------------------------------------------
  // Rates one trick receipt. Qualifying tricks ALWAYS emit the bus moment (so the clip
  // recorder sees every one); the slow-mo pulse is re-armed only outside the cooldown so a
  // collateral burst cannot thrash the time scalar. The meter is never touched.
  _onTrickDetected(trick) {
    const state = this.state;
    if (!state || state.mode !== 'flight' || !trick) return;
    const rating = rateMoment(trick);
    if (!rating.qualifies) return;
    const now = Math.max(0, finiteNum(state.simTime));
    const moment = ensureMoment(state);
    moment.totalMoments += 1;
    const record = Object.freeze({
      trickId: trick.trickId || 'unknown',
      name: trick.name || trick.trickId || 'Unknown stunt',
      rarity: trick.rarity || 'common',
      score: rating.score,
      rarityWeight: rating.rarityWeight,
      momentumFactor: rating.momentumFactor,
      collateralFactor: rating.collateralFactor,
      actorId: trick.actorId != null ? trick.actorId : null,
      targetId: trick.targetId != null ? trick.targetId : null,
      secondaryIds: Array.isArray(trick.secondaryIds) ? [...trick.secondaryIds] : [],
      tick: Number.isFinite(Number(trick.tick)) ? Number(trick.tick) : Math.floor(now * 60),
      simTime: now,
    });
    moment.recentMoments.push(record);
    if (moment.recentMoments.length > MOMENT_RECENT_MAX) moment.recentMoments.shift();
    if (this.bus) {
      this.bus.emit(MOMENT_EVENT, record);
      this.bus.emit('audio:cue', { id: MOMENT_AUDIO_CUE, importance: 0.9 });
    }
    // Arm (or extend) the pulse only outside the cooldown — inside it the running pulse and
    // the bus record already carry the burst.
    if (now >= moment.cooldownUntil) {
      moment.pulseUntil = now + MOMENT_SLOWMO_DUR_S;
      moment.cooldownUntil = now + MOMENT_COOLDOWN_S;
      if (this.timeEffects) this.timeEffects.set(MOMENT_TIME_SOURCE, { scale: MOMENT_SLOWMO_SCALE });
    }
  },

  // Maintains the moment pulse from SIM time only (never wall clock, never the meter).
  // Runs even when the held bullet-time flag path idles so headless proof and flag-off
  // builds still expose the moment; min-wins composition with every other source is automatic.
  _updateMomentPulse(state) {
    const moment = ensureMoment(state);
    const now = Math.max(0, finiteNum(state && state.simTime));
    if (state && state.mode === 'flight' && now < moment.pulseUntil) {
      if (this.timeEffects) this.timeEffects.set(MOMENT_TIME_SOURCE, { scale: MOMENT_SLOWMO_SCALE });
    } else if (this.timeEffects) {
      this.timeEffects.clear(MOMENT_TIME_SOURCE);
      if (!(now < moment.pulseUntil)) moment.pulseUntil = 0;
    }
  },

  _clearMoment() {
    const state = this.state;
    if (state) {
      const moment = ensureMoment(state);
      moment.pulseUntil = 0;
      moment.cooldownUntil = 0;
    }
    if (this.timeEffects) this.timeEffects.clear(MOMENT_TIME_SOURCE);
  },
};

function ensureBulletTime(state) {
  const root = state.massline2 || (state.massline2 = {});
  if (!root.bulletTime) root.bulletTime = { active: false, energy: 1 };
  return root.bulletTime;
}

function ensureMoment(state) {
  const root = state.massline2 || (state.massline2 = {});
  if (!root.moment || typeof root.moment !== 'object') {
    root.moment = { totalMoments: 0, recentMoments: [], pulseUntil: 0, cooldownUntil: 0 };
  }
  const moment = root.moment;
  if (!Array.isArray(moment.recentMoments)) moment.recentMoments = [];
  if (!Number.isFinite(Number(moment.pulseUntil))) moment.pulseUntil = 0;
  if (!Number.isFinite(Number(moment.cooldownUntil))) moment.cooldownUntil = 0;
  if (!Number.isFinite(Number(moment.totalMoments))) moment.totalMoments = 0;
  return moment;
}
