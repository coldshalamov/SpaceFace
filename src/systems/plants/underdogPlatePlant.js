// PL-325 The underdog plate — "Lose five straight and the floor spawns one extra health pad,
// unannounced, near your wreck. Take the mercy; or lose on purpose to farm it — the sixth loss
// spawns nothing, and the floor is not sorry."
//
// The loss streak is a deliberate cross-run counter on the plant: run:ended {outcome:'defeat'}
// extends it, a victory resets it (an abort is a walk-away and leaves it alone). On the run
// after the fifth straight loss, the first time you drop below hurtFraction in a live round the
// floor mints ONE health pad near your hull — unannounced: no voice, no cue, no toast. The pad is
// an ordinary pickup; collecting it patches one bar through the plant's single clamped hull write
// (the swarmSupply repair-cell contract). The mercy is spent once granted: the sixth and later
// straight losses spawn nothing, and the floor says so once — it is not sorry. Only a win
// re-arms the mercy.
//
// Invariants:
// - Deterministic: state.simTime / hash32 only; no Math.random/Date.now.
// - Observes via bus events + polling; zero edits to swarm files; never writes state.run.
//   The one clamped player-hull write on collection mirrors swarmSupply.js:303.
// - Bounded state; one pad per armed run; per-run keys reset on run:ended (the streak persists).

import { isSwarmRuleset } from '../survivalSwarm.js';
import { hash32 } from '../../core/rng.js';

export const PLANTS_UNDERDOG_PLATE_EVENT = 'plants:underdogPlate';

export const UNDERDOG_PLATE_TUNING = Object.freeze({
  plId: 'pl325',
  streakForMercy: 5,         // "lose five straight"
  hurtFraction: 0.4,         // near your wreck means you are hurting again
  padOffsetWu: 60,
  padTtlS: 30,
  healFraction: 0.25,        // one bar
  padRadiusWu: 6,
  scanThrottleS: 0.5,
  memoryCap: 8,
});

/** Pure: is the mercy armed for a run with this streak history? */
export function mercyArmed(lossStreak, mercySpent, tuning = UNDERDOG_PLATE_TUNING) {
  return lossStreak >= tuning.streakForMercy && !mercySpent;
}

/** Pure: the floor's answer to a straight-loss run past the mercy. */
export function floorVerdict(lossStreak, mercySpent, tuning = UNDERDOG_PLATE_TUNING) {
  if (lossStreak < tuning.streakForMercy) return 'no_streak';
  return mercySpent ? 'not_sorry' : 'mercy';
}

/** Pure: the pad's spawn offset from your hull — deterministic per run seed. */
export function padOffsetFor(seed, tuning = UNDERDOG_PLATE_TUNING) {
  const angle = (hash32(String(seed), tuning.plId, 'pad') % 6283) / 1000;
  return { x: Math.cos(angle) * tuning.padOffsetWu, z: Math.sin(angle) * tuning.padOffsetWu };
}

