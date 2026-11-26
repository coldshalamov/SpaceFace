// PL-303 The spare bed — "Dock broken at a tiny outpost late at night and an off-duty worker
// offers their own berth, takes the couch, will not hear a no.
// Sleep and say so at the counter; or strip the berth's fittings — outpost berths lock to
// your hull, all of them"
//
// A chance meeting on the ordinary route: dock:range at a tiny outpost (profile size 'S')
// late at night (the day window's night watch, DAY_SECONDS = 600) with your hull broken.
// The offer happens to you — the worker will not hear a no: one line, and a real berth kit
// (two labeled pads) appears on the apron beside your hull.
//
// - Sleep and say so at the counter: park in the berth zone at rest speed through the rest
//   window — staying is the saying. The outpost thanks you at the counter, stamps the hull
//   kindly (restedUntil: future offers here skip the night check), and the kit is collected
//   politely.
// - Strip the berth's fittings: scooping a berth pad before the rest completes is theft with
//   hospitality. Outpost berths lock to YOUR hull, all of them: for a long season this
//   module still detects the meeting at every outpost, but the offer never comes for you.
//
// Invariants:
// - Deterministic: state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports; the worker is a real hull idling at the outpost apron.
// - Physical: the berth is a real labeled pad pair in a real zone; the strip is a real scoop.
// - No economy mutations: rest costs nothing and grants nothing but comms and stamps.
// - Bounded Maps capped by tuning.memoryCap; caps: one meeting, one kit; TTL despawns;
//   nothing runs while docked (dock:range is only the seam); the player is never the NPC.

import { makeShipEntitySpec } from '../ships.js';
import { stationInfo } from '../../economy/stationMarketProfile.js';
import { hash32 } from '../../core/rng.js';

export const SPARE_BED_EVENT = 'plants:spareBed';

export const SPARE_BED_TUNING = Object.freeze({
  plId: 'pl303',
  spawnChancePct: 65,
  nightStartDayT: 420,         // DAY_SECONDS = 600: the night watch is [420, 600)
  daySeconds: 600,
  brokenHullPct: 0.45,         // "dock broken"
  berthRangeWu: 80,            // the apron berth zone around the worker
  restSpeedWu: 3,              // parked is asleep
  restWindowS: 10,             // sleep this long to have slept
  restedSeasonS: 1800,         // the outpost is kind to you afterward
  lockedSeasonS: 3600,         // "berths lock to your hull, all of them"
  padTtlS: 240,
  memoryCap: 8,
});

export const SPARE_BED_WORKER_CALLSIGN = 'OFF-DUTY WORKER';
export const SPARE_BED_OFFER_LINE = 'Berth is yours. Couch is fine.';
export const SPARE_BED_RESTED_LINE = 'Counter says thanks. Fly rested.';
export const SPARE_BED_LOCKED_LINE = 'Berths locked. Your hull.';
export const SPARE_BED_PAD_LABEL = 'OFF-DUTY BERTH';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure: the dayT fraction and the night-watch check. */
export function isNightWatch(simTime, tuning = SPARE_BED_TUNING) {
  const t = finite(simTime, 0);
  const dayT = ((t % finite(tuning.daySeconds, 600)) + finite(tuning.daySeconds, 600)) % finite(tuning.daySeconds, 600);
  return { dayT, night: dayT >= tuning.nightStartDayT };
}

/** Pure: is this hull broken enough for the offer? */
export function isBrokenHull(entity, tuning = SPARE_BED_TUNING) {
  const hullMax = finite(entity && entity.hullMax, 0);
  if (hullMax <= 0) return false;
  return finite(entity && entity.hull, 0) / hullMax < tuning.brokenHullPct;
}

/** Pure: is this station a tiny outpost (profile size 'S')? */
export function isTinyOutpost(info) {
  return !!(info && info.size === 'S' && info.type !== 'blackmarket');
}

