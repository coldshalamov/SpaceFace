// plants-world-reacts (life) — behavior tests for the INFERENCE plant rows implemented as
// runtime-registered plant modules (PL-121..PL-251, Section H families: home berth, courses,
// ducklings, manners, witness, wake, town chalk, known-by-name, the other side) plus the
// determinism smoke and the cross-family integration smokes (real traffic ticks, tow watch).
// Mechanical split of the original test/plants-world-reacts.test.mjs along its sub-families;
// the traffic-Ops rows live in test/plants-world-reacts-core.test.mjs. Assertion semantics
// unchanged.
//
// Per row: (a) positive trigger -> expected flag/event/voice (exact quoted copy where the row
// has one); (b) negative (wrong trigger) -> nothing; (c) cooldown/memory cap respected.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { traffic } from '../src/systems/traffic.js';
import { materializeWaveBatch } from '../src/systems/waveMaterialization.js';
import { BUS_TUNING, isBennyBus } from '../src/systems/plants/busDoesntMove.js';
import { towLatch, towTargetIdOf } from '../src/systems/plants/towWatch.js';
import { hash32 } from '../src/core/rng.js';

import {
  makeShip, makePlayer, makeStation, makeBeacon, makeCargo, makeState, makeHost,
} from './helpers/plantsWorldFixtures.mjs';

import {
  PLANTS_FAR_BERTH_CUT_EVENT,
  PLANTS_FAR_BERTH_CHALK_EVENT,
  FAR_BERTH_TUNING,
  farBerthOps,
} from '../src/systems/plants/farBerth.js';

import {
  PLANTS_SWEEP_DONE_EVENT,
} from '../src/systems/plants/sweepingLine.js';

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
  PLANTS_ORPHAN_SPAWN_EVENT,
  ORPHAN_TUNING,
  orphanWreckOps,
} from '../src/systems/plants/orphanWreck.js';

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

import {
  RAT_RUN_TUNING,
  ratRunPlant,
} from '../src/systems/plants/ratRun.js';

import {
  BRIGHT_ONE_TUNING,
  theBrightOnePlant,
} from '../src/systems/plants/theBrightOne.js';

import {
  PLANTS_TWICE_EVENT,
  TWICE_TUNING,
  twicePlant,
} from '../src/systems/plants/twice.js';

import {
  PLANTS_PIPS_EVENT,
  PIPS_TUNING,
  buoyLineEndpoints,
  nearestOnSegment,
  pipsCountsPlant,
} from '../src/systems/plants/pipsCounts.js';

import {
  PLANTS_ARCH_EVENT,
  ARCH_TUNING,
  theArchPlant,
} from '../src/systems/plants/theArch.js';

import {
  DARK_WINDOW_TUNING,
  theWindowThatDoesntPlant,
} from '../src/systems/plants/theWindowThatDoesnt.js';

import {
  PLANTS_SENNA_EVENT,
  SENNA_TUNING,
  sennaReadsPlant,
} from '../src/systems/plants/sennaReads.js';

import {
  PLANTS_THREE_COUNT_EVENT,
  THREE_COUNT_TUNING,
  threeCountPlant,
} from '../src/systems/plants/threeCount.js';

import {
  TWO_ROPES_TUNING,
  twoRopesPlant,
} from '../src/systems/plants/twoRopes.js';

import {
  OLD_TRAIL_TUNING,
  trailLine,
  theOldTrailPlant,
} from '../src/systems/plants/theOldTrail.js';

import {
  GLASS_TUNING,
  glassPaysPlant,
} from '../src/systems/plants/glassPays.js';

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

