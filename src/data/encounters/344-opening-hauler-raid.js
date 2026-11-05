// 344 — Opening hauler raid on the starter freight corridor.
// Guaranteed day-0 teaching encounter: a hauler is actually under attack by pirates close to
// Helios Station so the player can fly in, defend the hauler, steal the spilled cargo, or leave.
// Appended after the migration-era catalogue prefix (orders 010–120): the depth-program loader
// fixture pins that prefix as an immutable migration proof, so post-migration modules take the
// next free order rather than slotting in by theme.
import { deepFreeze, defineEncounter } from './catalog.js';
import { combatFlag } from '../featureFlags.js';
import { addSalvage } from '../../systems/cargo.js';

/** The plate the hauler names when the raiders are actually down. Legal scrap; any dock cashes the bay. */
const OPENING_RAID_PLATE_ID = 'cmdty_comp_hullplate';

function depositOpeningRaidPlate(state) {
  // Instance profile wins, same as the other combat readers. legacy47a keeps the bay off
  // so a frozen golden never grows a salvage field. No player means there is no bay to fill.
  const features = state?.runtime?.features;
  if (!state?.player || !combatFlag('salvageBay', features)) return 0;
  return addSalvage(state, OPENING_RAID_PLATE_ID, 1);
}

export const encounterOrder = 344;

/** What the player hears when the opening raid ends on a choice other than the paid assist. */
export function openingRaidConsequence(outcome) {
  switch (outcome) {
    case 'robbed':
      return {
        from: 'MTS HAULER',
        text: 'The thief left with the cells. You did not stop them.',
      };
    case 'hauler_destroyed':
      return {
        from: 'LANE CONTROL',
        text: 'Hauler destroyed. No hazard pay — the corridor lost the ship.',
      };
    case 'raid_over':
      return {
        from: 'MTS HAULER',
        text: 'You flew on. The hauler and the raiders are still out here.',
      };
    default:
      return null;
  }
}

function sayOpeningConsequence(d, outcome) {
  const line = openingRaidConsequence(outcome);
  if (!line || !d || typeof d.emit !== 'function') return;
  d.emit('comms:log', { from: line.from, text: line.text, kind: 'encounter' });
}

export const trigger = deepFreeze({
  id: 'opening_hauler_raid',
  tier: 'minor',
  deck: 'combat',
  weight: 2.0,
  zoneTypes: ['trade_lane', 'civilian_core'],
  // F11: the live record's script label is the custody family it belongs to. The module's
  // self-registered runtime still wins fire/tick dispatch by shapeId, while 'convoy' lets the
  // freight events (pickup:collected, subsystemDisabled, lifecycle, entityGone) route here.
  script: 'convoy',
  fallbackScript: 'convoy',
  pressureCost: 20,
  cooldownS: 600,
  proximity: true,
  earlyWindowGuaranteeDay: 0,
  // The authored window schedules the raid; a readiness hold and normal admission gates can
  // delay its actual firing. Fire reach bounds world distance, not what the camera can see.
  earlyDelayS: [60, 170],
  fireWithinWu: 230,
  gates: {
    maxSecurity: 1.0,
    sectorIds: ['sector_helios_prime'],
  },
});

// The raid dissolving must not take its cast with it. Detach the squad from the live record
// (the same ids/roles bookkeeping the director's entity-gone handler maintains) so resolve()'s
// straggler sweep finds nothing to stamp with a despawn timer. Spawn budget stays with the ships
// through dir.active until each one actually leaves play — the ordinary population contract.
function stampOpeningFreight(live, manifest, carrier, adopted) {
  const causality = live && live.causality;
  if (!causality || !manifest || typeof manifest.manifestId !== 'string') return;
  const line = Array.isArray(manifest.lines) ? manifest.lines.find((row) => row && row.qty > 0) : null;
  causality.manifestId = manifest.manifestId;
  causality.freightRole = manifest.role || (adopted ? 'ore_carrier' : 'hauler');
  causality.totalQty = manifest.totalQty;
  causality.commodityId = line && line.commodityId || null;
  causality.carrierWorldRecordId = carrier && carrier.data && carrier.data.worldRecordId || null;
  causality.adoptedWorkingBarge = adopted === true;
  if (!adopted || !carrier || !carrier.data) return;
  causality.evidence = `The raid hit the working ore barge. Counted hold ${manifest.manifestId} (${manifest.totalQty}).`;
  carrier.data.encounterFingerprint = causality.fingerprint;
  carrier.data.encounterCausality = { ...causality };
}

