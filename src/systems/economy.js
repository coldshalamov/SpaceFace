import { settleCinderglassResult } from '../features/cinderglassJob/ownerSeams.js';
import { winnowCarrierHandoffReady } from '../world/vestaWinnowRecovery.js';
// economy system — stock-based market economy + SOLE writer of state.player.credits.
// Contract: ARCHITECTURE §0.6 (single-writer credits), §0.12/§0.13 (cargo: volume is the only
// hard cap), §3.6 (economy schema), §4.4 (master event table), design/specs/03-economy-trading.md.
//
// MODEL (reconciled with the spec's worked-route shape — see "PRICING NOTE" below):
//   Each station S owns a market: cmdtyId -> MarketEntry {stock, equilibrium, baseEq, role,
//   lastMid, lastBuy, lastSell, eventMods}. Price is a pure function of (stock / baseEq):
//     mid = basePrice * clamp((stock/baseEq)^(-elasticity), 0.40, 2.60)
//   - baseEq      = pricing reference (baseEqDefault * sizeFactor). At stock==baseEq, mid==basePrice.
//   - equilibrium = stock DRIFT TARGET (role- & event-modified). Producers drift stock ABOVE baseEq
//                   (surplus -> cheap, they sell what they make); consumers drift BELOW (shortage ->
//                   dear, they buy what they need). This surplus/shortage gradient is what makes
//                   A->B routes profitable. Role factors are intentionally milder than the 1.x
//                   2.0/0.35 pair so freestyle freight cannot compound unbounded while missions
//                   and discovery routes still read as profitable.
//   Buy = mid*(1+spread/2), Sell = mid*(1-spread/2). Large trades move stock unit-by-unit (closed-
//   form integral of the price curve), so each route has a capacity sweet spot (diminishing margin).
//
//   PRICING NOTE: §3.6's literal `effectiveEq = baseEq*roleFactor*...` used as BOTH the price
//   reference AND the drift target collapses every market to basePrice (stock drifts to eq, price
//   uses eq -> ratio 1). The worked-route shape (producer cheap, consumer dear; large lots self-
//   impact) only holds when the price reference is the FIXED baseEq and the role multiplies the
//   stock target. We honor the schema field names (equilibrium = role-modified drift target,
//   baseEq = fixed reference). Absolute early ROI is now moderated for M3 career parity.
import { COMMODITIES } from '../data/commodities.js';
import { TALLY_THREE, tallyThreeSource } from '../data/tallyThree.js';
import { ILEX_ARK, validIlexOutcome } from '../data/ilexArk.js';
import { ECONOMY_BALANCE as BALANCE } from '../data/economyDerived.js';

import { stationInfo, toleratesContraband } from '../economy/stationMarketProfile.js';
export { salvageBaySaleAllowsIllicit } from '../economy/stationMarketProfile.js';
import { averageBoundedPrice, normalizedTradeQuantity, settleCredits, commodityStandingMultipliers } from '../economy/economyMath.js';
import { resourceIntent, restoreResourceWork, serializeResourceWork } from '../economy/economyResources.js';
import { createEconomyPulse, recordEconomyPulse, recordEconomyCash, restoreEconomyPulse, economyPulseReport } from '../economy/economyPulse.js';
import { presenceServiceForStation } from '../data/factionPresence.js';
import { hasTethysBlackMarketAccess, TETHYS_BLACK_MARKET_RUN } from '../data/frontierRumors.js';
import { KILL_REWARD_RECIPES } from '../data/killRewards.js';
import { STORY_BEATS } from '../data/missions.js';
import { RESEARCH_GRANTS } from '../data/researchGrants.js';
import { SECTORS } from '../data/sectors.js';
import { planSurveyFix, commitSurveyFix, openSurveyFix, soldBearingOpen, bearingCharted, SURVEY_FIX_PRICE } from './surveyFix.js';
import { FACTION_META } from '../data/factions.js';
import { BOLUS_SECTOR_ID, BOLUS_STATION_ID } from '../data/theBolus.js';
import { SHIPS } from '../data/ships.js';
import {
  STATION_CONDITION_LAW, STATION_CREW_ROLES, liveStationConditions, stationServiceMult, stationTradeMults, stationTradeMultParts,
  stationRefuelRationU, grudgeLive, splitStationConditionsForSave, stationGrudgeOwedCr,
} from '../economy/stationConditions.js';
import { ECON_CONTRACT_THRESHOLDS } from '../data/economyContractTemplates.js';
import { effectiveDangerTierFor } from './sectorSim.js';
import { isSwarmGlass } from '../ui/swarmGlass.js';
import {
  FIRST_UPGRADE,
  FIRST_UPGRADE_MINUTES,
  TARGET_FIRST_UPGRADE_MINUTES,
  TECH_VERB_LADDER,
  VERB_LADDER_RATES,
  assertCommittedLadder,
  firstEarnedRow,
  purchaseAffordableTech,
  treePathCost,
  verbIdsOf,
} from '../data/techVerbLadder.js';
import { RECIPES } from '../data/mining.js';
import { drawSeeded, hash32, mulberry32 } from '../core/rng.js';
import { missionOwnsReward, runOwnsReward } from '../combat/rewardEligibility.js';
import { addCargo, removeCargo, removeSalvageBayCargo, reservedCargoQuantity, sellableCargoQuantity, slotFitFor } from './cargo.js';
import { boundCommittedIntents, ensureCommittedIntents } from './cargoCustody.js';
import { outpostCommodity } from './outpostOperations.js';
import {
  ECONOMY_EVENT_TYPES, EVENT_CELL_S, EVENT_PROFILES, DENT_DEV_LO, DENT_DEV_HI,
  marketMidAt, marketAvgMidAt, eventSpreadAt, eventsAffecting,
  activeStationEvents, scheduledEventForEpoch, imposedRunForEvent, MARKET_GOOD_POOL,
  shelfUnitsAt, shelfRestockSeconds, appendDent, dentHalfLifeS,
  marketContextFor, marketRowsFor, marketHistoryFor, marketForecastFor,
  marketRegimeStateFor, economyLiveEvents, stationLiveEvents,
  listingDefFor, regimeLabel, sectorEventContext,
} from '../economy/marketModel.js';
import {
  onboardIllicitCargo,
  readSmugglingCapabilities,
  scanChance,
  clamp01,
  hotUntilActive,
  HOT_DURATION_S,
  FINE_MULT,
  BRIBE_FRAC,
} from '../economy/customsRisk.js';
import {
  CONVOY_SHARE_LAW,
  FORWARD_SLIP_LAW,
  POD_INTAKE_LAW,
  MARKET_AUDIT_LAW,
  COLD_CHAIN_LAW,
  stableShareId,
  stableSlipId,
  quoteConvoyShare,
  quoteForwardSlip,
  settleForwardSlip,
  podIntakeValueCr,
  auditorScanMultiplier,
  coldChainSpoilQty,
  isColdChainCommodity,
  inboundFreightLanes,
} from '../economy/freightCausality.js';
import { exposedDeadDropStacks, takeExposedDeadDrop } from './boreDeadDrop.js';
import { pressureRecipesForRegion } from '../economy/regionalSupply.js';
import { createSectorDemandProjector, effectiveDemandFor } from '../economy/demandModel.js';
import { priceModForState, rankFromRep, rankServiceDiscount } from './factions.js';
import { swarmCrossoverServiceDiscount } from '../data/swarmCrossover.js';
import { endingStationTradeMults } from '../story/endings/worldAfter.js';
import { LONG_BERTH_STATION_ID, berthStageDef } from '../data/longBerth.js';
import { livingHullGrimeAt } from '../core/livingHull.js';
import { fittedModuleDefs } from '../core/fittedModules.js';
import { counted } from '../core/numberFormat.js';

import { contaminationSaleMult } from '../data/alienEcology.js'; // AE-077/078 biohazard market policy

// ---- tunables (design/specs/03 "Formulas") ------------------------------------------------
// M3 courier/freight balance (2026-07): produce=2.0 / consume=0.35 at baseEq=1000 left a permanent
// ~85% freestyle margin with <1% price impact on starter-scale lots, so same-sector arbitrage
// compounded through 90 minutes (saleProceeds dominated missions). Causal levers (not Courier tax):
//   1) milder produce/consume stock targets compress structural route spreads;
//   2) moderately shallower baseEq makes freighter lots move the book (capacity sweet spot);
//   3) slightly slower drift keeps flooded/drained lanes cooler between hauls.
// Generated work-budget projections. Stock depth varies by commodity, not just station size.
const BASE_EQ_DEFAULT = BALANCE.market.baseEqDefault;
const ROLE_FACTOR = BALANCE.market.roleFactor;
const SIZE_FACTOR = { S: 0.5, M: 1, L: 2 };
const PRICE_MULT_LO = BALANCE.market.priceLo, PRICE_MULT_HI = BALANCE.market.priceHi;
const SPREAD_BASE = BALANCE.market.spread;
const SPREAD_LO = 0.04, SPREAD_HI = 0.40;
const FRONTIER_SPREAD_BONUS = 0.06;
// ECON-BUILD-1: the market itself no longer ticks. Prices are a closed form of
// (seed, station, good, t) — see src/economy/marketModel.js — evaluated on read.
// What remains on a clock is the cheap bookkeeping sweep (station conditions,
// market-play timers, event edges, docked intel) on the old 5 s cadence so the
// driven listeners (achievements, contracts, broadcast, wrecks) keep the receipt
// they were built around.
const MARKET_SWEEP_S = 5;
const MAX_EVENTS_PER_STATION = 3;
// Event types are persisted in saves and later rendered by the market chart. The canonical
// set lives in the market model (scheduled types plus the legacy injected ones).
export { ECONOMY_EVENT_TYPES };
const ECONOMY_EVENT_TYPE_SET = new Set(ECONOMY_EVENT_TYPES);
// Restore bound for the persisted active-event list. Live generation already caps at
// MAX_EVENTS_PER_STATION per berth; the save slice only needs the newest few dozen so a
// crafted history cannot rehydrate an unbounded event stack.
const ECON_EVENTS_CAP = 64;
// Dynamic rows drop ~2 h after their end — the imposed aftermath regime has run its
// course by then and the row is dead weight in the save.
const EVENT_PRUNE_S = 7200;
// An event's physical signature: the shelf dent it stamps at tStart (fraction of
// equilibrium). Negative strips stock (shortage, lost convoy, cordon), positive
// floods it (surplus, new mine, strike).
const EVENT_DENT_FRAC = Object.freeze({
  shortage: -0.85, convoy_lost: -0.80, blockade: -0.60,
  piracy: -0.50, piracy_spike: -0.50, war_front: -0.50,
  boom: 0.80, new_mine: 0.90, strike: 0.70,
});
// The chart samples every 15 seconds and keeps roughly sixteen minutes. A new campaign is
// pre-seeded from the live formula, so the first dock reads like a market with a past rather than
// a blank instrument waiting for the player to stand around.
const HISTORY_SAMPLE_S = 15;
const HISTORY_POINT_LIMIT = 64;
const HISTORY_SPAN_S = HISTORY_SAMPLE_S * (HISTORY_POINT_LIMIT - 1);
const HISTORY_REGIME_AGE_MIN_S = HISTORY_SPAN_S + HISTORY_SAMPLE_S * 4;
const HISTORY_REGIME_AGE_MAX_S = HISTORY_SPAN_S + HISTORY_SAMPLE_S * 18;
const BASE_SCAN = 0.25;            // p_scan = clamp(BASE_SCAN*(1+security) - cloak, 0.02, 0.95)
const SCAN_LO = 0.02, SCAN_HI = 0.95;
const DEBT_STALE_DAYS = 2;          // unpaid debt older than this starts converting to bounty
const DEBT_TO_BOUNTY_DAILY_FRAC = 0.25; // posted bounty grows by this fraction of debt per stale day
// FB-049 — a note is bounded by what you already hold plus the standing the berth's faction
// extends; a stranger with an empty hull still gets the base note.
const LOAN_BASE_CR = 800;
const LOAN_NET_WORTH_FRAC = 0.35;
const LOAN_REP_STEP_CR = 500;
const LOAN_CAP_CR = 10000;
// FB-124 — a cargo policy prices on the legal manifest at this berth, lasts one trip, and pays
// the covered fraction of what a defeat actually destroys. Contraband is never insurable.
const CARGO_POLICY_BASE_RATE = 0.08;
const CARGO_POLICY_DANGER_MULT = 0.5;
const CARGO_POLICY_COVER_FRAC = 0.6;
// FB-101 — the hardship floor: the smallest fill that can still make a jump, once a day, filed
// as debt. BASE_FUEL·LY·tier lands a real shortest leg at ~4–8u; eight covers it.
export const EMERGENCY_FUEL_U = 8;
// A penniless hull can buy enough welding on its note to leave the berth and work again.
// This is a daily survival floor; ordinary repairs still charge the full missing protection.
export const EMERGENCY_REPAIR_HULL_FRAC = 0.25;

/**
 * The zero-credit weld the berth will file on the note right now — one formula shared by the
 * repair handler (which files it) and the dock service quote (which offers it). Pure read.
 * `bookedHull` is hull already queued on the yard for this pilot.
 */
export function emergencyRepairReserve(state, entity, bookedHull = 0) {
  const hullMax = Number(entity && entity.hullMax) || 0;
  const hull = Number(entity && entity.hull) || 0;
  const missHull = Math.max(0, hullMax - hull - (Number(bookedHull) || 0));
  const day = state && Number.isInteger(state.days)
    ? state.days : Math.floor((Number(state && state.simTime) || 0) / 600);
  const stored = state && state.player && state.player.emergencyRepairBudget;
  const budget = stored && stored.day === day ? stored : { day, usedHull: 0 };
  const floor = hullMax * EMERGENCY_REPAIR_HULL_FRAC;
  const allowance = Math.max(0, floor - (Number(budget.usedHull) || 0));
  const reserve = Math.min(missHull, allowance, Math.max(0, floor - hull - (Number(bookedHull) || 0)));
  return { day, budget, floor, allowance, reserve };
}
export const TRADE_LEDGER_MAX = 10;
const SALVAGE_INTAKE_RECEIPT_CAP = 256;
const NPC_SALVAGE_INTAKE_COMMODITY_ID = 'cmdty_scrap_metal';
const NPC_SALVAGE_INTAKE_STATION_TYPES = new Set(['refinery', 'fab']);
// The save:loaded refresh is sliced across this many adjacent listeners so the restore's
// emit-slice drain can yield between ~4ms units instead of paying one ~30ms task.
const ECONOMY_SAVE_LOADED_SLICES = 8;


/** Return the canonical persisted event type, or null for an unrecognized save value. */
export function normalizeEconomyEventType(value) {
  if (typeof value !== 'string') return null;
  const type = value.trim().toLowerCase();
  return ECONOMY_EVENT_TYPE_SET.has(type) ? type : null;
}

export function normalizeRestoredEconomyEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const type = normalizeEconomyEventType(value.type);
  if (!type) return null;
  // New row shape: bounded window + typed multipliers, queried on demand.
  if (Number.isFinite(value.tStart) || Array.isArray(value.goods)) {
    const tStart = Number.isFinite(value.tStart) ? value.tStart : 0;
    const tEnd = Number.isFinite(value.tEnd) ? value.tEnd : tStart;
    if (!(tEnd > tStart)) return null;
    return {
      ...value, type, tStart, tEnd,
      goods: Array.isArray(value.goods)
        ? value.goods.filter((g) => typeof g === 'string')
        : null,
      levelMult: Number.isFinite(value.levelMult) ? value.levelMult : 1,
      spreadMult: Number.isFinite(value.spreadMult) ? value.spreadMult : 1,
      regime: typeof value.regime === 'string' ? value.regime : null,
    };
  }
  // Legacy shape (startT + duration + per-field eventMods) migrates into the row
  // model: the window is real and the type's canonical profile carries the
  // strength the authored mods approximated per field.
  const startT = Number.isFinite(value.startT) ? value.startT : 0;
  const dur = Number.isFinite(value.duration) && value.duration > 0 ? value.duration : 0;
  if (!(dur > 0)) return null;
  const profile = EVENT_PROFILES[type] || EVENT_PROFILES.shortage;
  let spreadMult = 1;
  for (const m of (Array.isArray(value.mods) ? value.mods : [])) {
    if (m && m.field === 'spread' && Number.isFinite(m.mult)) spreadMult *= m.mult;
  }
  return {
    id: String(value.id || 'evt'), type, cause: value.cause || type,
    stationId: value.stationId, sectorId: value.sectorId || null,
    goods: value.commodityId && value.commodityId !== '*' ? [value.commodityId] : null,
    tStart: startT, tEnd: startT + dur,
    levelMult: (profile.level[0] + profile.level[1]) / 2,
    spreadMult: clamp(spreadMult, 1, 3) !== 1 ? clamp(spreadMult, 1, 3)
      : (profile.spread[0] + profile.spread[1]) / 2,
    regime: profile.regime || null,
    scheduled: false,
  };
}

export const ECONOMY_PRICE_TUNING = Object.freeze({
  baseEqDefault: BASE_EQ_DEFAULT,
  roleFactor: Object.freeze({ ...ROLE_FACTOR }),
  sizeFactor: Object.freeze({ ...SIZE_FACTOR }),
  priceMultLo: PRICE_MULT_LO,
  priceMultHi: PRICE_MULT_HI,
  spreadBase: SPREAD_BASE,
  spreadLo: SPREAD_LO,
  spreadHi: SPREAD_HI,
});

// service prices — used by ui:service refuel/repair/ammo/hull_wash
const FUEL_UNIT_CR = 6;            // cr per fuel unit
const REPAIR_HP_CR = 0.9;          // cr per hull/armor point restored
const AMMO_UNIT_CR = 12;           // cr per munition
export const AMMO_BATCH = 100;     // munitions per ammo purchase — the dock verb's default fill
const HULL_WASH_CR = 75;           // cosmetic berth service; history survives the wash
// PQ-155.03 sink: a Pitborn yard buys out a claimed salvage right at a premium over a medium
// kill's chip line (2 chips × 60–120 cr). Rights stay scarce by mint, not by a cheap sink.
const SALVAGE_RIGHT_CR = 150;
export const SERVICE_PRICES = Object.freeze({
  fuelCrPerUnit: FUEL_UNIT_CR,
  repairCrPerHp: REPAIR_HP_CR,
  ammoCrPerUnit: AMMO_UNIT_CR,
  hullWashCr: HULL_WASH_CR,
  salvageRightCr: SALVAGE_RIGHT_CR,
});

/**
 * Docked-service unit price after the standing discount — the one source the quote layer and
 * the charge both read, so the number on the button is the number the yard takes. The rank
 * that matters is the player's standing with the docked station's own faction; only a docked
 * service honors it, so the off-station emergency reserve and depot running costs stay at list.
 * A proven Swarm Yard Chit rides beside standing under the same docked-only rule — the crossover
 * ledger's own credential, stacked on whatever the berth's faction already grants (SWARM-06 §8).
 */
export function serviceUnitCr(state, baseCr, service = null) {
  const stationId = state && state.ui && state.ui.dockedStationId;
  const info = stationId ? stationInfo(state, stationId) : null;
  // THE WORLD REMEMBERS — a strike makes the yard costlier, a boom makes it cheaper. Only a named
  // yard service ('repair' | 'refuel') reads the berth's condition.
  const condition = stationId && service ? stationServiceMult(state, stationId, service) : 1;
  const chit = stationId ? swarmCrossoverServiceDiscount() : 0;
  return baseCr * (1 - rankServiceDiscount(state, info && info.factionId)) * (1 - chit) * condition;
}

/**
 * Whether the docked berth actually runs this service — the contract the yard's own
 * enqueue gate enforces (stationServices.enqueuePlayerJob refuses a job the berth does not
 * offer) and the quote layer is expected to mirror. A berth whose row is missing, or whose
 * services list is absent or empty, offers nothing: 'unknown' must never read as 'all verbs'.
 */
export function stationOffersService(state, service, berthId = null) {
  const stationId = berthId || (state && state.ui && state.ui.dockedStationId);
  if (!stationId) return false;
  // The Long Berth is a runtime berth that never sits in the sector catalog: its offer set is
  // the restored stage's own grant list — a pump and patch rail exist only once stage 3 hangs
  // them, and the un-restored tug sells no services at all.
  if (stationId === LONG_BERTH_STATION_ID) {
    const stage = Number(state && state.longBerth && state.longBerth.stage) || 0;
    const def = berthStageDef(stage);
    const services = def && Array.isArray(def.services) ? def.services : [];
    return services.includes(service);
  }
  const info = stationInfo(state, stationId);
  if (!info || !Array.isArray(info.services) || !info.services.length) return false;
  return info.services.includes(service);
}

/** Live hull-insurance defaults. The deductible is the named sink PQ-155.01 reads. */
export const INSURANCE_DEFAULTS = Object.freeze({
  rate: 0.6,
  deductibleCr: 500,
});

/**
 * §15.6 C6 — mass slam × station. A body the PLAYER threw (rope release, concussion shove, a
 * hull knocked loose) going through a berth's docking ring is the station's problem and then
 * the player's: dock control files a fine against the note, the repair bay is down while the
 * ring is cleared, the insurer notices, and the berth's faction remembers. Mass and closing
 * speed decide every number — a scrape is nothing, a thrown wreck is a bill. The player's own
 * hull bumping a station is never a slam (collisionConsequences never routes the player hull
 * as a struck target, and this rule only reads thrown bodies).
 */
export const DOCK_SLAM_LAW = Object.freeze({
  // Pre-solve closing speed below which a station contact is a scrape, not a slam. Shares the
  // terrain crumple threshold (TERRAIN_CRUMPLE_LAW.threshold) so "would have crumpled a hull on
  // a rock" and "put a hull through a ring" are the same speed.
  closingSpeedMin: 30,
  // A chip or a pickup bouncing off a ring is not a slam; a fighter-class body or heavier is.
  massMin: 8,
  // Fine = mass × closing speed × this, bounded. A light (16) at 40 WU/s files 150 (the floor);
  // a medium (60) at 60 WU/s files 288; a 200-ton wreck at 80 WU/s files 1280.
  finePerMomentum: 0.08,
  fineMinCr: 150,
  fineMaxCr: 2500,
  // "Repair services down ten minutes" — sim seconds the yard refuses welds after a slam.
  repairOutageS: 600,
  // The insurer's answer: the deductible climbs by this factor per slam, capped at twice the
  // default. It never resets by itself — the premium is the memory.
  deductibleBump: 1.2,
  deductibleMaxMult: 2,
  // The berth's faction takes it personally, a little.
  repDelta: -2,
  // One slam per (station, body) inside this many sim seconds: a hull that rebounds and kisses
  // the ring again a tick later is the same event, not a second bill.
  relatchS: 6,
});

/**
 * THE WORLD REMEMBERS — stationConditionsFor(state, stationId) -> the live conditions at a berth
 * ({ outage, strike, boom, grudge, blockade }, each null when not live) or null when nothing is.
 * Stored conditions live in `state.economy.stationConditions[stationId]` (see
 * src/economy/stationConditions.js for the record shape); the blockade is derived on read from
 * the factions-owned `state.conflicts`, so it is never stored or saved.
 */
export function stationConditionsFor(state, stationId) {
  return liveStationConditions(state, stationId, stationId ? stationInfo(state, stationId) : null);
}

/** Units of fuel the docked pumps will still deliver right now (Infinity unless blockaded). */
export function stationRefuelRation(state, stationId, fuel) {
  return stationId ? stationRefuelRationU(state, stationId, stationInfo(state, stationId), fuel) : Infinity;
}

/**
 * stationServiceOutage(state, stationId, service) -> { untilSimTime, cause, remainingS } | null.
 * The one read for "is this berth's yard down right now" — now an alias over the station-condition
 * record (`outageRepairUntil`), with the legacy `stationOutages[id].<service>Until` shape still
 * honored on read. Economy writes outages (dock slams); the service handler and the UI quote read them.
 */
export function stationServiceOutage(state, stationId, service) {
  if (!state || !stationId) return null;
  if (service === 'repair') {
    const live = liveStationConditions(state, stationId, null);
    return live && live.outage
      ? { untilSimTime: live.outage.untilSimTime, cause: live.outage.cause, remainingS: live.outage.remainingS }
      : null;
  }
  const legacy = state.economy && state.economy.stationOutages && state.economy.stationOutages[stationId];
  if (!legacy || typeof legacy !== 'object') return null;
  const until = Number(legacy[`${service}Until`]);
  const now = Number(state.simTime) || 0;
  if (!Number.isFinite(until) || until <= now) return null;
  return { untilSimTime: until, cause: legacy.cause || null, remainingS: until - now };
}

/** Dock-control voice for a berth: lawful factions speak as Dock control, the rest as the Yardmaster. */
function stationVoiceFor(state, stationId) {
  const info = stationInfo(state, stationId);
  const meta = (info && FACTION_META.find((f) => f && f.id === info.factionId)) || null;
  const lawful = !!(meta && meta.personality === 'lawful');
  return { voice: lawful ? 'Dock control' : 'Yardmaster', lawful, info, name: stationDisplayNameFor(state, stationId) };
}

function factionShortLabel(id) {
  const meta = FACTION_META.find((f) => f && f.id === id);
  return (meta && (meta.short || meta.name)) || String(id || '').replace(/^faction_/, '');
}

// A flood boom needs the same price dip the board's surplus haul-out posts at (-0.12): a 25 u rock.
const STATION_BOOM_MAX_PRESSURE = ECON_CONTRACT_THRESHOLDS.surplusPressure;
// A civilian hull killed this close to a berth (WU) with no home stamp is that berth's crew.
// 1200 missed the shift: a tender's call-out is the nearest other berth (Ceres refinery to
// Belt Outpost ≈ 2443 WU, Helios to Coalition HQ ≈ 2663 WU), and the yard truck / crew-response
// envelope in npcJobsRuntime is 3500 WU (YARD_DISPATCH_RANGE_WU). That is how far a station's
// own crew still count as its crew. A sector is 4200 WU; this does not swallow the map.
const STATION_STRIKE_REACH_WU = 3500;

const CONDITION_LINES = Object.freeze({
  strike: 'Crews are off the floor over what you did to their shift.',
  boom: 'The yard is flush — repair and fuel are running cheap today.',
});

/**
 * stationConditionLine(state, stationId) -> one short dock-control sentence naming every live
 * condition at the berth, in the berth's own voice, or null when nothing is live.
 */
export function stationConditionLine(state, stationId) {
  const live = stationConditionsFor(state, stationId);
  if (!live) return null;
  const parts = [];
  if (live.outage) parts.push(`repair bay down ${Math.max(1, Math.ceil(live.outage.remainingS / 60))} min`);
  if (live.strike) parts.push(CONDITION_LINES.strike);
  if (live.boom) parts.push(CONDITION_LINES.boom);
  if (live.grudge) {
    parts.push(`Pay the ${stationGrudgeOwedCr(state, stationId)} cr on your note before you come through our ring again.`);
  }
  if (live.blockade) {
    const [a, b] = live.blockade.factions;
    parts.push(`Blockade — the ${factionShortLabel(a)}–${factionShortLabel(b)} front is on this lane, goods run dear and the pumps are rationed.`);
  }
  if (!parts.length) return null;
  const { voice, name } = stationVoiceFor(state, stationId);
  return `${voice}, ${name}: ${parts.join(' ')}`;
}

// A station that posts 'toll'/'scan' is a working checkpoint (Customs Gate, Dione Customs):
// docking there reads the hold and collects the plate instead of sitting as a refuel stop in
// costume. The toll curve mirrors the gate-jump plates (50 + 200·security).
const DOCK_SCAN_SECURITY = 0.98;   // berth-grade sweep — same certainty lawful inspections use
const DOCK_TOLL_BASE_CR = 50;
const DOCK_TOLL_SECURITY_CR = 200;

/** PQ-155.02 — named debit stories. Economy writes the receipt; the ledger only prints it. */
export const SESSION_SINK_KINDS = Object.freeze([
  'repair', 'fine', 'insurance', 'restitution', 'impound', 'toll',
]);
export const SESSION_SINK_LEDGER_MAX = 48;
export const SESSION_SINK_CAUSES = Object.freeze({
  repair: 'hull scar',
  fine: 'restricted cargo',
  insurance: 'hull deductible',
  restitution: 'spilled cargo',
  impound: 'wanted hull',
  toll: 'berth plate',
});
const SESSION_SINK_KIND_SET = new Set(SESSION_SINK_KINDS);

export function classifySessionSink(reason) {
  const r = String(reason || '');
  if (r === 'service:repair' || r === 'beam:repair') return 'repair';
  if (r === 'fine:contraband' || r.startsWith('fine:')) return 'fine';
  if (r === 'service:insurance' || r === 'recovery:deductible') return 'insurance';
  if (r === 'recovery:hull_share') return 'repair';
  if (r === 'restitution' || r.startsWith('restitution:')) return 'restitution';
  if (r === 'impound:pay' || r.startsWith('impound:')) return 'impound';
  if (r === 'service:dock_toll' || r.startsWith('toll:')) return 'toll';
  return null;
}

export function ensureSessionSinkLedger(player) {
  if (!player) return [];
  if (!Array.isArray(player.sessionSinks)) player.sessionSinks = [];
  if (!Number.isSafeInteger(player.sessionSinkSeq) || player.sessionSinkSeq < 0) player.sessionSinkSeq = 0;
  return player.sessionSinks;
}

function sinkCauseToken(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const out = value.replace(/\s+/g, ' ').trim();
  return out || fallback;
}

export function fileSessionSink(state, input = {}) {
  const player = state && state.player;
  if (!player) return null;
  const kind = SESSION_SINK_KIND_SET.has(input.kind) ? input.kind : classifySessionSink(input.reason);
  if (!kind) return null;
  const amount = Math.max(0, Math.round(Number(input.amount) || 0));
  if (amount <= 0) return null;
  const cause = sinkCauseToken(input.cause, SESSION_SINK_CAUSES[kind]);
  const ledger = ensureSessionSinkLedger(player);
  const seq = (player.sessionSinkSeq || 0) + 1;
  player.sessionSinkSeq = seq;
  const record = {
    id: `sink:${seq}`,
    kind,
    cause,
    amount,
    reason: String(input.reason || kind),
    at: Math.max(0, Number(state.simTime) || 0),
  };
  ledger.push(record);
  if (ledger.length > SESSION_SINK_LEDGER_MAX) {
    ledger.splice(0, ledger.length - SESSION_SINK_LEDGER_MAX);
  }
  return record;
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const round = Math.round;
// Bitwise |0 is a signed-32 truncate: a 2^31-credit fortune becomes -2147483648, then
// Math.max(0, ...) wipes it. Credits are ordinary finite integers up to this named cap.
const CREDITS_MAX = Number.MAX_SAFE_INTEGER;
function normalizeCredits(value) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(CREDITS_MAX, Math.round(n)));
}

// ---- static lookups (built once) ----------------------------------------------------------
const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));

/** A berth's authored display name, falling back to the id when the registry has none. */
function stationDisplayNameFor(state, stationId) {
  const reg = state && state.content && state.content.sectors;
  const lists = [reg ? (Array.isArray(reg) ? reg : Object.values(reg)) : null, SECTORS];
  for (const list of lists) {
    if (!list) continue;
    for (const sec of list) {
      for (const st of (sec && sec.stations) || []) {
        if (st && st.id === stationId) return st.name || stationId;
      }
    }
  }
  return String(stationId);
}

function commodityDef(state, id) {
  const reg = state && state.content && state.content.commodities;
  if (reg) {
    const c = Array.isArray(reg) ? reg.find((x) => x.id === id) : reg[id];
    if (c) return c;
  }
  return CMDTY_BY_ID.get(id) || null;
}

// A station with an authored regional produce recipe makes the good locally, so it lists and
// sells it even when the commodity's marketTier is above the sector tier (VERB-09 Helios).
// Deep-world goods (marketTier 3+) stay gated regardless — a local produce line never stocks
// resources that only exist deeper in the world (ECON-01).
const PRODUCE_OVERRIDES_TIER_UP_TO = 2;
function producedAtStation(info, stationId, def) {
  if (!def || !info || !info.sectorId) return false;
  if ((Number(def.marketTier) || 0) > PRODUCE_OVERRIDES_TIER_UP_TO) return false;
  for (const recipe of pressureRecipesForRegion(info.sectorId)) {
    if (recipe.role === 'produce' && recipe.stationId === stationId && recipe.commodityId === def.id) return true;
  }
  return false;
}

const SHIP_PRICE_BY_ID = new Map(SHIPS.map((s) => [s && s.id, Number(s && s.price) || 0]));

/**
 * FB-124 — the insurable manifest: legal cargo only, valued at catalog base price. Contraband
 * is never insurable and smuggling gear does not change the number the policy prices from.
 */
export function legalManifestValueCr(state) {
  const items = state && state.player && state.player.cargo && state.player.cargo.items;
  if (!items || typeof items !== 'object') return 0;
  let total = 0;
  for (const [id, qtyRaw] of Object.entries(items)) {
    const qty = Math.max(0, Math.floor(Number(qtyRaw) || 0));
    if (!(qty > 0)) continue;
    const def = commodityDef(state, id);
    if (!def || (def.legality && def.legality !== 'legal')) continue;
    total += qty * (Number(def.basePrice) || 0);
  }
  return Math.round(total);
}

/**
 * FB-049 — the note a berth will write: bounded by what you already hold plus the standing the
 * docked faction extends. Debt is the economy's own field; this only reads it.
 */
export function loanLimitFor(state, stationId) {
  const player = state && state.player;
  if (!player) return 0;
  const credits = Math.max(0, Math.round(Number(player.credits) || 0));
  const idx = Math.max(0, Math.floor(Number(player.activeShipIndex) || 0));
  const owned = Array.isArray(player.ownedShips) ? player.ownedShips[idx] : null;
  // A hull with no list price (the starter Hitch) still counts the hardship basis toward the
  // pilot's worth — a zero-price line in the catalog must not erase the note it was issued for.
  const listed = owned && owned.defId ? (SHIP_PRICE_BY_ID.get(owned.defId) || 0) : 0;
  const hullCr = owned ? Math.max(listed, LOAN_BASE_CR) : 0;
  const netWorth = credits + hullCr + legalManifestValueCr(state);
  const info = stationId ? stationInfo(state, stationId) : null;
  const factionId = (info && info.factionId) || null;
  const rep = factionId && state.factions && state.factions[factionId]
    ? Number(state.factions[factionId].rep) || 0 : 0;
  // Standing buys note room in named steps, not raw rep points: a starter at rep -2 is still
  // 'Known' at the berth, and one stray encounter must not zero the hardship loan.
  const rankStep = factionId ? rankFromRep(rep, factionId).step : 0;
  return Math.max(0, Math.min(LOAN_CAP_CR,
    Math.round(LOAN_BASE_CR + netWorth * LOAN_NET_WORTH_FRAC + rankStep * LOAN_REP_STEP_CR)));
}

/**
 * FB-124 — the cargo-policy quote at this berth: the premium scales the legal manifest by the
 * sector's real danger tier; a claim pays a fixed fraction of the manifest actually lost.
 */
export function cargoPolicyQuoteFor(state) {
  const manifestCr = legalManifestValueCr(state);
  if (!(manifestCr > 0)) return null;
  const sectorId = (state && state.world && state.world.currentSectorId) || null;
  const tier = effectiveDangerTierFor(state, sectorId);
  const rate = CARGO_POLICY_BASE_RATE * (1 + tier * CARGO_POLICY_DANGER_MULT);
  const premiumCr = Math.max(1, Math.round(manifestCr * rate));
  return {
    manifestCr,
    dangerTier: tier,
    rate,
    premiumCr,
    coverFrac: CARGO_POLICY_COVER_FRAC,
    coverCr: Math.round(manifestCr * CARGO_POLICY_COVER_FRAC),
  };
}

// Shared empty demand-driver row set. demandModel already returns frozen rows; this covers the
// defensive non-array fallback and normalizes a missing cache without allocating per call.
const EMPTY_DRIVERS = Object.freeze([]);

// Structural equality for demand-driver rows, replacing the old JSON.stringify pair that built two
// full strings per listing per tick just to say "unchanged". Rows are flat frozen objects of
// primitives from demandModel.driverFor (single fixed key set since that model's introduction;
// spread clones and save/load round-trips preserve its key order), so length + own-key/value
// comparison is exactly equivalent — and allocates nothing.
function demandDriversEqual(prev, next) {
  if (prev === next) return true;
  const a = Array.isArray(prev) ? prev : (prev ? null : EMPTY_DRIVERS);
  const b = Array.isArray(next) ? next : (next ? null : EMPTY_DRIVERS);
  if (!a || !b) return false; // a truthy non-array never stringified equal to an array
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ra = a[i];
    const rb = b[i];
    if (ra === rb) continue;
    if (!ra || !rb) return false;
    let keys = 0;
    for (const k in ra) {
      if (!Object.hasOwn(rb, k) || ra[k] !== rb[k]) return false;
      keys++;
    }
    for (const k in rb) keys--;
    if (keys !== 0) return false;
  }
  return true;
}

/** Role of a commodity for a station type: 'produce' if the type makes it, 'consume' if it uses
 *  it, else 'none'. produce wins ties (a station that both makes and uses a good is a net seller). */
function roleFor(def, stationType) {
  if (!def) return 'none';
  if ((def.producedBy || []).includes(stationType)) return 'produce';
  if ((def.consumedBy || []).includes(stationType)) return 'consume';
  return 'none';
}

// ── Station industry book (mining.js RECIPES wired live) ─────────────────────────────────────
// The authored refine/craft chains are each industrial station's standing book: a yard runs a
// recipe when the output's producedBy names its station type and the sector tier meets the
// recipe's service bar. Each econ tick a fed line consumes feedstock and emits product through
// the same stock authority NPC trades and claims use, so two stations with different books — or
// the same book at different stock positions — visibly price apart. Recipe timeS is the
// throttle: an 8s smelt moves more freight per minute than a 25s circuitry line. Stock gates
// bound it: an empty feedstock hopper idles the line and a glutted output stalls it, so the
// flows push stations APART (scarcity premium on inputs, surplus discount on outputs) while
// recovery still owns the rest level the drift returns to.
const INDUSTRY_RUNS_PER_MIN_BY_SIZE = { S: 1.0, M: 2.4, L: 4.8 };
const INDUSTRY_TIME_NORM_S = 12;        // recipe.timeS divisor anchor (8s smelt -> 1.5x line rate)
const INDUSTRY_INPUT_FULL = 1.0;        // stock/baseEq at which a fed line runs flat-out
const INDUSTRY_OUTPUT_GLUT = 2.4;       // output stock/baseEq above which the line idles
const INDUSTRY_BIAS_LO = 0.7;           // deterministic per-station tempo band (below)
const INDUSTRY_BIAS_SPAN = 0.6;
const INDUSTRY_STARVED_FILL = 0.3;      // input stock/baseEq below which a yard line is starving

const STATION_INDUSTRY_BOOK = (() => {
  const byType = new Map();
  for (const recipe of RECIPES) {
    const outputId = recipe && recipe.output ? Object.keys(recipe.output)[0] : null;
    const def = outputId ? CMDTY_BY_ID.get(outputId) : null;
    if (!def || !(def.producedBy || []).length) continue;
    const inputs = Object.entries(recipe.inputs || {})
      .filter(([cid, qty]) => CMDTY_BY_ID.has(cid) && Number.isFinite(qty) && qty > 0)
      .map(([cid, qty]) => [cid, qty]);
    if (!inputs.length) continue;
    const job = {
      id: recipe.id,
      inputs,
      outputId,
      outputQty: Math.max(1, Number(recipe.output[outputId]) || 1),
      stationTier: Math.max(0, Number(recipe.stationTier) || 0),
      runsPerMin: INDUSTRY_TIME_NORM_S / Math.max(1, Number(recipe.timeS) || INDUSTRY_TIME_NORM_S),
    };
    for (const type of def.producedBy) {
      let list = byType.get(type);
      if (!list) { list = []; byType.set(type, list); }
      list.push(job);
    }
  }
  for (const list of byType.values()) {
    list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)); // stable catalog order
  }
  return byType;
})();

/**
 * Live starvation read for one station: the hungriest input leg of its tier-eligible industry
 * book, or null when nothing is starving. Pure — reads the same stock/baseEq fill the industry
 * tick throttles on, so a posted shortage is the real hopper, not a rolled event.
 * Returns { jobId, inputId, fill, deficitUnits } with deficitUnits ≈ what restores full feed.
 */
export function starvedIndustryNeedFor(stationType, stationTier, market, simTime = null) {
  const jobs = STATION_INDUSTRY_BOOK.get(stationType);
  if (!jobs || !market) return null;
  const tier = Math.max(0, Number(stationTier) || 0);
  let worst = null;
  for (const job of jobs) {
    if (tier < job.stationTier) continue;
    for (const [cid] of job.inputs) {
      const entry = market[cid];
      if (!entry || !(entry.baseEq > 0)) continue;
      const stock = simTime == null ? entry.stock : shelfUnitsAt(entry, cid, simTime);
      const fill = stock / entry.baseEq;
      if (!worst || fill < worst.fill) worst = { jobId: job.id, inputId: cid, fill, entry };
    }
  }
  if (!worst || !(worst.fill < INDUSTRY_STARVED_FILL)) return null;
  return {
    jobId: worst.jobId,
    inputId: worst.inputId,
    fill: worst.fill,
    deficitUnits: Math.max(1, Math.ceil((INDUSTRY_INPUT_FULL - worst.fill) * worst.entry.baseEq)),
  };
}

// ---- price math ---------------------------------------------------------------------------
export function priceMult(stock, baseEq, elasticity) {
  return clamp(Math.pow(Math.max(stock, 1) / baseEq, -elasticity), PRICE_MULT_LO, PRICE_MULT_HI);
}

/** Closed-form average mid over a stock interval [sLo, sHi] (the price-impact integral).
 *  mid(s) = basePrice * baseEq^el * s^(-el); ∫ s^-el ds = s^(1-el)/(1-el).
 *  avg = basePrice*baseEq^el/((1-el)*ΔN) * (sHi^(1-el) - sLo^(1-el)); el==1 -> ln form. */
export function avgMid(basePrice, baseEq, el, sLo, sHi) {
  return averageBoundedPrice(basePrice, baseEq, el, sLo, sHi, PRICE_MULT_LO, PRICE_MULT_HI);
}

export function economyBaseEqForSize(size) {
  return BASE_EQ_DEFAULT * (SIZE_FACTOR[size] || 1);
}

export function economyStockTargetForRole(role, baseEq = BASE_EQ_DEFAULT) {
  return baseEq * (ROLE_FACTOR[role] || 0);
}

/** Resolve a listing's authored drift target without changing its shared price curve. */
export function economyEquilibriumForListing(info, commodityId, role, baseEq = BASE_EQ_DEFAULT) {
  const authoredFactor = Number(info && info.marketEquilibriumFactors
    && info.marketEquilibriumFactors[commodityId]);
  if (Number.isFinite(authoredFactor) && authoredFactor > 0) {
    return baseEq * clamp(authoredFactor, 0.01, 4);
  }
  return role === 'none' ? baseEq : economyStockTargetForRole(role, baseEq);
}

export function economyMidPrice(def, stock, baseEq = BASE_EQ_DEFAULT) {
  if (!def) return 0;
  return def.basePrice * priceMult(stock, baseEq, def.elasticity);
}

export function economySpotPriceForRole(def, role, side = 'mid', opts = {}) {
  const baseEq = opts.baseEq || BASE_EQ_DEFAULT;
  const stock = opts.stock != null ? opts.stock : economyStockTargetForRole(role, baseEq);
  const spread = opts.spread != null ? opts.spread : SPREAD_BASE;
  const mid = economyMidPrice(def, stock, baseEq);
  if (side === 'buy') return mid * (1 + spread / 2);
  if (side === 'sell') return mid * (1 - spread / 2);
  return mid;
}

/** Restock ETA for the market screen — the shelf heals by dent decay only.
 * The market reserves one unit, so stock must reach two before a whole unit is buyable. */
export function marketStockStatus(state, stationId, commodityId) {
  let entry = state?.economy?.markets?.[stationId]?.[commodityId];
  if (!entry) {
    // Stateless book: the unminted shelf rests at its listing equilibrium —
    // sold-out means somebody's dents drained it, not that no row exists.
    const ldef = listingDefFor(commodityDef(state, commodityId), stationInfo(state, stationId),
      stationId, { producedHere: false });
    if (!ldef) return { soldOut: false, restockSeconds: null };
    entry = { eq: ldef.eq, dents: [] };
  }
  const t = (state && state.simTime) || 0;
  return shelfRestockSeconds(entry, commodityId, t, 2);
}

/** Effective spread (base * live event spread multiplier * frontier penalty), clamped. */
function spreadOf(eventSpreadMult, frontierPenalty) {
  const ev = Number.isFinite(eventSpreadMult) ? eventSpreadMult : 1;
  return clamp(SPREAD_BASE * ev * (1 + (frontierPenalty || 0)), SPREAD_LO, SPREAD_HI);
}

const MARKET_ROLE_CODE = Object.freeze({ none: 0, produce: 1, consume: 2 });
const MARKET_ROLE_FROM_CODE = Object.freeze(['none', 'produce', 'consume']);

/**
 * Market row v2: [cid, equilibrium, baseEq, roleCode, dentsFlat, demandMult,
 *                 lastMid, lastBuy, lastSell, stock].
 * dentsFlat is null when empty else a flat [t0, q0, t1, q1, ...] pair list.
 * Rows saved before the quote-stamp fields existed (length 6) re-stamp on load.
 */
function serializeMarketRow(cid, entry) {
  const dents = Array.isArray(entry.dents) && entry.dents.length
    ? entry.dents.flatMap((d) => [Number(d && d.t) || 0, Number(d && d.q) || 0])
    : null;
  return [
    cid,
    entry.equilibrium,
    entry.baseEq,
    MARKET_ROLE_CODE[entry.role] ?? 0,
    dents,
    Number.isFinite(entry.demandMult) ? entry.demandMult : 1,
    // Persisted quote stamps + stock mirror keep a save/load boundary bit-identical
    // to the uninterrupted run: live entries hold their last stamped values until
    // something touches them, so derived-at-load fields must come back as saved.
    entry.lastMid || 0, entry.lastBuy || 0, entry.lastSell || 0,
    Number.isFinite(entry.stock) ? entry.stock : entry.equilibrium,
  ];
}

function sanitizeDents(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const d of raw) {
    if (Array.isArray(d)) { // flat-packed [t,q,t,q]
      break;
    }
    const t = Number(d && d.t), q = Number(d && d.q);
    if (Number.isFinite(t) && Number.isFinite(q) && q !== 0) out.push({ t, q });
    if (out.length >= 8) break;
  }
  if (raw.length && typeof raw[0] === 'number') {
    for (let i = 0; i + 1 < raw.length && out.length < 8; i += 2) {
      const t = Number(raw[i]), q = Number(raw[i + 1]);
      if (Number.isFinite(t) && Number.isFinite(q) && q !== 0) out.push({ t, q });
    }
  }
  return out;
}

function deserializeMarketRow(cid, raw, isV2) {
  if (!Array.isArray(raw)) {
    // Oldest object form — always legacy.
    return {
      cid,
      stock: raw && raw.stock,
      equilibrium: raw && (raw.eq ?? raw.equilibrium),
      baseEq: raw && raw.baseEq,
      role: raw && raw.role,
      dents: sanitizeDents(raw && raw.dents),
      demandMult: raw && raw.demandMult,
      eventMods: raw && raw.eventMods,
      history: raw && raw.history,
      lastMid: raw && raw.lastMid,
      lastBuy: raw && raw.lastBuy,
      lastSell: raw && raw.lastSell,
    };
  }
  if (isV2) {
    return {
      cid: raw[0] || cid,
      equilibrium: raw[1],
      baseEq: raw[2],
      role: MARKET_ROLE_FROM_CODE[raw[3]] || 'none',
      dents: sanitizeDents(raw[4]),
      demandMult: raw[5],
      lastMid: raw[6],
      lastBuy: raw[7],
      lastSell: raw[8],
      stockMirror: raw[9],
    };
  }
  // Legacy rows: [cid, stock, equilibrium, baseEq, roleCode, eventMods, history?, lastMid?, lastBuy?, lastSell?]
  return {
    cid: raw[0] || cid,
    stock: raw[1],
    equilibrium: raw[2],
    baseEq: raw[3],
    role: MARKET_ROLE_FROM_CODE[raw[4]] || 'none',
    eventMods: raw[5],
    history: raw[6],
    lastMid: raw[7],
    lastBuy: raw[8],
    lastSell: raw[9],
  };
}

function ensurePlayerMarketMemory(player) {
  if (!player) return {};
  if (!player.marketMemory || typeof player.marketMemory !== 'object' || Array.isArray(player.marketMemory)) {
    player.marketMemory = {};
  }
  return player.marketMemory;
}

function ensurePlayerTradeState(player) {
  if (!player) return { ledger: [], lots: {}, margins: {} };
  if (!Array.isArray(player.tradeLedger)) player.tradeLedger = [];
  if (!player.tradeLots || typeof player.tradeLots !== 'object' || Array.isArray(player.tradeLots)) player.tradeLots = {};
  // FB-047: lifetime per-commodity margin roll-up — bounded by the commodity catalog, so the ten-
  // receipt ledger cap no longer erases a pilot's session trading record.
  if (!player.tradeMargins || typeof player.tradeMargins !== 'object' || Array.isArray(player.tradeMargins)) player.tradeMargins = {};
  return { ledger: player.tradeLedger, lots: player.tradeLots, margins: player.tradeMargins };
}

function normalizeSalvageIntakeIds(raw) {
  const ids = new Set();
  const ordered = [];
  for (const value of (Array.isArray(raw) ? raw : [])) {
    if (typeof value !== 'string' || !value || ids.has(value)) continue;
    ids.add(value);
    ordered.push(value);
  }
  return ordered.length > SALVAGE_INTAKE_RECEIPT_CAP
    ? ordered.slice(ordered.length - SALVAGE_INTAKE_RECEIPT_CAP)
    : ordered;
}

function canonicalSalvageIntakeLines(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const lines = [];
  const seen = new Set();
  for (const line of raw) {
    if (!line || typeof line !== 'object' || Array.isArray(line)) return null;
    const commodityId = typeof line.commodityId === 'string' && line.commodityId
      ? line.commodityId
      : null;
    const qty = Number(line.qty);
    if (!commodityId || seen.has(commodityId) || !Number.isSafeInteger(qty) || qty <= 0 || qty > 1_000_000) return null;
    seen.add(commodityId);
    lines.push({ commodityId, qty });
  }
  lines.sort((a, b) => {
    if (a.commodityId < b.commodityId) return -1;
    if (a.commodityId > b.commodityId) return 1;
    return a.qty - b.qty;
  });
  return lines;
}

function canonicalSalvageIntakeReceipt(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const intakeId = typeof value.intakeId === 'string' && value.intakeId ? value.intakeId : null;
  const yardId = typeof value.yardId === 'string' && value.yardId ? value.yardId : null;
  const manifestId = typeof value.manifestId === 'string' && value.manifestId ? value.manifestId : null;
  const lotId = typeof value.lotId === 'string' && value.lotId ? value.lotId : null;
  const lines = canonicalSalvageIntakeLines(value.lines);
  const legacy = !Object.hasOwn(value, 'acceptedLines');
  const acceptedLines = legacy
    ? [{ commodityId: NPC_SALVAGE_INTAKE_COMMODITY_ID, qty: Number(value.scrapQty) }]
    : canonicalSalvageIntakeLines(value.acceptedLines);
  if (!intakeId || !yardId || !manifestId || !lotId || !lines || !acceptedLines?.length
    || acceptedLines.some(line => !Number.isSafeInteger(line.qty) || line.qty <= 0
      || line.qty > (lines.find(offered => offered.commodityId === line.commodityId)?.qty || 0))) return null;
  const scrapQty = acceptedLines.find(line => line.commodityId === NPC_SALVAGE_INTAKE_COMMODITY_ID)?.qty || 0;
  if (Number(value.scrapQty) !== scrapQty) return null;
  // Legacy receipts only settled scrap, even when the offered lot also contained electronics.
  return { intakeId, yardId, manifestId, lotId, scrapQty, lines,
    ...(!legacy ? { acceptedLines } : {}) };
}

function salvageAcceptedLines(receipt) {
  return receipt.acceptedLines || [{ commodityId: NPC_SALVAGE_INTAKE_COMMODITY_ID, qty: receipt.scrapQty }];
}

function sameSalvageIntakeReceipt(a, b) {
  return !!a && !!b && a.intakeId === b.intakeId && a.yardId === b.yardId
    && a.manifestId === b.manifestId && a.lotId === b.lotId
    && a.lines.length === b.lines.length
    && a.lines.every((line, index) => line.commodityId === b.lines[index].commodityId && line.qty === b.lines[index].qty);
}

function normalizeSalvageIntakeReceipts(raw) {
  const receipts = [];
  const byId = new Map();
  const blockedIds = new Set();
  for (const value of (Array.isArray(raw) ? raw : [])) {
    const intakeId = value && typeof value === 'object'
      && typeof value.intakeId === 'string' && value.intakeId
      ? value.intakeId
      : null;
    if (!intakeId) continue;
    const receipt = canonicalSalvageIntakeReceipt(value);
    const existing = byId.get(intakeId);
    if (!receipt || (existing && (!sameSalvageIntakeReceipt(existing, receipt)
      || JSON.stringify(salvageAcceptedLines(existing)) !== JSON.stringify(salvageAcceptedLines(receipt))))) {
      blockedIds.add(intakeId);
      byId.delete(intakeId);
      continue;
    }
    if (!existing && !blockedIds.has(intakeId)) {
      byId.set(intakeId, receipt);
      receipts.push(receipt);
    }
  }
  const valid = receipts.filter((receipt) => byId.has(receipt.intakeId));
  return {
    receipts: valid.length > SALVAGE_INTAKE_RECEIPT_CAP
      ? valid.slice(valid.length - SALVAGE_INTAKE_RECEIPT_CAP)
      : valid,
    blockedIds: normalizeSalvageIntakeIds(Array.from(blockedIds)),
  };
}

function ensureMarketPlayState(state) {
  const economyState = state && state.economy;
  if (!economyState || typeof economyState !== 'object') {
    return {
      convoyShares: { open: [], settled: [] },
      forwardSlips: { open: [], settled: [] },
      coldChain: {},
      auditorPenn: { byStation: {} },
      podIntakeReceipts: [],
    };
  }
  if (!economyState.convoyShares || typeof economyState.convoyShares !== 'object') {
    economyState.convoyShares = { open: [], settled: [] };
  }
  if (!Array.isArray(economyState.convoyShares.open)) economyState.convoyShares.open = [];
  if (!Array.isArray(economyState.convoyShares.settled)) economyState.convoyShares.settled = [];
  if (!economyState.forwardSlips || typeof economyState.forwardSlips !== 'object') {
    economyState.forwardSlips = { open: [], settled: [] };
  }
  if (!Array.isArray(economyState.forwardSlips.open)) economyState.forwardSlips.open = [];
  if (!Array.isArray(economyState.forwardSlips.settled)) economyState.forwardSlips.settled = [];
  if (!economyState.coldChain || typeof economyState.coldChain !== 'object') {
    economyState.coldChain = {};
  }
  if (!economyState.auditorPenn || typeof economyState.auditorPenn !== 'object') {
    economyState.auditorPenn = { byStation: {} };
  }
  if (!economyState.auditorPenn.byStation || typeof economyState.auditorPenn.byStation !== 'object') {
    economyState.auditorPenn.byStation = {};
  }
  if (!Array.isArray(economyState.podIntakeReceipts)) economyState.podIntakeReceipts = [];
  return economyState;
}

function trimSettledBook(book, cap) {
  if (!book || !Array.isArray(book.settled)) return;
  const limit = Number.isSafeInteger(cap) && cap >= 0 ? cap : 0;
  if (book.settled.length > limit) book.settled.splice(0, book.settled.length - limit);
}

/**
 * Restore the R480 market-play slice. A pre-feature save (no `marketPlay` key) replaces every
 * contract book, cold chain, auditor tally, and chute receipt with empty defaults — a replaced
 * timeline must never pay a contract the restored save does not know about.
 */
function restoreMarketPlayState(state, raw) {
  const econ = ensureMarketPlayState(state);
  const data = raw && typeof raw === 'object' ? raw : {};
  const shares = data.convoyShares && typeof data.convoyShares === 'object' ? data.convoyShares : {};
  const slips = data.forwardSlips && typeof data.forwardSlips === 'object' ? data.forwardSlips : {};
  econ.convoyShares = {
    open: cloneSaveTree(Array.isArray(shares.open) ? shares.open : []),
    settled: cloneSaveTree(Array.isArray(shares.settled) ? shares.settled : []),
  };
  econ.forwardSlips = {
    open: cloneSaveTree(Array.isArray(slips.open) ? slips.open : []),
    settled: cloneSaveTree(Array.isArray(slips.settled) ? slips.settled : []),
  };
  econ.coldChain = data.coldChain && typeof data.coldChain === 'object' && !Array.isArray(data.coldChain)
    ? cloneSaveTree(data.coldChain) : {};
  const penn = data.auditorPenn && typeof data.auditorPenn === 'object' ? data.auditorPenn : {};
  econ.auditorPenn = {
    byStation: penn.byStation && typeof penn.byStation === 'object' && !Array.isArray(penn.byStation)
      ? cloneSaveTree(penn.byStation) : {},
  };
  econ.podIntakeReceipts = Array.isArray(data.podIntakeReceipts)
    ? cloneSaveTree(data.podIntakeReceipts).slice(-POD_INTAKE_LAW.maxAccepted) : [];
  return econ;
}

function ensureSalvageIntakeState(economyState) {
  if (!economyState || typeof economyState !== 'object') return { receipts: [], blockedIds: [] };
  const normalized = normalizeSalvageIntakeReceipts(economyState.appliedSalvageIntakeReceipts);
  const blockedIds = normalizeSalvageIntakeIds([
    ...(Array.isArray(economyState.blockedSalvageIntakeIds)
      ? economyState.blockedSalvageIntakeIds
      : []),
    ...(Array.isArray(economyState.appliedSalvageIntakeIds)
      ? economyState.appliedSalvageIntakeIds
      : []),
    ...normalized.blockedIds,
  ]);
  const receipts = normalized.receipts.filter(
    (receipt) => !blockedIds.includes(receipt.intakeId),
  );
  if (receipts.length) economyState.appliedSalvageIntakeReceipts = receipts;
  else delete economyState.appliedSalvageIntakeReceipts;
  if (blockedIds.length) economyState.blockedSalvageIntakeIds = blockedIds;
  else delete economyState.blockedSalvageIntakeIds;
  delete economyState.appliedSalvageIntakeIds;
  return { receipts, blockedIds };
}

function npcSalvageIntakeFrom(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const intakeId = typeof payload.intakeId === 'string' && payload.intakeId
    ? payload.intakeId
    : null;
  const yardId = typeof payload.yardId === 'string' && payload.yardId
    ? payload.yardId
    : null;
  const manifestId = typeof payload.manifestId === 'string' && payload.manifestId
    ? payload.manifestId
    : null;
  const lotId = typeof payload.lotId === 'string' && payload.lotId
    ? payload.lotId
    : null;
  const lines = canonicalSalvageIntakeLines(payload.lines);
  if (!intakeId || !yardId || !manifestId || !lotId || !lines) return null;

  return { intakeId, yardId, manifestId, lotId, lines };
}

const CARGO_KILL_CHAIN_CAP = 4;

function cargoManifestLines(manifest) {
  if (!manifest || !Array.isArray(manifest.lines)) return [];
  const lines = [];
  for (const line of manifest.lines) {
    const commodityId = line && typeof line.commodityId === 'string' ? line.commodityId : null;
    const qty = Math.max(0, Math.floor(Number(line && line.qty) || 0));
    if (commodityId && qty > 0) lines.push({ commodityId, qty });
  }
  return lines;
}

function ensureCargoKillChains(econ) {
  if (!econ.cargoKillChains || !Array.isArray(econ.cargoKillChains)) econ.cargoKillChains = [];
  return econ.cargoKillChains;
}

function normalizeCargoKillChain(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const lines = cargoManifestLines({ lines: raw.lines });
  const commodityId = typeof raw.commodityId === 'string' ? raw.commodityId : (lines[0] && lines[0].commodityId);
  if (!raw.id || raw.victimId == null || !commodityId) return null;
  const salvaged = {};
  const source = raw.salvaged && typeof raw.salvaged === 'object' ? raw.salvaged : {};
  for (const id of Object.keys(source)) {
    const qty = Math.max(0, Math.floor(Number(source[id]) || 0));
    if (qty > 0) salvaged[id] = qty;
  }
  const redeemed = {};
  const redeemedSource = raw.redeemed && typeof raw.redeemed === 'object' ? raw.redeemed : {};
  for (const id of Object.keys(redeemedSource)) {
    const qty = Math.max(0, Math.floor(Number(redeemedSource[id]) || 0));
    if (qty > 0) redeemed[id] = qty;
  }
  const pressureReceipts = {};
  for (const [id, fact] of Object.entries(raw.pressureReceipts || {})) {
    if (!fact || typeof fact.receiptId !== 'string' || typeof fact.stationId !== 'string'
      || typeof fact.saleStationId !== 'string' || !Number.isFinite(fact.seenAt)
      || !(Number(fact.qty) > 0) || !redeemed[id]) continue;
    pressureReceipts[id] = { receiptId: fact.receiptId, stationId: fact.stationId,
      saleStationId: fact.saleStationId, seenAt: fact.seenAt, qty: Math.floor(fact.qty) };
  }
  return {
    id: String(raw.id),
    victimId: raw.victimId,
    manifestId: typeof raw.manifestId === 'string' ? raw.manifestId : null,
    sectorId: typeof raw.sectorId === 'string' ? raw.sectorId : null,
    pos: {
      x: Number(raw.pos && raw.pos.x) || 0,
      z: Number(raw.pos && raw.pos.z) || 0,
    },
    commodityId,
    qty: Math.max(0, Math.floor(Number(raw.qty) || 0)),
    lines,
    destStationId: typeof raw.destStationId === 'string' ? raw.destStationId : null,
    originStationId: typeof raw.originStationId === 'string' ? raw.originStationId : null,
    salvaged,
    redeemed,
    pressureReceipts,
    closed: raw.closed === true,
    saleStationId: typeof raw.saleStationId === 'string' ? raw.saleStationId : null,
  };
}

function priceStationForCargoKill(saleStationId, chain) {
  const dest = chain && chain.destStationId;
  if (dest && dest !== saleStationId && stationInfo(null, dest)) return dest;
  const sale = stationInfo(null, saleStationId);
  const sector = sale && SECTORS.find((row) => row.id === sale.sectorId);
  const others = ((sector && sector.stations) || [])
    .map((station) => station && station.id)
    .filter((id) => id && id !== saleStationId)
    .sort();
  return others[0] || null;
}

function sealedSellFree(state, commodityId, qty) {
  if (reservedCargoQuantity(state, commodityId) <= 0) return null;
  const free = sellableCargoQuantity(state, commodityId);
  const requested = Math.max(0, Math.floor(Number(qty) || 0));
  if (requested <= free) return null;
  return free;
}

function biohazardSaleRefusal(state, info, def) {
  if (def.biohazard !== true || !info?.factionId) return null;
  const policy = contaminationSaleMult(state, info.sectorId, info.factionId);
  if (!policy?.refuses) return null;
  // Containment Seal paperwork lets a quarantine counter accept a sealed specimen.
  return fittedModuleDefs(state).some(d => d?.mods?.containmentSeal === true) ? null : policy;
}

function finiteTradePrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function knownPurchasableStock(value) {
  if (value == null || value === '') return null;
  const stock = Number(value);
  if (!Number.isFinite(stock) || stock < 0) return null;
  return Math.floor(stock);
}

let stationTollCache = null;
function knownStationToll(stationId) {
  if (!stationId) return 0;
  if (!stationTollCache) {
    stationTollCache = new Map();
    for (const sector of SECTORS) {
      const security = Number(sector && sector.security) || 0;
      const toll = Math.round(DOCK_TOLL_BASE_CR + DOCK_TOLL_SECURITY_CR * security);
      for (const station of (sector && sector.stations) || []) {
        if (!station || !station.id) continue;
        const services = Array.isArray(station.services) ? station.services : [];
        stationTollCache.set(station.id, services.includes('toll') ? toll : 0);
      }
    }
  }
  return stationTollCache.get(stationId) || 0;
}

function legBuyCapacity({ credits, fitUnits, freeVolume, buy, stock, volume, qty }) {
  if (buy == null || stock == null) {
    return { units: 0, headroom: 0, limit: 'unknown', cost: null, volumeTied: 0 };
  }
  const vol = volume > 0 ? volume : 1;
  // Slot law: the caller's slotFitFor answer wins; a freeVolume readout is the legacy fallback.
  const holdUnits = Number.isFinite(fitUnits)
    ? Math.max(0, Math.floor(fitUnits))
    : Math.max(0, Math.floor(freeVolume / vol));
  const caps = [
    { name: 'credits', units: Math.max(0, Math.floor(credits / buy)) },
    { name: 'volume', units: holdUnits },
    { name: 'stock', units: Math.max(0, stock) },
  ];
  let binding = caps[0];
  for (const row of caps) if (row.units < binding.units) binding = row;
  let units = binding.units;
  let limit = binding.name;
  if (qty != null && Number.isFinite(Number(qty))) {
    const ask = Math.max(0, Math.floor(Number(qty)));
    if (ask < units) {
      units = ask;
      limit = 'quantity';
    }
  }
  return {
    units,
    headroom: binding.units,
    limit,
    cost: units * buy,
    volumeTied: units * vol,
  };
}

/**
 * Compare one selected two-stop freight plan. Read-only: present dock prices stay quoted,
 * later prices stay estimates, and a missing price is unknown rather than zero profit.
 * Leg 1's cargo and capital stay tied up until that load is sold; the second buy is then
 * capped by the credits, volume, and stock that remain. Known fees are subtracted once.
 */
export function compareTwoStopFreight(plan) {
  const source = plan && typeof plan === 'object' ? plan : {};
  const credits = Math.max(0, Number(source.credits) || 0);
  const capVolume = Math.max(0, Number(source.capVolume) || 0);
  const usedVolume = Math.max(0, Math.min(capVolume, Number(source.usedVolume) || 0));
  const leg1In = source.leg1 || {};
  const leg2In = source.leg2 || {};
  const buy1 = finiteTradePrice(leg1In.buy);
  const sell1 = finiteTradePrice(leg1In.sell);
  const buy2 = finiteTradePrice(leg2In.buy);
  const sell2 = finiteTradePrice(leg2In.sell);
  const stock1 = knownPurchasableStock(leg1In.stock);
  const stock2 = knownPurchasableStock(leg2In.stock);
  const vol1 = Number(leg1In.volume) > 0 ? Number(leg1In.volume) : 1;
  const vol2 = Number(leg2In.volume) > 0 ? Number(leg2In.volume) : 1;
  const operatingCost = source.operatingCost != null
    ? Math.max(0, Math.round(Number(source.operatingCost) || 0))
    : knownStationToll(source.midStationId) + knownStationToll(source.destStationId);
  const creditsAfterFee = Math.max(0, credits - operatingCost);
  const freeVolume = Math.max(0, capVolume - usedVolume);
  const first = legBuyCapacity({
    credits: creditsAfterFee,
    fitUnits: Number.isFinite(source.fitUnits1) ? source.fitUnits1 : undefined,
    freeVolume,
    buy: buy1,
    stock: stock1,
    volume: vol1,
    qty: leg1In.qty,
  });
  const sale1 = sell1 == null ? null : first.units * sell1;
  const creditsTied = creditsAfterFee - (first.cost || 0);
  const beforeSale = {
    credits: creditsTied,
    freeVolume: Math.max(0, capVolume - usedVolume - first.volumeTied),
    loadAboard: first.units,
  };
  const creditsAfterSale = sale1 == null ? null : creditsTied + sale1;
  const freeAfterSale = Math.max(0, capVolume - usedVolume);
  const second = legBuyCapacity({
    credits: creditsAfterSale == null ? 0 : creditsAfterSale,
    fitUnits: Number.isFinite(source.fitUnits2) ? source.fitUnits2 : undefined,
    freeVolume: freeAfterSale,
    buy: buy2,
    stock: stock2,
    volume: vol2,
    qty: leg2In.qty,
  });
  if (sale1 == null || buy2 == null) {
    second.units = 0;
    second.cost = null;
    second.volumeTied = 0;
    second.headroom = 0;
    second.limit = 'unknown';
  }
  const sale2 = sell2 == null || second.units <= 0 ? (sell2 == null ? null : 0) : second.units * sell2;
  const priced = buy1 != null && sell1 != null && buy2 != null && sell2 != null
    && first.cost != null && second.cost != null && sale1 != null && sale2 != null;
  const net = priced ? sale1 + sale2 - first.cost - second.cost - operatingCost : null;
  const limiting = second.headroom < first.headroom
    ? { leg: 2, input: second.limit }
    : { leg: 1, input: first.limit };
  const directIn = source.direct || null;
  let direct = null;
  if (directIn) {
    const units = Math.max(0, Math.floor(Number(directIn.units) || 0));
    const sell = finiteTradePrice(directIn.sell);
    direct = {
      units,
      proceeds: sell == null ? null : units * sell,
      certainty: sell == null ? 'unknown' : (directIn.certainty || 'quoted'),
      settled: false,
    };
  }
  return {
    settled: false,
    guaranteed: false,
    selectable: true,
    boughtBeforeSale: false,
    operatingCost,
    feesCounted: 1,
    carriedVolume: usedVolume,
    uncertainty: leg1In.stale || leg2In.stale ? 'stale' : 'estimate',
    basis: {
      leg1Buy: buy1,
      leg1Sell: sell1,
      leg2Buy: buy2,
      leg2Sell: sell2,
      operatingCost,
    },
    direct,
    beforeSale,
    afterSale: {
      credits: creditsAfterSale,
      freeVolume: freeAfterSale,
    },
    leg1: {
      units: first.units,
      cost: first.cost,
      proceeds: sale1,
      limit: first.limit,
      headroom: first.headroom,
      volumeTied: first.volumeTied,
      buyCertainty: leg1In.buyCertainty || (buy1 == null ? 'unknown' : 'quoted'),
      sellCertainty: sell1 == null ? 'unknown' : (leg1In.sellCertainty || 'estimate'),
    },
    leg2: {
      units: second.units,
      cost: second.cost,
      proceeds: sell2 == null ? null : sale2,
      limit: second.limit,
      headroom: second.headroom,
      buyCertainty: buy2 == null ? 'unknown' : (leg2In.buyCertainty || 'estimate'),
      sellCertainty: sell2 == null ? 'unknown' : (leg2In.sellCertainty || 'estimate'),
    },
    net,
    profitText: net == null ? 'unknown' : String(Math.round(net)),
    limitingLeg: limiting.leg,
    limitingInput: limiting.input,
  };
}

// Player-facing words for a legBuyCapacity limit token: the comparison card names the real
// binding input, and a leg the books could not price admits it plainly instead of 'unknown'.
const FREIGHT_LIMIT_LABELS = Object.freeze({
  credits: 'credits',
  volume: 'hold space',
  stock: 'berth stock',
  quantity: 'the order size',
});

function freightLimitText(token) {
  if (token == null) return null;
  const key = String(token);
  if (key === 'unknown') return 'route price unavailable';
  return FREIGHT_LIMIT_LABELS[key] || 'route price unavailable';
}

export function formatFreightComparison(result) {
  if (!result) return '';
  const direct = !result.direct ? ''
    : result.direct.certainty === 'unknown' || result.direct.proceeds == null
      ? 'direct sale unknown'
      : `direct ${Math.round(result.direct.proceeds).toLocaleString('en-US')} cr quoted`;
  const net = result.net == null
    ? 'two-stop estimate unknown'
    : `two-stop estimate ${result.net > 0 ? '+' : ''}${Math.round(result.net).toLocaleString('en-US')} cr`;
  const limitText = freightLimitText(result.limitingInput);
  const leg = result.limitingLeg && limitText
    ? `leg ${result.limitingLeg} limited by ${limitText}`
    : '';
  const fee = result.operatingCost > 0
    ? `fees ${Math.round(result.operatingCost).toLocaleString('en-US')} cr once`
    : '';
  const age = result.uncertainty === 'stale' ? 'stale prices' : 'future prices are estimates';
  return [direct, net, leg, fee, age, 'not guaranteed'].filter(Boolean).join(' · ');
}

function rememberedCommodityBooks(state) {
  const books = new Map();
  const put = (stationId, commodityId, row) => {
    if (!stationId || !commodityId || !row) return;
    let book = books.get(stationId);
    if (!book) {
      book = new Map();
      books.set(stationId, book);
    }
    const prior = book.get(commodityId) || {};
    book.set(commodityId, {
      buy: row.buy != null ? row.buy : prior.buy,
      sell: row.sell != null ? row.sell : prior.sell,
      stock: row.stock != null ? row.stock : prior.stock,
      seenAt: row.seenAt != null ? row.seenAt : prior.seenAt,
    });
  };
  const intel = state && state.economy && state.economy.marketIntel;
  if (intel && typeof intel === 'object') {
    for (const stationId of Object.keys(intel)) {
      const snapshot = intel[stationId] && intel[stationId].snapshot;
      if (!snapshot) continue;
      for (const commodityId of Object.keys(snapshot)) {
        const row = snapshot[commodityId];
        if (!row) continue;
        put(stationId, commodityId, {
          buy: row.buy,
          sell: row.sell,
          stock: row.stock,
          seenAt: intel[stationId].seenAtT,
        });
      }
    }
  }
  const memory = state && state.player && state.player.marketMemory;
  if (memory && typeof memory === 'object' && !Array.isArray(memory)) {
    for (const stationId of Object.keys(memory)) {
      const station = memory[stationId];
      if (!station || typeof station !== 'object') continue;
      for (const commodityId of Object.keys(station)) {
        const row = station[commodityId];
        if (!row) continue;
        put(stationId, commodityId, row);
      }
    }
  }
  return books;
}

function projectedPurchasableStock(state, stationId, commodityId, remembered) {
  if (remembered && remembered.stock != null && Number.isFinite(Number(remembered.stock))) {
    return Math.max(0, Math.floor(Number(remembered.stock)));
  }
  const live = state && state.economy && state.economy.markets
    && state.economy.markets[stationId]
    && state.economy.markets[stationId][commodityId];
  if (!live || !Number.isFinite(Number(live.stock))) return null;
  return Math.max(0, Math.floor(Number(live.stock) - 1));
}

/** One selected route from the market the player is standing in. Not an automatic trader. */
export function compareDockedFreight(state, hereStationId, trade) {
  if (!state || !hereStationId || !trade || !trade.cmdtyId || !trade.destStation) return null;
  const books = rememberedCommodityBooks(state);
  const farIds = [...books.keys()]
    .filter((id) => id !== hereStationId && id !== trade.destStation)
    .sort();
  if (!farIds.length) return null;
  const midBook = books.get(trade.destStation) || new Map();
  const here = state.economy && state.economy.markets && state.economy.markets[hereStationId];
  const hereEntry = here && here[trade.cmdtyId];
  const cargo = state.player && state.player.cargo || {};
  const held = Math.max(0, Math.floor(Number(cargo.items && cargo.items[trade.cmdtyId]) || 0));
  const def1 = CMDTY_BY_ID.get(trade.cmdtyId);
  const seen = Number(trade.seenAtT != null ? trade.seenAtT : trade.age) || 0;
  const stale = Math.max(0, (Number(state.simTime) || 0) - seen) >= 900;
  const leg1 = {
    buy: trade.buyHere != null ? trade.buyHere : (hereEntry && hereEntry.lastBuy),
    sell: trade.sellThere,
    stock: projectedPurchasableStock(state, hereStationId, trade.cmdtyId, null),
    volume: def1 && def1.volPerU > 0 ? def1.volPerU : 1,
    buyCertainty: 'quoted',
    sellCertainty: 'estimate',
    stale,
  };
  // The second leg is a real pick, not the alphabet's first answer: price every remembered
  // (far berth, good) pair the books can quote and keep the best positive margin. Nothing
  // priced, or nothing that earns, means there is no second leg to print — return null.
  let best = null;
  for (const farId of farIds) {
    const farBook = books.get(farId) || new Map();
    const commodityIds = [...new Set([...midBook.keys(), ...farBook.keys()])]
      .filter((id) => id !== trade.cmdtyId && CMDTY_BY_ID.has(id))
      .sort();
    for (const commodityId of commodityIds) {
      const mid = midBook.get(commodityId) || {};
      const far = farBook.get(commodityId) || {};
      const def2 = CMDTY_BY_ID.get(commodityId);
      const candidate = compareTwoStopFreight({
        credits: state.player && state.player.credits,
        capVolume: cargo.capVolume,
        usedVolume: cargo.usedVolume,
        // Both legs quote against the same hold: leg 2 buys only after leg 1's load sold.
        fitUnits1: slotFitFor(state, trade.cmdtyId),
        fitUnits2: slotFitFor(state, commodityId),
        midStationId: trade.destStation,
        destStationId: farId,
        direct: {
          units: held,
          sell: hereEntry ? hereEntry.lastSell : null,
          certainty: 'quoted',
        },
        leg1,
        leg2: {
          buy: mid.buy,
          sell: far.sell,
          stock: projectedPurchasableStock(state, trade.destStation, commodityId, mid),
          volume: def2 && def2.volPerU > 0 ? def2.volPerU : 1,
          buyCertainty: 'estimate',
          sellCertainty: 'estimate',
          stale,
        },
      });
      const leg2 = candidate && candidate.leg2;
      const margin = leg2 && leg2.units > 0 && leg2.cost != null && leg2.proceeds != null
        ? leg2.proceeds - leg2.cost
        : null;
      if (!(margin > 0)) continue;
      if (!best || margin > best.margin
        || (margin === best.margin
          && (farId < best.farId || (farId === best.farId && commodityId < best.commodityId)))) {
        best = { result: candidate, margin, farId, commodityId };
      }
    }
  }
  return best ? best.result : null;
}

function nextTradeSequence(player, ledger) {
  const persisted = Number.isSafeInteger(player.tradeReceiptSeq) && player.tradeReceiptSeq > 0
    ? player.tradeReceiptSeq
    : 0;
  let retained = 0;
  for (const entry of ledger) {
    const sequence = Number(entry && entry.tradeSequence);
    if (Number.isSafeInteger(sequence) && sequence > retained) retained = sequence;
  }
  const sequence = Math.max(persisted, retained) + 1;
  player.tradeReceiptSeq = sequence;
  return sequence;
}

// ---------------------------------------------------------------------------------------------

export const economy = {
  name: 'economy',
  // serialize() owns every returned branch, so saveSystem can avoid cloning the populated market
  // payload a second time during the single-task autosave capture.
  saveSnapshotOwned: true,

  init(ctx) {
    // drop stale handlers from a previous init on a live bus
    for (const unsub of this._unsubs || []) { try { unsub(); } catch (_) {} }
    this._unsubs = [];
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._registry = ctx.registry || null;
    // Fresh session: the per-listing demand-shift marks are derived read state, not save state.
    if (this._demandShiftMarks) this._demandShiftMarks.clear();
    this._lastDockedStation = null;
    this._stationServiceBerth = null;
    economy._instance = this; // so exported quote()/execute() reach the live system

    const state = this.state, bus = this.bus;
    if (!state.economy) state.economy = { markets: {}, econEvents: [], econClock: { accumulator: 0, lastTickT: 0, ticksElapsed: 0 }, marketIntel: {} };
    if (!state.economy.markets) state.economy.markets = {};
    delete state.economy.cycles; // closed-form model: no per-listing formula state
    if (!state.economy.econEvents) state.economy.econEvents = [];
    if (!state.economy.econClock) state.economy.econClock = { accumulator: 0, lastTickT: 0, ticksElapsed: 0 };
    if (!state.economy.marketIntel) state.economy.marketIntel = {};
    ensureSalvageIntakeState(state.economy);
    ensureMarketPlayState(state);
    state.economy.pulse ||= createEconomyPulse(state.simTime);
    ensurePlayerMarketMemory(state.player);
    ensurePlayerTradeState(state.player);
    ensureSessionSinkLedger(state.player);
    if (!Number.isFinite(state.economy.rngSeed) || (state.economy.rngSeed >>> 0) === 0) state.economy.rngSeed = hash32(state.meta && state.meta.seed, 'economy');
    this._nextEventId = 1;

    // dedicated seeded RNG stream (§0.5) so scan checks + event rolls don't disturb other streams.
    this.resetRng();

    // Work budgets are economy-owned; world/mining owners still own physical entities.
    // A grant is a reservation of extraction work, NEVER a cargo or credit grant.
    for (const action of ['reserve', 'settle', 'cancel']) {
      this._unsubs.push(bus.on(`economy:resourceWork:${action}`, (payload) => {
        if (!payload || typeof payload !== 'object') return;
        const sector = SECTORS.find((row) => row.id === payload.sectorId);
        payload.result = sector
          ? resourceIntent(state, action, payload, { maxTier: sector.tier || 0 })
          : { ok: false, reason: 'unknown_sector' };
        const r = payload.result;
        recordEconomyPulse(state.economy, state.simTime, {
          resourceWorkS: action === 'reserve' && r.ok && !r.duplicate ? r.workS : 0,
          publishedUnits: action === 'settle' && r.ok ? r.producedQty : 0,
          depletedRequests: r.reason === 'work_depleted' ? 1 : 0,
        });
      }));
    }

    this._unsubs.push(bus.on('mission:offered', () => recordEconomyPulse(state.economy, state.simTime, { offers: 1 })));
    this._unsubs.push(bus.on('mission:accepted', () => recordEconomyPulse(state.economy, state.simTime, { accepts: 1 })));

    // ---- SOLE credits writer (§0.6) -------------------------------------------------------
    this._unsubs.push(bus.on('economy:grantCredits', (p) => this.grantCredits((p && p.amount) || 0, p && p.reason)));
    // The site emits this only after committing the completed physical brace. Economy
    // authenticates that receipt and owns the one-time wage, including save/replay.
    this._unsubs.push(bus.on('worldSite:operationReceipt', (p) => this.settleCeresBraceWage(p)));
    this._unsubs.push(bus.on('economy:chargeCredits', (p) => this._onChargeCreditsRequest(p)));
    this._unsubs.push(bus.on('economy:releaseDebt', (p) => this._releaseDebt(p && p.amount)));
    this._unsubs.push(bus.on('freight:cargoSpilled', (p) => this.levyRestitutionSink(p)));
    this._unsubs.push(bus.on('economy:payBounty', (p) => {
      const payload = (p && typeof p === 'object') ? p : {};
      payload.result = this.payBounty(payload);
    }));

    // Stale debt ages into a posted bounty (the debt/bounty ledger connection). core emits
    // { days:absoluteDay, elapsed }; unpaid debt sitting past the grace window adds a deterministic
    // daily levy to player.bounty until settled — the ledger the law hunts on grows, visibly.
    this._unsubs.push(bus.on('day:tick', (p) => this._onDebtStaleDay(p)));

    // ---- trade intents from UI ------------------------------------------------------------
    this._unsubs.push(bus.on('ui:buy', (p) => { if (p) this.handleTrade(p.commodityId, 'buy', p.qty, { expectedTotal: p.expectedTotal, sourceStationId: p.sourceStationId, requireFullQuantity: p.requireFullQuantity, intentId: p.intentId }); }));
    this._unsubs.push(bus.on('ui:sell', (p) => { if (p) this.handleTrade(p.commodityId, 'sell', p.qty, { expectedTotal: p.expectedTotal, sourceStationId: p.sourceStationId, requireFullQuantity: p.requireFullQuantity, intentId: p.intentId }); }));
    this._unsubs.push(bus.on('economy:marketOpened', (p) => {
      if (!p || !p.stationId) return;
      this.refreshStationDemand(p.stationId);
      const info = this._stationServiceStationId() === p.stationId ? stationInfo(this.state, p.stationId) : null;
      if (info) {
        const market = this.state.economy.markets[p.stationId];
        // The Sell list reads the station's real book. Open an empty liquidation row for
        // accepted player-brought goods so pilots can request their first sale there.
        for (const id of Object.keys(this.state.player.cargo?.items || {}).sort()) {
          const def = commodityDef(this.state, id);
          if (market?.[id] || def?.noMarketSeed !== true || sellableCargoQuantity(this.state, id) <= 0) continue;
          this.quote(p.stationId, id, 'sell', 1);
        }
      }
      this.snapshotIntel(p.stationId);
    }));
    this._unsubs.push(bus.on('map:sectorCharted', (p) => {
      if (p && p.source === 'survey' && p.sectorId) this.seedMemoryFromSurvey(p.sectorId);
    }));

    // ---- NPC / passive-income trades route through the same execute path (self-balancing) --
    // NPC / drone trades move market stock (their activity shifts prices — the whole point of a
    // living economy) but must NOT touch the player's wallet or cargo. Previously both routed
    // through execute(), which hardcodes isPlayer=true and debits/credits state.player — a latent
    // bug where an NPC "sale" literally paid the player. Now they use the stock-only pressure path
    // (applyStockPressure), the same path automation uses, so NPCs are real economic actors without
    // a wallet-coupling accident. (Audit cut-list #2.)
    this._unsubs.push(bus.on('aiTrader:requestTrade', (p) => {
      if (!p) return;
      this.applyStockPressure(p.stationId, p.commodityId, p.side, p.qty);
    }));
    this._unsubs.push(bus.on('economy:applyTradePressure', (p) => { // automation pressure: nudge stock without crediting
      if (!p) return; const side = (p.vol || 0) >= 0 ? 'sell' : 'buy';
      this.applyStockPressure(p.stationId, p.good || p.commodityId, side, Math.abs(p.vol || 0));
    }));
    // Contract cargo lands in the receiving market — a delivered lot is real goods through the
    // same stock authority as a sale, so relieving a starved yard physically re-feeds its line.
    // NXB-027: identified deliveries settle once — the committed receipt makes a retry republish
    // the canonical freight fact for dependent owners instead of moving stock a second time.
    this._unsubs.push(bus.on('cargo:delivered', (p) => { this.applyFreightDelivery(p); }));

    // ---- market play (R480) --------------------------------------------------------------
    // Shares and slips are fantasy contracts on real freight. The buyer names a live inbound
    // freighter; only that hull's real `freight:arrival` pays. Settlement is idempotent because
    // the settled row leaves the open book. The Dump Chute is the player's own pod intake: it
    // commits under the shared journal, pays the documented discount, and adds the goods to the
    // receiving market through the ordinary stock authority.
    this._unsubs.push(bus.on('ui:convoyShareBuy', (p) => { if (p && typeof p === 'object') p.result = this.buyConvoyShare(p); }));
    this._unsubs.push(bus.on('ui:forwardSlipBuy', (p) => { if (p && typeof p === 'object') p.result = this.buyForwardSlip(p); }));
    this._unsubs.push(bus.on('cargo:podIntake', (p) => { if (p && typeof p === 'object') p.result = this.applyPodIntake(p); }));
    this._unsubs.push(bus.on('tether:releaseRated', (p) => { if (p && typeof p === 'object') this._routeDeliberateReleaseToChute(p); }));
    this._unsubs.push(bus.on('freight:arrival', (p) => { if (p && typeof p === 'object') this._settleFreightArrival(p); }));
    this._unsubs.push(bus.on('freight:loss', (p) => { if (p && typeof p === 'object') this._settleFreightLoss(p); }));
    // Player cargo-ship kill → salvage → sale. Economy remembers the hull and, once those goods
    // are sold, moves the destination price. Missions owns the board opportunity that follows.
    this._unsubs.push(bus.on('entity:killed', (p) => this._openCargoKillChain(p)));
    // THE WORLD REMEMBERS — a berth's own crew killed by the player is a strike; a surplus-band
    // ore flood is a boom. (`station:strike` / `station:boom` receipts.)
    this._unsubs.push(bus.on('entity:killed', (p) => this._onStationCrewKilled(p)));
    this._unsubs.push(bus.on('economy:oreFlood', (p) => this._onOreFloodCondition(p)));
    this._unsubs.push(bus.on('pickup:collected', (p) => this._noteCargoKillSalvage(p)));
    // Traffic only delivers a stable manifest receipt. Economy validates the source station and
    // writes the one eligible salvage listing, returning a synchronous acknowledgement so traffic
    // can retain a rejected hold instead of silently deleting it.
    this._unsubs.push(bus.on('salvage:npcUnload', (p) => {
      if (!p || typeof p !== 'object') return;
      p.intakeResult = this.applyNpcSalvageIntake(p);
    }));

    // ---- station markets populated on dock + sector entry ---------------------------------
    this._unsubs.push(bus.on('dock:docked', (p) => {
      if (p && p.stationId) {
        this._lastDockedStation = p.stationId;
        this._stationServiceBerth = p.stationId;
        this.ensureStationMarkets(p.stationId);
        this.snapshotIntel(p.stationId, { arrival: true });
        this._runDockedCustomsPost(p.stationId);
        // FB-124: a cargo policy covers one trip. Docking under your own power ends it — a
        // defeat claim was already priced into the recovery plan before the rescue berth.
        this._expireTripServices();
        // The berth's memory of you, in its own voice (strike, boom, grudge, blockade, outage).
        this._announceStationConditions(p.stationId);
      }
    }));
    this._unsubs.push(bus.on('dock:undocked', () => {
      this._lastDockedStation = null;
      this._stationServiceBerth = null;
    }));
    this._unsubs.push(bus.on('sector:enter', (p) => this.populateSector(p)));

    // ---- services (refuel / repair / ammo) ------------------------------------------------
    this._unsubs.push(bus.on('ui:service', (p) => { if (p) this.handleService(p); }));
    // Cancelled hardship work releases its unused daily allowance as well as its debt.
    // Delivered welds remain counted, so repeated undocks cannot multiply the aid floor.
    this._unsubs.push(bus.on('service:aborted', (p) => {
      const budget = state.player.emergencyRepairBudget;
      if (p?.source !== 'stationServices' || !budget || p.emergencyRepairDay !== budget.day) return;
      const released = Number(p.undeliveredEmergencyHull);
      if (Number.isFinite(released) && released > 0) budget.usedHull = Math.max(0, budget.usedHull - released);
    }));
    // FB-101 — a dry tank with no pump in the sector still has a door: one smallest-jump
    // reserve per day, filed as debt, announced with the figure it costs.
    this._unsubs.push(bus.on('fuel:empty', (p) => this._onFuelEmpty(p)));
    // FB-111 — the tow charge is a credit move plus a debt filing; both stay on this writer.
    this._unsubs.push(bus.on('economy:towCharge', (p) => { if (p) this._settleTowCharge(p); }));

    // ---- contraband scanning (jump-gate use / patrol proximity) ---------------------------
    this._unsubs.push(bus.on('jump:start', (p) => this.runScan({ security: this.currentSecurity(), via: p && p.via, source: 'jump' })));
    this._unsubs.push(bus.on('patrol:proximity', (p) => this.runScan(p || {})));
    // A hull that broke a customs weir unread is a runner — the gate faction's scanners remember
    // it through the same hot-until record an evaded scan writes.
    this._unsubs.push(bus.on('customs:weirBolt', (p) => { if (p && p.factionId) this._markFactionGatesHot(p.factionId); }));
    this._unsubs.push(bus.on('contraband:bribe', (p) => {
      if (p && typeof p === 'object') p.result = this.payBribe(p);
    }));

    // ---- event injection from other systems (missions, combat) ----------------------------
    this._unsubs.push(bus.on('mission:forceEvent', (p) => { if (p) this.injectEvent(p); }));
    this._unsubs.push(bus.on('combat:baseDestroyed', (p) => this.onBaseDestroyed(p || {})));
    // §15.6 C6 — a body the player threw through a docking ring is a bill, an outage and a memory.
    this._unsubs.push(bus.on('combat:collisionConsequence', (p) => this._onCollisionConsequence(p)));
    // Save owners restore after economy. Rebuild this derived read model only after factions and
    // sectorSim have restored their authoritative conflict/field state.
    // A mature save's market refresh + synthetic reseed is ~30ms — too big for one emit-slice
    // unit inside the restore drain. Split it across adjacent listeners at this ordering point:
    // slices still finish before the next system's save:loaded handler (snapshot order), and
    // the drain gets yield seams between them.
    for (let s = 0; s < ECONOMY_SAVE_LOADED_SLICES; s++) {
      const sliceIndex = s;
      this._unsubs.push(bus.on('save:loaded', () => this.refreshAllPersistentDemand({
        reseedSynthetic: true,
        sliceIndex,
        sliceCount: ECONOMY_SAVE_LOADED_SLICES,
      })));
    }
    // Registry listener order places economy before sectorSim. If offline catch-up crosses a
    // blockade/surplus threshold, this receipt arrives after the field mutation and reconciles the
    // same derived quotes and omitted chart caches immediately.
    // The refresh can't ride an emit-sliced event here: a nested sliced emit inside the
    // save:loaded drain would atomic-drain the predecessor tail, and a frame-paced tail
    // would land sim mutations on nondeterministic boundaries. Instead the receipt queues
    // the same sliced refresh and economy.update drains one slice per tick — deterministic
    // boundaries, ~30ms spread over 8 ticks instead of one brick inside the restore drain.
    this._unsubs.push(bus.on('sectorsim:offlineSummary', () => {
      this._offlineSummaryRefresh = { sliceIndex: 0 };
    }));
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
  },

  // -------------------------------------------------------------------------------------------
  // LAZY MARKET SWEEP (~5 s) — conditions, market-play timers, event edges, intel.
  // The market itself has no per-step work: prices evaluate closed-form on read.
  // -------------------------------------------------------------------------------------------
  update(dt, state) {
    const pendingRefresh = this._offlineSummaryRefresh;
    if (pendingRefresh) {
      this.refreshAllPersistentDemand({
        sliceIndex: pendingRefresh.sliceIndex,
        sliceCount: ECONOMY_SAVE_LOADED_SLICES,
      });
      pendingRefresh.sliceIndex += 1;
      if (pendingRefresh.sliceIndex >= ECONOMY_SAVE_LOADED_SLICES) this._offlineSummaryRefresh = null;
    }
    // The accumulator rides state.economy.econClock so a save/load boundary
    // keeps the sweep cadence — sweep ticks land on the same sim instants the
    // uninterrupted run would have hit (reload determinism).
    const clock = state.economy.econClock
      || (state.economy.econClock = { accumulator: 0, lastTickT: 0, ticksElapsed: 0 });
    clock.accumulator = (Number(clock.accumulator) || 0) + (Number(dt) || 0);
    if (clock.accumulator >= MARKET_SWEEP_S) {
      const elapsed = clock.accumulator;
      clock.accumulator = 0;
      this.marketSweep(elapsed, state);
    }
  },

  /**
   * The old economy:tick's survivors, on the same ~5 s receipt cadence. Lab/test callers that
   * used to step econTick keep working — they just no longer move prices; time does.
   */
  econTick(tickDt, state) {
    this.marketSweep(tickDt, state);
  },

  marketSweep(_dt, state) {
    const econ = state.economy;
    this._sweepStationConditions();
    this._sweepMarketPlay(state);
    this._processEventEdges(state);
    this._pruneEconomyEvents(state);
    // Conveyor work survives the closed form: authored lines burn feedstock and mint
    // product as dents against minted books only — never a station-wide mint.
    this.applyStationIndustry(_dt);
    if (this._lastDockedStation && econ.markets[this._lastDockedStation]) {
      this.snapshotIntel(this._lastDockedStation);
    }
    if (this._uplinkFitted(state)) this._syncUplinkIntel(state);
    const clock = econ.econClock || (econ.econClock = { accumulator: 0, lastTickT: 0, ticksElapsed: 0 });
    clock.ticksElapsed = (Number(clock.ticksElapsed) || 0) + 1;
    clock.lastTickT = state.simTime;
    this.bus.emit('economy:tick', { t: state.simTime, ticksElapsed: clock.ticksElapsed });
  },

  /**
   * Cross every event edge in (lastSweepT, now]: scheduled rows from the world seed plus the
   * persisted dynamic rows. Starts emit the news receipt and stamp their physical dent (idempotent
   * via econ.eventsApplied); ends emit the wind-down receipt. Deterministic in sim time.
   */
  _processEventEdges(state) {
    const econ = state.economy;
    const now = Number(state.simTime) || 0;
    const clock = econ.econClock
      || (econ.econClock = { accumulator: 0, lastTickT: 0, ticksElapsed: 0 });
    // lastSweepT is persisted on econClock: after a reload the edge pass sees
    // exactly the (lastSweep, now] window the uninterrupted run did.
    const last = Number.isFinite(clock.lastSweepT) ? clock.lastSweepT : now;
    if (now <= last) { clock.lastSweepT = now; return; }
    const applied = econ.eventsApplied || (econ.eventsApplied = {});
    const j0 = Math.floor(last / EVENT_CELL_S), j1 = Math.floor(now / EVENT_CELL_S);
    const seed = state.meta && state.meta.seed;
    for (const sector of SECTORS) {
      const stationIds = Array.isArray(sector.stations)
        ? sector.stations.map((s) => s && s.id).filter(Boolean) : [];
      if (!stationIds.length) continue;
      const secCtx = sectorEventContext(state, sector.id);
      for (let j = j0; j <= j1; j++) {
        const ev = scheduledEventForEpoch(seed, sector.id, j, stationIds, MARKET_GOOD_POOL, secCtx);
        if (!ev) continue;
        if (ev.tStart > last && ev.tStart <= now) {
          this._applyEventStartDent(state, ev, applied);
          this.bus.emit('economy:eventStarted', {
            eventId: ev.id, type: ev.type, stationId: ev.stationId,
            commodityId: ev.goods[0] || '*', duration: ev.tEnd - ev.tStart,
          });
        }
        if (ev.tEnd > last && ev.tEnd <= now) {
          this.bus.emit('economy:eventEnded', { eventId: ev.id, stationId: ev.stationId });
        }
      }
    }
    for (const ev of econ.econEvents || []) {
      if (!ev || ev.tStart == null) continue;
      // Dynamic rows announce their own start at injectEvent; the edge pass only owes them
      // the physical dent (on reload) and the end receipt.
      if (ev.tStart <= now) this._applyEventStartDent(state, ev, applied);
      if (ev.tEnd > last && ev.tEnd <= now) {
        this.bus.emit('economy:eventEnded', { eventId: ev.id, stationId: ev.stationId });
      }
    }
    clock.lastSweepT = now;
  },

  /**
   * The event's physical signature: shortages strip the shelf, gluts flood it. One dent per
   * event, replay-safe through econ.eventsApplied so a reload cannot double-apply.
   */
  _applyEventStartDent(state, ev, applied) {
    if (!ev || !ev.id || (applied && applied[ev.id])) return;
    if (applied) applied[ev.id] = 1;
    const frac = EVENT_DENT_FRAC[ev.type];
    // skipStartDent: price-only windows (the shortage-repair correction) carry no
    // physical signature — the relief itself is what puts the units back.
    if (!frac || ev.skipStartDent === true) return;
    const market = state.economy.markets[ev.stationId] || this.ensureMarket(ev.stationId);
    if (!market) return;
    const goods = Array.isArray(ev.goods) && ev.goods.length ? ev.goods : Object.keys(market);
    for (const cid of goods) {
      const entry = market[cid];
      if (!entry) continue;
      const eq = Math.max(1, Number(entry.equilibrium) || Number(entry.baseEq) || 1);
      appendDent(entry, cid, ev.tStart, frac * eq);
      const def = commodityDef(state, cid);
      if (def) this._stampEntryQuote(entry, def, ev.stationId, cid);
    }
  },

  /** Drop dynamic rows long past end — their aftermath regime has already run out. */
  _pruneEconomyEvents(state) {
    const econ = state.economy;
    const rows = econ.econEvents;
    if (!Array.isArray(rows) || !rows.length) return;
    const cutoff = (Number(state.simTime) || 0) - EVENT_PRUNE_S;
    const kept = rows.filter((ev) => ev && Number.isFinite(ev.tEnd) && ev.tEnd > cutoff);
    if (kept.length !== rows.length) econ.econEvents = kept.slice(-ECON_EVENTS_CAP);
    else if (rows.length > ECON_EVENTS_CAP) econ.econEvents = rows.slice(-ECON_EVENTS_CAP);
  },

  /**
   * The eval context for one (station, good) — minted dents when an entry exists,
   * the pure listing definition when it does not. Same answer on either lane.
   */
  _marketCtx(info, stationId, commodityId, def, entry) {
    const state = this.state;
    return marketContextFor(state, stationId, commodityId, entry || null);
  },

  /**
   * Stamp lastMid/lastBuy/lastSell + the live shelf mirror from the closed form.
   * Replaces the old stock-mid×cycle cache: same fields, same integer rules.
   */
  _stampEntryQuote(entry, def, stationId, commodityId, atT) {
    const state = this.state;
    const t = Number.isFinite(atT) ? atT : (state.simTime || 0);
    const sid = stationId || null;
    const info = sid ? stationInfo(state, sid) : null;
    const ctx = marketContextFor(state, sid, commodityId || (def && def.id), entry);
    if (!ctx) return entry;
    const mid = marketMidAt(ctx, t);
    const frontier = info ? this.frontierPenalty(info) : 0;
    const spread = spreadOf(eventSpreadAt(ctx, t), frontier);
    entry.lastMid = Math.max(1, round(mid));
    entry.lastBuy = Math.max(1, round(mid * (1 + spread / 2)));
    entry.lastSell = Math.max(1, Math.min(entry.lastBuy - 1, round(mid * (1 - spread / 2))));
    if (entry.lastSell < 1) entry.lastSell = 1;
    if (entry.lastBuy <= entry.lastSell) entry.lastBuy = entry.lastSell + 1;
    entry.stock = shelfUnitsAt(entry, commodityId || (def && def.id), t);
    return entry;
  },

  // Legacy names kept: the ~15 writer call sites that used to recompute the
  // stock×cycle cache now stamp the closed form instead.
  recomputePrices(entry, def, frontierPenalty, _cycle = null, simTime = 0) {
    const info = this._entryStation(entry);
    const sid = info ? info.id : this._lastDockedStation;
    return this._stampEntryQuote(entry, def, sid, def && def.id, simTime);
  },

  recomputeLivePrices(entry, def, stationId, commodityId) {
    return this._stampEntryQuote(entry, def, stationId, commodityId);
  },

  /** Demand-model wrapper: refresh the derived demand fields, then restamp the quote. */
  refreshEntryQuote(entry, def, stationId, commodityId) {
    this.refreshListingDemand(entry, def, stationId);
    return this._stampEntryQuote(entry, def, stationId, commodityId);
  },

  _entryStation(entry) {
    const state = this.state;
    const markets = state && state.economy && state.economy.markets;
    if (!markets || !entry) return null;
    for (const sid in markets) {
      const m = markets[sid];
      for (const cid in m) if (m[cid] === entry) return stationInfo(state, sid);
    }
    return null;
  },

  /** Frontier (low-wealth) stations widen the spread. Derived from sector security. */
  frontierPenalty(info) {
    const sec = (info && info.security != null) ? info.security : 0.7;
    // low security -> up to +FRONTIER_SPREAD_BONUS
    return clamp((1 - sec) * FRONTIER_SPREAD_BONUS, 0, FRONTIER_SPREAD_BONUS);
  },

  /** Rebuild one derived demand cache from factions + the averaged sector field. */
  refreshListingDemand(entry, def, stationId, resolvedInfo = undefined, projectDemand = null) {
    if (!entry || !def) return false;
    const info = resolvedInfo === undefined ? stationInfo(this.state, stationId) : resolvedInfo;
    const sectorId = info && info.sectorId;
    const result = projectDemand
      ? projectDemand(def, sectorId)
      : effectiveDemandFor({ state: this.state, sectorId, commodity: def });
    const prevMult = Number(entry.demandMult) || 1;
    let nextMult = Number(result.multiplier) || 1;
    // Alien Ecology AE-077/078 — biohazard lots price off the station faction's
    // contamination policy (custody refusal deep-discounts; Meridian/Understory pay premiums).
    let biohazardPolicy = null;
    if (def.biohazard === true && info && info.factionId) {
      biohazardPolicy = contaminationSaleMult(this.state, sectorId, info.factionId);
      if (biohazardPolicy && Number.isFinite(biohazardPolicy.priceMult)) {
        nextMult *= biohazardPolicy.priceMult;
      }
    }
    // demandModel returns fresh frozen driver rows per projection and every consumer reads or
    // clones them — nothing mutates — so store the projection's rows directly instead of
    // re-cloning them into every listing on every tick.
    const nextDrivers = biohazardPolicy
      ? [...(Array.isArray(result.drivers) ? result.drivers : EMPTY_DRIVERS),
        { kind: 'contamination_policy', note: biohazardPolicy.note || 'biohazard pricing policy' }]
      : (Array.isArray(result.drivers) ? result.drivers : EMPTY_DRIVERS);
    const changed = Math.abs(prevMult - nextMult) > 1e-9
      || !demandDriversEqual(entry.demandDrivers, nextDrivers);
    entry.demandMult = nextMult;
    entry.demandDrivers = nextDrivers;
    // A material move is worth a traceable receipt (depletion intensity crossing its gate is the
    // mid-game case); the baseline observation is marked silently.
    if (changed) this._noteDemandShift(stationId, def, prevMult, nextMult, nextDrivers, result);
    return changed;
  },

  /**
   * Publish a material demand move so the long-session ledger can trace *why* a market repriced.
   * Material means at least a 2% move or a changed cause set; the per-listing mark remembers the
   * last announced level so slow depletion intensity drift does not flood the event stream. This
   * is a read-model receipt: it writes no stock, price, or credits.
   */
  _noteDemandShift(stationId, def, prevMult, nextMult, drivers, result) {
    const bus = this.bus;
    if (!bus || typeof bus.emit !== 'function' || !stationId || !def) return;
    const marks = this._demandShiftMarks || (this._demandShiftMarks = new Map());
    const key = `${stationId}\u001f${def.id}`;
    const causeIds = (drivers || []).map((d) => d && d.id).filter(Boolean).sort();
    const causeKey = causeIds.join('+');
    const prior = marks.get(key);
    if (!prior) {
      // First observation is the baseline, never an "event": a fresh market must not announce
      // a shift just because it was built. Later observations measure from this mark.
      marks.set(key, { to: nextMult, causes: causeKey });
      return;
    }
    const material = Math.abs(nextMult - prior.to) >= 0.02 || prior.causes !== causeKey;
    if (!material) return; // slow drift keeps accumulating against the same mark
    marks.set(key, { to: nextMult, causes: causeKey });
    const round3 = (v) => Math.round((Number(v) || 1) * 1000) / 1000;
    bus.emit('economy:demandShift', {
      stationId,
      commodityId: def.id,
      from: round3(prevMult),
      to: round3(nextMult),
      causes: causeKey || null,
      depletion: !!(result && result.context && result.context.depletion),
    });
  },

  /** Refresh a station atomically so its board, executable quotes, and route intel agree. */
  refreshStationDemand(stationId) {
    const state = this.state;
    const market = state && state.economy && state.economy.markets && state.economy.markets[stationId];
    if (!market) return false;
    let changed = false;
    for (const cid in market) {
      const entry = market[cid];
      const def = commodityDef(state, cid);
      if (!entry || !def) continue;
      const listingChanged = this.refreshListingDemand(entry, def, stationId);
      if (listingChanged) this._stampEntryQuote(entry, def, stationId, cid);
      changed = listingChanged || changed;
    }
    return changed;
  },

  /** Save/load rebuilds derived quotes without inventing observations. */
  refreshAllPersistentDemand({ sliceIndex = 0, sliceCount = 1 } = {}) {
    const state = this.state;
    const markets = state && state.economy && state.economy.markets || {};
    const ids = Object.keys(markets);
    const s0 = Math.floor(ids.length * sliceIndex / sliceCount);
    const s1 = Math.floor(ids.length * (sliceIndex + 1) / sliceCount);
    for (let i = s0; i < s1; i++) {
      this.refreshStationDemand(ids[i]);
    }
  },

  // -------------------------------------------------------------------------------------------
  // MARKET CONSTRUCTION
  // -------------------------------------------------------------------------------------------
  /** Lazily build the market for one station from its type's produce/consume profile.
   *  ensureMarket(stationId, stationTypeId?) — typeId optional; resolved from data if omitted. */
  ensureMarket(stationId, stationTypeId, size) {
    const state = this.state;
    const markets = state.economy.markets;
    if (markets[stationId]) return markets[stationId];
    // The Swallowed Rib is not part of the galactic price census. Building it
    // from a Helios boot would take the shared economy stream and move every
    // later station's cycle, including the 47-A golden. Prices exist once the
    // player is actually in the throat.
    if (stationId === BOLUS_STATION_ID && state.world?.currentSectorId !== BOLUS_SECTOR_ID) {
      return null;
    }
    const info = stationInfo(state, stationId);
    const type = stationTypeId || (info && info.type) || 'trade_hub';
    const sz = size || (info && info.size) || 'M';
    const market = {};
    this._mintMarketCommodities(stationId, info, {
      type,
      size: sz,
      allowContraband: toleratesContraband(info),
    }, market);
    markets[stationId] = market;
    return market;
  },

  /**
   * Materialize the one live row settlement needs when quote() priced a stateless
   * book. Same listing gates as the read lane: listed goods open at rest (eq),
   * player-brought goods (noMarketSeed / above-tier / locally produced) open as
   * empty liquidation books. Returns null when the berth cannot trade the good.
   */
  _liveEntryForWrite(stationId, commodityId, def) {
    const state = this.state;
    const info = stationInfo(state, stationId);
    const produced = producedAtStation(info, stationId, def);
    const ldef = listingDefFor(def, info, stationId, { producedHere: produced });
    if (!ldef) {
      const stationTier = info ? Math.max(0, Number(info.tier) || 0) : 0;
      const marketTier = Math.max(0, Number(def.marketTier) || 0);
      if (def.noMarketSeed !== true && marketTier <= stationTier && !produced) return null;
      if ((def.legality === 'contraband' || def.legality === 'illegal') && !toleratesContraband(info)) {
        return null;
      }
    }
    const econ = state.economy;
    const market = econ.markets[stationId] || (econ.markets[stationId] = {});
    let entry = market[commodityId];
    if (!entry) {
      entry = market[commodityId] = ldef ? {
        equilibrium: ldef.eq, baseEq: ldef.baseEq, role: ldef.role,
        dents: [], stock: ldef.eq,
        lastMid: 0, lastBuy: 0, lastSell: 0,
        demandMult: 1, demandDrivers: [],
      } : {
        equilibrium: 0,
        baseEq: (BALANCE.commodities[commodityId]?.baseEq || BASE_EQ_DEFAULT)
          * (SIZE_FACTOR[(info && info.size) || 'M'] || 1),
        role: 'none', dents: [], stock: 0,
        lastMid: 0, lastBuy: 0, lastSell: 0,
        demandMult: 1, demandDrivers: [],
      };
      this.refreshListingDemand(entry, def, stationId, info);
      this._stampEntryQuote(entry, def, stationId, commodityId);
    }
    return entry;
  },

  /** The ensureMarket commodity loop. Under the closed form a minted row is just
   *  the persisted half of the same answer the pure listing definition gives —
   *  mints now exist only so dents and demand refresh have somewhere to live. */
  _mintMarketCommodities(stationId, info, mint, market) {
    const state = this.state;
    const now = state.simTime || 0;
    const stationTier = info ? Math.max(0, Number(info.tier) || 0) : 0;
    const frontier = info ? this.frontierPenalty(info) : 0;
    const projectDemand = createSectorDemandProjector(state, info && info.sectorId);
    let regionalProduce = null;
    const producedHere = (def) => {
      if (!def || (Number(def.marketTier) || 0) > PRODUCE_OVERRIDES_TIER_UP_TO) return false;
      if (!regionalProduce) {
        regionalProduce = new Set();
        if (info && info.sectorId) {
          for (const recipe of pressureRecipesForRegion(info.sectorId)) {
            if (recipe.role === 'produce' && recipe.stationId === stationId) regionalProduce.add(recipe.commodityId);
          }
        }
      }
      return regionalProduce.has(def.id);
    };
    for (const def of COMMODITIES) {
      const baseEqRef = (BALANCE.commodities[def.id]?.baseEq || BASE_EQ_DEFAULT) * (SIZE_FACTOR[mint.size] || 1);
      const role = roleFor(def, mint.type);
      // Every legal commodity trades at every station — role only drives price/stock target, not
      // availability. A 'none'-role commodity (e.g. iron ore at a military station) still gets an
      // entry so the player can always sell what they mined/bought. Contraband/illegal goods stay
      // gated to blackmarket-tolerant stations (that is a design-correct restriction, not a filter).
      if (def.legality === 'contraband' || def.legality === 'illegal') {
        if (!mint.allowContraband) continue;
      }
      // noMarketSeed goods exist only as player-brought stock (cradled specimens, one-off
      // recoveries): the station mints a neutral listing on first quote instead of seeding one.
      if (def.noMarketSeed === true) continue;
      // High-tier commodities do not seed naturally at lower-tier stations: starter markets do not
      // stock goods that only exist deeper in the world. If the player brings one, mintUnseededListing
      // creates a liquidation listing so they can still sell it. An authored regional PRODUCE line
      // lifts the gate for shallow goods (marketTier ≤ 2) — a station that makes the good locally
      // (e.g. Helios' military role producing impulse charges) lists what it makes; tier-3+ deep
      // goods stay gated even when produced.
      const marketTier = Math.max(0, Number(def.marketTier) || 0);
      if (marketTier > stationTier && !producedHere(def)) continue;
      // 'none'-role goods have no produce/consume pull, so drift them toward a neutral baseEq stock
      // (price settles near basePrice; player can both buy and sell). Produce/consume keep their
      // role-driven surplus/shortage targets so A->B routes stay profitable.
      const equilibrium = economyEquilibriumForListing(info, def.id, role, baseEqRef);
      // Closed-form market: the book rests at equilibrium; the price is the formula,
      // and the shelf is equilibrium plus whatever player dents still live.
      const entry = {
        equilibrium, baseEq: baseEqRef, role,
        dents: [], stock: equilibrium,
        lastMid: 0, lastBuy: 0, lastSell: 0,
        demandMult: 1, demandDrivers: [],
      };
      this.refreshListingDemand(entry, def, stationId, info, projectDemand);
      this._stampEntryQuote(entry, def, stationId, def.id, now);
      market[def.id] = entry;
    }
    return market;
  },

  // ---- Stateless minting ----
  // Quote never mints now: the pure listing book answers every read, and settlement
  // materializes only the one row a dent has to live on (_liveEntryForWrite). The
  // old eager-mint deferred-spec lane is gone — both "lanes" price identically by
  // construction, so the parity harness degenerates to a tautology.

  /**
   * Mint a neutral 'none'-role listing for a noMarketSeed commodity on first quote — the
   * station has never stocked it, so it opens at rest rather than pretending inventory exists.
   */
  mintUnseededListing(stationId, def) {
    const state = this.state;
    const market = state.economy.markets[stationId] || this.ensureMarket(stationId);
    if (!market || !def) return null;
    const info = stationInfo(state, stationId);
    return this._mintUnseededListingEntry(stationId, info, def, market);
  },

  /** The mintUnseededListing body. */
  _mintUnseededListingEntry(stationId, info, def, market) {
    const state = this.state;
    const sz = (info && info.size) || 'M';
    const baseEqRef = (BALANCE.commodities[def.id]?.baseEq || BASE_EQ_DEFAULT) * (SIZE_FACTOR[sz] || 1);
    // The drift target is the stock actually delivered — a liquidation listing opens empty and
    // stays a sell-side book: a refused biohazard lot mints nothing the recovery tick can grow
    // into sellable stock, and player-bought units bleed back out instead of restocking.
    const entry = {
      equilibrium: 0, baseEq: baseEqRef, role: 'none',
      dents: [], stock: 0,
      lastMid: 0, lastBuy: 0, lastSell: 0,
      demandMult: 1, demandDrivers: [],
    };
    const now = state.simTime || 0;
    this.refreshListingDemand(entry, def, stationId);
    this._stampEntryQuote(entry, def, stationId, def.id, now);
    market[def.id] = entry;
    return entry;
  },

  /** Build markets for all stations whose ids we are told about (a single station). */
  ensureStationMarkets(stationId) { return this.ensureMarket(stationId); },

  /** On sector:enter, build markets for every station present so prices are warm. */
  populateSector(payload) {
    const state = this.state;
    const sectorId = payload && payload.sectorId;
    let stations = (payload && payload.sector && payload.sector.stations) || null;
    if (!stations && sectorId) {
      const sec = (state.content && state.content.sectors && (Array.isArray(state.content.sectors)
        ? state.content.sectors.find((s) => s.id === sectorId)
        : state.content.sectors[sectorId]))
        || SECTORS.find((s) => s.id === sectorId);
      stations = sec && sec.stations;
    }
    if (!stations) return;
    for (const st of stations) this.ensureMarket(st.id, st.type, st.size);
    if (this._uplinkFitted(state)) this._syncUplinkIntel(state);
  },

  /** Cache a price snapshot for the map / route-planner UI (marketIntel). */
  snapshotIntel(stationId, options = null) {
    const state = this.state;
    // Closed-form intel works on a never-minted station: the pure listing book
    // fills the rows the market has not materialized yet.
    const rows = marketRowsFor(state, stationId);
    if (!rows || !Object.keys(rows).length) return;
    const info = stationInfo(state, stationId);
    // Same condition multipliers quote() folds into the live price (strike sell, blockade buy).
    // A remembered list that skips them quotes a calm market while the berth is not calm.
    const trade = stationTradeMults(state, stationId, info);
    const conditioned = (price, mult) => (
      mult === 1 || !Number.isFinite(price) ? price : price * mult
    );
    const snapshot = {};
    for (const cid in rows) {
      const e = rows[cid];
      const def = commodityDef(state, cid);
      if (!def) continue;
      this._stampEntryQuote(e, def, stationId, cid);
      snapshot[cid] = {
        mid: e.lastMid,
        buy: conditioned(e.lastBuy, trade.buy),
        sell: conditioned(e.lastSell, trade.sell),
        stock: e.stock, role: e.role,
        demandMult: Number(e.demandMult) || 1,
        demandDrivers: Array.isArray(e.demandDrivers) ? e.demandDrivers.map((driver) => ({ ...driver })) : [],
      };
    }
    const source = options && options.source === 'uplink' ? 'uplink' : null;
    const record = { snapshot, seenAtT: state.simTime };
    if (source) record.source = source;
    state.economy.marketIntel[stationId] = record;
    if (options?.arrival) {
      const memory = state.player.berthMemory ||= {};
      const row = memory[stationId] || (memory[stationId] = {});
      const now = Math.max(0, Number(state.simTime) || 0);
      const previous = Number.isFinite(row.visitedAt) ? row.visitedAt : null;
      const quotes = row.berthQuotes;
      let compared = 0, moved = false;
      if (quotes && typeof quotes === 'object') {
        for (const [cid, quote] of Object.entries(quotes)) {
          const current = snapshot[cid];
          if (!current || !quote || !Number.isFinite(current.buy) || !Number.isFinite(current.sell)
            || !Number.isFinite(quote.buy) || !Number.isFinite(quote.sell)) continue;
          compared++;
          if (Math.round(current.buy) !== quote.buy || Math.round(current.sell) !== quote.sell) moved = true;
        }
      }
      row.priorVisitAt = previous;
      row.visitedAt = now;
      row.berthBoard = compared && previous != null ? { moved, observedAt: previous, arrivalAt: now } : null;
      row.berthQuotes = Object.fromEntries(Object.entries(snapshot).filter(([, quote]) =>
        Number.isFinite(quote.buy) && Number.isFinite(quote.sell)).map(([cid, quote]) => [cid,
        { buy: Math.round(quote.buy), sell: Math.round(quote.sell) }]));
    }
    this.recordMarketMemory(stationId, snapshot, source ? { source } : null);
  },

  /** Any fitted module carrying the marketIntel flag powers the feed — the flag, not the defId. */
  _uplinkFitted(state) {
    const player = state && state.entities && state.entities.get && state.entities.get(state.playerId);
    if (player && player.alive === false) return false;
    return fittedModuleDefs(state).some((def) => def.mods && def.mods.marketIntel === true);
  },

  /**
   * Fitted Market Data Uplink: streams one live exchange quote per station in the current sector
   * on the docked-feed cadence. Records carry provenance 'uplink' so the intel surfaces can say
   * "market uplink" instead of pretending the player berthed there. The currently-docked berth is
   * left to the dock writer, and a prior dock observation keeps its provenance under the feed —
   * the visit happened; only the quotes refresh.
   */
  _syncUplinkIntel(state) {
    const sectorId = state && state.world && state.world.currentSectorId;
    if (!sectorId) return 0;
    const sec = (state.content && state.content.sectors && (Array.isArray(state.content.sectors)
      ? state.content.sectors.find((s) => s.id === sectorId)
      : state.content.sectors[sectorId]))
      || SECTORS.find((s) => s.id === sectorId);
    if (!sec || !Array.isArray(sec.stations)) return 0;
    let count = 0;
    for (const st of sec.stations) {
      if (!st || !st.id || st.id === this._lastDockedStation) continue;
      this.ensureMarket(st.id, st.type, st.size);
      this.snapshotIntel(st.id, { source: 'uplink' });
      count++;
    }
    return count;
  },

  /**
   * Convert one purchased sector survey into bounded, explicitly lower-confidence price memory.
   * This is the only non-dock writer: it sees exactly the stations named by the purchased sector,
   * takes one snapshot, and never installs live remote intel or an updating subscription.
   */
  seedMemoryFromSurvey(sectorId) {
    const state = this.state;
    const registry = state && state.content && state.content.sectors;
    const sectors = registry ? (Array.isArray(registry) ? registry : Object.values(registry)) : SECTORS;
    const sector = sectors.find((entry) => entry && entry.id === sectorId);
    if (!sector) return { stationCount: 0, listingCount: 0 };

    let stationCount = 0;
    let listingCount = 0;
    for (const station of sector.stations || []) {
      if (!station || !station.id) continue;
      const market = this.ensureMarket(station.id, station.type, station.size);
      // Same basis as a dock observation (snapshotIntel): strike, blockade, market day and
      // festival folds are part of what the berth would actually charge, so a purchased
      // survey remembers conditioned prices — never calm prices at an uncalm berth.
      const trade = stationTradeMults(state, station.id, stationInfo(state, station.id));
      const snapshot = {};
      for (const cid in market) {
        const e = market[cid];
        if (!e) continue;
        snapshot[cid] = {
          buy: trade.buy === 1 || !Number.isFinite(e.lastBuy) ? e.lastBuy : e.lastBuy * trade.buy,
          sell: trade.sell === 1 || !Number.isFinite(e.lastSell) ? e.lastSell : e.lastSell * trade.sell,
          demandMult: Number(e.demandMult) || 1,
          demandDrivers: Array.isArray(e.demandDrivers) ? e.demandDrivers.map((driver) => ({ ...driver })) : [],
        };
      }
      const memory = this.recordMarketMemory(station.id, snapshot, { source: 'survey' });
      if (!memory) continue;
      stationCount++;
      listingCount += Object.keys(memory).length;
    }
    return { stationCount, listingCount };
  },

  /** Player-facing price memory: dock observations plus purchased survey snapshots, saved on player. */
  recordMarketMemory(stationId, snapshot = null, options = null) {
    const state = this.state;
    if (!stationId || !state || !state.player) return null;
    const market = snapshot || (state.economy && state.economy.markets && state.economy.markets[stationId]);
    if (!market) return null;
    const source = options && (options.source === 'survey' || options.source === 'uplink') ? options.source : null;
    const memory = ensurePlayerMarketMemory(state.player);
    const stationMemory = memory[stationId] || (memory[stationId] = {});
    for (const cid in market) {
      const e = market[cid];
      if (!e) continue;
      const buy = e.buy != null ? e.buy : e.lastBuy;
      const sell = e.sell != null ? e.sell : e.lastSell;
      if (!Number.isFinite(Number(buy)) && !Number.isFinite(Number(sell))) continue;
      const prior = stationMemory[cid];
      // A real visit is stronger knowledge than a survey packet. Duplicate/replayed chart events
      // may refresh survey-grade memory, but can never downgrade a direct dock observation.
      if (source === 'survey' && prior && prior.source !== 'survey') continue;
      const record = {
        buy: Math.round(Number(buy) || 0),
        sell: Math.round(Number(sell) || 0),
        seenAt: Math.max(0, Number(state.simTime) || 0),
        demandMult: Number(e.demandMult) || 1,
        demandDrivers: Array.isArray(e.demandDrivers) ? e.demandDrivers.map((driver) => ({ ...driver })) : [],
      };
      // A berth the player physically made outranks the feed: the uplink may refresh the quotes,
      // but the record keeps its dock provenance — the visit is the stronger fact.
      const keepDockProvenance = source === 'uplink' && prior && prior.source == null;
      if (source && !keepDockProvenance) record.source = source;
      stationMemory[cid] = record;
    }
    return stationMemory;
  },

  // -------------------------------------------------------------------------------------------
  // QUOTE / EXECUTE  (the public trade API; UI calls quote() live, execute() on confirm)
  // -------------------------------------------------------------------------------------------
  /** quote(stationId, cmdtyId, side, qty) -> { ok, unitAvg, total, priceImpactPct, stockAfter,
   *  legalityWarning, reason } — no transaction writes; may initialize a lazy market/cycle. side = 'buy' | 'sell'. */
  quote(stationId, commodityId, side, qty, opts = null) {
    qty = normalizedTradeQuantity(qty);
    if (side !== 'buy' && side !== 'sell') return { ok: false, reason: 'side' };
    if (qty === null) return { ok: false, reason: 'qty' };
    const state = this.state;
    if (stationId === TETHYS_BLACK_MARKET_RUN.stationId && !hasTethysBlackMarketAccess(state)) {
      return { ok: false, reason: 'black_market_locked', unitAvg: 0, total: 0, priceImpactPct: 0, stockAfter: 0 };
    }
    const market = state.economy.markets[stationId];
    const def = commodityDef(state, commodityId);
    if (!def) return { ok: false, reason: 'untraded', unitAvg: 0, total: 0, priceImpactPct: 0, stockAfter: 0 };
    const info = stationInfo(state, stationId);
    const stationTier = info ? Math.max(0, Number(info.tier) || 0) : 0;
    const marketTier = Math.max(0, Number(def.marketTier) || 0);
    const free = side === 'sell' && opts?.operationCustody !== true ? sealedSellFree(state, commodityId, qty) : null;
    // Alien Ecology AE-077 — a quarantine refusal bars custody, including the first quote.
    const refusal = side === 'sell' ? biohazardSaleRefusal(state, info, def) : null;
    let entry = market && market[commodityId];
    if (!entry) {
      // Stateless read: the pure listing book prices a never-minted market, and the
      // liquidation book prices a player-brought good without a live row. Quote
      // itself stays read-only — minting is a settlement concern (execute/pressure).
      const produced = producedAtStation(info, stationId, def);
      const ldef = listingDefFor(def, info, stationId, { producedHere: produced });
      if (ldef) {
        entry = {
          equilibrium: ldef.eq, baseEq: ldef.baseEq, role: ldef.role, dents: [],
          stock: ldef.eq, lastMid: 0, lastBuy: 0, lastSell: 0,
          demandMult: 1, demandDrivers: [], transient: true,
        };
      } else {
        if (def.noMarketSeed !== true && marketTier <= stationTier && !produced) {
          return { ok: false, reason: 'untraded', unitAvg: 0, total: 0, priceImpactPct: 0, stockAfter: 0 };
        }
        // Liquidation pricing honors the same legality gate as seeding: a lawful port does not
        // conjure a narcotics book because a carrier happened to bring one.
        if ((def.legality === 'contraband' || def.legality === 'illegal') && !toleratesContraband(info)) {
          return { ok: false, reason: 'untraded', unitAvg: 0, total: 0, priceImpactPct: 0, stockAfter: 0 };
        }
        const baseEqRef = (BALANCE.commodities[def.id]?.baseEq || BASE_EQ_DEFAULT)
          * (SIZE_FACTOR[(info && info.size) || 'M'] || 1);
        entry = {
          equilibrium: 0, baseEq: baseEqRef, role: 'none', dents: [],
          stock: 0, lastMid: 0, lastBuy: 0, lastSell: 0,
          demandMult: 1, demandDrivers: [], transient: true,
        };
      }
      this._stampEntryQuote(entry, def, stationId, commodityId);
    }
    if (free != null) {
      return {
        ok: false, reason: 'mission_cargo_locked',
        ...(free > 0 ? { free } : {}),
        unitAvg: entry?.lastSell || 0, total: 0,
        priceImpactPct: 0, stockAfter: entry?.stock ?? 0,
      };
    }
    if (refusal) {
      // The refusal itself mints the liquidation row: the berth saw the lot and named
      // its quarantine, so the empty book persists — priced (lastSell) but permanently
      // stocked at zero (equilibrium 0), never healing into sellable stock.
      if (entry && entry.transient) {
        entry = this._liveEntryForWrite(stationId, commodityId, def) || entry;
      }
      return {
        ok: false, reason: 'contamination_refusal', policyNote: refusal.note || null,
        unitAvg: entry?.lastSell || 0, total: 0, priceImpactPct: 0, stockAfter: entry?.stock ?? 0,
        legalityWarning: def.legality !== 'legal' ? def.legality : null,
      };
    }
    const standingBase = priceModForState(state, info && info.factionId);
    // THE WORLD REMEMBERS — a strike worsens what this berth pays the player; a blockade makes
    // its goods dear. One lookup, applied here so quote/execute/automation all see the same price.
    // The causal half (strike, blockade) only worsens and rides the standing clamp; the calendar
    // half (market day, festival) moves either way and is applied after it, like the ending terms.
    const { causal: conditionMult, calendar: calendarMult } = stationTradeMultParts(state, stationId, info);
    const frontier = info ? this.frontierPenalty(info) : 0;
    const tNow = state.simTime || 0;
    const ctx = marketContextFor(state, stationId, commodityId, entry);
    // A quote is an observation: a minted row re-stamps its displayed price on
    // read, so the book the screen shows is always the price it was just quoted.
    if (!entry.transient) this._stampEntryQuote(entry, def, stationId, commodityId, tNow);
    const stockNow = shelfUnitsAt(entry, commodityId, tNow);
    const evInfo = ctx
      ? eventsAffecting(ctx.seed, ctx.sectorId, stationId, commodityId, tNow,
        ctx.events, ctx.stations, ctx.goodPool)
      : { levelMult: 1, spreadMult: 1, active: [] };
    const spread = spreadOf(evInfo.spreadMult, frontier);
    // Reputation alone, before the strike/blockade multiply. The market names this component
    // separately from scarcity, fees and stale intel (board row 321).
    const standingOnly = commodityStandingMultipliers(spread, standingBase, {});
    const standing = commodityStandingMultipliers(spread, standingBase, conditionMult);
    const endingTerms = endingStationTradeMults(state, stationId);
    standing.buy *= endingTerms.buy;
    standing.sell *= endingTerms.sell;
    standing.buy *= calendarMult.buy;
    standing.sell *= calendarMult.sell;
    // Low-tier ports buy valuable finds from the player but do not create an infinite local
    // supply of resources that only occur deeper in the world. This preserves discovery value
    // and stops starter markets from becoming risk-free rare-ore vending machines.
    if (side === 'buy' && marketTier > stationTier && !producedAtStation(info, stationId, def)) {
      return {
        ok: false, reason: 'tier_unavailable', unitAvg: entry.lastBuy * standing.buy, total: 0,
        priceImpactPct: 0, stockAfter: stockNow, marketTier, stationTier,
        legalityWarning: def.legality !== 'legal' ? def.legality : null,
      };
    }
    if (qty <= 0) {
      const u = side === 'buy' ? entry.lastBuy * standing.buy : entry.lastSell * standing.sell;
      return { ok: false, reason: 'qty', unitAvg: u, total: 0, priceImpactPct: 0, stockAfter: stockNow, legalityWarning: def.legality !== 'legal' ? def.legality : null };
    }
    if (!Number.isFinite(stockNow) || stockNow < 0 || !(entry.baseEq > 0)) {
      return { ok: false, reason: 'invalid_market' };
    }
    const requestedQty = qty;
    if (side === 'buy') qty = Math.min(qty, Math.max(0, Math.floor(stockNow - 1)));
    if (qty <= 0) return { ok: false, reason: 'no_stock' };
    const el = def.elasticity;
    // Benefits cannot invert the same-port spread over an unchanged stock interval.
    const bidFactor = 1 - spread / 2;
    const sellMultiplier = bidFactor > 0
      ? Math.min(standing.sell, standing.buy * (1 + spread / 2) / bidFactor)
      : standing.sell;
    const stockAfter = side === 'buy' ? stockNow - qty : stockNow + qty;
    // Closed-form lot pricing: the same bounded dent-curve integral that used to run
    // through live stock, evaluated against the shelf position the lot would leave.
    const avgMidPrice = ctx ? marketAvgMidAt(ctx, tNow,
      Math.min(stockNow, stockAfter), Math.max(stockNow, stockAfter)) : def.basePrice;
    const standingPriceMultiplier = side === 'buy' ? standing.buy : sellMultiplier;
    const marketUnitAvg = side === 'buy' ? avgMidPrice * (1 + spread / 2) : avgMidPrice * (1 - spread / 2);
    const unitAvg = marketUnitAvg * standingPriceMultiplier;
    const total = settleCredits(unitAvg * qty, side);
    if (total === null) return { ok: false, reason: 'invalid_total' };
    // ECON-10: attribution of the scarcity already in this quote, never an extra payout.
    // Capture it before settlement feeds the hopper and refreshes the shortage board.
    const postedNeed = side === 'sell' && info
      ? starvedIndustryNeedFor(info.type, info.tier || 0, market, tNow) : null;
    const shortagePremium = side === 'sell' && stockNow < entry.baseEq
      && (postedNeed?.inputId === commodityId || evInfo.active.some((event) =>
        event.type === 'shortage' && (!event.goods || event.goods.includes(commodityId)
          || event.goods.includes('*'))));
    // The price-impact read is the dent deviation the lot would leave: same ±15% cap
    // the persistent market memory heals against.
    const eqRef = Math.max(1, Number(entry.eq ?? entry.equilibrium) || Number(ctx && ctx.eq) || 1);
    const devBefore = clamp(Math.pow(Math.max(1, stockNow) / eqRef, -el), DENT_DEV_LO, DENT_DEV_HI);
    const devAfter = clamp(Math.pow(Math.max(1, stockAfter) / eqRef, -el), DENT_DEV_LO, DENT_DEV_HI);
    const priceImpactPct = devBefore > 0 ? ((devAfter - devBefore) / devBefore) * 100 : 0;
    // NXI-102: the commit also binds whole-unit hold capacity on a buy. The quote names that
    // accepted quantity under the same capacity rule and prices it on the same curve, so a
    // nearly full hold cannot preview a fraction the settlement rejects or reprices. The
    // market answer (qty/unitAvg/total) stays the pure book side for intel and automation reads.
    let acceptQty = qty;
    let acceptUnitAvg = unitAvg;
    let acceptTotal = total;
    if (side === 'buy' && state.player && state.player.cargo) {
      const canFit = slotFitFor(state, commodityId);
      if (canFit < qty) {
        acceptQty = canFit;
        if (acceptQty > 0) {
          const acceptStockAfter = stockNow - acceptQty;
          const acceptMid = ctx ? marketAvgMidAt(ctx, tNow,
            Math.min(stockNow, acceptStockAfter), Math.max(stockNow, acceptStockAfter)) : def.basePrice;
          acceptUnitAvg = acceptMid * (1 + spread / 2) * standingPriceMultiplier;
          acceptTotal = settleCredits(acceptUnitAvg * acceptQty, side);
        } else {
          acceptUnitAvg = 0;
          acceptTotal = 0;
        }
      }
    }
    return {
      ok: true, stationId, commodityId, side, qty, requestedQty, partial: qty !== requestedQty,
      unitAvg, total,
      ...(shortagePremium ? { shortagePremium: true } : {}),
      acceptQty, acceptUnitAvg, acceptTotal, holdLimited: acceptQty < qty,
      priceImpactPct, stockAfter,
      standingPriceMultiplier,
      // The waiver is a property of the berth's standing, not of which side was asked.
      // A sold-out buy must not be the only quote that can say the surcharge was waived.
      stationSurchargeWaived: standing.surchargeWaived === true,
      reputationBuyMult: standingOnly.buy,
      reputationSellMult: standingOnly.sell,
      legalityWarning: def.legality !== 'legal' ? def.legality : null,
    };
  },

  /**
   * Bound a programmed standing-order delivery to this depot's real receiving room.
   * Player manual quote/execute is unchanged. Does not move stock or credits.
   * Intake target is ceil(2 * equilibrium): operating stock plus one reserve, at least 1.
   */
  quoteAutomationIntake(stationId, commodityId, qty, opts = null) {
    const state = this.state;
    const requested = Math.max(0, Math.floor(Number(qty) || 0));
    const refuse = (reason, stock = 0, intakeTarget = 0) => ({
      ok: false,
      reason,
      fillable: 0,
      unitAvg: 0,
      total: 0,
      stock,
      intakeTarget,
    });
    if (!stationId || !commodityId || !state || !state.economy) return refuse('untraded');
    const market = state.economy.markets[stationId] || this.ensureMarket(stationId);
    const entry = market && market[commodityId];
    const def = commodityDef(state, commodityId);
    if (!entry || !def) return refuse('untraded');
    const eff = Number(entry.eq ?? entry.equilibrium) || 0;
    const intakeTarget = Math.max(1, Math.ceil(2 * eff));
    const stock = shelfUnitsAt(entry, commodityId, state.simTime || 0);
    const operation = opts?.operation;
    const outpost = opts?.outpost;
    const operationOwned = operation && state.automation?.drones?.includes(operation)
      && operation.shipment?.owner === `operation:${operation.id}`;
    const outpostOwned = outpost && state.automation?.outposts?.includes(outpost)
      && outpostCommodity(outpost) === commodityId
      && stationInfo(state, stationId)?.sectorId === outpost.sectorId;
    if (operation && !operationOwned) return refuse('invalid_custody', stock, intakeTarget);
    if (outpost && !outpostOwned) return refuse('invalid_custody', stock, intakeTarget);
    const ownedCustody = operationOwned || outpostOwned;
    const operationQty = outpostOwned ? Math.max(0, Math.floor(Number(outpost.storage) || 0))
      : operationOwned ? Math.max(0, Math.floor(Number(operation.shipment.items?.[commodityId]) || 0)) : null;
    const sellable = !ownedCustody && reservedCargoQuantity(state, commodityId) > 0
      ? sellableCargoQuantity(state, commodityId)
      : null;
    if (sellable !== null && (sellable <= 0 || requested > sellable)) {
      return refuse('mission_cargo_locked', stock, intakeTarget);
    }
    const headroom = Math.max(0, Math.floor(intakeTarget - stock));
    const fillable = ownedCustody ? Math.min(requested, headroom, operationQty) : sellable === null
      ? Math.min(requested, headroom)
      : Math.min(requested, headroom, sellable);
    if (fillable <= 0) {
      return refuse(headroom <= 0 ? 'demand_saturation' : 'qty', stock, intakeTarget);
    }
    const quoted = this.quote(stationId, commodityId, 'sell', fillable, { operationCustody: !!ownedCustody });
    if (!quoted || quoted.ok !== true) {
      return refuse((quoted && quoted.reason) || 'untraded', stock, intakeTarget);
    }
    if (operationOwned) {
      const payout = Math.round(Number(quoted.total));
      const receivingRoom = CREDITS_MAX - normalizeCredits(state.player && state.player.credits);
      if (!Number.isSafeInteger(payout) || payout > receivingRoom) {
        return refuse('credit_limit', stock, intakeTarget);
      }
    }
    return {
      ok: true,
      reason: null,
      fillable,
      unitAvg: quoted.unitAvg,
      total: quoted.total,
      stock,
      intakeTarget,
    };
  },

  // The output belongs to the facility, never to the pilot hold. The receiving market bounds
  // the quantity; the automation owner supplies its remaining income budget. Partial fills
  // are repriced on the actual curve rather than multiplying a larger shipment's average.
  quoteOutpostIntake(stationId, outpost, quantity, { maxCredit = 0, payoutScale = 0.8 } = {}) {
    const good = outpostCommodity(outpost);
    if (!good || !Number.isFinite(payoutScale) || payoutScale <= 0 || payoutScale > 1)
      return { ok: false, reason: 'invalid_custody' };
    const q = this.quoteAutomationIntake(stationId, good, quantity, { outpost });
    if (!q.ok) return q;
    const walletRoom = CREDITS_MAX - normalizeCredits(this.state.player?.credits);
    const budget = Number.isFinite(maxCredit) ? Math.max(0, Math.floor(maxCredit)) : 0;
    const ceiling = Math.min(walletRoom, budget);
    const payoutFor = count => {
      const priced = this.quote(stationId, good, 'sell', count, { operationCustody: true });
      return priced?.ok ? { gross: priced.total, credited: Math.floor(priced.total * payoutScale) } : null;
    };
    let low = 0, high = q.fillable;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      const price = payoutFor(mid);
      if (price && price.credited <= ceiling) low = mid; else high = mid - 1;
    }
    const price = low > 0 ? payoutFor(low) : null;
    if (!price || price.credited <= 0) return { ok: false,
      reason: walletRoom <= budget ? 'credit_limit' : 'passive_limit', fillable: 0 };
    return { ok: true, stationId, good, quantity: low, requestedQty: quantity,
      gross: price.gross, credited: price.credited, unitPrice: price.gross / low,
      stock: q.stock, intakeTarget: q.intakeTarget, payoutScale };
  },

  // Commit all output/stock/receipt facts before dispatching a credit event. The callback is
  // the automation writer's no-event custody commit; economy alone changes stock and credits.
  // A single monotonically numbered last receipt stays on the facility, not an unbounded journal.
  executeOutpostIntake(stationId, outpost, quantity, options, commitOutput) {
    if (!outpost || !this.state.automation?.outposts?.includes(outpost)
      || typeof commitOutput !== 'function') return { ok: false, reason: 'invalid_custody' };
    const sequence = options?.sequence;
    if (!Number.isSafeInteger(sequence) || sequence < 1) return { ok: false, reason: 'invalid_intent' };
    const prior = outpost.lastSale;
    if (prior?.sequence === sequence) {
      if (prior.stationId !== stationId || prior.requestedQty !== quantity) return { ok: false, reason: 'intent_conflict' };
      return { ok: true, duplicate: true, receipt: { ...prior } };
    }
    if (sequence !== (outpost.saleSequence || 0) + 1) return { ok: false, reason: 'stale_intent' };
    this._outpostIntakesInFlight ||= new WeakSet();
    if (this._outpostIntakesInFlight.has(outpost)) return { ok: false, reason: 'intent_pending' };
    this._outpostIntakesInFlight.add(outpost);
    try {
      const ownerState = this.state.economy, playerState = this.state.player;
      const quote = this.quoteOutpostIntake(stationId, outpost, quantity, options);
      if (!quote.ok) return quote;
      const entry = this.state.economy.markets[stationId]?.[quote.good];
      const def = commodityDef(this.state, quote.good);
      const shelfNow = entry ? shelfUnitsAt(entry, quote.good, this.state.simTime || 0) : 0;
      if (!entry || !def || shelfNow !== quote.stock) return { ok: false, reason: 'market_changed' };
      const receipt = { id: `outpost-sale:${outpost.id}:${sequence}`, sequence,
        stationId, good: quote.good, requestedQty: quantity, quantity: quote.quantity,
        gross: quote.gross, credited: quote.credited, unitPrice: quote.unitPrice,
        simTime: this.state.simTime || 0 };
      if (commitOutput(receipt) !== true) return { ok: false, reason: 'custody_changed' };
      appendDent(entry, quote.good, this.state.simTime || 0, quote.quantity);
      this.recomputeLivePrices(entry, def, stationId, quote.good);
      this.grantCredits(quote.credited, 'automation:outpost');
      if (this.state.economy !== ownerState || this.state.player !== playerState
        || !this.state.automation?.outposts.includes(outpost)) return { ok: true, duplicate: false, receipt };
      this.snapshotIntel(stationId);
      this.bus.emit('economy:automationIntake', { ...receipt, operationId: outpost.id });
      return { ok: true, duplicate: false, receipt };
    } finally {
      this._outpostIntakesInFlight.delete(outpost);
    }
  },

  /** execute(stationId, cmdtyId, side, qty, opts?) -> { ok, qty, unitAvg, total, profit?, reason, duplicate? }.
   *  Validate-then-apply (transactional): a failed credit/cargo/stock check changes nothing.
   *  PQ-177.06: opts.intentId makes a successful commit idempotent — the same plan returns the
   *  prior receipt instead of paying twice.
   *  INF-084: opts.expectedTotal binds the stated accepted terms. A buy settles only at or
   *  below it, a sell only at or above it; otherwise nothing moves and the caller gets
   *  { ok:false, reason:'price_changed', expectedTotal, liveTotal } to explain why fresh
   *  confirmation is needed. Absent expectedTotal keeps today's live-price behavior. */
  execute(stationId, commodityId, side, qty, opts = null) {
    const state = this.state;
    if (opts && opts.sourceStationId != null && opts.sourceStationId !== stationId) {
      return { ok: false, reason: 'station_changed' };
    }
    if (opts && opts.expectedTotal != null && (!Number.isFinite(Number(opts.expectedTotal)) || Number(opts.expectedTotal) < 0)) {
      return { ok: false, reason: 'bad_terms' };
    }
    if (stationId === TETHYS_BLACK_MARKET_RUN.stationId && !hasTethysBlackMarketAccess(state)) {
      return { ok: false, reason: 'black_market_locked' };
    }
    qty = normalizedTradeQuantity(qty);
    if (side !== 'buy' && side !== 'sell') return { ok: false, reason: 'side' };
    if (qty === null) return { ok: false, reason: 'qty' };
    const intentId = opts && typeof opts.intentId === 'string' && opts.intentId
      ? opts.intentId
      : null;
    if (intentId && (intentId.length > 256 || ['__proto__','constructor','prototype'].includes(intentId))) {
      return { ok: false, reason: 'bad_intent_id' };
    }
    const requestedQty = qty;
    // INF-084: the stated accepted terms ride along for the pre-apply price check below.
    // Non-finite or negative expectations mean "no binding", never "free".
    const expectedTotal = opts && Number.isFinite(Number(opts.expectedTotal)) && Number(opts.expectedTotal) >= 0
      ? Number(opts.expectedTotal) : null;
    this._tradeIntentsInFlight ||= new Set();
    if (intentId && this._tradeIntentsInFlight.has(intentId)) return { ok: false, reason: 'intent_pending' };
    if (this._tradeExecutionInFlight) return { ok: false, reason: 'trade_pending' };
    const intents = intentId ? ensureCommittedIntents(state) : null;
    if (intentId && intents && Object.hasOwn(intents,intentId)) {
      const prior = intents[intentId];
      if (prior.receipt && (prior.receipt.stationId !== stationId || prior.receipt.good !== commodityId
          || prior.receipt.side !== side
          || (prior.receipt.requestedQty != null && prior.receipt.requestedQty !== requestedQty))) return { ok: false, reason: 'intent_conflict' };
      return { ...(prior.result || {}), duplicate: true, receipt: prior.receipt };
    }
    if (intentId) this._tradeIntentsInFlight.add(intentId);
    this._tradeExecutionInFlight = true;
    try {
    // Enforce sealed-freight authority at execution as well as quote. This is the final shared
    // boundary for every station UI (legacy and Orbital Command) and keeps a stale or custom quote
    // adapter from turning mission cargo into credits. NXB-025: a request that would touch the
    // sealed reservation refuses and names the free count; free units still sell.
    if (side === 'sell') {
      const free = sealedSellFree(state, commodityId, qty);
      if (free != null) {
        return { ok: false, reason: 'mission_cargo_locked', ...(free > 0 ? { free } : {}) };
      }
    }
    const q = this.quote(stationId, commodityId, side, qty);
    if (!q.ok) {
      // Keep the refusal's own explanation: a quarantine note the quote attached must reach
      // the player-facing branch, not die on the reason token.
      return { ok: false, reason: q.reason || 'invalid', ...(q.policyNote ? { policyNote: q.policyNote } : {}) };
    }
    if (opts && opts.requireFullQuantity && (q.qty !== requestedQty || q.partial || q.holdLimited
        || (q.acceptQty != null && q.acceptQty !== requestedQty))) return { ok: false, reason: 'load_changed' };
    qty = q.qty;
    const market = state.economy.markets[stationId];
    const def = commodityDef(state, commodityId);
    if (!def) return { ok: false, reason: 'untraded' };
    // The quote may have priced a stateless book; settlement needs the live row
    // so the dent persists. Same listing rules as the read lane — materialize
    // the sparse row rather than minting the whole market.
    const entry = (market && market[commodityId]) || this._liveEntryForWrite(stationId, commodityId, def);
    if (!entry) return { ok: false, reason: 'untraded' };

    const isPlayer = true; // current callers (ui:buy/sell) act on the player hold
    const cargoSys = this.registryGet && this.registryGet('cargo');

    if (side === 'buy') {
      const shelf = shelfUnitsAt(entry, commodityId, state.simTime || 0);
      if (shelf - qty < 1) qty = Math.max(0, Math.floor(shelf - 1)); // can't drain below 1u
      if (qty <= 0) return { ok: false, reason: 'no_stock' };
      // Cargo slot check — slots are the ONLY hard admission cap (CARGO-BUILD-1). slotFitFor
      // answers the whole-unit count the hold can still stack and already fails closed.
      const canFit = slotFitFor(state, commodityId);
      if (canFit < qty) qty = canFit;
      if (qty <= 0) return { ok: false, reason: 'cargo_full' };
      if (opts && opts.requireFullQuantity && qty !== requestedQty) return { ok: false, reason: 'load_changed' };
      const fq = this.quote(stationId, commodityId, 'buy', qty);
      const cost = round(fq.total);
      if (normalizeCredits(state.player.credits) < cost) return { ok: false, reason: 'credits', need: cost };
      // INF-084: worse than the stated terms settles nothing — the caller explains and
      // asks for fresh confirmation instead. Better-or-equal flows through below.
      if (expectedTotal != null && cost > expectedTotal) {
        return { ok: false, reason: 'price_changed', expectedTotal, liveTotal: cost, qty };
      }
      // APPLY
      const added = this.addToCargo(cargoSys, state, commodityId, qty);
      // Fail closed on any non-positive or non-finite accepted count: settling past this
      // line has already loaded goods, so a bad count must never reach the stock/charge legs.
      if (!(added > 0)) return { ok: false, reason: 'cargo_full' };
      const realQty = added;
      const realCost = realQty === qty ? cost : round(this.quote(stationId, commodityId, 'buy', realQty).total);
      // The trade's physical signature is a dent, not a stock write: the shelf heals
      // back to rest on the good's own half-life, and the price follows the closed form.
      appendDent(entry, commodityId, state.simTime || 0, -realQty);
      this.chargeCredits(realCost, 'trade:buy:' + commodityId);
      this.recomputeLivePrices(entry, def, stationId, commodityId);
      const unitAvg = realCost / realQty;
      this.afterTrade(state, stationId, commodityId, 'buy', realQty, unitAvg, realCost, fq.priceImpactPct, def, intentId);
      return this._sealTradeIntent(intentId, {
        ok: true, qty: realQty, unitAvg, total: realCost, priceImpactPct: fq.priceImpactPct,
      }, { stationId, commodityId, side: 'buy', requestedQty });
    } else {
      // SELL — need the stock in cargo
      const have = state.player.cargo.items[commodityId] || 0;
      if (have <= 0) return { ok: false, reason: 'no_cargo' };
      if (qty > have) qty = have;
      if (opts && opts.requireFullQuantity && qty !== requestedQty) return { ok: false, reason: 'load_changed' };
      const fq = this.quote(stationId, commodityId, 'sell', qty);
      const gross = round(fq.total);
      if (normalizeCredits(state.player.credits) > CREDITS_MAX - gross) return { ok: false, reason: 'credits_cap' };
      // INF-084: a sale may never settle for less than stated. See the buy branch above.
      if (expectedTotal != null && gross < expectedTotal) {
        return { ok: false, reason: 'price_changed', expectedTotal, liveTotal: gross, qty };
      }
      // APPLY
      const removed = this.removeFromCargo(cargoSys, state, commodityId, qty);
      // Same fail-closed rule as the buy leg: a bad count must never reach stock/credits.
      if (!(removed > 0)) return { ok: false, reason: 'no_cargo' };
      const realQty = removed;
      const realGross = realQty === qty ? gross : round(this.quote(stationId, commodityId, 'sell', realQty).total);
      appendDent(entry, commodityId, state.simTime || 0, realQty);
      this.grantCredits(realGross, 'trade:sell:' + commodityId);
      this.recomputeLivePrices(entry, def, stationId, commodityId);
      const unitAvg = realGross / realQty;
      const receipt = this.afterTrade(
        state,
        stationId,
        commodityId,
        'sell',
        realQty,
        unitAvg,
        realGross,
        fq.priceImpactPct,
        def,
        intentId,
        fq.shortagePremium === true,
      );
      const profit = receipt ? receipt.profit : 0;
      return this._sealTradeIntent(intentId, {
        ok: true, qty: realQty, unitAvg, total: realGross, priceImpactPct: fq.priceImpactPct, profit,
      }, { stationId, commodityId, side: 'sell', requestedQty });
    }
    } finally {
      this._tradeExecutionInFlight = false;
      if (intentId) this._tradeIntentsInFlight.delete(intentId);
    }
  },

  _sealTradeIntent(intentId, result, meta) {
    if (!intentId || !result || result.ok !== true) return result;
    const intents = ensureCommittedIntents(this.state);
    if (!intents) return result;
    const receipt = {
      id: intentId,
      stationId: meta.stationId,
      good: meta.commodityId,
      side: meta.side,
      quantity: result.qty,
      requestedQty: meta.requestedQty,
      unitPrice: result.unitAvg,
      total: result.total,
      quoteVersion: result.unitAvg,
    };
    intents[intentId] = { result: { ...result }, receipt };
    result.receipt = receipt;
    return result;
  },

  frontierPenaltyFor(state, stationId) {
    const info = stationInfo(state, stationId);
    return info ? this.frontierPenalty(info) : 0;
  },

  /** Add to player cargo via the canonical single-writer cargo helper (§0.6). Returns accepted qty. */
  addToCargo(_cargoSys, state, commodityId, qty) {
    return addCargo(state, commodityId, qty);
  },

  /** Remove from player cargo via the canonical single-writer cargo helper. Returns removed qty. */
  removeFromCargo(_cargoSys, state, commodityId, qty) {
    return removeCargo(state, commodityId, qty);
  },

  /** Common post-trade bookkeeping: stats, intel refresh, emit economy:tradeCompleted. */
  afterTrade(state, stationId, commodityId, side, qty, unitAvg, total, priceImpactPct, def, intentId = null, shortagePremium = false) {
    const info = stationInfo(state, stationId);
    const receipt = this.recordTradeLedger(state, stationId, commodityId, side, qty, unitAvg, total, def);
    if (receipt && side === 'sell' && shortagePremium) receipt.shortagePremium = true;
    const profit = side === 'sell' && receipt ? receipt.profit : null;
    const stats = state.player.stats;
    if (stats) {
      stats.tradesCount = (stats.tradesCount || 0) + 1;
      if (profit != null) {
        stats.lifetimeProfit = (stats.lifetimeProfit || 0) + profit;
        if (profit > (stats.biggestSingleProfit || 0)) stats.biggestSingleProfit = profit;
      }
      if (def && def.legality !== 'legal') stats.smuggledValue = (stats.smuggledValue || 0) + Math.abs(total);
    }
    this.snapshotIntel(stationId);
    this.bus.emit('economy:tradeCompleted', {
      stationId, commodityId, side, qty, unitAvg, total,
      priceImpactPct, profit: profit != null ? profit : undefined,
      factionId: info ? info.factionId : null,
      receiptId: receipt && receipt.receiptId,
      tradeSequence: receipt && receipt.tradeSequence,
      seenAt: receipt && receipt.seenAt,
      intentId,
      ...(receipt?.shortagePremium ? { shortagePremium: true } : {}),
    });
    // AE-138/139 — a biohazard lot that settles is a faction-consequence datum the ecology
    // layer records (sealed custody reads differently than an open-mesh sale).
    if (side === 'sell' && def && def.biohazard === true) {
      const sealed = fittedModuleDefs(state).some((d) => d && d.mods && d.mods.containmentSeal === true);
      this.bus.emit('ecology:factionOutcome', {
        factionId: info ? info.factionId : null,
        outcome: sealed ? 'sealed_sale' : 'biohazard_sale',
        commodityId,
      });
    }
    if (side === 'sell') this._closeCargoKillChain(stationId, commodityId, qty, receipt);
    return receipt;
  },

  /**
   * Open one chain when a laden cargo ship dies. The manifest is read off the live hull. No
   * fine, lock, or mission failure is written here.
   */
  _openCargoKillChain(payload) {
    const state = this.state;
    if (!state || !payload || payload.id == null || payload.id === state.playerId) return null;
    const victim = state.entities && state.entities.get ? state.entities.get(payload.id) : null;
    if (!victim || !victim.data) return null;
    const manifest = victim.data.cargoManifest;
    const lines = cargoManifestLines(manifest);
    if (!lines.length) return null;
    // A chain must open exactly when this hull spilled a body the player can collect.
    // lootShards inits before economy, so for ordinary traffic the manifestPayloadDropped stamp
    // it sets inside this same emit is already visible — it is the exact "a collectible body
    // exists" truth (civilian, valid manifest, finite pos, feature flag, one-per-hull), and
    // re-deriving those gates here would drift. Authored convoy carriers spill freight custody
    // pods through encounterScripts instead, flag-free. Mission-owned and run-owned hulls spill
    // neither, so a chain recorded for one could never close.
    const vdata = victim.data;
    const custody = vdata.freightCustody;
    const custodyOwned = vdata.freightRewardOwner === 'manifest_custody'
      || !!(custody && (custody.status === 'carrier' || custody.status === 'spilled' || custody.custodyId != null));
    if (missionOwnsReward(victim) || runOwnsReward(victim)) return null;
    if (!custodyOwned && vdata.manifestPayloadDropped !== true) return null;
    const econ = state.economy;
    if (!econ) return null;
    const chains = ensureCargoKillChains(econ);
    // One chain per hull, open or closed: a duplicate kill observation after close must not
    // re-mint the same deterministic chain and re-fire its price move.
    if (chains.some((row) => row && row.victimId === victim.id)) return null;
    const primary = lines.slice().sort((a, b) => b.qty - a.qty || a.commodityId.localeCompare(b.commodityId))[0];
    const pos = victim.pos || payload.pos || { x: 0, z: 0 };
    const chain = normalizeCargoKillChain({
      id: `ck_${hash32((state.meta && state.meta.seed) || 1, victim.id, primary.commodityId, 'cargo-kill').toString(36)}`,
      victimId: victim.id,
      manifestId: typeof manifest.manifestId === 'string' ? manifest.manifestId : null,
      sectorId: payload.sectorId || (state.world && state.world.currentSectorId) || null,
      pos: { x: Number(pos.x) || 0, z: Number(pos.z) || 0 },
      commodityId: primary.commodityId,
      qty: primary.qty,
      lines,
      destStationId: manifest.destStationId || manifest.destinationId || null,
      originStationId: manifest.originStationId || manifest.originId || null,
      salvaged: {},
      closed: false,
    });
    if (!chain) return null;
    chains.push(chain);
    while (chains.length > CARGO_KILL_CHAIN_CAP) {
      const closedAt = chains.findIndex((row) => row && row.closed);
      chains.splice(closedAt >= 0 ? closedAt : 0, 1);
    }
    return chain;
  },

  /** Credit salvage only when the collected body is the killed hull's own manifest payload. */
  _noteCargoKillSalvage(payload) {
    const state = this.state;
    if (!state || !payload || payload.collectorId !== state.playerId) return null;
    const chains = state.economy && state.economy.cargoKillChains;
    if (!Array.isArray(chains) || !payload.commodityId) return null;
    const accepted = payload.acceptedAmount != null
      ? Math.floor(Number(payload.acceptedAmount) || 0)
      : Math.floor(Number(payload.amount) || 0);
    if (accepted <= 0) return null;
    const pickup = payload.pickupId != null && state.entities && state.entities.get
      ? state.entities.get(payload.pickupId)
      : null;
    const data = pickup && pickup.data || {};
    // Prefer the exact victim match — two live chains sharing a manifestId must not cross-credit.
    const chain = chains.find((row) => row && !row.closed
        && data.sourceVictimId != null && row.victimId === data.sourceVictimId)
      || chains.find((row) => row && !row.closed && (
        (data.manifestId && row.manifestId && row.manifestId === data.manifestId)
        // Authored convoy carriers spill freight custody pods, not manifest payloads — the pod
        // carries the same manifestId under its custody annotation.
        || (data.freightCustodyPod && data.freightCustodyPod.manifestId && row.manifestId
          && row.manifestId === data.freightCustodyPod.manifestId)
      ));
    if (!chain) return null;
    if (!(chain.lines || []).some((line) => line.commodityId === payload.commodityId)) return null;
    chain.salvaged[payload.commodityId] = (chain.salvaged[payload.commodityId] || 0) + accepted;
    return chain;
  },

  /**
   * After the salvaged goods are sold, raise the destination price. The shipment never arrived,
   * so that station's book tightens. One chain, one move — and that move happens only once the
   * chain's own salvaged units of the sold good are consumed: an ordinary hold sale that shares
   * the commodity id debits the count it actually redeems, it does not settle the chain early.
   */
  _closeCargoKillChain(saleStationId, commodityId, qty, receipt = null) {
    const state = this.state;
    const chains = state && state.economy && state.economy.cargoKillChains;
    if (!Array.isArray(chains) || !commodityId) return null;
    let remaining = Math.max(0, Math.floor(Number(qty) || 0));
    if (remaining <= 0) return null;
    const facts = [];
    // Cargo is fungible in the hold. Redeem a bulk sale against outstanding manifests in
    // ledger order, so one sale can settle every chain whose salvaged units it actually sold.
    for (const chain of chains) {
      if (remaining <= 0) break;
      if (!chain || chain.closed || !chain.salvaged) continue;
      const outstanding = Math.max(0, Math.floor(Number(chain.salvaged[commodityId]) || 0));
      if (outstanding <= 0) continue;
      const consumed = Math.min(remaining, outstanding);
      remaining -= consumed;
      chain.salvaged[commodityId] = outstanding - consumed;
      const redeemed = chain.redeemed && typeof chain.redeemed === 'object'
        ? chain.redeemed : (chain.redeemed = {});
      redeemed[commodityId] = Math.max(0, Math.floor(Number(redeemed[commodityId]) || 0)) + consumed;
      if (chain.salvaged[commodityId] > 0) continue; // unsold units keep this chain open
      delete chain.salvaged[commodityId];
      const hasOtherOutstanding = Object.values(chain.salvaged)
        .some((units) => Math.max(0, Math.floor(Number(units) || 0)) > 0);
      if (!hasOtherOutstanding) {
        chain.closed = true;
        chain.saleStationId = saleStationId;
      }
      const priceStationId = priceStationForCargoKill(saleStationId, chain);
      let midBefore = null;
      let midAfter = null;
      if (priceStationId) {
        const market = this.ensureMarket(priceStationId);
        const entry = market && market[commodityId];
        const def = commodityDef(state, commodityId);
        const shelfNow = entry ? shelfUnitsAt(entry, commodityId, state.simTime || 0) : 0;
        if (entry && def && shelfNow > 1) {
          midBefore = entry.lastMid;
          let guard = 0;
          while (entry.lastMid <= midBefore && guard < 4
            && shelfUnitsAt(entry, commodityId, state.simTime || 0) > 2) {
            const prevMid = entry.lastMid;
            const step = Math.max(1, Math.ceil((entry.baseEq || 1) * 0.08));
            this.applyStockPressure(priceStationId, commodityId, 'buy',
              Math.min(step, shelfUnitsAt(entry, commodityId, state.simTime || 0) - 1));
            guard += 1;
            // Pinned at the price band — further pressure burns stock without moving the mid.
            if (entry.lastMid === prevMid) break;
          }
          midAfter = entry.lastMid;
        }
      }
      if (receipt && receipt.receiptId && receipt.side === 'sell' && receipt.stationId === saleStationId
        && receipt.commodityId === commodityId && midBefore != null && midAfter > midBefore) {
        const receipts = chain.pressureReceipts || (chain.pressureReceipts = {});
        receipts[commodityId] = { receiptId: receipt.receiptId, stationId: priceStationId,
          saleStationId, seenAt: receipt.seenAt, qty: consumed };
      }
      const fact = {
        kind: 'price_move',
        opportunity: 'price_move',
        chainId: chain.id,
        victimId: chain.victimId,
        manifestId: chain.manifestId,
        commodityId,
        qty: Math.max(0, Math.floor(Number(chain.redeemed[commodityId]) || 0)),
        saleStationId,
        stationId: priceStationId,
        sectorId: chain.sectorId,
        pos: { x: chain.pos.x, z: chain.pos.z },
        midBefore,
        midAfter,
        moved: midBefore != null && midAfter != null && midAfter > midBefore,
      };
      this.bus.emit('economy:cargoKillOpportunity', fact);
      facts.push(fact);
    }
    return facts.length === 0 ? null : facts.length === 1 ? facts[0] : facts;
  },

  recordTradeLedger(state, stationId, commodityId, side, qty, unitAvg, total, def) {
    const player = state && state.player;
    if (!player || !commodityId || qty <= 0) return null;
    const { ledger, lots, margins } = ensurePlayerTradeState(player);
    const cleanQty = Math.max(0, Math.floor(Number(qty) || 0));
    const cleanUnit = Number(unitAvg) || 0;
    let basisUnit = cleanUnit;
    let marginPerUnit = 0;
    let profitCr = 0;
    if (side === 'buy') {
      const queue = lots[commodityId] || (lots[commodityId] = []);
      queue.push({ qty: cleanQty, unit: cleanUnit });
    } else if (side === 'sell') {
      basisUnit = this.consumeTradeLots(lots, commodityId, cleanQty, def);
      marginPerUnit = cleanUnit - basisUnit;
      profitCr = Math.round(marginPerUnit * cleanQty);
      // FB-047: roll the margin into the lifetime per-commodity bucket — the ten-receipt ledger
      // forgets, the roll-up survives the whole career.
      const margin = margins[commodityId] || (margins[commodityId] = {
        sales: 0, units: 0, profitCr: 0, bestMarginUnit: null, worstMarginUnit: null,
      });
      margin.sales += 1;
      margin.units += cleanQty;
      margin.profitCr += profitCr;
      const marginUnit = Math.round(marginPerUnit);
      if (margin.bestMarginUnit == null || marginUnit > margin.bestMarginUnit) margin.bestMarginUnit = marginUnit;
      if (margin.worstMarginUnit == null || marginUnit < margin.worstMarginUnit) margin.worstMarginUnit = marginUnit;
    }
    const tradeSequence = nextTradeSequence(player, ledger);
    const seed = (Number(state && state.meta && state.meta.seed) >>> 0) || 1;
    const entry = {
      receiptId: `trade:${seed.toString(36)}:${tradeSequence.toString(36)}`,
      tradeSequence,
      stationId,
      commodityId,
      side,
      qty: cleanQty,
      unit: Math.round(cleanUnit),
      buyUnit: Math.round(basisUnit),
      marginPerUnit: Math.round(marginPerUnit),
      profit: profitCr,
      seenAt: Math.max(0, Number(state.simTime) || 0),
      total: Math.round(Number(total) || 0),
    };
    ledger.unshift(entry);
    if (ledger.length > TRADE_LEDGER_MAX) ledger.length = TRADE_LEDGER_MAX;
    return entry;
  },

  consumeTradeLots(lots, commodityId, qty, def) {
    const queue = lots[commodityId] || (lots[commodityId] = []);
    let remaining = Math.max(0, Math.floor(Number(qty) || 0));
    let cost = 0;
    let covered = 0;
    while (remaining > 0 && queue.length) {
      const lot = queue[0];
      const take = Math.min(remaining, Math.max(0, Math.floor(Number(lot.qty) || 0)));
      if (take <= 0) { queue.shift(); continue; }
      cost += take * (Number(lot.unit) || 0);
      covered += take;
      remaining -= take;
      lot.qty -= take;
      if (lot.qty <= 0) queue.shift();
    }
    if (remaining > 0) {
      const fallback = def && Number(def.basePrice) || 0;
      cost += remaining * fallback;
      covered += remaining;
    }
    return covered > 0 ? cost / covered : (def && Number(def.basePrice) || 0);
  },

  /** UI/NPC entry: validate against the docked station context then execute. */
  handleTrade(commodityId, side, qty, opts = null) {
    const state = this.state;
    const stationId = this.dockedStationId();
    if (!stationId) {
      this.bus.emit('toast', { text: 'Not docked', kind: 'error', ttl: 2 });
      this.bus.emit('economy:tradeFailed', {
        stationId: null,
        commodityId,
        side,
        qty: Math.max(0, Math.floor(Number(qty) || 0)),
        reason: 'not_docked',
        intentId: opts && opts.intentId,
      });
      return { ok: false, reason: 'not_docked' };
    }
    const res = this.execute(stationId, commodityId, side, qty, opts);
    if (!res.ok) {
      // INF-084: a stale quote explains itself — the market moved past the stated terms,
      // so nothing settled and the screen should ask for fresh confirmation.
      const msg = res.reason === 'credits' ? 'Insufficient credits'
        : res.reason === 'cargo_full' ? 'Cargo hold full'
        : res.reason === 'no_cargo' ? 'Nothing to sell'
        : res.reason === 'mission_cargo_locked'
          ? (res.free > 0
            ? `Only ${res.free} units are yours to sell; the rest are sealed`
            : 'Sealed contract cargo cannot be sold')
        : res.reason === 'black_market_locked' ? 'Smuggler Den requires the Quiet entrance delivery. Follow the Tethys contact.'
        : res.reason === 'no_stock' ? 'Station out of stock'
        : res.reason === 'price_changed'
          ? `Price changed since the quote (${Math.round(res.liveTotal)} vs ${Math.round(res.expectedTotal)} cr) — review and confirm again.`
        : res.reason === 'contamination_refusal'
          ? (res.policyNote || 'This berth refuses contaminated goods — the lot stays in your hold')
        : res.reason === 'load_changed' ? 'The load changed since the quote — review and confirm again'
        : res.reason === 'credits_cap' ? 'Sale refused — the proceeds would overflow the ledger'
        : res.reason === 'untraded' ? 'This berth does not trade that good'
        : 'Trade failed';
      this.bus.emit('toast', { text: msg, kind: 'error', ttl: 3 });
      this.bus.emit('economy:tradeFailed', {
        stationId,
        commodityId,
        side,
        qty: Math.max(0, Math.floor(Number(qty) || 0)),
        reason: res.reason || 'invalid',
        need: res.need,
        expectedTotal: res.expectedTotal,
        liveTotal: res.liveTotal,
        intentId: opts && opts.intentId,
      });
      // AE-139 — the refusal itself is a remembered datum: the ecology layer tallies it
      // under the station's faction.
      if (res.reason === 'contamination_refusal') {
        const info = stationInfo(state, stationId);
        this.bus.emit('ecology:factionOutcome', {
          factionId: info ? info.factionId : null,
          outcome: 'custody_refused',
          commodityId,
        });
      }
    }
    return res;
  },

  /** Move stock without crediting anyone (automation trade pressure). A pressure
   *  write is a dent: the shelf deviation it stamps heals on the good's own
   *  half-life exactly like a player's lot. */
  applyStockPressure(stationId, commodityId, side, qty, options = null) {
    if (!Number.isFinite(qty) || qty <= 0 || qty > 1_000_000 || (side !== 'buy' && side !== 'sell')) return;
    const state = this.state;
    const def = commodityDef(state, commodityId);
    if (!def) return;
    // A dent must persist somewhere, so pressure materializes exactly the one row it
    // touches — the rest of that station's book stays stateless.
    const entry = this._liveEntryForWrite(stationId, commodityId, def);
    if (!entry) return;
    const atT = options && Number.isFinite(options.asOfSimTime) ? options.asOfSimTime : (state.simTime || 0);
    appendDent(entry, commodityId, atT, side === 'buy' ? -qty : qty);
    if (options && options.deferDerivedRefresh === true) {
      if (options.touchedListings instanceof Map) {
        let stationListings = options.touchedListings.get(stationId);
        if (!stationListings) {
          stationListings = new Set();
          options.touchedListings.set(stationId, stationListings);
        }
        stationListings.add(commodityId);
      }
      return;
    }
    this.recomputeLivePrices(entry, def, stationId, commodityId);
  },

  /**
   * Run every minted station's authored industry lines for `tickDt` seconds. Feedstock burn and
   * product mint land as dents, so line throughput heals on each good's own half-life like any
   * other pressure — the conveyor never mints a row for a station whose book was never opened.
   */
  applyStationIndustry(tickDt, touchedListings = null, onlyStationIds = null, asOfSimTime = null) {
    const minuteShare = Math.max(0, Number(tickDt) || 0) / 60;
    if (!(minuteShare > 0)) return 0;
    const state = this.state;
    const markets = state && state.economy && state.economy.markets;
    if (!markets) return 0;
    const deferDerivedRefresh = touchedListings instanceof Map;
    const atT = Number.isFinite(asOfSimTime) ? asOfSimTime : (state.simTime || 0);
    let ran = 0;
    const stationIds = onlyStationIds || Object.keys(markets);
    for (const stationId of stationIds) {
      const info = stationInfo(state, stationId);
      if (!info) continue;
      const jobs = STATION_INDUSTRY_BOOK.get(info.type);
      if (!jobs || !jobs.length) continue;
      const tier = Math.max(0, Number(info.tier) || 0);
      const sizeRate = INDUSTRY_RUNS_PER_MIN_BY_SIZE[info.size] || INDUSTRY_RUNS_PER_MIN_BY_SIZE.M;
      const market = markets[stationId];
      if (!market) continue;
      for (const job of jobs) {
        if (tier < job.stationTier) continue;
        // Feedstock gate: the hungriest leg sets the line's speed; an empty hopper idles it.
        let available = Infinity;
        let inputsListed = true;
        for (const [cid] of job.inputs) {
          const e = market[cid];
          if (!e || !(e.baseEq > 0)) { inputsListed = false; break; }
          available = Math.min(available, shelfUnitsAt(e, cid, atT) / e.baseEq);
        }
        if (!inputsListed || !(available > 0)) continue;
        const outEntry = market[job.outputId];
        if (!outEntry || !(outEntry.baseEq > 0)) continue;
        // A glutted output idles the line — nobody keeps making what isn't being taken away.
        const headroom = 1 - shelfUnitsAt(outEntry, job.outputId, atT) / (INDUSTRY_OUTPUT_GLUT * outEntry.baseEq);
        if (!(headroom > 0)) continue;
        // Deterministic per-station tempo: two sibling yards never run the identical line.
        const bias = INDUSTRY_BIAS_LO
          + ((hash32(stationId, job.id) >>> 0) / 4294967296) * INDUSTRY_BIAS_SPAN;
        const runs = sizeRate * job.runsPerMin
          * Math.min(INDUSTRY_INPUT_FULL, available) * headroom * bias * minuteShare;
        if (!(runs > 0)) continue;
        const stockOptions = deferDerivedRefresh
          ? { deferDerivedRefresh: true, touchedListings, asOfSimTime } : null;
        for (const [cid, qty] of job.inputs) {
          this.applyStockPressure(stationId, cid, 'buy', qty * runs, stockOptions);
        }
        this.applyStockPressure(stationId, job.outputId, 'sell', job.outputQty * runs, stockOptions);
        ran++;
      }
    }
    return ran;
  },

  /**
   * NXB-027 — one physical freight delivery into a station market. Identified payloads (a stable
   * receiptId, else the sender's missionId) commit under the persisted committed-intents journal
   * in the reserved `freight:` namespace, so a retry across a reload/replay boundary republishes
   * the canonical `economy:freightAccepted` fact for dependent owners without moving stock,
   * credits, or cargo a second time. Payloads carrying no identity keep the legacy stock-only
   * path and make no duplicate promise. This is never a wallet event: delivery is not a sale.
   */
  applyFreightDelivery(payload) {
    if (!payload || typeof payload !== 'object') return { ok: false, reason: 'invalid' };
    const state = this.state;
    const stationId = typeof payload.stationId === 'string' && payload.stationId ? payload.stationId : null;
    const commodityId = typeof payload.commodityId === 'string' && payload.commodityId ? payload.commodityId : null;
    const qty = Number(payload.qty);
    const receiptId = typeof payload.receiptId === 'string' && payload.receiptId
      ? payload.receiptId
      : (typeof payload.missionId === 'string' && payload.missionId ? 'mission-delivery:' + payload.missionId : null);
    if (!receiptId) {
      if (stationId && commodityId) {
        this.applyStockPressure(stationId, commodityId, 'sell', Math.abs(qty) || 0);
      }
      return { ok: true, anonymous: true };
    }
    if (!stationId || !commodityId || !Number.isInteger(qty) || qty <= 0 || qty > 1_000_000) {
      return { ok: false, reason: 'invalid_delivery' };
    }
    const info = stationInfo(state, stationId);
    const def = commodityDef(state, commodityId);
    if (!info || !def) return { ok: false, reason: 'untraded' };
    const market = state.economy.markets[stationId] || this.ensureMarket(stationId, info.type, info.size);
    if (!(market && market[commodityId]) && !this._liveEntryForWrite(stationId, commodityId, def)) {
      return { ok: false, reason: 'untraded' };
    }

    const intents = ensureCommittedIntents(state);
    const intentKey = 'freight:' + receiptId;
    const prior = intents[intentKey];
    if (prior) {
      const prev = prior.receipt || {};
      if (prev.stationId !== stationId || prev.commodityId !== commodityId || prev.qty !== qty) {
        return { ok: false, reason: 'receipt_conflict' };
      }
      // Matching retry: republish the committed canonical fact so a dependent owner that missed
      // the first notification finishes its own effect. Stock/credits/cargo stay settled.
      this.bus.emit('economy:freightAccepted', {
        receiptId: prev.receiptId, stationId: prev.stationId, commodityId: prev.commodityId,
        qty: prev.qty, source: prev.source,
      });
      return { ok: true, duplicate: true, receiptId, qty };
    }

    // Commit the accepted transaction BEFORE the stock write and publication, so a re-entrant
    // retry anywhere inside this call already observes the settled record.
    // NXI-108: read the posted shortage BEFORE the write — the relief cue must cite this
    // delivery, and only a write that actually lifts the starving leg across the threshold
    // earns one (a rejected or duplicate republish moves no stock and yields none).
    const preNeed = info && starvedIndustryNeedFor(info.type, info.tier || 0, market, state.simTime || 0);
    const relievingPostedLeg = !!(preNeed && preNeed.inputId === commodityId);
    const accepted = { receiptId, stationId, commodityId, qty,
      source: payload.source === 'anvil_work' ? 'anvil_work' : 'mission_delivery' };
    // Optional physical-owner handshake: exactly the accepted goods leave their existing
    // hold before stock or any observer changes. Ordinary mission callers already debit
    // cargo and retain their original behavior. No second receipt/inventory is introduced.
    if (typeof payload.commitCustody === 'function') {
      // Transient reservation is scoped to this exact journal, not saved as acceptance.
      // Continue installs a different journal; a throwing/refused callback leaves no receipt.
      const pending = this._physicalFreightPending ||= new WeakMap();
      let ids = pending.get(intents);
      if (!ids) { ids = new Set(); pending.set(intents, ids); }
      if (ids.has(intentKey)) return { ok: false, reason: 'freight_custody_pending' };
      ids.add(intentKey);
      try {
        if (payload.commitCustody({ ...accepted, ok: true, duplicate: false,
          acceptedLines: [{ commodityId, qty }] }) !== true) {
          return { ok: false, reason: 'freight_custody_changed' };
        }
        intents[intentKey] = { receipt: { ...accepted }, result: { ok: true, qty } };
      } finally { ids.delete(intentKey); }
    } else {
      if (this._physicalFreightPending?.get(intents)?.has(intentKey))
        return { ok: false, reason: 'freight_custody_pending' };
      intents[intentKey] = { receipt: { ...accepted }, result: { ok: true, qty } };
    }
    this.applyStockPressure(stationId, commodityId, 'sell', qty);
    if (relievingPostedLeg) {
      const entry = (state.economy.markets[stationId] || market || {})[commodityId];
      const fillAfter = entry && entry.baseEq > 0
        ? shelfUnitsAt(entry, commodityId, state.simTime || 0) / entry.baseEq : 0;
      if (fillAfter >= INDUSTRY_STARVED_FILL) {
        this.bus.emit('economy:shortageRelieved', {
          receiptId, stationId, commodityId, qty,
          jobId: preNeed.jobId,
          fillBefore: preNeed.fill,
          fillAfter,
        });
      }
    }
    this.bus.emit('economy:freightAccepted', { ...accepted });
    return { ok: true, duplicate: false, receiptId, qty };
  },

  // -------------------------------------------------------------------------------------------
  // MARKET PLAY (R480) — Convoy Shares, Forward Slips, Dump Chute, Auditor Penn, Cold Chain.
  // Every credit and every stock unit here still moves through chargeCredits/grantCredits and
  // applyStockPressure, so the single-writer contract is unchanged. Freight arrivals already move
  // their own stock in traffic.js — settlement only pays the contract, never the goods again.
  // -------------------------------------------------------------------------------------------

  /** Live inbound lanes the berth can quote against (read-only; the market screen renders these). */
  convoyShareLanes(stationId) {
    const state = this.state;
    const sid = stationId || this.dockedStationId();
    if (!sid) return [];
    const market = state.economy.markets[sid] || null;
    const unitPriceFor = (commodityId) => {
      const entry = market && market[commodityId];
      const live = Number(entry && (entry.lastBuy != null ? entry.lastBuy : entry.buy));
      return Number.isFinite(live) ? live : 0;
    };
    return inboundFreightLanes(state, sid, { limit: 6, unitPriceFor });
  },

  /** Stake on one named freighter's lot. Pays only when that hull's arrival intent lands. */
  buyConvoyShare(payload) {
    const state = this.state;
    const econ = ensureMarketPlayState(state);
    const p = payload || {};
    const stationId = typeof p.stationId === 'string' && p.stationId ? p.stationId : this.dockedStationId();
    if (!stationId) return { ok: false, reason: 'not_docked' };
    const freighterKey = String(p.freighterKey || p.freighterId || '');
    if (!freighterKey) return { ok: false, reason: 'no_freighter' };
    const dockSeq = Number.isSafeInteger(p.dockSeq) ? p.dockSeq : null;
    if (dockSeq == null) return { ok: false, reason: 'no_dock_seq' };
    const seed = (state.meta && state.meta.seed) || 1;
    const shareId = stableShareId(seed, stationId, freighterKey, dockSeq);
    const book = econ.convoyShares;
    const prior = book.open.find((row) => row && row.id === shareId)
      || book.settled.find((row) => row && row.id === shareId);
    if (prior) return { ok: true, duplicate: true, share: { ...prior } };
    if (book.open.length >= CONVOY_SHARE_LAW.maxOpen) return { ok: false, reason: 'book_full' };
    const lane = this.convoyShareLanes(stationId)
      .find((row) => row.freighterKey === freighterKey && row.dockSeq === dockSeq);
    if (!lane) return { ok: false, reason: 'lane_unknown' };
    const quote = quoteConvoyShare({ manifestValueCr: lane.cargoValueCr });
    if (!(quote.stakeCr > 0)) return { ok: false, reason: 'no_value' };
    if (normalizeCredits(state.player.credits) < quote.stakeCr) return { ok: false, reason: 'credits' };
    const now = Number(state.simTime) || 0;
    const row = {
      id: shareId,
      stationId,
      freighterId: lane.freighterKey,
      freighterKey: lane.freighterKey,
      manifestId: lane.manifestId,
      dockSeq,
      stakeCr: quote.stakeCr,
      payoutCr: quote.payoutCr,
      manifestValueCr: lane.cargoValueCr,
      boughtAt: now,
      expiresAt: now + CONVOY_SHARE_LAW.windowS,
    };
    this.chargeCredits(row.stakeCr, 'market:convoy-share');
    book.open.push(row);
    const result = { ok: true, duplicate: false, share: { ...row } };
    this.bus.emit('economy:convoyShareBought', { ...row, credits: normalizeCredits(state.player.credits) });
    return result;
  },

  /** Buy a locked price for a quantity riding one named freighter's lot. */
  buyForwardSlip(payload) {
    const state = this.state;
    const econ = ensureMarketPlayState(state);
    const p = payload || {};
    const stationId = typeof p.stationId === 'string' && p.stationId ? p.stationId : this.dockedStationId();
    if (!stationId) return { ok: false, reason: 'not_docked' };
    const freighterKey = String(p.freighterKey || p.freighterId || '');
    if (!freighterKey) return { ok: false, reason: 'no_freighter' };
    const commodityId = typeof p.commodityId === 'string' ? p.commodityId : '';
    if (!commodityId) return { ok: false, reason: 'no_commodity' };
    const dockSeq = Number.isSafeInteger(p.dockSeq) ? p.dockSeq : null;
    if (dockSeq == null) return { ok: false, reason: 'no_dock_seq' };
    const seed = (state.meta && state.meta.seed) || 1;
    const slipId = stableSlipId(seed, stationId, `${freighterKey}:${dockSeq}`, commodityId);
    const book = econ.forwardSlips;
    const prior = book.open.find((row) => row && row.id === slipId)
      || book.settled.find((row) => row && row.id === slipId);
    if (prior) return { ok: true, duplicate: true, slip: { ...prior } };
    if (book.open.length >= FORWARD_SLIP_LAW.maxOpen) return { ok: false, reason: 'book_full' };
    const lane = this.convoyShareLanes(stationId)
      .find((row) => row.freighterKey === freighterKey && row.dockSeq === dockSeq);
    if (!lane) return { ok: false, reason: 'lane_unknown' };
    const line = lane.lines.find((row) => row.commodityId === commodityId) || null;
    if (!line) return { ok: false, reason: 'commodity_not_aboard' };
    const qty = Math.min(Math.max(0, Math.floor(Number(p.qty) || 0)), line.qty);
    if (qty < FORWARD_SLIP_LAW.qtyMin) return { ok: false, reason: 'qty' };
    const market = state.economy.markets[stationId] || this.ensureMarket(stationId);
    const entry = market && market[commodityId];
    const lockedBuyCr = Math.max(0, Math.round(Number(entry && (entry.lastBuy != null ? entry.lastBuy : entry.buy)) || 0));
    const quote = quoteForwardSlip({ lockedBuyCr, qty });
    if (!(quote.feeCr > 0)) return { ok: false, reason: 'no_value' };
    if (normalizeCredits(state.player.credits) < quote.feeCr) return { ok: false, reason: 'credits' };
    const now = Number(state.simTime) || 0;
    const row = {
      id: slipId,
      stationId,
      freighterKey: lane.freighterKey,
      manifestId: lane.manifestId,
      dockSeq,
      commodityId,
      qty: quote.qty,
      lockedBuyCr: quote.lockedBuyCr,
      feeCr: quote.feeCr,
      boughtAt: now,
      expiresAt: now + FORWARD_SLIP_LAW.windowS,
    };
    this.chargeCredits(row.feeCr, 'market:forward-slip');
    book.open.push(row);
    const result = { ok: true, duplicate: false, slip: { ...row } };
    this.bus.emit('economy:forwardSlipBought', { ...row, credits: normalizeCredits(state.player.credits) });
    return result;
  },

  /**
   * The Dump Chute: one jettisoned pod becomes credits at the documented discount and real stock
   * in the receiving market. Committed in the bounded pod-intake receipt ring (newest
   * POD_INTAKE_LAW.maxAccepted, saved with the market-play slice) so a retry republishes the
   * receipt instead of paying twice — never in the unbounded `committedIntents` journal. The
   * physical pod is consumed only when the runtime hands us a live one and a removal helper.
   */
  applyPodIntake(payload) {
    const state = this.state;
    const econ = ensureMarketPlayState(state);
    const p = payload || {};
    const stationId = typeof p.stationId === 'string' && p.stationId ? p.stationId : this.dockedStationId();
    const commodityId = typeof p.commodityId === 'string' ? p.commodityId : '';
    const intakeId = typeof p.intakeId === 'string' && p.intakeId ? p.intakeId : '';
    const qty = Math.floor(Number(p.qty) || 0);
    if (!stationId) return { ok: false, reason: 'not_docked' };
    if (!commodityId || !intakeId) return { ok: false, reason: 'invalid_intake' };
    if (!(qty >= POD_INTAKE_LAW.minQty) || qty > POD_INTAKE_LAW.maxQty) return { ok: false, reason: 'invalid_qty' };
    const info = stationInfo(state, stationId);
    const def = commodityDef(state, commodityId);
    if (!info || !def) return { ok: false, reason: 'untraded' };
    const market = state.economy.markets[stationId] || this.ensureMarket(stationId, info.type, info.size);
    const entry = market && market[commodityId];
    if (!entry) return { ok: false, reason: 'untraded' };
    const receipt = { intakeId, stationId, commodityId, qty, podId: p.podId != null ? String(p.podId) : null };
    // Duplicate rejection reads the bounded receipt ring (newest POD_INTAKE_LAW.maxAccepted
    // intakes). The old per-intake `committedIntents` entry grew by one full receipt per pod
    // forever and rode the save wholesale.
    const prior = econ.podIntakeReceipts.find((row) => row && row.intakeId === intakeId);
    if (prior) {
      if (prior.stationId !== stationId || prior.commodityId !== commodityId || prior.qty !== qty) {
        return { ok: false, reason: 'receipt_conflict' };
      }
      const settled = {
        ok: true, intakeId, stationId: prior.stationId, commodityId: prior.commodityId,
        qty: prior.qty, valueCr: prior.valueCr || 0,
      };
      this.bus.emit('economy:podIntakeAccepted', { ...settled, podId: prior.podId, duplicate: true });
      return { ...settled, duplicate: true };
    }
    if (!this._consumeIntakePod(receipt.podId)) return { ok: false, reason: 'pod_missing' };
    const unitPriceCr = Math.max(0, Number(entry.lastSell != null ? entry.lastSell : entry.sell) || 0);
    const valueCr = podIntakeValueCr({ unitPriceCr, qty });
    const result = { ok: true, intakeId, stationId, commodityId, qty, valueCr };
    // Commit before any credit/stock write so a re-entrant retry observes the settled receipt.
    econ.podIntakeReceipts.push({ ...receipt, valueCr, at: Number(state.simTime) || 0 });
    if (econ.podIntakeReceipts.length > POD_INTAKE_LAW.maxAccepted) {
      econ.podIntakeReceipts.splice(0, econ.podIntakeReceipts.length - POD_INTAKE_LAW.maxAccepted);
    }
    this._notePodIntake(stationId);
    this.grantCredits(valueCr, 'market:pod-intake');
    this.applyStockPressure(stationId, commodityId, 'sell', qty);
    this.bus.emit('economy:podIntakeAccepted', { ...result, duplicate: false });
    this.bus.emit('toast', {
      text: `Dump Chute — ${qty}u ${def.name} taken at ${Math.round(POD_INTAKE_LAW.payFrac * 100)}% of dock rate, ${valueCr} cr`,
      kind: 'info', ttl: 5,
    });
    return { ...result, duplicate: false };
  },

  /**
   * The Dump Chute's physical door: a deliberately released jettisoned pod at a berth is handed
   * to the intake owner through the same `cargo:podIntake` boundary other callers use, under a
   * deterministic intakeId so a replayed rating can never pay twice. The berth is the docked
   * station when docked, else the nearest live station within the chute's reach of the pod.
   */
  _routeDeliberateReleaseToChute(rating) {
    if (!rating || rating.deliberate !== true) return;
    const state = this.state;
    const entities = state.entities;
    const pod = entities && typeof entities.get === 'function'
      ? (entities.get(rating.targetId) ?? entities.get(Number(rating.targetId)))
      : null;
    const data = pod && pod.data;
    if (!pod || pod.alive === false || !data || data.jettisonedCargo !== true) return;
    // The player's promised physical handoff takes priority over the broad automatic chute.
    // This only defers sale: traffic still owns interception, contact and finite custody.
    if (winnowCarrierHandoffReady(this._registry?.get?.('traffic'), pod)) {
      this.bus.emit('comms:log', { from:'SLAG-RUN',kind:'encounter',text:'Pod released for Tann. Keep clear while I collect it.' });
      return;
    }
    const commodityId = typeof data.commodityId === 'string' ? data.commodityId : '';
    const qty = Math.floor(Number(data.amount) || 0);
    if (!commodityId || qty <= 0) return;
    const reach2 = POD_INTAKE_LAW.reachWU * POD_INTAKE_LAW.reachWU;
    const dist2To = (e) => {
      if (!e || !e.pos || !pod.pos) return Infinity;
      const dx = e.pos.x - pod.pos.x;
      const dz = e.pos.z - pod.pos.z;
      return dx * dx + dz * dz;
    };
    let stationId = null;
    let bestD2 = reach2;
    const list = typeof entities.values === 'function' ? entities.values() : (state.entityList || []);
    const stations = [];
    for (const e of list) {
      if (!e || e.alive === false || e.type !== 'station' || !e.pos) continue;
      const id = (e.data && e.data.stationId) || e.stationId;
      if (!id || !stationInfo(state, id)) continue;
      stations.push({ e, id });
    }
    // The docked berth counts only while its live entity sits inside chute reach of the pod —
    // a remembered berth after undock, or a dock record with no station body left in the
    // world, must not credit a pod slung anywhere at all.
    const docked = this.dockedStationId();
    if (docked) {
      const dockEntity = stations.find((s) => s.id === docked);
      if (dockEntity && dist2To(dockEntity.e) <= reach2) stationId = docked;
    }
    if (!stationId && pod.pos) {
      for (const s of stations) {
        const d2 = dist2To(s.e);
        if (d2 < bestD2 || (d2 === bestD2 && stationId && s.id < stationId)) { stationId = s.id; bestD2 = d2; }
      }
    }
    if (!stationId) return;
    // occupantGeneration names this physical instance — slot ids recycle after removal, and a
    // recycled id must never read as the pod that already paid.
    this.bus.emit('cargo:podIntake', {
      intakeId: `dumpchute:${pod.id}:${Number.isSafeInteger(pod.occupantGeneration) ? pod.occupantGeneration : 0}`,
      podId: pod.id,
      stationId,
      commodityId,
      qty,
    });
  },

  /** Consume the physical pod when the runtime can prove it exists. Headless harnesses accept. */
  _consumeIntakePod(podId) {
    if (!podId) return true;
    const remove = this.helpers && this.helpers.removeEntity;
    if (typeof remove !== 'function') return true;
    const entities = this.state.entities;
    // Receipts carry String(podId) for stable identity; the live Map is keyed by the real id.
    const entity = entities && typeof entities.get === 'function'
      ? (entities.get(podId) ?? entities.get(Number(podId)))
      : null;
    if (!entity) return false;
    remove(entity.id != null ? entity.id : podId, { immediate: true });
    return true;
  },

  /** Auditor Penn notes one chute dump at this berth; his next sweep is likelier. */
  _notePodIntake(stationId) {
    const econ = ensureMarketPlayState(this.state);
    const byStation = econ.auditorPenn.byStation;
    const now = Number(this.state.simTime) || 0;
    const row = byStation[stationId] || (byStation[stationId] = { tally: 0, lastDumpAt: now });
    if (now - Number(row.lastDumpAt) > MARKET_AUDIT_LAW.tallyWindowS) row.tally = 0;
    row.tally = Math.max(0, Math.floor(Number(row.tally) || 0)) + 1;
    row.lastDumpAt = now;
    this.bus.emit('economy:auditorTally', {
      stationId, tally: row.tally, scanMult: auditorScanMultiplier(row.tally),
    });
    // One dump is a lead. Five is a pattern. The dumps between stay quiet.
    if (row.tally === 1 || row.tally === 5) {
      const { voice, name } = stationVoiceFor(this.state, stationId);
      const word = row.tally === 1 ? 'a lead' : 'a pattern';
      this.bus.emit('toast', {
        text: `${voice}, ${name}: Auditor Penn has ${word} on the Dump Chute.`,
        kind: 'warn', ttl: 5,
      });
    }
  },

  /** Penn's live lead at a berth (0 when nothing was dumped inside his window). */
  auditorTally(stationId) {
    const econ = ensureMarketPlayState(this.state);
    const row = stationId ? econ.auditorPenn.byStation[stationId] : null;
    if (!row) return 0;
    const now = Number(this.state.simTime) || 0;
    if (now - Number(row.lastDumpAt) > MARKET_AUDIT_LAW.tallyWindowS) return 0;
    return Math.max(0, Math.floor(Number(row.tally) || 0));
  },

  /** The scan chance runScan will actually use — Penn's lead folded in, clamped to a certainty. */
  auditorScanChance(p) {
    const opts = p || {};
    const stationId = opts.stationId || this.dockedStationId();
    const mult = auditorScanMultiplier(this.auditorTally(stationId));
    return clamp01(scanChance({ security: opts.security, cloak: opts.cloak, hot: opts.hot }) * mult);
  },

  /** One real arrival: settle every open share and slip pinned to that hull and berth. */
  _settleFreightArrival(intent) {
    const state = this.state;
    const econ = ensureMarketPlayState(state);
    const stationId = intent && intent.stationId;
    if (!stationId) return;
    const keys = new Set([intent.freighterId, intent.freighterKey].filter((v) => v != null).map(String));
    if (!keys.size) return;
    const dockSeq = Number.isSafeInteger(intent.dockSeq) ? intent.dockSeq : null;
    const at = Number(state.simTime) || 0;
    const trades = Array.isArray(intent.trades) ? intent.trades : [];
    const market = state.economy.markets[stationId] || null;
    // The purchased lot, not just the hull: a different manifest riding the same freighter is
    // not the lot the contract named. Lenient only when either side never stamped one.
    const intentManifestId = intent.manifestId != null ? String(intent.manifestId) : null;
    const manifestMatch = (row) => !intentManifestId || !row || row.manifestId == null
      || String(row.manifestId) === intentManifestId;
    // A position past its deadline is already worthless: an arrival that lands between the
    // deadline and the next 5 s sweep must settle it as expired (the sweep's own rule), not pay it.
    const overdue = (row) => !(Number(row.expiresAt) > at);
    const expireOverdue = (book, row, label) => {
      book.settled.push({ ...row, outcome: 'expired', settledAt: at, payoutCr: 0 });
      this.bus.emit('economy:marketContractExpired', { kind: label, id: row.id, stationId: row.stationId });
    };
    const stillOpen = [];
    for (const row of econ.convoyShares.open) {
      if (!row || row.stationId !== stationId || dockSeq == null || row.dockSeq !== dockSeq
        || (!keys.has(row.freighterId) && !keys.has(row.freighterKey)) || !manifestMatch(row)) {
        stillOpen.push(row);
        continue;
      }
      if (overdue(row)) { expireOverdue(econ.convoyShares, row, 'convoy-share'); continue; }
      const settled = { ...row, outcome: 'arrived', settledAt: at, intentId: intent.intentId || null };
      econ.convoyShares.settled.push(settled);
      if (settled.payoutCr > 0) this.grantCredits(settled.payoutCr, 'market:convoy-share:arrival');
      this.bus.emit('economy:convoyShareSettled', {
        shareId: settled.id, stationId, freighterKey: settled.freighterKey,
        outcome: 'arrived', stakeCr: settled.stakeCr, payoutCr: settled.payoutCr,
      });
    }
    econ.convoyShares.open = stillOpen;
    const slipsOpen = [];
    for (const row of econ.forwardSlips.open) {
      if (!row || row.stationId !== stationId || dockSeq == null || row.dockSeq !== dockSeq
        || !keys.has(row.freighterKey) || !manifestMatch(row)) {
        slipsOpen.push(row);
        continue;
      }
      const trade = trades.find((t) => t && t.commodityId === row.commodityId) || null;
      if (!trade) { slipsOpen.push(row); continue; }
      if (overdue(row)) { expireOverdue(econ.forwardSlips, row, 'forward-slip'); continue; }
      const entry = market && market[row.commodityId];
      const arrivalBuyCr = Number(entry && (entry.lastBuy != null ? entry.lastBuy : entry.buy)) || 0;
      const payoutCr = settleForwardSlip({ lockedBuyCr: row.lockedBuyCr, arrivalBuyCr, qty: row.qty });
      const settled = { ...row, outcome: 'landed', settledAt: at, arrivalBuyCr, payoutCr, intentId: intent.intentId || null };
      econ.forwardSlips.settled.push(settled);
      if (payoutCr > 0) this.grantCredits(payoutCr, 'market:forward-slip:landed');
      this.bus.emit('economy:forwardSlipSettled', {
        slipId: settled.id, stationId, freighterKey: settled.freighterKey,
        commodityId: settled.commodityId, qty: settled.qty,
        lockedBuyCr: settled.lockedBuyCr, arrivalBuyCr, payoutCr,
      });
    }
    econ.forwardSlips.open = slipsOpen;
    trimSettledBook(econ.convoyShares, CONVOY_SHARE_LAW.maxSettled);
    trimSettledBook(econ.forwardSlips, FORWARD_SLIP_LAW.maxSettled);
  },

  /** One real loss: no arrival payout, and a cold manifest starts spoiling at the berth. */
  _settleFreightLoss(intent) {
    const state = this.state;
    const econ = ensureMarketPlayState(state);
    const stationId = intent && intent.stationId;
    const keys = new Set([intent && intent.freighterId, intent && intent.freighterKey]
      .filter((v) => v != null).map(String));
    if (!stationId || !keys.size) return;
    const at = Number(state.simTime) || 0;
    const intentManifestId = intent.manifestId != null ? String(intent.manifestId) : null;
    const manifestMatch = (row) => !intentManifestId || !row || row.manifestId == null
      || String(row.manifestId) === intentManifestId;
    const lost = [];
    econ.convoyShares.open = econ.convoyShares.open.filter((row) => {
      if (!row || row.stationId !== stationId
        || (!keys.has(row.freighterId) && !keys.has(row.freighterKey)) || !manifestMatch(row)) return true;
      lost.push({ ...row, outcome: 'lost', settledAt: at, payoutCr: 0 });
      return false;
    });
    for (const row of lost) {
      econ.convoyShares.settled.push(row);
      this.bus.emit('economy:convoyShareSettled', {
        shareId: row.id, stationId, freighterKey: row.freighterKey,
        outcome: 'lost', stakeCr: row.stakeCr, payoutCr: 0,
      });
    }
    const lostSlips = [];
    econ.forwardSlips.open = econ.forwardSlips.open.filter((row) => {
      if (!row || row.stationId !== stationId || !keys.has(row.freighterKey) || !manifestMatch(row)) return true;
      lostSlips.push({ ...row, outcome: 'lost', settledAt: at, payoutCr: 0 });
      return false;
    });
    for (const row of lostSlips) {
      econ.forwardSlips.settled.push(row);
      this.bus.emit('economy:forwardSlipSettled', {
        slipId: row.id, stationId, freighterKey: row.freighterKey,
        commodityId: row.commodityId, qty: row.qty, payoutCr: 0, outcome: 'lost',
      });
    }
    trimSettledBook(econ.convoyShares, CONVOY_SHARE_LAW.maxSettled);
    trimSettledBook(econ.forwardSlips, FORWARD_SLIP_LAW.maxSettled);
    this._armColdChain(stationId, intent);
  },

  /** A lost cold manifest spoils this berth's perishables for the documented window. */
  _armColdChain(stationId, intent) {
    const state = this.state;
    const econ = ensureMarketPlayState(state);
    const ids = new Set();
    for (const line of (Array.isArray(intent && intent.manifest && intent.manifest.lines) ? intent.manifest.lines : [])) {
      if (line && line.commodityId) ids.add(line.commodityId);
    }
    for (const line of (Array.isArray(intent && intent.pressures) ? intent.pressures : [])) {
      const cid = line && (line.commodityId || line.good);
      if (cid) ids.add(cid);
    }
    if (intent && intent.primaryCommodityId) ids.add(intent.primaryCommodityId);
    const cold = [];
    for (const cid of ids) {
      if (isColdChainCommodity(commodityDef(state, cid))) cold.push(cid);
    }
    if (!cold.length) return;
    const now = Number(state.simTime) || 0;
    const prior = econ.coldChain[stationId];
    const merged = new Set([...(Array.isArray(prior && prior.commodityIds) ? prior.commodityIds : []), ...cold]);
    econ.coldChain[stationId] = {
      commodityIds: Array.from(merged).sort(),
      atSimTime: now,
      untilSimTime: Math.max(Number(prior && prior.untilSimTime) || 0, now + COLD_CHAIN_LAW.windowS),
      cause: 'freight_loss',
      freighterKey: intent.freighterKey || null,
    };
    const armed = econ.coldChain[stationId];
    this.bus.emit('economy:coldChainArmed', {
      stationId,
      commodityIds: armed.commodityIds.slice(),
      untilSimTime: armed.untilSimTime,
    });
    const { voice, name } = stationVoiceFor(state, stationId);
    const labels = armed.commodityIds.map((cid) => {
      const def = commodityDef(state, cid);
      return (def && def.name) || cid;
    });
    // Open-world news, not arena news: during a Swarm run the station keeps its ledger but the player is not
    // told mid-fight (it printed over round 3, lead look). The economy state above is unchanged either way.
    if (!(state.run && state.run.kind === 'survival')) {
      this.bus.emit('toast', {
        text: `${voice}, ${name}: Cold chain broken — ${labels.join(', ')} spoiling.`,
        kind: 'warn', ttl: 6,
      });
    }
  },

  /** The 5 s market-play sweep: expire contracts, rot cold stock, cool Penn's lead. */
  _sweepMarketPlay(state) {
    const econ = ensureMarketPlayState(state);
    const now = Number(state.simTime) || 0;
    // 1) contracts the named hull never landed lapse worthless
    const expire = (book, label) => {
      const open = [];
      for (const row of book.open) {
        // A malformed row (not an object) carries no stake we can name: discard it.
        if (!row || typeof row !== 'object') continue;
        // A contract stays open while its deadline is still ahead; one with no usable deadline
        // is settled as expired rather than held open forever.
        if (Number(row.expiresAt) > now) { open.push(row); continue; }
        const settled = { ...row, outcome: 'expired', settledAt: now, payoutCr: 0 };
        book.settled.push(settled);
        this.bus.emit('economy:marketContractExpired', { kind: label, id: row.id, stationId: row.stationId });
      }
      book.open = open;
    };
    expire(econ.convoyShares, 'convoy-share');
    expire(econ.forwardSlips, 'forward-slip');
    trimSettledBook(econ.convoyShares, CONVOY_SHARE_LAW.maxSettled);
    trimSettledBook(econ.forwardSlips, FORWARD_SLIP_LAW.maxSettled);
    // 2) cold chain: perishable stock spoils while the chain is broken
    const market = state.economy.markets || {};
    for (const stationId of Object.keys(econ.coldChain)) {
      const row = econ.coldChain[stationId];
      if (!row || !(Number(row.untilSimTime) > now) || !market[stationId]) {
        delete econ.coldChain[stationId];
        continue;
      }
      for (const commodityId of (Array.isArray(row.commodityIds) ? row.commodityIds : [])) {
        const entry = market[stationId][commodityId];
        if (!entry || !isColdChainCommodity(commodityDef(state, commodityId))) continue;
        const spoiled = coldChainSpoilQty(shelfUnitsAt(entry, commodityId, now));
        if (!(spoiled > 0)) continue;
        this.applyStockPressure(stationId, commodityId, 'buy', spoiled);
        this.bus.emit('economy:coldChainSpoiled', {
          stationId, commodityId, qty: spoiled, untilSimTime: row.untilSimTime,
        });
      }
      if (Object.keys(econ.coldChain).length > COLD_CHAIN_LAW.maxStations) {
        const oldest = Object.keys(econ.coldChain)
          .sort((a, b) => (Number(econ.coldChain[a].atSimTime) || 0) - (Number(econ.coldChain[b].atSimTime) || 0))[0];
        if (oldest) delete econ.coldChain[oldest];
      }
    }
    // 3) Penn's lead cools once his window has passed
    const byStation = econ.auditorPenn.byStation;
    for (const stationId of Object.keys(byStation)) {
      const row = byStation[stationId];
      if (!row || now - Number(row.lastDumpAt) > MARKET_AUDIT_LAW.tallyWindowS) delete byStation[stationId];
    }
  },

  /** Read model the market screen prints: live shares, slips, chute pods, cold chain, Penn. */
  marketPlayBoard(stationId) {
    const state = this.state;
    const econ = ensureMarketPlayState(state);
    const sid = stationId || this.dockedStationId();
    if (!sid) return null;
    const cold = econ.coldChain[sid] || null;
    const now = Number(state.simTime) || 0;
    return {
      stationId: sid,
      lanes: this.convoyShareLanes(sid),
      shares: econ.convoyShares.open.filter((row) => row && row.stationId === sid).map((row) => ({ ...row })),
      slips: econ.forwardSlips.open.filter((row) => row && row.stationId === sid).map((row) => ({ ...row })),
      settled: econ.convoyShares.settled.concat(econ.forwardSlips.settled)
        .filter((row) => row && row.stationId === sid)
        .slice(-4).map((row) => ({ ...row })),
      podIntake: econ.podIntakeReceipts.filter((row) => row && row.stationId === sid).slice(-6).map((row) => ({ ...row })),
      coldChain: cold ? {
        commodityIds: (Array.isArray(cold.commodityIds) ? cold.commodityIds : []).slice(),
        remainingS: Math.max(0, (Number(cold.untilSimTime) || 0) - now),
      } : null,
      auditor: {
        tally: this.auditorTally(sid),
        scanMult: auditorScanMultiplier(this.auditorTally(sid)),
      },
    };
  },

  quoteTallyThreeCrate(source) {
    const qty=Math.floor(Number(source?.remainingPool?.cmdty_salvage_electronics)||0);
    if(source?.sourceKey!==TALLY_THREE.sourceKey||source.extracted||qty<=0||qty>TALLY_THREE.pool.cmdty_salvage_electronics)return {ok:false,reason:'no-crate-contents'};
    const info=stationInfo(this.state,TALLY_THREE.homeStationId);
    const market=info&&(this.state.economy.markets[TALLY_THREE.homeStationId]||this.ensureMarket(TALLY_THREE.homeStationId,info.type,info.size));
    const price=market?.cmdty_salvage_electronics?.lastSell;
    if(!Number.isFinite(price)||price<0)return {ok:false,reason:'receiver-listing-unavailable'};
    return {ok:true,qty,quoteCr:Math.max(0,Math.floor(price*qty))};
  },

  // A finite first planting from physically accepted original vaults, after its growth delay.
  // The existing market stock authority owns the product; seeds never become player cargo.
  applyIlexSeedHarvest(receiptId) {
    const receipt = this.registryGet('ilexArk')?.outcomeReceipt?.(receiptId);
    if (!validIlexOutcome(receipt)) return { ok: false, reason: 'unaccepted_seed_custody' };
    if (this.state.simTime < receipt.harvestAt) return { ok: false, reason: 'planting_pending' };
    const intents = ensureCommittedIntents(this.state), key = `${receipt.id}:first-harvest`, prior = intents[key];
    if (prior) return { ok: true, duplicate: true, ...prior.result };
    const market = this.state.economy.markets[ILEX_ARK.stationId] || this.ensureMarket(ILEX_ARK.stationId);
    if (!market?.cmdty_food) return { ok: false, reason: 'greenhouse_receiver_pending' };
    const qty = receipt.deliveredVaultIds.length * ILEX_ARK.provisionsPerVault;
    const result = { receiptId: key, stationId: ILEX_ARK.stationId, commodityId: 'cmdty_food', qty,
      deliveredVaultIds: [...receipt.deliveredVaultIds], at: this.state.simTime };
    intents[key] = { receipt: { ...receipt, deliveredVaultIds: [...receipt.deliveredVaultIds] }, result };
    if (qty) this.applyStockPressure(ILEX_ARK.stationId, 'cmdty_food', 'sell', qty);
    this.bus.emit('ilexArk:harvested', { ...result, deliveredVaultIds: [...result.deliveredVaultIds] });
    this.bus.emit('toast', { text: qty ? `Ceres greenhouse — first planting yielded ${qty}u Provisions from ${receipt.deliveredVaultIds.length}/6 seed lines.`
      : 'Ceres greenhouse — no seed lines arrived. No planting or Provisions were created.', kind: 'info', ttl: 6 });
    return { ok: true, duplicate: false, ...result };
  },
  settleCeresBraceWage(event) {
    const siteId = 'world_site_ceres_second_measure';
    const receipt = event?.receipt;
    const site = this.state.sites?.worldById?.[siteId];
    const completed = site?.completedOperations?.brace_long_plate;
    if (event?.siteId !== siteId || event.componentId !== 'long_plate_clamp'
      || event.operationId !== 'brace_long_plate' || receipt?.complete !== true
      || !Array.isArray(site?.receipts) || site.receipts.at(-1) !== receipt
      || receipt.operationId !== 'brace_long_plate' || receipt.componentId !== 'long_plate_clamp'
      || receipt.requestStreamId !== 'player-industrial-beam'
      || receipt.workThreshold !== 24 || receipt.appliedTotal !== 24
      || !(receipt.amountApplied > 0 && receipt.amountApplied <= 24)
      || receipt.tick !== this.state.tick || receipt.requestSequence !== this.state.tick
      || !completed || completed.receiptId !== receipt.receiptId
      || completed.requestStreamId !== receipt.requestStreamId
      || completed.requestSequence !== receipt.requestSequence || completed.tick !== receipt.tick
      || completed.cycle !== receipt.cycle || completed.stateFrom !== 'unbraced' || completed.stateTo !== 'braced') {
      return { ok: false, reason: 'brace-receipt-invalid' };
    }
    // One wage for this authored shift, even if a later component cycle is repaired.
    const intents = ensureCommittedIntents(this.state), key = 'ceres:second-measure:brace-wage';
    if (intents[key]) return { ok: true, duplicate: true, ...intents[key].result };
    const before = normalizeCredits(this.state.player.credits);
    const creditedCr = normalizeCredits(before + 400) - before;
    const result = { receiptId: receipt.receiptId, creditedCr };
    intents[key] = { receipt: { ...receipt }, result };
    this.grantCredits(400, 'work:ceres-long-plate-brace');
    this.bus.emit('comms:message', { sender: 'SECOND MEASURE YARD', channel: 'machine',
      text: `Brace accepted. ${creditedCr} credits transferred for the shift. Clear the head; we'll take the plate.` });
    return { ok: true, duplicate: false, ...result };
  },

  // Circuit awards are authorised by the live feature owner, never by a caller-supplied amount.
  // The wallet, accepted receipt and feature record settle synchronously before outward events.
  settleCinderglassResult,

  settleCounterweightResult(eventId, attemptId) {
    const owner = this.registryGet('counterweightCircuit');
    const intents = ensureCommittedIntents(this.state);
    const key = typeof eventId === 'string' ? `counterweight:first-completion:${eventId}` : '';
    const prior = intents?.[key];
    if (prior?.result?.eventId === eventId && prior.result.attemptId === attemptId
      && owner?.payoutAlreadyAccepted?.(eventId)) return { ok: true, duplicate: true, ...prior.result };
    const auth = owner?.payoutAuthorization?.(eventId, attemptId);
    if (!auth || !Number.isSafeInteger(auth.amount) || auth.amount <= 0) return { ok: false, reason: 'unaccepted_result' };
    if (!intents || !this.state.player) return { ok: false, reason: 'economy_unavailable' };
    if (prior) {
      if (prior.result?.eventId !== eventId || prior.result?.attemptId !== attemptId
        || prior.result?.creditedCr !== auth.amount || !owner.acceptPayout(eventId, attemptId, prior.result.creditedCr)) {
        return { ok: false, reason: 'receipt_mismatch' };
      }
      return { ok: true, duplicate: true, ...prior.result };
    }
    const player = this.state.player, before = normalizeCredits(player.credits);
    if (normalizeCredits(before + auth.amount) - before !== auth.amount) return { ok: false, reason: 'wallet_full' };
    const result = { eventId, attemptId, creditedCr: auth.amount, key: auth.key };
    // No callbacks occur between these owner writes; a later credits listener can save or retry
    // and will see both the accepted receipt and the updated wallet/feature record.
    player.credits = before + auth.amount;
    intents[auth.key] = { result };
    owner.acceptPayout(eventId, attemptId, auth.amount);
    recordEconomyCash(this.state.economy, this.state.simTime, auth.amount, auth.key);
    if (player.stats) player.stats.creditsEarned = (player.stats.creditsEarned || 0) + auth.amount;
    this.bus.emit('credits:changed', { delta: auth.amount, reason: auth.key, total: player.credits });
    return { ok: true, duplicate: false, ...result };
  },

  settleTallyThreeDelivery(receipt) {
    const source=tallyThreeSource(this.state),canonical=source?.delivery;
    if(!canonical||JSON.stringify(canonical)!==JSON.stringify(receipt)
      ||receipt.receiptId!=='tally-three:'+TALLY_THREE.worldRecordId)return {ok:false,reason:'unaccepted-custody'};
    const intents=ensureCommittedIntents(this.state),key=receipt.receiptId,prior=intents[key];
    if(prior)return {ok:true,duplicate:true,...prior.result};
    const before=normalizeCredits(this.state.player.credits);
    const creditedCr=normalizeCredits(before+receipt.quoteCr)-before;
    const result={receiptId:receipt.receiptId,qty:receipt.qty,creditedCr,stationId:receipt.stationId};
    // Reserve before any credit/stock event can recursively replay this same accepted crate.
    intents[key]={receipt:{...receipt},result};
    this.grantCredits(receipt.quoteCr,'salvage:tally-three-return');
    this.applyStockPressure(receipt.stationId,receipt.commodityId,'sell',receipt.qty);
    this.bus.emit('cargo:tallyThreeDelivered',{...result,worldRecordId:receipt.worldRecordId});
    return {ok:true,duplicate:false,...result};
  },

  // Breakwater's finite authored awards settle only against the live feature
  // owner's pending accepted custody/work receipt. No caller chooses an amount.
  settleBreakwaterReceipt(kind, sourceId) {
    const amounts = { scrap:90, supply:160, defend:180, bonded:220, bond_refund:100 };
    const amount = Object.hasOwn(amounts, kind) ? amounts[kind] : 0;
    const owner = this.registryGet('breakwaterSpur');
    if (!amount || typeof sourceId !== 'string' || !sourceId) return {ok:false,reason:'invalid_receipt'};
    const key = `breakwater:first:${kind}`;
    const intents = ensureCommittedIntents(this.state), prior = intents?.[key];
    if (!intents || !this.state.player) return {ok:false,reason:'economy_unavailable'};
    if (prior) {
      if (prior.result?.kind !== kind || prior.result?.sourceId !== sourceId
        || prior.result?.creditedCr !== amount) return {ok:false,reason:'receipt_mismatch'};
      if (!owner?.payoutAlreadyAccepted?.(kind,sourceId)
        && !owner?.acceptPayout?.(kind,sourceId,amount)) return {ok:false,reason:'unaccepted_receipt'};
      return {ok:true,duplicate:true,...prior.result};
    }
    const auth = owner?.payoutAuthorization?.(kind,sourceId);
    if (!auth || auth.key !== key || auth.amount !== amount || auth.sourceId !== sourceId)
      return {ok:false,reason:'unaccepted_receipt'};
    const player=this.state.player, before=normalizeCredits(player.credits);
    if (normalizeCredits(before+amount)-before !== amount) return {ok:false,reason:'wallet_full'};
    const result={kind,sourceId,creditedCr:amount,key};
    if (!owner.acceptPayout(kind,sourceId,amount)) return {ok:false,reason:'unaccepted_receipt'};
    // All three owner writes precede any outward event or reentrant save.
    player.credits=before+amount;
    intents[key]={result};
    recordEconomyCash(this.state.economy,this.state.simTime,amount,key);
    if (player.stats) player.stats.creditsEarned=(player.stats.creditsEarned||0)+amount;
    this.bus.emit('credits:changed',{delta:amount,reason:key,total:player.credits});
    return {ok:true,duplicate:false,...result};
  },

  /**
   * Admit one conserved NPC salvage lot into an eligible industrial yard. This intentionally has
   * no player wallet/cargo path: player salvage continues through execute(..., 'sell', ...).
   */
  quoteNpcSalvageIntake(yardId, rawLines) {
    const lines = canonicalSalvageIntakeLines(rawLines);
    if (!lines) return { ok: false, reason: 'invalid_salvage_intake', acceptedLines: [] };
    const info = stationInfo(this.state, yardId);
    if (!info || !NPC_SALVAGE_INTAKE_STATION_TYPES.has(info.type)) {
      return { ok: false, reason: 'unsupported_salvage_yard', acceptedLines: [] };
    }
    const market = this.state.economy.markets[yardId];
    const acceptedLines = lines.filter(line => {
      const def = commodityDef(this.state, line.commodityId), listing = market?.[line.commodityId];
      // An industrial scrap yard is not a universal buyer or a restricted-goods licence.
      return def?.category === 'salvage' && def.legality === 'legal'
        && def.consumedBy?.includes(info.type) && listing && Number.isFinite(listing.stock);
    });
    return { ok: acceptedLines.length > 0, reason: acceptedLines.length ? null : 'salvage_listing_unavailable', acceptedLines };
  },

  applyNpcSalvageIntake(payload) {
    const intake = npcSalvageIntakeFrom(payload);
    if (!intake) return { ok: false, reason: 'invalid_salvage_intake' };
    const state = this.state, intakeState = ensureSalvageIntakeState(state.economy);
    const applied = intakeState.receipts.find(candidate => candidate.intakeId === intake.intakeId);
    if (intakeState.blockedIds.includes(intake.intakeId) || (applied && !sameSalvageIntakeReceipt(applied, intake))) {
      return { ok: false, reason: 'salvage_intake_identity_conflict', intakeId: intake.intakeId };
    }
    const resultFor = (receipt, duplicate = false, valueCr = undefined) => {
      const acceptedLines = salvageAcceptedLines(receipt).map(line => ({ ...line }));
      return { ok: true, ...(duplicate ? { duplicate: true } : {}), intakeId: receipt.intakeId,
        yardId: receipt.yardId, manifestId: receipt.manifestId, lotId: receipt.lotId,
        commodityId: acceptedLines.length === 1 ? acceptedLines[0].commodityId : null,
        qty: acceptedLines.reduce((sum, line) => sum + line.qty, 0), acceptedLines,
        ...(valueCr !== undefined ? { valueCr } : {}),
        ignoredCommodityIds: receipt.lines.filter(line => !acceptedLines.some(taken => taken.commodityId === line.commodityId))
          .map(line => line.commodityId) };
    };
    if (applied) {
      const result = resultFor(applied, true);
      if (typeof payload.commitCustody === 'function' && payload.commitCustody(result) !== true) {
        return { ok: false, reason: 'salvage_custody_changed' };
      }
      return result;
    }
    const info = stationInfo(state, intake.yardId);
    if (!info || !NPC_SALVAGE_INTAKE_STATION_TYPES.has(info.type)) return { ok: false, reason: 'unsupported_salvage_yard' };
    const market = state.economy.markets[intake.yardId] || this.ensureMarket(intake.yardId, info.type, info.size);
    const quote = this.quoteNpcSalvageIntake(intake.yardId, intake.lines);
    if (!quote.ok) return { ok: false, reason: quote.reason };
    const receipt = canonicalSalvageIntakeReceipt({ ...intake, acceptedLines: quote.acceptedLines,
      scrapQty: quote.acceptedLines.find(line => line.commodityId === NPC_SALVAGE_INTAKE_COMMODITY_ID)?.qty || 0 });
    const valueCr = Math.max(1, Math.round(quote.acceptedLines.reduce((sum, line) =>
      sum + (Number(market[line.commodityId].lastMid) || 0) * line.qty, 0)));
    const result = resultFor(receipt, false, valueCr);
    if (typeof payload.commitCustody === 'function' && payload.commitCustody(result) !== true) {
      return { ok: false, reason: 'salvage_custody_changed' };
    }
    // The physical owner has debited precisely these lines. No event escapes between that
    // mutation, the existing durable receipt, and stock writes; observers see one settlement.
    state.economy.appliedSalvageIntakeReceipts = normalizeSalvageIntakeReceipts([...intakeState.receipts, receipt]).receipts;
    for (const line of quote.acceptedLines) this.applyStockPressure(intake.yardId, line.commodityId, 'sell', line.qty);
    this.snapshotIntel(intake.yardId);
    this.bus.emit('economy:salvageIntakeApplied', result);
    return result;
  },

  // -------------------------------------------------------------------------------------------
  // CREDITS — SOLE WRITER (§0.6). Everyone else emits economy:grant/chargeCredits.
  // -------------------------------------------------------------------------------------------
  grantCredits(amount, reason) {
    amount = Math.round(amount || 0);
    if (!Number.isSafeInteger(amount) || amount <= 0) return this.state.player.credits;
    const p = this.state.player;
    const before = normalizeCredits(p.credits);
    p.credits = normalizeCredits(before + amount);
    recordEconomyCash(this.state.economy, this.state.simTime, p.credits - before, reason);
    // Per-save earnings total (ZERO_TO_HERO Phase 5.5: the demo end card reads it). Grants only —
    // the New Game stake is a direct assignment, never a grant, so it is not counted as earned.
    if (p.stats) p.stats.creditsEarned = (p.stats.creditsEarned || 0) + (p.credits - before);
    this.bus.emit('credits:changed', { delta: p.credits - before, reason: reason || 'grant', total: p.credits });
    return p.credits;
  },

  chargeCredits(amount, reason, extra) {
    amount = Math.round(amount || 0);
    if (!Number.isSafeInteger(amount) || amount <= 0) return this.state.player.credits;
    const p = this.state.player;
    const before = normalizeCredits(p.credits);
    p.credits = normalizeCredits(before - amount); // clamp ≥0 (§ spec)
    const delta = p.credits - before;          // actual change (may be smaller if it floored at 0)
    recordEconomyCash(this.state.economy, this.state.simTime, delta, reason);
    this.bus.emit('credits:changed', { delta, reason: reason || 'charge', total: p.credits });
    const charged = -delta;
    if (charged > 0) {
      const hint = extra && typeof extra === 'object' && !Array.isArray(extra) ? extra : null;
      const kind = (hint && SESSION_SINK_KIND_SET.has(hint.sink) && hint.sink)
        || classifySessionSink(reason);
      if (kind) {
        const record = fileSessionSink(this.state, {
          kind,
          cause: hint && hint.cause,
          amount: charged,
          reason: reason || 'charge',
        });
        if (record && this.bus) {
          this.bus.emit('economy:sinkCharged', {
            id: record.id,
            kind: record.kind,
            cause: record.cause,
            causeWord: SESSION_SINK_CAUSES[record.kind] || null,
            amount: record.amount,
            reason: record.reason,
            at: record.at,
          });
        }
      }
    }
    return p.credits;
  },

  // NXB-009 — optional exact-payment requests. A requireFull payload carries the balance it
  // was priced against (expectedCredits), a caller commit() performing an already-validated
  // no-throw replacement, and a result slot. The replacement runs BEFORE the charge
  // notification and only the sole writer moves money — so a missing listener, a stale
  // balance, or a short balance rejects with payload.result=false and nothing mutates.
  // Ordinary payloads keep the legacy clamp-at-zero path untouched.
  _onChargeCreditsRequest(p) {
    if (!p || p.requireFull !== true) {
      return this.chargeCredits((p && p.amount) || 0, p && p.reason, p);
    }
    // A settled exact request stays settled: a second listener must never reopen it into a
    // reported rejection after money already moved.
    if (p.result === true) return this.state.player.credits;
    p.result = false;
    if (this._exactChargeInFlight) return this.state.player.credits;
    const amount = Number(p.amount);
    const live = normalizeCredits(this.state.player && this.state.player.credits);
    if (!Number.isSafeInteger(amount) || amount < 0) return live;
    if (live !== p.expectedCredits || live < amount || typeof p.commit !== 'function') return live;
    this._exactChargeInFlight = true;
    try {
      if (p.commit() !== true) return live;
      this.chargeCredits(amount, p.reason, p);
      p.result = true;
    } finally {
      this._exactChargeInFlight = false;
    }
    return this.state.player.credits;
  },

  /**
   * §15.6 C6 — mass slam × station. Reads the collision receipt collisionConsequences already
   * emits for every struck body; acts only when the struck surface is a station, the striker was
   * put in motion by the player, and the contact was a real slam by closing speed and mass.
   * Everything downstream is an existing writer's verb: debt on the note, a service outage the
   * yard refuses on, the insurer's deductible, a faction rep intent, and one receipt
   * (`station:slammed`) for sectorSim, barks and the ledger to read.
   */
  _onCollisionConsequence(p) {
    if (!p || p.surface !== 'structure' || p.otherType !== 'station') return null;
    const state = this.state;
    const provenance = p.provenance;
    if (!provenance || provenance.actorId == null || provenance.actorId !== state.playerId) return null;
    if (p.targetId === state.playerId) return null;
    const closing = Number(p.feelDeltaV);
    const mass = Number(p.targetMass);
    if (!(closing >= DOCK_SLAM_LAW.closingSpeedMin) || !(mass >= DOCK_SLAM_LAW.massMin)) return null;
    const stationEntity = state.entities && state.entities.get(p.otherId);
    const stationId = (stationEntity && stationEntity.data && stationEntity.data.stationId)
      || (stationEntity && stationEntity.stationId)
      || p.otherId;
    const info = stationInfo(state, stationId);
    if (!info) return null; // a structure that is not a berth has no dock control to bill you
    const econ = state.economy || (state.economy = {});
    const now = Number(state.simTime) || 0;
    const latch = econ.dockSlamLatch || (econ.dockSlamLatch = {});
    const latchKey = `${stationId}:${p.targetId}`;
    if (Number.isFinite(latch[latchKey]) && now - latch[latchKey] < DOCK_SLAM_LAW.relatchS) return null;
    latch[latchKey] = now;
    // Bound the latch: a long session can only ever hold a handful of live keys.
    const latchKeys = Object.keys(latch);
    if (latchKeys.length > 32) {
      for (const k of latchKeys) if (now - latch[k] >= DOCK_SLAM_LAW.relatchS) delete latch[k];
    }

    const fineCr = Math.max(DOCK_SLAM_LAW.fineMinCr, Math.min(DOCK_SLAM_LAW.fineMaxCr,
      Math.round(mass * closing * DOCK_SLAM_LAW.finePerMomentum)));
    const debtBefore = Math.max(0, Math.round(Number(state.player && state.player.debt) || 0));
    this._fileDebt(fineCr);

    // The outage lives under the berth's condition record (src/economy/stationConditions.js);
    // stationServiceOutage() is the alias read over it.
    const rec = this._conditionRec(stationId);
    rec.outageRepairUntil = Math.max(Number(rec.outageRepairUntil) || 0, now + DOCK_SLAM_LAW.repairOutageS);
    rec.outageCause = 'dock_slam';
    rec.outageAtT = now;
    rec.cause = 'dock_slam';
    rec.atT = now;
    const grudgeArmed = this._noteSlamForGrudge(stationId, rec, { now, fineCr, debtBefore, info });

    const player = state.player;
    let deductibleCr = null;
    if (player && player.insurance && typeof player.insurance === 'object') {
      const ins = player.insurance;
      const cap = Math.round(INSURANCE_DEFAULTS.deductibleCr * DOCK_SLAM_LAW.deductibleMaxMult);
      const base = Math.max(0, Math.round(Number(ins.deductibleCr) || INSURANCE_DEFAULTS.deductibleCr));
      ins.deductibleCr = Math.min(cap, Math.round(base * DOCK_SLAM_LAW.deductibleBump));
      deductibleCr = ins.deductibleCr;
    }
    if (player) player.dockSlams = (Number(player.dockSlams) | 0) + 1;

    if (info.factionId) {
      this.bus.emit('faction:repDelta', {
        factionId: info.factionId, delta: DOCK_SLAM_LAW.repDelta, reason: 'dock_slam',
      });
    }
    const meta = FACTION_META.find((f) => f && f.id === info.factionId) || null;
    const lawful = !!(meta && meta.personality === 'lawful');
    const stationName = stationDisplayNameFor(state, stationId);
    const voice = lawful ? 'Dock control' : 'Yardmaster';
    const outageMin = Math.round(DOCK_SLAM_LAW.repairOutageS / 60);
    // A live Swarm round cannot dock at a campaign berth, and the arena's own crash juice speaks
    // for its hits; the dock's prose line is Adventure (SWARM-LEAK-01). The fine, the outage and
    // the receipt still land — only the line the player cannot act on is withheld.
    if (!isSwarmGlass(state)) {
      this.bus.emit('toast', {
        text: `${voice}, ${stationName}: a ${Math.round(mass)}-ton hull just went through our ring — ${fineCr} cr filed on your note, repair bay down ${outageMin} min`,
        kind: 'warn', ttl: 5,
      });
    }
    const receipt = {
      schemaVersion: 1,
      stationId,
      sectorId: info.sectorId || null,
      factionId: info.factionId || null,
      lawful,
      actorId: provenance.actorId,
      strikerId: p.targetId,
      strikerType: p.targetType || null,
      strikerKilled: p.targetKilled === true,
      closingSpeed: closing,
      mass,
      fineCr,
      repairOutageUntil: rec.outageRepairUntil,
      grudge: !!rec.grudge && grudgeLive(state, rec.grudge),
      deductibleCr,
      tick: Number.isFinite(p.tick) ? p.tick : (state.tick | 0),
    };
    this.bus.emit('station:slammed', receipt);
    if (grudgeArmed) this._announceGrudge(grudgeArmed);
    return receipt;
  },

  // -------------------------------------------------------------------------------------------
  // THE WORLD REMEMBERS (U-C) — stations with memory. One record per berth under
  // `state.economy.stationConditions[stationId]` (shape: src/economy/stationConditions.js), written
  // only here, created lazily (a station nothing happened to has no key), serialized only while
  // live. Triggers: dock slams (outage + grudge), the player's kills of a berth's own crew
  // (strike), a surplus-band ore flood (boom). The blockade is derived on read from state.conflicts.
  // -------------------------------------------------------------------------------------------
  _conditionRec(stationId) {
    const econ = this.state.economy || (this.state.economy = {});
    const all = econ.stationConditions || (econ.stationConditions = {});
    return all[stationId] || (all[stationId] = {});
  },

  /** Count a slam toward the berth's grudge; returns a grudge receipt when this slam arms/extends it. */
  _noteSlamForGrudge(stationId, rec, { now, fineCr, debtBefore, info }) {
    const law = STATION_CONDITION_LAW.grudge;
    const log = (Array.isArray(rec.slamLog) ? rec.slamLog : []).filter((e) => e && now - Number(e.t) < law.windowS);
    log.push({ t: now, fineCr, debtBefore });
    rec.slamLog = log;
    if (rec.grudge && grudgeLive(this.state, rec.grudge)) {
      rec.grudge.slams += 1;
      rec.grudge.fineCr += fineCr;
      return null; // already refused; the standing grudge just grows
    }
    if (log.length < law.slamsToGrudge) return null;
    // The note is paid back DOWN to the lowest level it stood at when this run of slams began —
    // i.e. the slam fines (and anything borrowed since) are what dock control wants settled.
    const untilPaidCr = Math.max(0, Math.min(...log.map((e) => Number(e.debtBefore) || 0)));
    rec.grudge = {
      slams: log.length,
      untilPaidCr,
      fineCr: log.reduce((sum, e) => sum + (Number(e.fineCr) || 0), 0),
      since: now,
    };
    delete rec.slamLog;
    rec.cause = 'grudge';
    return { stationId, info };
  },

  _announceGrudge({ stationId, info }) {
    const state = this.state;
    const rec = this._conditionRec(stationId);
    const g = rec.grudge;
    if (!g) return;
    const { voice, name, lawful } = stationVoiceFor(state, stationId);
    const debt = Math.max(0, Math.round(Number(state.player && state.player.debt) || 0));
    const floor = Math.max(0, Math.round(Number(g.untilPaidCr) || 0));
    const owed = Math.max(0, debt - floor);
    if (!isSwarmGlass(state)) {
      this.bus.emit('toast', {
        text: `${voice}, ${name}: ${g.slams} hulls through our ring in a day — pay the ${owed} cr on your note before you come through our ring again`,
        kind: 'error', ttl: 6,
      });
    }
    this.bus.emit('station:grudge', {
      schemaVersion: 1,
      stationId,
      sectorId: (info && info.sectorId) || null,
      factionId: (info && info.factionId) || null,
      lawful,
      slams: g.slams,
      fineCr: g.fineCr,
      untilPaidCr: g.untilPaidCr,
      tick: state.tick | 0,
    });
  },

  /**
   * Housekeeping + the one place a grudge is declared cleared: drop expired fields and empty
   * records (so a quiet station keeps no key), and emit `station:grudgeCleared` the moment the note
   * is back under the level the grudge named. Called from the 5 s economy tick and straight after
   * every debt-paying verb, so the berth reopens the instant the note is paid.
   */
  _sweepStationConditions() {
    const state = this.state;
    const econ = state && state.economy;
    const all = econ && econ.stationConditions;
    if (!all) return;
    const now = Number(state.simTime) || 0;
    const law = STATION_CONDITION_LAW;
    for (const stationId of Object.keys(all)) {
      const rec = all[stationId];
      if (!rec || typeof rec !== 'object') { delete all[stationId]; continue; }
      if (rec.grudge && !grudgeLive(state, rec.grudge)) {
        const { voice, name, info } = stationVoiceFor(state, stationId);
        const cleared = rec.grudge;
        delete rec.grudge;
        delete rec.slamLog;
        this.bus.emit('toast', {
          text: `${voice}, ${name}: note squared — the ring is open to you again`,
          kind: 'success', ttl: 4,
        });
        this.bus.emit('station:grudgeCleared', {
          schemaVersion: 1, stationId,
          sectorId: (info && info.sectorId) || null, factionId: (info && info.factionId) || null,
          slams: cleared.slams, fineCr: cleared.fineCr, tick: state.tick | 0,
        });
      }
      if (!(Number(rec.outageRepairUntil) > now)) { delete rec.outageRepairUntil; delete rec.outageCause; delete rec.outageAtT; }
      if (!(Number(rec.strikeUntil) > now)) { delete rec.strikeUntil; delete rec.strikeKills; }
      if (!(Number(rec.boomUntil) > now)) { delete rec.boomUntil; delete rec.boomYieldU; }
      if (Array.isArray(rec.slamLog)) {
        rec.slamLog = rec.slamLog.filter((e) => e && now - Number(e.t) < law.grudge.windowS);
        if (!rec.slamLog.length) delete rec.slamLog;
      }
      if (Array.isArray(rec.killLog)) {
        rec.killLog = rec.killLog.filter((t) => now - Number(t) < law.strike.windowS);
        if (!rec.killLog.length) delete rec.killLog;
      }
      const keys = Object.keys(rec).filter((k) => k !== 'cause' && k !== 'atT');
      if (!keys.length) delete all[stationId];
    }
    if (!Object.keys(all).length) delete econ.stationConditions;
  },

  /** The berth a victim hull belonged to: an explicit stamp first, else the nearest berth in reach. */
  _homeStationOfCrew(victim) {
    const state = this.state;
    const d = (victim && victim.data) || {};
    const stamped = d.homeStationId || d.stationHomeId || d.jobStationId || d.originStationId
      || (d.source && d.source.homeStationId) || null;
    if (stamped && stationInfo(state, stamped)) return stamped;
    const vp = victim && victim.pos;
    if (!vp) return null;
    let best = null;
    let bestD2 = STATION_STRIKE_REACH_WU * STATION_STRIKE_REACH_WU;
    const list = (state.entities && typeof state.entities.values === 'function')
      ? state.entities.values() : (state.entityList || []);
    for (const e of list) {
      if (!e || e.alive === false || e.type !== 'station' || !e.pos) continue;
      const id = (e.data && e.data.stationId) || e.stationId;
      if (!id || !stationInfo(state, id)) continue;
      const dx = e.pos.x - vp.x;
      const dz = e.pos.z - vp.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2 || (d2 === bestD2 && best && id < best)) { best = id; bestD2 = d2; }
    }
    return best;
  },

  /**
   * Strike: the player kills `killsToStrike` of one berth's own crew (miners, haulers-of-ore,
   * tenders, tugs, salvors, surveyors) inside the window. Reads the `entity:killed` receipt plus
   * the victim hull (still in `state.entities` at emit time) — the receipt itself carries no role.
   */
  _onStationCrewKilled(p) {
    const state = this.state;
    if (!p || state.playerId == null || p.killerId !== state.playerId) return null;
    if (p.type !== 'ship' || p.targetHostileToPlayer === true) return null;
    const victim = state.entities && typeof state.entities.get === 'function' ? state.entities.get(p.id) : null;
    const d = victim && victim.data;
    if (!d) return null;
    const role = String(d.trafficRole || d.role || d.jobKind || '').toLowerCase();
    if (!STATION_CREW_ROLES.includes(role)) return null;
    const stationId = this._homeStationOfCrew(victim);
    const info = stationId ? stationInfo(state, stationId) : null;
    if (!info) return null;
    const now = Number(state.simTime) || 0;
    const law = STATION_CONDITION_LAW.strike;
    const rec = this._conditionRec(stationId);
    const log = (Array.isArray(rec.killLog) ? rec.killLog : []).filter((t) => now - Number(t) < law.windowS);
    log.push(now);
    rec.killLog = log;
    if (log.length < law.killsToStrike) return null;
    const wasOn = Number(rec.strikeUntil) > now;
    rec.strikeUntil = now + law.strikeS;
    rec.strikeKills = (wasOn ? Number(rec.strikeKills) || 0 : 0) + 1;
    rec.cause = 'crew_killed';
    rec.atT = now;
    if (wasOn) return null; // an extension, not a new strike
    delete rec.killLog;
    const { voice, name, lawful } = stationVoiceFor(state, stationId);
    // A live Swarm round is a sealed arena: its berths keep no campaign memory the player can act
    // on, so the berth's own prose line is not a notice the arena owes (SWARM-LEAK-01).
    if (!isSwarmGlass(state)) {
      this.bus.emit('toast', {
        text: `${voice}, ${name}: ${CONDITION_LINES.strike}`,
        kind: 'warn', ttl: 5,
      });
    }
    const receipt = {
      schemaVersion: 1, stationId, sectorId: info.sectorId || null, factionId: info.factionId || null, lawful,
      actorId: p.killerId, victimRole: role, kills: log.length, strikeUntil: rec.strikeUntil,
      sellMult: STATION_CONDITION_LAW.strike.sellMult, tick: state.tick | 0,
    };
    this.bus.emit('station:strike', receipt);
    return receipt;
  },

  /**
   * Boom: an ore flood past the surplus band (the same pricePressure the board's surplus haul-out
   * posts at) puts every yard in that sector with a pump or a bay in flush times for a day.
   */
  _onOreFloodCondition(p) {
    const state = this.state;
    if (!p || typeof p.sectorId !== 'string') return [];
    if (!(Number(p.pricePressure) <= STATION_BOOM_MAX_PRESSURE)) return [];
    const now = Number(state.simTime) || 0;
    const law = STATION_CONDITION_LAW.boom;
    const reg = state.content && state.content.sectors;
    const list = reg ? (Array.isArray(reg) ? reg : Object.values(reg)) : SECTORS;
    const sec = list.find((s) => s && s.id === p.sectorId);
    const receipts = [];
    for (const st of (sec && sec.stations) || []) {
      if (!st || !st.id) continue;
      const info = stationInfo(state, st.id);
      if (!info || !Array.isArray(info.services)
        || !(info.services.includes('repair') || info.services.includes('refuel'))) continue;
      const rec = this._conditionRec(st.id);
      const wasOn = Number(rec.boomUntil) > now;
      rec.boomUntil = now + law.boomS;
      rec.boomYieldU = Number(p.yieldU) || 0;
      rec.cause = 'ore_flood';
      rec.atT = now;
      if (wasOn) continue;
      const { voice, name, lawful } = stationVoiceFor(state, st.id);
      const receipt = {
        schemaVersion: 1, stationId: st.id, sectorId: p.sectorId, factionId: info.factionId || null, lawful,
        commodityId: p.commodityId || null, yieldU: Number(p.yieldU) || 0, boomUntil: rec.boomUntil,
        serviceMult: law.serviceCostMult, tick: state.tick | 0,
      };
      receipts.push(receipt);
      this.bus.emit('station:boom', receipt);
      // The boom is real (the market reprices); its announcement is a berth's prose line, which a
      // live Swarm round does not carry over the fight (SWARM-LEAK-01).
      if (!isSwarmGlass(state)) {
        this.bus.emit('toast', {
          text: `${voice}, ${name}: ${CONDITION_LINES.boom}`,
          kind: 'info', ttl: 5,
        });
      }
    }
    return receipts;
  },

  /**
   * One dock-control line on dock (same toast path as the slam), plus the derived blockade's
   * receipt the first time a berth is docked while a war front holds its sector.
   *
   * A live Swarm round is a sealed arena: its berths are not campaign berths, the run keeps its
   * own wallet and fiction, and "Dock control, Helios Station: the yard is flush" over the fight
   * is Adventure prose the player cannot act on (SWARM-LEAK-01). Refuse at the owner — nothing
   * is emitted — rather than filtering the toast later. Adventure is untouched.
   */
  _announceStationConditions(stationId) {
    const state = this.state;
    if (!stationId) return;
    if (isSwarmGlass(state)) return;
    const live = stationConditionsFor(state, stationId);
    if (!live) { if (this._blockadeAnnounced) delete this._blockadeAnnounced[stationId]; return; }
    if (live.blockade) {
      const ann = this._blockadeAnnounced || (this._blockadeAnnounced = {});
      if (ann[stationId] !== live.blockade.pairKey) {
        ann[stationId] = live.blockade.pairKey;
        const info = stationInfo(state, stationId);
        this.bus.emit('station:blockade', {
          schemaVersion: 1, stationId, sectorId: live.blockade.sectorId, factionId: (info && info.factionId) || null,
          pairKey: live.blockade.pairKey, factions: live.blockade.factions.slice(),
          buyMult: STATION_CONDITION_LAW.blockade.buyMult, refuelFillFrac: STATION_CONDITION_LAW.blockade.refuelFillFrac,
          tick: state.tick | 0,
        });
      }
    } else if (this._blockadeAnnounced) {
      delete this._blockadeAnnounced[stationId];
    }
    const line = stationConditionLine(state, stationId);
    if (line) this.bus.emit('toast', { text: line, kind: 'warn', ttl: 6 });
  },

  /** PQ-155.02 — spilled named cargo can levy restitution. No levy, no debit. */
  levyRestitutionSink(p) {
    if (!p || p.playerCaused !== true) return null;
    const amount = Math.max(0, Math.round(Number(p.levyCr) || 0));
    if (amount <= 0) return null;
    const cause = sinkCauseToken(p.sinkCause, SESSION_SINK_CAUSES.restitution);
    this.chargeCredits(amount, 'restitution:spill', { sink: 'restitution', cause });
    return amount;
  },

  payBounty(payload = {}) {
    const state = this.state;
    const bounty = Math.max(0, Math.round(state.player && state.player.bounty || 0));
    if (bounty <= 0) return { ok: false, reason: 'none', amount: 0, shortfall: 0 };
    const credits = normalizeCredits(state.player && state.player.credits);
    if (credits < bounty) {
      return { ok: false, reason: 'short', amount: bounty, shortfall: bounty - credits };
    }
    this.chargeCredits(bounty, 'bounty:paid');
    state.player.bounty = 0;
    this.bus.emit('bounty:cleared', {
      amount: bounty,
      source: (payload && payload.source) || 'economy:payBounty',
    });
    return { ok: true, reason: 'paid', amount: bounty, shortfall: 0 };
  },

  /**
   * Stale-debt → bounty escalation (the debt side of the heat/bounty/debt triangle). Unpaid debt
   * gets a short grace window; once it is stale, each day:tick adds a deterministic levy to the
   * posted bounty until the debt is settled. One levy per absolute day (`debtStaleDay` latch) —
   * duplicate day events and save/reload replays cannot double-charge the same day.
   */
  _onDebtStaleDay(p) {
    const state = this.state;
    const player = state && state.player;
    if (!player) return;
    const day = Number.isInteger(p && p.days) ? p.days : null;
    const debt = Math.max(0, Math.round(Number(player.debt) || 0));
    if (debt <= 0 || day == null) {
      // A clean ledger carries no stale clock.
      if (debt <= 0) {
        player.debtSinceDay = null;
        delete player.debtStaleDay;
      }
      return;
    }
    if (!Number.isInteger(player.debtSinceDay)) {
      // Legacy saves/foreign accrual paths never stamped a start day: begin the grace window now
      // rather than instantly escalating debt the player was never warned about.
      player.debtSinceDay = day;
      return;
    }
    if (day - player.debtSinceDay < DEBT_STALE_DAYS) return;
    if (player.debtStaleDay === day) return;
    player.debtStaleDay = day;
    const levy = Math.max(1, Math.round(debt * DEBT_TO_BOUNTY_DAILY_FRAC));
    player.bounty = Math.max(0, Math.round((Number(player.bounty) || 0) + levy));
    this.bus.emit('economy:debtEscalated', {
      debtCr: debt,
      levyCr: levy,
      bountyCr: player.bounty,
      daysOverdue: day - player.debtSinceDay,
      source: 'economy',
    });
  },

  /**
   * File a new debit on the note — the same accrual the fine path performs inline. Fresh debt
   * restarts the stale clock so new balances age through the grace window before escalation.
   */
  _fileDebt(amountCr) {
    const state = this.state;
    const player = state && state.player;
    const amount = Math.max(0, Math.round(Number(amountCr) || 0));
    if (!player || amount <= 0) return 0;
    player.debt = Math.max(0, Math.round(Number(player.debt) || 0)) + amount;
    player.debtSinceDay = Number.isInteger(state.days) ? state.days : 0;
    delete player.debtStaleDay;
    return amount;
  },

  /**
   * Release part of the note — the inverse of _fileDebt for work the yard never delivered
   * (stationServices aborts a paid job and returns the undelivered share). A note paid off to
   * zero stops aging like any settled balance; a remaining balance keeps its original stale
   * clock rather than getting a fresh grace window out of a partial refund.
   */
  _releaseDebt(amountCr) {
    const state = this.state;
    const player = state && state.player;
    const amount = Math.max(0, Math.round(Number(amountCr) || 0));
    if (!player || amount <= 0) return 0;
    if (!(Number(player.debt) > 0)) return 0;
    player.debt = Math.max(0, Math.round(Number(player.debt)) - amount);
    if (player.debt <= 0) {
      player.debtSinceDay = null;
      delete player.debtStaleDay;
    }
    this._sweepStationConditions();
    return amount;
  },

  /**
   * FB-101 — a dry tank in a sector with no refuel berth still has a door: the smallest fill
   * that can make a jump, once per day, filed on the note. Dry near a pump is a choice, not a
   * rescue case — stations with 'refuel' service suppress the grant entirely.
   */
  _onFuelEmpty(p) {
    const state = this.state;
    const player = state && state.player;
    const fuel = state && state.fuel;
    if (!player || !fuel) return;
    // A dry tank on a berth is a refuel quote, not a rescue case — the docked hardship
    // branch in handleService owns that door.
    if (state.ui && state.ui.docked === true) return;
    const sector = state.world && state.world.activeSector;
    const stations = sector && Array.isArray(sector.stations) ? sector.stations : [];
    const pumpHere = stations.some((st) => {
      const id = st && (st.stationId || st.id);
      const info = id ? stationInfo(state, id) : null;
      return info && Array.isArray(info.services) && info.services.includes('refuel');
    });
    if (pumpHere) return;
    const day = Number.isInteger(state.days) ? state.days
      : Math.floor((Number(state.simTime) || 0) / 600);
    if (player.emergencyFuelDay === day) return;
    player.emergencyFuelDay = day;
    const grant = Math.min(EMERGENCY_FUEL_U, Math.max(0, (Number(fuel.max) || 0) - (Number(fuel.current) || 0)));
    if (grant <= 0) return;
    const cost = Math.round(grant * FUEL_UNIT_CR);
    fuel.current = Math.min(Number(fuel.max) || 0, (Number(fuel.current) || 0) + grant);
    this._fileDebt(cost);
    this.bus.emit('fuel:changed', { current: fuel.current, max: fuel.max });
    this.bus.emit('alert', {
      key: 'fuel:reserve', sev: 'warn',
      text: `EMERGENCY RESERVE — ${grant}u filed as ${cost} cr debt`,
      ttl: 5,
    });
    this.bus.emit('service:completed', {
      type: 'emergency_fuel', units: grant, debtCr: cost,
      sectorId: (p && p.sectorId) || (state.world && state.world.currentSectorId) || null,
      atT: Number(state.simTime) || 0,
    });
  },

  /** FB-124 — single-trip services expire at the dock that ends the trip. */
  _expireTripServices() {
    const player = this.state && this.state.player;
    if (player && player.cargoPolicy) delete player.cargoPolicy;
  },

  /**
   * FB-111 — the tow settles like a recovery: charge what the wallet holds, file the rest on
   * the note. One intent, one writer; the payload carries the outcome back to the caller.
   */
  _settleTowCharge(p) {
    const state = this.state;
    const player = state && state.player;
    if (!player) { if (p) p.ok = false; return; }
    const quoted = Math.max(0, Math.round(Number(p.quotedCr) || 0));
    const paid = Math.min(quoted, normalizeCredits(player.credits));
    if (paid > 0) this.chargeCredits(paid, 'service:stuck_tow');
    const debtCr = this._fileDebt(quoted - paid);
    p.ok = true;
    p.chargedCr = paid;
    p.debtCr = debtCr;
  },

  // A Survey Lab sells one imperfect bearing. The exact charge writes the bearing
  // only after commit() accepts it; short money and a second buy write nothing.
  _handleSurveyFix() {
    const state = this.state;
    if (!stationOffersService(state, 'scan_tech', this._stationServiceStationId())) {
      this.bus.emit('toast', { text: 'No survey lab at this berth', kind: 'error', ttl: 3 });
      return;
    }
    const plan = planSurveyFix(state);
    if (!plan) {
      this.bus.emit('toast', { text: 'The lab has nothing left to find in this sector', kind: 'info', ttl: 3 });
      return;
    }
    const openFix = openSurveyFix(state, plan.sectorId);
    if (openFix && openFix.mark && !bearingCharted(state, openFix.mark)) {
      // The sold bearing fell off the single-slot chart (cross-sector buy, another course).
      // The record still holds the mark — re-pin it for free; the lab never re-sells it.
      this.bus.emit('ui:setCourse', {
        pos: { x: openFix.mark.x, z: openFix.mark.z },
        reason: 'survey-fix',
        label: openFix.label,
        waypointKind: 'local',
      });
      this.bus.emit('toast', { text: 'The held bearing is back on your chart', kind: 'info', ttl: 3 });
      return;
    }
    if (openFix || soldBearingOpen(state, plan)) {
      this.bus.emit('toast', { text: 'A survey fix is already open — fly the search before buying another', kind: 'warn', ttl: 3 });
      return;
    }
    const credits = normalizeCredits(state.player.credits);
    if (credits < SURVEY_FIX_PRICE) {
      this.bus.emit('toast', { text: 'Not enough credits for a survey fix', kind: 'error', ttl: 3 });
      return;
    }
    const charge = {
      amount: SURVEY_FIX_PRICE,
      reason: 'service:survey_fix',
      requireFull: true,
      expectedCredits: credits,
      commit: () => commitSurveyFix(state, plan),
    };
    this.bus.emit('economy:chargeCredits', charge);
    if (charge.result !== true) return;
    this.bus.emit('ui:setCourse', {
      pos: { x: plan.mark.x, z: plan.mark.z },
      reason: 'survey-fix',
      label: plan.label,
      waypointKind: 'local',
    });
    this.bus.emit('toast', { text: plan.spoken, kind: 'info', ttl: 5 });
  },

  // -------------------------------------------------------------------------------------------
  // SERVICES — refuel / repair / ammo / hull wash (ui:service {type, amount}).
  // -------------------------------------------------------------------------------------------
  handleService(p) {
    const state = this.state;
    const type = p && p.type;
    if (!type) return;
    if (!this._stationServicesDocked()) {
      this.bus.emit('toast', { text: 'Dock first', kind: 'error', ttl: 2 });
      return;
    }
    if (type === 'survey_fix') {
      this._handleSurveyFix();
      return;
    }
    if (['loan', 'settle', 'refuel', 'ammo'].includes(type) && p.amount != null
      && !Number.isFinite(Number(p.amount))) {
      this.bus.emit('toast', { text: 'Service amount must be a finite number', kind: 'error', ttl: 2 });
      return;
    }
    // The berth's own services list is the contract: a trade post with no pump does not fill
    // your tank, and a mining outpost with no yard does not weld your hull. Without this gate
    // the yard refuses the job and the instant-fallback below silently becomes the pump.
    if (type === 'refuel' || type === 'repair') {
      const need = type === 'refuel' ? 'refuel' : 'repair';
      if (!stationOffersService(state, need, this._stationServiceStationId())) {
        this.bus.emit('toast', {
          text: need === 'refuel'
            ? 'No fuel berth here — the yard has no pump'
            : 'No repair yard here — the yard cannot weld',
          kind: 'error', ttl: 3,
        });
        return;
      }
    }
    if (type === 'refuel') {
      const fuel = state.fuel || (state.fuel = { current: 0, max: 100 });
      const fuelYard = this._serviceYard();
      const bookedFuel = fuelYard?.pendingPlayerService?.('refuel')?.units || 0;
      const missingFuel = Math.max(0, fuel.max - fuel.current - bookedFuel);
      const want = p.amount != null ? p.amount : (fuel.max - fuel.current);
      // A blockaded berth rations the pumps: the tank fills only so far (derived from the live front).
      const berthId = (state.ui && state.ui.dockedStationId) || this._lastDockedStation || null;
      const ration = stationRefuelRation(state, berthId, fuel);
      const units = Math.max(0, Math.min(want, missingFuel, ration));
      const fuelUnit = serviceUnitCr(state, FUEL_UNIT_CR, 'refuel');
      if (units <= 0 && ration <= 0 && want > 0 && fuel.max - fuel.current > 0) {
        const { voice, name } = stationVoiceFor(state, berthId);
        this.bus.emit('toast', { text: `${voice}, ${name}: fuel is rationed behind the blockade — the pumps are shut to a tank this full`, kind: 'warn', ttl: 3 });
        return;
      }
      const cost = round(units * fuelUnit);
      if (units <= 0) {
        // The tank is already full — the same word the repair bench gives an intact hull.
        this.bus.emit('toast', { text: bookedFuel > 0 ? 'The remaining fuel is already booked' : 'Tank already full', kind: 'info', ttl: 2 });
        return;
      }
      const credits = normalizeCredits(state.player.credits);
      const realUnits = credits < cost ? Math.max(0, Math.min(units, Math.floor(credits / fuelUnit))) : units;
      if (realUnits <= 0) {
        // FB-101 hardship branch: a broke pilot still gets the smallest fill that can jump —
        // the berth files the unpaid units on the note instead of stranding the hull.
        const reserve = Math.min(EMERGENCY_FUEL_U, units);
        const debtCr = this._fileDebt(Math.round(reserve * fuelUnit));
        const stationId = (state.ui && state.ui.dockedStationId) || this._lastDockedStation || null;
        if (fuelYard && fuelYard.enqueuePlayerJob({
          type: 'refuel', units: reserve, stationId,
          meta: { cost: 0, debtCr },
        })) {
          this.bus.emit('toast', { text: `Refuel on the note (${round(reserve)}u — ${debtCr} cr filed)`, kind: 'warn', ttl: 3 });
        } else {
          fuel.current = Math.min(fuel.max, fuel.current + reserve);
          this.bus.emit('fuel:changed', { current: fuel.current, max: fuel.max });
          this.bus.emit('toast', { text: `Emergency fuel (${round(reserve)}u — ${debtCr} cr filed as debt)`, kind: 'warn', ttl: 3 });
        }
        return;
      }
      const realCost = round(realUnits * fuelUnit);
      this.chargeCredits(realCost, 'service:refuel');
      // The yard owns timed delivery when the player is on a live dock (fuel is a pump, not an
      // instant fill). Harness docks without the production latch keep the instant path below.
      if (fuelYard && fuelYard.enqueuePlayerJob({
        type: 'refuel', units: realUnits,
        stationId: (state.ui && state.ui.dockedStationId) || this._lastDockedStation || null,
        meta: { cost: realCost },
      })) {
        this.bus.emit('toast', { text: `Refuel underway (${round(realUnits)}u, ${realCost} cr)`, kind: 'success', ttl: 2 });
      } else {
        fuel.current = Math.min(fuel.max, fuel.current + realUnits);
        this.bus.emit('fuel:changed', { current: fuel.current, max: fuel.max });
        this.bus.emit('toast', { text: `${realUnits < units ? 'Partial refuel' : 'Refueled'} (${round(realUnits)}u, ${realCost} cr)`, kind: realUnits < units ? 'warn' : 'success', ttl: 2 });
      }
    } else if (type === 'repair') {
      const e = state.entities && state.entities.get(state.playerId);
      if (!e) return;
      // §15.6 C6 — the yard is down while a slammed ring is cleared. The outage is real time,
      // not a refusal with a timer painted on it: wait it out or weld somewhere else.
      const outage = stationServiceOutage(state,
        (state.ui && state.ui.dockedStationId) || this._lastDockedStation || null, 'repair');
      if (outage) {
        const mins = Math.max(1, Math.ceil(outage.remainingS / 60));
        this.bus.emit('toast', {
          text: `Repair bay down — somebody put a hull through the ring (${mins} min)`,
          kind: 'error', ttl: 3,
        });
        return;
      }
      const beforeHull = Number(e.hull) || 0;
      const beforeArmor = Number(e.armorHp) || 0;
      const hullMax = Number(e.hullMax) || 0;
      const armorMax = Number(e.armorMax) || 0;
      const totalMax = hullMax + armorMax;
      const beforeProtection = totalMax > 0 ? (beforeHull + beforeArmor) / totalMax : 1;
      const repairYard = this._serviceYard();
      const bookedRepair = repairYard?.pendingPlayerService?.('repair') || { hull: 0, armor: 0 };
      const missHull = Math.max(0, (e.hullMax || 0) - (e.hull || 0) - bookedRepair.hull);
      const missArmor = Math.max(0, (e.armorMax || 0) - (e.armorHp || 0) - bookedRepair.armor);
      const totalMiss = missHull + missArmor;
      if (totalMiss <= 0.5) {
        this.bus.emit('toast', { text: bookedRepair.hull + bookedRepair.armor > 0
          ? 'The remaining repair is already booked' : 'Hull already intact', kind: 'info', ttl: 2 });
        return;
      }
      const repairUnit = serviceUnitCr(state, REPAIR_HP_CR, 'repair');
      const cost = round(totalMiss * repairUnit);
      const credits = normalizeCredits(state.player.credits);
      if (credits <= 0) {
        const { day, budget, allowance, reserve } = emergencyRepairReserve(state, e, bookedRepair.hull);
        if (reserve > 0) {
          const stationId = (state.ui && state.ui.dockedStationId) || this._lastDockedStation || null;
          const debtCr = this._fileDebt(round(reserve * repairUnit));
          budget.usedHull = (Number(budget.usedHull) || 0) + reserve;
          state.player.emergencyRepairBudget = budget;
          if (repairYard && repairYard.enqueuePlayerJob({
            type: 'repair', units: reserve, stationId,
            meta: { cost: 0, debtCr, emergencyRepairDay: day, shares: { hull: 1, armor: 0 },
              restoredHull: reserve, restoredArmor: 0, hullMax, armorMax, beforeProtection },
          })) {
            this.bus.emit('toast', { text: `Emergency weld on the note (${debtCr} cr filed)`, kind: 'warn', ttl: 3 });
          } else {
            e.hull = Math.min(hullMax, beforeHull + reserve);
            this.bus.emit('service:completed', { type: 'repair', cost: 0, debtCr,
              restoredHull: e.hull - beforeHull, restoredArmor: 0, hullMax, armorMax,
              beforeProtection, stationId, atT: Number(state.simTime) || 0 });
            this.bus.emit('toast', { text: `Emergency weld (${debtCr} cr filed as debt)`, kind: 'warn', ttl: 3, audio: false });
          }
          return;
        }
        this.bus.emit('toast', { text: allowance <= 0
          ? 'Emergency weld allowance used today — earn credits for the remaining repair'
          : 'No credits for repairs — the hull is above the emergency weld floor', kind: 'warn', ttl: 3 });
        return;
      }
      const yardUnits = credits < cost ? totalMiss * (cost > 0 ? credits / cost : 0) : totalMiss;
      if (repairYard && repairYard.enqueuePlayerJob({
        type: 'repair',
        units: yardUnits,
        stationId: (state.ui && state.ui.dockedStationId) || this._lastDockedStation || null,
        meta: {
          cost: credits < cost ? credits : cost,
          shares: { hull: totalMiss > 0 ? missHull / totalMiss : 0, armor: totalMiss > 0 ? missArmor / totalMiss : 0 },
          restoredHull: credits < cost ? missHull * (cost > 0 ? credits / cost : 0) : missHull,
          restoredArmor: credits < cost ? missArmor * (cost > 0 ? credits / cost : 0) : missArmor,
          hullMax, armorMax, beforeProtection,
        },
      })) {
        // Paid up front; the yard works the queue and fires service:completed when the weld is
        // actually done. Harness docks keep the synchronous apply in the else path.
        let actualCost = cost;
        if (credits < cost) {
          actualCost = credits;
          this.chargeCredits(credits, 'service:repair');
          this.bus.emit('toast', { text: 'Partial repair booked — out of credits', kind: 'warn', ttl: 2 });
        } else {
          this.chargeCredits(cost, 'service:repair');
          this.bus.emit('toast', { text: `Repair underway (${cost} cr)`, kind: 'success', ttl: 2 });
        }
      } else {
        let actualCost = cost;
        if (credits < cost) {
          // partial repair up to what the player can afford
          const frac = cost > 0 ? credits / cost : 0;
          e.hull = Math.min(e.hullMax, (e.hull || 0) + missHull * frac);
          e.armorHp = Math.min(e.armorMax, (e.armorHp || 0) + missArmor * frac);
          actualCost = credits;
          this.chargeCredits(credits, 'service:repair');
          this.bus.emit('toast', { text: 'Partial repair — out of credits', kind: 'warn', ttl: 2 });
        } else {
          e.hull = e.hullMax; e.armorHp = e.armorMax;
          this.chargeCredits(cost, 'service:repair');
          this.bus.emit('toast', { text: `Repaired (${cost} cr)`, kind: 'success', ttl: 2, audio: false });
        }
        this.bus.emit('service:completed', {
          type: 'repair',
          cost: actualCost,
          restoredHull: Math.max(0, (Number(e.hull) || 0) - beforeHull),
          restoredArmor: Math.max(0, (Number(e.armorHp) || 0) - beforeArmor),
          hullMax,
          armorMax,
          beforeProtection,
          stationId: (state.ui && state.ui.dockedStationId) || this._lastDockedStation || null,
          atT: Number(state.simTime) || 0,
        });
      }
    } else if (type === 'hull_wash') {
      const stationId = (state.ui && state.ui.dockedStationId) || this._lastDockedStation || null;
      const info = stationInfo(state, stationId);
      if (!stationId || !info || !Array.isArray(info.services) || !info.services.includes('repair')) {
        this.bus.emit('toast', { text: 'Hull wash requires a repair berth', kind: 'error', ttl: 2 });
        return;
      }
      const player = state.player || {};
      const index = Math.max(0, Math.floor(Number(player.activeShipIndex) || 0));
      const owned = Array.isArray(player.ownedShips) ? player.ownedShips[index] : null;
      const grime = livingHullGrimeAt(owned && owned.livingHull, state.simTime || 0);
      if (grime <= 0.001) {
        this.bus.emit('toast', { text: 'Hull finish already clean', kind: 'info', ttl: 2 });
        return;
      }
      if (normalizeCredits(player.credits) < HULL_WASH_CR) {
        this.bus.emit('toast', { text: 'Not enough credits for a hull wash', kind: 'error', ttl: 2 });
        return;
      }
      this.chargeCredits(HULL_WASH_CR, 'service:hull_wash');
      this.bus.emit('service:completed', {
        type: 'hull_wash',
        cost: HULL_WASH_CR,
        grimeBefore: grime,
        stationId,
        atT: Number(state.simTime) || 0,
      });
      this.bus.emit('toast', { text: `Hull washed (${HULL_WASH_CR} cr)`, kind: 'success', ttl: 2, audio: false });
    } else if (type === 'ammo') {
      // A missing amount means "a batch, hold and wallet permitting" — the same default
      // semantics the refuel and repair verbs carry. An explicit 0 is an answer: nothing asked.
      const units = Math.max(0, Math.floor(p.amount != null ? p.amount : AMMO_BATCH));
      if (units <= 0) {
        this.bus.emit('toast', { text: 'No munitions requested', kind: 'info', ttl: 2 });
        return;
      }
      const cost = round(units * AMMO_UNIT_CR);
      if (normalizeCredits(state.player.credits) < cost) { this.bus.emit('toast', { text: 'Not enough credits for munitions', kind: 'error', ttl: 2 }); return; }
      // ammo is tracked as a cargo commodity (cmdty_munitions) so it integrates with the hold.
      const added = this.addToCargo(this.registryGet && this.registryGet('cargo'), state, 'cmdty_munitions', units);
      if (added <= 0) { this.bus.emit('toast', { text: 'Cargo hold full', kind: 'error', ttl: 2 }); return; }
      const realCost = round(added * AMMO_UNIT_CR);
      this.chargeCredits(realCost, 'service:ammo');
      this.bus.emit('toast', { text: `Bought ${added} munitions (${realCost} cr)`, kind: 'success', ttl: 2 });
    } else if (type === 'redeem_rights') {
      // Stunt-paid claim currency (PQ-155.03): a Pitborn yard/fence buys out held rights for
      // credits plus a standing notice. Trick pay never opened the wallet; the sink only
      // converts a right the player already scooped, at a berth the yards actually run.
      const player = state.player || (state.player = {});
      const held = Math.max(0, Math.floor(Number(player.salvageRights) || 0));
      if (held <= 0) {
        this.bus.emit('toast', { text: 'No salvage rights to redeem', kind: 'info', ttl: 2 });
        return;
      }
      const stationId = this.dockedStationId();
      const reps = {};
      for (const [fid, row] of Object.entries(state.factions || {})) reps[fid] = Number(row && row.rep) || 0;
      const presence = stationId ? presenceServiceForStation(stationId, reps) : null;
      const yard = presence && presence.factionId === 'faction_pitborn'
        && Array.isArray(presence.services) && presence.services.length > 0
        && presence.available !== false;
      if (!yard) {
        this.bus.emit('toast', { text: 'Salvage rights redeem at a Pitborn yard', kind: 'error', ttl: 2 });
        return;
      }
      const want = p.amount != null ? Math.min(held, Math.max(0, Math.floor(Number(p.amount)))) : held;
      if (want <= 0) {
        // An explicit zero is an answer: the player asked to redeem nothing.
        this.bus.emit('toast', { text: 'No rights asked for', kind: 'info', ttl: 2 });
        return;
      }
      player.salvageRights = held - want;
      const payout = round(want * SALVAGE_RIGHT_CR);
      this.grantCredits(payout, 'service:redeem_rights');
      this.bus.emit('faction:repDelta', { factionId: 'faction_pitborn', delta: want, reason: 'salvage_rights_redeem' });
      this.bus.emit('service:completed', {
        type: 'redeem_rights', rights: want, payout, stationId, atT: Number(state.simTime) || 0,
      });
      this.bus.emit('toast', { text: `Redeemed ${counted(want, 'salvage right', 'salvage rights')} (+${payout} cr)`, kind: 'success', ttl: 2 });
    } else if (type === 'insurance') {
      const ins = state.player.insurance || (state.player.insurance = {
        rate: INSURANCE_DEFAULTS.rate,
        deductibleCr: INSURANCE_DEFAULTS.deductibleCr,
        insuredModules: false,
        lastStationId: null,
      });
      const enable = !!p.amount;
      if (enable) {
        if (ins.insuredModules) { this.bus.emit('toast', { text: 'Hull insurance already active', kind: 'info', ttl: 2 }); return; }
        const cost = Math.max(0, Math.round(ins.deductibleCr || 0));
        if (normalizeCredits(state.player.credits) < cost) { this.bus.emit('toast', { text: 'Not enough credits for insurance', kind: 'error', ttl: 2 }); return; }
        if (cost) this.chargeCredits(cost, 'service:insurance');
        ins.insuredModules = true;
        ins.lastStationId = (state.ui && state.ui.dockedStationId) || this._lastDockedStation || ins.lastStationId;
        this.bus.emit('toast', { text: `Hull insurance active (${cost} cr)`, kind: 'success', ttl: 2 });
      } else {
        if (!ins.insuredModules) { this.bus.emit('toast', { text: 'Hull insurance already inactive', kind: 'info', ttl: 2 }); return; }
        ins.insuredModules = false;
        this.bus.emit('toast', { text: 'Hull insurance cancelled', kind: 'info', ttl: 2 });
      }
    } else if (type === 'loan') {
      // FB-049 — the note as an instrument: borrow against what you hold and the standing this
      // berth's faction extends. Stale notes age into bounty through the existing day:tick rule.
      const player = state.player;
      const stationId = (state.ui && state.ui.dockedStationId) || this._lastDockedStation || null;
      const limit = loanLimitFor(state, stationId);
      const outstanding = Math.max(0, Math.round(Number(player.debt) || 0));
      const room = Math.max(0, limit - outstanding);
      const want = p.amount != null ? Math.max(0, Math.floor(Number(p.amount))) : room;
      const take = Math.min(room, want);
      if (take <= 0) {
        this.bus.emit('toast', { text: 'The note is already at its limit', kind: 'error', ttl: 2 });
        return;
      }
      this._fileDebt(take);
      this.grantCredits(take, 'service:loan');
      this.bus.emit('service:completed', {
        type: 'loan', amount: take, debtCr: Math.round(Number(player.debt) || 0),
        stationId, atT: Number(state.simTime) || 0,
      });
      this.bus.emit('toast', {
        text: `Borrowed ${take} cr — the note stands at ${Math.round(Number(player.debt) || 0)} cr`,
        kind: 'success', ttl: 3,
      });
    } else if (type === 'settle') {
      // FB-049 — paying the note down: a cleared ledger drops the stale clock and stops the
      // daily bounty levy at the next day:tick.
      const player = state.player;
      const debt = Math.max(0, Math.round(Number(player.debt) || 0));
      if (debt <= 0) {
        this.bus.emit('toast', { text: 'No note on the ledger', kind: 'info', ttl: 2 });
        return;
      }
      const want = p.amount != null ? Math.min(debt, Math.max(0, Math.floor(Number(p.amount)))) : debt;
      const pay = Math.min(want, normalizeCredits(player.credits));
      if (pay <= 0) {
        this.bus.emit('toast', { text: 'Nothing to settle it with', kind: 'error', ttl: 2 });
        return;
      }
      this.chargeCredits(pay, 'service:settle');
      player.debt = debt - pay;
      if (player.debt <= 0) {
        player.debtSinceDay = null;
        delete player.debtStaleDay;
      }
      // A berth that holds a grudge over the note reopens the moment it is paid back down.
      this._sweepStationConditions();
      const stationId = (state.ui && state.ui.dockedStationId) || this._lastDockedStation || null;
      this.bus.emit('service:completed', {
        type: 'settle', amount: pay, debtCr: player.debt,
        stationId, atT: Number(state.simTime) || 0,
      });
      this.bus.emit('toast', {
        text: player.debt > 0
          ? `Paid ${pay} cr — the note stands at ${player.debt} cr`
          : `Note settled (${pay} cr)`,
        kind: 'success', ttl: 2,
      });
    } else if (type === 'cargo_insurance') {
      // FB-124 — a one-trip policy on the legal manifest, priced at this berth by the sector's
      // real danger tier. The claim is honored in the recovery plan at defeat time.
      const player = state.player;
      if (player.cargoPolicy) {
        this.bus.emit('toast', { text: 'Cargo policy already active until the next dock', kind: 'info', ttl: 2 });
        return;
      }
      const quote = cargoPolicyQuoteFor(state);
      if (!quote) {
        this.bus.emit('toast', { text: 'No legal cargo in the hold to cover', kind: 'info', ttl: 2 });
        return;
      }
      if (normalizeCredits(player.credits) < quote.premiumCr) {
        this.bus.emit('toast', { text: 'Not enough credits for a cargo policy', kind: 'error', ttl: 2 });
        return;
      }
      this.chargeCredits(quote.premiumCr, 'service:cargo_insurance');
      const stationId = (state.ui && state.ui.dockedStationId) || this._lastDockedStation || null;
      player.cargoPolicy = {
        manifestCr: quote.manifestCr,
        coverFrac: quote.coverFrac,
        coverCr: quote.coverCr,
        premiumCr: quote.premiumCr,
        dangerTier: quote.dangerTier,
        stationId,
        issuedAt: Number(state.simTime) || 0,
      };
      this.bus.emit('service:completed', {
        type: 'cargo_insurance', premiumCr: quote.premiumCr, manifestCr: quote.manifestCr,
        coverCr: quote.coverCr, stationId, atT: Number(state.simTime) || 0,
      });
      this.bus.emit('toast', {
        text: `Cargo policy written (${quote.premiumCr} cr — covers ${quote.coverCr} cr until the next dock)`,
        kind: 'success', ttl: 3,
      });
    }
  },

  // -------------------------------------------------------------------------------------------
  // CONTRABAND SCAN & FINES
  // -------------------------------------------------------------------------------------------
  /** Active fitted smuggling capabilities. Derived ship stats are the live authority; the
   * efficiency bag remains a migration fallback for older saves/tools. */
  smugglingCapabilities(state) {
    return readSmugglingCapabilities(state);
  },

  // Where this scan can physically see a rock cache. The sector is the scan's
  // jurisdiction. The points are the patrol doing the reading and the hull being
  // read. 700 WU matches the patrol hold and the lawful-inspection range; a
  // customs cone matches its 90 WU beam. No location means the scan covers no rock.
  _deadDropScanCoverage(p) {
    const state = this.state;
    const sectorId = state && state.world && state.world.currentSectorId;
    if (typeof sectorId !== 'string' || !sectorId) return null;
    const points = [];
    const add = (pos) => {
      if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)) points.push({ x: pos.x, z: pos.z });
    };
    const entities = state.entities;
    if (p && p.patrolId != null && entities && typeof entities.get === 'function') {
      const patrol = entities.get(p.patrolId);
      if (patrol) add(patrol.pos);
    }
    if (entities && typeof entities.get === 'function' && state.playerId != null) {
      const player = entities.get(state.playerId);
      if (player) add(player.pos);
    }
    if (!points.length) return null;
    const source = p && p.source;
    const range = (source === 'customs_weir' || source === 'customs_weir_bolt' || source === 'customs_scan_cone')
      ? 90
      : 700;
    return { sectorId, points, range };
  },

  /** List scan-exposed illicit stacks currently in the hold: [{ commodityId, qty, def }]. */
  illicitCargo(state, coverage) {
    const combined = onboardIllicitCargo(state);
    // Rock goods are not the fitted hold and not the salvage bay. A hidden hold
    // must not cover them, and a sealed bore must not cover what is still aboard.
    const scan = coverage === undefined ? this._deadDropScanCoverage(null) : coverage;
    for (const stack of exposedDeadDropStacks(state, commodityDef, scan)) {
      const row = combined.get(stack.commodityId) || {
        commodityId: stack.commodityId, qty: 0, holdQty: 0, bayQty: 0, def: stack.def,
      };
      row.cacheQty = (row.cacheQty || 0) + stack.qty;
      row.qty += stack.qty;
      combined.set(stack.commodityId, row);
    }
    return [...combined.values()];
  },

  currentSecurity() {
    const state = this.state;
    const sid = state.world && state.world.currentSectorId;
    const sec = sid && (SECTORS.find((s) => s.id === sid));
    return sec ? sec.security : 0.5;
  },

  scannerCloak(state) {
    return this.smugglingCapabilities(state).scannerCloak;
  },

  /** Bonded contract freight: a mission that preloaded cargo destined for this berth commissioned
   *  the manifest the post is reading — its stacks are sealed, so the sweep exempts up to the
   *  contracted qty. Smuggling types never qualify: running contraband into a scan post is the
   *  one arrival the fiction says gets read. Returns Map(commodityId -> exempt qty). */
  _bondedDockCargo(stationId) {
    const exempt = new Map();
    const list = this.state.missions && Array.isArray(this.state.missions.active)
      ? this.state.missions.active : [];
    for (const m of list) {
      if (!m || m.status !== 'active' || m.type === 'smuggling_run') continue;
      if (m.destStationId !== stationId || m.preloadedCargo !== true) continue;
      const id = m.params && m.params.cmdtyId;
      if (typeof id !== 'string' || !id) continue;
      exempt.set(id, (exempt.get(id) || 0) + Math.max(1, Number(m.params.qty) || 1));
    }
    return exempt;
  },

  // A station posting 'toll'/'scan' is a working checkpoint: it reads every berthing hold and
  // collects its plate. Clean sweeps leave a line; exposed contraband resolves through the same
  // runScan path the gate-jump and patrol scans already use — so bust clauses, hot-faction
  // memory, and the customs surface all consume one authority. The 'dock' source tag marks
  // berth-sourced sweeps so flight-side consumers (the customs verb deck, a live patrolScan
  // script) don't answer a scan the station already handled.
  _runDockedCustomsPost(stationId) {
    const state = this.state;
    // Runs that are not the campaign (survival, combat lab) keep their own fiction and wallet —
    // a lab arena parked in a shared sector must not collect customs plates or read a lab hold.
    if (state.run && state.run.kind !== 'adventure' && state.run.phase !== 'inactive') return;
    const info = stationInfo(state, stationId);
    const services = info && Array.isArray(info.services) ? info.services : [];
    if (services.includes('scan')) {
      const res = this.runScan({
        security: DOCK_SCAN_SECURITY,
        factionId: (info && info.factionId) || this.scanningFaction(state),
        stationId,
        source: 'dock',
        bondedCargo: this._bondedDockCargo(stationId),
      });
      if (!res || res.found !== true) {
        this.bus.emit('toast', { text: 'CUSTOMS SWEEP — manifest reads clean.', kind: 'info', ttl: 3 });
      }
    }
    if (services.includes('toll')) {
      const sec = Number(info && info.security) || 0;
      const toll = Math.round(DOCK_TOLL_BASE_CR + DOCK_TOLL_SECURITY_CR * sec);
      if (toll > 0) {
        // Collect what the wallet actually holds and file the unpaid remainder on the note —
        // the same shortfall style as the contraband fine path. The line names the real
        // numbers: a partial wallet is not a full toll, and a dry wallet is not a waived one.
        const credits = normalizeCredits(state.player && state.player.credits);
        const collected = Math.min(toll, credits);
        const filed = this._fileDebt(toll - collected);
        if (collected > 0) this.chargeCredits(collected, 'service:dock_toll');
        // The berth-session receipt surface isn't up yet when the toll posts (economy runs
        // before ui on dock:docked), so name the debit on the toast rail — silent ~180 cr.
        const text = collected >= toll
          ? `BERTH TOLL — ${collected} cr posted.`
          : collected > 0
            ? `BERTH TOLL — ${collected} cr posted · ${filed} cr filed on the note.`
            : `BERTH TOLL — ${filed} cr filed on the note.`;
        this.bus.emit('toast', { text, kind: 'info', ttl: 3 });
      }
    }
  },

  /** The scanner's memory record: a faction's gates stay hot on a hull that slipped or broke a
   *  read until the window decays. Single writer for customsHotUntil so evaded scans and weir
   *  bolts share one ledger. */
  _markFactionGatesHot(factionId) {
    if (!factionId) return;
    const state = this.state;
    if (!state || !state.player) return;
    if (!state.player.customsHotUntil || typeof state.player.customsHotUntil !== 'object') {
      state.player.customsHotUntil = {};
    }
    state.player.customsHotUntil[factionId] = Math.max(
      Number(state.player.customsHotUntil[factionId]) || 0,
      (state.simTime || 0) + HOT_DURATION_S,
    );
  },

  /** Run a scan check against any contraband in the hold. Emits player:scannedByPatrol + (if found)
   *  contraband:scanned + faction:repDelta. Fines via chargeCredits; confiscates cargo. Standing
   *  still funnels through factions.applyRep (the faction:repDelta listener). The scanned event
   *  is the incident/strike ledger; it must not apply a second reputation hit. */
  runScan(p) {
    const state = this.state;
    const deadDropCoverage = this._deadDropScanCoverage(p);
    let illicit = this.illicitCargo(state, deadDropCoverage);
    const bonded = p && p.bondedCargo;
    if (bonded && bonded.size > 0 && illicit.length) {
      illicit = illicit
        .map((s) => {
          const holdQty = Math.max(0, s.holdQty - Math.max(0, Number(bonded.get(s.commodityId)) || 0));
          const cacheQty = Math.max(0, Math.floor(Number(s.cacheQty) || 0));
          return { ...s, holdQty, qty: holdQty + s.bayQty + cacheQty };
        })
        .filter((s) => s.qty > 0);
    }
    const hasContraband = illicit.length > 0;
    // A lawfulInspectionCaseId is a caller-owned correlation token, not a new scan result. Keep
    // ordinary scan packets byte-for-byte shaped as before so existing customs/UI consumers retain
    // their contract, while the durable lawSecurity case can distinguish its synchronous return.
    const lawfulInspectionCaseId = typeof p.lawfulInspectionCaseId === 'string' && p.lawfulInspectionCaseId
      ? p.lawfulInspectionCaseId
      : null;
    const scannedPayload = { hasContraband };
    if (lawfulInspectionCaseId) scannedPayload.lawfulInspectionCaseId = lawfulInspectionCaseId;
    if (p.source) scannedPayload.source = p.source;
    if (p.stationId) scannedPayload.stationId = p.stationId;
    // The scanner's identity travels with the verdict so listeners (e.g. the busted mission
    // successor) can route back through the patrol's lawful jurisdiction rather than only the
    // station the proximity case happened to name.
    if (p.patrolId != null) scannedPayload.patrolId = p.patrolId;
    // The detection roll is decided BEFORE the scan is announced so the announcement can carry
    // the real verdict. `hasContraband` still means "contraband was aboard when the scan ran"
    // (customs UI, mid-scan dump window); `detected` is whether the scanner actually read it.
    // Contracts bust and confiscation clauses breach on `detected`, never on the bare scan —
    // an evaded sweep keeps the run alive. Packets from outside runScan carry no `detected` key
    // and read as detected, so a hand-emitted bust keeps its old meaning. Scan odds are pure
    // reads and the roll is the only rng draw here, so draw order is unchanged.
    let factionId;
    let detected = false;
    if (hasContraband) {
      const security = p.security != null ? p.security : this.currentSecurity();
      const cloak = (p.scannerCloak != null ? p.scannerCloak : this.scannerCloak(state));
      factionId = p.factionId || (p.patrolId && this.factionOfEntity(p.patrolId)) || this.scanningFaction(state);
      const hotMap = state.player.customsHotUntil || null;
      const hot = hotUntilActive(hotMap, state.simTime, factionId);
      const pScan = this.auditorScanChance({
        security, cloak, hot, stationId: p.stationId || null,
      });
      const roll = this._rng();
      detected = !(roll > pScan);
      scannedPayload.detected = detected;
    }
    // This is a scan fact, emitted during synchronous resolution; the pre-scan patrol/law owners
    // provide the only actionable choice windows.
    this.bus.emit('player:scannedByPatrol', scannedPayload);
    if (!hasContraband) return { found: false };
    if (!detected) {
      if (factionId) this._markFactionGatesHot(factionId);
      return { found: false, evaded: true }; // evaded; this faction's gates remember the run
    }
    // CAUGHT — compute fine, confiscate, rep hit
    let fine = 0;
    const confiscated = [];
    let units = 0;
    for (const stack of illicit) {
      const mult = FINE_MULT[stack.def.legality] != null ? FINE_MULT[stack.def.legality] : (stack.def.fineMult || 1);
      fine += stack.def.basePrice * stack.qty * mult;
      confiscated.push({ commodityId: stack.commodityId, qty: stack.qty });
      units += stack.qty;
    }
    fine = round(fine);
    // confiscate the goods
    const cargoSys = this.registryGet && this.registryGet('cargo');
    for (const stack of illicit) {
      this.removeFromCargo(cargoSys, state, stack.commodityId, stack.holdQty);
      removeSalvageBayCargo(state, stack.commodityId, stack.bayQty);
      if (stack.cacheQty > 0) takeExposedDeadDrop(state, stack.commodityId, stack.cacheQty, deadDropCoverage);
    }
    // charge fine; unpaid remainder -> debt + bounty
    const credits = normalizeCredits(state.player.credits);
    if (credits >= fine) {
      this.chargeCredits(fine, 'fine:contraband');
    } else {
      const unpaid = fine - credits;
      if (credits > 0) this.chargeCredits(credits, 'fine:contraband');
      state.player.debt = (state.player.debt || 0) + unpaid;
      state.player.bounty = (state.player.bounty || 0) + round(unpaid * 0.5);
      // Fresh debt restarts the stale clock: the new balance ages through the same grace window
      // before day:tick escalation adds more bounty on top.
      state.player.debtSinceDay = Number.isInteger(state.days) ? state.days : 0;
      delete state.player.debtStaleDay;
    }
    // Spec caught_contraband is -40 × (1 + 0.5 × prior strikes). Emit that once through
    // faction:repDelta; factions owns applyRep and increments the strike counter from the
    // scanned incident without applying a second delta.
    const rec = factionId && state.factions ? state.factions[factionId] : null;
    const priorStrikes = rec ? (rec.knownContrabandStrikes | 0) : 0;
    const repHit = -round(40 * (1 + 0.5 * priorStrikes));
    if (factionId) this.bus.emit('faction:repDelta', { factionId, delta: repHit, reason: 'contraband' });
    const contrabandPayload = {
      stationId: p.stationId || null, patrolId: p.patrolId || null,
      found: true, fine, confiscated, factionId: factionId || null, units,
      bribeCost: round(fine * BRIBE_FRAC),
    };
    if (lawfulInspectionCaseId) contrabandPayload.lawfulInspectionCaseId = lawfulInspectionCaseId;
    if (p.source) contrabandPayload.source = p.source;
    this.bus.emit('contraband:scanned', contrabandPayload);
    return { found: true, fine, confiscated, factionId, repHit };
  },

  /** Bribe instead of a full fine. The active patrol offer owns timing; economy owns the debit. */
  payBribe(p) {
    const state = this.state;
    const player = state && state.player;
    const fine = Math.max(0, Math.round(Number(p && p.fine) || 0));
    const cost = round(fine * BRIBE_FRAC);
    if (!(cost > 0)) {
      this.bus.emit('toast', { text: 'No fine on the table — bribe declined.', kind: 'info', ttl: 3 });
      return { ok: false, reason: 'no_fine' };
    }
    if (!player || normalizeCredits(player.credits) < cost) { this.bus.emit('toast', { text: 'Not enough credits for the bribe', kind: 'error', ttl: 2 }); return { ok: false, reason: 'credits' }; }
    // Use the exact-payment owner receipt. A credits:changed listener may legitimately award
    // money before this call returns, so net wallet difference is not proof of debit acceptance.
    const payment = {
      amount: cost, reason: 'bribe:contraband', requireFull: true,
      expectedCredits: normalizeCredits(player.credits), commit: () => true, result: false,
    };
    this._onChargeCreditsRequest(payment);
    if (payment.result !== true) {
      this.bus.emit('toast', { text: 'The bribe debit did not settle — offer remains open.', kind: 'error', ttl: 3 });
      return { ok: false, reason: 'charge_failed', cost };
    }
    return { ok: true, cost, charged: cost };
  },

  factionOfEntity(id) {
    const e = this.state.entities && this.state.entities.get(id);
    return e ? e.factionId : null;
  },

  /** The faction that owns customs in the current sector (defaults to SCN — the lawful navy). */
  scanningFaction(state) {
    const sid = state.world && state.world.currentSectorId;
    const sec = sid && SECTORS.find((s) => s.id === sid);
    return (sec && sec.factionId) || 'faction_scn';
  },

  // -------------------------------------------------------------------------------------------
  // ECONOMIC EVENTS
  // -------------------------------------------------------------------------------------------
  /**
   * Inject a typed, world-caused economic event onto (stationId, commodityId|'*').
   * Scheduled events come from the world seed; this path is for causes the sim
   * owns — missions forcing a market beat, a destroyed base, a blockade landing.
   * The row is an authored window: the closed form reads its level/spread
   * multipliers while it is live and its aftermath regime after it ends, and its
   * start stamps the physical shelf dent (idempotent via econ.eventsApplied).
   */
  injectEvent(p) {
    const state = this.state;
    const type = normalizeEconomyEventType(p && p.type) || 'shortage';
    const stationId = p.stationId;
    if (!stationId) return null;
    this.ensureMarket(stationId);
    const market = state.economy.markets[stationId];
    if (!market) return null;
    const commodityId = p.commodityId || '*';
    const now = Number(state.simTime) || 0;
    const duration = Math.max(1, Number(p.duration) || 120);
    const id = 'evt_' + (this._nextEventId++);
    const profile = EVENT_PROFILES[type] || EVENT_PROFILES.shortage;
    const ev = {
      id, type, cause: typeof p.cause === 'string' ? p.cause : type,
      stationId,
      sectorId: (stationInfo(state, stationId) || {}).sectorId || null,
      goods: commodityId === '*' ? null : [commodityId],
      tStart: now, tEnd: now + duration,
      levelMult: (profile.level[0] + profile.level[1]) / 2,
      spreadMult: (profile.spread[0] + profile.spread[1]) / 2,
      regime: profile.regime,
      skipStartDent: p.skipStartDent === true,
      // Legacy reader fields (news/missions read commodityId + startT + duration).
      commodityId, startT: now, duration,
    };
    state.economy.econEvents.push(ev);
    const applied = state.economy.eventsApplied || (state.economy.eventsApplied = {});
    this._applyEventStartDent(state, ev, applied);
    if (p.relieves) this._relieveEventDent(state, p.relieves, stationId, commodityId);
    this.bus.emit('economy:eventStarted', { eventId: id, type, stationId, commodityId, duration });
    return ev;
  },

  /**
   * A relief shipment physically replaces what an event stripped: cancel the named
   * event's still-live shelf residual on this listing. Ordinary trade/industry
   * dents stay — real hands bought and burned those units. Resolves dynamic rows
   * from econEvents and scheduled rows by re-drawing sched:<sector>:<epoch> —
   * deterministic, and idempotent per (event, listing) via eventsApplied.
   */
  _relieveEventDent(state, eventId, stationId, commodityId) {
    if (!eventId || !stationId) return;
    const applied = state.economy.eventsApplied || (state.economy.eventsApplied = {});
    const key = `relief:${eventId}:${commodityId || '*'}`;
    if (applied[key]) return;
    let ev = (state.economy.econEvents || []).find((e) => e && e.id === eventId) || null;
    if (!ev && String(eventId).startsWith('sched:')) {
      const [, sectorId, epochRaw] = String(eventId).split(':');
      const sector = SECTORS.find((s) => s && s.id === sectorId);
      const stationIds = sector && Array.isArray(sector.stations)
        ? sector.stations.map((st) => st && st.id).filter(Boolean) : [];
      if (stationIds.length) {
        ev = scheduledEventForEpoch(
          state.meta && state.meta.seed, sectorId, Number(epochRaw),
          stationIds, MARKET_GOOD_POOL, sectorEventContext(state, sectorId));
      }
    }
    const frac = ev && EVENT_DENT_FRAC[ev.type];
    // A dent-less (price-only) event never stripped the shelf — nothing to relieve.
    if (!frac || ev.skipStartDent === true) return;
    const market = state.economy.markets[stationId];
    const goods = commodityId && commodityId !== '*'
      ? [commodityId]
      : (Array.isArray(ev.goods) && ev.goods.length ? ev.goods : Object.keys(market || {}));
    const now = Number(state.simTime) || 0;
    for (const cid of goods) {
      const entry = market && market[cid];
      if (!entry) continue;
      const eq = Math.max(1, Number(entry.equilibrium) || Number(entry.baseEq) || 1);
      const halfS = dentHalfLifeS(cid);
      const residual = halfS > 0
        ? frac * eq * Math.pow(2, -Math.max(0, now - ev.tStart) / halfS)
        : frac * eq;
      if (Math.abs(residual) < 0.01) continue;
      appendDent(entry, cid, now, -residual);
      const def = commodityDef(state, cid);
      if (def) this._stampEntryQuote(entry, def, stationId, cid);
    }
    applied[key] = 1;
  },

  /**
   * Age active events: ends announce on the same sweep edge that used to expire
   * them; dead rows linger ~2 h so their aftermath regime stays readable, then
   * the pruner drops them. Kept as the lab/test caller's name for that step.
   */
  ageEvents(state) {
    this._processEventEdges(state);
    this._pruneEconomyEvents(state);
  },

  onBaseDestroyed(p) {
    if (p.type !== 'pirate_base' && p.stationType !== 'blackmarket') return;
    const events = this.state.economy.econEvents;
    const now = Number(this.state.simTime) || 0;
    // End piracy windows tied to this berth, then post the contraband shortage.
    for (const ev of events.slice()) {
      if (ev.type === 'piracy' && ev.stationId === p.stationId && ev.tEnd > now) {
        ev.tEnd = now;
        ev.duration = 0;
      }
    }
    if (p.stationId) this.injectEvent({ type: 'shortage', stationId: p.stationId, commodityId: 'cmdty_narcotics', duration: 240 });
  },

  // -------------------------------------------------------------------------------------------
  // helpers / glue
  // -------------------------------------------------------------------------------------------
  dockedStationId() {
    const state = this.state;
    if (state.ui && state.ui.dockedStationId) return state.ui.dockedStationId;
    if (this._lastDockedStation) return this._lastDockedStation;
    return null;
  },

  /** Resolve the berth owned by the current service session, never a remembered undocked id. */
  _stationServiceStationId() {
    const state = this.state;
    const ui = state && state.ui;
    if (ui && typeof ui.dockedStationId === 'string' && ui.dockedStationId && ui.docked !== false) {
      return ui.dockedStationId;
    }
    if (this._stationServiceBerth && this._stationServicesDocked()) return this._stationServiceBerth;
    const player = state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId) : null;
    return player && player.flags && player.flags.docked ? this._lastDockedStation || null : null;
  },

  /** Fail closed unless the player is at a live berth (ships.js shipworksStationAccess pattern). */
  _stationServicesDocked() {
    const ui = this.state && this.state.ui;
    if (ui && typeof ui.dockedStationId === 'string' && ui.dockedStationId && ui.docked !== false) {
      // Production GameState defaults docked to false. Career/sandbox and living-hull
      // harnesses often stamp a berth id without uiRoot flipping the bool.
      return true;
    }
    // Career/sandbox emit dock:docked without uiRoot; honor that live latch, not a
    // remembered station id left over after undock.
    if (this._stationServiceBerth) return true;
    const player = this.state.entities && typeof this.state.entities.get === 'function'
      ? this.state.entities.get(this.state.playerId)
      : null;
    if (player && player.flags && player.flags.docked) return true;
    return false;
  },

  /** registry lookup (set lazily; some builds expose ctx.registry). */
  registryGet(name) {
    if (this._registry && this._registry.get) return this._registry.get(name);
    return null;
  },

  /** The station yard, when a build registers it — owns timed service delivery (queue + pump). */
  _serviceYard() {
    const sys = this.registryGet('stationServices');
    return sys && typeof sys.enqueuePlayerJob === 'function' ? sys : null;
  },

  /** Read-only production acceptance telemetry; no inferred activity or paid faucets. */
  getPulse() { return economyPulseReport(this.state.economy, this.state.simTime); },

  /** public getters for UI / route-planner. */
  getMarket(stationId) {
    return this.state.economy.markets[stationId] || this.ensureMarket(stationId);
  },
  priceOf(stationId, commodityId, side, opts = null) {
    // A one-unit price has the same rounding, standing, conditions and access rules
    // as the counter. Cached market mids remain non-personal world intelligence.
    const quoted = this.quote(stationId, commodityId, side, 1, opts);
    return quoted && quoted.ok && quoted.qty === 1 ? quoted.total : null;
  },

  // -------------------------------------------------------------------------------------------
  // new game / save-load
  // -------------------------------------------------------------------------------------------
  resetRng() {
    const state = this.state;
    const seed = (state.meta && state.meta.seed) || 1;
    state.economy.rngSeed = hash32(seed, 'economy');
    this._installRngFunction();
  },

  _installRngFunction() {
    const fn = () => this._rng();
    Object.defineProperty(fn, 'seed', { get: () => (this.state.economy && this.state.economy.rngSeed) || 0 });
    this.state.economy.rng = fn;
    this.rng = fn;
  },

  _rng() {
    if (!this.state.economy) this.state.economy = {};
    return drawSeeded(this.state.economy, 'rngSeed', hash32(this.state.meta && this.state.meta.seed, 'economy'));
  },

  newGame() {
    const state = this.state;
    state.economy.markets = {};
    state.economy.resourceWork = {};
    state.economy.pulse = createEconomyPulse(state.simTime);
    state.economy.balanceVersion = BALANCE.version;
    delete state.economy.cycles;
    state.economy.econEvents = [];
    delete state.economy.eventsApplied;
    state.economy.econClock = { accumulator: 0, lastTickT: 0, ticksElapsed: 0 };
    state.economy.marketIntel = {};
    delete state.economy.appliedSalvageIntakeReceipts;
    delete state.economy.blockedSalvageIntakeIds;
    delete state.economy.appliedSalvageIntakeIds;
    state.player.marketMemory = {};
    state.player.tradeLedger = [];
    state.player.tradeLots = {};
    state.player.tradeMargins = {};
    state.player.tradeReceiptSeq = 0;
    state.player.sessionSinks = [];
    state.player.sessionSinkSeq = 0;
    delete state.economy.committedIntents;
    delete state.economy.cargoKillChains;
    delete state.economy.stationOutages;
    delete state.economy.stationConditions;
    delete state.economy.convoyShares;
    delete state.economy.forwardSlips;
    delete state.economy.coldChain;
    delete state.economy.auditorPenn;
    delete state.economy.podIntakeReceipts;
    ensureMarketPlayState(state);
    this._blockadeAnnounced = null;
    delete state.economy.dockSlamLatch;
    this.resetRng();
    this._nextEventId = 1;
    this._offlineSummaryRefresh = null;
    // Session berth latches are run-scoped: a quit-while-docked New Game must not let
    // dockedStationId()/_stationServicesDocked() resolve the previous run's berth — trade and
    // service gates would then fail open against a station the player is not at.
    this._lastDockedStation = null;
    this._stationServiceBerth = null;
    // warm the home sector's markets so prices exist before first dock
    const home = (state.world && state.world.currentSectorId) || 'sector_helios_prime';
    const sec = SECTORS.find((s) => s.id === home);
    if (sec) for (const st of sec.stations || []) this.ensureMarket(st.id, st.type, st.size);
  },



  /** Serialize the persistent market anchors: rest levels, dents, demand, event windows. */
  serialize() {
    // A save must not advance the sim or emit economy events. Prices are derived —
    // only the anchors a dent or demand refresh physically wrote travel.
    const econ = this.state.economy;
    const salvageIntakeState = ensureSalvageIntakeState(econ);
    const markets = {};
    for (const sid in econ.markets) {
      const m = econ.markets[sid]; const out = [];
      for (const cid in m) {
        out.push(serializeMarketRow(cid, m[cid]));
      }
      markets[sid] = out;
    }
    const data = {
      balanceVersion: BALANCE.version,
      marketRows: 2,
      resourceWork: serializeResourceWork(econ.resourceWork),
      pulse: cloneSaveTree(econ.pulse || createEconomyPulse(this.state.simTime)),
      markets,
      econEvents: cloneSaveTree(econ.econEvents || []),
      econClock: { ...econ.econClock },
      marketIntel: cloneSaveTree(econ.marketIntel || {}),
      rngSeed: econ.rngSeed,
      nextEventId: this._nextEventId,
      // Which event start-dents already landed — without this a reload would stamp
      // the same physical signature a second time on top of the saved dent list.
      eventsApplied: econ.eventsApplied && typeof econ.eventsApplied === 'object'
        ? { ...econ.eventsApplied } : {},
    };
    const committedIntents = econ.committedIntents && typeof econ.committedIntents === 'object'
      && !Array.isArray(econ.committedIntents)
      ? econ.committedIntents
      : null;
    if (committedIntents && Object.keys(committedIntents).length) {
      data.committedIntents = cloneSaveTree(committedIntents);
    }
    if (salvageIntakeState.receipts.length) {
      data.appliedSalvageIntakeReceipts = salvageIntakeState.receipts.map((receipt) => ({
        ...receipt,
        lines: receipt.lines.map((line) => ({ ...line })),
        ...(receipt.acceptedLines ? { acceptedLines: receipt.acceptedLines.map(line => ({ ...line })) } : {}),
      }));
    }
    if (salvageIntakeState.blockedIds.length) {
      data.blockedSalvageIntakeIds = salvageIntakeState.blockedIds.slice();
    }
    const cargoKillChains = Array.isArray(econ.cargoKillChains)
      ? econ.cargoKillChains.map((row) => normalizeCargoKillChain(row)).filter(Boolean)
      : [];
    if (cargoKillChains.length) data.cargoKillChains = cargoKillChains;
    // §15.6 C6 — only live outages travel; an expired one is nothing to restore.
    // THE WORLD REMEMBERS — the slam outage keeps its C6 chunk shape (`stationOutages`); every
    // other live condition (strike, boom, grudge, tallies) rides `stationConditions`. Lazy keys.
    const split = splitStationConditionsForSave(this.state, this.state.simTime);
    if (split.outages) data.stationOutages = split.outages;
    if (split.conditions) data.stationConditions = split.conditions;
    // R480 market play: only live contracts, live cold chains, live auditor leads, and the chute
    // receipts a berth still remembers. An untouched run writes no key at all.
    const play = ensureMarketPlayState(this.state);
    const playData = {};
    if (play.convoyShares.open.length || play.convoyShares.settled.length) {
      playData.convoyShares = {
        seq: play.convoyShares.seq,
        open: cloneSaveTree(play.convoyShares.open),
        settled: cloneSaveTree(play.convoyShares.settled),
      };
    }
    if (play.forwardSlips.open.length || play.forwardSlips.settled.length) {
      playData.forwardSlips = {
        seq: play.forwardSlips.seq,
        open: cloneSaveTree(play.forwardSlips.open),
        settled: cloneSaveTree(play.forwardSlips.settled),
      };
    }
    if (Object.keys(play.coldChain).length) playData.coldChain = cloneSaveTree(play.coldChain);
    if (Object.keys(play.auditorPenn.byStation).length) {
      playData.auditorPenn = { byStation: cloneSaveTree(play.auditorPenn.byStation) };
    }
    if (play.podIntakeReceipts.length) playData.podIntakeReceipts = cloneSaveTree(play.podIntakeReceipts);
    if (Object.keys(playData).length) data.marketPlay = playData;
    return data;
  },

  deserialize(data) {
    for (const _ of this.deserializeChunked(data)) { /* sync lane: every batch inline */ }
  },

  // Generator twin so the async restore lane can paint between station sections — the markets
  // loop is the biggest single deserialize brick on a mature save (~30ms). Yields sit only at
  // section boundaries; RNG-consuming calls (cycle restore, price-history seed) keep the exact
  // same order as the sync lane, so the run stays bit-identical.
  *deserializeChunked(data) {
    if (!data) return;
    // Session berth latches are run-scoped — the same contract newGame() documents. A restore
    // is always an undocked session (the save layer clears ui.docked/ui.dockedStationId and the
    // entity dock flag), so a latch left over from the pre-load session would let
    // dockedStationId()/_stationServicesDocked() resolve a station the pilot is not at: trade
    // and service gates, ration pricing, and the per-tick docked intel feed would fail open
    // against the wrong berth.
    this._lastDockedStation = null;
    this._stationServiceBerth = null;
    const econ = this.state.economy;
    econ.resourceWork = restoreResourceWork(data.resourceWork, SECTORS.map((s) => s.id));
    const restoredChains = Array.isArray(data.cargoKillChains)
      ? data.cargoKillChains.map((row) => normalizeCargoKillChain(row)).filter(Boolean).slice(-CARGO_KILL_CHAIN_CAP)
      : [];
    if (restoredChains.length) econ.cargoKillChains = restoredChains;
    else delete econ.cargoKillChains;
    delete econ.stationOutages;
    delete econ.stationConditions;
    this._blockadeAnnounced = null;
    {
      const restored = splitStationConditionsForSave(
        { economy: { stationOutages: data.stationOutages, stationConditions: data.stationConditions } },
        this.state.simTime, { checkDebt: false },
      );
      const rows = {};
      for (const [id, o] of Object.entries(restored.outages || {})) {
        rows[id] = { outageRepairUntil: o.repairUntil, outageCause: o.cause, outageAtT: o.atT };
      }
      for (const [id, c] of Object.entries(restored.conditions || {})) rows[id] = { ...(rows[id] || {}), ...c };
      if (Object.keys(rows).length) econ.stationConditions = rows;
    }
    delete econ.dockSlamLatch;
    econ.pulse = restoreEconomyPulse(data.pulse, this.state.simTime);
    econ.balanceVersion = BALANCE.version;
    // Rebuilt histories and missing cycles must not depend on market activity in the session
    // that happened to precede this load. Their draws start from the saved stream, which is
    // restored again below so reconstruction does not consume the player's future RNG state.
    econ.rngSeed = (Number.isFinite(data.rngSeed) && (data.rngSeed >>> 0) !== 0)
      ? data.rngSeed >>> 0
      : hash32(this.state.meta && this.state.meta.seed, 'economy');
    // Market rows: v2 anchors (equilibrium/baseEq/role/dents/demand). Legacy object and
    // legacy array rows migrate — a saved `stock` deviation becomes one fresh dent so the
    // shelf position survives, then heals on the good's own half-life. Cached quotes and
    // sampled history were derived state: they are re-stamped, never restored verbatim.
    const isV2 = data.marketRows === 2;
    econ.markets = {};
    for (const sid in (data.markets || {})) {
      // A crafted sid must never reach `markets[sid] =` — the '__proto__' setter would
      // replace the market map's prototype instead of adding a station section.
      if (sid === '__proto__' || sid === 'constructor' || sid === 'prototype') continue;
      const m = data.markets[sid]; const out = {};
      const rows = Array.isArray(m)
        ? m.map((row) => deserializeMarketRow(null, row, isV2))
        : Object.entries(m || {}).map(([cid, entry]) => deserializeMarketRow(cid, entry, isV2));
      for (const e of rows) {
        const cid = e.cid;
        if (!cid || cid === '__proto__' || cid === 'constructor' || cid === 'prototype') continue;
        const def = commodityDef(this.state, cid);
        const info = stationInfo(this.state, sid);
        let baseEq = Number(e.baseEq);
        if (!(baseEq > 0) || data.balanceVersion !== BALANCE.version) {
          baseEq = (BALANCE.commodities[cid]?.baseEq || BASE_EQ_DEFAULT) * (SIZE_FACTOR[info?.size] || 1);
        }
        let eq = Number(e.equilibrium);
        if (!(eq >= 0) || data.balanceVersion !== BALANCE.version) {
          eq = economyEquilibriumForListing(info, cid, e.role || 'none', baseEq);
        }
        const hasStamps = isV2 && Number.isFinite(e.stockMirror)
          && e.lastMid > 0 && e.lastBuy > 0 && e.lastSell > 0;
        const entry = {
          equilibrium: eq, baseEq, role: e.role || 'none',
          dents: Array.isArray(e.dents) ? e.dents : [],
          stock: hasStamps ? e.stockMirror : eq,
          lastMid: hasStamps ? (e.lastMid || 0) : 0,
          lastBuy: hasStamps ? (e.lastBuy || 0) : 0,
          lastSell: hasStamps ? (e.lastSell || 0) : 0,
          demandMult: Number.isFinite(e.demandMult) && e.demandMult > 0 ? e.demandMult : 1,
          demandDrivers: [],
        };
        if (Number.isFinite(e.stock)) {
          const q = Math.max(0, e.stock) - eq;
          if (Math.abs(q) >= 0.25) entry.dents.push({ t: this.state.simTime || 0, q });
        }
        if (def) {
          this.refreshListingDemand(entry, def, sid, info);
          if (!hasStamps) this._stampEntryQuote(entry, def, sid, cid);
        }
        out[cid] = entry;
      }
      econ.markets[sid] = out;
      yield 'economy-market-section';
    }
    econ.econEvents = Array.isArray(data.econEvents)
      ? data.econEvents.map(normalizeRestoredEconomyEvent).filter(Boolean).slice(-ECON_EVENTS_CAP)
      : [];
    // Start-dent idempotence survives the save: only rows already applied are kept.
    econ.eventsApplied = {};
    if (data.eventsApplied && typeof data.eventsApplied === 'object' && !Array.isArray(data.eventsApplied)) {
      const live = new Set((econ.econEvents || []).map((ev) => ev && ev.id));
      for (const id of Object.keys(data.eventsApplied)) {
        if (live.has(id) || String(id).startsWith('sched:')) econ.eventsApplied[id] = 1;
      }
    }
    econ.econClock = {
      accumulator: 0, lastTickT: 0, ticksElapsed: 0,
      ...(data.econClock && typeof data.econClock === 'object' ? data.econClock : {}),
    };
    econ.marketIntel = data.marketIntel || {};
    restoreMarketPlayState(this.state, data.marketPlay);
    if (Array.isArray(data.appliedSalvageIntakeReceipts)) {
      econ.appliedSalvageIntakeReceipts = data.appliedSalvageIntakeReceipts;
    } else delete econ.appliedSalvageIntakeReceipts;
    if (Array.isArray(data.blockedSalvageIntakeIds)) {
      econ.blockedSalvageIntakeIds = data.blockedSalvageIntakeIds;
    } else delete econ.blockedSalvageIntakeIds;
    if (Array.isArray(data.appliedSalvageIntakeIds)) {
      econ.appliedSalvageIntakeIds = data.appliedSalvageIntakeIds;
    } else delete econ.appliedSalvageIntakeIds;
    ensureSalvageIntakeState(econ);
    econ.rngSeed = (Number.isFinite(data.rngSeed) && (data.rngSeed >>> 0) !== 0)
      ? data.rngSeed >>> 0
      : hash32(this.state.meta && this.state.meta.seed, 'economy');
    this._nextEventId = data.nextEventId || 1;
    if (data.committedIntents && typeof data.committedIntents === 'object'
      && !Array.isArray(data.committedIntents) && Object.keys(data.committedIntents).length) {
      econ.committedIntents = cloneSaveTree(data.committedIntents);
      // Dump Chute intakes used to be journaled here, one full receipt per pod, forever. The
      // bounded pod-intake receipt ring now owns duplicate rejection; shed the old rows on load.
      for (const key of Object.keys(econ.committedIntents)) {
        if (key.startsWith('pod-intake:')) delete econ.committedIntents[key];
      }
      // Apply the live journal's retention too: a save written before the bound (or a crafted
      // one) can carry unlimited intents; keep only the newest rows for retry correlation.
      boundCommittedIntents(econ.committedIntents);
      if (!Object.keys(econ.committedIntents).length) delete econ.committedIntents;
    } else {
      delete econ.committedIntents;
    }
    this._installRngFunction();
  },
};

function cloneSaveTree(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneSaveTree);
  const out = {};
  for (const key of Object.keys(value)) {
    // A crafted '__proto__' own key would hit the prototype setter on `out` rather than
    // becoming data (same guard family as the market-row restore above).
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    out[key] = cloneSaveTree(value[key]);
  }
  return out;
}

// ---- exported public API (UI & other systems call without the bus) --------------------------
// Lane read view (claims/drill pattern): the whole-sim worker owns the economy
// system; main-side callers resolve a prototype view over the mirrored state so
// synchronous reads (quote) run the real implementation against the facade.
// Mint paths cannot run facade-side — they draw worker rng and write
// authoritative markets — so the view stubs them into a signal: the registry
// wrapper ships economyMintListing and the real row arrives on a mirror apply.
export function economyReadView(state) {
  const view = Object.create(economy);
  view.state = state;
  view.bus = null;
  view.ctx = { state, bus: null };
  view.eagerMarketMint = false;
  view.__mintNeeded = null;
  view.ensureMarket = function (stationId) {
    view.__mintNeeded = view.__mintNeeded || { kind: 'market', stationId };
    return null;
  };
  view.mintUnseededListing = function (stationId) {
    view.__mintNeeded = view.__mintNeeded || { kind: 'listing', stationId };
    return null;
  };
  return view;
}
export function quote(stationId, commodityId, side, qty) {
  return economy._instance ? economy._instance.quote(stationId, commodityId, side, qty) : { ok: false, reason: 'no_economy' };
}
export function quoteAutomationIntake(stationId, commodityId, qty) {
  return economy._instance
    ? economy._instance.quoteAutomationIntake(stationId, commodityId, qty)
    : { ok: false, reason: 'no_economy', fillable: 0, unitAvg: 0, total: 0, stock: 0, intakeTarget: 0 };
}
export function execute(stationId, commodityId, side, qty, opts) {
  return economy._instance ? economy._instance.execute(stationId, commodityId, side, qty, opts) : { ok: false, reason: 'no_economy' };
}
export function getCycle(stationId, commodityId) {
  return economy._instance ? economy._instance.getCycle(stationId, commodityId) : null;
}
// Compat surface for probe/reader callers that grew up on per-listing wave state:
// answers the same "what is this listing's formula doing" question from the closed form.
economy.getCycle = function (stationId, commodityId) {
  const state = this.state;
  if (!state || !state.economy) return null;
  const regime = marketRegimeStateFor(state, stationId, commodityId, state.simTime || 0);
  if (!regime) return null;
  return {
    regime: regime.kind, family: regime.kind,
    startedAt: (state.simTime || 0) - regime.elapsed,
    phase: null, imposed: regime.imposed, eventActive: regime.eventActive,
  };
};

// ---- LEGACY PQ-155 accounting projection; assumed faucets, NOT production acceptance evidence.
// New reproducible market/reservoir fixtures live in scripts/economy-fixture.mjs.
// ---- PQ-155.01 ten-hour economy-time curve (headless accounting, not Rapier) ---------------
export const ECONOMY_CURVE_SEED = 15510;
export const ECONOMY_CURVE_HOURS = 10;
export const ECONOMY_CURVE_STEP_HOURS = 0.125;
export const ECONOMY_CURVE_ARCHETYPE_IDS = Object.freeze(['hunter', 'trader', 'miner']);

function lightKillChipMidpoint() {
  const chips = KILL_REWARD_RECIPES.light && KILL_REWARD_RECIPES.light.creditChips;
  if (!chips) return 0;
  const count = Number(chips.count) || 0;
  const mid = ((Number(chips.amountMin) || 0) + (Number(chips.amountMax) || 0)) / 2;
  return count * mid;
}

const LIGHT_KILL_CHIP_MID = lightKillChipMidpoint();
const HUNTER_SALVAGE_KILLS_PER_HOUR = 4;
const HUNTER_SALVAGE_CR_PER_HOUR = LIGHT_KILL_CHIP_MID * HUNTER_SALVAGE_KILLS_PER_HOUR;
const HUNTER_COMBAT_CR_PER_HOUR = Math.max(0, VERB_LADDER_RATES.creditsPerHour - HUNTER_SALVAGE_CR_PER_HOUR);

/**
 * Named career floors, read from live balance constants. Banded across ten
 * hours — every rate cites a measured corridor, never an invented ramp:
 *   band 0 (h1–2 starter):    the healthy floor  — CAREER_BANDS.lo
 *   band 1 (h3–6 established): the lo→hi midpoint — rep-gated higher-risk
 *                             contracts and a bigger hold are open
 *   band 2 (h7–10 veteran):   the enforced healthy ceiling — CAREER_BANDS.hi
 * Hunter 62.5→400 cr/min (HUNTER_HEALTHY_CR_PER_MIN → HUNTER_HEALTHY_UPPER_CR_PER_MIN).
 * Trader 100→600 cr/min (COURIER_HEALTHY_CR_PER_MIN → CAREER_BANDS.hauler.hi).
 * Miner 70→375 cr/min (PROSPECTOR_HEALTHY_CR_PER_MIN → CAREER_BANDS.prospector.hi).
 * `creditsPerHour` keeps the band-0 floor so `rates` pins stay honest.
 */
export const ECONOMY_CURVE_BAND_EDGES = Object.freeze([2, 6, 10]);

export const ECONOMY_CURVE_FAUCETS = Object.freeze({
  // Band-0 floors re-characterized to the derived economy's Foothold net (6,000 cr/h
  // = 100 cr/min, ruling 2026-09-19): the retired cohort floors (62.5/112.5/70 cr/min)
  // measured the pre-derived economy. Every band scales by the same 1.6 factor so the
  // archetypes keep their relative identity and ramp shape; breakdowns stay the same
  // fractions of their band-0 floor.
  hunter: Object.freeze({
    id: 'hunter',
    name: 'Hunter',
    mix: 'combat/salvage',
    creditsPerHour: VERB_LADDER_RATES.creditsPerHour,
    creditsPerHourByBand: Object.freeze([100 * 60, 370 * 60, 640 * 60]),
    rpPerHour: VERB_LADDER_RATES.rpPerHour,
    breakdown: Object.freeze({
      combat: 100 * 60 * 0.7,
      salvage: 100 * 60 * 0.3,
    }),
  }),
  trader: Object.freeze({
    id: 'trader',
    name: 'Trader',
    mix: 'freight/contracts',
    creditsPerHour: 180 * 60,
    creditsPerHourByBand: Object.freeze([180 * 60, 570 * 60, 960 * 60]),
    rpPerHour: VERB_LADDER_RATES.rpPerHour,
    breakdown: Object.freeze({
      freight: 180 * 60 * 0.7,
      contracts: 180 * 60 * 0.3,
    }),
  }),
  miner: Object.freeze({
    id: 'miner',
    name: 'Miner',
    mix: 'asteroid/industry',
    creditsPerHour: 112 * 60,
    creditsPerHourByBand: Object.freeze([112 * 60, 356 * 60, 600 * 60]),
    rpPerHour: VERB_LADDER_RATES.rpPerHour,
    breakdown: Object.freeze({
      asteroid: 112 * 60 * 0.75,
      industry: 112 * 60 * 0.25,
    }),
  }),
});

/**
 * One-time early income events the live game pays inside the first half hour —
 * derived from the same data the sim models so the table cannot drift:
 *   B0 settlement (STORY_BEATS[0].reward credits + field-sample rp) at ~9 min,
 *   then the first signal investigation and first anomaly triangulation
 *   (RESEARCH_GRANTS). These are firsts, not a rate: they pay once and only
 *   pull the first upgrade forward.
 */
export const ECONOMY_CURVE_EARLY_EVENTS = Object.freeze([
  Object.freeze({
    atHour: 0.15,
    credits: Number(STORY_BEATS[0] && STORY_BEATS[0].reward && STORY_BEATS[0].reward.credits) || 0,
    rp: Number(STORY_BEATS[0] && STORY_BEATS[0].reward && STORY_BEATS[0].reward.rp) || 0,
    source: 'story:cold_start settlement + field sample',
  }),
  Object.freeze({
    atHour: 0.25,
    credits: 0,
    rp: RESEARCH_GRANTS['signal:investigated'].rp,
    source: 'signal:investigated first',
  }),
  Object.freeze({
    atHour: 0.35,
    credits: 0,
    rp: RESEARCH_GRANTS['anomaly:triangulated'].rp,
    source: 'anomaly:triangulated first',
  }),
]);

function bandIndexForHour(hourIndex) {
  if (hourIndex <= ECONOMY_CURVE_BAND_EDGES[0]) return 0;
  if (hourIndex <= ECONOMY_CURVE_BAND_EDGES[1]) return 1;
  return 2;
}

function faucetCreditsForHour(faucet, hourIndex) {
  const bands = faucet.creditsPerHourByBand;
  if (!bands || !bands.length) return faucet.creditsPerHour;
  const idx = Math.min(bandIndexForHour(hourIndex), bands.length - 1);
  return bands[idx];
}

/**
 * Characterization cadence × live unit prices. Cadence is starter-scale
 * (half a 100-unit tank, return-fire repair, light ammo). Not a late-game ramp.
 */
export const ECONOMY_CURVE_SINK_RECIPE = Object.freeze({
  fuelUnitsPerHour: Object.freeze({ hunter: 40, trader: 60, miner: 30 }),
  repairHpPerHour: Object.freeze({ hunter: 80, trader: 16, miner: 24 }),
  ammoUnitsPerHour: Object.freeze({ hunter: 8, trader: 0, miner: 0 }),
  insuranceHour: Object.freeze({ hunter: 1, trader: 0, miner: 0 }),
  fineChancePerHour: Object.freeze({ hunter: 0, trader: 0.2, miner: 0 }),
});

function restrictedFineCr() {
  const art = CMDTY_BY_ID.get('cmdty_art');
  const base = art && Number(art.basePrice) || 300;
  const mult = FINE_MULT.restricted != null ? FINE_MULT.restricted : 0.8;
  return round(base * mult);
}

function faucetFor(id) {
  return ECONOMY_CURVE_FAUCETS[id] || null;
}

function accrueSinks(archetypeId, hourIndex, stepH, rng) {
  const recipe = ECONOMY_CURVE_SINK_RECIPE;
  const fuel = round((recipe.fuelUnitsPerHour[archetypeId] || 0) * FUEL_UNIT_CR * stepH);
  const repair = round((recipe.repairHpPerHour[archetypeId] || 0) * REPAIR_HP_CR * stepH);
  const ammo = round((recipe.ammoUnitsPerHour[archetypeId] || 0) * AMMO_UNIT_CR * stepH);
  const insurance = 0;
  let fine = 0;
  const chance = recipe.fineChancePerHour[archetypeId] || 0;
  if (chance > 0 && rng() < chance * stepH) fine = restrictedFineCr();
  return { fuel, repair, ammo, insurance, fine, total: fuel + repair + ammo + insurance + fine };
}

function snapshotHour(wallet, hour, faucet, sinks, unlockedThisHour, earnedThisHour) {
  const verbIds = verbIdsOf(wallet.researched, 'strict');
  return {
    hour,
    netWorth: round(wallet.credits),
    credits: round(wallet.credits),
    rp: Number(wallet.rp.toFixed(4)),
    verbsUnlocked: verbIds.length,
    verbIds: verbIds.slice(),
    sinks: round(sinks),
    faucet: round(earnedThisHour),
    unlockedThisHour: unlockedThisHour.map((row) => row.name),
    unlockedIds: unlockedThisHour.map((row) => row.id),
    researched: wallet.researched.slice(),
    techSpend: round(wallet.techSpend),
    mix: faucet.mix,
  };
}

function simulateArchetype(archetypeId, seed) {
  const faucet = faucetFor(archetypeId);
  if (!faucet) throw new Error(`economy curve: unknown archetype ${archetypeId}`);
  const rng = mulberry32(hash32(seed, archetypeId, 'curve'));
  const wallet = {
    credits: VERB_LADDER_RATES.startCredits,
    rp: VERB_LADDER_RATES.startRp,
    researched: [],
    techSpend: 0,
  };
  const hours = [];
  const unlockEvents = [];
  let pendingUnlocks = [];
  let sinksThisHour = 0;
  let earnedThisHour = 0;
  let insurancePaid = false;
  const hoursN = ECONOMY_CURVE_HOURS;
  const stepH = ECONOMY_CURVE_STEP_HOURS;
  const steps = Math.round(hoursN / stepH);
  const earlyEvents = ECONOMY_CURVE_EARLY_EVENTS.map((ev) => ({ ...ev, applied: false }));

  for (let i = 1; i <= steps; i += 1) {
    const t = i * stepH;
    const hourIndex = Math.ceil(t - 1e-9);
    const stepFaucet = faucetCreditsForHour(faucet, hourIndex) * stepH;
    const stepRp = faucet.rpPerHour * stepH;
    const stepSinks = accrueSinks(archetypeId, hourIndex, stepH, rng);
    if (!insurancePaid && (ECONOMY_CURVE_SINK_RECIPE.insuranceHour[archetypeId] || 0) === hourIndex) {
      stepSinks.insurance = INSURANCE_DEFAULTS.deductibleCr;
      stepSinks.total += INSURANCE_DEFAULTS.deductibleCr;
      insurancePaid = true;
    }
    wallet.credits += stepFaucet;
    wallet.rp += stepRp;
    for (const ev of earlyEvents) {
      if (!ev.applied && t >= ev.atHour - 1e-9) {
        wallet.credits += ev.credits || 0;
        wallet.rp += ev.rp || 0;
        ev.applied = true;
      }
    }
    earnedThisHour += stepFaucet;
    const paid = Math.min(wallet.credits, stepSinks.total);
    wallet.credits -= paid;
    sinksThisHour += paid;

    const bought = purchaseAffordableTech(wallet, archetypeId);
    for (const row of bought) {
      wallet.techSpend += row.credits;
      pendingUnlocks.push(row);
      unlockEvents.push({ atHour: Number(t.toFixed(2)), ...row });
    }

    if (Math.abs(t - hourIndex) < 1e-9) {
      hours.push(snapshotHour(wallet, hourIndex, faucet, sinksThisHour, pendingUnlocks, earnedThisHour));
      pendingUnlocks = [];
      sinksThisHour = 0;
      earnedThisHour = 0;
    }
  }

  const firstUnlock = unlockEvents[0] || null;
  const hour1 = hours[0] || null;
  const hour10 = hours[hours.length - 1] || null;
  return {
    id: faucet.id,
    name: faucet.name,
    mix: faucet.mix,
    creditsPerHour: faucet.creditsPerHour,
    rpPerHour: faucet.rpPerHour,
    breakdown: faucet.breakdown,
    hours,
    unlockEvents,
    firstUnlock,
    hour1NetWorth: hour1 ? hour1.netWorth : 0,
    hour10NetWorth: hour10 ? hour10.netWorth : 0,
    hour1Verbs: hour1 ? hour1.verbsUnlocked : 0,
    hour10Verbs: hour10 ? hour10.verbsUnlocked : 0,
    researched: wallet.researched.slice(),
    techSpend: round(wallet.techSpend),
    liquid: round(wallet.credits),
    rp: Number(wallet.rp.toFixed(4)),
    creditsPerHourByBand: faucet.creditsPerHourByBand
      ? faucet.creditsPerHourByBand.slice() : null,
  };
}

export function simulateTenHourEconomyCurve(options = {}) {
  const seed = options.seed != null ? (Number(options.seed) || 0) : ECONOMY_CURVE_SEED;
  const ladderGate = assertCommittedLadder(TECH_VERB_LADDER);
  const tree = treePathCost();
  const archetypes = ECONOMY_CURVE_ARCHETYPE_IDS.map((id) => simulateArchetype(id, seed));
  return {
    seed,
    hours: ECONOMY_CURVE_HOURS,
    stepHours: ECONOMY_CURVE_STEP_HOURS,
    firstUpgrade: FIRST_UPGRADE,
    firstUpgradeMinutes: FIRST_UPGRADE_MINUTES,
    targetFirstUpgradeMinutes: TARGET_FIRST_UPGRADE_MINUTES,
    firstUpgradeWishMissed: FIRST_UPGRADE.meetsTarget === false,
    rates: VERB_LADDER_RATES,
    ladder: TECH_VERB_LADDER,
    ladderGate,
    tree,
    archetypes,
  };
}

function almostEqual(a, b, eps = 1e-6) {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) <= eps;
}

export function evaluateEconomyCurve(result) {
  const errors = [];
  if (!result) {
    return { ok: false, errors: ['missing curve result'] };
  }
  if (result.seed !== ECONOMY_CURVE_SEED) {
    errors.push(`seed ${result.seed} !== ${ECONOMY_CURVE_SEED}`);
  }
  if (!result.ladderGate || !result.ladderGate.ok) {
    for (const err of (result.ladderGate && result.ladderGate.errors) || ['ladder gate missing']) {
      errors.push(err);
    }
  }
  // The entry node is start-capital covered under the derived price scale (hour 0 is
  // honest); the honest saving window describes the first row that must be earned.
  const earnedRow = firstEarnedRow();
  const earnedMinutes = (earnedRow && earnedRow.hour * 60) || 0;
  if (!earnedRow) {
    errors.push('no ladder row requires earned income — the progression canyon is gone');
  } else if (earnedMinutes < FIRST_UPGRADE_MINUTES.min - 0.01 || earnedMinutes > FIRST_UPGRADE_MINUTES.max + 0.01) {
    errors.push(`first earned upgrade ${earnedRow.nodeId} at ${earnedMinutes} min is outside ${FIRST_UPGRADE_MINUTES.min}–${FIRST_UPGRADE_MINUTES.max}`);
  }
  if (result.rates.creditsPerHour !== 6000) {
    errors.push(`credit rate drifted to ${result.rates.creditsPerHour}; expected the Foothold target net (6,000 cr/h) — do not invent a late-game rate`);
  }
  if (!almostEqual(result.rates.rpPerHour, 12)) {
    errors.push(`RP/h drifted to ${result.rates.rpPerHour}; expected the Foothold assumed 12`);
  }
  if (result.rates.earlyRpPool !== VERB_LADDER_RATES.earlyRpPool) {
    errors.push(`early RP pool drifted to ${result.rates.earlyRpPool}; it must stay derived from STORY_BEATS[0] + RESEARCH_GRANTS`);
  }
  const ids = (result.archetypes || []).map((row) => row.id);
  if (ids.join(',') !== ECONOMY_CURVE_ARCHETYPE_IDS.join(',')) {
    errors.push(`archetypes ${ids.join(',')} !== ${ECONOMY_CURVE_ARCHETYPE_IDS.join(',')}`);
  }
  const treeCredits = result.tree && result.tree.credits || 0;
  // Derived price scale: the full tree costs ~646k (was the 4.5M class). The canyon
  // law is the ratio below; this floor only catches a tree that collapsed to pocket
  // change.
  if (!(treeCredits >= 400_000)) {
    errors.push(`tree cost ${treeCredits} collapsed below the derived-economy canyon scale`);
  }
  for (const arch of result.archetypes || []) {
    if (!arch.hours || arch.hours.length !== ECONOMY_CURVE_HOURS) {
      errors.push(`${arch.id} missing ten hour rows`);
      continue;
    }
    for (const row of arch.hours) {
      if (!Number.isFinite(row.netWorth)) errors.push(`${arch.id} h${row.hour} netWorth`);
      if (!Number.isFinite(row.verbsUnlocked)) errors.push(`${arch.id} h${row.hour} verbs`);
      if (!Number.isFinite(row.sinks)) errors.push(`${arch.id} h${row.hour} sinks`);
    }
    const faucets = arch.hours.map((row) => row.faucet);
    const firstFaucet = faucets[0];
    for (let i = 0; i < faucets.length; i += 1) {
      const bandRate = faucetCreditsForHour(arch, i + 1);
      if (!almostEqual(faucets[i], bandRate, 1)) {
        errors.push(`${arch.id} hour ${i + 1} faucet ${faucets[i]} !== committed band rate ${bandRate}`);
      }
    }
    if (arch.creditsPerHour !== firstFaucet && !almostEqual(arch.creditsPerHour, firstFaucet, 1)) {
      errors.push(`${arch.id} hour faucet ${firstFaucet} !== named ${arch.creditsPerHour}`);
    }
    // Outcome the canyon fix was for. Two different things are gated:
    //   * the TREE's entry node must land inside the committed 15–25 min
    //     window — asserted on the ladder by assertCommittedLadder, and the
    //     hunter's first goal IS that node, so the sim demonstrates it;
    //   * each career's chosen first goal (a bigger hull-license-class buy)
    //     must land inside the first session — a looser, honest bound.
    if (arch.id === 'hunter') {
      if (!arch.firstUnlock || arch.firstUnlock.atHour * 60 > FIRST_UPGRADE_MINUTES.max) {
        errors.push(`hunter first unlock ${arch.firstUnlock ? arch.firstUnlock.atHour : 'none'} misses the committed early window`);
      }
    }
    if (!arch.firstUnlock || arch.firstUnlock.atHour > 4) {
      errors.push(`${arch.id} first career unlock ${arch.firstUnlock ? arch.firstUnlock.atHour : 'none'} lands outside the first session`);
    }
    if ((arch.hour10Verbs || 0) < 3) {
      errors.push(`${arch.id} unlocked only ${arch.hour10Verbs} verbs by hour 10 — the faucet work did not move the cadence`);
    }
    // Canyon ratio, recalibrated for the derived economy: the old 5% bound was cut
    // for the 4.5M tree under the retired cohort floors. Under the Foothold bands the
    // best single-track career holds ~56% of the derived tree (646k) at hour 10 —
    // ten hours buys a majority slice, never the tree. The bound holds at 60%.
    if (arch.hour10NetWorth >= treeCredits * 0.6) {
      errors.push(`${arch.id} hour-10 net worth ${arch.hour10NetWorth} hides the canyon vs tree ${treeCredits}`);
    }
  }
  return { ok: errors.length === 0, errors, result };
}

export function runEconomyCurveCheck(options = {}) {
  const first = simulateTenHourEconomyCurve(options);
  const second = simulateTenHourEconomyCurve(options);
  const evaled = evaluateEconomyCurve(first);
  const errors = evaled.errors.slice();
  if (JSON.stringify(first.archetypes) !== JSON.stringify(second.archetypes)) {
    errors.push('curve is nondeterministic across two runs of seed 15510');
  }
  return { ok: errors.length === 0, errors, result: first };
}

function pad(value, width) {
  const text = String(value);
  return text.length >= width ? text : ' '.repeat(width - text.length) + text;
}

export function formatEconomyCurveReport(result) {
  const lines = [];
  const first = result.firstUpgrade;
  const minutes = first.hour * 60;
  lines.push('PQ-155.01 ten-hour economy curve');
  lines.push(`seed ${result.seed}  hours ${result.hours}  step ${result.stepHours} h  (headless accounting, not Rapier)`);
  lines.push('');
  lines.push('FIRST UPGRADE (committed ladder — honest window, derived from live data)');
  lines.push(`  ${first.nodeId}  ${first.hour} h  (${FIRST_UPGRADE_MINUTES.midpoint} min midpoint; band ${FIRST_UPGRADE_MINUTES.min}–${FIRST_UPGRADE_MINUTES.max})`);
  lines.push(`  target ${TARGET_FIRST_UPGRADE_MINUTES} min  ${first.meetsTarget ? 'HIT' : 'MISSED'}`);
  lines.push(`  bottleneck ${first.bottleneck}  short ${first.shortfallRp} RP / ${first.shortfallCredits} cr`);
  lines.push(`  rates ${result.rates.rpPerHour} RP/h sustained + ${result.rates.earlyRpPool} RP first-contact pool, ${result.rates.creditsPerHour} cr/h hunter floor`);
  lines.push('');
  lines.push(`TREE  ${result.tree.credits} cr + ${result.tree.rp} RP across ${result.tree.nodes} nodes`);
  lines.push('');
  lines.push('LADDER  hour → verb → cost → gate');
  for (const row of result.ladder) {
    lines.push(`  ${pad(row.hour.toFixed(2), 6)}  ${row.nodeId}  ${row.verb}  ${row.cost.credits} cr / ${row.cost.rp} RP  ${row.gate.bottleneck}`);
  }
  lines.push('');
  lines.push(`EARLY EVENTS  ${ECONOMY_CURVE_EARLY_EVENTS.map((ev) => `${ev.source} +${ev.rp} RP +${ev.credits} cr @${ev.atHour}h`).join('  |  ')}`);
  lines.push(`CREDIT BANDS  h1–${ECONOMY_CURVE_BAND_EDGES[0]} / h${ECONOMY_CURVE_BAND_EDGES[0] + 1}–${ECONOMY_CURVE_BAND_EDGES[1]} / h${ECONOMY_CURVE_BAND_EDGES[1] + 1}–${ECONOMY_CURVE_BAND_EDGES[2]} (lo floor → midpoint → hi ceiling)`);
  lines.push('');
  for (const arch of result.archetypes) {
    const bands = arch.creditsPerHourByBand || [arch.creditsPerHour];
    lines.push(`${arch.name.toUpperCase()}  ${arch.mix}  faucet ${bands.join(' → ')} cr/h + ${arch.rpPerHour} RP/h`);
    lines.push(`  ${pad('h', 2)} | ${pad('netWorth', 10)} | ${pad('verbs', 5)} | ${pad('sinks', 8)} | unlocked`);
    for (const row of arch.hours) {
      const unlocked = row.unlockedThisHour.length ? row.unlockedThisHour.join(', ') : '—';
      lines.push(`  ${pad(row.hour, 2)} | ${pad(row.netWorth, 10)} | ${pad(row.verbsUnlocked, 5)} | ${pad(row.sinks, 8)} | ${unlocked}`);
    }
    if (arch.firstUnlock) {
      lines.push(`  first sim unlock: ${arch.firstUnlock.name} at ${arch.firstUnlock.atHour} h`);
    } else {
      lines.push('  first sim unlock: none in ten hours');
    }
    lines.push(`  hour-1 net worth ${arch.hour1NetWorth}   hour-10 net worth ${arch.hour10NetWorth}   canyon ${arch.hour10NetWorth} / ${result.tree.credits}`);
    lines.push('');
  }
  return lines.join('\n');
}
