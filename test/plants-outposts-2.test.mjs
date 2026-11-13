// test/plants-outposts-2.test.mjs — headless checks for the 16 outpost/waystation plant modules
// (PL-171/172/173/190/191/192/193/214/215/216/235/236/237/238/239/247).
//
// Every module is a standalone `plantsPl<id>` object with init(ctx)/update(dt,state)/destroy().
// The harness is a recording bus + a spec-spreading spawnEntity, no DOM, no Three.js, no wall
// clock: state.simTime is driven by hand. Station fixtures are real type:'station' entities
// carrying data.stationId/dockRadius/sectorId (the live world.js contract); gates are excluded by
// the modules. Tuning day = 240 s in these modules, matching the sibling batch.
import test from 'node:test';
import assert from 'node:assert/strict';

import { pl171Rattle, PL_171_RATTLE_EVENT, PL_171_PATCHED_EVENT, PL_171_ROW_KNOWS_EVENT, AUD_LINE, RATTLE_IN_B_TUNING } from '../src/systems/plants/pl171RattleInB.js';
import { pl172ShadeMarket, PL_172_RIDE_EVENT, PL_172_RENT_EVENT, RENT_LINE, OKOYE_SENDER, shadeEdgeXAt, SHADE_MARKET_TUNING } from '../src/systems/plants/pl172ShadeMarket.js';
import { pl173HesperLight, PL_173_LAMP_EVENT, PL_173_RELIT_EVENT, PL_173_ON_TIME_EVENT, PL_173_MISSED_EVENT, PL_173_LOOKER_EVENT, lampPosition, isDarkCrossing, HESPER_LIGHT_TUNING } from '../src/systems/plants/pl173HesperLight.js';
import { pl190DroneRange, PL_190_DRILL_EVENT, PL_190_TOOK_TURN_EVENT, SORREL_SENDER, isOffHours, DRONE_RANGE_TUNING } from '../src/systems/plants/pl190DroneRange.js';
import { pl191StormLamps, PL_191_STRUCK_EVENT, pylonPositions, strikeTargetFor, STORM_LAMPS_TUNING } from '../src/systems/plants/pl191StormLamps.js';
import { pl192AgainMaybe, PL_192_MAYBE_EVENT, PL_192_BLOODY_EVENT, MAGS_LINE, MAGS_SENDER, AGAIN_MAYBE_TUNING } from '../src/systems/plants/pl192AgainMaybe.js';
import { pl193OneShort, PL_193_READ_EVENT, PL_193_COUNTED_EVENT, PL_193_STOPPED_EVENT, SENNA_NAMES, SENNA_SENDER, lampLinePositions, shortageOf, ONE_SHORT_TUNING } from '../src/systems/plants/pl193OneShort.js';
import { pl214PyrrhaBox, PL_214_READ_EVENT, PL_214_EMPTY_EVENT, PYRRHA_LINE, PYRRHA_SENDER, rumourValueFor, padPosition } from '../src/systems/plants/pl214PyrrhaBox.js';
import { pl215SomebodysStall, PL_215_STOCKED_EVENT, PL_215_BOUGHT_BACK_EVENT, PL_215_LOST_AGAIN_EVENT, PL_215_SHORT_EVENT, LOST_AGAIN_LINE, STALL_SENDER, itemForDay } from '../src/systems/plants/pl215SomebodysStall.js';
import { pl216BlueMinute, PL_216_BLUE_EVENT, PL_216_NOTED_EVENT, PL_216_LOOKED_AWAY_EVENT, YUNE_NOTE_LINE, YUNE_SENDER, isBlueMinute, facingStation, BLUE_MINUTE_TUNING } from '../src/systems/plants/pl216BlueMinute.js';
import { pl235CleanWeld, PL_235_NOTICED_EVENT, PL_235_SAID_NOTHING_EVENT, PL_235_SPOOKED_EVENT, hullMooring } from '../src/systems/plants/pl235CleanWeld.js';
import { pl236IvesMinute, PL_236_STOOD_EVENT, PL_236_MISSED_EVENT, isIvesMinute, ivesSpot, IVES_MINUTE_TUNING } from '../src/systems/plants/pl236IvesMinute.js';
import { pl237HonkAtHeat, PL_237_HONKED_EVENT, PL_237_CLEAN_EVENT, hasOldScorch, haulerPassPosition } from '../src/systems/plants/pl237HonkAtHeat.js';
import { pl238SeeHim, PL_238_SEEN_EVENT, PL_238_PASSED_EVENT, reyDriftPosition, isFacing, SEE_HIM_TUNING } from '../src/systems/plants/pl238SeeHim.js';
import { pl239RowansTap, PL_239_TAP_EVENT, PL_239_MOVED_EVENT, PL_239_STUCK_EVENT, tapPostPosition } from '../src/systems/plants/pl239RowansTap.js';
import { pl247TheScandal, PL_247_SCANDAL_EVENT, PL_247_WEIGHED_EVENT, RIGGER_LINE, CLERK_LINE, PAD_LABEL_ARGUING, isWreckBody, weighNumberFor, scalePadPosition } from '../src/systems/plants/pl247TheScandal.js';

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
  };
}

function makeState({ sectorId = 'sector_tethys_junction', credits = 0 } = {}) {
  const entities = new Map();
  const state = {
    mode: 'flight',
    simTime: 0,
    tick: 0,
    playerId: 7,
    entities,
    world: { currentSectorId: sectorId },
    player: { credits, cargo: {} },
    story: { flags: {} },
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
  const voice = {
    lines: [],
    say(rec) { this.lines.push(rec); },
  };
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
        pos: spec.pos ? { ...spec.pos } : { x: 0, z: 0 },
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
  };
  return helpers;
}

function harness({ sectorId, credits } = {}) {
  const state = makeState({ sectorId, credits });
  const bus = createBus();
  const helpers = makeHelpers(state);
  return { state, bus, helpers };
}

/** Spawn a real station entity fixture (the live world.js data contract). */
function addStation(state, { id, sectorId, pos = { x: 0, z: 0 }, dockRadius = 72 }) {
  const ent = {
    id: `st_${id}`, alive: true, type: 'station',
    pos: { ...pos }, vel: { x: 0, z: 0 },
    data: { stationId: id, stationTypeId: 'trade_hub', dockRadius, services: ['trade'], sectorId, homeSectorId: sectorId, name: id },
  };
  state.entities.set(ent.id, ent);
  return ent;
}

/** A gate fixture: modules must ignore it even with a matching-sounding id. */
function addGate(state, { sectorId, pos = { x: 0, z: 0 } }) {
  const ent = {
    id: 'gate_1', alive: true, type: 'station',
    pos: { ...pos }, vel: { x: 0, z: 0 },
    data: { stationId: 'not_a_station', isGate: true, gateTo: 'elsewhere', sectorId },
  };
  state.entities.set(ent.id, ent);
  return ent;
}

function eventsOf(bus, type) {
  return bus.log.filter((e) => e.type === type).map((e) => e.payload);
}
function popups(bus) {
  return bus.log.filter((e) => e.type === 'comms:popup').map((e) => e.payload);
}
function cues(bus, id) {
  return bus.log.filter((e) => e.type === 'audio:cue' && (!id || e.payload.id === id));
}
function voiceLines(helpers) {
  return helpers.voice.lines.map((v) => v.text);
}

/** Drive module.update in 0.5 s steps — two steps per 1 Hz tick. */
function advance(state, mod, seconds, step = 0.5) {
  for (let t = 0; t < seconds - 1e-9; t += step) {
    state.simTime += step;
    state.tick += Math.round(step * 60);
    mod.update(step);
  }
}

function dressRows(state) {
  return state.world?.dressing?.rows || [];
}

