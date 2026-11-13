// PL-109 His own fault — "A hotshot boosts past you, clips your wing and tumbles off ahead:
// *'My boost. My fault.'* Tow them upright for a trade; or strip the wreck while they watch,
// and be held at the next gate on the strength of their radio"
//
// A seeded chance meeting: a hotshot stranger spawns ahead of the player flying fast. The
// real physics:impact between the player and the hotshot is the clip. The hotshot tumbles
// (barks its one authored line, drops spilled pods). Tow = a massline snap-catch onto the
// hotshot held for towHoldS while it stays in range: it tips a pod as the trade. Stripping
// = collecting the spilled pods while the hotshot watches: its radio holds the player at
// the next gate they come near inside the window.
//
// Invariants:
// - Deterministic: state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports. NPC movement (the boost past and the tumble-off) goes through
//   the traffic reaction lease (requestTrafficReaction), never a second intent writer; the
//   gate pull-in nudges the player once through queuePhysicsImpulse — no direct vel writes.
// - Physical: spilled pods are real jettisoned cargo pods (persistent, physicsBody mass,
//   masslineTetherable); the clip is a real physics:impact receipt.
// - Bounded Maps capped by tuning.memoryCap; cooldowns on bark/hold/gate events.
// - Nothing runs while docked; gates/wormholes excluded; the player is never the NPC.

import { makeShipEntitySpec } from '../ships.js';
import { spawnJettisonedCargoPod } from '../lootShards.js';
import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';
import { queuePhysicsImpulse } from '../../core/physicsAuthority.js';
import { hash32 } from '../../core/rng.js';

export const OWN_FAULT_EVENT = 'plants:ownFault';
export const OWN_FAULT_TRADE_EVENT = 'plants:ownFaultTrade';
export const OWN_FAULT_HELD_EVENT = 'plants:ownFaultHeldAtGate';

export const OWN_FAULT_TUNING = Object.freeze({
  plId: 'pl109',
  spawnChancePct: 60,
  clipImpulseMin: 20,          // real impact impulse needed for a clip
  tumbleIntentS: 6,            // hotshot tumbles ahead on a leased intent
  spillPods: 2,                // pods spilled by the tumble
  towHoldS: 4,                 // hold the tow tether this long for the trade
  towRangeWu: 220,             // max distance while holding the tow
  watchRangeWu: 260,           // the hotshot sees pods stripped inside this range
  gateRadioRangeWu: 420,       // "held at the next gate" proximity
  gatePullDvWuPerS: 40,        // the pull-in nudge toward the gate (bounded, one per hold)
  gateHoldCooldownS: 90,       // one hold sequence per gate visit
  stripWindowS: 600,           // how long the radio can hold the player after a strip
  podCommodityId: 'cmdty_ore_platinoid',
  podAmount: 1,
  podRadius: 5,
  strangerTtlS: 600,
  memoryCap: 16,
});

export const OWN_FAULT_BARK = 'My boost. My fault.';
export const OWN_FAULT_CALLSIGN = 'HOTSHOT';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure verdict: what the encounter resolves to given the tallies. */
export function ownFaultVerdict({ towSeconds = 0, strippedPods = 0, open = true }, tuning = OWN_FAULT_TUNING) {
  if (!open) return 'closed';
  if (strippedPods > 0) return 'stripped';
  if (Number(towSeconds) >= tuning.towHoldS) return 'traded';
  return 'open';
}

