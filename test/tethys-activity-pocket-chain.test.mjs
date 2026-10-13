// CV-DAY / CR-WEIR (authored rung-4 row) — sector_tethys_junction is the checkpoint day, the
// opposite flavor to Vesta's feedstock day. Its authored material already promised a border nobody
// could see working: "Concord scans inbound cargo here; contraband is seized, smugglers are
// flagged" (zone_tethys_checkpoint); "Convoys run this line between Helios, Ceres and Io"
// (zone_tethys_lane); "Contraband changes hands off the exchange lanes, away from Meridian eyes"
// (zone_tethys_blackmkt); station_customs sells toll/scan/refuel and charts itself "Everything
// transits; nothing transits unread."
//
// The done sentence: arriving in Tethys Junction mid-shift shows one living border day — a toll
// hauler holding in the checkpoint queue at station_customs, an scn patrol walking the trade lane,
// and a Quiet Cache runner whose route slides past the checkpoint — lawful-lane work and
// outlaw-lane work sharing the same water, neither a hostile spawn. The CR-WEIR / CV-DAY overlap:
// law you can fly, arriving mid-shift. Proved on the default seed 4242 against the live traffic
// owner, through the same discovery readers Ceres uses.

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
  SKER_ACTIVITY_POCKETS,
  TETHYS_ACTIVITY_POCKETS,
  TETHYS_ACTIVITY_POCKETS_BY_ID,
  TETHYS_ACTIVITY_POCKET_ORDER,
  TETHYS_ACTIVITY_SECTOR_ID,
  TETHYS_AUTHORED_ACTIVITY_CAPACITY,
  TETHYS_POCKET_ACTOR_SLOT_ORDER,
  TETHYS_ROUTE_TOPOLOGY,
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

test('the activity-pocket registry includes Tethys Junction, and the older sectors are unchanged', () => {
  assert.ok(ACTIVITY_POCKET_SECTOR_IDS.includes(TETHYS_ACTIVITY_SECTOR_ID));
  assert.equal(ACTIVITY_POCKETS_BY_SECTOR[TETHYS_ACTIVITY_SECTOR_ID], TETHYS_ACTIVITY_POCKETS);
  assert.equal(
    ACTIVITY_POCKETS.length,
    // The registry is the flat concatenation of every registered sector, so a new sector can join
    // it without this pin being edited (CR-HOLLOW-4 added seven).
    Object.values(ACTIVITY_POCKETS_BY_SECTOR).reduce((total, list) => total + list.length, 0),
  );
  assert.equal(activityPocketsForSector('sector_tethys_junction').length, 4);
  assert.equal(activityPocketsForSector('sector_nowhere_belt').length, 0);

  // The discovery readers Ceres uses resolve Tethys pockets and slots too.
  for (const pocketId of TETHYS_ACTIVITY_POCKET_ORDER) {
    assert.equal(activityPocketById(pocketId), TETHYS_ACTIVITY_POCKETS_BY_ID[pocketId]);
  }
  for (const slotId of TETHYS_POCKET_ACTOR_SLOT_ORDER) {
    const slot = activityActorSlotById(slotId);
    assert.ok(slot, `Tethys slot readable through the shared reader: ${slotId}`);
    assert.equal(slot.worldRecordSlotId, `tethys:activity:${slotId}`, 'Tethys durable slot namespace');
  }
  assert.equal(activityRouteTopologyForSector(TETHYS_ACTIVITY_SECTOR_ID).length, 8);
  assert.ok(ACTIVITY_POCKETS_BY_ID.tethys_checkpoint_queue, 'Tethys joins the all-sector pocket index');

  // Older sectors keep their exact contracts.
  assert.equal(CERES_POCKET_ACTOR_SLOT_ORDER.length, 8);
  assert.equal(HELIOS_POCKET_ACTOR_SLOT_ORDER.length, 4);
  assert.equal(PALLAS_POCKET_ACTOR_SLOT_ORDER.length, 8);
  assert.equal(CERES_ROUTE_TOPOLOGY.length, 8);
  assert.equal(ACTIVITY_POCKETS_BY_ID.vesta_feedstock_seam, activityPocketById('vesta_feedstock_seam'));
});

