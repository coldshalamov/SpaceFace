// CR-HOLLOW-2 (build_map §23.2 CR-HOLLOW — "two kinds of empty") — sector_sedna_dark is the last
// frontier sector, authored with trafficPerMin 0 (a hollow rim), and its own material already
// promised a watch nobody could see: station_sedna is Helix's sensor desk charted "Sensors and
// hull patches at the dark rim; no fuel, no rescue, few questions", and past every authored zone
// waits poi_sedna_ringworld — "a colossal arc segment of an ancient orbital megastructure
// orbiting the frozen dark".
//
// The done sentence: arriving in Sedna Dark shows the occupied-quiet day — a survey tender and a
// dish rig making the rounds between the post and the Ringworld Arc, and at the rim a
// drift-watcher holding the post's line while a salvage cutter works a sheared plate off the dead
// megastructure — two pockets, four bodies, no lawful hulls (Helix is paper), nobody arriving
// hostile, every actor flying a job kind the runtime already owns, and the watcher's crawl the
// slowest route in the module because parked is a speed, not a missing route. Proved on the
// default seed 4242 against the live traffic owner, through the same discovery readers Ceres
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
  SEDNA_ACTIVITY_POCKETS_BY_ID,
  SEDNA_ACTIVITY_POCKET_ORDER,
  SEDNA_ACTIVITY_SECTOR_ID,
  SEDNA_AUTHORED_ACTIVITY_CAPACITY,
  SEDNA_POCKET_ACTOR_SLOT_ORDER,
  SEDNA_ROUTE_TOPOLOGY,
  KEPLER_ACTIVITY_POCKETS,
  DIONE_ACTIVITY_POCKETS,
  RHEA_ACTIVITY_POCKETS,
  PHOEBE_ACTIVITY_POCKETS,
  TETHYS_ACTIVITY_POCKETS,
  TETHYS_ACTIVITY_SECTOR_ID,
  VESTA_ACTIVITY_POCKETS,
  VESTA_ACTIVITY_SECTOR_ID,
  activityActorSlotById,
  activityPocketById,
  activityPocketsForSector,
  activityRouteTopologyForSector,
  distanceFromPocketAnchor,
  routeTopologyClass,
} from '../src/data/sectorActivityPockets.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';
import { SECTOR_ZONES } from '../src/data/sectorZones.js';
import { SEDNA_PATCH_GUN } from '../src/data/environmentalMachinery.js';
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

test('the activity-pocket registry includes Sedna Dark, and the older sectors are unchanged', () => {
  assert.ok(ACTIVITY_POCKET_SECTOR_IDS.includes(SEDNA_ACTIVITY_SECTOR_ID));
  assert.equal(ACTIVITY_POCKETS_BY_SECTOR[SEDNA_ACTIVITY_SECTOR_ID], SEDNA_ACTIVITY_POCKETS);
  assert.equal(
    ACTIVITY_POCKETS.length,
    CERES_ACTIVITY_POCKETS.length
      + HELIOS_ACTIVITY_POCKETS.length
      + PALLAS_ACTIVITY_POCKETS.length
      + VESTA_ACTIVITY_POCKETS.length
      + TETHYS_ACTIVITY_POCKETS.length
      + SEDNA_ACTIVITY_POCKETS.length
      + KEPLER_ACTIVITY_POCKETS.length
      + DIONE_ACTIVITY_POCKETS.length
      + RHEA_ACTIVITY_POCKETS.length
      + PHOEBE_ACTIVITY_POCKETS.length,
  );
  assert.equal(activityPocketsForSector('sector_sedna_dark').length, 3);
  assert.equal(activityPocketsForSector('sector_nowhere_belt').length, 0);

  // The discovery readers Ceres uses resolve Sedna pockets and slots too.
  for (const pocketId of SEDNA_ACTIVITY_POCKET_ORDER) {
    assert.equal(activityPocketById(pocketId), SEDNA_ACTIVITY_POCKETS_BY_ID[pocketId]);
  }
  for (const slotId of SEDNA_POCKET_ACTOR_SLOT_ORDER) {
    const slot = activityActorSlotById(slotId);
    assert.ok(slot, `Sedna slot readable through the shared reader: ${slotId}`);
    assert.equal(slot.worldRecordSlotId, `sedna:activity:${slotId}`, 'Sedna durable slot namespace');
  }
  assert.equal(activityRouteTopologyForSector(SEDNA_ACTIVITY_SECTOR_ID).length, 6);
  assert.ok(ACTIVITY_POCKETS_BY_ID.sedna_survey_rounds, 'Sedna joins the all-sector pocket index');

  // Older sectors keep their exact contracts.
  assert.equal(CERES_POCKET_ACTOR_SLOT_ORDER.length, 8);
  assert.equal(HELIOS_POCKET_ACTOR_SLOT_ORDER.length, 4);
  assert.equal(PALLAS_POCKET_ACTOR_SLOT_ORDER.length, 8);
  assert.equal(CERES_ROUTE_TOPOLOGY.length, 8);
});

