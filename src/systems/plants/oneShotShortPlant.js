// PL-222 One shot short — "Try Kiln's round-five-without-firing dare and fail by one shot:
// Kiln says nothing at all, and the crowd finds that funnier than anything she could say.
// Try again next run."
//
// The plant counts the player's shots through round five (combat:fire receipts owned by the
// player). If round five closes with exactly one shot — the dare failed by exactly one — the
// crowd gets its laugh: an audio beat and an event receipt, and Kiln stays silent. Zero shots
// keeps the dare (no reaction); two or more is just a normal round.
//
// Invariants:
// - Deterministic: state.simTime only; no Math.random/Date.now.
// - Observes via bus events; zero edits to swarm files; never writes state.run.
// - One laugh per run; the counter resets at each wave start.

import { isSwarmRuleset } from '../survivalSwarm.js';

export const PLANTS_ONE_SHOT_SHORT_EVENT = 'plants:oneShotShort';

export const ONE_SHOT_SHORT_TUNING = Object.freeze({
  plId: 'pl222',
  dareWave: 5,                 // Kiln's round-five-without-firing dare
  oneShotShort: 1,             // failing "by one shot"
  laughS: 4,
  memoryCap: 4,
});

/** Pure: the dare verdict for a round-five shot tally. */
export function oneShotShortVerdict(shots, tuning = ONE_SHOT_SHORT_TUNING) {
  const n = Math.max(0, Math.floor(Number(shots) || 0));
  if (n === 0) return 'dare_kept';
  if (n === tuning.oneShotShort) return 'one_shot_short';
  return 'sprayed';
}

export const oneShotShortPlant = {
  name: 'plants222',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._unsubs = [];
    this._shots = 0;
    this._countingWave = 0;
    this._laughedRun = new Map(); // run seed -> true (memoryCap bounded)
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('combat:fire', (p) => this._onShot(p));
    on('run:waveStarted', (p) => this._onWaveStarted(p));
    on('run:waveCleared', (p) => this._onWaveCleared(p));
    on('run:ended', () => this._reset('run_ended'));
    on('save:loaded', () => this._reset('save_loaded'));
  },

  update() { /* event-driven */ },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    this._shots = 0;
    if (this._laughedRun) this._laughedRun.clear();
  },

  // ---- internals ----

  _liveRun() {
    const run = this.state && this.state.run;
    if (!run || run.kind !== 'survival' || !isSwarmRuleset(run.ruleset)) return null;
    if (run.phase !== 'active') return null;
    return run;
  },

  _now() {
    return finite(this.state && this.state.simTime, 0);
  },

  _reset(reason) {
    this._shots = 0;
    if (this._laughedRun) this._laughedRun.clear();
  },

  _onWaveStarted(payload) {
    const run = this._liveRun();
    if (!run) return;
    const wave = finite(payload && payload.wave, finite(run.wave, 0));
    if (wave !== this._countingWave) this._shots = 0;
    this._countingWave = wave;
  },

  _onShot(payload) {
    const run = this._liveRun();
    if (!run || !payload) return;
    if (run.wave !== ONE_SHOT_SHORT_TUNING.dareWave) return;
    if (payload.ownerId !== this.state.playerId) return;
    this._shots += 1;
  },

  _onWaveCleared(payload) {
    const run = this.state && this.state.run;
    if (!run || run.kind !== 'survival' || !isSwarmRuleset(run.ruleset)) return;
    const wave = finite(payload && payload.wave, 0);
    if (wave !== ONE_SHOT_SHORT_TUNING.dareWave) return;
    const key = `${run.seed}`;
    if (this._laughedRun.has(key)) return; // once per run
    const verdict = oneShotShortVerdict(this._shots, ONE_SHOT_SHORT_TUNING);
    if (verdict !== 'one_shot_short') {
      this._laughedRun.set(key, false); // dare kept or sprayed: no laugh, but the round is spent
      while (this._laughedRun.size >= ONE_SHOT_SHORT_TUNING.memoryCap) {
        this._laughedRun.delete(this._laughedRun.keys().next().value);
      }
      return;
    }
    this._laughedRun.set(key, true);
    while (this._laughedRun.size >= ONE_SHOT_SHORT_TUNING.memoryCap) {
      this._laughedRun.delete(this._laughedRun.keys().next().value);
    }
    // Kiln says nothing at all — no voice:say from this plant, ever. The crowd carries it.
    const now = this._now();
    this.bus.emit('audio:cue', { id: 'confirm', position: null, gain: 0.9, rate: 1.25 });
    this.bus.emit(PLANTS_ONE_SHOT_SHORT_EVENT, {
      kind: 'crowd_laugh', shots: this._shots, laughS: ONE_SHOT_SHORT_TUNING.laughS, t: now,
    });
  },
};

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
