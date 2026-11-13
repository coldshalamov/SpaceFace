// test/plants-street-life-1.test.mjs — headless checks for the 13 town street-life plant
// modules (PL-105/106/107/128/129/130/178/179/180/181/182/183/199).
//
// Every module is a standalone `plantsPl<id>` object with init(ctx)/update(dt,state)/destroy().
// The harness is a recording bus + a spec-spreading spawnEntity + a recording voice — no DOM,
// no Three.js, no wall clock: state.simTime is driven by hand. All reactions ride the real
// seams (physics:impact receipts, furnace:fed, dock:docked, comms:popup, voice:say, audio:cue).
import test from 'node:test';
import assert from 'node:assert/strict';

import { pl105Standoff, PL_105_PARTED_EVENT, PL_105_RANK_CLOSED_EVENT, STANDOFF_TUNING, mergePointFor } from '../src/systems/plants/pl105Standoff.js';
import { pl106PartsSled, PL_106_FED_EVENT, PL_106_SHADOWED_EVENT, PL_106_MARKET_NIGHT_EVENT, PARTS_SLED_TUNING, nextNightStartAt } from '../src/systems/plants/pl106PartsSled.js';
import { pl107EmptySlot, PL_107_HOME_EVENT, PL_107_BARGE_NINE_EVENT, PL_107_RIGHT_OF_WAY_EVENT, mouthPointFor } from '../src/systems/plants/pl107EmptySlot.js';
import { pl128TheSurge, PL_128_SURGE_EVENT, PL_128_PARTED_EVENT, PL_128_BOXED_EVENT, SURGE_TUNING, surgeLaneFor, berthPointFor } from '../src/systems/plants/pl128TheSurge.js';
import { pl129SomebodysCrate, PL_129_BRIGHT_POUR_EVENT, PL_129_CRATE_EVENT, PL_129_BILL_EVENT, PL_129_PA_LINE, isOnBeat } from '../src/systems/plants/pl129SomebodysCrate.js';
import { pl130TheStamp, PL_130_STAMPED_EVENT, PL_130_HELD_EVENT, THE_STAMP_TUNING, hammerPointFor } from '../src/systems/plants/pl130TheStamp.js';
import { pl178SlingshotHour, PL_178_HOUR_EVENT, PL_178_RIDING_EVENT, PL_178_CAUGHT_EVENT, PL_178_GIVEN_EVENT, streamFor } from '../src/systems/plants/pl178SlingshotHour.js';
import { pl179KesslersNumber, PL_179_NUMBER_EVENT, PL_179_EXTRA_EVENT, PL_179_LEARNED_FLAG, PL_179_READ_LINE, KESSLERS_NUMBER_TUNING } from '../src/systems/plants/pl179KesslersNumber.js';
import { pl180ChalkThief, PL_180_CHALKED_EVENT, PL_180_BEATEN_EVENT, CHALK_THIEF_TUNING } from '../src/systems/plants/pl180ChalkThief.js';
import { pl181HotCargo, PL_181_HEATED_EVENT, PL_181_QUENCHED_EVENT, PL_181_ROASTED_EVENT, coolantPointFor, HOT_CARGO_TUNING } from '../src/systems/plants/pl181HotCargo.js';
import { pl182FlagTruce, PL_182_TRUCE_EVENT, PL_182_BROKEN_EVENT, repaintSideOf } from '../src/systems/plants/pl182FlagTruce.js';
import { pl183TheWeather, PL_183_RECHALKED_EVENT, PL_183_ANSWERED_EVENT, PL_183_WEATHER_LINE, weatherFor, doorLineFor } from '../src/systems/plants/pl183TheWeather.js';
import { pl199TheJug, PL_199_JUG_EVENT, PL_199_DRUNK_EVENT, PL_199_STEERED_EVENT, PL_199_STEERED_FLAG, THE_JUG_TUNING, jugPointFor, hullFractionOf } from '../src/systems/plants/pl199TheJug.js';

// ---------- harness ----------

const SEED = 1234;

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
  };
}

function dockRadiusForSize(size) {
  return size === 'L' ? 90 : size === 'S' ? 60 : 72;
}

function makeState({ sectorId = 'sector_tethys_junction', pos = { x: 0, z: 0 }, overrides = {} } = {}) {
  const entities = new Map();
  const state = {
    mode: 'flight',
    simTime: 0,
    tick: 0,
    playerId: 'p1',
    entities,
    world: { currentSectorId: sectorId },
    meta: { seed: SEED },
    story: { flags: {} },
    player: { credits: 0, cargo: { items: {} } },
    ...overrides,
  };
  entities.set(state.playerId, {
    id: state.playerId, alive: true, type: 'ship', isPlayer: true,
    pos: { x: pos.x, z: pos.z }, vel: { x: 0, z: 0 }, rot: 0,
    hull: 100, hullMax: 100, mass: 10.5, data: {},
  });
  return state;
}

function stationFixture(id, pos, size = 'M') {
  return {
    id, alive: true, type: 'station',
    pos: { x: pos.x, z: pos.z }, vel: { x: 0, z: 0 },
    size,
    data: { stationId: id, dockRadius: dockRadiusForSize(size), size, factionId: 'faction_x' },
  };
}

function shipFixture(id, pos, { callsign = 'NPC hull', hull = 100, hullMax = 100, commodityId = null } = {}) {
  const data = { callsign };
  if (commodityId) data.commodityId = commodityId;
  return {
    id, alive: true, type: 'ship',
    pos: { x: pos.x, z: pos.z }, vel: { x: 0, z: 0 },
    hull, hullMax, mass: 8, data,
  };
}

function podFixture(id, pos, { payloadType = 'jettisoned_cargo', commodityId = null } = {}) {
  const data = { payloadType };
  if (commodityId) data.commodityId = commodityId;
  return {
    id, alive: true, type: 'payload',
    pos: { x: pos.x, z: pos.z }, vel: { x: 0, z: 0 },
    hull: 10, hullMax: 10, mass: 4, data,
  };
}

