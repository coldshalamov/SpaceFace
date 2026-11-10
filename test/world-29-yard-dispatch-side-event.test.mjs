// INFERENCE WORLD-29: "A yard tug dispatch is a dock side event you can watch."
//
// Contract: `npcjobs:yardDispatch` schedules exactly one `station:sideEvent` of the existing
// tug kind (`cargo_tractor`) on the yard — cosmetic (budget 0), bearing out toward the stranded
// player — through the director's normal pending/pump path. No dispatch, no side event.
import assert from 'node:assert/strict';
import test from 'node:test';

import { stationSideEventDirector } from '../src/systems/stationSideEventDirector.js';
import { resolveStationSideEventVfxProfile } from '../src/render/stationSideEventVfx.js';

function makeBus() {
  const handlers = new Map();
  const emitted = [];
  return {
    emitted,
    on: (event, fn) => handlers.set(event, fn),
    off: (event, fn) => { if (handlers.get(event) === fn) handlers.delete(event); },
    emit: (event, payload) => {
      emitted.push({ event, payload });
      const fn = handlers.get(event);
      if (fn) fn(payload);
    },
  };
}

function yardStation() {
  return {
    id: 'station_yard', type: 'station', alive: true, size: 'M',
    factionId: 'faction_scn', pos: { x: 1200, z: 0 },
    dockRadius: 80,
    data: { stationId: 'station_yard', stationTypeId: 'trade_hub', dockRadius: 80, size: 'M' },
  };
}

function makeState({ withStation = true } = {}) {
  const player = {
    id: 1, type: 'ship', alive: true,
    pos: { x: 1500, z: 400 }, vel: { x: 0, z: 0 },
    data: {},
  };
  const entities = new Map([[1, player]]);
  if (withStation) entities.set('station_yard', yardStation());
  return {
    mode: 'flight',
    tick: 3000,
    simTime: 50,
    playerId: 1,
    player: { flags: {} },
    meta: { seed: 4242 },
    world: { currentSectorId: 'sector_test' },
    entities,
    entityList: [...entities.values()],
    settings: {},
    camera: {},
  };
}

function makeDirector(state) {
  const bus = makeBus();
  stationSideEventDirector.init({ state, bus, helpers: {} });
  return bus;
}

function step(state, director, seconds) {
  for (let i = 0; i < seconds; i++) {
    state.simTime += 1;
    state.tick += 60;
    director.update(1, state);
  }
}

function yardSideEvents(bus) {
  return bus.emitted
    .filter((e) => e.event === 'station:sideEvent'
      && String(e.payload.eventId || '').startsWith('sse:yard-dispatch:'))
    .map((e) => e.payload);
}

test('a yard dispatch schedules one cargo_tractor side event on the yard', () => {
  const state = makeState();
  const bus = makeDirector(state);
  bus.emit('npcjobs:yardDispatch', { jobId: 'job:yard-1', simTime: state.simTime });
  step(state, stationSideEventDirector, 40);
  const events = yardSideEvents(bus);
  assert.equal(events.length, 1, 'one dispatch schedules one dock-side event');
  const sideEvent = events[0];
  assert.equal(sideEvent.kind, 'cargo_tractor', 'the tug kind, not a new event kind');
  assert.equal(sideEvent.stationId, 'station_yard', 'the mover stages on the yard');
  assert.equal(sideEvent.budget, 0, 'cosmetic seam — never a spawned ship');
  assert.equal(sideEvent.path, 'outbound-past-traffic', 'the tug departs the dock outward');
  assert.deepEqual(sideEvent.entityIds, [], 'no entity — the graphics lane draws the mover');
  const expectedBearing = Math.atan2(400 - 0, 1500 - 1200); // station → stranded player
  assert.ok(Math.abs(sideEvent.bearing - expectedBearing) < 0.02,
    'the mover bears out toward the stranded ship');
  assert.ok(resolveStationSideEventVfxProfile(sideEvent.kind),
    'the kind resolves to a render profile so the seam actually draws');
});

test('two dispatches two ticks apart schedule two events, each its own id', () => {
  const state = makeState();
  const bus = makeDirector(state);
  bus.emit('npcjobs:yardDispatch', { jobId: 'job:yard-1', simTime: state.simTime });
  state.tick += 120;
  state.simTime += 2;
  bus.emit('npcjobs:yardDispatch', { jobId: 'job:yard-2', simTime: state.simTime });
  step(state, stationSideEventDirector, 60);
  const events = yardSideEvents(bus);
  assert.equal(events.length, 2, 'each real dispatch earns its own visible event');
  assert.notEqual(events[0].eventId, events[1].eventId, 'event ids never collide');
});

test('a dispatch with no visible yard schedules nothing', () => {
  const state = makeState({ withStation: false });
  const bus = makeDirector(state);
  bus.emit('npcjobs:yardDispatch', { jobId: 'job:yard-1', simTime: state.simTime });
  step(state, stationSideEventDirector, 10);
  assert.equal(yardSideEvents(bus).length, 0, 'no yard on glass → no staged mover');
});

test('the director unsubscribes the yard seam on destroy', () => {
  const state = makeState();
  const bus = makeDirector(state);
  stationSideEventDirector.destroy();
  bus.emit('npcjobs:yardDispatch', { jobId: 'job:yard-1', simTime: state.simTime });
  step(state, stationSideEventDirector, 10);
  assert.equal(yardSideEvents(bus).length, 0, 'a destroyed director never fires the seam');
});
