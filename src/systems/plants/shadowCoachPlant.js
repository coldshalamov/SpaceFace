// PL-326 The shadow coach — "After a death, your own wreck's ghost replays one better route —
// line, doors, taps, the whole run, once. Watch and learn; or skip it three times — the ghost
// stops showing, and the replay keeps its secrets."
//
// While a round is live the plant records your line: a bounded ring of sampled hull positions
// (0.6 s cadence). After a death (entity:killed naming your hull) the plant spawns your wreck's
// ghost — a plant-owned prop stamped YOUR GHOST — and it replays the recorded line at four times
// speed, once for that death. Standing near it (watch range) is watching and learning; leaving it
// far behind for long enough in a single replay is skipping it. Three skips across the run and
// the ghost stops showing: later deaths spawn nothing, and the replay keeps its secrets.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; no Math.random/Date.now.
// - Observes via bus events + polling; zero edits to swarm files; never writes state.run.
// - The ghost is a plant-owned prop, despawned when its replay ends, on round start, run end
//   and destroy.
// - Bounded state: sample ring capped, one ghost, one replay; per-run reset on run:ended.

import { isSwarmRuleset } from '../survivalSwarm.js';

export const PLANTS_SHADOW_COACH_EVENT = 'plants:shadowCoach';

export const SHADOW_COACH_TUNING = Object.freeze({
  plId: 'pl326',
  sampleIntervalS: 0.6,
  sampleCap: 200,           // the recorded line, bounded
  replaySpeedMult: 4,
  replayTtlS: 30,
  watchRangeWu: 160,
  watchHoldS: 1.0,
  skipRangeWu: 460,
  skipHoldS: 1.2,
  skipLimit: 3,
  ghostRadiusWu: 12,
  ghostHull: 200,
  memoryCap: 8,
});

/** Pure: where the ghost stands on its replay at a sim time. */
export function replayPositionAt(samples, startS, nowS, tuning = SHADOW_COACH_TUNING) {
  if (!Array.isArray(samples) || samples.length === 0) return null;
  const t = Math.max(0, nowS - startS) * tuning.replaySpeedMult / tuning.sampleIntervalS;
  const idx = Math.min(samples.length - 1, Math.floor(t));
  return samples[idx] || samples[samples.length - 1];
}

/** Pure: when the recorded line finishes replaying. */
export function replayDurationS(sampleCount, tuning = SHADOW_COACH_TUNING) {
  return (Math.max(0, sampleCount) * tuning.sampleIntervalS) / tuning.replaySpeedMult;
}

/** Pure: the coach's stance after this many skips. */
export function coachVerdict(skips, tuning = SHADOW_COACH_TUNING) {
  return skips >= tuning.skipLimit ? 'retired' : 'coaching';
}

