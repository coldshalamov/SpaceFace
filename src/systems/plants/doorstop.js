// PL-218 The doorstop — A dock's shutter jams half-open every third day; pin it open and the queue flows.
// Row (design/program/INFERENCE_PLANTS.md §A):
//   What happens: A dock's rolling shutter jams half-open every third day and the queue backs
//   up. Pin it open and the queue flows; the dockhand chalks your tag on the shutter's edge
//   What the player can do: Be the fix; or Pin it shut instead — the dock reroutes, and the
//   dockhand chalks a number where your tag was going
//
// Pinning it shut has teeth: while the reroute is in force, arriving player traffic hears the
// reroute and a leased NPC beat deflects hulls (and shadows the player off the corridor) until
// rerouteUntil. Shutter props are capped at one per station and despawn when the jam clears.
// The first visit schedules the jam a full cycle out — nothing jams on arrival.
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random() or Date.now();
//   variety via hash32(seed, label, key) from src/core/rng.js.
// - No Three.js or DOM imports.
// - Memory bounded via DOORSTOP_TUNING.memoryCap with FIFO + stale eviction.
// - NPC movement only via requestTrafficReaction/releaseTrafficReaction; the reroute beat is a
//   leased deflection, aborted when refused.
// - Cooldowns per station key. All session state lives on `this`, never module-level.

import { hash32 } from '../../core/rng.js';
import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';

export const PLANTS_DOORSTOP_JAM_EVENT = 'plants:doorstopJam';
export const PLANTS_DOORSTOP_CHALK_TAG_EVENT = 'plants:doorstopChalkTag';
export const PLANTS_DOORSTOP_CHALK_NUMBER_EVENT = 'plants:doorstopChalkNumber';
export const PLANTS_DOORSTOP_REROUTE_EVENT = 'plants:doorstopReroute';

export const DOORSTOP_TUNING = Object.freeze({
  jamCycleS: 90,             // the shutter jams once per cycle ("every third day")
  cyclesBetweenJams: 3,      // third day: two quiet cycles between jams
  propRadius: 6,
  propMass: 400,             // heavy: pinning means shoving a real mass
  propHull: 80,
  doorOffsetWu: 90,          // the shutter sits this far off the station heart
  openMarkWu: 40,            // open pin mark, beyond the door along the approach
  shutMarkWu: 30,            // shut pin mark, tucked behind the door
  pinRadiusWu: 24,           // prop within this of a mark counts as pinned there
  rerouteS: 60,              // pin it shut: the dock reroutes for this long
  deflectDurationS: 2,       // each reroute deflection beat
  deflectCooldownS: 4,       // per-hull deflection cooldown
  deflectRangeWu: 200,       // hulls inside this of the door feel the reroute beat
  rerouteSayCooldownS: 20,   // the reroute comms line, per station
  chalkPropRadius: 4,        // the chalked tag/number rides a pad label too
  memoryCap: 16,             // bounded station rows
});

export const DOORSTOP_TAG_LINE = 'Chalking your tag. Thanks.';
export const DOORSTOP_NUMBER_LINE = 'That gets a number, not a tag.';
export const DOORSTOP_REROUTE_LINE = 'Reroute in force.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Decision helper (pure): door geometry for a station — the door point and the two pin marks.
 * Deterministic per station id via hash32.
 */
export function doorstopDoorGeometry(station, tuning = DOORSTOP_TUNING) {
  if (!station || !station.pos) return null;
  const id = String((station.data && station.data.stationId) || station.id || 'station');
  const ang = (hash32(id, 'doorstopAngle', 'a') % 6283) / 1000;
  const doorX = finite(station.pos.x) + Math.cos(ang) * tuning.doorOffsetWu;
  const doorZ = finite(station.pos.z) + Math.sin(ang) * tuning.doorOffsetWu;
  return {
    door: { x: doorX, z: doorZ },
    openMark: { x: doorX + Math.cos(ang) * tuning.openMarkWu, z: doorZ + Math.sin(ang) * tuning.openMarkWu },
    shutMark: { x: doorX - Math.cos(ang) * tuning.shutMarkWu, z: doorZ - Math.sin(ang) * tuning.shutMarkWu },
  };
}

/**
 * Memory-row builder (pure): per-station jam bookkeeping, FIFO + stale eviction at the cap.
 * nextJamAt starts unset (-1): the first visit schedules, it never jams on arrival.
 */