test('PL-251 civilian rescue stays in Adventure across a Swarm run', () => {
  // The real wave materializer supplies the attacker. This focused plant host grants
  // one spawn without running the rest of Round 20 or its budget timers.
  const sim = createSimulation({ systems: [otherSidePlant], helpers: {
    spawnBudget: { request: (count) => count, bindEntity: () => true },
  } });
  try {
    const { state, bus, helpers, registry } = sim;
    state.mode = 'flight';
    const player = sim.spawn({ type: 'ship', isPlayer: true, team: 0, pos: { x: 0, z: 0 }, hull: 100, hullMax: 100 });
    state.playerId = player.id;
    const courier = () => sim.spawn({
      type: 'ship', team: 0, pos: { x: 100, z: 0 }, hull: 10, hullMax: 100,
      data: { trafficRole: 'courier', disabled: true },
    });
    const playerImpact = (id) => bus.emit('physics:impact', { aId: id, bId: player.id, causalActorId: player.id });
    const hails = [];
    const deliveries = [];
    bus.on(PLANTS_STRANGER_HAIL_EVENT, (event) => hails.push(event.strangerId));
    bus.on(PLANTS_STRANGER_DELIVERED_EVENT, (event) => deliveries.push(event.strangerId));
    sim.spawn({ type: 'station', pos: { x: 300, z: 0 }, radius: 60, data: { stationId: 'dockA' } });

    const before = courier();
    sim.step();
    before.pos.x = 220;
    playerImpact(before.id);
    sim.step();
    assert.deepEqual(hails, [before.id]);
    assert.deepEqual(deliveries, [before.id]);
    helpers.removeEntity(before.id);

    const waiting = courier();
    sim.step();
    assert.deepEqual(hails, [before.id, waiting.id]);
    state.run = { kind: 'survival', phase: 'active', ruleset: 'swarm', wave: 20 };
    bus.emit('run:started', state.run);
    const wave = materializeWaveBatch({ state, helpers, registry }, {
      enemyId: 'wasp_swarmer', count: 1, swarm: true, wave: 20, level: 20,
      seed: 4242, gateGroup: 'east', positions: [{ x: 700, z: 0 }],
    });
    assert.equal(wave.spawnedIds.length, 1);
    const wasp = state.entities.get(wave.spawnedIds[0]);
    assert.equal(wasp.data.runCohort, 'survival');
    wasp.pos.x = 180;
    wasp.hull = wasp.hullMax * 0.2;
    playerImpact(waiting.id);
    bus.emit('tether:snapCatch', { targetId: waiting.id });
    sim.step();
    assert.deepEqual(hails, [before.id, waiting.id]);
    assert.equal(wasp.data.lampsFlashing, undefined);

    helpers.removeEntity(wasp.id);
    state.run.phase = 'inactive';
    bus.emit('run:ended', state.run);
    // With no live tether truth, the plant reads its subscribed fallback receipts.
    state.player.tether = null;
    waiting.pos.x = 220;
    sim.step();
    assert.deepEqual(deliveries, [before.id]);
    bus.emit('tether:snapCatch', { targetId: waiting.id });
    sim.step();
    assert.deepEqual(deliveries, [before.id, waiting.id]);
    const after = courier();
    sim.step();
    assert.deepEqual(hails, [before.id, waiting.id, after.id]);
  } finally {
    sim.registry.get(otherSidePlant.name)?.destroy();
    sim.dispose();
  }
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

// ---------------------------------------------------------------------------
// PL-198 the orphan: a new game drops the stale session row and stamp
// ---------------------------------------------------------------------------

test('PL-198 a new game clears the stale session row and sector stamp; the wreck spawns spawnDelayS after the fresh stamp', () => {
  const bus = createBus();
  const spawnEvents = [];
  bus.on(PLANTS_ORPHAN_SPAWN_EVENT, (p) => spawnEvents.push(p));
  const player = makePlayer({});
  const filer = makeShip('f1', { x: 0, z: 0, vx: 15, data: { trafficRole: 'courier' } });
  const state = makeState({ simTime: 1000, entities: new Map([['p1', player], ['f1', filer]]) });
  const { host } = makeHost(bus, state, orphanWreckOps, (h) => h._initOrphanWreck());
  // The long old session: sector entered late, wreck already spawned and drifting.
  bus.emit('sector:enter', { sectorId: 's1' });
  state.simTime = 1000 + ORPHAN_TUNING.spawnDelayS;
  host._reactOrphanWreck(filer, { role: 'courier' }, [], state, player);
  const oldWreckId = host._orphanRow && host._orphanRow.wreckId;
  assert.ok(oldWreckId, 'the old session spawned its wreck');

  // New game: simTime restarts near zero. The stale row and enter-stamp must not
  // survive the session — a restart into the same sector may never re-fire sector:enter,
  // and a stale stamp would gate the spawn until the old clock caught up.
  state.entities.delete(oldWreckId);
  state.simTime = 1;
  bus.emit('game:newGame', { seed: 7 });
  assert.equal(host._orphanRow, null, 'the stale row dropped with the session');
  assert.equal(host._orphanSectorEnteredAt, -1, 'the stale sector stamp dropped with the session');

  // The restart enters the sector again: the fresh session spawns on its own schedule.
  bus.emit('sector:enter', { sectorId: 's1' });
  state.simTime = 1 + ORPHAN_TUNING.spawnDelayS;
  host._reactOrphanWreck(filer, { role: 'courier' }, [], state, player);
  assert.equal(spawnEvents.length, 2, 'the fresh session spawns its own wreck on schedule');
  assert.notEqual(spawnEvents[1].wreckId, oldWreckId);
});

// ---------------------------------------------------------------------------
// New-game boundary (round-10 stale-session sweep): a new game clears the entities,
// resets nextEntityId (ids are REUSED), rewinds simTime to 0 and never fires
// sector:exit — any plant holding spawned-entity ids or absolute-simTime stamps from
// the old session misbehaves at the new game's first visit to its sector: stale
// removeEntity calls delete LIVE new-game entities, and stale `now - stamp` gates
// stay blocked for most of a run. Each test here establishes the old session's stale
// state, emits the game:newGame boundary, then triggers the module's beat with the
// stale ids reused by live entities and asserts nothing stale lands on them.
// ---------------------------------------------------------------------------

// Puts live entities holding the stale ids back into the cleared entities map (the boot
// resets nextEntityId, so the new game reuses those ids for its own early spawns).
function reuseAsLive(state, staleIds) {
  const reused = new Map(staleIds.filter((id) => id != null).map((id) => [id, makeBeacon(id, {})]));
  for (const [id, ent] of reused) {
    ent.pos = { x: 999, z: 999 };
    state.entities.set(id, ent);
  }
  return reused;
}

function noStaleRemovals(removed, atBoundary, reused, label) {
  const after = removed.slice(atBoundary).filter((id) => reused.has(id));
  assert.deepEqual(after, [], label);
}

test('PL-165 a new game drops the run\u2019s stale ids and day receipts; the first Drift visit spawns fresh, removing nothing live', () => {
  const bus = createBus();
  const player = makePlayer({});
  const station = makeStation('station_drift', { x: 0, z: 0 });
  const state = makeState({ simTime: 600, entities: new Map([['p1', player], ['st1', station]]) });
  state.meta = { seed: 7 };
  state.world.currentSectorId = RAT_RUN_TUNING.sectorId;
  const { host, removed, helpers } = makeHost(bus, state, ratRunPlant, (h) => h.init({ bus, state, helpers: h.helpers }));

  // The old session: a run started on the sector-day clock — skiff and plates are live.
  host.update(0.5);
  assert.ok(host._skiffId != null && host._plateIds.length > 0, 'the old session spawned the run');
  const staleIds = [host._skiffId, ...host._plateIds];
  assert.ok(staleIds.every((id) => state.entities.has(id)), 'the stale props are live');

  // New game: the boot clears entities and rewinds the clock, then emits the boundary.
  state.entities.clear();
  state.simTime = 1;
  bus.emit('game:newGame', { seed: 7 });
  const atBoundary = removed.length;
  assert.equal(host._skiffId, null, 'the stale skiff id dropped');
  assert.deepEqual(host._plateIds, [], 'the stale plate ids dropped');
  assert.equal(host._ownedIds.size, 0, 'the stale ownership ledger dropped');
  assert.equal(host._lastDay, -1, 'the stale day stamp dropped');
  assert.equal(host._dayReceipts.size, 0, 'the stale day receipts dropped');

  // The new game's first Drift visit: the run respawns on its own schedule and no stale
  // id is removed into a live entity by the fresh _startRun's despawn sweep.
  state.world.currentSectorId = RAT_RUN_TUNING.sectorId;
  const reused = reuseAsLive(state, staleIds);
  state.entities.set('p1', player);
  state.entities.set('st1', station);
  host.update(0.5);
  assert.ok(host._skiffId != null && !reused.has(host._skiffId), 'the fresh visit spawned its own skiff');
  noStaleRemovals(removed, atBoundary, reused, 'no stale id removed into a live entity');
  for (const id of reused.keys()) assert.ok(state.entities.has(id), 'the reused live entity survived');
  host.destroy();
});

test('PL-166 a new game drops the tow\u2019s stale ids, nod stamp and receipts; the fresh passing spawns clean and the nod is not free', () => {
  const bus = createBus();
  const player = makePlayer({});
  const station = makeStation('station_drift', { x: 0, z: 0 });
  const state = makeState({ simTime: 601, entities: new Map([['p1', player], ['st1', station]]) });
  state.meta = { seed: 7 };
  state.world.currentSectorId = BRIGHT_ONE_TUNING.sectorId;
  const { host, removed, popups, helpers } = makeHost(bus, state, theBrightOnePlant, (h) => h.init({ bus, state, helpers: h.helpers }));

  // The old session: day 1's tow passes, one flash — the nod banks at the passing's end.
  host.update(0.5);
  const tow = state.entities.get(host._towId);
  assert.ok(tow, 'the tow is mid-pass');
  bus.emit('combat:fire', { ownerId: 'p1', origin: { x: tow.pos.x, z: tow.pos.z } });
  state.simTime = 631;
  host.update(0.5);
  assert.ok(host._nodUntil > 0, 'the nod was earned this session');
  assert.equal(host._receipts.get(1), 'flashed');
  // Day 2's tow passes: live props carrying the stale stamps alongside.
  state.simTime = 1201;
  host.update(0.5);
  const staleIds = [...host._ownedIds];
  assert.ok(host._towId != null && state.entities.has(host._towId), 'day two\u2019s tow is live');

  state.entities.clear();
  state.simTime = 1;
  bus.emit('game:newGame', { seed: 7 });
  const atBoundary = removed.length;
  assert.equal(host._ownedIds.size, 0, 'the stale ownership ledger dropped');
  assert.equal(host._towId, null, 'the stale tow id dropped');
  assert.equal(host._strangerId, null, 'the stale stranger id dropped');
  assert.equal(host._plateId, null, 'the stale plate id dropped');
  assert.equal(host._rememberId, null, 'the stale remembered plate id dropped');
  assert.equal(host._nodUntil, 0, 'the stale nod stamp dropped');
  assert.equal(host._receipts.size, 0, 'the stale tow receipts dropped');
  assert.equal(host._lastTowDay, -1, 'the stale tow-day stamp dropped');

  // The new run: no free nod from the old stamp, and the first passing spawns fresh.
  state.world.currentSectorId = BRIGHT_ONE_TUNING.sectorId;
  const reused = reuseAsLive(state, staleIds);
  state.entities.set('p1', player);
  state.entities.set('st1', station);
  const popupsAtBoundary = popups.length;
  bus.emit('dock:range', { stationId: 'station_drift', inRange: true });
  assert.equal(popups.length, popupsAtBoundary, 'no free nod off the old session\u2019s stamp');
  state.simTime = 2;
  host.update(0.5);
  assert.ok(host._towId != null && !reused.has(host._towId), 'the fresh passing spawned its own tow');
  noStaleRemovals(removed, atBoundary, reused, 'no stale id removed into a live entity');
  host.destroy();
});

test('PL-142 a new game drops Lark\u2019s stale ids and attempt stamp; rapid shots meet the delivered attempt cooldown', () => {
  const bus = createBus();
  const flashEvents = [];
  bus.on(PLANTS_TWICE_EVENT, (p) => flashEvents.push(p));
  const player = makePlayer({});
  const station = makeStation('station_nyx_march', { x: 0, z: 0 });
  const state = makeState({ simTime: 125, entities: new Map([['p1', player], ['st1', station]]) });
  state.meta = { seed: 7 };
  state.entityList = [player, station];   // the station seam reads the entity list
  state.world.currentSectorId = TWICE_TUNING.sectorId;
  const { host, removed, helpers } = makeHost(bus, state, twicePlant, (h) => h.init({ bus, state, helpers: h.helpers }));

  // The old session: Lark mid-pass lights-off; a double flash summoned the far answerer.
  host.update(0.5);
  const lark = state.entities.get(host._larkId);
  assert.ok(lark, 'the old session spawned Lark');
  const shot = { ownerId: 'p1', origin: { x: lark.pos.x, z: lark.pos.z } };
  bus.emit('combat:fire', shot);
  state.simTime = 126;
  bus.emit('combat:fire', shot);
  assert.ok(host._answererId != null, 'the double flash summoned the far answerer');
  const staleIds = [...host._ownedIds];

  state.entities.clear();
  state.simTime = 1;
  bus.emit('game:newGame', { seed: 7 });
  const atBoundary = removed.length;
  assert.equal(host._larkId, null, 'the stale Lark id dropped');
  assert.equal(host._answererId, null, 'the stale answerer id dropped');
  assert.equal(host._ownedIds.size, 0, 'the stale ownership ledger dropped');
  assert.equal(host._answers.size, 0, 'the stale answer ledger dropped');
  assert.equal(host._lastAttempt, 0, 'the stale attempt stamp dropped with the clock');

  // The new run: Lark respawns fresh and the cooldown gate works on the fresh clock —
  // one flash-back per attemptCooldownS, not rapid-fire.
  state.world.currentSectorId = TWICE_TUNING.sectorId;
  const reused = reuseAsLive(state, staleIds);
  state.entities.set('p1', player);
  state.entities.set('st1', station);
  state.simTime = 5;
  host.update(0.5);
  const freshLark = state.entities.get(host._larkId);
  assert.ok(freshLark && !reused.has(host._larkId), 'the fresh pass spawned its own Lark');
  const flashBacksBefore = flashEvents.filter((p) => p.kind === 'flashBack').length;
  const answeredBefore = flashEvents.filter((p) => p.kind === 'farAnsweredTwice').length;
  const shotAt = (t) => {
    state.simTime = t;
    bus.emit('combat:fire', { ownerId: 'p1', origin: { x: freshLark.pos.x, z: freshLark.pos.z } });
  };
  shotAt(6);   // flashBack, and the attempt stamp arms
  shotAt(7);   // completes the double window: the twice itself answers, once
  shotAt(8);   // inside attemptCooldownS: ignored — spam does not re-trigger
  shotAt(10);  // cooldown elapsed since the answer: flashBack again
  assert.equal(flashEvents.filter((p) => p.kind === 'flashBack').length, flashBacksBefore + 2,
    'one flash-back per cooldown window');
  assert.equal(flashEvents.filter((p) => p.kind === 'farAnsweredTwice').length, answeredBefore + 1,
    'the cooldown did not invite a second answer');
  noStaleRemovals(removed, atBoundary, reused, 'no stale id removed into a live entity');
  host.destroy();
});

test('PL-118 a new game drops the built line and the pass ledger; the buoy line respawns and the fresh crossing counts', () => {
  const bus = createBus();
  const pipsEvents = [];
  bus.on(PLANTS_PIPS_EVENT, (p) => pipsEvents.push(p));
  const player = makePlayer({ x: 0, z: 30 });
  const station = makeStation('station_veil', { x: 0, z: 0 });
  const state = makeState({ simTime: 1000, entities: new Map([['p1', player], ['st1', station]]) });
  state.meta = { seed: 7 };
  state.world.currentSectorId = PIPS_TUNING.sectorId;
  const { host, spawns, removed, helpers } = makeHost(bus, state, pipsCountsPlant, (h) => h.init({ bus, state, helpers: h.helpers }));

  // The old session: the buoy line is built and a crossing counted.
  host.update(1);
  player.pos = { x: 0, z: -30 };
  host.update(1);
  assert.equal(pipsEvents.length, 1, 'the old session counted its pass');
  assert.equal(host._propsBuilt, true);
  const stalePipsId = host._pipsId;
  const staleIds = [...host._ownedIds];
  assert.ok(staleIds.length > 0, 'the old line holds ids');

  state.entities.clear();
  state.simTime = 1;
  bus.emit('game:newGame', { seed: 7 });
  const atBoundary = removed.length;
  const atSpawns = spawns.length;
  assert.equal(host._propsBuilt, false, 'the built flag dropped — the line respawns');
  assert.equal(host._pipsId, null, 'the stale pips id dropped');
  assert.equal(host._ownedIds.size, 0, 'the stale ownership ledger dropped');
  assert.equal(host._passTimes.size, 0, 'the stale pass ledger dropped');

  // The fresh visit: the line rebuilds, the fresh crossing counts, and the reused live
  // id-holder is neither removed nor dragged down the line.
  state.world.currentSectorId = PIPS_TUNING.sectorId;
  const reused = reuseAsLive(state, staleIds);
  state.entities.set('p1', player);
  state.entities.set('st1', station);
  player.pos = { x: 0, z: 30 };
  host.update(1);
  player.pos = { x: 0, z: -30 };
  host.update(1);
  assert.ok(host._propsBuilt && !reused.has(host._pipsId), 'the fresh visit rebuilt the buoy line');
  assert.equal(spawns.length - atSpawns, PIPS_TUNING.buoyCount + 1, 'the line respawned in full');
  assert.equal(pipsEvents.length, 2, 'the fresh crossing counted on the new clock');
  const line = buoyLineEndpoints(station.pos, 7, PIPS_TUNING.sectorId);
  assert.notDeepEqual(reused.get(stalePipsId).pos,
    (({ x, z }) => ({ x, z }))(nearestOnSegment({ x: 0, z: 30 }, line.a, line.b)),
    'the reused live id-holder was not dragged down the line');
  noStaleRemovals(removed, atBoundary, reused, 'no stale id removed into a live entity');
  host.destroy();
});

test('PL-167 a new game drops the mouths and the cross stamp; threading is available early in the fresh run', () => {
  const bus = createBus();
  const archEvents = [];
  bus.on(PLANTS_ARCH_EVENT, (p) => archEvents.push(p));
  const player = makePlayer({ x: 30, z: 60 });
  const station = makeStation('station_expanse', { x: 0, z: 0 });
  const state = makeState({ simTime: 900, entities: new Map([['p1', player], ['st1', station]]) });
  state.meta = { seed: 7 };
  state.entityList = [player, station];   // the station seam reads the entity list
  state.world.currentSectorId = ARCH_TUNING.sectorId;
  const { host, removed, helpers } = makeHost(bus, state, theArchPlant, (h) => h.init({ bus, state, helpers: h.helpers }));

  // The old session: the mouths are live and a threading spent the cross stamp.
  host.update(0.5);
  const staleIds = [...host._ownedIds];
  assert.ok(host._portId != null && host._starId != null, 'the old session grew the arch');
  player.pos = { x: 30, z: -60 };
  state.simTime = 901;
  host.update(0.5);
  assert.equal(archEvents.length, 1, 'the old session threaded once');
  assert.equal(host._lastCross, 901, 'the cross stamp is an absolute simTime');
  assert.equal(host._armed, false);

  state.entities.clear();
  state.simTime = 1;
  bus.emit('game:newGame', { seed: 7 });
  const atBoundary = removed.length;
  assert.equal(host._portId, null, 'the stale port mouth id dropped');
  assert.equal(host._starId, null, 'the stale starboard mouth id dropped');
  assert.equal(host._ownedIds.size, 0, 'the stale ownership ledger dropped');
  assert.equal(host._lastCross, 0, 'the stale cross stamp dropped — _cleanup never touched it');
  assert.equal(host._armed, true, 'the thread re-armed with the session');

  // The fresh visit: the mouths regrow, the reused id-holders are not dragged to the
  // mouth coordinates, and a crossing after crossCooldownS threads on the fresh clock.
  state.world.currentSectorId = ARCH_TUNING.sectorId;
  const reused = reuseAsLive(state, staleIds);
  state.entities.set('p1', player);
  state.entities.set('st1', station);
  state.simTime = 3;
  host.update(0.5);
  assert.ok(host._portId != null && !reused.has(host._portId), 'the fresh visit regrew the arch');
  player.pos = { x: 30, z: 60 };
  state.simTime = 11;
  host.update(0.5);
  player.pos = { x: 30, z: -60 };
  state.simTime = 12;
  host.update(0.5);
  assert.equal(archEvents.length, 2, 'the fresh crossing threaded — the stale stamp no longer blocks it');
  for (const ent of reused.values()) {
    assert.deepEqual(ent.pos, { x: 999, z: 999 }, 'the reused live id-holder was not pos-set to the mouth');
  }
  noStaleRemovals(removed, atBoundary, reused, 'no stale id removed into a live entity');
  host.destroy();
});

test('PL-170 a new game drops the window row; the row respawns and Wick\u2019s lamps stamp fresh windows only', () => {
  const bus = createBus();
  const player = makePlayer({ x: 10, z: 0 });
  const station = makeStation('station_ashcache', { x: 0, z: 0 });
  const state = makeState({ simTime: 650, entities: new Map([['p1', player], ['st1', station]]) });
  state.meta = { seed: 7 };
  state.entityList = [player, station];   // the station seam reads the entity list
  state.world.currentSectorId = DARK_WINDOW_TUNING.sectorId;
  const { host, spawns, removed, helpers } = makeHost(bus, state, theWindowThatDoesntPlant, (h) => h.init({ bus, state, helpers: h.helpers }));

  // The old session: the row is up and one relief run has lit (the ids survive sector
  // exits by design — only a new game may drop them).
  host.update(1);
  state.simTime = 1205;
  host.update(1);
  assert.equal(host._windowIds.length, DARK_WINDOW_TUNING.windows, 'the row is up');
  assert.equal(host._litCount, 1, 'one window lit this session');
  assert.equal(host._lastRelief, 2);
  const staleLitId = host._windowIds[0];
  const staleIds = [...host._ownedIds];

  state.entities.clear();
  state.simTime = 1;
  bus.emit('game:newGame', { seed: 7 });
  const atBoundary = removed.length;
  const atSpawns = spawns.length;
  assert.deepEqual(host._windowIds, [], 'the stale row dropped');
  assert.equal(host._ownedIds.size, 0, 'the stale ownership ledger dropped');
  assert.equal(host._litCount, 0, 'the lit count reset');
  assert.equal(host._lastRelief, -1, 'the relief stamp reset');

  // The fresh visit: the row respawns and the first relief lights a fresh window —
  // the reused live id-holders get no lamps stamped on them.
  state.world.currentSectorId = DARK_WINDOW_TUNING.sectorId;
  const reused = reuseAsLive(state, staleIds);
  state.entities.set('p1', player);
  state.entities.set('st1', station);
  host.update(1);
  assert.equal(spawns.length - atSpawns, DARK_WINDOW_TUNING.windows, 'the row respawned');
  state.simTime = 601;
  host.update(1);
  assert.equal(host._litCount, 1, 'the fresh relief lit its first window');
  assert.equal(state.entities.get(host._windowIds[0]).data.lampsFlashing, true, 'a fresh window carries the lamp');
  assert.notEqual(reused.get(staleLitId).data.lampsFlashing, true, 'no lamp stamped on a reused live id-holder');
  noStaleRemovals(removed, atBoundary, reused, 'no stale id removed into a live entity');
  host.destroy();
});

test('PL-120 a new game drops the lamp ledger and the arc; Senna hangs a fresh row and can read yours again', () => {
  const bus = createBus();
  const sennaEvents = [];
  bus.on(PLANTS_SENNA_EVENT, (p) => sennaEvents.push(p));
  const player = makePlayer({ x: 40, z: 0 });
  const station = makeStation('station_sedna', { x: 0, z: 0 });
  const state = makeState({ simTime: 485, entities: new Map([['p1', player], ['st1', station]]) });
  state.meta = { seed: 7 };
  state.world.currentSectorId = SENNA_TUNING.sectorId;
  const { host, spawns, removed, helpers } = makeHost(bus, state, sennaReadsPlant, (h) => h.init({ bus, state, helpers: h.helpers }));

  // The old session: two sittings completed (lamps hang, she reads yours), then a
  // third reading walked out of — she is past it.
  host.update(1);
  state.simTime = 515;
  host.update(1);
  assert.equal(host._completedSittings, 1, 'the first night sat out');
  state.simTime = 1085;
  host.update(1);
  state.simTime = 1115;
  host.update(1);
  assert.equal(host._completedSittings, 2, 'the second night sat out');
  assert.equal(host._readYours, true, 'she read yours');
  state.simTime = 1685;
  host.update(1);
  player.pos = { x: 4000, z: 0 };
  host.update(1);
  assert.equal(host._pastIt, true, 'left mid-reading: past it');
  const staleIds = [...host._ownedIds];
  assert.ok(staleIds.length >= SENNA_TUNING.lampBase, 'the lamp row hangs');
  const readingStartsBefore = sennaEvents.filter((p) => p.kind === 'readingStarts').length;
  assert.equal(readingStartsBefore, 3, 'three nights opened a reading this session');

  state.entities.clear();
  state.simTime = 1;
  bus.emit('game:newGame', { seed: 7 });
  const atBoundary = removed.length;
  const atSpawns = spawns.length;
  assert.equal(host._ownedIds.size, 0, 'the stale lamp ledger dropped');
  assert.equal(host._completedSittings, 0, 'the stale sittings dropped');
  assert.equal(host._readYours, false, 'the read-yours arc dropped');
  assert.equal(host._pastIt, false, 'the past-it arc dropped');
  assert.equal(host._reading, null, 'the stale reading dropped');

  // The fresh visit: the next night hangs a fresh row — `have = size` counts anew.
  state.world.currentSectorId = SENNA_TUNING.sectorId;
  const reused = reuseAsLive(state, staleIds);
  state.entities.set('p1', player);
  state.entities.set('st1', station);
  player.pos = { x: 40, z: 0 };
  state.simTime = 485;
  host.update(1);
  assert.equal(spawns.length - atSpawns, SENNA_TUNING.lampBase, 'a full fresh row hung — not suppressed by wiped lamps');
  assert.equal(sennaEvents.filter((p) => p.kind === 'readingStarts').length, readingStartsBefore + 1,
    'the fresh night opened its own reading — the prior run\u2019s arc did not carry');
  noStaleRemovals(removed, atBoundary, reused, 'no stale id removed into a live entity');
  host.destroy();
});

test('PL-141 a new game drops the stale rock ids and beam stamps; a fresh crossing is judged at once', () => {
  const bus = createBus();
  const player = makePlayer({ x: 0, z: 60 });
  const station = makeStation('station_eris_margin', { x: 0, z: 0 });
  const state = makeState({ simTime: 1000, entities: new Map([['p1', player], ['st1', station]]) });
  state.meta = { seed: 7 };
  state.entityList = [player, station];   // the station seam reads the entity list
  state.world.currentSectorId = THREE_COUNT_TUNING.sectorId;
  const { host, removed, helpers } = makeHost(bus, state, threeCountPlant, (h) => h.init({ bus, state, helpers: h.helpers }));

  // The old session: props live, a crossing was judged — the cooldown is armed far out.
  host.update(0.5);
  const staleIds = [...host._ownedIds];
  assert.ok(host._sabineId != null && host._markId != null, 'the old session spawned Sabine and the mark');
  host._crossCooldown = 1005;
  host._counterUntil = 1003;

  state.entities.clear();
  state.simTime = 1;
  bus.emit('game:newGame', { seed: 7 });
  const atBoundary = removed.length;
  assert.equal(host._sabineId, null, 'the stale Sabine id dropped');
  assert.equal(host._markId, null, 'the stale mark id dropped');
  assert.equal(host._ownedIds.size, 0, 'the stale ownership ledger dropped');
  assert.equal(host._crossCooldown, 0, 'the stale cross cooldown dropped');
  assert.equal(host._counterUntil, 0, 'the stale counter window dropped');

  // The fresh visit: a crossing at t≈1.5 is judged immediately (the cooldown re-arms
  // from the fresh clock) instead of staying blocked until the old stamp caught up.
  state.world.currentSectorId = THREE_COUNT_TUNING.sectorId;
  const reused = reuseAsLive(state, staleIds);
  state.entities.set('p1', player);
  state.entities.set('st1', station);
  state.simTime = 1;
  host.update(0.5);
  player.pos = { x: 0, z: -60 };
  state.simTime = 1.5;
  host.update(0.5);
  assert.equal(host._crossCooldown, 9.5, 'the fresh crossing was judged and re-armed the cooldown');
  noStaleRemovals(removed, atBoundary, reused, 'no stale id removed into a live entity');
  for (const id of reused.keys()) assert.ok(state.entities.has(id), 'the reused live entity survived');
  host.destroy();
});

test('PL-138 a new game drops the winch ids, the quiet gate and the hail memory; the Well groans again', () => {
  const bus = createBus();
  const player = makePlayer({ x: 0, z: 0 });
  const station = makeStation('station_proteus', { x: 0, z: 0 });
  const state = makeState({ simTime: 0, entities: new Map([['p1', player], ['st1', station]]) });
  state.meta = { seed: 7 };
  state.entityList = [player, station];   // the station seam reads the entity list
  state.world.currentSectorId = TWO_ROPES_TUNING.sectorId;
  const { host, cues, removed, helpers } = makeHost(bus, state, twoRopesPlant, (h) => h.init({ bus, state, helpers: h.helpers }));

  // The old session: winch and catch live; a full haul earns hailed-first.
  for (let i = 0; i < 150; i++) {
    state.simTime = i;
    host.update(1);
  }
  assert.ok(host._colmId != null && host._catchId != null, 'winch and catch are live');
  const staleIds = [...host._ownedIds];
  bus.emit('massline:throw', { pos: { x: 0, z: 0 } });
  assert.equal(host._hauling, true, 'your rope is on');
  for (let i = 0; i < 12; i++) {
    state.simTime = 149.5 + i * 0.5;
    host.update(0.5);
  }
  assert.equal(host._hailedFirst, true, 'the haul resolved: hailed first next time');
  // A second groan, a second rope, then let go: the Well goes quiet for a day.
  for (let i = 0; i < 150; i++) {
    state.simTime = 156 + i;
    host.update(1);
  }
  bus.emit('massline:throw', { pos: { x: 0, z: 0 } });
  assert.equal(host._hauling, true, 'the second rope is on');
  player.pos = { x: 600, z: 0 };
  state.simTime = 307;
  host.update(0.5);
  assert.ok(host._quietUntil > 307, 'the Well went quiet for a day');

  state.entities.clear();
  state.simTime = 1;
  bus.emit('game:newGame', { seed: 7 });
  const atBoundary = removed.length;
  const cuesAtBoundary = cues.length;
  assert.equal(host._colmId, null, 'the stale winch id dropped');
  assert.equal(host._catchId, null, 'the stale catch id dropped');
  assert.equal(host._ownedIds.size, 0, 'the stale ownership ledger dropped');
  assert.equal(host._quietUntil, 0, 'the stale quiet gate dropped');
  assert.equal(host._hailedFirst, false, 'the hail memory dropped with the session');

  // The fresh visit: winch and catch respawn and the Well groans on its own period
  // instead of staying groan-dead behind the old quiet stamp.
  state.world.currentSectorId = TWO_ROPES_TUNING.sectorId;
  const reused = reuseAsLive(state, staleIds);
  state.entities.set('p1', player);
  state.entities.set('st1', station);
  host.update(1);
  assert.ok(host._colmId != null && !reused.has(host._colmId), 'the fresh visit respawned the winch');
  for (let i = 0; i < 150; i++) {
    state.simTime = 2 + i;
    host.update(1);
  }
  assert.ok(cues.slice(cuesAtBoundary).some((c) => c.id === 'sfx_vent_chime'), 'the Well groaned again');
  noStaleRemovals(removed, atBoundary, reused, 'no stale id removed into a live entity');
  host.destroy();
});

test('PL-169 a new game drops the trail, the rest lamp and the progress flags; the trail respawns for the fresh run', () => {
  const bus = createBus();
  const player = makePlayer({ x: 4000, z: 0 });
  const station = makeStation('station_ashcache', { x: 0, z: 0 });
  const state = makeState({ simTime: 10, entities: new Map([['p1', player], ['st1', station]]) });
  state.meta = { seed: 7 };
  state.entityList = [player, station];   // the station seam reads the entity list
  state.world.currentSectorId = OLD_TRAIL_TUNING.sectorId;
  const { host, spawns, removed, helpers } = makeHost(bus, state, theOldTrailPlant, (h) => h.init({ bus, state, helpers: h.helpers }));

  // The old session: the trail is live, followed through, and a line ploughed beside it.
  host.update(1);
  const line = trailLine(station.pos, 7, OLD_TRAIL_TUNING.sectorId);
  for (let i = 0; i < line.pts.length; i++) {
    player.pos = line.pts[i];
    state.simTime = 10 + i;
    host.update(1);
  }
  assert.equal(host._throughDone, true, 'the old session followed it through');
  assert.equal(host._revealed, true, 'the out-trail revealed');
  bus.emit('massline:throw', { pos: line.pts[0] });
  bus.emit('massline:throw', { pos: { x: line.pts[0].x + 100, z: line.pts[0].z } });
  assert.equal(host._bothDone, true, 'both trails stayed');
  assert.equal(host._progress, OLD_TRAIL_TUNING.markers);
  const staleLampId = host._lampId;
  const staleIds = [...host._ownedIds];

  state.entities.clear();
  state.simTime = 1;
  bus.emit('game:newGame', { seed: 7 });
  const atBoundary = removed.length;
  const atSpawns = spawns.length;
  assert.deepEqual(host._markerIds, [], 'the stale trail dropped');
  assert.equal(host._lampId, null, 'the stale rest lamp id dropped');
  assert.deepEqual(host._ownLineIds, [], 'the stale own line dropped');
  assert.equal(host._ownedIds.size, 0, 'the stale ownership ledger dropped');
  assert.equal(host._progress, 0, 'the trail progress dropped');
  assert.equal(host._throughDone, false, 'the through flag dropped');
  assert.equal(host._bothDone, false, 'the both flag dropped');
  assert.deepEqual(host._ploughPoses, [], 'the ploughed line dropped');

  // The fresh visit: trail and rest lamp respawn, nothing lands on reused live ids.
  state.world.currentSectorId = OLD_TRAIL_TUNING.sectorId;
  const reused = reuseAsLive(state, staleIds);
  state.entities.set('p1', player);
  state.entities.set('st1', station);
  host.update(1);
  assert.equal(spawns.length - atSpawns, OLD_TRAIL_TUNING.markers + 1, 'trail and rest lamp respawned');
  assert.ok(host._lampId != null && !reused.has(host._lampId), 'the fresh lamp is its own id');
  noStaleRemovals(removed, atBoundary, reused, 'no stale id removed into a live entity');
  host.destroy();
});

test('PL-140 a new game clears the cooldown ledger; collect keys judge on the fresh clock', () => {
  const bus = createBus();
  const paid = [];
  bus.on('economy:grantCredits', (p) => paid.push(p));
  const player = makePlayer({ x: 10, z: 0 });
  const station = makeStation('station_haumea_rift', { x: 0, z: 0 });
  const state = makeState({ simTime: 1000, entities: new Map([['p1', player], ['st1', station]]) });
  state.meta = { seed: 7 };
  state.entityList = [player, station];   // the anchor seam reads the entity list
  state.world.currentSectorId = GLASS_TUNING.sectorId;
  const { host, helpers } = makeHost(bus, state, glassPaysPlant, (h) => h.init({ bus, state, helpers: h.helpers }));

  // The old session: a shard collected stamps its cooldown key far out on the clock.
  bus.emit('pickup:collected', { commodityId: 'cmdty_ice_shard' });
  assert.equal(paid.length, 1, 'the old session was paid');
  assert.ok(host._cooldowns.has('collect:cmdty_ice_shard'), 'the cooldown key is stamped');

  // New game: simTime back near zero — `now - last` would go negative and block.
  state.simTime = 1;
  bus.emit('game:newGame', { seed: 7 });
  assert.equal(host._cooldowns.size, 0, 'the stale cooldown ledger dropped');

  // The fresh run pays on its first collect — no negative-delta gate stays stuck.
  bus.emit('pickup:collected', { commodityId: 'cmdty_ice_shard' });
  assert.equal(paid.length, 2, 'the fresh collect was judged, not blocked by the stale stamp');
  assert.equal(host._cooldowns.get('collect:cmdty_ice_shard'), 1, 'the fresh stamp is on the new clock');
  host.destroy();
});
