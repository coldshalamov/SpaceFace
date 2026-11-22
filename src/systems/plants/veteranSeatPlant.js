// PL-329 The veteran's seat — "Hold still in the corner seat between rounds — an old champion's
// name chalked above it — and your next draft shows one stat it usually hides. Sit the seat; or
// chalk your own name over it — your next draft is blind, and the chalk remembers."
//
// In each between-round window (run:transitioned into cleanup/draft/refit) the plant sets the
// seat: a plant-owned prop off a gate solid, the champion's chalk above it on its floor-pad
// label. Hold still beside it long enough (sit hold) and you have sat the seat — once per run the
// next draft receipt carries the hidden stat, and the pad flips to SAT — GOOD LUCK (the reveal
// itself rides the receipt + label; the draft panel is not this plant's to edit). Fire at the
// seat, crush it, or kill it — chalking your own name over the champion's — and the seat despawns,
// your next draft is blind (no reveal receipts for the rest of the run), and the chalk remembers:
// no seat is offered again this run.
//
// Invariants:
// - Deterministic: state.simTime / hash32 only; no Math.random/Date.now.
// - Observes via bus events + polling; zero edits to swarm files; never writes state.run.
// - The seat is a plant-owned prop; despawned on round start, run end and destroy.
// - Bounded state; one seat per window; per-run reset on run:ended.

import { isSwarmRuleset } from '../survivalSwarm.js';
import { hash32 } from '../../core/rng.js';

export const PLANTS_VETERAN_SEAT_EVENT = 'plants:veteranSeat';

export const VETERAN_SEAT_TUNING = Object.freeze({
  plId: 'pl329',
  betweenRoundPhases: Object.freeze(['cleanup', 'refit', 'draft']),
  sitRangeWu: 42,
  sitStillSpeedMax: 6,
  sitHoldS: 4,
  seatTtlS: 240,
  chalkRangeWu: 80,          // a shot landing this close is chalking over the name
  chalkBearCosMin: 0.5,      // the shot must bear on the seat (dir dot bearing >= this, ~60° cone)
  chalkCooldownS: 0.5,       // one chalk per volley: beam re-emits per tick never re-chalk
  seatOffsetWu: 130,
  seatRadiusWu: 10,
  seatHull: 400,
  scanCap: 64,
  memoryCap: 8,
});

/** Pure: the seat's verdict for a run. */
export function seatVerdict({ sat = false, chalked = false } = {}) {
  if (chalked) return 'chalked_over';
  return sat ? 'stat_shown' : 'seat_open';
}

/** Pure: the corner the seat takes by the gate — deterministic per run seed. */
export function seatOffsetFor(seed, tuning = VETERAN_SEAT_TUNING) {
  const angle = (hash32(String(seed), tuning.plId, 'seat') % 6283) / 1000;
  return { x: Math.cos(angle) * tuning.seatOffsetWu, z: Math.sin(angle) * tuning.seatOffsetWu };
}

