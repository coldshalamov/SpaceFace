// Outpost/waystation plants (design/program/INFERENCE_PLANTS.md section G) —
// PL-116 117 118 119 120 138 139 140 141 142 143 165 166 167 168 169 170.
//
// Each module is tested on its own seams: a real createBus, a minimal flight state, fake
// helpers that record spawns/removes/voice, and event payloads matching the canonical
// emitters (massline:throw, combat:fire, dock:range, pickup:collected, physics:impact,
// survivorPod:boarded, salvage:placed, tether:snapCatch, sector:exit). Determinism smoke:
// the same scenario twice yields identical event/spawn/comms projections. No DOM, no
// Three.js, no Math.random.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { hash32 } from '../src/core/rng.js';

import {
  PLANTS_DUTCH_EVENT, DUTCH_TUNING, dutchClipVerdict, spinPair, dutchAfterYouPlant,
} from '../src/systems/plants/dutchAfterYou.js';
import {
  PLANTS_MAGPIE_EVENT, MAGPIE_TUNING, holdManifest, magpieLabel, magpieLineFor, magpieReadsPlant,
} from '../src/systems/plants/magpieReads.js';
import {
  PLANTS_PIPS_EVENT, PIPS_TUNING, buoyLineEndpoints, nearestOnSegment, sideSign, pipsWord, pipsCountsPlant,
} from '../src/systems/plants/pipsCounts.js';
import {
  PLANTS_RED_MINUTE_EVENT, RED_MINUTE_TUNING, redMinuteWindow, redMinutePhase, isCutter, redMinutePlant,
} from '../src/systems/plants/redMinute.js';
import {
  PLANTS_SENNA_EVENT, SENNA_TUNING, nightWindow, nightKey, lampCountTonight, sennaReadsPlant,
} from '../src/systems/plants/sennaReads.js';
import {
  PLANTS_TWO_ROPES_EVENT, TWO_ROPES_TUNING, addsSecondRope, wellPullDir, twoRopesPlant,
} from '../src/systems/plants/twoRopes.js';
import {
  PLANTS_SHELF_EVENT, SHELF_TUNING, againstTheWall, shelfEdgeVerdict, theShelfPlant,
} from '../src/systems/plants/theShelf.js';
import {
  PLANTS_GLASS_EVENT, GLASS_TUNING, pulseOpen, pulsePhase, isShardCommodity, glassPaysPlant,
} from '../src/systems/plants/glassPays.js';
import {
  PLANTS_THREE_COUNT_EVENT, THREE_COUNT_TUNING, countState, crossesLine, threeCountPlant,
} from '../src/systems/plants/threeCount.js';
import {
  PLANTS_TWICE_EVENT, TWICE_TUNING, larkLightsOff, isDoubleFlash, answererPos, twicePlant,
} from '../src/systems/plants/twice.js';
import {
  PLANTS_GOOD_PATCH_EVENT, GOOD_PATCH_TUNING, isDented, patchedHull, goodPatchPlant,
} from '../src/systems/plants/goodPatch.js';
import {
  PLANTS_RAT_RUN_EVENT, RAT_RUN_TUNING, routeFor, aheadOfNose, ratRunPlant,
} from '../src/systems/plants/ratRun.js';
import {
  PLANTS_BRIGHT_ONE_EVENT, BRIGHT_ONE_TUNING, towPassing, towProgress, isBrightRun, theBrightOnePlant,
} from '../src/systems/plants/theBrightOne.js';
import {
  PLANTS_ARCH_EVENT, ARCH_TUNING, exhaleOpen, breathPhase, crossesSegment, theArchPlant,
} from '../src/systems/plants/theArch.js';
import {
  PLANTS_RUTHS_KNOCK_EVENT, RUTHS_TUNING, inGarden, lineVerdict, ruthsKnockPlant,
} from '../src/systems/plants/ruthsKnock.js';
import {
  PLANTS_OLD_TRAIL_EVENT, OLD_TRAIL_TUNING, trailLine, inOrder, theOldTrailPlant,
} from '../src/systems/plants/theOldTrail.js';
import {
  PLANTS_DARK_WINDOW_EVENT, DARK_WINDOW_TUNING, reliefIndex, darkWindowIndex, litOrder, theWindowThatDoesntPlant,
} from '../src/systems/plants/theWindowThatDoesnt.js';

// ---- harness --------------------------------------------------------------------------------

let idSeq = 100;

function makeState(opts = {}) {
  const entities = new Map();
  const state = {
    mode: 'flight',
    simTime: 300,
    tick: 6000,
    playerId: 'p1',
    entities,
    entityIndex: { stations: [] },
    entityList: [],
    world: { currentSectorId: 's1' },
    meta: { seed: 1 },
    player: { cargo: { items: [] } },
    ...opts,
  };
  state.entities = entities;
  return state;
}

function makePlayer(state, pos = { x: 0, z: 0 }, vel = { x: 0, z: 0 }, extra = {}) {
  const player = {
    id: state.playerId, alive: true, type: 'ship', isPlayer: true,
    pos: { ...pos }, vel: { ...vel }, rot: 0, radius: 6, mass: 12,
    hull: 100, hullMax: 100, physicsBody: { mass: 12 }, data: {},
    ...extra,
  };
  state.entities.set(player.id, player);
  return player;
}

function makeHarness(state) {
  const rec = { spawns: [], removes: [], voice: [], events: [] };
  const bus = createBus();
  const origEmit = bus.emit.bind(bus);
  bus.emit = (event, payload) => {
    rec.events.push({ event, payload });
    return origEmit(event, payload);
  };
  const helpers = {
    spawnEntity(spec) {
      const ent = { id: `ent_${idSeq++}`, alive: true, ...spec, pos: { ...(spec.pos || { x: 0, z: 0 }) }, vel: { ...(spec.vel || { x: 0, z: 0 }) } };
      ent.data = spec.data ? { ...spec.data } : {};
      rec.spawns.push(ent);
      state.entities.set(ent.id, ent);
      state.entityList.push(ent);
      return ent;
    },
    removeEntity(id) {
      rec.removes.push(id);
      state.entities.delete(id);
      const i = state.entityList.findIndex((e) => e && e.id === id);
      if (i >= 0) state.entityList.splice(i, 1);
    },
    voice: { say(u) { rec.voice.push(u); } },
  };
  return { rec, bus, helpers };
}

function fixtureStation(state, id, pos, extraData = {}) {
  const st = { id, type: 'station', alive: true, pos: { ...pos }, radius: 72, data: { stationId: id, ...extraData } };
  state.entityIndex.stations.push(st);
  state.entities.set(id, st);
  state.entityList.push(st);
  return st;
}

function fixtureEntity(state, id, type, pos, data = {}, extra = {}) {
  const e = { id, type, alive: true, pos: { ...pos }, vel: { x: 0, z: 0 }, radius: 10, data: { ...data }, ...extra };
  state.entities.set(id, e);
  state.entityList.push(e);
  return e;
}

function sweep(mod, state, steps = 1, dt = 1) {
  for (let i = 0; i < steps; i++) {
    state.simTime += dt;
    state.tick += Math.round(dt * 60);
    mod.update(dt);
  }
}

function eventsOf(rec, name, kind = null) {
  return rec.events.filter((e) => e.event === name && (kind == null || (e.payload && e.payload.kind === kind)));
}

function commsOf(rec, text = null) {
  return rec.events.filter((e) => e.event === 'comms:popup' && (text == null || (e.payload && e.payload.text === text)));
}

function moduleEvents(rec) {
  const names = [
    PLANTS_DUTCH_EVENT, PLANTS_MAGPIE_EVENT, PLANTS_PIPS_EVENT, PLANTS_RED_MINUTE_EVENT,
    PLANTS_SENNA_EVENT, PLANTS_TWO_ROPES_EVENT, PLANTS_SHELF_EVENT, PLANTS_GLASS_EVENT,
    PLANTS_THREE_COUNT_EVENT, PLANTS_TWICE_EVENT, PLANTS_GOOD_PATCH_EVENT, PLANTS_RAT_RUN_EVENT,
    PLANTS_BRIGHT_ONE_EVENT, PLANTS_ARCH_EVENT, PLANTS_RUTHS_KNOCK_EVENT, PLANTS_OLD_TRAIL_EVENT,
    PLANTS_DARK_WINDOW_EVENT,
  ];
  return rec.events.filter((e) => names.includes(e.event));
}

// ---- family contract ------------------------------------------------------------------------

test('family contract: frozen tuning with memoryCap, standalone system shape', () => {
  const families = [
    [dutchAfterYouPlant, DUTCH_TUNING], [magpieReadsPlant, MAGPIE_TUNING],
    [pipsCountsPlant, PIPS_TUNING], [redMinutePlant, RED_MINUTE_TUNING],
    [sennaReadsPlant, SENNA_TUNING], [twoRopesPlant, TWO_ROPES_TUNING],
    [theShelfPlant, SHELF_TUNING], [glassPaysPlant, GLASS_TUNING],
    [threeCountPlant, THREE_COUNT_TUNING], [twicePlant, TWICE_TUNING],
    [goodPatchPlant, GOOD_PATCH_TUNING], [ratRunPlant, RAT_RUN_TUNING],
    [theBrightOnePlant, BRIGHT_ONE_TUNING], [theArchPlant, ARCH_TUNING],
    [ruthsKnockPlant, RUTHS_TUNING], [theOldTrailPlant, OLD_TRAIL_TUNING],
    [theWindowThatDoesntPlant, DARK_WINDOW_TUNING],
  ];
  for (const [mod, tuning] of families) {
    assert.equal(typeof mod.init, 'function', `${mod.name}: init`);
    assert.equal(typeof mod.update, 'function', `${mod.name}: update`);
    assert.equal(typeof mod.destroy, 'function', `${mod.name}: destroy`);
    assert.match(mod.name, /^plants\d+$/, `${mod.name}: registry name`);
    assert.equal(Object.isFrozen(tuning), true, `${mod.name}: tuning frozen`);
    assert.ok(Number.isInteger(tuning.memoryCap) && tuning.memoryCap > 0, `${mod.name}: memoryCap`);
    assert.equal(typeof tuning.sectorId, 'string', `${mod.name}: sector anchor`);
  }
});

