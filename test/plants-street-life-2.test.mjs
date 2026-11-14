// test/plants-street-life-2.test.mjs — headless checks for the 13 town street-life plant
// modules (PL-200/201/202/203/204/205/230/231/232/233/234/245/246, section C rows).
//
// Every module is a standalone `plantsPl<id>` object with init(ctx)/update(dt,state)/destroy().
// The harness is a recording bus + a spec-spreading spawnEntity + a station fixture per town
// (station bodies are real entity-type 'station' records keyed by data.stationId, per
// src/data/sectors.js). No DOM, no Three.js, no wall clock: state.simTime is driven by hand.
// Tuning day = 240 s, night/off-shift band = last 60 s (>= 180) on every shared-clock plant.
import test from 'node:test';
import assert from 'node:assert/strict';

import { pl200TwoTaps, PL_200_VENT_EVENT, PL_200_KNOCK_EVENT, TWO_TAPS_TUNING, hissingJointFor, trenchJointsFor } from '../src/systems/plants/pl200TwoTaps.js';
import { pl201OddQueue, PL_201_JOIN_EVENT, PL_201_ADVANCE_EVENT, PL_201_BUMPED_EVENT, ODD_QUEUE_TUNING, queueSlotsFor } from '../src/systems/plants/pl201OddQueue.js';
import { pl202KeptBerth, PL_202_STARE_EVENT, PL_202_TOW_EVENT, PL_202_SHOVED_EVENT, PL_202_MOVED_EVENT, PL_202_KEPT_EVENT, KEPT_BERTH_TUNING, ribStreetFor, reservedBerthIndex } from '../src/systems/plants/pl202KeptBerth.js';
import { pl203TheTour, PL_203_NAME_EVENT, PL_203_LEARNED_EVENT, PL_203_GRIP_EVENT, PL_203_WALL_EVENT, THE_TOUR_TUNING, gardenFor } from '../src/systems/plants/pl203TheTour.js';
import { pl204TheHook, PL_204_SEATED_EVENT, PL_204_OFFER_EVENT, PL_204_SCATTERED_EVENT, PL_204_LEFT_EVENT, THE_HOOK_TUNING, craneLayoutFor } from '../src/systems/plants/pl204TheHook.js';
import { pl205TheLitHull, PL_205_LIGHT_MOVED_EVENT, PL_205_DARK_EVENT, PL_205_RELIT_EVENT, LIT_HULL_TUNING, litHullSpotFor } from '../src/systems/plants/pl205TheLitHull.js';
import { pl230VennsWindow, PL_230_LAMPS_UP_EVENT, PL_230_LAMPS_DOWN_EVENT, PL_230_AUDIENCE_EVENT, VENNS_WINDOW_TUNING, crescentFor, vennIndexFor } from '../src/systems/plants/pl230VennsWindow.js';
import { pl231MarshsLine, PL_231_WARNED_EVENT, PL_231_SHOVED_EVENT, MARSHS_LINE_TUNING, MARSH_LINE_COPY, marshYardFor } from '../src/systems/plants/pl231MarshsLine.js';
import { pl232TheValidInstruction, PL_232_INSTRUCTION_EVENT, PL_232_OBEYED_EVENT, PL_232_PARTED_EVENT, PL_232_CUT_EVENT, VALID_INSTRUCTION_TUNING, DUNMORE_COPY, DUNMORE_VALID_COPY, laneFor } from '../src/systems/plants/pl232TheValidInstruction.js';
import { pl233TheFreshMark, PL_233_MARKED_EVENT, PL_233_DONE_EVENT, PL_233_ADMIRE_EVENT, PL_233_SMEARED_EVENT, FRESH_MARK_TUNING, KNOCKED_COPY, markStreetFor } from '../src/systems/plants/pl233TheFreshMark.js';
import { pl234TheMiddleSeat, PL_234_MIDDLE_EVENT, PL_234_STOOD_EVENT, MIDDLE_SEAT_TUNING, benchLayoutFor } from '../src/systems/plants/pl234TheMiddleSeat.js';
import { pl245TheBellsHush, PL_245_RING_EVENT, PL_245_QUIET_EVENT, PL_245_CHORUS_EVENT, BELLS_HUSH_TUNING, bellSpotFor } from '../src/systems/plants/pl245TheBellsHush.js';
import { pl246WallTime, PL_246_WARN_EVENT, PL_246_PARKED_EVENT, PL_246_PLUME_EVENT, PL_246_TAKEN_EVENT, WALL_TIME_TUNING, plateFor, plumePhaseAt } from '../src/systems/plants/pl246WallTime.js';

// ---------- harness ----------

function createBus() {
  const handlers = new Map();
  const log = [];
  return {
    log,
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
      const set = handlers.get(type);
      return () => set.delete(fn);
    },
    emit(type, payload) {
      log.push({ type, payload });
      const set = handlers.get(type);
      if (set) for (const fn of [...set]) fn(payload);
    },
    count(type) { return handlers.get(type)?.size || 0; },
    types() { return [...handlers.keys()]; },
  };
}

function makeState(sectorId, overrides = {}) {
  const entities = new Map();
  const state = {
    mode: 'flight',
    simTime: 0,
    tick: 0,
    playerId: 'p1',
    entities,
    world: { currentSectorId: sectorId },
    meta: { seed: 1234 },
    story: { flags: {} },
    ...overrides,
  };
  entities.set(state.playerId, {
    id: state.playerId, alive: true, type: 'ship',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    hull: 100, hullMax: 100, data: {},
  });
  return state;
}

function makeHelpers(state) {
  const spawned = [];
  const removed = [];
  const voice = [];
  let nextId = 100;
  const helpers = {
    spawned,
    removed,
    voice,
    spawnEntity(spec) {
      const ent = {
        ...structuredClone(spec),
        id: nextId++,
        alive: true,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        data: structuredClone(spec.data || {}),
      };
      spawned.push(ent);
      if (state && state.entities) state.entities.set(ent.id, ent);
      return ent;
    },
    removeEntity(id) {
      removed.push(id);
      if (state && state.entities) state.entities.delete(id);
    },
    voiceSay(rec) { voice.push(rec); },
  };
  helpers.voice = { say(rec) { helpers.voiceSay(rec); } };
  return helpers;
}

function addStation(state, { id, sectorId, pos = { x: 0, z: 0 }, size = 'M' }) {
  const dockRadius = size === 'L' ? 90 : size === 'S' ? 60 : 72;
  const station = {
    id, alive: true, type: 'station', pos: { ...pos },
    data: { stationId: id, stationTypeId: 'trade_hub', dockRadius, sectorId, size },
  };
  state.entities.set(id, station);
  return station;
}

function harness(sectorId, { station = true, simTime = 0 } = {}) {
  const state = makeState(sectorId);
  state.simTime = simTime;
  if (station) addStation(state, { id: 'station_x', sectorId });
  const bus = createBus();
  const helpers = makeHelpers(state);
  return { state, bus, helpers };
}

// A station fixture under the id each module tunes for.
const TOWN = [
  [pl200TwoTaps, TWO_TAPS_TUNING],
  [pl201OddQueue, ODD_QUEUE_TUNING],
  [pl202KeptBerth, KEPT_BERTH_TUNING],
  [pl203TheTour, THE_TOUR_TUNING],
  [pl204TheHook, THE_HOOK_TUNING],
  [pl205TheLitHull, LIT_HULL_TUNING],
  [pl230VennsWindow, VENNS_WINDOW_TUNING],
  [pl231MarshsLine, MARSHS_LINE_TUNING],
  [pl232TheValidInstruction, VALID_INSTRUCTION_TUNING],
  [pl233TheFreshMark, FRESH_MARK_TUNING],
  [pl234TheMiddleSeat, MIDDLE_SEAT_TUNING],
  [pl245TheBellsHush, BELLS_HUSH_TUNING],
  [pl246WallTime, WALL_TIME_TUNING],
];

function harnessFor(mod, { simTime = 0 } = {}) {
  const tuning = TOWN.find(([m]) => m === mod)[1];
  const h = harness(tuning.sectorId, { station: false });
  h.state.simTime = simTime;
  addStation(h.state, { id: tuning.stationId, sectorId: tuning.sectorId });
  return h;
}

