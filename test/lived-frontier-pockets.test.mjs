// CR-HOLLOW-4 — the lived-in frontier. Seven sectors that used to open on anonymous ambient
// scatter (or, in the hollow rims Veil and Ashfall, on nothing at all) now open with the shift
// already under way: Veil Nebula, Ashfall Reach, Io Reach, Charon Expanse, Dione Lane, Nereid Shoal
// and Hyperion Cut — two pockets, four hulls each.
//
// The done sentence: arriving in any of those sectors shows work in progress within the
// camera-local bands — a tender on its round, a hauler on its lane, a salvor on a plate, a miner on
// a face — flown by job kinds the runtime already owns, nobody arriving shooting, law hulls only
// where the sector has law (Io's contested lane, Dione's toll spur), and every route aimed at a
// place the zone ledger names. Proved on the default seed 4242 against the live traffic owner,
// through the same discovery readers Ceres uses.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTIVITY_POCKETS,
  ACTIVITY_POCKETS_BY_SECTOR,
  ACTIVITY_POCKET_SECTOR_IDS,
  LIVED_FRONTIER_SECTOR_IDS,
  LIVED_FRONTIER_SETS,
  activityActorSlotById,
  activityPocketById,
  activityPocketsForSector,
  activityRouteTopologyForSector,
  distanceFromPocketAnchor,
  routeTopologyClass,
} from '../src/data/sectorActivityPockets.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';
import { SECTOR_ZONES } from '../src/data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { SECTORS } from '../src/data/sectors.js';
import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { TRAFFIC_ROLES, traffic } from '../src/systems/traffic.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { factions } from '../src/systems/factions.js';
import { heat } from '../src/systems/heat.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';

const SEED = 4242;

const EXPECTED_SECTORS = [
  'sector_veil_nebula',
  'sector_ashfall_reach',
  'sector_io_reach',
  'sector_charon_expanse',
  'sector_dione_lane',
  'sector_nereid_shoal',
  'sector_hyperion_cut',
];
// The only places this frontier keeps law: the contested lane at Io, the toll spur at Dione.
const LAW_PATROLS = new Set(['io_cruiser_picket', 'dione_toll_patrol']);
// Job kinds the pocket runtime owns (a 'tender' jobKind would materialize jobless — see Pallas).
const RUNTIME_JOB_KINDS = ['hauler', 'miner', 'surveyor', 'patrol', 'salvor'];

const bearingOf = (from, to) => Math.atan2(to.z - from.z, to.x - from.x);
const bearingDelta = (a, b) => {
  let d = Math.abs(a - b);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d;
};

/** A named place a route aims at, resolved from the authored geography — never from the pockets. */
function place(sectorId, ref) {
  const anchors = SECTOR_ANCHORS[sectorId];
  const zones = SECTOR_ZONES[sectorId];
  const [kind, id] = ref.split(':');
  if (kind === 'station') return anchors.stations.find((s) => s.id === id).pos;
  if (kind === 'poi') return anchors.pois.find((p) => p.id === id).pos;
  if (kind === 'field') return anchors.fields.find((f) => f.id === id).center;
  if (kind === 'zone') return zones.find((z) => z.id === id).center;
  throw new Error(`unknown place ref ${ref}`);
}

