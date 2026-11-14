// PL-362 The name on the plate — "Wear a mark you earned into its home sector and dock
// plates greet your hull by name, out loud."
// What the player can do: Wear what you earned; or counterfeit a mark — the plates greet you
// by the real owner's name, loudly.
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; hash32 anchors; no Math.random/Date.now;
//   no Three.js/DOM.
// - The mark you earned: completing a stranger tow INTO a sector (a living stranger released
//   inside a dock ring of that sector, via the shared towWatch view) earns that sector's
//   mark. Dock plates (dock:range in that sector) greet your hull by its callsign, out loud
//   (voice + lamps), once per station day.
// - HONEST LIMIT: there is no mark-counterfeiting mechanic in the game, so the row's wrong
//   choice maps to the fraud the module CAN see: a "rescue" whose towed hull died on the
//   line (a fake receipt carried into the sector). The plates greet you by the real owner's
//   name — a deterministic local name from the sector's own registry order — loudly (gain up,
//   refusal lamps). Documented substitute, not a fake.
// - Bounded Maps with tuning.memoryCap; session state RESET on sector:exit / save:loaded /
//   game:new / game:newGame; destroy() unsubscribes.

import { hash32 } from '../../core/rng.js';
import { attachTowWatch, towTargetIdOf } from './towWatch.js';

export const PLANTS_PLATE_EVENT = 'plants:pl362:plate';
export const PLANTS_COUNTERFEIT_EVENT = 'plants:pl362:counterfeit';

export const PLATE_TUNING = Object.freeze({
  plId: 'pl362',
  holdS: 8,                    // a tow held this long earns its mark
  greetCooldownS: 240,         // once per station day-ish
  dockRadiusFallbackWu: 90,
  loudGain: 0.85,
  memoryCap: 12,
});

export const PLATE_OWNERS = Object.freeze([
  'MIRA VELL', 'OKSANA ROSS', 'OLD TANE', 'HENK BRANDT', 'RUTH ILES', 'SOL KAVAN',
]);

export const PL_362_MARK_STAMP = 'plantsPl362Marks';

/** The real owner whose name the plates read out — deterministic per sector. */
export function realOwnerName(sectorId) {
  const h = hash32('plantsPl362Owner', String(sectorId ?? 's1'));
  return PLATE_OWNERS[h % PLATE_OWNERS.length];
}

function finite(v, f = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
}