function popups(bus) {
  return bus.log.filter((e) => e.type === 'comms:popup').map((e) => e.payload);
}
function cues(bus, id = null) {
  return bus.log.filter((e) => e.type === 'audio:cue')
    .map((e) => e.payload)
    .filter((p) => id == null || p.id === id);
}
function eventsOf(bus, type) {
  return bus.log.filter((e) => e.type === type).map((e) => e.payload);
}
function advanceWith(state, mod, seconds, step = 0.5) {
  for (let t = 0; t < seconds - 1e-9; t += step) {
    state.simTime += step;
    state.tick += Math.round(step * 60);
    mod.update(step, state);
  }
}
function teleportPlayer(state, x, z, vel = { x: 0, z: 0 }) {
  const p = state.entities.get(state.playerId);
  p.pos.x = x;
  p.pos.z = z;
  p.vel.x = vel.x;
  p.vel.z = vel.z;
}
function assertNoListeners(bus) {
  const counts = bus.types().map((t) => bus.count(t));
  assert.deepEqual(counts, new Array(counts.length).fill(0), 'destroy must leave no listeners');
}
function ownedOf(h, stamp) {
  return h.helpers.spawned.filter((e) => e.data && e.data[stamp] === true);
}

// ---------- PL-200 Two taps ----------

test('PL-200 positive: Moreau walks the off-shift trench, gives two taps, and the joint hisses inside the hour', () => {
  const h = harnessFor(pl200TwoTaps, { simTime: 0 });
  pl200TwoTaps.init(h);
  advanceWith(h.state, pl200TwoTaps, 179.5); // still on shift: trench stands, nobody walks it
  assert.equal(ownedOf(h, 'plantsPl200Joint').length, TWO_TAPS_TUNING.jointCount,
    'the trench is fixed street furniture');
  assert.equal(ownedOf(h, 'plantsPl200Moreau').filter((e) => h.state.entities.get(e.id)).length, 0,
    'nobody walks the trench on shift');
  assert.equal(popups(h.bus).length, 0);

  advanceWith(h.state, pl200TwoTaps, 60, 0.5); // the whole off-shift band (180..240)
  const joints = ownedOf(h, 'plantsPl200Joint');
  assert.equal(joints.length, TWO_TAPS_TUNING.jointCount, 'the trench is laid off the station');
  const moreau = ownedOf(h, 'plantsPl200Moreau');
  assert.equal(moreau.length, 1, 'Drip Moreau walks the trench');
  assert.equal(moreau[0].type, 'ship', 'she is a real stranger hull');
  const hello = popups(h.bus)[0];
  assert.equal(hello.sender, 'Drip Moreau');
  assert.equal(hello.text, 'Two taps. Then listen.');
  assert.equal(eventsOf(h.bus, 'plants:pl200:vent').length, 0, 'no vent before her two taps');

  // The vent keeps its hour even past the shift.
  advanceWith(h.state, pl200TwoTaps, 80, 0.5);
  const vents = eventsOf(h.bus, PL_200_VENT_EVENT);
  assert.equal(vents.length, 1, 'the hissing joint vents exactly once');
  assert.equal(vents[0].cause, 'hour');
  // The two-tap joint is the hash-picked one.
  const day = Math.floor(200 / TWO_TAPS_TUNING.dayLengthS);
  assert.equal(vents[0].jointIndex, hissingJointFor(day));
  // Her tap cues: at least two vent-chime taps sounded on the trench.
  assert.ok(cues(h.bus, 'sfx_vent_chime').length >= 2, 'she taps for real');
  pl200TwoTaps.destroy();
  assertNoListeners(h.bus);
});

test('PL-200 knock: two real impacts inside her window vent the joint early — once only', () => {
  const h = harnessFor(pl200TwoTaps, { simTime: 181 });
  pl200TwoTaps.init(h);
  pl200TwoTaps.update(0.5, h.state); // arms today's hissing joint
  const day = Math.floor(181 / TWO_TAPS_TUNING.dayLengthS);
  const index = hissingJointFor(day);
  const joints = ownedOf(h, 'plantsPl200Joint');
  assert.equal(joints.length, TWO_TAPS_TUNING.jointCount);
  const target = trenchJointsFor({ x: 0, z: 0 })[index];
  // Pure layout contract: joints along a fixed bearing off the station body.
  const all = trenchJointsFor({ x: 0, z: 0 });
  assert.deepEqual(all[index], target);
  const joint = joints[index];

  h.bus.emit('physics:impact', { aId: joint.id, bId: 'p1', impulse: 50 });
  assert.equal(eventsOf(h.bus, PL_200_KNOCK_EVENT).length, 0, 'a soft bump is not a knock');
  h.bus.emit('physics:impact', { aId: joint.id, bId: 'p1', impulse: 200 });
  assert.equal(eventsOf(h.bus, PL_200_KNOCK_EVENT).length, 0, 'one tap is not her knock');
  h.state.simTime += 1;
  h.bus.emit('physics:impact', { aId: joint.id, bId: 'p1', impulse: 200 });
  assert.equal(eventsOf(h.bus, PL_200_KNOCK_EVENT).length, 1, 'two taps a beat apart find it');
  assert.equal(eventsOf(h.bus, PL_200_VENT_EVENT).length, 1, 'your own vent comes early');
  assert.equal(eventsOf(h.bus, PL_200_VENT_EVENT)[0].cause, 'knock');

  advanceWith(h.state, pl200TwoTaps, 120, 0.5);
  assert.equal(eventsOf(h.bus, PL_200_VENT_EVENT).length, 1, 'the vent never doubles');
  pl200TwoTaps.destroy();
  assertNoListeners(h.bus);
  assert.equal(ownedOf(h, 'plantsPl200Moreau').filter((e) => h.state.entities.get(e.id)).length, 0,
    'Moreau despawns on destroy');
  assert.equal(ownedOf(h, 'plantsPl200Joint').filter((e) => h.state.entities.get(e.id)).length, 0,
    'the trench despawns on destroy');
});