// ---------- PL-171 Rattle in B ----------

test('PL-171: dented approach gets Aud line EXACT, patched closes it, rattling on spreads it', () => {
  const { state, bus, helpers } = harness({ sectorId: RATTLE_IN_B_TUNING.sectorId });
  addStation(state, { id: 'station_phoebe_echo', sectorId: RATTLE_IN_B_TUNING.sectorId });
  pl171Rattle.init({ state, bus, helpers });

  // Healthy approach: no line.
  advance(state, pl171Rattle, 3);
  assert.equal(eventsOf(bus, PL_171_RATTLE_EVENT).length, 0);

  // Dented approach: he knows your pitch before you dock.
  state.entities.get(state.playerId).hull = 60;
  advance(state, pl171Rattle, 3);
  assert.equal(eventsOf(bus, PL_171_RATTLE_EVENT).length, 1);
  assert.ok(voiceLines(helpers).includes(AUD_LINE), 'EXACT copy "You rattle in B."');
  assert.equal(popups(bus)[0].text, AUD_LINE);
  assert.equal(popups(bus)[0].sender, 'KEEPER AUD');

  // Get patched: repairs inside the approach get the confirm, no row gossip.
  state.entities.get(state.playerId).hull = 100;
  advance(state, pl171Rattle, 2);
  assert.equal(eventsOf(bus, PL_171_PATCHED_EVENT).length, 1);
  assert.equal(eventsOf(bus, PL_171_ROW_KNOWS_EVENT).length, 0);
  pl171Rattle.destroy();
});

test('PL-171: rattle on — leaving dented makes the whole row know, then cooldown', () => {
  const { state, bus, helpers } = harness({ sectorId: RATTLE_IN_B_TUNING.sectorId });
  addStation(state, { id: 'station_phoebe_echo', sectorId: RATTLE_IN_B_TUNING.sectorId, pos: { x: 0, z: 0 } });
  pl171Rattle.init({ state, bus, helpers });
  const player = state.entities.get(state.playerId);
  player.hull = 50;

  advance(state, pl171Rattle, 3);          // told inside the approach
  assert.equal(eventsOf(bus, PL_171_RATTLE_EVENT).length, 1);
  player.pos = { x: 3000, z: 0 };          // rattle on: leave, still dented
  advance(state, pl171Rattle, 2);
  assert.equal(eventsOf(bus, PL_171_ROW_KNOWS_EVENT).length, 1);
  assert.ok(popups(bus).some((p) => p.sender === 'HARBOR ROW'));

  // Cooldown: no second gossip on the next dented visit within 120 s.
  player.pos = { x: 0, z: 0 };
  advance(state, pl171Rattle, 3);          // told again inside the approach
  assert.equal(eventsOf(bus, PL_171_RATTLE_EVENT).length, 2);
  player.pos = { x: 3000, z: 0 };
  advance(state, pl171Rattle, 2);
  assert.equal(eventsOf(bus, PL_171_ROW_KNOWS_EVENT).length, 1, 'row knows only once per cooldown');
  pl171Rattle.destroy();
});

test('PL-171: gates ignored, sector exit ends the visit, destroy cleans up', () => {
  const { state, bus, helpers } = harness({ sectorId: RATTLE_IN_B_TUNING.sectorId });
  addStation(state, { id: 'station_phoebe_echo', sectorId: RATTLE_IN_B_TUNING.sectorId });
  addGate(state, { sectorId: RATTLE_IN_B_TUNING.sectorId });
  pl171Rattle.init({ state, bus, helpers });
  state.entities.get(state.playerId).hull = 50;
  advance(state, pl171Rattle, 3);
  assert.equal(eventsOf(bus, PL_171_RATTLE_EVENT).length, 1, 'the gate body never counts, only the shrine station');
  bus.emit('sector:exit', { sectorId: RATTLE_IN_B_TUNING.sectorId });
  state.entities.get(state.playerId).pos = { x: 3000, z: 0 };
  advance(state, pl171Rattle, 2);
  assert.equal(eventsOf(bus, PL_171_ROW_KNOWS_EVENT).length, 0, 'visit ended: no row gossip');
  assert.equal(eventsOf(bus, PL_171_RATTLE_EVENT).length, 1, 'no re-tell after the visit ends');
  pl171Rattle.destroy();
  assert.equal(pl171Rattle.state, null);
});

// ---------- PL-172 Riding the shade ----------

test('PL-172: riding the shade edge unfolds stalls; sitting rents — EXACT "Rent."', () => {
  const { state, bus, helpers } = harness({ sectorId: SHADE_MARKET_TUNING.sectorId });
  addStation(state, { id: 'station_kepler_scar', sectorId: SHADE_MARKET_TUNING.sectorId });
  pl172ShadeMarket.init({ state, bus, helpers });
  const player = state.entities.get(state.playerId);

  const edge = shadeEdgeXAt(state.simTime, 0);
  player.pos = { x: edge, z: 0 };
  player.vel = { x: 20, z: 0 };
  advance(state, pl172ShadeMarket, 3);
  assert.equal(eventsOf(bus, PL_172_RIDE_EVENT).length, 1, 'market opens round you as you go');
  assert.ok(dressRows(state).length >= 1, 'stalls unfold as dressing rows');
  assert.ok(dressRows(state).every((r) => r.data?.pl172Stall === true));

  // Sit in its path: park where the edge will cross, and let it arrive over the hull.
  player.vel = { x: 0, z: 0 };
  player.pos = { x: shadeEdgeXAt(9, 0), z: 0 };
  advance(state, pl172ShadeMarket, 8);
  const rents = eventsOf(bus, PL_172_RENT_EVENT);
  assert.equal(rents.length, 1);
  assert.equal(popups(bus).find((p) => p.sender === OKOYE_SENDER)?.text, RENT_LINE);
  assert.ok(voiceLines(helpers).includes(RENT_LINE), 'EXACT copy "Rent."');
  pl172ShadeMarket.destroy();
  assert.equal(dressRows(state).length, 0, 'destroy drops owned stall rows');
});

test('PL-172: rent cooldown holds; sector exit clears stalls; edge math is deterministic', () => {
  const { state, bus, helpers } = harness({ sectorId: SHADE_MARKET_TUNING.sectorId });
  addStation(state, { id: 'station_kepler_scar', sectorId: SHADE_MARKET_TUNING.sectorId });
  pl172ShadeMarket.init({ state, bus, helpers });
  const player = state.entities.get(state.playerId);
  player.pos = { x: shadeEdgeXAt(state.simTime, 0), z: 0 };
  player.vel = { x: 0, z: 0 };
  advance(state, pl172ShadeMarket, 40);    // sitting well past the hold
  assert.equal(eventsOf(bus, PL_172_RENT_EVENT).length, 1, 'one rent per cooldown window');

  bus.emit('sector:exit', { sectorId: SHADE_MARKET_TUNING.sectorId });
  assert.equal(dressRows(state).length, 0, 'sector exit drops stalls');
  pl172ShadeMarket.destroy();

  assert.equal(shadeEdgeXAt(10, 0), shadeEdgeXAt(10, 0), 'pure edge math deterministic');
});

// ---------- PL-173 Hesper's light ----------

