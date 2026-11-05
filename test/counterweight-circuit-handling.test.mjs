import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTERWEIGHT_EVENT_BY_ID as EVENTS, VENUE_SECTOR_ID } from '../src/features/counterweightCircuit/definition.js';
import { projectCounterweightHandling, copyCounterweightHandling } from '../src/features/counterweightCircuit/handlingReadout.js';
import { projectCounterweightCircuitView } from '../src/features/counterweightCircuit/readModel.js';
import { createAttemptState, advanceAttempt } from '../src/features/counterweightCircuit/attempt.js';
import { createCounterweightCircuitSystem } from '../src/features/counterweightCircuit/runtime.js';
import { venueAnchorGlobal } from '../src/features/counterweightCircuit/physical.js';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { combat } from '../src/systems/combat.js';
import { economy } from '../src/systems/economy.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { queuePhysicsImpulse, queuePhysicsTorqueImpulse } from '../src/core/physicsAuthority.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';

const DT = 1 / 60;
const RECEIVER_FIELDS = ['relativeVelocity', 'relativeSpin', 'speedLimit', 'spinLimit', 'firstUnmet', 'handlingSupported'];
let flags;
test.before(() => { flags = snapshotFeatureMaps(); applyFeatureConfigToMaps(PRODUCTION_FEATURES); });
test.after(() => restoreFeatureMaps(flags));

function pureFixture(eventId = 'soft_berth', legIndex = 1) {
  const def = EVENTS[eventId], fsm = createAttemptState(def, { attemptId: 1 });
  fsm.phase = 'running'; fsm.armedAt = 0; fsm.legIndex = legIndex;
  const observation = { simTime: 2, dt: DT, mode: 'flight', committed: true,
    playerId: 99, playerAlive: true, playerPos: { x: 0, z: 0 },
    bodies: {}, receivers: {}, lines: [], releases: [], impacts: [], gates: {} };
  const currentLives = {};
  def.bodies.forEach((body, index) => {
    const id = index + 1;
    observation.bodies[body.role] = { id, occupantGeneration: 10 + id, alive: true,
      pos: { ...body.local }, prevPos: { ...body.local }, vel: { x: 0, z: 0 }, rot: body.rot ?? 0,
      radius: body.radius, hull: 80, hullMax: 80 };
    currentLives[body.role] = { id, generation: 10 + id };
  });
  for (const leg of def.legs) for (const [role, receiverRole] of leg.pairs || (leg.zone ? [[leg.role, leg.zone]] : [])) {
    const a = observation.bodies[role], b = observation.bodies[receiverRole];
    observation.receivers[`${role}:${receiverRole}`] = {
      bodyId: a.id, bodyGeneration: a.occupantGeneration, receiverId: b.id, receiverGeneration: b.occupantGeneration,
      handlingSupported: true, relativeVelocity: { x: 0, z: 0 }, relativeSpeed: 0,
      relativeSpin: 0, speedLimit: leg.maxSpeed, spinLimit: .25, firstUnmet: null, stable: true,
    };
  }
  return { def, fsm, observation, currentLives, admitted: true, inFlight: true, inVenueSector: true, eventId, attemptId: 1 };
}

test('current leg selects its exact load; course motion never claims receiver acceptance', () => {
  const f = pureFixture('fragile_freight', 2), pod = f.observation.bodies.pod;
  pod.vel = { x: 3, z: -4 };
  const before = structuredClone(f), handling = projectCounterweightHandling(f);
  assert.equal(handling.load.role, 'pod');
  assert.deepEqual(handling.velocity, pod.vel);
  assert.equal(handling.speed, 5);
  assert.equal(handling.reference, 'course');
  for (const key of ['receiver', 'speedLimit', 'spinLimit', 'relativeSpin', 'firstUnmet', 'stable', 'dwellFraction']) assert.equal(handling[key], null);
  assert.deepEqual(f, before, 'projection does not change FSM, bodies, events or observation');
  assert.deepEqual(structuredClone(handling), handling);
  assert.deepEqual(copyCounterweightHandling({ ...handling, native: () => {} }), handling, 'unknown pointers cannot leak into public view');
});

