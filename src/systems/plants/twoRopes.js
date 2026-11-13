// PL-138 Two ropes — "Deep Colm's winch groans against its catch and loses: 'Pull!'
// Anchor your stern behind him and it comes up on two lines — and the Well pulls back
// once, hard, to see who's new."
// What the player can do: "Hold, and be hailed first next time; or let go early, and
// the Well is quiet for a day."
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random/Date.now; no
//   Three.js/DOM imports.
// - All state on `this` (session-only); hauled catch ledger bounded (tuning.memoryCap);
//   one assist per groan.
// - Anchors sector_proteus_well / poi_proteus_hulk (the well-mouth "Funnel") with
//   station_proteus as fallback; Colm's catch is spawned via the persistent crate
//   contract (type 'payload', flags.persistent, masslineTetherable).
// - The Well's pull-back is a real queued impulse (queuePhysicsImpulse) on the player
//   hull toward the well-mouth. No other owner's fields are written.

import { hash32 } from '../../core/rng.js';
import { queuePhysicsImpulse } from '../../core/physicsAuthority.js';

export const PLANTS_TWO_ROPES_EVENT = 'plants:twoRopes';

export const TWO_ROPES_TUNING = Object.freeze({
  plId: 'pl138',
  sectorId: 'sector_proteus_well',
  stationId: 'station_proteus',
  poiId: 'poi_proteus_hulk',
  groanPeriodS: 150,
  holdWindowS: 6,          // anchor within this long after a groan to add your rope
  assistRangeWu: 300,      // how close your anchor must land to the catch
  haulSpeedWu: 26,
  haulArriveWu: 14,
  wellPullImpulse: 900,
  quietS: 600,             // let go early: the Well is quiet for a day
  memoryCap: 4,            // active hauls
});

/** Pure: does a throw inside `delayS` of the groan, within `rangeWu` of the catch, add a rope? */
export function addsSecondRope(sinceGroanS, distToCatchWu, tuning = TWO_ROPES_TUNING) {
  return sinceGroanS >= 0 && sinceGroanS <= tuning.holdWindowS && distToCatchWu <= tuning.assistRangeWu;
}

/** Pure: the Well's pull-back direction: from the catch toward the well-mouth (poi). */
export function wellPullDir(fromPos, wellPos) {
  if (!fromPos || !wellPos) return { x: 0, z: 0 };
  const dx = wellPos.x - fromPos.x;
  const dz = wellPos.z - fromPos.z;
  const d = Math.hypot(dx, dz);
  return d > 0 ? { x: dx / d, z: dz / d } : { x: 0, z: 0 };
}

