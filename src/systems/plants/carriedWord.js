// PL-302 The carried word — "Out of comms range, hand a passing hauler a message for a
// station — a name, a time, a yes or no — and they carry it exact, free.
// Trust them with it; or hand a smearer a lie for fun — carried words get read aloud at
// the destination bar"
//
// The relay (per row note): the module relays via comms:popup at the destination sector's
// next dock. The hand-off is physical: while the player is out of comms range (no station
// inside commsRangeWu), a passing hauler offers to carry words. Handing one over is a real
// jettison (cargo:jettisoned receipt) within the hauler's hand-off range — the hauler takes
// the nearest jettisoned pod aboard (it despawns INTO their hold) and carries it.
//
// - Trust them with it: at the next dock in a DIFFERENT sector than the hand-off, the word
//   is read aloud at the destination bar EXACT — free, the whole gift of the row.
// - Hand a smearer a lie for fun: some haulers smear (spawn-seeded). They read it aloud at
//   the bar mangled, with your hull named — and docks in that sector hear about it for a
//   bounded window (the same shape as brokenToll's gossip). The word is the authored
//   constant: a name, a time, a yes.
//
// Invariants:
// - Deterministic: state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports; the hauler receives no steering at all.
// - Physical: the word travels as a real jettisoned pod into a real hauler's hold.
// - No economy mutations: nothing is bought or sold; comms + stamps only.
// - Bounded Maps capped by tuning.memoryCap; one carried word at a time; TTL despawns;
//   nothing runs while docked (dock:range is only the relay seam).

import { makeShipEntitySpec } from '../ships.js';
import { hash32 } from '../../core/rng.js';

export const CARRIED_WORD_EVENT = 'plants:carriedWord';
export const CARRIED_WORD_GOSSIP_EVENT = 'plants:carriedWordGossip';

export const CARRIED_WORD_TUNING = Object.freeze({
  plId: 'pl302',
  spawnChancePct: 50,
  smearerPct: 40,              // the seeded slice of haulers that smear
  commsRangeWu: 700,           // "out of comms range": no station inside this
  handoffRangeWu: 120,         // the hauler takes a word from this close
  scoopRangeWu: 90,            // and scoops the pod nearest them
  offerCooldownS: 12,          // the offer repeats on this cadence, at most
  relayCooldownS: 15,
  gossipWindowS: 600,
  gossipMax: 2,
  gossipCooldownS: 30,
  strangerTtlS: 420,
  memoryCap: 8,
});

export const CARRIED_WORD_CALLSIGN = 'PASSING HAULER';
export const CARRIED_WORD_SMEARER_CALLSIGN = 'SMILING HAULER';
export const CARRIED_WORD_OFFER_LINE = 'Carrying words. Going my way?';
export const CARRIED_WORD_BAR_CALLSIGN = 'STATION BAR';
// The word: a name, a time, a yes or no.
export const CARRIED_WORD_TEXT = 'VELL — MIDNIGHT — YES.';
export const CARRIED_WORD_RELAYED_LINE = 'Read aloud: VELL — MIDNIGHT — YES.';
export const CARRIED_WORD_SMEARED_LINE = 'Bar hears: VELL — MIDNIGHT — NO. Hull named.';
export const CARRIED_WORD_GOSSIP_LINE = 'They are still telling the word.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure: is the player out of comms range? No station in reach at all (Infinity) is out. */
export function outOfCommsRange(nearestStationDistWu, tuning = CARRIED_WORD_TUNING) {
  if (!Number.isFinite(nearestStationDistWu)) return true; // no stations in the index: out
  return nearestStationDistWu > tuning.commsRangeWu;
}

/** Pure: the relay text for a hauler kind. */
export function relayTextFor(kind) {
  return kind === 'smearer' ? CARRIED_WORD_SMEARED_LINE : CARRIED_WORD_RELAYED_LINE;
}

/** Pure: the hauler's seeded kind for (seed, sectorId). */
export function haulerKindFor(seed, sectorId, tuning = CARRIED_WORD_TUNING) {
  const h = hash32(seed, sectorId, tuning.plId, 'kind') % 100;
  return h < tuning.smearerPct ? 'smearer' : 'carrier';
}