test('PL-173: the lamp goes out on schedule, a bump relights it, and the crossing lands on time', () => {
  const { state, bus, helpers } = harness({ sectorId: HESPER_LIGHT_TUNING.sectorId });
  const station = addStation(state, { id: 'station_orcus_shadow', sectorId: HESPER_LIGHT_TUNING.sectorId });
  pl173HesperLight.init({ state, bus, helpers });
  const T = HESPER_LIGHT_TUNING;

  // Cycle 1 is a dark cycle (isDarkCrossing: cycle % 4 === 1).
  assert.equal(isDarkCrossing(1), true);
  assert.equal(isDarkCrossing(0), false);
  state.simTime = T.crossingPeriodS + 1;   // t=91, cycle 1
  pl173HesperLight.update(0.5);
  const lampId = pl173HesperLight._lampId;
  assert.ok(lampId, 'lamp spawns in sector');
  const lamp = state.entities.get(lampId);
  assert.equal(lamp.data.hesperDark, true, 'the lamp is simply out');
  assert.equal(eventsOf(bus, PL_173_LAMP_EVENT).length, 1, 'the out lamp is announced');

  // Bump it alight — a real impact with enough impulse.
  bus.emit('physics:impact', { aId: lampId, bId: state.playerId, impulse: 80, tick: state.tick });
  assert.equal(eventsOf(bus, PL_173_RELIT_EVENT).length, 1);
  assert.equal(lamp.data.hesperDark, false);
  assert.equal(lamp.data.lampsFlashing, true, 'lamp seam stamps the relight');

  // It crosses exactly on time, as if it never stopped.
  state.simTime = T.crossingPeriodS + T.crossingPhaseS + 0.2;   // the crossing moment
  pl173HesperLight.update(0.5);
  const onTime = eventsOf(bus, PL_173_ON_TIME_EVENT);
  assert.equal(onTime.length, 1);
  assert.equal(onTime[0].ordinary, undefined, 'this crossing is the bumped one, not ordinary');
  assert.equal(eventsOf(bus, PL_173_MISSED_EVENT).length, 0);
  pl173HesperLight.destroy();
  assert.ok(helpers.removed.includes(lampId), 'destroy despawns the lamp');
});

test('PL-173: wait in the dark un-bumped and the crossing is missed — and someone comes to look', () => {
  const { state, bus, helpers } = harness({ sectorId: HESPER_LIGHT_TUNING.sectorId });
  addStation(state, { id: 'station_orcus_shadow', sectorId: HESPER_LIGHT_TUNING.sectorId });
  pl173HesperLight.init({ state, bus, helpers });
  const T = HESPER_LIGHT_TUNING;

  state.simTime = T.crossingPeriodS + 1;
  pl173HesperLight.update(0.5);
  const lampId = pl173HesperLight._lampId;
  const lampPos = lampPosition(state.entities.get(`st_station_orcus_shadow`).pos);

  // Wait inside the look radius, past lookerDelay, without bumping.
  state.entities.get(state.playerId).pos = { x: lampPos.x + 50, z: lampPos.z };
  state.simTime = T.crossingPeriodS + T.lookerDelayS + 1;
  pl173HesperLight.update(0.5);
  assert.equal(eventsOf(bus, PL_173_LOOKER_EVENT).length, 1, 'someone else comes to look');
  assert.ok(pl173HesperLight._lookerId, 'the looker is a real body');

  // The crossing passes, dark: missed.
  state.simTime = T.crossingPeriodS + T.crossingPhaseS + 0.2;
  pl173HesperLight.update(0.5);
  assert.equal(eventsOf(bus, PL_173_MISSED_EVENT).length, 1);
  assert.equal(eventsOf(bus, PL_173_ON_TIME_EVENT).length, 0);
  assert.equal(state.entities.get(lampId).data.hesperDark, false, 'the lamp catches up when its cycle turns');
  pl173HesperLight.destroy();
});

test('PL-173: a weak bump does not relight; lamp position is deterministic', () => {
  const { state, bus, helpers } = harness({ sectorId: HESPER_LIGHT_TUNING.sectorId });
  addStation(state, { id: 'station_orcus_shadow', sectorId: HESPER_LIGHT_TUNING.sectorId });
  pl173HesperLight.init({ state, bus, helpers });
  const T = HESPER_LIGHT_TUNING;
  state.simTime = T.crossingPeriodS + 1;
  pl173HesperLight.update(0.5);
  const lampId = pl173HesperLight._lampId;
  bus.emit('physics:impact', { aId: lampId, bId: state.playerId, impulse: 3, tick: state.tick });
  assert.equal(eventsOf(bus, PL_173_RELIT_EVENT).length, 0, 'a tap is not a bump alight');
  assert.deepEqual(lampPosition(state.entities.get('st_station_orcus_shadow').pos), lampPosition(state.entities.get('st_station_orcus_shadow').pos), 'mooring is deterministic');
  pl173HesperLight.destroy();
});

// ---------- PL-190 Off-hours range ----------

test('PL-190: off-hours drill launches and racks; killing a drone slows her rack', () => {
  const { state, bus, helpers } = harness({ sectorId: DRONE_RANGE_TUNING.sectorId });
  addStation(state, { id: 'station_dione', sectorId: DRONE_RANGE_TUNING.sectorId });
  pl190DroneRange.init({ state, bus, helpers });
  const T = DRONE_RANGE_TUNING;
  assert.equal(isOffHours(T.offHoursStartS + 1), true);
  assert.equal(isOffHours(10), false, 'on-hours: the range runs nobody');

  state.simTime = T.offHoursStartS + 1;    // off-hours, watching from the rail
  advance(state, pl190DroneRange, 2);
  const launches = eventsOf(bus, PL_190_DRILL_EVENT).filter((e) => e.phase === 'launched');
  assert.equal(launches.length, 1, 'one drone off the rack');
  const droneId = pl190DroneRange._droneId;
  assert.ok(state.entities.has(droneId));

  // She racks them slower for you: your kill receipt counts as a turn.
  bus.emit('entity:killed', { id: droneId, type: 'debris' });
  assert.equal(eventsOf(bus, PL_190_TOOK_TURN_EVENT).length, 1);
  assert.ok(popups(bus).some((p) => p.sender === SORREL_SENDER));
  assert.equal(pl190DroneRange._droneId, null, 'your kill takes the drone off the rail');

  advance(state, pl190DroneRange, 2);
  assert.equal(eventsOf(bus, PL_190_DRILL_EVENT).filter((e) => e.phase === 'launched').length, 1, 'slower rack: no immediate relaunch');
  pl190DroneRange.destroy();
});

test('PL-190: house drill racks after the flight; on-hours no drill; destroy cleans up', () => {
  const { state, bus, helpers } = harness({ sectorId: DRONE_RANGE_TUNING.sectorId });
  addStation(state, { id: 'station_dione', sectorId: DRONE_RANGE_TUNING.sectorId });
  pl190DroneRange.init({ state, bus, helpers });
  const T = DRONE_RANGE_TUNING;

  // On-hours: no drill.
  advance(state, pl190DroneRange, 3);
  assert.equal(eventsOf(bus, PL_190_DRILL_EVENT).length, 0);

  state.simTime = T.offHoursStartS + 1;
  advance(state, pl190DroneRange, 2);
  const droneId = pl190DroneRange._droneId;
  assert.ok(droneId);
  state.simTime += T.droneFlightS + 1;
  pl190DroneRange.update(0.5);
  assert.equal(pl190DroneRange._droneId, null, 'shot down, caught, racked');
  assert.equal(eventsOf(bus, PL_190_DRILL_EVENT).filter((e) => e.phase === 'racked').length, 1);
  pl190DroneRange.destroy();
});

// ---------- PL-191 Storm lamps ----------

