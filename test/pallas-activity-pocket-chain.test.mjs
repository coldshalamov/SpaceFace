// Authored rung-4 row — Ceres has test/ceres-active-pockets.test.mjs, Helios has
// test/helios-activity-pocket-chain.test.mjs, Vesta has test/vesta-activity-pocket-chain.test.mjs,
// and Pallas Drift's four landed pockets (Independent Seam, Hollow Hub, Sker-Run Ambush, Grave
// Drift — PALLAS_ACTIVITY_POCKETS) had no test naming a single pallas pocket id.
//
// The done sentence: arriving in Pallas Drift shows one living drift day — a seam crew cutting the
// Independent Seams (a miner and a surveyor on two different cuts), a hauler and a tender working
// the Hollow Hub around station_smuggler's market, the Sker-Run ambush pair riding the wreck lane,
// and a grave crew salvaging the nebula field under patrol — with no mission accept and the chain
// continuing whether or not you touch it. Every one of the eight authored actors flies a job kind
// the runtime owns: the hub tender rides the proven survey kernel (a hub check is a scan loop —
// the Vesta relay pattern; its first authoring used jobKind 'tender', which the runtime's
// authored job-kind gate has never included (CERES_ACTIVITY_JOB_KINDS, src/systems/traffic.js —
// hauler/miner/surveyor/patrol/salvor), and materialized jobless until the re-author). Proved on
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
  PALLAS_AUTHORED_ACTIVITY_CAPACITY,
  PALLAS_POCKET_ACTOR_SLOT_ORDER,
  PALLAS_ROUTE_TOPOLOGY,
  SEDNA_ACTIVITY_POCKETS,
  TETHYS_ACTIVITY_POCKETS,
  TETHYS_ACTIVITY_SECTOR_ID,
  VESTA_ACTIVITY_POCKETS,
  VESTA_ACTIVITY_SECTOR_ID,
  VESTA_POCKET_ACTOR_SLOT_ORDER,
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

test('the activity-pocket registry includes Pallas Drift, and the older sectors are unchanged', () => {
  assert.ok(ACTIVITY_POCKET_SECTOR_IDS.includes(PALLAS_ACTIVITY_SECTOR_ID));
  assert.equal(ACTIVITY_POCKETS_BY_SECTOR[PALLAS_ACTIVITY_SECTOR_ID], PALLAS_ACTIVITY_POCKETS);
  assert.equal(
    ACTIVITY_POCKETS.length,
    CERES_ACTIVITY_POCKETS.length
      + HELIOS_ACTIVITY_POCKETS.length
      + PALLAS_ACTIVITY_POCKETS.length
      + VESTA_ACTIVITY_POCKETS.length
      + TETHYS_ACTIVITY_POCKETS.length
      + SEDNA_ACTIVITY_POCKETS.length,
  );
  assert.equal(activityPocketsForSector('sector_pallas_drift').length, 4);
  assert.equal(activityPocketsForSector('sector_nowhere_belt').length, 0);

  // The discovery readers Ceres uses resolve Pallas pockets and slots too.
  for (const pocket of PALLAS_ACTIVITY_POCKETS) {
    assert.equal(activityPocketById(pocket.id), pocket);
  }
  for (const slotId of PALLAS_POCKET_ACTOR_SLOT_ORDER) {
    const slot = activityActorSlotById(slotId);
    assert.ok(slot, `Pallas slot readable through the shared reader: ${slotId}`);
    assert.equal(slot.worldRecordSlotId, `pallas:activity:${slotId}`, 'Pallas durable slot namespace');
  }
  assert.equal(activityRouteTopologyForSector(PALLAS_ACTIVITY_SECTOR_ID).length, 8);
  assert.ok(ACTIVITY_POCKETS_BY_ID.pallas_working_seam, 'Pallas joins the all-sector pocket index');
  assert.ok(ACTIVITY_POCKETS_BY_ID.pallas_hub_pocket, 'the hub is indexed');
  assert.ok(ACTIVITY_POCKETS_BY_ID.pallas_ambush_run, 'the ambush is indexed');
  assert.ok(ACTIVITY_POCKETS_BY_ID.pallas_nebula_grave, 'the grave is indexed');

  // No Ceres pocket id is copied (FB-030): the four sectors name disjoint casts.
  const otherSlotIds = new Set([
    ...CERES_POCKET_ACTOR_SLOT_ORDER,
    ...HELIOS_POCKET_ACTOR_SLOT_ORDER,
    ...VESTA_POCKET_ACTOR_SLOT_ORDER,
  ]);
  for (const slotId of PALLAS_POCKET_ACTOR_SLOT_ORDER) {
    assert.ok(!otherSlotIds.has(slotId), `Pallas slot id is its own: ${slotId}`);
  }

  // Older sectors keep their exact contracts.
  assert.equal(CERES_POCKET_ACTOR_SLOT_ORDER.length, 8);
  assert.equal(HELIOS_POCKET_ACTOR_SLOT_ORDER.length, 4);
  assert.equal(VESTA_POCKET_ACTOR_SLOT_ORDER.length, 8);
  assert.equal(PALLAS_POCKET_ACTOR_SLOT_ORDER.length, 8);
  assert.equal(CERES_ROUTE_TOPOLOGY.length, 8);
});

