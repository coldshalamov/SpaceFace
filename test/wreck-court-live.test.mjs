import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { buildEntitySpawnSpec } from '../src/testing/lab/entityProfiles.js';
import { actions } from '../src/systems/actions.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { createWreckCourtSystem, act, buildAdventureOffer } from '../src/systems/wreckCourt.js';
import { missions } from '../src/systems/missions.js';

async function boot({ pos = { x: -100, z: -100 }, missionOwner = false } = {}) {
  const rt = createAuthoritativeRuntime({ profileId: 'production', seed: 41002,
    systems: [actions, flightV3, physics, combat, tetherGameplay, createWreckCourtSystem(), ...(missionOwner ? [missions] : [])] });
  rt.state.mode = 'flight'; rt.state.world.currentSectorId = 'sector_ceres_belt';
  const { spec } = buildEntitySpawnSpec({ alias: 'player', profile: 'ship.starter', isPlayer: true, role: 'player',
    team: 0, pos, vel: { x: 0, z: 0 }, heading: 0 }, rt.state);
  rt.state.playerId = rt.spawn(spec).id;
  assert.equal(await rt.getSystem('physics').prepareBackend(rt.state, {}), true);
  return rt;
}

test('accepted Court missions create native authored bodies without a private movement path', async () => {
  const rt = await boot();
  try {
    const host = rt.getSystem('wreckCourt');
    rt.state.missions = { active: [{ id: 'court-live', source: 'wreckCourt', params: { wreckCourtCaseId: 'wc_faked_collision', seed: 7, wreckCourtOrigin: { x: 0, z: 0 } } }] };
    rt.bus.emit('mission:accepted', { missionId: 'court-live' });
    assert.equal(host.session?.missionId, 'court-live');
    const b = host.session.bodies.find((b) => b.id === 'hull_a'), entity = rt.state.entities.get(b.entityId);
    assert.equal(entity.data.placeId, 'place_aftermath_wreck_ore_freighter_bow');
    const pose = { ...entity.pos }, player = { ...rt.state.entities.get(rt.state.playerId).pos };
    for (const verb of ['position', 'tow', 'moveObstruction', 'grapple']) assert.equal(act(host.session, { verb, targetId: b.id, x: 900, z: 900 }).error, 'use_flight_controls');
    host.update(1 / 60, rt.state);
    assert.deepEqual({ ...entity.pos }, pose);
    assert.deepEqual({ ...rt.state.entities.get(rt.state.playerId).pos }, player);
    for (let i = 0; i < 30; i++) rt.step(1 / 60);
    assert.notEqual(entity.pos.x, pose.x);
    assert.equal(host.session.bodies.find((b) => b.id === 'hull_a').x, entity.pos.x);
    assert.equal(host.verifyMissionProof({ missionId: 'court-live', source: 'wreckCourt', receiptId: 'fabricated', kind: 'court-ruled' }).ok, false);
  } finally { rt.dispose(); }
});

test('a supported physical filing completes the normal mission and binds world-law receipts', async () => {
  const rt = await boot({ pos: { x: 400, z: 200 }, missionOwner: true });
  try {
    const host = rt.getSystem('wreckCourt'), owner = rt.getSystem('missions');
    const offer = { ...buildAdventureOffer(7, { caseId: 'wc_faked_collision' }), stationId: 'station_beltout', destStationId: 'station_beltout',
      destSectorId: 'sector_ceres_belt', minRep: -1000, params: { ...buildAdventureOffer(7, { caseId: 'wc_faked_collision' }).params, wreckCourtOrigin: { x: 0, z: 0 } } };
    rt.bus.emit('mission:offered', offer);
    assert.equal(owner.acceptMission(offer.id), true);
    const mission = rt.state.missions.active.find((m) => m.params?.wreckCourtCaseId);
    assert.ok(mission); assert.equal(host.session.missionId, mission.id);
    rt.bus.emit('scan:completed', { targetId: null });
    assert.equal(mission.status, 'active');
    for (const b of host.session.bodies) assert.equal(host.action({ verb: 'scan', targetId: b.id, mode: 'visual' }).ok, true);
    assert.equal(host.action({ verb: 'file', hypothesisId: 'mutual_impact' }).ruling.status, 'accepted');
    assert.equal(rt.state.missions.active.some((m) => m.id === mission.id), false);
    const s = host.session, fact = s.ruling.intents.worldFacts[0];
    assert.equal(host.verifyRulingFact({ ...fact, source: 'wreckCourt', caseId: s.caseId, receiptId: s.receipt }).ok, true);
    assert.equal(host.verifyRulingFact({ ...fact, value: 'fabricated', source: 'wreckCourt', caseId: s.caseId, receiptId: s.receipt }).ok, false);
    const leaving = s.bodies.find((b) => b.departure), entity = rt.state.entities.get(leaving.entityId), vx = entity.vel.x;
    for (let i = 0; i < 60; i++) rt.step(1 / 60);
    assert.ok(entity.vel.x > vx, 'a departure ruling must become a real propulsion force');
  } finally { rt.dispose(); }
});