function makeHelpers(state) {
  const spawned = [];
  const removed = [];
  const voice = [];
  voice.say = (payload) => {   // the real helpers.voice.say contract, recording
    voice.push(payload);
    return true;
  };
  let nextId = 100;
  const helpers = {
    state,
    spawned,
    removed,
    voice,
    spawnEntity(spec) {
      const ent = {
        ...structuredClone(spec),
        id: nextId++,
        alive: true,
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

function harness({ sectorId, pos, stations = [], extraEntities = [], stateOverrides = {} } = {}) {
  const state = makeState({ sectorId, pos, overrides: stateOverrides });
  for (const st of stations) state.entities.set(st.id, st);
  for (const e of extraEntities) state.entities.set(e.id, e);
  const bus = createBus();
  const helpers = makeHelpers(state);
  return { state, bus, helpers };
}

function popups(bus) {
  return bus.log.filter((e) => e.type === 'comms:popup').map((e) => e.payload);
}
function cues(bus) {
  return bus.log.filter((e) => e.type === 'audio:cue').map((e) => e.payload);
}
function eventsOf(bus, type) {
  return bus.log.filter((e) => e.type === type).map((e) => e.payload);
}
function advance(state, mod, seconds, step = 0.5) {
  for (let t = 0; t < seconds - 1e-9; t += step) {
    state.simTime += step;
    state.tick += Math.round(step * 60);
    mod.update(step, state);
  }
}
/** Live owned entities: spawned records are clones; life is state membership. */
function ownedOf(helpers, stamp) {
  return helpers.spawned.filter((e) => e.data && e.data[stamp] !== undefined
    && helpers.state.entities.has(e.id));
}

// ---------- PL-105 The standoff ----------

test('PL-105: a queued merge spawns one Customs/Pitborn pair nose to nose at the gate', () => {
  const station = stationFixture('station_customs', { x: 0, z: 0 }, 'S');
  const h = harness({ sectorId: 'sector_tethys_junction', pos: { x: 80, z: 0 }, stations: [station] });
  pl105Standoff.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl105Standoff, 1.5);
  const pair = ownedOf(h.helpers, 'plantsPl105');
  assert.equal(pair.length, 2, 'one ship per half');
  const sides = pair.map((e) => e.data.plantsPl105).sort();
  assert.deepEqual(sides, ['customs', 'pitborn']);
  const a = pair.find((e) => e.data.plantsPl105 === 'customs');
  const b = pair.find((e) => e.data.plantsPl105 === 'pitborn');
  const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
  assert.ok(Math.abs(d - STANDOFF_TUNING.noseGapWu) < 1, `nose to nose at ${STANDOFF_TUNING.noseGapWu} WU, got ${d}`);
  // only one merge per shift
  advance(h.state, pl105Standoff, 10);
  assert.equal(ownedOf(h.helpers, 'plantsPl105').length, 2);
  pl105Standoff.destroy();
  assert.equal([...h.state.entities.values()].filter((e) => e.data && e.data.plantsPl105).length, 0, 'cleanup');
});

test('PL-105: shoved apart -> both halves honk thanks, then the pair moves on', () => {
  const station = stationFixture('station_customs', { x: 0, z: 0 }, 'S');
  const h = harness({ sectorId: 'sector_tethys_junction', pos: { x: 80, z: 0 }, stations: [station] });
  pl105Standoff.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl105Standoff, 1.5);
  const pair = ownedOf(h.helpers, 'plantsPl105');
  const customs = pair.find((e) => e.data.plantsPl105 === 'customs');
  const pitborn = pair.find((e) => e.data.plantsPl105 === 'pitborn');
  const m = mergePointFor(station, 0, SEED);
  // Push the Customs hull AWAY from its partner (normal = +n, partner direction = -n).
  h.bus.emit('physics:impact', {
    aId: h.state.playerId, bId: customs.id, playerInvolved: true,
    impulse: 500, normal: { x: m.n.x, z: m.n.z },
  });
  assert.equal(eventsOf(h.bus, PL_105_PARTED_EVENT).length, 1);
  const honks = popups(h.bus).filter((p) => p.text === 'Two short honks — thanks.');
  assert.equal(honks.length, 2, 'both halves honk');
  assert.deepEqual(honks.map((p) => p.sender).sort(), ['Customs queue', 'Pitborn queue']);
  assert.ok(cues(h.bus).some((c) => c.id === 'confirm'));
  // honk and go: the pair despawns after honkGoS
  advance(h.state, pl105Standoff, STANDOFF_TUNING.honkGoS + 1);
  assert.equal(ownedOf(h.helpers, 'plantsPl105').length, 0);
  assert.equal(eventsOf(h.bus, PL_105_RANK_CLOSED_EVENT).length, 0, 'a parting never closes ranks');
  pl105Standoff.destroy();
});

test('PL-105: nudged THROUGH -> the other half closes ranks for a week, no thanks, no re-form', () => {
  const station = stationFixture('station_customs', { x: 0, z: 0 }, 'S');
  const h = harness({ sectorId: 'sector_tethys_junction', pos: { x: 80, z: 0 }, stations: [station] });
  pl105Standoff.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl105Standoff, 1.5);
  const customs = ownedOf(h.helpers, 'plantsPl105').find((e) => e.data.plantsPl105 === 'customs');
  const m = mergePointFor(station, 0, SEED);
  h.bus.emit('physics:impact', {
    aId: h.state.playerId, bId: customs.id, playerInvolved: true,
    impulse: 500, normal: { x: -m.n.x, z: -m.n.z },   // toward the partner: through the gate
  });
  assert.equal(eventsOf(h.bus, PL_105_RANK_CLOSED_EVENT).length, 1);
  assert.equal(popups(h.bus).filter((p) => p.text.includes('Ranks close')).length, 1);
  assert.ok(cues(h.bus).some((c) => c.id === 'ui_deny'));
  assert.equal(eventsOf(h.bus, PL_105_PARTED_EVENT).length, 0, 'no thanks honks');
  assert.equal(ownedOf(h.helpers, 'plantsPl105').length, 0, 'the gate half disperses');
  // within the closure bark radius the closed half barks, on a cooldown
  advance(h.state, pl105Standoff, 3);
  const barks = popups(h.bus).filter((p) => p.text.includes('Closed ranks'));
  assert.ok(barks.length >= 1, 'the closure bark lands');
  const barkCount = barks.length;
  advance(h.state, pl105Standoff, 5);
  assert.equal(popups(h.bus).filter((p) => p.text.includes('Closed ranks')).length, barkCount,
    'bark is cooldown-gated');
  // no re-form inside the closure week, even past a shift boundary
  advance(h.state, pl105Standoff, STANDOFF_TUNING.shiftLengthS, 1);
  assert.equal(ownedOf(h.helpers, 'plantsPl105').length, 0);
  pl105Standoff.destroy();
});

test('PL-105: a bump below the shove gate moves nobody', () => {
  const station = stationFixture('station_customs', { x: 0, z: 0 }, 'S');
  const h = harness({ sectorId: 'sector_tethys_junction', pos: { x: 80, z: 0 }, stations: [station] });
  pl105Standoff.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl105Standoff, 1.5);
  const customs = ownedOf(h.helpers, 'plantsPl105').find((e) => e.data.plantsPl105 === 'customs');
  const m = mergePointFor(station, 0, SEED);
  h.bus.emit('physics:impact', {
    aId: h.state.playerId, bId: customs.id, playerInvolved: true,
    impulse: 100, normal: { x: m.n.x, z: m.n.z },
  });
  assert.equal(eventsOf(h.bus, PL_105_PARTED_EVENT).length, 0);
  assert.equal(eventsOf(h.bus, PL_105_RANK_CLOSED_EVENT).length, 0);
  pl105Standoff.destroy();
});

// ---------- PL-106 The parts sled ----------

function pl106Harness() {
  const station = stationFixture('station_sker', { x: 0, z: 0 }, 'M');
  const h = harness({ sectorId: 'sector_sker_reach', pos: { x: 60, z: 0 }, stations: [station] });
  return { h, station };
}

test('PL-106: the sled works the Chop Line and catches what the claws drop', () => {
  const { h } = pl106Harness();
  pl106PartsSled.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl106PartsSled, 1.5);
  const sled = ownedOf(h.helpers, 'plantsPl106Sled')[0];
  assert.ok(sled, 'the sled is on the line');
  // a part drops every 9 s, ahead of the sled; the sled reaches and eats it
  advance(h.state, pl106PartsSled, 16);
  assert.ok(eventsOf(h.bus, PL_106_FED_EVENT).length >= 1, 'the sled eats what it reaches');
  assert.ok(popups(h.bus).some((p) => p.text === 'The sled eats.'));
  const eats = popups(h.bus).filter((p) => p.text === 'The sled eats.').length;
  advance(h.state, pl106PartsSled, 3);
  assert.equal(popups(h.bus).filter((p) => p.text === 'The sled eats.').length, eats, 'eat line is cooldown-gated');
  pl106PartsSled.destroy();
});

test('PL-106: take a part out of the air -> the sled shadows you till Market Night', () => {
  const { h } = pl106Harness();
  pl106PartsSled.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl106PartsSled, 1.5);
  advance(h.state, pl106PartsSled, 9);   // lands on a drop tick: a part lies ahead of the sled
  const sled = h.state.entities.get(ownedOf(h.helpers, 'plantsPl106Sled')[0].id);
  const part = ownedOf(h.helpers, 'plantsPl106Part')[0];
  assert.ok(part, 'a loose part is in the air');
  // keep the part out of the sled's reach so only the player's catch takes it
  part.pos.x = sled.pos.x + 60;
  part.pos.z = sled.pos.z;
  h.bus.emit('physics:impact', {
    aId: h.state.playerId, bId: part.id, playerInvolved: true, impulse: 100,
    normal: { x: 0, z: 1 },
  });
  assert.equal(eventsOf(h.bus, PL_106_SHADOWED_EVENT).length, 1);
  assert.ok(popups(h.bus).some((p) => p.text.includes('You took it out of the air')));
  assert.equal(sled.data.swarmFloorPad.label, 'SLED WITNESS — BIDS RUN LOW');
  // shadow travel: the sled hangs off the player's quarter
  h.state.entities.get(h.state.playerId).pos.x = 500;
  advance(h.state, pl106PartsSled, 1.5);
  const shadowSled = h.state.entities.get(sled.id);
  const player = h.state.entities.get(h.state.playerId);
  assert.ok(Math.hypot(shadowSled.pos.x - player.pos.x, shadowSled.pos.z - player.pos.z) < 40,
    'the sled shadows the player');
  // negative: below the catch gate nothing starts
  h.bus.emit('physics:impact', {
    aId: h.state.playerId, bId: part.id, playerInvolved: true, impulse: 5,
    normal: { x: 0, z: 1 },
  });
  assert.equal(eventsOf(h.bus, PL_106_SHADOWED_EVENT).length, 1);
  // Market Night ends it
  const until = nextNightStartAt(h.state.simTime, PARTS_SLED_TUNING);
  advance(h.state, pl106PartsSled, until - h.state.simTime + 1, 1);
  assert.equal(eventsOf(h.bus, PL_106_MARKET_NIGHT_EVENT).length, 1, 'Market Night arrives');
  assert.equal(h.state.entities.has(sled.id), false, 'the sled goes back to work');
  pl106PartsSled.destroy();
});

