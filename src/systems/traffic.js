import { ownsWinnowRecoveryHull, reconcileWinnowRecovery, stepWinnowRecovery, winnowPickupReceipt, winnowSpillReceipt, winnowKilledReceipt, winnowDestroyedReceipt } from '../world/vestaWinnowRecovery.js';
import { cancelAnvilSpillRendezvous } from '../world/anvilSpillRecovery.js';
import { bindRestoredCharonSupply, materializeCharonSupply, ownsCharonSupplyHull, charonSupplyRoundBoundary, reconcileCharonSupply, stepCharonSupply, releaseCharonSupply, normalizeCharonSupply, charonSupplyPickupReceipt, charonSupplySpillReceipt, charonSupplyDestroyed } from '../world/charonSalvageSupply.js';
import {claimsTallyAssessor} from '../world/tallyThreeIdentity.js';
import { ceresWorkfleetHardwareRoleForRecord } from '../data/ceresWorkfleetHardware.js';
import { syncCeresWorkfleetHardware, captureCeresWorkfleetHardware, clearCeresWorkfleetControls, reconcileCeresWorkfleetPresentation } from './ceresWorkfleet.js';
import { registerMachineryReconciliation, unregisterMachineryReconciliation, invalidateMachineryPresentation } from '../core/machineryPresentation.js';
// Ambient NPC traffic (V2 §28b / cut-list #2 visible-haulers). Spawns benign freighter ships that
// ply station-to-station routes, making populated space feel ALIVE and — now that the economy
// wallet bug is fixed — actually moving market prices via aiTrader:requestTrade. This is the §31-Q16
// trick: a *sample* of visible ships consistent with the aggregate economy flow, not a full sim
// of every trader in the universe.
//
// Design:
//   - Spawns on sector:enter, scaled by sector.trafficPerMin (data exists, was unused) with a sane
//     default. Capped small (<=6) so perf is predictable — these are flavour + economy nudge, not a
//     swarm. Frontier sectors with trafficPerMin:0 get none (matches their "hollow" identity).
//   - Each freighter is team 2 (neutral; visualFactory renders team 2 gold, distinct from player
//     blue and hostile red). ai._isHostile returns true for cross-team by default, BUT these
//     freighters set ai.archetype='fleeing_trader' + ai.passive=true and the AI is gated to skip
//     them (see ai.update) so they never attack anyone — they just fly routes. They CAN be attacked
//     by the player (piracy!) which raises heat via the heat system.
//   - Route logic: pick a random station in-sector, fly toward it (slow, no boost), on proximity
//     "dock" (emit aiTrader:requestTrade with a small random commodity/qty), wait briefly, pick a
//     new station. Loop. Hard sector:exit cleans up freighters; continuous membership handoff
//     preserves still-alive traffic (world residency owns scoped despawn; M2-C1).
//   - Single-writer: traffic owns only its own spawned entities (tracked in state.traffic); it
//     never touches player state. Economy impact is via the event bus.

import { anvilTrafficMethods } from './anvilWork.js';
import { materializeEndingWorldPresence } from './endingWorldPresence.js';
import { installCaptainMemory, stampCaptainIdentity, normalizeCaptainRoster, applyCaptainRouteMemory } from './captainMemory.js';
import { installColdburnRey, normalizeColdburnRey } from './coldburnRey.js';
import { raceLeaseActive } from './racingSteer.js';
import { isRunSealed } from '../core/runSeal.js';
import { deferSectorEnterMaterialization, deferredEnterNow, deferredEnterTick } from '../core/sectorEnterDefer.js';
import { shouldRunOnTick, takeNearWorkSlice, ownerAiRecord, ownerTeamId, isActiveOwner, hashOwnerKey } from '../core/activityScheduler.js';
import { NEAR_EXIT_PAD_WU, SIM_TIER } from '../world/activityClassification.js';
import { tableSimAuthorityWuFromState } from '../render/tabletopPolicy.js';
import {
  ensureActivityClassified,
  entityNeedsAiThink,
  getActivityOwnerEntities,
  physicsReachWuFromState,
  requestActivityReclassify,
} from '../world/activityRuntime.js';
import {
  entityIndexLaneVersion,
  forEachFieldRock,
  forEachJobInteractable,
  forEachLivingWorldActor,
  indexedTypeScan,
  indexedWorldRecordEntity,
  registerEntityWorldRecordId,
} from '../world/livingWorldViews.js';
import { getAsteroidFieldRock, promoteAsteroidFieldRock } from '../world/asteroidField.js';
import { asteroidColliderRadius } from '../data/asteroidColliders.js';
import { getFarActor } from '../world/farActorTable.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from './ships.js';
import { CombatDoctrineId } from '../ai/combatDoctrine.js';
import { drawSeeded, hash32 } from '../core/rng.js';
import { syncEntityActivitySlotMembership, syncEntitySectorMembership } from '../core/coreSystem.js';
import {
  RECORD_KIND,
  stableRecordId,
} from '../world/worldRecords.js';
import {
  buildCargoManifest,
  buildArrivalIntent,
  buildLossIntent,
  stableManifestId,
  filterNewFreightIntents,
  mergeAppliedFreightIds,
  pressureShareRecipe,
  abstractBaselineVolume,
  FREIGHT_TRADING_ROLES,
  FREIGHT_MARKET_KEYS_FALLBACK,
  liveVolumeForSector,
} from '../economy/freightCausality.js';
import { STATION_CREW_ROLES } from '../economy/stationConditions.js';
import { FACTION_KITS } from '../data/factions.js';
import { OCCUPATIONAL_JOB_KIND_BY_ROLE } from '../data/occupationalTrafficCraft.js';
import {
  PRIORITY_COURIER_ITINERARY_KIND,
  PRIORITY_COURIER_JOB_SCHEMA,
  PRIORITY_COURIER_SERVICE,
  PRIORITY_COURIER_SERVICE_SCHEMA,
  PASSENGER_LINER_ITINERARY_KIND,
  PASSENGER_LINER_SERVICE,
  PASSENGER_LINER_SERVICE_SCHEMA,
  NAMED_LANE_CONTACTS,
  CINDER_RUN_COURIER_CONTACT_ID,
  isPriorityCourierItinerary,
  isPassengerLinerItinerary,
  passengerLinerFlyingTo,
  carryPassengerLinerLastOutcome,
  pickNamedLaneContact,
} from '../data/laneContacts.js';
import { ASTEROIDS } from '../data/mining.js';
import { massline2Flag } from '../data/featureFlags.js';
import { SECTORS } from '../data/sectors.js';
import {
  regionalTrafficDensityMultiplier,
  regionalTrafficRoleWeights,
} from './regionalEcology.js';
import {
  APERTURE_GLOBAL_POS,
  APERTURE_ID,
  CINDER_SLUICE_SITE_ID,
  CINDER_SLUICE_TRAFFIC_STAGING_POS,
  cinderSluicePhase,
  pointInsideCinderSluice,
  killMachinesForSector,
  killMachineFieldCenter,
  killMachineFieldDir,
  killMachinePhase,
} from '../data/environmentalMachinery.js';
import { ceresDisabledHaulerManifestTruth, HEAVE_TO_COMPLIANT_ROLES } from '../data/contactHail.js';
import {
  CERES_ACTIVITY_POCKETS,
  CERES_ACTIVITY_SECTOR_ID,
  CERES_ACTIVITY_SERVICE_SLOTS,
  TETHYS_ACTIVITY_SECTOR_ID,
  activityActorSlotById,
  activityPocketsForSector,
} from '../data/sectorActivityPockets.js';
import { SECTOR_CAUSAL_CHAIN_DEFS } from '../data/sectorCausalChains.js';
import { stepPallasWorkLoop, pallasWorkTarget } from './pallasWorkLoop.js';
import { sectorLocalToGlobalForSector, sectorMembershipAtGlobal } from '../data/sectorCoordinates.js';
import { SECTOR_ANCHORS } from '../data/sectorAnchors.js';
import { zoneAt } from '../data/sectorZones.js';
import { NPC_JOB_PHASE, NPC_JOB_SCHEMA } from './npcJobs.js';
import {
  claimRichSeamOpportunity,
  openRichSeamOpportunity,
  missReservedRichSeamOpportunity,
  reserveRichSeamOpportunity,
  richSeamOpportunityForEntity,
} from './fieldDepletion.js';
import { spawnJettisonedCargoPod } from './lootShards.js';
import { volatileClassOf } from '../data/commodityVolatileClasses.js';
import { customsWeirForSector, pointInsideCustomsWeir } from '../world/customsWeir.js';
import { isMasslineLatchedPickup } from './mining.js';
import { DRIVE_FAMILIES, resolvePropulsionProfile } from '../core/flight/propulsionCatalog.js';
import { admitRichSeamGlint, endRichSeamGlint } from '../render/vfx/worldCueRecipes.js';
import { trafficConvoyOps } from './trafficConvoyOps.js';
import { trafficJobOps } from './trafficJobOps.js';
import { trafficRoleOps } from './trafficRoleOps.js';
import { trafficTugOps } from './trafficTugOps.js';
import { trafficEscortOps } from './trafficEscortOps.js';
import { trafficRecoveryOps } from './trafficRecoveryOps.js';
import { trafficCausalChainOps } from './trafficCausalChainOps.js';

export const FREIGHTER_SHIP = 'ship_mule'; // a freighter hull from data/ships.js (cargo-capable, slow)
// Core pocket density (spec2/04 §4: core 6–9 concurrent). Cap keeps perf predictable.
const MAX_PER_SECTOR = 8;
const CORE_MIN_TRAFFIC = 6;    // high-security / high-tpm cores never feel empty
const DEFAULT_TRAFFIC = 3;     // sectors without explicit trafficPerMin get a small ambient count
const SPEED = 28;              // wu/s — slow, reads as a heavy freighter
export const DOCK_RANGE = 60;         // how close before "docking" (trading)
export const TRADE_INTERVAL_S = 8;    // min seconds between trades per freighter (staggered)
const POCKET_CLUSTER_R = 420;  // first freighters cluster near a pocket station for sensor density

// SEED-PC-01 — a hull the player is watching does not materialize or vanish inside this
// radius. Arrival wears an existing burn profile; departure wears the spine wake. Both
// ids are keys of NPC_JOB_SIGNATURE_PROFILES, so the job-signature renderer already
// draws them when the hull has a job (ceresCausalCue wins over phase).
export const TRAFFIC_WATCH_POCKET_WU = POCKET_CLUSTER_R;
export const TRAFFIC_ARRIVAL_CUE_EMPTY = 'clean_burn';
export const TRAFFIC_ARRIVAL_CUE_LOADED = 'heavy_burn';
export const TRAFFIC_DEPARTURE_CUE = 'spine_wake';

export function trafficHullLoaded(entity) {
  const data = entity && entity.data;
  if (!data) return false;
  if (data.loaded === true) return true;
  const cargo = data.cargo;
  if (typeof cargo === 'number') return cargo > 0;
  if (cargo && typeof cargo === 'object') {
    if (Number(cargo.amount) > 0 || Number(cargo.units) > 0) return true;
    if (Array.isArray(cargo.items) && cargo.items.length > 0) return true;
  }
  if (Number(data.cargoUnits) > 0 || Number(data.cargoAmount) > 0) return true;
  const manifest = data.manifest;
  if (manifest && (Number(manifest.amount) > 0 || Number(manifest.units) > 0)) return true;
  return false;
}

/**
 * Stamp the wake a watched traffic hull enters or leaves under, and slide a hull
 * that would pop inside the pocket out to the pocket edge. Seed 4242 breaks a
 * zero-length bearing so the proof is deterministic. An authored causal-chain
 * cue (ceresCausalEventId) is left alone. Authored cast slots keep their place.
 *
 * @returns {{ cue: string|null, placedAtEdge: boolean }}
 */
export const TRAFFIC_ARRIVAL_CUE_HOLD_S = 4;

export function stampTrafficWatchSignature(entity, player, {
  exiting = false,
  watching = true,
  seed = 1,
  simTime = 0,
  pocketWu = TRAFFIC_WATCH_POCKET_WU,
} = {}) {
  if (!entity) return { cue: null, placedAtEdge: false };
  const loaded = trafficHullLoaded(entity);
  const cue = exiting
    ? TRAFFIC_DEPARTURE_CUE
    : (loaded ? TRAFFIC_ARRIVAL_CUE_LOADED : TRAFFIC_ARRIVAL_CUE_EMPTY);
  const data = entity.data || (entity.data = {});
  const authoredPlace = !!(data.ceresActivityCast || data.authoredActivityCast || data.activityActorSlotId
    || data.endingWorldKey || data.endingApproachWatch);
  let placedAtEdge = false;
  if (watching && !authoredPlace && player && player.pos && entity.pos) {
    const px = Number(player.pos.x) || 0;
    const pz = Number(player.pos.z) || 0;
    let dx = (Number(entity.pos.x) || 0) - px;
    let dz = (Number(entity.pos.z) || 0) - pz;
    let dist = Math.hypot(dx, dz);
    if (dist < pocketWu) {
      if (dist < 1e-4) {
        const ang = ((Number(seed) || 0) % 6283) / 1000;
        dx = Math.cos(ang);
        dz = Math.sin(ang);
        dist = 1;
      }
      entity.pos.x = px + (dx / dist) * pocketWu;
      entity.pos.z = pz + (dz / dist) * pocketWu;
      placedAtEdge = true;
    }
  }
  // A watched pop (inside the pocket) or an exit always wears the wake. A hull
  // that was already outside keeps whatever job signature it already has.
  const wear = watching && !data.ceresCausalEventId && (exiting || placedAtEdge || !data.ceresCausalCue);
  if (wear) {
    data.ceresCausalCue = cue;
    data.trafficWatchCue = cue;
    data.trafficWatchUntil = exiting ? null : (Number(simTime) || 0) + TRAFFIC_ARRIVAL_CUE_HOLD_S;
  }
  return { cue: wear ? cue : null, placedAtEdge };
}

/** Drop an arrival wake once its hold elapses so the hull's job phase can show. */
export function releaseExpiredTrafficWatch(entity, simTime) {
  const data = entity && entity.data;
  if (!data || data.trafficWatchUntil == null) return false;
  if ((Number(simTime) || 0) < data.trafficWatchUntil) return false;
  if (data.ceresCausalCue === data.trafficWatchCue && !data.ceresCausalEventId) {
    delete data.ceresCausalCue;
  }
  delete data.trafficWatchCue;
  delete data.trafficWatchUntil;
  return true;
}

function priorityCourierServiceForSector(sectorId) {
  return sectorId === PRIORITY_COURIER_SERVICE.sectorId ? PRIORITY_COURIER_SERVICE : null;
}

export function passengerLinerServiceForSector(sectorId) {
  return sectorId === PASSENGER_LINER_SERVICE.sectorId ? PASSENGER_LINER_SERVICE : null;
}

export const PASSENGER_LINER_RECEIPT_CAP = 24;
export const PASSENGER_LINER_SUSPENSION_CAP = 4;
export const PASSENGER_LINER_INVALIDATED_CAP = 8;
const DISRUPTED_ROUTE_STATION_CAP = 16;
export const PASSENGER_LINER_INCIDENT_MAX_AGE_S = 180;
export const PASSENGER_LINER_ACTIVE_INCIDENT_STATUSES = new Set(['distress', 'responding', 'monitoring']);

export function passengerLinerLegIds(worldRecordId, legSeq) {
  const root = `${String(worldRecordId)}:${legSeq}`;
  return {
    passengerId: `passenger:${root}`,
    ticketId: `ticket:${root}`,
    receiptId: `passenger-liner-receipt:${root}`,
  };
}

// Live ID lists are short and usually unchanged. A bounded validation avoids rebuilding arrays
// and Sets on every _ensureState call, while still observing edits made to the same live array.
// Save/event boundaries keep the normalizers' default defensive copy.
function stableIdsAlreadyNormalized(value, cap) {
  if (!Array.isArray(value) || value.length > cap) return false;
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (typeof item !== 'string' || !item || value.indexOf(item) !== i) return false;
  }
  return true;
}

export function compactStableIds(value, cap, reuseLive = false) {
  if (!Array.isArray(value)) return [];
  if (reuseLive && stableIdsAlreadyNormalized(value, cap)) return value;
  const out = [];
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== 'string' || !item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out.slice(Math.max(0, out.length - cap));
}

/** Reserve one normal ambient slot for the authored Tethys service without expanding population. */
function reservePriorityCourierRole(roles, sectorId) {
  if (!priorityCourierServiceForSector(sectorId) || !Array.isArray(roles) || !roles.length) return -1;
  const existing = roles.indexOf('courier');
  if (existing >= 0) return existing;
  let replacement = roles.findIndex((role) => role !== 'patrol' && role !== 'express');
  if (replacement < 0) replacement = roles.findIndex((role) => role !== 'patrol');
  if (replacement < 0) return -1;
  roles[replacement] = 'courier';
  return replacement;
}
// How many neighbouring rock faces one refinery's barges will spread across before repeating. Small
// on purpose: the point is that a shift works ONE seam together, close enough that the barges share
// a frame with each other and with anything passing. See _pickWorkableAsteroidNear.
export const MINER_FIELD_SPREAD_CAP = 4;
// One visible 30-second work stop cuts a bounded parcel smaller than the economy's 15u live-arrival
// ceiling. This is enough for one or two barges to contend a recovering field without strip-mining
// it faster than the player can participate.
export const NPC_MINER_WORK_BATCH_U = 8;
export const CERES_RICH_SEAM_OBJECT_SLOT_ID = 'ceres_seam_ore_clast';

export function ceresSeamMinerOwnerIdentity(entity, record = null) {
  const data = entity && entity.data || {};
  const worldRecordId = data.worldRecordId || record && record.worldRecordId;
  const activityActorSlotId = data.activityActorSlotId || record && record.activityActorSlotId;
  const jobId = data.jobId || (worldRecordId ? `job:${worldRecordId}` : null);
  if (typeof worldRecordId !== 'string' || !worldRecordId
    || activityActorSlotId !== CERES_SEAM_MINER_SLOT_ID
    || typeof jobId !== 'string' || jobId !== `job:${worldRecordId}`) return null;
  return {
    stableId: worldRecordId,
    worldRecordId,
    activityActorSlotId,
    jobId,
  };
}
// General-population salvors (WF-01 / U03): demand-driven cleanup of live wrecks and loose
// civilian-manifest payloads. Bounded small so aftermath never becomes a salvage fleet parade.
// Ceres authored pockets are gated out separately — their cathedral salvor is cast choreography.
const MAX_GENERAL_SALVORS_PER_SECTOR = 2;
// One tug per sector. The done-when asks for "a slow tug", singular: a second one does not
// make the pocket read more industrial, it just doubles a heavy hull and its tow constraint.
const MAX_YARD_TUGS_PER_SECTOR = 1;
// Bulk, not commodity count, is what makes a body tug work: a tug is hired for what a thing weighs
// and how awkward it is, never for how many units of scrap are inside it. Below this radius the body
// is cutter work and reads as a pebble on the tow line at the shipping camera.
const TOWABLE_BODY_MIN_RADIUS_WU = 5;
// Anything at or above this mass is pinned scenery, not freight. Ceres alone stands nineteen
// `world_site_*` proxies at mass 1e9; a "tow" of one of those is a line drawn to an immovable
// object — the decorative tow the packet forbids — and would also misreport an authored site as
// loose salvage. Measured 2026-09-06 on seed 47.
export const PINNED_BODY_MASS = 1e6;
// The tug's own load. `pod_cargo_container` is the authored container the PQ-019 capsule already
// uses, so the lot arrives as a real manufactured body rather than a soft billboard, and
// `presentationAdmission` admits it by that exact asset id.
export const YARD_TUG_LOT = Object.freeze({
  assetId: 'pod_cargo_container',
  radius: 9,
  // The Hawser hull the tug flies is mass 68. The towing proof moved an 80-mass load behind a
  // 20-mass hull (4x) through the same `tether_standard` policy, so 190 sits inside a ratio
  // already shown to drag rather than snap. Heavier than the 180 heist capsule because this one
  // is meant to look big.
  mass: 190,
  hull: 220,
});
// Notice delay before a fresh wreck/payload draws a cutter (sim-seconds). Hash-pinned per target
// so two seeds with the same aftermath produce the same response time without a scheduler queue.
export const SALVOR_NOTICE_DELAY_MIN_S = 18;
export const SALVOR_NOTICE_DELAY_SPAN_S = 27; // inclusive span → 18..45 s
// Announced freight spills skip the 18-45 s stumble delay: the distress channel already named them.
export const SPILL_ANNOUNCE_NOTICE_S = 2;
export const SPILL_POD_CARRIER_RADIUS = 240;
export const SALVOR_WORK_LEDGER_CAP = 256;
export const CIVILIAN_MANIFEST_PAYLOAD_TYPE = 'civilian_manifest';
export const NPC_MINER_WORK_LEDGER_CAP = 512;
export const CERES_JOB_ACTION_LEDGER_CAP = 512;
export const CERES_JOB_ACTION_RECEIPT_SCHEMA = 'spaceface.trafficJobActionReceipt.v1';
export const CERES_JOB_ACTION_RECEIPT_EVENT = 'traffic:jobActionReceipt';
export const TRAFFIC_HEAVE_TO_DURATION_S = 5;
export const TRAFFIC_HEAVE_TO_COOLDOWN_S = 12;
export const TRAFFIC_LAW_LOSS_CAUSE = 'lawful_patrol_loss';
// Ambient civilians notice nearby gunfire. The listener only stamps a point; the role stepper
// decides whether that hull runs, holds, or keeps its tow. Radius and fade are in player units.
const CIVILIAN_VIOLENCE_RADIUS_WU = 300;
export const CIVILIAN_VIOLENCE_RADIUS_SQ = CIVILIAN_VIOLENCE_RADIUS_WU * CIVILIAN_VIOLENCE_RADIUS_WU;
export const CIVILIAN_ALARM_TTL_S = 5;
export const CIVILIAN_VIOLENCE_RING_CAP = 8;
export const CIVILIAN_ALARM_FLEE_ROLES = new Set(['hauler', 'courier', 'ore_carrier', 'shuttle', 'tug', 'miner', 'prospector', 'tourist', 'rescue']);
export const CIVILIAN_ALARM_HOLD_ROLES = new Set(['surveyor', 'tender', 'salvor']);
export const CIVILIAN_HAULER_DUMP_ROLES = new Set(['hauler', 'shuttle', 'tanker', 'arclight']);
// THE WORLD ANSWERS C5 — a player well drags a loaded hauler off its lane (`well:haulerDragged`).
// Its escorts close up on it and hold for a bounded window (the physical pile-up), the hauler
// stops to recover and re-plans, and the destination's lane takes a small bounded price-pressure
// impulse through sectorSim's existing `sectorsim:impulse` intent (trade volume dips for a day).
export const WELL_DRAG_REGROUP_S = 6;            // escorts boost to the hauler and hold this long
export const WELL_DRAG_HOLD_RADIUS_WU = 28;      // escorts stop thrusting inside this of the hauler
export const WELL_DRAG_RECOVER_S = 4;            // the hauler heaves-to this long, then re-plans
export const WELL_DRAG_ESCORT_CAP = 4;           // pile-up size bound
export const WELL_DRAG_PRESSURE_MIN = 0.03;      // lane price pressure for a thin manifest
export const WELL_DRAG_PRESSURE_MAX = 0.06;      // ...and for a full hold
export const WELL_DRAG_FULL_HOLD_QTY = 28;       // manifest size that earns the max (hauler capacity)
export const WELL_DRAG_DANGER = 0.01;
export const WELL_DRAG_SEEN_CAP = 256;
export const STATION_TO_SECTOR = new Map();
for (const sector of SECTORS) for (const station of (sector.stations || [])) STATION_TO_SECTOR.set(station.id, sector.id);
export const CLAIM_CONVOY_MAX_LIVE = 4;              // concurrent manifested claim convoy hulls
export const CLAIM_CONVOY_DEPART_CLEARANCE_WU = 160; // spawn offset from the claim pad along the route
export const CIVILIAN_DISTRESS_RADIUS_WU = 1800;
export const CIVILIAN_DISTRESS_COOLDOWN_S = 3;
// Rescue link-up: a cutter stands by a live caller only while its mayday is recent. Past this
// quiet bound the hull is presumed safe and the cutter stands down instead of escorting forever.
export const RESCUE_CALLER_STANDDOWN_S = 75;
export const AMBUSH_LOADED_HAULER_COMMODITY_ID = 'cmdty_ore_iron';
export const AMBUSH_LOADED_HAULER_QTY = 16;
export const HAULER_SPILL_VEL_FRACTION = 0.45;
export const HAULER_SPILL_POD_RADIUS = 6;
const CERES_LAW_RESPONSE_SLOT_IDS = new Set([
  'ceres_ambush_escort',
  'ceres_cathedral_patrol',
]);
const CERES_LAW_RESPONSE_WASP_FITTINGS = Object.freeze(
  fittingsFromDefaultModules('ship_wasp', ['wpn_pulse_laser_s']),
);
const ASTEROID_BY_ID = new Map(ASTEROIDS.map((def) => [def.id, def]));

export function isShipDisabled(entity, state = null) {
  if (!entity || entity.alive === false || entity.type !== 'ship') return false;
  const data = entity.data || {};
  if (data.disabled || data.derelict || data.engineDead || data.deadInWater || data.surrendered) return true;
  if (entity.flags && (entity.flags.disabled || entity.flags.derelict)) return true;
  if (data.hp != null && data.maxHp && data.hp <= data.maxHp * 0.25) return true;
  if (entity.hull != null && entity.hullMax && entity.hull <= entity.hullMax * 0.25) return true;
  const combat = (state && state.combat) || null;
  const runtime = combat && combat.entities && combat.entities[String(entity.id)];
  const drive = runtime && runtime.subsystems && runtime.subsystems.subsystem_drive;
  if (drive && (drive.destroyed === true || drive.effectiveDisabled === true)) return true;
  return false;
}


// Causal traffic roles (spec §12.1). Each role is a distinct, READABLE behavior — not a combat-AI
// skin. The hull + speed + archetype encode the role's identity; the update loop encodes its
// behavior. Spawn weights form the causal model (spec §12.2): the role mix depends on sector
// context — industrial sectors get more miners/haulers, hostile sectors get suspicious traffic,
// secure faction sectors get patrols/escorts. team 2 = neutral/civilian traffic (gold); actual red
// hostiles must come from combat/world/mission spawns, not passive scenery.
// ── Faction fleets ────────────────────────────────────────────────────────────────────────────
// TRAFFIC_ROLES below names one hull per role, so every raider in the game was the same Hornet and
// every hauler the same Mule regardless of who controlled the sector. Faction kits already author
// what a faction actually flies (`shipRoles`, each a weighted group of interchangeable hullIds),
// but nothing read them.
//
// The role's authored hull is the class anchor, not a fixed answer: a faction group that contains
// that hull is the group covering that job, and any hull in it is an equivalent substitution. The
// Understory's rot-frigate group is wasp/hornet/bastion, so an Understory raider flies one of three
// frames while remaining a raider. This deliberately does not invent a mapping from faction-specific
// role names ("spore-tender") onto traffic roles — hull class is the honest join.
//
// Determinism: a faction with no authored fleet, or whose fleet has no group containing the anchor
// hull, returns the anchor unchanged AND never draws from the RNG, so its traffic stream is
// byte-identical to before. Nine of the fourteen factions are in that state today.
const FLEET_BY_FACTION = new Map();
for (const kit of FACTION_KITS) {
  const groups = (Array.isArray(kit.shipRoles) ? kit.shipRoles : [])
    .filter((entry) => Array.isArray(entry.hullIds) && entry.hullIds.length > 0);
  if (groups.length) FLEET_BY_FACTION.set(kit.id, groups);
}

export function factionHullFor(anchorHull, factionId, rng) {
  const groups = FLEET_BY_FACTION.get(factionId);
  if (!groups) return anchorHull;
  const group = groups.find((entry) => entry.hullIds.includes(anchorHull));
  if (!group || group.hullIds.length < 2) return anchorHull;
  return group.hullIds[Math.floor(rng() * group.hullIds.length)] || anchorHull;
}

export const HELIOS_TALLY_REACH = 70;
export const HELIOS_TALLY_STILL = 4;
export const HELIOS_TALLY_COUNT_S = 6;
export const HELIOS_TALLY_LEDGER_CAP = 8;

export function heliosFreightDisposition(value) {
  return value === 'delivered' || value === 'lost' ? value : 'counted';
}

export function normalizeHeliosFreightTally(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const manifestId = typeof row.manifestId === 'string' && row.manifestId ? row.manifestId : null;
  const totalQty = Number(row.totalQty);
  if (!manifestId || !(totalQty > 0)) return null;
  const disposition = heliosFreightDisposition(row.disposition);
  const tally = {
    manifestId,
    carrierWorldRecordId: typeof row.carrierWorldRecordId === 'string' && row.carrierWorldRecordId
      ? row.carrierWorldRecordId : null,
    commodityId: typeof row.commodityId === 'string' && row.commodityId ? row.commodityId : null,
    totalQty,
    destinationId: typeof row.destinationId === 'string' && row.destinationId
      ? row.destinationId : 'station_helios',
    simTime: Number.isFinite(Number(row.simTime)) ? Number(row.simTime) : 0,
    sectorId: 'sector_helios_prime',
    disposition,
  };
  // A counted row has no later clock. Delivered and lost keep the sim time of that one change.
  if (disposition !== 'counted' && Number.isFinite(Number(row.dispositionSimTime))) {
    tally.dispositionSimTime = Number(row.dispositionSimTime);
  }
  return tally;
}

export function normalizeHeliosFreightTallyList(rows) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const tally = normalizeHeliosFreightTally(row);
    if (!tally || seen.has(tally.manifestId)) continue;
    seen.add(tally.manifestId);
    out.push(tally);
  }
  return out.length > HELIOS_TALLY_LEDGER_CAP ? out.slice(out.length - HELIOS_TALLY_LEDGER_CAP) : out;
}

