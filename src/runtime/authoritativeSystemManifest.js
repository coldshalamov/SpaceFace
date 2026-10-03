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
  'cruise', 'weapons', 'countermeasures', 'impulseCharges', 'hullBurst', 'mines', 'bombs', 'emergentPrimitives', 'massSeed',
  'uniqueLootAbilities', 'fields', 'environmentalMachinery', 'planetRuntime', 'combat', 'combatOutcome', 'aftermathWrecks',
  // Packet 09 (Three Capitals): the score system validates helpers.routeCombatDamage /
  // getCombatCapabilities at init, so it initialises after the combat kernel installs them.
  'capitalBossEncounters',
  // memorialThief is a uniqueWrecks sub-object (no id, no clock). Do not add it here.
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
  'gateControlDirector', 'morrow', 'vesper', 'salvage', 'lossInvestigation', 'salvageActions', 'survivorPod',
  'recoveryEncounter', 'factions', 'sectorSim', 'npcJobsRuntime', 'careerOrigins',
  'careerLadders', 'liveCareerLadderBranches', 'missions', 'careerContracts',
  'economyContracts', 'postEndingReplay', 'story', 'scenarioRuntime',
  'presentationOrchestrator', 'presentationAdapters', 'ships', 'crafting', 'heat', 'traffic',
  'drill', 'claims', 'beacons', 'bandRadio', 'v2FlavorRuntime', 'onboarding', 'masslineHud',
  // J6: massSeedHud is in UPDATE_ORDER (DOM-guarded HUD) — must also init so helpers bind.
  // miningHud: the mining beam's vent/rich-core/seam instrument — event-mirrored, DOM-guarded,
  // ticks only to place the world-anchored dial (same posture as the sibling HUDs).
  'massSeedHud', 'fieldHud', 'planetHud', 'miningHud', 'survivalHud', 'crucibleFocus', 'sectorPostcard', 'dockDenyBanner', 'stationBroadcast',
  'hazardHints', 'noFireAdvisory', 'bulkHaulTag', 'dangerGradient', 'causeLedger', 'customsPrompt',
  // impoundPayPrompt, moralTrapPrompt and wreckChoicePrompt are event-only like customsPrompt —
  // init order matters (bus subscriptions); all are deliberately absent from
  // PRODUCTION_UPDATE_ORDER.
  'impoundPayPrompt', 'moralTrapPrompt', 'wreckChoicePrompt',
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
  'collisionConsequences', 'stuntGrammar', 'weapons', 'countermeasures', 'bombs', 'emergentPrimitives', 'impulseCharges', 'hullBurst', 'mines', 'massSeed',
  'uniqueLootAbilities', 'dockingCorridor', 'environmentalMachinery',
  // Arena toys intercept shots and update field strengths before fields and physics resolve this tick.
  'survivalArena', 'fields', 'planetRuntime', 'morrow', 'vesper', 'physics', 'combat',
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
  'bandRadio', 'onboarding', 'masslineHud', 'massSeedHud', 'fieldHud', 'planetHud', 'miningHud',
  // survivalHud: the Crucible run readout. After survivalRun/survivalWave so it reads the phase
  // and census this tick advanced to; DOM-guarded so Node no-ops.
  'survivalHud',
  // crucibleFocus: hides campaign-only panels while a Crucible run is live. Reads the phase after
  // the readout above has, and only ever toggles one class on the UI root.
  'crucibleFocus',
  // noFireAdvisory: the station no-fire ring watch. Its tick only tracks ring inside/outside so an
  // exit re-arms the advisory bark — observer-only, writes nothing the sim consumes.
  'noFireAdvisory',
  // moralTrapSystem: the trap-reveal drive. Its tick fires only a same-sector fork whose
  // short post-undock delay has elapsed (m._trapRevealAt); every other path stays event-driven.
  // A mission without a pending reveal makes it a two-comparison no-op. Sits before
  // voiceArbiter so a reveal it speaks is collected on the same tick.
  'moralTrapSystem',
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
  miningHud: Object.freeze({ nodeSafe: true, phase: 'sim', capability: 'hud', domGuarded: true }),
  voiceArbiter: Object.freeze({ nodeSafe: true, phase: 'sim', capability: 'voice' }),
  save: Object.freeze({ nodeSafe: true, phase: 'sim', capability: 'persistence' }),
});