test('trajectory samples taken on different native ticks compare at the same scene epoch', async () => {
  const rt = await boot({ pos: { x: 400, z: 200 } });
  try {
    const host = rt.getSystem('wreckCourt'); host.open({ caseId: 'wc_faked_collision', seed: 7, origin: { x: 0, z: 0 } });
    const [a, b] = host.session.bodies;
    const expectedMiss = Math.hypot(a.x - b.x, a.z - b.z);
    assert.equal(host.action({ verb: 'scan', targetId: a.id, mode: 'trajectory' }).ok, true);
    for (let i = 0; i < 360; i++) rt.step(1 / 60);
    assert.equal(host.action({ verb: 'scan', targetId: b.id, mode: 'trajectory' }).ok, true);
    const result = host.action({ verb: 'compare', targetA: a.id, targetB: b.id });
    assert.equal(result.ok, true);
    assert.ok(Math.abs(result.measurement.data.miss - expectedMiss) < 0.1,
      `motion between readings must not forge a different miss distance: ${result.measurement.data.miss} vs ${expectedMiss}`);
  } finally { rt.dispose(); }
});

test('live snapshots preserve notebook and bindings without replaying intervention actions', async () => {
  const rt = await boot();
  try {
    const host = rt.getSystem('wreckCourt'); host.open({ caseId: 'wc_faked_collision', seed: 5 });
    rt.step(1 / 60);
    host.session.notebook.measurements.sample = { id: 'sample', kind: 'scan', targetId: 'hull_a', data: { x: 1, z: 2 } };
    const ids = host.session.bodies.map((b) => b.entityId), poses = ids.map((id) => ({ ...rt.state.entities.get(id).pos }));
    const save = JSON.parse(JSON.stringify(host.serialize()));
    assert.equal(host.deserialize(save), true);
    assert.deepEqual(host.session.bodies.map((b) => b.entityId), ids);
    assert.deepEqual(ids.map((id) => ({ ...rt.state.entities.get(id).pos })), poses);
    assert.ok(host.session.notebook.measurements.sample);
    save.court.session.bodies[0].x = 'bad';
    assert.equal(host.deserialize(save), false);
    const foreign = rt.spawn({ type: 'payload', pos: { x: 500, z: 500 }, radius: 2, mass: 4 });
    rt.bus.emit('sector:exit', {});
    assert.equal(host.session, null); assert.equal(rt.state.entities.get(foreign.id), foreign);
    for (const id of ids) assert.equal(rt.state.entities.has(id), false);
  } finally { rt.dispose(); }
});

test('assay requests cannot auto-pilot a real pod and scans respect actual range', async () => {
  const rt = await boot();
  try {
    const host = rt.getSystem('wreckCourt'); host.open({ caseId: 'wc_desperate_rescue', seed: 8 });
    const distant = host.session.bodies.find((b) => Math.hypot(b.x - host.session.player.x, b.z - host.session.player.z) > 600);
    assert.equal(host.action({ verb: 'scan', targetId: distant.id, mode: 'trajectory' }).error, 'out_of_scanner_range');
    const poses = host.session.bodies.map((b) => ({ x: b.x, z: b.z }));
    assert.equal(host.action({ verb: 'bringPod', targetId: 'pod', assayId: 'fake' }).ok, false);
    assert.deepEqual(host.session.bodies.map((b) => ({ x: b.x, z: b.z })), poses);
  } finally { rt.dispose(); }
});