// Flying on leaves the raiders in the world. Name the lowest-id one who does not already
// wear a minted callsign, through the same disengage receipt ace memory already keeps.
// Already-named hulls stay off the list so a deadline cannot tier a pilot up a second time.
function rememberOpeningRaidEscape(d, live) {
  const entities = d && d.state && d.state.entities;
  if (!entities || !live || typeof d.emit !== 'function') return;
  const memberIds = [];
  for (const id of live.ids || []) {
    if (!live.roles || live.roles[id] !== 'raider') continue;
    const entity = entities.get(id);
    if (!entity || entity.alive === false || entity.type !== 'ship') continue;
    if (entity.data && entity.data.promotedPilot) continue;
    memberIds.push(id);
  }
  if (!memberIds.length) return;
  memberIds.sort((a, b) => (a === b ? 0 : a > b ? 1 : -1));
  d.emit('pirateDisengage:triggered', {
    squadId: live.id,
    memberIds,
    reason: 'escaped',
    outcome: 'fled',
    source: 'opening_hauler_raid',
    sectorId: live.sectorId,
    t: typeof d.now === 'function' ? d.now() : 0,
  });
}

function releaseSquadToWorld(live, state) {
  if (!live) return;
  const membership = state?.encounterDirector?.squadMembership;
  if (membership && live.id != null) {
    for (const id of live.ids || []) if (membership[id] === live.id) delete membership[id];
  }
  if (Array.isArray(live.ids)) live.ids.length = 0;
  if (live.roles && typeof live.roles === 'object') {
    for (const id of Object.keys(live.roles)) delete live.roles[id];
  }
}

const STARTER_CARRIER_SLOT_ID = 'helios_starter_ore_carrier';
const ADOPTED_AI_KEYS = Object.freeze(['encounterId', 'encounterKind', 'encounterRole', 'sectorId', 'zoneId']);
// The raid adopts only a working ore barge near the player. Distance is not screen visibility.
const STARTER_CARRIER_ADOPT_RANGE = 2 * 115 + 30;
// A rescue is a flight outcome, not a timer or a kill counter: the carrier has to travel
// away from the fight, with its whole original hold, while every remaining raider is clear.
const ESCAPE_TRAVEL_WU = 150;
const ESCAPE_CLEARANCE_WU = 320;
const ESCAPE_CLEAR_SECONDS = 4;

function pointDistance(a, b) {
  if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.z)
      || !Number.isFinite(b.x) || !Number.isFinite(b.z)) return Infinity;
  return Math.hypot(a.x - b.x, a.z - b.z);
}

// Place the guaranteed light hull on the player's side of the freight, with its wing behind it.
// This only changes initial spawn positions; all later motion belongs to the ordinary owners.
// If a real solid makes the picture unsafe, keep the original authored formation instead.
function stageRaidApproach(ships, state, carrier) {
  // The budget may grant only the first two spawns. Put the carrier first (when spawned)
  // and the guaranteed light attacker next, so a valid partial grant keeps the physical toy.
  const raiders = ships.filter((ship) => ship && ship.role === 'raider');
  const light = raiders.find((ship) => ship.archetype === 'wasp_swarmer');
  if (!light) return ships;
  const cast = [...ships.filter((ship) => ship && ship.role !== 'raider'), light,
    ...raiders.filter((ship) => ship !== light)];
  const hauler = carrier || ships.find((ship) => ship && ship.role === 'hauler');
  const player = state.entities && state.entities.get(state.playerId);
  const origin = hauler && hauler.pos;
  if (!origin || !player || !player.pos || !Number.isFinite(origin.x) || !Number.isFinite(origin.z)) return cast;
  const dx = player.pos.x - origin.x, dz = player.pos.z - origin.z;
  const length = Math.hypot(dx, dz);
  if (!(length > 35)) return cast;
  const ux = dx / length, uz = dz / length;
  if (raiders.length < 2) return cast;
  const ordered = [light, ...raiders.filter((ship) => ship !== light)];
  const offsets = [[72, 36], [128, -32], [112, 85]];
  if (ordered.length > offsets.length) return cast;
  const blockers = (state.entityList || []).filter((entity) => entity && entity.alive !== false
    && entity.collides !== false && entity.pos && entity !== carrier
    && ['ship', 'drone', 'asteroid', 'station', 'wreck', 'planet'].includes(entity.type));
  for (const side of [1, -1]) {
    const positions = ordered.map((ship, i) => {
      const [forward, lateral] = offsets[i];
      return { x: origin.x + ux * forward - uz * lateral * side,
        z: origin.z + uz * forward + ux * lateral * side };
    });
    const clear = positions.every((pos, i) => {
      const radius = ordered[i].archetype === 'wasp_swarmer' ? 12 : 18;
      if (pointDistance(pos, origin) < radius + (Number(hauler.radius) || 18) + 20) return false;
      if (blockers.some((body) => pointDistance(pos, body.pos) < radius + (Number(body.radius) || 8) + 16)) return false;
      return positions.slice(0, i).every((other, j) => pointDistance(pos, other)
        >= radius + (ordered[j].archetype === 'wasp_swarmer' ? 12 : 18) + 16);
    });
    if (!clear) continue;
    return cast.map((ship) => {
      const index = ordered.indexOf(ship);
      if (index < 0) return ship;
      const pos = positions[index];
      return { ...ship, pos, ...(ship.entitySpec ? { entitySpec: { ...ship.entitySpec, pos } } : {}) };
    });
  }
  return cast;
}