/** Counted Helios freight, oldest first. Empty when nothing has been tallied this save. */
export function heliosFreightTallies(state) {
  return normalizeHeliosFreightTallyList(state && state.traffic && state.traffic.heliosFreightTallies);
}
export const HELIOS_BERTH_MAX_DRIFT = 20;
const TRAFFIC_ROLES = {
  hauler:   { ship: 'ship_mule',     team: 2, speed: 26, archetype: 'fleeing_trader', weight: 30,
              label: 'Cargo Hauler', docks: true, trades: true },
  courier:  { ship: 'ship_kestrel',  team: 2, speed: 52, archetype: 'fleeing_trader', weight: 18,
              label: 'Courier', docks: true, trades: true },
  miner:    { ship: 'ship_pelican',  team: 2, speed: 30, archetype: 'fleeing_trader', weight: 16,
              label: 'Mining Barge', docks: true, trades: true, seeks: 'asteroid' },
  patrol:   { ship: 'ship_wasp',     team: 2, speed: 44, archetype: 'passive', weight: 14,
              label: 'System Patrol', docks: false, orbits: true },
  escort:   { ship: 'ship_wasp',     team: 2, speed: 40, archetype: 'passive', weight: 8,
              label: 'Convoy Escort', docks: false, escorts: true },
  smuggler: { ship: 'ship_drifter',  team: 2, speed: 46, archetype: 'fleeing_trader', weight: 6,
              label: 'Smuggler', docks: true, trades: true },
  pirate:   { ship: 'ship_hornet',   team: 2, speed: 50, archetype: 'fleeing_trader', weight: 5,
              label: 'Raider', docks: false, flees: true },
  rescue:   { ship: 'ship_drifter',  team: 2, speed: 48, archetype: 'passive', weight: 3,
              label: 'Rescue Craft', docks: true, trades: false },
  // A heavy neutral liner on a real station route. `speed` is descriptive only; the live motion
  // path is the V3 NPC boost intent in update(), which keeps momentum honest and tether-shareable.
  express:  { ship: 'ship_mule',     team: 2, speed: 247, archetype: 'fleeing_trader', weight: 3,
              label: 'Express Liner', docks: true, trades: true, express: true },
  // ── The working trades (design/fiction/THE_WORKING_TRADES.md) ─────────────────────────────────
  // Hulls chosen from the dossiers, not from what was convenient: the Ranger's long-endurance
  // utility spine is why a surveyor flies one and why "surveyors who cannot afford a Ranger fake
  // the trade on a Hitch and die of range"; the Pelican is a barge frame, which is what a salvor
  // needs to drag cut plate home; the Drifter's speed is why a tender gets off the berth fast when
  // somebody is venting.
  surveyor: { ship: 'ship_ranger',   team: 2, speed: 34, archetype: 'passive', weight: 9,
              label: 'Survey Rig', docks: true, trades: false },
  salvor:   { ship: 'ship_pelican',  team: 2, speed: 40, archetype: 'fleeing_trader', weight: 7,
              label: 'Salvage Cutter', docks: true, trades: false },
  tender:   { ship: 'ship_drifter',  team: 2, speed: 66, archetype: 'passive', weight: 6,
              label: 'Repair Tender', docks: true, trades: false },
  // PQ-045: the ore barge is its own presentation role, NOT a hauler reskin — `hauler` already
  // owns the accepted helios_span whole-ship, so a barge keyed as `hauler` would replace that
  // asset in every sector while silently wearing the "Cargo Hauler" label. `ore_carrier` has its
  // own TRAFFIC_ROLES entry and its own whole-ship binding (wholeships/ore_barge.glb), so ship,
  // team, speed, label and hull all resolve to the barge. The Ironback def was the unused
  // mining_barge hull class this trade always implied (ROLE_MATRIX row "ore carrier"). It docks
  // at stations like any bulk hull. PQ-048.01 closes its formerly inert seam by reusing the miner
  // work kernel: the Ironback cuts one ore-only lot, carries it under this stable role identity,
  // and settles it through freight/economy ownership.
  ore_carrier: { ship: 'ship_ironback', team: 2, speed: 22, archetype: 'fleeing_trader', weight: 4,
              label: 'Ore Barge', docks: true, trades: true, seeks: 'asteroid' },
  // PQ-136.02 — packaged work-fleet hulls on existing job kinds. Weights add variety
  // inside the current ambient cap; they do not raise MAX_PER_SECTOR.
  //
  // PQ-193.08: tanker and customs are Helios fixtures (mix weight zeroed below), not
  // ambient rolls. They do not remap hauler/Span, Atlas, Arclight, or hostile customs.
  prospector: { ship: 'ship_drifter',  team: 2, speed: 32, archetype: 'fleeing_trader', weight: 5,
              label: 'Prospector', docks: true, trades: false, seeks: 'asteroid' },
  sweeper:    { ship: 'ship_pelican',  team: 2, speed: 28, archetype: 'fleeing_trader', weight: 4,
              label: 'Scrap Sweeper', docks: true, trades: false },
  shuttle:    { ship: 'ship_mule',     team: 2, speed: 38, archetype: 'fleeing_trader', weight: 4,
              label: 'Apron Shuttle', docks: true, trades: true },
  // The tug carries a finite freight lot through the existing hauler graph. Its lower planning
  // speed keeps the working hull visibly distinct; the Hawser def is the yard-tug hull the
  // role already renders (wholeships/yard_tug.glb), so its sim mass and radius now match the body.
  tug:        { ship: 'ship_hawser',   team: 2, speed: 20, archetype: 'passive', weight: 4,
              label: 'Yard Tug', docks: true, trades: true },
  // PQ-193.07: rare Helios heavy. Own role and body — never remaps hauler/Span or Atlas.
  // Ambient mix weight is zeroed below so the seeded hauler draw stays Span.
  arclight:   { ship: 'ship_mule',     team: 2, speed: 22, archetype: 'fleeing_trader', weight: 2,
              label: 'Helios Arclight', docks: true, trades: true },
  // PQ-193.08: rare Helios extras. Own roles and bodies. Ambient mix is zeroed so
  // seeded haulers stay Span and goldens stay byte-identical.
  tanker:     { ship: 'ship_mule',     team: 2, speed: 24, archetype: 'fleeing_trader', weight: 2,
              label: 'Volatiles Tanker', docks: true, trades: true },
  customs:    { ship: 'ship_wasp',     team: 2, speed: 40, archetype: 'passive', weight: 2,
              label: 'Inspection Cutter', docks: true, trades: false },
  tourist:    { ship: 'ship_drifter',  team: 2, speed: 24, archetype: 'passive', weight: 4,
              label: 'Sightseer', docks: true, trades: false, loiters: true },
};

export function lawPresenceRole(role) {
  return role === 'patrol' || role === 'escort';
}

export function occupationalJobKind(role) {
  return OCCUPATIONAL_JOB_KIND_BY_ROLE[role] || null;
}

// Exported for the PQ-045 identity contract test (distinct hull + label per occupational role);
// not a new write seam — runtime ownership of role resolution is unchanged.
export { TRAFFIC_ROLES, priorityCourierServiceForSector };

/** WORLD-20 — the memorial sightseer stands on the zone center, inside its radius. */
export const HELIOS_MEMORIAL_TOURIST = Object.freeze({
  sectorId: 'sector_helios_prime',
  zoneId: 'zone_helios_memorial',
  role: 'tourist',
  pos: Object.freeze({ x: 1680, z: -820 }),
});

// The memorial disc is smaller than the civilian-core disc around it, so zoneAt's
// tightest match is the array itself. Shots anywhere on that disc count, not only
// the 300-unit bubble used for ordinary lane panic.
export function pointInHeliosMemorial(sectorId, x, z) {
  if (sectorId !== HELIOS_MEMORIAL_TOURIST.sectorId) return false;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  const zone = zoneAt(sectorId, x, z);
  return !!(zone && zone.id === HELIOS_MEMORIAL_TOURIST.zoneId);
}



function trafficHeaveToComplies(role, entity) {
  if (!HEAVE_TO_COMPLIANT_ROLES.has(String(role || '').toLowerCase())) return false;
  const ai = entity && entity.data && entity.data.ai;
  return !(ai && ai.pirate === true);
}

export const CERES_TENDER_SLOT_ID = 'ceres_refinery_tender';
export const CERES_REFINERY_HAULER_SLOT_ID = 'ceres_refinery_hauler';
export const CERES_AMBUSH_HAULER_SLOT_ID = 'ceres_ambush_loaded_hauler';
export const CERES_SEAM_MINER_SLOT_ID = 'ceres_seam_miner';
export const CERES_SEAM_SURVEYOR_SLOT_ID = 'ceres_seam_surveyor';
export const CERES_CATHEDRAL_SALVOR_SLOT_ID = 'ceres_cathedral_salvor';
const CERES_CATHEDRAL_PATROL_SLOT_ID = 'ceres_cathedral_patrol';
const CERES_CINDER_HOOK_ID = 'ceres_cinder_sluice_service';
export const CERES_ACTIVITY_CAST = Object.freeze([
  ...CERES_ACTIVITY_POCKETS.flatMap((pocket) => pocket.actorSlots
    .filter((slot) => slot.id !== CERES_TENDER_SLOT_ID)
    .map((slot) => Object.freeze({ pocket, slot, service: false }))),
  ...CERES_ACTIVITY_SERVICE_SLOTS.map((slot) => Object.freeze({ pocket: null, slot, service: true })),
]);
export const CERES_ACTIVITY_CAST_BY_SLOT_ID = new Map(CERES_ACTIVITY_CAST.map((entry) => [entry.slot.id, entry]));
export const CERES_ACTIVITY_JOB_KINDS = new Set(['hauler', 'miner', 'surveyor', 'patrol', 'salvor']);
export const CERES_PRIMARY_ACTION_BY_JOB_KIND = Object.freeze({
  hauler: Object.freeze({ action: 'unload', phase: NPC_JOB_PHASE.UNLOAD, intentField: 'destination' }),
  miner: Object.freeze({ action: 'work', phase: NPC_JOB_PHASE.WORK, intentField: 'field' }),
  surveyor: Object.freeze({ action: 'work', phase: NPC_JOB_PHASE.WORK, intentField: 'field' }),
  salvor: Object.freeze({ action: 'work', phase: NPC_JOB_PHASE.WORK, intentField: 'field' }),
  patrol: Object.freeze({ action: 'hold', phase: NPC_JOB_PHASE.HOLD, intentField: 'at' }),
});
export const CERES_ORE_BARGE_UNLOAD_ACTION = Object.freeze({
  action: 'unload', phase: NPC_JOB_PHASE.UNLOAD, intentField: 'destination',
});

// Ambient-plan gate periods, locked to shouldAmbientHaulerPlan's defaults: trafficPlanOpts never
// passes activePeriodTicks/sleepPeriodTicks/nearPeriodTicks, so the scheduler's own fallbacks
// (max(2,…)=2 / max(8,…)=8 / max(2,…)=2) are the constants the call site always produces.
const AMBIENT_ACTIVE_PERIOD = 2;
const AMBIENT_SLEEP_PERIOD = 8;
const AMBIENT_NEAR_PERIOD = 2;

// ── PQ-045.causal-chain ──────────────────────────────────────────────────────────────────────────
// Nine catalog microevents form ONE authored causal story in the Ceres reference sector (the
// last, ev_rock_calving, is the environmental coda that closes every cycle). This is a
// choreography timer bound to the cast that already flies — not a generic ambient-event policy
// layer. Concurrency is hard-capped at two active links; later links wait on seeds, not on a
// cooldown/draw policy. Ledger lives on the traffic instance only (transient; out of the save
// envelope), identity keys are worldRecordSlotId / jobId, and movement stays with npcJobsRuntime.
const CERES_CAUSAL_CHAIN_SCHEMA = 'spaceface.ceresCausalChain.v1';
const CERES_CAUSAL_CHAIN_EVENT = 'traffic:ceresCausalChain';
const CERES_CAUSAL_CHAIN_MAX_CONCURRENT = 2;
const CERES_CAUSAL_CHAIN_CYCLE_GAP_S = 45;
export const CERES_MINER_HAULER_HANDOFF_SCHEMA = 'spaceface.ceresMinerHaulerHandoff.v1';
export const CERES_MINER_HAULER_SAVE_SCHEMA = 'spaceface.traffic.ceresMinerHaulerSave.v1';
export const CERES_MINER_HAULER_HANDOFF_RANGE_WU = 72;
// The rendezvous is an arrive problem, not an intercept: the miner is parked, so the hauler's
// job is to lose speed, not gain it. A flat pursuit burn lets a fast hull carry more speed than
// its turn authority can wrap inside the transfer window — it locks into a stable orbit one
// turn-radius wide (observed ~336 wu circling at ~140 wu/s) and never touches the 72 wu ring.
// Desired closing speed scales with the distance left to cover; carried speed above it brakes.
export const CERES_HANDOFF_ARRIVE_GAIN = 0.4;
export const CERES_HANDOFF_ARRIVE_HYSTERESIS_WU_S = 6;
export const CERES_REFINERY_HAULER_CAPACITY_U = 28;
const CERES_MINER_HAULER_HANDOFF_STATES = new Set([
  'requested', 'rendezvous', 'in_transit', 'delivered', 'interrupted',
]);
// PQ-048.04 is deliberately one bounded service incident, not another ambient controller. The
// save record names durable actors only; numeric entity ids are always re-bound from the live cast.
export const CERES_TENDER_SERVICE_INCIDENT_SCHEMA = 'spaceface.ceresTenderServiceIncident.v1';
const CERES_TENDER_SERVICE_STATES = new Set([
  'impair', 'approach', 'holding', 'repair', 'succeeded', 'failed',
]);
export const CERES_TENDER_SERVICE_TERMINAL_STATES = new Set(['succeeded', 'failed']);
export const CERES_TENDER_SERVICE_STANDOFF_WU = 56;
export const CERES_TENDER_SERVICE_CLEARANCE_WU = 12;
export const CERES_TENDER_SERVICE_HOLD_S = 3;
export const CERES_TENDER_SERVICE_REPAIR_AMOUNT = 999;
// ev_surveyor_probe_line drops three real probes per line at the catalog's authored spacing —
// "three drop points 40 wu apart on a line crossing the pocket". The catalog asks for
// session-scale persistence ("probes persist, pulsing lazily"); the TTL bounds the standing
// count to a few lines so a long watch does not leak pickups forever.
export const CERES_PROBE_TTL_S = 1500;
export const CERES_PROBE_DROP_COUNT = 3;
export const CERES_PROBE_SPACING_WU = 40;
// The salvor's stack phase spills its cutting count as real ore pickups (see _spillCeresCutterCount).
export const CERES_CUTTER_SPILL_PICKUPS = 3;
export const CERES_CUTTER_SPILL_QTY = 2;
export const CERES_CUTTER_SPILL_TTL_S = 180;
// ev_cargo_capsule_launch: one outbound refinery batch per cycle, launched once the day's ore is
// in traffic custody (ore_handoff). The capsule is a single grabbable pickup on a fixed ballistic
// leg; the TTL covers the authored launch..exit window plus coast margin before the lane is clean.
export const CERES_CAPSULE_BATCH_U = 5;
export const CERES_CAPSULE_COAST_SPEED_WU_S = 14;
export const CERES_CAPSULE_TTL_S = 60;
export const CERES_CAPSULE_LAUNCH_CLEARANCE_WU = 12;
// The calved fresh face out-pays the strike's default seam bonus (fieldDepletion default 8u):
// the catalog aftermath is "fresh faces are visibly brighter ore", so the re-armed window is the
// richer one. The target panel names it FRESH SEAM and the Hold's lot row shows the bonus size.
export const CERES_CALVED_SEAM_BONUS_U = 12;
// Tethys "quiet handoff" chain (src/data/sectorCausalChains.js) physical legs. ev_criminal_handoff's
// swap drops the three pieces the catalog counts ("three pickups cross the gap one at a time") as
// real contraband pickups in the gap between keeper and runner — grabbable evidence of a meet the
// law never saw. ev_smuggler_breaks' jettison sprays the runner's load off its tail (catalog:
// "dumps three cargo pickups in a spray to shed mass — and evidence"). Both ride the standard
// pickup pipeline exactly like the Ceres spills: the collecting player owns the cargo write.
export const TETHYS_HANDOFF_PICKUPS = 3;
export const TETHYS_HANDOFF_DRIFT_WU_S = 5;
export const TETHYS_HANDOFF_TTL_S = 120;
export const TETHYS_JETTISON_PICKUPS = 3;
export const TETHYS_JETTISON_TTL_S = 150;
export const TETHYS_JETTISON_SPREAD_WU_S = 7;
// ev_pod_breaks_clamp: one loaded pod shears off the refinery's cargo face while the day's ore
// is in custody (ore_handoff). The cast flies no tug, so the catalog's "no tug available"
// interruption IS the legible story — the pod drifts free on a slow tumble as a real
// player-reserved pickup. Catching it is the authored finders-keepers-with-a-witness: the
// station files the same payload_theft kind the disabled hauler uses. A pod nobody grabs
// clears the pocket on its TTL, dragged home offscreen. The traffic-bulge steering and the
// re-stack close stay unwired with the tug.
export const CERES_CLAMP_POD_U = 4;
export const CERES_CLAMP_POD_DRIFT_WU_S = 7;
export const CERES_CLAMP_POD_TTL_S = 60;
export const CERES_CLAMP_POD_CLEARANCE_WU = 4;
// ev_meteor_passage (microevent catalog, environmental): one wild rock crosses the pocket the
// player is actually in on a ballistic chord — no drive glow, three to four times the freighter
// read, mineable on the way through. Rare enough to stay an event (the catalog's 1-2 per hour
// class), and transient by construction: no field, no slot, no resource record — the ordinary
// despawnAt sweep owns its exit.
export const METEOR_PASS_MEAN_INTERVAL_S = 1800;
export const METEOR_PASS_SPAWN_RADIUS_WU = 2600;
export const METEOR_PASS_MISS_MAX_WU = 900;
export const METEOR_PASS_SPEED_LO_WU_S = 120;
export const METEOR_PASS_SPEED_HI_WU_S = 170;
export const METEOR_PASS_RADIUS_LO_WU = 10;
export const METEOR_PASS_RADIUS_HI_WU = 18;
export const METEOR_PASS_TYPE_ID = 'ast_common_rock';
export const METEOR_PASS_EXIT_PAD_S = 6;
// ev_debris_on_route (microevent catalog, accident): a cluster of real debris pickups on ONE
// shared slow drift vector crossing the pocket the player is in — "sparkles where nothing
// should sparkle, a constellation moving as one against the parallax". Scheduled environmental
// spawn (the catalog's other start, wreck-field aftermath, already has the cutter spill). The
// field is all pickup: the catalog's authored interference is the player diving in and
// collecting it piece by piece through the standard pipeline. No field, no slot, no sweeper
// cast — the catalog's "the event still reads without the janitor" — and the ordinary
// despawnAt sweep owns every piece's exit past the far edge.
export const DEBRIS_FIELD_MEAN_INTERVAL_S = 2400;
export const DEBRIS_FIELD_SPAWN_RADIUS_WU = 2600;
export const DEBRIS_FIELD_MISS_MAX_WU = 700;
export const DEBRIS_FIELD_SPEED_LO_WU_S = 11;
export const DEBRIS_FIELD_SPEED_HI_WU_S = 17;
export const DEBRIS_FIELD_PIECES_LO = 8;
export const DEBRIS_FIELD_PIECES_HI = 12;
export const DEBRIS_FIELD_SPREAD_WU = 240;
export const DEBRIS_FIELD_DRIFT_JITTER_WU_S = 3;
export const DEBRIS_FIELD_EXIT_PAD_S = 45;
// ev_smuggler_dumps_cache (microevent catalog, crime): a smuggler on a wide pointless arc sheds
// ONE dark cache beside a landmark rock without stopping — "one unlit pickup separates at the
// landmark - no strobe, no plume; you catch it by silhouette occlusion or not at all". The
// catalog's teaching beat ("the drop TEACHES the mechanic: quiet pickups exist") lands on the
// cache itself: real contraband-class cargo that carries no takeable ring, sitting dark until
// the player (or nobody) collects it. The smuggler hull is the catalog's casting note — the
// legible player content is the dead-drop; a flyby shed means the cache creeps on the hull's
// release velocity, exactly like a pod cut loose mid-pass.
export const SMUGGLER_CACHE_MEAN_INTERVAL_S = 2700;
export const SMUGGLER_CACHE_LANDMARK_MIN_WU = 400;
export const SMUGGLER_CACHE_LANDMARK_MAX_WU = 1600;
export const SMUGGLER_CACHE_OFFSET_LO_WU = 70;
export const SMUGGLER_CACHE_OFFSET_HI_WU = 140;
export const SMUGGLER_CACHE_DRIFT_WU_S = 4;
export const SMUGGLER_CACHE_AMOUNT_LO = 4;
export const SMUGGLER_CACHE_AMOUNT_HI = 8;
export const SMUGGLER_CACHE_TTL_S = 600;
// ev_debris_stream_crossing (microevent catalog, environmental): a ribbon of 8-10 small FAST
// debris rocks on parallel vectors rakes the corridor diagonally in about a minute — the
// drifting field's "dangerous cousin (fast and linear where that one is slow and cloudy)".
// The stream is the event: real collidable rocks on one ballistic heading the player threads
// (skill expression per the catalog) or waits out at the edge. The patrol/sweeper cast and
// the lane-pin first-strike stay unwired — the catalog's optional roles — while the rake
// itself needs nothing else to read.
export const DEBRIS_STREAM_MEAN_INTERVAL_S = 3000;
export const DEBRIS_STREAM_SPAWN_RADIUS_WU = 2600;
export const DEBRIS_STREAM_MISS_MAX_WU = 700;
export const DEBRIS_STREAM_SPEED_LO_WU_S = 210;
export const DEBRIS_STREAM_SPEED_HI_WU_S = 280;
export const DEBRIS_STREAM_PIECES_LO = 8;
export const DEBRIS_STREAM_PIECES_HI = 10;
export const DEBRIS_STREAM_RADIUS_LO_WU = 2;
export const DEBRIS_STREAM_RADIUS_HI_WU = 4.5;
export const DEBRIS_STREAM_RIBBON_WU = 420;
export const DEBRIS_STREAM_HEADING_JITTER_RAD = 0.07;
export const DEBRIS_STREAM_TYPE_ID = 'ast_common_rock';
export const DEBRIS_STREAM_EXIT_PAD_S = 8;
// CR-CHAIN (build_map §23.2): "a hitch on a working miner" — braid jobs x cargo. A loaded
// working hauler occasionally loses a piece off the back: one real cargo pod of ITS OWN
// manifest slips off the stern and drifts behind on the lane. The pod keeps the hauler's
// owner identity, so it is that truck's freight — the player who scoops it answers the
// ordinary custody/law read for taking owned cargo, and the hauler file keeps rolling.
export const HITCH_SHED_MEAN_INTERVAL_S = 1100;
export const HITCH_SHED_MIN_SPEED_WU_S = 20;
export const HITCH_SHED_AMOUNT_LO = 1;
export const HITCH_SHED_AMOUNT_HI = 3;
export const HITCH_SHED_BACK_OFF_WU = 30;
export const HITCH_SHED_BACK_VEL_WU_S = 6;
// CR-CHAIN (build_map §23.2): "a volatile pod as a moving mine" — the braid's second leg.
// A working volatiles tanker occasionally sloughs one pressurized pod of its OWN volatile
// manifest line off the stern. The pod is a real jettisoned-cargo body, so the volatile
// machinery stamps it automatically: the class lamp strobes, the slam behavior is armed,
// and it drifts in the lane as a live mine the player threads, shoves, or shoots clear.
export const VOLATILE_SLOUGH_MEAN_INTERVAL_S = 1500;
export const VOLATILE_SLOUGH_MIN_SPEED_WU_S = 20;
export const VOLATILE_SLOUGH_AMOUNT = 1;
export const VOLATILE_SLOUGH_BACK_OFF_WU = 30;
export const VOLATILE_SLOUGH_BACK_VEL_WU_S = 4;
// CR-FEED (build_map §23.2): "a machine rhythmically chews a feed — a scrap chunk drifts
// in, the mouth bites, ore spills out." The kill machines already have authored mouths,
// intake fields, and a warning/surge/calm cycle; what was missing is the FEED. On a
// cadence a small scrap asteroid enters the machine's own intake volume on a drift aimed
// at the mouth — the player can watch it ride the cone in, mine it, or bump it off the
// lane. At the rim it waits in the jaws until the machine's next surge, then bursts into
// a few ore pickups spat back out of the mouth.
export const BREAKER_FEED_MEAN_INTERVAL_S = 1300;
export const BREAKER_FEED_DRIFT_WU_S = 14;
export const BREAKER_FEED_CHUNK_RADIUS_LO_WU = 6;
export const BREAKER_FEED_CHUNK_RADIUS_HI_WU = 9;
export const BREAKER_FEED_RIM_PAD_WU = 6;
export const BREAKER_FEED_TTL_S = 240;
export const BREAKER_FEED_PRODUCTS_LO = 2;
export const BREAKER_FEED_PRODUCTS_HI = 4;
export const BREAKER_FEED_PRODUCT_TTL_S = 90;
export const BREAKER_FEED_PRODUCT_SPIT_WU_S = 18;
export const BREAKER_FEED_TYPE_ID = 'ast_metallic';
// CR-WEIR (build_map §23.2): "the toll that runs itself" — a hauler threading the customs
// weir pays its toll in kind: one token pod of station-owned freight slips off at the gap
// and drifts to rest. The till accumulates at the booth; when the pile fills, the booth
// banks the oldest pod. The player who snatches one takes station-owned freight — the
// ordinary owned-cargo answer, applied to the customs till.
export const WEIR_TILL_MAX_PODS = 6;
export const WEIR_TILL_CROSS_MIN_SPEED_WU_S = 8;
export const WEIR_TILL_DRIFT_SCALE = 0.15;
export const WEIR_TILL_EMBARGO_S = 20;
export const WEIR_TILL_COMMODITY = 'cmdty_scrap_metal';
export const WEIR_TILL_AMOUNT = 1;
// Exact current combat-drive arithmetic: a targeted ion packet pays the component's flat armor,
// then lands exactly on its remaining health. Keeping this here means the incident never spills
// overflow into the miner's hull merely to make the service call look dramatic.
export const CERES_TENDER_SERVICE_DRIVE_ARMOR_FLAT = 2;
export const CERES_TENDER_SERVICE_DRIVE_ION_MULTIPLIER = 1.1;
// PQ-048.05 binds one real transferred ore lot to the existing Ceres hauler, combat, Massline,
// freight, cargo, law, and tender owners. The compact record contains only stable actor/cargo
// identities; numeric entity and pickup ids are rebound from durable annotations after Continue.
export const CERES_DISABLED_HAULER_INCIDENT_SCHEMA = 'spaceface.ceresDisabledHaulerRecovery.v1';
const CERES_DISABLED_HAULER_ACTIVE_STATES = new Set([
  'impair', 'distress', 'player_recovery', 'responder_approach', 'responder_repair',
]);
export const CERES_DISABLED_HAULER_TERMINAL_STATES = new Set([
  'repaired', 'recovered', 'stolen', 'abandoned', 'destroyed', 'failed',
]);
export const CERES_DISABLED_HAULER_PLAYER_WINDOW_S = 20;
export const CERES_DISABLED_HAULER_REPAIR_HOLD_S = 3;
export const CERES_DISABLED_HAULER_REPAIR_AMOUNT = 999;
export const CERES_DISABLED_HAULER_PICKUP_TTL_S = 180;
export const CERES_DISABLED_HAULER_LAW_KIND = 'payload_theft';
export const CERES_DISABLED_HAULER_OFFENDER_STABLE_ID = 'player';
// Scratch return for _ceresCausalActorBySlot — never retain across a second call.
export const _CERES_CAUSAL_ACTOR_SCRATCH = { entity: null, rec: null, slotId: null };
export const CERES_CAUSAL_STAMP_KEYS = Object.freeze([
  'ceresCausalEventId',
  'ceresCausalPhase',
  'ceresCausalCue',
  'ceresCausalDisabled',
  'ceresCausalServiceHold',
]);
// Per-event explicit job hints: redirect a cast actor's existing job toward a subject so
// npcJobsRuntime produces visible motion. Tender is factionPresence-owned and is stamp-only.
const CERES_CAUSAL_CHAIN = Object.freeze([
  Object.freeze({
    // ev_surveyor_probe_line (catalog work, next20 tier) opens the cycle: the seam surveyor
    // reads the dark, then plays out three REAL probe pickups on its authored sweep line — the
    // catalog's "treasure map drawn in public" that the strike then answers. Probes are
    // player-reserved sector objects: physics leaves them for the player hull (NPC hulls pass
    // through, which matters because the surveyor retraces this wedge), residency owns them via
    // homeSectorId, and a stolen probe pays 1u electronics through the standard pickup pipeline.
    // Catalog boundaries recorded here: the crab traversal, the lit-pin dressing, and the
    // sequence-pulse wave close stay unwired — the surveyor reaffirms its authored sweep while
    // the line lands on that same patrol geometry, and probes render as ordinary pickups.
    // Interference is the authored steal (collect a probe), not shooting — projectile masks
    // cannot hit pickups, so probes are world objects the player pockets, not targets; a taken
    // probe is not re-dropped (the catalog's replace-on-destroy stays unwired — the line that
    // loses a probe simply reads as interrupted).
    id: 'ev_surveyor_probe_line',
    actorSlots: Object.freeze([CERES_SEAM_SURVEYOR_SLOT_ID]),
    // Cycle opener: the survey is why a strike exists at all (catalog composability hook:
    // "a later rich-seam or anomaly event can seed AT the line's far end").
    requires: Object.freeze([]),
    // The wave-pulse close is the find: seam_mapped is what the strike waits on.
    seedAtPhase: 'drop_3_close',
    seeds: Object.freeze(['seam_mapped']),
    // Surveyor lost mid-line: probes already down are a partial map, so the strike still
    // finds the seam — the story does not diverge (same anti-softlock shape as the calving).
    interruptSeeds: Object.freeze(['seam_mapped']),
    // The surveyor's authored lattice already flies the drop geometry — reaffirm, no redirect.
    jobHints: Object.freeze([
      Object.freeze({
        actorSlotId: CERES_SEAM_SURVEYOR_SLOT_ID,
        reaffirm: true,
        phases: Object.freeze(['mark_run', 'drop_1', 'drop_2', 'drop_3_close']),
      }),
    ]),
    phases: Object.freeze([
      Object.freeze({ name: 'mark_run', durationS: 25, cue: 'reading_the_dark' }),
      Object.freeze({ name: 'drop_1', durationS: 8, cue: 'reading_the_dark', probe: 0 }),
      Object.freeze({ name: 'drop_2', durationS: 20, cue: 'reading_the_dark', probe: 1 }),
      Object.freeze({ name: 'drop_3_close', durationS: 25, cue: 'on_the_pin', probe: 2 }),
    ]),
  }),
  Object.freeze({
    id: 'ev_rich_seam_strike',
    actorSlots: Object.freeze([CERES_SEAM_MINER_SLOT_ID]),
    // The strike answers the probe line's find; a skipped/interrupted survey still plants
    // seam_mapped (the seam was already mapped) so the cycle can never stall at the head.
    requires: Object.freeze(['seam_mapped']),
    // Seeds after the strike phase so the hauler call can overlap the greed/haul window (cap=2).
    seedAtPhase: 'strike',
    seeds: Object.freeze(['rich_seam']),
    // Miner dies mid-strike: seam is known but the load never leaves the face — open the grave for
    // the salvor instead of staging a clean hauler call.
    interruptSeeds: Object.freeze(['rich_seam', 'aftermath_open']),
    // Miner already works the seam via its authored extraction job — reaffirm only.
    jobHints: Object.freeze([
      Object.freeze({
        actorSlotId: CERES_SEAM_MINER_SLOT_ID,
        reaffirm: true,
        phases: Object.freeze(['cutting', 'strike', 'greed']),
      }),
    ]),
    phases: Object.freeze([
      Object.freeze({ name: 'cutting', durationS: 15, cue: 'blind_cone' }),
      Object.freeze({ name: 'strike', durationS: 8, cue: 'blind_cone' }),
      Object.freeze({ name: 'greed', durationS: 30, cue: 'blind_cone' }),
      Object.freeze({ name: 'haul_out', durationS: 20, cue: 'home_under_rock' }),
    ]),
  }),
  Object.freeze({
    id: 'ev_miner_calls_hauler',
    actorSlots: Object.freeze([CERES_SEAM_MINER_SLOT_ID, CERES_REFINERY_HAULER_SLOT_ID]),
    requires: Object.freeze(['miner_loaded']),
    seedAtPhase: 'transfer',
    // The physical custody transfer, not this choreography timer, plants downstream cargo facts.
    // A phase stamp must never claim a hauler holds ore before its live manifest does.
    seeds: Object.freeze([]),
    // A dead/absent participant opens the aftermath branch instead of leaving a held cargo claim.
    interruptSeeds: Object.freeze(['aftermath_open']),
    // Hauler is a retained real-target actor; traffic leases its existing job only for the rendezvous.
    jobHints: Object.freeze([]),
    phases: Object.freeze([
      Object.freeze({ name: 'call', durationS: 12, cue: 'heavy_burn' }),
      Object.freeze({ name: 'answer', durationS: 25, cue: 'clean_burn' }),
      Object.freeze({ name: 'transfer', durationS: 20, cue: 'mouth_open' }),
      Object.freeze({ name: 'split', durationS: 15, cue: 'heavy_burn' }),
    ]),
  }),
  Object.freeze({
    id: 'ev_patrol_scans_suspect',
    actorSlots: Object.freeze([CERES_CATHEDRAL_PATROL_SLOT_ID, CERES_REFINERY_HAULER_SLOT_ID]),
    requires: Object.freeze(['hauler_ore_manifest']),
    seedAtPhase: 'release',
    seeds: Object.freeze(['scan_complete', 'hauler_stressed']),
    // Hauler killed mid-scan: no stressed-tender recovery — salvor strips a fresh wreck instead.
    interruptSeeds: Object.freeze(['scan_complete', 'aftermath_open']),
    // Patrol closes on the hauler for the scan window.
    jobHints: Object.freeze([
      Object.freeze({
        actorSlotId: CERES_CATHEDRAL_PATROL_SLOT_ID,
        subjectSlotId: CERES_REFINERY_HAULER_SLOT_ID,
        phases: Object.freeze(['shadow', 'lock', 'read']),
      }),
    ]),
    phases: Object.freeze([
      Object.freeze({ name: 'shadow', durationS: 12, cue: 'on_the_pin' }),
      Object.freeze({ name: 'lock', durationS: 10, cue: 'on_the_pin' }),
      Object.freeze({ name: 'read', durationS: 15, cue: 'on_the_pin' }),
      Object.freeze({ name: 'release', durationS: 8, cue: 'on_the_pin' }),
    ]),
  }),
  Object.freeze({
    // ev_cargo_capsule_launch (catalog logistics, next20 tier) rides the delivery the call link
    // made physical: once the day's ore is in traffic custody, the refinery answers with one
    // outbound batch — an unmanned refined-metals capsule boosting down-lane on a fixed leg. The
    // station is the chain's first non-hull participant, so the link binds no cast slot: nothing
    // in the world can interrupt it and both outcomes tell the same story, which is why it is
    // the one entry with no seed bag at all (nothing downstream waits on it; its resolution is
    // what the cycle ledger counts). The capsule rides the standard pickup pipeline — a player
    // who reads the launch can chase it down and take the batch, or watch it leave — and the
    // catalog's crack-and-scatter branch stays unwired exactly like the calving's body-split:
    // pickups are not damageable, and the boundary is recorded here.
    id: 'ev_cargo_capsule_launch',
    actorSlots: Object.freeze([]),
    requires: Object.freeze(['ore_handoff']),
    seedAtPhase: 'launch',
    seeds: Object.freeze([]),
    interruptSeeds: Object.freeze([]),
    jobHints: Object.freeze([]),
    phases: Object.freeze([
      Object.freeze({ name: 'stage', durationS: 10, cue: null }),
      Object.freeze({ name: 'launch', durationS: 6, cue: 'clean_burn' }),
      Object.freeze({ name: 'coast', durationS: 20, cue: 'clean_burn' }),
      Object.freeze({ name: 'exit', durationS: 8, cue: null }),
    ]),
  }),
  Object.freeze({
    // ev_pod_breaks_clamp (catalog accident, first15 tier) plays the cargo face's bad minute:
    // a clamp lets go while the face is running and one loaded pod tumbles off the stack
    // toward the lane — the catalog's "one pod in the stack blinking its clamp strobe out of
    // rhythm" wrongness, then the physical escape. It binds no cast slot like the capsule: the
    // station is the participant, nothing in the world can interrupt it, and both outcomes
    // read the same, so it carries no seed bag. The pod is a real pickup the player can read
    // and chase; see _shearCeresClampPod for the spawn and the law consequence.
    id: 'ev_pod_breaks_clamp',
    actorSlots: Object.freeze([]),
    requires: Object.freeze(['ore_handoff']),
    seedAtPhase: 'drift',
    seeds: Object.freeze([]),
    interruptSeeds: Object.freeze([]),
    jobHints: Object.freeze([]),
    phases: Object.freeze([
      // The shear is the catalog's out-of-rhythm strobe: the wrongness reads before the pod
      // lets go (a player watching the stack gets the tell, not the accident).
      Object.freeze({ name: 'shear', durationS: 10, cue: 'breaking_the_pattern' }),
      Object.freeze({ name: 'drift', durationS: 30, cue: 'breaking_the_pattern' }),
      Object.freeze({ name: 'clear', durationS: 12, cue: null }),
    ]),
  }),
  Object.freeze({
    id: 'ev_disabled_hauler_recovery',
    actorSlots: Object.freeze([CERES_REFINERY_HAULER_SLOT_ID, CERES_TENDER_SLOT_ID]),
    requires: Object.freeze(['hauler_stressed']),
    // Seed miner wear when the tender is already working the casualty so the next link can open
    // under the concurrency cap while resolve finishes.
    seedAtPhase: 'work',
    seeds: Object.freeze(['miner_wear', 'hauler_recovered']),
    // Recovery fails or cast dies mid-tow: miner still wears, hull becomes wreckage for the salvor.
    interruptSeeds: Object.freeze(['miner_wear', 'aftermath_open']),
    // Tender is factionPresence-owned (not traffic job cast) — stamp-only; no traffic job redirect.
    jobHints: Object.freeze([]),
    phases: Object.freeze([
      Object.freeze({ name: 'failure', durationS: 15, cue: 'breaking_the_pattern' }),
      Object.freeze({ name: 'distress', durationS: 20, cue: 'breaking_the_pattern' }),
      Object.freeze({ name: 'response', durationS: 30, cue: 'spine_wake' }),
      Object.freeze({ name: 'work', durationS: 45, cue: 'hull_open' }),
      Object.freeze({ name: 'resolve', durationS: 30, cue: 'heavy_burn' }),
    ]),
  }),
  Object.freeze({
    id: 'ev_tender_services_miner',
    actorSlots: Object.freeze([CERES_TENDER_SLOT_ID, CERES_SEAM_MINER_SLOT_ID]),
    requires: Object.freeze(['miner_wear']),
    // A successful repair returns a real miner to work; it is explicitly not wreck aftermath.
    // The persisted incident below plants this only after combat has re-enabled the drive.
    seedAtPhase: 'first_light',
    seeds: Object.freeze(['miner_serviced']),
    // Service interrupted: miner is not returned to duty; aftermath stays open for the salvor.
    interruptSeeds: Object.freeze(['aftermath_open']),
    // Both existing jobs are leased only while the incident owns the two hulls. Releasing the
    // leases restores their original route controllers without a replacement job.
    jobHints: Object.freeze([]),
    phases: Object.freeze([
      Object.freeze({ name: 'callout', durationS: 20, cue: 'spine_wake' }),
      Object.freeze({ name: 'hard_stand', durationS: 10, cue: 'hull_open' }),
      Object.freeze({ name: 'work', durationS: 45, cue: 'hull_open' }),
      Object.freeze({ name: 'first_light', durationS: 10, cue: 'blind_cone' }),
    ]),
  }),
  Object.freeze({
    // The tutelary beat the cycle earns after a real casualty: with the hauler recovered once,
    // the cathedral patrol stops trusting the hauler's luck and falls in on its delivery leg —
    // not a scan (the audit link above already owns that read), a visible cover run the player
    // can watch, join, or spoil. Opens only on the recovery's success seed. The branch is
    // divergent by the chain's own law: a completed run plants yard_cover (the receipt that the
    // yard covered this leg); an interrupted run is a casualty like any other and opens the
    // aftermath branch for the salvor. A recovery that never succeeded plants aftermath_open
    // first, so the skip logic supersedes this link before it starts either way.
    id: 'ev_patrol_escorts_hauler',
    actorSlots: Object.freeze([CERES_CATHEDRAL_PATROL_SLOT_ID, CERES_REFINERY_HAULER_SLOT_ID]),
    requires: Object.freeze(['hauler_recovered']),
    seedAtPhase: 'eye',
    seeds: Object.freeze(['yard_cover']),
    interruptSeeds: Object.freeze(['aftermath_open']),
    jobHints: Object.freeze([
      Object.freeze({
        actorSlotId: CERES_CATHEDRAL_PATROL_SLOT_ID,
        subjectSlotId: CERES_REFINERY_HAULER_SLOT_ID,
        phases: Object.freeze(['fall_in', 'shadow', 'eye', 'handoff']),
      }),
    ]),
    phases: Object.freeze([
      Object.freeze({ name: 'fall_in', durationS: 12, cue: 'clean_burn' }),
      Object.freeze({ name: 'shadow', durationS: 25, cue: 'on_the_pin' }),
      Object.freeze({ name: 'eye', durationS: 20, cue: 'on_the_pin' }),
      Object.freeze({ name: 'handoff', durationS: 10, cue: 'heavy_burn' }),
    ]),
  }),
  Object.freeze({
    id: 'ev_cutter_strips_wreck',
    actorSlots: Object.freeze([CERES_CATHEDRAL_SALVOR_SLOT_ID]),
    // Opens only when the service actually fails; a completed repair never manufactures a wreck.
    requires: Object.freeze(['aftermath_open']),
    seedAtPhase: 'stack',
    seeds: Object.freeze(['wreck_stripped', 'chain_complete']),
    // Strip interrupted: ledger still closes so the cycle can re-arm (no soft-lock).
    interruptSeeds: Object.freeze(['chain_complete']),
    // Salvor's authored job already works the cathedral wreck — reaffirm.
    jobHints: Object.freeze([
      Object.freeze({
        actorSlotId: CERES_CATHEDRAL_SALVOR_SLOT_ID,
        reaffirm: true,
        phases: Object.freeze(['survey_cut', 'sever', 'wrangle', 'stack']),
      }),
    ]),
    phases: Object.freeze([
      Object.freeze({ name: 'survey_cut', durationS: 15, cue: 'picking_the_bones' }),
      Object.freeze({ name: 'sever', durationS: 20, cue: 'picking_the_bones' }),
      Object.freeze({ name: 'wrangle', durationS: 20, cue: 'picking_the_bones' }),
      Object.freeze({ name: 'stack', durationS: 12, cue: 'spilling_the_count' }),
    ]),
  }),
  Object.freeze({
    // ev_rock_calving (catalog environmental, standard tier) closes every cycle as the field's
    // environmental coda: the worked seam rock calves under its own stress regardless of which
    // service story resolved. Choreography-only like the other timer links — cue stamps + job
    // reaffirm + receipts; the catalog's persistent body-split stays unwired (no runtime
    // asteroid-body swap seam yet) and is recorded in the catalog notes.
    id: 'ev_rock_calving',
    actorSlots: Object.freeze([CERES_SEAM_MINER_SLOT_ID]),
    // rich_seam plants on every strike outcome (complete and interrupt), so the coda is always
    // reachable; the miner is the catalog's optional participant and the only bound actor.
    requires: Object.freeze(['rich_seam']),
    seedAtPhase: 'calve',
    seeds: Object.freeze(['rock_calved']),
    // Environmental fallback: an interrupted calving still happened for nobody — the story does
    // not diverge, so both outcomes plant the same seed (anti-softlock guarantee intact).
    interruptSeeds: Object.freeze(['rock_calved']),
    // The miner keeps its authored extraction cycle; the drift phase re-approach rides the
    // authored loop's own back-off motions — no redirect, reaffirm only.
    jobHints: Object.freeze([
      Object.freeze({
        actorSlotId: CERES_SEAM_MINER_SLOT_ID,
        reaffirm: true,
        phases: Object.freeze(['groan', 'calve', 'drift']),
      }),
    ]),
    phases: Object.freeze([
      Object.freeze({ name: 'groan', durationS: 15, cue: 'blind_cone' }),
      Object.freeze({ name: 'calve', durationS: 10, cue: 'breaking_the_pattern' }),
      Object.freeze({ name: 'drift', durationS: 40, cue: 'stacking' }),
    ]),
  }),
]);
const CERES_CAUSAL_CHAIN_BY_ID = new Map(CERES_CAUSAL_CHAIN.map((entry) => [entry.id, entry]));

