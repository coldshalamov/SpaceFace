// Arena boot. createSimulation plus the live physics owner.
// scripts/lib/bench/realPath.mjs and createAuthoritativeRuntime.js both evaluate
// src/systems/tacticalAI.js at import time. This tape must not.

import { SIM_DT, createSimulation } from '../../src/core/sim.js';
import { physics } from '../../src/core/physics.js';
import { makeShipEntitySpec } from '../../src/systems/ships.js';
import { readPhysicsTelemetry } from '../../src/core/physicsAuthority.js';
import {
  applyFeatureConfigToMaps,
  combatFlag,
  massline2Flag,
  restoreFeatureMaps,
  snapshotFeatureMaps,
} from '../../src/data/featureFlags.js';
import { PRODUCTION_FEATURES } from '../../src/runtime/runtimeProfiles.js';

export const OPEN_SPACE_BOUNDS = Object.freeze({
  center: { x: 0, z: 0 },
  radius: 12000,
  hardRadius: 12500,
});

/** True only after src/systems/tacticalAI.js has executed. */
export function tacticalAiModuleEvaluated() {
  return globalThis.__SF_TACTICAL_AI_EVALUATED__ === true;
}

export function realPathProof(runtime) {
  const physicsSys = runtime && typeof runtime.getSystem === 'function' ? runtime.getSystem('physics') : null;
  const diag = (physicsSys && physicsSys._diag) || {};
  const gameplay = (runtime && runtime.state && runtime.state.settings && runtime.state.settings.gameplay) || {};
  return {
    backend: String(diag.backend || 'none'),
    sg02Ready: diag.sg02Ready === true,
    sg02Bodies: Number.isFinite(diag.sg02Bodies) ? diag.sg02Bodies : 0,
    sg02DynamicBodies: Number.isFinite(diag.sg02DynamicBodies) ? diag.sg02DynamicBodies : 0,
    rapierContacts: Number.isFinite(diag.rapierContacts) ? diag.rapierContacts : 0,
    contactCaptureEnabled: !!(physicsSys && physicsSys._sg02 && physicsSys._sg02.captureContactImpacts),
    featuresOutsideStep: {
      tumble: massline2Flag('tumble') === true,
      weaponImpulseConsequences: combatFlag('weaponImpulseConsequences') === true,
    },
    physicsBackend: String(gameplay.physicsBackend || 'none'),
    flightBackend: String(gameplay.flightBackend || 'none'),
    aiBackend: String(gameplay.aiBackend || 'none'),
    profileId: String((runtime && runtime.config && runtime.config.profileId) || 'unknown'),
  };
}

export function writeRealPathInput(state, input = {}) {
  const packet = state.input;
  packet.moveX = finiteAxis(input.moveX);
  packet.moveZ = finiteAxis(input.moveZ);
  packet.turnIntent = finiteAxis(input.turnIntent);
  packet.boost = !!input.boost;
  packet.brake = !!input.brake;
  packet.fire = !!input.fire;
  if (!packet.actions) packet.actions = {};
  packet.actions.brake = packet.brake;
  packet.actions.autopursuit = false;
  return packet;
}

function finiteAxis(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}

function withProductionFeatures(fn) {
  const previous = snapshotFeatureMaps();
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  try {
    return fn();
  } finally {
    restoreFeatureMaps(previous);
  }
}

export async function bootArena({ seed, systems, hulls = [], prepareState = null, bounds = null } = {}) {
  if (!Number.isFinite(seed)) throw new Error('bootArena: seed must be a finite number');
  const resolved = Array.isArray(systems) ? systems.slice() : [];
  if (!resolved.some((system) => system && system.name === 'physics')) resolved.push(physics);
  const sim = createSimulation({
    seed,
    systems: resolved,
    runtimeConfig: { profileId: 'production', features: PRODUCTION_FEATURES },
  });
  const { state } = sim;
  state.mode = 'flight';
  if (bounds) state.bounds = bounds;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  if (!state.input.actions) state.input.actions = { brake: false, autopursuit: false };
  if (typeof prepareState === 'function') prepareState({ state, runtime: sim });

  const runtime = {
    state,
    bus: sim.bus,
    config: { profileId: 'production', features: PRODUCTION_FEATURES },
    getHelpers() { return sim.helpers; },
    getSystem(name) { return sim.registry.get(name); },
    step(dt) {
      return withProductionFeatures(() => sim.step(dt));
    },
    spawn(spec) { return sim.spawn(spec); },
    dispose() { sim.dispose(); },
  };

  const host = {
    runtime,
    state,
    bus: sim.bus,
    dt: SIM_DT,
    player: null,
    hulls: [],
    spawnShip({ hullId, pos, rot = 0, isPlayer = false, team = isPlayer ? 0 : 1, factionId, fittings = [] } = {}) {
      const spec = makeShipEntitySpec(hullId, {
        isPlayer,
        player: isPlayer ? state.player : undefined,
        fittings,
        pos,
        rot,
        team,
        ...(factionId ? { factionId } : {}),
      });
      const entity = runtime.spawn(spec);
      if (isPlayer) {
        state.playerId = entity.id;
        host.player = entity;
      }
      return entity;
    },
    spawnObstacle({ pos, radius = 22, mass = 480, inertiaY = 220, hull = 400, dynamic = false, vel = { x: 0, z: 0 }, data = null } = {}) {
      return runtime.spawn({
        type: 'asteroid',
        pos,
        vel: { x: vel.x || 0, z: vel.z || 0 },
        rot: 0,
        radius,
        mass,
        collides: true,
        hull,
        hullMax: hull,
        physicsBody: {
          schemaVersion: 1,
          radius,
          mass,
          inertiaY,
          dynamic,
          ccd: false,
          material: 'asteroid',
          revision: 0,
        },
        data: data || { benchRealPath: 'obstacle' },
      });
    },
    step(ticks) {
      const count = Math.max(0, ticks | 0);
      for (let i = 0; i < count; i += 1) runtime.step(SIM_DT);
      return count;
    },
    dispose() { runtime.dispose(); },
  };

  for (const spawn of hulls) host.hulls.push(host.spawnShip(spawn));
  const physicsSys = runtime.getSystem('physics');
  if (!physicsSys || typeof physicsSys.prepareBackend !== 'function') {
    throw new Error('bootArena: physics.prepareBackend missing');
  }
  let ready = false;
  const previous = snapshotFeatureMaps();
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  try {
    ready = await physicsSys.prepareBackend(state, { reset: true });
  } finally {
    restoreFeatureMaps(previous);
  }
  if (ready !== true) throw new Error('bootArena: SG-02 dynamic authority failed to become ready');
  return host;
}