export function createPl362NameOnPlate() {
  return {
    name: 'plantsPl362',

    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._memory = new Map();
      this._marks = new Map();       // sectorId -> earned at
      this._fraud = new Map();       // sectorId -> until
      this._tow = null;
      this._greeted = new Map();     // stationId -> day greeted
      const on = (event, fn) => {
        const off = this.bus && this.bus.on ? this.bus.on(event, fn) : null;
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('dock:range', (p = {}) => this._onDockRange(p || {}));
      on('entity:killed', (p = {}) => this._onKilled(p || {}));
      on('sector:exit', () => this._reset());
      on('save:loaded', () => this._reset());
      on('game:new', () => this._reset());
      on('game:newGame', () => this._hardReset());
      this._pl362TowInstalled = false; // re-arm per init: the flag is host-lifetime, the bus is not
      attachTowWatch(this, 'pl362', () => this._memory);
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._reset();
      this.state = null;
      this.bus = null;
    },

    _reset() {
      if (this._memory) this._memory.clear();
      this._tow = null;
      if (this._greeted) this._greeted.clear();
    },

    _hardReset() {
      this._reset();
      if (this._marks) this._marks.clear();
      if (this._fraud) this._fraud.clear();
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s && s.simTime) ? s.simTime : (Number.isFinite(s && s.tick) ? s.tick / 60 : 0);
    },

    _sector() {
      const s = this.state;
      return (s && s.world && s.world.currentSectorId) || 's1';
    },

    _callsign() {
      const s = this.state;
      const player = s && s.entities && s.entities.get ? s.entities.get(s.playerId) : null;
      const cs = player && player.data && (player.data.callsign || player.data.name);
      return cs ? String(cs) : 'REGULAR';
    },

    update() {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      const now = this._now();
      const target = towTargetIdOf(s, this._memory, now);
      if (target != null && target !== s.playerId) {
        const e = s.entities && s.entities.get ? s.entities.get(target) : null;
        if (e && e.type === 'ship' && e.alive !== false) {
          if (!this._tow || this._tow.targetId !== target) this._tow = { targetId: target, since: now };
        } else {
          this._settleTow(now);
        }
      } else {
        this._settleTow(now);
      }
    },

    /** A released stranger inside a dock ring of this sector earns the sector's mark. */
    _settleTow(now) {
      const tow = this._tow;
      this._tow = null;
      if (!tow) return;
      const s = this.state;
      const sector = this._sector();
      const towed = s.entities && s.entities.get ? s.entities.get(tow.targetId) : null;
      const heldLong = now - tow.since >= PLATE_TUNING.holdS;
      const alive = towed && towed.alive !== false;
      if (!alive) {
        // A fake receipt: the towed hull died on the line — the sector's plates know.
        if (now >= (this._fraud.get(sector) || -Infinity)) {
          this._fraud.set(sector, now + PLATE_TUNING.greetCooldownS * 4);
          this.bus.emit(PLANTS_COUNTERFEIT_EVENT, { kind: 'fake_receipt', sector, until: this._fraud.get(sector), t: now });
        }
        return;
      }
      if (!heldLong) return;
      const idx = s.entityIndex;
      const list = (idx && Array.isArray(idx.stations)) ? idx.stations
        : (Array.isArray(s.entityList) ? s.entityList : []);
      const dockRadiusFallback = PLATE_TUNING.dockRadiusFallbackWu;
      for (const st of list) {
        if (!st || st.alive === false || st.type !== 'station' || !st.pos) continue;
        const d = st.data || {};
        if (d.isGate || d.isWormhole) continue;
        const r = Number.isFinite(d.dockRadius) && d.dockRadius > 0 ? d.dockRadius : dockRadiusFallback;
        const dd = Math.hypot(towed.pos.x - st.pos.x, towed.pos.z - st.pos.z);
        if (dd <= r) {
          this._marks.set(sector, now);
          while (this._marks.size >= PLATE_TUNING.memoryCap) this._marks.delete(this._marks.keys().next().value);
          this.bus.emit(PLANTS_PLATE_EVENT, { kind: 'mark_earned', sector, targetId: tow.targetId, t: now });
          return;
        }
      }
    },

    _onKilled(p) {
      // A towed hull dying on the line is the counterfeit carry.
      if (this._tow && p && p.id === this._tow.targetId) {
        this._settleTow(this._now());
      }
    },

    _onDockRange(p) {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      if (!p || p.shipId == null || p.shipId !== s.playerId || !p.inRange || !p.stationId) return;
      const sector = this._sector();
      const now = this._now();
      const day = Math.floor(now / PLATE_TUNING.greetCooldownS);
      const greetKey = `${p.stationId}:${day}`;
      if (this._greeted.get(greetKey)) return;
      const station = this._stationById(p.stationId);
      const fraudUntil = this._fraud.get(sector) || -Infinity;
      const markAt = this._marks.get(sector);

      if (Number.isFinite(markAt)) {
        // Wear what you earned: the plates greet your hull by name, out loud.
        this._greeted.set(greetKey, now);
        while (this._greeted.size >= PLATE_TUNING.memoryCap * 2) this._greeted.delete(this._greeted.keys().next().value);
        const callsign = this._callsign();
        const id = `plants:pl362:greet:${p.stationId}:${Math.round(now)}`;
        this.bus.emit('comms:popup', { id, sender: 'DOCK PLATES', category: 'traffic', text: `The plates read you home: ${callsign}.`, ttl: 7, persist: false });
        const voice = this.helpers && this.helpers.voice;
        const line = `${callsign}, the plates know you.`;
        if (voice && typeof voice.say === 'function') {
          voice.say({ channel: 'comms', id: 'plants:pl362:greet', text: line, ttl: 7 });
        } else {
          this.bus.emit('voice:say', { channel: 'comms', id: 'plants:pl362:greet', text: line, ttl: 7 });
        }
        if (station) {
          station.data = station.data || {};
          station.data.dockLampsFlashing = true;
          station.data.dockLampFlashUntil = now + 1.2;
        }
        this.bus.emit('audio:cue', { id: 'confirm', position: null, gain: 0.5, rate: 1.0 });
        this.bus.emit(PLANTS_PLATE_EVENT, { kind: 'greeted', sector, stationId: p.stationId, callsign, t: now });
        return;
      }

      if (now < fraudUntil) {
        // Counterfeit carry: the plates greet the real owner's name, loudly.
        this._greeted.set(greetKey, now);
        while (this._greeted.size >= PLATE_TUNING.memoryCap * 2) this._greeted.delete(this._greeted.keys().next().value);
        const owner = realOwnerName(sector);
        const id = `plants:pl362:counterfeit:${p.stationId}:${Math.round(now)}`;
        this.bus.emit('comms:popup', { id, sender: 'DOCK PLATES', category: 'traffic', text: `The plates read: ${owner}. Not you.`, ttl: 7, persist: false });
        const voice = this.helpers && this.helpers.voice;
        const line = `${owner}! The plates greet the real owner.`;
        if (voice && typeof voice.say === 'function') {
          voice.say({ channel: 'bark', id: 'plants:pl362:counterfeit', text: line, ttl: 7 });
        } else {
          this.bus.emit('voice:say', { channel: 'bark', id: 'plants:pl362:counterfeit', text: line, ttl: 7 });
        }
        if (station) {
          station.data = station.data || {};
          station.data.dockLampsFlashing = true;
          station.data.dockLampFlashUntil = now + 1.8;
        }
        this.bus.emit('audio:cue', { id: 'warning', position: null, gain: PLATE_TUNING.loudGain, rate: 0.9 });
        this.bus.emit(PLANTS_COUNTERFEIT_EVENT, { kind: 'greeted_owner', sector, stationId: p.stationId, owner, t: now });
      }
    },

    _stationById(stationId) {
      const s = this.state;
      const idx = s && s.entityIndex;
      const list = (idx && Array.isArray(idx.stations)) ? idx.stations
        : (s && Array.isArray(s.entityList) ? s.entityList : []);
      for (const st of list) {
        if (!st || st.alive === false || st.type !== 'station') continue;
        const sid = (st.data && st.data.stationId) || st.id;
        if (sid === stationId) return st;
      }
      return null;
    },
  };
}

export const pl362NameOnPlate = createPl362NameOnPlate();