test('family contract: nothing acts while docked', () => {
  // update-driven modules must not spawn or speak in docked mode
  const dockedState = makeState({ mode: 'docked', world: { currentSectorId: PIPS_TUNING.sectorId } });
  const { rec, bus, helpers } = makeHarness(dockedState);
  fixtureStation(dockedState, PIPS_TUNING.stationId, { x: 0, z: 0 });
  makePlayer(dockedState, { x: 30, z: 0 });
  pipsCountsPlant.init({ state: dockedState, bus, helpers });
  pipsCountsPlant.update(1);
  assert.equal(rec.spawns.length, 0, 'pips: no buoy line while docked');

  // listener-driven modules must not react while docked
  const docked2 = makeState({ mode: 'docked', world: { currentSectorId: GLASS_TUNING.sectorId } });
  const h2 = makeHarness(docked2);
  fixtureStation(docked2, GLASS_TUNING.stationId, { x: 0, z: 0 });
  fixtureEntity(docked2, 'poi_fissure', 'anomaly', { x: 20, z: 0 }, { poiId: GLASS_TUNING.poiId });
  makePlayer(docked2, { x: 30, z: 0 });
  glassPaysPlant.init({ state: docked2, bus: h2.bus, helpers: h2.helpers });
  h2.bus.emit('pickup:collected', { id: 'p1', commodityId: 'cmdty_crystal_lumin', pos: { x: 30, z: 0 } });
  assert.equal(eventsOf(h2.rec, PLANTS_GLASS_EVENT).length, 0, 'glass: silent while docked');
});

// ---- PL-116 Dutch / right of way -------------------------------------------------------------

function setupDutch(state) {
  fixtureStation(state, 'station_hyperion_cut', { x: -640, z: 480 });
  const player = makePlayer(state, { x: -540, z: 480 });
  const anchor = fixtureEntity(state, 'anc', 'payload', { x: -520, z: 480 }, {});
  return { player, anchor };
}

test('PL-116 Dutch clips on head-on: "After you."; letting go is waved through', () => {
  const state = makeState({ world: { currentSectorId: DUTCH_TUNING.sectorId } });
  setupDutch(state);
  const { rec, bus, helpers } = makeHarness(state);
  dutchAfterYouPlant.init({ state, bus, helpers });

  bus.emit('massline:throw', { releaseId: 'rel1', payloadId: 'anc' });
  assert.equal(commsOf(rec, 'After you.').length, 1, 'exact row line');
  assert.equal(eventsOf(rec, PLANTS_DUTCH_EVENT, 'clipOn').length, 1);
  const dutchProp = rec.spawns.find((s) => s.data && s.data.scanLabel && s.data.scanLabel.includes('DUTCH'));
  assert.ok(dutchProp, 'Dutch prop spawned');

  // let go: leave the anchor water inside the standoff window
  state.entities.get('anc').pos.x = -520;
  state.entities.get('p1').pos.x = -520 + DUTCH_TUNING.letGoRangeWu + 100;
  sweep(dutchAfterYouPlant, state, 2, 0.5);
  assert.equal(eventsOf(rec, PLANTS_DUTCH_EVENT, 'wavedThrough').length, 1);
  assert.ok(commsOf(rec, "You're through. Go on.").length >= 1);
  assert.ok(rec.removes.includes(dutchProp.id), 'Dutch despawns on the wave-through');
  dutchAfterYouPlant.destroy();
});

test('PL-116 holding the standoff spins the pair; cooldown and cap hold', () => {
  const state = makeState({ world: { currentSectorId: DUTCH_TUNING.sectorId } });
  setupDutch(state);
  const { rec, bus, helpers } = makeHarness(state);
  dutchAfterYouPlant.init({ state, bus, helpers });

  bus.emit('massline:throw', { releaseId: 'rel-hold', payloadId: 'anc' });
  const [a, b] = spinPair(0, DUTCH_TUNING.spinUpImpulse);
  assert.equal(a.x, -b.x, 'spin pair is equal and opposite');
  assert.equal(dutchClipVerdict(100, 1), 'holding');
  assert.equal(dutchClipVerdict(DUTCH_TUNING.letGoRangeWu + 1, 1), 'wavedThrough');
  assert.equal(dutchClipVerdict(100, DUTCH_TUNING.standoffWindowS), 'spinUp');

  // hold: stay near the anchor until the standoff resolves
  for (let i = 0; i < 20; i++) {
    state.entities.get('p1').pos = { x: -520 + 40, z: 480 };
    sweep(dutchAfterYouPlant, state, 1, 0.5);
  }
  assert.equal(eventsOf(rec, PLANTS_DUTCH_EVENT, 'spinUp').length, 1, 'two ships on one anchor find out');
  dutchAfterYouPlant.destroy();

  // cap: at most memoryCap live clips
  const state2 = makeState({ world: { currentSectorId: DUTCH_TUNING.sectorId } });
  setupDutch(state2);
  const h2 = makeHarness(state2);
  dutchAfterYouPlant.init({ state: state2, bus: h2.bus, helpers: h2.helpers });
  for (let i = 0; i < 5; i++) {
    h2.bus.emit('massline:throw', { releaseId: `rel-${i}`, payloadId: 'anc' });
  }
  assert.equal(eventsOf(h2.rec, PLANTS_DUTCH_EVENT, 'clipOn').length, DUTCH_TUNING.memoryCap, 'memoryCap clips');
  dutchAfterYouPlant.destroy();

  // negative: wrong sector
  const state3 = makeState({ world: { currentSectorId: 'sector_rhea_cinder' } });
  setupDutch(state3);
  const h3 = makeHarness(state3);
  dutchAfterYouPlant.init({ state: state3, bus: h3.bus, helpers: h3.helpers });
  h3.bus.emit('massline:throw', { releaseId: 'rel-x', payloadId: 'anc' });
  assert.equal(commsOf(h3.rec, 'After you.').length, 0);
  dutchAfterYouPlant.destroy();
});

// ---- PL-117 Magpie reads the hold ------------------------------------------------------------

test('PL-117 Magpie reads hold items on open radio; empty hold: "Nothing. Bold."', () => {
  const state = makeState({
    world: { currentSectorId: MAGPIE_TUNING.sectorId },
    player: { cargo: { items: [{ commodityId: 'cmdty_ore_iron', qty: 2 }] } },
  });
  fixtureStation(state, 'station_rhea_cinder', { x: -640, z: 520 });
  makePlayer(state, { x: -640, z: 100 }, { x: 30, z: 0 });
  const { rec, bus, helpers } = makeHarness(state);
  magpieReadsPlant.init({ state, bus, helpers });

  assert.deepEqual(holdManifest(state.player.cargo), [{ label: 'ore iron', qty: 2, commodityId: 'cmdty_ore_iron' }]);
  assert.equal(magpieLineFor({ label: 'ore iron', qty: 2 }), 'ore iron — 2.');
  assert.equal(magpieLabel('cmdty_gas_helium3'), 'gas helium3');
  magpieReadsPlant.update(1);
  assert.ok(commsOf(rec, 'ore iron — 2.').length === 1, 'item called item by item');
  assert.equal(eventsOf(rec, PLANTS_MAGPIE_EVENT, 'readsHold').length, 1);

  // cooldown: armed off after one read until you leave the sector
  magpieReadsPlant.update(1);
  assert.equal(commsOf(rec).length, 1, 'once per approach');

  // empty hold gets the exact row line
  state.player.cargo.items = [];
  bus.emit('sector:exit', { sectorId: MAGPIE_TUNING.sectorId });
  magpieReadsPlant.update(1);
  assert.equal(commsOf(rec, 'Nothing. Bold.').length, 1, 'exact empty-hold line');
  assert.equal(eventsOf(rec, PLANTS_MAGPIE_EVENT, 'emptyHold').length, 1);

  // negative: parked in the Seam reads as nothing after re-arm
  bus.emit('sector:exit', { sectorId: MAGPIE_TUNING.sectorId });
  state.entities.get('p1').vel = { x: 0, z: 0 };
  magpieReadsPlant.update(1);
  assert.equal(commsOf(rec).length, 2, 'parked: no fresh read');
  magpieReadsPlant.destroy();
});

// ---- PL-118 Pips counts ----------------------------------------------------------------------

test('PL-118 Pips counts your convoy across the buoy line: "Two." then "Three."', () => {
  const state = makeState({ world: { currentSectorId: PIPS_TUNING.sectorId } });
  const station = fixtureStation(state, 'station_veil', { x: 420, z: -1120 });
  const { rec, bus, helpers } = makeHarness(state);
  pipsCountsPlant.init({ state, bus, helpers });

  const line = buoyLineEndpoints(station.pos, state.meta.seed, PIPS_TUNING.sectorId);
  assert.equal(line.buoys.length, PIPS_TUNING.buoyCount);
  const ux = Math.cos(line.bearing);
  const uz = Math.sin(line.bearing);
  const mid = nearestOnSegment({ x: station.pos.x, z: station.pos.z }, line.a, line.b);
  const perp = { x: uz, z: -ux };
  const sideA = { x: mid.x + perp.x * 25, z: mid.z + perp.z * 25 };
  const sideB = { x: mid.x - perp.x * 25, z: mid.z - perp.z * 25 };
  assert.equal(sideSign(sideA, line.a, ux, uz), 1);
  assert.equal(sideSign(sideB, line.a, ux, uz), -1);
  assert.equal(pipsWord(2), 'Two');
  assert.equal(pipsWord(3), 'Three');

  const player = makePlayer(state, sideA);
  sweep(pipsCountsPlant, state, 1, 1);           // props built, side armed
  assert.equal(rec.spawns.filter((s) => s.data && s.data.scanLabel && s.data.scanLabel.includes('Buoy line')).length, 4);
  player.pos = { ...sideB };
  sweep(pipsCountsPlant, state, 1, 1);           // crossing
  assert.equal(commsOf(rec, 'Two.').length, 1, 'exact row line, empty convoy');
  assert.equal(eventsOf(rec, PLANTS_PIPS_EVENT, 'passed').length, 1);

  // passenger pod aboard: the count climbs
  bus.emit('survivorPod:boarded', { id: 'pod1', entityId: 'pod1' });
  sweep(pipsCountsPlant, state, 25, 1);          // leave the corridor + cooldown window
  player.pos = { ...sideB };
  sweep(pipsCountsPlant, state, 1, 1);
  player.pos = { ...sideA };
  sweep(pipsCountsPlant, state, 1, 1);
  assert.equal(commsOf(rec, 'Three.').length, 1, 'pod makes three');
  assert.equal(eventsOf(rec, PLANTS_PIPS_EVENT, 'passed').length, 2);

  // sector:exit despawns the line
  bus.emit('sector:exit', { sectorId: PIPS_TUNING.sectorId });
  assert.ok(rec.removes.length >= 5, 'buoy line + pacer despawn on exit');
  pipsCountsPlant.destroy();
});

