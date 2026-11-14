// PL-290 The good word — Io (design/program/INFERENCE_PLANTS.md, row PL-290).
// "The good word. Do a small unasked favor for a dockhand — hold a line, spot a loose
// strap — and berths near their station open up for you all week without being asked."
// What the player can do: Keep the trade flowing; or take favors and give none — the
// word stops traveling, and berths fill around you.
//
// SEAM NOTE (honest): Io Reach is the station_reach body (sector_io_reach). The dockhand
// is a real neutral stranger (makeShipEntitySpec, team 2, passive, callsign Rooks) at a
// fixed hash bearing on the dock face. The two favors are physical: HOLDING A LINE is
// parking stationary inside the hold range of a chalked lane line prop while a passing
// hauler crosses it; SPOTTING A LOOSE STRAP is a soft impact on the strap prop that
// spawns loose near the dockhand on a deterministic clock. A favor earns the good word
// for tuning.weekS ("all week" on the shared 240 s plant clock): berth props near the
// station get reserved-for-you stamps without being asked. Taking a berth with the word
// cold — favors taken, none given — three times, in bounded social memory keyed
// hull+station (tuning.memoryCap), stops the word: berths fill around you (real NPC
// hulls park in the props) and the flag-borne receipt (plantsPl290WordCold) means the
// word does not travel for you this session.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; the strap clock, the passing hauler
//   and the week clock are pure math. No Math.random(), no Date.now().
// - No Three.js, no DOM. Bounded Maps with tuning.memoryCap.
// - Session state on `this`; destroy() unsubscribes all + despawns dockhand, props, hulls.

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';
import { makeShipEntitySpec } from '../ships.js';
import { plantStationById as stationOf } from '../plantEntityViews.js';

export const PL_290_FAVOR_EVENT = 'plants:pl290:favor';
export const PL_290_BERTH_EVENT = 'plants:pl290:berth';
export const PL_290_COLD_EVENT = 'plants:pl290:cold';
export const PL_290_FILLED_EVENT = 'plants:pl290:filled';

export const GOOD_WORD_TUNING = Object.freeze({
  stationId: 'station_reach',
  sectorId: 'sector_io_reach',
  dayLengthS: 240,
  dockRadiusMult: BUBBLE_MULTIPLIERS.docking, // 2.4x — the dock face
  weekS: 1680,                 // "all week" = seven in-world days on the plant clock
  holdRangeWu: 50,
  holdNeedS: 8,
  holdSpeedWu: 3,
  strapEveryS: 90,
  strapSpotImpulse: 30,
  berthCount: 3,
  berthSpacingWu: 30,
  takeS: 5,
  takeSpeedWu: 4,
  coldTakesForBite: 3,
  memoryCap: 8,
  dockhandHull: 'ship_wasp',
  dockhandFaction: 'faction_dmc',
  dockhandCallsign: 'Rooks',
  haulerHull: 'ship_mule',
});

export const DOCK_SALT = 'plantsPl290Dock';
export const FAVOR_LINES = Object.freeze({
  hold: 'Seen you hold the line. Word travels.',
  strap: 'Good eye. That strap would\u2019ve cost a hull.',
});
export const WORD_LINE = 'Berth\u2019s open \u2014 word travels.';
export const FILLED_LINE = 'The word stopped. Berths fill around you.';

/** The dockhand's spot and the chalked line: fixed hash bearings off the station. */
export function dockLayoutFor(station, t = GOOD_WORD_TUNING) {
  const base = Number.isFinite(station.data?.dockRadius) && station.data.dockRadius > 0
    ? station.data.dockRadius
    : (station.size === 'L' ? 90 : station.size === 'S' ? 60 : 72);
  const r = base * t.dockRadiusMult;
  const aHand = (hash32(DOCK_SALT, 'hand', (station.data && station.data.stationId) || station.id) % 6283) / 1000;
  const aLine = (hash32(DOCK_SALT, 'line', (station.data && station.data.stationId) || station.id) % 6283) / 1000;
  return {
    dockhand: { x: station.pos.x + Math.cos(aHand) * r, z: station.pos.z + Math.sin(aHand) * r },
    line: { x: station.pos.x + Math.cos(aLine) * r, z: station.pos.z + Math.sin(aLine) * r },
    berths: Array.from({ length: t.berthCount }, (_, i) => {
      const aB = (hash32(DOCK_SALT, 'berth', i, (station.data && station.data.stationId) || station.id) % 6283) / 1000;
      return { x: station.pos.x + Math.cos(aB) * (r + t.berthSpacingWu), z: station.pos.z + Math.sin(aB) * (r + t.berthSpacingWu) };
    }),
  };
}

