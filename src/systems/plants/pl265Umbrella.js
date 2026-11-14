// PL-265 The umbrella — "Boost through a station's wash while a tender is working and the
// tender swings its body wide to shield your line the whole way past."
// What the player can do: Cut through the work zone anyway — the umbrella comes down on your
// next pass.
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random/Date.now; no Three.js/DOM.
// - Traffic ops mixin (hull-to-hull lane reaction): the tender is a REAL civilian tug from
//   the traffic dispatch; NPC movement ONLY via requestTrafficReaction. Returns true only
//   while the tender is holding the umbrella line.
// - "Working" = a tug inside the station's work zone (near a station passed by the dispatch);
//   "boost through the wash" = the player's real ship:boostStart receipt inside the zone.
// - The umbrella: the tug swings its body wide between your line and the station core and
//   holds it the whole way past, courtesy lamp lit. Cut through anyway — a second boost pass
//   inside the repeat window — and the umbrella comes down on your next pass: the tug refuses
//   (swings wide away from your line, lamps dark).
// - Bounded Maps with tuning.memoryCap; per-station pass memory; session state RESET on
//   sector:exit / save:loaded / game:new / game:newGame.

import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';

export const PLANTS_UMBRELLA_EVENT = 'plants:pl265:umbrella';
export const PLANTS_UMBRELLA_DOWN_EVENT = 'plants:pl265:down';

export const UMBRELLA_TUNING = Object.freeze({
  plId: 'pl265',
  workZoneWu: 320,          // the tender is working this close to its station
  washZoneWu: 200,          // the pass the umbrella covers
  washSpeedWu: 90,          // "boost through the wash"
  passCooldownS: 10,        // one pass counts once
  repeatWindowS: 90,        // cut through again inside this and the umbrella comes down
  denyS: 240,               // the umbrella stays down this long
  shieldHoldS: 6,           // the whole way past
  memoryCap: 12,
});

function finite(v, f = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
}

/** Pure: a civilian tender at work (tug-class hull, near a station). */
export function isWorkingTender(e, rec = null, state = null, stations = []) {
  if (!e || e.alive === false || e.type !== 'ship' || !e.pos) return null;
  if (state && e.id === state.playerId) return false;
  const data = e.data || {};
  if (data.isGate || data.isWormhole || data.disabled || data.derelict) return false;
  const role = String(
    (rec && rec.role) || data.trafficRole || data.role || (data.ai && (data.ai.role || data.ai.archetype)) || '',
  ).toLowerCase();
  if (!role.includes('tug')) return false;
  for (const st of stations) {
    if (!st || !st.pos || (st.data && (st.data.isGate || st.data.isWormhole))) continue;
    const d = Math.hypot(st.pos.x - e.pos.x, st.pos.z - e.pos.z);
    if (d <= UMBRELLA_TUNING.workZoneWu) return st;
  }
  return false;
}

