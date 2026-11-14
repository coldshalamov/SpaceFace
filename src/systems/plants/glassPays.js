// PL-140 Glass pays — "Calve a shard on the Pulse and Mr. Glass buys it off your rope on
// the spot. Miss the pulse and it is glitter — he buys glitter by the handful, cheap."
// What the player can do: "Calve big; calve wrong; or ring a shard off the rift wall and
// hear 'Don't.'"
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; the Pulse is a seeded phase of a fixed
//   period (hash32(seed, sector, salt)); no Math.random/Date.now; no Three.js/DOM.
// - All state on `this` (session-only); bounded per-key cooldowns (tuning.memoryCap).
// - Anchors sector_haumea_rift / poi_haumea_fissure (the fracture mouth) with
//   station_haumea_rift as fallback — read from live entities; this module spawns no
//   props, it pays and speaks only.
// - Payment goes through the economy event seam (economy:grantCredits), never a direct
//   wallet write. The rift-wall ring is judged from real physics:impact receipts.

import { hash32 } from '../../core/rng.js';

export const PLANTS_GLASS_EVENT = 'plants:glassPays';

export const GLASS_TUNING = Object.freeze({
  plId: 'pl140',
  sectorId: 'sector_haumea_rift',
  stationId: 'station_haumea_rift',
  poiId: 'poi_haumea_fissure',
  pulsePeriodS: 45,
  pulseWindowS: 8,
  pulseRangeWu: 800,        // the Pulse's reach around the fracture mouth
  shardPriceCr: 38,
  glitterCr: 4,
  ringImpulseMin: 260,      // a real ring: an impact at least this hard
  cooldownS: 8,             // per impact pair / per shard
  memoryCap: 8,             // cooldown ledger entries
});

/** Pure: is `simTime` inside the Pulse? */
export function pulseOpen(simTime, phase, periodS = GLASS_TUNING.pulsePeriodS, windowS = GLASS_TUNING.pulseWindowS) {
  const t = Number.isFinite(simTime) ? simTime : 0;
  const m = ((t - phase) % periodS + periodS) % periodS;
  return m < windowS;
}

/** Pure: the Pulse's seeded phase for a sector. */
export function pulsePhase(seed, sectorId, salt = 'pl140-pulse') {
  const h = Number.isFinite(hash32(seed, sectorId, salt)) ? hash32(seed, sectorId, salt) : 0;
  return h % GLASS_TUNING.pulsePeriodS;
}

/** Pure: a shard is crystal or ice cargo. */
export function isShardCommodity(commodityId) {
  return typeof commodityId === 'string' && /crystal|ice|lumin/i.test(commodityId);
}