// Every claimed aim: [sector, actor slot, mark id, place the mark's bearing must point at].
const AIMS = [
  ['sector_veil_nebula', 'veil_instrument_tender', 'veil_tender_anomaly_leg', 'zone:zone_veil_anomaly'],
  ['sector_veil_nebula', 'veil_dish_listener', 'veil_dish_revoked_face', 'zone:zone_veil_revoked_gate'],
  ['sector_veil_nebula', 'veil_ice_prospector', 'veil_prospector_fog_face', 'zone:zone_veil_fog'],
  ['sector_veil_nebula', 'veil_ice_hauler', 'veil_hauler_rack_leg', 'station:station_veil'],
  ['sector_ashfall_reach', 'ashfall_cache_salvor', 'ashfall_salvor_maw_face', 'poi:poi_vault_maw'],
  ['sector_ashfall_reach', 'ashfall_cache_runner', 'ashfall_runner_strongbox_leg', 'poi:poi_vault'],
  ['sector_ashfall_reach', 'ashfall_seam_miner', 'ashfall_miner_seam_face', 'field:f_ash_1'],
  ['sector_ashfall_reach', 'ashfall_edge_surveyor', 'ashfall_surveyor_maintenance_bearing', 'zone:zone_ashfall_maintenance'],
  ['sector_io_reach', 'io_waystation_hauler', 'io_hauler_claim_leg', 'poi:poi_claim_pallas'],
  ['sector_io_reach', 'io_waystation_tender', 'io_tender_ring_leg', 'zone:zone_io_shepherds_ring'],
  ['sector_io_reach', 'io_cruiser_salvor', 'io_salvor_station_face', 'station:station_reach'],
  ['sector_io_reach', 'io_cruiser_picket', 'io_picket_lane_end', 'zone:zone_io_contest'],
  ['sector_charon_expanse', 'charon_ore_hauler', 'charon_hauler_belt_leg', 'zone:zone_charon_belt'],
  ['sector_charon_expanse', 'charon_air_tender', 'charon_tender_colony_leg', 'zone:zone_charon_colony'],
  ['sector_charon_expanse', 'charon_colony_salvor', 'charon_salvor_freighter_face', 'zone:zone_charon_warm_freighter'],
  ['sector_charon_expanse', 'charon_colony_hauler', 'charon_colony_air_leg', 'station:station_expanse'],
  ['sector_dione_lane', 'dione_exchange_hauler', 'dione_hauler_relay_leg', 'zone:zone_dione_relay'],
  ['sector_dione_lane', 'dione_toll_patrol', 'dione_patrol_customs_end', 'station:station_dione_customs'],
  ['sector_dione_lane', 'dione_relay_keeper', 'dione_keeper_exchange_face', 'station:station_dione'],
  ['sector_dione_lane', 'dione_convoy_hauler', 'dione_convoy_manifest_leg', 'station:station_dione_customs'],
  ['sector_nereid_shoal', 'nereid_waystation_hauler', 'nereid_hauler_claim_leg', 'station:station_nereid_claim'],
  ['sector_nereid_shoal', 'nereid_waystation_tender', 'nereid_tender_wreck_leg', 'poi:poi_nereid_wreck'],
  ['sector_nereid_shoal', 'nereid_shoal_miner', 'nereid_miner_face', 'station:station_nereid'],
  ['sector_nereid_shoal', 'nereid_shoal_collector', 'nereid_collector_pod_leg', 'station:station_nereid_claim'],
  ['sector_hyperion_cut', 'hyperion_yard_hauler', 'hyperion_hauler_seam_leg', 'zone:zone_hyperion_belt'],
  ['sector_hyperion_cut', 'hyperion_yard_tender', 'hyperion_tender_claim_leg', 'station:station_hyperion_claim'],
  ['sector_hyperion_cut', 'hyperion_seam_miner', 'hyperion_miner_pod_leg', 'station:station_hyperion_cut'],
  ['sector_hyperion_cut', 'hyperion_seam_surveyor', 'hyperion_surveyor_driller_leg', 'poi:poi_hyperion_driller'],
];

