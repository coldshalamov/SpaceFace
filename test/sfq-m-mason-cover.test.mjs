// SFQ-M M31 The Mason moves the cover: a raider fight inside a Mason's yard while a heavy rib
// section crosses the firing lanes on a schedule that will not pause. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector, planEncountersDay } from '../src/systems/encounterDirector.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';
import { physics } from '../src/core/physics.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';

const SEED = 4242;
const SECTOR = 'sector_pallas_drift';
const ANCHOR = Object.freeze({ x: 2000, z: 2000 });
const SHAPE = 'mason_cover';

function makeHarness(extra = {}) {
  const sim = createSimulation({ seed: SEED, systems: [spawnBudget, encounterDirector], ...extra });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: ANCHOR.x - 700, z: ANCHOR.z - 700 }, vel: { x: 0, z: 0 },
    hull: 400, hullMax: 400, radius: 6, mass: 35,
  });
  state.playerId = player.id;
  const events = [];
  bus.on('encounter:resolved', (p) => events.push({ name: 'resolved', payload: p }));
  bus.on('economy:grantCredits', (p) => events.push({ name: 'grant', payload: p }));
  bus.on('faction:repDelta', (p) => events.push({ name: 'rep', payload: p }));
  bus.on('encounter:voice', (p) => events.push({ name: 'voice', payload: p }));
  return { sim, state, bus, player, events };
}

function fire(h) {
  const res = h.sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'test_m31', sectorId: SECTOR, anchor: { ...ANCHOR },
    zoneType: 'ambush_lane', zoneRadius: 600, force: true,
  });
  assert.equal(res.ok, true, `fire must succeed: ${JSON.stringify(res)}`);
  return Object.values(h.state.encounterDirector.live).find((l) => l.shapeId === SHAPE);
}

const yOf = (live) => live.data.yard;
const ent = (h, id) => h.state.entities.get(id);
const grants = (h) => h.events.filter((e) => e.name === 'grant').map((e) => e.payload.amount);
const reps = (h) => h.events.filter((e) => e.name === 'rep').map((e) => e.payload.delta);
const resolved = (h) => h.events.filter((e) => e.name === 'resolved').map((e) => e.payload.outcome);
const said = (h) => h.events.filter((e) => e.name === 'voice').map((e) => e.payload.text);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const seconds = (h, s) => h.sim.runTicks(Math.round(s / SIM_DT));
const raiders = (h, live) => live.ids.filter((id) => live.roles[id] === 'raider').map((id) => ent(h, id));
const killRaiders = (h, live) => { for (const r of raiders(h, live)) r.alive = false; };
const latch = (h, id) => h.bus.emit('tether:attached', { targetId: id, ownerId: h.player.id, sourceId: h.player.id });
const restAt = (h, id, pos) => { const e = ent(h, id); e.pos.x = pos.x; e.pos.z = pos.z; e.vel = { x: 0, z: 0 }; };

test('mason_cover is a registered ambush-lane combat minor in the Pallas yards and beyond, never Helios', () => {
  const enc = ENCOUNTERS[SHAPE];
  assert.ok(enc);
  assert.deepEqual({ zones: [...enc.zoneTypes], deck: enc.deck, script: enc.script, verbs: [...enc.verbs] },
    { zones: ['ambush_lane'], deck: 'combat', script: 'selfRegistered', verbs: ['fight', 'latch', 'throw', 'isolate'] });
  assert.ok(!enc.gates.sectorIds.includes('sector_helios_prime'));
});

test('fire stages the fight in the yard: hostile raiders, a latchable rib section on a path across the lane, a drive cell, fixed cover', () => {
  const h = makeHarness();
  const live = fire(h);
  const y = yOf(live);
  const rs = raiders(h, live);
  assert.equal(rs.length, 2);
  assert.ok(rs.every((r) => r.type === 'ship' && r.team !== 0), 'real hostile hulls');
  const section = ent(h, y.sectionId), cell = ent(h, y.cellId), mason = ent(h, y.masonId), cover = ent(h, y.coverId);
  assert.equal(section.type, 'payload');
  assert.equal(section.physicsBody.dynamic, true);
  assert.ok(section.mass >= 500, 'a heavy workpiece, worth hiding behind or throwing');
  assert.equal(isAttachable(section, h.state.playerId, h.state), true);
  assert.equal(isAttachable(cell, h.state.playerId, h.state), true);
  assert.equal(mason.type, 'machine');
  assert.equal(mason.data.machine.kind, 'mason');
  assert.equal(isAttachable(mason, h.state.playerId, h.state), false);
  assert.equal(cover.type, 'wreck', 'the safe alternate cover is fixed');
  // The schedule crosses the lane: the path runs perpendicular to the raider→pilot axis,
  // sweeping from one flank to the other between the raiders and the pilot's side.
  const [a, , c] = y.waypoints;
  const sweep = { x: c.x - a.x, z: c.z - a.z };
  assert.ok(Math.abs(sweep.x * y.fwd.x + sweep.z * y.fwd.z) < 1, 'the path crosses the firing axis');
  assert.ok(Math.hypot(sweep.x, sweep.z) >= 350, 'it sweeps far enough to change lanes');
  const raiderMid = { x: (rs[0].pos.x + rs[1].pos.x) / 2, z: (rs[0].pos.z + rs[1].pos.z) / 2 };
  assert.ok(dist(raiderMid, y.waypoints[1]) > 250, 'the raiders stand off across the lane');
  assert.ok(said(h)[0].startsWith('SCAN: Raiders in a Mason'));
});