// ---- PL-119 the red minute -------------------------------------------------------------------

test('PL-119 the red minute: cutters hold; cutting finds you; sitting it out ends clean', () => {
  const state = makeState({ simTime: 500, world: { currentSectorId: RED_MINUTE_TUNING.sectorId } });
  const phase = redMinutePhase(state.meta.seed, RED_MINUTE_TUNING.sectorId);
  assert.ok(redMinuteWindow(500, phase), 'fixture time sits inside the minute');
  const poi = fixtureEntity(state, 'poi_hulk', 'derelict', { x: 1000, z: 700 }, { poiId: RED_MINUTE_TUNING.poiId });
  const cutter = fixtureEntity(state, 'civ1', 'ship', { x: 1040, z: 700 }, { name: 'cutter' });
  const player = makePlayer(state, { x: 1080, z: 700 });
  const { rec, bus, helpers } = makeHarness(state);
  redMinutePlant.init({ state, bus, helpers });

  sweep(redMinutePlant, state, 1, 1);            // window rising edge
  assert.equal(eventsOf(rec, PLANTS_RED_MINUTE_EVENT, 'holdStart').length, 1);
  assert.equal(cutter.data.plants119HoldUntil > 0, true, 'cutters marked holding');
  const flare = rec.spawns.find((s) => s.data && s.data.storyPropKind === 'seal_flare');
  assert.ok(flare, 'seal flare spawned');
  assert.equal(flare.data.swarmFloorPad.label, 'RED MINUTE — HOLD');

  // cutting during the minute: every lamp finds you, once per minute
  bus.emit('pickup:collected', { id: 'p1', pos: { x: 1010, z: 700 } });
  assert.equal(eventsOf(rec, PLANTS_RED_MINUTE_EVENT, 'cutting').length, 1);
  assert.equal(cutter.data.lampsFlashing, true, 'lamps flash');
  assert.ok(cutter.data.lampFlashUntil > state.simTime);
  assert.equal(commsOf(rec, 'The lamps find you.').length, 1);
  bus.emit('pickup:collected', { id: 'p1', pos: { x: 1010, z: 700 } });
  assert.equal(eventsOf(rec, PLANTS_RED_MINUTE_EVENT, 'cutting').length, 1, 'one finding per minute');
  assert.equal(isCutter(cutter, 'p1'), true);
  assert.equal(isCutter(player, 'p1'), false);
  redMinutePlant.destroy();
});

test('PL-119 waiting it out with the cutters ends the minute clean', () => {
  const state = makeState({ simTime: 500, world: { currentSectorId: RED_MINUTE_TUNING.sectorId } });
  fixtureEntity(state, 'poi_hulk', 'derelict', { x: 1000, z: 700 }, { poiId: RED_MINUTE_TUNING.poiId });
  makePlayer(state, { x: 1060, z: 700 });
  const { rec, bus, helpers } = makeHarness(state);
  redMinutePlant.init({ state, bus, helpers });
  sweep(redMinutePlant, state, 60, 1);           // sit through the whole minute
  assert.equal(eventsOf(rec, PLANTS_RED_MINUTE_EVENT, 'satItOut').length, 1);
  assert.equal(commsOf(rec, "Minute's done. Cut clean.").length, 1);
  const flare = rec.spawns.find((s) => s.data && s.data.storyPropKind === 'seal_flare');
  assert.equal(flare.data.swarmFloorPad.label, 'SEAL FLARE', 'pad restores after the minute');
  redMinutePlant.destroy();
});

// ---- PL-120 the reading ----------------------------------------------------------------------

test('PL-120 Senna reads the lost; on the second sitting she reads yours; leaving = past it', () => {
  const state = makeState({ simTime: 480, world: { currentSectorId: SENNA_TUNING.sectorId } });
  fixtureStation(state, 'station_sedna', { x: -480, z: 620 });
  const player = makePlayer(state, { x: -480, z: 700 });
  const { rec, bus, helpers } = makeHarness(state);
  sennaReadsPlant.init({ state, bus, helpers });

  assert.equal(nightWindow(480), true);
  assert.equal(nightKey(1080, 600), 1);
  assert.equal(lampCountTonight(0), 5);
  sweep(sennaReadsPlant, state, 1, 1);
  assert.equal(commsOf(rec, 'She reads the lost.').length, 1);
  assert.equal(rec.spawns.length, 5, 'one lamp hung per name');
  sweep(sennaReadsPlant, state, 30, 1);          // sit the night out
  assert.equal(eventsOf(rec, PLANTS_SENNA_EVENT, 'satOut').length, 1);

  // second completed sitting: she hangs one and reads yours
  state.simTime = 1079;                          // just before the next night
  sweep(sennaReadsPlant, state, 2, 1);          // crosses into night 2
  assert.equal(commsOf(rec, 'She reads the lost.').length, 2);
  sweep(sennaReadsPlant, state, 30, 1);
  assert.equal(eventsOf(rec, PLANTS_SENNA_EVENT, 'readsYours').length, 1);
  assert.equal(commsOf(rec, 'Yours is the last lamp.').length, 1);
  const yours = rec.spawns.find((s) => s.data && s.data.swarmFloorPad && s.data.swarmFloorPad.label === 'A LAMP — YOURS');
  assert.ok(yours, 'your lamp hung');

  // leave mid-reading: when you come back, she is past it
  state.simTime = 1679;
  sweep(sennaReadsPlant, state, 2, 1);          // night 3 starts, reading opens
  bus.emit('sector:exit', { sectorId: SENNA_TUNING.sectorId });
  assert.equal(eventsOf(rec, PLANTS_SENNA_EVENT, 'leftMidReading').length, 1);
  state.simTime = 2279;
  sweep(sennaReadsPlant, state, 2, 1);          // night 4: the announcement
  assert.equal(commsOf(rec, 'She was past it.').length, 1);
  sweep(sennaReadsPlant, state, 32, 1);         // the reading runs out uncounted
  assert.equal(eventsOf(rec, PLANTS_SENNA_EVENT, 'readsYours').length, 1, 'no second personal lamp');
  assert.equal(commsOf(rec, 'She was past it.').length, 1, 'announced once');
  sennaReadsPlant.destroy();
});

// ---- PL-138 two ropes ------------------------------------------------------------------------

function ropeCatchId(rec) {
  const catchEnt = rec.spawns.find((s) => s.type === 'payload' && s.data && s.data.storyPropKind === 'colm_catch');
  return catchEnt ? catchEnt.id : null;
}

test('PL-138 two ropes: the groan, the assist, the Well pulling back', () => {
  const state = makeState({ world: { currentSectorId: TWO_ROPES_TUNING.sectorId } });
  fixtureEntity(state, 'poi_funnel', 'derelict', { x: 1000, z: 800 }, { poiId: TWO_ROPES_TUNING.poiId });
  const player = makePlayer(state, { x: 1000, z: 800 });
  const { rec, bus, helpers } = makeHarness(state);
  twoRopesPlant.init({ state, bus, helpers });

  sweep(twoRopesPlant, state, 1, 1);             // props materialize
  const catchEnt = rec.spawns.find((s) => s.type === 'payload');
  assert.ok(catchEnt, 'the catch is a real payload crate');
  assert.equal(catchEnt.flags && catchEnt.flags.persistent, true, 'persistent crate contract');
  assert.equal(catchEnt.data.masslineTetherable, true);
  const catchId = ropeCatchId(rec);
  const colm = rec.spawns.find((s) => s.data && s.data.scanLabel && s.data.scanLabel.includes('DEEP COLM'));
  assert.ok(colm, 'Colm\u2019s winch spawned');

  sweep(twoRopesPlant, state, 2, 75);            // the winch groans and loses
  assert.equal(commsOf(rec, 'Pull!').length, 1, 'exact row line');
  assert.equal(eventsOf(rec, PLANTS_TWO_ROPES_EVENT, 'losing').length, 1);
  assert.equal(addsSecondRope(0, 100), true);
  assert.equal(addsSecondRope(TWO_ROPES_TUNING.holdWindowS + 1, 100), false);

  // negative: too late after the groan
  state.simTime += 10;
  bus.emit('massline:throw', { releaseId: 'late' });
  assert.equal(eventsOf(rec, PLANTS_TWO_ROPES_EVENT, 'twoLines').length, 0);

  // assist inside the window
  state.simTime -= 10;                           // back inside the window
  player.pos = { x: catchEnt.pos.x + 50, z: catchEnt.pos.z };
  bus.emit('massline:throw', { releaseId: 'assist1' });
  assert.equal(eventsOf(rec, PLANTS_TWO_ROPES_EVENT, 'twoLines').length, 1);

  // hold: the catch comes up on two lines and the Well pulls back once, hard
  for (let i = 0; i < 40 && eventsOf(rec, PLANTS_TWO_ROPES_EVENT, 'wellPull').length === 0; i++) {
    player.pos = { x: colm.pos.x + 60, z: colm.pos.z };
    sweep(twoRopesPlant, state, 1, 0.5);
  }
  assert.equal(eventsOf(rec, PLANTS_TWO_ROPES_EVENT, 'wellPull').length, 1, 'the Well pulls back');
  assert.ok(commsOf(rec, 'Up. Two lines.').length >= 1);
  assert.ok(eventsOf(rec, 'audio:cue').some((e) => e.payload && e.payload.id === 'warning'), 'hard pull is heard');
  twoRopesPlant.destroy();
});

