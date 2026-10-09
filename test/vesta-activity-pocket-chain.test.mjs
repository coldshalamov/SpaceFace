// CV-DAY (authored rung-4 row) — sector_vesta_forge is two gates from the start on the default
// route, and its zone copy already promised a working day nobody could see: "Ore haulers shuttle
// from these seams to the foundry lines around the clock" (zone_vesta_belt); "A freighter died at
// the sector edge; its manifest was never recovered" (zone_vesta_derelict).
//
// The done sentence: arriving in Vesta Forge mid-shift shows one living feedstock day — a seam
// miner cutting the Feedstock Belt while a hauler runs ore to station_forge's foundry approach,
// scavenger cutters working the Dead Freighter Drift at poi_freighter, and a slag-relay tender
// holding its loop past the radiation field — with no mission accept, every actor flying a job
// kind the runtime already owns, and the chain continuing whether or not you touch it. Proved on
// the default seed 4242 against the live traffic owner, through the same discovery readers Ceres
// uses.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTIVITY_POCKETS,
  ACTIVITY_POCKETS_BY_ID,
  ACTIVITY_POCKETS_BY_SECTOR,
  ACTIVITY_POCKET_SECTOR_IDS,
  CERES_ACTIVITY_POCKETS,
  CERES_ACTIVITY_SECTOR_ID,
  CERES_POCKET_ACTOR_SLOT_ORDER,
  CERES_ROUTE_TOPOLOGY,
  HELIOS_ACTIVITY_POCKETS,
  HELIOS_ACTIVITY_SECTOR_ID,
  HELIOS_POCKET_ACTOR_SLOT_ORDER,
  PALLAS_ACTIVITY_POCKETS,
  PALLAS_ACTIVITY_SECTOR_ID,
  PALLAS_POCKET_ACTOR_SLOT_ORDER,
  SEDNA_ACTIVITY_POCKETS,
  TETHYS_ACTIVITY_POCKETS,
  TETHYS_ACTIVITY_SECTOR_ID,
  VESTA_ACTIVITY_POCKETS,
  VESTA_ACTIVITY_POCKETS_BY_ID,
  VESTA_ACTIVITY_POCKET_ORDER,
  VESTA_ACTIVITY_SECTOR_ID,
  VESTA_AUTHORED_ACTIVITY_CAPACITY,
  VESTA_POCKET_ACTOR_SLOT_ORDER,
  VESTA_ROUTE_TOPOLOGY,
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
import { traffic } from '../src/systems/traffic.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { factions } from '../src/systems/factions.js';
import { heat } from '../src/systems/heat.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';

const SEED = 4242;

test('the activity-pocket registry includes Vesta Forge, and the older sectors are unchanged', () => {
  assert.ok(ACTIVITY_POCKET_SECTOR_IDS.includes(VESTA_ACTIVITY_SECTOR_ID));
  assert.equal(ACTIVITY_POCKETS_BY_SECTOR[VESTA_ACTIVITY_SECTOR_ID], VESTA_ACTIVITY_POCKETS);
  assert.equal(
    ACTIVITY_POCKETS.length,
    CERES_ACTIVITY_POCKETS.length
      + HELIOS_ACTIVITY_POCKETS.length
      + PALLAS_ACTIVITY_POCKETS.length
      + VESTA_ACTIVITY_POCKETS.length
      + TETHYS_ACTIVITY_POCKETS.length
      + SEDNA_ACTIVITY_POCKETS.length,
  );
  assert.equal(activityPocketsForSector('sector_vesta_forge').length, 4);
  assert.equal(activityPocketsForSector('sector_nowhere_belt').length, 0);

  // The discovery readers Ceres uses resolve Vesta pockets and slots too.
  for (const pocketId of VESTA_ACTIVITY_POCKET_ORDER) {
    assert.equal(activityPocketById(pocketId), VESTA_ACTIVITY_POCKETS_BY_ID[pocketId]);
  }
  for (const slotId of VESTA_POCKET_ACTOR_SLOT_ORDER) {
    const slot = activityActorSlotById(slotId);
    assert.ok(slot, `Vesta slot readable through the shared reader: ${slotId}`);
    assert.equal(slot.worldRecordSlotId, `vesta:activity:${slotId}`, 'Vesta durable slot namespace');
  }
  assert.equal(activityRouteTopologyForSector(VESTA_ACTIVITY_SECTOR_ID).length, 8);
  assert.ok(ACTIVITY_POCKETS_BY_ID.vesta_feedstock_seam, 'Vesta joins the all-sector pocket index');

  // Older sectors keep their exact contracts.
  assert.equal(CERES_POCKET_ACTOR_SLOT_ORDER.length, 8);
  assert.equal(HELIOS_POCKET_ACTOR_SLOT_ORDER.length, 4);
  assert.equal(PALLAS_POCKET_ACTOR_SLOT_ORDER.length, 8);
  assert.equal(CERES_ROUTE_TOPOLOGY.length, 8);
});