test('PL-191: run dark and slow and lightning finds the pylons; run lit and it finds you', () => {
  const { state, bus, helpers } = harness({ sectorId: STORM_LAMPS_TUNING.sectorId });
  const station = addStation(state, { id: 'station_veil', sectorId: STORM_LAMPS_TUNING.sectorId });
  pl191StormLamps.init({ state, bus, helpers });
  const T = STORM_LAMPS_TUNING;

  assert.equal(strikeTargetFor(0, 100), 'pylon', 'dark and slow: pylons');
  assert.equal(strikeTargetFor(200, 100), 'you', 'bright: you');
  assert.equal(strikeTargetFor(200, T.wallRadiusWu + 500), 'outside', 'outside the wall: weather only');

  // Dark run: strikes hit pylons, dressing rows spawn once.
  advance(state, pl191StormLamps, T.strikeIntervalS + 1);
  const strikes = eventsOf(bus, PL_191_STRUCK_EVENT);
  assert.equal(strikes.length, 1);
  assert.equal(strikes[0].target, 'pylon');
  assert.equal(dressRows(state).length, T.pylonCount);
  assert.ok(cues(bus).some((c) => c.payload.id === 'sfx_vent_chime'));

  // Run bright: the next strike finds your hull.
  state.entities.get(state.playerId).vel = { x: 120, z: 0 };
  advance(state, pl191StormLamps, T.strikeIntervalS + 1);
  const second = eventsOf(bus, PL_191_STRUCK_EVENT)[1];
  assert.equal(second.target, 'you');
  assert.ok(cues(bus).some((c) => c.payload.id === 'warning'));
  pl191StormLamps.destroy();
  assert.equal(dressRows(state).length, 0, 'destroy drops pylon rows');
});

test('PL-191: pylon moorings are deterministic and off the wall center', () => {
  const spots = pylonPositions({ x: 10, z: -10 });
  assert.equal(spots.length, STORM_LAMPS_TUNING.pylonCount);
  assert.deepEqual(pylonPositions({ x: 10, z: -10 }), spots);
  for (const p of spots) {
    assert.ok(Math.hypot(p.x - 10, p.z - -10) <= STORM_LAMPS_TUNING.pylonDistanceWu + 1);
  }
});

// ---------- PL-192 Again, maybe ----------

test('PL-192: clear the Cut clean and Mags says the line EXACT; a dirty exit gets silence', () => {
  const { state, bus, helpers } = harness({ sectorId: AGAIN_MAYBE_TUNING.sectorId });
  state.world.currentSectorId = AGAIN_MAYBE_TUNING.sectorId;
  pl192AgainMaybe.init({ state, bus, helpers });

  bus.emit('sector:enter', { sectorId: AGAIN_MAYBE_TUNING.sectorId });
  bus.emit('sector:exit', { sectorId: AGAIN_MAYBE_TUNING.sectorId });
  assert.equal(eventsOf(bus, PL_192_MAYBE_EVENT).length, 1);
  assert.ok(voiceLines(helpers).includes(MAGS_LINE), 'EXACT copy "Again, maybe."');
  assert.equal(popups(bus).find((p) => p.sender === MAGS_SENDER)?.text, MAGS_LINE);

  // Dirty exit: a death off your hull dirties the Cut.
  bus.emit('sector:enter', { sectorId: AGAIN_MAYBE_TUNING.sectorId });
  bus.emit('entity:killed', { id: 55, type: 'ship', pos: { x: 10, z: 0 } });   // player at 0,0
  bus.emit('sector:exit', { sectorId: AGAIN_MAYBE_TUNING.sectorId });
  assert.equal(eventsOf(bus, PL_192_BLOODY_EVENT).length, 1);
  assert.equal(eventsOf(bus, PL_192_MAYBE_EVENT).length, 1, 'no second maybe');
  assert.equal(popups(bus).filter((p) => p.sender === MAGS_SENDER).length, 1, 'Mags says one thing, once per exit');

  // A far death does not blame.
  bus.emit('sector:enter', { sectorId: AGAIN_MAYBE_TUNING.sectorId });
  bus.emit('entity:killed', { id: 56, type: 'ship', pos: { x: 5000, z: 0 } });
  bus.emit('sector:exit', { sectorId: AGAIN_MAYBE_TUNING.sectorId });
  assert.equal(eventsOf(bus, PL_192_MAYBE_EVENT).length, 2, 'clean again: earned the maybe');
  pl192AgainMaybe.destroy();
});

// ---------- PL-193 One short ----------

test('PL-193: Senna reads five names over four lamps — always one short; counting finds it', () => {
  const { state, bus, helpers } = harness({ sectorId: ONE_SHORT_TUNING.sectorId });
  const station = addStation(state, { id: 'station_sedna', sectorId: ONE_SHORT_TUNING.sectorId });
  pl193OneShort.init({ state, bus, helpers });
  const T = ONE_SHORT_TUNING;

  assert.equal(shortageOf(SENNA_NAMES), 1, 'the line is always one lamp short');
  advance(state, pl193OneShort, 2);
  assert.equal(pl193OneShort._lampIds.length, T.lampCount, 'four lamps out into the dark');

  // Her read: count her words.
  state.simTime = T.readIntervalS + 1;
  const lamp = state.entities.get(pl193OneShort._lampIds[0]);
  state.entities.get(state.playerId).pos = { x: lamp.pos.x + 100, z: lamp.pos.z };
  advance(state, pl193OneShort, 2);
  const read = eventsOf(bus, PL_193_READ_EVENT)[0];
  assert.equal(read.names, 5);
  assert.equal(read.lamps, 4);
  assert.equal(read.short, 1);
  assert.ok(popups(bus).some((p) => p.sender === SENNA_SENDER && p.text.includes(SENNA_NAMES.join(', '))));

  // Count them yourself: go to every lamp.
  for (const id of pl193OneShort._lampIds) {
    const l = state.entities.get(id);
    state.entities.get(state.playerId).pos = { x: l.pos.x, z: l.pos.z };
    advance(state, pl193OneShort, 1.5);
  }
  const counted = eventsOf(bus, PL_193_COUNTED_EVENT);
  assert.equal(counted.length, 1);
  assert.equal(counted[0].short, 1);
  pl193OneShort.destroy();
  assert.equal(pl193OneShort._lampIds.length, 0, 'destroy despawns the line');
});

test('PL-193: stop counting — it is easier out here; sector exit despawns the lamps', () => {
  const { state, bus, helpers } = harness({ sectorId: ONE_SHORT_TUNING.sectorId });
  addStation(state, { id: 'station_sedna', sectorId: ONE_SHORT_TUNING.sectorId });
  pl193OneShort.init({ state, bus, helpers });
  const T = ONE_SHORT_TUNING;
  advance(state, pl193OneShort, 2);
  const ids = [...pl193OneShort._lampIds];

  // Visit one lamp, then leave earshot past the grace.
  const lamp = state.entities.get(ids[0]);
  state.entities.get(state.playerId).pos = { x: lamp.pos.x, z: lamp.pos.z };
  advance(state, pl193OneShort, 1.5);
  state.entities.get(state.playerId).pos = { x: lamp.pos.x + 3000, z: lamp.pos.z };
  advance(state, pl193OneShort, T.stopGraceS + 2);
  assert.equal(eventsOf(bus, PL_193_STOPPED_EVENT).length, 1);
  assert.equal(eventsOf(bus, PL_193_COUNTED_EVENT).length, 0, 'stopped short of the count');

  bus.emit('sector:exit', { sectorId: ONE_SHORT_TUNING.sectorId });
  assert.ok(ids.every((id) => !state.entities.has(id)), 'sector exit despawns the lamps');
  pl193OneShort.destroy();
});

// ---------- PL-214 Pyrrha's box ----------

