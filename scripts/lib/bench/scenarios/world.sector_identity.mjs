// scripts/lib/bench/scenarios/world.sector_identity.mjs — PQ-143.00, on the REAL path.
//
// THE VISION SENTENCE UNDER TEST (design/VISION.md Part II, "Every place needs a reason to exist"):
//   "A player recognises Ceres from thirty seconds of activity and Helios from thirty seconds of
//    different activity — not from a colour grade."
//
// This module answers that sentence with a number. It boots the full PRODUCTION node-safe manifest
// (`createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true })`) with the live
// `rapier-dynamic` authority, enters ONE real sector, stands the player where that sector's work
// actually is, and then WATCHES for thirty simulated seconds. It causes nothing, spawns nothing, and
// integrates nothing: every number below is a census of the shipping world plus a tally of the
// shipping bus. It does that twice — Helios, then Ceres — and reports how many of the eight identity
// columns the two answers differ on.
//
// ── The eight columns (design/SECTOR_IDENTITY.md is the prose; this file is the measurement) ─────
//   verb        what happens here          — the NPC job kinds actually running
//   rhythm      the beat of a working day  — job phase changes per minute, and work-vs-transit share
//   law         what law looks like here   — lawful hulls present and the law events they produce
//   crime       what crime looks like here — hostile hulls present and the crime events they produce
//   ships       the ships that belong      — the ambient traffic role composition
//   structures  what local conditions build— the kinds of structure standing in the pocket
//   affordance  what the player can DO     — rock to cut, ports to dock, hulks to strip, tows to take
//   aftermath   what remains when damaged  — the residue kind this place leaves behind
//
// ── The traps this module is hardened against ────────────────────────────────────────────────────
// TRAP 1 — RESIDENCY (world.reaction_trio's TRAP 1). SG-02 gives a Rapier body only to entities the
//   activity classifier keeps inside the player's physics reach. A signature counted around a player
//   parked at a sector's arbitrary entry point reads near-zero for a belt three thousand units away,
//   and zero-versus-nonzero then LOOKS like identity when it is only staging. So the player is moved
//   to the sector's own densest live work cluster — one symmetric rule, derived from the sector's own
//   spawns, never a hand-picked coordinate per sector — and the module reports how many of the
//   counted actors actually held a physics body (`bodiedActors` / `censusActors`).
// TRAP 2 — FEATURE FLAGS (the a82158c8 bug). `createAuthoritativeRuntime` applies the profile's
//   feature config to the process-global flag MAPS only inside `init`/`step`. Anything done BETWEEN
//   ticks — `physics.prepareBackend`, any `bus.emit` — reads the process defaults (all false). Every
//   such call here goes through `withFeatures()`.
// TRAP 3 — COUNTS ARE NOT IDENTITY. "seventeen versus fourteen" is not a way of life. Every column
//   compares in the shape a player would notice: which category DOMINATES, whether a category is
//   present at all, or a ratio of at least 2x on a total large enough to mean something. The rule is
//   `columnDiffers()` below and it is pinned by test/sector-identity.test.mjs.
//
// Determinism: fixed seed in, `state.rng`/`state.simTime` only, no wall clock, no `Math.random`.
// Every position this module chooses is derived from the live sector's own entity ordering.

import { createAuthoritativeRuntime } from '../../../../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../../../../src/systems/ships.js';
import {
  applyFeatureConfigToMaps,
  restoreFeatureMaps,
  snapshotFeatureMaps,
} from '../../../../src/data/featureFlags.js';
import { realPathProof } from '../realPath.mjs';

/** The two sectors this leaf makes true. Helios is the start; Ceres is one gate hop away. */
export const IDENTITY_SECTOR_IDS = Object.freeze(['sector_helios_prime', 'sector_ceres_belt']);

/** The window the done-when names: "a blind reviewer names the sector from a 30 s capture". */
export const OBSERVE_SECONDS = 30;
/** Long enough for `sector:enter` spawning, the first traffic dispatch, and the first job cycle. */
export const WARMUP_SECONDS = 20;
/** After the player is moved to the pocket station, let residency promote before counting. */
export const SETTLE_SECONDS = 4;
/** How many of the eight columns must differ for the table to be TRUE on the route. */
export const REQUIRED_DIFFERING_COLUMNS = 4;

const TICKS_PER_S = 60;
/**
 * The pocket, in WU — SG-02's physics reach. Counting wider than this counts entities the sim is
 * not simulating; counting narrower throws away hulls the player can plainly see. This is the ring,
 * so the census and the simulation agree about what is alive.
 */
const POCKET_RADIUS_WU = 750;
/**
 * What the SHIPPING camera can put on screen — the chase rig's base distance (see the camera visible
 * bubble record: chase base 144 WU). The blind reviewer watching a 30 s capture sees roughly this
 * ring, not the 750 WU pocket, so every column is reported at both radii.
 */
const VISIBLE_RADIUS_WU = 144;
/** Sampling stride in ticks. Every `runTicks` pays a feature-map snapshot/restore. */
const SAMPLE_STRIDE = 30;

export const IDENTITY_COLUMNS = Object.freeze([
  'verb', 'rhythm', 'law', 'crime', 'ships', 'structures', 'affordance', 'aftermath',
]);

/** Bus events that mean "the law is doing its job here". */
const LAW_EVENTS = Object.freeze([
  'lawfulInspection:offered', 'lawfulInspection:scanning', 'lawfulInspection:resolved',
  'patrol:proximity', 'player:scannedByPatrol',
  'law:incidentOpened', 'law:dispatchStarted', 'law:incidentResolved', 'law:distressRaised',
  'law:witnessChoice', 'law:voice', 'law:sanctuaryWithdrawal', 'law:responseDeferred',
]);