// ── Per-sector chain registry ────────────────────────────────────────────────────────────────────
// The choreography timer below is not Ceres-specific; the Ceres chain is just the first entry in a
// table keyed by sector id. A sector with an entry runs its chain on the same hard cap (two live
// links) and the same cycle gap, bound to that sector's authored cast through the same
// `activityActorSlotId` stamps. The ledger remembers which sector it belongs to (`sectorId`), so a
// ledger can never be stepped against another sector's table. Ceres-only effects (probes, capsule,
// tender and disabled-hauler incidents, the rich-seam window) are gated on `spec.isCeres`.
const SECTOR_CAUSAL_CHAIN_SCHEMA = 'spaceface.sectorCausalChain.v1';

function ceresCycleNews(chain) {
  // The pocket's story rides the flight news channel: which cycle resolved decides the line
  // (aftermath branch opened = loss story; clean service = clean shift). aftermath_open is the
  // honest discriminator — the cutter is in `completed` on both paths (skipped on success).
  // The loss line leads with the casualty, not the strip: the cutter can be killed mid-strip
  // and the cycle still resolve, so "strips" would sometimes claim work that never happened.
  const aftermathRan = chain.seeds.aftermath_open === true;
  return {
    text: aftermathRan
      ? 'Ceres refinery writes off another seam casualty at the cathedral wreck.'
      : 'Ceres refinery logs another clean seam shift.',
    kind: 'ceres_seam_story',
    sourceRef: 'traffic:ceres-causal-chain',
    stationId: 'station_ceres',
  };
}

function causalChainSpec({ sectorId, schema, chain, cycleNews }) {
  return Object.freeze({
    sectorId,
    schema,
    chain,
    byId: new Map(chain.map((entry) => [entry.id, entry])),
    // One cap and one gap for every sector: a second chain is more of the same machinery, not a
    // second tuning surface.
    maxConcurrent: CERES_CAUSAL_CHAIN_MAX_CONCURRENT,
    cycleGapS: CERES_CAUSAL_CHAIN_CYCLE_GAP_S,
    isCeres: sectorId === CERES_ACTIVITY_SECTOR_ID,
    cycleNews,
  });
}

const SECTOR_CAUSAL_CHAINS = new Map([
  [CERES_ACTIVITY_SECTOR_ID, causalChainSpec({
    sectorId: CERES_ACTIVITY_SECTOR_ID,
    schema: CERES_CAUSAL_CHAIN_SCHEMA,
    chain: CERES_CAUSAL_CHAIN,
    cycleNews: ceresCycleNews,
  })],
]);
// Data-declared sectors (src/data/sectorCausalChains.js) join the same table. Their cycle story is
// one authored line chosen from the ledger's seeds; the news payload shape is Ceres's, verbatim.
for (const def of Object.values(SECTOR_CAUSAL_CHAIN_DEFS)) {
  if (SECTOR_CAUSAL_CHAINS.has(def.sectorId)) {
    throw new Error(`sector causal chain declared twice: ${def.sectorId}`);
  }
  SECTOR_CAUSAL_CHAINS.set(def.sectorId, causalChainSpec({
    sectorId: def.sectorId,
    schema: SECTOR_CAUSAL_CHAIN_SCHEMA,
    chain: def.chain,
    cycleNews: (ledger) => ({
      text: def.cycleNewsText(ledger.seeds),
      kind: def.newsKind,
      sourceRef: 'traffic:sector-causal-chain',
      stationId: def.stationId,
    }),
  }));
}

// Exported for focused characterization tests (seconds-scale, seed-pinned). Not a new runtime seam.
export {
  CERES_CAUSAL_CHAIN,
  CERES_CAUSAL_CHAIN_EVENT,
  CERES_CAUSAL_CHAIN_SCHEMA,
  CERES_CAUSAL_CHAIN_MAX_CONCURRENT,
  CERES_CAUSAL_CHAIN_CYCLE_GAP_S,
  SECTOR_CAUSAL_CHAINS,
  SECTOR_CAUSAL_CHAIN_SCHEMA,
  MAX_GENERAL_SALVORS_PER_SECTOR,
  MAX_YARD_TUGS_PER_SECTOR,
  TOWABLE_BODY_MIN_RADIUS_WU,
};

export function terminalWorldRecord(record) {
  return !!record && (record.alive === false
    || record.outcome === 'destroyed'
    || record.outcome === 'defeated');
}

export function hasExactCeresSectorAuthority(entity) {
  if (!entity) return false;
  const data = entity.data || {};
  let present = false;
  for (const sectorId of [entity.homeSectorId, data.homeSectorId, data.sectorId]) {
    if (sectorId == null) continue;
    present = true;
    if (sectorId !== CERES_ACTIVITY_SECTOR_ID) return false;
  }
  return present;
}

export function sameJSONValue(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function validCausalManifest(manifest) {
  if (!manifest || !Array.isArray(manifest.lines) || manifest.lines.length === 0
    || !Number.isSafeInteger(manifest.totalQty) || manifest.totalQty <= 0) return false;
  let totalQty = 0;
  for (const line of manifest.lines) {
    if (!line || typeof line.commodityId !== 'string'
      || !/^[a-z][a-z0-9_.-]*$/.test(line.commodityId)
      || !Number.isSafeInteger(line.qty) || line.qty <= 0) return false;
    totalQty += line.qty;
    if (!Number.isSafeInteger(totalQty)) return false;
  }
  return totalQty === manifest.totalQty;
}

export function normalizeCeresMinerHaulerHandoff(value, copy = true) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || value.schema !== CERES_MINER_HAULER_HANDOFF_SCHEMA
    || typeof value.handoffId !== 'string' || !value.handoffId
    || typeof value.rootLotId !== 'string' || !value.rootLotId
    || typeof value.minerWorldRecordId !== 'string' || !value.minerWorldRecordId
    || typeof value.haulerWorldRecordId !== 'string' || !value.haulerWorldRecordId
    || value.minerWorldRecordId === value.haulerWorldRecordId
    || !CERES_MINER_HAULER_HANDOFF_STATES.has(value.state)) return null;
  const requestedQty = value.requestedQty;
  const transferredQty = value.transferredQty;
  const deliveredQty = value.deliveredQty;
  const remainingQty = value.remainingQty;
  const terminalizedQty = value.terminalizedQty == null ? 0 : value.terminalizedQty;
  const transferSeq = value.transferSeq;
  const deliveredTransferSeq = value.deliveredTransferSeq;
  if (!Number.isSafeInteger(requestedQty) || requestedQty <= 0
    || !Number.isSafeInteger(transferredQty) || transferredQty < 0
    || !Number.isSafeInteger(deliveredQty) || deliveredQty < 0 || deliveredQty > transferredQty
    || !Number.isSafeInteger(remainingQty) || remainingQty < 0
    || !Number.isSafeInteger(terminalizedQty) || terminalizedQty < 0
    || transferredQty + remainingQty + terminalizedQty !== requestedQty
    || !Number.isSafeInteger(transferSeq) || transferSeq < 0
    || !Number.isSafeInteger(deliveredTransferSeq) || deliveredTransferSeq < 0
    || deliveredTransferSeq > transferSeq) return null;
  if (value.state === 'in_transit'
    && (transferredQty <= deliveredQty || transferSeq <= deliveredTransferSeq)) return null;
  if (value.state === 'delivered'
    && (remainingQty !== 0 || deliveredQty + terminalizedQty !== requestedQty)) return null;
  if (!copy) return value;
  const normalized = {
    schema: CERES_MINER_HAULER_HANDOFF_SCHEMA,
    handoffId: value.handoffId,
    rootLotId: value.rootLotId,
    minerWorldRecordId: value.minerWorldRecordId,
    haulerWorldRecordId: value.haulerWorldRecordId,
    state: value.state,
    requestedQty,
    transferredQty,
    deliveredQty,
    remainingQty,
    terminalizedQty,
    transferSeq,
    deliveredTransferSeq,
  };
  return normalized;
}

export function normalizeCeresTenderServiceIncident(value, copy = true) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || value.schema !== CERES_TENDER_SERVICE_INCIDENT_SCHEMA
    || typeof value.incidentId !== 'string' || !value.incidentId
    || !Number.isSafeInteger(value.sequence) || value.sequence < 1
    || typeof value.tenderWorldRecordId !== 'string' || !value.tenderWorldRecordId
    || typeof value.minerWorldRecordId !== 'string' || !value.minerWorldRecordId
    || value.tenderWorldRecordId === value.minerWorldRecordId
    || !CERES_TENDER_SERVICE_STATES.has(value.state)) return null;
  const startedAtSimT = Number(value.startedAtSimT);
  const holdStartedAtSimT = value.holdStartedAtSimT == null ? null : Number(value.holdStartedAtSimT);
  const terminalAtSimT = value.terminalAtSimT == null ? null : Number(value.terminalAtSimT);
  if (!Number.isFinite(startedAtSimT) || startedAtSimT < 0
    || (holdStartedAtSimT != null && (!Number.isFinite(holdStartedAtSimT) || holdStartedAtSimT < startedAtSimT))
    || (terminalAtSimT != null && (!Number.isFinite(terminalAtSimT) || terminalAtSimT < startedAtSimT))) return null;
  const terminal = CERES_TENDER_SERVICE_TERMINAL_STATES.has(value.state);
  if (terminal !== (terminalAtSimT != null)) return null;
  if ((value.state === 'impair' || value.state === 'approach') && holdStartedAtSimT != null) return null;
  if ((value.state === 'holding' || value.state === 'repair') && holdStartedAtSimT == null) return null;
  const failureReason = value.failureReason == null ? null : String(value.failureReason);
  if (value.state === 'failed' && !failureReason) return null;
  if (value.state !== 'failed' && failureReason != null) return null;
  if (!copy) return value;
  return {
    schema: CERES_TENDER_SERVICE_INCIDENT_SCHEMA,
    incidentId: value.incidentId,
    sequence: value.sequence,
    tenderWorldRecordId: value.tenderWorldRecordId,
    minerWorldRecordId: value.minerWorldRecordId,
    state: value.state,
    startedAtSimT,
    holdStartedAtSimT,
    terminalAtSimT,
    failureReason,
  };
}

export function normalizeCeresDisabledHaulerIncident(value, copy = true) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || value.schema !== CERES_DISABLED_HAULER_INCIDENT_SCHEMA
    || typeof value.incidentId !== 'string' || !value.incidentId
    || typeof value.handoffId !== 'string' || !value.handoffId
    || typeof value.haulerWorldRecordId !== 'string' || !value.haulerWorldRecordId
    || typeof value.responderWorldRecordId !== 'string' || !value.responderWorldRecordId
    || value.haulerWorldRecordId === value.responderWorldRecordId
    || !CERES_DISABLED_HAULER_ACTIVE_STATES.has(value.state)
      && !CERES_DISABLED_HAULER_TERMINAL_STATES.has(value.state)
    || typeof value.manifestId !== 'string' || !value.manifestId
    || typeof value.rootLotId !== 'string' || !value.rootLotId
    || !validCausalManifest(value.manifest)
    || value.manifest.manifestId !== value.manifestId
    || value.manifest.freighterKey !== value.haulerWorldRecordId) return null;
  const startedAtSimT = Number(value.startedAtSimT);
  const responseAtSimT = Number(value.responseAtSimT);
  const holdStartedAtSimT = value.holdStartedAtSimT == null ? null : Number(value.holdStartedAtSimT);
  const terminalAtSimT = value.terminalAtSimT == null ? null : Number(value.terminalAtSimT);
  const terminal = CERES_DISABLED_HAULER_TERMINAL_STATES.has(value.state);
  if (!Number.isFinite(startedAtSimT) || startedAtSimT < 0
    || !Number.isFinite(responseAtSimT) || responseAtSimT < startedAtSimT
    || (holdStartedAtSimT != null && (!Number.isFinite(holdStartedAtSimT) || holdStartedAtSimT < startedAtSimT))
    || terminal !== (terminalAtSimT != null)) return null;
  const choice = value.choice == null ? null : String(value.choice);
  if (choice != null && !['recover', 'steal', 'abandon'].includes(choice)) return null;
  const outcome = value.outcome == null ? null : String(value.outcome);
  if (terminal !== (outcome != null)) return null;
  const pickupLines = Array.isArray(value.pickupLines) ? value.pickupLines : [];
  for (const line of pickupLines) {
    if (!line || typeof line.pickupStableId !== 'string' || !line.pickupStableId
      || typeof line.commodityId !== 'string' || !line.commodityId
      || !Number.isSafeInteger(line.qty) || line.qty <= 0
      || !Number.isSafeInteger(line.acceptedQty) || line.acceptedQty < 0 || line.acceptedQty > line.qty) return null;
  }
  if (!copy) return value;
  return {
    schema: CERES_DISABLED_HAULER_INCIDENT_SCHEMA,
    incidentId: value.incidentId,
    handoffId: value.handoffId,
    haulerWorldRecordId: value.haulerWorldRecordId,
    responderWorldRecordId: value.responderWorldRecordId,
    manifestId: value.manifestId,
    rootLotId: value.rootLotId,
    manifest: JSON.parse(JSON.stringify(value.manifest)),
    state: value.state,
    choice,
    startedAtSimT,
    responseAtSimT,
    holdStartedAtSimT,
    terminalAtSimT,
    outcome,
    failureReason: value.failureReason == null ? null : String(value.failureReason),
    lossIntentId: value.lossIntentId == null ? null : String(value.lossIntentId),
    lawIncidentReceiptId: value.lawIncidentReceiptId == null ? null : String(value.lawIncidentReceiptId),
    theftCausalTick: Number.isSafeInteger(value.theftCausalTick) && value.theftCausalTick >= 0
      ? value.theftCausalTick
      : null,
    pickupLines: pickupLines.map((line) => ({
      pickupStableId: line.pickupStableId,
      commodityId: line.commodityId,
      qty: line.qty,
      acceptedQty: line.acceptedQty,
    })),
  };
}

export function leftoverHaulerSlot(entry) {
  const slot = entry && entry.slot;
  if (!slot) return false;
  return slot.presentationRole === 'hauler' || slot.jobKind === 'hauler';
}

export function leftoverSlotTargetsStation(entry, stationId) {
  if (!entry || !stationId) return false;
  const marks = entry.slot && entry.slot.route && entry.slot.route.marks;
  if (!Array.isArray(marks)) return false;
  const dest = `dest:${stationId}`;
  const stationPrefix = `station:${stationId}`;
  for (const mark of marks) {
    const ref = mark && mark.targetRef;
    if (typeof ref !== 'string') continue;
    if (ref === dest || ref === stationId || ref === `station:${stationId}` || ref.startsWith(`${stationPrefix}:`)) {
      return true;
    }
  }
  return false;
}

function leftoverSlotDestStationId(entry) {
  const marks = entry && entry.slot && entry.slot.route && entry.slot.route.marks;
  if (!Array.isArray(marks)) return null;
  for (const mark of marks) {
    const ref = mark && mark.targetRef;
    if (typeof ref !== 'string' || !ref.startsWith('dest:')) continue;
    const dest = ref.slice(5);
    if (dest) return dest;
  }
  return null;
}