test('Pallas pockets obey the same band, shape and topology laws Ceres does', () => {
  assert.equal(PALLAS_ACTIVITY_POCKETS.length, 4, 'seam, hub, ambush, grave');
  assert.equal(PALLAS_POCKET_ACTOR_SLOT_ORDER.length, PALLAS_AUTHORED_ACTIVITY_CAPACITY);
  assert.equal(new Set(PALLAS_POCKET_ACTOR_SLOT_ORDER).size, PALLAS_POCKET_ACTOR_SLOT_ORDER.length);

  const pallasZones = SECTOR_ZONES[PALLAS_ACTIVITY_SECTOR_ID];
  const pallasAnchors = SECTOR_ANCHORS[PALLAS_ACTIVITY_SECTOR_ID];
  for (const pocket of PALLAS_ACTIVITY_POCKETS) {
    assert.equal(pocket.sectorId, PALLAS_ACTIVITY_SECTOR_ID);
    assert.equal(pocket.actorSlots.length, 2, `${pocket.id} declares exactly two pocket actors`);

    // The anchor is authored geography, not a free-floating point: a zone centre or an asteroid
    // field centre inside the sector the pocket claims.
    const anchor = pocket.activityAnchor.localPos;
    if (pocket.activityAnchor.kind === 'zone') {
      const zone = pallasZones.find((z) => z.id === pocket.activityAnchor.zoneId);
      assert.ok(zone, `${pocket.id} anchor zone exists`);
      assert.equal(anchor.x, zone.center.x);
      assert.equal(anchor.z, zone.center.z);
    } else if (pocket.activityAnchor.kind === 'field') {
      const field = pallasAnchors.fields.find((f) => f.id === pocket.activityAnchor.id);
      assert.ok(field, `${pocket.id} anchor field exists`);
      assert.equal(anchor.x, field.center.x);
      assert.equal(anchor.z, field.center.z);
    } else {
      assert.fail(`${pocket.id} anchors on an unexpected kind: ${pocket.activityAnchor.kind}`);
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
        }, PALLAS_ACTIVITY_SECTOR_ID);
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
  const classes = PALLAS_ROUTE_TOPOLOGY.map(routeTopologyClass);
  assert.equal(new Set(classes).size, classes.length, `distinct topology classes: ${classes.join(', ')}`);
  assert.equal(PALLAS_ROUTE_TOPOLOGY.length, PALLAS_POCKET_ACTOR_SLOT_ORDER.length);
  const pocketClasses = PALLAS_ACTIVITY_POCKETS.map((entry) => PALLAS_ROUTE_TOPOLOGY
    .filter((row) => row.pocketId === entry.id)
    .map(routeTopologyClass)
    .sort()
    .join('+'));
  assert.equal(new Set(pocketClasses).size, pocketClasses.length, `distinct pocket shapes: ${pocketClasses.join(', ')}`);
});

