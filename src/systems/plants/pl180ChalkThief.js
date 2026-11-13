// PL-180 The chalk thief — Ceres (design/program/INFERENCE_PLANTS.md, row PL-180).
// "The chalk thief. Overnight, someone beats your swing time on the anchor board by a
// hair. It is Old Hob. Chalk yours under his; by morning it is beaten again, by the same
// hair."
// What the player can do: Chalk yours under his; by morning it is beaten again, by the
// same hair.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - A "swing" is a real flown lap: a full 2-pi orbit of the anchor rock inside the orbit
//   band (docking ring 2.4x to patrol ring 4x dockRadius, stationBubbles), timed by the
//   sim clock. Leaving the band breaks the lap.
// - The anchor board is a readable floor-pad beacon on the noFire ring (1.5x).
// - The thief answers only CHALKED times: overnight (day-index rollover) Old Hob beats
//   the best time by the same hair. No lap, no thief — nothing is invented.
// - Bounded Maps with tuning.memoryCap; cooldowns in sim time.
// - Session state on `this`; destroy() unsubscribes all + despawns owned entities.

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';

export const PL_180_CHALKED_EVENT = 'plants:pl180:chalked';
export const PL_180_BEATEN_EVENT = 'plants:pl180:beaten';

export const CHALK_THIEF_TUNING = Object.freeze({
  anchorStationId: 'station_ceres',
  dayLengthS: 240,
  boardRadiusMult: BUBBLE_MULTIPLIERS.noFire,      // 1.5x — the board by the dock line
  orbitInnerMult: BUBBLE_MULTIPLIERS.docking,      // 2.4x — swing band inner
  orbitOuterMult: BUBBLE_MULTIPLIERS.patrol,       // 4x — swing band outer
  hairS: 0.4,                                      // the same hair, every morning
  minLapS: 8,                                      // a flown lap, not a twitch
  thiefSender: 'OLD HOB',
  boardSender: 'ANCHOR BOARD',
  memoryCap: 8,
});

export function dockRadiusOf(station) {
  if (!station) return 72;
  const d = station.data || {};
  if (Number.isFinite(d.dockRadius) && d.dockRadius > 0) return d.dockRadius;
  const size = station.size || d.size;
  return size === 'L' ? 90 : size === 'S' ? 60 : 72; // bountyMarks.js:165 size rule
}

export function boardPointFor(station, t = CHALK_THIEF_TUNING) {
  const a = (hash32('pl180board', (station.data && station.data.stationId) || station.id) % 6283) / 1000;
  const r = dockRadiusOf(station) * t.boardRadiusMult;
  return { x: station.pos.x + Math.cos(a) * r, z: station.pos.z + Math.sin(a) * r };
}

export function thiefTimeOf(bestS, t = CHALK_THIEF_TUNING) {
  if (!Number.isFinite(bestS) || bestS <= 0) return null;
  return Math.round((bestS - t.hairS) * 10) / 10;
}

export function formatTimeS(v) {
  return Number.isFinite(v) ? `${Math.round(v * 10) / 10}` : '';
}