test('the lived frontier joins the registry: seven sectors, two pockets and four hulls each', () => {
  assert.deepEqual([...LIVED_FRONTIER_SECTOR_IDS].sort(), [...EXPECTED_SECTORS].sort());
  for (const sectorId of EXPECTED_SECTORS) {
    assert.ok(ACTIVITY_POCKET_SECTOR_IDS.includes(sectorId), `${sectorId} is in the registry`);
    const set = LIVED_FRONTIER_SETS[sectorId];
    assert.equal(ACTIVITY_POCKETS_BY_SECTOR[sectorId], set.pockets);
    assert.equal(activityPocketsForSector(sectorId).length, 2, `${sectorId}: two pockets`);
    assert.equal(set.capacity, 4, `${sectorId}: four authored hulls`);
    assert.equal(set.actorSlotOrder.length, set.capacity);
    assert.equal(activityRouteTopologyForSector(sectorId).length, set.capacity);
    for (const pocket of set.pockets) {
      assert.equal(pocket.sectorId, sectorId);
      assert.equal(pocket.actorSlots.length, 2, `${pocket.id}: two actors`);
      assert.equal(activityPocketById(pocket.id), pocket, `${pocket.id} resolves through the shared reader`);
    }
    for (const slotId of set.actorSlotOrder) {
      const slot = activityActorSlotById(slotId);
      assert.ok(slot, `${slotId} resolves through the shared reader`);
      assert.equal(slot.worldRecordSlotId, `${set.namespace}:activity:${slotId}`, 'durable slot namespace');
    }
  }
  // Slot and pocket ids stay unique across the WHOLE registry, not just inside one sector.
  const allSlots = ACTIVITY_POCKETS.flatMap((p) => p.actorSlots.map((s) => s.id));
  assert.equal(new Set(allSlots).size, allSlots.length, 'every authored slot id is globally unique');
  const allPockets = ACTIVITY_POCKETS.map((p) => p.id);
  assert.equal(new Set(allPockets).size, allPockets.length, 'every pocket id is globally unique');
  const allObjects = ACTIVITY_POCKETS.flatMap((p) => p.objectSlots.map((o) => o.id));
  assert.equal(new Set(allObjects).size, allObjects.length, 'every object slot id is globally unique');
});

test('lived-frontier pockets obey the Ceres band, anchor and topology laws', () => {
  for (const sectorId of EXPECTED_SECTORS) {
    const set = LIVED_FRONTIER_SETS[sectorId];
    const anchors = SECTOR_ANCHORS[sectorId];
    const zones = SECTOR_ZONES[sectorId];
    for (const pocket of set.pockets) {
      // The anchor is authored geography: the station's own position, or a real zone's heart.
      const a = pocket.activityAnchor;
      if (a.kind === 'station') {
        const station = anchors.stations.find((s) => s.id === a.id);
        assert.ok(station, `${pocket.id}: anchor station exists`);
        assert.deepEqual(a.localPos, { x: station.pos.x, z: station.pos.z });
        if (a.zoneId) {
          const zone = zones.find((z) => z.id === a.zoneId);
          assert.ok(zone, `${pocket.id}: station claims a real zone`);
          assert.deepEqual(a.localPos, { x: zone.center.x, z: zone.center.z });
        }
      } else {
        assert.equal(a.kind, 'zone', `${pocket.id}: station or zone anchors only`);
        const zone = zones.find((z) => z.id === a.zoneId);
        assert.ok(zone, `${pocket.id}: anchors on a real zone`);
        assert.deepEqual(a.localPos, { x: zone.center.x, z: zone.center.z });
        if (pocket.pq020Identity.fieldId) {
          const field = anchors.fields.find((f) => f.id === pocket.pq020Identity.fieldId);
          assert.ok(field, `${pocket.id}: claimed field exists`);
          assert.deepEqual(a.localPos, { x: field.center.x, z: field.center.z });
        }
      }
      for (const slot of pocket.actorSlots) {
        assert.ok(distanceFromPocketAnchor(slot.spawnOffset) <= 95, `${slot.id}: spawn inside the immediate band`);
        assert.equal(slot.route.marks.length, 2);
        for (const m of slot.route.marks) {
          const d = distanceFromPocketAnchor(m.offset);
          assert.ok(d > 95 && d <= 125, `${slot.id}/${m.id} at ${d.toFixed(1)} WU: inside the moving band`);
          const pos = sectorLocalToGlobalForSector({
            x: a.localPos.x + m.offset.x,
            z: a.localPos.z + m.offset.z,
          }, sectorId);
          assert.ok(pos && Number.isFinite(pos.x) && Number.isFinite(pos.z), `${slot.id}/${m.id} resolves in-sector`);
        }
        assert.ok(slot.route.durationS > 0, `${slot.id}: has a duration`);
      }
      for (const object of pocket.objectSlots) {
        assert.ok(distanceFromPocketAnchor(object.offset) <= 95, `${object.id}: inside the immediate band`);
      }
    }
    // No two routes in a sector read as the same shape — derived from the marks, not declared.
    const classes = set.routeTopology.map(routeTopologyClass);
    assert.equal(new Set(classes).size, classes.length, `${sectorId}: distinct route shapes (${classes.join(', ')})`);
    const pocketShapes = set.pockets.map((p) => set.routeTopology
      .filter((row) => row.pocketId === p.id).map(routeTopologyClass).sort().join('+'));
    assert.equal(new Set(pocketShapes).size, pocketShapes.length, `${sectorId}: distinct pocket shapes`);
  }
});

