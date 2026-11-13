// PL-103 The bus does not move — Shove Late Benny's bus: it sways, holds course, and the route hears about it.
// Row (design/program/INFERENCE_PLANTS.md §A):
//   What happens: Shove Late Benny's bus mid-route: it sways and holds course, and the whole
//   route hears "We leave when we leave." Shove it at a stop and one passenger pod rolls loose
//   What the player can do: Hand the pod up at the next stop; or keep it — the passenger talks
//   from your hold, all day
//
// The Benny bus does not exist in the world yet, so this plant OWNS it: it spawns a small
// shuttle hull (team 2, passive ai) stamped data.plantsPl103Bus on a sector-relative schedule,
// flies a slow two-stop loop through the traffic-reaction lease, and despawns/respawns on
// cadence. The shove reactions below then work against a bus that actually exists.
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random() or Date.now();
//   variety via hash32(seed, label, key) from src/core/rng.js.
// - No Three.js or DOM imports.
// - Memory bounded via BUS_TUNING.memoryCap with FIFO + stale eviction.
// - NPC movement only via requestTrafficReaction/releaseTrafficReaction; the bus holds course
//   when shoved (sway is lamps + voice only) and otherwise flies its own leased loop beat.
// - Cooldowns per bus key. All session state lives on `this`, never module-level.

import { hash32 } from '../../core/rng.js';
import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';

export const PLANTS_BUS_HOLD_EVENT = 'plants:busHold';
export const PLANTS_BUS_POD_EVENT = 'plants:busPodLoose';
export const PLANTS_BUS_TALK_EVENT = 'plants:busPassengerTalk';
export const PLANTS_BUS_HANDUP_EVENT = 'plants:busPodHandUp';
export const PLANTS_BUS_SPAWN_EVENT = 'plants:busSpawn';

export const BUS_ROUTE_BARK = 'We leave when we leave.';

export const BUS_TUNING = Object.freeze({
  spawnDelayS: 20,            // sector-relative: the bus enters service this long after entry
  busLifeS: 240,              // despawn/respawn cadence: one shift, then the next bus
  respawnGapS: 15,            // between shifts
  busSpeedWu: 26,             // the loop is slow
  wpRadiusWu: 40,             // close enough to a stop to flip the loop
  stopRadiusWu: 120,          // inside this of the active stop = at a stop
  loopSpreadWu: 700,          // sector-anchor fallback: the two stops sit this far apart
  busRadius: 10,
  busMass: 600,
  busHull: 90,
  shoveClosingSpeedMinWu: 4, // measured pre-solve closing speed (WU/s) that counts as a shove
  busCooldownS: 30,           // per-bus cooldown between shove reactions
  swayS: 1.5,                 // how long the sway lamps flash
  podRadius: 4,               // passenger pod body
  podMass: 40,
  podHull: 30,
  podRollSpeedWu: 14,         // the pod rolls loose at this speed
  handUpRadiusWu: 60,         // carried pod within this of the bus at a stop = handed up
  talkIntervalS: 25,          // the kept passenger talks from your hold on this cadence
  talkMaxPerSector: 12,       // bounded chatter per session
  memoryCap: 16,              // bounded per-bus rows
});

export const BUS_PASSENGER_LINES = Object.freeze([
  'Still here. Still talking.',
  'My stop was an hour ago.',
  'Benny will hear about this.',
]);

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Eligibility: this plant's own shuttle hull (data.plantsPl103Bus) — the row's Late Benny bus.
 */
export function isBennyBus(entity) {
  if (!entity || entity.alive === false || !entity.pos) return false;
  const data = entity.data || {};
  return data.plantsPl103Bus === true;
}

/**
 * Decision helper (pure): the bus's two stops. Real stations first (first two real stations
 * readable), else a deterministic pair of offsets off the sector anchor.
 */
export function busLoopStops(stations, sectorId, tuning = BUS_TUNING) {
  const real = (Array.isArray(stations) ? stations : []).filter(
    (s) => s && s.alive !== false && s.type === 'station' && s.pos && !(s.data && (s.data.isGate || s.data.isWormhole)),
  );
  if (real.length >= 2) return [{ x: finite(real[0].pos.x), z: finite(real[0].pos.z) }, { x: finite(real[1].pos.x), z: finite(real[1].pos.z) }];
  const ang = (hash32(String(sectorId), 'busLoop', 'a') % 6283) / 1000;
  return [
    { x: Math.cos(ang) * tuning.loopSpreadWu * 0.5, z: Math.sin(ang) * tuning.loopSpreadWu * 0.5 },
    { x: -Math.cos(ang) * tuning.loopSpreadWu * 0.5, z: -Math.sin(ang) * tuning.loopSpreadWu * 0.5 },
  ];
}

