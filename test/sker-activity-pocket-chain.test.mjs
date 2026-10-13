// CR-HOLLOW-3 (same family as CR-HOLLOW-2's Sedna watch-day) — sector_sker_haven is the Reach's
// bazaar, authored with trafficPerMin 9, yet until this pocket the apron was anonymous ambient
// scatter. The sector's own material already promised a shift nobody could see: zone_sker_haven
// is "an open pirate haven — the Reach fence stolen cargo and refit raiders here", zone_sker_belt
// is "Seams mined by press-ganged crews under Reach guns", and station_sker's repGated berth makes
// the door a character — "you're vouched for or you're cargo".
//
// The done sentence: arriving in Sker Haven shows the Bazaar's day — the fence's runner making
// the off-manifest leg between the hold pod and the last straight into the berth while a Reach
// gun holds the vetting chord across the arrival face, and in the Press-Gang Seams a worked crew
// hull shuttling between the face and the tally crate under the gun that owns it — two pockets,
// four bodies, no lawful hulls (the Reach is not law), nobody arriving hostile, every actor
// flying a job kind the runtime already owns, and the door picket's held chord the slowest route
// in the sector because a vetting line is a wait, not a beat. Proved on the default seed 4242
// against the live traffic owner, through the same discovery readers Ceres uses.

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
  HELIOS_ACTIVITY_POCKETS,
  HELIOS_ACTIVITY_SECTOR_ID,
  HELIOS_POCKET_ACTOR_SLOT_ORDER,
  PALLAS_ACTIVITY_POCKETS,
  PALLAS_ACTIVITY_SECTOR_ID,
  PALLAS_POCKET_ACTOR_SLOT_ORDER,
  SEDNA_ACTIVITY_POCKETS,
  SEDNA_ACTIVITY_SECTOR_ID,
  SKER_ACTIVITY_POCKETS,
  SKER_ACTIVITY_POCKETS_BY_ID,
  SKER_ACTIVITY_POCKET_ORDER,
  SKER_ACTIVITY_SECTOR_ID,
  SKER_AUTHORED_ACTIVITY_CAPACITY,
  SKER_POCKET_ACTOR_SLOT_ORDER,
  SKER_ROUTE_TOPOLOGY,
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

test('the activity-pocket registry includes Sker Haven, and the older sectors are unchanged', () => {
  assert.ok(ACTIVITY_POCKET_SECTOR_IDS.includes(SKER_ACTIVITY_SECTOR_ID));
  assert.equal(ACTIVITY_POCKETS_BY_SECTOR[SKER_ACTIVITY_SECTOR_ID], SKER_ACTIVITY_POCKETS);
  assert.equal(
    ACTIVITY_POCKETS.length,
    // The registry is the flat concatenation of every registered sector, so a new sector can join
    // it without this pin being edited (CR-HOLLOW-4 added seven).
    Object.values(ACTIVITY_POCKETS_BY_SECTOR).reduce((total, list) => total + list.length, 0),
  );
  assert.equal(activityPocketsForSector('sector_sker_haven').length, 2);
  assert.equal(activityPocketsForSector('sector_nowhere_belt').length, 0);

  // The discovery readers Ceres uses resolve Sker pockets and slots too.
  for (const pocketId of SKER_ACTIVITY_POCKET_ORDER) {
    assert.equal(activityPocketById(pocketId), SKER_ACTIVITY_POCKETS_BY_ID[pocketId]);
  }
  for (const slotId of SKER_POCKET_ACTOR_SLOT_ORDER) {
    const slot = activityActorSlotById(slotId);
    assert.ok(slot, `Sker slot readable through the shared reader: ${slotId}`);
    assert.equal(slot.worldRecordSlotId, `sker:activity:${slotId}`, 'Sker durable slot namespace');
  }
  assert.equal(activityRouteTopologyForSector(SKER_ACTIVITY_SECTOR_ID).length, 4);
  assert.ok(ACTIVITY_POCKETS_BY_ID.sker_bazaar_apron, 'Sker joins the all-sector pocket index');

  // Older sectors keep their exact contracts.
  assert.equal(CERES_POCKET_ACTOR_SLOT_ORDER.length, 8);
  assert.equal(HELIOS_POCKET_ACTOR_SLOT_ORDER.length, 4);
  assert.equal(PALLAS_POCKET_ACTOR_SLOT_ORDER.length, 8);
});