test('every actor flies a job kind the runtime owns, on a hull the traffic table can draw', () => {
  for (const sectorId of EXPECTED_SECTORS) {
    const slots = LIVED_FRONTIER_SETS[sectorId].pockets.flatMap((p) => p.actorSlots);
    for (const slot of slots) {
      assert.ok(RUNTIME_JOB_KINDS.includes(slot.jobKind), `${slot.id}: runtime job kind ${slot.jobKind}`);
      assert.equal(slot.route.jobKind, slot.jobKind, `${slot.id}: route and slot agree on the kernel`);
      const role = TRAFFIC_ROLES[slot.presentationRole];
      assert.ok(role && role.ship, `${slot.id}: role ${slot.presentationRole} resolves to a hull`);
      assert.equal(slot.passive, true, `${slot.id}: arrives working, not shooting`);
      assert.equal(slot.lawful, LAW_PATROLS.has(slot.id), `${slot.id}: law only where the sector keeps law`);
      // A miner route that claims an extraction receipt must name the field it works.
      if (slot.route.receiptType === 'mining:npcExtraction') {
        assert.ok(slot.route.marks.some((m) => String(m.targetRef).startsWith('field:')),
          `${slot.id}: an extraction receipt needs a field to extract from`);
      }
      // A freight arrival must end at the real berth, not at an abstract mark.
      if (slot.route.receiptType === 'freight:arrival') {
        assert.ok(slot.route.marks.some((m) => String(m.targetRef).startsWith('dest:station_')),
          `${slot.id}: a freight arrival needs a real destination`);
      }
    }
    const verbs = new Set(slots.map((s) => s.jobKind));
    assert.ok(verbs.size >= 3, `${sectorId}: a shift of distinct verbs (${[...verbs].join(', ')})`);
  }
});

test('the marks aim where the zone ledger says: every claimed route points at a named place', () => {
  for (const [sectorId, slotId, markId, ref] of AIMS) {
    const slot = activityActorSlotById(slotId);
    assert.ok(slot, `${slotId} exists`);
    const pocket = activityPocketById(slot.pocketId);
    const anchor = pocket.activityAnchor.localPos;
    const markRow = slot.route.marks.find((m) => m.id === markId);
    assert.ok(markRow, `${slotId} has mark ${markId}`);
    const aimed = Math.atan2(markRow.offset.z, markRow.offset.x);
    const truth = bearingOf(anchor, place(sectorId, ref));
    assert.ok(bearingDelta(aimed, truth) < 0.05,
      `${markId} aims at ${ref} (${(bearingDelta(aimed, truth) * 180 / Math.PI).toFixed(2)} deg off)`);
  }
});

test('every pocket object sits on the bearing of the route mark that names it', () => {
  let checked = 0;
  for (const sectorId of EXPECTED_SECTORS) {
    for (const pocket of LIVED_FRONTIER_SETS[sectorId].pockets) {
      for (const object of pocket.objectSlots) {
        const mark = pocket.actorSlots.flatMap((s) => s.route.marks).find((m) => m.targetRef === object.targetRef);
        assert.ok(mark, `${object.id}: some route mark names it (${object.targetRef})`);
        const objectBearing = Math.atan2(object.offset.z, object.offset.x);
        const markBearing = Math.atan2(mark.offset.z, mark.offset.x);
        assert.ok(bearingDelta(objectBearing, markBearing) < 0.05,
          `${object.id} sits under ${mark.id} (${(bearingDelta(objectBearing, markBearing) * 180 / Math.PI).toFixed(2)} deg off)`);
        checked += 1;
      }
    }
  }
  assert.equal(checked, 7, 'seven authored objects across the frontier');
});

