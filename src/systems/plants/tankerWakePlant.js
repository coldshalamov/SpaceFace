// PL-159 The tanker's wake — "The great tanker on the long route never changes course for
// anything. Pass close and its slow bulk drags you along for a second — the only thing out
// here that tows you. Ride the drag; or give it room like everyone else"
//
// A seeded chance meeting: the great tanker stranger spawns crossing the sector on a fixed
// heading and never turns. Passing close (inside wakeRangeWu) lets its bulk tow the player:
// one bounded physics impulse toward the tanker's heading, applied through the physics
// authority (queuePhysicsImpulse — never a direct vel write), for towWindowS of sim time,
// cooldown-gated per pass. Giving it room (staying outside wakeRangeWu) is the polite
// choice and costs nothing — this row is a gift to whoever rides the drag.
//
// Invariants:
// - Deterministic: state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports. The tanker "never changes course for anything": it receives
//   no steering intents at all after spawn; its glide is its own physics.
// - Physical: the tow is a real impulse through the physics authority, bounded by tuning.
// - Bounded Maps capped by tuning.memoryCap; cooldown per tow pass.
// - Nothing runs while docked; gates/wormholes excluded; the player is never the NPC.

import { makeShipEntitySpec } from '../ships.js';
import { queuePhysicsImpulse } from '../../core/physicsAuthority.js';
import { hash32 } from '../../core/rng.js';

export const TANKER_WAKE_EVENT = 'plants:tankerWake';

export const TANKER_WAKE_TUNING = Object.freeze({
  plId: 'pl159',
  spawnChancePct: 45,
  wakeRangeWu: 90,             // pass close enough to be dragged
  towWindowS: 1,               // drags you along for a second
  towImpulsePerSec: 90,        // impulse magnitude while inside the wake (WU mass-units/s)
  towCooldownS: 12,            // one tow per pass, cooldown before the next
  tankerSpeedWu: 14,           // the great tanker's slow glide
  strangerTtlS: 1200,          // the long route lasts a while
  memoryCap: 8,
});

export const TANKER_WAKE_CALLSIGN = 'GREAT TANKER';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure tow vector: along the tanker's heading, magnitude per tuning. */
export function tankerTowImpulse(tankerRot, magnitude) {
  const rot = finite(tankerRot, 0);
  const mag = finite(magnitude, 0);
  return { x: Math.cos(rot) * mag, z: Math.sin(rot) * mag };
}

export const tankerWakePlant = {
  modes: ['flight'],
  name: 'plants159',

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
  },

  update(dt) {
    const s = this.state;
    if (!s || !this.bus) return;
    const now = finite(s.simTime, 0);
    // Per-tick (cheap: one known hull, one player) so a one-second tow is one second.
    this._sweepExpired(now);
    if (!this._flight()) return;
    const enc = this._memory.get('enc');
    if (!enc) return;
    const tanker = this._entity(enc.tankerId);
    const player = this._player();
    if (!tanker || tanker.alive === false || !player || !player.pos) return;

    const dist = this._dist(tanker.pos, player.pos);
    if (dist > TANKER_WAKE_TUNING.wakeRangeWu) {
      if (enc.towUntil != null && now >= enc.towUntil) enc.towUntil = null;
      return;
    }
    if (enc.towUntil == null) {
      if (enc.lastTowAt != null && now - enc.lastTowAt < TANKER_WAKE_TUNING.towCooldownS) return;
      enc.towUntil = now + TANKER_WAKE_TUNING.towWindowS;
      enc.lastTowAt = now;
      this.bus.emit(TANKER_WAKE_EVENT, { kind: 'tow_started', tankerId: enc.tankerId, t: now });
    }
    if (now > enc.towUntil) {
      enc.towUntil = null;
      return;
    }
    // The slow bulk drags you along: impulse along the tanker's heading through the
    // physics authority, scaled to per-tick, never a direct vel write.
    const perTick = tankerTowImpulse(tanker.rot, TANKER_WAKE_TUNING.towImpulsePerSec * finite(dt, 1 / 60));
    const mass = finite(player.mass, 1) || 1;
    if (typeof queuePhysicsImpulse === 'function') {
      queuePhysicsImpulse(player, { x: perTick.x * mass, z: perTick.z * mass }, { tick: s.tick });
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

  _capMemory() {
    while (this._memory.size >= TANKER_WAKE_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _spawnTanker(pos, rot) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const spec = makeShipEntitySpec('ship_atlas', {
      team: 2, factionId: 'faction_free', pos: { x: pos.x, z: pos.z }, rot,
      ai: { archetype: 'tanker', passive: true },
    });
    const ent = spawnEntity(spec);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [TANKER_WAKE_TUNING.plId]: { role: 'great_tanker' } };
    ent.data.callsign = TANKER_WAKE_CALLSIGN;
    // The long-route glide: a fixed initial velocity; the tanker never turns for anything.
    ent.vel = { x: Math.cos(rot) * TANKER_WAKE_TUNING.tankerSpeedWu, z: Math.sin(rot) * TANKER_WAKE_TUNING.tankerSpeedWu };
    this._owned.set(ent.id, { kind: 'tanker', expiresAt: this._now() + TANKER_WAKE_TUNING.strangerTtlS });
    return ent;
  },

  _onSectorEnter(p) {
    this._reset('sector_enter');
    if (!this._flight()) return;
    const s = this.state;
    const sectorId = (p && p.sectorId) || (s.world && s.world.currentSectorId) || 's1';
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    if (hash32(seed, sectorId, 'pl159', 'spawn') % 100 >= TANKER_WAKE_TUNING.spawnChancePct) return;
    const player = this._player();
    const base = player && player.pos ? player.pos : { x: 0, z: 0 };
    // Cross the sector on a fixed heading: north-ish across the player's lane.
    const rot = -Math.PI / 2;
    const tanker = this._spawnTanker({ x: base.x + 120, z: base.z + 600 }, rot);
    if (!tanker) return;
    this._capMemory();
    this._memory.set('enc', { tankerId: tanker.id, towUntil: null, lastTowAt: null });
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
      this.bus.emit(TANKER_WAKE_EVENT, { kind: 'reset', reason, t: this._now() });
    }
  },
};
