import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { SECTORS } from '../src/data/sectors.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { WORLD_ONE_OFFS } from '../src/data/worldOneOffs.js';
import {
  CERES_WRECK_CATHEDRAL_COURSE_POS,
  CERES_WRECK_CATHEDRAL_GLOBAL_POS,
  worldSiteManifestById,
} from '../src/data/worldSiteManifests.js';
import {
  CINDER_SLUICE_TRAFFIC_STAGING_POS,
  pointInsideCinderSluice,
} from '../src/data/environmentalMachinery.js';
import { scanner } from '../src/systems/scanner.js';
import { scanReveal, anomalyRuleLesson, reviseDiscoveryMemory } from '../src/systems/scanReveal.js';
import { towClassMassFor } from '../src/systems/shipCapabilities.js';
import { TETHYS_CUSTOMS_WEIR, pointInsideCustomsWeir } from '../src/world/customsWeir.js';
import { RECORD_KIND, stableRecordId } from '../src/world/worldRecords.js';

function boot(sectorId = 'sector_test_signals') {
  const sim = createSimulation({ seed: 4242, systems: [scanner, scanReveal] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.input.actions = state.input.actions || {};
  state.world.currentSectorId = sectorId;
  state.world.activeSector = { id: sectorId, pois: [] };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  const events = { results: [], courses: [], credits: [] };
  bus.on('signal:scanResults', (payload) => events.results.push(payload));
  bus.on('ui:setCourse', (payload) => events.courses.push(payload));
  bus.on('economy:grantCredits', (payload) => events.credits.push(payload));
  return { sim, state, bus, player, events };
}

function pulse(t) {
  t.state.input.actions.scanPulse = true;
  t.sim.runTicks(2);
}

function repulse(t, simTime) {
  t.state.simTime = simTime;
  t.sim.registry.get('scanner')._cooldownUntil = 0;
  pulse(t);
}

function latestSignals(t) {
  const batch = t.events.results.at(-1);
  return batch ? batch.signals : [];
}

function withSf(t, sf) {
  return latestSignals(t).filter((signal) => signal.discovery && signal.discovery.parts && signal.discovery.parts[sf]);
}

function part(t, sf) {
  const rows = withSf(t, sf);
  assert.equal(rows.length > 0, true, `${sf} missing from the scan the player reads`);
  return { signal: rows[0], part: rows[0].discovery.parts[sf] };
}

function stationGlobal(stationId) {
  for (const sector of SECTORS) {
    for (const station of sector.stations || []) {
      if (station.id === stationId && station.pos) {
        return sectorLocalToGlobalForSector(station.pos, sector.id);
      }
    }
  }
  return null;
}

function oneOffGlobal(id) {
  const spec = WORLD_ONE_OFFS.find((row) => row.id === id);
  const station = SECTOR_ANCHORS[spec.sectorId].stations.find((row) => row.id === spec.anchor.id);
  const local = {
    x: station.pos.x + spec.offsetLocal.x,
    z: station.pos.z + spec.offsetLocal.z,
  };
  return sectorLocalToGlobalForSector(local, spec.sectorId);
}

function derived(accel, mass = 100) {
  return { operationalMass: mass, mass, propulsion: { mainAccel: accel } };
}

function accelForTow(below) {
  let short = 0;
  let ready = null;
  for (let accel = 0; accel <= 800; accel += 5) {
    const tow = towClassMassFor(derived(accel));
    if (tow < 180) short = accel;
    if (ready == null && tow >= 180) ready = accel;
  }
  assert.equal(below ? towClassMassFor(derived(short)) < 180 : true, true);
  assert.ok(ready != null);
  return below ? short : ready;
}

function wreck(t, pos, data) {
  return t.sim.spawn({
    type: 'wreck', team: 0, pos, vel: { x: 0, z: 0 }, radius: 12, hull: 50, hullMax: 50,
    collides: true, data,
  });
}

test('a pulse at the origin does not invent discovery places', () => {
  const t = boot();
  pulse(t);
  assert.equal(latestSignals(t).some((signal) => String(signal.id).startsWith('signal:discovery:')), false);
});

test('SF-166 wreck trail orders debris to the feature and never borrows a name or a payout', () => {
  const contact = boot();
  wreck(contact, { x: 1500, z: 0 }, { trailId: 'lane', wreckClass: 'debris', scanLabel: 'NAMED LOSS SENTINEL', salvagePool: {} });
  wreck(contact, { x: 1700, z: 0 }, { trailId: 'lane', wreckClass: 'debris', salvagePool: { cmdty_ore_iron: 2 } });
  pulse(contact);
  const far = withSf(contact, 'SF-166');
  assert.ok(far.length >= 1);
  for (const signal of far) {
    const lesson = signal.discovery.parts['SF-166'];
    assert.equal(lesson.paid, 0);
    assert.equal(lesson.quality, 'contact');
    assert.equal(lesson.signatureNamed, false);
    assert.match(lesson.sentence, /Debris bearing \d+°\./);
    assert.equal(lesson.sentence.includes('Signature'), false);
    assert.equal(lesson.sentence.includes('NAMED LOSS SENTINEL'), false);
    assert.equal(lesson.sentence.includes('feature'), false);
  }
  assert.equal(contact.events.credits.length, 0);

  const identified = boot();
  wreck(identified, { x: 700, z: 0 }, { trailId: 'lane', wreckClass: 'hauler', scanLabel: 'NAMED LOSS SENTINEL', salvagePool: {} });
  const feature = wreck(identified, { x: 900, z: 0 }, { trailId: 'lane', wreckClass: 'hauler', salvagePool: { cmdty_ore_iron: 1 } });
  pulse(identified);
  const mid = withSf(identified, 'SF-166').find((signal) => signal.entityId === feature.id);
  assert.ok(mid);
  assert.equal(mid.discovery.parts['SF-166'].quality, 'identified');
  assert.match(mid.discovery.parts['SF-166'].sentence, /Signature is hauler only/);
  assert.equal(mid.discovery.parts['SF-166'].sentence.includes('NAMED LOSS SENTINEL'), false);
  assert.equal(mid.discovery.parts['SF-166'].sentence.includes('feature'), false);
  assert.equal(mid.discovery.parts['SF-166'].paid, 0);

  const deep = boot();
  const debris = wreck(deep, { x: 40, z: 0 }, { trailId: 'lane', wreckClass: 'hauler', salvagePool: {} });
  const end = wreck(deep, { x: 80, z: 0 }, { trailId: 'lane', wreckClass: 'hauler', salvagePool: { cmdty_ore_iron: 3 } });
  pulse(deep);
  const onFeature = withSf(deep, 'SF-166').find((signal) => signal.entityId === end.id);
  assert.equal(onFeature.discovery.parts['SF-166'].backward, true);
  assert.equal(onFeature.discovery.parts['SF-166'].bearingDeg, 180);
  assert.match(onFeature.discovery.parts['SF-166'].sentence, /back along the debris/);
  assert.equal(onFeature.discovery.parts['SF-166'].paid, 0);
  deep.bus.emit('signal:track', { signalId: onFeature.id });
  assert.ok(Math.hypot(deep.events.courses[0].pos.x - debris.pos.x, deep.events.courses[0].pos.z - debris.pos.z) < 2);
  assert.equal(deep.events.credits.length, 0);

  const lone = boot();
  wreck(lone, { x: 40, z: 0 }, { wreckClass: 'hauler', salvagePool: {} });
  wreck(lone, { x: 80, z: 20 }, { trailId: 'other', wreckClass: 'hauler', scanLabel: 'NAMED LOSS SENTINEL', salvagePool: {} });
  pulse(lone);
  assert.equal(withSf(lone, 'SF-166').length, 0);
});

test('SF-168 a deep survey names a real buyer and a rescan cannot refill an empty hold', () => {
  const t = boot('sector_ceres_belt');
  const hull = wreck(t, { x: 80, z: 0 }, { wreckClass: 'hauler', salvagePool: { cmdty_ore_iron: 4 } });
  pulse(t);
  const first = part(t, 'SF-168');
  const refinery = stationGlobal('station_ceres');
  assert.equal(first.part.available, true);
  assert.equal(first.part.guaranteesProfit, false);
  assert.equal(first.part.paid, 0);
  assert.equal(first.part.stationId, 'station_ceres');
  assert.match(first.part.sentence, /Iron Ore/);
  assert.match(first.part.sentence, /Ceres Refinery/);
  assert.match(first.part.sentence, /memory, not profit/);
  t.bus.emit('signal:track', { signalId: first.signal.id });
  assert.ok(Math.hypot(t.events.courses[0].pos.x - refinery.x, t.events.courses[0].pos.z - refinery.z) < 1);
  assert.equal(t.events.credits.length, 0);

  t.state.player.marketMemory = {
    station_ceres: { cmdty_ore_iron: { buy: 12, sell: 9, stock: 0, seenAt: t.state.simTime } },
  };
  repulse(t, t.state.simTime + 9);
  const empty = withSf(t, 'SF-168').find((signal) => signal.entityId === hull.id);
  assert.equal(empty.discovery.parts['SF-168'].available, false);
  assert.equal(empty.discovery.parts['SF-168'].stockGone, true);
  assert.match(empty.discovery.parts['SF-168'].sentence, /will not put stock back/);
  assert.equal(empty.discovery.trackable, false);

  t.state.player.marketMemory.station_ceres.cmdty_ore_iron = {
    buy: 12, sell: 9, stock: 6, seenAt: t.state.simTime - 1000,
  };
  repulse(t, t.state.simTime + 9);
  const stale = withSf(t, 'SF-168').find((signal) => signal.entityId === hull.id);
  assert.equal(stale.discovery.parts['SF-168'].staleQuote, true);
  assert.equal(stale.discovery.parts['SF-168'].available, true);
  assert.equal(stale.discovery.parts['SF-168'].guaranteesProfit, false);
  assert.match(stale.discovery.parts['SF-168'].sentence, /not a guarantee/);
});

test('SF-171 moving metal confirms, a still hull and rock do not, and the lane is stable', () => {
  const mover = { id: 'mover', type: 'ship', alive: true, pos: { x: 40, z: 0 }, vel: { x: 20, z: 0 } };
  const still = { id: 'player', type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const rock = { id: 'rock', type: 'asteroid', alive: true, pos: { x: 30, z: 0 }, vel: { x: 0, z: 0 } };
  const focus = { x: 80, z: 0 };
  const first = anomalyRuleLesson(still, [still, mover, rock], focus, 'anomaly');
  const second = anomalyRuleLesson(still, [still, mover, rock], focus, 'anomaly');
  assert.equal(first.control, 'moving-metal');
  assert.deepEqual(second.usefulPos, first.usefulPos);
  assert.equal(first.recoverable, true);
  assert.equal(first.lethal, false);
  assert.equal(first.paid, 0);
  assert.ok(Math.abs(first.usefulPos.x - 220) < 0.01);
  const parked = anomalyRuleLesson(still, [still, rock], focus, 'anomaly');
  assert.equal(parked.control, 'stationary-proximity');
  assert.equal(parked.recoverable, false);
  const outside = anomalyRuleLesson(
    { ...still, pos: { x: 0, z: 0 } },
    [still, { ...rock, pos: { x: 700, z: 0 } }],
    { x: 700, z: 0 },
    'anomaly',
  );
  assert.equal(outside.control, 'other-material');
  assert.match(outside.sentence, /Rock does not answer/);

  const t = boot();
  const anomaly = t.sim.spawn({
    type: 'anomaly', team: 0, pos: { x: 80, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, hull: 10, hullMax: 10, collides: true, data: {},
  });
  const ship = t.sim.spawn({
    type: 'ship', team: 2, pos: { x: 40, z: 0 }, vel: { x: 20, z: 0 },
    radius: 8, hull: 20, hullMax: 20, collides: true, data: {},
  });
  pulse(t);
  const live = withSf(t, 'SF-171').find((signal) => signal.entityId === anomaly.id);
  assert.ok(live);
  assert.equal(live.discovery.parts['SF-171'].control, 'moving-metal');
  assert.equal(live.discovery.parts['SF-171'].lethal, false);
  assert.equal(live.discovery.parts['SF-171'].paid, 0);
  assert.ok(Math.abs((live.discovery.parts['SF-171'].usefulPos.x - ship.pos.x) - 180) < 30);

  const quiet = boot();
  quiet.sim.spawn({
    type: 'anomaly', team: 0, pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, hull: 10, hullMax: 10, collides: true, data: {},
  });
  pulse(quiet);
  assert.equal(part(quiet, 'SF-171').part.control, 'stationary-proximity');

  const stone = boot();
  stone.sim.spawn({
    type: 'anomaly', team: 0, pos: { x: 700, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, hull: 10, hullMax: 10, collides: true, data: {},
  });
  stone.sim.spawn({
    type: 'asteroid', team: 0, pos: { x: 720, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, hull: 10, hullMax: 10, collides: true, data: { material: 'rock' },
  });
  pulse(stone);
  assert.equal(part(stone, 'SF-171').part.control, 'other-material');

  const bearing = boot();
  const hidden = bearing.sim.spawn({
    type: 'fx', team: 2, pos: { x: 1200, z: 0 }, radius: 10, collides: false,
    data: { poi: true, poiId: 'poi_rule', poiType: 'anomaly', hidden: true, requiresTriangulation: true },
  });
  bearing.state.world.activeSector.pois.push({
    id: hidden.id, poiId: 'poi_rule', type: 'anomaly', pos: { x: 1200, z: 0 },
    hidden: true, requiresTriangulation: true,
  });
  pulse(bearing);
  const row = latestSignals(bearing).find((signal) => signal.classification === 'ANOMALY BEARING');
  assert.ok(row);
  assert.equal(row.discovery, undefined);
});

test('SF-178 an empty berth reports delivery, a forced latch, or an unknown cause', () => {
  const present = boot();
  wreck(present, { x: 40, z: 0 }, { expectedPresence: { present: true }, salvagePool: {} });
  pulse(present);
  assert.equal(withSf(present, 'SF-178').length, 0);

  const delivered = boot('sector_ceres_belt');
  wreck(delivered, { x: 40, z: 0 }, {
    expectedPresence: { present: false, removalCause: 'delivery', deliveredTo: 'station_ceres' },
    salvagePool: {},
  });
  pulse(delivered);
  const stamp = part(delivered, 'SF-178');
  assert.equal(stamp.part.causeKnown, true);
  assert.equal(stamp.part.culprit, null);
  assert.equal(stamp.part.paid, 0);
  assert.equal(stamp.part.next, 'station_ceres');
  delivered.bus.emit('signal:track', { signalId: stamp.signal.id });
  const refinery = stationGlobal('station_ceres');
  assert.ok(Math.hypot(delivered.events.courses[0].pos.x - refinery.x, delivered.events.courses[0].pos.z - refinery.z) < 1);

  const forced = boot();
  wreck(forced, { x: 40, z: 0 }, {
    expectedPresence: { present: false, removalCause: 'theft' },
    salvagePool: {},
  });
  pulse(forced);
  const latch = part(forced, 'SF-178');
  assert.equal(latch.part.forced, true);
  assert.equal(latch.part.causeKnown, false);
  assert.equal(latch.part.culprit, null);
  assert.match(latch.part.sentence, /No culprit is named/);

  const unknown = boot();
  wreck(unknown, { x: 40, z: 0 }, { expectedPresence: { present: false }, salvagePool: {} });
  pulse(unknown);
  const gap = part(unknown, 'SF-178');
  assert.equal(gap.part.absence, true);
  assert.equal(gap.part.causeKnown, false);
  assert.equal(gap.part.culprit, null);
  assert.match(gap.part.sentence, /cause is unknown/);
});

test('SF-174 a tug hitch waits on tow class, accepts a hull already there, and does not reset a reward', () => {
  const shortAccel = accelForTow(true);
  const readyAccel = accelForTow(false);
  const short = boot();
  short.player.derived = derived(shortAccel);
  const hull = wreck(short, { x: 40, z: 0 }, { revisitNeed: { massT: 180 }, rewardMark: 1, salvagePool: {} });
  pulse(short);
  const denied = part(short, 'SF-174');
  assert.equal(denied.part.ready, false);
  assert.equal(denied.part.paid, 0);
  assert.equal(denied.part.interactionLocked, false);
  assert.equal(denied.part.rewardReset, false);
  assert.match(denied.part.sentence, /will not take/);
  assert.equal(hull.data.rewardMark, 1);

  const ready = boot();
  ready.player.derived = derived(readyAccel);
  wreck(ready, { x: 40, z: 0 }, { revisitNeed: { massT: 180 }, rewardMark: 1, salvagePool: {} });
  pulse(ready);
  const taken = part(ready, 'SF-174');
  assert.equal(taken.part.ready, true);
  assert.equal(taken.part.improvised, false);
  assert.match(taken.part.sentence, /will take the hitch/);
  assert.equal(taken.part.paid, 0);

  const improvised = boot();
  improvised.player.derived = derived(shortAccel);
  wreck(improvised, { x: 40, z: 0 }, { revisitNeed: { massT: 180 }, salvagePool: {} });
  wreck(improvised, { x: 70, z: 0 }, { salvagePool: {} });
  improvised.state.entityList.find((entity) => entity.pos && entity.pos.x === 70).mass = 200;
  pulse(improvised);
  const hitch = part(improvised, 'SF-174');
  assert.equal(hitch.part.improvised, true);
  assert.equal(hitch.part.ready, true);
  assert.match(hitch.part.sentence, /line rating is not required/);
  assert.equal(hitch.part.paid, 0);
});

test('SF-180 discovery memory keeps the last confirmed place and drops a stale service', () => {
  const book = { subjects: {} };
  reviseDiscoveryMemory(book, {
    subjectId: 'site:alpha', confirmed: true, pos: { x: 0, z: 0 },
    owner: 'yard', damage: 'intact', services: ['repair'], at: 1,
  });
  const same = reviseDiscoveryMemory(book, {
    subjectId: 'site:alpha', confirmed: true, pos: { x: 10, z: 0 },
    owner: 'yard', damage: 'intact', services: ['repair'], at: 2,
  });
  assert.equal(same.status, 'current');
  assert.equal(book.subjects['site:alpha'].history.length, 0);
  assert.equal(same.servicesGranted, true);
  const moved = reviseDiscoveryMemory(book, {
    subjectId: 'site:alpha', confirmed: true, pos: { x: 80, z: 0 },
    owner: 'other', damage: 'holed', services: ['repair'], at: 3,
  });
  assert.equal(moved.status, 'stale');
  assert.equal(moved.servicesGranted, false);
  assert.equal(moved.sameSite, true);
  assert.deepEqual(moved.navPos, { x: 80, z: 0 });
  assert.equal(book.subjects['site:alpha'].history.length, 1);
  assert.equal(book.subjects['site:alpha'].history[0].status, 'stale');
  const hint = reviseDiscoveryMemory(book, {
    subjectId: 'site:alpha', confirmed: false, pos: { x: 400, z: 0 }, owner: 'ghost', at: 4,
  });
  assert.equal(hint.status, 'unconfirmed');
  assert.equal(hint.servicesGranted, false);
  assert.deepEqual(hint.navPos, { x: 80, z: 0 });
  assert.equal(book.subjects['site:alpha'].owner, 'other');
  for (let i = 0; i < 25; i += 1) {
    reviseDiscoveryMemory(book, {
      subjectId: `cap:${i}`, confirmed: true, pos: { x: i, z: 1 }, services: [], at: 10 + i,
    });
  }
  assert.equal(Object.keys(book.subjects).length, 24);
  assert.ok(book.subjects['cap:24']);

  const t = boot();
  const hull = wreck(t, { x: 40, z: 0 }, {
    discoveryWatch: { subjectId: 'site:alpha', owner: 'yard', damage: 'intact', services: ['repair'] },
    salvagePool: {},
  });
  pulse(t);
  const seen = part(t, 'SF-180');
  assert.equal(seen.part.memoryStatus, 'current');
  assert.equal(seen.part.servicesGranted, true);
  assert.equal(seen.part.paid, 0);
  hull.pos = { x: 140, z: 0 };
  hull.data.discoveryWatch = { subjectId: 'site:alpha', owner: 'other', damage: 'holed', services: ['repair'] };
  repulse(t, t.state.simTime + 9);
  const stale = withSf(t, 'SF-180').find((signal) => signal.entityId === hull.id);
  assert.equal(stale.discovery.parts['SF-180'].memoryStatus, 'stale');
  assert.equal(stale.discovery.parts['SF-180'].servicesGranted, false);
  assert.equal(stale.discovery.parts['SF-180'].sameSite, true);
  assert.match(stale.discovery.parts['SF-180'].sentence, /old service is not offered/);
  assert.ok(Math.hypot(stale.discovery.parts['SF-180'].navPos.x - 140, stale.discovery.parts['SF-180'].navPos.z) < 2);
  const saved = t.sim.registry.get('scanner').serialize();
  const restored = boot();
  restored.sim.registry.get('scanner').deserialize(saved);
  assert.equal(restored.state.signalInvestigation.discoveryMemory.subjects['site:alpha'].owner, 'other');
  assert.equal(restored.state.signalInvestigation.discoveryMemory.subjects['site:alpha'].servicesGranted, false);
});

test('SF-169 the customs cone is the legal gate and the long lane waits outside it', () => {
  const t = boot('sector_tethys_junction');
  t.player.pos = { x: TETHYS_CUSTOMS_WEIR.origin.x, z: TETHYS_CUSTOMS_WEIR.origin.z };
  pulse(t);
  const gate = part(t, 'SF-169');
  assert.equal(gate.part.wall, false);
  assert.equal(gate.part.paid, 0);
  assert.equal(gate.part.riskyInside, true);
  assert.equal(pointInsideCustomsWeir(TETHYS_CUSTOMS_WEIR, gate.part.risky), true);
  assert.equal(gate.part.safeOutside, true);
  assert.equal(pointInsideCustomsWeir(TETHYS_CUSTOMS_WEIR, gate.part.pos), false);
  assert.equal(gate.part.lawfulOutside, true);
  assert.equal(pointInsideCustomsWeir(TETHYS_CUSTOMS_WEIR, gate.part.lawful), false);
  t.bus.emit('signal:track', { signalId: gate.signal.id });
  assert.equal(pointInsideCustomsWeir(TETHYS_CUSTOMS_WEIR, t.events.courses[0].pos), false);
});

test('SF-177 Ceres offers a busy refinery approach and a quiet cathedral approach', () => {
  const t = boot('sector_ceres_belt');
  const refinery = stationGlobal('station_ceres');
  t.player.pos = { x: refinery.x, z: refinery.z };
  pulse(t);
  const pick = part(t, 'SF-177');
  assert.equal(pick.part.serviceStationId, 'station_ceres');
  assert.equal(pick.part.busy.label, 'Refinery Pocket');
  assert.equal(pick.part.quiet.label, 'Cathedral Grave');
  assert.ok(Math.hypot(pick.part.busy.pos.x - pick.part.quiet.pos.x, pick.part.busy.pos.z - pick.part.quiet.pos.z) > 1000);
  assert.equal(pick.part.pickId, 'ceres_cathedral_grave');
  assert.equal(pick.part.paid, 0);
  t.bus.emit('signal:track', { signalId: pick.signal.id });
  assert.ok(Math.hypot(t.events.courses[0].pos.x - pick.part.quiet.pos.x, t.events.courses[0].pos.z - pick.part.quiet.pos.z) < 1);
});

test('SF-170 the dead cathedral machine keeps three clues and a bounded test', () => {
  const t = boot('sector_ceres_belt');
  t.player.pos = { ...CERES_WRECK_CATHEDRAL_GLOBAL_POS };
  pulse(t);
  const open = part(t, 'SF-170');
  assert.equal(open.part.test, 'open');
  assert.equal(open.part.cluesRemain, true);
  assert.equal(open.part.clues.length, 3);
  assert.equal(open.part.machineStatus, 'failed');
  assert.equal(open.part.restored, false);
  assert.equal(open.part.paid, 0);
  assert.deepEqual(open.part.clues.map((clue) => clue.id), [
    'marker_service_spine', 'emergency_relay_clock', 'cathedral_black_box_or_device',
  ]);

  const metal = t.sim.spawn({
    type: 'ship', team: 2, pos: { x: t.player.pos.x + 40, z: t.player.pos.z },
    vel: { x: 0, z: 0 }, radius: 8, hull: 20, hullMax: 20, collides: true, data: {},
  });
  repulse(t, t.state.simTime + 9);
  const answered = part(t, 'SF-170');
  assert.equal(answered.part.test, 'answers');
  assert.equal(answered.part.cluesRemain, true);
  assert.equal(answered.part.machineStatus, 'failed');

  metal.pos = { x: t.player.pos.x + 5000, z: t.player.pos.z };
  t.sim.spawn({
    type: 'asteroid', team: 0, pos: { x: t.player.pos.x + 30, z: t.player.pos.z },
    vel: { x: 0, z: 0 }, radius: 8, hull: 20, hullMax: 20, collides: true, data: { material: 'rock' },
  });
  repulse(t, t.state.simTime + 9);
  const refused = part(t, 'SF-170');
  assert.equal(refused.part.test, 'no-answer');
  assert.equal(refused.part.clues.length, 3);
  assert.equal(refused.part.restored, false);
  assert.match(refused.part.sentence, /machine stays failed/);
});

test('SF-172 the strut shrine is a quiet pass with no contract and no payout', () => {
  const t = boot('sector_ceres_belt');
  const shrine = oneOffGlobal('oneoff_strut_shrine');
  t.player.pos = { x: shrine.x, z: shrine.z };
  pulse(t);
  const pass = part(t, 'SF-172');
  assert.equal(pass.part.trackable, false);
  assert.equal(pass.part.mission, null);
  assert.equal(pass.part.paid, 0);
  assert.equal(pass.signal.trackable, false);
  assert.match(pass.part.sentence, /Not a contract/);
  t.bus.emit('signal:track', { signalId: pass.signal.id });
  assert.equal(t.events.courses.length, 0);
  assert.equal(t.events.credits.length, 0);
});

test('SF-173 a moved yard tug stays one body and pays nothing', () => {
  const rest = oneOffGlobal('oneoff_abandoned_tug');
  const t = boot('sector_ceres_belt');
  const pos = { x: rest.x + 200, z: rest.z };
  t.player.pos = { ...pos };
  const tug = wreck(t, pos, { oneOffId: 'oneoff_abandoned_tug', salvagePool: {} });
  pulse(t);
  const moved = withSf(t, 'SF-173').find((signal) => signal.entityId === tug.id);
  assert.ok(moved);
  assert.equal(moved.discovery.parts['SF-173'].moved, true);
  assert.equal(moved.discovery.parts['SF-173'].liveCount, 1);
  assert.equal(moved.discovery.parts['SF-173'].paid, 0);
  assert.equal(moved.discovery.parts['SF-173'].inventedSecond, false);
  assert.match(moved.discovery.parts['SF-173'].sentence, /Nothing is paid/);
  assert.match(moved.discovery.parts['SF-173'].sentence, /No second tug/);
  assert.equal(t.events.credits.length, 0);

  tug.pos = { x: rest.x + 280, z: rest.z };
  t.player.pos = { x: tug.pos.x, z: tug.pos.z };
  repulse(t, t.state.simTime + 9);
  const again = withSf(t, 'SF-173').find((signal) => signal.entityId === tug.id);
  assert.equal(again.discovery.parts['SF-173'].liveCount, 1);
  assert.equal(again.discovery.parts['SF-173'].memoryStatus, 'stale');
  assert.ok(Math.hypot(again.discovery.parts['SF-173'].navPos.x - tug.pos.x, again.discovery.parts['SF-173'].navPos.z - tug.pos.z) < 2);

  const recordId = stableRecordId(t.state.meta.seed, 'sector_ceres_belt', RECORD_KIND.WRECK, 'worldOneOff:oneoff_abandoned_tug');
  const recorded = { x: rest.x + 200, z: rest.z };
  tug.alive = false;
  tug.pos = { x: rest.x + 20000, z: rest.z };
  t.state.world.records = { byId: { [recordId]: { pos: recorded } } };
  t.player.pos = { ...recorded };
  repulse(t, t.state.simTime + 9);
  const kept = part(t, 'SF-173');
  assert.equal(kept.part.liveCount, 0);
  assert.equal(kept.part.paid, 0);
  assert.equal(kept.part.inventedSecond, false);
  assert.equal(kept.part.recordId, recordId);
  assert.ok(Math.hypot(kept.part.navPos.x - recorded.x, kept.part.navPos.z - recorded.z) < 2);
  assert.equal(t.state.entityList.filter((entity) => entity.data && entity.data.oneOffId === 'oneoff_abandoned_tug' && entity.alive !== false).length, 0);
});

test('SF-175 a worker points at the berth, and the berth remains after the worker is gone', () => {
  const t = boot('sector_ceres_belt');
  const dest = { x: 200, z: 40 };
  const hauler = t.sim.spawn({
    type: 'ship', team: 2, pos: { x: 30, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 40, hullMax: 40, collides: true,
    data: { trafficRole: 'hauler', destPos: dest, cargo: { secret: 9 } },
  });
  pulse(t);
  const followed = withSf(t, 'SF-175').find((signal) => signal.entityId === hauler.id);
  assert.ok(followed);
  assert.equal(followed.discovery.parts['SF-175'].cargoGrant, null);
  assert.equal(followed.discovery.parts['SF-175'].waiting, false);
  assert.equal(followed.discovery.parts['SF-175'].paid, 0);
  assert.match(followed.discovery.parts['SF-175'].sentence, /berth remains/);
  assert.match(followed.discovery.parts['SF-175'].sentence, /cargo is not yours/);
  assert.equal(followed.discovery.parts['SF-175'].sentence.includes('secret'), false);
  t.bus.emit('signal:track', { signalId: followed.id });
  assert.ok(Math.hypot(t.events.courses[0].pos.x - dest.x, t.events.courses[0].pos.z - dest.z) < 1);

  hauler.alive = false;
  hauler.pos = { x: 50000, z: 0 };
  t.player.pos = { ...dest };
  repulse(t, t.state.simTime + 9);
  const left = part(t, 'SF-175');
  assert.equal(left.part.fallback, true);
  assert.equal(left.part.cargoGrant, null);
  assert.match(left.part.sentence, /berth remains/);

  const interrupted = boot('sector_ceres_belt');
  interrupted.sim.spawn({
    type: 'ship', team: 2, pos: { x: 30, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 40, hullMax: 40, collides: true,
    data: { trafficRole: 'hauler', destPos: { x: 180, z: 0 }, jobInterrupted: true },
  });
  pulse(interrupted);
  const stopped = part(interrupted, 'SF-175');
  assert.equal(stopped.part.interrupted, true);
  assert.equal(stopped.part.waiting, false);
  assert.match(stopped.part.sentence, /berth remains/);
});

test('SF-176 the sluice staging edge stays outside the cone in surge and calm', () => {
  const t = boot('sector_ceres_belt');
  t.player.pos = { x: CINDER_SLUICE_TRAFFIC_STAGING_POS.x, z: CINDER_SLUICE_TRAFFIC_STAGING_POS.z };
  pulse(t);
  const warning = part(t, 'SF-176');
  assert.equal(warning.part.phase, 'warning');
  assert.equal(warning.part.safeAtSafePos, true);
  assert.equal(warning.part.scanRequired, false);
  assert.equal(warning.part.paid, 0);
  assert.equal(pointInsideCinderSluice(warning.part.pos), false);
  assert.equal(warning.part.interiorInsideCone, true);
  assert.equal(warning.part.interiorExposed, true);

  repulse(t, 4);
  const surge = part(t, 'SF-176');
  assert.equal(surge.part.phase, 'surge');
  assert.equal(surge.part.fieldActive, true);
  assert.equal(surge.part.safeAtSafePos, true);
  assert.equal(surge.part.interiorExposed, true);
  assert.equal(pointInsideCinderSluice(surge.part.pos), false);

  repulse(t, 9);
  const calm = part(t, 'SF-176');
  assert.equal(calm.part.phase, 'calm');
  assert.equal(calm.part.fieldActive, false);
  assert.equal(calm.part.safeAtSafePos, true);
  assert.equal(calm.part.interiorExposed, false);
  assert.equal(calm.part.scanRequired, false);
  t.bus.emit('signal:track', { signalId: calm.signal.id });
  assert.equal(pointInsideCinderSluice(t.events.courses.at(-1).pos), false);
});

test('SF-179 the cathedral approach is already readable at scale 1', () => {
  const before = worldSiteManifestById('world_site_wreck_cathedral').visualRoot.initialScale;
  const t = boot('sector_ceres_belt');
  t.player.pos = { ...CERES_WRECK_CATHEDRAL_GLOBAL_POS };
  pulse(t);
  const scale = part(t, 'SF-179');
  assert.equal(before, 1);
  assert.equal(worldSiteManifestById('world_site_wreck_cathedral').visualRoot.initialScale, 1);
  assert.equal(scale.part.initialScale, 1);
  assert.equal(scale.part.scaleMultiplier, 1);
  assert.equal(scale.part.scaleChanged, false);
  assert.equal(scale.part.courseOutsideHull, true);
  assert.ok(scale.part.clearanceWu > 0);
  assert.ok(scale.part.approachWu > 400 && scale.part.approachWu < 480);
  assert.equal(scale.part.paid, 0);
  t.bus.emit('signal:track', { signalId: scale.signal.id });
  assert.ok(Math.hypot(
    t.events.courses[0].pos.x - CERES_WRECK_CATHEDRAL_COURSE_POS.x,
    t.events.courses[0].pos.z - CERES_WRECK_CATHEDRAL_COURSE_POS.z,
  ) < 1);
  assert.ok(Math.hypot(
    t.events.courses[0].pos.x - CERES_WRECK_CATHEDRAL_GLOBAL_POS.x,
    t.events.courses[0].pos.z - CERES_WRECK_CATHEDRAL_GLOBAL_POS.z,
  ) > scale.part.clearanceWu);
});