export function leftoverNormalizeDisruptedStationIds(value, reuseLive = false) {
  // The normalizer remains uncapped for legacy saves. Only the common short live list takes
  // the allocation-free path; longer lists keep the existing linear normalization.
  if (reuseLive && stableIdsAlreadyNormalized(value, DISRUPTED_ROUTE_STATION_CAP)) return value;
  const ids = [];
  const seen = new Set();
  const list = Array.isArray(value) ? value : [];
  for (const id of list) {
    if (typeof id !== 'string' || !id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function ceresActivityJobSpec(entry) {
  if (!entry || entry.service || !entry.pocket || !entry.slot) return null;
  const { pocket, slot } = entry;
  const route = slot.route;
  const sectorId = pocket.sectorId || CERES_ACTIVITY_SECTOR_ID;
  const anchor = pocket.activityAnchor && pocket.activityAnchor.localPos;
  if (!CERES_ACTIVITY_JOB_KINDS.has(slot.jobKind)
    || !anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.z)
    || !route || !Number.isFinite(route.durationS) || route.durationS <= 0
    || !Array.isArray(route.marks) || route.marks.length !== 2) return null;
  const waypoints = [];
  for (const mark of route.marks) {
    if (!mark || typeof mark.id !== 'string' || !mark.id
      || !mark.offset || !Number.isFinite(mark.offset.x) || !Number.isFinite(mark.offset.z)) return null;
    const pos = sectorLocalToGlobalForSector({
      x: anchor.x + mark.offset.x,
      z: anchor.z + mark.offset.z,
    }, sectorId);
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
    waypoints.push({
      id: mark.id,
      label: mark.id,
      pos: { x: pos.x, z: pos.z },
      targetRef: mark.targetRef,
    });
  }
  const distance = Math.hypot(
    waypoints[1].pos.x - waypoints[0].pos.x,
    waypoints[1].pos.z - waypoints[0].pos.z,
  );
  if (!Number.isFinite(distance) || distance <= 0) return null;
  const speed = distance / route.durationS;
  if (!Number.isFinite(speed) || speed <= 0) return null;
  return {
    kind: slot.jobKind,
    sectorId,
    route: waypoints,
    speed,
  };
}

/** Sector-agnostic name for the same descriptor-to-job translation (CV-DAY: any authored sector). */
const activityJobSpec = ceresActivityJobSpec;

function exactCeresRouteTargetRefMode(route, canonicalRoute, legacyTargetRefs = null) {
  if (!Array.isArray(route) || !Array.isArray(canonicalRoute)
    || route.length !== canonicalRoute.length || route.length === 0) return 'invalid';
  let absent = 0;
  let exact = 0;
  let legacyExplicit = 0;
  for (let index = 0; index < route.length; index++) {
    const waypoint = route[index];
    const canonical = canonicalRoute[index];
    if (!waypoint || !canonical || !waypoint.pos || !canonical.pos
      || waypoint.id !== canonical.id || waypoint.label !== canonical.label
      || !Number.isFinite(waypoint.pos.x) || waypoint.pos.x !== canonical.pos.x
      || !Number.isFinite(waypoint.pos.z) || waypoint.pos.z !== canonical.pos.z) return 'invalid';
    const targetRefOwned = Object.hasOwn(waypoint, 'targetRef');
    const waypointKeys = Object.keys(waypoint).sort().join(',');
    const expectedKeys = targetRefOwned ? 'id,label,pos,targetRef' : 'id,label,pos';
    if (waypointKeys !== expectedKeys || Object.keys(waypoint.pos).sort().join(',') !== 'x,z') return 'invalid';
    if (!targetRefOwned) absent++;
    else if (waypoint.targetRef === canonical.targetRef) exact++;
    else if (Array.isArray(legacyTargetRefs)
      && legacyTargetRefs.length === route.length
      && waypoint.targetRef === legacyTargetRefs[index]) legacyExplicit++;
    else return 'invalid';
  }
  if (absent === route.length) return 'legacy';
  if (exact === route.length) return 'current';
  if (absent === 0 && legacyExplicit > 0
    && exact + legacyExplicit === route.length) return 'legacy';
  return 'invalid';
}

/**
 * Latest retained sectorSim embodiment recipe payload for `kind` in `sectorId`, or null.
 * The cache is world-owned (`state.world.embodiment`); this is a read-only consumer. The
 * traffic_density recipe carries the live field's densityMultiplier/roleMixBias — authored as
 * the M2-C3 "scalar → recipe" contract that previously nobody read.
 */
function embodimentDensityPayload(state, sectorId) {
  const bySector = state && state.world && state.world.embodiment
    && state.world.embodiment.bySector;
  const rec = bySector && sectorId ? bySector[sectorId] : null;
  const intents = rec && Array.isArray(rec.intents) ? rec.intents : null;
  if (!intents) return null;
  for (const it of intents) {
    if (it && it.kind === 'traffic_density' && it.payload && typeof it.payload === 'object') {
      return it.payload;
    }
  }
  return null;
}

function sectorServiceSet(sector) {
  const set = new Set();
  const stations = sector && sector.stations;
  if (!Array.isArray(stations)) return set;
  for (const station of stations) {
    const services = station && station.services;
    if (!Array.isArray(services)) continue;
    for (const service of services) {
      if (typeof service === 'string' && service) set.add(service);
    }
  }
  return set;
}

function hazardTypeSet(sector) {
  const set = new Set();
  const hazards = sector && sector.hazards;
  if (!Array.isArray(hazards)) return set;
  for (const hazard of hazards) {
    if (hazard && typeof hazard.type === 'string' && hazard.type) set.add(hazard.type);
  }
  return set;
}

/**
 * FB-029 / FB-133 — flags the mixer already knows how to read, plus the service gates
 * that field the volatiles tanker and the inspection cutter. Synthetic pockets that
 * set none of these flags keep the prior weights. Ambient count is not touched.
 */
function applySectorPopulationFlags(weights, sector) {
  const sec = sector || {};
  const out = weights;
  const ind = sec.industries && typeof sec.industries === 'object' ? sec.industries : null;
  const mining = !!(ind && ind.mining);
  const refinery = !!(ind && ind.refinery);
  const research = !!(ind && ind.research);
  if (research && !mining && !refinery) {
    out.surveyor *= 2.2;
    out.courier *= 1.25;
  } else if (research) {
    out.surveyor *= 1.45;
  }
  if (refinery && !mining) {
    out.hauler *= 1.35;
    out.ore_carrier *= 1.2;
  }
  if (mining && !refinery) out.prospector *= 1.35;
  if (sec.threat === 'vael') {
    out.surveyor *= 1.55;
    out.escort *= 1.18;
  } else if (sec.threat === 'quiet') {
    out.smuggler *= 1.9;
    out.courier *= 0.75;
  }
  const hazards = hazardTypeSet(sec);
  if (hazards.has('nebula')) out.surveyor *= 1.12;
  if (hazards.has('radiation')) out.tender *= 1.18;
  if (hazards.has('debris')) out.sweeper *= 1.22;
  if (hazards.has('dense_asteroid')) out.prospector *= 1.08;
  const numericSecurity = Number.isFinite(sec.security) ? sec.security : null;
  const tier = Number.isFinite(sec.tier) ? sec.tier : 0;
  const threat = sec.threat || sec.danger;
  const lowBand = threat === 'high' || sec.security === 'lawless'
    || (numericSecurity != null && numericSecurity <= 0.35) || tier >= 3;
  if (lowBand && numericSecurity != null) out.patrol *= (0.85 + numericSecurity);
  const services = sectorServiceSet(sec);
  const highCore = numericSecurity != null && numericSecurity >= 0.9;
  const escorted = (out.escort || 0) > 0 || (out.patrol || 0) > 0;
  if (!highCore && services.has('refuel') && ((out.pirate || 0) <= 0 || escorted)) out.tanker = 6;
  if (!highCore && (services.has('scan') || services.has('toll'))) out.customs = 6;
  return out;
}

// A sector with authored rock is a sector somebody cuts. Field records exist in three shapes: the
// authored def (`count`), the embodied runtime record (`asteroidIds`), and the live view (`rocks`).
function sectorHasAuthoredRock(sec) {
  return Array.isArray(sec && sec.fields) && sec.fields.some((f) => f && (
    (f.count | 0) > 0
    || (Array.isArray(f.asteroidIds) && f.asteroidIds.length > 0)
    || (Array.isArray(f.rocks) && f.rocks.length > 0)
  ));
}

function ensureServiceCraftRoles(roles, weights, sector = null) {
  if (!Array.isArray(roles) || !roles.length || !weights) return roles;
  const out = roles.slice();
  const placed = new Set();
  const place = (role, force = false) => {
    if (!(weights[role] > 0) || out.includes(role)) return;
    for (let i = out.length - 1; i >= 0; i--) {
      if (placed.has(i) || out[i] === 'patrol' || out[i] === 'escort' || out[i] === 'courier') continue;
      out[i] = role;
      placed.add(i);
      return;
    }
    // A packed draw leaves no civilian slot: a lawful hull beyond the first yields instead of
    // growing the roster past the ambient cap. The pair outranks a third patrol in a sector
    // whose economy is cutting rock; the lawful presence floor itself is never touched.
    if (!force) return;
    const lawfulFree = out.filter((r, i) => !placed.has(i) && (r === 'patrol' || r === 'escort')).length;
    if (lawfulFree <= 1) return;
    for (let i = out.length - 1; i >= 0; i--) {
      if (placed.has(i) || (out[i] !== 'patrol' && out[i] !== 'escort')) continue;
      out[i] = role;
      placed.add(i);
      return;
    }
  };
  place('tanker');
  place('customs');
  // A sector with declared extraction work also needs its extraction pair: the weighted draw can
  // roll zero miners/ore_carriers (Helios did once the authored pocket cast consumed the mix),
  // which silences the whole ore chain — nobody cuts, nobody collects. Same guarantee idiom as
  // the service craft above, gated on the same condition that boosts their weights below.
  const sec = sector || {};
  if ((sec.industries && (sec.industries.mining || sec.industries.refinery)) || sectorHasAuthoredRock(sec)) {
    place('miner', true);
    place('ore_carrier', true);
  }
  return out;
}

// Causal role mix for a sector (spec §12.2). Hostile/pirate sectors tilt toward raiders; industrial
// sectors toward miners/haulers; secure faction sectors toward patrols/escorts.
export function trafficRoleMixForSector(sector, state = null) {
  const sec = sector || {};
  const out = {};
  for (const [id, role] of Object.entries(TRAFFIC_ROLES)) out[id] = role.weight;
  const numericSecurity = Number.isFinite(sec.security) ? sec.security : null;
  const tier = Number.isFinite(sec.tier) ? sec.tier : 0;
  // Industrial (mining/refinery) sectors: more miners + haulers. The ore barge plies the same
  // declared extraction economy (it is the heavy logistics end of the miner's trade, not a
  // contents-derived read — a sector that merely HAS rocks does not attract bulk carriers).
  if (sec.industries && (sec.industries.mining || sec.industries.refinery)) {
    out.miner *= 2.5; out.hauler *= 1.5; out.ore_carrier *= 2.5;
    out.prospector *= 2.5; out.sweeper *= 1.7;
  }
  // A sector with authored ROCK is a sector somebody cuts, whether or not an `industries` flag was
  // ever set on it. Read the contents, not only the label.
  //
  // Concrete case this exists for: `sector_helios_prime` authors 70 asteroids across two named
  // fields — the comments in sectors.js call one of them "the starter seam" — and Helios Station
  // carries a standing iron shortage (`marketEquilibriumFactors: { cmdty_ore_iron: 0.09 }`). It has
  // no `industries` flag, so the miner weight stayed at its base 16 while the `security >= 0.9`
  // branch below multiplied patrol x1.6 and hauler x1.4 on top of it. Measured result across
  // repeated live captures of the sector every new player starts in: **zero barges**, consistently
  // 1 hauler + 4 patrols. The economy said iron was short and nobody was mining it.
  //
  // Deliberately weaker than the explicit flag (x1.7 vs x2.5) and NOT applied on top of it: a
  // declared mining economy should still out-mine a core sector that merely happens to have rocks.
  else if (sectorHasAuthoredRock(sec)) {
    out.miner *= 1.7;
  }
  // Hostile/danger sectors: more suspicious raiders, fewer civilians.
  const threat = sec.threat || sec.danger;
  if (threat === 'high' || sec.security === 'lawless' || (numericSecurity != null && numericSecurity <= 0.35) || tier >= 3) {
    out.pirate *= 4; out.courier *= 0.4; out.escort *= 2;
  }
  // Secure faction sectors: more patrols + escorts, no suspicious raider traffic in the safe lanes.
  if (sec.security === 'secure' || sec.factionControl === 'strong' || (numericSecurity != null && numericSecurity >= 0.6)) {
    out.patrol *= 2.5; out.escort *= 1.8; out.pirate = 0;
  }
  // Professional core pocket (Helios-class): licensed traders + one lawful presence — no smuggler
  // scenery in the first-hour safe lane (smugglers still exist elsewhere via lower security).
  if (numericSecurity != null && numericSecurity >= 0.9) {
    out.smuggler = 0;
    out.pirate = 0;
    out.hauler *= 1.4;
    out.courier *= 1.2;
    out.patrol *= 1.6;
  }
  // Call-time gate: headless/golden and explicit flag-off sessions retain the exact prior role mix.
  if (!massline2Flag('hitchhiking')) out.express = 0;
  // General salvors are demand-driven from live wrecks/payloads (see _dispatchGeneralSalvors).
  // Zero ambient weight so golden scenarios and ordinary pockets never roll a cutter from the
  // role mix alone — the cleanup profession only appears when there is something to clean.
  out.salvor = 0;
  // The yard tug follows the same doctrine, and for a stronger reason: a tug whose whole job is to
  // drag a body somewhere is a decorative hull if it rolls into a pocket with nothing to drag. It is
  // dispatched against a real towable body by `_dispatchYardTugs`, so ambient weight is zero here.
  // This also keeps the weighted draw byte-identical to the pre-tug distribution, which is why the
  // sim/massline goldens are untouched by fielding the role.
  out.tug = 0;
  // PQ-193.07: the Arclight is a dedicated Helios fixture, not a mix roll. Zero here keeps
  // every seeded hauler as Span and leaves goldens byte-identical.
  out.arclight = 0;
  // PQ-193.08: tanker and inspection cutter are the same fixture doctrine.
  out.tanker = 0;
  out.customs = 0;
  out.tourist = (sec.scenic || sec.tourism) ? 4 : 0;
  let weights = state ? regionalTrafficRoleWeights(state, sec.id, out) : out;
  // Live field read: the retained traffic_density recipe's roleMixBias tilts the mix toward what
  // the sector's danger/scarcity/influence actually projects (more miners under mining industry,
  // more raiders under Reach pressure). Deterministic per epoch; absent cache → authored mix.
  const bias = state && sec && sec.id ? embodimentDensityPayload(state, sec.id) : null;
  const mix = bias && bias.roleMixBias;
  if (mix && typeof mix === 'object') {
    const adjusted = { ...weights };
    for (const role of Object.keys(adjusted)) {
      const factor = Number(mix[role]);
      if (Number.isFinite(factor)) adjusted[role] = Math.max(0, adjusted[role] * factor);
    }
    weights = adjusted;
  }
  return applySectorPopulationFlags(weights, sec);
}
function pickRole(roleWeights, rng) {
  let total = 0; for (const w of Object.values(roleWeights)) total += Math.max(0, w);
  if (total <= 0) return 'hauler';
  let r = rng() * total;
  for (const [id, w] of Object.entries(roleWeights)) { r -= Math.max(0, w); if (r <= 0) return id; }
  return 'hauler';
}

// The ship files a live sector:enter can mount through this system, as {defId, factionId}
// rows for the decode warm. Covers the ambient role-mix anchors (plus every faction-group
// hull an anchor can substitute to — the spawn path picks ONE member via factionHullFor, so
// the stub walks the whole group), authored activity-pocket presentation roles, the ceres
// service slots, and the named lane contacts stamped for this sector (a contact's own ship
// outranks the faction fleet exactly as the spawn code does). Extra files in the runway
// cost nothing; a missed hull decodes cold at mount and pops in.
export function sectorEnterTrafficShipStubs(sector, state) {
  const out = [];
  const seen = new Set();
  const sectorId = sector && sector.id;
  const factionId = (sector && sector.factionId) || 'faction_free';
  // Rows carry the mount's trafficRole: wholeShipVisualForEntity resolves role before defId
  // and the role/defId whole-ship maps are near-disjoint, so a stub without the role warms
  // the wrong GLB. Dedupe on defId|role — two roles mapping to one hull still need both
  // role files warmed.
  const push = (defId, role) => {
    if (typeof defId !== 'string' || !defId) return;
    const key = defId + '|' + (role || '');
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ defId, factionId, trafficRole: role || null });
  };
  const pushWithFactionGroup = (anchorDefId, role) => {
    push(anchorDefId, role);
    const groups = FLEET_BY_FACTION.get(factionId);
    const group = groups && groups.find((entry) => entry.hullIds.includes(anchorDefId));
    if (group && group.hullIds.length > 1) {
      for (const hullId of group.hullIds) push(hullId, role);
    }
  };
  if (!sector) return out;
  if (ambientCountForSector(sector, state) > 0) {
    const mix = trafficRoleMixForSector(sector, state);
    for (const [roleId, w] of Object.entries(mix)) {
      if (!Number.isFinite(w) || w <= 0) continue;
      const def = TRAFFIC_ROLES[roleId];
      if (def && def.ship) pushWithFactionGroup(def.ship, roleId);
    }
  }
  for (const pocket of activityPocketsForSector(sectorId) || []) {
    for (const slot of (pocket && pocket.actorSlots) || []) {
      const def = TRAFFIC_ROLES[slot && slot.presentationRole];
      if (def && def.ship) push(def.ship, slot.presentationRole);
    }
  }
  if (sectorId === CERES_ACTIVITY_SECTOR_ID) {
    for (const slot of CERES_ACTIVITY_SERVICE_SLOTS) {
      const def = TRAFFIC_ROLES[slot && slot.presentationRole];
      if (def && def.ship) push(def.ship, slot.presentationRole);
    }
  }
  for (const contact of NAMED_LANE_CONTACTS) {
    if (!contact || !Array.isArray(contact.sectorIds)
        || contact.sectorIds.indexOf(sectorId) < 0) continue;
    // The spawn stamps trafficRole = contact.role || 'hauler' whether the hull is the
    // contact's own or a role-default faction pick — the stub mirrors that role so the
    // warm resolves the same whole-ship file the mount reads. A named contact's own hull
    // outranks the faction fleet: the spawn does not run factionHullFor for it, so neither
    // does the stub.
    const contactRole = contact.role || 'hauler';
    if (contact.ship) {
      push(contact.ship, contactRole);
    } else {
      const def = TRAFFIC_ROLES[contactRole];
      if (def && def.ship) pushWithFactionGroup(def.ship, contactRole);
    }
  }
  return out;
}

/** Ambient count from trafficPerMin — core pockets floor at CORE_MIN_TRAFFIC. Exported for tests. */
export function ambientCountForSector(sector, state = null) {
  // NO AMBIENT FREIGHT IN A CRUCIBLE RUN (PQ-135). Helios carries eighteen haulers a minute, and a
  // live arena walk had nineteen of them on the board: they filled the contact list with things the
  // player must not shoot, held spawn slots the wave needed, and turned a match into rush hour.
  // The run is a sealed box; the only ships in it should be the ones it put there.
  if (isRunSealed(state)) return 0;
  const tpm = sector && sector.trafficPerMin;
  let count;
  if (typeof tpm === 'number') {
    // denser reading for high-tpm cores: tpm/3 instead of /4 so Helios (18) → 6
    count = Math.min(MAX_PER_SECTOR, Math.round(tpm / 3));
  } else {
    count = DEFAULT_TRAFFIC;
  }
  const sec = Number.isFinite(sector && sector.security) ? sector.security : null;
  if (sec != null && sec >= 0.85 && count > 0) {
    count = Math.min(MAX_PER_SECTOR, Math.max(CORE_MIN_TRAFFIC, count));
  }
  // Explicit zero remains authored silence. Otherwise ecology changes embodied freight density
  // within the existing cap; the corresponding role mix also changes actual market manifests.
  if (count > 0 && state) {
    count = Math.min(MAX_PER_SECTOR, Math.max(1, Math.round(
      count * regionalTrafficDensityMultiplier(state, sector && sector.id),
    )));
    // Live field read: the retained sectorSim traffic_density recipe scales the pocket with the
    // field's projected density (danger surges thin the lanes; scarcity draws hulls). Same cap
    // and floor as the ecology multiplier; absent cache → authored density unchanged.
    const density = embodimentDensityPayload(state, sector && sector.id);
    if (density && Number.isFinite(density.densityMultiplier)) {
      count = Math.min(MAX_PER_SECTOR, Math.max(1, Math.round(
        count * Math.max(0.35, Math.min(2.75, density.densityMultiplier)),
      )));
    }
  }
  return count;
}

/**
 * Professional first-hour mix: guarantee ≥1 lawful patrol + majority traders in high-sec.
 * Pure: takes pre-picked roles and returns a corrected array of the same length.
 */
function ensurePocketRoleMix(roles, sector) {
  const sec = Number.isFinite(sector && sector.security) ? sector.security : null;
  if (sec == null || sec < 0.85 || !roles.length) return roles;
  const out = roles.slice();
  const hasPatrol = out.includes('patrol');
  if (!hasPatrol) out[0] = 'patrol';
  // Prefer traders for remaining civilian slots (readable ambient economy).
  for (let i = 0; i < out.length; i++) {
    if (out[i] === 'smuggler' || out[i] === 'pirate') out[i] = (i % 2 === 0) ? 'hauler' : 'courier';
  }
  // A dense high-security hub gets exactly one scheduled express service: rare within the six-to-
  // eight ship pocket, but reliably learnable in default play. Other sectors retain the weighted
  // seeded role draw. The replacement is deterministic and never removes the guaranteed patrol.
  if (massline2Flag('hitchhiking') && out.length >= CORE_MIN_TRAFFIC) {
    let first = out.indexOf('express');
    if (first < 0) {
      first = out.length - 1;
      if (out[first] === 'patrol') first = Math.max(1, first - 1);
      out[first] = 'express';
    }
    for (let i = first + 1; i < out.length; i++) {
      if (out[i] === 'express') out[i] = (i % 2 === 0) ? 'hauler' : 'courier';
    }
  }
  return out;
}

export function normalizeDepotServices(rows) {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    if (!row || typeof row.bodyId !== 'string' || !row.bodyId
      || typeof row.stationId !== 'string' || !row.stationId || seen.has(row.bodyId)) continue;
    seen.add(row.bodyId);
    const integer = (key) => Number.isSafeInteger(row[key]) && row[key] >= 0 ? row[key] : 0;
    const time = (key) => Number.isFinite(row[key]) && row[key] >= 0 ? row[key] : 0;
    out.push({ bodyId: row.bodyId, stationId: row.stationId,
      generation: integer('generation'), legSeq: integer('legSeq'),
      nextDispatchAt: time('nextDispatchAt'), watchAt: time('watchAt'),
      watchResolved: row.watchResolved === true, deliveredU: integer('deliveredU') });
  }
  return out;
}

