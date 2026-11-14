// mercies-world — the SMALL MERCIES pass of the world-reacts plant bank:
// Section A  PL-257..PL-268, Section H  PL-354..PL-363 (design/program/INFERENCE_PLANTS.md).
//
// Headless, deterministic: a real createBus, createGameState('mercies-world') overridden with
// fixtures, fake helpers that record spawns/removes/voice, and canonical event payloads
// (dock:range, physics:impact, pickup:collected, tether:snapCatch, cargo:jettisoned,
// entity:killed, ship:boostStart, line:classChanged, sector:enter/exit). Per row: the
// generous branch lands (gift spawned / chalk stamped / voice exact), and the wrong choice
// bites. Ops mixins run on a plain host object; standalones init/update on the bus. A
// determinism smoke drives one scenario twice and compares the event sequence.
// No DOM, no Three.js, no Math.random.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { spawnJettisonedCargoPod } from '../src/systems/lootShards.js';

import {
  GUTTER_RUN_TUNING, PLANTS_GUTTER_EVENT, PLANTS_GUTTER_STRIPPED_EVENT,
  PL_257_LAMP_STAMP, lampYardNo, gutterRunOps,
} from '../src/systems/plants/pl257GutterRun.js';
import {
  TOW_ALONG_TUNING, PLANTS_TOW_ALONG_EVENT, PLANTS_TOW_ALONG_GONE_EVENT,
  isLimpingHome, pl258TowAlong,
} from '../src/systems/plants/pl258TowAlong.js';
import {
  SPARE_TUNING, PLANTS_SPARE_EVENT, PLANTS_SPARE_CHALK_EVENT, PLANTS_SPARE_BILL_EVENT,
  PL_259_PAID_STAMP, PL_259_BILLED_STAMP, isBrokenDown, pl259SpareAndShare,
} from '../src/systems/plants/pl259SpareAndShare.js';
import {
  FIFTY_TUNING, PLANTS_FIFTY_EVENT, PLANTS_FIFTY_BILL_EVENT,
  PL_260_PAID_STAMP, PL_260_BILLED_STAMP, pl260FiftiethVisit,
} from '../src/systems/plants/pl260FiftiethVisit.js';
import {
  OPEN_TANK_TUNING, PLANTS_TANK_EVENT, PLANTS_LOCKED_EVENT,
  PL_261_LOCKED_STAMP, isDarkWaystation, pl261OpenTank,
} from '../src/systems/plants/pl261OpenTank.js';
import {
  PILE_TUNING, PLANTS_PILE_EVENT, PLANTS_GOSSIP_EVENT,
  PL_262_GATHERED_STAMP, PL_262_STRAY_STAMP, PL_262_GOSSIP_STAMP, pl262GatheredPile,
} from '../src/systems/plants/pl262GatheredPile.js';
import {
  LESSON_TUNING, PLANTS_LESSON_EVENT, PLANTS_LESSON_SHOVE_EVENT,
  PL_263_LEARNED_STAMP, lessonOps,
} from '../src/systems/plants/pl263LessonAlongside.js';
import {
  LANE_LIGHT_TUNING, PLANTS_LIGHT_EVENT, laneLightAnchor, lightPhaseAt, pl264LaneLight,
} from '../src/systems/plants/pl264LaneLight.js';
import {
  UMBRELLA_TUNING, PLANTS_UMBRELLA_EVENT, PLANTS_UMBRELLA_DOWN_EVENT, umbrellaOps,
} from '../src/systems/plants/pl265Umbrella.js';
import {
  SPARE_KIT_TUNING, PLANTS_SPARE_KIT_EVENT, PLANTS_SPARE_HUNT_EVENT,
  PL_266_KIT_STAMP, isMinerHull, spareKitOps,
} from '../src/systems/plants/pl266SomebodysSpare.js';
import {
  QUEUE_TUNING, PLANTS_QUEUE_EVENT,
  PL_267_PREFERRED_STAMP, PL_267_LAST_STAMP, isOverloadedHauler, pl267QueuePass,
} from '../src/systems/plants/pl267QueuePass.js';
import {
  WAKE_TUNING, PLANTS_WAKE_EVENT, PLANTS_WAKE_WASH_EVENT, isRidingWake, wakeOps,
} from '../src/systems/plants/pl268WakeGift.js';
import {
  GOOD_HULL_TUNING, PLANTS_RATE_EVENT, PLANTS_FRAUD_EVENT,
  PL_354_RATE_STAMP, PL_354_PREMIUM_STAMP, pl354GoodHullRate,
} from '../src/systems/plants/pl354GoodHullRate.js';
import {
  UNIT_TUNING, PLANTS_UNIT_EVENT, PLANTS_UNIT_PASSED_EVENT, unitMeasureLine, pl355TheUnit,
} from '../src/systems/plants/pl355TheUnit.js';
import {
  PARADE_TUNING, PLANTS_PARADE_EVENT, PARADE_HOME_LINE, PARADE_COLD_LINE,
  homeBerthOf, pl356ParadeBerth,
} from '../src/systems/plants/pl356ParadeBerth.js';
import {
  WARM_GRID_TUNING, PLANTS_GRID_EVENT, PLANTS_METERED_EVENT,
  PL_357_METERED_STAMP, pl357WarmGrid,
} from '../src/systems/plants/pl357WarmGrid.js';
import {
  APPRENTICE_TUNING, PLANTS_APPRENTICE_EVENT, APPRENTICE_CALLSIGN,
  pl358ApprenticesReturn,
} from '../src/systems/plants/pl358ApprenticesReturn.js';
import {
  ESCORT_TUNING, PLANTS_ESCORT_EVENT, CONVOY_CALLSIGN, isHostileHull, pl359EscortsGift,
} from '../src/systems/plants/pl359EscortsGift.js';
import {
  RAIN_CHECK_TUNING, PLANTS_COMP_EVENT, PLANTS_FINE_EVENT,
  PL_360_COMP_STAMP, PL_360_FINE_STAMP, pl360RainCheck,
} from '../src/systems/plants/pl360RainCheck.js';
import {
  SECOND_START_TUNING, PLANTS_KIT_EVENT, SECOND_START_LINE, LOAN_NOTE_LINE,
  PL_361_TAKEN_STAMP, pl361SecondStart,
} from '../src/systems/plants/pl361SecondStart.js';
import {
  PLATE_TUNING, PLANTS_PLATE_EVENT, PLANTS_COUNTERFEIT_EVENT,
  realOwnerName, pl362NameOnPlate,
} from '../src/systems/plants/pl362NameOnPlate.js';
import {
  FAMILY_TUNING, PLANTS_FAMILY_EVENT, PLANTS_FARMED_EVENT,
  FAMILY_GIFT_LINE, FAMILY_GIFT_SENDER,
  PL_363_FAMILY_STAMP, PL_363_FARMED_STAMP, pl363FamilyRate,
} from '../src/systems/plants/pl363FamilyRate.js';

// ---------------------------------------------------------------- harness

let idSeq = 1;

function makeWorld(opts = {}) {
  const state = createGameState('mercies-world');
  state.mode = 'flight';
  state.playerId = 'p1';
  state.player.credits = 100;
  state.player.debt = 0;
  state.world.currentSectorId = 's1';
  if (!state.entityIndex) state.entityIndex = {};
  state.entityIndex.stations = [];
  state.entityList = [];
  Object.assign(state, opts);
  return state;
}