export function createPl180ChalkThief() {
  return {
    name: 'plantsPl180',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._boardId = null;
      this._boardStationKey = null;
      this._orbit = { acc: 0, startAt: null, inside: false, lastAng: null };
      this._playerBestS = null;
      this._thiefBestS = null;
      this._holder = null;
      this._lastDayIndex = -1;
      const on = (event, fn) => {
        const off = this.bus && this.bus.on ? this.bus.on(event, fn) : null;
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:exit', () => this._resetSession());
      on('save:loaded', () => this._resetSession());
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
      if (this._boardId != null && this.helpers && typeof this.helpers.removeEntity === 'function') {
        this.helpers.removeEntity(this._boardId);
      }
      this._boardId = null;
      this._boardStationKey = null;
      this._orbit = { acc: 0, startAt: null, inside: false, lastAng: null };
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s && s.simTime) ? s.simTime : (Number.isFinite(s && s.tick) ? s.tick / 60 : 0);
    },

    _popup(id, sender, text, ttl = 8) {
      if (!this.bus || typeof this.bus.emit !== 'function') return;
      this.bus.emit('comms:popup', { id, sender, category: 'traffic', text, ttl, persist: false });
    },

    _cue(id, gain = 0.4) {
      if (!this.bus || typeof this.bus.emit !== 'function') return;
      this.bus.emit('audio:cue', { id, gain });
    },

    _emit(type, payload) {
      if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(type, payload);
    },

    _get(id) {
      return this.state && this.state.entities && typeof this.state.entities.get === 'function'
        ? this.state.entities.get(id) : null;
    },

    _station(state) {
      const player = state && state.entities && typeof state.entities.get === 'function'
        ? state.entities.get(state.playerId) : null;
      if (!player || !player.pos) return null;
      const idx = state.entityIndex;
      const list = (idx && Array.isArray(idx.stations) && idx.stations.length)
        ? idx.stations
        : (Array.isArray(state.entityList) ? state.entityList : [...(state.entities ? state.entities.values() : [])]);
      let best = null;
      let bestD2 = Infinity;
      for (const st of list) {
        if (!st || st.alive === false || st.type !== 'station') continue;
        if ((st.data && st.data.stationId || st.id) !== CHALK_THIEF_TUNING.anchorStationId) continue;
        const d2 = (st.pos.x - player.pos.x) ** 2 + (st.pos.z - player.pos.z) ** 2;
        if (d2 < bestD2) { bestD2 = d2; best = st; }
      }
      return best;
    },

    _ensureBoard(station) {
      const key = (station.data && station.data.stationId) || station.id;
      if (this._boardStationKey === key && this._boardId != null) return;
      const spawn = this.helpers && this.helpers.spawnEntity;
      if (typeof spawn !== 'function') return;
      const point = boardPointFor(station, CHALK_THIEF_TUNING);
      const ent = spawn({
        type: 'beacon',
        pos: { x: point.x, z: point.z },
        vel: { x: 0, z: 0 },
        radius: 4,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        collides: false,
        physicsBody: false,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_anchor_board',
          plantsPl180Board: true,
          scanLabel: 'The anchor board — swing times, chalked',
          swarmFloorPad: { label: 'ANCHOR BOARD — no times yet' },
        },
      });
      this._boardId = ent && ent.id != null ? ent.id : null;
      this._boardStationKey = this._boardId != null ? key : null;
      this._syncBoard();
    },

    _syncBoard() {
      const board = this._get(this._boardId);
      if (!board || !board.data) return;
      let label = 'ANCHOR BOARD — no times yet';
      if (this._holder === 'Old Hob' && this._thiefBestS != null) {
        label = `ANCHOR BOARD — Old Hob ${formatTimeS(this._thiefBestS)} s`;
      } else if (this._holder === 'You' && this._playerBestS != null) {
        label = `ANCHOR BOARD — you ${formatTimeS(this._playerBestS)} s`;
      }
      board.data.swarmFloorPad = { label };
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      const now = this._now();
      const t = CHALK_THIEF_TUNING;
      const station = this._station(s);
      if (!station) return;
      this._ensureBoard(station);
      if (this._boardId == null) return;

      // Overnight: day rollover, the thief answers whatever is chalked.
      const dayIndex = Math.floor(now / t.dayLengthS);
      if (this._lastDayIndex >= 0 && dayIndex !== this._lastDayIndex && this._holder != null) {
        const target = this._holder === 'You' ? this._playerBestS : this._thiefBestS;
        const beaten = thiefTimeOf(target, t);
        if (beaten != null) {
          const previousHolder = this._holder;
          this._thiefBestS = beaten;
          this._holder = 'Old Hob';
          this._syncBoard();
          this._popup(`plants:pl180:beaten:${Math.round(now)}`, t.thiefSender,
            `By morning it is beaten again — ${formatTimeS(beaten)} s, by the same hair.`);
          this._cue('ui_deny', 0.35);
          this._emit(PL_180_BEATEN_EVENT, {
            previousHolder, thiefS: beaten, hairS: t.hairS, t: now,
          });
        }
      }
      this._lastDayIndex = dayIndex;

      // Swing tracking runs per tick: the lap is a flown fact.
      const player = this._get(s.playerId);
      if (!player || !player.pos) return;
      const inner = dockRadiusOf(station) * t.orbitInnerMult;
      const outer = dockRadiusOf(station) * t.orbitOuterMult;
      const rx = player.pos.x - station.pos.x;
      const rz = player.pos.z - station.pos.z;
      const r = Math.hypot(rx, rz);
      const inside = r >= inner && r <= outer;
      if (!inside) {
        this._orbit = { acc: 0, startAt: null, inside: false, lastAng: null };
        return;
      }
      const ang = Math.atan2(rz, rx);
      if (this._orbit.lastAng != null) {
        let d = ang - this._orbit.lastAng;
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        this._orbit.acc += d;
      }
      this._orbit.lastAng = ang;
      this._orbit.inside = true;
      if (this._orbit.startAt == null) this._orbit.startAt = now;
      if (Math.abs(this._orbit.acc) >= Math.PI * 2) {
        const lapS = now - this._orbit.startAt;
        this._orbit = { acc: 0, startAt: now, inside: true, lastAng: ang };
        if (lapS >= t.minLapS && (this._playerBestS == null || lapS < this._playerBestS)) {
          this._playerBestS = Math.round(lapS * 10) / 10;
          if (this._thiefBestS == null || this._playerBestS < this._thiefBestS) {
            const underHis = this._holder === 'Old Hob';
            this._holder = 'You';
            this._syncBoard();
            this._popup(`plants:pl180:chalked:${Math.round(now)}`, t.boardSender,
              `Chalked: ${formatTimeS(this._playerBestS)} s${underHis ? ' — under his, by a hair of your own.' : '.'}`);
            this._cue('confirm', 0.4);
            this._emit(PL_180_CHALKED_EVENT, { playerS: this._playerBestS, underHis, t: now });
          } else {
            this._holder = 'You';
            this._syncBoard();
          }
        }
      }
    },
  };
}

export const pl180ChalkThief = createPl180ChalkThief();
