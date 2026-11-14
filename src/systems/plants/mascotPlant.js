// PL-332 The mascot — "A tiny drone with a painted number adopts your run: follows your wall
// guns, perches on your Tap, watches everything. Feed it a final blow; or starve it of spectacle
// — it flies across the floor to the other fighter."
//
// On the run's first wave the plant mints the mascot: a tiny plant-owned prop painted with a
// number drawn from the run seed (hash32). While you are live it follows: perched a wing off your
// own placed fortify piece (type 'beacon', data.swarmFortify, ownerId === playerId) when one
// exists, else trailing your hull. Feed it a final blow — a kill of yours inside the round's
// final beat (run:waveCleared window) — and it takes a victory lap around you. Two rounds clear
// with no spectacle from you and it flies across the floor to the other fighter: it picks a
// painted opposite number, its pad relabels, it accelerates away and despawns over the horizon
// of the floor.
//
// Invariants:
// - Deterministic: state.simTime / state.tick / hash32 only; no Math.random/Date.now.
// - Observes via bus events + polling; zero edits to swarm files; never writes state.run.
// - The mascot is a plant-owned prop; despawned when it reaches the other fighter, on run end
//   and destroy (it persists across rounds within the run).
// - Bounded state; one mascot per run; per-run reset on run:ended.

import { isSwarmRuleset } from '../survivalSwarm.js';
import { hash32 } from '../../core/rng.js';

export const PLANTS_MASCOT_EVENT = 'plants:mascot';

export const MASCOT_TUNING = Object.freeze({
  plId: 'pl332',
  followSpeedWuS: 320,
  leaveSpeedWuS: 620,
  perchOffsetWu: 48,
  followOffsetWu: 95,
  finalBlowWindowS: 1.5,
  starveRounds: 2,
  lapS: 3,
  lapRadiusWu: 70,
  leaveTravelWu: 1100,
  mascotTtlS: 1800,
  mascotRadiusWu: 6,
  mascotHull: 80,
  numberRange: 89,           // painted numbers read like racing numbers: 10..98
  scanThrottleS: 0.5,
  deviceScanCap: 12,
  memoryCap: 8,
});

/** Pure: the painted number a run's mascot wears. */
export function mascotNumberFor(seed, tuning = MASCOT_TUNING) {
  return 10 + (hash32(String(seed), tuning.plId, 'number') % tuning.numberRange);
}

/** Pure: the opposite number it paints when it leaves for the other fighter. */
export function otherNumberFor(number, tuning = MASCOT_TUNING) {
  const base = 10 + ((number - 10 + 37) % tuning.numberRange);
  return base;
}

/** Pure: the lap offset the mascot flies after a fed final blow. */
export function lapOffsetAt(tS, tuning = MASCOT_TUNING) {
  const angle = (tS / tuning.lapS) * Math.PI * 2;
  return { x: Math.cos(angle) * tuning.lapRadiusWu, z: Math.sin(angle) * tuning.lapRadiusWu };
}

/** Pure: the mascot's stance for a run. */
export function mascotVerdict({ fed = false, starveRounds = 0 } = {}, tuning = MASCOT_TUNING) {
  if (fed) return 'fed';
  return starveRounds >= tuning.starveRounds ? 'left' : 'watching';
}

