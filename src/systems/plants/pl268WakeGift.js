// PL-268 The wake gift — "Ride a superhauler's wake the whole way into a port and the
// helmsman flashes lamps twice in farewell at the gate."
// What the player can do: Ride it again the same day; or honk for more — you get the wash
// instead.
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random/Date.now; no Three.js/DOM.
// - Traffic ops mixin (hull-to-hull lane reaction): the superhauler is a REAL heavy civilian
//   hauler from the traffic dispatch; NPC movement ONLY via requestTrafficReaction. Returns
//   true only while the hauler flies its wash beat.
// - Riding = inside the wake cone (behind the hauler's heading) at ride speed while the
//   hauler runs its approach; the farewell flashes lamps twice at the gate (the hauler's real
//   lampsFlashing data).
// - HONEST LIMIT: the game has no player honk input; "honk for more" is its physical
//   substitute: boosting hard inside the wake after the farewell (the real ship:boostStart
//   receipt). Ride again the same day or honk for more and you get the wash instead: a
//   brake-burst beat that leaves you in the wash, lamps dark. Documented substitute.
// - Bounded Maps with tuning.memoryCap; per-hauler day memory; session state RESET on
//   sector:exit / save:loaded / game:new / game:newGame.

import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';

export const PLANTS_WAKE_EVENT = 'plants:pl268:wake';
export const PLANTS_WAKE_WASH_EVENT = 'plants:pl268:wash';

export const WAKE_TUNING = Object.freeze({
  plId: 'pl268',
  superMass: 300,            // a superhauler by mass
  wakeRangeWu: 140,          // the wake you can ride
  wakeAlignDot: 0.6,         // behind the heading
  rideSpeedWu: 30,
  rideHoldS: 10,             // the whole way in
  gateRangeMult: 1.6,        // "the gate": near the port's dock ring
  farewellS: 0.9,            // flashes lamps twice
  washBeatS: 3,              // the wash instead: a brake-burst beat
  dayLengthS: 240,
  memoryCap: 8,
});

export const WAKE_DAY_STAMP = 'plantsPl268LastRideDay';

function finite(v, f = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
}

function headingOf(e) {
  const r = Number(e.rot);
  return Number.isFinite(r) ? r : 0;
}

/** Pure: is the player riding this hull's wake (behind, close, at speed)? */
export function isRidingWake(e, player, t = WAKE_TUNING) {
  if (!e || !e.pos || !player || !player.pos || !player.vel) return false;
  const dx = finite(player.pos.x) - finite(e.pos.x);
  const dz = finite(player.pos.z) - finite(e.pos.z);
  const d = Math.hypot(dx, dz);
  if (d <= 1 || d > t.wakeRangeWu) return false;
  const h = headingOf(e);
  const hx = Math.cos(h);
  const hz = Math.sin(h);
  const dot = (dx * hx + dz * hz) / d;
  if (dot < t.wakeAlignDot) return false;
  const speed = Math.hypot(finite(player.vel.x), finite(player.vel.z));
  return speed >= t.rideSpeedWu;
}

