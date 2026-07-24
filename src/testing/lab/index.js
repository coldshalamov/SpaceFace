// Deterministic Gameplay Lab — public surface (Phase 3).

export { validateSimScenario, compileSimScenario, SIM_SCENARIO_SCHEMA } from '../../contracts/simScenarioSchema.js';
export { runLabScenario, validateLabScenario, SIM_DT } from './runScenario.js';
export { repeatScenario } from './repeat.js';
export { replayScenario, replayFailure } from './replay.js';
export { compareSaveLoad } from './saveLoadCompare.js';
export { buildCheckpoints, buildSemanticCheckpoint, buildDeterministicCoveredCheckpoint } from './checkpoint.js';
export { evaluateOracles } from './oracleEngine.js';
export { buildLabFailure } from './failureArtifact.js';
export { createInputTapeDriver, normalizeTape } from './inputTape.js';
export { resolveEntityProfile, buildEntitySpawnSpec, listEntityProfiles } from './entityProfiles.js';
export { registerMetric, getMetric, listMetrics } from './metricRegistry.js';
export {
  registerParameter,
  validateParameterOverlay,
  applyParameterOverlay,
  listRegisteredParameters,
} from './parameterOverlay.js';