test('Vesta pockets obey the same band, shape and topology laws Ceres does', () => {
  assert.equal(VESTA_ACTIVITY_POCKETS.length, 4, 'seam, haul, drift, relay');
  assert.equal(VESTA_POCKET_ACTOR_SLOT_ORDER.length, VESTA_AUTHORED_ACTIVITY_CAPACITY);
  assert.equal(new Set(VESTA_POCKET_ACTOR_SLOT_ORDER).size, VESTA_POCKET_ACTOR_SLOT_ORDER.length);

  const vestaZones = SECTOR_ZONES[VESTA_ACTIVITY_SECTOR_ID];
  const vestaAnchors = SECTOR_ANCHORS[VESTA_ACTIVITY_SECTOR_ID];
  for (const pocket of VESTA_ACTIVITY_POCKETS) {
    assert.equal(pocket.sectorId, VESTA_ACTIVITY_SECTOR_ID);
    assert.equal(pocket.actorSlots.length, 2, `${pocket.id} declares exactly two pocket actors`);

    // The anchor is authored geography, not a free-floating point: a zone center, the foundry
    // station's own position, or a landmark POI inside the zone it claims.
    const anchor = pocket.activityAnchor.localPos;
    if (pocket.activityAnchor.kind === 'zone') {
      const zone = vestaZones.find((z) => z.id === pocket.activityAnchor.zoneId);
      assert.ok(zone, `${pocket.id} anchor zone exists`);
      assert.equal(anchor.x, zone.center.x);
      assert.equal(anchor.z, zone.center.z);
    } else if (pocket.activityAnchor.kind === 'station') {
      const station = vestaAnchors.stations.find((s) => s.id === pocket.activityAnchor.id);
      assert.ok(station, `${pocket.id} anchor station exists`);
      assert.equal(anchor.x, station.pos.x);
      assert.equal(anchor.z, station.pos.z);
    } else if (pocket.activityAnchor.kind === 'poi') {
      const poi = vestaAnchors.pois.find((p) => p.id === pocket.activityAnchor.id);
      assert.ok(poi, `${pocket.id} anchor POI exists`);
      assert.equal(anchor.x, poi.pos.x);
      assert.equal(anchor.z, poi.pos.z);
      const zone = vestaZones.find((z) => z.id === pocket.activityAnchor.zoneId);
      assert.ok(zone, `${pocket.id} anchor claims a real zone`);
      const zoneDist = Math.hypot(anchor.x - zone.center.x, anchor.z - zone.center.z);
      assert.ok(zoneDist <= zone.radius, `${pocket.id} POI anchor sits inside ${zone.id}`);
    }

    for (const slot of pocket.actorSlots) {
      // Spawn belongs in the immediate band; both route marks in the moving band (Ceres law).
      assert.ok(distanceFromPocketAnchor(slot.spawnOffset) <= 95, `${slot.id} spawn inside immediate band`);
      assert.equal(slot.route.marks.length, 2);
      for (const mark of slot.route.marks) {
        const d = distanceFromPocketAnchor(mark.offset);
        assert.ok(d > 95 && d <= 125, `${slot.id}/${mark.id} at ${d.toFixed(1)} WU inside the moving band`);
        // Waypoints resolve into the sector, not into a null.
        const pos = sectorLocalToGlobalForSector({
          x: anchor.x + mark.offset.x,
          z: anchor.z + mark.offset.z,
        }, VESTA_ACTIVITY_SECTOR_ID);
        assert.ok(pos && Number.isFinite(pos.x) && Number.isFinite(pos.z), `${slot.id}/${mark.id} resolves`);
      }
      // The route is real geometry: two authored marks that actually separate.
      const span = Math.hypot(
        slot.route.marks[1].offset.x - slot.route.marks[0].offset.x,
        slot.route.marks[1].offset.z - slot.route.marks[0].offset.z,
      );
      assert.ok(span > 0 && Number.isFinite(span), `${slot.id} route has a measurable span`);
      assert.ok(slot.route.durationS > 0, `${slot.id} route has a duration`);
    }
    for (const object of pocket.objectSlots) {
      assert.ok(distanceFromPocketAnchor(object.offset) <= 95, `${object.id} inside immediate band`);
    }
  }

  // No two places read as the same shape — derived from the marks, not declared next to them.
  const classes = VESTA_ROUTE_TOPOLOGY.map(routeTopologyClass);
  assert.equal(new Set(classes).size, classes.length, `distinct topology classes: ${classes.join(', ')}`);
  assert.equal(VESTA_ROUTE_TOPOLOGY.length, VESTA_POCKET_ACTOR_SLOT_ORDER.length);
  const pocketClasses = VESTA_ACTIVITY_POCKETS.map((entry) => VESTA_ROUTE_TOPOLOGY
    .filter((row) => row.pocketId === entry.id)
    .map(routeTopologyClass)
    .sort()
    .join('+'));
  assert.equal(new Set(pocketClasses).size, pocketClasses.length, `distinct pocket shapes: ${pocketClasses.join(', ')}`);
});

