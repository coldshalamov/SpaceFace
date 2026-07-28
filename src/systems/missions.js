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
import {
  MISSION_TYPES, STORY_BEATS, OFFER_MIX, MISSION_TUNING,
  missionMinRepForRisk,
  STORY_BRANCH_INTROS,
  STORY_BRANCH_INTRO_MIN_REP,
  STORY_BRANCH_INTRO_TAG,
  SET_PIECE_MISSIONS,
} from '../data/missions.js';
import { settleContractClauses, unsatisfiedRequiredConditions } from '../data/contractClauses.js';
// Physics-aware contract terms (grammar §9.9.1). The catalog is data; the event half is observed by
// the ONE generic observer in contractClauses.js; the per-tick half is the predicate slot in update().
import {
  TICK_CONDITION_IDS,
  isMissionConditionRow,
  missionConditionById,
  tallyMissionCondition,
  conditionRemaining,
} from '../data/missionConditions.js';
import { attachConditions } from './contractClauses.js';
import { isFragileCommodity } from './fragileCargo.js';
// PQ-019C — the authored physical capsule heist. The offer and its tuned scalars are data; the run
// itself is driven by the runtime module below, which consumes PQ-019B's pure arbiter. Both are
// inert unless an active mission actually carries a `heist` subrecord.
import {
  PQ019C_HEIST_TYPE,
  PQ019C_HEIST_STATION_ID,
  PQ019C_HEIST_SECTOR_ID,
  buildHeistOffer,
} from '../data/heistMission.js';
import { PQ019_FACILITIES } from '../data/heistFacilities.js';
import {
  heistMissionRuntime,
  createHeistRecord,
  sayHeistCue,
} from '../missions/heistMissionRuntime.js';
import { SECTORS, dangerTier } from '../data/sectors.js';
import { SECTOR_ANCHORS } from '../data/sectorAnchors.js';
import { zonesForSector } from '../data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { effectiveDangerTierFor } from './sectorSim.js';   // V2 §33 — live (drifted) hazard for mission risk
import { COMMODITIES } from '../data/commodities.js';
import { FACTION_META } from '../data/factions.js';
import { SHIPS } from '../data/ships.js';
import { makeEnemySpawnSpec } from './combat.js';
import { protectedStationAt } from '../ai/engagementAuthority.js';
import { POI_CAUSAL_BOARD_CAP, validatePoiCausalOffer } from '../missions/poiCausalOffers.js';
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
// Cargo single-writer helper (same pattern economy.js uses) — delivery missions consume the
// required cargo through this so usedVolume/usedMass caches stay correct (§0.6).
import { addCargo, removeCargo } from './cargo.js';
import {
  CONTRACT_47A_B0_BODY,
  THREAD_B_FRAGMENT_ID,
} from '../data/narrative.js';
// Campaign 47-A sidecar: observe/gate/receipt only — never owns beatIndex/branch/rewards.
import {
  ensureCampaign47aState,
  buildMissionBoardContract,
  buildEndgameBoardOffers,
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

// ── Static lookups (built once from pure data) ───────────────────────────────────────────────
const TYPE_BY_ID = new Map(MISSION_TYPES.map((t) => [t.type, t]));
// Offer-mix arrays are ordered to match MISSION_TYPES; remember that order for weighted picks.
const TYPE_ORDER = MISSION_TYPES.map((t) => t.type);
const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));
const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));

// station id → { type, size, factionId, sectorId, sectorTier, security } resolved from the SECTORS
// graph (dock:docked only hands us a stationId, same pattern economy uses).
const STATION_INFO = new Map();
const SECTOR_BY_ID = new Map();
for (const sec of SECTORS) {
  SECTOR_BY_ID.set(sec.id, sec);
  for (const st of sec.stations || []) {
    STATION_INFO.set(st.id, {
      id: st.id, name: st.name, type: st.type, size: st.size || 'M',
      factionId: st.factionId || sec.factionId, sectorId: sec.id,
      sectorTier: sec.tier, security: sec.security,
    });
  }
}
const ALL_STATIONS = [...STATION_INFO.values()];

// Commodities a player can plausibly haul for delivery / be asked to mine / smuggle.
const LEGAL_TRADE_CMDTYS = COMMODITIES.filter((c) => c.legality === 'legal').map((c) => c.id);
const MINEABLE_CMDTYS = COMMODITIES.filter((c) => (c.producedBy || []).includes('mining')).map((c) => c.id);
const CONTRABAND_CMDTYS = COMMODITIES.filter((c) => c.legality === 'contraband' || c.legality === 'restricted').map((c) => c.id);
const ONE_LOAD_CARGO_TYPES = new Set(['cargo_delivery', 'salvage_retrieval', 'smuggling_run']);
const MISSION_RECEIPT_LIMIT = 10;
const BULK_HAUL_TYPE = 'bulk_haul';
const BULK_HAUL_MIN_MASS_U = 25;
const BULK_HAUL_PAY_MULT = 0.8;
const BULK_HAUL_FEE = 0.06;
// A tick condition may only re-warn this often. The warning is the grace window made visible, not a
// nag: crossing the speed ceiling repeatedly in a dogfight must not bury the rest of the alert lane.
const CONDITION_WARN_COOLDOWN_S = 8;
const CONDITION_BRIEF_MAX = 150;
const TICK_CONDITION_ID_SET = new Set(TICK_CONDITION_IDS);
const MISSION_HOSTILE_SPAWN_MIN_WU = 1700;
const MISSION_HOSTILE_SPAWN_MAX_WU = 2600;
const MISSION_HOSTILE_SPAWN_ATTEMPTS = 24;
const MISSION_PORT_SAFE_RADIUS_WU = 1200;
const LONG_READ_RUMOR_EVENT = Object.freeze({
  news: 'news:headline',
  comms_intercept: 'comms:popup',
  bark: 'barkDirector:voice',
  mission: 'mission:accepted',
  campaign: 'story:beatAdvanced',
  loss_investigation: 'lossInvestigation:authoredRead',
  bar: 'uniqueWreck:rumorHeard',
});
export const CONTRACT_47A_B0_TAG = 'campaign47a:b0:recovery';
export const CONTRACT_47A_SAMPLE_ID = 'cmdty_47a_assay_sample';
export const CONTRACT_47A_B1_TAG = 'campaign47a:b1:honest_work';
export const CONTRACT_47A_B2_TAG = 'campaign47a:b2:elroy';

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
 * Resolve the pre-first-dock corridor idle objective when no mission is tracked.
 * Returns null after first dock, or when a tracked active mission owns the tracker.
 * Pure presenter truth for G05 hierarchy tests and the HUD idle path.
 */