/** Day index of the shared plant clock. */
export function wordDayOf(simTime, t = GOOD_WORD_TUNING) {
  return Math.floor((Number.isFinite(simTime) ? simTime : 0) / Math.max(1, t.dayLengthS));
}

/** Pure read: is the good word active for this hull at sim time? */
export function wordActiveAt(entity, now) {
  const until = Number(entity?.data?.plantsPl290WordUntil);
  return Number.isFinite(until) && now < until;
}

export function createGoodWord() {
  return {
    name: 'plantsPl290',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._dockhandId = null;
      this._lineId = null;
      this._strapId = null;
      this._berthIds = [];
      this._haulerId = null;
      this._layout = null;
      this._holdS = 0;
      this._strapSpawnAt = null;
      this._wordUntil = null;
      this._lastFavorDay = -1;
      this._reservedBerth = null;
      this._reservedVisit = false;
      this._takeS = 0;
      this._berthClear = true;      // a take counts once per approach into a berth zone
      this._coldTakes = new Map();  // hull@station -> count, capped social memory
      this._fillerIds = [];         // hulls parked into berths once the word stops
      this._wordCold = false;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('physics:impact', (p = {}) => this._onImpact(p));
      on('sector:exit', () => this._drop());
      on('save:loaded', () => this._drop());
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
      this._drop();
      this._coldTakes?.clear();
      this._wordCold = false;
    },

    _drop() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        for (const id of [this._dockhandId, this._lineId, this._strapId, this._haulerId, ...this._berthIds, ...this._fillerIds]) {
          if (id != null) rm(id);
        }
      }
      this._dockhandId = null;
      this._lineId = null;
      this._strapId = null;
      this._haulerId = null;
      this._berthIds = [];
      this._fillerIds = [];
      this._layout = null;
      this._holdS = 0;
      this._strapSpawnAt = null;
      this._reservedBerth = null;
      this._reservedVisit = false;
      this._takeS = 0;
      this._berthClear = true;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _flags() {
      const s = this.state;
      return s && s.story ? (s.story.flags || (s.story.flags = {})) : null;
    },

    _popup(id, sender, text, ttl = 8) {
      this.bus?.emit('comms:popup', { id, sender, category: 'traffic', text, ttl, persist: false });
    },

    _cue(id, gain = 0.45) {
      this.bus?.emit('audio:cue', { id, gain });
    },

    _emit(type, payload) {
      this.bus?.emit(type, payload);
    },

    _get(id) {
      return this.state?.entities?.get ? this.state.entities.get(id) : null;
    },

    _grantWord(now, kind) {
      const s = this.state;
      const player = this._get(s.playerId);
      const day = wordDayOf(now, GOOD_WORD_TUNING);
      if (this._lastFavorDay === day) return;              // one word-earning favor per day
      this._lastFavorDay = day;
      this._wordUntil = now + GOOD_WORD_TUNING.weekS;
      if (player?.data) player.data.plantsPl290WordUntil = this._wordUntil;
      this._cue('confirm', 0.45);
      this._popup(`plants:pl290:favor:${Math.round(now)}`, GOOD_WORD_TUNING.dockhandCallsign, FAVOR_LINES[kind]);
      this._emit(PL_290_FAVOR_EVENT, { kind, until: this._wordUntil, day, t: now });
    },

    _onImpact(p) {
      const s = this.state;
      if (!s || !p || this._strapId == null) return;
      const strap = [p.aId, p.bId]
        .map((id) => (id != null ? this._get(id) : null))
        .find((e) => e && e.data && e.data.plantsPl290Strap === true);
      if (!strap) return;
      if (p.aId !== s.playerId && p.bId !== s.playerId) return;
      if ((Number(p.impulse) || 0) < GOOD_WORD_TUNING.strapSpotImpulse) return;
      if (strap.data.plantsPl290Spotted) return;           // already spotted: no double favor
      strap.data.plantsPl290Spotted = true;
      strap.data.swarmFloorPad = { label: 'SPOTTED' };
      this._grantWord(this._now(), 'strap');
    },

    _ensureDock(station, now) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function') return;
      const t = GOOD_WORD_TUNING;
      this._layout = dockLayoutFor(station, t);
      if (this._dockhandId == null) {
        const spec = makeShipEntitySpec(t.dockhandHull, {
          team: 2,
          factionId: t.dockhandFaction,
          pos: { x: this._layout.dockhand.x, z: this._layout.dockhand.z },
          ai: { archetype: 'passive', passive: true },
        });
        spec.data = spec.data || {};
        spec.data.plantsPl290Dockhand = true;
        spec.data.parentType = 'story_prop';
        spec.data.callsign = t.dockhandCallsign;
        spec.data.despawnAt = null;
        const ent = spawn(spec);
        if (ent && ent.id != null) this._dockhandId = ent.id;
      }
      if (this._lineId == null) {
        const line = spawn({
          type: 'beacon',
          pos: { x: this._layout.line.x, z: this._layout.line.z },
          vel: { x: 0, z: 0 },
          radius: 8,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: t.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_lane_line',
            plantsPl290Line: true,
            placeId: 'place_traffic_signal',
            everydaySpaceKit: true,
            scanLabel: 'A chalked lane line \u2014 hulls hold it when the train crosses',
            swarmFloorPad: { label: 'THE LINE' },
          },
        });
        this._lineId = line && line.id != null ? line.id : null;
      }
      if (this._berthIds.length !== t.berthCount) {
        for (const point of this._layout.berths) {
          const berth = spawn({
            type: 'beacon',
            pos: { x: point.x, z: point.z },
            vel: { x: 0, z: 0 },
            radius: 8,
            mass: 1e6,
            hull: 1,
            hullMax: 1,
            homeSectorId: t.sectorId,
            data: {
              parentType: 'story_prop',
              storyPropKind: 'plants_dock_berth',
              plantsPl290Berth: true,
              scanLabel: 'A berth near the dockhand\u2019s station',
              swarmFloorPad: { label: 'BERTH' },
            },
          });
          this._berthIds.push(berth && berth.id != null ? berth.id : null);
        }
      }
      // The loose strap: deterministic clock, near the dockhand.
      if (this._strapSpawnAt == null) this._strapSpawnAt = now + t.strapEveryS;
      if (this._strapId == null && now >= this._strapSpawnAt) {
        this._strapSpawnAt = now + t.strapEveryS;
        const strap = spawn({
          type: 'payload',
          pos: { x: this._layout.dockhand.x + 12, z: this._layout.dockhand.z - 8 },
          vel: { x: 0, z: 0 },
          radius: 3,
          mass: 2,
          physicsBody: { mass: 2 },
          flags: { persistent: true },
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_loose_strap',
            plantsPl290Strap: true,
            scanLabel: 'A loose strap on the dockhand\u2019s line',
            swarmFloorPad: { label: 'LOOSE STRAP' },
            plantsPl290Spotted: false,
          },
        });
        if (strap && strap.id != null) this._strapId = strap.id;
      }
      // A passing hauler crosses the line while a favor is worth giving.
      if (this._haulerId == null) {
        const spec = makeShipEntitySpec(t.haulerHull, {
          team: 2,
          factionId: t.dockhandFaction,
          pos: { x: this._layout.line.x + 60, z: this._layout.line.z + 60 },
          ai: { archetype: 'passive', passive: true },
        });
        spec.data = spec.data || {};
        spec.data.plantsPl290Hauler = true;
        spec.data.parentType = 'story_prop';
        spec.data.despawnAt = null;
        const ent = spawn(spec);
        if (ent && ent.id != null) this._haulerId = ent.id;
      }
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== GOOD_WORD_TUNING.sectorId) { this._drop(); return; }
      const station = stationOf(s, GOOD_WORD_TUNING.stationId);
      if (!station?.pos) { this._drop(); return; }
      const now = this._now();
      const t = GOOD_WORD_TUNING;
      this._ensureDock(station, now);
      if (!this._layout) return;
      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos) return;

      const wordActive = this._wordUntil != null && now < this._wordUntil;

      // Favor 1: hold the line while the hauler crosses.
      const hauler = this._haulerId != null ? this._get(this._haulerId) : null;
      const speed = Math.hypot(Number(player.vel?.x) || 0, Number(player.vel?.z) || 0);
      const dLine = Math.hypot(player.pos.x - this._layout.line.x, player.pos.z - this._layout.line.z);
      if (!wordActive && hauler?.pos) {
        // The hauler walks its crossing on the sim clock, then loops.
        hauler.pos.x = this._layout.line.x + 60 - ((now * 8) % 120);
        hauler.pos.z = this._layout.line.z - ((now * 8) % 120);
        const dHauler = Math.hypot(hauler.pos.x - this._layout.line.x, hauler.pos.z - this._layout.line.z);
        if (dLine <= t.holdRangeWu && speed <= t.holdSpeedWu && dHauler <= 80) {
          this._holdS += Math.max(0, Number(dt) || 0);
          if (this._holdS >= t.holdNeedS) {
            this._holdS = 0;
            this._grantWord(now, 'hold');
          }
        } else {
          this._holdS = 0;
        }
      }

      // The word opens a berth near the station, without being asked.
      if (wordActive && this._reservedBerth == null) {
        for (let i = 0; i < this._berthIds.length; i += 1) {
          const berth = this._berthIds[i] != null ? this._get(this._berthIds[i]) : null;
          if (!berth?.data || berth.data.plantsPl290Filled) continue;
          berth.data.swarmFloorPad = { label: 'OPEN \u2014 YOURS' };
          berth.data.plantsPl290ReservedForYou = true;
          this._reservedBerth = this._berthIds[i];
          this._reservedVisit = true;
          this._cue('sfx_vent_chime', 0.35, 1.1);
          this._popup(`plants:pl290:berth:${Math.round(now)}`, t.dockhandCallsign, WORD_LINE);
          this._emit(PL_290_BERTH_EVENT, { berthId: this._reservedBerth, until: this._wordUntil, t: now });
          break;
        }
      }

      // Taking a berth — reserved or not — is a take; cold takes bite after three.
      // A take counts once per approach: leave the berth zone before the next one counts.
      let nearAnyBerth = false;
      for (let i = 0; i < this._berthIds.length; i += 1) {
        const berth = this._berthIds[i] != null ? this._get(this._berthIds[i]) : null;
        if (!berth?.data || berth.data.plantsPl290Filled) continue;
        const dB = Math.hypot(player.pos.x - berth.pos.x, player.pos.z - berth.pos.z);
        if (dB > 20 || speed > t.takeSpeedWu) continue;
        nearAnyBerth = true;
        if (!this._berthClear) break;
        this._takeS += Math.max(0, Number(dt) || 0);
        if (this._takeS >= t.takeS) {
          this._takeS = 0;
          this._berthClear = false;
          const wasReserved = berth.data.plantsPl290ReservedForYou === true;
          berth.data.plantsPl290ReservedForYou = false;
          if (this._reservedBerth === this._berthIds[i]) {
            this._reservedBerth = null;
            this._reservedVisit = false;
          }
          if (!wasReserved && !wordActive && !this._wordCold) {
            // Take favors and give none: the ledger records a cold take.
            const key = `${s.playerId}@${t.stationId}`;    // social memory: hull + station
            const count = (this._coldTakes.get(key) || 0) + 1;
            if (this._coldTakes.size >= t.memoryCap) this._coldTakes.clear();
            this._coldTakes.set(key, count);
            this._emit(PL_290_COLD_EVENT, { coldTakes: count, t: now });
            if (count >= t.coldTakesForBite) {
              this._wordCold = true;
              const flags = this._flags();
              if (flags) flags.plantsPl290WordCold = true;
              this._popup(`plants:pl290:filled:${Math.round(now)}`, t.dockhandCallsign, FILLED_LINE);
              this._emit(PL_290_FILLED_EVENT, { t: now });
            }
          }
          break;
        }
      }
      if (!nearAnyBerth) {
        this._berthClear = true;
        this._takeS = 0;
      }

      // The word stops: berths fill around you — real hulls park in the props.
      if (this._wordCold && hauler?.pos && this._haulerId != null) {
        for (const id of this._berthIds) {
          const berth = id != null ? this._get(id) : null;
          if (!berth?.data || berth.data.plantsPl290Filled || berth.data.plantsPl290ReservedForYou) continue;
          if (Math.hypot(player.pos.x - berth.pos.x, player.pos.z - berth.pos.z) > 100) continue;
          berth.data.plantsPl290Filled = true;
          berth.data.swarmFloorPad = { label: 'FILLED' };
          const spec = makeShipEntitySpec(t.haulerHull, {
            team: 2,
            factionId: t.dockhandFaction,
            pos: { x: berth.pos.x + 6, z: berth.pos.z + 4 },
            ai: { archetype: 'passive', passive: true },
          });
          spec.data = spec.data || {};
          spec.data.plantsPl290Filler = true;
          spec.data.parentType = 'story_prop';
          spec.data.despawnAt = null;
          const filler = this.helpers?.spawnEntity?.(spec);
          if (filler && filler.id != null) this._fillerIds.push(filler.id);
          break;                                             // one berth fills per pass
        }
      }
    },
  };
}

export const goodWordPlant = createGoodWord();
