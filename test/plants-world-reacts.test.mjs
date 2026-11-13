// plants-world-reacts — behavior tests for the INFERENCE plant rows implemented as
// src/systems/plants/*.js modules (PL-101..PL-251, Sections A and H).
//
// Per row: (a) positive trigger -> expected flag/event/voice (exact quoted copy where the row
// has one); (b) negative (wrong trigger) -> nothing; (c) cooldown/memory cap respected.
// Plus a determinism smoke: the same scenario twice, identical outcomes.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { plantMapOrder, plantStationById } from '../src/systems/plantEntityViews.js';
import { traffic } from '../src/systems/traffic.js';
import { BUS_TUNING } from '../src/systems/plants/busDoesntMove.js';
import { towLatch, towTargetIdOf } from '../src/systems/plants/towWatch.js';
import { hash32 } from '../src/core/rng.js';

import {
  PLANTS_FAR_BERTH_CUT_EVENT,
  PLANTS_FAR_BERTH_CHALK_EVENT,
  FAR_BERTH_CHALK_LINE,
  FAR_BERTH_TUNING,
  berthChoiceFor,
  farBerthOps,
} from '../src/systems/plants/farBerth.js';

import {
  PLANTS_MISTAKEN_SWEEP_EVENT,
  PLANTS_MISTAKEN_WAVE_OFF_EVENT,
  PLANTS_MISTAKEN_TOW_EVENT,
  MISTAKEN_TOW_LINE,
  MISTAKEN_WAVE_OFF_LINE,
  mistakenOps,
} from '../src/systems/plants/mistaken.js';

import {
  PLANTS_BUS_HOLD_EVENT,
  PLANTS_BUS_POD_EVENT,
  PLANTS_BUS_TALK_EVENT,
  PLANTS_BUS_HANDUP_EVENT,
  BUS_ROUTE_BARK,
  busDoesntMoveOps,
  isBennyBus,
} from '../src/systems/plants/busDoesntMove.js';

import {
  PLANTS_LITTER_EVENT,
  PLANTS_LITTER_SWEEP_BILL_EVENT,
  LITTER_BARK,
  LITTER_SWEEP_BILL_LINE,
  litterOps,
  isPlayerLitterPod,
} from '../src/systems/plants/litter.js';

import {
  PLANTS_WRONG_WAY_FLASH_EVENT,
  PLANTS_WRONG_WAY_AMBER_EVENT,
  PLANTS_WRONG_WAY_TUG_EVENT,
  wrongWayOps,
  predictHeadOn,
} from '../src/systems/plants/wrongWay.js';

import {
  PLANTS_MOORING_ALARM_EVENT,
  PLANTS_MOORING_WAVE_EVENT,
  mooringAlarmsPlant,
} from '../src/systems/plants/mooringAlarms.js';

import {
  PLANTS_SNAGGED_POD_EVENT,
  PLANTS_SNAGGED_RETURNED_EVENT,
  PLANTS_SNAGGED_TAKEN_EVENT,
  PLANTS_SNAGGED_LOOSE_EVENT,
  SNAGGED_THANKS_LINE,
  SNAGGED_ALARM_LINE,
  snaggedPodPlant,
} from '../src/systems/plants/snaggedPod.js';

import {
  PLANTS_DEAD_LANE_DARK_EVENT,
  PLANTS_DEAD_LANE_HORN_EVENT,
  PLANTS_DEAD_LANE_RELIT_EVENT,
  deadLanePlant,
} from '../src/systems/plants/deadLane.js';

import {
  PLANTS_ORPHAN_SPAWN_EVENT,
  PLANTS_ORPHAN_FILE_EVENT,
  PLANTS_ORPHAN_ARGUMENT_EVENT,
  PLANTS_ORPHAN_OWNERS_EVENT,
  ORPHAN_ARGUMENT_LINES,
  orphanWreckOps,
} from '../src/systems/plants/orphanWreck.js';

import {
  PLANTS_SWEEP_START_EVENT,
  PLANTS_SWEEP_DONE_EVENT,
  PLANTS_SWEEP_STRAY_EVENT,
  SWEEP_THANKS_LINE,
  SWEEP_STRAY_LINE,
  sweepingLineOps,
} from '../src/systems/plants/sweepingLine.js';

import {
  PLANTS_DOORSTOP_JAM_EVENT,
  PLANTS_DOORSTOP_CHALK_TAG_EVENT,
  PLANTS_DOORSTOP_CHALK_NUMBER_EVENT,
  DOORSTOP_TAG_LINE,
  DOORSTOP_NUMBER_LINE,
  doorstopOps,
  doorstopDoorGeometry,
} from '../src/systems/plants/doorstop.js';

import {
  PLANTS_ONE_YANK_DROP_EVENT,
  PLANTS_ONE_YANK_PULL_EVENT,
  PLANTS_ONE_YANK_APPLAUSE_EVENT,
  PLANTS_ONE_YANK_LANDED_EVENT,
  ONE_YANK_LANDED_LINE,
  oneYankOps,
} from '../src/systems/plants/oneYank.js';

import {
  PLANTS_PERSPECTIVE_EVENT,
  PLANTS_PERSPECTIVE_FOUND_EVENT,
  perspectiveOps,
} from '../src/systems/plants/perspective.js';

import {
  PLANTS_PAPER_TRAIL_TAG_EVENT,
  PLANTS_PAPER_TRAIL_PAID_EVENT,
  PLANTS_PAPER_TRAIL_BOUQUET_EVENT,
  PAPER_TRAIL_CLEAN_LINE,
  PAPER_TRAIL_BOUQUET_LINE,
  paperTrailOps,
} from '../src/systems/plants/paperTrail.js';

import {
  PLANTS_YOUR_BERTH_CHALK_EVENT,
  PLANTS_YOUR_BERTH_SHOO_EVENT,
  PLANTS_YOUR_BERTH_TOW_EVENT,
  YOUR_BERTH_CHALK_LINE,
  YOUR_BERTH_SHOO_LINE,
  YOUR_BERTH_TOW_LINE,
  yourBerthOps,
  berthIdFor,
} from '../src/systems/plants/yourBerth.js';

import {
  PLANTS_RED_AT_HOME_EVENT,
  PLANTS_RED_AT_HOME_SEEN_NOTHING_EVENT,
  RED_AT_HOME_LINE,
  redAtHomeOps,
} from '../src/systems/plants/redAtHome.js';

import {
  PLANTS_SWING_LINE_PLANTED_EVENT,
  PLANTS_SWING_LINE_NOD_EVENT,
  PLANTS_SWING_LINE_CUT_EVENT,
  SWING_LINE_NOD_LINE,
  SWING_LINE_CUT_LINE,
  someonesCoursePlant,
  swingLineAnchors,
} from '../src/systems/plants/someonesCourse.js';

import {
  PLANTS_DUCKLING_JOIN_EVENT,
  PLANTS_DUCKLING_PART_EVENT,
  PLANTS_DUCKLING_SHOO_EVENT,
  DUCKLING_PART_LINE,
  DUCKLING_SHOO_LINE,
  ducklingsOps,
} from '../src/systems/plants/ducklings.js';

import {
  PLANTS_MANNERS_YIELD_EVENT,
  PLANTS_MANNERS_FLASH_ACROSS_EVENT,
  PLANTS_MANNERS_RANKS_EVENT,
  FREIGHT_MANNERS_FLASH_LINE,
  FREIGHT_MANNERS_RANKS_LINE,
  freightMannersOps,
} from '../src/systems/plants/freightManners.js';

import {
  PLANTS_WITNESS_CHALK_EVENT,
  PLANTS_WITNESS_CORRECTED_EVENT,
  PLANTS_WITNESS_FADED_EVENT,
  WITNESS_CHALK_LINE,
  witnessOps,
  wrongDescriptionFor,
} from '../src/systems/plants/witness.js';

import {
  PLANTS_WAKE_SCATTER_EVENT,
  PLANTS_WAKE_OWE_EVENT,
  yourWakePlant,
} from '../src/systems/plants/yourWake.js';

import {
  PLANTS_SEEN_EVENT,
  markOf,
  SEEN_TUNING,
  SEEN_KID_LINE,
  seenOps,
} from '../src/systems/plants/seen.js';

import {
  PLANTS_TWO_NAMES_EVENT,
  PLANTS_TWO_NAMES_CERTAIN_EVENT,
  twoNamesOps,
  chalkNameFor,
  twoNamesLineFor,
} from '../src/systems/plants/twoNames.js';

import {
  PLANTS_OTHER_NAME_CHALK_EVENT,
  PLANTS_OTHER_NAME_EARNED_EVENT,
  PLANTS_OTHER_NAME_BOTH_EVENT,
  OTHER_NAME_ASLEEP,
  otherNameOps,
  otherNameEarnedLineFor,
} from '../src/systems/plants/theOtherName.js';

import {
  PLANTS_KNOWN_ROOM_EVENT,
  PLANTS_KNOWN_MUTTER_EVENT,
  KNOWN_MUTTER_LINE,
  knownByNameOps,
  roomRadiusFor,
} from '../src/systems/plants/knownByName.js';

import {
  PLANTS_STRANGER_HAIL_EVENT,
  PLANTS_STRANGER_DELIVERED_EVENT,
  PLANTS_STRANGER_PASSED_EVENT,
  PLANTS_NO_HELP_CAME_EVENT,
  STRANGER_HAIL_LINE,
  STRANGER_DELIVERED_LINE,
  otherSidePlant,
} from '../src/systems/plants/otherSide.js';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function makeShip(id, {
  x = 0, z = 0, vx = 0, vz = 0, radius = 8, rot = 0, data = {}, team = 2, type = 'ship', hull, hullMax,
} = {}) {
  const ship = {
    id,
    type,
    alive: true,
    team,
    pos: { x, z },
    vel: { x: vx, z: vz },
    rot,
    radius,
    data: {
      intent: { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0, brake: false },
      ...data,
    },
  };
  if (hull !== undefined) ship.hull = hull;
  if (hullMax !== undefined) ship.hullMax = hullMax;
  return ship;
}

function makePlayer(opts = {}) {
  return makeShip('p1', { team: 0, radius: 6, ...opts });
}

function makeStation(id, { x = 0, z = 0 } = {}) {
  return { id, type: 'station', alive: true, pos: { x, z }, radius: 60, data: { stationId: id } };
}

function makeBeacon(id, { x = 0, z = 0, data = {} } = {}) {
  return { id, type: 'beacon', alive: true, pos: { x, z }, vel: { x: 0, z: 0 }, radius: 5, data };
}

function makeCargo(id, { x = 0, z = 0, vx = 0, vz = 0, data = {} } = {}) {
  return { id, type: 'cargo', alive: true, pos: { x, z }, vel: { x: vx, z: vz }, radius: 4, data };
}

// Entities map is shared with spawn helpers so spawned props are lookable.
function makeState({ entities = new Map(), stations = [], simTime = 0, tick = 0, law } = {}) {
  const state = {
    mode: 'flight',
    simTime,
    tick,
    playerId: 'p1',
    entities,
    world: { currentSectorId: 's1' },
    traffic: { freighters: [] },
    stations,
  };
  if (law) state.law = law;
  return state;
}

// Mixin host: bus + state + fake helpers + the ops; init fn invoked.
function makeHost(bus, state, ops, initFn) {
  let n = 0;
  const spawns = [];
  const removed = [];
  const voices = [];
  const cues = [];
  const popups = [];
  const helpers = {
    voice: { say: (m) => voices.push(structuredClone(m)) },
    spawnEntity: (spec) => {
      const ent = { alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {}, ...structuredClone(spec) };
      ent.id = `e${++n}`;
      spawns.push(ent);
      state.entities.set(ent.id, ent);
      return ent;
    },
    removeEntity: (id) => {
      removed.push(id);
      state.entities.delete(id);
    },
  };
  const host = { bus, state, helpers, ...ops };
  if (initFn) initFn(host);
  // Capture audio cues and comms popups for assertions.
  bus.on('audio:cue', (p) => cues.push(structuredClone(p)));
  bus.on('comms:popup', (p) => popups.push(structuredClone(p)));
  return { host, spawns, removed, voices, cues, popups, helpers };
}

// ---------------------------------------------------------------------------
// PL-101 The far berth
// ---------------------------------------------------------------------------

test('PL-101 cut in the dock queue: horns hold down and the far pier is granted', () => {
  const bus = createBus();
  const events = [];
  bus.on(PLANTS_FAR_BERTH_CUT_EVENT, (p) => events.push(p));
  const station = makeStation('stA', { x: 500, z: 0 });
  const queueHull = makeShip('q1', { x: 450, z: 0, vx: 20, data: { trafficRole: 'hauler', cargo: { ore: 5 } } });
  const player = makePlayer({ x: 470, z: 0, vx: 160 });
  const state = makeState({ simTime: 10, entities: new Map([['p1', player]]), stations: [station] });
  const { host, cues } = makeHost(bus, state, farBerthOps, (h) => h._initFarBerth());

  const claimed = host._reactFarBerth(queueHull, { role: 'hauler' }, [station], state, player);
  assert.equal(claimed, false, 'the queue holds course; the plant never claims the hull');
  assert.ok(events.length === 1, 'cut event emitted');
  assert.equal(events[0].stationId, 'stA');
  assert.equal(queueHull.data.lampsFlashing, true, 'queued hull lamps flash');
  assert.ok(cues.some((c) => c.id === 'sfx_hauler_blast_lean'), 'horn holds down');
  assert.ok(Number.isFinite(station.data.farPierUntil), 'dock berths you at the far pier');
  assert.equal(berthChoiceFor(station, 10.5), 'far_pier');
});

test('PL-101 slow player does not cut; cooldown suppresses repeat cuts', () => {
  const bus = createBus();
  const events = [];
  bus.on(PLANTS_FAR_BERTH_CUT_EVENT, (p) => events.push(p));
  const station = makeStation('stA', { x: 500, z: 0 });
  const queueHull = makeShip('q1', { x: 450, z: 0, vx: 20, data: { trafficRole: 'hauler', cargo: { ore: 5 } } });
  const slowPlayer = makePlayer({ x: 470, z: 0, vx: 40 });
  const state = makeState({ simTime: 10, entities: new Map([['p1', slowPlayer]]), stations: [station] });
  const { host, cues } = makeHost(bus, state, farBerthOps, (h) => h._initFarBerth());

  host._reactFarBerth(queueHull, { role: 'hauler' }, [station], state, slowPlayer);
  assert.equal(events.length, 0, 'slow pass is not a cut');
  assert.equal(cues.length, 0);
  assert.equal(station.data.farPierUntil, undefined, 'no far pier for the slow');

  // Fast cut, then an immediate second cut inside the hull cooldown: one cut only.
  const fastPlayer = makePlayer({ x: 470, z: 0, vx: 160 });
  state.entities.set('p1', fastPlayer);
  host._reactFarBerth(queueHull, { role: 'hauler' }, [station], state, fastPlayer);
  assert.equal(events.length, 1);
  state.simTime = 12; // 2 s later, inside hullCooldownS (8 s)
  host._reactFarBerth(queueHull, { role: 'hauler' }, [station], state, fastPlayer);
  assert.equal(events.length, 1, 'cooldown between cuts on the same hull');
});

