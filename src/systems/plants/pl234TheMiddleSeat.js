// PL-234 The middle seat — "Gus Varga welded a bench to the dead pump, and both flags'
// pilots sit on it, opposite ends, same bench | Take the middle seat; both sides will look
// at you"
//
// SEAM NOTE (honest): Io Reach is contested ground — station_reach (faction_free) and
// station_io_merc (faction_quiet) are the two flags of sector_io_reach
// (src/data/sectors.js:884). The bench is a fixed prop pair off the live station_reach
// body: the dead pump (a hull-rack kit prop) and Gus Varga's bench welded to it. Both
// flags' pilots are real neutral strangers (makeShipEntitySpec, team 2, passive) parked
// at opposite ends of the same bench. Take the middle seat — park between them, slow —
// and both sides look at you: they turn to face the player, no words. Shove the bench
// or either pilot and both ends stand up and leave; the bench sits cold for the shift.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes every listener, despawns the pump,
//   the bench and both pilots, clears session state (tuning.memoryCap).
// - Looking is a facing stamp on bodies this plant spawned; nobody else's pose is written.

import { hash32 } from '../../core/rng.js';
import { makeShipEntitySpec } from '../ships.js';

export const PL_234_MIDDLE_EVENT = 'plants:pl234:middle';
export const PL_234_STOOD_EVENT = 'plants:pl234:stood';

export const MIDDLE_SEAT_TUNING = Object.freeze({
  sectorId: 'sector_io_reach',
  stationId: 'station_reach',
  benchOffsetWu: 260,
  bearingSalt: 'plantsPl234Bench',
  benchHalfWu: 22,            // ends sit this far either side of the bench centre
  seatRadiusWu: 16,           // the middle seat is between the ends
  seatNeedS: 2.5,
  seatGateSpeed: 4,
  lookHoldS: 30,              // both sides will look at you while you sit
  bumpImpulseGate: 70,
  benchColdS: 90,             // both ends stand for the shift
  pilotHull: 'ship_wasp',
  flagFactions: Object.freeze(['faction_free', 'faction_quiet']), // the two flags
  pumpRadius: 10,
  memoryCap: 6,
});

/** Fixed bench layout off the live station body. */
export function benchLayoutFor(origin, t = MIDDLE_SEAT_TUNING) {
  const h = hash32(t.bearingSalt, t.stationId);
  const bearing = (h % 3600) / 3600 * Math.PI * 2;
  const dir = { x: Math.cos(bearing), z: Math.sin(bearing) };
  const bench = {
    x: origin.x + dir.x * t.benchOffsetWu,
    z: origin.z + dir.z * t.benchOffsetWu,
  };
  const pump = { x: bench.x + dir.x * 26, z: bench.z + dir.z * 26 };
  return {
    bench,
    pump,
    endA: { x: bench.x - dir.x * t.benchHalfWu, z: bench.z - dir.z * t.benchHalfWu },
    endB: { x: bench.x + dir.x * t.benchHalfWu, z: bench.z + dir.z * t.benchHalfWu },
    dir,
  };
}

function stationOf(state, stationId) {
  if (!state) return null;
  const list = (state.entityIndex && state.entityIndex.stations) || state.entityList || [];
  const pools = [];
  if (list.length) pools.push(list);
  if (state.entities && typeof state.entities.values === 'function') pools.push([...state.entities.values()]);
  for (const pool of pools) {
    for (const e of pool) {
      if (!e || e.alive === false || e.type !== 'station') continue;
      if (((e.data && e.data.stationId) || e.id) === stationId) return e;
    }
  }
  return null;
}