test('Sker pockets obey the same band, shape and topology laws Ceres does', () => {
  assert.equal(SKER_ACTIVITY_POCKETS.length, 2, 'the fence apron, the press-gang seam');
  assert.equal(SKER_POCKET_ACTOR_SLOT_ORDER.length, SKER_AUTHORED_ACTIVITY_CAPACITY);
  assert.equal(new Set(SKER_POCKET_ACTOR_SLOT_ORDER).size, SKER_POCKET_ACTOR_SLOT_ORDER.length);

  const skerZones = SECTOR_ZONES[SKER_ACTIVITY_SECTOR_ID];
  const skerAnchors = SECTOR_ANCHORS[SKER_ACTIVITY_SECTOR_ID];
  for (const pocket of SKER_ACTIVITY_POCKETS) {
    assert.equal(pocket.sectorId, SKER_ACTIVITY_SECTOR_ID);
    assert.equal(pocket.actorSlots.length, 2, `${pocket.id} declares exactly two pocket actors`);

    // The anchor is authored geography, not a free-floating point: the Bazaar's own position at
    // its zone's heart, or the Press-Gang Seams zone — whose center is the field it works.
    const anchor = pocket.activityAnchor.localPos;
    if (pocket.activityAnchor.kind === 'station') {
      const station = skerAnchors.stations.find((s) => s.id === pocket.activityAnchor.id);
      assert.ok(station, `${pocket.id} anchor station exists`);
      assert.equal(anchor.x, station.pos.x);
      assert.equal(anchor.z, station.pos.z);
      const zone = skerZones.find((z) => z.id === pocket.activityAnchor.zoneId);
      assert.ok(zone, `${pocket.id} station anchor claims a real zone`);
      assert.equal(anchor.x, zone.center.x);
      assert.equal(anchor.z, zone.center.z);
    } else if (pocket.activityAnchor.kind === 'zone') {
      const zone = skerZones.find((z) => z.id === pocket.activityAnchor.zoneId);
      assert.ok(zone, `${pocket.id} anchors on a real zone`);
      assert.equal(anchor.x, zone.center.x);
      assert.equal(anchor.z, zone.center.z);
      const field = skerAnchors.fields.find((f) => f.id === 'f_sker_1');
      assert.ok(field, 'the seam pocket claims the field its zone works');
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
        }, SKER_ACTIVITY_SECTOR_ID);
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
  const classes = SKER_ROUTE_TOPOLOGY.map(routeTopologyClass);
  assert.equal(new Set(classes).size, classes.length, `distinct topology classes: ${classes.join(', ')}`);
  assert.equal(SKER_ROUTE_TOPOLOGY.length, SKER_POCKET_ACTOR_SLOT_ORDER.length);
  const pocketClasses = SKER_ACTIVITY_POCKETS.map((entry) => SKER_ROUTE_TOPOLOGY
    .filter((row) => row.pocketId === entry.id)
    .map(routeTopologyClass)
    .sort()
    .join('+'));
  assert.equal(new Set(pocketClasses).size, pocketClasses.length, `distinct pocket shapes: ${pocketClasses.join(', ')}`);
});