export function isPresentationPlatformId(id) {
  return PRESENTATION_SET.has(id);
}

/**
 * Modules with live game-world behavior that are NOT registered systems (MACH-01). Each entry
 * names the manifest system id that owns its clock — an undeclared ticker is a manifest
 * violation. `owned` means the module exports no init/update and the owning system drives its
 * entry points from its own registered tick and event handlers.
 */
export const OWNED_RUNTIME_MODULES = Object.freeze({
  // createMemorialThief(uniqueWrecks) returns { sync, killed, clear }; uniqueWrecks — an
  // event-driven registered system — drives sync() from its 'economy:tick' listener and
  // killed() from 'entity:killed'. The thief has no independent tick.
  memorialThief: Object.freeze({
    owner: 'uniqueWrecks',
    tick: 'owned',
    driven: Object.freeze(['economy:tick', 'entity:killed']),
  }),
});

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

/**
 * The 2 Hz calendar pass is straddled across three cohort ticks — tick%30 ∈ {0,10,20} — so
 * the ~46 calendar owners do not all land on the same step (measured 8.11 ms step max vs
 * 2.49 ms p50). Each system still runs once per 30-tick period; cohort assignment is the
 * system's index in CALENDAR_CLOCK_IDS % 3, stable across hosts and profiles.
 *
 * Within a cohort the load is further spread across the cohort's 10-tick window: each owner
 * fires on `cohort*stride + subPhase`, where subPhase round-robins 1..stride-1 over the
 * cohort's non-anchored members in list order. A ~15-owner cohort step lands as ~1–2 owners
 * per tick instead of one spike.
 */
export const CALENDAR_CLOCK_COHORTS = 3;
export const CALENDAR_CLOCK_COHORT_STRIDE = CALENDAR_CLOCK_PERIOD_TICKS / CALENDAR_CLOCK_COHORTS;

export function calendarCohortIndex(id) {
  const idx = CALENDAR_CLOCK_IDS.indexOf(id === 'ai' || id === 'tacticalAI' ? 'aiSlot' : id);
  // Capability-clocked ids outside the list land in the last cohort deterministically.
  return ((idx % CALENDAR_CLOCK_COHORTS) + CALENDAR_CLOCK_COHORTS) % CALENDAR_CLOCK_COHORTS;
}

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
  // FB-089 moves — pure observers / slow owners whose own code shows no per-tick physics:
  // pacing director: stances dwell for seconds and mults ramp on elapsed dt — nothing is
  // written per frame that a 2 Hz cadence changes.
  'difficultyDirector',
  // noFireAdvisory: the tick only tracks ring inside/outside to re-arm the advisory bark;
  // the bark itself emits on the combat:fire event, not the tick.
  'noFireAdvisory',
  // moralTrapSystem: fires the reveal fork once simTime passes _trapRevealAt; every other
  // path is already event-driven.
  'moralTrapSystem',
]);

/**
 * Owners whose firing tick is pinned by the sim-clock contract (the queue/cadence tests
 * name them at exact tick%30 values). They keep their cohort's base tick; every other
 * calendar owner takes a sub-phase inside the cohort window.
 */
export const CALENDAR_CLOCK_TICK_ANCHORS = new Set([
  'barkDirector', 'missions', // cohort 0 — tick%30===0
  'economy', 'regionalEcology', // cohort 1 — tick%30===10
  'salvage', // cohort 2 — tick%30===20
]);

const CALENDAR_CLOCK_SUB_PHASE = new Map();
{
  const subRank = [0, 0, 0];
  for (const id of CALENDAR_CLOCK_IDS) {
    const cohort = calendarCohortIndex(id);
    CALENDAR_CLOCK_SUB_PHASE.set(
      id,
      CALENDAR_CLOCK_TICK_ANCHORS.has(id)
        ? 0
        : 1 + (subRank[cohort]++ % (CALENDAR_CLOCK_COHORT_STRIDE - 1)),
    );
  }
}