test('PL-101 three cuts inside the window chalk your tag on the pier', () => {
  const bus = createBus();
  const cutEvents = [];
  const chalkEvents = [];
  bus.on(PLANTS_FAR_BERTH_CUT_EVENT, (p) => cutEvents.push(p));
  bus.on(PLANTS_FAR_BERTH_CHALK_EVENT, (p) => chalkEvents.push(p));
  const station = makeStation('stA', { x: 500, z: 0 });
  const state = makeState({ entities: new Map(), stations: [station] });
  const { host, popups } = makeHost(bus, state, farBerthOps, (h) => h._initFarBerth());

  const hulls = ['q1', 'q2', 'q3'].map((id, i) => makeShip(id, { x: 450 + i * 2, z: 0, vx: 20, data: { trafficRole: 'hauler', cargo: { ore: 5 } } }));
  const player = makePlayer({ x: 470, z: 0, vx: 160 });

  state.simTime = 10;
  host._reactFarBerth(hulls[0], { role: 'hauler' }, [station], state, player);
  assert.equal(chalkEvents.length, 0, 'one cut is not a chalk');
  state.simTime = 20;
  host._reactFarBerth(hulls[1], { role: 'hauler' }, [station], state, player);
  assert.equal(chalkEvents.length, 0, 'two cuts is not a chalk');
  state.simTime = 30;
  host._reactFarBerth(hulls[2], { role: 'hauler' }, [station], state, player);
  assert.equal(chalkEvents.length, 1, 'third cut inside the window chalks the pier');
  assert.ok(Number.isFinite(station.data.farPierChalkUntil), 'chalk holds on the pier');
  assert.equal(berthChoiceFor(station, 31), 'chalked');
  assert.ok(popups.some((p) => p.text === FAR_BERTH_CHALK_LINE), 'dockhand chalk line goes out');
});

// ---------------------------------------------------------------------------
// PL-102 Mistaken
// ---------------------------------------------------------------------------

test('PL-102 parked dead-still, lamps off: patrol sweeps, taps twice, tug clamps on', () => {
  const bus = createBus();
  const sweepEvents = [];
  const towEvents = [];
  bus.on(PLANTS_MISTAKEN_SWEEP_EVENT, (p) => sweepEvents.push(p));
  bus.on(PLANTS_MISTAKEN_TOW_EVENT, (p) => towEvents.push(p));
  const patrol = makeShip('pat1', { x: 100, z: 0, data: { trafficRole: 'patrol' }, team: 1 });
  const player = makePlayer({});
  const state = makeState({ simTime: 0, entities: new Map([['p1', player]]) });
  const { host, spawns, cues, popups } = makeHost(bus, state, mistakenOps, (h) => h._initMistaken());

  host._reactMistaken(patrol, { role: 'patrol' }, [], state, player); // t=0: stillness begins
  assert.equal(sweepEvents.length, 0);
  state.simTime = 61;
  host._reactMistaken(patrol, { role: 'patrol' }, [], state, player); // a minute dead: sweep + tap 1
  assert.equal(sweepEvents.length, 1);
  assert.equal(patrol.data.lampsFlashing, true, 'patrol sweeps you with its lamp');
  assert.equal(cues.filter((c) => c.id === 'ui_deny').length, 1, 'first hull tap');
  state.simTime = 62.3;
  host._reactMistaken(patrol, { role: 'patrol' }, [], state, player); // tap 2
  assert.equal(cues.filter((c) => c.id === 'ui_deny').length, 2, 'second hull tap');
  assert.equal(towEvents.length, 0, 'playing dead through the taps: no tow yet');
  state.simTime = 71;
  host._reactMistaken(patrol, { role: 'patrol' }, [], state, player); // grace over, still dead
  assert.equal(towEvents.length, 1, 'the recovery tug clamps on');
  assert.equal(spawns.length, 1, 'a real tug hull spawns');
  assert.equal(spawns[0].data.towTargetId, 'p1');
  assert.ok(popups.some((p) => p.text === MISTAKEN_TOW_LINE));
});

test('PL-102 wave a lamp during the sweep and the patrol waves you on', () => {
  const bus = createBus();
  const waveEvents = [];
  const towEvents = [];
  bus.on(PLANTS_MISTAKEN_WAVE_OFF_EVENT, (p) => waveEvents.push(p));
  bus.on(PLANTS_MISTAKEN_TOW_EVENT, (p) => towEvents.push(p));
  const patrol = makeShip('pat1', { x: 100, z: 0, data: { trafficRole: 'patrol' }, team: 1 });
  const player = makePlayer({});
  const state = makeState({ simTime: 0, entities: new Map([['p1', player]]) });
  const { host, voices, spawns } = makeHost(bus, state, mistakenOps, (h) => h._initMistaken());

  host._reactMistaken(patrol, { role: 'patrol' }, [], state, player);
  state.simTime = 61;
  host._reactMistaken(patrol, { role: 'patrol' }, [], state, player); // sweep begins
  player.data.lampsOn = true; // wave a lamp
  state.simTime = 62.3;
  host._reactMistaken(patrol, { role: 'patrol' }, [], state, player);
  assert.equal(waveEvents.length, 1, 'the mistake clears');
  assert.equal(towEvents.length, 0, 'no tow for the living');
  assert.equal(spawns.length, 0, 'no tug spawns');
  assert.ok(voices.some((v) => v.text === MISTAKEN_WAVE_OFF_LINE));
});

test('PL-102 a moving player is never mistaken; the tow cools down', () => {
  const bus = createBus();
  const sweepEvents = [];
  const towEvents = [];
  bus.on(PLANTS_MISTAKEN_SWEEP_EVENT, (p) => sweepEvents.push(p));
  bus.on(PLANTS_MISTAKEN_TOW_EVENT, (p) => towEvents.push(p));
  const patrol = makeShip('pat1', { x: 100, z: 0, data: { trafficRole: 'patrol' }, team: 1 });
  const player = makePlayer({ vx: 60 });
  const state = makeState({ simTime: 0, entities: new Map([['p1', player]]) });
  const { host } = makeHost(bus, state, mistakenOps, (h) => h._initMistaken());

  state.simTime = 0;
  host._reactMistaken(patrol, { role: 'patrol' }, [], state, player);
  state.simTime = 200;
  host._reactMistaken(patrol, { role: 'patrol' }, [], state, player);
  assert.equal(sweepEvents.length, 0, 'a moving hull is not a wreck');
  assert.equal(towEvents.length, 0);

  // After a tow, the same patrol will not re-sweep inside towCooldownS.
  const stillPlayer = makePlayer({});
  state.entities.set('p1', stillPlayer);
  state.simTime = 0;
  host._reactMistaken(patrol, { role: 'patrol' }, [], state, stillPlayer);
  state.simTime = 61;
  host._reactMistaken(patrol, { role: 'patrol' }, [], state, stillPlayer);
  state.simTime = 62.3;
  host._reactMistaken(patrol, { role: 'patrol' }, [], state, stillPlayer);
  state.simTime = 71;
  host._reactMistaken(patrol, { role: 'patrol' }, [], state, stillPlayer);
  assert.equal(towEvents.length, 1);
  state.simTime = 100; // inside towCooldownS (90) after the tow at 71
  host._reactMistaken(patrol, { role: 'patrol' }, [], state, stillPlayer);
  assert.equal(towEvents.length, 1, 'cooldown between tows');
});

// ---------------------------------------------------------------------------
// PL-103 The bus does not move
// ---------------------------------------------------------------------------

test('PL-103 shove the bus mid-route: it sways, holds course, and the route hears the exact line', () => {
  const bus = createBus();
  const holdEvents = [];
  bus.on(PLANTS_BUS_HOLD_EVENT, (p) => holdEvents.push(p));
  const bennyBus = makeShip('bus1', { x: 0, z: 0, vx: 30, data: { plantsPl103Bus: true, trafficRole: 'bus' } });
  const player = makePlayer({});
  const state = makeState({ simTime: 10, entities: new Map([['p1', player], ['bus1', bennyBus]]), stations: [] });
  const { host, voices } = makeHost(bus, state, busDoesntMoveOps, (h) => h._initBusDoesntMove());

  assert.equal(isBennyBus(bennyBus), true);
  bus.emit('physics:impact', { aId: 'bus1', bId: 'p1', dp: 600, trauma: 0, impulse: 600, preSolveClosingSpeed: 6, causalActorId: 'p1' });
  assert.equal(holdEvents.length, 1, 'shove registered');
  assert.equal(bennyBus.data.lampsFlashing, true, 'the bus sways (lamps)');
  assert.ok(!bennyBus.data.intent || bennyBus.data.intent.moveZ === 0, 'the bus holds course');
  assert.ok(voices.some((v) => v.text === BUS_ROUTE_BARK), 'the whole route hears the exact line');
});

test('PL-103 a gentle bump is not a shove; the shove cools down', () => {
  const bus = createBus();
  const holdEvents = [];
  bus.on(PLANTS_BUS_HOLD_EVENT, (p) => holdEvents.push(p));
  const bennyBus = makeShip('bus1', { x: 0, z: 0, vx: 30, data: { plantsPl103Bus: true } });
  const player = makePlayer({});
  const state = makeState({ simTime: 10, entities: new Map([['p1', player], ['bus1', bennyBus]]) });
  const { host, voices } = makeHost(bus, state, busDoesntMoveOps, (h) => h._initBusDoesntMove());

  bus.emit('physics:impact', { aId: 'bus1', bId: 'p1', dp: 200, trauma: 0, impulse: 200, preSolveClosingSpeed: 2, causalActorId: 'p1' });
  assert.equal(holdEvents.length, 0, 'a tap is not a shove');
  assert.equal(voices.length, 0);

  bus.emit('physics:impact', { aId: 'bus1', bId: 'p1', dp: 800, trauma: 0, impulse: 800, preSolveClosingSpeed: 8, causalActorId: 'p1' });
  assert.equal(holdEvents.length, 1);
  state.simTime = 20; // 10 s later, inside busCooldownS (30 s)
  bus.emit('physics:impact', { aId: 'bus1', bId: 'p1', dp: 800, trauma: 0, impulse: 800, preSolveClosingSpeed: 8, causalActorId: 'p1' });
  assert.equal(holdEvents.length, 1, 'cooldown per bus');
});

test('PL-103 shove it at a stop: a passenger pod rolls loose; keep it and the passenger talks; hand it up', () => {
  const bus = createBus();
  const podEvents = [];
  const talkEvents = [];
  const handUpEvents = [];
  bus.on(PLANTS_BUS_POD_EVENT, (p) => podEvents.push(p));
  bus.on(PLANTS_BUS_TALK_EVENT, (p) => talkEvents.push(p));
  bus.on(PLANTS_BUS_HANDUP_EVENT, (p) => handUpEvents.push(p));
  const stop = makeStation('stopA', { x: 0, z: 0 }); // the bus is sitting at this stop
  const stopB = makeStation('stopB', { x: 200, z: 0 }); // the loop's other stop
  const bennyBus = makeShip('bus1', { x: 0, z: 0, vx: 0, data: { plantsPl103Bus: true } });
  const player = makePlayer({});
  const state = makeState({ simTime: 10, entities: new Map([['p1', player], ['bus1', bennyBus]]), stations: [stop, stopB] });
  const { host, spawns, removed, popups } = makeHost(bus, state, busDoesntMoveOps, (h) => h._initBusDoesntMove());

  bus.emit('physics:impact', { aId: 'bus1', bId: 'p1', dp: 800, trauma: 0, impulse: 800, preSolveClosingSpeed: 8, causalActorId: 'p1' });
  assert.equal(podEvents.length, 1, 'one passenger pod rolls loose');
  assert.equal(spawns.length, 1);
  const podId = spawns[0].id;
  assert.equal(state.entities.get(podId).data.passengerPod, true);
  assert.equal(state.entities.get(podId).data.masslineTetherable, true, 'the pod can be towed');
  assert.equal(spawns[0].flags.persistent, true);

  // Keep it: the passenger talks from your hold, on cadence.
  bus.emit('pickup:collected', { pickupId: podId, collectorId: 'p1', kind: 'cargo', amount: 1, pos: { x: 0, z: 0 } });
  state.entities.get(podId).pos = { x: 500, z: 0 }; // carried away from the stop
  state.simTime = 40;
  host._reactBusDoesntMove(bennyBus, { role: "bus" }, [stop, stopB], state, player);
  assert.equal(talkEvents.length, 1, 'the passenger talks from your hold');
  state.simTime = 50;
  host._reactBusDoesntMove(bennyBus, { role: "bus" }, [stop, stopB], state, player);
  assert.equal(talkEvents.length, 1, 'talk cadence respected');

  // Hand the pod up at the next stop.
  state.entities.get(podId).pos = { x: 20, z: 0 }; // within handUpRadiusWu of the bus at a stop
  host._reactBusDoesntMove(bennyBus, { role: "bus" }, [stop, stopB], state, player);
  assert.equal(handUpEvents.length, 1, 'pod handed up');
  assert.ok(removed.includes(podId), 'pod leaves the world');
  assert.ok(popups.some((p) => p.text.includes('obliged')), 'thanks goes out');
});

// ---------------------------------------------------------------------------
// PL-127 Litter
// ---------------------------------------------------------------------------

function litterPod(id) {
  return { id, type: 'cargo', alive: true, pos: { x: 10, z: 0 }, vel: { x: 0, z: 0 }, radius: 3, data: { jettisonedCargo: true, playerJettisonOrigin: { version: 1, ownerId: 'p1' } } };
}

test('PL-127 ditch cargo in a lane and traffic asks the exact question on open radio', () => {
  const bus = createBus();
  const litterEvents = [];
  bus.on(PLANTS_LITTER_EVENT, (p) => litterEvents.push(p));
  const state = makeState({ simTime: 100 });
  const { host, voices } = makeHost(bus, state, litterOps, (h) => h._initLitter());

  const pod = litterPod('pod1');
  assert.equal(isPlayerLitterPod(pod), true);
  bus.emit('entity:spawned', { id: 'pod1', type: 'cargo', entity: pod });
  assert.equal(litterEvents.length, 1);
  assert.equal(pod.data.litter, true, 'it stays put, marked as litter');
  assert.ok(voices.some((v) => v.text === LITTER_BARK), 'open radio asks the exact line');
});

test('PL-127 cargo ditched by someone else is not litter', () => {
  const bus = createBus();
  const litterEvents = [];
  bus.on(PLANTS_LITTER_EVENT, (p) => litterEvents.push(p));
  const state = makeState({ simTime: 100 });
  const { host, voices } = makeHost(bus, state, litterOps, (h) => h._initLitter());

  const pod = { id: 'podX', type: 'cargo', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 3, data: { jettisonedCargo: true, ownerId: 'npc3' } };
  bus.emit('entity:spawned', { id: 'podX', type: 'cargo', entity: pod });
  assert.equal(litterEvents.length, 0);
  assert.equal(voices.length, 0);
  assert.equal(pod.data.litter, undefined);
});

test('PL-127 three in a day: the sweep bill finds you at the next dock; going back for it clears the pod', () => {
  const bus = createBus();
  const billEvents = [];
  bus.on(PLANTS_LITTER_SWEEP_BILL_EVENT, (p) => billEvents.push(p));
  const dock = makeStation('dockA', { x: 0, z: 0 });
  const state = makeState({ simTime: 100, stations: [dock] });
  const { host, popups, cues } = makeHost(bus, state, litterOps, (h) => h._initLitter());

  bus.emit('entity:spawned', { id: 'pod1', type: 'cargo', entity: litterPod('pod1') });
  bus.emit('entity:spawned', { id: 'pod2', type: 'cargo', entity: litterPod('pod2') });
  bus.emit('pickup:collected', { pickupId: 'pod1', collectorId: 'p1', kind: 'cargo', amount: 1, pos: { x: 10, z: 0 } });
  bus.emit('dock:range', { stationId: 'dockA', shipId: 'p1', inRange: true });
  assert.equal(billEvents.length, 0, 'one pod left: no bill yet');

  bus.emit('entity:spawned', { id: 'pod3', type: 'cargo', entity: litterPod('pod3') });
  bus.emit('entity:spawned', { id: 'pod4', type: 'cargo', entity: litterPod('pod4') });
  bus.emit('dock:range', { stationId: 'dockA', shipId: 'p1', inRange: true });
  assert.equal(billEvents.length, 1, 'three left in the day: the bill finds you at the dock');
  assert.ok(popups.some((p) => p.text === LITTER_SWEEP_BILL_LINE));
  assert.ok(cues.some((c) => c.id === 'ui_deny'));

  bus.emit('dock:range', { stationId: 'dockA', shipId: 'p1', inRange: true });
  assert.equal(billEvents.length, 1, 'the bill does not re-find you immediately');
});

