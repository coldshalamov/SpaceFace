// PL-156 The ticking crate — "A hauler's hail: one crate, the last stretch, ticking gently.
// *'It ticks. That's the clock.'* Carry it smooth and the town clock keeps true time; or
// shake it open, and the town runs wrong for a week"
//
// A seeded chance meeting: a hauler stranger floats beside one ticking crate (a real cargo
// pod stamped plants.pl156.ticking). Approaching the hauler triggers the hail with the
// authored line. Catching the crate (a massline snap-catch onto it) starts the carry: any
// real physics:impact on the crate with impulse over shakeImpulseMin counts as a shake.
// Delivering = carrying it near a station (dock:range or station proximity): zero shakes ->
// the town clock keeps true time; any shakes -> the town runs wrong for a week (the station
// carries data.clockWrongUntil, and dock approaches there hear one line while it lasts).
//
// Invariants:
// - Deterministic: state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports. No hull movement at all — the crate is carried by the massline.
// - Physical: the crate is a real jettisoned cargo pod (persistent, physicsBody mass,
//   masslineTetherable); shakes are real impulse receipts.
// - Bounded Maps capped by tuning.memoryCap; cooldowns on the week lines per station.
// - Nothing runs while docked (dock:range is the delivery seam); gates/wormholes excluded;
//   the player is never the NPC.

import { makeShipEntitySpec } from '../ships.js';
import { spawnJettisonedCargoPod } from '../lootShards.js';
import { hash32 } from '../../core/rng.js';

export const TICKING_CRATE_EVENT = 'plants:tickingCrate';
export const TICKING_CRATE_TOWN_EVENT = 'plants:tickingCrateTown';

export const TICKING_CRATE_TUNING = Object.freeze({
  plId: 'pl156',
  spawnChancePct: 50,
  hailRangeWu: 180,
  shakeImpulseMin: 40,         // a real jolt, not a bump
  deliverRangeWu: 400,         // carrying it near the town (station) delivers
  wrongWeekS: 600,             // the town runs wrong for a week (sector-day contract)
  trueTimeLineCooldownS: 90,
  podCommodityId: 'cmdty_crystal_silica',
  podAmount: 1,
  podRadius: 5,
  strangerTtlS: 900,
  memoryCap: 16,
});

export const TICKING_CRATE_HAIL = "It ticks. That's the clock.";
export const TICKING_CRATE_TRUE_LINE = 'The town clock keeps true time.';
export const TICKING_CRATE_WRONG_LINE = 'The town clock runs wrong.';
export const TICKING_CRATE_CALLSIGN = 'CLOCK HAULER';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure delivery verdict: smooth or shook open. */
export function tickingCrateVerdict(shakes, tuning = TICKING_CRATE_TUNING) {
  return Number(shakes) > 0 ? 'shook_open' : 'smooth';
}