function notePlayerIntervention(live, state, targetId, now) {
  const escape = live.data && live.data.physicalEscape;
  if (!escape || !live.roles || !['raider', 'hauler'].includes(live.roles[targetId])) return;
  const target = state.entities && state.entities.get(targetId);
  if (!target || target.alive === false || target.data?.ai?.encounterId !== live.id) return;
  if (live.roles[targetId] === 'raider'
      && target.occupantGeneration !== escape.raiderGenerations?.[String(targetId)]) return;
  if (live.roles[targetId] === 'hauler'
      && (target.id !== escape.carrierId || target.occupantGeneration !== escape.generation)) return;
  escape.intervenedAt = now;
}

function carrierEscapedIntact(d, live, state, now) {
  const escape = live.data && live.data.physicalEscape;
  if (!escape || escape.harmedCarrier || !Number.isFinite(escape.intervenedAt) || !state.entities) return false;
  if (!Number.isFinite(now) || now < escape.intervenedAt) {
    escape.intervenedAt = null;
    escape.clearSince = null;
    return false;
  }
  const carrier = state.entities.get(escape.carrierId);
  const manifest = carrier && carrier.data && carrier.data.cargoManifest;
  const custody = live.data.freightCargoCustody;
  if (!escape.origin || !Number.isFinite(escape.origin.x) || !Number.isFinite(escape.origin.z)
      || !Number.isFinite(escape.totalQty) || !(escape.totalQty > 0)
      || !carrier || carrier.alive === false || carrier.data?.disabled === true
      || carrier.occupantGeneration !== escape.generation
      || !manifest || manifest.manifestId !== escape.manifestId
      || Number(manifest.totalQty) !== escape.totalQty
      || !Array.isArray(manifest.lines)
      || JSON.stringify(manifest.lines.map((line) => [line.commodityId, line.qty])) !== escape.lines
      || custody) {
    escape.clearSince = null;
    return false;
  }
  const combat = state.combat?.entities?.[String(carrier.id)];
  if (combat?.capabilities?.drive === false || !Number.isFinite(carrier.pos?.x)
      || !Number.isFinite(carrier.pos?.z) || pointDistance(carrier.pos, escape.origin) < ESCAPE_TRAVEL_WU) {
    escape.clearSince = null;
    return false;
  }
  const raiderIds = (live.ids || []).filter((id) => live.roles && live.roles[id] === 'raider');
  // Missing roster occupants are unknown, not proof that a threat disappeared.
  if (!raiderIds.length || raiderIds.some((id) => {
    const raider = state.entities.get(id);
    if (!raider) return true;
    if (raider.occupantGeneration !== escape.raiderGenerations?.[String(id)]) return true;
    if (raider.alive === false) return false;
    if (!raider.pos || !Number.isFinite(raider.pos.x) || !Number.isFinite(raider.pos.z)) return true;
    const distance = pointDistance(raider.pos, carrier.pos);
    if (distance < ESCAPE_CLEARANCE_WU) return true;
    // A fast attacker outside the boundary is still a threat if its current closing motion
    // would put it back inside the clear zone during the hold. Unknown velocity fails closed.
    if (!Number.isFinite(raider.vel?.x) || !Number.isFinite(raider.vel?.z)
        || !Number.isFinite(carrier.vel?.x) || !Number.isFinite(carrier.vel?.z)) return true;
    const closing = ((raider.vel.x - carrier.vel.x) * (carrier.pos.x - raider.pos.x)
      + (raider.vel.z - carrier.vel.z) * (carrier.pos.z - raider.pos.z)) / distance;
    if (closing > 5 && (distance - ESCAPE_CLEARANCE_WU) / closing <= ESCAPE_CLEAR_SECONDS) return true;
    return false;
  })) {
    escape.clearSince = null;
    return false;
  }
  if (!Number.isFinite(escape.clearSince) || now < escape.clearSince) escape.clearSince = now;
  return now - escape.clearSince >= ESCAPE_CLEAR_SECONDS;
}