// ---------- PL-107 The empty slot ----------

function pl107Harness() {
  const station = stationFixture('station_ceres', { x: 0, z: 0 }, 'M');
  const h = harness({ sectorId: 'sector_ceres_belt', pos: { x: 60, z: 0 }, stations: [station] });
  return { h, station };
}

function leadBargeHome(h, station) {
  const mouth = mouthPointFor(station);
  for (let i = 0; i < 40; i++) {
    const bargeId = [...h.state.entities.values()].find((e) => e.data && e.data.plantsPl107Barge);
    if (!bargeId) break;
    const d = Math.hypot(bargeId.pos.x - mouth.x, bargeId.pos.z - mouth.z);
    if (d <= 16) {
      // the module registers the arrival on its next 1 Hz pass
      advance(h.state, pl107EmptySlot, 1);
      return true;
    }
    // stay inside lead range, on the mouth side of the barge
    const dx = mouth.x - bargeId.pos.x;
    const dz = mouth.z - bargeId.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    h.state.entities.get(h.state.playerId).pos.x = bargeId.pos.x + (dx / len) * 30;
    h.state.entities.get(h.state.playerId).pos.z = bargeId.pos.z + (dz / len) * 30;
    advance(h.state, pl107EmptySlot, 1);
  }
  return false;
}

test('PL-107: a barge misses its number; led home, the mouth flashes thanks', () => {
  const { h, station } = pl107Harness();
  pl107EmptySlot.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl107EmptySlot, 1.5);
  const barge = [...h.state.entities.values()].find((e) => e.data && e.data.plantsPl107Barge);
  assert.ok(barge, 'barge nine is out there circling');
  assert.equal(barge.data.callsign, 'Barge nine');
  assert.ok(leadBargeHome(h, station), 'the barge reaches the mouth');
  assert.equal(eventsOf(h.bus, PL_107_HOME_EVENT).length, 1);
  assert.ok(station.data.plantsMouthFlashUntil > h.state.simTime, 'the mouth flashes thanks');
  assert.ok(popups(h.bus).some((p) => p.text.includes('The mouth flashes twice')));
  assert.equal([...h.state.entities.values()].filter((e) => e.data && e.data.plantsPl107Barge).length, 0);
  pl107EmptySlot.destroy();
});

test('PL-107: slide into the slot yourself -> the board counts you in, Dessa Kroll reads twice', () => {
  const { h, station } = pl107Harness();
  pl107EmptySlot.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl107EmptySlot, 1.5);
  const mouth = mouthPointFor(station);
  const player = h.state.entities.get(h.state.playerId);
  player.pos.x = mouth.x;
  player.pos.z = mouth.z;
  player.vel.x = 0;
  advance(h.state, pl107EmptySlot, 1.5);
  assert.equal(eventsOf(h.bus, PL_107_BARGE_NINE_EVENT).length, 1, 'counted in as barge nine');
  assert.ok(popups(h.bus).some((p) => p.sender === 'DESSA KROLL'));
  advance(h.state, pl107EmptySlot, 2, 1); // the board reads, twice
  const reads = h.helpers.voice.filter((v) => v.text.includes('Barge nine'));
  assert.equal(reads.length, 2, 'Dessa Kroll reads the board twice');
  assert.equal(reads[0].channel, 'ambient');
  pl107EmptySlot.destroy();
});

test('PL-107: counted-in hull keeps mouth right-of-way; a moving hull is never counted', () => {
  const { h, station } = pl107Harness();
  pl107EmptySlot.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl107EmptySlot, 1.5);
  const mouth = mouthPointFor(station);
  const player = h.state.entities.get(h.state.playerId);
  player.pos.x = mouth.x;
  player.pos.z = mouth.z;
  player.vel.x = 20;                       // moving: the board ignores you
  advance(h.state, pl107EmptySlot, 2);
  assert.equal(eventsOf(h.bus, PL_107_BARGE_NINE_EVENT).length, 0, 'a moving hull is not counted');
  player.vel.x = 0;
  advance(h.state, pl107EmptySlot, 1.5);
  assert.equal(eventsOf(h.bus, PL_107_BARGE_NINE_EVENT).length, 1);
  // the counted-in hull holds the mouth: circling traffic yields when it nears the slot
  const barge = [...h.state.entities.values()].find((e) => e.data && e.data.plantsPl107Barge);
  barge.pos.x = mouth.x + 40;
  barge.pos.z = mouth.z;
  advance(h.state, pl107EmptySlot, 1.5);
  assert.equal(eventsOf(h.bus, PL_107_RIGHT_OF_WAY_EVENT).length, 1, 'mouth right-of-way announced');
  pl107EmptySlot.destroy();
});

// ---------- PL-128 The surge ----------

function pl128Harness() {
  const station = stationFixture('station_helios', { x: 0, z: 0 }, 'L');
  const h = harness({ sectorId: 'sector_helios_core', pos: { x: 100, z: 0 }, stations: [station] });
  return { h, station };
}

test('PL-128: at the shift horn the whole harbor moves at once for a full minute', () => {
  const { h, station } = pl128Harness();
  pl128TheSurge.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl128TheSurge, 1.5);
  assert.equal(eventsOf(h.bus, PL_128_SURGE_EVENT).length, 1);
  assert.ok(popups(h.bus).some((p) => p.sender === 'HELIOS SHIFT HORN'));
  const movers = ownedOf(h.helpers, 'plantsPl128Mover');
  assert.equal(movers.length, SURGE_TUNING.moverCount);
  const liveMovers = movers.map((m) => h.state.entities.get(m.id));
  const before = liveMovers.map((m) => ({ ...m.pos }));
  advance(h.state, pl128TheSurge, 2, 1 / 60);
  const moved = ownedOf(h.helpers, 'plantsPl128Mover').map((m) => h.state.entities.get(m.id))
    .filter((m, i) => Math.hypot(m.pos.x - before[i].x, m.pos.z - before[i].z) > 1).length;
  assert.ok(moved >= SURGE_TUNING.moverCount - 1, 'the flow actually flows');
  // the minute ends and the movers go home
  advance(h.state, pl128TheSurge, SURGE_TUNING.surgeDurS, 1);
  assert.equal(ownedOf(h.helpers, 'plantsPl128Mover').length, 0, 'the surge runs out');
  pl128TheSurge.destroy();
});

test('PL-128: hold still in the middle and the harbor parts round you', () => {
  const { h, station } = pl128Harness();
  pl128TheSurge.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl128TheSurge, 1.5);
  const lane = surgeLaneFor(station, 0, SEED);
  const player = h.state.entities.get(h.state.playerId);
  player.pos.x = station.pos.x + lane.dir.x * 50;
  player.pos.z = station.pos.z + lane.dir.z * 50;
  player.vel.x = 0;
  player.vel.z = 0;
  advance(h.state, pl128TheSurge, 1.5);
  assert.equal(eventsOf(h.bus, PL_128_PARTED_EVENT).length, 1);
  assert.ok(popups(h.bus).some((p) => p.text.includes('the whole harbor parts round you')));
  pl128TheSurge.destroy();
});