export function doorstopRowFor(memory, stationId, now, cap = DOORSTOP_TUNING.memoryCap) {
  if (!memory || !stationId) return null;
  let row = memory.get(stationId);
  if (row && !(now >= row.lastAt)) row = null;
  if (!row) {
    if (memory.size >= cap) {
      for (const [id, old] of memory) {
        if (!(now >= old.lastAt) || now - old.lastAt > DOORSTOP_TUNING.jamCycleS * 8) memory.delete(id);
      }
      while (memory.size >= cap) memory.delete(memory.keys().next().value);
    }
    row = {
      nextJamAt: -1,
      jammed: false,
      propId: null,
      chalkTag: null,
      chalkNumber: 0,
      rerouteUntil: -Infinity,
      lastRerouteSayAt: -Infinity,
      lastAt: now,
    };
    memory.set(stationId, row);
  }
  return row;
}

/**
 * Pure pin classification: where is the prop relative to the door marks?
 * 'open' | 'shut' | null.
 */
export function classifyDoorstopPin(prop, geometry, tuning = DOORSTOP_TUNING) {
  if (!prop || !prop.pos || !geometry) return null;
  const openD = Math.hypot(finite(prop.pos.x) - finite(geometry.openMark.x), finite(prop.pos.z) - finite(geometry.openMark.z));
  const shutD = Math.hypot(finite(prop.pos.x) - finite(geometry.shutMark.x), finite(prop.pos.z) - finite(geometry.shutMark.z));
  if (openD <= tuning.pinRadiusWu && openD <= shutD) return 'open';
  if (shutD <= tuning.pinRadiusWu) return 'shut';
  return null;
}