test('PL-138 letting go early quiets the Well for a day; holding gets you hailed first', () => {
  const state = makeState({ world: { currentSectorId: TWO_ROPES_TUNING.sectorId } });
  fixtureEntity(state, 'poi_funnel', 'derelict', { x: 1000, z: 800 }, { poiId: TWO_ROPES_TUNING.poiId });
  const player = makePlayer(state, { x: 1000, z: 800 });
  const { rec, bus, helpers } = makeHarness(state);
  twoRopesPlant.init({ state, bus, helpers });
  sweep(twoRopesPlant, state, 1, 1);
  const catchEnt = rec.spawns.find((s) => s.type === 'payload');
  const colm = rec.spawns.find((s) => s.data && s.data.scanLabel && s.data.scanLabel.includes('DEEP COLM'));

  sweep(twoRopesPlant, state, 2, 75);            // groan
  player.pos = { x: catchEnt.pos.x + 50, z: catchEnt.pos.z };
  bus.emit('massline:throw', { releaseId: 'go1' });
  assert.equal(eventsOf(rec, PLANTS_TWO_ROPES_EVENT, 'twoLines').length, 1);

  // let go: leave the winch water before the catch comes up
  player.pos = { x: colm.pos.x + 600, z: colm.pos.z };
  sweep(twoRopesPlant, state, 1, 0.5);
  assert.equal(eventsOf(rec, PLANTS_TWO_ROPES_EVENT, 'letGoQuiet').length, 1);
  const groansBefore = commsOf(rec, 'Pull!').length;
  sweep(twoRopesPlant, state, 4, 75);            // the Well is quiet
  assert.equal(commsOf(rec, 'Pull!').length, groansBefore, 'quiet for a day');
  assert.deepEqual(wellPullDir({ x: 0, z: 0 }, { x: 10, z: 0 }), { x: 1, z: 0 });
  twoRopesPlant.destroy();

  // hold through a pull: hailed first next time
  const state2 = makeState({ world: { currentSectorId: TWO_ROPES_TUNING.sectorId } });
  fixtureEntity(state2, 'poi_funnel', 'derelict', { x: 1000, z: 800 }, { poiId: TWO_ROPES_TUNING.poiId });
  const player2 = makePlayer(state2, { x: 1000, z: 800 });
  const h2 = makeHarness(state2);
  twoRopesPlant.init({ state: state2, bus: h2.bus, helpers: h2.helpers });
  sweep(twoRopesPlant, state2, 1, 1);
  const catch2 = h2.rec.spawns.find((s) => s.type === 'payload');
  const colm2 = h2.rec.spawns.find((s) => s.data && s.data.scanLabel && s.data.scanLabel.includes('DEEP COLM'));
  sweep(twoRopesPlant, state2, 2, 75);
  player2.pos = { x: catch2.pos.x + 50, z: catch2.pos.z };
  h2.bus.emit('massline:throw', { releaseId: 'go2' });
  for (let i = 0; i < 40 && eventsOf(h2.rec, PLANTS_TWO_ROPES_EVENT, 'wellPull').length === 0; i++) {
    player2.pos = { x: colm2.pos.x + 60, z: colm2.pos.z };
    sweep(twoRopesPlant, state2, 1, 0.5);
  }
  assert.equal(eventsOf(h2.rec, PLANTS_TWO_ROPES_EVENT, 'wellPull').length, 1);
  // next groan + assist: Colm hails you first (one period: the groan fires on the last step)
  sweep(twoRopesPlant, state2, 150, 1);
  player2.pos = { x: catch2.pos.x + 50, z: catch2.pos.z };
  h2.bus.emit('massline:throw', { releaseId: 'go3' });
  assert.equal(commsOf(h2.rec, 'Colm. Hailing you first.').length, 1, 'hailed first');
  twoRopesPlant.destroy();
});

// ---- PL-139 the shelf ------------------------------------------------------------------------

test('PL-139 the shelf: left on the inhale, kept flush on the exhale, road if too long', () => {
  const state = makeState({ simTime: 10, world: { currentSectorId: SHELF_TUNING.sectorId } });
  makePlayer(state, { x: -700, z: 300 });
  const item = fixtureEntity(state, 'pl1', 'payload', { x: -700, z: 100 }, { commodityId: 'cmdty_ore_iron' });
  const far = fixtureEntity(state, 'far1', 'payload', { x: -1000, z: 100 }, {});
  const { rec, bus, helpers } = makeHarness(state);
  theShelfPlant.init({ state, bus, helpers });

  assert.equal(againstTheWall({ x: SHELF_TUNING.wallX, z: 0 }), true);
  assert.equal(againstTheWall({ x: SHELF_TUNING.wallX - SHELF_TUNING.shelfWidthWu - 1, z: 0 }), false);
  assert.equal(shelfEdgeVerdict(2), 'road');

  sweep(theShelfPlant, state, 1, 1);             // inhale: left against the wall
  assert.equal(eventsOf(rec, PLANTS_SHELF_EVENT, 'leftOnInhale').length, 1, 'item noticed');
  assert.equal(eventsOf(rec, PLANTS_SHELF_EVENT, 'leftOnInhale').filter((e) => e.payload.entityId === 'far1').length, 0, 'far item ignored');

  sweep(theShelfPlant, state, 12, 1);            // exhale edge: sits flush in the wall, kept
  assert.equal(eventsOf(rec, PLANTS_SHELF_EVENT, 'kept').length, 1);
  assert.equal(item.data.swarmFloorPad.label, 'THE SHELF — KEPT');

  // take it back on the exhale, on the Line
  bus.emit('pickup:collected', { id: 'pl1' });
  assert.equal(eventsOf(rec, PLANTS_SHELF_EVENT, 'takenBack').length, 1);
  assert.equal(item.data.swarmFloorPad, undefined, 'pad cleared when taken');
  theShelfPlant.destroy();

  // leave it too long: part of the road
  const state2 = makeState({ simTime: 10, world: { currentSectorId: SHELF_TUNING.sectorId } });
  makePlayer(state2, { x: -700, z: 300 });
  const item2 = fixtureEntity(state2, 'pl2', 'payload', { x: -700, z: 120 }, {});
  const h2 = makeHarness(state2);
  theShelfPlant.init({ state: state2, bus: h2.bus, helpers: h2.helpers });
  sweep(theShelfPlant, state2, 1, 1);
  sweep(theShelfPlant, state2, 53, 1);           // through three exhales
  assert.equal(eventsOf(h2.rec, PLANTS_SHELF_EVENT, 'road').length, 1, 'becomes the road');
  assert.ok(h2.rec.removes.includes('pl2'), 'the body is gone into the wall');
  theShelfPlant.destroy();
});

// ---- PL-140 glass pays -----------------------------------------------------------------------

test('PL-140 glass pays: shard on the pulse bought whole; glitter cheap; "Don\'t." on the wall', () => {
  const state = makeState({ simTime: 41, world: { currentSectorId: GLASS_TUNING.sectorId } });
  const phase = pulsePhase(state.meta.seed, GLASS_TUNING.sectorId);
  assert.ok(pulseOpen(41, phase), 'fixture sits inside the pulse');
  fixtureEntity(state, 'poi_fissure', 'anomaly', { x: 0, z: 0 }, { poiId: GLASS_TUNING.poiId });
  makePlayer(state, { x: 30, z: 0 });
  const { rec, bus, helpers } = makeHarness(state);
  glassPaysPlant.init({ state, bus, helpers });
  assert.equal(isShardCommodity('cmdty_crystal_lumin'), true);
  assert.equal(isShardCommodity('cmdty_ore_iron'), false);

  // calved on the pulse: bought off your rope on the spot
  bus.emit('pickup:collected', { id: 'p1', commodityId: 'cmdty_crystal_lumin', pos: { x: 30, z: 0 } });
  const grants = eventsOf(rec, 'economy:grantCredits');
  assert.equal(grants.length, 1);
  assert.equal(grants[0].payload.amount, GLASS_TUNING.shardPriceCr);
  assert.equal(eventsOf(rec, PLANTS_GLASS_EVENT, 'bought').length, 1);
  assert.ok(commsOf(rec, 'Paid. Straight off your rope.').length === 1);

  // missed the pulse: glitter, cheap
  state.simTime = 59;
  bus.emit('pickup:collected', { id: 'p1', commodityId: 'cmdty_crystal_lumin', pos: { x: 30, z: 0 } });
  const glitter = eventsOf(rec, 'economy:grantCredits');
  assert.equal(glitter.length, 2);
  assert.equal(glitter[1].payload.amount, GLASS_TUNING.glitterCr);
  assert.equal(eventsOf(rec, PLANTS_GLASS_EVENT, 'glitter').length, 1);

  // ring a shard off the rift wall
  fixtureEntity(state, 'shard1', 'pickup', { x: 60, z: 0 }, { commodityId: 'cmdty_crystal_lumin' });
  fixtureEntity(state, 'rock1', 'asteroid', { x: 62, z: 0 }, {});
  bus.emit('physics:impact', { aId: 'shard1', bId: 'rock1', impulseMag: 300 });
  assert.equal(commsOf(rec, "Don't.").length, 1, 'exact row line');
  assert.equal(eventsOf(rec, PLANTS_GLASS_EVENT, 'dont').length, 1);
  bus.emit('physics:impact', { aId: 'shard1', bId: 'rock1', impulseMag: 300 });
  assert.equal(eventsOf(rec, PLANTS_GLASS_EVENT, 'dont').length, 1, 'cooldown per pair');

  // negatives: soft ring is nothing; plain ore is nothing
  bus.emit('physics:impact', { aId: 'shard1', bId: 'rock1', impulseMag: 10 });
  bus.emit('pickup:collected', { id: 'p1', commodityId: 'cmdty_ore_iron', pos: { x: 30, z: 0 } });
  assert.equal(eventsOf(rec, PLANTS_GLASS_EVENT).length, 3);
  glassPaysPlant.destroy();
});

// ---- PL-141 three count ----------------------------------------------------------------------