/** Bus events that mean "crime is happening here". */
const CRIME_EVENTS = Object.freeze([
  'interdiction:triggered', 'lane:disrupted', 'contraband:scanned', 'pirateParley:choose',
  'freight:loss', 'encounter:started', 'encounter:revealed',
]);

/**
 * Bus events that mean "ordinary work is being done here". The `npcjobs:*` names are exactly the
 * kernel's phase vocabulary (`src/systems/npcJobs.js` emit sites) plus the runtime's own
 * `minerRelocated`; the rest are the receipts the working trades leave behind.
 */
const WORK_EVENTS = Object.freeze([
  'npcjobs:commission', 'npcjobs:depart', 'npcjobs:transit', 'npcjobs:approach', 'npcjobs:work',
  'npcjobs:load', 'npcjobs:unload', 'npcjobs:return', 'npcjobs:hold', 'npcjobs:cycle',
  'npcjobs:arrived', 'npcjobs:complete', 'npcjobs:truncated', 'npcjobs:minerRelocated',
  'mining:npcExtraction', 'salvage:npcExtraction', 'salvage:npcUnload', 'freight:arrival',
  'field:richSeamOpened', 'field:richSeamWorked', 'traffic:jobActionReceipt',
]);

const finite = (n, fallback = 0) => (Number.isFinite(Number(n)) ? Number(n) : fallback);
const dist = (a, b) => Math.hypot(finite(a && a.x) - finite(b && b.x), finite(a && a.z) - finite(b && b.z));
const round3 = (n) => Number(finite(n).toFixed(3));

function live(state) {
  return (state.entityList || []).filter((e) => e && e.alive !== false);
}

/** TRAP 2. Run `fn` with the runtime's own feature configuration applied to the global flag maps. */
function withFeatures(runtime, fn) {
  const previous = snapshotFeatureMaps();
  applyFeatureConfigToMaps(runtime && runtime.config && runtime.config.features);
  try {
    return fn();
  } finally {
    restoreFeatureMaps(previous);
  }
}

/** TRAP 1. The set of entity ids SG-02 currently owns a body for, or null if unavailable. */
function bodyRecords(runtime) {
  const physics = runtime && typeof runtime.getSystem === 'function' ? runtime.getSystem('physics') : null;
  const owner = physics && physics._sg02;
  const records = owner && owner.records;
  return records && typeof records.has === 'function' ? records : null;
}

/** Boot the full production world in one real sector. Not a fixture: this is the shipping manifest. */
async function bootSector(seed, sectorId) {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed });
  const state = runtime.state;
  if (!state) throw new Error('world.sector_identity: runtime has no simulation state');
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  if (!state.input.actions) state.input.actions = { brake: false, autopursuit: false };

  const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true, player: state.player, pos: { x: 0, z: 0 }, fittings: [],
  }));
  state.playerId = player.id;

  const world = runtime.getSystem('world');
  if (!world || typeof world.enterSector !== 'function') {
    throw new Error('world.sector_identity: the `world` system is not registered — this is not the real path');
  }
  world.enterSector(sectorId);

  // TRAP 1, THE REAL SHAPE OF IT. Moving the player is NOT `player.pos.x = …`. Entity positions are
  // galactic-global and `world` keeps bookkeeping against them — the playable-bounds fence, the
  // residency focus, the membership test. Writing the field raw leaves all of that pointing at the
  // old place, and the next tick resolves the contradiction violently: measured on 2026-09-05, seed
  // 4242, a raw write to Helios Station put the player at x = -2 499 679 — two and a half million
  // units out, in a residency set that had loaded `station_orcus_shadow`. Both of this bench's first
  // two runs printed a clean table of zeros for that one reason: the census ring was in deep space.
  //
  // `world.relocatePlayerInSector` is the shipping seam for exactly this ("public same-sector
  // relocation seam … never changes sector membership"), and it is used here BEFORE
  // `prepareBackend`, so SG-02 builds the player's body at the pocket once rather than reconciling a
  // jump. `enterSector` populates the sector synchronously — 314 entities, every station, before a
  // single tick — so the anchor is already knowable at this point.
  // AND THE SECOND HALF OF THE SAME TRAP: never stand ON the rock. A station's own position is the
  // CENTRE of its collider, so relocating the player there buries the hull inside the station and the
  // solver resolves a zero-normal overlap the only way it can — measured, deterministically, as
  // x = -2 499 679 on tick one, then frozen there for the rest of the run. That single number was
  // behind every empty column in this bench's first three runs. The player therefore parks at the
  // standoff a ship actually holds: clear of the dock ring, at the radius traffic itself uses when it
  // clusters its first four ambient hulls around the pocket station (`traffic.js`: `90 + rng*…`).
  const anchor = pocketAnchor(state, sectorId, state.playerId);
  if (typeof world.relocatePlayerInSector !== 'function') {
    throw new Error('world.sector_identity: world has no relocatePlayerInSector seam — cannot stand the player in the sector\'s work');
  }
  const standAt = { x: anchor.x + anchor.standoffWU, z: anchor.z };
  world.relocatePlayerInSector(standAt, { reason: 'bench:sector_identity' });
  player.vel.x = 0;
  player.vel.z = 0;

  const physics = runtime.getSystem('physics');
  if (!physics || typeof physics.prepareBackend !== 'function') {
    throw new Error('world.sector_identity: physics has no prepareBackend — this is not the real path');
  }
  const ready = await withFeatures(runtime, () => physics.prepareBackend(state, { reset: true }));
  if (ready !== true) throw new Error('world.sector_identity: SG-02 dynamic authority failed to come up');

  // The systems that MAKE a way of life. A missing one is a harness fault, never a finding.
  for (const name of ['traffic', 'npcJobsRuntime', 'lawSecurity', 'regionalEcology', 'sectorSim']) {
    if (!runtime.getSystem(name)) {
      throw new Error(`world.sector_identity: system "${name}" is not registered — a sector cannot have a way of life without it`);
    }
  }
  return { runtime, state, bus: runtime.bus, player, anchor };
}

