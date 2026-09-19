import { createEnemyMindState, EnemyMindRuntime } from './runtime.js';
import { cleanCopy } from './math.js';

/**
 * The only production world seam. Reads the clock/RNG, writes ONLY state.enemyMind,
 * publishes facts. No entities, combat data, renderer, action ports or physics writes.
 */
export function createEnemyMindPort({ stateProvider, emit = null, config = {} } = {}) {
  if (typeof stateProvider !== 'function') throw new TypeError('Enemy Mind port requires stateProvider');
  const { enabled = true, ...runtimeConfig } = config;
  if (!enabled) return null;
  const runtime = new EnemyMindRuntime(runtimeConfig);
  const state = () => {
    const current = stateProvider();
    if (!current || typeof current.rng !== 'function' || !Number.isFinite(current.simTime)) {
      throw new TypeError('Enemy Mind requires live GameState with rng and simTime');
    }
    if (!current.enemyMind) current.enemyMind = createEnemyMindState();
    return current;
  };
  return {
    update(frame) {
      const current = state();
      const previousSequence = current.enemyMind.eventSequence;
      const output = runtime.step({ ...frame, memory: current.enemyMind, rng: current.rng,
        simTime: current.simTime, tick: frame.tick });
      if (typeof emit === 'function') {
        // Never expose the authoritative record to event-bus listeners.
        for (const event of current.enemyMind.events) {
          if (event.sequence > previousSequence) emit(`ai:mind:${event.kind}`, Object.freeze(cleanCopy(event)));
        }
      }
      return output;
    },
    inspect(entityId = null) { return runtime.inspect(state().enemyMind, entityId); },
    snapshot() { return runtime.inspect(state().enemyMind); },
    restore(snapshot) {
      // Validate before replacing. Restore the WORLD RNG continuation alongside this snapshot.
      runtime.inspect(snapshot);
      state().enemyMind = cleanCopy(snapshot);
    },
    forget(entityId) { runtime.forget(state().enemyMind, entityId); },
  };
}
