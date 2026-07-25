// Deterministic Gameplay Lab — public surface (Phase 3 + Phase 4).

export {
  validateSimScenario,
  validateCanonicalScenario,
  compileSimScenario,
  SIM_SCENARIO_SCHEMA,
} from '../../contracts/simScenarioSchema.js';
export {
  runLabScenario,
  runLabScenarioInternal,
  validateLabScenario,
  SIM_DT,
} from './runScenario.js';
export { repeatScenario } from './repeat.js';
export { replayScenario, replayFailure } from './replay.js';
export { compareSaveLoad } from './saveLoadCompare.js';
export {
  // Q1: sealEquivalenceResult is module-private inside parent executors (WeakSet identity).
  // Not exported from barrel, authority, or any importable seal file.
  isAuthoritativeEquivalenceResult,
  isPromotableLabResult,
  EQUIVALENCE_EXECUTOR_SOURCES,
} from './equivalenceAuthority.js';
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
export {
  runChromiumLabScenario,
  runChromiumLabScenarioInternal,
  repeatChromiumLabScenario,
} from './chromiumHost.js';
export {
  runBrowserLabScenario,
  runBrowserLabScenarioInternal,
  assertChromiumParitySupported,
  BROWSER_FOCUSED_FLIGHT_SYSTEMS,
  BROWSER_PARITY_SYSTEM_NAMES,
  normalizeBrowserSystemNames,
  normalizeBrowserSystemNamesPreserveOrder,
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
