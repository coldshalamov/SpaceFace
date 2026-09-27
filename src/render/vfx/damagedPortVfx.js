// Native damage-port presentation planning.
//
// Combat owns whether a subsystem is destroyed or dependency-disabled. This module only maps
// that live state to a measured port release for the existing ActionVfx and gas-volume owners.
// It creates no Three.js objects, subscribes to no events, and never changes combat state.

import { SUBSYSTEM_DEFS } from '../../data/combatDefs.js';
import { modelTruthHitVolume } from '../../data/modelTruth.js';

const TICK_HZ = 60;
const DEFAULT_CADENCE_TICKS = 9;
const DEFAULT_MAX_DURATION_TICKS = 216;
const DEFAULT_MAX_TRACKED = 48;
const DEFAULT_MAX_EMITS = 8;
const EPSILON = 1e-6;

const PORT_SOCKET_BY_SUBSYSTEM = Object.freeze({
  subsystem_tether_spool: 'socket_tether_spool',
  subsystem_transport_clamp: 'socket_transport_clamp',
});

const SUBSYSTEM_ROW_BY_ID = new Map(SUBSYSTEM_DEFS.map((row) => [row.id, row]));

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, finite(value, lo)));
}

function entityFor(state, id) {
  if (!state || !state.entities) return null;
  if (typeof state.entities.get === 'function') {
    return state.entities.get(id) || state.entities.get(String(id))
      || (/^-?\d+$/.test(String(id)) ? state.entities.get(Number(id)) : null) || null;
  }
  if (typeof state.entities === 'object') return state.entities[id] || state.entities[String(id)] || null;
  return null;
}

function hashSeed(entityId, subsystemId) {
  let hash = 2166136261;
  const text = `${String(entityId)}:${subsystemId}`;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0) / 4294967296;
}

function fract(value) {
  return value - Math.floor(value);
}

function normalizedPortFromVolume(volume) {
  if (!volume || !Array.isArray(volume.center) || volume.center.length < 2) return null;
  const x = finite(volume.center[0]);
  const z = finite(volume.center[1]);
  let extent = 0.14;
  if (Array.isArray(volume.halfExtents)) {
    extent = Math.max(finite(volume.halfExtents[0], 0), finite(volume.halfExtents[1], 0));
  } else if (Number.isFinite(volume.radius)) {
    extent = Math.max(0, volume.radius);
  }
  return { x, z, extent, measured: volume.measured === true };
}

function normalizedPortFromSocket(runtime, subsystemId) {
  const socketId = PORT_SOCKET_BY_SUBSYSTEM[subsystemId];
  if (!socketId || !runtime || !runtime.sockets) return null;
  const socket = runtime.sockets[socketId];
  if (!socket || !Array.isArray(socket.localPos)) return null;
  return {
    x: finite(socket.localPos[0]),
    z: finite(socket.localPos[1]),
    extent: 0.16,
    measured: false,
    source: 'combatSocket',
  };
}

function normalizedPortFromCombatDef(subsystemId) {
  const row = SUBSYSTEM_ROW_BY_ID.get(subsystemId);
  const volume = row && row.volume;
  if (!volume || !Array.isArray(volume.center)) return null;
  const port = normalizedPortFromVolume(volume);
  if (port) port.source = 'combatVolume';
  return port;
}

function portLocalPosition(entity, runtime, subsystemId) {
  // Model truth names the authored engine/weapon/sensor sockets when a renderable has them.
  // Combat sockets and the combat volume remain deterministic fallbacks for ships without a
  // measured GLB row, so the release never falls back to an arbitrary hull centre.
  const measured = normalizedPortFromVolume(modelTruthHitVolume(entity, subsystemId));
  if (measured) {
    measured.source = 'modelTruthHitVolume';
    return measured;
  }
  return normalizedPortFromSocket(runtime, subsystemId) || normalizedPortFromCombatDef(subsystemId);
}

function phaseFor(ageTicks, dependencyDisabled) {
  if (dependencyDisabled) return ageTicks < 18 ? 'cooling' : 'tail';
  if (ageTicks < 15) return 'release';
  if (ageTicks < 126) return 'sustain';
  return 'cooling';
}

