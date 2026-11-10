import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCounterweightCircuitPresentation } from '../src/features/counterweightCircuit/presentation.js';
import { eventDefinitionById } from '../src/features/counterweightCircuit/definition.js';
import { projectCounterweightHandling } from '../src/features/counterweightCircuit/handlingReadout.js';
import { cradleFit } from '../src/features/counterweightCircuit/course.js';
import { receiverMouthSegments } from '../src/features/counterweightCircuit/receiverGuidanceGeometry.js';
import { createAttemptState, advanceAttempt } from '../src/features/counterweightCircuit/attempt.js';
import { projectCounterweightCircuitJournal } from '../src/features/counterweightCircuit/readModel.js';

function fixture(eventId = 'soft_berth') {
  const split = eventId === 'split_decision', def = eventDefinitionById(eventId);
  const loadRole = split ? 'load_a' : 'load', receiverRole = split ? 'shelf_a' : 'cradle';
  const legIndex = split ? 0 : 1;
  const load = { id: 11, occupantGeneration: 2, alive: true, pos: { x: 110, z: 220 },
    prevPos: { x: 106, z: 216 }, vel: { x: 1.8, z: 2.4 }, radius: 5.2 };
  const receiver = { id: 12, occupantGeneration: 3, alive: true, pos: { x: 150, z: 240 },
    prevPos: { x: 146, z: 236 }, vel: { x: 0, z: 0 }, rot: -Math.PI / 2, prevRot: -Math.PI / 2, radius: 32 };
  const fsm = { phase: 'running', eventId, attemptId: 8, legIndex,
    mem: { dwellS: split ? { parkAll: 0 } : { 'load:cradle': .6 }, attachSeen: { load_a: true } } };
  const observation = { mode: 'flight', playerAlive: true, playerId: 1, simTime: 10,
    bodies: { [loadRole]: load, [receiverRole]: receiver },
    lines: [{ id: 'line:50', role: loadRole, aId: 1, bId: 11 }],
    receivers: { [`${loadRole}:${receiverRole}`]: { handlingSupported: true, bodyId: 11, bodyGeneration: 2,
      receiverId: 12, receiverGeneration: 3, relativeVelocity: { x: 1.8, z: 2.4 }, relativeSpeed: 3,
      speedLimit: 4, spinLimit: .25, relativeSpin: .1, stable: true, firstUnmet: null } } };
  const currentLives = { [loadRole]: { id: 11, generation: 2 }, [receiverRole]: { id: 12, generation: 3 } };
  const dto = projectCounterweightHandling({ def, fsm, observation, currentLives, admitted: true,
    inFlight: true, inVenueSector: true, eventId, attemptId: 8 });
  assert.ok(dto);
  const scene = new THREE.Scene();
  const state = { mode: 'flight', simTime: 10, world: { currentSectorId: 'sector_pallas_drift', frameOrigin: { x: 100, z: 200 } },
    entities: new Map([[11, load], [12, receiver]]), settings: { video: {} }, render: { scene, interpolationAlpha: .5 },
    counterweightCircuitView: { eventId, attemptId: 8, phase: 'running', admission: null,
      journal: { attempt: { legIndex } }, handling: structuredClone(dto),
      marks: [{ shape: 'ring', kind: 'receiver', followId: 12, x: 150, z: 240, r: 34 }] } };
  return { state, dto, load, receiver, fsm, observation, currentLives, def, scene,
    owner: createCounterweightCircuitPresentation({ state, scene }) };
}

test('authored mouth guides sit outside the legal opening and point inward', () => {
  const b = cradleFit(32), p = receiverMouthSegments(32);
  for (let i = 0; i < p.length; i += 3) {
    assert.ok(p[i] <= b.minX + 1e-8 || p[i] >= b.maxX - 1e-8);
    assert.ok(p[i + 2] < b.mouthZ);
  }
});

test('pooled witness follows presented bodies and origin, and draws measured motion and dwell', () => {
  const h = fixture(), { owner, state, receiver } = h;
  try {
    owner.frame(); const p = owner._pool;
    assert.equal(p.bracket.visible, true);
    assert.deepEqual([p.bracket.position.x, p.bracket.position.z], [8, 18]);
    assert.deepEqual([p.throat.position.x, p.throat.position.z], [48, 38]);
    assert.equal(p.throat.rotation.y, Math.PI / 2);
    assert.equal(p.needle.scale.x, 18);
    assert.equal(p.limit.position.x, 24);
    assert.equal(p.rings[0].visible, true);
    assert.equal(p.rings[0].geometry.drawRange.count, 26);
    receiver.pos.x += 10; receiver.prevPos.x += 10; receiver.rot = receiver.prevRot = 0;
    state.world.frameOrigin.x += 4; owner.frame();
    assert.equal(p.throat.position.x, 54); assert.ok(Math.abs(p.throat.rotation.y) < 1e-9);
    const w = state.counterweightCircuitView.handling;
    w.velocity = { x: 30, z: 40 }; w.speed = 50; w.stable = false; w.firstUnmet = 'speed'; w.dwellFraction = 0; owner.frame();
    assert.equal(p.needle.scale.x, 80);
    w.velocity = { x: 0, z: 0 }; w.speed = 0; w.stable = true; w.firstUnmet = null; w.dwellFraction = .5; owner.frame();
    assert.equal(p.bracket.visible, true); assert.equal(p.needleRoot.visible, false);
  } finally { owner.dispose(); }
});