export const mascotPlant = {
  name: 'plants332',

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
    on('run:waveStarted', (p) => this._onWaveStarted(p));
    on('entity:killed', (p) => this._onKilled(p));
    on('run:waveCleared', () => this._onRoundCleared());
    on('run:ended', () => this._reset());
    // New game: simTime restarts near zero — a stale kill stamp would read as a fresh
    // final blow (negative <= window). Clear it.
    on('game:newGame', () => { this._lastKillAt = null; });
  },

  update(dt) {
    const run = this._liveRun();
    if (!run || this._mascotId == null) return;
    const now = this._now();
    if (now >= this._expiresAt) return this._despawn('ttl');
    const mascot = this._entity(this._mascotId);
    if (!mascot || mascot.alive === false) return this._despawn('gone');
    const player = this._player();
    if (!player || !player.pos) return;
    const step = (this._leaving ? MASCOT_TUNING.leaveSpeedWuS : MASCOT_TUNING.followSpeedWuS) * finite(dt, 0);

    if (this._leaving) {
      // Fly across the floor to the other fighter.
      const dx = this._leaveTarget.x - mascot.pos.x;
      const dz = this._leaveTarget.z - mascot.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= step || now >= this._leaveDeadline) {
        return this._despawn('reached_other_fighter');
      }
      mascot.pos.x += (dx / dist) * step;
      mascot.pos.z += (dz / dist) * step;
      mascot.data.lampsFlashing = true;
      mascot.data.lampFlashUntil = now + 0.2;
      return;
    }

    if (now < this._lapUntil) {
      // Fed: take a lap around your hull.
      const off = lapOffsetAt(now - (this._lapUntil - MASCOT_TUNING.lapS));
      mascot.pos.x = player.pos.x + off.x;
      mascot.pos.z = player.pos.z + off.z;
      mascot.data.lampsFlashing = true;
      mascot.data.lampFlashUntil = now + 0.2;
      return;
    }

    // Follow: perch on your wall gun when you have one, else trail your hull.
    const perch = this._perchDevice(now);
    const tx = perch ? perch.pos.x + MASCOT_TUNING.perchOffsetWu : player.pos.x + MASCOT_TUNING.followOffsetWu;
    const tz = perch ? perch.pos.z : player.pos.z;
    const dx = tx - mascot.pos.x;
    const dz = tz - mascot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 2) {
      const move = Math.min(step, dist);
      mascot.pos.x += (dx / dist) * move;
      mascot.pos.z += (dz / dist) * move;
    }
    if (now >= this._nextBlinkAt) {
      this._nextBlinkAt = now + 1.1;
      mascot.data.lampsFlashing = true;
      mascot.data.lampFlashUntil = now + 0.25;
    }
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    this._despawn('destroy');
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
    this._mascotId = null;
    this._number = null;
    this._lastKillAt = null;
    this._starveRounds = 0;
    this._fed = false;
    this._leaving = false;
    this._departed = false;
    this._leaveTarget = null;
    this._leaveDeadline = 0;
    this._lapUntil = 0;
    this._expiresAt = 0;
    this._nextBlinkAt = 0;
    this._perchId = null;
    this._nextPerchScanAt = 0;
  },

  _reset() {
    this._resetRun();
  },

  _despawn() {
    if (this._mascotId != null && this.helpers && typeof this.helpers.removeEntity === 'function') {
      this.helpers.removeEntity(this._mascotId);
    }
    this._mascotId = null;
  },

  _onWaveStarted(payload) {
    const run = this._liveRun();
    if (!run) return;
    if (this._departed) return; // it flew to the other fighter: one mascot per run, no re-adopt
    if (this._mascotId != null) return; // one mascot per run
    const player = this._player();
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (!player || !player.pos || typeof spawnEntity !== 'function') return;
    const number = mascotNumberFor(run.seed);
    const spawned = spawnEntity({
      type: 'debris',
      pos: { x: player.pos.x + 40, z: player.pos.z - 40 },
      vel: { x: 0, z: 0 },
      radius: MASCOT_TUNING.mascotRadiusWu,
      hull: MASCOT_TUNING.mascotHull,
      collides: true,
      data: {
        runtimeOwner: 'plants',
        parentType: 'story_prop',
        scanLabel: `mascot N.${number}`,
        swarmFloorPad: { label: `N.${number}` },
        plants: { [MASCOT_TUNING.plId]: { role: 'mascot', number } },
      },
    });
    const id = spawned && typeof spawned === 'object' ? spawned.id : spawned;
    if (id == null) return;
    this._mascotId = id;
    this._number = number;
    this._expiresAt = this._now() + MASCOT_TUNING.mascotTtlS;
    this.bus.emit(PLANTS_MASCOT_EVENT, {
      kind: 'adopted', mascotId: id, number, wave: payload && payload.wave, t: this._now(),
    });
  },

  _onKilled(payload) {
    const run = this._liveRun();
    if (!run || !payload) return;
    if (payload.killerId !== this.state.playerId) return;
    if (payload.id === this.state.playerId) return;
    this._lastKillAt = this._now();
  },

  _onRoundCleared() {
    const run = this._liveRun();
    if (!run || this._mascotId == null) return;
    const now = this._now();
    const fedBlow = this._lastKillAt != null && now - this._lastKillAt <= MASCOT_TUNING.finalBlowWindowS;
    if (fedBlow && !this._leaving) {
      // Fed a final blow: a lap around your hull.
      this._fed = true;
      this._lapUntil = now + MASCOT_TUNING.lapS;
      this.bus.emit('audio:cue', { id: 'confirm', position: null, gain: 0.4, rate: 1.4 });
      this.bus.emit(PLANTS_MASCOT_EVENT, { kind: 'fed', mascotId: this._mascotId, number: this._number, t: now });
      return;
    }
    this._starveRounds += 1;
    if (this._starveRounds >= MASCOT_TUNING.starveRounds && !this._leaving) {
      // Starved of spectacle: it flies across the floor to the other fighter. The run is
      // through with it — latch the departure so no later wave mints a fresh mascot that
      // would insta-despawn at this leave deadline.
      this._leaving = true;
      this._departed = true;
      const player = this._player();
      const origin = player && player.pos ? player.pos : { x: 0, z: 0 };
      const angle = (hash32(String(run.seed), 'pl332', 'leave', this.state.tick) % 6283) / 1000;
      this._leaveTarget = {
        x: origin.x + Math.cos(angle) * MASCOT_TUNING.leaveTravelWu,
        z: origin.z + Math.sin(angle) * MASCOT_TUNING.leaveTravelWu,
      };
      this._leaveDeadline = now + (MASCOT_TUNING.leaveTravelWu / MASCOT_TUNING.leaveSpeedWuS) * 1.5;
      const other = otherNumberFor(this._number);
      const mascot = this._entity(this._mascotId);
      if (mascot) mascot.data.swarmFloorPad = { label: `GONE TO N.${other}` };
      this.bus.emit(PLANTS_MASCOT_EVENT, {
        kind: 'flew_to_other_fighter',
        mascotId: this._mascotId,
        number: this._number,
        otherNumber: other,
        starveRounds: this._starveRounds,
        t: now,
      });
    }
  },

  /** The perch target: cached between throttled scans (surrenderDoorPlant scan pattern). */
  _perchDevice(now) {
    if (!Number.isFinite(now)) now = this._now();
    if (now < this._nextPerchScanAt) {
      const cached = this._entity(this._perchId);
      return cached && cached.alive !== false ? cached : null;
    }
    this._nextPerchScanAt = now + MASCOT_TUNING.scanThrottleS;
    const found = this._scanForPerch();
    this._perchId = found ? found.id : null;
    return found;
  },

  /** Walk the full entity map: only the player's fortify devices match, and there are few. */
  _scanForPerch() {
    const entities = this.state && this.state.entities;
    if (!entities || typeof entities.values !== 'function') return null;
    for (const e of entities.values()) {
      if (!e || e.alive === false || e.type !== 'beacon' || !e.pos) continue;
      const d = e.data;
      if (!d || !d.swarmFortify || e.ownerId !== this.state.playerId) continue;
      return e;
    }
    return null;
  },
};

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
