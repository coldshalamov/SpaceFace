// PL-249 The dead stick — "A ship glides past you, dead silent — no radio, no thrust, straight
// as a rail for the dock. An old pilot flying it in on nothing. Escort silently; or offer a
// tow — they wave you off, gently"
//
// A seeded chance meeting: an old-pilot stranger spawns crossing the player's lane on a
// dead-stick glide — a fixed initial velocity toward the nearest station, no intents, no
// radio (they never emit voice; only the module's comms speak for them once). Two choices:
// - Escort silently: stay inside escortRangeWu (and never snap a line on them) until they
//   are within dockApproachRangeWu of their target station — one lamp flash, the silent
//   nod, then they despawn politely at the dock.
// - Offer a tow: a massline snap-catch onto them — one gentle comms line (they wave you
//   off, gently), the tow cooldown, and the silent escort can still complete afterward.
//
// Invariants:
// - Deterministic: state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports. The dead stick receives NO intents at all: the glide is its
//   own physics, straight as a rail (that is the row's point).
// - Bounded Maps capped by tuning.memoryCap; one tow refusal per cooldown.
// - Nothing runs while docked (dock:range is only their target check via station proximity);
//   gates/wormholes excluded from targets; the player is never the NPC.

import { makeShipEntitySpec } from '../ships.js';
import { hash32 } from '../../core/rng.js';

export const DEAD_STICK_EVENT = 'plants:deadStick';

export const DEAD_STICK_TUNING = Object.freeze({
  plId: 'pl249',
  spawnChancePct: 45,
  glideSpeedWu: 26,            // straight as a rail, on nothing
  escortRangeWu: 180,
  dockApproachRangeWu: 260,
  towRefusalCooldownS: 45,
  flashDurationS: 1.2,
  strangerTtlS: 900,
  memoryCap: 8,
});

export const DEAD_STICK_CALLSIGN = 'OLD PILOT';
export const DEAD_STICK_WAVE_OFF_LINE = 'They wave you off, gently.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure: is the player inside escort range of the dead stick? */
export function isEscortingDeadStick(distWu, tuning = DEAD_STICK_TUNING) {
  return Number.isFinite(distWu) && distWu <= tuning.escortRangeWu;
}