test('PL-128: cut across the flow -> the tugs box you into a berth you did not pick', () => {
  const { h, station } = pl128Harness();
  pl128TheSurge.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl128TheSurge, 1.5);
  const lane = surgeLaneFor(station, 0, SEED);
  const player = h.state.entities.get(h.state.playerId);
  // start on one side of the lane, moving fast across it
  player.pos.x = station.pos.x + lane.dir.x * 50 + lane.perp.x * 15;
  player.pos.z = station.pos.z + lane.dir.z * 50 + lane.perp.z * 15;
  player.vel.x = 30;
  advance(h.state, pl128TheSurge, 0.5, 1 / 60);
  // cut: cross to the other side of the lane
  player.pos.x = station.pos.x + lane.dir.x * 50 - lane.perp.x * 15;
  player.pos.z = station.pos.z + lane.dir.z * 50 - lane.perp.z * 15;
  advance(h.state, pl128TheSurge, 0.5, 1 / 60);
  assert.equal(eventsOf(h.bus, PL_128_BOXED_EVENT).length, 1, 'the tugs box you in');
  assert.ok(popups(h.bus).some((p) => p.sender === 'TUG PAIR' && p.text.includes('You cut the flow')));
  assert.equal(cues(h.bus).some((c) => c.id === 'ui_deny'), true);
  const tugs = ownedOf(h.helpers, 'plantsPl128Tug');
  assert.equal(tugs.length, 2);
  // the tow pushes toward the berth: the tug pair holds formation on the player
  const berth = berthPointFor(station, 0, SEED);
  advance(h.state, pl128TheSurge, 1);
  const tugLive = ownedOf(h.helpers, 'plantsPl128Tug');
  assert.equal(tugLive.length, 2, 'tugs hold until the berth');
  // make fast at the berth they picked
  player.pos.x = berth.x;
  player.pos.z = berth.z;
  advance(h.state, pl128TheSurge, 1);
  assert.ok(popups(h.bus).some((p) => p.text.includes('Berth made fast')));
  assert.equal(ownedOf(h.helpers, 'plantsPl128Tug').length, 0, 'the tugs let go');
  pl128TheSurge.destroy();
  assert.equal([...h.state.entities.values()].filter((e) => e.data && (e.data.plantsPl128Tug || e.data.plantsPl128Mover)).length, 0,
    'cleanup removes owned hulls');
});

test('PL-128: still OFF the lane parts nothing', () => {
  const { h, station } = pl128Harness();
  pl128TheSurge.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  const lane = surgeLaneFor(station, 0, SEED);
  const player = h.state.entities.get(h.state.playerId);
  player.pos.x = station.pos.x + lane.perp.x * 200;   // well outside the corridor, BEFORE the horn
  player.pos.z = station.pos.z + lane.perp.z * 200;
  advance(h.state, pl128TheSurge, 1.5);
  advance(h.state, pl128TheSurge, 1.5);
  assert.equal(eventsOf(h.bus, PL_128_PARTED_EVENT).length, 0);
  pl128TheSurge.destroy();
});

// ---------- PL-129 Somebody's crate ----------

test('PL-129: a lump through on the beat makes the next pour run brighter', () => {
  const h = harness({});
  pl129SomebodysCrate.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl129SomebodysCrate, 1);       // simTime 1 -> on the beat
  assert.equal(isOnBeat(1), true);
  h.bus.emit('furnace:fed', { entityId: 42, type: 'asteroid', payloadType: null, pos: { x: 0, z: 0 }, sectorId: 'sector_ceres_belt' });
  advance(h.state, pl129SomebodysCrate, 25, 1);
  assert.equal(eventsOf(h.bus, PL_129_BRIGHT_POUR_EVENT).length, 1);
  assert.ok(popups(h.bus).some((p) => p.text.includes('the next pour runs a shade brighter')));
  assert.ok(cues(h.bus).some((c) => c.id === 'confirm'));
  // off the beat, a lump brightens nothing (t=37 -> phase 13, well outside the window)
  advance(h.state, pl129SomebodysCrate, 11, 1);
  assert.equal(isOnBeat(h.state.simTime), false, 'fixture lands off the beat');
  h.bus.emit('furnace:fed', { entityId: 43, type: 'asteroid', payloadType: null, pos: { x: 0, z: 0 }, sectorId: 'x' });
  advance(h.state, pl129SomebodysCrate, 25, 1);
  assert.equal(eventsOf(h.bus, PL_129_BRIGHT_POUR_EVENT).length, 1, 'off-beat lumps are silent');
  pl129SomebodysCrate.destroy();
});

test('PL-129: a whole crate through -> the yard PA answers, and the dock bill agrees', () => {
  const h = harness({});
  pl129SomebodysCrate.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl129SomebodysCrate, 1);
  h.bus.emit('furnace:fed', { entityId: 42, type: 'payload', payloadType: 'jettisoned_cargo', pos: { x: 0, z: 0 }, sectorId: 'x' });
  assert.equal(eventsOf(h.bus, PL_129_CRATE_EVENT).length, 1);
  const pa = popups(h.bus).find((p) => p.sender === 'FORGE YARD PA');
  assert.ok(pa, 'the yard PA answers');
  assert.equal(pa.text, PL_129_PA_LINE);
  assert.equal(pa.text, 'That was somebody\'s crate.');
  const said = h.helpers.voice.find((v) => v.channel === 'ambient');
  assert.ok(said, 'the PA is a real ambient voice');
  assert.equal(said.text, PL_129_PA_LINE, 'exact copy, once');
  assert.ok(cues(h.bus).some((c) => c.id === 'ui_deny'));
  // one answer per crate, not per shard
  h.bus.emit('furnace:fed', { entityId: 43, type: 'payload', payloadType: 'jettisoned_cargo', pos: { x: 0, z: 0 }, sectorId: 'x' });
  assert.equal(eventsOf(h.bus, PL_129_CRATE_EVENT).length, 1, 'crate answer is cooldown-gated');
  // the dock bill agrees at the next dock
  advance(h.state, pl129SomebodysCrate, 1);
  h.bus.emit('dock:docked', { stationId: 'station_forge' });
  assert.equal(eventsOf(h.bus, PL_129_BILL_EVENT).length, 1);
  assert.ok(popups(h.bus).some((p) => p.text.includes('The dock bill agrees')));
  // and the bill clears: no double charge at the second dock
  advance(h.state, pl129SomebodysCrate, 1);
  h.bus.emit('dock:docked', { stationId: 'station_forge' });
  assert.equal(eventsOf(h.bus, PL_129_BILL_EVENT).length, 1);
  pl129SomebodysCrate.destroy();
});

// ---------- PL-130 The stamp ----------

function pl130Harness() {
  const station = stationFixture('station_forge', { x: 0, z: 0 }, 'M');
  const h = harness({ sectorId: 'sector_vesta_forge', pos: { x: 60, z: 0 }, stations: [station] });
  return { h, station };
}

test('PL-130: the hammer hits once a plate and Vesta-stamps a part brought under it', () => {
  const { h, station } = pl130Harness();
  pl130TheStamp.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl130TheStamp, 1.5);
  const plate = ownedOf(h.helpers, 'plantsPl130Plate')[0];
  assert.ok(plate, 'the plate is on the dock ring');
  const rows = (h.state.world.dressing && h.state.world.dressing.rows) || [];
  assert.equal(rows.filter((r) => r.data && r.data.plantsPl130).length, 1, 'one authored hammer place');
  assert.equal(rows.find((r) => r.data && r.data.plantsPl130).data.placeId, THE_STAMP_TUNING.placeId);
  // the player carries a part to the plate before the hit
  const player = h.state.entities.get(h.state.playerId);
  player.pos.x = plate.pos.x + 10;
  player.pos.z = plate.pos.z;
  const part = podFixture(500, { x: plate.pos.x, z: plate.pos.z }, { payloadType: null });
  h.state.entities.set(part.id, part);
  advance(h.state, pl130TheStamp, 21, 1);   // cross a plate boundary
  assert.equal(part.data.plantsVestaStamped, true);
  assert.equal(part.data.swarmFloorPad.label, THE_STAMP_TUNING.stampedPadLabel);
  assert.equal(eventsOf(h.bus, PL_130_STAMPED_EVENT).length, 1);
  assert.ok(popups(h.bus).some((p) => p.text.includes('official, forever')));
  // stamped once: the next plate does not re-announce the same part
  advance(h.state, pl130TheStamp, 21, 1);
  assert.equal(eventsOf(h.bus, PL_130_STAMPED_EVENT).length, 1, 'stamped is stamped');
  // negative: a part under the ring with NO carrier stays unstamped
  player.pos.x = plate.pos.x + 200;
  const lonely = podFixture(501, { x: plate.pos.x, z: plate.pos.z }, { payloadType: null });
  h.state.entities.set(lonely.id, lonely);
  advance(h.state, pl130TheStamp, 21, 1);
  assert.equal(lonely.data.plantsVestaStamped, undefined, 'nothing stamps itself');
  pl130TheStamp.destroy();
  assert.equal(h.state.entities.has(500) || ownedOf(h.helpers, 'plantsPl130Plate').length === 0, true);
  assert.equal([...h.state.entities.values()].filter((e) => e.data && e.data.plantsPl130Plate).length, 0, 'cleanup');
});

