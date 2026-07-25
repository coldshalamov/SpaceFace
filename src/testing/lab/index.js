// Deterministic Gameplay Lab — public surface (Phase 3 + Phase 4).

export {
  validateSimScenario,
  validateCanonicalScenario,
  compileSimScenario,
  SIM_SCENARIO_SCHEMA,
} from '../../contracts/simScenarioSchema.js';
export { runLabScenario, validateLabScenario, SIM_DT } from './runScenario.js';
export { repeatScenario } from './repeat.js';
export { replayScenario, replayFailure } from './replay.js';
export { compareSaveLoad } from './saveLoadCompare.js';
export {
  buildCheckpoints,
  buildSemanticCheckpoint,
  buildDeterministicCoveredCheckpoint,
  hashDeterministicSurface,
} from './checkpoint.js';
export {
  buildDeterministicSurface,
  DETERMINISTIC_COVERED,
  DETERMINISTIC_OMITTED,
  CHECKPOINT_COVERAGE_VERSION,
} from './deterministicSurface.js';
export { compareCheckpoints, localizeFirstDivergingTick, classifyDivergence } from './checkpointCompare.js';
export { runDifferentialReplay, runChromiumDeterminismCheck } from './differentialReplay.js';
export { runChromiumLabScenario, repeatChromiumLabScenario } from './chromiumHost.js';
export {
  runBrowserLabScenario,
  assertChromiumParitySupported,
  BROWSER_FOCUSED_FLIGHT_SYSTEMS,
} from './browserScenarioHost.js';
export {
  installLiveRouteBridge,
  assertLiveRouteScenarioSupported,
  LIVE_ROUTE_BRIDGE_API,
  LIVE_ROUTE_BRIDGE_FORBIDDEN,
  LAB_LIVE_ROUTE_TIME_SOURCE,
} from './liveRouteBridge.js';
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