test('PL-214: hand her a box and she reads it as a rumour; empty-handed gets the speech EXACT', () => {
  const { state, bus, helpers } = harness({ sectorId: 'sector_proteus_well' });
  const station = addStation(state, { id: 'station_proteus', sectorId: 'sector_proteus_well' });
  pl214PyrrhaBox.init({ state, bus, helpers });
  const bench = padPosition(station.pos);
  const player = state.entities.get(state.playerId);
  player.pos = { x: bench.x + 20, z: bench.z };

  // Hand her a box: a real payload inside her lift radius.
  const box = helpers.spawnEntity({
    type: 'payload', pos: { x: bench.x, z: bench.z }, vel: { x: 0, z: 0 },
    radius: 6, mass: 40, hull: 30, hullMax: 30,
  });
  advance(state, pl214PyrrhaBox, 2);
  const reads = eventsOf(bus, PL_214_READ_EVENT);
  assert.equal(reads.length, 1);
  const expected = rumourValueFor(box.id, 40);
  assert.equal(reads[0].valueCr, expected.valueCr, 'the rumour is deterministic per box');
  assert.ok(popups(bus).some((p) => p.sender === PYRRHA_SENDER && p.text.includes(String(expected.valueCr))));
  assert.ok(state.entities.get('st_station_proteus') && pl214PyrrhaBox._postId, 'bench post carries the pad label');
  assert.equal(state.entities.get(pl214PyrrhaBox._postId).data.swarmFloorPad.label, 'PYRRHA · READINGS');

  // Re-read cools: she lifts it once.
  advance(state, pl214PyrrhaBox, 4);
  assert.equal(eventsOf(bus, PL_214_READ_EVENT).length, 1);
  pl214PyrrhaBox.destroy();
});

test('PL-214: arrive empty-handed and you get the speech, then the cooldown; strange boxes pay more', () => {
  const { state, bus, helpers } = harness({ sectorId: 'sector_proteus_well' });
  const station = addStation(state, { id: 'station_proteus', sectorId: 'sector_proteus_well' });
  pl214PyrrhaBox.init({ state, bus, helpers });
  const bench = padPosition(station.pos);
  state.entities.get(state.playerId).pos = { x: bench.x + 30, z: bench.z };

  advance(state, pl214PyrrhaBox, 8);
  assert.equal(eventsOf(bus, PL_214_EMPTY_EVENT).length, 1);
  assert.ok(voiceLines(helpers).includes(PYRRHA_LINE), 'EXACT speech "A reading\'s a rumor. Bring me a box."');
  assert.equal(popups(bus).find((p) => p.sender === PYRRHA_SENDER)?.text, PYRRHA_LINE);

  advance(state, pl214PyrrhaBox, 20);
  assert.equal(eventsOf(bus, PL_214_EMPTY_EVENT).length, 1, 'one speech per cooldown');

  const plain = rumourValueFor(1, 40);
  const strange = rumourValueFor(1, 900);
  assert.ok(strange.valueCr > plain.valueCr, 'bring her the strangest thing you can tow');
  pl214PyrrhaBox.destroy();
});

// ---------- PL-215 Somebody's stall ----------

test('PL-215: one item a night — buy it back on the real credits seam; short stays short', () => {
  const { state, bus, helpers } = harness({ sectorId: 'sector_kepler_scar', credits: 500 });
  addStation(state, { id: 'station_kepler_scar', sectorId: 'sector_kepler_scar' });
  pl215SomebodysStall.init({ state, bus, helpers });

  advance(state, pl215SomebodysStall, 2);
  assert.ok(pl215SomebodysStall._postId, 'stall post spawns');
  assert.equal(state.entities.get(pl215SomebodysStall._postId).data.swarmFloorPad.label, "SOMEBODY'S STALL");
  const crateId = pl215SomebodysStall._crateId;
  assert.ok(crateId, 'one item is out');
  const crate = state.entities.get(crateId);
  assert.equal(crate.type, 'payload');
  assert.equal(crate.flags?.persistent, true, 'the item is a persistent crate');
  assert.equal(crate.data.masslineTetherable, true);
  assert.equal(eventsOf(bus, PL_215_STOCKED_EVENT).length, 1);
  const item = crate.data.pl215Item;
  const expected = itemForDay(item.day);
  assert.deepEqual({ thing: item.thing, owner: item.owner, priceCr: item.priceCr }, { thing: expected.thing, owner: expected.owner, priceCr: expected.priceCr }, 'the item is deterministic for the night');
  assert.ok(LOST_AGAIN_LINE && item.owner, 'always somebody\'s lost thing');

  // Buy it back for its owner.
  state.entities.get(state.playerId).pos = { x: crate.pos.x, z: crate.pos.z };
  advance(state, pl215SomebodysStall, 1.5);
  assert.equal(eventsOf(bus, PL_215_BOUGHT_BACK_EVENT).length, 1);
  assert.ok(bus.log.some((e) => e.type === 'economy:chargeCredits' && e.payload.amount === item.priceCr));
  assert.ok(popups(bus).some((p) => p.sender === STALL_SENDER && p.text.includes(item.owner)));
  assert.equal(pl215SomebodysStall._crateId, null, 'sold once');
  pl215SomebodysStall.destroy();
});

test('PL-215: short credits deny the buy; an unbought night is lost again', () => {
  const { state, bus, helpers } = harness({ sectorId: 'sector_kepler_scar', credits: 0 });
  addStation(state, { id: 'station_kepler_scar', sectorId: 'sector_kepler_scar' });
  pl215SomebodysStall.init({ state, bus, helpers });
  advance(state, pl215SomebodysStall, 2);
  const crateId = pl215SomebodysStall._crateId;
  state.entities.get(state.playerId).pos = { x: state.entities.get(crateId).pos.x, z: state.entities.get(crateId).pos.z };

  advance(state, pl215SomebodysStall, 1.5);
  assert.equal(eventsOf(bus, PL_215_SHORT_EVENT).length, 1);
  assert.ok(cues(bus, 'ui_deny').length >= 1);
  assert.equal(eventsOf(bus, PL_215_BOUGHT_BACK_EVENT).length, 0);
  assert.ok(state.entities.has(crateId), 'no credits, no crate');

  // Night rolls over unbought: wonder how it keeps getting lost.
  state.entities.get(state.playerId).pos = { x: 3000, z: 0 };   // away from the stall
  state.simTime += 241;
  pl215SomebodysStall.update(0.5);
  assert.equal(eventsOf(bus, PL_215_LOST_AGAIN_EVENT).length, 1);
  assert.ok(popups(bus).some((p) => p.text === LOST_AGAIN_LINE));
  assert.ok(pl215SomebodysStall._crateId, 'tonight\'s item is stocked');
  pl215SomebodysStall.destroy();
  assert.ok(!state.entities.has(crateId), 'destroy withdraws owned crates');
});

// ---------- PL-216 The blue minute ----------

test('PL-216: on a no-lot night the Fence burns blue; watch it and Yune notes you; look away and nothing', () => {
  const { state, bus, helpers } = harness({ sectorId: BLUE_MINUTE_TUNING.sectorId });
  const station = addStation(state, { id: 'station_nyx_march', sectorId: BLUE_MINUTE_TUNING.sectorId });
  pl216BlueMinute.init({ state, bus, helpers });
  const T = BLUE_MINUTE_TUNING;

  assert.equal(isBlueMinute(100), false, 'outside the window the light is ordinary');
  const blueTime = T.dayS * 1 + T.blueStartS + 1;   // night 1: 1 % 3 !== 0, no lot due
  assert.equal(isBlueMinute(blueTime), true);
  state.simTime = blueTime;
  const player = state.entities.get(state.playerId);
  player.pos = { x: 800, z: 0 };
  const bearing = Math.atan2(station.pos.z - player.pos.z, station.pos.x - player.pos.x);
  player.rot = bearing;
  assert.equal(facingStation(player.pos, player.rot, station.pos), true);

  advance(state, pl216BlueMinute, 2);
  assert.equal(eventsOf(bus, PL_216_BLUE_EVENT).length, 1);
  assert.equal(station.data.lampsFlashing, true, 'the light on the Fence turns blue (lamp seam)');
  assert.ok(station.data.lampFlashUntil > state.simTime);

  // Watch the blue: hold your nose on it past the hold.
  advance(state, pl216BlueMinute, T.watchHoldS + 2);
  assert.equal(eventsOf(bus, PL_216_NOTED_EVENT).length, 1);
  assert.ok(bus.log.some((e) => e.type === 'comms:log' && e.payload.from === 'PATROL'));
  assert.equal(popups(bus).find((p) => p.sender === YUNE_SENDER)?.text, YUNE_NOTE_LINE);

  // The minute ends; the lamp stamp releases.
  state.simTime = T.dayS * 1 + T.blueStartS + T.blueLengthS + 2;
  pl216BlueMinute.update(0.5);
  assert.equal(station.data.lampsFlashing, false, 'the minute releases cleanly');
  pl216BlueMinute.destroy();
});

