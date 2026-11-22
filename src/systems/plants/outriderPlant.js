// PL-184 The outrider — "Near a convoy's lane, one fast ship detaches, circles you once, and
// returns. Hold still for the circle and be waved through; or boost off, and the convoy
// closes ranks behind you"
//
// A seeded chance meeting: a small convoy (bounded cast) flies a lane with an outrider.
// The outrider detaches and circles the player once: deterministic angle integration on the
// module row (angle += orbitSpeedRadS * dt each update tick, 0..2pi), with the circling
// flown through the traffic reaction lease. Hold still (player speed below holdStillSpeedWu
// for the whole circle) and the outrider's lamps flash the wave-through; boost off (speed
// above boostSpeedWu mid-circle) and the convoy closes ranks (brake intents + ui_deny cue),
// then the outrider returns and the meeting ends either way.
//
// Invariants:
// - Deterministic: state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports. Circling and return fly through the traffic reaction lease.
// - Bounded Maps capped by tuning.memoryCap; bounded cast (tuning.maxCast).
// - Nothing runs while docked; gates/wormholes excluded; the player is never the NPC.

import { makeShipEntitySpec } from '../ships.js';
import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';
import { hash32 } from '../../core/rng.js';

export const OUTRIDER_EVENT = 'plants:outrider';

export const OUTRIDER_TUNING = Object.freeze({
  plId: 'pl184',
  spawnChancePct: 50,
  maxCast: 3,                  // convoy lead + wingman + outrider
  convoyShips: 2,
  orbitRadiusWu: 150,
  orbitSpeedRadS: Math.PI / 4, // one circle in 8 s
  holdStillSpeedWu: 25,        // holding still for the circle
  boostSpeedWu: 200,           // boosting off mid-circle
  circleTimeoutS: 30,          // the circle must complete inside this
  flashDurationS: 1.5,
  strangerTtlS: 600,
  memoryCap: 16,
});

export const OUTRIDER_CALLSIGN = 'OUTRIDER';
export const OUTRIDER_CONVOY_CALLSIGN = 'CONVOY';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure orbit point for the outrider's circle around the player. */
export function orbitPoint(center, angle, radius) {
  if (!center) return null;
  const r = finite(radius, 0);
  return {
    x: finite(center.x) + Math.cos(finite(angle, 0)) * r,
    z: finite(center.z) + Math.sin(finite(angle, 0)) * r,
  };
}

/** Pure verdict of one circle attempt from the tallies: holding still is the whole ask. */
export function outriderCircleVerdict({ boostedOff = false, completed = false, heldStill = false }) {
  if (boostedOff) return 'ranks_closed';
  if (!completed) return 'unfinished';
  return heldStill === true ? 'waved_through' : 'no_wave';
}