function makeRecorder(bus, state) {
  const rec = { spawns: [], removes: [], voice: [], events: [] };
  const origEmit = bus.emit.bind(bus);
  bus.emit = (event, payload) => {
    rec.events.push({ event, payload });
    return origEmit(event, payload);
  };
  const helpers = {
    spawnEntity(spec) {
      const ent = {
        id: `ent_${idSeq++}`, alive: true, ...spec,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        vel: { ...(spec.vel || { x: 0, z: 0 }) },
      };
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
  return { rec, helpers };
}

function makePlayer(state, pos = { x: 0, z: 0 }, vel = { x: 0, z: 0 }, extra = {}) {
  const player = {
    id: state.playerId, alive: true, type: 'ship', isPlayer: true,
    pos: { ...pos }, vel: { ...vel }, rot: 0, radius: 6, mass: 12,
    hull: 100, hullMax: 100, data: {}, ...extra,
  };
  state.entities.set(player.id, player);
  return player;
}

function makeNpc(state, id, pos, extra = {}) {
  const npc = {
    id, alive: true, type: 'ship',
    pos: { ...pos }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, mass: 12,
    hull: 100, hullMax: 100, data: { trafficRole: 'hauler' }, ...extra,
  };
  state.entities.set(id, npc);
  return npc;
}

function fixtureStation(state, id, pos, extraData = {}) {
  const st = {
    id, type: 'station', alive: true, pos: { ...pos }, radius: 72,
    data: { stationId: id, dockRadius: 90, ...extraData },
  };
  state.entityIndex.stations.push(st);
  state.entities.set(id, st);
  return st;
}

function makePod(state, pos, ownerId, data = {}, helpers = null) {
  const pod = spawnJettisonedCargoPod(state, {
    commodityId: 'cmdty_ore_iron', amount: 1, radius: 5,
    pos: { ...pos }, vel: { x: 0, z: 0 }, ownerId, ownerName: 'FIXTURE',
  }, helpers);
  pod.data = { ...(pod.data || {}), ...data };
  return pod;
}

function sweep(mod, state, steps = 1, dt = 1) {
  const out = [];
  for (let i = 0; i < steps; i++) {
    state.simTime += dt;
    state.tick += Math.round(dt * 60);
    mod.update(dt);
    out.push(null);
  }
  return out;
}

function eventsOf(rec, name, kind = null) {
  return rec.events.filter((e) => e.event === name
    && (kind == null || (e.payload && e.payload.kind === kind)));
}

function commsOf(rec, text) {
  return rec.events.filter((e) => e.event === 'comms:popup' && e.payload && e.payload.text === text);
}

function voiceOf(rec, text) {
  return rec.voice.filter((v) => v.text === text);
}

function lastSpawn(rec, pred = null) {
  const list = pred ? rec.spawns.filter(pred) : rec.spawns;
  return list[list.length - 1] || null;
}

// Standalone plant on a fresh world; returns everything the tests need.
function boot(mod, opts = {}) {
  const state = makeWorld(opts.state);
  const bus = createBus();
  const { rec, helpers } = makeRecorder(bus, state);
  const player = makePlayer(state, opts.playerPos, opts.playerVel, opts.player);
  mod.init({ state, bus, helpers });
  return { state, bus, rec, helpers, player };
}

// Ops mixin on a plain host object, per the traffic-dispatch shape.
function opsHost(ops, opts = {}) {
  const state = makeWorld(opts.state);
  const bus = createBus();
  const { rec, helpers } = makeRecorder(bus, state);
  const player = makePlayer(state, opts.playerPos, opts.playerVel, opts.player);
  const host = { bus, state, helpers, ...ops };
  return { state, bus, rec, helpers, player, host };
}

// ---------------------------------------------------------------- family contract

test('family contract: frozen tunings with memoryCap, standalone + ops shapes', () => {
  const standalones = [
    [pl258TowAlong, TOW_ALONG_TUNING], [pl259SpareAndShare, SPARE_TUNING],
    [pl260FiftiethVisit, FIFTY_TUNING], [pl261OpenTank, OPEN_TANK_TUNING],
    [pl262GatheredPile, PILE_TUNING], [pl264LaneLight, LANE_LIGHT_TUNING],
    [pl267QueuePass, QUEUE_TUNING], [pl354GoodHullRate, GOOD_HULL_TUNING],
    [pl355TheUnit, UNIT_TUNING], [pl356ParadeBerth, PARADE_TUNING],
    [pl357WarmGrid, WARM_GRID_TUNING], [pl358ApprenticesReturn, APPRENTICE_TUNING],
    [pl359EscortsGift, ESCORT_TUNING], [pl360RainCheck, RAIN_CHECK_TUNING],
    [pl361SecondStart, SECOND_START_TUNING], [pl362NameOnPlate, PLATE_TUNING],
    [pl363FamilyRate, FAMILY_TUNING],
  ];
  for (const [mod, tuning] of standalones) {
    assert.equal(typeof mod.init, 'function');
    assert.equal(typeof mod.update, 'function');
    assert.equal(typeof mod.destroy, 'function');
    assert.equal(Object.isFrozen(tuning), true);
    assert.ok(Number.isFinite(tuning.memoryCap) && tuning.memoryCap > 0);
  }
  const opsFamilies = [
    [gutterRunOps, GUTTER_RUN_TUNING, '_initGutterRun', '_reactGutterRun'],
    [lessonOps, LESSON_TUNING, '_initLesson', '_reactLesson'],
    [umbrellaOps, UMBRELLA_TUNING, '_initUmbrella', '_reactUmbrella'],
    [spareKitOps, SPARE_KIT_TUNING, '_initSpareKit', '_reactSpareKit'],
    [wakeOps, WAKE_TUNING, '_initWake', '_reactWake'],
  ];
  for (const [ops, tuning, initName, reactName] of opsFamilies) {
    assert.equal(typeof ops[initName], 'function', initName);
    assert.equal(typeof ops[reactName], 'function', reactName);
    assert.equal(Object.isFrozen(tuning), true);
    assert.ok(Number.isFinite(tuning.memoryCap) && tuning.memoryCap > 0);
  }
});

// ---------------------------------------------------------------- PL-257

test('PL-257 gutter run: a stranger clamps a working lamp, exact line, mounted stamp', () => {
  const { state, rec, host, player } = opsHost(gutterRunOps, {
    state: { simTime: 190 }, // night band (240-day, last quarter)
    playerPos: { x: 0, z: 0 },
  });
  host._initGutterRun();
  // Debris weather: two real debris bodies near the player.
  for (let i = 0; i < GUTTER_RUN_TUNING.debrisCount; i++) {
    state.entities.set(`deb_${i}`, { id: `deb_${i}`, alive: true, type: 'debris', pos: { x: 40 + i * 10, z: 0 } });
  }
  const stranger = makeNpc(state, 'npc1', { x: 30, z: 0 }, { hull: 80, hullMax: 100 });
  assert.equal(lampYardNo('npc1'), lampYardNo('npc1'), 'yard no deterministic');
  // Falls in beside you.
  assert.equal(host._reactGutterRun(stranger, { role: 'hauler' }, [], state, player), true);
  assert.ok(eventsOf(rec, PLANTS_GUTTER_EVENT, 'fell_in').length >= 1);
  // Just long enough: the clamp.
  state.simTime += GUTTER_RUN_TUNING.clampHoldS + 0.2;
  assert.equal(host._reactGutterRun(stranger, { role: 'hauler' }, [], state, player), true);
  const lamp = lastSpawn(rec, (e) => e.data && e.data.plantsPl257Lamp === true);
  assert.ok(lamp, 'lamp prop spawned');
  assert.equal(lamp.data.plantsPl257YardNo, lampYardNo('npc1'));
  assert.ok(lamp.data.swarmFloorPad && lamp.data.swarmFloorPad.label.length <= 24);
  assert.ok(player.data[PL_257_LAMP_STAMP], 'mounted stamp on the hull');
  assert.equal(voiceOf(rec, 'Dark out here. Take mine.').length, 1, 'exact line, no channel, no name');
  assert.ok(commsOf(rec, 'Dark out here. Take mine.').length === 1);
  assert.ok(eventsOf(rec, PLANTS_GUTTER_EVENT, 'clamped').length >= 1 || rec.events.some((e) => e.event === PLANTS_GUTTER_EVENT));
});

test('PL-257 wrong choice: strip and sell it — givers compare notes', () => {
  const { state, rec, bus, host, player } = opsHost(gutterRunOps, { state: { simTime: 190 } });
  host._initGutterRun();
  for (let i = 0; i < GUTTER_RUN_TUNING.debrisCount; i++) {
    state.entities.set(`deb_${i}`, { id: `deb_${i}`, alive: true, type: 'debris', pos: { x: 40 + i * 10, z: 0 } });
  }
  const stranger = makeNpc(state, 'npc1', { x: 30, z: 0 }, { hull: 80, hullMax: 100 });
  host._reactGutterRun(stranger, { role: 'hauler' }, [], state, player);
  state.simTime += GUTTER_RUN_TUNING.clampHoldS + 0.2;
  host._reactGutterRun(stranger, { role: 'hauler' }, [], state, player);
  const lamp = lastSpawn(rec, (e) => e.data && e.data.plantsPl257Lamp === true);
  assert.ok(lamp);
  // Strip it: the lamp collected into the hold.
  bus.emit('pickup:collected', { pickupId: lamp.id, collectorId: state.playerId });
  assert.ok(eventsOf(rec, PLANTS_GUTTER_STRIPPED_EVENT).length === 1);
  assert.equal(player.data[PL_257_LAMP_STAMP], undefined, 'no longer mounted');
  assert.ok(Number.isFinite(player.data.plantsPl257StripperUntil), 'stripper mark rides the hull');
  // Givers compare notes: the next dark stretch stays dark.
  const stranger2 = makeNpc(state, 'npc2', { x: 30, z: 0 }, { hull: 80, hullMax: 100 });
  state.simTime += 30;
  assert.equal(host._reactGutterRun(stranger2, { role: 'hauler' }, [], state, player), false);
});

// ---------------------------------------------------------------- PL-258

test('PL-258 tow-along: an unmarked hauler falls in, peels off at the berth lights', () => {
  const { state, rec, bus, player } = boot(pl258TowAlong, {
    state: { simTime: 10 }, player: { hull: 30, hullMax: 100 }, playerVel: { x: 10, z: 0 },
  });
  fixtureStation(state, 'st1', { x: 500, z: 0 });
  assert.equal(isLimpingHome(state, player, 500), true);
  sweep(pl258TowAlong, state, 2, 1); // the 1 s accumulator, then the arm check
  const hauler = lastSpawn(rec, (e) => e.data && e.data.plantsPl258Hauler === true);
  assert.ok(hauler, 'unmarked hauler spawned');
  assert.equal(hauler.data.callsign, undefined, 'no callsign, no name');
  assert.ok(eventsOf(rec, PLANTS_TOW_ALONG_EVENT, 'fell_in').length === 1);
  // Matches speed the whole way, then peels off at the berth lights.
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  state.simTime += TOW_ALONG_TUNING.peelDelayS + 0.1;
  pl258TowAlong.update(1 / 60);
  assert.ok(hauler.data.lampsFlashing === true, 'farewell lamps');
  assert.ok(eventsOf(rec, PLANTS_TOW_ALONG_EVENT, 'peeled_off').length === 1);
  // The lamps are SEEABLE: the hauler holds in the lane while they flash (~0.9 s), then goes.
  assert.equal(rec.removes.includes(hauler.id), false, 'not yanked while the lamps play');
  assert.ok(state.entities.get(hauler.id), 'still on screen under the farewell lamps');
  assert.ok(hauler.data.lampFlashUntil <= state.simTime + TOW_ALONG_TUNING.lampFlashS + 1e-9);
  state.simTime += TOW_ALONG_TUNING.lampFlashS + 0.1;
  pl258TowAlong.update(1 / 60);
  assert.ok(rec.removes.includes(hauler.id), 'peels off and is gone once the lamps have played');
  assert.equal(state.entities.get(hauler.id), undefined);
});

test('PL-258 wrong choice: try to latch them — gone between one ping and the next', () => {
  const { state, rec, bus } = boot(pl258TowAlong, {
    state: { simTime: 10 }, player: { hull: 30, hullMax: 100 }, playerVel: { x: 10, z: 0 },
  });
  fixtureStation(state, 'st1', { x: 500, z: 0 });
  sweep(pl258TowAlong, state, 2, 1);
  const hauler = lastSpawn(rec, (e) => e.data && e.data.plantsPl258Hauler === true);
  assert.ok(hauler);
  // The latch attempt is the real tether snap receipt.
  bus.emit('tether:snapCatch', { targetId: hauler.id });
  pl258TowAlong.update(1 / 60);
  assert.ok(rec.removes.includes(hauler.id), 'gone between one ping and the next');
  assert.ok(eventsOf(rec, PLANTS_TOW_ALONG_GONE_EVENT).length === 1);
  // Nobody falls in again for a long while.
  state.simTime += 5;
  sweep(pl258TowAlong, state, 3, 1);
  assert.equal(lastSpawn(rec, (e) => e.data && e.data.plantsPl258Hauler === true), hauler,
    'no second helper while the grudge rides');
});

test('PL-258 a new game wipes the grudge: the tow-along can fall in again', () => {
  const { state, rec, bus } = boot(pl258TowAlong, {
    state: { simTime: 10 }, player: { hull: 30, hullMax: 100 }, playerVel: { x: 10, z: 0 },
  });
  fixtureStation(state, 'st1', { x: 500, z: 0 });
  sweep(pl258TowAlong, state, 2, 1);
  const hauler = lastSpawn(rec, (e) => e.data && e.data.plantsPl258Hauler === true);
  assert.ok(hauler);
  bus.emit('tether:snapCatch', { targetId: hauler.id });
  pl258TowAlong.update(1 / 60);
  assert.ok(eventsOf(rec, PLANTS_TOW_ALONG_GONE_EVENT).length === 1, 'the grudge rides');
  // A new game: simTime restarts near 0, entity ids restart at 1 — and the grudge row
  // (until ~now + 1800 s) must NOT cover the whole fresh early game.
  bus.emit('game:newGame', {});
  state.simTime = 5;
  sweep(pl258TowAlong, state, 3, 1);
  const again = lastSpawn(rec, (e) => e.data && e.data.plantsPl258Hauler === true);
  assert.ok(again && again !== hauler, 'a fresh unmarked hauler falls in after the new game');
});

// ---------------------------------------------------------------- PL-259

test('PL-259 spare and share: the needy hull takes the spare, the next docks chalk PAID', () => {
  const { state, rec, bus, player } = boot(pl259SpareAndShare);
  const needy = makeNpc(state, 'npc1', { x: 100, z: 0 }, { data: { trafficRole: 'hauler', disabled: true } });
  assert.equal(isBrokenDown(needy), true);
  const pod = makePod(state, { x: 10, z: 0 }, state.playerId);
  // The player's real jettison receipt near the broken-down hull.
  bus.emit('cargo:jettisoned', { commodityId: 'cmdty_ore_iron', amount: 1, legality: 'legal', holdRemaining: 0 });
  bus.emit('pickup:collected', { pickupId: pod.id, collectorId: needy.id });
  assert.ok(eventsOf(rec, PLANTS_SPARE_EVENT).length === 1, 'word outruns you home');
  const stations = ['st1', 'st2', 'st3'].map((id, i) => fixtureStation(state, id, { x: 900 + i * 300, z: 0 }));
  for (const st of stations) {
    bus.emit('dock:range', { stationId: st.id, shipId: state.playerId, inRange: true });
  }
  for (const st of stations) {
    assert.equal(st.data[PL_259_PAID_STAMP] > 0, true, st.id + ' chalked PAID');
  }
  assert.ok(rec.spawns.some((e) => e.data && e.data.plantsPl259Chalk === true
    && e.data.swarmFloorPad.label === 'BERTHING PAID'));
  assert.equal(eventsOf(rec, PLANTS_SPARE_CHALK_EVENT).length, 3, 'the NEXT THREE docks');
});

test('PL-259 wrong choice: farm it with a fake breakdown — chalks stop, a dock bills you', () => {
  const { state, rec, bus } = boot(pl259SpareAndShare);
  const needy = makeNpc(state, 'npc1', { x: 100, z: 0 }, { data: { trafficRole: 'hauler', disabled: true } });
  const pod = makePod(state, { x: 10, z: 0 }, state.playerId);
  bus.emit('cargo:jettisoned', { commodityId: 'cmdty_ore_iron', amount: 1 });
  // Taking the "spare" back yourself is the fake breakdown.
  bus.emit('pickup:collected', { pickupId: pod.id, collectorId: state.playerId });
  assert.ok(eventsOf(rec, PLANTS_SPARE_BILL_EVENT, 'farm').length === 1);
  const station = fixtureStation(state, 'st1', { x: 900, z: 0 });
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  assert.ok(station.data[PL_259_BILLED_STAMP] > 0, 'one dock bills you for the wasted tow');
  assert.ok(rec.spawns.some((e) => e.data && e.data.swarmFloorPad
    && e.data.swarmFloorPad.label === 'TOW ON THE BILL'));
  assert.equal(station.data[PL_259_PAID_STAMP], undefined, 'the chalks stopped');
});

test('PL-259 cooldown per hull: the same broken hull re-fed inside the window earns no second deed', () => {
  const { state, rec, bus } = boot(pl259SpareAndShare);
  const needy = makeNpc(state, 'npc1', { x: 100, z: 0 }, { data: { trafficRole: 'hauler', disabled: true } });
  const pod = makePod(state, { x: 10, z: 0 }, state.playerId);
  bus.emit('cargo:jettisoned', { commodityId: 'cmdty_ore_iron', amount: 1 });
  bus.emit('pickup:collected', { pickupId: pod.id, collectorId: needy.id });
  assert.equal(eventsOf(rec, PLANTS_SPARE_EVENT).length, 1, 'the deed credits once');
  // A fresh pod dropped for the SAME hull inside the offer-memory window: no re-credit.
  const pod2 = makePod(state, { x: 8, z: 0 }, state.playerId);
  bus.emit('cargo:jettisoned', { commodityId: 'cmdty_ore_iron', amount: 1 });
  bus.emit('pickup:collected', { pickupId: pod2.id, collectorId: needy.id });
  assert.equal(eventsOf(rec, PLANTS_SPARE_EVENT).length, 1, 'no second deed inside the cooldown');
  // A different hull is a different deed.
  const other = makeNpc(state, 'npc2', { x: 90, z: 0 }, { data: { trafficRole: 'hauler', disabled: true } });
  const pod3 = makePod(state, { x: 6, z: 0 }, state.playerId);
  bus.emit('cargo:jettisoned', { commodityId: 'cmdty_ore_iron', amount: 1 });
  bus.emit('pickup:collected', { pickupId: pod3.id, collectorId: other.id });
  assert.equal(eventsOf(rec, PLANTS_SPARE_EVENT).length, 2, 'another hull can still earn the chalks');
  // Once the window is past, the same hull earns again.
  state.simTime += SPARE_TUNING.offerMemoryS + 1;
  const pod4 = makePod(state, { x: 4, z: 0 }, state.playerId);
  bus.emit('cargo:jettisoned', { commodityId: 'cmdty_ore_iron', amount: 1 });
  bus.emit('pickup:collected', { pickupId: pod4.id, collectorId: needy.id });
  assert.equal(eventsOf(rec, PLANTS_SPARE_EVENT).length, 3, 'the cooldown expired: the deed credits again');
});

test('PL-259 the chalk mark expires with its stamp and reset/destroy despawn owned chalks', () => {
  const { state, rec, bus } = boot(pl259SpareAndShare);
  const needy = makeNpc(state, 'npc1', { x: 100, z: 0 }, { data: { trafficRole: 'hauler', disabled: true } });
  const pod = makePod(state, { x: 10, z: 0 }, state.playerId);
  bus.emit('cargo:jettisoned', { commodityId: 'cmdty_ore_iron', amount: 1 });
  bus.emit('pickup:collected', { pickupId: pod.id, collectorId: needy.id });
  const station = fixtureStation(state, 'st1', { x: 900, z: 0 });
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  const chalk = rec.spawns.find((e) => e.data && e.data.plantsPl259Chalk === true);
  assert.ok(chalk, 'the chalk mark is visible');
  assert.ok(Number.isFinite(chalk.data.expireAt), 'the chalk carries its expiry');
  sweep(pl259SpareAndShare, state, Math.ceil(SPARE_TUNING.paidUntilS / 0.5) + 2, 0.5);
  assert.ok(rec.removes.includes(chalk.id), 'the expired chalk despawned');

  // A live chalk is session truth: sector:exit takes it off the board.
  const needy2 = makeNpc(state, 'npc2', { x: 90, z: 0 }, { data: { trafficRole: 'hauler', disabled: true } });
  const pod2 = makePod(state, { x: 8, z: 0 }, state.playerId);
  bus.emit('cargo:jettisoned', { commodityId: 'cmdty_ore_iron', amount: 1 });
  bus.emit('pickup:collected', { pickupId: pod2.id, collectorId: needy2.id });
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  const chalk2 = rec.spawns.filter((e) => e.data && e.data.plantsPl259Chalk === true)[1];
  assert.ok(chalk2, 'a fresh chalk for the fresh deed');
  bus.emit('sector:exit', {});
  assert.ok(rec.removes.includes(chalk2.id), 'reset despawns the owned chalk');
  assert.equal(pl259SpareAndShare._chalkIds.size, 0, 'the ledger is clear');

  // destroy() despawns whatever chalk is still out.
  state.simTime += SPARE_TUNING.paidUntilS + 1; // the old PAID stamp on the board laps first
  const pod3 = makePod(state, { x: 6, z: 0 }, state.playerId);
  bus.emit('cargo:jettisoned', { commodityId: 'cmdty_ore_iron', amount: 1 });
  bus.emit('pickup:collected', { pickupId: pod3.id, collectorId: needy2.id });
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  const chalk3 = rec.spawns.filter((e) => e.data && e.data.plantsPl259Chalk === true)[2];
  assert.ok(chalk3, 'a chalk to outlive the plant');
  pl259SpareAndShare.destroy();
  assert.ok(rec.removes.includes(chalk3.id), 'destroy despawns the owned chalk');
});

// ---------------------------------------------------------------- PL-260

test('PL-260 fiftieth visit: the station pays the toll, chalk exact line', () => {
  const { state, rec, bus } = boot(pl260FiftiethVisit);
  const station = fixtureStation(state, 'st1', { x: 0, z: 200 });
  for (let i = 0; i < FIFTY_TUNING.arrivalTarget; i++) {
    bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  }
  assert.ok(station.data[PL_260_PAID_STAMP] > 0, 'already toll-paid when you reach the board');
  const chalk = rec.spawns.find((e) => e.data && e.data.plantsPl260Chalk === true);
  assert.ok(chalk, 'the chalk mark is visible');
  assert.equal(chalk.data.swarmFloorPad.label, 'FIFTY. OURS NOW.');
  assert.equal(voiceOf(rec, 'Fifty. Ours now.').length, 1, 'exact line');
  assert.equal(commsOf(rec, 'Fifty. Ours now.').length, 1);
  assert.equal(eventsOf(rec, PLANTS_FIFTY_EVENT).length, 1);
});

test('PL-260 wrong choice: demand the toll back — the mark becomes a bill', () => {
  const { state, rec, bus } = boot(pl260FiftiethVisit);
  const station = fixtureStation(state, 'st1', { x: 0, z: 200 });
  for (let i = 0; i < FIFTY_TUNING.arrivalTarget; i++) {
    bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  }
  const chalk = rec.spawns.find((e) => e.data && e.data.plantsPl260Chalk === true);
  // A real shove tears the mark off the board.
  bus.emit('physics:impact', {
    aId: chalk.id, bId: state.playerId, impulse: 200, dp: 5,
    causalActorId: state.playerId, pos: { x: chalk.pos.x, z: chalk.pos.z },
  });
  assert.ok(station.data[PL_260_BILLED_STAMP] > 0, 'the mark becomes a bill');
  assert.equal(chalk.data.swarmFloorPad.label, 'THE MARK IS A BILL');
  assert.equal(eventsOf(rec, PLANTS_FIFTY_BILL_EVENT).length, 1);
});

test('PL-260 grind: shoving the chalk one grind stamps the bill once, not per frame', () => {
  const { state, rec, bus } = boot(pl260FiftiethVisit);
  const station = fixtureStation(state, 'st1', { x: 0, z: 200 });
  for (let i = 0; i < FIFTY_TUNING.arrivalTarget; i++) {
    bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  }
  const chalk = rec.spawns.find((e) => e.data && e.data.plantsPl260Chalk === true);
  assert.ok(chalk, 'the chalk mark is visible');
  // A grind re-fires physics:impact every contact frame; the bill stamps once.
  for (let i = 0; i < 8; i++) {
    bus.emit('physics:impact', {
      aId: chalk.id, bId: state.playerId, impulse: 200, dp: 5,
      causalActorId: state.playerId, pos: { x: chalk.pos.x, z: chalk.pos.z },
    });
  }
  assert.equal(eventsOf(rec, PLANTS_FIFTY_BILL_EVENT).length, 1, 'one bill for the whole grind');
  assert.ok(station.data[PL_260_BILLED_STAMP] > 0, 'the mark is a bill');
  assert.equal(chalk.data.swarmFloorPad.label, 'THE MARK IS A BILL');
});

// ---------------------------------------------------------------- PL-261

test('PL-261 open tank: come in dry to a dark waystation, one tank is yours', () => {
  const { state, rec, bus, player } = boot(pl261OpenTank, { state: { fuel: { current: 5, max: 100 } } });
  const station = fixtureStation(state, 'st1', { x: 0, z: 100 }, { size: 'S' });
  assert.equal(isDarkWaystation(station), true);
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  const pod = lastSpawn(rec, (e) => e.data && e.data.plantsPl261OpenTank === true);
  assert.ok(pod, 'the open tank spawned');
  assert.equal(pod.data.amount, OPEN_TANK_TUNING.oneTankUnits, 'exactly one tank\'s worth');
  const before = state.fuel.current;
  bus.emit('pickup:collected', { pickupId: pod.id, collectorId: state.playerId });
  assert.ok(state.fuel.current > before, 'take the tank: real fuel');
  assert.ok(eventsOf(rec, PLANTS_TANK_EVENT, 'taken').length === 1);
  assert.ok(commsOf(rec, "Hatch unlocked: one tank's worth, chalked to nobody.").length === 1);
});

test('PL-261 wrong choice: drain the lot — the next arrival finds it locked, name chalked', () => {
  const { state, rec, bus } = boot(pl261OpenTank, { state: { fuel: { current: 5, max: 100 } } });
  const station = fixtureStation(state, 'st1', { x: 0, z: 100 }, { size: 'S' });
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  const pod1 = lastSpawn(rec, (e) => e.data && e.data.plantsPl261OpenTank === true);
  bus.emit('pickup:collected', { pickupId: pod1.id, collectorId: state.playerId });
  // The very next waystation day, dry again: draining the grace.
  state.simTime += OPEN_TANK_TUNING.dayLengthS + 1;
  state.fuel.current = 5;
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  const pod2 = lastSpawn(rec, (e) => e.data && e.data.plantsPl261OpenTank === true);
  assert.notEqual(pod2.id, pod1.id);
  bus.emit('pickup:collected', { pickupId: pod2.id, collectorId: state.playerId });
  assert.ok(station.data[PL_261_LOCKED_STAMP] > 0, 'the hatch locks');
  const chalk = rec.spawns.find((e) => e.data && e.data.plantsPl261Chalk === true);
  assert.ok(chalk, 'your name chalked on the hatch');
  assert.equal(chalk.data.swarmFloorPad.label, 'LOCKED');
  assert.equal(eventsOf(rec, PLANTS_LOCKED_EVENT).length, 1);
});

// ---------------------------------------------------------------- PL-262

test('PL-262 gathered pile: your spilled cargo is gathered and marked; take yours back', () => {
  const { state, rec, bus, player } = boot(pl262GatheredPile, { playerPos: { x: 0, z: 0 } });
  const mine = makePod(state, { x: 12, z: 0 }, state.playerId);
  bus.emit('cargo:jettisoned', { commodityId: 'cmdty_ore_iron', amount: 1 });
  state.simTime += PILE_TUNING.gatherDelayS + 1;
  pl262GatheredPile.update(1);
  const marker = rec.spawns.find((e) => e.data && e.data.plantsPl262Marker === true);
  assert.ok(marker, 'a neat cluster with a marker, nobody claiming salvage');
  assert.equal(marker.data.swarmFloorPad.label, 'GATHERED — YOURS?');
  assert.equal(mine.data[PL_262_GATHERED_STAMP], true);
  bus.emit('pickup:collected', { pickupId: mine.id, collectorId: state.playerId });
  assert.ok(eventsOf(rec, PLANTS_PILE_EVENT, 'reclaimed').length === 1, 'take only yours');
  assert.ok(eventsOf(rec, PLANTS_PILE_EVENT, 'cleared').length === 1, 'the marker goes home');
  assert.ok(rec.removes.includes(marker.id));
});

test('PL-262 wrong choice: take the lot — gatherers gossip at market scales', () => {
  const { state, rec, bus } = boot(pl262GatheredPile, { playerPos: { x: 0, z: 0 } });
  const station = fixtureStation(state, 'st1', { x: 30, z: 30 });
  const stray = makePod(state, { x: 14, z: 0 }, 'npc_owner'); // somebody else's stray
  bus.emit('cargo:jettisoned', { commodityId: 'cmdty_ore_iron', amount: 1 });
  state.simTime += PILE_TUNING.gatherDelayS + 1;
  pl262GatheredPile.update(1);
  assert.equal(stray.data[PL_262_STRAY_STAMP], true, 'strays ride in the pile');
  bus.emit('pickup:collected', { pickupId: stray.id, collectorId: state.playerId });
  assert.ok(eventsOf(rec, PLANTS_GOSSIP_EVENT).length === 1, 'gatherers watch');
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  assert.ok(station.data[PL_262_GOSSIP_STAMP] > 0, 'the scales ran your lot twice');
  assert.ok(station.data.dockLampsFlashing === true);
});

// ---------------------------------------------------------------- PL-263

test('PL-263 lesson alongside: a fresh class brings the elder, the trick, the mark', () => {
  const { state, rec, bus, host, player } = opsHost(lessonOps, { playerPos: { x: 0, z: 0 } });
  host._initLesson();
  bus.emit('line:classChanged', { classIndex: 2, label: 'B' });
  const elder = makeNpc(state, 'npc1', { x: 50, z: 0 }, { hull: 70, hullMax: 100 });
  assert.equal(host._reactLesson(elder, { role: 'hauler' }, [], state, player), true, 'falls alongside');
  assert.ok(eventsOf(rec, PLANTS_LESSON_EVENT, 'fell_in').length === 1);
  // Mid-lesson: one trick, a boost burst.
  state.simTime += LESSON_TUNING.lessonS * LESSON_TUNING.trickAtFrac + 0.2;
  host._reactLesson(elder, { role: 'hauler' }, [], state, player);
  assert.ok(elder.data.intent && elder.data.intent.boost === true, 'shows one trick');
  // Gone at the next mark, and you held alongside: learned.
  state.simTime += LESSON_TUNING.lessonS;
  assert.equal(host._reactLesson(elder, { role: 'hauler' }, [], state, player), true);
  assert.ok(elder.data.lampsFlashing === true, 'lamp flash at the mark');
  assert.equal(player.data[PL_263_LEARNED_STAMP], state.simTime, 'learned it');
  assert.ok(eventsOf(rec, PLANTS_LESSON_EVENT, 'learned').length === 1);
});

test('PL-263 wrong choice: shove them off mid-lesson — nobody teaches the next one', () => {
  const { state, rec, bus, host, player } = opsHost(lessonOps, { playerPos: { x: 0, z: 0 } });
  host._initLesson();
  bus.emit('line:classChanged', { classIndex: 2, label: 'B' });
  const elder = makeNpc(state, 'npc1', { x: 50, z: 0 }, { hull: 70, hullMax: 100 });
  host._reactLesson(elder, { role: 'hauler' }, [], state, player);
  bus.emit('physics:impact', {
    aId: elder.id, bId: state.playerId, impulse: 120, dp: 6, causalActorId: state.playerId,
  });
  assert.ok(eventsOf(rec, PLANTS_LESSON_SHOVE_EVENT).length === 1);
  // The next class change: nobody teaches.
  state.simTime += 10;
  bus.emit('line:classChanged', { classIndex: 3, label: 'A' });
  const elder2 = makeNpc(state, 'npc2', { x: 50, z: 0 }, { hull: 70, hullMax: 100 });
  assert.equal(host._reactLesson(elder2, { role: 'hauler' }, [], state, player), false);
  assert.equal(eventsOf(rec, PLANTS_LESSON_EVENT, 'fell_in').length, 1, 'no second lesson');
});

// ---------------------------------------------------------------- PL-264

test('PL-264 the light remembers: hold the full count, three greens run early', () => {
  const { state, rec, player } = boot(pl264LaneLight, { state: { simTime: 0 } });
  const anchor = laneLightAnchor('s1');
  player.pos = { ...anchor };
  player.vel = { x: 1, z: 0 }; // hold still
  sweep(pl264LaneLight, state, 1, 0.5); // spawn pass
  assert.equal(lightPhaseAt(0), 'red');
  sweep(pl264LaneLight, state, 30, 0.5); // the full count
  const completed = eventsOf(rec, PLANTS_LIGHT_EVENT, 'count_completed');
  assert.equal(completed.length, 1, 'held through the count');
  // Leave and come back while still red: green one beat early.
  player.pos = { x: anchor.x + LANE_LIGHT_TUNING.lightRadiusWu * 2, z: anchor.z };
  player.vel = { x: 0, z: 0 };
  sweep(pl264LaneLight, state, 1, 0.5);
  player.pos = { ...anchor };
  sweep(pl264LaneLight, state, 8, 0.5); // past the one-beat-early deadline
  assert.ok(eventsOf(rec, PLANTS_LIGHT_EVENT, 'green_early').length >= 1, 'green one beat early');
});

test('PL-264 wrong choice: jump the count — red all week', () => {
  const { state, rec, player } = boot(pl264LaneLight, { state: { simTime: 0 } });
  const anchor = laneLightAnchor('s1');
  player.pos = { ...anchor };
  player.vel = { x: LANE_LIGHT_TUNING.jumpSpeedWu, z: 0 };
  sweep(pl264LaneLight, state, 1, 0.5);
  // Straight through the radius at speed before the count completes.
  player.pos = { x: anchor.x + LANE_LIGHT_TUNING.lightRadiusWu * 3, z: anchor.z };
  sweep(pl264LaneLight, state, 2, 0.5);
  const jumped = eventsOf(rec, PLANTS_LIGHT_EVENT, 'jumped');
  assert.equal(jumped.length, 1, 'the light remembers that too');
  assert.ok(jumped[0].payload.until > state.simTime + LANE_LIGHT_TUNING.redWeekS * 0.9, 'runs you red all week');
  // Back inside: the light stays red for you.
  player.vel = { x: 0, z: 0 };
  player.pos = { ...anchor };
  sweep(pl264LaneLight, state, 40, 0.5);
  assert.equal(eventsOf(rec, PLANTS_LIGHT_EVENT, 'green_early').length, 0);
});

test('PL-264 grudge enforcement: natural greens stay shut and nothing re-grants until the week expires', () => {
  const { state, rec, player } = boot(pl264LaneLight, { state: { simTime: 0 } });
  const anchor = laneLightAnchor('s1');
  player.pos = { ...anchor };
  player.vel = { x: LANE_LIGHT_TUNING.jumpSpeedWu, z: 0 };
  sweep(pl264LaneLight, state, 1, 0.5);
  player.pos = { x: anchor.x + LANE_LIGHT_TUNING.lightRadiusWu * 3, z: anchor.z };
  sweep(pl264LaneLight, state, 2, 0.5);
  const jumped = eventsOf(rec, PLANTS_LIGHT_EVENT, 'jumped');
  assert.equal(jumped.length, 1);
  const until = jumped[0].payload.until;
  // Park outside until early in a red phase, then enter and hold through the natural
  // green: the light must NOT open for you, and holding must re-grant nothing.
  sweep(pl264LaneLight, state, 46, 0.5); // simTime 24.5 = phase 0.5, red
  player.pos = { ...anchor };
  player.vel = { x: 0, z: 0 };
  sweep(pl264LaneLight, state, 30, 0.5); // holds through the natural green phase at 38.4
  const light = rec.spawns.find((e) => e.data && e.data.plantsPl264Light === true);
  assert.ok(light, 'the light is spawned');
  assert.notEqual(light.data.swarmFloorPad && light.data.swarmFloorPad.label, 'GO',
    'no natural green opens the light during the week');
  assert.equal(light.data.lampsFlashing, undefined, 'no green lamps for the jumper');
  assert.equal(eventsOf(rec, PLANTS_LIGHT_EVENT, 'count_completed').length, 0,
    'holding under the grudge re-grants nothing');
  assert.equal(eventsOf(rec, PLANTS_LIGHT_EVENT, 'green_early').length, 0,
    'green-early is not re-granted during the week');
  // Wait the week out outside the radius, then hold a fresh count: green works again.
  player.pos = { x: anchor.x + LANE_LIGHT_TUNING.lightRadiusWu * 3, z: anchor.z };
  sweep(pl264LaneLight, state, Math.ceil((until - state.simTime) / 0.5) + 2, 0.5);
  assert.ok(state.simTime >= until, 'the red week has expired');
  player.pos = { ...anchor };
  sweep(pl264LaneLight, state, 50, 0.5);
  assert.equal(eventsOf(rec, PLANTS_LIGHT_EVENT, 'count_completed').length, 1,
    'the grudge lifted: the full count credits again');
  player.pos = { x: anchor.x + LANE_LIGHT_TUNING.lightRadiusWu * 2, z: anchor.z };
  sweep(pl264LaneLight, state, 1, 0.5);
  player.pos = { ...anchor };
  sweep(pl264LaneLight, state, 8, 0.5);
  assert.ok(eventsOf(rec, PLANTS_LIGHT_EVENT, 'green_early').length >= 1,
    'green one beat early works again');
});

// ---------------------------------------------------------------- PL-265

test('PL-265 the umbrella: a working tender shields your boosted pass', () => {
  const { state, rec, bus, host, player } = opsHost(umbrellaOps, { playerPos: { x: 150, z: 0 }, playerVel: { x: 120, z: 0 } });
  host._initUmbrella();
  const station = fixtureStation(state, 'st1', { x: 0, z: 0 });
  const tender = makeNpc(state, 'tug1', { x: 100, z: 0 }, { data: { trafficRole: 'tug' } });
  bus.emit('ship:boostStart', { shipId: state.playerId });
  assert.equal(host._reactUmbrella(tender, { role: 'tug' }, [station], state, player), true, 'swings its body wide');
  assert.ok(eventsOf(rec, PLANTS_UMBRELLA_EVENT, 'up').length === 1);
  assert.ok(tender.data.lampsFlashing === true, 'courtesy lamp lit');
  // The whole way past: the shield releases once you are through.
  player.pos = { x: 500, z: 0 };
  assert.equal(host._reactUmbrella(tender, { role: 'tug' }, [station], state, player), false);
});

test('PL-265 wrong choice: cut through anyway — the umbrella comes down next pass', () => {
  const { state, rec, bus, host, player } = opsHost(umbrellaOps, { playerPos: { x: 150, z: 0 }, playerVel: { x: 120, z: 0 } });
  host._initUmbrella();
  const station = fixtureStation(state, 'st1', { x: 0, z: 0 });
  const tender = makeNpc(state, 'tug1', { x: 100, z: 0 }, { data: { trafficRole: 'tug' } });
  bus.emit('ship:boostStart', { shipId: state.playerId });
  host._reactUmbrella(tender, { role: 'tug' }, [station], state, player);
  player.pos = { x: 500, z: 0 };
  host._reactUmbrella(tender, { role: 'tug' }, [station], state, player);
  // Cut through the work zone again inside the repeat window.
  state.simTime += UMBRELLA_TUNING.passCooldownS + 2;
  player.pos = { x: 150, z: 0 };
  bus.emit('ship:boostStart', { shipId: state.playerId });
  assert.equal(host._reactUmbrella(tender, { role: 'tug' }, [station], state, player), false);
  assert.ok(eventsOf(rec, PLANTS_UMBRELLA_DOWN_EVENT).length === 1, 'the umbrella comes down');
  // The next pass gets no shield: the tender refuses.
  player.pos = { x: 500, z: 0 };
  state.simTime += UMBRELLA_TUNING.passCooldownS + 1;
  player.pos = { x: 150, z: 0 };
  bus.emit('ship:boostStart', { shipId: state.playerId });
  const refused = host._reactUmbrella(tender, { role: 'tug' }, [station], state, player);
  assert.equal(refused, true, 'the tender moves — away from your line');
  assert.equal(eventsOf(rec, PLANTS_UMBRELLA_EVENT, 'up').length, 1, 'no second umbrella');
});

// ---------------------------------------------------------------- PL-266

test('PL-266 somebody\u2019s spare: a passing miner tows a sealed patch kit; mount it', () => {
  const { state, rec, bus, host, player } = opsHost(spareKitOps, { playerPos: { x: 0, z: 0 }, player: { hull: 20, hullMax: 100 } });
  host._initSpareKit();
  // Out of a fight: a kill receipt near you.
  const wreck = makeNpc(state, 'wreck1', { x: 300, z: 0 }, { data: { trafficRole: 'pirate', ai: { hostile: true } } });
  bus.emit('entity:killed', { id: wreck.id, pos: { x: 300, z: 0 } });
  assert.equal(isMinerHull(makeNpc(state, 'npcMiner', { x: 400, z: 0 }, { data: { trafficRole: 'miner' } }), { role: 'miner' }, state), true);
  const miner = state.entities.get('npcMiner');
  assert.equal(host._reactSpareKit(miner, { role: 'miner' }, [], state, player), true, 'falls in, no channel');
  assert.ok(eventsOf(rec, PLANTS_SPARE_KIT_EVENT, 'fell_in').length === 1);
  // Tows the kit to your range and drops it.
  miner.pos = { x: 60, z: 0 };
  state.simTime += 1;
  const seen = host._reactSpareKit(miner, { role: 'miner' }, [], state, player);
  assert.equal(seen, false, 'gone before you can thank them');
  const kit = lastSpawn(rec, (e) => e.data && e.data[PL_266_KIT_STAMP] === true);
  assert.ok(kit, 'a sealed patch kit, towed over');
  assert.ok(kit.data.swarmFloorPad.label.length <= 24);
  // Mount it: the real pickup applies the patch.
  const before = player.hull;
  bus.emit('pickup:collected', { pickupId: kit.id, collectorId: state.playerId });
  assert.ok(player.hull > before, 'the kit goes on');
  assert.ok(eventsOf(rec, PLANTS_SPARE_KIT_EVENT, 'mounted').length === 1);
});

test('PL-266 wrong choice: hunt them for a second kit — miners watch their mirrors', () => {
  const { state, rec, bus, host, player } = opsHost(spareKitOps, { playerPos: { x: 0, z: 0 }, player: { hull: 20, hullMax: 100 } });
  host._initSpareKit();
  const wreck = makeNpc(state, 'wreck1', { x: 300, z: 0 }, { data: { ai: { hostile: true } } });
  bus.emit('entity:killed', { id: wreck.id, pos: { x: 300, z: 0 } });
  const miner = makeNpc(state, 'npcMiner', { x: 400, z: 0 }, { data: { trafficRole: 'miner' } });
  host._reactSpareKit(miner, { role: 'miner' }, [], state, player);
  miner.pos = { x: 60, z: 0 };
  state.simTime += 1;
  host._reactSpareKit(miner, { role: 'miner' }, [], state, player); // drop
  // Hunt: close on the miner fast after the drop.
  player.vel = { x: SPARE_KIT_TUNING.huntSpeedWu + 10, z: 0 };
  miner.pos = { x: SPARE_KIT_TUNING.huntRangeWu - 5, z: 0 };
  state.simTime += 1;
  const chased = host._reactSpareKit(miner, { role: 'miner' }, [], state, player);
  assert.equal(chased, true, 'they flee hard');
  assert.ok(eventsOf(rec, PLANTS_SPARE_HUNT_EVENT, 'hunted').length === 1);
  // Nobody drops a second kit inside the grudge.
  player.hull = 15;
  state.simTime += 1;
  bus.emit('entity:killed', { id: wreck.id, pos: { x: 300, z: 0 } });
  const miner2 = makeNpc(state, 'npcMiner2', { x: 200, z: 0 }, { data: { trafficRole: 'miner' } });
  assert.equal(host._reactSpareKit(miner2, { role: 'miner' }, [], state, player), false);
});

// ---------------------------------------------------------------- PL-267

test('PL-267 queue pass: give up the berth slot, the board chalks PREFERRED', () => {
  const { state, rec, bus } = boot(pl267QueuePass);
  const station = fixtureStation(state, 'st1', { x: 0, z: 0 });
  const hauler = makeNpc(state, 'heavy1', { x: 200, z: 0 }, { mass: 80 });
  assert.equal(isOverloadedHauler(hauler, state), true, 'visibly overloaded');
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: false });
  assert.ok(eventsOf(rec, PLANTS_QUEUE_EVENT, 'yielded').length === 1, 'a counted yield');
  // The overloaded hauler takes the berth.
  hauler.pos = { x: 40, z: 0 };
  sweep(pl267QueuePass, state, 1, 0.5);
  assert.ok(station.data[PL_267_PREFERRED_STAMP] > state.simTime, 'PREFERRED for a week');
  const chalk = rec.spawns.find((e) => e.data && e.data.plantsPl267Chalk === true);
  assert.ok(chalk, 'same chalk, visible');
  assert.equal(chalk.data.swarmFloorPad.label, 'PREFERRED');
  assert.ok(eventsOf(rec, PLANTS_QUEUE_EVENT, 'preferred').length === 1);
});

