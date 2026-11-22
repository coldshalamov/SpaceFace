// PL-132 The dark stretch — "A lone hauler with one lamp hails you to fly beside them through
// the dark. At the far end: *'Didn't feel so far.'* — and a unit of cargo, tipped. Fly the
// stretch; or peel off whenever — they make it, this time"
//
// A seeded chance meeting: a lone hauler stranger waits at the dark end of a beacon-marked
// stretch. Approaching the hauler triggers its invitation hail (procedural, one line).
// Staying inside escort range from invitation until the hauler reaches the far beacon is
// "flying the stretch": the hauler says the authored far-end line and tips one real cargo
// pod toward the player. Leaving escort range mid-stretch is "peeling off": no reward and
// no grudge — the hauler flies on alone and still makes the far end.
//
// Invariants:
// - Deterministic: state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports. The hauler's walk down the stretch is flown through the
//   traffic reaction lease (single intent writer), re-armed each sweep.
// - Physical: the stretch ends are real story-prop beacons; the tip is a real jettisoned
//   cargo pod (persistent, physicsBody mass, masslineTetherable).
// - Bounded Maps capped by tuning.memoryCap; one invitation per encounter.
// - Nothing runs while docked; gates/wormholes excluded; the player is never the NPC.

import { makeShipEntitySpec } from '../ships.js';
import { spawnJettisonedCargoPod } from '../lootShards.js';
import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';
import { hash32 } from '../../core/rng.js';

export const DARK_STRETCH_EVENT = 'plants:darkStretch';

export const DARK_STRETCH_TUNING = Object.freeze({
  plId: 'pl132',
  spawnChancePct: 55,
  stretchLenWu: 900,           // start beacon to far beacon
  hailRangeWu: 160,            // invitation distance at the dark end
  escortRangeWu: 220,          // "fly beside them" tolerance
  arriveRangeWu: 90,           // hauler reaches the far beacon
  walkSpeedWu: 30,             // leased pace down the stretch
  tipPods: 1,                  // a unit of cargo, tipped
  podCommodityId: 'cmdty_ice_water',
  podAmount: 1,
  podRadius: 5,
  strangerTtlS: 900,
  memoryCap: 16,
});

export const DARK_STRETCH_HAIL = 'Fly beside me through the dark?';
export const DARK_STRETCH_FAR_LINE = "Didn't feel so far.";
export const DARK_STRETCH_CALLSIGN = 'LONE HAULER';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure: is the player still flying the stretch beside the hauler? */
export function isEscorting(distWu, tuning = DARK_STRETCH_TUNING) {
  return Number.isFinite(distWu) && distWu <= tuning.escortRangeWu;
}