// The starter seam's barge, when it is physically hauling real cut ore, is the corridor's actual
// freight. The raid targets that hull instead of inventing a second cargo nobody cut.
function loadedStarterCarrier(state, live) {
  // Admission is measured from the player the raid is delivered to, not the planned hauler.
  const player = state.entities && state.playerId != null ? state.entities.get(state.playerId) : null;
  const ships = live && live.plan && Array.isArray(live.plan.ships) ? live.plan.ships : [];
  const plannedHauler = ships.find((ship) => ship && ship.role === 'hauler');
  const anchor = (player && player.pos) || (plannedHauler && plannedHauler.pos) || (live && live.pos) || null;
  let best = null;
  let bestD2 = STARTER_CARRIER_ADOPT_RANGE * STARTER_CARRIER_ADOPT_RANGE;
  for (const entity of state.entityList || []) {
    const data = entity && entity.data;
    if (!data || entity.alive === false || entity.type !== 'ship' || !entity.pos
      || data.activityActorSlotId !== STARTER_CARRIER_SLOT_ID
      || data.disabled === true || data.predationEncounterId != null
      || (data.ai && data.ai.squadId)) continue;
    const manifest = data.cargoManifest;
    if (!manifest || typeof manifest.manifestId !== 'string' || !(manifest.totalQty > 0)
      || !Array.isArray(manifest.lines) || !manifest.lines.some((line) => line && line.qty > 0)) continue;
    const d2 = anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.z)
      ? (entity.pos.x - anchor.x) ** 2 + (entity.pos.z - anchor.z) ** 2 : 0;
    if (d2 <= bestD2 && (!best || d2 < bestD2 || entity.id < best.id)) { best = entity; bestD2 = d2; }
  }
  return best;
}

// Read-only scheduling seam for the director owner: true when a nearby starter barge is carrying
// real cut ore, so firing now can hit the corridor's actual freight.
export function openingRaidCarrierReady(state) {
  return !!(state && loadedStarterCarrier(state, null));
}

// Raiders keep the authored curtain geometry, re-centred on the real barge.
function raidersAroundCarrier(ships, carrier) {
  const plannedHauler = ships.find((ship) => ship && ship.role === 'hauler');
  const origin = plannedHauler && plannedHauler.pos;
  return ships.filter((ship) => ship && ship.role !== 'hauler').map((ship) => {
    const shift = (pos) => (pos && origin && Number.isFinite(pos.x) && Number.isFinite(pos.z)
      ? { ...pos, x: pos.x - origin.x + carrier.pos.x, z: pos.z - origin.z + carrier.pos.z }
      : pos);
    const out = { ...ship, pos: shift(ship.pos) };
    if (ship.entitySpec && ship.entitySpec.pos) out.entitySpec = { ...ship.entitySpec, pos: shift(ship.entitySpec.pos) };
    return out;
  });
}