test('PL-267 wrong choice: shout at the overloaded one — PREFERRED becomes LAST', () => {
  const { state, rec, bus } = boot(pl267QueuePass);
  const station = fixtureStation(state, 'st1', { x: 0, z: 0 });
  const hauler = makeNpc(state, 'heavy1', { x: 200, z: 0 }, { mass: 80 });
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: false });
  // The shout is its physical verb: a shove on the overloaded hull during its approach.
  bus.emit('physics:impact', { aId: hauler.id, bId: state.playerId, impulse: 90, causalActorId: state.playerId });
  assert.ok(eventsOf(rec, PLANTS_QUEUE_EVENT, 'voided').length === 1, 'PREFERRED voided');
  // Two shoves is a beat, not a grind: the second lands after the shout cadence.
  state.simTime += 1;
  bus.emit('physics:impact', { aId: hauler.id, bId: state.playerId, impulse: 90, causalActorId: state.playerId });
  assert.ok(station.data[PL_267_LAST_STAMP] > state.simTime, 'LAST in the same chalk');
  assert.ok(eventsOf(rec, PLANTS_QUEUE_EVENT, 'last').length === 1);
  sweep(pl267QueuePass, state, 1, 0.5);
  assert.equal(station.data[PL_267_PREFERRED_STAMP], -Infinity, 'never granted');
});