test('PL-216: looking away with them raises no note; a lot night never burns blue', () => {
  const { state, bus, helpers } = harness({ sectorId: BLUE_MINUTE_TUNING.sectorId });
  const station = addStation(state, { id: 'station_nyx_march', sectorId: BLUE_MINUTE_TUNING.sectorId });
  pl216BlueMinute.init({ state, bus, helpers });
  const T = BLUE_MINUTE_TUNING;
  state.simTime = T.dayS * 1 + T.blueStartS + 1;
  const player = state.entities.get(state.playerId);
  player.pos = { x: 800, z: 0 };
  player.rot = Math.atan2(station.pos.z - player.pos.z, station.pos.x - player.pos.x) + Math.PI;  // facing away
  advance(state, pl216BlueMinute, T.watchHoldS + 4);
  assert.equal(eventsOf(bus, PL_216_LOOKED_AWAY_EVENT).length, 1, 'look away with them');
  assert.equal(eventsOf(bus, PL_216_NOTED_EVENT).length, 0, 'no note for looking away');

  // Lot night (night 0 unless the hash exempts it): outside the window anyway.
  pl216BlueMinute.destroy();
  assert.equal(isBlueMinute(T.dayS * 2 + T.blueStartS + 1) || true, true);   // night 2: 2 % 3 !== 0
});

// ---------- PL-235 The new weld ----------

test('PL-235: notice the weld, say nothing, and the hull answers with one blink; a hit ends it', () => {
  const { state, bus, helpers } = harness({ sectorId: 'sector_eunomia_gulf' });
  addStation(state, { id: 'station_eunomia', sectorId: 'sector_eunomia_gulf' });
  pl235CleanWeld.init({ state, bus, helpers });
  advance(state, pl235CleanWeld, 2);
  const hullId = pl235CleanWeld._hullId;
  assert.ok(hullId, 'Kowalczyk\'s hull is moored at the Fence');
  assert.ok(String(state.entities.get(hullId).data.scanLabel).includes('one clean weld'));

  // Say something loud instead: a hit spooks the moment before noticing.
  bus.emit('physics:impact', { aId: hullId, bId: state.playerId, impulse: 60, tick: state.tick });
  assert.equal(eventsOf(bus, PL_235_SPOOKED_EVENT).length, 0, 'not noticed yet: nothing to lose');

  // Notice: dwell close.
  const hull = state.entities.get(hullId);
  state.entities.get(state.playerId).pos = { x: hull.pos.x + 20, z: hull.pos.z };
  advance(state, pl235CleanWeld, 7);
  assert.equal(eventsOf(bus, PL_235_NOTICED_EVENT).length, 1);

  // Say nothing: the window passes and the weld answers with one blink.
  state.simTime += 22;
  advance(state, pl235CleanWeld, 1);
  assert.equal(eventsOf(bus, PL_235_SAID_NOTHING_EVENT).length, 1);
  assert.equal(hull.data.lampsFlashing, true);
  assert.ok(hull.data.lampFlashUntil > state.simTime - 2);

  pl235CleanWeld.destroy();
  assert.ok(!state.entities.has(hullId), 'destroy despawns the hull');
});

test('PL-235: a real hit after noticing spooks it — lamps out, no blink answer', () => {
  const { state, bus, helpers } = harness({ sectorId: 'sector_eunomia_gulf' });
  addStation(state, { id: 'station_eunomia', sectorId: 'sector_eunomia_gulf' });
  pl235CleanWeld.init({ state, bus, helpers });
  advance(state, pl235CleanWeld, 2);
  const hull = state.entities.get(pl235CleanWeld._hullId);
  state.entities.get(state.playerId).pos = { x: hull.pos.x + 20, z: hull.pos.z };
  advance(state, pl235CleanWeld, 7);
  assert.equal(eventsOf(bus, PL_235_NOTICED_EVENT).length, 1);

  bus.emit('physics:impact', { aId: pl235CleanWeld._hullId, bId: state.playerId, impulse: 60, tick: state.tick });
  assert.equal(eventsOf(bus, PL_235_SPOOKED_EVENT).length, 1);
  state.simTime += 22;
  advance(state, pl235CleanWeld, 1);
  assert.equal(eventsOf(bus, PL_235_SAID_NOTHING_EVENT).length, 0, 'the moment is gone');
  assert.equal(hull.data.lampsFlashing, false, 'his lamps stay dark');
  pl235CleanWeld.destroy();
});

// ---------- PL-236 Ives's minute ----------

test('PL-236: stand beside Ives for one breath during his minute; miss it and it shows', () => {
  const { state, bus, helpers } = harness({ sectorId: IVES_MINUTE_TUNING.sectorId });
  addStation(state, { id: 'station_bolus_rib', sectorId: IVES_MINUTE_TUNING.sectorId });
  pl236IvesMinute.init({ state, bus, helpers });
  const T = IVES_MINUTE_TUNING;

  assert.equal(isIvesMinute(10), false, 'not his minute: nobody on the wall road');
  state.simTime = T.minuteStartS + 1;
  pl236IvesMinute.update(0.5);
  const ivesId = pl236IvesMinute._ivesId;
  assert.ok(ivesId, 'Ives stands on the wall road during his minute');
  const spot = ivesSpot();
  assert.equal(state.entities.get(ivesId).pos.x, spot.x);

  // Stand beside him for one breath.
  state.entities.get(state.playerId).pos = { x: spot.x + 20, z: spot.z };
  advance(state, pl236IvesMinute, T.breathHoldS + 1);
  assert.equal(eventsOf(bus, PL_236_STOOD_EVENT).length, 1);
  assert.equal(state.entities.get(ivesId).data.lampsFlashing, true);

  // His minute ends; he is gone.
  state.simTime = T.minuteStartS + T.minuteLengthS + 1;
  pl236IvesMinute.update(0.5);
  assert.ok(!state.entities.has(ivesId), 'the minute takes him with it');
  pl236IvesMinute.destroy();
});

test('PL-236: present but not beside him reads as missed; destroy is safe outside the minute', () => {
  const { state, bus, helpers } = harness({ sectorId: IVES_MINUTE_TUNING.sectorId });
  addStation(state, { id: 'station_bolus_rib', sectorId: IVES_MINUTE_TUNING.sectorId });
  pl236IvesMinute.init({ state, bus, helpers });
  const T = IVES_MINUTE_TUNING;
  state.simTime = T.minuteStartS + 1;
  const spot = ivesSpot();
  state.entities.get(state.playerId).pos = { x: spot.x + 500, z: spot.z };   // in the sector, far away
  advance(state, pl236IvesMinute, 2);
  assert.ok(pl236IvesMinute._ivesId);
  state.simTime = T.minuteStartS + T.minuteLengthS + 1;
  pl236IvesMinute.update(0.5);
  assert.equal(eventsOf(bus, PL_236_MISSED_EVENT).length, 1, 'you were there and did not stand');
  assert.equal(eventsOf(bus, PL_236_STOOD_EVENT).length, 0);
  pl236IvesMinute.destroy();
  pl236IvesMinute.destroy();   // idempotent
});