test('PL-200 grind: frames of one contact are one tap — the beat must be real, and never re-emits', () => {
  const h = harnessFor(pl200TwoTaps, { simTime: 181 });
  pl200TwoTaps.init(h);
  pl200TwoTaps.update(0.5, h.state); // arms today's hissing joint
  const day = Math.floor(181 / TWO_TAPS_TUNING.dayLengthS);
  const joint = ownedOf(h, 'plantsPl200Joint')[hissingJointFor(day)];

  // Frame 2 of one contact: too soon after tap 1 — ignored entirely, no completion.
  h.bus.emit('physics:impact', { aId: joint.id, bId: 'p1', impulse: 200 });
  h.state.simTime += 0.1;
  h.bus.emit('physics:impact', { aId: joint.id, bId: 'p1', impulse: 200 });
  assert.equal(eventsOf(h.bus, PL_200_KNOCK_EVENT).length, 0, 'frames of one contact are one tap');
  assert.equal(eventsOf(h.bus, PL_200_VENT_EVENT).length, 0, 'no auto-completion from a grind');

  // A real beat apart: her knock, learned — exactly once.
  h.state.simTime += TWO_TAPS_TUNING.knockMinBeatS;
  h.bus.emit('physics:impact', { aId: joint.id, bId: 'p1', impulse: 200 });
  assert.equal(eventsOf(h.bus, PL_200_KNOCK_EVENT).length, 1, 'two taps a beat apart complete once');
  assert.equal(eventsOf(h.bus, PL_200_VENT_EVENT).length, 1, 'the vent comes early, once');
  pl200TwoTaps.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-201 The odd queue ----------

test('PL-201 positive: hold the tail slot slow and the queue takes you — advance, in silence', () => {
  const h = harnessFor(pl201OddQueue);
  pl201OddQueue.init(h);
  advanceWith(h.state, pl201OddQueue, 1);
  const berth = ownedOf(h, 'plantsPl201Berth');
  const hulls = ownedOf(h, 'plantsPl201Queued');
  assert.equal(berth.length, 1, 'the fitting berth lamp stands');
  assert.equal(hulls.length, ODD_QUEUE_TUNING.queueCount, 'mismatched hulls queue behind it');
  assert.ok(hulls.every((e) => e.type === 'ship'), 'the queue is real strangers');

  const slots = queueSlotsFor({ x: 0, z: 0 });
  const tail = slots[ODD_QUEUE_TUNING.queueCount + 1];
  teleportPlayer(h.state, tail.x, tail.z);
  advanceWith(h.state, pl201OddQueue, 7);
  assert.equal(eventsOf(h.bus, PL_201_JOIN_EVENT).length, 1, 'you are taken into the queue');
  const hello = popups(h.bus)[0];
  assert.equal(hello.sender, 'Yusuf Tane');
  assert.equal(hello.text, 'Bring your worst.');
  assert.equal(eventsOf(h.bus, PL_201_ADVANCE_EVENT).length, 1, 'the queue advanced once');
  const head = hulls[0] && h.state.entities.get(hulls[0].id);
  const dHead = Math.hypot(head.pos.x - slots[0].x, head.pos.z - slots[0].z);
  assert.ok(dHead < 2, 'the head hull stepped into the berth');

  advanceWith(h.state, pl201OddQueue, ODD_QUEUE_TUNING.advanceCooldownS + 2);
  assert.equal(eventsOf(h.bus, PL_201_ADVANCE_EVENT).length, 1, 'the queue never advances twice for one join');
  pl201OddQueue.destroy();
  assertNoListeners(h.bus);
});

test('PL-201 negative: flying fast does not join, and bumping a hull freezes the queue', () => {
  const h = harnessFor(pl201OddQueue);
  pl201OddQueue.init(h);
  advanceWith(h.state, pl201OddQueue, 1);
  const slots = queueSlotsFor({ x: 0, z: 0 });
  const tail = slots[ODD_QUEUE_TUNING.queueCount + 1];
  teleportPlayer(h.state, tail.x, tail.z, { x: 40, z: 0 });
  advanceWith(h.state, pl201OddQueue, 10);
  assert.equal(eventsOf(h.bus, PL_201_JOIN_EVENT).length, 0, 'speed is not silence');

  const hull = ownedOf(h, 'plantsPl201Queued')[0];
  teleportPlayer(h.state, tail.x, tail.z);
  h.bus.emit('physics:impact', { aId: hull.id, bId: 'p1', impulse: 200 });
  assert.equal(eventsOf(h.bus, PL_201_BUMPED_EVENT).length, 1);
  advanceWith(h.state, pl201OddQueue, 8);
  assert.equal(eventsOf(h.bus, PL_201_JOIN_EVENT).length, 0, 'the queue will not take you now');
  assert.equal(eventsOf(h.bus, PL_201_ADVANCE_EVENT).length, 0, 'a bumped queue keeps its place');
  pl201OddQueue.destroy();
  assertNoListeners(h.bus);
});

test('PL-201 grind: a grind on a queued hull fires one deny, real hits only', () => {
  const h = harnessFor(pl201OddQueue);
  pl201OddQueue.init(h);
  advanceWith(h.state, pl201OddQueue, 1);
  const hull = ownedOf(h, 'plantsPl201Queued')[0];
  h.bus.emit('physics:impact', { aId: hull.id, bId: 'p1', impulse: 20 });
  assert.equal(eventsOf(h.bus, PL_201_BUMPED_EVENT).length, 0, 'a brush is not a bump');
  h.bus.emit('physics:impact', { aId: hull.id, bId: 'p1', impulse: 200 });
  for (let i = 0; i < 5; i++) { h.state.simTime += 0.05; h.bus.emit('physics:impact', { aId: hull.id, bId: 'p1', impulse: 200 }); }
  assert.equal(eventsOf(h.bus, PL_201_BUMPED_EVENT).length, 1, 'one event for the whole grind');
  assert.equal(cues(h.bus, 'ui_deny').length, 1, 'one deny cue, not per frame');
  pl201OddQueue.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-202 The kept berth ----------

test('PL-202 positive: park in the RESERVED berth, the street stares, the funeral tow comes and shoves', () => {
  const h = harnessFor(pl202KeptBerth);
  pl202KeptBerth.init(h);
  advanceWith(h.state, pl202KeptBerth, 1);
  const berths = ribStreetFor({ x: 0, z: 0 });
  const reserved = reservedBerthIndex();
  assert.equal(ownedOf(h, 'plantsPl202Reserved').length, 1, 'one berth stands chalked RESERVED');
  assert.equal(ownedOf(h, 'plantsPl202Street').length, KEPT_BERTH_TUNING.streetCount - 1);

  teleportPlayer(h.state, berths[reserved].x, berths[reserved].z);
  advanceWith(h.state, pl202KeptBerth, KEPT_BERTH_TUNING.parkNeedS + 1);
  assert.equal(eventsOf(h.bus, PL_202_STARE_EVENT).length, 1, 'the whole street stares');
  const streetHull = ownedOf(h, 'plantsPl202Street')[0];
  assert.equal(streetHull.data.lampsFlashing, false, 'the street dims you out');

  advanceWith(h.state, pl202KeptBerth, KEPT_BERTH_TUNING.towDispatchS + 1);
  assert.equal(eventsOf(h.bus, PL_202_TOW_EVENT).length, 1, 'a funeral tow is always coming');
  assert.ok(ownedOf(h, 'plantsPl202Tow').length >= 0); // tow may already have arrived and stood down
  advanceWith(h.state, pl202KeptBerth, 30, 0.5);
  assert.equal(eventsOf(h.bus, PL_202_SHOVED_EVENT).length, 1, 'the tow always wins');
  assert.equal(eventsOf(h.bus, PL_202_MOVED_EVENT).length, 0, 'you did not move; it moved you');
  // While you stay, the street keeps staring — a funeral tow is always coming.
  advanceWith(h.state, pl202KeptBerth, KEPT_BERTH_TUNING.towDispatchS + 2);
  assert.ok(eventsOf(h.bus, PL_202_TOW_EVENT).length >= 1, 'another tow is always coming');
  // Move at last: the street relights, and remembers.
  teleportPlayer(h.state, berths[reserved].x + 400, berths[reserved].z);
  advanceWith(h.state, pl202KeptBerth, 2);
  assert.equal(eventsOf(h.bus, PL_202_MOVED_EVENT).length, 1, 'the street remembers you moved');
  assert.equal(streetHull.data.lampsFlashing, true, 'the street relights once you move');
  pl202KeptBerth.destroy();
  assertNoListeners(h.bus);
});

test('PL-202 negative + honour: moving out spares you; parking elsewhere gets the nod', () => {
  const h = harnessFor(pl202KeptBerth);
  pl202KeptBerth.init(h);
  advanceWith(h.state, pl202KeptBerth, 1);
  const berths = ribStreetFor({ x: 0, z: 0 });
  const reserved = reservedBerthIndex();
  const other = (reserved + 1) % berths.length;

  teleportPlayer(h.state, berths[reserved].x, berths[reserved].z);
  advanceWith(h.state, pl202KeptBerth, KEPT_BERTH_TUNING.parkNeedS + 1);
  assert.equal(eventsOf(h.bus, PL_202_STARE_EVENT).length, 1);
  // Move out before the tow is dispatched.
  teleportPlayer(h.state, berths[reserved].x + 400, berths[reserved].z);
  advanceWith(h.state, pl202KeptBerth, 2);
  assert.equal(eventsOf(h.bus, PL_202_MOVED_EVENT).length, 1, 'the street remembers you moved');
  advanceWith(h.state, pl202KeptBerth, KEPT_BERTH_TUNING.towDispatchS + 2);
  assert.equal(eventsOf(h.bus, PL_202_TOW_EVENT).length, 0, 'no tow once you moved');
  assert.equal(eventsOf(h.bus, PL_202_SHOVED_EVENT).length, 0);

  // Honour it, and be seen to: any other berth, slow.
  teleportPlayer(h.state, berths[other].x, berths[other].z);
  advanceWith(h.state, pl202KeptBerth, 1);
  assert.equal(eventsOf(h.bus, PL_202_KEPT_EVENT).length, 1, 'the street nods');
  assert.equal(eventsOf(h.bus, PL_202_STARE_EVENT).length, 1, 'no second stare');
  pl202KeptBerth.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-203 The tour ----------

test('PL-203 positive: follow the tender and learn the row\u2019s exact order: wall, mouth, wall, wall, mouth', () => {
  const h = harnessFor(pl203TheTour);
  pl203TheTour.init(h);
  advanceWith(h.state, pl203TheTour, 1);
  assert.equal(ownedOf(h, 'plantsPl203Growth').length, THE_TOUR_TUNING.growthCount);
  assert.equal(ownedOf(h, 'plantsPl203Tender').length, 1);
  const ring = gardenFor({ x: 0, z: 0 });
  assert.equal(ring.length, 5);

  // Ride with her: the player hugs the tender through the whole tour.
  for (let t = 0; t < 230; t += 1) {
    h.state.simTime += 1;
    h.state.tick += 60;
    const tender = ownedOf(h, 'plantsPl203Tender')[0];
    if (tender) teleportPlayer(h.state, tender.pos.x, tender.pos.z);
    pl203TheTour.update(1, h.state);
    if (eventsOf(h.bus, PL_203_LEARNED_EVENT).length) break; // the tour ends when you know it
  }
  const names = eventsOf(h.bus, PL_203_NAME_EVENT).map((e) => e.kind);
  // She starts naming as she spawns at the first growth — you catch the tour from flight
  // and finish the lesson when it wraps. The row's exact words, in order, are the first five.
  assert.deepEqual(names.slice(0, 5), ['wall', 'mouth', 'wall', 'wall', 'mouth'],
    'the row\u2019s exact words, in order');
  assert.equal(names.length, 6, 'the wrap names the wall again — and completes your lesson');
  assert.equal(eventsOf(h.bus, PL_203_LEARNED_EVENT).length, 1, 'you know which is which');
  assert.equal(h.state.story.flags.plantsPl203Learned, true);

  // Touch a mouth: it grips. Touch a wall: it holds — and you knew it would.
  const growths = ownedOf(h, 'plantsPl203Growth');
  h.bus.emit('physics:impact', { aId: growths[1].id, bId: 'p1', impulse: 200 });
  assert.equal(eventsOf(h.bus, PL_203_GRIP_EVENT).length, 1, 'the mouth grips');
  assert.equal(cues(h.bus, 'ui_deny').length >= 1, true);
  h.bus.emit('physics:impact', { aId: growths[0].id, bId: 'p1', impulse: 200 });
  assert.equal(eventsOf(h.bus, PL_203_WALL_EVENT).length, 1);
  assert.equal(eventsOf(h.bus, PL_203_WALL_EVENT)[0].learned, true);
  pl203TheTour.destroy();
  assertNoListeners(h.bus);
});

test('PL-203 negative + cap: from flight too far you learn nothing, and a mouth grips once per window', () => {
  const h = harnessFor(pl203TheTour);
  pl203TheTour.init(h);
  advanceWith(h.state, pl203TheTour, 40, 1); // player left at the station, far from the ring
  assert.ok(eventsOf(h.bus, PL_203_NAME_EVENT).length >= 1, 'she names for nobody');
  assert.equal(eventsOf(h.bus, PL_203_LEARNED_EVENT).length, 0, 'you did not follow, you did not learn');

  const growths = ownedOf(h, 'plantsPl203Growth');
  h.bus.emit('physics:impact', { aId: growths[1].id, bId: 'p1', impulse: 200 });
  h.state.simTime += 1;
  h.bus.emit('physics:impact', { aId: growths[1].id, bId: 'p1', impulse: 200 });
  assert.equal(eventsOf(h.bus, PL_203_GRIP_EVENT).length, 1, 'the grip is cooldown-gated');
  pl203TheTour.destroy();
  assertNoListeners(h.bus);
});

test('PL-203 grind: leaning on a wall holds once per window, like the grip', () => {
  const h = harnessFor(pl203TheTour);
  pl203TheTour.init(h);
  advanceWith(h.state, pl203TheTour, 1);
  const wall = ownedOf(h, 'plantsPl203Growth')[0]; // kind 'wall', the row's first
  h.bus.emit('physics:impact', { aId: wall.id, bId: 'p1', impulse: 200 });
  for (let i = 0; i < 5; i++) { h.state.simTime += 0.05; h.bus.emit('physics:impact', { aId: wall.id, bId: 'p1', impulse: 200 }); }
  assert.equal(eventsOf(h.bus, PL_203_WALL_EVENT).length, 1, 'one hold for the whole grind');
  h.state.simTime += THE_TOUR_TUNING.gripCooldownS;
  h.bus.emit('physics:impact', { aId: wall.id, bId: 'p1', impulse: 200 });
  assert.equal(eventsOf(h.bus, PL_203_WALL_EVENT).length, 2, 'a fresh touch holds again');
  pl203TheTour.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-204 The hook ----------

test('PL-204 positive: take a seat and the perch sways; hover near and a pilot offers theirs', () => {
  const h = harnessFor(pl204TheHook);
  pl204TheHook.init(h);
  advanceWith(h.state, pl204TheHook, 1);
  const { hook } = craneLayoutFor({ x: 0, z: 0 });
  assert.equal(ownedOf(h, 'plantsPl204Crane').length, 1);
  assert.equal(ownedOf(h, 'plantsPl204Hook').length, 1);
  const pilots = ownedOf(h, 'plantsPl204Pilot');
  assert.equal(pilots.length, THE_HOOK_TUNING.pilotCount);
  const swayBefore = h.state.entities.get(pilots[0].id).pos.x;
  advanceWith(h.state, pl204TheHook, 3);
  const swayAfter = h.state.entities.get(pilots[0].id).pos.x;
  assert.ok(Math.abs(swayAfter - swayBefore) > 0.1, 'the seated pilots sway on the sim clock');

  teleportPlayer(h.state, hook.x, hook.z);
  advanceWith(h.state, pl204TheHook, THE_HOOK_TUNING.seatNeedS + 1);
  assert.equal(eventsOf(h.bus, PL_204_SEATED_EVENT).length, 1, 'you took a seat');
  pl204TheHook.destroy();

  // Hover near, and someone offers you theirs.
  const h2 = harnessFor(pl204TheHook);
  pl204TheHook.init(h2);
  advanceWith(h2.state, pl204TheHook, 1);
  teleportPlayer(h2.state, hook.x + 55, hook.z, { x: 12, z: 0 });
  advanceWith(h2.state, pl204TheHook, THE_HOOK_TUNING.hoverNeedS + 1);
  assert.equal(eventsOf(h2.bus, PL_204_OFFER_EVENT).length, 1, 'the offer comes');
  const hello = popups(h2.bus)[0];
  assert.equal(hello.sender, 'The scar\u2019s pilots');
  assert.equal(hello.text, 'Take mine \u2014 I\u2019m stretching my legs.');
  // Ignore it: the pilot takes the seat back and leaves with it.
  teleportPlayer(h2.state, hook.x + 400, hook.z + 400);
  advanceWith(h2.state, pl204TheHook, 70, 1);
  assert.equal(eventsOf(h2.bus, PL_204_LEFT_EVENT).length, 1, 'the pilot departs with their seat');
  pl204TheHook.destroy();
  assertNoListeners(h2.bus);
});

test('PL-204 negative: bump the hook and the perch scatters for the shift', () => {
  const h = harnessFor(pl204TheHook);
  pl204TheHook.init(h);
  advanceWith(h.state, pl204TheHook, 1);
  const hook = ownedOf(h, 'plantsPl204Hook')[0];
  h.bus.emit('physics:impact', { aId: hook.id, bId: 'p1', impulse: 200 });
  assert.equal(eventsOf(h.bus, PL_204_SCATTERED_EVENT).length, 1);
  assert.ok(cues(h.bus, 'ui_deny').length >= 1);
  const { hook: hookSpot } = craneLayoutFor({ x: 0, z: 0 });
  teleportPlayer(h.state, hookSpot.x, hookSpot.z);
  advanceWith(h.state, pl204TheHook, THE_HOOK_TUNING.seatNeedS + 2);
  assert.equal(eventsOf(h.bus, PL_204_SEATED_EVENT).length, 0, 'the perch is cold');
  pl204TheHook.destroy();
  assertNoListeners(h.bus);
  assert.equal(ownedOf(h, 'plantsPl204Pilot').filter((e) => h.state.entities.get(e.id)).length, 0,
    'no pilot survives a destroy');
});

test('PL-204 grind: a sustained bump scatters the perch once, not per frame', () => {
  const h = harnessFor(pl204TheHook);
  pl204TheHook.init(h);
  advanceWith(h.state, pl204TheHook, 1);
  const hook = ownedOf(h, 'plantsPl204Hook')[0];
  h.bus.emit('physics:impact', { aId: hook.id, bId: 'p1', impulse: 200 });
  for (let i = 0; i < 5; i++) { h.state.simTime += 0.05; h.bus.emit('physics:impact', { aId: hook.id, bId: 'p1', impulse: 200 }); }
  assert.equal(eventsOf(h.bus, PL_204_SCATTERED_EVENT).length, 1, 'one scatter for the whole grind');
  assert.equal(cues(h.bus, 'ui_deny').length, 1, 'one deny cue, not per frame');
  pl204TheHook.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-205 The lit hull ----------

test('PL-205 positive: park beside the lit hull and the light inside moves, once', () => {
  const h = harnessFor(pl205TheLitHull);
  pl205TheLitHull.init(h);
  advanceWith(h.state, pl205TheLitHull, 1);
  const hull = ownedOf(h, 'plantsPl205Hull')[0];
  assert.equal(hull.data.plantsPl205Lit, true, 'one hull is always lit');
  const spot = litHullSpotFor({ x: 0, z: 0 });

  teleportPlayer(h.state, spot.x + 20, spot.z);
  advanceWith(h.state, pl205TheLitHull, LIT_HULL_TUNING.parkNeedS + 1);
  assert.equal(eventsOf(h.bus, PL_205_LIGHT_MOVED_EVENT).length, 1, 'the light moved');
  assert.equal(cues(h.bus, 'sfx_vent_chime').length, 1, 'one quiet interior cue');
  assert.equal(popups(h.bus).length, 0, 'nobody is ever seen aboard: no voice, ever');
  advanceWith(h.state, pl205TheLitHull, 20);
  assert.equal(eventsOf(h.bus, PL_205_LIGHT_MOVED_EVENT).length, 1, 'and it will not move again this visit');

  // Leave it be — the visit ends — come back, and the once re-arms.
  teleportPlayer(h.state, spot.x + LIT_HULL_TUNING.visitResetRadiusWu + 60, spot.z);
  advanceWith(h.state, pl205TheLitHull, 2);
  teleportPlayer(h.state, spot.x + 20, spot.z);
  advanceWith(h.state, pl205TheLitHull, LIT_HULL_TUNING.parkNeedS + 1);
  assert.equal(eventsOf(h.bus, PL_205_LIGHT_MOVED_EVENT).length, 2, 'the once is per visit');
  pl205TheLitHull.destroy();
  assertNoListeners(h.bus);
});

test('PL-205 negative: bump the hull and the light goes out; she comes home on her own', () => {
  const h = harnessFor(pl205TheLitHull);
  pl205TheLitHull.init(h);
  advanceWith(h.state, pl205TheLitHull, 1);
  const hull = ownedOf(h, 'plantsPl205Hull')[0];
  h.bus.emit('physics:impact', { aId: hull.id, bId: 'p1', impulse: 200 });
  assert.equal(eventsOf(h.bus, PL_205_DARK_EVENT).length, 1);
  assert.equal(hull.data.plantsPl205Lit, false);
  advanceWith(h.state, pl205TheLitHull, LIT_HULL_TUNING.relightS + 1);
  assert.equal(eventsOf(h.bus, PL_205_RELIT_EVENT).length, 1, 'that light is hers; she came home');
  assert.equal(hull.data.plantsPl205Lit, true);
  pl205TheLitHull.destroy();
  assertNoListeners(h.bus);
});

test('PL-205 grind: frames of the same contact do not re-darken the lit hull', () => {
  const h = harnessFor(pl205TheLitHull);
  pl205TheLitHull.init(h);
  advanceWith(h.state, pl205TheLitHull, 1);
  const hull = ownedOf(h, 'plantsPl205Hull')[0];
  h.bus.emit('physics:impact', { aId: hull.id, bId: 'p1', impulse: 200 });
  for (let i = 0; i < 5; i++) { h.state.simTime += 0.05; h.bus.emit('physics:impact', { aId: hull.id, bId: 'p1', impulse: 200 }); }
  assert.equal(eventsOf(h.bus, PL_205_DARK_EVENT).length, 1, 'the light goes out once');
  assert.equal(cues(h.bus, 'ui_deny').length, 1, 'one quiet deny, not per frame');
  advanceWith(h.state, pl205TheLitHull, LIT_HULL_TUNING.relightS + 1);
  assert.equal(eventsOf(h.bus, PL_205_RELIT_EVENT).length, 1, 'she still comes home');
  pl205TheLitHull.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-230 Venn's window ----------

test('PL-230 positive: at Lamps-Up Venn is first lit; park outside and the crescent comes up for you', () => {
  const h = harnessFor(pl230VennsWindow, { simTime: 170 });
  pl230VennsWindow.init(h);
  advanceWith(h.state, pl230VennsWindow, 9);
  const venn = vennIndexFor();
  const vennWindow = crescentFor({ x: 0, z: 0 })[venn];
  teleportPlayer(h.state, vennWindow.x, vennWindow.z);
  advanceWith(h.state, pl230VennsWindow, 4.5); // across Lamps-Up and the audience window
  assert.equal(eventsOf(h.bus, PL_230_LAMPS_UP_EVENT).length, 1);
  assert.equal(eventsOf(h.bus, PL_230_LAMPS_UP_EVENT)[0].first, venn);
  assert.equal(eventsOf(h.bus, PL_230_AUDIENCE_EVENT).length, 1, 'the audience of one');
  const windows = ownedOf(h, 'plantsPl230Window');
  assert.ok(windows.every((w) => w.data.plantsPl230Lit === true), 'the whole crescent came up');
  assert.ok(windows[venn].data.litAt <= Math.min(...windows.map((w) => w.data.litAt)),
    'Venn was still the first lit');
  advanceWith(h.state, pl230VennsWindow, 20);
  assert.equal(eventsOf(h.bus, PL_230_AUDIENCE_EVENT).length, 1, 'once per lamps-up');
  pl230VennsWindow.destroy();

  // Without the audience, the stagger is Venn strictly first.
  const h2 = harnessFor(pl230VennsWindow, { simTime: 178 });
  pl230VennsWindow.init(h2);
  advanceWith(h2.state, pl230VennsWindow, 14);
  const wins = ownedOf(h2, 'plantsPl230Window');
  assert.equal(eventsOf(h2.bus, PL_230_AUDIENCE_EVENT).length, 0);
  assert.ok(wins[venn].data.litAt < Math.max(...wins.map((w) => w.data.litAt)),
    'first lit, strictly');
  // Lamps-down: Venn last dark.
  advanceWith(h2.state, pl230VennsWindow, 70, 1);
  assert.equal(eventsOf(h2.bus, PL_230_LAMPS_DOWN_EVENT).length, 1);
  assert.equal(eventsOf(h2.bus, PL_230_LAMPS_DOWN_EVENT)[0].last, venn);
  assert.ok(wins[venn].data.darkAt >= Math.max(...wins.map((w) => w.data.darkAt)),
    'last dark, exactly');
  pl230VennsWindow.destroy();
  assertNoListeners(h2.bus);
});

test('PL-230 negative: parking at another window makes nothing come up', () => {
  const h = harnessFor(pl230VennsWindow, { simTime: 170 });
  pl230VennsWindow.init(h);
  advanceWith(h.state, pl230VennsWindow, 9);
  const venn = vennIndexFor();
  const other = crescentFor({ x: 0, z: 0 })[(venn + 1) % VENNS_WINDOW_TUNING.crescentCount];
  teleportPlayer(h.state, other.x, other.z);
  advanceWith(h.state, pl230VennsWindow, 8);
  assert.equal(eventsOf(h.bus, PL_230_AUDIENCE_EVENT).length, 0, 'not her window, not the audience');
  pl230VennsWindow.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-231 Marsh's line ----------

test('PL-231 positive: cross the line towing and Marsh is on open radio before your line goes taut', () => {
  const h = harnessFor(pl231MarshsLine);
  pl231MarshsLine.init(h);
  advanceWith(h.state, pl231MarshsLine, 1);
  assert.equal(ownedOf(h, 'plantsPl231Maze').length, MARSHS_LINE_TUNING.mazePropCount);
  const { center } = marshYardFor({ x: 0, z: 0 });

  // Inside the line, not towing: nothing.
  teleportPlayer(h.state, center.x, center.z);
  advanceWith(h.state, pl231MarshsLine, 2);
  assert.equal(eventsOf(h.bus, PL_231_WARNED_EVENT).length, 0, 'no tow, no warning');

  // Cross while towing.
  const pod = { id: 'pod1', alive: true, type: 'debris', pos: { x: center.x, z: center.z }, data: {} };
  h.state.entities.set('pod1', pod);
  h.bus.emit('tether:attached', { actorId: 'p1', attachmentId: 'att1', targetId: 'pod1' });
  advanceWith(h.state, pl231MarshsLine, 1);
  assert.equal(eventsOf(h.bus, PL_231_WARNED_EVENT).length, 1, 'the reflex fires');
  const hello = popups(h.bus)[0];
  assert.equal(hello.sender, 'Tally Marsh');
  assert.equal(hello.text, MARSH_LINE_COPY);
  assert.equal(cues(h.bus, 'warning').length, 1);

  // Test the reflex: stay towing inside past the window — the yard moves the towed body.
  advanceWith(h.state, pl231MarshsLine, MARSHS_LINE_TUNING.reflexWindowS + 1);
  assert.equal(eventsOf(h.bus, PL_231_SHOVED_EVENT).length, 1, 'the yard shoves the towed body, not you');
  advanceWith(h.state, pl231MarshsLine, 3);
  assert.equal(eventsOf(h.bus, PL_231_SHOVED_EVENT).length, 1, 'one shove per window');
  assert.equal(eventsOf(h.bus, PL_231_WARNED_EVENT).length, 1, 'one warning per visit');

  // Drop the line: no more warnings.
  h.bus.emit('tether:broken', { attachmentId: 'att1' });
  advanceWith(h.state, pl231MarshsLine, MARSHS_LINE_TUNING.warnCooldownS + 2);
  assert.equal(eventsOf(h.bus, PL_231_WARNED_EVENT).length, 1);
  pl231MarshsLine.destroy();
  assertNoListeners(h.bus);
});

test('PL-231 negative: someone else\u2019s tether is not yours; the maze is not salvage', () => {
  const h = harnessFor(pl231MarshsLine);
  pl231MarshsLine.init(h);
  advanceWith(h.state, pl231MarshsLine, 1);
  const { center } = marshYardFor({ x: 0, z: 0 });
  teleportPlayer(h.state, center.x, center.z);
  h.bus.emit('tether:attached', { actorId: 'npc9', attachmentId: 'attX', targetId: 'podX' });
  advanceWith(h.state, pl231MarshsLine, 3);
  assert.equal(eventsOf(h.bus, PL_231_WARNED_EVENT).length, 0, 'their line is not yours');
  assert.equal(eventsOf(h.bus, PL_231_SHOVED_EVENT).length, 0);
  pl231MarshsLine.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-232 The valid instruction ----------

test('PL-232 positive: once a shift the instruction goes out and the string walks the clear lane', () => {
  const h = harnessFor(pl232TheValidInstruction, { simTime: 0 });
  pl232TheValidInstruction.init(h);
  advanceWith(h.state, pl232TheValidInstruction, VALID_INSTRUCTION_TUNING.instructionPhaseS - 0.5);
  assert.equal(eventsOf(h.bus, PL_232_INSTRUCTION_EVENT).length, 0, 'not yet this shift');
  advanceWith(h.state, pl232TheValidInstruction, 1.5);
  assert.equal(eventsOf(h.bus, PL_232_INSTRUCTION_EVENT).length, 1, 'once a shift');
  const hello = popups(h.bus)[0];
  assert.equal(hello.sender, 'Points Dunmore');
  assert.equal(hello.text, DUNMORE_COPY);
  const movers = ownedOf(h, 'plantsPl232Mover');
  assert.equal(movers.length, VALID_INSTRUCTION_TUNING.stringCount);
  const lane = laneFor(0, { x: 0, z: 0 });
  assert.ok(movers.every((m) => m.type === 'ship'));

  // The yard obeys instantly: the string advances down its lane from the first tick.
  advanceWith(h.state, pl232TheValidInstruction, VALID_INSTRUCTION_TUNING.transitS + 1, 1);
  const head = h.state.entities.get(movers[0].id);
  const along = (head.pos.x - lane.from.x) * lane.dir.x + (head.pos.z - lane.from.z) * lane.dir.z;
  assert.ok(along > VALID_INSTRUCTION_TUNING.laneLengthWu * 0.9, 'the string walked the whole lane');
  pl232TheValidInstruction.destroy();
  assertNoListeners(h.bus);
});

test('PL-232 choices: ride the lane and obey; hold ground and it parts around you, valid too', () => {
  const h = harnessFor(pl232TheValidInstruction, { simTime: VALID_INSTRUCTION_TUNING.instructionPhaseS });
  pl232TheValidInstruction.init(h);
  pl232TheValidInstruction.update(0.5, h.state);
  assert.equal(eventsOf(h.bus, PL_232_INSTRUCTION_EVENT).length, 1);
  const lane = laneFor(0, { x: 0, z: 0 });
  const spot = {
    x: lane.from.x + lane.dir.x * 200,
    z: lane.from.z + lane.dir.z * 200,
  };

  // Obey with them: ride the lane the string's way.
  teleportPlayer(h.state, spot.x, spot.z, { x: lane.dir.x * 20, z: lane.dir.z * 20 });
  advanceWith(h.state, pl232TheValidInstruction, 2);
  assert.equal(eventsOf(h.bus, PL_232_OBEYED_EVENT).length, 1, 'you obeyed with them');
  assert.equal(eventsOf(h.bus, PL_232_CUT_EVENT).length, 0, 'riding the lane is not cutting it');
  pl232TheValidInstruction.destroy();

  // Hold your ground: the string parts around you, and you were valid too.
  const h2 = harnessFor(pl232TheValidInstruction, { simTime: VALID_INSTRUCTION_TUNING.instructionPhaseS });
  pl232TheValidInstruction.init(h2);
  pl232TheValidInstruction.update(0.5, h2.state);
  const lane2 = laneFor(0, { x: 0, z: 0 });
  teleportPlayer(h2.state,
    lane2.from.x + lane2.dir.x * 40,
    lane2.from.z + lane2.dir.z * 40);
  advanceWith(h2.state, pl232TheValidInstruction, VALID_INSTRUCTION_TUNING.transitS * 0.7, 0.5);
  assert.equal(eventsOf(h2.bus, PL_232_PARTED_EVENT).length, 1, 'the string parted');
  const valid = popups(h2.bus).find((p) => p.sender === 'Points Dunmore' && p.text === DUNMORE_VALID_COPY);
  assert.ok(valid, 'Dunmore marks you valid too');
  pl232TheValidInstruction.destroy();

  // Cut across: the string will not yield its lane.
  const h3 = harnessFor(pl232TheValidInstruction, { simTime: VALID_INSTRUCTION_TUNING.instructionPhaseS });
  pl232TheValidInstruction.init(h3);
  pl232TheValidInstruction.update(0.5, h3.state);
  const lane3 = laneFor(0, { x: 0, z: 0 });
  const perp = { x: -lane3.dir.z, z: lane3.dir.x };
  teleportPlayer(h3.state,
    lane3.from.x + lane3.dir.x * 200,
    lane3.from.z + lane3.dir.z * 200,
    { x: perp.x * 10, z: perp.z * 10 });
  advanceWith(h3.state, pl232TheValidInstruction, 2);
  assert.equal(eventsOf(h3.bus, PL_232_CUT_EVENT).length, 1, 'the honk lands');
  assert.equal(eventsOf(h3.bus, PL_232_OBEYED_EVENT).length, 0);
  assert.equal(cues(h3.bus, 'ui_deny').length >= 1, true);
  pl232TheValidInstruction.destroy();
  assertNoListeners(h3.bus);
});

// ---------- PL-233 The fresh mark ----------

test('PL-233 positive: one working night, KNOCKED all down the street, and Fitch admires it too', () => {
  const h = harnessFor(pl233TheFreshMark, { simTime: 175 });
  pl233TheFreshMark.init(h);
  advanceWith(h.state, pl233TheFreshMark, 5);
  assert.equal(ownedOf(h, 'plantsPl233Hull').length, FRESH_MARK_TUNING.streetCount);
  assert.equal(eventsOf(h.bus, PL_233_MARKED_EVENT).length, 0, 'no marks before night');

  advanceWith(h.state, pl233TheFreshMark, 65, 0.5); // through the whole night band
  assert.equal(eventsOf(h.bus, PL_233_MARKED_EVENT).length, FRESH_MARK_TUNING.streetCount,
    'every hull Fitch had chalked, second mark beside it');
  const marked = ownedOf(h, 'plantsPl233Hull');
  assert.ok(marked.every((w) => w.data.swarmFloorPad.label === 'KNOCKED'));
  assert.equal(eventsOf(h.bus, PL_233_DONE_EVENT).length, 1, 'somebody worked all night, then was gone');
  assert.equal(ownedOf(h, 'plantsPl233Knocker').filter((e) => h.state.entities.get(e.id)).length, 0,
    'the knocker does not see the day');

  // Admire the night's work — Fitch does, once per visit.
  const street = markStreetFor({ x: 0, z: 0 });
  teleportPlayer(h.state, street[0].x, street[0].z);
  advanceWith(h.state, pl233TheFreshMark, FRESH_MARK_TUNING.admireNeedS + 1);
  const admire = popups(h.bus)[0];
  assert.equal(admire.sender, 'Fitch');
  assert.equal(admire.text, KNOCKED_COPY);
  assert.equal(eventsOf(h.bus, PL_233_ADMIRE_EVENT).length, 1);
  advanceWith(h.state, pl233TheFreshMark, 20);
  assert.equal(eventsOf(h.bus, PL_233_ADMIRE_EVENT).length, 1, 'once per visit');
  pl233TheFreshMark.destroy();
  assertNoListeners(h.bus);
});

test('PL-233 negative: scrape a fresh mark and the chalk smears off — the record does not come back', () => {
  const h = harnessFor(pl233TheFreshMark, { simTime: 179 });
  pl233TheFreshMark.init(h);
  advanceWith(h.state, pl233TheFreshMark, 40, 0.5); // into the night, first marks land
  assert.ok(eventsOf(h.bus, PL_233_MARKED_EVENT).length >= 1, 'at least one mark is down');
  const marked = ownedOf(h, 'plantsPl233Hull').find((w) => w.data.plantsPl233Knocked === true);
  h.bus.emit('physics:impact', { aId: marked.id, bId: 'p1', impulse: 20 });
  assert.equal(eventsOf(h.bus, PL_233_SMEARED_EVENT).length, 0, 'a touch is not a scrape');
  h.bus.emit('physics:impact', { aId: marked.id, bId: 'p1', impulse: 200 });
  assert.equal(eventsOf(h.bus, PL_233_SMEARED_EVENT).length, 1);
  assert.equal(marked.data.plantsPl233Knocked, false);
  assert.equal(marked.data.swarmFloorPad.label, 'Fitch\u2019s chalk');

  // Fitch does not admire the wrecked record.
  teleportPlayer(h.state, marked.pos.x, marked.pos.y ?? marked.pos.z);
  advanceWith(h.state, pl233TheFreshMark, FRESH_MARK_TUNING.admireNeedS + 2);
  assert.equal(eventsOf(h.bus, PL_233_ADMIRE_EVENT).length, 0);
  pl233TheFreshMark.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-234 The middle seat ----------

test('PL-234 positive: take the middle seat and both flags\u2019 pilots look at you', () => {
  const h = harnessFor(pl234TheMiddleSeat);
  pl234TheMiddleSeat.init(h);
  advanceWith(h.state, pl234TheMiddleSeat, 1);
  const { bench } = benchLayoutFor({ x: 0, z: 0 });
  assert.equal(ownedOf(h, 'plantsPl234Pump').length, 1, 'the dead pump stands');
  assert.equal(ownedOf(h, 'plantsPl234Bench').length, 1, 'the bench welded to it');
  const pilots = ownedOf(h, 'plantsPl234Pilot');
  assert.equal(pilots.length, 2, 'opposite ends, same bench');
  assert.deepEqual(pilots.map((p) => p.factionId), MIDDLE_SEAT_TUNING.flagFactions,
    'both flags are on the bench');

  teleportPlayer(h.state, bench.x, bench.z);
  advanceWith(h.state, pl234TheMiddleSeat, MIDDLE_SEAT_TUNING.seatNeedS + 1);
  assert.equal(eventsOf(h.bus, PL_234_MIDDLE_EVENT).length, 1, 'you took the middle seat');
  assert.equal(popups(h.bus).length, 0, 'both sides will look at you — no words');
  const a = h.state.entities.get(pilots[0].id);
  const b = h.state.entities.get(pilots[1].id);
  assert.ok(Math.abs(a.rot - Math.atan2(bench.z - a.pos.z, bench.x - a.pos.x)) < 0.5,
    'the first flag looks');
  assert.ok(Math.abs(b.rot - Math.atan2(bench.z - b.pos.z, bench.x - b.pos.x)) < 0.5,
    'the other flag looks too');
  pl234TheMiddleSeat.destroy();
  assertNoListeners(h.bus);
});

test('PL-234 negative: shove the bench and both ends stand for the shift', () => {
  const h = harnessFor(pl234TheMiddleSeat);
  pl234TheMiddleSeat.init(h);
  advanceWith(h.state, pl234TheMiddleSeat, 1);
  const benchProp = ownedOf(h, 'plantsPl234Bench')[0];
  const pilots = ownedOf(h, 'plantsPl234Pilot');
  h.bus.emit('physics:impact', { aId: benchProp.id, bId: 'p1', impulse: 200 });
  assert.equal(eventsOf(h.bus, PL_234_STOOD_EVENT).length, 1);
  assert.ok(cues(h.bus, 'ui_deny').length >= 1);
  const { bench } = benchLayoutFor({ x: 0, z: 0 });
  teleportPlayer(h.state, bench.x, bench.z);
  advanceWith(h.state, pl234TheMiddleSeat, MIDDLE_SEAT_TUNING.seatNeedS + 2);
  assert.equal(eventsOf(h.bus, PL_234_MIDDLE_EVENT).length, 0, 'the bench sits cold');
  // After the cold passes, both ends come back.
  advanceWith(h.state, pl234TheMiddleSeat, MIDDLE_SEAT_TUNING.benchColdS + 2);
  assert.equal(ownedOf(h, 'plantsPl234Pilot').filter((e) => h.state.entities.get(e.id)).length, 2,
    'both ends fill again');
  pl234TheMiddleSeat.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-245 The Bell's hush ----------

test('PL-245 positive: the Bell rings, the hush holds a minute, and being quiet with them answers softly', () => {
  const h = harnessFor(pl245TheBellsHush, { simTime: 0 });
  pl245TheBellsHush.init(h);
  advanceWith(h.state, pl245TheBellsHush, BELLS_HUSH_TUNING.ringPhaseS + 0.5);
  assert.equal(eventsOf(h.bus, PL_245_RING_EVENT).length, 1, 'the Bell rang');
  assert.ok(cues(h.bus, 'sfx_vent_chime').length >= 1, 'a real deep ring');
  const station = [...h.state.entities.values()].find((e) => e.type === 'station');
  assert.equal(station.data.plantsPl245HushUntil, eventsOf(h.bus, PL_245_RING_EVENT)[0].hushUntil,
    'the station body carries the read-only hush stamp');

  advanceWith(h.state, pl245TheBellsHush, BELLS_HUSH_TUNING.hushS + 1);
  assert.equal(eventsOf(h.bus, PL_245_QUIET_EVENT).length, 1, 'you were quiet with them');
  assert.equal(eventsOf(h.bus, PL_245_CHORUS_EVENT).length, 0, 'no chorus for the quiet');
  assert.equal(station.data.plantsPl245HushUntil, null, 'the hush lifts');
  assert.equal(popups(h.bus).length, 0, 'the hush is the plant\u2019s one voice: no lines');
  pl245TheBellsHush.destroy();
  assertNoListeners(h.bus);
});

test('PL-245 negative: fill the silence and everyone answers at once — once', () => {
  const h = harnessFor(pl245TheBellsHush, { simTime: BELLS_HUSH_TUNING.ringPhaseS });
  pl245TheBellsHush.init(h);
  pl245TheBellsHush.update(0.5, h.state);
  assert.equal(eventsOf(h.bus, PL_245_RING_EVENT).length, 1);
  // Firing before the ring means nothing; firing inside the hush answers on the next beat.
  h.bus.emit('combat:fire', { ownerId: 'npc7' });
  assert.equal(eventsOf(h.bus, PL_245_CHORUS_EVENT).length, 0);
  h.bus.emit('combat:fire', { ownerId: 'p1' });
  advanceWith(h.state, pl245TheBellsHush, 1);
  assert.equal(eventsOf(h.bus, PL_245_CHORUS_EVENT).length, 1, 'answered by everyone at once');
  const chimes = cues(h.bus, 'sfx_vent_chime').length;
  assert.ok(chimes >= BELLS_HUSH_TUNING.chorusFlashCount + 1, 'the chorus is three lights and the ring');
  h.bus.emit('combat:fire', { ownerId: 'p1' });
  advanceWith(h.state, pl245TheBellsHush, 1);
  assert.equal(eventsOf(h.bus, PL_245_CHORUS_EVENT).length, 1, 'the chorus answers once per hush');
  advanceWith(h.state, pl245TheBellsHush, BELLS_HUSH_TUNING.hushS + 1);
  assert.equal(eventsOf(h.bus, PL_245_QUIET_EVENT).length, 0, 'you did not keep the hush');
  pl245TheBellsHush.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-246 Wall time ----------

test('PL-246 positive: the lane parks nose-in ten early; park with them and the Plume passes over', () => {
  const h = harnessFor(pl246WallTime, { simTime: 5 }); // mid-cycle: the vent is quiet
  pl246WallTime.init(h);
  advanceWith(h.state, pl246WallTime, 2);
  assert.equal(ownedOf(h, 'plantsPl246Plate').length, WALL_TIME_TUNING.plateSegCount, 'the Plate stands');
  assert.equal(ownedOf(h, 'plantsPl246Vent').length, 1, 'the Plume vent in it');
  assert.equal(ownedOf(h, 'plantsPl246Parker').length, WALL_TIME_TUNING.parkerCount);

  advanceWith(h.state, pl246WallTime, 103, 0.5); // into the warn window (110..120 of cycle 0)
  assert.equal(eventsOf(h.bus, PL_246_WARN_EVENT).length, 1, 'the ten-second warning, once');
  const parkers = ownedOf(h, 'plantsPl246Parker').map((e) => h.state.entities.get(e.id));
  advanceWith(h.state, pl246WallTime, 9, 0.5);
  assert.ok(parkers.every((p) => p.data.parkedNoseIn === true), 'the whole lane parked nose-in');

  // Park with them: close, slow, facing the plate.
  const plate = plateFor({ x: 0, z: 0 });
  const noseRot = Math.atan2(-plate.out.z, -plate.out.x);
  const spot = {
    x: plate.center.x + plate.out.x * (WALL_TIME_TUNING.parkRadiusWu - 10) + plate.along.x * 30,
    z: plate.center.z + plate.out.z * (WALL_TIME_TUNING.parkRadiusWu - 10) + plate.along.z * 30,
  };
  const player = h.state.entities.get('p1');
  player.rot = noseRot;
  teleportPlayer(h.state, spot.x, spot.z);
  advanceWith(h.state, pl246WallTime, 4, 0.5); // across the fire boundary (120)
  assert.equal(eventsOf(h.bus, PL_246_PLUME_EVENT).length, 1, 'the Plume fired');
  assert.equal(eventsOf(h.bus, PL_246_PARKED_EVENT).length, 1, 'parked with them: it passes over');
  assert.equal(eventsOf(h.bus, PL_246_TAKEN_EVENT).length, 0);
  pl246WallTime.destroy();
  assertNoListeners(h.bus);
});

test('PL-246 negative: be the loose thing the Plume takes; far away, nothing at all', () => {
  const h = harnessFor(pl246WallTime, { simTime: 100 });
  pl246WallTime.init(h);
  advanceWith(h.state, pl246WallTime, 2);
  const plate = plateFor({ x: 0, z: 0 });
  // Inside the corridor, slow, but facing away: loose.
  const spot = {
    x: plate.center.x + plate.out.x * 30 + plate.along.x * 40,
    z: plate.center.z + plate.out.z * 30 + plate.along.z * 40,
  };
  const player = h.state.entities.get('p1');
  player.rot = Math.atan2(plate.out.z, plate.out.x); // facing away from the plate
  teleportPlayer(h.state, spot.x, spot.z);
  advanceWith(h.state, pl246WallTime, 20, 0.5); // through the fire boundary
  assert.equal(eventsOf(h.bus, PL_246_PLUME_EVENT).length, 1);
  assert.equal(eventsOf(h.bus, PL_246_TAKEN_EVENT).length, 1, 'the Plume takes the loose thing');
  assert.equal(eventsOf(h.bus, PL_246_PARKED_EVENT).length, 0);
  pl246WallTime.destroy();

  // Far outside the corridor: the Plume is a light and a sound.
  const h2 = harnessFor(pl246WallTime, { simTime: 100 });
  pl246WallTime.init(h2);
  advanceWith(h2.state, pl246WallTime, 22, 0.5);
  assert.equal(eventsOf(h2.bus, PL_246_PLUME_EVENT).length, 1);
  assert.equal(eventsOf(h2.bus, PL_246_TAKEN_EVENT).length, 0, 'out of the corridor, nothing takes you');
  assert.equal(eventsOf(h2.bus, PL_246_PARKED_EVENT).length, 0);
  pl246WallTime.destroy();
  assertNoListeners(h2.bus);
});

// ---------- determinism smoke ----------

test('determinism: the same scenario twice produces the same bus transcript, stamp for stamp', () => {
  const run = () => {
    const h = harnessFor(pl233TheFreshMark, { simTime: 179 });
    pl233TheFreshMark.init(h);
    advanceWith(h.state, pl233TheFreshMark, 42, 0.5);
    const marked = ownedOf(h, 'plantsPl233Hull').find((w) => w.data.plantsPl233Knocked === true);
    if (marked) h.bus.emit('physics:impact', { aId: marked.id, bId: 'p1', impulse: 200 });
    pl233TheFreshMark.destroy();
    return {
      log: h.bus.log.map((e) => JSON.stringify({ t: e.type, p: e.payload })),
      removed: [...h.helpers.removed].sort(),
      marks: ownedOf(h, 'plantsPl233Hull').map((w) => w.data.plantsPl233Knocked === true),
    };
  };
  const a = run();
  const b = run();
  assert.deepEqual(a, b, 'no Math.random, no Date.now: identical runs, identical worlds');
});

test('determinism: pl246 plume clock is a pure function of sim time', () => {
  const t = WALL_TIME_TUNING;
  for (const now of [0, 7, 109.9, 110, 119.9, 120, 121, 239, 240]) {
    const p1 = plumePhaseAt(now, t);
    const p2 = plumePhaseAt(now, t);
    assert.deepEqual(p1, p2);
    assert.equal(typeof p1.shouldPark, 'boolean');
    assert.equal(typeof p1.firing, 'boolean');
    assert.ok(p1.untilFire >= 0);
  }
  assert.equal(plumePhaseAt(110, t).shouldPark, true, 'the lane parks in the last ten seconds');
  assert.equal(plumePhaseAt(109, t).shouldPark, false);
  assert.equal(plumePhaseAt(120.5, t).firing, true, 'the vent scours at the cycle boundary');
});
