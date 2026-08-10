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
import { pickNamedLaneContact } from '../data/laneContacts.js';
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
import {
  CERES_ACTIVITY_POCKETS,
  CERES_ACTIVITY_SECTOR_ID,
  CERES_ACTIVITY_SERVICE_SLOTS,
} from '../data/sectorActivityPockets.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { NPC_JOB_PHASE, NPC_JOB_SCHEMA } from './npcJobs.js';

const FREIGHTER_SHIP = 'ship_mule'; // a freighter hull from data/ships.js (cargo-capable, slow)
// Core pocket density (spec2/04 §4: core 6–9 concurrent). Cap keeps perf predictable.
const MAX_PER_SECTOR = 8;
const CORE_MIN_TRAFFIC = 6;    // high-security / high-tpm cores never feel empty
const DEFAULT_TRAFFIC = 3;     // sectors without explicit trafficPerMin get a small ambient count
const SPEED = 28;              // wu/s — slow, reads as a heavy freighter
const DOCK_RANGE = 60;         // how close before "docking" (trading)
const TRADE_INTERVAL_S = 8;    // min seconds between trades per freighter (staggered)
const POCKET_CLUSTER_R = 420;  // first freighters cluster near a pocket station for sensor density
// How many neighbouring rock faces one refinery's barges will spread across before repeating. Small
// on purpose: the point is that a shift works ONE seam together, close enough that the barges share
// a frame with each other and with anything passing. See _pickWorkableAsteroidNear.
const MINER_FIELD_SPREAD_CAP = 4;
// One visible 30-second work stop cuts a bounded parcel smaller than the economy's 15u live-arrival
// ceiling. This is enough for one or two barges to contend a recovering field without strip-mining
// it faster than the player can participate.
const NPC_MINER_WORK_BATCH_U = 8;
const NPC_MINER_WORK_LEDGER_CAP = 512;
const CERES_JOB_ACTION_LEDGER_CAP = 512;
const CERES_JOB_ACTION_RECEIPT_SCHEMA = 'spaceface.trafficJobActionReceipt.v1';
const CERES_JOB_ACTION_RECEIPT_EVENT = 'traffic:jobActionReceipt';
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
              label: 'Salvage Cutter', docks: true, trades: true },
  tender:   { ship: 'ship_drifter',  team: 2, speed: 66, archetype: 'passive', weight: 6,
              label: 'Repair Tender', docks: true, trades: false },
  // PQ-045: the ore barge is its own presentation role, NOT a hauler reskin — `hauler` already
  // owns the accepted helios_span whole-ship, so a barge keyed as `hauler` would replace that
  // asset in every sector while silently wearing the "Cargo Hauler" label. `ore_carrier` has its
  // own TRAFFIC_ROLES entry and its own whole-ship binding (wholeships/ore_barge.glb), so ship,
  // team, speed, label and hull all resolve to the barge. The Ironback def was the unused
  // mining_barge hull class this trade always implied (ROLE_MATRIX row "ore carrier"). It docks
  // at stations like any bulk hull but carries no market manifest: wiring it into freight
  // causality (FREIGHT_TRADING_ROLES, economy) is a separate, deliberately excluded lane.
  ore_carrier: { ship: 'ship_ironback', team: 2, speed: 22, archetype: 'fleeing_trader', weight: 4,
              label: 'Ore Barge', docks: true, trades: false },
};

// Exported for the PQ-045 identity contract test (distinct hull + label per occupational role);
// not a new write seam — runtime ownership of role resolution is unchanged.
export { TRAFFIC_ROLES };

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

