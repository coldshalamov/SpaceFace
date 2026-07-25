// Authoritative system manifest — single source of truth for system IDs, init order,
// update order, slot markers, and Node-safety. This module is import-boundary pure:
// it does NOT import render/UI/audio/DOM system factories (directive §5).
//
// Callers materialize system objects via a systemLookup map (createRegistry provides
// the full browser table; Node sims provide a Node-safe subset).

import { LEGACY47A_SYSTEM_IDS, LEGACY47A_TACTICAL_SYSTEM_IDS } from './runtimeProfiles.js';

/** Platform presentation systems attached only on the browser registry path. */
export const PRESENTATION_PLATFORM_IDS = Object.freeze([
  'render',
  'vfx',
  'feel',
  'audio',
  'ui',
]);

const PRESENTATION_SET = new Set(PRESENTATION_PLATFORM_IDS);

/**
 * Production init order — matches createRegistry SYSTEMS (128 entries) at the Phase 2
 * baseline. Includes presentation platform IDs so the browser path can materialize an
 * identical full list; Node consumers filter with isNodeSafeSystemId.
 * Invariant: every PRODUCTION_UPDATE_ORDER id must also appear here (update ⊆ init).
 */
export const PRODUCTION_INIT_ORDER = Object.freeze([
  'core', 'voiceArbiter', 'input', 'autoTargetAssist', 'flybyFocus', 'bulletTime', 'cloak',
  'scanner', 'scanReveal', 'buildIdentity', 'lawSecurity', 'pirateDisguise', 'pirateParley',
  'pirateDisengage', 'aceMemory', 'barkDirector', 'aiSlot', 'dockingCorridor', 'physics',
  'aiPorts', 'tumbleStates', 'collisionConsequences', 'aiEncounter', 'actions', 'flightSlot',
  'cruise', 'weapons', 'countermeasures', 'impulseCharges', 'mines', 'massSeed',
  'uniqueLootAbilities', 'fields', 'planetRuntime', 'combat', 'combatOutcome', 'aftermathWrecks',
  'uniqueWrecks', 'wingMorale', 'tetherGameplay', 'surrenderRecovery', 'custodyConsequences',
  'masslineTelemetry', 'masslineThreats', 'masslineImpacts', 'masslineThrow',
  'masslineImpactDamage', 'lootShards', 'terrainAnchors', 'jettisonImpulse', 'mining',
  'fieldDepletion', 'cargo', 'fragileCargo', 'economy', 'automation', 'asteroidSites',
  'asteroidFormations', 'wingmen', 'intervention', 'lossLedger', 'factionPresence',
  'spawnBudget', 'world', 'regionalEcology', 'encounterDirector', 'routeFollower',
  'travelLanes', 'livingPoiBehaviors', 'pirateRumor', 'ambushSignatures', 'bountyHunt',
  'stationSideEventDirector', 'stationContacts', 'stationContactLoadBoundary',
  'gateControlDirector', 'salvage', 'lossInvestigation', 'salvageActions', 'survivorPod',
  'recoveryEncounter', 'factions', 'sectorSim', 'npcJobsRuntime', 'careerOrigins',
  'careerLadders', 'liveCareerLadderBranches', 'missions', 'careerContracts',
  'economyContracts', 'postEndingReplay', 'story', 'scenarioRuntime',
  'presentationOrchestrator', 'presentationAdapters', 'ships', 'crafting', 'heat', 'traffic',
  'drill', 'claims', 'beacons', 'bandRadio', 'v2FlavorRuntime', 'onboarding', 'masslineHud',
  // J6: massSeedHud is in UPDATE_ORDER (DOM-guarded HUD) — must also init so helpers bind.
  'massSeedHud', 'fieldHud', 'planetHud', 'sectorPostcard', 'dockDenyBanner', 'stationBroadcast',
  'hazardHints', 'bulkHaulTag', 'dangerGradient', 'causeLedger', 'customsPrompt',
  'cargoConscience', 'securityReadoutSystem', 'priceForecastSystem', 'contractClausesSystem',
  'moralTrapSystem', 'render', 'vfx', 'feel', 'audio', 'ui', 'save',
]);

/**
 * Production sim update order — matches createRegistry UPDATE_ORDER (96 entries).
 * Excludes pure render-phase systems; includes DOM-guarded HUD systems that no-op under Node.
 */
export const PRODUCTION_UPDATE_ORDER = Object.freeze([
  'input', 'autoTargetAssist', 'flybyFocus', 'bulletTime', 'cloak', 'lawSecurity', 'scanner',
  'scanReveal', 'buildIdentity', 'pirateDisguise', 'pirateParley', 'pirateDisengage',
  'aceMemory', 'factionPresence', 'aiSlot', 'barkDirector', 'aiEncounter', 'actions',
  'beacons', 'travelLanes', 'flightSlot', 'cruise', 'aiPorts', 'tumbleStates',
  'collisionConsequences', 'weapons', 'countermeasures', 'impulseCharges', 'mines', 'massSeed',
  'uniqueLootAbilities', 'dockingCorridor', 'fields', 'planetRuntime', 'physics', 'combat',
  'combatOutcome', 'aftermathWrecks', 'wingMorale', 'tetherGameplay', 'surrenderRecovery',
  'custodyConsequences', 'masslineTelemetry', 'masslineThreats', 'masslineImpacts',
  'masslineThrow', 'masslineImpactDamage', 'lootShards', 'terrainAnchors', 'jettisonImpulse',
  'mining', 'fieldDepletion', 'cargo', 'fragileCargo', 'automation', 'asteroidSites',
  'asteroidFormations', 'wingmen', 'crafting', 'economy', 'intervention', 'world',
  'regionalEcology', 'encounterDirector', 'routeFollower', 'livingPoiBehaviors', 'pirateRumor',
  'ambushSignatures', 'bountyHunt', 'stationSideEventDirector', 'gateControlDirector',
  'salvage', 'lossInvestigation', 'salvageActions', 'survivorPod', 'recoveryEncounter',
  'factions', 'sectorSim', 'npcJobsRuntime', 'missions', 'careerOrigins', 'careerLadders',
  'liveCareerLadderBranches', 'story', 'scenarioRuntime', 'heat', 'traffic', 'drill', 'claims',
  'bandRadio', 'onboarding', 'masslineHud', 'massSeedHud', 'fieldHud', 'planetHud',
  'voiceArbiter',
]);