test('the Pallas chain is the drift day: seam, hub, ambush, grave', () => {
  const seam = activityPocketById('pallas_working_seam');
  const hub = activityPocketById('pallas_hub_pocket');
  const ambush = activityPocketById('pallas_ambush_run');
  const grave = activityPocketById('pallas_nebula_grave');
  assert.ok(seam && hub && ambush && grave);

  // A seam crew is on the Independent Seams, cutting two different faces of the authored field.
  assert.equal(seam.activityAnchor.zoneId, 'zone_pallas_belt', 'the seam hangs off the Independent Seams');
  assert.equal(seam.pq020Identity.fieldId, 'f_pallas_1', 'the seam works the belt\'s authored field');
  assert.ok(
    seam.objectSlots.some((o) => o.id === 'pallas_seam_ore_face' && o.targetRef === 'field:f_pallas_1'),
    'the ore face is a real slot on the authored field',
  );
  const miner = activityActorSlotById('pallas_seam_miner');
  assert.equal(miner.jobKind, 'miner');
  const surveyor = activityActorSlotById('pallas_seam_surveyor');
  assert.equal(surveyor.jobKind, 'miner', 'the seam crew covers different ground, not a second role');
  assert.notEqual(miner.route.id, surveyor.route.id, 'the two cuts are two authored routes');
  const firstMarkGap = Math.hypot(
    miner.route.marks[0].offset.x - surveyor.route.marks[0].offset.x,
    miner.route.marks[0].offset.z - surveyor.route.marks[0].offset.z,
  );
  assert.ok(firstMarkGap > 0, 'the two cuts are not the same geometry');
  const minerSweep = Math.abs(Math.atan2(miner.route.marks[0].offset.z, miner.route.marks[0].offset.x)
    - Math.atan2(miner.route.marks[1].offset.z, miner.route.marks[1].offset.x));
  const surveyorSweep = Math.abs(Math.atan2(surveyor.route.marks[0].offset.z, surveyor.route.marks[0].offset.x)
    - Math.atan2(surveyor.route.marks[1].offset.z, surveyor.route.marks[1].offset.x));
  assert.notEqual(Math.round(minerSweep), Math.round(surveyorSweep), 'the two cuts sweep different arcs');

  // A hauler and a tender work the Hollow Hub around station_smuggler's market.
  assert.equal(hub.activityAnchor.zoneId, 'zone_pallas_drift', 'the hub hangs off Hollow Station');
  assert.equal(hub.pq020Identity.placeId, 'station_smuggler', 'the hub leg is the smuggler market');
  const smuggler = SECTOR_ANCHORS[PALLAS_ACTIVITY_SECTOR_ID].stations.find((s) => s.id === 'station_smuggler');
  assert.ok(smuggler, 'station_smuggler exists');
  assert.equal(hub.activityAnchor.localPos.x, smuggler.pos.x, 'the hub anchor is the market itself');
  assert.equal(hub.activityAnchor.localPos.z, smuggler.pos.z, 'the hub anchor is the market itself');
  const hubHauler = activityActorSlotById('pallas_hub_hauler');
  assert.equal(hubHauler.jobKind, 'hauler');
  assert.ok(
    hub.objectSlots.some((o) => o.id === 'pallas_hub_pod' && o.kind === 'cargo_staging_pod'),
    'the hub stages cargo',
  );
  const hubTender = activityActorSlotById('pallas_hub_tender');
  assert.equal(hubTender.presentationRole, 'tender', 'the hub is a tender\'s beat');

  // The ambush pair rides the Sker-Run wreck lane: the pocket anchor is the dead hulk itself.
  assert.equal(ambush.activityAnchor.zoneId, 'zone_pallas_ambush', 'the ambush hangs off the Sker-Run');
  const wreck = SECTOR_ANCHORS[PALLAS_ACTIVITY_SECTOR_ID].pois.find((p) => p.id === 'poi_pwreck');
  assert.ok(wreck, 'poi_pwreck exists');
  assert.equal(ambush.activityAnchor.localPos.x, wreck.pos.x, 'the ambush anchor is the drifting wreck');
  assert.equal(ambush.activityAnchor.localPos.z, wreck.pos.z, 'the ambush anchor is the drifting wreck');
  const ambushHauler = activityActorSlotById('pallas_ambush_hauler');
  assert.equal(ambushHauler.jobKind, 'hauler');
  assert.equal(ambushHauler.lawful, false, 'the run runs unlicensed');
  const escort = activityActorSlotById('pallas_ambush_escort');
  assert.equal(escort.jobKind, 'patrol');
  assert.equal(escort.lawful, true, 'the escort rides lawfully alongside the run');
  assert.ok(
    ambush.objectSlots.some((o) => o.id === 'pallas_ambush_bait' && o.kind === 'bait_wreck_visual'),
    'the bait wreck is an authored body',
  );

  // The grave crew salvages the nebula field under patrol.
  assert.equal(grave.activityAnchor.kind, 'field', 'the grave anchors on the field itself');
  assert.equal(grave.activityAnchor.id, 'f_pallas_3', 'the grave is the authored nebula field');
  assert.equal(grave.pq020Identity.fieldId, 'f_pallas_3');
  const graveSalvor = activityActorSlotById('pallas_grave_salvor');
  assert.equal(graveSalvor.jobKind, 'salvor', 'the grave is a salvor\'s beat');
  assert.equal(graveSalvor.lawful, false, 'the salvor works unlicensed ground');
  assert.equal(graveSalvor.passive, true, 'the salvor is work, not a hostile spawn');
  const gravePatrol = activityActorSlotById('pallas_grave_patrol');
  assert.equal(gravePatrol.jobKind, 'patrol');
  assert.equal(gravePatrol.lawful, true, 'the grave is walked by a lawful patrol');
  assert.ok(
    grave.objectSlots.some((o) => o.id === 'pallas_grave_shard' && o.kind === 'grave_shard'),
    'the grave shard is an authored body',
  );

  // Every sentence is interruptible with verbs the player already has: every actor arrives
  // working, not shooting — and every one flies a job kind the runtime owns. The hub tender
  // rides the proven survey kernel (a hub check is a scan loop — the Vesta relay pattern); its
  // original authored kind 'tender' sat outside the runtime's set and materialized jobless.
  const kinds = PALLAS_ACTIVITY_POCKETS
    .flatMap((entry) => entry.actorSlots.map((slot) => slot.jobKind));
  for (const slot of PALLAS_ACTIVITY_POCKETS.flatMap((entry) => entry.actorSlots)) {
    assert.equal(slot.passive, true, `${slot.id} arrives working, not shooting`);
    assert.ok(
      ['hauler', 'miner', 'surveyor', 'patrol', 'salvor'].includes(slot.jobKind),
      `runtime job kind: ${slot.id} flies ${slot.jobKind}`,
    );
  }
  const hubTenderKind = activityActorSlotById('pallas_hub_tender').jobKind;
  assert.equal(hubTenderKind, 'surveyor', 'the hub tender flies the survey kernel, not a jobless cast');
  assert.ok(new Set(kinds).size >= 3, `distinct verbs across the day: ${kinds.join(', ')}`);
});