export const underdogPlatePlant = {
  name: 'plants325',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    // Cross-run by design: the loss streak and the mercy-spend survive run:ended.
    this._lossStreak = 0;
    this._mercySpent = false;
    this._resetRun();
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('run:waveStarted', (p) => this._onWaveStarted(p));
    on('run:ended', (p) => this._onEnded(p));
    on('pickup:collected', (p) => this._onCollected(p));
    on('run:beginRequested', () => this._resetRun());
  },

  update() {
    const run = this._liveRun();
    if (!run || run.phase !== 'active') return;
    const now = this._now();
    if (now < this._nextScanAt) return;
    this._nextScanAt = now + UNDERDOG_PLATE_TUNING.scanThrottleS;
    if (!this._armedForRun || this._padSpawned) return;
    const player = this._player();
    if (!player || !player.pos) return;
    const max = Number.isFinite(player.hullMax) && player.hullMax > 0 ? player.hullMax : 0;
    const hull = Number.isFinite(player.hull) ? player.hull : max;
    if (max <= 0 || hull / max > UNDERDOG_PLATE_TUNING.hurtFraction) return;
    this._spawnPad(player, run);
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    this._resetRun();
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

  _resetRun() {
    this._armedForRun = false;
    this._padSpawned = false;
    this._padId = null;
    this._notSorryReported = false;
    this._nextScanAt = 0;
  },

  _onWaveStarted() {
    const run = this._liveRun();
    if (!run) return;
    this._armedForRun = mercyArmed(this._lossStreak, this._mercySpent);
    this._padSpawned = false;
    this._padId = null;
    if (!this._armedForRun && !this._notSorryReported
      && floorVerdict(this._lossStreak, this._mercySpent) === 'not_sorry') {
      // A farmed streak: the sixth loss and every one after spawns nothing.
      this._notSorryReported = true;
      this.bus.emit(PLANTS_UNDERDOG_PLATE_EVENT, {
        kind: 'floor_not_sorry', lossStreak: this._lossStreak, t: this._now(),
      });
    }
  },

  _onEnded(payload) {
    const outcome = payload && payload.outcome;
    if (outcome === 'victory') {
      this._lossStreak = 0;
      this._mercySpent = false;
    } else if (outcome === 'defeat') {
      this._lossStreak += 1;
      if (this._mercySpent && this._lossStreak > UNDERDOG_PLATE_TUNING.streakForMercy) {
        this.bus.emit(PLANTS_UNDERDOG_PLATE_EVENT, {
          kind: 'no_mercy', lossStreak: this._lossStreak, t: this._now(),
        });
      }
    }
    this._resetRun();
  },

  _spawnPad(player, run) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return;
    const offset = padOffsetFor(run.seed);
    const now = this._now();
    const spawned = spawnEntity({
      type: 'pickup',
      pos: { x: player.pos.x + offset.x, z: player.pos.z + offset.z },
      vel: { x: 0, z: 0 },
      radius: UNDERDOG_PLATE_TUNING.padRadiusWu,
      mass: 0.1,
      collides: true,
      // Unannounced: no voice, no cue, no toast. The pad just exists.
      data: {
        kind: 'medic_pad',
        amount: 1,
        despawnAt: now + UNDERDOG_PLATE_TUNING.padTtlS,
        plants: { [UNDERDOG_PLATE_TUNING.plId]: { role: 'mercy_pad' } },
      },
    });
    const id = spawned && typeof spawned === 'object' ? spawned.id : spawned;
    if (id == null) return;
    this._padId = id;
    this._padSpawned = true;
    this._mercySpent = true; // granted once; the streak alone will not re-arm it
    this.bus.emit(PLANTS_UNDERDOG_PLATE_EVENT, {
      kind: 'mercy_pad', pickupId: id, lossStreak: this._lossStreak, t: now,
    });
  },

  _onCollected(payload) {
    if (!this._padId || !payload || payload.pickupId !== this._padId) return;
    if (payload.collectorId != null && payload.collectorId !== this.state.playerId) return;
    const player = this._player();
    if (!player) return;
    const max = Number.isFinite(player.hullMax) && player.hullMax > 0 ? player.hullMax : 0;
    const before = Number.isFinite(player.hull) ? player.hull : max;
    if (max <= 0) return;
    const healed = Math.min(max, before + Math.max(1, Math.round(max * UNDERDOG_PLATE_TUNING.healFraction)));
    if (healed > before) {
      // One clamped write, the swarmSupply repair-cell contract.
      player.hull = healed;
    }
    const padId = this._padId;
    this._padId = null;
    this.bus.emit(PLANTS_UNDERDOG_PLATE_EVENT, {
      kind: 'mercy_taken', pickupId: padId, restored: Math.max(0, Math.round(healed - before)), t: this._now(),
    });
  },
};

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