test('the Sker shift is the Bazaar\'s day: the fence apron, the press-gang seam', () => {
  const apron = activityPocketById('sker_bazaar_apron');
  const seam = activityPocketById('sker_press_gang_seam');
  assert.ok(apron && seam);

  // The apron hangs off the Bazaar itself, inside Skerris Deep. The runner is a smuggler flying
  // the hauler kernel — the fence's fetch is freight work — with one leg out to the hold pod and
  // one leg onto the station's arrival approach.
  assert.equal(apron.activityAnchor.kind, 'station', 'the apron anchors on the Bazaar');
  assert.equal(apron.activityAnchor.id, 'station_sker');
  assert.equal(apron.activityAnchor.zoneId, 'zone_sker_haven', 'the apron belongs to Skerris Deep');
  const runner = activityActorSlotById('sker_apron_runner');
  assert.equal(runner.presentationRole, 'smuggler', 'the fetch is the smuggler hull, not a clean hauler');
  assert.equal(runner.jobKind, 'hauler', 'the fetch flies the proven freight kernel');
  assert.equal(runner.route.receiptType, 'freight:arrival', 'the leg posts a freight arrival receipt');
  assert.ok(
    runner.route.marks.some((m) => m.targetRef === 'object:sker_fence_hold_pod'),
    'one leg services the fence\'s hold pod — the off-manifest freight',
  );
  assert.ok(
    runner.route.marks.some((m) => m.targetRef === 'dest:station_sker'),
    'the return leg resolves to the Bazaar — the goods DO reach the market',
  );

  // The door vets standing: a Reach gun on a patrol kernel holding the vetting chord across the
  // arrival face — one end aimed at the Pallas approach, where inbound traffic actually comes in.
  const picket = activityActorSlotById('sker_door_picket');
  assert.equal(picket.presentationRole, 'pirate', 'the door picket is a Reach raider hull');
  assert.equal(picket.jobKind, 'patrol', 'the vetting chord flies the patrol kernel');
  assert.notEqual(runner.route.id, picket.route.id, 'the apron is two authored routes, not one run twice');

  // The seam anchors on the Press-Gang Seams zone — whose center is the field it works — not on
  // the Bazaar. The toiler is a mining barge flying the extraction kernel between the field's
  // face and the crate that tallies the take.
  assert.equal(seam.activityAnchor.kind, 'zone', 'the seam anchors on its zone, not the market');
  assert.equal(seam.activityAnchor.zoneId, 'zone_sker_belt');
  assert.equal(seam.pq020Identity.fieldId, 'f_sker_1', 'the seam works the belt\'s authored field');
  const toiler = activityActorSlotById('sker_seam_toiler');
  assert.equal(toiler.presentationRole, 'miner', 'the press-ganged crew flies a mining barge');
  assert.equal(toiler.jobKind, 'miner', 'the crew flies the proven extraction kernel');
  assert.equal(toiler.route.receiptType, 'mining:npcExtraction', 'the seam\'s cut posts an extraction receipt');
  assert.ok(
    toiler.route.marks.some((m) => m.targetRef === 'field:f_sker_1'),
    'the face mark names the authored field the seam works',
  );
  assert.ok(
    toiler.route.marks.some((m) => m.targetRef === 'object:sker_seam_tally_crate'),
    'the tally mark names the crate that counts the take',
  );
  assert.ok(
    seam.objectSlots.some((o) => o.id === 'sker_seam_tally_crate'),
    'the tally crate is an authored body at the seam',
  );

  // The whip: the gun the crew is worked under is a patrol beat, not a hostile spawn — a Reach
  // raider flying the watch line back toward the camp that posted it.
  const gun = activityActorSlotById('sker_seam_gun');
  assert.equal(gun.presentationRole, 'pirate', 'the seam\'s gun is a Reach raider');
  assert.equal(gun.jobKind, 'patrol', 'the watch flies the patrol kernel');

  // The held door is a wait, not a beat: the picket's chord is the slowest route in the sector.
  const picketRow = SKER_ROUTE_TOPOLOGY.find((row) => row.actorSlotId === 'sker_door_picket');
  for (const row of SKER_ROUTE_TOPOLOGY) {
    if (row === picketRow) continue;
    assert.ok(picketRow.speedWUPerS < row.speedWUPerS,
      `the vetting chord holds slower than ${row.actorSlotId}`);
  }
  assert.ok(picketRow.speedWUPerS < 4, `a held line, not a patrol: ${picketRow.speedWUPerS} WU/s`);

  // The Reach is not law: nobody here is lawful (security 0.08 — there is no law desk at the
  // Bazaar), nobody arrives shooting (the gate-camp zone owns the hostile presence), and every
  // actor flies a job kind the runtime owns.
  const kinds = SKER_ACTIVITY_POCKETS
    .flatMap((entry) => entry.actorSlots.map((slot) => slot.jobKind));
  for (const kind of kinds) {
    assert.ok(['hauler', 'miner', 'surveyor', 'patrol', 'salvor'].includes(kind), `runtime job kind: ${kind}`);
  }
  for (const slot of SKER_ACTIVITY_POCKETS.flatMap((entry) => entry.actorSlots)) {
    assert.equal(slot.passive, true, `${slot.id} arrives working, not shooting`);
    assert.equal(slot.lawful, false, `${slot.id} is not a law hull — the Reach keeps none`);
  }
  assert.ok(new Set(kinds).size >= 2, `distinct verbs across the shift: ${kinds.join(', ')}`);
});

