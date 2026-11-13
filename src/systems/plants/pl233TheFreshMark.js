// PL-233 The fresh mark — "One morning every hull Fitch had chalked has a second mark
// beside it: KNOCKED, in a steady hand, all down the street. Somebody worked all night |
// Admire the night's work — Fitch does"
//
// SEAM NOTE (honest): Pallas Drift's street is a fixed row of chalked hull props off the
// live station_drift body in sector_pallas_drift (src/data/sectors.js:736). During the
// night band of the shared 240 s plant day, a stranger — the knocker, a real neutral hull
// (makeShipEntitySpec, team 2, passive) — walks the street hull to hull. At every hull it
// stops and the second mark goes on: a KNOCKED stamp beside Fitch's chalk, all down the
// street. At dawn the knocker is gone — somebody worked all night. Park near the fresh
// marks and admire them; Fitch does too, once per visit. Scrape one (a real impact) and
// the chalk smears off that hull — the record does not come back.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM. Marks are data stamps + pad labels the street layer reads.
// - Session state on `this`; destroy() unsubscribes every listener, despawns the street
//   and the knocker, clears session state (tuning.memoryCap).
// - One working night: the marks are laid once, on the first night after the street exists.

import { hash32 } from '../../core/rng.js';
import { makeShipEntitySpec } from '../ships.js';

export const PL_233_MARKED_EVENT = 'plants:pl233:marked';
export const PL_233_DONE_EVENT = 'plants:pl233:done';
export const PL_233_ADMIRE_EVENT = 'plants:pl233:admired';
export const PL_233_SMEARED_EVENT = 'plants:pl233:smeared';

export const FRESH_MARK_TUNING = Object.freeze({
  sectorId: 'sector_pallas_drift',
  stationId: 'station_drift',
  streetCount: 4,
  streetSpacingWu: 95,
  streetOffsetWu: 300,
  bearingSalt: 'plantsPl233Street',
  dayLengthS: 240,
  nightFraction: 0.25,        // the knocker works the last quarter of the day
  knockStopS: 4,              // it takes a moment per hull
  admireRadiusWu: 70,
  admireNeedS: 5,
  markImpulseGate: 110,       // a real scrape takes the chalk off
  knockerHull: 'ship_drifter',
  factionId: 'faction_mts',
  hullRadius: 9,
  memoryCap: 6,
});

export const KNOCKED_COPY = 'Somebody worked all night.';

/** Fixed street layout off the live station body: Fitch's chalked hulls. */
export function markStreetFor(origin, t = FRESH_MARK_TUNING) {
  const h = hash32(t.bearingSalt, t.stationId);
  const bearing = (h % 3600) / 3600 * Math.PI * 2;
  const dir = { x: Math.cos(bearing), z: Math.sin(bearing) };
  const hulls = [];
  for (let i = 0; i < t.streetCount; i += 1) {
    const along = t.streetOffsetWu + i * t.streetSpacingWu;
    hulls.push({ x: origin.x + dir.x * along, z: origin.z + dir.z * along });
  }
  return hulls;
}