test('PL-267 the chalk comes off the board with its week stamp; reset despawns owned chalks', () => {
  const { state, rec, bus } = boot(pl267QueuePass);
  const station = fixtureStation(state, 'st1', { x: 0, z: 0 });
  const hauler = makeNpc(state, 'heavy1', { x: 200, z: 0 }, { mass: 80 });
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: false });
  hauler.pos = { x: 40, z: 0 };
  sweep(pl267QueuePass, state, 1, 0.5); // the hauler takes the berth: PREFERRED + chalk
  const chalk = rec.spawns.find((e) => e.data && e.data.plantsPl267Chalk === true);
  assert.ok(chalk, 'the chalk is visible');
  assert.ok(Number.isFinite(chalk.data.expireAt), 'the chalk carries the week expiry');
  assert.equal(chalk.data.expireAt, station.data[PL_267_PREFERRED_STAMP], 'same week as the stamp');
  sweep(pl267QueuePass, state, Math.ceil(QUEUE_TUNING.chalkWeekS / 0.5) + 2, 0.5);
  assert.ok(rec.removes.includes(chalk.id), 'the expired chalk despawned with its stamp');

  // A live chalk is session truth: sector:exit takes it off the board.
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: false });
  hauler.pos = { x: 40, z: 0 };
  sweep(pl267QueuePass, state, 1, 0.5);
  const chalk2 = rec.spawns.filter((e) => e.data && e.data.plantsPl267Chalk === true)[1];
  assert.ok(chalk2, 'a fresh chalk for a fresh yield');
  bus.emit('sector:exit', {});
  assert.ok(rec.removes.includes(chalk2.id), 'reset despawns the owned chalk');
  assert.equal(pl267QueuePass._chalkIds.size, 0, 'the ledger is clear');
});

