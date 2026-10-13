import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createBus } from '../src/core/eventBus.js';
import { survivalArena, ARENA_ROOM_OWNER } from '../src/systems/survivalArena.js';
import { installPlayerTruthReader } from '../src/testing/playerTruth/reader.js';
import { checkPopping, CLS, VIS } from '../scripts/player-truth/checks.mjs';

const retired = (overrides = {}) => ({ ev: 'retired', id: 391, sim: 13, type: 'station',
  pos: { x: 0, z: 0 }, reason: 'survival-room-wave-cleared', owner: ARENA_ROOM_OWNER,
  roomSolidId: 'survival-room-w2-bank', wave: 2, ...overrides });

function removal(events, cls = CLS.station) {
  return { meta: { mode: 'adventure' }, keys: ['a|body|lod1|authored'], events,
    samples: Array.from({ length: 60 }, (_, i) => ({ f: i, t: i * 100, sim: 10 + i * .1,
      mode: 'flight', vw: 1280, vh: 720,
      e: i < 30 ? [[391, cls, 0, 0, 0, 0, 640, 360, 12, VIS.onscreen, 0, 0]] : [] })) };
}

test('actual native cook-off and room release retain terminal meaning through immediate slot reuse', async () => {
  const lane = createSimHost();
  try {
    const init = await lane.init({ profile: 'production', seed: 4242, bridgeAll: true,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
    const { runtime, state } = lane.host;
    state.simTime = 7.8;
    const rock = runtime.spawn({ type: 'asteroid', radius: 12, pos: { x: -1743.6, z: -2176.2 },
      data: { material: 'volatile', materialCondition: { heat: 40, reacted: true }, fuelVolatile: .8 } });
    const rockLife = rock.occupantGeneration;
    runtime.getSystem('environmentMaterials')._detonate(rock, {});
    assert.equal(rock.alive, false, 'the captured cue is an actual native material death');
    runtime.getSystem('core').helpers.removeEntity(rock.id, { immediate: true });
    const rockSuccessor = runtime.spawn({ id: rock.id, type: 'projectile' });
    assert.notEqual(rockSuccessor.occupantGeneration, rockLife);

    const plate = runtime.spawn({ type: 'station', radius: 12, pos: { x: -1651.9, z: -2332.7 },
      data: { roomOwner: ARENA_ROOM_OWNER, roomSolidId: 'survival-room-w2-bank' } });
    const plateLife = plate.occupantGeneration;
    const arena = runtime.getSystem('survivalArena');
    arena._wave = 2; arena._roomIds = [plate.id];
    assert.equal(arena._releaseRoom('wave_cleared'), 1);
    assert.equal(plate.alive, false);
    runtime.getSystem('core').helpers.removeEntity(plate.id, { immediate: true });
    const plateSuccessor = runtime.spawn({ id: plate.id, type: 'asteroid' });
    assert.notEqual(plateSuccessor.occupantGeneration, plateLife);
    const reply = await lane.tick({ tick: 1, steps: 0, commands: [], ackEnd: init.initRebuild?.end ?? 0 });
    const cook = reply.events.find(e => e.t === 'environment:detonated' && e.p.id === rock.id).p;
    assert.equal(cook.occupantGeneration, rockLife); assert.equal(cook.type, 'asteroid');
    assert.equal(cook.simTime, 7.8); assert.deepEqual(cook.pos, { x: -1743.6, y: 0, z: -2176.2 });
    const room = reply.events.find(e => e.t === 'entity:retired' && e.p.id === plate.id).p;
    assert.equal(room.occupantGeneration, plateLife); assert.equal(room.type, 'station');
    assert.equal(room.simTime, 7.8); assert.equal(room.owner, ARENA_ROOM_OWNER);
    assert.equal(room.roomSolidId, 'survival-room-w2-bank'); assert.equal(room.wave, 2);
    assert.deepEqual(room.pos, { x: -1651.9, z: -2332.7 });
    assert.equal(reply.events.some(e => ['entity:killed', 'asteroid:destroyed'].includes(e.t)
      && [rock.id, plate.id].includes(e.p.id)), false, 'retirement does not invent a combat kill or fracture');
  } finally { lane.shutdown(); }
});

test('room cleanup qualifies only the current wave-owned solid at the native writer', () => {
  for (const [reason, owner, solidId, expected] of [
    ['wave_cleared', ARENA_ROOM_OWNER, 'survival-room-w2-bank', 1],
    ['rearm', ARENA_ROOM_OWNER, 'survival-room-w2-bank', 0],
    ['run_ended', ARENA_ROOM_OWNER, 'survival-room-w2-bank', 0],
    ['wave_cleared', 'foreign', 'survival-room-w2-bank', 0],
    ['wave_cleared', ARENA_ROOM_OWNER, 'survival-room-w1-bank', 0],
  ]) {
    const body = { id: 391, occupantGeneration: 42, type: 'station', alive: true,
      pos: { x: 5, z: 6 }, data: { roomOwner: owner, roomSolidId: solidId } };
    const events = []; const sys = Object.create(survivalArena);
    sys.state = { entities: new Map([[391, body]]), simTime: 13 };
    sys._wave = 2; sys._roomIds = [391]; sys._emit = (type, payload) => events.push({ type, payload });
    sys._releaseRoom(reason);
    assert.equal(events.length, expected, `${reason}/${owner}/${solidId}`);
    assert.equal(body.alive, owner !== ARENA_ROOM_OWNER, 'foreign room ownership cannot be removed');
    sys._releaseRoom(reason); assert.equal(events.length, expected, 'cleanup is exactly once');
  }
});

test('reader preserves old-life terminal payloads after a new occupant takes the slot', () => {
  const bus = createBus(); let callback;
  const body = { id: 391, occupantGeneration: 42, type: 'station', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const win = { performance: { now: () => 100 }, addEventListener() {}, removeEventListener() {},
    requestAnimationFrame(fn) { callback = fn; return 1; }, cancelAnimationFrame() {},
    SF: { THREE, bus, state: { mode: 'flight', simTime: 13, entityList: [body],
      entities: new Map([[391, body]]), render: {} } } };
  const reader = installPlayerTruthReader(win, { pxEvery: 0 });
  try {
    reader.start(); callback(); reader.stop();
    const next = { ...body, occupantGeneration: 43 }; win.SF.state.entityList = [next]; win.SF.state.entities.set(391, next);
    reader.start(); callback(); reader.stop();
    const room = retired({ ev: undefined, occupantGeneration: 42, simTime: 12.95 });
    bus.emit('entity:retired', room);
    bus.emit('environment:detonated', { id: 391, occupantGeneration: 43, type: 'asteroid',
      simTime: 13, pos: { x: 1, z: 2 }, material: 'volatile' });
    const events = reader.drain().events;
    assert.equal(events[0].id, 391); assert.equal(events[0].ev, 'retired'); assert.equal(events[0].sim, 12.95);
    for (const key of ['type', 'pos', 'reason', 'owner', 'roomSolidId', 'wave']) assert.deepEqual(events[0][key], room[key]);
    assert.notEqual(events[1].id, 391); assert.equal(events[1].ev, 'environment-detonated');
    assert.equal(events[1].type, 'asteroid'); assert.deepEqual(events[1].pos, { x: 1, z: 2 });
  } finally { reader.dispose(); }
});

test('only exact timely same-life room retirement qualifies removal; unknown cleanup still fails', () => {
  assert.equal(checkPopping(removal([retired()])).status, 'PASS');
  for (const receipt of [retired({ owner: 'foreign' }), retired({ reason: 'rearm' }),
    retired({ roomSolidId: 'survival-room-w1-bank' }), retired({ pos: null }), retired({ wave: 0 }),
    retired({ id: 1000391 }), retired({ sim: 15 }), { ev: 'destroyed', id: 391, sim: 13, reason: 'far-shelve' }]) {
    assert.equal(checkPopping(removal([receipt])).status, 'FAIL', JSON.stringify(receipt));
  }
  assert.equal(checkPopping(removal([])).status, 'FAIL');
});

test('material cook-off qualifies its real body death, never an unrelated bomb cue or successor', () => {
  const cook = { ev: 'environment-detonated', id: 391, sim: 13, type: 'asteroid', pos: { x: 0, z: 0 } };
  assert.equal(checkPopping(removal([cook], CLS.asteroid)).status, 'PASS');
  for (const receipt of [{ ...cook, ev: 'bomb-exploded' }, { ...cook, type: 'projectile' },
    { ...cook, id: 1000391 }, { ...cook, sim: 15 }]) {
    assert.equal(checkPopping(removal([receipt], CLS.asteroid)).status, 'FAIL');
  }
});

function boundary({ introVisible, activeVisible = true, duringActive = false, gone = false, events = [] }) {
  const samples = Array.from({ length: 60 }, (_, i) => ({ f: i, t: i * 100, sim: 10 + i * .1,
    mode: 'flight', vw: 1280, vh: 720,
    run: { w: i < 20 ? 1 : 2, ph: i >= 20 && i < 30 ? 'wave_intro' : 'active' },
    e: gone && i >= 20 ? [] : [[391, CLS.station, 0, 0, 0, 0, 640, 360, 12,
      (duringActive ? i >= 10 : i < 20 ? false : i < 30 ? introVisible : activeVisible) ? VIS.onscreen : VIS.hidden, 0, 0]] }));
  return { meta: { mode: 'swarm', rounds: true }, keys: ['a|body|lod1|authored'], samples, events };
}

test('already-visible intro content does not become an appearance from a stale previous-round frame', () => {
  const outcome = checkPopping(boundary({ introVisible: true }));
  assert.equal(outcome.status, 'PASS'); assert.match(outcome.value, /0 visibility/);
});

test('real first-active and during-active visibility changes remain popping failures', () => {
  assert.equal(checkPopping(boundary({ introVisible: false })).status, 'FAIL', 'hidden intro to visible active is a real change');
  assert.equal(checkPopping(boundary({ introVisible: true, duringActive: true })).status, 'FAIL', 'active-frame change is still graded');
});

test('an inactive interval does not exempt unqualified removals', () => {
  const tr = boundary({ introVisible: true, gone: true });
  // Start drawn; the old life is removed during intro and never resumes.
  for (const sample of tr.samples.slice(0, 20)) sample.e[0][9] = VIS.onscreen;
  assert.equal(checkPopping(tr).status, 'FAIL');
  tr.events = [retired({ sim: 12 })];
  assert.equal(checkPopping(tr).status, 'PASS');
});