export const doorstopOps = {
  _initDoorstop(ctx = {}) {
    this._doorstopMemory = new Map();
    this._doorstopHulls = new Map();
    if (this.bus && typeof this.bus.on === 'function' && !this._doorstopInstalled) {
      this._doorstopInstalled = true;
      this.bus.on('dock:range', (p) => this._onDoorstopDockRange(p));
      this.bus.on('physics:impact', (p) => this._onDoorstopImpact(p));
      this.bus.on('sector:exit', () => this._doorstopCleanup());
      this.bus.on('save:loaded', () => this._doorstopCleanup());
    }
  },

  _doorstopCleanup() {
    // Shutter props never outlive the sector.
    const removeEntity = this.helpers && this.helpers.removeEntity;
    if (typeof removeEntity === 'function') {
      for (const row of this._doorstopMemory.values()) {
        if (row.propId != null) removeEntity(row.propId);
        row.propId = null;
        row.jammed = false;
        row.rerouteUntil = -Infinity;
      }
    }
    this._doorstopHulls = new Map();
  },

  _doorstopMemoryMap() {
    if (!(this._doorstopMemory instanceof Map)) this._doorstopMemory = new Map();
    return this._doorstopMemory;
  },

  _doorstopEntityById(id) {
    if (id == null) return null;
    const entities = this.state && this.state.entities;
    if (!entities) return null;
    if (typeof entities.get === 'function') return entities.get(id) || null;
    if (Array.isArray(entities)) return entities.find((e) => e && e.id === id) || null;
    return null;
  },

  _doorstopStationById(id) {
    if (id == null || !this.state || !Array.isArray(this.state.stations)) return null;
    return this.state.stations.find(
      (s) => s && ((s.data && s.data.stationId) || s.id) === id,
    ) || null;
  },

  _doorstopDespawnProp(row) {
    if (row.propId == null) return;
    const removeEntity = this.helpers && this.helpers.removeEntity;
    if (typeof removeEntity === 'function') removeEntity(row.propId);
    row.propId = null;
  },

  _doorstopJam(station, stationId, now) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return;
    const geometry = doorstopDoorGeometry(station);
    if (!geometry) return;
    // Cap: one shutter prop per station — the previous cycle's prop leaves with its jam.
    const row0 = this._doorstopMemoryMap().get(stationId);
    if (row0 && row0.propId != null) this._doorstopDespawnProp(row0);
    const prop = spawnEntity({
      type: 'cargo',
      pos: { x: geometry.door.x, z: geometry.door.z },
      vel: { x: 0, z: 0 },
      radius: DOORSTOP_TUNING.propRadius,
      mass: DOORSTOP_TUNING.propMass,
      physicsBody: { mass: DOORSTOP_TUNING.propMass },
      hull: DOORSTOP_TUNING.propHull,
      hullMax: DOORSTOP_TUNING.propHull,
      data: {
        doorstopShutter: true,
        stationId,
        masslineTetherable: true,
        tetherable: true,
        scanLabel: 'Rolling shutter',
      },
    });
    const row = doorstopRowFor(this._doorstopMemoryMap(), stationId, now);
    if (!row) return;
    row.lastAt = now;
    row.jammed = true;
    row.propId = prop && prop.id != null ? prop.id : null;
    row.nextJamAt = now + DOORSTOP_TUNING.jamCycleS * DOORSTOP_TUNING.cyclesBetweenJams;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_DOORSTOP_JAM_EVENT, { stationId, propId: row.propId, t: now });
    }
  },

  _onDoorstopDockRange(payload) {
    if (!payload || !this.state || (this.state.mode && this.state.mode !== 'flight')) return;
    // UI re-emits carry no shipId: they dock nobody and never schedule a jam.
    if (payload.shipId == null || payload.inRange !== true) return;
    const station = this._doorstopStationById(payload.stationId);
    if (!station) return;
    const now = finite(this.state.simTime, 0);
    const stationId = payload.stationId;
    const row = doorstopRowFor(this._doorstopMemoryMap(), stationId, now);
    if (!row) return;
    row.lastAt = now;

    // Reroute in force: arriving player traffic hears it (cooldown per station).
    if (now < row.rerouteUntil && now - row.lastRerouteSayAt >= DOORSTOP_TUNING.rerouteSayCooldownS) {
      row.lastRerouteSayAt = now;
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PLANTS_DOORSTOP_REROUTE_EVENT, { stationId, until: row.rerouteUntil, t: now });
        this.bus.emit('comms:popup', {
          id: `plants:pl218:reroute:${stationId}`,
          sender: 'DOCK CONTROL',
          category: 'traffic',
          text: DOORSTOP_REROUTE_LINE,
          ttl: 5,
        });
      }
    }

    // The shutter jams on the third cycle — the first visit only schedules.
    if (!row.jammed && row.nextJamAt < 0) {
      row.nextJamAt = now + DOORSTOP_TUNING.jamCycleS * DOORSTOP_TUNING.cyclesBetweenJams;
      return;
    }
    if (!row.jammed && now >= row.nextJamAt) {
      this._doorstopJam(station, stationId, now);
      return;
    }
    this._doorstopCheckPin(station, stationId, now);
  },

  _onDoorstopImpact(payload) {
    if (!payload || !this.state || (this.state.mode && this.state.mode !== 'flight')) return;
    if (payload.causalActorId !== this.state.playerId) return;
    const prop = this._doorstopEntityById(payload.aId) || this._doorstopEntityById(payload.bId);
    if (!prop || !prop.data || prop.data.doorstopShutter !== true) return;
    const now = finite(this.state.simTime, 0);
    this._doorstopCheckPin(this._doorstopStationById(prop.data.stationId), prop.data.stationId, now);
  },

  _doorstopCheckPin(station, stationId, now) {
    const row = this._doorstopMemoryMap().get(stationId);
    if (!row || !row.jammed || row.propId == null) return;
    const prop = this._doorstopEntityById(row.propId);
    if (!prop || prop.alive === false) return;
    const geometry = doorstopDoorGeometry(station);
    const pin = classifyDoorstopPin(prop, geometry);
    if (!pin) return;

    row.jammed = false;
    row.rerouteUntil = -Infinity;
    if (pin === 'open') {
      // Be the fix: the queue flows and the dockhand chalks your tag on the shutter's edge.
      row.chalkTag = this.state.playerId;
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PLANTS_DOORSTOP_CHALK_TAG_EVENT, { stationId, propId: row.propId, t: now });
        this.bus.emit('audio:cue', { id: 'confirm', position: { x: prop.pos.x, z: prop.pos.z }, gain: 0.6, rate: 1 });
        this.bus.emit('comms:popup', {
          id: 'plants:pl218:tag',
          sender: 'DOCKHAND',
          category: 'traffic',
          text: DOORSTOP_TAG_LINE,
          ttl: 6,
        });
      }
    } else {
      // Pin it shut: the dock reroutes and a chalk number replaces your tag.
      row.chalkNumber += 1;
      row.chalkTag = null;
      row.rerouteUntil = now + DOORSTOP_TUNING.rerouteS;
      row.lastRerouteSayAt = now;
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PLANTS_DOORSTOP_CHALK_NUMBER_EVENT, { stationId, propId: row.propId, number: row.chalkNumber, t: now });
        this.bus.emit('audio:cue', { id: 'ui_deny', position: { x: prop.pos.x, z: prop.pos.z }, gain: 0.7, rate: 0.9 });
        this.bus.emit('comms:popup', {
          id: `plants:pl218:number:${row.chalkNumber}`,
          sender: 'DOCKHAND',
          category: 'traffic',
          text: DOORSTOP_NUMBER_LINE,
          ttl: 6,
        });
        this.bus.emit(PLANTS_DOORSTOP_REROUTE_EVENT, { stationId, until: row.rerouteUntil, t: now });
        this.bus.emit('comms:popup', {
          id: `plants:pl218:reroute:${stationId}`,
          sender: 'DOCK CONTROL',
          category: 'traffic',
          text: DOORSTOP_REROUTE_LINE,
          ttl: 5,
        });
      }
    }
    this._doorstopDespawnProp(row);
    row.lastAt = now;
  },

  /**
   * Per-hull hook from the traffic dispatch: while a station's reroute is in force, eligible
   * NPC hulls near the door fly a leased deflection beat that blocks/deflects traffic away
   * from the corridor. Returns true only while this hull's beat is being flown.
   */
  _reactDoorstop(e, rec, stations, state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return false;
    if (!e || e.alive === false || e.type !== 'ship' || !e.pos) return false;
    if (state && e.id === state.playerId) return false;
    const data = e.data || {};
    if (data.playerOwned || data.wingman || data.isGate || data.isWormhole) return false;
    if (data.disabled || data.derelict) return false;
    if (data.plantsFarBerthTug || data.plantsWreckTug || data.plantsSweepSquad || data.plantsPl103Bus) return false;

    const now = finite(state.simTime, 0);
    const stationList = Array.isArray(stations) && stations.length ? stations : (Array.isArray(state.stations) ? state.stations : []);

    // Any station in deflection range with a live reroute?
    let reroute = null;
    for (const station of stationList) {
      if (!station || !station.pos) continue;
      const row = this._doorstopMemoryMap().get(String((station.data && station.data.stationId) || station.id));
      if (!row || !(now < row.rerouteUntil)) continue;
      const ds = Math.hypot(finite(e.pos.x) - finite(station.pos.x), finite(e.pos.z) - finite(station.pos.z));
      if (ds <= DOORSTOP_TUNING.deflectRangeWu) { reroute = { station, row }; break; }
    }
    if (!reroute) {
      releaseTrafficReaction(this, e);
      return false;
    }

    const geometry = doorstopDoorGeometry(reroute.station);
    if (!geometry) return false;

    let hullRow = this._doorstopHulls.get(e.id);
    if (!hullRow || !(now >= hullRow.lastAt)) {
      if (this._doorstopHulls.size >= DOORSTOP_TUNING.memoryCap) {
        while (this._doorstopHulls.size >= DOORSTOP_TUNING.memoryCap) this._doorstopHulls.delete(this._doorstopHulls.keys().next().value);
      }
      hullRow = { lastDeflectAt: -Infinity, lastAt: now };
      this._doorstopHulls.set(e.id, hullRow);
    }
    hullRow.lastAt = now;
    if (now - hullRow.lastDeflectAt < DOORSTOP_TUNING.deflectCooldownS) return false;

    // Deflect: steer away from the door, across the corridor the shutter would open.
    const ax = finite(e.pos.x) - finite(geometry.door.x);
    const az = finite(e.pos.z) - finite(geometry.door.z);
    const aim = Math.atan2(az, ax);
    const owned = requestTrafficReaction(this, e, {
      moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: aim, brake: false,
    }, DOORSTOP_TUNING.deflectDurationS);
    if (!owned) return false; // refused: abort, no second intent writer
    hullRow.lastDeflectAt = now;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_DOORSTOP_REROUTE_EVENT, {
        stationId: (reroute.station.data && reroute.station.data.stationId) || reroute.station.id,
        hullId: e.id,
        deflecting: true,
        t: now,
      });
    }
    return true;
  },
};