// The barge goes back to its own owner exactly as it was: custody suppression lasted for this raid.
function releaseAdoptedCarrier(d, live) {
  const adopted = live.data && live.data.adoptedCarrier;
  if (!adopted || adopted.released === true) return;
  adopted.released = true;
  const entity = d.state && d.state.entities && d.state.entities.get(adopted.entityId);
  if (Array.isArray(live.ids)) {
    const index = live.ids.indexOf(adopted.entityId);
    if (index >= 0) live.ids.splice(index, 1);
  }
  const membership = d.state?.encounterDirector?.squadMembership;
  if (membership && membership[adopted.entityId] === live.id) delete membership[adopted.entityId];
  if (live.roles) delete live.roles[adopted.entityId];
  if (!entity || !entity.data || entity.data.worldRecordId !== adopted.worldRecordId
      || entity.occupantGeneration !== adopted.generation) return;
  if (entity.alive === false) return;
  // A living barge goes back to its own work. The fingerprint stays only on a hull this raid
  // killed, so a later unrelated death does not inherit the opening cause.
  delete entity.data.encounterFingerprint;
  delete entity.data.encounterCausality;
  const restore = adopted.restore || {};
  for (const key of ['freightRewardOwner', 'bountyCr', 'loot']) {
    if (restore[key] === undefined) delete entity.data[key];
    else entity.data[key] = restore[key];
  }
  const ai = entity.data.ai;
  if (ai && ai.encounterId === live.id) {
    for (const key of ADOPTED_AI_KEYS) {
      const prior = adopted.restoreAi ? adopted.restoreAi[key] : undefined;
      if (prior === undefined) delete ai[key];
      else ai[key] = prior;
    }
  }
}

