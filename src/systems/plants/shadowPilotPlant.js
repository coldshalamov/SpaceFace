// PL-133 The shadow pilot — "A brand-new pilot latches onto your wake and copies everything:
// your line, your route, your parking. Dock, and they dock behind you, badly. Fly well, and
// in three towns meet a pilot who flies well; fly like a maniac, and meet that instead"
//
// A seeded chance meeting: a rookie stranger spawns on the player's wake and copies it
// (leased intent toward the wake point each sweep). The shadow window tallies the player's
// style: physics:impact receipts with the player on one side count as maniac; a clean window
// reads as flying well. When the player docks during the window, the rookie docks behind
// them, badly (one comms line), and the window closes. Three towns later (the 3rd dock
// approach after the window), an echo pilot greets the player according to the recorded
// style: one comms line, then the meeting ends.
//
// Invariants:
// - Deterministic: state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports. The rookie's wake-copying flies through the traffic reaction
//   lease (requestTrafficReaction) — the module is the rookie's single intent writer.
// - Bounded Maps capped by tuning.memoryCap; one echo per style record; cooldowns on
//   dock parking lines.
// - Nothing runs while docked (update gates on flight; dock:range events are the parking
//   seam only); gates/wormholes excluded; the player is never the NPC.

import { makeShipEntitySpec } from '../ships.js';
import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';
import { hash32 } from '../../core/rng.js';

export const SHADOW_PILOT_EVENT = 'plants:shadowPilot';
export const SHADOW_PILOT_ECHO_EVENT = 'plants:shadowPilotEcho';

export const SHADOW_PILOT_TUNING = Object.freeze({
  plId: 'pl133',
  spawnChancePct: 55,
  wakeOffsetWu: 90,            // the rookie holds this far back on the wake
  followRangeWu: 320,          // beyond this the copy has lapsed for this sweep
  shadowWindowS: 240,          // the rookie shadows for at most this long
  styleImpactsForManiac: 2,    // player impacts during the window -> "like a maniac"
  impactImpulseMin: 20,        // a real hit counts, contact-resolution brushes do not
  impactCooldownS: 1,          // a sustained grind on the same hull is one impact
  towns: 3,                    // meet the echo at the third town (dock approach) after
  parkLineCooldownS: 60,
  echoTtlS: 240,
  strangerTtlS: 900,
  memoryCap: 16,
});

export const SHADOW_PILOT_CALLSIGN = 'ROOKIE';
export const SHADOW_PILOT_PARK_LINE = 'They dock behind you. Badly.';
export const SHADOW_PILOT_ECHO_GOOD = 'You fly clean. Me too now.';
export const SHADOW_PILOT_ECHO_MANIAC = 'I fly just like you. Watch.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure style verdict from the window tallies. */
export function shadowPilotStyle(impacts, tuning = SHADOW_PILOT_TUNING) {
  return Number(impacts) >= tuning.styleImpactsForManiac ? 'maniac' : 'well';
}

