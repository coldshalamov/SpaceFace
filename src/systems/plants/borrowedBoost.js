// PL-296 The borrowed boost — "A racer tucked behind you at a launch queue offers their
// slipstream for your departure, free, because someone gave them one once.
// Take the ride; or bump them at the gate — queues stop offering, and the racer is always
// in the next one"
//
// A chance meeting at the ordinary route's launch queue: the player idles near a transit
// gate below queue speed and a racer stranger spawns tucked astern. The offer is one line,
// free, no bill. Taking the ride is physical: while the racer holds the astern slot and the
// player departs (up to slip speed, moving away from the gate), the racer's slipstream adds
// a bounded impulse to the player's hull through the physics authority — once per visit,
// cooldown-gated. Bump them at the gate — a player-caused impact receipt on the racer at
// speed — and queues stop offering (a season stamp); the racer still shows up in the next
// queue, indifferent, and offers nothing.
//
// Invariants:
// - Deterministic: state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports. The racer holds the astern slot through the traffic reaction
//   lease (abort on refusal); the boost goes through queuePhysicsImpulse, never a vel write.
// - Physical: the boost is a real impulse; the bump is a real impact receipt.
// - No economy mutations. Bounded Maps capped by tuning.memoryCap; cooldowns; TTL despawns.
// - Nothing runs while docked; gates anchor the queue; the player is never the NPC.

import { makeShipEntitySpec } from '../ships.js';
import { queuePhysicsImpulse } from '../../core/physicsAuthority.js';
import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';
import { hash32 } from '../../core/rng.js';

export const BORROWED_BOOST_EVENT = 'plants:borrowedBoost';

export const BORROWED_BOOST_TUNING = Object.freeze({
  plId: 'pl296',
  spawnChancePct: 55,
  queueRangeWu: 300,           // near the gate mouth is the queue
  queueSpeedWu: 8,             // idling at the queue
  queueForS: 3,                // idle this long before the racer tucks in
  slipRangeWu: 90,             // the racer holds this far astern
  slipSpeedWu: 40,             // departing at this speed takes the ride
  slipWindowS: 1.5,            // the borrowed boost lasts this long
  slipImpulsePerSec: 85,       // slipstream push magnitude
  slipCooldownS: 30,           // one ride per visit
  bumpSpeedWu: 55,             // a player-caused closing speed at or above this is a bump
  grudgeSeasonS: 1200,         // "queues stop offering"
  strangerTtlS: 240,
  memoryCap: 8,
});

export const BORROWED_BOOST_CALLSIGN = 'QUEUE RACER';
export const BORROWED_BOOST_OFFER_LINE = 'Take it. Someone gave me one.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure: the slipstream push vector, along the player's heading. */
export function borrowedBoostImpulse(playerRot, magnitude) {
  const rot = finite(playerRot, 0);
  const mag = finite(magnitude, 0);
  return { x: Math.cos(rot) * mag, z: Math.sin(rot) * mag };
}

/** Pure: is this impact receipt a bump at the gate (player-caused, fast, on the racer)? */
export function isBumping(payload, racerId, playerId, tuning = BORROWED_BOOST_TUNING) {
  if (!payload || racerId == null || playerId == null) return false;
  const closing = finite(payload.preSolveClosingSpeed, 0);
  if (closing < tuning.bumpSpeedWu) return false;
  const hitByPlayer = payload.causalActorId === playerId
    && (payload.aId === racerId || payload.bId === racerId);
  return hitByPlayer;
}

