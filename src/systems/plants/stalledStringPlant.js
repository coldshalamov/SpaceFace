// PL-220 The stalled string — "Three containers sit dead at a green beacon, and nobody behind
// them has the mass to move them. One good Shove would do it. Be the shove and take a hundred
// flashes of thanks; or watch commuter patience die in real time"
//
// A seeded chance meeting: three dead-stopped container pods block a green beacon prop, and
// two commuter strangers queue behind them, unable to move them. One good shove — a real
// physics:impact on a container with impulse over shoveImpulseMin (a thrown body, the
// intended verb) — scatters the string physically. When every container is clear of the
// beacon (beyond clearRangeWu), the commuters flash their thanks (bounded lamp flashes) and
// the meeting ends. If the string sits unresolved for patienceS, the commuters give up and
// leave — patience dying in real time, one sad cue.
//
// Invariants:
// - Deterministic: state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports. Commuters receive only brake/wait intents through the
//   traffic reaction lease; the containers move by real physics, never by module writes.
// - Physical: containers are real jettisoned cargo pods (persistent, physicsBody mass,
//   masslineTetherable); the beacon is a real story-prop buoy.
// - Bounded Maps capped by tuning.memoryCap; bounded cast (tuning.maxCast).
// - Nothing runs while docked; gates/wormholes excluded; the player is never the NPC.

import { makeShipEntitySpec } from '../ships.js';
import { spawnJettisonedCargoPod } from '../lootShards.js';
import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';
import { hash32 } from '../../core/rng.js';

export const STALLED_STRING_EVENT = 'plants:stalledString';

export const STALLED_STRING_TUNING = Object.freeze({
  plId: 'pl220',
  spawnChancePct: 55,
  maxCast: 2,                  // two commuter strangers, hard cap
  containers: 3,
  shoveImpulseMin: 50,         // one good shove
  clearRangeWu: 120,           // containers must end up beyond this from the beacon
  patienceS: 90,               // watch commuter patience die in real time
  thanksFlashes: 3,            // a hundred flashes of thanks, bounded to three pulses each
  thanksPulseSpacingS: 1,      // pulses spread over time, not fired in one burst
  flashDurationS: 1.0,
  podCommodityId: 'cmdty_ore_iron',
  podAmount: 1,
  podRadius: 6,
  strangerTtlS: 600,
  memoryCap: 16,
});

export const STALLED_STRING_BEACON_LABEL = 'Green beacon — stalled string';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure: has this container been cleared away from the beacon? */
export function isContainerClear(containerPos, beaconPos, clearRangeWu) {
  if (!containerPos || !beaconPos) return false;
  const dx = finite(containerPos.x) - finite(beaconPos.x);
  const dz = finite(containerPos.z) - finite(beaconPos.z);
  return Math.hypot(dx, dz) > finite(clearRangeWu);
}