// ---------------------------------------------------------------------------
// PL-154 Wrong way
// ---------------------------------------------------------------------------

test('PL-154 against the flow: haulers flash hard, beacons turn amber, a tug waits nose-on', () => {
  const bus = createBus();
  const flashEvents = [];
  const amberEvents = [];
  const tugEvents = [];
  bus.on(PLANTS_WRONG_WAY_FLASH_EVENT, (p) => flashEvents.push(p));
  bus.on(PLANTS_WRONG_WAY_AMBER_EVENT, (p) => amberEvents.push(p));
  bus.on(PLANTS_WRONG_WAY_TUG_EVENT, (p) => tugEvents.push(p));
  const player = makePlayer({ vx: 120 });
  const beacon = makeBeacon('b1', { x: 50, z: 0 });
  const entities = new Map([['p1', player], ['b1', beacon]]);
  const haulers = [];
  for (let i = 0; i < 4; i += 1) {
    const h = makeShip(`wh${i}`, { x: 250 + i * 15, z: 0, vx: -40, data: { trafficRole: 'hauler', cargo: { ore: 4 } } });
    haulers.push(h);
    entities.set(h.id, h);
  }
  const state = makeState({ simTime: 5, entities });
  const { host, spawns, cues } = makeHost(bus, state, wrongWayOps, (h) => h._initWrongWay());

  assert.ok(predictHeadOn(player, haulers[0]), 'head-on geometry holds');
  for (const h of haulers) {
    host._reactWrongWay(h, { role: 'hauler' }, [], state, player);
  }
  assert.equal(flashEvents.length, 4, 'every oncoming hauler flashes');
  for (const h of haulers) assert.equal(h.data.lampsFlashing, true);
  assert.ok(amberEvents.length >= 1, 'the lane beacon turns amber');
  assert.ok(Number.isFinite(beacon.data.lampFlashUntil)); // amber rides the renderer flag now
  assert.equal(tugEvents.length, 1, 'far enough in, the tug meets you');
  assert.equal(spawns.length, 1);
  assert.equal(spawns[0].data.holdingNoseOn, true, 'the tug simply waits');
  assert.equal(spawns[0].vel.x, 0, 'nose-on means not moving');
  assert.ok(cues.some((c) => c.id === 'sfx_hauler_blast_lean'));
});

test('PL-154 with the flow there is no flash and no tug', () => {
  const bus = createBus();
  const flashEvents = [];
  const tugEvents = [];
  bus.on(PLANTS_WRONG_WAY_FLASH_EVENT, (p) => flashEvents.push(p));
  bus.on(PLANTS_WRONG_WAY_TUG_EVENT, (p) => tugEvents.push(p));
  const player = makePlayer({ vx: 120 });
  const hauler = makeShip('wh', { x: 250, z: 0, vx: 40, data: { trafficRole: 'hauler', cargo: { ore: 4 } } });
  const state = makeState({ simTime: 5, entities: new Map([['p1', player], ['wh', hauler]]) });
  const { host, spawns } = makeHost(bus, state, wrongWayOps, (h) => h._initWrongWay());

  assert.equal(predictHeadOn(player, hauler), null, 'with the flow is not head-on');
  host._reactWrongWay(hauler, { role: 'hauler' }, [], state, player);
  assert.equal(flashEvents.length, 0);
  assert.equal(tugEvents.length, 0);
  assert.equal(spawns.length, 0);
});

test('PL-154 turn around and the tug stands down; the flash respects its cooldown', () => {
  const bus = createBus();
  const flashEvents = [];
  const standDowns = [];
  bus.on(PLANTS_WRONG_WAY_FLASH_EVENT, (p) => flashEvents.push(p));
  bus.on('plants:wrongWayStandDown', (p) => standDowns.push(p));
  const player = makePlayer({ vx: 120 });
  const hauler = makeShip('wh', { x: 250, z: 0, vx: -40, data: { trafficRole: 'hauler', cargo: { ore: 4 } } });
  const state = makeState({ simTime: 5, entities: new Map([['p1', player], ['wh', hauler]]) });
  const { host, spawns, removed } = makeHost(bus, state, wrongWayOps, (h) => h._initWrongWay());

  host._reactWrongWay(hauler, { role: 'hauler' }, [], state, player);
  // Build up to the tug with four distinct haulers instead: reuse the spawn path via multiple hulls.
  const haulers = ['wh2', 'wh3', 'wh4'].map((id, i) => {
    const h = makeShip(id, { x: 250 + i * 15, z: 0, vx: -40, data: { trafficRole: 'hauler', cargo: { ore: 4 } } });
    state.entities.set(id, h);
    return h;
  });
  state.simTime = 6;
  for (const h of haulers) host._reactWrongWay(h, { role: 'hauler' }, [], state, player);
  assert.equal(spawns.length, 1, 'tug spawned after four oncoming hulls');

  // Flash cooldown on the same hull.
  state.simTime = 7;
  host._reactWrongWay(hauler, { role: 'hauler' }, [], state, player);
  assert.equal(flashEvents.filter((f) => f.hullId === 'wh').length, 1, 'per-hull flash cooldown');

  // Turn around: fly with the flow until the window decays, the tug leaves.
  hauler.vel = { x: 40, z: 0 };
  haulers[0].vel = { x: 40, z: 0 };
  haulers[1].vel = { x: 40, z: 0 };
  haulers[2].vel = { x: 40, z: 0 };
  state.simTime = 10;
  host._stepWrongWayTurnaround(state, player);
  state.simTime = 17;
  host._stepWrongWayTurnaround(state, player);
  assert.equal(standDowns.length, 1, 'the tug stands down when you turn');
  assert.ok(removed.includes(spawns[0].id), 'the tug leaves the lane');
});

// ---------------------------------------------------------------------------
// PL-176 Through the moorings
// ---------------------------------------------------------------------------

test('PL-176 boost across a field of parked ships: alarms chirp in sequence, a wave of complaint follows', () => {
  const bus = createBus();
  const alarmEvents = [];
  const waveEvents = [];
  bus.on(PLANTS_MOORING_ALARM_EVENT, (p) => alarmEvents.push(p));
  bus.on(PLANTS_MOORING_WAVE_EVENT, (p) => waveEvents.push(p));
  const player = makePlayer({ vx: 180 });
  const entities = new Map([['p1', player]]);
  const parked = [];
  for (let i = 0; i < 5; i += 1) {
    const p = makeShip(`park${i}`, { x: 40 + i * 20, z: 10 * (i % 2 ? 1 : -1), data: { parked: true } });
    p.vel = { x: 0, z: 0 };
    parked.push(p);
    entities.set(p.id, p);
  }
  const state = makeState({ simTime: 30, entities });
  const plant = mooringAlarmsPlant;
  const { voices, cues } = makeHost(bus, state, {}, null);
  plant.init({ bus, state, helpers: { voice: { say: (m) => voices.push(structuredClone(m)) } } });
  bus.on('audio:cue', (p) => cues.push(structuredClone(p)));

  plant.update();
  assert.equal(alarmEvents.length, 5, 'every parked ship in the pass chirps');
  for (const p of parked) assert.equal(p.data.lampsFlashing, true, 'alarm lamps wake');
  assert.ok(cues.filter((c) => c.id === 'warning').length >= 5, 'alarm chirps sound');
  assert.equal(waveEvents.length, 1, 'the whole field complains once');
  assert.ok(voices.length === 1, 'one complaint line on the radio');
  plant.destroy();
});

test('PL-176 a slow player passes quiet; the same ship will not chirp twice inside the cooldown', () => {
  const bus = createBus();
  const alarmEvents = [];
  bus.on(PLANTS_MOORING_ALARM_EVENT, (p) => alarmEvents.push(p));
  const slowPlayer = makePlayer({ vx: 40 });
  const parked = makeShip('park', { x: 60, z: 0, data: { parked: true } });
  parked.vel = { x: 0, z: 0 };
  const state = makeState({ simTime: 30, entities: new Map([['p1', slowPlayer], ['park', parked]]) });
  const { cues } = makeHost(bus, state, {}, null);
  const plant = mooringAlarmsPlant;
  plant.init({ bus, state, helpers: { voice: { say: () => {} } } });
  bus.on('audio:cue', (p) => cues.push(structuredClone(p)));

  plant.update();
  assert.equal(alarmEvents.length, 0, 'no alarm without boost');
  assert.equal(cues.length, 0);

  slowPlayer.vel = { x: 180, z: 0 };
  plant.update();
  assert.equal(alarmEvents.length, 1);
  plant.update();
  assert.equal(alarmEvents.length, 1, 'per-ship chirp cooldown');
  plant.destroy();
});

test('plant entity reads share canonical Map order and refresh after swap-pop and id reuse', () => {
  const sim = createSimulation({ systems: [] });
  const { state, helpers } = sim;
  const spec = { pos: { x: 0, z: 0 }, hull: 100 };
  const first = sim.spawn({ ...spec, type: 'ship' });
  const station = sim.spawn({ ...spec, type: 'station', data: { stationId: 'station_helios' } });
  const last = sim.spawn({ ...spec, type: 'ship' });
  const initial = plantMapOrder(state);
  assert.deepEqual(initial, [first, station, last]);
  const values = state.entities.values.bind(state.entities);
  let fullScans = 0;
  state.entities.values = () => { fullScans++; return values(); };
  assert.equal(plantMapOrder(state), initial);
  assert.equal(plantStationById(state, 'station_helios'), station);
  assert.equal(plantStationById(state, 'station_missing'), null);
  assert.equal(fullScans, 0, 'an indexed station lookup and stable cursor require no full traversal');

  helpers.removeEntity(first.id, { immediate: true });
  const replacement = sim.spawn({ ...spec, type: 'ship' });
  assert.equal(replacement.id, first.id);
  assert.deepEqual(state.entityList, [last, station, replacement]);
  assert.deepEqual(plantMapOrder(state), [station, last, replacement]);
  assert.equal(fullScans, 1, 'same-size membership changes refresh the ordered view once');
});

// ---------------------------------------------------------------------------
// PL-177 The slow emergency
// ---------------------------------------------------------------------------

test('PL-177 a pod hangs snagged off an oblivious civilian; bump it back in for a flash of thanks', () => {
  const bus = createBus();
  const hungEvents = [];
  const returnedEvents = [];
  bus.on(PLANTS_SNAGGED_POD_EVENT, (p) => hungEvents.push(p));
  bus.on(PLANTS_SNAGGED_RETURNED_EVENT, (p) => returnedEvents.push(p));
  const host = { x: 500, z: 0, vx: 30, data: { trafficRole: 'hauler', cargo: { ore: 6 } } };
  const civilian = makeShip('civ1', host);
  const player = makePlayer({});
  const state = makeState({ simTime: 0, entities: new Map([['p1', player], ['civ1', civilian]]) });
  const { helpers, voices, cues } = makeHost(bus, state, {}, null);
  snaggedPodPlant.init({ bus, state, helpers });
  bus.on('audio:cue', (p) => cues.push(structuredClone(p)));

  snaggedPodPlant.update(); // t=0: hangs a pod
  assert.equal(hungEvents.length, 1, 'one pod hangs there, snagged');
  const podId = hungEvents[0].podId;
  const pod = state.entities.get(podId);
  assert.equal(pod.data.snaggedTo, 'civ1');
  assert.equal(pod.data.masslineTetherable, true);
  assert.ok(Math.abs(pod.vel.x - 30) < 1e-6, 'snagged: riding along, not falling');

  bus.emit('physics:impact', { aId: podId, bId: 'p1', dp: 600, trauma: 0, impulse: 600, preSolveClosingSpeed: 24, causalActorId: 'p1' });
  assert.equal(returnedEvents.length, 1, 'a gentle bump returns it');
  assert.equal(civilian.data.lampsFlashing, true, 'a flash of thanks');
  assert.ok(voices.some((v) => v.text === SNAGGED_THANKS_LINE));
  snaggedPodPlant.destroy();
});

test('PL-177 take it and they never knew; bump it loose and everyone knows', () => {
  const bus = createBus();
  const hungEvents = [];
  const takenEvents = [];
  const looseEvents = [];
  bus.on(PLANTS_SNAGGED_POD_EVENT, (p) => hungEvents.push(p));
  bus.on(PLANTS_SNAGGED_TAKEN_EVENT, (p) => takenEvents.push(p));
  bus.on(PLANTS_SNAGGED_LOOSE_EVENT, (p) => looseEvents.push(p));
  const civilian = makeShip('civ1', { x: 500, z: 0, vx: 30, data: { trafficRole: 'hauler', cargo: { ore: 6 } } });
  const player = makePlayer({});
  const state = makeState({ simTime: 0, entities: new Map([['p1', player], ['civ1', civilian]]) });
  const { helpers, voices } = makeHost(bus, state, {}, null);
  snaggedPodPlant.init({ bus, state, helpers });

  snaggedPodPlant.update();
  const podId = hungEvents[0].podId;

  // Take it: they never knew.
  bus.emit('pickup:collected', { pickupId: podId, collectorId: 'p1', kind: 'cargo', amount: 1, pos: { x: 0, z: 0 } });
  assert.equal(takenEvents.length, 1);
  assert.equal(looseEvents.length, 0, 'no alarm when taken quietly');
  assert.ok(!voices.some((v) => v.text === SNAGGED_ALARM_LINE));

  // A fresh pod, bumped loose hard: everyone knows.
  state.simTime = 80;
  snaggedPodPlant.update();
  assert.equal(hungEvents.length, 2, 'the world hangs another pod later');
  const pod2 = hungEvents[1].podId;
  bus.emit('physics:impact', { aId: pod2, bId: 'p1', dp: 4000, trauma: 0, impulse: 4000, preSolveClosingSpeed: 160, causalActorId: 'p1' });
  assert.equal(looseEvents.length, 1, 'a hard bump knocks it loose');
  assert.equal(civilian.data.lampsFlashing, true, 'the owner notices');
  assert.ok(voices.some((v) => v.text === SNAGGED_ALARM_LINE));
  snaggedPodPlant.destroy();
});

// ---------------------------------------------------------------------------
// PL-197 The dead lane
// ---------------------------------------------------------------------------