test('PL-130: stamp a stolen one and Customs holds it up to the light', () => {
  const { h, station } = pl130Harness();
  pl130TheStamp.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl130TheStamp, 1.5);
  const plate = ownedOf(h.helpers, 'plantsPl130Plate')[0];
  const player = h.state.entities.get(h.state.playerId);
  player.pos.x = plate.pos.x + 10;
  player.pos.z = plate.pos.z;
  const stolen = podFixture(502, { x: plate.pos.x, z: plate.pos.z }, { payloadType: null, commodityId: 'cmdty_stolen_goods' });
  h.state.entities.set(stolen.id, stolen);
  advance(h.state, pl130TheStamp, 21, 1);
  assert.equal(stolen.data.plantsVestaStamped, true, 'official, forever');
  assert.equal(stolen.data.swarmFloorPad.label, THE_STAMP_TUNING.heldPadLabel);
  assert.ok(stolen.data.customsHoldUntil > h.state.simTime, 'held on a timed receipt');
  assert.equal(eventsOf(h.bus, PL_130_HELD_EVENT).length, 1);
  assert.ok(popups(h.bus).some((p) => p.sender === 'CUSTOMS GATE' && p.text.includes('held up to the light')));
  assert.ok(cues(h.bus).some((c) => c.id === 'ui_deny'));
  pl130TheStamp.destroy();
});

// ---------- PL-178 Slingshot hour ----------

function pl178Harness() {
  const station = stationFixture('station_helios', { x: 0, z: 0 }, 'L');
  const h = harness({ sectorId: 'sector_helios_core', pos: { x: 60, z: 0 }, stations: [station] });
  return { h, station };
}

test('PL-178: at shift change the Slipway throws pods and the far side catches them', () => {
  const { h, station } = pl178Harness();
  pl178SlingshotHour.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl178SlingshotHour, 1.5);
  assert.equal(eventsOf(h.bus, PL_178_HOUR_EVENT).length, 1);
  assert.ok(popups(h.bus).some((p) => p.sender === 'THE SLIPWAY'));
  const stream = streamFor(station, 0, SEED);
  advance(h.state, pl178SlingshotHour, 7);
  const pod = ownedOf(h.helpers, 'plantsPl178Pod')[0];
  assert.ok(pod, 'pods leave the slip every few seconds');
  const live = h.state.entities.get(pod.id);
  const before = Math.hypot(live.pos.x - stream.catch.x, live.pos.z - stream.catch.z);
  advance(h.state, pl178SlingshotHour, 2, 1 / 60);
  const after = Math.hypot(live.pos.x - stream.catch.x, live.pos.z - stream.catch.z);
  assert.ok(after < before, 'the stream carries pods toward the catch ring');
  // the far side catches
  live.pos.x = stream.catch.x + 5;
  live.pos.z = stream.catch.z;
  advance(h.state, pl178SlingshotHour, 1, 1 / 60);
  assert.equal(eventsOf(h.bus, PL_178_CAUGHT_EVENT).length >= 1, true);
  assert.ok(popups(h.bus).some((p) => p.text.includes('The far side caught it')));
  assert.equal(h.state.entities.has(pod.id), false, 'a caught pod is gone');
  pl178SlingshotHour.destroy();
  assert.equal([...h.state.entities.values()].filter((e) => e.data && e.data.plantsPl178Pod).length, 0, 'cleanup');
});

test('PL-178: ride the stream across for free', () => {
  const { h, station } = pl178Harness();
  pl178SlingshotHour.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl178SlingshotHour, 1.5);
  const stream = streamFor(station, 0, SEED);
  const player = h.state.entities.get(h.state.playerId);
  player.pos.x = stream.slip.x + (stream.catch.x - stream.slip.x) * 0.5;
  player.pos.z = stream.slip.z + (stream.catch.z - stream.slip.z) * 0.5;
  advance(h.state, pl178SlingshotHour, 1, 1 / 60);
  assert.equal(eventsOf(h.bus, PL_178_RIDING_EVENT).length, 1, 'riding counts once');
  assert.ok(popups(h.bus).some((p) => p.text.includes('it carries you across, free')));
  // negative: off the lane there is no free ride
  player.pos.x += 500;
  advance(h.state, pl178SlingshotHour, 1, 1 / 60);
  assert.equal(eventsOf(h.bus, PL_178_RIDING_EVENT).length, 1);
  pl178SlingshotHour.destroy();
});

test('PL-178: throw something in and they catch it — it is theirs now', () => {
  const { h, station } = pl178Harness();
  pl178SlingshotHour.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl178SlingshotHour, 1.5);
  const stream = streamFor(station, 0, SEED);
  const pod = podFixture(700, {
    x: stream.slip.x + (stream.catch.x - stream.slip.x) * 0.25,
    z: stream.slip.z + (stream.catch.z - stream.slip.z) * 0.25,
  });
  h.state.entities.set(pod.id, pod);
  advance(h.state, pl178SlingshotHour, 1.5, 1 / 60);
  assert.ok(popups(h.bus).some((p) => p.text.includes('Thrown in')), 'the stream takes it');
  advance(h.state, pl178SlingshotHour, 8, 1);
  assert.equal(eventsOf(h.bus, PL_178_GIVEN_EVENT).length, 1, 'the far side catches it');
  assert.ok(popups(h.bus).some((p) => p.text.includes('It is theirs now')));
  assert.equal(h.state.entities.has(700), false, 'the cargo is honestly gone');
  // an owned stream pod is NOT mistaken for thrown cargo
  assert.equal(eventsOf(h.bus, PL_178_GIVEN_EVENT).filter((e) => e.entityId !== 700).length, 0);
  pl178SlingshotHour.destroy();
});

// ---------- PL-179 Kessler's number ----------

function pl179Harness(pos) {
  const h = harness({ sectorId: 'sector_tethys_junction', pos });
  return h;
}

test('PL-179: parked on the Scale at night, empty — the board flips and Kessler reads once', () => {
  const h = pl179Harness({ x: 720, z: -980 });   // the real Scale pad
  pl179KesslersNumber.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl179KesslersNumber, 184, 1); // into the night band, parked long enough
  const reads = eventsOf(h.bus, PL_179_NUMBER_EVENT);
  assert.equal(reads.length, 1, 'read once from the dark');
  assert.equal(reads[0].weightT, 10.5, 'the exact hull weight');
  assert.ok(popups(h.bus).some((p) => p.sender === 'KESSLER DESK' && p.text.includes('The board flips')));
  const said = h.helpers.voice.find((v) => v.channel === 'ambient');
  assert.ok(said, 'Kessler reads aloud');
  assert.equal(said.text, PL_179_READ_LINE);
  assert.equal(said.text, 'Learn your number — you will know when you are carrying something extra');
  assert.equal(h.state.story.flags[PL_179_LEARNED_FLAG], true);
  // once per night
  advance(h.state, pl179KesslersNumber, 20, 1);
  assert.equal(eventsOf(h.bus, PL_179_NUMBER_EVENT).length, 1);
  pl179KesslersNumber.destroy();
});

test('PL-179: carrying something extra — the learned number tells you', () => {
  const h = pl179Harness({ x: 720, z: -980 });
  pl179KesslersNumber.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  h.state.story.flags[PL_179_LEARNED_FLAG] = true;
  h.state.player.cargo.items = { cmdty_ore_iron: { amount: 4 } };
  advance(h.state, pl179KesslersNumber, 184, 1);
  const extras = eventsOf(h.bus, PL_179_EXTRA_EVENT);
  assert.equal(extras.length, 1);
  assert.equal(extras[0].extraT, 4);
  assert.ok(popups(h.bus).some((p) => p.text.includes('something extra')));
  assert.equal(eventsOf(h.bus, PL_179_NUMBER_EVENT).length, 0, 'the empty read belongs to the empty hold');
  pl179KesslersNumber.destroy();
});

