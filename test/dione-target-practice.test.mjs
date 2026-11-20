import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createDamageRouter, scalarHitToDamagePacket } from '../src/combat/damage.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import { physics } from '../src/core/physics.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { DIONE_TARGET_PRACTICE } from '../src/missions/dioneTargetPractice.js';
import { save } from '../src/save/saveSystem.js';
import { economy } from '../src/systems/economy.js';
import { missions } from '../src/systems/missions.js';
import { world } from '../src/systems/world.js';
import { commitCoursePayload, getSearchTargets } from '../src/ui/galaxyMap.js';
import { flightDestinationSurface, resolveFlightObjectiveCommand } from '../src/ui/hud.js';

const STATION = 'station_dione';
const SECTOR = 'sector_dione_lane';

function flight(systems = []) {
  const sim = createSimulation({ seed: 47, systems: [...systems, economy, missions] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  state.player.credits = 1000;
  state.player.name = 'Range Pilot';
  state.onboarding = { active: false, finished: true };
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200,
    data: { defId: 'ship_kestrel', fittings: [] } });
  state.playerId = player.id;
  const owner = sim.registry.get('missions');
  const board = () => owner.ensureBoard(STATION).slots.find(offer => offer.type === DIONE_TARGET_PRACTICE);
  const crew = () => state.entityList.filter(entity => entity.alive && entity.data?.dionePracticeMissionId);
  const flags = () => state.entityList.filter(entity => entity.alive && entity.data?.storyPropKind === 'dione_range_flag');
  const damage = createDamageRouter({ state, bus, helpers: sim.helpers, catalog: createCombatCatalog() }, { schedule() {} });
  const shot = (target) => damage({
    attackerId: player.id, targetId: target.id, packet: scalarHitToDamagePacket({ damage: 15 }),
    origin: { kind: 'weapon', weaponId: 'pulse_laser' },
  });
  const updateAt = (time) => { state.simTime = time; state.tick++; owner.update(SIM_DT, state); };
  return { sim, state, bus, player, owner, board, crew, flags, shot, updateAt };
}

function acceptAndApproach(h) {
  const row = h.board();
  assert.equal(row?.title, 'Target Practice');
  h.state.mode = 'station';
  h.bus.emit('ui:acceptMission', { missionId: row.id });
  const mission = h.state.missions.active.find(m => m.type === DIONE_TARGET_PRACTICE);
  assert.ok(mission);
  assert.equal(h.board(), undefined, 'same range offers only one live practice');
  assert.equal(h.state.nav.waypoint.label, 'Dione Range');
  assert.equal(h.crew().length, 0, 'accepting while docked does not launch the cast');
  h.state.mode = 'flight';
  Object.assign(h.player.pos, h.state.nav.waypoint.pos);
  return mission;
}

function start(h) {
  const mission = acceptAndApproach(h);
  h.sim.step(SIM_DT);
  assert.match(h.state.nav.waypoint.reason, /GREEN · 30s · 0 pts/);
  assert.equal(h.crew().length, 3);
  return mission;
}

function release(h, drone) {
  h.bus.emit('massline:throw', { payloadId: drone.id, tick: h.state.tick, cut: { accepted: true } });
}

function impact(h, a, b, override = {}) {
  h.bus.emit('physics:impact', {
    dp: 42, tick: h.state.tick, aId: a.id, aGeneration: a.occupantGeneration,
    bId: b.id, bGeneration: b.occupantGeneration, ...override,
  });
}

test('tracking the same chart range keeps the scoreboard and clears the owned marker on settlement', () => {
  const h = flight();
  try {
    const mission = start(h);
    const navigation = Object.assign(Object.create(world), { state: h.state, bus: h.bus });
    const goal = getSearchTargets(h.state, 'system', SECTOR).find(target => target.id === 'active-map-goal');
    const course = commitCoursePayload(h.state, goal);
    assert.equal(course.missionId, mission.id);
    assert.ok(navigation._onSetCourse(course).active);
    const tracker = () => flightDestinationSurface(h.state, resolveFlightObjectiveCommand(h.state)).line;
    assert.match(tracker(), /GREEN · 30s · 0 pts/);
    assert.equal(h.shot(h.crew()[0]).ok, true);
    h.updateAt(mission.params.dioneRange.greenUntil);
    assert.match(tracker(), /RED · HOLD FIRE · 6s · 1 pts/);
    h.updateAt(mission.params.dioneRange.redUntil);
    assert.equal(h.state.ui.trackedMissionId, null);
    assert.notEqual(h.state.nav.waypoint?.missionId, mission.id);
    assert.notEqual(h.state.nav.waypoint?.label, 'Dione Range');
    assert.equal(h.state.player.credits, 1280);
  } finally { h.sim.dispose(); }
});

test('a different fix cannot acquire the job, and its manual course survives settlement', () => {
  const h = flight();
  try {
    const mission = start(h);
    const navigation = Object.assign(Object.create(world), { state: h.state, bus: h.bus });
    const goal = getSearchTargets(h.state, 'system', SECTOR).find(target => target.id === 'active-map-goal');
    const course = commitCoursePayload(h.state, goal);
    const detour = { ...course, label: 'My detour', pos: { x: course.pos.x + 135, z: course.pos.z } };
    assert.ok(navigation._onSetCourse(detour).active);
    assert.equal(h.state.nav.waypoint.kind, 'local');
    assert.equal(h.state.nav.waypoint.missionId, undefined);
    const waypoint = h.state.nav.waypoint;
    assert.equal(resolveFlightObjectiveCommand(h.state).owner, 'navigation');
    assert.equal(h.shot(h.crew()[0]).ok, true);
    h.updateAt(mission.params.dioneRange.redUntil);
    assert.equal(h.state.ui.trackedMissionId, null);
    assert.equal(h.state.nav.waypoint, waypoint);
    assert.equal(h.state.player.credits, 1280);
  } finally { h.sim.dispose(); }
});

