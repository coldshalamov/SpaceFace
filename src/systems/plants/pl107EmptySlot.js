// PL-107 The empty slot — Ceres (design/program/INFERENCE_PLANTS.md, row PL-107).
// "The empty slot. A barge misses its number and the whole shift circles the Rock an extra
// lap rather than re-count. Lead the barge home and the mouth flashes thanks; slide into
// its slot yourself and the board counts you in — mouth right-of-way included."
// What the player can do: Return it; or fly as barge nine for a day, and Dessa Kroll
// reads the board twice.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - The lost barge circles the patrol ring (4x dockRadius, stationBubbles); the mouth slot
//   sits on the noFire ring (1.5x). Zones read real dockRadius via the size rule.
// - The mouth flash rides the station entity's data bag like applausePlant's dock-lamp
//   flash (plantsMouthFlashUntil), so the renderer can read it without new contracts.
// - Leading is positional: the barge homes while the player stays within lead range.
// - The wrong choice is positional too: parked inside the slot while a barge is lost
//   counts the player in as barge nine for a yard day (Dessa Kroll reads the board twice).
// - Bounded Maps with tuning.memoryCap; cooldowns in sim time; NPC barge spawns through
//   helpers.spawnEntity(makeShipEntitySpec(...)) passive team-2 (traffic.js pattern).
// - Session state on `this`; destroy() unsubscribes all + despawns owned entities.

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';
import { makeShipEntitySpec } from '../ships.js';

export const PL_107_HOME_EVENT = 'plants:pl107:home';
export const PL_107_BARGE_NINE_EVENT = 'plants:pl107:bargeNine';
export const PL_107_RIGHT_OF_WAY_EVENT = 'plants:pl107:rightOfWay';

export const EMPTY_SLOT_TUNING = Object.freeze({
  anchorStationId: 'station_ceres',
  shiftLengthS: 180,
  orbitRadiusMult: BUBBLE_MULTIPLIERS.patrol,   // 4x — the extra lap
  mouthRadiusMult: BUBBLE_MULTIPLIERS.noFire,   // 1.5x — the mouth
  slotRadiusWu: 16,
  leadRangeWu: 70,
  bargeOrbitRateRad: 0.12,
  bargeHomeSpeedWuPerS: 26,
  stillGateWuPerS: 6,
  bargeNineDayS: 240,                           // a yard day
  mouthFlashS: 1.2,
  rowGapS: 0.8,                                 // the two board reads, apart
  memoryCap: 8,
});

export function dockRadiusOf(station) {
  if (!station) return 72;
  const d = station.data || {};
  if (Number.isFinite(d.dockRadius) && d.dockRadius > 0) return d.dockRadius;
  const size = station.size || d.size;
  return size === 'L' ? 90 : size === 'S' ? 60 : 72; // bountyMarks.js:165 size rule
}

export function mouthPointFor(station, t = EMPTY_SLOT_TUNING) {
  const r = dockRadiusOf(station) * t.mouthRadiusMult;
  const a = (hash32(seedOf(station), 'pl107mouth') % 6283) / 1000;
  return { x: station.pos.x + Math.cos(a) * r, z: station.pos.z + Math.sin(a) * r };
}

function seedOf(station) {
  return (station.data && station.data.stationId) || station.id || 'station_ceres';
}