test('PL-197 the lane goes dark, locals still run it on horns, and a towed lamp line relights it', () => {
  const bus = createBus();
  const darkEvents = [];
  const hornEvents = [];
  const relitEvents = [];
  bus.on(PLANTS_DEAD_LANE_DARK_EVENT, (p) => darkEvents.push(p));
  bus.on(PLANTS_DEAD_LANE_HORN_EVENT, (p) => hornEvents.push(p));
  bus.on(PLANTS_DEAD_LANE_RELIT_EVENT, (p) => relitEvents.push(p));
  const player = makePlayer({ x: 200, z: 0 });
  const entities = new Map([['p1', player]]);
  const beacons = [];
  for (let i = 0; i < 10; i += 1) {
    const b = makeBeacon(`bk${i}`, { x: 200 + i * 30, z: 0 });
    beacons.push(b);
    entities.set(b.id, b);
  }
  const local = makeShip('loc1', { x: 230, z: 0, vx: 25, data: { trafficRole: 'hauler' } });
  entities.set('loc1', local);
  const state = makeState({ simTime: 0, entities });
  const { cues } = makeHost(bus, state, {}, null);
  deadLanePlant.init({ bus, state, helpers: { spawnEntity: () => null, removeEntity: () => {} } });
  bus.on('audio:cue', (p) => cues.push(structuredClone(p)));
  bus.emit('sector:enter', { sectorId: 's1' });

  deadLanePlant.update(); // schedules the failure
  state.simTime = 21;
  deadLanePlant.update(); // the lamps fail
  assert.ok(darkEvents.length >= 1, 'beacons go dark');
  const darkBeacons = beacons.filter((b) => b.data.beaconDark === true);
  assert.ok(darkBeacons.length >= 1);

  state.simTime = 22;
  deadLanePlant.update(); // locals lean on their horns through the dark
  assert.ok(hornEvents.some((h) => h.hullId === 'loc1' && h.thanked === false), 'traffic still runs it, on horns');
  assert.ok(cues.some((c) => c.id === 'sfx_hauler_blast_lean'));

  // Tow a lamp line down it: a lit beacon on the player's tether.
  const lamp = makeBeacon('lamp1', { x: 1000, z: 0 });
  entities.set('lamp1', lamp); // spawned after the darkening: never darkened
  bus.emit('tether:snapCatch', { targetId: 'lamp1', t: state.simTime }); // tow latched: live seam
  player.pos = { x: darkBeacons[0].pos.x + 10, z: 0 };
  state.simTime = 30;
  deadLanePlant.update();
  assert.ok(relitEvents.length >= 1, 'the lamp line relights the lane');
  assert.equal(darkBeacons[0].data.beaconDark, false);
  assert.ok(hornEvents.some((h) => h.thanked === true), 'thanked in horns');
  deadLanePlant.destroy();
});

test('PL-197 without the dark lane there are no horns and nothing relights', () => {
  const bus = createBus();
  const darkEvents = [];
  const hornEvents = [];
  bus.on(PLANTS_DEAD_LANE_DARK_EVENT, (p) => darkEvents.push(p));
  bus.on(PLANTS_DEAD_LANE_HORN_EVENT, (p) => hornEvents.push(p));
  const player = makePlayer({});
  const beacon = makeBeacon('bk', { x: 100, z: 0 });
  const state = makeState({ simTime: 0, entities: new Map([['p1', player], ['bk', beacon]]) });
  makeHost(bus, state, {}, null);
  deadLanePlant.init({ bus, state, helpers: {} });
  bus.emit('sector:enter', { sectorId: 's1' });

  state.simTime = 40;
  deadLanePlant.update();
  assert.equal(darkEvents.length, 0, 'a hash can leave a short lane lit — no beacons dark here');
  assert.equal(beacon.data.beaconDark, undefined);
  assert.equal(hornEvents.length, 0);
  deadLanePlant.destroy();
});

// ---------------------------------------------------------------------------
// PL-198 The orphan
// ---------------------------------------------------------------------------

test('PL-198 the ownerless wreck drifts in; traffic files around it; three owners appear at the dock', () => {
  const bus = createBus();
  const spawnEvents = [];
  const fileEvents = [];
  const argEvents = [];
  const ownerEvents = [];
  bus.on(PLANTS_ORPHAN_SPAWN_EVENT, (p) => spawnEvents.push(p));
  bus.on(PLANTS_ORPHAN_FILE_EVENT, (p) => fileEvents.push(p));
  bus.on(PLANTS_ORPHAN_ARGUMENT_EVENT, (p) => argEvents.push(p));
  bus.on(PLANTS_ORPHAN_OWNERS_EVENT, (p) => ownerEvents.push(p));
  const player = makePlayer({});
  const filer = makeShip('f1', { x: 100, z: 0, vx: 15, data: { trafficRole: 'courier' } });
  const state = makeState({ simTime: 30, entities: new Map([['p1', player], ['f1', filer]]) });
  const { host, spawns, removed, popups } = makeHost(bus, state, orphanWreckOps, (h) => h._initOrphanWreck());
  // The orphan is a sector-late drifter: it enters on the sector lifecycle, 25 s after arrival.
  state.simTime = 0;
  bus.emit('sector:enter', { sectorId: 's1' });
  state.simTime = 30;

  host._reactOrphanWreck(filer, { role: 'courier' }, [], state, player);
  assert.equal(spawnEvents.length, 1, 'the wreck nobody owns appears');
  const wreck = spawns[0];
  assert.equal(wreck.data.orphanWreck, true);
  assert.equal(wreck.data.masslineTetherable, true, 'it can be towed');

  // Everyone files around it.
  filer.pos = { x: wreck.pos.x + 100, z: wreck.pos.z };
  const claimed = host._reactOrphanWreck(filer, { role: 'courier' }, [], state, player);
  assert.equal(claimed, true, 'the filing beat claims the hull for the tick');
  assert.equal(fileEvents.length, 1);
  assert.ok(Number.isFinite(filer.data.intent.aimAngle), 'the hull steers around the wreck');

  // The nearest town argues about it on open radio.
  state.simTime = 90;
  filer.pos = { x: wreck.pos.x + 400, z: wreck.pos.z };
  host._reactOrphanWreck(filer, { role: 'courier' }, [], state, player);
  assert.equal(argEvents.length, 1, 'the argument goes out');
  for (const line of ORPHAN_ARGUMENT_LINES) {
    assert.ok(popups.some((p) => p.text === line), `argument line: ${line}`);
  }

  // Tow it to the dock and watch three owners appear: the tow latch must be fresh
  // (towGraceS), so latch through the live tether seam just before arrival.
  state.simTime = 95;
  bus.emit('tether:snapCatch', { targetId: wreck.id, t: state.simTime });
  const dock = makeStation('dockA', { x: wreck.pos.x + 100, z: wreck.pos.z });
  state.stations = [dock];
  state.simTime = 100;
  host._reactOrphanWreck(filer, { role: 'courier' }, [], state, player);
  assert.equal(ownerEvents.length, 1, 'three owners appear');
  assert.equal(ownerEvents[0].owners, 3);
  assert.equal(popups.filter((p) => p.sender === 'OWNER 1' || p.sender === 'OWNER 2' || p.sender === 'OWNER 3').length, 3);

  // The claim settles; the wreck leaves the lane.
  state.simTime = 130;
  host._reactOrphanWreck(filer, { role: 'courier' }, [], state, player);
  assert.ok(removed.includes(wreck.id), 'the wreck leaves with its owners');
});

test('PL-198 no filing from afar; a refused lease aborts the beat without writing intent', () => {
  const bus = createBus();
  const fileEvents = [];
  bus.on(PLANTS_ORPHAN_FILE_EVENT, (p) => fileEvents.push(p));
  const player = makePlayer({});
  const filer = makeShip('f1', { x: 0, z: 0, vx: 15, data: { trafficRole: 'courier', jobId: 'j1' } });
  const state = makeState({ simTime: 1000, entities: new Map([['p1', player], ['f1', filer]]) });
  const { host } = makeHost(bus, state, orphanWreckOps, (h) => h._initOrphanWreck());
  // Sector lifecycle: enter, wait out the spawn delay, then the wreck is there to file around.
  bus.emit('sector:enter', { sectorId: 's1' });
  state.simTime = 1030;
  // Job owner refuses the lease.
  host.helpers.npcJobs = {
    claimControl: () => ({ granted: false }),
    releaseControl: () => {},
    interrupt: () => {},
    resume: () => {},
    controlClaim: () => ({ claimId: 'other' }),
  };

  const first = host._reactOrphanWreck(filer, { role: 'courier' }, [], state, player);
  assert.equal(first, false, 'the wreck spawned far away: nothing files yet');
  assert.equal(fileEvents.length, 0);

  // Close to the wreck now: the lease is refused, so the beat aborts with no intent write.
  const wreck = state.entities.get(host._orphanRow.wreckId);
  filer.pos = { x: wreck.pos.x + 100, z: wreck.pos.z };
  const claimed = host._reactOrphanWreck(filer, { role: 'courier' }, [], state, player);
  assert.equal(claimed, false, 'a refused lease never claims the hull');
  assert.equal(fileEvents.length, 0);
  assert.equal(filer.data.intent.moveZ, 0, 'no intent written on a refused lease');
});

// ---------------------------------------------------------------------------
// PL-217 The sweeping line
// ---------------------------------------------------------------------------

test('PL-217 after a spill the sweeper walks the debris into a pile; joining halves it; thanks goes out', () => {
  const bus = createBus();
  const startEvents = [];
  const doneEvents = [];
  bus.on(PLANTS_SWEEP_START_EVENT, (p) => startEvents.push(p));
  bus.on(PLANTS_SWEEP_DONE_EVENT, (p) => doneEvents.push(p));
  const player = makePlayer({});
  const podA = makeCargo('podA', { x: 10, z: 0 });
  const podB = makeCargo('podB', { x: -12, z: 4 });
  const state = makeState({ simTime: 50, entities: new Map([['p1', player], ['podA', podA], ['podB', podB]]) });
  const { host, spawns, popups, cues } = makeHost(bus, state, sweepingLineOps, (h) => h._initSweepingLine());

  bus.emit('freight:cargoSpilled', { carrierId: 'c1', ownerId: 'o1', entityId: 'podA', pos: { x: 0, z: 0 }, podIds: ['podA', 'podB'], t: 50 });
  assert.equal(startEvents.length, 1, 'the sweeper arrives');
  assert.equal(spawns.length, 1);
  const sweeper = spawns[0];
  assert.equal(sweeper.data.plantsSweepSquad, true);

  // The wedge gathers near-pile pods immediately: piled >= target -> done.
  let claimed = host._reactSweepingLine(sweeper, { role: 'tug' }, [], state, player);
  assert.equal(claimed, false, 'pile already clean: sweep completes at once');
  assert.equal(doneEvents.length, 1);
  assert.ok(popups.some((p) => p.text === SWEEP_THANKS_LINE), "the owner's thanks goes out on open radio");
  assert.ok(cues.some((c) => c.id === 'confirm'));

  // A spill with far pods: the sweep claims the sweeper and pushes pods toward the pile.
  podA.pos = { x: 120, z: 0 };
  podB.pos = { x: 130, z: 0 };
  bus.emit('freight:cargoSpilled', { carrierId: 'c2', ownerId: 'o2', entityId: 'podA', pos: { x: 0, z: 0 }, podIds: ['podA', 'podB'], t: 50 });
  const sweeper2 = spawns[spawns.length - 1];
  claimed = host._reactSweepingLine(sweeper2, { role: 'tug' }, [], state, player);
  assert.equal(claimed, true, 'the sweep beat is leased');
  assert.ok(podA.vel.x < 0, 'pods feel the wedge, toward the pile');

  // Join with yours: bump a spill pod inside the join radius; the sweep halves.
  player.pos = { x: 110, z: 0 };
  bus.emit('physics:impact', { aId: 'podA', bId: 'p1', trauma: 2, dp: 100, causalActorId: 'p1' });
  claimed = host._reactSweepingLine(sweeper2, { role: 'tug' }, [], state, player);
  assert.equal(claimed, true);
  // Move pods into the pile: done with joined=true.
  podA.pos = { x: 5, z: 0 };
  podB.pos = { x: -5, z: 0 };
  host._reactSweepingLine(sweeper2, { role: 'tug' }, [], state, player);
  assert.equal(doneEvents.length, 2);
  assert.equal(doneEvents[1].joined, true, 'the sweep was joined');
});

test('PL-217 sweep the pile your own way and everyone sees it', () => {
  const bus = createBus();
  const strayEvents = [];
  bus.on(PLANTS_SWEEP_STRAY_EVENT, (p) => strayEvents.push(p));
  const player = makePlayer({ x: 900, z: 0 });
  const podA = makeCargo('podA', { x: 100, z: 0 });
  const podB = makeCargo('podB', { x: 400, z: 0 });
  const state = makeState({ simTime: 50, entities: new Map([['p1', player], ['podA', podA], ['podB', podB]]) });
  const { host, spawns, popups, voices } = makeHost(bus, state, sweepingLineOps, (h) => h._initSweepingLine());

  bus.emit('freight:cargoSpilled', { carrierId: 'c1', ownerId: 'o1', entityId: 'podA', podIds: ['podA', 'podB'], t: 50 });
  const sweeper = spawns[0];
  host._reactSweepingLine(sweeper, { role: 'tug' }, [], state, player); // completes: podB at 400 is beyond stray radius
  // Wait: podB at 400 > strayRadius (300) from the pile, but the player is far too, so the
  // first impact path classifies as stray only on a player impact. Drag it out for real.
  assert.equal(strayEvents.length, 0, 'no stray without the player dragging');
  podB.pos = { x: 700, z: 0 };
  player.pos = { x: 690, z: 0 };
  bus.emit('physics:impact', { aId: 'podB', bId: 'p1', trauma: 2, dp: 100, causalActorId: 'p1' });
  assert.equal(strayEvents.length, 1, 'everyone saw which way the wedge went');
  assert.ok(voices.some((v) => v.text === SWEEP_STRAY_LINE));
});

// ---------------------------------------------------------------------------
// PL-218 The doorstop
// ---------------------------------------------------------------------------

test('PL-218 the shutter jams; pin it open and the dockhand chalks your tag', () => {
  const bus = createBus();
  const jamEvents = [];
  const tagEvents = [];
  bus.on(PLANTS_DOORSTOP_JAM_EVENT, (p) => jamEvents.push(p));
  bus.on(PLANTS_DOORSTOP_CHALK_TAG_EVENT, (p) => tagEvents.push(p));
  const station = makeStation('st1', { x: 0, z: 0 });
  const player = makePlayer({});
  const state = makeState({ simTime: 10, entities: new Map([['p1', player]]), stations: [station] });
  const { host, spawns, popups, cues } = makeHost(bus, state, doorstopOps, (h) => h._initDoorstop());

  bus.emit('dock:range', { stationId: 'st1', shipId: 'p1', inRange: true }); // first visit: schedules
  state.simTime = 300; // two quiet cycles later, on the third: it jams
  bus.emit('dock:range', { stationId: 'st1', shipId: 'p1', inRange: true });
  assert.equal(jamEvents.length, 1, 'the rolling shutter jams half-open');
  const prop = spawns[0];
  assert.equal(prop.data.doorstopShutter, true);
  assert.ok(Number.isFinite(prop.mass) && prop.mass > 100, 'pinning means shoving a real mass');

  const geometry = doorstopDoorGeometry(station);
  prop.pos = { x: geometry.openMark.x, z: geometry.openMark.z };
  bus.emit('physics:impact', { aId: prop.id, bId: 'p1', trauma: 3, causalActorId: 'p1' });
  assert.equal(tagEvents.length, 1, 'pinned open: the queue flows');
  assert.ok(popups.some((p) => p.text === DOORSTOP_TAG_LINE), 'the dockhand chalks your tag');
  assert.ok(cues.some((c) => c.id === 'confirm'));
});

