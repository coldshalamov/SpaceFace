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
 * Production init order — matches the createRegistry production system set.
 * baseline. Includes presentation platform IDs so the browser path can materialize an
 * identical full list; Node consumers filter with isNodeSafeSystemId.
 * Invariant: every PRODUCTION_UPDATE_ORDER id must also appear here (update ⊆ init).
 */
export const PRODUCTION_INIT_ORDER = Object.freeze([
  'core', 'runSession', 'survivalWave', 'survivalRewards', 'survivalDraft', 'survivalResults', 'killReplay', 'killcamRecorder',
  'survivalAnnounce', 'survivalArena', 'swarmArena', 'swarmSupply', 'swarmChain', 'survivalRun', 'voiceArbiter', 'input', 'autoTargetAssist', 'flybyFocus', 'bulletTime', 'cloak',
  'scanner', 'scanReveal', 'buildIdentity', 'lawSecurity', 'pirateDisguise', 'pirateParley',
  'pirateDisengage', 'aceMemory', 'barkDirector', 'aiSlot', 'dockingCorridor', 'physics',
  'aiPorts', 'tumbleStates', 'collisionConsequences', 'stuntGrammar', 'aiEncounter', 'actions', 'flightSlot',
  'cruise', 'weapons', 'countermeasures', 'impulseCharges', 'mines', 'bombs', 'emergentPrimitives', 'massSeed',
  'uniqueLootAbilities', 'fields', 'environmentalMachinery', 'planetRuntime', 'combat', 'combatOutcome', 'aftermathWrecks',
  // Packet 09 (Three Capitals): the score system validates helpers.routeCombatDamage /
  // getCombatCapabilities at init, so it initialises after the combat kernel installs them.
  'capitalBossEncounters',
  'uniqueWrecks', 'titles', 'wingMorale', 'tetherGameplay', 'surrenderRecovery', 'custodyConsequences',
  'masslineTelemetry', 'masslineThreats', 'masslineImpacts', 'masslineSnares', 'masslineThrow',
  'masslineImpactDamage', 'lootShards', 'terrainAnchors', 'jettisonImpulse', 'mining',
  'fieldDepletion', 'cargo', 'fragileCargo', 'economy', 'automation', 'asteroidSites',
  'asteroidFormations', 'wingmen', 'intervention', 'lossLedger', 'provenanceLedger', 'chronicler', 'factionPresence',
  'spawnBudget', 'world', 'heistFacilities', 'regionalEcology', 'tensionDirector', 'encounterDirector',
  // Nemesis packet: the arc engine (nemesis) decides and schedules, the encounter host
  // (nemesisEncounter) drains one spawn request per fixed step, and nemesisSignals routes
  // voice/toast receipts — event-only, registered but never ticked.
  'nemesis', 'nemesisEncounter', 'nemesisSignals', 'routeFollower',
  'travelLanes', 'livingPoiBehaviors', 'pirateRumor', 'ambushSignatures', 'bountyHunt',
  'stationSideEventDirector', 'stationContacts', 'stationContactLoadBoundary',
  'stationServices', 'difficultyDirector',
  'gateControlDirector', 'salvage', 'lossInvestigation', 'salvageActions', 'survivorPod',
  'recoveryEncounter', 'factions', 'sectorSim', 'npcJobsRuntime', 'careerOrigins',
  'careerLadders', 'liveCareerLadderBranches', 'missions', 'careerContracts',
  'economyContracts', 'postEndingReplay', 'story', 'scenarioRuntime',
  'presentationOrchestrator', 'presentationAdapters', 'ships', 'crafting', 'heat', 'traffic',
  'drill', 'claims', 'beacons', 'bandRadio', 'v2FlavorRuntime', 'onboarding', 'masslineHud',
  // J6: massSeedHud is in UPDATE_ORDER (DOM-guarded HUD) — must also init so helpers bind.
  'massSeedHud', 'fieldHud', 'planetHud', 'survivalHud', 'crucibleFocus', 'sectorPostcard', 'dockDenyBanner', 'stationBroadcast',
  'hazardHints', 'bulkHaulTag', 'dangerGradient', 'causeLedger', 'customsPrompt',
  // impoundPayPrompt and moralTrapPrompt are event-only like customsPrompt — init order
  // matters (bus subscriptions); both are deliberately absent from PRODUCTION_UPDATE_ORDER.
  'impoundPayPrompt', 'moralTrapPrompt',
  'cargoConscience', 'securityReadoutSystem', 'priceForecastSystem', 'contractClausesSystem',
  'moralTrapSystem', 'render', 'vfx', 'feel', 'audio', 'ui', 'save',
]);

/**
 * Production sim update order — matches createRegistry UPDATE_ORDER.
 * Excludes pure render-phase systems; includes DOM-guarded HUD systems that no-op under Node.
 * `save` ticks last so interval autosave actually runs (event saves still fire from their owners).
 */