test('PL-141 three-count: wait out a beam, "One." "Two.", the mark; cross early and it is crossed out', () => {
  const sector = THREE_COUNT_TUNING.sectorId;
  const state = makeState({ simTime: 0, world: { currentSectorId: sector } });
  fixtureEntity(state, 'poi_stone', 'beacon', { x: 0, z: 0 }, { poiId: THREE_COUNT_TUNING.poiId });
  const player = makePlayer(state, { x: 30, z: 0 });
  const { rec, bus, helpers } = makeHarness(state);
  threeCountPlant.init({ state, bus, helpers });

  const bearing = (hash32(state.meta.seed, sector, 'pl141-line') % 6283) / 1000;
  const n = { x: Math.sin(bearing), z: -Math.cos(bearing) };
  assert.equal(countState(1), 'waiting');
  assert.equal(countState(THREE_COUNT_TUNING.beamPeriodS * 0.8), 'counting');
  assert.equal(countState(THREE_COUNT_TUNING.beamPeriodS), 'counted');

  // cross early: the mark is crossed out
  sweep(threeCountPlant, state, 10, 0.5);        // held ~5 s beside the rock
  player.pos = { x: -n.x * 30, z: -n.z * 30 };
  sweep(threeCountPlant, state, 1, 0.5);
  assert.equal(commsOf(rec, "Early. Mark's out.").length, 1);
  assert.equal(eventsOf(rec, PLANTS_THREE_COUNT_EVENT, 'crossedOut').length, 1);
  const mark = rec.spawns.find((s) => s.data && s.data.storyPropKind === 'sabine_mark');
  assert.equal(mark.data.swarmFloorPad.label, 'YOUR MARK — CROSSED OUT');
  threeCountPlant.destroy();

  // wait out the beam: counted, then crossing on the count is safe
  const state2 = makeState({ simTime: 0, world: { currentSectorId: sector } });
  fixtureEntity(state2, 'poi_stone', 'beacon', { x: 0, z: 0 }, { poiId: THREE_COUNT_TUNING.poiId });
  const player2 = makePlayer(state2, { x: n.x * 30, z: n.z * 30 });
  const h2 = makeHarness(state2);
  threeCountPlant.init({ state: state2, bus: h2.bus, helpers: h2.helpers });
  sweep(threeCountPlant, state2, 36, 0.5);       // 18 s: "One."
  assert.equal(commsOf(h2.rec, 'One.').length, 1);
  sweep(threeCountPlant, state2, 12, 0.5);       // 24 s: "Two." + the mark
  assert.equal(commsOf(h2.rec, 'Two.').length, 1);
  assert.equal(eventsOf(h2.rec, PLANTS_THREE_COUNT_EVENT, 'marked').length, 1);
  const mark2 = h2.rec.spawns.find((s) => s.data && s.data.storyPropKind === 'sabine_mark');
  assert.equal(mark2.data.swarmFloorPad.label, 'YOUR MARK — COUNTER');
  player2.pos = { x: -n.x * 30, z: -n.z * 30 };
  sweep(threeCountPlant, state2, 1, 0.5);
  assert.equal(commsOf(h2.rec, 'Across on her count.').length, 1);
  assert.equal(eventsOf(h2.rec, PLANTS_THREE_COUNT_EVENT, 'crossedSafe').length, 1);
  threeCountPlant.destroy();
});

// ---- PL-142 twice ----------------------------------------------------------------------------

test('PL-142 twice: one flash answers once; two flashes answer twice, from further off', () => {
  const state = makeState({ simTime: 5, world: { currentSectorId: TWICE_TUNING.sectorId } });
  fixtureEntity(state, 'poi_lantern', 'beacon', { x: 0, z: 0 }, { poiId: TWICE_TUNING.poiId });
  makePlayer(state, { x: 40, z: 0 });
  const { rec, bus, helpers } = makeHarness(state);
  twicePlant.init({ state, bus, helpers });
  sweep(twicePlant, state, 1, 0.5);              // Lark materializes and paces
  assert.equal(larkLightsOff(5), true);
  assert.equal(larkLightsOff(100), false);
  assert.equal(isDoubleFlash([1, 2], 2), true);
  assert.equal(isDoubleFlash([1], 2), false);
  const lark = rec.spawns.find((s) => s.data && s.data.scanLabel === 'LARK — runner, lights-off');
  assert.ok(lark, 'Lark spawned');

  // one flash: she flashes back, once
  bus.emit('combat:fire', { ownerId: 'p1', origin: { ...lark.pos } });
  assert.equal(eventsOf(rec, PLANTS_TWICE_EVENT, 'flashBack').length, 1);
  assert.equal(lark.data.lampsFlashing, true);

  // two flashes inside the window: something further off answers twice
  state.simTime = 6;
  bus.emit('combat:fire', { ownerId: 'p1', origin: { ...lark.pos } });
  assert.equal(eventsOf(rec, PLANTS_TWICE_EVENT, 'farAnsweredTwice').length, 1);
  const answerer = rec.spawns.find((s) => s.data && s.data.storyPropKind === 'twice_answerer');
  assert.ok(answerer, 'the answerer spawned further off');
  assert.ok(answerer.pos !== undefined);
  const expected = answererPos({ x: 0, z: 0 }, state.meta.seed, TWICE_TUNING.sectorId);
  assert.equal(answerer.pos.x, expected.x);
  assert.equal(answerer.data.swarmFloorPad.label, 'ANSWER 1');
  const confirmsBefore = eventsOf(rec, 'audio:cue').filter((e) => e.payload.id === 'confirm' && e.payload.rate === 0.7).length;
  assert.equal(confirmsBefore, 1);
  sweep(twicePlant, state, 3, 0.5);              // the second flash lands in sim time
  const confirmsAfter = eventsOf(rec, 'audio:cue').filter((e) => e.payload.id === 'confirm' && e.payload.rate === 0.7).length;
  assert.equal(confirmsAfter, 2, 'answered twice');

  // negative: she runs lights-off outside her pass — flashes there read as nothing
  const before = moduleEvents(rec).length;
  state.simTime = 100;
  bus.emit('combat:fire', { ownerId: 'p1', origin: { ...lark.pos } });
  assert.equal(moduleEvents(rec).length, before);
  twicePlant.destroy();
});

// ---- PL-143 the good patch -------------------------------------------------------------------

test('PL-143 the good patch: dented into Triton range gets patched first; the tea pours', () => {
  const state = makeState({ world: { currentSectorId: GOOD_PATCH_TUNING.sectorId } });
  fixtureStation(state, 'station_triton', { x: 480, z: -980 });
  const player = makePlayer(state, { x: 480, z: -900 }, { x: 0, z: 0 }, { hull: 50, hullMax: 100 });
  const { rec, bus, helpers } = makeHarness(state);
  goodPatchPlant.init({ state, bus, helpers });
  assert.equal(isDented(50, 100), true);
  assert.equal(isDented(95, 100), false);
  assert.equal(patchedHull(50, 100), 62);

  bus.emit('dock:range', { stationId: 'station_triton', inRange: true });
  assert.equal(player.hull, 62, 'patched before you\u2019ve docked');
  assert.equal(commsOf(rec, "Patches and tea. That's the list.").length, 1, 'exact row line');
  assert.equal(eventsOf(rec, PLANTS_GOOD_PATCH_EVENT, 'patched').length, 1);

  // linger in range: she pours one instead of answering
  sweep(goodPatchPlant, state, 42, 0.5);
  assert.equal(commsOf(rec, 'She pours one instead.').length, 1);
  assert.equal(eventsOf(rec, PLANTS_GOOD_PATCH_EVENT, 'tea').length, 1);

  // leave and come back quickly: no double patch inside the cooldown window
  bus.emit('dock:range', { stationId: 'station_triton', inRange: false });
  state.simTime += 1;
  bus.emit('dock:range', { stationId: 'station_triton', inRange: true });
  assert.equal(commsOf(rec, "Patches and tea. That's the list.").length, 1, 'once per approach');

  // negative: flying in whole is nothing
  const state2 = makeState({ world: { currentSectorId: GOOD_PATCH_TUNING.sectorId } });
  fixtureStation(state2, 'station_triton', { x: 480, z: -980 });
  makePlayer(state2, { x: 480, z: -900 }, { x: 0, z: 0 }, { hull: 95, hullMax: 100 });
  const h2 = makeHarness(state2);
  goodPatchPlant.init({ state: state2, bus: h2.bus, helpers: h2.helpers });
  h2.bus.emit('dock:range', { stationId: 'station_triton', inRange: true });
  assert.equal(moduleEvents(h2.rec).length, 0);
  goodPatchPlant.destroy();

  // negative: wrong station
  bus.emit('dock:range', { stationId: 'station_drift', inRange: true });
  assert.equal(eventsOf(rec, PLANTS_GOOD_PATCH_EVENT, 'patched').length, 1);
  goodPatchPlant.destroy();
});

// ---- PL-165 the rat-run ----------------------------------------------------------------------

test('PL-165 the rat-run: follow it clean and the street parts; cut it off and be chalked', () => {
  const state = makeState({ world: { currentSectorId: RAT_RUN_TUNING.sectorId } });
  const station = fixtureStation(state, 'station_drift', { x: 0, z: 0 });
  const player = makePlayer(state, { x: 0, z: 0 });
  const { rec, bus, helpers } = makeHarness(state);
  ratRunPlant.init({ state, bus, helpers });

  const route = routeFor(state.meta.seed, RAT_RUN_TUNING.sectorId, 0);
  assert.equal(route.length, RAT_RUN_TUNING.corners);
  assert.equal(aheadOfNose({ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 50, z: 0 }), true);
  assert.equal(aheadOfNose({ x: 0, z: 0 }, { x: 10, z: 0 }, { x: -50, z: 0 }), false);

  // follow its line clean: hug the skiff through every corner
  sweep(ratRunPlant, state, 1, 0.5);             // the run starts, skiff spawns
  const skiff = rec.spawns.find((s) => s.data && s.data.storyPropKind === 'rib_street_skiff');
  assert.ok(skiff, 'delivery skiff spawned');
  assert.equal(rec.spawns.filter((s) => s.data && s.data.storyPropKind === 'rib_street_plate').length, 4);
  let parts = false;
  for (let i = 0; i < 200 && !parts; i++) {
    player.pos = { x: state.entities.get(skiff.id).pos.x, z: state.entities.get(skiff.id).pos.z };
    sweep(ratRunPlant, state, 1, 0.5);
    parts = eventsOf(rec, PLANTS_RAT_RUN_EVENT, 'streetParts').length > 0;
  }
  assert.equal(parts, true, 'the street parts for you too');
  assert.equal(commsOf(rec, 'The street parts for you.').length, 1);
  ratRunPlant.destroy();

  // cut it off: your tag goes chalked on a plate
  const state2 = makeState({ world: { currentSectorId: RAT_RUN_TUNING.sectorId } });
  fixtureStation(state2, 'station_drift', { x: 0, z: 0 });
  const player2 = makePlayer(state2, { x: 0, z: 0 });
  const h2 = makeHarness(state2);
  ratRunPlant.init({ state: state2, bus: h2.bus, helpers: h2.helpers });
  sweep(ratRunPlant, state2, 1, 0.5);
  const skiff2 = h2.rec.spawns.find((s) => s.data && s.data.storyPropKind === 'rib_street_skiff');
  const mover = state2.entities.get(skiff2.id);
  const vx = mover.vel.x, vz = mover.vel.z;
  const vl = Math.hypot(vx, vz) || 1;
  player2.pos = { x: mover.pos.x + (vx / vl) * 60, z: mover.pos.z + (vz / vl) * 60 };
  sweep(ratRunPlant, state2, 1, 0.5);
  assert.equal(eventsOf(h2.rec, PLANTS_RAT_RUN_EVENT, 'cutOff').length, 1);
  assert.equal(commsOf(h2.rec, 'Chalked on a plate.').length, 1);
  const chalk = h2.rec.spawns.find((s) => s.data && s.data.storyPropKind === 'rib_street_chalk');
  assert.ok(chalk, 'chalked plate spawned');
  assert.equal(chalk.data.swarmFloorPad.label, 'CHALKED · CUT THE RUN');
  ratRunPlant.destroy();
});

