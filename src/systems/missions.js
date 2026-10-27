// Missions, contracts & story-spine system (ARCHITECTURE §2.3 step 15, §3.11 state, §4.4 event
// table; design/specs/07-missions-contracts-story-spine.md).
//
// A LISTENER-AND-GRANTER subsystem. It owns three things:
//   1. Per-station mission BOARDS  — deterministically generated from a seeded hash of
//      (meta.seed, stationId, refreshEpoch) so save/load reproduces the same offers exactly.
//   2. ACTIVE mission instances    — a lifecycle FSM offered→accepted→active→done/failed/expired.
//   3. An 8-beat STORY FSM         — first-X triggers (first mine/trade/kill/dock/buy ship/…) that
//      advance state.story.beatIndex and toast the player a direction.
//
// HOW A MISSION CAN EXPRESS SUCCESS (grammar §9.9). For a long time there were exactly two ways:
// `objectiveProgress >= objectiveTarget` incremented by one of six bus handlers, or "docked at the
// destination" (_onDockedObjectives, boolean-at-dest). update() evaluated nothing per frame but the
// deadline. There is now a third: PHYSICS CONDITIONS (src/data/missionConditions.js) — contract terms
// written in the game's own physical vocabulary, carried in the same `mission.clauses` array as the
// fine-print clauses. Event terms are scored by the one generic observer in contractClauses.js;
// per-tick terms are scored HERE by _evaluateMissionConditions, the per-frame predicate slot. A
// `forbid` term voids the contract or forfeits its premium; a blocking `require` term refuses the
// turn-in until it is satisfied. Terms are told to the player on the board (dossier tag + brief), at
// accept (the transaction toast), in flight (an alert the moment the watched state goes bad) and on
// breach. A condition-free mission behaves EXACTLY as before — no state, no events, no writes.
//
// It NEVER owns the wallet, cargo, or reputation (§0.6). It detects progress from events other
// systems emit and pays out by emitting intents:
//   economy:grantCredits / economy:chargeCredits  (economy is the sole credits writer)
//   faction:repDelta                                (factions is the sole rep writer)
//   mission:completed{factionId,repMult}            (factions derives the offering-faction reward
//                                                     from THIS payload — see REP ACCOUNTING below)
//   research:pointsChanged                          (missions is a legit researchPoints writer §3.5)
//
// REP ACCOUNTING (avoid double-counting — factions.js already derives some rep on its own):
//   • Offering-faction COMPLETION reward → carried on mission:completed{factionId,repMult}; factions'
//     mission:completed handler applies applyRep(factionId, 15*repMult). We DON'T also emit a
//     faction:repDelta for that faction. We pick repMult so 15*repMult == the spec's risk-scaled gain.
//   • bounty/patrol pirate-faction penalty → factions' entity:killed handler already lowers the
//     victim faction's rep. We don't re-emit it.
//   • smuggling bust law-faction hit → economy/customs' contraband:scanned already applies it.
//   • FAILURE/EXPIRY penalty → we emit faction:repDelta{offeringFaction, negative}. We keep the
//     mission:failed/expired payload factionId-FREE (per §4.4) so factions' onMissionLost no-ops and
//     doesn't double-penalise.
//   • Secondary/story-only deltas with no other channel (e.g. B4 "opposing -10") → faction:repDelta.
//
// DETERMINISM (§0.5): board offers + spawn rolls use mulberry32(hash32(seed, …)); never Math.random.
import { dedupWarn } from '../core/warnDedup.js';
import { installBlackFlagMissions, normalizeBlackFlagJobs } from '../missions/blackFlagMissions.js';
import { CLEAN_CYLINDER, buildCleanCylinderOffer } from '../data/cleanCylinder.js';
import { QUIET_PASSAGE, buildQuietPassageOffer, evaluatePassengerHeatProximity } from '../data/heatLure.js';
import { pointContaminationAt } from '../data/alienEcology.js';
import { RED_KITE, validRedKiteReceipt } from '../data/redKite.js';
import { validIlexOutcome } from '../data/ilexArk.js';
import {
  MISSION_TYPES, STORY_BEATS, OFFER_MIX, MISSION_TUNING, ONE_LOAD_CARGO_TYPES, DOCK_SETTLED_TYPES,
  CONTRACT_DESK_SERVICES, hasContractsDesk,
  PHYSICAL_MISSION_TYPES,
  PHYSICAL_MISSION_VARIANTS,
  physicalMissionVariantFor,
  AUTHORED_SET_PIECE_TYPE,
  AUTHORED_SET_PIECE_SOURCE,
  AUTHORED_SET_PIECES,
  authoredSetPieceById,
  buildAuthoredSetPieceOffer,
  CAPITAL_BOSS_TYPE,
  CAPITAL_BOSS_SOURCE,
  CAPITAL_BOSS,
  CAPITAL_BOSSES,
  capitalBossById,
  buildCapitalBossOffer,
  MEGA_HEIST_SOURCE,
  MEGA_HEISTS,
  megaHeistById,
  buildMegaHeistOffer,
  missionMinRepForRisk,
  missionStandingGateForMinRep,
  STORY_BRANCH_INTROS,
  STORY_BRANCH_INTRO_MIN_REP,
  STORY_BRANCH_INTRO_TAG,
  MISSION_TYPE_PHYSICAL_VERB,
  SET_PIECE_MISSIONS,
  WRECK_BOUND_SET_PIECE_OBJECTIVES,
  offerMixWeight,
  offerHistoryTierFor,
  offerHistoryMultiplier,
  withBountyHeadMoney,
  RANK_CONTRACT_BY_FACTION,
  RANK_CONTRACT_SOURCE,
} from '../data/missions.js';
import {
  SET_PIECE_FOLLOW_ON_SOURCE,
  setPieceFollowOnBody,
  setPieceFollowOnOffer,
} from '../data/sandboxSetPieceFollowOns.js';
import { settleContractClauses, unsatisfiedRequiredConditions, contractTermById } from '../data/contractClauses.js';
import { stationMinRepFor } from '../data/dockDeny.js';
import { isStorySpineContract, STORY_SPINE_KEEP_TEXT } from '../data/storySpine.js';
import { stationBerthAdmits, stationBerthRefusal } from '../data/frontierRumors.js';
import {
  SPLIT_MANIFEST_TYPE,
  QUIET_BERTH_TYPE,
  YARD_WORK_SOURCE,
  YARD_BOARD_STATION_ID,
  SPLIT_MANIFEST_LOTS,
  SPLIT_MANIFEST_TUNING,
  QUIET_BERTH_TUNING,
  YARD_CUES,
  buildSplitManifestOffer,
  buildQuietBerthOffer,
  yardSinkPos,
  splitManifestNetOffset,
  splitManifestWreckOffset,
} from '../data/yardContracts.js';
import { spawnPayloadEntity } from '../combat/industrialBeam.js';
import {
  RESEARCH_GRANTS,
  CLAUSE_HONOR_RP,
  RESEARCH_FIRSTS_CAP,
} from '../data/researchGrants.js';
// Physics-aware contract terms (grammar §9.9.1). The catalog is data; the event half is observed by
// the ONE generic observer in contractClauses.js; the per-tick half is the predicate slot in update().
import {
  TICK_CONDITION_IDS,
  isMissionConditionRow,
  missionConditionById,
  serializableMissionCondition,
  tallyMissionCondition,
  conditionRemaining,
  attachTwistClauses,
  isTwistCondition,
  TWIST_MUTATIONS,
  QUIET_APPROACH_RANGE_WU,
} from '../data/missionConditions.js';
import { AUTHORED_SET_PIECE_ENCOUNTERS } from '../data/encounters/set-piece-authored.js';
import { capitalBossEncounter } from '../data/encounters/capital-boss.js';
import {
  decorateCapitalBossSpawnSpec,
  capitalBossBallastPosition,
  spawnCapitalActorOnce,
} from '../missions/capitalBossSpawn.js';
import { MEGA_HEIST_ENCOUNTERS } from '../data/encounters/mega-heist.js';
import { endgamePullsUnlocked } from '../data/postEndingReplayChains.js';
import { syncCaptainStandingOrders, noteStandingOrderCompletion, normalizeStandingOrders, captainStandingOfferPreflight } from './captainStandingOrders.js';
import { syncColdburnBid, coldburnDeliveryBonus } from './coldburnRey.js';
import { SUBSYSTEM_DEFS } from '../data/combatDefs.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';
import {
  attachClauses,
  attachConditions,
  clauseGambitMeta,
  reconstructClauseGambitOffer,
  CLAUSE_GAMBIT_SOURCE,
} from './contractClauses.js';
import { rankFromRep, rankTitleForStep } from './factions.js';
import { isFragileCommodity } from './fragileCargo.js';
import { captureEntitySelection, liveEntityById } from '../ui/sim/stableSelection.js';
import { attachTrap, seedHeliosOfferTrap, referenceTrapRefusal } from './moralTrap.js';
// A1 "passengers are people": the passenger corpora (names, why-lines, riding beats) are data;
// this system mints the per-offer identity and speaks the beats on the existing comms seams.
import {
  FRONTIER_FIRST_NAMES,
  FRONTIER_LAST_NAMES,
  PASSENGER_WHY_LINES,
  passengerBeatLine,
} from '../data/barks.js';
// PQ-019C — the authored physical capsule heist. The offer and its tuned scalars are data; the run
// itself is driven by the runtime module below, which consumes PQ-019B's pure arbiter. Both are
// inert unless an active mission actually carries a `heist` subrecord.
import {
  PQ019C_HEIST_TYPE,
  PQ019C_HEIST_STATION_ID,
  PQ019C_HEIST_SECTOR_ID,
  buildHeistOffer,
  BREAKAWAY_RECOVERY_TYPE,
  buildBreakawayOffer,
  COUNTERWEIGHT_WATCH_TYPE,
  buildCounterweightOffer,
  heistMissionPolicy,
} from '../data/heistMission.js';
import {
  PQ019_FACILITIES,
  COUNTERWEIGHT_SCENE,
  projectBreakawayForkMouth,
  projectPq019FacilitySocket,
} from '../data/heistFacilities.js';
import { deliveryQuote } from '../physicalCargo/breakaway/payloadMath.js';
import { setPieceFacilityWorldPos } from './heistFacilities.js';
import {
  heistMissionRuntime,
  createHeistRecord,
  sayHeistCue,
  counterweightRuntime,
  createCounterweightRecord,
} from '../missions/heistMissionRuntime.js';
import { priceProceduralOffer, offerMixForTier, economicRiskTier, standingWorkTier } from '../economy/economyMissionTerms.js';
import { actionById as salvageActionById } from '../data/salvageActions.js';
import { towClassMassFor } from './shipCapabilities.js';
import { playerWreckMarker } from './aftermathWrecks.js';
import { SECTORS, dangerTier } from '../data/sectors.js';
import {
  activeOwnedShip,
  nextStarterStep,
  shipCarriesModule,
  starterRamHail,
  starterRamKill,
  starterRamSentence,
} from '../data/starterJobs.js';
import { SECTOR_ANCHORS } from '../data/sectorAnchors.js';
import { zonesForSector } from '../data/sectorZones.js';
import { rollBountyMark, bountyMarkHail, markArchetypePoolFor, MARK_HAIL_RANGE_WU } from '../data/bountyMarks.js';
import { promotedPilotIdentity } from '../data/pilotCallsigns.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
// FB-066 — race courses are derived data: the course record rides the offer's params verbatim.
import {
  raceCourseForSector,
  raceBandForElapsed,
  RACE_GATE_RADIUS_WU,
  RACE_BAND_MULT,
} from '../data/raceCourses.js';
import { raceGateGlobals, startLineFor } from '../data/raceLevels.js';
import { advanceCircuit, circuitProgress } from './racingGeometry.js';
import { ADVENTURE_SPEED_CONTRACTS, adventureSpeedOffersForStation } from '../data/adventureSpeedContracts.js';
import { stepAdventureSpeed } from '../missions/adventureSpeedRuntime.js';
import { createAdventureSpeedSetPieces } from '../missions/adventureSpeedSetPieces.js';
import { createRacingSetPieces } from '../missions/racingSetPieces.js';
import { createRacingOpponents } from '../missions/racingOpponents.js';
import { scoreRacingPrecision } from './racingPrecision.js';
import { observeRacingGhost, getRacingGhostPlayback, raceGhostSplitDelta,
  resetRacingGhostSession } from './racingGhosts.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import {
  raceObjectiveUnits,
  racingAssistIntents,
  rememberRaceRecord,
  raceRecordKey,
  racingLoadoutCategory,
  resetPoseLocal,
} from './racingSteer.js';
// FB-068 — external target loss names its cause from the shared kill-causality vocabulary,
// so a void contract's receipt says what actually took the objective down.
import { compactKillCausality, killCauseFamily } from '../combat/killCausality.js';
import { customsWeirForSector } from '../world/customsWeir.js';
import { hash32 } from '../core/rng.js';
import { deferSectorEnterMaterialization, deferredEnterNow, deferredEnterTick } from '../core/sectorEnterDefer.js';
import { Masks } from '../core/entity.js';
import { maxFittedModuleMod } from '../core/fittedModules.js';
import { effectiveDangerTierFor } from './sectorSim.js';   // V2 §33 — live (drifted) hazard for mission risk
import { COMMODITIES } from '../data/commodities.js';
import { asteroidColliderRadius } from '../data/asteroidColliders.js';
import { WRECK_COLLIDER_PROPORTIONS } from '../data/wreckClasses.js';
import {
  workingBattlefieldObjective, workingBattlefieldFocus, workingBattlefieldPreflight, grantWorkingBattlefieldPolymers,
  spawnWorkingBattlefield, workingBattlefieldKilled, driveWorkingBattlefield, snapshotWorkingBattlefield,
} from './workingBattlefieldRuntime.js';
import {
  syncWakeHandoffOffer, driveWakeHandoff, onWakePickupCollected, wakeHandoffFocus,
} from './wakeHandoffRuntime.js';
import { FACTION_META } from '../data/factions.js';
import { SHIPS } from '../data/ships.js';
import { makeEnemySpawnSpec } from './combat.js';
import { protectedStationAt } from '../ai/engagementAuthority.js';
import { EGRESS_DISTANCE_WU, EGRESS_FADE_S, fleeOrderActive } from '../ai/egressExit.js';
import { POI_CAUSAL_BOARD_CAP, validatePoiCausalOffer } from '../missions/poiCausalOffers.js';
import {
  LANDMARK_QUEST_SOURCE,
  buildLandmarkQuestOffers,
  validateLandmarkQuestOffer,
} from '../data/landmarkMissions.js';
import {
  SET_PIECE_MISSION_SOURCE,
  advanceSetPieceMission,
  buildSetPieceMissionOffers,
} from './setPieceMissionOffers.js';
import {
  RECORD_KIND,
  missionIdentityOf,
  stableRecordId,
} from '../world/worldRecords.js';
import { bumpCollidesFlipEpoch, entityIndexVersion, forEachLivingWorldActor, forEachJobInteractable, isLivingWorldActor, registerEntityWorldRecordId } from '../world/livingWorldViews.js';
import { CIVILIAN_MANIFEST_PAYLOAD_TYPE } from './lootShards.js';
import { syncEntityCollisionIndexMembership, syncEntitySectorMembership, syncEntityTypeLaneMembership } from '../core/coreSystem.js';
import { getDressingRow } from '../world/dressingTable.js';
// Cargo single-writer helper (same pattern economy.js uses) — delivery missions consume the
// required cargo through this so usedVolume/usedMass caches stay correct (§0.6).
import { addCargo, releasableContractUnits, removeCargo, sellableCargoQuantity } from './cargo.js';
// NXI-169 — acceptance-time revalidation of shortage-backed offers reads the same live hopper
// the posting used (pure exported read; economy stays the sole stock/market writer).
import { starvedIndustryNeedFor, marketStockStatus } from './economy.js';
// NXI-171 — the shared starvation-row prose builder, so a board refresh re-quotes a live
// deficit in the exact voice the emit-only producer posted it (no second wording authority).
import { starvedOfferProse, isShortageGateRepair, WARM_CARGO_CONTRACT } from '../data/economyContractTemplates.js';
import {
  CONTRACT_47A_B0_BODY,
  THREAD_B_FRAGMENT_ID,
} from '../data/narrative.js';
// Campaign 47-A sidecar: observe/gate/receipt only — never owns beatIndex/branch/rewards.
import {
  ensureCampaign47aState,
  buildMissionBoardContract,
  buildEndgameBoardOffers,
  embodiedMissionAt,
  failEncounter,
  initCampaignSidecar,
  isBeatStepsComplete,
  getBiggerBoatRoute,
  getPickSideStake,
  getEmpireSeedProgram,
  getDeepReachOperation,
  getEmbodiedLocation,
  recordBeatStep,
  syncObservedBeat,
  recoveryCommsForBeat,
} from '../story/campaign47a/index.js';
// Row 413 (AL-MACH-2): method groups split out verbatim into sibling ops modules and spread back
// onto the missions object — `this` still binds to the system, so behavior is byte-identical.
import { missionBoardOps } from './missionBoardOps.js';
import { missionObjectiveOps } from './missionObjectiveOps.js';
import { missionSpawningOps } from './missionSpawningOps.js';
import { missionStoryOps } from './missionStoryOps.js';

// ── Static lookups (built once from pure data) ───────────────────────────────────────────────
export const TYPE_BY_ID = new Map(MISSION_TYPES.map((t) => [t.type, t]));
// Offer-mix arrays are ordered to match MISSION_TYPES; remember that order for weighted picks.
export const TYPE_ORDER = MISSION_TYPES.map((t) => t.type);
export const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));
const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));

// station id → mission-board identity resolved from the SECTORS graph. Physical `type` remains
// the economy/render contract; optional missionProfile/boardAnchorType only shape posted work.
// A contracts desk is the advertised board: the missions counter or a black-market counter —
// exactly the services the hub labels "contracts here". Procedural board rolls only exist
// where one is advertised; earned/authored rows post regardless (see ensureBoard).
const DESK_SERVICES = CONTRACT_DESK_SERVICES;

export const STATION_INFO = new Map();
export const SECTOR_BY_ID = new Map();
for (const sec of SECTORS) {
  SECTOR_BY_ID.set(sec.id, sec);
  const sectorHasRefuel = (sec.stations || [])
    .some((s) => Array.isArray(s.services) && s.services.includes('refuel'));
  for (const st of sec.stations || []) {
    STATION_INFO.set(st.id, {
      id: st.id, name: st.name, type: st.type, size: st.size || 'M',
      missionProfile: st.missionProfile || st.type,
      boardAnchorType: st.boardAnchorType || null,
      factionId: st.factionId || sec.factionId, sectorId: sec.id,
      sectorTier: sec.tier, security: sec.security,
      // A station that DECLARES services with no contracts desk, in a sector with no pump,
      // rolls no procedural work — the authored fuel-less outpost fiction. A station that
      // declares nothing keeps legacy behavior (fixture/stub stations roll normally).
      desklessOutpost: Array.isArray(st.services) && st.services.length > 0
        && !hasContractsDesk(st.services) && !sectorHasRefuel,
      // Destination pickers read the real gates: a 'scan' service is a customs sweep (smuggling
      // can't route there), repGated means positive standing docks, and an explicit minRep
      // binds the same way the dock gate resolves it (world.js station record).
      services: Array.isArray(st.services) ? st.services.slice() : [],
      repGated: st.repGated === true,
      minRep: stationMinRepFor(st),
      // The unfiltered record for the berth oracles — dockDenyReason reads flags
      // (quarantine, private, military, abandoned) this view deliberately does not copy.
      record: st,
    });
  }
}
export const ALL_STATIONS = [...STATION_INFO.values()];

/** STATION_INFO first, then a runtime content.sectors registry when one is mounted. */
export function stationInfoFor(state, stationId) {
  const reg = state && state.content && state.content.sectors;
  if (reg) {
    const list = Array.isArray(reg) ? reg : Object.values(reg);
    for (const sec of list) {
      for (const st of sec.stations || []) {
        if (st.id === stationId) {
          return {
            id: st.id, name: st.name, type: st.type, size: st.size || 'M',
            missionProfile: st.missionProfile || st.type,
            boardAnchorType: st.boardAnchorType || null,
            factionId: st.factionId || sec.factionId, sectorId: sec.id,
            sectorTier: sec.tier, security: sec.security,
            desklessOutpost: Array.isArray(st.services) && st.services.length > 0
              && !hasContractsDesk(st.services)
              && !(sec.stations || []).some((s) => Array.isArray(s.services) && s.services.includes('refuel')),
            services: Array.isArray(st.services) ? st.services.slice() : [],
            repGated: st.repGated === true,
            minRep: stationMinRepFor(st),
            record: st,
          };
        }
      }
    }
  }
  return STATION_INFO.get(stationId) || null;
}

/**
 * A1 "passengers are people": mint one offer's passenger from (world seed, offer id) — a name
 * and a one-line "why I'm traveling". Never an rng draw and never ambient randomness: the same
 * offer reproduces the same person across board refresh, save/load, and the fugitive reveal.
 */
export function passengerIdentityFor(seed, offerId, destName) {
  const seedU = (Number(seed) || 0) >>> 0;
  const idStr = String(offerId || '');
  const nameHash = hash32(seedU, idStr, 'pax-name');
  const first = FRONTIER_FIRST_NAMES[nameHash % FRONTIER_FIRST_NAMES.length];
  const last = FRONTIER_LAST_NAMES[(nameHash >>> 8) % FRONTIER_LAST_NAMES.length];
  const whyHash = hash32(seedU, idStr, 'pax-why');
  const why = String(PASSENGER_WHY_LINES[whyHash % PASSENGER_WHY_LINES.length])
    .replace(/\{dest\}/g, destName || 'the destination');
  return { name: `${first} ${last}`, why };
}

// Commodities a player can plausibly haul for delivery / be asked to mine / smuggle.
export const LEGAL_TRADE_CMDTYS = COMMODITIES.filter((c) => c.legality === 'legal').map((c) => c.id);
export const MINEABLE_CMDTYS = COMMODITIES.filter((c) => (c.producedBy || []).includes('mining')).map((c) => c.id);
export const CONTRABAND_CMDTYS = COMMODITIES.filter((c) => c.legality === 'contraband' || c.legality === 'restricted').map((c) => c.id);
const MISSION_RECEIPT_LIMIT = 10;
export const BULK_HAUL_TYPE = 'bulk_haul';
export const BULK_HAUL_MIN_MASS_U = 25;
export const BULK_HAUL_PAY_MULT = 0.8;
export const BULK_HAUL_FEE = 0.06;
// DOCK_SETTLED_TYPES lives in data/missions.js — the type taxonomy shared by this
// accept gate and the dossier preflight.
export const PHYSICAL_TYPE_SET = new Set([
  ...PHYSICAL_MISSION_TYPES,
  AUTHORED_SET_PIECE_TYPE,
  CAPITAL_BOSS_TYPE,
]);
export const PHYSICAL_ROLE = Object.freeze({
  SLAG_CORE: 'slag_core',
  TOWER: 'demolition_tower',
  POD: 'life_pod',
  ESCORT: 'rescue_escort',
  CARGO_POD: 'cargo_pod',
  RAIDER: 'convoy_raider',
  HULK: 'jam_hulk',
  CRADLE: 'cradle_lock',
  ACE: 'ace_pilot',
  MINE: 'reef_mine',
  VAULT: 'vault_hatch',
  JAWS: 'crusher_jaws',
  BELT: 'crusher_belt',
  CAPITAL: 'capital_hull',
  THROW_MASS: 'throw_mass',
  GATE: 'race_gate',
});
export const CAPITAL_SUBSYSTEM_ORDER = Object.freeze([
  'subsystem_drive',
  'subsystem_weapon',
  'subsystem_tether_spool',
]);
const CAPITAL_SUBSYSTEM_BY_ID = new Map(SUBSYSTEM_DEFS.map((def) => [def.id, def]));
export const THROWN_MASS_SUBSYSTEM_DAMAGE = 40;

export function authoredDefinitionOf(mission) {
  const id = mission && mission.params && mission.params.authoredSetPieceId;
  return authoredSetPieceById(id) || megaHeistById(id);
}

export function authoredEncounterOf(definition) {
  if (!definition) return null;
  return AUTHORED_SET_PIECE_ENCOUNTERS[definition.id] || MEGA_HEIST_ENCOUNTERS[definition.id] || null;
}

export function isCampaign47aB2Rescue(mission) {
  return !!(mission && mission.type === 'rescue_under_fire'
    && String(mission.storyTag || '') === CONTRACT_47A_B2_TAG
    && authoredDefinitionOf(mission)?.id === 'pod_rescue');
}

export function b2RescueActorForRole(mission, role) {
  const definition = isCampaign47aB2Rescue(mission) ? authoredDefinitionOf(mission) : null;
  const encounter = authoredEncounterOf(definition);
  return encounter && Array.isArray(encounter.actors)
    ? encounter.actors.find((actor) => actor && actor.role === role) || null
    : null;
}

export function b2RescueActorCount(mission, actor, paramName) {
  if (!actor) return 0;
  const configured = Number(mission && mission.params && mission.params[paramName]);
  const count = Number.isFinite(configured) ? configured : Number(actor.count);
  return Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
}

export function b2RescueActorIdentity(mission, actor, index) {
  if (!mission || !actor || !actor.actorId || !Number.isInteger(index) || index < 0) return null;
  return `${String(mission.id)}:${actor.actorId}:${index + 1}`;
}

export function b2RescueActorIndexFromEntity(mission, entity, actor, role) {
  const count = b2RescueActorCount(mission, actor, role === PHYSICAL_ROLE.POD ? 'podCount' : 'escortCount');
  const savedId = entity && entity.data && entity.data.missionActorId;
  if (savedId != null) {
    for (let index = 0; index < count; index++) {
      if (String(savedId) === b2RescueActorIdentity(mission, actor, index)) return index;
    }
  }
  const slot = missionTargetSlotOf(entity, mission && mission.id);
  const offset = role === PHYSICAL_ROLE.POD
    ? 0
    : b2RescueActorCount(mission, b2RescueActorForRole(mission, PHYSICAL_ROLE.POD), 'podCount');
  const index = slot == null ? -1 : slot - offset;
  return index >= 0 && index < count ? index : -1;
}

export function ensureB2RescueActorOutcomes(mission) {
  if (!isCampaign47aB2Rescue(mission)) return null;
  mission.params = mission.params || {};
  const current = mission.params.rescueActorOutcomes;
  const hadLedger = !!(current && typeof current === 'object' && !Array.isArray(current));
  const outcomes = hadLedger ? current : {};
  const pods = b2RescueActorForRole(mission, PHYSICAL_ROLE.POD);
  const escorts = b2RescueActorForRole(mission, PHYSICAL_ROLE.ESCORT);
  if (!hadLedger) {
    const lost = Math.min(b2RescueActorCount(mission, pods, 'podCount'),
      Math.max(0, Math.floor(Number(mission.params.podsLost) || 0)));
    const cleared = Math.min(b2RescueActorCount(mission, escorts, 'escortCount'),
      Math.max(0, Math.floor(Number(mission.params.escortsDown) || 0)));
    for (let index = 0; index < lost; index++) {
      outcomes[b2RescueActorIdentity(mission, pods, index)] = 'lost';
    }
    for (let index = 0; index < cleared; index++) {
      outcomes[b2RescueActorIdentity(mission, escorts, index)] = 'cleared';
    }
  }
  mission.params.rescueActorOutcomes = outcomes;
  return outcomes;
}

export function authoredMethodFor(definition, on, role) {
  if (!definition || !definition.methodHooks || !role) return null;
  for (const [method, hook] of Object.entries(definition.methodHooks)) {
    if (hook && hook.role === role && Array.isArray(hook.on) && hook.on.includes(on)) return method;
  }
  return null;
}

function authoredMethodDebriefPhrase(method) {
  const phrases = {
    wrecking_ball: 'bringing down the tower with thrown mass',
    cut_down: 'cutting down the tower',
    stage_tow: 'towing the pod to safety',
    corridor_pull: 'reeling the pods through the cleared corridor',
    tow_in: 'towing the load into berth',
    sling_in: 'slinging the load into berth',
    tow_the_barge: 'towing the barge into berth',
    sling_the_barge: 'slinging the barge into berth',
    tow_it_home: 'towing the skiff home',
    reel_it_free: 'reeling the skiff free after clearing the scavengers',
    recatch_pods: 'catching the cargo pods on the tow line',
    drive_off: 'driving off the raiders',
    park_the_hulk: 'parking the hulk in the berth',
    swing_the_wedge: 'swinging the wedge clear',
    slip_the_gap: 'slipping through the gap',
    breach_the_lock: 'breaking the lock with thrown mass',
    throw_the_ace: 'throwing the ace off the lane',
    outgun_the_ace: 'outgunning the ace',
    throw_the_deserter: 'throwing the deserter off the range',
    outgun_the_deserter: 'outgunning the deserter',
    bowl_the_chain: 'bowling thrown mass through the mine chain',
    reel_the_line: 'reeling the mine line clear',
    yank_the_hatch: 'yanking the vault hatch open',
    smash_the_door: 'smashing the vault door with swung mass',
    feed_the_jaws: 'feeding thrown mass into the crusher jaws',
    cut_the_belt: 'cutting the crusher belt',
    feed_the_hopper: 'feeding thrown mass into the hopper',
    cut_the_slurry: 'cutting the slurry feed',
    ram_the_gate: 'ramming the gate with swung mass',
    cut_the_gate: 'cutting down the toll gate',
    slip_the_locker: 'reeling the locker out quietly',
    breach_the_seal: 'breaking the locker seal with thrown mass',
  };
  return phrases[method] || String(method).replace(/_/g, ' ');
}

export function stampAuthoredTwist(offer) {
  if (!offer || (offer.source !== AUTHORED_SET_PIECE_SOURCE && offer.source !== MEGA_HEIST_SOURCE)) {
    return offer;
  }
  const twistId = offer.params && offer.params.twistClauseId;
  const row = twistId ? serializableMissionCondition(twistId) : null;
  if (!row) return offer;
  const existing = Array.isArray(offer.clauses) ? offer.clauses : [];
  if (existing.some((clause) => clause && (clause.id === row.id || clause.conditionId === row.id))) {
    return offer;
  }
  const condition = missionConditionById(twistId);
  const next = { ...offer, clauses: [...existing, row] };
  if (condition && condition.brief) {
    next.brief = withClauseBriefSuffix(String(next.brief || '').trim(), condition.brief);
  }
  return next;
}

export function stampCapitalBossTwist(offer) {
  if (!offer || offer.source !== CAPITAL_BOSS_SOURCE) return offer;
  const twistId = offer.params && offer.params.twistClauseId;
  const row = twistId ? serializableMissionCondition(twistId) : null;
  if (!row) return offer;
  const existing = Array.isArray(offer.clauses) ? offer.clauses : [];
  if (existing.some((clause) => clause && (clause.id === row.id || clause.conditionId === row.id))) {
    return offer;
  }
  const condition = missionConditionById(twistId);
  const next = { ...offer, clauses: [...existing, row] };
  if (condition && condition.brief) {
    next.brief = withClauseBriefSuffix(String(next.brief || '').trim(), condition.brief);
  }
  return next;
}

export function isCapitalBossMission(mission) {
  return !!(mission && mission.type === CAPITAL_BOSS_TYPE);
}

export function completedEndgamePull(state, pullId) {
  const completed = state && state.claims && state.claims.endgamePulls && state.claims.endgamePulls.completed;
  return !!(completed && pullId && completed[pullId]);
}

export function capitalSubsystemWorldPos(entity, subsystemId) {
  const def = CAPITAL_SUBSYSTEM_BY_ID.get(subsystemId);
  const center = def && def.volume && Array.isArray(def.volume.center) ? def.volume.center : [0, 0];
  const radius = Math.max(1, Number(entity && entity.radius) || 20);
  const lx = (Number(center[0]) || 0) * radius;
  const lz = (Number(center[1]) || 0) * radius;
  const rot = Number(entity && entity.rot) || 0;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  return {
    x: (entity && entity.pos && entity.pos.x || 0) + lx * cos - lz * sin,
    z: (entity && entity.pos && entity.pos.z || 0) + lx * sin + lz * cos,
  };
}
export const PHYSICAL_BERTH_WU = 700;
// Story B2/B3 dest-dock (latch-dock, throw, sling). Leftover authored / sling_in keep PHYSICAL_BERTH_WU.
// Live limit is dest station hull or dock radius + cargo radius + this slack.
export const STORY_LATCH_DOCK_SLACK_WU = 24;
// Mission wrecks stay type `wreck` (DEFAULT_MASK.wreck === 0) but must be solid to ships,
// thrown mass, shots, and drones. Bidirectional canCollide in leftover physics means this
// mask is enough — do not change the global wreck default.
export const MISSION_WRECK_COLLISION_MASK = Masks.SHIP | Masks.ASTEROID | Masks.PROJECTILE | Masks.DRONE;
// A tick condition may only re-warn this often. The warning is the grace window made visible, not a
// nag: crossing the speed ceiling repeatedly in a dogfight must not bury the rest of the alert lane.
const CONDITION_WARN_COOLDOWN_S = 8;
const CONDITION_BRIEF_MAX = 150;

// A clause the player cannot read before accepting is a hidden condition. When the combined
// line overflows the cap, the base brief yields — the term text is never the part that gets cut.
export function withClauseBriefSuffix(base, suffix) {
  const line = base ? `${base} ${suffix}` : suffix;
  if (line.length <= CONDITION_BRIEF_MAX) return line;
  const room = CONDITION_BRIEF_MAX - suffix.length - 4; // "... " separator
  if (room > 0) return `${base.slice(0, room).trimEnd()}... ${suffix}`;
  return suffix.length <= CONDITION_BRIEF_MAX ? suffix
    : `${suffix.slice(0, CONDITION_BRIEF_MAX - 3).trimEnd()}...`;
}
const TICK_CONDITION_ID_SET = new Set(TICK_CONDITION_IDS);
const MISSION_HOSTILE_SPAWN_MIN_WU = 1700;
const MISSION_HOSTILE_SPAWN_MAX_WU = 2600;
const MISSION_HOSTILE_SPAWN_ATTEMPTS = 24;
const MISSION_PORT_SAFE_RADIUS_WU = 1200;

// ── Contract claim-stake salvage (WF-08) ───────────────────────────────────────────
// An ordinary board salvage_retrieval is a promised dead hull on the destination's
// approach lane, not a cargo fetch: the wreck drifts outside port safety with the
// contract manifest in its salvagePool, a filed field-claim (mining's own
// `salvorClaimedBy` → `salvage:claimJumped` → lawSecurity.reportIncident protest
// path), and a passive working crew — a hauler lead that physically siphons the
// pool into its cargoManifest while the player watches, plus cutter escorts that
// hold fire until the claim is touched. Every approach stays open: strip it under
// protest (law judges the theft where witnessed), gun the crew down first (the
// claim lapses when nobody holds it), drag the whole hull off on a tether, or let
// the crew finish and take the goods off the hauler the hard way — the manifest
// drops as a real takeable body through lootShards' civilian-payload path.
export const CONTRACT_CLAIM_PLAYER_RANGE_WU = 900;   // the crew only works while the player is on scene
export const CONTRACT_CLAIM_WORK_RANGE_WU = 240;     // the hauler must stay on the hull to cut it
export const CONTRACT_CLAIM_CUT_PERIOD_S = 10;       // one manifest unit siphoned per this many seconds
export const CONTRACT_CLAIM_FLEE_RANGE_WU = 1500;    // a sprung hauler runs this far off the hull
export const CONTRACT_CLAIM_ORBIT_RAD_PER_S = 0.11;  // slow visible mill around the wreck
export const CONTRACT_CLAIM_SCAN_LABEL = 'DEAD HAULER — FILED CLAIM';

// ── PQ-138.04 failure mutation ("failure should usually mutate the situation") ───────────────
// A broken contract must not dead-end in a red toast: the situation the player is standing in
// becomes the next objective. ONE descriptor per failure reason, keyed by prefix so a full reason
// like `clause_broken:cargo_intact` resolves. Reasons with NO row (abandoned, condition breaches
// without a twist descriptor, story-asset losses, escort_abandoned) stay plain failures —
// "usually" is this table. Every `type` reuses an existing MISSION_TYPES entry; nothing here
// authors a new mission type.
//
// DROPPED from the sketched table, deliberately:
//   clause_broken:no_kills / clause_broken:no_scan — pure fine-print violations with no physical
//     residue (no wreck, no lost manifest), and the shipped clause acceptance suite
//     (test/depth-program-sp1-clauses.test.mjs) pins those breaches to settle-and-remove.
//   heist_failed — the heist already owns an authored failure→follow-up seam
//     (_boardHeistRecovery + the recovery comms cue); a second generic successor would double-post
//     on the same settlement. Authored set-piece missions carry their own recovery offers, so
//     _mutateInsteadOfFail refuses them for the same reason.
//   abandoned / escort_abandoned / seed_asset_lost — quitting on purpose and story-asset losses
//     are a settled ending, not a scene to salvage.
//
// CHAIN BOUND: a successor minted by a mutation carries mutationDepth; a mission at the cap
// fails plainly so failure→residue→failure cannot chain indefinitely.
const MUTATION_MAX_DEPTH = 1;
const MUTATION_SALVAGE_CMDTYS = Object.freeze(['cmdty_scrap_metal', 'cmdty_salvage_electronics']);
const MISSION_MUTATIONS = Object.freeze({
  // The convoy died → the wreck it left is salvage to bring home.
  escortee_lost: Object.freeze({ type: 'salvage_retrieval', tag: 'salvage' }),
  // The cargo was confiscated → the manifest is now a debt: replace the lot and finish the leg.
  'clause_broken:cargo_intact': Object.freeze({ type: 'cargo_delivery', tag: 'restitution' }),
  // The rescue came second → recover what the wreck left.
  'clause_broken:rescue_priority': Object.freeze({ type: 'salvage_retrieval', tag: 'recovery' }),
  // A patrol scan caught the sealed lot → customs took it; the client still wants it replaced.
  busted: Object.freeze({ type: 'cargo_delivery', tag: 'restitution' }),
  // The clock ran out → the job that lapsed decides the residue. An escorted convoy survived
  // the missed window — it is still a hull on the lane, so the successor re-issues the escort
  // (keepTargets hands the live escortee over). A slipped warrant reposts as a fresh hunt.
  // Every other lapsed contract refiles as a restitution debt, unchanged.
  deadline: Object.freeze({
    type: 'cargo_delivery',
    tag: 'restitution',
    byType: Object.freeze({
      escort: Object.freeze({ type: 'escort', tag: 'resumed', keepTargets: true }),
      bounty_hunt: Object.freeze({ type: 'bounty_hunt', tag: 'warrant' }),
    }),
  }),
  // The pods went down with the run → recover what the wreck left.
  pods_lost: Object.freeze({ type: 'salvage_retrieval', tag: 'recovery' }),
  // The towed slag core broke up → the scatter still pays at the yard.
  core_lost: Object.freeze({ type: 'salvage_retrieval', tag: 'recovery' }),
  // FB-068 — another crew (or the rocks) took the objective down. The contract voids fairly
  // (deposit back, no penalty — handled by the 'failed_external' branch in _failMission) and
  // the objective's wreck still pays as a recovery leg: the loss is an outcome, not a dead end.
  failed_external: Object.freeze({
    type: 'salvage_retrieval',
    tag: 'recovery',
    // Names the cause the failing contract stamped (gunnery / an explosive / the rocks) — the
    // player hears WHAT took the objective down, not just that a follow-up exists.
    toast: (title, m) => `${(m && m.params && m.params.externalCauseLabel) || 'The objective went down to someone else'} — its wreck can still be recovered: ${title}.`,
  }),
  // BP-01.1: the ship went down WITH the contract manifest → the player's own wreck still holds
  // the lost units. keepManifest keeps the failed contract's commodity on the successor; the
  // ship_lost handler stamps the durable wreck site and the lost quantity before settling.
  ship_lost: Object.freeze({
    type: 'salvage_retrieval',
    tag: 'recovery',
    keepManifest: true,
    toast: (title) => `Ship lost — your wreck still holds the manifest. Recovery contract live: ${title}.`,
  }),
  // PQ-152.03 — mid-run twist clauses. Same successor seam; both reason prefixes so a tick
  // term and an event term cannot drift apart.
  ...Object.fromEntries(Object.entries(TWIST_MUTATIONS).flatMap(([id, descriptor]) => ([
    [`clause_broken:${id}`, descriptor],
    [`condition_broken:${id}`, descriptor],
  ]))),
});
export const ESCORT_TURN_DELAY_S = 12;
// NXI-149: a plainly settled failure names the condition that actually failed — the title alone
// is not a reason. Unknown reasons fall back to nothing (the title still carries the name).
const FAIL_REASON_WORD = Object.freeze({
  abandoned: 'the job was abandoned',
  escort_abandoned: 'the convoy was left behind',
  escortee_lost: 'the convoy lead went down',
  pods_lost: 'the load went down with the run',
  core_lost: 'the core broke up in transit',
  ship_lost: 'your ship went down with the manifest',
  deadline: 'the window lapsed',
  seed_asset_lost: 'the seed asset was lost',
  target_lost: 'the mark is gone',
  failed_external: 'the objective went down to someone else',
  busted: 'the lot was seized',
  heist_failed: 'the job fell apart',
  failed: 'the contract could not be completed',
  wake_missed: 'the hauler left the lane',
  wake_unmatched: 'the crate was taken off the wake',
  wake_refused: 'the hold refused the crate',
});
function failReasonWord(reason) {
  const text = reason == null ? '' : String(reason);
  if (FAIL_REASON_WORD[text]) return FAIL_REASON_WORD[text];
  if (text.startsWith('clause_broken:') || text.startsWith('condition_broken:')) {
    return 'a contract clause was broken';
  }
  return null;
}
const MUTATION_TOAST = Object.freeze({
  salvage: (title) => `Convoy lost — the wreck is still out there. Salvage contract live: ${title}.`,
  restitution: (title) => `Contract broken — the manifest is now a debt. Restitution job live: ${title}.`,
  recovery: (title) => `The rescue was lost — the wreck can still be recovered. Contract live: ${title}.`,
  turned: (title) => `The escort turned. Hunt contract live: ${title}.`,
  cooked: (title) => `The cargo cooked. Recovery live: ${title}.`,
  sting: (title) => `The buyer is the law. New drop live: ${title}.`,
  wakes: (title) => `The wreck woke. Hunt contract live: ${title}.`,
  bait: (title) => `The pods were bait. Clear the field: ${title}.`,
  resumed: (title) => `The window lapsed — the convoy is still on the lane. Escort re-issued: ${title}.`,
  warrant: (title) => `The mark slipped the window — the warrant is reposted: ${title}.`,
});

function missionMutationFor(reason) {
  if (!reason) return null;
  if (MISSION_MUTATIONS[reason]) return MISSION_MUTATIONS[reason];
  const text = String(reason);
  for (const key of Object.keys(MISSION_MUTATIONS)) {
    if (text.startsWith(`${key}:`)) return MISSION_MUTATIONS[key];
  }
  return null;
}

/**
 * INF-066: stamp where a lost escortee died. The destroy payload carries the last position but
 * the entity row is already deleted (coreSystem), so the sector + pos must be captured here —
 * this is what routes the salvage successor to the true wreck instead of the old destination.
 * Returns null when nothing usable survives (callers keep the legacy fallbacks).
 */
export function escortLossSite(pos, sectorId) {
  if (!pos || typeof pos !== 'object') return null;
  const x = Number(pos.x);
  const z = Number(pos.z);
  if (!Number.isFinite(x) || !Number.isFinite(z) || sectorId == null) return null;
  return { sectorId: String(sectorId), wreckPos: { x, z } };
}

/** NXB-038: is this convoy hull's drive dead? Reads the combat-subsystem runtime record the
 *  same way latchRepair/surrenderRecovery do — a disabled drive is a towable hull, not a corpse. */
export function driveDisabledRuntime(state, entityId) {
  const runtime = state && state.combat && state.combat.entities
    ? state.combat.entities[String(entityId)]
    : null;
  const drive = runtime && runtime.subsystems && runtime.subsystems.subsystem_drive;
  return !!((drive && drive.effectiveDisabled === true)
    || (runtime && runtime.capabilities && runtime.capabilities.drive === false));
}

/**
 * INF-066: resolve a salvage successor's recovery site. Reads the stamped loss site first
 * (escort failure), then the successor's own carried params, then the legacy fallback chain —
 * one helper for both the offer builder (failing mission) and the waypoint/salvage hooks
 * (successor mission) so the two can never disagree about where the wreck is.
 */
export function mutationWreckRouting(m, currentSectorId) {
  const p = (m && m.params) || {};
  const stampedPos = m && m._escorteeWreckPos;
  const paramPos = p.lostWreckPos;
  const rawPos = (stampedPos && Number.isFinite(stampedPos.x) && Number.isFinite(stampedPos.z))
    ? stampedPos
    : (paramPos && Number.isFinite(paramPos.x) && Number.isFinite(paramPos.z) ? paramPos : null);
  const sectorId = (m && m._escorteeSectorId) || p.lostSectorId
    || (m && m.destSectorId) || currentSectorId || null;
  return {
    sectorId: sectorId == null ? null : String(sectorId),
    wreckPos: rawPos ? { x: rawPos.x, z: rawPos.z } : null,
  };
}

/** INF-066: salvage-family mutation tags — the only missions with a recovery leg. */
export function isMutationRecovery(m) {
  const tag = m && m.mutationTag;
  return tag === 'salvage' || tag === 'recovery' || tag === 'cooked';
}

/**
 * INF-069: the convoy client's three-state arc, bound to live settlement — never to intent.
 * `recovering` answers the first salvage credit; `completed` answers the dock (full thanks
 * only when the full manifest actually changed hands, short-settle otherwise); `failed`
 * answers abandonment or expiry with a closed file and no thanks. Returns null for every
 * mission that is not a salvage successor, so ordinary contracts keep their own voice and
 * the client can neither thank for unperformed work nor re-introduce itself after settling
 * (settlement fires once; the reaction carries a once-flag at the call site).
 */
export function convoyClientVoice(m, outcome, homeName) {
  if (!isMutationRecovery(m)) return null;
  const home = String(homeName || 'home');
  const sender = `${home} Salvage Desk`;
  const p = (m && m.params) || {};
  const qty = Math.max(1, Math.floor(Number(p.qty) || 1));
  if (outcome === 'recovering') {
    return {
      sender,
      text: `You're into the wreck — bring what's left of it home to ${home}. The desk pays for what comes back.`,
    };
  }
  if (outcome === 'completed') {
    if (p.completionMethod === 'partial_recovery') {
      return {
        sender,
        text: `Short manifest logged. It isn't the whole convoy, but it settles what came home to ${home}.`,
      };
    }
    return {
      sender,
      text: `Full ${qty}u manifest home at ${home}. The convoy's file is closed with thanks — settled in full.`,
    };
  }
  if (outcome === 'failed' || outcome === 'expired') {
    return {
      sender,
      text: `The wreck's gone cold and the file is closed at ${home}. No payment, no blame — there was nothing left to bring home.`,
    };
  }
  return null;
}

/** INF-068: the convoy-wreck pocket geometry — a near-ring offset plus a slow drift. */
export const CONVOY_WRECK_RING_WU = 60;
export const CONVOY_WRECK_DRIFT_WU_S = 6;

/**
 * INF-068: author the convoy-wreck pocket for one salvage successor. The lost hull died where
 * the stamp says; the pocket spawns one drifting wreck there holding the contract commodity
 * with its core armed. Arming `data.unstableReactor` is the whole trick: the salvage catalog
 * answers it with the vent-reactor action (vent or tow clear), and the salvage update ticks
 * its burst timer — both physical answers work through existing systems, and settlement stays
 * the canonical credit-plus-dock path. Pure over the mission plus explicit inputs; the caller
 * supplies rng angles and the clock. Returns null when the mission is not a salvage successor
 * with a known loss site and a contract commodity.
 */
export function convoyWreckPocket(m, opts = {}) {
  if (!m || m.type !== 'salvage_retrieval' || !isMutationRecovery(m)) return null;
  const p = m.params || {};
  const cmdtyId = p.cmdtyId;
  const qty = Math.max(1, Math.floor(Number(p.qty) || 1));
  if (!cmdtyId) return null;
  const routing = mutationWreckRouting(m, opts.currentSectorId || null);
  if (!routing.wreckPos || !routing.sectorId) return null;
  const nowS = Number(opts.nowS) || 0;
  const catalog = (typeof salvageActionById === 'function' && salvageActionById('vent_reactor')) || {};
  const timerS = Math.max(1, Number(catalog.timerS) || 8);
  const damage = Math.max(1, Math.min(Number(catalog.burstDamage) || 18, 24));
  const persistedDueAt = Number(p.convoyWreckDueAt);
  const dueAt = Number.isFinite(persistedDueAt) ? persistedDueAt : nowS + timerS;
  const ringAngle = Number(opts.ringAngle) || 0;
  const driftAngle = Number(opts.driftAngle) || 0;
  // A ship_lost successor claims the manifest is inside the player's own wreck — the pocket
  // co-locates exactly on the wreck marker instead of ringing it, so the cargo physically sits
  // where the contract says it does.
  const ringWu = p.playerWreckSite === true ? 0 : CONVOY_WRECK_RING_WU;
  const pos = {
    x: routing.wreckPos.x + Math.cos(ringAngle) * ringWu,
    z: routing.wreckPos.z + Math.sin(ringAngle) * ringWu,
  };
  return {
    sectorId: routing.sectorId,
    dueAt,
    spec: {
      type: 'wreck',
      pos,
      vel: {
        x: Math.cos(driftAngle) * CONVOY_WRECK_DRIFT_WU_S,
        z: Math.sin(driftAngle) * CONVOY_WRECK_DRIFT_WU_S,
      },
      rot: 0,
      radius: 9,
      mass: 60,
      hull: 1,
      hullMax: 1,
      factionId: null,
      team: 2,
      collides: false,
      flags: { noInterp: true, missionPinned: true, durable: true },
      data: {
        parentType: 'ship',
        unstableReactor: { dueAt, damage, vented: false, burst: false, towedClear: false },
        authoredSalvagePool: { [cmdtyId]: qty },
        authoredScanLabel: p.playerWreckSite === true
          ? 'Your wreck — unstable core'
          : 'Convoy wreck — unstable core',
        identityKey: `mission:${m.id}:convoy-wreck`,
        homeSectorId: routing.sectorId,
        sectorId: routing.sectorId,
        durable: true,
        missionId: m.id,
        missionTag: m.id,
        missionPinned: true,
      },
    },
  };
}

/**
 * INF-067: is an ordinary bounty contract void because its mark is gone? True when the killed
 * entity is a tagged target, the objective is still unmet, and every tagged target is dead or
 * gone (the just-killed id counts as gone unconditionally — the event IS its death). Authored
 * (storyTag) bounties own their own failure branches and never void here. Pure over the
 * instance plus a liveness predicate, so tests pin it without the system.
 */
export function bountyTargetLost(m, killedId, isGone) {
  if (!m || m.status !== 'active' || m.type !== 'bounty_hunt') return false;
  if (m.storyTag) return false;
  const ids = Array.isArray(m.targetEntityIds) ? m.targetEntityIds : [];
  if (!ids.includes(killedId)) return false;
  const target = Math.max(1, m.objectiveTarget || 1);
  if ((m.objectiveProgress || 0) >= target) return false;
  const gone = typeof isGone === 'function' ? isGone : () => true;
  return ids.every((id) => id === killedId || gone(id));
}

/**
 * FB-068: is this kill-lane contract's objective dead under someone else's guns? Shared predicate
 * behind the non-player entity:killed lane. Bounty marks are named persons — dead is dead, so the
 * INF-067 check decides (multi-target nests can still be hunted after a rival takes one).
 * patrol_clear packs deliberately stay OUT: the spawn quota tops back up to the owed count from
 * vacant slots, so an external kill there costs the player time, never the contract — voiding
 * a still-winnable job would be the dishonest outcome. Physical objectives (core, tower, pods)
 * settle through the physical kill/destroy lanes, which own their own role checks.
 * Pure over the instance plus a liveness predicate.
 */
export function externalTargetLoss(m, killedId, isGone) {
  if (!m || m.status !== 'active' || m.storyTag) return false;
  const ids = Array.isArray(m.targetEntityIds) ? m.targetEntityIds : [];
  if (!ids.includes(killedId)) return false;
  if ((m.objectiveProgress || 0) >= Math.max(1, m.objectiveTarget || 1)) return false;
  if (m.type === 'bounty_hunt') return bountyTargetLost(m, killedId, isGone);
  return false;
}

/**
 * INF-066: partial-recovery settlement math. A successor that docks short of its full qty
 * settles once for what is actually aboard: proportional pay on the successor's own (already
 * halved) stake. Returns null when nothing is aboard — the caller keeps the legacy
 * "not carrying" path. Pure; the caller consumes via the cargo single-writer.
 */
export function mutationPartialSettlement(have, need, rewardCr) {
  const needQty = Math.max(1, Math.floor(Number(need) || 1));
  const haveQty = Math.max(0, Math.floor(Number(have) || 0));
  const deliverQty = Math.min(haveQty, needQty);
  if (deliverQty <= 0) return null;
  const partial = deliverQty < needQty;
  return {
    deliverQty,
    partial,
    payCr: Math.max(0, Math.round((Number(rewardCr) || 0) * deliverQty / needQty)),
  };
}

/**
 * NXB-028: a damaged/short freight delivery settles on the contract's recorded terms — the
 * accepted reward divided by the contracted units — never a live market price. Only units that
 * are actually deliverable count: loose cargo is limited by `sellableCargoQuantity` (sealed
 * siblings are not spendable), a sealed manifest by `releasableContractUnits` (only this
 * contract's own reservation). Returns null when nothing aboard can settle, so the caller keeps
 * the ordinary "not carrying" path.
 */
export function partialDeliverySettlement(m, state) {
  if (!m || m.status !== 'active' || m.type !== 'cargo_delivery' || !m.params || !m.params.cmdtyId) return null;
  if (m.storyTag === CONTRACT_47A_B0_TAG || m.storyTag === CONTRACT_47A_B1_TAG
    || m.storyTag === 'campaign47a:b1:alloy_run') return null;
  const tracked = m.preloadedCargo === true;
  const need = tracked
    ? Math.max(0, Math.floor(Number(m.params.sealedRemaining != null ? m.params.sealedRemaining : m.params.qty) || 0))
    : Math.max(1, Math.floor(Number(m.params.qty) || 1));
  if (need <= 0) return null;
  const have = tracked
    ? Math.max(0, Math.floor(Number(releasableContractUnits(state, m)) || 0))
    : Math.max(0, Math.floor(Number(sellableCargoQuantity(state, m.params.cmdtyId)) || 0));
  const deliverQty = Math.min(have, need);
  if (deliverQty <= 0 || deliverQty >= need) return null;
  return {
    needQty: need,
    deliverQty,
    shortfallUnits: need - deliverQty,
    payCr: Math.max(0, Math.round((Number(m.reward_cr) || 0) * deliverQty / need)),
    tracked,
  };
}
export const LONG_READ_RUMOR_EVENT = Object.freeze({
  news: 'news:headline',
  comms_intercept: 'comms:popup',
  bark: 'barkDirector:voice',
  mission: 'mission:accepted',
  campaign: 'story:beatAdvanced',
  loss_investigation: 'lossInvestigation:authoredRead',
  bar: 'uniqueWreck:rumorHeard',
});
// SF-149 — the Choir vigil rides the same set-piece event surface as long_read rather than a
// parallel lifecycle: `choir_long_night` IS the live-salvage verdict drive (complication +
// decision ready), and `choir_what_remains` is a disposition stage whose accept files the
// named outcome into the durable bearing — the mission then completes on the physical return
// visit, not on the filing itself.
export const SET_PIECE_RECOVERY_OBJECTIVES = new Set(['long_read_salvage', 'choir_long_night']);
export const SET_PIECE_DISPOSITION_OBJECTIVES = new Set(['long_read_fence', 'choir_what_remains']);
// Radius of the third-visit site return: standing inside the recovered site is the job.
export const CHOIR_RETURN_RADIUS_WU = 500;
export const CONTRACT_47A_B0_TAG = 'campaign47a:b0:recovery';
export const CONTRACT_47A_SAMPLE_ID = 'cmdty_47a_assay_sample';
export const CONTRACT_47A_B1_TAG = 'campaign47a:b1:honest_work';
export const CONTRACT_47A_B2_TAG = 'campaign47a:b2:elroy';
export const CONTRACT_47A_B3_TAG = 'campaign47a:b3:bigger_boat';

// SPEC2/03 B5. These are ordinary mission offers with one extra provenance tag so the
// first-hour rail can guarantee a legible three-loop choice without inventing a second contract
// lifecycle. Missions still owns generation, acceptance, targets, rewards, and receipts.
export const ONBOARDING_CHOICE_SOURCE = 'onboardingChoice';
// Provenance tag for offers inserted through postBoardOffer: posted authored work,
// not an epoch reroll — ensureBoard's refresh retains them like the other
// player-earned classes so a regen cannot swallow the row before acceptance.
export const POSTED_BOARD_SOURCE = 'postedBoardOffer';
export const ONBOARDING_CHOICE_LOOPS = Object.freeze([
  Object.freeze({
    type: 'bulk_trade', label: 'HAUL', maxRiskTier: 1, maxCollateralCr: 2000, maxRewardCr: 10000,
  }),
  Object.freeze({
    type: 'bounty_hunt', label: 'BOUNTY', maxRiskTier: 1, maxCollateralCr: 0, maxRewardCr: 10000,
  }),
  Object.freeze({
    type: 'recon_scan', label: 'SURVEY', maxRiskTier: 1, maxCollateralCr: 0, maxRewardCr: 10000,
  }),
]);

// ── G05 corridor opening objective (one clear first-minute command) ───────────────────────────
// When nothing is tracked and the pilot has not yet first-docked, the HUD idle tracker presents
// this single corridor objective with the existing marker / distance / ETA machinery.
export const CORRIDOR_OPENING_STATION_ID = 'station_helios';
export const CORRIDOR_OPENING_SECTOR_ID = 'sector_helios_prime';
export const CORRIDOR_OPENING_STATION_LABEL = 'Helios Station';
/** Immediate-action verb for the pre-first-dock corridor idle objective. */
export const CORRIDOR_OPENING_ACTION = 'Dock at Helios Station';
/** Authored fallback world pos for Helios when the live station entity is not yet spawned. */
export const CORRIDOR_OPENING_FALLBACK_POS = Object.freeze({ x: 280, z: -140 });

/** True once the run has completed at least one dock (corridor first-minute gate). Pure over state. */
export function hasCorridorFirstDock(state) {
  if (!state || typeof state !== 'object') return false;
  if (state.ui && state.ui.corridorFirstDocked === true) return true;
  const at = state.ui && state.ui.corridorFirstDockAtS;
  if (at != null && Number.isFinite(Number(at))) return true;
  return false;
}

/** True when the tracker has an active tracked mission (not merely a stale id). Pure. */
export function hasActiveTrackedMission(state) {
  const trackedId = state && state.ui && state.ui.trackedMissionId;
  if (!trackedId) return false;
  const active = (state.missions && state.missions.active) || [];
  return active.some((m) => m && m.id === trackedId && m.status === 'active');
}

/**
 * A Crucible match is on screen. Victory, ended, and inactive hand the campaign back.
 * Pure. Used to keep the Helios dock errand off the crucible.
 */
export function crucibleScreenIsLive(state) {
  const run = state && state.run;
  if (!run || run.kind !== 'survival') return false;
  const phase = run.phase;
  if (!phase || phase === 'inactive' || phase === 'ended' || phase === 'victory') return false;
  return true;
}

/**
 * Resolve the pre-first-dock corridor idle objective when no mission is tracked.
 * Returns null after first dock, when a tracked active mission owns the tracker,
 * or while a Crucible match is on screen.
 * Pure presenter truth for G05 hierarchy tests and the HUD idle path.
 */
export function resolveCorridorOpeningObjective(state) {
  if (!state || typeof state !== 'object') return null;
  if (crucibleScreenIsLive(state)) return null;
  if (hasCorridorFirstDock(state)) return null;
  if (hasActiveTrackedMission(state)) return null;
  return {
    titleKey: 'currentObjective',
    action: CORRIDOR_OPENING_ACTION,
    reason: CORRIDOR_OPENING_ACTION,
    label: CORRIDOR_OPENING_STATION_LABEL,
    stationId: CORRIDOR_OPENING_STATION_ID,
    sectorId: CORRIDOR_OPENING_SECTOR_ID,
    sectorName: 'Helios Prime',
    kind: 'corridor',
    markerKind: 'station-dock',
  };
}

/** Find a live station entity by stationId (index first, entityList fallback). Pure read. */
export function findLiveStationEntity(state, stationId) {
  if (!state || !stationId) return null;
  const index = state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1) {
    const byStationId = index.byStationId;
    const indexed = byStationId && byStationId.get(stationId);
    if (indexed && indexed.alive !== false && indexed.type === 'station') return indexed;
  }
  return findLivingWorldActorStation(state, stationId);
}

export function findLivingWorldActorStation(state, stationId) {
  let found = null;
  forEachLivingWorldActor(state, (e) => {
    if (found || !e || e.type !== 'station' || !e.data || e.data.stationId !== stationId) return;
    found = e;
  });
  return found;
}

/**
 * Build a nav-shaped waypoint for the corridor opening objective (marker/distance/ETA).
 * Returns null when the corridor idle objective is not active.
 */
export function buildCorridorOpeningWaypoint(state) {
  const objective = resolveCorridorOpeningObjective(state);
  if (!objective) return null;
  const live = findLiveStationEntity(state, objective.stationId);
  const pos = live && live.pos
    ? { x: Number(live.pos.x) || 0, z: Number(live.pos.z) || 0 }
    : { x: CORRIDOR_OPENING_FALLBACK_POS.x, z: CORRIDOR_OPENING_FALLBACK_POS.z };
  return {
    kind: 'corridor',
    stationId: objective.stationId,
    sectorId: objective.sectorId,
    sectorName: objective.sectorName,
    label: objective.label,
    mapLabel: objective.label,
    reason: objective.reason,
    markerKind: objective.markerKind,
    pos,
  };
}

/** Record first dock for the corridor hierarchy. Idempotent; returns true on first mark. */
export function markCorridorFirstDock(state, stationId = null, simTime = 0) {
  if (!state || typeof state !== 'object') return false;
  state.ui = state.ui || {};
  if (state.ui.corridorFirstDocked === true) return false;
  state.ui.corridorFirstDocked = true;
  state.ui.corridorFirstDockAtS = Math.max(0, Number(simTime) || 0);
  if (stationId != null) state.ui.corridorFirstDockStationId = String(stationId);
  return true;
}

const CONTRACT_47A_REWARD_CR = 400;
export const CONTRACT_47A_B2_SCAN_RADIUS_WU = 1200;
export const CONTRACT_47A_B2_CUSTODY_REEL_WU = 60;

// Station size → tier number used for slot count (S=0,M=1,L=2).
export const SIZE_TIER = { S: 0, M: 1, L: 2 };

// Story branch → faction mapping (B4/B5 spec).
export const BRANCH_FACTION = Object.fromEntries(STORY_BRANCH_INTROS.map((intro) => [intro.branch, intro.factionId]));
export const BRANCH_INTRO_BY_FACTION = new Map(STORY_BRANCH_INTROS.map((intro) => [intro.factionId, intro]));
export const BRANCH_INTRO_BY_BRANCH = new Map(STORY_BRANCH_INTROS.map((intro) => [intro.branch, intro]));
export const HOME_FACTION = 'faction_scn'; // resolves STORY_BEATS B0 reward.rep.faction === 'home'

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const round = Math.round;

export function cargoFootprint(offer) {
  const p = offer && offer.params || {};
  if (p.mutationReroute) return 0;
  if (!p.cmdtyId || !(p.qty > 0)) return 0;
  const commodity = CMDTY_BY_ID.get(p.cmdtyId);
  const volPerU = commodity && commodity.volPerU > 0 ? commodity.volPerU : 1;
  return Math.floor(p.qty) * volPerU;
}

function fmtCargoUnits(value) {
  return (Math.round(value * 10) / 10).toLocaleString('en-US');
}

function signedRep(value) {
  const n = Math.round(Number(value) || 0);
  return (n > 0 ? '+' : '') + n;
}

function factionShortName(factionId) {
  const fac = factionId ? FACTION_BY_ID.get(factionId) : null;
  return (fac && (fac.short || fac.name)) || 'this faction';
}

export function isStoryBranchIntroOffer(offer, state) {
  const intro = storyBranchIntroForOffer(offer);
  return !!(
    intro &&
    state && state.story && state.story.beatIndex === 4 &&
    (offer.storyTag === STORY_BRANCH_INTRO_TAG || offer.storyTag === 4)
  );
}

function storyBranchIntroForOffer(offer) {
  if (!offer || !offer.factionId) return null;
  const intro = BRANCH_INTRO_BY_FACTION.get(offer.factionId);
  if (!intro) return null;
  if (offer.storyBranch && offer.storyBranch !== intro.branch) return null;
  return intro;
}

export function missionOfferMinRep(offer, state = null) {
  if (isStoryBranchIntroOffer(offer, state)) return STORY_BRANCH_INTRO_MIN_REP;
  const explicit = Number(offer && offer.minRep);
  if (Number.isFinite(explicit)) return Math.round(explicit);
  return missionMinRepForRisk(offer && offer.riskTier);
}

export function setPieceCauseOf(value) {
  return value && value.source === SET_PIECE_MISSION_SOURCE && value.cause
    && value.cause.chainId ? value.cause : null;
}

export function isFingerprintBoardSource(source) {
  return source === 'blackFlag' || source === 'poiBehavior'
    || source === 'mercyService' || source === 'wreckCourt'
    || source === SET_PIECE_MISSION_SOURCE
    || source === LANDMARK_QUEST_SOURCE
    // Each cargo-kill chain mints its own salvage offer — dedupe per chain, not per source, so
    // a second completed chain at the same station still boards its contract.
    || source === 'cargoKillChain'
    // BP-01.1: a wreck-communicator offer's identity is its stable salvage-point id — receipts
    // dedupe a completed contract on replay/re-entry while distinct points still board.
    || source === 'salvage'
    // Ecology desks carry stable per-mission ids and no cause — per-identity dedupe, not
    // one-row-per-source, so a site holding several contracts surfaces all of them.
    || source === 'ecology'
    || source === SET_PIECE_FOLLOW_ON_SOURCE;
}

/**
 * NXB-043 — a competing feedstock bid is TWO rows for ONE shortage: a rival-tagged starvation
 * row may board beside the other member of its pair (a different starving yard), while the
 * same yard can never double-post. Anything else keeps the one-row-per-source guard.
 */
export function isCompetingStarvedRow(offer) {
  return !!(offer && offer.source === 'economyContract' && offer.type === 'cargo_delivery'
    && offer.cause && offer.cause.tag === 'industry_starved' && offer.cause.rivalStationId);
}

function isZeroPayLandmarkMission(mission, rewardCr) {
  return !!(mission
    && mission.source === LANDMARK_QUEST_SOURCE
    && mission.params && mission.params.landmarkProbe
    && rewardCr === 0);
}

export function setPieceEventFields(value, transition = null) {
  const cause = setPieceCauseOf(value);
  if (!cause) return {};
  const receipt = transition && transition.receipt || null;
  const nextStationIds = receipt && Array.isArray(receipt.nextStationIds)
    ? receipt.nextStationIds : [];
  return {
    chainId: cause.chainId,
    archetypeId: cause.archetypeId,
    startEpoch: cause.startEpoch,
    stageIndex: cause.stageIndex,
    stageId: cause.stageId || undefined,
    branchId: cause.branchId || null,
    attempt: cause.attempt || 0,
    house: receipt && receipt.house || cause.house || null,
    houseText: receipt && receipt.houseText || undefined,
    recoveryText: receipt && receipt.recoveryText || undefined,
    nextStationId: receipt && receipt.nextStationId || null,
    nextStationIds,
    wreckId: cause.wreckId || value.wreckId || null,
  };
}

export function setPieceUpfrontCost(offer, state = null) {
  const cause = setPieceCauseOf(offer);
  if (!cause || (cause.attempt | 0) > 0) return 0;
  if (cause.archetypeId === 'long_read' && cause.stageIndex === 0) {
    const wreckId = cause.wreckId || offer.wreckId || offer.params && offer.params.wreckId;
    const bearing = wreckId && state && state.player && state.player.uniqueWrecks
      && state.player.uniqueWrecks.bearings && state.player.uniqueWrecks.bearings[wreckId];
    if (bearing) return 0;
  }
  return Math.max(0, Math.round(Number(offer.upfrontCostCr) || 0));
}

export function missionObservesClauseEvent(mission, eventName) {
  return Array.isArray(mission && mission.clauses) && mission.clauses.some((clause) => (
    clause && clause.event === eventName
  ));
}

// Map-space distance between two sectors → world-unit-ish path length (deterministic, bounded).
// Sector map positions are small integers (±~11); scale to a sensible wu range and floor same-sector.
export function sectorDistanceWu(aSectorId, bSectorId) {
  if (!aSectorId || !bSectorId || aSectorId === bSectorId) return 600; // intra-sector hop
  const a = SECTOR_BY_ID.get(aSectorId), b = SECTOR_BY_ID.get(bSectorId);
  if (!a || !b || !a.position || !b.position) return 1800;
  const dx = b.position.x - a.position.x, dy = b.position.y - a.position.y;
  return clamp(600 + Math.hypot(dx, dy) * 650, 600, 6000);
}

function missionNavReason(m, station, sector) {
  const p = m && m.params || {};
  const commodity = p.cmdtyId && CMDTY_BY_ID.get(p.cmdtyId);
  const cargo = commodity ? commodity.name : 'cargo';
  const stationName = station && station.name || 'destination';
  const sectorName = sector && sector.name || 'target sector';
  const remaining = Math.max(0, (m.objectiveTarget || p.qty || 1) - (m.objectiveProgress || 0));
  const wreckName = p.wreckName || 'the marked wreck';
  if (p.setPieceObjective === 'long_read_rumor_survey') {
    if (p.rumorAlreadyKnown) return `Fix the known ${wreckName} bearing in ${sectorName}`;
    return p.rumorPurchased
      ? `Fix the purchased ${wreckName} bearing in ${sectorName}`
      : `Purchase the ${wreckName} rumor, then fix its bearing in ${sectorName}`;
  }
  if (p.setPieceObjective === 'long_read_salvage') {
    if (p.salvageDecisionReady && !p.complicationObserved) {
      return `Observe the ${wreckName} complication before confirming recovery`;
    }
    if (p.complicationObserved) return `Recover ${wreckName} to its disposition decision`;
    return `Reach ${wreckName}, survive its complication, and recover the wreck`;
  }
  if (p.setPieceObjective === 'long_read_fence') {
    const choice = p.wreckChoiceId === 'authority_handover' ? 'authority handover' : 'hardware claim';
    return `Confirm the ${choice} disposition for ${wreckName}`;
  }
  if (p.setPieceObjective === 'investigation_recover_box') {
    return `Salvage a wreck in ${sectorName} and recover its black box`;
  }
  if (m.storyTag === CONTRACT_47A_B0_TAG) {
    return p.sampleRecovered
      ? 'Deliver the 47-A sample to Helios Station'
      : 'Recover the 47-A sample from the marked rock';
  }
  if (m.storyTag === CONTRACT_47A_B1_TAG && m.type === 'cargo_delivery') {
    return p.cargoRecoveryNeeded
      ? 'Return to Helios for replacement cargo'
      : 'Deliver sealed alloys to Tycho; compare the manifest';
  }
  if (m.storyTag === CONTRACT_47A_B2_TAG && m.type === 'bounty_hunt') {
    return p.investigationStage === 'identified'
      ? 'Choose: fire to close the tag, or reel Elroy inside sixty'
      : 'Scan the marked vessel before acting';
  }
  if (m.type === 'recon_scan' && p.originSurveySample) {
    const sample = CMDTY_BY_ID.get(p.sampleCmdtyId);
    return p.surveyComplete
      ? `Mine ${p.sampleQty || 1}u ${sample ? sample.name : 'sample'} from the scanned seam`
      : `Scan an asteroid field in ${sectorName}`;
  }
  if (m.type === 'recon_scan' && p.landmarkProbe) {
    return `Fire one close scanner pulse at ${p.landmarkProbe.poiLabel || 'the Caved Shaft'}`;
  }
  if (m.type === 'recon_scan' && p.poiSignalFollowup) {
    return `Scan the ${plainFollowupPlace(p.poiSignalFollowup)} in ${sectorName}`;
  }
  if (isShortageGateRepair(m)) return `Buy or salvage ${p.qty}u ${cargo}, then deliver to ${stationName}`;
  if (p.workingBattlefield) return workingBattlefieldObjective(m);
  switch (m.type) {
    case 'cargo_delivery': return `Deliver ${p.qty || ''}u ${cargo} to ${stationName}`.trim();
    case 'bulk_trade': return `Sell ${remaining || p.qty || ''}u ${cargo} at ${stationName}`.trim();
    case BULK_HAUL_TYPE: return `Tether-haul ${remaining || p.massU || ''}u bulk ore to ${stationName}`.trim();
    case 'mining_quota': return `Mine ${remaining || p.qty || ''}u ${cargo}`.trim();
    case 'salvage_retrieval': return `Recover ${p.qty || ''}u ${cargo} for ${stationName}`.trim();
    case 'smuggling_run':
      if (p.wakeHandoff) return 'Match the hauler and take the crate in its wake';
      return `Smuggle ${p.qty || ''}u ${cargo} to ${stationName}`.trim();
    case 'passenger_transport':
      if (p.quietPassage) return 'Escort passenger transport cold through Customs Gate checkpoint';
      return `Transport passenger to ${stationName}`;
    case 'escort': return `Escort convoy to ${stationName}`;
    case 'bounty_hunt': {
      const ram = starterRamSentence(p);
      if (ram) return ram;
      return p.markName
        ? `Find ${p.markName} near ${sectorName}`
        : `Find the bounty near ${sectorName}`;
    }
    case 'patrol_clear': return `Clear hostiles in ${sectorName}`;
    case 'recon_scan': return `Scan sites in ${sectorName}`;
    case 'tow_recovery': return `Tow the ${p.massU} t slag core to ${stationName}, or sling it into the yard`;
    case 'demolition': return `Knock down the marked tower in ${sectorName}`;
    case 'rescue_under_fire': return `Pull the life pods out of ${sectorName}`;
    case AUTHORED_SET_PIECE_TYPE: return m.title || `Finish the physical job in ${sectorName}`;
    default: return stationName || sectorName;
  }
}

function plainFollowupPlace(follow) {
  if (follow && follow.targetType === 'wreck') return 'linked derelict';
  if (follow && follow.targetType === 'anomaly') return 'linked anomaly';
  return 'linked return';
}

const B6_DEPLOYMENT_KINDS = new Set(['drone', 'trader', 'outpost']);

export function b6DeploymentPayload(payload) {
  // `asset:deployed` is an admission receipt: kind + identity + stable definition identity.
  // Automation supplies defId; commissioned claim outposts supply claimSpecId.
  if (!payload || !B6_DEPLOYMENT_KINDS.has(payload.kind) || payload.id == null) return null;
  const definitionId = payload.defId || payload.claimSpecId;
  if (typeof definitionId !== 'string' || !definitionId.trim()) return null;
  return payload;
}

// ── 47-A route classification (PQ-032.02) ────────────────────────────────────────
// The old bounty B2 stamped elroy_outcome; the live `rescue_under_fire` pod pull does
// not. A missing outcome is therefore NOT proof of a legacy save — classify only on
// positive marks each route actually writes:
//   'legacy' — explicit elroy_outcome_legacy, or no evidence of the embodied route at
//              all (pre-embodiment Continue saves). Keeps the old net-worth/rep endgame.
//   'pinned' — an outcome token exists (old-route resolve or a hand-set save) without the
//              legacy stamp: leftover stakes still pin B4's door and B6's program.
//   'live'   — no outcome, but durable authored-route evidence (embodied_route flag or
//              sidecar beat 1–3 step records — both written only by the real contracts).
function campaign47aEmbodiedEvidence(state) {
  const story = state && state.story;
  const flags = (story && story.flags) || {};
  if (flags.embodied_route                       // stamped when authored B1–B3 complete
    || flags.pick_a_side_pending                 // live B4 door accepted, work pending
    || flags.empire_seed_pending_id != null      // live B6 drone awaiting its program
    || flags.empire_seed_asset_id != null        // live B6 seed bound
    || flags.empire_seed_complete                // live B6 settled
    || flags.deep_reach_asset_lost               // live B7 seed recovery in flight
    || flags.deep_reach_operation_complete       // live B7 operation already done
    || flags.deep_reach_variant) {
    return true;
  }
  // The sidecar's per-beat step log is save-durable. B1–B3 steps only land through the
  // authored campaign47a contracts; a legacy bounty B2 stamps elroy_outcome_legacy before
  // it records, so the flag check in campaign47aRouteKind still wins for those saves.
  const steps = story && story.campaign47a && story.campaign47a.stepProgress;
  if (steps && typeof steps === 'object') {
    for (const key of ['1', '2', '3']) {
      const bucket = steps[key];
      if (bucket && Array.isArray(bucket.completed) && bucket.completed.length) return true;
    }
  }
  return false;
}

export function campaign47aRouteKind(state) {
  const flags = (state && state.story && state.story.flags) || {};
  if (flags.elroy_outcome_legacy) return 'legacy';
  if (flags.elroy_outcome) return 'pinned';
  return campaign47aEmbodiedEvidence(state) ? 'live' : 'legacy';
}

/** The old-vocabulary token ('custody'|'force') the live route derives from the B4 door:
 * the patrol door carries the custody flavour; traders and free read the force one. */
export function campaign47aOutcomeKey(state) {
  const flags = (state && state.story && state.story.flags) || {};
  if (flags.elroy_outcome === 'custody' || flags.elroy_outcome === 'force') return flags.elroy_outcome;
  return (state && state.story && state.story.branch) === 'patrol' ? 'custody' : 'force';
}

export const missions = {
  ...missionBoardOps,
  ...missionObjectiveOps,
  ...missionSpawningOps,
  ...missionStoryOps,
  name: 'missions',

  init(ctx) {
    this._racingSetPieces?.stop('reinitialize');
    this._racingSetPieces = null;
    this._adventureSpeedSetPieces?.dispose();
    this._adventureSpeedSetPieces = null;
    this._racingOpponents?.stop('reinitialize');
    this._racingOpponents = null;
    if (this.state) resetRacingGhostSession(this.state);
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this.registry = ctx.registry || null;
    const state = this.state, bus = this.bus;

    // Ensure the state tree exists (gameState seeds it, but be defensive for headless tests).
    if (!state.missions) state.missions = { boards: {}, active: [], completedLog: [], receipts: [], nextId: 1, config: null };
    state.missions.receipts = normalizeMissionReceipts(state.missions.receipts);
    const setPieceSettlements = normalizeSetPieceSettlements(
      state.missions.setPieceSettlements,
      state.missions.receipts,
    );
    if (Object.keys(setPieceSettlements).length) state.missions.setPieceSettlements = setPieceSettlements;
    else delete state.missions.setPieceSettlements;
    if (!state.story) state.story = { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 };
    if (!state.missions.config) state.missions.config = MISSION_TUNING;

    this._lastDockedStation = null;
    this._spawnSeq = 0; // disambiguates re-spawns of the same mission target across visits
    this._missionBudgetDeferrals = new Map();
    this._nextMissionSpawnRetryTick = 0;
    this._lastWaypointRouteKey = null;
    this._lastWaypointRouteAt = 0;

    // New game → seed config + reset boards/active (idempotent: a load may already have populated).
    bus.on('game:started', () => this.newGame());
    bus.on('tutorial:finished', () => this._releaseStoryNavigationAfterTutorial());
    bus.on('save:loaded', () => {
      this._restoreNavigationAfterLoad();
      this._reconcileLandmarkQuestOffers();
    });
    bus.on('save:restoring', () => this._missionBudgetDeferrals.clear());
    // A Crucible launch (Swarm / Gauntlet / scored) boots the shared NEW_GAME world, whose
    // newGame() installs and tracks the 47-A cold-start contract. The Crucible is not the
    // campaign: withdraw that contract before the run so its objective, nav marker and HUD
    // tracker never paint over the arena (worker-lane regression: "Recover the 47-A sample").
    bus.on('game:scenePrepared', (p) => {
      if (p && p.crucibleLaunch === true) this._withdrawContract47aColdStartForCrucible();
    });

    // ── Player intents (UI) ────────────────────────────────────────────────────────────────
    bus.on('ui:acceptMission', (p) => this.acceptMission(p && p.missionId));
    bus.on('ui:abandonMission', (p) => this.abandonMission(p && p.missionId));
    // Domain-level abandon intent: systems (e.g. moral-trap 'end' choices) settle a contract
    // through the same single-writer path as the Mission Log button.
    bus.on('mission:abandon', (p) => { if (p && p.missionId) this.abandonMission(p.missionId); });
    bus.on('ui:trackMission', (p) => { if (p && p.missionId) this.trackMission(p.missionId); });
    // Economy-born contracts are emit-only producers. Missions remains the sole board/active
    // authority and boards only a complete, normal offer shape; discovery-only salvage hooks keep
    // their existing consumers and cannot accidentally become malformed board entries.
    bus.on('mission:offered', (p) => this._onExternalBoardOffer(p));
    installBlackFlagMissions(this);
    bus.on('jump:chargeStart', (p) => {
      this._dnfAuthoredRaces('race_left_course');
      this._projectMissionTargetDecodes(p && p.targetSectorId);
    });
    bus.on('poi:identified', (p) => this._reconcileLandmarkQuestOffers(p || {}));

    // ── Docking: refresh expired boards, run delivery/passenger/escort/salvage objectives ────
    bus.on('dock:docked', (p) => {
      const stationId = p && p.stationId;
      if (!stationId) return;
      this._lastDockedStation = stationId;
      // G05: first dock closes the corridor idle objective; priority falls through to shipped order.
      const firstDock = markCorridorFirstDock(this.state, stationId, this.state.simTime || 0);
      if (firstDock) {
        const wp = this.state.nav && this.state.nav.waypoint;
        if (wp && wp.kind === 'corridor') {
          this.state.nav.waypoint = null;
          this.bus.emit('nav:waypoint', null);
        }
        this._refreshNavigation({ silent: true });
      }
      this.ensureBoard(stationId);
      this._onDockedAuthoredRaces(stationId);
      // W-BOOKS-0-2 (§34.7): the Skim resolves inline at the Pit before the dock step is
      // recorded — the ordered B0 list needs 'skim' landed before 'dock'.
      this._resolveContract47aSkimForDock(stationId);
      this._onDockedObjectives(stationId);
      this._onContract47aB3Docked(stationId);
      // W-BOOKS-3-4: a blown Hawser seam gets Slate's second pass at the yard — the
      // column keeps its entry once the weld lands.
      this._resolveVarianceSeamWeld(stationId);
      this._storyTrigger('dock', { stationId });
    });
    bus.on('dock:undocked', () => {
      this._lastDockedStation = null;
      this._activateContract47aB1OnDeparture();
      this._activateContract47aB2OnDeparture();
      this._activateContract47aB3OnDeparture();
      this._activateContract47aB4OnDeparture();
      this._onPassengerUndock();
    });

    // ── W-BOOKS-0-2 (§34.7): the Books 0–2 book-list world signals. The systems named on
    // each canonical step emit them; missions records them into the sidecar's ordered step
    // log and advances the live cursor when the current beat's list is satisfied.
    bus.on('story:skimResolved', (p) => this._recordCampaignBookSignal('story:skimResolved', p));
    bus.on('kesslerPod:weighed', (p) => this._recordCampaignBookSignal('kesslerPod:weighed', p));
    bus.on('understory:gardenFed', (p) => this._recordCampaignBookSignal('understory:gardenFed', p));
    bus.on('understory:gardenStage', (p) => this._recordCampaignBookSignal('understory:gardenStage', p));
    bus.on('understory:compostRunComplete', (p) => this._recordCampaignBookSignal('understory:compostRunComplete', p));
    bus.on('encounter:resolved', (p) => {
      // W-CANON (§34.7 row 537): a quiet interlude scene closing marks its story flag.
      this._observeCampaign47aInterludeResolved(p);
      this._recordCampaignBookSignal('encounter:resolved', p);
    });
    bus.on('rookWreck:delivered', (p) => {
      this._onRookWreckDelivered(p);
      this._recordCampaignBookSignal('rookWreck:delivered', p);
    });
    bus.on('furnace:fed', (p) => {
      this._onFurnaceFed(p);
      this._recordCampaignBookSignal('furnace:fed', p);
    });

    // ── W-BOOKS-3-4 (§34.7 Books 3–4): the Gate Audit welds are world-pressure events
    // recorded as optional book evidence; VARIANCE ADJUSTMENT's seam counts the live
    // strain envelope and lets go at the fourth spike while the delivered hull is flown.
    bus.on('worldPressure:auditAnnounced', (p) => this._recordCampaignBookSignal('worldPressure:auditAnnounced', p));
    bus.on('worldPressure:gateClosed', (p) => this._recordCampaignBookSignal('worldPressure:gateClosed', p));
    bus.on('tether:strain', (p) => this._onBookVarianceStrain(p));
    bus.on('pickup:collected', (payload) => onWakePickupCollected(this, payload));

    // ── Objective tracking listeners ─────────────────────────────────────────────────────────
    // bulk_trade quota: sell qty of the target commodity (trade.sold alias → economy:tradeCompleted).
    bus.on('economy:tradeCompleted', (p) => this._onTrade(p));
    // NXB-043/NXI-171 — a real stock write (mission freight, a market sale, or a relieved
    // starvation threshold) changes the hopper the board's shortage rows quote. Re-derive
    // those rows from the same read that planned them so no board replays a resolved
    // emergency; a competing bid admits when its rival's line was fed.
    const refreshShortageBoards = () => {
      const boards = this.state.missions && this.state.missions.boards;
      if (!boards) return;
      for (const [stId, b] of Object.entries(boards)) {
        if (this._syncShortageOffers(b)) {
          this.bus.emit('mission:updated', { missionId: null, stationId: stId });
        }
      }
    };
    bus.on('economy:freightAccepted', refreshShortageBoards);
    bus.on('economy:shortageRelieved', refreshShortageBoards);
    bus.on('economy:tradeCompleted', refreshShortageBoards);
    // A sold cargo-ship salvage becomes one board opportunity. Not a fine, a lock, or a failed job.
    bus.on('economy:cargoKillOpportunity', (p) => this._onCargoKillOpportunity(p));
    // mining_quota: aggregate mined units of the target commodity.
    bus.on('mining:yield', (p) => this._onMiningYield(p));
    // Deep-core ore is already accepted into the player's hold. Its event uses tile coordinates;
    // use the live rock's world position so sample/recon contracts retain their source checks.
    bus.on('drill:yield', (p) => {
      const rock = state.drill && state.entities && state.entities.get(state.drill.asteroidId);
      if (!p || !rock || !rock.pos) return;
      this._onMiningYield({
        ...p,
        minerId: state.playerId,
        pos: { x: rock.pos.x, z: rock.pos.z },
      });
    });
    // The Investigation Chain's black-box stage consumes the native mining-owned wreck salvage
    // receipt. It has no synthetic cargo or destination dock: the physical wreck recovery is the
    // objective, and missions remains the settlement authority.
    bus.on('salvage:completed', (p) => this._onSalvageCompleted(p));
    // bulk_haul: tethered bulk chunks delivered at refinery docks.
    bus.on('mining:bulkHaulDelivered', (p) => this._onBulkHaulDelivered(p));
    // bounty_hunt / patrol_clear: a tagged hostile died to the player.
    bus.on('entity:killed', (p) => {
      this._onKill(p);
      this._onPhysicalKill(p);
    });
    // contractClauses judged this kill clean of every observed clause; the objective still owes.
    bus.on('contract:clauseSettledKill', (p) => this._onClauseSettledKill(p));
    // escort fail: escortee destroyed.
    bus.on('entity:destroyed', (p) => this._onEntityDestroyed(p));
    // recon_scan: a scan target (or sector scan) completed.
    bus.on('scan:completed', (p) => this._onScan(p));
    bus.on('mission:venueProof', payload => {
      if (!payload || !['mercyService', 'wreckCourt'].includes(payload.source)) return;
      const index = this.state.missions.active.findIndex(m => m.id === payload.missionId && m.status === 'active');
      if (index < 0) return;
      const mission = this.state.missions.active[index];
      const key = payload.source === 'mercyService' ? 'mercyIncidentId' : 'wreckCourtCaseId';
      if (!mission.params?.[key] || mission.source !== payload.source) return;
      const verified = this.registry?.get(payload.source)?.verifyMissionProof?.(payload);
      if (verified?.ok !== true) return;
      mission.objectiveProgress = mission.objectiveTarget;
      this._completeMission(mission, index);
    });
    bus.on('mission:venueFailure', payload => {
      if (!payload || !['mercyService', 'wreckCourt'].includes(payload.source)) return;
      const index = this.state.missions.active.findIndex(m => m.id === payload.missionId && m.status === 'active');
      if (index < 0) return;
      const mission = this.state.missions.active[index];
      if (mission.source !== payload.source || this.registry?.get(payload.source)?.verifyMissionFailure?.(payload)?.ok !== true) return;
      this._failMission(mission, index, payload.kind === 'rescue-left' || payload.kind === 'court-left' ? 'abandoned' : 'failed');
    });
    bus.on('signal:scanResults', (p) => {
      this._onLandmarkProbeScan(p || {});
      // A multi-scan landmark may become board-ready on this exact pulse. Reconcile after scanner
      // has committed its durable count so the fourth Shard Sphere fragment posts the real offer.
      this._reconcileLandmarkQuestOffers({ sectorId: p && p.sectorId });
      // NXI-180: a revised clue reading qualifies the affected mission course (see handler).
      this._onClueRouteRevision(p || {});
    });
    // Census-style landmarks become ready when flavor files a reading, which lands after this
    // system's scanResults listener runs. Reconcile on presentation too so the seventeenth
    // Quiessence hull posts its return survey on the same pulse. Unfiltered: the payload
    // carries no sector, and re-reconciling four quest definitions is trivially cheap.
    bus.on('v2:flavorPresented', () => this._reconcileLandmarkQuestOffers());
    // Causal POI follow-ups settle only when scanner physically investigates their exact live
    // entity. Generic scan pulses remain valid for ordinary recon_scan contracts.
    bus.on('signal:investigated', (p) => this._onSignalInvestigated(p));
    // First-contact fieldwork RP (PQ-155 follow-on): each entry in RESEARCH_GRANTS pays once per
    // durable discovery record via the bounded researchFirsts dedup. Missions stays the sole
    // positive researchPoints writer; this loop only widens which events feed it.
    for (const grantEvent of Object.keys(RESEARCH_GRANTS)) {
      // Repeatable rows are settlement faucets, not discovery firsts. Subscribing
      // them here would let a bus emit enter the dedupe ledger.
      if (RESEARCH_GRANTS[grantEvent] && RESEARCH_GRANTS[grantEvent].repeatable === true) continue;
      bus.on(grantEvent, (p) => this._grantResearchFirst(grantEvent, p || {}));
    }
    bus.on('tether:reel', (p) => {
      this._onContract47aB2TetherReel(p);
      this._onPhysicalTetherReel(p);
    });
    bus.on('tether:latched', (p) => this._onPhysicalTetherLatched(p));
    bus.on('tether:detached', (p) => this._onPhysicalTetherDetached(p));
    bus.on('tether:broken', (p) => this._onPhysicalTetherDetached(p));
    bus.on('tether:releaseRated', (p) => this._onPhysicalReleaseRated(p));
    bus.on('tether:whipImpact', (p) => this._onPhysicalWhipImpact(p));
    bus.on('massline:throw', (p) => this._onPhysicalThrow(p));
    bus.on('projectile:hit', (p) => this._onCapitalBossGunHit(p));
    bus.on('combat:tumbled', (p) => this._onCapitalBossTumbled(p));

    // ── PQ-019C: physical capsule heist ──────────────────────────────────────────────────────
    // Possession is read from the EXISTING Massline/tether latch rather than owned here — the
    // mission normalizes a latch on the authored capsule into one `possession` candidate and never
    // touches physics. Every listener below is a strict no-op unless an active mission carries a
    // `heist` subrecord, so the feature is inert in the golden scenario and in any save that has
    // never seen one. All of these fire BEFORE missions.update for the same tick (registry order:
    // physics 177 < tetherGameplay 197 < heistFacilities 222 < missions 246), which is the
    // arbiter's submit-before-step precondition satisfied structurally.
    bus.on('heist:capsuleLaunched', (p) => this._heistEach((h, m) => {
      if (heistMissionRuntime.onCapsuleLaunched(this._heistCtx(), h, p || {})) {
        this._refreshTrackedMissionNav(m);
      }
    }));
    bus.on('heist:facilityCandidate', (p) => this._heistEach(
      (h) => heistMissionRuntime.onFacilityCandidate(this._heistCtx(), h, p || {})));
    // BREAKAWAY: the capture fork's mechanical truth (engaged / slipped out / refused and why) is
    // spoken to the player; it is never a candidate and never settles anything.
    bus.on('heist:captureFork', (p) => this._heistEach(
      (h) => heistMissionRuntime.onCaptureFork(this._heistCtx(), h, p || {})));
    // SF-147: the monitored lane — a Concord post pulsed a stolen body; the run's second act
    // decides whether the chase wakes again.
    bus.on('heist:monitorScan', (p) => this._heistEach(
      (h) => heistMissionRuntime.onMonitorScan(this._heistCtx(), h, p || {})));
    // SF-147: the shell physically shed a sealed unit — one spoken line per run.
    bus.on('heist:shipmentUnit', (p) => this._heistEach(
      (h) => heistMissionRuntime.onShipmentUnit(this._heistCtx(), h, p || {})));
    // SF-143: the yard's mechanical events (gate committed/broken, crates delivered/lost,
    // crew down, pressure inbound) — each is a real physical fact with a spoken line.
    bus.on('heist:counterweight', (p) => this._counterweightEach(
      (record) => counterweightRuntime.onCounterweightEvent(this._heistCtx(), record, p || {})));
    bus.on('tether:latched', (p) => this._heistEach((h, m) => {
      if (heistMissionRuntime.onTetherLatched(this._heistCtx(), h, p || {})) {
        this._refreshTrackedMissionNav(m);
      }
    }));
    for (const releaseEvent of ['tether:released', 'tether:cut', 'tether:broke']) {
      bus.on(releaseEvent, (p) => this._heistEach((h, m) => {
        if (heistMissionRuntime.onTetherReleased(this._heistCtx(), h, p || {})) {
          this._refreshTrackedMissionNav(m);
        }
      }));
    }
    // smuggling bust: a patrol scan caught contraband.
    bus.on('player:scannedByPatrol', (p) => this._onScannedByPatrol(p));
    // Wreck-communicator authored choices (the wreckChoicePrompt deck adapter): missions owns the
    // boarded offer, so a pick stamps wreckChoiceId onto it and runs the canonical accept seam.
    bus.on('wreckMission:choose', (p) => this._onWreckMissionChoice(p));
    // Pod rescue is a commitment: a latched tow means the passenger contract leaves the board.
    bus.on('survivorPod:rescueSelected', (p) => this._onSurvivorRescueSelected(p));
    // A stripped pod is terminal — withdraw its boarded offer, and fail a live rescue into residue.
    bus.on('survivorPod:stripped', (p) => this._onSurvivorPodStripped(p));
    // BP-01.1: dying while carrying contract cargo fails the leg at the player's own wreck — the
    // durable marker aftermathWrecks already minted is the recovery site (not a rumored position).
    bus.on('player:death', (p) => this._onPlayerDeathMissions(p || {}));
    // Contract clauses are observers only. Their single breach intent returns here so the canonical
    // mission failure path owns collateral, reputation, cleanup, receipts, and SP1 recovery offers.
    bus.on('contract:clauseBroken', (p) => this._onContractClauseBroken(p));
    // A blocking physics term latched: any contract whose objective was already met but was held
    // back on that term settles now, without needing a second dock or a second kill.
    bus.on('mission:conditionSatisfied', (p) => this._onConditionSatisfied(p));
    // The Long Read is a chained-offer adapter over the live unique-wreck D-loop. These events are
    // evidence of actual rumor, scan, complication, salvage, and decision state—not proxy counters.
    bus.on('uniqueWreck:rumorRecorded', (p) => this._onLongReadRumorRecorded(p));
    bus.on('uniqueWreck:bearingFixed', (p) => this._onLongReadBearingFixed(p));
    bus.on('uniqueWreck:complicationTriggered', (p) => this._onLongReadComplication(p));
    bus.on('uniqueWreck:encounterActivated', (p) => this._onLongReadComplication(p));
    bus.on('uniqueWreck:decisionReady', (p) => this._onLongReadDecisionReady(p));
    bus.on('uniqueWreck:resolved', (p) => this._onLongReadResolved(p));

    // ── Lazy mission-target spawning when the player enters a target sector ───────────────────
    bus.on('sector:enter', (p) => this._onSectorEnter(p));
    bus.on('sector:exit', (p) => this._onSectorExit(p));
    bus.on('race:reset', () => this._resetAuthoredRace());
    bus.on('race:restart', () => this._restartAuthoredRace());
    bus.on('race:abort', () => this._dnfAuthoredRaces('race_aborted'));
    bus.on('game:exitToMenu', () => { this._dnfAuthoredRaces('race_aborted'); this._racingOpponents?.stop('menu'); this._racingSetPieces?.stop('menu'); resetRacingGhostSession(this.state); });
    bus.on('save:restoring', () => { this._racingOpponents?.stop('restore'); this._racingSetPieces?.stop('restore'); resetRacingGhostSession(this.state); });
    bus.on('settings:changed', p => {
      if (p?.section !== 'gameplay' || p.key !== 'racingGhost') return;
      for (const m of this.state.missions.active || []) if (m.params?.racingContractId) m.params.raceGhostEnabled = p.value !== false;
    });
    // Census arm: mission-target spawns land inside the sector cook deterministically. The
    // cook drives the chunked twin across its slice clock; the emit listener drains the same
    // steps synchronously, so both paths mint the identical cohort.
    this._cookProvider = (sector) => this._onSectorEnterSteps({
      sectorId: (sector && sector.id)
        || (this.state && this.state.world && this.state.world.currentSectorId),
    });
    (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = []))
      .push(this._cookProvider);

    // ── WF-08 claim-stake salvage: the contested wreck's own listeners. Every row below is a
    // strict no-op unless an active contract owns the touched entity, so ordinary wrecks,
    // ambient salvor claims, and authored sites never see these paths. ────────────────────────
    bus.on('mining:start', (p) => this._onContractClaimBeamStart(p));
    bus.on('salvage:claimJumped', (p) => this._onContractClaimJumped(p));
    bus.on('salvage:completed', (p) => this._onContractClaimSalvageCompleted(p));
    bus.on('tether:latched', (p) => this._onContractClaimLatch(p));
    bus.on('combat:damage', (p) => this._onContractClaimDamage(p));
    bus.on('entity:killed', (p) => this._onContractClaimKill(p));
    bus.on('entity:destroyed', (p) => this._onContractClaimDestroyed(p));
    // PB-MIS-E: yard bodies die through the same two receipts every hull does; a hired tug
    // reports its own loss on the npcJobs seam.
    bus.on('entity:killed', (p) => this._onYardWorkEntityLost(p));
    bus.on('entity:destroyed', (p) => this._onYardWorkEntityLost(p));
    bus.on('npcJobs:towAssistLost', (p) => this._onYardTowAssistLost(p));
    // The hauler's manifest pod spawns inside lootShards' own kill listener — possibly after
    // this system's kill handler ran. Its spill event is the honest moment to move the marker.
    bus.on('loot:manifestPayload', (p) => this._onContractClaimPodSpilled(p));

    // ── Story-beat triggers from other systems ───────────────────────────────────────────────
    bus.on('ship:purchased', (p) => this._onContract47aB3ShipPurchased(p || {}));
    bus.on('asset:deployed', (p) => this._onContract47aB6AssetDeployed(p || {}));
    bus.on('automation:programAssigned', (p) => this._onContract47aB6ProgramAssigned(p || {}));
    bus.on('automation:assetLost', (p) => this._onContract47aB6AssetLost(p || {}));
  },

  // =========================================================================================
  // PER-TICK: TTL decrement, expiry, story-gate checks, stale-target GC.
  // =========================================================================================
  update(dt, state) {
    this._dropSettledGhosts();
    this._releaseCampaignNavForSwarm(state);
    this._racingOpponents?.reconcile(state.missions?.active || []);
    this._racingSetPieces?.reconcile(state.missions?.active || []);
    this._adventureSpeedSetPieces?.reconcile();
    // W-BOOKS-3-4 (§34.7 Book 4): six days after a taken doubled contract the airlock
    // wall answers — fires docked or flying, the wall doesn't care where you read it.
    this._stepBookDoubledWall(state);
    if (state.mode && state.mode !== 'flight') return; // sim frozen while docked/paused
    // W-BOOKS-0-2 (§34.7 Book 0): the Skim fires on the lane once the sample has been
    // aboard long enough — the dock fallback covers a pilot who jumps the lane first.
    this._stepContract47aSkim(state);
    // W-CANON (§34.7 row 537): quiet interlude scenes request themselves through the
    // encounter director once their book boundary has passed — one at a time, only
    // while the pilot is in flight; lane violence never starves an owed quiet scene.
    this._stepCampaign47aInterludes(state);
    // Flush settlement-detached capital boss fights AFTER the score's own fixed-tick step has run
    // at least once past the terminal observation, so capitalBoss:ended (final voice/telemetry)
    // is emitted before the record is removed.
    if (this._pendingCapitalBossDetaches && this._pendingCapitalBossDetaches.size) {
      const pending = this._pendingCapitalBossDetaches;
      this._pendingCapitalBossDetaches = new Set();
      for (const fightId of pending) {
        this.bus.emit('capitalBoss:detach', { fightId });
      }
    }
    const active = state.missions.active;
    const now = state.simTime;
    for (let i = active.length - 1; i >= 0; i--) {
      const m = active[i];
      if (m.status !== 'active') continue;
      if (m.params?.workingBattlefield) { driveWorkingBattlefield(this, m, i); continue; }
      // Expiry by deadline.
      if (m.deadline_s != null && Number.isFinite(m.deadline_s) && now >= m.deadline_s) { this._expireMission(m, i); continue; }
      // PQ-019C: the capsule run's bounded window is an arbitrated `expired` CANDIDATE, never a
      // mission deadline — the branch above would settle with zero terminal receipts. The authored
      // offer therefore declares no `duration_s`, and this drive may remove `m` from `active`, which
      // the reverse iteration above already tolerates.
      if (m.heist) { this._driveHeist(m, i); continue; }
      // SF-143: the yard watch's window is the runtime's armed clock, never a deadline — same
      // drive-then-settle shape as the heist, and `continue` keeps ordinary mission logic out.
      if (m.counterweight) { this._driveCounterweight(m, i); continue; }
      // Escort: steer the friendly escortee toward the destination each tick.
      if (m.type === 'escort' && m._escorteeId != null) {
        this._steerEscortee(m, state, dt);
        if (m.params?.cleanCylinder) { this._driveCleanCylinder(m, i, state, dt); continue; }
        this._maybeTurnEscort(m, state);
      }
      if (m.type === 'passenger_transport' && m.params?.quietPassage) {
        this._driveQuietPassage(m, i, state, dt);
        continue;
      }
      if (m.type === 'smuggling_run' && m.params?.wakeHandoff) {
        driveWakeHandoff(this, m, i, dt);
        continue;
      }
      if (m.type === 'bounty_hunt' || m.type === 'patrol_clear') {
        this._armAcceptedCombatTargets(m, state);
      }
      if (m.type === 'bounty_hunt' && m.storyTarget) {
        this._maybeMarkHail(m, state);
      }
      // WF-08: the contested salvage site is a live scene — the crew mills the hull, siphons
      // units while the player watches, and the claim lapses when nobody is left to hold it.
      if (m.type === 'salvage_retrieval' && m.needsTargets) {
        this._driveContractClaimSite(m, state, dt);
      }
      // PB-MIS-E: the Forge yard scenes settle on physical position alone — a net inside the
      // dock ring is delivered, a lighter parked in the berth ring is berthed. No flags.
      if (m.type === SPLIT_MANIFEST_TYPE && m.needsTargets) {
        this._driveSplitManifest(m, i, state);
      }
      if (m.type === QUIET_BERTH_TYPE && m.needsTargets) {
        this._driveQuietBerth(m, i, state);
      }
      // SF-149: the vigil's third visit completes on the physical return — the filed outcome
      // is already durable; what remains is standing inside the changed site.
      if (m.type === 'salvage_retrieval' && m.params
        && m.params.setPieceObjective === 'choir_what_remains' && m.params.outcomeFiled === true) {
        this._driveChoirWhatRemainsReturn(m, i, state);
      }
      // FB-066: an ordered gate course scores the player's own flight line each tick — the
      // contract is the geometry, so the per-tick predicate is the only honest judge.
      if (m.type === 'race') this._driveRace(m, i, state, dt);
    }
    // A saturated cap defers authored targets; retry in stable mission order at a bounded cadence.
    // This is also the Continue top-up path after world adopted only part of a target group.
    if ((state.tick | 0) >= (this._nextMissionSpawnRetryTick | 0)) {
      this._nextMissionSpawnRetryTick = (state.tick | 0) + 15;
      for (const m of active) this._ensureMissionTargets(m);
    }
    // ── PER-TICK PREDICATE SLOT (grammar §9.9.1) ──────────────────────────────────────────────
    // Until this line existed, update() evaluated NOTHING per frame except the deadline, which is
    // why a mission could only ever say "counter >= N" or "docked at station X". This is the hook
    // that lets a contract term be a physical state — speed held, line under tension, alongside the
    // berth — instead of an event count.
    this._drivePassengerBeats(state);
    this._evaluateMissionConditions(dt, state);
    // Story credit/net-worth gates are checked opportunistically (cheap, no per-frame DOM).
    this._checkStoryGates();
    this._navRefreshT = (this._navRefreshT || 0) + (dt || 0);
    if (this._navRefreshT >= 0.75) {
      this._navRefreshT = 0;
      this._refreshNavigation();
    }
  },

  // =========================================================================================
  // PHYSICS CONDITIONS — the per-tick predicate half of the condition language.
  // The event half lives in the one generic observer (src/systems/contractClauses.js); both count
  // through the same shared tally so they cannot drift.
  // =========================================================================================

  /** Cheapest possible early-out: no active mission carries a tick term ⇒ zero work, zero writes. */
  _anyTickCondition(active) {
    for (const m of active) {
      if (!m || m.status !== 'active' || !Array.isArray(m.clauses)) continue;
      for (const row of m.clauses) {
        if (isMissionConditionRow(row) && TICK_CONDITION_ID_SET.has(row.conditionId)) return true;
      }
    }
    return false;
  },

  /** Live physical facts a tick predicate may read. Built once per frame, only when needed. */
  _conditionTickContext(state) {
    const player = state.entities && state.playerId != null ? state.entities.get(state.playerId) : null;
    if (!player || !player.pos) return null;
    const vx = (player.vel && player.vel.x) || 0;
    const vz = (player.vel && player.vel.z) || 0;
    return {
      playerId: state.playerId,
      player,
      speed: Math.hypot(vx, vz),
      tether: (state.player && state.player.tether) || null,
      simTime: state.simTime || 0,
      state,
      mission: null,
      destPos: null,
    };
  },

  /**
   * World position of a mission's destination berth, or null when the berth is not spawned in the
   * player's current sector. Deliberately live-entity only: a berth predicate that resolved against
   * an authored anchor in another sector's local coordinate frame would silently compare distances
   * across two different origins.
   */
  _missionBerthPos(m) {
    if (!m || !m.destStationId) return null;
    const live = this._liveStation(m.destStationId);
    return live && live.pos ? live.pos : null;
  },

  _evaluateMissionConditions(dt, state) {
    const active = state.missions.active;
    if (!active.length || !this._anyTickCondition(active)) return;
    let ctx = null;
    for (const m of active) {
      if (!m || m.status !== 'active' || !Array.isArray(m.clauses) || !m.clauses.length) continue;
      for (const row of m.clauses) {
        if (!isMissionConditionRow(row)) continue;
        const def = missionConditionById(row.conditionId);
        if (!def || typeof def.tickSample !== 'function') continue;
        const runtime = m._clauseState && m._clauseState[def.id];
        if (runtime && (runtime.breached || runtime.satisfied)) continue;
        if (!ctx) {
          ctx = this._conditionTickContext(state);
          if (!ctx) return;
        }
        ctx.mission = m;
        ctx.destPos = this._missionBerthPos(m);
        let holds = false;
        try { holds = !!def.tickSample(ctx); } catch (_) { holds = false; }
        this._advanceTickCondition(m, def, holds, dt, state);
      }
    }
  },

  /**
   * Distance-and-hold, straight out of encounterScripts (`:38-40`, `:291-297`): the watched state has
   * to hold CONTINUOUSLY for `holdS` before it scores. That window is the fairness contract — the
   * player is warned the instant the state goes bad and only pays holdS later, so a trackpad
   * overshoot or a moment of slack while reeling can never void a run.
   */
  _advanceTickCondition(m, def, holds, dt, state) {
    const clauseState = m._clauseState || (m._clauseState = {});
    const runtime = clauseState[def.id] || (clauseState[def.id] = { count: 0 });
    if (!holds) { runtime.holdT = 0; return; }
    runtime.holdT = (runtime.holdT || 0) + (dt || 0);
    const now = state.simTime || 0;
    if (def.warnText && (runtime.warnAt == null || now - runtime.warnAt >= CONDITION_WARN_COOLDOWN_S)) {
      runtime.warnAt = now;
      // Told up front on the board, told again the moment it starts going wrong. This alert is the
      // grace window made visible; the breach line below only lands if the player ignores it.
      this.bus.emit('alert', { key: `mission-term-${def.id}`, sev: 'warn', text: def.warnText, ttl: 2.2 });
    }
    if (runtime.holdT < (Number(def.holdS) || 0)) return;
    runtime.holdT = 0;
    const outcome = tallyMissionCondition(m, def, now);
    if (outcome === 'ignored') return;
    if (outcome === 'progress') {
      this.bus.emit('mission:conditionProgress', {
        missionId: m.id, conditionId: def.id, kind: def.kind, label: def.label,
        count: runtime.count || 0, target: Math.max(1, Math.round(Number(def.count) || 1)),
      });
      this.bus.emit('mission:updated', { missionId: m.id });
      return;
    }
    if (outcome === 'satisfied') {
      this.bus.emit('mission:conditionSatisfied', {
        missionId: m.id, conditionId: def.id, label: def.label, blocking: def.blocking === true,
      });
      this.bus.emit('toast', { text: def.satisfiedText || `${def.label}: done.`, kind: 'success', ttl: 3 });
      this.bus.emit('mission:updated', { missionId: m.id });
      return;
    }
    // Breached. 'fail' routes through the same one-penalty intent the shipped clause path uses so
    // collateral, rep, cleanup and receipts stay owned by _failMission; 'forfeit' keeps the contract.
    this.bus.emit('mission:conditionBroken', {
      missionId: m.id, conditionId: def.id, event: null,
      label: def.label, onBreach: def.onBreach || 'fail',
    });
    const line = def.breachText || `Contract term broken: ${def.label}.`;
    if (def.onBreach === 'fail') {
      const index = this.state.missions.active.indexOf(m);
      const twist = isTwistCondition(def);
      if (!twist) this.bus.emit('toast', { text: line, kind: 'error', ttl: 4 });
      this._failMission(m, index, twist ? `clause_broken:${def.id}` : `condition_broken:${def.id}`);
      return;
    }
    this._sayConditionLine(line);
    this.bus.emit('mission:updated', { missionId: m.id });
  },

  /** One comms line through the shipped voice arbiter, toast fallback (never both). */
  _sayConditionLine(text) {
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function'
      && voice.say({ channel: 'comms', text, kind: 'clauseBreach' })) return;
    this.bus.emit('toast', { text, kind: 'warn', ttl: 4 });
  },

  /** Physics terms carried by a mission instance, as canonical catalog records. */
  _missionConditions(m) {
    if (!m || !Array.isArray(m.clauses)) return [];
    return m.clauses.filter(isMissionConditionRow)
      .map((row) => missionConditionById(row.conditionId))
      .filter(Boolean);
  },

  /**
   * Blocking `require` terms this mission has not satisfied. A turn-in is refused while this is
   * non-empty, and the player is told exactly which term and what to do about it. That refusal is
   * what makes "deliver it, and come alongside under control" a different mission from "deliver it"
   * — not the same mission with a bonus stapled on.
   */
  _blockedByConditions(m) {
    const pending = unsatisfiedRequiredConditions(m);
    if (!pending.length) return null;
    const first = pending[0];
    return {
      condition: first,
      text: first.pendingText || `${first.label}: not satisfied yet.`,
    };
  },

  /** True when a turn-in was refused (and the reason spoken). */
  _refuseTurnInIfBlocked(m) {
    const blocked = this._blockedByConditions(m);
    if (!blocked) return false;
    this.bus.emit('toast', { text: blocked.text, kind: 'warn', ttl: 4 });
    this.bus.emit('mission:conditionPending', {
      missionId: m.id, conditionId: blocked.condition.id, label: blocked.condition.label,
      remaining: conditionRemaining(m, blocked.condition),
    });
    return true;
  },


  // =========================================================================================
  // ACCEPT / ABANDON
  // =========================================================================================
  /** Move an offer from a board to active. Charges collateral, enforces maxActive, emits accepted. */
  acceptMission(missionId, options = {}) {
    const state = this.state, cfg = state.missions.config || MISSION_TUNING;
    if (!missionId) return false;
    const retiringMissionId = options && options.retiringMissionId;
    const retiringActive = retiringMissionId != null
      && state.missions.active.some((mission) => (
        mission && mission.id === retiringMissionId && mission.status === 'active'
      ));
    const { offer: foundOffer, board } = this._findOffer(missionId);
    let offer = foundOffer;
    if (!offer) return false;
    // Rebuild premium terms before any saved fields can select another acceptance path.
    if (offer.source === CLAUSE_GAMBIT_SOURCE) {
      const rebuilt = reconstructClauseGambitOffer(offer, state.missions.boards, this._epoch());
      if (!rebuilt) {
        if (board && Array.isArray(board.slots)) {
          board.slots = board.slots.filter((candidate) => candidate && candidate.id !== offer.id);
        }
        this.bus.emit('mission:updated', { missionId: null, stationId: offer.stationId });
        this.bus.emit('toast', {
          text: 'Those contract terms are no longer available', kind: 'warn', ttl: 4,
        });
        return false;
      }
      offer = rebuilt;
    }
    // A row can remain displayed across a refresh boundary. Revalidate its own published
    // window before collateral, freight, or branch selection can commit the stale contract.
    if (Number.isFinite(offer.expiresAtEpoch) && offer.expiresAtEpoch <= this._epoch()) {
      if (board && Array.isArray(board.slots)) {
        board.slots = board.slots.filter((candidate) => candidate && candidate.id !== offer.id);
      }
      this.bus.emit('mission:updated', { missionId: null, stationId: offer.stationId });
      this.bus.emit('toast', { text: 'That contract offer has expired — choose current work from the board', kind: 'warn', ttl: 4 });
      return false;
    }
    if (offer.params && SET_PIECE_DISPOSITION_OBJECTIVES.has(offer.params.setPieceObjective)) {
      const wreckId = offer.params.wreckId || offer.wreckId || offer.cause && offer.cause.wreckId;
      const bearing = this.state.player && this.state.player.uniqueWrecks
        && this.state.player.uniqueWrecks.bearings
        && this.state.player.uniqueWrecks.bearings[wreckId];
      if (bearing && bearing.phase === 'salvaged'
        && bearing.choiceId !== offer.params.wreckChoiceId) {
        if (board && Array.isArray(board.slots)) {
          board.slots = board.slots.filter((candidate) => candidate && candidate.id !== offer.id);
        }
        this.bus.emit('mission:updated', { missionId: null, stationId: offer.stationId });
        this.bus.emit('toast', { text: 'That wreck already has a different disposition', kind: 'warn', ttl: 4 });
        return false;
      }
    }
    if (offer.source === 'poiBehavior' && !validatePoiCausalOffer(offer).ok) return false;
    // NXI-169 — a shortage-backed offer is only as live as the starvation that posted it. A row
    // planned while the yard's hopper ran empty must not pay the scarcity premium for a delivery
    // the station no longer requested: re-read the posted need at accept and retire the stale row.
    // Only the unaccepted board offer retires here — an already-accepted contract keeps its
    // recorded terms (the NXI-109 guarantee); nothing is cancelled retroactively.
    if (this._shortageOfferStale(offer)) {
      if (board && Array.isArray(board.slots)) {
        board.slots = board.slots.filter((candidate) => candidate && candidate.id !== offer.id);
      }
      this.bus.emit('mission:updated', { missionId: null, stationId: offer.stationId });
      const yard = stationInfoFor(this.state, offer.destStationId);
      this.bus.emit('toast', {
        text: `That relief run is stale — ${(yard && yard.name) || offer.destStationId} no longer needs the feedstock`,
        kind: 'warn',
        ttl: 4,
      });
      return false;
    }
    // A remembered captain can die or rotate their desk while this row is still displayed.
    // Refuse before fees, sealed cargo or an active instance; accepted contracts keep their terms.
    const captainPreflight = captainStandingOfferPreflight(state, offer);
    if (!captainPreflight.ok) {
      if (board && Array.isArray(board.slots)) board.slots = board.slots.filter(candidate => candidate?.id !== offer.id);
      this.bus.emit('mission:updated', { missionId: null, stationId: offer.stationId });
      this.bus.emit('toast', { text: captainPreflight.reason, kind: 'warn', ttl: 4 });
      return false;
    }
    if (offer.storyDisposition) {
      const choice = offer.storyDisposition;
      // Stage irreversible confirmation (story resolves only on ui:endgameConfirm / confirm:true).
      this.bus.emit('ui:endgameChoose', { choice, source: 'ashfall_mission_board', offerId: offer.id });
      return true;
    }
    if (state.missions.active.length - (retiringActive ? 1 : 0) >= (cfg.maxActive || 8)) {
      this.bus.emit('toast', { text: 'Too many active missions', kind: 'error', ttl: 3 });
      return false;
    }
    const preflight = this._acceptPreflight(offer);
    if (!preflight.ok) {
      this.bus.emit('toast', { text: preflight.reason, kind: 'error', ttl: 3 });
      return false;
    }

    // Affordability is read-only here; economy remains the sole wallet writer. SP1's authored
    // service fee is paid only on attempt zero, so a recovery offer cannot charge it twice.
    const collateralCr = Math.max(0, Math.round(Number(offer.collateral_cr) || 0));
    const upfrontCostCr = setPieceUpfrontCost(offer, state);
    const acceptCostCr = collateralCr + upfrontCostCr;
    const availableCredits = Number.isFinite(Number(state.player && state.player.credits))
      ? Number(state.player.credits) : 0;
    if (acceptCostCr > 0 && availableCredits < acceptCostCr) {
      const text = upfrontCostCr > 0
        ? `Need ${acceptCostCr} cr for deposit and service fees`
        : `Need ${collateralCr} cr collateral`;
      this.bus.emit('toast', { text, kind: 'error', ttl: 3 });
      return false;
    }

    const inst = this._instanceFromOffer(offer);
    // A branch selection is atomic: withdraw both siblings from every board before any fee intent
    // or sealed-manifest cargo write can expose a half-selected route to synchronous listeners.
    const withdrawnSetPiece = setPieceCauseOf(offer)
      ? this._withdrawSetPieceChoiceOffers(offer) : [];
    // RC-467: a Clause Gambit alternative and the offer it was built from are ONE choice. Accepting
    // either version withdraws both across every board, keeping their positions for a restore.
    const withdrawnGambit = setPieceCauseOf(offer) ? [] : this._withdrawClauseGambitPair(offer);
    if (!setPieceCauseOf(offer) && !withdrawnGambit.length && board) {
      board.slots = board.slots.filter((o) => o.id !== offer.id);
    }
    if (inst.preloadedCargo && inst.params && inst.params.cmdtyId) {
      const sealedQty = Math.max(1, Math.floor(Number(inst.params.qty) || 1));
      // The reservation lives on the contract, not in a second inventory. It is visible
      // as soon as the units land, and a failed load never leaves a half-open claim.
      inst.params.sealedRemaining = sealedQty;
      inst.params.sealedDelivered = 0;
      inst.params.sealAccounted = true;
      const loaded = addCargo(state, inst.params.cmdtyId, sealedQty);
      if (loaded < sealedQty) {
        if (loaded > 0) removeCargo(state, inst.params.cmdtyId, loaded);
        if (withdrawnSetPiece.length) this._restoreWithdrawnSetPieceOffers(withdrawnSetPiece);
        else if (withdrawnGambit.length) this._restoreWithdrawnBoardOffers(withdrawnGambit);
        else if (board && !board.slots.some((candidate) => candidate.id === offer.id)) board.slots.unshift(offer);
        this.bus.emit('toast', { text: 'Cargo hold cannot receive the sealed manifest', kind: 'error', ttl: 3 });
        return false;
      }
    }
    if (collateralCr > 0) {
      this.bus.emit('economy:chargeCredits', { amount: collateralCr, reason: `collateral:${offer.id}` });
    }
    if (upfrontCostCr > 0) {
      this.bus.emit('economy:chargeCredits', { amount: upfrontCostCr, reason: `mission_upfront:${offer.id}` });
    }
    state.missions.active.push(inst);
    if (inst.params?.workingBattlefield) grantWorkingBattlefieldPolymers(this, inst, addCargo);
    // B5 is a real choice: once one loop is accepted, withdraw the two tutorial siblings before
    // synchronous mission:accepted listeners run. The accepted instance remains an ordinary live
    // mission; only the unchosen board invitations disappear.
    if (inst.source === ONBOARDING_CHOICE_SOURCE && board && Array.isArray(board.slots)) {
      board.slots = board.slots.filter((candidate) => (
        candidate && candidate.source !== ONBOARDING_CHOICE_SOURCE
      ));
    }

    // Spawn any immediate/deferred targets (if the player is already in the target sector).
    this._ensureMissionTargets(inst);
    // Accepting auto-tracks AND speaks the objective through the voiceArbiter objective channel
    // (tier 60) — same one-voice path as a manual Mission Log track. The ambient "Mission accepted"
    // toast below is a separate lane (transaction confirmation), so the two do not contend.
    this.trackMission(inst.id);

    this.bus.emit('mission:accepted', {
      missionId: inst.id,
      type: inst.type,
      storyTag: inst.storyTag || undefined,
      source: inst.source || undefined,
      sourceOfferId: inst.sourceOfferId || undefined,
      sourceRef: inst.sourceRef || undefined,
      wreckId: inst.wreckId || undefined,
      channelId: inst.channelId || undefined,
      causeFingerprint: inst.cause && inst.cause.fingerprint || undefined,
      ...setPieceEventFields(inst),
    });
    this._emitMissionTargetProjection(inst);
    this.bus.emit('mission:updated', { missionId: inst.id });
    // The physics terms ride in the SAME accept toast rather than a second one — the voice arbiter
    // already owns the objective line and the transaction lane owns this one. A player who skipped
    // the dossier tags still cannot start a term-carrying run without having been told the terms.
    const termLines = this._missionConditions(inst).map((c) => c.brief).filter(Boolean);
    const acceptText = termLines.length
      ? `Mission accepted: ${inst.title} — Terms: ${termLines.join(' ')}`
      : `Mission accepted: ${inst.title}`;
    this.bus.emit('toast', { text: acceptText, kind: 'success', ttl: termLines.length ? 5 : 3 });
    // GF-4: a gold echo-ring + light flash at the player so accepting a contract has a visible beat
    // (the audio stinger fires from audioSystem's mission:accepted subscription). 'objective' lane
    // resolves to a warm gold radial ring in vfx._presentationStyle.
    const _p = this.state.entities && this.state.playerId != null ? this.state.entities.get(this.state.playerId) : null;
    this.bus.emit('presentation:vfxCue', {
      id: 'mission.accept', lane: 'objective', material: 'objective',
      particles: 24, lights: 1, magnitude: 1,
      position: _p ? { x: _p.pos.x, z: _p.pos.z } : null,
      targetId: this.state.playerId,
    });

    // B4 branch: accepting a faction intro contract sets the story branch.
    this._maybeSetBranch(inst);
    // W-BOOKS-3-4: accepting a Books 3–4 board row speaks its scene — Slate's
    // handover, the maw's appetite, the Foreman's claim, the doubled tag's plain type.
    this._onBookContractAccepted(inst);
    this._startLongReadObjective(inst);
    this._startWreckBoundStageObjective(inst);
    return true;
  },

  /**
   * NXI-169 — true when a shortage-backed economyContract offer's posted need is already
   * satisfied: the destination yard's hungriest industry input leg is no longer the offered
   * commodity (the same pure read, starvedIndustryNeedFor, that planned the posting). A blind
   * read — no market row, unknown station/sector — keeps the offer rather than retiring it.
   */
  _shortageOfferStale(offer) {
    if (isShortageGateRepair(offer)) {
      const eventId = offer.cause.shortageEventId;
      return !!this.state.economyContracts?.shortageRepairs?.[eventId]
        || (this.state.missions.active || []).some((m) => m.status === 'active'
          && isShortageGateRepair(m) && m.cause.shortageEventId === eventId)
        || !(this.state.economy?.econEvents || []).some((event) => event.id === eventId
          && event.type === 'shortage' && this.state.simTime < event.startT + event.duration)
        || !marketStockStatus(this.state, offer.destStationId, offer.params.cmdtyId).soldOut;
    }
    if (!offer || offer.source !== 'economyContract' || offer.type !== 'cargo_delivery') return false;
    if (!offer.cause || offer.cause.tag !== 'industry_starved') return false;
    const cmdtyId = offer.params && offer.params.cmdtyId;
    const stationId = offer.destStationId;
    if (!cmdtyId || !stationId) return false;
    const markets = this.state.economy && this.state.economy.markets;
    const market = markets ? markets[stationId] : null;
    const info = stationInfoFor(this.state, stationId);
    if (!market || !info) return false;
    const sector = SECTOR_BY_ID.get(offer.destSectorId || info.sectorId);
    if (!sector) return false;
    const need = starvedIndustryNeedFor(info.type, sector.tier || 0, market);
    return !need || need.inputId !== cmdtyId;
  },

  /**
   * NXB-043/NXI-171 — shortage-backed board rows track the live hopper that posted them.
   * A delivery (or any real stock write) that feeds the destination yard retires its row;
   * a partially fed yard re-quotes its quantity, payout and prose from the same read that
   * planned the posting — the board reflects the new actual requirement instead of replaying
   * the original emergency. Runs only on board reads and freight facts, never per frame.
   * Returns true when any row changed so the caller can emit one mission:updated.
   */
  _syncShortageOffers(board) {
    if (!board || !Array.isArray(board.slots)) return false;
    const markets = this.state.economy && this.state.economy.markets;
    if (!markets) return false;
    let changed = false;
    const kept = [];
    for (const offer of board.slots) {
      if (!offer || offer.source !== 'economyContract' || offer.type !== 'cargo_delivery'
        || !offer.cause || offer.cause.tag !== 'industry_starved'
        || !offer.params || !offer.params.cmdtyId || !offer.destStationId) {
        kept.push(offer);
        continue;
      }
      const market = markets[offer.destStationId];
      const destInfo = stationInfoFor(this.state, offer.destStationId);
      const destSector = destInfo && SECTOR_BY_ID.get(offer.destSectorId || destInfo.sectorId);
      const need = destInfo && market && destSector
        ? starvedIndustryNeedFor(destInfo.type, destSector.tier || 0, market)
        : null;
      if (!need || need.inputId !== offer.params.cmdtyId) {
        changed = true; // the hopper is fed — the post comes down; it is not re-rolled
        continue;
      }
      // Re-quote the live deficit under the same 20u posting bound. Reward and cargo value
      // scale with the new quantity — the berth pays for what it still needs, not the memory.
      const liveQty = Math.max(1, Math.min(20, need.deficitUnits));
      const qtyBefore = offer.params.qty;
      if (Number.isFinite(qtyBefore) && liveQty !== qtyBefore) {
        const ratio = liveQty / Math.max(1, qtyBefore);
        offer.params.qty = liveQty;
        offer.params.cargoValue = Math.max(1, Math.round((offer.params.cargoValue || 0) * ratio));
        offer.params.fValue = 1 + offer.params.cargoValue / 8000;
        offer.reward_cr = Math.max(1, Math.round((offer.reward_cr || 0) * ratio));
      }
      // Prose rebuild is deterministic — for a competing bid it also admits when the rival
      // yard's hopper filled and the duel collapsed to one berth.
      const summaryBefore = offer.summary;
      this._rewriteStarvedOfferText(offer, destInfo, markets);
      if (offer.summary !== summaryBefore || offer.params.qty !== qtyBefore) changed = true;
      kept.push(offer);
    }
    if (changed) board.slots = kept;
    return changed;
  },

  /** Re-derive a starvation row's title/summary/cause line from live names + need. */
  _rewriteStarvedOfferText(offer, destInfo, markets) {
    if (!offer || !offer.params) return;
    const destName = (destInfo && destInfo.name) || offer.destStationId;
    const commodity = this._cmdtyName(offer.params.cmdtyId);
    const rivalId = offer.cause && offer.cause.rivalStationId;
    let rivalName = null;
    let rivalStillHungry = true;
    if (rivalId) {
      const rivalInfo = stationInfoFor(this.state, rivalId);
      rivalName = (rivalInfo && rivalInfo.name) || rivalId;
      const rivalSector = rivalInfo && SECTOR_BY_ID.get(rivalInfo.sectorId);
      const rivalMarket = markets && markets[rivalId];
      const rivalNeed = rivalInfo && rivalSector && rivalMarket
        ? starvedIndustryNeedFor(rivalInfo.type, rivalSector.tier || 0, rivalMarket)
        : null;
      rivalStillHungry = !!(rivalNeed && rivalNeed.inputId === offer.params.cmdtyId);
    }
    const prose = starvedOfferProse({
      qty: offer.params.qty, commodity, destName, rivalName, rivalStillHungry,
    });
    offer.title = prose.title;
    offer.summary = prose.line;
    if (offer.cause) offer.cause.line = prose.line;
  },

  _withdrawSetPieceChoiceOffers(selectedOffer) {
    const selected = setPieceCauseOf(selectedOffer);
    if (!selected) return [];
    const withdrawn = [];
    for (const board of Object.values(this.state.missions.boards || {})) {
      if (!board || !Array.isArray(board.slots)) continue;
      const kept = [];
      for (let index = 0; index < board.slots.length; index++) {
        const candidate = board.slots[index];
        const cause = setPieceCauseOf(candidate);
        const sameChoice = cause && cause.chainId === selected.chainId
          && cause.stageIndex === selected.stageIndex
          && (candidate.id === selectedOffer.id || (selected.branchId && cause.branchId));
        if (sameChoice) withdrawn.push({ board, offer: candidate, index });
        else kept.push(candidate);
      }
      board.slots = kept;
    }
    return withdrawn;
  },

  _restoreWithdrawnSetPieceOffers(withdrawn) {
    for (const row of [...withdrawn].sort((a, b) => a.index - b.index)) {
      if (!row || !row.board || !Array.isArray(row.board.slots) || !row.offer) continue;
      if (row.board.slots.some((candidate) => candidate && candidate.id === row.offer.id)) continue;
      row.board.slots.splice(Math.min(row.index, row.board.slots.length), 0, row.offer);
    }
  },

  /**
   * RC-467 — a Clause Gambit alternative and the offer it was built from are ONE board choice.
   * Taking either withdraws both, across EVERY board (the alternative always posts to the base's own
   * board, but a moved or duplicated row must not survive as a clickable dead option while its pair
   * is in flight). Original positions are recorded so a failed sealed-cargo load can put the pair
   * back exactly where the player saw it.
   */
  _withdrawClauseGambitPair(selectedOffer) {
    const withdrawn = [];
    const selectedMeta = clauseGambitMeta(selectedOffer);
    const baseId = selectedMeta && typeof selectedMeta.baseOfferId === 'string'
      ? selectedMeta.baseOfferId : null;
    for (const board of Object.values(this.state.missions.boards || {})) {
      if (!board || !Array.isArray(board.slots)) continue;
      const kept = [];
      let changed = false;
      for (let index = 0; index < board.slots.length; index++) {
        const candidate = board.slots[index];
        if (!candidate) { kept.push(candidate); continue; }
        const candidateMeta = clauseGambitMeta(candidate);
        const isClicked = candidate.id === selectedOffer.id;
        const isItsAlternative = !!(candidateMeta && candidateMeta.baseOfferId === selectedOffer.id);
        const isItsBase = baseId != null && candidate.id === baseId;
        if (isClicked || isItsAlternative || isItsBase) {
          withdrawn.push({ board, offer: candidate, index });
          changed = true;
          continue;
        }
        kept.push(candidate);
      }
      if (changed) board.slots = kept;
    }
    return withdrawn;
  },

  /** Position-preserving restore shared by the atomic-choice withdrawals (set piece + gambit pair). */
  _restoreWithdrawnBoardOffers(withdrawn) {
    for (const row of [...withdrawn].sort((a, b) => a.index - b.index)) {
      if (!row || !row.board || !Array.isArray(row.board.slots) || !row.offer) continue;
      if (row.board.slots.some((candidate) => candidate && candidate.id === row.offer.id)) continue;
      row.board.slots.splice(Math.min(row.index, row.board.slots.length), 0, row.offer);
    }
  },

  /**
   * RC-467 — missions-owned removal seam for other owners that may read boards but must not mutate
   * them. The clause observer prunes orphaned Clause Gambit alternatives through this method (a
   * base accepted elsewhere, expired, or no longer eligible leaves the premium row dead). Sweeps
   * every board and returns how many rows went; publishes the board change once.
   */
  pruneBoardOffers(predicate) {
    if (typeof predicate !== 'function') return 0;
    const boards = this.state.missions.boards;
    if (!boards || typeof boards !== 'object') return 0;
    let removed = 0;
    for (const board of Object.values(boards)) {
      if (!board || !Array.isArray(board.slots)) continue;
      const kept = [];
      for (const offer of board.slots) {
        if (offer && predicate(offer)) { removed += 1; continue; }
        kept.push(offer);
      }
      if (kept.length !== board.slots.length) board.slots = kept;
    }
    if (removed > 0) this.bus.emit('mission:updated', { missionId: null });
    return removed;
  },

  /**
   * Missions-owned seam to post an authored board offer without accepting it — the
   * post-only half of postAndAcceptAuthoredOffer for callers that need the offer
   * on the board so the player (or a probe driving the player's click) accepts it.
   */
  postBoardOffer(rawOffer) {
    if (!rawOffer || typeof rawOffer !== 'object') return { ok: false, reason: 'bad_offer' };
    const offer = JSON.parse(JSON.stringify(rawOffer));
    if (!offer.id || !offer.type || !offer.stationId) {
      return { ok: false, reason: 'bad_offer_shape' };
    }
    if (!this.state.missions.boards || typeof this.state.missions.boards !== 'object') {
      this.state.missions.boards = {};
    }
    let board = this.state.missions.boards[offer.stationId];
    if (!board || typeof board !== 'object') {
      board = { refreshEpoch: this._epoch(), slots: [] };
      this.state.missions.boards[offer.stationId] = board;
    }
    if (!Array.isArray(board.slots)) board.slots = [];
    board.slots = board.slots.filter((candidate) => candidate && candidate.id !== offer.id);
    if (offer.source == null) offer.source = POSTED_BOARD_SOURCE;
    board.slots.unshift(offer);
    this.bus.emit('mission:updated', { missionId: null, stationId: offer.stationId });
    return { ok: true, offerId: offer.id };
  },

  // Read-only lane probes — facade reads cross on the missions domain leaf (a
  // multi-second cadence); harnesses that need the sim's truth now ask it
  // directly instead of treating mirror staleness as a verdict.
  listActive() {
    return (this.state.missions.active || []).map((m) => ({ id: m && m.id, status: m && m.status }));
  },
  boardSlots(stationId) {
    const board = this.state.missions.boards && this.state.missions.boards[stationId];
    return board && Array.isArray(board.slots) ? board.slots.map((o) => o && o.id) : [];
  },

  /**
   * Missions-owned seam for authored, deterministic contracts such as M3 Hauler steps.
   * The caller supplies a normal board offer; this method alone inserts and accepts it so
   * collateral, active ids, mission navigation, rewards, and receipts keep one authority.
   */
  postAndAcceptAuthoredOffer(rawOffer, options = {}) {
    if (!rawOffer || typeof rawOffer !== 'object') return { ok: false, reason: 'bad_offer' };
    const offer = JSON.parse(JSON.stringify(rawOffer));
    if (!offer.id || !offer.type || !offer.stationId || !offer.params) {
      return { ok: false, reason: 'bad_offer_shape' };
    }
    const duplicate = (this.state.missions.active || []).find((mission) => (
      mission && mission.status === 'active' && offer.storyTag
      && mission.storyTag === offer.storyTag
    ));
    if (duplicate) return { ok: true, missionId: duplicate.id, offerId: offer.id, reused: true };

    if (!this.state.missions.boards || typeof this.state.missions.boards !== 'object') {
      this.state.missions.boards = {};
    }
    let board = this.state.missions.boards[offer.stationId];
    if (!board || typeof board !== 'object') {
      board = { refreshEpoch: this._epoch(), slots: [] };
      this.state.missions.boards[offer.stationId] = board;
    }
    if (!Array.isArray(board.slots)) board.slots = [];
    board.slots = board.slots.filter((candidate) => candidate && candidate.id !== offer.id);
    board.slots.unshift(offer);

    if (!this.acceptMission(offer.id, options)) {
      board.slots = board.slots.filter((candidate) => candidate && candidate.id !== offer.id);
      return { ok: false, reason: 'accept_failed', offerId: offer.id };
    }
    const mission = (this.state.missions.active || []).find((candidate) => (
      candidate && candidate.status === 'active'
      && ((offer.storyTag && candidate.storyTag === offer.storyTag) || candidate.id === offer.id)
    ));
    return mission
      ? { ok: true, missionId: mission.id, offerId: offer.id, reused: false }
      : { ok: false, reason: 'accepted_instance_missing', offerId: offer.id };
  },

  _acceptPreflight(offer) {
    if (offer?.params?.workingBattlefield) {
      const ready = workingBattlefieldPreflight(this.state);
      if (!ready.ok) return ready;
    }
    if (offer?.type === 'race' && (this.state.missions.active || []).some(m => m?.status === 'active' && m.type === 'race')) {
      return { ok: false, reason: 'Finish or leave the current run before accepting another.' };
    }
    if (offer?.params?.adventureSpeedId && this.state.missions.adventureSpeedCompleted?.[offer.params.adventureSpeedId]) {
      return { ok: false, reason: 'This speed contract has already been completed.' };
    }
    const requiredModule = offer && offer.params && offer.params.requiredModule;
    if (requiredModule && !shipCarriesModule(activeOwnedShip(this.state), requiredModule)) {
      return { ok: false, reason: 'This job needs the fit you woke up in' };
    }
    // The Tethys launcher holds exactly one schedule. A second launcher contract accepted while one
    // is live would be denied at schedule time and fail as `unresolved_absent` — refuse it up front,
    // in words, instead.
    if (offer && (offer.type === PQ019C_HEIST_TYPE || offer.type === BREAKAWAY_RECOVERY_TYPE)
      && (this.state.missions.active || []).some((m) => m && m.status === 'active' && m.heist)) {
      return { ok: false, reason: `${PQ019_FACILITIES.heist_launcher.name} is committed to another run` };
    }
    // SF-143: the yard runs one watch at a time — a second accepted row would camp `active_scene`
    // denials until its own window starved. Refuse at the board, in words.
    if (offer && offer.type === COUNTERWEIGHT_WATCH_TYPE
      && (this.state.missions.active || []).some((m) => m && m.status === 'active' && m.counterweight)) {
      return { ok: false, reason: 'The yard is already under a watch contract' };
    }
    if (offer && offer.factionId) {
      const minRep = missionOfferMinRep(offer, this.state);
      const rep = this._repOf(offer.factionId);
      if (rep < minRep) {
        return {
          ok: false,
          reason: `${factionShortName(offer.factionId)} standing ${signedRep(minRep)} required`,
        };
      }
      // FB-044: a rank-gated row names its required step, not just a rep floor — a pilot whose
      // standing fell below the named rank between posting and accepting is refused in words.
      if (Number.isInteger(offer.minRankStep)
        && rankFromRep(rep, offer.factionId).step < offer.minRankStep) {
        return {
          ok: false,
          reason: `${factionShortName(offer.factionId)} rank '${rankTitleForStep(offer.factionId, offer.minRankStep)}' required`,
        };
      }
    }
    // The board gate checks the issuer's standing; the berth gate checks the destination's.
    // An authored offer can name a berth the world refuses (a repGated fence, the closed Den):
    // when the contract can only settle by docking there, accepting it writes a contract that
    // can never settle — refuse at the board, in words.
    if (offer && offer.destStationId && DOCK_SETTLED_TYPES.has(offer.type)) {
      const destInfo = stationInfoFor(this.state, offer.destStationId);
      const refusal = destInfo
        && stationBerthRefusal(destInfo.record || destInfo, this._repOf(destInfo.factionId), this.state);
      if (refusal) {
        return {
          ok: false,
          reason: refusal.kind === 'standing'
            ? `${destInfo.name} refuses this berth — ${factionShortName(destInfo.factionId)} standing ${signedRep(refusal.floor)} required`
            : refusal.kind === 'structural'
              ? `${destInfo.name} refuses this berth — ${refusal.text}`
              : `${destInfo.name} does not take this freight yet`,
        };
      }
    }
    // These return jobs supply no cargo and accept partial lots, including goods already held.
    if (!offer || offer.source === 'custodyRecovery' || !ONE_LOAD_CARGO_TYPES.has(offer.type)) return { ok: true };
    const requiredVolume = cargoFootprint(offer);
    if (!(requiredVolume > 0)) return { ok: true };
    const cargo = this.state.player && this.state.player.cargo || {};
    const capVolume = Number.isFinite(cargo.capVolume) ? cargo.capVolume : 0;
    const usedVolume = Number.isFinite(cargo.usedVolume) ? cargo.usedVolume : 0;
    if (Math.max(0, capVolume - usedVolume) < requiredVolume) {
      return {
        ok: false,
        reason: `Need ${fmtCargoUnits(requiredVolume)}u cargo capacity for this contract`,
      };
    }
    return { ok: true };
  },

  trackMission(missionId, options = {}) {
    if (!missionId) return false;
    const state = this.state;
    const mission = (state.missions.active || []).find((m) => m.id === missionId && m.status === 'active');
    if (!mission) return false;
    state.ui.trackedMissionId = mission.id;
    this._refreshTrackedMissionNav(mission);
    if (!options.silent) {
      const wp = state.nav && state.nav.waypoint;
      const ownsWaypoint = wp && wp.kind === 'mission' && wp.missionId === mission.id;
      const line = `Tracking: ${mission.title || 'Mission'}${ownsWaypoint && wp.reason ? ` - ${wp.reason}` : ''}`;
      // Mission-objective nudge → the one-voice arbiter's 'objective' tier (preempts chatter, yields
      // to tutorial/danger/story). Stable id so re-tracking replaces in place. Toast fallback only
      // when the arbiter helper is unavailable (headless/unit contexts).
      const voice = this.helpers && this.helpers.voice;
      const said = voice && typeof voice.say === 'function'
        && voice.say({ channel: 'objective', text: line, kind: 'info', ttl: 3, id: 'objective:tracked' });
      if (!said) this.bus.emit('toast', { text: line, kind: 'info', ttl: 3 });
    }
    this.bus.emit('mission:updated', { missionId: mission.id, tracked: true });
    return true;
  },

  _reconcileLandmarkQuestOffers(filters = {}) {
    let boarded = 0;
    for (const offer of buildLandmarkQuestOffers(this.state, filters)) {
      if (this._onExternalBoardOffer(offer)) boarded++;
    }
    return boarded;
  },

  /** Hand the B4 marker from the completed flight lesson to its newly tracked real contract. */
  releaseOnboardingNavigation(missionId) {
    const mission = (this.state.missions.active || []).find((candidate) => (
      candidate && candidate.id === missionId && candidate.status === 'active'
    ));
    if (!mission || this._onboardingOwnsOpeningNav()) return false;
    this._refreshTrackedMissionNav(mission);
    const waypoint = this.state.nav && this.state.nav.waypoint;
    return !!(waypoint && waypoint.kind === 'mission' && waypoint.missionId === mission.id);
  },

  _instanceFromOffer(offer) {
    const state = this.state;
    const id = `m_${state.missions.nextId++}`;
    const def = TYPE_BY_ID.get(offer.type);
    const durationS = Number(offer.duration_s);
    return {
      id, type: offer.type, stationId: offer.stationId || null, factionId: offer.factionId,
      params: JSON.parse(JSON.stringify(offer.params)), // own copy (progress mutates)
      objectiveProgress: 0,
      objectiveTarget: this._objectiveTarget(offer.type, offer.params),
      acceptedAt_s: deferredEnterNow(state),
      deadline_s: Number.isFinite(durationS) && durationS > 0
        ? Math.max(0, Number(deferredEnterNow(state)) || 0) + durationS : null,
      reward_cr: offer.reward_cr, collateral_cr: offer.collateral_cr,
      riskTier: offer.riskTier,
      ...(offer.economyTerms ? { economyTerms: JSON.parse(JSON.stringify(offer.economyTerms)) } : {}),
      destStationId: offer.destStationId, destSectorId: offer.destSectorId,
      distance: offer.distance,
      targetEntityIds: [],          // runtime entity ids (NOT serialized — re-spawned on load)
      needsTargets: !!(def && this._typeSpawnsTargets(offer.type, offer)),
      status: 'active',
      storyTag: offer.storyTag || null,
      storyContractId: offer.storyContractId || null,
      campaign47aBeat: Number.isFinite(offer.campaign47aBeat) ? offer.campaign47aBeat : null,
      storyTarget: offer.storyTarget ? JSON.parse(JSON.stringify(offer.storyTarget)) : null,
      preloadedCargo: !!offer.preloadedCargo,
      storyBranch: offer.storyBranch || null,
      storyStake: offer.storyStake || null,
      storyOperation: offer.storyOperation || null,
      title: offer.title,
      // Chart brief: one dry line of leg prose the star chart prints under the mission title.
      brief: offer.brief || null,
      ...(offer.stageId ? { stageId: String(offer.stageId) } : {}),
      ...(offer.stepBriefs && typeof offer.stepBriefs === 'object' && !Array.isArray(offer.stepBriefs)
        ? { stepBriefs: JSON.parse(JSON.stringify(offer.stepBriefs)) } : {}),
      summary: offer.summary || null,
      description: offer.description || null,
      authorization: offer.authorization || null,
      adminField: offer.adminField || null,
      source: offer.source || null,
      sourceRef: offer.sourceRef || null,
      wreckId: offer.wreckId || null,
      channelId: offer.channelId || null,
      ...(Array.isArray(offer.clauses) && offer.clauses.length
        ? { clauses: JSON.parse(JSON.stringify(offer.clauses)) } : {}),
      // The featured mark is a conditional spread on the same precedent as `clauses` — a plain
      // offer carries no key at all, so non-featured instances stay byte-identical.
      ...(offer.featured && typeof offer.featured === 'object'
        ? { featured: JSON.parse(JSON.stringify(offer.featured)) } : {}),
      // Moral traps: the lie on the contract rides the instance so the mid-run reveal can find it.
      // Same conditional-spread precedent — an honest offer's instance stays byte-identical.
      ...(offer.trap && typeof offer.trap === 'object'
        ? { trap: JSON.parse(JSON.stringify(offer.trap)) } : {}),
      // PQ-019C. The heist subrecord nests inside an active entry, which serialize() already carries
      // wholesale via `{ ...rest }` — durable with NO save-schema change and no new top-level key.
      // Conditional spread on the same precedent as `clauses` above: every non-heist instance gains
      // no key at all, which is what keeps the golden `--reload-at 600` comparison byte-identical.
      ...(offer.type === PQ019C_HEIST_TYPE || offer.type === BREAKAWAY_RECOVERY_TYPE
        ? {
          heist: createHeistRecord({
            missionId: id,
            tick: state.tick | 0,
            attempt: offer.heistAttempt | 0,
            launchWindowS: offer.params && offer.params.launchWindowS,
            runWindowTicks: offer.params && offer.params.runWindowTicks,
            unlaunchedWindowTicks: offer.params && offer.params.unlaunchedWindowTicks,
            recoveryAllowed: offer.params && offer.params.recoveryEnabled,
            // BREAKAWAY: the launch variant is authored on the offer; absent for the capsule run.
            variantId: offer.params && offer.params.heistVariantId,
          }),
        }
        : {}),
      // SF-143 — the yard watch's durable subrecord. Same conditional-spread precedent as `heist`:
      // serialized wholesale inside the active entry; non-watch instances stay byte-identical.
      ...(offer.type === COUNTERWEIGHT_WATCH_TYPE
        ? {
          counterweight: createCounterweightRecord({
            missionId: id,
            tick: state.tick | 0,
            windowTicks: offer.params && offer.params.windowTicks,
            legsRequired: offer.params && offer.params.legsRequired,
            cratesTotal: offer.params && offer.params.cratesTotal,
            rewardPerLegCr: offer.params && offer.params.rewardPerLegCr,
            completionBonusCr: offer.params && offer.params.completionBonusCr,
          }),
        }
        : {}),
      ...(setPieceCauseOf(offer)
        ? { upfrontCostCr: setPieceUpfrontCost(offer, this.state) } : {}),
      sourceOfferId: offer.id || null,
      giverId: offer.giverId || null,
      clientId: offer.clientId || offer.giverId || null,
      cause: offer.cause ? JSON.parse(JSON.stringify(offer.cause)) : null,
      chainNextSeed: (
        offer.campaign47aBeat != null
        || (typeof offer.storyTag === 'string' && offer.storyTag.startsWith('campaign47a:'))
        || !!(offer.params && offer.params.racingContractId)
      )
        ? null
        : (offer.source !== 'coldburnBid' && offer.source !== 'captainStandingOrder' && offer.source !== SET_PIECE_MISSION_SOURCE && def && def.chainable)
          ? this._chainSeed(offer) : null,
    };
  },

  _objectiveTarget(typeId, params) {
    switch (typeId) {
      case 'bulk_trade': return params.qty;
      case BULK_HAUL_TYPE: return params.massU || 1;
      case 'mining_quota': return params.qty;
      case 'patrol_clear': return params.clearCount;
      case 'bounty_hunt':
        // Ghost-convoy lane bounties pay per nest hull: the authored pack clears as a set, and the
        // spawn quota below sizes itself from this same number. Ordinary bounties stay single-mark.
        return (params && params.ghostConvoy)
          ? Math.max(1, Math.min(4, Math.round(Number(params.clearCount) || 1)))
          : 1;
      case 'recon_scan': return params.originSurveySample
        ? Math.max(1, params.scanTargets || 1) + Math.max(1, params.sampleQty || 1)
        : params.scanTargets;
      case 'tow_recovery':
      case 'demolition':
      case 'rescue_under_fire':
      case AUTHORED_SET_PIECE_TYPE:
      case CAPITAL_BOSS_TYPE:
        return 1;
      case 'race':
        // Multi-lap authored circuits count every gate of every lap. A board race has no
        // laps field, so its target stays one unit per gate.
        if (params && (params.closedCircuit || Number(params.laps) > 1)) {
          return raceObjectiveUnits(params) + (params.sectionMission ? 1 : 0);
        }
        return Math.max(1, (params && Array.isArray(params.gates) && params.gates.length) || 1)
          + (params && params.sectionMission ? 1 : 0);
      case SPLIT_MANIFEST_TYPE:
        // One unit per net landed — the manifest itself decides when the contract settles.
        return Math.max(1, (params && Array.isArray(params.lots) && params.lots.length) || 2);
      default: return 1; // boolean-at-dest types
    }
  },

  _typeSpawnsTargets(typeId, offer = null, params = null) {
    // WF-08 claim-stake salvage: a board salvage row materializes a contested wreck site
    // on arrival, so it needs the deferred spawn lifecycle like every other placed contract.
    if (typeId === 'salvage_retrieval' && contractClaimSiteOffer(offer)) return true;
    const p = params || (offer && offer.params) || null;
    // PB-MIS-E: the yard scenes materialize their bodies on destination arrival like every
    // other placed contract — deferred spawn lifecycle, sector-exit conservation.
    return typeId === SPLIT_MANIFEST_TYPE || typeId === QUIET_BERTH_TYPE
      || typeId === 'bounty_hunt' || typeId === 'patrol_clear' || typeId === 'escort'
      || typeId === 'race'    // course gates materialize as beacon entities in the course sector
      || PHYSICAL_TYPE_SET.has(typeId)
      || !!(p && p.poiSignalFollowup);
  },

  _chainSeed(offer) {
    return (this.helpers && this.helpers.hash32)
      ? this.helpers.hash32(this.state.meta.seed, offer.id, 'chain')
      : ((this.state.meta.seed ^ 0x9e3779b9) >>> 0);
  },

  /** Player gives up a mission: forfeit collateral, small rep penalty, remove. */
  abandonMission(missionId) {
    const state = this.state;
    const i = state.missions.active.findIndex((m) => m.id === missionId);
    if (i < 0) return false;
    const m = state.missions.active[i];
    // A story-spine contract cannot be walked away from through any path (UI intent, bot, console):
    // the log shows the same sentence in place of the Abandon word.
    if (isStorySpineContract(m)) {
      this.bus.emit('toast', { text: STORY_SPINE_KEEP_TEXT, kind: 'info', ttl: 3 });
      return false;
    }
    // PQ-019C: a capsule run is never settled behind the arbiter's back. `_failMission` here would
    // remove the mission with ZERO terminal receipts, breaking `terminalReceiptCount == 1` — so
    // abandonment becomes one more candidate in the arbiter's own vocabulary, competing with any
    // physical fact already reported. If the capsule was destroyed a tick earlier, that outranks
    // the walk-away and the run settles as destroyed, which is the truth.
    if (m.heist && !m.heist.settled) {
      const ctx = this._heistCtx();
      heistMissionRuntime.onAbandoned(ctx, m.heist);
      // Decide at tick + 1: the arbiter never decides in the tick a report arrived. The explicit
      // decision tick matters because `update()` is frozen while docked, and the Mission Log's
      // abandon button is a docked surface.
      this._driveHeist(m, i, { decisionTick: (state.tick | 0) + 1 });
      return true;
    }
    // SF-143: abandoning the watch settles honestly at once — the yard pays for the crates the pad
    // already logged and nothing else, then releases the scene for the next work order.
    if (m.counterweight && !m.counterweight.settled) {
      const ctx = this._heistCtx();
      const record = m.counterweight;
      counterweightRuntime.abandon(ctx, record, (settlement, reason) => {
        if (settlement === 'complete') {
          m.reward_cr = Math.max(0, Math.round(Number(record.payoutCr) || 0));
          this._completeMission(m, i);
        } else {
          this._failMission(m, i, reason || 'abandoned');
        }
        return record.settledOutcome;
      });
      return true;
    }
    this._failMission(m, i, 'abandoned');
    return true;
  },

  _refreshTrackedMissionNav(mission = null) {
    // Direct callers (trackMission, objective progress) must not clobber the staged opening marker.
    // Use active-teaching (not the broader pre-init _tutorialOwnsOpening) so headless harnesses
    // without an onboarding subtree still get normal mission nav ownership.
    if (this._onboardingOwnsOpeningNav()) return;
    const trackedId = this.state.ui && this.state.ui.trackedMissionId;
    if (!trackedId) return;
    const m = mission || (this.state.missions.active || []).find((x) => x.id === trackedId && x.status === 'active');
    if (!m || m.id !== trackedId || m.status !== 'active') return;
    const waypoint = this._missionWaypoint(m);
    if (waypoint) this._setNavWaypoint(waypoint);
  },

  _refreshNavigation(options = {}) {
    // A Crucible boot is a full Helios new game, so the starter contract
    // ("Recover the 47-A sample") auto-tracks and the corridor fallback then
    // paints "Dock at Helios Station". Park both while the match is on screen.
    // The mission stays active for the campaign; it is only off the live list.
    if (this._releaseCampaignNavForSwarm(this.state)) return false;
    // Staged first-session rail owns the opening marker while it is actively teaching.
    // Mission/story nav resumes on tutorial:finished (active clears; release refreshes).
    if (this._onboardingOwnsOpeningNav()) {
      // Drop any mission-kind claim that slipped in before onboarding became active so the
      // public route never shows an unowned / competing opening marker.
      const nav = this.state && this.state.nav;
      const wp = nav && nav.waypoint;
      if (wp && wp.kind === 'mission' && !wp.onboarding) {
        nav.waypoint = null;
        this.bus.emit('nav:waypoint', null);
      }
      return false;
    }
    const state = this.state;
    const mission = this._trackedOrFirstActiveMission();
    if (mission) {
      state.ui = state.ui || {};
      const changed = state.ui.trackedMissionId !== mission.id;
      state.ui.trackedMissionId = mission.id;
      this._refreshTrackedMissionNav(mission);
      if (changed && !options.silent) this.bus.emit('mission:updated', { missionId: mission.id, tracked: true });
      return true;
    }
    if (state.ui) state.ui.trackedMissionId = null;
    // G05: pre-first-dock corridor idle owns one clear Dock-at-Helios command with marker machinery.
    // NEVER overwrite an existing trade/story/onboarding waypoint or an explicit story refresh —
    // install corridor only when state.nav.waypoint is absent and story has not claimed precedence
    // (buildCorridorOpeningWaypoint still gates first-dock / tracked mission).
    const existingWp = state.nav && state.nav.waypoint;
    if (!existingWp && !(options.forceStory || options.force)) {
      const corridorWp = buildCorridorOpeningWaypoint(state);
      if (corridorWp) {
        this._setNavWaypoint(corridorWp);
        return true;
      }
    }
    return this._ensureStoryWaypoint(options);
  },

  _releaseStoryNavigationAfterTutorial() {
    if (!this.state || !this.state.story) return;
    this._refreshNavigation({ forceStory: true, silent: true });
  },

  _restoreNavigationAfterLoad() {
    const sectorId = this.state.world && this.state.world.currentSectorId;
    if (sectorId) this.spawnTargetsForSector(sectorId);
    const nav = this.state.nav;
    const existing = nav && nav.waypoint;
    if (this._trackedOrFirstActiveMission()) {
      if (existing && existing.kind === 'local') this._retireRestoredLocalCourse();
      this._refreshNavigation({ silent: true });
      return;
    }
    if (existing && existing.kind === 'trade') {
      this._setNavWaypoint(existing);
      return;
    }
    if (existing && existing.kind === 'local') {
      const pos = existing.pos;
      if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)
          && (!existing.sectorId || existing.sectorId === sectorId)) {
        // An explicit local fix outranks idle story guidance, just as a saved trade course
        // does. Save already restored its coordinates and durable identity. Do NOT call
        // _setNavWaypoint here: its capture-at-write seam could stamp a recycled occupant
        // of a saved transient handle. Unproven binds fall back to the recorded fix instead.
        for (const target of [existing, nav.autopilot]) {
          if (!target || target.stable) continue;
          if (target === existing) delete target.targetEntityId;
          else target.targetEntityId = null;
          delete target.presentationEntityId;
        }
        return;
      }
      this._retireRestoredLocalCourse('invalid');
    }
    this._refreshNavigation({ forceStory: true, silent: true });
  },

  _retireRestoredLocalCourse(reason = 'superseded') {
    const nav = this.state.nav;
    this._setNavWaypoint(null);
    // A rejected/superseded local marker must not leave its old burn armed behind the
    // newly restored mission/story marker. Clear the bind and fix together.
    if (nav.autopilot) {
      nav.autopilot = {
        active: false, target: null, targetEntityId: null,
        label: '', arrivalRadius: 36, status: 'idle',
      };
      this.bus.emit('nav:autopilot', nav.autopilot);
    }
    if (reason === 'invalid') this.bus.emit('toast', {
      text: 'Saved local course could not be restored — plot a new course.', kind: 'warn', ttl: 6,
    });
  },

  _trackedOrFirstActiveMission() {
    const state = this.state;
    const active = (state.missions && state.missions.active || []).filter((m) => m && m.status === 'active');
    if (!active.length) return null;
    const trackedId = state.ui && state.ui.trackedMissionId;
    if (trackedId) {
      const tracked = active.find((m) => m.id === trackedId);
      if (tracked) return tracked;
    }
    return active[0];
  },

  _setNavWaypoint(waypoint) {
    this.state.nav = this.state.nav || {};
    // Stamp the durable bind at the single write seam: every mission waypoint literal above
    // carries a bare targetEntityId, and a recycled slot would redirect throw aim, tether
    // acquisition, and chart commits onto the new occupant. Writers that already stamped
    // their bind keep it.
    if (waypoint && waypoint.targetEntityId != null && !waypoint.stable) {
      const entity = liveEntityById(this.state, waypoint.targetEntityId);
      const stable = entity ? captureEntitySelection(entity) : null;
      if (stable) waypoint = { ...waypoint, stable };
    }
    const same = sameNavWaypoint(this.state.nav.waypoint, waypoint);
    if (!same) {
      this.state.nav.waypoint = waypoint || null;
      this.bus.emit('nav:waypoint', waypoint || null);
    }
    this._syncWaypointRoute(waypoint);
  },

  _syncWaypointRoute(waypoint) {
    if (!waypoint || !waypoint.sectorId) return;
    const state = this.state;
    const currentSectorId = state.world && state.world.currentSectorId;
    if (!currentSectorId || currentSectorId === waypoint.sectorId) return;
    const route = state.nav && state.nav.route;
    const legs = route && Array.isArray(route.legs) ? route.legs : [];
    const first = legs[0];
    const last = legs[legs.length - 1];
    if (first && last && first.from === currentSectorId && last.to === waypoint.sectorId) return;
    const key = `${currentSectorId}->${waypoint.sectorId}`;
    const now = deferredEnterNow(state) || 0;
    if (this._lastWaypointRouteKey === key && now - (this._lastWaypointRouteAt || 0) < 3) return;
    this._lastWaypointRouteKey = key;
    this._lastWaypointRouteAt = now;
    this.bus.emit('ui:setCourse', {
      sectorId: waypoint.sectorId,
      missionId: waypoint.missionId || null,
      waypointKind: waypoint.kind || null,
    });
  },

  _clearMissionNav(missionId) {
    const state = this.state;
    if (state.ui && state.ui.trackedMissionId === missionId) state.ui.trackedMissionId = null;
    if (state.nav && state.nav.waypoint && state.nav.waypoint.missionId === missionId) {
      state.nav.waypoint = null;
      this.bus.emit('nav:waypoint', null);
    }
  },

  _missionWaypoint(m) {
    if (!m || m.status !== 'active') return null;
    const sector = SECTOR_BY_ID.get(m.destSectorId);
    const station = STATION_INFO.get(m.destStationId);
    const title = m.title || 'Mission';
    const destination = station && station.name || sector && sector.name || title;
    const base = {
      kind: 'mission',
      missionId: m.id,
      missionType: m.type,
      label: destination,
      missionTitle: title,
      reason: missionNavReason(m, station, sector),
      stationId: m.destStationId || null,
      sectorId: m.destSectorId || null,
      sectorName: sector && sector.name || null,
    };

    if(m.source==='blackFlag'){
      const v=this.state.player?.shipjack?.vesselsById[m.params?.vesselId];
      const body=v&&this.state.entities.get(v.location?.entityId);
      if(v&&v.custodian!=='player')return {...base,stationId:null,sectorId:v.location.sectorId,label:v.name,targetEntityId:body?.id ?? null,pos:body?.pos?{x:body.pos.x,z:body.pos.z}:sectorLocalToGlobalForSector(v.location.pos,v.location.sectorId),reason:m.brief};
      return {...base,reason:'Deliver the living frame to the claimant’s receiving berth; release it through Registry & recovery.'};
    }

    if (m.storyTag === CONTRACT_47A_B0_TAG && !(m.params && m.params.sampleRecovered)) {
      const source = this._resolveContract47aSampleSource(m);
      if (source) {
        return {
          ...base,
          label: '47-A Recovery Site',
          stationId: null,
          sectorId: this.state.world && this.state.world.currentSectorId || m.destSectorId,
          pos: { x: source.pos.x, z: source.pos.z },
        };
      }
      return { ...base, label: '47-A Recovery Site', stationId: null };
    }

    if (m.storyTag === CONTRACT_47A_B1_TAG && m.params && m.params.cargoRecoveryNeeded) {
      const origin = this._liveStation(m.stationId);
      const originInfo = STATION_INFO.get(m.stationId);
      return {
        ...base,
        label: originInfo && originInfo.name || 'Helios Station',
        stationId: m.stationId,
        sectorId: originInfo && originInfo.sectorId || 'sector_helios_prime',
        sectorName: originInfo && SECTOR_BY_ID.get(originInfo.sectorId)?.name || 'Helios Prime',
        pos: origin && origin.pos ? { x: origin.pos.x, z: origin.pos.z } : null,
      };
    }

    if (m.storyTag === CONTRACT_47A_B2_TAG && m.type === 'bounty_hunt') {
      const target = this._firstLiveMissionTarget(m);
      const identified = m.params && m.params.investigationStage === 'identified';
      if (target) {
        return {
          ...base,
          label: identified ? 'Elroy' : '47-A Signal',
          targetEntityId: target.id,
          pos: { x: target.pos.x, z: target.pos.z },
          reason: missionNavReason(m, station, sector),
        };
      }
      return base;
    }

    // PQ-019C — the capsule run's marker is an OWNERSHIP cue, read off the run's own record rather
    // than a script step. Before the launch it points at the launcher (where and when the throw
    // happens); in flight it points at the capsule itself (the thing to meet); once the capsule is
    // in tow it points at the fence, because that is the only place it can be sold. Each state
    // carries its own words, so the marker says what to do without depending on colour.
    // BREAKAWAY — The Third Shift. Before release the marker is the launcher; once released it is the
    // drifting assembly itself; once the assembly is on the player's line it is the fork mouth, with
    // the fork's one rule in words, because the open end is the only place the load can be delivered.
    if (m.type === BREAKAWAY_RECOVERY_TYPE && m.heist) {
      const h = m.heist;
      const heistBase = { ...base, stationId: null, sectorId: PQ019C_HEIST_SECTOR_ID };
      const load = h.capsuleEntityId != null && this.state.entities
        ? this.state.entities.get(h.capsuleEntityId) : null;
      const liveLoad = load && load.alive !== false && load.pos ? load : null;
      if (liveLoad && h.possessed) {
        const mouth = projectBreakawayForkMouth();
        return {
          ...heistBase,
          label: `${PQ019_FACILITIES.lawful_catcher.name} fork`,
          pos: sectorLocalToGlobalForSector({ x: mouth.x, z: mouth.z }, PQ019C_HEIST_SECTOR_ID),
          reason: 'Bring the assembly through the open end of the fork under 100 WU/s',
        };
      }
      if (liveLoad) {
        return {
          ...heistBase,
          label: 'SP-07 Assembly',
          pos: { x: liveLoad.pos.x, z: liveLoad.pos.z },
          // UI-only live position, exactly as the capsule marker: never a control/throw target.
          presentationEntityId: liveLoad.id,
          reason: 'Recover the drifting SP-07 assembly',
        };
      }
      const launcher = PQ019_FACILITIES.heist_launcher;
      return {
        ...heistBase,
        label: launcher.name,
        pos: sectorLocalToGlobalForSector(
          projectPq019FacilitySocket(launcher), PQ019C_HEIST_SECTOR_ID,
        ),
        reason: `Hold station off ${launcher.name} for the release`,
      };
    }

    // SF-143 — The Counterweight. Before the first crate crosses, the marker is the cradle the
    // player must hold a mass on; once the tug is delivering, it is the receiver pad — the two
    // physical facts the watch is actually about, each named in words.
    if (m.type === COUNTERWEIGHT_WATCH_TYPE && m.counterweight) {
      const record = m.counterweight;
      const cwBase = { ...base, stationId: null, sectorId: PQ019C_HEIST_SECTOR_ID };
      const delivering = (record.legsDone | 0) > 0;
      const anchor = delivering ? COUNTERWEIGHT_SCENE.receiverPad.pos : COUNTERWEIGHT_SCENE.cradle.pos;
      return {
        ...cwBase,
        label: delivering ? 'Transfer Receiver Pad' : COUNTERWEIGHT_SCENE.name,
        pos: sectorLocalToGlobalForSector(anchor, PQ019C_HEIST_SECTOR_ID),
        reason: delivering
          ? 'The tug walks the crates while the cradle holds — cover the carry'
          : 'Settle a heavy body on the yard cradle to hold the gate open',
      };
    }

    if (m.type === PQ019C_HEIST_TYPE && m.heist) {
      const h = m.heist;
      const capsule = h.capsuleEntityId != null && this.state.entities
        ? this.state.entities.get(h.capsuleEntityId) : null;
      const heistBase = { ...base, stationId: null, sectorId: PQ019C_HEIST_SECTOR_ID };
      if (h.possessed) {
        const fence = PQ019_FACILITIES.fence_receiver;
        return {
          ...heistBase,
          label: fence.name,
          // The authored DOCK-APPROACH SOCKET, not the facility's centre: that is where the physical
          // custody head actually sits (heistFacilities._spawnFacilityHead projects the same socket),
          // so the marker points at the thing the capsule has to touch rather than a few WU off it.
          pos: sectorLocalToGlobalForSector(
            projectPq019FacilitySocket(fence), PQ019C_HEIST_SECTOR_ID,
          ),
          reason: `Deliver the capsule to ${fence.name}`,
        };
      }
      if (capsule && capsule.alive !== false && capsule.pos) {
        return {
          ...heistBase,
          label: 'Cargo Capsule',
          pos: { x: capsule.pos.x, z: capsule.pos.z },
          // UI-only live position. `targetEntityId` would also grant control/throw owners this body,
          // which is outside the mission marker contract and would become an unrequested assist.
          presentationEntityId: capsule.id,
          reason: 'Intercept the capsule before the Concord catcher takes it',
        };
      }
      const launcher = PQ019_FACILITIES.heist_launcher;
      return {
        ...heistBase,
        label: launcher.name,
        pos: sectorLocalToGlobalForSector(
          projectPq019FacilitySocket(launcher), PQ019C_HEIST_SECTOR_ID,
        ),
        reason: `Hold station off ${launcher.name} for the launch`,
      };
    }

    if (m.type === 'recon_scan' && m.params && m.params.landmarkProbe) {
      const probe = m.params.landmarkProbe;
      const target = this._livePoiEntity(probe.sectorId, probe.poiId);
      const fallback = probe.targetLocalPos
        ? sectorLocalToGlobalForSector(probe.targetLocalPos, probe.sectorId)
        : null;
      return {
        ...base,
        label: probe.poiLabel || 'The Caved Shaft',
        stationId: null,
        sectorId: probe.sectorId,
        pos: target && target.pos
          ? { x: target.pos.x, z: target.pos.z }
          : fallback && { x: fallback.x, z: fallback.z },
        presentationEntityId: target && target.id || null,
        reason: missionNavReason(m, station, sector),
      };
    }

    // FB-066 — the race marker is the NEXT uncleared gate, the same ownership cue every other
    // waypoint follows: it points at the thing you have to fly through, not the whole course.
    if (m.type === 'race') {
      const params = m.params || {};
      if (params.sectionMission) {
        if (params.phase === 'approach' || params.phase === 'grid') {
          const line = startLineFor(params);
          return {
            ...base,
            label: `${params.courseName || 'Race'} start line`,
            stationId: null,
            sectorId: params.courseSectorId || m.destSectorId,
            pos: line ? { x: line.x, z: line.z } : null,
            reason: params.phase === 'approach'
              ? 'Stop within 70 WU of the start line, slow to 8 WU/s or less, align with the first leg and release any tether'
              : 'Hold on the start line until the green light',
          };
        }
        if (params.phase === 'handoff') {
          return {
            ...base,
            reason: `Dock at ${destination} to settle the course`,
          };
        }
      }
      const gates = Array.isArray(params.gates) ? params.gates : [];
      const next = Math.max(0, Math.min(Math.max(0, gates.length - 1), params.nextGate | 0));
      const gatePos = this._raceGateGlobal(m, next);
      return {
        ...base,
        label: params.courseName || 'Gate course',
        stationId: null,
        sectorId: params.courseSectorId || m.destSectorId,
        pos: gatePos ? { x: gatePos.x, z: gatePos.z } : null,
        reason: gates.length
          ? `Gate ${Math.min((params.nextGate | 0) + 1, gates.length)}/${gates.length} — in order, on the clock`
          : 'Run the course gates in order',
      };
    }

    if (m.type === 'bounty_hunt' || m.type === 'patrol_clear') {
      const target = this._firstLiveMissionTarget(m);
      const markName = m.params && m.params.markName;
      if (target) {
        const ram = starterRamSentence(m.params);
        return {
          ...base,
          targetEntityId: target.id,
          pos: { x: target.pos.x, z: target.pos.z },
          reason: ram || (markName ? `Intercept ${markName}` : 'Intercept the marked hostile'),
        };
      }
      return base;
    }

    if (m.params?.workingBattlefield) {
      return { ...base, stationId: null, sectorId: m.destSectorId, ...workingBattlefieldFocus(this, m) };
    }
    if (PHYSICAL_TYPE_SET.has(m.type)) {
      const target = this._firstLivePhysicalTarget(m);
      if (target) {
        const authored = authoredDefinitionOf(m);
        const reason = authored
          ? (m.brief || authored.brief)
          : m.type === CAPITAL_BOSS_TYPE
            ? (m.brief || CAPITAL_BOSS.brief)
            : m.type === 'tow_recovery'
              ? 'Tow the slag core, or sling it into the yard'
              : m.type === 'demolition'
                ? 'Knock the tower down — swing mass, or cut it'
                : 'Pull a pod out, or open a corridor and reel';
        return { ...base, targetEntityId: target.id, pos: { x: target.pos.x, z: target.pos.z }, reason };
      }
      return base;
    }

    if (m.type === 'escort') {
      if (m.params?.cleanCylinder) {
        const charge = this.state.entities.get(m._escorteeId);
        if (charge?.alive) return { ...base, targetEntityId: charge.id,
          pos: { x: charge.pos.x, z: charge.pos.z }, reason: m.params.cleanCylinder.objective || m.brief };
      }
      const targetStation = this._liveStation(m.destStationId);
      if (targetStation) return { ...base, pos: { x: targetStation.pos.x, z: targetStation.pos.z }, reason: 'Escort the convoy to dock' };
      return base;
    }

    if (m.type === 'passenger_transport' && m.params?.quietPassage) {
      const transport = m._transportId != null && this.state.entities ? this.state.entities.get(m._transportId) : null;
      if (transport?.alive) {
        return { ...base, targetEntityId: transport.id, pos: { x: transport.pos.x, z: transport.pos.z }, reason: m.brief };
      }
    }

    // INF-066: a salvage successor's recovery leg marks the wreck it was mutated for. While the
    // hold is short of the full qty the marker sits on the loss site with both legs in words;
    // once recovery is complete it falls through to the generic delivery marker below.
    // INF-068: no marker on an empty position — once the armed core's clock has run out the
    // wreck is gone (burst takes the cargo), and the delivery leg below owns the marker.
    if (m.type === 'salvage_retrieval' && isMutationRecovery(m)) {
      const sectorNow = this.state.world && this.state.world.currentSectorId;
      const routing = mutationWreckRouting(m, sectorNow);
      const target = Math.max(1, m.objectiveTarget || (m.params && m.params.qty) || 1);
      const short = (m.objectiveProgress || 0) < target;
      const armedDueAt = Number(m.params && m.params.convoyWreckDueAt);
      const clockOut = Number.isFinite(armedDueAt) && armedDueAt <= (Number(deferredEnterNow(this.state)) || 0);
      if (short && !clockOut && routing.wreckPos && routing.sectorId && routing.sectorId === sectorNow) {
        const home = (station && station.name) || 'home';
        return {
          ...base,
          stationId: null,
          sectorId: routing.sectorId,
          pos: { x: routing.wreckPos.x, z: routing.wreckPos.z },
          reason: `Recover the convoy wreck, then deliver to ${home}`,
        };
      }
    }

    // WF-08 claim-stake salvage: while the player is in the destination sector the marker
    // follows the contract goods physically — the contested hull first, then the claim
    // hauler if the crew already loaded it out, then the drop pod a dead hauler spilled.
    // Once the goods are unrecoverable the marker falls through to ordinary delivery.
    if (contractClaimSiteMission(m) && !(isShortageGateRepair(m)
      && sellableCargoQuantity(this.state, m.params.cmdtyId) >= m.params.qty)) {
      const sectorNow = this.state.world && this.state.world.currentSectorId;
      if (sectorNow === m.destSectorId) {
        const wreck = this._contractClaimWreck(m);
        const wreckUnits = wreck ? salvagePoolUnits(wreck.data && wreck.data.salvagePool) : 0;
        if (wreck && wreckUnits > 0) {
          return {
            ...base,
            stationId: null,
            sectorId: sectorNow,
            targetEntityId: wreck.id,
            pos: { x: wreck.pos.x, z: wreck.pos.z },
            reason: m.params && m.params.contractClaimWarned
              ? 'Strip the filed hull, or take the goods off the crew'
              : 'Recover the manifest — a claim crew is already on the hull',
          };
        }
        const lead = this._contractClaimLead(m);
        if (lead && this._contractClaimManifestUnits(lead) > 0) {
          return {
            ...base,
            stationId: null,
            sectorId: sectorNow,
            targetEntityId: lead.id,
            pos: { x: lead.pos.x, z: lead.pos.z },
            reason: 'The manifest is aboard the claim hauler — take it back',
          };
        }
        // The hauler went down loaded — the goods spilled as one real takeable pod.
        const pod = this._contractClaimPod(m);
        if (pod) {
          return {
            ...base,
            stationId: null,
            sectorId: sectorNow,
            targetEntityId: pod.id,
            pos: { x: pod.pos.x, z: pod.pos.z },
            reason: 'The hauler is down — the manifest pod is drifting',
          };
        }
        if (wreck) {
          return {
            ...base,
            stationId: null,
            sectorId: sectorNow,
            targetEntityId: wreck.id,
            pos: { x: wreck.pos.x, z: wreck.pos.z },
            reason: 'The hull is stripped — settle up at the dock',
          };
        }
      }
    }

    // PB-MIS-E — the yard scenes' marker rides the next unresolved body: the nearest net still
    // waiting for the pad, or the lighter still off the berth. Everything resolved settles at
    // the sink — the generic delivery marker below already points at the yard's dock.
    if (m.type === SPLIT_MANIFEST_TYPE || m.type === QUIET_BERTH_TYPE) {
      const sectorNow = this.state.world && this.state.world.currentSectorId;
      if (sectorNow === m.destSectorId) {
        const focus = this._yardWorkFocus(m);
        if (focus) {
          return {
            ...base,
            stationId: null,
            sectorId: sectorNow,
            targetEntityId: focus.id,
            pos: { x: focus.pos.x, z: focus.pos.z },
            reason: focus.reason,
          };
        }
      }
    }

    if (m.type === 'mining_quota') {
      const asteroid = this._nearestAsteroid();
      if (asteroid) {
        return { ...base, stationId: null, sectorId: this.state.world && this.state.world.currentSectorId || m.destSectorId, pos: { x: asteroid.pos.x, z: asteroid.pos.z } };
      }
      return { ...base, stationId: null, sectorId: this.state.world && this.state.world.currentSectorId || m.destSectorId };
    }

    if (m.type === BULK_HAUL_TYPE) {
      const chunk = this._nearestBulkChunk();
      if (chunk) {
        return {
          ...base,
          stationId: null,
          sectorId: this.state.world && this.state.world.currentSectorId || m.destSectorId,
          pos: { x: chunk.pos.x, z: chunk.pos.z },
          reason: 'Tether a bulk chunk, then dock at ' + (station && station.name || 'a refinery'),
        };
      }
      const targetStation = this._liveStation(m.destStationId);
      if (targetStation) return { ...base, pos: { x: targetStation.pos.x, z: targetStation.pos.z } };
      return base;
    }

    if (m.params?.wakeHandoff) {
      return { ...base, stationId: null, sectorId: m.destSectorId, ...wakeHandoffFocus(this, m) };
    }

    const targetStation = this._liveStation(m.destStationId);
    if (targetStation) return { ...base, pos: { x: targetStation.pos.x, z: targetStation.pos.z } };
    return base;
  },

  _firstLiveMissionTarget(m) {
    for (const id of m.targetEntityIds || []) {
      const e = this.state.entities.get(id);
      if (e && e.alive !== false && e.pos) return e;
    }
    return null;
  },

  _firstLivePhysicalTarget(m) {
    const authored = authoredDefinitionOf(m);
    const prefer = authored && authored.primaryRole
      ? authored.primaryRole
      : m && m.type === CAPITAL_BOSS_TYPE
        ? PHYSICAL_ROLE.CAPITAL
        : m && m.type === 'tow_recovery'
          ? PHYSICAL_ROLE.SLAG_CORE
          : m && m.type === 'demolition'
            ? PHYSICAL_ROLE.TOWER
            : PHYSICAL_ROLE.POD;
    let fallback = null;
    for (const id of m.targetEntityIds || []) {
      const e = this.state.entities.get(id);
      if (!e || e.alive === false || !e.pos) continue;
      if (physicalRoleOf(e) === prefer) return e;
      if (!fallback) fallback = e;
    }
    return fallback;
  },

  _liveStation(stationId) {
    if (!stationId) return null;
    const index = this.state.entityIndex;
    const byStationId = index && index.byStationId;
    const indexed = byStationId && byStationId.get(stationId);
    if (indexed && indexed.alive !== false && indexed.type === 'station') return indexed;
    if (hasActiveMissionEntityIndex(this.state)) return null;
    return findLivingWorldActorStation(this.state, stationId);
  },

  _livePoiEntity(sectorId, poiId) {
    const active = this.state.world && this.state.world.activeSector;
    if (!active || active.id !== sectorId || !Array.isArray(active.pois)) return null;
    const row = active.pois.find((poi) => poi && poi.poiId === poiId && poi.id != null);
    if (!row || row.id == null) return null;
    const live = this.state.entities && typeof this.state.entities.get === 'function'
      ? this.state.entities.get(row.id)
      : null;
    if (live && live.alive !== false && live.data && live.data.poiId === poiId) return live;
    const dressing = getDressingRow(this.state, row.id);
    if (dressing && dressing.alive !== false && dressing.data && dressing.data.poiId === poiId) return dressing;
    return null;
  },

  _nearestAsteroid() {
    const player = this.state.entities.get(this.state.playerId);
    let best = null;
    let bestD2 = Infinity;
    for (const e of missionIndexedEntities(this.state, 'mineables', 'asteroids')) {
      if (!e || e.alive === false || e.type !== 'asteroid' || !e.pos) continue;
      const dx = e.pos.x - (player && player.pos ? player.pos.x : 0);
      const dz = e.pos.z - (player && player.pos ? player.pos.z : 0);
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { best = e; bestD2 = d2; }
    }
    return best;
  },

  _resolveContract47aSampleSource(m) {
    if (!m || m.storyTag !== CONTRACT_47A_B0_TAG) return null;
    const p = m.params || (m.params = {});
    const saved = p.samplePos;
    let nearest = null;
    let nearestD2 = Infinity;
    for (const entity of missionIndexedEntities(this.state, 'mineables', 'asteroids')) {
      if (!entity || entity.alive === false || entity.type !== 'asteroid' || !entity.pos) continue;
      if (saved) {
        const dx = entity.pos.x - saved.x;
        const dz = entity.pos.z - saved.z;
        if (dx * dx + dz * dz <= 80 * 80) return entity;
      }
      const player = this.state.entities.get(this.state.playerId);
      const dx = entity.pos.x - (player && player.pos ? player.pos.x : 0);
      const dz = entity.pos.z - (player && player.pos ? player.pos.z : 0);
      const d2 = dx * dx + dz * dz;
      if (d2 < nearestD2) { nearestD2 = d2; nearest = entity; }
    }
    if (nearest) p.samplePos = { x: nearest.pos.x, z: nearest.pos.z };
    return nearest;
  },

  _nearestBulkChunk() {
    const player = this.state.entities.get(this.state.playerId);
    let best = null;
    let bestD2 = Infinity;
    for (const e of missionIndexedEntities(this.state, 'mineables', 'asteroids')) {
      if (!e || e.alive === false || e.type !== 'asteroid' || !e.pos || !e.data || !e.data.isChunk) continue;
      const massU = Number(e.data.bulkMassU != null ? e.data.bulkMassU : e.data.yieldU) || 0;
      if (massU <= 20) continue;
      const dx = e.pos.x - (player && player.pos ? player.pos.x : 0);
      const dz = e.pos.z - (player && player.pos ? player.pos.z : 0);
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { best = e; bestD2 = d2; }
    }
    return best;
  },

  _nearestStation() {
    const player = this.state.entities.get(this.state.playerId);
    let best = null;
    let bestD2 = Infinity;
    for (const e of missionIndexedEntities(this.state, 'dockStations', 'stations')) {
      if (!e || e.alive === false || e.type !== 'station' || !e.pos) continue;
      const stationId = e.data && e.data.stationId;
      if (!stationId || !STATION_INFO.get(stationId)) continue;
      const dx = e.pos.x - (player && player.pos ? player.pos.x : 0);
      const dz = e.pos.z - (player && player.pos ? player.pos.z : 0);
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { best = e; bestD2 = d2; }
    }
    return best;
  },

  _storyWaypointForBeat(beat) {
    if (!beat) return null;
    const state = this.state;
    const currentSectorId = state.world && state.world.currentSectorId || null;
    const sector = SECTOR_BY_ID.get(currentSectorId);
    const base = {
      kind: 'story',
      storyBeat: beat.beat,
      label: storyBeatTitle(beat),
      reason: beat.objective || BEAT_HINT[beat.beat] || 'Follow the current story objective.',
      sectorId: currentSectorId,
      sectorName: sector && sector.name || null,
    };
    if (beat.beat === 0) {
      const asteroid = this._nearestAsteroid();
      if (asteroid) return { ...base, label: 'Cold Start: Mine Asteroid', pos: { x: asteroid.pos.x, z: asteroid.pos.z } };
      return base;
    }
    if (beat.beat === 3) {
      const loc = getEmbodiedLocation(3);
      const destId = loc && (loc.destStationId || loc.stationId);
      const info = STATION_INFO.get(destId);
      const destSectorId = loc && loc.destSectorId || (info && info.sectorId) || currentSectorId;
      const station = currentSectorId === destSectorId ? this._liveStation(destId) : null;
      return {
        ...base,
        label: beat.objective || 'Tow the slag core',
        reason: beat.objective || 'Tow the slag core the long way into the yard.',
        stationId: destId || null,
        sectorId: destSectorId,
        sectorName: info && SECTOR_BY_ID.get(info.sectorId)?.name || null,
        pos: station && station.pos ? { x: station.pos.x, z: station.pos.z } : null,
      };
    }
    if (beat.beat === 4) {
      const flags = (state.story && state.story.flags) || {};
      const stake = getPickSideStake(flags.elroy_outcome);
      const authored = embodiedMissionAt(4) || {};
      const loc = authored.location || {};
      // PQ-032.02: the live route posts all three doors — none is "the" stake until the
      // player picks, so point at the clearing administrator's authored desk instead of a
      // flavour branch. Legacy/pinned saves keep their outcome-shaped stake pointer.
      const target = campaign47aRouteKind(state) === 'live'
        ? {
          stationId: loc.stationId || stake.stationId,
          sectorId: loc.sectorId || stake.sectorId,
          label: storyBeatTitle(beat),
          instruction: authored.recovery || stake.instruction,
        }
        : stake;
      const info = STATION_INFO.get(target.stationId);
      const station = currentSectorId === target.sectorId ? this._liveStation(target.stationId) : null;
      return {
        ...base,
        label: target.label,
        reason: target.instruction,
        stationId: target.stationId,
        sectorId: target.sectorId,
        sectorName: info && SECTOR_BY_ID.get(info.sectorId)?.name || null,
        pos: station && station.pos ? { x: station.pos.x, z: station.pos.z } : null,
      };
    }
    if (beat.beat === 5 && state.story && state.story.branch) {
      const branch = state.story.branch;
      const route = getEmbodiedLocation(5, branch);
      const count = BRANCH_CHAIN_COUNT[branch] || 1;
      const step = Math.min(count, Math.max(1, (state.story.chainProgress | 0) + 1));
      const info = route && STATION_INFO.get(route.stationId);
      const station = route && currentSectorId === route.sectorId ? this._liveStation(route.stationId) : null;
      return {
        ...base,
        label: `Proving Ground ${step}/${count}`,
        reason: `Accept and complete ${branch} leg ${step}/${count}`,
        stationId: route && route.stationId || null,
        sectorId: route && route.sectorId || currentSectorId,
        sectorName: info && SECTOR_BY_ID.get(info.sectorId)?.name || null,
        pos: station && station.pos ? { x: station.pos.x, z: station.pos.z } : null,
      };
    }
    if (beat.beat === 6) {
      const program = getEmpireSeedProgram(campaign47aOutcomeKey(state));
      const pending = state.story && state.story.flags && state.story.flags.empire_seed_pending_id;
      const asteroid = this._nearestAsteroid();
      return {
        ...base,
        label: program.label,
        reason: pending
          ? `Assign ${program.templateId.replace(/_/g, ' ')} to the deployed drone`
          : `Deploy a drone, then assign ${program.templateId.replace(/_/g, ' ')}`,
        pos: asteroid && asteroid.pos ? { x: asteroid.pos.x, z: asteroid.pos.z } : null,
      };
    }
    if (beat.beat === 7 && state.story && state.story.flags && !state.story.flags.deep_reach_operation_complete) {
      const flags = state.story.flags;
      const legacy = campaign47aRouteKind(state) === 'legacy';
      const hasSeed = !!flags.empire_seed_asset_id;
      const replacing = !!(flags.deep_reach_asset_lost || flags.empire_seed_pending_id);
      // A legacy save advances on net worth and never posts the toy. Pointing it at a
      // blockade, siege, or tow that is not on the board is a lie.
      if (!legacy && (hasSeed || replacing)) {
        const op = getDeepReachOperation(campaign47aOutcomeKey(state), state.story && state.story.branch);
        const info = STATION_INFO.get(op.stationId);
        const station = currentSectorId === (info && info.sectorId) ? this._liveStation(op.stationId) : null;
        return {
          ...base,
          label: op.label,
          reason: replacing
            ? `Replace and program the lost seed before ${op.label}`
            : op.instruction,
          stationId: op.stationId,
          sectorId: info && info.sectorId || currentSectorId,
          sectorName: info && SECTOR_BY_ID.get(info.sectorId)?.name || null,
          pos: station && station.pos ? { x: station.pos.x, z: station.pos.z } : null,
        };
      }
    }
    const station = this._nearestStation();
    if (station) {
      const stationId = station.data && station.data.stationId || null;
      const info = STATION_INFO.get(stationId);
      return {
        ...base,
        stationId,
        sectorId: info && info.sectorId || currentSectorId,
        sectorName: info && SECTOR_BY_ID.get(info.sectorId) && SECTOR_BY_ID.get(info.sectorId).name || base.sectorName,
        pos: { x: station.pos.x, z: station.pos.z },
      };
    }
    return base;
  },

  _ensureStoryWaypoint(options = {}) {
    const state = this.state;
    const beat = state.story && STORY_BEATS[state.story.beatIndex];
    if (!beat) return false;
    const existing = state.nav && state.nav.waypoint;
    const force = !!(options.forceStory || options.force);
    const allowReplaceTrade = force || !!options.preferStory;
    if (existing && existing.onboarding && !force) return false;
    if (existing && existing.kind === 'mission') return false;
    if (existing && existing.kind === 'trade' && !allowReplaceTrade) return false;
    const waypoint = this._storyWaypointForBeat(beat);
    if (!waypoint) return false;
    this._setNavWaypoint(waypoint);
    return true;
  },


  // =========================================================================================
  // FB-066 — RACE COURSE: an ordered chain of buoy gates on the clock. The offer carries the whole
  // course record in params (sector-local gate chain, posted record, band caps); the per-tick
  // driver scores the player's own flight line and the band prices the payout. Every field the
  // driver writes lives under m.params so a save/load mid-run resumes the same course.
  // =========================================================================================

  /** World-frame position of gate `index` (params.gates are sector-local). Null when absent. */
  _raceGateGlobal(m, index) {
    const params = (m && m.params) || {};
    const gates = Array.isArray(params.gates) ? params.gates : [];
    const gate = gates[index];
    if (!gate || !Number.isFinite(gate.x) || !Number.isFinite(gate.z)) return null;
    const sectorId = params.courseSectorId || m.destSectorId;
    return sectorLocalToGlobalForSector({ x: gate.x, z: gate.z }, sectorId, { x: 0, z: 0 });
  },

  /**
   * The course's physical presence: one non-colliding buoy per gate, spawned through the same
   * mission-target ledger every other contract body uses so Continue/rematerialization adopts
   * instead of doubling. Already-cleared gates are still re-stood — the furniture shows the flown
   * line, and nextGate (not the entity set) owns progress.
   */
  _spawnRaceGateTargets(m) {
    const helpers = this.helpers;
    if (!helpers || !helpers.spawnEntity || !m) return;
    const params = m.params || {};
    const gates = Array.isArray(params.gates) ? params.gates : [];
    if (!gates.length) return;
    const occupied = new Set((m.targetEntityIds || []).map((id) => {
      const entity = this.state.entities.get(id);
      const data = entity && entity.data;
      if (data && data.physicalRole === PHYSICAL_ROLE.GATE
        && data.missionTag != null && String(data.missionTag) === String(m.id)) {
        const slot = Number(data.raceGateIndex);
        if (Number.isInteger(slot) && slot >= 0) return slot;
      }
      return missionTargetSlotOf(entity, m.id);
    }).filter((slot) => slot != null));
    let spawned = 0;
    for (let slot = 0; slot < gates.length; slot++) {
      // A closed circuit reuses the start plane as its finish, not a second overlapping buoy.
      if (params.racingContractId && params.closedCircuit && slot === gates.length - 1) continue;
      if (occupied.has(slot)) continue;
      const gatePos = this._raceGateGlobal(m, slot);
      if (!gatePos) continue;
      const ent = helpers.spawnEntity({
        type: 'beacon',
        team: 2,
        pos: { x: gatePos.x, z: gatePos.z },
        vel: { x: 0, z: 0 },
        rot: 0,
        radius: Math.max(14, (Number(params.gateRadiusWU) || RACE_GATE_RADIUS_WU) * 0.35),
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        collides: false,
        // Gate buoys own their presentation pose and are scored from the authored course plane;
        // they are never Rapier bodies. `collides:false` alone still enters the SG-02 body index.
        physicsBody: false,
        flags: { noInterp: true, missionPinned: true, durable: true },
        data: {
          missionTag: m.id,
          physicalRole: PHYSICAL_ROLE.GATE,
          raceGateIndex: slot,
          gateCount: gates.length,
          courseId: params.courseId || null,
          scanLabel: `${(params.courseName || 'COURSE').toUpperCase()} — GATE ${slot + 1}/${gates.length}`,
          tetherable: false,
        },
      });
      if (!ent) continue;
      this._stampMissionTargetIdentity(ent, m, slot);
      m.targetEntityIds.push(ent.id);
      spawned++;
    }
    if (spawned > 0) this.bus.emit('mission:updated', { missionId: m.id });
  },

  /**
   * Jumping or leaving an authored circuit fails it. Collateral on these offers is zero and they
   * carry no faction, so the ordinary fail path does not debt the wallet or standing.
   * Procedural board races have no racingContractId and are left alone.
   */
  _dnfAuthoredRaces(reason) {
    const active = this.state.missions.active || [];
    for (let i = active.length - 1; i >= 0; i--) {
      const m = active[i];
      if (!m || m.status !== 'active' || m.type !== 'race' || !m.params || !m.params.racingContractId) continue;
      this._failMission(m, i, reason || 'race_left_course');
    }
  },

  _onDockedAuthoredRaces(stationId) {
    const active = this.state.missions.active || [];
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    const player = this.state.entities && this.state.playerId != null
      ? this.state.entities.get(this.state.playerId) : null;
    for (let i = active.length - 1; i >= 0; i--) {
      const m = active[i];
      if (!m || m.status !== 'active' || m.type !== 'race' || !m.params
        || !m.params.racingContractId) continue;
      if (m.deadline_s != null && Number.isFinite(m.deadline_s) && now >= m.deadline_s) {
        this._expireMission(m, i);
        continue;
      }
      if (!player || player.alive === false) {
        this._failMission(m, i, 'race_pilot_lost');
        continue;
      }
      if (!m.params.sectionMission || m.params.phase !== 'handoff'
        || stationId !== m.destStationId) {
        this._failMission(m, i, 'race_left_course');
        continue;
      }
      m.objectiveProgress = m.objectiveTarget;
      this._completeMission(m, i);
    }
  },

  /** Back to the last clean gate. The clock is not restarted. */
  _resetAuthoredRace() {
    const active = this.state.missions.active || [];
    let found = null;
    for (const mission of active) {
      if (mission && mission.status === 'active' && mission.type === 'race'
        && mission.params && mission.params.racingContractId) {
        found = mission;
        break;
      }
    }
    if (!found) return;
    if (found.params.sectionMission
      && found.params.phase !== 'grid' && found.params.phase !== 'chase') {
      this.bus.emit('toast', {
        text: found.params.phase === 'handoff'
          ? 'Course complete. Dock at the destination; recovery is no longer available.'
          : 'Recovery is unavailable before the start grid.',
        kind: 'info',
        ttl: 3,
      });
      return;
    }
    // Same-sector relocation moves only the hull. Keep the attachment and its load intact
    // until the pilot releases it through the Massline owner; never teleport one rope end.
    if (this.state.player?.tether?.active) {
      this.bus.emit('toast', { text: 'Release the Massline before recovering to a gate.', kind: 'info', ttl: 3 });
      return;
    }
    const params = found.params;
    const world = this.registry && this.registry.get && this.registry.get('world');
    if (!world || typeof world.relocatePlayerInSector !== 'function') return;
    let pose = null;
    if ((params.nextGate | 0) <= 0) pose = startLineFor(params);
    else {
      const local = resetPoseLocal(params);
      if (local) {
        const global = sectorLocalToGlobalForSector(
          { x: local.x, z: local.z },
          params.courseSectorId || found.destSectorId,
          { x: 0, z: 0 },
        );
        pose = { x: global.x, z: global.z, heading: local.heading };
      }
    }
    if (!pose) return;
    if (world.relocatePlayerInSector(pose, { reason: 'race_reset' }) === false) return;
    params.planeSample = null;
    params.planeSampleSimS = null;
    params.resetCount = (params.resetCount | 0) + 1;
    params.precisionChain = 0;
    if (params.sectionMission) {
      params.draftTimeS = 0;
      params.drafting = false;
    }
    this.bus.emit('toast', {
      text: 'Recovered at the last cleared gate. Clock continues; this run cannot set a clean best.',
      kind: 'info',
      ttl: 3,
    });
  },

  _restartAuthoredRace() {
    const active = this.state.missions.active || [];
    let found = null;
    for (const mission of active) {
      if (mission && mission.status === 'active' && mission.type === 'race'
        && mission.params && mission.params.racingContractId) {
        found = mission;
        break;
      }
    }
    if (!found) return;
    const params = found.params;
    if (params.raceMode !== 'time-trial') {
      this.bus.emit('toast', { text: 'Restart is for time trials.', kind: 'info', ttl: 3 });
      return;
    }
    if (Number.isFinite(params.raceElapsedS) || (params.sectionMission
      && params.phase !== 'grid' && params.phase !== 'chase')) {
      this.bus.emit('toast', {
        text: params.sectionMission && params.phase === 'handoff'
          ? 'Course complete. Dock at the destination; recovery is no longer available.'
          : 'This run is already finished.',
        kind: 'info',
        ttl: 3,
      });
      return;
    }
    // Same-sector relocation moves only the hull. Keep the attachment and its load intact
    // until the pilot releases it through the Massline owner; never teleport one rope end.
    if (this.state.player?.tether?.active) {
      this.bus.emit('toast', { text: 'Release the Massline before restarting.', kind: 'info', ttl: 3 });
      return;
    }
    const world = this.registry && this.registry.get && this.registry.get('world');
    if (!world || typeof world.relocatePlayerInSector !== 'function') return;
    const pose = startLineFor(params);
    if (!pose) return;
    if (world.relocatePlayerInSector(pose, { reason: 'race_restart' }) === false) return;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    params.nextGate = 0;
    params.lap = 0;
    params.lastLapElapsedS = 0;
    params.raceOpened = false;
    params.orderWarnGate = null;
    params.lapTimesS = [];
    params.planeSample = null;
    params.planeSampleSimS = null;
    params.precisionChain = 0;
    params.draftTimeS = 0;
    params.drafting = false;
    params.resetCount = 0;
    params.raceFitChanged = false;
    params.raceInvalidated = false;
    params.raceElapsedS = null;
    params.raceClean = false;
    params.raceCategory = null;
    if (params.sectionMission) params.phase = 'grid';
    params.gridUntilSimS = now + (Number(params.gridHoldS) || 0);
    params.raceStartSimS = null;
    this._racingOpponents?.stop?.('race_restart');
    this._racingSetPieces?.stop?.('race_restart');
    resetRacingGhostSession(this.state);
    if (this._racingOpponents) this._racingOpponents.update(found);
    if (this._racingSetPieces) this._racingSetPieces.update(found);
    this.bus.emit('toast', {
      text: 'Time trial restarted — clock reset.',
      kind: 'info',
      ttl: 3,
    });
    this.bus.emit('race:restarted', {
      racingContractId: params.racingContractId,
      levelId: params.courseId || null,
      tick: this.state.tick | 0,
    });
  },

  /**
   * Authored circuits: grid hold, plane gates, laps, draft/boost/leash. Reached only when
   * params.racingContractId is set, so an FB-066 bubble race never enters.
   */
  _driveAuthoredRace(m, index, state, dt = 0) {
    const params = m.params || {};
    const gates = Array.isArray(params.gates) ? params.gates : [];
    const player = state.entities && state.playerId != null ? state.entities.get(state.playerId) : null;
    if (!player || !player.pos || player.alive === false) {
      this._failMission(m, index, 'race_pilot_lost');
      return;
    }
    if (gates.length < 2 || (state.world?.currentSectorId && state.world.currentSectorId !== params.courseSectorId)) {
      this._failMission(m, index, 'race_left_course');
      return;
    }
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const sectionMission = params.sectionMission === true;
    let phase = params.phase;
    if (sectionMission && !['approach', 'grid', 'chase', 'handoff'].includes(phase)) {
      this._failMission(m, index, 'race_bad_phase');
      return;
    }
    if (!params.adventureSpeedId) {
      const category = racingLoadoutCategory(state, player);
      if (!params.raceCategory) {
        if (Number.isFinite(params.raceStartSimS)) params.raceFitChanged = true;
        params.raceCategory = category;
      } else if (params.raceCategory !== category) params.raceFitChanged = true;
    }
    if (!Number.isFinite(params.gridUntilSimS)) params.gridUntilSimS = now + (Number(params.gridHoldS) || 0);
    if (!this._racingOpponents) this._racingOpponents = createRacingOpponents({ state, bus: this.bus, helpers: this.helpers || {} });
    this._racingOpponents.update(m);
    this._racingSetPieces ||= createRacingSetPieces({ state, bus: this.bus, helpers: this.helpers || {} });
    this._racingSetPieces.update(m);
    const globals = raceGateGlobals(params);
    if (globals.length !== gates.length) { this._failMission(m, index, 'race_bad_course'); return; }
    if (sectionMission && phase === 'approach') {
      const start = startLineFor(params);
      if (!start) { this._failMission(m, index, 'race_bad_course'); return; }
      const dx = globals[1].x - globals[0].x;
      const dz = globals[1].z - globals[0].z;
      const length = Math.hypot(dx, dz);
      const speed = Math.hypot(Number(player.vel?.x) || 0, Number(player.vel?.z) || 0);
      const aligned = length > 0 && Number.isFinite(player.rot)
        && Math.cos(player.rot) * dx / length + Math.sin(player.rot) * dz / length >= 0.8;
      const nearLine = Math.hypot(player.pos.x - start.x, player.pos.z - start.z) <= 70;
      if (nearLine && speed <= 8 && aligned && !state.player?.tether?.active) {
        params.phase = 'grid';
        params.gridUntilSimS = now + (Number(params.gridHoldS) || 0);
        params.raceStartSimS = null;
        params.planeSample = null;
        params.planeSampleSimS = null;
        params.draftTimeS = 0;
        params.drafting = false;
        this._refreshTrackedMissionNav(m);
        this.bus.emit('mission:updated', { missionId: m.id });
        this.bus.emit('toast', {
          text: `Chase view engaged. Green in ${(Number(params.gridHoldS) || 0).toFixed(1)}s.`,
          kind: 'info',
          ttl: 4,
        });
      }
      return;
    }
    if (sectionMission && phase === 'handoff') return;
    if (sectionMission && phase === 'grid' && !Number.isFinite(params.gridUntilSimS)) {
      params.gridUntilSimS = now + (Number(params.gridHoldS) || 0);
    } else if (!sectionMission && !Number.isFinite(params.gridUntilSimS)) {
      params.gridUntilSimS = now + (Number(params.gridHoldS) || 0);
    }
    if (sectionMission && phase === 'grid' && now >= params.gridUntilSimS) {
      params.phase = 'chase';
      phase = 'chase';
      params.raceStartSimS = params.gridUntilSimS;
      params.planeSample = null;
      params.planeSampleSimS = null;
      this._refreshTrackedMissionNav(m);
      this.bus.emit('mission:updated', { missionId: m.id });
      this.bus.emit('toast', { text: 'Green. The chase is live.', kind: 'success', ttl: 3 });
    }
    const prev = params.planeSample;
    const previousTime = Number.isFinite(params.planeSampleSimS) ? params.planeSampleSimS : now;
    params.planeSample = { x: player.pos.x, z: player.pos.z };
    params.planeSampleSimS = now;
    if (now < params.gridUntilSimS) return;
    // The green-light instant is authoritative, not whichever later tick observes it.
    if (!Number.isFinite(params.raceStartSimS)) {
      if (sectionMission && !Number.isFinite(params.gridUntilSimS)) {
        this._failMission(m, index, 'race_bad_phase');
        return;
      }
      params.raceStartSimS = params.gridUntilSimS;
    }

    const sample = { prev, pos: player.pos, vel: player.vel, gates: globals, previousTime, now };
    let section = { sample, context: null };
    if (params.adventureSpeedId) {
      this._adventureSpeedSetPieces ||= createAdventureSpeedSetPieces({ state, bus: this.bus,
        helpers: this.helpers || {}, registry: this.registry });
      section = this._adventureSpeedSetPieces.prepare(m, sample);
    }
    const events = advanceCircuit(params, section.sample);
    const speedRun = params.adventureSpeedId
      ? stepAdventureSpeed(params, { events, player, simTime: now, state, setPiece: section.context }) : null;
    if (speedRun) {
      Object.assign(params, speedRun.patch);
      if (speedRun.cargoLoss > 0) {
        const removed = this._drawSealedUnits(m, speedRun.cargoLoss);
        // Spoilage releases only this reservation; it is not a successful delivery.
        params.sealedDelivered = Math.max(0, (params.sealedDelivered || 0) - removed);
      }
      if (speedRun.outcome === 'failed') {
        this.bus.emit('toast', { text: params.adventureSpeedHint || 'The speed contract window closed.', kind: 'warn', ttl: 4 });
        this._failMission(m, index, speedRun.reason);
        return;
      }
    }
    let finish = null;
    for (const event of events) {
      const precision = scoreRacingPrecision(m, event, { prev, pos: player.pos, vel: player.vel,
        gates: globals, previousTime, now });
      Object.assign(params, precision.patch);
      if (precision.intent) this.bus.emit('flight:racePrecision', precision.intent);
      const measuredElapsed = params.adventureSpeedId
        ? Math.max(0, event.elapsedS - (params.adventureSpeedState?.startElapsedS || 0)) : event.elapsedS;
      if (event.gateIndex === params.boostGateIndex) params.boostClearedLap = event.lap;
      const expected = Number(params.recordS) * circuitProgress({ ...params, lap: event.lap,
        nextGate: event.gateIndex }, globals[event.gateIndex], globals).fraction;
      params.lastSplitDeltaS = measuredElapsed - expected;
      params.lastSplitElapsedS = measuredElapsed;
      const ghostDelta = raceGhostSplitDelta(getRacingGhostPlayback(state, params), event);
      if (Number.isFinite(ghostDelta)) params.lastGhostDeltaS = ghostDelta;
      if (event.lapCompleted) {
        if (!Array.isArray(params.lapTimesS)) params.lapTimesS = [];
        params.lapTimesS.push(Math.round((params.adventureSpeedId ? measuredElapsed : event.lapTimeS) * 100) / 100);
        // Bounded even on loaded malformed data.
        if (params.lapTimesS.length > 100) params.lapTimesS.shift();
      }
      this.bus.emit('mission:gateCleared', { missionId: m.id, gateCount: gates.length,
        gateIndex: event.gateIndex, elapsedS: measuredElapsed, lap: event.lap,
        splitDeltaS: params.lastSplitDeltaS, ghostDeltaS: ghostDelta, lapCompleted: event.lapCompleted });
      if (event.lapCompleted && !event.finished) this.bus.emit('toast', {
        text: `Lap ${params.lap + 1}/${params.laps} · ${event.lapTimeS.toFixed(2)}s split`, kind: 'info', ttl: 2,
      });
      if (event.finished) finish = event;
    }
    if (events.length) {
      const legs = params.closedCircuit ? gates.length - 1 : gates.length;
      m.objectiveProgress = Math.min(raceObjectiveUnits(params), (params.lap | 0) * legs + params.nextGate);
      this._refreshTrackedMissionNav(m);
      this.bus.emit('mission:updated', { missionId: m.id });
    }
    // Burn rings run after ordered crossings. Proximity alone cannot farm a boost.
    const assist = params.adventureSpeedId && !(params.nextGate > 0)
      ? { patch: {}, impulses: [] }
      : racingAssistIntents({ params, player, simTime: now, gatesGlobal: globals, dt });
    Object.assign(params, assist.patch);
    for (const row of assist.impulses) if (row?.impulse) queuePhysicsImpulse(player, row.impulse);
    if (speedRun) finish = speedRun.outcome === 'complete' ? speedRun.finishedEvent : null;
    if (!finish) { if (!params.adventureSpeedId) observeRacingGhost(params, player, state, { events }); return; }

    const elapsedS = finish.elapsedS;
    if (params.adventureSpeed?.kind === 'thermal' && !this._deliverCargo(m)) {
      this._failMission(m, index, 'speed_payload_lost');
      return;
    }
    const draftRequiredS = Number(params.draftRequiredS);
    if (Number.isFinite(draftRequiredS) && draftRequiredS > 0
      && (Number(params.draftTimeS) || 0) < draftRequiredS) {
      this._failMission(m, index, 'race_wake_incomplete');
      return;
    }
    const band = raceBandForElapsed(elapsedS, params);
    params.raceBand = band;
    params.raceElapsedS = Math.round(elapsedS * 100) / 100;
    params.raceClean = !(params.resetCount > 0) && !params.raceFitChanged;
    this._racingOpponents.finish(m, params.raceElapsedS);
    if (!params.adventureSpeedId) {
      const ghostResult = observeRacingGhost(params, player, state, { events, finish: true });
      params.raceGhostSaved = ghostResult.ok === true;
    }
    m.reward_cr = Math.max(0, Math.round((m.reward_cr || 0) * (RACE_BAND_MULT[band] ?? 1) * (speedRun?.rewardScale ?? 1)));
    if (params.raceClean && !params.adventureSpeedId) {
      try { rememberRaceRecord(globalThis.localStorage, raceRecordKey(params), params.raceElapsedS); }
      catch { /* private-mode storage is optional; the mission result is not */ }
    }
    if (sectionMission) {
      params.phase = 'handoff';
      params.raceLease = false;
      params.drafting = false;
      params.planeSample = null;
      params.planeSampleSimS = null;
      const destination = STATION_INFO.get(m.destStationId)?.name || 'the destination station';
      this._refreshTrackedMissionNav(m);
      this.bus.emit('mission:updated', { missionId: m.id });
      this.bus.emit('toast', {
        text: `Course clear – ${params.raceElapsedS.toFixed(2)}s – ${band.toUpperCase()}. Dock at ${destination} to file.`,
        kind: 'success',
        ttl: 5,
      });
      return;
    }
    this.bus.emit('toast', { text: `${params.adventureSpeedId ? 'Speed contract' : 'Circuit'} complete · ${params.raceElapsedS.toFixed(2)}s · ${band.toUpperCase()}`
      + (params.raceClean ? ' · clean run' : ' · unranked run, no best time'), kind: 'success', ttl: 5 });
    this._completeMission(m, index);
  },

  /**
   * Per-tick scoring while the mission is active. The clock starts on gate 1 and stops on the
   * last gate — the posted record prices the gate-to-gate leg, so every pilot runs the same
   * timed segment regardless of where they were standing when the contract posted. Gates score
   * ONLY in order: standing inside a later buoy early warns once per gate and counts nothing.
   */
  _driveRace(m, index, state, dt = 0) {
    const params = (m && m.params) || {};
    // Authored terminal paths must run before the legacy out-of-sector early return.
    if (params.racingContractId) {
      this._driveAuthoredRace(m, index, state, dt);
      return;
    }
    const gates = Array.isArray(params.gates) ? params.gates : [];
    if (!gates.length) return;
    const courseSectorId = params.courseSectorId || m.destSectorId;
    const current = state.world && state.world.currentSectorId;
    if (courseSectorId && current && current !== courseSectorId) return;
    const player = state.entities && state.playerId != null
      ? state.entities.get(state.playerId) : null;
    if (!player || !player.pos || player.alive === false) return;
    const gateCount = gates.length;
    const next = Math.max(0, Math.min(gateCount, params.nextGate | 0));
    if (next >= gateCount) return;
    const gatePos = this._raceGateGlobal(m, next);
    if (!gatePos) return;
    const reach = Math.max(24, Number(params.gateRadiusWU) || RACE_GATE_RADIUS_WU)
      + Math.max(0, Number(player.radius) || 0);
    const dx = player.pos.x - gatePos.x;
    const dz = player.pos.z - gatePos.z;
    if (dx * dx + dz * dz > reach * reach) {
      // Order matters: inside a LATER gate while an earlier one is still owed says so, once.
      for (let ahead = next + 1; ahead < gateCount; ahead++) {
        const later = this._raceGateGlobal(m, ahead);
        if (!later) continue;
        const lx = player.pos.x - later.x;
        const lz = player.pos.z - later.z;
        if (lx * lx + lz * lz <= reach * reach) {
          if (params.orderWarnGate !== ahead) {
            params.orderWarnGate = ahead;
            this.bus.emit('toast', {
              text: `${m.title}: race gates in order — gate ${next + 1} of ${gateCount} first.`,
              kind: 'warn',
              ttl: 3,
            });
          }
          break;
        }
      }
      return;
    }
    if (!Number.isFinite(params.raceStartSimS)) params.raceStartSimS = state.simTime || 0;
    params.nextGate = next + 1;
    params.orderWarnGate = null;
    m.objectiveProgress = params.nextGate;
    this._refreshTrackedMissionNav(m);
    const elapsedS = Math.max(0, (state.simTime || 0) - params.raceStartSimS);
    this.bus.emit('mission:gateCleared', {
      missionId: m.id,
      gateIndex: next,
      gateCount,
      elapsedS,
    });
    this.bus.emit('mission:updated', { missionId: m.id });
    if (params.nextGate < gateCount) {
      this.bus.emit('toast', { text: `Gate ${params.nextGate}/${gateCount}`, kind: 'info', ttl: 2 });
      return;
    }
    // Finish — the band prices against the posted record riding the contract terms.
    const band = raceBandForElapsed(elapsedS, params);
    const mult = RACE_BAND_MULT[band] != null ? RACE_BAND_MULT[band] : 1;
    params.raceBand = band;
    params.raceElapsedS = Math.round(elapsedS * 100) / 100;
    // reward_cr is the STANDARD-band figure the board advertised; the band scales it once at the
    // flag so the payout, the receipt, and the debrief all agree on the same number.
    m.reward_cr = Math.max(0, Math.round((m.reward_cr || 0) * mult));
    this.bus.emit('toast', {
      text: `Course clear — ${band.toUpperCase()} time ${Math.round(elapsedS)}s vs record ${params.recordS}s.`,
      kind: 'success',
      ttl: 4,
    });
    this._completeMission(m, index);
  },

  /** Dock-at-destination objectives: delivery / passenger / salvage / smuggling / escort. These are
   *  boolean-at-dest (no cargo.delivered event exists; cargo is single-writer so we don't inspect it). */
  _onDockedObjectives(stationId) {
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (m.status !== 'active') continue;
      if (m.params?.wakeHandoff) continue;
      const t = m.type;
      if (m.params && String(m.params.setPieceObjective || '').startsWith('long_read_')) continue;
      if (m.storyTag === CONTRACT_47A_B1_TAG && m.params && m.params.cargoRecoveryNeeded
        && stationId === m.stationId) {
        const need = Math.max(1, m.params.qty || 1);
        const have = Number(this.state.player.cargo.items[m.params.cmdtyId]) || 0;
        const loaded = addCargo(this.state, m.params.cmdtyId, Math.max(0, need - have));
        if (have + loaded >= need) {
          m.params.cargoRecoveryNeeded = false;
          this._refreshTrackedMissionNav(m);
          this.bus.emit('mission:updated', { missionId: m.id, recovery: false });
          this._sayStoryLine('Replacement sealed. Deliver it to Tycho.', 4);
        } else {
          this.bus.emit('toast', { text: `Free ${need - have - loaded}u cargo for Kessler's replacement`, kind: 'warn', ttl: 4 });
        }
        continue;
      }
      if (m.destStationId !== stationId) continue;

      // A blocking physics term is checked BEFORE any cargo is consumed, so a refused turn-in costs
      // the player nothing but a second approach.
      if (this._refuseTurnInIfBlocked(m)) continue;

      if (t === 'escort') {
        // Player reached the destination — complete only if the convoy survived AND arrived too.
        const ok = this._escorteeArrivedOk(m);
        if (ok) { this._settleEscortConvoyPay(m); this._completeMission(m, i); }
        else this.bus.emit('toast', { text: 'Escort: wait for the convoy to dock', kind: 'warn', ttl: 3 });
        continue;
      }

      if (t === 'tow_recovery' || t === 'rescue_under_fire' || t === AUTHORED_SET_PIECE_TYPE) {
        if (this._tryPhysicalDockComplete(m, i)) continue;
        const authored = authoredDefinitionOf(m);
        this.bus.emit('toast', {
          text: authored
            ? (authored.brief || 'Finish the physical job — two ways through')
            : t === 'tow_recovery'
              ? 'Yard: latch the slag core on your tow line and bring it in'
              : 'Dock with the life pod still on your tow line',
          kind: 'warn',
          ttl: 3,
        });
        continue;
      }

      // Cargo/passenger/salvage/smuggling: require the actual cargo to be aboard, then consume it.
      if (t === 'cargo_delivery' || t === 'passenger_transport'
          || t === 'salvage_retrieval' || t === 'smuggling_run') {
        if (m.source === 'custodyRecovery'
          && !this.registry?.get('custodyConsequences')?.prepareRecoveryDelivery(m)) {
          this._failMission(m, i, 'obligation_already_settled');
          continue;
        }
        // INF-066: a salvage successor that docks short of its full qty settles ONCE for what is
        // actually aboard — proportional pay on its own (halved) stake, goods consumed through
        // the cargo single-writer, mission completed as a partial recovery. Ordinary salvage
        // and every other type keep the legacy all-or-nothing path below.
        if (t === 'salvage_retrieval' && isMutationRecovery(m) && m.params && m.params.cmdtyId) {
          const need = Math.max(1, m.params.qty || 1);
          const have = m.preloadedCargo === true
            ? releasableContractUnits(this.state, m)
            : sellableCargoQuantity(this.state, m.params.cmdtyId);
          if (have > 0 && have < need) {
            const deal = mutationPartialSettlement(have, need, m.reward_cr);
            if (deal && deal.partial) {
              const deliverQty = m.preloadedCargo === true
                ? Math.min(deal.deliverQty, releasableContractUnits(this.state, m))
                : deal.deliverQty;
              const removed = m.preloadedCargo === true
                ? this._drawSealedUnits(m, deliverQty)
                : removeCargo(this.state, m.params.cmdtyId, deliverQty);
              if (removed <= 0) {
                this.bus.emit('toast', {
                  text: `Delivery: you are not carrying ${this._cmdtyName(m.params.cmdtyId)}`,
                  kind: 'warn',
                  ttl: 3,
                });
                continue;
              }
              this.bus.emit('cargo:delivered', {
                commodityId: m.params.cmdtyId, qty: removed,
                missionId: m.id, stationId: m.destStationId,
              });
              const paid = removed === deal.deliverQty
                ? deal
                : (mutationPartialSettlement(removed, need, m.reward_cr) || deal);
              m.reward_cr = paid.payCr;
              m.params.completionMethod = 'partial_recovery';
              this.bus.emit('toast', {
                text: `Partial recovery: ${removed}/${need}u brought home — settled for ${paid.payCr.toLocaleString('en-US')} cr.`,
                kind: 'warn',
                ttl: 4,
              });
              this._completeMission(m, i);
              continue;
            }
          }
        }
        if (!this._deliverCargo(m)) {
          if (m.storyTag === CONTRACT_47A_B0_TAG) {
            m.params.sampleRecovered = false;
            m.objectiveProgress = 0;
            this._resolveContract47aSampleSource(m);
            this._refreshTrackedMissionNav(m);
            this.bus.emit('mission:updated', { missionId: m.id, objectiveProgress: 0 });
            this.bus.emit('toast', { text: '47-A sample missing. Recovery site re-marked.', kind: 'warn', ttl: 4 });
            continue;
          }
          if (m.storyTag === CONTRACT_47A_B1_TAG) {
            m.params.cargoRecoveryNeeded = true;
            this._refreshTrackedMissionNav(m);
            this.bus.emit('mission:updated', { missionId: m.id, recovery: true });
            this.bus.emit('toast', { text: 'Sealed cargo missing. Return to Helios.', kind: 'warn', ttl: 4 });
            continue;
          }
          // NXB-028: a freight contract that arrives short settles the delivered fraction on its
          // recorded terms instead of reporting a binary "not carrying". Sealed-manifest
          // deliveries release only this contract's own remaining units; loose cargo draws only
          // unsealed stock, so ineligible units are never paid as delivered. The mission still
          // terminates once — _completeMission removes it, so reload/retry cannot recollect.
          const partial = t === 'cargo_delivery' ? partialDeliverySettlement(m, this.state) : null;
          if (partial) {
            const removed = partial.tracked
              ? this._drawSealedUnits(m, partial.deliverQty)
              : removeCargo(this.state, m.params.cmdtyId, partial.deliverQty);
            if (removed > 0) {
              const paid = removed === partial.deliverQty
                ? partial
                : {
                  ...partial,
                  deliverQty: removed,
                  shortfallUnits: Math.max(0, partial.needQty - removed),
                  payCr: Math.max(0, Math.round((Number(m.reward_cr) || 0) * removed / partial.needQty)),
                };
              m.reward_cr = paid.payCr;
              m.params.completionMethod = 'partial_delivery';
              m.params.deliveredUnits = removed;
              m.params.shortfallUnits = paid.shortfallUnits;
              this.bus.emit('cargo:delivered', {
                commodityId: m.params.cmdtyId, qty: removed,
                missionId: m.id, stationId: m.destStationId,
              });
              this.bus.emit('toast', {
                text: m.source === 'custodyRecovery'
                  ? `Restitution: ${removed}/${partial.needQty}u returned — ${paid.shortfallUnits}u still owed. The remaining obligation stays open.`
                  : `Short delivery: ${removed}/${partial.needQty}u signed for — ${paid.shortfallUnits}u written off. Paid ${paid.payCr.toLocaleString('en-US')} cr on delivered units.`,
                kind: 'warn',
                ttl: 4,
              });
              this._completeMission(m, i);
              continue;
            }
          }
          const need = m.params && m.params.cmdtyId ? this._cmdtyName(m.params.cmdtyId) : 'the cargo';
          this.bus.emit('toast', { text: `Delivery: you are not carrying ${need}`, kind: 'warn', ttl: 3 });
          continue;
        }
        this._completeMission(m, i);
      }
    }
  },

  /** True if the escortee for mission m is alive and has reached the destination dock. If the
   *  escortee was never spawned (e.g. accepted far away and the player flew straight to dest),
   *  treat arrival as satisfied so the contract can't soft-lock. */
  /** Convoy pay is "paid on arrivals": full fee only when every hull that launched is still
   *  flying. Each lost hauler docks the fee by its share of the convoy — the receipt names the
   *  shortfall so the settlement reads as the yard counting hulls, not a silent haircut. */
  _settleEscortConvoyPay(m) {
    if (!m || m.type !== 'escort' || (m.params && m.params.convoySettled)) return;
    m.params = m.params || {};
    m.params.convoySettled = true;
    if (m.params.cleanCylinder) {
      const c = m.params.cleanCylinder;
      c.outcome = c.phase === 'retreat' ? 'retreated'
        : c.exposure >= CLEAN_CYLINDER.foulAt ? 'contaminated_delivery' : 'clean_delivery';
      const fraction = c.outcome === 'retreated' ? 0.25 : c.outcome === 'contaminated_delivery' ? 0.5 : 1;
      m.reward_cr = Math.round(m.reward_cr * fraction);
      m.params.completionMethod = c.outcome;
      m.params.investigationOutcome = c.outcome;
      const flags = this.state.story.flags || (this.state.story.flags = {});
      flags.m30_clean_cylinder = c.outcome;
      return;
    }
    const total = Math.max(0, Number(m.params.convoyTotal) || 0);
    if (total <= 1) return; // single-hull rows (legacy accepts) have no convoy to short
    let alive = 0;
    for (const id of m.targetEntityIds || []) {
      const e = this.state.entities.get(id);
      if (e && e.alive !== false && e.data && e.data.escortee) alive++;
    }
    if (alive >= total) return;
    const base = Math.max(0, Number(m.reward_cr) || 0);
    m.reward_cr = Math.max(1, Math.round((base * alive) / total));
    m.params.completionMethod = 'convoy_short';
    this.bus.emit('toast', {
      text: `Convoy arrived short (${alive}/${total} hulls) — pay settled at ${Math.round((100 * alive) / total)}%`,
      kind: 'warn',
      ttl: 4,
    });
  },

  _escorteeArrivedOk(m) {
    if (m._escorteeId == null) {
      // A convoy that never spawned cannot have been escorted — the free-pay path is closed.
      // Spawn retries while the player is in the destination sector and the deadline bounds the
      // wait, so this can delay completion but never soft-lock it.
      return false;
    }
    const e = this.state.entities.get(m._escorteeId);
    if (!e || !e.alive) return false;       // dead → _onEntityDestroyed will fail it anyway
    return !!m._escorteeArrived;
  },

  /** Delivery/passenger/cargo: verify the required commodity+qty is in the player hold and consume
   *  it via the cargo removeCargo helper. Passenger missions carry no commodity (cmdtyId null) →
   *  always satisfied (the passenger rides in the ship, not the hold). Returns true if delivered.
   *  A preloaded contract consumes only its own remaining reservation, never another contract's
   *  units and never the player's extra units of the same good. */
  _deliverCargo(m) {
    const p = m.params || {};
    if (!p.cmdtyId) return true; // passenger / abstract cargo — nothing to verify in the hold
    const tracked = m.preloadedCargo === true && (Number(p.qty) > 0 || p.sealAccounted === true);
    if (tracked) this._accountSeal(m);
    const need = tracked
      ? Math.max(0, Math.floor(Number(m.params.sealedRemaining) || 0))
      : Math.max(1, p.qty || 1);
    if (tracked && need <= 0) return Math.floor(Number(m.params.sealedDelivered) || 0) > 0;
    const cargo = this.state.player && this.state.player.cargo;
    const have = (cargo && cargo.items && cargo.items[p.cmdtyId]) || 0;
    if (have < need) return false;
    if (tracked && releasableContractUnits(this.state, m) < need) return false;
    // An ordinary haul may consume only loose goods, just like a market sale. B0 owns its
    // persistent assay sample and unlocks that specific story lot for its authorized turn-in.
    if (!tracked && m.storyTag !== CONTRACT_47A_B0_TAG
      && sellableCargoQuantity(this.state, p.cmdtyId) < need) return false;
    if (m.storyTag === CONTRACT_47A_B0_TAG && Array.isArray(this.state.story && this.state.story.persistentCargo)) {
      this.state.story.persistentCargo = this.state.story.persistentCargo.filter((id) => id !== CONTRACT_47A_SAMPLE_ID);
    }
    // Consume the delivered cargo through the cargo single-writer helper (keeps volume/mass caches sane).
    const removed = tracked
      ? this._drawSealedUnits(m, need)
      : removeCargo(this.state, p.cmdtyId, need);
    if (removed <= 0 && m.storyTag === CONTRACT_47A_B0_TAG) {
      const locked = this.state.story.persistentCargo || (this.state.story.persistentCargo = []);
      if (!locked.includes(CONTRACT_47A_SAMPLE_ID)) locked.push(CONTRACT_47A_SAMPLE_ID);
    }
    this.bus.emit('cargo:delivered', { commodityId: p.cmdtyId, qty: removed, missionId: m.id, stationId: m.destStationId });
    return removed > 0;
  },

  /** Record a known contracted quantity without inventing units already delivered. */
  _accountSeal(m) {
    if (!m || !m.params || m.params.sealAccounted === true) return;
    const qty = Number(m.params.qty);
    if (!(qty > 0)) return;
    m.params.sealedRemaining = Math.floor(qty);
    m.params.sealedDelivered = Math.max(0, Math.floor(Number(m.params.sealedDelivered) || 0));
    m.params.sealAccounted = true;
  },

  /** Remove up to `qty` of this contract's own sealed units. Returns the units actually removed. */
  _drawSealedUnits(m, qty) {
    if (!m || m.preloadedCargo !== true || !m.params || !m.params.cmdtyId) return 0;
    this._accountSeal(m);
    if (m.params.sealAccounted !== true) return 0;
    const want = Math.max(0, Math.floor(Number(qty) || 0));
    const remaining = Math.max(0, Math.floor(Number(m.params.sealedRemaining) || 0));
    const take = Math.min(want, remaining, releasableContractUnits(this.state, m));
    if (take <= 0) return 0;
    const removed = removeCargo(this.state, m.params.cmdtyId, take);
    m.params.sealedRemaining = Math.max(0, remaining - removed);
    m.params.sealedDelivered = Math.max(0, Math.floor(Number(m.params.sealedDelivered) || 0)) + removed;
    return removed;
  },

  /**
   * Turn in part of one sealed load. Refuses an amount this contract does not still reserve,
   * so a repeated confirmation cannot spend the same units twice or a sibling contract's units.
   */
  deliverSealedPortion(missionId, qty) {
    const active = (this.state && this.state.missions && this.state.missions.active) || [];
    const mission = active.find((row) => row && row.id === missionId && row.status === 'active');
    if (!mission || mission.preloadedCargo !== true || !mission.params || !mission.params.cmdtyId) {
      return { ok: false, reason: 'not_sealed', removed: 0 };
    }
    const want = Math.max(0, Math.floor(Number(qty) || 0));
    this._accountSeal(mission);
    if (mission.params.sealAccounted !== true) {
      return { ok: false, reason: 'ambiguous', removed: 0 };
    }
    const remaining = Math.max(0, Math.floor(Number(mission.params.sealedRemaining) || 0));
    if (want <= 0) return { ok: false, reason: 'qty', removed: 0, remaining };
    const cap = releasableContractUnits(this.state, mission);
    if (want > cap) return { ok: false, reason: 'over_reserve', removed: 0, remaining, cap };
    const removed = this._drawSealedUnits(mission, want);
    if (removed > 0 && this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('cargo:delivered', {
        commodityId: mission.params.cmdtyId,
        qty: removed,
        missionId: mission.id,
        stationId: mission.destStationId,
        partial: true,
      });
    }
    return {
      ok: removed === want,
      removed,
      remaining: Math.max(0, Math.floor(Number(mission.params.sealedRemaining) || 0)),
    };
  },

  _cmdtyName(id) { const c = CMDTY_BY_ID.get(id); return c ? c.name : 'cargo'; },

  _stationName(id) {
    const st = id ? STATION_INFO.get(id) : null;
    return st ? st.name : null;
  },

  _destName(m) {
    const station = this._stationName(m && m.destStationId);
    if (station) return station;
    const sector = m && m.destSectorId ? SECTOR_BY_ID.get(m.destSectorId) : null;
    return sector ? sector.name : 'the lane';
  },

  _missionClientName(m) {
    // INF-069: a salvage successor answers in its home station's voice, not the board's.
    if (isMutationRecovery(m)) {
      const home = this._stationName(m && m.destStationId);
      return `${home || 'Contract Board'}${home ? ' Salvage Desk' : ''}`;
    }
    const fac = m && m.factionId ? FACTION_BY_ID.get(m.factionId) : null;
    return fac ? (fac.short || fac.name) + ' Contract' : 'Contract Board';
  },

  _missionSuccessDebriefText(m) {
    if (isShortageGateRepair(m)) {
      const restored = this.state.economyContracts?.shortageRepairs?.[m.cause.shortageEventId];
      if (restored) return restored.text;
    }
    const p = (m && m.params) || {};
    if (p.cleanCylinder) {
      return p.cleanCylinder.outcome === 'retreated'
        ? 'Charge returned with you to the entry refuge. Passage incomplete; the convoy paid the 25% recovery fee.'
        : p.cleanCylinder.outcome === 'contaminated_delivery'
          ? 'Contaminated delivery: the charge arrived fouled. Quarantine accepted it at 50% of the clean fee.'
          : 'Clean delivery: the Shepherd charge reached the berth with its cylinder clean. Full convoy fee paid.';
    }
    const cargo = this._cmdtyName(p.cmdtyId);
    const dest = this._destName(m);
    if (m && m.source === LANDMARK_QUEST_SOURCE && p.landmarkProbe) {
      const artifact = p.landmarkProbe.artifact;
      return p.landmarkProbe.successText
        || `${artifact && artifact.title || 'Return frame'} filed. The probe brought back one image and no telemetry; the shaft remains unexplained.`;
    }
    if (m && m.source === 'poiBehavior' && p.poiSignalFollowup) {
      const cause = m.cause && m.cause.line ? ` The original ${m.cause.line.toLowerCase()}` : '';
      return `Linked signal confirmed in ${dest}. The registry now connects both sites.${cause}`;
    }
    switch (m && m.type) {
      case 'cargo_delivery':
        return p.completionMethod === 'partial_delivery'
          ? `Short manifest signed at ${dest} — ${p.deliveredUnits || 0}u accepted, ${p.shortfallUnits || 0}u written off the bill. The client paid on what arrived.`
          : 'Manifest sealed at ' + dest + '. ' + cargo + ' cleared the dock and the client released payment.';
      case 'bulk_trade':
        return 'The shortage at ' + dest + ' is covered for now. Your sale moved the board and the client noticed.';
      case BULK_HAUL_TYPE:
        return 'Bulk ore received at ' + dest + '. The refinery logged the tether-haul and cleared the contract.';
      case 'mining_quota':
        return 'Quota received. The assay office logged ' + cargo + '; the rest of the rock can stay quiet.';
      case 'salvage_retrieval': {
        // INF-069: the convoy client's answer to the actual outcome — full thanks only when
        // the full manifest changed hands (this branch runs inside settlement, never on intent).
        const voice = convoyClientVoice(m, 'completed', this._stationName(m && m.destStationId));
        if (voice) return voice.text;
        return 'Recovery logged. Useful wreckage became inventory before another crew filed the claim.';
      }
      case 'smuggling_run':
        if (p.wakeHandoff) return 'The crate came aboard in the hauler\'s wake. Drift Market paid for the pass.';
        return 'The cargo disappeared into ' + dest + '\'s books without becoming a customs story.';
      case 'bounty_hunt':
        if (p.requiredModule === 'mod_ram_plate') {
          const who = p.markName || 'the runner';
          return `The plate closed ${who}. The board logged a ram, not a shot.`;
        }
        return 'Tag closed near ' + dest + '. The board will update before the rumor does.';
      case 'escort':
        return 'Convoy arrived at ' + dest + ' intact. That is all the client wanted written down.';
      case 'patrol_clear':
        return 'Lane report is clean. Hostile signatures cleared, trade traffic can pretend it was always safe.';
      case 'recon_scan':
        return 'Scan packet received. The map is now less wrong where it matters.';
      case 'passenger_transport': {
        if (p.quietPassage) {
          return p.quietPassage.spooked
            ? 'Degraded delivery: the transport was spooked by a hot approach. Fee reduced.'
            : 'Clean transit: the transport slipped past the checkpoint quiet. Full fee paid.';
        }
        // A1: the receipt quotes the fare the run made real, not a seat count.
        const pax = p.passenger;
        if (pax && pax.name) {
          const quote = this._passengerBeatLine(m, 'arrive');
          return quote
            ? `${pax.name} stepped off at ${dest}. "${quote}"`
            : `${pax.name} transferred at ${dest}. The fee cleared.`;
        }
        return 'Passenger transferred at ' + dest + '. Their name stays boring on the manifest.';
      }
      case 'tow_recovery':
        return p.completionMethod === 'sling_in'
          ? 'Slag core slung into ' + dest + '. The yard logged the throw, not the dock.'
          : 'Slag core towed into ' + dest + '. The line did the work.';
      case 'demolition':
        return p.completionMethod === 'wrecking_ball'
          ? 'Tower came down to thrown mass near ' + dest + '.'
          : 'Tower cut down near ' + dest + '. Guns were the slow way.';
      case 'rescue_under_fire':
        return p.completionMethod === 'corridor_pull'
          ? 'Corridor opened. Pods reeled out of the field near ' + dest + '.'
          : 'Pod towed out of the field and signed in at ' + dest + '.';
      case AUTHORED_SET_PIECE_TYPE:
        return (m.title || 'Set piece') + ' closed by ' + authoredMethodDebriefPhrase(p.completionMethod || 'physics') + ' near ' + dest + '.';
      case CAPITAL_BOSS_TYPE:
        return p.completionMethod === 'throw_the_capital'
          ? 'Capital came down to thrown mass near ' + dest + '. Guns never had to speak.'
          : 'Capital gunned down near ' + dest + '. Mass would have been faster.';
      default:
        return 'Contract closed. The board released payment and filed the work as routine.';
    }
  },

  _missionLossDebriefText(m, reason) {
    const dest = this._destName(m);
    if (m && m.params && m.params.wakeHandoff && reason === 'wake_missed') {
      return 'The hauler left the lane. The wake closed before the crate changed hands.';
    }
    if (m && m.params && m.params.wakeHandoff && reason === 'wake_unmatched') {
      return 'The crate came aboard off the wake. You were not flying the hauler\'s speed, so Drift Market will not pay.';
    }
    if (m && m.params && m.params.wakeHandoff && reason === 'wake_refused') {
      return 'The hold refused the crate. The pass is blown and Drift Market will not pay.';
    }
    // INF-069: the convoy client's answer to abandonment or expiry — a closed file, no thanks.
    if (isMutationRecovery(m)) {
      const voice = convoyClientVoice(m, 'failed', this._stationName(m && m.destStationId));
      if (voice) return voice.text;
    }
    if (reason === 'target_lost') {
      // The deposit comes back only when one was charged. A writ with no stake
      // must not tell the pilot the money returned.
      const tail = m && m.collateral_cr > 0
        ? 'The contract is void — deposit refunded, no standing lost.'
        : 'The contract is void — no standing lost.';
      return 'The mark was destroyed before you closed in near ' + dest + '. ' + tail;
    }
    if (reason === 'deadline') return 'Deadline missed near ' + dest + '. The board has already marked the lane cold.';
    if (reason === 'abandoned') return 'Contract abandoned. Progress was cleared from the board and the client will remember the gap.';
    if (reason === 'escort_abandoned') return 'Escort contract voided. The convoy was left outside acceptable coverage.';
    return 'Contract failed near ' + dest + '. The board closed the file without payment.';
  },

  _emitMissionDebrief(m, outcome, reason, settlement = {}) {
    if (!m) return;
    if (setPieceCauseOf(m)) return; // SP1 uses the authored house receipt below.
    const success = outcome === 'completed';
    const text = success ? this._missionSuccessDebriefText(m) : this._missionLossDebriefText(m, reason);
    const rewardCr = Math.max(0, Math.round(Number(settlement.rewardCr != null
      ? settlement.rewardCr : (m.reward_cr || 0)) || 0));
    const zeroPayLandmark = isZeroPayLandmarkMission(m, rewardCr);
    this.bus.emit('comms:popup', {
      sender: this._missionClientName(m),
      text,
      category: success ? 'personal' : 'trap',
      ttl: success ? 8 : 7,
      note: success ? (zeroPayLandmark
        ? 'Field record filed; no credits issued.'
        : this._missionPaydayNote(m, rewardCr, settlement)) : null,
    });
  },

  /**
   * RC-467 — the payday line, itemized only for a Clause Gambit contract:
   *   "Paid 1,100 cr — base 1,000 cr + Cargo intact 100 cr. Deposit returned: 150 cr."
   * Every number is read from the settlement `_completeMission` already computed; this helper never
   * pays, multiplies or rounds into a second authority. A plain contract keeps the shipped
   * `Paid X cr.` note byte-for-byte.
   */
  _missionPaydayNote(m, rewardCr, settlement = {}) {
    const paidCr = Math.max(0, Math.round(Number(rewardCr) || 0));
    const plain = `Paid ${paidCr.toLocaleString('en-US')} cr.`;
    const meta = clauseGambitMeta(m);
    const clauseSettlement = settlement && settlement.clauseSettlement;
    if (!meta || !clauseSettlement) return plain;
    const baseCr = Math.max(0, Math.round(Number(clauseSettlement.baseRewardCr) || 0));
    const premiumCr = Math.max(0, paidCr - baseCr);
    const canonical = meta.clauseId ? contractTermById(meta.clauseId) : null;
    const row = Array.isArray(m.clauses)
      ? m.clauses.find((term) => term && term.id === meta.clauseId) : null;
    const label = (row && row.label) || (canonical && canonical.label) || 'Contract term';
    let line = `Paid ${paidCr.toLocaleString('en-US')} cr — base ${baseCr.toLocaleString('en-US')} cr`;
    line += premiumCr > 0
      ? ` + ${label} ${premiumCr.toLocaleString('en-US')} cr.`
      : '.';
    const refundCr = Math.max(0, Math.round(Number(settlement.collateralRefundCr) || 0));
    if (refundCr > 0) line += ` Deposit returned: ${refundCr.toLocaleString('en-US')} cr.`;
    return line;
  },

  _compileSetPieceTransition(mission, outcome, reason = null) {
    if (!setPieceCauseOf(mission)) return null;
    return advanceSetPieceMission(this.state, mission, { outcome, reason });
  },

  /**
   * G2 — the Witness Run / station-contact seam. The run's witnesses ARE Customs bar contacts
   * ("Filecleaver" Dorin, "Wraith" Kell) whose durable counters (`dorin.trust` -1..1,
   * `kell.cover` 0..6, authored initial 0) previously had no emitter anywhere. At the run's
   * TERMINAL settlement the receipt (witness + branch + outcome) becomes canonical
   * `stationContact:counterDelta` intents; stationContacts stays the sole counter writer.
   * Mapping, from the branch semantics:
   *   publish (testimony filed public):  the witness's own record advances — dorin.trust +1 —
   *     and public files burn the copy desk Kell hides behind — kell.cover -1.
   *   shelter (record kept unavailable): the desk stays dark and Kell's handoffs held —
   *     kell.cover +1 — while Dorin watches her massacre proof stay buried — dorin.trust -1.
   *   terminal failure (any branch):    a botched run draws scrutiny to the customs line —
   *     kell.cover -1; it earns nobody's trust.
   * Cover BUILDS from 0 through sheltered runs and erodes through public/burned ones; trust
   * clamps at ±1. Repeated runs keep moving the bounded counters, so a repeat runner watches
   * Kell's cover be built and eaten away inside the same save.
   */
  _witnessRunCounterDeltas(receipt, cause) {
    const witnessId = cause && cause.witnessId || null;
    if (receipt.outcome === 'completed') {
      if (receipt.branchId === 'publish') {
        return witnessId === 'kell'
          ? [{ trackerId: 'kell.cover', delta: -1 }, { trackerId: 'dorin.trust', delta: 1 }]
          : [{ trackerId: 'dorin.trust', delta: 1 }, { trackerId: 'kell.cover', delta: -1 }];
      }
      if (receipt.branchId === 'shelter') {
        return witnessId === 'kell'
          ? [{ trackerId: 'kell.cover', delta: 1 }, { trackerId: 'dorin.trust', delta: -1 }]
          : [{ trackerId: 'dorin.trust', delta: -1 }, { trackerId: 'kell.cover', delta: 1 }];
      }
      return [];
    }
    return [{ trackerId: 'kell.cover', delta: -1 }];
  },

  _emitWitnessRunContactSeam(mission, transition) {
    const cause = setPieceCauseOf(mission);
    if (!cause || cause.archetypeId !== 'witness_run') return false;
    // Only the run's terminal settlement is an outcome: stage advances and single-stage retries
    // are not. advanceSetPieceMission returns status 'completed' for both a finished route and a
    // terminally failed attempt (retry budget spent), each distinguishable by receipt.outcome.
    if (transition.status !== 'completed') return false;
    const receipt = transition.receipt;
    if (!receipt) return false;
    const deltas = this._witnessRunCounterDeltas(receipt, cause);
    if (!deltas.length) return false;
    const reason = `witness_run:${receipt.branchId || 'common'}:${receipt.outcome}`
      + `:witness=${cause.witnessId || 'seeded'}`;
    for (const row of deltas) {
      this.bus.emit('stationContact:counterDelta', {
        trackerId: row.trackerId,
        delta: row.delta,
        reason: reason.slice(0, 96),
      });
    }
    return true;
  },

  _boardSetPieceTransition(mission, transition) {
    if (!transition || !transition.receipt) return false;
    this._emitWitnessRunContactSeam(mission, transition);
    for (const offer of transition.offers || []) this._onExternalBoardOffer(offer);
    const receipt = transition.receipt;
    const fields = setPieceEventFields(mission, transition);
    this.bus.emit('mission:setPieceTransition', {
      missionId: mission.id,
      status: transition.status,
      outcome: receipt.outcome,
      reason: receipt.reason || null,
      offerIds: (transition.offers || []).map((offer) => offer.id),
      ...fields,
    });
    const recoverySuffix = receipt.recoveryText ? ` ${receipt.recoveryText}` : '';
    const nextStationNames = (receipt.nextStationIds || []).map((stationId) => {
      const station = STATION_INFO.get(stationId);
      return station && station.name || stationId;
    });
    this.bus.emit('comms:popup', {
      sender: receipt.house || 'Contract House',
      text: `${receipt.houseText}${recoverySuffix}`.trim(),
      category: receipt.outcome === 'completed' ? 'personal' : 'trap',
      ttl: receipt.recoveryText ? 10 : 8,
      note: nextStationNames.length ? `Follow-up posted: ${nextStationNames.join(', ')}` : null,
    });
    return true;
  },

  // =========================================================================================
  // COMPLETION / FAILURE / EXPIRY (settle)
  // =========================================================================================
  // SF20-05: the course owner supplies the exact physical first finish; missions reserves one
  // reward before synchronous credit/presentation callbacks. Retries never mint a contract.
  settleRedKiteRelay(receiptId) {
    const receipt = this.registry?.get('redKite')?.firstCompletionReceipt?.(receiptId);
    if (!validRedKiteReceipt(receipt)) return { ok: false, reason: 'finish_receipt_invalid' };
    const prior = this.state.missions.redKiteFirstReward;
    if (prior) return { ok: true, duplicate: true, ...prior };
    const economy = this.registry?.get('economy');
    if (!economy || typeof economy.grantCredits !== 'function') return { ok: false, reason: 'credit_owner_pending' };
    const before = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.round(Number(this.state.player.credits) || 0)));
    const journal = { receiptId: receipt.id, courseVersion: RED_KITE.courseVersion,
      creditedCr: Math.min(RED_KITE.firstRewardCr, Number.MAX_SAFE_INTEGER - before), at: this.state.simTime || 0 };
    this.state.missions.redKiteFirstReward = journal;
    this.bus.emit('economy:grantCredits', { amount: RED_KITE.firstRewardCr, reason: 'mission:red-kite:first-completion' });
    this._logCompletion('red_kite_relay', journal.creditedCr, true);
    this.bus.emit('mission:completed', { missionId: 'red-kite:first-completion', type: 'red_kite_relay',
      source: 'redKite', sourceReceiptId: receipt.id, factionId: null, repMult: 0, rewardCr: journal.creditedCr });
    this.bus.emit('toast', { text: `First relay filed — ${journal.creditedCr} cr. Later runs record your time without another payment.`, kind: 'good', ttl: 5 });
    return { ok: true, duplicate: false, ...journal };
  },
  // SF20-04: physical custody supplies the immutable arrived bitmap; this ordinary mission
  // journal reserves its sole reward before any credit callback can recursively file it again.
  settleIlexArk(receiptId) {
    const receipt = this.registry?.get('ilexArk')?.outcomeReceipt?.(receiptId);
    if (!validIlexOutcome(receipt)) return { ok: false, reason: 'outcome_receipt_invalid' };
    const prior = this.state.missions.ilexArkReward;
    if (prior) return { ok: true, duplicate: true, ...prior };
    const economy = this.registry?.get('economy');
    if (!economy || typeof economy.grantCredits !== 'function') return { ok: false, reason: 'credit_owner_pending' };
    const before = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.round(Number(this.state.player.credits) || 0)));
    const journal = { receiptId: receipt.id, deliveredVaultIds: [...receipt.deliveredVaultIds],
      creditedCr: Math.min(receipt.rewardCr, Number.MAX_SAFE_INTEGER - before), at: this.state.simTime || 0 };
    this.state.missions.ilexArkReward = journal;
    economy.grantCredits(receipt.rewardCr, 'mission:ilex-seed-ark');
    this._logCompletion('ilex_seed_ark', journal.creditedCr, receipt.deliveredVaultIds.length > 0);
    this.bus.emit('mission:completed', { missionId: 'ilex:seed-ark:v1', type: 'ilex_seed_ark', source: 'ilexArk',
      sourceReceiptId: receipt.id, factionId: null, repMult: 0, rewardCr: journal.creditedCr,
      deliveredVaultIds: [...receipt.deliveredVaultIds] });
    this.bus.emit('toast', { text: `Seed Ark filed — ${journal.deliveredVaultIds.length}/6 vaults · ${journal.creditedCr} cr.`, kind: 'info', ttl: 5 });
    return { ok: true, duplicate: false, ...journal };
  },
  /**
   * Settle a mission as completed. Exception-safe: the body flips `status` ~150 lines before it
   * removes the row, so a throw in between (a debrief, a receipt, an observer) used to leave a
   * 'completed' ghost in `active` that ate a mission slot and was saved. Whatever happens, a row
   * that left `active` status leaves the list. Credits are granted before the likeliest throw
   * points and the status guard stops a second settlement, so payment stays exactly-once.
   */
  _completeMission(m, index) {
    try {
      this._completeMissionBody(m, index);
    } finally {
      this._dropSettledRow(m, index);
    }
  },

  /** Presentation that follows a settlement (debrief popups). A throw is reported and contained:
   *  the contract is already paid, receipted, cleaned up and announced, and nothing may unwind it. */
  _settleOptional(label, fn) {
    try {
      fn();
    } catch (err) {
      console.error(`[missions] ${label} failed after the contract settled`, err);
    }
  },

  /** Remove a row whose settlement flipped its status, if the body did not get to remove it. */
  _dropSettledRow(m, index) {
    if (m && m.status !== 'active') this._removeActive(m.id, index);
  },

  /** Defensive sweep: a settled row can never legitimately sit in `active` (a ghost saved by a
   *  pre-fix crash, or a throw outside the settle wrappers). */
  _dropSettledGhosts() {
    const active = this.state && this.state.missions && this.state.missions.active;
    if (!Array.isArray(active)) return;
    for (let i = active.length - 1; i >= 0; i--) {
      const row = active[i];
      if (row && row.status !== 'active') this._removeActive(row.id, i);
    }
  },

  _completeMissionBody(m, index) {
    const state = this.state;
    if (m.status !== 'active') return;
    // Single choke point for blocking physics terms. The objective may be met, but the contract is
    // not settled until its physical terms are — and the player is told which one and why. The
    // mission stays active and re-settles the moment the term latches (see _onConditionSatisfied).
    if (this._refuseTurnInIfBlocked(m)) { m._settlePending = true; return; }
    if (m._settlePending) delete m._settlePending;
    const setPieceTransition = this._compileSetPieceTransition(m, 'completed');
    const clauseSettlement = settleContractClauses(m);
    if (m.cause?.reyBid) this.bus.emit('coldburnRey:playerDelivered', { missionId: m.id });
    const settledRewardCr = clauseSettlement.rewardCr + coldburnDeliveryBonus(state, m);
    m.status = 'completed';
    noteStandingOrderCompletion(state, m);
    if (m.params?.workingBattlefield) state.story.flags.workingBattlefieldCompleted = true;
    if (m.params?.adventureSpeedId) {
      const completed = state.missions.adventureSpeedCompleted || (state.missions.adventureSpeedCompleted = {});
      completed[m.params.adventureSpeedId] = true;
    }
    this._clearMissionNav(m.id);
    const displayRewardCr = m.storyTag === CONTRACT_47A_B0_TAG
      ? CONTRACT_47A_REWARD_CR : settledRewardCr;
    if (m.storyTag === CONTRACT_47A_B0_TAG) {
      state.story.flags = state.story.flags || {};
      state.story.flags.contract_47a_b0_delivered = true;
      // Canon: payment withheld / 47-A remains PENDING even when a settlement credit posts for balance.
      state.story.flags.contract_47a_payment_withheld = true;
      state.story.flags.contract_47a_pending = true;
      this.bus.emit('toast', {
        text: 'PAYMENT WITHHELD — CONTRACT 47-A IS STILL PENDING',
        kind: 'warn',
        ttl: 5,
      });
      this.bus.emit('comms:popup', {
        id: 'b0_payment_withheld',
        sender: 'CONCORD ADMIN',
        text: 'CONTRACT 47-A: PAYMENT WITHHELD. STATUS: PENDING. MASS RECONCILED TO LOG.',
        category: 'story',
        ttl: 10,
        persist: true,
      });
      // §34.7 Book 0 — The Pit: the manifest reads zero on the delivered slot, and the
      // airlock says what the office will not. The Skim took exactly the mass it knew.
      this.bus.emit('comms:popup', {
        id: 'b0_manifest_zero',
        sender: 'MANIFEST',
        text: 'SLOT01 TITANIUM ALLOY 00000KG',
        category: 'story',
        ttl: 9,
        persist: true,
      });
      this.bus.emit('comms:popup', {
        id: 'b0_airlock_mass',
        sender: 'AIRLOCK',
        text: 'THEY KNEW THE MASS.',
        category: 'story',
        ttl: 10,
        persist: true,
      });
    }

    // ── clean-clause honor + reward credits + collateral refund ──
    // Clause math happens before any payout, receipt, or active-list removal. Missions emits the
    // honor receipt itself because a post-completion observer can no longer find the instance.
    for (const honored of clauseSettlement.honored) {
      this.bus.emit('contract:clauseHonored', {
        missionId: m.id,
        clauseId: honored.id,
        rewardMult: honored.rewardMult,
        rewardCr: settledRewardCr,
      });
    }
    if (m.params && m.params.starterJobId) {
      const bag = state.missions.starterJobStep || (state.missions.starterJobStep = {});
      const step = Math.max(0, Math.floor(Number(m.params.starterStep) || 0));
      if (step > (bag[m.params.starterJobId] || 0)) bag[m.params.starterJobId] = step;
    }
    if (settledRewardCr > 0) {
      this.bus.emit('economy:grantCredits', { amount: settledRewardCr, reason: `mission:${m.id}` });
    }
    if (m.collateral_cr > 0) {
      this.bus.emit('economy:grantCredits', { amount: m.collateral_cr, reason: `collateral_refund:${m.id}` });
    }
    // RC-MISSION-VOICE: the payday speaks in the payer's voice — a bounty is crossed off the wall,
    // a fence settles fast, a logged yard pays by the book. One receipt line, on the toast lane
    // every other settle fact rides.
    const paydayLine = missionPaydayLine(m, settledRewardCr);
    if (paydayLine) this.bus.emit('toast', { text: paydayLine, kind: 'info', ttl: 6 });

    // ── offering-faction rep: route through mission:completed{repMult} (factions applies 15*repMult).
    // We size repMult so factions' applied rep ≈ the spec's risk-scaled BASE_REP value, plus the
    // featured day's small standing bonus when the accepted offer carried the mark.
    const featuredRep = m.featured ? Math.max(0, Math.floor(Number(m.featured.repBonus) || 0)) : 0;
    const specRep = missionSpecRep(m) + featuredRep;
    const repMult = specRep / 15;
    const storyOutcome = m.params && m.params.investigationOutcome;
    const completedPayload = {
      missionId: m.id,
      type: m.type,
      factionId: m.factionId,
      repMult,
      source: m.source || undefined,
      // Lets emit-side systems (lossLedger's ghost-convoy lane memory) match the settled mission
      // back to the offer that minted it. Undefined for every mission that had no originating offer.
      sourceOfferId: m.sourceOfferId || undefined,
      causeFingerprint: m.cause && m.cause.fingerprint || undefined,
      causeTag: m.cause && m.cause.tag || undefined,
      rewardCr: settledRewardCr,
      ...(m.featured ? { featured: { dayKey: m.featured.dayKey ?? null, repBonus: featuredRep } } : {}),
      ...setPieceEventFields(m, setPieceTransition),
    };
    if (storyOutcome !== undefined) completedPayload.storyOutcome = storyOutcome;
    if (m.params && m.params.completionMethod) {
      completedPayload.completionMethod = m.params.completionMethod;
    }
    if (m.params && m.params.megaHeistId) completedPayload.megaHeistId = m.params.megaHeistId;
    if (m.params && m.params.capitalBossId) completedPayload.capitalBossId = m.params.capitalBossId;
    if (m.params && m.params.victimFactionId) completedPayload.victimFactionId = m.params.victimFactionId;
    if (m.params && m.params.racingContractId) {
      completedPayload.racingContractId = m.params.racingContractId;
      if (m.params.levelId) completedPayload.levelId = m.params.levelId;
      if (Number.isFinite(m.params.raceElapsedS)) completedPayload.raceElapsedS = m.params.raceElapsedS;
      if (m.params.raceBand) completedPayload.raceBand = m.params.raceBand;
      completedPayload.raceClean = m.params.raceClean === true;
      completedPayload.raceResetCount = m.params.resetCount | 0;
      completedPayload.raceLapTimesS = (m.params.lapTimesS || []).slice();
      for (const key of ['raceMode','raceDifficulty','racePosition','raceEntrants','raceCupId',
        'raceCupHeat','raceCupTicket','raceGhostSaved','precisionBest','raceMeetingId']) {
        if (m.params[key] !== undefined) completedPayload[key] = m.params[key];
      }
      completedPayload.raceStandings = (m.params.raceStandings || []).map(row => ({ ...row }));
      this._racingOpponents?.stop('complete');
      this._racingSetPieces?.stop('complete');
    }

    // ── research points at settlement — missions is the sole positive RP writer.
    // Recon and salvage pay here unconditionally (cerebral fieldwork). Bounty and mining-quota
    // contracts pay through the capped RESEARCH_GRANTS rows (research:bounty / research:mining)
    // inside _grantCareerContractResearch, and ONLY once the pilot owns the first node of that
    // path (Combat Basics / Industrial Mining): early auto-RP must never pull a death-recovered
    // pilot into the entry purchase and strand them under gate tolls. Named-ace combat data
    // still pays through claim:trophyHeadGranted; bounty BASE pay stays the cash authority.
    let researchPoints = 0;
    if (m.type === 'recon_scan' || m.type === 'salvage_retrieval') {
      const rp = m.type === 'recon_scan' ? (4 + (m.riskTier || 0) * 2) : (2 + (m.riskTier || 0));
      researchPoints = rp;
      state.player.researchPoints = (state.player.researchPoints || 0) + rp;
      this.bus.emit('research:pointsChanged', {
        researchPoints: state.player.researchPoints,
        source: `mission:${m.type}`,
        granted: rp,
      });
    }
    const contractRp = this._grantCappedResearchContract(m);
    if (contractRp > 0) researchPoints += contractRp;
    const careerRp = this._grantCareerContractResearch(m);
    if (careerRp > 0) researchPoints += careerRp;
    // Honored contract terms pay fieldwork RP — a settlement-time grant, not a researchFirsts
    // entry, because a mission's clauses can honor exactly once when it completes.
    if (clauseSettlement.honored.length) {
      const clauseRp = CLAUSE_HONOR_RP * clauseSettlement.honored.length;
      researchPoints += clauseRp;
      state.player.researchPoints = (state.player.researchPoints || 0) + clauseRp;
      this.bus.emit('research:pointsChanged', {
        researchPoints: state.player.researchPoints,
        source: 'clause_honor',
        granted: clauseRp,
      });
    }

    // ── stats / ledger ──
    if (state.player.stats) state.player.stats.missionsDone = (state.player.stats.missionsDone || 0) + 1;
    this._logCompletion(m.type, displayRewardCr, true);
    this._recordMissionReceipt(m, 'completed', null, {
      rewardCr: displayRewardCr,
      collateralRefundCr: m.collateral_cr || 0,
      repDelta: m.factionId ? specRep : 0,
      researchPoints,
      setPieceReceipt: setPieceTransition && setPieceTransition.receipt || null,
      // Absent entirely on a term-free contract, so the shipped receipt shape is unchanged.
      ...(clauseSettlement.honored.length
        ? { termsHonored: clauseSettlement.honored.map((row) => row.id) } : {}),
      ...(clauseSettlement.breached.length ? { termsBroken: [...clauseSettlement.breached] } : {}),
      ...(clauseSettlement.unmet.length ? { termsUnmet: [...clauseSettlement.unmet] } : {}),
    });

    // Canonical settlement first: rewards, receipt, cleanup, successor, story and the
    // `mission:completed` notification (factions grants completion reputation from it). The
    // debrief popup, toast and celebration cue are presentation and run last, below.
    this._cleanupTargets(m);
    // Keep the settled chain visible while ensureBoard refreshes the destination board. Otherwise
    // a completion that crosses a board epoch can seed a second opening before its next stage lands.
    this._boardSetPieceTransition(m, setPieceTransition);
    this._removeActive(m.id, index);
    this.bus.emit('mission:updated', { missionId: m.id });

    // ── chaining: auto-offer the deterministic next link at the origin board ──
    if (m.chainNextSeed != null) this._tryChain(m);

    // ── story chain progress (B5 branch chains) ──
    // The completion notification is the reward's last leg (reputation rides it), so a throw in a
    // story transition must not swallow it: it fires on the way out either way.
    try {
      this._advanceEmbodiedStoryMission(m);
      this._completeContract47aB4Intro(m);
      this._resolveContract47aB4Doubled(m);
      this._advanceStoryChain(m);
      this._completeContract47aB7Operation(m);
    } finally {
      this.bus.emit('mission:completed', completedPayload);
    }

    // ── optional presentation: may fail without costing the settled contract anything ──
    this._settleOptional('completion debrief', () => this._emitMissionDebrief(m, 'completed', null, {
      rewardCr: displayRewardCr,
      // RC-467: the premium and the deposit are itemized from the settlement already computed
      // above — a gambit contract only, so every other receipt note keeps its shipped shape.
      ...(clauseGambitMeta(m)
        ? {
          clauseSettlement,
          collateralRefundCr: Math.max(0, Math.round(Number(m.collateral_cr) || 0)),
        }
        : {}),
    }));
    const completionText = isZeroPayLandmarkMission(m, displayRewardCr)
      ? `Mission complete: ${m.title} — field record filed; no credits issued.`
      : `Mission complete: ${m.title} +${displayRewardCr} cr${researchPoints > 0 ? ` +${researchPoints} RP` : ''}`;
    this.bus.emit('toast', { text: completionText, kind: 'success', ttl: 4 });
    // GF-4: a bigger celebratory ring + light burst at the player on completion (the triumphant
    // chord + music duck fire from audioSystem's mission:completed subscription). 'branch' lane
    // resolves to a gold echo-ring in vfx._presentationStyle — reads as a resolved/rewarded beat.
    const _cp = this.state.entities && this.state.playerId != null ? this.state.entities.get(this.state.playerId) : null;
    this.bus.emit('presentation:vfxCue', {
      id: 'mission.complete', lane: 'branch', material: 'branch',
      particles: 48, lights: 2, magnitude: 1.4,
      position: _cp ? { x: _cp.pos.x, z: _cp.pos.z } : null,
      targetId: this.state.playerId,
    });
  },

  _removePreloadedContractCargo(mission) {
    if (!mission || !mission.preloadedCargo || !mission.params || !mission.params.cmdtyId) return 0;
    const cap = releasableContractUnits(this.state, mission);
    // Units a defeat already charged to the wreck's recovery loss (see _onPlayerDeathMissions):
    // the recovery berth removes those, so removing them here too would take them twice.
    const absorbed = Math.min(cap, Math.max(0, Math.floor(Number(mission._lossAbsorbedQty) || 0)));
    delete mission._lossAbsorbedQty;
    const take = cap - absorbed;
    const removed = take > 0 ? removeCargo(this.state, mission.params.cmdtyId, take) : 0;
    // The contract is leaving. Zero its claim so a second confirmation cannot release it again.
    if (Number(mission.params.qty) > 0 || mission.params.sealAccounted === true) {
      this._accountSeal(mission);
      mission.params.sealedDelivered = Math.max(0, Math.floor(Number(mission.params.sealedDelivered) || 0))
        + removed + absorbed;
      mission.params.sealedRemaining = 0;
    } else {
      mission.params.sealAccounted = true;
      mission.params.sealedRemaining = 0;
    }
    return removed + absorbed;
  },

  /**
   * PQ-138.04 — failure should usually mutate the situation. Given a failing mission and its
   * reason, build and post the LIVE successor objective through the one authored-offer seam
   * (postAndAcceptAuthoredOffer) while the failing mission is still active. Returns
   * { missionId, offerId, tag, toastText } on success, or null when the failure must run
   * unchanged: no descriptor, no resolvable station, a full mission log, or a refused accept
   * preflight. A refused mutation NEVER leaves the player with no mission and no failure.
   */
  _mutateInsteadOfFail(m, reason) {
    // Custody retains the original bill/field record and can repost its exact remainder.
    if (m.source === 'custodyRecovery') return null;
    const baseDescriptor = missionMutationFor(reason);
    if (!baseDescriptor) return null;
    // A descriptor may type the successor by the job that failed (deadline: a lapsed escort is
    // a still-travelling hull, a lapsed writ is a reposted warrant) — the row's generic shape
    // stays the fallback for every type without an override.
    const descriptor = (baseDescriptor.byType && baseDescriptor.byType[m.type]) || baseDescriptor;
    // Authored failure seams own their own recovery: set-piece chains board a retry offer through
    // _compileSetPieceTransition and the heist owns its recovery lane — a generic successor on top
    // would double-post on the same settlement.
    if (m.heist || m.type === AUTHORED_SET_PIECE_TYPE || setPieceCauseOf(m)) return null;
    // Chain bound: a successor (mutationDepth 1) fails plainly — failure→residue→failure cannot
    // chain. And one failure mints one successor; a second call for the same mission id reuses
    // nothing silently (postAndAcceptAuthoredOffer's storyTag dedupe would report `reused`).
    if ((m.mutationDepth || 0) >= MUTATION_MAX_DEPTH) return null;
    if ((this.state.missions.active || []).some((a) => a && a.mutatedFromMissionId === m.id)) return null;
    // Client-bound: the successor is the client refiling the leg at its own board. A mission that
    // never carried an origin station — hand-placed legs, legacy-save actives, loose jobs — has no
    // client, so it settles plainly instead of inventing a board at its destination. The
    // destination fallback below only rescues a STAMPED origin that no longer resolves.
    if (!m.stationId) return null;
    // The successor's dock reads off the failing contract's own stations — never a fresh pick.
    // A scan bust overrides that with the jurisdiction post that ran the scan (stamped on the
    // contract by _onScannedByPatrol before either the busted or scan-clause settlement).
    const originResolves = !!(m.stationId && STATION_INFO.get(m.stationId));
    const destResolves = !!(m.destStationId && STATION_INFO.get(m.destStationId));
    const bustedStationId = (reason === 'busted' || reason === 'clause_broken:cargo_intact')
      ? (m.params && m.params.bustedStationId) : null;
    const jurisdictionResolves = !!(bustedStationId && STATION_INFO.get(bustedStationId));
    const stationId = jurisdictionResolves ? bustedStationId
      : (originResolves ? m.stationId : (destResolves ? m.destStationId : null));
    if (!stationId) return null;
    // The failing mission is about to leave `active`; refuse quietly only when its departure still
    // cannot free the slot the successor needs (mirrors acceptMission's maxActive gate).
    const cfg = this.state.missions.config || MISSION_TUNING;
    if (((this.state.missions.active || []).length - 1) >= (cfg.maxActive || 8)) return null;
    const offer = this._buildMutationOffer(m, reason, descriptor, stationId, originResolves,
      jurisdictionResolves ? bustedStationId : null);
    if (!offer) return null;
    // Quiet preflight first: a refusal here must not spend the player's error-toast attention on a
    // successor that was never going to post (acceptMission re-runs the same gate loudly).
    if (!this._acceptPreflight(offer).ok) return null;
    const posted = this.postAndAcceptAuthoredOffer(offer, { retiringMissionId: m.id });
    if (!posted || !posted.ok || posted.reused) return null;
    const successor = (this.state.missions.active || []).find((candidate) => (
      candidate && candidate.status === 'active' && candidate.id === posted.missionId
    ));
    if (!successor) return null;
    // Conditional fields ONLY — an unconditional key on every instance would move the 47-A
    // --reload-at golden (same precedent as `clauses`/`heist` in _instanceFromOffer).
    successor.mutatedFromMissionId = m.id;
    successor.mutationTag = descriptor.tag;
    successor.mutationDepth = (m.mutationDepth || 0) + 1;
    // INF-068: a salvage successor materializes its convoy-wreck pocket through the ordinary
    // sector-enter spawn flow — the wreck is a real body to work, not a rumor.
    if (isMutationRecovery(successor)) successor.needsTargets = true;
    if (descriptor.keepTargets) {
      const kept = Array.isArray(m.targetEntityIds) ? m.targetEntityIds.slice() : [];
      successor.targetEntityIds = kept;
      // A resumed escort keeps its live hull now AND re-spawns one on Continue (the escort
      // branch no-ops while a live _escorteeId is bound, so a kept hull is never doubled).
      successor.needsTargets = descriptor.tag === 'resumed' ? true : kept.length === 0;
      if (m._escorteeId != null) successor._escorteeId = m._escorteeId;
      // An already-docked convoy stays arrived — the steer tick re-derives it either way, but the
      // handoff should carry the fact, not relearn it.
      if (m._escorteeArrived) successor._escorteeArrived = true;
      m.targetEntityIds = [];
    }
    const toastFor = typeof descriptor.toast === 'function'
      ? descriptor.toast
      : MUTATION_TOAST[descriptor.tag];
    const toastText = toastFor
      ? toastFor(successor.title, m)
      : `Contract broken — a follow-up is live: ${successor.title}.`;
    return { missionId: successor.id, offerId: posted.offerId, tag: descriptor.tag, toastText };
  },

  /**
   * Build the successor offer for one mutation descriptor. Deterministic: the offer id and every
   * derived scalar come from hash32 over the failing mission's id + reason — never a counter, a
   * clock, or an rng draw — so two runs of one seed mint the same offer.
   */
  _buildMutationOffer(m, reason, descriptor, stationId, originResolves, homeOverrideStationId = null) {
    const state = this.state;
    const reasonText = String(reason);
    const offerId = `mut_${hash32(String(m.id), reasonText, 'mission-mutation').toString(36)}`;
    const homeStationId = (homeOverrideStationId && STATION_INFO.get(homeOverrideStationId))
      ? homeOverrideStationId
      : (originResolves ? m.stationId : stationId);
    const homeName = (STATION_INFO.get(homeStationId) || {}).name || homeStationId;
    const clauseId = reasonText.startsWith('clause_broken:')
      ? reasonText.slice('clause_broken:'.length) : null;
    const base = {
      id: offerId,
      type: descriptor.type,
      stationId,
      // Circumstance, not a faction posting: no standing gate on the follow-up and no second rep
      // hook (the failure penalty above already settled the offering faction's account).
      factionId: null,
      // Reduced stake reads off the failed contract's own reward; the deposit died with it.
      reward_cr: Math.max(0, Math.round((Number(m.reward_cr) || 0) * 0.5)),
      collateral_cr: 0,
      riskTier: Number.isFinite(m.riskTier) ? m.riskTier : 1,
      distance: Number(m.distance) || 0,
      source: 'missionMutation',
      // postAndAcceptAuthoredOffer re-finds the accepted instance by storyTag. Unique per failing
      // mission (deterministic — derived from the mission id, never a counter/clock) so a second
      // mutation elsewhere can never be mistaken for this one.
      storyTag: `mutation:${m.id}`,
    };
    if (descriptor.tag === 'salvage' || descriptor.tag === 'recovery' || descriptor.tag === 'cooked') {
      // The wreck the convoy left is the content. Commodity/qty derive from the failing id; the
      // pointer to the lost hull and its sector read straight off the mission — nothing invented.
      // INF-066: the loss-site stamp (escort failure) feeds the shared routing helper, so the
      // successor's recovery leg starts where the hull actually died, not at the old destination.
      // ship_lost (keepManifest): the successor recovers the SAME commodity the failed contract
      // was carrying — the units are physically in the player's wreck pool. Quantity is what the
      // hold actually lost (the handler stamps _shipLostQty), not a fresh roll.
      const keepManifest = descriptor.keepManifest === true && m.params && m.params.cmdtyId;
      const cmdtyId = keepManifest
        ? m.params.cmdtyId
        : MUTATION_SALVAGE_CMDTYS[
          (hash32(String(m.id), reasonText, 'mutation-salvage-cmdty') >>> 0) % MUTATION_SALVAGE_CMDTYS.length
        ];
      const qty = keepManifest
        ? Math.max(1, Math.floor(Number(m._shipLostQty) || Number(m.params.qty) || 1))
        : 2 + ((hash32(String(m.id), reasonText, 'mutation-salvage-qty') >>> 0) % 3);
      const routing = mutationWreckRouting(m, state.world && state.world.currentSectorId);
      return {
        ...base,
        destStationId: homeStationId,
        destSectorId: routing.sectorId,
        title: descriptor.tag === 'salvage'
          ? `Salvage the convoy wreck — bring it home to ${homeName}`
          : descriptor.tag === 'cooked'
            ? `The cargo cooked — recover what remains for ${homeName}`
            : keepManifest
              ? `Your wreck holds the manifest — recover it for ${homeName}`
              : `Recover what the wreck left — ${homeName}`,
        brief: descriptor.tag === 'salvage'
          ? `The convoy is gone. Its wreck is still on the drift with an unstable core; tow it clear, vent it, or strip it before it bursts — ${homeName} pays for what comes back.`
          : descriptor.tag === 'cooked'
            ? `The lot vented. What is left still pays at ${homeName}.`
            : keepManifest
              ? `Your hull is still on the drift with the contracted units in its hold. ${homeName} pays for what comes back.`
              : `The rescue came second. What is left of the hull still answers questions at ${homeName}.`,
        params: {
          cmdtyId,
          qty,
          lostEntityId: m._escorteeId != null ? m._escorteeId : null,
          lostSectorId: routing.sectorId,
          lostWreckPos: routing.wreckPos,
          brokenClause: clauseId,
          mutationReroute: true,
          // ship_lost only: the manifest is claimed to be inside the player's own wreck, so the
          // pocket co-locates on the wreck marker exactly — never a 60-WU ring offset.
          ...(keepManifest ? { playerWreckSite: true } : {}),
        },
      };
    }
    if (descriptor.tag === 'turned' || descriptor.tag === 'wakes') {
      const lostId = m._escorteeId != null
        ? m._escorteeId
        : (m.targetEntityIds && m.targetEntityIds[0] != null ? m.targetEntityIds[0] : null);
      return {
        ...base,
        destStationId: homeStationId,
        destSectorId: m.destSectorId || (state.world && state.world.currentSectorId) || null,
        title: descriptor.tag === 'turned'
          ? `Hunt the turned escort — ${homeName}`
          : `The wreck woke — put it down for ${homeName}`,
        brief: descriptor.tag === 'turned'
          ? `The convoy showed its real colours. ${homeName} still wants them off the lane.`
          : `The hull sat up. ${homeName} pays for a dead wreck, not a live one.`,
        params: {
          targetStrength: Math.max(1, Number(m.params && m.params.targetStrength) || 1),
          fValue: 1,
          lostEntityId: lostId,
          brokenClause: clauseId,
        },
      };
    }
    if (descriptor.tag === 'bait') {
      return {
        ...base,
        destStationId: homeStationId,
        destSectorId: m.destSectorId || (state.world && state.world.currentSectorId) || null,
        title: `The pods were bait — clear the field for ${homeName}`,
        brief: `The distress was an ambush. ${homeName} wants the field empty.`,
        params: {
          clearCount: Math.max(2, Math.round(Number(m.params && m.params.clearCount) || 2)),
          targetStrength: Math.max(1, Number(m.params && m.params.targetStrength) || 1),
          fValue: 1,
          brokenClause: clauseId,
        },
      };
    }
    if (descriptor.tag === 'sting') {
      const lostCmdtyId = m.params && m.params.cmdtyId || null;
      const lostQty = Math.max(1, Math.round(Number(m.params && m.params.qty) || 1));
      return {
        ...base,
        destStationId: homeStationId,
        destSectorId: (m.stationId && STATION_INFO.get(m.stationId) && m.destSectorId)
          ? (STATION_INFO.get(homeStationId) && STATION_INFO.get(homeStationId).sectorId) || m.destSectorId
          : m.destSectorId || null,
        title: lostCmdtyId
          ? `The buyer is the law — run the lot back to ${homeName}`
          : `The buyer is the law — report to ${homeName}`,
        brief: `The drop was a sting. ${homeName} will still take the book if you make it back.`,
        params: {
          ...(lostCmdtyId ? { cmdtyId: lostCmdtyId, qty: lostQty } : {}),
          brokenClause: clauseId,
          replacesMissionId: m.id,
          mutationReroute: true,
        },
      };
    }
    if (descriptor.tag === 'resumed') {
      // The convoy outlived the missed window — it is still a hull on the lane. keepTargets hands
      // the live escortee to the successor (or a fresh hull spawns when none was ever materialized);
      // the leg, the destination and half the fee are the same, only the deadline re-opens — the
      // client posts the same window it originally gave the run, never a free contract.
      const destName = this._destName(m);
      const destResolves = !!(m.destStationId && STATION_INFO.get(m.destStationId));
      const originalWindowS = Math.max(120, Math.round(
        (Number(m.deadline_s) || 0) - (Number(m.acceptedAt_s) || 0),
      ) || 600);
      return {
        ...base,
        duration_s: originalWindowS,
        destStationId: destResolves ? m.destStationId : homeStationId,
        destSectorId: m.destSectorId || (state.world && state.world.currentSectorId) || null,
        title: `The convoy is still en route — finish the escort to ${destName}`,
        brief: `The departure window lapsed, but the hull you were hired to see safe is still on the lane. ${homeName} pays half to see it dock.`,
        params: {
          brokenClause: clauseId,
          mutationReroute: true,
        },
      };
    }
    if (descriptor.tag === 'warrant') {
      // The mark slipped the scan window, then resurfaced on the same lane — the writ is reposted
      // at half pay with the same window it originally carried. A fresh mark spawns in the old
      // hunt sector (the swept one is never revived).
      const originalWindowS = Math.max(120, Math.round(
        (Number(m.deadline_s) || 0) - (Number(m.acceptedAt_s) || 0),
      ) || 600);
      return {
        ...base,
        duration_s: originalWindowS,
        destStationId: homeStationId,
        destSectorId: m.destSectorId || (state.world && state.world.currentSectorId) || null,
        title: `The mark slipped the window — renewed writ at ${homeName}`,
        brief: `The trail went cold, then the mark resurfaced on the same lane. ${homeName} reposted the writ at half pay.`,
        params: {
          targetStrength: Math.max(1, Number(m.params && m.params.targetStrength) || 1),
          fValue: 1,
          taskTime: 60,
          brokenClause: clauseId,
        },
      };
    }
    // restitution: the lost quantity IS the fiction — replace exactly what the manifest carried and
    // finish the original leg. NOT preloaded: acquiring the replacement is the debt. No cmdty on
    // the failing contract degrades to a plain report-in dock objective, never an invented cargo.
    const lostCmdtyId = m.params && m.params.cmdtyId || null;
    const lostQty = Math.max(1, Math.round(Number(m.params && m.params.qty) || 1));
    const destStationId = (m.destStationId && STATION_INFO.get(m.destStationId))
      ? m.destStationId : homeStationId;
    const destName = (STATION_INFO.get(destStationId) || {}).name || destStationId;
    return {
      ...base,
      destStationId,
      destSectorId: m.destSectorId || null,
      title: lostCmdtyId
        ? `Make restitution — replace the lost ${lostQty}u and deliver to ${destName}`
        : `Make restitution — report to ${destName}`,
      brief: lostCmdtyId
        ? `Customs took the lot. ${destName} still wants ${lostQty}u — your credits bought the lesson, not the cargo.`
        : `The clause is broken and the client keeps the book open. Report to ${destName}.`,
      params: {
        ...(lostCmdtyId ? { cmdtyId: lostCmdtyId, qty: lostQty } : {}),
        brokenClause: clauseId,
        replacesMissionId: m.id,
      },
    };
  },

  _endAuthoredRace(m, reason) {
    if (m.params?.racingContractId) {
      this._racingOpponents?.stop(reason || 'failed');
      this._racingSetPieces?.stop(reason || 'failed');
      resetRacingGhostSession(this.state);
      this.bus.emit('race:ended', { racingContractId: m.params.racingContractId, levelId: m.params.levelId,
        raceMode: m.params.raceMode, raceCupId: m.params.raceCupId, raceCupTicket: m.params.raceCupTicket,
        raceElapsedS: Number.isFinite(m.params.raceStartSimS)
          ? Math.max(0, (this.state.simTime || 0) - m.params.raceStartSimS) : 0,
        raceClean: false, reason: reason || 'failed', status: 'dnf' });
    }
  },

  _failMission(m, index, reason) {
    try {
      this._failMissionBody(m, index, reason);
    } finally {
      this._dropSettledRow(m, index);
    }
  },

  _failMissionBody(m, index, reason) {
    if (m.status !== 'active') return;
    this._endAuthoredRace(m, reason);
    const setPieceTransition = this._compileSetPieceTransition(m, 'failed', reason || 'failed');
    // PQ-138.04 — failure should usually mutate the situation. Try the mutation at the same seam
    // the set-piece recovery already uses: while the mission is still active, before public
    // failure observers run. Null (no descriptor, or a refused post) means the ordinary failure
    // below runs completely unchanged.
    const mutation = this._mutateInsteadOfFail(m, reason || 'failed');
    m.status = 'failed';
    this._clearMissionNav(m.id);

    // Failure rep penalty to the offering faction. We emit faction:repDelta directly and keep the
    // mission:failed payload factionId-FREE so factions' onMissionLost doesn't ALSO penalise.
    // INF-067: a voided contract (target lost to a third party) is not the player's fault — no
    // penalty, and the deposit comes back. FB-068 extends the same honest void to ANY objective
    // killed by a non-player actor ('failed_external'), with the cause named on the receipt.
    const voided = reason === 'target_lost' || reason === 'failed_external';
    const penalty = voided ? 0 : missionRepDeltaFor(m, 'failed');
    if (m.factionId && penalty < 0) {
      this.bus.emit('faction:repDelta', { factionId: m.factionId, delta: penalty, reason: `mission_failed:${m.type}` });
    }
    if (voided && m.collateral_cr > 0) {
      this.bus.emit('economy:grantCredits', { amount: m.collateral_cr, reason: `collateral_refund:${m.id}` });
    }
    // A preloaded manifest belongs to the failed contract. Remove the remaining sealed quantity
    // through cargo authority so abandoning and reissuing cannot duplicate freight.
    const contractCargoRemoved = this._removePreloadedContractCargo(m);
    // Collateral is forfeited (already charged at accept — nothing to refund).
    this._logCompletion(m.type, 0, false);
    const externalLoss = reason === 'failed_external' && m.params && m.params.externalCauseLabel
      ? {
          externalCause: m.params.externalCause || 'generic',
          externalCauseFamily: m.params.externalCauseFamily || 'direct',
          externalKillerId: m.params.externalKillerId != null ? m.params.externalKillerId : null,
        }
      : null;
    this._recordMissionReceipt(m, 'failed', reason || 'failed', {
      rewardCr: 0,
      collateralLostCr: voided ? 0 : m.collateral_cr || 0,
      repDelta: penalty,
      contractCargoRemoved,
      setPieceReceipt: setPieceTransition && setPieceTransition.receipt || null,
      ...(externalLoss || {}),
      // Mutation provenance rides the receipt only when a mutation actually happened.
      ...(mutation ? { mutatedToMissionId: mutation.missionId, mutationTag: mutation.tag } : {}),
    });
    // Recovery must be physically present before public failure observers run. Those observers may
    // render or inspect the promised next station synchronously from mission:failed.
    this._boardSetPieceTransition(m, setPieceTransition);
    this.bus.emit('mission:failed', {
      missionId: m.id,
      reason: reason || 'failed',
      source: m.source || undefined,
      causeFingerprint: m.cause && m.cause.fingerprint || undefined,
      // Never suppressed: aftermathWrecks, haulerOriginSystem and the receipt log consume this
      // event. The mutation fields are additive so descriptor-less failures keep the exact
      // legacy payload shape.
      ...(mutation ? { mutatedToMissionId: mutation.missionId, mutationTag: mutation.tag } : {}),
      ...setPieceEventFields(m, setPieceTransition),
    });
    this._recordStoryMissionFailure(m, reason || 'failed');
    this._cleanupTargets(m);
    this._removeActive(m.id, index);
    this.bus.emit('mission:updated', { missionId: m.id });
    // Presentation last: the debrief popup and toast may fail without un-settling anything above.
    this._settleOptional('failure debrief', () => this._emitMissionDebrief(m, 'failed', reason || 'failed'));
    // A mutated failure is not a scolding: the toast says what the situation turned INTO.
    // A voided contract is not a scolding: the job is gone. Name the deposit only
    // when one was charged and is being returned.
    if (mutation) {
      this.bus.emit('toast', { text: mutation.toastText, kind: 'warn', ttl: 5 });
    } else if (voided) {
      const causeLabel = m.params && m.params.externalCauseLabel;
      const depositBack = m.collateral_cr > 0;
      let text;
      if (reason === 'failed_external' && causeLabel) {
        text = depositBack
          ? `Contract void: ${m.title} — ${causeLabel}; deposit refunded.`
          : `Contract void: ${m.title} — ${causeLabel}.`;
      } else {
        text = depositBack
          ? `Contract void: the mark for ${m.title} was destroyed — deposit refunded.`
          : `Contract void: the mark for ${m.title} was destroyed.`;
      }
      this.bus.emit('toast', {
        text,
        kind: 'warn',
        ttl: 5,
      });
    } else {
      const why = failReasonWord(reason);
      this.bus.emit('toast', {
        text: `Mission FAILED: ${m.title}${why ? ` — ${why}` : ''}`,
        kind: 'error',
        ttl: 4,
      });
    }
  },

  _expireMission(m, index) {
    try {
      this._expireMissionBody(m, index);
    } finally {
      this._dropSettledRow(m, index);
    }
  },

  _expireMissionBody(m, index) {
    if (m.status !== 'active') return;
    this._endAuthoredRace(m, 'deadline');
    const setPieceTransition = this._compileSetPieceTransition(m, 'expired', 'deadline');
    // PQ-138.04: an expired contract leaves residue — the client refiles the leg as a debt.
    // Set-piece/heist/story contracts keep their authored seams (the mutation seam refuses them
    // internally), and mission:expired keeps its exact legacy payload shape; the mutation pointer
    // lives on the receipt and the toast, not the event.
    const mutation = this._mutateInsteadOfFail(m, 'deadline');
    m.status = 'expired';
    this._clearMissionNav(m.id);
    const penalty = missionRepDeltaFor(m, 'expired');
    if (m.factionId && penalty < 0) {
      this.bus.emit('faction:repDelta', { factionId: m.factionId, delta: penalty, reason: `mission_expired:${m.type}` });
    }
    const contractCargoRemoved = this._removePreloadedContractCargo(m);
    this._logCompletion(m.type, 0, false);
    this._recordMissionReceipt(m, 'expired', 'deadline', {
      rewardCr: 0,
      collateralLostCr: m.collateral_cr || 0,
      repDelta: penalty,
      contractCargoRemoved,
      setPieceReceipt: setPieceTransition && setPieceTransition.receipt || null,
      ...(mutation ? { mutatedToMissionId: mutation.missionId, mutationTag: mutation.tag } : {}),
    });
    this._boardSetPieceTransition(m, setPieceTransition);
    this.bus.emit('mission:expired', {
      missionId: m.id,
      reason: 'deadline',
      source: m.source || undefined,
      causeFingerprint: m.cause && m.cause.fingerprint || undefined,
      // Same additive seam as mission:failed — an observer can read what the expiry turned into.
      ...(mutation ? { mutatedToMissionId: mutation.missionId, mutationTag: mutation.tag } : {}),
      ...setPieceEventFields(m, setPieceTransition),
    });
    this._cleanupTargets(m);
    this._removeActive(m.id, index);
    this.bus.emit('mission:updated', { missionId: m.id });
    // Presentation last (see _failMissionBody): a throwing debrief cannot un-settle the expiry.
    this._settleOptional('expiry debrief', () => this._emitMissionDebrief(m, 'expired', 'deadline'));
    this.bus.emit('toast', {
      text: mutation ? mutation.toastText : `Mission expired: ${m.title}`,
      kind: 'warn',
      ttl: mutation ? 5 : 4,
    });
  },

  _removeActive(missionId, hintIndex) {
    const active = this.state.missions.active;
    this._clearMissionNav(missionId);
    let removed = false;
    if (hintIndex != null && active[hintIndex] && active[hintIndex].id === missionId) {
      active.splice(hintIndex, 1);
      removed = true;
    } else {
      const i = active.findIndex((m) => m.id === missionId);
      if (i >= 0) { active.splice(i, 1); removed = true; }
    }
    if (removed) this._refreshNavigation({ forceStory: true, silent: true });
  },

  _logCompletion(type, cr, success) {
    const log = this.state.missions.completedLog;
    let rec = log.find((r) => r.type === type);
    if (!rec) { rec = { type, count: 0, totalCr: 0, success: 0, fail: 0 }; log.push(rec); }
    rec.count++; rec.totalCr += (cr || 0);
    if (success) rec.success++; else rec.fail++;
  },

  _recordMissionReceipt(m, outcome, reason, settlement = {}) {
    if (!this.state.missions) return null;
    this.state.missions.receipts = normalizeMissionReceipts(this.state.missions.receipts);
    // Retire the one-time lot independently of the recent-receipt cap. Promote surviving legacy
    // receipts too, before a later settlement can evict their completion evidence.
    if ((m?.source === WARM_CARGO_CONTRACT.source && outcome === 'completed')
      || this.state.missions.receipts.some(r => r.source === WARM_CARGO_CONTRACT.source && r.outcome === 'completed')) {
      const flags = this.state.story.flags || (this.state.story.flags = {});
      flags.warm_cargo_completed = true;
    }
    // PB-MIS-E: a settled yard contract is retired by its authored id — the board-sync ledger
    // reads this so a refresh can never repost a completed, failed, or abandoned yard job.
    const yardContractId = m && m.params && m.params.yardContractId;
    if (yardContractId) {
      const ledger = this.state.missions.yardContracts || (this.state.missions.yardContracts = {});
      ledger[yardContractId] = outcome;
    }
    const restoration = outcome === 'completed' && isShortageGateRepair(m)
      ? this.state.economyContracts?.shortageRepairs?.[m.cause.shortageEventId] : null;
    const receipt = missionReceiptFor(m, outcome, reason, { ...settlement, at_s: this.state.simTime || 0 });
    if (restoration) receipt.restoration = { ...restoration };
    if (receipt.chainId && receipt.archetypeId) {
      this.state.missions.setPieceSettlements = normalizeSetPieceSettlements({
        ...(this.state.missions.setPieceSettlements || {}),
        [receipt.archetypeId]: receipt,
      });
    }
    const key = receipt.missionId + ':' + receipt.outcome;
    this.state.missions.receipts = [
      receipt,
      ...this.state.missions.receipts.filter((r) => r && (r.missionId + ':' + r.outcome) !== key),
    ].slice(0, MISSION_RECEIPT_LIMIT);
    return receipt;
  },


};

// ── Receipt helpers (module-scope, derived from shared mission tuning) ───────────────────────

export function normalizeMissionReceipts(value) {
  if (!Array.isArray(value)) return [];
  const receipts = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const outcome = String(raw.outcome || 'settled');
    const missionId = raw.missionId != null
      ? String(raw.missionId)
      : String(raw.id || '').split(':')[0];
    if (!missionId) continue;
    receipts.push({
      ...raw,
      id: raw.id || missionId + ':' + outcome,
      missionId,
      outcome,
    });
    if (receipts.length >= MISSION_RECEIPT_LIMIT) break;
  }
  return receipts;
}

function setPieceEpochFrom(value, archetypeId, chainId) {
  if (Number.isFinite(Number(value && value.startEpoch))) {
    return Math.max(0, Math.trunc(Number(value.startEpoch)));
  }
  const prefix = `sp1_${archetypeId}_`;
  if (!String(chainId || '').startsWith(prefix)) return null;
  const suffix = String(chainId).slice(prefix.length);
  const separator = suffix.indexOf('_');
  const parsed = Number(separator >= 0 ? suffix.slice(0, separator) : suffix);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
}

/**
 * Compact durable identity for the latest settled chain per authored archetype. This is not a run
 * object: boards/active missions/causes still own progression. It only survives the independent
 * ten-row presentation receipt cap so ensureBoard cannot resurrect an already-settled epoch.
 */
export function normalizeSetPieceSettlements(value, receipts = []) {
  const known = new Set((SET_PIECE_MISSIONS || []).map((definition) => definition && definition.id).filter(Boolean));
  const out = {};
  const consider = (archetypeId, raw) => {
    if (!known.has(archetypeId) || !raw || typeof raw !== 'object') return;
    const chainId = typeof raw.chainId === 'string' ? raw.chainId : '';
    if (!chainId) return;
    const startEpoch = setPieceEpochFrom(raw, archetypeId, chainId);
    if (startEpoch == null) return;
    const candidate = {
      chainId,
      startEpoch,
      stageIndex: Number.isFinite(Number(raw.stageIndex))
        ? Math.max(0, Math.trunc(Number(raw.stageIndex))) : 0,
      outcome: String(raw.outcome || 'settled'),
      settledAtS: Math.max(0, Number(raw.settledAtS != null ? raw.settledAtS : raw.at_s) || 0),
    };
    const current = out[archetypeId];
    if (!current || candidate.startEpoch > current.startEpoch
      || (candidate.startEpoch === current.startEpoch && candidate.stageIndex > current.stageIndex)
      || (candidate.startEpoch === current.startEpoch && candidate.stageIndex === current.stageIndex
        && candidate.settledAtS >= current.settledAtS)) {
      out[archetypeId] = candidate;
    }
  };
  if (value && typeof value === 'object') {
    for (const [archetypeId, raw] of Object.entries(value)) consider(archetypeId, raw);
  }
  // Migration for older saves: a surviving canonical receipt carries enough seeded identity to
  // construct the durable marker. New settlements no longer depend on that receipt remaining.
  for (const receipt of Array.isArray(receipts) ? receipts : []) {
    consider(receipt && receipt.archetypeId, receipt);
  }
  return out;
}

function receiptTitle(m) {
  return (m && (m.title || m.name)) || String(m && m.type || 'contract')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function missionSpecRep(m) {
  const baseRep = MISSION_TUNING.BASE_REP[m && m.type] != null ? MISSION_TUNING.BASE_REP[m.type] : 3;
  return round(baseRep * (1 + ((m && m.riskTier) || 0) * 0.4));
}

export function missionRepDeltaFor(m, outcome) {
  if (!m || !m.factionId) return 0;
  const specRep = missionSpecRep(m);
  return outcome === 'completed' ? specRep : -Math.ceil(specRep * 0.6);
}

/**
 * RC-MISSION-VOICE — the payday receipt line. Only voiced jobs get a voiced receipt: a named
 * writ's wall, a fence, a logged yard. Ordinary contracts keep their plain payout toast.
 * One middot per line, always — the flight-HUD receipt filter drops denser strings.
 */
export function missionPaydayLine(m, rewardCr) {
  const cr = Math.max(0, Math.round(Number(rewardCr) || 0));
  if (cr <= 0) return null;
  if (m && m.counterweight) {
    return `PAYDAY ${cr} cr — the yard paid for what actually crossed.`;
  }
  if (m && m.heist) {
    return m.heist.settledOutcome === 'fenced_success'
      ? `PAYDAY ${cr} cr — the fence settles fast and forgets your face.`
      : `PAYDAY ${cr} cr — logged, receipted, and paid on the tick.`;
  }
  const markName = m && m.storyTarget && m.storyTarget.role === 'board_writ' ? m.storyTarget.name : null;
  if (m && m.type === 'bounty_hunt' && markName) {
    return `PAYDAY ${cr} cr — the wall crossed ${markName} off.`;
  }
  return null;
}

export function missionReceiptFor(m, outcome, reason, settlement = {}) {
  const completed = outcome === 'completed';
  const missionId = String(m && m.id || 'mission');
  const rewardCr = Math.max(0, Math.round(Number(settlement.rewardCr != null ? settlement.rewardCr : (completed ? (m && m.reward_cr) : 0)) || 0));
  const collateral = Math.max(0, Math.round(Number(m && m.collateral_cr) || 0));
  const collateralRefundCr = Math.max(0, Math.round(Number(settlement.collateralRefundCr != null ? settlement.collateralRefundCr : (completed ? collateral : 0)) || 0));
  const collateralLostCr = Math.max(0, Math.round(Number(settlement.collateralLostCr != null ? settlement.collateralLostCr : (!completed ? collateral : 0)) || 0));
  const repDelta = Number.isFinite(Number(settlement.repDelta)) ? Math.round(Number(settlement.repDelta)) : missionRepDeltaFor(m, outcome);
  const researchPoints = Math.max(0, Math.round(Number(settlement.researchPoints) || 0));
  const at_s = Math.max(0, Number(settlement.at_s) || 0);
  const setPieceReceipt = settlement.setPieceReceipt && typeof settlement.setPieceReceipt === 'object'
    ? settlement.setPieceReceipt : null;
  const cause = m && m.cause && typeof m.cause === 'object' ? m.cause : null;
  const nextStationIds = setPieceReceipt && Array.isArray(setPieceReceipt.nextStationIds)
    ? [...setPieceReceipt.nextStationIds] : [];
  const setPieceFields = (setPieceReceipt || (m && m.source === SET_PIECE_MISSION_SOURCE
    && cause && cause.chainId)) ? {
    chainId: setPieceReceipt && setPieceReceipt.chainId || cause && cause.chainId || null,
    archetypeId: setPieceReceipt && setPieceReceipt.archetypeId || cause && cause.archetypeId || null,
    startEpoch: Number.isInteger(setPieceReceipt && setPieceReceipt.startEpoch)
      ? setPieceReceipt.startEpoch : Number.isInteger(cause && cause.startEpoch) ? cause.startEpoch : null,
    stageIndex: Number.isInteger(setPieceReceipt && setPieceReceipt.stageIndex)
      ? setPieceReceipt.stageIndex : Number.isInteger(cause && cause.stageIndex) ? cause.stageIndex : null,
    stageId: setPieceReceipt && setPieceReceipt.stageId || cause && cause.stageId || null,
    branchId: setPieceReceipt && setPieceReceipt.branchId || cause && cause.branchId || null,
    attempt: Number.isInteger(setPieceReceipt && setPieceReceipt.attempt)
      ? setPieceReceipt.attempt : Number.isInteger(cause && cause.attempt) ? cause.attempt : null,
    house: setPieceReceipt && setPieceReceipt.house || cause && cause.house || null,
    houseText: setPieceReceipt && setPieceReceipt.houseText || null,
    recoveryText: setPieceReceipt && setPieceReceipt.recoveryText || null,
    nextStationId: setPieceReceipt && setPieceReceipt.nextStationId || null,
    nextStationIds,
    wreckId: setPieceReceipt && setPieceReceipt.wreckId || cause && cause.wreckId || m && m.wreckId || null,
  } : {};
  return {
    id: missionId + ':' + String(outcome || 'settled'),
    missionId,
    title: receiptTitle(m),
    type: m && m.type || 'contract',
    outcome: outcome || 'settled',
    reason: reason || null,
    at_s,
    factionId: m && m.factionId || null,
    stationId: m && m.stationId || null,
    destStationId: m && m.destStationId || null,
    destSectorId: m && m.destSectorId || null,
    rewardCr,
    collateralRefundCr,
    collateralLostCr,
    repDelta,
    researchPoints,
    contractCargoRemoved: Math.max(0, Math.round(Number(settlement.contractCargoRemoved) || 0)),
    storyOutcome: m && m.params && m.params.investigationOutcome || null,
    source: m && m.source || null,
    sourceOfferId: m && m.sourceOfferId || null,
    causeFingerprint: m && m.cause && m.cause.fingerprint || null,
    ...setPieceFields,
    targetRecordId: m && m.params && m.params.poiSignalFollowup
      && m.params.poiSignalFollowup.targetRecordId || null,
    // PQ-138.04: mutation provenance on the FAILED contract's receipt, present only when this
    // failure actually mutated into a live successor — conditional so every other receipt keeps
    // its exact legacy shape (same golden-safety discipline as the mission-instance fields).
    ...(settlement.mutatedToMissionId ? {
      mutatedToMissionId: settlement.mutatedToMissionId,
      mutationTag: settlement.mutationTag || null,
    } : {}),
    // FB-068: an external-loss void names what took the objective down (kill-causality vocabulary)
    // so the debrief and the durable receipt agree. Conditional — ordinary failures keep the
    // legacy shape.
    ...(settlement.externalCause ? {
      externalCause: settlement.externalCause,
      externalCauseFamily: settlement.externalCauseFamily || null,
      externalKillerId: settlement.externalKillerId != null ? settlement.externalKillerId : null,
    } : {}),
  };
}

export const CLEAN_PHYSICAL_RELEASE = new Set(['clean', 'razor']);

export function physicalRoleOf(entity) {
  return entity && entity.data && entity.data.physicalRole || null;
}

/**
 * Claim-stake salvage predicates. The OFFER-level gate decides `needsTargets` before
 * instance creation (story/site fields live on the offer, not in params); the MISSION-level
 * gate drives the spawn/steer/listener paths on the live instance. Both refuse every salvage
 * row that already owns a physical site — authored set pieces, wreck-communicator offers,
 * POI follow-ups, and the mutation-recovery pocket all keep their own machinery.
 */
function contractClaimSiteOffer(offer) {
  if (!offer || offer.type !== 'salvage_retrieval') return false;
  if (offer.storyTag || offer.storyContractId || offer.wreckId || offer.campaign47aBeat != null) return false;
  const p = offer.params;
  if (!p || !p.cmdtyId) return false;
  if (p.setPieceObjective || p.salvagePointId || p.survivorPodId || p.wreckMissionId
    || p.wreckPos || p.poiSignalFollowup) return false;
  return true;
}

export function contractClaimSiteMission(m) {
  if (!m || m.type !== 'salvage_retrieval' || m.status !== 'active') return false;
  if (m.storyTag || m.storyContractId || m.wreckId || isMutationRecovery(m)) return false;
  const p = m.params;
  if (!p || !p.cmdtyId) return false;
  if (p.setPieceObjective || p.salvagePointId || p.survivorPodId || p.wreckMissionId
    || p.wreckPos || p.poiSignalFollowup) return false;
  return true;
}

/** Whole units still inside a salvagePool map (the shared wreck/payload drain shape). */
export function salvagePoolUnits(pool) {
  if (!pool || typeof pool !== 'object') return 0;
  let total = 0;
  for (const id of Object.keys(pool)) total += Math.max(0, Math.floor(Number(pool[id]) || 0));
  return total;
}

/** Sanctioned passive-ship steer: write the flight intent (claim-beacon pattern — an
 *  unrostered ship is driven nowhere else). Pure geometry + simTime, no allocation. */
export function steerIntentToward(e, tx, tz, stop) {
  const data = e.data || (e.data = {});
  const intent = data.intent || (data.intent = {});
  const dx = tx - e.pos.x, dz = tz - e.pos.z;
  const d2 = dx * dx + dz * dz;
  const stopR = stop || 40;
  if (d2 <= stopR * stopR) { intent.moveZ = 0; intent.moveX = 0; return; }
  const len = Math.sqrt(d2) || 1;
  const ux = dx / len, uz = dz / len;
  const cf = Math.cos(e.rot || 0), sf = Math.sin(e.rot || 0);
  intent.moveZ = cf * ux + sf * uz;
  intent.moveX = -sf * ux + cf * uz;
  intent.aimAngle = Math.atan2(dz, dx);
  intent.fire = false;
  intent.fireGroup = null;
}

export function missionHostileSpawnPos(state, origin, rng) {
  const center = origin || { x: 0, z: 0 };
  for (let attempt = 0; attempt < MISSION_HOSTILE_SPAWN_ATTEMPTS; attempt++) {
    const ang = rng() * Math.PI * 2;
    const r = MISSION_HOSTILE_SPAWN_MIN_WU + rng() * (MISSION_HOSTILE_SPAWN_MAX_WU - MISSION_HOSTILE_SPAWN_MIN_WU);
    const pos = { x: center.x + Math.cos(ang) * r, z: center.z + Math.sin(ang) * r };
    if (outsideMissionPortSafety(state, pos)) return pos;
  }
  return null;
}

export function missionTargetSlotOf(entity, missionId) {
  const data = entity && entity.data;
  if (!data) return null;
  const explicit = Number(data.missionTargetSlot);
  if (Number.isInteger(explicit) && explicit >= 0) return explicit;
  const identity = typeof data.identityKey === 'string' ? data.identityKey : '';
  const prefix = `mission:${missionId}:`;
  if (!identity.startsWith(prefix)) return null;
  const tail = identity.slice(prefix.length);
  if (!/^\d+$/.test(tail)) return null;
  const parsed = Number(tail);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function completedMissionTargetSlots(mission) {
  const slots = new Set();
  for (const raw of Array.isArray(mission && mission.completedTargetSlots)
    ? mission.completedTargetSlots : []) {
    const slot = Number(raw);
    if (Number.isInteger(slot) && slot >= 0) slots.add(slot);
  }
  return slots;
}

export function lowestVacantSlot(occupied) {
  let slot = 0;
  while (occupied.has(slot)) slot++;
  return slot;
}

/** A point on the Ashfall cache approach, in galactic coordinates. `along` is world units on local +X. */
export function ashfallCacheApproachPos(mission, along) {
  if (!mission || mission.destSectorId !== 'sector_ashfall_reach' || mission.destStationId !== 'station_ashcache') {
    return null;
  }
  const anchors = SECTOR_ANCHORS.sector_ashfall_reach;
  const station = anchors && Array.isArray(anchors.stations)
    ? anchors.stations.find((row) => row && row.id === 'station_ashcache')
    : null;
  if (!station || !station.pos) return null;
  return sectorLocalToGlobalForSector({
    x: station.pos.x + along,
    z: station.pos.z,
  }, 'sector_ashfall_reach');
}

/** Deep Reach blockade: the jam hulk is the Ashfall cache door, not the Tethys ring. */
export function ashfallBlockadeDoorPos(missions, mission, definition) {
  if (!mission || !definition || definition.facilityRole !== 'jam_hulk') return null;
  const approach = ashfallCacheApproachPos(mission, 140);
  if (!approach) return null;
  const live = missions && typeof missions._liveStation === 'function'
    ? missions._liveStation(mission.destStationId)
    : null;
  if (live && live.pos && Number.isFinite(live.pos.x) && Number.isFinite(live.pos.z)) {
    return { x: live.pos.x + 140, z: live.pos.z };
  }
  return approach;
}

export function stableEntityId(id) {
  return `${typeof id}:${String(id)}`;
}

/** Place an authored target inside its named sector zone so the ordinary entity:killed event can
 * create a real aftermathWrecks marker. Zone centers are sector-local; live entities are global. */
export function missionStoryTargetSpawnPos(mission, target, rng) {
  const sectorId = mission && mission.destSectorId;
  const anchorId = target && target.anchorId;
  const anchors = sectorId && SECTOR_ANCHORS[sectorId];
  const anchor = anchorId && anchors
    ? ['stations', 'gates', 'fields', 'pois']
      .flatMap((key) => Array.isArray(anchors[key]) ? anchors[key] : [])
      .find((candidate) => candidate && (candidate.id === anchorId || candidate.to === anchorId))
    : null;
  const anchorCenter = anchor && (anchor.pos || anchor.center);
  if (anchorCenter) {
    const angle = rng() * Math.PI * 2;
    const authoredRadius = Number(target.anchorRadius);
    const maxRadius = Number.isFinite(authoredRadius)
      ? Math.max(0, Math.min(320, authoredRadius))
      : 120;
    // An authored floor keeps the scatter off solid bodies (gate proxies post a mark beside
    // the transit ring, never inside it).
    const authoredMin = Number(target.anchorMinRadius);
    const minRadius = Number.isFinite(authoredMin) ? Math.max(0, Math.min(maxRadius, authoredMin)) : 0;
    const radius = minRadius + Math.sqrt(rng()) * (maxRadius - minRadius);
    return sectorLocalToGlobalForSector({
      x: anchorCenter.x + Math.cos(angle) * radius,
      z: anchorCenter.z + Math.sin(angle) * radius,
    }, sectorId);
  }
  const zoneId = target && target.zoneId;
  const zone = zonesForSector(sectorId).find((candidate) => candidate && candidate.id === zoneId);
  if (!zone || !zone.center) return null;
  const angle = rng() * Math.PI * 2;
  const radius = Math.sqrt(rng()) * Math.max(40, Math.min(240, (zone.radius || 400) * 0.35));
  const local = {
    x: zone.center.x + Math.cos(angle) * radius,
    z: zone.center.z + Math.sin(angle) * radius,
  };
  return sectorLocalToGlobalForSector(local, sectorId);
}

export function outsideMissionPortSafety(state, pos) {
  const active = state && state.world && state.world.activeSector || {};
  for (const station of active.stations || []) {
    if (!station || !station.pos) continue;
    const dockRadius = Number(station.data && station.data.dockRadius);
    const radius = Math.max(MISSION_PORT_SAFE_RADIUS_WU, Number.isFinite(dockRadius) ? dockRadius + 900 : 0);
    if (distSq(pos, station.pos) < radius * radius) return false;
  }
  for (const gate of active.gates || []) {
    if (gate && gate.pos && distSq(pos, gate.pos) < 1000 * 1000) return false;
  }
  return true;
}

/** True when the authored cast placement is comfortable: port-safe and clear of live bodies. */
function capitalBossPlacementClear(state, pos, radius) {
  if (!outsideMissionPortSafety(state, pos)) return false;
  const player = state.entities && state.entities.get(state.playerId);
  if (player && player.alive !== false && player.pos) {
    const pad = radius + (player.radius || 10) + 150;
    if (distSq(pos, player.pos) < pad * pad) return false;
  }
  const index = state.entityIndex;
  const list = index && index.__spacefaceEntityIndexV1 === true && index.ready === true
    && Array.isArray(index.collidables)
    ? index.collidables
    : state.entityList;
  if (Array.isArray(list)) {
    for (const other of list) {
      if (!other || other.alive === false || !other.pos || other.collides === false) continue;
      const pad = radius + (other.radius || 10) + 60;
      if (distSq(pos, other.pos) < pad * pad) return false;
    }
  }
  return true;
}

const CAPITAL_BOSS_PLACEMENT_ATTEMPTS = 10;

/**
 * Authored capital offsets are initial-layout DESIRES. When one would overlap the player, another
 * live body or a protected area, spin the spawn deterministically around the desired point (seeded
 * from the durable actor key — never Math.random) until it is comfortable. Returns null only when
 * the hard safety floor (port safety + player clearance) cannot be met anywhere tried: a genuinely
 * denied spawn is retryable and issues nothing.
 */
export function capitalBossAdjustedPlacement(state, pos, radius, jitterKey) {
  if (capitalBossPlacementClear(state, pos, radius)) return pos;
  const baseSeed = hash32(state && state.meta && state.meta.seed || 1, String(jitterKey || 'capital-boss'));
  for (let attempt = 0; attempt < CAPITAL_BOSS_PLACEMENT_ATTEMPTS; attempt++) {
    const spin = ((baseSeed ^ hash32(state && state.meta && state.meta.seed || 1, attempt + 1)) >>> 0)
      / 4294967296 * Math.PI * 2;
    const dist = 220 + (((baseSeed >>> 8) ^ hash32(state && state.meta && state.meta.seed || 1, attempt + 7)) >>> 0) % 940;
    const candidate = { x: pos.x + Math.cos(spin) * dist, z: pos.z + Math.sin(spin) * dist };
    if (capitalBossPlacementClear(state, candidate, radius)) return candidate;
  }
  // Hard floor only: never on top of the player, never inside a protected area.
  if (!outsideMissionPortSafety(state, pos)) return null;
  const player = state.entities && state.entities.get(state.playerId);
  if (player && player.alive !== false && player.pos) {
    const pad = radius + (player.radius || 10) + 40;
    if (distSq(pos, player.pos) < pad * pad) return null;
  }
  return pos;
}

export function distSq(a, b) {
  const dx = (a && a.x || 0) - (b && b.x || 0);
  const dz = (a && a.z || 0) - (b && b.z || 0);
  return dx * dx + dz * dz;
}

// Story-beat trigger kind (first-X model). B0 is ordered multi-step (mine then dock) via sidecar.
// Gate-only beats (4/5/7) use branch accept / chain count / credit-rep gates.
export const BEAT_TRIGGER = {
  0: null,             // ordered mine → dock (sidecar isBeatStepsComplete gate)
  1: 'trade',          // first sell
  2: 'kill',           // first player kill
  3: 'ship_purchased', // buy any ship (T2 gate is a soft hint)
  4: null,             // branch set on accept (handled in _maybeSetBranch)
  5: null,             // branch chain (handled in _advanceStoryChain)
  6: 'asset_deployed', // first passive asset
  7: null,             // net-worth gate (handled in _checkStoryGates)
};

/** Map missions story kinds → campaign47a step signals (observe/gate only). */
export const STORY_SIGNAL_BY_KIND = {
  mine: 'mining:yield',
  trade: 'economy:tradeCompleted',
  kill: 'entity:killed',
  ship_purchased: 'ship:purchased',
  asset_deployed: 'asset:deployed',
  dock: 'dock:docked',
};

// Per-branch B5 chain requirements (spec B5).
export const BRANCH_CHAIN_TYPE = { traders: 'bulk_trade', patrol: 'patrol_clear', free: 'smuggling_run' };
export const BRANCH_CHAIN_COUNT = { traders: 3, patrol: 2, free: 2 };

// Direction hints shown when a beat becomes current (Captain's Log north star).
export const BEAT_HINT = {
  0: 'Cold Start: mine ore from an asteroid field, then dock to sell or deliver it.',
  1: 'Honest Work: the book posts the alloy run first — the Scale 4 weigh and the furnace detail follow.',
  2: 'First Blood: the cinder board posts first — the Compost Run, the Nest, and the register follow.',
  3: 'Bigger Boat: take delivery of VARIANCE ADJUSTMENT at Slate\u2019s berth — the maw and the Foreman follow.',
  4: 'Pick a Side: accept an intro contract, then run the door\u2019s operation on the board.',
  5: 'Proving Ground: complete your faction\'s mission chain.',
  6: 'Empire Seed: deploy your first passive asset (drone, trader, or outpost).',
  7: 'The Deep Reach: reach Ashfall and choose through its board, ledger, or wormhole.',
};

function storyBeatTitle(beat) {
  if (!beat) return 'Story Objective';
  const hint = BEAT_HINT[beat.beat] || '';
  const colon = hint.indexOf(':');
  if (colon > 0) return hint.slice(0, colon);
  return String(beat.id || `Beat ${beat.beat}`)
    .replace(/^b\d+_?/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function hasActiveMissionEntityIndex(state) {
  const index = state && state.entityIndex;
  return !!(index && index.__spacefaceEntityIndexV1);
}

function missionIndexedEntities(state, primaryKey, secondaryKey) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1) {
    return index[primaryKey] || index[secondaryKey] || [];
  }
  return (state && state.entityList) || [];
}

function sameNavWaypoint(a, b) {
  if (!a || !b) return !a && !b;
  if ((a.kind || null) !== (b.kind || null)) return false;
  if ((a.missionId || null) !== (b.missionId || null)) return false;
  if ((a.targetEntityId || null) !== (b.targetEntityId || null)) return false;
  if ((a.presentationEntityId || null) !== (b.presentationEntityId || null)) return false;
  if ((a.storyBeat ?? null) !== (b.storyBeat ?? null)) return false;
  if ((a.stationId || null) !== (b.stationId || null)) return false;
  if ((a.sectorId || null) !== (b.sectorId || null)) return false;
  if ((a.label || '') !== (b.label || '')) return false;
  if ((a.reason || '') !== (b.reason || '')) return false;
  return sameNavPos(a.pos, b.pos);
}

function sameNavPos(a, b) {
  if (!a || !b) return !a && !b;
  return Math.abs((a.x || 0) - (b.x || 0)) < 0.05
    && Math.abs((a.z || 0) - (b.z || 0)) < 0.05;
}

// Wrap an angle to (-π, π] for the smallest turn delta (escortee steering; no THREE dependency).
export function wrapAngleLocal(a) {
  a = a % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  else if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

// ── local PRNG fallback (only if core helpers absent, e.g. isolated unit test) ────────────────
export function mulberryLocal(a) {
  a >>>= 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