export function createPl234TheMiddleSeat() {
  return {
    name: 'plantsPl234',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._pumpId = null;
      this._benchId = null;
      this._pilotIds = [];
      this._seatSince = null;
      this._middleSeatUntil = null;
      this._lookDoneVisit = false;
      this._coldUntil = null;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('physics:impact', (p = {}) => this._onImpact(p));
      on('sector:exit', () => this._resetVisit());
      on('save:loaded', () => this._resetVisit());
      on('game:new', () => this._resetSession());
      on('game:newGame', () => this._resetSession());
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._resetSession();
    },

    _resetSession() {
      this._coldUntil = null;
      this._resetVisit();
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        if (this._pumpId != null) rm(this._pumpId);
        if (this._benchId != null) rm(this._benchId);
        for (const id of this._pilotIds || []) rm(id);
      }
      this._pumpId = null;
      this._benchId = null;
      this._pilotIds = [];
    },

    _resetVisit() {
      this._seatSince = null;
      this._middleSeatUntil = null;
      this._lookDoneVisit = false;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _ensure(origin) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function') return;
      const t = MIDDLE_SEAT_TUNING;
      const { bench, pump } = benchLayoutFor(origin, t);
      if (this._pumpId == null) {
        const ent = spawn({
          type: 'beacon',
          pos: { x: pump.x, z: pump.z },
          vel: { x: 0, z: 0 },
          radius: t.pumpRadius,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: t.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_dead_pump',
            plantsPl234Pump: true,
            placeId: 'place_utility_module',
            everydaySpaceKit: true,
            scanLabel: 'The dead pump — Gus Varga welded a bench to it',
            swarmFloorPad: { label: 'The dead pump' },
          },
        });
        if (ent && ent.id != null) this._pumpId = ent.id;
      }
      if (this._benchId == null) {
        const ent = spawn({
          type: 'beacon',
          pos: { x: bench.x, z: bench.z },
          vel: { x: 0, z: 0 },
          radius: 8,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: t.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_varga_bench',
            plantsPl234Bench: true,
            scanLabel: 'Gus Varga\u2019s bench — welded to the dead pump',
            swarmFloorPad: { label: 'The bench' },
          },
        });
        if (ent && ent.id != null) this._benchId = ent.id;
      }
      // Both flags' pilots, opposite ends, same bench. After a shove the bench sits cold
      // for the shift: nobody comes back until the cold passes.
      const now = this._now();
      const cold = this._coldUntil != null && now < this._coldUntil;
      while (!cold && this._pilotIds.length < t.flagFactions.length) {
        const i = this._pilotIds.length;
        const { endA, endB } = benchLayoutFor(origin, t);
        const end = i === 0 ? endA : endB;
        const spec = makeShipEntitySpec(t.pilotHull, {
          team: 2,
          factionId: t.flagFactions[i],
          pos: { x: end.x, z: end.z },
          ai: { archetype: 'passive', passive: true },
        });
        spec.data = spec.data || {};
        spec.data.plantsPl234Pilot = true;
        spec.data.parentType = 'story_prop';
        spec.data.benchEnd = i === 0 ? 'a' : 'b';
        spec.data.despawnAt = null;
        const ent = spawn(spec);
        if (ent && ent.id != null) this._pilotIds.push(ent.id);
        else break;
      }
    },

    _standUp(now) {
      const s = this.state;
      const t = MIDDLE_SEAT_TUNING;
      this._coldUntil = now + t.benchColdS;
      this._seatSince = null;
      this._middleSeatUntil = null;
      // Both ends leave; the bench sits cold, and they come back after the shift.
      for (const id of this._pilotIds) {
        this.helpers?.removeEntity?.(id);
      }
      this._pilotIds = [];
      this.bus?.emit('audio:cue', { id: 'ui_deny' });
      this.bus?.emit(PL_234_STOOD_EVENT, { coldUntil: this._coldUntil, t: now });
    },

    _onImpact(p) {
      const s = this.state;
      if (!s || !p) return;
      const hit = [p.aId, p.bId]
        .map((id) => (id != null && s.entities?.get ? s.entities.get(id) : null))
        .find((e) => e && e.data
          && (e.data.plantsPl234Bench === true || e.data.plantsPl234Pilot === true
            || e.data.plantsPl234Pump === true));
      if (!hit) return;
      const otherId = p.aId === hit.id ? p.bId : p.aId;
      if (otherId !== s.playerId) return;
      if ((Number(p.impulse) || 0) < MIDDLE_SEAT_TUNING.bumpImpulseGate) return;
      const now = this._now();
      if (this._coldUntil != null && now < this._coldUntil) return;
      this._standUp(now);
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== MIDDLE_SEAT_TUNING.sectorId) { this._resetVisit(); return; }
      const station = stationOf(s, MIDDLE_SEAT_TUNING.stationId);
      if (!station?.pos) { this._resetVisit(); return; }
      const t = MIDDLE_SEAT_TUNING;
      const now = this._now();
      if (this._coldUntil != null && now >= this._coldUntil) this._coldUntil = null;
      this._ensure(station.pos);
      const { bench, endA, endB } = benchLayoutFor(station.pos, t);

      const pilotA = this._pilotIds[0] != null && s.entities?.get ? s.entities.get(this._pilotIds[0]) : null;
      const pilotB = this._pilotIds[1] != null && s.entities?.get ? s.entities.get(this._pilotIds[1]) : null;
      if (pilotA?.pos && !this._pilotSeats) this._pilotSeats = { a: { x: endA.x, z: endA.z }, b: { x: endB.x, z: endB.z } };
      if (pilotA?.pos && this._pilotSeats) {
        pilotA.pos.x = this._pilotSeats.a.x;
        pilotA.pos.z = this._pilotSeats.a.z;
      }
      if (pilotB?.pos && this._pilotSeats) {
        pilotB.pos.x = this._pilotSeats.b.x;
        pilotB.pos.z = this._pilotSeats.b.z;
      }

      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos) return;
      const speed = Math.hypot(Number(player.vel?.x) || 0, Number(player.vel?.z) || 0);
      const d = Math.hypot(player.pos.x - bench.x, player.pos.z - bench.z);

      const seated = this._pilotIds.length === 2 && (this._coldUntil == null || now >= this._coldUntil);
      if (seated && d <= t.seatRadiusWu && speed <= t.seatGateSpeed) {
        if (this._seatSince == null) this._seatSince = now;
        else if (now - this._seatSince >= t.seatNeedS) {
          // Both sides will look at you: they turn, and keep turning while you sit.
          this._middleSeatUntil = now + t.lookHoldS;
          if (!this._lookDoneVisit) {
            this._lookDoneVisit = true;
            this.bus?.emit('audio:cue', { id: 'confirm' });
            this.bus?.emit(PL_234_MIDDLE_EVENT, { t: now });
          }
        }
      } else if (d > t.seatRadiusWu * 2) {
        this._seatSince = null;
        this._middleSeatUntil = null;
      }

      if (this._middleSeatUntil != null && now < this._middleSeatUntil) {
        const playerPos = player.pos;
        for (const pilot of [pilotA, pilotB]) {
          if (pilot?.pos && pilot.rot != null) {
            pilot.rot = Math.atan2(playerPos.z - pilot.pos.z, playerPos.x - pilot.pos.x);
            pilot.data.facingPlayerUntil = this._middleSeatUntil;
          }
        }
      }
    },
  };
}

export const pl234TheMiddleSeat = createPl234TheMiddleSeat();
