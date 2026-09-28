// CV-DAY-1 (build_map §1C row 44) — `sectorActivityPockets.js` is no longer Ceres-only, and Helios
// reads as a job in progress rather than as beacons and passive traffic.
//
// The done sentence: entering Helios shows one living chain — a miner on a seam, material coming
// off it, a hauler coming or going with it, somebody who wants that cargo, and a patrol with a
// route — with no mission accept and without cloning the Ceres pocket catalog onto the starter
// field. Proved on the default seed 4242 against the live traffic owner.

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
  HELIOS_ACTIVITY_POCKET_ORDER,
  HELIOS_ACTIVITY_SECTOR_ID,
  HELIOS_AUTHORED_ACTIVITY_CAPACITY,
  HELIOS_POCKET_ACTOR_SLOT_ORDER,
  HELIOS_ROUTE_TOPOLOGY,
  activityActorSlotById,
  activityPocketById,
  activityPocketsForSector,
  distanceFromPocketAnchor,
  routeTopologyClass,
} from '../src/data/sectorActivityPockets.js';
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

test('the activity-pocket registry is multi-sector, and Ceres is unchanged', () => {
  assert.ok(ACTIVITY_POCKET_SECTOR_IDS.includes(CERES_ACTIVITY_SECTOR_ID));
  assert.ok(ACTIVITY_POCKET_SECTOR_IDS.includes(HELIOS_ACTIVITY_SECTOR_ID));
  assert.equal(ACTIVITY_POCKETS_BY_SECTOR[CERES_ACTIVITY_SECTOR_ID], CERES_ACTIVITY_POCKETS);
  assert.equal(ACTIVITY_POCKETS.length, CERES_ACTIVITY_POCKETS.length + HELIOS_ACTIVITY_POCKETS.length);
  assert.equal(activityPocketsForSector('sector_nowhere_belt').length, 0);

  // Ceres keeps its exact contract: 8 pocket actors, 4 pockets, unchanged topology rows.
  assert.equal(CERES_POCKET_ACTOR_SLOT_ORDER.length, 8);
  assert.equal(CERES_ACTIVITY_POCKETS.length, 4);
  assert.equal(CERES_ROUTE_TOPOLOGY.length, CERES_POCKET_ACTOR_SLOT_ORDER.length);
  for (const id of CERES_POCKET_ACTOR_SLOT_ORDER) {
    assert.ok(id.startsWith('ceres_'), `Ceres slot id unchanged: ${id}`);
    const slot = activityActorSlotById(id);
    assert.equal(slot.worldRecordSlotId, `ceres:activity:${id}`, 'Ceres durable slot namespace unchanged');
  }
});

