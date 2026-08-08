import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CERES_ACTIVITY_BANDS,
  CERES_ACTIVITY_POCKET_ORDER,
  CERES_ACTIVITY_POCKETS,
  CERES_ACTIVITY_SERVICE_SLOTS,
  CERES_AUTHORED_ACTIVITY_CAPACITY,
  CERES_AUTHORED_ACTIVITY_SLOT_ORDER,
  CERES_POCKET_ACTOR_SLOT_ORDER,
  CERES_REFERENCE_ACCEPTANCE_ENTRY,
  ceresActivityPocket,
  distanceFromPocketAnchor,
} from '../src/data/sectorActivityPockets.js';
import {
  CERES_THROUGHLINE_BEACON_LOCAL_POS,
  CERES_WRECK_CATHEDRAL_LOCAL_POS,
  SECTOR_ANCHORS,
} from '../src/data/sectorAnchors.js';
import { SECTOR_ZONES } from '../src/data/sectorZones.js';
import {
  CINDER_SLUICE_LOCAL_POS,
  CINDER_SLUICE_SITE_ID,
  CINDER_SLUICE_TRAFFIC_STAGING_POS,
} from '../src/data/environmentalMachinery.js';
import {
  applySandboxSetup,
  requestSandboxGame,
  SANDBOX_PHYSICS_LOADOUTS,
} from '../src/ui/sandbox/sandboxSetup.js';
import { SHIPS } from '../src/data/ships.js';
import { WEAPONS } from '../src/data/weapons.js';
import { planFactionPresence } from '../src/data/factionPresence.js';
import { worldSiteManifestById } from '../src/data/worldSiteManifests.js';
import { buildSlotList, fits, ships } from '../src/systems/ships.js';

const EXPECTED_POCKETS = Object.freeze([
  'ceres_refinery_pocket',
  'ceres_working_seam',
  'ceres_ambush_run',
  'ceres_cathedral_grave',
]);

test('R5A binds four camera-local pockets to PQ-020 canonical identities and anchors', () => {
  assert.deepEqual(CERES_ACTIVITY_POCKET_ORDER, EXPECTED_POCKETS);
  assert.equal(CERES_ACTIVITY_POCKETS.length, 4);

  const anchors = SECTOR_ANCHORS.sector_ceres_belt;
  const zones = SECTOR_ZONES.sector_ceres_belt;
  const refinery = ceresActivityPocket('ceres_refinery_pocket');
  const seam = ceresActivityPocket('ceres_working_seam');
  const ambush = ceresActivityPocket('ceres_ambush_run');
  const cathedral = ceresActivityPocket('ceres_cathedral_grave');

  const station = anchors.stations.find((row) => row.id === 'station_ceres');
  const refineryZone = zones.find((row) => row.id === 'zone_ceres_refinery');
  assert.notStrictEqual(refinery.activityAnchor.localPos, station.pos,
    'the frozen activity contract must not expose PQ-020 mutable geography');
  assert.equal(refinery.pq020Identity.zoneId, refineryZone.id);
  assert.deepEqual(refinery.activityAnchor.localPos, refineryZone.center);

  const miningZone = zones.find((row) => row.id === 'zone_ceres_belt');
  assert.deepEqual(seam.activityAnchor.localPos, miningZone.center);
  assert.equal(seam.pq020Identity.zoneId, 'zone_ceres_belt');
  assert.equal(seam.externalSiteRefs[0].id, CINDER_SLUICE_SITE_ID);
  assert.deepEqual(seam.externalSiteRefs[0].localPos, CINDER_SLUICE_LOCAL_POS);
  assert.equal(seam.externalSiteRefs[0].countsTowardBandCensus, false);

  const throughlineZone = zones.find((row) => row.id === 'zone_ceres_throughline');
  const throughlinePoi = anchors.pois.find((row) => row.id === 'poi_ceres_throughline');
  assert.equal(ambush.pq020Identity.zoneId, throughlineZone.id,
    'Ambush Run is choreography on PQ-020 Throughline, not a second Ceres zone');
  assert.notStrictEqual(ambush.activityAnchor.localPos, throughlinePoi.pos);
  assert.deepEqual(ambush.activityAnchor.localPos, CERES_THROUGHLINE_BEACON_LOCAL_POS);

  assert.notStrictEqual(cathedral.activityAnchor.localPos, CERES_WRECK_CATHEDRAL_LOCAL_POS);
  assert.deepEqual(cathedral.activityAnchor.localPos, CERES_WRECK_CATHEDRAL_LOCAL_POS);
  assert.equal(cathedral.pq020Identity.siteId, 'world_site_wreck_cathedral');
  assert.equal(CERES_ACTIVITY_POCKETS.every((pocket) => pocket.bandOrigin.kind === 'activity_anchor'), true);
});