test('PL-218 pin it shut instead: the dock reroutes and a number replaces your tag', () => {
  const bus = createBus();
  const numberEvents = [];
  bus.on(PLANTS_DOORSTOP_CHALK_NUMBER_EVENT, (p) => numberEvents.push(p));
  const station = makeStation('st2', { x: 0, z: 0 });
  const player = makePlayer({});
  const state = makeState({ simTime: 10, entities: new Map([['p1', player]]), stations: [station] });
  const { host, spawns, popups, cues } = makeHost(bus, state, doorstopOps, (h) => h._initDoorstop());

  bus.emit('dock:range', { stationId: 'st2', shipId: 'p1', inRange: true }); // schedules
  state.simTime = 300;
  bus.emit('dock:range', { stationId: 'st2', shipId: 'p1', inRange: true }); // third cycle: jammed
  const prop = spawns[0];
  const geometry = doorstopDoorGeometry(station);
  prop.pos = { x: geometry.shutMark.x, z: geometry.shutMark.z };
  bus.emit('physics:impact', { aId: prop.id, bId: 'p1', trauma: 3, causalActorId: 'p1' });
  assert.equal(numberEvents.length, 1, 'the dock reroutes');
  assert.equal(numberEvents[0].number, 1, 'the dockhand chalks a number where your tag was going');
  assert.ok(popups.some((p) => p.text === DOORSTOP_NUMBER_LINE));
  assert.ok(cues.some((c) => c.id === 'ui_deny'));

  // Neither mark: no chalk of either kind.
  prop.pos = { x: geometry.door.x, z: geometry.door.z };
  bus.emit('physics:impact', { aId: prop.id, bId: 'p1', trauma: 3, causalActorId: 'p1' });
  assert.equal(numberEvents.length, 1, 'the shutter mid-travel chalks nothing');
});

// ---------------------------------------------------------------------------
// PL-219 One yank
// ---------------------------------------------------------------------------

test('PL-219 the loader drops a stack; a passing hauler yanks it into a stack and the lane applauds', () => {
  const bus = createBus();
  const dropEvents = [];
  const pullEvents = [];
  const applauseEvents = [];
  bus.on(PLANTS_ONE_YANK_DROP_EVENT, (p) => dropEvents.push(p));
  bus.on(PLANTS_ONE_YANK_PULL_EVENT, (p) => pullEvents.push(p));
  bus.on(PLANTS_ONE_YANK_APPLAUSE_EVENT, (p) => applauseEvents.push(p));
  const market = makeStation('market', { x: 0, z: 0 });
  const hauler = makeShip('yank1', { x: 10, z: 0, vx: 10, data: { trafficRole: 'hauler', cargo: { ore: 5 } } });
  const player = makePlayer({ x: 900, z: 900 });
  const state = makeState({ simTime: 0, entities: new Map([['p1', player], ['yank1', hauler]]), stations: [market] });
  const { host, spawns, cues } = makeHost(bus, state, oneYankOps, (h) => h._initOneYank());

  host._reactOneYank(hauler, { role: 'hauler' }, [market], state, player); // schedules the drop
  assert.equal(dropEvents.length, 0, 'the loader has not dropped yet');
  state.simTime = 31;
  const flying = host._reactOneYank(hauler, { role: 'hauler' }, [market], state, player);
  assert.equal(dropEvents.length, 1, 'a crate stack drops at the market');
  assert.equal(spawns.length, 3, 'three crates tumble');
  for (const pod of spawns) assert.equal(pod.data.oneYankFalling, true);
  assert.equal(pullEvents.length >= 1, true, 'the practiced yank pulls pods');
  assert.equal(flying, true, 'the yank beat is claimed');

  // Pods into the stack: the lane applauds.
  const stack = host._oneYankMemory.get('drop');
  for (const pod of spawns) pod.pos = { x: stack.stackX + 2, z: stack.stackZ + 2 };
  const after = host._reactOneYank(hauler, { role: 'hauler' }, [market], state, player);
  assert.equal(after, false);
  assert.equal(applauseEvents.length, 1, 'the lane applauds');
  assert.equal(market.data.dockLampsFlashing, true, 'dock lamps flash');
  assert.ok(cues.some((c) => c.id === 'confirm'));
});

test('PL-219 try it yourself: misjudge the well and the whole pile lands on you', () => {
  const bus = createBus();
  const landedEvents = [];
  bus.on(PLANTS_ONE_YANK_LANDED_EVENT, (p) => landedEvents.push(p));
  const market = makeStation('market', { x: 0, z: 0 });
  const hauler = makeShip('yank1', { x: 900, z: 900, vx: 10, data: { trafficRole: 'hauler', cargo: { ore: 5 } } });
  const player = makePlayer({ x: 900, z: 900 });
  const state = makeState({ simTime: 0, entities: new Map([['p1', player], ['yank1', hauler]]), stations: [market] });
  const { host, spawns, voices, cues } = makeHost(bus, state, oneYankOps, (h) => h._initOneYank());

  host._reactOneYank(hauler, { role: 'hauler' }, [market], state, player); // schedules the drop
  state.simTime = 31;
  host._reactOneYank(hauler, { role: 'hauler' }, [market], state, player); // drop happens far from the hauler
  const podId = spawns[0].id;

  // First touch: trying it yourself.
  bus.emit('physics:impact', { aId: podId, bId: 'p1', trauma: 0, impulse: 100, preSolveClosingSpeed: 3, dp: 100, causalActorId: 'p1' });
  const pullForPlayer = host._oneYankMemory.get('drop').playerTried;
  assert.equal(pullForPlayer, true, 'the attempt is registered');

  // Misjudged: the pile lands.
  bus.emit('physics:impact', { aId: podId, bId: 'p1', trauma: 0, impulse: 900, preSolveClosingSpeed: 14, dp: 900, causalActorId: 'p1' });
  assert.equal(landedEvents.length, 1, 'the whole pile lands on you');
  assert.ok(voices.some((v) => v.text === ONE_YANK_LANDED_LINE));
  assert.ok(cues.some((c) => c.id === 'ui_deny'));

  // Another hull bumping the pod is not your story.
  bus.emit('physics:impact', { aId: podId, bId: 'yank1', trauma: 0, impulse: 900, preSolveClosingSpeed: 14, dp: 900, causalActorId: 'yank1' });
  assert.equal(landedEvents.length, 1);
});

// ---------------------------------------------------------------------------
// PL-243 Perspective
// ---------------------------------------------------------------------------

test('PL-243 boost past a patrol while wanted and it does not even turn — someone worse is in the lane', () => {
  const bus = createBus();
  const passEvents = [];
  bus.on(PLANTS_PERSPECTIVE_EVENT, (p) => passEvents.push(p));
  const patrol = makeShip('pat1', { x: 100, z: 0, data: { trafficRole: 'patrol' }, team: 1 });
  const player = makePlayer({ vx: 160 });
  const state = makeState({ simTime: 0, entities: new Map([['p1', player]]) });
  state.player = { heat: 0.3 }; // wanted for something small: live heat ledger read
  const { host, spawns, voices } = makeHost(bus, state, perspectiveOps, (h) => h._initPerspective());

  const claimed = host._reactPerspective(patrol, { role: 'patrol' }, [], state, player);
  assert.equal(claimed, false, 'the patrol does not even turn');
  assert.equal(patrol.data.intent.moveZ, 0, 'no steering on the patrol');
  assert.equal(passEvents.length, 1);
  assert.equal(voices.length, 0, 'the patrol does not even speak');
  assert.equal(spawns.length, 1, 'someone worse is in the lane today');
  assert.equal(spawns[0].data.plantsWorseOne, true);

  // Go and find out who (listener registered first so the find is captured).
  const found = [];
  bus.on(PLANTS_PERSPECTIVE_FOUND_EVENT, (p) => found.push(p));
  player.pos = { x: spawns[0].pos.x + 30, z: spawns[0].pos.z };
  host._stepPerspectiveFind(state, player);
  assert.equal(spawns[0].data.ai.hostile, true, 'the worse-one turns when found');
  host._stepPerspectiveFind(state, player);
  assert.equal(found.length, 1, 'finding out happens once');
});

test('PL-243 clean players get no relativity; the pass cools down', () => {
  const bus = createBus();
  const passEvents = [];
  bus.on(PLANTS_PERSPECTIVE_EVENT, (p) => passEvents.push(p));
  const patrol = makeShip('pat1', { x: 100, z: 0, data: { trafficRole: 'patrol' }, team: 1 });
  const cleanPlayer = makePlayer({ vx: 160 });
  const state = makeState({ simTime: 0, entities: new Map([['p1', cleanPlayer]]) });
  const { host, spawns } = makeHost(bus, state, perspectiveOps, (h) => h._initPerspective());

  host._reactPerspective(patrol, { role: 'patrol' }, [], state, cleanPlayer);
  assert.equal(passEvents.length, 0, 'not wanted: no perspective');
  assert.equal(spawns.length, 0);

  const wanted = makePlayer({ vx: 160 });
  state.entities.set('p1', wanted);
  state.player = { heat: 0.3 }; // the live heat ledger read, not an invented flag
  host._reactPerspective(patrol, { role: 'patrol' }, [], state, wanted);
  assert.equal(passEvents.length, 1);
  state.simTime = 10;
  host._reactPerspective(patrol, { role: 'patrol' }, [], state, wanted);
  assert.equal(passEvents.length, 1, 'pass cooldown per patrol');
});

// ---------------------------------------------------------------------------
// PL-244 Paper trail
// ---------------------------------------------------------------------------

test('PL-244 unpaid fines chase you from dock to dock as paper tags', () => {
  const bus = createBus();
  const tagEvents = [];
  bus.on(PLANTS_PAPER_TRAIL_TAG_EVENT, (p) => tagEvents.push(p));
  const dockA = makeStation('dockA', { x: 0, z: 0 });
  const dockB = makeStation('dockB', { x: 500, z: 0 });
  const player = makePlayer({});
  const state = makeState({ simTime: 0, entities: new Map([['p1', player]]), stations: [dockA, dockB] });
  const { host, spawns } = makeHost(bus, state, paperTrailOps, (h) => h._initPaperTrail());

  // Two fines the player actually accrued: live law:incidentOpened receipts, attributed.
  const incident = () => bus.emit('law:incidentOpened', { attackerId: 'p1', victimId: 'v1', victimAnchor: { x: 0, z: 0 } });
  incident();
  incident();
  bus.emit('dock:range', { stationId: 'dockA', shipId: 'p1', inRange: true });
  assert.equal(tagEvents.length, 1, 'tags taped at your berth post');
  assert.equal(spawns.length, 2, 'one paper tag per fine');
  for (const tag of spawns) assert.equal(tag.data.paperTag, true);

  // They chase you: three more fines and the next post tapes its own trail.
  incident();
  incident();
  incident();
  bus.emit('dock:range', { stationId: 'dockB', shipId: 'p1', inRange: true });
  assert.equal(spawns.length, 7, 'the old post keeps its tags; the new post tapes five');
});

test('PL-244 pay them and the tags come off; let them accumulate for the bouquet', () => {
  const bus = createBus();
  const paidEvents = [];
  const bouquetEvents = [];
  bus.on(PLANTS_PAPER_TRAIL_PAID_EVENT, (p) => paidEvents.push(p));
  bus.on(PLANTS_PAPER_TRAIL_BOUQUET_EVENT, (p) => bouquetEvents.push(p));
  const dockA = makeStation('dockA', { x: 0, z: 0 });
  const player = makePlayer({});
  const state = makeState({ simTime: 0, entities: new Map([['p1', player]]), stations: [dockA] });
  const { host, spawns, removed, popups } = makeHost(bus, state, paperTrailOps, (h) => h._initPaperTrail());

  // Eight accrued fines; the post caps the tape at a bouquet.
  for (let i = 0; i < 8; i += 1) {
    bus.emit('law:incidentOpened', { attackerId: 'p1', victimId: 'v1', victimAnchor: { x: 0, z: 0 } });
  }
  bus.emit('dock:range', { stationId: 'dockA', shipId: 'p1', inRange: true });
  assert.equal(spawns.length, 5, 'the berth post holds a bounded bouquet');
  assert.equal(bouquetEvents.length, 1, 'a bouquet of debts');
  assert.ok(popups.some((p) => p.text === PAPER_TRAIL_BOUQUET_LINE));

  // Pay at the window: law:fineAssessed receipts actually paid, one per fine.
  for (let i = 0; i < 8; i += 1) {
    bus.emit('law:fineAssessed', { stationId: 'dockA', amount: 100, paid: true, choice: 'pay', alreadySettled: false });
  }
  bus.emit('dock:range', { stationId: 'dockA', shipId: 'p1', inRange: true });
  assert.equal(paidEvents.length, 1, 'clean slate');
  assert.equal(removed.length, 5, 'the tags come off the post');
  assert.ok(popups.some((p) => p.text === PAPER_TRAIL_CLEAN_LINE));
});

// ---------------------------------------------------------------------------
// PL-121 Your berth
// ---------------------------------------------------------------------------

test('PL-121 dock in the same berth five times running and the dockhand chalks your tag', () => {
  const bus = createBus();
  const chalkEvents = [];
  bus.on(PLANTS_YOUR_BERTH_CHALK_EVENT, (p) => chalkEvents.push(p));
  const station = makeStation('st1', { x: 0, z: 0 });
  const state = makeState({ simTime: 0, entities: new Map(), stations: [station] });
  const { host, popups } = makeHost(bus, state, yourBerthOps, (h) => h._initYourBerth());

  for (let i = 0; i < 4; i += 1) {
    state.simTime = i;
    bus.emit('dock:range', { stationId: 'st1', shipId: 'p1', inRange: true });
  }
  assert.equal(chalkEvents.length, 0, 'four times is not a regular yet');
  state.simTime = 4;
  bus.emit('dock:range', { stationId: 'st1', shipId: 'p1', inRange: true });
  assert.equal(chalkEvents.length, 1, 'five times running: chalked');
  assert.ok(popups.some((p) => p.text === YOUR_BERTH_CHALK_LINE));
  assert.equal(station.data.chalkedBerth.pilotId, 'p1');
  assert.equal(station.data.chalkedBerth.berthId, berthIdFor('st1', 'p1'));
});

test('PL-121 strangers get shooed out of your chalked berth; a squatter gets the morning tow', () => {
  const bus = createBus();
  const chalkEvents = [];
  const shooEvents = [];
  const towEvents = [];
  bus.on(PLANTS_YOUR_BERTH_CHALK_EVENT, (p) => chalkEvents.push(p));
  bus.on(PLANTS_YOUR_BERTH_SHOO_EVENT, (p) => shooEvents.push(p));
  bus.on(PLANTS_YOUR_BERTH_TOW_EVENT, (p) => towEvents.push(p));
  const station = makeStation('st1', { x: 0, z: 0 });
  const state = makeState({ simTime: 0, entities: new Map(), stations: [station] });
  const { host, voices, popups } = makeHost(bus, state, yourBerthOps, (h) => h._initYourBerth());

  for (let i = 0; i < 5; i += 1) {
    state.simTime = i;
    bus.emit('dock:range', { stationId: 'st1', shipId: 'p1', inRange: true });
  }
  assert.equal(chalkEvents.length, 1);

  // Stranger squatting at your berth post gets shooed.
  const berthId = berthIdFor('st1', 'p1');
  const ang = (hash32('st1', 'berthPoint', berthId) % 6283) / 1000;
  const stranger = makeShip('npc9', { x: Math.cos(ang) * 60, z: Math.sin(ang) * 60, vx: 10, data: { trafficRole: 'courier' } });
  state.entities.set('npc9', stranger);
  const claimed = host._reactYourBerth(stranger, { role: 'courier' }, [station], state, null);
  assert.equal(claimed, true, 'the shoo beat claims the hull');
  assert.equal(shooEvents.length, 1);
  assert.ok(voices.some((v) => v.text === YOUR_BERTH_SHOO_LINE));

  // A different pilot docks in the chalked berth: the morning tow is scheduled.
  state.simTime = 10;
  bus.emit('dock:range', { stationId: 'st1', shipId: 'npc7', inRange: true });
  host._reactYourBerth(stranger, { role: 'courier' }, [station], state, null);
  assert.equal(towEvents.length, 0, 'the tow is gentle, it waits for morning');
  state.simTime = 40;
  host._reactYourBerth(stranger, { role: 'courier' }, [station], state, null);
  assert.equal(towEvents.length, 1, 'the morning tow comes');
  assert.ok(popups.some((p) => p.text === YOUR_BERTH_TOW_LINE));
  assert.equal(station.data.dockLampsFlashing, true, 'the look: the lamp burns red');
});