test('Sedna pockets obey the same band, shape and topology laws Ceres does', () => {
  assert.equal(SEDNA_ACTIVITY_POCKETS.length, 3, 'the rounds at the post, the watch at the rim, the patch at the lamp');
  assert.equal(SEDNA_POCKET_ACTOR_SLOT_ORDER.length, SEDNA_AUTHORED_ACTIVITY_CAPACITY);
  assert.equal(new Set(SEDNA_POCKET_ACTOR_SLOT_ORDER).size, SEDNA_POCKET_ACTOR_SLOT_ORDER.length);

  const sednaZones = SECTOR_ZONES[SEDNA_ACTIVITY_SECTOR_ID];
  const sednaAnchors = SECTOR_ANCHORS[SEDNA_ACTIVITY_SECTOR_ID];
  for (const pocket of SEDNA_ACTIVITY_POCKETS) {
    assert.equal(pocket.sectorId, SEDNA_ACTIVITY_SECTOR_ID);
    assert.equal(pocket.actorSlots.length, 2, `${pocket.id} declares exactly two pocket actors`);

    // The anchor is authored geography, not a free-floating point: the survey post's own
    // position at its zone's heart, or the landmark arc itself — which sits past every zone,
    // because the rim is the point, so it claims no zone it is not in.
    const anchor = pocket.activityAnchor.localPos;
    if (pocket.activityAnchor.kind === 'station') {
      const station = sednaAnchors.stations.find((s) => s.id === pocket.activityAnchor.id);
      assert.ok(station, `${pocket.id} anchor station exists`);
      assert.equal(anchor.x, station.pos.x);
      assert.equal(anchor.z, station.pos.z);
      const zone = sednaZones.find((z) => z.id === pocket.activityAnchor.zoneId);
      assert.ok(zone, `${pocket.id} station anchor claims a real zone`);
      assert.equal(anchor.x, zone.center.x);
      assert.equal(anchor.z, zone.center.z);
    } else if (pocket.activityAnchor.kind === 'machine') {
      // The patch watch claims the Patch Gun itself: the lantern economy's working lamp,
      // inside the glow zone its walk is strung along.
      const machine = SEDNA_PATCH_GUN;
      assert.equal(pocket.activityAnchor.id, machine.id);
      assert.equal(anchor.x, machine.localPos.x);
      assert.equal(anchor.z, machine.localPos.z);
      const zone = sednaZones.find((z) => z.id === pocket.activityAnchor.zoneId);
      assert.ok(zone, `${pocket.id} machine anchor claims a real zone`);
      const zoneDist = Math.hypot(anchor.x - zone.center.x, anchor.z - zone.center.z);
      assert.ok(zoneDist <= zone.radius, `${pocket.id} machine anchor sits inside ${zone.id}`);
    } else if (pocket.activityAnchor.kind === 'poi') {
      const poi = sednaAnchors.pois.find((p) => p.id === pocket.activityAnchor.id);
      assert.ok(poi, `${pocket.id} anchor POI exists`);
      assert.equal(anchor.x, poi.pos.x);
      assert.equal(anchor.z, poi.pos.z);
      assert.equal(pocket.activityAnchor.zoneId, null,
        `${pocket.id} anchors past the zones — the rim claims none`);
      for (const zone of sednaZones) {
        const zoneDist = Math.hypot(anchor.x - zone.center.x, anchor.z - zone.center.z);
        assert.ok(zoneDist > zone.radius, `${pocket.id} POI anchor truly sits outside ${zone.id}`);
      }
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
        }, SEDNA_ACTIVITY_SECTOR_ID);
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
  const classes = SEDNA_ROUTE_TOPOLOGY.map(routeTopologyClass);
  assert.equal(new Set(classes).size, classes.length, `distinct topology classes: ${classes.join(', ')}`);
  assert.equal(SEDNA_ROUTE_TOPOLOGY.length, SEDNA_POCKET_ACTOR_SLOT_ORDER.length);
  const pocketClasses = SEDNA_ACTIVITY_POCKETS.map((entry) => SEDNA_ROUTE_TOPOLOGY
    .filter((row) => row.pocketId === entry.id)
    .map(routeTopologyClass)
    .sort()
    .join('+'));
  assert.equal(new Set(pocketClasses).size, pocketClasses.length, `distinct pocket shapes: ${pocketClasses.join(', ')}`);
});