// ---- PL-166 the bright one -------------------------------------------------------------------

test('PL-166 the bright one: the street dims for the tow; flash once, Calloway nods later', () => {
  const state = makeState({ simTime: 5, world: { currentSectorId: BRIGHT_ONE_TUNING.sectorId } });
  const station = fixtureStation(state, 'station_drift', { x: 0, z: 0 });
  const player = makePlayer(state, { x: 30, z: 0 });
  const { rec, bus, helpers } = makeHarness(state);
  theBrightOnePlant.init({ state, bus, helpers });
  assert.equal(towPassing(5), true);
  assert.equal(towPassing(35), false);

  sweep(theBrightOnePlant, state, 1, 0.5);       // the tow passes, the street dims
  assert.equal(rec.spawns.some((s) => s.data && s.data.storyPropKind === 'funeral_tow'), true);
  const stranger = rec.spawns.find((s) => s.data && s.data.storyPropKind === 'bright_stranger');
  assert.ok(stranger, 'the lamps-full stranger spawned');
  const plate = rec.spawns.find((s) => s.data && s.data.storyPropKind === 'rib_street_dim');
  assert.ok(plate, 'street plate spawned');

  // one flash at them: Mother Calloway nods at you later
  const tow = rec.spawns.find((s) => s.data && s.data.storyPropKind === 'funeral_tow');
  bus.emit('combat:fire', { ownerId: 'p1', origin: { ...state.entities.get(tow.id).pos } });
  assert.equal(isBrightRun([1, 2], 2), true);
  assert.equal(isBrightRun([1], 2), false);
  sweep(theBrightOnePlant, state, 62, 0.5);      // the passing ends
  assert.equal(eventsOf(rec, PLANTS_BRIGHT_ONE_EVENT, 'flashedOnce').length, 1);
  bus.emit('dock:range', { stationId: 'station_drift', inRange: true });
  assert.equal(commsOf(rec, 'Calloway nods as you pass.').length, 1);
  assert.equal(eventsOf(rec, PLANTS_BRIGHT_ONE_EVENT, 'nod').length, 1);
  theBrightOnePlant.destroy();
});

test('PL-166 running bright yourself: remembered beside them', () => {
  const state = makeState({ simTime: 5, world: { currentSectorId: BRIGHT_ONE_TUNING.sectorId } });
  fixtureStation(state, 'station_drift', { x: 0, z: 0 });
  const player = makePlayer(state, { x: 30, z: 0 });
  const { rec, bus, helpers } = makeHarness(state);
  theBrightOnePlant.init({ state, bus, helpers });
  sweep(theBrightOnePlant, state, 1, 0.5);
  const tow = rec.spawns.find((s) => s.data && s.data.storyPropKind === 'funeral_tow');
  bus.emit('combat:fire', { ownerId: 'p1', origin: { ...state.entities.get(tow.id).pos } });
  state.simTime += 0.5;
  bus.emit('combat:fire', { ownerId: 'p1', origin: { ...state.entities.get(tow.id).pos } });
  assert.equal(eventsOf(rec, PLANTS_BRIGHT_ONE_EVENT, 'ranBright').length, 1);
  assert.equal(commsOf(rec, 'Remembered beside the stranger.').length, 1);
  const chalk = rec.spawns.find((s) => s.data && s.data.storyPropKind === 'bright_remembered');
  assert.ok(chalk, 'chalked: remembered beside them');
  theBrightOnePlant.destroy();
});

// ---- PL-167 the arch -------------------------------------------------------------------------

test('PL-167 the arch: wide on the exhale, narrow on the inhale', () => {
  const phase = breathPhase(1, ARCH_TUNING.sectorId);
  const exhaleT = phase + 5;                     // inside the wide half
  const state = makeState({ simTime: exhaleT - 1, world: { currentSectorId: ARCH_TUNING.sectorId } });
  fixtureEntity(state, 'poi_garden', 'anomaly', { x: 0, z: 0 }, { poiId: ARCH_TUNING.poiId });
  const player = makePlayer(state, { x: 48, z: -50 });
  const { rec, bus, helpers } = makeHarness(state);
  theArchPlant.init({ state, bus, helpers });
  assert.equal(exhaleOpen(exhaleT, phase), true);
  assert.equal(exhaleOpen(phase + 25, phase), false, 'inhale half');
  assert.equal(crossesSegment({ x: 48, z: -50 }, { x: 48, z: 50 }, { x: 0, z: 0 }, { x: 96, z: 0 }), true);

  sweep(theArchPlant, state, 2, 0.5);            // mouths materialize, wide gap
  player.pos = { x: 48, z: 50 };
  sweep(theArchPlant, state, 1, 0.5);
  assert.equal(eventsOf(rec, PLANTS_ARCH_EVENT, 'threadedWide').length, 1);
  assert.equal(commsOf(rec, 'Wide on the exhale. Clean.').length, 1);
  theArchPlant.destroy();

  // the inhale: the growth makes room the hard way
  const inhaleT = phase + 25;
  const state2 = makeState({ simTime: inhaleT - 1, world: { currentSectorId: ARCH_TUNING.sectorId } });
  fixtureEntity(state2, 'poi_garden', 'anomaly', { x: 0, z: 0 }, { poiId: ARCH_TUNING.poiId });
  const player2 = makePlayer(state2, { x: 22, z: -50 });
  const h2 = makeHarness(state2);
  theArchPlant.init({ state: state2, bus: h2.bus, helpers: h2.helpers });
  sweep(theArchPlant, state2, 2, 0.5);
  player2.pos = { x: 22, z: 50 };
  sweep(theArchPlant, state2, 1, 0.5);
  assert.equal(eventsOf(h2.rec, PLANTS_ARCH_EVENT, 'threadedNarrow').length, 1);
  assert.equal(commsOf(h2.rec, 'Narrow on the inhale.').length, 1);
  theArchPlant.destroy();
});

// ---- PL-168 Ruth's knock ---------------------------------------------------------------------

test('PL-168 Ruth\u2019s knock: bump first and something knocks back; skip it and the line is held', () => {
  const state = makeState({ world: { currentSectorId: RUTHS_TUNING.sectorId } });
  fixtureEntity(state, 'poi_garden', 'anomaly', { x: 0, z: 0 }, { poiId: RUTHS_TUNING.poiId });
  makePlayer(state, { x: 30, z: 0 });
  const wr1 = fixtureEntity(state, 'wr1', 'wreck', { x: 60, z: 0 }, { name: 'garden wreck' });
  const wr2 = fixtureEntity(state, 'wr2', 'wreck', { x: -60, z: 0 }, { name: 'garden wreck' });
  const { rec, bus, helpers } = makeHarness(state);
  ruthsKnockPlant.init({ state, bus, helpers });
  assert.equal(inGarden({ x: 30, z: 0 }, { x: 0, z: 0 }), true);
  assert.equal(lineVerdict(undefined, 10), 'heldBeat');
  assert.equal(lineVerdict(8, 10), 'cleanLine');

  // a soft brush is nothing; a real bump knocks back once
  bus.emit('physics:impact', { aId: 'p1', bId: 'wr1', impulseMag: 10 });
  assert.equal(eventsOf(rec, PLANTS_RUTHS_KNOCK_EVENT).length, 0);
  bus.emit('physics:impact', { aId: 'p1', bId: 'wr1', impulseMag: 200 });
  assert.equal(eventsOf(rec, PLANTS_RUTHS_KNOCK_EVENT, 'knocked').length, 1);
  assert.ok(wr1.data.plants168KnockedAt > 0);
  assert.ok(eventsOf(rec, 'audio:cue').some((e) => e.payload && e.payload.id === 'confirm'));

  // Line the knocked wreck: it comes away clean
  bus.emit('massline:throw', { aimTargetId: 'wr1' });
  assert.equal(eventsOf(rec, PLANTS_RUTHS_KNOCK_EVENT, 'cleanLine').length, 1);

  // skip the knock: the growth holds your line one beat too long
  bus.emit('massline:throw', { aimTargetId: 'wr2' });
  assert.equal(eventsOf(rec, PLANTS_RUTHS_KNOCK_EVENT, 'heldBeat').length, 1);
  assert.equal(wr2.data.plants168HeldOnce, true);
  bus.emit('massline:throw', { aimTargetId: 'wr2' });
  assert.equal(eventsOf(rec, PLANTS_RUTHS_KNOCK_EVENT, 'heldBeat').length, 1, 'held once, remembered');
  ruthsKnockPlant.destroy();
});

// ---- PL-169 the old trail --------------------------------------------------------------------