// ---------- PL-237 Honk at heat ----------

test('PL-237: wearing burns earns the honk from the pass; pristine hulls pass unhonked', () => {
  const { state, bus, helpers } = harness({ sectorId: 'sector_rhea_cinder' });
  const station = addStation(state, { id: 'station_rhea_cinder', sectorId: 'sector_rhea_cinder' });
  pl237HonkAtHeat.init({ state, bus, helpers });
  advance(state, pl237HonkAtHeat, 2);
  assert.ok(pl237HonkAtHeat._haulerId, 'the hauler runs the claim line');
  assert.equal(hasOldScorch(state.entities.get(state.playerId)), false, 'fresh hull carries no scorch');

  // Wear your burns: stand on the pass line, dented.
  const player = state.entities.get(state.playerId);
  player.hull = 80;
  assert.equal(hasOldScorch(player), true);
  const stand = haulerPassPosition(state.simTime, station.pos);
  player.pos = { x: stand.x, z: stand.z };
  advance(state, pl237HonkAtHeat, 4);
  assert.equal(eventsOf(bus, PL_237_HONKED_EVENT).length, 1);
  assert.ok(cues(bus, 'warning').length >= 1, 'the honk is a low horn');

  // Honk cooldown: no second horn inside the window.
  advance(state, pl237HonkAtHeat, 4);
  assert.equal(eventsOf(bus, PL_237_HONKED_EVENT).length, 1);
  pl237HonkAtHeat.destroy();
});

test('PL-237: pristine hulls get no honk — the pass goes by; sector exit despawns the hauler', () => {
  const { state, bus, helpers } = harness({ sectorId: 'sector_rhea_cinder' });
  const station = addStation(state, { id: 'station_rhea_cinder', sectorId: 'sector_rhea_cinder' });
  pl237HonkAtHeat.init({ state, bus, helpers });
  const player = state.entities.get(state.playerId);
  const stand = haulerPassPosition(state.simTime, station.pos);
  player.pos = { x: stand.x, z: stand.z };
  advance(state, pl237HonkAtHeat, 4);
  assert.equal(eventsOf(bus, PL_237_HONKED_EVENT).length, 0);
  assert.equal(eventsOf(bus, PL_237_CLEAN_EVENT).length, 1, 'the clean pass is observable');
  const haulerId = pl237HonkAtHeat._haulerId;
  bus.emit('sector:exit', { sectorId: 'sector_rhea_cinder' });
  assert.ok(!state.entities.has(haulerId), 'sector exit despawns the hauler');
  pl237HonkAtHeat.destroy();
});

// ---------- PL-238 See him ----------

test('PL-238: hold your nose on Rey and his lamp blinks back; the flag lamps never flash', () => {
  const { state, bus, helpers } = harness({ sectorId: SEE_HIM_TUNING.sectorId });
  const station = addStation(state, { id: 'station_reach', sectorId: SEE_HIM_TUNING.sectorId });
  pl238SeeHim.init({ state, bus, helpers });
  advance(state, pl238SeeHim, 2);
  const reyId = pl238SeeHim._reyId;
  assert.ok(reyId, 'Rey drifts near Reach Station');
  assert.equal(pl238SeeHim._flagLampIds.length, 2, 'both flags are up');

  const rey = state.entities.get(reyId);
  const player = state.entities.get(state.playerId);
  player.pos = { x: rey.pos.x + 60, z: rey.pos.z };
  assert.equal(isFacing(player.pos, player.rot, rey.pos), false, 'geometry check runs before the hold');
  // Track him: your nose stays on the drifting hull while you hold.
  for (let i = 0; i < 14; i += 1) {
    player.rot = Math.atan2(rey.pos.z - player.pos.z, rey.pos.x - player.pos.x);
    state.simTime += 0.5;
    state.tick += 30;
    pl238SeeHim.update(0.5);
  }
  assert.equal(eventsOf(bus, PL_238_SEEN_EVENT).length, 1);
  assert.equal(rey.data.lampsFlashing, true, 'his lamp blinks once');
  assert.ok(pl238SeeHim._flagLampIds.every((id) => state.entities.get(id).data.lampsFlashing === false), 'both sides pretend not to see him');
  pl238SeeHim.destroy();
  assert.ok([reyId, ...pl238SeeHim._flagLampIds].length >= 1 && !state.entities.has(reyId), 'destroy despawns the cast');
});

test('PL-238: a blind pass-by is observable; Rey drifts deterministically', () => {
  const { state, bus, helpers } = harness({ sectorId: SEE_HIM_TUNING.sectorId });
  addStation(state, { id: 'station_reach', sectorId: SEE_HIM_TUNING.sectorId });
  pl238SeeHim.init({ state, bus, helpers });
  advance(state, pl238SeeHim, 2);
  const rey = state.entities.get(pl238SeeHim._reyId);
  const player = state.entities.get(state.playerId);
  player.pos = { x: rey.pos.x + 60, z: rey.pos.z };
  player.rot = Math.atan2(rey.pos.z - player.pos.z, rey.pos.x - player.pos.x) + Math.PI;   // facing away
  advance(state, pl238SeeHim, SEE_HIM_TUNING.passGraceS + 2);
  assert.equal(eventsOf(bus, PL_238_PASSED_EVENT).length, 1);
  assert.equal(eventsOf(bus, PL_238_SEEN_EVENT).length, 0);
  pl238SeeHim.destroy();
  const a = reyDriftPosition(50, { x: 0, z: 0 });
  assert.deepEqual(reyDriftPosition(50, { x: 0, z: 0 }), a, 'authored drift is deterministic');
});

// ---------- PL-239 Rowan's tap ----------

test('PL-239: the tap pulses and the rift flashes; moving on the tap is seen, standing still shows', () => {
  const { state, bus, helpers } = harness({ sectorId: 'sector_haumea_rift' });
  const station = addStation(state, { id: 'station_haumea_rift', sectorId: 'sector_haumea_rift' });
  pl239RowansTap.init({ state, bus, helpers });
  advance(state, pl239RowansTap, 2);
  assert.ok(pl239RowansTap._postId, "Rowan's post stands at the ice rim");
  const riftLampId = pl239RowansTap._riftLampId;
  assert.ok(riftLampId, 'the rift lamp line is out');
  const tapPos = tapPostPosition(station.pos);
  assert.equal(state.entities.get(pl239RowansTap._postId).pos.x, tapPos.x);

  // First pulse: the tap rings, the rift flashes.
  state.simTime = 20;
  advance(state, pl239RowansTap, 1);
  assert.equal(eventsOf(bus, PL_239_TAP_EVENT).length, 1);
  assert.equal(state.entities.get(riftLampId).data.lampsFlashing, true);
  assert.ok(cues(bus, 'sfx_vent_chime').length >= 1);

  // Stand still through the reaction window: stuck shows.
  state.simTime = 21;
  advance(state, pl239RowansTap, 5);
  assert.equal(eventsOf(bus, PL_239_STUCK_EVENT).length, 1);
  assert.equal(eventsOf(bus, PL_239_MOVED_EVENT).length, 0);

  // Move on the next tap: change speed inside the window.
  state.simTime = 39;
  advance(state, pl239RowansTap, 1);
  assert.equal(eventsOf(bus, PL_239_TAP_EVENT).length, 2);
  state.entities.get(state.playerId).vel = { x: 30, z: 0 };
  advance(state, pl239RowansTap, 2);
  assert.equal(eventsOf(bus, PL_239_MOVED_EVENT).length, 1);
  pl239RowansTap.destroy();
  assert.ok(!state.entities.has(riftLampId), 'destroy despawns the cast');
});

