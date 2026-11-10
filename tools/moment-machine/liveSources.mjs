// Read the shipped Adventure tape, Chronicle normalizer, and kill-cam recorder.
// This module does not register a second recorder and does not write sim state.

import { normalizeFact } from '../../src/chronicler/normalize.js';
import { killReplay, adventureTapeRecording, noteKillReplaySample, captureKillReplay } from '../../src/systems/killReplay.js';
import { createKillcamRecorder, encodeKillcamTape } from '../../src/sim/killcamTape.js';
import { fromAdventureTape, fromChronicleFact, fromKillcamTape, ingestStream } from '../../src/presentation/momentMachine/ingest.js';
import { selectMoments } from '../../src/presentation/momentMachine/select.js';

function createBus() {
  const handlers = new Map();
  return {
    on(name, fn) {
      const list = handlers.get(name) || [];
      list.push(fn);
      handlers.set(name, list);
      return () => {};
    },
    emit(name, payload) {
      const list = handlers.get(name) || [];
      for (let i = 0; i < list.length; i += 1) list[i](payload);
    },
  };
}

function factStream(event) {
  return {
    schema: 'spaceface.momentStream.v1',
    seed: 0,
    tickRate: 60,
    tone: 'feat',
    window: { baseTick: 0, ticks: 1320, seconds: 22 },
    events: event && !event.dropped ? [event] : [],
    samples: [],
  };
}

function chronicleState() {
  return {
    simTime: 14,
    tick: 840,
    playerId: 'p1',
    entities: new Map(),
    world: { currentSectorId: 'sector_test', activeSector: { name: 'Test Reach' } },
  };
}

export function readAdventureTape() {
  const bus = createBus();
  const state = {
    mode: 'flight',
    playerId: 'p1',
    meta: { seed: 11 },
    tick: 0,
    entities: new Map([
      ['p1', {
        id: 'p1',
        type: 'ship',
        alive: true,
        pos: { x: 4, z: 8 },
        data: { intent: { boost: true }, callsign: 'Ivy' },
      }],
    ]),
  };
  killReplay.init({ state, bus });
  for (let tick = 0; tick < 90; tick += 1) {
    state.tick = tick;
    killReplay.update(1 / 60, state);
  }
  bus.emit('entity:killed', { killerId: 'p1', id: 'victim-9' });
  const recording = adventureTapeRecording(state);
  const stream = fromAdventureTape(recording);
  return {
    recording: {
      seed: recording.seed,
      ticks: recording.ticks,
      events: recording.events.map((event) => ({ tick: event.tick, type: event.type, label: event.label })),
    },
    stream,
    selection: selectMoments(stream),
  };
}

export function readChronicleFacts() {
  const state = chronicleState();
  const rescue = normalizeFact('distress:rescued', {
    rescuerId: 'p1',
    targetId: 'hauler-1',
    distressId: 'd-1',
    name: 'Hauler',
  }, state);
  const collision = normalizeFact('entity:killed', {
    id: 'hauler-1',
    killerId: 'p1',
    cause: 'ship_collision',
    pos: { x: 12, z: 4 },
  }, state);
  const headline = normalizeFact('news:headline', {
    headline: 'the player rescued this ship',
  }, state);
  const burst = normalizeFact('salvage:reactorBurst', {
    wreckId: 'wreck-1',
    actorId: 'p1',
  }, state);
  const spill = normalizeFact('freight:cargoSpilled', {
    carrierId: 'hauler-1',
    cause: 'jettison',
    qty: 3,
    commodityId: 'ore',
  }, state);
  const salvage = normalizeFact('salvage:completed', {
    wreckId: 'wreck-1',
    actorId: 'p1',
  }, state);
  return {
    rescue: fromChronicleFact(rescue),
    collision: fromChronicleFact(collision),
    headline: fromChronicleFact(headline),
    burst: fromChronicleFact(burst),
    spill: fromChronicleFact(spill),
    salvage: fromChronicleFact(salvage),
    rescueSelection: selectMoments(factStream(fromChronicleFact(rescue))),
    burstSelection: selectMoments(factStream(fromChronicleFact(burst))),
    collisionSelection: selectMoments(factStream(fromChronicleFact(collision))),
    salvageSelection: selectMoments(factStream(fromChronicleFact(salvage))),
  };
}

export function readKillcam() {
  const recorder = createKillcamRecorder();
  const player = {
    id: 'p1',
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    data: { defId: 'ship_test' },
  };
  const other = {
    id: 'foe',
    type: 'ship',
    alive: true,
    team: 1,
    pos: { x: 30, z: 12 },
    rot: 0.2,
    radius: 8,
    data: {},
  };
  for (let tick = 0; tick < 40; tick += 2) {
    player.pos = { x: tick, z: tick * 0.2 };
    other.pos = { x: 30 - tick * 0.1, z: 12 };
    recorder.note({
      tick,
      playerId: 'p1',
      entityList: [player, other],
    });
  }
  other.alive = false;
  recorder.note({
    tick: 40,
    playerId: 'p1',
    entityList: [player],
  });
  const tape = encodeKillcamTape(recorder, { seed: 3 });
  const stream = fromKillcamTape(tape, { seed: 3, baseTick: 0 });
  return { tapeSamples: tape && tape.samples, stream, selection: selectMoments(stream) };
}

export function readKillRing() {
  noteKillReplaySample(0, 0, 10, 4);
  noteKillReplaySample(8, 2, 18, 6);
  noteKillReplaySample(16, 4, 24, 9);
  const record = captureKillReplay({
    run: { kind: 'survival', phase: 'active', seed: 5 },
    tick: 180,
    playerId: 'p1',
    entities: new Map([['p1', { id: 'p1', pos: { x: 20, z: 5 } }]]),
  }, { pos: { x: 28, z: 11 }, collisionRadius: 8 });
  const samples = [];
  const rows = record && Array.isArray(record.samples) ? record.samples : [];
  for (let i = 0; i < rows.length; i += 1) {
    samples.push({ tick: i, id: 'pilot', generation: 0, x: rows[i].x, z: rows[i].z, heading: 0 });
    samples.push({ tick: i, id: 'body', generation: 0, x: rows[i].bx, z: rows[i].bz, heading: 0 });
  }
  const stream = ingestStream({
    schema: 'spaceface.momentStream.v1',
    seed: record && record.seed,
    tickRate: 60,
    tone: 'feat',
    window: { baseTick: 0, ticks: rows.length, seconds: rows.length / 60 },
    events: [],
    samples,
  });
  const selection = selectMoments(stream);
  return {
    durationS: record && record.durationS,
    sampleCount: rows.length,
    selectionBoring: selection.boring,
    windowSeconds: stream.window.seconds,
    exportableAsMoment: stream.window.seconds >= 15 && selection.ranked.length > 0,
    reason: 'kill-ring-shorter-than-fifteen-seconds',
  };
}