test('PL-169 the old trail: follow it through and the out-trail shows; plough beside it and both stay', () => {
  const state = makeState({ world: { currentSectorId: OLD_TRAIL_TUNING.sectorId } });
  fixtureEntity(state, 'poi_burn_lamp', 'derelict', { x: 0, z: 0 }, { poiId: OLD_TRAIL_TUNING.poiId });
  const player = makePlayer(state, { x: 500, z: 500 });
  const { rec, bus, helpers } = makeHarness(state);
  theOldTrailPlant.init({ state, bus, helpers });

  sweep(theOldTrailPlant, state, 1, 1);          // the trail materializes
  assert.equal(rec.spawns.filter((s) => s.data && s.data.storyPropKind === 'old_trail_marker').length, 5);
  assert.ok(rec.spawns.some((s) => s.data && s.data.storyPropKind === 'old_trail_lamp'), 'their lamp burns');
  assert.equal(inOrder(0, 0), true);

  // follow the markers in order
  const line = trailLine({ x: 0, z: 0 }, state.meta.seed, OLD_TRAIL_TUNING.sectorId);
  for (let i = 0; i < OLD_TRAIL_TUNING.markers; i++) {
    player.pos = { x: line.pts[i].x, z: line.pts[i].z };
    sweep(theOldTrailPlant, state, 1, 1);
  }
  assert.equal(eventsOf(rec, PLANTS_OLD_TRAIL_EVENT, 'followedThrough').length, 1);
  assert.ok(commsOf(rec, "Out-trail's there. Wind-filled.").length >= 1);
  assert.equal(rec.spawns.filter((s) => s.data && s.data.storyPropKind === 'old_trail_out').length, 3, 'the out-trail is there too');
  const lamp = rec.spawns.find((s) => s.data && s.data.storyPropKind === 'old_trail_lamp');
  assert.equal(lamp.data.lampsFlashing, true, 'the lamp finds the follower');

  // plough your own line beside it: both trails stay
  bus.emit('massline:throw', { pos: { x: line.pts[0].x + 30, z: line.pts[0].z } });
  assert.equal(rec.spawns.filter((s) => s.data && s.data.storyPropKind === 'old_trail_own_line').length, 1);
  assert.equal(eventsOf(rec, PLANTS_OLD_TRAIL_EVENT, 'bothTrails').length, 0);
  bus.emit('massline:throw', { pos: { x: line.pts[1].x + 30, z: line.pts[1].z } });
  assert.equal(rec.spawns.filter((s) => s.data && s.data.storyPropKind === 'old_trail_own_line').length, 2);
  assert.equal(eventsOf(rec, PLANTS_OLD_TRAIL_EVENT, 'bothTrails').length, 1);
  assert.ok(commsOf(rec, 'Both trails stay.').length >= 1);
  theOldTrailPlant.destroy();
});

// ---- PL-170 the window that doesn't ----------------------------------------------------------

test('PL-170 the window that doesn\u2019t: the count climbs, the dark one lights only under your lamps', () => {
  const sector = DARK_WINDOW_TUNING.sectorId;
  const state = makeState({ simTime: 300, world: { currentSectorId: sector } });
  fixtureEntity(state, 'poi_burn_lamp', 'derelict', { x: 0, z: 0 }, { poiId: DARK_WINDOW_TUNING.poiId });
  const player = makePlayer(state, { x: 800, z: 800 });   // starts far away: passes it by
  const { rec, bus, helpers } = makeHarness(state);
  theWindowThatDoesntPlant.init({ state, bus, helpers });

  sweep(theWindowThatDoesntPlant, state, 1, 1);
  assert.equal(rec.spawns.filter((s) => s.data && s.data.storyPropKind === 'scar_window').length, 7);
  assert.equal(reliefIndex(630), 1);
  const darkIdx = darkWindowIndex(state.meta.seed, sector);
  assert.ok(darkIdx >= 0 && darkIdx < 7);
  assert.equal(litOrder(7, darkIdx).length, 6, 'the dark one is skipped forever');

  // a relief run passes: Wick lights one more window
  state.simTime = 630;
  sweep(theWindowThatDoesntPlant, state, 1, 1);
  assert.equal(eventsOf(rec, PLANTS_DARK_WINDOW_EVENT, 'reliefLit').length, 1);
  const lit = rec.spawns.find((s) => s.data && s.data.swarmFloorPad && s.data.swarmFloorPad.label.endsWith('· LIT'));
  assert.ok(lit, 'a window lit');

  // look, lit by your own lamps
  const b = (hash32(state.meta.seed, sector, 'pl170-row') % 6283) / 1000;
  const off = -(7 - 1) * DARK_WINDOW_TUNING.spacingWu / 2 + darkIdx * DARK_WINDOW_TUNING.spacingWu;
  player.pos = { x: Math.cos(b) * off + 5, z: Math.sin(b) * off };
  sweep(theWindowThatDoesntPlant, state, 1, 1);
  assert.equal(eventsOf(rec, PLANTS_DARK_WINDOW_EVENT, 'litByYourLamps').length, 1);
  assert.ok(commsOf(rec, 'Lit by yours. Then dark.').length >= 1);
  const dark = rec.spawns.filter((s) => s.data && s.data.storyPropKind === 'scar_window')[darkIdx];
  assert.equal(dark.data.swarmFloorPad.label, 'YOUR LAMPS LIT IT');

  // then it doesn't: the window goes back after your lamps move on
  state.simTime += DARK_WINDOW_TUNING.lookLitS + 2;
  sweep(theWindowThatDoesntPlant, state, 1, 1);
  assert.equal(dark.data.swarmFloorPad.label, `WINDOW ${darkIdx + 1}`);
  assert.equal(dark.data.lampsFlashing, false);
  theWindowThatDoesntPlant.destroy();

  // pass it by: nothing lights, nothing speaks
  const state2 = makeState({ simTime: 630, world: { currentSectorId: sector } });
  fixtureEntity(state2, 'poi_burn_lamp', 'derelict', { x: 0, z: 0 }, { poiId: DARK_WINDOW_TUNING.poiId });
  makePlayer(state2, { x: 2000, z: 2000 });
  const h2 = makeHarness(state2);
  theWindowThatDoesntPlant.init({ state: state2, bus: h2.bus, helpers: h2.helpers });
  sweep(theWindowThatDoesntPlant, state2, 2, 1);
  assert.equal(moduleEvents(h2.rec).some((e) => e.event === PLANTS_DARK_WINDOW_EVENT && e.payload.kind === 'litByYourLamps'), false);
  theWindowThatDoesntPlant.destroy();
});

// ---- cleanup contracts -----------------------------------------------------------------------

test('family contract: destroy despawns owned bodies and detaches listeners', () => {
  const cases = [
    {
      name: 'dutchAfterYou', mod: dutchAfterYouPlant, sector: DUTCH_TUNING.sectorId,
      setup: (state, bus) => {
        fixtureStation(state, 'station_hyperion_cut', { x: -640, z: 480 });
        makePlayer(state, { x: -540, z: 480 });
        fixtureEntity(state, 'anc', 'payload', { x: -520, z: 480 }, {});
        bus.emit('massline:throw', { releaseId: 'rel-d', payloadId: 'anc' });
        return (bus2) => bus2.emit('massline:throw', { releaseId: 'rel-d2', payloadId: 'anc' });
      },
    },
    {
      name: 'pipsCounts', mod: pipsCountsPlant, sector: PIPS_TUNING.sectorId,
      setup: (state) => {
        fixtureStation(state, PIPS_TUNING.stationId, { x: 420, z: -1120 });
        makePlayer(state, { x: 450, z: -1120 });
        return () => {};
      },
    },
    {
      name: 'redMinute', mod: redMinutePlant, sector: RED_MINUTE_TUNING.sectorId,
      setup: (state) => {
        state.simTime = 500;
        fixtureEntity(state, 'poi_hulk', 'derelict', { x: 1000, z: 700 }, { poiId: RED_MINUTE_TUNING.poiId });
        makePlayer(state, { x: 1060, z: 700 });
        return () => {};
      },
    },
    {
      name: 'sennaReads', mod: sennaReadsPlant, sector: SENNA_TUNING.sectorId,
      setup: (state) => {
        state.simTime = 480;
        fixtureStation(state, SENNA_TUNING.stationId, { x: -480, z: 620 });
        makePlayer(state, { x: -480, z: 700 });
        return () => {};
      },
    },
    {
      name: 'twoRopes', mod: twoRopesPlant, sector: TWO_ROPES_TUNING.sectorId,
      setup: (state) => {
        fixtureEntity(state, 'poi_funnel', 'derelict', { x: 1000, z: 800 }, { poiId: TWO_ROPES_TUNING.poiId });
        makePlayer(state, { x: 1000, z: 800 });
        return () => {};
      },
    },
    {
      name: 'threeCount', mod: threeCountPlant, sector: THREE_COUNT_TUNING.sectorId,
      setup: (state) => {
        state.simTime = 0;
        fixtureEntity(state, 'poi_stone', 'beacon', { x: 0, z: 0 }, { poiId: THREE_COUNT_TUNING.poiId });
        makePlayer(state, { x: 30, z: 0 });
        return () => {};
      },
    },
    {
      name: 'twice', mod: twicePlant, sector: TWICE_TUNING.sectorId,
      setup: (state) => {
        state.simTime = 5;
        fixtureEntity(state, 'poi_lantern', 'beacon', { x: 0, z: 0 }, { poiId: TWICE_TUNING.poiId });
        makePlayer(state, { x: 40, z: 0 });
        return () => {};
      },
    },
    {
      name: 'ratRun', mod: ratRunPlant, sector: RAT_RUN_TUNING.sectorId,
      setup: (state) => {
        fixtureStation(state, RAT_RUN_TUNING.stationId, { x: 0, z: 0 });
        makePlayer(state, { x: 0, z: 0 });
        return () => {};
      },
    },
    {
      name: 'theArch', mod: theArchPlant, sector: ARCH_TUNING.sectorId,
      setup: (state) => {
        const phase = breathPhase(state.meta.seed, ARCH_TUNING.sectorId);
        state.simTime = Math.max(1, phase + 5 - 1);
        fixtureEntity(state, 'poi_garden', 'anomaly', { x: 0, z: 0 }, { poiId: ARCH_TUNING.poiId });
        makePlayer(state, { x: 48, z: -50 });
        return () => {};
      },
    },
    {
      name: 'theOldTrail', mod: theOldTrailPlant, sector: OLD_TRAIL_TUNING.sectorId,
      setup: (state) => {
        fixtureEntity(state, 'poi_burn_lamp', 'derelict', { x: 0, z: 0 }, { poiId: OLD_TRAIL_TUNING.poiId });
        makePlayer(state, { x: 500, z: 500 });
        return () => {};
      },
    },
    {
      name: 'theWindowThatDoesnt', mod: theWindowThatDoesntPlant, sector: DARK_WINDOW_TUNING.sectorId,
      setup: (state) => {
        fixtureEntity(state, 'poi_burn_lamp', 'derelict', { x: 0, z: 0 }, { poiId: DARK_WINDOW_TUNING.poiId });
        makePlayer(state, { x: 800, z: 800 });
        return () => {};
      },
    },
  ];
  for (const c of cases) {
    const state = makeState({ world: { currentSectorId: c.sector } });
    const player = state.entities.get('p1');
    const { rec, bus, helpers } = makeHarness(state);
    c.mod.init({ state, bus, helpers });
    const trigger = c.setup(state, bus);
    // give the module a beat to materialize its props
    c.mod.update(1);
    assert.ok(rec.spawns.length > 0, `${c.name}: scenario spawned props`);
    const spawnedIds = rec.spawns.map((s) => s.id);
    c.mod.destroy();
    const uncovered = spawnedIds.filter((id) => !rec.removes.includes(id));
    assert.deepEqual(uncovered, [], `${c.name}: destroy despawns every owned body`);
    const eventsBefore = moduleEvents(rec).length;
    const spawnsBefore = rec.spawns.length;
    if (trigger) trigger(bus);
    c.mod.update(1);
    assert.equal(rec.spawns.length, spawnsBefore, `${c.name}: no spawns after destroy`);
    assert.equal(moduleEvents(rec).length, eventsBefore, `${c.name}: no events after destroy`);
  }
});