export const deadStickPlant = {
  name: 'plants249',

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
    on('tether:snapCatch', (p) => this._onSnapCatch(p));
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
    if (!enc) return;
    const hull = this._entity(enc.hullId);
    const player = this._player();
    if (!hull || hull.alive === false) { this._memory.delete('enc'); return; }
    const target = this._entity(enc.targetStationId);

    // Escort tally: one tick per sweep in range; a sweep out of range decays it by one
    // rather than zeroing — a brief gap at the dock must not erase a whole escort.
    if (player && player.pos) {
      const dist = this._dist(hull.pos, player.pos);
      if (isEscortingDeadStick(dist)) enc.escortedTicks = (enc.escortedTicks || 0) + 1;
      else enc.escortedTicks = Math.max(0, (enc.escortedTicks || 0) - 1);
    }

    // The silent nod at the far end: escorted the whole glide into dock approach.
    if (!enc.done && target && this._dist(hull.pos, target.pos) <= DEAD_STICK_TUNING.dockApproachRangeWu) {
      enc.done = true;
      const escorted = (enc.escortedTicks || 0) >= 3 && !enc.towOffered;
      if (escorted) {
        hull.data.lampsFlashing = true;
        hull.data.lampFlashUntil = now + DEAD_STICK_TUNING.flashDurationS;
        this._cue('confirm', hull.pos, 0.8, 1);
        this.bus.emit(DEAD_STICK_EVENT, { kind: 'escorted', hullId: enc.hullId, stationId: enc.targetStationId, t: now });
      } else {
        this.bus.emit(DEAD_STICK_EVENT, { kind: 'arrived', hullId: enc.hullId, stationId: enc.targetStationId, t: now });
      }
      this._remove(enc.hullId);
      this._memory.delete('enc');
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
    return best;
  },

  _capMemory() {
    while (this._memory.size >= DEAD_STICK_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _spawnDeadStick(pos, targetStation) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const rot = targetStation
      ? Math.atan2(finite(targetStation.pos.z) - finite(pos.z), finite(targetStation.pos.x) - finite(pos.x))
      : -Math.PI / 2;
    const spec = makeShipEntitySpec('ship_drifter', {
      team: 2, factionId: 'faction_free', pos: { x: pos.x, z: pos.z }, rot,
      ai: { archetype: 'glider', passive: true },
    });
    const ent = spawnEntity(spec);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [DEAD_STICK_TUNING.plId]: { role: 'dead_stick', silent: true } };
    ent.data.callsign = DEAD_STICK_CALLSIGN;
    // The dead-stick glide: one fixed velocity toward the dock, no thrust, no turns.
    ent.vel = {
      x: Math.cos(rot) * DEAD_STICK_TUNING.glideSpeedWu,
      z: Math.sin(rot) * DEAD_STICK_TUNING.glideSpeedWu,
    };
    this._owned.set(ent.id, { kind: 'dead_stick', expiresAt: this._now() + DEAD_STICK_TUNING.strangerTtlS });
    return ent;
  },

  _onSectorEnter(p) {
    this._reset('sector_enter');
    if (!this._flight()) return;
    const s = this.state;
    const sectorId = (p && p.sectorId) || (s.world && s.world.currentSectorId) || 's1';
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    if (hash32(seed, sectorId, 'pl249', 'spawn') % 100 >= DEAD_STICK_TUNING.spawnChancePct) return;
    const player = this._player();
    const base = player && player.pos ? player.pos : { x: 0, z: 0 };
    // The glide crosses the player's lane toward the nearest station.
    const spawnPos = { x: base.x - 240, z: base.z - 120 };
    const targetStation = this._nearestStation(base);
    const hull = this._spawnDeadStick(spawnPos, targetStation);
    if (!hull) return;
    this._capMemory();
    this._memory.set('enc', {
      hullId: hull.id,
      targetStationId: targetStation ? targetStation.id : null,
      towOffered: false,
      lastTowRefusalAt: null,
      escortedTicks: 0,
      done: false,
    });
  },

  // Offer a tow: a massline snap-catch onto the dead stick. Waved off, gently.
  _onSnapCatch(p) {
    if (!this._flight() || !p) return;
    const enc = this._memory.get('enc');
    if (!enc || enc.done) return;
    if (p.targetId !== enc.hullId) return;
    const now = this._now();
    if (enc.lastTowRefusalAt != null && now - enc.lastTowRefusalAt < DEAD_STICK_TUNING.towRefusalCooldownS) return;
    enc.lastTowRefusalAt = now;
    enc.towOffered = true;
    this._comms(`plants:${DEAD_STICK_TUNING.plId}:waveoff:${now}`, DEAD_STICK_CALLSIGN, DEAD_STICK_WAVE_OFF_LINE, 6);
    this.bus.emit(DEAD_STICK_EVENT, { kind: 'tow_refused', hullId: enc.hullId, t: now });
  },

  _onKilled(p) {
    const enc = this._memory.get('enc');
    if (!enc || !p || p.id !== enc.hullId) return;
    this._memory.delete('enc');
    this.bus.emit(DEAD_STICK_EVENT, { kind: 'hull_dead', hullId: p.id, t: this._now() });
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
      this.bus.emit(DEAD_STICK_EVENT, { kind: 'reset', reason, t: this._now() });
    }
  },

  _comms(id, sender, text, ttl) {
    this.bus.emit('comms:popup', { id, sender, category: 'traffic', text, ttl });
  },

  _cue(id, pos, gain = 0.8, rate = 1) {
    this.bus.emit('audio:cue', { id, position: pos ? { x: pos.x, z: pos.z } : null, gain, rate });
  },
};