// Only the encounter-created fallback needs a helm order. A working ore barge keeps its
// own job; this civilian instead flies toward the real station without inventing a berth.
function sendFallbackTowardHelios(d, live, state, carrier) {
  if (live.data?.adoptedCarrier || !carrier || carrier.id === state.playerId
      || carrier.id === state.player?.entityId || carrier.isPlayer === true || carrier.data?.shipjackParked === true
      || state.entities?.get(carrier.id) !== carrier || carrier.alive === false) return;
  const data = carrier.data;
  const ai = data?.ai;
  const vesselId = data?.vesselId;
  if (!ai || !data.cargoManifest || (vesselId != null
      && state.player?.ownedShips?.some((ship) => ship?.vesselId === vesselId))) return;
  const port = d.helpers?.aiManeuver;
  if (typeof port?.claimActivity !== 'function' || typeof port.captureActivity !== 'function') return;
  const row = state.world?.activeSector?.stations?.find((entry) => entry.stationId === 'station_helios');
  const station = row && state.entities?.get(row.id);
  if (state.world?.currentSectorId !== 'sector_helios_prime' || !station || station.alive === false
      || station.type !== 'station' || station.data?.stationId !== 'station_helios'
      || !Number.isFinite(station.pos?.x) || !Number.isFinite(station.pos?.z)
      || !Number.isFinite(carrier.pos?.x) || !Number.isFinite(carrier.pos?.z)) return;
  const dx = carrier.pos.x - station.pos.x, dz = carrier.pos.z - station.pos.z;
  const distance = Math.hypot(dx, dz);
  const standoff = Math.max(0, Number(station.radius) || 0) + Math.max(0, Number(carrier.radius) || 0) + 80;
  if (distance <= standoff) return;
  const previousActivity = ai.activity, previousPassiveManeuver = ai.allowPassiveManeuver;
  const activity = { ...previousActivity, kind: 'transit', reason: 'vignette_motion:opening_freight_escape',
    anchor: { x: station.pos.x + dx / distance * standoff, z: station.pos.z + dz / distance * standoff },
    anchorVelocity: null, targetId: null, preferredRange: 0 };
  ai.activity = activity;
  ai.allowPassiveManeuver = true;
  const lease = port.claimActivity(carrier, activity, { onCapture: () => {
    if (ai.activity === activity) ai.activity = null;
    if (ai.allowPassiveManeuver === true) {
      if (previousPassiveManeuver === undefined) delete ai.allowPassiveManeuver;
      else ai.allowPassiveManeuver = previousPassiveManeuver;
    }
  } });
  if (!lease) {
    ai.activity = previousActivity;
    if (previousPassiveManeuver === undefined) delete ai.allowPassiveManeuver;
    else ai.allowPassiveManeuver = previousPassiveManeuver;
  }
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    // Deadline lands before spawnShips so the spawned activities bake the real deadlineTick.
    live.deadlineAt = d.now() + (live.shape.transitS || 60);
    const carrier = loadedStarterCarrier(state, live);
    const ships = carrier ? raidersAroundCarrier(live.plan.ships, carrier) : live.plan.ships;
    const ids = d.spawnShips(live, stageRaidApproach(ships, state, carrier));
    if (carrier && ids.length) {
      const cdata = carrier.data;
      live.ids.push(carrier.id);
      live.roles[carrier.id] = 'hauler';
      const ai = cdata.ai || (cdata.ai = {});
      const restoreAi = {};
      for (const key of ADOPTED_AI_KEYS) restoreAi[key] = ai[key];
      // The same squad-frame stamps spawnShips gives a planned hull, so predation binds this barge.
      ai.encounterId = live.id;
      ai.encounterKind = live.shapeId;
      ai.encounterRole = 'hauler';
      ai.sectorId = live.sectorId;
      ai.zoneId = live.zoneId;
      live.data.adoptedCarrier = {
        entityId: carrier.id,
        generation: carrier.occupantGeneration,
        worldRecordId: cdata.worldRecordId || null,
        slotId: STARTER_CARRIER_SLOT_ID,
        manifestId: cdata.cargoManifest.manifestId,
        restore: {
          freightRewardOwner: cdata.freightRewardOwner,
          bountyCr: cdata.bountyCr,
          loot: cdata.loot,
        },
        restoreAi,
      };
    }
    // A partial budget grant that lands the hauler alone would resolve 'defended' for a raid
    // that never existed — the premise needs a hauler AND at least one raider on the field.
    if (!ids.length || d.aliveCount(live, 'hauler') < 1 || d.aliveCount(live, 'raider') < 1) {
      releaseAdoptedCarrier(d, live);
      return d.abort(live, 'no_budget');
    }
    // VERB-02: the raid is already happening — no consent dialog, no pass-on-timeout. Every
    // raider opens committed onto the hauler through the combat focus track the squad frame
    // reads, under the thief doctrine's sanctioned first-fire on MTS hulls. The stamp is a
    // focus track, not an activity pin: a raider the player shoots stays free to turn and
    // answer. The player declares a side with guns (kill raiders = defend, kill the hauler
    // = raid) or just flies on.
    const hauler = d.entsOf(live, 'hauler')[0];
    for (const raider of d.entsOf(live, 'raider')) {
      const data = raider.data || (raider.data = {});
      if (data.ai) data.ai.targetId = hauler.id;
      (data.combat || (data.combat = {})).targetId = hauler.id;
    }
    // VERB-06: the opener hauls a volatile lot — fuel cells are the explosive class lootShards
    // already cooks off on a hard slam. Ordinary civilian role + cargo fields let the existing
    // violence-spill path shed the pods; no encounter-specific plumbing.
    if (hauler && live.data.adoptedCarrier) {
      const hdata = hauler.data;
      const real = hdata.cargoManifest;
      // F11 on the real hold: custody tracks the ore this barge physically collected at the seam.
      live.data.freightManifest = {
        manifestId: real.manifestId,
        freighterKey: real.freighterKey || hdata.worldRecordId || `encounter:${live.id}`,
        role: real.role || 'ore_carrier',
        lines: real.lines.filter((line) => line && line.qty > 0)
          .map((line) => ({ commodityId: line.commodityId, qty: line.qty })),
        totalQty: real.totalQty,
      };
      hdata.bountyCr = 0;
      hdata.loot = null;
      hdata.freightRewardOwner = 'manifest_custody';
      stampOpeningFreight(live, live.data.freightManifest, hauler, true);
    } else if (hauler) {
      const band = live.shape.unitsPerHauler || [6, 10];
      const qty = Math.max(1, Math.round(
        band[0] + d.stream(live, 'cargo')() * Math.max(0, band[1] - band[0]),
      ));
      const hdata = hauler.data || (hauler.data = {});
      hdata.jobKind = 'hauler';
      hdata.cargo = { cmdty_fuel_cells: qty };
      // F11: the same hold is the authored manifest the freight-custody stack tracks, so a
      // raider who wins the fight physically carries the cargo out — it does not vanish with
      // the hull. The generic bounty/loot roll is suppressed; custody owns the physical spill.
      live.data.freightManifest = {
        manifestId: `fm_encounter_${live.id}`,
        freighterKey: `encounter:${live.id}`,
        role: 'hauler',
        lines: [{ commodityId: 'cmdty_fuel_cells', qty }],
        totalQty: qty,
      };
      hdata.bountyCr = 0;
      hdata.loot = null;
      hdata.freightRewardOwner = 'manifest_custody';
      hdata.cargoManifest = {
        manifestId: live.data.freightManifest.manifestId,
        freighterKey: live.data.freightManifest.freighterKey,
        role: 'hauler',
        lines: [{ commodityId: 'cmdty_fuel_cells', qty }],
        totalQty: qty,
      };
      stampOpeningFreight(live, hdata.cargoManifest, hauler, false);
      sendFallbackTowardHelios(d, live, state, hauler);
    }
    if (hauler && hauler.pos && Number.isFinite(hauler.pos.x) && Number.isFinite(hauler.pos.z)
        && hauler.data?.cargoManifest) {
      const manifest = hauler.data.cargoManifest;
      live.data.physicalEscape = {
        carrierId: hauler.id, generation: hauler.occupantGeneration,
        manifestId: manifest.manifestId, totalQty: Number(manifest.totalQty),
        lines: JSON.stringify(manifest.lines.map((line) => [line.commodityId, line.qty])),
        origin: { x: hauler.pos.x, z: hauler.pos.z }, intervenedAt: null, clearSince: null,
        raiderGenerations: Object.fromEntries((live.ids || [])
          .filter((id) => live.roles?.[id] === 'raider')
          .map((id) => [String(id), state.entities?.get(id)?.occupantGeneration])),
      };
    }
    live.phase = 'conflict';
    if (hauler && live.data.adoptedCarrier?.entityId === hauler.id
        && live.data.adoptedCarrier.generation === hauler.occupantGeneration
        && live.data.adoptedCarrier.worldRecordId === hauler.data.worldRecordId
        && live.data.adoptedCarrier.manifestId === hauler.data.cargoManifest?.manifestId) {
      const data = hauler.data;
      const name = String(data.callsign || data.trafficLabel || data.scanLabel || data.name || 'ORE BARGE')
        .replace(/\s+/g, ' ').trim().toUpperCase();
      d.say(live, 'alert', `${name}: Keep them off this load.`, null, { primary: true, literal: true });
    } else {
      d.say(live, 'alert', 'curtain_convoy_alert', null, { primary: true });
    }
  },

  event(d, live, state, name, payload) {
    if (!payload || live.phase !== 'conflict') return;
    if (name === 'tetherAttached' && payload.actorId === state.playerId) {
      notePlayerIntervention(live, state, payload.targetId, state.simTime || 0);
      // A player physically grabbing the bound thief provokes the same retaliation as a hit.
      // The existing owner handles stolen cargo and doctrine; no velocity or AI pose is imposed.
      if (live.roles?.[payload.targetId] === 'raider'
          && typeof d._releasePredationRaiderForRetaliation === 'function') {
        d._releasePredationRaiderForRetaliation(payload.targetId, state.playerId);
      }
    } else if (name === 'playerHitSquad' && payload.attackerId === state.playerId
        && Number(payload.applied) > 0) {
      if (live.roles?.[payload.targetId] === 'hauler') {
        if (live.data.physicalEscape) live.data.physicalEscape.harmedCarrier = true;
      } else {
        notePlayerIntervention(live, state, payload.targetId, state.simTime || 0);
      }
    }
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    // Cargo in play outranks the raid's own resolution: while the custody ledger is open the
    // winner is still flying, and nobody despawns with the pod.
    const custody = live.data.freightCargoCustody;
    const custodyOpen = !!(custody && custody.terminal !== true);
    const haulerAlive = d.aliveCount(live, 'hauler') > 0;
    const raidersAlive = d.aliveCount(live, 'raider') > 0;

    if (!haulerAlive) {
      if (custodyOpen) return;
      releaseAdoptedCarrier(d, live);
      d.despawnAll(live, 12);
      const outcome = custody && custody.raiderEscaped ? 'robbed' : 'hauler_destroyed';
      sayOpeningConsequence(d, outcome);
      return d.resolve(live, outcome, { speak: false });
    }

    if (!raidersAlive) {
      if (custodyOpen) return;
      if (custody && custody.raiderEscaped) {
        // The winner already left reach with the pod — there is no rescue left to pay for.
        releaseAdoptedCarrier(d, live);
        d.despawnAll(live, 15, 'hauler');
        sayOpeningConsequence(d, 'robbed');
        return d.resolve(live, 'robbed', { speak: false });
      }
      d.grant(250, 'convoy:guard');
      d.rep('faction_mts', 5, 'hauler_rescued');
      depositOpeningRaidPlate(state);
      d.emit('comms:log', {
        from: 'MTS HAULER',
        text: 'All raiders down! Thank you for the assist, pilot. Hazard pay transferred. Their plate\'s in your bay — any dock pays.',
        kind: 'encounter',
      });
      releaseAdoptedCarrier(d, live);
      d.despawnAll(live, 15, 'hauler');
      return d.resolve(live, 'defended', { speak: true });
    }

    if (!custodyOpen && carrierEscapedIntact(d, live, state, now)) {
      // Ask the freight owner to retire only its exact unspilled carrier annotation. If it
      // refuses, keep the encounter alive: an apparently rescued worker must not stay pinned.
      const escape = live.data.physicalEscape;
      if (typeof d._scriptEvent !== 'function') return;
      d._scriptEvent(live, 'openingCarrierEscaped', escape);
      const carrier = state.entities.get(escape.carrierId);
      if (live.phase !== 'conflict') return;
      if (!carrier || carrier.occupantGeneration !== escape.generation
          || carrier.data?.freightCustody || carrier.data?.freightCustodyCarrierIdentityKey) {
        escape.clearSince = null;
        return;
      }
      // Clear the real predation bindings while the roster still exists. The surviving hulls and
      // their cargo remain world bodies; neither a roster clear nor a receipt teleports them.
      if (typeof d.clearPredation === 'function') d.clearPredation(live, 'carrier_escaped_intact');
      d.grant(250, 'convoy:guard');
      d.rep('faction_mts', 5, 'hauler_rescued');
      d.emit('comms:log', { from: 'MTS HAULER',
        text: 'We have room to run, and the whole hold is still aboard. Hazard pay transferred.',
        kind: 'encounter' });
      if (live.causality) live.causality.resolutionMethod = 'physical_escape';
      releaseAdoptedCarrier(d, live);
      releaseSquadToWorld(live, state);
      return d.resolve(live, 'defended', { speak: false });
    }

    if (now >= live.deadlineAt) {
      if (custodyOpen) return;
      // The raiders gave up and the hauler survived — 'hauler_destroyed' would misreport the
      // outcome into stats, receipts, and resolved fingerprints.
      // The scripted beat closes; the cast does not delete itself. Released from the live
      // record, the hauler keeps flying and the raiders keep being pirates as ordinary world
      // entities the player can still fight, save, or rob after the encounter has ended.
      releaseAdoptedCarrier(d, live);
      rememberOpeningRaidEscape(d, live);
      releaseSquadToWorld(live, state);
      sayOpeningConsequence(d, 'raid_over');
      return d.resolve(live, 'raid_over', { speak: false });
    }
  },

});