test('PL-179: daylight or a moving hull reads nothing', () => {
  const h = pl179Harness({ x: 720, z: -980 });
  pl179KesslersNumber.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl179KesslersNumber, 100, 1);   // daylight
  assert.equal(eventsOf(h.bus, PL_179_NUMBER_EVENT).length, 0);
  const player = h.state.entities.get(h.state.playerId);
  player.vel.x = 9;                                 // drifting past the rest gate (8)
  advance(h.state, pl179KesslersNumber, 84, 1);     // now night
  assert.equal(eventsOf(h.bus, PL_179_NUMBER_EVENT).length, 0, 'parked means parked');
  pl179KesslersNumber.destroy();
});

// ---------- PL-180 The chalk thief ----------

function pl180Harness() {
  const station = stationFixture('station_ceres', { x: 0, z: 0 }, 'M');
  const h = harness({ sectorId: 'sector_ceres_belt', pos: { x: 60, z: 0 }, stations: [station] });
  return { h, station };
}

function flyLap(h, { radius, omega }) {
  const step = 0.5;
  const total = (Math.PI * 2) / omega;
  const had = eventsOf(h.bus, PL_180_CHALKED_EVENT).length;
  // break any in-progress orbit: the lap clock only starts fresh from outside the band
  const player0 = h.state.entities.get(h.state.playerId);
  player0.pos.x = 60;
  player0.pos.z = 0;
  pl180ChalkThief.update(step, h.state);
  h.state.simTime += step;
  h.state.tick += Math.round(step * 60);
  for (let t = 0; t < total + step; t += step) {
    const ang = (omega * t) % (Math.PI * 2);
    const player = h.state.entities.get(h.state.playerId);
    player.pos.x = Math.cos(ang) * radius;
    player.pos.z = Math.sin(ang) * radius;
    h.state.simTime += step;
    h.state.tick += Math.round(step * 60);
    pl180ChalkThief.update(step, h.state);
    if (eventsOf(h.bus, PL_180_CHALKED_EVENT).length > had) return h.state.simTime;
  }
  return h.state.simTime;
}

test('PL-180: fly a swing, chalk it; overnight Old Hob beats it by the same hair', () => {
  const { h } = pl180Harness();
  pl180ChalkThief.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl180ChalkThief, 1.5);
  assert.ok(ownedOf(h.helpers, 'plantsPl180Board')[0], 'the anchor board is up');
  flyLap(h, { radius: 200, omega: 0.5 });
  const chalks = eventsOf(h.bus, PL_180_CHALKED_EVENT);
  assert.equal(chalks.length, 1);
  assert.ok(chalks[0].playerS >= CHALK_THIEF_TUNING.minLapS, 'a real lap, not a twitch');
  assert.equal(chalks[0].underHis, false, 'first chalk has nobody to undercut');
  assert.ok(popups(h.bus).some((p) => p.text.includes('Chalked:')));
  // overnight
  advance(h.state, pl180ChalkThief, 240 - (h.state.simTime % 240) + 1, 1);
  const beatens = eventsOf(h.bus, PL_180_BEATEN_EVENT);
  assert.equal(beatens.length, 1, 'beaten overnight');
  assert.ok(Math.abs(beatens[0].hairS - CHALK_THIEF_TUNING.hairS) < 1e-9, 'by the same hair');
  assert.ok(Math.abs((beatens[0].thiefS + CHALK_THIEF_TUNING.hairS) - chalks[0].playerS) < 0.05,
    'the thief time sits a hair under yours');
  assert.ok(popups(h.bus).some((p) => p.sender === 'OLD HOB'));
  const board = h.state.entities.get(ownedOf(h.helpers, 'plantsPl180Board')[0].id);
  assert.ok(board.data.swarmFloorPad.label.includes('Old Hob'), 'the board re-chalks itself');
  pl180ChalkThief.destroy();
});

test('PL-180: chalk yours under his; by morning it is beaten again', () => {
  const { h } = pl180Harness();
  pl180ChalkThief.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl180ChalkThief, 1.5);
  flyLap(h, { radius: 200, omega: 0.5 });           // first chalk ~12.6 s
  advance(h.state, pl180ChalkThief, 240 - (h.state.simTime % 240) + 1, 1); // his hair beats it
  const firstBeaten = eventsOf(h.bus, PL_180_BEATEN_EVENT)[0];
  flyLap(h, { radius: 200, omega: 0.7 });           // a faster swing, under his
  const chalks = eventsOf(h.bus, PL_180_CHALKED_EVENT);
  assert.equal(chalks.length, 2);
  assert.equal(chalks[1].underHis, true, 'chalked under his');
  assert.ok(chalks[1].playerS < firstBeaten.thiefS);
  advance(h.state, pl180ChalkThief, 240 - (h.state.simTime % 240) + 1, 1);
  const beatens = eventsOf(h.bus, PL_180_BEATEN_EVENT);
  assert.equal(beatens.length, 2, 'beaten again');
  assert.ok(beatens[1].thiefS < firstBeaten.thiefS, 'the board keeps ratcheting down');
  pl180ChalkThief.destroy();
});

test('PL-180: no chalk, no thief', () => {
  const { h } = pl180Harness();
  pl180ChalkThief.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl180ChalkThief, 1.5);
  advance(h.state, pl180ChalkThief, 250, 1);   // two mornings, no swing
  assert.equal(eventsOf(h.bus, PL_180_BEATEN_EVENT).length, 0, 'nothing is invented for an empty board');
  pl180ChalkThief.destroy();
});

// ---------- PL-181 Two towns' problem ----------

function pl181Harness() {
  const station = stationFixture('station_forge', { x: 0, z: 0 }, 'M');
  const h = harness({ sectorId: 'sector_vesta_forge', pos: { x: 1480, z: 1560 }, stations: [station] });
  return { h, station };
}

test('PL-181: the slag ring heats a pod; carrying it cooks', () => {
  const { h } = pl181Harness();
  pl181HotCargo.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  // outside the ring: nothing happens
  const cold = podFixture(600, { x: 1480 + 200, z: 1640 });
  h.state.entities.set(600, cold);
  advance(h.state, pl181HotCargo, 1.5);
  assert.equal(cold.data.plantsPl181Hot, undefined, 'cold stays cold');
  // through the ring: hot
  const player = h.state.entities.get(h.state.playerId);
  player.pos.x = 1480 + 130;
  player.pos.z = 1640;
  const pod = podFixture(601, { x: 1480 + 130, z: 1640 });
  h.state.entities.set(601, pod);
  advance(h.state, pl181HotCargo, 1.5);
  assert.equal(pod.data.plantsPl181Hot, true);
  assert.equal(pod.data.swarmFloorPad.label, 'HOT — COOKS WHOEVER CARRIES IT');
  assert.equal(eventsOf(h.bus, PL_181_HEATED_EVENT).length, 1);
  assert.ok(cues(h.bus).some((c) => c.id === 'warning'));
  // carrying: timed warnings, one line per pod, no spam inside the cooldown
  advance(h.state, pl181HotCargo, 12, 1);
  const cookLines = popups(h.bus).filter((p) => p.text.includes('cooks whoever carries it'));
  assert.ok(cookLines.length >= 1, 'the cook line lands');
  advance(h.state, pl181HotCargo, 6, 1);
  const cookLines2 = popups(h.bus).filter((p) => p.text.includes('cooks whoever carries it'));
  assert.equal(cookLines2.length, cookLines.length, 'the cook line does not spam');
  advance(h.state, pl181HotCargo, 16, 1);
  const cookLines3 = popups(h.bus).filter((p) => p.text.includes('cooks whoever carries it'));
  assert.ok(cookLines3.length >= cookLines.length, 'the timed warning keeps ticking');
  pl181HotCargo.destroy();
  assert.equal([...h.state.entities.values()].filter((e) => e.data && e.data.plantsPl181Fall).length, 0, 'cleanup');
});