export const outriderPlant = {
  modes: ['flight'],
  name: 'plants184',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._owned = new Map();
    this._memory = new Map();
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:enter', (p) => this._onSectorEnter(p));
    on('sector:exit', () => this._reset('sector_exit'));
    on('save:loaded', () => this._reset('save_loaded'));
  },

  update(dt) {
    const s = this.state;
    if (!s || !this.bus) return;
    const now = finite(s.simTime, 0);
    this._sweepExpired(now);
    if (!this._flight()) return;
    const enc = this._memory.get('enc');
    if (!enc || enc.detached === false) return;
    const outrider = this._entity(enc.outriderId);
    const player = this._player();
    if (!outrider || outrider.alive === false || !player || !player.pos) {
      this._endMeeting(enc, now);
      return;
    }
    const step = finite(dt, 1 / 60);

    // The circle: deterministic angle integration around the player's live position.
    enc.angle += OUTRIDER_TUNING.orbitSpeedRadS * step;
    enc.heldStill = enc.heldStill && this._speedOf(player) <= OUTRIDER_TUNING.holdStillSpeedWu;
    if (this._speedOf(player) > OUTRIDER_TUNING.boostSpeedWu) enc.boostedOff = true;

    const target = orbitPoint(player.pos, enc.angle, OUTRIDER_TUNING.orbitRadiusWu);
    const aim = Math.atan2(
      finite(target.z) - finite(outrider.pos.z),
      finite(target.x) - finite(outrider.pos.x),
    );
    requestTrafficReaction(this, outrider, {
      moveX: 0, moveZ: 1, boost: true, fire: false, fireGroup: null, aimAngle: aim, brake: false,
    }, 2);

    // The convoy closes ranks behind a booster.
    if (enc.boostedOff && !enc.ranksClosed) {
      enc.ranksClosed = true;
      for (const id of enc.convoyIds) {
        const ship = this._entity(id);
        if (ship && ship.alive !== false) {
          requestTrafficReaction(this, ship, {
            moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, brake: true,
          }, 6);
        }
      }
      this._cue('ui_deny', outrider.pos, 0.9, 1);
      this.bus.emit(OUTRIDER_EVENT, { kind: 'ranks_closed', convoyIds: enc.convoyIds, t: now });
    }

    // One circle done (or timeout): verdict, wave-through or return, meeting ends.
    if (enc.angle >= Math.PI * 2 || now - enc.circleStartAt >= OUTRIDER_TUNING.circleTimeoutS) {
      const completed = enc.angle >= Math.PI * 2;
      const verdict = outriderCircleVerdict({
        boostedOff: enc.boostedOff,
        completed,
        heldStill: enc.heldStill === true,
      });
      if (verdict === 'waved_through') {
        outrider.data.lampsFlashing = true;
        outrider.data.lampFlashUntil = now + OUTRIDER_TUNING.flashDurationS;
        this._cue('confirm', outrider.pos, 0.8, 1);
      }
      this.bus.emit(OUTRIDER_EVENT, { kind: 'circle_done', verdict, t: now });
      this._endMeeting(enc, now);
    }
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

  _speedOf(e) {
    if (!e || !e.vel) return 0;
    return Math.hypot(finite(e.vel.x), finite(e.vel.z));
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
    while (this._memory.size >= OUTRIDER_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _spawnShip(defId, pos, role, callsign, index = -1) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function' || this._owned.size >= OUTRIDER_TUNING.maxCast) return null;
    const spec = makeShipEntitySpec(defId, {
      team: 2, factionId: 'faction_free', pos: { x: pos.x, z: pos.z },
      ai: { archetype: role === 'outrider' ? 'escort' : 'hauler', passive: true },
    });
    const ent = spawnEntity(spec);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [OUTRIDER_TUNING.plId]: { role, index } };
    ent.data.callsign = callsign;
    this._owned.set(ent.id, { kind: role, expiresAt: this._now() + OUTRIDER_TUNING.strangerTtlS });
    return ent;
  },

  _onSectorEnter(p) {
    this._reset('sector_enter');
    if (!this._flight()) return;
    const s = this.state;
    const sectorId = (p && p.sectorId) || (s.world && s.world.currentSectorId) || 's1';
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    if (hash32(seed, sectorId, 'pl184', 'spawn') % 100 >= OUTRIDER_TUNING.spawnChancePct) return;
    const player = this._player();
    const base = player && player.pos ? player.pos : { x: 0, z: 0 };
    const convoyIds = [];
    for (let i = 0; i < OUTRIDER_TUNING.convoyShips; i += 1) {
      const ship = this._spawnShip('ship_mule', { x: base.x - 500, z: base.z + 80 + i * 70 }, 'convoy', OUTRIDER_CONVOY_CALLSIGN, i);
      if (ship) convoyIds.push(ship.id);
    }
    const outrider = this._spawnShip('ship_wasp', { x: base.x - 420, z: base.z + 60 }, 'outrider', OUTRIDER_CALLSIGN);
    if (!outrider || convoyIds.length !== OUTRIDER_TUNING.convoyShips) { this._despawnOwned(); return; }
    this._capMemory();
    this._memory.set('enc', {
      convoyIds,
      outriderId: outrider.id,
      detached: true,
      angle: 0,
      circleStartAt: this._now(),
      heldStill: true,
      boostedOff: false,
      ranksClosed: false,
    });
  },

  _endMeeting(enc, now) {
    releaseTrafficReaction(this, this._entity(enc.outriderId));
    for (const id of enc.convoyIds) releaseTrafficReaction(this, this._entity(id));
    this._remove(enc.outriderId);
    for (const id of enc.convoyIds) this._remove(id);
    this._memory.delete('enc');
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
    const enc = this._memory ? this._memory.get('enc') : null;
    if (enc) {
      releaseTrafficReaction(this, this._entity(enc.outriderId));
      for (const id of enc.convoyIds) releaseTrafficReaction(this, this._entity(id));
    }
    this._despawnOwned();
    if (this._memory) this._memory.clear();
    if (this.bus && reason === 'sector_exit') {
      this.bus.emit(OUTRIDER_EVENT, { kind: 'reset', reason, t: this._now() });
    }
  },

  _cue(id, pos, gain = 0.8, rate = 1) {
    this.bus.emit('audio:cue', { id, position: pos ? { x: pos.x, z: pos.z } : null, gain, rate });
  },
};