test('the Vesta chain is the feedstock day: seam, haul, drift, relay', () => {
  const seam = activityPocketById('vesta_feedstock_seam');
  const haul = activityPocketById('vesta_forge_haul');
  const drift = activityPocketById('vesta_derelict_drift');
  const relay = activityPocketById('vesta_slag_relay');
  assert.ok(seam && haul && drift && relay);

  // A miner is on the Feedstock Belt, cutting a real ore face and carrying the lot to the foundry.
  assert.equal(seam.activityAnchor.zoneId, 'zone_vesta_belt', 'the seam hangs off the Feedstock Belt');
  assert.equal(seam.pq020Identity.fieldId, 'f_vesta_1', 'the seam works the belt\'s authored field');
  const miner = activityActorSlotById('vesta_seam_miner');
  assert.equal(miner.jobKind, 'miner');
  assert.equal(miner.route.receiptType, 'mining:npcExtraction');
  assert.ok(
    miner.route.marks.some((m) => m.targetRef === 'field:slot:vesta_seam_ore_clast'),
    'the miner works a real ore face',
  );
  assert.ok(
    miner.route.marks.some((m) => m.targetRef === 'dest:station_forge'),
    'and carries the lot to the real foundry berth',
  );
  const surveyor = activityActorSlotById('vesta_seam_surveyor');
  assert.equal(surveyor.jobKind, 'surveyor', 'the seam crew covers different ground, not a second miner');

  // A hauler runs ore to station_forge's foundry approach, under the foundry's own patrol.
  assert.equal(haul.activityAnchor.zoneId, 'zone_vesta_forge', 'the haul hangs off The Forge');
  assert.equal(haul.activityAnchor.placeId, 'station_forge', 'the haul leg is the foundry approach');
  const hauler = activityActorSlotById('vesta_forge_hauler');
  assert.equal(hauler.jobKind, 'hauler');
  assert.equal(hauler.route.receiptType, 'freight:arrival');
  assert.ok(
    hauler.route.marks.some((m) => m.targetRef === 'dest:station_forge'),
    'the run resolves to the real foundry berth',
  );
  const patrol = activityActorSlotById('vesta_forge_patrol');
  assert.equal(patrol.jobKind, 'patrol');
  assert.equal(patrol.lawful, true, 'the DMC walks its own foundry approach');

  // Scavengers work the Dead Freighter Drift where the freighter died — passive cutters, not a
  // hostile spawn: the pocket authors work, and the drift is nobody's lawful harbour to guard.
  assert.equal(drift.activityAnchor.zoneId, 'zone_vesta_derelict', 'the drift is the Dead Freighter Drift');
  assert.equal(drift.activityAnchor.placeId, 'poi_freighter', 'anchored on the dead hulk itself');
  const driftAnchor = drift.activityAnchor.localPos;
  const derelictZone = SECTOR_ZONES[VESTA_ACTIVITY_SECTOR_ID].find((z) => z.id === 'zone_vesta_derelict');
  assert.equal(driftAnchor.x, derelictZone.center.x);
  assert.equal(driftAnchor.z, derelictZone.center.z);
  for (const slotId of ['vesta_drift_cutter', 'vesta_drift_prowler']) {
    const scavenger = activityActorSlotById(slotId);
    assert.equal(scavenger.jobKind, 'salvor', `${slotId} works the hulk`);
    assert.equal(scavenger.lawful, false, `${slotId} works unlicensed ground`);
    assert.equal(scavenger.passive, true, `${slotId} is work, not a hostile spawn`);
  }
  assert.ok(
    drift.objectSlots.some((o) => o.id === 'vesta_derelict_hulk_shard'),
    'the dead hulk is an authored body the cutters work around',
  );

  // A slag-relay tender holds its loop past the radiation field, and slag still runs the corner.
  assert.equal(relay.activityAnchor.placeId, 'poi_vesta_slag_relay', 'the relay hangs off its buoy');
  const tender = activityActorSlotById('vesta_relay_tender');
  assert.equal(tender.presentationRole, 'tender', 'the relay is a tender\'s beat');
  assert.equal(tender.jobKind, 'surveyor', 'a relay check flies the proven scan kernel — a real job');
  assert.ok(
    tender.route.marks.some((m) => m.targetRef === 'station:station_vesta_outlying_yard:service-berth'),
    'one leg services the outlying yard',
  );
  const runner = activityActorSlotById('vesta_slag_runner');
  assert.equal(runner.jobKind, 'hauler', 'slag still runs the corner the relay marks');

  // Every sentence is interruptible with verbs the player already has: every actor flies a job
  // kind the runtime owns, and nobody arrives hostile.
  const kinds = VESTA_ACTIVITY_POCKETS
    .flatMap((entry) => entry.actorSlots.map((slot) => slot.jobKind));
  for (const kind of kinds) {
    assert.ok(['hauler', 'miner', 'surveyor', 'patrol', 'salvor'].includes(kind), `runtime job kind: ${kind}`);
  }
  for (const slot of VESTA_ACTIVITY_POCKETS.flatMap((entry) => entry.actorSlots)) {
    assert.equal(slot.passive, true, `${slot.id} arrives working, not shooting`);
  }
  assert.ok(new Set(kinds).size >= 4, `distinct verbs across the day: ${kinds.join(', ')}`);
});

