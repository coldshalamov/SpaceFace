// Chance-meeting plants (design/program/INFERENCE_PLANTS.md section D) —
// PL-108 109 110 131 132 133 156 157 158 159 184 206 207 208 220 221 249.
//
// Each module is tested on its own seams: a real createBus, a minimal flight state, fake
// helpers that record spawns/removes/voice, and event payloads matching the canonical
// emitters (physics:impact, tether:snapCatch, pickup:collected, dock:range, entity:killed,
// npcjobs:lotClaimed, sector:enter/exit). Determinism smoke: the same scenario twice
// yields identical event sequences. No DOM, no Three.js, no Math.random.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { hash32 } from '../src/core/rng.js';
import { spawnJettisonedCargoPod } from '../src/systems/lootShards.js';

import {
  MOVING_HOUSE_EVENT, MOVING_HOUSE_TUNING, MOVING_HOUSE_BARK, MOVING_HOUSE_CALLSIGN,
  movingHouseVerdict, movingHousePlant,
} from '../src/systems/plants/movingHousePlant.js';
import {
  OWN_FAULT_EVENT, OWN_FAULT_TRADE_EVENT, OWN_FAULT_HELD_EVENT,
  OWN_FAULT_TUNING, OWN_FAULT_BARK, OWN_FAULT_CALLSIGN,
  ownFaultVerdict, ownFaultPlant,
} from '../src/systems/plants/ownFaultPlant.js';
import {
  STILL_EVEN_EVENT, STILL_EVEN_SYNC_EVENT, STILL_EVEN_JOBS_DONE_EVENT,
  STILL_EVEN_TUNING, STILL_EVEN_HAIL, STILL_EVEN_CALLSIGN, STILL_EVEN_JOBS_LINE,
  isHeadOnPass, isShove, stillEvenPlant,
} from '../src/systems/plants/stillEvenPlant.js';
import {
  BROKEN_TOLL_EVENT, BROKEN_TOLL_GOSSIP_EVENT, BROKEN_TOLL_TUNING,
  BROKEN_TOLL_PLEA, BROKEN_TOLL_CALLSIGN, BROKEN_TOLL_GOSSIP_LINE,
  isFlyingThrough, brokenTollPlant,
} from '../src/systems/plants/brokenTollPlant.js';
import {
  DARK_STRETCH_EVENT, DARK_STRETCH_TUNING, DARK_STRETCH_HAIL,
  DARK_STRETCH_FAR_LINE, DARK_STRETCH_CALLSIGN, isEscorting, darkStretchPlant,
} from '../src/systems/plants/darkStretchPlant.js';
import {
  SHADOW_PILOT_EVENT, SHADOW_PILOT_ECHO_EVENT, SHADOW_PILOT_TUNING,
  SHADOW_PILOT_PARK_LINE, SHADOW_PILOT_ECHO_GOOD, SHADOW_PILOT_ECHO_MANIAC,
  shadowPilotStyle, shadowPilotPlant,
} from '../src/systems/plants/shadowPilotPlant.js';
import {
  TICKING_CRATE_EVENT, TICKING_CRATE_TOWN_EVENT, TICKING_CRATE_TUNING,
  TICKING_CRATE_HAIL, TICKING_CRATE_TRUE_LINE, TICKING_CRATE_WRONG_LINE,
  TICKING_CRATE_CALLSIGN, tickingCrateVerdict, tickingCratePlant,
} from '../src/systems/plants/tickingCratePlant.js';
import {
  EMPTY_BERTH_EVENT, EMPTY_BERTH_TUNING, emptyBerthSlotPoint, emptyBerthPlant,
} from '../src/systems/plants/emptyBerthPlant.js';
import {
  CHASED_THIEF_EVENT, CHASED_THIEF_CONCORD_EVENT, CHASED_THIEF_TUNING,
  CHASED_THIEF_OBLIGED, CHASED_THIEF_CONCORD_LINE, midpointOf, chasedThiefPlant,
} from '../src/systems/plants/chasedThiefPlant.js';
import {
  TANKER_WAKE_EVENT, TANKER_WAKE_TUNING, tankerTowImpulse, tankerWakePlant,
} from '../src/systems/plants/tankerWakePlant.js';
import {
  OUTRIDER_EVENT, OUTRIDER_TUNING, orbitPoint, outriderCircleVerdict, outriderPlant,
} from '../src/systems/plants/outriderPlant.js';
import {
  MEASURING_HULL_EVENT, MEASURING_HULL_TUNING, pacePoint, isConfronting, measuringHullPlant,
} from '../src/systems/plants/measuringHullPlant.js';
import {
  WELDERS_SPARKS_EVENT, WELDERS_SPARKS_TUNING, WELDERS_SPARKS_ENGRAVED_LINE,
  WELDERS_SPARKS_MENDED_LINE, WELDERS_SPARKS_CALLSIGN, classifyStashPod, weldersSparksPlant,
} from '../src/systems/plants/weldersSparksPlant.js';
import {
  SAME_TIME_TOMORROW_EVENT, SAME_TIME_TOMORROW_TUNING, SAME_TIME_TOMORROW_LATE_LINE,
  appointmentWindow, isGivingWay, sameTimeTomorrowPlant,
} from '../src/systems/plants/sameTimeTomorrowPlant.js';
import {
  STALLED_STRING_EVENT, STALLED_STRING_TUNING, isContainerClear, stalledStringPlant,
} from '../src/systems/plants/stalledStringPlant.js';
import {
  WAITING_LINE_EVENT, WAITING_LINE_TUNING, segmentCrossesLine, waitingLinePlant,
} from '../src/systems/plants/waitingLinePlant.js';
import {
  DEAD_STICK_EVENT, DEAD_STICK_TUNING, DEAD_STICK_WAVE_OFF_LINE,
  DEAD_STICK_CALLSIGN, isEscortingDeadStick, deadStickPlant,
} from '../src/systems/plants/deadStickPlant.js';

// ---- harness --------------------------------------------------------------------------------

let idSeq = 100;

function makeState(opts = {}) {
  const entities = new Map();
  const state = {
    mode: 'flight',
    simTime: 300, // dayT 300 on a 600 s day -> hour 12 (PL-208 appointments)
    tick: 6000,
    playerId: 'p1',
    entities,
    entityIndex: { stations: [] },
    world: { currentSectorId: 's1' },
    meta: { seed: 1 },
    entityList: [],
    ...opts,
  };
  state.entities = entities;
  return state;
}