test('R5A authored capacity is stable 2/3/2/2 without counting encounter hostiles', () => {
  assert.deepEqual(CERES_ACTIVITY_POCKETS.map((pocket) => pocket.actorSlots.length), [2, 2, 2, 2]);
  assert.deepEqual(CERES_ACTIVITY_POCKETS.map((pocket) => pocket.authoredCapacityContribution), [2, 3, 2, 2]);
  assert.equal(CERES_POCKET_ACTOR_SLOT_ORDER.length, 8);
  assert.equal(CERES_ACTIVITY_SERVICE_SLOTS.length, 1);
  assert.equal(CERES_AUTHORED_ACTIVITY_SLOT_ORDER.length, CERES_AUTHORED_ACTIVITY_CAPACITY);
  assert.equal(CERES_AUTHORED_ACTIVITY_CAPACITY, 9);
  assert.equal(new Set(CERES_AUTHORED_ACTIVITY_SLOT_ORDER).size, 9);
  assert.deepEqual(CERES_AUTHORED_ACTIVITY_SLOT_ORDER, [
    'ceres_refinery_hauler',
    'ceres_refinery_tender',
    'ceres_seam_miner',
    'ceres_seam_surveyor',
    'ceres_ambush_loaded_hauler',
    'ceres_ambush_escort',
    'ceres_cathedral_salvor',
    'ceres_cathedral_patrol',
    'ceres_cinder_service_hauler',
  ]);

  const tender = actor('ceres_refinery_tender');
  const liveTenderPlans = planFactionPresence({ sectorId: 'sector_ceres_belt', seed: 1 })
    .filter((row) => row.yardTender === true);
  assert.equal(liveTenderPlans.length, 1, 'the reuse descriptor binds one live Pitborn tender plan');
  assert.equal(liveTenderPlans[0].factionId, tender.binding.match.factionId);
  assert.equal(liveTenderPlans[0].sectorId, tender.binding.match.sectorId);
  assert.equal(tender.binding.runtimeStatus, 'requires_world_record_adoption');
  const service = CERES_ACTIVITY_SERVICE_SLOTS[0];
  const cinderManifest = worldSiteManifestById(CINDER_SLUICE_SITE_ID);
  assert.equal(service.binding.owner, 'traffic');
  assert.equal(service.binding.hookId, cinderManifest.trafficHook.id);
  assert.equal(service.binding.siteId, cinderManifest.id);
  assert.deepEqual(cinderManifest.trafficHook.stagingPos, CINDER_SLUICE_TRAFFIC_STAGING_POS);
  assert.equal(service.binding.runtimeStatus, 'requires_r5d_hook_reconciliation');
  assert.equal(service.binding.currentPolicy, 'eligible_ambient_actor');
  assert.equal(service.binding.targetPolicy, 'reserved_stable_slot');
  assert.equal(service.jobKind, null);
  assert.equal(service.countsTowardPocketActorCensus, false);
  assert.equal(service.tombstonePolicy, 'no_refill_or_reassign_after_r5d_reconciliation');
  for (const slot of CERES_ACTIVITY_POCKETS.flatMap((pocket) => pocket.actorSlots)) {
    assert.equal(slot.worldRecordSlotId, `ceres:activity:${slot.id}`);
    assert.equal(slot.tombstonePolicy, 'no_refill_or_reassign');
  }
  assert.equal(CERES_AUTHORED_ACTIVITY_SLOT_ORDER.some((id) => /pirate|hostile|encounter/.test(id)), false);
});

test('R5A positions and inert routes use the named-anchor camera bands', () => {
  assert.deepEqual(
    Object.values(CERES_ACTIVITY_BANDS).map((band) => [band.minWU, band.maxWU]),
    [[0, 95], [95, 125], [125, 165]],
  );

  for (const pocket of CERES_ACTIVITY_POCKETS) {
    for (const slot of pocket.actorSlots) {
      const spawnDistance = distanceFromPocketAnchor(slot.spawnOffset);
      assert.ok(spawnDistance >= 0 && spawnDistance <= 95, `${slot.id} spawn is immediate`);
      assert.equal(slot.route.inert, true);
      assert.equal(slot.route.owner, 'npcJobsRuntime');
      assert.equal(slot.route.marks.length, 2);
      for (const mark of slot.route.marks) {
        const d = distanceFromPocketAnchor(mark.offset);
        assert.ok(d > 95 && d <= 125, `${slot.id}/${mark.id} route mark is moving-play local`);
      }
    }
  }

  const loadedHauler = actor('ceres_ambush_loaded_hauler');
  const escort = actor('ceres_ambush_escort');
  assert.equal(loadedHauler.presentationRole, 'hauler');
  assert.equal(loadedHauler.jobKind, 'hauler');
  assert.equal(escort.presentationRole, 'escort');
  assert.equal(escort.jobKind, 'patrol', 'the existing job kernel does not gain an escort kind');
  assert.equal(escort.lawful, true);
  assert.equal(actor('ceres_cathedral_patrol').lawful, true);
  assert.equal(actor('ceres_refinery_hauler').route.receiptType, 'freight:arrival');
  assert.equal(actor('ceres_seam_miner').route.receiptType, 'mining:npcExtraction');
  assert.match(actor('ceres_seam_miner').route.marks[1].targetRef, /^field:</);
});