test('the hollow rims keep their silence by count: Veil and Ashfall add four hulls each, nothing more', () => {
  for (const sectorId of ['sector_veil_nebula', 'sector_ashfall_reach']) {
    const def = SECTORS.find((s) => s.id === sectorId);
    assert.equal(def.trafficPerMin, 0, `${sectorId} is a hollow rim`);
    assert.equal(LIVED_FRONTIER_SETS[sectorId].capacity, 4);
    assert.equal(LIVED_FRONTIER_SETS[sectorId].pockets
      .flatMap((p) => p.actorSlots).filter((s) => s.lawful).length, 0, 'no law in a hollow rim');
  }
});

function enterSector(sectorId) {
  const sectorDef = SECTORS.find((s) => s.id === sectorId);
  assert.ok(sectorDef, `${sectorId} exists`);
  const systems = [spawnBudget, traffic, cargo, economy, factions, heat, encounterDirector, npcJobsRuntime];
  const sim = createSimulation({ seed: SEED, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = sectorId;
  for (const station of SECTOR_ANCHORS[sectorId].stations) {
    sim.spawn({
      type: 'station', team: 2, pos: sectorLocalToGlobalForSector(station.pos, sectorId), radius: 42, mass: 1e6,
      data: { stationId: station.id, name: station.id },
    });
  }
  const player = sim.spawn({
    type: 'ship', team: 0, pos: sectorLocalToGlobalForSector({ x: 0, z: -3200 }, sectorId),
    vel: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  state.player.heat = 0;
  state.onboarding = { active: false, finished: true };
  bus.emit('sector:enter', { sectorId, sector: sectorDef });
  sim.runTicks(60);
  const bySlot = new Map();
  for (const rec of state.traffic.freighters || []) {
    const entity = state.entities.get(rec.id);
    if (!entity || !entity.alive) continue;
    const slotId = (entity.data && entity.data.activityActorSlotId) || rec.activityActorSlotId;
    if (slotId) bySlot.set(slotId, { rec, entity });
  }
  return { state, bySlot };
}

for (const sectorId of EXPECTED_SECTORS) {
  test(`seed 4242: ${sectorId} opens with its shift already under way`, () => {
    const set = LIVED_FRONTIER_SETS[sectorId];
    const { state, bySlot } = enterSector(sectorId);
    const ids = [];
    for (const slotId of set.actorSlotOrder) {
      const found = bySlot.get(slotId);
      assert.ok(found, `authored shift body is live: ${slotId}`);
      const { rec, entity } = found;
      assert.equal(rec.authoredActivityCast, true, `${slotId}: authored cast, not ambient filler`);
      assert.equal(entity.homeSectorId, sectorId, `${slotId} lives in ${sectorId}`);
      assert.ok(entity.data.worldRecordId, `${slotId} carries durable identity`);
      assert.ok(entity.data.jobId, `${slotId} is flying a real job, not parked jobless`);
      ids.push(`${slotId}#${entity.data.worldRecordId}`);
    }
    assert.equal(new Set(ids).size, set.capacity, 'distinct durable identities');
    assert.ok((state.traffic.freighters || []).length >= set.capacity);
  });
}

test('the same seed casts the same durable identities twice (deterministic shift)', () => {
  const sectorId = 'sector_charon_expanse';
  const first = enterSector(sectorId);
  const second = enterSector(sectorId);
  const read = ({ bySlot }) => LIVED_FRONTIER_SETS[sectorId].actorSlotOrder
    .map((id) => `${id}#${bySlot.get(id).entity.data.worldRecordId}`);
  assert.deepEqual(read(first), read(second));
});