export default defineEncounter(trigger, {
  shape: {
    situation: 'convoy',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_reach',
  },
  motive: 'cargo_raid',
  engagementTrigger: 'authorized_hostile_spawn',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'HAULER UNDER ATTACK',
  primaryLine: 'DISTRESS RELAY: Local hauler taking heavy fire from raiders on the freight corridor!',
  squad: {
    anchorArchetype: 'reaver_pirate',
    archetypes: ['reaver_pirate', 'wasp_swarmer'],
    // The opening fight must always field a throwable hull — a no-wasp draw leaves nothing
    // in the raid lighter than the player's ship, so the scripted tether beat cannot exist.
    guaranteeArchetypes: ['wasp_swarmer'],
    size: [3, 3],
    clusterRadius: 75,
    minSeparation: 38,
    doctrine: 'thief',
    formation: 'wedge',
  },
  civilian: {
    archetypes: ['mule_trader'],
    size: [1, 1],
    factionId: 'faction_mts',
    context: 'civilian',
    team: 2,
    passive: true,
  },
  // F11: one raider is the designated thief under the shared freight-custody stack — hotStart
  // because the fight is already committed when custody opens: nobody stands down, the thief
  // opens on the active approach (its 3s no-fire window still gates real weapons release), and
  // once the carrier spills it picks the pods up physically and runs a finite in-sector
  // escape point.
  predation: {
    enabled: true,
    hotStart: true,
    raiderRole: 'raider',
    carrierRole: 'hauler',
    motive: 'cargo_raid',
    engagementTrigger: 'manifest_predation',
    responseWindowS: 3,
    objectiveS: 60,
    leashRadius: 2600,
    escapeHoldS: 3,
  },
  bark: 'curtain_convoy_alert',
  transitS: 60,
  unitsPerHauler: [6, 10],
});