test('unsupported, malformed, wrong context, missing and recycled lives hide before projection', () => {
  const changes = [
    f => { f.admitted = false; }, f => { f.inFlight = false; }, f => { f.inVenueSector = false; },
    f => { f.observation = null; }, f => { f.observation.mode = 'dock'; },
    f => { f.observation.bodies.load.vel.x = NaN; }, f => { f.currentLives.load.generation++; },
    f => { delete f.currentLives.load; }, f => { f.currentLives.cradle.id++; },
    f => { f.fsm.mem.roleWitness.load = { id: 1, generation: -1 }; },
    f => { f.fsm.phase = 'complete'; }, f => { f.fsm.legIndex = 80; },
    f => { f.observation.receivers['load:cradle'].handlingSupported = false; },
    f => { f.observation.receivers['load:cradle'].relativeVelocity.x = Infinity; },
    f => { f.observation.receivers['load:cradle'].relativeSpeed = 2; },
    f => { f.observation.receivers['load:cradle'].bodyGeneration++; },
    f => { f.observation.receivers['load:cradle'].receiverGeneration++; },
    f => { f.observation.receivers['load:cradle'].firstUnmet = 'prediction'; },
    f => { f.observation.receivers['load:cradle'].firstUnmet = 'attach'; f.observation.receivers['load:cradle'].stable = false; },
    f => { f.fsm.mem.dwellS['load:cradle'] = NaN; },
  ];
  for (const change of changes) {
    const f = pureFixture(); change(f);
    assert.equal(projectCounterweightHandling(f), null, String(change));
  }
});

test('receiver reason is canonical and dwell is the exact FSM memory, never extrapolated', () => {
  const f = pureFixture(), witness = f.observation.receivers['load:cradle'];
  f.fsm.mem.dwellS['load:cradle'] = .6;
  assert.equal(projectCounterweightHandling(f).dwellFraction, .5);
  assert.equal(projectCounterweightHandling(f).firstUnmet, null);
  const before = structuredClone(f);
  const legacy = structuredClone(f.observation);
  for (const row of Object.values(legacy.receivers)) for (const field of RECEIVER_FIELDS) delete row[field];
  const oldFsm = structuredClone(f.fsm), events = advanceAttempt(f.fsm, f.def, f.observation);
  assert.deepEqual(advanceAttempt(oldFsm, f.def, legacy), events);
  assert.deepEqual(f.fsm, oldFsm, 'additive observation fields preserve all existing FSM state and events');
  assert.equal(projectCounterweightHandling(f).dwellFraction, (.6 + DT) / f.def.legs[1].dwellS);
  f.fsm = before.fsm; f.fsm.mem.dwellS['load:cradle'] = 0;
  for (const firstUnmet of ['inside', 'mouth', 'support', 'speed', 'spin']) {
    witness.firstUnmet = firstUnmet; witness.stable = false;
    assert.equal(projectCounterweightHandling(f).firstUnmet, firstUnmet);
    assert.equal(projectCounterweightHandling(f).dwellFraction, 0);
  }
});