test('family contract: listener-only modules are silent after destroy', () => {
  // magpie (update-driven, state cleared by destroy)
  {
    const state = makeState({
      world: { currentSectorId: MAGPIE_TUNING.sectorId },
      player: { cargo: { items: [{ commodityId: 'cmdty_ore_iron', qty: 2 }] } },
    });
    fixtureStation(state, MAGPIE_TUNING.stationId, { x: -640, z: 520 });
    makePlayer(state, { x: -640, z: 100 }, { x: 30, z: 0 });
    const { bus, helpers, rec } = makeHarness(state);
    magpieReadsPlant.init({ state, bus, helpers });
    magpieReadsPlant.destroy();
    magpieReadsPlant.update(1);
    assert.equal(commsOf(rec).length, 0, 'magpie silent after destroy');
  }
  // glass (listener)
  {
    const state = makeState({ world: { currentSectorId: GLASS_TUNING.sectorId } });
    fixtureEntity(state, 'poi_fissure', 'anomaly', { x: 0, z: 0 }, { poiId: GLASS_TUNING.poiId });
    makePlayer(state, { x: 30, z: 0 });
    const { bus, helpers, rec } = makeHarness(state);
    glassPaysPlant.init({ state, bus, helpers });
    glassPaysPlant.destroy();
    bus.emit('pickup:collected', { id: 'p1', commodityId: 'cmdty_crystal_lumin', pos: { x: 30, z: 0 } });
    assert.equal(moduleEvents(rec).length, 0, 'glass silent after destroy');
  }
  // ruth (listener)
  {
    const state = makeState({ world: { currentSectorId: RUTHS_TUNING.sectorId } });
    fixtureEntity(state, 'poi_garden', 'anomaly', { x: 0, z: 0 }, { poiId: RUTHS_TUNING.poiId });
    makePlayer(state, { x: 30, z: 0 });
    fixtureEntity(state, 'wr1', 'wreck', { x: 60, z: 0 }, {});
    const { bus, helpers, rec } = makeHarness(state);
    ruthsKnockPlant.init({ state, bus, helpers });
    ruthsKnockPlant.destroy();
    bus.emit('physics:impact', { aId: 'p1', bId: 'wr1', impulseMag: 200 });
    assert.equal(moduleEvents(rec).length, 0, 'ruth silent after destroy');
  }
  // hanne (listener)
  {
    const state = makeState({ world: { currentSectorId: GOOD_PATCH_TUNING.sectorId } });
    fixtureStation(state, GOOD_PATCH_TUNING.stationId, { x: 480, z: -980 });
    makePlayer(state, { x: 480, z: -900 }, { x: 0, z: 0 }, { hull: 50, hullMax: 100 });
    const { bus, helpers, rec } = makeHarness(state);
    goodPatchPlant.init({ state, bus, helpers });
    goodPatchPlant.destroy();
    bus.emit('dock:range', { stationId: GOOD_PATCH_TUNING.stationId, inRange: true });
    assert.equal(moduleEvents(rec).length, 0, 'hanne silent after destroy');
  }
});

test('family contract: sector:exit clears session props (sampled)', () => {
  // the shelf ledger resets, trail progress resets — sample via pips props and trail props
  {
    const state = makeState({ world: { currentSectorId: OLD_TRAIL_TUNING.sectorId } });
    fixtureEntity(state, 'poi_burn_lamp', 'derelict', { x: 0, z: 0 }, { poiId: OLD_TRAIL_TUNING.poiId });
    const player = makePlayer(state, { x: 500, z: 500 });
    const { bus, helpers, rec } = makeHarness(state);
    theOldTrailPlant.init({ state, bus, helpers });
    theOldTrailPlant.update(1);
    bus.emit('sector:exit', { sectorId: OLD_TRAIL_TUNING.sectorId });
    assert.ok(rec.removes.length >= 6, 'trail props despawn on sector exit');
    // progress reset: re-entering and touching marker 0 alone does not complete the trail
    const line = trailLine({ x: 0, z: 0 }, state.meta.seed, OLD_TRAIL_TUNING.sectorId);
    player.pos = { x: line.pts[0].x, z: line.pts[0].z };
    theOldTrailPlant.update(1);
    assert.equal(moduleEvents(rec).filter((e) => e.payload.kind === 'followedThrough').length, 0);
    theOldTrailPlant.destroy();
  }
});

// ---- determinism smoke -----------------------------------------------------------------------

function projection(rec) {
  return JSON.stringify({
    events: rec.events.map((e) => [e.event, e.payload]),
    voice: rec.voice,
    spawnSpecs: rec.spawns.map((s) => ({
      type: s.type, label: s.data && s.data.scanLabel,
      pad: s.data && s.data.swarmFloorPad ? s.data.swarmFloorPad.label : null,
    })),
  });
}

test('determinism: identical double runs (dutch, rat run, dark window)', () => {
  const runs = [];
  for (let run = 0; run < 2; run++) {
    idSeq = 100;
    // dutch
    const s1 = makeState({ world: { currentSectorId: DUTCH_TUNING.sectorId } });
    setupDutch(s1);
    const h1 = makeHarness(s1);
    dutchAfterYouPlant.init({ state: s1, bus: h1.bus, helpers: h1.helpers });
    h1.bus.emit('massline:throw', { releaseId: 'rel1', payloadId: 'anc' });
    s1.entities.get('p1').pos = { x: -520 + DUTCH_TUNING.letGoRangeWu + 100, z: 480 };
    sweep(dutchAfterYouPlant, s1, 2, 0.5);
    dutchAfterYouPlant.destroy();
    runs.push(['dutch', projection(h1.rec)]);

    // rat run (cut off)
    const s2 = makeState({ world: { currentSectorId: RAT_RUN_TUNING.sectorId } });
    fixtureStation(s2, RAT_RUN_TUNING.stationId, { x: 0, z: 0 });
    const p2 = makePlayer(s2, { x: 0, z: 0 });
    const h2 = makeHarness(s2);
    ratRunPlant.init({ state: s2, bus: h2.bus, helpers: h2.helpers });
    sweep(ratRunPlant, s2, 1, 0.5);
    const skiff = h2.rec.spawns.find((s) => s.data && s.data.storyPropKind === 'rib_street_skiff');
    const mover = s2.entities.get(skiff.id);
    const vl = Math.hypot(mover.vel.x, mover.vel.z) || 1;
    p2.pos = { x: mover.pos.x + (mover.vel.x / vl) * 60, z: mover.pos.z + (mover.vel.z / vl) * 60 };
    sweep(ratRunPlant, s2, 1, 0.5);
    ratRunPlant.destroy();
    runs.push(['ratrun', projection(h2.rec)]);

    // dark window (relief + look + revert)
    const sector = DARK_WINDOW_TUNING.sectorId;
    const s3 = makeState({ simTime: 300, world: { currentSectorId: sector } });
    fixtureEntity(s3, 'poi_burn_lamp', 'derelict', { x: 0, z: 0 }, { poiId: DARK_WINDOW_TUNING.poiId });
    const p3 = makePlayer(s3, { x: 2000, z: 2000 });
    const h3 = makeHarness(s3);
    theWindowThatDoesntPlant.init({ state: s3, bus: h3.bus, helpers: h3.helpers });
    sweep(theWindowThatDoesntPlant, s3, 1, 1);
    s3.simTime = 630;
    sweep(theWindowThatDoesntPlant, s3, 1, 1);
    const darkIdx = darkWindowIndex(s3.meta.seed, sector);
    const b = (hash32(s3.meta.seed, sector, 'pl170-row') % 6283) / 1000;
    const off = -(7 - 1) * DARK_WINDOW_TUNING.spacingWu / 2 + darkIdx * DARK_WINDOW_TUNING.spacingWu;
    p3.pos = { x: Math.cos(b) * off + 5, z: Math.sin(b) * off };
    sweep(theWindowThatDoesntPlant, s3, 1, 1);
    s3.simTime += DARK_WINDOW_TUNING.lookLitS + 2;
    sweep(theWindowThatDoesntPlant, s3, 1, 1);
    theWindowThatDoesntPlant.destroy();
    runs.push(['window', projection(h3.rec)]);
  }
  assert.equal(runs[0][1], runs[3][1], 'dutch: identical double run');
  assert.equal(runs[1][1], runs[4][1], 'rat run: identical double run');
  assert.equal(runs[2][1], runs[5][1], 'dark window: identical double run');
});