export const spareBedPlant = {
  modes: ['flight'],
  name: 'plants303',

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
    on('sector:exit', () => this._reset('sector_exit'));
    on('save:loaded', () => this._reset('save_loaded'));
    on('game:new', () => this._reset('game_new'));
    on('game:newGame', () => this._reset('game_new_game'));
    on('dock:range', (p) => this._onDockRange(p));
    on('pickup:collected', (p) => this._onPickupCollected(p));
    on('entity:killed', (p) => this._onKilled(p));
  },

  update(dt) {
    const s = this.state;
    if (!s || !this.bus) return;
    this._sweepExpired(finite(s.simTime, 0));
    if (!this._flight()) return;
    this._accum += finite(dt, 0);
    if (this._accum < 1) return;
    this._accum = 0;
    const now = finite(s.simTime, 0);
    const enc = this._memory.get('enc');
    if (!enc) return;
    const worker = this._entity(enc.workerId);
    const player = this._player();
    if (!worker || worker.alive === false) { this._memory.delete('enc'); return; }
    if (!player || !player.pos) return;

    // Sleeping: park in the berth zone at rest speed through the rest window.
    const inBerth = this._dist(worker.pos, player.pos) <= SPARE_BED_TUNING.berthRangeWu;
    const speed = Math.hypot(finite(player.vel && player.vel.x), finite(player.vel && player.vel.z));
    if (inBerth && speed <= SPARE_BED_TUNING.restSpeedWu) enc.restTicks = (enc.restTicks || 0) + 1;
    else enc.restTicks = Math.max(0, (enc.restTicks || 0) - 1);

    if (!enc.rested && (enc.restTicks || 0) >= Math.max(2, Math.floor(SPARE_BED_TUNING.restWindowS))) {
      enc.rested = true;
      // Say so at the counter: the outpost's thanks, and the kind stamp.
      this._say(`plants:${SPARE_BED_TUNING.plId}:rested:${now}`,
        SPARE_BED_WORKER_CALLSIGN, SPARE_BED_RESTED_LINE, 6);
      this._capMemory();
      this._memory.set('rested', { until: now + SPARE_BED_TUNING.restedSeasonS });
      // The kit is collected politely; the worker turns back to their couch.
      for (const padId of enc.padIds || []) this._remove(padId);
      enc.padIds = [];
      worker.data.lampsFlashing = true;
      worker.data.lampFlashUntil = now + 1.2;
      this._cue('confirm', worker.pos, 0.7, 1);
      this.bus.emit(SPARE_BED_EVENT, { kind: 'rested', workerId: enc.workerId, t: now });
      this._endMeeting('rested');
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
    while (this._memory.size >= SPARE_BED_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _lockedForYou(now) {
    const row = this._memory.get('lockedForYou');
    return !!(row && finite(row.until, 0) > now);
  },

  _restedLive(now) {
    const row = this._memory.get('rested');
    return !!(row && finite(row.until, 0) > now);
  },

  _onDockRange(p) {
    if (!this._flight() || !p || p.inRange !== true) return;
    const s = this.state;
    const now = this._now();
    if (this._memory.get('enc')) return;
    const info = stationInfo(s, p.stationId);
    if (!isTinyOutpost(info)) return;
    const player = this._player();
    if (!player) return;
    if (!isBrokenHull(player)) return;
    const rested = this._restedLive(now);
    if (!rested) {
      const { night } = isNightWatch(s.simTime);
      if (!night) return;
    }
    // Chance gate on the meeting.
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    const sectorId = (s.world && s.world.currentSectorId) || 's1';
    if (hash32(seed, sectorId, SPARE_BED_TUNING.plId, 'night') % 100 >= SPARE_BED_TUNING.spawnChancePct) return;
    if (this._lockedForYou(now)) {
      // "outpost berths lock to your hull, all of them": one line, ever, then silence.
      if (!this._memory.get('lockSaid')) {
        this._capMemory();
        this._memory.set('lockSaid', { at: now });
        this._say(`plants:${SPARE_BED_TUNING.plId}:locked:${now}`,
          SPARE_BED_WORKER_CALLSIGN, SPARE_BED_LOCKED_LINE, 6);
      }
      this.bus.emit(SPARE_BED_EVENT, { kind: 'locked_out', stationId: p.stationId, t: now });
      return;
    }
    // The worker idles at the apron beside your hull, and the offer happens to you.
    const apron = this._apronPoint(player.pos);
    const worker = this._spawnWorker(apron);
    if (!worker) return;
    const padIds = [];
    for (let i = 0; i < 2; i++) {
      const pad = this._spawnBerthPad({
        x: finite(apron.x) + 14 + i * 16,
        z: finite(apron.z) + 12,
      });
      if (pad) padIds.push(pad.id);
    }
    this._capMemory();
    this._memory.set('enc', {
      workerId: worker.id,
      stationId: p.stationId,
      padIds,
      restTicks: 0,
      rested: false,
    });
    this._say(`plants:${SPARE_BED_TUNING.plId}:offer:${now}`,
      SPARE_BED_WORKER_CALLSIGN, SPARE_BED_OFFER_LINE, 7);
    this.bus.emit(SPARE_BED_EVENT, { kind: 'offered', workerId: worker.id, stationId: p.stationId, t: now });
  },

  _apronPoint(playerPos) {
    // The berth sits a hull's length off your parked position.
    return { x: finite(playerPos.x) + 40, z: finite(playerPos.z) + 24 };
  },

  _spawnWorker(pos) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const spec = makeShipEntitySpec('ship_drifter', {
      team: 2, factionId: 'faction_free', pos: { x: pos.x, z: pos.z },
      ai: { archetype: 'offduty', passive: true },
    });
    const ent = spawnEntity(spec);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [SPARE_BED_TUNING.plId]: { role: 'off_duty_worker' } };
    ent.data.callsign = SPARE_BED_WORKER_CALLSIGN;
    this._owned.set(ent.id, { kind: 'worker', expiresAt: this._now() + SPARE_BED_TUNING.padTtlS });
    return ent;
  },

  _spawnBerthPad(pos) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const ent = spawnEntity({
      type: 'pickup',
      team: 0,
      pos: { x: pos.x, z: pos.z },
      vel: { x: 0, z: 0 },
      rot: 0,
      radius: 6,
      mass: 1,
      collides: true,
      data: {
        kind: 'berth_pad',
        amount: 1,
        playerCollectOnly: true,
        swarmFloorPad: { label: SPARE_BED_PAD_LABEL },
      },
    });
    if (!ent || ent.id == null) return null;
    this._owned.set(ent.id, { kind: 'berth_pad', expiresAt: this._now() + SPARE_BED_TUNING.padTtlS });
    return ent;
  },

  // Strip the berth's fittings: scooping a pad before the rest completes.
  _onPickupCollected(p) {
    if (!this._flight() || !p) return;
    const enc = this._memory.get('enc');
    if (!enc || enc.rested) return;
    const padId = p.pickupId != null ? p.pickupId : null;
    if (padId == null || !(enc.padIds || []).includes(padId)) return;
    const now = this._now();
    this._capMemory();
    this._memory.set('lockedForYou', { until: now + SPARE_BED_TUNING.lockedSeasonS });
    this._capMemory();
    this._memory.set('lockSaid', { at: now });
    this._say(`plants:${SPARE_BED_TUNING.plId}:locked:${now}`,
      SPARE_BED_WORKER_CALLSIGN, SPARE_BED_LOCKED_LINE, 6);
    this._cue('ui_deny', null, 0.6, 1);
    this._endMeeting('stripped');
    this.bus.emit(SPARE_BED_EVENT, {
      kind: 'berth_stripped', padId, until: now + SPARE_BED_TUNING.lockedSeasonS, t: now,
    });
  },

  _onKilled(p) {
    const enc = this._memory.get('enc');
    if (!enc || !p || p.id !== enc.workerId) return;
    this._memory.delete('enc');
    this.bus.emit(SPARE_BED_EVENT, { kind: 'worker_gone', hullId: p.id, t: this._now() });
  },

  _endMeeting(reason) {
    const enc = this._memory.get('enc');
    if (!enc) return;
    this._memory.delete('enc');
    for (const padId of enc.padIds || []) this._remove(padId);
    if (enc.workerId != null) this._remove(enc.workerId);
    this.bus.emit(SPARE_BED_EVENT, { kind: 'meeting_over', reason, t: this._now() });
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
    if (enc && this._entity(enc.workerId) == null) this._memory.delete('enc');
    for (const key of ['lockedForYou', 'rested']) {
      const row = this._memory.get(key);
      if (row && now >= finite(row.until, 0)) this._memory.delete(key);
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
    // The hull-level stamps (locked berths, said-once line, rested kindness) ride across
    // sectors: "outpost berths lock to your hull, all of them". A session boundary
    // (save:loaded, game:new, game:newGame) unlocks the hull and clears every stamp.
    const sectoral = reason === 'sector_enter' || reason === 'sector_exit';
    const keeps = sectoral && this._memory
      ? ['lockedForYou', 'lockSaid', 'rested'].map((k) => [k, this._memory.get(k)]).filter(([, v]) => v)
      : [];
    if (this._memory) this._memory.clear();
    for (const [k, v] of keeps) this._memory.set(k, v);
    if (this.bus && reason === 'sector_exit') {
      this.bus.emit(SPARE_BED_EVENT, { kind: 'reset', reason, t: this._now() });
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

  _cue(id, pos, gain = 0.8, rate = 1) {
    this.bus.emit('audio:cue', { id, position: pos ? { x: pos.x, z: pos.z } : null, gain, rate });
  },
};