test('seed 4242: the shift is already under way when you arrive in Pallas Drift', () => {
  const pallasDef = SECTORS.find((s) => s.id === PALLAS_ACTIVITY_SECTOR_ID);
  assert.ok(pallasDef, 'Pallas Drift exists');

  const systems = [spawnBudget, traffic, cargo, economy, factions, heat, encounterDirector, npcJobsRuntime];
  const sim = createSimulation({ seed: SEED, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = PALLAS_ACTIVITY_SECTOR_ID;
  // The market and the trade hub stand where the anchors say they do; sector-local to global.
  for (const station of SECTOR_ANCHORS[PALLAS_ACTIVITY_SECTOR_ID].stations) {
    const pos = sectorLocalToGlobalForSector(station.pos, PALLAS_ACTIVITY_SECTOR_ID);
    sim.spawn({
      type: 'station', team: 2, pos, radius: 42, mass: 1e6,
      data: { stationId: station.id, name: station.id },
    });
  }
  const player = sim.spawn({
    type: 'ship', team: 0, pos: sectorLocalToGlobalForSector({ x: 0, z: -3200 }, PALLAS_ACTIVITY_SECTOR_ID),
    vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  state.player.heat = 0;
  state.onboarding = { active: false, finished: true };

  bus.emit('sector:enter', { sectorId: PALLAS_ACTIVITY_SECTOR_ID, sector: pallasDef });
  sim.runTicks(60);

  const bySlot = new Map();
  for (const rec of state.traffic.freighters || []) {
    const entity = state.entities.get(rec.id);
    if (!entity || !entity.alive) continue;
    const slotId = (entity.data && entity.data.activityActorSlotId) || rec.activityActorSlotId;
    if (slotId) bySlot.set(slotId, { rec, entity });
  }

  for (const slotId of PALLAS_POCKET_ACTOR_SLOT_ORDER) {
    const found = bySlot.get(slotId);
    assert.ok(found, `authored chain body is live in Pallas Drift: ${slotId}`);
    const { rec, entity } = found;
    assert.equal(rec.authoredActivityCast, true, `${slotId} is authored cast, not ambient filler`);
    assert.equal(entity.data.authoredActivityCast, true);
    assert.equal(entity.homeSectorId, PALLAS_ACTIVITY_SECTOR_ID, `${slotId} lives in Pallas Drift`);
    assert.ok(entity.data.worldRecordId, `${slotId} carries durable identity`);
    if (slotId === 'pallas_hub_tender') {
      // The tender rides the survey kernel (the Vesta relay pattern): its authored kind is
      // 'surveyor' with presentationRole 'tender', so the job builder assigns a real jobId and
      // the hub check is a working scan loop — not a named hull parked with no work.
      assert.ok(entity.data.jobId, 'pallas_hub_tender flies the survey kernel, not a jobless cast');
      continue;
    }
    assert.ok(entity.data.jobId, `${slotId} is flying a real job, not loitering`);
  }

  // The chain adds to the neighbourhood rather than replacing it: ambient still fills around it.
  const total = (state.traffic.freighters || []).length;
  assert.ok(total >= PALLAS_AUTHORED_ACTIVITY_CAPACITY, `chain plus ambient: ${total} bodies`);

  // Deterministic: the same seed produces the same eight authored identities.
  const ids = PALLAS_POCKET_ACTOR_SLOT_ORDER.map((slotId) => {
    const entity = bySlot.get(slotId).entity;
    return `${slotId}#${entity.data.worldRecordId}`;
  });
  assert.equal(new Set(ids).size, 8, 'eight distinct durable identities');
});

test('the marks sit on the authored marks: the flying jobs are the authored routes', () => {
  const seam = activityPocketById('pallas_working_seam');
  const hub = activityPocketById('pallas_hub_pocket');
  const ambush = activityPocketById('pallas_ambush_run');
  const grave = activityPocketById('pallas_nebula_grave');

  // Four different places: no two anchors share a position.
  const anchors = [seam, hub, ambush, grave].map((p) => p.activityAnchor.localPos);
  for (let i = 0; i < anchors.length; i += 1) {
    for (let j = i + 1; j < anchors.length; j += 1) {
      const d = Math.hypot(anchors[i].x - anchors[j].x, anchors[i].z - anchors[j].z);
      assert.ok(d > 0, `anchors ${i} and ${j} are two different places (${d.toFixed(1)} WU apart)`);
    }
  }

  // The hub hauler's two marks are collinear through the anchor: the run passes straight through
  // station_smuggler's market (sweep 180 deg), not an orbit that happens to pass.
  const hubHauler = activityActorSlotById('pallas_hub_hauler');
  const [haulA, haulB] = hubHauler.route.marks;
  const bearingA = Math.atan2(haulA.offset.z, haulA.offset.x);
  const bearingB = Math.atan2(haulB.offset.z, haulB.offset.x);
  let sweep = Math.abs(bearingA - bearingB);
  if (sweep > Math.PI) sweep = 2 * Math.PI - sweep;
  assert.ok(sweep > Math.PI - 0.05, `the hub haul runs through the market (sweep ${(sweep * 180 / Math.PI).toFixed(2)} deg)`);

  // In the live sector, each flying job's waypoints are the pocket's own authored marks resolved
  // through the sector coordinate reader — the same translation the discovery readers publish.
  const pallasDef = SECTORS.find((s) => s.id === PALLAS_ACTIVITY_SECTOR_ID);
  const systems = [spawnBudget, traffic, cargo, economy, factions, heat, encounterDirector, npcJobsRuntime];
  const sim = createSimulation({ seed: SEED, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = PALLAS_ACTIVITY_SECTOR_ID;
  for (const station of SECTOR_ANCHORS[PALLAS_ACTIVITY_SECTOR_ID].stations) {
    const pos = sectorLocalToGlobalForSector(station.pos, PALLAS_ACTIVITY_SECTOR_ID);
    sim.spawn({
      type: 'station', team: 2, pos, radius: 42, mass: 1e6,
      data: { stationId: station.id, name: station.id },
    });
  }
  const player = sim.spawn({
    type: 'ship', team: 0, pos: sectorLocalToGlobalForSector({ x: 0, z: -3200 }, PALLAS_ACTIVITY_SECTOR_ID),
    vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  state.player.heat = 0;
  state.onboarding = { active: false, finished: true };

  bus.emit('sector:enter', { sectorId: PALLAS_ACTIVITY_SECTOR_ID, sector: pallasDef });
  sim.runTicks(60);

  const bySlot = new Map();
  for (const rec of state.traffic.freighters || []) {
    const entity = state.entities.get(rec.id);
    if (!entity || !entity.alive) continue;
    const slotId = (entity.data && entity.data.activityActorSlotId) || rec.activityActorSlotId;
    if (slotId) bySlot.set(slotId, { rec, entity });
  }

  // The hub tender is absent: with no job (see the seed-4242 pin) it has no route to compare.
  const authoredPairs = [
    ['pallas_seam_miner', seam],
    ['pallas_seam_surveyor', seam],
    ['pallas_hub_hauler', hub],
    ['pallas_ambush_hauler', ambush],
    ['pallas_grave_salvor', grave],
  ];
  for (const [slotId, pocket] of authoredPairs) {
    const slot = activityActorSlotById(slotId);
    const found = bySlot.get(slotId);
    assert.ok(found, `${slotId} live`);
    const jobId = found.entity.data.jobId;
    assert.ok(jobId, `${slotId} flying an authored job`);
    const entry = (state.npcJobs && state.npcJobs.byId && state.npcJobs.byId[jobId]) || null;
    assert.ok(entry && entry.job, `${slotId} job readable through the runtime owner`);
    const route = entry.job.route;
    assert.ok(Array.isArray(route) && route.length === 2, `${slotId} flies a two-waypoint route`);
    const anchor = pocket.activityAnchor.localPos;
    slot.route.marks.forEach((mark, index) => {
      const expected = sectorLocalToGlobalForSector({
        x: anchor.x + mark.offset.x,
        z: anchor.z + mark.offset.z,
      }, PALLAS_ACTIVITY_SECTOR_ID);
      const flown = route[index] && route[index].pos;
      assert.ok(flown, `${slotId} waypoint ${index} exists`);
      const d = Math.hypot(flown.x - expected.x, flown.z - expected.z);
      assert.ok(d <= 0.5, `${slotId} waypoint ${index} on the authored mark ${mark.id} (${d.toFixed(3)} WU off)`);
    });
  }
});