export const stalledStringPlant = {
  name: 'plants220',

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
    const beacon = this._entity(enc.beaconId);
    if (!beacon) { this._endEncounter(enc); return; }

    // Commuters hold behind the string: brake-and-wait on a leased intent.
    for (const id of enc.commuterIds) {
      const commuter = this._entity(id);
      if (commuter && commuter.alive !== false) {
        requestTrafficReaction(this, commuter, {
          moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, brake: true,
        }, 2);
      }
    }

    if (!enc.resolved) {
      // One good shove happened? Check the whole string.
      let allClear = true;
      for (const id of enc.containerIds) {
        const pod = this._entity(id);
        if (!pod || pod.alive === false) continue; // destroyed by the shove counts as clear
        if (!isContainerClear(pod.pos, beacon.pos, STALLED_STRING_TUNING.clearRangeWu)) { allClear = false; break; }
      }
      if (allClear) this._resolved(enc, beacon, now);
      else if (now - enc.startedAt >= STALLED_STRING_TUNING.patienceS) this._patienceDied(enc, now);
    }
    // The thanks: one pulse of lamp flashes per spacing window until the count is spent,
    // then the meeting ends politely.
    const thanks = this._memory.get('thanks');
    if (thanks) {
      if (now >= thanks.nextAt) {
        this._thanksPulse(thanks.pulse, now);
        thanks.pulse += 1;
        thanks.nextAt = now + STALLED_STRING_TUNING.thanksPulseSpacingS;
        if (thanks.pulse >= STALLED_STRING_TUNING.thanksFlashes) {
          this._memory.delete('thanks');
          this._endEncounter(enc);
        }
      }
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
    while (this._memory.size >= STALLED_STRING_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _spawnBeacon(pos) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const ent = spawnEntity({
      type: 'beacon',
      pos: { x: pos.x, z: pos.z },
      vel: { x: 0, z: 0 },
      radius: 5,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      data: {
        parentType: 'story_prop',
        scanLabel: STALLED_STRING_BEACON_LABEL,
        storyPropKind: 'stalled_string_beacon',
        masslineTetherable: true,
      },
    });
    if (!ent || ent.id == null) return null;
    this._owned.set(ent.id, { kind: 'beacon', expiresAt: this._now() + STALLED_STRING_TUNING.strangerTtlS });
    return ent;
  },

  _spawnContainer(pos, beaconId) {
    if (typeof spawnJettisonedCargoPod !== 'function') return null;
    const ent = spawnJettisonedCargoPod(this.state, {
      commodityId: STALLED_STRING_TUNING.podCommodityId,
      amount: STALLED_STRING_TUNING.podAmount,
      radius: STALLED_STRING_TUNING.podRadius,
      pos: { x: pos.x, z: pos.z },
      vel: { x: 0, z: 0 },
      ownerId: beaconId,
      ownerName: 'LANE',
    }, this.helpers);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [STALLED_STRING_TUNING.plId]: { role: 'stalled_container' } };
    ent.data.masslineTetherable = true;
    this._owned.set(ent.id, { kind: 'container', expiresAt: this._now() + STALLED_STRING_TUNING.strangerTtlS });
    return ent;
  },

  _spawnCommuter(pos, index) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    // The cap bounds the commuter cast, not the whole encounter ledger (the beacon and the
    // containers are props, not commuters).
    let commuters = 0;
    for (const row of this._owned.values()) {
      if (row.kind === 'commuter') commuters += 1;
    }
    if (commuters >= STALLED_STRING_TUNING.maxCast) return null;
    const spec = makeShipEntitySpec('ship_kestrel', {
      team: 2, factionId: 'faction_free', pos: { x: pos.x, z: pos.z },
      ai: { archetype: 'commuter', passive: true },
    });
    const ent = spawnEntity(spec);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [STALLED_STRING_TUNING.plId]: { role: 'commuter', index } };
    ent.data.callsign = 'COMMUTER';
    this._owned.set(ent.id, { kind: 'commuter', expiresAt: this._now() + STALLED_STRING_TUNING.strangerTtlS });
    return ent;
  },

  _onSectorEnter(p) {
    this._reset('sector_enter');
    if (!this._flight()) return;
    const s = this.state;
    const sectorId = (p && p.sectorId) || (s.world && s.world.currentSectorId) || 's1';
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    if (hash32(seed, sectorId, 'pl220', 'spawn') % 100 >= STALLED_STRING_TUNING.spawnChancePct) return;
    const player = this._player();
    const base = player && player.pos ? player.pos : { x: 0, z: 0 };
    const beacon = this._spawnBeacon({ x: base.x + 300, z: base.z - 150 });
    if (!beacon) return;
    const containerIds = [];
    for (let i = 0; i < STALLED_STRING_TUNING.containers; i += 1) {
      const pod = this._spawnContainer({ x: base.x + 300 - 14 + i * 20, z: base.z - 128 }, beacon.id);
      if (pod) containerIds.push(pod.id);
    }
    if (containerIds.length !== STALLED_STRING_TUNING.containers) { this._despawnOwned(); return; }
    const commuterIds = [];
    for (let i = 0; i < 2; i += 1) {
      const commuter = this._spawnCommuter({ x: base.x + 300, z: base.z - 60 - i * 50 }, i);
      if (commuter) commuterIds.push(commuter.id);
    }
    this._capMemory();
    this._memory.set('enc', {
      beaconId: beacon.id,
      containerIds,
      commuterIds,
      startedAt: this._now(),
      resolved: false,
      lastShoveAt: null,
    });
  },

  // The intended verb: a thrown body lands a real shove on a container.
  _onImpact(p) {
    if (!this._flight() || !p) return;
    const enc = this._memory.get('enc');
    if (!enc || enc.resolved) return;
    const isContainer = (id) => enc.containerIds.includes(id);
    if (!isContainer(p.aId) && !isContainer(p.bId)) return;
    const playerId = this.state.playerId;
    const fromPlayer = p.aId === playerId || p.bId === playerId;
    if (!fromPlayer) return;
    if (finite(p.impulse, 0) < STALLED_STRING_TUNING.shoveImpulseMin) return;
    enc.lastShoveAt = this._now();
    this.bus.emit(STALLED_STRING_EVENT, { kind: 'shoved', impulse: finite(p.impulse), t: enc.lastShoveAt });
  },

  _resolved(enc, beacon, now) {
    enc.resolved = true;
    // A hundred flashes of thanks, honestly bounded: three pulses, spread over time.
    this._capMemory();
    this._memory.set('thanks', { pulse: 0, nextAt: now });
    this._cue('confirm', beacon.pos, 0.8, 1);
    this.bus.emit(STALLED_STRING_EVENT, { kind: 'cleared', containerIds: enc.containerIds, t: now });
  },

  /** One pulse of the thanks: every commuter flashes their lamps once more. */
  _thanksPulse(pulse, now) {
    const enc = this._memory.get('enc');
    if (!enc) return;
    for (const id of enc.commuterIds) {
      const commuter = this._entity(id);
      if (!commuter || commuter.alive === false) continue;
      commuter.data.lampsFlashing = true;
      commuter.data.lampFlashUntil = now + STALLED_STRING_TUNING.flashDurationS;
      this.bus.emit('plants:stalledStringFlash', { entityId: id, pulse, t: now });
    }
  },

  _patienceDied(enc, now) {
    enc.resolved = true;
    for (const id of enc.commuterIds) {
      releaseTrafficReaction(this, this._entity(id));
      this._remove(id);
    }
    this._cue('ui_deny', this._entity(enc.beaconId)?.pos, 0.9, 1);
    this.bus.emit(STALLED_STRING_EVENT, { kind: 'patience_died', t: now });
    this._endEncounter(enc);
  },

  _endEncounter(enc) {
    for (const id of enc.commuterIds) releaseTrafficReaction(this, this._entity(id));
    for (const id of [...enc.containerIds, enc.beaconId, ...enc.commuterIds]) this._remove(id);
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
      for (const id of enc.commuterIds) releaseTrafficReaction(this, this._entity(id));
    }
    this._despawnOwned();
    if (this._memory) this._memory.clear();
    if (this.bus && reason === 'sector_exit') {
      this.bus.emit(STALLED_STRING_EVENT, { kind: 'reset', reason, t: this._now() });
    }
  },

  _cue(id, pos, gain = 0.8, rate = 1) {
    this.bus.emit('audio:cue', { id, position: pos ? { x: pos.x, z: pos.z } : null, gain, rate });
  },
};