/** Sub-phase inside the owner's 10-tick cohort window (0 = cohort base tick). */
export function calendarCohortSubPhase(id) {
  return CALENDAR_CLOCK_SUB_PHASE.get(id === 'ai' || id === 'tacticalAI' ? 'aiSlot' : id) || 0;
}

/** The tick%30 value this calendar owner fires on (production profile). */
export function calendarCohortTickMod(id) {
  return calendarCohortIndex(id) * CALENDAR_CLOCK_COHORT_STRIDE + calendarCohortSubPhase(id);
}

export const NEAR_CLOCK_IDS = Object.freeze([
  'flybyFocus', 'scanner', 'scanReveal', 'lawSecurity', 'pirateDisguise', 'pirateParley',
  'pirateDisengage', 'aiSlot', 'aiPorts', 'aiEncounter', 'traffic', 'titles', 'planetRuntime',
  'npcJobsRuntime',
  // Observer receipts; primary ticks already throttle internally. Catch-up extra steps
  // must not rescan the island just to notice a flee flag.
  'combatOutcome',
  // Dirty-flag mass recompute; catch-up extra steps do not change the hold.
  'cargo',
  // FB-089: observer telemetry republished each active tick — a catch-up extra step would
  // only repaint the same kinematics read, so it does not belong on the table.
  'masslineTelemetry',
]);

/**
 * FB-089 — the table clock is now a declaration, not a default. Every id in
 * PRODUCTION_UPDATE_ORDER must appear in exactly one of TABLE_CLOCK_IDS, NEAR_CLOCK_IDS,
 * or CALENDAR_CLOCK_IDS, or carry a glass capability (hud/voice/presentation).
 * validateSystemClockDeclarations() is run by the manifest tests (and getSystemClock
 * throws for an undeclared production id) so a new system added to the update order
 * without a clock entry fails with its id named — it can no longer join the 60 Hz tick
 * by forgetting a line.
 */
export const TABLE_CLOCK_IDS = Object.freeze([
  // Input and control owners — per-tick player intent and assists.
  'input', 'autoTargetAssist', 'bulletTime', 'cloak', 'actions',
  // Flight + physics authorities: single writers of position/velocity.
  'flightSlot', 'cruise', 'tumbleStates', 'physics', 'dockingCorridor',
  // Nemesis: arc engine cadence + per-fixed-step spawn-request drain.
  'nemesis', 'nemesisEncounter',
  // Capital score publishes orders the tactical slot reads the same tick.
  'capitalBossEncounters',
  // Combat/contact owners and damage single-writers.
  'collisionConsequences', 'stuntGrammar', 'weapons', 'countermeasures', 'bombs',
  'emergentPrimitives', 'impulseCharges', 'hullBurst', 'mines', 'massSeed',
  'uniqueLootAbilities', 'fields', 'environmentalMachinery',
  // Anchored set-pieces queue physics impulses every tick.
  'morrow', 'vesper',
  // Combat island: damage/attachment/custody owners at combat cadence.
  'combat', 'tetherGameplay', 'surrenderRecovery', 'custodyConsequences',
  // Massline physics owners (throws, snares, impact resolution move or damage bodies).
  'masslineThreats', 'masslineImpacts', 'masslineSnares', 'masslineThrow',
  // Debris/damage owners with live bodies or timed expiry.
  'lootShards', 'mining', 'fieldDepletion', 'fragileCargo',
  // Survival/Crucible phase machines and per-tick recorders.
  'survivalArena', 'swarmArena', 'survivalWave', 'survivalRun', 'swarmChain',
  'killReplay', 'killcamRecorder',
  // Fleet movement owner, world bounds/sector authority, WANTED-heat single writer.
  'wingmen', 'world', 'heat',
  // Chronicler: fact events must land on the tick that creates them (its FB-090 quiet
  // latch already covers the idle pole). Docked-yard job progression is real per-tick
  // service work, so the yard stays on the table.
  'chronicler', 'stationServices',
]);