export const traffic = {
  ...trafficConvoyOps,
  ...trafficJobOps,
  ...trafficRoleOps,
  ...trafficTugOps,
  ...trafficEscortOps,
  ...trafficRecoveryOps,
  ...trafficCausalChainOps,
  ...anvilTrafficMethods,
  name: 'traffic',
  // Every serialized field is rebuilt by a normalizer, sliced, or primitive — saveSystem need
  // not defensively clone the (large) traffic payload a second time during autosave capture.
  saveSnapshotOwned: true,

  /** A secured physical hull leaves traffic's route/job roster without destruction or cargo
   * settlement. World-record retirement is performed by the world owner before this handoff. */
  relinquishVessel(entityId, vesselId) {
    const entity = this.state.entities?.get(entityId);
    if (!entity || entity.alive === false || entity.type !== 'ship'
      || typeof vesselId !== 'string' || entity.data?.vesselId !== vesselId) {
      return { ok: false, reason: 'vessel_identity_changed' };
    }
    const rows = this.state.traffic?.freighters;
    const index = Array.isArray(rows) ? rows.findIndex(row => row?.id === entityId) : -1;
    const row = index >= 0 ? rows[index] : null;
    const active = this._active?.includes(entityId) === true;
    if (!row && !active && !entity.data.trafficRole) return { ok: true, relinquished: false };
    // Preserve the exact finite freight object aboard the real hull. This is custody, neither
    // cargo extraction nor an economy trade, and must not mint a replacement manifest.
    if (!entity.data.cargoManifest && row?.manifest) entity.data.cargoManifest = row.manifest;
    const jobs = this.helpers?.npcJobs;
    const entry = jobs?.byEntity?.(entityId);
    const jobId = entity.data.jobId || entry?.job?.id;
    if (jobId && typeof jobs?.release === 'function') jobs.release(jobId);
    // The ordinary despawn-side handler only releases salvor reservations; it never destroys
    // a body or settles its manifest. Capturing the working salvor ends those same leases.
    this._onEntityDestroyed({ id: entityId, entity, reason: 'custody_transferred' });
    if (index >= 0) rows.splice(index, 1);
    if (Array.isArray(this._active)) this._active = this._active.filter(id => id !== entityId);
    if (this._industryHaulDispatched instanceof Map) {
      for (const [key, order] of this._industryHaulDispatched) if (order.entityId === entityId) this._industryHaulDispatched.delete(key);
    }
    // Generic promote/save adoption is keyed on trafficRole. Keeping it would silently reclaim
    // the parked ship on the next enter even though its former job and world record are retired.
    delete entity.data.trafficRole;
    entity.data.intent = null;
    entity.data.ai = null;
    entity.flags ||= {};
    entity.flags.persistent = true;
    this._ensureState();
    this.bus?.emit('traffic:vesselRelinquished', { entityId, vesselId, jobId: jobId || null });
    return { ok: true, relinquished: true, jobId: jobId || null };
  },

  destroy() {
    this._captainMemory?.destroy();
    this._coldburnRey?.destroy();
    clearCeresWorkfleetControls(this.state);
    unregisterMachineryReconciliation(this.state, this);
  },

  init(ctx) {
    this.state = ctx.state;
    registerMachineryReconciliation(this.state, this);
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._registry = ctx.registry || null;
    // live freighter records: id -> {targetId, waitT, nextTradeT, manifest, dockSeq}
    this._ensureState();
    this._captainMemory = installCaptainMemory(this);
    this._coldburnRey = installColdburnRey(this);
    this._wellDragRegroup = new Map();
    this._wellDragSeen = new Set();
    this._active = []; // entity ids we spawned (for cleanup)
    this._stationScratch = [];
    this._activeTrafficScratch = [];
    this._activeTrafficIdsScratch = new Set();
    this._recordByIdScratch = new Map();
    this._recordIndexByIdScratch = new Map();
    this._pendingJobActionIds = new Set();
    this._pendingMinerWorkIds = new Set();
    this._pendingArrivalIds = new Set();
    // owner -> cached {near,sleep,active} FNV phases for the ambient-plan gate. Entity objects are
    // stable across ticks; a rebuilt entity (load/restore) re-keys naturally through the WeakMap.
    this._ambientPhaseCache = new WeakMap();
    this._pendingJobActionTokens = new Map();
    this._pendingMinerWorkTokens = new Map();
    this._pendingArrivalTokens = new Map();
    this._committedCeresMinerWorkIds = new Set();
    this._committedCeresArrivalIds = new Set();
    this._causalRunEpoch = 0;
    this._restoreEpochPending = false;
    this._heaveToHold = null;
    this._ensureCivilianViolenceRing();
    // PQ-045.causal-chain: instance-only ledger (never written into state.traffic / save).
    this._ceresCausal = null;
    // Entity references are deliberately transient. A Continue can reuse neither numeric ids nor
    // object identity, so only the compact stable-id incident crosses that boundary.
    this._ceresTenderServiceImpairmentActor = null;
    this._ceresTenderServiceRepairActor = null;
    this._ceresDisabledHaulerImpairmentActor = null;
    this._ceresDisabledHaulerRepairActor = null;
    this._ceresDisabledHaulerRestorePending = false;
    this._industryHaulDispatched = new Map();

    if (this.helpers) {
      this.helpers.traffic = {
        ...(this.helpers.traffic || {}),
        heaveToEntity: (entityId, opts) => this.heaveToEntity(entityId, opts),
        pallasWorkTarget: (entry, entity) => pallasWorkTarget(this, entry, entity),
        salvorWorkTarget: (entry, entity) => this._salvorWorkTarget(entry, entity),
        salvorSourceTarget: (entry, entity) => this._salvorSourceTarget(entry, entity),
      };
    }

    this.bus.on('sector:enter', (p) => this._onSectorEnter(p));
    this.bus.on('endgame:chosen', () => this._materializeEndingWorldPresence());
    this.bus.on('save:loaded', () => this._materializeEndingWorldPresence());
    // Census arm: ambient traffic materialization lands inside the sector cook
    // deterministically (the handler falls back to world.currentSectorId itself). The cook
    // drives the chunked twin across the census's slice clock — the emit listener drains
    // the same steps synchronously, so both paths mint the identical roster.
    this._cookProvider = (sector) => this._onSectorEnterSteps({
      sector: sector || null,
      sectorId: (sector && sector.id) || undefined,
      _viaCook: true,
    });
    if (this.helpers) {
      (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = []))
        .push(this._cookProvider);
    }
    // PIC-21: one glint record for the open seam, cleared when the seam is worked.
    // The listeners fire on the events; nothing here emits per tick.
    if (!this._richSeamGlintBound && this.bus && typeof this.bus.on === 'function') {
      this._richSeamGlintBound = true;
      this.bus.on('field:richSeamOpened', (payload) => admitRichSeamGlint(this.state, payload || {}));
      this.bus.on('field:richSeamWorked', (payload) => endRichSeamGlint(this.state, payload || {}));
    }
    // Canonical seam is sector:exit (world never emits sector:leave). Continuous handoffs prune
    // dead tracking only; hard exits fully clean up freighters.
    this.bus.on('sector:exit', (p) => this._onSectorExit(p));
    // ECON-P2: freighter loss → owner-safe scarcity intents + named news (no wallet writes).
    this.bus.on('entity:killed', (p) => this._onEntityKilled(p));
    // Despawn is not a kill. A cutter removed by sector exit, residency demotion, or TTL holds
    // its wreck/payload reservation forever unless the destroy receipt releases it too.
    this.bus.on('entity:destroyed', (p) => this._onEntityDestroyed(p));
    // A living barge can lose the counted hold without dying: the opening raid's robbed
    // outcome is the raider leaving with the ore. Destruction closes the same row when the
    // kill path never saw this manifest id.
    this.bus.on('encounter:resolved', (p) => this._onOpeningRaidFreightResolved(p || {}));
    this.bus.on('world:farActorShelved', (p) => this._onFarActorShelved(p || {}));
    this.bus.on('world:farActorRestored', (p) => this._onFarActorRestored(p || {}));
    // Working freight is driven by npcJobsRuntime, so the ambient traffic stepper never reaches
    // its own work/dock branches. Consume only materialized kernel intents here and keep field and
    // economy authority on their existing event seams.
    this.bus.on('npcjobs:work', (p) => this._onNpcJobWork(p || {}));
    this.bus.on('npcjobs:load', (p) => this._onNpcJobLoad(p || {}));
    this.bus.on('npcjobs:unload', (p) => this._onNpcJobUnload(p || {}));
    this.bus.on('npcjobs:hold', (p) => this._onNpcJobHold(p || {}));
    // A held worker's route-hold mayday must reach the rescue fleet even when no shot was ever
    // fired: reshape it into the standard lastDistressCall and the ordinary dispatch path answers.
    this.bus.on('npcjobs:distress', (p) => this._onNpcJobDistress(p || {}));
    // HELP is an explicit player hail intent. Traffic reserves the finite opportunity for the
    // answering seam miner; physical WORK below remains the sole rich-load/depletion writer.
    this.bus.on('contactHail:response', (p) => this._onContactHailResponse(p || {}));
    this.bus.on('surrender:tethered', (p) => this._onCeresDisabledHaulerPlayerClaim(p || {}));
    this.bus.on('surrender:secured', (p) => this._onCeresDisabledHaulerPlayerClaim(p || {}));
    this.bus.on('freight:recovery', (p) => this._onCeresDisabledHaulerRecovery(p || {}));
    this.bus.on('freight:recoveryAbandoned', (p) => this._onCeresDisabledHaulerAbandoned(p || {}));
    this.bus.on('save:loaded', () => bindRestoredCharonSupply(this));
    this.bus.on('npcjobs:cycle', p => charonSupplyRoundBoundary(this, p));
    this.bus.on('npcjobs:complete', p => charonSupplyRoundBoundary(this, p));
    this.bus.on('pickup:collected', p => winnowPickupReceipt(this, p || {}));
    this.bus.on('freight:cargoSpilled', p => winnowSpillReceipt(this, p || {}));
    this.bus.on('loot:manifestPayload', p => winnowSpillReceipt(this, p || {}));
    this.bus.on('entity:killed', p => winnowKilledReceipt(this, p || {}));
    this.bus.on('entity:destroyed', p => winnowDestroyedReceipt(this, p || {}));
    this.bus.on('pickup:collected', p => charonSupplyPickupReceipt(this, p || {}));
    this.bus.on('freight:cargoSpilled', p => charonSupplySpillReceipt(this, p || {}));
    this.bus.on('loot:manifestPayload', p => charonSupplySpillReceipt(this, p || {}));
    this.bus.on('entity:destroyed', p => charonSupplyDestroyed(this, p || {}));
    this.bus.on('pickup:collected', (p) => this._onCeresDisabledHaulerPickup(p || {}));
    this.bus.on('pickup:collected', (p) => this._onCeresClampPodPickup(p || {}));
    this.bus.on('freight:cargoSpilled', (p) => this._onFreightCargoSpilled(p || {}));
    this.bus.on('well:haulerDragged', (p) => this._onWellHaulerDragged(p || {}));
    this.bus.on('uniqueWreck:resolved', (p) => this._onCeresTenderWreckResolved(p || {}));
    this.bus.on('survivorPod:rescued', (p) => this._onSurvivorPodRescued(p || {}));
    // Nearby violence: production hits, aimed ship-to-ship combat:fire (Ambush first shots often
    // apply 0), and opened incidents. Bare/mining fire without a live ship victim is ignored.
    this.bus.on('combat:damage', (p) => this._onCombatDamage(p || {}));
    this.bus.on('combat:fire', (p) => this._onCombatFire(p || {}));
    this.bus.on('law:incidentOpened', (p) => this._onLawIncidentOpened(p || {}));
    this.bus.on('save:restoring', () => {
      captureCeresWorkfleetHardware(this);clearCeresWorkfleetControls(this.state);
      invalidateMachineryPresentation(this.state);
      // Invalidate before the save owner starts destructive restore. Old synchronous owner stacks
      // may still unwind afterward, but their private reservation tokens no longer own this run.
      this._restoreEpochPending = true;
      // Sector materialization reuses numeric IDs before save:loaded. This roster belongs
      // to the outgoing run; cleanup must never resolve it against fresh occupants.
      this._active = [];
      this._ceresDisabledHaulerRestorePending = true;
      this._invalidateCausalRunEpoch();
    });
    this.bus.on('save:error', (p) => {
      // A restore that dies mid-chunk never emits save:loaded — without this the epoch latch
      // would starve every ambient top-up guard for the rest of the session. Only
      // restore-lifecycle failures clear it: an unrelated write error arriving mid-restore
      // must not reopen the ambient lanes while the envelope is still respawning.
      const reason = p && p.reason;
      if (reason !== 'load_failed' && reason !== 'visual_gate_failed'
          && reason !== 'deferred_transition_failed') return;
      if (this._restoreEpochPending === true) this._restoreEpochPending = false;
      // Same lifecycle as the epoch latch: a failed restore leaves the disabled-hauler
      // incident unable to terminalize (actor_absent gate) until the next successful load.
      if (this._ceresDisabledHaulerRestorePending === true) {
        this._ceresDisabledHaulerRestorePending = false;
      }
    });
    // Adjacent listeners, economy-slice style: registration order preserves the original
    // sequence exactly, but the emit-slice drain can cut between units at the deadline —
    // the two O(hooks × freighters) sort passes stop riding one atomic brick.
    this.bus.on('save:loaded', () => {
      // Real restores already invalidated at save:restoring. Standalone fixture/compat signals still
      // form an authoritative boundary, so fail closed once without double-invalidating a real load.
      if (this._restoreEpochPending === true) this._restoreEpochPending = false;
      else this._invalidateCausalRunEpoch();
      this._releaseCeresMinerHaulerHandoffControls(
        this.state.traffic && this.state.traffic.ceresMinerHaulerHandoff,
      );
      this._releaseCeresTenderServiceControls(
        this.state.traffic && this.state.traffic.ceresTenderServiceIncident,
      );
      this._resetCeresTenderServiceRuntime();
      this._releaseCeresDisabledHaulerControls(
        this.state.traffic && this.state.traffic.ceresDisabledHaulerIncident,
      );
      this._resetCeresDisabledHaulerRuntime();
      this._ceresDisabledHaulerRestorePending = false;
      // Traffic causality ledgers are intentionally transient rather than part of the save envelope.
      // The incoming envelope is authoritative: a Continue to an earlier completion boundary must
      // be able to surface that legitimate action again.
      this._resetTransientCausalLedgers(false);
      this._heaveToHold = null;
      this._clearCivilianViolenceMemory();
      this._resetCeresCausalChain('save_loaded');
      this._adoptLegacyCeresActivityTargetRefs();
    });
    this.bus.on('save:loaded', () => {
      const sectorId = this.state.world && this.state.world.currentSectorId;
      // Persistent general cutters materialize after world.enterSector, so the sector-enter
      // adoption pass cannot see them. Re-adopt here before the next traffic tick can refresh a
      // stable salvage point to its new numeric wreck id.
      this._adoptRematerializedTraffic(sectorId, this._sectorStations());
      // lawSecurity is session-only. A saved predeparture delay cannot remain asserted after its
      // raw incident map has gone away, while a saved physical diversion remains intact.
      this._clearStalePassengerLinerDelays();
    });
    this.bus.on('save:loaded', () => {
      this._applyWorldSiteTrafficHooks(this.state.world && this.state.world.currentSectorId);
    });
    this.bus.on('save:loaded', () => {
      const sectorId = this.state.world && this.state.world.currentSectorId;
      this._applyClaimTravelHooks(sectorId);
      if (SECTOR_CAUSAL_CHAINS.has(sectorId)) this._ensureCeresCausalChain('save_loaded');
    });
    const refreshClaimTravel = () => this._applyClaimTravelHooks(
      this.state.world && this.state.world.currentSectorId,
    );
    this.bus.on('claim:infrastructureActive', refreshClaimTravel);
    this.bus.on('claim:infrastructureStatus', refreshClaimTravel);
    this.bus.on('claim:claimed', () => this._maintainClaimDepotTraffic());
    // Claims abandons a manifested leg (release/teardown edge) — retire the carrier here so no
    // ownerless convoy hull ever lingers in the sector.
    this.bus.on('claim:convoyAbandoned', (p) => this._teardownClaimConvoy(p || {}));
    this.bus.on('encounter:resolved', ({ encounterId } = {}) => {
      for (const service of this.state.traffic?.depotServices || []) {
        if (encounterId === `depot-watch:${service.bodyId}`) service.watchResolved = true;
      }
    });
    this.bus.on('worldSite:operationReceipt', ({ siteId, receipt } = {}) => {
      // Held tools publish progress every fixed tick. Traffic topology changes only on completion;
      // projecting all sites and scanning freighters for every partial tick is pure hot-path waste.
      if (receipt?.complete !== true) return;
      syncCeresWorkfleetHardware(this);
      const record = siteId && this.state.sites && this.state.sites.worldById && this.state.sites.worldById[siteId];
      this._applyWorldSiteTrafficHooks(record && record.sectorId);
    });
    // A full hangar depot or a jammed aperture asks for one haul. The job kernel flies it.
    this.bus.on('industry:haulRequested', (p) => this._onIndustryHaulRequested(p || {}));
  },

  _reconcileCeresWorkfleetPresentation() { reconcileCeresWorkfleetPresentation(this); },

  heaveToEntity(entityId, {
    durationS = TRAFFIC_HEAVE_TO_DURATION_S,
    cooldownS = TRAFFIC_HEAVE_TO_COOLDOWN_S,
  } = {}) {
    if (entityId == null) return { granted: false, reason: 'no_target', kind: 'traffic_wait' };
    this._ensureState();
    const simT = Number.isFinite(this.state && this.state.simTime) ? this.state.simTime : 0;
    const active = this._heaveToHold;
    if (active && active.untilSimT > simT && active.entityId !== entityId) {
      return { granted: false, reason: 'another_target_active', kind: 'traffic_wait', untilSimT: active.untilSimT };
    }
    if (active && active.cooldownUntilSimT > simT && active.entityId !== entityId) {
      return { granted: false, reason: 'cooldown', kind: 'traffic_wait', cooldownUntilSimT: active.cooldownUntilSimT };
    }

    const rec = (this.state.traffic.freighters || []).find((row) => row && row.id === entityId);
    const entity = this.state.entities && this.state.entities.get
      ? this.state.entities.get(entityId)
      : null;
    const role = String((rec && rec.role)
      || (entity && entity.data && (entity.data.trafficRole || entity.data.role))
      || '').toLowerCase();
    if (!rec || !entity || entity.alive === false) return { granted: false, reason: 'not_traffic', kind: 'traffic_wait' };
    if (!trafficHeaveToComplies(role, entity)) {
      return { granted: false, reason: 'ignored', kind: 'traffic_wait', role };
    }

    const duration = Math.max(0.1, Number.isFinite(Number(durationS)) ? Number(durationS) : TRAFFIC_HEAVE_TO_DURATION_S);
    const untilSimT = simT + duration;
    rec.waitT = Math.max(0, Number.isFinite(Number(rec.waitT)) ? Number(rec.waitT) : 0, duration);
    if (entity.data && !entity.data.jobId) setIntent(entity, 0, 0, false, false, null, entity.rot || 0);
    this._heaveToHold = {
      entityId,
      untilSimT,
      cooldownUntilSimT: untilSimT + Math.max(0, Number.isFinite(Number(cooldownS)) ? Number(cooldownS) : TRAFFIC_HEAVE_TO_COOLDOWN_S),
    };
    return { granted: true, reason: null, kind: 'traffic_wait', untilSimT, waitT: rec.waitT };
  },

  _onSectorExit(p) {
    captureCeresWorkfleetHardware(this);clearCeresWorkfleetControls(this.state);
    if (p && (p.continuous || p.noTeleport)) {
      this._pruneDead();
      return;
    }
    const sectorId = (p && p.sectorId)
      || (this.state.world && this.state.world.currentSectorId);
    if (sectorId === CERES_ACTIVITY_SECTOR_ID || activityPocketsForSector(sectorId).length) {
      this._captureCeresActivityCast();
    }
    this._captureSourceBoundGeneralSalvors();
    this._cleanup();
  },

  _onSectorEnter(p) {
    // Live GPU + flight + hard enter: defer into the cook's FIFO — the census drains
    // this same body under its slice clock in listener order instead of paying the
    // whole cohort synchronously inside the emit.
    if (deferSectorEnterMaterialization(this.state, p, this._cookProvider)) return;
    // Sync lane (emit listener, tests): drain the chunked steps inline.
    for (const _ of this._onSectorEnterSteps(p)) { /* inline */ }
  },

  // Chunked cook-provider twin: yields between atomic spawn units so the sliced sector
  // census can interleave presentation between hulls. Dedupe stamps mint in the first
  // synchronous step (pre-loop); a yield never separates spawnEntity from its record link.
  *_onSectorEnterSteps(p) {
    if (this.state.run?.kind === 'survival' && this.state.run.phase !== 'inactive') return;
    // A tail-drained emit carries the epoch of the enter that minted it: a replayed payload
    // whose enterEpoch no longer matches the world's serial is stale — minting/cleanup for
    // it would wipe the live roster and remint the departed sector's hulls. Synthetic
    // payloads (tests, the census cook) carry no epoch and always run.
    if (p && p.enterEpoch != null && this.state.world && this.state.world.enterSerial != null
        && p.enterEpoch !== this.state.world.enterSerial) return;
    // The emit listener precedes the census cook on the live enter path, so each side can
    // only skip on the other's stamp: a replayed emit for an enter the cook or the first
    // emit already handled, and a census cook for an enter the emit just handled (re-running
    // would cleanup + remint the freighters the emit minted moments earlier). Continuous/
    // noTeleport payloads are a different enter and must always run. Minted payloads
    // discriminate by enterEpoch (a frozen simTime can't alias a second real enter). The
    // simTime fallback applies only where the serial machinery doesn't exist — on a minted
    // world an un-minted payload is a synthetic enter that must never be suppressed.
    const _serialNow = this.state.world && this.state.world.enterSerial;
    if (p && p._viaCook && p.sector && p.sector === this._emittedSector
      && (Number.isFinite(this._emittedEpoch)
        ? _serialNow === this._emittedEpoch
        : (!Number.isFinite(_serialNow) && this.state.simTime === this._emittedSimTime))) {
      return;
    }
    if (p && !p._viaCook && p.sector && !(p.continuous || p.noTeleport)
      && ((p.sector === this._cookedSector
          && (Number.isFinite(p.enterEpoch)
            ? p.enterEpoch === this._cookedEnterEpoch
            : (!Number.isFinite(_serialNow) && this.state.simTime === this._cookedSimTime)))
        || (p.sector === this._emittedSector
          && (Number.isFinite(p.enterEpoch)
            ? p.enterEpoch === this._emittedEpoch
            : (!Number.isFinite(_serialNow) && this.state.simTime === this._emittedSimTime))))) {
      return;
    }
    const sector = p && p.sector;
    // Gate the wipe on sector resolution: a payload that passes dedupe but carries no
    // resolvable sector must not destroy active freighters unstamped.
    if (!sector || !this.helpers || !this.helpers.spawnEntity) return;
    const continuous = !!(p && (p.continuous || p.noTeleport));
    const requestedSectorId = sector.id
      || (p && p.sectorId)
      || (this.state.world && this.state.world.currentSectorId)
      || 'unknown';
    const repeatedCeresEntry = requestedSectorId === CERES_ACTIVITY_SECTOR_ID
      && this._active.some((id) => {
        const entity = liveEntity(this.state, id);
        return !!entity && entity.data && entity.data.ceresActivityCast === true;
      });
    if (continuous || repeatedCeresEntry) {
      // Soft handoff: keep still-alive freighters; only top-up ambient for the new membership.
      this._pruneDead();
    } else {
      this._cleanup(); // hard enter: wipe previous sector's freighters (view-gated)
    }
    if (p._viaCook) {
      this._cookedSector = sector;
      this._cookedSimTime = this.state.simTime;
      // The cook runs synchronously inside the emit it cooks for, so the world's serial is
      // already minted for this enter — stamp it so the emit's replay matches by epoch.
      const serial = this.state.world && this.state.world.enterSerial;
      this._cookedEnterEpoch = Number.isFinite(serial) ? serial : null;
    } else {
      this._emittedSector = sector;
      this._emittedSimTime = this.state.simTime;
      this._emittedEpoch = Number.isFinite(p.enterEpoch) ? p.enterEpoch : null;
    }
    const sectorId = sector.id || requestedSectorId;
    this._materializeEndingWorldPresence();
    this._coldburnRey?.materialize();
    if (sectorId === CERES_ACTIVITY_SECTOR_ID) {
      this._retireLegacyCeresTraffic();
      this._materializeCeresActivityCast(sector);
      this._ensureNamedLaneContact(sectorId, sector, this._sectorStations());
      this._applyWorldSiteTrafficHooks(sectorId);
      this._ensureCeresCausalChain('sector_enter');
      // Continuous/noTeleport exit skips chain reset; live links would otherwise fast-forward one
      // phase per tick against a stale phaseEndsAt. Rebase remaining phase windows from now.
      this._rebaseCeresCausalPhaseEnds();
      return;
    }
    this._resetRngForSector(sectorId);
    // CV-DAY: an authored pocket set is a shift already in progress, not an ambient density. Cast
    // it first so the neighbourhood reads as work before the ambient top-up fills around it.
    const authoredPockets = activityPocketsForSector(sectorId);
    if (authoredPockets.length) {
      const charonPrior = sectorId === 'sector_charon_expanse' ? {
        entities: new Set(this.state.entityList),
        records: new Set(Object.keys(this.state.world?.records?.byId || {})),
      } : null;
      this._materializeAuthoredActivityCast(sector, authoredPockets);
      materializeCharonSupply(this, charonPrior);
    }
    // A sector with a registered causal chain arms it once its cast is in the world. A continuous
    // re-entry keeps the live ledger, so its remaining phase windows are rebased from now.
    if (SECTOR_CAUSAL_CHAINS.has(sectorId)) {
      this._ensureCeresCausalChain('sector_enter');
      this._rebaseCeresCausalPhaseEnds();
    }
    // During a save restore the envelope respawn (persistent-spawn chunks + save:loaded's
    // re-adopt) is authoritative for every hull the live-entry production below would mint —
    // anything spawned now is wiped by the restore's clearStale pass anyway. Same precedent as
    // the _maintainClaimConvoys/_maintainClaimDepotTraffic epoch guards.
    if (this._restoreEpochPending) return;
    // Density from trafficPerMin; high-sec cores floor at CORE_MIN_TRAFFIC (spec2/04 core pocket).
    // Explicit trafficPerMin:0 still means "hollow" (frontier silence).
    const count = ambientCountForSector(sector, this.state);
    if (count <= 0) {
      // Hollow rims keep a zero ambient count. A named face, when one is authored, still
      // stamps onto one hull so the sector is not anonymous.
      const faceStations = this._sectorStations();
      if (faceStations.length >= 1) this._ensureNamedLaneContact(sectorId, sector, faceStations);
      return;
    }

    const stations = this._sectorStations();
    if (stations.length < 1) return; // nowhere to haul to

    // Continue / rematerialize: adopt live convoy freighters (world.records) before ambient top-up
    // so we never double freighters after hard enter rematerialized durable traffic.
    this._adoptRematerializedTraffic(sectorId, stations);

    // Continuous or after adopt: only top-up toward the target count.
    const already = (this.state.traffic.freighters || []).length;
    const need = Math.max(0, count - already);
      if (need <= 0) {
        this._ensurePriorityCourierService(sectorId, stations);
        this._ensurePassengerLinerService(sectorId, stations);
        this._ensureNamedLaneContact(sectorId, sector, stations);
      this._applyWorldSiteTrafficHooks(sectorId);
      this._applyClaimTravelHooks(sectorId);
      return;
    }

    const roleWeights = trafficRoleMixForSector(sector, this.state);
    const roles = [];
    for (let i = 0; i < need; i++) roles.push(pickRole(roleWeights, () => this._rng()));
    // Courier reservation runs on the drawn roles before service guarantees: an appended service
    // hull is not a civilian slot the courier may rewrite, and service placement leaves the
    // reserved courier alone.
    const pocketRolesBase = ensurePocketRoleMix(roles, sector);
    const priorityService = priorityCourierServiceForSector(sectorId);
    const priorityCourierSlot = reservePriorityCourierRole(pocketRolesBase, sectorId);
    const pocketRoles = ensureServiceCraftRoles(pocketRolesBase, roleWeights, sector);

    // Pocket anchor: cluster the first freighters near the busiest station so sensor-range
    // density holds for the first-hour Helios play space (not scattered to far yards only).
    const pocketStation = this._pocketStation(stations, sectorId);
    const leftoverDisrupted = this._leftoverDisruptedStationIds();

    for (let i = 0; i < need; i++) {
      const role = pocketRoles[i] || 'hauler';
      const def = TRAFFIC_ROLES[role] || TRAFFIC_ROLES.hauler;
      const priorityCourier = !!priorityService && i === priorityCourierSlot;
      // Slots a service guarantee rewrote anchor to the same pocket as the first wave — a far
      // random berth leaves the ore barge a sector-length flight from the work it exists for.
      const clustered = i < Math.min(4, need) || pocketRoles[i] !== pocketRolesBase[i];
      let station = priorityCourier
        ? (this._stationForPriorityCourier(stations, priorityService.stops[0]) || stations[0])
        : (clustered && pocketStation)
        ? pocketStation
        : (stations[Math.floor(this._rng() * stations.length)] || stations[0]);
      if (!this._leftoverStationOpenForTopUp(station, leftoverDisrupted)) {
        station = stations.find((candidate) => this._leftoverStationOpenForTopUp(candidate, leftoverDisrupted)) || null;
        if (!station) continue;
      }
      // Arrival greeting: the first two hulls anchor on the player's materialized position —
      // the placed arrival point on boot/jump, the live pose on continuous handoff — so the
      // sector opens with traffic in sensor range, not a silent sky over the gate.
      const playerEnt = this.state.playerId != null && this.state.entities
        ? this.state.entities.get(this.state.playerId) : null;
      const arrivalPos = playerEnt && playerEnt.pos;
      const anchor = (i < Math.min(2, need)
        && arrivalPos && sectorMembershipAtGlobal(arrivalPos) === sectorId)
        ? arrivalPos
        : station.pos;
      // spawn near the anchor but offset so they don't overlap it
      const ang = this._rng() * Math.PI * 2;
      const r = clustered
        ? (90 + this._rng() * (POCKET_CLUSTER_R * 0.45))
        : (140 + this._rng() * 120);
      const pos = { x: anchor.x + Math.cos(ang) * r, z: anchor.z + Math.sin(ang) * r };
      const aiSpec = {
        archetype: def.archetype,
        passive: true, // traffic never opens fire on a clean player
      };
      // Lawful patrol presence: WANTED gate is the only path to hostility (scanner/aiPorts).
      if (lawPresenceRole(role)) {
        aiSpec.lawful = true;
        aiSpec.spawnContext = 'patrol';
      } else {
        aiSpec.spawnContext = 'convoy_civilian';
      }
      const controllingFaction = sector.factionId || 'faction_free';
      const spec = makeShipEntitySpec(factionHullFor(def.ship, controllingFaction, () => this._rng()), {
        team: def.team,                    // 2 neutral civilian
        factionId: controllingFaction,
        pos,
        ai: aiSpec,
      });
      this._stageHeliosCutterSpawn(spec, station, sectorId, role);
      const ent = this.helpers.spawnEntity(spec);
      if (!ent) continue;
      this._stampTrafficDurableIdentity(ent, sectorId, role, def, already + i);
      if (ent.data && STATION_CREW_ROLES.includes(role)) ent.data.homeStationId = stationIdentity(station);
      const target = priorityCourier
        ? (this._stationForPriorityCourier(stations, priorityService.stops[1]) || station)
        : def.express
        ? this._pickExpressDestination(stations, station)
        : this._pickStation(stations);
      const manifest = this._assignManifest(ent, role, target, sectorId);
      this._watchSpawnedTraffic(ent);
      this._active.push(ent.id);
      const rec = {
        id: ent.id,
        role,
        targetId: target.id,
        waitT: 0,
        nextTradeT: 2 + i * 1.5, // stagger trades so they don't all hit the market at once
        orbitPhase: this._rng() * Math.PI * 2, // patrols orbit on a per-ship phase
        dockSeq: 0,
        manifest,
      };
      if (priorityCourier) this._stampPriorityCourierService(ent, rec, stations);
      else if (def.express) this._stampExpressRoute(ent, rec, station, target, sectorId, already + i);
      this.state.traffic.freighters.push(rec);
      // World Site service routes reserve one existing ambient slot before the general NPC job
      // producer claims eligible haulers. Later spawns see the existing hook and remain available
      // to their ordinary jobs, so this changes ownership for exactly one deterministic hull.
      this._applyWorldSiteTrafficHooks(sectorId);
      this._applyClaimTravelHooks(sectorId);
      // PQ-014: a miner/hauler/patrol hull naturally receives a deterministic NPC job here. The job
      // (not this ad-hoc stepper) then flies it; the update() dispatch yields for any hull with a
      // jobId. No-op when the runtime is absent (e.g. the sf-sim golden harness) or the route can't
      // be built (no asteroid field / too few stations) — the hull keeps its ambient stepper.
      if (!priorityCourier) this._maybeAssignJob(ent, role, station, target, stations, sectorId);
      // Atomic unit complete: hull minted, identity stamped, record linked, job assigned.
      yield;
    }
    this._ensurePriorityCourierService(sectorId, stations);
    this._ensurePassengerLinerService(sectorId, stations);
    this._ensureNamedLaneContact(sectorId, sector, stations);
    this._applyWorldSiteTrafficHooks(sectorId);
    this._applyClaimTravelHooks(sectorId);
    this._dispatchGeneralSalvors(sectorId);
    this._dispatchYardTugs(sectorId);
  },

  _retireLegacyCeresTraffic() {
    this._ensureState();
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const authoredRecordIds = new Set(CERES_ACTIVITY_CAST.map(({ slot }) => stableRecordId(
      seed,
      CERES_ACTIVITY_SECTOR_ID,
      RECORD_KIND.CONVOY,
      slot.worldRecordSlotId,
    )));
    const worldOwner = this._registry && this._registry.get && this._registry.get('world');
    const records = this.state.world && this.state.world.records && this.state.world.records.byId
      ? this.state.world.records.byId
      : {};
    // Old saves may contain active random Ceres ambient records. Retire only records that truthfully
    // identify themselves as traffic; mission/encounter convoy records without trafficRole remain
    // world-owned. The public world owner writes the terminal state, so traffic never mutates the
    // records bag or invents a kill/economy receipt.
    const retiredRecordIds = new Set();
    for (const [recordId, record] of Object.entries(records)) {
      const home = record && (record.homeSectorId || record.sectorId);
      if (!record || record.kind !== RECORD_KIND.CONVOY || !record.trafficRole
        || ceresWorkfleetHardwareRoleForRecord(record)==='breaker'
        || home !== CERES_ACTIVITY_SECTOR_ID || authoredRecordIds.has(recordId)
        || record.itinerary?.kind === 'claim_depot'
        || record.itinerary?.kind === 'claim_convoy'
        || terminalWorldRecord(record)) continue;
      if (worldOwner && typeof worldOwner.markWorldRecordDestroyed === 'function') {
        worldOwner.markWorldRecordDestroyed(recordId, { outcome: 'destroyed' });
        this._releaseCeresActivityJob(recordId);
        retiredRecordIds.add(recordId);
      }
    }

    const retiredEntityIds = new Set();
    forEachLivingWorldActor(this.state, (entity) => {
      if (!entity.data || !entity.data.trafficRole) return;
      const home = entity.homeSectorId || entity.data.homeSectorId || entity.data.sectorId;
      if (home !== CERES_ACTIVITY_SECTOR_ID
        || !retiredRecordIds.has(entity.data.worldRecordId)) return;
      retiredEntityIds.add(entity.id);
      this._watchExitingTraffic(entity);
      const remove = this.helpers && (this.helpers.removeEntity || this.helpers.despawnEntity);
      if (typeof remove === 'function') remove(entity.id);
      else entity.alive = false;
    });
    if (!retiredEntityIds.size) return;
    this.state.traffic.freighters = this.state.traffic.freighters
      .filter((record) => record && !retiredEntityIds.has(record.id));
    this._active = this._active.filter((id) => !retiredEntityIds.has(id));
  },

  _releaseCeresActivityJob(recordId) {
    if (typeof recordId !== 'string' || !recordId) return false;
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const seamRecordId = stableRecordId(
      seed,
      CERES_ACTIVITY_SECTOR_ID,
      RECORD_KIND.CONVOY,
      CERES_ACTIVITY_CAST_BY_SLOT_ID.get(CERES_SEAM_MINER_SLOT_ID)?.slot.worldRecordSlotId,
    );
    if (recordId === seamRecordId) {
      const missed = missReservedRichSeamOpportunity(this.state, {
        reservedByStableId: recordId,
        reservedByWorldRecordId: recordId,
        reservedByActivityActorSlotId: CERES_SEAM_MINER_SLOT_ID,
        reservedByJobId: `job:${recordId}`,
        simTime: deferredEnterNow(this.state),
      });
      if (missed && this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit('field:richSeamMissed', { ...missed, reason: 'owner_invalidated' });
      }
    }
    const release = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.release;
    return typeof release === 'function' ? release(`job:${recordId}`) === true : false;
  },

  _recommissionCeresRefineryHauler(pair) {
    if (!pair || !pair.entity || !pair.entity.data
      || pair.entity.data.activityActorSlotId !== CERES_REFINERY_HAULER_SLOT_ID) return false;
    const recordId = pair.worldRecordId || pair.entity.data.worldRecordId;
    const entry = CERES_ACTIVITY_CAST_BY_SLOT_ID.get(CERES_REFINERY_HAULER_SLOT_ID);
    if (this._leftoverSlotRefillsDisruptedApproach(entry, this._leftoverDisruptedStationIds())) return false;
    if (typeof recordId !== 'string' || !recordId || !entry) return false;
    this._releaseCeresActivityJob(recordId);
    return !!this._assignCeresActivityJob(pair.entity, entry);
  },

  _adoptLegacyCeresActivityTargetRefs() {
    // R5 saves contain these exact authored routes without targetRef because the old kernel
    // normalizer discarded that optional field. Migrate only the seven stable Ceres job identities
    // and only when the entire old route is byte-shape canonical; never reinterpret ordinary jobs.
    const getJob = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.get;
    if (typeof getJob !== 'function') return 0;
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    let adopted = 0;
    for (const activityEntry of CERES_ACTIVITY_CAST) {
      if (!activityEntry || activityEntry.service) continue;
      const { slot } = activityEntry;
      const worldRecordId = stableRecordId(
        seed,
        CERES_ACTIVITY_SECTOR_ID,
        RECORD_KIND.CONVOY,
        slot.worldRecordSlotId,
      );
      const jobId = `job:${worldRecordId}`;
      const entry = getJob(jobId);
      const job = entry && entry.job;
      const canonical = ceresActivityJobSpec(activityEntry);
      if (!entry || !job || !canonical
        || job.schema !== NPC_JOB_SCHEMA || job.corrupt === true
        || job.id !== jobId || job.kind !== slot.jobKind
        || entry.kind !== slot.jobKind
        || entry.sectorId !== CERES_ACTIVITY_SECTOR_ID
        || entry.worldRecordId !== worldRecordId
        || !Number.isFinite(job.speed) || job.speed !== canonical.speed) continue;
      const legacyTargetRefs = slot.id === CERES_SEAM_MINER_SLOT_ID
        ? ['activity:seam-work-pad', 'field:slot:ceres_seam_ore_clast']
        : null;
      const mode = exactCeresRouteTargetRefMode(job.route, canonical.route, legacyTargetRefs);
      const entity = entityWithWorldRecord(this.state, worldRecordId);
      if (slot.id === CERES_SEAM_MINER_SLOT_ID && entity) {
        this._migrateLegacyCeresOreCarrierManifest(entity);
      }
      if (mode === 'current') continue;
      if (mode !== 'legacy') continue;
      job.route = job.route.map((waypoint, index) => ({
        ...waypoint,
        pos: { ...waypoint.pos },
        targetRef: canonical.route[index].targetRef,
      }));
      adopted++;
    }
    return adopted;
  },

  _migrateLegacyCeresOreCarrierManifest(entity) {
    const current = entity && entity.data && entity.data.cargoManifest;
    if (!current || current.role !== 'miner' || !validCausalManifest(current)
      || typeof current.manifestId !== 'string' || !current.manifestId
      || typeof current.freighterKey !== 'string' || !current.freighterKey) return false;
    const holderId = entity.data.worldRecordId || String(entity.id);
    const migrated = {
      ...current,
      role: 'ore_carrier',
      lotId: typeof current.lotId === 'string' && current.lotId
        ? current.lotId
        : current.manifestId,
      lotSource: current.lotSource && typeof current.lotSource === 'object'
        ? { ...current.lotSource }
        : {
            workId: `legacy-miner-manifest:${current.manifestId}`,
            asteroidId: null,
            fieldId: 'f_ceres_1',
            sectorId: CERES_ACTIVITY_SECTOR_ID,
          },
      custody: current.custody && typeof current.custody === 'object'
        ? { ...current.custody, holderKind: 'traffic', holderId }
        : {
            holderKind: 'traffic',
            holderId,
            acquiredBy: 'mining:npcExtraction',
          },
    };
    entity.data.cargoManifest = migrated;
    const rec = this.state.traffic && Array.isArray(this.state.traffic.freighters)
      ? this.state.traffic.freighters.find((candidate) => candidate && candidate.id === entity.id)
      : null;
    if (rec) rec.manifest = migrated;
    return true;
  },

  _assignCeresActivityJob(entity, entry) {
    if (!entity || entity.alive === false || !entity.data || !entry || entry.service) return null;
    const spec = ceresActivityJobSpec(entry);
    const assign = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.assign;
    if (!spec || typeof assign !== 'function') return null;
    if (entry.slot.jobKind === 'hauler') {
      // A one-shot hauler is recommissioned under the same stable job id, so the kernel sequence
      // restarts. Capture the durable dock/run generation in the job payload: a replay of the old
      // completion remains distinguishable after the traffic record advances to the next run.
      const runSeq = Number.isSafeInteger(entity.data.freightDockSeq) && entity.data.freightDockSeq >= 0
        ? entity.data.freightDockSeq
        : 0;
      entity.data.freightDockSeq = runSeq;
      spec.payload = { activityRunSeq: runSeq };
      if (entry.slot.id === CERES_REFINERY_HAULER_SLOT_ID) {
        const rec = this.state.traffic && Array.isArray(this.state.traffic.freighters)
          ? this.state.traffic.freighters.find((candidate) => candidate && candidate.id === entity.id)
          : null;
        let manifest = entity.data.cargoManifest;
        // The dedicated refinery hauler is empty until the seam hands it a real mined lot. It must
        // never regenerate an unrelated market manifest between the request and the refinery sink.
        if (!validCausalManifest(manifest) || !(manifest.custody && manifest.custody.handoffId)) {
          manifest = this._buildMinerManifest(entity, runSeq, null, 0, 'hauler');
          this._setTrafficManifest(entity, rec, manifest);
        }
        if (validCausalManifest(manifest)) {
          spec.payload.manifest = manifest;
          spec.payload.handoffId = manifest.custody && manifest.custody.handoffId || null;
        }
      }
      if (entry.slot.id === CERES_AMBUSH_HAULER_SLOT_ID) {
        const rec = this.state.traffic && Array.isArray(this.state.traffic.freighters)
          ? this.state.traffic.freighters.find((candidate) => candidate && candidate.id === entity.id)
          : null;
        this._ensureAmbushLoadedHaulerManifest(entity, rec);
      }
    }
    if (entry.slot.id === CERES_SEAM_MINER_SLOT_ID
      && entry.slot.presentationRole === 'ore_carrier') {
      // New or recommissioned Ore Barges leave the refinery empty. A non-empty manifest restored
      // from the durable entity is the in-flight lot and must never be replaced on Continue.
      this._migrateLegacyCeresOreCarrierManifest(entity);
      const current = entity.data.cargoManifest;
      if (!current || !Array.isArray(current.lines)) {
        entity.data.cargoManifest = this._buildMinerManifest(
          entity,
          0,
          null,
          0,
          'ore_carrier',
        );
      }
    }
    return assign(entity, spec);
  },

  _ensureAmbushLoadedHaulerManifest(entity, rec) {
    if (!entity || entity.alive === false || !entity.data) return false;
    if (entity.data.activityActorSlotId !== CERES_AMBUSH_HAULER_SLOT_ID) return false;
    const current = entity.data.cargoManifest || (rec && rec.manifest) || null;
    if (validCausalManifest(current)) {
      if (entity.data.cargoManifest !== current) this._setTrafficManifest(entity, rec, current);
      return true;
    }
    const runSeq = Number.isSafeInteger(entity.data.freightDockSeq) && entity.data.freightDockSeq >= 0
      ? entity.data.freightDockSeq
      : 0;
    const manifest = this._buildMinerManifest(
      entity,
      runSeq,
      AMBUSH_LOADED_HAULER_COMMODITY_ID,
      AMBUSH_LOADED_HAULER_QTY,
      'hauler',
    );
    if (!validCausalManifest(manifest)) return false;
    this._setTrafficManifest(entity, rec, manifest);
    return true;
  },

  _materializeCeresActivityCast(sector) {
    this._ensureState();
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const records = this.state.world && this.state.world.records && this.state.world.records.byId
      ? this.state.world.records.byId
      : {};
    const prior = this.state.traffic.freighters || [];
    const authored = [];
    const authoredSlotIds = new Set(CERES_ACTIVITY_CAST.map(({ slot }) => slot.id));
    const leftoverDisrupted = this._leftoverDisruptedStationIds();

    for (const entry of CERES_ACTIVITY_CAST) {
      const { pocket, slot, service } = entry;
      const recordId = stableRecordId(
        seed,
        CERES_ACTIVITY_SECTOR_ID,
        RECORD_KIND.CONVOY,
        slot.worldRecordSlotId,
      );
      let entity = entityWithWorldRecord(this.state, recordId);
      // Decide refill before durable-record exits: after a live kill world already owns a
      // destroyed convoy record, so the fresh-spawn branch below is never reached. Keep adopting
      // living hulls; disruption prevents replacements, not ships already on the approach.
      if (this._leftoverSlotRefillsDisruptedApproach(entry, leftoverDisrupted) && !entity) {
        this._releaseCeresActivityJob(recordId);
        continue;
      }
      const record = records[recordId] || null;
      if (terminalWorldRecord(record)) {
        this._releaseCeresActivityJob(recordId);
        continue;
      }

      // An active durable record without a live body belongs to world residency. Never additive-
      // spawn over it; the world owner will rematerialize it when this sector reaches FULL.
      if (record && !entity) continue;

      const role = slot.presentationRole || 'hauler';
      const def = TRAFFIC_ROLES[role] || TRAFFIC_ROLES.hauler;
      const localPos = service
        ? null
        : {
            x: pocket.activityAnchor.localPos.x + slot.spawnOffset.x,
            z: pocket.activityAnchor.localPos.z + slot.spawnOffset.z,
          };
      const pos = service
        ? { x: CINDER_SLUICE_TRAFFIC_STAGING_POS.x, z: CINDER_SLUICE_TRAFFIC_STAGING_POS.z }
        : sectorLocalToGlobalForSector(localPos, CERES_ACTIVITY_SECTOR_ID);
      const lawful = slot.lawful === true || lawPresenceRole(role);
      const authoredLawResponseWasp = CERES_LAW_RESPONSE_SLOT_IDS.has(slot.id);
      const aiSpec = {
        archetype: def.archetype,
        passive: slot.passive !== false,
        spawnContext: lawful ? 'patrol' : 'convoy_civilian',
        ...(lawful ? { lawful: true } : {}),
        ...(authoredLawResponseWasp
          ? { combatDoctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY }
          : {}),
      };
      const canonicalSpec = makeShipEntitySpec(def.ship, {
        team: def.team,
        factionId: (sector && sector.factionId) || 'faction_free',
        pos,
        ai: aiSpec,
        ...(authoredLawResponseWasp ? { fittings: CERES_LAW_RESPONSE_WASP_FITTINGS } : {}),
      });
      canonicalSpec.homeSectorId = CERES_ACTIVITY_SECTOR_ID;

      const wasFresh = !entity;
      if (wasFresh) entity = this.helpers.spawnEntity(canonicalSpec);
      if (!entity) continue;
      if (wasFresh) {
        // spawnEntity(makeShipEntitySpec(...)) already installed the canonical static, derived,
        // fitting, weapon, combat, AI, cap, and boost graph. Recopying that entire fresh graph made
        // first Ceres entry pay the restore/repair path twice; fresh bodies need only durable identity.
        this._stampCeresActivityEntity(entity, canonicalSpec.data, entry, recordId);
      } else {
        this._rehydrateCeresActivityEntity(entity, canonicalSpec, entry, recordId);
      }
      if (!service) this._assignCeresActivityJob(entity, entry);

      let trafficRecord = prior.find((candidate) => candidate && candidate.id === entity.id);
      if (!trafficRecord) trafficRecord = {};
      trafficRecord.id = entity.id;
      trafficRecord.role = role;
      trafficRecord.targetId = null;
      trafficRecord.waitT = Number.isFinite(trafficRecord.waitT) ? trafficRecord.waitT : 0;
      trafficRecord.nextTradeT = Number.POSITIVE_INFINITY;
      trafficRecord.orbitPhase = Number.isFinite(trafficRecord.orbitPhase) ? trafficRecord.orbitPhase : 0;
      trafficRecord.dockSeq = Number.isFinite(entity.data && entity.data.freightDockSeq)
        ? entity.data.freightDockSeq | 0
        : (trafficRecord.dockSeq | 0);
      trafficRecord.manifest = entity.data && entity.data.cargoManifest || trafficRecord.manifest || null;
      trafficRecord.activityActorSlotId = slot.id;
      trafficRecord.ceresActivityCast = true;
      trafficRecord.ceresActivityJobOwned = !service;
      trafficRecord.worldRecordId = recordId;
      authored.push(trafficRecord);
    }

    const legacy = prior.filter((record) => {
      const entity = record && liveEntity(this.state, record.id);
      const slotId = (record && record.activityActorSlotId)
        || (entity && entity.data && entity.data.activityActorSlotId);
      return !authoredSlotIds.has(slotId);
    });
    this.state.traffic.freighters = [...legacy, ...authored];
    const liveIds = this.state.traffic.freighters
      .map((record) => record && record.id)
      .filter((id) => liveEntity(this.state, id));
    this._active = [...new Set(this._retainLiveOwnedIds(liveIds))];
  },

  _rehydrateCeresActivityEntity(entity, canonicalSpec, entry, recordId) {
    const data = entity.data || (entity.data = {});
    const canonicalData = canonicalSpec.data || {};
    const staticFields = [
      'type', 'factionId', 'team', 'radius', 'mass', 'flightClass', 'flightModel', 'propulsion',
      'armorFlat', 'shieldRegenRate', 'shieldRegenDelay', 'capMax', 'capRegen',
      'thrust', 'turnRate', 'maxSpeed', 'drag',
    ];
    for (const field of staticFields) {
      const value = canonicalSpec[field];
      entity[field] = value && typeof value === 'object' ? { ...value } : value;
    }
    entity.cap = Number.isFinite(entity.cap)
      ? Math.max(0, Math.min(canonicalSpec.capMax, entity.cap))
      : canonicalSpec.cap;
    if (!entity.boost || typeof entity.boost !== 'object') {
      entity.boost = { ...canonicalSpec.boost };
    } else {
      const energy = Number.isFinite(entity.boost.energy) ? entity.boost.energy : canonicalSpec.boost.energy;
      const dashCdT = Number.isFinite(entity.boost.dashCdT) ? entity.boost.dashCdT : 0;
      entity.boost = {
        ...canonicalSpec.boost,
        energy: Math.max(0, Math.min(canonicalSpec.boost.max, energy)),
        dashCdT: Math.max(0, Math.min(canonicalSpec.boost.dashCd, dashCdT)),
      };
    }
    for (const field of ['defId', 'derived', 'miningBeam', 'fittings', 'appearance', 'livingHull']) {
      const value = canonicalData[field];
      if (Array.isArray(value)) data[field] = value.slice();
      else if (value && typeof value === 'object') data[field] = { ...value };
      else data[field] = value;
    }
    const canonicalWeapons = Array.isArray(canonicalData.weapons) ? canonicalData.weapons : [];
    const sameLoadout = Array.isArray(data.weapons)
      && data.weapons.length === canonicalWeapons.length
      && canonicalWeapons.every((weapon, index) => data.weapons[index]
        && data.weapons[index].defId === weapon.defId
        && data.weapons[index].slotIndex === weapon.slotIndex);
    data.weapons = canonicalWeapons.map((weapon, index) => {
      if (!sameLoadout) return { ...weapon };
      const current = data.weapons[index];
      return {
        ...weapon,
        _cooldown: Number.isFinite(current._cooldown) ? Math.max(0, current._cooldown) : 0,
        _heat: Number.isFinite(current._heat)
          ? Math.max(0, Math.min(weapon.heatMax, current._heat))
          : 0,
      };
    });
    if (!data.combat) data.combat = { ...canonicalData.combat };
    data.ai = { ...(data.ai || {}), ...(canonicalData.ai || {}) };
    this._stampCeresActivityEntity(entity, canonicalData, entry, recordId);
  },

  _stampCeresActivityEntity(entity, canonicalData, entry, recordId) {
    const data = entity.data || (entity.data = {});
    data.factionId = canonicalData.factionId;
    data.team = canonicalData.team;
    data.trafficRole = entry.slot.presentationRole || 'hauler';
    data.trafficLabel = (TRAFFIC_ROLES[data.trafficRole] || TRAFFIC_ROLES.hauler).label;
    data.role = data.trafficRole;
    data.worldRecordId = recordId;
    data.identityKey = entry.slot.worldRecordSlotId;
    data.durable = true;
    if (!Number.isFinite(data.recordCreatedTick)) data.recordCreatedTick = deferredEnterTick(this.state) | 0;
    data.activityActorSlotId = entry.slot.id;
    data.ceresActivityCast = true;
    data.ceresActivityJobOwned = !entry.service;
    if (!entry.service) data.intent = null;
    entity.homeSectorId = CERES_ACTIVITY_SECTOR_ID;
    data.homeSectorId = CERES_ACTIVITY_SECTOR_ID;
    data.sectorId = CERES_ACTIVITY_SECTOR_ID;
    this._indexWorldRecordId(entity);
    syncEntityActivitySlotMembership(this.state && this.state.entityIndex, entity);
    syncEntitySectorMembership(this.state && this.state.entityIndex, entity);
  },

  _captureCeresActivityCast() {
    const worldOwner = this._registry && this._registry.get && this._registry.get('world');
    if (!worldOwner || typeof worldOwner.upsertWorldRecord !== 'function') return 0;
    let captured = 0;
    for (const record of this.state.traffic && this.state.traffic.freighters || []) {
      const entity = record && liveEntity(this.state, record.id);
      if (!entity || !entity.data) continue;
      if (entity.data.ceresActivityCast !== true && entity.data.authoredActivityCast !== true) continue;
      if (worldOwner.upsertWorldRecord(entity)) captured += 1;
    }
    return captured;
  },

  /**
   * CV-DAY: authored activity pockets for a sector other than Ceres. Same descriptor-to-body
   * translation the Ceres cast uses - authored spawn inside the pocket's immediate band, durable
   * identity under the sector's own slot namespace, and an npcJobs route built from the pocket's
   * measured marks - minus Ceres's causal choreography, which is Ceres's fiction and not the rule.
   * The chain is present with no accept: you arrive and the shift is already under way.
   */
  _materializeAuthoredActivityCast(sector, pockets) {
    if (!sector || !Array.isArray(pockets) || pockets.length === 0) return 0;
    if (!this.helpers || !this.helpers.spawnEntity) return 0;
    // The authored shift is durable world content: every slot mints a stable worldRecordId and is
    // custodied by the registry's world/jobs owners across sector residency. A detached fork has
    // no composed runtime to custody it — minting the shift there would additive-spawn a second
    // full roster over the ambient records the fork is testing, and durable hulls no owner could
    // capture. Ambient fill owns the enter in that context.
    if (!this._registry) return 0;
    this._ensureState();
    const sectorId = sector.id;
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const prior = this.state.traffic.freighters || [];
    const records = this.state.world && this.state.world.records && this.state.world.records.byId
      ? this.state.world.records.byId
      : {};
    const authored = [];
    const authoredSlotIds = new Set();
    let spawned = 0;

    for (const pocketEntry of pockets) {
      for (const slot of pocketEntry.actorSlots) {
        authoredSlotIds.add(slot.id);
        const entry = { pocket: pocketEntry, slot, service: false };
        const recordId = stableRecordId(
          seed,
          sectorId,
          RECORD_KIND.CONVOY,
          slot.worldRecordSlotId,
        );
        let entity = entityWithWorldRecord(this.state, recordId);
        const record = records[recordId] || null;
        if (terminalWorldRecord(record)) continue;
        // An active durable record without a live body belongs to world residency. Never
        // additive-spawn over it; the world owner rematerializes it when the sector reaches FULL.
        if (record && !entity) continue;

        const role = slot.presentationRole || 'hauler';
        const def = TRAFFIC_ROLES[role] || TRAFFIC_ROLES.hauler;
        const localPos = {
          x: pocketEntry.activityAnchor.localPos.x + slot.spawnOffset.x,
          z: pocketEntry.activityAnchor.localPos.z + slot.spawnOffset.z,
        };
        const pos = sectorLocalToGlobalForSector(localPos, sectorId);
        if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) continue;
        const lawful = slot.lawful === true || lawPresenceRole(role);
        const aiSpec = {
          archetype: def.archetype,
          passive: slot.passive !== false,
          spawnContext: lawful ? 'patrol' : 'convoy_civilian',
          ...(lawful ? { lawful: true } : {}),
        };
        const canonicalSpec = makeShipEntitySpec(def.ship, {
          team: def.team,
          // An authored allegiance (a Concord picket in Free Frontier space) beats the sector's colours.
          factionId: slot.factionId || (sector && sector.factionId) || 'faction_free',
          pos,
          ai: aiSpec,
        });
        canonicalSpec.homeSectorId = sectorId;

        const wasFresh = !entity;
        if (wasFresh) entity = this.helpers.spawnEntity(canonicalSpec);
        if (!entity) continue;
        if (wasFresh) spawned += 1;
        if (!ownsWinnowRecoveryHull(this.state, entity) && !ownsCharonSupplyHull(this.state, entity)) {
          this._stampAuthoredActivityEntity(entity, canonicalSpec.data, entry, sectorId, recordId);
          this._assignActivityJob(entity, entry);
        }

        let trafficRecord = prior.find((candidate) => candidate && candidate.id === entity.id);
        if (!trafficRecord) trafficRecord = {};
        trafficRecord.id = entity.id;
        trafficRecord.role = role;
        trafficRecord.targetId = null;
        trafficRecord.waitT = Number.isFinite(trafficRecord.waitT) ? trafficRecord.waitT : 0;
        trafficRecord.nextTradeT = Number.POSITIVE_INFINITY;
        trafficRecord.orbitPhase = Number.isFinite(trafficRecord.orbitPhase) ? trafficRecord.orbitPhase : 0;
        trafficRecord.dockSeq = Number.isFinite(entity.data && entity.data.freightDockSeq)
          ? entity.data.freightDockSeq | 0
          : (trafficRecord.dockSeq | 0);
        trafficRecord.manifest = (entity.data && entity.data.cargoManifest) || trafficRecord.manifest || null;
        trafficRecord.activityActorSlotId = slot.id;
        trafficRecord.authoredActivityCast = true;
        trafficRecord.worldRecordId = recordId;
        authored.push(trafficRecord);
      }
    }

    // Keep the ambient population the authored cast displaced: anything not one of our slots stays.
    const legacy = prior.filter((record) => {
      const entity = record && liveEntity(this.state, record.id);
      const slotId = (record && record.activityActorSlotId)
        || (entity && entity.data && entity.data.activityActorSlotId);
      return !authoredSlotIds.has(slotId);
    });
    this.state.traffic.freighters = [...legacy, ...authored];
    const liveIds = this.state.traffic.freighters
      .map((record) => record && record.id)
      .filter((id) => liveEntity(this.state, id));
    this._active = [...new Set(this._retainLiveOwnedIds(liveIds))];
    return spawned;
  },

  _stampAuthoredActivityEntity(entity, canonicalData, entry, sectorId, recordId) {
    const data = entity.data || (entity.data = {});
    data.factionId = canonicalData.factionId;
    // A restored hull still wearing an old record's sector colours is re-stamped to its authored allegiance.
    if (entry.slot.factionId) entity.factionId = entry.slot.factionId;
    data.team = canonicalData.team;
    data.trafficRole = entry.slot.presentationRole || 'hauler';
    data.trafficLabel = (TRAFFIC_ROLES[data.trafficRole] || TRAFFIC_ROLES.hauler).label;
    data.role = data.trafficRole;
    data.worldRecordId = recordId;
    data.identityKey = entry.slot.worldRecordSlotId;
    data.durable = true;
    if (!Number.isFinite(data.recordCreatedTick)) data.recordCreatedTick = deferredEnterTick(this.state) | 0;
    data.activityActorSlotId = entry.slot.id;
    data.authoredActivityCast = true;
    data.authoredActivityJobOwned = true;
    data.intent = null;
    entity.homeSectorId = sectorId;
    data.homeSectorId = sectorId;
    data.sectorId = sectorId;
    this._indexWorldRecordId(entity);
    syncEntityActivitySlotMembership(this.state && this.state.entityIndex, entity);
    syncEntitySectorMembership(this.state && this.state.entityIndex, entity);
  },

  _assignActivityJob(entity, entry) {
    if (ownsWinnowRecoveryHull(this.state, entity) || ownsCharonSupplyHull(this.state, entity)) return null;
    if (!entity || entity.alive === false || !entity.data || !entry || entry.service) return null;
    const spec = activityJobSpec(entry);
    const assign = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.assign;
    if (!spec || typeof assign !== 'function') return null;
    return assign(entity, spec);
  },

  _captureSourceBoundGeneralSalvors() {
    const worldOwner = this._registry && this._registry.get && this._registry.get('world');
    if (!worldOwner || typeof worldOwner.upsertWorldRecord !== 'function') return 0;
    const getJob = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.get;
    let captured = 0;
    for (const record of this.state.traffic && this.state.traffic.freighters || []) {
      const entity = record && liveEntity(this.state, record.id);
      if (!this._isGeneralSalvorEntity(entity)) continue;
      const data = entity.data || {};
      const worldRecordId = data.worldRecordId;
      const jobId = data.jobId || (worldRecordId ? `job:${worldRecordId}` : null);
      const entry = jobId && typeof getJob === 'function' ? getJob(jobId) : null;
      const manifest = data.cargoManifest;
      const sourceKey = typeof data.salvageSource === 'string' && data.salvageSource
        || (manifest && typeof manifest.salvageSource === 'string' && manifest.salvageSource)
        || (entry && entry.job && entry.job.payload
          && typeof entry.job.payload.salvageSource === 'string' && entry.job.payload.salvageSource)
        || null;
      if (!sourceKey) continue;
      if (worldOwner.upsertWorldRecord(entity)) captured += 1;
    }
    return captured;
  },

  _applyWorldSiteTrafficHooks(sectorId) {
    if (!sectorId) return 0;
    const owner = this._registry && this._registry.get && this._registry.get('asteroidSites');
    if (!owner || typeof owner.worldSiteTrafficHooks !== 'function') return 0;
    const hooks = owner.worldSiteTrafficHooks(sectorId);
    if (!hooks.length) return 0;
    this._ensureState();
    let assigned = 0;
    for (const hook of hooks) {
      if (sectorId === CERES_ACTIVITY_SECTOR_ID && hook.id === CERES_CINDER_HOOK_ID) {
        assigned += this._applyCeresServiceHook(hook);
        continue;
      }
      const rootWorldRecordId = `${hook.siteId}/root`;
      const root = entityWithWorldRecord(this.state, rootWorldRecordId);
      const station = this._sectorStations().find((candidate) => stationIdentity(candidate) === hook.stationId);
      if (!root || !station) continue;
      const existing = this.state.traffic.freighters.find((rec) => rec && rec.worldSiteRoute
        && rec.worldSiteRoute.hookId === hook.id
        && liveEntity(this.state, rec.id));
      if (existing) continue;
      const eligibleRoles = new Set(hook.eligibleRoles || []);
      const available = this.state.traffic.freighters
        .map((rec) => ({ rec, entity: liveEntity(this.state, rec && rec.id) }))
        .filter(({ rec, entity }) => rec && entity
          && !(entity.data && (entity.data.jobId
            || entity.data.namedLaneContactId
            || entity.data.worldSiteTrafficHookId
            || entity.data.claimTravelTrafficHookId
            // An authored activity slot (pocket cast, starter shift) already owns its hull —
            // same exclusion convention as industryHaulerEligible.
            || entity.data.activityActorSlotId
            || entity.data.ceresActivityCast === true
            || entity.data.authoredActivityCast === true)))
        .sort((a, b) => stableTrafficKey(a.entity).localeCompare(stableTrafficKey(b.entity)));
      // World-record rematerialization preserves the durable entity tag but rebuilds the transient
      // traffic record. Rebind that same ambient slot before looking for a new one; otherwise the
      // preserved tag excludes its owner from candidates and the authored route silently vanishes
      // after a leave/return or Continue.
      const marked = this.state.traffic.freighters
        .map((rec) => ({ rec, entity: liveEntity(this.state, rec && rec.id) }))
        .filter(({ rec, entity }) => rec && entity
          && entity.data && entity.data.worldSiteTrafficHookId === hook.id
          && (eligibleRoles.has(rec.role) || isWorldSiteTrafficFallbackRole(rec.role))
          && !entity.data.jobId)
        .sort((a, b) => stableTrafficKey(a.entity).localeCompare(stableTrafficKey(b.entity)))[0];
      const preferred = available.find(({ rec }) => eligibleRoles.has(rec.role));
      // Seeded ambient mixes can legitimately contain no authored preferred role (for example,
      // a high-security pocket of escorts, patrols, a working miner, and an express liner). Keep
      // the population cap honest: reserve one idle civilian hull already in the pocket rather
      // than spawning a ninth ship or silently dropping the service. Combat-pattern roles remain
      // unavailable so the fallback cannot steal a patrol, escort, or raider from its owner.
      const fallback = available.find(({ rec }) => isWorldSiteTrafficFallbackRole(rec.role));
      const chosen = marked || preferred || fallback;
      if (!chosen) continue;
      chosen.rec.worldSiteRoute = {
        hookId: hook.id,
        siteId: hook.siteId,
        stationId: hook.stationId,
        siteWorldRecordId: rootWorldRecordId,
        endpoint: 'site',
        label: hook.label,
        hazardPolicy: hook.hazardPolicy || null,
        stagingPos: hook.stagingPos && Number.isFinite(hook.stagingPos.x) && Number.isFinite(hook.stagingPos.z)
          ? { x: hook.stagingPos.x, z: hook.stagingPos.z }
          : null,
      };
      chosen.rec.targetId = root.id;
      const data = chosen.entity.data || (chosen.entity.data = {});
      data.worldSiteTrafficHookId = hook.id;
      data.trafficLabel = hook.label || data.trafficLabel;
      assigned += 1;
    }
    return assigned;
  },

  _applyCeresServiceHook(hook) {
    const rootWorldRecordId = `${hook.siteId}/root`;
    const root = entityWithWorldRecord(this.state, rootWorldRecordId);
    const station = this._sectorStations().find((candidate) => stationIdentity(candidate) === hook.stationId);
    const serviceSlot = CERES_ACTIVITY_SERVICE_SLOTS[0];
    const serviceRecordId = stableRecordId(
      (this.state.meta && this.state.meta.seed) || 1,
      CERES_ACTIVITY_SECTOR_ID,
      RECORD_KIND.CONVOY,
      serviceSlot.worldRecordSlotId,
    );
    let chosen = null;
    for (const record of this.state.traffic.freighters) {
      if (!record) continue;
      const entity = liveEntity(this.state, record.id);
      const isService = !!entity && entity.data
        && entity.data.worldRecordId === serviceRecordId
        && entity.data.activityActorSlotId === serviceSlot.id;
      if (isService) {
        chosen = { rec: record, entity };
        continue;
      }
      // R5 cast identity replaces the former random Ceres fallback. Clear only this exact hook;
      // other sectors and other infrastructure routes keep their existing reassignment policy.
      if (record.worldSiteRoute && record.worldSiteRoute.hookId === hook.id) delete record.worldSiteRoute;
      if (entity && entity.data && entity.data.worldSiteTrafficHookId === hook.id) {
        delete entity.data.worldSiteTrafficHookId;
      }
    }
    if (!chosen || !root || !station) return 0;
    if (chosen.rec.worldSiteRoute && chosen.rec.worldSiteRoute.hookId === hook.id) return 0;
    chosen.rec.worldSiteRoute = {
      hookId: hook.id,
      siteId: hook.siteId,
      stationId: hook.stationId,
      siteWorldRecordId: rootWorldRecordId,
      endpoint: 'site',
      label: hook.label,
      hazardPolicy: hook.hazardPolicy || null,
      stagingPos: hook.stagingPos && Number.isFinite(hook.stagingPos.x) && Number.isFinite(hook.stagingPos.z)
        ? { x: hook.stagingPos.x, z: hook.stagingPos.z }
        : null,
    };
    chosen.rec.targetId = root.id;
    chosen.entity.data.worldSiteTrafficHookId = hook.id;
    chosen.entity.data.trafficLabel = hook.label || chosen.entity.data.trafficLabel;
    return 1;
  },

  _applyClaimTravelHooks(sectorId) {
    if (!sectorId) return 0;
    const owner = this._registry && this._registry.get && this._registry.get('claims');
    const hooks = owner && typeof owner.travelInfrastructureHooks === 'function'
      ? owner.travelInfrastructureHooks(sectorId)
      : [];
    this._ensureState();
    const activeIds = new Set(hooks.map((hook) => hook.id));
    for (const rec of this.state.traffic.freighters) {
      if (!rec || !rec.claimTravelRoute || activeIds.has(rec.claimTravelRoute.hookId)) continue;
      const entity = liveEntity(this.state, rec.id);
      if (entity && entity.data) {
        delete entity.data.claimTravelTrafficHookId;
        if (entity.data.trafficLabel === rec.claimTravelRoute.label) delete entity.data.trafficLabel;
      }
      delete rec.claimTravelRoute;
    }
    if (!hooks.length) return 0;
    let assigned = 0;
    const stations = this._sectorStations();
    for (const hook of hooks) {
      const station = stations.find((candidate) => stationIdentity(candidate) === hook.stationId);
      if (!station || !hook.slingPos) continue;
      const existing = this.state.traffic.freighters.find((rec) => rec && rec.claimTravelRoute
        && rec.claimTravelRoute.hookId === hook.id
        && liveEntity(this.state, rec.id));
      if (existing) continue;
      const eligibleRoles = new Set(hook.eligibleRoles || []);
      const available = this.state.traffic.freighters
        .map((rec) => ({ rec, entity: liveEntity(this.state, rec && rec.id) }))
        .filter(({ rec, entity }) => rec && entity
          && !(entity.data && (entity.data.jobId
            || entity.data.namedLaneContactId
            || entity.data.worldSiteTrafficHookId
            || entity.data.claimTravelTrafficHookId
            || entity.data.activityActorSlotId
            || entity.data.ceresActivityCast === true
            || entity.data.authoredActivityCast === true)))
        .sort((a, b) => stableTrafficKey(a.entity).localeCompare(stableTrafficKey(b.entity)));
      const marked = this.state.traffic.freighters
        .map((rec) => ({ rec, entity: liveEntity(this.state, rec && rec.id) }))
        .filter(({ rec, entity }) => rec && entity
          && entity.data && entity.data.claimTravelTrafficHookId === hook.id
          && (eligibleRoles.has(rec.role) || isWorldSiteTrafficFallbackRole(rec.role))
          && !entity.data.jobId)
        .sort((a, b) => stableTrafficKey(a.entity).localeCompare(stableTrafficKey(b.entity)))[0];
      const preferred = available.find(({ rec }) => eligibleRoles.has(rec.role));
      const fallback = available.find(({ rec }) => isWorldSiteTrafficFallbackRole(rec.role));
      const chosen = marked || preferred || fallback;
      if (!chosen) continue;
      chosen.rec.claimTravelRoute = {
        hookId: hook.id,
        stationId: hook.stationId,
        slingPos: { x: hook.slingPos.x, z: hook.slingPos.z },
        endpoint: 'sling',
        label: hook.label,
      };
      chosen.rec.targetId = null;
      const data = chosen.entity.data || (chosen.entity.data = {});
      data.claimTravelTrafficHookId = hook.id;
      data.trafficLabel = hook.label || data.trafficLabel;
      assigned += 1;
    }
    return assigned;
  },



  // PQ-143.02 one-off fixture: stamp the Cinder Run Courier onto a live express freighter in the
  // start sector, or spawn her dedicated hull near Helios Station when none exists. Deterministic
  // by construction (idempotent per live slot) — her presence never depends on the seed hash, and
  // other sectors' pick pools are untouched.
  _ensureCinderRunCourierFixture(sectorId, sector, stations, list) {
    if (sectorId !== 'sector_helios_prime') return;
    const contact = NAMED_LANE_CONTACTS.find((c) => c.id === CINDER_RUN_COURIER_CONTACT_ID);
    if (!contact) return;
    for (const rec of list) {
      const entity = liveEntity(this.state, rec.id);
      if (entity && entity.data && entity.data.namedLaneContactId === contact.id) return;
    }
    let rec = list.find((r) => r.role === contact.role) || null;
    let ent = rec && this.state.entities.get(rec.id);
    if (!ent || !ent.alive) {
      if (!this.helpers || !this.helpers.spawnEntity || !stations || !stations.length) return;
      const role = contact.role || 'express';
      const def = TRAFFIC_ROLES[role] || TRAFFIC_ROLES.courier;
      const station = this._pocketStation(stations, sectorId) || stations[0];
      const ang = this._rng() * Math.PI * 2;
      const r = 110 + this._rng() * 80;
      let pos = { x: station.pos.x + Math.cos(ang) * r, z: station.pos.z + Math.sin(ang) * r };
      // The Helios pocket sits just outside the entry bubble. An inward roll on this ring
      // lands inside it, so the boot far-actor sweep never shelves the authored courier.
      // Keep the RNG draws (the ambient stream stays put) and, only when that roll is
      // inside the bubble, put her on the far side of the station.
      const player = this.state.entities && this.state.entities.get(this.state.playerId);
      if (player && player.pos && station.pos) {
        const exit = physicsReachWuFromState(this.state, player) + NEAR_EXIT_PAD_WU;
        const dx = pos.x - player.pos.x;
        const dz = pos.z - player.pos.z;
        if (dx * dx + dz * dz <= exit * exit) {
          const ox = station.pos.x - player.pos.x;
          const oz = station.pos.z - player.pos.z;
          const olen = Math.hypot(ox, oz) || 1;
          pos = {
            x: station.pos.x + (ox / olen) * r,
            z: station.pos.z + (oz / olen) * r,
          };
        }
      }
      const aiSpec = {
        archetype: def.archetype,
        passive: true,
        spawnContext: 'convoy_civilian',
      };
      const laneFaction = (sector && sector.factionId) || 'faction_free';
      const spec = makeShipEntitySpec(
        contact.ship || factionHullFor(def.ship, laneFaction, () => this._rng()),
        { team: def.team, factionId: laneFaction, pos, ai: aiSpec },
      );
      ent = this.helpers.spawnEntity(spec);
      if (!ent) return;
      this._stampTrafficDurableIdentity(ent, sectorId, role, def, list.length);
      const target = (role === 'express' || def.express)
        ? this._pickExpressDestination(stations, station)
        : this._pickStation(stations);
      const manifest = this._assignManifest(ent, role, target, sectorId);
      this._watchSpawnedTraffic(ent);
      this._active.push(ent.id);
      rec = {
        id: ent.id,
        role,
        targetId: target.id,
        waitT: 0,
        nextTradeT: 3,
        orbitPhase: this._rng() * Math.PI * 2,
        dockSeq: 0,
        manifest,
      };
      if (role === 'express' || def.express) {
        this._stampExpressRoute(ent, rec, station, target, sectorId, list.length);
      }
      list.push(rec);
    }
    this._stampNamedLaneContact(ent, contact);
  },

  // PQ-193.07: one Helios Arclight on the start sector so the player can find the rare heavy.
  // Own traffic role and body. Never remaps hauler/Span or Atlas. Position is hash-stable so
  // this fixture does not consume the ambient traffic RNG stream.
  _ensureHeliosArclightFixture(sectorId, sector, stations, list) {
    if (sectorId !== 'sector_helios_prime') return;
    const def = TRAFFIC_ROLES.arclight;
    if (!def) return;
    for (const rec of list) {
      if (rec && rec.role === 'arclight') return;
      const entity = liveEntity(this.state, rec && rec.id);
      if (entity && entity.data && entity.data.trafficRole === 'arclight') return;
    }
    if (!this.helpers || !this.helpers.spawnEntity || !stations || !stations.length) return;
    const station = this._pocketStation(stations, sectorId) || stations[0];
    if (!station || !station.pos) return;
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const ang = ((hash32(seed, 'helios_arclight_spawn', sectorId) >>> 0) / 0xffffffff) * Math.PI * 2;
    const r = 168;
    const pos = { x: station.pos.x + Math.cos(ang) * r, z: station.pos.z + Math.sin(ang) * r };
    const laneFaction = (sector && sector.factionId) || 'faction_free';
    const spec = makeShipEntitySpec(def.ship, {
      team: def.team,
      factionId: laneFaction,
      pos,
      ai: {
        archetype: def.archetype,
        passive: true,
        spawnContext: 'convoy_civilian',
      },
    });
    const ent = this.helpers.spawnEntity(spec);
    if (!ent) return;
    this._stampTrafficDurableIdentity(ent, sectorId, 'arclight', def, 700);
    ent.data.trafficRole = 'arclight';
    ent.data.role = 'arclight';
    ent.data.trafficLabel = def.label;
    ent.data.scanLabel = 'HELIOS ARCLIGHT';
    const target = this._nearestStationTo(stations, station) || station;
    const manifest = this._assignManifest(ent, 'arclight', target, sectorId);
    this._watchSpawnedTraffic(ent);
    this._active.push(ent.id);
    const rec = {
      id: ent.id,
      role: 'arclight',
      targetId: target.id,
      waitT: 0,
      nextTradeT: 3,
      orbitPhase: ang,
      dockSeq: 0,
      manifest,
    };
    list.push(rec);
    this._maybeAssignJob(ent, 'arclight', station, target, stations, sectorId);
  },

  // PQ-193.08: one volatiles tanker on Helios as a rare extra. Own role and body.
  // Does not consume the ambient RNG stream or steal Span / Atlas / Arclight.
  _ensureHeliosTankerFixture(sectorId, sector, stations, list) {
    if (sectorId !== 'sector_helios_prime') return;
    const def = TRAFFIC_ROLES.tanker;
    if (!def) return;
    for (const rec of list) {
      if (rec && rec.role === 'tanker') return;
      const entity = liveEntity(this.state, rec && rec.id);
      if (entity && entity.data && entity.data.trafficRole === 'tanker') return;
    }
    if (!this.helpers || !this.helpers.spawnEntity || !stations || !stations.length) return;
    const station = this._pocketStation(stations, sectorId) || stations[0];
    if (!station || !station.pos) return;
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const ang = ((hash32(seed, 'helios_tanker_spawn', sectorId) >>> 0) / 0xffffffff) * Math.PI * 2;
    const r = 220;
    const pos = { x: station.pos.x + Math.cos(ang) * r, z: station.pos.z + Math.sin(ang) * r };
    const laneFaction = (sector && sector.factionId) || 'faction_free';
    const spec = makeShipEntitySpec(def.ship, {
      team: def.team,
      factionId: laneFaction,
      pos,
      ai: {
        archetype: def.archetype,
        passive: true,
        spawnContext: 'convoy_civilian',
      },
    });
    const ent = this.helpers.spawnEntity(spec);
    if (!ent) return;
    this._stampTrafficDurableIdentity(ent, sectorId, 'tanker', def, 710);
    ent.data.trafficRole = 'tanker';
    ent.data.role = 'tanker';
    ent.data.trafficLabel = def.label;
    ent.data.scanLabel = 'VOLATILES TANKER';
    const target = this._nearestStationTo(stations, station) || station;
    const manifest = this._assignManifest(ent, 'tanker', target, sectorId);
    this._watchSpawnedTraffic(ent);
    this._active.push(ent.id);
    const rec = {
      id: ent.id,
      role: 'tanker',
      targetId: target.id,
      waitT: 0,
      nextTradeT: 3,
      orbitPhase: ang,
      dockSeq: 0,
      manifest,
    };
    list.push(rec);
    this._maybeAssignJob(ent, 'tanker', station, target, stations, sectorId);
  },

  // PQ-193.08: one inspection cutter on Helios as a rare extra. Ambient customs only —
  // hostile customs_cutter stays the Hornet. Does not steal patrol or escort.
  _ensureHeliosCustomsFixture(sectorId, sector, stations, list) {
    if (sectorId !== 'sector_helios_prime') return;
    const def = TRAFFIC_ROLES.customs;
    if (!def) return;
    for (const rec of list) {
      if (rec && rec.role === 'customs') return;
      const entity = liveEntity(this.state, rec && rec.id);
      if (entity && entity.data && entity.data.trafficRole === 'customs') return;
    }
    if (!this.helpers || !this.helpers.spawnEntity || !stations || !stations.length) return;
    const station = this._pocketStation(stations, sectorId) || stations[0];
    if (!station || !station.pos) return;
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const ang = ((hash32(seed, 'helios_customs_spawn', sectorId) >>> 0) / 0xffffffff) * Math.PI * 2;
    const r = 125;
    const pos = { x: station.pos.x + Math.cos(ang) * r, z: station.pos.z + Math.sin(ang) * r };
    const laneFaction = (sector && sector.factionId) || 'faction_free';
    const spec = makeShipEntitySpec(def.ship, {
      team: def.team,
      factionId: laneFaction,
      pos,
      ai: {
        archetype: def.archetype,
        passive: true,
        spawnContext: 'convoy_civilian',
      },
    });
    const ent = this.helpers.spawnEntity(spec);
    if (!ent) return;
    this._stampTrafficDurableIdentity(ent, sectorId, 'customs', def, 720);
    ent.data.trafficRole = 'customs';
    ent.data.role = 'customs';
    ent.data.trafficLabel = def.label;
    ent.data.scanLabel = 'INSPECTION CUTTER';
    const target = this._nearestStationTo(stations, station) || station;
    this._watchSpawnedTraffic(ent);
    this._active.push(ent.id);
    const rec = {
      id: ent.id,
      role: 'customs',
      targetId: target.id,
      waitT: 0,
      nextTradeT: 3,
      orbitPhase: ang,
      dockSeq: 0,
      manifest: null,
    };
    list.push(rec);
    this._maybeAssignJob(ent, 'customs', station, target, stations, sectorId);
  },

  /**
   * WORLD-20 — one sightseer lives inside the Helios memorial. Not a hostile, and not a
   * change to the ambient role mix (that weight stays zero unless the sector is scenic).
   */
  _ensureHeliosMemorialTourist(sectorId, sector, stations, list) {
    if (sectorId !== HELIOS_MEMORIAL_TOURIST.sectorId) return;
    for (const rec of list) {
      if (rec && rec.role === 'tourist') return;
      const entity = liveEntity(this.state, rec && rec.id);
      if (entity && entity.alive !== false && entity.data && entity.data.trafficRole === 'tourist') return;
    }
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return;
    const def = TRAFFIC_ROLES.tourist;
    const pos = { x: HELIOS_MEMORIAL_TOURIST.pos.x, z: HELIOS_MEMORIAL_TOURIST.pos.z };
    const spec = makeShipEntitySpec(def.ship, {
      team: def.team,
      factionId: (sector && sector.factionId) || 'faction_scn',
      pos,
      ai: { archetype: def.archetype, passive: true, spawnContext: 'convoy_civilian' },
    });
    const ent = this.helpers.spawnEntity(spec);
    if (!ent) return;
    this._stampTrafficDurableIdentity(ent, sectorId, 'tourist', def, 4242);
    ent.data.trafficRole = 'tourist';
    ent.data.tourist = true;
    ent.data.trafficLabel = def.label;
    ent.pos = pos;
    if (!this._active) this._active = [];
    this._active.push(ent.id);
    const station = (stations && stations[0]) || null;
    list.push({
      id: ent.id,
      role: 'tourist',
      targetId: station && station.id,
      waitT: 0,
      nextTradeT: 8,
      orbitPhase: 0,
      dockSeq: 0,
      manifest: null,
      // Stay on the array. A scenic-body pick would walk the sightseer out of the
      // memorial before a firefight there could reach them.
      scenicPos: { x: pos.x, z: pos.z },
      scenicRadius: 90,
    });
  },

  /**
   * Stamp homeSectorId + stable worldRecordId before first demotion so capture/kill never
   * attaches homeless freighters to the wrong sector bag.
   */
  _stageHeliosCutterSpawn(spec, station, sectorId, role) {
    if (sectorId !== 'sector_helios_prime' || role !== 'miner'
      || stationIdentity(station) !== 'station_helios') return;
    let face = null, nearest = Infinity;
    forEachFieldRock(this.state, (rock) => {
      if (rock.alive === false || !rock.pos || rock.data?.fieldId !== 'f_helios_starter'
        || !(rock.data.oreHP > 0)) return;
      const d2 = (rock.pos.x - station.pos.x) ** 2 + (rock.pos.z - station.pos.z) ** 2;
      if (d2 < nearest) { face = rock; nearest = d2; }
    });
    if (!face || !(nearest > 0)) return;
    // Start the shift on the field-facing berth, outside the station skin. A random berth on
    // the opposite side aimed the first physical work leg straight through the refinery.
    // This is the initial spawn spec only; neither a living nor a restored hull is relocated.
    const clearance = (station.radius || 0) + (spec.radius || 16) + 24;
    const dockReach = Math.max(clearance, station.data?.dockRadius || 0);
    const r = (clearance + dockReach) * 0.5;
    const dx = face.pos.x - station.pos.x, dz = face.pos.z - station.pos.z;
    spec.pos = { x: station.pos.x + dx / Math.sqrt(nearest) * r,
      z: station.pos.z + dz / Math.sqrt(nearest) * r };
    spec.rot = Math.atan2(dz, dx);
  },

  _stampTrafficDurableIdentity(ent, sectorId, role, def, seq) {
    if (!ent) return;
    if (sectorId === 'sector_helios_prime' && role === 'ore_carrier') {
      ent.data = ent.data || {};
      ent.data.activityActorSlotId = 'helios_starter_ore_carrier';
      syncEntityActivitySlotMembership(this.state && this.state.entityIndex, ent);
      requestActivityReclassify(this.state, ent);
      // The collected lot must survive Continue, same custody precedent as a towed payload.
      ent.flags = Object.assign({}, ent.flags, { persistent: true });
    }
    // The starter cutter's slot id normally lands when npcJobs commissions it — a World Site or
    // claim-travel hook runs first and would steal the shift's only hull. Reserve the slot here;
    // the adoption path stamps the same id and isHeliosCuttingMiner already accepts the carrier.
    if (sectorId === 'sector_helios_prime' && role === 'miner'
      && !(this.state.entityList || []).some((other) => other !== ent && other.alive !== false
        && other.data && other.data.activityActorSlotId === 'helios_starter_cutter')) {
      ent.data = ent.data || {};
      ent.data.activityActorSlotId = 'helios_starter_cutter';
      syncEntityActivitySlotMembership(this.state && this.state.entityIndex, ent);
      requestActivityReclassify(this.state, ent);
    }
    if (!ent.data) ent.data = {};
    ent.data.trafficRole = role;
    // Don't clobber a named lane callsign already stamped.
    if (!ent.data.namedLaneContactId) {
      ent.data.trafficLabel = (def && def.label) || role;
    }
    ent.data.role = role; // readability for target panel / scanner
    ent.homeSectorId = sectorId;
    ent.data.homeSectorId = sectorId;
    if (ent.data.sectorId == null) ent.data.sectorId = sectorId;
    syncEntitySectorMembership(this.state && this.state.entityIndex, ent);
    // AI readability tags (hostility still team/passive/lawful + WANTED gate — never factionId).
    if (!ent.data.ai) ent.data.ai = {};
    if (lawPresenceRole(role)) {
      ent.data.ai.lawful = true;
      if (!ent.data.ai.spawnContext) ent.data.ai.spawnContext = 'patrol';
    } else if (!ent.data.ai.spawnContext) {
      ent.data.ai.spawnContext = 'convoy_civilian';
    }
    if (role === 'express') {
      ent.data.hitchable = true;
      ent.data.scanLabel = 'EXPRESS LINER · HITCHABLE';
      if (!ent.data.trafficLabel) ent.data.trafficLabel = 'Express Liner';
    }
    if (role === 'tourist') {
      ent.data.tourist = true;
      if (!ent.data.trafficLabel) ent.data.trafficLabel = 'Sightseer';
    }
    if (ent.data.worldRecordId) {
      stampCaptainIdentity(this.state, ent);
      this._indexWorldRecordId(ent);
      return;
    }
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const qx = ent.pos ? Math.round(ent.pos.x / 4) * 4 : 0;
    const qz = ent.pos ? Math.round(ent.pos.z / 4) * 4 : 0;
    const key = `traffic:${role || 'hauler'}:${seq | 0}:${qx}:${qz}`;
    const recordId = stableRecordId(seed, sectorId, RECORD_KIND.CONVOY, key);
    ent.data.worldRecordId = recordId;
    ent.data.identityKey = key;
    ent.data.durable = true;
    ent.data.recordCreatedTick = deferredEnterTick(this.state) | 0;
    stampCaptainIdentity(this.state, ent);
    this._indexWorldRecordId(ent);
  },

  /**
   * The entity index keys byWorldRecordId at append time, but durable identity is stamped on the
   * entity right after spawnEntity returns — one index rebuild later the map would still miss it.
   * Close that window directly so same-tick lookups (claim convoys, depot haulers) never see a
   * live hull as absent and spawn a duplicate over its durable record.
   */
  _indexWorldRecordId(ent) {
    registerEntityWorldRecordId(this.state && this.state.entityIndex, ent);
  },

  /**
   * Bind rematerialized convoy freighters into traffic tracking without re-spawning.
   */
  _adoptRematerializedTraffic(sectorId, stations) {
    if (!sectorId) return;
    const tracked = new Set((this.state.traffic.freighters || []).map((f) => f && f.id));
    let adoptIdx = 0;
    forEachLivingWorldActor(this.state, (e) => {
      if (e.type !== 'ship' || e.isPlayer || claimsTallyAssessor(e)) return;
      const d = e.data || {};
      if (!d.trafficRole && !d.worldRecordId) return;
      // Only adopt freighters that look like traffic/convoy.
      if (!d.trafficRole && !(d.durable && d.worldRecordId)) return;
      if (!d.trafficRole) return;
      const home = e.homeSectorId || d.homeSectorId || d.sectorId;
      if (home && home !== sectorId) return;
      // NXI-165: a durable rebind restores data.ai (the captured ai record) but never the live
      // namedLaneContactId stamp — heal it from the record so the SAME worker keeps her name and
      // the "already have a live named contact" checks see her instead of re-picking the
      // identity onto a second hull. A stale id with no authored contact is dropped. The heal
      // also loses to a live holder: when the enter race twins her (a shelved row plus the
      // fixture's re-mint both promote in one pass), the first stamp wins and the runner-up
      // keeps only her durable ai id — never two live hulls wearing one contact's face.
      if (!d.namedLaneContactId && d.ai && typeof d.ai.namedLaneContactId === 'string'
        && d.ai.namedLaneContactId) {
        const contact = NAMED_LANE_CONTACTS.find((c) => c && c.id === d.ai.namedLaneContactId);
        if (!contact) delete d.ai.namedLaneContactId;
        else {
          let held = false;
          for (const other of this.state.entityList) {
            if (!other || other === e || other.alive === false || other.type !== 'ship') continue;
            if (other.data && other.data.namedLaneContactId === contact.id) { held = true; break; }
          }
          if (!held) this._stampNamedLaneContact(e, contact);
        }
      }
      if (tracked.has(e.id)) return;
      if (sectorId === 'sector_helios_prime' && d.trafficRole === 'ore_carrier') {
        d.activityActorSlotId = 'helios_starter_ore_carrier';
        syncEntityActivitySlotMembership(this.state && this.state.entityIndex, e);
        requestActivityReclassify(this.state, e);
        e.flags = Object.assign({}, e.flags, { persistent: true });
      }
      // Ensure durable stamps survive even if rematerialize omitted a field.
      if (!e.homeSectorId && !d.homeSectorId) {
        e.homeSectorId = sectorId;
        d.homeSectorId = sectorId;
      }
      if (d.sectorId == null) d.sectorId = sectorId;
      syncEntitySectorMembership(this.state && this.state.entityIndex, e);
      if (!d.worldRecordId) {
        this._stampTrafficDurableIdentity(e, sectorId, d.trafficRole, { label: d.trafficLabel }, adoptIdx);
      }
      tracked.add(e.id);
      this._active.push(e.id);
      const role = d.trafficRole || 'hauler';
      const priorityItinerary = role === 'courier' ? this._priorityCourierItinerary(e, sectorId) : null;
      const passengerClaim = role === 'express' ? this._passengerLinerClaim(e, sectorId) : null;
      const passengerItinerary = passengerClaim ? this._passengerLinerItinerary(e, sectorId) : null;
      const target = (stations && stations.length)
        ? (priorityItinerary
          ? (this._stationForPriorityCourier(stations, priorityItinerary.destinationStationId) || this._pickStation(stations))
          : passengerItinerary
            ? (this._stationForPriorityCourier(stations,
              passengerItinerary.state === 'DIVERTING'
                ? passengerItinerary.diversion && passengerItinerary.diversion.returnStationId
                : (passengerItinerary.state === 'BOARDING' || passengerItinerary.state === 'DELAYED')
                  ? passengerItinerary.originStationId
                  : passengerItinerary.destinationStationId) || this._pickStation(stations))
          : role === 'express'
            ? (this._expressDestinationFromItinerary(stations, d.itinerary) || this._pickStation(stations))
            : this._pickStation(stations))
        : null;
      // Preserve durable cargo manifest across rematerialize / continuous handoff (M2).
      let manifest = d.cargoManifest || null;
      if (!manifest || !Array.isArray(manifest.lines)) {
        manifest = this._assignManifest(e, role, target, sectorId);
      } else {
        e.data.cargoManifest = manifest;
      }
      const cargoDumped = !!d.cargoDumped;
      const carrying = cargoDumped ? false : (d.carrying !== undefined ? !!d.carrying : !!(manifest && manifest.totalQty > 0));
      const rec = {
        id: e.id,
        role,
        targetId: target ? target.id : null,
        waitT: 0,
        nextTradeT: 2 + adoptIdx * 1.5,
        orbitPhase: this._rng() * Math.PI * 2,
        dockSeq: d.freightDockSeq | 0,
        manifest,
        carrying,
        fleeingWithLoad: !!d.fleeingWithLoad,
        scenicBodyId: d.scenicBodyId || null,
        assistingShipId: d.assistingShipId || null,
        cargoDumped,
        civilianReaction: d.civilianReaction || null,
      };
      if (role === 'express') {
        this._stampTrafficDurableIdentity(e, sectorId, role, TRAFFIC_ROLES.express, adoptIdx);
        if (passengerItinerary) this._stampPassengerLinerService(e, rec, stations);
        else {
          // A claimed-but-invalid passenger save is deliberately demoted to an ordinary express;
          // do this before the generic route creates its normal itinerary.
          if (passengerClaim || (d.itinerary && (d.itinerary.kind === PASSENGER_LINER_ITINERARY_KIND
            || d.itinerary.serviceId === PASSENGER_LINER_SERVICE.id))) {
            this._invalidatePassengerLinerClaim(e, rec);
          }
          this._stampExpressRoute(e, rec, null, target, sectorId, adoptIdx, true);
        }
      }
      if (priorityItinerary) this._stampPriorityCourierService(e, rec, stations);
      this.state.traffic.freighters.push(rec);
      adoptIdx++;
    });
  },

  _sectorStations() {
    const index = this.state.entityIndex;
    if (index && index.__spacefaceEntityIndexV1 && Array.isArray(index.dockStations)) {
      return index.dockStations;
    }
    const out = this._stationScratch || (this._stationScratch = []);
    out.length = 0;
    forEachLivingWorldActor(this.state, (e) => {
      if (e.type === 'station' && !(e.data && e.data.isGate)) out.push(e);
    });
    return out;
  },

  _pickStation(stations) {
    return stations[Math.floor(this._rng() * stations.length)] || stations[0];
  },

  _pickExpressDestination(stations, origin) {
    if (!stations || !stations.length) return null;
    const choices = stations.filter((station) => station && station !== origin);
    if (!choices.length) return origin || stations[0];
    return choices[Math.floor(this._rng() * choices.length)] || choices[0];
  },

  _expressDestinationFromItinerary(stations, itinerary) {
    const id = itinerary && itinerary.destinationStationId;
    if (!id) return null;
    return stations.find((station) => stationIdentity(station) === id) || null;
  },

  _stampExpressRoute(entity, rec, origin, destination, sectorId, seq, preserve = false) {
    if (!entity || !rec || rec.role !== 'express') return;
    const data = entity.data || (entity.data = {});
    let itinerary = preserve && data.itinerary && data.itinerary.kind === 'express_hitch_route'
      ? data.itinerary
      : null;
    if (!itinerary) {
      const originId = stationIdentity(origin) || 'local_departure';
      const destinationId = stationIdentity(destination) || originId;
      const seed = (this.state.meta && this.state.meta.seed) || 1;
      const slot = hash32(seed, sectorId, 'express-hitch-slot', seq | 0) % 6;
      itinerary = {
        kind: 'express_hitch_route',
        routeId: `express:${sectorId}:${originId}>${destinationId}`,
        sectorId,
        originStationId: originId,
        destinationStationId: destinationId,
        serviceLabel: 'Express Hitch Line',
        departureSlotS: slot * 30,
        hitchable: true,
        transitIntent: 'v3_boost',
      };
      data.itinerary = itinerary;
    }
    const routeLabel = `${stationName(origin, itinerary.originStationId)} → ${stationName(destination, itinerary.destinationStationId)}`;
    data.hitchable = true;
    data.trafficLabel = `EXPRESS LINER · ${routeLabel}`;
    data.scanLabel = `${data.trafficLabel} · HITCHABLE`;
    rec.itinerary = itinerary;
  },

  _cleanup() {
    this._invalidateCausalRunEpoch();
    this._ensureState();
    this._releaseCeresMinerHaulerHandoffControls(this.state.traffic.ceresMinerHaulerHandoff);
    this._releaseCeresTenderServiceControls(this.state.traffic.ceresTenderServiceIncident);
    this._resetCeresTenderServiceRuntime();
    this._releaseCeresDisabledHaulerControls(this.state.traffic.ceresDisabledHaulerIncident);
    this._resetCeresDisabledHaulerRuntime();
    // Hard exit drops the view and every view-scoped causality ledger while the freighter ledger
    // still names persistent bodies that need stamp cleanup.
    this._resetTransientCausalLedgers(true);
    this._resetCeresCausalChain('cleanup');
    this._clearCivilianViolenceMemory();
    // The core system exposes helpers.removeEntity (marks alive=false; the renderer/physics GC it).
    // Fall back to a direct alive=false if the helper shape differs across builds.
    const helper = this.helpers && (this.helpers.removeEntity || this.helpers.despawnEntity);
    if (!helper) {
      for (const id of this._active) { const e = this.state.entities.get(id); if (e && !ownsWinnowRecoveryHull(this.state, e) && !ownsCharonSupplyHull(this.state, e)) e.alive = false; }
    } else {
      for (const id of this._active) { if (ownsWinnowRecoveryHull(this.state, this.state.entities.get(id)) || ownsCharonSupplyHull(this.state, this.state.entities.get(id))) continue; try { helper(id); } catch (_) {} }
    }
    this._active = [];
    this.state.traffic.freighters = [];
    // Well-drag convoy state is keyed by live entity ids. A hard wipe orphans it, and an id
    // recycled in the next sector would inherit the dead hauler as its regroup target (or a
    // dead dedupe key) — sector-scoped transient state, cleared with the roster.
    if (this._wellDragRegroup) this._wellDragRegroup.clear();
    if (this._wellDragSeen) this._wellDragSeen.clear();
  },

  _releaseTrafficWatches(state) {
    if (!state || !state.entities) return;
    const now = state.simTime || 0;
    // Freighter records cover the ambient roster; _active also holds owned bodies with no
    // freighter row (ending-cast pickets, service hulls) whose arrival holds must release too.
    const seen = new Set();
    const list = state.traffic && state.traffic.freighters;
    if (list) for (const rec of list) { if (rec && rec.id != null) seen.add(rec.id); }
    if (this._active) for (const id of this._active) { if (id != null) seen.add(id); }
    for (const id of seen) {
      const ent = state.entities.get(id);
      if (ent) releaseExpiredTrafficWatch(ent, now);
    }
  },

  _playerWatchingTraffic() {
    const state = this.state;
    if (!state || state.mode !== 'flight' || state.playerId == null || !state.entities) return null;
    const player = state.entities.get(state.playerId);
    if (!player || player.alive === false || !player.pos) return null;
    return player;
  },

  _watchSpawnedTraffic(ent) {
    if (!ent) return null;
    return stampTrafficWatchSignature(ent, this._playerWatchingTraffic(), {
      watching: !!this._playerWatchingTraffic(),
      exiting: false,
      seed: (this.state && this.state.meta && this.state.meta.seed) || 1,
      simTime: this.state && this.state.simTime,
    });
  },

  _watchExitingTraffic(ent) {
    if (!ent) return null;
    const player = this._playerWatchingTraffic();
    return stampTrafficWatchSignature(ent, player, {
      watching: !!player,
      exiting: true,
      seed: (this.state && this.state.meta && this.state.meta.seed) || 1,
      simTime: this.state && this.state.simTime,
    });
  },

  // The disposition cast mints on endgame:chosen — possibly mid-flight in front of the player.
  // Fresh mints are traffic-owned hulls, so they take the same watched-spawn signature as any
  // other spawn site; their endingWorldKey slots exempt them from the pocket-edge slide.
  _materializeEndingWorldPresence() {
    return materializeEndingWorldPresence(this.state, this.helpers, this._active,
      (ent) => this._watchSpawnedTraffic(ent));
  },

  /** Drop tracking for freighters already despawned by residency demotion (continuous handoff). */
  _onFarActorShelved(p) {
    if (!p || p.id == null) return;
    const list = this.state.traffic && this.state.traffic.freighters || [];
    for (const rec of list) {
      if (rec.id !== p.id) continue;
      rec.virtualized = true;
      rec.farActorId = p.id;
      return;
    }
  },

  _onFarActorRestored(p) {
    if (!p || p.id == null) return;
    const restored = (p && p.entity) || (this.state.entities && this.state.entities.get(p.id));
    if (restored && restored.alive !== false && restored.data && restored.data.trafficRole) {
      this._watchSpawnedTraffic(restored);
    }
    const list = this.state.traffic && this.state.traffic.freighters || [];
    for (const rec of list) {
      if (rec.id !== p.id && rec.farActorId !== p.id) continue;
      rec.virtualized = false;
      rec.id = p.id;
      rec.farActorId = null;
      const entity = this.state.entities?.get(p.id);
      if (rec.role === 'salvor' && entity?.data?.trafficRole === 'salvor'
        && (!p.entity || p.entity === entity) && rec.manifest) {
        // The lean far actor is a hull projection. Traffic's existing record retains the
        // conserved hold; restoring residency must not turn that paid lot into an empty ship.
        this._setTrafficManifest(entity, rec, rec.manifest);
      }
      return;
    }
    this._readoptPromotedTraffic(p);
  },

  /**
   * A traffic hull can promote from the far table with no roster record at all: a boot-time
   * enter shelves her before the enter's roster rebuilds finish, and a rebuild that keeps
   * only live entities drops her row. The lean far row keeps data.ai (so the NXI-165 contact
   * id and the express itinerary survive) but not the live contact stamps, and no stepper
   * owns a recordless hull — she promotes anonymous and parked. Re-adoption through the same
   * path a save takes restores the record (motion/freight) and the express route; the contact
   * identity is re-stamped AFTER adoption so the callsign wins the scanner label back,
   * matching the fixture's stamp order (durable → route → contact).
   */
  _readoptPromotedTraffic(p) {
    if (!p || p.trafficRole == null) return;
    const sectorId = this.state.world && this.state.world.currentSectorId;
    if (!sectorId) return;
    const ent = this.state.entities && this.state.entities.get(p.id);
    if (!ent || ent.alive === false || ent.isPlayer || ent.type !== 'ship') return;
    const d = ent.data || (ent.data = {});
    if (d.trafficRole !== p.trafficRole) return;
    const home = ent.homeSectorId || d.homeSectorId || d.sectorId;
    if (home && home !== sectorId) return;
    // Slot-owned cast hulls recover through their own materializer, never generic adoption.
    if (d.activityActorSlotId || d.ceresActivityCast || d.authoredActivityCast) return;
    this._adoptRematerializedTraffic(sectorId, this._sectorStations());
    const contactId = d.ai && typeof d.ai.namedLaneContactId === 'string'
      ? d.ai.namedLaneContactId : null;
    if (!contactId) return;
    const contact = NAMED_LANE_CONTACTS.find((c) => c && c.id === contactId);
    if (!contact) { delete d.ai.namedLaneContactId; return; }
    // Only one live hull may wear a contact's face — the fixture's own guard. The enter race
    // can twin her: a shelved row persists across a sector round trip, the fixture re-mints a
    // fresh courier pocket-side, and both rows promote in one approach pass. The first
    // re-stamp wins; the second stays anonymous (her durable ai id kept for a later heal when
    // the holder dies) instead of doubling the named presence on one lane.
    for (const other of this.state.entityList) {
      if (!other || other === ent || other.alive === false || other.type !== 'ship') continue;
      if (other.data && other.data.namedLaneContactId === contactId) return;
    }
    this._stampNamedLaneContact(ent, contact);
  },

  // _active also tracks recordless owned bodies (ending-cast pickets, service hulls) the
  // freighter roster doesn't know. Every roster rebuild folds the still-live ones back in —
  // dropping them would pull their arrival holds out of the release sweep and out of the
  // hard-enter cleanup while the bodies are still alive.
  _retainLiveOwnedIds(ids) {
    for (const id of this._active || []) {
      if (id == null || ids.includes(id)) continue;
      if (liveEntity(this.state, id)) ids.push(id);
    }
    return ids;
  },

  _pruneDead() {
    this._ensureState();
    const list = this.state.traffic.freighters || [];
    const aliveIds = [];
    for (let i = list.length - 1; i >= 0; i--) {
      const rec = list[i];
      if (rec.virtualized && getFarActor(this.state, rec.farActorId || rec.id)) {
        aliveIds.push(rec.id);
        continue;
      }
      const e = this.state.entities && this.state.entities.get(rec.id);
      if (!e || !e.alive) list.splice(i, 1);
      else aliveIds.push(rec.id);
    }
    this._active = this._retainLiveOwnedIds(aliveIds);
  },

  // Allocation-free mirror of shouldAmbientHaulerPlan -> shouldOwnerThink from
  // core/activityScheduler.js, which is outside this task's edit scope. Same reads, same branch
  // order, same result; the only differences are that the {…options} spread and the
  // `${tag}:${id}` key string are replaced by cached per-owner FNV phases. trafficPlanOpts never
  // sets ownerKey/activePeriodTicks/sleepPeriodTicks/nearPeriodTicks, so the scheduler's own
  // defaults (anon / 2 / 8 / 2) are the constants mirrored above.
  _ambientPlanGate(tick, owner, options) {
    const ai = ownerAiRecord(owner);
    const team = ownerTeamId(owner);
    const combat = ai && ai.combatant === true;
    const hostile = !!(team != null && options.playerTeam != null
      && team !== options.playerTeam
      && ai && ai.passive !== true);
    if (combat || hostile) return true;
    const activity = owner && owner.activity;
    const tier = activity && activity.simTier;
    if (tier === SIM_TIER.S2_ABSTRACT || tier === SIM_TIER.S3_DORMANT || tier === SIM_TIER.S4_AGGREGATE) {
      if (!(activity && activity.pinnedExact)) return false;
    }
    if (tier === SIM_TIER.S1_NEAR && !(activity && activity.pinnedExact)) {
      return this._ambientPhaseRun(tick, owner, 'near');
    }
    if (!isActiveOwner(owner, options)) {
      return this._ambientPhaseRun(tick, owner, 'sleep');
    }
    return this._ambientPhaseRun(tick, owner, 'active');
  },

  _ambientPhaseRun(tick, owner, tag) {
    const period = tag === 'sleep' ? AMBIENT_SLEEP_PERIOD
      : tag === 'near' ? AMBIENT_NEAR_PERIOD
      : AMBIENT_ACTIVE_PERIOD;
    // Identical to shouldRunOnTick: ((t % period) + period) % period === ownerPhase(key, period).
    const t = Number.isInteger(tick) ? tick : Math.floor(Number(tick) || 0);
    return ((t % period) + period) % period === this._ambientPhase(owner, tag);
  },

  _ambientPhase(owner, tag) {
    const period = tag === 'sleep' ? AMBIENT_SLEEP_PERIOD
      : tag === 'near' ? AMBIENT_NEAR_PERIOD
      : AMBIENT_ACTIVE_PERIOD;
    if (!owner || typeof owner !== 'object') {
      // Original key is `owner && (...)`: a falsy owner IS the key (null -> ''), not 'anon'.
      return hashOwnerKey(owner) % period;
    }
    let rec = this._ambientPhaseCache.get(owner);
    if (!rec || rec.id !== owner.id) {
      const suffix = owner.id != null ? owner.id : 'anon';
      rec = {
        id: owner.id,
        near: hashOwnerKey(`near:${suffix}`) % AMBIENT_NEAR_PERIOD,
        sleep: hashOwnerKey(`sleep:${suffix}`) % AMBIENT_SLEEP_PERIOD,
        active: hashOwnerKey(`active:${suffix}`) % AMBIENT_ACTIVE_PERIOD,
      };
      this._ambientPhaseCache.set(owner, rec);
    }
    return rec[tag];
  },

  update(dt, state) {
    if (state.mode !== 'flight' || (state.run?.kind === 'survival' && state.run.phase !== 'inactive') || raceLeaseActive(state)) {
      cancelAnvilSpillRendezvous(state);
      return;
    }
    this._coldburnRey?.update(dt);
    ensureActivityClassified(state);
    this._ensureState();
    this._releaseTrafficWatches(state);
    if (state.world && state.world.currentSectorId === 'sector_pallas_drift') {
      stepPallasWorkLoop(state, dt, this);
    }
    if ((state.simTime || 0) >= (this._nextDepotDispatchAt || 0)) {
      this._nextDepotDispatchAt = (state.simTime || 0) + 1;
      this._maintainClaimDepotTraffic();
      this._maintainClaimConvoys();
    }
    reconcileWinnowRecovery(this);
    reconcileCharonSupply(this);
    syncCeresWorkfleetHardware(this);
    this._stepAnvilWork(dt, state);
    this._stepPocketMeteorPass(dt, state);
    this._stepPocketDebrisField(dt, state);
    this._stepSmugglerDeadDrop(dt, state);
    this._stepPocketDebrisStream(dt, state);
    this._stepHitchShed(dt, state);
    this._stepVolatileSlough(dt, state);
    this._stepBreakerFeed(dt, state);
    this._stepWeirTill(dt, state);
    // A causal ledger belongs to exactly one sector's chain. A continuous or no-teleport exit never
    // runs the hard-enter cleanup, so standing in any other sector (chainless or not) retires the
    // stale ledger here instead of letting its stamps and jobs outlive the sector.
    if (this._ceresCausal && this._ceresCausal.sectorId !== (state.world && state.world.currentSectorId)) {
      this._resetCeresCausalChain('wrong_sector');
    }
    const list = state.traffic.freighters;
    const stations = this._sectorStations();
    // Even with zero freighters, a wreck can still call a cutter into the sector.
    if ((!list || list.length === 0) || stations.length === 0) {
      if (stations.length > 0) {
        this._dispatchGeneralSalvors(state.world && state.world.currentSectorId);
      }
      // A Continue can restore a durable cutter before a station residency record has
      // rematerialized. It still needs to rebind its stable salvage point to the live wreck; only
      // fresh dispatch depends on a station being present.
      this._maintainGeneralSalvorJobs();
      return;
    }

    // Timer-cadence only: one chain step per traffic update, not a freighter scan.
    const causalSectorId = state.world && state.world.currentSectorId;
    if (SECTOR_CAUSAL_CHAINS.has(causalSectorId)) {
      this._stepCeresCausalChain(dt);
      if (causalSectorId === CERES_ACTIVITY_SECTOR_ID) {
        // A save may restore the compact service incident before its transient choreography link.
        // Let that exact orphan rebind once; an active link drives its own incident in the chain step.
        if (!this._hasActiveCeresTenderServiceLink()) this._stepCeresTenderServiceIncident(dt);
        this._stepCeresDisabledHaulerIncident(dt);
        this._stepCeresMinerHaulerHandoffs(dt);
      }
    }

    let lostWorldSiteRoute = false;
    let lostClaimTravelRoute = false;
    let anyWorldSiteRoute = false;
    // Remove dead record bindings once, then let the classifier-owned traffic view drive all
    // behavior. Far S2/S3/S4 freighters remain in entityList and their durable record, but do not
    // enter this owner loop until a scheduled wake or explicit pin makes them due.
    const recordById = this._recordByIdScratch || (this._recordByIdScratch = new Map());
    const recordIndexById = this._recordIndexByIdScratch || (this._recordIndexByIdScratch = new Map());
    recordById.clear();
    recordIndexById.clear();
    const activeTraffic = this._activeTrafficScratch || (this._activeTrafficScratch = []);
    activeTraffic.length = 0;
    const activeTrafficIds = this._activeTrafficIdsScratch
      || (this._activeTrafficIdsScratch = new Set());
    activeTrafficIds.clear();
    const hasLivePlayer = state.playerId != null
      && state.entities && typeof state.entities.get === 'function'
      && !!state.entities.get(state.playerId);
    for (const entity of getActivityOwnerEntities(state, 'traffic')) {
      activeTraffic.push(entity);
      activeTrafficIds.add(entity.id);
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const rec = list[i];
      const e = state.entities.get(rec.id);
      if (!e || !e.alive) {
        if (rec && rec.worldSiteRoute) lostWorldSiteRoute = true;
        if (rec && rec.claimTravelRoute) lostClaimTravelRoute = true;
        list.splice(i, 1);
        continue;
      }
      recordById.set(rec.id, rec);
      recordIndexById.set(rec.id, i);
      if (rec.worldSiteRoute) anyWorldSiteRoute = true;
      // Legacy/fixture traffic records may predate data.trafficRole. Preserve their exact/near
      // behavior without re-admitting remote passive records to the owner loop.
      if (!activeTrafficIds.has(e.id) && (!hasLivePlayer || entityNeedsAiThink(e, state))) {
        activeTraffic.push(e);
        activeTrafficIds.add(e.id);
      }
    }
    const player = hasLivePlayer ? state.entities.get(state.playerId) : null;
    // One entity walk per tick serves every world-site route: resolving each routed freighter's
    // site through a full entity scan was O(routedFreighters × entities) at 60 Hz. The index is
    // built before the stepper loop, whose world-site branch only reads positions and writes
    // intent, so the entity set it snapshots is the same one each per-freighter scan saw.
    // Live index read when available: the stepper only needs get/set, and misses fall
    // through to the same reseeding entity walk either way — so copying the whole map into a
    // scratch Map every tick buys nothing once byWorldRecordId is the source.
    const liveWorldRecordMap = anyWorldSiteRoute
      && state.entityIndex && state.entityIndex.__spacefaceEntityIndexV1 === true
      && state.entityIndex.ready === true
      && state.entityIndex.byWorldRecordId instanceof Map
      ? state.entityIndex.byWorldRecordId : null;
    const worldRecordIndex = anyWorldSiteRoute
      ? liveWorldRecordMap
        || buildWorldRecordIndex(state, this._worldRecordIndexScratch || (this._worldRecordIndexScratch = new Map()))
      : null;
    // Retained per-tick options record: _ambientPlanGate reads playerId/playerTeam/
    // authorityRadius/origin synchronously, so the same object is rewritten each update.
    const trafficPlanOpts = this._trafficPlanOpts || (this._trafficPlanOpts = {
      playerId: null, playerTeam: null, authorityRadius: 0, origin: null,
    });
    trafficPlanOpts.playerId = state.playerId;
    trafficPlanOpts.playerTeam = player && player.team;
    trafficPlanOpts.authorityRadius = tableSimAuthorityWuFromState(state);
    trafficPlanOpts.origin = player && player.pos;
    const inCeres = state.world && state.world.currentSectorId === CERES_ACTIVITY_SECTOR_ID;
    const trafficUrgent = this._trafficTokenUrgent || (this._trafficTokenUrgent = []);
    const trafficRest = this._trafficTokenRest || (this._trafficTokenRest = []);
    trafficUrgent.length = 0;
    trafficRest.length = 0;
    if (inCeres) {
      // Authored pocket jobs commission on the first Ceres ticks, before slot ids are stable
      // enough to NEAR-slice. Ambient leftovers stay urgent here; other sectors still slice.
      for (let i = 0; i < activeTraffic.length; i++) trafficUrgent.push(activeTraffic[i]);
    } else {
      for (let i = 0; i < activeTraffic.length; i++) {
        const entity = activeTraffic[i];
        const slot = entity && entity.data && entity.data.activityActorSlotId;
        if (slot && CERES_ACTIVITY_CAST_BY_SLOT_ID.has(slot)) trafficUrgent.push(entity);
        else trafficRest.push(entity);
      }
      const trafficSlice = takeNearWorkSlice(state, 'traffic', trafficRest);
      for (let i = 0; i < trafficSlice.length; i++) trafficUrgent.push(trafficSlice[i]);
    }
    for (const e of trafficUrgent) {
      const rec = recordById.get(e.id);
      if (!rec) continue;
      const i = recordIndexById.get(e.id);
      // The seven authored pocket actors yield movement to npcJobsRuntime. A completed one-shot job
      // releases data.jobId; recommission it from the same immutable activity descriptor before any
      // ambient role branch can run. The reserved Cinder service slot is excluded and continues to
      // use only its existing phase-gated worldSiteRoute below.
      const activityEntry = e.data
        && CERES_ACTIVITY_CAST_BY_SLOT_ID.get(e.data.activityActorSlotId);
      if (activityEntry && !activityEntry.service) {
        if (e.data.activityActorSlotId === CERES_AMBUSH_HAULER_SLOT_ID) {
          this._ensureAmbushLoadedHaulerManifest(e, rec);
        }
        if (!e.data.jobId) this._assignCeresActivityJob(e, activityEntry);
        this._reactCivilianViolence(e, rec, stations, state);
        continue;
      }
      if (hasLivePlayer && entityNeedsAiThink(e, state) === false) continue;
      // Nearby gunfire: civilians change course before ordinary / world-site / job branches.
      // Job hulls are interrupted through npcJobsRuntime; traffic never writes their intent.
      if (this._reactCivilianViolence(e, rec, stations, state)) {
        this._syncTrafficRecordToData(e, rec);
        continue;
      }
      // One authored recurring passenger liner owns the existing express hull and V3 boost route.
      // Its passenger itinerary must consume the tick before the generic express/freight branch.
      if (this._stepPassengerLinerService(e, rec, stations, dt)) {
        this._syncTrafficRecordToData(e, rec);
        continue;
      }
      // One authored recurring courier owns a saved berth/departure timetable. It still delegates
      // actual transit to npcJobsRuntime, but traffic keeps its service state readable while that
      // job is live (or interrupted) instead of falling through to ambient random routing.
      if (this._stepPriorityCourierService(e, rec, stations, dt)) {
        this._syncTrafficRecordToData(e, rec);
        continue;
      }
      // PQ-014: when this hull carries a live NPC job, npcJobsRuntime owns its steering. Traffic
      // yields entirely (no setIntent) so there is exactly one intent writer per job hull per tick.
      if (rec.role === 'ore_carrier' && state.world?.currentSectorId === 'sector_helios_prime'
        && !rec.worldSiteRoute && !rec.claimTravelRoute && !e.data?.claimDepotId) {
        // Old saves may still carry the former generic miner job. Release that one ownership
        // before the collector writes an intent, retaining any already-laden cargo.
        if (e.data?.jobId && this.helpers.npcJobs?.controlClaim?.(e.data.jobId)) continue;
        if (e.data?.jobId) this.helpers.npcJobs?.release?.(e.data.jobId);
        if (e.data?.jobId) continue;
        if (this._ambientPlanGate(state.tick, e, trafficPlanOpts)) {
          this._stepHeliosOreCarrier(e, rec, stations, state);
          this._syncTrafficRecordToData(e, rec);
        }
        continue;
      }
      if (stepCharonSupply(this, e, rec)) { this._syncTrafficRecordToData(e, rec); continue; }
      if (stepWinnowRecovery(this, e, rec)) { this._syncTrafficRecordToData(e, rec); continue; }
      if (e.data?.itinerary?.kind === 'anvil_work') continue;
      if (e.data && e.data.jobId) continue;
      if (e.data?.claimDepotId) continue; // wait for the depot's next berth job, never ambient rerouting
      const role = TRAFFIC_ROLES[rec.role] || TRAFFIC_ROLES.hauler;

      if (rec.worldSiteRoute) {
        this._stepWorldSiteRoute(e, rec, stations, dt, worldRecordIndex, worldRecordIndex === liveWorldRecordMap);
        this._syncTrafficRecordToData(e, rec);
        continue;
      }
      if (rec.claimTravelRoute) {
        this._stepClaimTravelRoute(e, rec, stations, dt);
        this._syncTrafficRecordToData(e, rec);
        continue;
      }

      // Role-specific behavior dispatch (spec §12.1). Each role has a distinct, readable behavior.
      if (role.orbits) { this._stepOrbit(e, rec, stations, dt); this._syncTrafficRecordToData(e, rec); continue; }       // patrol
      if (role.flees) { this._stepFlee(e, rec, stations, state); this._syncTrafficRecordToData(e, rec); continue; }       // pirate/raider
      if (role.loiters || rec.role === 'tourist') { this._stepTourist(e, rec, stations, state, dt); this._syncTrafficRecordToData(e, rec); continue; } // tourist
      if (rec.role === 'rescue') { if (this._stepRescue(e, rec, stations, state, dt)) { this._syncTrafficRecordToData(e, rec); continue; } } // rescue craft responding to distress/survivor
      // Miners/escorts/haulers keep last intent on skipped ticks. Hostiles still plan every tick.
      // _ambientPlanGate is the allocation-free mirror of shouldAmbientHaulerPlan (above).
      if (!this._ambientPlanGate(state.tick, e, trafficPlanOpts)) continue;
      if (role.seeks === 'asteroid') { this._stepMiner(e, rec, stations, state); this._syncTrafficRecordToData(e, rec); continue; } // miner
      if (role.escorts) { this._stepEscort(e, rec, list, state); this._syncTrafficRecordToData(e, rec); continue; }       // convoy escort
      if (rec.role === 'tug') { if (this._stepTug(e, rec, stations, state, dt)) { this._syncTrafficRecordToData(e, rec); continue; } } // tug assisting disabled ship

      // resolve current target (it may have despawned)
      let target = state.entities.get(rec.targetId);
      if (!target || !target.alive) {
        target = role.express
          ? this._pickExpressDestination(stations, null)
          : this._pickStation(stations);
        rec.targetId = target ? target.id : null;
        if (!target) continue;
        if (role.express) {
          this._stampExpressRoute(e, rec, null, target,
            (state.world && state.world.currentSectorId) || 'unknown', i);
        }
      }

      // waiting at station?
      if (rec.waitT > 0) {
        rec.waitT -= dt;
        setIntent(e, 0, 0, false, false, null, e.rot);
        this._syncTrafficRecordToData(e, rec);
        continue;
      }

      // fly toward target
      const dx = target.pos.x - e.pos.x;
      const dz = target.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz);
      const aimAngle = Math.atan2(dz, dx);
      if (dist < DOCK_RANGE) {
        // arrived: emit owner-safe freight arrival (manifest → stock pressure), wait, re-route
        rec.nextTradeT -= dt;
        if (rec.nextTradeT <= 0 && role.trades) {
          // A claim convoy whose job was released (not completed) inside dock range still carries
          // its manifest for the beat before re-assignment — that freight settles through
          // claim:convoyDocked, never through an ambient trade (D96).
          if (!(e.data && e.data.claimConvoy)) this._emitArrival(e, rec, target);
          rec.nextTradeT = TRADE_INTERVAL_S + this._rng() * 6;
        }
        rec.waitT = 2.5 + this._rng() * 2;
        const nextTarget = role.express
          ? this._pickExpressDestination(stations, target)
          : this._pickStation(stations);
        rec.targetId = nextTarget.id;
        if (role.express) {
          // Each completed leg advances the durable itinerary while retaining stable ship identity.
          e.data.itinerary = null;
          this._stampExpressRoute(e, rec, target, nextTarget,
            (state.world && state.world.currentSectorId) || 'unknown', rec.dockSeq | 0);
        }
        setIntent(e, 0, 0, false, false, null, aimAngle);
        this._syncTrafficRecordToData(e, rec);
        continue;
      }
      // drive: face the target, thrust forward. moveZ=1 means forward along the nose.
      const expressBoost = !!(role.express && massline2Flag('hitchhiking'));
      setIntent(e, 0, 1, expressBoost, false, null, aimAngle);
      this._syncTrafficRecordToData(e, rec);
      // V3 reads this intent and applies real thrust. Traffic never writes velocity, so a latched
      // player receives only the Rapier constraint pull and whatever momentum the liner earns.
    }
    if (lostWorldSiteRoute) {
      this._applyWorldSiteTrafficHooks(state.world && state.world.currentSectorId);
    }
    if (lostClaimTravelRoute) {
      this._applyClaimTravelHooks(state.world && state.world.currentSectorId);
    }
    // Demand-driven cleanup profession: after ambient steppers, see whether fresh wrecks/payloads
    // need a cutter. No separate scheduler — same traffic tick that flies everyone else.
    this._dispatchGeneralSalvors(state.world && state.world.currentSectorId);
    this._maintainGeneralSalvorJobs();
    // Same tick, same rule: a loose body in the pocket is a tow somebody is paid to make.
    this._dispatchYardTugs(state.world && state.world.currentSectorId);
    this._maintainYardTugJobs();
    this._publishTrafficCount(state);
  },

  _publishTrafficCount(state = this.state) {
    if (!state) return;
    const freighters = state.traffic && state.traffic.freighters;
    const count = Array.isArray(freighters) ? freighters.length : 0;
    if (state.traffic) {
      state.traffic.count = count;
      state.traffic.liveCount = count;
    }
    if (state.player) state.player.trafficCount = count;
  },

  _stepWorldSiteRoute(entity, rec, stations, dt, worldRecordIndex = null, worldRecordIndexIsLive = false) {
    const route = rec.worldSiteRoute;
    // The per-tick map can miss a carrier stamped with its record id after spawn; the helper
    // resolves those through the same entity walk and reseeds the index map on a hit.
    let site = worldRecordIndex && worldRecordIndex.get(route.siteWorldRecordId);
    // Live index rows aren't alive-filtered like the scratch copy — a dead-but-still-mapped
    // carrier resolves the same way the copy's undefined did: through the walk below.
    if (site && site.alive === false) site = null;
    if (!site) {
      // A permanently-absent site is the index's documented negative hole: the map cannot
      // cache a miss, so every routed freighter otherwise re-walks the entity set per tick.
      // Memoize misses on the worldRecordIds lane — appends/removes and registered post-spawn
      // stamps all bump it, so a served miss is bit-identical to what the fallback walk sees
      // and the walk's repair path stays open across any mutation.
      const lane = entityIndexLaneVersion(this.state, ['worldRecordIds']);
      const memo = this._worldSiteRouteMissMemo || (this._worldSiteRouteMissMemo = { lane: -1, ids: new Set() });
      if (lane < 0 || memo.lane !== lane) {
        memo.lane = lane;
        memo.ids.clear();
      }
      if (!memo.ids.has(route.siteWorldRecordId)) {
        site = entityWithWorldRecord(this.state, route.siteWorldRecordId);
        if (site) {
          // A walk-hit on the live index already registered itself (count + marker + lane
          // via registerEntityWorldRecordId inside indexedWorldRecordEntity) — a bare set
          // would diverge the bookkeeping. The scratch copy still needs its per-tick reseed.
          if (worldRecordIndex && !worldRecordIndexIsLive) worldRecordIndex.set(route.siteWorldRecordId, site);
        } else {
          memo.ids.add(route.siteWorldRecordId);
        }
      }
    }
    const station = stations.find((candidate) => stationIdentity(candidate) === route.stationId);
    const target = route.endpoint === 'station' ? station : site;
    let targetPos = target && target.pos;
    let targetId = target && target.id;
    let stagingForHazard = false;
    if (route.endpoint === 'site'
      && route.hazardPolicy === 'cinder-sluice-phase-gate'
      && route.siteId === CINDER_SLUICE_SITE_ID
      && route.stagingPos) {
      const record = this.state.sites && this.state.sites.worldById
        && this.state.sites.worldById[CINDER_SLUICE_SITE_ID];
      const phase = record ? cinderSluicePhase(record, this.state.simTime) : null;
      const alreadyCommitted = pointInsideCinderSluice(entity.pos);
      if (phase && !alreadyCommitted && phase.phase !== 'calm' && phase.phase !== 'quiet') {
        targetPos = route.stagingPos;
        targetId = null;
        stagingForHazard = true;
        const hold = route.hazardHold || (route.hazardHold = {});
        hold.phase = phase.phase;
        hold.remainingS = phase.remainingS;
      } else {
        delete route.hazardHold;
      }
    } else {
      delete route.hazardHold;
    }
    if (!targetPos) {
      setIntent(entity, 0, 0, false, false, null, entity.rot);
      return;
    }
    rec.targetId = targetId;
    if (rec.waitT > 0) {
      rec.waitT = Math.max(0, rec.waitT - dt);
      setIntent(entity, 0, 0, false, false, null, entity.rot);
      return;
    }
    const dx = targetPos.x - entity.pos.x;
    const dz = targetPos.z - entity.pos.z;
    const aim = Math.atan2(dz, dx);
    if (Math.hypot(dx, dz) < DOCK_RANGE) {
      if (stagingForHazard) {
        setIntent(entity, 0, 0, false, false, null, aim);
        return;
      }
      route.endpoint = route.endpoint === 'station' ? 'site' : 'station';
      rec.waitT = 2.5;
      setIntent(entity, 0, 0, false, false, null, aim);
      return;
    }
    setIntent(entity, 0, 1, false, false, null, aim);
  },

  _stepClaimTravelRoute(entity, rec, stations, dt) {
    const route = rec.claimTravelRoute;
    const station = stations.find((candidate) => stationIdentity(candidate) === route.stationId);
    const target = route.endpoint === 'station'
      ? station && station.pos
      : route.slingPos;
    if (!target) {
      setIntent(entity, 0, 0, false, false, null, entity.rot);
      return;
    }
    rec.targetId = route.endpoint === 'station' && station ? station.id : null;
    if (rec.waitT > 0) {
      rec.waitT = Math.max(0, rec.waitT - dt);
      setIntent(entity, 0, 0, false, false, null, entity.rot);
      return;
    }
    const dx = target.x - entity.pos.x;
    const dz = target.z - entity.pos.z;
    const aim = Math.atan2(dz, dx);
    if (Math.hypot(dx, dz) < DOCK_RANGE) {
      route.endpoint = route.endpoint === 'station' ? 'sling' : 'station';
      rec.waitT = 2.5;
      setIntent(entity, 0, 0, false, false, null, aim);
      return;
    }
    // This is a normal V3 intent. The infrastructure chooses the job's two physical endpoints;
    // it never assigns position or velocity and never bypasses NPC thrust/turn authority.
    setIntent(entity, 0, 1, true, false, null, aim);
  },





};

