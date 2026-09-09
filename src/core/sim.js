// Headless simulation host.
//
// Contract:
//   SimSystem = { name:string, init?(ctx), update?(dt,state) }
//   ctx       = { state, bus, helpers, registry }
//
// The contract intentionally exposes no renderer, Three.js object, DOM, wall clock, or animation
// frame. A caller supplies an ordered list of gameplay systems; the host forks each module singleton
// into an isolated runtime instance, initializes core first, and advances exactly one authoritative
// step per call. The existing fixed-timestep accumulator remains in loop.js; this module is the pure
// step target used by browsers, tests, audits, replays, workers, and offscreen sector simulation.

import { createBus } from './eventBus.js';
import { createGameState } from './gameState.js';
import { core as coreDefinition } from './coreSystem.js';

export const SIM_DT = 1 / 60;

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

function forkSystem(definition) {
  if (!definition || typeof definition !== 'object') throw new TypeError('Sim system must be an object');
  if (typeof definition.name !== 'string' || !definition.name) throw new TypeError('Sim system requires a name');
  if (definition.runtime === 'render') throw new TypeError(`Render system "${definition.name}" cannot enter the sim host`);
  if (definition.init != null && typeof definition.init !== 'function') throw new TypeError(`${definition.name}.init must be a function`);
  if (definition.update != null && typeof definition.update !== 'function') throw new TypeError(`${definition.name}.update must be a function`);

  // Existing systems are exported module singletons whose methods use `this`. A prototype fork keeps
  // their code and identity contract while isolating all runtime fields (state, RNG, accumulators).
  const instance = Object.create(definition);
  Object.defineProperty(instance, 'definition', { value: definition, enumerable: false });
  return instance;
}

/**
 * Build and initialize an isolated, deterministic simulation runtime.
 *
 * @param {{
 *   seed?: number,
 *   state?: object,
 *   bus?: object,
 *   helpers?: object,
 *   systems?: object[],
 *   updateOrder?: object[],
 *   runtimeManifest?: object,
 *   runtimeConfig?: object,
 * }} options
 *
 * Init vs step order:
 * - `systems` is the registration/init list (plus core, always first).
 * - `updateOrder`, when an array (including empty), is the per-tick step sequence.
 *   An empty array means step zero systems (focused labs that only need init/event handlers).
 *   When omitted/undefined, every non-core init system is stepped in registration order.
 * - Systems present only in `updateOrder` are forked for stepping but not auto-inited,
 *   matching createRegistry (SYSTEMS init, UPDATE_ORDER step).
 *
 * Evidence classification:
 * - When `options.systems` is supplied without a production profile resolve, the run is
 *   `focused-explicit` and must not claim production-manifest evidence.
 * - When `options.runtimeManifest` is attached (from resolveRuntimeManifest / createAuthoritativeRuntime),
 *   its evidenceClass is preserved on the returned host.
 */
