// PL-292 The convoy godmother — "A freight convoy adopts a struggling stranger for a night:
// they pace you, run you a fuel line, and wave you off at the junction with lamps.
// Fly with them; or siphon from the line — convoys share hull numbers at junctions, all of them"
//
// A seeded chance meeting: when the player is struggling (hull below strugglingHullPct), a
// two-freighter convoy forms abeam of them and paces. While the player flies with them
// (inside paceRangeWu of the lead), the convoy runs a fuel line: a fuel-cell pod dropped at
// the lead's tail every fuelLineEveryS — freely given. At the junction (a transit gate or
// the window's end) a qualified pacer gets the wave-off with lamps; a siphon is a scoop of
// the line's pods BEFORE qualifying: the next junction hears the convoy share your hull
// number, and for a season no convoy adopts your hull at all.
//
// Invariants:
// - Deterministic: state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports. Pacing is steering through the traffic reaction lease
//   (requestTrafficReaction, abort on refusal); the player is never steered.
// - Physical: the fuel line is real jettisoned-cargo pods; the wave-off is a real lamp flash.
// - No economy mutations: pods are physical gifts; the hull-number sharing is comms + a
//   module stamp (convoyRefuseUntil), not a credit or contract write.
// - Bounded Maps capped by tuning.memoryCap; cooldowns in sim time; TTL despawns.
// - Nothing runs while docked; gates/wormholes anchor only the junction; player never the NPC.

import { makeShipEntitySpec } from '../ships.js';
import { spawnJettisonedCargoPod } from '../lootShards.js';
import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';
import { hash32 } from '../../core/rng.js';

export const CONVOY_GODMOTHER_EVENT = 'plants:convoyGodmother';

export const CONVOY_GODMOTHER_TUNING = Object.freeze({
  plId: 'pl292',
  spawnChancePct: 50,
  strugglingHullPct: 0.6,      // "adopts a struggling stranger": hull must be low
  convoySize: 2,               // two freighters, one formation
  paceRangeWu: 220,            // flying with them: inside this of the lead
  paceOffsetWu: 90,            // abeam slot distance from the player
  fuelLineEveryS: 14,          // a fuel pod dropped while pacing
  qualifyTicks: 4,             // one-second sweeps inside paceRange before the line is "yours"
  convoyWindowS: 90,           // "for a night": the pacing leg's length
  waveOffGateRangeWu: 420,     // junction proximity ends the leg
  siphonSeasonS: 1200,         // "convoys share hull numbers ... all of them": no adoption
  strangerTtlS: 240,
  podTtlS: 90,
  podAmount: 1,
  podRadius: 5,
  memoryCap: 8,
});

export const CONVOY_GODMOTHER_CALLSIGN = 'FREIGHT CONVOY';
export const CONVOY_WAVE_OFF_LINE = 'Wave-off. Fly safe.';
export const CONVOY_HULL_SHARE_LINE = 'Hull numbers shared. All of them.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure: is the player flying with the convoy (inside the pacing range)? */
export function isPacingWith(distWu, tuning = CONVOY_GODMOTHER_TUNING) {
  return Number.isFinite(distWu) && distWu <= tuning.paceRangeWu;
}

/** Pure: the abeam slot a pacing freighter holds beside the player. */
export function pacePointFor(playerPos, playerRot, side, tuning = CONVOY_GODMOTHER_TUNING) {
  const rot = finite(playerRot, 0);
  const px = finite(playerPos && playerPos.x);
  const pz = finite(playerPos && playerPos.z);
  const dirX = Math.cos(rot);
  const dirZ = Math.sin(rot);
  return {
    x: px - dirZ * side * tuning.paceOffsetWu,
    z: pz + dirX * side * tuning.paceOffsetWu,
  };
}