export const veteranSeatPlant = {
  modes: ['swarm'],
  name: 'plants329',

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
    on('run:transitioned', (p) => this._onTransitioned(p));
    on('run:waveStarted', () => this._despawn());
    on('combat:fire', (p) => this._onFire(p));
    on('combat:crushed', (p) => this._onSeatHarm(p && p.entityId));
    on('entity:killed', (p) => this._onSeatHarm(p && p.id));
    on('run:ended', () => this._reset());
  },

  update(dt) {
    const run = this._liveRun();
    if (!run || this._seatId == null) return;
    const now = this._now();
    if (now >= this._expiresAt) return this._despawn();
    const seat = this._entity(this._seatId);
    if (!seat || seat.alive === false) return this._despawn();
    const player = this._player();
    if (!player || !player.pos) return;
    const dx = player.pos.x - this._seatPos.x;
    const dz = player.pos.z - this._seatPos.z;
    const inRange = dx * dx + dz * dz <= VETERAN_SEAT_TUNING.sitRangeWu * VETERAN_SEAT_TUNING.sitRangeWu;
    const still = !player.vel
      || (player.vel.x * player.vel.x + player.vel.z * player.vel.z
        <= VETERAN_SEAT_TUNING.sitStillSpeedMax * VETERAN_SEAT_TUNING.sitStillSpeedMax);
    if (inRange && still) {
      this._sitTime += finite(dt, 0);
      if (!this._sat && this._sitTime >= VETERAN_SEAT_TUNING.sitHoldS) {
        this._sat = true;
        seat.data.swarmFloorPad = { label: 'SAT — GOOD LUCK' };
        seat.data.lampsFlashing = true;
        seat.data.lampFlashUntil = now + 1.2;
        this.bus.emit('audio:cue', { id: 'confirm', position: { x: this._seatPos.x, z: this._seatPos.z }, gain: 0.45, rate: 1.2 });
        if (!this._revealed) {
          this._revealed = true;
          this.bus.emit(PLANTS_VETERAN_SEAT_EVENT, {
            kind: 'sat', nextDraft: 'one hidden stat shown', seatId: this._seatId, t: now,
          });
        } else {
          this.bus.emit(PLANTS_VETERAN_SEAT_EVENT, { kind: 'sat_again', seatId: this._seatId, t: now });
        }
      }
    }
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    this._despawn();
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
    this._seatId = null;
    this._seatPos = null;
    this._expiresAt = 0;
    this._sitTime = 0;
    this._sat = false;
    this._revealed = false;
    this._chalked = false;
    this._chalkReported = false;
    this._lastChalkAt = -Infinity;
  },

  _reset() {
    this._resetRun();
  },

  _despawn() {
    if (this._seatId != null && this.helpers && typeof this.helpers.removeEntity === 'function') {
      this.helpers.removeEntity(this._seatId);
    }
    this._seatId = null;
  },

  _onTransitioned(payload) {
    const run = this._liveRun();
    if (!run) return;
    const phase = payload && payload.phase;
    if (!VETERAN_SEAT_TUNING.betweenRoundPhases.includes(phase)) return this._despawn();
    if (this._chalked) {
      // The chalk remembers: no seat is offered again this run.
      if (!this._chalkReported) {
        this._chalkReported = true;
        this.bus.emit(PLANTS_VETERAN_SEAT_EVENT, {
          kind: 'chalk_remembers', nextDraft: 'blind', t: this._now(),
        });
      }
      return;
    }
    if (this._seatId != null) return; // one seat per window
    const gate = this._findGate();
    if (!gate || !gate.pos) return;
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return;
    const offset = seatOffsetFor(run.seed);
    const seatPos = { x: gate.pos.x + offset.x, z: gate.pos.z + offset.z };
    const spawned = spawnEntity({
      type: 'debris',
      pos: seatPos,
      vel: { x: 0, z: 0 },
      radius: VETERAN_SEAT_TUNING.seatRadiusWu,
      hull: VETERAN_SEAT_TUNING.seatHull,
      collides: true,
      data: {
        runtimeOwner: 'plants',
        parentType: 'story_prop',
        scanLabel: "the veteran's seat",
        swarmFloorPad: { label: 'V. CHAMP SAT HERE' },
        plants: { [VETERAN_SEAT_TUNING.plId]: { role: 'champion_seat' } },
      },
    });
    const id = spawned && typeof spawned === 'object' ? spawned.id : spawned;
    if (id == null) return;
    this._seatId = id;
    this._seatPos = seatPos;
    this._expiresAt = this._now() + VETERAN_SEAT_TUNING.seatTtlS;
    this._sitTime = 0;
    this._sat = false;
    this.bus.emit(PLANTS_VETERAN_SEAT_EVENT, {
      kind: 'seat_offered', seatId: id, pos: { x: seatPos.x, z: seatPos.z }, t: this._now(),
    });
  },

  _onFire(payload) {
    if (this._seatId == null || this._chalked) return;
    if (!payload || payload.ownerId !== this.state.playerId || !payload.origin) return;
    const now = this._now();
    if (now - this._lastChalkAt < VETERAN_SEAT_TUNING.chalkCooldownS) return;
    const dx = payload.origin.x - this._seatPos.x;
    const dz = payload.origin.z - this._seatPos.z;
    if (dx * dx + dz * dz > VETERAN_SEAT_TUNING.chalkRangeWu * VETERAN_SEAT_TUNING.chalkRangeWu) return;
    // The chosen act: a shot LANDING this close AND bearing on the seat — any muzzle flash
    // nearby aimed elsewhere is not chalking over the name. The combat:fire payload carries
    // the shot direction as a world angle; without one, the hull's heading is the honest read.
    const shotDir = Number.isFinite(payload.dir) ? payload.dir : this._player()?.rot;
    const bearing = Math.atan2(this._seatPos.z - payload.origin.z, this._seatPos.x - payload.origin.x);
    if (!Number.isFinite(shotDir) || Math.cos(shotDir - bearing) < VETERAN_SEAT_TUNING.chalkBearCosMin) return;
    this._lastChalkAt = now;
    this._chalkOver();
  },

  _onSeatHarm(entityId) {
    if (this._seatId == null || this._chalked) return;
    if (entityId !== this._seatId) return;
    this._chalkOver();
  },

  _chalkOver() {
    this._chalked = true;
    const seatId = this._seatId;
    this._despawn();
    this.bus.emit('audio:cue', { id: 'ui_deny', position: this._seatPos, gain: 0.4, rate: 1 });
    this.bus.emit(PLANTS_VETERAN_SEAT_EVENT, {
      kind: 'chalked_over', seatId, nextDraft: 'blind', t: this._now(),
    });
  },

  _findGate() {
    const entities = this.state && this.state.entities;
    if (!entities || typeof entities.values !== 'function') return null;
    let scanned = 0;
    for (const e of entities.values()) {
      if (scanned >= VETERAN_SEAT_TUNING.scanCap) return null;
      scanned += 1;
      const d = e && e.data;
      if (!e || e.alive === false || !e.pos || !d) continue;
      if (d.roomKind !== 'gate') continue;
      return e;
    }
    return null;
  },
};

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