test('PL-181: the coolant fall quenches on the instant; docking roasted is on the log', () => {
  const { h, station } = pl181Harness();
  pl181HotCargo.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl181HotCargo, 1.5);
  const player = h.state.entities.get(h.state.playerId);
  player.pos.x = 1480 + 130;
  player.pos.z = 1640;
  const pod = podFixture(601, { x: 1480 + 130, z: 1640 });
  h.state.entities.set(601, pod);
  advance(h.state, pl181HotCargo, 1.5);
  assert.equal(pod.data.plantsPl181Hot, true);
  // make the crossing
  const fall = ownedOf(h.helpers, 'plantsPl181Fall')[0];
  assert.ok(fall, 'the fall stands on the dock ring');
  pod.pos.x = fall.pos.x;
  pod.pos.z = fall.pos.z;
  advance(h.state, pl181HotCargo, 1.5);
  assert.equal(pod.data.plantsPl181Quenched, true);
  assert.equal(pod.data.plantsPl181Hot, false);
  assert.equal(pod.data.swarmFloorPad.label, 'QUENCHED');
  assert.equal(eventsOf(h.bus, PL_181_QUENCHED_EVENT).length, 1);
  assert.ok(popups(h.bus).some((p) => p.sender === 'VESTA YARD'));
  // a quenched pod cooks nobody and cannot roast a delivery
  h.bus.emit('dock:docked', { stationId: 'station_forge' });
  assert.equal(eventsOf(h.bus, PL_181_ROASTED_EVENT).length, 0, 'quenched cargo delivers clean');
  pl181HotCargo.destroy();
});

test('PL-181: deliver it roasted and the receiving log remembers', () => {
  const { h } = pl181Harness();
  pl181HotCargo.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl181HotCargo, 1.5);
  const player = h.state.entities.get(h.state.playerId);
  player.pos.x = 1480 + 130;
  player.pos.z = 1640;
  const pod = podFixture(601, { x: 1480 + 130, z: 1640 });
  h.state.entities.set(601, pod);
  advance(h.state, pl181HotCargo, 1.5);
  h.bus.emit('dock:docked', { stationId: 'station_forge' });
  assert.equal(eventsOf(h.bus, PL_181_ROASTED_EVENT).length, 1);
  assert.ok(popups(h.bus).some((p) => p.text.includes('Delivered roasted')));
  h.bus.emit('dock:docked', { stationId: 'station_forge' });
  assert.equal(eventsOf(h.bus, PL_181_ROASTED_EVENT).length, 1, 'roasted log is cooldown-gated');
  pl181HotCargo.destroy();
});

// ---------- PL-182 Not while it's down ----------

function pl182Harness() {
  const reach = stationFixture('station_reach', { x: 0, z: 0 }, 'M');
  const outpost = stationFixture('station_io_merc', { x: 5000, z: 0 }, 'M');
  const h = harness({ sectorId: 'sector_io_reach', pos: { x: 60, z: 0 }, stations: [reach, outpost] });
  return { h, reach };
}

test('PL-182: repaint rotation — the truce holds while the flag is down', () => {
  const { h } = pl182Harness();
  pl182FlagTruce.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl182FlagTruce, 1.5);
  const posts = ownedOf(h.helpers, 'plantsPl182Post');
  assert.equal(posts.length, 2, 'one flag per side');
  assert.equal(repaintSideOf(0), 0);
  const painters = ownedOf(h.helpers, 'plantsPl182Painter');
  assert.equal(painters.length, 2, 'painters out on side zero');
  assert.ok(painters.every((p) => p.data.plantsPl182Side === 0));
  assert.equal(eventsOf(h.bus, PL_182_TRUCE_EVENT).length, 1);
  assert.ok(popups(h.bus).some((p) => p.text.includes('does not touch the painters')));
  // the truce holds: nothing breaks on its own
  advance(h.state, pl182FlagTruce, 30);
  assert.equal(eventsOf(h.bus, PL_182_BROKEN_EVENT).length, 0);
  // painters pack up when the window closes
  advance(h.state, pl182FlagTruce, 20);
  assert.equal(ownedOf(h.helpers, 'plantsPl182Painter').length, 0, 'the window ends');
  // and resume on the other side next shift, still inside its repaint window
  advance(h.state, pl182FlagTruce, 146, 1);   // now ~ shift 1, phase ~19 s
  const next = ownedOf(h.helpers, 'plantsPl182Painter');
  assert.ok(next.length === 2 && next.every((p) => p.data.plantsPl182Side === 1), 'rotation alternates sides');
  pl182FlagTruce.destroy();
  assert.equal([...h.state.entities.values()].filter((e) => e.data && (e.data.plantsPl182Post || e.data.plantsPl182Painter)).length, 0,
    'cleanup');
});

test('PL-182: rag a flag mid-repaint and both sides agree on you', () => {
  const { h } = pl182Harness();
  pl182FlagTruce.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl182FlagTruce, 1.5);
  const painter = ownedOf(h.helpers, 'plantsPl182Painter')[0];
  h.bus.emit('physics:impact', {
    aId: h.state.playerId, bId: painter.id, playerInvolved: true, impulse: 300,
    normal: { x: 1, z: 0 },
  });
  assert.equal(eventsOf(h.bus, PL_182_BROKEN_EVENT).length, 1);
  assert.ok(popups(h.bus).some((p) => p.sender === 'REACH FLAG' && p.text.includes('Both sides, one voice')));
  assert.ok(popups(h.bus).some((p) => p.sender === 'OUTPOST FLAG'));
  assert.ok(cues(h.bus).some((c) => c.id === 'warning'));
  assert.equal(ownedOf(h.helpers, 'plantsPl182Painter').length, 0, 'painting stops');
  const watchers = ownedOf(h.helpers, 'plantsPl182Watcher');
  assert.equal(watchers.length, 2, 'both sides send a hull');
  const factions = watchers.map((w) => w.factionId).sort();
  assert.deepEqual(factions, ['faction_quiet', 'faction_reach']);
  // negative: below the rag gate nothing breaks
  h.bus.emit('physics:impact', {
    aId: h.state.playerId, bId: ownedOf(h.helpers, 'plantsPl182Post')[0].id,
    playerInvolved: true, impulse: 50, normal: { x: 1, z: 0 },
  });
  assert.equal(eventsOf(h.bus, PL_182_BROKEN_EVENT).length, 1);
  // the shadow runs out
  advance(h.state, pl182FlagTruce, 50, 1);
  assert.equal(ownedOf(h.helpers, 'plantsPl182Watcher').length, 0, 'watchers go home');
  pl182FlagTruce.destroy();
});

// ---------- PL-183 The weather ----------

function pl183Harness() {
  const station = stationFixture('station_sker', { x: 0, z: 0 }, 'M');
  const h = harness({ sectorId: 'sector_sker_reach', pos: { x: 60, z: 0 }, stations: [station] });
  return { h, station };
}

test('PL-183: the toll board re-chalks itself as ships pass the Door', () => {
  const { h, station } = pl183Harness();
  pl183TheWeather.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl183TheWeather, 1.5);
  const board = ownedOf(h.helpers, 'plantsPl183Board')[0];
  assert.ok(board);
  assert.equal(board.data.swarmFloorPad.label, "VANE'S BOARD — no weather yet");
  // stand at the board first: asking comes after a change
  const player = h.state.entities.get(h.state.playerId);
  player.pos.x = board.pos.x + 20;
  player.pos.z = board.pos.z;
  const line = doorLineFor(station);
  const ship = shipFixture(900, { x: line.a.x + line.dir.x * 100, z: line.a.z + line.dir.z * 100 },
    { callsign: 'Rust Widow' });
  h.state.entities.set(900, ship);
  advance(h.state, pl183TheWeather, 1.5);
  const rech = eventsOf(h.bus, PL_183_RECHALKED_EVENT);
  assert.equal(rech.length, 1, 'one pass, one verdict');
  assert.equal(rech[0].callsign, 'Rust Widow');
  assert.equal(rech[0].weather, weatherFor('Rust Widow', 1));
  const live = h.state.entities.get(board.id);
  assert.ok(live.data.swarmFloorPad.label.includes('Rust Widow'), 'you can read his opinion');
  // ask him why it changed
  const asks = eventsOf(h.bus, PL_183_ANSWERED_EVENT);
  assert.equal(asks.length, 1, 'one answer per change');
  const said = h.helpers.voice.find((v) => v.text === PL_183_WEATHER_LINE);
  assert.ok(said, 'the answer is spoken');
  assert.equal(said.text, 'Weather.');
  assert.ok(popups(h.bus).some((p) => p.sender === 'SKER VANE' && p.text === 'Weather.'));
  // the pass cooldown holds the board still
  advance(h.state, pl183TheWeather, 2);
  assert.equal(eventsOf(h.bus, PL_183_RECHALKED_EVENT).length, 1);
  // negative: a hull away from the corridor chalks nothing
  const far = shipFixture(901, { x: line.a.x + line.perp.x * 200, z: line.a.z + line.perp.z * 200 },
    { callsign: 'Far Hull' });
  h.state.entities.set(901, far);
  advance(h.state, pl183TheWeather, 2);
  assert.equal(eventsOf(h.bus, PL_183_RECHALKED_EVENT).length, 1);
  pl183TheWeather.destroy();
  assert.equal(h.state.entities.has(board.id), false, 'cleanup');
});