test('Tethys pockets obey the same band, shape and topology laws Ceres does', () => {
  assert.equal(TETHYS_ACTIVITY_POCKETS.length, 4, 'queue, lane, cache, log');
  assert.equal(TETHYS_POCKET_ACTOR_SLOT_ORDER.length, TETHYS_AUTHORED_ACTIVITY_CAPACITY);
  assert.equal(new Set(TETHYS_POCKET_ACTOR_SLOT_ORDER).size, TETHYS_POCKET_ACTOR_SLOT_ORDER.length);

  const tethysZones = SECTOR_ZONES[TETHYS_ACTIVITY_SECTOR_ID];
  const tethysAnchors = SECTOR_ANCHORS[TETHYS_ACTIVITY_SECTOR_ID];
  for (const pocket of TETHYS_ACTIVITY_POCKETS) {
    assert.equal(pocket.sectorId, TETHYS_ACTIVITY_SECTOR_ID);
    assert.equal(pocket.actorSlots.length, 2, `${pocket.id} declares exactly two pocket actors`);

    // The anchor is authored geography, not a free-floating point: a zone center, the customs
    // station's own position, or a landmark POI inside the zone it claims.
    const anchor = pocket.activityAnchor.localPos;
    if (pocket.activityAnchor.kind === 'zone') {
      const zone = tethysZones.find((z) => z.id === pocket.activityAnchor.zoneId);
      assert.ok(zone, `${pocket.id} anchor zone exists`);
      assert.equal(anchor.x, zone.center.x);
      assert.equal(anchor.z, zone.center.z);
    } else if (pocket.activityAnchor.kind === 'station') {
      const station = tethysAnchors.stations.find((s) => s.id === pocket.activityAnchor.id);
      assert.ok(station, `${pocket.id} anchor station exists`);
      assert.equal(anchor.x, station.pos.x);
      assert.equal(anchor.z, station.pos.z);
    } else if (pocket.activityAnchor.kind === 'poi') {
      const poi = tethysAnchors.pois.find((p) => p.id === pocket.activityAnchor.id);
      assert.ok(poi, `${pocket.id} anchor POI exists`);
      assert.equal(anchor.x, poi.pos.x);
      assert.equal(anchor.z, poi.pos.z);
      const zone = tethysZones.find((z) => z.id === pocket.activityAnchor.zoneId);
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
        }, TETHYS_ACTIVITY_SECTOR_ID);
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
  const classes = TETHYS_ROUTE_TOPOLOGY.map(routeTopologyClass);
  assert.equal(new Set(classes).size, classes.length, `distinct topology classes: ${classes.join(', ')}`);
  assert.equal(TETHYS_ROUTE_TOPOLOGY.length, TETHYS_POCKET_ACTOR_SLOT_ORDER.length);
  const pocketClasses = TETHYS_ACTIVITY_POCKETS.map((entry) => TETHYS_ROUTE_TOPOLOGY
    .filter((row) => row.pocketId === entry.id)
    .map(routeTopologyClass)
    .sort()
    .join('+'));
  assert.equal(new Set(pocketClasses).size, pocketClasses.length, `distinct pocket shapes: ${pocketClasses.join(', ')}`);
});