export const carriedWordPlant = {
  modes: ['flight'],
  name: 'plants302',

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
    on('cargo:jettisoned', (p) => this._onJettisoned(p));
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
    if (!enc) return;
    const hauler = this._entity(enc.haulerId);
    const player = this._player();
    if (!hauler || hauler.alive === false) { this._memory.delete('enc'); return; }
    // The offer repeats on cooldown while you are out of comms range and near.
    if (player && player.pos && !enc.handed
        && this._dist(hauler.pos, player.pos) <= CARRIED_WORD_TUNING.handoffRangeWu * 1.4
        && now - (enc.lastOfferAt || -Infinity) >= CARRIED_WORD_TUNING.offerCooldownS) {
      enc.lastOfferAt = now;
      this._say(`plants:${CARRIED_WORD_TUNING.plId}:offer:${now}`, enc.kind === 'smearer'
        ? CARRIED_WORD_SMEARER_CALLSIGN : CARRIED_WORD_CALLSIGN, CARRIED_WORD_OFFER_LINE, 6);
      this.bus.emit(CARRIED_WORD_EVENT, { kind: 'offered', haulerId: enc.haulerId, t: now });
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

  _nearestStationDist(pos) {
    const s = this.state;
    const list = (s.entityIndex && Array.isArray(s.entityIndex.stations)) ? s.entityIndex.stations : [];
    let best = Infinity;
    for (const st of list) {
      if (!st || st.alive === false || st.type !== 'station' || !st.pos) continue;
      const dist = this._dist(st.pos, pos);
      if (dist < best) best = dist;
    }
    return best;
  },

  _capMemory() {
    while (this._memory.size >= CARRIED_WORD_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _onSectorEnter(p) {
    this._reset('sector_enter');
    if (!this._flight()) return;
    const s = this.state;
    const sectorId = (p && p.sectorId) || (s.world && s.world.currentSectorId) || 's1';
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    if (hash32(seed, sectorId, CARRIED_WORD_TUNING.plId, 'spawn') % 100 >= CARRIED_WORD_TUNING.spawnChancePct) return;
    const player = this._player();
    const base = player && player.pos ? player.pos : { x: 0, z: 0 };
    const kind = haulerKindFor(seed, sectorId, CARRIED_WORD_TUNING);
    const hauler = this._spawnHauler({ x: base.x + 220, z: base.z - 60 }, kind);
    if (!hauler) return;
    this._capMemory();
    this._memory.set('enc', {
      haulerId: hauler.id,
      kind,
      handed: false,
      lastOfferAt: null,
      fromSectorId: null,
    });
  },

  _spawnHauler(pos, kind) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const spec = makeShipEntitySpec('ship_mule', {
      team: 2, factionId: 'faction_free', pos: { x: pos.x, z: pos.z },
      ai: { archetype: 'drifter', passive: true },
    });
    const ent = spawnEntity(spec);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [CARRIED_WORD_TUNING.plId]: { role: 'hauler', kind } };
    ent.data.callsign = kind === 'smearer' ? CARRIED_WORD_SMEARER_CALLSIGN : CARRIED_WORD_CALLSIGN;
    this._owned.set(ent.id, { kind: 'hauler', expiresAt: this._now() + CARRIED_WORD_TUNING.strangerTtlS });
    return ent;
  },

  // The hand-off: a real jettison near the hauler while out of comms range.
  _onJettisoned(p) {
    if (!this._flight() || !p) return;
    const s = this.state;
    const enc = this._memory.get('enc');
    if (!enc || enc.handed) return;
    const hauler = this._entity(enc.haulerId);
    const player = this._player();
    if (!hauler || !player || !player.pos) return;
    const now = this._now();
    if (this._dist(hauler.pos, player.pos) > CARRIED_WORD_TUNING.handoffRangeWu) return;
    if (!outOfCommsRange(this._nearestStationDist(player.pos))) return;
    // Take the nearest jettisoned pod aboard: the word travels in their hold.
    const pod = this._nearestJettisonedPod(hauler.pos);
    if (pod && this._dist(pod.pos, hauler.pos) <= CARRIED_WORD_TUNING.scoopRangeWu) {
      this._remove(pod.id);
    }
    enc.handed = true;
    // The carried word itself survives sector resets — the relay fires at the destination
    // sector's next dock, after the live hauler meeting is long gone. (smearGossip stays
    // sector-local by design: the docks that heard it are the docks around the bar.)
    this._capMemory();
    this._memory.set('carried', {
      kind: enc.kind,
      fromSectorId: (s.world && s.world.currentSectorId) || 's1',
      handedAt: now,
      relayedAt: null,
    });
    this._cue('confirm', hauler.pos, 0.6, 1);
    this.bus.emit(CARRIED_WORD_EVENT, {
      kind: 'word_taken', haulerId: enc.haulerId, carrierKind: enc.kind,
      podId: pod ? pod.id : null, t: now,
    });
  },

  _nearestJettisonedPod(pos) {
    const s = this.state;
    if (!s) return null;
    const entities = s.entities;
    const iter = entities && typeof entities.values === 'function' ? entities.values()
      : Array.isArray(s.entityList) ? s.entityList : [];
    let best = null;
    let bestD = Infinity;
    for (const ent of iter) {
      const d = ent && ent.data;
      if (!ent || ent.alive === false || !d || d.jettisonedCargo !== true) continue;
      if (!ent.pos) continue;
      const dist = this._dist(ent.pos, pos);
      if (dist < bestD) { bestD = dist; best = ent; }
    }
    return best;
  },

  // The relay: the destination sector's next dock reads the word aloud at the bar.
  _onDockRange(p) {
    if (!this._flight() || !p || p.inRange !== true) return;
    const s = this.state;
    const now = this._now();
    const carried = this._memory.get('carried');
    if (carried && carried.relayedAt == null) {
      const hereSector = (s.world && s.world.currentSectorId) || 's1';
      if (hereSector !== carried.fromSectorId) {
        carried.relayedAt = now;
        this._say(`plants:${CARRIED_WORD_TUNING.plId}:relay:${now}`,
          CARRIED_WORD_BAR_CALLSIGN, relayTextFor(carried.kind), 8);
        this.bus.emit(CARRIED_WORD_EVENT, {
          kind: carried.kind === 'smearer' ? 'smeared' : 'relayed_exact',
          stationId: p.stationId, sectorId: hereSector, t: now,
        });
        if (carried.kind === 'smearer') {
          // Your hull named: docks in this sector hear about it, bounded.
          this._capMemory();
          this._memory.set('smearGossip', { until: now + CARRIED_WORD_TUNING.gossipWindowS, heard: 0, lastAt: null });
        }
        this._memory.delete('carried');
        return;
      }
    }
    const gossip = this._memory.get('smearGossip');
    if (!gossip) return;
    if (gossip.heard >= CARRIED_WORD_TUNING.gossipMax) return;
    if (gossip.lastAt != null && now - gossip.lastAt < CARRIED_WORD_TUNING.gossipCooldownS) return;
    gossip.lastAt = now;
    gossip.heard += 1;
    this._comms(`plants:${CARRIED_WORD_TUNING.plId}:gossip:${now}`, 'DOCK GOSSIP',
      CARRIED_WORD_GOSSIP_LINE, 6);
    this.bus.emit(CARRIED_WORD_GOSSIP_EVENT, { stationId: p.stationId, heard: gossip.heard, t: now });
  },

  _onKilled(p) {
    const enc = this._memory.get('enc');
    if (!enc || !p || p.id !== enc.haulerId) return;
    this._memory.delete('enc');
    this.bus.emit(CARRIED_WORD_EVENT, { kind: 'hauler_dead', hullId: p.id, t: this._now() });
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
    if (enc && this._entity(enc.haulerId) == null) this._memory.delete('enc');
    const gossip = this._memory.get('smearGossip');
    if (gossip && now >= gossip.until) this._memory.delete('smearGossip');
  },

  _despawnOwned() {
    if (this.helpers && typeof this.helpers.removeEntity === 'function') {
      for (const id of [...(this._owned ? this._owned.keys() : [])]) this.helpers.removeEntity(id);
    }
    if (this._owned) this._owned.clear();
  },

  _reset(reason) {
    this._despawnOwned();
    // The carried word rides across sector changes; a session boundary (save:loaded,
    // game:new, game:newGame) drops it, and everything else resets.
    const sectoral = reason === 'sector_enter' || reason === 'sector_exit';
    const carried = sectoral && this._memory ? this._memory.get('carried') : null;
    if (this._memory) this._memory.clear();
    if (carried) this._memory.set('carried', carried);
    if (this.bus && reason === 'sector_exit') {
      this.bus.emit(CARRIED_WORD_EVENT, { kind: 'reset', reason, t: this._now() });
    }
  },

  _say(id, sender, text, ttl) {
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({ channel: 'comms', id, text, ttl });
    } else {
      this.bus.emit('voice:say', { channel: 'comms', id, text, ttl });
    }
    this.bus.emit('comms:popup', { id, sender, category: 'traffic', text, ttl });
  },

  _comms(id, sender, text, ttl) {
    this.bus.emit('comms:popup', { id, sender, category: 'traffic', text, ttl });
  },

  _cue(id, pos, gain = 0.8, rate = 1) {
    this.bus.emit('audio:cue', { id, position: pos ? { x: pos.x, z: pos.z } : null, gain, rate });
  },
};