export const convoyGodmotherPlant = {
  name: 'plants292',

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
    on('pickup:collected', (p) => this._onPickupCollected(p));
    on('gate:range', (p) => this._onGateRange(p));
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
    const player = this._player();
    const lead = this._entity(enc.leadId);
    const wing = this._entity(enc.wingId);
    if (!player || !lead || lead.alive === false) { this._memory.delete('enc'); return; }

    // Pace: hold the abeam slots beside the player through the reaction lease.
    const leadSlot = pacePointFor(player.pos, player.rot, 1);
    const wingSlot = pacePointFor(player.pos, player.rot, -1);
    this._steer(lead, leadSlot);
    if (wing) this._steer(wing, wingSlot);

    // Flying with them: qualified pacing earns the line and the wave-off.
    const dist = this._dist(lead.pos, player.pos);
    if (isPacingWith(dist)) enc.pacedTicks = (enc.pacedTicks || 0) + 1;
    else enc.pacedTicks = Math.max(0, (enc.pacedTicks || 0) - 1);
    enc.qualified = (enc.pacedTicks || 0) >= CONVOY_GODMOTHER_TUNING.qualifyTicks;

    // Run the fuel line: they pace you, and the line runs while you are around — taking
    // from it before you have flown with them (qualified) is the siphon.
    if (isPacingWith(dist) && (enc.pacedTicks || 0) >= 1
        && now - (enc.lastFuelAt || -Infinity) >= CONVOY_GODMOTHER_TUNING.fuelLineEveryS) {
      enc.lastFuelAt = now;
      this._dropFuelPod({ x: lead.pos.x, z: lead.pos.z });
      this.bus.emit(CONVOY_GODMOTHER_EVENT, { kind: 'fuel_line', leadId: enc.leadId, t: now });
    }

    // The junction: the window runs out or a gate is close — wave off with lamps.
    const gate = this._nearestGate(player.pos);
    const atJunction = (gate && this._dist(gate.pos, player.pos) <= CONVOY_GODMOTHER_TUNING.waveOffGateRangeWu)
      || now - enc.startedAt >= CONVOY_GODMOTHER_TUNING.convoyWindowS;
    if (atJunction && !enc.wavedOff) {
      enc.wavedOff = true;
      if (enc.qualified) {
        lead.data.lampsFlashing = true;
        lead.data.lampFlashUntil = now + 1.2;
        this._cue('confirm', lead.pos, 0.8, 1);
        this._comms(`plants:${CONVOY_GODMOTHER_TUNING.plId}:waveoff:${now}`,
          CONVOY_GODMOTHER_CALLSIGN, CONVOY_WAVE_OFF_LINE, 6);
        this.bus.emit(CONVOY_GODMOTHER_EVENT, { kind: 'waved_off', leadId: enc.leadId, t: now });
      }
      this._endEncounter('junction');
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

  _nearestGate(pos) {
    const s = this.state;
    const list = (s.entityIndex && Array.isArray(s.entityIndex.stations)) ? s.entityIndex.stations : [];
    let best = null;
    let bestD = Infinity;
    for (const st of list) {
      const d = st && st.data;
      if (!st || st.alive === false || st.type !== 'station' || !d || d.isGate !== true) continue;
      const dist = this._dist(st.pos, pos);
      if (dist < bestD) { bestD = dist; best = st; }
    }
    return best;
  },

  _capMemory() {
    while (this._memory.size >= CONVOY_GODMOTHER_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _steer(ent, point) {
    if (!ent || !point) return false;
    const dx = finite(point.x) - finite(ent.pos && ent.pos.x);
    const dz = finite(point.z) - finite(ent.pos && ent.pos.z);
    const d = Math.hypot(dx, dz);
    const near = d < 30;
    const held = requestTrafficReaction(this, ent, {
      moveX: near ? 0 : dx / (d || 1),
      moveZ: near ? 0 : dz / (d || 1),
      boost: false, fire: false, fireGroup: null, aimAngle: Math.atan2(dz, dx), brake: near,
    }, 3);
    if (!held) releaseTrafficReaction(this, ent); // refused: abort, leave the hull alone
    return held;
  },

  _spawnFreighter(pos, side) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    if (this._owned.size >= CONVOY_GODMOTHER_TUNING.convoySize + CONVOY_GODMOTHER_TUNING.memoryCap) return null;
    const spec = makeShipEntitySpec('ship_mule', {
      team: 2, factionId: 'faction_free', pos: { x: pos.x, z: pos.z },
      ai: { archetype: 'pacer', passive: true },
    });
    const ent = spawnEntity(spec);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [CONVOY_GODMOTHER_TUNING.plId]: { role: side > 0 ? 'lead' : 'wing' } };
    ent.data.callsign = CONVOY_GODMOTHER_CALLSIGN;
    this._owned.set(ent.id, { kind: 'freighter', expiresAt: this._now() + CONVOY_GODMOTHER_TUNING.strangerTtlS });
    return ent;
  },

  _dropFuelPod(pos) {
    const pod = spawnJettisonedCargoPod(this.state, {
      commodityId: 'cmdty_fuel_cells', amount: CONVOY_GODMOTHER_TUNING.podAmount,
      radius: CONVOY_GODMOTHER_TUNING.podRadius,
      pos: { x: pos.x, z: pos.z }, vel: { x: 0, z: 0 },
      ownerId: null, ownerName: CONVOY_GODMOTHER_CALLSIGN,
    }, this.helpers);
    if (!pod || pod.id == null) return null;
    pod.data = pod.data || {};
    pod.data.plants = { ...(pod.data.plants || {}), [CONVOY_GODMOTHER_TUNING.plId]: { role: 'fuel_line' } };
    this._owned.set(pod.id, { kind: 'fuel_pod', expiresAt: this._now() + CONVOY_GODMOTHER_TUNING.podTtlS });
    return pod;
  },

  _onSectorEnter(p) {
    this._reset('sector_enter');
    if (!this._flight()) return;
    const s = this.state;
    const sectorId = (p && p.sectorId) || (s.world && s.world.currentSectorId) || 's1';
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    if (hash32(seed, sectorId, CONVOY_GODMOTHER_TUNING.plId, 'spawn') % 100 >= CONVOY_GODMOTHER_TUNING.spawnChancePct) return;
    // "convoys share hull numbers at junctions, all of them": a siphoner gets no adoption.
    const refuse = this._memory.get('convoyRefuse');
    if (refuse && finite(refuse.until, 0) > this._now()) {
      this.bus.emit(CONVOY_GODMOTHER_EVENT, { kind: 'refused', reason: 'hull_shared', t: this._now() });
      return;
    }
    const player = this._player();
    if (!player || !player.pos) return;
    const hullPct = finite(player.hullMax, 0) > 0 ? finite(player.hull, 0) / finite(player.hullMax, 1) : 1;
    if (hullPct >= CONVOY_GODMOTHER_TUNING.strugglingHullPct) return; // they adopt the struggling
    const lead = this._spawnFreighter({ x: player.pos.x + 140, z: player.pos.z - 60 }, 1);
    if (!lead) return;
    const wing = this._spawnFreighter({ x: player.pos.x + 140, z: player.pos.z + 60 }, -1);
    this._capMemory();
    this._memory.set('enc', {
      leadId: lead.id,
      wingId: wing ? wing.id : null,
      startedAt: this._now(),
      pacedTicks: 0,
      qualified: false,
      wavedOff: false,
      lastFuelAt: null,
      siphoned: false,
    });
  },

  // A scoop of the line before you have flown with them is a siphon.
  _onPickupCollected(p) {
    if (!this._flight() || !p) return;
    const enc = this._memory.get('enc');
    if (!enc || enc.siphoned) return;
    const podId = p && p.pickupId != null ? p.pickupId : null;
    const owned = podId != null ? this._owned.get(podId) : null;
    if (!owned || owned.kind !== 'fuel_pod') return;
    const now = this._now();
    if (enc.qualified) {
      this.bus.emit(CONVOY_GODMOTHER_EVENT, { kind: 'gift_taken', podId, t: now });
      return;
    }
    enc.siphoned = true;
    this._capMemory();
    this._memory.set('convoyRefuse', { until: now + CONVOY_GODMOTHER_TUNING.siphonSeasonS });
    this.bus.emit(CONVOY_GODMOTHER_EVENT, { kind: 'siphoned', podId, t: now });
  },

  // "convoys share hull numbers at junctions, all of them": the siphoner's number goes up
  // on the boards at the next junction, once per meeting.
  _onGateRange(p) {
    if (!this._flight() || !p || p.inRange !== true) return;
    const stamp = this._memory.get('convoyRefuse');
    if (!stamp || stamp.shared) return;
    const now = this._now();
    stamp.shared = true;
    this._comms(`plants:${CONVOY_GODMOTHER_TUNING.plId}:hullshare:${now}`,
      'JUNCTION BOARD', CONVOY_HULL_SHARE_LINE, 6);
    this.bus.emit(CONVOY_GODMOTHER_EVENT, { kind: 'hull_shared', gateId: p.gateId, t: now });
  },

  _endEncounter(reason) {
    const enc = this._memory.get('enc');
    if (!enc) return;
    this._memory.delete('enc');
    for (const [id, row] of [...this._owned]) {
      if (row.kind === 'freighter') this._remove(id);
    }
    this.bus.emit(CONVOY_GODMOTHER_EVENT, { kind: 'left', reason, t: this._now() });
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
    const enc = this._memory.get('enc');
    if (enc && this._entity(enc.leadId) == null) this._memory.delete('enc');
  },

  _despawnOwned() {
    if (this.helpers && typeof this.helpers.removeEntity === 'function') {
      for (const id of [...(this._owned ? this._owned.keys() : [])]) this.helpers.removeEntity(id);
    }
    if (this._owned) this._owned.clear();
  },

  _reset(reason) {
    this._despawnOwned();
    // Season stamps ride across sector changes; a session boundary (save:loaded,
    // game:new, game:newGame) starts this module's memory clean.
    const sectoral = reason === 'sector_enter' || reason === 'sector_exit';
    const keep = sectoral && this._memory ? this._memory.get('convoyRefuse') : null;
    if (this._memory) this._memory.clear();
    if (keep) this._memory.set('convoyRefuse', keep);
    if (this.bus && reason === 'sector_exit') {
      this.bus.emit(CONVOY_GODMOTHER_EVENT, { kind: 'reset', reason, t: this._now() });
    }
  },

  _comms(id, sender, text, ttl) {
    this.bus.emit('comms:popup', { id, sender, category: 'traffic', text, ttl });
  },

  _cue(id, pos, gain = 0.8, rate = 1) {
    this.bus.emit('audio:cue', { id, position: pos ? { x: pos.x, z: pos.z } : null, gain, rate });
  },
};