const CLOCK_BY_ID = new Map();
for (const id of CALENDAR_CLOCK_IDS) CLOCK_BY_ID.set(id, SYSTEM_CLOCK.CALENDAR);
for (const id of NEAR_CLOCK_IDS) CLOCK_BY_ID.set(id, SYSTEM_CLOCK.NEAR);
for (const id of TABLE_CLOCK_IDS) CLOCK_BY_ID.set(id, SYSTEM_CLOCK.TABLE);

/**
 * The declared clock for a registered system id, or null when the id carries no clock
 * declaration (not in any clock list and no glass capability). Null is the signal the
 * coverage assertion rejects for production update-order ids.
 */
export function getDeclaredSystemClock(id) {
  // Hosts partition instantiated systems by name, after resolving manifest slots. Both AI
  // backends must retain aiSlot's near clock or every extra catch-up step repeats full AI.
  const clockId = id === 'ai' || id === 'tacticalAI' ? 'aiSlot' : id;
  const mapped = CLOCK_BY_ID.get(clockId);
  if (mapped) return mapped;
  const cap = SYSTEM_CAPABILITIES[id];
  const kind = cap && cap.capability;
  if (kind === 'hud' || kind === 'voice' || kind === 'presentation') return SYSTEM_CLOCK.GLASS;
  return null;
}

export function getSystemClock(id) {
  const declared = getDeclaredSystemClock(id);
  if (declared) return declared;
  const clockId = id === 'ai' || id === 'tacticalAI' ? 'aiSlot' : id;
  if (PRODUCTION_UPDATE_ORDER.includes(clockId)) {
    // A registered production system with no clock declaration is a manifest bug, not a
    // default. Throw so the missing line surfaces at host init, not as a silent 60 Hz join.
    throw new Error(
      `[manifest] system '${id}' is in PRODUCTION_UPDATE_ORDER but has no declared clock —`
      + ' add it to TABLE_CLOCK_IDS, NEAR_CLOCK_IDS, or CALENDAR_CLOCK_IDS',
    );
  }
  // Harness/test rigs keep the historical table answer for non-manifest names.
  return SYSTEM_CLOCK.TABLE;
}

/**
 * FB-089 manifest assertion, run by the manifest tests. Returns violation strings (empty
 * when the declaration set is complete): an update-order id with no declared clock, a clock
 * entry naming no registered system, a duplicate across lists, or a clocked id that also
 * carries a glass capability.
 */
export function validateSystemClockDeclarations(updateIds = PRODUCTION_UPDATE_ORDER) {
  const violations = [];
  const declared = new Map();
  const lists = [
    [SYSTEM_CLOCK.TABLE, TABLE_CLOCK_IDS],
    [SYSTEM_CLOCK.NEAR, NEAR_CLOCK_IDS],
    [SYSTEM_CLOCK.CALENDAR, CALENDAR_CLOCK_IDS],
  ];
  const known = new Set([...PRODUCTION_UPDATE_ORDER, ...PRODUCTION_INIT_ORDER]);
  for (const [clock, list] of lists) {
    for (const id of list) {
      const prev = declared.get(id);
      if (prev) violations.push(`'${id}' declared on two clocks (${prev} + ${clock})`);
      declared.set(id, clock);
      if (!known.has(id)) violations.push(`'${id}' has a ${clock} clock but is not a registered system id`);
      if (!updateIds.includes(id)) {
        violations.push(`'${id}' holds a ${clock} clock but is not in the update order (clock is dead weight)`);
      }
      const cap = SYSTEM_CAPABILITIES[id];
      const kind = cap && cap.capability;
      if (kind === 'hud' || kind === 'voice' || kind === 'presentation') {
        violations.push(`'${id}' has glass capability '${kind}' but also a ${clock} clock declaration`);
      }
    }
  }
  for (const id of updateIds) {
    if (getDeclaredSystemClock(id) == null) {
      violations.push(`'${id}' is in the update order with no declared clock`);
    }
  }
  return violations;
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
