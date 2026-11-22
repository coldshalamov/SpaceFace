// PL-158 The chased thief — "A laden skiff cuts across your bow with two angry haulers behind
// it. Line the thief and take a finder's cut; or block the haulers — *'Obliged.'* — a crate
// tips your way, and Concord asks about it later"
//
// A seeded chance meeting: a laden skiff stranger cuts across the player's bow while two
// angry haulers chase it. Two choices:
// - Line the thief: a massline snap-catch onto the skiff ends the chase — the finder's cut
//   is one real pod dropped by the thief, then everyone despawns politely.
// - Block the haulers: hold position between the hauler lead and the thief for blockHoldS —
//   the thief says the authored line *'Obliged.'* and tips a crate; a Concord stamp asks
//   about it at the next dock approach (one comms line) inside the ask window.
//
// Invariants:
// - Deterministic: state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports. The thief's crossing and the haulers' pursuit fly through
//   the traffic reaction lease each sweep (single intent writer per hull).
// - Physical: the cut and the crate are real jettisoned cargo pods (persistent,
//   physicsBody mass, masslineTetherable).
// - Bounded Maps capped by tuning.memoryCap; bounded cast (thief + 2 haulers, tuning.maxCast).
// - Nothing runs while docked; gates/wormholes excluded; the player is never the NPC.

import { makeShipEntitySpec } from '../ships.js';
import { spawnJettisonedCargoPod } from '../lootShards.js';
import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';
import { hash32 } from '../../core/rng.js';

export const CHASED_THIEF_EVENT = 'plants:chasedThief';
export const CHASED_THIEF_CONCORD_EVENT = 'plants:chasedThiefConcord';

export const CHASED_THIEF_TUNING = Object.freeze({
  plId: 'pl158',
  spawnChancePct: 50,
  maxCast: 3,                  // thief + two haulers, hard cap on spawned strangers
  chaseDurationS: 60,          // the pursuit gives up after this long
  blockRangeWu: 140,           // stand between hauler lead and thief inside this
  blockHoldS: 4,
  finderCutPods: 1,
  cratePods: 1,
  concordAskWindowS: 600,      // Concord asks about it later
  podCommodityId: 'cmdty_ore_platinoid',
  podAmount: 1,
  podRadius: 5,
  strangerTtlS: 600,
  memoryCap: 16,
});

export const CHASED_THIEF_OBLIGED = 'Obliged.';
export const CHASED_THIEF_CONCORD_LINE = 'Concord asked about that crate.';
export const CHASED_THIEF_CALLSIGN = 'SKIFF';
export const CHASED_THIEF_HAULER_CALLSIGN = 'ANGRY HAULER';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure midpoint helper for the blocking geometry. */
export function midpointOf(a, b) {
  if (!a || !b) return null;
  return { x: (finite(a.x) + finite(b.x)) / 2, z: (finite(a.z) + finite(b.z)) / 2 };
}