test('fight around the schedule: the Mason advances leg by leg, the relocation completes, the clear lane pays clean', () => {
  const h = makeHarness();
  const live = fire(h);
  const y = yOf(live);
  restAt(h, y.sectionId, y.waypoints[1]);
  seconds(h, 9.5);
  assert.equal(y.leg, 2, 'the Mason holds each waypoint, then sends the section on');
  killRaiders(h, live);
  seconds(h, 1.2);
  assert.equal(y.raidersCleared, true);
  assert.ok(said(h).includes('The lane is yours. The Mason is still setting its rib section.'));
  assert.deepEqual(resolved(h), [], 'the scene waits to witness the relocation');
  restAt(h, y.sectionId, y.waypoints[2]);
  seconds(h, 1.2);
  assert.deepEqual(resolved(h), ['witnessed']);
  assert.deepEqual(grants(h), [380]);
  assert.deepEqual(reps(h), [2]);
  assert.equal(ent(h, y.masonId).data.scanLabel, 'MASON — RELOCATION COMPLETE');
  assert.equal(ent(h, y.sectionId).data.scanLabel, 'RIB SECTION — SET IN PLACE BY THE MASON');
});

test('use the moving mass: latching the section works, and the Mason records a diverted-workpiece obligation', () => {
  const h = makeHarness();
  const live = fire(h);
  const y = yOf(live);
  latch(h, y.sectionId);
  assert.equal(y.diverted, true);
  assert.equal(y.obligation, 'workpiece_diverted');
  assert.ok(said(h).includes('MASON: WORKPIECE OFF SCHEDULE. OBLIGATION RECORDED.'));
  killRaiders(h, live);
  seconds(h, 1.2);
  assert.deepEqual(resolved(h), ['exploited']);
  assert.deepEqual(grants(h), [300], 'the fight still pays');
  assert.deepEqual(reps(h), [-1], 'a recorded obligation, not a revoked standing');
  assert.equal(ent(h, y.masonId).data.scanLabel, 'MASON — WORKPIECE DIVERTED; OBLIGATION UNRESOLVED');
  assert.equal(ent(h, y.sectionId).alive, true, 'the section stays in the world where it was left');
});

test('isolate the drive: a drive cell pulled from its cradle stops the schedule and records a different obligation', () => {
  const h = makeHarness();
  const live = fire(h);
  const y = yOf(live);
  const cell = ent(h, y.cellId);
  cell.pos.x = y.cradlePos.x + 60; cell.pos.z = y.cradlePos.z;
  seconds(h, 1.2);
  assert.equal(y.driveIsolated, false, 'a nudge inside the cradle reach keeps it fed');
  cell.pos.x = y.cradlePos.x + 120;
  seconds(h, 1.2);
  assert.equal(y.driveIsolated, true);
  assert.equal(y.obligation, 'drive_isolated');
  assert.ok(said(h).includes('MASON: LIFT UNPOWERED. SCHEDULE HELD. OBLIGATION RECORDED.'));
  const legBefore = y.leg;
  restAt(h, y.sectionId, y.waypoints[1]);
  seconds(h, 12);
  assert.equal(y.leg, legBefore, 'an unpowered lift does not advance the schedule');
  killRaiders(h, live);
  seconds(h, 1.2);
  assert.deepEqual(resolved(h), ['isolated']);
  assert.deepEqual(grants(h), [300]);
  assert.equal(ent(h, y.sectionId).data.scanLabel, 'RIB SECTION — STRANDED WHEN THE LIFT LOST POWER');
});

test('the deadline leaves the raiders holding the yard and the Mason working', () => {
  const h = makeHarness();
  const live = fire(h);
  h.state.simTime = live.deadlineAt + 1;
  h.sim.runTicks(60);
  assert.deepEqual(resolved(h), ['lapsed']);
  assert.deepEqual(grants(h), []);
  assert.ok(raiders(h, live).some((r) => r.alive !== false));
});