test('Split Decision requires one exact live Line target and preserves shared parkAll dwell', () => {
  const f = pureFixture('split_decision', 0), a = f.observation.bodies.load_a, b = f.observation.bodies.load_b;
  assert.equal(projectCounterweightHandling(f), null, 'two defined loads without a Line are ambiguous');
  f.observation.lines = [{ id: 'att_000001', role: 'load_b', aId: 99, bId: b.id }];
  let handling = projectCounterweightHandling(f);
  assert.equal(handling.load.role, 'load_b');
  assert.equal(handling.receiver.role, 'shelf_b');
  assert.equal(handling.firstUnmet, 'attach');
  f.fsm.mem.attachSeen.load_b = true;
  handling = projectCounterweightHandling(f);
  assert.equal(handling.stable, true);
  assert.equal(handling.dwellFraction, 0, 'selected receiver can be stable before both are ready');
  f.fsm.mem.dwellS.parkAll = .3;
  assert.equal(projectCounterweightHandling(f).dwellFraction, .3 / f.def.legs[0].dwellS);
  f.observation.lines.push({ id: 'att_000002', role: 'load_a', aId: 99, bId: a.id });
  assert.equal(projectCounterweightHandling(f), null, 'two actual Lines remain ambiguous');
  f.observation.lines = [{ id: 'att_000003', role: 'load_b', aId: 99, bId: a.id }];
  assert.equal(projectCounterweightHandling(f), null, 'a named role cannot substitute the actual endpoint');
  f.observation.lines = [null];
  assert.equal(projectCounterweightHandling(f), null, 'malformed Line rows cannot become an active load');
});

async function nativeFixture() {
  const sim = createSimulation({ seed: 80406, systems: [ships, economy, physics, combat, tetherGameplay, createCounterweightCircuitSystem()] });
  const s = sim.state, anchor = venueAnchorGlobal();
  s.mode = 'flight'; s.world.currentSectorId = VENUE_SECTOR_ID; s.ui.docked = false;
  s.input.actions ||= {}; s.settings.gameplay.physicsBackend = 'rapier-dynamic';
  sim.registry.get('ships').newGame();
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: s.player,
    pos: { x: anchor.x + 220, z: anchor.z }, fittings: [] }));
  s.playerId = player.id;
  const owner = sim.registry.get('counterweightCircuit'), native = sim.registry.get('physics');
  const tick = () => {
    s.tick++; s.simTime = s.tick * DT;
    native.update(DT, s); sim.registry.get('combat').update(DT, s);
    sim.registry.get('tetherGameplay').update(DT, s); owner.update(DT, s);
  };
  await native.prepareBackend(s); tick(); tick();
  s.world.counterweightCircuit.records.soft_berth = { completions: 1 };
  assert.equal(owner._startAttempt('moving_berth', true), true);
  assert.equal(s.counterweightCircuitView.handling, null, 'preparation has no handling witness');
  const attempt = owner._attempt(), admission = s.counterweightCircuitView.admission;
  tick(); tick();
  sim.bus.emit('counterweightCircuit:presentationReady', { attemptId: attempt.attemptId, generation: admission.generation,
    bodies: admission.bodies.map(({ id, generation }) => ({ id, generation })) });
  tick(); assert.equal(attempt.admissionPending, false);
  const load = attempt.cohort.get('load'), receiver = attempt.cohort.get('barge');
  const line = getCombatKernel(owner.ctx).attachments.create({ defId: 'tether_standard', ownerId: player.id, targetId: load.id,
    sourceWorld: { ...player.pos }, targetWorld: { ...load.pos } });
  assert.equal(line.ok, true, line.reason);
  tick(); assert.equal(attempt.fsm.legIndex, 1);
  return { sim, s, owner, native, player, attempt, load, receiver, tick };
}

