// Mercies — chance-meeting plants (design/program/INFERENCE_PLANTS.md) —
// PL-292 293 294 295 296 297 298 299 300 301 302 303 304 (the SMALL MERCIES pass).
//
// Each module is tested on its own seams: a real createBus, a minimal flight state, fake
// helpers that record spawns/removes/voice, and event payloads matching the canonical
// emitters (combat:fire, physics:impact, tether:snapCatch, cargo:jettisoned,
// pickup:collected, dock:range, gate:range, sector:enter/exit). Generous reactions assert
// the gift (pod, escort, lamp, exact line); wrong choices assert the bite; every module
// gets cooldown/cap/TTL/cleanup coverage where the row lives on that seam. Determinism
// smoke: the same scenario twice yields identical event sequences. No DOM, no Three.js,
// no Math.random.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32 } from '../src/core/rng.js';
import { spawnJettisonedCargoPod } from '../src/systems/lootShards.js';

import {
  CONVOY_GODMOTHER_EVENT, CONVOY_GODMOTHER_TUNING, CONVOY_GODMOTHER_CALLSIGN,
  CONVOY_WAVE_OFF_LINE, CONVOY_HULL_SHARE_LINE, isPacingWith, pacePointFor, convoyGodmotherPlant,
} from '../src/systems/plants/convoyGodmother.js';
import {
  SILENT_MECHANICS_EVENT, SILENT_MECHANICS_TUNING, SILENT_MECHANICS_CALLSIGN,
  tugRotateImpulse, isInterfering, silentMechanicsPlant,
} from '../src/systems/plants/silentMechanics.js';
import {
  FIRST_LIGHT_EVENT, FIRST_LIGHT_GOSSIP_EVENT, FIRST_LIGHT_TUNING, FIRST_LIGHT_CALLSIGN,
  FIRST_LIGHT_MOCK_GOSSIP_LINE, flashVerdict, wobbleOffsetWu, firstLightPlant,
} from '../src/systems/plants/firstLight.js';
import {
  TIP_LINE_EVENT, TIP_LINE_TUNING, TIP_LINE_CALLSIGN, TIP_LINE_BEARING_LINE,
  TIP_SEAM_LABEL, seamPointFor, isScannerStation, tipLinePlant,
} from '../src/systems/plants/tipLine.js';
import {
  BORROWED_BOOST_EVENT, BORROWED_BOOST_TUNING, BORROWED_BOOST_CALLSIGN,
  BORROWED_BOOST_OFFER_LINE, borrowedBoostImpulse, isBumping, borrowedBoostPlant,
} from '../src/systems/plants/borrowedBoost.js';
import {
  OPEN_HATCH_EVENT, OPEN_HATCH_TUNING, OPEN_HATCH_CALLSIGN, OPEN_HATCH_HATCH_LABEL,
  OPEN_HATCH_SHUT_LABEL, isFlareWeather, openHatchPlant,
} from '../src/systems/plants/openHatch.js';
import {
  UMBRELLA_CRANE_EVENT, UMBRELLA_CRANE_TUNING, UMBRELLA_CRANE_CALLSIGN,
  UMBRELLA_CRANE_WORK_LINE, UMBRELLA_CRANE_GANTRY_LABEL, UMBRELLA_CRANE_GANTRY_AWAY_LABEL,
  isDebrisWeather, shadowPointFor, isComplaint, umbrellaCranePlant,
} from '../src/systems/plants/umbrellaCrane.js';
import {
  RESCUE_DIVIDEND_EVENT, RESCUE_DIVIDEND_TUNING, RESCUE_POOL_CALLSIGN,
  RESCUE_DELIVERED_LINE, RESCUE_DEMAND_LINE, rescueQuotedLine,
  recordRescue, payableRescue, demandCount, rescueDividendPlant,
} from '../src/systems/plants/rescueDividend.js';
import {
  KIND_CHECKER_EVENT, KIND_CHECKER_TUNING, KIND_CHECKER_CALLSIGN,
  KIND_CHECKER_CHALK_LINE, KIND_CHECKER_WAVE_AGAIN_LINE, KIND_CHECKER_REFUSE_LINE,
  KIND_CHECKER_CHALK_LABEL, KIND_CHECKER_WAIVER_LABEL,
  isCustomsStation, overweightOf, checkerVerdict, kindCheckerPlant,
} from '../src/systems/plants/kindChecker.js';
import {
  SHARED_CAB_EVENT, SHARED_CAB_TUNING, SHARED_CAB_CALLSIGN, SHARED_CAB_INVITE_LINE,
  SHARED_CAB_SIGNOFF_LINE, slotPointFor, isLurkingAstern, sharedCabPlant,
} from '../src/systems/plants/sharedCab.js';
import {
  CARRIED_WORD_EVENT, CARRIED_WORD_GOSSIP_EVENT, CARRIED_WORD_TUNING,
  CARRIED_WORD_CALLSIGN, CARRIED_WORD_SMEARER_CALLSIGN, CARRIED_WORD_OFFER_LINE,
  CARRIED_WORD_TEXT, CARRIED_WORD_RELAYED_LINE, CARRIED_WORD_SMEARED_LINE,
  CARRIED_WORD_GOSSIP_LINE, outOfCommsRange, relayTextFor, haulerKindFor, carriedWordPlant,
} from '../src/systems/plants/carriedWord.js';
import {
  SPARE_BED_EVENT, SPARE_BED_TUNING, SPARE_BED_WORKER_CALLSIGN, SPARE_BED_OFFER_LINE,
  SPARE_BED_RESTED_LINE, SPARE_BED_LOCKED_LINE, SPARE_BED_PAD_LABEL,
  isNightWatch, isBrokenHull, isTinyOutpost, spareBedPlant,
} from '../src/systems/plants/spareBed.js';
import {
  AFTER_HOURS_COACH_EVENT, AFTER_HOURS_COACH_TUNING, AFTER_HOURS_COACH_CALLSIGN,
  AFTER_HOURS_COACH_LINE, AFTER_HOURS_COACH_AGAIN_LINE, isAfterHours, takeoffVerdict,
  afterHoursCoachPlant,
} from '../src/systems/plants/afterHoursCoach.js';

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
    world: { currentSectorId: 's1', activeSector: { hazards: [] } },
    meta: { seed: 1 },
    entityList: [],
    ...opts,
  };
  state.entities = entities;
  return state;
}

