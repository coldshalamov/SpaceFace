// PL-131 The broken toll — "A raider with a dead gun holds up traffic with a hand-painted
// sign: TOLL. It is not going well for them. Pay for the story; fly through for free; or
// take a lame ship apart, and hear about it on every dock that week"
//
// A seeded chance meeting: a lame raider stranger spawns beside a hand-painted TOLL sign
// (a story-prop buoy with the scan label). The player can:
// - pay for the story: the real receipt is their docking toll — the next dock:range at a
//   station whose services include 'toll' (the same profile _runDockedCustomsPost charges
//   against) resolves the meeting as paid,
// - fly through free: cross the toll line at speed without interacting (the raider cannot
//   stop anyone and everyone knows it),
// - take the lame ship apart: a player kill stamps a week of dock gossip — the next
//   dock:range approaches each hear one gossip line, up to gossipMax.
//
// Invariants:
// - Deterministic: state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports. The raider is spawned passive and is never steered except
//   through the traffic reaction lease (idle drift only).
// - Physical: the sign is a real story-prop buoy (type 'beacon', huge mass, hull 1,
//   masslineTetherable).
// - Bounded Maps capped by tuning.memoryCap; cooldowns on gossip per dock.
// - Nothing runs while docked; gates/wormholes excluded from anchors; the player is never
//   treated as an NPC.

import { makeShipEntitySpec } from '../ships.js';
import { spawnJettisonedCargoPod } from '../lootShards.js';
import { stationInfo } from '../../economy/stationMarketProfile.js';
import { hash32 } from '../../core/rng.js';

export const BROKEN_TOLL_EVENT = 'plants:brokenToll';
export const BROKEN_TOLL_GOSSIP_EVENT = 'plants:brokenTollGossip';

export const BROKEN_TOLL_TUNING = Object.freeze({
  plId: 'pl131',
  spawnChancePct: 50,
  hailRangeWu: 200,            // raider's plea distance
  payRangeWu: 60,              // a player pod left within this of the raider pays
  passRangeWu: 140,            // crossing the toll line within this counts as passing
  passSpeedWu: 60,             // fast enough that it is "flying through"
  gossipWindowS: 600,          // one sector-day week, mirrors DAY_SECONDS contract
  gossipMax: 3,                // hear about it on every dock that week (bounded)
  gossipCooldownS: 30,
  pleaCooldownS: 45,
  podCommodityId: 'cmdty_ore_iron',
  podAmount: 1,
  podRadius: 5,
  strangerTtlS: 600,
  memoryCap: 16,
});

export const BROKEN_TOLL_CALLSIGN = 'TOLL RAIDER';
export const BROKEN_TOLL_SIGN_LABEL = 'TOLL — hand-painted';
export const BROKEN_TOLL_PLEA = 'Toll. Please. It is painted.';
export const BROKEN_TOLL_GOSSIP_LINE = 'They are still telling the toll story.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure crossing predicate: inside the toll corridor at speed. */
export function isFlyingThrough(distWu, speedWu, tuning = BROKEN_TOLL_TUNING) {
  return Number.isFinite(distWu) && Number.isFinite(speedWu)
    && distWu <= tuning.passRangeWu && speedWu >= tuning.passSpeedWu;
}