test('the Sedna watch is the occupied-quiet day: the rounds at the post, the watch at the rim', () => {
  const rounds = activityPocketById('sedna_survey_rounds');
  const rim = activityPocketById('sedna_rim_watch');
  assert.ok(rounds && rim);

  // Survey tenders make the rounds between the post and the arc. The rounds hang off the Sedna
  // Survey Post itself, inside its own zone.
  assert.equal(rounds.activityAnchor.kind, 'station', 'the rounds anchor on the post');
  assert.equal(rounds.activityAnchor.id, 'station_sedna');
  assert.equal(rounds.activityAnchor.zoneId, 'zone_sedna_survey', 'the rounds belong to the Sedna Survey');
  const tender = activityActorSlotById('sedna_rounds_tender');
  assert.equal(tender.presentationRole, 'tender', 'the rounds are a tender\'s beat');
  assert.equal(tender.jobKind, 'surveyor', 'a survey round flies the proven scan kernel — a real job');
  assert.ok(
    tender.route.marks.some((m) => m.targetRef === 'station:station_sedna:service-berth'),
    'one leg services the post — sensors and hull patches',
  );
  assert.ok(
    tender.route.marks.some((m) => m.targetRef === 'activity:sedna-arc-run'),
    'the far leg runs out toward the Ringworld Arc',
  );
  const dish = activityActorSlotById('sedna_rounds_dish');
  assert.equal(dish.jobKind, 'surveyor', 'the dish rig covers the quadrant the lane does not');
  assert.notEqual(tender.route.id, dish.route.id, 'the rounds are two authored routes, not one patrol twice');

  // A drift-watcher parked at the rim, and a wreck nobody is hurrying — the Ringworld Arc is the
  // wreck, its sheared plate the authored body the cutter works.
  assert.equal(rim.activityAnchor.kind, 'poi', 'the watch anchors on the arc itself');
  assert.equal(rim.activityAnchor.placeId, 'poi_sedna_ringworld');
  const rimAnchor = rim.activityAnchor.localPos;
  const ringworldPoi = SECTOR_ANCHORS[SEDNA_ACTIVITY_SECTOR_ID].pois.find((p) => p.id === 'poi_sedna_ringworld');
  assert.equal(rimAnchor.x, ringworldPoi.pos.x);
  assert.equal(rimAnchor.z, ringworldPoi.pos.z);
  const watcher = activityActorSlotById('sedna_drift_watcher');
  assert.equal(watcher.jobKind, 'surveyor');
  assert.equal(watcher.passive, true, 'the watch is work, not a hostile spawn');
  const salvor = activityActorSlotById('sedna_arc_salvor');
  assert.equal(salvor.jobKind, 'salvor', 'the cutter works the wreck nobody is hurrying');
  assert.equal(salvor.lawful, false, 'unlicensed ground — the rim keeps no law desk');
  assert.ok(
    salvor.route.marks.some((m) => m.targetRef === 'object:sedna_arc_sheared_plate'),
    'the cutter works the authored arc plate',
  );
  assert.ok(
    rim.objectSlots.some((o) => o.id === 'sedna_arc_sheared_plate'),
    'the sheared plate is an authored body at the rim',
  );

  // Parked is a speed: the watcher holds the slowest route in the sector — the tightest wedge,
  // the shortest span, and the longest duration.
  const watcherRow = SEDNA_ROUTE_TOPOLOGY.find((row) => row.actorSlotId === 'sedna_drift_watcher');
  for (const row of SEDNA_ROUTE_TOPOLOGY) {
    if (row === watcherRow) continue;
    assert.ok(watcherRow.speedWUPerS < row.speedWUPerS,
      `the drift-watcher crawls slower than ${row.actorSlotId}`);
  }
  assert.ok(watcherRow.speedWUPerS < 2.5, `a parked watch, not a patrol: ${watcherRow.speedWUPerS} WU/s`);

  // Occupied-quiet: every actor flies a job kind the runtime owns, nobody is lawful (Helix is
  // paper — its Sedna presence is the audit desk, not a hull), and nobody arrives shooting.
  const kinds = SEDNA_ACTIVITY_POCKETS
    .flatMap((entry) => entry.actorSlots.map((slot) => slot.jobKind));
  for (const kind of kinds) {
    assert.ok(['hauler', 'miner', 'surveyor', 'patrol', 'salvor'].includes(kind), `runtime job kind: ${kind}`);
  }
  for (const slot of SEDNA_ACTIVITY_POCKETS.flatMap((entry) => entry.actorSlots)) {
    assert.equal(slot.passive, true, `${slot.id} arrives working, not shooting`);
    assert.equal(slot.lawful, false, `${slot.id} is not a law hull — Sedna keeps none`);
  }
  assert.ok(new Set(kinds).size >= 2, `distinct verbs across the watch: ${kinds.join(', ')}`);
});