export const PRODUCTION_UPDATE_ORDER = Object.freeze([
  'input', 'autoTargetAssist', 'flybyFocus', 'bulletTime', 'cloak', 'lawSecurity', 'scanner',
  'scanReveal', 'buildIdentity', 'pirateDisguise', 'pirateParley', 'pirateDisengage',
  'aceMemory', 'factionPresence',
  // Nemesis ordering contract (integration notes §2): engine → encounter host → tacticalAI,
  // so the AI sees spawned rival entities and current fire gates on the same fixed tick.
  // Packet 09 ordering contract (integration notes §3): the capital score sits immediately
  // before the tactical slot so its published orders precede AI action consumption on the SAME
  // fixed tick, and its observation reads the subsystem/status transitions the previous tick's
  // combat pass committed (kernel capabilities are effective by then). The fire gate itself also
  // re-runs inside tacticalAI on both full-decision and cached ticks, so a score-owned capital
  // can never double-fire through stock intent.
  'nemesis', 'nemesisEncounter', 'capitalBossEncounters', 'aiSlot', 'barkDirector', 'aiEncounter', 'actions',
  'beacons', 'travelLanes', 'flightSlot', 'cruise', 'aiPorts', 'tumbleStates',
  // Bombs and emergent primitives read the shared chargeDetonate edge before impulseCharges consumes it.
  'collisionConsequences', 'stuntGrammar', 'weapons', 'countermeasures', 'bombs', 'emergentPrimitives', 'impulseCharges', 'mines', 'massSeed',
  'uniqueLootAbilities', 'dockingCorridor', 'environmentalMachinery',
  // Arena toys intercept shots and update field strengths before fields and physics resolve this tick.
  'survivalArena', 'fields', 'planetRuntime', 'physics', 'combat',
  'combatOutcome', 'aftermathWrecks', 'titles', 'wingMorale', 'tetherGameplay', 'surrenderRecovery',
  'custodyConsequences', 'masslineTelemetry', 'masslineThreats', 'masslineImpacts',
  'masslineSnares', 'masslineThrow', 'masslineImpactDamage', 'lootShards', 'terrainAnchors', 'jettisonImpulse',
  'mining', 'fieldDepletion', 'cargo', 'fragileCargo', 'automation', 'asteroidSites',
  'asteroidFormations', 'wingmen', 'crafting', 'economy', 'intervention', 'world',
  'heistFacilities',
  'regionalEcology', 'tensionDirector', 'encounterDirector', 'routeFollower', 'livingPoiBehaviors', 'pirateRumor',
  'ambushSignatures', 'bountyHunt', 'stationSideEventDirector', 'stationServices',
  'difficultyDirector', 'gateControlDirector',
  'salvage', 'lossInvestigation', 'salvageActions', 'survivorPod', 'recoveryEncounter',
  'factions', 'sectorSim', 'npcJobsRuntime', 'missions', 'careerOrigins', 'careerLadders',
  'liveCareerLadderBranches', 'story', 'scenarioRuntime',
  // survivalWave: materializes the planned wave through spawnBudget and reports the cleared
  // receipt. Immediately before survivalRun so a wave cleared this tick advances the phase this tick.
  // survivalRun: Survival phase machine. After combat/world/spawn/scenario receipts this tick
  // (wave-cleared arrives as an explicit event, never an entity count); before heat/HUD/presentation.
  'swarmArena', 'survivalWave', 'survivalRun',
  // swarmChain: the kill chain. It ticks only to notice a lapse, and it reads the phase
  // survivalRun has already settled this tick.
  // killcamRecorder: the instant kill-cam tape (DEMO_READINESS §4). A read-only pose
  // recorder over the same settled phase and entity list, one slot after the kill-replay
  // ring; it writes nothing but its own ring buffers.
  'swarmChain', 'killReplay', 'killcamRecorder',
  'heat', 'traffic', 'drill', 'claims', 'chronicler',
  'bandRadio', 'onboarding', 'masslineHud', 'massSeedHud', 'fieldHud', 'planetHud',
  // survivalHud: the Crucible run readout. After survivalRun/survivalWave so it reads the phase
  // and census this tick advanced to; DOM-guarded so Node no-ops.
  'survivalHud',
  // crucibleFocus: hides campaign-only panels while a Crucible run is live. Reads the phase after
  // the readout above has, and only ever toggles one class on the UI root.
  'crucibleFocus',
  'voiceArbiter',
  'save',
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
  survivalHud: Object.freeze({ nodeSafe: true, phase: 'sim', capability: 'hud', domGuarded: true }),
  crucibleFocus: Object.freeze({ nodeSafe: true, phase: 'sim', capability: 'hud', domGuarded: true }),
  swarmChain: Object.freeze({ nodeSafe: true, phase: 'sim', capability: 'run' }),
  killcamRecorder: Object.freeze({ nodeSafe: true, phase: 'sim', capability: 'run' }),
  massSeedHud: Object.freeze({ nodeSafe: true, phase: 'sim', capability: 'hud', domGuarded: true }),
  fieldHud: Object.freeze({ nodeSafe: true, phase: 'sim', capability: 'hud', domGuarded: true }),
  planetHud: Object.freeze({ nodeSafe: true, phase: 'sim', capability: 'hud', domGuarded: true }),
  voiceArbiter: Object.freeze({ nodeSafe: true, phase: 'sim', capability: 'voice' }),
  save: Object.freeze({ nodeSafe: true, phase: 'sim', capability: 'persistence' }),
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

/** Combat-island clocks. Table stays 60 Hz; calendar is 1–2 Hz; glass never catch-up. */
export const SYSTEM_CLOCK = Object.freeze({
  TABLE: 'table',
  NEAR: 'near',
  CALENDAR: 'calendar',
  GLASS: 'glass',
});

/** 2 Hz on the 60 Hz step. Tick 0 always runs so short lab boots still initialize calendar state. */
export const CALENDAR_CLOCK_PERIOD_TICKS = 30;

export const CALENDAR_CLOCK_IDS = Object.freeze([
  'buildIdentity', 'aceMemory', 'factionPresence', 'barkDirector', 'beacons', 'travelLanes',
  'automation', 'asteroidSites', 'asteroidFormations', 'crafting', 'economy', 'intervention',
  'heistFacilities', 'regionalEcology', 'tensionDirector', 'encounterDirector', 'routeFollower', 'livingPoiBehaviors',
  'pirateRumor', 'ambushSignatures', 'bountyHunt', 'stationSideEventDirector', 'gateControlDirector',
  'salvage', 'lossInvestigation', 'salvageActions', 'survivorPod', 'recoveryEncounter',
  'factions', 'sectorSim', 'missions', 'careerOrigins', 'careerLadders', 'liveCareerLadderBranches',
  'story', 'scenarioRuntime', 'drill', 'claims', 'bandRadio', 'onboarding', 'save',
  // Ecology/morale are event-driven; the 60 Hz tick only expires or reseeds. 2 Hz is enough.
  'aftermathWrecks', 'wingMorale',
  // Event-driven owners whose update() is an empty registry placeholder.
  'terrainAnchors', 'jettisonImpulse', 'masslineImpactDamage',
]);

export const NEAR_CLOCK_IDS = Object.freeze([
  'flybyFocus', 'scanner', 'scanReveal', 'lawSecurity', 'pirateDisguise', 'pirateParley',
  'pirateDisengage', 'aiSlot', 'aiPorts', 'aiEncounter', 'traffic', 'titles', 'planetRuntime',
  'npcJobsRuntime',
  // Observer receipts; primary ticks already throttle internally. Catch-up extra steps
  // must not rescan the island just to notice a flee flag.
  'combatOutcome',
  // Dirty-flag mass recompute; catch-up extra steps do not change the hold.
  'cargo',
]);

const CLOCK_BY_ID = new Map();
for (const id of CALENDAR_CLOCK_IDS) CLOCK_BY_ID.set(id, SYSTEM_CLOCK.CALENDAR);
for (const id of NEAR_CLOCK_IDS) CLOCK_BY_ID.set(id, SYSTEM_CLOCK.NEAR);

export function getSystemClock(id) {
  // Hosts partition instantiated systems by name, after resolving manifest slots. Both AI
  // backends must retain aiSlot's near clock or every extra catch-up step repeats full AI.
  const clockId = id === 'ai' || id === 'tacticalAI' ? 'aiSlot' : id;
  const mapped = CLOCK_BY_ID.get(clockId);
  if (mapped) return mapped;
  const cap = SYSTEM_CAPABILITIES[id];
  const kind = cap && cap.capability;
  if (kind === 'hud' || kind === 'voice' || kind === 'presentation') return SYSTEM_CLOCK.GLASS;
  return SYSTEM_CLOCK.TABLE;
}

/** 60 Hz combat island: table + near + glass. Calendar owners are not in this list. */
export const PRODUCTION_COMBAT_UPDATE_ORDER = Object.freeze(
  PRODUCTION_UPDATE_ORDER.filter((id) => getSystemClock(id) !== SYSTEM_CLOCK.CALENDAR),
);

/** 1–2 Hz / event calendar pass, original relative order preserved. */
export const PRODUCTION_CALENDAR_UPDATE_ORDER = Object.freeze(
  PRODUCTION_UPDATE_ORDER.filter((id) => getSystemClock(id) === SYSTEM_CLOCK.CALENDAR),
);

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
