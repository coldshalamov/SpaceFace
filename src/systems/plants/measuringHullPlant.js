// PL-206 The measuring hull — "A ship with no markings matches your course for a full sector,
// never closing, never falling behind. Break off and lose them; turn and confront — they
// bolt; or let them follow, and wonder what they were measuring"
//
// A seeded chance meeting: an unmarked stranger paces the player (holds a fixed wake offset,
// never closing, never falling behind — leased intents each sweep) until sector exit.
// Three outcomes:
// - Break off: sustain player speed above pace speed + breakSpeedMargin for breakHoldS —
//   the hull falls behind and despawns ("lose them").
// - Confront: turn toward the hull and close inside confrontRangeWu — they bolt (boosted
//   leased intent away, then polite despawn).
// - Let them follow: nothing happens; at sector exit the meeting ends with a "measured"
//   receipt and one wondering comms line.
//
// Invariants:
// - Deterministic: state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports. Pacing and bolting fly through the traffic reaction lease.
// - Bounded Maps capped by tuning.memoryCap; the pacer never closes inside paceOffsetWu/2.
// - Nothing runs while docked; gates/wormholes excluded; the player is never the NPC.

import { makeShipEntitySpec } from '../ships.js';
import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';
import { hash32 } from '../../core/rng.js';

export const MEASURING_HULL_EVENT = 'plants:measuringHull';

export const MEASURING_HULL_TUNING = Object.freeze({
  plId: 'pl206',
  spawnChancePct: 45,
  paceOffsetWu: 180,           // held behind the player's wake
  paceMaxRangeWu: 520,         // beyond this the pace has lapsed
  breakSpeedMarginWu: 60,      // sustain this much excess speed to lose them
  breakHoldS: 6,
  confrontRangeWu: 90,
  boltIntentS: 8,
  strangerTtlS: 1200,          // a full sector
  memoryCap: 16,
});

export const MEASURING_HULL_SCAN_LABEL = 'UNMARKED HULL';
export const MEASURING_HULL_WONDER_LINE = 'What were they measuring?';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure pace-point geometry: the fixed wake offset behind the player's heading. */
export function pacePoint(playerPos, playerVel, offsetWu) {
  if (!playerPos) return null;
  const vx = finite(playerVel && playerVel.x);
  const vz = finite(playerVel && playerVel.z);
  const speed = Math.hypot(vx, vz);
  const bx = speed > 1 ? -(vx / speed) * finite(offsetWu) : -finite(offsetWu);
  const bz = speed > 1 ? -(vz / speed) * finite(offsetWu) : 0;
  return { x: finite(playerPos.x) + bx, z: finite(playerPos.z) + bz };
}

/** Pure confront predicate: player inside range and heading toward the hull. */
export function isConfronting(player, hull, rangeWu) {
  if (!player || !hull || !player.pos || !hull.pos || !player.vel) return false;
  const dx = finite(hull.pos.x) - finite(player.pos.x);
  const dz = finite(hull.pos.z) - finite(player.pos.z);
  const dist = Math.hypot(dx, dz);
  if (!(dist <= finite(rangeWu))) return false;
  const speed = Math.hypot(finite(player.vel.x), finite(player.vel.z));
  if (speed < 1) return false;
  const headingX = finite(player.vel.x) / speed;
  const headingZ = finite(player.vel.z) / speed;
  const dot = (dx / (dist || 1)) * headingX + (dz / (dist || 1)) * headingZ;
  return dot >= 0.5; // within ~60 degrees of the hull bearing
}