test('seed 4242: the watch is already under way when you arrive in Sedna Dark', () => {
  const sednaDef = SECTORS.find((s) => s.id === SEDNA_ACTIVITY_SECTOR_ID);
  assert.ok(sednaDef, 'Sedna Dark exists');

  const systems = [spawnBudget, traffic, cargo, economy, factions, heat, encounterDirector, npcJobsRuntime];
  const sim = createSimulation({ seed: SEED, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SEDNA_ACTIVITY_SECTOR_ID;
  // The post stands where the anchors say it does; sector-local to global for each station.
  for (const station of SECTOR_ANCHORS[SEDNA_ACTIVITY_SECTOR_ID].stations) {
    const pos = sectorLocalToGlobalForSector(station.pos, SEDNA_ACTIVITY_SECTOR_ID);
    sim.spawn({
      type: 'station', team: 2, pos, radius: 42, mass: 1e6,
      data: { stationId: station.id, name: station.id },
    });
  }
  const player = sim.spawn({
    type: 'ship', team: 0, pos: sectorLocalToGlobalForSector({ x: 0, z: -3200 }, SEDNA_ACTIVITY_SECTOR_ID),
    vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  state.player.heat = 0;
  state.onboarding = { active: false, finished: true };

  bus.emit('sector:enter', { sectorId: SEDNA_ACTIVITY_SECTOR_ID, sector: sednaDef });
  sim.runTicks(60);

  const bySlot = new Map();
  for (const rec of state.traffic.freighters || []) {
    const entity = state.entities.get(rec.id);
    if (!entity || !entity.alive) continue;
    const slotId = (entity.data && entity.data.activityActorSlotId) || rec.activityActorSlotId;
    if (slotId) bySlot.set(slotId, { rec, entity });
  }

  for (const slotId of SEDNA_POCKET_ACTOR_SLOT_ORDER) {
    const found = bySlot.get(slotId);
    assert.ok(found, `authored watch body is live in Sedna Dark: ${slotId}`);
    const { rec, entity } = found;
    assert.equal(rec.authoredActivityCast, true, `${slotId} is authored cast, not ambient filler`);
    assert.equal(entity.data.authoredActivityCast, true);
    assert.equal(entity.homeSectorId, SEDNA_ACTIVITY_SECTOR_ID, `${slotId} lives in Sedna Dark`);
    assert.ok(entity.data.worldRecordId, `${slotId} carries durable identity`);
    assert.ok(entity.data.jobId, `${slotId} is flying a real job, not loitering`);
  }

  // The watch adds to the hollow rather than replacing it: trafficPerMin 0 means no ambient
  // freight — the authored cast IS the neighbourhood (a named face may still stamp one hull).
  const total = (state.traffic.freighters || []).length;
  assert.ok(total >= SEDNA_AUTHORED_ACTIVITY_CAPACITY, `watch plus the hollow: ${total} bodies`);

  // Deterministic: the same seed produces the same four authored identities.
  const ids = SEDNA_POCKET_ACTOR_SLOT_ORDER.map((slotId) => {
    const entity = bySlot.get(slotId).entity;
    return `${slotId}#${entity.data.worldRecordId}`;
  });
  assert.equal(new Set(ids).size, 6, 'six distinct durable identities');
});

test('the marks sit on the authored marks: the rounds are one string between the post and the arc', () => {
  // Post -> arc -> rim: each pocket anchor is the landmark its fiction names, and the two
  // pockets hold opposite ends of one bearing — the tender's arc leg aims out at the arc, the
  // watcher's post line aims back at the post.
  const rounds = activityPocketById('sedna_survey_rounds');
  const rim = activityPocketById('sedna_rim_watch');

  const postAnchor = rounds.activityAnchor.localPos;
  const rimAnchor = rim.activityAnchor.localPos;
  const postToArc = Math.hypot(rimAnchor.x - postAnchor.x, rimAnchor.z - postAnchor.z);
  assert.ok(postToArc > 2000, `the post and the arc are genuinely far apart: ${postToArc.toFixed(0)} WU`);

  // The tender's arc leg points from the post along the true bearing to the Ringworld Arc: the
  // rounds read as going somewhere specific, not as an orbit that happens to pass.
  const tender = activityActorSlotById('sedna_rounds_tender');
  const arcLeg = tender.route.marks.find((m) => m.id === 'sedna_tender_arc_leg');
  const arcMarkBearing = Math.atan2(arcLeg.offset.z, arcLeg.offset.x);
  const trueArcBearing = Math.atan2(rimAnchor.z - postAnchor.z, rimAnchor.x - postAnchor.x);
  let arcDelta = Math.abs(arcMarkBearing - trueArcBearing);
  if (arcDelta > Math.PI) arcDelta = 2 * Math.PI - arcDelta;
  assert.ok(arcDelta < 0.05, `arc leg aims at the true arc bearing (${(arcDelta * 180 / Math.PI).toFixed(2)} deg off)`);

  // The watcher's post-line mark points from the arc back down the same line at the post: the
  // drift-watch literally holds the survey post's bearing — the rounds, seen from the far end.
  const watcher = activityActorSlotById('sedna_drift_watcher');
  const postLine = watcher.route.marks.find((m) => m.id === 'sedna_watch_post_line');
  const postMarkBearing = Math.atan2(postLine.offset.z, postLine.offset.x);
  const truePostBearing = Math.atan2(postAnchor.z - rimAnchor.z, postAnchor.x - rimAnchor.x);
  let postDelta = Math.abs(postMarkBearing - truePostBearing);
  if (postDelta > Math.PI) postDelta = 2 * Math.PI - postDelta;
  assert.ok(postDelta < 0.05, `post line aims at the true post bearing (${(postDelta * 180 / Math.PI).toFixed(2)} deg off)`);
});