export const tickingCratePlant = {
  name: 'plants156',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._owned = new Map();
    this._memory = new Map();
    this._accum = 0;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:enter', (p) => this._onSectorEnter(p));
    on('sector:exit', () => this._reset('sector_exit'));
    on('save:loaded', () => this._reset('save_loaded'));
    on('game:new', () => this._reset('game_new'));
    on('game:newGame', () => this._reset('game_new_game'));
    on('physics:impact', (p) => this._onImpact(p));
    on('tether:snapCatch', (p) => this._onSnapCatch(p));
    on('dock:range', (p) => this._onDockRange(p));
    on('entity:killed', (p) => this._onKilled(p));
  },

  update(dt) {
    const s = this.state;
    if (!s || !this.bus) return;
    this._accum += finite(dt, 0);
    if (this._accum < 1) return;
    this._accum = 0;
    const now = finite(s.simTime, 0);
    this._sweepExpired(now);
    if (!this._flight()) return;
    const enc = this._memory.get('enc');
    // A crate shaken open to destruction still owes the town its outcome: apply the fate
    // the next time the player is near a station. Consumed before the encounter guard —
    // the encounter dies with the crate, the debt does not.
    const fate = this._memory.get('fate');
    if (fate) {
      if (now >= fate.until) { this._memory.delete('fate'); }
      else {
        const near = this._nearestStation(this._player()?.pos);
        if (near && near.dist <= TICKING_CRATE_TUNING.deliverRangeWu) {
          this._applyOutcome(fate.shakes, near.station, now);
          this._memory.delete('fate');
        }
      }
    }
    if (!enc) return;

    // The hauler's hail once the player is near, before the carry starts.
    const hauler = this._entity(enc.haulerId);
    const player = this._player();
    if (!enc.carried && hauler && player && this._dist(hauler.pos, player.pos) <= TICKING_CRATE_TUNING.hailRangeWu) {
      if (enc.lastHailAt == null) {
        enc.lastHailAt = now;
        this._comms(`plants:${TICKING_CRATE_TUNING.plId}:hail:${now}`, TICKING_CRATE_CALLSIGN, TICKING_CRATE_HAIL, 6);
        this.bus.emit(TICKING_CRATE_EVENT, { kind: 'hailed', haulerId: enc.haulerId, crateId: enc.crateId, t: now });
      }
    }

    // Delivery: carrying the crate near any station delivers it.
    if (enc.carried) this._stepDelivery(enc, now);
  },

  destroy() {
    for (const off of this._unsubs || []) off();
    this._unsubs = [];
    this._despawnOwned();
    if (this._memory) this._memory.clear();
  },

  // ---- internals ----

  _flight() {
    return !!this.state && (this.state.mode == null || this.state.mode === 'flight');
  },

  _now() {
    return finite(this.state && this.state.simTime, 0);
  },

  _dist(a, b) {
    if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.z) || !Number.isFinite(b.x) || !Number.isFinite(b.z)) return Infinity;
    return Math.hypot(a.x - b.x, a.z - b.z);
  },

  _player() {
    const s = this.state;
    return s && s.entities && typeof s.entities.get === 'function' ? s.entities.get(s.playerId) : null;
  },

  _entity(id) {
    const s = this.state;
    if (id == null || !s) return null;
    if (s.entities && typeof s.entities.get === 'function') return s.entities.get(id) || null;
    if (Array.isArray(s.entityList)) return s.entityList.find((e) => e && e.id === id) || null;
    return null;
  },

  _nearestStation(pos) {
    const s = this.state;
    const list = (s.entityIndex && Array.isArray(s.entityIndex.stations)) ? s.entityIndex.stations : [];
    let best = null;
    let bestD = Infinity;
    for (const st of list) {
      const d = st && st.data;
      if (!st || st.alive === false || st.type !== 'station' || !d || d.isGate === true || d.isWormhole === true) continue;
      const dist = this._dist(st.pos, pos);
      if (dist < bestD) { bestD = dist; best = st; }
    }
    return best ? { station: best, dist: bestD } : null;
  },

  _capMemory() {
    while (this._memory.size >= TICKING_CRATE_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _spawnHauler(pos) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const spec = makeShipEntitySpec('ship_mule', {
      team: 2, factionId: 'faction_free', pos: { x: pos.x, z: pos.z },
      ai: { archetype: 'hauler', passive: true },
    });
    const ent = spawnEntity(spec);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [TICKING_CRATE_TUNING.plId]: { role: 'clock_hauler' } };
    ent.data.callsign = TICKING_CRATE_CALLSIGN;
    this._owned.set(ent.id, { kind: 'hauler', expiresAt: this._now() + TICKING_CRATE_TUNING.strangerTtlS });
    return ent;
  },

  _spawnCrate(pos, ownerId) {
    if (typeof spawnJettisonedCargoPod !== 'function') return null;
    const ent = spawnJettisonedCargoPod(this.state, {
      commodityId: TICKING_CRATE_TUNING.podCommodityId,
      amount: TICKING_CRATE_TUNING.podAmount,
      radius: TICKING_CRATE_TUNING.podRadius,
      pos: { x: pos.x, z: pos.z },
      vel: { x: 0, z: 0 },
      ownerId,
      ownerName: TICKING_CRATE_CALLSIGN,
    }, this.helpers);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [TICKING_CRATE_TUNING.plId]: { role: 'ticking_crate', ticking: true } };
    ent.data.masslineTetherable = true;
    this._owned.set(ent.id, { kind: 'crate', expiresAt: this._now() + TICKING_CRATE_TUNING.strangerTtlS });
    return ent;
  },

  _onSectorEnter(p) {
    this._reset('sector_enter');
    if (!this._flight()) return;
    const s = this.state;
    const sectorId = (p && p.sectorId) || (s.world && s.world.currentSectorId) || 's1';
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    if (hash32(seed, sectorId, 'pl156', 'spawn') % 100 >= TICKING_CRATE_TUNING.spawnChancePct) return;
    const player = this._player();
    const base = player && player.pos ? player.pos : { x: 0, z: 0 };
    const hauler = this._spawnHauler({ x: base.x + 340, z: base.z - 80 });
    if (!hauler) return;
    const crate = this._spawnCrate({ x: base.x + 312, z: base.z - 56 }, hauler.id);
    if (!crate) { this._remove(hauler.id); return; }
    this._capMemory();
    this._memory.set('enc', {
      haulerId: hauler.id,
      crateId: crate.id,
      lastHailAt: null,
      carried: false,
      shakes: 0,
      delivered: false,
    });
  },

  _onSnapCatch(p) {
    if (!this._flight() || !p) return;
    const enc = this._memory.get('enc');
    if (!enc || enc.carried) return;
    if (p.targetId !== enc.crateId) return;
    enc.carried = true;
    enc.carriedAt = this._now();
    this.bus.emit(TICKING_CRATE_EVENT, { kind: 'carry_started', crateId: enc.crateId, t: this._now() });
  },

  _onImpact(p) {
    if (!this._flight() || !p) return;
    const enc = this._memory.get('enc');
    if (!enc || !enc.carried || enc.delivered) return;
    if (p.aId !== enc.crateId && p.bId !== enc.crateId) return;
    if (finite(p.impulse, 0) < TICKING_CRATE_TUNING.shakeImpulseMin) return;
    enc.shakes += 1;
    this._cue('warning', this._entity(enc.crateId)?.pos, 0.7, 1);
    this.bus.emit(TICKING_CRATE_EVENT, { kind: 'shaken', crateId: enc.crateId, shakes: enc.shakes, t: this._now() });
  },

  // The single town outcome writer: smooth keeps true time; any shake runs it wrong.
  _applyOutcome(shakes, station, now, crateId = null) {
    const verdict = tickingCrateVerdict(shakes);
    station.data = station.data || {};
    if (verdict === 'smooth') {
      station.data.clockKeptUntil = now + TICKING_CRATE_TUNING.wrongWeekS;
      this._cue('confirm', station.pos, 0.8, 1);
      this._comms(`plants:${TICKING_CRATE_TUNING.plId}:true:${now}`, 'TOWN', TICKING_CRATE_TRUE_LINE, 6);
      this.bus.emit(TICKING_CRATE_TOWN_EVENT, { verdict, stationId: station.id, crateId, shakes, t: now });
      return verdict;
    }
    station.data.clockWrongUntil = now + TICKING_CRATE_TUNING.wrongWeekS;
    this._cue('warning', station.pos, 0.9, 1);
    this._comms(`plants:${TICKING_CRATE_TUNING.plId}:wrong:${now}`, 'TOWN', TICKING_CRATE_WRONG_LINE, 6);
    this.bus.emit(TICKING_CRATE_TOWN_EVENT, { verdict, stationId: station.id, crateId, shakes, t: now });
    return verdict;
  },

  _stepDelivery(enc, now) {
    const crate = this._entity(enc.crateId);
    const player = this._player();
    if (!crate || crate.alive === false || !player || !player.pos) return;
    const near = this._nearestStation(player.pos);
    if (!near || near.dist > TICKING_CRATE_TUNING.deliverRangeWu) return;
    enc.delivered = true;
    this._applyOutcome(enc.shakes, near.station, now, enc.crateId);
    this._remove(enc.crateId);
    this._memory.delete('enc');
  },

  // The module consumes its own stamp: while a station's clockWrongUntil holds, its dock
  // arrivals hear the misannouncement — one line per cooldown, never past the window.
  _onDockRange(p) {
    if (!this._flight() || !p || p.inRange !== true) return;
    const now = this._now();
    const station = this._entity(p.stationId);
    const wrongUntil = finite(station?.data?.clockWrongUntil, 0);
    if (!(now < wrongUntil)) return;
    const key = `wrongLine:${p.stationId}`;
    const lastAt = this._memory.get(key);
    if (lastAt != null && now - lastAt < TICKING_CRATE_TUNING.trueTimeLineCooldownS) return;
    this._capMemory();
    this._memory.set(key, now);
    this._comms(`plants:${TICKING_CRATE_TUNING.plId}:wrongdock:${now}`, 'TOWN', TICKING_CRATE_WRONG_LINE, 6);
    this.bus.emit(TICKING_CRATE_TOWN_EVENT, { verdict: 'week_wrong', stationId: p.stationId, t: now });
  },

  _onKilled(p) {
    const enc = this._memory.get('enc');
    if (!enc || !p) return;
    if (p.id === enc.crateId) {
      // Shaken open hard enough to destroy is the worst shake — and it persists: the fate
      // row carries the count to the next station proximity (or applies it right away).
      const shakes = enc.shakes + 1;
      const player = this._player();
      const near = this._nearestStation(player?.pos);
      if (near && near.dist <= TICKING_CRATE_TUNING.deliverRangeWu) {
        this._applyOutcome(shakes, near.station, this._now(), enc.crateId);
      } else {
        this._capMemory();
        this._memory.set('fate', { shakes, until: this._now() + TICKING_CRATE_TUNING.wrongWeekS });
      }
      this._memory.delete('enc');
      this.bus.emit(TICKING_CRATE_EVENT, { kind: 'crate_destroyed', crateId: p.id, t: this._now() });
    } else if (p.id === enc.haulerId) {
      this._memory.delete('enc');
      this.bus.emit(TICKING_CRATE_EVENT, { kind: 'hauler_dead', haulerId: p.id, t: this._now() });
    }
  },

  _remove(id) {
    if (id == null) return;
    this._owned.delete(id);
    if (this.helpers && typeof this.helpers.removeEntity === 'function') this.helpers.removeEntity(id);
  },

  _sweepExpired(now) {
    for (const [id, row] of this._owned) {
      if (Number.isFinite(row.expiresAt) && now >= row.expiresAt) this._remove(id);
    }
  },

  _despawnOwned() {
    if (this.helpers && typeof this.helpers.removeEntity === 'function') {
      for (const id of [...(this._owned ? this._owned.keys() : [])]) this.helpers.removeEntity(id);
    }
    if (this._owned) this._owned.clear();
  },

  _reset(reason) {
    this._despawnOwned();
    if (this._memory) this._memory.clear();
    if (this.bus && reason === 'sector_exit') {
      this.bus.emit(TICKING_CRATE_EVENT, { kind: 'reset', reason, t: this._now() });
    }
  },

  _comms(id, sender, text, ttl) {
    this.bus.emit('comms:popup', { id, sender, category: 'traffic', text, ttl });
  },

  _cue(id, pos, gain = 0.8, rate = 1) {
    this.bus.emit('audio:cue', { id, position: pos ? { x: pos.x, z: pos.z } : null, gain, rate });
  },
};