test('R5A companion objects are logical world slots, not a second place registry', () => {
  assert.deepEqual(CERES_ACTIVITY_POCKETS.flatMap((pocket) => pocket.objectSlots.map((slot) => slot.id)), [
    'ceres_refinery_cargo_pod',
    'ceres_seam_ore_clast',
    'ceres_ambush_distress_beacon',
    'ceres_ambush_bait_wreck',
    'ceres_cathedral_grave_shard',
  ]);
  for (const pocket of CERES_ACTIVITY_POCKETS) {
    for (const slot of pocket.objectSlots) {
      assert.equal(slot.inert, true);
      assert.equal(slot.coordinateSpace, 'pocket_anchor_offset_v1');
      assert.equal(slot.runtimeOwner, 'world');
      assert.equal('globalPos' in slot, false);
      assert.equal('atlasId' in slot, false);
      assert.ok(distanceFromPocketAnchor(slot.offset) <= 95,
        `${slot.id} remains in the ordinary-camera immediate band`);
    }
  }
});

test('R5A acceptance entry names the legal Hornet physics toolkit without wiring it', () => {
  const entry = CERES_REFERENCE_ACCEPTANCE_ENTRY;
  assert.equal(entry.scope, 'acceptance_entry_reference_only');
  assert.equal(entry.runtimeStatus, 'not_wired');
  assert.equal(entry.shipId, 'ship_hornet');
  assert.equal(entry.loadoutId, 'physics_toolkit');
  assert.equal(entry.cameraZoomWU, 144);
  assert.equal(entry.moduleGrantPolicy, 'named_loadout_only');
  assert.deepEqual(entry.entryPipeline, ['requestSandboxGame', 'game:new', 'game:started', 'applySandboxSetup']);
  assert.equal(typeof requestSandboxGame, 'function');
  assert.equal(typeof applySandboxSetup, 'function');
  assert.deepEqual(entry.requiredSystemOperations, [
    'ships.buyShip',
    'ships.setActiveShip',
    'ships.grantModule',
    'ships.unfitModule',
    'ships.fitModule',
  ]);
  for (const operation of entry.requiredSystemOperations) {
    const method = operation.split('.')[1];
    assert.equal(typeof ships[method], 'function', `${operation} is a live public system operation`);
  }

  const loadout = SANDBOX_PHYSICS_LOADOUTS.find((row) => row.id === entry.loadoutId);
  assert.ok(loadout);
  assert.deepEqual(entry.itemIds, loadout.itemIds);

  const hornet = SHIPS.find((row) => row.id === entry.shipId);
  const defs = entry.itemIds.map((id) => WEAPONS.find((row) => row.id === id));
  assert.ok(hornet && defs.every(Boolean));
  const available = buildSlotList(hornet).map((slot) => ({ ...slot }));
  for (const def of defs) {
    const index = available.findIndex((slot) => fits(slot, def));
    assert.notEqual(index, -1, `${def.id} must fit the canonical Hornet`);
    available.splice(index, 1);
  }
  assert.equal(distanceFromPocketAnchor(entry.entryOffset) <= 95, true);
});

test('R5A contract is deeply immutable at its public data boundaries', () => {
  assert.equal(Object.isFrozen(CERES_ACTIVITY_POCKETS), true);
  assert.equal(Object.isFrozen(CERES_ACTIVITY_POCKETS[0]), true);
  assert.equal(Object.isFrozen(CERES_ACTIVITY_POCKETS[0].actorSlots), true);
  assert.equal(Object.isFrozen(CERES_ACTIVITY_POCKETS[0].actorSlots[0]), true);
  assert.equal(Object.isFrozen(CERES_ACTIVITY_POCKETS[0].actorSlots[0].route.marks), true);
  assert.equal(Object.isFrozen(CERES_ACTIVITY_POCKETS[0].activityAnchor), true);
  assert.equal(Object.isFrozen(CERES_ACTIVITY_POCKETS[0].activityAnchor.localPos), true);
  assert.equal(Object.isFrozen(CERES_ACTIVITY_POCKETS[1].externalSiteRefs[0]), true);
  assert.equal(Object.isFrozen(CERES_ACTIVITY_SERVICE_SLOTS[0].binding), true);
  assert.equal(Object.isFrozen(CERES_REFERENCE_ACCEPTANCE_ENTRY), true);
  assert.equal(ceresActivityPocket('__proto__'), null);
  assert.equal(ceresActivityPocket('constructor'), null);
});

function actor(id) {
  const found = CERES_ACTIVITY_POCKETS.flatMap((pocket) => pocket.actorSlots).find((slot) => slot.id === id);
  assert.ok(found, `missing actor slot ${id}`);
  return found;
}