test('the Tethys chain is the checkpoint day: queue, lane, cache, log', () => {
  const queue = activityPocketById('tethys_checkpoint_queue');
  const lane = activityPocketById('tethys_lane_patrol');
  const cache = activityPocketById('tethys_quiet_cache');
  const log = activityPocketById('tethys_customs_log');
  assert.ok(queue && lane && cache && log);

  // A toll hauler holds in the checkpoint queue at station_customs, under the scn's own walk.
  assert.equal(queue.activityAnchor.zoneId, 'zone_tethys_checkpoint', 'the queue hangs off the checkpoint');
  assert.equal(queue.activityAnchor.placeId, 'station_customs', 'the queue is the Customs Gate scan face');
  const tollHauler = activityActorSlotById('tethys_toll_hauler');
  assert.equal(tollHauler.jobKind, 'hauler');
  assert.equal(tollHauler.route.receiptType, 'freight:arrival');
  assert.ok(
    tollHauler.route.marks.some((m) => m.id === 'tethys_queue_hold'),
    'the hauler holds on an authored queue mark',
  );
  assert.ok(
    tollHauler.route.marks.some((m) => m.targetRef === 'dest:station_customs'),
    'the cleared leg resolves to the real customs berth',
  );
  const gatePatrol = activityActorSlotById('tethys_customs_patrol');
  assert.equal(gatePatrol.jobKind, 'patrol');
  assert.equal(gatePatrol.lawful, true, 'the scn walks its own gate');

  // An scn patrol walks the trade lane while a convoy runs it end to end.
  assert.equal(lane.activityAnchor.zoneId, 'zone_tethys_lane', 'the beat is the Junction Trade Lane');
  const convoy = activityActorSlotById('tethys_lane_convoy');
  assert.equal(convoy.jobKind, 'hauler');
  assert.equal(convoy.route.receiptType, 'freight:arrival');
  assert.ok(
    convoy.route.marks.some((m) => m.targetRef === 'dest:station_tethys'),
    'the convoy leg resolves to the real hub berth',
  );
  const lanePatrol = activityActorSlotById('tethys_lane_patrol');
  assert.equal(lanePatrol.jobKind, 'patrol');
  assert.equal(lanePatrol.lawful, true, 'the patrol walks the artery');

  // A Quiet Cache runner loads at the buoy and slides past the checkpoint: outlaw-lane work on
  // the same water as the law, and neither arrives hostile.
  assert.equal(cache.activityAnchor.zoneId, 'zone_tethys_blackmkt', 'the runner hangs off The Quiet Cache');
  assert.equal(cache.activityAnchor.placeId, 'poi_blackmkt', 'anchored on the cache buoy itself');
  const cacheAnchor = cache.activityAnchor.localPos;
  const blackmktZone = SECTOR_ZONES[TETHYS_ACTIVITY_SECTOR_ID].find((z) => z.id === 'zone_tethys_blackmkt');
  assert.equal(cacheAnchor.x, blackmktZone.center.x, 'the cache buoy floats at its zone heart');
  assert.equal(cacheAnchor.z, blackmktZone.center.z);
  const runner = activityActorSlotById('tethys_quiet_runner');
  assert.equal(runner.presentationRole, 'smuggler', 'the runner reads as the Quiet\'s own hull');
  assert.equal(runner.jobKind, 'hauler', 'the runner flies the proven haul kernel');
  assert.equal(runner.lawful, false, 'the runner works unlicensed ground');
  assert.equal(runner.passive, true, 'the runner is work, not a hostile spawn');
  const runnerClass = routeTopologyClass(TETHYS_ROUTE_TOPOLOGY.find((row) => row.actorSlotId === 'tethys_quiet_runner'));
  const tollClass = routeTopologyClass(TETHYS_ROUTE_TOPOLOGY.find((row) => row.actorSlotId === 'tethys_toll_hauler'));
  const lanePatrolClass = routeTopologyClass(TETHYS_ROUTE_TOPOLOGY.find((row) => row.actorSlotId === 'tethys_lane_patrol'));
  assert.notEqual(runnerClass, tollClass, 'the runner\'s shape is not the toll hauler\'s');
  assert.notEqual(runnerClass, lanePatrolClass, 'the runner\'s shape is not the patrol\'s');
  const keeper = activityActorSlotById('tethys_quiet_keeper');
  assert.equal(keeper.presentationRole, 'tender', 'the cache keeper is a working body');
  assert.equal(keeper.jobKind, 'surveyor', 'a stash check flies the proven scan kernel — a real job');

  // The customs log relay has its own scavenger crew: the last log before the line, picked over.
  assert.equal(log.activityAnchor.placeId, 'poi_tethys_customs_log', 'the crew hangs off the log relay');
  assert.equal(log.activityAnchor.zoneId, 'zone_tethys_checkpoint', 'the log sits inside Concord ground');
  const logSalvor = activityActorSlotById('tethys_log_salvor');
  assert.equal(logSalvor.jobKind, 'salvor');
  assert.equal(logSalvor.lawful, false, 'the cutter works unlicensed hulks');
  assert.equal(logSalvor.passive, true, 'and is work, not a hostile spawn');
  const logSurveyor = activityActorSlotById('tethys_log_surveyor');
  assert.equal(logSurveyor.jobKind, 'surveyor', 'the count keeps its own rig honest');
  assert.ok(
    log.objectSlots.some((o) => o.id === 'tethys_log_hull_shard'),
    'the seized hulks are an authored body the crew works around',
  );

  // Every sentence is interruptible with verbs the player already has: every actor flies a job
  // kind the runtime owns, and nobody arrives hostile.
  const kinds = TETHYS_ACTIVITY_POCKETS
    .flatMap((entry) => entry.actorSlots.map((slot) => slot.jobKind));
  for (const kind of kinds) {
    assert.ok(['hauler', 'miner', 'surveyor', 'patrol', 'salvor'].includes(kind), `runtime job kind: ${kind}`);
  }
  for (const slot of TETHYS_ACTIVITY_POCKETS.flatMap((entry) => entry.actorSlots)) {
    assert.equal(slot.passive, true, `${slot.id} arrives working, not shooting`);
  }
  assert.ok(new Set(kinds).size >= 4, `distinct verbs across the day: ${kinds.join(', ')}`);
  const lawfulFlags = TETHYS_ACTIVITY_POCKETS
    .flatMap((entry) => entry.actorSlots.map((slot) => [slot.id, slot.lawful === true]));
  assert.deepEqual(
    lawfulFlags.filter(([, lawful]) => lawful).map(([id]) => id).sort(),
    ['tethys_customs_patrol', 'tethys_lane_patrol'],
    'exactly the two patrols carry the law',
  );
});