test('Dione Jobs pays a common shot and a bowled target, then keeps the Navy callsign across restore', () => {
  const h = flight([save]);
  const saves = h.sim.registry.get('save');
  const restore = () => assert.equal(saves.loadEnvelope(JSON.parse(JSON.stringify(saves.serialize('Dione practice')))), true);
  try {
    assert.ok(!h.owner.ensureBoard('station_helios').slots.find(row => row.type === DIONE_TARGET_PRACTICE));
    const mission = start(h);
    assert.equal(h.flags().length, 1);
    assert.equal(h.flags()[0].collides, false);
    assert.equal(h.flags()[0].data.rangeGreenUntil, mission.params.dioneRange.greenUntil);
    const [shot, thrower, target] = h.crew();
    assert.equal(h.shot(shot).ok, true);
    h.shot(shot);
    impact(h, thrower, target); // ambient contact before the committed throw never scores
    assert.equal(mission.params.dioneRange.score, 1);

    release(h, thrower);
    impact(h, thrower, target, { bGeneration: target.occupantGeneration + 10 });
    assert.equal(mission.params.dioneRange.score, 1);
    impact(h, thrower, target);
    impact(h, thrower, target);
    assert.equal(mission.params.dioneRange.score, 6);

    restore();
    h.updateAt(h.state.simTime + SIM_DT);
    assert.equal(h.flags().length, 1, 'restore adopts the flag without duplicating it');
    assert.equal(h.crew().length, 1, 'existing live carrier is re-adopted and scored slots do not respawn');
    const restored = h.state.missions.active.find(m => m.id === mission.id);
    assert.equal(restored.params.dioneRange.score, 6);
    h.updateAt(restored.params.dioneRange.greenUntil);
    assert.match(h.state.nav.waypoint.reason, /RED · HOLD FIRE · 6s · 6 pts/);
    h.updateAt(restored.params.dioneRange.redUntil);
    assert.equal(h.state.player.credits, 1280);
    const receipt = h.state.missions.receipts.find(row => row.missionId === mission.id);
    assert.deepEqual(receipt.dionePractice, { score: 6, shot: 1, bowled: 1, fouls: 0, callsign: 'BANKSHOT' });
    assert.equal(h.crew().length, 0);
    assert.equal(h.flags().length, 0, 'settlement removes the flag');

    restore();
    h.updateAt(h.state.simTime + 1);
    assert.equal(h.state.player.credits, 1280, 'completed save cannot pay the same round again');
    assert.equal(h.board().reward_cr, 0);
    assert.match(h.board().summary, /Range Pilot · BANKSHOT · best 6 points/);
  } finally { h.sim.dispose(); }
});

test('the Rapier owner supplies the contact that scores a released drone', async () => {
  const capturePrevious = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  const h = flight([physics]);
  try {
    h.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    const mission = acceptAndApproach(h);
    const physicsOwner = h.sim.registry.get('physics');
    assert.equal(await physicsOwner.prepareBackend(h.state), true);
    h.sim.runTicks(3);
    const [source, target] = h.crew();
    assert.ok(source && target);
    const impacts = [];
    h.bus.on('physics:impact', event => impacts.push({ ...event }));
    release(h, source);
    const dx = target.pos.x - source.pos.x;
    const dz = target.pos.z - source.pos.z;
    const scale = source.physicsBody.mass * 150 / Math.hypot(dx, dz);
    assert.equal(queuePhysicsImpulse(source, { x: dx * scale, z: dz * scale }, { tick: h.state.tick }), true);
    for (let i = 0; i < 45 && mission.objectiveProgress === 0; i++) h.sim.step(SIM_DT);
    const hit = impacts.find(event => event.backend === 'rapier-dynamic'
      && [event.aId, event.bId].includes(source.id) && [event.aId, event.bId].includes(target.id));
    assert.ok(hit, `the native solve should report the drone collision: ${JSON.stringify({
      source: { id: source.id, pos: source.pos, vel: source.vel },
      target: { id: target.id, pos: target.pos, vel: target.vel },
      hits: impacts.map(event => [event.aId, event.bId]),
    })}`);
    assert.equal(mission.params.dioneRange.score, 5);
    assert.equal(mission.params.dioneRange.bowled, 1);
  } finally {
    h.sim.dispose();
    COMBAT_FLAGS.weaponImpulseConsequences = capturePrevious;
  }
});

test('a drone released on green can still cause a foul after red', () => {
  const h = flight();
  try {
    const mission = start(h);
    const [shot, thrower, target] = h.crew();
    h.shot(shot);
    release(h, thrower);
    h.updateAt(mission.params.dioneRange.greenUntil);
    assert.ok(thrower.alive, 'red leaves a real loose drone in play');
    impact(h, thrower, target);
    impact(h, thrower, target);
    assert.equal(mission.params.dioneRange.score, 1);
    assert.equal(mission.params.dioneRange.fouls, 1);
    h.updateAt(mission.params.dioneRange.redUntil);
    assert.equal(h.state.player.credits, 1000);
    const receipt = h.state.missions.receipts.find(row => row.missionId === mission.id);
    assert.equal(receipt.reason, 'range_foul');
    assert.equal(receipt.dionePractice.callsign, null);
    assert.equal(h.crew().length, 0);
    assert.equal(h.flags().length, 0, 'a failed round removes the flag');
  } finally { h.sim.dispose(); }
});