export const measuringHullPlant = {
  modes: ['flight'],
  name: 'plants206',

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
    on('sector:exit', () => this._onSectorExit());
    on('save:loaded', () => this._resetAll('save_loaded'));
    on('game:new', () => this._resetAll('game_new'));
    on('game:newGame', () => this._resetAll('game_new_game'));
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
    if (!enc) return;
    const hull = this._entity(enc.hullId);
    const player = this._player();
    if (!hull || hull.alive === false || !player || !player.pos) {
      this._loseThem(enc, now, 'hull_gone');
      return;
    }

    const dist = this._dist(hull.pos, player.pos);
    if (dist > MEASURING_HULL_TUNING.paceMaxRangeWu) {
      this._loseThem(enc, now, 'lapsed');
      return;
    }

    // Confront: turn and close inside confront range -> they bolt.
    if (isConfronting(player, hull, MEASURING_HULL_TUNING.confrontRangeWu)) {
      this._bolt(enc, hull, now);
      return;
    }

    // Break off: sustained excess speed over the pacer -> the hull falls behind and is lost.
    const speed = Math.hypot(finite(player.vel && player.vel.x), finite(player.vel && player.vel.z));
    if (speed >= this._paceSpeed(hull) + MEASURING_HULL_TUNING.breakSpeedMarginWu) {
      enc.breakAt = enc.breakAt == null ? now : enc.breakAt;
      if (now - enc.breakAt >= MEASURING_HULL_TUNING.breakHoldS) {
        this._loseThem(enc, now, 'broke_off');
        return;
      }
    } else {
      enc.breakAt = null;
    }

    // Pace: hold the wake offset, never closing, never falling behind.
    const target = pacePoint(player.pos, player.vel, MEASURING_HULL_TUNING.paceOffsetWu);
    const aim = Math.atan2(
      finite(target.z) - finite(hull.pos.z),
      finite(target.x) - finite(hull.pos.x),
    );
    requestTrafficReaction(this, hull, {
      moveX: 0, moveZ: 1, boost: speed > 120, fire: false, fireGroup: null, aimAngle: aim, brake: false,
    }, 2);
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

  _paceSpeed(player) {
    return Math.hypot(finite(player.vel && player.vel.x), finite(player.vel && player.vel.z));
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

  _capMemory() {
    while (this._memory.size >= MEASURING_HULL_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _spawnHull(pos) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const spec = makeShipEntitySpec('ship_drifter', {
      team: 2, factionId: 'faction_free', pos: { x: pos.x, z: pos.z },
      ai: { archetype: 'surveyor', passive: true },
    });
    const ent = spawnEntity(spec);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [MEASURING_HULL_TUNING.plId]: { role: 'unmarked' } };
    ent.data.scanLabel = MEASURING_HULL_SCAN_LABEL;
    delete ent.data.callsign; // no markings
    this._owned.set(ent.id, { kind: 'pacer', expiresAt: this._now() + MEASURING_HULL_TUNING.strangerTtlS });
    return ent;
  },

  _onSectorEnter(p) {
    this._resetSector();
    if (!this._flight()) return;
    const s = this.state;
    const sectorId = (p && p.sectorId) || (s.world && s.world.currentSectorId) || 's1';
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    if (hash32(seed, sectorId, 'pl206', 'spawn') % 100 >= MEASURING_HULL_TUNING.spawnChancePct) return;
    const player = this._player();
    const base = player && player.pos ? player.pos : { x: 0, z: 0 };
    const hull = this._spawnHull({ x: base.x - MEASURING_HULL_TUNING.paceOffsetWu * 1.5, z: base.z - 40 });
    if (!hull) return;
    this._capMemory();
    this._memory.set('enc', {
      hullId: hull.id,
      startedAt: this._now(),
      breakAt: null,
      resolved: false,
    });
  },

  _bolt(enc, hull, now) {
    if (enc.resolved) return;
    enc.resolved = true;
    const away = Math.atan2(
      finite(hull.pos.z) - finite(this._player()?.pos?.z ?? 0),
      finite(hull.pos.x) - finite(this._player()?.pos?.x ?? 0),
    );
    requestTrafficReaction(this, hull, {
      moveX: 0, moveZ: 1, boost: true, fire: false, fireGroup: null, aimAngle: away, brake: false,
    }, MEASURING_HULL_TUNING.boltIntentS);
    this.bus.emit(MEASURING_HULL_EVENT, { kind: 'bolted', hullId: enc.hullId, t: now });
    this._capMemory();
    this._memory.set('bolt', { hullId: enc.hullId, until: now + MEASURING_HULL_TUNING.boltIntentS });
    this._memory.delete('enc');
  },

  _loseThem(enc, now, reason) {
    const hull = this._entity(enc.hullId);
    if (hull) releaseTrafficReaction(this, hull);
    this._remove(enc.hullId);
    this._memory.delete('enc');
    this.bus.emit(MEASURING_HULL_EVENT, { kind: 'lost_them', reason, t: now });
  },

  // Let them follow: the meeting ends at sector exit with a wondering receipt.
  _onSectorExit() {
    const enc = this._memory ? this._memory.get('enc') : null;
    const now = this._now();
    if (enc && !enc.resolved) {
      this._comms(`plants:${MEASURING_HULL_TUNING.plId}:wonder:${now}`, 'OPEN CHANNEL', MEASURING_HULL_WONDER_LINE, 6);
      this.bus.emit(MEASURING_HULL_EVENT, { kind: 'measured', hullId: enc.hullId, t: now });
    }
    this._resetSector();
  },

  _remove(id) {
    if (id == null) return;
    this._owned.delete(id);
    if (this.helpers && typeof this.helpers.removeEntity === 'function') this.helpers.removeEntity(id);
  },

  _sweepExpired(now) {
    const bolt = this._memory.get('bolt');
    if (bolt && now >= bolt.until) {
      releaseTrafficReaction(this, this._entity(bolt.hullId));
      this._remove(bolt.hullId);
      this._memory.delete('bolt');
    }
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

  // Sector-scoped reset: the pacer dies, the bolt lease stamp (a session row) survives so
  // the bolting hull is still released and despawned politely after the sector line.
  _resetSector() {
    const enc = this._memory ? this._memory.get('enc') : null;
    if (enc) {
      releaseTrafficReaction(this, this._entity(enc.hullId));
      this._remove(enc.hullId);
    }
    const bolt = this._memory ? this._memory.get('bolt') : null;
    this._despawnOwned();
    if (this._memory) this._memory.clear();
    if (bolt) this._memory.set('bolt', bolt);
    if (this.bus) this.bus.emit(MEASURING_HULL_EVENT, { kind: 'reset', reason: 'sector_exit', t: this._now() });
  },

  // Cross-game hygiene: a save load or a new game is a new world — the bolt stamp dies with
  // it (the world's hulls are rebuilt; there is nothing left to release).
  _resetAll(reason) {
    this._despawnOwned();
    if (this._memory) this._memory.clear();
    if (this.bus) this.bus.emit(MEASURING_HULL_EVENT, { kind: 'reset', reason, t: this._now() });
  },

  _comms(id, sender, text, ttl) {
    this.bus.emit('comms:popup', { id, sender, category: 'traffic', text, ttl });
  },
};