export function setIntent(e, moveX, moveZ, boost, fire, fireGroup, aimAngle) {
  const data = e.data || (e.data = {});
  const intent = data.intent || (data.intent = { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0 });
  intent.moveX = moveX;
  intent.moveZ = moveZ;
  intent.boost = boost;
  intent.fire = fire;
  intent.fireGroup = fireGroup;
  intent.aimAngle = aimAngle;
}

const INDUSTRY_HAUL_TARGET_REF = /^[a-z][a-z0-9-]*(?::[a-z_][a-z0-9_.-]*)+$/;

export function industryHaulWaypointSpec(pointId, point, prefix) {
  const waypoint = {
    id: `${prefix}:${pointId}`,
    pos: { x: point.pos.x, z: point.pos.z },
    label: point.label,
  };
  if (typeof point.targetRef === 'string' && INDUSTRY_HAUL_TARGET_REF.test(point.targetRef)) {
    waypoint.targetRef = point.targetRef;
  }
  return waypoint;
}

function industryHaulWaypointMatches(waypoint, pointId, pos) {
  if (!waypoint || !waypoint.pos || !pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return false;
  const id = typeof waypoint.id === 'string' ? waypoint.id : '';
  if (id !== `origin:${pointId}` && id !== `dest:${pointId}`) return false;
  const dx = waypoint.pos.x - pos.x;
  const dz = waypoint.pos.z - pos.z;
  return dx * dx + dz * dz <= 1;
}

export function industryHaulRouteAims(route, sourceId, sourcePos, destinationId, destPos) {
  if (!Array.isArray(route) || route.length < 2) return false;
  return industryHaulWaypointMatches(route[0], sourceId, sourcePos)
    && industryHaulWaypointMatches(route[route.length - 1], destinationId, destPos);
}

export function industryHaulerEligible(rec, entity) {
  const data = entity && entity.data;
  if (!data || typeof data.worldRecordId !== 'string' || !data.worldRecordId) return false;
  if (data.worldSiteTrafficHookId || data.claimTravelTrafficHookId || data.namedLaneContactId) return false;
  if (data.ceresActivityCast === true || data.authoredActivityCast === true) return false;
  if (data.activityActorSlotId || data.claimDepotId) return false;
  const role = (rec && rec.role) || data.trafficRole;
  return role === 'hauler' || data.jobKind === 'hauler';
}

export function stationIdentity(station) {
  if (!station) return null;
  const data = station.data || {};
  const id = data.stationId || data.id || station.id;
  return id == null ? null : String(id);
}

export function dominantAsteroidCommodity(asteroid) {
  const data = asteroid && asteroid.data || {};
  if (typeof data.commodityId === 'string' && data.commodityId) return data.commodityId;
  const def = ASTEROID_BY_ID.get(data.typeId) || ASTEROID_BY_ID.get('ast_common_rock');
  const entries = Object.entries(def && def.oreTable || {});
  entries.sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0) || a[0].localeCompare(b[0]));
  return entries[0] && entries[0][0] || 'cmdty_silicate';
}