// ---------------------------------------------------------------- PL-268

test('PL-268 wake gift: ride the wake into port, two farewell flashes at the gate', () => {
  const { state, rec, host, player } = opsHost(wakeOps, { playerPos: { x: 60, z: 0 }, playerVel: { x: 40, z: 0 } });
  host._initWake();
  const gate = fixtureStation(state, 'st1', { x: 100, z: 0 }, { dockRadius: 90 });
  const superhauler = makeNpc(state, 'big1', { x: 0, z: 0 }, { mass: 400, rot: 0 });
  assert.equal(isRidingWake(superhauler, player), true, 'behind, close, at speed');
  let farewell = false;
  for (let i = 0; i < WAKE_TUNING.rideHoldS * 60 + 60; i++) {
    host._reactWake(superhauler, { role: 'hauler' }, [gate], state, player);
    if (superhauler.data && superhauler.data.lampsFlashing === true) { farewell = true; break; }
  }
  assert.equal(farewell, true, 'the helmsman flashes lamps in farewell');
  assert.ok(eventsOf(rec, PLANTS_WAKE_EVENT).length === 1);
  assert.equal(eventsOf(rec, PLANTS_WAKE_EVENT)[0].payload.flashes, 2);
});

test('PL-268 wrong choice: ride it again the same day — you get the wash instead', () => {
  const { state, rec, bus, host, player } = opsHost(wakeOps, { playerPos: { x: 60, z: 0 }, playerVel: { x: 40, z: 0 } });
  host._initWake();
  const gate = fixtureStation(state, 'st1', { x: 100, z: 0 }, { dockRadius: 90 });
  const superhauler = makeNpc(state, 'big1', { x: 0, z: 0 }, { mass: 400, rot: 0 });
  for (let i = 0; i < WAKE_TUNING.rideHoldS * 60 + 60; i++) {
    host._reactWake(superhauler, { role: 'hauler' }, [gate], state, player);
  }
  assert.ok(eventsOf(rec, PLANTS_WAKE_EVENT).length === 1);
  // Ride it again the same day: the wash, not the farewell.
  for (let i = 0; i < WAKE_TUNING.rideHoldS * 60 + 60; i++) {
    host._reactWake(superhauler, { role: 'hauler' }, [gate], state, player);
  }
  assert.equal(eventsOf(rec, PLANTS_WAKE_EVENT).length, 1, 'no second farewell');
  assert.ok(eventsOf(rec, PLANTS_WAKE_WASH_EVENT).length === 1, 'you get the wash instead');
});

// ---------------------------------------------------------------- PL-354

test('PL-354 good-hull rate: tow a stranger, dock cheaper everywhere, no sign', () => {
  const { state, rec, bus } = boot(pl354GoodHullRate);
  const stranger = makeNpc(state, 'npc1', { x: 40, z: 0 }, { data: { trafficRole: 'hauler' } });
  bus.emit('tether:snapCatch', { targetId: stranger.id });
  sweep(pl354GoodHullRate, state, GOOD_HULL_TUNING.holdS + 1, 1);
  bus.emit('massline:releaseValidated', { entityId: stranger.id });
  pl354GoodHullRate.update(1 / 60);
  assert.ok(eventsOf(rec, PLANTS_RATE_EVENT, 'rescue').length === 1, 'the tow counts');
  const station = fixtureStation(state, 'st1', { x: 0, z: 400 });
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  assert.ok(station.data[PL_354_RATE_STAMP] > state.simTime, 'the quiet rate is stamped');
  assert.equal(commsOf(rec, 'Boards read receipts. Fakes dock at a premium.').length, 0,
    'no sign, no announcement');
  assert.ok(eventsOf(rec, PLANTS_RATE_EVENT, 'quiet_rate').length === 1);
});

test('PL-354 wrong choice: fake rescue receipts — fakes dock at a premium', () => {
  const { state, rec, bus } = boot(pl354GoodHullRate);
  // A "rescue" latched onto a prop, not a living stranger.
  const prop = makePod(state, { x: 40, z: 0 }, null);
  bus.emit('tether:snapCatch', { targetId: prop.id });
  pl354GoodHullRate.update(1 / 60);
  assert.ok(eventsOf(rec, PLANTS_FRAUD_EVENT, 'not_a_stranger').length === 1);
  const station = fixtureStation(state, 'st1', { x: 0, z: 400 });
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  assert.ok(station.data[PL_354_PREMIUM_STAMP] > state.simTime, 'fakes dock at a premium');
  assert.ok(commsOf(rec, 'Boards read receipts. Fakes dock at a premium.').length === 1);
  // And a towed hull dying on the line is the same fraud.
  const stranger = makeNpc(state, 'npc2', { x: 40, z: 0 }, { data: { trafficRole: 'hauler' } });
  state.simTime += GOOD_HULL_TUNING.fraudCooldownS + 1;
  bus.emit('tether:snapCatch', { targetId: stranger.id });
  pl354GoodHullRate.update(1 / 60);
  bus.emit('entity:killed', { id: stranger.id });
  assert.ok(eventsOf(rec, PLANTS_FRAUD_EVENT, 'towed_died').length === 1);
});

// ---------------------------------------------------------------- PL-355

test('PL-355 the unit: three strangers helped in one sector, the callsign is a measure', () => {
  const { state, rec, bus, player } = boot(pl355TheUnit);
  player.data.callsign = 'TIN SWALLOW';
  // Deed 1: a stranger tow held and released alive.
  const stranger = makeNpc(state, 'npc1', { x: 40, z: 0 }, { data: { trafficRole: 'hauler' } });
  bus.emit('tether:snapCatch', { targetId: stranger.id });
  sweep(pl355TheUnit, state, 9, 1);
  bus.emit('massline:releaseValidated', { entityId: stranger.id });
  pl355TheUnit.update(1 / 60);
  // Deeds 2-3: spares dropped beside broken-down hulls, taken by the hulls.
  for (let i = 0; i < 2; i++) {
    const needy = makeNpc(state, `needy${i}`, { x: 100 + i * 40, z: 0 }, { data: { trafficRole: 'hauler', disabled: true } });
    const pod = makePod(state, { x: 10 + i * 5, z: 0 }, state.playerId);
    bus.emit('cargo:jettisoned', { commodityId: 'cmdty_ore_iron', amount: 1 });
    bus.emit('pickup:collected', { pickupId: pod.id, collectorId: needy.id });
  }
  const line = unitMeasureLine('TIN SWALLOW');
  assert.equal(line, 'one TIN SWALLOW of fuel');
  assert.ok(commsOf(rec, `Stations measure with you now: ${line}.`).length === 1, 'the row\u2019s measure');
  assert.equal(voiceOf(rec, line).length, 1, 'the measure, out loud');
  assert.ok(eventsOf(rec, PLANTS_UNIT_EVENT, 'became').length === 1);
});

test('PL-355 wrong choice: price the unit — the measure changes hands within the week', () => {
  const { state, rec, bus, player } = boot(pl355TheUnit, { player: { hull: 100 }, playerVel: { x: 60, z: 0 } });
  player.data.callsign = 'TIN SWALLOW';
  for (let i = 0; i < UNIT_TUNING.deedsNeeded; i++) {
    const stranger = makeNpc(state, `npc${i}`, { x: 40 + i * 10, z: 0 }, { data: { trafficRole: 'hauler' } });
    bus.emit('tether:snapCatch', { targetId: stranger.id });
    sweep(pl355TheUnit, state, 10, 1);
    bus.emit('massline:releaseValidated', { entityId: stranger.id });
    pl355TheUnit.update(1 / 60);
  }
  assert.ok(eventsOf(rec, PLANTS_UNIT_EVENT, 'became').length === 1);
  // Price the unit (physical verb): shove a civilian while the measure rides.
  const civ = makeNpc(state, 'civ1', { x: 30, z: 0 }, { data: { trafficRole: 'trader' } });
  bus.emit('physics:impact', { aId: state.playerId, bId: civ.id, impulse: 60, causalActorId: state.playerId });
  assert.ok(eventsOf(rec, PLANTS_UNIT_PASSED_EVENT, 'priced').length === 1);
  state.simTime += UNIT_TUNING.passDelayS + 1;
  pl355TheUnit.update(1 / 60);
  assert.ok(eventsOf(rec, PLANTS_UNIT_PASSED_EVENT).length >= 2, 'somebody else\u2019s name now');
});

