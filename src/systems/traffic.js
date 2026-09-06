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

import { isRunSealed } from '../core/runSeal.js';
import { shouldAmbientHaulerPlan, shouldRunOnTick } from '../core/activityScheduler.js';
import { tableSimAuthorityWuFromState } from '../render/tabletopPolicy.js';
import {
  ensureActivityClassified,
  entityNeedsAiThink,
  getActivityOwnerEntities,
} from '../world/activityRuntime.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from './ships.js';
import { CombatDoctrineId } from '../ai/combatDoctrine.js';
import { drawSeeded, hash32 } from '../core/rng.js';
import {
  RECORD_KIND,
  stableRecordId,
} from '../world/worldRecords.js';
import {
  buildCargoManifest,
  buildArrivalIntent,
  buildLossIntent,
  filterNewFreightIntents,
  mergeAppliedFreightIds,
  pressureShareRecipe,
  abstractBaselineVolume,
  FREIGHT_TRADING_ROLES,
  FREIGHT_MARKET_KEYS_FALLBACK,
  liveVolumeForSector,
} from '../economy/freightCausality.js';
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
  pickNamedLaneContact,
} from '../data/laneContacts.js';
import { ASTEROIDS } from '../data/mining.js';
import { massline2Flag } from '../data/featureFlags.js';
import {
  regionalTrafficDensityMultiplier,
  regionalTrafficRoleWeights,
} from './regionalEcology.js';
import {
  CINDER_SLUICE_SITE_ID,
  CINDER_SLUICE_TRAFFIC_STAGING_POS,
  cinderSluicePhase,
  pointInsideCinderSluice,
} from '../data/environmentalMachinery.js';
import { ceresDisabledHaulerManifestTruth } from '../data/contactHail.js';
import {
  CERES_ACTIVITY_POCKETS,
  CERES_ACTIVITY_SECTOR_ID,
  CERES_ACTIVITY_SERVICE_SLOTS,
} from '../data/sectorActivityPockets.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { NPC_JOB_PHASE, NPC_JOB_SCHEMA } from './npcJobs.js';
import {
  claimRichSeamOpportunity,
  openRichSeamOpportunity,
  missReservedRichSeamOpportunity,
  reserveRichSeamOpportunity,
  richSeamOpportunityForEntity,
} from './fieldDepletion.js';

const FREIGHTER_SHIP = 'ship_mule'; // a freighter hull from data/ships.js (cargo-capable, slow)
// Core pocket density (spec2/04 §4: core 6–9 concurrent). Cap keeps perf predictable.
const MAX_PER_SECTOR = 8;
const CORE_MIN_TRAFFIC = 6;    // high-security / high-tpm cores never feel empty
const DEFAULT_TRAFFIC = 3;     // sectors without explicit trafficPerMin get a small ambient count
const SPEED = 28;              // wu/s — slow, reads as a heavy freighter
const DOCK_RANGE = 60;         // how close before "docking" (trading)
const TRADE_INTERVAL_S = 8;    // min seconds between trades per freighter (staggered)
const POCKET_CLUSTER_R = 420;  // first freighters cluster near a pocket station for sensor density

function priorityCourierServiceForSector(sectorId) {
  return sectorId === PRIORITY_COURIER_SERVICE.sectorId ? PRIORITY_COURIER_SERVICE : null;
}

function passengerLinerServiceForSector(sectorId) {
  return sectorId === PASSENGER_LINER_SERVICE.sectorId ? PASSENGER_LINER_SERVICE : null;
}

const PASSENGER_LINER_RECEIPT_CAP = 24;
const PASSENGER_LINER_SUSPENSION_CAP = 4;
const PASSENGER_LINER_INVALIDATED_CAP = 8;
const PASSENGER_LINER_INCIDENT_MAX_AGE_S = 180;
const PASSENGER_LINER_ACTIVE_INCIDENT_STATUSES = new Set(['distress', 'responding', 'monitoring']);

function passengerLinerLegIds(worldRecordId, legSeq) {
  const root = `${String(worldRecordId)}:${legSeq}`;
  return {
    passengerId: `passenger:${root}`,
    ticketId: `ticket:${root}`,
    receiptId: `passenger-liner-receipt:${root}`,
  };
}

function compactStableIds(value, cap) {
  if (!Array.isArray(value)) return [];
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
const MINER_FIELD_SPREAD_CAP = 4;
// One visible 30-second work stop cuts a bounded parcel smaller than the economy's 15u live-arrival
// ceiling. This is enough for one or two barges to contend a recovering field without strip-mining
// it faster than the player can participate.
const NPC_MINER_WORK_BATCH_U = 8;
const CERES_RICH_SEAM_OBJECT_SLOT_ID = 'ceres_seam_ore_clast';

function ceresSeamMinerOwnerIdentity(entity, record = null) {
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
const PINNED_BODY_MASS = 1e6;
// The tug's own load. `pod_cargo_container` is the authored container the PQ-019 capsule already
// uses, so the lot arrives as a real manufactured body rather than a soft billboard, and
// `presentationAdmission` admits it by that exact asset id.
const YARD_TUG_LOT = Object.freeze({
  assetId: 'pod_cargo_container',
  radius: 9,
  // The Mule hull the tug flies is mass 55. The towing proof moved an 80-mass load behind a 20-mass
  // hull (4x) through the same `tether_standard` policy, so 190 sits inside a ratio already shown to
  // drag rather than snap. Heavier than the 180 heist capsule because this one is meant to look big.
  mass: 190,
  hull: 220,
});
// Notice delay before a fresh wreck/payload draws a cutter (sim-seconds). Hash-pinned per target
// so two seeds with the same aftermath produce the same response time without a scheduler queue.
const SALVOR_NOTICE_DELAY_MIN_S = 18;
const SALVOR_NOTICE_DELAY_SPAN_S = 27; // inclusive span → 18..45 s
// Announced freight spills skip the 18-45 s stumble delay: the distress channel already named them.
const SPILL_ANNOUNCE_NOTICE_S = 2;
const SPILL_POD_CARRIER_RADIUS = 240;
const SALVOR_WORK_LEDGER_CAP = 256;
const CIVILIAN_MANIFEST_PAYLOAD_TYPE = 'civilian_manifest';
const NPC_MINER_WORK_LEDGER_CAP = 512;
const CERES_JOB_ACTION_LEDGER_CAP = 512;
const CERES_JOB_ACTION_RECEIPT_SCHEMA = 'spaceface.trafficJobActionReceipt.v1';
const CERES_JOB_ACTION_RECEIPT_EVENT = 'traffic:jobActionReceipt';
export const TRAFFIC_HEAVE_TO_DURATION_S = 5;
export const TRAFFIC_HEAVE_TO_COOLDOWN_S = 12;
export const TRAFFIC_LAW_LOSS_CAUSE = 'lawful_patrol_loss';
// Ambient civilians notice nearby gunfire. The listener only stamps a point; the role stepper
// decides whether that hull runs, holds, or keeps its tow. Radius and fade are in player units.
const CIVILIAN_VIOLENCE_RADIUS_WU = 300;
const CIVILIAN_VIOLENCE_RADIUS_SQ = CIVILIAN_VIOLENCE_RADIUS_WU * CIVILIAN_VIOLENCE_RADIUS_WU;
const CIVILIAN_ALARM_TTL_S = 5;
const CIVILIAN_VIOLENCE_RING_CAP = 8;
const CIVILIAN_ALARM_FLEE_ROLES = new Set(['hauler', 'courier', 'ore_carrier', 'shuttle', 'tug']);
const CIVILIAN_ALARM_HOLD_ROLES = new Set(['miner', 'surveyor', 'tender', 'salvor']);
const CERES_LAW_RESPONSE_SLOT_IDS = new Set([
  'ceres_ambush_escort',
  'ceres_cathedral_patrol',
]);
const CERES_LAW_RESPONSE_WASP_FITTINGS = Object.freeze(
  fittingsFromDefaultModules('ship_wasp', ['wpn_pulse_laser_s']),
);
const ASTEROID_BY_ID = new Map(ASTEROIDS.map((def) => [def.id, def]));

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

function factionHullFor(anchorHull, factionId, rng) {
  const groups = FLEET_BY_FACTION.get(factionId);
  if (!groups) return anchorHull;
  const group = groups.find((entry) => entry.hullIds.includes(anchorHull));
  if (!group || group.hullIds.length < 2) return anchorHull;
  return group.hullIds[Math.floor(rng() * group.hullIds.length)] || anchorHull;
}

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
  // Held back deliberately (no role here, so they never roll): `tanker`
  // (volatiles_tanker) and `customs` (inspection_cutter). The yard tug is a bounded draft
  // through the existing hauler job/economy path pending the current owner visual review;
  // its physical tow attachment is owned separately.
  prospector: { ship: 'ship_drifter',  team: 2, speed: 32, archetype: 'fleeing_trader', weight: 5,
              label: 'Prospector', docks: true, trades: false, seeks: 'asteroid' },
  sweeper:    { ship: 'ship_pelican',  team: 2, speed: 28, archetype: 'fleeing_trader', weight: 4,
              label: 'Scrap Sweeper', docks: true, trades: false },
  shuttle:    { ship: 'ship_mule',     team: 2, speed: 38, archetype: 'fleeing_trader', weight: 4,
              label: 'Apron Shuttle', docks: true, trades: true },
  // The tug carries a finite freight lot through the existing hauler graph. Its lower planning
  // speed keeps the working hull visibly distinct until the combat/tether owner supplies its
  // real attached load.
  tug:        { ship: 'ship_mule',     team: 2, speed: 20, archetype: 'passive', weight: 4,
              label: 'Yard Tug', docks: true, trades: true },
};

function lawPresenceRole(role) {
  return role === 'patrol' || role === 'escort';
}

function occupationalJobKind(role) {
  return OCCUPATIONAL_JOB_KIND_BY_ROLE[role] || null;
}

// Exported for the PQ-045 identity contract test (distinct hull + label per occupational role);
// not a new write seam — runtime ownership of role resolution is unchanged.
export { TRAFFIC_ROLES };

const HEAVE_TO_COMPLIANT_ROLES = new Set([
  'hauler',
  'courier',
  'miner',
  'smuggler',
  'express',
  'rescue',
  'surveyor',
  'salvor',
  'tender',
  'ore_carrier',
  'patrol',
  'escort',
  'prospector',
  'sweeper',
  'shuttle',
  'tug',
]);

function trafficHeaveToComplies(role, entity) {
  if (!HEAVE_TO_COMPLIANT_ROLES.has(String(role || '').toLowerCase())) return false;
  const ai = entity && entity.data && entity.data.ai;
  return !(ai && ai.pirate === true);
}

const CERES_TENDER_SLOT_ID = 'ceres_refinery_tender';
const CERES_REFINERY_HAULER_SLOT_ID = 'ceres_refinery_hauler';
const CERES_AMBUSH_HAULER_SLOT_ID = 'ceres_ambush_loaded_hauler';
const CERES_SEAM_MINER_SLOT_ID = 'ceres_seam_miner';
const CERES_CATHEDRAL_SALVOR_SLOT_ID = 'ceres_cathedral_salvor';
const CERES_CATHEDRAL_PATROL_SLOT_ID = 'ceres_cathedral_patrol';
const CERES_CINDER_HOOK_ID = 'ceres_cinder_sluice_service';
const CERES_ACTIVITY_CAST = Object.freeze([
  ...CERES_ACTIVITY_POCKETS.flatMap((pocket) => pocket.actorSlots
    .filter((slot) => slot.id !== CERES_TENDER_SLOT_ID)
    .map((slot) => Object.freeze({ pocket, slot, service: false }))),
  ...CERES_ACTIVITY_SERVICE_SLOTS.map((slot) => Object.freeze({ pocket: null, slot, service: true })),
]);
const CERES_ACTIVITY_CAST_BY_SLOT_ID = new Map(CERES_ACTIVITY_CAST.map((entry) => [entry.slot.id, entry]));
const CERES_ACTIVITY_JOB_KINDS = new Set(['hauler', 'miner', 'surveyor', 'patrol', 'salvor']);
const CERES_PRIMARY_ACTION_BY_JOB_KIND = Object.freeze({
  hauler: Object.freeze({ action: 'unload', phase: NPC_JOB_PHASE.UNLOAD, intentField: 'destination' }),
  miner: Object.freeze({ action: 'work', phase: NPC_JOB_PHASE.WORK, intentField: 'field' }),
  surveyor: Object.freeze({ action: 'work', phase: NPC_JOB_PHASE.WORK, intentField: 'field' }),
  salvor: Object.freeze({ action: 'work', phase: NPC_JOB_PHASE.WORK, intentField: 'field' }),
  patrol: Object.freeze({ action: 'hold', phase: NPC_JOB_PHASE.HOLD, intentField: 'at' }),
});
const CERES_ORE_BARGE_UNLOAD_ACTION = Object.freeze({
  action: 'unload', phase: NPC_JOB_PHASE.UNLOAD, intentField: 'destination',
});

// ── PQ-045.causal-chain ──────────────────────────────────────────────────────────────────────────
// Eight catalog microevents form ONE authored causal story in the Ceres reference sector (the
// last, ev_rock_calving, is the environmental coda that closes every cycle). This is a
// choreography timer bound to the cast that already flies — not a generic ambient-event policy
// layer. Concurrency is hard-capped at two active links; later links wait on seeds, not on a
// cooldown/draw policy. Ledger lives on the traffic instance only (transient; out of the save
// envelope), identity keys are worldRecordSlotId / jobId, and movement stays with npcJobsRuntime.
const CERES_CAUSAL_CHAIN_SCHEMA = 'spaceface.ceresCausalChain.v1';
const CERES_CAUSAL_CHAIN_EVENT = 'traffic:ceresCausalChain';
const CERES_CAUSAL_CHAIN_MAX_CONCURRENT = 2;
const CERES_CAUSAL_CHAIN_CYCLE_GAP_S = 45;
const CERES_MINER_HAULER_HANDOFF_SCHEMA = 'spaceface.ceresMinerHaulerHandoff.v1';
const CERES_MINER_HAULER_SAVE_SCHEMA = 'spaceface.traffic.ceresMinerHaulerSave.v1';
const CERES_MINER_HAULER_HANDOFF_RANGE_WU = 72;
const CERES_REFINERY_HAULER_CAPACITY_U = 28;
const CERES_MINER_HAULER_HANDOFF_STATES = new Set([
  'requested', 'rendezvous', 'in_transit', 'delivered', 'interrupted',
]);
// PQ-048.04 is deliberately one bounded service incident, not another ambient controller. The
// save record names durable actors only; numeric entity ids are always re-bound from the live cast.
const CERES_TENDER_SERVICE_INCIDENT_SCHEMA = 'spaceface.ceresTenderServiceIncident.v1';
const CERES_TENDER_SERVICE_STATES = new Set([
  'impair', 'approach', 'holding', 'repair', 'succeeded', 'failed',
]);
const CERES_TENDER_SERVICE_TERMINAL_STATES = new Set(['succeeded', 'failed']);
const CERES_TENDER_SERVICE_STANDOFF_WU = 56;
const CERES_TENDER_SERVICE_CLEARANCE_WU = 12;
const CERES_TENDER_SERVICE_HOLD_S = 3;
const CERES_TENDER_SERVICE_REPAIR_AMOUNT = 999;
// The salvor's stack phase spills its cutting count as real ore pickups (see _spillCeresCutterCount).
const CERES_CUTTER_SPILL_PICKUPS = 3;
const CERES_CUTTER_SPILL_QTY = 2;
const CERES_CUTTER_SPILL_TTL_S = 180;
// ev_cargo_capsule_launch: one outbound refinery batch per cycle, launched once the day's ore is
// in traffic custody (ore_handoff). The capsule is a single grabbable pickup on a fixed ballistic
// leg; the TTL covers the authored launch..exit window plus coast margin before the lane is clean.
const CERES_CAPSULE_BATCH_U = 5;
const CERES_CAPSULE_COAST_SPEED_WU_S = 14;
const CERES_CAPSULE_TTL_S = 60;
const CERES_CAPSULE_LAUNCH_CLEARANCE_WU = 12;
// The calved fresh face out-pays the strike's default seam bonus (fieldDepletion default 8u):
// the catalog aftermath is "fresh faces are visibly brighter ore", so the re-armed window is the
// richer one. The target panel names it FRESH SEAM and the Hold's lot row shows the bonus size.
const CERES_CALVED_SEAM_BONUS_U = 12;
// Exact current combat-drive arithmetic: a targeted ion packet pays the component's flat armor,
// then lands exactly on its remaining health. Keeping this here means the incident never spills
// overflow into the miner's hull merely to make the service call look dramatic.
const CERES_TENDER_SERVICE_DRIVE_ARMOR_FLAT = 2;
const CERES_TENDER_SERVICE_DRIVE_ION_MULTIPLIER = 1.1;
// PQ-048.05 binds one real transferred ore lot to the existing Ceres hauler, combat, Massline,
// freight, cargo, law, and tender owners. The compact record contains only stable actor/cargo
// identities; numeric entity and pickup ids are rebound from durable annotations after Continue.
const CERES_DISABLED_HAULER_INCIDENT_SCHEMA = 'spaceface.ceresDisabledHaulerRecovery.v1';
const CERES_DISABLED_HAULER_ACTIVE_STATES = new Set([
  'impair', 'distress', 'player_recovery', 'responder_approach', 'responder_repair',
]);
const CERES_DISABLED_HAULER_TERMINAL_STATES = new Set([
  'repaired', 'recovered', 'stolen', 'abandoned', 'destroyed', 'failed',
]);
const CERES_DISABLED_HAULER_PLAYER_WINDOW_S = 20;
const CERES_DISABLED_HAULER_REPAIR_HOLD_S = 3;
const CERES_DISABLED_HAULER_REPAIR_AMOUNT = 999;
const CERES_DISABLED_HAULER_PICKUP_TTL_S = 180;
const CERES_DISABLED_HAULER_LAW_KIND = 'payload_theft';
const CERES_DISABLED_HAULER_OFFENDER_STABLE_ID = 'player';
// Scratch return for _ceresCausalActorBySlot — never retain across a second call.
const _CERES_CAUSAL_ACTOR_SCRATCH = { entity: null, rec: null, slotId: null };
const CERES_CAUSAL_STAMP_KEYS = Object.freeze([
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
    id: 'ev_rich_seam_strike',
    actorSlots: Object.freeze([CERES_SEAM_MINER_SLOT_ID]),
    // Starts from cast live; no prior seed.
    requires: Object.freeze([]),
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

// Exported for focused characterization tests (seconds-scale, seed-pinned). Not a new runtime seam.
export {
  CERES_CAUSAL_CHAIN,
  CERES_CAUSAL_CHAIN_EVENT,
  CERES_CAUSAL_CHAIN_SCHEMA,
  CERES_CAUSAL_CHAIN_MAX_CONCURRENT,
  MAX_GENERAL_SALVORS_PER_SECTOR,
  MAX_YARD_TUGS_PER_SECTOR,
  TOWABLE_BODY_MIN_RADIUS_WU,
};

function terminalWorldRecord(record) {
  return !!record && (record.alive === false
    || record.outcome === 'destroyed'
    || record.outcome === 'defeated');
}

function hasExactCeresSectorAuthority(entity) {
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

function sameJSONValue(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function validCausalManifest(manifest) {
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

function normalizeCeresMinerHaulerHandoff(value, copy = true) {
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

function normalizeCeresTenderServiceIncident(value, copy = true) {
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

function normalizeCeresDisabledHaulerIncident(value, copy = true) {
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

function ceresActivityJobSpec(entry) {
  if (!entry || entry.service || !entry.pocket || !entry.slot) return null;
  const { pocket, slot } = entry;
  const route = slot.route;
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
    }, CERES_ACTIVITY_SECTOR_ID);
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
    sectorId: CERES_ACTIVITY_SECTOR_ID,
    route: waypoints,
    speed,
  };
}

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
  else if (Array.isArray(sec.fields) && sec.fields.some((f) => f && (f.count | 0) > 0)) {
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
  return state ? regionalTrafficRoleWeights(state, sec.id, out) : out;
}
function pickRole(roleWeights, rng) {
  let total = 0; for (const w of Object.values(roleWeights)) total += Math.max(0, w);
  if (total <= 0) return 'hauler';
  let r = rng() * total;
  for (const [id, w] of Object.entries(roleWeights)) { r -= Math.max(0, w); if (r <= 0) return id; }
  return 'hauler';
}

/** Ambient count from trafficPerMin — core pockets floor at CORE_MIN_TRAFFIC. */
function ambientCountForSector(sector, state = null) {
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

export const traffic = {
  name: 'traffic',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._registry = ctx.registry || null;
    // live freighter records: id -> {targetId, waitT, nextTradeT, manifest, dockSeq}
    this._ensureState();
    this._active = []; // entity ids we spawned (for cleanup)
    this._stationScratch = [];
    this._activeTrafficScratch = [];
    this._activeTrafficIdsScratch = new Set();
    this._recordByIdScratch = new Map();
    this._recordIndexByIdScratch = new Map();
    this._pendingJobActionIds = new Set();
    this._pendingMinerWorkIds = new Set();
    this._pendingArrivalIds = new Set();
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

    if (this.helpers) {
      this.helpers.traffic = {
        ...(this.helpers.traffic || {}),
        heaveToEntity: (entityId, opts) => this.heaveToEntity(entityId, opts),
      };
    }

    this.bus.on('sector:enter', (p) => this._onSectorEnter(p));
    // Canonical seam is sector:exit (world never emits sector:leave). Continuous handoffs prune
    // dead tracking only; hard exits fully clean up freighters.
    this.bus.on('sector:exit', (p) => this._onSectorExit(p));
    // ECON-P2: freighter loss → owner-safe scarcity intents + named news (no wallet writes).
    this.bus.on('entity:killed', (p) => this._onEntityKilled(p));
    // Working freight is driven by npcJobsRuntime, so the ambient traffic stepper never reaches
    // its own work/dock branches. Consume only materialized kernel intents here and keep field and
    // economy authority on their existing event seams.
    this.bus.on('npcjobs:work', (p) => this._onNpcJobWork(p || {}));
    this.bus.on('npcjobs:load', (p) => this._onNpcJobLoad(p || {}));
    this.bus.on('npcjobs:unload', (p) => this._onNpcJobUnload(p || {}));
    this.bus.on('npcjobs:hold', (p) => this._onNpcJobHold(p || {}));
    // HELP is an explicit player hail intent. Traffic reserves the finite opportunity for the
    // answering seam miner; physical WORK below remains the sole rich-load/depletion writer.
    this.bus.on('contactHail:response', (p) => this._onContactHailResponse(p || {}));
    this.bus.on('surrender:tethered', (p) => this._onCeresDisabledHaulerPlayerClaim(p || {}));
    this.bus.on('surrender:secured', (p) => this._onCeresDisabledHaulerPlayerClaim(p || {}));
    this.bus.on('freight:recovery', (p) => this._onCeresDisabledHaulerRecovery(p || {}));
    this.bus.on('freight:recoveryAbandoned', (p) => this._onCeresDisabledHaulerAbandoned(p || {}));
    this.bus.on('pickup:collected', (p) => this._onCeresDisabledHaulerPickup(p || {}));
    this.bus.on('freight:cargoSpilled', (p) => this._onFreightCargoSpilled(p || {}));
    // Nearby violence: production hits and opened incidents, never permissive combat:fire.
    this.bus.on('combat:damage', (p) => this._onCombatDamage(p || {}));
    this.bus.on('law:incidentOpened', (p) => this._onLawIncidentOpened(p || {}));
    this.bus.on('save:restoring', () => {
      // Invalidate before the save owner starts destructive restore. Old synchronous owner stacks
      // may still unwind afterward, but their private reservation tokens no longer own this run.
      this._restoreEpochPending = true;
      this._ceresDisabledHaulerRestorePending = true;
      this._invalidateCausalRunEpoch();
    });
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
      const sectorId = this.state.world && this.state.world.currentSectorId;
      // Persistent general cutters materialize after world.enterSector, so the sector-enter
      // adoption pass cannot see them. Re-adopt here before the next traffic tick can refresh a
      // stable salvage point to its new numeric wreck id.
      this._adoptRematerializedTraffic(sectorId, this._sectorStations());
      // lawSecurity is session-only. A saved predeparture delay cannot remain asserted after its
      // raw incident map has gone away, while a saved physical diversion remains intact.
      this._clearStalePassengerLinerDelays();
      this._applyWorldSiteTrafficHooks(sectorId);
      this._applyClaimTravelHooks(sectorId);
      if (sectorId === CERES_ACTIVITY_SECTOR_ID) this._ensureCeresCausalChain('save_loaded');
    });
    const refreshClaimTravel = () => this._applyClaimTravelHooks(
      this.state.world && this.state.world.currentSectorId,
    );
    this.bus.on('claim:infrastructureActive', refreshClaimTravel);
    this.bus.on('claim:infrastructureStatus', refreshClaimTravel);
    this.bus.on('worldSite:operationReceipt', ({ siteId, receipt } = {}) => {
      // Held tools publish progress every fixed tick. Traffic topology changes only on completion;
      // projecting all sites and scanning freighters for every partial tick is pure hot-path waste.
      if (receipt?.complete !== true) return;
      const record = siteId && this.state.sites && this.state.sites.worldById && this.state.sites.worldById[siteId];
      this._applyWorldSiteTrafficHooks(record && record.sectorId);
    });
  },

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
    if (p && (p.continuous || p.noTeleport)) {
      this._pruneDead();
      return;
    }
    const sectorId = (p && p.sectorId)
      || (this.state.world && this.state.world.currentSectorId);
    if (sectorId === CERES_ACTIVITY_SECTOR_ID) this._captureCeresActivityCast();
    this._captureSourceBoundGeneralSalvors();
    this._cleanup();
  },

  _onSectorEnter(p) {
    const continuous = !!(p && (p.continuous || p.noTeleport));
    const requestedSectorId = (p && p.sector && p.sector.id)
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
    const sector = p && p.sector;
    if (!sector || !this.helpers || !this.helpers.spawnEntity) return;
    const sectorId = sector.id || requestedSectorId;
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
    // Density from trafficPerMin; high-sec cores floor at CORE_MIN_TRAFFIC (spec2/04 core pocket).
    // Explicit trafficPerMin:0 still means "hollow" (frontier silence).
    const count = ambientCountForSector(sector, this.state);
    if (count <= 0) return;

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
    const pocketRoles = ensurePocketRoleMix(roles, sector);
    const priorityService = priorityCourierServiceForSector(sectorId);
    const priorityCourierSlot = reservePriorityCourierRole(pocketRoles, sectorId);

    // Pocket anchor: cluster the first freighters near the busiest station so sensor-range
    // density holds for the first-hour Helios play space (not scattered to far yards only).
    const pocketStation = this._pocketStation(stations, sectorId);

    for (let i = 0; i < need; i++) {
      const role = pocketRoles[i] || 'hauler';
      const def = TRAFFIC_ROLES[role] || TRAFFIC_ROLES.hauler;
      const priorityCourier = !!priorityService && i === priorityCourierSlot;
      const station = priorityCourier
        ? (this._stationForPriorityCourier(stations, priorityService.stops[0]) || stations[0])
        : (i < Math.min(4, need) && pocketStation)
        ? pocketStation
        : (stations[Math.floor(this._rng() * stations.length)] || stations[0]);
      // spawn near the station but offset so they don't overlap it
      const ang = this._rng() * Math.PI * 2;
      const r = (i < Math.min(4, need))
        ? (90 + this._rng() * (POCKET_CLUSTER_R * 0.45))
        : (140 + this._rng() * 120);
      const pos = { x: station.pos.x + Math.cos(ang) * r, z: station.pos.z + Math.sin(ang) * r };
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
      const ent = this.helpers.spawnEntity(spec);
      if (!ent) continue;
      this._stampTrafficDurableIdentity(ent, sectorId, role, def, already + i);
      const target = priorityCourier
        ? (this._stationForPriorityCourier(stations, priorityService.stops[1]) || station)
        : def.express
        ? this._pickExpressDestination(stations, station)
        : this._pickStation(stations);
      const manifest = this._assignManifest(ent, role, target, sectorId);
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
        || home !== CERES_ACTIVITY_SECTOR_ID || authoredRecordIds.has(recordId)
        || terminalWorldRecord(record)) continue;
      if (worldOwner && typeof worldOwner.markWorldRecordDestroyed === 'function') {
        worldOwner.markWorldRecordDestroyed(recordId, { outcome: 'destroyed' });
        this._releaseCeresActivityJob(recordId);
        retiredRecordIds.add(recordId);
      }
    }

    const retiredEntityIds = new Set();
    for (const entity of this.state.entityList || []) {
      if (!entity || entity.alive === false || !entity.data || !entity.data.trafficRole) continue;
      const home = entity.homeSectorId || entity.data.homeSectorId || entity.data.sectorId;
      if (home !== CERES_ACTIVITY_SECTOR_ID
        || !retiredRecordIds.has(entity.data.worldRecordId)) continue;
      retiredEntityIds.add(entity.id);
      const remove = this.helpers && (this.helpers.removeEntity || this.helpers.despawnEntity);
      if (typeof remove === 'function') remove(entity.id);
      else entity.alive = false;
    }
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
        simTime: this.state.simTime,
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

  _materializeCeresActivityCast(sector) {
    this._ensureState();
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const records = this.state.world && this.state.world.records && this.state.world.records.byId
      ? this.state.world.records.byId
      : {};
    const prior = this.state.traffic.freighters || [];
    const authored = [];
    const authoredSlotIds = new Set(CERES_ACTIVITY_CAST.map(({ slot }) => slot.id));

    for (const entry of CERES_ACTIVITY_CAST) {
      const { pocket, slot, service } = entry;
      const recordId = stableRecordId(
        seed,
        CERES_ACTIVITY_SECTOR_ID,
        RECORD_KIND.CONVOY,
        slot.worldRecordSlotId,
      );
      const record = records[recordId] || null;
      if (terminalWorldRecord(record)) {
        this._releaseCeresActivityJob(recordId);
        continue;
      }

      let entity = entityWithWorldRecord(this.state, recordId);
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
    this._active = [...new Set(liveIds)];
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
    if (!Number.isFinite(data.recordCreatedTick)) data.recordCreatedTick = this.state.tick | 0;
    data.activityActorSlotId = entry.slot.id;
    data.ceresActivityCast = true;
    data.ceresActivityJobOwned = !entry.service;
    if (!entry.service) data.intent = null;
    entity.homeSectorId = CERES_ACTIVITY_SECTOR_ID;
    data.homeSectorId = CERES_ACTIVITY_SECTOR_ID;
    data.sectorId = CERES_ACTIVITY_SECTOR_ID;
  },

  _captureCeresActivityCast() {
    const worldOwner = this._registry && this._registry.get && this._registry.get('world');
    if (!worldOwner || typeof worldOwner.upsertWorldRecord !== 'function') return 0;
    let captured = 0;
    for (const record of this.state.traffic && this.state.traffic.freighters || []) {
      const entity = record && liveEntity(this.state, record.id);
      if (!entity || !entity.data || entity.data.ceresActivityCast !== true) continue;
      if (worldOwner.upsertWorldRecord(entity)) captured += 1;
    }
    return captured;
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
            || entity.data.worldSiteTrafficHookId
            || entity.data.claimTravelTrafficHookId)))
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
            || entity.data.worldSiteTrafficHookId
            || entity.data.claimTravelTrafficHookId)))
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

  // PQ-014 — natural NPC job assignment. Civilian traffic IS the natural producer for the three
  // job kinds: role 'miner' → miner job (home refinery ↔ asteroid field), 'hauler' → hauler job
  // (origin → destination terminal run), 'patrol' → patrol job (cyclic beat around a station).
  // Other roles keep their ambient stepper. Builds the route from the same in-sector stations /
  // asteroids the ambient steppers already use, so no new spawn fountain and no new geometry authority.
  _maybeAssignJob(ent, role, originStation, target, stations, sectorId) {
    const assign = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.assign;
    if (typeof assign !== 'function') return;                 // runtime not registered → strict no-op
    if (!ent || !ent.data || !ent.data.worldRecordId) return; // no stable identity → not a durable job
    if (ent.data.worldSiteTrafficHookId || ent.data.claimTravelTrafficHookId) return; // infrastructure owns this slot
    const spec = this._buildJobSpec(role, ent, originStation, target, stations, sectorId);
    if (!spec) return;
    const jobId = assign(ent, spec);
    if (jobId && (role === 'miner' || role === 'ore_carrier' || occupationalJobKind(role) === 'miner')) {
      // A commissioned barge departs empty. Its real cargo is created only when a materialized work
      // stop completes, so scanners never show a miner carrying random market goods outbound.
      const rec = this.state.traffic.freighters.find((candidate) => candidate && candidate.id === ent.id);
      this._setTrafficManifest(ent, rec, this._buildMinerManifest(ent, 0, null, 0, role));
    }
  },

  _buildJobSpec(role, ent, originStation, target, stations, sectorId) {
    const home = originStation && originStation.pos ? originStation : (stations && stations[0]);
    if (!home || !home.pos) return null;
    const priorityItinerary = role === 'courier'
      ? this._priorityCourierItinerary(ent, sectorId)
      : null;
    if (priorityItinerary) {
      const origin = this._stationForPriorityCourier(stations, priorityItinerary.originStationId);
      const destination = this._stationForPriorityCourier(stations, priorityItinerary.destinationStationId);
      if (!origin || !origin.pos || !destination || !destination.pos) return null;
      const manifest = ent && ent.data && ent.data.cargoManifest;
      if (!manifest || !Array.isArray(manifest.lines)) return null;
      return {
        kind: 'hauler',
        sectorId,
        speed: PRIORITY_COURIER_SERVICE.sprintSpeedWU,
        route: [
          { id: 'origin:' + stationIdentity(origin), pos: { x: origin.pos.x, z: origin.pos.z }, label: `${stationName(origin, 'Origin')} Berth` },
          { id: 'dest:' + stationIdentity(destination), pos: { x: destination.pos.x, z: destination.pos.z }, label: `${stationName(destination, 'Destination')} Gate` },
        ],
        payload: {
          manifest,
          priorityCourierService: {
            schema: PRIORITY_COURIER_JOB_SCHEMA,
            serviceId: PRIORITY_COURIER_SERVICE.id,
            legSeq: priorityItinerary.legSeq,
          },
        },
      };
    }
    if (role === 'miner' || role === 'ore_carrier' || occupationalJobKind(role) === 'miner') {
      // The seam this refinery actually works, not a rock drawn uniformly from the whole 4200-unit
      // sector. `spread` walks the nearest few faces so a shift's barges sit beside each other
      // instead of stacking on one; it is derived from the live job count, so it is deterministic
      // and does not consume the traffic RNG stream (which would move every later seeded draw).
      const spread = this.state.npcJobs && this.state.npcJobs.byId
        ? Object.keys(this.state.npcJobs.byId).length % MINER_FIELD_SPREAD_CAP
        : 0;
      const rockId = this._pickWorkableAsteroidNear(this.state, home, spread);
      const rock = rockId != null && this.state.entities ? this.state.entities.get(rockId) : null;
      if (!rock || !rock.pos) return null; // no field to work → keep the ambient miner stepper
      return {
        kind: 'miner', sectorId,
        route: [
          { id: 'home:' + stationIdentity(home), pos: { x: home.pos.x, z: home.pos.z }, label: 'Refinery' },
          { id: 'field:' + rockId, pos: { x: rock.pos.x, z: rock.pos.z }, label: 'Belt' },
        ],
      };
    }
    if (role === 'tug') {
      // A tug's run is the tow. Its route therefore starts AT the body it came for and ends at the
      // yard that wants it, which is what puts the load inside `NPC_TOW_MAX_RANGE_WU` by the time
      // npcJobsRuntime opens the DEPART phase — the attachment forms because the tug is actually
      // there, not because a timer said so. No target means no job: a tug with nothing to drag is
      // exactly the decorative hull this role is not allowed to be.
      // `target` is the exact body the dispatcher booked this run for. Re-searching here could pick
      // a different one than the dispatcher claimed and leave the claim on the wrong body.
      const body = target && target.pos ? target : this._pickUnclaimedTowTarget(home);
      if (!body || !body.pos) return null;
      const yard = this._nearestStationTo(stations, home) || home;
      if (!yard || !yard.pos) return null;
      return {
        kind: 'hauler', sectorId,
        speed: TRAFFIC_ROLES.tug.speed,
        route: [
          { id: 'tow:' + body.id, pos: { x: body.pos.x, z: body.pos.z }, label: 'Tow' },
          { id: 'yard:' + stationIdentity(yard), pos: { x: yard.pos.x, z: yard.pos.z }, label: 'Yard' },
        ],
        payload: {
          role: 'tug',
          towTargetId: body.id,
          manifest: ent && ent.data && ent.data.cargoManifest ? ent.data.cargoManifest : null,
        },
      };
    }
    if (role === 'hauler' || occupationalJobKind(role) === 'hauler') {
      // The ambient stepper's target is deliberately random. Reusing it here can turn a local
      // terminal run into an express-scale crossing, so durable working freight chooses the nearest
      // other berth from its actual spawn/home station instead. Express liners keep their separate
      // itinerary path above and never enter this branch.
      const dest = this._nearestStationTo(stations, home);
      if (!dest || !dest.pos) return null; // only one station → nowhere to haul to
      return {
        kind: 'hauler', sectorId,
        route: [
          { id: 'origin:' + stationIdentity(home), pos: { x: home.pos.x, z: home.pos.z }, label: 'Origin' },
          { id: 'dest:' + stationIdentity(dest), pos: { x: dest.pos.x, z: dest.pos.z }, label: 'Destination' },
        ],
        // The manifest was deterministically stamped by _assignManifest before job assignment.
        // Carry that exact detached descriptor through the job kernel instead of inventing a
        // hard-coded commodity that can disagree with the visible hull and destination market.
        payload: ent && ent.data && ent.data.cargoManifest
          ? { manifest: ent.data.cargoManifest }
          : null,
      };
    }
    if (role === 'surveyor') {
      // A grid, not a beat. The dossier's shift is "crab the grid — pulse, wait, pulse, log", so
      // the marks are laid out as an offset lattice rather than a ring: a ring reads as a patrol
      // circling something, and a surveyor is covering ground nobody has charted.
      const cx = home.pos.x; const cz = home.pos.z;
      const marks = [[300, 120], [520, -180], [180, -420], [-160, -140]];
      return {
        kind: 'surveyor', sectorId,
        route: marks.map(([ox, oz], i) => ({
          id: 'mark' + i, pos: { x: cx + ox, z: cz + oz }, label: 'Mark ' + (i + 1),
        })),
      };
    }
    if (role === 'salvor') {
      // General salvors only fly when a real takeable body exists (wreck salvagePool or loose
      // civilian-manifest payload). Never mint scrap into the job payload — value is claimed from
      // the live body on work completion. Ceres authored cast uses _assignCeresActivityJob instead.
      if (sectorId === CERES_ACTIVITY_SECTOR_ID) return null;
      const target = this._pickUnclaimedSalvageTarget(home);
      if (!target) return null;
      return this._buildSalvorJobSpec(home, target, sectorId);
    }
    if (role === 'tender' || occupationalJobKind(role) === 'tender') {
      // A call-out: berth to client hull and back. The client is another station rather than a
      // moving ship, because a tender's WORK phase holds station and welding onto something that
      // flies away mid-repair would contradict the "soft target by necessity" the Code promises.
      // The NEAREST other berth, not the most interesting one. A call-out is by definition local:
      // you are the rig that can be there before the seal fails. Measured before this constraint
      // existed, `_pickExpressDestination` handed a tender a client **12,757 units** away — a
      // three-minute transit leg at its planning speed, for a job whose whole premise is urgency,
      // and a hull that consequently spends its entire observable life in `transit`.
      const client = this._nearestStationTo(stations, home);
      if (!client || !client.pos) return null;
      return {
        kind: 'tender', sectorId,
        route: [
          { id: 'berth:' + stationIdentity(home), pos: { x: home.pos.x, z: home.pos.z }, label: 'Berth' },
          { id: 'client:' + stationIdentity(client), pos: { x: client.pos.x, z: client.pos.z }, label: 'Call-out' },
        ],
      };
    }
    if (role === 'patrol' || occupationalJobKind(role) === 'patrol') {
      const R = 200; const cx = home.pos.x; const cz = home.pos.z;
      return {
        kind: 'patrol', sectorId,
        route: [
          { id: 'beat0', pos: { x: cx + R, z: cz }, label: 'Beat 1' },
          { id: 'beat1', pos: { x: cx, z: cz + R }, label: 'Beat 2' },
          { id: 'beat2', pos: { x: cx - R, z: cz }, label: 'Beat 3' },
          { id: 'beat3', pos: { x: cx, z: cz - R }, label: 'Beat 4' },
        ],
      };
    }
    return null;
  },

  _stationForPriorityCourier(stations, stationId) {
    return (stations || []).find((station) => stationIdentity(station) === stationId) || null;
  },

  _priorityCourierItinerary(entity, sectorId = null) {
    const data = entity && entity.data || {};
    const itinerary = data.itinerary;
    const activeSectorId = sectorId || (this.state.world && this.state.world.currentSectorId);
    if (data.trafficRole !== 'courier'
      || activeSectorId !== PRIORITY_COURIER_SERVICE.sectorId
      || !isPriorityCourierItinerary(itinerary)) return null;
    return this._normalizePriorityCourierItinerary(itinerary);
  },

  _normalizePriorityCourierItinerary(itinerary) {
    const prior = itinerary.escort && typeof itinerary.escort === 'object' ? itinerary.escort : {};
    const legSeq = itinerary.legSeq;
    const usedLegSeq = Number.isSafeInteger(prior.usedLegSeq) && prior.usedLegSeq >= 0
      ? prior.usedLegSeq
      : null;
    const active = prior.active === true && prior.legSeq === legSeq && usedLegSeq !== legSeq;
    itinerary.escort = {
      legSeq,
      active,
      requestedAt: active && Number.isFinite(prior.requestedAt) ? prior.requestedAt : null,
      heldS: active && Number.isFinite(prior.heldS) ? Math.max(0, Math.min(prior.heldS, PRIORITY_COURIER_SERVICE.escort.holdS)) : 0,
      usedLegSeq,
      creditS: usedLegSeq === legSeq && Number.isFinite(prior.creditS)
        ? Math.max(0, Math.min(prior.creditS, PRIORITY_COURIER_SERVICE.escort.recoveryCreditS))
        : 0,
    };
    return itinerary;
  },

  _priorityCourierDueAt(stations, originStationId, destinationStationId, departureAt) {
    const origin = this._stationForPriorityCourier(stations, originStationId);
    const destination = this._stationForPriorityCourier(stations, destinationStationId);
    if (!origin || !origin.pos || !destination || !destination.pos) return null;
    const distance = Math.hypot(destination.pos.x - origin.pos.x, destination.pos.z - origin.pos.z);
    // The existing one-shot hauler graph has commission/load/depart/approach/unload stops around
    // its physical transit. Keep that observable work in the saved deadline rather than pretending
    // a boost removes dock work.
    const jobOverheadS = 2 + 8 + 3 + 4 + 6;
    return departureAt + distance / PRIORITY_COURIER_SERVICE.sprintSpeedWU
      + jobOverheadS + PRIORITY_COURIER_SERVICE.dueSlackS;
  },

  _newPriorityCourierItinerary(stations, originStationId, destinationStationId, legSeq = 0) {
    const departureAt = (Number.isFinite(this.state.simTime) ? this.state.simTime : 0)
      + PRIORITY_COURIER_SERVICE.dwellS;
    const dueAt = this._priorityCourierDueAt(stations, originStationId, destinationStationId, departureAt);
    if (!Number.isFinite(dueAt)) return null;
    return {
      kind: PRIORITY_COURIER_ITINERARY_KIND,
      schema: PRIORITY_COURIER_SERVICE_SCHEMA,
      serviceId: PRIORITY_COURIER_SERVICE.id,
      contactId: PRIORITY_COURIER_SERVICE.contactId,
      sectorId: PRIORITY_COURIER_SERVICE.sectorId,
      originStationId,
      destinationStationId,
      legSeq,
      departureAt,
      dueAt,
      escort: {
        legSeq,
        active: false,
        requestedAt: null,
        heldS: 0,
        usedLegSeq: null,
        creditS: 0,
      },
    };
  },

  _priorityCourierContact() {
    return NAMED_LANE_CONTACTS.find((contact) => contact.id === PRIORITY_COURIER_SERVICE.contactId) || null;
  },

  _priorityCourierStatus(entity, itinerary, jobEntry = null) {
    const job = jobEntry && jobEntry.job;
    if (job && (job.phase === NPC_JOB_PHASE.FLEE || jobEntry.control)) return 'INTERRUPTED';
    const escort = itinerary && itinerary.escort || {};
    const creditS = Number.isFinite(escort.creditS) ? Math.max(0, escort.creditS) : 0;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    if (now > itinerary.dueAt + creditS) return 'LATE';
    if (!entity.data.jobId && now < itinerary.departureAt) return 'BERTH';
    return 'ON_TIME';
  },

  _refreshPriorityCourierPresentation(entity, rec, stations, itinerary, jobEntry = null) {
    const status = this._priorityCourierStatus(entity, itinerary, jobEntry);
    const origin = this._stationForPriorityCourier(stations, itinerary.originStationId);
    const destination = this._stationForPriorityCourier(stations, itinerary.destinationStationId);
    const route = `${stationName(origin, itinerary.originStationId)} → ${stationName(destination, itinerary.destinationStationId)}`;
    const stateLabel = status === 'BERTH' ? 'BERTHED'
      : status === 'INTERRUPTED' ? 'INTERRUPTED'
      : status === 'LATE' ? 'LATE SPRINT'
      : 'PRIORITY SPRINT';
    entity.data.priorityCourierState = status;
    entity.data.trafficLabel = `SPAN-HOLD · ${stateLabel} · ${route}`;
    entity.data.scanLabel = `${entity.data.trafficLabel} · OVERTAKE BURN`;
    rec.itinerary = itinerary;
    return status;
  },

  _stampPriorityCourierService(entity, rec, stations) {
    if (!entity || !entity.data || !rec || rec.role !== 'courier') return false;
    const current = this._priorityCourierItinerary(entity, PRIORITY_COURIER_SERVICE.sectorId);
    const itinerary = current || this._newPriorityCourierItinerary(
      stations,
      PRIORITY_COURIER_SERVICE.stops[0],
      PRIORITY_COURIER_SERVICE.stops[1],
    );
    if (!itinerary) return false;
    entity.data.itinerary = itinerary;
    const contact = this._priorityCourierContact();
    if (contact) this._stampNamedLaneContact(entity, contact);
    const destination = this._stationForPriorityCourier(stations, itinerary.destinationStationId);
    rec.priorityCourierService = PRIORITY_COURIER_SERVICE.id;
    rec.targetId = destination ? destination.id : rec.targetId;
    this._refreshPriorityCourierPresentation(entity, rec, stations, itinerary);
    return true;
  },

  _isPriorityCourierServiceCandidate(rec, entity) {
    const data = entity && entity.data;
    const flags = entity && entity.flags || {};
    const manifest = rec && rec.manifest || data && data.cargoManifest;
    const ai = data && data.ai;
    const isExactLegacyKess = data && data.namedLaneContactId === PRIORITY_COURIER_SERVICE.contactId;
    if (!rec || !entity || !data || entity.team !== TRAFFIC_ROLES.courier.team
      || rec.role === 'express' || rec.role === 'miner' || rec.role === 'ore_carrier' || rec.role === 'salvor'
      || (rec.role !== 'courier' && !isWorldSiteTrafficFallbackRole(rec.role))) return false;
    if (typeof data.worldRecordId !== 'string' || !data.worldRecordId
      || data.jobId || data.worldSiteTrafficHookId || data.claimTravelTrafficHookId
      || data.activityActorSlotId || data.ceresActivityCast || data.ceresActivityJobOwned
      || data.generalSalvor || (!isExactLegacyKess && data.namedLaneContactId) || data.missionId || data.missionTag
      || data.missionPinned || data.missionTargetSlot || data.contractId || data.persistent
      || data.worldRecordSlotId || data.hitchable || data.isBoss || data.encounterBoss || data.missionBoss
      || data.scenarioActorId || data.scenarioRole || data.itinerary || flags.missionPinned || flags.persistent) return false;
    if (rec.worldSiteRoute || rec.claimTravelRoute || rec.activityActorSlotId
      || rec.ceresActivityCast || rec.ceresActivityJobOwned || rec.generalSalvor || rec.jobId
      || rec.control || rec.controlLease || rec.itinerary) return false;
    if (ai && (ai.lawful === true || ai.pirate === true || ai.hostile === true
      || ai.spawnContext === 'patrol' || ai.isBoss === true || ai.missionTarget === true)) return false;
    // Ordinary ambient freight is retained for the Kess leg. Custody/lot manifests belong to an
    // active authored chain and must never be repurposed by this compatibility rebuild.
    if (manifest && (manifest.active === true || manifest.custody || manifest.lotId || manifest.lotSource
      || manifest.special === true || manifest.protected === true || manifest.reservedBy)) return false;
    return true;
  },

  _rebuildPriorityCourierService(entity, rec, sectorId, stations) {
    if (!this._isPriorityCourierServiceCandidate(rec, entity) || rec.role === 'courier') return false;
    const contact = this._priorityCourierContact();
    rec.role = 'courier';
    entity.data.defId = (contact && contact.ship) || TRAFFIC_ROLES.courier.ship;
    // Keep the durable record id. The ships owner refreshes physical hull stats when available;
    // the compact traffic fixtures still receive the presentation invalidation without a second
    // state writer or a replacement entity.
    this._stampTrafficDurableIdentity(entity, sectorId, 'courier', TRAFFIC_ROLES.courier, 0);
    const shipsSystem = this._registry && typeof this._registry.get === 'function'
      ? this._registry.get('ships')
      : null;
    if (shipsSystem && typeof shipsSystem.recomputeEntity === 'function') {
      shipsSystem.recomputeEntity(entity.id, []);
    } else if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('ship:appearanceChanged', { id: entity.id });
    }
    return this._stampPriorityCourierService(entity, rec, stations);
  },

  _ensurePriorityCourierService(sectorId, stations) {
    if (!priorityCourierServiceForSector(sectorId)) return false;
    this._ensureState();
    const list = this.state.traffic.freighters || [];
    for (const rec of list) {
      const entity = rec && liveEntity(this.state, rec.id);
      if (entity && this._priorityCourierItinerary(entity, sectorId)) {
        return this._stampPriorityCourierService(entity, rec, stations);
      }
    }
    const candidates = list
      .map((rec) => ({ rec, entity: rec && liveEntity(this.state, rec.id) }))
      .filter(({ rec, entity }) => this._isPriorityCourierServiceCandidate(rec, entity))
      .sort((a, b) => stableTrafficKey(a.entity).localeCompare(stableTrafficKey(b.entity)));
    // An exact, unowned legacy Kess courier wins before an ordinary fallback. Every other route
    // through this method uses the same predicate, so protected records cannot be relabelled.
    const candidate = candidates.find(({ rec }) => rec.role === 'courier') || candidates[0];
    if (!candidate) return false;
    if (candidate.rec.role === 'courier') {
      return this._stampPriorityCourierService(candidate.entity, candidate.rec, stations);
    }
    // A full legacy/Continue roster can be at cap before this service existed. Rebuild the chosen
    // idle civilian in place; never append a ninth contact.
    return this._rebuildPriorityCourierService(
      candidate.entity,
      candidate.rec,
      sectorId,
      stations,
    );
  },

  _priorityCourierJobEntry(entity) {
    const get = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.get;
    const jobId = entity && entity.data && entity.data.jobId;
    return typeof get === 'function' && typeof jobId === 'string' ? get(jobId) : null;
  },

  _advancePriorityCourierEscort(entity, itinerary, jobEntry, dt) {
    const escort = itinerary && itinerary.escort;
    if (!escort || escort.active !== true || escort.legSeq !== itinerary.legSeq
      || escort.usedLegSeq === itinerary.legSeq) return false;
    const job = jobEntry && jobEntry.job;
    if (!job || job.phase !== NPC_JOB_PHASE.TRANSIT || jobEntry.control) return false;
    const player = this.state.entities && this.state.entities.get && this.state.entities.get(this.state.playerId);
    if (!player || player.alive === false || !player.pos || !entity.pos) return false;
    const distance = Math.hypot(player.pos.x - entity.pos.x, player.pos.z - entity.pos.z);
    const inEscortBand = distance >= PRIORITY_COURIER_SERVICE.escort.minRangeWU
      && distance <= PRIORITY_COURIER_SERVICE.escort.maxRangeWU;
    escort.heldS = inEscortBand
      ? Math.min(PRIORITY_COURIER_SERVICE.escort.holdS, escort.heldS + Math.max(0, Number(dt) || 0))
      : 0;
    if (escort.heldS < PRIORITY_COURIER_SERVICE.escort.holdS) return false;
    escort.active = false;
    escort.usedLegSeq = itinerary.legSeq;
    escort.creditS = PRIORITY_COURIER_SERVICE.escort.recoveryCreditS;
    return true;
  },

  _stepPriorityCourierService(entity, rec, stations, dt) {
    const itinerary = this._priorityCourierItinerary(entity);
    if (!itinerary) return false;
    const jobEntry = this._priorityCourierJobEntry(entity);
    this._advancePriorityCourierEscort(entity, itinerary, jobEntry, dt);
    const status = this._refreshPriorityCourierPresentation(entity, rec, stations, itinerary, jobEntry);
    if (entity.data.jobId) return true; // npcJobsRuntime remains the sole movement writer.

    const origin = this._stationForPriorityCourier(stations, itinerary.originStationId);
    const destination = this._stationForPriorityCourier(stations, itinerary.destinationStationId);
    if (!origin || !destination) {
      setIntent(entity, 0, 0, false, false, null, entity.rot || 0);
      return true;
    }
    if (status === 'BERTH') {
      rec.targetId = origin.id;
      setIntent(entity, 0, 0, false, false, null, entity.rot || 0);
      return true;
    }
    this._maybeAssignJob(entity, 'courier', origin, destination, stations, PRIORITY_COURIER_SERVICE.sectorId);
    if (!entity.data.jobId) setIntent(entity, 0, 0, false, false, null, entity.rot || 0);
    return true;
  },

  _requestPriorityCourierEscort(response) {
    const target = this.state.entities && this.state.entities.get
      ? this.state.entities.get(response && response.targetId)
      : null;
    const rec = target && this.state.traffic && Array.isArray(this.state.traffic.freighters)
      ? this.state.traffic.freighters.find((row) => row && row.id === target.id)
      : null;
    const itinerary = target && this._priorityCourierItinerary(target);
    if (!target || !rec || !itinerary) return false;
    const status = this._priorityCourierStatus(target, itinerary, this._priorityCourierJobEntry(target));
    const escort = itinerary.escort || {};
    if ((status !== 'LATE' && status !== 'INTERRUPTED')
      || escort.active === true || escort.usedLegSeq === itinerary.legSeq) return false;
    itinerary.escort = {
      legSeq: itinerary.legSeq,
      active: true,
      requestedAt: Number.isFinite(this.state.simTime) ? this.state.simTime : 0,
      heldS: 0,
      usedLegSeq: Number.isSafeInteger(escort.usedLegSeq) ? escort.usedLegSeq : null,
      creditS: 0,
    };
    this._refreshPriorityCourierPresentation(target, rec, this._sectorStations(), itinerary,
      this._priorityCourierJobEntry(target));
    return true;
  },

  _advancePriorityCourierLeg(entity, rec, stations, itinerary) {
    const nextOrigin = itinerary.destinationStationId;
    const nextDestination = itinerary.originStationId;
    const nextLegSeq = itinerary.legSeq + 1;
    const next = this._newPriorityCourierItinerary(stations, nextOrigin, nextDestination, nextLegSeq);
    if (!next) return false;
    entity.data.itinerary = next;
    const origin = this._stationForPriorityCourier(stations, nextOrigin);
    rec.targetId = origin ? origin.id : rec.targetId;
    this._refreshPriorityCourierPresentation(entity, rec, stations, next);
    return true;
  },

  _passengerLinerClaim(entity, sectorId = null) {
    const data = entity && entity.data || {};
    const itinerary = data.itinerary;
    const activeSectorId = sectorId || (this.state.world && this.state.world.currentSectorId);
    const worldRecordId = data.worldRecordId;
    if (data.trafficRole !== 'express'
      || activeSectorId !== PASSENGER_LINER_SERVICE.sectorId
      || typeof worldRecordId !== 'string' || !worldRecordId
      || !isPassengerLinerItinerary(itinerary)
      || itinerary.worldRecordId !== worldRecordId) return null;
    const custody = itinerary.custody || {};
    const ids = passengerLinerLegIds(worldRecordId, itinerary.legSeq);
    if (custody.passengerId !== ids.passengerId || custody.ticketId !== ids.ticketId
      || custody.receiptId !== ids.receiptId
      || custody.originStationId !== itinerary.originStationId
      || custody.destinationStationId !== itinerary.destinationStationId) return null;
    return itinerary;
  },

  _passengerLinerItinerary(entity, sectorId = null) {
    const itinerary = this._passengerLinerClaim(entity, sectorId);
    if (!itinerary) return null;
    const custody = itinerary.custody || {};
    const atOrigin = itinerary.state === 'BOARDING' || itinerary.state === 'DELAYED';
    const aboard = itinerary.state === 'EN_ROUTE' || itinerary.state === 'DIVERTING';
    if ((atOrigin && custody.state !== 'AT_ORIGIN') || (aboard && custody.state !== 'ONBOARD')) return null;
    if (!atOrigin && !aboard) return null;
    return this._normalizePassengerLinerItinerary(itinerary);
  },

  _normalizePassengerLinerItinerary(itinerary) {
    const prior = itinerary.assist && typeof itinerary.assist === 'object' ? itinerary.assist : {};
    const legSeq = itinerary.legSeq;
    const usedLegSeq = Number.isSafeInteger(prior.usedLegSeq) && prior.usedLegSeq >= 0
      ? prior.usedLegSeq
      : null;
    const active = prior.active === true && prior.legSeq === legSeq && usedLegSeq !== legSeq
      && typeof prior.targetWorldRecordId === 'string' && prior.targetWorldRecordId === itinerary.worldRecordId;
    itinerary.assist = {
      legSeq,
      active,
      requestedAt: active && Number.isFinite(prior.requestedAt) ? prior.requestedAt : null,
      heldS: active && Number.isFinite(prior.heldS)
        ? Math.max(0, Math.min(prior.heldS, PASSENGER_LINER_SERVICE.assist.holdS))
        : 0,
      targetWorldRecordId: active ? prior.targetWorldRecordId : null,
      usedLegSeq,
    };
    return itinerary;
  },

  _newPassengerLinerItinerary(entity, originStationId, destinationStationId, legSeq = 0) {
    const worldRecordId = entity && entity.data && entity.data.worldRecordId;
    if (typeof worldRecordId !== 'string' || !worldRecordId) return null;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    const departureAt = now + PASSENGER_LINER_SERVICE.dwellS;
    const ids = passengerLinerLegIds(worldRecordId, legSeq);
    return {
      kind: PASSENGER_LINER_ITINERARY_KIND,
      schema: PASSENGER_LINER_SERVICE_SCHEMA,
      serviceId: PASSENGER_LINER_SERVICE.id,
      sectorId: PASSENGER_LINER_SERVICE.sectorId,
      worldRecordId,
      originStationId,
      destinationStationId,
      legSeq,
      departureAt,
      dwellUntil: departureAt,
      state: 'BOARDING',
      delayedBy: null,
      diversion: null,
      lastOutcome: null,
      custody: {
        passengerId: ids.passengerId,
        ticketId: ids.ticketId,
        receiptId: ids.receiptId,
        state: 'AT_ORIGIN',
        originStationId,
        destinationStationId,
      },
      assist: {
        legSeq,
        active: false,
        requestedAt: null,
        heldS: 0,
        targetWorldRecordId: null,
        usedLegSeq: null,
      },
    };
  },

  _passengerLinerStatusLabel(itinerary) {
    if (!itinerary) return 'SERVICE';
    if (itinerary.state === 'BOARDING') return 'BOARDING';
    if (itinerary.state === 'DELAYED') return 'DELAYED';
    if (itinerary.state === 'DIVERTING') return 'DIVERTING';
    if (itinerary.state === 'EN_ROUTE') return 'EN ROUTE';
    return String(itinerary.state || 'SERVICE').replace(/_/g, ' ');
  },

  _refreshPassengerLinerPresentation(entity, rec, stations, itinerary) {
    const origin = this._stationForPriorityCourier(stations, itinerary.originStationId);
    const destination = this._stationForPriorityCourier(stations, itinerary.destinationStationId);
    const route = itinerary.state === 'DIVERTING'
      ? `${stationName(origin, itinerary.originStationId)} RETURN`
      : `${stationName(origin, itinerary.originStationId)} → ${stationName(destination, itinerary.destinationStationId)}`;
    const status = this._passengerLinerStatusLabel(itinerary);
    entity.data.passengerLinerService = PASSENGER_LINER_SERVICE.id;
    entity.data.passengerLinerState = itinerary.state;
    entity.data.hitchable = true;
    entity.data.trafficLabel = `HELIOS CIVIC LINER · ${status} · ${route}`;
    entity.data.scanLabel = `${entity.data.trafficLabel} · HITCHABLE`;
    rec.passengerLinerService = PASSENGER_LINER_SERVICE.id;
    rec.itinerary = itinerary;
  },

  _syncPassengerLinerWorldRecord(entity) {
    const world = this._registry && this._registry.get && this._registry.get('world');
    if (world && typeof world.upsertWorldRecord === 'function') {
      try { world.upsertWorldRecord(entity); } catch (_) { /* world residency will capture on save/demote */ }
    }
  },

  _passengerLinerIdIsSuspended(worldRecordId) {
    return typeof worldRecordId === 'string'
      && (this.state.traffic.passengerLinerSuspendedIds || []).includes(worldRecordId);
  },

  _invalidatePassengerLinerClaim(entity, rec) {
    const data = entity && entity.data || {};
    const worldRecordId = data.worldRecordId;
    if (typeof worldRecordId === 'string' && worldRecordId) {
      this.state.traffic.passengerLinerInvalidatedIds = compactStableIds([
        ...(this.state.traffic.passengerLinerInvalidatedIds || []), worldRecordId,
      ], PASSENGER_LINER_INVALIDATED_CAP);
    }
    delete data.passengerLinerService;
    delete data.passengerLinerState;
    delete data.itinerary;
    if (rec) {
      delete rec.passengerLinerService;
      delete rec.itinerary;
      rec.nextTradeT = Number.isFinite(rec.nextTradeT) ? rec.nextTradeT : TRADE_INTERVAL_S;
    }
    data.hitchable = true;
    data.trafficLabel = TRAFFIC_ROLES.express.label;
    data.scanLabel = 'EXPRESS LINER · HITCHABLE';
  },

  _isPassengerLinerServiceCandidate(rec, entity) {
    const data = entity && entity.data;
    const flags = entity && entity.flags || {};
    const manifest = rec && rec.manifest || data && data.cargoManifest;
    const ai = data && data.ai;
    if (!rec || !entity || !data || rec.role !== 'express' || data.trafficRole !== 'express'
      || entity.team !== TRAFFIC_ROLES.express.team || data.defId !== FREIGHTER_SHIP
      || data.hitchable !== true || typeof data.worldRecordId !== 'string' || !data.worldRecordId
      || this._passengerLinerIdIsSuspended(data.worldRecordId)
      || (this.state.traffic.passengerLinerInvalidatedIds || []).includes(data.worldRecordId)) return false;
    if (data.jobId || data.worldSiteTrafficHookId || data.claimTravelTrafficHookId
      || data.activityActorSlotId || data.ceresActivityCast || data.ceresActivityJobOwned
      || data.generalSalvor || data.namedLaneContactId || data.missionId || data.missionTag
      || data.missionPinned || data.missionTargetSlot || data.contractId || data.persistent
      || data.worldRecordSlotId || data.isBoss || data.encounterBoss || data.missionBoss
      || data.scenarioActorId || data.scenarioRole || flags.missionPinned || flags.persistent) return false;
    if (rec.worldSiteRoute || rec.claimTravelRoute || rec.activityActorSlotId
      || rec.ceresActivityCast || rec.ceresActivityJobOwned || rec.generalSalvor || rec.jobId
      || rec.control || rec.controlLease) return false;
    if (ai && (ai.lawful === true || ai.pirate === true || ai.hostile === true
      || ai.spawnContext === 'patrol' || ai.isBoss === true || ai.missionTarget === true)) return false;
    const itinerary = data.itinerary;
    if (itinerary && itinerary.kind !== 'express_hitch_route') return false;
    if (manifest && (manifest.active === true || manifest.custody || manifest.lotId || manifest.lotSource
      || manifest.special === true || manifest.protected === true || manifest.reservedBy)) return false;
    return true;
  },

  _stampPassengerLinerService(entity, rec, stations) {
    if (!entity || !entity.data || !rec || rec.role !== 'express'
      || this._passengerLinerIdIsSuspended(entity.data.worldRecordId)) return false;
    const current = this._passengerLinerItinerary(entity, PASSENGER_LINER_SERVICE.sectorId);
    const itinerary = current || this._newPassengerLinerItinerary(
      entity,
      PASSENGER_LINER_SERVICE.stops[0],
      PASSENGER_LINER_SERVICE.stops[1],
    );
    if (!itinerary) return false;
    entity.data.itinerary = itinerary;
    delete entity.data.cargoManifest;
    rec.manifest = null;
    rec.nextTradeT = Number.POSITIVE_INFINITY;
    const origin = this._stationForPriorityCourier(stations, itinerary.originStationId);
    rec.targetId = origin ? origin.id : rec.targetId;
    this._refreshPassengerLinerPresentation(entity, rec, stations, itinerary);
    this._syncPassengerLinerWorldRecord(entity);
    return true;
  },

  _ensurePassengerLinerService(sectorId, stations) {
    if (!passengerLinerServiceForSector(sectorId)) return false;
    this._ensureState();
    // The single civic service is suspended after its exact hull is lost. Do not silently replace
    // it with another ambient express on a later residency pass.
    if ((this.state.traffic.passengerLinerSuspendedIds || []).length) return false;
    const list = this.state.traffic.freighters || [];
    for (const rec of list) {
      const entity = rec && liveEntity(this.state, rec.id);
      const claimed = entity && entity.data && entity.data.itinerary
        && (entity.data.itinerary.kind === PASSENGER_LINER_ITINERARY_KIND
          || entity.data.itinerary.serviceId === PASSENGER_LINER_SERVICE.id);
      if (!claimed) continue;
      const itinerary = this._passengerLinerItinerary(entity, sectorId);
      if (itinerary) return this._stampPassengerLinerService(entity, rec, stations);
      // A corrupt passenger envelope must become an ordinary express, never a fresh service with
      // an invented passenger claim on the same load.
      this._invalidatePassengerLinerClaim(entity, rec);
      return false;
    }
    const candidates = list
      .map((rec) => ({ rec, entity: rec && liveEntity(this.state, rec.id) }))
      .filter(({ rec, entity }) => this._isPassengerLinerServiceCandidate(rec, entity))
      .sort((a, b) => stableTrafficKey(a.entity).localeCompare(stableTrafficKey(b.entity)));
    const candidate = candidates[0];
    return candidate ? this._stampPassengerLinerService(candidate.entity, candidate.rec, stations) : false;
  },

  _activePassengerLinerCoalitionIncident() {
    const incidents = this.state && this.state.lawSecurity && this.state.lawSecurity.incidents;
    const now = Number.isFinite(this.state && this.state.simTime) ? this.state.simTime : 0;
    if (!incidents || typeof incidents !== 'object' || Array.isArray(incidents)) return null;
    const eligible = [];
    for (const key of Object.keys(incidents).sort()) {
      const incident = incidents[key];
      if (!incident || typeof incident !== 'object' || Array.isArray(incident)
        || incident.stationId !== 'station_coalition'
        || typeof incident.id !== 'string' || !incident.id
        || !PASSENGER_LINER_ACTIVE_INCIDENT_STATUSES.has(incident.status)
        || !Number.isFinite(incident.startedAt) || incident.startedAt < 0
        || incident.startedAt > now || now - incident.startedAt > PASSENGER_LINER_INCIDENT_MAX_AGE_S
        || incident.resolvedAt != null) continue;
      eligible.push(incident);
    }
    return eligible[0] || null;
  },

  _beginPassengerLinerAssist(response) {
    const target = this.state.entities && this.state.entities.get
      ? this.state.entities.get(response && response.targetId)
      : null;
    const rec = target && (this.state.traffic.freighters || []).find((row) => row && row.id === target.id);
    const itinerary = target && this._passengerLinerItinerary(target);
    if (!target || !rec || rec.passengerLinerService !== PASSENGER_LINER_SERVICE.id || !itinerary
      || itinerary.state !== 'BOARDING' || itinerary.custody.state !== 'AT_ORIGIN'
      || this.state.player && this.state.player.targetId !== target.id) return false;
    const assist = itinerary.assist || {};
    if (assist.active === true || assist.usedLegSeq === itinerary.legSeq) return false;
    itinerary.assist = {
      legSeq: itinerary.legSeq,
      active: true,
      requestedAt: Number.isFinite(this.state.simTime) ? this.state.simTime : 0,
      heldS: 0,
      targetWorldRecordId: itinerary.worldRecordId,
      usedLegSeq: Number.isSafeInteger(assist.usedLegSeq) ? assist.usedLegSeq : null,
    };
    this._refreshPassengerLinerPresentation(target, rec, this._sectorStations(), itinerary);
    this._syncPassengerLinerWorldRecord(target);
    return true;
  },

  _advancePassengerLinerAssist(entity, rec, itinerary, dt) {
    const assist = itinerary.assist;
    if (!assist || assist.active !== true || assist.legSeq !== itinerary.legSeq
      || assist.usedLegSeq === itinerary.legSeq || assist.targetWorldRecordId !== itinerary.worldRecordId
      || itinerary.state !== 'BOARDING' || itinerary.custody.state !== 'AT_ORIGIN') return false;
    const player = this.state.entities && this.state.entities.get && this.state.entities.get(this.state.playerId);
    const stableTarget = this.state.player && this.state.player.targetId === entity.id;
    const liveSector = this.state.world && this.state.world.currentSectorId === PASSENGER_LINER_SERVICE.sectorId;
    if (!player || player.alive === false || !player.pos || !entity.pos || !stableTarget || !liveSector) {
      assist.heldS = 0;
      return false;
    }
    const distance = Math.hypot(player.pos.x - entity.pos.x, player.pos.z - entity.pos.z);
    const inFormation = distance >= PASSENGER_LINER_SERVICE.assist.minRangeWU
      && distance <= PASSENGER_LINER_SERVICE.assist.maxRangeWU;
    assist.heldS = inFormation
      ? Math.min(PASSENGER_LINER_SERVICE.assist.holdS, assist.heldS + Math.max(0, Number(dt) || 0))
      : 0;
    if (assist.heldS < PASSENGER_LINER_SERVICE.assist.holdS) return false;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    assist.active = false;
    assist.usedLegSeq = itinerary.legSeq;
    itinerary.dwellUntil = now;
    itinerary.departureAt = Math.min(itinerary.departureAt, now);
    this._refreshPassengerLinerPresentation(entity, rec, this._sectorStations(), itinerary);
    this._syncPassengerLinerWorldRecord(entity);
    return true;
  },

  _passengerLinerReceiptText(outcome) {
    if (outcome === 'RETURNED') return 'HELIOS CIVIC LINER RETURNED TO HELIOS — COALITION SERVICE DIVERTED.';
    if (outcome === 'LOST') return 'HELIOS CIVIC LINER LOST — SERVICE SUSPENDED.';
    return 'HELIOS CIVIC LINER ARRIVED AT COALITION — PASSENGER SERVICE COMPLETE.';
  },

  _settlePassengerLinerLeg(entity, rec, itinerary, outcome, stationId) {
    const receiptId = itinerary.custody && itinerary.custody.receiptId;
    if (typeof receiptId !== 'string' || !receiptId) return false;
    const trafficState = this.state.traffic;
    const applied = trafficState.passengerReceiptIds || [];
    const fresh = !applied.includes(receiptId);
    if (fresh) {
      trafficState.passengerReceiptIds = compactStableIds([...applied, receiptId], PASSENGER_LINER_RECEIPT_CAP);
    }
    itinerary.state = outcome;
    itinerary.lastOutcome = {
      outcome,
      receiptId,
      stationId: stationId || null,
      settledAt: Number.isFinite(this.state.simTime) ? this.state.simTime : 0,
    };
    itinerary.custody.state = outcome;
    if (fresh && this.bus && typeof this.bus.emit === 'function') {
      const receipt = {
        receiptId,
        serviceId: PASSENGER_LINER_SERVICE.id,
        worldRecordId: itinerary.worldRecordId,
        legSeq: itinerary.legSeq,
        passengerId: itinerary.custody.passengerId,
        ticketId: itinerary.custody.ticketId,
        outcome,
        stationId: stationId || null,
        sectorId: PASSENGER_LINER_SERVICE.sectorId,
      };
      this.bus.emit('traffic:passengerLinerReceipt', receipt);
      this.bus.emit('news:publish', {
        ...receipt,
        text: this._passengerLinerReceiptText(outcome),
        kind: 'passenger_liner_service',
        sourceRef: 'traffic:helios-civic-liner',
        channelId: 'news',
      });
    }
    this._syncPassengerLinerWorldRecord(entity);
    return fresh;
  },

  _advancePassengerLinerLeg(entity, rec, stations, itinerary, outcome) {
    const nextOrigin = outcome === 'RETURNED'
      ? itinerary.originStationId
      : itinerary.destinationStationId;
    const nextDestination = outcome === 'RETURNED'
      ? itinerary.destinationStationId
      : itinerary.originStationId;
    const next = this._newPassengerLinerItinerary(entity, nextOrigin, nextDestination, itinerary.legSeq + 1);
    if (!next) return false;
    entity.data.itinerary = next;
    const origin = this._stationForPriorityCourier(stations, nextOrigin);
    rec.targetId = origin ? origin.id : rec.targetId;
    this._refreshPassengerLinerPresentation(entity, rec, stations, next);
    this._syncPassengerLinerWorldRecord(entity);
    return true;
  },

  _stepPassengerLinerService(entity, rec, stations, dt) {
    const itinerary = this._passengerLinerItinerary(entity);
    if (!itinerary || rec.passengerLinerService !== PASSENGER_LINER_SERVICE.id) return false;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    const incident = this._activePassengerLinerCoalitionIncident();
    if (itinerary.state === 'BOARDING' || itinerary.state === 'DELAYED') {
      if (incident) {
        itinerary.state = 'DELAYED';
        itinerary.delayedBy = { incidentId: incident.id, startedAt: incident.startedAt };
      } else if (itinerary.state === 'DELAYED') {
        itinerary.state = 'BOARDING';
        itinerary.delayedBy = null;
      }
      this._advancePassengerLinerAssist(entity, rec, itinerary, dt);
      if (itinerary.state === 'BOARDING' && now >= itinerary.departureAt) {
        itinerary.state = 'EN_ROUTE';
        itinerary.custody.state = 'ONBOARD';
        itinerary.departedAt = now;
      }
      if (itinerary.state !== 'EN_ROUTE') {
        const origin = this._stationForPriorityCourier(stations, itinerary.originStationId);
        rec.targetId = origin ? origin.id : rec.targetId;
        setIntent(entity, 0, 0, false, false, null, entity.rot || 0);
        this._refreshPassengerLinerPresentation(entity, rec, stations, itinerary);
        return true;
      }
    }
    if (itinerary.state === 'EN_ROUTE' && incident
      && itinerary.originStationId === 'station_helios'
      && itinerary.destinationStationId === 'station_coalition') {
      itinerary.state = 'DIVERTING';
      itinerary.diversion = {
        incidentId: incident.id,
        startedAt: incident.startedAt,
        returnStationId: 'station_helios',
      };
    }
    const travelStationId = itinerary.state === 'DIVERTING'
      ? itinerary.diversion && itinerary.diversion.returnStationId
      : itinerary.destinationStationId;
    const target = this._stationForPriorityCourier(stations, travelStationId);
    if (!target || !target.pos) {
      setIntent(entity, 0, 0, false, false, null, entity.rot || 0);
      this._refreshPassengerLinerPresentation(entity, rec, stations, itinerary);
      return true;
    }
    rec.targetId = target.id;
    const dx = target.pos.x - entity.pos.x;
    const dz = target.pos.z - entity.pos.z;
    const distance = Math.hypot(dx, dz);
    const aimAngle = Math.atan2(dz, dx);
    if (distance < DOCK_RANGE) {
      const outcome = itinerary.state === 'DIVERTING' ? 'RETURNED' : 'DELIVERED';
      this._settlePassengerLinerLeg(entity, rec, itinerary, outcome, travelStationId);
      this._advancePassengerLinerLeg(entity, rec, stations, itinerary, outcome);
      setIntent(entity, 0, 0, false, false, null, aimAngle);
      return true;
    }
    setIntent(entity, 0, 1, massline2Flag(
      'hitchhiking', this.state.runtime && this.state.runtime.features,
    ), false, null, aimAngle);
    this._refreshPassengerLinerPresentation(entity, rec, stations, itinerary);
    return true;
  },

  _clearStalePassengerLinerDelays() {
    for (const rec of this.state.traffic && this.state.traffic.freighters || []) {
      const entity = rec && liveEntity(this.state, rec.id);
      const itinerary = entity && this._passengerLinerItinerary(entity);
      if (!itinerary || itinerary.state !== 'DELAYED') continue;
      itinerary.state = 'BOARDING';
      itinerary.delayedBy = null;
      itinerary.assist = {
        legSeq: itinerary.legSeq,
        active: false,
        requestedAt: null,
        heldS: 0,
        targetWorldRecordId: null,
        usedLegSeq: itinerary.assist && Number.isSafeInteger(itinerary.assist.usedLegSeq)
          ? itinerary.assist.usedLegSeq
          : null,
      };
      this._refreshPassengerLinerPresentation(entity, rec, this._sectorStations(), itinerary);
      this._syncPassengerLinerWorldRecord(entity);
    }
  },

  /**
   * Prefer Helios Station (or first station) as the pocket density anchor so ≥3 freighters
   * sit inside default radar/sensor range of the first-hour play space.
   */
  _pocketStation(stations, sectorId) {
    if (!stations || !stations.length) return null;
    if (sectorId === 'sector_helios_prime') {
      for (const s of stations) {
        const id = (s.data && (s.data.stationId || s.data.id)) || s.id;
        if (id === 'station_helios') return s;
      }
    }
    return stations[0];
  },

  /**
   * Stamp exactly one deterministic named lane contact onto ambient traffic in this sector
   * (or spawn a dedicated freighter if none match the contact's role). Reuses freight causality
   * manifests — no parallel economy authority. Idempotent per sector presence.
   */
  _ensureNamedLaneContact(sectorId, sector, stations) {
    this._ensureState();
    const list = this.state.traffic.freighters || [];
    if (sectorId === CERES_ACTIVITY_SECTOR_ID) {
      const seed = (this.state.meta && this.state.meta.seed) || 1;
      const contact = pickNamedLaneContact(sectorId, seed);
      if (!contact || contact.id !== 'lane_rell_moisture') return;
      let miner = null;
      for (const rec of list) {
        const entity = rec && liveEntity(this.state, rec.id);
        if (!entity || !entity.data) continue;
        if (entity.data.activityActorSlotId === CERES_SEAM_MINER_SLOT_ID) {
          miner = entity;
          continue;
        }
        if (entity.data.namedLaneContactId === contact.id) {
          delete entity.data.namedLaneContactId;
          delete entity.data.name;
          delete entity.data.callsign;
          delete entity.data.gimmick;
          delete entity.data.scanLabel;
          if (entity.data.trafficLabel === contact.callsign) {
            const role = entity.data.trafficRole;
            entity.data.trafficLabel = (TRAFFIC_ROLES[role] || TRAFFIC_ROLES.hauler).label;
          }
          if (entity.data.ai && entity.data.ai.name === contact.name) delete entity.data.ai.name;
        }
      }
      if (miner) this._stampNamedLaneContact(miner, contact);
      return;
    }
    // Tethys has one explicit Kess service. Never let the generic named-contact fallback append a
    // second courier when an old/full ambient roster lacks a reusable courier slot.
    if (priorityCourierServiceForSector(sectorId)) {
      this._ensurePriorityCourierService(sectorId, stations);
      return;
    }
    // PQ-143.02 one-off: the Cinder Run Courier is an authored fixture of the start sector —
    // stamped deterministically on her own dedicated express slot every pass (never the seed-hash
    // pick), so the default route always has its far-too-fast courier. The generic
    // single-named-contact rule below ignores her slot, so the sector's picked contact (Mira or
    // Kess) still appears alongside her.
    this._ensureCinderRunCourierFixture(sectorId, sector, stations, list);
    // Already have a live named contact? (The courier's dedicated fixture slot does not count.)
    for (const rec of list) {
      const e = this.state.entities && this.state.entities.get(rec.id);
      if (e && e.alive && e.data && e.data.namedLaneContactId
        && e.data.namedLaneContactId !== CINDER_RUN_COURIER_CONTACT_ID) return;
    }
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const contact = pickNamedLaneContact(sectorId, seed);
    if (!contact) return;

    // Prefer an existing freighter with matching role. If none matches, spawn the authored
    // contact's own role/hull; never put a courier identity on a patrol (or vice versa).
    let rec = list.find((r) => r.role === contact.role) || null;
    let ent = rec && this.state.entities.get(rec.id);
    if (!ent || !ent.alive) {
      if (!this.helpers || !this.helpers.spawnEntity || !stations || !stations.length) return;
      const role = contact.role || 'hauler';
      const def = TRAFFIC_ROLES[role] || TRAFFIC_ROLES.hauler;
      const station = this._pocketStation(stations, sectorId) || stations[0];
      const ang = this._rng() * Math.PI * 2;
      const r = 110 + this._rng() * 80;
      const pos = { x: station.pos.x + Math.cos(ang) * r, z: station.pos.z + Math.sin(ang) * r };
      const aiSpec = {
        archetype: def.archetype,
        passive: true,
        spawnContext: lawPresenceRole(role) ? 'patrol' : 'convoy_civilian',
      };
      if (lawPresenceRole(role)) aiSpec.lawful = true;
      // A named lane contact names its own hull; that identity outranks the faction fleet, so only
      // an unnamed contact falling back to the role default is eligible for substitution.
      const laneFaction = (sector && sector.factionId) || 'faction_free';
      const spec = makeShipEntitySpec(
        contact.ship || factionHullFor(def.ship, laneFaction, () => this._rng()),
        {
          team: def.team,
          factionId: laneFaction,
          pos,
          ai: aiSpec,
        },
      );
      ent = this.helpers.spawnEntity(spec);
      if (!ent) return;
      this._stampTrafficDurableIdentity(ent, sectorId, role, def, list.length);
      const target = this._pickStation(stations);
      const manifest = this._assignManifest(ent, role, target, sectorId);
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
      list.push(rec);
    }
    this._stampNamedLaneContact(ent, contact);
  },

  _stampNamedLaneContact(ent, contact) {
    if (!ent || !contact) return;
    if (!ent.data) ent.data = {};
    ent.data.namedLaneContactId = contact.id;
    ent.data.name = contact.name;
    ent.data.callsign = contact.callsign;
    ent.data.gimmick = contact.gimmick;
    ent.data.trafficLabel = contact.callsign;
    ent.data.scanLabel = contact.callsign;
    if (ent.data.ai) {
      ent.data.ai.name = contact.name;
      // Named patrol keeps lawful; named freighter stays passive civilian.
      if (lawPresenceRole(contact.role)) {
        ent.data.ai.lawful = true;
        ent.data.ai.spawnContext = 'patrol';
      }
    }
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
      const pos = { x: station.pos.x + Math.cos(ang) * r, z: station.pos.z + Math.sin(ang) * r };
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
      const target = this._pickStation(stations);
      const manifest = this._assignManifest(ent, role, target, sectorId);
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
      list.push(rec);
    }
    this._stampNamedLaneContact(ent, contact);
  },

  /**
   * Stamp homeSectorId + stable worldRecordId before first demotion so capture/kill never
   * attaches homeless freighters to the wrong sector bag.
   */
  _stampTrafficDurableIdentity(ent, sectorId, role, def, seq) {
    if (!ent) return;
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
    if (ent.data.worldRecordId) return;
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const qx = ent.pos ? Math.round(ent.pos.x / 4) * 4 : 0;
    const qz = ent.pos ? Math.round(ent.pos.z / 4) * 4 : 0;
    const key = `traffic:${role || 'hauler'}:${seq | 0}:${qx}:${qz}`;
    const recordId = stableRecordId(seed, sectorId, RECORD_KIND.CONVOY, key);
    ent.data.worldRecordId = recordId;
    ent.data.identityKey = key;
    ent.data.durable = true;
    ent.data.recordCreatedTick = this.state.tick | 0;
  },

  /**
   * Bind rematerialized convoy freighters into traffic tracking without re-spawning.
   */
  _adoptRematerializedTraffic(sectorId, stations) {
    if (!sectorId) return;
    const tracked = new Set((this.state.traffic.freighters || []).map((f) => f && f.id));
    const list = this.state.entityList || [];
    let adoptIdx = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || !e.alive || e.type !== 'ship' || e.isPlayer) continue;
      const d = e.data || {};
      if (!d.trafficRole && !d.worldRecordId) continue;
      // Only adopt freighters that look like traffic/convoy.
      if (!d.trafficRole && !(d.durable && d.worldRecordId)) continue;
      if (!d.trafficRole) continue;
      const home = e.homeSectorId || d.homeSectorId || d.sectorId;
      if (home && home !== sectorId) continue;
      if (tracked.has(e.id)) continue;
      // Ensure durable stamps survive even if rematerialize omitted a field.
      if (!e.homeSectorId && !d.homeSectorId) {
        e.homeSectorId = sectorId;
        d.homeSectorId = sectorId;
      }
      if (d.sectorId == null) d.sectorId = sectorId;
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
      const rec = {
        id: e.id,
        role,
        targetId: target ? target.id : null,
        waitT: 0,
        nextTradeT: 2 + adoptIdx * 1.5,
        orbitPhase: this._rng() * Math.PI * 2,
        dockSeq: d.freightDockSeq | 0,
        manifest,
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
    }
  },

  _sectorStations() {
    const index = this.state.entityIndex;
    if (index && index.__spacefaceEntityIndexV1 && Array.isArray(index.dockStations)) {
      return index.dockStations;
    }
    const out = this._stationScratch || (this._stationScratch = []);
    out.length = 0;
    const stations = this.state.entityList || [];
    for (const e of stations) {
      if (e.type === 'station' && e.alive && !(e.data && e.data.isGate)) out.push(e);
    }
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
      for (const id of this._active) { const e = this.state.entities.get(id); if (e) e.alive = false; }
    } else {
      for (const id of this._active) { try { helper(id); } catch (_) {} }
    }
    this._active = [];
    this.state.traffic.freighters = [];
  },

  /** Drop tracking for freighters already despawned by residency demotion (continuous handoff). */
  _pruneDead() {
    this._ensureState();
    const list = this.state.traffic.freighters || [];
    const aliveIds = [];
    for (let i = list.length - 1; i >= 0; i--) {
      const rec = list[i];
      const e = this.state.entities && this.state.entities.get(rec.id);
      if (!e || !e.alive) list.splice(i, 1);
      else aliveIds.push(rec.id);
    }
    this._active = aliveIds;
  },

  update(dt, state) {
    if (state.mode !== 'flight') return;
    ensureActivityClassified(state);
    this._ensureState();
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
    if (state.world && state.world.currentSectorId === CERES_ACTIVITY_SECTOR_ID) {
      this._stepCeresCausalChain(dt);
      // A save may restore the compact service incident before its transient choreography link.
      // Let that exact orphan rebind once; an active link drives its own incident in the chain step.
      if (!this._hasActiveCeresTenderServiceLink()) this._stepCeresTenderServiceIncident(dt);
      this._stepCeresDisabledHaulerIncident(dt);
      this._stepCeresMinerHaulerHandoffs(dt);
    }

    let lostWorldSiteRoute = false;
    let lostClaimTravelRoute = false;
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
      // Legacy/fixture traffic records may predate data.trafficRole. Preserve their exact/near
      // behavior without re-admitting remote passive records to the owner loop.
      if (!activeTrafficIds.has(e.id) && (!hasLivePlayer || entityNeedsAiThink(e, state))) {
        activeTraffic.push(e);
        activeTrafficIds.add(e.id);
      }
    }
    for (const e of activeTraffic) {
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
        if (!e.data.jobId) this._assignCeresActivityJob(e, activityEntry);
        this._reactCivilianViolence(e, rec, stations, state);
        continue;
      }
      if (hasLivePlayer && entityNeedsAiThink(e, state) === false) continue;
      // Nearby gunfire: civilians change course before ordinary / world-site / job branches.
      // Job hulls are interrupted through npcJobsRuntime; traffic never writes their intent.
      if (this._reactCivilianViolence(e, rec, stations, state)) continue;
      // One authored recurring passenger liner owns the existing express hull and V3 boost route.
      // Its passenger itinerary must consume the tick before the generic express/freight branch.
      if (this._stepPassengerLinerService(e, rec, stations, dt)) continue;
      // One authored recurring courier owns a saved berth/departure timetable. It still delegates
      // actual transit to npcJobsRuntime, but traffic keeps its service state readable while that
      // job is live (or interrupted) instead of falling through to ambient random routing.
      if (this._stepPriorityCourierService(e, rec, stations, dt)) continue;
      // PQ-014: when this hull carries a live NPC job, npcJobsRuntime owns its steering. Traffic
      // yields entirely (no setIntent) so there is exactly one intent writer per job hull per tick.
      if (e.data && e.data.jobId) continue;
      const role = TRAFFIC_ROLES[rec.role] || TRAFFIC_ROLES.hauler;

      if (rec.worldSiteRoute) {
        this._stepWorldSiteRoute(e, rec, stations, dt);
        continue;
      }
      if (rec.claimTravelRoute) {
        this._stepClaimTravelRoute(e, rec, stations, dt);
        continue;
      }

      // Role-specific behavior dispatch (spec §12.1). Each role has a distinct, readable behavior.
      if (role.orbits) { this._stepOrbit(e, rec, stations, dt); continue; }       // patrol
      if (role.flees) { this._stepFlee(e, rec, stations, state); continue; }       // pirate/raider
      if (role.seeks === 'asteroid') { this._stepMiner(e, rec, stations, state); continue; } // miner
      if (role.escorts) { this._stepEscort(e, rec, list, state); continue; }       // convoy escort

      const player = state.playerId != null ? state.entities.get(state.playerId) : null;
      if (!shouldAmbientHaulerPlan(state.tick, e, {
        playerId: state.playerId,
        playerTeam: player && player.team,
        authorityRadius: tableSimAuthorityWuFromState(state),
        origin: player && player.pos,
      })) continue;

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
          this._emitArrival(e, rec, target);
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
        continue;
      }
      // drive: face the target, thrust forward. moveZ=1 means forward along the nose.
      const expressBoost = !!(role.express && massline2Flag('hitchhiking'));
      setIntent(e, 0, 1, expressBoost, false, null, aimAngle);
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
  },

  _stepWorldSiteRoute(entity, rec, stations, dt) {
    const route = rec.worldSiteRoute;
    const site = entityWithWorldRecord(this.state, route.siteWorldRecordId);
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

  // ── Role behaviors (spec §12.1) ────────────────────────────────────────────────────────────
  _ensureCivilianViolenceRing() {
    if (!this._violenceRing || this._violenceRing.length !== CIVILIAN_VIOLENCE_RING_CAP) {
      this._violenceRing = new Array(CIVILIAN_VIOLENCE_RING_CAP);
      for (let i = 0; i < CIVILIAN_VIOLENCE_RING_CAP; i++) {
        this._violenceRing[i] = { x: 0, z: 0, t: -Infinity, attackerId: null, victimId: null };
      }
    }
    if (this._violenceWrite == null) this._violenceWrite = 0;
    if (!this._violenceThreatScratch) {
      this._violenceThreatScratch = {
        entityId: null, x: 0, z: 0, untilSimT: 0, hold: false, slow: false,
      };
    }
  },

  _clearCivilianViolenceMemory() {
    this._ensureCivilianViolenceRing();
    for (let i = 0; i < this._violenceRing.length; i++) {
      const slot = this._violenceRing[i];
      slot.x = 0;
      slot.z = 0;
      slot.t = -Infinity;
      slot.attackerId = null;
      slot.victimId = null;
    }
    this._violenceWrite = 0;
    const list = this.state && this.state.traffic && this.state.traffic.freighters;
    if (Array.isArray(list)) {
      for (let i = 0; i < list.length; i++) {
        const rec = list[i];
        if (!rec) continue;
        rec.violenceAlarmed = false;
        rec.violenceResumeTargetId = null;
      }
    }
  },

  _recordViolence(x, z, attackerId, victimId, t) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    this._ensureCivilianViolenceRing();
    const slot = this._violenceRing[this._violenceWrite];
    slot.x = x;
    slot.z = z;
    slot.t = Number.isFinite(t) ? t : 0;
    slot.attackerId = attackerId == null ? null : attackerId;
    slot.victimId = victimId == null ? null : victimId;
    this._violenceWrite = (this._violenceWrite + 1) % CIVILIAN_VIOLENCE_RING_CAP;
  },

  _onCombatDamage(payload) {
    const p = payload || {};
    if (!(Number(p.applied) > 0)) return;
    const attackerId = p.attackerId != null ? p.attackerId
      : p.sourceId != null ? p.sourceId
        : null;
    const victimId = p.targetId != null ? p.targetId : p.id;
    const state = this.state;
    const victim = state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(victimId)
      : null;
    if (victim && victim.type && victim.type !== 'ship') return;
    const attacker = attackerId != null && state && state.entities
      ? state.entities.get(attackerId)
      : null;
    if (isSurvivalCohort(attacker) || isSurvivalCohort(victim)) return;
    let x = Number(p.pos && p.pos.x);
    let z = Number(p.pos && p.pos.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      const from = entityPos(attacker) || entityPos(victim);
      if (!from) return;
      x = from.x;
      z = from.z;
    }
    this._recordViolence(x, z, attackerId, victimId, Number.isFinite(state && state.simTime) ? state.simTime : 0);
  },

  _onLawIncidentOpened(payload) {
    const p = payload || {};
    const attackerId = p.attackerId != null ? p.attackerId : null;
    const victimId = p.victimId != null ? p.victimId : p.targetId;
    const state = this.state;
    const attacker = attackerId != null && state && state.entities
      ? state.entities.get(attackerId)
      : null;
    const victim = victimId != null && state && state.entities
      ? state.entities.get(victimId)
      : null;
    if (isSurvivalCohort(attacker) || isSurvivalCohort(victim)) return;
    const from = entityPos(attacker) || entityPos(victim);
    if (!from) return;
    this._recordViolence(
      from.x,
      from.z,
      attackerId,
      victimId,
      Number.isFinite(state && state.simTime) ? state.simTime : 0,
    );
  },

  _nearbyViolence(entity, now) {
    const pos = entity && entity.pos;
    const ring = this._violenceRing;
    if (!pos || !ring) return null;
    const id = entity.id;
    let best = null;
    let bestD2 = CIVILIAN_VIOLENCE_RADIUS_SQ;
    for (let i = 0; i < ring.length; i++) {
      const row = ring[i];
      if (!row || now - row.t > CIVILIAN_ALARM_TTL_S) continue;
      if (id === row.attackerId || id === row.victimId) continue;
      const dx = pos.x - row.x;
      const dz = pos.z - row.z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= bestD2) {
        bestD2 = d2;
        best = row;
      }
    }
    return best;
  },

  _pickFleeStation(entity, stations, fleeAim, currentTargetId) {
    if (!entity || !entity.pos || !stations || stations.length === 0) return null;
    const fx = Math.cos(fleeAim);
    const fz = Math.sin(fleeAim);
    let best = null;
    let bestScore = -Infinity;
    let bestOther = null;
    let bestOtherScore = -Infinity;
    for (let i = 0; i < stations.length; i++) {
      const station = stations[i];
      if (!station || !station.pos || station.alive === false) continue;
      const dx = station.pos.x - entity.pos.x;
      const dz = station.pos.z - entity.pos.z;
      const dist = Math.hypot(dx, dz);
      if (!(dist > 1)) continue;
      const score = (dx * fx + dz * fz) / dist;
      if (score > bestScore) {
        bestScore = score;
        best = station;
      }
      if (station.id !== currentTargetId && score > bestOtherScore) {
        bestOtherScore = score;
        bestOther = station;
      }
    }
    return bestOther || best;
  },

  /**
   * Civilians inside 300 WU of a recorded hit/incident. Haulers run; workers hold; a towing hull
   * keeps the load and leaves slowly. Live jobs go through npcJobs interrupt/resume — never setIntent.
   * Returns true only when this owner wrote ambient intent for the tick.
   */
  _reactCivilianViolence(e, rec, stations, state) {
    const roleName = (rec && rec.role) || (e.data && (e.data.trafficRole || e.data.jobKind || e.data.role)) || '';
    const doesFlee = CIVILIAN_ALARM_FLEE_ROLES.has(roleName);
    const doesHold = CIVILIAN_ALARM_HOLD_ROLES.has(roleName);
    if (!doesFlee && !doesHold) return false;
    if (isSurvivalCohort(e)) return false;

    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const hit = this._nearbyViolence(e, now);
    const jobId = e.data && e.data.jobId;
    const jobs = this.helpers && this.helpers.npcJobs;
    const carrying = !!((rec && rec.carrying)
      || (e.data?.cargoManifest?.totalQty > 0)
      || (rec && rec.manifest && rec.manifest.totalQty > 0));

    if (!hit) {
      const alarmed = (rec && rec.violenceAlarmed) || (e.data && e.data.violenceAlarmed);
      if (alarmed) {
        if (rec) rec.violenceAlarmed = false;
        if (e.data) e.data.violenceAlarmed = false;
        if (jobId && jobs && typeof jobs.resume === 'function') jobs.resume(jobId);
        const resumeId = rec ? rec.violenceResumeTargetId : null;
        if (rec) rec.violenceResumeTargetId = null;
        if (!jobId && resumeId != null) {
          const prev = state.entities && typeof state.entities.get === 'function'
            ? state.entities.get(resumeId)
            : null;
          if (prev && prev.alive !== false && rec) rec.targetId = resumeId;
        }
        if (!jobId && e.data && e.data.intent) e.data.intent.brake = false;
      }
      return false;
    }

    const hold = doesHold && !carrying;
    const untilSimT = now + CIVILIAN_ALARM_TTL_S;
    if (jobId) {
      if (jobs && typeof jobs.interrupt === 'function') {
        const threat = this._violenceThreatScratch;
        threat.entityId = hit.attackerId != null ? hit.attackerId : hit.victimId;
        threat.x = hit.x;
        threat.z = hit.z;
        threat.untilSimT = untilSimT;
        threat.hold = hold;
        threat.slow = carrying;
        jobs.interrupt(jobId, threat);
      }
      if (rec) rec.violenceAlarmed = true;
      if (e.data) e.data.violenceAlarmed = true;
      return false;
    }

    if (rec) rec.violenceAlarmed = true;
    if (e.data) e.data.violenceAlarmed = true;
    if (hold) {
      const aim = (e.data && e.data.intent && Number.isFinite(e.data.intent.aimAngle))
        ? e.data.intent.aimAngle
        : (e.rot || 0);
      setIntent(e, 0, 0, false, false, null, aim);
      e.data.intent.brake = true;
      return true;
    }

    const dx = (e.pos && e.pos.x || 0) - hit.x;
    const dz = (e.pos && e.pos.z || 0) - hit.z;
    let aim = Math.atan2(dz, dx);
    if (!Number.isFinite(aim) || (dx === 0 && dz === 0)) {
      aim = ((hash32(e.id, 'civilian-alarm') >>> 0) / 4294967296) * Math.PI * 2;
    }
    if (doesFlee && stations && stations.length > 1 && !rec.worldSiteRoute && !rec.claimTravelRoute) {
      if (rec.violenceResumeTargetId == null) rec.violenceResumeTargetId = rec.targetId;
      const dest = this._pickFleeStation(e, stations, aim, rec.targetId);
      if (dest && dest.id !== rec.targetId) rec.targetId = dest.id;
    }
    setIntent(e, 0, 1, !carrying, false, null, aim);
    if (e.data.intent) e.data.intent.brake = false;
    return true;
  },

  // Patrols orbit a station on a slow circular track — a readable "on duty" presence.
  _stepOrbit(e, rec, stations, dt) {
    const station = stations[0];
    if (!station) { setIntent(e, 0, 0, false, false, null, e.rot); return; }
    rec.orbitPhase = (rec.orbitPhase || 0) + dt * 0.25;
    const R = 180;
    const tx = station.pos.x + Math.cos(rec.orbitPhase) * R;
    const tz = station.pos.z + Math.sin(rec.orbitPhase) * R;
    const aim = Math.atan2(tz - e.pos.z, tx - e.pos.x);
    setIntent(e, 0, 1, false, false, null, aim);
  },

  // Pirates/raiders flee from the nearest hostile (the player) — they raid weak targets but bolt
  // when outmatched. Distinct from combat AI: they never engage, they disengage.
  _stepFlee(e, rec, stations, state) {
    const player = state.entities.get(state.playerId);
    if (player && player.alive) {
      const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 500) { // flee directly away from the player
        const aim = Math.atan2(dz, dx);
        setIntent(e, 0, 1, true, false, null, aim); // boost away
        return;
      }
    }
    // no threat: loiter toward a station
    const station = stations[Math.floor((rec._fleeIdx == null ? (rec._fleeIdx = 0) : rec._fleeIdx))];
    const tgt = station || stations[0];
    if (!tgt) { setIntent(e, 0, 0, false, false, null, e.rot); return; }
    const aim = Math.atan2(tgt.pos.z - e.pos.z, tgt.pos.x - e.pos.x);
    setIntent(e, 0, 1, false, false, null, aim);
  },

  // Miners seek asteroids, "mine" (orbit the rock), then haul the ore to a station. Distinct from
  // haulers: their target is an asteroid, not a station, until they return to dock.
  _stepMiner(e, rec, stations, state) {
    if (rec.carrying) {
      // return to a station to offload, then seek a new rock
      const tgt = state.entities.get(rec.targetId);
      if (tgt && tgt.type === 'station' && tgt.alive) {
        const dist = Math.hypot(tgt.pos.x - e.pos.x, tgt.pos.z - e.pos.z);
        if (dist < DOCK_RANGE) { rec.carrying = false; rec.targetId = this._pickAsteroid(state) || this._pickStation(stations).id; rec.waitT = 2; setIntent(e, 0, 0, false, false, null, e.rot); return; }
        setIntent(e, 0, 1, false, false, null, Math.atan2(tgt.pos.z - e.pos.z, tgt.pos.x - e.pos.x)); return;
      }
      rec.targetId = this._pickStation(stations).id; return;
    }
    let rock = state.entities.get(rec.targetId);
    if (!rock || rock.type !== 'asteroid' || !rock.alive) { rec.targetId = this._pickAsteroid(state) || this._pickStation(stations).id; rock = state.entities.get(rec.targetId); }
    if (!rock) { setIntent(e, 0, 0, false, false, null, e.rot); return; }
    const dist = Math.hypot(rock.pos.x - e.pos.x, rock.pos.z - e.pos.z);
    if (dist < 40) { rec.carrying = true; rec.targetId = this._pickStation(stations).id; rec.waitT = 1.5; setIntent(e, 0, 0, false, false, null, e.rot); return; }
    setIntent(e, 0, 1, false, false, null, Math.atan2(rock.pos.z - e.pos.z, rock.pos.x - e.pos.x));
  },

  _pickAsteroid(state) {
    const indexed = state.entityIndex && state.entityIndex.__spacefaceEntityIndexV1
      ? state.entityIndex.asteroids
      : null;
    if (indexed && indexed.length) {
      const tries = Math.min(indexed.length, 8);
      for (let i = 0; i < tries; i++) {
        const rock = indexed[Math.floor(this._rng() * indexed.length)];
        if (rock && rock.type === 'asteroid' && rock.alive) return rock.id;
      }
      for (const rock of indexed) {
        if (rock && rock.type === 'asteroid' && rock.alive) return rock.id;
      }
      return null;
    }
    let picked = null;
    let seen = 0;
    for (const e of state.entityList || []) {
      if (!e || e.type !== 'asteroid' || !e.alive) continue;
      seen += 1;
      if (this._rng() < 1 / seen) picked = e;
    }
    return picked ? picked.id : null;
  },

  /**
   * The rock a barge working out of `home` would actually cut: the nearest workable one, with a
   * deterministic spread so a shift's barges do not all stack on the same face.
   *
   * WHY THIS EXISTS. `_pickAsteroid` samples the sector's asteroid index UNIFORMLY, which is right
   * for its original callers (the ambient stepper wandering to some rock) and wrong for commissioning
   * a durable job. A sector is 4200 units in radius, so a uniformly-drawn field waypoint routinely
   * sends a barge past several hundred identical rocks to cut one across the map. Measured in
   * `sector_helios_prime`: live job hulls sitting 1083, 1694, 1841, 3815 and **13491** units from the
   * player, with the working ones effectively never in the same place as anything else.
   *
   * That is a fiction problem before it is a density problem — no crew burns a shift's fuel to reach
   * an identical rock — and it is a density problem because extraction ends up nowhere near the
   * refinery that eats the ore, so neither the player nor any other NPC ever shares a frame with it.
   *
   * `spread` picks the Nth-nearest rather than always the 1st, so several barges out of one refinery
   * work neighbouring faces instead of stacking on one. It is an index, not a random draw: the caller
   * derives it from the hull's own spawn ordinal so the result stays deterministic.
   */
  _pickWorkableAsteroidNear(state, home, spread = 0) {
    if (!home || !home.pos) return this._pickAsteroid(state);
    const indexed = state.entityIndex && state.entityIndex.__spacefaceEntityIndexV1
      ? state.entityIndex.asteroids
      : null;
    const source = indexed && indexed.length ? indexed : (state.entityList || []);
    // Keep the best (spread + 1) by distance without sorting the whole field. The candidate count is
    // tiny and bounded, so this stays a single linear pass over the index.
    const wanted = Math.max(1, Math.min(MINER_FIELD_SPREAD_CAP, (spread | 0) + 1));
    const bestId = new Array(wanted).fill(null);
    const bestD2 = new Array(wanted).fill(Infinity);
    for (const rock of source) {
      if (!rock || rock.type !== 'asteroid' || !rock.alive || !rock.pos) continue;
      const dx = rock.pos.x - home.pos.x;
      const dz = rock.pos.z - home.pos.z;
      const d2 = dx * dx + dz * dz;
      for (let i = 0; i < wanted; i++) {
        if (d2 >= bestD2[i]) continue;
        for (let j = wanted - 1; j > i; j--) { bestD2[j] = bestD2[j - 1]; bestId[j] = bestId[j - 1]; }
        bestD2[i] = d2;
        bestId[i] = rock.id;
        break;
      }
    }
    // Fewer rocks than the requested rank: fall back down the list rather than returning null, so a
    // thin field still yields a job instead of silently dropping the barge to its ambient stepper.
    for (let i = wanted - 1; i >= 0; i--) if (bestId[i] != null) return bestId[i];
    return null;
  },

  /**
   * The nearest OTHER station to `home`, or null when `home` is the only berth in reach.
   *
   * Distinct from `_pickExpressDestination`, which deliberately reaches for a far, interesting
   * endpoint because an express liner's whole point is crossing the map. Local trades need the
   * opposite: the berth you can actually be at before the seal fails.
   */
  _nearestStationTo(stations, home) {
    if (!Array.isArray(stations) || !home || !home.pos) return null;
    let best = null;
    let bestD2 = Infinity;
    for (const st of stations) {
      if (!st || st === home || !st.pos) continue;
      const dx = st.pos.x - home.pos.x;
      const dz = st.pos.z - home.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; best = st; }
    }
    return best;
  },

  /**
   * Nearest live entity of `type` to `anchor`, or null. Used to bind a working job to a real body
   * (a salvor's hulk) rather than a coordinate, so the site can be resolved again at render time
   * and the job dies honestly when the body does.
   *
   * Linear over the entity list, but this runs once per hull at commission — never per frame.
   */
  _nearestOfTypeTo(state, anchor, type) {
    if (!anchor || !anchor.pos || !state) return null;
    let best = null;
    let bestD2 = Infinity;
    for (const e of state.entityList || []) {
      if (!e || e.type !== type || e.alive === false || !e.pos) continue;
      const dx = e.pos.x - anchor.pos.x;
      const dz = e.pos.z - anchor.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; best = e; }
    }
    return best;
  },

  // ── WF-01 / U03 general salvor occupation ─────────────────────────────────────────────────────
  // Independent cleanup profession on the ordinary route. Takes EXISTING wreck salvagePool /
  // civilian-manifest payloads through cargoManifest custody; never mints value. Movement is
  // exclusively npcJobsRuntime via jobId. Ceres authored cast is gated out below.

  _isGeneralSalvorEntity(entity) {
    if (!entity || !entity.data || entity.alive === false) return false;
    if (entity.data.ceresActivityCast === true) return false;
    if (entity.data.activityActorSlotId) return false;
    return entity.data.trafficRole === 'salvor' || (entity.data.jobId && entity.data.jobKind === 'salvor');
  },

  _salvagePoolTotal(pool) {
    if (!pool || typeof pool !== 'object' || Array.isArray(pool)) return 0;
    let total = 0;
    for (const key of Object.keys(pool)) {
      const qty = Math.floor(Number(pool[key]) || 0);
      if (qty > 0) total += qty;
    }
    return total;
  },

  _salvageSourceBinding(entity) {
    const data = entity && entity.data;
    const sourceKey = data && typeof data.salvageSourceKey === 'string' ? data.salvageSourceKey : null;
    if (!sourceKey) return null;
    const salvageApi = this.helpers && this.helpers.salvage;
    const source = salvageApi && typeof salvageApi.source === 'function' ? salvageApi.source(sourceKey) : null;
    return {
      sourceKey,
      salvagePointId: typeof data.salvagePointId === 'string' ? data.salvagePointId : (source && source.salvagePointId) || null,
      source,
    };
  },

  _salvageSourceBindingFromPayload(payload) {
    const sourceKey = payload && typeof payload.salvageSource === 'string' ? payload.salvageSource : null;
    if (!sourceKey) return null;
    const salvageApi = this.helpers && this.helpers.salvage;
    const source = salvageApi && typeof salvageApi.source === 'function' ? salvageApi.source(sourceKey) : null;
    return {
      sourceKey,
      salvagePointId: typeof payload.salvagePointId === 'string'
        ? payload.salvagePointId
        : (source && source.salvagePointId) || null,
      source,
    };
  },

  _releaseSalvageSourceClaim(binding, worldRecordId) {
    const salvageApi = this.helpers && this.helpers.salvage;
    if (!binding || !binding.sourceKey || !worldRecordId
      || !salvageApi || typeof salvageApi.releaseSourceClaim !== 'function') return false;
    return !!salvageApi.releaseSourceClaim({ sourceKey: binding.sourceKey, claimantId: worldRecordId }).ok;
  },

  _salvorHomeForTarget(stations, sectorId, target) {
    const binding = this._salvageSourceBinding(target);
    if (binding && binding.source && binding.source.homeStationId) {
      return (stations || []).find((station) => stationIdentity(station) === binding.source.homeStationId) || null;
    }
    return this._pocketStation(stations, sectorId) || (stations && stations[0]) || null;
  },

  _onFreightCargoSpilled(payload) {
    const state = this.state;
    if (!state) return;
    if (state.mode !== 'flight') return;
    const sectorId = state.world && state.world.currentSectorId;
    if (!sectorId) return;

    const encounterId = payload && payload.encounterId;
    const matchByEncounter = encounterId != null && encounterId !== '';
    const carrierId = payload && payload.carrierId;
    const carrier = (carrierId != null && state.entities && typeof state.entities.get === 'function')
      ? state.entities.get(carrierId)
      : null;
    const carrierLive = !!(carrier && carrier.alive !== false && carrier.pos);
    const r2 = SPILL_POD_CARRIER_RADIUS * SPILL_POD_CARRIER_RADIUS;

    const encounterPods = [];
    const nearbyPods = [];
    for (const entity of state.entityList || []) {
      if (!entity || entity.alive === false || entity.type !== 'pickup' || !entity.pos) continue;
      const data = entity.data || {};
      if (!data.freightCustodyPod || typeof data.freightCustodyPod !== 'object') continue;
      if (matchByEncounter && data.encounterId === encounterId) {
        encounterPods.push(entity);
        continue;
      }
      if (!carrierLive) continue;
      const dx = entity.pos.x - carrier.pos.x;
      const dz = entity.pos.z - carrier.pos.z;
      if (dx * dx + dz * dz <= r2) nearbyPods.push(entity);
    }
    const pods = encounterPods.length ? encounterPods : nearbyPods;
    if (!pods.length) return;

    const isSurvival = (entity) => !!(entity && entity.data && entity.data.runCohort === 'survival');
    if (isSurvival(carrier) || pods.some(isSurvival)) return;

    const t = Number.isFinite(state.simTime) ? state.simTime : 0;
    const podIds = [];
    for (const pod of pods) {
      const data = pod.data || (pod.data = {});
      data.spillNoticed = true;
      // Announced on the distress channel, so yards do not wait the 18-45 s stumble used for hulks.
      data.salvorNoticeAt = t + SPILL_ANNOUNCE_NOTICE_S;
      podIds.push(pod.id);
    }

    this._salvageTargetCache = null;
    this._salvageTargetCacheTick = null;
    this._dispatchGeneralSalvors(sectorId);
    this._dispatchYardTugs(sectorId);
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('traffic:spillNoticed', {
        encounterId,
        custodyId: payload && payload.custodyId,
        podIds,
        sectorId,
        t,
      });
    }
  },

  _isSalvageableBody(entity) {
    if (!entity || entity.alive === false || !entity.pos) return false;
    const data = entity.data || {};
    const source = this._salvageSourceBinding(entity);
    if (source) return !!(source.source && !source.source.extracted && source.source.remainingQty > 0);
    if (entity.type === 'wreck') {
      return this._salvagePoolTotal(data.salvagePool) > 0;
    }
    if (entity.type === 'payload') {
      if (data.payloadType !== CIVILIAN_MANIFEST_PAYLOAD_TYPE) return false;
      return this._salvagePoolTotal(data.salvagePool) > 0;
    }
    if (entity.type === 'pickup'
        && data.spillNoticed === true
        && data.freightCustodyPod
        && typeof data.freightCustodyPod === 'object'
        && Number.isFinite(data.amount)
        && data.amount > 0) {
      return true;
    }
    return false;
  },

  _salvorClaimantOf(entity) {
    const source = this._salvageSourceBinding(entity);
    if (source) return source.source && source.source.claimId || null;
    const claim = entity && entity.data && entity.data.salvorClaimedBy;
    return typeof claim === 'string' && claim ? claim : null;
  },

  _clearSalvorClaim(entity, worldRecordId) {
    if (!entity || !entity.data) return;
    const source = this._salvageSourceBinding(entity);
    if (source) {
      this._releaseSalvageSourceClaim(source, worldRecordId);
      return;
    }
    if (worldRecordId && entity.data.salvorClaimedBy !== worldRecordId) return;
    delete entity.data.salvorClaimedBy;
  },

  _stampSalvorClaim(entity, worldRecordId) {
    if (!entity || !entity.data || !worldRecordId) return false;
    const source = this._salvageSourceBinding(entity);
    if (source) {
      const salvageApi = this.helpers && this.helpers.salvage;
      return !!(salvageApi && typeof salvageApi.claimSource === 'function'
        && salvageApi.claimSource({ sourceKey: source.sourceKey, claimantId: worldRecordId }).ok);
    }
    const existing = this._salvorClaimantOf(entity);
    if (existing && existing !== worldRecordId) return false;
    entity.data.salvorClaimedBy = worldRecordId;
    return true;
  },

  _salvorNoticeReady(entity, simTime) {
    if (!entity || !entity.data) return false;
    const t = Number.isFinite(simTime) ? simTime : 0;
    if (!Number.isFinite(entity.data.salvorNoticeAt)) {
      const seed = (this.state.meta && this.state.meta.seed) || 1;
      const sectorId = (this.state.world && this.state.world.currentSectorId) || '';
      const span = Math.max(1, SALVOR_NOTICE_DELAY_SPAN_S | 0);
      const roll = (hash32(seed, 'salvor_notice', entity.id, sectorId, entity.type) >>> 0) % span;
      entity.data.salvorNoticeAt = t + SALVOR_NOTICE_DELAY_MIN_S + roll;
    }
    return t >= entity.data.salvorNoticeAt;
  },

  _listSalvageTargets() {
    const tick = this.state && Number.isInteger(this.state.tick) ? this.state.tick : 0;
    if (this._salvageTargetCache
        && this._salvageTargetCacheTick != null
        && tick - this._salvageTargetCacheTick < 4
        && !shouldRunOnTick(tick, 'traffic:salvageList', 4)) {
      return this._salvageTargetCache;
    }
    const out = [];
    for (const e of this.state.entityList || []) {
      if (this._isSalvageableBody(e)) out.push(e);
    }
    // Stable order for deterministic assignment under the concurrent cap.
    out.sort((a, b) => {
      const ta = a.type === 'payload' ? 0 : 1;
      const tb = b.type === 'payload' ? 0 : 1;
      if (ta !== tb) return ta - tb;
      return String(a.id).localeCompare(String(b.id), 'en');
    });
    this._salvageTargetCache = out;
    this._salvageTargetCacheTick = tick;
    return out;
  },

  _countGeneralSalvors() {
    let n = 0;
    for (const rec of this.state.traffic.freighters || []) {
      if (!rec || rec.role !== 'salvor') continue;
      const ent = this.state.entities && this.state.entities.get && this.state.entities.get(rec.id);
      if (!ent || ent.alive === false || !ent.data) continue;
      if (ent.data.ceresActivityCast === true || ent.data.activityActorSlotId) continue;
      if (ent.data.jobId) n += 1;
    }
    return n;
  },

  _pickUnclaimedSalvageTarget(anchor) {
    const ax = anchor && anchor.pos && Number.isFinite(anchor.pos.x) ? anchor.pos.x : 0;
    const az = anchor && anchor.pos && Number.isFinite(anchor.pos.z) ? anchor.pos.z : 0;
    let best = null;
    let bestD2 = Infinity;
    for (const target of this._listSalvageTargets()) {
      const claim = this._salvorClaimantOf(target);
      if (claim) continue;
      if (!this._salvorNoticeReady(target, this.state.simTime || 0)) continue;
      const dx = target.pos.x - ax;
      const dz = target.pos.z - az;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; best = target; }
    }
    return best;
  },

  _buildSalvorJobSpec(home, target, sectorId) {
    if (!home || !home.pos || !target || !target.pos) return null;
    const targetKind = target.type === 'payload' ? 'payload' : 'hulk';
    const source = this._salvageSourceBinding(target);
    return {
      kind: 'salvor',
      sectorId,
      route: [
        { id: 'yard:' + stationIdentity(home), pos: { x: home.pos.x, z: home.pos.z }, label: 'Scrap Yard' },
        {
          id: `${targetKind}:${target.id}`,
          pos: { x: target.pos.x, z: target.pos.z },
          label: targetKind === 'payload' ? 'Loose Cargo' : 'Hulk',
        },
      ],
      // Planning only: points at the live body. Extracted value is stamped onto cargoManifest later.
      payload: {
        targetId: target.id,
        targetType: target.type,
        ...(source ? {
          salvageSource: source.sourceKey,
          salvagePointId: source.salvagePointId,
        } : {}),
        extracted: false,
      },
    };
  },

  _resolveSalvorTargetFromWaypoint(waypointId, payload = null) {
    const source = this._salvageSourceBindingFromPayload(payload);
    if (source) {
      const salvageApi = this.helpers && this.helpers.salvage;
      return salvageApi && typeof salvageApi.entityForPoint === 'function'
        ? salvageApi.entityForPoint(source.salvagePointId, source.sourceKey)
        : null;
    }
    if (typeof waypointId !== 'string' || !waypointId) return null;
    let raw = null;
    if (waypointId.startsWith('hulk:')) raw = waypointId.slice(5);
    else if (waypointId.startsWith('payload:')) raw = waypointId.slice(8);
    else return null;
    if (!raw) return null;
    const numeric = Number(raw);
    return this.state.entities && this.state.entities.get
      ? (this.state.entities.get(raw)
        || (Number.isFinite(numeric) ? this.state.entities.get(numeric) : null))
      : null;
  },

  _buildSalvorManifest(entity, seq, pool, source = null) {
    const lines = [];
    let totalQty = 0;
    for (const commodityId of Object.keys(pool || {}).sort((a, b) => a.localeCompare(b))) {
      const qty = Math.max(0, Math.floor(Number(pool[commodityId]) || 0));
      if (qty <= 0) continue;
      lines.push({ commodityId, qty });
      totalQty += qty;
    }
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const freighterKey = entity && entity.data && entity.data.worldRecordId
      || entity && entity.id
      || 'npc-salvor';
    const marketKeys = lines.length
      ? lines.map((line) => line.commodityId)
      : FREIGHT_MARKET_KEYS_FALLBACK.slice();
    // Structural freight envelope only. Lines are overwritten from the real pool so we never mint
    // a random market draw in place of taken salvage.
    const manifest = buildCargoManifest({
      seed,
      freighterKey: `${freighterKey}:salvage:${Math.max(0, seq | 0)}`,
      role: 'hauler',
      marketKeys,
      capacity: Math.max(0, totalQty),
    });
    manifest.lines = lines;
    manifest.totalQty = totalQty;
    manifest.role = 'salvor';
    // The cutter's extracted lot keeps one durable identity from wreck to yard. The source sequence
    // is the WORK intent that created the manifest, not a later unload attempt, so a rejected hold
    // can circle and retry without becoming a second market receipt.
    manifest.lotId = manifest.manifestId;
    manifest.salvageSeq = Math.max(0, seq | 0);
    if (source && source.sourceKey) {
      manifest.salvageSource = source.sourceKey;
      manifest.salvagePointId = source.salvagePointId || null;
    }
    return manifest;
  },

  _emptySalvorManifest(entity, seq) {
    return this._buildSalvorManifest(entity, seq, {});
  },

  _despawnSalvagePayload(entity, reason) {
    if (!entity || entity.type !== 'payload') return false;
    const removeEntity = this.helpers && this.helpers.removeEntity;
    if (typeof removeEntity === 'function') {
      removeEntity(entity.id, { immediate: true, reason: reason || 'salvor_absorbed' });
    } else entity.alive = false;
    return true;
  },

  _takeSalvageValueOntoSalvor(context, intent, target) {
    if (!context || !context.entity || !target) return false;
    const seq = Number.isSafeInteger(intent && intent.seq) && intent.seq >= 0 ? intent.seq : 0;
    const workId = `npc-salvor-work:${context.worldRecordId}:${seq}`;
    const source = this._salvageSourceBinding(target);
    this._ensureState();
    if (!Array.isArray(this.state.traffic.appliedSalvorWorkIds)) {
      this.state.traffic.appliedSalvorWorkIds = [];
    }
    if (this.state.traffic.appliedSalvorWorkIds.includes(workId)) return false;

    let pool = target.data && target.data.salvagePool
      ? { ...target.data.salvagePool }
      : {};
    if (source) {
      const salvageApi = this.helpers && this.helpers.salvage;
      if (!this._stampSalvorClaim(target, context.worldRecordId)
        || !salvageApi || typeof salvageApi.takeSource !== 'function') return false;
      const taken = salvageApi.takeSource({
        sourceKey: source.sourceKey,
        claimantId: context.worldRecordId,
        workId,
      });
      pool = taken && taken.ok ? taken.pool : {};
    }
    const total = this._salvagePoolTotal(pool);

    if (total > 0) {
      if (!source && !this._stampSalvorClaim(target, context.worldRecordId)) return false;
      const manifest = this._buildSalvorManifest(context.entity, seq, pool, source);
      this._setTrafficManifest(context.entity, context.rec, manifest);
      // Drain the body so the player cannot double-take what the cutter already loaded.
      if (!source && target.data) {
        target.data.salvagePool = {};
        if (target.type === 'wreck') {
          target.data.salvageTimeLeft = 0;
          target.data._salvaged = true;
        }
      }
      if (target.type === 'payload') this._despawnSalvagePayload(target, 'salvor_absorbed');
    } else {
      this._setTrafficManifest(context.entity, context.rec, this._emptySalvorManifest(context.entity, seq));
      this._clearSalvorClaim(target, context.worldRecordId);
    }

    // Keep job planning payload honest for save/Continue observers.
    const getJob = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.get;
    const entry = typeof getJob === 'function' ? getJob(context.jobId) : null;
    if (entry && entry.job) {
      entry.job.payload = {
        targetId: target.id,
        targetType: target.type,
        ...(source ? {
          salvageSource: source.sourceKey,
          salvagePointId: source.salvagePointId,
        } : {}),
        extracted: total > 0,
        totalQty: total,
      };
    }

    this.state.traffic.appliedSalvorWorkIds.push(workId);
    if (this.state.traffic.appliedSalvorWorkIds.length > SALVOR_WORK_LEDGER_CAP) {
      this.state.traffic.appliedSalvorWorkIds.splice(
        0,
        this.state.traffic.appliedSalvorWorkIds.length - SALVOR_WORK_LEDGER_CAP,
      );
    }
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('salvage:npcExtraction', {
        jobId: context.jobId,
        workId,
        salvorId: context.entity.id,
        targetId: target.id,
        targetType: target.type,
        salvageSource: source && source.sourceKey || null,
        sectorId: (this.state.world && this.state.world.currentSectorId) || null,
        totalQty: total,
        seq,
      });
    }
    return true;
  },

  _spawnGeneralSalvorNear(home, sectorId, seq) {
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return null;
    if (!home || !home.pos) return null;
    const def = TRAFFIC_ROLES.salvor;
    const sector = (this.state.world && this.state.world.sectors)
      ? this.state.world.sectors[sectorId]
      : null;
    const controllingFaction = (sector && sector.factionId)
      || (this.state.world && this.state.world.currentSector && this.state.world.currentSector.factionId)
      || 'faction_free';
    // Deterministic offset from the yard so two concurrent cutters do not stack on one point.
    const ang = ((hash32((this.state.meta && this.state.meta.seed) || 1, 'salvor_spawn', sectorId, seq) >>> 0)
      / 0xffffffff) * Math.PI * 2;
    const r = 100 + (seq % 3) * 28;
    const pos = { x: home.pos.x + Math.cos(ang) * r, z: home.pos.z + Math.sin(ang) * r };
    const spec = makeShipEntitySpec(factionHullFor(def.ship, controllingFaction, () => 0.5), {
      team: def.team,
      factionId: controllingFaction,
      pos,
      ai: {
        archetype: def.archetype,
        passive: true,
        spawnContext: 'convoy_civilian',
      },
    });
    const ent = this.helpers.spawnEntity(spec);
    if (!ent) return null;
    this._stampTrafficDurableIdentity(ent, sectorId, 'salvor', def, 800 + (seq | 0));
    ent.data.trafficRole = 'salvor';
    ent.data.role = 'salvor';
    ent.data.trafficLabel = def.label;
    ent.data.generalSalvor = true;
    // Persist mid-job cutters + carried cargo across Continue (save only keeps flags.persistent).
    ent.flags = Object.assign({}, ent.flags, { persistent: true });
    // Empty hold on commission — value is claimed from the wreck/payload, never pre-rolled.
    const empty = this._emptySalvorManifest(ent, 0);
    this._setTrafficManifest(ent, null, empty);
    this._active.push(ent.id);
    const rec = {
      id: ent.id,
      role: 'salvor',
      targetId: home.id,
      waitT: 0,
      nextTradeT: 0,
      orbitPhase: ang,
      dockSeq: 0,
      manifest: empty,
      generalSalvor: true,
    };
    this.state.traffic.freighters.push(rec);
    return { entity: ent, rec };
  },

  // ── Yard tugs: the ordinary-life tow (PQ-143.01) ───────────────────────────────────────────────
  //
  // Same doctrine as the cleanup profession below: the tug is dispatched against a real body, never
  // rolled from the ambient mix (`trafficRoleMixForSector` holds `out.tug = 0`). Unlike salvors this
  // DOES run in the Ceres pocket — the eight-actor authored cast contains a salvor but no tug, so a
  // dispatched tug is additive ambient traffic and never contends with an authored slot.
  //
  // The tug takes the body somewhere; the cutter strips it where it lies. They must therefore never
  // want the same wreck in the same moment, which `_salvorClaimantOf` and `npcTowedByJobId` already
  // enforce from both sides.

  _countYardTugs() {
    let n = 0;
    for (const rec of this.state.traffic.freighters || []) {
      if (!rec || rec.role !== 'tug') continue;
      const ent = this.state.entities && this.state.entities.get && this.state.entities.get(rec.id);
      if (!ent || ent.alive === false || !ent.data) continue;
      if (ent.data.ceresActivityCast === true || ent.data.activityActorSlotId) continue;
      if (ent.data.jobId) n += 1;
    }
    return n;
  },

  // A towable body is a salvageable body heavy enough to be worth a tug and not already spoken for
  // by a cutter or another tug. Reusing `_listSalvageTargets` keeps one cached census of loose
  // bodies per tick instead of adding a second full `entityList` sweep.
  _isTowableBody(entity) {
    if (!this._isSalvageableBody(entity)) return false;
    if (entity.type !== 'wreck' && entity.type !== 'payload') return false;
    const data = entity.data || {};
    if (data.npcTowedByJobId != null) return false;
    if (this._salvorClaimantOf(entity)) return false;
    // Authored site structure is not loose freight. Every "wreck" standing in the Ceres pocket is a
    // `world_site_*` collision proxy or component owned by worldSiteKernel; dragging one away would
    // dismantle an authored place.
    if (data.worldSiteId != null || data.worldObjectId != null) return false;
    if (Number(entity.mass) >= PINNED_BODY_MASS) return false;
    return Number(entity.radius) >= TOWABLE_BODY_MIN_RADIUS_WU;
  },

  _pickUnclaimedTowTarget(anchor) {
    const ax = anchor && anchor.pos && Number.isFinite(anchor.pos.x) ? anchor.pos.x : 0;
    const az = anchor && anchor.pos && Number.isFinite(anchor.pos.z) ? anchor.pos.z : 0;
    let best = null;
    let bestD2 = Infinity;
    let bestId = '';
    for (const target of this._listSalvageTargets()) {
      if (!this._isTowableBody(target)) continue;
      if (!this._salvorNoticeReady(target, this.state.simTime || 0)) continue;
      const dx = target.pos.x - ax;
      const dz = target.pos.z - az;
      const d2 = dx * dx + dz * dz;
      if (!Number.isFinite(d2)) continue;
      const id = String(target.id);
      // Distance first, id second: a stable total order, so two ticks with the same world pick the
      // same body and the choice never depends on entity iteration order.
      if (d2 < bestD2 || (d2 === bestD2 && id < bestId)) { best = target; bestD2 = d2; bestId = id; }
    }
    return best;
  },

  _spawnYardTugNear(home, sectorId, seq) {
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return null;
    if (!home || !home.pos) return null;
    const def = TRAFFIC_ROLES.tug;
    const sector = (this.state.world && this.state.world.sectors)
      ? this.state.world.sectors[sectorId]
      : null;
    const controllingFaction = (sector && sector.factionId)
      || (this.state.world && this.state.world.currentSector && this.state.world.currentSector.factionId)
      || 'faction_free';
    const ang = ((hash32((this.state.meta && this.state.meta.seed) || 1, 'yard_tug_spawn', sectorId, seq) >>> 0)
      / 0xffffffff) * Math.PI * 2;
    const r = 110 + (seq % 3) * 24;
    const pos = { x: home.pos.x + Math.cos(ang) * r, z: home.pos.z + Math.sin(ang) * r };
    const spec = makeShipEntitySpec(factionHullFor(def.ship, controllingFaction, () => 0.5), {
      team: def.team,
      factionId: controllingFaction,
      pos,
      ai: {
        archetype: def.archetype,
        passive: true,
        spawnContext: 'convoy_civilian',
      },
    });
    const ent = this.helpers.spawnEntity(spec);
    if (!ent) return null;
    this._stampTrafficDurableIdentity(ent, sectorId, 'tug', def, 900 + (seq | 0));
    ent.data.trafficRole = 'tug';
    ent.data.role = 'tug';
    ent.data.trafficLabel = def.label;
    ent.data.yardTug = true;
    // A tug mid-tow must survive Continue, exactly as a mid-job cutter does.
    ent.flags = Object.assign({}, ent.flags, { persistent: true });
    this._active.push(ent.id);
    const rec = {
      id: ent.id,
      role: 'tug',
      targetId: home.id,
      waitT: 0,
      nextTradeT: 0,
      orbitPhase: ang,
      dockSeq: 0,
      manifest: null,
      yardTug: true,
    };
    this.state.traffic.freighters.push(rec);
    return { entity: ent, rec };
  },

  // The physical thing the tug came for. It exists because a tug job exists, and it is a real body
  // the player can shoot, salvage or simply get in front of — not a marker and not a line ending in
  // nothing. Traffic owns this lifecycle exactly as it owns the hulls it spawns; npcJobsRuntime only
  // binds the already-live body through the combat attachment service.
  _spawnYardTugLot(berth, sectorId, manifest, seq) {
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return null;
    if (!berth || !berth.pos) return null;
    const total = manifest && Number.isFinite(Number(manifest.totalQty)) ? Math.floor(Number(manifest.totalQty)) : 0;
    if (!(total > 0)) return null; // no finite freight → no lot, and therefore no job
    const ang = ((hash32((this.state.meta && this.state.meta.seed) || 1, 'yard_tug_lot', sectorId, seq) >>> 0)
      / 0xffffffff) * Math.PI * 2;
    // Stand the lot off the berth ring so it is clear of the station collider it was loaded from.
    const r = (Number(berth.radius) || 40) + YARD_TUG_LOT.radius + 34;
    const pos = { x: berth.pos.x + Math.cos(ang) * r, z: berth.pos.z + Math.sin(ang) * r };
    // The lot's salvage value IS the booked manifest, so a player who cracks it open takes exactly
    // the freight the tug was hired to move. Nothing is minted here that the economy did not book.
    const salvagePool = {};
    for (const line of Array.isArray(manifest.lines) ? manifest.lines : []) {
      const qty = Math.floor(Number(line && line.qty) || 0);
      if (line && typeof line.commodityId === 'string' && qty > 0) {
        salvagePool[line.commodityId] = (salvagePool[line.commodityId] || 0) + qty;
      }
    }
    if (Object.keys(salvagePool).length === 0) return null;
    const ent = this.helpers.spawnEntity({
      type: 'payload',
      team: 2,
      pos,
      vel: { x: 0, z: 0 },
      rot: ang,
      radius: YARD_TUG_LOT.radius,
      mass: YARD_TUG_LOT.mass,
      hull: YARD_TUG_LOT.hull,
      hullMax: YARD_TUG_LOT.hull,
      collides: true,
      ttl: Infinity,
      homeSectorId: sectorId,
      physicsBody: {
        dynamic: true,
        radius: YARD_TUG_LOT.radius,
        mass: YARD_TUG_LOT.mass,
        inertiaY: 0.5 * YARD_TUG_LOT.mass * YARD_TUG_LOT.radius * YARD_TUG_LOT.radius,
      },
      data: {
        sectorId,
        payloadType: CIVILIAN_MANIFEST_PAYLOAD_TYPE,
        authoredPayloadAssetId: YARD_TUG_LOT.assetId,
        payloadStableId: 'yard_tug_lot',
        yardTugLot: true,
        towable: true,
        salvagePool,
        cargoManifest: manifest,
      },
    });
    if (!ent) return null;
    // A lot under tow must survive Continue with its tug.
    ent.flags = Object.assign({}, ent.flags, { persistent: true });
    this._active.push(ent.id);
    return ent;
  },

  _dispatchYardTugs(sectorId) {
    if (!sectorId) return 0;
    const assign = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.assign;
    if (typeof assign !== 'function') return 0; // golden / headless without job runtime → no tugs
    if ((this.state.mode || 'flight') !== 'flight') return 0;
    this._ensureState();
    const stations = this._sectorStations();
    if (stations.length < 2) return 0; // a tow needs somewhere to take the body

    let active = this._countYardTugs();
    if (active >= MAX_YARD_TUGS_PER_SECTOR) return 0;

    // Two ways a tow exists. FIRST, a loose body already drifting in the pocket — the honest case,
    // and the one a player creates by leaving a kill behind. SECOND, and this is what makes the
    // profession visible in a quiet five minutes, the yard's own outbound freight: a berth books a
    // finite lot, and the tug is what moves it. Both are real bodies under the same physics owner.
    const berth = this._nearestStationTo(stations, stations[0]) ? stations[0] : null;
    if (!berth || !berth.pos) return 0;

    let dispatched = 0;
    let existing = this._pickUnclaimedTowTarget(berth);

    while (active < MAX_YARD_TUGS_PER_SECTOR) {
      const home = existing ? (this._nearestStationTo(stations, existing) || berth) : berth;
      if (!home || !home.pos) break;

      // Prefer an idle tug hull already in the sector before adding another body to the pocket.
      let pair = null;
      for (const rec of this.state.traffic.freighters || []) {
        if (!rec || rec.role !== 'tug') continue;
        const ent = this.state.entities && this.state.entities.get && this.state.entities.get(rec.id);
        if (!ent || ent.alive === false || !ent.data) continue;
        if (ent.data.ceresActivityCast === true || ent.data.activityActorSlotId) continue;
        if (ent.data.jobId) continue;
        pair = { entity: ent, rec };
        break;
      }
      if (!pair) {
        pair = this._spawnYardTugNear(home, sectorId, active + dispatched);
        if (!pair) break;
      }

      // The finite work lot the tug books for this run. Stamped before assign so the job kernel and
      // the npcJobsRuntime manifest gate see the same numbers the economy owner wrote.
      this._assignManifest(pair.entity, 'tug', home, sectorId);
      const manifest = pair.entity.data && pair.entity.data.cargoManifest;
      // No loose body to fetch → the berth's own outbound lot becomes the physical load.
      let target = existing;
      let spawnedLot = null;
      if (!target) {
        spawnedLot = this._spawnYardTugLot(home, sectorId, manifest, active + dispatched);
        target = spawnedLot;
      }
      if (!target || !target.pos) break;

      const spec = this._buildJobSpec('tug', pair.entity, home, target, stations, sectorId);
      if (!spec || !this._stampSalvorClaim(target, pair.entity.data.worldRecordId)) {
        if (spawnedLot) this._despawnYardTugLot(spawnedLot);
        break;
      }
      const jobId = assign(pair.entity, spec);
      if (!jobId) {
        this._clearSalvorClaim(target, pair.entity.data.worldRecordId);
        if (spawnedLot) this._despawnYardTugLot(spawnedLot);
        break;
      }
      pair.entity.data.jobKind = 'hauler';
      pair.entity.data.yardTug = true;
      pair.rec.yardTug = true;
      pair.rec.role = 'tug';
      active += 1;
      dispatched += 1;
      existing = null;
    }
    return dispatched;
  },

  // A delivered or abandoned lot must leave the world. Without this the yard accumulates one
  // container per completed run forever, which is unbounded entity growth, not ordinary life.
  _despawnYardTugLot(lot) {
    if (!lot) return;
    lot.alive = false;
    lot.ttl = 0;
    if (lot.data) lot.data.yardTugLotRetired = true;
    const despawn = this.helpers && (this.helpers.despawnEntity || this.helpers.removeEntity);
    if (typeof despawn === 'function') despawn(lot.id);
    else if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('entity:destroyed', { id: lot.id, reason: 'yard_tug_lot_delivered' });
    }
  },

  // Release a tug whose body vanished (the player stripped it, a cutter finished it, it despawned)
  // so the hull returns to its ambient stepper instead of hauling an empty line to the yard.
  _maintainYardTugJobs() {
    const getJob = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.get;
    const release = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.release;
    if (typeof getJob !== 'function' || typeof release !== 'function') return;
    for (const rec of this.state.traffic.freighters || []) {
      if (!rec || rec.role !== 'tug') continue;
      const ent = this.state.entities && this.state.entities.get && this.state.entities.get(rec.id);
      if (!ent || !ent.data || !ent.data.jobId || ent.data.ceresActivityCast === true) continue;
      const entry = getJob(ent.data.jobId);
      const job = entry && entry.job;
      if (!job || job.kind !== 'hauler' || job.corrupt) continue;
      const targetId = job.payload && job.payload.towTargetId;
      if (targetId == null) continue;
      const body = this.state.entities && this.state.entities.get
        ? this.state.entities.get(targetId)
        : null;
      // Still there, or already under tow: leave the run alone.
      if (body && body.alive !== false && (body.data && body.data.npcTowedByJobId != null
        || this._salvagePoolTotal(body.data && body.data.salvagePool) > 0)) continue;
      if (body) this._clearSalvorClaim(body, ent.data.worldRecordId);
      release(ent.data.jobId);
    }
    this._retireDeliveredYardTugLots();
  },

  // Delivery cleanup. A lot the tug booked is retired once no live job still owns it: the run
  // completed at the yard, or the tug that was hired for it is gone. A lot the PLAYER is working
  // (its pool already opened) is left alone — that is their salvage now, not the yard's freight.
  _retireDeliveredYardTugLots() {
    const byId = this.state.npcJobs && this.state.npcJobs.byId;
    for (const ent of this.state.entityList || []) {
      if (!ent || ent.alive === false || !ent.data || ent.data.yardTugLot !== true) continue;
      if (ent.data.npcTowedByJobId != null) {
        // Under tow: alive by definition, and its owning job is the authority.
        const owner = ent.data.npcTowedByJobId;
        if (byId && byId[owner]) continue;
      }
      let owned = false;
      for (const rec of this.state.traffic.freighters || []) {
        if (!rec || rec.role !== 'tug') continue;
        const tug = this.state.entities && this.state.entities.get && this.state.entities.get(rec.id);
        if (!tug || tug.alive === false || !tug.data || !tug.data.jobId) continue;
        const entry = byId && byId[tug.data.jobId];
        const payload = entry && entry.job && entry.job.payload;
        if (payload && payload.towTargetId === ent.id) { owned = true; break; }
      }
      if (owned) continue;
      this._despawnYardTugLot(ent);
    }
  },

  _dispatchGeneralSalvors(sectorId) {
    if (!sectorId || sectorId === CERES_ACTIVITY_SECTOR_ID) return 0;
    const assign = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.assign;
    if (typeof assign !== 'function') return 0; // golden / headless without job runtime → no cutters
    if ((this.state.mode || 'flight') !== 'flight') return 0;
    this._ensureState();
    const stations = this._sectorStations();
    if (!stations.length) return 0;

    let active = this._countGeneralSalvors();
    if (active >= MAX_GENERAL_SALVORS_PER_SECTOR) return 0;

    let dispatched = 0;
    const targets = this._listSalvageTargets();
    for (const target of targets) {
      if (active >= MAX_GENERAL_SALVORS_PER_SECTOR) break;
      if (this._salvorClaimantOf(target)) continue;
      if (!this._salvorNoticeReady(target, this.state.simTime || 0)) continue;
      // The authored Vesta cutter must return to Forge, not whichever pocket station happens to
      // be first in the current entity ordering. Missing Forge means no Vesta dispatch, never a
      // fallback trip to another sector's service route.
      const home = this._salvorHomeForTarget(stations, sectorId, target);
      if (!home || !home.pos) continue;

      // Prefer an existing idle salvor hull; otherwise spawn one near the yard.
      let pair = null;
      for (const rec of this.state.traffic.freighters || []) {
        if (!rec || rec.role !== 'salvor') continue;
        const ent = this.state.entities && this.state.entities.get && this.state.entities.get(rec.id);
        if (!ent || ent.alive === false || !ent.data) continue;
        if (ent.data.ceresActivityCast === true || ent.data.activityActorSlotId) continue;
        if (ent.data.jobId) continue;
        pair = { entity: ent, rec };
        break;
      }
      if (!pair) {
        pair = this._spawnGeneralSalvorNear(home, sectorId, active + dispatched);
        if (!pair) break;
      }

      const spec = this._buildSalvorJobSpec(home, target, sectorId);
      if (!spec) continue;
      // Reserve the body before assign so two cutters cannot claim the same wreck in one tick.
      if (!this._stampSalvorClaim(target, pair.entity.data.worldRecordId)) continue;
      const jobId = assign(pair.entity, spec);
      if (!jobId) {
        this._clearSalvorClaim(target, pair.entity.data.worldRecordId);
        continue;
      }
      pair.entity.data.jobKind = 'salvor';
      pair.entity.data.generalSalvor = true;
      if (spec.payload && spec.payload.salvageSource) {
        pair.entity.data.salvageSource = spec.payload.salvageSource;
        pair.entity.data.salvagePointId = spec.payload.salvagePointId || null;
      } else {
        delete pair.entity.data.salvageSource;
        delete pair.entity.data.salvagePointId;
      }
      pair.rec.generalSalvor = true;
      pair.rec.role = 'salvor';
      active += 1;
      dispatched += 1;
    }
    return dispatched;
  },

  _maintainGeneralSalvorJobs() {
    const getJob = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.get;
    const release = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.release;
    if (typeof getJob !== 'function') return;
    const sectorId = this.state.world && this.state.world.currentSectorId;
    if (!sectorId || sectorId === CERES_ACTIVITY_SECTOR_ID) return;

    for (const rec of this.state.traffic.freighters || []) {
      if (!rec || rec.role !== 'salvor') continue;
      const ent = this.state.entities && this.state.entities.get && this.state.entities.get(rec.id);
      if (!ent || !ent.data || !ent.data.jobId || ent.data.ceresActivityCast === true) continue;
      const entry = getJob(ent.data.jobId);
      const job = entry && entry.job;
      if (!job || job.kind !== 'salvor' || job.corrupt) continue;

      const site = job.route && job.route[1];
      const source = this._salvageSourceBindingFromPayload(job.payload);
      rec.generalSalvor = true;
      ent.data.generalSalvor = true;
      ent.data.jobKind = 'salvor';
      if (source) {
        ent.data.salvageSource = source.sourceKey;
        ent.data.salvagePointId = source.salvagePointId || null;
      }
      const target = site ? this._resolveSalvorTargetFromWaypoint(site.id, job.payload) : null;
      const hasCargo = !!(ent.data.cargoManifest
        && Array.isArray(ent.data.cargoManifest.lines)
        && ent.data.cargoManifest.totalQty > 0);
      // Player beat the cutter to the body: retarget if another takeable remains, else leave empty.
      const beforeClaim = !hasCargo
        && (job.phase === NPC_JOB_PHASE.COMMISSION
          || job.phase === NPC_JOB_PHASE.TRANSIT
          || job.phase === NPC_JOB_PHASE.APPROACH
          || job.phase === NPC_JOB_PHASE.WORK);
      if (!beforeClaim) continue;
      if (target && this._isSalvageableBody(target)) {
        // Continue rematerializes the durable source with a new numeric entity id. Keep the job's
        // save-stable key, then refresh only the volatile waypoint/id/position from the live wreck.
        if (source && site) site.id = `hulk:${target.id}`;
        if (site.pos && target.pos) {
          site.pos.x = target.pos.x;
          site.pos.z = target.pos.z;
        }
        continue;
      }

      // Release claim on the missing body and try another.
      if (target) this._clearSalvorClaim(target, ent.data.worldRecordId);
      if (source) this._releaseSalvageSourceClaim(source, ent.data.worldRecordId);
      if (job.payload && job.payload.targetId != null) {
        const prior = this.state.entities && this.state.entities.get
          ? this.state.entities.get(job.payload.targetId)
          : null;
        if (prior) this._clearSalvorClaim(prior, ent.data.worldRecordId);
      }
      const next = this._pickUnclaimedSalvageTarget(ent);
      if (next && site) {
        const kind = next.type === 'payload' ? 'payload' : 'hulk';
        const nextSource = this._salvageSourceBinding(next);
        site.id = `${kind}:${next.id}`;
        site.pos = { x: next.pos.x, z: next.pos.z };
        site.label = kind === 'payload' ? 'Loose Cargo' : 'Hulk';
        job.payload = {
          targetId: next.id,
          targetType: next.type,
          ...(nextSource ? {
            salvageSource: nextSource.sourceKey,
            salvagePointId: nextSource.salvagePointId,
          } : {}),
          extracted: false,
        };
        if (nextSource) {
          ent.data.salvageSource = nextSource.sourceKey;
          ent.data.salvagePointId = nextSource.salvagePointId || null;
        } else {
          delete ent.data.salvageSource;
          delete ent.data.salvagePointId;
        }
        this._stampSalvorClaim(next, ent.data.worldRecordId);
        continue;
      }
      // Nothing left — keep flying the empty cycle home rather than inventing a second mover.
      if (job.payload) job.payload.extracted = false;
      void release; // release is available for one-shot kinds; salvor cycles empty honestly.
    }
  },

  // Escorts convoy with the nearest civilian freighter — they shadow it, distinct from patrols.
  _stepEscort(e, rec, list, state) {
    let ward = null, wd = Infinity;
    for (const r of list) {
      if (r.role === 'escort' || r.role === 'patrol' || r.role === 'pirate') continue;
      const w = state.entities.get(r.id);
      if (!w || !w.alive) continue;
      const d = Math.hypot(w.pos.x - e.pos.x, w.pos.z - e.pos.z);
      if (d < wd) { wd = d; ward = w; }
    }
    if (!ward) { setIntent(e, 0, 0, false, false, null, e.rot); return; }
    // hold station ~80 units behind the ward
    const back = ward.rot || 0;
    const tx = ward.pos.x - Math.cos(back) * 80;
    const tz = ward.pos.z - Math.sin(back) * 80;
    setIntent(e, 0, 1, false, false, null, Math.atan2(tz - e.pos.z, tx - e.pos.x));
  },

  /**
   * Deterministic cargo manifest from station market keys (ECON-P2). Stamped on entity.data
   * so scanners / rematerialize / continuous handoff can read it without re-rolling.
   */
  _assignManifest(ent, role, station, sectorId) {
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const freighterKey = (ent && ent.data && ent.data.worldRecordId)
      || (ent && ent.id != null ? String(ent.id) : `traffic:${role}`);
    const stationId = station && station.data && station.data.stationId;
    const market = stationId
      && this.state.economy
      && this.state.economy.markets
      && this.state.economy.markets[stationId];
    const manifest = buildCargoManifest({
      seed,
      freighterKey,
      role: role || 'hauler',
      market: market || FREIGHT_MARKET_KEYS_FALLBACK,
    });
    if (ent) {
      if (!ent.data) ent.data = {};
      ent.data.cargoManifest = manifest;
      if (sectorId && ent.data.sectorId == null) ent.data.sectorId = sectorId;
    }
    return manifest;
  },

  /**
   * Owner-safe arrival: emit aiTrader:requestTrade per manifest line (economy stock-only path).
   * Idempotent per freighter dockSeq. Never writes credits/cargo/stock/rep/heat here.
   */
  _emitArrival(entity, rec, station, options = null) {
    const stationId = station && station.data && station.data.stationId;
    if (!stationId || !rec) return false;
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const freighterKey = (entity && entity.data && entity.data.worldRecordId)
      || String(rec.id);
    const sectorId = (this.state.world && this.state.world.currentSectorId) || null;
    const role = rec.role || 'hauler';
    if (!FREIGHT_TRADING_ROLES.includes(role)) return false;

    const suppliedManifest = options && options.manifest;
    let manifest = suppliedManifest && Array.isArray(suppliedManifest.lines) && suppliedManifest.lines.length
      ? suppliedManifest
      : rec.manifest
      || (entity && entity.data && entity.data.cargoManifest)
      || null;
    if (!manifest || !Array.isArray(manifest.lines) || !manifest.lines.length) {
      manifest = this._assignManifest(entity, role, station, sectorId);
      rec.manifest = manifest;
    }

    // Conservation: live arrivals share the old abstract lane budget with sectorSim pressure.
    const liveVol = liveVolumeForSector(this.state, sectorId);
    // Use a unit baseline floor so a quiet field still allows embodied trade; sectorSim
    // scales its own abstract share with the same recipe against the real baseline.
    const recipe = pressureShareRecipe({
      baselineVolume: Math.max(liveVol, abstractBaselineVolume({
        lanePressure: 0.25, days: 0.25, goodsCount: Math.max(1, (manifest.lines || []).length),
      })),
      liveVolume: liveVol || manifest.totalQty || 0,
    });

    const suppliedDockSeq = options && Number.isSafeInteger(options.dockSeq) && options.dockSeq >= 0
      ? options.dockSeq
      : null;
    const dockSeq = suppliedDockSeq == null ? (rec.dockSeq | 0) : suppliedDockSeq;
    const intent = buildArrivalIntent({
      seed,
      freighterKey,
      freighterId: rec.id,
      stationId,
      sectorId,
      dockSeq,
      manifest,
      liveScale: recipe.liveScale > 0 ? recipe.liveScale : 1,
    });

    this._ensureCausalLedgerSets();
    const t = this.state.traffic;
    if (this._pendingArrivalIds.has(intent.intentId)) return false;
    const fresh = filterNewFreightIntents([intent], t.appliedArrivalIds);
    if (!fresh.length) {
      // A replayed job intent names its original sequence even after this hull has moved to its
      // next ambient leg. Preserve that newer manifest and only keep the sequence floor monotonic.
      rec.dockSeq = Math.max(rec.dockSeq | 0, dockSeq + 1);
      if (entity && entity.data) entity.data.freightDockSeq = rec.dockSeq;
      return false; // already applied this dock intent
    }

    // Reserve before any synchronous downstream owner sees the intent. A listener may re-enter the
    // same live completion; both the action reservation and this effect reservation must already be
    // visible or the nested delivery would apply twice.
    const reservation = this._reserveCausalId(
      intent.intentId,
      '_pendingArrivalIds',
      '_pendingArrivalTokens',
    );
    if (!reservation) return false;
    const causalGuard = options && typeof options.causalGuard === 'function'
      ? options.causalGuard
      : null;
    const stillCurrent = () => this._causalReservationIsCurrent(
      reservation,
      '_pendingArrivalIds',
      '_pendingArrivalTokens',
    ) && (!causalGuard || causalGuard());
    if (!stillCurrent()) {
      this._releaseCausalReservation(reservation, '_pendingArrivalIds', '_pendingArrivalTokens');
      return false;
    }
    try {
      for (const trade of intent.trades) {
        this.bus.emit('aiTrader:requestTrade', {
          stationId: trade.stationId,
          commodityId: trade.commodityId,
          side: trade.side,
          qty: trade.qty,
          cause: intent.cause,
          source: intent.source,
          intentId: intent.intentId,
          freighterId: rec.id,
          lotId: intent.lotId,
          lotSource: intent.lotSource,
        });
        if (!stillCurrent()) {
          this._releaseCausalReservation(reservation, '_pendingArrivalIds', '_pendingArrivalTokens');
          return false;
        }
      }
      this.bus.emit('freight:arrival', intent);
      if (!stillCurrent()) {
        this._releaseCausalReservation(reservation, '_pendingArrivalIds', '_pendingArrivalTokens');
        return false;
      }
    } catch {
      this._releaseCausalReservation(reservation, '_pendingArrivalIds', '_pendingArrivalTokens');
      return false;
    }
    t.appliedArrivalIds = mergeAppliedFreightIds(t.appliedArrivalIds, fresh);
    this._releaseCausalReservation(reservation, '_pendingArrivalIds', '_pendingArrivalTokens');
    if (options && options.ceresAction === true) {
      this._committedCeresArrivalIds.add(intent.intentId);
      this._pruneCommittedCeresIds(
        this._committedCeresArrivalIds,
        t.appliedArrivalIds,
      );
    }
    rec.dockSeq = Math.max(rec.dockSeq | 0, dockSeq + 1);
    if (entity && entity.data) entity.data.freightDockSeq = rec.dockSeq;

    // After delivery, refresh manifest for the next leg (still deterministic per dockSeq key).
    const nextKey = `${freighterKey}:leg:${rec.dockSeq}`;
    const nextManifest = buildCargoManifest({
      seed,
      freighterKey: nextKey,
      role,
      market: (this.state.economy && this.state.economy.markets && this.state.economy.markets[stationId])
        || FREIGHT_MARKET_KEYS_FALLBACK,
    });
    rec.manifest = nextManifest;
    if (entity && entity.data) entity.data.cargoManifest = nextManifest;
    return true;
  },

  /**
   * Bridge a materialized one-shot hauler job into the existing freight/economy authority.
   * Historical offscreen catch-up deliberately has no intent sink, so this can only represent an
   * unload the live job actually surfaced. Cyclic jobs use the kernel sequence; one-shot haulers
   * use the durable dock generation captured in their job payload.
   */
  _ceresActivityEntryForWorldRecordId(worldRecordId) {
    if (typeof worldRecordId !== 'string' || !worldRecordId) return null;
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    for (const activityEntry of CERES_ACTIVITY_CAST) {
      if (activityEntry.service) continue;
      const expected = stableRecordId(
        seed,
        CERES_ACTIVITY_SECTOR_ID,
        RECORD_KIND.CONVOY,
        activityEntry.slot.worldRecordSlotId,
      );
      if (worldRecordId === expected) return activityEntry;
    }
    return null;
  },

  _ceresActivityIntentClaimsOwnership(intent) {
    const jobId = intent && typeof intent.jobId === 'string' ? intent.jobId : '';
    if (!jobId.startsWith('job:') || jobId.length <= 4) return false;
    const worldRecordId = jobId.slice(4);
    if (this._ceresActivityEntryForWorldRecordId(worldRecordId)) return true;
    const getJob = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.get;
    const entry = typeof getJob === 'function' ? getJob(jobId) : null;
    const entity = (entry && liveEntity(this.state, entry.entityId))
      || entityWithWorldRecord(this.state, worldRecordId);
    const entitySlot = entity && entity.data && entity.data.activityActorSlotId;
    if (entitySlot) {
      const activityEntry = CERES_ACTIVITY_CAST_BY_SLOT_ID.get(entitySlot);
      if (activityEntry && !activityEntry.service) return true;
    }
    return !!(this.state.traffic && Array.isArray(this.state.traffic.freighters)
      && this.state.traffic.freighters.some((rec) => {
        if (!rec || rec.worldRecordId !== worldRecordId) return false;
        const activityEntry = CERES_ACTIVITY_CAST_BY_SLOT_ID.get(rec.activityActorSlotId);
        return !!activityEntry && !activityEntry.service;
      }));
  },

  _ceresActivityActorContext(intent) {
    const jobId = intent && typeof intent.jobId === 'string' ? intent.jobId : '';
    if (!jobId.startsWith('job:') || jobId.length <= 4) return null;
    const worldRecordId = jobId.slice(4);
    const entity = entityWithWorldRecord(this.state, worldRecordId);
    const slotId = entity && entity.data && entity.data.activityActorSlotId;
    const activityEntry = slotId && CERES_ACTIVITY_CAST_BY_SLOT_ID.get(slotId);
    const expectedEntry = this._ceresActivityEntryForWorldRecordId(worldRecordId);
    const records = this.state.world && this.state.world.records && this.state.world.records.byId;
    const durableRecord = records && records[worldRecordId];
    if (!entity || !activityEntry || activityEntry.service || expectedEntry !== activityEntry
      || slotId === CERES_TENDER_SLOT_ID
      || terminalWorldRecord(durableRecord)
      || !hasExactCeresSectorAuthority(entity)
      || entity.data.ceresActivityCast !== true
      || entity.data.ceresActivityJobOwned !== true
      || entity.data.jobId !== jobId) return null;
    return { jobId, worldRecordId, entity, activityEntry };
  },

  _ceresActivityActionContext(intent, action, actorContext, pendingActionToken = null) {
    const base = actorContext || this._ceresActivityActorContext(intent);
    if (!base || intent.completed !== true) return null;
    if (!this.state.world || this.state.world.currentSectorId !== CERES_ACTIVITY_SECTOR_ID) return null;
    const { jobId, worldRecordId, entity, activityEntry } = base;
    const { slot } = activityEntry;
    const rule = slot.id === CERES_SEAM_MINER_SLOT_ID && action === 'unload'
      ? CERES_ORE_BARGE_UNLOAD_ACTION
      : CERES_PRIMARY_ACTION_BY_JOB_KIND[slot.jobKind];
    if (!rule || rule.action !== action || intent.kind !== slot.jobKind) return null;

    const getJob = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.get;
    const entry = typeof getJob === 'function' ? getJob(jobId) : null;
    if (!entry || !entry.job || entry.job.schema !== NPC_JOB_SCHEMA || entry.job.corrupt === true
      || entry.job.materialized !== true || entry.job.id !== jobId || entry.job.kind !== slot.jobKind
      || entry.kind !== slot.jobKind || entry.sectorId !== CERES_ACTIVITY_SECTOR_ID
      || entry.worldRecordId !== worldRecordId || entry.entityId !== entity.id) return null;
    const rec = this.state.traffic && this.state.traffic.freighters
      && this.state.traffic.freighters.find((candidate) => candidate
        && candidate.id === entity.id
        && candidate.worldRecordId === worldRecordId
        && candidate.activityActorSlotId === slot.id
        && candidate.ceresActivityCast === true
        && candidate.ceresActivityJobOwned === true
        && candidate.role === slot.presentationRole);
    if (!rec) return null;

    if (entry.job.phase !== rule.phase || entry.job.progress !== 1
      || intent.phase !== rule.phase
      || !Number.isSafeInteger(intent.seq) || intent.seq <= 0
      || intent.seq !== entry.job.sequence
      || !Number.isFinite(intent.simTime) || intent.simTime !== entry.job.simTime) return null;
    const routeIndex = entry.job.routeIndex;
    const route = Array.isArray(entry.job.route) ? entry.job.route : [];
    if (!Number.isInteger(routeIndex) || routeIndex < 0 || routeIndex >= route.length) return null;
    const waypoint = route[routeIndex];
    const waypointId = waypoint && typeof waypoint.id === 'string' ? waypoint.id : '';
    if (!waypointId || intent.waypointId !== waypointId || intent[rule.intentField] !== waypointId) return null;
    const authoredMarks = slot.route && Array.isArray(slot.route.marks) ? slot.route.marks : [];
    const matchingMarks = authoredMarks.filter((mark) => mark && mark.id === waypointId);
    if (matchingMarks.length !== 1 || matchingMarks[0].targetRef !== waypoint.targetRef) return null;
    const targetRef = waypoint.targetRef;
    const target = this._resolveCeresActivityTarget(
      targetRef,
      waypoint,
      matchingMarks[0],
      activityEntry,
    );
    if (!target) return null;

    const kernelSequence = intent.seq;
    let sequence = kernelSequence;
    const jobPayload = entry.job.payload;
    if (slot.jobKind === 'hauler') {
      if (!sameJSONValue(intent.payload, jobPayload)) return null;
      const runSeq = jobPayload && jobPayload.activityRunSeq;
      const entityRunSeq = entity.data.freightDockSeq;
      if (!Number.isSafeInteger(runSeq) || runSeq < 0
        || runSeq !== (rec.dockSeq | 0) || runSeq !== (entityRunSeq | 0)) return null;
      sequence = runSeq;
      if (slot.id === CERES_REFINERY_HAULER_SLOT_ID
        && jobPayload.manifest != null
        && !validCausalManifest(jobPayload.manifest)) return null;
    }
    const receiptId = `ceres-job-action:${jobId}:${action}:${sequence}:${targetRef}`;
    this._ensureState();
    this._ensureCausalLedgerSets();
    const pendingReceipt = this._pendingJobActionIds.has(receiptId);
    if (this.state.traffic.appliedJobActionIds.includes(receiptId)
      || (pendingReceipt && !this._causalReservationIsCurrent(
        pendingActionToken,
        '_pendingJobActionIds',
        '_pendingJobActionTokens',
      ))) return null;
    return {
      ...base,
      slot,
      entry,
      rec,
      action,
      kernelSequence,
      sequence,
      waypoint,
      targetRef,
      target,
      jobPayload,
      receiptId,
      receiptAuthority: {
        routeId: slot.route.id,
        jobId,
        jobKind: slot.jobKind,
        action,
        sequence,
        kernelSequence,
        actorSlotId: slot.id,
        actorId: entity.id,
        targetRef,
        targetKind: target.kind,
        targetId: target.id,
        simTime: entry.job.simTime,
      },
    };
  },

  _ceresActivityActionStillCurrent(context, intent, actionToken) {
    if (!context || !intent || !this._causalReservationIsCurrent(
      actionToken,
      '_pendingJobActionIds',
      '_pendingJobActionTokens',
    )) return false;
    const actorContext = this._ceresActivityActorContext(intent);
    const current = this._ceresActivityActionContext(
      intent,
      context.action,
      actorContext,
      actionToken,
    );
    if (!current) return false;
    return current.receiptId === context.receiptId
      && current.slot === context.slot
      && current.entry === context.entry
      && current.entry.job === context.entry.job
      && current.entity === context.entity
      && current.rec === context.rec
      && current.waypoint === context.waypoint
      && current.target.kind === context.target.kind
      && current.target.id === context.target.id
      && current.target.entity === context.target.entity
      && sameJSONValue(current.receiptAuthority, context.receiptAuthority);
  },

  _resolveCeresActivityTarget(targetRef, waypoint, authoredMark, activityEntry) {
    if (typeof targetRef !== 'string' || !targetRef || !waypoint || !authoredMark
      || authoredMark.targetRef !== targetRef) return null;
    const parts = targetRef.split(':');
    const namespace = parts[0];
    if (namespace === 'activity') {
      const anchor = activityEntry && activityEntry.pocket
        && activityEntry.pocket.activityAnchor
        && activityEntry.pocket.activityAnchor.localPos;
      const offset = authoredMark.offset;
      if (parts.length !== 2 || !anchor || !offset || !waypoint.pos
        || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.z)
        || !Number.isFinite(offset.x) || !Number.isFinite(offset.z)
        || !Number.isFinite(waypoint.pos.x) || !Number.isFinite(waypoint.pos.z)) return null;
      const canonicalPos = sectorLocalToGlobalForSector({
        x: anchor.x + offset.x,
        z: anchor.z + offset.z,
      }, CERES_ACTIVITY_SECTOR_ID);
      if (waypoint.pos.x !== canonicalPos.x || waypoint.pos.z !== canonicalPos.z) return null;
      return { kind: 'activity', id: null };
    }

    let predicate = null;
    let kind = namespace;
    if (namespace === 'field' && parts.length === 3 && parts[1] === 'slot') {
      const slotId = parts[2];
      predicate = (entity) => entity.type === 'asteroid'
        && entity.data && entity.data.activityObjectSlotId === slotId;
      kind = 'field-slot';
    } else if (namespace === 'object' && parts.length === 2) {
      const slotId = parts[1];
      predicate = (entity) => entity.type === 'fx'
        && entity.data && entity.data.activityObjectSlotId === slotId;
    } else if (namespace === 'actor' && parts.length === 2) {
      const slotId = parts[1];
      const activityEntry = CERES_ACTIVITY_CAST_BY_SLOT_ID.get(slotId);
      const seed = (this.state.meta && this.state.meta.seed) || 1;
      const expectedWorldRecordId = activityEntry && !activityEntry.service
        ? stableRecordId(
            seed,
            CERES_ACTIVITY_SECTOR_ID,
            RECORD_KIND.CONVOY,
            activityEntry.slot.worldRecordSlotId,
          )
        : null;
      const records = this.state.world && this.state.world.records && this.state.world.records.byId;
      const durableRecord = records && expectedWorldRecordId && records[expectedWorldRecordId];
      predicate = (entity) => entity.type === 'ship'
        && entity.data && entity.data.ceresActivityCast === true
        && entity.data.ceresActivityJobOwned === true
        && entity.data.activityActorSlotId === slotId
        && entity.data.worldRecordId === expectedWorldRecordId
        && !terminalWorldRecord(durableRecord);
    } else if ((namespace === 'dest' || namespace === 'station') && parts.length >= 2) {
      const stationId = parts[1];
      predicate = (entity) => entity.type === 'station'
        && entity.data && entity.data.stationId === stationId;
      kind = 'station';
    } else if (namespace === 'world-site' && parts.length === 2) {
      const worldRecordId = `${parts[1]}/root`;
      predicate = (entity) => entity.type === 'fx'
        && entity.data && entity.data.worldRecordId === worldRecordId;
      kind = 'world-site';
    } else {
      return null;
    }

    const matches = [];
    for (const entity of this.state.entities && this.state.entities.values
      ? this.state.entities.values()
      : []) {
      if (!entity || entity.alive === false || !predicate(entity)
        || !hasExactCeresSectorAuthority(entity)) continue;
      matches.push(entity);
    }
    if (matches.length !== 1) return null;
    return { kind, id: matches[0].id, entity: matches[0] };
  },

  _recordCeresActivityAction(context, actionToken, effectType = null, effectApplied = false) {
    const { receiptId } = context;
    const authority = context.receiptAuthority;
    if (!authority) return false;
    const applied = this.state.traffic.appliedJobActionIds;
    if (!this._causalReservationIsCurrent(
      actionToken,
      '_pendingJobActionIds',
      '_pendingJobActionTokens',
    )) return false;
    if (!applied.includes(receiptId)) applied.push(receiptId);
    if (applied.length > CERES_JOB_ACTION_LEDGER_CAP) {
      applied.splice(0, applied.length - CERES_JOB_ACTION_LEDGER_CAP);
    }
    const receipt = {
      schema: CERES_JOB_ACTION_RECEIPT_SCHEMA,
      receiptId,
      actionId: receiptId,
      sectorId: CERES_ACTIVITY_SECTOR_ID,
      routeId: authority.routeId,
      jobId: authority.jobId,
      jobKind: authority.jobKind,
      action: authority.action,
      sequence: authority.sequence,
      kernelSequence: authority.kernelSequence,
      actorSlotId: authority.actorSlotId,
      actorId: authority.actorId,
      targetRef: authority.targetRef,
      targetKind: authority.targetKind,
      targetId: authority.targetId,
      effectType,
      effectApplied: effectApplied === true,
      simTime: authority.simTime,
    };
    this.bus.emit(CERES_JOB_ACTION_RECEIPT_EVENT, receipt);
    this._releaseCausalReservation(
      actionToken,
      '_pendingJobActionIds',
      '_pendingJobActionTokens',
    );
    return true;
  },

  _applyCeresActivityAction(context, intent) {
    const applied = this.state.traffic.appliedJobActionIds;
    if (applied.includes(context.receiptId) || this._pendingJobActionIds.has(context.receiptId)) return false;
    const actionToken = this._reserveCausalId(
      context.receiptId,
      '_pendingJobActionIds',
      '_pendingJobActionTokens',
    );
    if (!actionToken) return false;
    const causalGuard = () => this._ceresActivityActionStillCurrent(context, intent, actionToken);
    let effectType = null;
    let effectApplied = false;
    try {
      if (context.slot.id === CERES_SEAM_MINER_SLOT_ID && context.action === 'work') {
        effectType = 'mining:npcExtraction';
        effectApplied = this._applyNpcMinerExtraction(
          context,
          intent,
          context.target.entity,
          `npc-miner-work:${context.jobId}:${context.action}:${context.sequence}:${context.targetRef}`,
          { causalGuard },
        );
        if (!effectApplied) throw new Error('ceres_miner_effect_rejected');
      } else if (context.slot.id === CERES_SEAM_MINER_SLOT_ID && context.action === 'unload') {
        const deliveredManifest = context.rec.manifest
          || (context.entity.data && context.entity.data.cargoManifest)
          || null;
        if (!validCausalManifest(deliveredManifest) || deliveredManifest.role !== 'ore_carrier') {
          throw new Error('ceres_ore_barge_manifest_rejected');
        }
        const handoff = this.state.traffic.ceresMinerHaulerHandoff;
        if (handoff && handoff.state !== 'delivered' && handoff.state !== 'interrupted'
          && handoff.minerWorldRecordId === context.worldRecordId
          && handoff.rootLotId === this._ceresHandoffRootLotId(deliveredManifest)) {
          effectType = 'traffic:ceresMinerHaulerHold';
          effectApplied = true;
          this._stampCeresHandoffStatus(context.entity, handoff, 'HOLDING FOR HAULER');
        } else {
          effectType = 'freight:arrival';
          effectApplied = this._emitArrival(context.entity, context.rec, context.target.entity, {
            dockSeq: context.sequence,
            manifest: deliveredManifest,
            ceresAction: true,
            causalGuard,
          });
          if (!effectApplied) throw new Error('ceres_ore_barge_arrival_rejected');
          this._setTrafficManifest(
            context.entity,
            context.rec,
            this._buildMinerManifest(context.entity, context.sequence, null, 0, 'ore_carrier'),
          );
        }
      } else if (context.slot.id === CERES_REFINERY_HAULER_SLOT_ID) {
        const deliveredManifest = context.rec.manifest
          || (context.entity.data && context.entity.data.cargoManifest)
          || null;
        if (!validCausalManifest(deliveredManifest)
          || !deliveredManifest.custody || !deliveredManifest.custody.handoffId) {
          effectType = 'traffic:emptyHauler';
          effectApplied = true;
          context.rec.dockSeq = context.sequence + 1;
          context.entity.data.freightDockSeq = context.rec.dockSeq;
        } else {
          effectType = 'freight:arrival';
          const handoff = this.state.traffic.ceresMinerHaulerHandoff;
          if (!this._ceresHandoffDeliveryIsCurrent(handoff, deliveredManifest)) {
            throw new Error('ceres_handoff_delivery_rejected');
          }
          if (!this._ceresRefinerySettlementInRange(context.entity, context.target.entity)) {
            this._stampCeresHandoffStatus(
              context.entity,
              handoff,
              'REFINERY APPROACH — DOCKING',
              context.target.entity,
            );
            this._recommissionCeresRefineryHauler(context);
            throw new Error('ceres_refinery_out_of_range');
          }
          effectApplied = this._emitArrival(context.entity, context.rec, context.target.entity, {
            dockSeq: context.sequence,
            manifest: deliveredManifest,
            ceresAction: true,
            causalGuard,
          });
          if (!effectApplied || !this._markCeresHandoffDelivered(deliveredManifest, context)) {
            throw new Error('ceres_freight_effect_rejected');
          }
          this._setTrafficManifest(
            context.entity,
            context.rec,
            this._buildMinerManifest(context.entity, context.sequence + 1, null, 0, 'hauler'),
          );
        }
      } else if (context.slot.id === CERES_AMBUSH_HAULER_SLOT_ID) {
        // No freight/economy claim: this receipt-only crossing still advances its durable run token so
        // the next one-shot recommission cannot collide with the prior unload identity.
        context.rec.dockSeq = context.sequence + 1;
        context.entity.data.freightDockSeq = context.rec.dockSeq;
      }
    } catch {
      this._releaseCausalReservation(
        actionToken,
        '_pendingJobActionIds',
        '_pendingJobActionTokens',
      );
      return false;
    }
    const recorded = this._recordCeresActivityAction(context, actionToken, effectType, effectApplied);
    if (!recorded) {
      this._releaseCausalReservation(
        actionToken,
        '_pendingJobActionIds',
        '_pendingJobActionTokens',
      );
    }
    return recorded;
  },

  _jobTrafficContext(intent, expectedRole, acceptedTrafficRoles = expectedRole) {
    if (!intent || intent.kind !== expectedRole) return null;
    const jobId = typeof intent.jobId === 'string' ? intent.jobId : '';
    if (!jobId.startsWith('job:') || jobId.length <= 4) return null;
    const worldRecordId = jobId.slice(4);
    const entity = entityWithWorldRecord(this.state, worldRecordId);
    if (!entity || !entity.data || entity.data.jobId !== jobId) return null;

    this._ensureState();
    const rec = this.state.traffic.freighters.find((candidate) => candidate && candidate.id === entity.id);
    const accepted = Array.isArray(acceptedTrafficRoles)
      ? acceptedTrafficRoles
      : [acceptedTrafficRoles];
    if (!rec || !accepted.includes(rec.role)) return null;
    return { jobId, worldRecordId, entity, rec };
  },

  _buildMinerManifest(entity, workSeq, commodityId, qty, role = 'miner', lotSource = null) {
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const freighterKey = entity && entity.data && entity.data.worldRecordId
      || entity && entity.id
      || 'npc-miner';
    const amount = Math.max(0, Math.floor(Number(qty) || 0));
    const manifest = buildCargoManifest({
      seed,
      freighterKey: `${freighterKey}:work:${Math.max(0, workSeq | 0)}`,
      role,
      marketKeys: commodityId ? [commodityId] : FREIGHT_MARKET_KEYS_FALLBACK,
      capacity: amount,
    });
    if (amount > 0 && commodityId) {
      manifest.lines = [{ commodityId, qty: amount }];
      manifest.totalQty = amount;
    }
    if (role === 'ore_carrier' && amount > 0 && commodityId) {
      manifest.lotId = manifest.manifestId;
      manifest.lotSource = lotSource ? { ...lotSource } : null;
      manifest.custody = {
        holderKind: 'traffic',
        holderId: String(freighterKey),
        acquiredBy: 'mining:npcExtraction',
      };
    }
    return manifest;
  },

  _setTrafficManifest(entity, rec, manifest) {
    if (!manifest) return false;
    if (rec) rec.manifest = manifest;
    if (entity && entity.data) entity.data.cargoManifest = manifest;
    return true;
  },

  // PQ-048.03 — one exact Ceres custody relay. The durable record deliberately keeps only stable
  // world-record identities and JSON cargo facts; numeric entity ids are re-resolved every tick.
  _ceresHandoffRootLotId(manifest) {
    const source = manifest && manifest.lotSource;
    return source && typeof source.rootLotId === 'string' && source.rootLotId
      || manifest && manifest.lotId
      || manifest && manifest.manifestId
      || null;
  },

  _ceresHandoffActor(handoff, role) {
    const worldRecordId = role === 'miner'
      ? handoff && handoff.minerWorldRecordId
      : handoff && handoff.haulerWorldRecordId;
    const expectedSlot = role === 'miner'
      ? CERES_SEAM_MINER_SLOT_ID
      : CERES_REFINERY_HAULER_SLOT_ID;
    if (typeof worldRecordId !== 'string' || !worldRecordId) return null;
    const entity = entityWithWorldRecord(this.state, worldRecordId);
    if (!entity || entity.alive === false || !entity.data
      || entity.data.activityActorSlotId !== expectedSlot) return null;
    const rec = (this.state.traffic.freighters || []).find((candidate) => candidate
      && (candidate.worldRecordId === worldRecordId || candidate.id === entity.id)
      && candidate.activityActorSlotId === expectedSlot);
    return rec ? { entity, rec, worldRecordId } : null;
  },

  _stampCeresHandoffStatus(entity, handoff, status, target = null) {
    if (!entity || !entity.data || !handoff) return;
    const data = entity.data;
    data.ceresHandoffId = handoff.handoffId;
    data.ceresHandoffState = handoff.state;
    data.ceresHandoffStatus = String(status || 'RENDEZVOUS');
    const targetWorldRecordId = target && target.data && target.data.worldRecordId || null;
    if (target && target.id != null) data.ceresHandoffTargetId = target.id;
    else delete data.ceresHandoffTargetId;
    if (targetWorldRecordId) data.ceresHandoffTargetWorldRecordId = targetWorldRecordId;
    else delete data.ceresHandoffTargetWorldRecordId;
  },

  _requestCeresMinerHaulerHandoff(context, manifest) {
    if (!context || !context.entity || !context.rec || !context.slot
      || context.slot.id !== CERES_SEAM_MINER_SLOT_ID
      || !validCausalManifest(manifest) || manifest.role !== 'ore_carrier') return null;
    const minerWorldRecordId = context.worldRecordId || context.entity.data && context.entity.data.worldRecordId;
    const lotId = manifest.lotId || manifest.manifestId;
    if (typeof minerWorldRecordId !== 'string' || !minerWorldRecordId
      || typeof lotId !== 'string' || !lotId) return null;
    this._ensureState();
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const haulerWorldRecordId = stableRecordId(
      seed,
      CERES_ACTIVITY_SECTOR_ID,
      RECORD_KIND.CONVOY,
      'ceres:activity:ceres_refinery_hauler',
    );
    const handoffId = `ceres-miner-hauler:${minerWorldRecordId}:${lotId}`;
    const current = this.state.traffic.ceresMinerHaulerHandoff;
    if (current && current.state !== 'delivered' && current.state !== 'interrupted') {
      return current.handoffId === handoffId ? current : null;
    }
    const qty = manifest.totalQty;
    const handoff = {
      schema: CERES_MINER_HAULER_HANDOFF_SCHEMA,
      handoffId,
      rootLotId: this._ceresHandoffRootLotId(manifest),
      minerWorldRecordId,
      haulerWorldRecordId,
      state: 'requested',
      requestedAtSimT: Number.isFinite(this.state.simTime) ? this.state.simTime : 0,
      requestedQty: qty,
      transferredQty: 0,
      deliveredQty: 0,
      remainingQty: qty,
      terminalizedQty: 0,
      transferSeq: 0,
      deliveredTransferSeq: 0,
    };
    this.state.traffic.ceresMinerHaulerHandoff = handoff;
    const hauler = this._ceresHandoffActor(handoff, 'hauler');
    this._stampCeresHandoffStatus(context.entity, handoff, 'HAULER REQUESTED', hauler && hauler.entity);
    if (hauler) this._stampCeresHandoffStatus(hauler.entity, handoff, 'MINER ORE REQUEST', context.entity);
    return handoff;
  },

  _ceresHandoffClaimId(handoff, role) {
    return `ceres-handoff:${handoff.handoffId}:${role}`;
  },

  _claimCeresMinerHaulerHandoffControl(handoff, pair, role) {
    if (!handoff || !pair || !pair.entity || !pair.entity.data) return false;
    const jobId = pair.entity.data.jobId;
    const claimId = this._ceresHandoffClaimId(handoff, role);
    const jobs = this.helpers && this.helpers.npcJobs;
    if (!jobs || typeof jobs.claimControl !== 'function' || typeof jobId !== 'string') return false;
    const result = jobs.claimControl(jobId, { claimId, holder: 'traffic:ceresMinerHaulerHandoff' });
    return !!(result && result.granted === true);
  },

  _releaseCeresMinerHaulerHandoffControl(handoff, role) {
    if (!handoff) return;
    const worldRecordId = role === 'miner' ? handoff.minerWorldRecordId : handoff.haulerWorldRecordId;
    if (typeof worldRecordId !== 'string' || !worldRecordId) return;
    const jobId = `job:${worldRecordId}`;
    const claimId = this._ceresHandoffClaimId(handoff, role);
    const jobs = this.helpers && this.helpers.npcJobs;
    if (jobs && typeof jobs.releaseControl === 'function') jobs.releaseControl(jobId, claimId);
  },

  _releaseCeresMinerHaulerHandoffControls(handoff) {
    this._releaseCeresMinerHaulerHandoffControl(handoff, 'miner');
    this._releaseCeresMinerHaulerHandoffControl(handoff, 'hauler');
  },

  _ceresHandoffCapacity(pair) {
    const configured = pair && pair.entity && pair.entity.data && pair.entity.data.ceresHandoffCapacityU;
    const recordCapacity = pair && pair.rec && pair.rec.ceresHandoffCapacityU;
    const value = Number.isFinite(configured) ? configured : recordCapacity;
    return Number.isFinite(value)
      ? Math.max(0, Math.floor(value))
      : CERES_REFINERY_HAULER_CAPACITY_U;
  },

  _ceresRefinerySettlementInRange(entity, station) {
    if (!entity || !entity.pos || !station || !station.pos) return false;
    const dx = station.pos.x - entity.pos.x;
    const dz = station.pos.z - entity.pos.z;
    const distance = Math.hypot(dx, dz);
    const dockRange = Math.max(
      DOCK_RANGE,
      CERES_MINER_HAULER_HANDOFF_RANGE_WU,
      Number.isFinite(station.data && station.data.dockRadius) ? station.data.dockRadius : 0,
      (Number.isFinite(entity.radius) ? entity.radius : 0)
        + (Number.isFinite(station.radius) ? station.radius : 0) + 12,
    ) + 6;
    return Number.isFinite(distance) && distance <= dockRange;
  },

  _splitCeresHandoffManifest(manifest, transferQty) {
    const requested = Math.max(0, Math.floor(Number(transferQty) || 0));
    let remaining = requested;
    const movedLines = [];
    const remainderLines = [];
    for (const line of manifest.lines) {
      const take = Math.min(line.qty, remaining);
      if (take > 0) movedLines.push({ commodityId: line.commodityId, qty: take });
      const left = line.qty - take;
      if (left > 0) remainderLines.push({ commodityId: line.commodityId, qty: left });
      remaining -= take;
    }
    const movedQty = movedLines.reduce((sum, line) => sum + line.qty, 0);
    const remainderQty = remainderLines.reduce((sum, line) => sum + line.qty, 0);
    return { movedLines, movedQty, remainderLines, remainderQty };
  },

  _markCeresHandoffCausalTransfer(handoff) {
    const chain = this._ceresCausal;
    if (!chain || !chain.seeds) return;
    chain.seeds.ore_handoff = true;
    chain.seeds.hauler_ore_manifest = true;
  },

  _transferCeresMinerHaulerHandoff(handoff, minerPair, haulerPair, distance) {
    const source = minerPair.entity.data && minerPair.entity.data.cargoManifest || minerPair.rec.manifest;
    if (!validCausalManifest(source) || source.role !== 'ore_carrier'
      || this._ceresHandoffRootLotId(source) !== handoff.rootLotId) return false;
    const held = haulerPair.entity.data && haulerPair.entity.data.cargoManifest || haulerPair.rec.manifest;
    if (validCausalManifest(held)) return false;
    const capacity = this._ceresHandoffCapacity(haulerPair);
    const transferQty = Math.min(source.totalQty, capacity);
    if (transferQty <= 0) {
      this._stampCeresHandoffStatus(minerPair.entity, handoff, 'HAULER HOLD FULL', haulerPair.entity);
      this._stampCeresHandoffStatus(haulerPair.entity, handoff, 'NO FREE ORE CAPACITY', minerPair.entity);
      return false;
    }
    const split = this._splitCeresHandoffManifest(source, transferQty);
    if (split.movedQty !== transferQty || split.remainderQty + split.movedQty !== source.totalQty) return false;
    const transferSeq = (handoff.transferSeq | 0) + 1;
    const wholeLot = split.movedQty === source.totalQty;
    const lotSource = source.lotSource && typeof source.lotSource === 'object' ? source.lotSource : {};
    const transferred = {
      ...source,
      manifestId: wholeLot ? source.manifestId : `${source.manifestId}:handoff:${transferSeq}`,
      freighterKey: handoff.haulerWorldRecordId,
      role: 'hauler',
      lines: split.movedLines,
      totalQty: split.movedQty,
      lotId: wholeLot ? source.lotId : `${source.lotId}:handoff:${transferSeq}`,
      lotSource: { ...lotSource, rootLotId: handoff.rootLotId, handoffId: handoff.handoffId, transferSeq },
      custody: {
        holderKind: 'traffic', holderId: handoff.haulerWorldRecordId,
        acquiredBy: 'traffic:ceresMinerHaulerHandoff', handoffId: handoff.handoffId,
        transferSeq, rootLotId: handoff.rootLotId,
      },
    };
    if (!this._setTrafficManifest(haulerPair.entity, haulerPair.rec, transferred)) return false;
    handoff.transferSeq = transferSeq;
    handoff.transferredQty += split.movedQty;
    handoff.remainingQty = split.remainderQty;
    handoff.transferredAtSimT = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    handoff.lastTransferDistanceWU = Math.round(distance * 1000) / 1000;
    this._markCeresHandoffCausalTransfer(handoff);
    this._releaseCeresMinerHaulerHandoffControl(handoff, 'hauler');
    if (split.remainderQty > 0) {
      handoff.state = 'in_transit';
      const remainder = {
        ...source,
        lines: split.remainderLines,
        totalQty: split.remainderQty,
        lotSource: { ...lotSource, rootLotId: handoff.rootLotId, handoffId: handoff.handoffId },
        custody: {
          ...(source.custody && typeof source.custody === 'object' ? source.custody : {}),
          holderKind: 'traffic', holderId: handoff.minerWorldRecordId, acquiredBy: 'mining:npcExtraction',
        },
      };
      this._setTrafficManifest(minerPair.entity, minerPair.rec, remainder);
      this._stampCeresHandoffStatus(minerPair.entity, handoff, 'HOLDING REMAINDER', haulerPair.entity);
    } else {
      handoff.state = 'in_transit';
      handoff.resumedAtSimT = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
      this._setTrafficManifest(
        minerPair.entity,
        minerPair.rec,
        this._buildMinerManifest(minerPair.entity, handoff.transferSeq, null, 0, 'ore_carrier'),
      );
      this._releaseCeresMinerHaulerHandoffControl(handoff, 'miner');
      this._stampCeresHandoffStatus(minerPair.entity, handoff, 'SEAM WORK RESUMED');
    }
    const recommissioned = this._recommissionCeresRefineryHauler(haulerPair);
    this._stampCeresHandoffStatus(
      haulerPair.entity,
      handoff,
      recommissioned ? 'ORE TRANSFERRED — REFINERY BOUND' : 'REFINERY ROUTE PENDING',
    );
    return true;
  },

  _markCeresHandoffDelivered(manifest, context) {
    const handoff = this.state.traffic.ceresMinerHaulerHandoff;
    if (!this._ceresHandoffDeliveryIsCurrent(handoff, manifest)) return false;
    const transferSeq = manifest.custody.transferSeq | 0;
    handoff.deliveredTransferSeq = transferSeq;
    handoff.deliveredQty = Math.min(handoff.requestedQty, handoff.deliveredQty + manifest.totalQty);
    handoff.lastSinkReceiptId = context.receiptId;
    handoff.deliveredAtSimT = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    const miner = this._ceresHandoffActor(handoff, 'miner');
    if (handoff.remainingQty <= 0
      && handoff.deliveredQty + (handoff.terminalizedQty | 0) >= handoff.requestedQty) {
      handoff.state = 'delivered';
      this._releaseCeresMinerHaulerHandoffControl(handoff, 'miner');
      if (miner) this._stampCeresHandoffStatus(miner.entity, handoff, 'ORE HANDOFF COMPLETE');
    } else {
      handoff.state = 'requested';
      if (miner) this._stampCeresHandoffStatus(miner.entity, handoff, 'HAULER RETURNING');
    }
    this._stampCeresHandoffStatus(context.entity, handoff, 'ORE DELIVERED');
    return true;
  },

  _ceresHandoffDeliveryIsCurrent(handoff, manifest) {
    const custody = manifest && manifest.custody;
    const transferSeq = custody ? (custody.transferSeq | 0) : 0;
    const outstandingQty = handoff && handoff.transferredQty - handoff.deliveredQty;
    return !!(handoff && custody && handoff.state !== 'interrupted' && handoff.state !== 'delivered'
      && custody.handoffId === handoff.handoffId
      && transferSeq > (handoff.deliveredTransferSeq | 0)
      && transferSeq === (handoff.transferSeq | 0)
      && Number.isSafeInteger(manifest.totalQty) && manifest.totalQty > 0
      && manifest.totalQty === outstandingQty);
  },

  _interruptCeresMinerHaulerHandoff(handoff, reason, entity = null) {
    if (!handoff || handoff.state === 'interrupted' || handoff.state === 'delivered') return false;
    handoff.state = 'interrupted';
    handoff.interruptedAtSimT = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    handoff.interruption = String(reason || 'interrupted');
    this._releaseCeresMinerHaulerHandoffControls(handoff);
    const miner = this._ceresHandoffActor(handoff, 'miner');
    const hauler = this._ceresHandoffActor(handoff, 'hauler');
    if (miner) this._stampCeresHandoffStatus(miner.entity, handoff, 'HANDOFF INTERRUPTED', hauler && hauler.entity);
    if (hauler) this._stampCeresHandoffStatus(hauler.entity, handoff, 'HANDOFF INTERRUPTED', miner && miner.entity);
    if (entity && entity.data) this._stampCeresHandoffStatus(entity, handoff, 'HANDOFF INTERRUPTED');
    if (this._ceresCausal && this._ceresCausal.seeds) {
      this._ceresCausal.seeds.aftermath_open = true;
    }
    return true;
  },

  _preserveCeresHandoffAfterMinerLoss(handoff) {
    if (!handoff || handoff.state !== 'in_transit') return false;
    const hauler = this._ceresHandoffActor(handoff, 'hauler');
    const manifest = hauler && (hauler.entity.data && hauler.entity.data.cargoManifest
      || hauler.rec.manifest);
    if (!hauler || !this._ceresHandoffDeliveryIsCurrent(handoff, manifest)) return false;
    handoff.terminalizedQty = (handoff.terminalizedQty | 0) + handoff.remainingQty;
    handoff.remainingQty = 0;
    handoff.interruption = 'miner_destroyed_after_transfer';
    handoff.interruptedAtSimT = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    this._releaseCeresMinerHaulerHandoffControl(handoff, 'miner');
    this._stampCeresHandoffStatus(hauler.entity, handoff, 'ORE IN TRANSIT — MINER LOST');
    return true;
  },

  _rehydrateCeresCausalHandoffSeeds() {
    const chain = this._ceresCausal;
    const handoff = this.state && this.state.traffic && this.state.traffic.ceresMinerHaulerHandoff;
    if (!chain || !chain.seeds || !handoff || handoff.state === 'interrupted') return;
    if (handoff.state !== 'delivered') chain.seeds.miner_loaded = true;
    if (handoff.transferSeq > 0) {
      chain.seeds.ore_handoff = true;
      chain.seeds.hauler_ore_manifest = true;
    }
  },

  _ceresHandoffTransferWindow() {
    const chain = this._ceresCausal;
    if (!chain) return true;
    const live = (chain.active || []).find((candidate) => candidate
      && candidate.eventId === 'ev_miner_calls_hauler');
    if (live) return live.phase === 'transfer' || live.phase === 'split';
    return Array.isArray(chain.completed) && chain.completed.includes('ev_miner_calls_hauler');
  },

  _stepCeresMinerHaulerHandoffs(dt) {
    this._ensureState();
    const handoff = this.state.traffic.ceresMinerHaulerHandoff;
    if (!handoff || handoff.schema !== CERES_MINER_HAULER_HANDOFF_SCHEMA
      || handoff.state === 'delivered' || handoff.state === 'interrupted'
      || this.state.world && this.state.world.currentSectorId !== CERES_ACTIVITY_SECTOR_ID) return;
    const records = this.state.world && this.state.world.records && this.state.world.records.byId;
    const minerRecord = records && records[handoff.minerWorldRecordId];
    const haulerRecord = records && records[handoff.haulerWorldRecordId];
    const miner = this._ceresHandoffActor(handoff, 'miner');
    const hauler = this._ceresHandoffActor(handoff, 'hauler');
    if (terminalWorldRecord(haulerRecord)) {
      this._interruptCeresMinerHaulerHandoff(handoff, 'participant_destroyed');
      return;
    }
    if (terminalWorldRecord(minerRecord)
      && !this._preserveCeresHandoffAfterMinerLoss(handoff)) {
      this._interruptCeresMinerHaulerHandoff(handoff, 'participant_destroyed');
      return;
    }
    if (!miner || !hauler) {
      this._releaseCeresMinerHaulerHandoffControls(handoff);
      return; // world-record identities let a later materialization resume this exact handoff.
    }
    const held = hauler.entity.data && hauler.entity.data.cargoManifest || hauler.rec.manifest;
    if (handoff.state === 'in_transit') {
      if (!validCausalManifest(held) || !held.custody || held.custody.handoffId !== handoff.handoffId) {
        this._interruptCeresMinerHaulerHandoff(handoff, 'transferred_manifest_missing', hauler.entity);
      } else {
        this._stampCeresHandoffStatus(hauler.entity, handoff, 'ORE TRANSFERRED — REFINERY BOUND');
      }
      return;
    }
    const source = miner.entity.data && miner.entity.data.cargoManifest || miner.rec.manifest;
    if (!validCausalManifest(source) || source.role !== 'ore_carrier'
      || this._ceresHandoffRootLotId(source) !== handoff.rootLotId) {
      this._interruptCeresMinerHaulerHandoff(handoff, 'source_manifest_missing', miner.entity);
      return;
    }
    if (validCausalManifest(held)) {
      this._stampCeresHandoffStatus(miner.entity, handoff, 'HAULER HOLD BUSY', hauler.entity);
      this._stampCeresHandoffStatus(hauler.entity, handoff, 'ORE TRANSFERRED — REFINERY BOUND', miner.entity);
      return;
    }
    const minerClaimed = this._claimCeresMinerHaulerHandoffControl(handoff, miner, 'miner');
    const haulerClaimed = this._claimCeresMinerHaulerHandoffControl(handoff, hauler, 'hauler');
    if (!minerClaimed || !haulerClaimed) {
      if (minerClaimed) this._releaseCeresMinerHaulerHandoffControl(handoff, 'miner');
      if (haulerClaimed) this._releaseCeresMinerHaulerHandoffControl(handoff, 'hauler');
      this._stampCeresHandoffStatus(miner.entity, handoff, 'HAULER REQUESTED', hauler.entity);
      this._stampCeresHandoffStatus(hauler.entity, handoff, 'RENDEZVOUS PENDING', miner.entity);
      return;
    }
    const dx = miner.entity.pos.x - hauler.entity.pos.x;
    const dz = miner.entity.pos.z - hauler.entity.pos.z;
    const distance = Math.hypot(dx, dz);
    const aim = Number.isFinite(distance) && distance > 0.0001 ? Math.atan2(dz, dx) : hauler.entity.rot || 0;
    setIntent(miner.entity, 0, 0, false, false, null, miner.entity.rot || 0);
    if (!Number.isFinite(distance) || distance > CERES_MINER_HAULER_HANDOFF_RANGE_WU) {
      handoff.state = 'rendezvous';
      setIntent(hauler.entity, 0, 1, false, false, null, aim);
      this._stampCeresHandoffStatus(miner.entity, handoff, 'HOLDING FOR HAULER', hauler.entity);
      this._stampCeresHandoffStatus(hauler.entity, handoff, 'RENDEZVOUS INBOUND', miner.entity);
      return;
    }
    setIntent(hauler.entity, 0, 0, false, false, null, aim);
    this._stampCeresHandoffStatus(miner.entity, handoff,
      this._ceresHandoffTransferWindow() ? 'TRANSFER WINDOW OPEN' : 'TRANSFER WINDOW PENDING', hauler.entity);
    this._stampCeresHandoffStatus(hauler.entity, handoff,
      this._ceresHandoffTransferWindow() ? 'TRANSFER WINDOW OPEN' : 'TRANSFER WINDOW PENDING', miner.entity);
    if (this._ceresHandoffTransferWindow()) this._transferCeresMinerHaulerHandoff(handoff, miner, hauler, distance);
    void dt;
  },

  // ── PQ-048.04 tender service occupation ──────────────────────────────────────────────────────
  // The tender and miner keep their own owner-authored jobs. Traffic borrows both hulls only for
  // this bounded incident, writes ordinary flight intent while it holds the leases, and returns
  // them through npcJobsRuntime after combat truth says the drive is back.

  _resetCeresTenderServiceRuntime() {
    this._ceresTenderServiceImpairmentActor = null;
    this._ceresTenderServiceRepairActor = null;
  },

  _hasActiveCeresTenderServiceLink() {
    const active = this._ceresCausal && this._ceresCausal.active;
    return Array.isArray(active) && active.some((live) => live
      && live.eventId === 'ev_tender_services_miner');
  },

  _activeCeresTenderServiceIncident() {
    this._ensureState();
    const incident = this.state.traffic.ceresTenderServiceIncident;
    return incident && !CERES_TENDER_SERVICE_TERMINAL_STATES.has(incident.state) ? incident : null;
  },

  _ceresTenderServiceActor(incident, role) {
    if (!incident || (role !== 'tender' && role !== 'miner')) return null;
    const worldRecordId = role === 'tender'
      ? incident.tenderWorldRecordId
      : incident.minerWorldRecordId;
    const expectedSlotId = role === 'tender' ? CERES_TENDER_SLOT_ID : CERES_SEAM_MINER_SLOT_ID;
    const entity = entityWithWorldRecord(this.state, worldRecordId);
    if (!entity || entity.alive === false || entity.type !== 'ship' || !entity.data
      || entity.data.worldRecordId !== worldRecordId
      || entity.data.activityActorSlotId !== expectedSlotId
      || entity.data.jobId !== `job:${worldRecordId}`
      || !entity.pos || !Number.isFinite(entity.pos.x) || !Number.isFinite(entity.pos.z)) return null;
    if (role === 'tender') {
      const presence = entity.data.factionPresence;
      if (entity.data.durable !== true || !presence || presence.yardTender !== true
        || entity.data.ceresActivityCast !== undefined || entity.data.ceresActivityJobOwned !== undefined) return null;
      return { entity, rec: null, jobId: entity.data.jobId, worldRecordId };
    }
    const rec = (this.state.traffic.freighters || []).find((candidate) => candidate
      && candidate.activityActorSlotId === CERES_SEAM_MINER_SLOT_ID
      && (candidate.worldRecordId === worldRecordId || candidate.id === entity.id));
    if (!rec || entity.data.ceresActivityCast !== true || entity.data.ceresActivityJobOwned !== true) return null;
    return { entity, rec, jobId: entity.data.jobId, worldRecordId };
  },

  _beginCeresTenderServiceIncident() {
    this._ensureState();
    const current = this._activeCeresTenderServiceIncident();
    if (current) return current;
    const tenderBound = this._ceresCausalActorBySlot(CERES_TENDER_SLOT_ID);
    const tender = tenderBound && tenderBound.entity;
    const minerBound = this._ceresCausalActorBySlot(CERES_SEAM_MINER_SLOT_ID);
    const miner = minerBound && minerBound.entity;
    const tenderWorldRecordId = tender && tender.data && tender.data.worldRecordId;
    const minerWorldRecordId = miner && miner.data && miner.data.worldRecordId;
    if (typeof tenderWorldRecordId !== 'string' || !tenderWorldRecordId
      || typeof minerWorldRecordId !== 'string' || !minerWorldRecordId
      || tenderWorldRecordId === minerWorldRecordId) return null;
    const currentSequence = this.state.traffic.ceresTenderServiceSequence;
    if (!Number.isSafeInteger(currentSequence) || currentSequence < 0
      || currentSequence >= Number.MAX_SAFE_INTEGER) return null;
    const sequence = currentSequence + 1;
    const incident = {
      schema: CERES_TENDER_SERVICE_INCIDENT_SCHEMA,
      incidentId: `ceres-tender-service:${tenderWorldRecordId}:${minerWorldRecordId}:${sequence}`,
      sequence,
      tenderWorldRecordId,
      minerWorldRecordId,
      state: 'impair',
      startedAtSimT: Number.isFinite(this.state.simTime) ? this.state.simTime : 0,
      holdStartedAtSimT: null,
      terminalAtSimT: null,
      failureReason: null,
    };
    // Verify both exact owner contracts before publishing an incident. A same-looking foreign hull
    // must never be adopted into this closed pair merely because its numeric id is nearby.
    if (!this._ceresTenderServiceActor(incident, 'tender')
      || !this._ceresTenderServiceActor(incident, 'miner')) return null;
    this.state.traffic.ceresTenderServiceSequence = sequence;
    this.state.traffic.ceresTenderServiceIncident = incident;
    return incident;
  },

  _ceresTenderServiceClaimId(incident, role) {
    return `ceres-tender-service:${incident.incidentId}:${role}`;
  },

  _claimCeresTenderServiceControl(incident, pair, role) {
    if (!incident || !pair || !pair.entity || !pair.jobId) return false;
    const jobs = this.helpers && this.helpers.npcJobs;
    if (!jobs || typeof jobs.claimControl !== 'function') return false;
    const result = jobs.claimControl(pair.jobId, {
      claimId: this._ceresTenderServiceClaimId(incident, role),
      holder: 'traffic:ceresTenderService',
    });
    return !!(result && result.granted === true);
  },

  _releaseCeresTenderServiceControl(incident, role) {
    if (!incident || (role !== 'tender' && role !== 'miner')) return;
    const worldRecordId = role === 'tender' ? incident.tenderWorldRecordId : incident.minerWorldRecordId;
    const jobs = this.helpers && this.helpers.npcJobs;
    if (jobs && typeof jobs.releaseControl === 'function') {
      jobs.releaseControl(`job:${worldRecordId}`, this._ceresTenderServiceClaimId(incident, role));
    }
  },

  _releaseCeresTenderServiceControls(incident) {
    this._releaseCeresTenderServiceControl(incident, 'miner');
    this._releaseCeresTenderServiceControl(incident, 'tender');
  },

  _ceresTenderServiceCombatKernel() {
    const combat = this._registry && typeof this._registry.get === 'function'
      ? this._registry.get('combat')
      : null;
    if (!combat) return null;
    return typeof combat.ensureKernel === 'function' ? combat.ensureKernel() : combat.kernel || null;
  },

  _ceresTenderServiceDriveDisabled(entity) {
    const combat = this.state && this.state.combat;
    const runtime = combat && combat.entities && combat.entities[String(entity && entity.id)];
    const drive = runtime && runtime.subsystems && runtime.subsystems.subsystem_drive;
    return !!(drive && (drive.destroyed === true || drive.effectiveDisabled === true));
  },

  _ceresTenderServiceDriveRuntime(entity, kernel = null) {
    const combat = this.state && this.state.combat;
    const runtime = combat && combat.entities && combat.entities[String(entity && entity.id)];
    const liveDrive = runtime && runtime.subsystems && runtime.subsystems.subsystem_drive;
    if (liveDrive) return liveDrive;
    // The kernel owns initialization. Asking its existing inspector for the component is the
    // narrowest way to obtain the live health before a first impairment, without inventing traffic
    // combat state or assuming a numeric entity id survives Continue.
    if (!kernel || typeof kernel.inspect !== 'function' || !entity) return null;
    const inspection = kernel.inspect({ entityId: entity.id });
    return inspection && inspection.entity && inspection.entity.combat
      && inspection.entity.combat.subsystems
      && inspection.entity.combat.subsystems.subsystem_drive || null;
  },

  _requestCeresTenderServiceImpairment(incident, miner) {
    const alreadyRequested = this._ceresTenderServiceImpairmentActor
      && this._ceresTenderServiceImpairmentActor.incidentId === incident.incidentId
      && this._ceresTenderServiceImpairmentActor.entity === miner;
    if (alreadyRequested) return true;
    const kernel = this._ceresTenderServiceCombatKernel();
    if (!kernel || typeof kernel.routeDamage !== 'function') return false;
    const drive = this._ceresTenderServiceDriveRuntime(miner, kernel);
    if (!drive || !Number.isFinite(drive.health) || drive.health < 0) return false;
    if (drive.health <= 0) {
      // A save can land between routeDamage and combat's next prePhysics transition. Do not inject
      // a second packet into that already-zero component; wait for combat to make it truly disabled.
      if (drive.pendingTransition && drive.pendingTransition.destroyed === true) {
        this._ceresTenderServiceImpairmentActor = { incidentId: incident.incidentId, entity: miner };
        return true;
      }
      return false;
    }
    const hullBefore = Number(miner.hull);
    if (!Number.isFinite(hullBefore)) return false;
    const ionDamage = CERES_TENDER_SERVICE_DRIVE_ARMOR_FLAT
      + drive.health / CERES_TENDER_SERVICE_DRIVE_ION_MULTIPLIER;
    if (!Number.isFinite(ionDamage) || ionDamage <= 0) return false;
    const result = kernel.routeDamage({
      attackerId: null,
      targetId: miner.id,
      packet: {
        channels: { ion: ionDamage },
        penetration: 0,
        shieldBypass: 1,
        subsystemShare: 1,
        hit: { subsystemId: 'subsystem_drive' },
        source: { kind: 'traffic_service', id: incident.incidentId },
      },
      origin: { kind: 'traffic_service', id: incident.incidentId },
    });
    if (!result || result.ok !== true || result.hullDamage !== 0 || result.attackerId !== null
      || miner.hull !== hullBefore) return false;
    this._ceresTenderServiceImpairmentActor = { incidentId: incident.incidentId, entity: miner };
    return true;
  },

  _requestCeresTenderServiceRepair(incident, miner) {
    const alreadyRequested = this._ceresTenderServiceRepairActor
      && this._ceresTenderServiceRepairActor.incidentId === incident.incidentId
      && this._ceresTenderServiceRepairActor.entity === miner;
    if (alreadyRequested) return true;
    const kernel = this._ceresTenderServiceCombatKernel();
    if (!kernel || typeof kernel.repair !== 'function') return false;
    const result = kernel.repair(
      miner.id,
      'subsystem_drive',
      CERES_TENDER_SERVICE_REPAIR_AMOUNT,
      'traffic_tender_service',
    );
    if (!result || result.ok !== true) return false;
    this._ceresTenderServiceRepairActor = { incidentId: incident.incidentId, entity: miner };
    return true;
  },

  _ceresTenderServiceStandoff(tender, miner) {
    const tenderRadius = Number.isFinite(tender && tender.radius) ? Math.max(0, tender.radius) : 0;
    const minerRadius = Number.isFinite(miner && miner.radius) ? Math.max(0, miner.radius) : 0;
    return Math.max(CERES_TENDER_SERVICE_STANDOFF_WU,
      tenderRadius + minerRadius + CERES_TENDER_SERVICE_CLEARANCE_WU);
  },

  _driveCeresTenderServiceStandoff(incident, tender, miner) {
    const dx = tender.pos.x - miner.pos.x;
    const dz = tender.pos.z - miner.pos.z;
    const currentDistance = Math.hypot(dx, dz);
    if (!Number.isFinite(currentDistance)) return { ok: false, holding: false };
    let nx = currentDistance > 0.0001 ? dx / currentDistance : 0;
    let nz = currentDistance > 0.0001 ? dz / currentDistance : 0;
    if (currentDistance <= 0.0001) {
      const seed = (this.state.meta && this.state.meta.seed) || 1;
      const angle = (hash32(seed, incident.incidentId) % 6284) / 1000;
      nx = Math.cos(angle);
      nz = Math.sin(angle);
    }
    const standoff = this._ceresTenderServiceStandoff(tender, miner);
    const targetX = miner.pos.x + nx * standoff;
    const targetZ = miner.pos.z + nz * standoff;
    const targetDx = targetX - tender.pos.x;
    const targetDz = targetZ - tender.pos.z;
    const targetDistance = Math.hypot(targetDx, targetDz);
    const aim = targetDistance > 0.0001 ? Math.atan2(targetDz, targetDx) : tender.rot || 0;
    if (!Number.isFinite(targetDistance)) return { ok: false, holding: false };
    if (targetDistance <= 3) {
      setIntent(tender, 0, 0, false, false, null, aim);
      tender.data.intent.brake = true;
      setIntent(miner, 0, 0, false, false, null, miner.rot || 0);
      miner.data.intent.brake = true;
      return { ok: true, holding: true, standoff, distance: currentDistance };
    }
    setIntent(tender, 0, 1, false, false, null, aim);
    tender.data.intent.brake = false;
    setIntent(miner, 0, 0, false, false, null, miner.rot || 0);
    miner.data.intent.brake = true;
    return { ok: true, holding: false, standoff, distance: currentDistance };
  },

  _failCeresTenderServiceIncident(incident, reason) {
    if (!incident || CERES_TENDER_SERVICE_TERMINAL_STATES.has(incident.state)) return false;
    incident.state = 'failed';
    incident.failureReason = String(reason || 'service_failed');
    incident.terminalAtSimT = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    incident.holdStartedAtSimT = null;
    this._releaseCeresTenderServiceControls(incident);
    this._resetCeresTenderServiceRuntime();
    return true;
  },

  _completeCeresTenderServiceIncident(incident) {
    if (!incident || CERES_TENDER_SERVICE_TERMINAL_STATES.has(incident.state)) return false;
    incident.state = 'succeeded';
    incident.failureReason = null;
    incident.terminalAtSimT = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    this._releaseCeresTenderServiceControls(incident);
    this._resetCeresTenderServiceRuntime();
    return true;
  },

  _stepCeresTenderServiceIncident(dt) {
    const incident = this._activeCeresTenderServiceIncident();
    if (!incident || this.state.world && this.state.world.currentSectorId !== CERES_ACTIVITY_SECTOR_ID) return incident;
    const tender = this._ceresTenderServiceActor(incident, 'tender');
    const miner = this._ceresTenderServiceActor(incident, 'miner');
    if (!tender || !miner) {
      this._failCeresTenderServiceIncident(incident, 'actor_absent');
      return incident;
    }
    const driveDisabled = this._ceresTenderServiceDriveDisabled(miner.entity);
    if (incident.state === 'repair' && !driveDisabled) {
      this._completeCeresTenderServiceIncident(incident);
      return incident;
    }
    if (!driveDisabled) {
      // A rematerialized actor can have a fresh combat runtime even while the compact incident is
      // still active. Reapply the exact non-lethal drive impairment to that new body only.
      this._releaseCeresTenderServiceControls(incident);
      incident.state = 'impair';
      incident.holdStartedAtSimT = null;
      this._ceresTenderServiceRepairActor = null;
      if (!this._requestCeresTenderServiceImpairment(incident, miner.entity)) {
        this._failCeresTenderServiceIncident(incident, 'drive_impairment_refused');
      }
      return incident;
    }
    const minerClaimed = this._claimCeresTenderServiceControl(incident, miner, 'miner');
    const tenderClaimed = this._claimCeresTenderServiceControl(incident, tender, 'tender');
    if (!minerClaimed || !tenderClaimed) {
      if (minerClaimed) this._releaseCeresTenderServiceControl(incident, 'miner');
      if (tenderClaimed) this._releaseCeresTenderServiceControl(incident, 'tender');
      this._failCeresTenderServiceIncident(incident, 'job_control_refused');
      return incident;
    }
    if (incident.state === 'impair') incident.state = 'approach';
    const motion = this._driveCeresTenderServiceStandoff(incident, tender.entity, miner.entity);
    if (!motion.ok) {
      this._failCeresTenderServiceIncident(incident, 'invalid_service_geometry');
      return incident;
    }
    if (!motion.holding) return incident;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    if (incident.state === 'approach') {
      incident.state = 'holding';
      incident.holdStartedAtSimT = now;
      return incident;
    }
    if (incident.state === 'holding'
      && now >= incident.holdStartedAtSimT + CERES_TENDER_SERVICE_HOLD_S) {
      incident.state = 'repair';
    }
    if (incident.state === 'repair' && !this._requestCeresTenderServiceRepair(incident, miner.entity)) {
      this._failCeresTenderServiceIncident(incident, 'drive_repair_refused');
    }
    void dt;
    return incident;
  },

  // ── PQ-048.05 disabled-hauler recovery ───────────────────────────────────────────────────────

  _resetCeresDisabledHaulerRuntime() {
    this._ceresDisabledHaulerImpairmentActor = null;
    this._ceresDisabledHaulerRepairActor = null;
  },

  _activeCeresDisabledHaulerIncident() {
    this._ensureState();
    const incident = this.state.traffic.ceresDisabledHaulerIncident;
    return incident && !CERES_DISABLED_HAULER_TERMINAL_STATES.has(incident.state) ? incident : null;
  },

  _ceresDisabledHaulerActor(incident, role) {
    if (!incident || (role !== 'hauler' && role !== 'responder')) return null;
    const worldRecordId = role === 'hauler'
      ? incident.haulerWorldRecordId
      : incident.responderWorldRecordId;
    const expectedSlotId = role === 'hauler' ? CERES_REFINERY_HAULER_SLOT_ID : CERES_TENDER_SLOT_ID;
    const entity = entityWithWorldRecord(this.state, worldRecordId);
    if (!entity || entity.alive === false || entity.type !== 'ship' || !entity.data
      || entity.data.worldRecordId !== worldRecordId
      || entity.data.activityActorSlotId !== expectedSlotId
      || entity.data.jobId !== `job:${worldRecordId}`
      || !entity.pos || !Number.isFinite(entity.pos.x) || !Number.isFinite(entity.pos.z)) return null;
    if (role === 'responder') {
      const presence = entity.data.factionPresence;
      if (entity.data.durable !== true || !presence || presence.yardTender !== true) return null;
      return { entity, rec: null, jobId: entity.data.jobId, worldRecordId };
    }
    const rec = (this.state.traffic.freighters || []).find((candidate) => candidate
      && candidate.activityActorSlotId === CERES_REFINERY_HAULER_SLOT_ID
      && (candidate.worldRecordId === worldRecordId || candidate.id === entity.id));
    const manifest = entity.data.cargoManifest || rec && rec.manifest;
    if (!rec || entity.data.ceresActivityCast !== true || entity.data.ceresActivityJobOwned !== true
      || !this._ceresHandoffDeliveryIsCurrent(this.state.traffic.ceresMinerHaulerHandoff, manifest)
      || !ceresDisabledHaulerManifestTruth(this.state, entity, incident, rec.manifest)) return null;
    // Only an exact match may replace the deserialized copy. Quantities always come back from the
    // live transferred manifest, never from the incident envelope in isolation.
    incident.manifest = JSON.parse(JSON.stringify(manifest));
    return { entity, rec, jobId: entity.data.jobId, worldRecordId };
  },

  _beginCeresDisabledHaulerIncident() {
    this._ensureState();
    const existing = this.state.traffic.ceresDisabledHaulerIncident;
    if (existing) return existing;
    const handoff = this.state.traffic.ceresMinerHaulerHandoff;
    const haulerBound = handoff && this._ceresHandoffActor(handoff, 'hauler');
    const responderBound = this._ceresCausalActorBySlot(CERES_TENDER_SLOT_ID);
    const responder = responderBound && responderBound.entity;
    const manifest = haulerBound && (haulerBound.entity.data.cargoManifest || haulerBound.rec.manifest);
    const responderWorldRecordId = responder && responder.data && responder.data.worldRecordId;
    if (!handoff || handoff.state !== 'in_transit' || !haulerBound
      || !validCausalManifest(manifest) || !manifest.custody
      || manifest.custody.handoffId !== handoff.handoffId
      || typeof responderWorldRecordId !== 'string' || !responderWorldRecordId) return null;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    const incident = {
      schema: CERES_DISABLED_HAULER_INCIDENT_SCHEMA,
      incidentId: `ceres-disabled-hauler:${handoff.handoffId}:${manifest.manifestId}`,
      handoffId: handoff.handoffId,
      haulerWorldRecordId: handoff.haulerWorldRecordId,
      responderWorldRecordId,
      manifestId: manifest.manifestId,
      rootLotId: handoff.rootLotId,
      manifest: JSON.parse(JSON.stringify(manifest)),
      state: 'impair',
      choice: null,
      startedAtSimT: now,
      responseAtSimT: now + CERES_DISABLED_HAULER_PLAYER_WINDOW_S,
      holdStartedAtSimT: null,
      terminalAtSimT: null,
      outcome: null,
      failureReason: null,
      lossIntentId: null,
      lawIncidentReceiptId: null,
      theftCausalTick: null,
      pickupLines: [],
    };
    if (!this._ceresDisabledHaulerActor(incident, 'hauler')
      || !this._ceresDisabledHaulerActor(incident, 'responder')) return null;
    this.state.traffic.ceresDisabledHaulerIncident = incident;
    return incident;
  },

  _ceresDisabledHaulerClaimId(incident, role) {
    return `ceres-disabled-hauler:${incident.incidentId}:${role}`;
  },

  _claimCeresDisabledHaulerControl(incident, actor, role) {
    const jobs = this.helpers && this.helpers.npcJobs;
    if (!incident || !actor || !actor.jobId || !jobs || typeof jobs.claimControl !== 'function') return false;
    const result = jobs.claimControl(actor.jobId, {
      claimId: this._ceresDisabledHaulerClaimId(incident, role),
      holder: 'traffic:ceresDisabledHaulerRecovery',
    });
    return !!(result && result.granted === true);
  },

  _releaseCeresDisabledHaulerControl(incident, role) {
    if (!incident || (role !== 'hauler' && role !== 'responder')) return;
    const worldRecordId = role === 'hauler' ? incident.haulerWorldRecordId : incident.responderWorldRecordId;
    const jobs = this.helpers && this.helpers.npcJobs;
    if (jobs && typeof jobs.releaseControl === 'function') {
      jobs.releaseControl(`job:${worldRecordId}`, this._ceresDisabledHaulerClaimId(incident, role));
    }
  },

  _releaseCeresDisabledHaulerControls(incident) {
    this._releaseCeresDisabledHaulerControl(incident, 'hauler');
    this._releaseCeresDisabledHaulerControl(incident, 'responder');
  },

  _requestCeresDisabledHaulerImpairment(incident, entity) {
    const already = this._ceresDisabledHaulerImpairmentActor
      && this._ceresDisabledHaulerImpairmentActor.incidentId === incident.incidentId
      && this._ceresDisabledHaulerImpairmentActor.entity === entity;
    if (already) return true;
    const kernel = this._ceresTenderServiceCombatKernel();
    const drive = this._ceresTenderServiceDriveRuntime(entity, kernel);
    if (!kernel || typeof kernel.routeDamage !== 'function' || !drive
      || !Number.isFinite(drive.health) || drive.health < 0) return false;
    if (drive.health <= 0 && drive.pendingTransition && drive.pendingTransition.destroyed === true) {
      this._ceresDisabledHaulerImpairmentActor = { incidentId: incident.incidentId, entity };
      return true;
    }
    if (drive.health <= 0) return false;
    const hullBefore = Number(entity.hull);
    const ionDamage = CERES_TENDER_SERVICE_DRIVE_ARMOR_FLAT
      + drive.health / CERES_TENDER_SERVICE_DRIVE_ION_MULTIPLIER;
    const result = kernel.routeDamage({
      attackerId: null,
      targetId: entity.id,
      packet: {
        channels: { ion: ionDamage }, penetration: 0, shieldBypass: 1, subsystemShare: 1,
        hit: { subsystemId: 'subsystem_drive' },
        source: { kind: 'traffic_disabled_hauler', id: incident.incidentId },
      },
      origin: { kind: 'traffic_disabled_hauler', id: incident.incidentId },
    });
    if (!result || result.ok !== true || result.hullDamage !== 0 || entity.hull !== hullBefore) return false;
    this._ceresDisabledHaulerImpairmentActor = { incidentId: incident.incidentId, entity };
    return true;
  },

  _requestCeresDisabledHaulerRepair(incident, entity) {
    const already = this._ceresDisabledHaulerRepairActor
      && this._ceresDisabledHaulerRepairActor.incidentId === incident.incidentId
      && this._ceresDisabledHaulerRepairActor.entity === entity;
    if (already) return true;
    const kernel = this._ceresTenderServiceCombatKernel();
    if (!kernel || typeof kernel.repair !== 'function') return false;
    const result = kernel.repair(entity.id, 'subsystem_drive', CERES_DISABLED_HAULER_REPAIR_AMOUNT,
      'traffic_disabled_hauler_responder');
    if (!result || result.ok !== true) return false;
    this._ceresDisabledHaulerRepairActor = { incidentId: incident.incidentId, entity };
    return true;
  },

  _stampCeresDisabledHauler(entity, incident) {
    if (!entity || !entity.data || !incident) return;
    entity.data.ceresDisabledHauler = {
      schema: incident.schema,
      incidentId: incident.incidentId,
      handoffId: incident.handoffId,
      manifestId: incident.manifestId,
      haulerWorldRecordId: incident.haulerWorldRecordId,
      state: incident.state,
      choice: incident.choice,
      responseAtSimT: incident.responseAtSimT,
      outcome: incident.outcome,
    };
  },

  _terminalizeCeresDisabledHauler(incident, outcome, reason = null) {
    if (!incident || CERES_DISABLED_HAULER_TERMINAL_STATES.has(incident.state)) return false;
    incident.state = outcome;
    incident.outcome = outcome;
    incident.failureReason = reason == null ? null : String(reason);
    incident.terminalAtSimT = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    incident.holdStartedAtSimT = null;
    this._releaseCeresDisabledHaulerControls(incident);
    this._resetCeresDisabledHaulerRuntime();
    const hauler = entityWithWorldRecord(this.state, incident.haulerWorldRecordId);
    this._stampCeresDisabledHauler(hauler, incident);
    return true;
  },

  _onCeresDisabledHaulerPlayerClaim(payload) {
    const incident = this._activeCeresDisabledHaulerIncident();
    const hauler = incident && this._ceresDisabledHaulerActor(incident, 'hauler');
    if (!incident || !hauler || payload.entityId !== hauler.entity.id
      || payload.manifestId !== incident.manifestId || incident.choice && incident.choice !== 'recover') return false;
    incident.choice = 'recover';
    incident.state = 'player_recovery';
    this._releaseCeresDisabledHaulerControl(incident, 'responder');
    this._stampCeresDisabledHauler(hauler.entity, incident);
    return true;
  },

  _onCeresDisabledHaulerRecovery(payload) {
    const incident = this._activeCeresDisabledHaulerIncident();
    const hauler = incident && this._ceresDisabledHaulerActor(incident, 'hauler');
    if (!incident || !hauler || payload.manifestId !== incident.manifestId
      || payload.recoveryId && !String(payload.recoveryId).startsWith(`civilian-recovery:${incident.manifestId}:`)) return false;
    const handoff = this.state.traffic.ceresMinerHaulerHandoff;
    if (handoff && handoff.handoffId === incident.handoffId) {
      this._interruptCeresMinerHaulerHandoff(handoff, 'lawful_recovery');
    }
    return this._terminalizeCeresDisabledHauler(incident, 'recovered');
  },

  _onCeresDisabledHaulerAbandoned(payload) {
    const incident = this._activeCeresDisabledHaulerIncident();
    const hauler = incident && this._ceresDisabledHaulerActor(incident, 'hauler');
    if (!incident || !hauler || payload.manifestId !== incident.manifestId) return false;
    if (payload.outcome === 'drive_restored') {
      return this._terminalizeCeresDisabledHauler(incident, 'repaired');
    }
    if (payload.outcome === 'destroyed') {
      return this._terminalizeCeresDisabledHauler(incident, 'destroyed', 'destroyed');
    }
    incident.pendingAbandonmentReason = String(payload.outcome || 'abandoned');
    if (hauler && this._destroyCeresDisabledHauler(incident, hauler.entity, payload.outcome || 'abandoned')) {
      return true;
    }
    delete incident.pendingAbandonmentReason;
    this._bookCeresDisabledHaulerLoss(incident, payload.killerId, `recovery_${payload.outcome || 'abandoned'}`);
    return this._terminalizeCeresDisabledHauler(incident, 'abandoned', payload.outcome || null);
  },

  _spawnCeresDisabledHaulerPickups(incident, hauler) {
    if (!incident || !hauler || !this.helpers || typeof this.helpers.spawnEntity !== 'function') return false;
    if (!Array.isArray(incident.pickupLines)) incident.pickupLines = [];
    if (incident.pickupLines.length) return true;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    incident.manifest.lines.forEach((line, index) => {
      const angle = (hash32(incident.incidentId, index, 'steal-pickup') % 6284) / 1000;
      const radius = Math.max(2.8, Math.min(8, 2 + Math.cbrt(line.qty)));
      const pickupStableId = `${incident.incidentId}:pickup:${index}`;
      const pickup = this.helpers.spawnEntity({
        type: 'pickup',
        pos: { x: hauler.pos.x + Math.cos(angle) * (hauler.radius + 8), z: hauler.pos.z + Math.sin(angle) * (hauler.radius + 8) },
        vel: { x: Math.cos(angle) * 5, z: Math.sin(angle) * 5 },
        radius,
        mass: Math.max(20, line.qty * 12),
        collides: true,
        flags: { persistent: true },
        data: {
          kind: 'cargo', commodityId: line.commodityId, amount: line.qty,
          despawnAt: now + CERES_DISABLED_HAULER_PICKUP_TTL_S,
          lotSource: {
            lotId: `${incident.rootLotId}:stolen-line:${index}`,
            provenanceId: incident.manifestId,
            sourceKind: 'disabled_hauler_manifest_theft',
            recordId: incident.haulerWorldRecordId,
            choiceId: 'steal',
            sourceOwner: 'player',
          },
          ceresDisabledHaulerPickup: {
            schema: CERES_DISABLED_HAULER_INCIDENT_SCHEMA,
            incidentId: incident.incidentId, pickupStableId, manifestId: incident.manifestId,
            commodityId: line.commodityId, qty: line.qty,
          },
        },
      });
      if (pickup) incident.pickupLines.push({ pickupStableId, commodityId: line.commodityId, qty: line.qty, acceptedQty: 0 });
    });
    return incident.pickupLines.length === incident.manifest.lines.length;
  },

  _onCeresDisabledHaulerPickup(payload) {
    if (!payload || payload.collectorId !== this.state.playerId || payload.pickupId == null) return false;
    const pickup = this.state.entities && this.state.entities.get && this.state.entities.get(payload.pickupId);
    const marker = pickup && pickup.data && pickup.data.ceresDisabledHaulerPickup;
    const incident = this.state.traffic && this.state.traffic.ceresDisabledHaulerIncident;
    if (!marker || !incident || marker.incidentId !== incident.incidentId || incident.state !== 'stolen') return false;
    const line = incident.pickupLines.find((entry) => entry.pickupStableId === marker.pickupStableId);
    const accepted = Math.max(0, Math.floor(Number(payload.acceptedAmount) || 0));
    if (!line || accepted <= 0 || line.acceptedQty >= line.qty) return false;
    line.acceptedQty = Math.min(line.qty, line.acceptedQty + accepted);
    this._reportCeresDisabledHaulerTheft(incident, pickup);
    return true;
  },

  _reportCeresDisabledHaulerTheft(incident, pickup) {
    if (!incident || incident.lawIncidentReceiptId || !pickup || !pickup.pos) return null;
    const law = this._registry && typeof this._registry.get === 'function'
      ? this._registry.get('lawSecurity') : null;
    if (!law || typeof law.reportIncident !== 'function') return null;
    if (!Number.isSafeInteger(incident.theftCausalTick)) incident.theftCausalTick = Math.max(0, this.state.tick | 0);
    const receipt = law.reportIncident({
      reportId: `${incident.incidentId}:law:${CERES_DISABLED_HAULER_LAW_KIND}`,
      kind: CERES_DISABLED_HAULER_LAW_KIND,
      offenderStableId: CERES_DISABLED_HAULER_OFFENDER_STABLE_ID,
      offenderEntityId: this.state.playerId,
      payloadStableId: incident.manifestId,
      causalTick: incident.theftCausalTick,
      pos: { x: pickup.pos.x, z: pickup.pos.z },
    });
    if (receipt && receipt.accepted === true) incident.lawIncidentReceiptId = receipt.incidentReceiptId;
    return receipt;
  },

  _bookCeresDisabledHaulerLoss(incident, killerId = null, cause = 'disabled_hauler_loss') {
    if (!incident || incident.lossIntentId) return false;
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const stationId = this._nearestStationId(entityWithWorldRecord(this.state, incident.haulerWorldRecordId)?.pos);
    const intent = buildLossIntent({
      seed, freighterKey: incident.haulerWorldRecordId, stationId,
      sectorId: CERES_ACTIVITY_SECTOR_ID, manifest: incident.manifest, killerId,
      intentId: `${incident.incidentId}:freight-loss`, seq: 0,
    });
    const fresh = filterNewFreightIntents([intent], this.state.traffic.appliedLossIds);
    if (!fresh.length) {
      incident.lossIntentId = intent.intentId;
      return false;
    }
    for (const pressure of intent.pressures) {
      if (!pressure.stationId) continue;
      this.bus.emit('economy:applyTradePressure', { ...pressure, intentId: intent.intentId, recoveryCause: cause });
    }
    this.bus.emit('freight:loss', { ...intent, recoveryCause: cause });
    if (intent.news) this.bus.emit('news:headline', { ...intent.news, headline: null, recoveryCause: cause });
    this.state.traffic.appliedLossIds = mergeAppliedFreightIds(this.state.traffic.appliedLossIds, fresh);
    incident.lossIntentId = intent.intentId;
    return true;
  },

  _chooseCeresDisabledHauler(incident, choice) {
    if (!incident || CERES_DISABLED_HAULER_TERMINAL_STATES.has(incident.state)
      || incident.choice && incident.choice !== choice) return false;
    const hauler = this._ceresDisabledHaulerActor(incident, 'hauler');
    if (!hauler) return false;
    incident.choice = choice;
    if (choice === 'recover') {
      incident.state = 'player_recovery';
      this._releaseCeresDisabledHaulerControl(incident, 'responder');
      this._stampCeresDisabledHauler(hauler.entity, incident);
      return true;
    }
    if (choice === 'steal') {
      if (!this._spawnCeresDisabledHaulerPickups(incident, hauler.entity)) return false;
      this._setTrafficManifest(hauler.entity, hauler.rec,
        this._buildMinerManifest(hauler.entity, 0, null, 0, 'hauler'));
      const handoff = this.state.traffic.ceresMinerHaulerHandoff;
      if (handoff && handoff.handoffId === incident.handoffId) {
        this._interruptCeresMinerHaulerHandoff(handoff, 'manifest_stolen', hauler.entity);
      }
      this._bookCeresDisabledHaulerLoss(incident, this.state.playerId, 'disabled_hauler_theft');
      this._terminalizeCeresDisabledHauler(incident, 'stolen');
      return true;
    }
    if (choice === 'abandon') {
      return this._destroyCeresDisabledHauler(incident, hauler.entity, 'player_abandon');
    }
    return false;
  },

  _destroyCeresDisabledHauler(incident, entity, reason) {
    const kernel = this._ceresTenderServiceCombatKernel();
    if (!incident || !entity || !kernel || typeof kernel.routeDamage !== 'function') return false;
    const result = kernel.routeDamage({
      attackerId: null,
      targetId: entity.id,
      packet: {
        channels: { kinetic: Math.max(9999, Number(entity.hull) * 20) },
        shieldBypass: 1,
        penetration: 999,
        source: { kind: 'traffic_disabled_hauler_abandon', id: incident.incidentId, reason },
      },
      origin: { kind: 'traffic_disabled_hauler_abandon', id: incident.incidentId, reason },
    });
    return !!(result && result.ok === true && entity.alive === false);
  },

  _stepCeresDisabledHaulerIncident(dt) {
    const incident = this._activeCeresDisabledHaulerIncident();
    if (!incident || this.state.world && this.state.world.currentSectorId !== CERES_ACTIVITY_SECTOR_ID) return incident;
    const hauler = this._ceresDisabledHaulerActor(incident, 'hauler');
    const responder = this._ceresDisabledHaulerActor(incident, 'responder');
    if (!hauler || !responder) {
      if (this._ceresDisabledHaulerRestorePending) return incident;
      this._terminalizeCeresDisabledHauler(incident, 'failed', 'actor_absent');
      return incident;
    }
    if (!this._ceresTenderServiceDriveDisabled(hauler.entity)) {
      if (incident.state === 'responder_repair') {
        this._terminalizeCeresDisabledHauler(incident, 'repaired');
        return incident;
      }
      this._releaseCeresDisabledHaulerControls(incident);
      incident.state = 'impair';
      incident.holdStartedAtSimT = null;
      this._ceresDisabledHaulerRepairActor = null;
      if (!this._requestCeresDisabledHaulerImpairment(incident, hauler.entity)) {
        this._terminalizeCeresDisabledHauler(incident, 'failed', 'drive_impairment_refused');
      }
      return incident;
    }
    const haulerClaimed = this._claimCeresDisabledHaulerControl(incident, hauler, 'hauler');
    if (!haulerClaimed) {
      this._terminalizeCeresDisabledHauler(incident, 'failed', 'hauler_control_refused');
      return incident;
    }
    if (incident.state === 'impair') incident.state = 'distress';
    this._stampCeresDisabledHauler(hauler.entity, incident);
    if (incident.choice === 'recover' || incident.state === 'player_recovery') {
      setIntent(hauler.entity, 0, 0, false, false, null, hauler.entity.rot || 0);
      hauler.entity.data.intent.brake = true;
      return incident;
    }
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    if (now < incident.responseAtSimT) return incident;
    const responderClaimed = this._claimCeresDisabledHaulerControl(incident, responder, 'responder');
    if (!responderClaimed) {
      this._terminalizeCeresDisabledHauler(incident, 'failed', 'responder_control_refused');
      return incident;
    }
    incident.state = 'responder_approach';
    const motion = this._driveCeresTenderServiceStandoff(incident, responder.entity, hauler.entity);
    if (!motion.ok) {
      this._terminalizeCeresDisabledHauler(incident, 'failed', 'invalid_recovery_geometry');
      return incident;
    }
    if (!motion.holding) return incident;
    if (incident.holdStartedAtSimT == null) {
      incident.holdStartedAtSimT = now;
      return incident;
    }
    if (now < incident.holdStartedAtSimT + CERES_DISABLED_HAULER_REPAIR_HOLD_S) return incident;
    incident.state = 'responder_repair';
    if (!this._requestCeresDisabledHaulerRepair(incident, hauler.entity)) {
      this._terminalizeCeresDisabledHauler(incident, 'failed', 'drive_repair_refused');
    }
    void dt;
    return incident;
  },

  _onNpcJobWork(intent) {
    const ceresOwned = this._ceresActivityIntentClaimsOwnership(intent);
    const actorContext = this._ceresActivityActorContext(intent);
    if (ceresOwned) {
      const context = this._ceresActivityActionContext(intent, 'work', actorContext);
      return context ? this._applyCeresActivityAction(context, intent) : false;
    }
    if (!intent || intent.completed !== true) return false;

    // General salvor: WORK finishes the cut; value is claimed here so a mid-LOAD kill still drops
    // the taken cargo via the civilian-manifest payload path.
    if (intent.kind === 'salvor') {
      const context = this._jobTrafficContext(intent, 'salvor');
      if (!context) return false;
      const carried = context.entity.data && context.entity.data.cargoManifest
        || context.rec.manifest;
      // A rejected yard keeps custody on the cutter. When the cyclic job reaches another wreck,
      // do not overwrite that conserved lot; it must return to an eligible intake first.
      if (carried && Array.isArray(carried.lines) && carried.totalQty > 0) return true;
      const waypointId = typeof intent.field === 'string' ? intent.field
        : (typeof intent.waypointId === 'string' ? intent.waypointId : '');
      const target = this._resolveSalvorTargetFromWaypoint(waypointId, intent.payload)
        || (intent.payload && intent.payload.targetId != null
          && this.state.entities && this.state.entities.get
          ? this.state.entities.get(intent.payload.targetId)
          : null);
      if (!target || target.alive === false) {
        // Player beat the cutter (or the body despawned) — depart empty, no mint.
        const source = this._salvageSourceBindingFromPayload(intent.payload);
        if (source) this._releaseSalvageSourceClaim(source, context.worldRecordId);
        this._setTrafficManifest(
          context.entity,
          context.rec,
          this._emptySalvorManifest(context.entity, intent.seq | 0),
        );
        return false;
      }
      return this._takeSalvageValueOntoSalvor(context, intent, target);
    }

    if (intent.kind !== 'miner') return false;
    const context = this._jobTrafficContext(intent, 'miner', ['miner', 'ore_carrier']);
    if (!context) return false;
    const fieldWaypoint = typeof intent.field === 'string' ? intent.field : '';
    if (!fieldWaypoint.startsWith('field:') || fieldWaypoint.length <= 6) return false;
    const rawAsteroidId = fieldWaypoint.slice(6);
    const numericAsteroidId = Number(rawAsteroidId);
    const asteroid = this.state.entities && this.state.entities.get
      ? (this.state.entities.get(rawAsteroidId)
        || (Number.isFinite(numericAsteroidId) ? this.state.entities.get(numericAsteroidId) : null))
      : null;
    if (!asteroid || asteroid.alive === false || asteroid.type !== 'asteroid') return false;
    const fieldId = asteroid.data && asteroid.data.fieldId;
    if (!fieldId) return false;

    const seq = Number.isSafeInteger(intent.seq) && intent.seq >= 0 ? intent.seq : 0;
    return this._applyNpcMinerExtraction(
      context,
      intent,
      asteroid,
      `npc-miner-work:${context.worldRecordId}:${seq}`,
    );
  },

  _onContactHailResponse(response) {
    if (!response) return false;
    const choice = String(response.choice || '').toLowerCase();
    if (choice === 'assist') return this._beginPassengerLinerAssist(response);
    if (choice === 'escort') return this._requestPriorityCourierEscort(response);
    if (choice === 'recover' || choice === 'steal' || choice === 'abandon') {
      const incident = this._activeCeresDisabledHaulerIncident();
      const hauler = incident && this._ceresDisabledHaulerActor(incident, 'hauler');
      if (!incident || !hauler || response.targetId !== hauler.entity.id) return false;
      return this._chooseCeresDisabledHauler(incident, choice);
    }
    if (choice !== 'help') return false;
    const target = this.state.entities && this.state.entities.get
      ? this.state.entities.get(response.targetId)
      : null;
    if (!target || target.alive === false || target.type !== 'ship') return false;
    const rec = this.state.traffic && Array.isArray(this.state.traffic.freighters)
      ? this.state.traffic.freighters.find((row) => row && row.id === target.id)
      : null;
    if (!rec || rec.activityActorSlotId !== CERES_SEAM_MINER_SLOT_ID || rec.role !== 'ore_carrier') return false;
    const owner = ceresSeamMinerOwnerIdentity(target, rec);
    const targetData = target.data || {};
    if (!owner || targetData.homeSectorId !== CERES_ACTIVITY_SECTOR_ID
      || targetData.sectorId !== CERES_ACTIVITY_SECTOR_ID
      || (this.state.world && this.state.world.currentSectorId) !== CERES_ACTIVITY_SECTOR_ID) return false;
    const candidates = [];
    for (const entity of this.state.entities && this.state.entities.values
      ? this.state.entities.values()
      : []) {
      if (!entity || entity.alive === false || entity.type !== 'asteroid') continue;
      const entityData = entity.data || {};
      if (entityData.activityObjectSlotId !== CERES_RICH_SEAM_OBJECT_SLOT_ID
        || entityData.sectorId !== CERES_ACTIVITY_SECTOR_ID
        || entityData.homeSectorId !== CERES_ACTIVITY_SECTOR_ID) continue;
      const opportunity = richSeamOpportunityForEntity(this.state, entity);
      if (!opportunity || opportunity.state !== 'open' || opportunity.sectorId !== CERES_ACTIVITY_SECTOR_ID) continue;
      const dx = Number(entity.pos && entity.pos.x) - Number(target.pos && target.pos.x);
      const dz = Number(entity.pos && entity.pos.z) - Number(target.pos && target.pos.z);
      candidates.push({ entity, opportunity, distance: dx * dx + dz * dz });
    }
    candidates.sort((a, b) => a.distance - b.distance || String(a.entity.id).localeCompare(String(b.entity.id)));
    const seam = candidates[0];
    if (!seam) return false;
    const opportunity = seam.opportunity;
    const seamData = seam.entity.data || {};
    const reserved = reserveRichSeamOpportunity(this.state, {
      fieldId: seamData.fieldId,
      activityObjectSlotId: seamData.activityObjectSlotId,
      reservationId: `rich-help:${opportunity.opportunityId}:${owner.stableId}`,
      reservedByKind: 'npc',
      reservedById: target.id,
      reservedByStableId: owner.stableId,
      reservedByWorldRecordId: owner.worldRecordId,
      reservedByActivityActorSlotId: owner.activityActorSlotId,
      reservedByJobId: owner.jobId,
      simTime: this.state.simTime,
    });
    if (!reserved) return false;
    this.bus.emit('traffic:richSeamHelpReserved', {
      ...reserved,
      targetId: target.id,
      requestId: response.requestId || null,
      source: 'contact_hail',
    });
    return true;
  },

  /**
   * LOAD is the visible wrangle act. Value was claimed on WORK; this only re-affirms the taken
   * pool if WORK somehow missed (virtualized catch-up) and never invents commodities.
   */
  _onNpcJobLoad(intent) {
    if (!intent || intent.completed !== true || intent.kind !== 'salvor') return false;
    if (this._ceresActivityIntentClaimsOwnership(intent)) return false;
    const context = this._jobTrafficContext(intent, 'salvor');
    if (!context) return false;
    const hasCargo = context.entity.data
      && context.entity.data.cargoManifest
      && Array.isArray(context.entity.data.cargoManifest.lines)
      && context.entity.data.cargoManifest.totalQty > 0;
    if (hasCargo) return true;
    const origin = typeof intent.origin === 'string' ? intent.origin : '';
    const target = this._resolveSalvorTargetFromWaypoint(origin, intent.payload);
    if (!target || target.alive === false || !this._isSalvageableBody(target)) return false;
    return this._takeSalvageValueOntoSalvor(context, intent, target);
  },

  _applyNpcMinerExtraction(context, intent, asteroid, workId, options = null) {
    if (!context || !asteroid || asteroid.alive === false || asteroid.type !== 'asteroid'
      || typeof workId !== 'string' || !workId) return false;
    this._ensureCausalLedgerSets();
    const fieldId = asteroid.data && asteroid.data.fieldId;
    if (!fieldId || this.state.traffic.appliedMinerWorkIds.includes(workId)
      || this._pendingMinerWorkIds.has(workId)) return false;
    const reservation = this._reserveCausalId(
      workId,
      '_pendingMinerWorkIds',
      '_pendingMinerWorkTokens',
    );
    if (!reservation) return false;
    const causalGuard = options && typeof options.causalGuard === 'function'
      ? options.causalGuard
      : null;
    const stillCurrent = () => this._causalReservationIsCurrent(
      reservation,
      '_pendingMinerWorkIds',
      '_pendingMinerWorkTokens',
    ) && (!causalGuard || causalGuard());
    if (!stillCurrent()) {
      this._releaseCausalReservation(reservation, '_pendingMinerWorkIds', '_pendingMinerWorkTokens');
      return false;
    }
    const seq = Number.isSafeInteger(intent.seq) && intent.seq >= 0 ? intent.seq : 0;
    let richClaim = null;
    try {
      const commodityId = dominantAsteroidCommodity(asteroid);
      const authoredYield = Math.max(1, Math.floor(Number(asteroid.data && asteroid.data.yieldU) || NPC_MINER_WORK_BATCH_U));
      const isCeresRichSeamWork = context.slot && context.slot.id === CERES_SEAM_MINER_SLOT_ID
        && asteroid.data && asteroid.data.activityObjectSlotId === CERES_RICH_SEAM_OBJECT_SLOT_ID;
      const activeHandoff = this.state.traffic && this.state.traffic.ceresMinerHaulerHandoff;
      if (isCeresRichSeamWork && activeHandoff
        && activeHandoff.state !== 'delivered' && activeHandoff.state !== 'interrupted'
        && activeHandoff.minerWorldRecordId === context.worldRecordId) {
        throw new Error('ceres_miner_handoff_pending');
      }
      if (isCeresRichSeamWork && richSeamOpportunityForEntity(this.state, asteroid)?.state === 'open') {
        const owner = ceresSeamMinerOwnerIdentity(context.entity, context.rec);
        if (!owner) throw new Error('ceres_miner_stable_identity_missing');
        richClaim = claimRichSeamOpportunity(this.state, {
          fieldId,
          activityObjectSlotId: CERES_RICH_SEAM_OBJECT_SLOT_ID,
          claimId: workId,
          claimedByKind: 'npc',
          claimedById: context.entity.id,
          claimedByStableId: owner.stableId,
          claimedByWorldRecordId: owner.worldRecordId,
          claimedByActivityActorSlotId: owner.activityActorSlotId,
          claimedByJobId: owner.jobId,
          resolution: richSeamOpportunityForEntity(this.state, asteroid)?.reservationId ? 'help' : 'work',
          simTime: this.state.simTime,
        });
      }
      const richBonusU = richClaim ? richClaim.claimedBonusU : 0;
      const extractedU = Math.min(authoredYield, NPC_MINER_WORK_BATCH_U + richBonusU);
      const carrierRole = context.rec && context.rec.role === 'ore_carrier'
        ? 'ore_carrier'
        : 'miner';
      const manifest = this._buildMinerManifest(
        context.entity,
        seq,
        commodityId,
        extractedU,
        carrierRole,
        carrierRole === 'ore_carrier'
          ? {
              workId,
              asteroidId: asteroid.id,
              fieldId: String(fieldId),
              sectorId: (this.state.world && this.state.world.currentSectorId) || null,
              richOpportunityId: richClaim && richClaim.opportunityId || null,
              richBonusU,
              richResolution: richClaim && richClaim.resolution || null,
              richReservationId: richClaim && richClaim.reservationId || null,
            }
          : null,
      );
      if (!this._setTrafficManifest(context.entity, context.rec, manifest)) throw new Error('miner_manifest_rejected');
      if (isCeresRichSeamWork && !this._requestCeresMinerHaulerHandoff(context, manifest)) {
        throw new Error('ceres_miner_handoff_request_rejected');
      }
      this.bus.emit('mining:npcExtraction', {
        jobId: context.jobId,
        workId,
        minerId: context.entity.id,
        asteroidId: asteroid.id,
        fieldId: String(fieldId),
        sectorId: (this.state.world && this.state.world.currentSectorId) || null,
        commodityId,
        extractedU,
        seq,
      });
      if (richClaim) {
        this.bus.emit('field:richSeamWorked', {
          ...richClaim,
          minerId: context.entity.id,
          asteroidId: asteroid.id,
          commodityId,
          extractedU,
        });
      }
      if (!stillCurrent()) {
        this._releaseCausalReservation(reservation, '_pendingMinerWorkIds', '_pendingMinerWorkTokens');
        return false;
      }
    } catch {
      this._releaseCausalReservation(reservation, '_pendingMinerWorkIds', '_pendingMinerWorkTokens');
      return false;
    }
    this.state.traffic.appliedMinerWorkIds.push(workId);
    this._releaseCausalReservation(reservation, '_pendingMinerWorkIds', '_pendingMinerWorkTokens');
    if (context.slot && context.slot.id === CERES_SEAM_MINER_SLOT_ID) {
      this._committedCeresMinerWorkIds.add(workId);
      if (this._ceresCausal && this._ceresCausal.seeds.miner_loaded !== true) {
        this._ceresCausal.seeds.miner_loaded = true;
        this._emitCeresCausalReceipt(null, 'seed', {
          seeded: ['miner_loaded'],
          source: 'mining:npcExtraction',
          workId,
        });
      }
    }
    if (this.state.traffic.appliedMinerWorkIds.length > NPC_MINER_WORK_LEDGER_CAP) {
      this.state.traffic.appliedMinerWorkIds.splice(
        0,
        this.state.traffic.appliedMinerWorkIds.length - NPC_MINER_WORK_LEDGER_CAP,
      );
    }
    this._pruneCommittedCeresIds(
      this._committedCeresMinerWorkIds,
      this.state.traffic.appliedMinerWorkIds,
    );
    return true;
  },

  _pruneCommittedCeresIds(committedIds, retainedIds) {
    if (!committedIds || typeof committedIds.delete !== 'function' || !Array.isArray(retainedIds)) return;
    for (const id of committedIds) {
      if (!retainedIds.includes(id)) committedIds.delete(id);
    }
  },

  _resetTransientCausalLedgers(hard = false) {
    this._ensureState();
    this._ensureCausalLedgerSets();
    this.state.traffic.appliedArrivalIds = hard
      ? []
      : this.state.traffic.appliedArrivalIds
        .filter((id) => !this._committedCeresArrivalIds.has(id));
    if (hard) this.state.traffic.appliedLossIds = [];
    this.state.traffic.appliedMinerWorkIds = this.state.traffic.appliedMinerWorkIds
      .filter((id) => !this._committedCeresMinerWorkIds.has(id));
    this.state.traffic.appliedJobActionIds = [];
    // Salvor work receipts are transient like miner work — Continue may re-surface a legitimate cut.
    this.state.traffic.appliedSalvorWorkIds = [];
    this._committedCeresArrivalIds.clear();
    this._committedCeresMinerWorkIds.clear();
  },

  // ── PQ-045.causal-chain — Ceres-only choreography timer ────────────────────────────────────────

  _wipeCeresCausalDataKeys(data) {
    if (!data || typeof data !== 'object') return;
    for (let i = 0; i < CERES_CAUSAL_STAMP_KEYS.length; i++) {
      if (Object.prototype.hasOwnProperty.call(data, CERES_CAUSAL_STAMP_KEYS[i])) {
        delete data[CERES_CAUSAL_STAMP_KEYS[i]];
      }
    }
  },

  /** Clear every ceresCausal* key traffic plants — both live actors and freighter ledger rows. */
  _clearAllCeresCausalEntityStamps() {
    const freighters = this.state && this.state.traffic && this.state.traffic.freighters;
    if (Array.isArray(freighters)) {
      for (let i = 0; i < freighters.length; i++) {
        const rec = freighters[i];
        if (!rec) continue;
        if (Object.prototype.hasOwnProperty.call(rec, 'ceresCausalDisabled')) {
          delete rec.ceresCausalDisabled;
        }
        const entity = this.state.entities && this.state.entities.get(rec.id);
        if (entity && entity.data) this._wipeCeresCausalDataKeys(entity.data);
      }
    }
    if (this.state && Array.isArray(this.state.entityList)) {
      for (let i = 0; i < this.state.entityList.length; i++) {
        const candidate = this.state.entityList[i];
        const data = candidate && candidate.data;
        if (!data) continue;
        let stamped = data.activityActorSlotId != null;
        if (!stamped) {
          const keys = Object.keys(data);
          for (let j = 0; j < keys.length; j++) {
            if (keys[j].startsWith('ceresCausal')) {
              stamped = true;
              break;
            }
          }
        }
        if (stamped) this._wipeCeresCausalDataKeys(data);
      }
    }
  },

  _resetCeresCausalChain(reason = 'reset') {
    if (this._ceresCausal && this._ceresCausal.active && this._ceresCausal.active.length) {
      for (const live of this._ceresCausal.active.slice()) {
        this._restoreCeresCausalJobs(live);
        this._stampCeresCausalCue(live, false);
        this._emitCeresCausalReceipt(live, 'abort', { reason: String(reason || 'reset') });
      }
    }
    this._clearAllCeresCausalEntityStamps();
    this._ceresCausal = null;
  },

  _ensureCeresCausalChain(reason = 'ensure') {
    if (!this.state || !this.state.world || this.state.world.currentSectorId !== CERES_ACTIVITY_SECTOR_ID) {
      this._resetCeresCausalChain('wrong_sector');
      return null;
    }
    if (this._ceresCausal && this._ceresCausal.schema === CERES_CAUSAL_CHAIN_SCHEMA) {
      return this._ceresCausal;
    }
    const simTime = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    this._ceresCausal = {
      schema: CERES_CAUSAL_CHAIN_SCHEMA,
      cycle: 0,
      nextIndex: 0,
      active: [],
      completed: [],
      seeds: Object.create(null),
      nextEligibleAt: simTime,
      startedAt: simTime,
      reason: String(reason || 'ensure'),
    };
    this._emitCeresCausalReceipt(null, 'chain_ready', {
      reason: String(reason || 'ensure'),
      cycle: 0,
    });
    return this._ceresCausal;
  },

  /**
   * After continuous re-entry, live links may carry phaseEndsAt values that are already in the past
   * (exit never reset the ledger). Rebase each remaining phase window from current simTime so the
   * chain does not fast-forward one transition per tick.
   */
  _rebaseCeresCausalPhaseEnds() {
    const chain = this._ceresCausal;
    if (!chain || !Array.isArray(chain.active) || !chain.active.length) return;
    const simTime = Number.isFinite(this.state && this.state.simTime) ? this.state.simTime : 0;
    for (let i = 0; i < chain.active.length; i++) {
      const live = chain.active[i];
      if (!live) continue;
      const def = CERES_CAUSAL_CHAIN_BY_ID.get(live.eventId);
      const phase = def && Array.isArray(def.phases) ? def.phases[live.phaseIndex] : null;
      const durationS = phase && Number.isFinite(phase.durationS) ? phase.durationS : 1;
      if (!(Number.isFinite(live.phaseEndsAt) && live.phaseEndsAt > simTime)) {
        live.phaseEndsAt = simTime + durationS;
      }
    }
    if (Number.isFinite(chain.nextEligibleAt) && chain.nextEligibleAt < simTime) {
      chain.nextEligibleAt = simTime;
    }
  },

  /**
   * Resolve a Ceres cast (or tender reuse) actor by stable slot id. Returns a preallocated scratch
   * object — copy entity/rec before the next call. Freighter ledger first, then tender fall-through
   * via a single worldRecordId probe (or one entityList scan when the tender is only activity-stamped).
   */
  _ceresCausalActorBySlot(slotId) {
    if (typeof slotId !== 'string' || !slotId) return null;
    const scratch = _CERES_CAUSAL_ACTOR_SCRATCH;
    scratch.entity = null;
    scratch.rec = null;
    scratch.slotId = null;
    const freighters = this.state && this.state.traffic && this.state.traffic.freighters;
    if (Array.isArray(freighters)) {
      for (let i = 0; i < freighters.length; i++) {
        const rec = freighters[i];
        if (!rec || rec.activityActorSlotId !== slotId) continue;
        const entity = liveEntity(this.state, rec.id);
        if (entity && entity.alive !== false) {
          scratch.entity = entity;
          scratch.rec = rec;
          scratch.slotId = slotId;
          return scratch;
        }
      }
    }
    // Tender is owned by factionPresence (excluded from traffic job cast) but still has the stable
    // activity slot id stamped when adopted. Freighter ledger already missed it; probe by
    // worldRecordId, then a single entityList pass if the tender was only activity-stamped.
    if (slotId === CERES_TENDER_SLOT_ID) {
      const seed = (this.state.meta && this.state.meta.seed) || 1;
      const worldRecordId = stableRecordId(
        seed,
        CERES_ACTIVITY_SECTOR_ID,
        RECORD_KIND.CONVOY,
        `ceres:activity:${CERES_TENDER_SLOT_ID}`,
      );
      let entity = entityWithWorldRecord(this.state, worldRecordId);
      if (!entity && this.state && this.state.entityList) {
        for (let i = 0; i < this.state.entityList.length; i++) {
          const candidate = this.state.entityList[i];
          if (candidate && candidate.alive !== false && candidate.data
            && candidate.data.activityActorSlotId === CERES_TENDER_SLOT_ID) {
            entity = candidate;
            break;
          }
        }
      }
      if (entity && entity.alive !== false) {
        scratch.entity = entity;
        scratch.rec = null;
        scratch.slotId = slotId;
        return scratch;
      }
    }
    return null;
  },

  _ceresCausalWorldRecordIdForSlot(slotId) {
    if (typeof slotId !== 'string' || !slotId) return null;
    const entry = CERES_ACTIVITY_CAST_BY_SLOT_ID.get(slotId);
    const worldRecordSlotId = entry && entry.slot && entry.slot.worldRecordSlotId
      ? entry.slot.worldRecordSlotId
      : `ceres:activity:${slotId}`;
    const seed = (this.state && this.state.meta && this.state.meta.seed) || 1;
    return stableRecordId(
      seed,
      CERES_ACTIVITY_SECTOR_ID,
      RECORD_KIND.CONVOY,
      worldRecordSlotId,
    );
  },

  /** True when the durable cast record is terminal (destroyed/defeated) — not merely absent this tick. */
  _ceresCausalSlotTerminallyGone(slotId) {
    if (slotId === CERES_TENDER_SLOT_ID) return false;
    const worldRecordId = this._ceresCausalWorldRecordIdForSlot(slotId);
    if (!worldRecordId) return false;
    const records = this.state && this.state.world && this.state.world.records && this.state.world.records.byId;
    return terminalWorldRecord(records && records[worldRecordId]);
  },

  _ceresCausalRequiredActorsLive(def) {
    if (!def || !Array.isArray(def.actorSlots)) return false;
    for (let i = 0; i < def.actorSlots.length; i++) {
      const slotId = def.actorSlots[i];
      // Tender is optional for chain bookkeeping: the Pitborn yard tender may lag rematerialization.
      if (slotId === CERES_TENDER_SLOT_ID) continue;
      if (!this._ceresCausalActorBySlot(slotId)) return false;
    }
    return true;
  },

  /**
   * True when at least one required non-tender cast slot is terminally destroyed (not a transient
   * single-tick absence). Used to skip the link rather than wait forever.
   */
  _ceresCausalRequiredActorsTerminallyGone(def) {
    if (!def || !Array.isArray(def.actorSlots)) return false;
    for (let i = 0; i < def.actorSlots.length; i++) {
      const slotId = def.actorSlots[i];
      if (slotId === CERES_TENDER_SLOT_ID) continue;
      if (this._ceresCausalActorBySlot(slotId)) continue;
      if (this._ceresCausalSlotTerminallyGone(slotId)) return true;
    }
    return false;
  },

  _ceresCausalSeedsReady(requires) {
    const seeds = this._ceresCausal && this._ceresCausal.seeds;
    if (!seeds) return false;
    if (!Array.isArray(requires) || requires.length === 0) return true;
    for (let i = 0; i < requires.length; i++) {
      if (seeds[requires[i]] !== true) return false;
    }
    return true;
  },

  /**
   * Seeds planted for a terminal outcome. Complete uses `def.seeds`; any interrupt/fallback/skip
   * prefers `def.interruptSeeds` when authored, otherwise falls back to `def.seeds` so the
   * plant-on-every-outcome anti-softlock guarantee stays intact for links without a branch.
   */
  _ceresCausalSeedsForOutcome(def, outcome = 'complete') {
    if (!def) return null;
    if (outcome !== 'complete' && Array.isArray(def.interruptSeeds)) return def.interruptSeeds;
    return Array.isArray(def.seeds) ? def.seeds : null;
  },

  _plantCeresCausalSeeds(def, seedsOverride = null) {
    if (!def || !this._ceresCausal) return;
    const list = Array.isArray(seedsOverride) ? seedsOverride : def.seeds;
    if (!Array.isArray(list)) return;
    for (let i = 0; i < list.length; i++) {
      this._ceresCausal.seeds[list[i]] = true;
    }
  },

  /** Plant interrupt or complete seeds for a terminal cast skip / forced seed. */
  _plantCeresCausalOutcomeSeeds(def, outcome = 'complete') {
    const list = this._ceresCausalSeedsForOutcome(def, outcome);
    this._plantCeresCausalSeeds(def, list);
    return list;
  },

  _openCeresRichSeamOpportunity(live) {
    if (!live) return null;
    // The strike opens the seam's primary window; a calving that actually reached its calve phase
    // re-arms the window as the catalog's fresh-face aftermath ("fresh faces are visibly brighter
    // ore") once the prior window has resolved. Keyed on phaseSeeded — the natural seed-at-phase
    // flag — because the completion path force-sets `seeded` on interrupts, and an aborted calving
    // never visibly happened, so it must open nothing.
    const isStrike = live.eventId === 'ev_rich_seam_strike';
    const isCalving = live.eventId === 'ev_rock_calving' && live.phaseSeeded === true;
    if (!isStrike && !isCalving) return null;
    const cycle = this._ceresCausal && this._ceresCausal.cycle || 0;
    const rec = openRichSeamOpportunity(this.state, {
      fieldId: 'f_ceres_1',
      activityObjectSlotId: CERES_RICH_SEAM_OBJECT_SLOT_ID,
      sectorId: CERES_ACTIVITY_SECTOR_ID,
      sourceEventId: live.eventId,
      sourceCycle: cycle,
      attempt: isCalving ? 1 : 0,
      // The catalog's fresh faces are "visibly brighter ore": the calved window out-pays the
      // strike's default bonus through the same bonusU field the seam readouts already render
      // (target panel names it FRESH SEAM; the Hold's lot row shows the seam bonus size).
      bonusU: isCalving ? CERES_CALVED_SEAM_BONUS_U : undefined,
      opportunityId: isCalving
        ? `rich-seam:f_ceres_1:${CERES_RICH_SEAM_OBJECT_SLOT_ID}:${cycle}:calved`
        : undefined,
      simTime: this.state && this.state.simTime,
    });
    if (rec && this.bus && typeof this.bus.emit === 'function') this.bus.emit('field:richSeamOpened', rec);
    return rec;
  },

  _emitCeresCausalReceipt(live, kind, extra = null) {
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    const chain = this._ceresCausal;
    const payload = {
      schema: CERES_CAUSAL_CHAIN_SCHEMA,
      kind: String(kind || 'tick'),
      sectorId: CERES_ACTIVITY_SECTOR_ID,
      simTime: Number.isFinite(this.state && this.state.simTime) ? this.state.simTime : 0,
      cycle: chain ? chain.cycle | 0 : 0,
      activeCount: chain && Array.isArray(chain.active) ? chain.active.length : 0,
      completed: chain && Array.isArray(chain.completed) ? chain.completed.slice() : [],
      seeds: chain && chain.seeds ? { ...chain.seeds } : {},
      eventId: live && live.eventId || null,
      phase: live && live.phase || null,
      phaseIndex: live && Number.isInteger(live.phaseIndex) ? live.phaseIndex : null,
      actorSlotIds: live && Array.isArray(live.actorSlotIds) ? live.actorSlotIds.slice() : [],
      cue: live && live.cue || null,
      ...(extra && typeof extra === 'object' ? extra : {}),
    };
    this.bus.emit(CERES_CAUSAL_CHAIN_EVENT, payload);
  },

  _startCeresCausalEvent(def, simTime) {
    if (!def || !this._ceresCausal) return null;
    const phase = def.phases[0];
    const live = {
      eventId: def.id,
      phaseIndex: 0,
      phase: phase.name,
      cue: phase.cue || null,
      phaseEndsAt: simTime + phase.durationS,
      actorSlotIds: def.actorSlots.slice(),
      seeded: false,
      redirectedSlots: null,
      serviceIncidentId: null,
    };
    this._ceresCausal.active.push(live);
    // Stamp a transient presentation cue on the primary actor (not a movement intent).
    this._stampCeresCausalCue(live, true);
    if (def.id === 'ev_disabled_hauler_recovery') {
      const incident = this._beginCeresDisabledHaulerIncident();
      live.serviceIncidentId = incident && incident.incidentId || null;
    }
    if (def.id === 'ev_tender_services_miner') {
      const incident = this._beginCeresTenderServiceIncident();
      live.serviceIncidentId = incident && incident.incidentId || null;
    }
    this._applyCeresCausalJobHints(def, live, live.phase);
    this._emitCeresCausalReceipt(live, 'event_start');
    return live;
  },

  _stampCeresCausalCue(live, active) {
    if (!live || !Array.isArray(live.actorSlotIds)) return;
    for (let i = 0; i < live.actorSlotIds.length; i++) {
      const bound = this._ceresCausalActorBySlot(live.actorSlotIds[i]);
      if (!bound || !bound.entity || !bound.entity.data) continue;
      if (active) {
        bound.entity.data.ceresCausalEventId = live.eventId;
        bound.entity.data.ceresCausalPhase = live.phase;
        bound.entity.data.ceresCausalCue = live.cue;
      } else if (bound.entity.data.ceresCausalEventId === live.eventId) {
        delete bound.entity.data.ceresCausalEventId;
        delete bound.entity.data.ceresCausalPhase;
        delete bound.entity.data.ceresCausalCue;
      }
    }
  },

  _setCeresCausalDisabled(slotId, disabled) {
    const bound = this._ceresCausalActorBySlot(slotId);
    if (!bound || !bound.entity || !bound.entity.data) return;
    if (disabled === true) bound.entity.data.ceresCausalDisabled = true;
    else delete bound.entity.data.ceresCausalDisabled;
    // Do not write rec.ceresCausalDisabled — nothing reads it; save-envelope hygiene.
  },

  /**
   * Route a cast actor's job toward a subject (or reaffirm the authored cycle) via npcJobsRuntime.
   * Movement stays job-owned; we only assign/redirect jobs. Tender is not traffic job-owned.
   */
  _applyCeresCausalJobHints(def, live, phaseName) {
    if (!def || !live || !Array.isArray(def.jobHints) || !def.jobHints.length) return;
    for (let i = 0; i < def.jobHints.length; i++) {
      const hint = def.jobHints[i];
      if (!hint || !Array.isArray(hint.phases) || !hint.phases.includes(phaseName)) continue;
      if (hint.reaffirm === true) {
        this._reaffirmCeresCausalActorJob(hint.actorSlotId);
        continue;
      }
      if (hint.subjectSlotId) {
        this._redirectCeresCausalActorJob(hint.actorSlotId, hint.subjectSlotId, live);
      }
    }
  },

  _reaffirmCeresCausalActorJob(actorSlotId) {
    const entry = CERES_ACTIVITY_CAST_BY_SLOT_ID.get(actorSlotId);
    if (!entry || entry.service) return false;
    const bound = this._ceresCausalActorBySlot(actorSlotId);
    if (!bound || !bound.entity) return false;
    const entity = bound.entity;
    if (!entity.data || !entity.data.jobId) {
      return !!this._assignCeresActivityJob(entity, entry);
    }
    // Already job-owned — leave the existing cycle alone.
    return true;
  },

  _redirectCeresCausalActorJob(actorSlotId, subjectSlotId, live) {
    const entry = CERES_ACTIVITY_CAST_BY_SLOT_ID.get(actorSlotId);
    if (!entry || entry.service || !entry.slot || !CERES_ACTIVITY_JOB_KINDS.has(entry.slot.jobKind)) {
      return false; // no traffic job seam (e.g. tender) — stamp-only
    }
    const actorBound = this._ceresCausalActorBySlot(actorSlotId);
    if (!actorBound || !actorBound.entity || !actorBound.entity.pos) return false;
    const actorEntity = actorBound.entity;
    const subjectBound = this._ceresCausalActorBySlot(subjectSlotId);
    if (!subjectBound || !subjectBound.entity || !subjectBound.entity.pos) return false;
    const subjectEntity = subjectBound.entity;
    const getJob = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.get;
    const release = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.release;
    const assign = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.assign;
    const worldRecordId = actorEntity.data && actorEntity.data.worldRecordId;
    const jobId = (actorEntity.data && actorEntity.data.jobId)
      || (worldRecordId ? `job:${worldRecordId}` : null);
    const redirected = Array.isArray(live.redirectedSlots) ? live.redirectedSlots : null;
    if (redirected) {
      for (let i = 0; i < redirected.length; i++) {
        const record = redirected[i];
        const slotId = typeof record === 'string' ? record : record && record.slotId;
        if (slotId === actorSlotId) return true;
      }
    }

    if (typeof assign !== 'function') return false;
    const priorJobId = actorEntity.data && actorEntity.data.jobId || jobId || null;
    const priorJobEntry = typeof getJob === 'function' && priorJobId ? getJob(priorJobId) : null;
    if (typeof release === 'function' && jobId) release(jobId);
    if (actorEntity.data) actorEntity.data.jobId = null;
    const subjectPos = { x: subjectEntity.pos.x, z: subjectEntity.pos.z };
    const dx = subjectPos.x - actorEntity.pos.x;
    const dz = subjectPos.z - actorEntity.pos.z;
    const distance = Math.hypot(dx, dz);
    const durationS = 25;
    const speed = Number.isFinite(distance) && distance > 0
      ? Math.max(12, distance / durationS)
      : 40;
    const spec = {
      kind: entry.slot.jobKind,
      sectorId: CERES_ACTIVITY_SECTOR_ID,
      speed,
      route: [
        {
          id: `causal:${live.eventId}:origin`,
          label: `causal:${live.eventId}:origin`,
          pos: { x: actorEntity.pos.x, z: actorEntity.pos.z },
        },
        {
          id: `causal:${live.eventId}:subject`,
          label: `causal:${live.eventId}:subject`,
          pos: { x: subjectPos.x, z: subjectPos.z },
          targetRef: `actor:${subjectSlotId}`,
        },
      ],
    };
    const assigned = assign(actorEntity, spec);
    if (!assigned) {
      // Real-target actors reject non-canonical routes; restore the prior job id without going
      // through _assignCeresActivityJob (that path mints a freight manifest for empty haulers).
      if (actorEntity.data && priorJobId) actorEntity.data.jobId = priorJobId;
      const byId = this.state && this.state.npcJobs && this.state.npcJobs.byId;
      if (priorJobId && priorJobEntry && byId && typeof byId === 'object') byId[priorJobId] = priorJobEntry;
      return false;
    }
    if (!live.redirectedSlots) live.redirectedSlots = [];
    live.redirectedSlots.push({
      slotId: actorSlotId,
      priorJobId,
      priorJobEntry,
      assignedJobId: actorEntity.data && actorEntity.data.jobId || assigned,
    });
    return true;
  },

  /**
   * The salvor's stack phase spills its cutting count as real ore pickups at the wreck — the
   * stripping aftermath the player can dive into and grab. Deterministic spread (hash32, no
   * shared-rng consumption), TTL-bounded, once per link (the cutter stacks once per cycle).
   */
  _spillCeresCutterCount(live) {
    if (!live || live.countSpilled) return;
    const bound = this._ceresCausalActorBySlot(CERES_CATHEDRAL_SALVOR_SLOT_ID);
    if (!bound || !bound.entity || !bound.entity.pos) return;
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    for (let index = 0; index < CERES_CUTTER_SPILL_PICKUPS; index++) {
      const angle = (hash32(live.eventId, index, 'stack-spill') % 6284) / 1000;
      const radius = 10 + (hash32(live.eventId, index, 'stack-radius') % 9);
      this.helpers.spawnEntity({
        type: 'pickup',
        pos: {
          x: bound.entity.pos.x + Math.cos(angle) * radius,
          z: bound.entity.pos.z + Math.sin(angle) * radius,
        },
        vel: { x: Math.cos(angle) * 6, z: Math.sin(angle) * 6 },
        radius: 2.4, mass: 0.4, collides: true,
        data: {
          kind: 'ore', commodityId: 'cmdty_scrap_metal', amount: CERES_CUTTER_SPILL_QTY,
          despawnAt: now + CERES_CUTTER_SPILL_TTL_S,
          ceresSpillSource: 'ev_cutter_strips_wreck',
        },
      });
    }
    live.countSpilled = true;
  },

  /**
   * ev_cargo_capsule_launch's launch phase: the refinery's outbound batch as one real pickup on a
   * fixed ballistic leg. The bearing is a hash32 of the event id — the launcher's scheduled lane,
   * identical across seeds and cycles without consuming shared rng. Standard pickup pipeline: the
   * collecting player owns the cargo write, exactly like the cutter spill; the TTL bounds the exit
   * leg so the lane never accumulates capsules. No launch face resolvable → the link completes as
   * the catalog's fallback (the stage beat played; nothing left the face).
   */
  _launchCeresCargoCapsule(live) {
    if (!live || live.capsuleLaunched) return;
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return;
    const stations = this._sectorStations();
    let station = null;
    for (let i = 0; i < stations.length; i++) {
      const candidate = stations[i];
      if (candidate && candidate.alive !== false && candidate.pos
        && candidate.data && candidate.data.stationId === 'station_ceres') {
        station = candidate;
        break;
      }
    }
    if (!station) return;
    const bearing = (hash32('ev_cargo_capsule_launch', 0, 'capsule-leg') % 6284) / 1000;
    const launchDist = (station.radius || 30) + CERES_CAPSULE_LAUNCH_CLEARANCE_WU;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    const entity = this.helpers.spawnEntity({
      type: 'pickup',
      pos: {
        x: station.pos.x + Math.cos(bearing) * launchDist,
        z: station.pos.z + Math.sin(bearing) * launchDist,
      },
      vel: {
        x: Math.cos(bearing) * CERES_CAPSULE_COAST_SPEED_WU_S,
        z: Math.sin(bearing) * CERES_CAPSULE_COAST_SPEED_WU_S,
      },
      radius: 2.4, mass: 0.6, collides: true,
      data: {
        kind: 'ore',
        commodityId: 'cmdty_refined_metals',
        amount: CERES_CAPSULE_BATCH_U,
        name: 'Refinery Outbound Capsule',
        despawnAt: now + CERES_CAPSULE_TTL_S,
        ceresCapsuleSource: 'ev_cargo_capsule_launch',
      },
    });
    if (entity) live.capsuleLaunched = true;
  },

  _restoreCeresCausalJobs(live) {
    if (!live || !Array.isArray(live.redirectedSlots) || !live.redirectedSlots.length) return;
    const release = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.release;
    for (let i = 0; i < live.redirectedSlots.length; i++) {
      const redirected = live.redirectedSlots[i];
      const slotId = typeof redirected === 'string' ? redirected : redirected && redirected.slotId;
      const entry = CERES_ACTIVITY_CAST_BY_SLOT_ID.get(slotId);
      if (!entry || entry.service) continue;
      const bound = this._ceresCausalActorBySlot(slotId);
      if (!bound || !bound.entity) continue;
      const entity = bound.entity;
      const assignedJobId = redirected && typeof redirected === 'object' && redirected.assignedJobId
        ? redirected.assignedJobId
        : entity.data && entity.data.jobId;
      if (typeof release === 'function' && assignedJobId) release(assignedJobId);
      if (entity.data) {
        const priorJobId = redirected && typeof redirected === 'object' ? redirected.priorJobId : null;
        const priorJobEntry = redirected && typeof redirected === 'object' ? redirected.priorJobEntry : null;
        const byId = this.state && this.state.npcJobs && this.state.npcJobs.byId;
        if (priorJobId && priorJobEntry && byId && typeof byId === 'object') byId[priorJobId] = priorJobEntry;
        entity.data.jobId = priorJobId || null;
      }
    }
    live.redirectedSlots = null;
  },

  _applyCeresCausalPhaseEffects(def, live, phaseName) {
    if (!def || !live) return;
    // Choreography-only for every link except two authored exceptions: the salvor's stack phase
    // spills its cutting count as real pickups at the wreck (catalog: "scrap pickups persist"),
    // and the capsule launch puts the refinery's outbound batch on the lane as one real pickup
    // (see _launchCeresCargoCapsule). Both ride the standard pickup pipeline — the collecting
    // player owns the cargo write, exactly like the disabled-hauler spill — so traffic mints no
    // cargo onto any hull.
    if (def.id === 'ev_cutter_strips_wreck' && phaseName === 'stack') {
      this._spillCeresCutterCount(live);
    }
    if (def.id === 'ev_cargo_capsule_launch' && phaseName === 'launch') {
      this._launchCeresCargoCapsule(live);
    }
    this._applyCeresCausalJobHints(def, live, phaseName);
    void phaseName;
  },

  _seedCeresCausalEvent(def, live) {
    if (!def || !live || live.seeded || !this._ceresCausal) return;
    if (live.phase !== def.seedAtPhase) return;
    live.seeded = true;
    // Marks the NATURAL seed-at-phase path (vs _completeCeresCausalEvent's anti-softlock forced
    // seed, which fakes seeded on interrupts). The calving's fresh-face re-arm keys on this flag:
    // only a calving that actually reached its calve phase may re-arm the seam window.
    live.phaseSeeded = true;
    this._plantCeresCausalSeeds(def);
    this._openCeresRichSeamOpportunity(live);
    this._applyCeresCausalPhaseEffects(def, live, live.phase);
    this._emitCeresCausalReceipt(live, 'seed', {
      seeded: def.seeds.slice(),
    });
  },

  _completeCeresCausalEvent(live, outcome = 'complete') {
    if (!live || !this._ceresCausal) return;
    const def = CERES_CAUSAL_CHAIN_BY_ID.get(live.eventId);
    // Plant seeds and count toward re-arm on EVERY terminal outcome so an interrupted link degrades
    // the chain rather than killing it (fallback/abort must not soft-lock later requires).
    // Interrupt outcomes prefer interruptSeeds (alternate aftermath story) when authored.
    if (def && !live.seeded) {
      live.seeded = true;
      live.phase = def.seedAtPhase;
      const seeded = this._plantCeresCausalOutcomeSeeds(def, outcome);
      this._openCeresRichSeamOpportunity(live);
      this._emitCeresCausalReceipt(live, 'seed', {
        seeded: Array.isArray(seeded) ? seeded.slice() : [],
        forced: outcome !== 'complete',
      });
    } else if (live.phaseSeeded === true && live.eventId === 'ev_rock_calving') {
      // Single-shot loss edge: if the strike window was still live at the calve seed, the fresh-face
      // open was refused and latched off above. Retry once at completion — the opener is a no-op
      // while any window is live, so this fires only when the prior window has since resolved.
      // A calving interrupted AFTER its calve phase also qualifies: the rock did split.
      this._openCeresRichSeamOpportunity(live);
    }
    this._restoreCeresCausalJobs(live);
    this._stampCeresCausalCue(live, false);
    // Belt-and-suspenders: wipe all stamp keys on participants even if actors are briefly absent.
    if (live.actorSlotIds) {
      for (let i = 0; i < live.actorSlotIds.length; i++) {
        const slotId = live.actorSlotIds[i];
        const freighters = this.state && this.state.traffic && this.state.traffic.freighters;
        if (Array.isArray(freighters)) {
          for (let j = 0; j < freighters.length; j++) {
            const rec = freighters[j];
            if (!rec || rec.activityActorSlotId !== slotId) continue;
            if (Object.prototype.hasOwnProperty.call(rec, 'ceresCausalDisabled')) {
              delete rec.ceresCausalDisabled;
            }
            const entity = this.state.entities && this.state.entities.get(rec.id);
            if (entity && entity.data) this._wipeCeresCausalDataKeys(entity.data);
          }
        }
      }
    }
    const active = this._ceresCausal.active;
    const idx = active.indexOf(live);
    if (idx >= 0) active.splice(idx, 1);
    if (!this._ceresCausal.completed.includes(live.eventId)) {
      this._ceresCausal.completed.push(live.eventId);
    }
    this._emitCeresCausalReceipt(live, outcome === 'complete' ? 'event_complete' : 'event_interrupt', {
      outcome,
    });
  },

  _advanceCeresCausalLive(live, simTime) {
    if (!live || !this._ceresCausal) return;
    const def = CERES_CAUSAL_CHAIN_BY_ID.get(live.eventId);
    if (!def) {
      this._completeCeresCausalEvent(live, 'abort');
      return;
    }
    if (def.id === 'ev_tender_services_miner') {
      const incident = this._activeCeresTenderServiceIncident();
      if (!incident || (live.serviceIncidentId && incident.incidentId !== live.serviceIncidentId)) {
        this._completeCeresCausalEvent(live, 'fallback');
        return;
      }
      this._stepCeresTenderServiceIncident(0);
      if (incident.state === 'succeeded') {
        live.phaseIndex = 3;
        live.phase = 'first_light';
        live.cue = 'blind_cone';
        this._stampCeresCausalCue(live, true);
        this._completeCeresCausalEvent(live, 'complete');
      } else if (incident.state === 'failed') {
        this._completeCeresCausalEvent(live, 'fallback');
      } else {
        const phaseIndex = incident.state === 'impair' ? 0
          : incident.state === 'approach' ? 1
            : incident.state === 'holding' || incident.state === 'repair' ? 2
              : 0;
        const phase = def.phases[phaseIndex];
        if (live.phaseIndex !== phaseIndex) {
          live.phaseIndex = phaseIndex;
          live.phase = phase.name;
          live.cue = phase.cue || null;
          this._stampCeresCausalCue(live, true);
          this._emitCeresCausalReceipt(live, 'phase', { incidentId: incident.incidentId });
        }
      }
      return;
    }
    if (def.id === 'ev_disabled_hauler_recovery') {
      const incident = this._activeCeresDisabledHaulerIncident()
        || this.state.traffic && this.state.traffic.ceresDisabledHaulerIncident;
      if (!incident || (live.serviceIncidentId && incident.incidentId !== live.serviceIncidentId)) {
        this._completeCeresCausalEvent(live, 'fallback');
        return;
      }
      this._stepCeresDisabledHaulerIncident(0);
      if (incident.state === 'repaired' || incident.state === 'recovered') {
        this._completeCeresCausalEvent(live, 'complete');
      } else if (CERES_DISABLED_HAULER_TERMINAL_STATES.has(incident.state)) {
        this._completeCeresCausalEvent(live, 'fallback');
      } else {
        const phaseIndex = incident.state === 'impair' || incident.state === 'distress' ? 1
          : incident.state === 'player_recovery' || incident.state === 'responder_approach' ? 2
            : 3;
        const phase = def.phases[phaseIndex];
        if (live.phaseIndex !== phaseIndex) {
          live.phaseIndex = phaseIndex;
          live.phase = phase.name;
          live.cue = phase.cue || null;
          this._stampCeresCausalCue(live, true);
          this._emitCeresCausalReceipt(live, 'phase', { incidentId: incident.incidentId });
        }
      }
      return;
    }
    // Primary-actor death is the catalog interruption path; fall back and free the concurrency slot.
    // Seeds still plant (see _completeCeresCausalEvent) so the chain degrades link-by-link.
    if (!this._ceresCausalRequiredActorsLive(def)) {
      this._completeCeresCausalEvent(live, 'fallback');
      return;
    }
    // One phase step per tick at most (rebase caps multi-step catch-up).
    if (simTime < live.phaseEndsAt) return;
    this._seedCeresCausalEvent(def, live);
    const nextIndex = live.phaseIndex + 1;
    if (nextIndex >= def.phases.length) {
      this._completeCeresCausalEvent(live, 'complete');
      return;
    }
    const next = def.phases[nextIndex];
    live.phaseIndex = nextIndex;
    live.phase = next.name;
    live.cue = next.cue || null;
    live.phaseEndsAt = simTime + next.durationS;
    this._stampCeresCausalCue(live, true);
    this._applyCeresCausalPhaseEffects(def, live, live.phase);
    this._seedCeresCausalEvent(def, live);
    this._emitCeresCausalReceipt(live, 'phase');
  },

  _tryStartNextCeresCausalEvents(simTime) {
    const chain = this._ceresCausal;
    if (!chain) return;
    if (simTime < chain.nextEligibleAt) return;
    while (chain.active.length < CERES_CAUSAL_CHAIN_MAX_CONCURRENT
      && chain.nextIndex < CERES_CAUSAL_CHAIN.length) {
      const def = CERES_CAUSAL_CHAIN[chain.nextIndex];
      if (!this._ceresCausalSeedsReady(def.requires)) {
        // Anti-softlock with divergent interrupt seeds: an earlier interrupt may have withheld
        // this link's seed while killing the cast that would have produced it. Terminal cast
        // loss still advances (same plant policy as the live-check skip below).
        //
        // When the salvor branch is already open (aftermath_open) a sequential mid-chain seed
        // will never arrive — skip the superseded link with its interrupt seeds so the cycle
        // still completes. The cutter itself is the aftermath consumer and is not skipped here.
        const supersededByAftermath = chain.seeds
          && chain.seeds.aftermath_open === true
          && def.id !== 'ev_cutter_strips_wreck';
        const successfulService = def.id === 'ev_cutter_strips_wreck'
          && chain.seeds && chain.seeds.miner_serviced === true;
        if (this._ceresCausalRequiredActorsTerminallyGone(def) || supersededByAftermath || successfulService) {
          const seeded = this._plantCeresCausalOutcomeSeeds(def, 'skip_terminal_cast');
          if (!chain.completed.includes(def.id)) chain.completed.push(def.id);
          this._emitCeresCausalReceipt(null, 'event_interrupt', {
            outcome: successfulService
              ? 'skip_service_success'
              : supersededByAftermath && !this._ceresCausalRequiredActorsTerminallyGone(def)
              ? 'skip_superseded'
              : 'skip_terminal_cast',
            eventId: def.id,
            seeded: Array.isArray(seeded) ? seeded.slice() : [],
          });
          chain.nextIndex += 1;
          continue;
        }
        break;
      }
      // Do not start a second copy of a still-active or already-completed event in this cycle.
      if (chain.completed.includes(def.id)
        || chain.active.some((live) => live && live.eventId === def.id)) {
        chain.nextIndex += 1;
        continue;
      }
      if (!this._ceresCausalRequiredActorsLive(def)) {
        // Terminal cast loss: plant seeds and advance so the chain never waits forever on a
        // destroyed hull. Transient single-tick absence keeps waiting (break).
        if (this._ceresCausalRequiredActorsTerminallyGone(def)) {
          const seeded = this._plantCeresCausalOutcomeSeeds(def, 'skip_terminal_cast');
          if (!chain.completed.includes(def.id)) chain.completed.push(def.id);
          this._emitCeresCausalReceipt(null, 'event_interrupt', {
            outcome: 'skip_terminal_cast',
            eventId: def.id,
            seeded: Array.isArray(seeded) ? seeded.slice() : [],
          });
          chain.nextIndex += 1;
          continue;
        }
        break;
      }
      this._startCeresCausalEvent(def, simTime);
      chain.nextIndex += 1;
    }
    if (chain.nextIndex >= CERES_CAUSAL_CHAIN.length
      && chain.active.length === 0
      && chain.completed.length >= CERES_CAUSAL_CHAIN.length) {
      // Full cycle resolved with no player input. Gap, then re-arm from the seam strike again.
      // The pocket's story rides the flight news channel: which cycle resolved decides the line
      // (aftermath branch opened = loss story; clean service = clean shift). aftermath_open is the
      // honest discriminator — the cutter is in `completed` on both paths (skipped on success).
      // The loss line leads with the casualty, not the strip: the cutter can be killed mid-strip
      // and the cycle still resolve, so "strips" would sometimes claim work that never happened.
      const aftermathRan = chain.seeds.aftermath_open === true;
      this.bus.emit('news:publish', {
        text: aftermathRan
          ? 'Ceres refinery writes off another seam casualty at the cathedral wreck.'
          : 'Ceres refinery logs another clean seam shift.',
        kind: 'ceres_seam_story',
        sourceRef: 'traffic:ceres-causal-chain',
        channelId: 'news',
        stationId: 'station_ceres',
        sectorId: CERES_ACTIVITY_SECTOR_ID,
        cycle: (chain.cycle | 0) + 1,
      });
      chain.cycle = (chain.cycle | 0) + 1;
      chain.nextIndex = 0;
      chain.completed = [];
      chain.seeds = Object.create(null);
      chain.nextEligibleAt = simTime + CERES_CAUSAL_CHAIN_CYCLE_GAP_S;
      this._emitCeresCausalReceipt(null, 'cycle_complete', {
        cycle: chain.cycle,
        nextEligibleAt: chain.nextEligibleAt,
      });
    }
  },

  _stepCeresCausalChain(dt) {
    const chain = this._ensureCeresCausalChain('step');
    if (!chain) return;
    this._rehydrateCeresCausalHandoffSeeds();
    const simTime = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    // Advance active links first so a finishing seed can admit the next link in the same step.
    if (Array.isArray(chain.active) && chain.active.length) {
      const snapshot = chain.active.slice();
      for (let i = 0; i < snapshot.length; i++) {
        if (chain.active.includes(snapshot[i])) this._advanceCeresCausalLive(snapshot[i], simTime);
      }
    }
    this._tryStartNextCeresCausalEvents(simTime);
    // dt is accepted for call-site symmetry with traffic.update; phase ends are absolute simTime.
    void dt;
  },

  /** Test/support seam: return a frozen snapshot of the transient chain ledger. */
  getCeresCausalChainSnapshot() {
    const chain = this._ceresCausal;
    if (!chain) return null;
    return Object.freeze({
      schema: chain.schema,
      cycle: chain.cycle | 0,
      nextIndex: chain.nextIndex | 0,
      activeCount: Array.isArray(chain.active) ? chain.active.length : 0,
      active: Object.freeze((chain.active || []).map((live) => Object.freeze({
        eventId: live.eventId,
        phase: live.phase,
        phaseIndex: live.phaseIndex,
        cue: live.cue,
        phaseEndsAt: live.phaseEndsAt,
        actorSlotIds: Object.freeze((live.actorSlotIds || []).slice()),
        seeded: live.seeded === true,
      }))),
      completed: Object.freeze((chain.completed || []).slice()),
      seeds: Object.freeze({ ...(chain.seeds || {}) }),
      nextEligibleAt: chain.nextEligibleAt,
    });
  },

  _onNpcJobUnload(intent) {
    const ceresOwned = this._ceresActivityIntentClaimsOwnership(intent);
    const actorContext = this._ceresActivityActorContext(intent);
    if (ceresOwned) {
      const context = this._ceresActivityActionContext(intent, 'unload', actorContext);
      return context ? this._applyCeresActivityAction(context, intent) : false;
    }
    if (!intent || intent.completed !== true) return false;

    // General salvor: present the conserved hold to the economy owner. Traffic never writes a
    // market; it clears custody only after the synchronous intake acknowledgement says the exact
    // lot was accepted (including an idempotent duplicate acknowledgement).
    if (intent.kind === 'salvor') {
      const context = this._jobTrafficContext(intent, 'salvor');
      if (!context) return false;
      const destination = typeof intent.destination === 'string' ? intent.destination : '';
      if (!destination.startsWith('yard:') || destination.length <= 5) return false;
      const manifest = context.entity.data && context.entity.data.cargoManifest
        || context.rec.manifest;
      if (!manifest || !Array.isArray(manifest.lines)) return false;
      if (!(manifest.totalQty > 0)) return true; // already empty: no custody commit is required

      const manifestId = typeof manifest.manifestId === 'string' && manifest.manifestId
        ? manifest.manifestId
        : null;
      const lotId = typeof manifest.lotId === 'string' && manifest.lotId
        ? manifest.lotId
        : manifestId;
      const sourceSeq = Number.isSafeInteger(manifest.salvageSeq) && manifest.salvageSeq >= 0
        ? manifest.salvageSeq
        : (Number.isSafeInteger(intent.seq) && intent.seq >= 0 ? intent.seq : 0);
      const lines = manifest.lines.map((line) => ({
        commodityId: line && line.commodityId,
        qty: line && line.qty,
      }));
      const copiedQty = lines.reduce(
        (sum, line) => sum + (Number.isSafeInteger(line.qty) && line.qty > 0 ? line.qty : 0),
        0,
      );
      if (!manifestId || !lotId || copiedQty !== manifest.totalQty
        || lines.some((line) => typeof line.commodityId !== 'string' || !line.commodityId
          || !Number.isSafeInteger(line.qty) || line.qty <= 0)) return false;
      if (!this.bus || typeof this.bus.emit !== 'function') return false;

      const yardId = destination.slice(5);
      const payload = {
        intakeId: `salvage-intake:${context.worldRecordId}:${sourceSeq}:${manifestId}`,
        jobId: context.jobId,
        salvorId: context.entity.id,
        yardId,
        stationId: yardId,
        sectorId: (this.state.world && this.state.world.currentSectorId) || null,
        seq: Number.isSafeInteger(intent.seq) && intent.seq >= 0 ? intent.seq : 0,
        manifestId,
        lotId,
        lines,
      };
      this.bus.emit('salvage:npcUnload', payload);
      if (!payload.intakeResult || payload.intakeResult.ok !== true) return false;

      const emptied = this._emptySalvorManifest(context.entity, intent.seq | 0);
      this._setTrafficManifest(context.entity, context.rec, emptied);
      return true;
    }

    if (intent.kind !== 'hauler' && intent.kind !== 'miner') return false;
    const context = intent.kind === 'miner'
      ? this._jobTrafficContext(intent, 'miner', ['miner', 'ore_carrier'])
      : this._jobTrafficContext(intent, 'hauler', ['hauler', 'courier', 'shuttle', 'tug']);
    if (!context) return false;

    const destination = typeof intent.destination === 'string' ? intent.destination : '';
    const prefix = intent.kind === 'miner' ? 'home:' : 'dest:';
    if (!destination.startsWith(prefix) || destination.length <= prefix.length) return false;
    const stationId = destination.slice(prefix.length);
    const station = this._sectorStations().find((candidate) => stationIdentity(candidate) === stationId);
    if (!station) return false;

    const priorityItinerary = intent.kind === 'hauler' && context.rec.role === 'courier'
      ? this._priorityCourierItinerary(context.entity)
      : null;
    if (intent.kind === 'hauler' && context.rec.role === 'courier') {
      const marker = intent.payload && intent.payload.priorityCourierService;
      if (!priorityItinerary || !marker || typeof marker !== 'object'
        || marker.schema !== PRIORITY_COURIER_JOB_SCHEMA
        || marker.serviceId !== PRIORITY_COURIER_SERVICE.id
        || marker.legSeq !== priorityItinerary.legSeq
        || stationId !== priorityItinerary.destinationStationId) return false;
    }

    const manifest = intent.kind === 'hauler' && intent.payload && intent.payload.manifest;
    const applied = this._emitArrival(context.entity, context.rec, station, {
      dockSeq: Number.isSafeInteger(intent.seq) && intent.seq >= 0 ? intent.seq : undefined,
      manifest,
    });
    if (applied && priorityItinerary) {
      this._advancePriorityCourierLeg(context.entity, context.rec, this._sectorStations(), priorityItinerary);
    }
    if (applied && intent.kind === 'miner') {
      this._setTrafficManifest(
        context.entity,
        context.rec,
        this._buildMinerManifest(
          context.entity,
          intent.seq,
          null,
          0,
          context.rec.role === 'ore_carrier' ? 'ore_carrier' : 'miner',
        ),
      );
    }
    return applied;
  },

  _onNpcJobHold(intent) {
    if (!this._ceresActivityIntentClaimsOwnership(intent)) return false;
    const actorContext = this._ceresActivityActorContext(intent);
    if (!actorContext) return false;
    const context = this._ceresActivityActionContext(intent, 'hold', actorContext);
    return context ? this._applyCeresActivityAction(context, intent) : false;
  },

  /**
   * Owner-safe loss on freighter kill: scarcity pressure + named news payload.
   * Idempotent per freighterKey. Does not write wallet/cargo/rep/heat.
   */
  _onEntityKilled(p) {
    if (!p || p.id == null) return;
    this._ensureState();
    const list = this.state.traffic.freighters || [];
    let rec = null;
    let idx = -1;
    for (let i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === p.id) { rec = list[i]; idx = i; break; }
    }
    const lostWorldSiteRoute = !!(rec && rec.worldSiteRoute);
    const lostClaimTravelRoute = !!(rec && rec.claimTravelRoute);
    const ent = this.state.entities && this.state.entities.get && this.state.entities.get(p.id);
    const role = (rec && rec.role)
      || (ent && ent.data && ent.data.trafficRole)
      || null;
    const killedWorldRecordId = (ent && ent.data && ent.data.worldRecordId)
      || (rec && rec.worldRecordId)
      || null;
    // The source ledger, not this traffic system, owns the durable claim. Releasing through its
    // helper happens before any future cutter can consider the exact Vesta wreck again.
    const killedSalvageSource = ent && ent.data && typeof ent.data.salvageSource === 'string'
      ? ent.data.salvageSource
      : null;
    if (killedSalvageSource && killedWorldRecordId) {
      this._releaseSalvageSourceClaim({ sourceKey: killedSalvageSource }, killedWorldRecordId);
    }
    const disabledHaulerIncident = this._activeCeresDisabledHaulerIncident();
    if (disabledHaulerIncident
      && disabledHaulerIncident.haulerWorldRecordId === killedWorldRecordId) {
      const pendingAbandonment = disabledHaulerIncident.pendingAbandonmentReason;
      delete disabledHaulerIncident.pendingAbandonmentReason;
      const outcome = disabledHaulerIncident.choice === 'abandon'
        || pendingAbandonment
        ? 'abandoned'
        : 'destroyed';
      this._terminalizeCeresDisabledHauler(disabledHaulerIncident, outcome, 'participant_destroyed');
    }
    const handoff = this.state.traffic.ceresMinerHaulerHandoff;
    if (handoff && handoff.minerWorldRecordId === killedWorldRecordId
      && this._preserveCeresHandoffAfterMinerLoss(handoff)) {
      // The miner-held remainder falls through to the ordinary loss owner below. The live hauler's
      // already-transferred fragment remains an independently conserved delivery obligation.
    } else if (handoff && (handoff.minerWorldRecordId === killedWorldRecordId
      || handoff.haulerWorldRecordId === killedWorldRecordId)) {
      this._interruptCeresMinerHaulerHandoff(handoff, 'participant_destroyed', ent);
    }
    // The service incident owns only its two temporary job-control leases. Death, wreck creation,
    // freight loss, and any durable world outcome remain with their existing owners below; this
    // branch just guarantees neither job remains borrowed after either exact participant dies.
    const serviceIncident = this._activeCeresTenderServiceIncident();
    if (serviceIncident && (serviceIncident.minerWorldRecordId === killedWorldRecordId
      || serviceIncident.tenderWorldRecordId === killedWorldRecordId)) {
      this._failCeresTenderServiceIncident(serviceIncident, 'participant_destroyed');
    }
    // Release any wreck/payload reservation so another cutter (or the player) can take it.
    if (ent && ent.data && ent.data.worldRecordId) {
      const claimId = ent.data.worldRecordId;
      for (const body of this.state.entityList || []) {
        if (body && body.data && body.data.salvorClaimedBy === claimId) {
          this._clearSalvorClaim(body, claimId);
        }
      }
    }
    if (!rec && !(ent && ent.data && ent.data.trafficRole)) return;
    // The civic liner is passenger custody, never freight. Its loss stops the one durable
    // service and publishes its own exactly-once receipt before any freight/economy loss branch.
    const passengerItinerary = ent && this._passengerLinerClaim(ent);
    if (passengerItinerary && (rec && rec.passengerLinerService === PASSENGER_LINER_SERVICE.id
      || this._passengerLinerIdIsSuspended(passengerItinerary.worldRecordId))) {
      if (rec) {
        this._settlePassengerLinerLeg(ent, rec, passengerItinerary, 'LOST', null);
        this.state.traffic.passengerLinerSuspendedIds = compactStableIds([
          ...(this.state.traffic.passengerLinerSuspendedIds || []), passengerItinerary.worldRecordId,
        ], PASSENGER_LINER_SUSPENSION_CAP);
        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit('traffic:passengerLinerSuspended', {
            serviceId: PASSENGER_LINER_SERVICE.id,
            worldRecordId: passengerItinerary.worldRecordId,
            receiptId: passengerItinerary.custody && passengerItinerary.custody.receiptId,
          });
        }
        if (idx >= 0) list.splice(idx, 1);
        const activeIdx = this._active.indexOf(p.id);
        if (activeIdx >= 0) this._active.splice(activeIdx, 1);
      }
      return;
    }
    const ceresOreCarrier = role === 'ore_carrier'
      && ((ent && ent.data && ent.data.activityActorSlotId === CERES_SEAM_MINER_SLOT_ID)
        || (rec && rec.activityActorSlotId === CERES_SEAM_MINER_SLOT_ID));
    if (ceresOreCarrier) {
      const owner = ceresSeamMinerOwnerIdentity(ent, rec);
      if (owner) {
        const missed = missReservedRichSeamOpportunity(this.state, {
          ...owner,
          simTime: this.state.simTime,
        });
        if (missed && this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit('field:richSeamMissed', { ...missed, reason: 'owner_lost' });
        }
      }
    }
    if ((ent && ent.data && ent.data.ceresActivityCast === true)
      || (rec && rec.ceresActivityCast === true)) {
      // Cast identity is durable world state. Release its movement owner, but do not fabricate a
      // freight economy receipt: these authored marks deliberately do not claim the generic
      // field:/dest: receipt bridges.
      const recordId = (ent && ent.data && ent.data.worldRecordId)
        || (rec && rec.worldRecordId)
        || null;
      this._releaseCeresActivityJob(recordId);
      const carriedManifest = (rec && rec.manifest)
        || (ent && ent.data && ent.data.cargoManifest)
        || null;
      const ceresHandoffHauler = !!(handoff && handoff.haulerWorldRecordId === recordId
        && carriedManifest && carriedManifest.custody
        && carriedManifest.custody.handoffId === handoff.handoffId);
      if (!ceresOreCarrier && !ceresHandoffHauler) {
        if (idx >= 0) list.splice(idx, 1);
        const activeIdx = this._active.indexOf(p.id);
        if (activeIdx >= 0) this._active.splice(activeIdx, 1);
        if (lostWorldSiteRoute) {
          this._applyWorldSiteTrafficHooks(this.state.world && this.state.world.currentSectorId);
        }
        return;
      }
      // The Ore Barge and this exact transferred hauler lot both fall through to the ordinary
      // freight-loss path, which is the existing custody sink for a destroyed live manifest.
    }
    const lawLoss = lawPresenceRole(role);
    if (role && !lawLoss && !FREIGHT_TRADING_ROLES.includes(role) && !(rec && rec.manifest && rec.manifest.totalQty)) {
      // Non-trading traffic without a law record — drop tracking only.
      if (idx >= 0) list.splice(idx, 1);
      if (lostWorldSiteRoute) {
        this._applyWorldSiteTrafficHooks(this.state.world && this.state.world.currentSectorId);
      }
      if (lostClaimTravelRoute) {
        this._applyClaimTravelHooks(this.state.world && this.state.world.currentSectorId);
      }
      return;
    }

    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const freighterKey = (ent && ent.data && ent.data.worldRecordId)
      || (rec && rec.id != null ? String(rec.id) : String(p.id));
    const sectorId = p.sectorId
      || (this.state.world && this.state.world.currentSectorId)
      || null;
    const stationId = this._nearestStationId(ent && ent.pos)
      || (rec && rec.targetId && this._stationIdForEntity(rec.targetId));
    const manifest = (rec && rec.manifest)
      || (ent && ent.data && ent.data.cargoManifest)
      || buildCargoManifest({ seed, freighterKey, role: role || 'hauler', market: FREIGHT_MARKET_KEYS_FALLBACK });

    const intent = buildLossIntent({
      seed,
      freighterKey,
      freighterId: p.id,
      stationId,
      sectorId,
      manifest,
      killerId: p.killerId,
      seq: this.state.tick | 0,
    });
    if (lawLoss) {
      intent.cause = TRAFFIC_LAW_LOSS_CAUSE;
      intent.lawRole = role;
      intent.source = 'traffic_law';
      if (intent.news) {
        intent.news.cause = TRAFFIC_LAW_LOSS_CAUSE;
        intent.news.lawRole = role;
      }
    }

    const t = this.state.traffic;
    const fresh = filterNewFreightIntents([intent], t.appliedLossIds);
    if (fresh.length) {
      for (const pr of intent.pressures) {
        if (!pr.stationId) continue;
        this.bus.emit('economy:applyTradePressure', {
          stationId: pr.stationId,
          good: pr.good,
          commodityId: pr.commodityId,
          vol: pr.vol,
          sectorId: pr.sectorId,
          source: pr.source,
          cause: pr.cause,
          intentId: intent.intentId,
          freighterId: p.id,
        });
      }
      this.bus.emit('freight:loss', intent);
      if (intent.news) {
        this.bus.emit('news:headline', {
          ...intent.news,
          headline: null, // presentation may fill from newsTemplates
        });
      }
      t.appliedLossIds = mergeAppliedFreightIds(t.appliedLossIds, fresh);
    }

    if (idx >= 0) list.splice(idx, 1);
    const activeIdx = this._active.indexOf(p.id);
    if (activeIdx >= 0) this._active.splice(activeIdx, 1);
    if (lostWorldSiteRoute) {
      this._applyWorldSiteTrafficHooks(this.state.world && this.state.world.currentSectorId);
    }
    if (lostClaimTravelRoute) {
      this._applyClaimTravelHooks(this.state.world && this.state.world.currentSectorId);
    }
  },

  _nearestStationId(pos) {
    if (!pos) return null;
    const stations = this._sectorStations();
    let best = null;
    let bestD = Infinity;
    for (const s of stations) {
      if (!s || !s.pos) continue;
      const d = Math.hypot(s.pos.x - pos.x, s.pos.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best && best.data && best.data.stationId ? best.data.stationId : null;
  },

  _stationIdForEntity(entityId) {
    const e = this.state.entities && this.state.entities.get && this.state.entities.get(entityId);
    return e && e.data && e.data.stationId ? e.data.stationId : null;
  },

  _ensureState() {
    if (!this.state.traffic) this.state.traffic = { freighters: [] };
    if (!Array.isArray(this.state.traffic.freighters)) this.state.traffic.freighters = [];
    if (!Array.isArray(this.state.traffic.appliedArrivalIds)) this.state.traffic.appliedArrivalIds = [];
    if (!Array.isArray(this.state.traffic.appliedLossIds)) this.state.traffic.appliedLossIds = [];
    if (!Array.isArray(this.state.traffic.appliedMinerWorkIds)) this.state.traffic.appliedMinerWorkIds = [];
    if (!Array.isArray(this.state.traffic.appliedJobActionIds)) this.state.traffic.appliedJobActionIds = [];
    if (!Array.isArray(this.state.traffic.appliedSalvorWorkIds)) this.state.traffic.appliedSalvorWorkIds = [];
    this.state.traffic.passengerReceiptIds = compactStableIds(
      this.state.traffic.passengerReceiptIds,
      PASSENGER_LINER_RECEIPT_CAP,
    );
    this.state.traffic.passengerLinerSuspendedIds = compactStableIds(
      this.state.traffic.passengerLinerSuspendedIds,
      PASSENGER_LINER_SUSPENSION_CAP,
    );
    this.state.traffic.passengerLinerInvalidatedIds = compactStableIds(
      this.state.traffic.passengerLinerInvalidatedIds,
      PASSENGER_LINER_INVALIDATED_CAP,
    );
    const handoff = this.state.traffic.ceresMinerHaulerHandoff;
    const normalizedHandoff = normalizeCeresMinerHaulerHandoff(handoff, false);
    if (!normalizedHandoff) {
      this.state.traffic.ceresMinerHaulerHandoff = null;
    } else if (handoff.terminalizedQty == null) {
      handoff.terminalizedQty = normalizedHandoff.terminalizedQty;
    }
    const serviceIncident = this.state.traffic.ceresTenderServiceIncident;
    const normalizedServiceIncident = normalizeCeresTenderServiceIncident(serviceIncident, false);
    if (!normalizedServiceIncident) {
      this.state.traffic.ceresTenderServiceIncident = null;
    }
    const disabledHaulerIncident = this.state.traffic.ceresDisabledHaulerIncident;
    if (!normalizeCeresDisabledHaulerIncident(disabledHaulerIncident, false)) {
      this.state.traffic.ceresDisabledHaulerIncident = null;
    }
    const serviceSequence = this.state.traffic.ceresTenderServiceSequence;
    const minimumServiceSequence = normalizedServiceIncident ? normalizedServiceIncident.sequence : 0;
    if (!Number.isSafeInteger(serviceSequence) || serviceSequence < minimumServiceSequence || serviceSequence < 0) {
      this.state.traffic.ceresTenderServiceSequence = minimumServiceSequence;
    }
    if (!Number.isFinite(this.state.traffic.rngSeed) || (this.state.traffic.rngSeed >>> 0) === 0) {
      this.state.traffic.rngSeed = hash32(this.state.meta && this.state.meta.seed, 'traffic', this.state.world && this.state.world.currentSectorId);
    }
  },

  _ensureCausalLedgerSets() {
    for (const key of [
      '_pendingJobActionIds',
      '_pendingMinerWorkIds',
      '_pendingArrivalIds',
      '_committedCeresMinerWorkIds',
      '_committedCeresArrivalIds',
    ]) {
      if (!Object.hasOwn(this, key) || !(this[key] instanceof Set)) this[key] = new Set();
    }
    for (const key of [
      '_pendingJobActionTokens',
      '_pendingMinerWorkTokens',
      '_pendingArrivalTokens',
    ]) {
      if (!Object.hasOwn(this, key) || !(this[key] instanceof Map)) this[key] = new Map();
    }
    if (!Object.hasOwn(this, '_causalRunEpoch')
      || !Number.isSafeInteger(this._causalRunEpoch)
      || this._causalRunEpoch < 0) this._causalRunEpoch = 0;
    if (!Object.hasOwn(this, '_restoreEpochPending')) this._restoreEpochPending = false;
  },

  _reserveCausalId(id, idsKey, tokensKey) {
    this._ensureCausalLedgerSets();
    const ids = this[idsKey];
    const tokens = this[tokensKey];
    if (typeof id !== 'string' || !id || ids.has(id) || tokens.has(id)) return null;
    const token = Object.freeze({ id, epoch: this._causalRunEpoch });
    ids.add(id);
    tokens.set(id, token);
    return token;
  },

  _causalReservationIsCurrent(token, idsKey, tokensKey) {
    this._ensureCausalLedgerSets();
    return !!token
      && token.epoch === this._causalRunEpoch
      && this[idsKey].has(token.id)
      && this[tokensKey].get(token.id) === token;
  },

  _releaseCausalReservation(token, idsKey, tokensKey) {
    if (!this._causalReservationIsCurrent(token, idsKey, tokensKey)) return false;
    this[tokensKey].delete(token.id);
    this[idsKey].delete(token.id);
    return true;
  },

  _invalidateCausalRunEpoch() {
    this._ensureCausalLedgerSets();
    this._causalRunEpoch = this._causalRunEpoch >= Number.MAX_SAFE_INTEGER
      ? 1
      : this._causalRunEpoch + 1;
    for (const ledger of [
      this._pendingJobActionIds,
      this._pendingMinerWorkIds,
      this._pendingArrivalIds,
      this._pendingJobActionTokens,
      this._pendingMinerWorkTokens,
      this._pendingArrivalTokens,
    ]) ledger.clear();
    return this._causalRunEpoch;
  },

  _resetRngForSector(sectorId) {
    this._ensureState();
    this.state.traffic.rngSeed = hash32(this.state.meta && this.state.meta.seed, 'traffic', sectorId, this.state.tick || 0);
  },

  _rng() {
    this._ensureState();
    return drawSeeded(this.state.traffic, 'rngSeed', hash32(this.state.meta && this.state.meta.seed, 'traffic'));
  },

  serialize() {
    this._ensureState();
    return {
      schema: CERES_MINER_HAULER_SAVE_SCHEMA,
      ceresMinerHaulerHandoff: normalizeCeresMinerHaulerHandoff(
        this.state.traffic.ceresMinerHaulerHandoff,
      ),
      ceresTenderServiceIncident: normalizeCeresTenderServiceIncident(
        this.state.traffic.ceresTenderServiceIncident,
      ),
      ceresTenderServiceSequence: this.state.traffic.ceresTenderServiceSequence,
      ceresDisabledHaulerIncident: normalizeCeresDisabledHaulerIncident(
        this.state.traffic.ceresDisabledHaulerIncident,
      ),
      passengerReceiptIds: this.state.traffic.passengerReceiptIds.slice(),
      passengerLinerSuspendedIds: this.state.traffic.passengerLinerSuspendedIds.slice(),
      passengerLinerInvalidatedIds: this.state.traffic.passengerLinerInvalidatedIds.slice(),
    };
  },

  deserialize(data) {
    const previousTraffic = this.state && this.state.traffic;
    this._releaseCeresMinerHaulerHandoffControls(previousTraffic && previousTraffic.ceresMinerHaulerHandoff);
    this._releaseCeresTenderServiceControls(previousTraffic && previousTraffic.ceresTenderServiceIncident);
    this._resetCeresTenderServiceRuntime();
    this._releaseCeresDisabledHaulerControls(previousTraffic && previousTraffic.ceresDisabledHaulerIncident);
    this._resetCeresDisabledHaulerRuntime();
    this._ensureState();
    this.state.traffic.ceresMinerHaulerHandoff = data
      && !Array.isArray(data)
      && data.schema === CERES_MINER_HAULER_SAVE_SCHEMA
      ? normalizeCeresMinerHaulerHandoff(data.ceresMinerHaulerHandoff)
      : null;
    this.state.traffic.ceresTenderServiceIncident = data
      && !Array.isArray(data)
      && data.schema === CERES_MINER_HAULER_SAVE_SCHEMA
      ? normalizeCeresTenderServiceIncident(data.ceresTenderServiceIncident)
      : null;
    const incident = this.state.traffic.ceresTenderServiceIncident;
    const requestedSequence = data && !Array.isArray(data) && data.schema === CERES_MINER_HAULER_SAVE_SCHEMA
      ? data.ceresTenderServiceSequence
      : 0;
    this.state.traffic.ceresTenderServiceSequence = Number.isSafeInteger(requestedSequence)
      && requestedSequence >= (incident ? incident.sequence : 0)
      ? requestedSequence
      : (incident ? incident.sequence : 0);
    this.state.traffic.ceresDisabledHaulerIncident = data
      && !Array.isArray(data)
      && data.schema === CERES_MINER_HAULER_SAVE_SCHEMA
      ? normalizeCeresDisabledHaulerIncident(data.ceresDisabledHaulerIncident)
      : null;
    const validTrafficSave = !!(data && !Array.isArray(data) && data.schema === CERES_MINER_HAULER_SAVE_SCHEMA);
    this.state.traffic.passengerReceiptIds = compactStableIds(
      validTrafficSave ? data.passengerReceiptIds : [],
      PASSENGER_LINER_RECEIPT_CAP,
    );
    this.state.traffic.passengerLinerSuspendedIds = compactStableIds(
      validTrafficSave ? data.passengerLinerSuspendedIds : [],
      PASSENGER_LINER_SUSPENSION_CAP,
    );
    this.state.traffic.passengerLinerInvalidatedIds = compactStableIds(
      validTrafficSave ? data.passengerLinerInvalidatedIds : [],
      PASSENGER_LINER_INVALIDATED_CAP,
    );
  },

  newGame() {
    this._releaseCeresMinerHaulerHandoffControls(
      this.state && this.state.traffic && this.state.traffic.ceresMinerHaulerHandoff,
    );
    this._releaseCeresTenderServiceControls(
      this.state && this.state.traffic && this.state.traffic.ceresTenderServiceIncident,
    );
    this._resetCeresTenderServiceRuntime();
    this._releaseCeresDisabledHaulerControls(
      this.state && this.state.traffic && this.state.traffic.ceresDisabledHaulerIncident,
    );
    this._resetCeresDisabledHaulerRuntime();
    this._invalidateCausalRunEpoch();
    this._restoreEpochPending = false;
    this._active = [];
    this._ensureCausalLedgerSets();
    for (const ledger of [
      this._pendingJobActionIds,
      this._pendingMinerWorkIds,
      this._pendingArrivalIds,
      this._committedCeresMinerWorkIds,
      this._committedCeresArrivalIds,
    ]) {
      if (ledger && typeof ledger.clear === 'function') ledger.clear();
    }
    this._resetCeresCausalChain('new_game');
    this.state.traffic = {
      freighters: [],
      appliedArrivalIds: [],
      appliedLossIds: [],
      appliedMinerWorkIds: [],
      appliedJobActionIds: [],
      appliedSalvorWorkIds: [],
      ceresMinerHaulerHandoff: null,
      ceresTenderServiceIncident: null,
      ceresTenderServiceSequence: 0,
      ceresDisabledHaulerIncident: null,
      passengerReceiptIds: [],
      passengerLinerSuspendedIds: [],
      passengerLinerInvalidatedIds: [],
      rngSeed: hash32(this.state.meta && this.state.meta.seed, 'traffic', 'boot'),
    };
  },
};

function setIntent(e, moveX, moveZ, boost, fire, fireGroup, aimAngle) {
  const data = e.data || (e.data = {});
  const intent = data.intent || (data.intent = { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0 });
  intent.moveX = moveX;
  intent.moveZ = moveZ;
  intent.boost = boost;
  intent.fire = fire;
  intent.fireGroup = fireGroup;
  intent.aimAngle = aimAngle;
}

function stationIdentity(station) {
  if (!station) return null;
  const data = station.data || {};
  const id = data.stationId || data.id || station.id;
  return id == null ? null : String(id);
}

function dominantAsteroidCommodity(asteroid) {
  const data = asteroid && asteroid.data || {};
  if (typeof data.commodityId === 'string' && data.commodityId) return data.commodityId;
  const def = ASTEROID_BY_ID.get(data.typeId) || ASTEROID_BY_ID.get('ast_common_rock');
  const entries = Object.entries(def && def.oreTable || {});
  entries.sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0) || a[0].localeCompare(b[0]));
  return entries[0] && entries[0][0] || 'cmdty_silicate';
}

function entityWithWorldRecord(state, worldRecordId) {
  if (!state || !state.entities || !worldRecordId) return null;
  for (const entity of state.entities.values()) {
    if (entity && entity.alive !== false && entity.data && entity.data.worldRecordId === worldRecordId) return entity;
  }
  return null;
}

function liveEntity(state, id) {
  const entity = state && state.entities && state.entities.get && state.entities.get(id);
  return entity && entity.alive !== false ? entity : null;
}

function entityPos(entity) {
  const pos = entity && entity.pos;
  const x = Number(pos && pos.x);
  const z = Number(pos && pos.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return pos;
}

function isSurvivalCohort(entity) {
  return !!(entity && entity.data && entity.data.runCohort === 'survival');
}

function stableTrafficKey(entity) {
  return String(entity && entity.data && entity.data.worldRecordId || entity && entity.id || '');
}

function isWorldSiteTrafficFallbackRole(roleId) {
  const role = TRAFFIC_ROLES[roleId];
  return !!role && !role.orbits && !role.escorts && !role.flees;
}

function stationName(station, fallback) {
  const data = station && station.data || {};
  return String(data.name || data.label || fallback || 'Local');
}