// ---------------------------------------------------------------------------
// PL-122 Red at home
// ---------------------------------------------------------------------------

test('PL-122 come home wanted and lit: your own berth lamp burns red; dock dark and he saw nothing', () => {
  const bus = createBus();
  const redEvents = [];
  const seenNothingEvents = [];
  bus.on(PLANTS_RED_AT_HOME_EVENT, (p) => redEvents.push(p));
  bus.on(PLANTS_RED_AT_HOME_SEEN_NOTHING_EVENT, (p) => seenNothingEvents.push(p));
  const home = makeStation('home', { x: 0, z: 0 });
  const player = makePlayer({});
  const state = makeState({ simTime: 0, entities: new Map([['p1', player]]), stations: [home] });
  const { host, voices } = makeHost(bus, state, redAtHomeOps, (h) => h._initRedAtHome());

  // First dock defines home.
  bus.emit('dock:range', { stationId: 'home', shipId: 'p1', inRange: true });

  // Come home wanted (live heat ledger), docked lit (renderer-visible lamp flag): red lamp.
  state.player = { heat: 0.3 };
  player.data.lampsFlashing = true;
  state.simTime = 10;
  bus.emit('dock:range', { stationId: 'home', shipId: 'p1', inRange: true });
  assert.equal(redEvents.length, 1, 'your own berth lamp burns red');
  assert.equal(home.data.dockLampsFlashing, true);
  assert.ok(Number.isFinite(home.data.dockLampFlashUntil));

  // Dock dark: he saw nothing — the exact line.
  player.data.lampsFlashing = false;
  state.simTime = 40;
  bus.emit('dock:range', { stationId: 'home', shipId: 'p1', inRange: true });
  assert.equal(seenNothingEvents.length, 1);
  assert.ok(voices.some((v) => v.text === RED_AT_HOME_LINE), 'the exact quoted line');
});

test('PL-122 pay at the window and the red goes out; dark docks cool down', () => {
  const bus = createBus();
  const seenNothingEvents = [];
  const redEvents = [];
  bus.on(PLANTS_RED_AT_HOME_SEEN_NOTHING_EVENT, (p) => seenNothingEvents.push(p));
  bus.on(PLANTS_RED_AT_HOME_EVENT, (p) => redEvents.push(p));
  const home = makeStation('home', { x: 0, z: 0 });
  const other = makeStation('other', { x: 900, z: 0 });
  const player = makePlayer({});
  const state = makeState({ simTime: 0, entities: new Map([['p1', player]]), stations: [home, other] });
  state.player = { heat: 0.3 }; // wanted: the live heat ledger read
  const { host, cues } = makeHost(bus, state, redAtHomeOps, (h) => h._initRedAtHome());

  bus.emit('dock:range', { stationId: 'home', shipId: 'p1', inRange: true }); // defines home, dark, wanted
  assert.equal(seenNothingEvents.length, 1, 'first dark wanted dock: saw nothing');

  state.simTime = 5;
  bus.emit('dock:range', { stationId: 'home', shipId: 'p1', inRange: true });
  assert.equal(seenNothingEvents.length, 1, 'he keeps seeing nothing, but not twice in a breath');

  // Docked lit and wanted: the home lamp burns red.
  player.data.lampsFlashing = true;
  state.simTime = 40;
  bus.emit('dock:range', { stationId: 'home', shipId: 'p1', inRange: true });
  assert.equal(redEvents.length, 1);
  assert.ok(Number.isFinite(home.data.dockLampRedUntil));

  // Only home burns red: another town does nothing.
  state.simTime = 80;
  bus.emit('dock:range', { stationId: 'other', shipId: 'p1', inRange: true });
  assert.equal(redEvents.length, 1);

  // Pay at the window: heat clears, the red goes out.
  state.player = { heat: 0 };
  state.simTime = 120;
  bus.emit('dock:range', { stationId: 'home', shipId: 'p1', inRange: true });
  assert.equal(home.data.dockLampRedUntil, -Infinity, 'the red lamp goes out');
  assert.ok(cues.some((c) => c.id === 'confirm'));
});

// ---------------------------------------------------------------------------
// PL-123 Someone's course
// ---------------------------------------------------------------------------

test('PL-123 planted anchors dot a swing line; run it clean and get the nod', () => {
  const bus = createBus();
  const plantedEvents = [];
  const nodEvents = [];
  bus.on(PLANTS_SWING_LINE_PLANTED_EVENT, (p) => plantedEvents.push(p));
  bus.on(PLANTS_SWING_LINE_NOD_EVENT, (p) => nodEvents.push(p));
  const player = makePlayer({ x: 10, z: 0 });
  const state = makeState({ simTime: 0, entities: new Map([['p1', player]]) });
  const { helpers, voices, cues } = makeHost(bus, state, {}, null);
  someonesCoursePlant.init({ bus, state, helpers });
  bus.on('audio:cue', (p) => cues.push(structuredClone(p)));

  someonesCoursePlant.update(); // schedules the planting
  state.simTime = 11;
  someonesCoursePlant.update(); // plants the line
  assert.equal(plantedEvents.length, 1);
  assert.equal(plantedEvents[0].anchorIds.length, 5, 'planted anchors dot the lane');
  const anchors = swingLineAnchors('s1', { x: 0, z: 0 });
  assert.equal(anchors.length, 5);

  // Run it clean, in order, inside the timer.
  for (let i = 0; i < anchors.length; i += 1) {
    state.simTime = 12 + i;
    player.pos = { x: anchors[i].x + 10, z: anchors[i].z };
    someonesCoursePlant.update();
  }
  assert.equal(nodEvents.length, 1, 'the builder nods once');
  assert.ok(voices.some((v) => v.text === SWING_LINE_NOD_LINE));
  state.simTime = 40;
  someonesCoursePlant.update();
  assert.equal(nodEvents.length, 1, 'one nod per line');
  someonesCoursePlant.destroy();
});

test('PL-123 cut one anchor loose: the builder collects the pieces, and your description', () => {
  const bus = createBus();
  const plantedEvents = [];
  const cutEvents = [];
  bus.on(PLANTS_SWING_LINE_PLANTED_EVENT, (p) => plantedEvents.push(p));
  bus.on(PLANTS_SWING_LINE_CUT_EVENT, (p) => cutEvents.push(p));
  const player = makePlayer({});
  const state = makeState({ simTime: 0, entities: new Map([['p1', player]]) });
  const { helpers, popups, voices } = makeHost(bus, state, {}, null);
  someonesCoursePlant.init({ bus, state, helpers });

  someonesCoursePlant.update(); // schedules the planting
  state.simTime = 11;
  someonesCoursePlant.update();
  assert.equal(plantedEvents.length, 1);
  const anchorId = plantedEvents[0].anchorIds[0];

  bus.emit('entity:destroyed', { id: anchorId, type: 'beacon', reason: 'cut' });
  assert.equal(cutEvents.length, 1, 'the builder knows');
  assert.ok(popups.some((p) => p.text === SWING_LINE_CUT_LINE));
  const debris = [...state.entities.values()].filter((e) => e.data && e.data.swingDebris);
  assert.equal(debris.length, 2, 'the builder collects the pieces');
  someonesCoursePlant.destroy();
});

// ---------------------------------------------------------------------------
// PL-144 Ducklings
// ---------------------------------------------------------------------------

test('PL-144 tow something big and skiffs tuck in behind, one by one', () => {
  const bus = createBus();
  const joinEvents = [];
  bus.on(PLANTS_DUCKLING_JOIN_EVENT, (p) => joinEvents.push(p));
  const player = makePlayer({ vx: 40 });
  const bigTow = makeCargo('bigTow', { x: -30, z: 0 });
  bigTow.radius = 20;
  const state = makeState({ simTime: 0, entities: new Map([['p1', player], ['bigTow', bigTow]]) });
  const { host } = makeHost(bus, state, ducklingsOps, (h) => h._initDucklings());
  // The tow is latched through the real tether seams (towWatch), not an invented stamp.
  bus.emit('tether:snapCatch', { targetId: 'bigTow', t: 0 });

  const skiff1 = makeShip('sk1', { x: 60, z: 8, vx: 30, radius: 6, data: { trafficRole: 'courier' } });
  state.entities.set('sk1', skiff1);
  const claimed = host._reactDucklings(skiff1, { role: 'courier' }, [], state, player);
  assert.equal(claimed, true, 'the first skiff tucks in');
  assert.equal(joinEvents.length, 1);

  const skiff2 = makeShip('sk2', { x: 70, z: -8, vx: 30, radius: 6, data: { trafficRole: 'courier' } });
  state.entities.set('sk2', skiff2);
  state.simTime = 1;
  host._reactDucklings(skiff2, { role: 'courier' }, [], state, player);
  assert.equal(joinEvents.length, 2, 'one by one');
});

test('PL-144 let them ride and one leaves a part at the far end; shove them off and they take the long way', () => {
  const bus = createBus();
  const joinEvents = [];
  const partEvents = [];
  const shooEvents = [];
  bus.on(PLANTS_DUCKLING_JOIN_EVENT, (p) => joinEvents.push(p));
  bus.on(PLANTS_DUCKLING_PART_EVENT, (p) => partEvents.push(p));
  bus.on(PLANTS_DUCKLING_SHOO_EVENT, (p) => shooEvents.push(p));
  const player = makePlayer({ vx: 40 });
  const bigTow = makeCargo('bigTow', { x: 490, z: 0 });
  bigTow.radius = 20;
  const state = makeState({ simTime: 0, entities: new Map([['p1', player], ['bigTow', bigTow]]) });
  const { host, spawns, voices, popups } = makeHost(bus, state, ducklingsOps, (h) => h._initDucklings());
  // Tow latched through the live seam: tether:snapCatch carries the target id.
  bus.emit('tether:snapCatch', { targetId: 'bigTow', t: 0 });

  const skiff = makeShip('sk1', { x: 60, z: 0, vx: 30, radius: 6, data: { trafficRole: 'courier' } });
  state.entities.set('sk1', skiff);
  host._reactDucklings(skiff, { role: 'courier' }, [], state, player);
  assert.equal(joinEvents.length, 1);

  // Let them ride: far end reached and time served.
  state.simTime = 25;
  player.pos = { x: 520, z: 0 };
  const riding = host._reactDucklings(skiff, { role: 'courier' }, [], state, player);
  assert.equal(riding, false, 'the duckling peels off after the part');
  assert.equal(partEvents.length, 1, 'one leaves a part at the far end');
  assert.equal(spawns.length, 1);
  assert.equal(spawns[0].data.ducklingPart, true);
  assert.ok(popups.some((p) => p.text === DUCKLING_PART_LINE));

  // Shove a fresh duckling off: they take the long way.
  const skiff2 = makeShip('sk2', { x: 560, z: 0, vx: 30, radius: 6, data: { trafficRole: 'courier' } });
  state.entities.set('sk2', skiff2);
  player.pos = { x: 540, z: 0 };
  state.simTime = 30;
  host._reactDucklings(skiff2, { role: 'courier' }, [], state, player);
  assert.equal(joinEvents.length, 2);
  bus.emit('physics:impact', { aId: 'sk2', bId: 'p1', trauma: 0, impulse: 500, preSolveClosingSpeed: 10, dp: 500, causalActorId: 'p1' });
  assert.equal(shooEvents.length, 1, 'shoved off');
  assert.ok(voices.some((v) => v.text === DUCKLING_SHOO_LINE));
});

test('PL-144 no big tow, no ducklings', () => {
  const bus = createBus();
  const joinEvents = [];
  bus.on(PLANTS_DUCKLING_JOIN_EVENT, (p) => joinEvents.push(p));
  const player = makePlayer({ vx: 40 });
  const state = makeState({ simTime: 0, entities: new Map([['p1', player]]) });
  const { host } = makeHost(bus, state, ducklingsOps, (h) => h._initDucklings());

  const skiff = makeShip('sk1', { x: 60, z: 0, vx: 30, radius: 6, data: { trafficRole: 'courier' } });
  state.entities.set('sk1', skiff);
  const claimed = host._reactDucklings(skiff, { role: 'courier' }, [], state, player);
  assert.equal(claimed, false, 'nothing to tuck behind');
  assert.equal(joinEvents.length, 0);
});

// ---------------------------------------------------------------------------
// PL-145 Freight manners
// ---------------------------------------------------------------------------

test('PL-145 hold at a beacon, let three strings through, and the fourth flashes you across', () => {
  const bus = createBus();
  const yieldEvents = [];
  const flashEvents = [];
  bus.on(PLANTS_MANNERS_YIELD_EVENT, (p) => yieldEvents.push(p));
  bus.on(PLANTS_MANNERS_FLASH_ACROSS_EVENT, (p) => flashEvents.push(p));
  const beacon = makeBeacon('cross', { x: 0, z: 0 });
  const player = makePlayer({ x: 30, z: 0 });
  const state = makeState({ simTime: 0, tick: 1, entities: new Map([['p1', player], ['cross', beacon]]) });
  const { host, voices } = makeHost(bus, state, freightMannersOps, (h) => h._initFreightManners());

  const strings = ['s1', 's2', 's3', 's4'].map((id) => {
    const h = makeShip(id, { x: 60, z: 20, vx: 30, data: { trafficRole: 'hauler', cargo: { ore: 5 } } });
    state.entities.set(id, h);
    return h;
  });

  host._reactFreightManners(strings[0], { role: 'hauler' }, [], state, player);
  assert.equal(yieldEvents.length, 1, 'the first string counts a yield');
  state.simTime = 9;
  host._reactFreightManners(strings[1], { role: 'hauler' }, [], state, player);
  state.simTime = 18;
  host._reactFreightManners(strings[2], { role: 'hauler' }, [], state, player);
  assert.equal(yieldEvents.length, 3, 'three strings through');
  assert.equal(flashEvents.length, 0);
  state.simTime = 27;
  host._reactFreightManners(strings[3], { role: 'hauler' }, [], state, player);
  assert.equal(flashEvents.length, 1, 'the fourth string flashes you across first');
  assert.equal(strings[3].data.lampsFlashing, true);
  assert.ok(voices.some((v) => v.text === FREIGHT_MANNERS_FLASH_LINE));
  assert.equal(yieldEvents.length, 3, 'the flash replaces the fourth yield');
});

test('PL-145 never yield and the strings close ranks — every crossing becomes a fight', () => {
  const bus = createBus();
  const yieldEvents = [];
  const ranksEvents = [];
  bus.on(PLANTS_MANNERS_YIELD_EVENT, (p) => yieldEvents.push(p));
  bus.on(PLANTS_MANNERS_RANKS_EVENT, (p) => ranksEvents.push(p));
  const beacon = makeBeacon('cross', { x: 0, z: 0 });
  const stringHull = makeShip('s1', { x: 60, z: 20, vx: 30, data: { trafficRole: 'hauler', cargo: { ore: 5 } } });
  const state = makeState({ simTime: 0, tick: 1, entities: new Map([['p1', null], ['cross', beacon], ['s1', stringHull]]) });
  const { host, voices } = makeHost(bus, state, freightMannersOps, (h) => h._initFreightManners());

  // Not holding, crossing at speed: the slight is counted, ranks close.
  const crossingPlayer = makePlayer({ x: 40, z: 0, vx: 110 });
  state.entities.set('p1', crossingPlayer);
  const claimed = host._reactFreightManners(stringHull, { role: 'hauler' }, [], state, crossingPlayer);
  assert.equal(claimed, true, 'the close-ranks block claims the hull');
  assert.equal(ranksEvents.length, 1);
  assert.equal(stringHull.data.intent.brake, true, 'the hull blocks the crossing');
  assert.ok(voices.some((v) => v.text === FREIGHT_MANNERS_RANKS_LINE));

  // A holding player who never crossed: no ranks, just yields.
  const holdingPlayer = makePlayer({ x: 30, z: 0 });
  state.entities.set('p1', holdingPlayer);
  state.simTime = 10;
  state.tick = 2;
  host._reactFreightManners(stringHull, { role: 'hauler' }, [], state, holdingPlayer);
  assert.equal(yieldEvents.length, 1, 'holding at the beacon still counts the yield');
});