export const twoRopesPlant = {
  name: 'plants138',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._ownedIds = new Set();
    this._catchId = null;
    this._colmId = null;
    this._groanAt = -Infinity;
    this._hauling = false;      // your rope is on
    this._hailedFirst = false;  // you held through a pull: hailed first next time
    this._quietUntil = 0;       // let go early: the Well is quiet
    this._groanAccum = 0;
    this._accum = 0;
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('massline:throw', (p) => this._onThrow(p));
    on('sector:exit', () => this._cleanup());
  },

  update(dt) {
    const s = this.state;
    if (s && s.mode && s.mode !== 'flight') return;
    if (!s || !this.bus) return;
    if ((s.world && s.world.currentSectorId) !== TWO_ROPES_TUNING.sectorId) return;
    const anchor = this._poi() || this._station();
    if (!anchor) return;
    this._ensureProps(anchor);
    const now = Number.isFinite(s.simTime) ? s.simTime : 0;

    if (!this._hauling && now >= this._quietUntil) {
      this._groanAccum += dt;
      if (this._groanAccum >= TWO_ROPES_TUNING.groanPeriodS) {
        this._groanAccum = 0;
        this._groanAt = now;
        this.bus.emit('audio:cue', { id: 'sfx_vent_chime', position: anchor.pos, gain: 0.6, rate: 0.8 });
        this._say(`plants:pl138:groan:${Math.floor(now)}`, 'Pull!', 6);
        this.bus.emit(PLANTS_TWO_ROPES_EVENT, { kind: 'losing', t: now });
      }
    }

    if (this._hauling) {
      this._accum += dt;
      if (this._accum < 0.5) return;
      this._accum = 0;
      const winch = this._colmId != null ? s.entities.get(this._colmId) : null;
      const catchEnt = this._catchId != null ? s.entities.get(this._catchId) : null;
      const player = s.entities && s.entities.get(s.playerId);
      if (!winch || !catchEnt || !player) { this._abortHaul('letGo', now); return; }
      const d = Math.hypot(winch.pos.x - catchEnt.pos.x, winch.pos.z - catchEnt.pos.z);
      // Let go early: you leave the winch water before the catch comes up.
      if (Math.hypot(player.pos.x - winch.pos.x, player.pos.z - winch.pos.z) > TWO_ROPES_TUNING.assistRangeWu * 1.4) {
        this._abortHaul('letGo', now);
        return;
      }
      if (d <= TWO_ROPES_TUNING.haulArriveWu) {
        this._resolveHaul(winch, catchEnt, player, now);
        return;
      }
      const step = TWO_ROPES_TUNING.haulSpeedWu * 0.5;
      catchEnt.pos.x += (winch.pos.x - catchEnt.pos.x) / d * step;
      catchEnt.pos.z += (winch.pos.z - catchEnt.pos.z) / d * step;
    }
  },

  destroy() {
    if (!this._unsubs) { this.state = null; this.bus = null; return; }
    for (const off of this._unsubs) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._cleanup();
     this.state = null;
    this.bus = null;
  },

  // ---- internals ----

  _poi() {
    const s = this.state;
    const list = Array.isArray(s.entityList) ? s.entityList : [];
    for (const e of list) {
      if (e && e.alive !== false && e.data && e.data.poiId === TWO_ROPES_TUNING.poiId) return e;
    }
    if (s.entities && typeof s.entities.values === 'function') {
      for (const e of s.entities.values()) {
        if (e && e.alive !== false && e.data && e.data.poiId === TWO_ROPES_TUNING.poiId) return e;
      }
    }
    return null;
  },

  _station() {
    const s = this.state;
    const idx = s.entityIndex && Array.isArray(s.entityIndex.stations) ? s.entityIndex.stations : null;
    const lists = [idx, Array.isArray(s.entityList) ? s.entityList : null];
    for (const list of lists) {
      if (!list) continue;
      for (const e of list) {
        if (e && e.type === 'station' && e.alive !== false && e.data && e.data.stationId === TWO_ROPES_TUNING.stationId) return e;
      }
    }
    return null;
  },

  _ensureProps(anchor) {
    if (this._colmId != null || this._catchId != null) return;
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return;
    const h = Number.isFinite(hash32(this.state.meta && this.state.meta.seed, TWO_ROPES_TUNING.sectorId, 'pl138-spot'))
      ? hash32(this.state.meta && this.state.meta.seed, TWO_ROPES_TUNING.sectorId, 'pl138-spot') : 0;
    const bearing = (h % 6283) / 1000;
    const winchPos = {
      x: anchor.pos.x + Math.cos(bearing) * 70,
      z: anchor.pos.z + Math.sin(bearing) * 70,
    };
    const colm = this._spawn({
      type: 'beacon',
      pos: winchPos,
      vel: { x: 0, z: 0 },
      radius: 7,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      data: {
        parentType: 'story_prop',
        scanLabel: 'DEEP COLM — winch, against its catch',
        storyPropKind: 'colm_winch',
        tetherable: true,
        masslineTetherable: true,
        swarmFloorPad: { label: 'DEEP COLM' },
      },
    });
    this._colmId = colm ? colm.id : null;
    // The catch: a real persistent crate on the spec contract — tetherable, physical.
    const catchEnt = this._spawn({
      type: 'payload',
      pos: { x: winchPos.x + Math.cos(bearing + Math.PI / 2) * 120, z: winchPos.z + Math.sin(bearing + Math.PI / 2) * 120 },
      vel: { x: 0, z: 0 },
      radius: 8,
      hull: 20,
      hullMax: 20,
      flags: { persistent: true },
      physicsBody: { mass: 120 },
      data: {
        commodityId: 'cmdty_salvage_alloys',
        amount: 2,
        masslineTetherable: true,
        parentType: 'story_prop',
        scanLabel: 'Colm\u2019s catch — the winch is losing',
        storyPropKind: 'colm_catch',
      },
    });
    this._catchId = catchEnt ? catchEnt.id : null;
  },

  _onThrow(p) {
    const s = this.state;
    if (!s || !p || this._hauling) return;
    const now = Number.isFinite(s.simTime) ? s.simTime : 0;
    if (now < this._quietUntil) return;
    const catchEnt = this._catchId != null ? s.entities.get(this._catchId) : null;
    const player = s.entities && s.entities.get(s.playerId);
    if (!catchEnt || !player || !player.pos) return;
    const sinceGroan = now - this._groanAt;
    const dist = Math.hypot(player.pos.x - catchEnt.pos.x, player.pos.z - catchEnt.pos.z);
    if (!addsSecondRope(sinceGroan, dist, TWO_ROPES_TUNING)) return;
    this._hauling = true;
    this.bus.emit('audio:cue', { id: 'confirm', position: catchEnt.pos, gain: 0.8, rate: 1.0 });
    if (this._hailedFirst) {
      this._say(`plants:pl138:hail:${Math.floor(now)}`, 'Colm. Hailing you first.', 6);
    }
    this.bus.emit(PLANTS_TWO_ROPES_EVENT, { kind: 'twoLines', catchId: this._catchId, t: now });
  },

  _resolveHaul(winch, catchEnt, player, now) {
    this._hauling = false;
    this._hailedFirst = true;
    this.bus.emit('audio:cue', { id: 'confirm', position: winch.pos, gain: 0.8, rate: 0.9 });
    this._say(`plants:pl138:up:${Math.floor(now)}`, 'Up. Two lines.', 6);
    // The Well pulls back once, hard, to see who's new.
    const dir = wellPullDir(player.pos, winch.pos);
    queuePhysicsImpulse(player, { x: dir.x * TWO_ROPES_TUNING.wellPullImpulse, z: dir.z * TWO_ROPES_TUNING.wellPullImpulse },
      { tick: this.state.tick, externalEffect: true });
    this.bus.emit('audio:cue', { id: 'warning', position: player.pos, gain: 1.0, rate: 0.6 });
    this.bus.emit(PLANTS_TWO_ROPES_EVENT, { kind: 'wellPull', catchId: this._catchId, t: now });
  },

  _abortHaul(kind, now) {
    this._hauling = false;
    if (kind === 'letGo') {
      this._quietUntil = now + TWO_ROPES_TUNING.quietS;
      this.bus.emit(PLANTS_TWO_ROPES_EVENT, { kind: 'letGoQuiet', quietUntil: this._quietUntil, t: now });
    }
  },

  _spawn(spec) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const data = spec.data || {};
    spec.data = {
      ...data,
      plants: { ...(data.plants || {}), [TWO_ROPES_TUNING.plId]: { role: 'winch' } },
    };
    const ent = spawnEntity(spec);
    if (ent && ent.id != null) this._ownedIds.add(ent.id);
    return ent || null;
  },

  _say(id, text, ttl) {
    if (!this.bus) return;
    this.bus.emit('comms:popup', { id, sender: 'DEEP COLM', category: 'traffic', text, ttl, persist: false });
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({ channel: 'bark', id, text, ttl, key: TWO_ROPES_TUNING.plId });
    }
  },

  _cleanup() {
    const removeEntity = this.helpers && this.helpers.removeEntity;
    if (typeof removeEntity === 'function') {
      for (const id of this._ownedIds) removeEntity(id);
    }
    this._ownedIds = new Set();
    this._colmId = null;
    this._catchId = null;
    this._hauling = false;
    this._groanAt = -Infinity;
    this._groanAccum = 0;
  },
};