test('seed 4242: the shift is already under way when you arrive in Vesta Forge', () => {
  const vestaDef = SECTORS.find((s) => s.id === VESTA_ACTIVITY_SECTOR_ID);
  assert.ok(vestaDef, 'Vesta Forge exists');

  const systems = [spawnBudget, traffic, cargo, economy, factions, heat, encounterDirector, npcJobsRuntime];
  const sim = createSimulation({ seed: SEED, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = VESTA_ACTIVITY_SECTOR_ID;
  // The foundry stands where the anchors say it does; sector-local to global for each station.
  for (const station of SECTOR_ANCHORS[VESTA_ACTIVITY_SECTOR_ID].stations) {
    const pos = sectorLocalToGlobalForSector(station.pos, VESTA_ACTIVITY_SECTOR_ID);
    sim.spawn({
      type: 'station', team: 2, pos, radius: 42, mass: 1e6,
      data: { stationId: station.id, name: station.id },
    });
  }
  const player = sim.spawn({
    type: 'ship', team: 0, pos: sectorLocalToGlobalForSector({ x: 0, z: -3200 }, VESTA_ACTIVITY_SECTOR_ID),
    vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  state.player.heat = 0;
  state.onboarding = { active: false, finished: true };

  bus.emit('sector:enter', { sectorId: VESTA_ACTIVITY_SECTOR_ID, sector: vestaDef });
  sim.runTicks(60);

  const bySlot = new Map();
  for (const rec of state.traffic.freighters || []) {
    const entity = state.entities.get(rec.id);
    if (!entity || !entity.alive) continue;
    const slotId = (entity.data && entity.data.activityActorSlotId) || rec.activityActorSlotId;
    if (slotId) bySlot.set(slotId, { rec, entity });
  }

  for (const slotId of VESTA_POCKET_ACTOR_SLOT_ORDER) {
    const found = bySlot.get(slotId);
    assert.ok(found, `authored chain body is live in Vesta Forge: ${slotId}`);
    const { rec, entity } = found;
    assert.equal(rec.authoredActivityCast, true, `${slotId} is authored cast, not ambient filler`);
    assert.equal(entity.data.authoredActivityCast, true);
    assert.equal(entity.homeSectorId, VESTA_ACTIVITY_SECTOR_ID, `${slotId} lives in Vesta Forge`);
    assert.ok(entity.data.worldRecordId, `${slotId} carries durable identity`);
    assert.ok(entity.data.jobId, `${slotId} is flying a real job, not loitering`);
  }

  // The chain adds to the neighbourhood rather than replacing it: ambient still fills around it.
  const total = (state.traffic.freighters || []).length;
  assert.ok(total >= VESTA_AUTHORED_ACTIVITY_CAPACITY, `chain plus ambient: ${total} bodies`);

  // Deterministic: the same seed produces the same eight authored identities.
  const ids = VESTA_POCKET_ACTOR_SLOT_ORDER.map((slotId) => {
    const entity = bySlot.get(slotId).entity;
    return `${slotId}#${entity.data.worldRecordId}`;
  });
  assert.equal(new Set(ids).size, 8, 'eight distinct durable identities');
});

test('the marks sit on the authored marks: the chain strings the sector the chart promises', () => {
  // Belt -> foundry -> relay west, drift at the sector edge: each pocket anchor is the landmark
  // its fiction names, and the haul leg physically bridges the belt to the foundry approach.
  const seam = activityPocketById('vesta_feedstock_seam');
  const haul = activityPocketById('vesta_forge_haul');
  const relay = activityPocketById('vesta_slag_relay');

  const haulAnchor = haul.activityAnchor.localPos;
  const seamAnchor = seam.activityAnchor.localPos;
  const relayAnchor = relay.activityAnchor.localPos;
  const beltToFoundry = Math.hypot(haulAnchor.x - seamAnchor.x, haulAnchor.z - seamAnchor.z);
  assert.ok(beltToFoundry > 0, 'the seam and the foundry are two different places');

  // The hauler's belt-side mark points from the foundry back along the true bearing to the belt
  // centre: the run reads as coming off the seams, not as an orbit that happens to pass.
  const hauler = activityActorSlotById('vesta_forge_hauler');
  const beltLeg = hauler.route.marks.find((m) => m.id === 'vesta_haul_belt_leg');
  const markWorld = {
    x: haulAnchor.x + beltLeg.offset.x,
    z: haulAnchor.z + beltLeg.offset.z,
  };
  const markBearing = Math.atan2(markWorld.z - haulAnchor.z, markWorld.x - haulAnchor.x);
  const beltBearing = Math.atan2(seamAnchor.z - haulAnchor.z, seamAnchor.x - haulAnchor.x);
  let bearingDelta = Math.abs(markBearing - beltBearing);
  if (bearingDelta > Math.PI) bearingDelta = 2 * Math.PI - bearingDelta;
  assert.ok(bearingDelta < 0.05, `belt leg aims at the true belt bearing (${(bearingDelta * 180 / Math.PI).toFixed(2)} deg off)`);

  // The relay pocket hangs off the buoy the chart names, inside the foundry's own zone.
  const relayPoi = SECTOR_ANCHORS[VESTA_ACTIVITY_SECTOR_ID].pois.find((p) => p.id === 'poi_vesta_slag_relay');
  assert.equal(relayAnchor.x, relayPoi.pos.x);
  assert.equal(relayAnchor.z, relayPoi.pos.z);
  assert.equal(relay.activityAnchor.zoneId, 'zone_vesta_forge');
});