test('native angular receiver motion reaches the real <=8Hz published/default cloned view without writes', async () => {
  const f = await nativeFixture(), { s, owner, native, load, receiver, tick } = f;
  queuePhysicsImpulse(load, { x: load.mass * 3, y: 0, z: load.mass * 2 }, { source: 'handling-test' });
  queuePhysicsImpulse(receiver, { x: receiver.mass * 2, y: 0, z: receiver.mass }, { source: 'handling-test' });
  queuePhysicsTorqueImpulse(receiver, { x: 0, y: receiver.physicsBody.inertiaY * .05, z: 0 }, { source: 'handling-test' });
  tick();
  assert.ok(Math.abs(receiver.angVel) > .001, 'receiver actually turns through a native torque impulse');
  const physical = owner._physical(), before = {
    loadPos: { ...load.pos }, loadVel: { ...load.vel }, loadSpin: load.angVel,
    receiverPos: { ...receiver.pos }, receiverVel: { ...receiver.vel }, receiverSpin: receiver.angVel,
    fsm: structuredClone(f.attempt.fsm), credits: s.player.credits,
  };
  const nativeLoad = native._sg02.records.get(load.id), nativeReceiver = native._sg02.records.get(receiver.id);
  const obs = physical.observe(f.attempt.cohort, f.attempt.def, DT), witness = obs.receivers['load:barge'];
  const dx = load.pos.x - receiver.pos.x, dz = load.pos.z - receiver.pos.z;
  assert.deepEqual(witness.relativeVelocity, {
    x: load.vel.x - receiver.vel.x + receiver.angVel * dz,
    z: load.vel.z - receiver.vel.z - receiver.angVel * dx,
  });
  assert.notEqual(witness.relativeSpeed, Math.hypot(load.vel.x - receiver.vel.x, load.vel.z - receiver.vel.z), 'angular point motion matters');
  assert.equal(witness.stable, witness.inside && witness.entered && witness.supportWitness
    && witness.relativeSpeed <= f.attempt.def.legs[1].maxSpeed && witness.relativeSpin <= witness.spinLimit);
  assert.equal(witness.firstUnmet, !witness.inside ? 'inside' : !witness.entered ? 'mouth' : !witness.supportWitness ? 'support'
    : witness.relativeSpeed > witness.speedLimit ? 'speed' : witness.relativeSpin > witness.spinLimit ? 'spin' : null);
  assert.deepEqual({ loadPos: { ...load.pos }, loadVel: { ...load.vel }, loadSpin: load.angVel,
    receiverPos: { ...receiver.pos }, receiverVel: { ...receiver.vel }, receiverSpin: receiver.angVel,
    fsm: structuredClone(f.attempt.fsm), credits: s.player.credits }, before);
  assert.equal(native._sg02.records.get(load.id), nativeLoad);
  assert.equal(native._sg02.records.get(receiver.id), nativeReceiver);
  let prior = s.counterweightCircuitView, published = false;
  for (let i = 0; i < 9; i++) {
    const at = s.simTime; tick();
    const next = s.counterweightCircuitView;
    if (next !== prior) {
      assert.ok(next.handling);
      assert.ok(next.handling.observedAt - (prior.handling?.observedAt ?? 0) >= .125 - DT);
      const projected = projectCounterweightCircuitView(s), cloned = structuredClone(projected);
      assert.deepEqual(cloned.handling, next.handling, 'default public projection includes the real production handling DTO');
      assert.deepEqual(next.handling.load.id, load.id);
      assert.equal(next.handling.reference, 'receiver');
      assert.equal(next.handling.observedAt, s.simTime);
      prior = next; published = true;
    } else assert.ok(s.simTime > at, 'intermediate sim ticks retain the previous sample without inventing progress');
  }
  assert.equal(published, true);
  const projected = projectCounterweightCircuitView(s);
  s.mode = 'dock'; assert.equal(projectCounterweightCircuitView(s).handling, null); s.mode = 'flight';
  s.world.currentSectorId = 'sector_helios_prime'; assert.equal(projectCounterweightCircuitView(s).handling, null); s.world.currentSectorId = VENUE_SECTOR_ID;
  const current = s.entities.get(load.id);
  s.entities.set(load.id, { ...current, occupantGeneration: current.occupantGeneration + 1 });
  assert.equal(projectCounterweightCircuitView(s).handling, null, 'recycled mirrored load hides immediately');
  s.entities.set(load.id, current);
  assert.deepEqual(projectCounterweightCircuitView(s).handling, projected.handling);
});