export const glassPaysPlant = {
  name: 'plants140',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._cooldowns = new Map();   // key -> simTime (bounded)
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('pickup:collected', (p) => this._onCollected(p));
    on('physics:impact', (p) => this._onImpact(p));
    // game:newGame: the cooldown ledger holds absolute simTimes — with simTime back near
    // zero, `now - last` goes negative and collect/ring keys stay blocked early in the run.
    on('game:newGame', () => this._cooldowns.clear());
  },

  update() { /* event-driven; the Pulse is read at judgment time */ },

  destroy() {
    if (!this._unsubs) { this.state = null; this.bus = null; return; }
    for (const off of this._unsubs) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._cooldowns = new Map();
     this.state = null;
    this.bus = null;
  },

  // ---- internals ----

  _anchor() {
    const s = this.state;
    const list = Array.isArray(s.entityList) ? s.entityList : [];
    for (const e of list) {
      if (e && e.alive !== false && e.data && e.data.poiId === GLASS_TUNING.poiId) return e;
    }
    if (s.entities && typeof s.entities.values === 'function') {
      for (const e of s.entities.values()) {
        if (e && e.alive !== false && e.data && e.data.poiId === GLASS_TUNING.poiId) return e;
      }
    }
    const idx = s.entityIndex && Array.isArray(s.entityIndex.stations) ? s.entityIndex.stations : null;
    const lists = [idx, Array.isArray(s.entityList) ? s.entityList : null];
    for (const l of lists) {
      if (!l) continue;
      for (const e of l) {
        if (e && e.type === 'station' && e.alive !== false && e.data && e.data.stationId === GLASS_TUNING.stationId) return e;
      }
    }
    return null;
  },

  _cooldownOk(key, now) {
    const last = this._cooldowns.get(key);
    if (Number.isFinite(last) && now - last < GLASS_TUNING.cooldownS) return false;
    if (this._cooldowns.size >= GLASS_TUNING.memoryCap) {
      const oldest = this._cooldowns.keys().next().value;
      this._cooldowns.delete(oldest);
    }
    this._cooldowns.set(key, now);
    return true;
  },

  _onCollected(p) {
    const s = this.state;
    if (!s || !this.bus || !p) return;
    if ((s.world && s.world.currentSectorId) !== GLASS_TUNING.sectorId) return;
    if (s && s.mode && s.mode !== 'flight') return;
    const commodityId = p.commodityId || (p.payload && p.payload.commodityId);
    if (!isShardCommodity(commodityId)) return;
    const anchor = this._anchor();
    if (!anchor) return;
    const player = s.entities && s.entities.get(s.playerId);
    const pos = player && player.pos ? player.pos : null;
    if (!pos || Math.hypot(pos.x - anchor.pos.x, pos.z - anchor.pos.z) > GLASS_TUNING.pulseRangeWu) return;
    const now = Number.isFinite(s.simTime) ? s.simTime : 0;
    if (!this._cooldownOk(`collect:${commodityId}`, now)) return;
    const phase = pulsePhase(s.meta && s.meta.seed, GLASS_TUNING.sectorId);
    if (pulseOpen(now, phase)) {
      // Calved on the Pulse: bought off your rope on the spot.
      this.bus.emit('economy:grantCredits', { amount: GLASS_TUNING.shardPriceCr, reason: 'plants:pl140:shard' });
      this._say(`plants:pl140:bought:${Math.floor(now)}`, 'Paid. Straight off your rope.', 6);
      this.bus.emit('audio:cue', { id: 'confirm', position: pos, gain: 0.8, rate: 1.1 });
      this.bus.emit(PLANTS_GLASS_EVENT, { kind: 'bought', amountCr: GLASS_TUNING.shardPriceCr, commodityId, t: now });
    } else {
      // Missed the pulse: glitter, by the handful, cheap.
      this.bus.emit('economy:grantCredits', { amount: GLASS_TUNING.glitterCr, reason: 'plants:pl140:glitter' });
      this._say(`plants:pl140:glitter:${Math.floor(now)}`, 'Glitter. A handful\u2019s worth.', 6);
      this.bus.emit('audio:cue', { id: 'confirm', position: pos, gain: 0.4, rate: 0.8 });
      this.bus.emit(PLANTS_GLASS_EVENT, { kind: 'glitter', amountCr: GLASS_TUNING.glitterCr, commodityId, t: now });
    }
  },

  _onImpact(p) {
    const s = this.state;
    if (!s || !this.bus || !p) return;
    if ((s.world && s.world.currentSectorId) !== GLASS_TUNING.sectorId) return;
    if (s && s.mode && s.mode !== 'flight') return;
    const aId = p.aId != null ? p.aId : p.entityId;
    const bId = p.bId != null ? p.bId : p.otherId;
    if (aId == null || bId == null) return;
    const a = s.entities && s.entities.get(aId);
    const b = s.entities && s.entities.get(bId);
    if (!a || !b) return;
    const shard = isShardCommodity(a.data && a.data.commodityId) ? a : (isShardCommodity(b.data && b.data.commodityId) ? b : null);
    const wall = !shard || shard === a ? b : a;
    if (!shard) return;
    if (wall.type !== 'asteroid' && wall.type !== 'station' && wall.type !== 'wreck') return;
    const anchor = this._anchor();
    if (!anchor || !shard.pos) return;
    if (Math.hypot(shard.pos.x - anchor.pos.x, shard.pos.z - anchor.pos.z) > GLASS_TUNING.pulseRangeWu) return;
    const impulse = Number(p.impulseMag != null ? p.impulseMag : p.impulse);
    if (!Number.isFinite(impulse) || impulse < GLASS_TUNING.ringImpulseMin) return;
    const now = Number.isFinite(s.simTime) ? s.simTime : 0;
    if (!this._cooldownOk(`ring:${aId}:${bId}`, now)) return;
    this._say(`plants:pl140:dont:${Math.floor(now)}`, "Don't.", 5);
    this.bus.emit('audio:cue', { id: 'warning', position: shard.pos, gain: 0.7, rate: 1.3 });
    this.bus.emit(PLANTS_GLASS_EVENT, { kind: 'dont', impulse, t: now });
  },

  _say(id, text, ttl) {
    if (!this.bus) return;
    this.bus.emit('comms:popup', { id, sender: 'MR. GLASS', category: 'traffic', text, ttl, persist: false });
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({ channel: 'comms', id, text, ttl, key: GLASS_TUNING.plId });
    }
  },
};