test('seed 4242: the Bazaar\'s shift is already under way when you arrive in Sker Haven', () => {
  const skerDef = SECTORS.find((s) => s.id === SKER_ACTIVITY_SECTOR_ID);
  assert.ok(skerDef, 'Sker Haven exists');

  const systems = [spawnBudget, traffic, cargo, economy, factions, heat, encounterDirector, npcJobsRuntime];
  const sim = createSimulation({ seed: SEED, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SKER_ACTIVITY_SECTOR_ID;
  // The Bazaar stands where the anchors say it does; sector-local to global.
  for (const station of SECTOR_ANCHORS[SKER_ACTIVITY_SECTOR_ID].stations) {
    const pos = sectorLocalToGlobalForSector(station.pos, SKER_ACTIVITY_SECTOR_ID);
    sim.spawn({
      type: 'station', team: 2, pos, radius: 42, mass: 1e6,
      data: { stationId: station.id, name: station.id },
    });
  }
  const player = sim.spawn({
    type: 'ship', team: 0, pos: sectorLocalToGlobalForSector({ x: 0, z: -3200 }, SKER_ACTIVITY_SECTOR_ID),
    vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  state.player.heat = 0;
  state.onboarding = { active: false, finished: true };

  bus.emit('sector:enter', { sectorId: SKER_ACTIVITY_SECTOR_ID, sector: skerDef });
  sim.runTicks(60);

  const bySlot = new Map();
  for (const rec of state.traffic.freighters || []) {
    const entity = state.entities.get(rec.id);
    if (!entity || !entity.alive) continue;
    const slotId = (entity.data && entity.data.activityActorSlotId) || rec.activityActorSlotId;
    if (slotId) bySlot.set(slotId, { rec, entity });
  }

  for (const slotId of SKER_POCKET_ACTOR_SLOT_ORDER) {
    const found = bySlot.get(slotId);
    assert.ok(found, `authored shift body is live in Sker Haven: ${slotId}`);
    const { rec, entity } = found;
    assert.equal(rec.authoredActivityCast, true, `${slotId} is authored cast, not ambient filler`);
    assert.equal(entity.data.authoredActivityCast, true);
    assert.equal(entity.homeSectorId, SKER_ACTIVITY_SECTOR_ID, `${slotId} lives in Sker Haven`);
    assert.ok(entity.data.worldRecordId, `${slotId} carries durable identity`);
    assert.ok(entity.data.jobId, `${slotId} is flying a real job, not loitering`);
  }

  // The shift adds to the apron rather than replacing it: trafficPerMin 9 keeps an ambient
  // population, and the four authored bodies ride on top of whatever the census kept.
  const total = (state.traffic.freighters || []).length;
  assert.ok(total >= SKER_AUTHORED_ACTIVITY_CAPACITY, `shift plus the apron: ${total} bodies`);

  // Deterministic: the same seed produces the same four authored identities.
  const ids = SKER_POCKET_ACTOR_SLOT_ORDER.map((slotId) => {
    const entity = bySlot.get(slotId).entity;
    return `${slotId}#${entity.data.worldRecordId}`;
  });
  assert.equal(new Set(ids).size, 4, 'four distinct durable identities');
});

test('the marks aim where the fiction says: stash-ward, gate-ward, camp-ward', () => {
  const apron = activityPocketById('sker_bazaar_apron');
  const seam = activityPocketById('sker_press_gang_seam');
  const skerAnchors = SECTOR_ANCHORS[SKER_ACTIVITY_SECTOR_ID];
  const skerZones = SECTOR_ZONES[SKER_ACTIVITY_SECTOR_ID];

  const apronAnchor = apron.activityAnchor.localPos;       // station_sker
  const seamAnchor = seam.activityAnchor.localPos;          // zone_sker_belt center
  const stash = skerAnchors.pois.find((p) => p.id === 'poi_stash');
  const pallasGate = skerAnchors.gates.find((g) => g.to === 'sector_pallas_drift');
  const gatecamp = skerZones.find((z) => z.id === 'zone_sker_gatecamp');
  assert.ok(stash && pallasGate && gatecamp);

  const bearingFrom = (anchor, mark) => Math.atan2(mark.offset.z, mark.offset.x);
  const trueBearing = (from, to) => Math.atan2(to.z - from.z, to.x - from.x);
  const bearingDelta = (a, b) => {
    let d = Math.abs(a - b);
    if (d > Math.PI) d = 2 * Math.PI - d;
    return d;
  };

  // The fence's hold pod and the runner's far leg sit on the true bearing to the real stash —
  // the apron's goods live on the line to where they're kept.
  const pod = apron.objectSlots.find((o) => o.id === 'sker_fence_hold_pod');
  const podBearing = Math.atan2(pod.offset.z, pod.offset.x);
  const stashBearing = trueBearing(apronAnchor, stash.pos);
  assert.ok(bearingDelta(podBearing, stashBearing) < 0.05,
    `hold pod aims at the true stash bearing (${(bearingDelta(podBearing, stashBearing) * 180 / Math.PI).toFixed(2)} deg off)`);
  const runner = activityActorSlotById('sker_apron_runner');
  const holdLeg = runner.route.marks.find((m) => m.id === 'sker_runner_hold_leg');
  assert.ok(bearingDelta(bearingFrom(apronAnchor, holdLeg), stashBearing) < 0.05,
    `the fetch's far leg runs stash-ward (${(bearingDelta(bearingFrom(apronAnchor, holdLeg), stashBearing) * 180 / Math.PI).toFixed(2)} deg off)`);

  // The picket's pallas-face mark aims at the Pallas gate — the door's vetting chord covers the
  // approach inbound traffic actually crosses.
  const picket = activityActorSlotById('sker_door_picket');
  const pallasFace = picket.route.marks.find((m) => m.id === 'sker_picket_pallas_face');
  const gateBearing = trueBearing(apronAnchor, pallasGate.pos);
  assert.ok(bearingDelta(bearingFrom(apronAnchor, pallasFace), gateBearing) < 0.05,
    `pallas-face aims at the true gate bearing (${(bearingDelta(bearingFrom(apronAnchor, pallasFace), gateBearing) * 180 / Math.PI).toFixed(2)} deg off)`);

  // The seam's face and the gun's camp line both aim at the gate-camp that owns them — the crew
  // cuts under the camp's guns, and the watch's line runs back to what posted it.
  const toiler = activityActorSlotById('sker_seam_toiler');
  const gun = activityActorSlotById('sker_seam_gun');
  const campBearing = trueBearing(seamAnchor, gatecamp.center);
  const face = toiler.route.marks.find((m) => m.id === 'sker_toiler_face');
  const campLine = gun.route.marks.find((m) => m.id === 'sker_gun_camp_line');
  assert.ok(bearingDelta(bearingFrom(seamAnchor, face), campBearing) < 0.05,
    `the worked face sits under the camp's guns (${(bearingDelta(bearingFrom(seamAnchor, face), campBearing) * 180 / Math.PI).toFixed(2)} deg off)`);
  assert.ok(bearingDelta(bearingFrom(seamAnchor, campLine), campBearing) < 0.05,
    `the watch line runs back to the camp (${(bearingDelta(bearingFrom(seamAnchor, campLine), campBearing) * 180 / Math.PI).toFixed(2)} deg off)`);

  // The tally crate sits under its own mark's bearing — the toiler's tally leg physically points
  // at the crate that counts its take.
  const crate = seam.objectSlots.find((o) => o.id === 'sker_seam_tally_crate');
  const crateBearing = Math.atan2(crate.offset.z, crate.offset.x);
  const tally = toiler.route.marks.find((m) => m.id === 'sker_toiler_tally');
  assert.ok(bearingDelta(bearingFrom(seamAnchor, tally), crateBearing) < 0.05,
    `the tally mark aims at the tally crate (${(bearingDelta(bearingFrom(seamAnchor, tally), crateBearing) * 180 / Math.PI).toFixed(2)} deg off)`);

  // The two pockets are genuinely separate places: the Bazaar's apron and the seams' face are
  // far enough apart that neither route's marks could serve the other's anchor.
  const apronToSeam = Math.hypot(seamAnchor.x - apronAnchor.x, seamAnchor.z - apronAnchor.z);
  assert.ok(apronToSeam > 1000, `apron and seam are distinct places: ${apronToSeam.toFixed(0)} WU apart`);
});
