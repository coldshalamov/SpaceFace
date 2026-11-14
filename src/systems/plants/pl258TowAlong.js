// PL-258 The tow-along — "Limp home at dawn on one working thruster and an unmarked hauler
// falls in alongside without being asked, matches speed the whole way, and peels off at the
// berth lights."
// What the player can do: Say thanks once; or try to latch them — they are gone between one
// ping and the next.
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random/Date.now; no Three.js/DOM.
// - Standalone plant (the hauler is UNMARKED — no job, no callsign — so the module authors
//   it, darkStretch-style, through the standard spawn contract) and moves it ONLY via
//   requestTrafficReaction (ambient hull: the direct intent write stands).
// - "Limp home at dawn": the real dawn band, hull in the red, limping speed, a station
//   approach in reach. "Peels off at the berth lights": the player's real dock:range receipt.
// - Latch attempt: the shared towWatch view (tether:snapCatch {targetId}) — latching the
//   helper means it is gone between one ping and the next (despawn) and it never helps again
//   this session.
// - Bounded Maps with tuning.memoryCap; session state on `this`; RESET on sector:exit /
//   save:loaded / game:new / game:newGame — destroy() unsubscribes + despawns owned.
// - HONEST LIMIT: the game has no player comm/honk input, so "say thanks once" has no seam;
//   the escort runs whether you thank them or not. Documented, not faked.

import { makeShipEntitySpec } from '../ships.js';
import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';
import { attachTowWatch, towTargetIdOf } from './towWatch.js';

export const PLANTS_TOW_ALONG_EVENT = 'plants:pl258:escort';
export const PLANTS_TOW_ALONG_GONE_EVENT = 'plants:pl258:gone';

export const TOW_ALONG_TUNING = Object.freeze({
  plId: 'pl258',
  dayLengthS: 240,
  dawnFraction: 0.2,          // dawn: the first fifth of the day band
  limpHullFrac: 0.35,         // limping home: hull in the red
  limpSpeedWu: 22,            // on one working thruster
  approachRangeWu: 1100,      // a berth approach within reach
  escortOffsetWu: 34,         // falls in alongside
  escortRangeWu: 90,          // matches speed the whole way
  peelDelayS: 1.0,            // the berth lights: peel once you are in dock range
  goneTtlS: 20,               // the unmarked hauler leaves the lane after its escort
  latchGrudgeS: 1800,         // try to latch them: nobody falls in for a long while
  strangerHull: 'ship_mule',
  strangerRadius: 10,
  strangerMass: 60,
  memoryCap: 4,
});

function finite(v, f = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
}

/** Pure: is the player limping home at dawn (speed, hull, station approach)? */
export function isLimpingHome(state, player, stationDistWu, t = TOW_ALONG_TUNING) {
  if (!state || !player || !player.pos || !player.vel) return false;
  const now = finite(state.simTime, 0);
  const len = Math.max(1, t.dayLengthS);
  const phase = ((now % len) + len) % len;
  if (phase > len * t.dawnFraction) return false;
  const hullMax = finite(player.hullMax, 0);
  if (hullMax <= 0 || finite(player.hull, hullMax) > hullMax * t.limpHullFrac) return false;
  const speed = Math.hypot(finite(player.vel.x), finite(player.vel.z));
  if (speed > t.limpSpeedWu) return false;
  return stationDistWu <= t.approachRangeWu;
}

