// PL-223 Your own ghost — "The Nightly keeps your best line as a ghost on your own board.
// Race it; the board only keeps the winner."
//
// Each round's clear time is a "line". The session's best line per wave index is the ghost:
// beat it and the ghost is replaced (the board only keeps the winner); lose and the ghost
// stands. The Nightly's across-session record is a save-shaped thing this plant cannot own
// (session-only state, closed run schema), so the ghost here is the session ghost, and the
// run's results receipt summarizes it.
//
// Invariants:
// - Deterministic: state.simTime only; no Math.random/Date.now.
// - Observes via bus events; zero edits to swarm files; never writes state.run.
// - Bounded Maps capped by tuning.memoryCap; one ghost row per wave index.

import { isSwarmRuleset } from '../survivalSwarm.js';

export const PLANTS_NIGHTLY_GHOST_EVENT = 'plants:nightlyGhost';

export const NIGHTLY_GHOST_TUNING = Object.freeze({
  plId: 'pl223',
  memoryCap: 32,               // one row per wave index
});

/** Pure: does the challenger line beat the ghost? Null ghost always loses to a real line. */
export function betterLine(ghost, challenger) {
  if (challenger == null || !Number.isFinite(challenger) || challenger <= 0) return false;
  if (ghost == null || !Number.isFinite(ghost) || ghost <= 0) return true;
  return challenger < ghost;
}

/** Pure: the line summary the board keeps. */
export function ghostRow(wave, durationS, t) {
  return Object.freeze({ wave, durationS: Math.round(durationS * 100) / 100, t });
}

export const nightlyGhostPlant = {
  name: 'plants223',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._unsubs = [];
    this._ghosts = new Map();    // wave -> { durationS, t }
    this._waveStartedAt = null;
    this._timingWave = 0;
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('run:waveStarted', (p) => this._onWaveStarted(p));
    on('run:waveCleared', (p) => this._onWaveCleared(p));
    on('run:resultsReady', (p) => this._onResults(p));
    on('run:ended', () => this._onRunEnd());
  },

  update() { /* event-driven */ },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    if (this._ghosts) this._ghosts.clear();
    this._waveStartedAt = null;
  },

  // ---- internals ----

  _liveRun() {
    const run = this.state && this.state.run;
    if (!run || run.kind !== 'survival' || !isSwarmRuleset(run.ruleset)) return null;
    if (run.phase === 'inactive' || run.phase === 'ended') return null;
    return run;
  },

  _now() {
    return finite(this.state && this.state.simTime, 0);
  },

  _onWaveStarted(payload) {
    const run = this._liveRun();
    if (!run) return;
    this._timingWave = finite(payload && payload.wave, finite(run.wave, 0));
    this._waveStartedAt = this._now();
  },

  _onWaveCleared(payload) {
    const run = this._liveRun();
    if (!run || this._waveStartedAt == null) return;
    const wave = finite(payload && payload.wave, this._timingWave);
    const duration = this._now() - this._waveStartedAt;
    this._waveStartedAt = null;
    if (duration <= 0) return;
    const ghost = this._ghosts.get(wave);
    const ghostDuration = ghost ? ghost.durationS : null;
    const challengerWins = betterLine(ghostDuration, duration);
    if (challengerWins) {
      this._ghosts.set(wave, ghostRow(wave, duration, this._now()));
      while (this._ghosts.size >= NIGHTLY_GHOST_TUNING.memoryCap) {
        this._ghosts.delete(this._ghosts.keys().next().value);
      }
      this.bus.emit('audio:cue', { id: 'confirm', position: null, gain: 0.5, rate: 1.1 });
    }
    this.bus.emit(PLANTS_NIGHTLY_GHOST_EVENT, {
      kind: challengerWins ? 'ghost_beaten' : 'ghost_stands',
      wave,
      durationS: Math.round(duration * 100) / 100,
      ghostS: ghostDuration != null ? Math.round(ghostDuration * 100) / 100 : null,
      t: this._now(),
    });
  },

  _onResults(result) {
    if (!result || this._ghosts.size === 0) return;
    this.bus.emit(PLANTS_NIGHTLY_GHOST_EVENT, {
      kind: 'nightly_lines',
      ghosts: [...this._ghosts.values()],
      outcome: result.outcome || null,
      t: this._now(),
    });
  },

  _onRunEnd() {
    this._waveStartedAt = null;
    // The session ghost board persists for the session; per-run timing stops here.
  },
};

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