test('seed 4242: the shift is already under way when you arrive in Tethys Junction', () => {
  const tethysDef = SECTORS.find((s) => s.id === TETHYS_ACTIVITY_SECTOR_ID);
  assert.ok(tethysDef, 'Tethys Junction exists');

  const systems = [spawnBudget, traffic, cargo, economy, factions, heat, encounterDirector, npcJobsRuntime];
  const sim = createSimulation({ seed: SEED, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = TETHYS_ACTIVITY_SECTOR_ID;
  // The gate stands where the anchors say it does; sector-local to global for each station.
  for (const station of SECTOR_ANCHORS[TETHYS_ACTIVITY_SECTOR_ID].stations) {
    const pos = sectorLocalToGlobalForSector(station.pos, TETHYS_ACTIVITY_SECTOR_ID);
    sim.spawn({
      type: 'station', team: 2, pos, radius: 42, mass: 1e6,
      data: { stationId: station.id, name: station.id },
    });
  }
  const player = sim.spawn({
    type: 'ship', team: 0, pos: sectorLocalToGlobalForSector({ x: 0, z: -3200 }, TETHYS_ACTIVITY_SECTOR_ID),
    vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  state.player.heat = 0;
  state.onboarding = { active: false, finished: true };

  bus.emit('sector:enter', { sectorId: TETHYS_ACTIVITY_SECTOR_ID, sector: tethysDef });
  sim.runTicks(60);

  const bySlot = new Map();
  for (const rec of state.traffic.freighters || []) {
    const entity = state.entities.get(rec.id);
    if (!entity || !entity.alive) continue;
    const slotId = (entity.data && entity.data.activityActorSlotId) || rec.activityActorSlotId;
    if (slotId) bySlot.set(slotId, { rec, entity });
  }

  for (const slotId of TETHYS_POCKET_ACTOR_SLOT_ORDER) {
    const found = bySlot.get(slotId);
    assert.ok(found, `authored chain body is live in Tethys Junction: ${slotId}`);
    const { rec, entity } = found;
    assert.equal(rec.authoredActivityCast, true, `${slotId} is authored cast, not ambient filler`);
    assert.equal(entity.data.authoredActivityCast, true);
    assert.equal(entity.homeSectorId, TETHYS_ACTIVITY_SECTOR_ID, `${slotId} lives in Tethys Junction`);
    assert.ok(entity.data.worldRecordId, `${slotId} carries durable identity`);
    assert.ok(entity.data.jobId, `${slotId} is flying a real job, not loitering`);
  }

  // The chain adds to the neighbourhood rather than replacing it: ambient still fills around it.
  const total = (state.traffic.freighters || []).length;
  assert.ok(total >= TETHYS_AUTHORED_ACTIVITY_CAPACITY, `chain plus ambient: ${total} bodies`);

  // Deterministic: the same seed produces the same eight authored identities.
  const ids = TETHYS_POCKET_ACTOR_SLOT_ORDER.map((slotId) => {
    const entity = bySlot.get(slotId).entity;
    return `${slotId}#${entity.data.worldRecordId}`;
  });
  assert.equal(new Set(ids).size, 8, 'eight distinct durable identities');
});

test('the marks sit on the authored marks: the chain strings the border the chart promises', () => {
  // Each bearing-critical leg aims at the real object its fiction names, so the day reads as
  // geography rather than as choreography that happens to pass.
  const queue = activityPocketById('tethys_checkpoint_queue');
  const lane = activityPocketById('tethys_lane_patrol');
  const cache = activityPocketById('tethys_quiet_cache');
  const log = activityPocketById('tethys_customs_log');
  const tethysAnchors = SECTOR_ANCHORS[TETHYS_ACTIVITY_SECTOR_ID];
  const stationCustoms = tethysAnchors.stations.find((s) => s.id === 'station_customs');
  const ioGate = tethysAnchors.gates.find((g) => g.to === 'sector_io_reach');

  function bearingDelta(anchor, mark, worldTarget) {
    const markWorld = { x: anchor.x + mark.offset.x, z: anchor.z + mark.offset.z };
    const markBearing = Math.atan2(markWorld.z - anchor.z, markWorld.x - anchor.x);
    const targetBearing = Math.atan2(worldTarget.z - anchor.z, worldTarget.x - anchor.x);
    let delta = Math.abs(markBearing - targetBearing);
    if (delta > Math.PI) delta = 2 * Math.PI - delta;
    return delta;
  }

  // The toll hauler's hold mark points down the true bearing of the tally queue head — the queue
  // the tally built is the queue the hauler holds in.
  const queueHead = SECTORS.find((s) => s.id === TETHYS_ACTIVITY_SECTOR_ID).pois
    .find((p) => p.id === 'poi_tethys_tally_queue_head');
  assert.ok(queueHead && queueHead.pos, 'the tally queue head is authored geography');
  const tollHauler = activityActorSlotById('tethys_toll_hauler');
  const holdMark = tollHauler.route.marks.find((m) => m.id === 'tethys_queue_hold');
  const queueDelta = bearingDelta(queue.activityAnchor.localPos, holdMark, queueHead.pos);
  assert.ok(queueDelta < 0.05, `hold mark aims at the queue head (${(queueDelta * 180 / Math.PI).toFixed(2)} deg off)`);

  // The Quiet runner's transit leg slides past the checkpoint: aimed at station_customs's true
  // bearing, and stopping inside the authored band — past the law, not at it.
  const runner = activityActorSlotById('tethys_quiet_runner');
  const transitMark = runner.route.marks.find((m) => m.id === 'tethys_quiet_transit_leg');
  const transitDelta = bearingDelta(cache.activityAnchor.localPos, transitMark, stationCustoms.pos);
  assert.ok(transitDelta < 0.05, `transit leg aims at the checkpoint bearing (${(transitDelta * 180 / Math.PI).toFixed(2)} deg off)`);
  const transitDist = distanceFromPocketAnchor(transitMark.offset);
  assert.ok(transitDist <= 125, `the runner stops in authored water (${transitDist.toFixed(1)} WU), short of the gate`);

  // The convoy's outbound leg aims at the Io gate's own bearing — the artery, end to end.
  const convoy = activityActorSlotById('tethys_lane_convoy');
  const ioMark = convoy.route.marks.find((m) => m.id === 'tethys_lane_io_leg');
  assert.ok(ioGate, 'the Io gate is authored geography');
  const ioDelta = bearingDelta(lane.activityAnchor.localPos, ioMark, ioGate.pos);
  assert.ok(ioDelta < 0.05, `lane leg aims at the Io gate bearing (${(ioDelta * 180 / Math.PI).toFixed(2)} deg off)`);

  // The log cutter's yard leg aims at the customs station the cut plate sells to.
  const logSalvor = activityActorSlotById('tethys_log_salvor');
  const yardMark = logSalvor.route.marks.find((m) => m.id === 'tethys_log_yard_leg');
  const yardDelta = bearingDelta(log.activityAnchor.localPos, yardMark, stationCustoms.pos);
  assert.ok(yardDelta < 0.05, `yard leg aims at the customs station bearing (${(yardDelta * 180 / Math.PI).toFixed(2)} deg off)`);
});