/** Slot IDs resolved from settings.gameplay backends (not fixed module singletons). */
export const SLOT_SYSTEM_IDS = Object.freeze(['aiSlot', 'flightSlot']);

/**
 * Capability metadata for systems that need explicit classification.
 * Unlisted systems default to { nodeSafe: true, phase: 'sim' }.
 */
export const SYSTEM_CAPABILITIES = Object.freeze({
  core: Object.freeze({ nodeSafe: true, phase: 'core', capability: 'core' }),
  aiSlot: Object.freeze({ nodeSafe: true, phase: 'sim', capability: 'ai', slot: true }),
  flightSlot: Object.freeze({ nodeSafe: true, phase: 'sim', capability: 'flight', slot: true }),
  render: Object.freeze({ nodeSafe: false, phase: 'render', capability: 'presentation' }),
  vfx: Object.freeze({ nodeSafe: false, phase: 'render', capability: 'presentation' }),
  feel: Object.freeze({ nodeSafe: false, phase: 'render', capability: 'presentation' }),
  audio: Object.freeze({ nodeSafe: false, phase: 'platform', capability: 'presentation' }),
  ui: Object.freeze({ nodeSafe: false, phase: 'platform', capability: 'presentation' }),
  masslineHud: Object.freeze({ nodeSafe: true, phase: 'sim', capability: 'hud', domGuarded: true }),
  massSeedHud: Object.freeze({ nodeSafe: true, phase: 'sim', capability: 'hud', domGuarded: true }),
  fieldHud: Object.freeze({ nodeSafe: true, phase: 'sim', capability: 'hud', domGuarded: true }),
  planetHud: Object.freeze({ nodeSafe: true, phase: 'sim', capability: 'hud', domGuarded: true }),
  voiceArbiter: Object.freeze({ nodeSafe: true, phase: 'sim', capability: 'voice' }),
});

export function isPresentationPlatformId(id) {
  return PRESENTATION_SET.has(id);
}

export function isNodeSafeSystemId(id) {
  if (PRESENTATION_SET.has(id)) return false;
  const cap = SYSTEM_CAPABILITIES[id];
  if (cap && cap.nodeSafe === false) return false;
  return true;
}

export function getSystemCapability(id) {
  return SYSTEM_CAPABILITIES[id] || Object.freeze({ nodeSafe: true, phase: 'sim', capability: 'gameplay' });
}

/**
 * Authoritative init IDs for a named system set.
 * @param {'production'|'legacy47a'} systemSet
 * @param {{ tacticalAI?: boolean, nodeSafeOnly?: boolean }} [opts]
 */
export function getAuthoritativeInitOrder(systemSet, opts = {}) {
  let ids;
  if (systemSet === 'legacy47a') {
    ids = opts.tacticalAI ? LEGACY47A_TACTICAL_SYSTEM_IDS : LEGACY47A_SYSTEM_IDS;
    // createSimulation always prepends core; include it for full init identity when requested.
    if (opts.includeCore !== false) ids = Object.freeze(['core', ...ids]);
  } else {
    ids = PRODUCTION_INIT_ORDER;
  }
  if (opts.nodeSafeOnly) {
    return Object.freeze(ids.filter(isNodeSafeSystemId));
  }
  return ids;
}

/**
 * Authoritative update-order IDs for a named system set.
 * legacy47a uses the curated list order (createSimulation steps in registration order).
 */
export function getAuthoritativeUpdateOrder(systemSet, opts = {}) {
  let ids;
  if (systemSet === 'legacy47a') {
    const init = getAuthoritativeInitOrder('legacy47a', { ...opts, includeCore: false });
    ids = init;
  } else {
    ids = PRODUCTION_UPDATE_ORDER;
  }
  if (opts.nodeSafeOnly) {
    return Object.freeze(ids.filter(isNodeSafeSystemId));
  }
  return ids;
}

/** Stable manifest identity payload (IDs + capabilities only — no factories). */
export function getManifestIdentityPayload() {
  return {
    schema: 'spaceface.authoritativeSystemManifest.v1',
    productionInitOrder: PRODUCTION_INIT_ORDER,
    productionUpdateOrder: PRODUCTION_UPDATE_ORDER,
    legacy47aSystemIds: LEGACY47A_SYSTEM_IDS,
    presentationPlatformIds: PRESENTATION_PLATFORM_IDS,
    slotSystemIds: SLOT_SYSTEM_IDS,
  };
}