// ---------------------------------------------------------------------------
// PL-174 The witness
// ---------------------------------------------------------------------------

test('PL-174 a civilian saw it: the board chalks wrong colour, wrong tag, until the witness docks', () => {
  const bus = createBus();
  const chalkEvents = [];
  const correctedEvents = [];
  bus.on(PLANTS_WITNESS_CHALK_EVENT, (p) => chalkEvents.push(p));
  bus.on(PLANTS_WITNESS_CORRECTED_EVENT, (p) => correctedEvents.push(p));
  const station = makeStation('st1', { x: 0, z: 0 });
  const witness = makeShip('w1', { x: 50, z: 0, vx: 10, data: { trafficRole: 'courier' } });
  const player = makePlayer({ data: { colour: 'crimson', tag: 'p1' } });
  const state = makeState({ simTime: 10, entities: new Map([['p1', player], ['w1', witness]]), stations: [station] });
  const { host, popups } = makeHost(bus, state, witnessOps, (h) => h._initWitness());

  bus.emit('law:incidentOpened', { attackerId: 'p1', victimId: 'v1', victimAnchor: { x: 60, z: 0 } });
  assert.equal(chalkEvents.length, 1, 'your description goes chalked');
  assert.ok(popups.some((p) => p.text === WITNESS_CHALK_LINE));
  const wrong = wrongDescriptionFor('w1', player);
  assert.equal(station.data.berthBoard.tag, wrong.tag);
  assert.notEqual(station.data.berthBoard.tag, 'p1', 'wrong tag');
  assert.notEqual(station.data.berthBoard.colour, 'crimson', 'wrong colour');
  assert.equal(station.data.berthBoard.corrected, false);

  // It holds until the witness docks and corrects it.
  bus.emit('dock:range', { stationId: 'st1', shipId: 'w1', inRange: true });
  assert.equal(correctedEvents.length, 1, 'the witness docks and corrects it');
  assert.equal(station.data.berthBoard.corrected, true);
  assert.equal(station.data.berthBoard.tag, 'p1');
  assert.equal(station.data.berthBoard.colour, 'crimson');
});

test('PL-174 be gone before they dock and the chalk fades uncorrected; other offenders are not chalked', () => {
  const bus = createBus();
  const chalkEvents = [];
  const fadedEvents = [];
  const correctedEvents = [];
  bus.on(PLANTS_WITNESS_CHALK_EVENT, (p) => chalkEvents.push(p));
  bus.on(PLANTS_WITNESS_FADED_EVENT, (p) => fadedEvents.push(p));
  bus.on(PLANTS_WITNESS_CORRECTED_EVENT, (p) => correctedEvents.push(p));
  const station = makeStation('st1', { x: 0, z: 0 });
  const witness = makeShip('w1', { x: 50, z: 0, vx: 10, data: { trafficRole: 'courier' } });
  const player = makePlayer({ data: { colour: 'crimson', tag: 'p1' } });
  const state = makeState({ simTime: 10, entities: new Map([['p1', player], ['w1', witness]]), stations: [station] });
  const { host } = makeHost(bus, state, witnessOps, (h) => h._initWitness());

  // Someone else's incident: no chalk about you.
  bus.emit('law:incidentOpened', { attackerId: 'npc2', victimId: 'v1', victimAnchor: { x: 60, z: 0 } });
  assert.equal(chalkEvents.length, 0);

  bus.emit('law:incidentOpened', { attackerId: 'p1', victimId: 'v2', victimAnchor: { x: 60, z: 0 } });
  assert.equal(chalkEvents.length, 1);

  // Be gone before they dock: the chalk fades.
  bus.emit('sector:exit', { sectorId: 's1' });
  assert.equal(fadedEvents.length, 1, 'the wrong chalk never corrected');
  bus.emit('dock:range', { stationId: 'st1', shipId: 'w1', inRange: true });
  assert.equal(correctedEvents.length, 0, 'nothing left to correct');
});

// ---------------------------------------------------------------------------
// PL-194 Your wake
// ---------------------------------------------------------------------------

test('PL-194 boost past a working crew and their work scatters; owe three crews in one pass', () => {
  const bus = createBus();
  const scatterEvents = [];
  const oweEvents = [];
  bus.on(PLANTS_WAKE_SCATTER_EVENT, (p) => scatterEvents.push(p));
  bus.on(PLANTS_WAKE_OWE_EVENT, (p) => oweEvents.push(p));
  const player = makePlayer({ vx: 180 });
  const entities = new Map([['p1', player]]);
  for (let i = 0; i < 3; i += 1) {
    const crew = makeShip(`crew${i}`, { x: 60 + i * 10, z: 0, data: { working: true, trafficRole: 'miner' } });
    entities.set(`crew${i}`, crew);
    const pile = makeCargo(`ore${i}`, { x: 70 + i * 10, z: 4 });
    entities.set(`ore${i}`, pile);
  }
  const state = makeState({ simTime: 0, entities });
  const { voices, popups } = makeHost(bus, state, {}, null);
  yourWakePlant.init({ bus, state, helpers: { voice: { say: (m) => voices.push(structuredClone(m)) } } });

  yourWakePlant.update();
  assert.equal(scatterEvents.length, 3, 'three crews in one pass scatters');
  const ore0 = state.entities.get('ore0');
  assert.ok(ore0.vel.x > 0, 'ore piles drift along the wake');
  assert.equal(oweEvents.length, 1, 'three crews in one pass: you owe');
  assert.ok(popups.some((p) => p.text === 'Three crews. You owe.'));
  assert.ok(voices.length >= 1, 'the crews hold up whatever is at hand');
  yourWakePlant.destroy();
});

test('PL-194 slow down past work and nothing scatters; a scattered crew cools down', () => {
  const bus = createBus();
  const scatterEvents = [];
  bus.on(PLANTS_WAKE_SCATTER_EVENT, (p) => scatterEvents.push(p));
  const slowPlayer = makePlayer({ vx: 60 });
  const crew = makeShip('crew', { x: 60, z: 0, data: { working: true } });
  const ore = makeCargo('ore', { x: 70, z: 0 });
  const state = makeState({ simTime: 0, entities: new Map([['p1', slowPlayer], ['crew', crew], ['ore', ore]]) });
  makeHost(bus, state, {}, null);
  yourWakePlant.init({ bus, state, helpers: { voice: { say: () => {} } } });

  yourWakePlant.update();
  assert.equal(scatterEvents.length, 0, 'a slow pass scatters nothing');
  assert.equal(ore.vel.x, 0);

  slowPlayer.vel = { x: 180, z: 0 };
  yourWakePlant.update();
  assert.equal(scatterEvents.length, 1);
  const pushed = ore.vel.x;
  yourWakePlant.update();
  assert.equal(state.entities.get('ore').vel.x, pushed, 'per-crew scatter cooldown');
  yourWakePlant.destroy();
});

// ---------------------------------------------------------------------------
// PL-227 Seen
// ---------------------------------------------------------------------------

test('PL-227 marks are honest-inert until a runtime mark store exists: nobody points yet', () => {
  const bus = createBus();
  const seenEvents = [];
  bus.on(PLANTS_SEEN_EVENT, (p) => seenEvents.push(p));
  const strangeTown = makeStation('townB', { x: 0, z: 0 });
  const player = makePlayer({});
  const state = makeState({ simTime: 0, entities: new Map([['p1', player]]), stations: [strangeTown] });
  const { host, voices, cues } = makeHost(bus, state, seenOps, (h) => h._initSeen());

  // markOf() is deliberately inert — no runtime mark store exists to read. The whole beat
  // is one swap away from working; until then the row stays silent.
  assert.equal(markOf().present, false);
  bus.emit('dock:range', { stationId: 'townB', shipId: 'p1', inRange: true });
  assert.equal(seenEvents.length, 0, 'nothing to point at yet');
  assert.equal(voices.length, 0);
  assert.equal(cues.filter((c) => c.id === 'confirm').length, 0);
  assert.equal(host._seenMemoryMap().size <= SEEN_TUNING.memoryCap, true, 'rows stay bounded');
});

test('PL-227 no mark, no pointing; its own town already knows', () => {
  const bus = createBus();
  const seenEvents = [];
  bus.on(PLANTS_SEEN_EVENT, (p) => seenEvents.push(p));
  const townA = makeStation('townA', { x: 0, z: 0 });
  const plain = makePlayer({});
  const marked = makePlayer({ data: { mark: 'vane', markOrigin: 'townA' } });
  const state = makeState({ simTime: 0, entities: new Map([['p1', plain]]), stations: [townA] });
  const { host, voices } = makeHost(bus, state, seenOps, (h) => h._initSeen());

  bus.emit('dock:range', { stationId: 'townA', shipId: 'p1', inRange: true });
  assert.equal(seenEvents.length, 0, 'no mark, no story');
  assert.equal(voices.length, 0);

  state.entities.set('p1', marked);
  bus.emit('dock:range', { stationId: 'townA', shipId: 'p1', inRange: true });
  assert.equal(seenEvents.length, 0, 'its own town has seen it before');
});

// ---------------------------------------------------------------------------
// PL-228 Two names
// ---------------------------------------------------------------------------

test('PL-228 two towns chalk different names for the same deed; each town is certain', () => {
  const bus = createBus();
  const chalkEvents = [];
  const certainEvents = [];
  bus.on(PLANTS_TWO_NAMES_EVENT, (p) => chalkEvents.push(p));
  bus.on(PLANTS_TWO_NAMES_CERTAIN_EVENT, (p) => certainEvents.push(p));
  const townA = makeStation('townA', { x: 0, z: 0 });
  const townB = makeStation('townB', { x: 500, z: 0 });
  const state = makeState({ simTime: 10, entities: new Map(), stations: [townA, townB] });
  const { host, popups } = makeHost(bus, state, twoNamesOps, (h) => h._initTwoNames());

  bus.emit('entity:killed', { id: 'npc1', killerId: 'p1', type: 'ship', pos: { x: 250, z: 0 } });
  assert.equal(chalkEvents.length, 1, 'one deed, two boards');
  assert.equal(chalkEvents[0].boards.length, 2);
  const deedKey = chalkEvents[0].deedKey;
  const nameA = chalkNameFor('townA', deedKey);
  const nameB = chalkNameFor('townB', deedKey);
  assert.equal(chalkEvents[0].boards[0].name, nameA);
  assert.equal(chalkEvents[0].boards[1].name, nameB);
  assert.equal(townA.data.boardNameFor, 'p1');
  assert.equal(townB.data.boardNameFor, 'p1');

  // Each town is certain.
  bus.emit('dock:range', { stationId: 'townA', shipId: 'p1', inRange: true });
  assert.equal(certainEvents.length, 1);
  assert.ok(popups.some((p) => p.text === twoNamesLineFor(nameA)));
  state.simTime = 60;
  bus.emit('dock:range', { stationId: 'townA', shipId: 'p1', inRange: true });
  assert.equal(certainEvents.length, 1, 'certain, but not nagging');
});

test('PL-228 a deed one town saw chalks nothing; other killers are not named', () => {
  const bus = createBus();
  const chalkEvents = [];
  bus.on(PLANTS_TWO_NAMES_EVENT, (p) => chalkEvents.push(p));
  const townA = makeStation('townA', { x: 0, z: 0 });
  const townB = makeStation('townB', { x: 2500, z: 0 }); // out of sight of the deed
  const state = makeState({ simTime: 10, entities: new Map(), stations: [townA, townB] });
  const { host } = makeHost(bus, state, twoNamesOps, (h) => h._initTwoNames());

  bus.emit('entity:killed', { id: 'npc1', killerId: 'npc9', type: 'ship', pos: { x: 250, z: 0 } });
  assert.equal(chalkEvents.length, 0, 'not your deed');

  bus.emit('entity:killed', { id: 'npc1', killerId: 'p1', type: 'ship', pos: { x: 250, z: 0 } });
  assert.equal(chalkEvents.length, 0, 'one town only: no story');
});

// ---------------------------------------------------------------------------
// PL-229 The other name
// ---------------------------------------------------------------------------

test('PL-229 brought in asleep: the chalk goes up and sticks; earn a better one and the town keeps both', () => {
  const bus = createBus();
  const chalkEvents = [];
  const earnedEvents = [];
  const bothEvents = [];
  bus.on(PLANTS_OTHER_NAME_CHALK_EVENT, (p) => chalkEvents.push(p));
  bus.on(PLANTS_OTHER_NAME_EARNED_EVENT, (p) => earnedEvents.push(p));
  bus.on(PLANTS_OTHER_NAME_BOTH_EVENT, (p) => bothEvents.push(p));
  const town = makeStation('townA', { x: 0, z: 0 });
  const asleepPlayer = makePlayer({ hull: 20, hullMax: 100 });
  const state = makeState({ simTime: 0, entities: new Map([['p1', asleepPlayer]]), stations: [town] });
  const { host, popups } = makeHost(bus, state, otherNameOps, (h) => h._initOtherName());

  bus.emit('dock:range', { stationId: 'townA', shipId: 'p1', inRange: true });
  assert.equal(chalkEvents.length, 1, 'the day the tug brought you in asleep');
  assert.equal(chalkEvents[0].name, OTHER_NAME_ASLEEP);
  assert.equal(town.data.boardName, OTHER_NAME_ASLEEP, 'it sticks');

  // Earn a better one in the town's sight.
  bus.emit('entity:killed', { id: 'npc2', killerId: 'p1', type: 'ship', pos: { x: 100, z: 0 } });
  assert.equal(earnedEvents.length, 1);
  const better = earnedEvents[0].name;
  assert.notEqual(better, OTHER_NAME_ASLEEP);
  assert.equal(town.data.boardName, better);

  // The town keeps both.
  asleepPlayer.hull = 100;
  asleepPlayer.data = asleepPlayer.data || {};
  asleepPlayer.data.hp = 100;
  asleepPlayer.data.maxHp = 100;
  state.simTime = 10;
  bus.emit('dock:range', { stationId: 'townA', shipId: 'p1', inRange: true });
  assert.equal(bothEvents.length, 1);
  assert.ok(popups.some((p) => p.text === otherNameEarnedLineFor(better)));
});

test('PL-229 a healthy arrival is not brought in asleep', () => {
  const bus = createBus();
  const chalkEvents = [];
  bus.on(PLANTS_OTHER_NAME_CHALK_EVENT, (p) => chalkEvents.push(p));
  const town = makeStation('townA', { x: 0, z: 0 });
  const healthy = makePlayer({ hull: 100, hullMax: 100 });
  const state = makeState({ simTime: 0, entities: new Map([['p1', healthy]]), stations: [town] });
  const { host } = makeHost(bus, state, otherNameOps, (h) => h._initOtherName());

  bus.emit('dock:range', { stationId: 'townA', shipId: 'p1', inRange: true });
  assert.equal(chalkEvents.length, 0, 'you flew in on your own power');
});

// ---------------------------------------------------------------------------
// PL-250 Known by name
// ---------------------------------------------------------------------------