export const darkStretchPlant = {
  modes: ['flight'],
  name: 'plants132',

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
    if (!hauler || hauler.alive === false) return;

    const startBeacon = this._entity(enc.startBeaconId);
    const farBeacon = this._entity(enc.farBeaconId);
    if (!startBeacon || !farBeacon) return;

    // Invitation once the player is near the dark end.
    if (!enc.invited) {
      const dist = this._dist(hauler.pos, player?.pos);
      if (dist <= DARK_STRETCH_TUNING.hailRangeWu) {
        enc.invited = true;
        enc.invitedAt = now;
        this._comms(`plants:${DARK_STRETCH_TUNING.plId}:invite:${now}`, DARK_STRETCH_CALLSIGN, DARK_STRETCH_HAIL, 6);
        this.bus.emit(DARK_STRETCH_EVENT, { kind: 'invited', haulerId: enc.haulerId, t: now });
      }
      return;
    }

    // The hauler walks the stretch toward the far beacon on a leased intent.
    const toFar = Math.atan2(
      finite(farBeacon.pos.z) - finite(hauler.pos.z),
      finite(farBeacon.pos.x) - finite(hauler.pos.x),
    );
    requestTrafficReaction(this, hauler, {
      moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: toFar, brake: false,
    }, 2);

    // Escort bookkeeping: the player either stays beside or peels off, whenever.
    const arrived = this._dist(hauler.pos, farBeacon.pos) <= DARK_STRETCH_TUNING.arriveRangeWu;
    if (!enc.abandoned) {
      const dist = this._dist(hauler.pos, player?.pos);
      if (!isEscorting(dist)) {
        enc.abandoned = true;
        this.bus.emit(DARK_STRETCH_EVENT, { kind: 'peeled_off', haulerId: enc.haulerId, t: now });
      }
    }
    if (arrived) this._arrive(enc, hauler, now);
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
    while (this._memory.size >= DARK_STRETCH_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _spawnBeacon(pos, scanLabel) {
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
        scanLabel,
        storyPropKind: 'dark_stretch_beacon',
        masslineTetherable: true,
      },
    });
    if (!ent || ent.id == null) return null;
    this._owned.set(ent.id, { kind: 'beacon', expiresAt: this._now() + DARK_STRETCH_TUNING.strangerTtlS });
    return ent;
  },

  _spawnHauler(pos) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const spec = makeShipEntitySpec('ship_mule', {
      team: 2, factionId: 'faction_free', pos: { x: pos.x, z: pos.z },
      ai: { archetype: 'hauler', passive: true },
    });
    const ent = spawnEntity(spec);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [DARK_STRETCH_TUNING.plId]: { role: 'lone_hauler', singleLamp: true } };
    ent.data.callsign = DARK_STRETCH_CALLSIGN;
    ent.data.lampsFlashing = true; // the one lamp
    ent.data.lampFlashUntil = this._now() + DARK_STRETCH_TUNING.strangerTtlS;
    this._owned.set(ent.id, { kind: 'hauler', expiresAt: this._now() + DARK_STRETCH_TUNING.strangerTtlS });
    return ent;
  },

  _spawnTip(pos, ownerId) {
    if (typeof spawnJettisonedCargoPod !== 'function') return null;
    const ent = spawnJettisonedCargoPod(this.state, {
      commodityId: DARK_STRETCH_TUNING.podCommodityId,
      amount: DARK_STRETCH_TUNING.tipPods,
      radius: DARK_STRETCH_TUNING.podRadius,
      pos: { x: pos.x, z: pos.z },
      vel: { x: 8, z: 4 },
      ownerId,
      ownerName: DARK_STRETCH_CALLSIGN,
    }, this.helpers);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [DARK_STRETCH_TUNING.plId]: { role: 'tip' } };
    ent.data.masslineTetherable = true;
    // The tip is the player's keep: it does not despawn with the encounter.
    this._owned.delete(ent.id);
    return ent;
  },

  _onSectorEnter(p) {
    this._reset('sector_enter');
    if (!this._flight()) return;
    const s = this.state;
    const sectorId = (p && p.sectorId) || (s.world && s.world.currentSectorId) || 's1';
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    if (hash32(seed, sectorId, 'pl132', 'spawn') % 100 >= DARK_STRETCH_TUNING.spawnChancePct) return;
    const player = this._player();
    const base = player && player.pos ? player.pos : { x: 0, z: 0 };
    const startX = base.x + 500;
    const startZ = base.z + 100;
    const startBeacon = this._spawnBeacon({ x: startX, z: startZ }, 'Dark stretch — dark end');
    const farBeacon = this._spawnBeacon({ x: startX, z: startZ - DARK_STRETCH_TUNING.stretchLenWu }, 'Dark stretch — far end');
    const hauler = this._spawnHauler({ x: startX, z: startZ - 30 });
    if (!hauler || !startBeacon || !farBeacon) {
      this._despawnOwned();
      return;
    }
    this._capMemory();
    this._memory.set('enc', {
      haulerId: hauler.id,
      startBeaconId: startBeacon.id,
      farBeaconId: farBeacon.id,
      invited: false,
      invitedAt: null,
      abandoned: false,
      arrived: false,
    });
  },

  _arrive(enc, hauler, now) {
    if (enc.arrived) return;
    enc.arrived = true;
    releaseTrafficReaction(this, hauler);
    if (!enc.abandoned) {
      // Fly the stretch: the authored far-end line and a unit of cargo, tipped.
      this._say('bark', `plants:${DARK_STRETCH_TUNING.plId}:far:${now}`, DARK_STRETCH_FAR_LINE, 5);
      const player = this._player();
      const pod = this._spawnTip(
        player && player.pos ? { x: player.pos.x + 30, z: player.pos.z + 10 } : { x: hauler.pos.x + 30, z: hauler.pos.z + 10 },
        enc.haulerId,
      );
      this._cue('confirm', hauler.pos, 0.8, 1);
      this.bus.emit(DARK_STRETCH_EVENT, { kind: 'flown', haulerId: enc.haulerId, podId: pod ? pod.id : null, t: now });
    } else {
      // Peeled off whenever — they make it, this time. No reward, no grudge.
      this.bus.emit(DARK_STRETCH_EVENT, { kind: 'made_it_alone', haulerId: enc.haulerId, t: now });
    }
    this._memory.delete('enc');
  },

  _onKilled(p) {
    const enc = this._memory.get('enc');
    if (!enc || !p || p.id !== enc.haulerId) return;
    releaseTrafficReaction(this, this._entity(enc.haulerId));
    this._memory.delete('enc');
    this.bus.emit(DARK_STRETCH_EVENT, { kind: 'hauler_dead', haulerId: p.id, t: this._now() });
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
    for (const id of [...(this._owned ? this._owned.keys() : [])]) {
      releaseTrafficReaction(this, this._entity(id));
    }
    this._despawnOwned();
    if (this._memory) this._memory.clear();
    if (this.bus && reason === 'sector_exit') {
      this.bus.emit(DARK_STRETCH_EVENT, { kind: 'reset', reason, t: this._now() });
    }
  },

  _comms(id, sender, text, ttl) {
    this.bus.emit('comms:popup', { id, sender, category: 'traffic', text, ttl });
  },

  _say(channel, id, text, ttl) {
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({ channel, id, text, ttl });
      return;
    }
    this.bus.emit('voice:say', { channel, id, text, ttl });
  },

  _cue(id, pos, gain = 0.8, rate = 1) {
    this.bus.emit('audio:cue', { id, position: pos ? { x: pos.x, z: pos.z } : null, gain, rate });
  },
};