/** A tally that records first-seen order, so two runs of a seed serialize identically. */
function tally() {
  return new Map();
}
function bump(map, key, by = 1) {
  if (key == null) return;
  map.set(key, (map.get(key) || 0) + by);
}
function tallyToObject(map) {
  const out = {};
  for (const key of [...map.keys()].sort()) out[key] = map.get(key);
  return out;
}
/**
 * What DOMINATES this column — or null when nothing does. Breaking a tie by name would have invented
 * identity out of alphabetical order: Ceres shows one hornet, one ironback and one mule, a dead
 * three-way tie, and a name-sorted winner would have let the bench announce "Helios is pelicans,
 * Ceres is hornets" about a sector where no hull class leads at all. A tie means there is no
 * dominant thing, and the column has to earn its difference on what is PRESENT instead.
 */
function dominant(obj) {
  let best = null;
  let bestN = -1;
  let tied = false;
  for (const key of Object.keys(obj).sort()) {
    if (obj[key] > bestN) { best = key; bestN = obj[key]; tied = false; }
    else if (obj[key] === bestN) { tied = true; }
  }
  return bestN > 0 && !tied ? best : null;
}
function total(obj) {
  let n = 0;
  for (const key of Object.keys(obj)) n += obj[key];
  return n;
}

// ── Classification of a live entity ───────────────────────────────────────────────────────────────

/**
 * The live job behind a hull. `state.npcJobs.byId[jobId]` is the runtime's ENTRY — `{ job, kind,
 * sectorId, entityId, … }` — and the phase lives on `entry.job`, not on the entry. Reading
 * `entry.phase` returns undefined and silently empties the whole rhythm column; that is exactly the
 * clean-table-of-zeros failure this bench is written against.
 */
function jobFor(state, entity) {
  const jobId = entity && entity.data && entity.data.jobId;
  if (jobId == null) return null;
  const byId = state.npcJobs && state.npcJobs.byId;
  const entry = byId && byId[jobId];
  if (!entry) return null;
  const record = entry.job || entry;
  return {
    kind: entry.kind || record.kind || null,
    phase: record.phase || null,
    interrupted: record.interrupted === true,
  };
}

function trafficRoleOf(entity) {
  const role = entity && entity.data && entity.data.trafficRole;
  if (typeof role === 'string' && role) return role;
  // Lane freight carries no `trafficRole` — its identity is the LANE it is running. A player reads
  // "a line of freighters going somewhere" as a kind of ship traffic, so it belongs in this column.
  const parent = entity && entity.data && entity.data.parentType;
  if (parent === 'freighter' || parent === 'lane_traffic') return 'lane_freight';
  return null;
}

const LAWFUL_ROLES = new Set(['patrol', 'escort']);
const OUTLAW_ROLES = new Set(['pirate', 'smuggler']);

/**
 * Law or predator? NOT `team === 1`. Team 1 means "may engage the player", and the SCN patrols that
 * stand over both of these sectors are on it for exactly that reason while carrying
 * `roe: 'lawful_wanted_only'` and `doctrine: 'official'`. Reading team alone filed the Ceres refinery
 * patrol under CRIME and left the law column empty — the bench would have reported "Ceres has a
 * predator, Helios has a policeman" about two hulls doing the same lawful job. Stance is read from
 * what the hull is licensed to do, and only then from what it is flying as.
 */
function stanceOf(state, e) {
  const ai = (e && e.data && e.data.ai) || {};
  const role = trafficRoleOf(e);
  const job = jobFor(state, e);
  const roe = typeof ai.roe === 'string' ? ai.roe : '';
  if (roe === 'lawful_wanted_only' || ai.doctrine === 'official') return 'law';
  if (LAWFUL_ROLES.has(role) || (job && job.kind === 'patrol')) return 'law';
  if (OUTLAW_ROLES.has(role)) return 'crime';
  if (e && e.team === 1) return 'crime';
  return null;
}

/**
 * The hull a viewer actually sees. The "ships that belong" column asked `trafficRole`, which the
 * authored `wr_npc_*` hulls do not carry at all — the Ceres refinery tender showed up under `verb`
 * and then vanished from `ships`, leaving that column empty in one sector and calling the hole
 * identity. A hull class is what reads at the shipping camera: pelicans and drifters working a
 * refinery are not mules and wasps running a trade hub.
 */
function hullClassOf(e) {
  const d = (e && e.data) || null;
  if (!d) return null;
  const id = d.defId || d.shipDefId || d.shipId || d.shipClass;
  if (typeof id === 'string' && id) return id;
  return trafficRoleOf(e);
}

/**
 * A hull is not only `type === 'ship'`. The lane freighters traffic runs down the Helios–Tethys
 * textile route are spawned as `type: 'freighter'` with `data.parentType` `'freighter'`/`'lane_traffic'`
 * and no `trafficRole` and no `jobId` at all. Under the original test they matched neither `isShip`
 * nor `structureKindOf`, so five of the twelve hulls a Helios viewer can plainly see were counted as
 * NOTHING — the "ships that belong" column read empty in the one sector that has a freight lane.
 */
function isShip(e) {
  return e && (e.type === 'ship' || e.type === 'freighter' || e.type == null) && e.radius != null;
}
function isAsteroid(e) { return e && e.type === 'asteroid'; }
function isStation(e) { return e && e.type === 'station'; }
function isWreck(e) { return e && (e.type === 'wreck' || (e.data && e.data.wreckClassId != null)); }
function isPickup(e) { return e && e.type === 'pickup'; }