export function createPl258TowAlong() {
  return {
    name: 'plantsPl258',

    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._memory = new Map();     // tow-view latch + grudge rows, bounded
      this._haulerId = null;
      this._haulerSince = null;
      this._peelQueued = false;
      this._peelAt = null;
      this._departAt = null;
      this._accum = 0;
      const on = (event, fn) => {
        const off = this.bus && this.bus.on ? this.bus.on(event, fn) : null;
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('dock:range', (p = {}) => {
        // Only the player's own dock:range receipt counts (payloads without shipId are UI echoes).
        if (p && p.shipId != null && p.shipId !== this.state?.playerId) return;
        if (p && p.inRange) this._onBerthLights();
      });
      on('sector:exit', () => this._resetEscort());
      on('save:loaded', () => this._resetEscort());
      on('game:new', () => this._resetEscort());
      on('game:newGame', () => this._resetEscort());
      this._towAlongTowInstalled = false; // re-arm per init: the flag is host-lifetime, the bus is not
      attachTowWatch(this, 'towAlong', () => this._memory);
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._resetEscort(true);
    },

    _resetEscort(hard) {
      if (this._haulerId != null && this.helpers && typeof this.helpers.removeEntity === 'function') {
        this.helpers.removeEntity(this._haulerId);
      }
      this._haulerId = null;
      this._haulerSince = null;
      this._peelQueued = false;
      this._peelAt = null;
      this._departAt = null;
      this._accum = 0;
      if (hard && this._memory) this._memory.clear();
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s && s.simTime) ? s.simTime : (Number.isFinite(s && s.tick) ? s.tick / 60 : 0);
    },

    _player() {
      const s = this.state;
      return s && s.entities && typeof s.entities.get === 'function' ? s.entities.get(s.playerId) : null;
    },

    _nearestStationDist(player) {
      const s = this.state;
      if (!player || !player.pos) return Infinity;
      const idx = s && s.entityIndex;
      const list = (idx && Array.isArray(idx.stations)) ? idx.stations
        : (Array.isArray(s && s.entityList) ? s.entityList : []);
      let best = Infinity;
      for (const st of list) {
        if (!st || st.alive === false || st.type !== 'station' || !st.pos) continue;
        const d = st.data || {};
        if (d.isGate || d.isWormhole) continue;
        best = Math.min(best, Math.hypot(st.pos.x - player.pos.x, st.pos.z - player.pos.z));
      }
      return best;
    },

    _spawnHauler(player, now) {
      const spawnEntity = this.helpers && this.helpers.spawnEntity;
      if (typeof spawnEntity !== 'function') return null;
      const spec = makeShipEntitySpec(TOW_ALONG_TUNING.strangerHull, {
        team: 2, factionId: 'faction_free',
        pos: { x: player.pos.x + TOW_ALONG_TUNING.escortOffsetWu, z: player.pos.z - TOW_ALONG_TUNING.escortOffsetWu * 0.6 },
        ai: { archetype: 'hauler', passive: true },
      });
      const ent = spawnEntity(spec);
      if (!ent || ent.id == null) return null;
      ent.data = ent.data || {};
      // Unmarked: no callsign, no name, no job.
      ent.data.plantsPl258Hauler = true;
      ent.data.plants = { ...(ent.data.plants || {}), [TOW_ALONG_TUNING.plId]: { role: 'unmarked_hauler' } };
      this._haulerId = ent.id;
      this._haulerSince = now;
      this._departAt = now + TOW_ALONG_TUNING.goneTtlS * 6;
      this.bus.emit(PLANTS_TOW_ALONG_EVENT, { kind: 'fell_in', haulerId: ent.id, t: now });
      return ent;
    },

    _onBerthLights() {
      if (this._haulerId == null || this._peelQueued) return;
      this._peelQueued = true;
      this._peelAt = this._now() + TOW_ALONG_TUNING.peelDelayS;
    },

    _peelOff(now) {
      const hauler = this.state && this.state.entities && this.state.entities.get
        ? this.state.entities.get(this._haulerId) : null;
      if (hauler) {
        // Peels off at the berth lights: two farewell lamp beats, then gone.
        hauler.data = hauler.data || {};
        hauler.data.lampsFlashing = true;
        hauler.data.lampFlashUntil = now + 0.9;
        releaseTrafficReaction(this, hauler);
      }
      this.bus.emit(PLANTS_TOW_ALONG_EVENT, { kind: 'peeled_off', haulerId: this._haulerId, t: now });
      if (this.helpers && typeof this.helpers.removeEntity === 'function') {
        this.helpers.removeEntity(this._haulerId);
      }
      this._haulerId = null;
      this._peelQueued = false;
      this._peelAt = null;
    },

    update(dt) {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      this._accum += Math.max(0, finite(dt, 0));
      const now = this._now();
      const player = this._player();

      // Gone between one ping and the next: latching the helper ends it on the spot.
      if (this._haulerId != null) {
        const latched = towTargetIdOf(s, this._memory, now);
        if (latched != null && latched === this._haulerId) {
          this._latchBite(now);
          return;
        }
        if (this._peelQueued && now >= this._peelAt) {
          this._peelOff(now);
          return;
        }
        const hauler = s.entities && s.entities.get ? s.entities.get(this._haulerId) : null;
        if (!hauler || hauler.alive === false) { this._haulerId = null; return; }
        if (player && player.pos) {
          // Matches speed the whole way: hold the alongside offset on a leased intent.
          const tx = player.pos.x + TOW_ALONG_TUNING.escortOffsetWu;
          const tz = player.pos.z - TOW_ALONG_TUNING.escortOffsetWu * 0.6;
          const aim = Math.atan2(tz - finite(hauler.pos.z), tx - finite(hauler.pos.x));
          requestTrafficReaction(this, hauler, {
            moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: aim, brake: false,
          }, 2);
        }
        if (this._departAt != null && now >= this._departAt) {
          this.helpers.removeEntity(this._haulerId);
          this._haulerId = null;
        }
        return;
      }

      if (this._accum < 1) return;
      this._accum = 0;
      if (!player || player.alive === false) return;
      const grudge = this._memory.get('grudge');
      if (grudge && Number.isFinite(grudge.until) && now < grudge.until) return;
      if (!isLimpingHome(s, player, this._nearestStationDist(player))) return;
      this._spawnHauler(player, now);
    },

    /** They are gone between one ping and the next — and they remember. */
    _latchBite(now) {
      const haulerId = this._haulerId;
      const hauler = this.state.entities && this.state.entities.get
        ? this.state.entities.get(haulerId) : null;
      if (hauler) releaseTrafficReaction(this, hauler);
      if (this.helpers && typeof this.helpers.removeEntity === 'function') {
        this.helpers.removeEntity(haulerId);
      }
      this._haulerId = null;
      this._peelQueued = false;
      this._peelAt = null;
      this._memory.set('grudge', { until: now + TOW_ALONG_TUNING.latchGrudgeS });
      while (this._memory.size > TOW_ALONG_TUNING.memoryCap) this._memory.delete(this._memory.keys().next().value);
      this.bus.emit('audio:cue', { id: 'ui_deny', position: null, gain: 0.5, rate: 1.0 });
      this.bus.emit(PLANTS_TOW_ALONG_GONE_EVENT, { haulerId, until: now + TOW_ALONG_TUNING.latchGrudgeS, t: now });
    },
  };
}

export const pl258TowAlong = createPl258TowAlong();