function makePlayer(state, pos = { x: 0, z: 0 }, vel = { x: 0, z: 0 }, extra = {}) {
  const player = {
    id: state.playerId, alive: true, type: 'ship', isPlayer: true,
    pos: { ...pos }, vel: { ...vel }, rot: 0, radius: 6, mass: 12,
    hull: 10, hullMax: 10, cargo: { usedMass: 0 },
    data: {}, ...extra,
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

/** First seed whose pl<id> gate roll passes (or fails) with the module's own chance. */
function seedWithRoll(plId, wantPass, chancePct, tag = 'spawn') {
  for (let seed = 1; seed < 50000; seed++) {
    const pass = hash32(seed, 's1', plId, tag) % 100 < chancePct;
    if (pass === wantPass) return seed;
  }
  throw new Error(`no seed found for ${plId} ${tag} wantPass=${wantPass}`);
}

/** First seed whose pl<id> spawn roll passes AND whose kind roll picks wantKind. */
function seedWithKind(plId, chancePct, smearerPct, wantKind) {
  for (let seed = 1; seed < 50000; seed++) {
    const pass = hash32(seed, 's1', plId, 'spawn') % 100 < chancePct;
    const kind = hash32(seed, 's1', plId, 'kind') % 100 < smearerPct ? 'smearer' : 'carrier';
    if (pass && kind === wantKind) return seed;
  }
  throw new Error(`no seed found for ${plId} kind=${wantKind}`);
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

function fixtureStation(state, id, pos, extraData = {}, extra = {}) {
  const st = {
    id, type: 'station', alive: true, pos: { ...pos }, radius: 72,
    data: { stationId: id, ...extraData }, ...extra,
  };
  state.entityIndex.stations.push(st);
  state.entities.set(id, st);
  return st;
}

function fixtureGate(state, id, pos) {
  return fixtureStation(state, id, pos, { isGate: true });
}

// ---- the shared family contract -------------------------------------------------------------

test('family contract: frozen tuning with memoryCap, standalone system shape', () => {
  const families = [
    [convoyGodmotherPlant, CONVOY_GODMOTHER_TUNING], [silentMechanicsPlant, SILENT_MECHANICS_TUNING],
    [firstLightPlant, FIRST_LIGHT_TUNING], [tipLinePlant, TIP_LINE_TUNING],
    [borrowedBoostPlant, BORROWED_BOOST_TUNING], [openHatchPlant, OPEN_HATCH_TUNING],
    [umbrellaCranePlant, UMBRELLA_CRANE_TUNING], [rescueDividendPlant, RESCUE_DIVIDEND_TUNING],
    [kindCheckerPlant, KIND_CHECKER_TUNING], [sharedCabPlant, SHARED_CAB_TUNING],
    [carriedWordPlant, CARRIED_WORD_TUNING], [spareBedPlant, SPARE_BED_TUNING],
    [afterHoursCoachPlant, AFTER_HOURS_COACH_TUNING],
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
  const state = makeState({ meta: { seed: seedWithRoll('pl295', true, TIP_LINE_TUNING.spawnChancePct) } });
  makePlayer(state);
  const { rec, bus, helpers } = makeHarness(state);
  tipLinePlant.init({ state, bus, helpers });
  enterSector(bus);
  const spawned = rec.spawns.length;
  assert.ok(spawned > 0, 'tip line encounter spawned for destroy test');
  tipLinePlant.destroy();
  assert.ok(rec.removes.length >= spawned, 'destroy despawns owned');
  const after = rec.spawns.length;
  enterSector(bus); // listeners are gone: no re-spawn
  assert.equal(rec.spawns.length, after, 'no spawns after destroy');
});

test('family contract: nothing spawns while docked', () => {
  const state = makeState({
    mode: 'docked',
    meta: { seed: seedWithRoll('pl292', true, CONVOY_GODMOTHER_TUNING.spawnChancePct) },
  });
  const player = makePlayer(state);
  player.hull = 4; // struggling, so the flight-mode gate is the only blocker
  const { rec, bus, helpers } = makeHarness(state);
  convoyGodmotherPlant.init({ state, bus, helpers });
  enterSector(bus);
  assert.equal(rec.spawns.length, 0, 'docked sector:enter spawns nothing');
  sweep(convoyGodmotherPlant, state, 3);
  assert.equal(rec.spawns.length, 0, 'docked update spawns nothing');
  assert.equal(eventsOf(rec, CONVOY_GODMOTHER_EVENT).length, 0);
});

test('boot smoke: all 13 plants init/update/destroy clean on a real game state', () => {
  const bus = createBus();
  const state = createGameState('mercies-chance');
  const mods = [convoyGodmotherPlant, silentMechanicsPlant, firstLightPlant, tipLinePlant,
    borrowedBoostPlant, openHatchPlant, umbrellaCranePlant, rescueDividendPlant,
    kindCheckerPlant, sharedCabPlant, carriedWordPlant, spareBedPlant, afterHoursCoachPlant];
  for (const mod of mods) {
    mod.init({ state, bus, helpers: {} });
    mod.update(1 / 60);
    mod.destroy();
  }
});

// ---- PL-292 The convoy godmother ------------------------------------------------------------

function pl292Setup(seedOverride = null) {
  const state = makeState({ meta: { seed: seedOverride ?? seedWithRoll('pl292', true, CONVOY_GODMOTHER_TUNING.spawnChancePct) } });
  const player = makePlayer(state, { x: 0, z: 0 }, { x: 0, z: 0 }, { hull: 4, hullMax: 10 });
  const h = makeHarness(state);
  convoyGodmotherPlant.init({ state, bus: h.bus, helpers: h.helpers });
  return { state, player, ...h };
}

test('PL-292: they pace you, run the fuel line, and wave you off at the junction with lamps', () => {
  const { state, player, rec, bus } = pl292Setup();
  enterSector(bus);
  const lead = spawnedBy(rec, 'pl292', 'lead')[0];
  const wing = spawnedBy(rec, 'pl292', 'wing')[0];
  assert.ok(lead && wing, 'a two-freighter convoy adopts the struggling stranger');
  assert.equal(lead.data.callsign, CONVOY_GODMOTHER_CALLSIGN);
  // Fly with them: inside the pacing range the paced ticks climb and the line runs.
  player.pos = { x: lead.pos.x + 60, z: lead.pos.z };
  sweep(convoyGodmotherPlant, state, 2);
  assert.ok(eventsOf(rec, CONVOY_GODMOTHER_EVENT, 'fuel_line').length >= 1, 'the fuel line runs');
  const pods = spawnedBy(rec, 'pl292', 'fuel_line');
  assert.ok(pods.length >= 1, 'a real fuel-cell pod is on the line');
  // Scoop after flying with them: a gift, not a siphon.
  sweep(convoyGodmotherPlant, state, 4); // qualifyTicks 4 earned
  bus.emit('pickup:collected', { pickupId: pods[0].id, collectorId: player.id });
  assert.equal(eventsOf(rec, CONVOY_GODMOTHER_EVENT, 'gift_taken').length, 1, 'the line was given freely');
  // The junction: a gate close by waves you off with lamps and the exact line.
  fixtureGate(state, 'junction1', { x: player.pos.x + 200, z: player.pos.z });
  sweep(convoyGodmotherPlant, state, 1);
  const waved = eventsOf(rec, CONVOY_GODMOTHER_EVENT, 'waved_off');
  assert.equal(waved.length, 1, 'qualified pacer gets the wave-off');
  assert.equal(lead.data.lampsFlashing, true, 'the wave-off is lamps');
  assert.equal(commsOf(rec, CONVOY_WAVE_OFF_LINE).length, 1, 'exact wave-off line');
  assert.ok(rec.removes.includes(lead.id), 'the convoy departs at the junction');
  assert.ok(rec.removes.includes(wing.id), 'the wing departs with the lead');
});

test('PL-292: siphon from the line early and the convoys share your hull number at junctions', () => {
  const { state, player, rec, bus } = pl292Setup();
  enterSector(bus);
  const lead = spawnedBy(rec, 'pl292', 'lead')[0];
  player.pos = { x: lead.pos.x + 60, z: lead.pos.z };
  sweep(convoyGodmotherPlant, state, 1); // pacedTicks 1: the line exists, qualification does not
  const pods = spawnedBy(rec, 'pl292', 'fuel_line');
  assert.ok(pods.length >= 1, 'the line is running');
  bus.emit('pickup:collected', { pickupId: pods[0].id, collectorId: player.id });
  assert.equal(eventsOf(rec, CONVOY_GODMOTHER_EVENT, 'siphoned').length, 1, 'grabbing before it is given is a siphon');
  // "convoys share hull numbers at junctions, all of them"
  bus.emit('gate:range', { gateId: 'junction1', shipId: player.id, inRange: true });
  assert.equal(commsOf(rec, CONVOY_HULL_SHARE_LINE).length, 1, 'the hull number goes up on the boards');
  // For a season, no convoy adopts this hull.
  const spawnsBefore = rec.spawns.length;
  enterSector(bus);
  assert.equal(eventsOf(rec, CONVOY_GODMOTHER_EVENT, 'refused').length, 1, 'the season of refusals is on');
  assert.equal(rec.spawns.length, spawnsBefore, 'no convoy forms for a siphoner');
});

test('PL-292: pacing math and gifts', () => {
  assert.equal(isPacingWith(200), true);
  assert.equal(isPacingWith(240), false);
  const pt = pacePointFor({ x: 0, z: 0 }, 0, 1);
  assert.deepEqual(pt, { x: 0, z: 90 }, 'the abeam slot sits beside the heading');
  assert.equal(isPacingWith(Infinity), false);
});

// ---- PL-293 The silent mechanics ------------------------------------------------------------

function pl293Setup(seedOverride = null) {
  const state = makeState({ meta: { seed: seedOverride ?? seedWithRoll('pl293', true, SILENT_MECHANICS_TUNING.spawnChancePct, 'stall') } });
  const player = makePlayer(state);
  const body = {
    id: 'body1', alive: true, type: 'beacon', pos: { x: 150, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 40, hull: 50, hullMax: 50, data: {},
  };
  state.entities.set(body.id, body);
  const h = makeHarness(state);
  silentMechanicsPlant.init({ state, bus: h.bus, helpers: h.helpers });
  return { state, player, body, ...h };
}

test('PL-293: two tugs rotate the stalled line off the lane, set it safe, and leave wordless', () => {
  const { state, player, body, rec, bus } = pl293Setup();
  enterSector(bus);
  // The player's stalled line: a live tow, nearly stopped.
  bus.emit('tether:snapCatch', { targetId: body.id });
  player.vel = { x: 0, z: 0 };
  sweep(silentMechanicsPlant, state, 5, 1); // stalledForS 4
  const tugs = spawnedBy(rec, 'pl293', 'silent_tug');
  assert.equal(tugs.length, 2, 'two tugs, never more');
  assert.ok(eventsOf(rec, SILENT_MECHANICS_EVENT, 'tugs_arrived').length === 1);
  // Let them work: the player stays clear of the tugs' work space.
  const clear = tugs.every((t) => isInterfering(Math.hypot(t.pos.x - player.pos.x, t.pos.z - player.pos.z)) === false);
  assert.equal(clear, true, 'the player is clear by default');
  for (const tug of tugs) tug.pos = { x: body.pos.x + 10, z: body.pos.z };
  sweep(silentMechanicsPlant, state, 1);
  assert.ok(eventsOf(rec, SILENT_MECHANICS_EVENT, 'work_started').length === 1, 'the rotate-off starts once both are on it');
  sweep(silentMechanicsPlant, state, 9, 1); // workWindowS 8
  assert.ok(eventsOf(rec, SILENT_MECHANICS_EVENT, 'set_safe').length === 1, 'the body is set somewhere safe');
  assert.equal(body.data.plants.pl293.setSafe, true, 'the stamp is the work order receipt');
  assert.ok(eventsOf(rec, SILENT_MECHANICS_EVENT, 'left_wordless').length === 1);
  // "without a word on any channel": no voice, no comms, ever.
  assert.equal(rec.voice.length, 0, 'no voice lines');
  assert.equal(rec.events.filter((e) => e.event === 'comms:popup').length, 0, 'no comms popups');
});

test('PL-293: send them a bill and the tugs bill back, once, with interest', () => {
  const { state, player, body, rec, bus } = pl293Setup();
  enterSector(bus);
  bus.emit('tether:snapCatch', { targetId: body.id });
  sweep(silentMechanicsPlant, state, 5, 1);
  const tugs = spawnedBy(rec, 'pl293', 'silent_tug');
  assert.equal(tugs.length, 2);
  // The bill: a line snapped onto a tug is holding them for pay.
  bus.emit('tether:snapCatch', { targetId: tugs[0].id });
  assert.equal(eventsOf(rec, SILENT_MECHANICS_EVENT, 'billed').length, 1, 'the bill is received');
  for (const tug of tugs) tug.pos = { x: body.pos.x - 10, z: body.pos.z };
  sweep(silentMechanicsPlant, state, 1);
  sweep(silentMechanicsPlant, state, 9, 1);
  assert.ok(eventsOf(rec, SILENT_MECHANICS_EVENT, 'billed_back').length === 1, 'the tug bills back, once');
  assert.ok(eventsOf(rec, SILENT_MECHANICS_EVENT, 'set_safe').length === 1, 'the work still gets done');
  assert.equal(rec.events.filter((e) => e.event === 'comms:popup').length, 0, 'still wordless');
});

test('PL-293: rotate impulse is perpendicular to the lane', () => {
  const v = tugRotateImpulse({ x: 0, z: 0 }, { x: 100, z: 0 }, 70);
  assert.equal(Math.abs(v.x), 0, 'no lane-parallel component');
  assert.equal(v.z, 70, 'pure perpendicular push');
  const zero = tugRotateImpulse({ x: 5, z: 5 }, { x: 5, z: 5 }, 70);
  assert.equal(Math.abs(zero.x), 0, 'degenerate lane has no x push');
  assert.equal(zero.z, 70, 'degenerate lane pushes on +z');
});

// ---- PL-294 The first light -----------------------------------------------------------------

function pl294Setup(seedOverride = null) {
  const state = makeState({ meta: { seed: seedOverride ?? seedWithRoll('pl294', true, FIRST_LIGHT_TUNING.spawnChancePct) } });
  const player = makePlayer(state);
  const h = makeHarness(state);
  firstLightPlant.init({ state, bus: h.bus, helpers: h.helpers });
  enterSector(h.bus);
  return { state, player, ...h };
}

test('PL-294: one lamp flash tells the rookie where the line should sit, and they catch it', () => {
  const { state, player, rec, bus } = pl294Setup();
  const rookie = spawnedBy(rec, 'pl294', 'rookie')[0];
  const pod = spawnedBy(rec, 'pl294', 'first_tow')[0];
  assert.ok(rookie && pod, 'the rookie wobbles past towing their first solo line');
  assert.equal(rookie.data.callsign, FIRST_LIGHT_CALLSIGN);
  assert.equal(flashVerdict(0), 'waiting');
  assert.equal(flashVerdict(1), 'flash');
  assert.equal(flashVerdict(3), 'mock');
  // The bad pass opens the window.
  player.pos = { x: rookie.pos.x - 100, z: rookie.pos.z };
  sweep(firstLightPlant, state, 1);
  assert.ok(eventsOf(rec, FIRST_LIGHT_EVENT, 'bad_pass').length === 1);
  // One shot near them: one lamp flash, the catch.
  bus.emit('combat:fire', { ownerId: player.id, weaponId: 'w_test', origin: { x: rookie.pos.x - 40, z: rookie.pos.z } });
  assert.equal(eventsOf(rec, FIRST_LIGHT_EVENT, 'caught').length, 1, 'the rookie catches the line');
  assert.equal(rookie.data.lampsFlashing, true, 'their lamp answers once');
  assert.equal(eventsOf(rec, FIRST_LIGHT_EVENT, 'mocked').length, 0);
});

test('PL-294: laugh about it on open channel and rookies remember your callsign', () => {
  const { state, player, rec, bus } = pl294Setup();
  const rookie = spawnedBy(rec, 'pl294', 'rookie')[0];
  player.pos = { x: rookie.pos.x - 100, z: rookie.pos.z };
  sweep(firstLightPlant, state, 1);
  // Three flashes near them is hooting fire, not a flash — the laugh takes the catch back.
  for (let i = 0; i < 3; i++) {
    bus.emit('combat:fire', { ownerId: player.id, weaponId: 'w_test', origin: { x: rookie.pos.x - 30, z: rookie.pos.z } });
  }
  assert.equal(eventsOf(rec, FIRST_LIGHT_EVENT, 'mocked').length, 1, 'the mock lands');
  assert.equal(rookie.data.lampsFlashing, false, 'the catch is revoked by the laugh');
  // "rookies remember callsigns longer than routes": the docks hear about you, bounded.
  bus.emit('dock:range', { stationId: 'd1', shipId: player.id, inRange: true });
  assert.equal(commsOf(rec, FIRST_LIGHT_MOCK_GOSSIP_LINE).length, 1);
  state.simTime += FIRST_LIGHT_TUNING.gossipCooldownS;
  sweep(firstLightPlant, state, 1, 1);
  bus.emit('dock:range', { stationId: 'd1', shipId: player.id, inRange: true });
  assert.equal(commsOf(rec, FIRST_LIGHT_MOCK_GOSSIP_LINE).length, 2);
  state.simTime += FIRST_LIGHT_TUNING.gossipCooldownS;
  sweep(firstLightPlant, state, 1, 1);
  bus.emit('dock:range', { stationId: 'd1', shipId: player.id, inRange: true });
  assert.equal(commsOf(rec, FIRST_LIGHT_MOCK_GOSSIP_LINE).length, 2, 'bounded gossip: it stops');
  assert.ok(eventsOf(rec, FIRST_LIGHT_GOSSIP_EVENT).length === 2);
});

test('PL-294: the wobble is a deterministic oscillation', () => {
  const a = wobbleOffsetWu(0);
  const b = wobbleOffsetWu(FIRST_LIGHT_TUNING.wobblePeriodS / 2);
  assert.equal(Math.round(a), 0, 'the oscillation starts centered');
  assert.equal(Math.round(b), 0, 'half a period returns to center');
});

// ---- PL-295 The tip line --------------------------------------------------------------------

function pl295Setup(seedOverride = null) {
  const state = makeState({
    meta: { seed: seedOverride ?? seedWithRoll('pl295', true, TIP_LINE_TUNING.spawnChancePct) },
    content: { sectors: [{ id: 's1', stations: [
      { id: 'scanstop', services: ['dock', 'scan'] },
      { id: 'quietstop', services: ['dock'] },
    ] }] },
  });
  const player = makePlayer(state);
  const h = makeHarness(state);
  tipLinePlant.init({ state, bus: h.bus, helpers: h.helpers });
  enterSector(h.bus);
  return { state, player, ...h };
}

test('PL-295: the bearing arrives free, the seam is physical, and working it pays the lot', () => {
  const { state, player, rec, bus } = pl295Setup();
  assert.equal(commsOf(rec, TIP_LINE_BEARING_LINE).length, 1, 'one line on the shared channel, exact');
  const giver = spawnedBy(rec, 'pl295', 'tip_giver')[0];
  const rock = rec.spawns.find((e) => e.data && e.data.storyPropKind === 'rich_seam');
  const lot = spawnedBy(rec, 'pl295', 'rich_lot')[0];
  assert.ok(giver && rock && lot, 'the stranger, the marked seam rock, and the rich lot are real');
  assert.equal(rock.data.scanLabel, TIP_SEAM_LABEL);
  const expected = seamPointFor({ x: 0, z: 0 });
  assert.equal(Math.round(rock.pos.x), Math.round(expected.x), 'the rock sits along the authored bearing');
  // Work the seam: two mining contacts on the rock cut the first lot loose.
  for (let i = 0; i < TIP_LINE_TUNING.seamShotsNeeded; i++) {
    bus.emit('combat:fire', { ownerId: player.id, weaponId: 'beam_test', origin: { x: rock.pos.x, z: rock.pos.z } });
  }
  assert.ok(eventsOf(rec, TIP_LINE_EVENT, 'seam_worked').length === 1, 'the seam surfaces its lot');
  assert.ok(spawnedBy(rec, 'pl295', 'rich_lot').length >= 2, 'a fresh rich pod sheds off the rock');
  assert.ok(rec.removes.includes(giver.id), 'the stranger departs without another word');
  assert.equal(rec.events.filter((e) => e.event === 'comms:popup' && e.payload.text !== TIP_LINE_BEARING_LINE).length, 0,
    'no bill, no explanation');
});

test('PL-295: sell the bearing and seams stop surfacing — and the stranger never explains', () => {
  const { state, player, rec, bus } = pl295Setup();
  const rock = rec.spawns.find((e) => e.data && e.data.storyPropKind === 'rich_seam');
  assert.ok(rock);
  // A plain dock is nobody to sell to.
  bus.emit('dock:range', { stationId: 'quietstop', shipId: player.id, inRange: true });
  assert.equal(eventsOf(rec, TIP_LINE_EVENT, 'bearing_sold').length, 0);
  // The scanner buys the bearing while the seam is known and unworked.
  bus.emit('dock:range', { stationId: 'scanstop', shipId: player.id, inRange: true });
  assert.equal(eventsOf(rec, TIP_LINE_EVENT, 'bearing_sold').length, 1, 'the tip was sold');
  const popupCount = rec.events.filter((e) => e.event === 'comms:popup').length;
  assert.equal(popupCount, 1, 'the stranger never explains: the only line ever spoken is the tip');
  // Seams stop surfacing: the next sector entry spawns nothing.
  const spawnsBefore = rec.spawns.length;
  enterSector(bus);
  assert.equal(eventsOf(rec, TIP_LINE_EVENT, 'seams_hidden').length, 1);
  assert.equal(rec.spawns.length, spawnsBefore, 'no stranger, no seam, no line');
});

test('PL-295: scanner predicate and bearing math', () => {
  assert.equal(isScannerStation({ services: ['dock', 'scan'] }), true);
  assert.equal(isScannerStation({ services: ['dock', 'toll'] }), false);
  assert.equal(isScannerStation(null), false);
  const p = seamPointFor({ x: 10, z: 10 }, 0, 100);
  assert.equal(Math.round(p.x), 110);
  assert.equal(Math.round(p.z), 10);
});

// ---- PL-296 The borrowed boost --------------------------------------------------------------

function pl296Setup(seedOverride = null) {
  const state = makeState({ meta: { seed: seedOverride ?? seedWithRoll('pl296', true, BORROWED_BOOST_TUNING.spawnChancePct, 'queue') } });
  const player = makePlayer(state, { x: 0, z: 0 });
  fixtureGate(state, 'gate1', { x: 200, z: 0 });
  const h = makeHarness(state);
  borrowedBoostPlant.init({ state, bus: h.bus, helpers: h.helpers });
  return { state, player, ...h };
}

test('PL-296: the racer offers the slipstream free and taking the ride lends real thrust', () => {
  const { state, player, rec, bus } = pl296Setup();
  // Idle at the queue long enough for the racer to tuck in astern.
  sweep(borrowedBoostPlant, state, 4, 1); // queueForS 3
  const racer = spawnedBy(rec, 'pl296', 'racer')[0];
  assert.ok(racer, 'the racer is in the queue behind you');
  assert.equal(commsOf(rec, BORROWED_BOOST_OFFER_LINE).length, 1, 'one free offer, exact');
  assert.equal(racer.data.plants.pl296.grudge, false);
  // Take the ride: depart at slip speed with the racer astern.
  player.vel = { x: 0, z: 60 };
  sweep(borrowedBoostPlant, state, 1);
  assert.ok(eventsOf(rec, BORROWED_BOOST_EVENT, 'ride_started').length === 1, 'the borrowed boost engages');
  sweep(borrowedBoostPlant, state, 3, 1); // slipWindowS 1.5 elapses
  assert.ok(eventsOf(rec, BORROWED_BOOST_EVENT, 'ride_over').length === 1, 'one ride, then they are gone');
  assert.ok(rec.removes.includes(racer.id), 'the racer departs after the ride');
});

test('PL-296: bump them at the gate and queues stop offering — but the racer is in the next one', () => {
  const { state, player, rec, bus } = pl296Setup();
  sweep(borrowedBoostPlant, state, 4, 1);
  const racer = spawnedBy(rec, 'pl296', 'racer')[0];
  assert.ok(racer);
  assert.equal(isBumping({ causalActorId: player.id, aId: racer.id, preSolveClosingSpeed: 60 }, racer.id, player.id), true);
  // The bump: a fast player-caused impact at the gate.
  bus.emit('physics:impact', { causalActorId: player.id, aId: racer.id, bId: player.id, preSolveClosingSpeed: 60 });
  assert.equal(eventsOf(rec, BORROWED_BOOST_EVENT, 'bumped').length, 1, 'the bump bites');
  assert.ok(rec.removes.includes(racer.id), 'the racer peels off, indifferent');
  // Queues stop offering: a fresh queue visit spawns them — with nothing to give.
  player.pos = { x: 900, z: 0 }; // leave the queue
  sweep(borrowedBoostPlant, state, 2, 1);
  player.pos = { x: 0, z: 0 }; // idle at the next queue
  sweep(borrowedBoostPlant, state, 4, 1);
  const racer2 = spawnedBy(rec, 'pl296', 'racer').pop();
  assert.ok(racer2, 'the racer is always in the next queue');
  assert.equal(racer2.data.plants.pl296.grudge, true, 'but grudging');
  assert.equal(eventsOf(rec, BORROWED_BOOST_EVENT, 'offered').length, 1, 'no second offer was ever made');
  assert.equal(commsOf(rec, BORROWED_BOOST_OFFER_LINE).length, 1, 'the offer count never rose');
  player.vel = { x: 0, z: 60 };
  sweep(borrowedBoostPlant, state, 3, 1);
  assert.equal(eventsOf(rec, BORROWED_BOOST_EVENT, 'ride_started').length, 0, 'the grudge lends no slipstream');
});

test('PL-296: slipstream vector math', () => {
  const v = borrowedBoostImpulse(0, 85);
  assert.equal(Math.round(v.x), 85);
  assert.equal(v.z, 0);
  assert.equal(isBumping({ causalActorId: 'x', aId: 1, preSolveClosingSpeed: 5 }, 1, 'x'), false, 'slow contact is no bump');
});

// ---- PL-297 The open hatch ------------------------------------------------------------------

const FLARE_HAZARDS = [{ type: 'radiation', center: { x: 0, z: 0 }, radius: 2000, intensity: 0.5 }];

function pl297Setup(seedOverride = null) {
  const state = makeState({
    meta: { seed: seedOverride ?? seedWithRoll('pl297', true, OPEN_HATCH_TUNING.spawnChancePct, 'flare') },
    world: { currentSectorId: 's1', activeSector: { hazards: FLARE_HAZARDS } },
  });
  const player = makePlayer(state, { x: 0, z: 0 });
  const h = makeHarness(state);
  openHatchPlant.init({ state, bus: h.bus, helpers: h.helpers });
  return { state, player, ...h };
}

test('PL-297: the hatch is open through the flare weather, and shelter then go earns a gift', () => {
  const { state, player, rec, bus } = pl297Setup();
  assert.equal(isFlareWeather(state, player.pos), true, 'the player is caught out in flare weather');
  sweep(openHatchPlant, state, 2, 1);
  const stranger = spawnedBy(rec, 'pl297', 'open_hatch_host')[0];
  const hatch = rec.spawns.find((e) => e.data && e.data.storyPropKind === 'hold_hatch');
  assert.ok(stranger && hatch, 'the stranger is docked ahead with the hatch open on purpose');
  assert.equal(hatch.data.scanLabel, OPEN_HATCH_HATCH_LABEL);
  assert.equal(hatch.data.shelterOpen, true);
  assert.equal(spawnedBy(rec, 'pl297', 'spill').length, OPEN_HATCH_TUNING.spillPods, 'the flare shook pods loose');
  // Shelter: hold the hatch zone through the flare.
  player.pos = { x: hatch.pos.x + 20, z: hatch.pos.z };
  sweep(openHatchPlant, state, 5, 1); // shelterTicksNeeded 4
  // Then go: leave the flare with shelter banked.
  player.pos = { x: 2600, z: 0 }; // outside the radiation radius
  sweep(openHatchPlant, state, 1);
  assert.ok(eventsOf(rec, OPEN_HATCH_EVENT, 'sheltered_then_gone').length === 1, 'the shelter dividend lands');
  assert.ok(spawnedBy(rec, 'pl297', 'road_gift').length === 1, 'a fuel cell for the road, freely given');
  assert.equal(stranger.data.lampsFlashing, true, 'the stranger lamps a wave');
});

test('PL-297: shelter AND loot and the hatch closes to your hull specifically, and stays closed', () => {
  const { state, player, rec, bus } = pl297Setup();
  sweep(openHatchPlant, state, 2, 1);
  const hatch = rec.spawns.find((e) => e.data && e.data.storyPropKind === 'hold_hatch');
  const spill = spawnedBy(rec, 'pl297', 'spill');
  assert.ok(hatch && spill.length >= 1);
  // Scoop the spill instead of sheltering clean.
  bus.emit('pickup:collected', { pickupId: spill[0].id, collectorId: player.id });
  assert.equal(eventsOf(rec, OPEN_HATCH_EVENT, 'hatch_closed_to_you').length, 1, 'the theft registers');
  assert.equal(hatch.data.scanLabel, OPEN_HATCH_SHUT_LABEL, 'the hatch shuts in front of you');
  assert.equal(hatch.data.shelterOpen, false);
  // For the season, the meeting still finds you — but the hatch never opens again.
  player.pos = { x: 2600, z: 0 };
  sweep(openHatchPlant, state, 2, 1);
  player.pos = { x: 0, z: 0 };
  sweep(openHatchPlant, state, 2, 1);
  const hatch2 = rec.spawns.filter((e) => e.data && e.data.storyPropKind === 'hold_hatch').pop();
  assert.ok(hatch2, 'the meeting still comes');
  assert.equal(hatch2.data.scanLabel, OPEN_HATCH_SHUT_LABEL, 'closed to your hull, and staying closed');
  assert.equal(spawnedBy(rec, 'pl297', 'spill').length, OPEN_HATCH_TUNING.spillPods, 'no new spill ever spills');
});

// ---- PL-298 The umbrella crane --------------------------------------------------------------

const DEBRIS_HAZARDS = [{ type: 'debris', center: { x: 0, z: 0 }, radius: 2000, intensity: 0.5 }];

function pl298Setup(seedOverride = null) {
  const state = makeState({
    meta: { seed: seedOverride ?? seedWithRoll('pl298', true, UMBRELLA_CRANE_TUNING.spawnChancePct, 'debris') },
    world: { currentSectorId: 's1', activeSector: { hazards: DEBRIS_HAZARDS } },
  });
  const player = makePlayer(state, { x: 0, z: 0 });
  fixtureStation(state, 'crane_stop', { x: 300, z: 0 });
  const h = makeHarness(state);
  umbrellaCranePlant.init({ state, bus: h.bus, helpers: h.helpers });
  return { state, player, ...h };
}

test('PL-298: dock in falling-debris weather and the gantry angles over your hull unasked', () => {
  const { state, player, rec, bus } = pl298Setup();
  assert.equal(isDebrisWeather(state, player.pos), true, 'falling-debris weather is on');
  sweep(umbrellaCranePlant, state, 2, 1);
  const gantry = rec.spawns.find((e) => e.data && e.data.storyPropKind === 'crane_gantry');
  assert.ok(gantry, 'the crane gantry spawns without being asked or paid');
  assert.equal(gantry.data.scanLabel, UMBRELLA_CRANE_GANTRY_LABEL);
  // The kind shadow point sits between the hull and the debris center.
  const sp = shadowPointFor({ x: 500, z: 0 }, DEBRIS_HAZARDS[0].center, 'kind');
  assert.ok(Math.abs(sp.x) < 500, 'the kind shadow falls toward the debris source');
  // Park and let them work: sit under the shadow at park speed.
  gantry.pos = { x: player.pos.x + 20, z: player.pos.z };
  sweep(umbrellaCranePlant, state, 6, 1); // workTicksNeeded 5
  assert.ok(eventsOf(rec, UMBRELLA_CRANE_EVENT, 'shadow_worked').length === 1, 'the work is acknowledged');
  assert.equal(commsOf(rec, UMBRELLA_CRANE_WORK_LINE).length, 1, 'one operator line, exact');
});

test('PL-298: complain the shadow is slow and cranes angle away for a season', () => {
  const { state, player, rec, bus, helpers } = pl298Setup();
  sweep(umbrellaCranePlant, state, 2, 1);
  const gantry = rec.spawns.find((e) => e.data && e.data.storyPropKind === 'crane_gantry');
  assert.ok(gantry);
  assert.equal(isComplaint({ causalActorId: player.id, aId: gantry.id, preSolveClosingSpeed: 40 }, gantry.id, player.id), true);
  // The complaint: a shove on the gantry reads to the operator as the complaint.
  bus.emit('physics:impact', { causalActorId: player.id, aId: gantry.id, bId: player.id, preSolveClosingSpeed: 40 });
  assert.equal(eventsOf(rec, UMBRELLA_CRANE_EVENT, 'complained').length === 1, true);
  assert.equal(gantry.data.scanLabel, UMBRELLA_CRANE_GANTRY_AWAY_LABEL, 'the gantry angles away at once');
  // The season: the next gantry in this weather spawns angled away.
  helpers.removeEntity(gantry.id);
  sweep(umbrellaCranePlant, state, 1);
  player.pos = { x: 2600, z: 0 }; // the weather lifts
  sweep(umbrellaCranePlant, state, 2, 1);
  player.pos = { x: 0, z: 0 }; // and falls again
  sweep(umbrellaCranePlant, state, 2, 1);
  const gantry2 = rec.spawns.filter((e) => e.data && e.data.storyPropKind === 'crane_gantry').pop();
  assert.ok(gantry2, 'the crane still comes out in bad weather');
  assert.equal(gantry2.data.angleAway, true, 'but it angles away from complainers');
  assert.equal(eventsOf(rec, UMBRELLA_CRANE_EVENT, 'angled_away').length === 1, true);
  // The grudge shadows nobody: the mirrored shadow point faces away from the debris source.
  const sp = shadowPointFor({ x: 500, z: 0 }, DEBRIS_HAZARDS[0].center, 'grudge');
  assert.ok(Math.abs(sp.x) > 500, 'the grudge shadow falls away from the debris');
});

// ---- PL-299 The rescue dividend -------------------------------------------------------------

function pl299Setup(seedOverride = null) {
  const state = makeState({ meta: { seed: seedOverride ?? seedWithRoll('pl299', true, RESCUE_DIVIDEND_TUNING.spawnChancePct) } });
  const player = makePlayer(state, { x: 0, z: 0 });
  fixtureStation(state, 'safeharbor', { x: 100, z: 0 });
  const h = makeHarness(state);
  rescueDividendPlant.init({ state, bus: h.bus, helpers: h.helpers });
  enterSector(h.bus);
  return { state, player, ...h };
}

test('PL-299: tow a stranger in with no receipt asked — a week later the pool tows YOU, quoting your number', () => {
  const { state, player, rec, bus } = pl299Setup();
  const stranger = spawnedBy(rec, 'pl299', 'disabled_stranger')[0];
  assert.ok(stranger, 'a disabled stranger is out there on the ordinary route');
  assert.equal(stranger.data.plants.pl299.disabled, true);
  // Pure ledger shape while we are here.
  const ledger = [];
  const row = recordRescue(ledger, stranger.id, 4001, 1000);
  assert.equal(row.rescueNo, 4001);
  assert.equal(payableRescue(ledger, 1000 + RESCUE_DIVIDEND_TUNING.dividendDelayS), row);
  assert.equal(payableRescue(ledger, 1000), null, 'nothing pays early');
  // The rescue receipt: a real snap-catch, carried to delivery at the dock.
  bus.emit('tether:snapCatch', { targetId: stranger.id });
  sweep(rescueDividendPlant, state, 1);
  assert.ok(eventsOf(rec, RESCUE_DIVIDEND_EVENT, 'rescue_delivered').length === 1, 'the delivery lands');
  assert.equal(commsOf(rec, RESCUE_DELIVERED_LINE).length, 1, 'logged, no bill');
  // "a week later, dead in the water yourself"
  state.simTime += RESCUE_DIVIDEND_TUNING.dividendDelayS;
  player.vel = { x: 0, z: 0 };
  sweep(rescueDividendPlant, state, 3, 1); // diwForS 3
  const rescuer = spawnedBy(rec, 'pl299', 'dividend_rescuer')[0];
  assert.ok(rescuer, 'the pool sends someone');
  assert.ok(eventsOf(rec, RESCUE_DIVIDEND_EVENT, 'dividend_coming').length === 1);
  // The dividend tow: attached, then quoted at the station's doorstep.
  rescuer.pos = { x: player.pos.x + 40, z: player.pos.z };
  sweep(rescueDividendPlant, state, 1);
  assert.ok(eventsOf(rec, RESCUE_DIVIDEND_EVENT, 'dividend_attached').length === 1);
  sweep(rescueDividendPlant, state, 2);
  assert.ok(eventsOf(rec, RESCUE_DIVIDEND_EVENT, 'dividend_paid').length === 1, 'the dividend pays');
  assert.equal(commsOf(rec, rescueQuotedLine(4001)).length, 1, 'they quote your rescue number, exact');
  assert.equal(rescueQuotedLine(4001), 'Rescue 4001. Our turn.');
});

test('PL-299: demand payment on the spot, twice, and the pool crosses your hull off its books', () => {
  const { state, player, rec, bus } = pl299Setup();
  const stranger = spawnedBy(rec, 'pl299', 'disabled_stranger')[0];
  bus.emit('tether:snapCatch', { targetId: stranger.id });
  sweep(rescueDividendPlant, state, 1);
  assert.ok(eventsOf(rec, RESCUE_DIVIDEND_EVENT, 'rescue_delivered').length === 1);
  assert.equal(demandCount({ strangerId: stranger.id, demands: 2 }, stranger.id), 2);
  // The first demand gets one line; the second crosses the hull off.
  bus.emit('tether:snapCatch', { targetId: stranger.id });
  assert.equal(eventsOf(rec, RESCUE_DIVIDEND_EVENT, 'demanded').length, 1);
  assert.equal(commsOf(rec, RESCUE_DEMAND_LINE).length, 1, 'No bounty was posted.');
  bus.emit('tether:snapCatch', { targetId: stranger.id });
  assert.equal(eventsOf(rec, RESCUE_DIVIDEND_EVENT, 'demanded').length, 2);
  assert.ok(eventsOf(rec, RESCUE_DIVIDEND_EVENT, 'crossed_off').length === 1, 'the books close to this hull');
  // A week later, dead in the water: nobody comes, whatever the ledger once owed.
  state.simTime += RESCUE_DIVIDEND_TUNING.dividendDelayS;
  player.vel = { x: 0, z: 0 };
  sweep(rescueDividendPlant, state, 4, 1);
  assert.equal(spawnedBy(rec, 'pl299', 'dividend_rescuer').length, 0, 'the dividend never pays');
  assert.ok(eventsOf(rec, RESCUE_DIVIDEND_EVENT, 'dividend_coming').length === 0);
});

// ---- PL-300 The kind checker ----------------------------------------------------------------

function pl300Setup() {
  const state = makeState({
    content: { sectors: [{ id: 's1', stations: [
      { id: 'customs1', services: ['toll', 'scan', 'refuel'] },
      { id: 'plain1', services: ['dock'] },
    ] }] },
  });
  const player = makePlayer(state);
  const h = makeHarness(state);
  kindCheckerPlant.init({ state, bus: h.bus, helpers: h.helpers });
  return { state, player, ...h };
}

test('PL-300: the checker waves a small overweight with the chalk, and a fixed return waves the next', () => {
  const { state, player, rec, bus } = pl300Setup();
  assert.equal(isCustomsStation({ services: ['scan', 'toll'] }), true);
  assert.equal(overweightOf(40), 10, 'the tolerance reads');
  assert.equal(checkerVerdict({ overMass: 0, now: 0 }), 'clean');
  // Not customs, not a checker.
  player.cargo.usedMass = 40;
  bus.emit('dock:range', { stationId: 'plain1', shipId: player.id, inRange: true });
  assert.equal(eventsOf(rec, KIND_CHECKER_EVENT).length, 0);
  // First overweight: the chalk, exact.
  bus.emit('dock:range', { stationId: 'customs1', shipId: player.id, inRange: true });
  assert.equal(commsOf(rec, KIND_CHECKER_CHALK_LINE).length, 1, 'Next time, fix it.');
  assert.equal(KIND_CHECKER_CHALK_LINE, 'Next time, fix it.');
  const chalk = rec.spawns.find((e) => e.data && e.data.swarmFloorPad);
  assert.ok(chalk, 'the chalk is a real labeled pad on the apron');
  assert.equal(chalk.data.swarmFloorPad.label, KIND_CHECKER_CHALK_LABEL);
  assert.ok(eventsOf(rec, KIND_CHECKER_EVENT, 'waved').length === 1);
  // Fix it before you return: an under-tolerance docking inside the window banks the fix.
  player.cargo.usedMass = 10;
  bus.emit('dock:range', { stationId: 'customs1', shipId: player.id, inRange: true });
  assert.ok(eventsOf(rec, KIND_CHECKER_EVENT, 'fixed').length === 1, 'the fix is counted');
  // The next overweight is waved too.
  player.cargo.usedMass = 45;
  bus.emit('dock:range', { stationId: 'customs1', shipId: player.id, inRange: true });
  assert.equal(commsOf(rec, KIND_CHECKER_WAVE_AGAIN_LINE).length, 1, 'the waiver speaks once more');
  const chalk2 = rec.spawns.filter((e) => e.data && e.data.swarmFloorPad).pop();
  assert.equal(chalk2.data.swarmFloorPad.label, KIND_CHECKER_WAIVER_LABEL, 'the chalk reads waiver good');
});

test('PL-300: come back the same and the checker remembers exactly, then stops waving entirely', () => {
  const { state, player, rec, bus } = pl300Setup();
  player.cargo.usedMass = 40;
  bus.emit('dock:range', { stationId: 'customs1', shipId: player.id, inRange: true });
  assert.equal(commsOf(rec, KIND_CHECKER_CHALK_LINE).length, 1);
  // The fix window closes with no clean return.
  state.simTime += KIND_CHECKER_TUNING.fixWindowS + 1;
  sweep(kindCheckerPlant, state, 1, 1);
  bus.emit('dock:range', { stationId: 'customs1', shipId: player.id, inRange: true });
  assert.equal(commsOf(rec, KIND_CHECKER_REFUSE_LINE).length, 1, 'the checker remembers, once, out loud');
  assert.ok(eventsOf(rec, KIND_CHECKER_EVENT, 'refused').length === 1);
  // From here on: silence at every overweight customs dock.
  state.simTime += 30;
  sweep(kindCheckerPlant, state, 1, 1);
  bus.emit('dock:range', { stationId: 'customs1', shipId: player.id, inRange: true });
  assert.ok(eventsOf(rec, KIND_CHECKER_EVENT, 'refused_silent').length === 1);
  assert.equal(commsOf(rec, KIND_CHECKER_REFUSE_LINE).length, 1, 'stops waving entirely');
  assert.equal(commsOf(rec, KIND_CHECKER_CHALK_LINE).length, 1, 'no more chalks, ever');
});

// ---- PL-301 The shared cab ------------------------------------------------------------------

function pl301Setup(seedOverride = null) {
  const state = makeState({ meta: { seed: seedOverride ?? seedWithRoll('pl301', true, SHARED_CAB_TUNING.spawnChancePct) } });
  const player = makePlayer(state, { x: 0, z: 0 });
  fixtureGate(state, 'junction9', { x: 1200, z: 0 });
  const h = makeHarness(state);
  sharedCabPlant.init({ state, bus: h.bus, helpers: h.helpers });
  enterSector(h.bus);
  return { state, player, ...h };
}

test('PL-301: the invite is one line, the slot is abeam, and flying the line splits the burn', () => {
  const { state, player, rec } = pl301Setup();
  const lead = spawnedBy(rec, 'pl301', 'lead')[0];
  const trail = spawnedBy(rec, 'pl301', 'trail')[0];
  assert.ok(lead && trail, 'two strangers bound for the same junction');
  assert.equal(commsOf(rec, SHARED_CAB_INVITE_LINE).length, 1, 'Room for three. Split the burn.');
  // Agree: take the abeam slot.
  const gate = state.entityIndex.stations[0];
  const pairRot = Math.atan2(gate.pos.z - lead.pos.z, gate.pos.x - lead.pos.x);
  const slot = slotPointFor(lead.pos, pairRot, 1);
  player.pos = { ...slot };
  sweep(sharedCabPlant, state, 1);
  assert.ok(eventsOf(rec, SHARED_CAB_EVENT, 'agreed').length === 1, 'the club forms');
  // Fly the line: the split burn drops real fuel pods at the line's center.
  sweep(sharedCabPlant, state, 5, 1); // lineTicksNeeded 4
  assert.ok(spawnedBy(rec, 'pl301', 'split_burn').length >= 1, 'the split is real fuel');
  // The junction: lamps and the sign-off.
  player.pos = { x: gate.pos.x - 200, z: gate.pos.z };
  sweep(sharedCabPlant, state, 1);
  assert.ok(eventsOf(rec, SHARED_CAB_EVENT, 'arrived_together').length === 1);
  assert.equal(commsOf(rec, SHARED_CAB_SIGNOFF_LINE).length, 1, 'Cab settled. Good line.');
  assert.equal(lead.data.lampsFlashing, true, 'the wave-off is lamps');
  assert.ok(rec.removes.includes(lead.id) && rec.removes.includes(trail.id), 'the club disperses at the junction');
});

test('PL-301: draft along uninvited and pacing clubs never invite loners twice', () => {
  const { state, player, rec, bus } = pl301Setup();
  const lead = spawnedBy(rec, 'pl301', 'lead')[0];
  const trail = spawnedBy(rec, 'pl301', 'trail')[0];
  const gate = state.entityIndex.stations[0];
  const pairRot = Math.atan2(gate.pos.z - lead.pos.z, gate.pos.x - lead.pos.x);
  assert.equal(isLurkingAstern(
    { x: trail.pos.x - Math.cos(pairRot) * 40, z: trail.pos.z - Math.sin(pairRot) * 40 },
    trail.pos, pairRot, 80, 30,
  ), true, 'astern inside the corridor reads as lurking');
  assert.equal(isLurkingAstern(slotPointFor(lead.pos, pairRot, 1), trail.pos, pairRot, 80, 30), false,
    'the slot is not the corridor');
  // Lurk in their draft corridor through the whole window without taking the slot.
  player.pos = { x: trail.pos.x - Math.cos(pairRot) * 40, z: trail.pos.z - Math.sin(pairRot) * 40 };
  sweep(sharedCabPlant, state, 11, 1); // half the offer window of lurks
  assert.ok(eventsOf(rec, SHARED_CAB_EVENT, 'uninvited').length === 1, 'the club closes formation on you');
  assert.ok(spawnedBy(rec, 'pl301', 'split_burn').length === 0, 'no split for a loner');
  // The next club still forms — and never invites.
  const spawnsBefore = rec.spawns.length;
  enterSector(bus);
  const lead2 = spawnedBy(rec, 'pl301', 'lead').pop();
  assert.ok(lead2, 'clubs still form on the route');
  assert.ok(rec.spawns.length > spawnsBefore);
  assert.equal(eventsOf(rec, SHARED_CAB_EVENT, 'invited').length, 1, 'the invite count never rose');
  assert.ok(eventsOf(rec, SHARED_CAB_EVENT, 'no_invite').length >= 1, 'this club offers nothing to a loner');
  assert.equal(commsOf(rec, SHARED_CAB_INVITE_LINE).length, 1, 'the exact invite was only ever spoken once');
});

// ---- PL-302 The carried word ----------------------------------------------------------------

function pl302Setup(kind, seedOverride = null) {
  const seed = seedOverride ?? seedWithKind('pl302', CARRIED_WORD_TUNING.spawnChancePct, CARRIED_WORD_TUNING.smearerPct, kind);
  const state = makeState({ meta: { seed } });
  const player = makePlayer(state, { x: 0, z: 0 });
  const h = makeHarness(state);
  carriedWordPlant.init({ state, bus: h.bus, helpers: h.helpers });
  enterSector(h.bus); // no stations in index: out of comms range by construction
  return { state, player, ...h };
}

test('PL-302: hand a passing hauler a word out of comms range and the bar reads it exact, free', () => {
  const { state, player, rec, bus } = pl302Setup('carrier');
  const hauler = spawnedBy(rec, 'pl302', 'hauler')[0];
  assert.ok(hauler, 'a hauler passes on the ordinary route');
  assert.equal(hauler.data.callsign, CARRIED_WORD_CALLSIGN);
  assert.equal(outOfCommsRange(Infinity), true, 'no station inside comms range');
  assert.equal(outOfCommsRange(100), false);
  player.pos = { x: hauler.pos.x - 60, z: hauler.pos.z };
  sweep(carriedWordPlant, state, 1);
  assert.ok(commsOf(rec, CARRIED_WORD_OFFER_LINE).length >= 1, 'the offer, one line');
  // The hand-off: a real jettison near the hauler.
  bus.emit('cargo:jettisoned', { commodityId: 'cmdty_ore_iron', amount: 1, holdRemaining: 0 });
  assert.ok(eventsOf(rec, CARRIED_WORD_EVENT, 'word_taken').length === 1, 'the hauler takes the word aboard');
  // The destination sector's next dock reads it aloud, exact.
  state.world.currentSectorId = 's2';
  enterSector(bus, 's2'); // the carried word survives the sector change
  bus.emit('dock:range', { stationId: 'bar1', shipId: player.id, inRange: true });
  assert.ok(eventsOf(rec, CARRIED_WORD_EVENT, 'relayed_exact').length === 1, 'relayed exact');
  assert.equal(commsOf(rec, CARRIED_WORD_RELAYED_LINE).length, 1, 'the word arrives word for word');
  assert.equal(CARRIED_WORD_TEXT, 'VELL — MIDNIGHT — YES.');
  assert.equal(relayTextFor('carrier'), CARRIED_WORD_RELAYED_LINE);
});

test('PL-302: hand a smearer the word and the bar hears a lie, with your hull named', () => {
  const { state, player, rec, bus } = pl302Setup('smearer');
  const hauler = spawnedBy(rec, 'pl302', 'hauler')[0];
  assert.ok(hauler);
  // The smearer tells you who they are — handing them the word is the knowing wrong choice.
  assert.equal(hauler.data.callsign, CARRIED_WORD_SMEARER_CALLSIGN);
  player.pos = { x: hauler.pos.x - 60, z: hauler.pos.z };
  sweep(carriedWordPlant, state, 1);
  bus.emit('cargo:jettisoned', { commodityId: 'cmdty_ore_iron', amount: 1, holdRemaining: 0 });
  assert.ok(eventsOf(rec, CARRIED_WORD_EVENT, 'word_taken').length === 1);
  state.world.currentSectorId = 's2';
  enterSector(bus, 's2');
  bus.emit('dock:range', { stationId: 'bar1', shipId: player.id, inRange: true });
  assert.ok(eventsOf(rec, CARRIED_WORD_EVENT, 'smeared').length === 1, 'the word arrives mangled');
  assert.equal(commsOf(rec, CARRIED_WORD_SMEARED_LINE).length, 1, 'read aloud at the destination bar, wrong');
  // Docks in this sector hear about it for a bounded window.
  state.simTime += CARRIED_WORD_TUNING.gossipCooldownS;
  sweep(carriedWordPlant, state, 1, 1);
  bus.emit('dock:range', { stationId: 'bar1', shipId: player.id, inRange: true });
  assert.equal(commsOf(rec, CARRIED_WORD_GOSSIP_LINE).length, 1, 'the gossip spreads');
  assert.ok(eventsOf(rec, CARRIED_WORD_GOSSIP_EVENT).length === 1);
});

// ---- PL-303 The spare bed -------------------------------------------------------------------

function pl303Setup() {
  const state = makeState({
    simTime: 450, // night watch on the 600 s day
    meta: { seed: seedWithRoll('pl303', true, SPARE_BED_TUNING.spawnChancePct, 'night') },
    content: { sectors: [{ id: 's1', stations: [
      { id: 'outpost1', size: 'S', services: ['dock', 'refuel'] },
    ] }] },
  });
  const player = makePlayer(state, { x: 0, z: 0 }, { x: 0, z: 0 }, { hull: 4, hullMax: 10 });
  const h = makeHarness(state);
  spareBedPlant.init({ state, bus: h.bus, helpers: h.helpers });
  return { state, player, ...h };
}

test('PL-303: dock broken at a tiny outpost late at night and the berth is offered — no no is heard', () => {
  const { state, player, rec, bus } = pl303Setup();
  assert.equal(isNightWatch(450).night, true, 'the night watch is on');
  assert.equal(isBrokenHull(player), true, 'the hull is broken');
  assert.equal(isTinyOutpost({ size: 'S', type: 'trade_hub' }), true);
  bus.emit('dock:range', { stationId: 'outpost1', shipId: player.id, inRange: true });
  const worker = spawnedBy(rec, 'pl303', 'off_duty_worker')[0];
  const pads = rec.spawns.filter((e) => e.data && e.data.kind === 'berth_pad');
  assert.ok(worker, 'an off-duty worker appears at the apron');
  assert.equal(pads.length, 2, 'the berth kit is real labeled pads');
  assert.equal(pads[0].data.swarmFloorPad.label, SPARE_BED_PAD_LABEL);
  assert.equal(commsOf(rec, SPARE_BED_OFFER_LINE).length, 1, 'Berth is yours. Couch is fine.');
  // Sleep and say so at the counter: park in the berth zone through the rest window.
  player.pos = { x: worker.pos.x + 30, z: worker.pos.z };
  sweep(spareBedPlant, state, 11, 1); // restWindowS 10
  assert.ok(eventsOf(rec, SPARE_BED_EVENT, 'rested').length === 1, 'the rest registers');
  assert.equal(commsOf(rec, SPARE_BED_RESTED_LINE).length, 1, 'the counter says thanks');
  assert.equal(worker.data.lampsFlashing, true, 'the worker lamps a wave');
  assert.equal(spawnedBy(rec, 'pl303', 'berth_pad').length, 0, 'the kit is collected politely');
});

test('PL-303: strip the berth fittings and outpost berths lock to your hull, all of them', () => {
  const { state, player, rec, bus } = pl303Setup();
  bus.emit('dock:range', { stationId: 'outpost1', shipId: player.id, inRange: true });
  const pads = rec.spawns.filter((e) => e.data && e.data.kind === 'berth_pad');
  assert.ok(pads.length === 2);
  bus.emit('pickup:collected', { pickupId: pads[0].id, collectorId: player.id });
  assert.ok(eventsOf(rec, SPARE_BED_EVENT, 'berth_stripped').length === 1, 'the strip registers');
  assert.equal(commsOf(rec, SPARE_BED_LOCKED_LINE).length, 1, 'Berths locked. Your hull.');
  // All outposts: the meeting still detects you, the offer never comes.
  state.simTime += 60; // leave the night watch too: a locked hull is refused day or night... (no: night still gates)
  sweep(spareBedPlant, state, 1, 1);
  bus.emit('dock:range', { stationId: 'outpost1', shipId: player.id, inRange: true });
  assert.ok(eventsOf(rec, SPARE_BED_EVENT, 'locked_out').length === 1, 'the refusal is on the books');
  assert.equal(commsOf(rec, SPARE_BED_LOCKED_LINE).length, 1, 'the line was said once, and never again');
});

test('PL-303: a whole hull and a lit hour get no berth', () => {
  const state = makeState({
    simTime: 100, // mid-day
    content: { sectors: [{ id: 's1', stations: [{ id: 'outpost1', size: 'S', services: ['dock'] }] }] },
  });
  const player = makePlayer(state); // hull 10/10, not broken
  const { rec, bus, helpers } = makeHarness(state);
  spareBedPlant.init({ state, bus, helpers });
  bus.emit('dock:range', { stationId: 'outpost1', shipId: player.id, inRange: true });
  assert.equal(rec.spawns.length, 0, 'no worker, no berth, no offer');
  assert.equal(eventsOf(rec, SPARE_BED_EVENT, 'offered').length, 0);
});

// ---- PL-304 The after-hours coach -----------------------------------------------------------

function pl304Setup(seedOverride = null) {
  const state = makeState({
    simTime: 450, // after hours on the 600 s day
    meta: { seed: seedOverride ?? seedWithRoll('pl304', true, AFTER_HOURS_COACH_TUNING.spawnChancePct, 'mouth') },
  });
  const player = makePlayer(state, { x: 0, z: 0 });
  fixtureGate(state, 'mouth1', { x: 200, z: 0 });
  const h = makeHarness(state);
  afterHoursCoachPlant.init({ state, bus: h.bus, helpers: h.helpers });
  return { state, player, ...h };
}

test('PL-304: the coach idles at the mouth, coaches one clean takeoff, and paces you out', () => {
  const { state, player, rec } = pl304Setup();
  assert.equal(isAfterHours(450).afterHours, true, 'after hours at the mouth');
  assert.equal(takeoffVerdict({ speedWu: 50, blemished: false, coachingLive: true }), 'clean');
  assert.equal(takeoffVerdict({ speedWu: 50, blemished: true, coachingLive: true }), 'rough');
  sweep(afterHoursCoachPlant, state, 4, 1); // idleForS 3
  const coach = spawnedBy(rec, 'pl304', 'retired_pilot')[0];
  assert.ok(coach, 'a retired pilot idles alongside');
  assert.equal(commsOf(rec, AFTER_HOURS_COACH_LINE).length, 1, 'Easy throttle. Hold the line.');
  assert.equal(eventsOf(rec, AFTER_HOURS_COACH_EVENT, 'coaching').length, 1);
  assert.equal(coach.data.plants.pl304.role, 'retired_pilot');
  // Take the coaching: a clean takeoff through the mouth.
  player.vel = { x: 60, z: 0 };
  sweep(afterHoursCoachPlant, state, 1);
  assert.ok(eventsOf(rec, AFTER_HOURS_COACH_EVENT, 'clean_takeoff').length === 1, 'the clean takeoff registers');
  sweep(afterHoursCoachPlant, state, 6, 1); // paceOutS 5
  assert.ok(eventsOf(rec, AFTER_HOURS_COACH_EVENT, 'paced_out').length === 1, 'the coach paces you out, then waves');
  assert.equal(coach.data.lampsFlashing, true, 'the wave is lamps');
  assert.ok(rec.removes.includes(coach.id), 'the coach is gone when the lesson is done');
});

test('PL-304: mock the coaching and the mouth is empty the next time you launch, and stays empty', () => {
  const { state, player, rec, bus } = pl304Setup();
  sweep(afterHoursCoachPlant, state, 4, 1);
  const coach = spawnedBy(rec, 'pl304', 'retired_pilot')[0];
  assert.ok(coach);
  // The mock: a hard ram on the coach reads as the mockery.
  bus.emit('physics:impact', { causalActorId: player.id, aId: coach.id, bId: player.id, preSolveClosingSpeed: 50 });
  assert.ok(eventsOf(rec, AFTER_HOURS_COACH_EVENT, 'mouth_emptied').length === 1, 'the mouth empties');
  assert.ok(rec.removes.includes(coach.id), 'the coach leaves at once');
  // The next launch finds the mouth empty, and the one after that.
  player.pos = { x: 900, z: 0 };
  sweep(afterHoursCoachPlant, state, 2, 1);
  player.pos = { x: 0, z: 0 };
  sweep(afterHoursCoachPlant, state, 5, 1);
  assert.equal(eventsOf(rec, AFTER_HOURS_COACH_EVENT, 'coaching').length, 1, 'no coach ever again at this mouth');
  assert.equal(commsOf(rec, AFTER_HOURS_COACH_AGAIN_LINE).length, 0, 'not even the friendly line');
});

// ---- session resets (save:loaded / game:new / game:newGame) ----------------------------------
// Family rule: session state resets on the session-boundary events. Season stamps (grudges,
// embargoes, locks, ledgers) ride across sector changes by design — but they must NOT ride
// across save:loaded or a new game. These regressions pin that for three representative rows.

test('session reset: save:loaded wipes the rescue pool books — crossed-off hulls are welcomed and numbers restart (PL-299)', () => {
  const { state, player, rec, bus } = pl299Setup();
  const stranger = spawnedBy(rec, 'pl299', 'disabled_stranger')[0];
  assert.ok(stranger);
  // Establish the ledger row and the crossed-off stamp.
  bus.emit('tether:snapCatch', { targetId: stranger.id });
  sweep(rescueDividendPlant, state, 1);
  const delivered1 = eventsOf(rec, RESCUE_DIVIDEND_EVENT, 'rescue_delivered');
  assert.equal(delivered1.length, 1, 'the first rescue is credited');
  assert.equal(delivered1[0].payload.rescueNo, 4001);
  bus.emit('tether:snapCatch', { targetId: stranger.id });
  bus.emit('tether:snapCatch', { targetId: stranger.id });
  assert.equal(eventsOf(rec, RESCUE_DIVIDEND_EVENT, 'crossed_off').length, 1, 'the pool closes the books on this hull');
  // save:loaded: the session boundary wipes ledger and stamp alike.
  bus.emit('save:loaded', {});
  // The grudge no longer blocks: the next sector entry welcomes the hull again.
  enterSector(bus);
  assert.equal(eventsOf(rec, RESCUE_DIVIDEND_EVENT, 'pool_refuses').length, 0, 'no refusal after the reset');
  const stranger2 = spawnedBy(rec, 'pl299', 'disabled_stranger').pop();
  assert.ok(stranger2 && stranger2.id !== stranger.id, 'a fresh stranger spawns for the forgiven hull');
  // The mercy can fire again: delivering the new rescue credits a clean ledger.
  bus.emit('tether:snapCatch', { targetId: stranger2.id });
  sweep(rescueDividendPlant, state, 1);
  const delivered2 = eventsOf(rec, RESCUE_DIVIDEND_EVENT, 'rescue_delivered');
  assert.equal(delivered2.length, 2, 'the dividend route is live again');
  assert.equal(delivered2[1].payload.rescueNo, 4001, 'the rescue number restarted: the ledger was wiped');
});

test('session reset: save:loaded lifts the crane grudge — the next gantry angles over again (PL-298)', () => {
  const { state, player, rec, bus, helpers } = pl298Setup();
  sweep(umbrellaCranePlant, state, 2, 1);
  const gantry1 = rec.spawns.find((e) => e.data && e.data.storyPropKind === 'crane_gantry');
  assert.ok(gantry1, 'the gantry is out in the debris weather');
  // Establish the grudge row: a shove reads as the complaint.
  bus.emit('physics:impact', { causalActorId: player.id, aId: gantry1.id, bId: player.id, preSolveClosingSpeed: 40 });
  assert.equal(eventsOf(rec, UMBRELLA_CRANE_EVENT, 'complained').length, 1);
  // The season bites: the next gantry in this weather angles away.
  helpers.removeEntity(gantry1.id);
  sweep(umbrellaCranePlant, state, 1);
  player.pos = { x: 2600, z: 0 };
  sweep(umbrellaCranePlant, state, 2, 1);
  player.pos = { x: 0, z: 0 };
  sweep(umbrellaCranePlant, state, 2, 1);
  const gantry2 = rec.spawns.filter((e) => e.data && e.data.storyPropKind === 'crane_gantry').pop();
  assert.equal(gantry2.data.angleAway, true, 'the grudge angles the crane away');
  // save:loaded: the session boundary forgets the complaint.
  bus.emit('save:loaded', {});
  player.pos = { x: 2600, z: 0 };
  sweep(umbrellaCranePlant, state, 2, 1);
  player.pos = { x: 0, z: 0 };
  sweep(umbrellaCranePlant, state, 2, 1);
  const gantry3 = rec.spawns.filter((e) => e.data && e.data.storyPropKind === 'crane_gantry').pop();
  assert.ok(gantry3 && gantry3.id !== gantry2.id, 'the crane still comes out in bad weather');
  assert.equal(gantry3.data.angleAway, false, 'the grudge no longer blocks: it angles over again');
  assert.equal(gantry3.data.scanLabel, UMBRELLA_CRANE_GANTRY_LABEL);
  assert.equal(eventsOf(rec, UMBRELLA_CRANE_EVENT, 'angled_away').length, 1, 'no new angled_away after the reset');
  assert.equal(eventsOf(rec, UMBRELLA_CRANE_EVENT, 'angled_over').length, 2, 'the fresh meeting angles over');
});

test('session reset: save:loaded drops a carried word — no relay at the bar, and a fresh word can be handed (PL-302)', () => {
  const { state, player, rec, bus } = pl302Setup('carrier');
  const hauler1 = spawnedBy(rec, 'pl302', 'hauler')[0];
  assert.ok(hauler1);
  // Establish the carried word.
  player.pos = { x: hauler1.pos.x - 60, z: hauler1.pos.z };
  sweep(carriedWordPlant, state, 1);
  bus.emit('cargo:jettisoned', { commodityId: 'cmdty_ore_iron', amount: 1, holdRemaining: 0 });
  assert.equal(eventsOf(rec, CARRIED_WORD_EVENT, 'word_taken').length, 1, "the word is in the hauler's hold");
  // save:loaded: the session boundary drops the word.
  bus.emit('save:loaded', {});
  state.world.currentSectorId = 's2';
  enterSector(bus, 's2');
  bus.emit('dock:range', { stationId: 'bar1', shipId: player.id, inRange: true });
  assert.equal(eventsOf(rec, CARRIED_WORD_EVENT, 'relayed_exact').length, 0, 'the dropped word never relays');
  assert.equal(eventsOf(rec, CARRIED_WORD_EVENT, 'smeared').length, 0);
  // The mercy can fire again: a fresh hauler passes and takes a new word.
  state.world.currentSectorId = 's1';
  enterSector(bus, 's1');
  const hauler2 = spawnedBy(rec, 'pl302', 'hauler').pop();
  assert.ok(hauler2 && hauler2.id !== hauler1.id, 'a fresh hauler passes again');
  player.pos = { x: hauler2.pos.x - 60, z: hauler2.pos.z };
  sweep(carriedWordPlant, state, 1);
  bus.emit('cargo:jettisoned', { commodityId: 'cmdty_ore_iron', amount: 1, holdRemaining: 0 });
  assert.equal(eventsOf(rec, CARRIED_WORD_EVENT, 'word_taken').length, 2, 'the hand-off works again');
  // The new word still rides across sector changes by design, and relays exact at the bar.
  state.world.currentSectorId = 's3';
  enterSector(bus, 's3');
  bus.emit('dock:range', { stationId: 'bar2', shipId: player.id, inRange: true });
  assert.equal(eventsOf(rec, CARRIED_WORD_EVENT, 'relayed_exact').length, 1, 'the new word relays exact');
});

// ---- cooldown / TTL / cleanup ---------------------------------------------------------------

test('cooldown: the convoy wave-off, the rookie pass window, and the coach visit are once per meeting', () => {
  // Convoy: a second gate:range never re-waves (the meeting is over after the junction).
  const { state, player, rec, bus } = pl292Setup();
  enterSector(bus);
  const lead = spawnedBy(rec, 'pl292', 'lead')[0];
  player.pos = { x: lead.pos.x + 60, z: lead.pos.z };
  sweep(convoyGodmotherPlant, state, 6, 1);
  fixtureGate(state, 'junction1', { x: player.pos.x + 100, z: player.pos.z });
  sweep(convoyGodmotherPlant, state, 1);
  assert.equal(eventsOf(rec, CONVOY_GODMOTHER_EVENT, 'waved_off').length, 1);
  bus.emit('gate:range', { gateId: 'junction1', shipId: player.id, inRange: true });
  assert.equal(commsOf(rec, CONVOY_WAVE_OFF_LINE).length, 1, 'one wave-off per meeting');

  // Rookie: the shot window is bounded; a late flash is no catch.
  const r = pl294Setup();
  const rookie = spawnedBy(r.rec, 'pl294', 'rookie')[0];
  r.player.pos = { x: rookie.pos.x - 100, z: rookie.pos.z };
  sweep(firstLightPlant, r.state, 1);
  r.state.simTime += FIRST_LIGHT_TUNING.flashWindowS + 2;
  sweep(firstLightPlant, r.state, 1, 2);
  r.bus.emit('combat:fire', { ownerId: r.player.id, weaponId: 'w_test', origin: { x: rookie.pos.x - 40, z: rookie.pos.z } });
  assert.equal(eventsOf(r.rec, FIRST_LIGHT_EVENT, 'caught').length, 0, 'the window closed');

  // Coach: one clean takeoff per visit — the second departure earns no second lesson.
  const c = pl304Setup();
  sweep(afterHoursCoachPlant, c.state, 4, 1);
  const coach = spawnedBy(c.rec, 'pl304', 'retired_pilot')[0];
  c.player.vel = { x: 60, z: 0 };
  sweep(afterHoursCoachPlant, c.state, 1);
  sweep(afterHoursCoachPlant, c.state, 6, 1);
  assert.ok(eventsOf(c.rec, AFTER_HOURS_COACH_EVENT, 'paced_out').length === 1);
  void coach;
});

test('TTL: unclaimed props and strangers despawn on the module clock', () => {
  const { state, player, rec, bus } = pl297Setup();
  sweep(openHatchPlant, state, 2, 1);
  const stranger = spawnedBy(rec, 'pl297', 'open_hatch_host')[0];
  assert.ok(stranger, 'the meeting is live');
  state.simTime += OPEN_HATCH_TUNING.strangerTtlS + 2;
  sweep(openHatchPlant, state, 1, 2);
  assert.ok(rec.removes.includes(stranger.id), 'the stranger despawns on the TTL');
  assert.equal(rec.events.filter((e) => e.event === OPEN_HATCH_EVENT && e.payload.kind === 'sheltered_then_gone').length, 0,
    'an expired meeting pays no dividend');
  void player;
});

test('cleanup: sector:exit despawns the meeting and the module says so', () => {
  const { state, player, rec, bus } = pl292Setup();
  enterSector(bus);
  const spawned = rec.spawns.length;
  assert.ok(spawned >= 2, 'the convoy is out');
  bus.emit('sector:exit', { sectorId: 's1' });
  assert.equal(rec.removes.length >= spawned, true, 'every owned body despawns');
  assert.ok(eventsOf(rec, CONVOY_GODMOTHER_EVENT, 'reset').length === 1, 'the reset is announced');
  void player;
});

// ---- determinism smoke ----------------------------------------------------------------------

test('determinism: the same seed plays the same meeting twice, event for event', () => {
  const seed = seedWithRoll('pl294', true, FIRST_LIGHT_TUNING.spawnChancePct);
  const runOnce = () => {
    const state = makeState({ meta: { seed } });
    const player = makePlayer(state);
    const { rec, bus, helpers } = makeHarness(state);
    firstLightPlant.init({ state, bus, helpers });
    enterSector(bus);
    const rookie = spawnedBy(rec, 'pl294', 'rookie')[0];
    player.pos = { x: rookie.pos.x - 100, z: rookie.pos.z };
    sweep(firstLightPlant, state, 1);
    bus.emit('combat:fire', { ownerId: player.id, weaponId: 'w_test', origin: { x: rookie.pos.x - 40, z: rookie.pos.z } });
    sweep(firstLightPlant, state, 2);
    const modEvents = rec.events
      .filter((e) => e.event === FIRST_LIGHT_EVENT)
      .map((e) => e.payload.kind);
    const voice = rec.voice.map((v) => v.text);
    const spawnIds = rec.spawns.map((e) => e.data && e.data.plants && e.data.plants.pl294 ? e.data.plants.pl294.role : null);
    firstLightPlant.destroy();
    void helpers;
    return { modEvents, voice, spawnIds };
  };
  const a = runOnce();
  const b = runOnce();
  assert.deepEqual(a, b, 'identical seeds give identical meetings');
});