/**
 * The structure kind a non-ship entity contributes, in a player's words. `null` means "not a
 * structure" — projectiles, effects and the player's own hull never count.
 */
function structureKindOf(e) {
  if (isStation(e)) {
    if (e.data && e.data.isGate) return 'gate';
    const t = (e.data && e.data.stationTypeId) || null;
    return t ? `station:${t}` : 'station';
  }
  if (isAsteroid(e)) {
    const t = (e.data && e.data.typeId) || null;
    return t ? `rock:${t}` : 'rock';
  }
  if (isWreck(e)) return 'hulk';
  // Lane beacons (`type: 'beacon'`, `data.laneId`) are the physical evidence that a marked freight
  // route runs through this place. Only a sector with a lane has them; before this branch they were
  // classified as nothing at all.
  if (e && e.type === 'beacon') return (e.data && e.data.laneId) ? 'lane_beacon' : 'beacon';
  if (e && e.type === 'fx' && e.data && e.data.activityObjectSlotId) return `work_prop:${e.data.activityObjectSlotId}`;
  if (e && e.data && e.data.gateTo) return 'gate';
  if (e && e.data && (e.data.poiId || e.data.poiType)) return `poi:${e.data.poiType || 'marker'}`;
  if (isPickup(e)) return 'floating_cargo';
  return null;
}

/**
 * The physical affordance a non-ship entity offers a player who flies up to it. This is the column
 * the packet phrases as "what the player can physically do here that differs".
 */
function affordanceOf(e) {
  if (isAsteroid(e)) {
    // A belt is not "some rocks": what the rock IS decides whether cutting it is worth the trip.
    const t = String((e.data && e.data.typeId) || '');
    if (/metallic|rare|exotic|crystal/.test(t)) return 'cut_ore';
    return 'cut_rock';
  }
  if (isStation(e)) {
    if (e.data && e.data.isGate) return 'jump_out';
    const services = (e.data && e.data.services) || [];
    if (services.includes('ore_buy') || services.includes('refine')) return 'sell_ore';
    if (services.includes('trade') || services.includes('shipyard')) return 'dock_and_trade';
    return 'dock';
  }
  if (isWreck(e)) return 'strip_hulk';
  if (isPickup(e)) return 'scoop_cargo';
  if (e && e.type === 'beacon' && e.data && e.data.laneId) return 'follow_lane';
  if (e && e.type === 'fx' && e.data && e.data.activityObjectSlotId) return 'tow_or_service';
  return null;
}

/** What this place leaves lying about — the "what remains when it is damaged" column. */
function aftermathKindOf(e) {
  if (isWreck(e)) return 'hulk';
  if (isPickup(e)) return 'spilled_cargo';
  if (e && e.type === 'fx' && e.data && e.data.activityObjectSlotId) {
    const slot = String(e.data.activityObjectSlotId);
    if (/wreck|hull|shard|derelict/i.test(slot)) return 'hulk';
    if (/pod|cargo|clast/i.test(slot)) return 'spilled_cargo';
    return 'work_debris';
  }
  if (e && e.data && e.data.poiType === 'derelict') return 'derelict';
  if (e && e.data && e.data.poiType === 'wreck') return 'hulk';
  return null;
}

function stationIdOf(e) {
  return (e && e.data && (e.data.stationId || e.data.id)) || (e && e.id) || null;
}

/**
 * Where the watch stands. This is NOT a coordinate chosen per sector — that would be authoring the
 * answer. It is traffic's own rule (`traffic.js _pocketStation`): Helios Station in Helios, the
 * first station otherwise. Traffic clusters its first four ambient hulls on exactly this station
 * "so sensor-range density holds", so it is both the shipping definition of a sector's busiest
 * place and the place an arriving player heads for. One rule, both sectors, no hand-picked pocket.
 *
 * The consequence is recorded rather than dodged: a sector whose life is scattered into two-ship
 * dioramas thousands of units apart will read thin here, and that is a finding about the sector.
 */
const POCKET_STATION_OVERRIDES = Object.freeze({ sector_helios_prime: 'station_helios' });

/**
 * THE FOREIGN-STATION TRAP. `live(state).filter(isStation)` is NOT this sector's stations: entering
 * Helios leaves nineteen stations resident, six of them Ceres's and three of them `sector_nyx_march`
 * GATES. `stations[0]` therefore picked the right rock in both sectors only by accident of spawn
 * order, and one reshuffle would have parked the whole measurement on another sector's gate. Every
 * station entity carries `data.sectorId`, so the filter is exact: this sector's own non-gate berths,
 * in the order the sector spawned them, which is the list `traffic._pocketStation` is handed.
 */
function sectorStations(state, sectorId) {
  return live(state).filter(
    (e) => isStation(e)
      && !(e.data && e.data.isGate)
      && (e.data && e.data.sectorId) === sectorId,
  );
}

function pocketAnchor(state, sectorId, playerId) {
  const stations = sectorStations(state, sectorId);
  const preferred = POCKET_STATION_OVERRIDES[sectorId];
  const chosen = (preferred && stations.find((s) => stationIdOf(s) === preferred)) || stations[0] || null;
  if (chosen) {
    // Clear of the station's own hull and dock ring, by the station's own declared radii — the same
    // ~90 WU margin traffic uses for its pocket cluster, so the player stands where the work is
    // rather than inside the thing the work is about.
    const d = chosen.data || {};
    const hull = Math.max(
      finite(d.dockRadius), finite(d.collisionRadius), finite(chosen.radius), 60,
    );
    return {
      x: finite(chosen.pos && chosen.pos.x),
      z: finite(chosen.pos && chosen.pos.z),
      source: `station:${stationIdOf(chosen)}`,
      standoffWU: round3(hull + 90),
    };
  }
  const player = state.entities.get(playerId);
  return {
    x: finite(player && player.pos && player.pos.x),
    z: finite(player && player.pos && player.pos.z),
    source: 'player',
    standoffWU: 0,
  };
}