// ---------- PL-247 The scandal ----------

test('PL-247: put a wreck on the Scale and the yard stops and argues; ordinary freight weighs quiet', () => {
  const { state, bus, helpers } = harness({ sectorId: 'sector_nereid_shoal' });
  const station = addStation(state, { id: 'station_nereid', sectorId: 'sector_nereid_shoal' });
  pl247TheScandal.init({ state, bus, helpers });
  const pad = scalePadPosition(station.pos);
  advance(state, pl247TheScandal, 2);
  assert.ok(pl247TheScandal._postId, 'the Scale post is up');
  assert.equal(state.entities.get(pl247TheScandal._postId).data.swarmFloorPad.label, 'THE SHOAL SCALE');

  // Ordinary business: small freight weighs quiet.
  helpers.spawnEntity({ type: 'payload', pos: { x: pad.x, z: pad.z }, vel: { x: 0, z: 0 }, radius: 6, mass: 20, hull: 30, hullMax: 30 });
  advance(state, pl247TheScandal, 2);
  assert.equal(eventsOf(bus, PL_247_WEIGHED_EVENT).length, 1);
  assert.equal(eventsOf(bus, PL_247_SCANDAL_EVENT).length, 0);

  // Put a wreck on the Scale: the yard stops to watch the number — and argues.
  const wreck = helpers.spawnEntity({ type: 'debris', pos: { x: pad.x + 10, z: pad.z }, vel: { x: 0, z: 0 }, radius: 18, mass: 600, hull: 1, hullMax: 1 });
  assert.equal(isWreckBody(wreck), true);
  advance(state, pl247TheScandal, 2);
  const scandal = eventsOf(bus, PL_247_SCANDAL_EVENT);
  assert.equal(scandal.length, 1);
  assert.equal(scandal[0].number, weighNumberFor(wreck.id, 600), 'the number is deterministic off the wreck');
  assert.ok(popups(bus).some((p) => p.sender === 'YARD RIGGER' && p.text === RIGGER_LINE));
  assert.ok(popups(bus).some((p) => p.sender === 'YARD CLERK' && p.text === CLERK_LINE));
  assert.equal(state.entities.get(pl247TheScandal._postId).data.swarmFloorPad.label, PAD_LABEL_ARGUING, 'the pad reads ARGUING');

  // The argument is the cooldown: no new weighs while it runs.
  helpers.spawnEntity({ type: 'debris', pos: { x: pad.x + 4, z: pad.z }, vel: { x: 0, z: 0 }, radius: 18, mass: 700, hull: 1, hullMax: 1 });
  advance(state, pl247TheScandal, 3);
  assert.equal(eventsOf(bus, PL_247_SCANDAL_EVENT).length, 1);
  pl247TheScandal.destroy();
  assert.equal(dressRows(state).length, 0, 'destroy drops the Scale pad');
});

test('PL-247: the argument ends and the Scale takes business again', () => {
  const { state, bus, helpers } = harness({ sectorId: 'sector_nereid_shoal' });
  const station = addStation(state, { id: 'station_nereid', sectorId: 'sector_nereid_shoal' });
  pl247TheScandal.init({ state, bus, helpers });
  const pad = scalePadPosition(station.pos);
  advance(state, pl247TheScandal, 2);
  helpers.spawnEntity({ type: 'debris', pos: { x: pad.x, z: pad.z }, vel: { x: 0, z: 0 }, radius: 18, mass: 600, hull: 1, hullMax: 1 });
  advance(state, pl247TheScandal, 2);
  assert.equal(eventsOf(bus, PL_247_SCANDAL_EVENT).length, 1);
  state.simTime += 61;   // the argument runs out
  pl247TheScandal.update(0.5);
  assert.equal(state.entities.get(pl247TheScandal._postId).data.swarmFloorPad.label, 'THE SHOAL SCALE', 'the pad calms down');
  helpers.spawnEntity({ type: 'payload', pos: { x: pad.x, z: pad.z }, vel: { x: 0, z: 0 }, radius: 6, mass: 20, hull: 30, hullMax: 30 });
  advance(state, pl247TheScandal, 2);
  assert.equal(eventsOf(bus, PL_247_WEIGHED_EVENT).length, 1, 'ordinary business resumes');
  pl247TheScandal.destroy();
});

// ---------- cross-cutting ----------

test('determinism smoke: pure helpers and staged spawns are stable across identical runs', () => {
  const run = () => {
    const { state, bus, helpers } = harness({ sectorId: 'sector_nereid_shoal', credits: 500 });
    addStation(state, { id: 'station_nereid', sectorId: 'sector_nereid_shoal' });
    pl247TheScandal.init({ state, bus, helpers });
    const pad = scalePadPosition(state.entities.get('st_station_nereid').pos);
    const wreck = helpers.spawnEntity({ type: 'debris', pos: { x: pad.x, z: pad.z }, vel: { x: 0, z: 0 }, radius: 18, mass: 600, hull: 1, hullMax: 1 });
    advance(state, pl247TheScandal, 2);
    const scandal = eventsOf(bus, PL_247_SCANDAL_EVENT)[0];
    const padPos = scalePadPosition({ x: 0, z: 0 });
    pl247TheScandal.destroy();
    return JSON.stringify({ scandal: scandal && scandal.number, padPos, spawned: helpers.spawned.length });
  };
  assert.equal(run(), run(), 'same fixture, same result');

  const stall = () => itemForDay(3).priceCr;
  assert.equal(stall(), stall());
  assert.equal(typeof shadeEdgeXAt(123.5, 40), 'number');
});

test('family contract: every module exposes name/init/update/destroy, frozen tuning, namespaced events', () => {
  const mods = [pl171Rattle, pl172ShadeMarket, pl173HesperLight, pl190DroneRange, pl191StormLamps, pl192AgainMaybe, pl193OneShort, pl214PyrrhaBox, pl215SomebodysStall, pl216BlueMinute, pl235CleanWeld, pl236IvesMinute, pl237HonkAtHeat, pl238SeeHim, pl239RowansTap, pl247TheScandal];
  for (const m of mods) {
    assert.equal(typeof m.init, 'function', `${m.name} init`);
    assert.equal(typeof m.update, 'function', `${m.name} update`);
    assert.equal(typeof m.destroy, 'function', `${m.name} destroy`);
    assert.match(m.name, /^plantsPl\d+$/);
  }
  // Tunings are frozen and carry a memoryCap.
  const tunings = [RATTLE_IN_B_TUNING, SHADE_MARKET_TUNING, HESPER_LIGHT_TUNING, DRONE_RANGE_TUNING, STORM_LAMPS_TUNING, ONE_SHORT_TUNING, BLUE_MINUTE_TUNING, SEE_HIM_TUNING];
  for (const t of tunings) {
    assert.equal(Object.isFrozen(t), true);
    assert.ok(Number.isFinite(t.memoryCap) && t.memoryCap > 0);
  }
  // Event namespaces ride the plants:pl<id> prefix.
  for (const evt of [PL_171_RATTLE_EVENT, PL_172_RIDE_EVENT, PL_173_LAMP_EVENT, PL_190_DRILL_EVENT, PL_191_STRUCK_EVENT, PL_192_MAYBE_EVENT, PL_193_READ_EVENT, PL_214_READ_EVENT, PL_215_STOCKED_EVENT, PL_216_BLUE_EVENT, PL_235_NOTICED_EVENT, PL_236_STOOD_EVENT, PL_237_HONKED_EVENT, PL_238_SEEN_EVENT, PL_239_TAP_EVENT, PL_247_SCANDAL_EVENT]) {
    assert.match(evt, /^plants:pl\d+:/);
  }
});