export function entityWithWorldRecord(state, worldRecordId) {
  return indexedWorldRecordEntity(state, worldRecordId);
}

/**
 * The durable CONVOY worldRecordId a ceres activity actor is stamped under — the cast
 * entry's authored worldRecordSlotId, else the `ceres:activity:` convention. Exported so
 * slot-scoped lookups outside traffic (audio cue positioning) probe the world-record index
 * instead of walking entityList.
 */
export function ceresActivityActorWorldRecordId(state, slotId) {
  if (typeof slotId !== 'string' || !slotId) return null;
  const entry = CERES_ACTIVITY_CAST_BY_SLOT_ID.get(slotId);
  const worldRecordSlotId = entry && entry.slot && entry.slot.worldRecordSlotId
    ? entry.slot.worldRecordSlotId
    : `ceres:activity:${slotId}`;
  const seed = (state && state.meta && state.meta.seed) || 1;
  return stableRecordId(
    seed,
    CERES_ACTIVITY_SECTOR_ID,
    RECORD_KIND.CONVOY,
    worldRecordSlotId,
  );
}

// Per-tick worldRecordId → entity index for callers that resolve several records in one pass
// (world-site routes). When the entity index is ready its byWorldRecordId map is the source
// (O(record count) instead of O(entity count) per tick); otherwise one walk of the entity
// map replaces one walk per lookup, as before.
function buildWorldRecordIndex(state, into) {
  into.clear();
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && index.ready === true
    && index.byWorldRecordId instanceof Map) {
    for (const [worldRecordId, entity] of index.byWorldRecordId) {
      if (entity && entity.alive !== false) into.set(worldRecordId, entity);
    }
    return into;
  }
  const entities = state && state.entities;
  if (!entities || typeof entities.values !== 'function') return into;
  for (const entity of entities.values()) {
    if (!entity || entity.alive === false || !entity.data) continue;
    const worldRecordId = entity.data.worldRecordId;
    if (worldRecordId == null) continue;
    into.set(worldRecordId, entity);
  }
  return into;
}

export function liveEntity(state, id) {
  const entity = state && state.entities && state.entities.get && state.entities.get(id);
  return entity && entity.alive !== false ? entity : null;
}

export function entityPos(entity) {
  const pos = entity && entity.pos;
  const x = Number(pos && pos.x);
  const z = Number(pos && pos.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return pos;
}

export function isSurvivalCohort(entity) {
  return !!(entity && entity.data && entity.data.runCohort === 'survival');
}

export function stableTrafficKey(entity) {
  return String(entity && entity.data && entity.data.worldRecordId || entity && entity.id || '');
}

export function isWorldSiteTrafficFallbackRole(roleId) {
  const role = TRAFFIC_ROLES[roleId];
  return !!role && !role.orbits && !role.escorts && !role.flees;
}

export function stationName(station, fallback) {
  const data = station && station.data || {};
  return String(data.name || data.label || fallback || 'Local');
}