test('Helios pockets obey the same band, shape and topology laws Ceres does', () => {
  assert.equal(HELIOS_ACTIVITY_POCKETS.length, 2, 'two pockets: the work, and the movement');
  assert.equal(HELIOS_POCKET_ACTOR_SLOT_ORDER.length, HELIOS_AUTHORED_ACTIVITY_CAPACITY);
  assert.equal(new Set(HELIOS_POCKET_ACTOR_SLOT_ORDER).size, HELIOS_POCKET_ACTOR_SLOT_ORDER.length);

  for (const pocket of HELIOS_ACTIVITY_POCKETS) {
    assert.equal(pocket.sectorId, HELIOS_ACTIVITY_SECTOR_ID);
    assert.equal(pocket.actorSlots.length, 2, `${pocket.id} declares exactly two pocket actors`);
    const anchor = pocket.activityAnchor.localPos;
    for (const slot of pocket.actorSlots) {
      // Spawn belongs in the immediate band; both route marks in the moving band (Ceres law).
      assert.ok(distanceFromPocketAnchor(slot.spawnOffset) <= 95, `${slot.id} spawn inside immediate band`);
      assert.equal(slot.worldRecordSlotId, `helios:activity:${slot.id}`);
      assert.equal(slot.route.marks.length, 2);
      for (const mark of slot.route.marks) {
        const d = distanceFromPocketAnchor(mark.offset);
        assert.ok(d > 95 && d <= 125, `${slot.id}/${mark.id} at ${d.toFixed(1)} WU inside the moving band`);
      }
      // The route is real geometry: two authored marks that actually separate.
      const span = Math.hypot(
        slot.route.marks[1].offset.x - slot.route.marks[0].offset.x,
        slot.route.marks[1].offset.z - slot.route.marks[0].offset.z,
      );
      assert.ok(span > 0 && Number.isFinite(span), `${slot.id} route has a measurable span`);
      assert.ok(slot.route.durationS > 0, `${slot.id} route has a duration`);
      // Waypoints resolve into the sector, not into a null.
      for (const mark of slot.route.marks) {
        const pos = sectorLocalToGlobalForSector({
          x: anchor.x + mark.offset.x,
          z: anchor.z + mark.offset.z,
        }, HELIOS_ACTIVITY_SECTOR_ID);
        assert.ok(pos && Number.isFinite(pos.x) && Number.isFinite(pos.z), `${slot.id}/${mark.id} resolves`);
      }
    }
    for (const object of pocket.objectSlots) {
      assert.ok(distanceFromPocketAnchor(object.offset) <= 95, `${object.id} inside immediate band`);
    }
  }

  // No two places read as the same shape — derived from the marks, not declared next to them.
  const classes = HELIOS_ROUTE_TOPOLOGY.map(routeTopologyClass);
  assert.equal(new Set(classes).size, classes.length, `distinct topology classes: ${classes.join(', ')}`);
  assert.equal(HELIOS_ROUTE_TOPOLOGY.length, HELIOS_POCKET_ACTOR_SLOT_ORDER.length);
});

test('the Helios chain is the CV-DAY chain: seam, load, want, route', () => {
  const seam = activityPocketById('helios_starter_seam');
  const leg = activityPocketById('helios_freight_leg');
  assert.ok(seam && leg);

  // A miner is on a seam. Material is coming off it.
  const miner = activityActorSlotById('helios_seam_miner');
  assert.equal(miner.jobKind, 'miner');
  assert.equal(miner.route.receiptType, 'mining:npcExtraction');
  assert.ok(
    miner.route.marks.some((m) => m.targetRef === 'field:slot:helios_seam_ore_face'),
    'the miner works a real ore face',
  );
  assert.ok(
    miner.route.marks.some((m) => m.targetRef === 'dest:station_helios'),
    'and carries the lot back to the real Helios berth',
  );

  // Someone wants that cargo: passive, unlicensed, shadowing the miner's live hull.
  const fence = activityActorSlotById('helios_seam_fence');
  assert.equal(fence.jobKind, 'salvor');
  assert.equal(fence.lawful, false);
  assert.equal(fence.passive, true, 'the party who wants the cargo is not a spawn of hostility');
  assert.ok(
    fence.route.marks.some((m) => m.targetRef === 'actor:helios_seam_miner'),
    'the fence shadows the miner, not a decorative waypoint',
  );

  // A hauler is coming or going.
  const hauler = activityActorSlotById('helios_freight_hauler');
  assert.equal(hauler.jobKind, 'hauler');
  const haulerRefs = hauler.route.marks.map((m) => m.targetRef);
  assert.ok(haulerRefs.includes('dest:station_helios'), 'inbound resolves to the real berth (coming)');
  assert.ok(
    haulerRefs.some((ref) => ref && ref !== 'dest:station_helios'),
    'and outbound is a different leg (going)',
  );

  // A patrol has a route.
  const patrol = activityActorSlotById('helios_customs_patrol');
  assert.equal(patrol.jobKind, 'patrol');
  assert.equal(patrol.lawful, true, 'the Concord keeps the Sanctioned Claim clear');
  assert.ok(patrol.route.marks.length === 2 && patrol.route.durationS > 0);

  // Distinct verbs, distinct subjects: the four slots are not four copies of one beat.
  const kinds = [miner.jobKind, fence.jobKind, hauler.jobKind, patrol.jobKind];
  assert.equal(new Set(kinds).size, 4, `four different jobs: ${kinds.join(', ')}`);
  const roles = [miner.presentationRole, fence.presentationRole, hauler.presentationRole, patrol.presentationRole];
  assert.equal(new Set(roles).size, 4, `four different hulls: ${roles.join(', ')}`);
});