export function createPl107EmptySlot() {
  return {
    name: 'plantsPl107',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._accum = 0;
      this._bargeId = null;
      this._bargeShift = -1;
      this._bargeAngle = 0;
      this._mouth = null;
      this._mouthStationId = null;
      this._bargeNineUntil = -Infinity;
      this._lastRowRead = -Infinity;
      this._lastRightOfWay = -Infinity;
      const on = (event, fn) => {
        const off = this.bus && this.bus.on ? this.bus.on(event, fn) : null;
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:exit', () => this._reset());
      on('save:loaded', () => this._reset());
      on('game:newGame', () => this._reset());
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._reset();
    },

    _reset() {
      if (this._bargeId != null && this.helpers && typeof this.helpers.removeEntity === 'function') {
        this.helpers.removeEntity(this._bargeId);
      }
      this._bargeId = null;
      this._accum = 0;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s && s.simTime) ? s.simTime : (Number.isFinite(s && s.tick) ? s.tick / 60 : 0);
    },

    _popup(id, sender, text, ttl = 7, category = 'traffic') {
      if (!this.bus || typeof this.bus.emit !== 'function') return;
      this.bus.emit('comms:popup', { id, sender, category, text, ttl, persist: false });
    },

    _voice(id, text, ttl = 8) {
      const say = this.helpers && this.helpers.voice && this.helpers.voice.say;
      if (typeof say === 'function') {
        say({ id, channel: 'ambient', priority: 1, text, ttl });
        return;
      }
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit('voice:say', { id, channel: 'ambient', priority: 1, text, ttl });
      }
    },

    _cue(id, gain = 0.5) {
      if (!this.bus || typeof this.bus.emit !== 'function') return;
      this.bus.emit('audio:cue', { id, gain });
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
        if ((st.data && st.data.stationId || st.id) !== EMPTY_SLOT_TUNING.anchorStationId) continue;
        const d2 = (st.pos.x - player.pos.x) ** 2 + (st.pos.z - player.pos.z) ** 2;
        if (d2 < bestD2) { bestD2 = d2; best = st; }
      }
      return best;
    },

    _spawnBarge(station, now) {
      const spawn = this.helpers && this.helpers.spawnEntity;
      if (typeof spawn !== 'function') return;
      const t = EMPTY_SLOT_TUNING;
      const orbit = dockRadiusOf(station) * t.orbitRadiusMult;
      const a = (hash32(seedOf(station), 'pl107', Math.floor(now / t.shiftLengthS)) % 6283) / 1000;
      this._bargeAngle = a;
      const spec = makeShipEntitySpec('ship_kestrel', {
        team: 2,
        factionId: (station.data && station.data.factionId) || 'faction_dmc',
        pos: { x: station.pos.x + Math.cos(a) * orbit, z: station.pos.z + Math.sin(a) * orbit },
        ai: { archetype: 'passive', passive: true },
      });
      spec.data = spec.data || {};
      spec.data.plantsPl107Barge = true;
      spec.data.callsign = 'Barge nine';
      spec.data.swarmFloorPad = { label: 'BARGE NINE — MISSED ITS NUMBER' };
      const ent = spawn(spec);
      if (ent && ent.id != null) {
        this._bargeId = ent.id;
        this._bargeShift = Math.floor(now / t.shiftLengthS);
      }
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      const now = this._now();
      const t = EMPTY_SLOT_TUNING;
      const station = this._station(s);
      if (!station) { this._accum = 0; return; }
      if (!this._mouth || this._mouthStationId !== seedOf(station)) {
        this._mouth = mouthPointFor(station, t);
        this._mouthStationId = seedOf(station);
      }
      const player = this._get(s.playerId);
      if (!player || !player.pos) return;

      const barge = this._bargeId != null ? this._get(this._bargeId) : null;
      const bargeActive = barge && barge.alive !== false;
      const shiftIndex = Math.floor(now / t.shiftLengthS);

      if (!bargeActive && shiftIndex !== this._bargeShift) {
        this._spawnBarge(station, now);
      }

      this._accum += Math.max(0, Number(dt) || 0);
      if (this._accum < 1) return;             // 1 Hz — no per-frame work
      this._accum = 0;

      const live = this._bargeId != null ? this._get(this._bargeId) : null;
      if (live && live.alive !== false && live.pos) {
        const mouthD = Math.hypot(live.pos.x - this._mouth.x, live.pos.z - this._mouth.z);
        if (mouthD <= t.slotRadiusWu) {
          // Led home: the mouth flashes thanks, the barge goes in, the extra lap ends.
          const sd = station.data || (station.data = {});
          sd.plantsMouthFlashUntil = now + t.mouthFlashS;
          this._popup(`plants:pl107:home:${Math.round(now)}`, 'Ceres dock board',
            'The mouth flashes twice. Barge nine, counted right at last.');
          this._cue('confirm', 0.5);
          if (this.bus && typeof this.bus.emit === 'function') {
            this.bus.emit(PL_107_HOME_EVENT, { t: now });
          }
          if (this.helpers.removeEntity) this.helpers.removeEntity(this._bargeId);
          this._bargeId = null;
        } else {
          // The barge circles the Rock an extra lap — unless the player is leading it home.
          const leadD = Math.hypot(player.pos.x - live.pos.x, player.pos.z - live.pos.z);
          if (leadD <= t.leadRangeWu) {
            const dx = this._mouth.x - live.pos.x;
            const dz = this._mouth.z - live.pos.z;
            const d = Math.hypot(dx, dz) || 1;
            const step = Math.min(t.bargeHomeSpeedWuPerS, d);
            live.pos.x += (dx / d) * step;
            live.pos.z += (dz / d) * step;
          } else {
            this._bargeAngle += t.bargeOrbitRateRad;
            const orbit = dockRadiusOf(station) * t.orbitRadiusMult;
            live.pos.x = station.pos.x + Math.cos(this._bargeAngle) * orbit;
            live.pos.z = station.pos.z + Math.sin(this._bargeAngle) * orbit;
          }
        }
      } else if (this._bargeId != null) {
        this._bargeId = null;
      }

      // Wrong choice: slide into its slot yourself while a barge is lost.
      const speed = player.vel ? Math.hypot(Number(player.vel.x) || 0, Number(player.vel.z) || 0) : 0;
      const slotD = Math.hypot(player.pos.x - this._mouth.x, player.pos.z - this._mouth.z);
      const bargeOut = this._bargeId != null;
      if (bargeOut && speed <= t.stillGateWuPerS && slotD <= t.slotRadiusWu && now >= this._bargeNineUntil) {
        this._bargeNineUntil = now + t.bargeNineDayS;
        this._lastRowRead = now;
        this._popup(`plants:pl107:nine_a:${Math.round(now)}`, 'DESSA KROLL',
          'The board counts you in: barge nine, mouth right-of-way included.');
        this._cue('ui_deny', 0.5);
        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit(PL_107_BARGE_NINE_EVENT, { until: this._bargeNineUntil, t: now });
        }
      }
      // Dessa Kroll reads the board twice.
      if (now < this._bargeNineUntil && now - this._lastRowRead >= t.rowGapS && this._lastRowRead > 0) {
        this._lastRowRead = -Infinity;
        this._voice(`plants:pl107:read_a:${Math.round(now)}`,
          'Board check. Barge nine — the slot took a hull, not a barge.');
        this._voice(`plants:pl107:read_b:${Math.round(now)}`,
          'Read it twice. Counts the same. Barge nine, mouth right-of-way.');
      }
      // The counted-in hull keeps the mouth: traffic yields.
      if (now < this._bargeNineUntil && bargeOut && this._mouth) {
        const live2 = this._get(this._bargeId);
        if (live2 && live2.pos) {
          const d = Math.hypot(live2.pos.x - this._mouth.x, live2.pos.z - this._mouth.z);
          if (d <= t.slotRadiusWu * 3 && now - this._lastRightOfWay >= t.shiftLengthS / 2) {
            this._lastRightOfWay = now;
            this._popup(`plants:pl107:row:${Math.round(now)}`, 'Ceres dock board',
              'Mouth right-of-way: barge nine holds the slot, traffic yields.');
            if (this.bus && typeof this.bus.emit === 'function') {
              this.bus.emit(PL_107_RIGHT_OF_WAY_EVENT, { t: now });
            }
          }
        }
      }
    },
  };
}

export const pl107EmptySlot = createPl107EmptySlot();