test('on the real Rapier path the Mason drives the section along its schedule, and a dead lift leaves it coasting', async () => {
  const h = makeHarness({
    systems: [spawnBudget, encounterDirector, physics], updateOrder: [spawnBudget, encounterDirector, physics],
    runtimeConfig: { profileId: 'production', features: PRODUCTION_FEATURES },
  });
  h.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const physicsSystem = h.sim.registry.get('physics');
  try {
    assert.equal(await physicsSystem.prepareBackend(h.state), true);
    const live = fire(h);
    const y = yOf(live);
    const section = ent(h, y.sectionId);
    const start = { ...section.pos };
    let maxStep = 0;
    let maxSpeed = 0;
    let prev = { ...section.pos };
    for (let i = 0; i < 60 * 150 && y.leg < 2; i++) {
      h.sim.step(SIM_DT);
      maxStep = Math.max(maxStep, dist(prev, section.pos)); prev = { ...section.pos };
      maxSpeed = Math.max(maxSpeed, Math.hypot(section.vel.x, section.vel.z));
    }
    assert.equal(y.leg, 2, 'the section reached and held the middle waypoint');
    assert.ok(dist(section.pos, y.waypoints[1]) < 30);
    assert.ok(dist(section.pos, start) > 150, 'it physically crossed the lane');
    assert.ok(maxSpeed <= 6.5, `slow enough to read (max ${maxSpeed.toFixed(2)} WU/s)`);
    assert.ok(maxStep < 6.5 * SIM_DT * 2, `no teleport (max step ${maxStep.toFixed(3)} WU)`);
    // Let it get moving on the last leg, then pull the drive cell.
    for (let i = 0; i < 60 * 20; i++) h.sim.step(SIM_DT);
    const moving = Math.hypot(section.vel.x, section.vel.z);
    assert.ok(moving > 1, `it is under way on the last leg (${moving.toFixed(2)} WU/s)`);
    const cell = ent(h, y.cellId);
    cell.pos.x = y.cradlePos.x + 200; cell.pos.z = y.cradlePos.z; cell.vel = { x: 0, z: 0 };
    for (let i = 0; i < 90; i++) h.sim.step(SIM_DT);
    assert.equal(y.driveIsolated, true);
    const v0 = Math.hypot(section.vel.x, section.vel.z);
    for (let i = 0; i < 60 * 10; i++) h.sim.step(SIM_DT);
    const v1 = Math.hypot(section.vel.x, section.vel.z);
    assert.ok(Math.abs(v1 - v0) < 0.3, `unpowered, it coasts — no drag, no brake (${v0.toFixed(2)} → ${v1.toFixed(2)})`);
    assert.equal(y.relocated, false);
  } finally {
    if (typeof physicsSystem._disableSg02DynamicAuthority === 'function') physicsSystem._disableSg02DynamicAuthority();
    h.sim.dispose();
  }
});

test('same seed, same yard', () => {
  const a = yOf(fire(makeHarness()));
  const b = yOf(fire(makeHarness()));
  assert.deepEqual([a.waypoints, a.cradlePos, a.fwd], [b.waypoints, b.cradlePos, b.fwd]);
});

test('the ordinary sector-day roll (seed 4242) draws it off the starter corridor and it fires there without force', () => {
  const zones = zonesForSector(SECTOR);
  let planned = null;
  for (let day = 0; day < 365 && !planned; day++) {
    planned = planEncountersDay(SEED, SECTOR, day, zones).find((item) => item.shapeId === SHAPE) || null;
  }
  assert.ok(planned, `${SHAPE} is drawn by the ordinary roll in ${SECTOR}`);
  assert.ok(ENCOUNTERS[SHAPE].zoneTypes.includes(planned.zoneType), 'it lands on one of its authored zone types');
  const helios = zonesForSector('sector_helios_prime');
  for (let day = 0; day < 60; day++) {
    assert.equal(planEncountersDay(SEED, 'sector_helios_prime', day, helios).some((item) => item.shapeId === SHAPE), false,
      'the starter corridor never draws it');
  }
  const h = makeHarness();
  const director = h.sim.registry.get('encounterDirector');
  const request = () => director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: planned.encounterId, sectorId: SECTOR, anchor: { ...planned.zoneCenter },
    zoneType: planned.zoneType, zoneRadius: planned.zoneRadius, respectPacing: true,
  });
  let res = request();
  for (let s = 0; s < 900 && !res.ok; s++) {
    assert.equal(res.reason, 'pressure', `only the pressure budget may hold it back: ${JSON.stringify(res)}`);
    h.sim.runTicks(60);
    res = request();
  }
  assert.equal(res.ok, true, `the planned item passes the fire-time gates and pacing: ${JSON.stringify(res)}`);
  assert.ok(Object.values(h.state.encounterDirector.live).some((l) => l.shapeId === SHAPE));
});