export function createSimulation(options = {}) {
  const seed = ((Number(options.seed) >>> 0) || 1);
  const state = options.state || createGameState(seed);
  const bus = options.bus || createBus();
  const helpers = options.helpers || {};
  const definitions = [coreDefinition, ...(options.systems || [])];
  const names = new Set();
  const instances = [];

  for (const definition of definitions) {
    if (names.has(definition && definition.name)) {
      throw new Error(`Duplicate sim system: ${definition && definition.name}`);
    }
    const instance = forkSystem(definition);
    names.add(instance.name);
    instances.push(instance);
  }

  const core = instances[0];
  const byName = new Map(instances.map((system) => [system.name, system]));

  // Optional production update order: step this sequence, not the init registration list.
  // Distinguish absent (default: all init systems) from explicit empty [] (step zero systems).
  const hasExplicitUpdateOrder = Array.isArray(options.updateOrder);
  let updates;
  if (hasExplicitUpdateOrder) {
    updates = [];
    for (const definition of options.updateOrder) {
      const name = definition && definition.name;
      if (!name) throw new TypeError('updateOrder entry requires a name');
      let instance = byName.get(name);
      if (!instance) {
        // Update-only systems (e.g. some HUD surfaces): fork for step, do not init (browser parity).
        instance = forkSystem(definition);
        byName.set(name, instance);
      }
      updates.push(instance);
    }
  } else {
    updates = instances.slice(1);
  }

  let initialized = false;
  let stepping = false;

  const explicitSystemIds = Object.freeze(
    (options.systems || []).map((s) => (s && s.name) || null).filter(Boolean),
  );
  const runtimeManifest = options.runtimeManifest || null;
  const runtimeConfig = options.runtimeConfig || null;
  const evidenceClassification = Object.freeze({
    class: runtimeManifest && runtimeManifest.evidenceClass
      ? runtimeManifest.evidenceClass
      : (options.systems ? 'focused-explicit' : 'unspecified'),
    systemIds: explicitSystemIds,
    exclusions: Object.freeze([
      ...((runtimeManifest && runtimeManifest.exclusions) || []),
      ...(options.systems && !(runtimeManifest && runtimeManifest.evidenceClass === 'production-manifest')
        ? ['production-manifest-claim']
        : []),
    ]),
    note: options.systems && !(runtimeManifest && runtimeManifest.evidenceClass === 'production-manifest')
      ? 'Focused explicit system list — may not claim production-manifest evidence'
      : null,
  });

  if (runtimeConfig && state) {
    state.runtime = Object.freeze({
      profileId: runtimeConfig.profileId,
      features: runtimeConfig.features,
      evidenceClass: evidenceClassification.class,
      exclusions: evidenceClassification.exclusions,
      profileHash: runtimeManifest && runtimeManifest.profileHash,
      manifestHash: runtimeManifest && runtimeManifest.manifestHash,
    });
  }

  const ctx = { state, bus, helpers, registry: null };
  const registry = {
    runtime: 'sim',
    systems: Object.freeze(instances.slice()),
    runtimeManifest,
    evidenceClassification,
    ctx,
    get(name) { return byName.get(name) || null; },
    init() {
      if (initialized) return registry;
      initialized = true;
      for (const system of instances) if (system.init) system.init(ctx);
      return registry;
    },
    step(dt = SIM_DT) {
      if (!initialized) throw new Error('Simulation is not initialized');
      if (stepping) throw new Error('Simulation step is not re-entrant');
      if (!(Number.isFinite(dt) && dt > 0)) throw new RangeError('Simulation dt must be finite and > 0');
      stepping = true;
      // Tier-1 causal counting, mirroring createRegistry's production step. This registry is a
      // separate implementation, so without this the sim-side families read zero on every harness
      // that drives createSimulation — a counter that fails toward good news. One hoisted boolean
      // per step; counts never touch state, rng or ordering, so goldens are unaffected.
      const tier1 = state.perfRuntime && state.perfRuntime.tier1;
      const countSystems = !!tier1 && tier1.isEnabled();
      try {
        if (core.preStep) {
          if (countSystems) tier1.countSystemInvocation('core.preStep');
          core.preStep(dt, state);
        }
        for (const system of updates) {
          if (!system.update) continue;
          if (countSystems) tier1.countSystemInvocation(system.name);
          system.update(dt, state);
        }
        if (core.lifetimeSweep) {
          if (countSystems) tier1.countSystemInvocation('core.lifetimeSweep');
          core.lifetimeSweep(dt, state);
        }
      } finally {
        stepping = false;
      }
      return state;
    },
  };
  ctx.registry = registry;
  registry.init();

  return Object.freeze({
    state,
    bus,
    helpers,
    registry,
    runtimeManifest,
    evidenceClassification,
    step(dt = SIM_DT) { return registry.step(dt); },
    runTicks(count, dt = SIM_DT) {
      const ticks = positiveInt(count, -1);
      if (ticks < 0) throw new RangeError('Tick count must be a non-negative integer');
      for (let i = 0; i < ticks; i++) registry.step(dt);
      return state;
    },
    spawn(spec) {
      if (typeof helpers.spawnEntity !== 'function') throw new Error('Core spawn helper is unavailable');
      return helpers.spawnEntity(spec);
    },
    dispose() { if (bus && typeof bus.clear === 'function') bus.clear(); },
  });
}