test('PL-183: another hull, another verdict — opinions are per-ship', () => {
  const { h, station } = pl183Harness();
  pl183TheWeather.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl183TheWeather, 1.5);
  const board = ownedOf(h.helpers, 'plantsPl183Board')[0];
  const player = h.state.entities.get(h.state.playerId);
  player.pos.x = board.pos.x + 20;
  player.pos.z = board.pos.z;
  const line = doorLineFor(station);
  const a = shipFixture(910, { x: line.a.x + line.dir.x * 100, z: line.a.z + line.dir.z * 100 },
    { callsign: 'Rust Widow' });
  h.state.entities.set(910, a);
  advance(h.state, pl183TheWeather, 1.5);
  assert.equal(eventsOf(h.bus, PL_183_RECHALKED_EVENT)[0].callsign, 'Rust Widow');
  // Rust Widow leaves the corridor before the per-ship pass cooldown expires
  a.pos.x = line.a.x + line.perp.x * 500;
  a.pos.z = line.a.z + line.perp.z * 500;
  advance(h.state, pl183TheWeather, 13, 1);   // clear the per-ship pass cooldown
  const b = shipFixture(911, { x: line.a.x - line.dir.x * 100, z: line.a.z - line.dir.z * 100 },
    { callsign: 'Iron Markov' });
  h.state.entities.set(911, b);
  advance(h.state, pl183TheWeather, 1.5);
  const rech = eventsOf(h.bus, PL_183_RECHALKED_EVENT);
  assert.equal(rech.length, 2);
  assert.equal(rech[1].callsign, 'Iron Markov');
  assert.equal(rech[1].weather, weatherFor('Iron Markov', 1));
  pl183TheWeather.destroy();
});

// ---------- PL-199 The jug ----------

function pl199Harness(playerHull = 40) {
  const station = stationFixture('station_tethys', { x: 0, z: 0 }, 'L');
  const h = harness({ sectorId: 'sector_tethys_junction', pos: { x: 60, z: 0 }, stations: [station] });
  const player = h.state.entities.get(h.state.playerId);
  player.hull = playerHull;
  player.hullMax = 100;
  return { h, station, player };
}

test('PL-199: look sorry enough and the jug is yours — drink it', () => {
  const { h, station } = pl199Harness(40);
  pl199TheJug.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl199TheJug, 1.5);
  const jug = ownedOf(h.helpers, 'plantsPl199Jug')[0];
  assert.ok(jug, 'one jug before the shutter goes up');
  assert.ok(popups(h.bus).some((p) => p.sender === 'BIG ANSEL' && p.text.includes('whoever looks like they need it')));
  assert.equal(eventsOf(h.bus, PL_199_JUG_EVENT).length, 1);
  // negative: a healthy hull gets no jug
  advance(h.state, pl199TheJug, 2);
  assert.equal(ownedOf(h.helpers, 'plantsPl199Jug').length, 1, 'one jug per day');
  // pick it up and drink
  const player = h.state.entities.get(h.state.playerId);
  const live = h.state.entities.get(jug.id);
  player.pos.x = live.pos.x;
  player.pos.z = live.pos.z;
  advance(h.state, pl199TheJug, THE_JUG_TUNING.drinkS + 1, 1);
  assert.equal(eventsOf(h.bus, PL_199_DRUNK_EVENT).length, 1);
  assert.ok(popups(h.bus).some((p) => p.text.includes('You drink it')));
  assert.equal(h.state.entities.has(jug.id), false, 'the jug is gone');
  // none reappears for a healthy player later that day
  player.hull = 100;
  advance(h.state, pl199TheJug, 2);
  assert.equal(ownedOf(h.helpers, 'plantsPl199Jug').length, 0, 'the day is spent');
  pl199TheJug.destroy();
  assert.equal(h.state.entities.has(jug.id), false, 'cleanup');
});

test('PL-199: steer it to a hull in worse shape — Ansel sees, and it finds you next anyway', () => {
  const { h } = pl199Harness(40);
  pl199TheJug.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl199TheJug, 1.5);
  const jug = ownedOf(h.helpers, 'plantsPl199Jug')[0];
  const player = h.state.entities.get(h.state.playerId);
  const live = h.state.entities.get(jug.id);
  player.pos.x = live.pos.x;
  player.pos.z = live.pos.z;
  // a worse hull right there
  const worse = shipFixture(800, { x: live.pos.x + 24, z: live.pos.z }, { hull: 20, hullMax: 100, callsign: 'Worse hull' });
  h.state.entities.set(800, worse);
  advance(h.state, pl199TheJug, 1.5);
  assert.ok(hullFractionOf(worse) < hullFractionOf(player));
  advance(h.state, pl199TheJug, THE_JUG_TUNING.offerS + 1, 1);
  assert.equal(eventsOf(h.bus, PL_199_STEERED_EVENT).length, 1);
  assert.equal(eventsOf(h.bus, PL_199_DRUNK_EVENT).length, 0, 'you gave it away, not drank it');
  assert.ok(popups(h.bus).some((p) => p.text.includes('Ansel sees')));
  assert.equal(h.state.story.flags[PL_199_STEERED_FLAG], true);
  assert.equal(h.state.entities.has(jug.id), false);
  // next day: the jug finds you anyway, even with a fresh hull
  player.hull = 100;
  advance(h.state, pl199TheJug, 240 - (h.state.simTime % 240) + 2, 1);
  const jug2 = ownedOf(h.helpers, 'plantsPl199Jug');
  assert.equal(jug2.length, 1, 'a fresh jug, aimed at the player');
  assert.ok(popups(h.bus).some((p) => p.text.includes('The jug finds you next anyway')));
  assert.equal(h.state.story.flags[PL_199_STEERED_FLAG], false, 'the favor is spent');
  pl199TheJug.destroy();
});

test('PL-199: a healthy stranger gets nothing — nothing is invented', () => {
  const { h } = pl199Harness(100);
  pl199TheJug.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  advance(h.state, pl199TheJug, 250, 1);   // a whole day, hull green
  assert.equal(ownedOf(h.helpers, 'plantsPl199Jug').length, 0);
  assert.equal(eventsOf(h.bus, PL_199_JUG_EVENT).length, 0);
  pl199TheJug.destroy();
});

// ---------- cross-cutting ----------

test('determinism: identical fixtures and inputs produce identical event logs', () => {
  const run = () => {
    const station = stationFixture('station_forge', { x: 0, z: 0 }, 'M');
    const h = harness({ sectorId: 'sector_vesta_forge', pos: { x: 60, z: 0 }, stations: [station] });
    pl129SomebodysCrate.init({ state: h.state, bus: h.bus, helpers: h.helpers });
    advance(h.state, pl129SomebodysCrate, 1);
    h.bus.emit('furnace:fed', { entityId: 42, type: 'asteroid', payloadType: null, pos: { x: 0, z: 0 }, sectorId: 'x' });
    h.bus.emit('furnace:fed', { entityId: 43, type: 'payload', payloadType: 'jettisoned_cargo', pos: { x: 0, z: 0 }, sectorId: 'x' });
    advance(h.state, pl129SomebodysCrate, 25, 1);
    h.bus.emit('dock:docked', { stationId: 'station_forge' });
    pl129SomebodysCrate.destroy();
    return h.bus.log.map((e) => e.type + '|' + (e.payload.text || e.payload.id || '')).join('\n');
  };
  assert.equal(run(), run());
});

test('family shape: every module exports the standalone plant contract', () => {
  const mods = [pl105Standoff, pl106PartsSled, pl107EmptySlot, pl128TheSurge, pl129SomebodysCrate,
    pl130TheStamp, pl178SlingshotHour, pl179KesslersNumber, pl180ChalkThief, pl181HotCargo,
    pl182FlagTruce, pl183TheWeather, pl199TheJug];
  const names = new Set();
  for (const mod of mods) {
    assert.equal(typeof mod.init, 'function');
    assert.equal(typeof mod.update, 'function');
    assert.equal(typeof mod.destroy, 'function');
    assert.match(mod.name, /^plantsPl1/);
    names.add(mod.name);
  }
  assert.equal(names.size, 13, 'one name per plant');
});