export const ownFaultPlant = {
  name: 'plants109',

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
    on('pickup:collected', (p) => this._onPickupCollected(p));
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
    this._stepTow(now);
    this._stepGateRadio(now);
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
    while (this._memory.size >= OWN_FAULT_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _stamp(ent, fields) {
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [OWN_FAULT_TUNING.plId]: fields };
  },

  _spawnHotshot(pos) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const spec = makeShipEntitySpec('ship_wasp', {
      team: 2, factionId: 'faction_free', pos: { x: pos.x, z: pos.z },
      ai: { archetype: 'courier', passive: true },
    });
    const ent = spawnEntity(spec);
    if (!ent || ent.id == null) return null;
    this._stamp(ent, { role: 'hotshot', clipped: false });
    ent.data.callsign = OWN_FAULT_CALLSIGN;
    this._owned.set(ent.id, { kind: 'hotshot', expiresAt: this._now() + OWN_FAULT_TUNING.strangerTtlS });
    return ent;
  },

  _spawnPod(pos, ownerId, role) {
    if (typeof spawnJettisonedCargoPod !== 'function') return null;
    const ent = spawnJettisonedCargoPod(this.state, {
      commodityId: OWN_FAULT_TUNING.podCommodityId,
      amount: OWN_FAULT_TUNING.podAmount,
      radius: OWN_FAULT_TUNING.podRadius,
      pos: { x: pos.x, z: pos.z },
      vel: { x: 0, z: 0 },
      ownerId,
      ownerName: OWN_FAULT_CALLSIGN,
    }, this.helpers);
    if (!ent || ent.id == null) return null;
    this._stamp(ent, { role });
    ent.data.masslineTetherable = true;
    this._owned.set(ent.id, { kind: role, expiresAt: this._now() + OWN_FAULT_TUNING.strangerTtlS });
    return ent;
  },

  _onSectorEnter(p) {
    this._reset('sector_enter');
    if (!this._flight()) return;
    const s = this.state;
    const sectorId = (p && p.sectorId) || (s.world && s.world.currentSectorId) || 's1';
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    if (hash32(seed, sectorId, 'pl109', 'spawn') % 100 >= OWN_FAULT_TUNING.spawnChancePct) return;
    const player = this._player();
    const base = player && player.pos ? player.pos : { x: 0, z: 0 };
    const hotshot = this._spawnHotshot({ x: base.x + 260, z: base.z - 140 });
    if (!hotshot) return;
    // The boost past: the hotshot arrives already boosting along its heading on a leased
    // intent — it does not sit passive waiting to be clipped.
    const boostLeaseS = 4;
    if (requestTrafficReaction(this, hotshot, {
      moveX: 0, moveZ: 1, boost: true, fire: false, fireGroup: null, aimAngle: finite(hotshot.rot, 0), brake: false,
    }, boostLeaseS)) {
      this._capMemory();
      this._memory.set('tumbleEntityId', hotshot.id);
      this._memory.set('tumbleUntil', this._now() + boostLeaseS);
    }
    this._capMemory();
    this._memory.set('enc', {
      hotshotId: hotshot.id,
      clipped: false,
      spilledPodIds: [],
      strippedPodIds: [],
      towStartAt: null,
      traded: false,
    });
  },

  // The clip is a real physics receipt: player <-> hotshot with real impulse.
  _onImpact(p) {
    if (!this._flight() || !p) return;
    const enc = this._memory.get('enc');
    if (!enc || enc.clipped) return;
    const a = this._entity(p.aId);
    const b = this._entity(p.bId);
    const playerId = this.state.playerId;
    const hotshot = this._entity(enc.hotshotId);
    if (!hotshot || !a || !b) return;
    const touches = (id) => id === playerId;
    const isHotshot = (id) => id === enc.hotshotId;
    if (!((touches(p.aId) && isHotshot(p.bId)) || (touches(p.bId) && isHotshot(p.aId)))) return;
    if (finite(p.impulse, 0) < OWN_FAULT_TUNING.clipImpulseMin) return;
    enc.clipped = true;
    const now = this._now();
    hotshot.data.lampsFlashing = true;
    hotshot.data.lampFlashUntil = now + 1.5;
    this._say('bark', `plants:${OWN_FAULT_TUNING.plId}:bark`, OWN_FAULT_BARK, 5);
    this.bus.emit(OWN_FAULT_EVENT, { kind: 'clipped', hotshotId: enc.hotshotId, impulse: finite(p.impulse), t: now });
    // Tumble off ahead: one leased intent, then the hull glides.
    const requested = requestTrafficReaction(this, hotshot, {
      moveX: 0, moveZ: 1, boost: true, fire: false, fireGroup: null, aimAngle: hotshot.rot || 0, brake: false,
    }, OWN_FAULT_TUNING.tumbleIntentS);
    if (requested) {
      this._memory.set('tumbleUntil', now + OWN_FAULT_TUNING.tumbleIntentS);
      this._memory.set('tumbleEntityId', enc.hotshotId);
    }
    for (let i = 0; i < OWN_FAULT_TUNING.spillPods; i += 1) {
      const pod = this._spawnPod({ x: hotshot.pos.x + 14 + i * 16, z: hotshot.pos.z + 10 }, enc.hotshotId, 'spill');
      if (pod) enc.spilledPodIds.push(pod.id);
    }
  },

  _onSnapCatch(p) {
    if (!this._flight() || !p) return;
    const enc = this._memory.get('enc');
    if (!enc || enc.clipped === false || enc.traded) return;
    if (p.targetId !== enc.hotshotId) return;
    const now = this._now();
    enc.towStartAt = now;
    this.bus.emit(OWN_FAULT_EVENT, { kind: 'tow_attached', hotshotId: enc.hotshotId, t: now });
  },

  _stepTow(now) {
    const enc = this._memory.get('enc');
    if (!enc || enc.towStartAt == null || enc.traded) return;
    const hotshot = this._entity(enc.hotshotId);
    const player = this._player();
    if (!hotshot || !player) { enc.towStartAt = null; return; }
    const dist = this._dist(hotshot.pos, player.pos);
    if (dist > OWN_FAULT_TUNING.towRangeWu) {
      enc.towStartAt = null;
      this.bus.emit(OWN_FAULT_EVENT, { kind: 'tow_dropped', hotshotId: enc.hotshotId, t: now });
      return;
    }
    if (now - enc.towStartAt >= OWN_FAULT_TUNING.towHoldS) {
      enc.traded = true;
      releaseTrafficReaction(this, hotshot);
      const pod = this._spawnPod({ x: player.pos.x + 26, z: player.pos.z + 12 }, enc.hotshotId, 'trade');
      this._cue('confirm', player.pos, 0.8, 1);
      this.bus.emit(OWN_FAULT_TRADE_EVENT, { hotshotId: enc.hotshotId, podId: pod ? pod.id : null, t: now });
    }
  },

  _onPickupCollected(p) {
    if (!this._flight() || !p || p.collectorId !== this.state.playerId) return;
    const enc = this._memory.get('enc');
    if (!enc) return;
    if (!enc.spilledPodIds.includes(p.pickupId)) return;
    const now = this._now();
    const hotshot = this._entity(enc.hotshotId);
    const watching = hotshot && this._dist(hotshot.pos, p.pos) <= OWN_FAULT_TUNING.watchRangeWu;
    enc.strippedPodIds.push(p.pickupId);
    this._owned.delete(p.pickupId);
    const verdict = ownFaultVerdict({ towSeconds: 0, strippedPods: enc.strippedPodIds.length, open: true });
    if (verdict === 'stripped' && watching) {
      this.bus.emit(OWN_FAULT_EVENT, { kind: 'stripped_watched', hotshotId: enc.hotshotId, t: now });
      this._capMemory();
      this._memory.set('radioHold', { until: now + OWN_FAULT_TUNING.stripWindowS, lastGateHoldAt: null });
    }
  },

  // The hotshot's radio holds the player at the next gate they come near — with teeth:
  // a pull-in beat nudges the player's hull toward the gate once (a real impulse through
  // the physics authority), then the line.
  _stepGateRadio(now) {
    const hold = this._memory.get('radioHold');
    if (!hold || now >= hold.until) return;
    if (hold.lastGateHoldAt != null && now - hold.lastGateHoldAt < OWN_FAULT_TUNING.gateHoldCooldownS) return;
    const player = this._player();
    if (!player || !player.pos) return;
    // Bounded scan: real gates carry data.isGate.
    const s = this.state;
    let gate = null;
    if (s.entityIndex && Array.isArray(s.entityIndex.stations)) {
      for (const st of s.entityIndex.stations) {
        const d = st && st.data;
        if (!st || st.alive === false || !d || d.isGate !== true || d.isWormhole === true) continue;
        if (this._dist(st.pos, player.pos) <= OWN_FAULT_TUNING.gateRadioRangeWu) { gate = st; break; }
      }
    }
    if (!gate) return;
    hold.lastGateHoldAt = now;
    // The pull-in nudge: one bounded impulse toward the gate (dv gatePullDvWuPerS), queued
    // through the physics authority — never a direct vel write.
    const dx = finite(gate.pos.x) - finite(player.pos.x);
    const dz = finite(gate.pos.z) - finite(player.pos.z);
    const dist = Math.hypot(dx, dz) || 1;
    const mass = finite(player.mass, 1) || 1;
    const dv = OWN_FAULT_TUNING.gatePullDvWuPerS;
    if (typeof queuePhysicsImpulse === 'function') {
      queuePhysicsImpulse(player, { x: (dx / dist) * dv * mass, z: (dz / dist) * dv * mass }, { tick: s.tick });
    }
    this._cue('warning', gate.pos, 0.9, 1);
    this._comms(`plants:${OWN_FAULT_TUNING.plId}:gate:${now}`, OWN_FAULT_CALLSIGN,
      'Gate control: hold position, pilot.', 6);
    this.bus.emit(OWN_FAULT_HELD_EVENT, { gateId: gate.id, t: now });
  },

  _onKilled(p) {
    const enc = this._memory.get('enc');
    if (!enc || !p || p.id !== enc.hotshotId) return;
    releaseTrafficReaction(this, this._entity(enc.hotshotId));
    this._memory.delete('enc');
    this.bus.emit(OWN_FAULT_EVENT, { kind: 'hotshot_dead', hotshotId: p.id, t: this._now() });
  },

  _remove(id) {
    if (id == null) return;
    this._owned.delete(id);
    if (this.helpers && typeof this.helpers.removeEntity === 'function') this.helpers.removeEntity(id);
  },

  _sweepExpired(now) {
    const enc = this._memory.get('enc');
    if (enc) {
      const hotshot = this._entity(enc.hotshotId);
      if (hotshot && hotshot.alive === false) this._memory.delete('enc');
    }
    const tumbleEntityId = this._memory.get('tumbleEntityId');
    const tumbleUntil = this._memory.get('tumbleUntil');
    if (tumbleEntityId != null && Number.isFinite(tumbleUntil) && now >= tumbleUntil) {
      releaseTrafficReaction(this, this._entity(tumbleEntityId));
      this._memory.delete('tumbleEntityId');
      this._memory.delete('tumbleUntil');
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

  _reset(reason) {
    for (const id of [...(this._owned ? this._owned.keys() : [])]) {
      releaseTrafficReaction(this, this._entity(id));
    }
    this._despawnOwned();
    if (this._memory) this._memory.clear();
    if (this.bus && reason === 'sector_exit') {
      this.bus.emit(OWN_FAULT_EVENT, { kind: 'reset', reason, t: this._now() });
    }
  },

  _say(channel, id, text, ttl) {
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({ channel, id, text, ttl });
      return;
    }
    this.bus.emit('voice:say', { channel, id, text, ttl });
  },

  _comms(id, sender, text, ttl) {
    this.bus.emit('comms:popup', { id, sender, category: 'traffic', text, ttl });
  },

  _cue(id, pos, gain = 0.8, rate = 1) {
    this.bus.emit('audio:cue', { id, position: pos ? { x: pos.x, z: pos.z } : null, gain, rate });
  },
};