export const wakeOps = {
  _initWake() {
    this._wakeMemory = new Map();    // haulerId -> { startedAt, held, lastAt, day }
    this._wakeDayDone = -1;
    this._wakeRun = null;            // { haulerId, until, lastAt }
    this._wakeBoostAt = -Infinity;
    const bus = this.bus;
    if (!bus || typeof bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = bus.on(event, fn);
      if (typeof off === 'function') this._wakeUnsubs.push(off);
    };
    this._wakeUnsubs = this._wakeUnsubs || [];
    on('ship:boostStart', (p = {}) => {
      const state = this.state;
      if (!state || (state.mode && state.mode !== 'flight')) return;
      if (p.shipId != null && p.shipId !== state.playerId) return;
      this._wakeBoostAt = finite(state.simTime, 0);
    });
    on('sector:exit', () => this._resetWake());
    on('save:loaded', () => this._resetWake());
    on('game:new', () => this._resetWake());
    on('game:newGame', () => this._resetWake());
  },

  _resetWake() {
    if (this._wakeRun && this.state) {
      const e = this.state.entities && this.state.entities.get
        ? this.state.entities.get(this._wakeRun.haulerId) : null;
      if (e) releaseTrafficReaction(this, e);
    }
    this._wakeRun = null;
    this._wakeBoostAt = -Infinity;
    this._wakeDayDone = -1;
    if (this._wakeMemory) this._wakeMemory.clear();
  },

  /**
   * Per-hull hook from the traffic dispatch: the wake you ride earns the farewell at the
   * gate — unless you ride it again the same day or honk for more. Returns true only while
   * this hauler flies its wash beat.
   */
  _reactWake(e, rec, stations, state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return false;
    if (!e || e.alive === false || e.type !== 'ship' || !e.pos) return false;
    if (!player || player.alive === false || !player.pos || !player.vel) return false;
    if (e.id === state.playerId) return false;
    const data = e.data || {};
    if (data.isGate || data.isWormhole || data.disabled || data.derelict) return false;
    const role = String(
      (rec && rec.role) || data.trafficRole || data.role || (data.ai && (data.ai.role || data.ai.archetype)) || '',
    ).toLowerCase();
    if (!role.includes('hauler') && !role.includes('freighter') && !role.includes('tanker')) return false;
    const mass = finite(e.mass, 0) || finite(data.physicsBody && data.physicsBody.mass, 0);
    if (mass < WAKE_TUNING.superMass) return false;
    const now = finite(state.simTime, 0);
    const day = Math.floor(now / WAKE_TUNING.dayLengthS);

    // The wash beat: brake-burst that leaves you in the wash.
    const run = this._wakeRun;
    if (run && run.haulerId === e.id) {
      requestTrafficReaction(this, e, {
        moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: headingOf(e), brake: true,
      }, 2);
      run.lastAt = now;
      if (now >= run.until) {
        releaseTrafficReaction(this, e);
        this._wakeRun = null;
        return false;
      }
      return true;
    }
    if (run) return false;

    const memory = this._wakeMemory instanceof Map ? this._wakeMemory : (this._wakeMemory = new Map());
    let row = memory.get(e.id);
    if (row && row.day !== day) { memory.delete(e.id); row = null; }
    if (!row) {
      while (memory.size >= WAKE_TUNING.memoryCap) memory.delete(memory.keys().next().value);
      row = { startedAt: now, held: 0, day, lastAt: now };
      memory.set(e.id, row);
    }
    row.lastAt = now;

    if (!isRidingWake(e, player)) { row.held = Math.max(0, row.held - 0.5); return false; }

    // Honk for more: boosting hard inside the wake after the farewell earns the wash.
    const boosted = now - this._wakeBoostAt <= 4;
    if (row.done && boosted) return this._startWash(e, player, now, 'honked');

    row.held += 1 / 60;
    if (row.held < WAKE_TUNING.rideHoldS) return false;

    // The gate: a real station within reach of the hauler.
    let gate = null;
    for (const st of stations || []) {
      if (!st || st.alive === false || !st.pos) continue;
      const sd = st.data || {};
      if (sd.isGate === true || sd.isWormhole === true) continue;
      const d = Math.hypot(st.pos.x - e.pos.x, st.pos.z - e.pos.z);
      const r = Number.isFinite(sd.dockRadius) && sd.dockRadius > 0 ? sd.dockRadius : 90;
      if (d <= r * WAKE_TUNING.gateRangeMult) { gate = st; break; }
    }
    if (!gate) return false;

    if (row.done) {
      if (this._wakeDayDone === day) {
        // Ride it again the same day: you get the wash instead.
        return this._startWash(e, player, now, 'same_day');
      }
      row.done = false; // a new day: the farewell can be earned again
    }
    row.done = true;
    this._wakeDayDone = day;
    // The helmsman flashes lamps twice in farewell at the gate.
    const ed = e.data || (e.data = {});
    ed.lampsFlashing = true;
    ed.lampFlashUntil = now + WAKE_TUNING.farewellS;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_WAKE_EVENT, { haulerId: e.id, flashes: 2, gateId: (gate.data && gate.data.stationId) || gate.id, t: now });
    }
    return false;
  },

  _startWash(e, player, now, why) {
    this._wakeRun = { haulerId: e.id, until: now + WAKE_TUNING.washBeatS, lastAt: now };
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('audio:cue', { id: 'warning', position: null, gain: 0.45, rate: 0.8 });
      this.bus.emit(PLANTS_WAKE_WASH_EVENT, { haulerId: e.id, why, t: now });
    }
    return true;
  },
};