export const umbrellaOps = {
  _initUmbrella() {
    this._umbrellaPasses = new Map();   // stationId -> [passAt,...] bounded ring
    this._umbrellaRun = null;           // { tenderId, stationId, since, kind }
    this._umbrellaDeny = new Map();     // stationId -> denyUntil
    this._umbrellaBoostAt = -Infinity;
    const bus = this.bus;
    if (!bus || typeof bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = bus.on(event, fn);
      if (typeof off === 'function') this._umbrellaUnsubs.push(off);
    };
    this._umbrellaUnsubs = this._umbrellaUnsubs || [];
    on('ship:boostStart', (p = {}) => {
      const state = this.state;
      if (!state || (state.mode && state.mode !== 'flight')) return;
      if (p.shipId != null && p.shipId !== state.playerId) return;
      this._umbrellaBoostAt = finite(state.simTime, 0);
    });
    on('sector:exit', () => this._resetUmbrella());
    on('save:loaded', () => this._resetUmbrella());
    on('game:new', () => this._resetUmbrella());
    on('game:newGame', () => this._resetUmbrella());
  },

  _resetUmbrella() {
    if (this._umbrellaRun && this.state) {
      const e = this.state.entities && this.state.entities.get
        ? this.state.entities.get(this._umbrellaRun.tenderId) : null;
      if (e) releaseTrafficReaction(this, e);
    }
    this._umbrellaRun = null;
    if (this._umbrellaPasses) this._umbrellaPasses.clear();
    if (this._umbrellaDeny) this._umbrellaDeny.clear();
    this._umbrellaBoostAt = -Infinity;
  },

  _countPass(stationId, now) {
    const passes = this._umbrellaPasses instanceof Map ? this._umbrellaPasses : (this._umbrellaPasses = new Map());
    let ring = passes.get(stationId);
    if (!ring) { while (passes.size >= UMBRELLA_TUNING.memoryCap) passes.delete(passes.keys().next().value); ring = []; passes.set(stationId, ring); }
    while (ring.length && now - ring[0] > UMBRELLA_TUNING.repeatWindowS * 4) ring.shift();
    if (ring.length && now - ring[ring.length - 1] < UMBRELLA_TUNING.passCooldownS) return null;
    ring.push(now);
    while (ring.length > 4) ring.shift();
    return ring.length;
  },

  /**
   * Per-hull hook from the traffic dispatch: a working tender shields a boosted pass — until
   * you cut through the work zone anyway. Returns true only while this tender holds the line.
   */
  _reactUmbrella(e, rec, stations, state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return false;
    if (!player || player.alive === false || !player.pos || !player.vel) return false;
    const now = finite(state.simTime, 0);

    const run = this._umbrellaRun;
    if (run && run.tenderId === e.id) {
      const station = (stations || []).find((st) => st && st.pos
        && (((st.data && st.data.stationId) || st.id) === run.stationId));
      if (!station) {
        releaseTrafficReaction(this, e);
        this._umbrellaRun = null;
        return false;
      }
      const hold = Math.atan2(finite(player.pos.z) - finite(e.pos.z), finite(player.pos.x) - finite(e.pos.x));
      requestTrafficReaction(this, e, {
        moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: hold, brake: true,
      }, 2);
      run.lastAt = now;
      const playerPast = Math.hypot(player.pos.x - station.pos.x, player.pos.z - station.pos.z) > UMBRELLA_TUNING.washZoneWu;
      if (now - run.since >= UMBRELLA_TUNING.shieldHoldS || (playerPast && run.kind === 'shield')) {
        releaseTrafficReaction(this, e);
        this._umbrellaRun = null;
        return false;
      }
      return true;
    }
    if (run) return false;

    const station = isWorkingTender(e, rec, state, stations || []);
    if (!station) return false;
    const stationId = (station.data && station.data.stationId) || station.id;

    // The player's boosted pass through the wash.
    const dPlayer = Math.hypot(player.pos.x - station.pos.x, player.pos.z - station.pos.z);
    if (dPlayer > UMBRELLA_TUNING.washZoneWu) return false;
    const speed = Math.hypot(finite(player.vel.x), finite(player.vel.z));
    const boosted = now - this._umbrellaBoostAt <= UMBRELLA_TUNING.passCooldownS;
    if (speed < UMBRELLA_TUNING.washSpeedWu && !boosted) return false;

    const passNo = this._countPass(stationId, now);
    if (passNo == null) return false;

    const denyUntil = (this._umbrellaDeny instanceof Map ? this._umbrellaDeny : (this._umbrellaDeny = new Map())).get(stationId);
    if (Number.isFinite(denyUntil) && now < denyUntil) {
      // The umbrella is down: the tender swings wide away from your line, lamps dark.
      const away = Math.atan2(finite(station.pos.z) - finite(e.pos.z), finite(station.pos.x) - finite(e.pos.x));
      requestTrafficReaction(this, e, {
        moveX: 0, moveZ: 1, boost: true, fire: false, fireGroup: null, aimAngle: away, brake: false,
      }, 2);
      this._umbrellaRun = { tenderId: e.id, stationId, since: now, kind: 'refuse', lastAt: now };
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PLANTS_UMBRELLA_DOWN_EVENT, { stationId, tenderId: e.id, t: now });
      }
      return true;
    }

    if (passNo >= 2 && now - this._umbrellaBoostAt <= UMBRELLA_TUNING.repeatWindowS) {
      // Cut through the work zone anyway — the umbrella comes down on your next pass.
      this._umbrellaDeny.set(stationId, now + UMBRELLA_TUNING.denyS);
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PLANTS_UMBRELLA_DOWN_EVENT, { stationId, tenderId: e.id, deniedFrom: now + UMBRELLA_TUNING.denyS, t: now });
      }
      return false;
    }

    // The umbrella goes up: swing wide between your line and the station core.
    const toPlayer = Math.atan2(finite(player.pos.z) - finite(e.pos.z), finite(player.pos.x) - finite(e.pos.x));
    requestTrafficReaction(this, e, {
      moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: toPlayer, brake: true,
    }, 2);
    const data = e.data || (e.data = {});
    data.lampsFlashing = true;
    data.lampFlashUntil = now + UMBRELLA_TUNING.shieldHoldS;
    this._umbrellaRun = { tenderId: e.id, stationId, since: now, kind: 'shield', lastAt: now };
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_UMBRELLA_EVENT, { stationId, tenderId: e.id, kind: 'up', t: now });
    }
    return true;
  },
};
