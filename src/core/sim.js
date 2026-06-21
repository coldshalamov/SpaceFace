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
 * @param {{seed?:number,state?:object,bus?:object,helpers?:object,systems?:object[]}} options
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
  const updates = instances.slice(1);
  const byName = new Map(instances.map((system) => [system.name, system]));
  let initialized = false;
  let stepping = false;

  const ctx = { state, bus, helpers, registry: null };
  const registry = {
    runtime: 'sim',
    systems: Object.freeze(instances.slice()),
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
      try {
        if (core.preStep) core.preStep(dt, state);
        for (const system of updates) if (system.update) system.update(dt, state);
        if (core.lifetimeSweep) core.lifetimeSweep(dt, state);
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