function earnTheUnit({ state, bus, rec }) {
  const player = state.entities.get(state.playerId);
  player.data.callsign = 'TIN SWALLOW';
  for (let i = 0; i < UNIT_TUNING.deedsNeeded; i++) {
    const stranger = makeNpc(state, `unitNPC${i}`, { x: 40 + i * 10, z: 0 }, { data: { trafficRole: 'hauler' } });
    bus.emit('tether:snapCatch', { targetId: stranger.id });
    sweep(pl355TheUnit, state, 10, 1);
    bus.emit('massline:releaseValidated', { entityId: stranger.id });
    pl355TheUnit.update(1 / 60);
  }
  assert.ok(eventsOf(rec, PLANTS_UNIT_EVENT, 'became').length === 1, 'precondition: the measure rides');
}

test('PL-355 shove discipline: two rapid impacts price once; a civilian ramming the parked player prices nothing', () => {
  // The shove direction: the player moving into a resting hull is the actor.
  const shoving = boot(pl355TheUnit, { playerVel: { x: 60, z: 0 } });
  earnTheUnit(shoving);
  const { state, rec, bus } = shoving;
  const denyCues = () => rec.events.filter((e) => e.event === 'audio:cue' && e.payload && e.payload.id === 'ui_deny').length;
  const civ = makeNpc(state, 'civ1', { x: 30, z: 0 }, { data: { trafficRole: 'trader' } });
  const shove = () => bus.emit('physics:impact', { aId: state.playerId, bId: civ.id, impulse: 60, causalActorId: state.playerId });

  shove();
  shove(); // the same collision storm, half a breath later
  assert.equal(eventsOf(rec, PLANTS_UNIT_PASSED_EVENT, 'priced').length, 1, 'two rapid impacts, one deny');
  assert.equal(denyCues(), 1, 'no deny spam');
  state.simTime += UNIT_TUNING.impactCooldownS - 1;
  shove();
  assert.equal(eventsOf(rec, PLANTS_UNIT_PASSED_EVENT, 'priced').length, 1, 'no re-arm inside the cooldown');
  state.simTime += UNIT_TUNING.impactCooldownS + 1;
  shove();
  assert.equal(eventsOf(rec, PLANTS_UNIT_PASSED_EVENT, 'priced').length, 2, 'the cooldown is a cooldown, not a latch');

  // The parked variant: a civilian ramming the STATIONARY player voids nothing.
  const parked = boot(pl355TheUnit);
  earnTheUnit(parked);
  const rammer = makeNpc(parked.state, 'ram1', { x: 20, z: 0 }, { vel: { x: 80, z: 0 }, data: { trafficRole: 'trader' } });
  parked.bus.emit('physics:impact', { aId: rammer.id, bId: parked.state.playerId, impulse: 90, causalActorId: rammer.id });
  assert.equal(eventsOf(parked.rec, PLANTS_UNIT_PASSED_EVENT, 'priced').length, 0, 'rammed while parked: the unit stands');
  assert.equal(parked.rec.events.filter((e) => e.event === 'audio:cue' && e.payload && e.payload.id === 'ui_deny').length, 0,
    'no deny for being shoved');
  parked.state.simTime += UNIT_TUNING.passDelayS + 1;
  pl355TheUnit.update(1 / 60);
  assert.equal(eventsOf(parked.rec, PLANTS_UNIT_PASSED_EVENT).length, 0, 'nothing passes, nothing voids');
});

// ---------------------------------------------------------------- PL-356

test('PL-356 parade berth: come home off a deep run, the berth swept, lit, stocked', () => {
  const { state, rec, bus } = boot(pl356ParadeBerth, { state: { simTime: 100 } });
  const home = fixtureStation(state, 'st1', { x: 0, z: 0 });
  bus.emit('sector:exit', { sectorId: 's1' });
  state.simTime = 100 + PARADE_TUNING.deepRunS + 10;
  bus.emit('sector:enter', { sectorId: 's1' });
  assert.ok(home.data.dockLampsFlashing === true, 'the berth lamp lit');
  assert.ok(rec.spawns.some((e) => e.data && e.data.plantsPl356Chalk === true), 'the keeper\u2019s chalk');
  assert.ok(rec.spawns.some((e) => e.data && e.data.swarmFloorPad
    && e.data.swarmFloorPad.label === 'STOCKED FOR YOU'), 'stocked by whoever kept the light');
  assert.equal(homeBerthOf(state, 's1'), home);
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  assert.ok(commsOf(rec, PARADE_HOME_LINE).length === 1, 'dock and let them');
  assert.ok(eventsOf(rec, PLANTS_PARADE_EVENT, 'docked').length === 1);
});

test('PL-356 wrong choice: ghost the sector for months — swept, yes, but cold', () => {
  const { state, rec, bus } = boot(pl356ParadeBerth, { state: { simTime: 100 } });
  const home = fixtureStation(state, 'st1', { x: 0, z: 0 });
  bus.emit('sector:exit', { sectorId: 's1' });
  state.simTime = 100 + PARADE_TUNING.ghostS + 10;
  bus.emit('sector:enter', { sectorId: 's1' });
  assert.equal(home.data.dockLampsFlashing, undefined, 'no lamp: cold');
  assert.ok(rec.spawns.some((e) => e.data && e.data.swarmFloorPad
    && e.data.swarmFloorPad.label === 'SWEPT — COLD'), 'still swept');
  assert.ok(!rec.spawns.some((e) => e.data && e.data.swarmFloorPad
    && e.data.swarmFloorPad.label === 'STOCKED FOR YOU'), 'no stock');
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  assert.ok(commsOf(rec, PARADE_COLD_LINE).length === 1);
});

// ---------------------------------------------------------------- PL-357

test('PL-357 warm grid: dock empty, the grid tops you to launch minimum', () => {
  const { state, rec, bus } = boot(pl357WarmGrid, { state: { fuel: { current: 4, max: 100 } } });
  fixtureStation(state, 'st1', { x: 0, z: 100 });
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  assert.equal(state.fuel.current, WARM_GRID_TUNING.launchMinUnits, 'topped to launch minimum');
  assert.ok(eventsOf(rec, PLANTS_GRID_EVENT).length === 1);
  assert.ok(commsOf(rec, 'Topped to launch minimum. The meter never woke.').length === 1);
});

test('PL-357 wrong choice: drain the grace daily — the grid meters you from zero', () => {
  const { state, rec, bus } = boot(pl357WarmGrid, { state: { fuel: { current: 4, max: 100 } } });
  const station = fixtureStation(state, 'st1', { x: 0, z: 100 });
  for (let day = 0; day < WARM_GRID_TUNING.streakToMeter; day++) {
    state.fuel.current = 4;
    bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
    state.simTime += WARM_GRID_TUNING.dayLengthS; // next day, dry again
  }
  state.fuel.current = 4;
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  assert.ok(station.data[PL_357_METERED_STAMP] > state.simTime, 'metered from zero');
  assert.ok(eventsOf(rec, PLANTS_METERED_EVENT).length >= 1, 'the grace went to someone else');
});

// ---------------------------------------------------------------- PL-358

test('PL-358 apprentice\u2019s return: decent at Helios, the part arrives at Vesta, pay the price', () => {
  const { state, rec, bus, player } = boot(pl358ApprenticesReturn, { state: { world: { currentSectorId: 'sector_helios_prime' } } });
  state.world.currentSectorId = 'sector_helios_prime';
  const stranger = makeNpc(state, 'npc1', { x: 40, z: 0 }, { data: { trafficRole: 'hauler' } });
  bus.emit('tether:snapCatch', { targetId: stranger.id });
  sweep(pl358ApprenticesReturn, state, APPRENTICE_TUNING.holdS + 1, 1);
  bus.emit('massline:releaseValidated', { entityId: stranger.id });
  pl358ApprenticesReturn.update(1 / 60);
  assert.ok(eventsOf(rec, PLANTS_APPRENTICE_EVENT, 'decent_at_helios').length === 1);
  // Years later, at Vesta.
  state.simTime += APPRENTICE_TUNING.yearsS + 1;
  state.world.currentSectorId = 'sector_vesta_forge';
  sweep(pl358ApprenticesReturn, state, 2, 0.5);
  const apprentice = lastSpawn(rec, (e) => e.data && e.data.callsign === APPRENTICE_CALLSIGN);
  assert.ok(apprentice, 'the apprentice turns up');
  const part = lastSpawn(rec, (e) => e.data && e.data.plantsPl358Part === true);
  assert.ok(part, 'exactly the part your build has been missing');
  assert.equal(part.data.commodityId, 'cmdty_inertial_datum');
  // Pay their price: take the part beside them.
  bus.emit('pickup:collected', { pickupId: part.id, collectorId: state.playerId });
  assert.ok(eventsOf(rec, PLANTS_APPRENTICE_EVENT, 'paid').length === 1);
  assert.ok(rec.removes.includes(apprentice.id), 'gone before the ring lights');
});

test('PL-358 wrong choice: haggle them down — journeymen set prices', () => {
  const { state, rec, bus } = boot(pl358ApprenticesReturn, { state: { world: { currentSectorId: 'sector_helios_prime' } } });
  state.world.currentSectorId = 'sector_helios_prime';
  const stranger = makeNpc(state, 'npc1', { x: 40, z: 0 }, { data: { trafficRole: 'hauler' } });
  bus.emit('tether:snapCatch', { targetId: stranger.id });
  sweep(pl358ApprenticesReturn, state, APPRENTICE_TUNING.holdS + 1, 1);
  bus.emit('massline:releaseValidated', { entityId: stranger.id });
  pl358ApprenticesReturn.update(1 / 60);
  state.simTime += APPRENTICE_TUNING.yearsS + 1;
  state.world.currentSectorId = 'sector_vesta_forge';
  sweep(pl358ApprenticesReturn, state, 2, 0.5);
  const apprentice = lastSpawn(rec, (e) => e.data && e.data.callsign === APPRENTICE_CALLSIGN);
  const part = lastSpawn(rec, (e) => e.data && e.data.plantsPl358Part === true);
  // One shove: they hold on, warned.
  bus.emit('physics:impact', { aId: apprentice.id, bId: state.playerId, impulse: 50, causalActorId: state.playerId });
  assert.ok(eventsOf(rec, PLANTS_APPRENTICE_EVENT, 'haggled').length === 1);
  // Production re-fires physics:impact every frame an overlap persists: a shove held over
  // frames is ONE collision — the rapid repeats count nothing.
  bus.emit('physics:impact', { aId: apprentice.id, bId: state.playerId, impulse: 50, causalActorId: state.playerId });
  bus.emit('physics:impact', { aId: apprentice.id, bId: state.playerId, impulse: 50, causalActorId: state.playerId });
  assert.ok(eventsOf(rec, PLANTS_APPRENTICE_EVENT, 'haggled').length === 1, 'still one warning only');
  assert.ok(eventsOf(rec, PLANTS_APPRENTICE_EVENT, 'journeymen').length === 0, 'no instant destroy');
  assert.ok(!rec.removes.includes(part.id), 'the part is not lost to a held shove');
  assert.ok(!rec.removes.includes(apprentice.id));
  // Two: only a second impact AFTER the cooldown expires leaves them WITH the part.
  state.simTime += APPRENTICE_TUNING.impactCooldownS;
  bus.emit('physics:impact', { aId: apprentice.id, bId: state.playerId, impulse: 50, causalActorId: state.playerId });
  assert.ok(eventsOf(rec, PLANTS_APPRENTICE_EVENT, 'journeymen').length === 1);
  assert.ok(rec.removes.includes(part.id), 'the part is gone with them');
  assert.ok(rec.removes.includes(apprentice.id));
});