function stateMode(subsystem) {
  if (!subsystem) return null;
  if (subsystem.destroyed === true) return 'rupture';
  // A dependency-disabled child is real state, but it did not itself rupture. It gets a brief
  // low-energy cooling release so a power failure reads as a cascade instead of five identical
  // bright vents.
  if (subsystem.effectiveDisabled === true) return 'dependencyCooling';
  return null;
}

function entityHullFraction(entity) {
  const hp = finite(entity && entity.hp, NaN);
  const maxHp = finite(entity && entity.maxHp, NaN);
  return Number.isFinite(hp) && maxHp > EPSILON ? clamp(hp / maxHp) : 1;
}

/**
 * Resolve one live subsystem to a world-space release port.
 *
 * The returned object is intentionally renderer-neutral. `contactPoint` and `direction` can be
 * passed directly to ActionVfx.emit('salvage:reactorVented', ...)`, while the same coordinates
 * feed GasVolumeField.emitVent({ world: true, ... }).
 */
export function resolveDamagedPort(entity, runtime, subsystemId, options = {}) {
  if (!entity || entity.alive === false || !runtime || !runtime.subsystems) return null;
  const subsystem = runtime.subsystems[subsystemId];
  const mode = stateMode(subsystem);
  if (!mode || !entity.pos) return null;
  const port = portLocalPosition(entity, runtime, subsystemId);
  if (!port) return null;

  const radius = Math.max(0.5, finite(entity.radius, 6));
  const rotation = finite(entity.rot);
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  const localX = port.x * radius;
  const localZ = port.z * radius;
  const length = Math.hypot(localX, localZ);
  let localHeading;
  if (length > 0.08) {
    localHeading = Math.atan2(localZ, localX);
  } else if (subsystemId === 'subsystem_drive') {
    localHeading = Math.PI;
  } else if (subsystemId === 'subsystem_power' || subsystemId === 'subsystem_tether_spool') {
    localHeading = Math.PI * 0.5;
  } else {
    localHeading = 0;
  }
  const heading = rotation + localHeading;
  const outwardX = Math.cos(heading);
  const outwardZ = Math.sin(heading);
  // Stand the volume just beyond the authored subsystem seat. The body centre remains the soft
  // occluder, so the plume reads as emerging through the hull rather than hovering in front of it.
  const standoff = Math.max(radius * 0.10, radius * Math.max(0.06, port.extent) * 0.9);
  const contactPoint = {
    x: finite(entity.pos.x) + c * localX - s * localZ + outwardX * standoff,
    y: finite(entity.pos.y, 0.2) + 0.35,
    z: finite(entity.pos.z) + s * localX + c * localZ + outwardZ * standoff,
  };
  const hull = entityHullFraction(entity);
  const destruction = mode === 'rupture';
  const baseSeverity = destruction ? 0.78 : 0.22;
  const severity = clamp(baseSeverity + (1 - hull) * (destruction ? 0.20 : 0.08), 0.08, 1);
  const ageTicks = Math.max(0, Math.floor(finite(options.ageTicks)));
  const dependencyDisabled = mode === 'dependencyCooling';
  const phase = phaseFor(ageTicks, dependencyDisabled);
  const phaseEnergy = dependencyDisabled
    ? Math.max(0.18, 1 - ageTicks / 48)
    : phase === 'release' ? 1 : phase === 'sustain' ? 0.86 : Math.max(0.18, 1 - (ageTicks - 126) / 90);
  const seedBase = hashSeed(entity.id, subsystemId);
  const pulse = Math.max(0, Math.floor(finite(options.pulse)));

  return {
    key: `${String(entity.id)}:${subsystemId}`,
    entityId: entity.id,
    subsystemId,
    mode,
    dependencyDisabled,
    destroyed: destruction,
    portSource: port.source || 'combatVolume',
    contactPoint,
    direction: { x: outwardX, z: outwardZ },
    heading,
    occluder: {
      x: finite(entity.pos.x), y: finite(entity.pos.y, 0), z: finite(entity.pos.z),
      radius: radius * 0.78,
    },
    radius: Math.max(2.5, radius * (0.30 + port.extent * 0.35)),
    scale: Math.max(2.8, radius * (destruction ? 0.75 : 0.36)),
    severity: severity * phaseEnergy,
    phase,
    ageS: ageTicks / TICK_HZ,
    lifeScale: dependencyDisabled ? 0.46 : phase === 'cooling' ? 0.68 : 1,
    seed: fract(seedBase + pulse * 0.38196601125),
    hullFraction: hull,
    pulse,
  };
}