/** What a lawful or hostile hull IS, in a viewer's words: who flies it and what it is doing. */
function presenceKindOf(state, e) {
  const ai = (e && e.data && e.data.ai) || {};
  const job = jobFor(state, e);
  const parts = [];
  const archetype = (e.data && (e.data.archetypeId || e.data.enemyType)) || ai.archetypeId || null;
  const role = trafficRoleOf(e);
  parts.push(archetype || role || (job && job.kind) || 'ship');
  const faction = (e.data && e.data.factionId) || ai.factionId || null;
  if (faction) parts.push(faction);
  if (job && job.kind) parts.push(`job:${job.kind}`);
  else if (ai.doctrine) parts.push(`doctrine:${ai.doctrine}`);
  return parts.join('/');
}

// ── One sector's thirty seconds ───────────────────────────────────────────────────────────────────

/**
 * Boot one sector, stand the player in its work, watch for `OBSERVE_SECONDS`, and return the
 * activity signature. Causes nothing.
 */
async function observeSector(seed, sectorId) {
  const { runtime, state, bus, player, anchor } = await bootSector(seed, sectorId);

  /**
   * THE RHYTHM COLUMN WAS MEASURING TWO DIFFERENT PLACES. `phaseChangesPerMin` and
   * `workEventsPerMin` were raw bus tallies — every job in the whole sector, including the belt two
   * thousand units away — while `phaseOccupancy` was ring-scoped. One column, two scopes, so it
   * compared Ceres-the-sector against Helios-the-pocket and predictably read SAME. Everything the
   * rhythm column counts is now scoped to the same ring as every other column: an event belongs to
   * this place if the hull that raised it is standing in this place.
   */
  const anchorPos = { x: anchor.x, z: anchor.z };
  const entityInRing = (entityId) => {
    if (entityId == null || !state.entities) return false;
    const e = state.entities.get(entityId);
    if (!e || e.alive === false || !e.pos) return false;
    return dist(e.pos, anchorPos) <= POCKET_RADIUS_WU;
  };
  const jobInRing = (jobId) => {
    if (jobId == null) return false;
    const entry = state.npcJobs && state.npcJobs.byId && state.npcJobs.byId[jobId];
    return entry ? entityInRing(entry.entityId) : false;
  };
  /**
   * Does this event belong to the ring? A payload that names a job or a hull is placed by that hull.
   * A payload that names neither cannot be placed, so it is counted and the count is labelled
   * `unplaceableEvents` rather than quietly attributed to this pocket.
   */
  let unplaceableEvents = 0;
  const payloadInRing = (p) => {
    if (!p || typeof p !== 'object') { unplaceableEvents += 1; return true; }
    if (p.jobId != null) return jobInRing(p.jobId);
    if (p.entityId != null) return entityInRing(p.entityId);
    if (p.id != null && state.entities && state.entities.has(p.id)) return entityInRing(p.id);
    if (p.pos && Number.isFinite(p.pos.x)) return dist(p.pos, anchorPos) <= POCKET_RADIUS_WU;
    unplaceableEvents += 1;
    return true;
  };

  const events = tally();
  const seenEventNames = new Set([...LAW_EVENTS, ...CRIME_EVENTS, ...WORK_EVENTS]);
  let counting = false;
  const unsubs = [];
  for (const name of seenEventNames) {
    const handler = (p) => { if (counting && payloadInRing(p)) bump(events, name); };
    bus.on(name, handler);
    unsubs.push([name, handler]);
  }
  // Job phase changes are the rhythm. Every `npcjobs:*` intent carries the job's kind.
  const phaseByJob = new Map();
  const jobKindsSeen = tally();
  const phaseChanges = tally();
  const phaseHandler = (intent) => {
    if (!counting || !intent) return;
    if (!jobInRing(intent.jobId)) return;
    const kind = intent.kind || 'unknown';
    bump(jobKindsSeen, kind);
    const phase = String(intent.event || '').replace(/^npcjobs:/, '');
    const prev = phaseByJob.get(intent.jobId);
    if (prev !== phase) {
      phaseByJob.set(intent.jobId, phase);
      bump(phaseChanges, phase);
    }
  };
  for (const name of WORK_EVENTS) {
    if (!name.startsWith('npcjobs:')) continue;
    bus.on(name, phaseHandler);
    unsubs.push([name, phaseHandler]);
  }

  const step = (ticks) => runtime.runTicks(ticks);

  // 1. Let the sector become itself: spawns, first dispatch, first job cycle. The player is already
  //    standing at the pocket (placed in `bootSector`, before the body existed), so residency has the
  //    whole warmup to promote the hulls working around it.
  step((WARMUP_SECONDS + SETTLE_SECONDS) * TICKS_PER_S);

  // 2. Watch. Sample the census on a stride; tally the bus every tick it fires.
  counting = true;
  const jobKindSamples = tally();
  const roleSamples = tally();
  const structureSamples = tally();
  const affordanceSamples = tally();
  const aftermathSamples = tally();
  const phaseOccupancy = tally();
  const lawfulKinds = tally();
  const hostileKinds = tally();
  /**
   * The same census again, but only out to what the shipping chase camera can actually show
   * (`VISIBLE_RADIUS_WU`). The pocket ring is SG-02's reach, not a viewer's eye: a column that only
   * separates at 750 WU is true of the place and invisible in the capture the blind review watches.
   * Reporting both is the honest way to say which is which, rather than quoting the wide number and
   * hoping the frames agree.
   */
  const visible = {
    jobKinds: tally(), roles: tally(), structures: tally(), affordances: tally(), aftermath: tally(),
  };
  let samples = 0;
  let censusActors = 0;
  let bodiedActors = 0;
  let hostilePeak = 0;
  let lawfulPeak = 0;
  let visibleHostilePeak = 0;
  let visibleLawfulPeak = 0;

  const totalTicks = OBSERVE_SECONDS * TICKS_PER_S;
  for (let elapsed = 0; elapsed < totalTicks; elapsed += SAMPLE_STRIDE) {
    step(Math.min(SAMPLE_STRIDE, totalTicks - elapsed));
    samples += 1;
    const records = bodyRecords(runtime);
    let hostiles = 0;
    let lawful = 0;
    let visibleHostiles = 0;
    let visibleLawful = 0;
    for (const e of live(state)) {
      if (!e || e.id === state.playerId) continue;
      const range = dist(e.pos, anchorPos);
      if (range > POCKET_RADIUS_WU) continue;
      const onCamera = range <= VISIBLE_RADIUS_WU;
      if (isShip(e) && e.type !== 'projectile') {
        const job = jobFor(state, e);
        const role = trafficRoleOf(e);
        if (job || role) {
          censusActors += 1;
          if (records && records.has(e.id)) bodiedActors += 1;
        }
        if (job && job.kind) {
          bump(jobKindSamples, job.kind);
          if (onCamera) bump(visible.jobKinds, job.kind);
          if (job.phase) bump(phaseOccupancy, String(job.phase));
        }
        const hull = hullClassOf(e);
        if (hull) {
          bump(roleSamples, hull);
          if (onCamera) bump(visible.roles, hull);
        }
        const stance = stanceOf(state, e);
        if (stance === 'crime') {
          hostiles += 1;
          if (onCamera) visibleHostiles += 1;
          bump(hostileKinds, presenceKindOf(state, e));
        } else if (stance === 'law') {
          lawful += 1;
          if (onCamera) visibleLawful += 1;
          bump(lawfulKinds, presenceKindOf(state, e));
        }
        continue;
      }
      const structure = structureKindOf(e);
      if (structure) {
        bump(structureSamples, structure);
        if (onCamera) bump(visible.structures, structure);
      }
      const affordance = affordanceOf(e);
      if (affordance) {
        bump(affordanceSamples, affordance);
        if (onCamera) bump(visible.affordances, affordance);
      }
      const residue = aftermathKindOf(e);
      if (residue) {
        bump(aftermathSamples, residue);
        if (onCamera) bump(visible.aftermath, residue);
      }
    }
    hostilePeak = Math.max(hostilePeak, hostiles);
    lawfulPeak = Math.max(lawfulPeak, lawful);
    visibleHostilePeak = Math.max(visibleHostilePeak, visibleHostiles);
    visibleLawfulPeak = Math.max(visibleLawful, visibleLawfulPeak);
  }
  counting = false;
  for (const [name, handler] of unsubs) {
    if (typeof bus.off === 'function') bus.off(name, handler);
  }

  const perSample = (map) => {
    const out = {};
    for (const key of [...map.keys()].sort()) out[key] = round3(map.get(key) / Math.max(1, samples));
    return out;
  };
  const eventCounts = tallyToObject(events);
  const lawEventCount = LAW_EVENTS.reduce((n, name) => n + (eventCounts[name] || 0), 0);
  const crimeEventCount = CRIME_EVENTS.reduce((n, name) => n + (eventCounts[name] || 0), 0);
  const workEventCount = WORK_EVENTS.reduce((n, name) => n + (eventCounts[name] || 0), 0);
  const phaseChangeCounts = tallyToObject(phaseChanges);
  const occupancy = perSample(phaseOccupancy);
  const workPhases = ['work', 'load', 'unload', 'hold', 'survey', 'service'];
  const transitPhases = ['transit', 'approach', 'depart', 'return', 'commission'];
  const sumPhases = (names) => names.reduce((n, p) => n + (occupancy[p] || 0), 0);
  const workShare = (() => {
    const w = sumPhases(workPhases);
    const t = sumPhases(transitPhases);
    return w + t > 0 ? round3(w / (w + t)) : null;
  })();

  const proof = realPathProof(runtime);
  runtime.dispose();

  const jobKinds = perSample(jobKindSamples);
  const roles = perSample(roleSamples);
  const structures = perSample(structureSamples);
  const affordances = perSample(affordanceSamples);
  const aftermath = perSample(aftermathSamples);

  return {
    sectorId,
    seed,
    realPathProof: proof,
    staging: {
      anchor: { x: round3(anchor.x), z: round3(anchor.z), source: anchor.source, standoffWU: anchor.standoffWU, pocketRadiusWU: POCKET_RADIUS_WU },
      samples,
      censusActors,
      bodiedActors,
      bodiedFraction: censusActors > 0 ? round3(bodiedActors / censusActors) : null,
    },
    // The same eight readings inside the camera's own ring. Reported, never asserted on: this is how
    // the receipt says whether a differing column is something the blind reviewer could actually see.
    onCamera: {
      radiusWU: VISIBLE_RADIUS_WU,
      verb: perSample(visible.jobKinds),
      ships: perSample(visible.roles),
      structures: perSample(visible.structures),
      affordance: perSample(visible.affordances),
      aftermath: perSample(visible.aftermath),
      lawfulHullsPeak: visibleLawfulPeak,
      hostileHullsPeak: visibleHostilePeak,
    },
    columns: {
      verb: {
        counts: jobKinds,
        dominant: dominant(jobKinds),
        present: Object.keys(jobKinds),
        jobKindsSeenOnBus: tallyToObject(jobKindsSeen),
      },
      rhythm: {
        phaseChangesPerMin: round3(total(phaseChangeCounts) * (60 / OBSERVE_SECONDS)),
        phaseChanges: phaseChangeCounts,
        workEventsPerMin: round3(workEventCount * (60 / OBSERVE_SECONDS)),
        workShare,
        phaseOccupancy: occupancy,
        // Events the bus raised without a hull or job to place them by; counted, never silently
        // attributed to this pocket.
        unplaceableEvents,
      },
      law: {
        lawfulHullsPeak: lawfulPeak,
        lawEventsPerMin: round3(lawEventCount * (60 / OBSERVE_SECONDS)),
        kinds: LAW_EVENTS.filter((name) => eventCounts[name]),
        // WHO enforces here, and what they are doing — the part a viewer actually reads.
        present: Object.keys(tallyToObject(lawfulKinds)),
        counts: perSample(lawfulKinds),
        dominant: dominant(tallyToObject(lawfulKinds)),
      },
      crime: {
        hostileHullsPeak: hostilePeak,
        crimeEventsPerMin: round3(crimeEventCount * (60 / OBSERVE_SECONDS)),
        kinds: CRIME_EVENTS.filter((name) => eventCounts[name]),
        present: Object.keys(tallyToObject(hostileKinds)),
        counts: perSample(hostileKinds),
        dominant: dominant(tallyToObject(hostileKinds)),
      },
      ships: {
        counts: roles,
        dominant: dominant(roles),
        present: Object.keys(roles),
      },
      structures: {
        counts: structures,
        dominant: dominant(structures),
        present: Object.keys(structures),
      },
      affordance: {
        counts: affordances,
        dominant: dominant(affordances),
        present: Object.keys(affordances),
      },
      aftermath: {
        counts: aftermath,
        dominant: dominant(aftermath),
        present: Object.keys(aftermath),
      },
    },
    eventCounts,
  };
}

