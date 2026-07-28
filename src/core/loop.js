// Compatibility entry point for the one main-thread game loop. Simulation and presentation now have
// explicit owners, while callers retain the established startLoop and fixed-timestep imports.
import {
  advanceFixedTimestep,
  createSimulationRunner,
  LOOP_FIXED_DT,
  MAX_CATCHUP_STEPS,
} from './simulationRunner.js';
import {
  createPresentationRunner,
  LOOP_LIFECYCLE_STATES,
} from './presentationRunner.js';

export {
  advanceFixedTimestep,
  createPresentationRunner,
  createSimulationRunner,
  LOOP_FIXED_DT,
  LOOP_LIFECYCLE_STATES,
  MAX_CATCHUP_STEPS,
};

/**
 * Compose the authoritative main-thread SimulationRunner with the single PresentationRunner.
 * No second loop or compatibility authority remains behind this adapter.
 */
export function startLoop(state, registry, deps = {}) {
  const simulationRunner = deps.simulationRunner || createSimulationRunner(state, registry, deps);
  return createPresentationRunner(state, registry, simulationRunner, deps);
}