export const shadowPilotPlant = {
  name: 'plants133',

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
    on('sector:exit', () => this._resetSector());
    on('save:loaded', () => this._resetAll('save_loaded'));
    on('game:new', () => this._resetAll('game_new'));
    on('game:newGame', () => this._resetAll('game_new_game'));
    on('physics:impact', (p) => this._onImpact(p));
    on('dock:range', (p) => this._onDockRange(p));
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
    const rookie = this._entity(enc.rookieId);
    const player = this._player();
    if (!rookie || rookie.alive === false || !player || !player.pos) return;
    if (now - enc.startedAt >= SHADOW_PILOT_TUNING.shadowWindowS) {
      this._closeWindow(enc, 'window_elapsed', now);
      return;
    }
    // Copy the wake: aim at the point behind the player, hold the offset.
    const pvx = finite(player.vel && player.vel.x);
    const pvz = finite(player.vel && player.vel.z);
    const speed = Math.hypot(pvx, pvz);
    const backX = speed > 1 ? -(pvx / speed) * SHADOW_PILOT_TUNING.wakeOffsetWu : -SHADOW_PILOT_TUNING.wakeOffsetWu;
    const backZ = speed > 1 ? -(pvz / speed) * SHADOW_PILOT_TUNING.wakeOffsetWu : 0;
    const wakeX = finite(player.pos.x) + backX;
    const wakeZ = finite(player.pos.z) + backZ;
    const dist = this._dist(rookie.pos, player.pos);
    if (dist <= SHADOW_PILOT_TUNING.followRangeWu) {
      const aim = Math.atan2(wakeZ - finite(rookie.pos.z), wakeX - finite(rookie.pos.x));
      requestTrafficReaction(this, rookie, {
        moveX: 0, moveZ: 1, boost: speed > 120, fire: false, fireGroup: null, aimAngle: aim, brake: false,
      }, 2);
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
    while (this._memory.size >= SHADOW_PILOT_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _spawnRookie(pos) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const spec = makeShipEntitySpec('ship_kestrel', {
      team: 2, factionId: 'faction_free', pos: { x: pos.x, z: pos.z },
      ai: { archetype: 'rookie', passive: true },
    });
    const ent = spawnEntity(spec);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [SHADOW_PILOT_TUNING.plId]: { role: 'rookie' } };
    ent.data.callsign = SHADOW_PILOT_CALLSIGN;
    this._owned.set(ent.id, { kind: 'rookie', expiresAt: this._now() + SHADOW_PILOT_TUNING.strangerTtlS });
    return ent;
  },

  _onSectorEnter(p) {
    this._resetSector();
    if (!this._flight()) return;
    const s = this.state;
    const sectorId = (p && p.sectorId) || (s.world && s.world.currentSectorId) || 's1';
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    if (hash32(seed, sectorId, 'pl133', 'spawn') % 100 >= SHADOW_PILOT_TUNING.spawnChancePct) return;
    const player = this._player();
    const base = player && player.pos ? player.pos : { x: 0, z: 0 };
    const rookie = this._spawnRookie({ x: base.x - SHADOW_PILOT_TUNING.wakeOffsetWu * 2, z: base.z });
    if (!rookie) return;
    this._capMemory();
    this._memory.set('enc', {
      rookieId: rookie.id,
      startedAt: this._now(),
      impacts: 0,
      parked: false,
      lastParkLineAt: null,
      lastImpactAt: null,
      lastImpactOther: null,
    });
  },

  _onImpact(p) {
    if (!this._flight() || !p) return;
    const enc = this._memory.get('enc');
    if (!enc) return;
    const playerId = this.state.playerId;
    const otherId = p.aId === playerId ? p.bId : (p.bId === playerId ? p.aId : null);
    if (otherId == null) return;
    if (finite(p.impulse, 0) < SHADOW_PILOT_TUNING.impactImpulseMin) return;
    const now = finite(this.state.simTime, 0);
    // A sustained grind re-fires every contact-resolution frame: one collision, one count
    // per hull. A different hull, or the same hull after the beat, is a separate impact.
    if (otherId === enc.lastImpactOther && enc.lastImpactAt != null
      && now - enc.lastImpactAt < SHADOW_PILOT_TUNING.impactCooldownS) return;
    enc.lastImpactAt = now;
    enc.lastImpactOther = otherId;
    enc.impacts += 1;
  },

  _onDockRange(p) {
    if (!p || p.inRange !== true) return;
    const now = this._now();
    const enc = this._memory.get('enc');
    if (enc) {
      // Dock, and they dock behind you, badly — one line per cooldown while shadowing.
      const rookie = this._entity(enc.rookieId);
      if (rookie && (enc.lastParkLineAt == null || now - enc.lastParkLineAt >= SHADOW_PILOT_TUNING.parkLineCooldownS)) {
        enc.lastParkLineAt = now;
        enc.parked = true;
        this._comms(`plants:${SHADOW_PILOT_TUNING.plId}:park:${now}`, SHADOW_PILOT_CALLSIGN, SHADOW_PILOT_PARK_LINE, 6);
        this.bus.emit(SHADOW_PILOT_EVENT, { kind: 'parked_badly', rookieId: enc.rookieId, stationId: p.stationId, t: now });
      }
      this._closeWindow(enc, 'docked', now);
      return;
    }
    // No live shadow: count towns toward the echo meeting.
    this._stepEcho(p, now);
  },

  _closeWindow(enc, reason, now) {
    const style = shadowPilotStyle(enc.impacts);
    const rookie = this._entity(enc.rookieId);
    if (rookie) releaseTrafficReaction(this, rookie);
    this._remove(enc.rookieId);
    this._memory.delete('enc');
    this._capMemory();
    this._memory.set('style', { style, impacts: enc.impacts, closedAt: now, townsLeft: SHADOW_PILOT_TUNING.towns });
    this.bus.emit(SHADOW_PILOT_EVENT, { kind: 'window_closed', reason, style, impacts: enc.impacts, t: now });
  },

  _stepEcho(p, now) {
    const row = this._memory.get('style');
    if (!row || row.townsLeft <= 0) return;
    row.townsLeft -= 1;
    if (row.townsLeft > 0) return;
    // Third town: meet a pilot who flies like the player taught them.
    const line = row.style === 'maniac' ? SHADOW_PILOT_ECHO_MANIAC : SHADOW_PILOT_ECHO_GOOD;
    this._comms(`plants:${SHADOW_PILOT_TUNING.plId}:echo:${now}`, SHADOW_PILOT_CALLSIGN, line, 6);
    this._cue('confirm', null, 0.6, 1);
    this.bus.emit(SHADOW_PILOT_ECHO_EVENT, { style: row.style, stationId: p.stationId, t: now });
    this._memory.delete('style');
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

  // Sector-scoped reset: the shadow dies, the style record (a session row — the echo is
  // towns later) survives.
  _resetSector() {
    for (const id of [...(this._owned ? this._owned.keys() : [])]) {
      releaseTrafficReaction(this, this._entity(id));
    }
    this._despawnOwned();
    const keep = this._memory ? this._memory.get('style') : null;
    if (this._memory) this._memory.clear();
    if (keep) this._memory.set('style', keep);
    if (this.bus) this.bus.emit(SHADOW_PILOT_EVENT, { kind: 'reset', reason: 'sector_exit', t: this._now() });
  },

  // Cross-game hygiene: a save load or a new game is a new world — the style record dies.
  _resetAll(reason) {
    for (const id of [...(this._owned ? this._owned.keys() : [])]) {
      releaseTrafficReaction(this, this._entity(id));
    }
    this._despawnOwned();
    if (this._memory) this._memory.clear();
    if (this.bus) this.bus.emit(SHADOW_PILOT_EVENT, { kind: 'reset', reason, t: this._now() });
  },

  _comms(id, sender, text, ttl) {
    this.bus.emit('comms:popup', { id, sender, category: 'traffic', text, ttl });
  },

  _cue(id, pos, gain = 0.8, rate = 1) {
    this.bus.emit('audio:cue', { id, position: pos ? { x: pos.x, z: pos.z } : null, gain, rate });
  },
};