export const borrowedBoostPlant = {
  name: 'plants296',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._owned = new Map();
    this._memory = new Map();
    this._queueTicks = 0;
    this._accum = 0;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:exit', () => this._reset('sector_exit'));
    on('save:loaded', () => this._reset('save_loaded'));
    on('game:new', () => this._reset('game_new'));
    on('game:newGame', () => this._reset('game_new_game'));
    on('physics:impact', (p) => this._onImpact(p));
    on('entity:killed', (p) => this._onKilled(p));
  },

  update(dt) {
    const s = this.state;
    if (!s || !this.bus) return;
    this._sweepExpired(finite(s.simTime, 0));
    if (!this._flight()) return;
    const player = this._player();
    if (!player || !player.pos) return;
    const now = finite(s.simTime, 0);
    const gate = this._nearestGate(player.pos);
    const atQueue = gate != null
      && this._dist(gate.pos, player.pos) <= BORROWED_BOOST_TUNING.queueRangeWu;

    this._accum += finite(dt, 0);
    if (this._accum >= 1) {
      this._accum = 0;
      this._watchQueue(atQueue, player, gate, now);
    }

    const enc = this._memory.get('enc');
    if (!enc) return;
    const racer = this._entity(enc.racerId);
    if (!racer || racer.alive === false) { this._memory.delete('enc'); return; }

    // Hold the astern slot through the reaction lease.
    const head = finite(player.rot, 0);
    const slot = {
      x: finite(player.pos.x) - Math.cos(head) * BORROWED_BOOST_TUNING.slipRangeWu,
      z: finite(player.pos.z) - Math.sin(head) * BORROWED_BOOST_TUNING.slipRangeWu,
    };
    const dx = slot.x - finite(racer.pos.x);
    const dz = slot.z - finite(racer.pos.z);
    const d = Math.hypot(dx, dz) || 1;
    const held = requestTrafficReaction(this, racer, {
      moveX: dx / d, moveZ: dz / d,
      boost: false, fire: false, fireGroup: null, aimAngle: head, brake: d < 20,
    }, 3);
    if (!held) releaseTrafficReaction(this, racer); // refused: abort

    // Take the ride: departing at speed with the racer astern lends their slipstream.
    const speed = Math.hypot(finite(player.vel && player.vel.x), finite(player.vel && player.vel.z));
    const astern = this._dist(racer.pos, player.pos) <= BORROWED_BOOST_TUNING.slipRangeWu * 1.6;
    if (enc.offered && !enc.grudge && speed >= BORROWED_BOOST_TUNING.slipSpeedWu && astern
        && (enc.lastSlipAt == null || now - enc.lastSlipAt >= BORROWED_BOOST_TUNING.slipCooldownS)) {
      enc.slipUntil = now + BORROWED_BOOST_TUNING.slipWindowS;
      enc.lastSlipAt = now;
      this.bus.emit(BORROWED_BOOST_EVENT, { kind: 'ride_started', racerId: enc.racerId, t: now });
    }
    if (enc.slipUntil != null) {
      if (now < enc.slipUntil) {
        const perTick = borrowedBoostImpulse(player.rot,
          BORROWED_BOOST_TUNING.slipImpulsePerSec * Math.max(dt, 1 / 60));
        const mass = finite(player.mass, 1) || 1;
        queuePhysicsImpulse(player, { x: perTick.x * mass, z: perTick.z * mass }, { tick: s.tick });
      } else if (!enc.rideDone) {
        enc.rideDone = true;
        this.bus.emit(BORROWED_BOOST_EVENT, { kind: 'ride_over', racerId: enc.racerId, t: now });
        // The racer is gone the moment the ride is theirs to give no longer.
        this._remove(enc.racerId);
        this._memory.delete('enc');
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
    while (this._memory.size >= BORROWED_BOOST_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _grudgeLive(now) {
    const grudge = this._memory.get('grudge');
    return !!(grudge && finite(grudge.until, 0) > now);
  },

  _watchQueue(atQueue, player, gate, now) {
    if (!atQueue) { this._queueTicks = 0; return; }
    const speed = Math.hypot(finite(player.vel && player.vel.x), finite(player.vel && player.vel.z));
    if (speed >= BORROWED_BOOST_TUNING.queueSpeedWu) { this._queueTicks = 0; return; }
    this._queueTicks += 1;
    if (this._queueTicks * 1 < BORROWED_BOOST_TUNING.queueForS) return;
    if (this._memory.get('enc') || this._owned.size >= 2) return;
    // Chance gate: a seeded slice of queue idles gets the racer.
    const s = this.state;
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    const sectorId = (s.world && s.world.currentSectorId) || 's1';
    if (hash32(seed, sectorId, BORROWED_BOOST_TUNING.plId, 'queue') % 100 >= BORROWED_BOOST_TUNING.spawnChancePct) return;
    // "queues stop offering": a bumped racer still shows up — and offers nothing.
    const grudge = this._grudgeLive(now);
    // "the racer is always in the next one": a fresh queue visit spawns them again.
    const gateKey = gate && gate.id != null ? gate.id : 'gate';
    this._capMemory();
    this._memory.set('enc', { gateKey, offered: false, grudge, slipUntil: null, lastSlipAt: null, rideDone: false });
    const racer = this._spawnRacer(player, grudge);
    if (!racer) { this._memory.delete('enc'); return; }
    this._memory.get('enc').racerId = racer.id;
    if (!grudge) {
      this._memory.get('enc').offered = true;
      this._say('comms', `plants:${BORROWED_BOOST_TUNING.plId}:offer:${now}`,
        BORROWED_BOOST_CALLSIGN, BORROWED_BOOST_OFFER_LINE, 6);
      this.bus.emit(BORROWED_BOOST_EVENT, { kind: 'offered', racerId: racer.id, t: now });
    } else {
      this.bus.emit(BORROWED_BOOST_EVENT, { kind: 'in_queue_no_offer', racerId: racer.id, t: now });
    }
    this._queueTicks = 0;
  },

  _spawnRacer(player, grudge) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const head = finite(player.rot, 0);
    const pos = {
      x: finite(player.pos.x) - Math.cos(head) * (BORROWED_BOOST_TUNING.slipRangeWu + 30),
      z: finite(player.pos.z) - Math.sin(head) * (BORROWED_BOOST_TUNING.slipRangeWu + 30),
    };
    const spec = makeShipEntitySpec('ship_wasp', {
      team: 2, factionId: 'faction_free', pos,
      ai: { archetype: 'racer', passive: true },
    });
    const ent = spawnEntity(spec);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [BORROWED_BOOST_TUNING.plId]: { role: 'racer', grudge } };
    ent.data.callsign = BORROWED_BOOST_CALLSIGN;
    this._owned.set(ent.id, { kind: 'racer', expiresAt: this._now() + BORROWED_BOOST_TUNING.strangerTtlS });
    return ent;
  },

  // Bump them at the gate: a fast player-caused impact on the racer.
  _onImpact(p) {
    if (!this._flight() || !p || !this.state) return;
    const enc = this._memory.get('enc');
    if (!enc || enc.racerId == null) return;
    if (!isBumping(p, enc.racerId, this.state.playerId)) return;
    const now = this._now();
    this._capMemory();
    this._memory.set('grudge', { until: now + BORROWED_BOOST_TUNING.grudgeSeasonS });
    enc.grudge = true;
    enc.offered = false;
    this._cue('warning', null, 0.6, 1);
    this.bus.emit(BORROWED_BOOST_EVENT, { kind: 'bumped', racerId: enc.racerId, until: now + BORROWED_BOOST_TUNING.grudgeSeasonS, t: now });
    this._remove(enc.racerId); // they peel off, indifferent
    this._memory.delete('enc');
  },

  _onKilled(p) {
    const enc = this._memory.get('enc');
    if (!enc || !p || p.id !== enc.racerId) return;
    this._memory.delete('enc');
    this.bus.emit(BORROWED_BOOST_EVENT, { kind: 'racer_dead', hullId: p.id, t: this._now() });
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
    if (enc && this._entity(enc.racerId) == null) this._memory.delete('enc');
    const grudge = this._memory.get('grudge');
    if (grudge && now >= grudge.until) this._memory.delete('grudge');
  },

  _despawnOwned() {
    if (this.helpers && typeof this.helpers.removeEntity === 'function') {
      for (const id of [...(this._owned ? this._owned.keys() : [])]) this.helpers.removeEntity(id);
    }
    if (this._owned) this._owned.clear();
  },

  _reset(reason) {
    this._despawnOwned();
    // The bump grudge rides across sector changes; a session boundary (save:loaded,
    // game:new, game:newGame) clears it and resets everything else.
    const sectoral = reason === 'sector_enter' || reason === 'sector_exit';
    const keep = sectoral && this._memory ? this._memory.get('grudge') : null;
    if (this._memory) this._memory.clear();
    if (keep) this._memory.set('grudge', keep);
    this._queueTicks = 0;
    if (this.bus && reason === 'sector_exit') {
      this.bus.emit(BORROWED_BOOST_EVENT, { kind: 'reset', reason, t: this._now() });
    }
  },

  _say(channel, id, sender, text, ttl) {
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({ channel, id, text, ttl });
    } else {
      this.bus.emit('voice:say', { channel, id, text, ttl });
    }
    this.bus.emit('comms:popup', { id, sender, category: 'traffic', text, ttl });
  },

  _cue(id, pos, gain = 0.8, rate = 1) {
    this.bus.emit('audio:cue', { id, position: pos ? { x: pos.x, z: pos.z } : null, gain, rate });
  },
};