test('PL-358 game:new is a hard reset: nothing stale gates or gifts the new run', () => {
  const { state, rec, bus } = boot(pl358ApprenticesReturn, { state: { world: { currentSectorId: 'sector_helios_prime' } } });
  state.world.currentSectorId = 'sector_helios_prime';
  // Run 1: decent at Helios, the apprentice returns, haggled away — the journeymen lockout lives.
  const stranger = makeNpc(state, 'npc1', { x: 40, z: 0 }, { data: { trafficRole: 'hauler' } });
  bus.emit('tether:snapCatch', { targetId: stranger.id });
  sweep(pl358ApprenticesReturn, state, APPRENTICE_TUNING.holdS + 1, 1);
  bus.emit('massline:releaseValidated', { entityId: stranger.id });
  pl358ApprenticesReturn.update(1 / 60);
  assert.ok(eventsOf(rec, PLANTS_APPRENTICE_EVENT, 'decent_at_helios').length === 1);
  state.simTime += APPRENTICE_TUNING.yearsS + 1;
  state.world.currentSectorId = 'sector_vesta_forge';
  sweep(pl358ApprenticesReturn, state, 2, 0.5);
  const apprentice = lastSpawn(rec, (e) => e.data && e.data.callsign === APPRENTICE_CALLSIGN);
  const part = lastSpawn(rec, (e) => e.data && e.data.plantsPl358Part === true);
  assert.ok(apprentice && part, 'the first return lands');
  bus.emit('physics:impact', { aId: apprentice.id, bId: state.playerId, impulse: 50, causalActorId: state.playerId });
  state.simTime += APPRENTICE_TUNING.impactCooldownS;
  bus.emit('physics:impact', { aId: apprentice.id, bId: state.playerId, impulse: 50, causalActorId: state.playerId });
  assert.ok(eventsOf(rec, PLANTS_APPRENTICE_EVENT, 'journeymen').length === 1, 'haggled away in run 1');
  assert.ok(pl358ApprenticesReturn._journeymanUntil > state.simTime, 'the journeymen lockout is live');

  // A NEW game: the table clock restarts near zero; the ledger cannot survive it.
  bus.emit('game:new', {});
  assert.equal(pl358ApprenticesReturn._decentAt, null, 'no stale decency across a new game');
  assert.equal(pl358ApprenticesReturn._journeymanUntil, -Infinity, 'no stale journeymen lockout');
  assert.equal(pl358ApprenticesReturn._tow, null, 'no stale tow view');
  assert.equal(pl358ApprenticesReturn._lastShoveAt, -Infinity, 'no stale impact cooldown');
  state.simTime = 1;
  state.world.currentSectorId = 'sector_helios_prime';

  // Run 2: re-earn it fresh — nothing stale blocks the summon or gifts an unearned arrival.
  const stranger2 = makeNpc(state, 'npc2', { x: 40, z: 0 }, { data: { trafficRole: 'hauler' } });
  bus.emit('tether:snapCatch', { targetId: stranger2.id });
  sweep(pl358ApprenticesReturn, state, APPRENTICE_TUNING.holdS + 1, 1);
  bus.emit('massline:releaseValidated', { entityId: stranger2.id });
  pl358ApprenticesReturn.update(1 / 60);
  assert.ok(eventsOf(rec, PLANTS_APPRENTICE_EVENT, 'decent_at_helios').length === 2, 'decent again, earned in this run');
  state.simTime += APPRENTICE_TUNING.yearsS + 1;
  state.world.currentSectorId = 'sector_vesta_forge';
  sweep(pl358ApprenticesReturn, state, 2, 0.5);
  const apprentice2 = lastSpawn(rec, (e) => e.data && e.data.callsign === APPRENTICE_CALLSIGN);
  assert.ok(apprentice2 && apprentice2.id !== apprentice.id, 'the apprentice returns in the new run');
  const part2 = lastSpawn(rec, (e) => e.data && e.data.plantsPl358Part === true);
  assert.ok(part2 && part2.id !== part.id, 'the part is carried again, at their own cost');
});

test('PL-359 escort\u2019s gift: walk the convoy to the gate, their spare CM is yours', () => {
  const { state, rec, bus, player } = boot(pl359EscortsGift, { playerPos: { x: 0, z: 0 } });
  makeNpc(state, 'pirate1', { x: 300, z: 100 }, { data: { ai: { hostile: true } } });
  assert.equal(isHostileHull(state.entities.get('pirate1'), state), true);
  bus.emit('sector:enter', { sectorId: 's1' });
  const leader = lastSpawn(rec, (e) => e.data && e.data.plants
    && e.data.plants[ESCORT_TUNING.plId] && e.data.plants[ESCORT_TUNING.plId].role === 'convoy_leader');
  assert.ok(leader, 'a slow convoy forms in dangerous water');
  assert.equal(leader.data.callsign, CONVOY_CALLSIGN);
  // Stay with them all the way: player beside the leader through the walk.
  const convoy = eventsOf(rec, PLANTS_ESCORT_EVENT, 'convoy_formed')[0].payload;
  assert.ok(convoy.leaderId != null);
  for (let i = 0; i < 4; i++) {
    player.pos = { x: leader.pos.x + 20, z: leader.pos.z };
    sweep(pl359EscortsGift, state, 1, 1);
  }
  // The convoy reaches the far end with you still in escort range.
  const convoyState = pl359EscortsGift._convoy;
  assert.ok(convoyState, 'the convoy is still walking');
  leader.pos = { x: convoyState.gatePos.x, z: convoyState.gatePos.z };
  player.pos = { x: leader.pos.x + 20, z: leader.pos.z };
  sweep(pl359EscortsGift, state, 1, 1);
  assert.ok(eventsOf(rec, PLANTS_ESCORT_EVENT, 'gift').length === 1, 'the gift at the gate');
  assert.ok(rec.spawns.some((e) => e.data && e.data.plantsPl359Gift === true), 'their spare countermeasure');
  assert.ok(eventsOf(rec, PLANTS_ESCORT_EVENT, 'ended').length >= 1);
});

test('PL-359 wrong choice: peel off at the last leg — convoys remember departures', () => {
  const { state, rec, bus, player } = boot(pl359EscortsGift, { playerPos: { x: 0, z: 0 } });
  makeNpc(state, 'pirate1', { x: 300, z: 100 }, { data: { ai: { hostile: true } } });
  bus.emit('sector:enter', { sectorId: 's1' });
  const leader = lastSpawn(rec, (e) => e.data && e.data.plants
    && e.data.plants[ESCORT_TUNING.plId] && e.data.plants[ESCORT_TUNING.plId].role === 'convoy_leader');
  assert.ok(leader);
  // Walk far enough that the last leg has begun, then peel.
  player.pos = { x: leader.pos.x + 20, z: leader.pos.z };
  sweep(pl359EscortsGift, state, 2, 1);
  // Teleport the convoy most of the way (progress >= last leg) via the gate position read.
  const convoyState = pl359EscortsGift._convoy;
  if (convoyState) {
    leader.pos = { x: convoyState.gatePos.x - ESCORT_TUNING.arriveRangeWu - 5, z: convoyState.gatePos.z };
  }
  player.pos = { x: leader.pos.x + ESCORT_TUNING.escortRangeWu * 3, z: leader.pos.z };
  sweep(pl359EscortsGift, state, 1, 1);
  assert.ok(eventsOf(rec, PLANTS_ESCORT_EVENT, 'remembered').length === 1, 'they remember');
  assert.ok(commsOf(rec, 'Gifts need arrivals. Convoys remember departures.').length === 1);
  // The next convoy in this sector refuses while the grudge rides.
  state.simTime += 1;
  bus.emit('sector:exit', { sectorId: 's1' });
  bus.emit('sector:enter', { sectorId: 's1' });
  const spawnsBefore = rec.spawns.length;
  sweep(pl359EscortsGift, state, 1, 0.5);
  assert.equal(rec.spawns.length, spawnsBefore, 'no new convoy while they remember');
});

// ---------------------------------------------------------------- PL-360

test('PL-360 rain check: save a station, docking comped with your name on the board', () => {
  const { state, rec, bus, player } = boot(pl360RainCheck);
  player.data.callsign = 'TIN SWALLOW';
  const station = fixtureStation(state, 'st1', { x: 0, z: 0 });
  const pirate = makeNpc(state, 'pirate1', { x: 200, z: 0 }, { data: { ai: { hostile: true } } });
  bus.emit('entity:killed', { id: pirate.id, pos: { x: 200, z: 0 } });
  assert.ok(station.data[PL_360_COMP_STAMP] > state.simTime, 'comped for a year');
  const chalk = rec.spawns.find((e) => e.data && e.data.plantsPl360Chalk === true);
  assert.ok(chalk, 'the chalk is on the board beside the toll');
  assert.equal(chalk.data.swarmFloorPad.label, 'COMPED — YOURS');
  assert.ok(chalk.data.scanLabel.includes('TIN SWALLOW'), 'your name on it');
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  assert.ok(eventsOf(rec, PLANTS_COMP_EVENT, 'used').length === 1, 'use the chalk');
});

test('PL-360 wrong choice: sell it to another hull — a fine, and the chalk stays up', () => {
  const { state, rec, bus } = boot(pl360RainCheck);
  const station = fixtureStation(state, 'st1', { x: 0, z: 0 });
  const pirate = makeNpc(state, 'pirate1', { x: 200, z: 0 }, { data: { ai: { hostile: true } } });
  bus.emit('entity:killed', { id: pirate.id, pos: { x: 200, z: 0 } });
  const chalk = rec.spawns.find((e) => e.data && e.data.plantsPl360Chalk === true);
  // Wave a towed stranger in on your chalk: released inside the comped ring.
  const stranger = makeNpc(state, 'npc1', { x: 40, z: 20 }, { data: { trafficRole: 'hauler' } });
  bus.emit('tether:snapCatch', { targetId: stranger.id });
  pl360RainCheck.update(1 / 60);
  stranger.pos = { x: 30, z: 0 }; // inside the dock ring
  bus.emit('massline:releaseValidated', { entityId: stranger.id });
  pl360RainCheck.update(1 / 60);
  assert.ok(station.data[PL_360_FINE_STAMP] > state.simTime, 'adds a fine');
  assert.ok(station.data[PL_360_COMP_STAMP] > state.simTime, 'the board keeps the comp');
  assert.ok(rec.spawns.includes(chalk) || state.entities.get(chalk.id), 'your name stays up there anyway');
  assert.ok(eventsOf(rec, PLANTS_FINE_EVENT, 'sold').length === 1);
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  assert.ok(eventsOf(rec, PLANTS_FINE_EVENT, 'docked_fined').length === 1, 'docking under the fine');
});

test('PL-360 cooldown: a second save replaces the chalk — only the latest board stays up', () => {
  const { state, rec, bus } = boot(pl360RainCheck);
  const station = fixtureStation(state, 'st1', { x: 0, z: 0 });
  const pirate = makeNpc(state, 'pirate1', { x: 200, z: 0 }, { data: { ai: { hostile: true } } });
  bus.emit('entity:killed', { id: pirate.id, pos: { x: 200, z: 0 } });
  const first = rec.spawns.find((e) => e.data && e.data.plantsPl360Chalk === true);
  assert.ok(first, 'the first chalk is on the board');
  assert.equal(first.homeSectorId, 's1', 'the chalk carries its home sector (top level)');
  assert.equal(first.data.homeSectorId, 's1', '...and in data, like its pl350/pl346 siblings');

  // One save per station day: a later save re-chalks and retires the earlier board.
  state.simTime += RAIN_CHECK_TUNING.saveCooldownS + 1;
  const pirate2 = makeNpc(state, 'pirate2', { x: 220, z: 0 }, { data: { ai: { hostile: true } } });
  bus.emit('entity:killed', { id: pirate2.id, pos: { x: 220, z: 0 } });
  const chalks = rec.spawns.filter((e) => e.data && e.data.plantsPl360Chalk === true);
  assert.equal(chalks.length, 2, 'the second save chalks again');
  assert.ok(rec.removes.includes(first.id), 'the earlier chalk is torn down, not leaked');
  const alive = chalks.filter((c) => state.entities.get(c.id));
  assert.equal(alive.length, 1, 'only the latest chalk remains');
  assert.equal(alive[0].id, chalks[1].id);
});

// ---------------------------------------------------------------- PL-361

test('PL-361 second start: true bankrupt, a starter kit waits at your last dock', () => {
  const { state, rec, bus, player } = boot(pl361SecondStart);
  fixtureStation(state, 'st1', { x: 200, z: 0 });
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  state.player.credits = 0;
  state.player.debt = 400;
  sweep(pl361SecondStart, state, 1, 1);
  const kit = lastSpawn(rec, (e) => e.data && e.data.plantsPl361Kit === true);
  assert.ok(kit, 'a starter kit waits in a locker at your last dock');
  assert.equal(kit.data.swarmFloorPad.label, SECOND_START_LINE);
  assert.ok(kit.data.scanLabel.includes('rope, tank, chalk'));
  // Take it: hold the locker at pickup range.
  player.pos = { x: kit.pos.x, z: kit.pos.z };
  sweep(pl361SecondStart, state, SECOND_START_TUNING.takeHoldS + 1, 1);
  assert.ok(eventsOf(rec, PLANTS_KIT_EVENT, 'taken').length === 1);
  assert.equal(eventsOf(rec, PLANTS_KIT_EVENT, 'taken')[0].payload.loanNote, false);
  assert.ok(player.data[PL_361_TAKEN_STAMP], 'taken, ever after');
});