test('PL-250 near a town that named you, civilians give you room; exploit it and they mutter', () => {
  const bus = createBus();
  const roomEvents = [];
  const mutterEvents = [];
  bus.on(PLANTS_KNOWN_ROOM_EVENT, (p) => roomEvents.push(p));
  bus.on(PLANTS_KNOWN_MUTTER_EVENT, (p) => mutterEvents.push(p));
  const town = makeStation('townA', { x: 0, z: 0 });
  town.data.boardName = 'The Wake-fanner';
  town.data.boardNameFor = 'p1';
  const player = makePlayer({ x: 100, z: 0 });
  const state = makeState({ simTime: 0, entities: new Map([['p1', player]]), stations: [town] });
  const { host, voices } = makeHost(bus, state, knownByNameOps, (h) => h._initKnownByName());

  const civ = makeShip('civ1', { x: 160, z: 30, vx: 20, data: { trafficRole: 'courier' } });
  state.entities.set('civ1', civ);
  let claimed = host._reactKnownByName(civ, { role: 'courier' }, [town], state, player);
  assert.equal(claimed, true, 'they give you room');
  assert.equal(roomEvents.length, 1);
  assert.ok(civ.data.intent.aimAngle > 0, 'the hull steers out');

  // Exploit it: press again and again until they mutter.
  state.simTime = 5;
  civ.pos = { x: 100, z: 0 };
  claimed = host._reactKnownByName(civ, { role: 'courier' }, [town], state, player);
  assert.equal(claimed, true);
  state.simTime = 10;
  civ.pos = { x: 100, z: 0 };
  claimed = host._reactKnownByName(civ, { role: 'courier' }, [town], state, player);
  assert.equal(claimed, true);
  assert.equal(mutterEvents.length, 1, 'they let you, muttering');
  assert.ok(voices.some((v) => v.text === KNOWN_MUTTER_LINE));
});

test('PL-250 no name on the board, no room; exploits shrink the room but never close it', () => {
  const bus = createBus();
  const roomEvents = [];
  bus.on(PLANTS_KNOWN_ROOM_EVENT, (p) => roomEvents.push(p));
  const unnamed = makeStation('townB', { x: 0, z: 0 });
  const player = makePlayer({ x: 100, z: 0 });
  const state = makeState({ simTime: 0, entities: new Map([['p1', player]]), stations: [unnamed] });
  const { host } = makeHost(bus, state, knownByNameOps, (h) => h._initKnownByName());

  const civ = makeShip('civ1', { x: 160, z: 0, vx: 20, data: { trafficRole: 'courier' } });
  state.entities.set('civ1', civ);
  const claimed = host._reactKnownByName(civ, { role: 'courier' }, [unnamed], state, player);
  assert.equal(claimed, false, 'your own name, but this town never used it');
  assert.equal(roomEvents.length, 0);
  assert.equal(civ.data.intent.moveZ, 0);

  // Room radius math.
  assert.equal(roomRadiusFor(0), 90);
  assert.equal(roomRadiusFor(2), 90 - 18 * 2);
  assert.equal(roomRadiusFor(99), 36, 'the room never closes fully');
});

// ---------------------------------------------------------------------------
// PL-251 The other side of it
// ---------------------------------------------------------------------------

test('PL-251 a disabled stranger hails the nearest good hull — today that is you', () => {
  const bus = createBus();
  const hailEvents = [];
  bus.on(PLANTS_STRANGER_HAIL_EVENT, (p) => hailEvents.push(p));
  const stranger = makeShip('str1', { x: 200, z: 0, hull: 10, hullMax: 100, data: { trafficRole: 'courier' } });
  const player = makePlayer({ x: 100, z: 0 });
  const state = makeState({ simTime: 0, entities: new Map([['p1', player], ['str1', stranger]]), stations: [] });
  const { popups, cues } = makeHost(bus, state, {}, null);
  otherSidePlant.init({ bus, state, helpers: { spawnEntity: () => null, removeEntity: () => {} } });
  bus.on('comms:popup', (p) => popups.push(structuredClone(p)));
  bus.on('audio:cue', (p) => cues.push(structuredClone(p)));

  otherSidePlant.update();
  assert.equal(hailEvents.length, 1, 'the stranger hails you');
  assert.ok(popups.some((p) => p.text === STRANGER_HAIL_LINE), 'the hail text');
  assert.equal(stranger.data.lampsFlashing, true, 'the stranger holds a lamp out');
  otherSidePlant.destroy();
});

for (const sceneryCount of [0, 90]) {
  test(`PL-251 delivers a stranger to a live indexed dock with ${sceneryCount} scenery bodies`, () => {
    const sim = createSimulation({ systems: [otherSidePlant] });
    try {
      const { state, bus } = sim;
      state.mode = 'flight';
      const hull = { pos: { x: 0, z: 0 }, radius: 6, hull: 100, hullMax: 100 };
      const player = sim.spawn({ ...hull, type: 'ship', isPlayer: true, team: 0 });
      state.playerId = player.id;
      const stranger = sim.spawn({
        ...hull, type: 'ship', pos: { x: 100, z: 0 }, hull: 10,
        data: { trafficRole: 'courier', disabled: true },
      });
      const station = sim.spawn({
        type: 'station', pos: { x: 300, z: 0 }, radius: 60,
        data: { stationId: 'dockA' },
      });
      assert.equal(state.stations, undefined);
      assert.equal(state.entityIndex.byStationId.get('dockA'), station);

      const hails = [];
      const deliveries = [];
      bus.on(PLANTS_STRANGER_HAIL_EVENT, (event) => hails.push(event.strangerId));
      bus.on(PLANTS_STRANGER_DELIVERED_EVENT, (event) => deliveries.push(event));
      sim.step();
      assert.deepEqual(hails, [stranger.id]);

      for (let i = 0; i < sceneryCount; i += 1) {
        sim.spawn({ type: 'asteroid', pos: { x: 2000 + i * 100, z: 0 }, radius: 6 });
      }
      stranger.pos.x = 220;
      sim.runTicks(4);
      assert.deepEqual(hails, [stranger.id], 'scenery never displaces a pending rescue');
      assert.equal(deliveries.length, 0, 'drifting into dock range does not earn credit');

      bus.emit('physics:impact', {
        aId: stranger.id, bId: player.id, causalActorId: player.id, trauma: 5, pos: { x: 220, z: 0 },
      });
      sim.runTicks(6);
      assert.deepEqual(deliveries.map(({ strangerId, stationId }) => ({ strangerId, stationId })), [
        { strangerId: stranger.id, stationId: 'dockA' },
      ]);
      assert.deepEqual(hails, [stranger.id]);
    } finally {
      sim.dispose();
    }
  });
}

test('PL-251 push them to the dock and they thank you; fly past and the lane remembers', () => {
  const bus = createBus();
  const deliveredEvents = [];
  const passedEvents = [];
  const noHelpEvents = [];
  bus.on(PLANTS_STRANGER_DELIVERED_EVENT, (p) => deliveredEvents.push(p));
  bus.on(PLANTS_STRANGER_PASSED_EVENT, (p) => passedEvents.push(p));
  bus.on(PLANTS_NO_HELP_CAME_EVENT, (p) => noHelpEvents.push(p));
  const dock = makeStation('dockA', { x: 300, z: 0 });
  const stranger = makeShip('str1', { x: 200, z: 0, hull: 10, hullMax: 100, data: { trafficRole: 'courier' } });
  const player = makePlayer({ x: 100, z: 0 });
  const state = makeState({ simTime: 0, entities: new Map([['p1', player], ['str1', stranger]]), stations: [dock] });
  const { popups } = makeHost(bus, state, {}, null);
  otherSidePlant.init({ bus, state, helpers: { spawnEntity: () => null, removeEntity: () => {} } });
  bus.on('comms:popup', (p) => popups.push(structuredClone(p)));

  otherSidePlant.update(); // hail
  stranger.pos = { x: 260, z: 0 }; // pushed toward the dock, inside dockArriveRadiusWu
  // The push is the player's own hull contact: a real physics:impact receipt.
  bus.emit('physics:impact', { aId: 'str1', bId: 'p1', causalActorId: 'p1', trauma: 5 });
  otherSidePlant.update();
  assert.equal(deliveredEvents.length, 1, 'pushed to the dock');
  assert.ok(popups.some((p) => p.text === STRANGER_DELIVERED_LINE));
  otherSidePlant.destroy();

  // Fly past: the next time you are down, nobody comes.
  const bus2 = createBus();
  const passed2 = [];
  const noHelp2 = [];
  bus2.on(PLANTS_STRANGER_PASSED_EVENT, (p) => passed2.push(p));
  bus2.on(PLANTS_NO_HELP_CAME_EVENT, (p) => noHelp2.push(p));
  const stranger2 = makeShip('str2', { x: 2000, z: 0, hull: 10, hullMax: 100, data: { trafficRole: 'courier' } });
  const player2 = makePlayer({ x: 1800, z: 0 });
  const state2 = makeState({ simTime: 0, entities: new Map([['p1', player2], ['str2', stranger2]]), stations: [] });
  makeHost(bus2, state2, {}, null);
  otherSidePlant.init({ bus: bus2, state: state2, helpers: { spawnEntity: () => null, removeEntity: () => {} } });

  otherSidePlant.update(); // hail at t=0
  assert.equal(passed2.length, 0, 'hailed, not yet passed');
  player2.pos = { x: 0, z: 0 };
  player2.hull = 100;
  player2.hullMax = 100;
  state2.simTime = 100; // deadline long past, player far away
  otherSidePlant.update();
  assert.equal(passed2.length, 1, 'you flew past');
  state2.simTime = 101;
  otherSidePlant.update();
  assert.equal(noHelp2.length, 0, 'you are not down yet');
  player2.hull = 20;
  player2.hullMax = 100;
  state2.simTime = 102;
  otherSidePlant.update();
  assert.equal(noHelp2.length, 1, 'the next time you are down, nobody comes');
  otherSidePlant.destroy();
});

// ---------------------------------------------------------------------------
// Determinism smoke
// ---------------------------------------------------------------------------

test('determinism: the same plant scenario twice produces identical outcomes', () => {
  const runFarBerth = () => {
    const bus = createBus();
    const seen = [];
    const station = makeStation('stA', { x: 500, z: 0 });
    const hulls = ['q1', 'q2', 'q3'].map((id, i) => makeShip(id, { x: 450 + i * 5, z: 0, vx: 20, data: { trafficRole: 'hauler', cargo: { ore: 5 } } }));
    const player = makePlayer({ x: 470, z: 0, vx: 160 });
    const state = makeState({ entities: new Map([['p1', player]]), stations: [station] });
    const { host } = makeHost(bus, state, farBerthOps, (h) => h._initFarBerth());
    for (const ev of [PLANTS_FAR_BERTH_CUT_EVENT, PLANTS_FAR_BERTH_CHALK_EVENT]) {
      bus.on(ev, (p) => seen.push({ ev, p }));
    }
    state.simTime = 10;
    host._reactFarBerth(hulls[0], { role: 'hauler' }, [station], state, player);
    state.simTime = 20;
    host._reactFarBerth(hulls[1], { role: 'hauler' }, [station], state, player);
    state.simTime = 30;
    host._reactFarBerth(hulls[2], { role: 'hauler' }, [station], state, player);
    return {
      events: seen,
      farPierUntil: station.data.farPierUntil,
      chalkUntil: station.data.farPierChalkUntil,
    };
  };
  const a = runFarBerth();
  const b = runFarBerth();
  assert.deepEqual(a, b, 'identical scenario, identical outcome');
});

test('determinism: chalk names for the same deed are stable across runs', () => {
  const a = chalkNameFor('townA', 'npc1:250:0');
  const b = chalkNameFor('townA', 'npc1:250:0');
  assert.equal(a, b);
  assert.ok(FAR_BERTH_TUNING.memoryCap > 0);
});


test('PL-103 traffic ticks spawn the scheduled bus without census freighters', () => {
  const bus = createBus();
  const player = makePlayer();
  const state = makeState({ entities: new Map([['p1', player]]) });
  state.entityList = [player];
  const { host, spawns } = makeHost(bus, state, traffic, (h) => h.init({ bus, state, helpers: h.helpers }));
  try {
    host.update(1 / 60, state);
    assert.equal(spawns.filter(isBennyBus).length, 0, 'wait for sector-relative delay');
    state.simTime = BUS_TUNING.spawnDelayS;
    host.update(1 / 60, state);
    assert.equal(spawns.filter(isBennyBus).length, 1, 'bus spawned from the real traffic tick');
    host.update(1 / 60, state);
    assert.equal(spawns.filter(isBennyBus).length, 1, 'no duplicate spawn');
    assert.equal(spawns.find(isBennyBus).data.intent.moveZ, 1, 'bus loop steers its own actor');
  } finally {
    host.destroy();
  }
});


test('traffic ticks service plant-owned sweepers and shadow tugs outside the census', () => {
  const bus = createBus();
  const player = makePlayer({ x: 470, vx: 160 });
  const pod = makeCargo('spill', { x: 120 });
  const state = makeState({ entities: new Map([['p1', player], ['spill', pod]]) });
  state.entityList = [player, pod];
  const { host, spawns } = makeHost(bus, state, traffic, (h) => h.init({ bus, state, helpers: h.helpers }));
  const station = makeStation('stA', { x: 500 });
  const done = [];
  bus.on(PLANTS_SWEEP_DONE_EVENT, (p) => done.push(p));
  try {
    for (let i = 0; i < 3; i++) {
      state.simTime = 10 + i * 10;
      const hauler = makeShip(`queue${i}`, { x: 450, vx: 20, data: { trafficRole: 'hauler', cargo: { ore: 5 } } });
      host._reactFarBerth(hauler, { role: 'hauler' }, [station], state, player);
    }
    const tug = spawns.find((e) => e.data.plantsFarBerthTug);
    assert.ok(tug, 'cutting the queue spawned the shadow tug');
    bus.emit('freight:cargoSpilled', { entityId: 'spill', pos: { x: 0, z: 0 }, podIds: ['spill'] });
    const sweeper = spawns.find((e) => e.data.plantsSweepSquad);
    assert.ok(sweeper);
    assert.equal(state.traffic.freighters.length, 0, 'actors are outside the traffic census');
    host.update(1 / 60, state);
    assert.equal(tug.data.intent?.moveZ, 1, 'shadow tug steers from traffic tick');
    assert.equal(sweeper.data.intent?.moveZ, 1, 'sweeper steers from traffic tick');
    assert.ok(pod.vel.x < 0, 'wedge moves the spilled pod');
    state.simTime += 31;
    host.update(1 / 60, state);
    assert.equal(done.length, 1, 'sweep clock completes');
    assert.equal(state.entities.has(sweeper.id), false, 'sweeper leaves');
    assert.equal(state.entities.has(tug.id), false, 'shadow tug leaves');
  } finally {
    host.destroy();
  }
});


test('tow watch immediately clears a cached latch when the live tether is released', () => {
  const memory = new Map();
  towLatch(memory, { targetId: 'tow' }, 10);
  const state = { player: {} };
  assert.equal(towTargetIdOf(state, memory, 11), 'tow', 'no mirror uses the event latch');
  state.player.tether = { active: false, targetId: null };
  assert.equal(towTargetIdOf(state, memory, 11), null, 'live release wins immediately');
  assert.equal(memory.get('tow').targetId, null, 'release clears remembered latch');
  delete state.player.tether;
  assert.equal(towTargetIdOf(state, memory, 12), null, 'missing mirror cannot resurrect released tow');
  state.player.tether = { active: true, targetId: 'new-tow' };
  assert.equal(towTargetIdOf(state, memory, 12), 'new-tow', 'live active target remains authoritative');
});