export const shadowCoachPlant = {
  modes: ['swarm'],
  name: 'plants326',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._resetRun();
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('entity:killed', (p) => this._onKilled(p));
    on('run:waveStarted', () => this._endReplay('round_started'));
    on('run:ended', () => this._resetRun());
  },

  update(dt) {
    const run = this._liveRun();
    if (!run) return;
    const now = this._now();
    const player = this._player();
    if (run.phase === 'active' && player && player.pos) {
      if (now >= this._nextSampleAt) {
        this._nextSampleAt = now + SHADOW_COACH_TUNING.sampleIntervalS;
        this._route.push({ x: player.pos.x, z: player.pos.z });
        while (this._route.length > SHADOW_COACH_TUNING.sampleCap) this._route.shift();
      }
    }
    if (this._ghostId == null) return;
    const ghost = this._entity(this._ghostId);
    if (!ghost || ghost.alive === false) return this._endReplay('gone');
    const pos = replayPositionAt(this._replaySamples, this._replayStart, now);
    const done = now - this._replayStart >= Math.max(1, replayDurationS(this._replaySamples.length));
    if (!pos || done) return this._endReplay('replayed');
    ghost.pos.x = pos.x;
    ghost.pos.z = pos.z;
    ghost.data.lampsFlashing = true;
    ghost.data.lampFlashUntil = now + 0.3;
    if (!player || !player.pos) return;
    const dx = player.pos.x - pos.x;
    const dz = player.pos.z - pos.z;
    const distSq = dx * dx + dz * dz;
    if (distSq <= SHADOW_COACH_TUNING.watchRangeWu * SHADOW_COACH_TUNING.watchRangeWu) {
      this._watchTime += finite(dt, 0);
      if (!this._watched && this._watchTime >= SHADOW_COACH_TUNING.watchHoldS) {
        this._watched = true;
        this.bus.emit(PLANTS_SHADOW_COACH_EVENT, {
          kind: 'watched', ghostId: this._ghostId, watchedS: Math.round(this._watchTime * 10) / 10, t: now,
        });
      }
    } else if (distSq >= SHADOW_COACH_TUNING.skipRangeWu * SHADOW_COACH_TUNING.skipRangeWu) {
      this._skipTime += finite(dt, 0);
      if (!this._skippedThisReplay && this._skipTime >= SHADOW_COACH_TUNING.skipHoldS) {
        this._skippedThisReplay = true;
        this._skips += 1;
        this.bus.emit(PLANTS_SHADOW_COACH_EVENT, {
          kind: 'skipped', skips: this._skips, t: now,
        });
        if (coachVerdict(this._skips) === 'retired') {
          this._endReplay('retired');
          this.bus.emit(PLANTS_SHADOW_COACH_EVENT, {
            kind: 'ghost_retired', skips: this._skips, t: this._now(),
          });
        }
      }
    }
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    this._endReplay('destroy');
    this._route = [];
    this._skips = 0;
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

  _resetRun() {
    this._route = [];
    this._nextSampleAt = 0;
    this._skips = 0;
    this._watchTime = 0;
    this._watched = false;
    this._skippedThisReplay = false;
    this._skipTime = 0;
    this._ghostId = null;
    this._replaySamples = [];
    this._replayStart = 0;
    this._ghostGoneReported = false;
  },

  _endReplay() {
    if (this._ghostId != null && this.helpers && typeof this.helpers.removeEntity === 'function') {
      this.helpers.removeEntity(this._ghostId);
    }
    this._ghostId = null;
    this._replaySamples = [];
    this._watchTime = 0;
    this._watched = false;
    this._skippedThisReplay = false;
    this._skipTime = 0;
  },

  _onKilled(payload) {
    const run = this._liveRun();
    if (!run || !payload) return;
    if (payload.id !== this.state.playerId) return; // your own wreck's ghost
    if (this._ghostId != null) return; // one replay per death, no overlap
    if (this._route.length < 4) return; // nothing to coach on yet
    if (coachVerdict(this._skips) === 'retired') {
      if (!this._ghostGoneReported) {
        this._ghostGoneReported = true;
        this.bus.emit(PLANTS_SHADOW_COACH_EVENT, {
          kind: 'ghost_gone', skips: this._skips, t: this._now(),
        });
      }
      return; // the ghost stops showing, and the replay keeps its secrets
    }
    const pos = payload.pos && Number.isFinite(payload.pos.x) ? payload.pos
      : (this._route[this._route.length - 1]);
    if (!pos) return;
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return;
    const samples = this._route.slice(); // the line as you flew it, bounded
    const spawned = spawnEntity({
      type: 'debris',
      pos: { x: pos.x, z: pos.z },
      vel: { x: 0, z: 0 },
      radius: SHADOW_COACH_TUNING.ghostRadiusWu,
      hull: SHADOW_COACH_TUNING.ghostHull,
      collides: true,
      data: {
        runtimeOwner: 'plants',
        parentType: 'story_prop',
        scanLabel: 'your ghost',
        swarmFloorPad: { label: 'YOUR GHOST' },
        plants: { [SHADOW_COACH_TUNING.plId]: { role: 'coach_ghost' } },
      },
    });
    const id = spawned && typeof spawned === 'object' ? spawned.id : spawned;
    if (id == null) return;
    this._ghostId = id;
    this._replaySamples = samples;
    this._replayStart = this._now();
    this._watchTime = 0;
    this._watched = false;
    this._skippedThisReplay = false;
    this._skipTime = 0;
    this.bus.emit(PLANTS_SHADOW_COACH_EVENT, {
      kind: 'replay_started',
      ghostId: id,
      samples: samples.length,
      durationS: Math.round(replayDurationS(samples.length) * 10) / 10,
      t: this._now(),
    });
  },
};

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