export function inNightBand(simTime, t = FRESH_MARK_TUNING) {
  const len = Math.max(1, t.dayLengthS);
  const phase = ((simTime % len) + len) % len;
  return phase >= len * (1 - t.nightFraction);
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

export function createPl233TheFreshMark() {
  return {
    name: 'plantsPl233',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._hullIds = [];
      this._knockerId = null;
      this._nightDone = false;      // the one working night, whenever it lands
      this._workDay = null;
      this._nightSeen = null;
      this._targetIndex = 0;
      this._knockAt = null;
      this._markedCount = 0;
      this._admireSince = null;
      this._admiredVisit = false;
      this._fitchSilenced = false;
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
      this._nightDone = false;
      this._workDay = null;
      this._nightSeen = null;
      this._resetVisit();
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        for (const id of this._hullIds || []) rm(id);
      }
      this._hullIds = [];
    },

    _resetVisit() {
      if (this._knockerId != null) this.helpers?.removeEntity?.(this._knockerId);
      this._knockerId = null;
      this._targetIndex = 0;
      this._knockAt = null;
      this._admireSince = null;
      this._admiredVisit = false;
      this._fitchSilenced = this._markedCount > 0 ? this._fitchSilenced : false;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _hull(index) {
      const id = this._hullIds[index];
      return id != null && this.state?.entities?.get ? this.state.entities.get(id) : null;
    },

    _ensureStreet(origin) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._hullIds.length) return;
      const t = FRESH_MARK_TUNING;
      markStreetFor(origin, t).forEach((pos) => {
        const ent = spawn({
          type: 'beacon',
          pos: { x: pos.x, z: pos.z },
          vel: { x: 0, z: 0 },
          radius: t.hullRadius,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: t.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_chalked_hull',
            plantsPl233Hull: true,
            scanLabel: 'A hull Fitch chalked',
            swarmFloorPad: { label: 'Fitch\u2019s chalk' },
          },
        });
        this._hullIds.push(ent && ent.id != null ? ent.id : null);
      });
    },

    _ensureKnocker(origin) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._knockerId != null) return;
      const t = FRESH_MARK_TUNING;
      const street = markStreetFor(origin, t);
      const spec = makeShipEntitySpec(t.knockerHull, {
        team: 2,
        factionId: t.factionId,
        pos: { x: street[0].x, z: street[0].z },
        ai: { archetype: 'passive', passive: true },
      });
      spec.data = spec.data || {};
      spec.data.plantsPl233Knocker = true;
      spec.data.parentType = 'story_prop';
      spec.data.callsign = 'The night\u2019s work';
      spec.data.despawnAt = null;
      const ent = spawn(spec);
      if (ent && ent.id != null) this._knockerId = ent.id;
    },

    _markHull(index, now) {
      const hull = this._hull(index);
      if (!hull?.data) return;
      hull.data.plantsPl233Knocked = true;
      hull.data.scanLabel = 'Fitch\u2019s chalk, and beside it: KNOCKED, in a steady hand';
      hull.data.swarmFloorPad = { label: 'KNOCKED' };
      this._markedCount += 1;
      this.bus?.emit('audio:cue', { id: 'sfx_vent_chime', rate: 1.3, gain: 0.3 });
      this.bus?.emit(PL_233_MARKED_EVENT, { hullIndex: index, marks: this._markedCount, t: now });
    },

    _onImpact(p) {
      const s = this.state;
      if (!s || !p) return;
      const hull = [p.aId, p.bId]
        .map((id) => (id != null && s.entities?.get ? s.entities.get(id) : null))
        .find((e) => e && e.data && e.data.plantsPl233Hull === true);
      if (!hull) return;
      const otherId = p.aId === hull.id ? p.bId : p.aId;
      if (otherId !== s.playerId) return;
      if ((Number(p.impulse) || 0) < FRESH_MARK_TUNING.markImpulseGate) return;
      if (hull.data.plantsPl233Knocked !== true) return;
      // A real scrape takes the fresh mark off. The record does not come back.
      hull.data.plantsPl233Knocked = false;
      hull.data.scanLabel = 'A hull Fitch chalked — the second mark scraped off';
      hull.data.swarmFloorPad = { label: 'Fitch\u2019s chalk' };
      this._fitchSilenced = true; // Fitch does not admire the wrecked record
      this.bus?.emit('audio:cue', { id: 'ui_deny' });
      this.bus?.emit(PL_233_SMEARED_EVENT, { hullIndex: this._hullIds.indexOf(hull.id), t: this._now() });
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== FRESH_MARK_TUNING.sectorId) { this._resetVisit(); return; }
      const station = stationOf(s, FRESH_MARK_TUNING.stationId);
      if (!station?.pos) { this._resetVisit(); return; }
      const t = FRESH_MARK_TUNING;
      const now = this._now();
      this._ensureStreet(station.pos);

      const night = inNightBand(now, t);
      const day = Math.floor(now / Math.max(1, t.dayLengthS));

      // One working night: the first night band after the street exists.
      if (!this._nightDone && night && this._nightSeen !== `${day}`) {
        this._nightSeen = `${day}`;
        this._workDay = day;
        this._targetIndex = 0;
        this._knockAt = null;
        this._ensureKnocker(station.pos);
      }

      const knocker = this._knockerId != null && s.entities?.get ? s.entities.get(this._knockerId) : null;
      if (knocker?.pos && !this._nightDone) {
        const street = markStreetFor(station.pos, t);
        if (!night) {
          // Dawn: the work is done and the worker is gone.
          this._nightDone = true;
          this.helpers?.removeEntity?.(this._knockerId);
          this._knockerId = null;
          this.bus?.emit(PL_233_DONE_EVENT, { marks: this._markedCount, t: now });
        } else if (this._knockAt != null) {
          if (now >= this._knockAt) {
            this._markHull(this._targetIndex, now);
            this._knockAt = null;
            this._targetIndex += 1;
            if (this._targetIndex >= this._hullIds.length) {
              this._nightDone = true;
              this.helpers?.removeEntity?.(this._knockerId);
              this._knockerId = null;
              this.bus?.emit(PL_233_DONE_EVENT, { marks: this._markedCount, t: now });
            }
          }
        } else {
          const target = street[Math.min(this._targetIndex, street.length - 1)];
          const dx = target.x - knocker.pos.x;
          const dz = target.z - knocker.pos.z;
          const d = Math.hypot(dx, dz);
          const step = 14 * Math.max(0, Number(dt) || 0);
          if (d <= Math.max(step, 1)) {
            knocker.pos.x = target.x;
            knocker.pos.z = target.z;
            this._knockAt = now + t.knockStopS;
          } else {
            knocker.pos.x += (dx / d) * step;
            knocker.pos.z += (dz / d) * step;
          }
        }
      }

      // Admire the night's work — Fitch does, once per visit.
      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos || this._markedCount === 0 || this._admiredVisit || this._fitchSilenced) return;
      const speed = Math.hypot(Number(player.vel?.x) || 0, Number(player.vel?.z) || 0);
      let nearMarked = false;
      for (const id of this._hullIds) {
        const hull = id != null && s.entities?.get ? s.entities.get(id) : null;
        if (hull?.pos && hull.data?.plantsPl233Knocked === true
          && Math.hypot(player.pos.x - hull.pos.x, player.pos.z - hull.pos.z) <= t.admireRadiusWu) {
          nearMarked = true;
          break;
        }
      }
      if (nearMarked && speed <= 5) {
        if (this._admireSince == null) this._admireSince = now;
        else if (now - this._admireSince >= t.admireNeedS) {
          this._admiredVisit = true;
          this._admireSince = null;
          this.bus?.emit('comms:popup', {
            id: `plants:pl233:admire:${Math.round(now)}`,
            sender: 'Fitch',
            category: 'traffic',
            text: KNOCKED_COPY,
            ttl: 8,
            persist: false,
          });
          this.bus?.emit(PL_233_ADMIRE_EVENT, { marks: this._markedCount, t: now });
        }
      } else if (!nearMarked) {
        this._admireSince = null;
      }
    },
  };
}

export const pl233TheFreshMark = createPl233TheFreshMark();