function makePlayer(state, pos = { x: 0, z: 0 }, vel = { x: 0, z: 0 }) {
  const player = {
    id: state.playerId, alive: true, type: 'ship', isPlayer: true,
    pos: { ...pos }, vel: { ...vel }, rot: 0, radius: 6, mass: 12, data: {},
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

/** First seed whose pl<id> spawn roll passes (or fails) with the module's own chance. */
function seedWithRoll(plId, wantPass, chancePct) {
  for (let seed = 1; seed < 50000; seed++) {
    const pass = hash32(seed, 's1', plId, 'spawn') % 100 < chancePct;
    if (pass === wantPass) return seed;
  }
  throw new Error(`no seed found for ${plId} wantPass=${wantPass}`);
}

function enterSector(bus, sectorId = 's1') {
  bus.emit('sector:enter', { sectorId });
}

function sweep(mod, state, steps = 1, dt = 1) {
  for (let i = 0; i < steps; i++) {
    state.simTime += dt;
    state.tick += Math.round(dt * 60);
    mod.update(dt);
  }
}

function spawnedBy(rec, plId, role = null) {
  return rec.spawns.filter((e) => e.data && e.data.plants && e.data.plants[plId]
    && (role == null || e.data.plants[plId].role === role));
}

function eventsOf(rec, name, kind = null) {
  return rec.events.filter((e) => e.event === name && (kind == null || (e.payload && e.payload.kind === kind)));
}

function commsOf(rec, text) {
  return rec.events.filter((e) => e.event === 'comms:popup' && e.payload && e.payload.text === text);
}

function voiceOf(rec, text) {
  return rec.voice.filter((v) => v.text === text);
}

function fixtureStation(state, id, pos, extraData = {}) {
  const st = { id, type: 'station', alive: true, pos: { ...pos }, radius: 72, data: { stationId: id, ...extraData } };
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

// Every module: the shared family contract.
test('family contract: frozen tuning with memoryCap, standalone system shape', () => {
  const families = [
    [movingHousePlant, MOVING_HOUSE_TUNING], [ownFaultPlant, OWN_FAULT_TUNING],
    [stillEvenPlant, STILL_EVEN_TUNING], [brokenTollPlant, BROKEN_TOLL_TUNING],
    [darkStretchPlant, DARK_STRETCH_TUNING], [shadowPilotPlant, SHADOW_PILOT_TUNING],
    [tickingCratePlant, TICKING_CRATE_TUNING], [emptyBerthPlant, EMPTY_BERTH_TUNING],
    [chasedThiefPlant, CHASED_THIEF_TUNING], [tankerWakePlant, TANKER_WAKE_TUNING],
    [outriderPlant, OUTRIDER_TUNING], [measuringHullPlant, MEASURING_HULL_TUNING],
    [weldersSparksPlant, WELDERS_SPARKS_TUNING], [sameTimeTomorrowPlant, SAME_TIME_TOMORROW_TUNING],
    [stalledStringPlant, STALLED_STRING_TUNING], [waitingLinePlant, WAITING_LINE_TUNING],
    [deadStickPlant, DEAD_STICK_TUNING],
  ];
  for (const [mod, tuning] of families) {
    assert.equal(typeof mod.init, 'function', `${mod.name}: init`);
    assert.equal(typeof mod.update, 'function', `${mod.name}: update`);
    assert.equal(typeof mod.destroy, 'function', `${mod.name}: destroy`);
    assert.match(mod.name, /^plants\d+$/, `${mod.name}: registry name`);
    assert.equal(Object.isFrozen(tuning), true, `${mod.name}: tuning frozen`);
    assert.ok(Number.isInteger(tuning.memoryCap) && tuning.memoryCap > 0, `${mod.name}: memoryCap`);
  }
});

test('family contract: destroy despawns owned bodies and detaches listeners', () => {
  for (const mod of [movingHousePlant, brokenTollPlant, darkStretchPlant, stalledStringPlant]) {
    const state = makeState({ meta: { seed: seedWithRoll(mod.name === movingHousePlant.name ? 'pl108' : mod.name === brokenTollPlant.name ? 'pl131' : mod.name === darkStretchPlant.name ? 'pl132' : 'pl220', true, mod.name === movingHousePlant.name ? MOVING_HOUSE_TUNING.spawnChancePct : mod.name === brokenTollPlant.name ? BROKEN_TOLL_TUNING.spawnChancePct : mod.name === darkStretchPlant.name ? DARK_STRETCH_TUNING.spawnChancePct : STALLED_STRING_TUNING.spawnChancePct) } });
    makePlayer(state);
    const { rec, bus, helpers } = makeHarness(state);
    mod.init({ state, bus, helpers });
    enterSector(bus);
    const spawned = rec.spawns.length;
    assert.ok(spawned > 0, `${mod.name}: encounter spawned for destroy test`);
    mod.destroy();
    assert.equal(rec.removes.length >= spawned, true, `${mod.name}: destroy despawns`);
    const after = rec.spawns.length;
    enterSector(bus); // listeners are gone: no re-spawn
    assert.equal(rec.spawns.length, after, `${mod.name}: no spawns after destroy`);
  }
});

test('family contract: nothing spawns or acts while docked', () => {
  const state = makeState({ mode: 'docked', meta: { seed: seedWithRoll('pl132', true, DARK_STRETCH_TUNING.spawnChancePct) } });
  makePlayer(state);
  const { rec, bus, helpers } = makeHarness(state);
  darkStretchPlant.init({ state, bus, helpers });
  enterSector(bus);
  assert.equal(rec.spawns.length, 0, 'docked sector:enter spawns nothing');
  sweep(darkStretchPlant, state, 3);
  assert.equal(rec.spawns.length, 0, 'docked update spawns nothing');
  assert.equal(eventsOf(rec, DARK_STRETCH_EVENT).length, 0);
});

// ---- PL-108 Moving house --------------------------------------------------------------------

test('PL-108: tug barks the authored line when the player nears the loose chair', () => {
  const state = makeState({ meta: { seed: seedWithRoll('pl108', true, MOVING_HOUSE_TUNING.spawnChancePct) } });
  const player = makePlayer(state);
  const { rec, bus, helpers } = makeHarness(state);
  movingHousePlant.init({ state, bus, helpers });
  enterSector(bus);
  const tug = spawnedBy(rec, 'pl108', 'tug')[0];
  const chair = spawnedBy(rec, 'pl108', 'chair')[0];
  const rack = spawnedBy(rec, 'pl108', 'rack');
  assert.ok(tug && chair, 'tug and chair spawn');
  assert.equal(rack.length, MOVING_HOUSE_TUNING.rackPods, 'rack pods spawn');
  assert.equal(chair.data.masslineTetherable, true, 'chair is tetherable');

  sweep(movingHousePlant, state); // too far: no bark
  assert.equal(voiceOf(rec, MOVING_HOUSE_BARK).length, 0, 'no bark out of range');
  player.pos = { x: chair.pos.x + 20, z: chair.pos.z };
  sweep(movingHousePlant, state);
  sweep(movingHousePlant, state); // cooldown: still one bark
  assert.equal(voiceOf(rec, MOVING_HOUSE_BARK).length, 1, 'bark exactly once');
  assert.equal(voiceOf(rec, MOVING_HOUSE_BARK)[0].text, MOVING_HOUSE_BARK);
  assert.equal(eventsOf(rec, MOVING_HOUSE_EVENT, 'barked').length, 1);
});

test('PL-108: keeping the chair is the kind resolution; yanking the rack off under tether starts the radio chase', () => {
  const state = makeState({ meta: { seed: seedWithRoll('pl108', true, MOVING_HOUSE_TUNING.spawnChancePct) } });
  makePlayer(state);
  const { rec, bus, helpers } = makeHarness(state);
  movingHousePlant.init({ state, bus, helpers });
  enterSector(bus);
  const chair = spawnedBy(rec, 'pl108', 'chair')[0];
  bus.emit('pickup:collected', { pickupId: chair.id, collectorId: 'p1', pos: { ...chair.pos } });
  assert.equal(eventsOf(rec, MOVING_HOUSE_EVENT, 'kept_chair').length, 1, 'chair kept');
  assert.equal(eventsOf(rec, MOVING_HOUSE_EVENT, 'rack_stripped').length, 0, 'no chase for the chair');

  // Fresh sector: strip the rack this time — pods taken under tether (real snap-catches).
  enterSector(bus, 's1');
  const rack = spawnedBy(rec, 'pl108', 'rack').slice(-MOVING_HOUSE_TUNING.rackPods); // the live rack
  const tug = spawnedBy(rec, 'pl108', 'tug').at(-1);
  bus.emit('tether:snapCatch', { targetId: rack[0].id });
  assert.equal(eventsOf(rec, MOVING_HOUSE_EVENT, 'rack_stripped').length, 0, 'one rack pod is not a strip');
  bus.emit('tether:snapCatch', { targetId: rack[1].id });
  assert.equal(eventsOf(rec, MOVING_HOUSE_EVENT, 'rack_stripped').length, 1, 'two tethered rack pods strip the rack');
  assert.ok(rec.removes.includes(tug.id), 'the tug departs on a strip');
  // A loose pickup of a rack pod is not the verb: only the tethered yank counts.
  enterSector(bus, 's1');
  const rack2 = spawnedBy(rec, 'pl108', 'rack').slice(-MOVING_HOUSE_TUNING.rackPods);
  bus.emit('pickup:collected', { pickupId: rack2[0].id, collectorId: 'p1', pos: { x: 0, z: 0 } });
  bus.emit('pickup:collected', { pickupId: rack2[1].id, collectorId: 'p1', pos: { x: 0, z: 0 } });
  assert.equal(eventsOf(rec, MOVING_HOUSE_EVENT, 'rack_stripped').length, 1, 'pickups do not strip the rack');

  // The chase is radio across two later sectors, once each.
  enterSector(bus, 's2');
  assert.equal(commsOf(rec, 'Radio: the loose chair hears about it.').length, 1, 'sad radio in s2');
  enterSector(bus, 's3');
  assert.equal(commsOf(rec, 'Radio: the loose chair hears about it.').length, 2, 'sad radio in s3');
  enterSector(bus, 's4');
  assert.equal(commsOf(rec, 'Radio: the loose chair hears about it.').length, 2, 'chase ends after two sectors');
});

test('PL-108: verdict is pure and pods TTL-despawn', () => {
  assert.equal(movingHouseVerdict({ chairTaken: false, rackTakenCount: 0 }), 'idle');
  assert.equal(movingHouseVerdict({ chairTaken: true, rackTakenCount: 0 }), 'kept');
  assert.equal(movingHouseVerdict({ chairTaken: true, rackTakenCount: 1 }), 'kept');
  assert.equal(movingHouseVerdict({ chairTaken: false, rackTakenCount: 2 }), 'stripped');

  const state = makeState({ simTime: 0, meta: { seed: seedWithRoll('pl108', true, MOVING_HOUSE_TUNING.spawnChancePct) } });
  makePlayer(state);
  const { rec, bus, helpers } = makeHarness(state);
  movingHousePlant.init({ state, bus, helpers });
  enterSector(bus);
  const spawned = rec.spawns.map((e) => e.id);
  sweep(movingHousePlant, state, 1, MOVING_HOUSE_TUNING.strangerTtlS + 1);
  for (const id of spawned) assert.ok(rec.removes.includes(id), `TTL despawn of ${id}`);
});

test('PL-108: no encounter without the seeded roll', () => {
  const state = makeState({ meta: { seed: seedWithRoll('pl108', false, MOVING_HOUSE_TUNING.spawnChancePct) } });
  makePlayer(state);
  const { rec, bus, helpers } = makeHarness(state);
  movingHousePlant.init({ state, bus, helpers });
  enterSector(bus);
  assert.equal(rec.spawns.length, 0, 'failed roll: nothing spawns');
});

// ---- PL-109 His own fault -------------------------------------------------------------------

function pl109Setup(seedOverride = null) {
  const state = makeState({ meta: { seed: seedOverride ?? seedWithRoll('pl109', true, OWN_FAULT_TUNING.spawnChancePct) } });
  const player = makePlayer(state);
  const h = makeHarness(state);
  ownFaultPlant.init({ state, bus: h.bus, helpers: h.helpers });
  enterSector(h.bus);
  const hotshot = spawnedBy(h.rec, 'pl109', 'hotshot')[0];
  return { state, player, ...h, hotshot };
}

test('PL-109: the hotshot arrives already boosting past; the clip is a real impact and the tumble barks the authored line', () => {
  const { state, rec, bus, hotshot } = pl109Setup();
  assert.equal(hotshot.data.intent?.boost, true, 'boost past on a leased intent from spawn');
  sweep(ownFaultPlant, state);
  bus.emit('physics:impact', { aId: 'p1', bId: hotshot.id, impulse: 5, tick: state.tick });
  assert.equal(voiceOf(rec, OWN_FAULT_BARK).length, 0, 'a nudge is not a clip');
  bus.emit('physics:impact', { aId: 'p1', bId: hotshot.id, impulse: 100, tick: state.tick });
  assert.equal(voiceOf(rec, OWN_FAULT_BARK).length, 1, 'bark exactly once');
  assert.equal(voiceOf(rec, OWN_FAULT_BARK)[0].text, OWN_FAULT_BARK);
  assert.equal(eventsOf(rec, OWN_FAULT_EVENT, 'clipped').length, 1);
  assert.equal(spawnedBy(rec, 'pl109', 'spill').length, OWN_FAULT_TUNING.spillPods, 'spill pods spawned');
  assert.ok(hotshot.data.intent, 'tumble flies on a leased intent');
  assert.equal(hotshot.data.lampsFlashing, true, 'tumble lamp flash');
});

test('PL-109: towing them upright for towHoldS trades a pod', () => {
  const { state, player, rec, bus, hotshot } = pl109Setup();
  player.pos = { x: hotshot.pos.x + 30, z: hotshot.pos.z };
  bus.emit('physics:impact', { aId: 'p1', bId: hotshot.id, impulse: 100, tick: state.tick });
  bus.emit('tether:snapCatch', { targetId: hotshot.id });
  sweep(ownFaultPlant, state, 2); // 2 s: hold not yet satisfied
  assert.equal(eventsOf(rec, OWN_FAULT_TRADE_EVENT).length, 0, 'hold in progress');
  sweep(ownFaultPlant, state, 3); // past towHoldS
  const trades = eventsOf(rec, OWN_FAULT_TRADE_EVENT);
  assert.equal(trades.length, 1, 'one trade');
  assert.ok(trades[0].payload.podId, 'trade tips a real pod');
  assert.ok(spawnedBy(rec, 'pl109', 'trade').length === 1);
});

test('PL-109: stripping the spill while watched holds the player at the next gate', () => {
  const { state, player, rec, bus, hotshot } = pl109Setup();
  bus.emit('physics:impact', { aId: 'p1', bId: hotshot.id, impulse: 100, tick: state.tick });
  const spill = spawnedBy(rec, 'pl109', 'spill')[0];
  bus.emit('pickup:collected', { pickupId: spill.id, collectorId: 'p1', pos: { ...hotshot.pos } });
  assert.equal(eventsOf(rec, OWN_FAULT_EVENT, 'stripped_watched').length, 1, 'strip seen');
  fixtureStation(state, 'gate1', { x: player.pos.x + 100, z: player.pos.z }, { isGate: true });
  sweep(ownFaultPlant, state);
  assert.equal(eventsOf(rec, OWN_FAULT_HELD_EVENT).length, 1, 'held at the gate');
  assert.equal(commsOf(rec, 'Gate control: hold position, pilot.').length, 1);
  sweep(ownFaultPlant, state, 2); // gate hold cooldown
  assert.equal(eventsOf(rec, OWN_FAULT_HELD_EVENT).length, 1, 'one hold per cooldown window');
  state.simTime += OWN_FAULT_TUNING.gateHoldCooldownS;
  sweep(ownFaultPlant, state);
  assert.equal(eventsOf(rec, OWN_FAULT_HELD_EVENT).length, 2, 'holds again after cooldown');
});

test('PL-109: verdict is pure; far tow drops; dead hotshot closes the meeting', () => {
  assert.equal(ownFaultVerdict({ towSeconds: 0, strippedPods: 0, open: true }), 'open');
  assert.equal(ownFaultVerdict({ towSeconds: OWN_FAULT_TUNING.towHoldS, strippedPods: 0, open: true }), 'traded');
  assert.equal(ownFaultVerdict({ towSeconds: 0, strippedPods: 1, open: true }), 'stripped');
  assert.equal(ownFaultVerdict({ towSeconds: 0, strippedPods: 0, open: false }), 'closed');

  const { state, player, rec, bus, hotshot } = pl109Setup();
  player.pos = { x: 2000, z: 2000 };
  bus.emit('physics:impact', { aId: 'p1', bId: hotshot.id, impulse: 100, tick: state.tick });
  bus.emit('tether:snapCatch', { targetId: hotshot.id });
  sweep(ownFaultPlant, state, 2);
  assert.equal(eventsOf(rec, OWN_FAULT_TRADE_EVENT).length, 0, 'tow out of range drops');
  assert.equal(eventsOf(rec, OWN_FAULT_EVENT, 'tow_dropped').length, 1);
  bus.emit('entity:killed', { id: hotshot.id, killerId: 'pirate', type: 'ship' });
  sweep(ownFaultPlant, state);
  assert.equal(eventsOf(rec, OWN_FAULT_EVENT, 'hotshot_dead').length, 1);
});

test('PL-109: no encounter without the seeded roll', () => {
  const { rec } = pl109Setup(seedWithRoll('pl109', false, OWN_FAULT_TUNING.spawnChancePct));
  assert.equal(rec.spawns.length, 0);
});

// ---- PL-110 Still even ----------------------------------------------------------------------

function pl110NearJuno(state, player, juno) {
  player.pos = { x: juno.pos.x + 100, z: juno.pos.z };
  player.vel = { x: 100, z: 0 }; // closing head-on
}

function pl110Setup(seedOverride = null) {
  const state = makeState({ meta: { seed: seedOverride ?? seedWithRoll('pl110', true, STILL_EVEN_TUNING.spawnChancePct) } });
  const player = makePlayer(state);
  const h = makeHarness(state);
  stillEvenPlant.init({ state, bus: h.bus, helpers: h.helpers });
  enterSector(h.bus);
  const juno = spawnedBy(h.rec, 'pl110', 'juno')[0];
  return { state, player, ...h, juno };
}

test('PL-110: three head-on passes flash lamps once each, then the authored hail', () => {
  const { state, player, rec, juno } = pl110Setup();
  pl110NearJuno(state, player, juno);
  sweep(stillEvenPlant, state);
  assert.equal(juno.data.lampsFlashing, true, 'lamp flash on pass 1');
  assert.equal(eventsOf(rec, STILL_EVEN_EVENT, 'pass').length, 1);
  sweep(stillEvenPlant, state, 1, 10); // inside cooldown
  assert.equal(eventsOf(rec, STILL_EVEN_EVENT, 'pass').length, 1, 'cooldown blocks a second count');
  for (let i = 0; i < 2; i++) {
    state.simTime += STILL_EVEN_TUNING.passCooldownS;
    sweep(stillEvenPlant, state, 1, 1);
  }
  assert.equal(eventsOf(rec, STILL_EVEN_EVENT, 'pass').length, 3, 'pass 3 counted');
  assert.equal(commsOf(rec, STILL_EVEN_HAIL).length, 1, 'hail once');
  assert.equal(commsOf(rec, STILL_EVEN_HAIL)[0].payload.sender, STILL_EVEN_CALLSIGN);
  assert.equal(eventsOf(rec, STILL_EVEN_EVENT, 'hail').length, 1);
});

test('PL-110: holding station after the hail syncs the lamps', () => {
  const { state, player, rec, juno } = pl110Setup();
  pl110NearJuno(state, player, juno);
  for (let i = 0; i < 3; i++) {
    state.simTime += STILL_EVEN_TUNING.passCooldownS;
    sweep(stillEvenPlant, state, 1, 1);
  }
  state.simTime += STILL_EVEN_TUNING.answerHoldS + 1;
  sweep(stillEvenPlant, state);
  assert.equal(eventsOf(rec, STILL_EVEN_SYNC_EVENT).length, 1, 'lamps sync');
  assert.equal(eventsOf(rec, STILL_EVEN_SYNC_EVENT).length, 1, 'sync once');
});

test('PL-110: a real shove ends the meeting — the sync payoff is lost and the line fires once', () => {
  const { state, player, rec, bus, juno } = pl110Setup();
  pl110NearJuno(state, player, juno);
  sweep(stillEvenPlant, state, 1, 1);
  bus.emit('physics:impact', { aId: 'p1', bId: juno.id, impulse: 10, tick: state.tick });
  assert.equal(eventsOf(rec, STILL_EVEN_EVENT, 'shoved').length, 0, 'a bump below the threshold is not a shove');
  assert.equal(eventsOf(rec, STILL_EVEN_JOBS_DONE_EVENT).length, 0, 'no cost for a bump');
  bus.emit('physics:impact', { aId: 'p1', bId: juno.id, impulse: 60, tick: state.tick });
  assert.equal(eventsOf(rec, STILL_EVEN_EVENT, 'shoved').length, 1, 'the shove registered');
  assert.equal(eventsOf(rec, STILL_EVEN_JOBS_DONE_EVENT).length, 1, 'the lost payoff is named once');
  assert.equal(commsOf(rec, STILL_EVEN_JOBS_LINE).length, 1);
  assert.equal(juno.data.intent?.boost, true, 'she departs on a leased intent');
  bus.emit('npcjobs:lotClaimed', { lotId: 'a' }); // NPC claims cost the player nothing now
  assert.equal(eventsOf(rec, STILL_EVEN_JOBS_DONE_EVENT).length, 1, 'no ledger left to bite later');
  state.simTime += STILL_EVEN_TUNING.shoveCooldownS;
  sweep(stillEvenPlant, state, 1, 1);
  assert.equal(eventsOf(rec, STILL_EVEN_EVENT, 'pass').length, 1, 'she left after the shove');
  // The politeness ledger starts over: the next meeting needs three fresh passes.
  const { state: st2, player: pl2, rec: rec2, juno: juno2 } = pl110Setup();
  pl110NearJuno(st2, pl2, juno2);
  sweep(stillEvenPlant, st2, 1, 1);
  assert.equal(eventsOf(rec2, STILL_EVEN_EVENT, 'pass')[0].payload.passes, 1, 'pass count reset after a shove');
});

test('PL-110: pure pass and shove helpers; failed roll spawns nothing', () => {
  assert.equal(isHeadOnPass(100, 60), true);
  assert.equal(isHeadOnPass(STILL_EVEN_TUNING.passRangeWu + 1, 60), false);
  assert.equal(isHeadOnPass(100, STILL_EVEN_TUNING.passClosingSpeedWu - 1), false);
  assert.equal(isShove(STILL_EVEN_TUNING.shoveImpulseMin), true);
  assert.equal(isShove(STILL_EVEN_TUNING.shoveImpulseMin - 1), false);
  assert.equal(isShove(Number.NaN), false);
  const { rec } = pl110Setup(seedWithRoll('pl110', false, STILL_EVEN_TUNING.spawnChancePct));
  assert.equal(rec.spawns.length, 0);
});

// ---- PL-131 The broken toll -----------------------------------------------------------------

function pl131Setup(seedOverride = null) {
  const state = makeState({
    meta: { seed: seedOverride ?? seedWithRoll('pl131', true, BROKEN_TOLL_TUNING.spawnChancePct) },
    // The runtime content registry stationInfo reads: one toll post, one plain dock.
    content: { sectors: [{ id: 's1', stations: [
      { id: 'tollstop', services: ['dock', 'toll'] },
      { id: 'quietstop', services: ['dock'] },
    ] }] },
  });
  const player = makePlayer(state);
  const h = makeHarness(state);
  brokenTollPlant.init({ state, bus: h.bus, helpers: h.helpers });
  enterSector(h.bus);
  const raider = spawnedBy(h.rec, 'pl131', 'lame_raider')[0];
  const sign = h.rec.spawns.find((e) => e.data.storyPropKind === 'toll_sign');
  if (raider) player.pos = { x: raider.pos.x - 60, z: raider.pos.z }; // approach the toll line
  return { state, player, ...h, raider, sign };
}

test('PL-131: the lame raider pleads once per cooldown near the hand-painted TOLL sign', () => {
  const { state, rec, raider } = pl131Setup();
  const sign = rec.spawns.find((e) => e.data.storyPropKind === 'toll_sign');
  assert.ok(raider && sign, 'raider and TOLL sign spawn');
  assert.equal(sign.type, 'beacon', 'sign is a story-prop buoy');
  assert.equal(sign.data.scanLabel, BROKEN_TOLL_TUNING.plId === 'pl131' ? 'TOLL — hand-painted' : '', 'authored scan label');
  assert.equal(sign.data.masslineTetherable, true);
  assert.equal(raider.data.plants.pl131.gunDead, true, 'the gun is dead');
  sweep(brokenTollPlant, state);
  assert.equal(commsOf(rec, BROKEN_TOLL_PLEA).length, 1, 'one plea');
  sweep(brokenTollPlant, state, 2);
  assert.equal(commsOf(rec, BROKEN_TOLL_PLEA).length, 1, 'cooldown holds');
  state.simTime += BROKEN_TOLL_TUNING.pleaCooldownS;
  sweep(brokenTollPlant, state, 1, 1);
  assert.equal(commsOf(rec, BROKEN_TOLL_PLEA).length, 2, 'plea after cooldown');
});

test('PL-131: pay for the story is the real docking toll at a station with a toll service', () => {
  const { state, rec, bus } = pl131Setup();
  sweep(brokenTollPlant, state);
  bus.emit('dock:range', { stationId: 'quietstop', inRange: true });
  assert.equal(eventsOf(rec, BROKEN_TOLL_EVENT, 'paid').length, 0, 'a plain dock is not a toll');
  bus.emit('dock:range', { stationId: 'tollstop', inRange: true });
  const paid = eventsOf(rec, BROKEN_TOLL_EVENT, 'paid');
  assert.equal(paid.length, 1, 'the berth toll receipt pays the story');
  assert.equal(paid[0].payload.stationId, 'tollstop');
  assert.equal(commsOf(rec, 'Toll paid. Fair passage.').length, 1);
  bus.emit('dock:range', { stationId: 'tollstop', inRange: true });
  assert.equal(eventsOf(rec, BROKEN_TOLL_EVENT, 'paid').length, 1, 'paid once per meeting');
  // No encounter, no pay branch at all.
  const { rec: rec2, bus: bus2 } = pl131Setup(seedWithRoll('pl131', false, BROKEN_TOLL_TUNING.spawnChancePct));
  bus2.emit('dock:range', { stationId: 'tollstop', inRange: true });
  assert.equal(eventsOf(rec2, BROKEN_TOLL_EVENT, 'paid').length, 0, 'no meeting, nothing to pay for');
});

test('PL-131: flying through free is free; taking the lame ship apart is a week of dock gossip', () => {
  const { state, player, rec, bus, raider } = pl131Setup();
  player.vel = { x: 0, z: 100 }; // fast crossing
  sweep(brokenTollPlant, state);
  assert.equal(eventsOf(rec, BROKEN_TOLL_EVENT, 'passed_free').length, 1, 'flew through free');

  bus.emit('entity:killed', { id: raider.id, killerId: 'p1', type: 'ship' });
  assert.equal(eventsOf(rec, BROKEN_TOLL_EVENT, 'taken_apart').length, 1);
  bus.emit('dock:range', { stationId: 'st1', inRange: true });
  assert.equal(eventsOf(rec, BROKEN_TOLL_GOSSIP_EVENT).length, 1, 'gossip at dock 1');
  state.simTime += BROKEN_TOLL_TUNING.gossipCooldownS + 1;
  bus.emit('dock:range', { stationId: 'st2', inRange: true });
  state.simTime += BROKEN_TOLL_TUNING.gossipCooldownS + 1;
  bus.emit('dock:range', { stationId: 'st3', inRange: true });
  assert.equal(eventsOf(rec, BROKEN_TOLL_GOSSIP_EVENT).length, 3, 'three docks hear it');
  assert.equal(commsOf(rec, BROKEN_TOLL_GOSSIP_LINE).length, 3);
  state.simTime += BROKEN_TOLL_TUNING.gossipCooldownS + 1;
  bus.emit('dock:range', { stationId: 'st4', inRange: true });
  assert.equal(eventsOf(rec, BROKEN_TOLL_GOSSIP_EVENT).length, 3, 'gossip capped');
  bus.emit('dock:range', { stationId: 'st5', inRange: false });
  assert.equal(eventsOf(rec, BROKEN_TOLL_GOSSIP_EVENT).length, 3, 'out-of-range dock ignored');
});

test('PL-131: pure crossing helper; no roll no toll', () => {
  assert.equal(isFlyingThrough(100, 80), true);
  assert.equal(isFlyingThrough(BROKEN_TOLL_TUNING.passRangeWu + 1, 80), false);
  assert.equal(isFlyingThrough(100, BROKEN_TOLL_TUNING.passSpeedWu - 1), false);
  const { rec } = pl131Setup(seedWithRoll('pl131', false, BROKEN_TOLL_TUNING.spawnChancePct));
  assert.equal(rec.spawns.length, 0);
});

// ---- PL-132 The dark stretch ----------------------------------------------------------------

function pl132Setup(seedOverride = null) {
  const state = makeState({ meta: { seed: seedOverride ?? seedWithRoll('pl132', true, DARK_STRETCH_TUNING.spawnChancePct) } });
  const player = makePlayer(state);
  const h = makeHarness(state);
  darkStretchPlant.init({ state, bus: h.bus, helpers: h.helpers });
  enterSector(h.bus);
  const hauler = spawnedBy(h.rec, 'pl132', 'lone_hauler')[0];
  const farBeacon = h.rec.spawns.find((e) => e.data.storyPropKind === 'dark_stretch_beacon' && e.pos.z < 0);
  if (hauler) player.pos = { x: hauler.pos.x, z: hauler.pos.z - 10 }; // at the dark end, near the hauler
  return { state, player, ...h, hauler, farBeacon };
}

test('PL-132: the invitation, the escort intent, the authored far-end line and the tipped pod', () => {
  const { state, player, rec, hauler, farBeacon } = pl132Setup();
  sweep(darkStretchPlant, state);
  assert.equal(commsOf(rec, DARK_STRETCH_HAIL).length, 1, 'invited once');
  assert.equal(eventsOf(rec, DARK_STRETCH_EVENT, 'invited').length, 1);
  sweep(darkStretchPlant, state);
  assert.equal(commsOf(rec, DARK_STRETCH_HAIL).length, 1, 'invitation does not repeat');

  // The walk down the stretch flies on a leased intent aimed at the far beacon — assert
  // the receipt, not hand-run choreography.
  const aim = hauler.data.intent?.aimAngle;
  assert.ok(Number.isFinite(aim), 'the walk is a leased intent');
  const expectedAim = Math.atan2(farBeacon.pos.z - hauler.pos.z, farBeacon.pos.x - hauler.pos.x);
  assert.ok(Math.abs(aim - expectedAim) < 1e-6, 'the intent aims down the stretch');

  // Physics stand-in (one placement): the hauler is near the far end with the player beside.
  hauler.pos = { x: farBeacon.pos.x, z: farBeacon.pos.z + DARK_STRETCH_TUNING.arriveRangeWu - 10 };
  player.pos = { x: hauler.pos.x, z: hauler.pos.z + 40 };
  sweep(darkStretchPlant, state);
  const flown = eventsOf(rec, DARK_STRETCH_EVENT, 'flown');
  assert.equal(flown.length, 1, 'stretch flown');
  assert.ok(flown[0].payload.podId, 'a unit of cargo tipped');
  assert.ok(spawnedBy(rec, 'pl132', 'tip').length === 1, 'tip pod is a real pod');
  assert.equal(voiceOf(rec, DARK_STRETCH_FAR_LINE).length, 1, 'authored far-end line');
});

test('PL-132: peeling off whenever still gets them there, with no reward and no grudge', () => {
  const { state, player, rec, hauler, farBeacon } = pl132Setup();
  sweep(darkStretchPlant, state); // invited
  player.pos = { x: hauler.pos.x, z: hauler.pos.z + 600 }; // peel off
  sweep(darkStretchPlant, state);
  assert.equal(eventsOf(rec, DARK_STRETCH_EVENT, 'peeled_off').length, 1);
  // Physics stand-in (one placement): the hauler makes the far end alone.
  hauler.pos = { x: farBeacon.pos.x, z: farBeacon.pos.z + DARK_STRETCH_TUNING.arriveRangeWu - 10 };
  sweep(darkStretchPlant, state);
  assert.equal(eventsOf(rec, DARK_STRETCH_EVENT, 'made_it_alone').length, 1, 'they make it, this time');
  assert.equal(voiceOf(rec, DARK_STRETCH_FAR_LINE).length, 0, 'no far-end line for a deserter');
  assert.equal(spawnedBy(rec, 'pl132', 'tip').length, 0, 'no tip');
});

test('PL-132: pure escort helper; no roll no stretch', () => {
  assert.equal(isEscorting(100), true);
  assert.equal(isEscorting(DARK_STRETCH_TUNING.escortRangeWu + 1), false);
  const { rec } = pl132Setup(seedWithRoll('pl132', false, DARK_STRETCH_TUNING.spawnChancePct));
  assert.equal(rec.spawns.length, 0);
});

// ---- PL-133 The shadow pilot ----------------------------------------------------------------

function pl133Setup(seedOverride = null) {
  const state = makeState({ meta: { seed: seedOverride ?? seedWithRoll('pl133', true, SHADOW_PILOT_TUNING.spawnChancePct) } });
  const player = makePlayer(state, { x: 0, z: 0 }, { x: 120, z: 0 });
  const h = makeHarness(state);
  shadowPilotPlant.init({ state, bus: h.bus, helpers: h.helpers });
  enterSector(h.bus);
  const rookie = spawnedBy(h.rec, 'pl133', 'rookie')[0];
  return { state, player, ...h, rookie };
}

test('PL-133: the rookie copies the wake on a leased intent and parks badly at your dock', () => {
  const { state, rec, bus, rookie } = pl133Setup();
  sweep(shadowPilotPlant, state);
  assert.ok(rookie.data.intent, 'wake copying flies through the lease');
  assert.equal(typeof rookie.data.intent.aimAngle, 'number');
  bus.emit('dock:range', { stationId: 'st1', inRange: true });
  assert.equal(commsOf(rec, SHADOW_PILOT_PARK_LINE).length, 1, 'parks behind you, badly');
  assert.equal(eventsOf(rec, SHADOW_PILOT_EVENT, 'parked_badly').length, 1);
  assert.equal(eventsOf(rec, SHADOW_PILOT_EVENT, 'window_closed').length, 1, 'window closes at the dock');
});

test('PL-133: fly like a maniac and meet that instead, three towns later', () => {
  const { state, rec, bus } = pl133Setup();
  bus.emit('physics:impact', { aId: 'p1', bId: 'rock1', impulse: 30, tick: state.tick });
  bus.emit('physics:impact', { aId: 'rock2', bId: 'p1', impulse: 30, tick: state.tick });
  bus.emit('dock:range', { stationId: 'st1', inRange: true }); // closes the window: maniac
  const closed = eventsOf(rec, SHADOW_PILOT_EVENT, 'window_closed');
  assert.equal(closed[0].payload.style, 'maniac');
  bus.emit('dock:range', { stationId: 'st2', inRange: true });
  bus.emit('dock:range', { stationId: 'st3', inRange: true });
  assert.equal(eventsOf(rec, SHADOW_PILOT_ECHO_EVENT).length, 0, 'echo waits for the third town');
  bus.emit('dock:range', { stationId: 'st4', inRange: true });
  const echo = eventsOf(rec, SHADOW_PILOT_ECHO_EVENT);
  assert.equal(echo.length, 1, 'third town: the echo meeting');
  assert.equal(echo[0].payload.style, 'maniac');
  assert.equal(commsOf(rec, SHADOW_PILOT_ECHO_MANIAC).length, 1, 'maniac echo line');
});

test('PL-133: fly well and the echo flies well too; window timeout also closes', () => {
  const { state, rec, bus } = pl133Setup();
  bus.emit('dock:range', { stationId: 'st1', inRange: true }); // clean window
  assert.equal(eventsOf(rec, SHADOW_PILOT_EVENT, 'window_closed')[0].payload.style, 'well');
  bus.emit('dock:range', { stationId: 'st2', inRange: true });
  bus.emit('dock:range', { stationId: 'st3', inRange: true });
  bus.emit('dock:range', { stationId: 'st4', inRange: true });
  assert.equal(commsOf(rec, SHADOW_PILOT_ECHO_GOOD).length, 1, 'well echo line');

  const s2 = pl133Setup();
  sweep(s2.shadowPilotPlant ?? s2.plant ?? shadowPilotPlant, s2.state, 1, SHADOW_PILOT_TUNING.shadowWindowS + 2);
  const closed = eventsOf(s2.rec, SHADOW_PILOT_EVENT, 'window_closed');
  assert.equal(closed.length, 1);
  assert.equal(closed[0].payload.reason, 'window_elapsed');
});

test('PL-133: style verdict is pure; no roll no rookie', () => {
  assert.equal(shadowPilotStyle(0), 'well');
  assert.equal(shadowPilotStyle(SHADOW_PILOT_TUNING.styleImpactsForManiac), 'maniac');
  const { rec } = pl133Setup(seedWithRoll('pl133', false, SHADOW_PILOT_TUNING.spawnChancePct));
  assert.equal(rec.spawns.length, 0);
});

// ---- PL-156 The ticking crate ---------------------------------------------------------------

function pl156Setup(seedOverride = null) {
  const state = makeState({ meta: { seed: seedOverride ?? seedWithRoll('pl156', true, TICKING_CRATE_TUNING.spawnChancePct) } });
  const player = makePlayer(state);
  const h = makeHarness(state);
  tickingCratePlant.init({ state, bus: h.bus, helpers: h.helpers });
  enterSector(h.bus);
  const hauler = spawnedBy(h.rec, 'pl156', 'clock_hauler')[0];
  const crate = spawnedBy(h.rec, 'pl156', 'ticking_crate')[0];
  if (hauler) player.pos = { x: hauler.pos.x - 80, z: hauler.pos.z }; // hail range
  return { state, player, ...h, hauler, crate };
}

test('PL-156: the hail carries the authored line; carrying smooth keeps the town clock true', () => {
  const { state, player, rec, bus, hauler, crate } = pl156Setup();
  sweep(tickingCratePlant, state);
  assert.equal(commsOf(rec, TICKING_CRATE_HAIL).length, 1, 'hailed once');
  assert.equal(commsOf(rec, TICKING_CRATE_HAIL)[0].payload.sender, TICKING_CRATE_CALLSIGN);
  assert.equal(crate.data.plants.pl156.ticking, true, 'crate ticks');
  assert.equal(crate.data.masslineTetherable, true);

  bus.emit('tether:snapCatch', { targetId: crate.id });
  sweep(tickingCratePlant, state);
  assert.equal(eventsOf(rec, TICKING_CRATE_EVENT, 'carry_started').length, 1);

  const station = fixtureStation(state, 'town1', { x: player.pos.x + 100, z: player.pos.z });
  sweep(tickingCratePlant, state);
  const town = eventsOf(rec, TICKING_CRATE_TOWN_EVENT);
  assert.equal(town.length, 1, 'delivered');
  assert.equal(town[0].payload.verdict, 'smooth', 'carried smooth');
  assert.ok(station.data.clockKeptUntil >= state.simTime, 'town clock keeps true time');
  assert.equal(commsOf(rec, TICKING_CRATE_TRUE_LINE).length, 1);
  assert.ok(rec.removes.includes(crate.id), 'crate delivered politely');
});

test('PL-156: shaking it open runs the town wrong for a week — and the module consumes its own stamp', () => {
  const { state, player, rec, bus, crate } = pl156Setup();
  bus.emit('tether:snapCatch', { targetId: crate.id });
  bus.emit('physics:impact', { aId: crate.id, bId: 'rock1', impulse: 60, tick: state.tick });
  assert.equal(eventsOf(rec, TICKING_CRATE_EVENT, 'shaken').length, 1, 'shake counted');
  bus.emit('physics:impact', { aId: crate.id, bId: 'rock2', impulse: 10, tick: state.tick });
  assert.equal(eventsOf(rec, TICKING_CRATE_EVENT, 'shaken').length, 1, 'a bump below the threshold is not a shake');

  const station = fixtureStation(state, 'town2', { x: player.pos.x + 100, z: player.pos.z });
  sweep(tickingCratePlant, state);
  const town = eventsOf(rec, TICKING_CRATE_TOWN_EVENT);
  assert.equal(town[0].payload.verdict, 'shook_open', 'shaken open');
  assert.ok(station.data.clockWrongUntil >= state.simTime + TICKING_CRATE_TUNING.wrongWeekS - 1, 'wrong for a week');
  assert.equal(commsOf(rec, TICKING_CRATE_WRONG_LINE).length, 1);
  // The module consumes the stamp: dock arrivals misannounce while the window holds...
  bus.emit('dock:range', { stationId: 'town2', inRange: true });
  assert.equal(commsOf(rec, TICKING_CRATE_WRONG_LINE).length, 2, 'the dock hears it too');
  bus.emit('dock:range', { stationId: 'town2', inRange: true }); // cooldown
  assert.equal(commsOf(rec, TICKING_CRATE_WRONG_LINE).length, 2, 'one line per cooldown');
  // ...and never past it.
  state.simTime = station.data.clockWrongUntil + 1;
  bus.emit('dock:range', { stationId: 'town2', inRange: true });
  assert.equal(commsOf(rec, TICKING_CRATE_WRONG_LINE).length, 2, 'silent once the window has passed');
  bus.emit('dock:range', { stationId: 'town3', inRange: true });
  assert.equal(commsOf(rec, TICKING_CRATE_WRONG_LINE).length, 2, 'other towns are fine');
});

test('PL-156: a crate shaken open to destruction persists the count — the town still runs wrong', () => {
  // Station near the player: the fate applies immediately.
  const { state, player, rec, bus, crate } = pl156Setup();
  const station = fixtureStation(state, 'town4', { x: player.pos.x + 100, z: player.pos.z });
  bus.emit('entity:killed', { id: crate.id, killerId: 'p1', type: 'ship' });
  assert.equal(eventsOf(rec, TICKING_CRATE_EVENT, 'crate_destroyed').length, 1, 'crate destroyed');
  const town = eventsOf(rec, TICKING_CRATE_TOWN_EVENT);
  assert.equal(town.length, 1, 'the fate applied at the nearby station');
  assert.equal(town[0].payload.verdict, 'shook_open');
  assert.equal(town[0].payload.shakes, 1, 'the destruction counts as the shake');
  assert.ok(station.data.clockWrongUntil >= state.simTime + TICKING_CRATE_TUNING.wrongWeekS - 1, 'wrong for a week');

  // Far from any station, the fate row waits for the next proximity instead.
  const s2 = pl156Setup();
  fixtureStation(s2.state, 'town5', { x: 90000, z: 90000 });
  s2.bus.emit('entity:killed', { id: s2.crate.id, killerId: 'p1', type: 'ship' });
  assert.equal(eventsOf(s2.rec, TICKING_CRATE_TOWN_EVENT).length, 0, 'no station near: fate waits');
  s2.player.pos = { x: 90000, z: 90000 };
  sweep(tickingCratePlant, s2.state);
  const applied = eventsOf(s2.rec, TICKING_CRATE_TOWN_EVENT);
  assert.equal(applied.length, 1, 'applied at the next station proximity');
  const st5 = s2.state.entityIndex.stations.find((x) => x.id === 'town5');
  assert.ok(st5.data.clockWrongUntil >= s2.state.simTime, 'wrong stamp landed');
});

test('PL-156: verdict is pure; a destroyed crate closes the meeting', () => {
  assert.equal(tickingCrateVerdict(0), 'smooth');
  assert.equal(tickingCrateVerdict(1), 'shook_open');
  const { state, rec, bus, crate } = pl156Setup();
  bus.emit('entity:killed', { id: crate.id, killerId: 'p1', type: 'ship' });
  assert.equal(eventsOf(rec, TICKING_CRATE_EVENT, 'crate_destroyed').length, 1);
  sweep(tickingCratePlant, state);
  assert.equal(eventsOf(rec, TICKING_CRATE_TOWN_EVENT).length, 0, 'no delivery after destruction');
});

// ---- PL-157 The empty berth -----------------------------------------------------------------

function pl157Setup(seedOverride = null) {
  const state = makeState({ meta: { seed: seedOverride ?? seedWithRoll('pl157', true, EMPTY_BERTH_TUNING.spawnChancePct) } });
  const player = makePlayer(state);
  const h = makeHarness(state);
  emptyBerthPlant.init({ state, bus: h.bus, helpers: h.helpers });
  enterSector(h.bus);
  const convoy = spawnedBy(h.rec, 'pl157', 'convoy');
  const farBeacon = h.rec.spawns.find((e) => e.data.storyPropKind === 'convoy_route_beacon' && e.pos.z < 0);
  if (convoy.length) {
    const slot = emptyBerthSlotPoint(convoy[0].pos, 0, -1, 0);
    player.pos = { x: slot.x, z: slot.z }; // in the gap where the fourth should fly
  }
  return { state, player, ...h, convoy, farBeacon };
}

// Holding the slot across beacons: the convoy's line flight is asserted as the leased
// intent receipt; beacons pass via ONE physics stand-in placement of the lead.
function pl157HoldSlot(ctx) {
  const { state, player, convoy, farBeacon } = ctx;
  const lead = convoy[0];
  sweep(emptyBerthPlant, state); // holding the starting slot
  const aim = lead.data.intent?.aimAngle;
  const expectedAim = Math.atan2(farBeacon.pos.z - lead.pos.z, farBeacon.pos.x - lead.pos.x);
  assert.ok(Number.isFinite(aim) && Math.abs(aim - expectedAim) < 1e-6, 'the line flight is a leased intent at the far beacon');
  // Physics stand-in (one placement): the convoy has ridden two beacon spacings down the line.
  lead.pos.z -= EMPTY_BERTH_TUNING.beaconSpacingWu * EMPTY_BERTH_TUNING.holdBeaconsMin;
  const slot = emptyBerthSlotPoint(lead.pos, 0, -1, 0);
  player.pos = { x: slot.x, z: slot.z };
  sweep(emptyBerthPlant, state);
  return eventsOf(ctx.rec, EMPTY_BERTH_EVENT, 'lamps_synced').length;
}

test('PL-157: filling the gap syncs the lamps and the far dock tips the fourth share', () => {
  const { state, player, rec, convoy, farBeacon } = pl157Setup();
  assert.equal(convoy.length, EMPTY_BERTH_TUNING.convoyShips, 'three ships, one gap');
  const synced = pl157HoldSlot({ state, player, rec, convoy, farBeacon });
  assert.equal(synced, 1, 'lamps sync after holding through the beacons');
  for (const ship of convoy) assert.equal(ship.data.lampsFlashing, true, 'all convoy lamps flash');

  const lead = convoy[0];
  lead.pos.z = farBeacon.pos.z + 50; // still holding, ride to the far dock
  player.pos = { x: lead.pos.x, z: lead.pos.z + EMPTY_BERTH_TUNING.shipSpacingWu + 30 };
  sweep(emptyBerthPlant, state);
  const share = eventsOf(rec, EMPTY_BERTH_EVENT, 'share_taken');
  assert.equal(share.length, 1, 'fourth share taken');
  assert.ok(share[0].payload.podId, 'share is a real pod');
  assert.ok(rec.removes.includes(convoy[0].id), 'convoy departs politely');
});

test('PL-157: fly sloppy and be boxed out halfway with no share', () => {
  const { state, player, rec, convoy, farBeacon } = pl157Setup();
  pl157HoldSlot({ state, player, rec, convoy, farBeacon });
  // Sloppy after the sync: three deviations past the sloppy ring close the berth.
  const lead = convoy[0];
  for (let i = 0; i < EMPTY_BERTH_TUNING.sloppyStrikesMax; i++) {
    const slot = emptyBerthSlotPoint(lead.pos, 0, -1, 0);
    player.pos = { x: slot.x, z: slot.z + EMPTY_BERTH_TUNING.sloppyRangeWu + 50 };
    sweep(emptyBerthPlant, state);
    if (i < EMPTY_BERTH_TUNING.sloppyStrikesMax - 1) {
      lead.pos.z -= EMPTY_BERTH_TUNING.beaconSpacingWu;
      const back = emptyBerthSlotPoint(lead.pos, 0, -1, 0);
      player.pos = { x: back.x, z: back.z };
      sweep(emptyBerthPlant, state);
    }
  }
  assert.equal(eventsOf(rec, EMPTY_BERTH_EVENT, 'boxed_out').length, 1, 'boxed out');
  assert.equal(eventsOf(rec, EMPTY_BERTH_EVENT, 'share_taken').length, 0, 'no share');
  assert.ok(rec.removes.includes(convoy[0].id), 'the berth closed');
});

test('PL-157: slot geometry is pure; no roll no convoy', () => {
  const slot = emptyBerthSlotPoint({ x: 0, z: 0 }, 0, -1, 0);
  assert.equal(slot.x, 0);
  assert.equal(slot.z, EMPTY_BERTH_TUNING.convoyShips * EMPTY_BERTH_TUNING.shipSpacingWu);
  const { rec } = pl157Setup(seedWithRoll('pl157', false, EMPTY_BERTH_TUNING.spawnChancePct));
  assert.equal(rec.spawns.length, 0);
});

// ---- PL-158 The chased thief ----------------------------------------------------------------

function pl158Setup(seedOverride = null) {
  const state = makeState({ meta: { seed: seedOverride ?? seedWithRoll('pl158', true, CHASED_THIEF_TUNING.spawnChancePct) } });
  const player = makePlayer(state, { x: 160, z: -260 });
  const h = makeHarness(state);
  chasedThiefPlant.init({ state, bus: h.bus, helpers: h.helpers });
  enterSector(h.bus);
  const thief = spawnedBy(h.rec, 'pl158', 'thief')[0];
  const haulers = spawnedBy(h.rec, 'pl158', 'hauler');
  return { state, player, ...h, thief, haulers };
}

test('PL-158: line the thief and take a finder cut', () => {
  const { state, rec, bus, thief, haulers } = pl158Setup();
  assert.equal(spawnedBy(rec, 'pl158').length <= CHASED_THIEF_TUNING.maxCast, true, 'cast capped');
  sweep(chasedThiefPlant, state);
  assert.ok(thief.data.intent, 'the thief cuts across on a leased intent');
  assert.ok(haulers[0].data.intent, 'the haulers chase on leased intents');
  bus.emit('tether:snapCatch', { targetId: thief.id });
  const lined = eventsOf(rec, CHASED_THIEF_EVENT, 'lined');
  assert.equal(lined.length, 1, 'thief lined');
  assert.ok(lined[0].payload.podId, 'finder cut is a real pod');
  assert.ok(rec.removes.includes(thief.id), 'chase ends politely');
});

test('PL-158: block the haulers and the authored line tips a crate — Concord asks later', () => {
  const { state, player, rec, bus, thief, haulers } = pl158Setup();
  const mid = midpointOf(thief.pos, haulers[0].pos);
  player.pos = { ...mid };
  sweep(chasedThiefPlant, state, CHASED_THIEF_TUNING.blockHoldS + 1);
  assert.equal(voiceOf(rec, CHASED_THIEF_OBLIGED).length, 1, 'the authored line');
  assert.equal(spawnedBy(rec, 'pl158', 'crate').length, 1, 'a crate tips your way');
  bus.emit('dock:range', { stationId: 'st1', inRange: true });
  assert.equal(eventsOf(rec, CHASED_THIEF_CONCORD_EVENT).length, 1, 'Concord asks');
  assert.equal(commsOf(rec, CHASED_THIEF_CONCORD_LINE).length, 1);
  bus.emit('dock:range', { stationId: 'st2', inRange: true });
  assert.equal(eventsOf(rec, CHASED_THIEF_CONCORD_EVENT).length, 1, 'Concord asks once');
});

test('PL-158: nobody intervenes and the chase expires politely', () => {
  const { state, rec, thief } = pl158Setup();
  playerFarAway(state);
  sweep(chasedThiefPlant, state, 1, CHASED_THIEF_TUNING.chaseDurationS / 2);
  assert.equal(rec.removes.includes(thief.id), false, 'still chasing mid-window');
  sweep(chasedThiefPlant, state, 1, CHASED_THIEF_TUNING.chaseDurationS / 2 + 1);
  assert.ok(rec.removes.includes(thief.id), 'the pursuit gives up');
});

function playerFarAway(state) {
  const player = state.entities.get(state.playerId);
  player.pos = { x: 9000, z: 9000 };
}

test('PL-158: midpoint is pure; no roll no chase', () => {
  const mid = midpointOf({ x: 0, z: 10 }, { x: 20, z: 30 });
  assert.deepEqual(mid, { x: 10, z: 20 });
  assert.equal(midpointOf(null, { x: 0, z: 0 }), null);
  const { rec } = pl158Setup(seedWithRoll('pl158', false, CHASED_THIEF_TUNING.spawnChancePct));
  assert.equal(rec.spawns.length, 0);
});

// ---- PL-159 The tanker wake -----------------------------------------------------------------

test('PL-159: passing close tows you for a second, cooldown-gated; room costs nothing', () => {
  const state = makeState({ meta: { seed: seedWithRoll('pl159', true, TANKER_WAKE_TUNING.spawnChancePct) } });
  const player = makePlayer(state);
  const { rec, bus, helpers } = makeHarness(state);
  tankerWakePlant.init({ state, bus, helpers });
  enterSector(bus);
  const tanker = spawnedBy(rec, 'pl159', 'great_tanker')[0];
  assert.ok(tanker, 'the great tanker spawns');
  assert.ok(tanker.vel.z === -TANKER_WAKE_TUNING.tankerSpeedWu, 'fixed glide, straight down the lane');
  assert.ok(Math.abs(tanker.vel.x) < 1e-9, 'no lateral drift in the glide');
  player.pos = { x: tanker.pos.x, z: tanker.pos.z + 50 }; // pass close

  // Ride the drag: impulses flow for the tow window, then cooldown.
  const ticks = Math.ceil(TANKER_WAKE_TUNING.towWindowS * 60) + 30;
  for (let i = 0; i < ticks; i++) sweep(tankerWakePlant, state, 1, 1 / 60);
  const tows = eventsOf(rec, TANKER_WAKE_EVENT, 'tow_started');
  assert.equal(tows.length, 1, 'one tow per cooldown window');
  assert.ok(tanker.vel.z === -TANKER_WAKE_TUNING.tankerSpeedWu, 'fixed glide, straight down the lane');
  assert.ok(Math.abs(tanker.vel.x) < 1e-9, 'no lateral drift in the glide');

  // Give it room: no tow.
  player.pos = { x: tanker.pos.x, z: tanker.pos.z + TANKER_WAKE_TUNING.wakeRangeWu + 200 };
  for (let i = 0; i < 60; i++) sweep(tankerWakePlant, state, 1, 1 / 60);
  assert.equal(eventsOf(rec, TANKER_WAKE_EVENT, 'tow_started').length, 1, 'room = no drag');
});

test('PL-159: tow vector is pure; no roll no tanker', () => {
  const v = tankerTowImpulse(0, 100);
  assert.deepEqual(v, { x: 100, z: 0 });
  const state = makeState({ meta: { seed: seedWithRoll('pl159', false, TANKER_WAKE_TUNING.spawnChancePct) } });
  makePlayer(state);
  const { rec, bus, helpers } = makeHarness(state);
  tankerWakePlant.init({ state, bus, helpers });
  enterSector(bus);
  assert.equal(rec.spawns.length, 0);
});

// ---- PL-184 The outrider --------------------------------------------------------------------

function pl184Setup(seedOverride = null) {
  const state = makeState({ meta: { seed: seedOverride ?? seedWithRoll('pl184', true, OUTRIDER_TUNING.spawnChancePct) } });
  const player = makePlayer(state, { x: 0, z: 0 });
  const h = makeHarness(state);
  outriderPlant.init({ state, bus: h.bus, helpers: h.helpers });
  enterSector(h.bus);
  const outrider = spawnedBy(h.rec, 'pl184', 'outrider')[0];
  const convoy = spawnedBy(h.rec, 'pl184', 'convoy');
  return { state, player, ...h, outrider, convoy };
}

function pl184Ticks(mod, state, n) {
  for (let i = 0; i < n; i++) {
    state.simTime += 1 / 60;
    mod.update(1 / 60);
  }
}

test('PL-184: hold still for the circle and be waved through', () => {
  const { state, rec, outrider, convoy } = pl184Setup();
  assert.ok(outrider, 'outrider detaches');
  assert.equal(spawnedBy(rec, 'pl184').length, OUTRIDER_TUNING.maxCast, 'cast capped at three');
  pl184Ticks(outriderPlant, state, Math.ceil(Math.PI * 2 / OUTRIDER_TUNING.orbitSpeedRadS / (1 / 60)) + 10);
  const done = eventsOf(rec, OUTRIDER_EVENT, 'circle_done');
  assert.equal(done.length, 1, 'one circle');
  assert.equal(done[0].payload.verdict, 'waved_through', 'held still: waved through');
  assert.equal(outrider.data.lampsFlashing, true, 'the wave is a lamp flash');
  assert.ok(rec.removes.includes(outrider.id), 'the outrider returns');
});

test('PL-184: boost off and the convoy closes ranks', () => {
  const { state, player, rec, outrider, convoy } = pl184Setup();
  player.vel = { x: 300, z: 0 };
  pl184Ticks(outriderPlant, state, 5);
  assert.equal(eventsOf(rec, OUTRIDER_EVENT, 'ranks_closed').length, 1, 'ranks closed');
  assert.equal(convoy[0].data.intent.brake, true, 'the convoy brakes into ranks');
  pl184Ticks(outriderPlant, state, Math.ceil(Math.PI * 2 / OUTRIDER_TUNING.orbitSpeedRadS / (1 / 60)) + 10);
  const done = eventsOf(rec, OUTRIDER_EVENT, 'circle_done');
  assert.equal(done.length, 1);
  assert.equal(done[0].payload.verdict, 'ranks_closed', 'no wave for a booster');
});

test('PL-184: cruising through the circle is not the wave — held still is the ask', () => {
  const { state, player, rec, outrider } = pl184Setup();
  player.vel = { x: 120, z: 0 }; // cruising: above hold-still, below boost-off
  pl184Ticks(outriderPlant, state, Math.ceil(Math.PI * 2 / OUTRIDER_TUNING.orbitSpeedRadS / (1 / 60)) + 10);
  const done = eventsOf(rec, OUTRIDER_EVENT, 'circle_done');
  assert.equal(done.length, 1, 'the circle completes');
  assert.equal(done[0].payload.verdict, 'no_wave', 'cruising through is not waved through');
  assert.notEqual(outrider.data.lampsFlashing, true, 'no lamp wave for a cruiser');
});

test('PL-184: orbit geometry and verdict are pure; heldStill is enforced; no roll no outrider', () => {
  const p = orbitPoint({ x: 10, z: 20 }, 0, 150);
  assert.deepEqual(p, { x: 160, z: 20 });
  assert.equal(outriderCircleVerdict({ boostedOff: false, completed: true, heldStill: true }), 'waved_through');
  assert.equal(outriderCircleVerdict({ boostedOff: false, completed: true, heldStill: false }), 'no_wave');
  assert.equal(outriderCircleVerdict({ boostedOff: true, completed: true, heldStill: true }), 'ranks_closed');
  assert.equal(outriderCircleVerdict({ boostedOff: false, completed: false, heldStill: true }), 'unfinished');
  const { rec } = pl184Setup(seedWithRoll('pl184', false, OUTRIDER_TUNING.spawnChancePct));
  assert.equal(rec.spawns.length, 0);
});

// ---- PL-206 The measuring hull --------------------------------------------------------------

function pl206Setup(seedOverride = null) {
  const state = makeState({ meta: { seed: seedOverride ?? seedWithRoll('pl206', true, MEASURING_HULL_TUNING.spawnChancePct) } });
  const player = makePlayer(state, { x: 0, z: 0 }, { x: 100, z: 0 });
  const h = makeHarness(state);
  measuringHullPlant.init({ state, bus: h.bus, helpers: h.helpers });
  enterSector(h.bus);
  const hull = spawnedBy(h.rec, 'pl206', 'unmarked')[0];
  return { state, player, ...h, hull };
}

test('PL-206: the hull paces your wake without closing; never changes identity', () => {
  const { state, rec, hull } = pl206Setup();
  assert.equal(hull.data.callsign, undefined, 'no markings, no callsign');
  assert.equal(hull.data.scanLabel, 'UNMARKED HULL');
  sweep(measuringHullPlant, state);
  assert.ok(hull.data.intent, 'pacing flies through the lease');
});

test('PL-206: break off and lose them', () => {
  const { state, player, rec, hull } = pl206Setup();
  player.vel = { x: 200, z: 0 }; // hull glides at ~0 in the harness: well above pace + margin
  sweep(measuringHullPlant, state, MEASURING_HULL_TUNING.breakHoldS - 1);
  assert.equal(eventsOf(rec, MEASURING_HULL_EVENT, 'lost_them').length, 0, 'sustained break not yet');
  sweep(measuringHullPlant, state, 2);
  const lost = eventsOf(rec, MEASURING_HULL_EVENT, 'lost_them');
  assert.equal(lost.length, 1);
  assert.equal(lost[0].payload.reason, 'broke_off');
  assert.ok(rec.removes.includes(hull.id), 'lost them');
});

test('PL-206: turn and confront and they bolt', () => {
  const { state, player, rec, hull } = pl206Setup();
  player.pos = { x: hull.pos.x + 60, z: hull.pos.z };
  player.vel = { x: -100, z: 0 }; // heading straight at the hull
  sweep(measuringHullPlant, state);
  assert.equal(eventsOf(rec, MEASURING_HULL_EVENT, 'bolted').length, 1, 'they bolt');
  assert.ok(hull.data.intent.boost === true, 'bolting on a boosted lease');
  sweep(measuringHullPlant, state, 1, MEASURING_HULL_TUNING.boltIntentS + 1);
  assert.ok(rec.removes.includes(hull.id), 'gone after the bolt');
});

test('PL-206: let them follow and the sector ends with a wondering receipt', () => {
  const { state, rec, bus, hull } = pl206Setup();
  sweep(measuringHullPlant, state, 3);
  bus.emit('sector:exit', {});
  assert.equal(eventsOf(rec, MEASURING_HULL_EVENT, 'measured').length, 1, 'measured');
  assert.equal(commsOf(rec, 'What were they measuring?').length, 1);
  assert.ok(rec.removes.includes(hull.id), 'the meeting ends at the sector line');
});

test('PL-206: pace and confront geometry are pure; no roll no pacer', () => {
  const p = pacePoint({ x: 0, z: 0 }, { x: 100, z: 0 }, 180);
  assert.deepEqual(p, { x: -180, z: 0 });
  const hull = { pos: { x: -50, z: 0 } };
  const player = { pos: { x: 0, z: 0 }, vel: { x: -100, z: 0 } };
  assert.equal(isConfronting(player, hull, 90), true, 'close and heading at them');
  player.vel = { x: 100, z: 0 };
  assert.equal(isConfronting(player, hull, 90), false, 'facing away is not confronting');
  const { rec } = pl206Setup(seedWithRoll('pl206', false, MEASURING_HULL_TUNING.spawnChancePct));
  assert.equal(rec.spawns.length, 0);
});

// ---- PL-207 The welder sparks ---------------------------------------------------------------

function pl207Setup(seedOverride = null) {
  const state = makeState({ meta: { seed: seedOverride ?? seedWithRoll('pl207', true, WELDERS_SPARKS_TUNING.spawnChancePct) } });
  const player = makePlayer(state, { x: 420, z: 120 });
  const h = makeHarness(state);
  weldersSparksPlant.init({ state, bus: h.bus, helpers: h.helpers });
  enterSector(h.bus);
  const slate = spawnedBy(h.rec, 'pl207', 'slate')[0];
  return { state, player, ...h, slate };
}

test('PL-207: the sparks tick on the work spot while Slate fixes', () => {
  const { state, rec, slate } = pl207Setup();
  assert.equal(slate.data.callsign, WELDERS_SPARKS_CALLSIGN);
  sweep(weldersSparksPlant, state, 1);
  const sparks = rec.events.filter((e) => e.event === 'audio:cue' && e.payload.id === 'sfx_vent_chime');
  assert.equal(sparks.length, 0, 'not yet due');
  state.simTime += WELDERS_SPARKS_TUNING.sparkIntervalS;
  sweep(weldersSparksPlant, state, 1, 1);
  assert.equal(rec.events.filter((e) => e.event === 'audio:cue' && e.payload.id === 'sfx_vent_chime').length >= 1, true, 'sparks tick');
  const prop = rec.spawns.find((e) => e.data.storyPropKind === 'welder_work');
  assert.equal(prop.data.lampsFlashing, true, 'the work spot flashes with the sparks');
});

test('PL-207: leave anything broken by the sparks and it comes back mended', () => {
  const { state, rec, bus, helpers, slate } = pl207Setup();
  // A pod the player actually left: the ordinary jettison path's player-origin stamp,
  // resting broken in the ring. Detection is the module's own — no test-only API.
  const pod = makePod(state, { x: slate.pos.x + 30, z: slate.pos.z }, 'p1',
    { playerJettisonOrigin: { version: 1, ownerId: 'p1' }, hull: 20, hullMax: 100 }, helpers);
  sweep(weldersSparksPlant, state);
  assert.equal(eventsOf(rec, WELDERS_SPARKS_EVENT, 'stashed').length, 1, 'registered by the sparks');
  sweep(weldersSparksPlant, state, 1, WELDERS_SPARKS_TUNING.repairNightS + 1);
  const mended = eventsOf(rec, WELDERS_SPARKS_EVENT, 'mended');
  assert.equal(mended.length, 1, 'mended overnight');
  assert.equal(pod.hull, 100, 'hull restored');
  assert.equal(commsOf(rec, WELDERS_SPARKS_MENDED_LINE).length, 1);
});

test('PL-207: leave something stolen and it comes back engraved with its owner tag', () => {
  const { state, rec, bus, helpers, slate } = pl207Setup();
  // A pod that arrived under tow and was left here: an owner stamp naming somebody else.
  const pod = makePod(state, { x: slate.pos.x + 25, z: slate.pos.z + 10 }, 'npc9', { ownerName: 'ORE RUNNER' }, helpers);
  sweep(weldersSparksPlant, state);
  const stashed = eventsOf(rec, WELDERS_SPARKS_EVENT, 'stashed');
  assert.equal(stashed.length, 1);
  assert.equal(stashed[0].payload.stolen, true, 'read as stolen');
  sweep(weldersSparksPlant, state, 1, WELDERS_SPARKS_TUNING.repairNightS + 1);
  const engraved = eventsOf(rec, WELDERS_SPARKS_EVENT, 'mended_engraved');
  assert.equal(engraved.length, 1, 'mended and engraved');
  assert.equal(pod.data.engravedTag, 'ORE RUNNER', 'the owner tag');
  assert.equal(commsOf(rec, WELDERS_SPARKS_ENGRAVED_LINE).length, 1);
});

test('PL-207: the stash ledger is bounded; pure stash helper', () => {
  const { state, rec, helpers, slate } = pl207Setup();
  for (let i = 0; i < 8; i++) {
    makePod(state, { x: slate.pos.x + 20 + i, z: slate.pos.z }, 'p1',
      { playerJettisonOrigin: { version: 1, ownerId: 'p1' } }, helpers);
  }
  sweep(weldersSparksPlant, state);
  assert.equal(eventsOf(rec, WELDERS_SPARKS_EVENT, 'stashed').length, WELDERS_SPARKS_TUNING.maxStashRows, 'ledger capped');
  assert.equal(classifyStashPod({ alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: { playerJettisonOrigin: { version: 1 } } },
    { x: 0, z: 0 }, 90), 'mine', 'a resting player-left pod reads as mine');
  assert.equal(classifyStashPod({ alive: true, pos: { x: 500, z: 0 }, vel: { x: 0, z: 0 }, data: { playerJettisonOrigin: { version: 1 } } },
    { x: 0, z: 0 }, 90), null, 'out of the ring reads as nothing');
  assert.equal(classifyStashPod(null, { x: 0, z: 0 }, 90), null);
});

// ---- PL-208 Same time tomorrow --------------------------------------------------------------

function pl208Setup(seedOverride = null) {
  const state = makeState({ simTime: 300, meta: { seed: seedOverride ?? seedWithRoll('pl208', true, SAME_TIME_TOMORROW_TUNING.spawnChancePct) } });
  const player = makePlayer(state);
  const h = makeHarness(state);
  sameTimeTomorrowPlant.init({ state, bus: h.bus, helpers: h.helpers });
  enterSector(h.bus);
  const beacon = h.rec.spawns.find((e) => e.data.storyPropKind === 'same_time_beacon');
  const stranger = spawnedBy(h.rec, 'pl208', 'stranger')[0];
  if (beacon) player.pos = { ...beacon.pos }; // stopped right at the beacon
  return { state, player, ...h, beacon, stranger };
}

test('PL-208: give way once and an appointment nobody named exists', () => {
  const { state, player, rec, beacon, stranger } = pl208Setup();
  player.vel = { x: 0, z: 0 };
  assert.ok(beacon && stranger, 'the crossing stranger is at the beacon');
  sweep(sameTimeTomorrowPlant, state);
  const made = eventsOf(rec, SAME_TIME_TOMORROW_EVENT, 'appointment_made');
  assert.equal(made.length, 1, 'the appointment exists');
  assert.equal(made[0].payload.hour, 12, 'at the hour of the yield');
});

test('PL-208: keep it and they hold the beacon at that hour; miss and no grudge', () => {
  const { state, player, rec, beacon } = pl208Setup();
  sweep(sameTimeTomorrowPlant, state); // appointment made at hour 12, day 0

  // Next day, same hour, arrive inside the window: kept.
  state.simTime = 300 + SAME_TIME_TOMORROW_TUNING.dayS;
  player.pos = { ...beacon.pos };
  sweep(sameTimeTomorrowPlant, state);
  assert.equal(eventsOf(rec, SAME_TIME_TOMORROW_EVENT, 'kept').length, 1, 'kept');
  const held = spawnedBy(rec, 'pl208', 'stranger');
  assert.ok(held.length >= 1, 'they are there');

  // Miss a whole day: day 2's late window passes without you.
  state.simTime = 300 + SAME_TIME_TOMORROW_TUNING.dayS * 2 + SAME_TIME_TOMORROW_TUNING.appointmentGraceS + 5;
  player.pos = { x: 9000, z: 9000 };
  sweep(sameTimeTomorrowPlant, state);
  assert.equal(eventsOf(rec, SAME_TIME_TOMORROW_EVENT, 'missed').length, 1, 'the miss is stamped');

  // The next day they wave you through late, no grudge.
  state.simTime = 300 + SAME_TIME_TOMORROW_TUNING.dayS * 3;
  player.pos = { ...beacon.pos };
  sweep(sameTimeTomorrowPlant, state);
  assert.equal(eventsOf(rec, SAME_TIME_TOMORROW_EVENT, 'kept_late').length, 1, 'waved through late');
  assert.equal(commsOf(rec, SAME_TIME_TOMORROW_LATE_LINE).length, 1, 'no grudge');
});

test('PL-208: window and yield math are pure; no roll no crossing', () => {
  const row = { hour: 12 };
  const win = appointmentWindow(300, row, SAME_TIME_TOMORROW_TUNING);
  assert.equal(win.inWindow, true);
  assert.equal(appointmentWindow(300 + SAME_TIME_TOMORROW_TUNING.appointmentGraceS + 50, row, SAME_TIME_TOMORROW_TUNING).late, true);
  assert.equal(appointmentWindow(300, null).inWindow, false);
  assert.equal(isGivingWay(10, 100, 150), true);
  assert.equal(isGivingWay(50, 100, 150), false, 'too fast is not giving way');
  assert.equal(isGivingWay(10, SAME_TIME_TOMORROW_TUNING.yieldRangeWu + 1, 150), false);
  const { rec } = pl208Setup(seedWithRoll('pl208', false, SAME_TIME_TOMORROW_TUNING.spawnChancePct));
  assert.equal(rec.spawns.length, 0);
});

// ---- PL-220 The stalled string --------------------------------------------------------------

function pl220Setup(seedOverride = null) {
  const state = makeState({ meta: { seed: seedOverride ?? seedWithRoll('pl220', true, STALLED_STRING_TUNING.spawnChancePct) } });
  makePlayer(state, { x: 300, z: 0 });
  const h = makeHarness(state);
  stalledStringPlant.init({ state, bus: h.bus, helpers: h.helpers });
  enterSector(h.bus);
  const beacon = h.rec.spawns.find((e) => e.data.storyPropKind === 'stalled_string_beacon');
  const containers = spawnedBy(h.rec, 'pl220', 'stalled_container');
  const commuters = spawnedBy(h.rec, 'pl220', 'commuter');
  return { state, ...h, beacon, containers, commuters };
}

test('PL-220: the string sits dead, the commuters queue and cannot move it', () => {
  const { state, rec, beacon, containers, commuters } = pl220Setup();
  assert.ok(beacon, 'green beacon prop');
  assert.equal(containers.length, STALLED_STRING_TUNING.containers, 'three containers');
  assert.equal(commuters.length, 2, 'two stuck commuters');
  assert.equal(containers[0].data.masslineTetherable, true);
  sweep(stalledStringPlant, state);
  assert.equal(commuters[0].data.intent.brake, true, 'queued behind the string');
  assert.equal(eventsOf(rec, STALLED_STRING_EVENT, 'cleared').length, 0);
});

test('PL-220: one good shove clears the lane and earns the flashes of thanks', () => {
  const { state, rec, bus, beacon, containers, commuters } = pl220Setup();
  bus.emit('physics:impact', { aId: containers[0].id, bId: 'p1', impulse: 10, tick: state.tick });
  assert.equal(eventsOf(rec, STALLED_STRING_EVENT, 'shoved').length, 0, 'a weak hit is not a shove');
  bus.emit('physics:impact', { aId: containers[0].id, bId: 'p1', impulse: 80, tick: state.tick });
  assert.equal(eventsOf(rec, STALLED_STRING_EVENT, 'shoved').length, 1, 'the shove lands');
  for (const pod of containers) pod.pos = { x: beacon.pos.x + 200, z: beacon.pos.z + 10 };
  sweep(stalledStringPlant, state); // the shove lands; the thanks clock starts
  assert.equal(eventsOf(rec, STALLED_STRING_EVENT, 'cleared').length, 1, 'lane cleared');
  sweep(stalledStringPlant, state, 3, 1); // pulses land on the spacing clock, not in one burst
  for (const c of commuters) assert.equal(c.data.lampsFlashing, true, 'thanks in lamp flashes');
  assert.equal(rec.events.filter((e) => e.event === 'plants:stalledStringFlash').length,
    STALLED_STRING_TUNING.thanksFlashes * 2, 'bounded flash pulses');
  assert.ok(rec.removes.includes(beacon.id), 'meeting ends politely');
});

test('PL-220: watch commuter patience die in real time', () => {
  const { state, rec, commuters } = pl220Setup();
  sweep(stalledStringPlant, state, 1, STALLED_STRING_TUNING.patienceS / 2);
  assert.equal(eventsOf(rec, STALLED_STRING_EVENT, 'patience_died').length, 0, 'still waiting');
  sweep(stalledStringPlant, state, 1, STALLED_STRING_TUNING.patienceS / 2 + 1);
  assert.equal(eventsOf(rec, STALLED_STRING_EVENT, 'patience_died').length, 1, 'patience died');
  for (const c of commuters) assert.ok(rec.removes.includes(c.id), 'the queue gives up');
});

test('PL-220: clear check is pure; no roll no string', () => {
  assert.equal(isContainerClear({ x: 200, z: 0 }, { x: 0, z: 0 }, 120), true);
  assert.equal(isContainerClear({ x: 100, z: 0 }, { x: 0, z: 0 }, 120), false);
  const { rec } = pl220Setup(seedWithRoll('pl220', false, STALLED_STRING_TUNING.spawnChancePct));
  assert.equal(rec.spawns.length, 0);
});

// ---- PL-221 The waiting line ----------------------------------------------------------------

function pl221Setup(seedOverride = null) {
  const state = makeState({ meta: { seed: seedOverride ?? seedWithRoll('pl221', true, WAITING_LINE_TUNING.spawnChancePct) } });
  const player = makePlayer(state);
  const h = makeHarness(state);
  waitingLinePlant.init({ state, bus: h.bus, helpers: h.helpers });
  enterSector(h.bus);
  const buoys = h.rec.spawns.filter((e) => e.data.storyPropKind === 'waiting_line_buoy');
  const lineX = buoys.length ? buoys[0].pos.x : 0;
  player.pos = { x: lineX - 20, z: 0 };
  player.vel = { x: 200, z: 0 }; // crossing speed
  return { state, player, ...h, buoys, lineX };
}

test('PL-221: cross the waiting line at speed and it snags; slow and it lets go', () => {
  const { state, player, rec, lineX } = pl221Setup();
  assert.equal(pl221Buoys(rec).length, 2, 'the line ends are real props');
  sweep(waitingLinePlant, state); // records the first position, no snag yet
  assert.equal(eventsOf(rec, WAITING_LINE_EVENT, 'snagged').length, 0);
  player.pos = { x: lineX + 20, z: 0 }; // crossed the line between ticks at speed
  sweep(waitingLinePlant, state);
  assert.equal(eventsOf(rec, WAITING_LINE_EVENT, 'snagged').length, 1, 'snagged');
  sweep(waitingLinePlant, state, 3); // full boost: it holds on (inside hold-on max)
  assert.equal(eventsOf(rec, WAITING_LINE_EVENT, 'let_go').length, 0, 'holds on while boosting');
  player.vel = { x: 10, z: 0 }; // slow down
  sweep(waitingLinePlant, state);
  assert.equal(eventsOf(rec, WAITING_LINE_EVENT, 'let_go').length, 1, 'lets go the moment you slow');
  assert.equal(eventsOf(rec, WAITING_LINE_EVENT, 'let_go')[0].payload.reason, 'slowed');
  sweep(waitingLinePlant, state, 5);
  assert.equal(eventsOf(rec, WAITING_LINE_EVENT, 'snagged').length, 1, 'once, per sector');
});

test('PL-221: run full boost long enough and it lets go on its own', () => {
  const { state, player, rec, lineX } = pl221Setup();
  sweep(waitingLinePlant, state);
  player.pos = { x: lineX + 20, z: 0 };
  sweep(waitingLinePlant, state);
  sweep(waitingLinePlant, state, 1, WAITING_LINE_TUNING.holdOnMaxS + 1);
  const letGo = eventsOf(rec, WAITING_LINE_EVENT, 'let_go');
  assert.equal(letGo.length, 1);
  assert.equal(letGo[0].payload.reason, 'held_on_max', 'it held on a while');
});

test('PL-221: segment crossing is pure; no roll no line', () => {
  assert.equal(segmentCrossesLine(180, 0, 220, 0, 200, -210, 200, 210), true);
  assert.equal(segmentCrossesLine(180, 300, 220, 300, 200, -210, 200, 210), false, 'passes beyond the ends');
  assert.equal(segmentCrossesLine(100, 0, 140, 0, 200, -210, 200, 210), false, 'never reached it');
  const { rec } = pl221Setup(seedWithRoll('pl221', false, WAITING_LINE_TUNING.spawnChancePct));
  assert.equal(rec.spawns.length, 0);
});

function pl221Buoys(rec) {
  return rec.spawns.filter((e) => e.data.storyPropKind === 'waiting_line_buoy');
}

// ---- PL-249 The dead stick ------------------------------------------------------------------

function pl249Setup(seedOverride = null, stationPos = { x: 800, z: 0 }) {
  const state = makeState({ meta: { seed: seedOverride ?? seedWithRoll('pl249', true, DEAD_STICK_TUNING.spawnChancePct) } });
  const player = makePlayer(state);
  fixtureStation(state, 'st9', stationPos);
  const h = makeHarness(state);
  deadStickPlant.init({ state, bus: h.bus, helpers: h.helpers });
  enterSector(h.bus);
  const hull = spawnedBy(h.rec, 'pl249', 'dead_stick')[0];
  if (hull) player.pos = { x: hull.pos.x + 40, z: hull.pos.z + 20 }; // inside escort range
  return { state, player, ...h, hull };
}

test('PL-249: the dead stick glides silent and straight for the dock', () => {
  const { rec, hull } = pl249Setup();
  assert.ok(hull, 'the old pilot glides past');
  assert.equal(hull.data.plants.pl249.silent, true, 'no radio');
  assert.ok(Math.hypot(hull.vel.x, hull.vel.z) > 0, 'on nothing: fixed glide velocity');
  assert.equal(spawnedBy(rec, 'pl249').length, 1, 'one hull, no entourage');
});

test('PL-249: escort silently and they answer with a single lamp flash at the dock', () => {
  const { state, player, rec, hull } = pl249Setup();
  for (let i = 0; i < 4; i++) sweep(deadStickPlant, state, 1); // escorted ticks accrue
  assert.ok(rec.voice.length === 0, 'dead silent');
  hull.pos = { x: 620, z: 0 }; // inside dock approach of st9
  sweep(deadStickPlant, state);
  const escorted = eventsOf(rec, DEAD_STICK_EVENT, 'escorted');
  assert.equal(escorted.length, 1, 'escorted the whole way');
  assert.equal(hull.data.lampsFlashing, true, 'the silent nod');
  assert.ok(rec.removes.includes(hull.id), 'they dock');
});

test('PL-249: offer a tow and they wave you off, gently; the escort can still finish', () => {
  const { state, player, rec, bus, hull } = pl249Setup();
  bus.emit('tether:snapCatch', { targetId: hull.id });
  assert.equal(eventsOf(rec, DEAD_STICK_EVENT, 'tow_refused').length, 1, 'tow refused');
  assert.equal(commsOf(rec, DEAD_STICK_WAVE_OFF_LINE).length, 1, 'gently');
  bus.emit('tether:snapCatch', { targetId: hull.id });
  assert.equal(eventsOf(rec, DEAD_STICK_EVENT, 'tow_refused').length, 1, 'cooldown holds');
  for (let i = 0; i < 4; i++) sweep(deadStickPlant, state, 1);
  hull.pos = { x: 620, z: 0 };
  sweep(deadStickPlant, state);
  assert.equal(eventsOf(rec, DEAD_STICK_EVENT, 'arrived').length, 1, 'arrived, but no escorted nod');
  assert.equal(eventsOf(rec, DEAD_STICK_EVENT, 'escorted').length, 0);
});

test('PL-249: escort predicate is pure; no roll no glider', () => {
  assert.equal(isEscortingDeadStick(100), true);
  assert.equal(isEscortingDeadStick(DEAD_STICK_TUNING.escortRangeWu + 1), false);
  const { rec } = pl249Setup(seedWithRoll('pl249', false, DEAD_STICK_TUNING.spawnChancePct));
  assert.equal(rec.spawns.length, 0);
});

// ---- determinism ----------------------------------------------------------------------------

test('determinism: identical scenarios produce identical event sequences', () => {
  function pl132Scenario() {
    const state = makeState({ meta: { seed: seedWithRoll('pl132', true, DARK_STRETCH_TUNING.spawnChancePct) } });
    const player = makePlayer(state, { x: 500, z: 60 });
    const { rec, bus, helpers } = makeHarness(state);
    darkStretchPlant.init({ state, bus, helpers });
    enterSector(bus);
    const hauler = spawnedBy(rec, 'pl132', 'lone_hauler')[0];
    const farBeacon = rec.spawns.find((e) => e.data.storyPropKind === 'dark_stretch_beacon' && e.pos.z < 0);
    sweep(darkStretchPlant, state, 1);
    let guard = 0;
    while (Math.hypot(hauler.pos.x - farBeacon.pos.x, hauler.pos.z - farBeacon.pos.z) > DARK_STRETCH_TUNING.arriveRangeWu && guard++ < 60) {
      hauler.pos.z -= 30;
      player.pos = { x: hauler.pos.x, z: hauler.pos.z + 40 };
      sweep(darkStretchPlant, state, 1, 0.5);
    }
    return {
      kinds: rec.events.filter((e) => e.event.startsWith('plants:')).map((e) => `${e.event}:${e.payload.kind ?? ''}`),
      voice: rec.voice.map((v) => v.text),
      spawnRoles: rec.spawns.map((e) => e.data.plants?.pl132?.role ?? e.data.storyPropKind ?? 'other'),
    };
  }
  const a = pl132Scenario();
  const b = pl132Scenario();
  assert.deepEqual(a.kinds, b.kinds, 'same event sequence');
  assert.deepEqual(a.voice, b.voice, 'same voice lines');
  assert.deepEqual(a.spawnRoles, b.spawnRoles, 'same spawn plan');
});

test('determinism: the same seed rolls the same spawn decision on every sector entry', () => {
  const seed = seedWithRoll('pl108', true, MOVING_HOUSE_TUNING.spawnChancePct);
  const counts = [];
  for (let run = 0; run < 3; run++) {
    const state = makeState({ meta: { seed } });
    makePlayer(state);
    const { rec, bus, helpers } = makeHarness(state);
    movingHousePlant.init({ state, bus, helpers });
    enterSector(bus);
    counts.push(rec.spawns.length);
  }
  assert.deepEqual(counts, [counts[0], counts[0], counts[0]], 'same seed, same world');
});