export const chasedThiefPlant = {
  modes: ['flight'],
  name: 'plants158',

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
    const thief = this._entity(enc.thiefId);
    const leadHauler = this._entity(enc.haulerIds[0]);
    const player = this._player();
    if (!thief || thief.alive === false || !player || !player.pos) {
      this._endChase(enc, now);
      return;
    }

    if (now - enc.startedAt >= CHASED_THIEF_TUNING.chaseDurationS) {
      this._endChase(enc, now);
      return;
    }

    // The thief cuts across the player's bow on a leased intent.
    const across = Math.atan2(
      finite(player.pos.z) + 120 - finite(thief.pos.z),
      finite(player.pos.x) - 40 - finite(thief.pos.x),
    );
    requestTrafficReaction(this, thief, {
      moveX: 0, moveZ: 1, boost: true, fire: false, fireGroup: null, aimAngle: across, brake: false,
    }, 2);

    // The angry haulers chase the thief on leased intents.
    if (leadHauler && leadHauler.alive !== false) {
      const toThief = Math.atan2(
        finite(thief.pos.z) - finite(leadHauler.pos.z),
        finite(thief.pos.x) - finite(leadHauler.pos.x),
      );
      for (const id of enc.haulerIds) {
        const hauler = this._entity(id);
        if (hauler && hauler.alive !== false) {
          requestTrafficReaction(this, hauler, {
            moveX: 0, moveZ: 1, boost: true, fire: false, fireGroup: null, aimAngle: toThief, brake: false,
          }, 2);
        }
      }
      // Blocking: hold the middle of the hauler->thief line.
      this._stepBlock(enc, thief, leadHauler, player, now);
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
    while (this._memory.size >= CHASED_THIEF_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _spawnShip(defId, pos, role, callsign, extra = {}) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function' || this._owned.size >= CHASED_THIEF_TUNING.maxCast) return null;
    const spec = makeShipEntitySpec(defId, {
      team: 2, factionId: 'faction_free', pos: { x: pos.x, z: pos.z },
      ai: { archetype: role === 'thief' ? 'courier' : 'hauler', passive: true },
    });
    const ent = spawnEntity(spec);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [CHASED_THIEF_TUNING.plId]: { role, ...extra } };
    ent.data.callsign = callsign;
    this._owned.set(ent.id, { kind: role, expiresAt: this._now() + CHASED_THIEF_TUNING.strangerTtlS });
    return ent;
  },

  _spawnPod(pos, ownerId, role) {
    if (typeof spawnJettisonedCargoPod !== 'function') return null;
    const ent = spawnJettisonedCargoPod(this.state, {
      commodityId: CHASED_THIEF_TUNING.podCommodityId,
      amount: CHASED_THIEF_TUNING.podAmount,
      radius: CHASED_THIEF_TUNING.podRadius,
      pos: { x: pos.x, z: pos.z },
      vel: { x: 8, z: 6 },
      ownerId,
      ownerName: CHASED_THIEF_CALLSIGN,
    }, this.helpers);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [CHASED_THIEF_TUNING.plId]: { role } };
    ent.data.masslineTetherable = true;
    this._owned.delete(ent.id); // the cut/crate is the player's keep
    return ent;
  },

  _onSectorEnter(p) {
    this._reset('sector_enter');
    if (!this._flight()) return;
    const s = this.state;
    const sectorId = (p && p.sectorId) || (s.world && s.world.currentSectorId) || 's1';
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    if (hash32(seed, sectorId, 'pl158', 'spawn') % 100 >= CHASED_THIEF_TUNING.spawnChancePct) return;
    const player = this._player();
    const base = player && player.pos ? player.pos : { x: 0, z: 0 };
    const thief = this._spawnShip('ship_drifter', { x: base.x + 160, z: base.z - 260 }, 'thief', CHASED_THIEF_CALLSIGN, { laden: true });
    if (!thief) return;
    thief.data.loaded = true; // laden
    const haulerIds = [];
    for (let i = 0; i < 2; i += 1) {
      const hauler = this._spawnShip('ship_mule', { x: base.x + 100 + i * 60, z: base.z - 400 }, 'hauler', CHASED_THIEF_HAULER_CALLSIGN);
      if (hauler) haulerIds.push(hauler.id);
    }
    if (haulerIds.length !== 2) { this._despawnOwned(); return; }
    this._capMemory();
    this._memory.set('enc', {
      thiefId: thief.id,
      haulerIds,
      startedAt: this._now(),
      blockStartAt: null,
      resolved: false,
    });
  },

  _onSnapCatch(p) {
    if (!this._flight() || !p) return;
    const enc = this._memory.get('enc');
    if (!enc || enc.resolved) return;
    if (p.targetId !== enc.thiefId) return;
    // Line the thief: the chase ends, the finder's cut tips.
    enc.resolved = true;
    const now = this._now();
    const thief = this._entity(enc.thiefId);
    const player = this._player();
    if (thief) releaseTrafficReaction(this, thief);
    const pod = this._spawnPod(
      player && player.pos ? { x: player.pos.x + 28, z: player.pos.z } : thief.pos,
      enc.thiefId,
      'finder_cut',
    );
    this._cue('confirm', player ? player.pos : null, 0.8, 1);
    this.bus.emit(CHASED_THIEF_EVENT, { kind: 'lined', thiefId: enc.thiefId, podId: pod ? pod.id : null, t: now });
    this._endChase(enc, now);
  },

  _stepBlock(enc, thief, leadHauler, player, now) {
    const mid = midpointOf(thief.pos, leadHauler.pos);
    if (!mid) return;
    const inBlock = this._dist(player.pos, mid) <= CHASED_THIEF_TUNING.blockRangeWu;
    if (!inBlock) {
      if (enc.blockStartAt != null) {
        enc.blockStartAt = null;
        this.bus.emit(CHASED_THIEF_EVENT, { kind: 'block_broken', t: now });
      }
      return;
    }
    if (enc.blockStartAt == null) {
      enc.blockStartAt = now;
      return;
    }
    if (now - enc.blockStartAt >= CHASED_THIEF_TUNING.blockHoldS && !enc.resolved) {
      // Block the haulers: the thief's authored line and a crate tips your way.
      enc.resolved = true;
      this._say('bark', `plants:${CHASED_THIEF_TUNING.plId}:obliged:${now}`, CHASED_THIEF_OBLIGED, 5);
      const pod = this._spawnPod({ x: player.pos.x + 26, z: player.pos.z + 8 }, enc.thiefId, 'crate');
      this._cue('confirm', player.pos, 0.8, 1);
      this._capMemory();
      this._memory.set('concord', { until: now + CHASED_THIEF_TUNING.concordAskWindowS, asked: false });
      this.bus.emit(CHASED_THIEF_EVENT, { kind: 'blocked', thiefId: enc.thiefId, podId: pod ? pod.id : null, t: now });
      this._endChase(enc, now);
    }
  },

  _endChase(enc, now) {
    for (const id of [enc.thiefId, ...enc.haulerIds]) {
      releaseTrafficReaction(this, this._entity(id));
      this._remove(id);
    }
    this._memory.delete('enc');
  },

  _onDockRange(p) {
    if (!this._flight() || !p || p.inRange !== true) return;
    const concord = this._memory.get('concord');
    if (!concord || concord.asked) return;
    const now = this._now();
    if (now >= concord.until) { this._memory.delete('concord'); return; }
    concord.asked = true;
    this._comms(`plants:${CHASED_THIEF_TUNING.plId}:concord:${now}`, 'CONCORD', CHASED_THIEF_CONCORD_LINE, 7);
    this.bus.emit(CHASED_THIEF_CONCORD_EVENT, { stationId: p.stationId, t: now });
  },

  _remove(id) {
    if (id == null) return;
    this._owned.delete(id);
    if (this.helpers && typeof this.helpers.removeEntity === 'function') this.helpers.removeEntity(id);
  },

  _sweepExpired(now) {
    const concord = this._memory.get('concord');
    if (concord && now >= concord.until) this._memory.delete('concord');
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
      for (const id of [enc.thiefId, ...enc.haulerIds]) releaseTrafficReaction(this, this._entity(id));
    }
    this._despawnOwned();
    if (this._memory) this._memory.clear();
    if (this.bus && reason === 'sector_exit') {
      this.bus.emit(CHASED_THIEF_EVENT, { kind: 'reset', reason, t: this._now() });
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