/**
 * Decision helper (pure): is the bus at a stop — inside stopRadiusWu of the active waypoint?
 */
export function busAtStop(bus, stops, tuning = BUS_TUNING) {
  if (!bus || !bus.pos || !Array.isArray(stops) || !stops.length) return false;
  for (const stop of stops) {
    const d = Math.hypot(finite(bus.pos.x) - finite(stop.x), finite(bus.pos.z) - finite(stop.z));
    if (d <= tuning.stopRadiusWu) return true;
  }
  return false;
}

/**
 * Memory-row builder (pure): per-bus shove/pod bookkeeping, FIFO + stale eviction at the cap.
 */
export function busRowFor(memory, busId, now, cap = BUS_TUNING.memoryCap) {
  if (!memory || !busId) return null;
  let row = memory.get(busId);
  if (row && !(now >= row.lastAt)) row = null;
  if (!row) {
    if (memory.size >= cap) {
      for (const [id, old] of memory) {
        if (!(now >= old.lastAt) || now - old.lastAt > BUS_TUNING.busCooldownS * 4) memory.delete(id);
      }
      while (memory.size >= cap) memory.delete(memory.keys().next().value);
    }
    row = {
      lastShoveAt: -Infinity,
      podId: null,
      podKeptAt: -Infinity,
      lastTalkAt: -Infinity,
      talks: 0,
      lastAt: now,
    };
    memory.set(busId, row);
  }
  return row;
}