test('shared dwell, null, stale, recycled, invalid and terminal views never invent guidance', () => {
  const h = fixture('split_decision'), { owner, state } = h, view = state.counterweightCircuitView;
  try {
    owner.frame(); assert.equal(owner._pool.throat.visible, true);
    assert.equal(owner._pool.rings[0].visible, false, 'stable selected shelf is not shared dwell');
    view.handling.dwellFraction = .25; owner.frame();
    assert.equal(owner._pool.rings[0].visible, true);
    assert.equal(owner._pool.rings[0].geometry.drawRange.count, 14);
    const good = structuredClone(view.handling);
    const hidden = () => { owner.frame(); assert.equal(owner._pool.bracket.visible, false); assert.equal(owner._pool.throat.visible, false); };
    view.handling = null; hidden();
    view.handling = structuredClone(good); view.admission = { generation: 1, bodies: [] }; hidden(); view.admission = null;
    state.simTime = 11; hidden(); state.simTime = 10;
    state.entities.get(11).occupantGeneration = 9; hidden(); state.entities.get(11).occupantGeneration = 2;
    state.entities.delete(12); hidden(); state.entities.set(12, h.receiver);
    h.receiver.occupantGeneration++; hidden(); h.receiver.occupantGeneration--;
    view.handling.receiver.role = 'shelf_b'; hidden(); view.handling = structuredClone(good);
    view.handling.velocity.x = NaN; hidden(); view.handling = structuredClone(good);
    state.world.currentSectorId = 'other'; hidden(); state.world.currentSectorId = 'sector_pallas_drift';
    state.mode = 'dock'; hidden(); state.mode = 'flight';
    view.attemptId++; hidden(); view.attemptId--;
    for (const outcome of ['complete', 'failed', 'cancelled']) {
      state.counterweightCircuitView = { phase: null, journal: { lastResult: { outcome } } };
      hidden();
    }
  } finally { owner.dispose(); }
});

test('an ambiguous two-line Split Decision observation produces no target to render', () => {
  const h = fixture('split_decision');
  try {
    h.observation.bodies.load_b = { ...h.load, id: 13, occupantGeneration: 4 };
    h.observation.lines.push({ id: 'line:other', role: 'load_b', aId: 1, bId: 13 });
    h.currentLives.load_b = { id: 13, generation: 4 };
    const handling = projectCounterweightHandling({ def: h.def, fsm: h.fsm, observation: h.observation,
      currentLives: h.currentLives, admitted: true, inFlight: true, inVenueSector: true,
      eventId: 'split_decision', attemptId: 8 });
    assert.equal(handling, null);
    h.state.counterweightCircuitView.handling = handling;
    h.owner.frame(); assert.equal(h.owner._pool.bracket.visible, false);
  } finally { h.owner.dispose(); }
});

test('a real FSM completion projected as a terminal journal retires the instrument', () => {
  const h = fixture(), { owner, state, observation, def } = h;
  try {
    owner.frame(); assert.equal(owner._pool.rings[0].visible, true);
    const fsm = createAttemptState(def, { attemptId: 8 });
    fsm.phase = 'running'; fsm.legIndex = 1; fsm.armedAt = 1;
    fsm.mem.dwellS['load:cradle'] = .6;
    observation.dt = .61; observation.bodies.load.hull = 80;
    const finished = advanceAttempt(fsm, def, observation).find(event => event.type === 'finished');
    assert.equal(finished?.outcome, 'complete');
    state.world.counterweightCircuit = { lastResult: finished };
    state.counterweightCircuitView = { phase: null, journal: projectCounterweightCircuitJournal(state) };
    owner.frame();
    assert.equal(state.counterweightCircuitView.journal.lastResult.outcome, 'complete');
    assert.equal(owner._pool.bracket.visible, false); assert.equal(owner._pool.throat.visible, false);
    assert.equal(owner._pool.rings[0].parent.visible, false);
  } finally { owner.dispose(); }
});

test('release hides pooled instruments and dispose frees their geometry', () => {
  const h = fixture(), p = h.owner._pool;
  let disposed = false; p.throat.geometry.addEventListener('dispose', () => { disposed = true; });
  h.owner.frame(); h.owner.release();
  assert.equal(p.bracket.visible, false); assert.equal(p.throat.visible, false);
  h.owner.dispose(); assert.equal(disposed, true);
  assert.equal(h.scene.children.includes(p.throat.parent), false);
});