export function resolveCorridorOpeningObjective(state) {
  if (!state || typeof state !== 'object') return null;
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
  for (const e of state.entityList || []) {
    if (e && e.alive !== false && e.type === 'station' && e.data && e.data.stationId === stationId) {
      return e;
    }
  }
  return null;
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
const CONTRACT_47A_B2_SCAN_RADIUS_WU = 1200;
const CONTRACT_47A_B2_CUSTODY_REEL_WU = 60;

// Station size → tier number used for slot count (S=0,M=1,L=2).
const SIZE_TIER = { S: 0, M: 1, L: 2 };

// Story branch → faction mapping (B4/B5 spec).
const BRANCH_FACTION = Object.fromEntries(STORY_BRANCH_INTROS.map((intro) => [intro.branch, intro.factionId]));
const BRANCH_INTRO_BY_FACTION = new Map(STORY_BRANCH_INTROS.map((intro) => [intro.factionId, intro]));
const BRANCH_INTRO_BY_BRANCH = new Map(STORY_BRANCH_INTROS.map((intro) => [intro.branch, intro]));
const HOME_FACTION = 'faction_scn'; // resolves STORY_BEATS B0 reward.rep.faction === 'home'

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const round = Math.round;

function cargoFootprint(offer) {
  const p = offer && offer.params || {};
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

function isStoryBranchIntroOffer(offer, state) {
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

function missionOfferMinRep(offer, state = null) {
  if (isStoryBranchIntroOffer(offer, state)) return STORY_BRANCH_INTRO_MIN_REP;
  const explicit = Number(offer && offer.minRep);
  if (Number.isFinite(explicit)) return Math.round(explicit);
  return missionMinRepForRisk(offer && offer.riskTier);
}

function setPieceCauseOf(value) {
  return value && value.source === SET_PIECE_MISSION_SOURCE && value.cause
    && value.cause.chainId ? value.cause : null;
}

function setPieceEventFields(value, transition = null) {
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

function setPieceUpfrontCost(offer, state = null) {
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

function missionObservesClauseEvent(mission, eventName) {
  return Array.isArray(mission && mission.clauses) && mission.clauses.some((clause) => (
    clause && clause.event === eventName
  ));
}

// Map-space distance between two sectors → world-unit-ish path length (deterministic, bounded).
// Sector map positions are small integers (±~11); scale to a sensible wu range and floor same-sector.
function sectorDistanceWu(aSectorId, bSectorId) {
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
  if (m.storyTag === CONTRACT_47A_B0_TAG) {
    return p.sampleRecovered
      ? 'Deliver the 47-A sample to Helios Station'
      : 'Recover the 47-A sample from the marked rock';
  }
  if (m.storyTag === CONTRACT_47A_B1_TAG) {
    return p.cargoRecoveryNeeded
      ? 'Return to Helios for replacement cargo'
      : 'Deliver sealed alloys to Tycho; compare the manifest';
  }
  if (m.storyTag === CONTRACT_47A_B2_TAG) {
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
  switch (m.type) {
    case 'cargo_delivery': return `Deliver ${p.qty || ''}u ${cargo} to ${stationName}`.trim();
    case 'bulk_trade': return `Sell ${remaining || p.qty || ''}u ${cargo} at ${stationName}`.trim();
    case BULK_HAUL_TYPE: return `Tether-haul ${remaining || p.massU || ''}u bulk ore to ${stationName}`.trim();
    case 'mining_quota': return `Mine ${remaining || p.qty || ''}u ${cargo}`.trim();
    case 'salvage_retrieval': return `Recover ${p.qty || ''}u ${cargo} for ${stationName}`.trim();
    case 'smuggling_run': return `Smuggle ${p.qty || ''}u ${cargo} to ${stationName}`.trim();
    case 'passenger_transport': return `Transport passenger to ${stationName}`;
    case 'escort': return `Escort convoy to ${stationName}`;
    case 'bounty_hunt': return `Find the bounty near ${sectorName}`;
    case 'patrol_clear': return `Clear hostiles in ${sectorName}`;
    case 'recon_scan': return `Scan sites in ${sectorName}`;
    default: return stationName || sectorName;
  }
}

export const missions = {
  name: 'missions',

  init(ctx) {
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
    this._lastWaypointRouteKey = null;
    this._lastWaypointRouteAt = 0;

    // New game → seed config + reset boards/active (idempotent: a load may already have populated).
    bus.on('game:started', () => this.newGame());
    bus.on('tutorial:finished', () => this._releaseStoryNavigationAfterTutorial());
    bus.on('save:loaded', () => this._restoreNavigationAfterLoad());

    // ── Player intents (UI) ────────────────────────────────────────────────────────────────
    bus.on('ui:acceptMission', (p) => this.acceptMission(p && p.missionId));
    bus.on('ui:abandonMission', (p) => this.abandonMission(p && p.missionId));
    bus.on('ui:trackMission', (p) => { if (p && p.missionId) this.trackMission(p.missionId); });
    // Economy-born contracts are emit-only producers. Missions remains the sole board/active
    // authority and boards only a complete, normal offer shape; discovery-only salvage hooks keep
    // their existing consumers and cannot accidentally become malformed board entries.
    bus.on('mission:offered', (p) => this._onExternalBoardOffer(p));

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
      this._onDockedObjectives(stationId);
      this._onContract47aB3Docked(stationId);
      this._storyTrigger('dock', { stationId });
    });
    bus.on('dock:undocked', () => {
      this._lastDockedStation = null;
      this._activateContract47aB1OnDeparture();
      this._activateContract47aB2OnDeparture();
    });

    // ── Objective tracking listeners ─────────────────────────────────────────────────────────
    // bulk_trade quota: sell qty of the target commodity (trade.sold alias → economy:tradeCompleted).
    bus.on('economy:tradeCompleted', (p) => this._onTrade(p));
    // mining_quota: aggregate mined units of the target commodity.
    bus.on('mining:yield', (p) => this._onMiningYield(p));
    // bulk_haul: tethered bulk chunks delivered at refinery docks.
    bus.on('mining:bulkHaulDelivered', (p) => this._onBulkHaulDelivered(p));
    // bounty_hunt / patrol_clear: a tagged hostile died to the player.
    bus.on('entity:killed', (p) => this._onKill(p));
    // escort fail: escortee destroyed.
    bus.on('entity:destroyed', (p) => this._onEntityDestroyed(p));
    // recon_scan: a scan target (or sector scan) completed.
    bus.on('scan:completed', (p) => this._onScan(p));
    // Causal POI follow-ups settle only when scanner physically investigates their exact live
    // entity. Generic scan pulses remain valid for ordinary recon_scan contracts.
    bus.on('signal:investigated', (p) => this._onSignalInvestigated(p));
    bus.on('tether:reel', (p) => this._onContract47aB2TetherReel(p));

    // ── PQ-019C: physical capsule heist ──────────────────────────────────────────────────────
    // Possession is read from the EXISTING Massline/tether latch rather than owned here — the
    // mission normalizes a latch on the authored capsule into one `possession` candidate and never
    // touches physics. Every listener below is a strict no-op unless an active mission carries a
    // `heist` subrecord, so the feature is inert in the golden scenario and in any save that has
    // never seen one. All of these fire BEFORE missions.update for the same tick (registry order:
    // physics 177 < tetherGameplay 197 < heistFacilities 222 < missions 246), which is the
    // arbiter's submit-before-step precondition satisfied structurally.
    bus.on('heist:capsuleLaunched', (p) => this._heistEach(
      (h) => heistMissionRuntime.onCapsuleLaunched(this._heistCtx(), h, p || {})));
    bus.on('heist:facilityCandidate', (p) => this._heistEach(
      (h) => heistMissionRuntime.onFacilityCandidate(this._heistCtx(), h, p || {})));
    bus.on('tether:latched', (p) => this._heistEach(
      (h) => heistMissionRuntime.onTetherLatched(this._heistCtx(), h, p || {})));
    for (const releaseEvent of ['tether:released', 'tether:cut', 'tether:broke']) {
      bus.on(releaseEvent, (p) => this._heistEach(
        (h) => heistMissionRuntime.onTetherReleased(this._heistCtx(), h, p || {})));
    }
    // smuggling bust: a patrol scan caught contraband.
    bus.on('player:scannedByPatrol', (p) => this._onScannedByPatrol(p));
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
    if (state.mode && state.mode !== 'flight') return; // sim frozen while docked/paused
    const active = state.missions.active;
    const now = state.simTime;
    for (let i = active.length - 1; i >= 0; i--) {
      const m = active[i];
      if (m.status !== 'active') continue;
      // Expiry by deadline.
      if (m.deadline_s != null && Number.isFinite(m.deadline_s) && now >= m.deadline_s) { this._expireMission(m, i); continue; }
      // PQ-019C: the capsule run's bounded window is an arbitrated `expired` CANDIDATE, never a
      // mission deadline — the branch above would settle with zero terminal receipts. The authored
      // offer therefore declares no `duration_s`, and this drive may remove `m` from `active`, which
      // the reverse iteration above already tolerates.
      if (m.heist) { this._driveHeist(m, i); continue; }
      // Escort: steer the friendly escortee toward the destination each tick.
      if (m.type === 'escort' && m._escorteeId != null) this._steerEscortee(m, state, dt);
      if (m.type === 'bounty_hunt' || m.type === 'patrol_clear') {
        this._armAcceptedCombatTargets(m, state);
      }
    }
    // ── PER-TICK PREDICATE SLOT (grammar §9.9.1) ──────────────────────────────────────────────
    // Until this line existed, update() evaluated NOTHING per frame except the deadline, which is
    // why a mission could only ever say "counter >= N" or "docked at station X". This is the hook
    // that lets a contract term be a physical state — speed held, line under tension, alongside the
    // berth — instead of an event count.
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
      this.bus.emit('toast', { text: line, kind: 'error', ttl: 4 });
      this._failMission(m, index, `condition_broken:${def.id}`);
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
  // BOARD GENERATION (deterministic, stable within an epoch)
  // =========================================================================================
  /** Current refresh epoch for the world clock (shared across stations — they roll independently
   *  via the per-station hash, but all advance on the same cadence). */
  _epoch() {
    const cfg = this.state.missions.config || MISSION_TUNING;
    return Math.floor((this.state.simTime || 0) / (cfg.refreshSec || 600));
  },

  /** Build (or refresh) a station's board iff missing or its epoch advanced. Stable within an epoch
   *  so accepted/expired offers don't reappear mid-visit. */
  ensureBoard(stationId) {
    const state = this.state;
    const info = STATION_INFO.get(stationId);
    if (!info) return null; // gates / unknown stations have no board
    const epoch = this._epoch();
    let board = state.missions.boards[stationId];
    if (board && board.refreshEpoch === epoch && board.slots && !this._boardNeedsStoryBranchIntro(info, board)) {
      const storyChanged = this._syncEmbodiedStoryOffer(info, board, epoch);
      const setPieceChanged = this._syncSetPieceOpeningOffers(info, board, epoch);
      const heistChanged = this._syncHeistOffer(info, board, epoch);
      if (storyChanged || setPieceChanged || heistChanged) {
        this.bus.emit('mission:updated', { missionId: null, stationId });
      }
      return board;
    }
    // External causal POI leads are durable player-earned rows, not epoch rerolls. Carry their
    // still-valid identities through an ordinary board refresh while keeping the source bounded.
    const previousSlots = board && Array.isArray(board.slots) ? board.slots : [];
    const retainedPoiOffers = previousSlots.filter((offer) => offer && offer.source === 'poiBehavior'
      && (!Number.isFinite(offer.expiresAtEpoch) || offer.expiresAtEpoch > epoch))
      .slice(0, POI_CAUSAL_BOARD_CAP);
    // An in-flight set-piece chain is authored progress, not an expiring procedural roll. Preserve
    // every sibling/recovery row through board refresh; its cause is the save-safe chain cursor.
    const retainedSetPieceOffers = previousSlots.filter((offer) => (
      offer && offer.source === SET_PIECE_MISSION_SOURCE && setPieceCauseOf(offer)
    ));
    // G06 first-trade teach offer is once-per-run authored progress — keep it through epoch refresh
    // until accepted or expired so ensureBoard cannot swallow the corridor lesson.
    const retainedFirstTradeOffers = previousSlots.filter((offer) => (
      offer && offer.source === 'firstTradeContract'
      && (!Number.isFinite(offer.expiresAtEpoch) || offer.expiresAtEpoch > epoch)
    )).slice(0, 1);
    // PQ-019C: an authored heist row (standing contract or its one reduced-stake recovery) is
    // authored progress, not a procedural roll. Carry it through an epoch refresh; _syncHeistOffer
    // re-posts the standing row only when none is present, so a pending recovery is never replaced.
    const retainedHeistOffers = previousSlots.filter((offer) => (
      offer && offer.type === PQ019C_HEIST_TYPE
    )).slice(0, 1);
    board = {
      refreshEpoch: epoch,
      slots: [
        ...retainedHeistOffers,
        ...retainedFirstTradeOffers,
        ...retainedSetPieceOffers,
        ...retainedPoiOffers,
        ...this._generateOffers(info, epoch),
      ],
    };
    state.missions.boards[stationId] = board;
    this._syncEmbodiedStoryOffer(info, board, epoch);
    this._syncSetPieceOpeningOffers(info, board, epoch);
    this._syncHeistOffer(info, board, epoch);
    this.bus.emit('mission:updated', { missionId: null });
    return board;
  },

  /**
   * PQ-019C — keep exactly one authored capsule-run row on the Tethys board.
   *
   * Modelled on `_syncEmbodiedStoryOffer`, deliberately: that is the live precedent for one authored
   * row that must survive board epochs, de-dupe against the active list, and never auto-accept. The
   * board remains the only acceptance authority; this seam only posts.
   *
   * Never posts while a heist is active or while any heist row (including a pending reduced-stake
   * recovery) is already on the board, so "at most one" is structural rather than bookkept.
   */
  _syncHeistOffer(info, board, epoch = this._epoch()) {
    if (!info || info.id !== PQ019C_HEIST_STATION_ID) return false;
    if (!board || !Array.isArray(board.slots)) return false;
    if ((this.state.missions.active || []).some((m) => m && m.status === 'active' && m.heist)) {
      return false;
    }
    if (board.slots.some((offer) => offer && offer.type === PQ019C_HEIST_TYPE)) return false;
    board.slots.unshift(buildHeistOffer({ epoch }));
    return true;
  },

  /**
   * Post the ONE authored reduced-stake retry, when policy allows it. Default policy is OFF
   * (`PQ019C_HEIST_TUNING.recoveryEnabled`), so this normally does nothing at all.
   *
   * Bounded by construction: only from attempt 0, only for recoverable outcomes (never a completed
   * fence run), and only onto a board that carries no heist row — so there is no second recovery
   * and no recovery stacked on the standing contract.
   */
  _boardHeistRecovery(mission, outcome) {
    const record = mission && mission.heist ? mission.heist : null;
    const attempt = record ? (record.attempt | 0) : 0;
    if (!heistMissionRuntime.allowsRecovery(record, outcome)) return false;
    const board = this.ensureBoard(PQ019C_HEIST_STATION_ID);
    if (!board || !Array.isArray(board.slots)) return false;
    if (board.slots.some((offer) => offer && offer.type === PQ019C_HEIST_TYPE)) return false;
    board.slots.unshift(buildHeistOffer({
      epoch: this._epoch(), attempt: attempt + 1, sourceMissionId: mission.id,
    }));
    this.bus.emit('mission:updated', { missionId: null, stationId: PQ019C_HEIST_STATION_ID });
    // The recovery cue rides the same single voice id as the rest of the run, so the last thing the
    // player hears about a lost capsule is where the second pass is posted.
    sayHeistCue(this._heistCtx(), mission.heist, 'recovery');
    return true;
  },

  _heistCtx() {
    return { state: this.state, bus: this.bus, helpers: this.helpers, registry: this.registry };
  },

  /** Apply `fn` to every live heist subrecord. Zero active heists costs one length check. */
  _heistEach(fn) {
    const active = this.state.missions && this.state.missions.active;
    if (!active || !active.length) return;
    for (const m of active) {
      if (m && m.status === 'active' && m.heist && !m.heist.settled) fn(m.heist, m);
    }
  },

  /**
   * One tick of one capsule run, then settlement if a terminal receipt was decided.
   *
   * SETTLEMENT ROUTES THROUGH THE ORDINARY PATHS. `fenced_success` is the only payday and goes to
   * `_completeMission`; every other terminal outcome goes to `_failMission`. That is what buys the
   * packet's invariants by construction rather than by hand-rolled calls:
   *   * `missionSettlementCount == 1` — the effect journal's `missionSettlement` key is taken before
   *     the call, so a synchronous re-entry finds it spent;
   *   * `economyRewardCount == (fenced ? 1 : 0)` — `_completeMission` is the only reward emitter,
   *     and the authored offer carries `collateral_cr: 0` so its refund branch cannot post a second
   *     `economy:grantCredits`;
   *   * `factionOutcomeCount <= 1` — completion routes rep through `mission:completed{repMult}` and
   *     failure emits one `faction:repDelta`; neither path stacks the other.
   * This module calls neither economy nor factions itself.
   */
  _driveHeist(m, index, options = {}) {
    const ctx = this._heistCtx();
    const receipt = heistMissionRuntime.drive(ctx, m.heist, options);
    if (!receipt) return null;
    return heistMissionRuntime.settleTerminal(ctx, m.heist, receipt, (settlement, reason, outcome) => {
      // Recovery is boarded BEFORE the settlement removes the mission, for two reasons: public
      // failure observers may inspect the promised next row synchronously from `mission:failed`
      // (the same ordering `_failMission` already honours for set-piece recovery), and while the
      // mission is still active `_syncHeistOffer` will not re-post the standing contract over it.
      this._boardHeistRecovery(m, outcome);
      if (settlement === 'complete') this._completeMission(m, index);
      else this._failMission(m, index, reason || 'heist_failed');
      return outcome;
    });
  },

  /** Seed each authored SP1 opening on its real home board once per board epoch. */
  _syncSetPieceOpeningOffers(info, board, epoch) {
    if (!info || !board || !Array.isArray(board.slots)) return false;
    let changed = false;
    for (const definition of SET_PIECE_MISSIONS || []) {
      if (!definition || definition.startStationId !== info.id) continue;
      const opening = buildSetPieceMissionOffers(this.state, {
        archetypeId: definition.id,
        startEpoch: epoch,
        stageIndex: 0,
        branchId: null,
        attempt: 0,
      })[0];
      const chainId = opening && opening.cause && opening.cause.chainId;
      if (!opening || !chainId) continue;
      const activeOrPosted = (this.state.missions.active || []).some((mission) => (
        setPieceCauseOf(mission) && mission.cause.archetypeId === definition.id
      )) || Object.values(this.state.missions.boards || {}).some((candidateBoard) => (
        (candidateBoard && candidateBoard.slots || []).some((offer) => (
          setPieceCauseOf(offer) && offer.cause.archetypeId === definition.id
        ))
      ));
      const durableSettlement = this.state.missions.setPieceSettlements
        && this.state.missions.setPieceSettlements[definition.id];
      const alreadySettledThisEpoch = durableSettlement && durableSettlement.chainId === chainId
        || (this.state.missions.receipts || []).some((receipt) => (
        receipt && receipt.chainId === chainId
      ));
      if (activeOrPosted || alreadySettledThisEpoch) continue;
      board.slots.unshift(opening);
      changed = true;
    }
    return changed;
  },

  /** Keep one authored 47-A contract on the correct live board. The board remains the only
   * acceptance authority; this seam never auto-accepts, advances the cursor, or grants rewards. */
  _syncEmbodiedStoryOffer(info, board, epoch = this._epoch()) {
    if (!info || !board || !Array.isArray(board.slots)) return false;
    const story = this.state && this.state.story;
    const beat = story && (story.beatIndex | 0);
    const branch = story && story.branch || null;
    const chainStep = story && (story.chainProgress | 0);
    const seed = this.state && this.state.meta && this.state.meta.seed || 1;
    const flags = story && story.flags || {};
    const offer = buildMissionBoardContract(beat, {
      seed, epoch, branch, chainStep,
      elroyOutcome: flags.elroy_outcome,
      assetId: flags.empire_seed_asset_id,
      operationComplete: !!flags.deep_reach_operation_complete,
      legacy: !!flags.elroy_outcome_legacy || !flags.elroy_outcome,
    });
    const activeTags = new Set((this.state.missions.active || [])
      .filter((mission) => mission && mission.status === 'active' && mission.storyTag)
      .map((mission) => mission.storyTag));
    const keepTag = offer && offer.type ? offer.storyTag : null;
    const before = board.slots.length;
    board.slots = board.slots.filter((candidate) => !(
       candidate && typeof candidate.storyTag === 'string'
       && candidate.storyTag.startsWith('campaign47a:')
       && !candidate.storyTag.startsWith('campaign47a:ending:')
       && candidate.storyTag !== keepTag
    ));
    if (!offer || !offer.type || offer.stationId !== info.id || activeTags.has(offer.storyTag)) {
      return board.slots.length !== before;
    }
    if (board.slots.some((candidate) => candidate && candidate.storyTag === offer.storyTag)) {
      return board.slots.length !== before;
    }
    board.slots.unshift(offer);
    return true;
  },

  _refreshEmbodiedStoryBoards() {
    let changed = false;
    const epoch = this._epoch();
    for (const [stationId, board] of Object.entries(this.state.missions.boards || {})) {
      const info = STATION_INFO.get(stationId);
      if (this._syncEmbodiedStoryOffer(info, board, epoch)) changed = true;
    }
    if (changed) this.bus.emit('mission:updated', { missionId: null });
    return changed;
  },

  /** Publish eligible contract endings (A/B) as physical Ashfall board rows. */
  postEndgameDispositionOffers() {
    const stationId = 'station_ashcache';
    const board = this.ensureBoard(stationId);
    if (!board || !Array.isArray(board.slots)) return false;
    const seed = this.state.meta && this.state.meta.seed || 1;
    let offers = buildEndgameBoardOffers({ seed, epoch: this._epoch() });
    // Causal eligibility: only post A/B rows the player currently qualifies for.
    const storySys = this.registry && this.registry.get && this.registry.get('story');
    if (storySys && typeof storySys.getBoardEligibleEndingIds === 'function') {
      const ok = new Set(storySys.getBoardEligibleEndingIds() || []);
      offers = offers.filter((offer) => offer && ok.has(offer.storyDisposition));
    }
    const active = new Set(board.slots.map((offer) => offer && offer.storyDisposition).filter(Boolean));
    for (const offer of offers) if (!active.has(offer.storyDisposition)) board.slots.unshift(offer);
    this.bus.emit('mission:updated', { missionId: null, stationId });
    return true;
  },

  clearEndgameDispositionOffers() {
    let changed = false;
    for (const board of Object.values(this.state.missions.boards || {})) {
      if (!board || !Array.isArray(board.slots)) continue;
      const before = board.slots.length;
      board.slots = board.slots.filter((offer) => !(offer && offer.storyDisposition));
      changed = changed || board.slots.length !== before;
    }
    if (changed) this.bus.emit('mission:updated', { missionId: null });
    return changed;
  },

  /**
   * Adopt an emit-only field contract into the normal board without accepting it.
   * Idempotent by stable offer id and capped at one economyContract row per station epoch.
   */
  _onExternalBoardOffer(rawOffer) {
    const allowedSource = rawOffer && (
      rawOffer.source === 'economyContract'
      || rawOffer.source === 'firstTradeContract'
      || rawOffer.source === 'encounterAftermath'
      || rawOffer.source === 'careerContract'
      || rawOffer.source === 'postEndingReplay'
      || rawOffer.source === 'poiBehavior'
      || rawOffer.source === 'uniqueWreck'
      || rawOffer.source === SET_PIECE_MISSION_SOURCE
    );
    if (!allowedSource) return false;
    if (rawOffer.source === 'poiBehavior' && !validatePoiCausalOffer(rawOffer).ok) return false;
    if (rawOffer.source === SET_PIECE_MISSION_SOURCE && !setPieceCauseOf(rawOffer)) return false;
    if (!rawOffer.id || !rawOffer.type || !rawOffer.stationId || !rawOffer.params) return false;
    const info = STATION_INFO.get(rawOffer.stationId);
    if (!info || !TYPE_BY_ID.has(rawOffer.type)) return false;
    const epoch = this._epoch();
    if (Number.isFinite(rawOffer.expiresAtEpoch) && rawOffer.expiresAtEpoch <= epoch) return false;
    if ((this.state.missions.active || []).some((m) => m && (
      m.id === rawOffer.id || m.sourceOfferId === rawOffer.id
      || ((rawOffer.source === 'poiBehavior' || rawOffer.source === SET_PIECE_MISSION_SOURCE)
        && m.cause && rawOffer.cause
        && m.cause.fingerprint === rawOffer.cause.fingerprint)
    ))) return false;
    if ((rawOffer.source === 'poiBehavior' || rawOffer.source === SET_PIECE_MISSION_SOURCE)
      && (this.state.missions.receipts || []).some((receipt) => (
      receipt && (receipt.sourceOfferId === rawOffer.id
        || receipt.causeFingerprint === rawOffer.cause.fingerprint)
      ))) return false;

    const board = this.ensureBoard(rawOffer.stationId);
    if (!board || !Array.isArray(board.slots)) return false;
    if (board.slots.some((offer) => offer && offer.id === rawOffer.id)) return false;
    if (rawOffer.source !== 'poiBehavior' && rawOffer.source !== SET_PIECE_MISSION_SOURCE
      && board.slots.some((offer) => offer && offer.source === rawOffer.source)) return false;
    if (rawOffer.source === 'poiBehavior' && board.slots.some((offer) => (
      offer && offer.source === 'poiBehavior' && offer.cause && rawOffer.cause
      && offer.cause.fingerprint === rawOffer.cause.fingerprint
    ))) return false;
    if (rawOffer.source === SET_PIECE_MISSION_SOURCE && board.slots.some((offer) => (
      offer && offer.source === SET_PIECE_MISSION_SOURCE && offer.cause && rawOffer.cause
      && offer.cause.fingerprint === rawOffer.cause.fingerprint
    ))) return false;

    let offer;
    try { offer = JSON.parse(JSON.stringify(rawOffer)); } catch (_) { return false; }
    board.slots.unshift(offer);
    if (offer.source === 'poiBehavior') {
      let kept = 0;
      board.slots = board.slots.filter((candidate) => {
        if (!candidate || candidate.source !== 'poiBehavior') return true;
        kept++;
        return kept <= POI_CAUSAL_BOARD_CAP;
      });
    }
    this.bus.emit('mission:updated', { missionId: null, offerId: offer.id, stationId: offer.stationId });
    this.bus.emit('mission:offerBoarded', {
      offerId: offer.id,
      stationId: offer.stationId,
      source: offer.source,
      causeTag: offer.cause && offer.cause.tag || null,
      causeFingerprint: offer.cause && offer.cause.fingerprint || null,
      epoch: board.refreshEpoch,
    });
    return true;
  },

  _boardNeedsStoryBranchIntro(info, board) {
    const story = this.state && this.state.story;
    const intro = info && BRANCH_INTRO_BY_FACTION.get(info.factionId);
    if (!story || story.beatIndex !== 4 || story.branch || !intro) return false;
    const legacy = !!(story.flags && story.flags.elroy_outcome_legacy) || !(story.flags && story.flags.elroy_outcome);
    const stake = getPickSideStake(story.flags && story.flags.elroy_outcome);
    if (!legacy && (info.id !== stake.stationId || intro.branch !== stake.branch)) return false;
    const slots = board && Array.isArray(board.slots) ? board.slots : [];
    return !slots.some((offer) => (
      offer &&
      offer.storyTag === STORY_BRANCH_INTRO_TAG &&
      offer.factionId === intro.factionId &&
      offer.storyBranch === intro.branch
    ));
  },

  _refreshStoryBranchIntroBoards() {
    const story = this.state && this.state.story;
    if (!story || story.beatIndex !== 4 || story.branch) return false;
    let changed = false;
    for (const [stationId, board] of Object.entries(this.state.missions.boards || {})) {
      const info = STATION_INFO.get(stationId);
      if (!info || !this._boardNeedsStoryBranchIntro(info, board)) continue;
      // Re-enter the canonical refresh path so causal POI and set-piece chain rows survive the
      // story-intro insertion instead of being replaced by a procedural-only board.
      this.ensureBoard(stationId);
      changed = true;
    }
    return changed;
  },

  /** Deterministically generate S offers for a station at an epoch (seeded, no Math.random). */
  _generateOffers(info, epoch) {
    const helpers = this.helpers;
    const seed = (helpers && helpers.hash32)
      ? helpers.hash32(this.state.meta.seed, info.id, epoch)
      : ((this.state.meta.seed ^ epoch) >>> 0);
    const rng = (helpers && helpers.mulberry32) ? helpers.mulberry32(seed) : mulberryLocal(seed);

    const sizeTier = SIZE_TIER[info.size] != null ? SIZE_TIER[info.size] : 1;
    const S = clamp(3 + sizeTier, 3, 9);
    const weights = OFFER_MIX[info.type] || OFFER_MIX.trade_hub;
    // Loyalty boost: friendly players see more of the station faction's signature types.
    const rep = this._repOf(info.factionId);
    const repBoost = 1 + Math.max(0, rep) / 100;

    const offers = [];
    for (let i = 0; i < S; i++) {
      const typeId = this._pickType(weights, rng, repBoost, info.type);
      const offer = this._rollOffer(typeId, info, rng, epoch, i);
      if (offer) offers.push(offer);
    }
    const bulkHaul = this._rollBulkHaulOffer(info, rng, epoch, 'bulk');
    if (bulkHaul) {
      offers.unshift(bulkHaul);
      if (offers.length > S) offers.length = S;
    }
    const intro = this._rollStoryBranchIntroOffer(info, rng, epoch);
    if (intro) {
      offers.unshift(intro);
      if (offers.length > S) offers.length = S;
    }
    return offers;
  },

  /** Weighted pick of a mission type by OFFER_MIX (signature types rep-boosted). */
  _pickType(weights, rng, repBoost, stationType) {
    let total = 0;
    const w = new Array(TYPE_ORDER.length);
    for (let i = 0; i < TYPE_ORDER.length; i++) {
      let weight = weights[i] || 0;
      // signature types (weight>=3) get the friendly-rep boost.
      if (weight >= 3) weight *= repBoost;
      w[i] = weight; total += weight;
    }
    if (total <= 0) return TYPE_ORDER[0];
    let r = rng() * total;
    let lastWeighted = -1;
    for (let i = 0; i < w.length; i++) {
      if (w[i] > 0) lastWeighted = i;
      r -= w[i];
      if (r <= 0) return TYPE_ORDER[i];
    }
    // Float-rounding fallthrough: `r` can end a hair above 0 when rng() approaches 1. Return the
    // last WEIGHTED type rather than the last type in the registry — an authored-only type
    // (procedural weight 0, e.g. heist_intercept) has no _rollOffer/_rollParams case and must never
    // be reachable here. For every shipped OFFER_MIX row the final entry is non-zero, so this is
    // the same answer the previous expression gave.
    return TYPE_ORDER[lastWeighted >= 0 ? lastWeighted : TYPE_ORDER.length - 1];
  },

  /** Roll a concrete MissionOffer for a type at an origin station. */
  _rollOffer(typeId, info, rng, epoch, idx) {
    const def = TYPE_BY_ID.get(typeId);
    if (!def) return null;
    // Authored-only types are never rolled. Second guard behind _pickType's weighted fallthrough:
    // a procedural roll of one would produce an offer with no params and no physical facility.
    if (def.proceduralWeight === 0) return null;
    const cfg = this.state.missions.config || MISSION_TUNING;

    // Destination: pick a reachable station (or self for mining/recon-at-home).
    const dest = this._pickDestination(typeId, info, rng);
    const destStationId = dest ? dest.id : info.id;
    const destSectorId = dest ? dest.sectorId : info.sectorId;
    const distance = sectorDistanceWu(info.sectorId, destSectorId);

    // Risk tier from the destination sector's danger, clamped to the type's allowed band.
    // Prefer the drifted (live) hazard so mission risk reflects the current world state (V2 §33/§35.3);
    // fall back to the static catalog dangerTier when sectorSim hasn't drifted this sector yet.
    const driftedTier = effectiveDangerTierFor(this.state, destSectorId);
    const hasDrift = !!(this.state && this.state.sectorSim && this.state.sectorSim.sectors[destSectorId] && this.state.sectorSim.sectors[destSectorId].drift);
    let sectorRisk;
    if (hasDrift) {
      sectorRisk = driftedTier;
    } else {
      const destSector = SECTOR_BY_ID.get(destSectorId);
      sectorRisk = destSector ? dangerTier(destSector) : 1;
    }
    const [rLo, rHi] = def.riskTierRange || [0, 1];
    const riskTier = clamp(sectorRisk, rLo, rHi);

    // Per-type params (quota qty, target strength, scan count, commodity, …) + cargo value.
    const params = this._rollParams(typeId, info, dest, riskTier, rng);

    // ── reward (one multiplicative family) ──
    const fDist = 1 + distance / (cfg.distDivisor || 2000);
    const fRisk = (cfg.RISK_MULT && cfg.RISK_MULT[riskTier]) || 1;
    const fValue = params.fValue;
    const fFaction = (this._repOf(info.factionId) >= (cfg.faction.friendlyThreshold || 25))
      ? (cfg.faction.loyaltyBonus || 1.15) : 1.0;
    const fTime = 1.0; // rush is opt-in at accept time (UI), default normal
    const base = (cfg.BASE && cfg.BASE[typeId]) || 100;
    const reward_cr = round(base * fDist * fRisk * fValue * fFaction * fTime);

    // ── time limit ──
    const travel = distance / (cfg.cruiseSpeedRef || 140);
    const slack = cfg.slackDefault || 2.2;
    const time_limit_s = round((travel + params.taskTime) * slack);

    // ── collateral (anti accept-then-dump on bulk_trade / smuggling) ──
    const collateral_cr = def.collateral ? round((cfg.collateralPct || 0.25) * reward_cr) : 0;
    const id = `mo_${info.id}_${epoch}_${idx}`;
    const offer = {
      id, type: typeId, stationId: info.id, factionId: info.factionId,
      reward_cr, time_limit_s, collateral_cr, riskTier,
      destStationId, destSectorId, distance,
      params,
      title: this._titleFor(typeId, params, dest),
      brief: this._briefFor(typeId, params, dest, info),
      expiresAtEpoch: epoch + 1,
      storyTag: null,
    };
    // Physics terms are the last thing stamped onto a rolled offer so the reward/deadline family
    // above is untouched: a condition-free offer is byte-identical to the shipped one.
    return this._withConditions(offer, epoch);
  },

  /**
   * Attach 0..2 physics conditions and fold their prose into the offer's one-line brief.
   * Seeded from (world seed, offer id) so a board reproduces exactly across save/load, and a no-draw
   * returns the offer object unchanged.
   *
   * LEGIBILITY: the terms ride in `offer.clauses`, which the station Contracts dossier already
   * renders as labelled tags with the prose as the tooltip, and the brief line the mission log and
   * star chart already print gains the short form. The player is told the rule BEFORE accepting,
   * again in the accept toast, and again the moment it trips.
   */
  _withConditions(offer, epoch) {
    if (!offer) return offer;
    const seed = (this.helpers && this.helpers.hash32)
      ? this.helpers.hash32(this.state.meta.seed, 'conditions', epoch)
      : (((this.state.meta.seed || 0) ^ 0x5bf03635) >>> 0);
    const withTerms = attachConditions(offer, seed, { isFragile: isFragileCommodity });
    if (withTerms === offer) return offer;
    const terms = (withTerms.clauses || []).filter(isMissionConditionRow)
      .map((row) => missionConditionById(row.conditionId))
      .filter(Boolean);
    if (!terms.length) return withTerms;
    const suffix = terms.map((c) => c.brief).filter(Boolean).join(' ');
    if (suffix) {
      const base = String(withTerms.brief || '').trim();
      const line = base ? `${base} ${suffix}` : suffix;
      // The chart inspector prints this as leg prose; the shipped generator clamps its half to 90,
      // so the combined line stays inside two short lines rather than reflowing the panel.
      withTerms.brief = line.length <= CONDITION_BRIEF_MAX ? line
        : `${line.slice(0, CONDITION_BRIEF_MAX - 3).trimEnd()}...`;
    }
    return withTerms;
  },

  _rollBulkHaulOffer(info, rng, epoch, idx) {
    if (!info || info.type !== 'mining') return null;
    const dest = this._pickBulkHaulDestination(info, rng);
    if (!dest) return null;
    const cmdtyId = 'cmdty_ore_iron';
    const commodity = CMDTY_BY_ID.get(cmdtyId);
    const basePrice = commodity && commodity.basePrice || 28;
    const massU = BULK_HAUL_MIN_MASS_U + Math.floor(rng() * 16);
    const expectedPayout = round((massU * basePrice * BULK_HAUL_PAY_MULT) * (1 - BULK_HAUL_FEE));
    const distance = sectorDistanceWu(info.sectorId, dest.sectorId);
    const sectorRisk = dangerTier(SECTOR_BY_ID.get(dest.sectorId) || SECTOR_BY_ID.get(info.sectorId) || {});
    const riskTier = clamp(sectorRisk, 1, 3);
    const taskTime = massU * 2.5;
    const time_limit_s = round((distance / (MISSION_TUNING.cruiseSpeedRef || 140) + taskTime) * (MISSION_TUNING.slackDefault || 2.2));
    return this._withConditions({
      id: `mo_${info.id}_${epoch}_${idx}`,
      type: BULK_HAUL_TYPE,
      stationId: info.id,
      factionId: info.factionId,
      reward_cr: 0,
      time_limit_s,
      collateral_cr: 0,
      riskTier,
      destStationId: dest.id,
      destSectorId: dest.sectorId,
      distance,
      params: { cmdtyId, massU, basePrice, expectedPayout, fValue: 1, taskTime },
      title: `Tether-haul ${massU}u ${commodity ? commodity.name : 'Ore'} to ${dest.name}`,
      brief: `${massU}u on the tether to ${dest.name}. Paid on mass landed, not mass hooked.`,
      expiresAtEpoch: epoch + 1,
      storyTag: null,
      hotTip: false,
    }, epoch);
  },

  _rollStoryBranchIntroOffer(info, rng, epoch) {
    const story = this.state && this.state.story;
    if (!story || story.beatIndex !== 4 || story.branch) return null;
    const intro = BRANCH_INTRO_BY_FACTION.get(info.factionId);
    if (!intro) return null;
    const legacy = !!(story.flags && story.flags.elroy_outcome_legacy) || !(story.flags && story.flags.elroy_outcome);
    const stake = getPickSideStake(story.flags && story.flags.elroy_outcome);
    if (!legacy && (info.id !== stake.stationId || intro.branch !== stake.branch)) return null;
    const offer = this._rollOffer(intro.type, info, rng, epoch, `${intro.branch}_intro`);
    if (!offer) return null;
    offer.id = `mo_${info.id}_${epoch}_${intro.branch}_intro`;
    offer.storyTag = STORY_BRANCH_INTRO_TAG;
    offer.storyBranch = intro.branch;
    offer.title = intro.title;
    // B4 paperwork: one clearing administrator for all three doors.
    offer.adminField = 'V. DIRECTOR, ACTING / REF 44-C';
    offer.authorization = 'CLEARING: V. DIRECTOR, ACTING / REF 44-C';
    if (!legacy) {
      offer.storyStake = stake.id;
      offer.title = stake.label;
      offer.riskTier = Math.max(2, offer.riskTier || 0);
      if (offer.type === 'patrol_clear') {
        offer.params.clearCount = Math.max(2, offer.params.clearCount || 1);
        offer.params.targetStrength = Math.max(1.35, offer.params.targetStrength || 1);
      } else if (offer.type === 'bulk_trade') {
        offer.params.qty = Math.max(8, offer.params.qty || 1);
      }
    }
    return offer;
  },

  /** Pick a destination station for a mission type (deterministic). Cargo/escort/passenger want a
   *  different station; bounty/patrol/recon happen out in a (possibly self) sector; mining delivers
   *  back to the origin (a buyer). */
  _pickDestination(typeId, info, rng) {
    // Mining quota: deliver to origin (it buys ore). Recon/bounty/patrol: pick a nearby sector.
    if (typeId === 'mining_quota') return info;
    // Prefer a discovered/known station; fall back to any in the catalog within a few hops.
    const candidates = ALL_STATIONS.filter((s) => s.id !== info.id);
    if (!candidates.length) return info;
    // Bias toward same-or-adjacent sectors for fair timers (fairness note: nearer for slow ships).
    const sec = SECTOR_BY_ID.get(info.sectorId);
    const near = candidates.filter((s) => s.sectorId === info.sectorId
      || (sec && (sec.neighbors || []).includes(s.sectorId)));
    const pool = near.length ? near : candidates;
    return pool[Math.floor(rng() * pool.length)];
  },

  _pickBulkHaulDestination(info, rng) {
    const refineries = ALL_STATIONS.filter((s) => s.type === 'refinery' || s.services && s.services.includes('refine'));
    if (!refineries.length) return info;
    const same = refineries.filter((s) => s.sectorId === info.sectorId);
    if (same.length) return same[Math.floor(rng() * same.length)];
    const sec = SECTOR_BY_ID.get(info.sectorId);
    const near = refineries.filter((s) => sec && (sec.neighbors || []).includes(s.sectorId));
    const pool = near.length ? near : refineries;
    return pool[Math.floor(rng() * pool.length)];
  },

  /** Roll the type-specific parameters and the f_value scaler. */
  _rollParams(typeId, info, dest, riskTier, rng) {
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];
    switch (typeId) {
      case 'cargo_delivery':
      case 'passenger_transport': {
        const cmdtyId = typeId === 'cargo_delivery' ? pick(LEGAL_TRADE_CMDTYS) : null;
        const qty = typeId === 'cargo_delivery' ? (6 + Math.floor(rng() * 16)) : 1; // 6..21u or 1 passenger
        const unitVal = cmdtyId ? (CMDTY_BY_ID.get(cmdtyId).basePrice || 50) : 0;
        const cargoValue = cmdtyId ? unitVal * qty : 800;
        return { cmdtyId, qty, cargoValue, fValue: 1 + cargoValue / 8000, taskTime: 20, passengers: typeId === 'passenger_transport' ? 1 : 0 };
      }
      case 'bulk_trade': {
        const cmdtyId = pick(LEGAL_TRADE_CMDTYS);
        const qty = 12 + Math.floor(rng() * 28); // 12..39u quota to sell at dest
        const unitVal = CMDTY_BY_ID.get(cmdtyId).basePrice || 50;
        const cargoValue = unitVal * qty;
        return { cmdtyId, qty, progress: 0, cargoValue, fValue: 1 + cargoValue / 8000, taskTime: qty * 1.5 };
      }
      case 'mining_quota': {
        const cmdtyId = pick(MINEABLE_CMDTYS);
        const qty = 10 + Math.floor(rng() * 30); // 10..39u
        const unitVal = CMDTY_BY_ID.get(cmdtyId).basePrice || 30;
        const cargoValue = unitVal * qty;
        return { cmdtyId, qty, progress: 0, cargoValue, fValue: 1 + cargoValue / 8000, taskTime: qty * 3 };
      }
      case 'salvage_retrieval': {
        const cmdtyId = pick(['cmdty_scrap_metal', 'cmdty_salvage_electronics']);
        const qty = 4 + Math.floor(rng() * 10);
        const unitVal = CMDTY_BY_ID.get(cmdtyId).basePrice || 30;
        const cargoValue = unitVal * qty;
        return { cmdtyId, qty, cargoValue, fValue: 1 + cargoValue / 8000, taskTime: 30 };
      }
      case 'smuggling_run': {
        const cmdtyId = pick(CONTRABAND_CMDTYS);
        const qty = 4 + Math.floor(rng() * 12);
        const unitVal = CMDTY_BY_ID.get(cmdtyId).basePrice || 150;
        const cargoValue = unitVal * qty;
        return { cmdtyId, qty, cargoValue, fValue: 1 + cargoValue / 8000, taskTime: 20 };
      }
      case 'bounty_hunt': {
        const targetStrength = 1.2 + riskTier * 0.5 + rng() * 0.6; // ~1.2..3.8
        return { clearCount: 1, killCount: 0, targetStrength, fValue: targetStrength, taskTime: 60 };
      }
      case 'escort': {
        const targetStrength = 1.0 + riskTier * 0.4 + rng() * 0.5;
        return { targetStrength, fValue: targetStrength, taskTime: 90 };
      }
      case 'patrol_clear': {
        const clearCount = 2 + Math.floor(rng() * 3); // 2..4 hostiles
        const targetStrength = (1.0 + riskTier * 0.4) * clearCount * 0.6;
        return { clearCount, killCount: 0, targetStrength, fValue: targetStrength, taskTime: clearCount * 45 };
      }
      case 'recon_scan': {
        const scanTargets = 1 + Math.floor(rng() * 3); // 1..3 beacons
        return { scanTargets, progress: 0, fValue: 1 + scanTargets * 0.25, taskTime: scanTargets * 25 };
      }
      default:
        return { fValue: 1, taskTime: 30 };
    }
  },

  _titleFor(typeId, p, dest) {
    const destName = dest ? dest.name : 'destination';
    const cName = (id) => { const c = CMDTY_BY_ID.get(id); return c ? c.name : 'cargo'; };
    switch (typeId) {
      case 'cargo_delivery': return `Haul ${p.qty}u ${cName(p.cmdtyId)} to ${destName}`;
      case 'bulk_trade': return `Sell ${p.qty}u ${cName(p.cmdtyId)} at ${destName}`;
      case 'mining_quota': return `Mine ${p.qty}u ${cName(p.cmdtyId)}`;
      case 'salvage_retrieval': return `Recover ${p.qty}u ${cName(p.cmdtyId)} for ${destName}`;
      case 'smuggling_run': return `Smuggle ${p.qty}u ${cName(p.cmdtyId)} to ${destName}`;
      case 'bounty_hunt': return `Eliminate a wanted target near ${destName}`;
      case 'escort': return `Escort a convoy to ${destName}`;
      case 'patrol_clear': return `Clear ${p.clearCount} hostiles near ${destName}`;
      case 'recon_scan': return `Scan ${p.scanTargets} site(s) near ${destName}`;
      case 'passenger_transport': return `Transport a passenger to ${destName}`;
      default: return `Contract at ${destName}`;
    }
  },

  /**
   * One dry line of leg prose stamped onto the offer as `brief`. The title says what the contract is
   * called; the brief says what the leg is actually for. Composed from the same commodity/destination
   * material rather than hand-authored, so generated work reads like authored work. Working-space
   * voice, clamped to 90 chars. Read by src/ui/galaxyMap.js (`missionChartBrief`) and the mission log.
   */
  _briefFor(typeId, p, dest, origin) {
    const destName = dest && dest.name ? dest.name : 'the destination';
    const fromName = origin && origin.name ? origin.name : 'here';
    const cName = (id) => { const c = CMDTY_BY_ID.get(id); return c ? c.name : 'cargo'; };
    const clamp90 = (line) => (line.length <= 90 ? line : `${line.slice(0, 87).trimEnd()}...`);
    let line;
    switch (typeId) {
      case 'cargo_delivery':
        line = `${p.qty}u ${cName(p.cmdtyId)} out of ${fromName}. ${destName} signs for it or nobody eats.`;
        break;
      case 'bulk_trade':
        line = `Move ${p.qty}u ${cName(p.cmdtyId)} across ${destName}. Their books, your margin.`;
        break;
      case 'mining_quota':
        line = `${p.qty}u ${cName(p.cmdtyId)} out of the rock. Nobody asks which rock.`;
        break;
      case 'salvage_retrieval':
        line = `${p.qty}u ${cName(p.cmdtyId)} off a dead hull. ${destName} wants it back on the books.`;
        break;
      case 'smuggling_run':
        line = `${p.qty}u ${cName(p.cmdtyId)} into ${destName}. Customs is the whole job.`;
        break;
      case 'bounty_hunt':
        line = `Someone working near ${destName} is worth more dead. Paperwork is already filed.`;
        break;
      case 'escort':
        line = `Convoy runs to ${destName}. Paid on arrivals, not on kills.`;
        break;
      case 'patrol_clear':
        line = `${p.clearCount} hostiles sitting on the lanes near ${destName}. Clear the lane.`;
        break;
      case 'recon_scan':
        line = `${p.scanTargets} site(s) near ${destName} need a real reading, not a rumor.`;
        break;
      case 'passenger_transport':
        line = `One passenger to ${destName}. Quiet trip, quiet fee.`;
        break;
      default:
        line = `Work out of ${fromName}. Terms are on the contract.`;
    }
    return clamp90(line);
  },

  // =========================================================================================
  // ACCEPT / ABANDON
  // =========================================================================================
  /** Move an offer from a board to active. Charges collateral, enforces maxActive, emits accepted. */
  acceptMission(missionId) {
    const state = this.state, cfg = state.missions.config || MISSION_TUNING;
    if (!missionId) return false;
    if (state.missions.active.length >= (cfg.maxActive || 8)) {
      this.bus.emit('toast', { text: 'Too many active missions', kind: 'error', ttl: 3 });
      return false;
    }
    const { offer, board } = this._findOffer(missionId);
    if (!offer) return false;
    if (offer.params && offer.params.setPieceObjective === 'long_read_fence') {
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
    if (offer.storyDisposition) {
      const choice = offer.storyDisposition;
      // Stage irreversible confirmation (story resolves only on ui:endgameConfirm / confirm:true).
      this.bus.emit('ui:endgameChoose', { choice, source: 'ashfall_mission_board', offerId: offer.id });
      return true;
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
        ? `Need ${acceptCostCr}cr for deposit and service fees`
        : `Need ${collateralCr}cr collateral`;
      this.bus.emit('toast', { text, kind: 'error', ttl: 3 });
      return false;
    }

    const inst = this._instanceFromOffer(offer);
    // A branch selection is atomic: withdraw both siblings from every board before any fee intent
    // or sealed-manifest cargo write can expose a half-selected route to synchronous listeners.
    const withdrawnSetPiece = setPieceCauseOf(offer)
      ? this._withdrawSetPieceChoiceOffers(offer) : [];
    if (!setPieceCauseOf(offer) && board) board.slots = board.slots.filter((o) => o.id !== offer.id);
    if (collateralCr > 0) {
      this.bus.emit('economy:chargeCredits', { amount: collateralCr, reason: `collateral:${offer.id}` });
    }
    if (upfrontCostCr > 0) {
      this.bus.emit('economy:chargeCredits', { amount: upfrontCostCr, reason: `mission_upfront:${offer.id}` });
    }
    state.missions.active.push(inst);
    if (inst.preloadedCargo && inst.params && inst.params.cmdtyId) {
      const loaded = addCargo(state, inst.params.cmdtyId, Math.max(1, inst.params.qty || 1));
      if (loaded < Math.max(1, inst.params.qty || 1)) {
        state.missions.active.pop();
        if (withdrawnSetPiece.length) this._restoreWithdrawnSetPieceOffers(withdrawnSetPiece);
        else if (board && !board.slots.some((candidate) => candidate.id === offer.id)) board.slots.unshift(offer);
        this.bus.emit('toast', { text: 'Cargo hold cannot receive the sealed manifest', kind: 'error', ttl: 3 });
        return false;
      }
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
      sourceRef: inst.sourceRef || undefined,
      wreckId: inst.wreckId || undefined,
      channelId: inst.channelId || undefined,
      causeFingerprint: inst.cause && inst.cause.fingerprint || undefined,
      ...setPieceEventFields(inst),
    });
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
    this._startLongReadObjective(inst);
    return true;
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
   * Missions-owned seam for authored, deterministic contracts such as M3 Hauler steps.
   * The caller supplies a normal board offer; this method alone inserts and accepts it so
   * collateral, active ids, mission navigation, rewards, and receipts keep one authority.
   */
  postAndAcceptAuthoredOffer(rawOffer) {
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

    if (!this.acceptMission(offer.id)) {
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
    if (offer && offer.factionId) {
      const minRep = missionOfferMinRep(offer, this.state);
      const rep = this._repOf(offer.factionId);
      if (rep < minRep) {
        return {
          ok: false,
          reason: `${factionShortName(offer.factionId)} standing ${signedRep(minRep)} required`,
        };
      }
    }
    if (!offer || !ONE_LOAD_CARGO_TYPES.has(offer.type)) return { ok: true };
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
      const line = `Tracking: ${mission.title || 'Mission'}${wp && wp.reason ? ` - ${wp.reason}` : ''}`;
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
      acceptedAt_s: state.simTime,
      deadline_s: Number.isFinite(durationS) && durationS > 0
        ? Math.max(0, Number(state.simTime) || 0) + durationS : null,
      reward_cr: offer.reward_cr, collateral_cr: offer.collateral_cr,
      riskTier: offer.riskTier,
      destStationId: offer.destStationId, destSectorId: offer.destSectorId,
      distance: offer.distance,
      targetEntityIds: [],          // runtime entity ids (NOT serialized — re-spawned on load)
      needsTargets: !!(def && this._typeSpawnsTargets(offer.type, offer.params)),
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
      // PQ-019C. The heist subrecord nests inside an active entry, which serialize() already carries
      // wholesale via `{ ...rest }` — durable with NO save-schema change and no new top-level key.
      // Conditional spread on the same precedent as `clauses` above: every non-heist instance gains
      // no key at all, which is what keeps the golden `--reload-at 600` comparison byte-identical.
      ...(offer.type === PQ019C_HEIST_TYPE
        ? {
          heist: createHeistRecord({
            missionId: id,
            tick: state.tick | 0,
            attempt: offer.heistAttempt | 0,
            launchWindowS: offer.params && offer.params.launchWindowS,
            runWindowTicks: offer.params && offer.params.runWindowTicks,
            unlaunchedWindowTicks: offer.params && offer.params.unlaunchedWindowTicks,
            recoveryAllowed: offer.params && offer.params.recoveryEnabled,
          }),
        }
        : {}),
      ...(setPieceCauseOf(offer)
        ? { upfrontCostCr: setPieceUpfrontCost(offer, this.state) } : {}),
      sourceOfferId: offer.id || null,
      cause: offer.cause ? JSON.parse(JSON.stringify(offer.cause)) : null,
      chainNextSeed: (offer.source !== SET_PIECE_MISSION_SOURCE && def && def.chainable)
        ? this._chainSeed(offer) : null,
    };
  },

  _objectiveTarget(typeId, params) {
    switch (typeId) {
      case 'bulk_trade': return params.qty;
      case BULK_HAUL_TYPE: return params.massU || 1;
      case 'mining_quota': return params.qty;
      case 'patrol_clear': return params.clearCount;
      case 'bounty_hunt': return 1;
      case 'recon_scan': return params.originSurveySample
        ? Math.max(1, params.scanTargets || 1) + Math.max(1, params.sampleQty || 1)
        : params.scanTargets;
      default: return 1; // boolean-at-dest types
    }
  },

  _typeSpawnsTargets(typeId, params = null) {
    return typeId === 'bounty_hunt' || typeId === 'patrol_clear' || typeId === 'escort'
      || !!(params && params.poiSignalFollowup);
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
    // NEVER overwrite an existing trade/story/onboarding waypoint — install corridor only when
    // state.nav.waypoint is absent (and buildCorridorOpeningWaypoint still gates first-dock /
    // tracked mission). Hierarchy: existing nav wins over idle corridor.
    const existingWp = state.nav && state.nav.waypoint;
    if (!existingWp) {
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
    if (this._trackedOrFirstActiveMission()) {
      this._refreshNavigation({ silent: true });
      return;
    }
    const existing = this.state.nav && this.state.nav.waypoint;
    if (existing && existing.kind === 'trade') {
      this._setNavWaypoint(existing);
      return;
    }
    this._refreshNavigation({ forceStory: true, silent: true });
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
    const now = state.simTime || 0;
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

    if (m.storyTag === CONTRACT_47A_B2_TAG) {
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
          pos: sectorLocalToGlobalForSector(fence.localPos, PQ019C_HEIST_SECTOR_ID),
          reason: `Deliver the capsule to ${fence.name}`,
        };
      }
      if (capsule && capsule.alive !== false && capsule.pos) {
        return {
          ...heistBase,
          label: 'Cargo Capsule',
          pos: { x: capsule.pos.x, z: capsule.pos.z },
          reason: 'Intercept the capsule before the Concord catcher takes it',
        };
      }
      const launcher = PQ019_FACILITIES.heist_launcher;
      return {
        ...heistBase,
        label: launcher.name,
        pos: sectorLocalToGlobalForSector(launcher.localPos, PQ019C_HEIST_SECTOR_ID),
        reason: `Hold station off ${launcher.name} for the launch`,
      };
    }

    if (m.type === 'bounty_hunt' || m.type === 'patrol_clear') {
      const target = this._firstLiveMissionTarget(m);
      if (target) return { ...base, targetEntityId: target.id, pos: { x: target.pos.x, z: target.pos.z }, reason: 'Intercept the marked hostile' };
      return base;
    }

    if (m.type === 'escort') {
      const targetStation = this._liveStation(m.destStationId);
      if (targetStation) return { ...base, pos: { x: targetStation.pos.x, z: targetStation.pos.z }, reason: 'Escort the convoy to dock' };
      return base;
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

  _liveStation(stationId) {
    if (!stationId) return null;
    const index = this.state.entityIndex;
    const byStationId = index && index.byStationId;
    const indexed = byStationId && byStationId.get(stationId);
    if (indexed && indexed.alive !== false && indexed.type === 'station') return indexed;
    if (hasActiveMissionEntityIndex(this.state)) return null;
    for (const e of this.state.entityList || []) {
      if (e && e.alive !== false && e.type === 'station' && e.data && e.data.stationId === stationId) return e;
    }
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
      const route = getBiggerBoatRoute(state.story && state.story.flags && state.story.flags.elroy_outcome);
      const info = STATION_INFO.get(route.stationId);
      const station = currentSectorId === route.sectorId ? this._liveStation(route.stationId) : null;
      return {
        ...base,
        label: route.label,
        reason: route.instruction,
        stationId: route.stationId,
        sectorId: route.sectorId,
        sectorName: info && SECTOR_BY_ID.get(info.sectorId)?.name || null,
        pos: station && station.pos ? { x: station.pos.x, z: station.pos.z } : null,
      };
    }
    if (beat.beat === 4) {
      const stake = getPickSideStake(state.story && state.story.flags && state.story.flags.elroy_outcome);
      const info = STATION_INFO.get(stake.stationId);
      const station = currentSectorId === stake.sectorId ? this._liveStation(stake.stationId) : null;
      return {
        ...base,
        label: stake.label,
        reason: stake.instruction,
        stationId: stake.stationId,
        sectorId: stake.sectorId,
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
      const program = getEmpireSeedProgram(state.story && state.story.flags && state.story.flags.elroy_outcome);
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
      const op = getDeepReachOperation(flags.elroy_outcome);
      const info = STATION_INFO.get(op.stationId);
      const station = currentSectorId === (info && info.sectorId) ? this._liveStation(op.stationId) : null;
      const replacementPending = flags.deep_reach_asset_lost || flags.empire_seed_pending_id;
      return {
        ...base,
        label: op.label,
        reason: replacementPending
          ? `Replace and program the lost seed before ${op.label}`
          : op.instruction,
        stationId: op.stationId,
        sectorId: info && info.sectorId || currentSectorId,
        sectorName: info && SECTOR_BY_ID.get(info.sectorId)?.name || null,
        pos: station && station.pos ? { x: station.pos.x, z: station.pos.z } : null,
      };
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
  // OBJECTIVE TRACKING (event resolvers)
  // =========================================================================================
  _onTrade(p) {
    if (!p || !p.commodityId || p.side !== 'sell') return;
    const stationId = p.stationId;
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (m.status !== 'active' || m.type !== 'bulk_trade') continue;
      if (m.params.cmdtyId !== p.commodityId) continue;
      if (m.destStationId && stationId && m.destStationId !== stationId) continue; // sell at the named buyer
      m.objectiveProgress = Math.min(m.objectiveTarget, m.objectiveProgress + (p.qty || 0));
      if (m.objectiveProgress >= m.objectiveTarget) this._completeMission(m, i);
      else { this._refreshTrackedMissionNav(m); this.bus.emit('mission:updated', { missionId: m.id }); }
    }
    this._clearCompletedTradeWaypoint(p);
    // B1 now advances through its authored board mission, not an unrelated market sale.
  },

  _clearCompletedTradeWaypoint(p) {
    if (!p || p.side !== 'sell' || !p.stationId || !p.commodityId) return;
    const state = this.state;
    const nav = state.nav;
    const waypoint = nav && nav.waypoint;
    if (!waypoint || waypoint.kind !== 'trade') return;
    if (waypoint.stationId !== p.stationId || waypoint.commodityId !== p.commodityId) return;
    const cargoItems = state.player && state.player.cargo && state.player.cargo.items || {};
    if ((Number(cargoItems[p.commodityId]) || 0) > 0) return;
    nav.waypoint = null;
    nav.route = null;
    nav.autoTravel = false;
    this.bus.emit('nav:waypoint', null);
  },

  _onMiningYield(p) {
    if (!p || !p.commodityId) return;
    const b0 = (this.state.missions.active || []).find((m) => m && m.status === 'active' && m.storyTag === CONTRACT_47A_B0_TAG);
    let b0SampleRecovered = false;
    if (b0 && !(b0.params && b0.params.sampleRecovered) && p.minerId !== null
      && (p.minerId == null || p.minerId === this.state.playerId)) {
      const source = this._resolveContract47aSampleSource(b0);
      const sourceMatches = !p.pos || !source || distSq(p.pos, source.pos) <= 80 * 80;
      if (sourceMatches && addCargo(this.state, CONTRACT_47A_SAMPLE_ID, 1) === 1) {
        b0.params.sampleRecovered = true;
        b0.objectiveProgress = 1;
        const locked = this.state.story.persistentCargo || (this.state.story.persistentCargo = []);
        if (!locked.includes(CONTRACT_47A_SAMPLE_ID)) locked.push(CONTRACT_47A_SAMPLE_ID);
        b0SampleRecovered = true;
        this._refreshTrackedMissionNav(b0);
        this.bus.emit('mission:updated', { missionId: b0.id, objectiveProgress: 1 });
        this._sayStoryLine('Sample secured. Dock at Helios.', 4);
      }
    }
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (m.status === 'active' && m.type === 'recon_scan'
        && m.params && m.params.originSurveySample && m.params.surveyComplete) {
        const playerMined = p.minerId == null || p.minerId === this.state.playerId;
        const inSurveySector = this.state.world.currentSectorId === m.destSectorId;
        if (playerMined && inSurveySector && p.commodityId === m.params.sampleCmdtyId) {
          m.objectiveProgress = Math.min(m.objectiveTarget, m.objectiveProgress + Math.max(0, p.qty || 0));
          if (m.objectiveProgress >= m.objectiveTarget) this._completeMission(m, i);
          else { this._refreshTrackedMissionNav(m); this.bus.emit('mission:updated', { missionId: m.id }); }
          continue;
        }
      }
      if (m.status !== 'active' || m.type !== 'mining_quota') continue;
      if (m.params.cmdtyId !== p.commodityId) continue;
      m.objectiveProgress = Math.min(m.objectiveTarget, m.objectiveProgress + (p.qty || 0));
      if (m.objectiveProgress >= m.objectiveTarget) this._completeMission(m, i);
      else { this._refreshTrackedMissionNav(m); this.bus.emit('mission:updated', { missionId: m.id }); }
    }
    // New runs require the marked 47-A sample. Pos-less legacy/headless receipts remain compatible
    // through sourceMatches above; saves without the authored B0 contract keep the old trigger.
    if (!b0 || b0SampleRecovered || (b0.params && b0.params.sampleRecovered)) this._storyTrigger('mine', p);
  },

  _onBulkHaulDelivered(p) {
    if (!p || !p.stationId) return;
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (m.status !== 'active' || m.type !== BULK_HAUL_TYPE) continue;
      if (m.destStationId && m.destStationId !== p.stationId) continue;
      const massU = Math.max(0, Number(p.massU) || 0);
      m.objectiveProgress = Math.min(m.objectiveTarget, m.objectiveProgress + massU);
      if (m.objectiveProgress >= m.objectiveTarget) this._completeMission(m, i);
      else { this._refreshTrackedMissionNav(m); this.bus.emit('mission:updated', { missionId: m.id }); }
    }
  },

  _onKill(p) {
    if (!p) return;
    const byPlayer = p.killerId === this.state.playerId;
    if (!byPlayer) return; // mission kills only count for the player
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (m.status !== 'active') continue;
      if (m.type !== 'bounty_hunt' && m.type !== 'patrol_clear') continue;
      // contractClauses observes this same synchronous event after missions. Never let the kill
      // objective pay/complete first; the observer will emit the one canonical breach intent.
      if (missionObservesClauseEvent(m, 'entity:killed')) continue;
      if (!m.targetEntityIds.includes(p.id)) continue;
      if (m.storyTag === CONTRACT_47A_B2_TAG) {
        this._resolveContract47aB2(m, i, 'force', p.id);
        continue;
      }
      m.targetEntityIds = m.targetEntityIds.filter((id) => id !== p.id);
      m.objectiveProgress = Math.min(m.objectiveTarget, m.objectiveProgress + 1);
      if (m.objectiveProgress >= m.objectiveTarget) this._completeMission(m, i);
      else { this._refreshTrackedMissionNav(m); this.bus.emit('mission:updated', { missionId: m.id }); }
    }
  },

  _onEntityDestroyed(p) {
    if (!p || p.id == null) return;
    // PQ-019C: a destroyed capsule is a `payload_destroyed` CANDIDATE, arbitrated against whatever
    // else happened this tick — not an immediate failure. It is stamped from the live tick because
    // this listener runs synchronously with the destruction that caused it.
    this._heistEach((h) => heistMissionRuntime.onEntityDestroyed(this._heistCtx(), h, p.id));
    // Escort fail: the escortee entity died.
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (m.status !== 'active' || m.type !== 'escort') continue;
      if (m._escorteeId != null && m._escorteeId === p.id) {
        this._failMission(m, i, 'escortee_lost');
      }
    }
  },

  _onScan(p) {
    this._identifyContract47aB2(p || {});
    // recon_scan: a scan completed. We accept either a targeted scan (targetId matches a spawned
    // beacon) or a generic sector scan (targetId null) as one unit of progress.
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (m.status !== 'active' || m.type !== 'recon_scan') continue;
      if (m.params && m.params.setPieceObjective === 'long_read_rumor_survey') continue;
      // POI causal recon is not a pulse counter. Scanner must first classify, then track, then
      // physically investigate the exact durable mission entity via signal:investigated.
      if (m.params && m.params.poiSignalFollowup) continue;
      // only count if the player is in the mission's target sector
      if (this.state.world.currentSectorId !== m.destSectorId) continue;
      if (m.params && m.params.originSurveySample) {
        if (m.params.surveyComplete) continue;
        const targetId = p && p.targetId;
        const target = targetId != null && this.state.entities && this.state.entities.get(targetId);
        const asteroidReading = !!(p && p.found && Number(p.found.asteroids) > 0)
          || !!(target && target.type === 'asteroid');
        if (!asteroidReading) continue;
        m.params.surveyComplete = true;
        m.objectiveProgress = Math.max(1, m.params.scanTargets || 1);
        this._refreshTrackedMissionNav(m);
        this.bus.emit('mission:updated', {
          missionId: m.id,
          objectiveProgress: m.objectiveProgress,
          surveyComplete: true,
        });
        continue;
      }
      m.objectiveProgress = Math.min(m.objectiveTarget, m.objectiveProgress + 1);
      if (m.objectiveProgress >= m.objectiveTarget) this._completeMission(m, i);
      else { this._refreshTrackedMissionNav(m); this.bus.emit('mission:updated', { missionId: m.id }); }
    }
  },

  _startLongReadObjective(mission) {
    const params = mission && mission.params;
    if (!mission || mission.status !== 'active' || !params) return false;
    const objective = params.setPieceObjective;
    const wreckId = params.wreckId || mission.wreckId || mission.cause && mission.cause.wreckId;
    if (!wreckId || !String(objective || '').startsWith('long_read_')) return false;
    const own = this.state.player && this.state.player.uniqueWrecks;
    const bearing = own && own.bearings && own.bearings[wreckId];

    if (objective === 'long_read_rumor_survey') {
      if (bearing) {
        params.rumorPurchased = true;
        mission.objectiveProgress = Math.max(1, mission.objectiveProgress || 0);
        if (bearing.phase === 'fixed' || bearing.phase === 'decision' || bearing.phase === 'salvaged') {
          this._onLongReadBearingFixed({ wreckId, sectorId: mission.destSectorId, phase: bearing.phase });
        } else {
          this._refreshTrackedMissionNav(mission);
          this.bus.emit('mission:updated', { missionId: mission.id, objectiveProgress: mission.objectiveProgress });
        }
        return true;
      }
      const eventName = LONG_READ_RUMOR_EVENT[params.channelId || mission.channelId];
      if (!eventName) return false;
      // mission:accepted was the native Pale-Coil carrier immediately above this hook. If the
      // unique-wreck owner is absent, do not recursively publish a second lifecycle event.
      if (eventName === 'mission:accepted') return false;
      this.bus.emit(eventName, {
        sourceRef: params.sourceRef || mission.sourceRef,
        wreckId,
        channelId: params.channelId || mission.channelId,
        text: mission.summary || `Purchased bearing source for ${params.wreckName || wreckId}.`,
        sender: 'DRIFT BROKER',
        kind: 'mission_rumor_purchase',
      });
      return true;
    }

    if (objective === 'long_read_salvage') {
      if (this._longReadComplicationObserved(mission)) params.complicationObserved = true;
      if (bearing && (bearing.phase === 'decision' || bearing.phase === 'salvaged')) {
        this._onLongReadDecisionReady({ wreckId, sectorId: mission.destSectorId, phase: bearing.phase });
      } else {
        this._refreshTrackedMissionNav(mission);
        this.bus.emit('mission:updated', {
          missionId: mission.id,
          complicationObserved: !!params.complicationObserved,
        });
      }
      return true;
    }

    if (objective === 'long_read_fence' && params.wreckChoiceId) {
      if (bearing && bearing.phase === 'salvaged') {
        if (bearing.choiceId !== params.wreckChoiceId) return false;
        return this._onLongReadResolved({
          wreckId,
          choiceId: bearing.choiceId,
          outcome: bearing.outcome || null,
          reconciled: true,
        });
      }
      this.bus.emit('uniqueWreck:choose', {
        wreckId,
        choiceId: params.wreckChoiceId,
        missionId: mission.id,
        chainId: mission.cause && mission.cause.chainId || null,
      });
      return true;
    }
    return false;
  },

  _longReadComplicationObserved(mission) {
    const params = mission && mission.params || {};
    const wreckId = params.wreckId || mission && mission.wreckId
      || mission && mission.cause && mission.cause.wreckId;
    const own = this.state.player && this.state.player.uniqueWrecks;
    if (!wreckId || !own) return !!params.complicationObserved;
    const complications = own.complications && Object.values(own.complications) || [];
    if (complications.some((record) => record && record.wreckId === wreckId
      && record.status !== 'scheduled')) return true;
    const bearing = own.bearings && own.bearings[wreckId];
    return !!params.complicationObserved
      || !!(params.hasReactorComplication && bearing && bearing.reactorDueAt != null)
      // Reaching the decision phase proves the live salvage crossed the wreck's authored hazard
      // context/approach gate. That is the complication for wrecks without a separate encounter.
      || !!(params.hasHazardComplication && bearing
        && (bearing.phase === 'decision' || bearing.phase === 'salvaged'));
  },

  _reconcilePostedLongReadOpening(wreckId, phase = 'rumored') {
    if (!wreckId) return false;
    let changed = false;
    for (const [stationId, board] of Object.entries(this.state.missions.boards || {})) {
      if (!board || !Array.isArray(board.slots)) continue;
      let boardChanged = false;
      for (const offer of board.slots) {
        const cause = setPieceCauseOf(offer);
        const params = offer && offer.params;
        if (!cause || cause.archetypeId !== 'long_read' || cause.stageIndex !== 0 || !params
          || (cause.wreckId || offer.wreckId || params.wreckId) !== wreckId) continue;
        const wreckName = params.wreckName || cause.wreckName || 'Known Wreck';
        params.rumorAlreadyKnown = true;
        params.rumorPurchased = true;
        params.bearingFixed = phase === 'fixed' || phase === 'decision' || phase === 'salvaged';
        offer.upfrontCostCr = 0;
        offer.title = `Reconcile the Known Bearing: ${wreckName}`;
        offer.summary = `${wreckName} is already in your ledger. Reconcile its bearing and proceed to recovery.`;
        changed = true;
        boardChanged = true;
      }
      if (boardChanged) this.bus.emit('mission:updated', { missionId: null, stationId, wreckId });
    }
    return changed;
  },

  _onLongReadRumorRecorded(payload) {
    if (!payload || !payload.wreckId) return false;
    let changed = this._reconcilePostedLongReadOpening(payload.wreckId, payload.phase || 'rumored');
    for (const mission of [...(this.state.missions.active || [])]) {
      const params = mission && mission.params;
      if (!mission || mission.status !== 'active' || !params
        || params.setPieceObjective !== 'long_read_rumor_survey'
        || params.wreckId !== payload.wreckId) continue;
      params.rumorPurchased = true;
      mission.objectiveProgress = Math.max(1, mission.objectiveProgress || 0);
      this._refreshTrackedMissionNav(mission);
      this.bus.emit('mission:updated', {
        missionId: mission.id,
        objectiveProgress: mission.objectiveProgress,
        rumorPurchased: true,
      });
      changed = true;
    }
    return changed;
  },

  _onLongReadBearingFixed(payload) {
    if (!payload || !payload.wreckId) return false;
    const postedChanged = this._reconcilePostedLongReadOpening(payload.wreckId, payload.phase || 'fixed');
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const mission = this.state.missions.active[i];
      const params = mission && mission.params;
      if (!mission || mission.status !== 'active' || !params
        || params.setPieceObjective !== 'long_read_rumor_survey'
        || params.wreckId !== payload.wreckId) continue;
      params.rumorPurchased = true;
      params.bearingFixed = true;
      mission.objectiveProgress = mission.objectiveTarget;
      this._completeMission(mission, i);
      return true;
    }
    return postedChanged;
  },

  _onLongReadComplication(payload) {
    if (!payload || !payload.wreckId) return false;
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const mission = this.state.missions.active[i];
      const params = mission && mission.params;
      if (!mission || mission.status !== 'active' || !params
        || params.setPieceObjective !== 'long_read_salvage'
        || params.wreckId !== payload.wreckId) continue;
      params.complicationObserved = true;
      if (params.salvageDecisionReady) {
        mission.objectiveProgress = mission.objectiveTarget;
        this._completeMission(mission, i);
      } else {
        this._refreshTrackedMissionNav(mission);
        this.bus.emit('mission:updated', { missionId: mission.id, complicationObserved: true });
      }
      return true;
    }
    return false;
  },

  _onLongReadDecisionReady(payload) {
    if (!payload || !payload.wreckId) return false;
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const mission = this.state.missions.active[i];
      const params = mission && mission.params;
      if (!mission || mission.status !== 'active' || !params
        || params.setPieceObjective !== 'long_read_salvage'
        || params.wreckId !== payload.wreckId) continue;
      params.salvageDecisionReady = true;
      if (!params.complicationObserved && this._longReadComplicationObserved(mission)) {
        params.complicationObserved = true;
      }
      if (!params.complicationObserved) {
        this._refreshTrackedMissionNav(mission);
        this.bus.emit('mission:updated', { missionId: mission.id, salvageDecisionReady: true });
        return false;
      }
      mission.objectiveProgress = mission.objectiveTarget;
      this._completeMission(mission, i);
      return true;
    }
    return false;
  },

  _onLongReadResolved(payload) {
    if (!payload || !payload.wreckId || !payload.choiceId) return false;
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const mission = this.state.missions.active[i];
      const params = mission && mission.params;
      if (!mission || mission.status !== 'active' || !params
        || params.setPieceObjective !== 'long_read_fence'
        || params.wreckId !== payload.wreckId
        || params.wreckChoiceId !== payload.choiceId) continue;
      mission.objectiveProgress = mission.objectiveTarget;
      this._completeMission(mission, i);
      return true;
    }
    let changed = false;
    for (const board of Object.values(this.state.missions.boards || {})) {
      if (!board || !Array.isArray(board.slots)) continue;
      const before = board.slots.length;
      board.slots = board.slots.filter((offer) => {
        const params = offer && offer.params;
        const wreckId = params && params.wreckId || offer && offer.wreckId
          || offer && offer.cause && offer.cause.wreckId;
        return !(params && params.setPieceObjective === 'long_read_fence'
          && wreckId === payload.wreckId && params.wreckChoiceId !== payload.choiceId);
      });
      if (board.slots.length !== before) changed = true;
    }
    if (changed) this.bus.emit('mission:updated', { missionId: null, wreckId: payload.wreckId });
    return changed;
  },

  _onSignalInvestigated(p) {
    if (!p || p.entityId == null || !p.signalId) return false;
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      const follow = m && m.params && m.params.poiSignalFollowup;
      if (!m || m.status !== 'active' || !follow) continue;
      if (this.state.world.currentSectorId !== m.destSectorId) continue;
      if (follow.destSectorId !== m.destSectorId) continue;
      if (follow.entityId == null || p.entityId !== follow.entityId) continue;
      if (!m.targetEntityIds.includes(p.entityId)) continue;
      if (p.signalId !== `signal:entity:${p.entityId}`) continue;
      const target = this.state.entities && this.state.entities.get(p.entityId);
      if (!target || target.alive === false || !target.data
        || target.data.worldRecordId !== follow.targetRecordId) continue;
      m.params.investigatedSignalId = p.signalId;
      m.params.investigatedTargetRecordId = follow.targetRecordId;
      m.objectiveProgress = m.objectiveTarget;
      this._completeMission(m, i);
      return true;
    }
    return false;
  },

  _identifyContract47aB2(p) {
    const m = (this.state.missions.active || []).find((mission) => (
      mission && mission.status === 'active' && mission.storyTag === CONTRACT_47A_B2_TAG
    ));
    if (!m || m.params && m.params.investigationStage === 'identified') return false;
    if (this.state.world.currentSectorId !== m.destSectorId) return false;
    const selectedId = p && p.targetId != null ? p.targetId : this.state.player && this.state.player.targetId;
    if (selectedId == null || !m.targetEntityIds.includes(selectedId)) return false;
    const target = this.state.entities.get(selectedId);
    const player = this.state.entities.get(this.state.playerId);
    if (!target || target.alive === false || !target.pos || !player || !player.pos) return false;
    if (distSq(target.pos, player.pos) > CONTRACT_47A_B2_SCAN_RADIUS_WU * CONTRACT_47A_B2_SCAN_RADIUS_WU) return false;

    m.params = m.params || {};
    m.params.investigationStage = 'identified';
    m.params.identifiedBy = 'scanner';
    this._ensureCampaignSidecar();
    recordBeatStep(this.state, 'scan:completed', {
      missionId: m.id,
      targetId: selectedId,
      storyTargetId: m.storyTarget && m.storyTarget.id || 'npc_elroy',
    }, this.state.simTime || 0);
    this._refreshTrackedMissionNav(m);
    this.bus.emit('mission:updated', { missionId: m.id, investigationStage: 'identified' });
    this._sayStoryLine('Registry match: civilian maintenance vessel. Choose your response.', 6);
    return true;
  },

  _onContract47aB2TetherReel(p) {
    if (!p || p.actorId !== this.state.playerId || p.targetId == null) return false;
    const after = Number(p.after);
    if (!Number.isFinite(after) || after > CONTRACT_47A_B2_CUSTODY_REEL_WU) return false;
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (!m || m.status !== 'active' || m.storyTag !== CONTRACT_47A_B2_TAG) continue;
      if (!m.targetEntityIds.includes(p.targetId)) continue;
      if (!m.params || m.params.investigationStage !== 'identified') return false;
      this._resolveContract47aB2(m, i, 'custody', p.targetId);
      return true;
    }
    return false;
  },

  _resolveContract47aB2(m, index, outcome, entityId) {
    if (!m || m.status !== 'active' || m.storyTag !== CONTRACT_47A_B2_TAG) return false;
    m.params = m.params || {};
    if (m.params.investigationOutcome) return false;
    if (m.params.investigationStage !== 'identified') {
      m.params.investigationStage = 'identified';
      m.params.identifiedBy = 'wreck_registry';
      this._ensureCampaignSidecar();
      recordBeatStep(this.state, 'entity:killed', {
        missionId: m.id,
        targetId: entityId,
        storyTargetId: m.storyTarget && m.storyTarget.id || 'npc_elroy',
      }, this.state.simTime || 0);
    }
    m.params.investigationOutcome = outcome;
    this.state.story.flags = this.state.story.flags || {};
    this.state.story.flags.elroy_outcome = outcome;
    this.bus.emit('story:elroyResolved', {
      entityId,
      missionId: m.id,
      storyTargetId: m.storyTarget && m.storyTarget.id || 'npc_elroy',
      outcome,
      identifiedBy: m.params.identifiedBy || null,
    });
    this._sayStoryLine(outcome === 'custody'
      ? 'Elroy secured. Registry discrepancy preserved.'
      : 'Elroy destroyed. Registry discrepancy recorded.', 6);
    m.objectiveProgress = m.objectiveTarget;
    this._completeMission(m, index);
    return true;
  },

  _onScannedByPatrol(p) {
    if (!p || !p.hasContraband) return;
    // Any active smuggling run is busted (the law penalty itself is applied by economy/customs).
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (m.status !== 'active' || m.type !== 'smuggling_run') continue;
      // A scan clause observes this same event after missions. Let its one clauseBroken intent own
      // settlement so the run cannot be failed once as "busted" and again as a clause breach.
      if (missionObservesClauseEvent(m, 'player:scannedByPatrol')) continue;
      this._failMission(m, i, 'busted');
    }
  },

  _onConditionSatisfied(payload) {
    const missionId = payload && payload.missionId;
    if (!missionId || payload.blocking !== true) return false;
    const index = this.state.missions.active.findIndex((m) => (
      m && m.id === missionId && m.status === 'active' && m._settlePending === true
    ));
    if (index < 0) return false;
    const mission = this.state.missions.active[index];
    if (this._blockedByConditions(mission)) return false;
    this._completeMission(mission, index);
    return true;
  },

  _onContractClauseBroken(payload) {
    const missionId = payload && payload.missionId;
    const clauseId = payload && payload.clauseId;
    if (!missionId || !clauseId) return false;
    const index = this.state.missions.active.findIndex((mission) => (
      mission && mission.id === missionId && mission.status === 'active'
    ));
    if (index < 0) return false;
    const mission = this.state.missions.active[index];
    if (!Array.isArray(mission.clauses)
      || !mission.clauses.some((clause) => clause && clause.id === clauseId)) return false;
    this._failMission(mission, index, `clause_broken:${clauseId}`);
    return true;
  },

  _onContract47aB3ShipPurchased(p) {
    const story = this.state && this.state.story;
    if (!story || story.beatIndex !== 3) {
      this._storyTrigger('ship_purchased', p || {});
      return false;
    }
    story.flags = story.flags || {};
    const legacy = !!story.flags.elroy_outcome_legacy || !story.flags.elroy_outcome;
    const route = getBiggerBoatRoute(story.flags.elroy_outcome);
    const stationId = p && p.stationId || this._lastDockedStation;
    const ship = SHIP_BY_ID.get(p && p.defId);
    if (!legacy && stationId !== route.stationId) {
      if (ship && ship.tier >= 2) story.flags.bigger_boat_pending_hull = ship.id;
      this._refreshNavigation({ forceStory: true, silent: true });
      this._sayStoryLine('Wrong yard. Follow the marked 47-A shipyard.', 5);
      return false;
    }
    if (!legacy && (!ship || ship.tier < 2)) {
      this._refreshNavigation({ forceStory: true, silent: true });
      this._sayStoryLine('Bigger Boat requires a tier-two hull.', 5);
      return false;
    }
    story.flags.bigger_boat_route = route.id;
    this._storyTrigger('ship_purchased', { ...p, stationId, elroyOutcome: route.outcome, routeId: route.id });
    return story.beatIndex !== 3;
  },

  _onContract47aB3Docked(stationId) {
    const story = this.state && this.state.story;
    if (!story || story.beatIndex !== 3 || !story.flags) return false;
    const defId = story.flags.bigger_boat_pending_hull;
    const ship = SHIP_BY_ID.get(defId);
    const route = getBiggerBoatRoute(story.flags.elroy_outcome);
    if (!ship || ship.tier < 2 || stationId !== route.stationId) return false;
    delete story.flags.bigger_boat_pending_hull;
    story.flags.bigger_boat_route = route.id;
    this._storyTrigger('ship_purchased', {
      defId, stationId, elroyOutcome: route.outcome, routeId: route.id, recoveredAtRoute: true,
    });
    return story.beatIndex !== 3;
  },

  _onContract47aB6AssetDeployed(p) {
    const story = this.state && this.state.story;
    if (story && story.beatIndex === 7 && story.flags && story.flags.deep_reach_asset_lost) {
      if (!p || p.kind !== 'drone' || p.id == null) return false;
      story.flags.empire_seed_pending_id = p.id;
      story.flags.empire_seed_pending_def = p.defId || null;
      this._refreshNavigation({ forceStory: true, silent: true });
      this._sayStoryLine('Replacement deployed. Restore the seed program.', 5);
      return true;
    }
    if (!story || story.beatIndex !== 6) {
      this._storyTrigger('asset_deployed', p || {});
      return false;
    }
    story.flags = story.flags || {};
    const legacy = !!story.flags.elroy_outcome_legacy || !story.flags.elroy_outcome;
    if (legacy) {
      this._storyTrigger('asset_deployed', p || {});
      return story.beatIndex !== 6;
    }
    if (!p || p.kind !== 'drone' || p.id == null) return false;
    story.flags.empire_seed_pending_id = p.id;
    story.flags.empire_seed_pending_def = p.defId || null;
    this._refreshNavigation({ forceStory: true, silent: true });
    this._sayStoryLine('Drone deployed. Assign the marked program.', 5);
    return true;
  },

  _onContract47aB6ProgramAssigned(p) {
    const story = this.state && this.state.story;
    if (story && story.beatIndex === 7 && story.flags && story.flags.deep_reach_asset_lost) {
      const program = getEmpireSeedProgram(story.flags.elroy_outcome);
      if (!p || p.kind !== 'drone' || p.id !== story.flags.empire_seed_pending_id) return false;
      if (p.templateId !== program.templateId) return false;
      story.flags.empire_seed_asset_id = p.id;
      story.flags.empire_seed_variant = program.id;
      delete story.flags.empire_seed_pending_id;
      delete story.flags.empire_seed_pending_def;
      delete story.flags.deep_reach_asset_lost;
      this._refreshEmbodiedStoryBoards();
      this._refreshNavigation({ forceStory: true, silent: true });
      this._sayStoryLine('Seed rebound. Deep Reach operation reposted.', 5);
      return true;
    }
    if (!story || story.beatIndex !== 6 || !story.flags) return false;
    const program = getEmpireSeedProgram(story.flags.elroy_outcome);
    if (!p || p.kind !== 'drone' || p.id !== story.flags.empire_seed_pending_id) return false;
    if (p.templateId !== program.templateId) {
      this._sayStoryLine(`Assign ${program.templateId.replace(/_/g, ' ')} to this drone.`, 5);
      return false;
    }
    const assetId = p.id;
    story.flags.empire_seed_complete = true;
    story.flags.empire_seed_variant = program.id;
    story.flags.empire_seed_asset_id = assetId;
    delete story.flags.empire_seed_pending_id;
    delete story.flags.empire_seed_pending_def;
    this._storyTrigger('asset_deployed', {
      kind: 'drone', id: assetId, defId: p.defId || null,
      sectorId: p.sectorId || null, templateId: p.templateId, programmed: true,
    });
    if (story.beatIndex === 6) {
      delete story.flags.empire_seed_complete;
      delete story.flags.empire_seed_variant;
      delete story.flags.empire_seed_asset_id;
      return false;
    }
    return true;
  },

  _onContract47aB6AssetLost(p) {
    const story = this.state && this.state.story;
    if (story && story.beatIndex === 7 && story.flags
      && !story.flags.deep_reach_operation_complete
      && p && p.kind === 'drone' && p.id === story.flags.empire_seed_asset_id) {
      story.flags.deep_reach_asset_lost = true;
      delete story.flags.empire_seed_asset_id;
      for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
        const m = this.state.missions.active[i];
        if (m && m.status === 'active' && String(m.storyTag || '').startsWith('campaign47a:b7:')) {
          this._failMission(m, i, 'seed_asset_lost');
        }
      }
      this._refreshNavigation({ forceStory: true, silent: true });
      this._sayStoryLine('Deep Reach seed lost. Deploy a replacement.', 5);
      return true;
    }
    if (!story || story.beatIndex !== 6 || !story.flags) return false;
    if (!p || p.kind !== 'drone' || p.id !== story.flags.empire_seed_pending_id) return false;
    delete story.flags.empire_seed_pending_id;
    delete story.flags.empire_seed_pending_def;
    this._refreshNavigation({ forceStory: true, silent: true });
    this._sayStoryLine('Seed lost. Deploy a replacement drone.', 5);
    return true;
  },

  /** Dock-at-destination objectives: delivery / passenger / salvage / smuggling / escort. These are
   *  boolean-at-dest (no cargo.delivered event exists; cargo is single-writer so we don't inspect it). */
  _onDockedObjectives(stationId) {
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (m.status !== 'active') continue;
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
        // Player reached the destination — complete only if the escortee survived AND arrived too.
        const ok = this._escorteeArrivedOk(m);
        if (ok) this._completeMission(m, i);
        else this.bus.emit('toast', { text: 'Escort: wait for the convoy to dock', kind: 'warn', ttl: 3 });
        continue;
      }

      // Cargo/passenger/salvage/smuggling: require the actual cargo to be aboard, then consume it.
      if (t === 'cargo_delivery' || t === 'passenger_transport'
          || t === 'salvage_retrieval' || t === 'smuggling_run') {
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
  _escorteeArrivedOk(m) {
    if (m._escorteeId == null) return true; // no live escortee to gate on
    const e = this.state.entities.get(m._escorteeId);
    if (!e || !e.alive) return false;       // dead → _onEntityDestroyed will fail it anyway
    return !!m._escorteeArrived;
  },

  /** Delivery/passenger/cargo: verify the required commodity+qty is in the player hold and consume
   *  it via the cargo removeCargo helper. Passenger missions carry no commodity (cmdtyId null) →
   *  always satisfied (the passenger rides in the ship, not the hold). Returns true if delivered. */
  _deliverCargo(m) {
    const p = m.params || {};
    if (!p.cmdtyId) return true; // passenger / abstract cargo — nothing to verify in the hold
    const need = Math.max(1, p.qty || 1);
    const cargo = this.state.player && this.state.player.cargo;
    const have = (cargo && cargo.items && cargo.items[p.cmdtyId]) || 0;
    if (have < need) return false;
    if (m.storyTag === CONTRACT_47A_B0_TAG && Array.isArray(this.state.story && this.state.story.persistentCargo)) {
      this.state.story.persistentCargo = this.state.story.persistentCargo.filter((id) => id !== CONTRACT_47A_SAMPLE_ID);
    }
    // Consume the delivered cargo through the cargo single-writer helper (keeps volume/mass caches sane).
    const removed = removeCargo(this.state, p.cmdtyId, need);
    if (removed <= 0 && m.storyTag === CONTRACT_47A_B0_TAG) {
      const locked = this.state.story.persistentCargo || (this.state.story.persistentCargo = []);
      if (!locked.includes(CONTRACT_47A_SAMPLE_ID)) locked.push(CONTRACT_47A_SAMPLE_ID);
    }
    this.bus.emit('cargo:delivered', { commodityId: p.cmdtyId, qty: removed, missionId: m.id, stationId: m.destStationId });
    return removed > 0;
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
    const fac = m && m.factionId ? FACTION_BY_ID.get(m.factionId) : null;
    return fac ? (fac.short || fac.name) + ' Contract' : 'Contract Board';
  },

  _missionSuccessDebriefText(m) {
    const p = (m && m.params) || {};
    const cargo = this._cmdtyName(p.cmdtyId);
    const dest = this._destName(m);
    if (m && m.source === 'poiBehavior' && p.poiSignalFollowup) {
      const cause = m.cause && m.cause.line ? ` The original ${m.cause.line.toLowerCase()}` : '';
      return `Linked signal confirmed in ${dest}. The registry now connects both sites.${cause}`;
    }
    switch (m && m.type) {
      case 'cargo_delivery':
        return 'Manifest sealed at ' + dest + '. ' + cargo + ' cleared the dock and the client released payment.';
      case 'bulk_trade':
        return 'The shortage at ' + dest + ' is covered for now. Your sale moved the board and the client noticed.';
      case BULK_HAUL_TYPE:
        return 'Bulk ore received at ' + dest + '. The refinery logged the tether-haul and cleared the contract.';
      case 'mining_quota':
        return 'Quota received. The assay office logged ' + cargo + '; the rest of the rock can stay quiet.';
      case 'salvage_retrieval':
        return 'Recovery logged. Useful wreckage became inventory before another crew filed the claim.';
      case 'smuggling_run':
        return 'The cargo disappeared into ' + dest + '\'s books without becoming a customs story.';
      case 'bounty_hunt':
        return 'Tag closed near ' + dest + '. The board will update before the rumor does.';
      case 'escort':
        return 'Convoy arrived at ' + dest + ' intact. That is all the client wanted written down.';
      case 'patrol_clear':
        return 'Lane report is clean. Hostile signatures cleared, trade traffic can pretend it was always safe.';
      case 'recon_scan':
        return 'Scan packet received. The map is now less wrong where it matters.';
      case 'passenger_transport':
        return 'Passenger transferred at ' + dest + '. Their name stays boring on the manifest.';
      default:
        return 'Contract closed. The board released payment and filed the work as routine.';
    }
  },

  _missionLossDebriefText(m, reason) {
    const dest = this._destName(m);
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
    this.bus.emit('comms:popup', {
      sender: this._missionClientName(m),
      text,
      category: success ? 'personal' : 'trap',
      ttl: success ? 8 : 7,
      note: success ? ('Paid ' + (settlement.rewardCr != null
        ? settlement.rewardCr : (m.reward_cr || 0)).toLocaleString('en-US') + ' cr.') : null,
    });
  },

  _compileSetPieceTransition(mission, outcome, reason = null) {
    if (!setPieceCauseOf(mission)) return null;
    return advanceSetPieceMission(this.state, mission, { outcome, reason });
  },

  _boardSetPieceTransition(mission, transition) {
    if (!transition || !transition.receipt) return false;
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
  _completeMission(m, index) {
    const state = this.state;
    if (m.status !== 'active') return;
    // Single choke point for blocking physics terms. The objective may be met, but the contract is
    // not settled until its physical terms are — and the player is told which one and why. The
    // mission stays active and re-settles the moment the term latches (see _onConditionSatisfied).
    if (this._refuseTurnInIfBlocked(m)) { m._settlePending = true; return; }
    if (m._settlePending) delete m._settlePending;
    const setPieceTransition = this._compileSetPieceTransition(m, 'completed');
    const clauseSettlement = settleContractClauses(m);
    const settledRewardCr = clauseSettlement.rewardCr;
    m.status = 'completed';
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
        text: 'PAYMENT WITHHELD — CONTRACT 47-A STATUS: PENDING / OPEN',
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
    if (settledRewardCr > 0) {
      this.bus.emit('economy:grantCredits', { amount: settledRewardCr, reason: `mission:${m.id}` });
    }
    if (m.collateral_cr > 0) {
      this.bus.emit('economy:grantCredits', { amount: m.collateral_cr, reason: `collateral_refund:${m.id}` });
    }

    // ── offering-faction rep: route through mission:completed{repMult} (factions applies 15*repMult).
    // We size repMult so factions' applied rep ≈ the spec's risk-scaled BASE_REP value.
    const specRep = missionSpecRep(m);
    const repMult = specRep / 15;
    const storyOutcome = m.params && m.params.investigationOutcome;
    const completedPayload = {
      missionId: m.id,
      type: m.type,
      factionId: m.factionId,
      repMult,
      source: m.source || undefined,
      causeFingerprint: m.cause && m.cause.fingerprint || undefined,
      causeTag: m.cause && m.cause.tag || undefined,
      rewardCr: settledRewardCr,
      ...setPieceEventFields(m, setPieceTransition),
    };
    if (storyOutcome !== undefined) completedPayload.storyOutcome = storyOutcome;

    // ── research points for cerebral mission types (recon/salvage) — missions is a legit RP writer.
    // Combat fieldwork RP for bounty_hunt is intentionally NOT granted here: early auto-RP + a
    // 6,000cr Combat Basics unlock strands a death-recovered pilot under gate tolls. Hunter
    // combat tech remains recon/salvage-gated; bounty BASE pay is the cash authority for the
    // career ladder.
    let researchPoints = 0;
    if (m.type === 'recon_scan' || m.type === 'salvage_retrieval') {
      const rp = m.type === 'recon_scan' ? (3 + (m.riskTier || 0)) : (1 + (m.riskTier || 0));
      researchPoints = rp;
      state.player.researchPoints = (state.player.researchPoints || 0) + rp;
      this.bus.emit('research:pointsChanged', { researchPoints: state.player.researchPoints });
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

    this._emitMissionDebrief(m, 'completed', null, { rewardCr: displayRewardCr });
    this.bus.emit('toast', { text: `Mission complete: ${m.title} +${displayRewardCr}cr`, kind: 'success', ttl: 4 });
    this._cleanupTargets(m);
    // Keep the settled chain visible while ensureBoard refreshes the destination board. Otherwise
    // a completion that crosses a board epoch can seed a second opening before its next stage lands.
    this._boardSetPieceTransition(m, setPieceTransition);
    this._removeActive(m.id, index);
    this.bus.emit('mission:updated', { missionId: m.id });

    // ── chaining: auto-offer the deterministic next link at the origin board ──
    if (m.chainNextSeed != null) this._tryChain(m);

    // ── story chain progress (B5 branch chains) ──
    this._advanceEmbodiedStoryMission(m);
    this._completeContract47aB4Intro(m);
    this._advanceStoryChain(m);
    this._completeContract47aB7Operation(m);

    this.bus.emit('mission:completed', completedPayload);
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
    return removeCargo(
      this.state, mission.params.cmdtyId, Math.max(1, mission.params.qty || 1),
    );
  },

  _failMission(m, index, reason) {
    if (m.status !== 'active') return;
    const setPieceTransition = this._compileSetPieceTransition(m, 'failed', reason || 'failed');
    m.status = 'failed';
    this._clearMissionNav(m.id);

    // Failure rep penalty to the offering faction. We emit faction:repDelta directly and keep the
    // mission:failed payload factionId-FREE so factions' onMissionLost doesn't ALSO penalise.
    const penalty = missionRepDeltaFor(m, 'failed');
    if (m.factionId && penalty < 0) {
      this.bus.emit('faction:repDelta', { factionId: m.factionId, delta: penalty, reason: `mission_failed:${m.type}` });
    }
    // A preloaded manifest belongs to the failed contract. Remove the remaining sealed quantity
    // through cargo authority so abandoning and reissuing cannot duplicate freight.
    const contractCargoRemoved = this._removePreloadedContractCargo(m);
    // Collateral is forfeited (already charged at accept — nothing to refund).
    this._logCompletion(m.type, 0, false);
    this._recordMissionReceipt(m, 'failed', reason || 'failed', {
      rewardCr: 0,
      collateralLostCr: m.collateral_cr || 0,
      repDelta: penalty,
      contractCargoRemoved,
      setPieceReceipt: setPieceTransition && setPieceTransition.receipt || null,
    });
    this._emitMissionDebrief(m, 'failed', reason || 'failed');
    // Recovery must be physically present before public failure observers run. Those observers may
    // render or inspect the promised next station synchronously from mission:failed.
    this._boardSetPieceTransition(m, setPieceTransition);
    this.bus.emit('mission:failed', {
      missionId: m.id,
      reason: reason || 'failed',
      source: m.source || undefined,
      causeFingerprint: m.cause && m.cause.fingerprint || undefined,
      ...setPieceEventFields(m, setPieceTransition),
    });
    this.bus.emit('toast', { text: `Mission FAILED: ${m.title}`, kind: 'error', ttl: 4 });
    this._recordStoryMissionFailure(m, reason || 'failed');
    this._cleanupTargets(m);
    this._removeActive(m.id, index);
    this.bus.emit('mission:updated', { missionId: m.id });
  },

  _expireMission(m, index) {
    if (m.status !== 'active') return;
    const setPieceTransition = this._compileSetPieceTransition(m, 'expired', 'deadline');
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
    });
    this._emitMissionDebrief(m, 'expired', 'deadline');
    this._boardSetPieceTransition(m, setPieceTransition);
    this.bus.emit('mission:expired', {
      missionId: m.id,
      reason: 'deadline',
      source: m.source || undefined,
      causeFingerprint: m.cause && m.cause.fingerprint || undefined,
      ...setPieceEventFields(m, setPieceTransition),
    });
    this.bus.emit('toast', { text: `Mission expired: ${m.title}`, kind: 'warn', ttl: 4 });
    this._cleanupTargets(m);
    this._removeActive(m.id, index);
    this.bus.emit('mission:updated', { missionId: m.id });
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
    const receipt = missionReceiptFor(m, outcome, reason, { ...settlement, at_s: this.state.simTime || 0 });
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

  // =========================================================================================
  // MISSION-TARGET SPAWNING (lazy, deterministic, no spawn:request consumer exists)
  // =========================================================================================
  /** Spawn bounty/patrol hostiles or the escortee if the player is in the mission's target sector. */
  _ensureMissionTargets(m) {
    if (!m.needsTargets) return;
    if (this.state.world.currentSectorId !== m.destSectorId) return; // defer until the player arrives
    // Continue: adopt rematerialized hosts before deciding to spawn (avoids duplicate targets).
    this._adoptLiveMissionTargets(m);
    if (m.targetEntityIds.length > 0) return;                        // already present (spawned or adopted)
    this._spawnTargetsFor(m);
    this._refreshTrackedMissionNav(m);
  },

  /**
   * Adopt live entities rematerialized from world.records (or still alive with missionTag)
   * into m.targetEntityIds so Continue never double-spawns mission targets.
   * World rematerializes before missions restore; mission deserialize clears targetEntityIds.
   */
  _adoptLiveMissionTargets(m) {
    if (!m || !m.id) return 0;
    const existing = new Set(m.targetEntityIds || []);
    const follow = m.params && m.params.poiSignalFollowup;
    const list = this.state.entityList || [];
    if (follow) {
      const exact = list.filter((e) => e && e.alive && !e.isPlayer && e.data
        && e.data.worldRecordId === follow.targetRecordId);
      exact.sort((a, b) => {
        const an = Number(a.id), bn = Number(b.id);
        if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
        const as = String(a.id), bs = String(b.id);
        return as < bs ? -1 : (as > bs ? 1 : 0);
      });
      const retained = exact.find((e) => e.id === follow.entityId)
        || exact.find((e) => existing.has(e.id))
        || exact[0]
        || null;
      m.targetEntityIds = [];
      if (!retained) {
        follow.entityId = null;
        return 0;
      }
      for (const e of exact) {
        if (e !== retained) e.alive = false;
      }
      this._stampMissionTargetIdentity(retained, m, 0);
      this._configurePoiSignalTarget(retained, m);
      m.targetEntityIds.push(retained.id);
      return existing.has(retained.id) ? 0 : 1;
    }
    let adopted = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || !e.alive || e.isPlayer) continue;
      const mid = missionIdentityOf(e);
      if (mid == null || String(mid) !== String(m.id)) continue;
      // Re-stamp durable mission identity if rematerialize omitted a field.
      this._stampMissionTargetIdentity(e, m, adopted);
      if (existing.has(e.id)) continue;
      existing.add(e.id);
      m.targetEntityIds.push(e.id);
      if (e.data && e.data.escortee) {
        m._escorteeId = e.id;
        m._escorteeArrived = !!m._escorteeArrived;
      }
      adopted++;
    }
    return adopted;
  },

  _configurePoiSignalTarget(ent, m) {
    const follow = m && m.params && m.params.poiSignalFollowup;
    if (!ent || !follow) return false;
    ent.team = 2;
    ent.factionId = null;
    ent.type = follow.targetType;
    ent.collides = false;
    ent.data = ent.data || {};
    ent.data.poiType = follow.targetType;
    ent.data.kind = follow.targetType;
    ent.data.scanLabel = follow.targetLabel;
    ent.data.durable = true;
    delete ent.data.ai;
    follow.entityId = ent.id;
    return true;
  },

  /**
   * Stamp homeSectorId + missionId/missionTag/missionPinned + stable worldRecordId before
   * first demotion so capture/kill/Continue keep one mission-target identity.
   */
  _stampMissionTargetIdentity(ent, m, seq) {
    if (!ent || !m) return;
    if (!ent.data) ent.data = {};
    const sectorId = m.destSectorId
      || ent.homeSectorId
      || ent.data.homeSectorId
      || (this.state.world && this.state.world.currentSectorId);
    ent.data.missionTag = m.id;
    ent.data.missionId = m.id;
    ent.data.missionPinned = true;
    // Accepted combat contracts are the authored authority that makes their tagged quarry a
    // legal hostile. Stamp the existing scanner/engagement context here so fresh spawns and
    // Continue-adopted targets agree, without widening ambient team mismatch into hostility.
    // Lawful actors still resolve through scanner's earlier WANTED/securityTargetId gate.
    if ((m.type === 'bounty_hunt' || m.type === 'patrol_clear') && ent.data.ai) {
      const ai = ent.data.ai;
      const playerId = this.state.playerId;
      const player = this.state.entities && this.state.entities.get(playerId);
      ai.spawnContext = 'mission';
      ai.squadId = `mission:${m.id}`;
      ai.preferredRole = 'attack';
      ai.motive = 'accepted_combat_contract';
      ai.engagementTrigger = 'accepted_warrant';
      ai.zoneId = ent.data.storyTargetZoneId || m.storyTarget && m.storyTarget.zoneId || ai.zoneId;
      if (player && player.team != null) {
        ai.hostileTeams = [player.team];
      }
    }
    ent.flags = ent.flags || {};
    ent.flags.missionPinned = true;
    if (sectorId) {
      ent.homeSectorId = sectorId;
      ent.data.homeSectorId = sectorId;
      if (ent.data.sectorId == null) ent.data.sectorId = sectorId;
    }
    if (ent.data.worldRecordId || !sectorId) return;
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const key = `mission:${m.id}:${seq | 0}`;
    ent.data.worldRecordId = stableRecordId(seed, sectorId, RECORD_KIND.MISSION_TARGET, key);
    ent.data.identityKey = key;
    ent.data.durable = true;
    ent.data.recordCreatedTick = this.state.tick | 0;
  },

  /**
   * Acceptance makes the quarry legally hostile, but does not make it chase a player out of a
   * station berth. Once the player crosses beyond lawful protection, bind the accepted mission's
   * exact live target into the tactical activity/combat seam. This is deliberately mission-owned:
   * ambient ships and unaccepted lookalikes never receive this lock.
   */
  _armAcceptedCombatTargets(m, state = this.state) {
    if (!m || m.status !== 'active' || (m.type !== 'bounty_hunt' && m.type !== 'patrol_clear')) return 0;
    const player = state && state.entities && state.entities.get(state.playerId);
    if (!player || player.alive === false || protectedStationAt(state, player)) return 0;
    let armed = 0;
    for (const id of m.targetEntityIds || []) {
      const ent = state.entities.get(id);
      const data = ent && ent.data;
      const ai = data && data.ai;
      if (!ent || ent.alive === false || !ai || ai.lawful || ai.passive) continue;
      if (String(missionIdentityOf(ent)) !== String(m.id)) continue;
      const activity = ai.activity;
      if (activity && activity.targetId !== player.id) {
        ai.activity = Object.freeze({ ...activity, targetId: player.id });
      }
      const combat = data.combat || (data.combat = {});
      if (combat.targetId !== player.id) combat.targetId = player.id;
      armed++;
    }
    return armed;
  },

  _spawnTargetsFor(m) {
    const helpers = this.helpers;
    if (!helpers || !helpers.spawnEntity) return;
    // Prefer live rematerialized hosts (Continue) over fresh spawns.
    this._adoptLiveMissionTargets(m);
    const player = helpers.player ? helpers.player() : this.state.entities.get(this.state.playerId);
    const px = player ? player.pos.x : 0, pz = player ? player.pos.z : 0;
    const seed = helpers.hash32 ? helpers.hash32(this.state.meta.seed, m.id, this._spawnSeq++) : (this._spawnSeq++ + 1);
    const rng = helpers.mulberry32 ? helpers.mulberry32(seed) : mulberryLocal(seed);
    const sector = SECTOR_BY_ID.get(m.destSectorId);
    const [lvLo, lvHi] = sector ? (sector.enemyLevel || [2, 4]) : [2, 4];

    const follow = m.params && m.params.poiSignalFollowup;
    if (follow) {
      if (m.targetEntityIds.length > 0) return;
      const spec = {
        type: follow.targetType,
        factionId: null,
        team: 2,
        pos: { x: follow.targetPos.x, z: follow.targetPos.z },
        vel: { x: 0, z: 0 },
        rot: rng() * Math.PI * 2,
        radius: follow.targetType === 'anomaly' ? 24 : 18,
        mass: follow.targetType === 'anomaly' ? 1 : 50,
        hull: 1,
        hullMax: 1,
        collides: false,
        flags: { noInterp: true, missionPinned: true, durable: true },
        data: {
          worldRecordId: follow.targetRecordId,
          identityKey: `mission:${m.id}:poi-signal`,
          homeSectorId: m.destSectorId,
          sectorId: m.destSectorId,
          durable: true,
          missionId: m.id,
          missionTag: m.id,
          missionPinned: true,
          poiType: follow.targetType,
          kind: follow.targetType,
          scanLabel: follow.targetLabel,
        },
      };
      const ent = helpers.spawnEntity(spec);
      if (ent) {
        this._stampMissionTargetIdentity(ent, m, 0);
        this._configurePoiSignalTarget(ent, m);
        m.targetEntityIds.push(ent.id);
        this.bus.emit('mission:updated', { missionId: m.id, targetEntityId: ent.id });
      }
      return;
    }

    if (m.type === 'bounty_hunt' || m.type === 'patrol_clear') {
      // Spawn only the targets still owed (objectiveTarget - progress) so a mid-mission save/load or
      // partial clear doesn't re-spawn already-killed hostiles and leave an orphan.
      // Adopted rematerialized hosts count toward the remaining quota.
      const remaining = Math.max(0, (m.objectiveTarget || 1) - (m.objectiveProgress || 0));
      const adopted = (m.targetEntityIds || []).length;
      const want = m.type === 'patrol_clear' ? remaining : Math.min(1, remaining);
      const n = Math.max(0, want - adopted);
      if (n <= 0) return;
      // Early boards must not roll mid-tier corsairs. Risk-tier pools keep first-hour TTK fair
      // with the starter Pulse Laser S; higher risk opens tougher hulls.
      const riskTier = Math.max(0, Math.round(Number(m.riskTier) || 0));
      const pool = riskTier <= 1
        ? ['wasp_swarmer', 'wasp_swarmer', 'reaver_pirate']
        : riskTier <= 2
          ? ['wasp_swarmer', 'reaver_pirate', 'reaver_pirate']
          : riskTier <= 3
            ? ['reaver_pirate', 'reaver_pirate', 'corsair_raider', 'wasp_swarmer']
            : ['reaver_pirate', 'corsair_raider', 'corsair_raider', 'bruiser_brawler'];
      for (let i = 0; i < n; i++) {
        const storyTarget = i === 0 && m.storyTarget ? m.storyTarget : null;
        const typeId = storyTarget && storyTarget.archetype || pool[Math.floor(rng() * pool.length)];
        const level = Math.round(lvLo + (lvHi - lvLo) * (0.4 + rng() * 0.6));
        const pos = storyTarget
          ? missionStoryTargetSpawnPos(m, storyTarget, rng)
          : missionHostileSpawnPos(this.state, { x: px, z: pz }, rng);
        if (!pos) continue;
        const spec = makeEnemySpawnSpec(typeId, level, pos, {
          factionId: storyTarget && storyTarget.factionId,
          startedTick: this.state.tick,
        });
        spec.data = spec.data || {};
        spec.data.missionTag = m.id; // attribution helper (kill resolver matches by entity id below)
        if (storyTarget) {
          spec.data.storyTargetId = storyTarget.id || null;
          spec.data.storyTargetRole = storyTarget.role || null;
          spec.data.storyTargetZoneId = storyTarget.zoneId || null;
          spec.data.registry = storyTarget.registry || null;
          spec.data.name = storyTarget.name || null;
          spec.data.scanLabel = storyTarget.label || storyTarget.name || 'UNKNOWN';
          if (storyTarget.lastRegisteredOwner) {
            spec.data.lastRegisteredOwner = storyTarget.lastRegisteredOwner;
          }
          if (storyTarget.salvageCargo) {
            spec.data.salvageCargo = storyTarget.salvageCargo;
          }
          spec.data.ai = spec.data.ai || {};
          spec.data.ai.name = storyTarget.name || storyTarget.label || null;
        }
        // B5 paperwork plant: first proving-chain hostile always carries Vale Holdings salvage,
        // including embodied patrol captains that ship a named storyTarget.
        if (i === 0 && m.storyTag && String(m.storyTag).startsWith('campaign47a:b5:')) {
          if (!spec.data.lastRegisteredOwner) spec.data.lastRegisteredOwner = 'VALE HOLDINGS LLC';
          if (!spec.data.salvageCargo) {
            spec.data.salvageCargo = 'ADMINISTRATIVE RECORDS — 3 YEARS / SEALED';
          }
          if (!spec.data.registry || spec.data.registry === storyTarget?.registry) {
            // Prefer owner stamp for inspect; keep scan label identity from captain if present.
            if (!storyTarget) spec.data.registry = 'VALE HOLDINGS LLC';
          }
        }
        const ent = helpers.spawnEntity(spec);
        if (ent) {
          this._stampMissionTargetIdentity(ent, m, adopted + i);
          m.targetEntityIds.push(ent.id);
          if (storyTarget && storyTarget.namedCaptainId) {
            this.bus.emit('encounter:namedCaptainBound', {
              captainId: storyTarget.namedCaptainId, entityId: ent.id,
              missionId: m.id, sectorId: m.destSectorId,
            });
          }
        }
      }
    } else if (m.type === 'escort') {
      // Already adopted a live escortee from world.records — do not double-spawn.
      if (m._escorteeId != null && this.state.entities.get(m._escorteeId)) return;
      if ((m.targetEntityIds || []).length > 0) return;
      // Real escortee: a friendly (team 0) ship that TRAVELS toward the destination. It needs to
      // survive (mission fails if it dies — _onEntityDestroyed) and arrive (gates completion).
      const ang = rng() * Math.PI * 2, r = 60 + rng() * 40;
      const pos = { x: px + Math.cos(ang) * r, z: pz + Math.sin(ang) * r };
      const spec = makeEnemySpawnSpec('corsair_raider', Math.round((lvLo + lvHi) / 2), pos, { startedTick: this.state.tick });
      spec.team = 0; spec.factionId = m.factionId; // player team (won't be auto-attacked by allies)
      spec.data = spec.data || {};
      spec.data.missionTag = m.id; spec.data.escortee = true;
      // No data.ai → the AI system skips it (it requires data.ai); WE steer it via data.intent in
      // update() so it heads for the destination instead of dogfighting. Seed a neutral intent.
      delete spec.data.ai;
      spec.data.intent = { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0 };
      const ent = helpers.spawnEntity(spec);
      if (ent) {
        this._stampMissionTargetIdentity(ent, m, 0);
        m._escorteeId = ent.id;
        m._escorteeArrived = false;
        m.targetEntityIds.push(ent.id);
      }
    }
    if (m.targetEntityIds.length) this.bus.emit('mission:updated', { missionId: m.id });
  },

  /** Drive an escortee ship toward the destination station (or sector centre). Writes data.intent
   *  which flight consumes; marks m._escorteeArrived when it reaches the dock ring. Deterministic
   *  (pure geometry — no RNG). */
  _steerEscortee(m, state, dt) {
    const e = state.entities.get(m._escorteeId);
    if (!e || !e.alive) return;
    const intent = e.data.intent || (e.data.intent = { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0 });
    intent.fire = false; intent.fireGroup = null;

    // Destination point: the dest station entity if it's loaded in the current sector, else the
    // player (so the escortee tags along until the player jumps it into the destination sector).
    let target = null;
    const inDestSector = state.world.currentSectorId === m.destSectorId;
    if (inDestSector) {
      const byStationId = state.entityIndex && state.entityIndex.byStationId;
      target = byStationId && m.destStationId ? byStationId.get(m.destStationId) : null;
      if (!target || !target.alive || target.type !== 'station') {
        const stations = (state.entityIndex && state.entityIndex.stations) || state.entityList;
        target = null;
        for (const cand of stations) {
          if (cand.alive && cand.type === 'station' && cand.data && cand.data.stationId === m.destStationId) { target = cand; break; }
        }
      }
    }
    if (!target) {
      const player = state.entities.get(state.playerId);
      target = player && player.alive ? player : null;
    }
    if (!target) { intent.moveX = 0; intent.moveZ = 0; return; }

    const dx = target.pos.x - e.pos.x, dz = target.pos.z - e.pos.z;
    const dist = Math.hypot(dx, dz) || 1e-4;
    const arriveR = (target.type === 'station' ? (target.data && target.data.dockRadius) || 80 : 140) + 40;
    const aim = Math.atan2(dz, dx);
    intent.aimAngle = aim;
    if (dist <= arriveR) {
      // arrived: ease to a hover near the dock and flag arrival (gates player-dock completion)
      intent.moveZ = 0; intent.moveX = 0; intent.boost = false;
      if (inDestSector && target.type === 'station') m._escorteeArrived = true;
    } else {
      // head straight in; boost to close a large gap so it keeps pace with the player
      const off = Math.abs(wrapAngleLocal(aim - e.rot));
      intent.moveZ = off < 1.2 ? 1 : 0.35;   // throttle down while still turning to face the line
      intent.moveX = 0;
      intent.boost = dist > 700 && off < 0.6;
    }
  },

  /** Mark mission target entities dead when the mission settles (avoid orphans). */
  _cleanupTargets(m) {
    const follow = m.params && m.params.poiSignalFollowup;
    const world = this.registry && this.registry.get && this.registry.get('world');
    if (follow && world && typeof world.markWorldRecordDestroyed === 'function') {
      world.markWorldRecordDestroyed(follow.targetRecordId, {
        outcome: m.status === 'completed' ? 'investigated' : 'destroyed',
        reason: 'mission_settled',
      });
    }
    const targetIds = new Set(m.targetEntityIds || []);
    if (follow) {
      for (const e of this.state.entityList || []) {
        if (e && e.data && e.data.worldRecordId === follow.targetRecordId) targetIds.add(e.id);
      }
    }
    for (const id of targetIds) {
      const e = this.state.entities.get(id);
      if (e && e.alive && e.id !== this.state.playerId) e.alive = false; // swept end-of-step
    }
    m.targetEntityIds = [];
    m._escorteeId = null;
  },

  _onSectorEnter(p) {
    const sectorId = p && p.sectorId;
    if (!sectorId) return;
    this.spawnTargetsForSector(sectorId);
    this._emitSetPieceTravelLine(sectorId);
    this._refreshNavigation({ preferStory: true });
    this._storyTrigger('sector', { sectorId });
  },

  _emitSetPieceTravelLine(sectorId) {
    for (const mission of this.state.missions.active || []) {
      const cause = setPieceCauseOf(mission);
      if (!cause || cause.archetypeId !== 'witness_run' || cause.stageIndex < 1) continue;
      if (mission.status !== 'active' || mission.destSectorId !== sectorId) continue;
      if (!cause.travelText || cause.travelLineSpoken) continue;
      // The once flag lives in the normal active cause and therefore survives the ordinary mission
      // save path without a witness-run sidecar.
      cause.travelLineSpoken = true;
      this.bus.emit('comms:popup', {
        sender: cause.witnessName || 'Witness',
        text: cause.travelText,
        category: 'personal',
        ttl: 8,
      });
      this.bus.emit('mission:setPieceTravelLine', {
        missionId: mission.id,
        witnessId: cause.witnessId || null,
        witnessName: cause.witnessName || null,
        text: cause.travelText,
        ...setPieceEventFields(mission),
      });
    }
  },

  spawnTargetsForSector(sectorId) {
    if (!sectorId) return;
    // Spawn (or re-spawn after load) deferred targets for any active mission keyed to this sector.
    // Continue order: world rematerializes mission_target records first; adopt those live IDs
    // before any fresh spawn so targetEntityIds (cleared on deserialize) do not duplicate.
    for (const m of this.state.missions.active) {
      if (m.status !== 'active' || !m.needsTargets) continue;
      if (m.destSectorId !== sectorId) continue;
      m.targetEntityIds = m.targetEntityIds.filter((id) => {
        const e = this.state.entities.get(id); return e && e.alive;
      });
      this._adoptLiveMissionTargets(m);
      if (m.targetEntityIds.length === 0 && (m.objectiveProgress < m.objectiveTarget)) {
        this._spawnTargetsFor(m);
      }
    }
  },

  _onSectorExit(p) {
    const sectorId = p && p.sectorId;
    if (!sectorId) return;
    // PQ-019C: mark the run BEFORE any continuous-handoff early-return below. `entity:destroyed` is
    // the generic "left the world" event, so without this a player who simply flew out of Tethys
    // would be told the capsule was destroyed rather than lost. See heistMissionRuntime.onSectorExit.
    this._heistEach((h) => heistMissionRuntime.onSectorExit(this._heistCtx(), h, sectorId));
    // Continuous free-flight membership handoff: keep escorts, target ids, and escortee links.
    // World residency may still demote RECORD_ONLY entities; enter re-spawns missing targets.
    // Hard teardown only for intentional jump / load / non-continuous boundaries (M2-C1).
    if (p && (p.continuous || p.noTeleport)) return;

    // Escort abandoned (hard boundary only): live dest-sector rule — if the player intentionally
    // leaves the escort destination while an escortee is in flight, the contract is voided.
    for (let i = this.state.missions.active.length - 1; i >= 0; i--) {
      const m = this.state.missions.active[i];
      if (m.status !== 'active' || m.type !== 'escort') continue;
      if (m._escorteeId != null && m.destSectorId === sectorId) {
        this._failMission(m, i, 'escort_abandoned');
      }
    }
    // Targets in the exited sector are despawned by world on hard leave; clear ids for re-spawn.
    for (const m of this.state.missions.active) {
      if (m.needsTargets && m.destSectorId === sectorId) { m.targetEntityIds = []; m._escorteeId = null; }
    }
  },

  // =========================================================================================
  // CHAINING (store seeds, not live instances — survives save/load)
  // =========================================================================================
  _tryChain(m) {
    const def = TYPE_BY_ID.get(m.type);
    if (!def || !def.chainable || m.chainNextSeed == null) return;
    const originInfo = STATION_INFO.get(m.stationId) || STATION_INFO.get(m.destStationId);
    if (!originInfo) return;
    const board = this.ensureBoard(originInfo.id);
    if (!board) return;
    const rng = this.helpers.mulberry32 ? this.helpers.mulberry32(m.chainNextSeed >>> 0) : mulberryLocal(m.chainNextSeed >>> 0);
    const next = this._rollOffer(m.type, originInfo, rng, board.refreshEpoch, board.slots.length);
    if (next) {
      next.id = `${next.id}_chain`;
      board.slots.push(next);
      this.bus.emit('toast', { text: 'Follow-up contract available', kind: 'info', ttl: 3 });
      this.bus.emit('mission:updated', { missionId: null });
    }
  },

  // =========================================================================================
  // STORY SPINE — 8-beat FSM advanced by first-X triggers (+ credit/net-worth gates).
  // =========================================================================================
  /** A gameplay event happened that may satisfy the current story beat's trigger. */
  _storyTrigger(kind, data) {
    const story = this.state.story;
    if (!story) return;
    this._ensureCampaignSidecar();
    const beat = STORY_BEATS[story.beatIndex];
    if (!beat) return; // past the end → sandbox

    // Sidecar step/fail recovery observer (never advances beatIndex itself).
    const signal = STORY_SIGNAL_BY_KIND[kind];
    const stepResult = signal
      ? recordBeatStep(this.state, signal, data || {}, this.state.simTime || 0)
      : null;

    // B0 is ordered AND: mining:yield then dock:docked — gate on isBeatStepsComplete.
    if (beat.beat === 0) {
      if (isBeatStepsComplete(this.state, 0)) this._advanceStory(beat);
      return;
    }

    const want = BEAT_TRIGGER[beat.beat];
    if (!want) return;
    // B1/B2 are embodied board contracts and advance in _advanceEmbodiedStoryMission.
    if (beat.beat === 1 || beat.beat === 2) return;
    // Discrete first-X triggers (B3/B6). B4/B5/B7 handled elsewhere.
    if (want === kind && stepResult && stepResult.ok
        && isBeatStepsComplete(this.state, beat.beat)) {
      this._advanceStory(beat);
    }
  },

  /** Complete B1/B2 only through the authored 47-A contracts. Sidecar observes first; missions
   * remains the sole cursor and reward authority. */
  _advanceEmbodiedStoryMission(m) {
    const story = this.state && this.state.story;
    const beat = story && STORY_BEATS[story.beatIndex];
    if (!beat || !m || !m.storyTag) return false;
    const expected = beat.beat === 1 ? 'campaign47a:b1:honest_work'
      : beat.beat === 2 ? 'campaign47a:b2:elroy' : null;
    if (!expected || m.storyTag !== expected) return false;
    this._ensureCampaignSidecar();
    // Continue/adapter compatibility: older B2 instances may settle through the missions owner
    // without the new live scanner receipt. Their pre-existing meaning was a force resolution, so
    // stamp that deterministic outcome and satisfy the ordered identity step from the wreck record.
    if (beat.beat === 2 && !(m.params && m.params.investigationOutcome)) {
      m.params = m.params || {};
      m.params.investigationStage = 'identified';
      m.params.identifiedBy = 'legacy_wreck_registry';
      m.params.investigationOutcome = 'force';
      story.flags = story.flags || {};
      story.flags.elroy_outcome = 'force';
      story.flags.elroy_outcome_legacy = true;
      recordBeatStep(this.state, 'entity:killed', {
        missionId: m.id,
        storyTag: m.storyTag,
        storyTargetId: m.storyTarget && m.storyTarget.id || null,
      }, this.state.simTime || 0);
    }
    const signal = beat.beat === 1 ? 'mission:completed'
      : m.params && m.params.investigationOutcome === 'custody' ? 'tether:reel' : 'entity:killed';
    const observed = recordBeatStep(this.state, signal, {
      missionId: m.id,
      storyTag: m.storyTag,
      storyTargetId: m.storyTarget && m.storyTarget.id || null,
    }, this.state.simTime || 0);
    if (!observed || !observed.ok || !isBeatStepsComplete(this.state, beat.beat)) return false;
    this._advanceStory(beat, { skipCredits: true });
    return true;
  },

  /** B5 branch-chain progress: completing a branch mission ticks chainProgress toward the goal. */
  _advanceStoryChain(m) {
    const story = this.state.story;
    const beat = STORY_BEATS[story.beatIndex];
    if (!beat || beat.beat !== 5 || !story.branch) return;
    const wantType = BRANCH_CHAIN_TYPE[story.branch];
    const wantCount = BRANCH_CHAIN_COUNT[story.branch];
    const expectedTag = `campaign47a:b5:${story.branch}:`;
    const route = getEmbodiedLocation(5, story.branch);
    // Exact-route compatibility keeps pre-tag Continue missions viable without restoring the old
    // type-only shortcut: faction, origin, and destination must all match the authored leg.
    const legacyExactRoute = !m.storyTag && route
      && m.factionId === BRANCH_FACTION[story.branch]
      && m.stationId === route.stationId
      && m.destStationId === route.destStationId
      && m.destSectorId === route.destSectorId;
    if (m.type !== wantType || !(m.storyTag && m.storyTag.startsWith(expectedTag)) && !legacyExactRoute) return;
    const nextProgress = (story.chainProgress || 0) + 1;
    // Gate canonical chain progress through the sidecar failure/recovery state first.
    // The sidecar still never advances the live cursor or grants a reward.
    this._ensureCampaignSidecar();
    const observed = recordBeatStep(this.state, 'mission:completed', {
      missionType: m.type,
      branch: story.branch,
      chainProgress: nextProgress,
    }, this.state.simTime || 0);
    if (!observed || !observed.ok) return;
    story.chainProgress = nextProgress;
    if (story.chainProgress >= wantCount) {
      story.flags = story.flags || {};
      story.flags.proving_ground_complete = true;
      story.flags.proving_ground_variant = story.flags.elroy_outcome === 'custody' && story.branch === 'patrol'
        ? 'custody_patrol'
        : story.flags.elroy_outcome === 'force' && story.branch === 'traders'
          ? 'force_manifest'
          : `legacy_${story.branch}`;
      story.chainProgress = 0;
      this._advanceStory(beat);
    }
    else {
      this._refreshEmbodiedStoryBoards();
      this._refreshNavigation({ forceStory: true, silent: true });
      this.bus.emit('toast', { text: `Proving Ground: ${story.chainProgress}/${wantCount}`, kind: 'info', ttl: 3 });
    }
  },

  /** B4: accepting a live intro commits the stake; live player routes settle on completion. */
  _maybeSetBranch(inst) {
    const story = this.state.story;
    const beat = STORY_BEATS[story.beatIndex];
    if (!beat || beat.beat !== 4 || story.branch) return;
    if (!isStoryBranchIntroOffer(inst, this.state)) return;
    const branch = inst.storyBranch || Object.keys(BRANCH_FACTION).find((b) => BRANCH_FACTION[b] === inst.factionId);
    if (!branch || BRANCH_FACTION[branch] !== inst.factionId || !BRANCH_INTRO_BY_BRANCH.has(branch)) return;
    const legacy = !!(story.flags && story.flags.elroy_outcome_legacy) || !(story.flags && story.flags.elroy_outcome);
    const stake = getPickSideStake(story.flags && story.flags.elroy_outcome);
    if (!legacy && (branch !== stake.branch || inst.factionId !== stake.factionId || inst.type !== stake.type)) return;
    // Sidecar observes/gates the live intro accept before canonical branch/reward mutation.
    this._ensureCampaignSidecar();
    const observed = recordBeatStep(this.state, 'mission:accepted', {
      storyTag: STORY_BRANCH_INTRO_TAG,
      type: inst.type,
      factionId: inst.factionId,
      branch,
      storyBranch: branch,
    }, this.state.simTime || 0);
    if (!observed || !observed.ok || !isBeatStepsComplete(this.state, 4)) return;
    inst.storyTag = STORY_BRANCH_INTRO_TAG;
    inst.storyBranch = branch;
    if (legacy) {
      this._settleContract47aB4Branch(inst, branch, true);
      return;
    }
    story.flags.pick_a_side_pending = branch;
    story.flags.pick_a_side_stake = stake.id;
    inst.storyStake = stake.id;
    this._sayStoryLine('Contract accepted. Complete it before the branch settles.', 6);
  },

  _completeContract47aB4Intro(m) {
    const story = this.state && this.state.story;
    if (!story || story.beatIndex !== 4 || story.branch || !m) return false;
    if (m.storyTag !== STORY_BRANCH_INTRO_TAG || !m.storyBranch) return false;
    if (!story.flags || story.flags.pick_a_side_pending !== m.storyBranch) return false;
    return this._settleContract47aB4Branch(m, m.storyBranch, false);
  },

  _settleContract47aB4Branch(m, branch, legacy) {
    const story = this.state && this.state.story;
    const beat = story && STORY_BEATS[story.beatIndex];
    if (!beat || beat.beat !== 4 || story.branch) return false;
    if (!branch || BRANCH_FACTION[branch] !== m.factionId || !BRANCH_INTRO_BY_BRANCH.has(branch)) return false;
    if (!legacy && (!story.flags || story.flags.pick_a_side_pending !== branch)) return false;
    story.branch = branch;
    story.flags = story.flags || {};
    delete story.flags.pick_a_side_pending;
    if (!story.flags.pick_a_side_stake) story.flags.pick_a_side_stake = getPickSideStake(story.flags.elroy_outcome).id;
    // B4 reward: chosen faction +15, opposing -10 through canonical faction intents.
    this.bus.emit('faction:repDelta', { factionId: m.factionId, delta: 15, reason: 'story_branch' });
    const opposing = branch === 'patrol' ? 'faction_free' : (branch === 'free' ? 'faction_scn' : 'faction_dmc');
    this.bus.emit('faction:repDelta', { factionId: opposing, delta: -10, reason: 'story_branch_opposing' });
    this._advanceStory(beat);
    return true;
  },

  _completeContract47aB7Operation(m) {
    const story = this.state && this.state.story;
    const beat = story && STORY_BEATS[story.beatIndex];
    if (!beat || beat.beat !== 7 || !m || story.flags && story.flags.deep_reach_operation_complete) return false;
    if (!String(m.storyTag || '').startsWith('campaign47a:b7:')) return false;
    const assetId = m.params && m.params.assetId;
    if (!assetId || !story.flags || assetId !== story.flags.empire_seed_asset_id) return false;
    const op = getDeepReachOperation(story.flags.elroy_outcome);
    if (m.storyOperation !== op.id || m.type !== op.type) return false;
    story.flags.deep_reach_operation_complete = true;
    story.flags.deep_reach_variant = op.id;
    story.flags.deep_reach_asset_id = assetId;
    this._advanceStory(beat);
    return true;
  },

  /** Credit / net-worth gated beats: show a hint while unmet, advance once met (never hard-block). */
  _checkStoryGates() {
    const story = this.state.story;
    const beat = STORY_BEATS[story.beatIndex];
    if (!beat) return;
    const credits = this.state.player.credits | 0;
    if (beat.beat === 7) {
      const legacy = !!(story.flags && story.flags.elroy_outcome_legacy) || !(story.flags && story.flags.elroy_outcome);
      if (!legacy) return;
      // North star: 100k net worth AND rep>=50 with chosen faction.
      const netWorth = this._netWorth();
      const facRep = story.branch ? this._repOf(BRANCH_FACTION[story.branch]) : this._maxRep();
      if (netWorth >= 100000 && facRep >= 50) this._advanceStory(beat);
    }
    // B3 (buy T2 hull) and B6 (deploy asset) advance on their discrete triggers (ship_purchased /
    // asset_deployed) via _storyTrigger; the precredits is only a soft hint (handled at advance).
  },

  _advanceStory(beat, options = {}) {
    const story = this.state.story;
    if (story.beatIndex !== beat.beat) return; // already advanced
    const fromIndex = story.beatIndex;
    // Grant beat reward (credits + rep + unlock flag).
    if (beat.reward) {
      if (beat.reward.credits && !options.skipCredits) this.bus.emit('economy:grantCredits', { amount: beat.reward.credits, reason: `story:${beat.id}` });
      if (beat.reward.rep) {
        const rep = beat.reward.rep;
        if (rep.faction) {
          const fac = rep.faction === 'home' ? HOME_FACTION : rep.faction;
          this.bus.emit('faction:repDelta', { factionId: fac, delta: rep.amount || 0, reason: `story:${beat.id}` });
        }
        // (B4's chosen/opposing handled in _maybeSetBranch so it isn't double-applied here.)
      }
      if (beat.reward.unlock && beat.reward.unlock !== 'module_unlock' && beat.reward.unlock !== 'trade_tutorial'
          && beat.reward.unlock !== 'passive_income' && beat.reward.unlock !== 'newgame_plus') {
        // Mark an unlock flag the player record / ships can read; story:beatAdvanced also signals it.
        story.flags[`unlock_${beat.reward.unlock}`] = true;
      }
    }
    story.flags[`beat_${beat.beat}_done`] = true;
    const toIndex = beat.next != null ? beat.next : story.beatIndex; // null next → stay (sandbox)
    story.beatIndex = beat.next != null ? beat.next : story.beatIndex;
    if (beat.next == null) story.flags.endgame = true;

    this.bus.emit('story:beatAdvanced', { fromIndex, toIndex, branch: story.branch || undefined });
    if (toIndex === 4) this._refreshStoryBranchIntroBoards();
    this._refreshEmbodiedStoryBoards();
    // Sidecar observes canonical advance (clears fail context for new beat; never writes rewards).
    this._syncCampaignSidecarAfterAdvance();
    // Direction toast: tell the player what the NEW current beat wants.
    // NOTE: the sandbox fallback (past B7) deliberately does NOT grant a title. Per
    // ENDGAME-B7-REDESIGN.md, "None of these choices is rewarded with a title." The story system
    // (src/systems/story.js) presents the five endgame choices on the B7 gate; this line is only the
    // spine's terminal state, kept neutral so the endgame overlay owns the disposition.
    const nextBeat = STORY_BEATS[story.beatIndex];
    this._refreshNavigation({ forceStory: true, silent: true });
    const dir = (nextBeat && story.beatIndex !== fromIndex) ? BEAT_HINT[nextBeat.beat] : 'The contracts continue. The count never ends.';
    if (dir) this._sayStoryLine(dir, 6);
    this.bus.emit('mission:updated', { missionId: null });
  },

  /** Lazily attach campaign47a sidecar under state.story (meta only). */
  _ensureCampaignSidecar() {
    const state = this.state;
    if (!state.story) state.story = { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 };
    ensureCampaign47aState(state);
  },

  /** Sync observedBeatIndex after missions advances the live spine. */
  _syncCampaignSidecarAfterAdvance() {
    const state = this.state;
    this._ensureCampaignSidecar();
    syncObservedBeat(state, state.simTime || 0);
  },

  /**
   * Story-relevant mission failure → namespaced sidecar fail (no beat advance, no director receipt).
   * Recovery is via dock/reoffer signals through recordBeatStep → recoverEncounter cooldown.
   */
  _recordStoryMissionFailure(m, reason) {
    const story = this.state && this.state.story;
    if (!story) return;
    const bi = story.beatIndex | 0;
    if (bi < 0 || bi > 7) return;
    // B7 is observe-only metadata. Losing the bound seed fails/reposts the physical mission, but
    // must not strand the ending sidecar in a failed state after the replacement is rebound.
    if (bi === 7 && reason === 'seed_asset_lost') return;
    // Relevant when tagged story contract, branch chain, or any active spine beat.
    const tagged = !!(m && (m.storyTag || m.storyBranch));
    const chainType = story.branch ? BRANCH_CHAIN_TYPE[story.branch] : null;
    const onChain = !!(chainType && m && m.type === chainType);
    if (!tagged && !onChain) return;
    this._ensureCampaignSidecar();
    failEncounter(this.state, reason || 'mission_failed', this.state.simTime || 0, {
      encounterId: m && m.id != null ? String(m.id) : null,
    });
    const line = recoveryCommsForBeat(bi);
    if (line) {
      this.bus.emit('comms:popup', {
        sender: line.sender,
        text: line.text,
        category: 'story',
        ttl: 7,
        persist: false,
        id: `${line.id}:${m && m.id || 'mission'}`,
      });
    }
  },

  // =========================================================================================
  // small read helpers
  // =========================================================================================
  _repOf(factionId) {
    const rec = factionId && this.state.factions ? this.state.factions[factionId] : null;
    return rec ? (rec.rep || 0) : 0;
  },
  _maxRep() {
    let m = 0; const f = this.state.factions || {};
    for (const id in f) m = Math.max(m, f[id].rep || 0);
    return m;
  },
  /** Net worth ≈ credits (cheap approximation for the B7 north star; ship/asset value omitted). */
  _netWorth() {
    return this.state.player.credits | 0;
  },
  _sayStoryLine(text, ttl = 6) {
    if (!text) return false;
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      const said = voice.say({ channel: 'story', text, kind: 'story', ttl });
      if (said) return true;
    }
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('toast', { text, kind: 'story', ttl });
      return true;
    }
    return false;
  },

  _findOffer(missionId) {
    const boards = this.state.missions.boards;
    for (const sid in boards) {
      const b = boards[sid];
      const offer = (b.slots || []).find((o) => o.id === missionId);
      if (offer) return { offer, board: b };
    }
    return { offer: null, board: null };
  },

  // =========================================================================================
  // newGame / save-load (§4.5 — missions + story serialize; live target ids do NOT)
  // =========================================================================================
  _installThreadBFragment() {
    const state = this.state;
    if (!state || !state.player || !state.player.cargo) return;
    state.story = state.story || {};
    const locked = state.story.persistentCargo || (state.story.persistentCargo = []);
    if (!locked.includes(THREAD_B_FRAGMENT_ID)) locked.push(THREAD_B_FRAGMENT_ID);
    const have = Number(state.player.cargo.items && state.player.cargo.items[THREAD_B_FRAGMENT_ID]) || 0;
    if (have < 1) addCargo(state, THREAD_B_FRAGMENT_ID, 1);
  },

  _installContract47aColdStart() {
    if ((this.state.missions.active || []).some((m) => m && m.storyTag === CONTRACT_47A_B0_TAG)) return;
    const offer = {
      id: 'contract_47a_b0_recovery',
      type: 'salvage_retrieval',
      stationId: 'station_helios',
      factionId: null,
      params: {
        cmdtyId: CONTRACT_47A_SAMPLE_ID,
        qty: 1,
        sampleRecovered: false,
        samplePos: null,
        massAcceptT: CONTRACT_47A_B0_BODY.massAcceptT,
        massDeliverT: CONTRACT_47A_B0_BODY.massDeliverT,
        authorization: CONTRACT_47A_B0_BODY.authorization,
        code: CONTRACT_47A_B0_BODY.code,
        contractId: CONTRACT_47A_B0_BODY.contractId,
      },
      reward_cr: 0,
      collateral_cr: 0,
      riskTier: 0,
      destStationId: 'station_helios',
      destSectorId: 'sector_helios_prime',
      distance: 600,
      storyTag: CONTRACT_47A_B0_TAG,
      campaign47aBeat: 0,
      title: CONTRACT_47A_B0_BODY.title,
      summary: CONTRACT_47A_B0_BODY.summary,
      description: CONTRACT_47A_B0_BODY.fullText,
      authorization: CONTRACT_47A_B0_BODY.authorization,
    };
    const mission = this._instanceFromOffer(offer);
    mission.chainNextSeed = null;
    mission.description = CONTRACT_47A_B0_BODY.fullText;
    mission.authorization = CONTRACT_47A_B0_BODY.authorization;
    this.state.missions.active.push(mission);
    this.state.ui = this.state.ui || {};
    this.state.ui.trackedMissionId = mission.id;
    // Track the cold-start contract, but leave nav free while the staged tutorial owns the opening
    // waypoint (onboarding builds markerId/onboarding:true). After tutorial:finished, release
    // restores mission/story navigation ownership.
    if (!this._tutorialOwnsOpening()) this._refreshTrackedMissionNav(mission);
    this.bus.emit('mission:updated', { missionId: mission.id, tracked: true, source: CONTRACT_47A_B0_TAG });
  },

  _activateContract47aB1OnDeparture() {
    const story = this.state && this.state.story;
    if (!story || story.beatIndex !== 1) return false;
    const active = (this.state.missions.active || []).find((m) => m && m.status === 'active' && m.storyTag === CONTRACT_47A_B1_TAG);
    if (active) {
      this.trackMission(active.id, { silent: true });
      return true;
    }
    const board = this.ensureBoard('station_helios');
    const offer = board && board.slots && board.slots.find((row) => row && row.storyTag === CONTRACT_47A_B1_TAG);
    if (!offer) return false;
    return this.acceptMission(offer.id);
  },

  _activateContract47aB2OnDeparture() {
    const story = this.state && this.state.story;
    if (!story || story.beatIndex !== 2) return false;
    const active = (this.state.missions.active || []).find((m) => m && m.status === 'active' && m.storyTag === CONTRACT_47A_B2_TAG);
    if (active) {
      this.trackMission(active.id, { silent: true });
      return true;
    }
    const board = this.ensureBoard('station_tethys');
    const offer = board && board.slots && board.slots.find((row) => row && row.storyTag === CONTRACT_47A_B2_TAG);
    if (!offer) return false;
    return this.acceptMission(offer.id);
  },

  newGame() {
    const state = this.state;
    state.missions.boards = {};
    state.missions.active = [];
    state.missions.completedLog = [];
    state.missions.receipts = [];
    delete state.missions.setPieceSettlements;
    state.missions.nextId = 1;
    state.missions.config = MISSION_TUNING;
    // Clear story spine + any prior campaign47a sidecar (nested under state.story).
    state.story = { beatIndex: 0, branch: null, flags: {}, chainProgress: 0, persistentCargo: [] };
    initCampaignSidecar(state, state.simTime || 0);
    this._installThreadBFragment();
    this._installContract47aColdStart();
    this._spawnSeq = 0;
    this._navRefreshT = 0;
    this._lastWaypointRouteKey = null;
    this._lastWaypointRouteAt = 0;
    const tutorialOwnsOpening = this._tutorialOwnsOpening();
    if (!tutorialOwnsOpening) {
      this._refreshNavigation({ forceStory: true, silent: true });
    }
    // Direction toast for the opening beat (guard against the double newGame call: save.newGame()
    // then game:started both fire it → only toast once).
    const toastKey = state.meta && state.meta.seed;
    if (this._newGameToastSeed !== toastKey) {
      this._newGameToastSeed = toastKey;
      const b0 = STORY_BEATS[state.story.beatIndex];
      if (!tutorialOwnsOpening && b0 && BEAT_HINT[b0.beat]) this._sayStoryLine(BEAT_HINT[b0.beat], 6);
    }
  },

  _tutorialOwnsOpening() {
    const gameplay = this.state && this.state.settings && this.state.settings.gameplay;
    if (gameplay && gameplay.tutorialHints === false) return false;
    const ob = this.state && this.state.onboarding;
    return !ob || (ob.active && !ob.finished) || ob.finished === false;
  },

  /** True only while the staged tutorial is actively teaching — not the pre-init / unfinished-flag
   *  breadth of _tutorialOwnsOpening. Used to suppress mission/story nav claims without breaking
   *  headless harnesses that never materialize an onboarding subtree. */
  _onboardingOwnsOpeningNav() {
    const gameplay = this.state && this.state.settings && this.state.settings.gameplay;
    if (gameplay && gameplay.tutorialHints === false) return false;
    const ob = this.state && this.state.onboarding;
    return !!(ob && ob.active && !ob.finished);
  },

  serialize() {
    const m = this.state.missions;
    // Strip transient runtime fields (entity ids) from active missions.
    const active = (m.active || []).map((a) => {
      const { targetEntityIds, _escorteeId, _escorteeSectorId, _escorteeArrived, ...rest } = a;
      const row = { ...rest, targetEntityIds: [], needsTargets: a.needsTargets };
      // PQ-019C: canonical, order-stable snapshot of the heist subrecord. It rides INSIDE the active
      // entry this owner already serializes, so there is no new top-level save key and no schema
      // bump. Live entity ids inside it are transient and are dropped on restore, not here.
      if (a.heist) row.heist = heistMissionRuntime.serialize(a.heist);
      return row;
    });
    const serialized = {
      boards: m.boards, active, completedLog: m.completedLog, receipts: normalizeMissionReceipts(m.receipts),
      nextId: m.nextId, config: m.config || MISSION_TUNING,
      story: this.state.story,
    };
    const setPieceSettlements = normalizeSetPieceSettlements(m.setPieceSettlements, m.receipts);
    if (Object.keys(setPieceSettlements).length) serialized.setPieceSettlements = setPieceSettlements;
    // Optional extension state must preserve absence for reduced headless registries that do not
    // register careerContracts; materializing a null key only after reload changes sim hashes.
    if (m.careerContracts) {
      serialized.careerContracts = JSON.parse(JSON.stringify(m.careerContracts));
    }
    if (m.postEndingReplay) {
      serialized.postEndingReplay = JSON.parse(JSON.stringify(m.postEndingReplay));
    }
    return serialized;
  },

  deserialize(data) {
    if (!data) return;
    const state = this.state;
    state.missions.boards = data.boards || {};
    state.missions.completedLog = data.completedLog || [];
    state.missions.receipts = normalizeMissionReceipts(data.receipts);
    const setPieceSettlements = normalizeSetPieceSettlements(data.setPieceSettlements, state.missions.receipts);
    if (Object.keys(setPieceSettlements).length) state.missions.setPieceSettlements = setPieceSettlements;
    else delete state.missions.setPieceSettlements;
    state.missions.nextId = data.nextId || 1;
    state.missions.config = data.config || MISSION_TUNING;
    if (Object.prototype.hasOwnProperty.call(data, 'careerContracts')) {
      state.missions.careerContracts = data.careerContracts
        ? JSON.parse(JSON.stringify(data.careerContracts)) : null;
    } else {
      delete state.missions.careerContracts;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'postEndingReplay')) {
      state.missions.postEndingReplay = data.postEndingReplay
        ? JSON.parse(JSON.stringify(data.postEndingReplay)) : null;
    } else {
      delete state.missions.postEndingReplay;
    }
    // Stale-target GC: clear live entity ids; targets re-spawn when the player (re-)enters the sector.
    const heistRestoreTick = state.tick | 0;
    state.missions.active = (data.active || []).map((a) => {
      const row = {
        ...a, targetEntityIds: [], _escorteeId: null, _escorteeArrived: false,
        status: a.status || 'active',
      };
      // PQ-019C: rebuild the arbiter and reconcile against a world that does not remember the
      // capsule. `state.heistFacilities` and `state.lawSecurity` are NOT in the save capture plan
      // (PQ-019B §4) and the capsule is a transient entity, so after a load there is no schedule, no
      // capsule and no custody record. The rule is explicit in heistMissionRuntime.restore: resume a
      // decided receipt, re-request a never-launched schedule, and otherwise reach
      // `unresolved_absent`. Never fabricate a capsule and never fabricate a payout.
      if (a && a.heist) row.heist = heistMissionRuntime.restore(a.heist, { tick: heistRestoreTick });
      return row;
    });
    if (data.story) state.story = data.story;
    // Sidecar lives inside already-serialized state.story — migrate/init without save schema change.
    ensureCampaign47aState(state);
    syncObservedBeat(state, state.simTime || 0);
    // Drop active missions whose destination no longer resolves (soft-lock guard).
    state.missions.active = state.missions.active.filter((m) => {
      if (m.destStationId && !STATION_INFO.get(m.destStationId) && m.destStationId !== m.stationId) {
        // unresolved dest station — but sector-only objectives still fine; keep if sector resolves
        return !!SECTOR_BY_ID.get(m.destSectorId);
      }
      return true;
    });
    this._refreshNavigation({ forceStory: true, silent: true });
  },
};