export const brokenTollPlant = {
  modes: ['flight'],
  name: 'plants131',

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
    const raider = this._entity(enc.raiderId);
    const player = this._player();
    if (!raider || raider.alive === false || !player) return;
    const dist = this._dist(raider.pos, player.pos);

    // Their plea, once per cooldown while you are near: it is not going well for them.
    if (dist <= BROKEN_TOLL_TUNING.hailRangeWu
        && (enc.lastPleaAt == null || now - enc.lastPleaAt >= BROKEN_TOLL_TUNING.pleaCooldownS)) {
      enc.lastPleaAt = now;
      this._comms(`plants:${BROKEN_TOLL_TUNING.plId}:plea:${now}`, BROKEN_TOLL_CALLSIGN, BROKEN_TOLL_PLEA, 5);
      this._cue('sfx_vent_chime', raider.pos, 0.5, 1);
      this.bus.emit(BROKEN_TOLL_EVENT, { kind: 'plea', raiderId: enc.raiderId, t: now });
    }

    // Fly through for free: fast crossing past the lame raider.
    const speed = Math.hypot(finite(player.vel && player.vel.x), finite(player.vel && player.vel.z));
    if (!enc.paid && !enc.passedFree && isFlyingThrough(dist, speed)) {
      enc.passedFree = true;
      this.bus.emit(BROKEN_TOLL_EVENT, { kind: 'passed_free', raiderId: enc.raiderId, speed: Math.round(speed), t: now });
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
    while (this._memory.size >= BROKEN_TOLL_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _spawnRaider(pos) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const spec = makeShipEntitySpec('ship_wasp', {
      team: 2, factionId: 'faction_free', pos: { x: pos.x, z: pos.z },
      ai: { archetype: 'pirate', passive: true },
    });
    const ent = spawnEntity(spec);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [BROKEN_TOLL_TUNING.plId]: { role: 'lame_raider', gunDead: true } };
    ent.data.callsign = BROKEN_TOLL_CALLSIGN;
    this._owned.set(ent.id, { kind: 'raider', expiresAt: this._now() + BROKEN_TOLL_TUNING.strangerTtlS });
    return ent;
  },

  _spawnSign(pos) {
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
        scanLabel: BROKEN_TOLL_SIGN_LABEL,
        storyPropKind: 'toll_sign',
        masslineTetherable: true,
      },
    });
    if (!ent || ent.id == null) return null;
    this._owned.set(ent.id, { kind: 'sign', expiresAt: this._now() + BROKEN_TOLL_TUNING.strangerTtlS });
    return ent;
  },

  _onSectorEnter(p) {
    this._reset('sector_enter');
    if (!this._flight()) return;
    const s = this.state;
    const sectorId = (p && p.sectorId) || (s.world && s.world.currentSectorId) || 's1';
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    if (hash32(seed, sectorId, 'pl131', 'spawn') % 100 >= BROKEN_TOLL_TUNING.spawnChancePct) return;
    const player = this._player();
    const base = player && player.pos ? player.pos : { x: 0, z: 0 };
    const raider = this._spawnRaider({ x: base.x + 300, z: base.z + 40 });
    if (!raider) return;
    const sign = this._spawnSign({ x: base.x + 300, z: base.z + 16 });
    this._capMemory();
    this._memory.set('enc', {
      raiderId: raider.id,
      signId: sign ? sign.id : null,
      lastPleaAt: null,
      paid: false,
      passedFree: false,
    });
  },

  // Pay for the story: the real receipt is the player's docking toll — arriving in range
  // of a station whose services include 'toll' (the profile the customs post charges
  // against) resolves the meeting as paid.
  _onDockRange(p) {
    if (!this._flight() || !p || p.inRange !== true) return;
    const now = this._now();
    const enc = this._memory.get('enc');
    if (enc && !enc.paid) {
      const info = stationInfo(this.state, p.stationId);
      const tolls = !!(info && Array.isArray(info.services) && info.services.includes('toll'));
      if (tolls) {
        enc.paid = true;
        this._cue('confirm', null, 0.8, 1);
        this._comms(`plants:${BROKEN_TOLL_TUNING.plId}:paid:${now}`, BROKEN_TOLL_CALLSIGN,
          'Toll paid. Fair passage.', 5);
        this.bus.emit(BROKEN_TOLL_EVENT, { kind: 'paid', raiderId: enc.raiderId, stationId: p.stationId, t: now });
      }
    }
    const gossip = this._memory.get('gossip');
    if (!gossip) return;
    if (now >= gossip.until || gossip.heard >= BROKEN_TOLL_TUNING.gossipMax) return;
    if (gossip.lastAt != null && now - gossip.lastAt < BROKEN_TOLL_TUNING.gossipCooldownS) return;
    gossip.lastAt = now;
    gossip.heard += 1;
    this._comms(`plants:${BROKEN_TOLL_TUNING.plId}:gossip:${now}`, 'DOCK GOSSIP', BROKEN_TOLL_GOSSIP_LINE, 6);
    this.bus.emit(BROKEN_TOLL_GOSSIP_EVENT, { stationId: p.stationId, heard: gossip.heard, t: now });
  },

  // entity:killed receipt: the lame raider dies. Only the player taking the toll into
  // their own hands (killing it) spreads the gossip; anyone else's kill is quiet news.
  _onKilled(p) {
    if (!this._flight() || !p) return;
    const enc = this._memory.get('enc');
    if (!enc || p.id !== enc.raiderId) return;
    const now = this._now();
    const byPlayer = p.killerId === this.state.playerId;
    this._memory.delete('enc');
    if (!byPlayer) {
      this.bus.emit(BROKEN_TOLL_EVENT, { kind: 'raider_dead', byPlayer: false, t: now });
      return;
    }
    // Take a lame ship apart: a week of dock gossip.
    this._capMemory();
    this._memory.set('gossip', { until: now + BROKEN_TOLL_TUNING.gossipWindowS, heard: 0, lastAt: null });
    this.bus.emit(BROKEN_TOLL_EVENT, { kind: 'taken_apart', raiderId: p.id, t: now });
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
      this.bus.emit(BROKEN_TOLL_EVENT, { kind: 'reset', reason, t: this._now() });
    }
  },

  _comms(id, sender, text, ttl) {
    this.bus.emit('comms:popup', { id, sender, category: 'traffic', text, ttl });
  },

  _cue(id, pos, gain = 0.8, rate = 1) {
    this.bus.emit('audio:cue', { id, position: pos ? { x: pos.x, z: pos.z } : null, gain, rate });
  },
};