// ── Comparison ────────────────────────────────────────────────────────────────────────────────────

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  let shared = 0;
  for (const key of A) if (B.has(key)) shared += 1;
  return shared / (A.size + B.size - shared);
}

/**
 * Does one column read differently to a player watching thirty seconds of each place?
 *
 * TRAP 3. Never "the counts are unequal" — seventeen versus fourteen is not a way of life. A column
 * differs when the thing that DOMINATES it is a different thing, or when the set of things present
 * overlaps by less than half, or when one place has a category the other simply does not, or (for
 * the two numeric columns) when one reading is at least twice the other on a total big enough to
 * see. Each verdict carries the sentence a reviewer would say.
 */
export function columnDiffers(column, a, b) {
  const why = [];
  const set = (x) => (x && Array.isArray(x.present) ? x.present : []);
  const dom = (x) => (x && x.dominant) || null;

  if (column === 'rhythm') {
    const beat = (x) => finite(x && x.phaseChangesPerMin);
    const work = (x) => finite(x && x.workEventsPerMin);
    const pairs = [['phase changes per minute', beat(a), beat(b)], ['work events per minute', work(a), work(b)]];
    for (const [label, x, y] of pairs) {
      const hi = Math.max(x, y);
      const lo = Math.min(x, y);
      if (hi >= 4 && (lo === 0 || hi / Math.max(lo, 1e-9) >= 2)) {
        why.push(`${label}: ${round3(x)} vs ${round3(y)}`);
      }
    }
    const wa = a && a.workShare;
    const wb = b && b.workShare;
    if (wa != null && wb != null && Math.abs(wa - wb) >= 0.25) {
      why.push(`share of the day spent working rather than travelling: ${wa} vs ${wb}`);
    }
    return { differs: why.length > 0, why };
  }

  if (column === 'law' || column === 'crime') {
    const hulls = (x) => finite(x && (x.lawfulHullsPeak != null ? x.lawfulHullsPeak : x.hostileHullsPeak));
    const rate = (x) => finite(x && (x.lawEventsPerMin != null ? x.lawEventsPerMin : x.crimeEventsPerMin));
    const ha = hulls(a);
    const hb = hulls(b);
    if ((ha === 0) !== (hb === 0)) why.push(`one place has ${column === 'law' ? 'lawful' : 'hostile'} hulls on screen and the other has none (${ha} vs ${hb})`);
    else if (Math.max(ha, hb) >= 2 && Math.min(ha, hb) * 2 <= Math.max(ha, hb)) why.push(`${column === 'law' ? 'lawful' : 'hostile'} hulls on screen: ${ha} vs ${hb}`);
    const ra = rate(a);
    const rb = rate(b);
    if ((ra === 0) !== (rb === 0)) why.push(`${column} events fire in one place and never in the other (${ra}/min vs ${rb}/min)`);
    else if (Math.max(ra, rb) >= 2 && Math.min(ra, rb) * 2 <= Math.max(ra, rb)) why.push(`${column} events per minute: ${ra} vs ${rb}`);
    const ka = (a && a.kinds) || [];
    const kb = (b && b.kinds) || [];
    if (jaccard(ka, kb) < 0.5 && (ka.length + kb.length) > 0) why.push(`different ${column} events entirely: [${ka.join(', ')}] vs [${kb.join(', ')}]`);
    // WHO is flying it. Two sectors that both show "one patrol" are the same place until the badge
    // on the patrol, or what it is doing, is different.
    const pa = set(a);
    const pb = set(b);
    if (pa.length + pb.length > 0 && jaccard(pa, pb) < 0.5) {
      why.push(`different ${column === 'law' ? 'enforcers' : 'predators'} entirely: [${pa.join(', ')}] vs [${pb.join(', ')}]`);
    }
    return { differs: why.length > 0, why };
  }

  // verb / ships / structures / affordance / aftermath — categorical.
  const sa = set(a);
  const sb = set(b);
  /**
   * A HOLE IS NOT IDENTITY. If one place shows nothing at all in a column, the honest reading is
   * usually that the bench could not see it, not that the place is defined by an absence — and it
   * flips the instant one hull wanders into the ring, which is the opposite of a stable signature.
   * An empty side therefore only counts when the other side is genuinely furnished (two kinds or
   * more); one lonely category against nothing is thinness, and it is reported as SAME.
   */
  if (sa.length === 0 && sb.length === 0) return { differs: false, why: [] };
  if (sa.length === 0 || sb.length === 0) {
    const furnished = sa.length ? sa : sb;
    if (furnished.length < 2) {
      return {
        differs: false,
        why: [`one side is empty and the other shows only [${furnished.join(', ')}] — too thin to call identity`],
      };
    }
    return {
      differs: true,
      why: [`one place has ${column} and the other has none: [${sa.join(', ')}] vs [${sb.join(', ')}]`],
    };
  }
  const da = dom(a);
  const db = dom(b);
  if (da !== db) why.push(`what dominates is different: ${da || 'nothing'} vs ${db || 'nothing'}`);
  const j = jaccard(sa, sb);
  if (j < 0.5) why.push(`what is present overlaps only ${round3(j)}: [${sa.join(', ')}] vs [${sb.join(', ')}]`);
  const onlyA = sa.filter((k) => !sb.includes(k));
  const onlyB = sb.filter((k) => !sa.includes(k));
  if (onlyA.length && onlyB.length) why.push(`each place has something the other does not: [${onlyA.join(', ')}] vs [${onlyB.join(', ')}]`);
  return { differs: why.length > 0, why };
}