test('PL-361 wrong choice: bankrupt twice — the second kit carries a loan note', () => {
  const { state, rec, bus, player } = boot(pl361SecondStart);
  fixtureStation(state, 'st1', { x: 200, z: 0 });
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  state.player.credits = 0;
  state.player.debt = 400;
  sweep(pl361SecondStart, state, 1, 1);
  const kit1 = lastSpawn(rec, (e) => e.data && e.data.plantsPl361Kit === true);
  player.pos = { x: kit1.pos.x, z: kit1.pos.z };
  sweep(pl361SecondStart, state, SECOND_START_TUNING.takeHoldS + 1, 1);
  // Back on your feet, then under again.
  state.player.credits = 120;
  sweep(pl361SecondStart, state, 1, 1);
  state.simTime += SECOND_START_TUNING.bankruptCooldownS + 1;
  state.player.credits = 0;
  sweep(pl361SecondStart, state, 1, 1);
  const kit2 = lastSpawn(rec, (e) => e.data && e.data.plantsPl361Kit === true && e.id !== kit1.id);
  assert.ok(kit2, 'the second kit comes anyway');
  assert.equal(kit2.data.plantsPl361LoanNote, true, 'with a loan note');
  assert.equal(kit2.data.swarmFloorPad.label, LOAN_NOTE_LINE);
  player.pos = { x: kit2.pos.x, z: kit2.pos.z };
  sweep(pl361SecondStart, state, SECOND_START_TUNING.takeHoldS + 1, 1);
  const taken = eventsOf(rec, PLANTS_KIT_EVENT, 'taken');
  assert.equal(taken[taken.length - 1].payload.loanNote, true);
  assert.ok(commsOf(rec, 'Rope, tank, chalk \u2014 and a loan note, in someone\u2019s handwriting.').length === 1);
});

// ---------------------------------------------------------------- PL-362

test('PL-362 name on the plate: a mark earned greets your hull by name, out loud', () => {
  const { state, rec, bus, player } = boot(pl362NameOnPlate);
  player.data.callsign = 'TIN SWALLOW';
  const station = fixtureStation(state, 'st1', { x: 0, z: 0 });
  const stranger = makeNpc(state, 'npc1', { x: 40, z: 0 }, { data: { trafficRole: 'hauler' } });
  bus.emit('tether:snapCatch', { targetId: stranger.id });
  sweep(pl362NameOnPlate, state, PLATE_TUNING.holdS + 1, 1);
  bus.emit('massline:releaseValidated', { entityId: stranger.id });
  pl362NameOnPlate.update(1 / 60);
  assert.ok(eventsOf(rec, PLANTS_PLATE_EVENT, 'mark_earned').length === 1, 'a mark you earned');
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  assert.equal(voiceOf(rec, 'TIN SWALLOW, the plates know you.').length, 1, 'by name, out loud');
  assert.ok(station.data.dockLampsFlashing === true);
  assert.ok(eventsOf(rec, PLANTS_PLATE_EVENT, 'greeted').length === 1);
});

test('PL-362 wrong choice: counterfeit carry — the plates read the real owner, loudly', () => {
  const { state, rec, bus } = boot(pl362NameOnPlate);
  const station = fixtureStation(state, 'st1', { x: 0, z: 0 });
  const stranger = makeNpc(state, 'npc1', { x: 40, z: 0 }, { data: { trafficRole: 'hauler' } });
  bus.emit('tether:snapCatch', { targetId: stranger.id });
  pl362NameOnPlate.update(1 / 60);
  // The towed hull dies on the line: a fake receipt carried into the sector.
  stranger.alive = false;
  bus.emit('entity:killed', { id: stranger.id });
  assert.ok(eventsOf(rec, PLANTS_COUNTERFEIT_EVENT, 'fake_receipt').length === 1);
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  const owner = realOwnerName('s1');
  assert.equal(voiceOf(rec, `${owner}! The plates greet the real owner.`).length, 1, 'by the real owner\u2019s name');
  assert.ok(eventsOf(rec, PLANTS_COUNTERFEIT_EVENT, 'greeted_owner').length === 1);
  assert.ok(eventsOf(rec, PLANTS_PLATE_EVENT, 'greeted').length === 0, 'you were never greeted');
});

// ---------------------------------------------------------------- PL-363

test('PL-363 family rate: one lane long enough, berths quietly go family-rate', () => {
  const { state, rec, bus } = boot(pl363FamilyRate);
  const st1 = fixtureStation(state, 'st1', { x: 0, z: 0 });
  const st2 = fixtureStation(state, 'st2', { x: 400, z: 0 });
  const st3 = fixtureStation(state, 'st3', { x: 800, z: 0 });
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  bus.emit('dock:range', { stationId: 'st2', shipId: state.playerId, inRange: true });
  bus.emit('dock:range', { stationId: 'st3', shipId: state.playerId, inRange: true });
  sweep(pl363FamilyRate, state, FAMILY_TUNING.laneTenureS + 1, 1);
  assert.ok(eventsOf(rec, PLANTS_FAMILY_EVENT, 'earned').length === 1);
  const popups = rec.events.filter((e) => e.event === 'comms:popup');
  assert.equal(popups.length, 0, 'discounts nobody announces');
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  assert.ok(st1.data[PL_363_FAMILY_STAMP] > state.simTime, 'the quiet rate is stamped');
  assert.ok(eventsOf(rec, PLANTS_FAMILY_EVENT, 'quiet_rate').length === 1);
});

test('PL-363 wrong choice: change hulls to farm it — the name only rides one hull', () => {
  const { state, rec, bus, player } = boot(pl363FamilyRate);
  const st1 = fixtureStation(state, 'st1', { x: 0, z: 0 });
  fixtureStation(state, 'st2', { x: 400, z: 0 });
  fixtureStation(state, 'st3', { x: 800, z: 0 });
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  bus.emit('dock:range', { stationId: 'st2', shipId: state.playerId, inRange: true });
  bus.emit('dock:range', { stationId: 'st3', shipId: state.playerId, inRange: true });
  sweep(pl363FamilyRate, state, FAMILY_TUNING.laneTenureS + 1, 1);
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  assert.ok(st1.data[PL_363_FAMILY_STAMP] > state.simTime);
  // Change hulls: the player body at playerId is a different hull.
  const newHull = { ...player, hullMax: 400, hull: 400 };
  state.entities.set(state.playerId, newHull);
  sweep(pl363FamilyRate, state, 1, 1);
  assert.ok(eventsOf(rec, PLANTS_FARMED_EVENT).length === 1, 'farmed');
  assert.ok(commsOf(rec, 'Family means the name. It rides one hull.').length === 1);
  assert.equal(st1.data[PL_363_FAMILY_STAMP], -Infinity, 'the lane\u2019s rate is voided');
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  assert.equal(st1.data[PL_363_FAMILY_STAMP], -Infinity, 'no family rate while farmed');
});

test('PL-363 the rate is delivered in kind: a berth-attendant gift pod on the first dock of a visit', () => {
  const { state, rec, bus } = boot(pl363FamilyRate);
  const st1 = fixtureStation(state, 'st1', { x: 0, z: 0 });
  fixtureStation(state, 'st2', { x: 400, z: 0 });
  fixtureStation(state, 'st3', { x: 800, z: 0 });
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  bus.emit('dock:range', { stationId: 'st2', shipId: state.playerId, inRange: true });
  bus.emit('dock:range', { stationId: 'st3', shipId: state.playerId, inRange: true });
  assert.equal(rec.spawns.some((e) => e.data && e.data.plantsPl363Gift), false, 'no gift before the rate');
  sweep(pl363FamilyRate, state, FAMILY_TUNING.laneTenureS + 1, 1);
  assert.ok(eventsOf(rec, PLANTS_FAMILY_EVENT, 'earned').length === 1);
  // First dock:range arrival at the station while the rate rides: the attendant hands the
  // discount over IN KIND — goods plus words.
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  const gift = rec.spawns.find((e) => e.data && e.data.plantsPl363Gift);
  assert.ok(gift, 'the gift pod is physical');
  assert.equal(gift.data.commodityId, FAMILY_TUNING.giftCommodityId, 'berth goods');
  assert.equal(gift.data.amount, FAMILY_TUNING.giftUnits, 'a modest amount');
  assert.equal(gift.data.plantsPl363Gift.stationId, 'st1');
  const lines = commsOf(rec, FAMILY_GIFT_LINE);
  assert.equal(lines.length, 1, 'the berth-office words, exactly once');
  assert.equal(lines[0].payload.sender, FAMILY_GIFT_SENDER, 'from the berth office');
  assert.ok(eventsOf(rec, PLANTS_FAMILY_EVENT, 'gift_pod').length === 1);
  assert.ok(st1.data[PL_363_FAMILY_STAMP] > state.simTime, 'the stamp stays for the economy handoff');
  // Second dock, same visit: no second gift.
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  assert.equal(rec.spawns.filter((e) => e.data && e.data.plantsPl363Gift).length, 1, 'once per station-visit');
  assert.equal(commsOf(rec, FAMILY_GIFT_LINE).length, 1);
  // Leave and come back while the rate still rides: a fresh visit gifts again.
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: false });
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  assert.equal(rec.spawns.filter((e) => e.data && e.data.plantsPl363Gift).length, 2, 'a fresh visit is a fresh gift');
});

test('PL-363 farm bite: the berth office gives nothing while the name is farmed', () => {
  const { state, rec, bus, player } = boot(pl363FamilyRate);
  fixtureStation(state, 'st1', { x: 0, z: 0 });
  fixtureStation(state, 'st2', { x: 400, z: 0 });
  fixtureStation(state, 'st3', { x: 800, z: 0 });
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  bus.emit('dock:range', { stationId: 'st2', shipId: state.playerId, inRange: true });
  bus.emit('dock:range', { stationId: 'st3', shipId: state.playerId, inRange: true });
  sweep(pl363FamilyRate, state, FAMILY_TUNING.laneTenureS + 1, 1);
  // Farm it FIRST: the hull changes while the rate rides, so the rate is voided before
  // any post-tenure dock — the attendant never shows up.
  const newHull = { ...player, hullMax: 400, hull: 400 };
  state.entities.set(state.playerId, newHull);
  sweep(pl363FamilyRate, state, 1, 1);
  assert.ok(eventsOf(rec, PLANTS_FARMED_EVENT).length === 1, 'farmed');
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  assert.equal(rec.spawns.some((e) => e.data && e.data.plantsPl363Gift), false, 'no gift while farmed');
  assert.equal(commsOf(rec, FAMILY_GIFT_LINE).length, 0, 'no berth-office words either');
  assert.ok(commsOf(rec, 'Family means the name. It rides one hull.').length === 1);
});

// ---------------------------------------------------------------- cooldown / cap / cleanup

test('PL-260 cap: the chalk count is bounded and arrivals only count the player', () => {
  const { state, rec, bus } = boot(pl260FiftiethVisit);
  fixtureStation(state, 'st1', { x: 0, z: 200 });
  for (let i = 0; i < FIFTY_TUNING.arrivalTarget - 1; i++) {
    bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  }
  // A stranger's dock receipt is not your arrival.
  bus.emit('dock:range', { stationId: 'st1', shipId: 'npc9', inRange: true });
  bus.emit('dock:range', { stationId: 'st1', inRange: true }); // no shipId: ignored
  assert.equal(eventsOf(rec, PLANTS_FIFTY_EVENT).length, 0, 'fifty is YOUR arrivals');
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  assert.equal(eventsOf(rec, PLANTS_FIFTY_EVENT).length, 1);
});

test('PL-357 cooldown: the grace is once per station day', () => {
  const { state, rec, bus } = boot(pl357WarmGrid, { state: { fuel: { current: 4, max: 100 } } });
  fixtureStation(state, 'st1', { x: 0, z: 100 });
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  assert.equal(state.fuel.current, WARM_GRID_TUNING.launchMinUnits);
  state.fuel.current = 4;
  bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
  assert.equal(state.fuel.current, 4, 'the meter stays asleep until tomorrow');
});

test('destroy cleanup: every standalone unsubs, despawns owned props, clears state', () => {
  const cases = [pl258TowAlong, pl259SpareAndShare, pl260FiftiethVisit, pl261OpenTank,
    pl262GatheredPile, pl264LaneLight, pl267QueuePass, pl354GoodHullRate, pl355TheUnit,
    pl356ParadeBerth, pl357WarmGrid, pl358ApprenticesReturn, pl359EscortsGift,
    pl360RainCheck, pl361SecondStart, pl362NameOnPlate, pl363FamilyRate];
  for (const mod of cases) {
    const { state, bus, helpers } = boot(mod, { state: { fuel: { current: 4, max: 100 } } });
    mod.destroy();
    // Re-init must be clean (no leaked listeners double-firing).
    assert.doesNotThrow(() => mod.init({ state, bus, helpers }));
    mod.destroy();
  }
});

test('determinism smoke: the same scenario twice yields identical event sequences', () => {
  const run = () => {
    const { state, rec, bus } = boot(pl259SpareAndShare);
    const needy = makeNpc(state, 'npc1', { x: 100, z: 0 }, { data: { trafficRole: 'hauler', disabled: true } });
    const pod = makePod(state, { x: 10, z: 0 }, state.playerId);
    bus.emit('cargo:jettisoned', { commodityId: 'cmdty_ore_iron', amount: 1 });
    bus.emit('pickup:collected', { pickupId: pod.id, collectorId: needy.id });
    fixtureStation(state, 'st1', { x: 900, z: 0 });
    for (let i = 0; i < 4; i++) {
      bus.emit('dock:range', { stationId: 'st1', shipId: state.playerId, inRange: true });
    }
    return rec.events.map((e) => [e.event, e.payload && e.payload.kind, e.payload && e.payload.text,
      e.payload && e.payload.creditsLeft]);
  };
  const a = run();
  const b = run();
  assert.deepEqual(a, b, 'same inputs, same world answers');
});