export const busDoesntMoveOps = {
  _initBusDoesntMove(ctx = {}) {
    this._busMemory = new Map();
    this._busLoopMemory = new Map();
    this._busBornAt = -1;
    this._busSpawnAt = -1;
    this._busEntityId = null;
    this._busShiftEndsAt = -Infinity;
    this._busRespawnAt = -Infinity;
    this._busWpIndex = 0;
    if (this.bus && typeof this.bus.on === 'function' && !this._busInstalled) {
      this._busInstalled = true;
      this.bus.on('physics:impact', (p) => this._onBusImpact(p));
      this.bus.on('pickup:collected', (p) => this._onBusPickup(p));
      this.bus.on('sector:exit', () => this._busLoopReset());
      this.bus.on('save:loaded', () => this._busLoopReset());
    }
  },

  _busMemoryMap() {
    if (!(this._busMemory instanceof Map)) this._busMemory = new Map();
    return this._busMemory;
  },

  _busLoopMemoryMap() {
    if (!(this._busLoopMemory instanceof Map)) this._busLoopMemory = new Map();
    return this._busLoopMemory;
  },

  _busLoopReset() {
    this._busMemory = new Map();
    this._busLoopMemory = new Map();
    this._busBornAt = -1;
    this._busSpawnAt = -1;
    this._busEntityId = null;
    this._busShiftEndsAt = -Infinity;
    this._busRespawnAt = -Infinity;
    this._busWpIndex = 0;
  },

  _entityById(id) {
    if (id == null) return null;
    const entities = this.state && this.state.entities;
    if (!entities) return null;
    if (typeof entities.get === 'function') return entities.get(id) || null;
    if (Array.isArray(entities)) return entities.find((e) => e && e.id === id) || null;
    return null;
  },

  _busSpawn(state, now) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const stops = busLoopStops(state.stations, (state.world && state.world.currentSectorId) || 's');
    const bus = spawnEntity({
      type: 'ship',
      pos: { x: stops[0].x, z: stops[0].z },
      vel: { x: 0, z: 0 },
      radius: BUS_TUNING.busRadius,
      mass: BUS_TUNING.busMass,
      hull: BUS_TUNING.busHull,
      hullMax: BUS_TUNING.busHull,
      team: 2,
      data: {
        plantsPl103Bus: true,
        trafficRole: 'bus',
        name: "Late Benny's bus",
        ai: { passive: true },
        masslineTetherable: true,
        tetherable: true,
      },
    });
    this._busEntityId = bus && bus.id != null ? bus.id : null;
    this._busShiftEndsAt = now + BUS_TUNING.busLifeS;
    this._busWpIndex = 1;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_BUS_SPAWN_EVENT, { busId: this._busEntityId, t: now });
    }
    return bus;
  },

  /**
   * Per-tick service for plantsRuntime: spawns the bus on the sector-relative schedule, flies
   * the two-stop loop through the lease, and runs the despawn/respawn cadence.
   */
  _stepPl103Bus(state, dt = 0) {
    if (!state || (state.mode && state.mode !== 'flight')) return false;
    const now = finite(state.simTime, 0);
    if (this._busBornAt < 0) {
      this._busBornAt = now;
      this._busSpawnAt = now + BUS_TUNING.spawnDelayS;
    }

    // Shift cadence: retire the bus at end of shift, respawn after the gap.
    if (this._busEntityId != null) {
      if (now >= this._busShiftEndsAt) {
        const removeEntity = this.helpers && this.helpers.removeEntity;
        if (typeof removeEntity === 'function') removeEntity(this._busEntityId);
        releaseTrafficReaction(this, this._entityById(this._busEntityId));
        this._busEntityId = null;
        this._busRespawnAt = now + BUS_TUNING.respawnGapS;
        return false;
      }
    } else if (this._busRespawnAt >= 0 && now < this._busRespawnAt) {
      return false;
    } else if (now >= this._busSpawnAt) {
      this._busSpawn(state, now);
      return false;
    }

    const bus = this._entityById(this._busEntityId);
    if (!bus || bus.alive === false || !bus.pos) return false;
    const stops = busLoopStops(state.stations, (state.world && state.world.currentSectorId) || 's');
    const wp = stops[this._busWpIndex % stops.length];
    const d = Math.hypot(finite(bus.pos.x) - finite(wp.x), finite(bus.pos.z) - finite(wp.z));
    if (d <= BUS_TUNING.wpRadiusWu) {
      this._busWpIndex = (this._busWpIndex + 1) % stops.length;
    }
    const aim = Math.atan2(finite(wp.z) - finite(bus.pos.z), finite(wp.x) - finite(bus.pos.x));
    const owned = requestTrafficReaction(this, bus, {
      moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: aim, brake: false,
    }, 1);
    return owned === true;
  },

  /** physics:impact receipt: the player shoving the bus. */
  _onBusImpact(payload) {
    if (!payload || !this.state || (this.state.mode && this.state.mode !== 'flight')) return;
    const causal = payload.causalActorId != null ? payload.causalActorId : payload.aId;
    if (causal !== this.state.playerId) return;
    const closingSpeed = finite(payload.preSolveClosingSpeed, 0);
    if (closingSpeed < BUS_TUNING.shoveClosingSpeedMinWu) return;
    const candidateA = this._entityById(payload.aId);
    const candidateB = this._entityById(payload.bId);
    const bus = isBennyBus(candidateA) ? candidateA : isBennyBus(candidateB) ? candidateB : null;
    if (!bus) return;

    const now = finite(this.state.simTime, 0);
    const row = busRowFor(this._busMemoryMap(), bus.id, now);
    if (!row) return;
    row.lastAt = now;
    if (now - row.lastShoveAt < BUS_TUNING.busCooldownS) return;
    row.lastShoveAt = now;

    const stops = busLoopStops(this.state.stations, (this.state.world && this.state.world.currentSectorId) || 's');
    const atStop = busAtStop(bus, stops);

    if (!atStop) {
      // Mid-route: it sways and holds course; the whole route hears the exact line.
      const data = bus.data || (bus.data = {});
      data.lampsFlashing = true;
      data.lampFlashUntil = now + BUS_TUNING.swayS;
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PLANTS_BUS_HOLD_EVENT, { busId: bus.id, t: now });
        if (this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function') {
          this.helpers.voice.say({
            channel: 'comms',
            id: 'plants:pl103:hold',
            text: BUS_ROUTE_BARK,
            kind: 'traffic',
            ttl: 4,
          });
        }
      }
      return;
    }

    // At a stop: one passenger pod rolls loose.
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return;
    const side = (hash32(now | 0, 'busPodSide', String(bus.id)) & 1) ? 1 : -1;
    const pod = spawnEntity({
      type: 'cargo',
      pos: { x: finite(bus.pos.x) + side * 14, z: finite(bus.pos.z) },
      vel: { x: side * BUS_TUNING.podRollSpeedWu, z: 0 },
      radius: BUS_TUNING.podRadius,
      mass: BUS_TUNING.podMass,
      physicsBody: { mass: BUS_TUNING.podMass },
      hull: BUS_TUNING.podHull,
      hullMax: BUS_TUNING.podHull,
      data: {
        passengerPod: true,
        busId: bus.id,
        masslineTetherable: true,
        tetherable: true,
        scanLabel: 'Passenger pod',
      },
      flags: { persistent: true },
    });
    row.podId = pod && pod.id != null ? pod.id : null;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_BUS_POD_EVENT, { busId: bus.id, podId: row.podId, t: now });
    }
  },

  /** pickup:collected: the player keeps the pod — the passenger talks from your hold, all day. */
  _onBusPickup(payload) {
    if (!payload || !this.state) return;
    if (payload.collectorId !== this.state.playerId) return;
    const memory = this._busMemoryMap();
    for (const row of memory.values()) {
      if (row.podId != null && row.podId === payload.pickupId) {
        const now = finite(this.state.simTime, 0);
        row.podKeptAt = now;
        row.lastTalkAt = now;
        row.lastAt = now;
        return;
      }
    }
  },

  /**
   * Per-hull hook from the traffic dispatch (the plant's own bus hull): drives the kept
   * passenger's chatter and detects the pod handed up at the next stop. Returns true only
   * while the bus is flying its leased loop beat this tick.
   */
  _reactBusDoesntMove(e, rec, stations, state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return false;
    if (!isBennyBus(e)) return false;
    const now = finite(state.simTime, 0);
    const row = this._busMemoryMap().get(e.id);
    if (!row) return false;
    row.lastAt = now;

    const stops = busLoopStops(stations && stations.length ? stations : state.stations,
      (state.world && state.world.currentSectorId) || 's');

    // Hand the pod up: a kept pod within handUpRadiusWu of the bus at a stop.
    if (row.podId != null && row.podKeptAt >= 0 && busAtStop(e, stops)) {
      const pod = this._entityById(row.podId);
      if (pod && pod.alive !== false && pod.pos) {
        const d = Math.hypot(finite(pod.pos.x) - finite(e.pos.x), finite(pod.pos.z) - finite(e.pos.z));
        if (d <= BUS_TUNING.handUpRadiusWu) {
          const removeEntity = this.helpers && this.helpers.removeEntity;
          if (typeof removeEntity === 'function') removeEntity(row.podId);
          row.podId = null;
          row.podKeptAt = -Infinity;
          if (this.bus && typeof this.bus.emit === 'function') {
            this.bus.emit(PLANTS_BUS_HANDUP_EVENT, { busId: e.id, t: now });
            this.bus.emit('audio:cue', { id: 'confirm', position: { x: e.pos.x, z: e.pos.z }, gain: 0.7, rate: 1 });
            this.bus.emit('comms:popup', {
              id: 'plants:pl103:handup',
              sender: 'LATE BENNY',
              category: 'traffic',
              text: 'Handed up. Much obliged.',
              ttl: 5,
            });
          }
          return false;
        }
      }
    }

    // Keep it: the passenger talks from your hold, all day (bounded per session).
    if (row.podKeptAt >= 0 && row.talks < BUS_TUNING.talkMaxPerSector
        && now - row.lastTalkAt >= BUS_TUNING.talkIntervalS) {
      row.lastTalkAt = now;
      row.talks += 1;
      const line = BUS_PASSENGER_LINES[hash32(row.talks, 'busTalk', String(e.id)) % BUS_PASSENGER_LINES.length];
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PLANTS_BUS_TALK_EVENT, { busId: e.id, talks: row.talks, text: line, t: now });
        this.bus.emit('comms:popup', {
          id: `plants:pl103:talk:${row.talks}`,
          sender: 'YOUR HOLD',
          category: 'traffic',
          text: line,
          ttl: 4,
        });
      }
    }

    // Fly the loop beat (the lease arbitrates against the plantsRuntime stepper).
    const wp = stops[this._busWpIndex % stops.length];
    const d = Math.hypot(finite(e.pos.x) - finite(wp.x), finite(e.pos.z) - finite(wp.z));
    if (d <= BUS_TUNING.wpRadiusWu) this._busWpIndex = (this._busWpIndex + 1) % stops.length;
    const aim = Math.atan2(finite(wp.z) - finite(e.pos.z), finite(wp.x) - finite(e.pos.x));
    return requestTrafficReaction(this, e, {
      moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: aim, brake: false,
    }, 1) === true;
  },
};