/** Compare two signatures column by column. Exported so the test can pin the rule, not the numbers. */
export function compareSignatures(first, second) {
  const perColumn = {};
  let differing = 0;
  for (const column of IDENTITY_COLUMNS) {
    const verdict = columnDiffers(column, first.columns[column], second.columns[column]);
    perColumn[column] = verdict;
    if (verdict.differs) differing += 1;
  }
  return {
    columns: perColumn,
    differingColumns: differing,
    differingColumnNames: IDENTITY_COLUMNS.filter((c) => perColumn[c].differs),
    required: REQUIRED_DIFFERING_COLUMNS,
    met: differing >= REQUIRED_DIFFERING_COLUMNS,
  };
}

/** Run the whole measurement. Exported so the test drives the same code the bench does. */
export async function measureSectorIdentity(seed) {
  const signatures = {};
  for (const sectorId of IDENTITY_SECTOR_IDS) {
    signatures[sectorId] = await observeSector(seed, sectorId);
  }
  const comparison = compareSignatures(
    signatures[IDENTITY_SECTOR_IDS[0]],
    signatures[IDENTITY_SECTOR_IDS[1]],
  );
  return { seed, signatures, comparison };
}

export const scenario = {
  id: 'world.sector_identity',
  label: 'PQ-143.00 Sector identity — thirty seconds of Helios vs thirty seconds of Ceres (REAL PATH)',

  async run(seed) {
    const result = await measureSectorIdentity(seed);
    const eventTrace = [];
    let tick = 0;
    for (const sectorId of IDENTITY_SECTOR_IDS) {
      eventTrace.push({ tick: tick++, type: 'sector:signature', data: result.signatures[sectorId] });
    }
    eventTrace.push({ tick: tick++, type: 'sector:comparison', data: result.comparison });

    const first = result.signatures[IDENTITY_SECTOR_IDS[0]];
    const second = result.signatures[IDENTITY_SECTOR_IDS[1]];

    return {
      eventTrace,
      metrics: {
        realPathProof: first.realPathProof,
        observeSeconds: OBSERVE_SECONDS,
        signatures: result.signatures,
        comparison: result.comparison,
        bars: [
          {
            bar: 'PQ-143.00',
            label: 'identity columns that read differently across a 30 s watch of each sector',
            value: result.comparison.differingColumns,
            unit: 'of 8 columns',
            met: result.comparison.met,
            note: result.comparison.met
              ? `differ on ${result.comparison.differingColumnNames.join(', ')} — "A player recognises Ceres from thirty seconds of activity and Helios from thirty seconds of different activity — not from a colour grade."`
              : `only ${result.comparison.differingColumns} of 8 differ (${result.comparison.differingColumnNames.join(', ') || 'none'}); the table is not yet true on the route`,
          },
          {
            bar: 'PQ-143.00',
            label: 'actors counted that SG-02 actually simulated, Helios',
            value: first.staging.bodiedFraction == null ? 0 : first.staging.bodiedFraction,
            unit: 'fraction with a physics body',
            met: (first.staging.bodiedFraction || 0) > 0,
            note: `${first.staging.bodiedActors}/${first.staging.censusActors} at the ${first.staging.anchor.source} anchor (${first.staging.anchor.x}, ${first.staging.anchor.z})`,
          },
          {
            bar: 'PQ-143.00',
            label: 'actors counted that SG-02 actually simulated, Ceres',
            value: second.staging.bodiedFraction == null ? 0 : second.staging.bodiedFraction,
            unit: 'fraction with a physics body',
            met: (second.staging.bodiedFraction || 0) > 0,
            note: `${second.staging.bodiedActors}/${second.staging.censusActors} at the ${second.staging.anchor.source} anchor (${second.staging.anchor.x}, ${second.staging.anchor.z})`,
          },
        ],
      },
    };
  },
};

export default scenario;
