// PL-245 The Bell's hush — "After any ring of the Bell, the whole belt's radio goes quiet
// for one minute — even Static waits | Be quiet with them; or fill the silence, and be
// answered by everyone at once"
//
// SEAM NOTE (honest, substitutes declared): no canonical "ring of the Bell" event exists
// in code (the Eighth Bell and Cantor's practice bell are other sectors' one-off story
// pieces), so this plant owns the Bell honestly: a fixed Bell prop off the live
// station_ceres body in sector_ceres_belt (src/data/sectors.js:314), which rings once per
// shift on the shared plant clock — a real deep audio cue and a `plants:pl245:ring`
// event. The hush that follows is this plant's own lane discipline: the Bell goes quiet,
// the plant emits nothing while it holds, and the station body carries a read-only stamp
// (`plantsPl245HushUntil`) a radio layer can honour. Firing a weapon inside the hush is
// filling the silence: the whole street answers at once — three lamp flashes together,
// one deny cue, one chorus event. No voice line, ever: the hush is the plant's one voice.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes every listener, despawns the Bell,
//   clears the hush stamp (tuning.memoryCap).
// - One hush per ring; the chorus answers at most once per hush.

import { hash32 } from '../../core/rng.js';

export const PL_245_RING_EVENT = 'plants:pl245:ring';
export const PL_245_HUSH_EVENT = 'plants:pl245:hush';
export const PL_245_QUIET_EVENT = 'plants:pl245:quiet';
export const PL_245_CHORUS_EVENT = 'plants:pl245:chorus';

export const BELLS_HUSH_TUNING = Object.freeze({
  sectorId: 'sector_ceres_belt',
  stationId: 'station_ceres',
  shiftLengthS: 120,
  ringPhaseS: 8,              // the Bell rings this deep into each shift
  hushS: 60,                  // one minute — even Static waits
  bellOffsetWu: 190,
  bearingSalt: 'plantsPl245Bell',
  ringRate: 0.55,
  ringGain: 0.5,
  chorusFlashS: 2.5,
  chorusFlashCount: 3,
  memoryCap: 4,
});

/** Fixed Bell spot off the live station body. */
export function bellSpotFor(origin, t = BELLS_HUSH_TUNING) {
  const h = hash32(t.bearingSalt, t.stationId);
  const bearing = (h % 3600) / 3600 * Math.PI * 2;
  return {
    x: origin.x + Math.cos(bearing) * t.bellOffsetWu,
    z: origin.z + Math.sin(bearing) * t.bellOffsetWu,
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

export function createPl245TheBellsHush() {
  return {
    name: 'plantsPl245',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._bellId = null;
      this._shiftSeen = -1;
      this._hushUntil = null;
      this._ringShift = null;
      this._loud = false;
      this._answered = false;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('combat:fire', (p = {}) => this._onFire(p));
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
      this._resetVisit();
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        if (this._bellId != null) rm(this._bellId);
      }
      this._bellId = null;
    },

    _resetVisit() {
      this._shiftSeen = -1;
      this._hushUntil = null;
      this._ringShift = null;
      this._loud = false;
      this._answered = false;
      this._clearStamp();
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _stamp() {
      // A read-only courtesy stamp on the station body: radio layers may honour the hush.
      if (!this.state) return;
      const station = stationOf(this.state, BELLS_HUSH_TUNING.stationId);
      if (station?.data && this._hushUntil != null) {
        station.data.plantsPl245HushUntil = this._hushUntil;
      }
    },

    _clearStamp() {
      if (!this.state) return;
      const station = stationOf(this.state, BELLS_HUSH_TUNING.stationId);
      if (station?.data) station.data.plantsPl245HushUntil = null;
    },

    _ensureBell(origin) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._bellId != null) return;
      const t = BELLS_HUSH_TUNING;
      const spot = bellSpotFor(origin, t);
      const ent = spawn({
        type: 'beacon',
        pos: { x: spot.x, z: spot.z },
        vel: { x: 0, z: 0 },
        radius: 7,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        homeSectorId: t.sectorId,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_the_bell',
          plantsPl245Bell: true,
          scanLabel: 'The Bell — even Static waits after it rings',
          swarmFloorPad: { label: 'The Bell' },
        },
      });
      if (ent && ent.id != null) this._bellId = ent.id;
    },

    _onFire(p) {
      const s = this.state;
      if (!s || !p) return;
      if (p.ownerId !== s.playerId && p.shipId !== s.playerId && p.entityId !== s.playerId) return;
      if (this._hushUntil == null) return;
      const now = this._now();
      if (now >= this._hushUntil) return;
      this._loud = true;
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== BELLS_HUSH_TUNING.sectorId) { this._resetVisit(); return; }
      const station = stationOf(s, BELLS_HUSH_TUNING.stationId);
      if (!station?.pos) { this._resetVisit(); return; }
      const t = BELLS_HUSH_TUNING;
      const now = this._now();
      this._ensureBell(station.pos);

      // The Bell rings once per shift.
      const shiftIndex = Math.floor(now / t.shiftLengthS);
      const phase = ((now % t.shiftLengthS) + t.shiftLengthS) % t.shiftLengthS;
      if (this._ringShift !== shiftIndex && phase >= t.ringPhaseS) {
        this._ringShift = shiftIndex;
        this._hushUntil = now + t.hushS;
        this._loud = false;
        this._answered = false;
        this.bus?.emit('audio:cue', { id: 'sfx_vent_chime', rate: t.ringRate, gain: t.ringGain });
        const bell = this._bellId != null && s.entities?.get ? s.entities.get(this._bellId) : null;
        if (bell?.data) {
          bell.data.lampsFlashing = true;
          bell.data.lampFlashUntil = now + 1.5;
        }
        this.bus?.emit(PL_245_RING_EVENT, { shift: shiftIndex, hushUntil: this._hushUntil, t: now });
        this.bus?.emit(PL_245_HUSH_EVENT, { until: this._hushUntil, t: now });
        this._stamp();
      }

      if (this._hushUntil == null) return;

      if (now < this._hushUntil) {
        // The hush holds. Firing answered it: everyone at once, then never again this hush.
        if (this._loud && !this._answered) {
          this._answered = true;
          const bell = this._bellId != null && s.entities?.get ? s.entities.get(this._bellId) : null;
          for (let i = 0; i < t.chorusFlashCount; i += 1) {
            this.bus?.emit('audio:cue', {
              id: 'sfx_vent_chime', rate: 0.8 + i * 0.3, gain: 0.35,
            });
          }
          if (bell?.data) {
            bell.data.lampsFlashing = true;
            bell.data.lampFlashUntil = now + t.chorusFlashS;
          }
          this.bus?.emit(PL_245_CHORUS_EVENT, { shift: this._ringShift, t: now });
        }
        return;
      }

      // The minute is out. Quiet with them? Nothing was fired into the silence.
      if (!this._loud && !this._answered) {
        this.bus?.emit('audio:cue', { id: 'confirm', gain: 0.25 });
        this.bus?.emit(PL_245_QUIET_EVENT, { shift: this._ringShift, t: now });
      }
      this._hushUntil = null;
      this._loud = false;
      this._answered = false;
      this._clearStamp();
    },
  };
}

export const pl245TheBellsHush = createPl245TheBellsHush();