/**
 * Bounded, deterministic cadence owner for damaged-port releases. Call once per render update;
 * it returns only due pulses, so callers can feed the existing native surface and gas pools
 * without creating a new renderer or repeatedly replaying the same event.
 */
export class DamagedPortVfxPlanner {
  constructor({ cadenceTicks = DEFAULT_CADENCE_TICKS, maxDurationTicks = DEFAULT_MAX_DURATION_TICKS,
    maxTracked = DEFAULT_MAX_TRACKED, maxEmits = DEFAULT_MAX_EMITS } = {}) {
    this.cadenceTicks = Math.max(1, Math.floor(finite(cadenceTicks, DEFAULT_CADENCE_TICKS)));
    this.maxDurationTicks = Math.max(this.cadenceTicks, Math.floor(finite(maxDurationTicks, DEFAULT_MAX_DURATION_TICKS)));
    this.maxTracked = Math.max(1, Math.floor(finite(maxTracked, DEFAULT_MAX_TRACKED)));
    this.maxEmits = Math.max(1, Math.floor(finite(maxEmits, DEFAULT_MAX_EMITS)));
    this._records = new Map();
    this._activeKeys = new Set();
  }

  reset() {
    this._records.clear();
    this._activeKeys.clear();
  }

  collect(state, out = []) {
    out.length = 0;
    const table = state && state.combat && state.combat.entities;
    if (!table || typeof table !== 'object') {
      this.reset();
      return out;
    }
    const tick = Number.isInteger(state.tick)
      ? state.tick
      : Math.max(0, Math.floor(finite(state.simTime) * TICK_HZ));
    this._activeKeys.clear();
    const ids = Object.keys(table).sort();
    for (const id of ids) {
      const runtime = table[id];
      const entity = entityFor(state, id);
      if (!entity || entity.alive === false || !runtime || !runtime.subsystems) continue;
      const subsystemIds = Object.keys(runtime.subsystems).sort();
      for (const subsystemId of subsystemIds) {
        const subsystem = runtime.subsystems[subsystemId];
        const mode = stateMode(subsystem);
        if (!mode) continue;
        const key = `${String(entity.id)}:${subsystemId}`;
        this._activeKeys.add(key);
        let tracked = this._records.get(key);
        if (!tracked) {
          tracked = { mode, startTick: tick, lastPulseTick: tick - this.cadenceTicks, pulse: 0, expired: false };
          this._records.set(key, tracked);
        } else if (tracked.mode !== mode) {
          tracked.mode = mode;
          tracked.startTick = tick;
          tracked.lastPulseTick = tick - this.cadenceTicks;
          tracked.pulse = 0;
          tracked.expired = false;
        }
        const ageTicks = Math.max(0, tick - tracked.startTick);
        const duration = mode === 'dependencyCooling'
          ? Math.min(this.maxDurationTicks, 72)
          : this.maxDurationTicks;
        if (tracked.expired || ageTicks > duration) {
          tracked.expired = true;
          continue;
        }
        if (tick - tracked.lastPulseTick < this.cadenceTicks) continue;
        tracked.lastPulseTick = tick;
        const record = resolveDamagedPort(entity, runtime, subsystemId, {
          ageTicks,
          pulse: tracked.pulse,
        });
        tracked.pulse += 1;
        if (record) out.push(record);
      }
    }
    if (out.length > this.maxEmits) {
      out.sort((a, b) => (Number(b.destroyed) - Number(a.destroyed))
        || (b.severity - a.severity) || a.key.localeCompare(b.key));
      out.length = this.maxEmits;
    }
    for (const key of this._records.keys()) {
      if (!this._activeKeys.has(key)) this._records.delete(key);
    }
    if (this._records.size > this.maxTracked) {
      const stale = [...this._records.entries()].sort((a, b) => a[1].lastPulseTick - b[1].lastPulseTick);
      for (let i = 0; i < stale.length - this.maxTracked; i += 1) this._records.delete(stale[i][0]);
    }
    return out;
  }
}

export const DAMAGED_PORT_TICK_HZ = TICK_HZ;