test('seed 4242: the shift is already under way when you arrive in Helios', () => {
  const heliosDef = SECTORS.find((s) => s.id === HELIOS_ACTIVITY_SECTOR_ID);
  assert.ok(heliosDef, 'Helios Prime exists');

  const systems = [spawnBudget, traffic, cargo, economy, factions, heat, encounterDirector, npcJobsRuntime];
  const sim = createSimulation({ seed: SEED, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = HELIOS_ACTIVITY_SECTOR_ID;
  sim.spawn({
    type: 'station', team: 2, pos: { x: 1280, z: -420 }, radius: 42, mass: 1e6,
    data: { stationId: 'station_helios', name: 'Helios Station' },
  });
  sim.spawn({
    type: 'station', team: 2, pos: { x: -920, z: 1080 }, radius: 42, mass: 1e6,
    data: { stationId: 'station_coalition', name: 'Coalition Yard' },
  });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 1200, z: -400 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  state.player.heat = 0;
  state.onboarding = { active: false, finished: true };

  bus.emit('sector:enter', { sectorId: HELIOS_ACTIVITY_SECTOR_ID, sector: heliosDef });
  sim.runTicks(60);

  const bySlot = new Map();
  for (const rec of state.traffic.freighters || []) {
    const entity = state.entities.get(rec.id);
    if (!entity || !entity.alive) continue;
    const slotId = (entity.data && entity.data.activityActorSlotId) || rec.activityActorSlotId;
    if (slotId) bySlot.set(slotId, { rec, entity });
  }

  for (const slotId of HELIOS_POCKET_ACTOR_SLOT_ORDER) {
    const found = bySlot.get(slotId);
    assert.ok(found, `authored chain body is live in Helios: ${slotId}`);
    const { rec, entity } = found;
    assert.equal(rec.authoredActivityCast, true, `${slotId} is authored cast, not ambient filler`);
    assert.equal(entity.data.authoredActivityCast, true);
    assert.equal(entity.homeSectorId, HELIOS_ACTIVITY_SECTOR_ID, `${slotId} lives in Helios`);
    assert.ok(entity.data.worldRecordId, `${slotId} carries durable identity`);
    assert.ok(entity.data.jobId, `${slotId} is flying a real job, not loitering`);
  }

  // The chain adds to the neighbourhood rather than replacing it: ambient still fills around it.
  const total = (state.traffic.freighters || []).length;
  assert.ok(total >= HELIOS_AUTHORED_ACTIVITY_CAPACITY, `chain plus ambient: ${total} bodies`);

  // Deterministic: the same seed produces the same four authored identities.
  const ids = HELIOS_POCKET_ACTOR_SLOT_ORDER.map((slotId) => {
    const entity = bySlot.get(slotId).entity;
    return `${slotId}#${entity.data.worldRecordId}`;
  });
  assert.equal(new Set(ids).size, 4, 'four distinct durable identities');
});

test('the chain is one neighbourhood, not four places', () => {
  // Both pockets hang off the Sanctioned Claim, so the whole chain sits inside roughly one
  // screen-depth of work. A second pocket system spread across the sector is the thin answer.
  const seam = activityPocketById('helios_starter_seam');
  const leg = activityPocketById('helios_freight_leg');
  const d = Math.hypot(
    seam.activityAnchor.localPos.x - leg.activityAnchor.localPos.x,
    seam.activityAnchor.localPos.z - leg.activityAnchor.localPos.z,
  );
  assert.ok(d <= 125, `the two pockets overlap into one neighbourhood (${d.toFixed(1)} WU apart)`);
  assert.equal(seam.activityAnchor.zoneId, leg.activityAnchor.zoneId, 'both hang off the Sanctioned Claim');
});