// ── PQ-045.causal-chain ──────────────────────────────────────────────────────────────────────────
// Six catalog microevents form ONE authored causal story in the Ceres reference sector. This is a
// choreography timer bound to the cast that already flies — not a generic ambient-event policy
// layer. Concurrency is hard-capped at two active links; later links wait on seeds, not on a
// cooldown/draw policy. Ledger lives on the traffic instance only (transient; out of the save
// envelope), identity keys are worldRecordSlotId / jobId, and movement stays with npcJobsRuntime.
const CERES_CAUSAL_CHAIN_SCHEMA = 'spaceface.ceresCausalChain.v1';
const CERES_CAUSAL_CHAIN_EVENT = 'traffic:ceresCausalChain';
const CERES_CAUSAL_CHAIN_MAX_CONCURRENT = 2;
const CERES_CAUSAL_CHAIN_MAX_PHASE_STEPS = 12;
const CERES_CAUSAL_RICH_YIELD_MULT = 2;
const CERES_CAUSAL_CHAIN_CYCLE_GAP_S = 45;
const CERES_CAUSAL_CHAIN = Object.freeze([
  Object.freeze({
    id: 'ev_rich_seam_strike',
    actorSlots: Object.freeze([CERES_SEAM_MINER_SLOT_ID]),
    // Starts from cast live; no prior seed.
    requires: Object.freeze([]),
    // Seeds after the strike phase so the hauler call can overlap the greed/haul window (cap=2).
    seedAtPhase: 'strike',
    seeds: Object.freeze(['rich_seam', 'miner_loaded']),
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
    seeds: Object.freeze(['ore_handoff', 'hauler_ore_manifest']),
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
    phases: Object.freeze([
      Object.freeze({ name: 'shadow', durationS: 12, cue: 'on_the_pin' }),
      Object.freeze({ name: 'lock', durationS: 10, cue: 'on_the_pin' }),
      Object.freeze({ name: 'read', durationS: 15, cue: 'on_the_pin' }),
      Object.freeze({ name: 'release', durationS: 8, cue: 'on_the_pin' }),
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
    // Early aftermath seed lets the grave salvor open while the miner is still dark for service.
    seedAtPhase: 'callout',
    seeds: Object.freeze(['aftermath_open', 'miner_serviced']),
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
    // Opens once the service callout seeds aftermath — concurrent with tender_services_miner.
    requires: Object.freeze(['aftermath_open']),
    seedAtPhase: 'stack',
    seeds: Object.freeze(['wreck_stripped', 'chain_complete']),
    phases: Object.freeze([
      Object.freeze({ name: 'survey_cut', durationS: 15, cue: 'picking_the_bones' }),
      Object.freeze({ name: 'sever', durationS: 20, cue: 'picking_the_bones' }),
      Object.freeze({ name: 'wrangle', durationS: 20, cue: 'picking_the_bones' }),
      Object.freeze({ name: 'stack', durationS: 12, cue: 'spilling_the_count' }),
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

function exactCeresRouteTargetRefMode(route, canonicalRoute) {
  if (!Array.isArray(route) || !Array.isArray(canonicalRoute)
    || route.length !== canonicalRoute.length || route.length === 0) return 'invalid';
  let absent = 0;
  let exact = 0;
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
    else return 'invalid';
  }
  if (absent === route.length) return 'legacy';
  if (exact === route.length) return 'current';
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
  if (sec.industries && (sec.industries.mining || sec.industries.refinery)) { out.miner *= 2.5; out.hauler *= 1.5; out.ore_carrier *= 2.5; }
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
    // PQ-045.causal-chain: instance-only ledger (never written into state.traffic / save).
    this._ceresCausal = null;

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
    this.bus.on('npcjobs:unload', (p) => this._onNpcJobUnload(p || {}));
    this.bus.on('npcjobs:hold', (p) => this._onNpcJobHold(p || {}));
    this.bus.on('save:restoring', () => {
      // Invalidate before the save owner starts destructive restore. Old synchronous owner stacks
      // may still unwind afterward, but their private reservation tokens no longer own this run.
      this._restoreEpochPending = true;
      this._invalidateCausalRunEpoch();
    });
    this.bus.on('save:loaded', () => {
      // Real restores already invalidated at save:restoring. Standalone fixture/compat signals still
      // form an authoritative boundary, so fail closed once without double-invalidating a real load.
      if (this._restoreEpochPending === true) this._restoreEpochPending = false;
      else this._invalidateCausalRunEpoch();
      // Traffic causality ledgers are intentionally transient rather than part of the save envelope.
      // The incoming envelope is authoritative: a Continue to an earlier completion boundary must
      // be able to surface that legitimate action again.
      this._resetTransientCausalLedgers(false);
      this._resetCeresCausalChain('save_loaded');
      this._adoptLegacyCeresActivityTargetRefs();
      const sectorId = this.state.world && this.state.world.currentSectorId;
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

  _onSectorExit(p) {
    if (p && (p.continuous || p.noTeleport)) {
      this._pruneDead();
      return;
    }
    const sectorId = (p && p.sectorId)
      || (this.state.world && this.state.world.currentSectorId);
    if (sectorId === CERES_ACTIVITY_SECTOR_ID) this._captureCeresActivityCast();
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
      this._ensureNamedLaneContact(sectorId, sector, stations);
      this._applyWorldSiteTrafficHooks(sectorId);
      this._applyClaimTravelHooks(sectorId);
      return;
    }

    const roleWeights = trafficRoleMixForSector(sector, this.state);
    const roles = [];
    for (let i = 0; i < need; i++) roles.push(pickRole(roleWeights, () => this._rng()));
    const pocketRoles = ensurePocketRoleMix(roles, sector);

    // Pocket anchor: cluster the first freighters near the busiest station so sensor-range
    // density holds for the first-hour Helios play space (not scattered to far yards only).
    const pocketStation = this._pocketStation(stations, sectorId);

    for (let i = 0; i < need; i++) {
      const role = pocketRoles[i] || 'hauler';
      const def = TRAFFIC_ROLES[role] || TRAFFIC_ROLES.hauler;
      const station = (i < Math.min(4, need) && pocketStation)
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
      if (role === 'patrol' || role === 'escort') {
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
      const target = def.express
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
      if (def.express) this._stampExpressRoute(ent, rec, station, target, sectorId, already + i);
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
      this._maybeAssignJob(ent, role, station, target, stations, sectorId);
    }
    this._ensureNamedLaneContact(sectorId, sector, stations);
    this._applyWorldSiteTrafficHooks(sectorId);
    this._applyClaimTravelHooks(sectorId);
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
    const release = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.release;
    return typeof release === 'function' ? release(`job:${recordId}`) === true : false;
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
      const mode = exactCeresRouteTargetRefMode(job.route, canonical.route);
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
        let manifest = entity.data.cargoManifest;
        if (!manifest || !Array.isArray(manifest.lines) || manifest.lines.length === 0) {
          const station = this._sectorStations().find((candidate) => stationIdentity(candidate) === 'station_ceres');
          if (station) manifest = this._assignManifest(entity, 'hauler', station, CERES_ACTIVITY_SECTOR_ID);
        }
        if (manifest && Array.isArray(manifest.lines) && manifest.lines.length > 0) {
          spec.payload.manifest = manifest;
        }
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
      const lawful = slot.lawful === true || role === 'patrol' || role === 'escort';
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

      if (!entity) entity = this.helpers.spawnEntity(canonicalSpec);
      if (!entity) continue;
      this._rehydrateCeresActivityEntity(entity, canonicalSpec, entry, recordId);
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
    if (jobId && role === 'miner') {
      // A commissioned barge departs empty. Its real cargo is created only when a materialized work
      // stop completes, so scanners never show a miner carrying random market goods outbound.
      const rec = this.state.traffic.freighters.find((candidate) => candidate && candidate.id === ent.id);
      this._setTrafficManifest(ent, rec, this._buildMinerManifest(ent, 0, null, 0));
    }
  },

  _buildJobSpec(role, ent, originStation, target, stations, sectorId) {
    const home = originStation && originStation.pos ? originStation : (stations && stations[0]);
    if (!home || !home.pos) return null;
    if (role === 'miner') {
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
    if (role === 'hauler') {
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
      // Salvors work the dead, so the site must actually be a wreck. Without one there is nothing
      // to cut and the hull keeps its ambient stepper — a salvor stripping a live rock would be a
      // miner, and the fiction is emphatic that those are different trades.
      const wreck = this._nearestOfTypeTo(this.state, home, 'wreck');
      if (!wreck) return null;
      return {
        kind: 'salvor', sectorId,
        route: [
          { id: 'yard:' + stationIdentity(home), pos: { x: home.pos.x, z: home.pos.z }, label: 'Scrap Yard' },
          { id: 'hulk:' + wreck.id, pos: { x: wreck.pos.x, z: wreck.pos.z }, label: 'Hulk' },
        ],
        payload: { commodity: 'cmdty_scrap_metal', units: 24 },
      };
    }
    if (role === 'tender') {
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
    if (role === 'patrol') {
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
    // Already have a live named contact?
    for (const rec of list) {
      const e = this.state.entities && this.state.entities.get(rec.id);
      if (e && e.alive && e.data && e.data.namedLaneContactId) return;
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
        spawnContext: (role === 'patrol' || role === 'escort') ? 'patrol' : 'convoy_civilian',
      };
      if (role === 'patrol' || role === 'escort') aiSpec.lawful = true;
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
      if (contact.role === 'patrol' || contact.role === 'escort') {
        ent.data.ai.lawful = true;
        ent.data.ai.spawnContext = 'patrol';
      }
    }
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
    if (role === 'patrol' || role === 'escort') {
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
      const target = (stations && stations.length)
        ? (role === 'express'
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
        this._stampExpressRoute(e, rec, null, target, sectorId, adoptIdx, true);
      }
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
    // The core system exposes helpers.removeEntity (marks alive=false; the renderer/physics GC it).
    // Fall back to a direct alive=false if the helper shape differs across builds.
    const helper = this.helpers && (this.helpers.removeEntity || this.helpers.despawnEntity);
    if (!helper) {
      for (const id of this._active) { const e = this.state.entities.get(id); if (e) e.alive = false; }
    } else {
      for (const id of this._active) { try { helper(id); } catch (_) {} }
    }
    this._active = [];
    this._ensureState();
    this.state.traffic.freighters = [];
    // Hard exit drops the view and every view-scoped causality ledger. Continuous handoff uses
    // _pruneDead only and keeps them (M2 durable identity).
    this._resetTransientCausalLedgers(true);
    this._resetCeresCausalChain('cleanup');
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
    this._ensureState();
    const list = state.traffic.freighters;
    if (!list || list.length === 0) return;
    const stations = this._sectorStations();
    if (stations.length === 0) return;

    // Timer-cadence only: one chain step per traffic update, not a freighter scan.
    if (state.world && state.world.currentSectorId === CERES_ACTIVITY_SECTOR_ID) {
      this._stepCeresCausalChain(dt);
    }

    let lostWorldSiteRoute = false;
    let lostClaimTravelRoute = false;
    for (let i = list.length - 1; i >= 0; i--) {
      const rec = list[i];
      const e = state.entities.get(rec.id);
      if (!e || !e.alive) {
        if (rec && rec.worldSiteRoute) lostWorldSiteRoute = true;
        if (rec && rec.claimTravelRoute) lostClaimTravelRoute = true;
        list.splice(i, 1);
        continue;
      }
      // The seven authored pocket actors yield movement to npcJobsRuntime. A completed one-shot job
      // releases data.jobId; recommission it from the same immutable activity descriptor before any
      // ambient role branch can run. The reserved Cinder service slot is excluded and continues to
      // use only its existing phase-gated worldSiteRoute below.
      const activityEntry = e.data
        && CERES_ACTIVITY_CAST_BY_SLOT_ID.get(e.data.activityActorSlotId);
      if (activityEntry && !activityEntry.service) {
        if (!e.data.jobId) this._assignCeresActivityJob(e, activityEntry);
        continue;
      }
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
    const rule = CERES_PRIMARY_ACTION_BY_JOB_KIND[slot.jobKind];
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
      if (context.slot.id === CERES_SEAM_MINER_SLOT_ID) {
        effectType = 'mining:npcExtraction';
        effectApplied = this._applyNpcMinerExtraction(
          context,
          intent,
          context.target.entity,
          `npc-miner-work:${context.jobId}:${context.action}:${context.sequence}:${context.targetRef}`,
          { causalGuard },
        );
        if (!effectApplied) throw new Error('ceres_miner_effect_rejected');
      } else if (context.slot.id === CERES_REFINERY_HAULER_SLOT_ID) {
        effectType = 'freight:arrival';
        effectApplied = this._emitArrival(context.entity, context.rec, context.target.entity, {
          dockSeq: context.sequence,
          manifest: context.jobPayload && context.jobPayload.manifest,
          ceresAction: true,
          causalGuard,
        });
        if (!effectApplied) throw new Error('ceres_freight_effect_rejected');
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

  _jobTrafficContext(intent, expectedRole) {
    if (!intent || intent.kind !== expectedRole) return null;
    const jobId = typeof intent.jobId === 'string' ? intent.jobId : '';
    if (!jobId.startsWith('job:') || jobId.length <= 4) return null;
    const worldRecordId = jobId.slice(4);
    const entity = entityWithWorldRecord(this.state, worldRecordId);
    if (!entity || !entity.data || entity.data.jobId !== jobId) return null;

    this._ensureState();
    const rec = this.state.traffic.freighters.find((candidate) => candidate && candidate.id === entity.id);
    if (!rec || rec.role !== expectedRole) return null;
    return { jobId, worldRecordId, entity, rec };
  },

  _buildMinerManifest(entity, workSeq, commodityId, qty) {
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const freighterKey = entity && entity.data && entity.data.worldRecordId
      || entity && entity.id
      || 'npc-miner';
    const amount = Math.max(0, Math.floor(Number(qty) || 0));
    const manifest = buildCargoManifest({
      seed,
      freighterKey: `${freighterKey}:work:${Math.max(0, workSeq | 0)}`,
      role: 'miner',
      marketKeys: commodityId ? [commodityId] : FREIGHT_MARKET_KEYS_FALLBACK,
      capacity: amount,
    });
    if (amount > 0 && commodityId) {
      manifest.lines = [{ commodityId, qty: amount }];
      manifest.totalQty = amount;
    }
    return manifest;
  },

  _setTrafficManifest(entity, rec, manifest) {
    if (!manifest) return false;
    if (rec) rec.manifest = manifest;
    if (entity && entity.data) entity.data.cargoManifest = manifest;
    return true;
  },

  _onNpcJobWork(intent) {
    const ceresOwned = this._ceresActivityIntentClaimsOwnership(intent);
    const actorContext = this._ceresActivityActorContext(intent);
    if (ceresOwned) {
      const context = this._ceresActivityActionContext(intent, 'work', actorContext);
      return context ? this._applyCeresActivityAction(context, intent) : false;
    }
    if (!intent || intent.kind !== 'miner' || intent.completed !== true) return false;
    const context = this._jobTrafficContext(intent, 'miner');
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
    try {
      const commodityId = dominantAsteroidCommodity(asteroid);
      const authoredYield = Math.max(1, Math.floor(Number(asteroid.data && asteroid.data.yieldU) || NPC_MINER_WORK_BATCH_U));
      // Keep the field-owner extraction batch at the ordinary parcel size. The rich-seam microevent
      // advertises yield through the chain ledger + miner cargo stamp (see _applyCeresCausalPhaseEffects),
      // not by rewriting the mining:npcExtraction quantum — that quantum is already pinned by owner tests.
      const extractedU = Math.min(NPC_MINER_WORK_BATCH_U, authoredYield);
      const manifest = this._buildMinerManifest(context.entity, seq, commodityId, extractedU);
      if (!this._setTrafficManifest(context.entity, context.rec, manifest)) throw new Error('miner_manifest_rejected');
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
    this._committedCeresArrivalIds.clear();
    this._committedCeresMinerWorkIds.clear();
  },

  // ── PQ-045.causal-chain — Ceres-only choreography timer ────────────────────────────────────────

  _resetCeresCausalChain(reason = 'reset') {
    if (this._ceresCausal && this._ceresCausal.active && this._ceresCausal.active.length) {
      for (const live of this._ceresCausal.active.slice()) {
        this._emitCeresCausalReceipt(live, 'abort', { reason: String(reason || 'reset') });
      }
    }
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
   * Resolve a Ceres cast (or tender reuse) actor by stable slot id. Does not allocate and does not
   * walk the full entity map every call: freighter ledger first, then a single tender fall-through.
   */
  _ceresCausalActorBySlot(slotId) {
    if (typeof slotId !== 'string' || !slotId) return null;
    const freighters = this.state && this.state.traffic && this.state.traffic.freighters;
    if (Array.isArray(freighters)) {
      for (let i = 0; i < freighters.length; i++) {
        const rec = freighters[i];
        if (!rec || rec.activityActorSlotId !== slotId) continue;
        const entity = liveEntity(this.state, rec.id);
        if (entity && entity.alive !== false) return { entity, rec, slotId };
      }
    }
    // Tender is owned by factionPresence (excluded from traffic job cast) but still has the stable
    // activity slot id stamped when adopted. One linear pass of freighters already missed it; probe
    // by worldRecordId without a full entity scan when the cast map can name it.
    if (slotId === CERES_TENDER_SLOT_ID) {
      const seed = (this.state.meta && this.state.meta.seed) || 1;
      const worldRecordId = stableRecordId(
        seed,
        CERES_ACTIVITY_SECTOR_ID,
        RECORD_KIND.CONVOY,
        `ceres:activity:${CERES_TENDER_SLOT_ID}`,
      );
      const entity = entityWithWorldRecord(this.state, worldRecordId);
      if (entity && entity.alive !== false) return { entity, rec: null, slotId };
    }
    return null;
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

  _ceresCausalSeedsReady(requires) {
    const seeds = this._ceresCausal && this._ceresCausal.seeds;
    if (!seeds) return false;
    if (!Array.isArray(requires) || requires.length === 0) return true;
    for (let i = 0; i < requires.length; i++) {
      if (seeds[requires[i]] !== true) return false;
    }
    return true;
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
    };
    this._ceresCausal.active.push(live);
    // Stamp a transient presentation cue on the primary actor (not a movement intent).
    this._stampCeresCausalCue(live, true);
    if (def.id === 'ev_disabled_hauler_recovery') {
      this._setCeresCausalDisabled(CERES_REFINERY_HAULER_SLOT_ID, true);
    }
    if (def.id === 'ev_tender_services_miner') {
      this._setCeresCausalServiceHold(CERES_SEAM_MINER_SLOT_ID, true);
    }
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
        bound.entity.data.ceresCausalEventId = null;
        bound.entity.data.ceresCausalPhase = null;
        bound.entity.data.ceresCausalCue = null;
      }
    }
  },

  _setCeresCausalDisabled(slotId, disabled) {
    const bound = this._ceresCausalActorBySlot(slotId);
    if (!bound || !bound.entity || !bound.entity.data) return;
    bound.entity.data.ceresCausalDisabled = disabled === true;
    if (bound.rec) bound.rec.ceresCausalDisabled = disabled === true;
  },

  _setCeresCausalServiceHold(slotId, hold) {
    const bound = this._ceresCausalActorBySlot(slotId);
    if (!bound || !bound.entity || !bound.entity.data) return;
    bound.entity.data.ceresCausalServiceHold = hold === true;
  },

  _applyCeresCausalPhaseEffects(def, live, phaseName) {
    if (!def || !live) return;
    if (def.id === 'ev_rich_seam_strike' && phaseName === 'strike') {
      // Ensure the miner carries a readable loaded return even before the next work receipt.
      const bound = this._ceresCausalActorBySlot(CERES_SEAM_MINER_SLOT_ID);
      if (bound && bound.entity) {
        const existing = bound.entity.data && bound.entity.data.cargoManifest;
        if (!existing || !validCausalManifest(existing)) {
          const manifest = this._buildMinerManifest(
            bound.entity,
            Math.max(0, (this.state.tick | 0)),
            'cmdty_ore_iron',
            NPC_MINER_WORK_BATCH_U * CERES_CAUSAL_RICH_YIELD_MULT,
          );
          this._setTrafficManifest(bound.entity, bound.rec, manifest);
        }
      }
    }
    if (def.id === 'ev_miner_calls_hauler' && phaseName === 'transfer') {
      this._applyCeresCausalOreHandoff();
    }
    if (def.id === 'ev_disabled_hauler_recovery' && phaseName === 'resolve') {
      this._setCeresCausalDisabled(CERES_REFINERY_HAULER_SLOT_ID, false);
    }
    if (def.id === 'ev_tender_services_miner' && phaseName === 'first_light') {
      this._setCeresCausalServiceHold(CERES_SEAM_MINER_SLOT_ID, false);
    }
  },

  /**
   * Transfer a real ore manifest from the loaded miner to the refinery hauler through the existing
   * traffic.manifest ownership (no economy wallet write — hauler delivery still goes through freight
   * arrival when its job unloads).
   */
  _applyCeresCausalOreHandoff() {
    const miner = this._ceresCausalActorBySlot(CERES_SEAM_MINER_SLOT_ID);
    const hauler = this._ceresCausalActorBySlot(CERES_REFINERY_HAULER_SLOT_ID);
    if (!miner || !hauler || !miner.entity || !hauler.entity) return false;
    let manifest = miner.entity.data && miner.entity.data.cargoManifest;
    if (!validCausalManifest(manifest)) {
      manifest = this._buildMinerManifest(
        miner.entity,
        Math.max(0, (this.state.tick | 0)),
        'cmdty_ore_iron',
        NPC_MINER_WORK_BATCH_U * CERES_CAUSAL_RICH_YIELD_MULT,
      );
    }
    // Hauler receives a freight-shaped copy; miner drops to empty (hand-off, not duplication).
    const haulerManifest = {
      manifestId: `ceres-chain-handoff:${hauler.entity.data && hauler.entity.data.worldRecordId || hauler.entity.id}:${this.state.tick | 0}`,
      lines: manifest.lines.map((line) => ({ commodityId: line.commodityId, qty: line.qty | 0 })),
      totalQty: manifest.totalQty | 0,
    };
    this._setTrafficManifest(hauler.entity, hauler.rec, haulerManifest);
    this._setTrafficManifest(
      miner.entity,
      miner.rec,
      this._buildMinerManifest(miner.entity, Math.max(0, (this.state.tick | 0)), null, 0),
    );
    // One-shot hauler jobs read payload.manifest at assign time; stamp the live entity so the next
    // recommission carries the ore without inventing a second freight writer.
    if (hauler.entity.data) hauler.entity.data.cargoManifest = haulerManifest;
    if (hauler.rec) hauler.rec.manifest = haulerManifest;
    return true;
  },

  _seedCeresCausalEvent(def, live) {
    if (!def || !live || live.seeded || !this._ceresCausal) return;
    if (live.phase !== def.seedAtPhase) return;
    live.seeded = true;
    for (let i = 0; i < def.seeds.length; i++) {
      this._ceresCausal.seeds[def.seeds[i]] = true;
    }
    this._applyCeresCausalPhaseEffects(def, live, live.phase);
    this._emitCeresCausalReceipt(live, 'seed', {
      seeded: def.seeds.slice(),
    });
  },

  _completeCeresCausalEvent(live, outcome = 'complete') {
    if (!live || !this._ceresCausal) return;
    const def = CERES_CAUSAL_CHAIN_BY_ID.get(live.eventId);
    if (def && !live.seeded && outcome === 'complete') {
      // Fail-closed: if the event ends without hitting seedAtPhase (shortened/interrupted path
      // already handled), still plant seeds so the chain cannot soft-lock.
      live.phase = def.seedAtPhase;
      this._seedCeresCausalEvent(def, live);
    }
    this._stampCeresCausalCue(live, false);
    if (def && def.id === 'ev_disabled_hauler_recovery') {
      this._setCeresCausalDisabled(CERES_REFINERY_HAULER_SLOT_ID, false);
    }
    if (def && def.id === 'ev_tender_services_miner') {
      this._setCeresCausalServiceHold(CERES_SEAM_MINER_SLOT_ID, false);
    }
    const active = this._ceresCausal.active;
    const idx = active.indexOf(live);
    if (idx >= 0) active.splice(idx, 1);
    if (outcome === 'complete' && !this._ceresCausal.completed.includes(live.eventId)) {
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
    // Primary-actor death is the catalog interruption path; fall back and free the concurrency slot.
    if (!this._ceresCausalRequiredActorsLive(def)) {
      this._completeCeresCausalEvent(live, 'fallback');
      return;
    }
    let steps = 0;
    while (simTime >= live.phaseEndsAt && steps < CERES_CAUSAL_CHAIN_MAX_PHASE_STEPS) {
      steps += 1;
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
      live.phaseEndsAt = Math.max(live.phaseEndsAt, simTime) + next.durationS;
      this._stampCeresCausalCue(live, true);
      this._applyCeresCausalPhaseEffects(def, live, live.phase);
      this._seedCeresCausalEvent(def, live);
      this._emitCeresCausalReceipt(live, 'phase');
    }
  },

  _tryStartNextCeresCausalEvents(simTime) {
    const chain = this._ceresCausal;
    if (!chain) return;
    if (simTime < chain.nextEligibleAt) return;
    while (chain.active.length < CERES_CAUSAL_CHAIN_MAX_CONCURRENT
      && chain.nextIndex < CERES_CAUSAL_CHAIN.length) {
      const def = CERES_CAUSAL_CHAIN[chain.nextIndex];
      if (!this._ceresCausalSeedsReady(def.requires)) break;
      if (!this._ceresCausalRequiredActorsLive(def)) break;
      // Do not start a second copy of a still-active or already-completed event in this cycle.
      if (chain.completed.includes(def.id)
        || chain.active.some((live) => live && live.eventId === def.id)) {
        chain.nextIndex += 1;
        continue;
      }
      this._startCeresCausalEvent(def, simTime);
      chain.nextIndex += 1;
    }
    if (chain.nextIndex >= CERES_CAUSAL_CHAIN.length
      && chain.active.length === 0
      && chain.completed.length >= CERES_CAUSAL_CHAIN.length) {
      // Full cycle resolved with no player input. Gap, then re-arm from the seam strike again.
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
    if (!intent || intent.completed !== true || (intent.kind !== 'hauler' && intent.kind !== 'miner')) return false;
    const context = this._jobTrafficContext(intent, intent.kind);
    if (!context) return false;

    const destination = typeof intent.destination === 'string' ? intent.destination : '';
    const prefix = intent.kind === 'miner' ? 'home:' : 'dest:';
    if (!destination.startsWith(prefix) || destination.length <= prefix.length) return false;
    const stationId = destination.slice(prefix.length);
    const station = this._sectorStations().find((candidate) => stationIdentity(candidate) === stationId);
    if (!station) return false;

    const manifest = intent.kind === 'hauler' && intent.payload && intent.payload.manifest;
    const applied = this._emitArrival(context.entity, context.rec, station, {
      dockSeq: Number.isSafeInteger(intent.seq) && intent.seq >= 0 ? intent.seq : undefined,
      manifest,
    });
    if (applied && intent.kind === 'miner') {
      this._setTrafficManifest(
        context.entity,
        context.rec,
        this._buildMinerManifest(context.entity, intent.seq, null, 0),
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
    if (!rec && !(ent && ent.data && ent.data.trafficRole)) return;
    if ((ent && ent.data && ent.data.ceresActivityCast === true)
      || (rec && rec.ceresActivityCast === true)) {
      // Cast identity is durable world state. Release its movement owner, but do not fabricate a
      // freight economy receipt: these authored marks deliberately do not claim the generic
      // field:/dest: receipt bridges.
      const recordId = (ent && ent.data && ent.data.worldRecordId)
        || (rec && rec.worldRecordId)
        || null;
      this._releaseCeresActivityJob(recordId);
      if (idx >= 0) list.splice(idx, 1);
      const activeIdx = this._active.indexOf(p.id);
      if (activeIdx >= 0) this._active.splice(activeIdx, 1);
      if (lostWorldSiteRoute) {
        this._applyWorldSiteTrafficHooks(this.state.world && this.state.world.currentSectorId);
      }
      return;
    }
    if (role && !FREIGHT_TRADING_ROLES.includes(role) && !(rec && rec.manifest && rec.manifest.totalQty)) {
      // Non-trading traffic (patrol/escort) — drop tracking only.
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

  newGame() {
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