// ── Receipt helpers (module-scope, derived from shared mission tuning) ───────────────────────

function normalizeMissionReceipts(value) {
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
function normalizeSetPieceSettlements(value, receipts = []) {
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
  };
}

function missionHostileSpawnPos(state, origin, rng) {
  const center = origin || { x: 0, z: 0 };
  for (let attempt = 0; attempt < MISSION_HOSTILE_SPAWN_ATTEMPTS; attempt++) {
    const ang = rng() * Math.PI * 2;
    const r = MISSION_HOSTILE_SPAWN_MIN_WU + rng() * (MISSION_HOSTILE_SPAWN_MAX_WU - MISSION_HOSTILE_SPAWN_MIN_WU);
    const pos = { x: center.x + Math.cos(ang) * r, z: center.z + Math.sin(ang) * r };
    if (outsideMissionPortSafety(state, pos)) return pos;
  }
  return null;
}

/** Place an authored target inside its named sector zone so the ordinary entity:killed event can
 * create a real aftermathWrecks marker. Zone centers are sector-local; live entities are global. */
function missionStoryTargetSpawnPos(mission, target, rng) {
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
    const radius = Math.sqrt(rng()) * (Number.isFinite(authoredRadius)
      ? Math.max(0, Math.min(320, authoredRadius))
      : 120);
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

function outsideMissionPortSafety(state, pos) {
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

function distSq(a, b) {
  const dx = (a && a.x || 0) - (b && b.x || 0);
  const dz = (a && a.z || 0) - (b && b.z || 0);
  return dx * dx + dz * dz;
}

// Story-beat trigger kind (first-X model). B0 is ordered multi-step (mine then dock) via sidecar.
// Gate-only beats (4/5/7) use branch accept / chain count / credit-rep gates.
const BEAT_TRIGGER = {
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
const STORY_SIGNAL_BY_KIND = {
  mine: 'mining:yield',
  trade: 'economy:tradeCompleted',
  kill: 'entity:killed',
  ship_purchased: 'ship:purchased',
  asset_deployed: 'asset:deployed',
  dock: 'dock:docked',
};

// Per-branch B5 chain requirements (spec B5).
const BRANCH_CHAIN_TYPE = { traders: 'bulk_trade', patrol: 'patrol_clear', free: 'smuggling_run' };
const BRANCH_CHAIN_COUNT = { traders: 3, patrol: 2, free: 2 };

// Direction hints shown when a beat becomes current (Captain's Log north star).
const BEAT_HINT = {
  0: 'Cold Start: mine ore from an asteroid field, then dock to sell or deliver it.',
  1: 'Honest Work: accept Kessler\'s sealed alloy run from the Helios board.',
  2: 'First Blood: close Rook\'s UNKNOWN tag in the Charon ambush zone.',
  3: 'Bigger Boat: earn credits and buy a bigger hull at a shipyard.',
  4: 'Pick a Side: accept an intro contract from a faction to choose your path.',
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
function wrapAngleLocal(a) {
  a = a % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  else if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

// ── local PRNG fallback (only if core helpers absent, e.g. isolated unit test) ────────────────
function mulberryLocal(a) {
  a >>>= 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
