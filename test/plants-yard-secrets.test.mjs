// test/plants-yard-secrets.test.mjs — headless checks for the 19 yard + secrets plant modules
// (PL-104/124/125/126/146/147/148/149/150/151/152/153/155/175/195/196/248/252/253).
//
// Every module is a standalone `plantsPl<id>` object with init(ctx)/update(dt,state)/destroy().
// The harness is a recording bus + a spec-spreading spawnEntity, no DOM, no Three.js, no wall
// clock: state.simTime is driven by hand. Tuning day = 240 s, night band = last 60 s (>= 180).
import test from 'node:test';
import assert from 'node:assert/strict';

import { pl146FirstCaller, PL_146_CALL_EVENT, PL_146_SNUFFED_EVENT, FIRST_CALLER_TUNING, PL_146_EVER_SNUFFED_FLAG } from '../src/systems/plants/pl146FirstCaller.js';
import { pl147FirstPart, PL_147_PART_EVENT, PL_147_SCRAPPED_EVENT, theOneSize } from '../src/systems/plants/pl147FirstPart.js';
import { pl148TheCount, PL_148_COUNT_EVENT, PL_148_LINED_EVENT } from '../src/systems/plants/pl148TheCount.js';
import { pl149SeedlingLean, PL_149_FOLLOW_EVENT, darkBearingOf } from '../src/systems/plants/pl149SeedlingLean.js';
import { pl150ItsSpot, PL_150_HOME_EVENT, ITS_SPOT_TUNING } from '../src/systems/plants/pl150ItsSpot.js';
import { pl151NoPapers, PL_151_HAIL_EVENT, PL_151_DARK_SALE_EVENT, PL_151_DARK_SOLD_FLAG, NO_PAPERS_TUNING } from '../src/systems/plants/pl151NoPapers.js';
import { pl152TheTally, PL_152_TALLY_EVENT, PL_152_BURNED_EVENT } from '../src/systems/plants/pl152TheTally.js';
import { pl153TheMinute, PL_153_MINUTE_EVENT } from '../src/systems/plants/pl153TheMinute.js';
import { pl252RegularsHour, PL_252_SERVED_EVENT, PL_252_MISS_EVENT } from '../src/systems/plants/pl252RegularsHour.js';
import { pl253WallDent, PL_253_DENT_EVENT, PL_253_FED_EVENT } from '../src/systems/plants/pl253WallDent.js';
import { pl104Inventory, PL_104_CHALK_EVENT, chalkStockNumber, gapAnchorFor, INVENTORY_TUNING } from '../src/systems/plants/pl104Inventory.js';
import { pl155FairTrade, PL_155_TRADE_EVENT, returnCommodityFor, FAIR_TRADE_TUNING } from '../src/systems/plants/pl155FairTrade.js';
import { pl248CrossingShadow, PL_248_WITNESSED_EVENT, CROSSING_SHADOW_TUNING, crossingLayoutFor } from '../src/systems/plants/pl248CrossingShadow.js';
import { pl124ParkedLight, PL_124_BEAT_EVENT, PL_124_PARKED_EVENT, PL_124_TAKE_EVENT, PL_124_RACE_OVER_EVENT, PARKED_LIGHT_TUNING, PL_124_BEATS_FLAG, PL_124_RACE_OVER_FLAG } from '../src/systems/plants/pl124ParkedLight.js';
import { pl125UnderPaint, PL_125_REVEAL_EVENT, PL_125_BUFFED_EVENT, UNDER_PAINT_TUNING } from '../src/systems/plants/pl125UnderPaint.js';
import { pl126KeepingIt, PL_126_KEPT_EVENT, PL_126_RETURNED_EVENT, busAnchorFor } from '../src/systems/plants/pl126KeepingIt.js';
import { pl175First, PL_175_FIRST_EVENT, PL_175_TAGGED_EVENT, PL_175_PLUS_EVENT, PL_175_JUNO_FIRST_EVENT, circuitFor } from '../src/systems/plants/pl175First.js';
import { pl195FixedX, PL_195_LOOKED_EVENT, fixedXPosition } from '../src/systems/plants/pl195FixedX.js';
import { pl196MirrorRock, PL_196_MIRROR_EVENT, PL_196_CAUGHT_EVENT, mirrorRockPosition, MIRROR_ROCK_TUNING } from '../src/systems/plants/pl196MirrorRock.js';

// ---------- harness ----------

const DAY = 240;              // shared tuning day length
const NIGHT = 200;            // a simTime inside the night band (phase 200 >= 180)

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

function makeState(overrides = {}) {
  const entities = new Map();
  const state = {
    mode: 'flight',
    simTime: 0,
    tick: 0,
    playerId: 7,              // numeric: real payload stamps (playerJettisonOrigin) need it
    entities,
    world: { currentSectorId: 'sector_tethys_junction' },
    claims: {},
    sites: {},
    story: { flags: {} },
    player: { credits: 0, cargo: { items: {} } },
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

function harness(overrides = {}) {
  const state = makeState(overrides.state);
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
function advance(state, seconds, step = 0.5) {
  for (let t = 0; t < seconds; t += step) {
    state.simTime += step;
    state.tick += Math.round(step * 60);
  }
}

function advanceWith(state, mod, seconds, step = 0.5) {
  for (let t = 0; t < seconds; t += step) {
    state.simTime += step;
    state.tick += Math.round(step * 60);
    mod.update(step, state);
  }
}
function assertNoListeners(bus) {
  const counts = bus.types().map((t) => bus.count(t));
  assert.deepEqual(counts, new Array(counts.length).fill(0), 'destroy must leave no listeners');
}

// ---------- PL-146 The first caller ----------

test('PL-146 first call lands at night in the first week with the exact line and a lamp', () => {
  const h = harness({ state: { simTime: 0 } });
  const mod = pl146FirstCaller;
  mod.init(h);
  h.bus.emit('claim:claimed', { body: { id: 'b1', x: 0, z: 0 } });
  h.state.simTime = 100; // day: the hauler does not call by day
  mod.update(0.5, h.state);
  assert.equal(popups(h.bus).length, 0, 'no day call');
  h.state.simTime = NIGHT; // night
  mod.update(0.5, h.state);
  const p = popups(h.bus);
  assert.equal(p.length, 1);
  assert.equal(p[0].text, 'Saw your light.');
  assert.equal(p[0].sender, 'Hauler, unlogged');
  assert.ok(eventsOf(h.bus, PL_146_CALL_EVENT).length === 1, 'call event once');
  const lamp = h.helpers.spawned.find((e) => e.data.plantsPl146Lamp === true);
  assert.ok(lamp, 'a lamp was left on the rock');
  assert.equal(lamp.data.lampLit, true);
  assert.equal(lamp.data.lampsFlashing, true, 'arrival flash');
  assert.ok(lamp.flags?.persistent !== true); // the lamp is session truth
  // Cooldown: an immediate second update does not double-call.
  mod.update(0.5, h.state);
  assert.equal(eventsOf(h.bus, PL_146_CALL_EVENT).length, 1);
  // Weekly: the lamp lit, the calls come weekly.
  h.state.simTime += FIRST_CALLER_TUNING.weekS;
  mod.update(0.5, h.state);
  assert.equal(eventsOf(h.bus, PL_146_CALL_EVENT).length, 2, 'weekly call');
  mod.destroy();
  assertNoListeners(h.bus);
  assert.ok(h.helpers.removed.length >= 1, 'owned entities removed on destroy');
});

test('PL-146 snuffing the lamp slows the caller permanently', () => {
  const h = harness({ state: { simTime: 0 } });
  const mod = pl146FirstCaller;
  mod.init(h);
  h.bus.emit('claim:claimed', { body: { id: 'b1', x: 0, z: 0 } });
  h.state.simTime = NIGHT;
  mod.update(0.5, h.state);
  const lamp = h.helpers.spawned.find((e) => e.data.plantsPl146Lamp === true);
  h.bus.emit('entity:killed', { id: lamp.id });
  assert.equal(eventsOf(h.bus, PL_146_SNUFFED_EVENT).length, 1);
  assert.equal(h.state.story.flags.plantsPl146LampLit, false);
  assert.equal(h.state.story.flags[PL_146_EVER_SNUFFED_FLAG], true, 'durable ever-snuffed flag');
  // One week later: no call yet (the snuffed gap is long).
  h.state.simTime = NIGHT + FIRST_CALLER_TUNING.weekS;
  mod.update(0.5, h.state);
  assert.equal(eventsOf(h.bus, PL_146_CALL_EVENT).length, 1, 'no weekly call after snuff');
  // ...but the next call is a long time coming: it does come, eventually.
  h.state.simTime = NIGHT + FIRST_CALLER_TUNING.snuffedGapS;
  mod.update(0.5, h.state);
  assert.equal(eventsOf(h.bus, PL_146_CALL_EVENT).length, 2, 'the late call comes');
  // And the cadence STAYS slow: a week later is still too soon.
  h.state.simTime += FIRST_CALLER_TUNING.weekS;
  mod.update(0.5, h.state);
  assert.equal(eventsOf(h.bus, PL_146_CALL_EVENT).length, 2, 'weekly cadence is gone for good');
  h.state.simTime += FIRST_CALLER_TUNING.snuffedGapS;
  mod.update(0.5, h.state);
  assert.equal(eventsOf(h.bus, PL_146_CALL_EVENT).length, 3, 'the slow cadence is the only cadence');
  mod.destroy();
  assertNoListeners(h.bus);
});

test('PL-146 save:loaded re-derives the claim from the restored ledger — a foreign slot moves no calls in', () => {
  const h = harness({ state: { simTime: 0, claims: { bodies: [] } } });
  const mod = pl146FirstCaller;
  mod.init(h);
  h.bus.emit('claim:claimed', { body: { id: 'b1', x: 12, z: 34 } });
  h.state.simTime = NIGHT;
  mod.update(0.5, h.state); // the first call lands at (12, 34)
  assert.equal(eventsOf(h.bus, PL_146_CALL_EVENT).length, 1);
  assert.equal(mod._claim.bodyId, 'b1');
  // Loading a different save slot: its claims ledger is empty, so the old claim cannot
  // survive the load.
  h.state.claims.bodies = [];
  h.bus.emit('save:loaded', {});
  assert.equal(mod._claim, null, 'the stale claim is dropped with the loaded ledger');
  h.state.simTime = NIGHT + FIRST_CALLER_TUNING.weekS;
  mod.update(0.5, h.state);
  assert.equal(eventsOf(h.bus, PL_146_CALL_EVENT).length, 1, 'no call fires at the old coordinates');
  assert.equal(popups(h.bus).length, 1, 'and no popup either');
  // When the loaded ledger still carries the body, the claim re-attaches — at the
  // ledger's coordinates.
  h.bus.emit('claim:claimed', { body: { id: 'b2', x: 100, z: 200 } });
  h.state.claims.bodies = [{ id: 'b2', x: 140, z: 260 }];
  h.bus.emit('save:loaded', {});
  assert.equal(mod._claim.bodyId, 'b2', 'the claim re-attaches from the ledger');
  assert.deepEqual({ x: mod._claim.x, z: mod._claim.z }, { x: 140, z: 260 }, 'at the ledger\'s coordinates');
  mod.destroy();
  assertNoListeners(h.bus);
});

test('PL-146 mid-visit sector:exit removes the visitor beacon — no orphan hull for PL-373 to warm', () => {
  const h = harness({ state: { simTime: 0 } });
  const mod = pl146FirstCaller;
  mod.init(h);
  h.bus.emit('claim:claimed', { body: { id: 'b1', x: 0, z: 0 } });
  h.state.simTime = NIGHT;
  mod.update(0.5, h.state); // the first call spawns the circling hauler
  const visitor = h.helpers.spawned.find((e) => e.data.plantsPl146Visitor === true);
  assert.ok(visitor, 'visitor beacon spawned');
  assert.equal(h.state.entities.has(visitor.id), true, 'visitor present mid-visit');
  // Leave the sector mid-visit: the beacon goes with the visit, it is not orphaned.
  h.bus.emit('sector:exit', { sectorId: 'sector_tethys_junction' });
  assert.equal(h.state.entities.has(visitor.id), false, 'visitor beacon removed, not orphaned in entities');
  assert.ok(h.helpers.removed.includes(visitor.id), 'removeEntity carried the visitor id');
  assert.equal(mod._visitor, null, 'the visit is reset');
  mod.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-147 The first part ----------

test('PL-147 the works makes one wrong-size part; scrapping it changes nothing', () => {
  const h = harness();
  const mod = pl147FirstPart;
  mod.init(h);
  h.bus.emit('claim:claimed', { body: { id: 'b1', x: 0, z: 0 } });
  h.bus.emit('claim:moduleBuilt', { bodyId: 'b1', modId: 'works_smelter' });
  advance(h.state, 3);
  mod.update(0.5, h.state);
  const parts = h.helpers.spawned.filter((e) => e.data.plantsPl147Part === true);
  assert.equal(parts.length, 1, 'exactly one first part');
  const part = parts[0];
  assert.equal(part.data.plantsPl147Size, theOneSize('b1'), 'stamped with the yard number');
  assert.equal(part.flags?.persistent, true, 'a real persistent pod');
  assert.ok(String(part.data.scanLabel).includes('one size wrong'));
  const ev = eventsOf(h.bus, PL_147_PART_EVENT)[0];
  assert.equal(ev.size, theOneSize('b1'));
  // Keep it: nothing else happens on a second build while it lies there.
  h.bus.emit('claim:moduleBuilt', { bodyId: 'b1', modId: 'works_press' });
  advance(h.state, 3);
  mod.update(0.5, h.state);
  assert.equal(h.helpers.spawned.filter((e) => e.data.plantsPl147Part === true).length, 1);
  // Scrap it: the works only knows the one size — the next part is the same wrong size.
  h.bus.emit('entity:killed', { id: part.id });
  assert.equal(eventsOf(h.bus, PL_147_SCRAPPED_EVENT).length, 1);
  h.bus.emit('claim:moduleBuilt', { bodyId: 'b1', modId: 'works_lathe' });
  advance(h.state, 3);
  mod.update(0.5, h.state);
  const parts2 = h.helpers.spawned.filter((e) => e.data.plantsPl147Part === true);
  assert.equal(parts2.length, 2);
  assert.equal(parts2[1].data.plantsPl147Size, theOneSize('b1'), 'the one size, again');
  assert.equal(eventsOf(h.bus, PL_147_SCRAPPED_EVENT).length, 1, 'scrap receipt cooldown');
  mod.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-148 The count ----------

test('PL-148 the skiff counts one night lap; lining it blinds the yard watch for the next raid', () => {
  const h = harness({ state: { simTime: 100, claims: { bodies: [{ id: 'b1', x: 0, z: 0 }] } } });
  const mod = pl148TheCount;
  mod.init(h);
  // The warning itself is the yard's heads-up: relayed while The Count is intact.
  h.bus.emit('claim:defenseWarning', { bodyId: 'b1', encounterId: 'enc1', attackerName: 'Redline', attackerCount: 2, deadlineAt: 160 });
  assert.equal(eventsOf(h.bus, PL_148_COUNT_EVENT).filter((e) => e.outcome === 'warning-relayed').length, 1, 'warning relayed');
  assert.ok(popups(h.bus).some((x) => x.text.includes('Yard watch: Redline')), 'the heads-up beat');
  // By day: the warning alone launches nothing.
  mod.update(0.1, h.state);
  assert.equal(h.helpers.spawned.filter((e) => e.data.plantsPl148Skiff).length, 0, 'lamps off means night');
  h.state.simTime = NIGHT;
  mod.update(0.1, h.state);
  const skiff = h.helpers.spawned.find((e) => e.data.plantsPl148Skiff === true);
  assert.ok(skiff, 'the skiff flies at night');
  assert.equal(skiff.data.masslineTetherable, true, 'it can be Lined');
  // Let it count: one full lap and it leaves, quietly.
  for (let i = 0; i < 13 * 60; i++) {
    h.state.simTime += 1 / 60;
    mod.update(1 / 60, h.state);
    if (!h.state.entities.has(skiff.id)) break;
  }
  const counted = eventsOf(h.bus, PL_148_COUNT_EVENT).find((e) => e.outcome === 'counted');
  assert.ok(counted, 'the count completed');
  assert.equal(h.state.entities.has(skiff.id), false, 'the skiff leaves');
  mod.destroy();

  // Line it: kill the skiff — the pilot ejects, the wreck is yours, the NEXT warning is mute.
  const h2 = harness({ state: { simTime: NIGHT, claims: { bodies: [{ id: 'b1', x: 0, z: 0 }] } } });
  const mod2 = pl148TheCount;
  mod2.init(h2);
  h2.bus.emit('claim:defenseWarning', { bodyId: 'b1', encounterId: 'enc2', attackerName: 'Redline', attackerCount: 2, deadlineAt: 260 });
  mod2.update(0.1, h2.state);
  const skiff2 = h2.helpers.spawned.find((e) => e.data.plantsPl148Skiff === true);
  h2.bus.emit('entity:killed', { id: skiff2.id });
  assert.equal(h2.bus.log.filter((e) => e.type === 'claim:defenseGo').length, 0, 'no invented raid-clock writes');
  const pilot = h2.helpers.spawned.find((e) => e.data.plantsPl148Pilot === true);
  assert.ok(pilot, 'the pilot ejects as a real pod');
  assert.ok(pilot.physicsBody?.mass > 0, 'pilot mass is physics truth');
  const yours = h2.helpers.spawned.find((e) => e.data.plantsPl148Yours === true);
  assert.ok(yours && yours.flags?.persistent === true, 'the skiff is yours');
  assert.equal(eventsOf(h2.bus, PL_148_LINED_EVENT).length, 1);
  assert.ok(popups(h2.bus).some((x) => x.text === 'The pilot ejects. Your watch goes blind.'));
  // The next raid warning gets NO heads-up: the yard is deaf for one raid.
  h2.bus.emit('claim:defenseWarning', { bodyId: 'b1', encounterId: 'enc3', attackerName: 'Voss', attackerCount: 3, deadlineAt: 400 });
  const relays = eventsOf(h2.bus, PL_148_COUNT_EVENT).filter((e) => e.outcome === 'warning-relayed');
  const suppressed = eventsOf(h2.bus, PL_148_COUNT_EVENT).filter((e) => e.outcome === 'warning-suppressed');
  assert.equal(relays.length, 1, 'no relay beyond the pre-kill warning: the next raid went unheard');
  assert.equal(suppressed.length, 1, 'the suppression receipt');
  assert.ok(!popups(h2.bus).some((x) => x.text.includes('Yard watch: Voss')), 'the yard gets no heads-up');
  // The one after that is heard again (one raid of deafness, not forever).
  h2.bus.emit('claim:defenseWarning', { bodyId: 'b1', encounterId: 'enc4', attackerName: 'Sable', attackerCount: 1, deadlineAt: 500 });
  assert.equal(eventsOf(h2.bus, PL_148_COUNT_EVENT).filter((e) => e.outcome === 'warning-relayed').length, 2, 'the watch recovers');
  mod2.destroy();
  assertNoListeners(h2.bus);

  // The raid starting cancels any pending count.
  const h3 = harness({ state: { simTime: 100, claims: { bodies: [{ id: 'b1', x: 0, z: 0 }] } } });
  const mod3 = pl148TheCount;
  mod3.init(h3);
  h3.bus.emit('claim:defenseWarning', { bodyId: 'b1', encounterId: 'enc5', deadlineAt: 160 });
  h3.bus.emit('claim:defenseStarted', { bodyId: 'b1', encounterId: 'enc5' });
  h3.state.simTime = NIGHT;
  mod3.update(0.1, h3.state);
  assert.equal(h3.helpers.spawned.filter((e) => e.data.plantsPl148Skiff).length, 0, 'no count once the raid is on');
  mod3.destroy();
});

// ---------- PL-149 Which way it leans ----------

test('PL-149 the seedling leans out toward the dark, day by day, and follows pay once', () => {
  const h = harness({ state: { simTime: 0 } });
  const mod = pl149SeedlingLean;
  mod.init(h);
  h.bus.emit('claim:claimed', { body: { id: 'b1', x: 100, z: 100 } });
  mod.update(0.5, h.state);
  const seed = h.helpers.spawned.find((e) => e.data.plantsPl149Seedling === true);
  assert.ok(seed, 'a seedling on your rock');
  assert.equal(seed.radius, 3, 'tiny prop');
  const bearing = darkBearingOf(seed.pos);
  // Two in-world days: the lean has grown toward the fixed dark bearing.
  advance(h.state, 2 * DAY, 1);
  mod.update(1, h.state);
  assert.ok(Math.abs(seed.rot - bearing) < Math.PI / 2 + 0.1, 'lean heads out, not in');
  assert.ok(seed.data.visualRadius > 3, 'it grows anyway');
  const grew = seed.data.visualRadius;
  advance(h.state, 2 * DAY, 1);
  mod.update(1, h.state);
  assert.ok(seed.data.visualRadius > grew, 'and keeps growing');
  // Follow the lean: hold the line out along the bearing.
  const px = seed.pos.x + Math.cos(bearing) * 300;
  const pz = seed.pos.z + Math.sin(bearing) * 300;
  h.state.entities.get(7).pos.x = px;
  h.state.entities.get(7).pos.z = pz;
  advanceWith(h.state, mod, 7, 0.5);
  assert.equal(eventsOf(h.bus, PL_149_FOLLOW_EVENT).length, 1, 'the follow beat, once');
  advanceWith(h.state, mod, 7, 0.5);
  assert.equal(eventsOf(h.bus, PL_149_FOLLOW_EVENT).length, 1, 'not again this seedling');
  mod.destroy();
  assertNoListeners(h.bus);
  assert.ok(h.helpers.removed.includes(seed.id), 'seedling removed');
});

// ---------- PL-150 Its spot ----------

test('PL-150 the first turret build plants a plinth that never leaves its spot', () => {
  const h = harness();
  // Claim bodies live in state.claims.bodies (claims.js owns them) — drive the real shape.
  h.state.claims = { bodies: [{ id: 'b1', x: 50, z: 60, name: 'Test Rock' }] };
  const mod = pl150ItsSpot;
  mod.init(h);
  // Not a turret: no plinth.
  h.bus.emit('claim:moduleBuilt', { bodyId: 'b1', modId: 'cargo_bay' });
  mod.update(0.5, h.state);
  assert.equal(h.helpers.spawned.filter((e) => e.data.plantsPl150Spot).length, 0);
  // The turret: its spot is the first spot, read from the claim body.
  h.bus.emit('claim:moduleBuilt', { bodyId: 'b1', modId: 'turret_mk1' });
  mod.update(0.5, h.state);
  const plinth = h.helpers.spawned.find((e) => e.data.plantsPl150Spot === true);
  assert.ok(plinth, 'the plinth stands');
  assert.equal(plinth.mass, 1e6, 'fixed base');
  assert.ok(Math.abs(plinth.pos.x - (50 + ITS_SPOT_TUNING.plinthOffsetWu)) < 0.01, 'plinth sits on the claim body');
  const spotX = plinth.pos.x;
  // Whatever towed it, it goes home anyway.
  plinth.pos.x += 40;
  mod.update(0.5, h.state);
  assert.equal(plinth.pos.x, spotX, 'snapped back to its spot');
  // Overnight: one home report per in-world day.
  advance(h.state, ITS_SPOT_TUNING.dayLengthS + ITS_SPOT_TUNING.homeBeatOffsetS, 1);
  mod.update(1, h.state);
  assert.equal(eventsOf(h.bus, PL_150_HOME_EVENT).length, 1);
  advance(h.state, ITS_SPOT_TUNING.homeBeatOffsetS, 1);
  mod.update(1, h.state);
  assert.equal(eventsOf(h.bus, PL_150_HOME_EVENT).length, 1, 'once per day');
  mod.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-151 No papers ----------

test('PL-151 the private hail, the physical dark sale, and the honest-lane cost', () => {
  const h = harness({ state: { simTime: 0 } });
  const mod = pl151NoPapers;
  mod.init(h);
  h.bus.emit('claim:moduleBuilt', { bodyId: 'b1', modId: 'works_smelter' });
  advance(h.state, NO_PAPERS_TUNING.firstHailDelayS + 1, 1);
  mod.update(1, h.state);
  const p = popups(h.bus);
  assert.ok(p.some((x) => x.text === 'No papers. Better price.'), 'exact hail copy');
  assert.equal(eventsOf(h.bus, PL_151_HAIL_EVENT).length, 1);
  const buyer = h.helpers.spawned.find((e) => e.data.plantsPl151Buyer === true);
  assert.ok(buyer, 'the buyer hangs in the dark');
  // Post in: a pod of your own jettison, parked near the buyer.
  const pod = {
    id: 500, alive: true, type: 'payload', mass: 40, physicsBody: { mass: 40 },
    pos: { x: buyer.pos.x + 5, z: buyer.pos.z }, vel: { x: 0, z: 0 }, data: { playerJettisonOrigin: { version: 1, ownerId: 7 } },
  };
  h.state.entities.set(500, pod);
  mod.update(0.5, h.state); // posted
  advance(h.state, NO_PAPERS_TUNING.returnDelayS + 0.5, 0.5);
  mod.update(0.5, h.state); // collected
  const sale = eventsOf(h.bus, PL_151_DARK_SALE_EVENT)[0];
  assert.ok(sale, 'the sale happened');
  assert.equal(sale.podId, 500);
  assert.equal(sale.firstSale, true);
  assert.ok(h.helpers.removed.includes(500), 'the buyer took the pod');
  const pay = h.bus.log.filter((e) => e.type === 'economy:grantCredits')[0];
  assert.ok(pay && pay.payload.amount > 0, 'paid, unlogged');
  assert.equal(h.state.story.flags[PL_151_DARK_SOLD_FLAG], true);
  assert.ok(popups(h.bus).some((x) => String(x.text).includes('skip your lane')));
  // After selling dark there are no more hails at all.
  advance(h.state, NO_PAPERS_TUNING.hailRepeatS + 10, 5);
  mod.update(1, h.state);
  assert.equal(eventsOf(h.bus, PL_151_HAIL_EVENT).length, 1, 'no hail after dark sale');
  mod.destroy();
  assertNoListeners(h.bus);
});

test('PL-151 refusing by silence: the hail comes back weekly, polite', () => {
  const h = harness({ state: { simTime: 0 } });
  const mod = pl151NoPapers;
  mod.init(h);
  h.bus.emit('claim:moduleBuilt', { bodyId: 'b1', modId: 'works_smelter' });
  advance(h.state, NO_PAPERS_TUNING.firstHailDelayS + 1, 1);
  mod.update(1, h.state);
  assert.equal(eventsOf(h.bus, PL_151_HAIL_EVENT).length, 1);
  // Refuse: nothing posted; the window closes and the next hail is scheduled.
  advance(h.state, NO_PAPERS_TUNING.buyWindowS + 2, 2);
  mod.update(1, h.state);
  advance(h.state, NO_PAPERS_TUNING.hailRepeatS + 2, 2);
  mod.update(1, h.state);
  assert.equal(eventsOf(h.bus, PL_151_HAIL_EVENT).length, 2, 'polite weekly return');
  mod.destroy();
});

// ---------- PL-152 The tally ----------

test('PL-152 a lost raid leaves a chalked wreck; feeding it to the works burns the list', () => {
  const h = harness();
  const mod = pl152TheTally;
  mod.init(h);
  h.bus.emit('claim:claimed', { body: { id: 'b1', x: 10, z: 20 } });
  h.bus.emit('claim:raided', { bodyId: 'b1', outcome: 'lost' });
  const wreck = h.helpers.spawned.find((e) => e.data.plantsPl152Wreck === true);
  assert.ok(wreck, 'their wreck, left behind');
  assert.equal(wreck.flags?.persistent, true, 'keep it as proof: it persists');
  assert.equal(wreck.data.swarmFloorPad.label, 'Chalk list: your yard');
  assert.equal(eventsOf(h.bus, PL_152_TALLY_EVENT).length, 1);
  // A raid storm does not rain tallies.
  h.bus.emit('claim:raided', { bodyId: 'b1', outcome: 'lost' });
  assert.equal(h.helpers.spawned.filter((e) => e.data.plantsPl152Wreck).length, 1, 'cooldown');
  // Feed it to the works.
  h.bus.emit('entity:killed', { id: wreck.id });
  assert.equal(eventsOf(h.bus, PL_152_BURNED_EVENT).length, 1);
  assert.ok(popups(h.bus).some((x) => x.text === 'Fed to the works. The list burns.'));
  // A later lost raid can leave a new tally.
  h.state.simTime += 60;
  h.bus.emit('claim:raided', { bodyId: 'b1', outcome: 'lost' });
  assert.equal(h.helpers.spawned.filter((e) => e.data.plantsPl152Wreck).length, 2);
  // defenseResolved with a non-defended outcome also counts as losing.
  h.state.simTime += 60;
  h.bus.emit('claim:defenseResolved', { bodyId: 'b1', outcome: 'overrun' });
  assert.equal(h.helpers.spawned.filter((e) => e.data.plantsPl152Wreck).length, 3);
  mod.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-153 The minute ----------

test('PL-153 every shift change in a drill session: the minute, two taps', () => {
  const h = harness({ state: { simTime: 239 } });
  const mod = pl153TheMinute;
  mod.init(h);
  h.bus.emit('drill:start', { asteroidId: 'a1' });
  mod.update(0.5, h.state); // still the old shift
  assert.equal(eventsOf(h.bus, PL_153_MINUTE_EVENT).length, 0);
  h.state.simTime = 240.5; // boundary crossed
  mod.update(0.5, h.state);
  assert.equal(eventsOf(h.bus, PL_153_MINUTE_EVENT).length, 1);
  const minute = eventsOf(h.bus, PL_153_MINUTE_EVENT)[0];
  assert.equal(minute.until - minute.openAt, 60, 'one minute');
  assert.ok(cues(h.bus).filter((c) => c.id === 'sfx_vent_chime').length >= 1, 'first tap');
  h.state.simTime += 1.0;
  mod.update(0.5, h.state);
  assert.ok(cues(h.bus).filter((c) => c.id === 'sfx_vent_chime').length >= 2, 'the drill taps twice');
  // No second minute inside the same shift.
  h.state.simTime += 30;
  mod.update(0.5, h.state);
  assert.equal(eventsOf(h.bus, PL_153_MINUTE_EVENT).length, 1);
  // The minute closes after its full 60 s...
  h.state.simTime = 301;
  mod.update(0.5, h.state);
  assert.equal(eventsOf(h.bus, PL_153_MINUTE_EVENT).length, 1);
  // ...and the next shift change opens the next minute.
  h.state.simTime = 360.5;
  mod.update(0.5, h.state);
  assert.equal(eventsOf(h.bus, PL_153_MINUTE_EVENT).length, 2, 'every shift change');
  // drill:end closes the ceremony.
  h.bus.emit('drill:end', {});
  h.state.simTime = 480.5;
  mod.update(0.5, h.state);
  assert.equal(eventsOf(h.bus, PL_153_MINUTE_EVENT).length, 2, 'no session, no minute');
  mod.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-252 The regular's hour ----------

test('PL-252 the regular expects the hopper full; missing the hour pushes the next call off', () => {
  // Served: ore in the hold.
  const h = harness({ state: { simTime: NIGHT } });
  h.state.player.cargo.items = { cmdty_ore_iron: 12 };
  const mod = pl252RegularsHour;
  mod.init(h);
  h.bus.emit(PL_146_CALL_EVENT, { visit: 1, hourOfDay: 200 / DAY, pos: { x: 0, z: 0 }, t: h.state.simTime });
  h.bus.emit(PL_146_CALL_EVENT, { visit: 2, hourOfDay: 200 / DAY, pos: { x: 0, z: 0 }, t: h.state.simTime + 1 });
  assert.equal(eventsOf(h.bus, PL_252_SERVED_EVENT).length, 1);
  assert.ok(popups(h.bus).some((x) => x.text.includes('Found you full')));
  mod.destroy();

  // Missed: the hopper reads empty — it circles once, leaves.
  const h2 = harness({ state: { simTime: NIGHT } });
  const mod2 = pl252RegularsHour;
  mod2.init(h2);
  h2.bus.emit(PL_146_CALL_EVENT, { visit: 1, hourOfDay: 200 / DAY, t: 0 });
  h2.bus.emit(PL_146_CALL_EVENT, { visit: 2, hourOfDay: 200 / DAY, t: 1 });
  assert.equal(eventsOf(h2.bus, PL_252_MISS_EVENT).length, 1);
  assert.ok(popups(h2.bus).some((x) => x.text.includes('circles once')));
  mod2.destroy();

  // A rescheduled call lands OFF the regular's hour — the hopper is judged anyway.
  const h2b = harness({ state: { simTime: NIGHT } });
  h2b.state.player.cargo.items = { cmdty_ore_copper: 15 };
  const mod2b = pl252RegularsHour;
  mod2b.init(h2b);
  h2b.bus.emit(PL_146_CALL_EVENT, { visit: 1, hourOfDay: 200 / DAY, t: 0 });
  h2b.bus.emit(PL_146_CALL_EVENT, { visit: 2, hourOfDay: 0.31, t: 1 }); // well off the hour
  const servedLate = eventsOf(h2b.bus, PL_252_SERVED_EVENT)[0];
  assert.ok(servedLate, 'the off-hour call is still judged');
  assert.equal(servedLate.late, true, 'and marked late');
  mod2b.destroy();

  // Integration: the miss pushes PL-146's next call out a long stretch.
  const h3 = harness({ state: { simTime: 0 } });
  const caller = pl146FirstCaller;
  const regular = pl252RegularsHour;
  caller.init(h3);
  regular.init(h3);
  h3.bus.emit('claim:claimed', { body: { id: 'b1', x: 0, z: 0 } });
  h3.state.simTime = NIGHT;
  caller.update(0.5, h3.state); // first call: introduction
  h3.state.simTime += FIRST_CALLER_TUNING.weekS;
  caller.update(0.5, h3.state); // second call: the regular expects ore; the hold is empty
  assert.equal(eventsOf(h3.bus, PL_252_MISS_EVENT).length, 1);
  h3.state.simTime += FIRST_CALLER_TUNING.weekS;
  caller.update(0.5, h3.state);
  assert.equal(eventsOf(h3.bus, PL_146_CALL_EVENT).length, 2, 'no weekly call after a miss');
  h3.state.simTime += FIRST_CALLER_TUNING.snuffedGapS;
  caller.update(0.5, h3.state);
  assert.equal(eventsOf(h3.bus, PL_146_CALL_EVENT).length, 3, 'the next call is a long time off — then it comes');
  regular.destroy();
  caller.destroy();
  assertNoListeners(h3.bus);
});

// ---------- PL-253 The wall's first dent ----------

test('PL-253 the first won raid leaves a dent; feeding it to the works is the end of it', () => {
  const h = harness();
  const mod = pl253WallDent;
  mod.init(h);
  h.bus.emit('claim:claimed', { body: { id: 'b1', x: 0, z: 0 } });
  h.bus.emit('claim:raidRepelled', { bodyId: 'b1' });
  const dent = h.helpers.spawned.find((e) => e.data.plantsPl253Dent === true);
  assert.ok(dent, 'one wreck, half-buried');
  assert.equal(dent.flags?.persistent, true);
  assert.equal(dent.data.swarmFloorPad.label, 'First dent — proof');
  assert.equal(eventsOf(h.bus, PL_253_DENT_EVENT).length, 1);
  // The first dent is the only dent.
  h.bus.emit('claim:raidRepelled', { bodyId: 'b1' });
  h.bus.emit('claim:defenseResolved', { bodyId: 'b1', outcome: 'defended' });
  assert.equal(h.helpers.spawned.filter((e) => e.data.plantsPl253Dent).length, 1);
  // Feed it to the works.
  h.bus.emit('entity:killed', { id: dent.id });
  assert.equal(eventsOf(h.bus, PL_253_FED_EVENT).length, 1);
  // Even a fresh win does not raise a second dent: once ever.
  h.bus.emit('claim:raidRepelled', { bodyId: 'b1' });
  assert.equal(h.helpers.spawned.filter((e) => e.data.plantsPl253Dent).length, 1);
  mod.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-104 Inventory ----------

test('PL-104 a Market Night parked in the gap chalks a stock number on your hull', () => {
  const h = harness({ state: { simTime: 180, world: { currentSectorId: INVENTORY_TUNING.sectorId } } }); // night opens at phase 180
  const mod = pl104Inventory;
  mod.init(h);
  const anchor = gapAnchorFor(INVENTORY_TUNING.sectorId);
  const player = h.state.entities.get(7);
  player.pos.x = anchor.x;
  player.pos.z = anchor.z;
  player.vel = { x: 0, z: 0 };
  mod.update(0.5, h.state); // the gap materializes on the first pass
  const gap = h.helpers.spawned.find((e) => e.data.plantsPl104Gap === true);
  assert.ok(gap, 'the gap stands behind the Chop Line');
  // Night one, parked through: claws, then the chalk.
  advanceWith(h.state, mod, 60, 0.5);
  const chalk = eventsOf(h.bus, PL_104_CHALK_EVENT)[0];
  assert.ok(chalk, 'chalked by morning');
  assert.equal(chalk.number, chalkStockNumber(INVENTORY_TUNING.sectorId));
  assert.match(chalk.number, /^SZ-\d{4}$/);
  assert.equal(player.data.plantsPl104StockNumber, chalk.number, 'stamped on the hull (family-namespaced)');
  assert.ok(popups(h.bus).some((x) => x.sender === 'Tinker Zell'));
  const chimes = cues(h.bus).filter((c) => c.id === 'sfx_vent_chime');
  assert.ok(chimes.length >= 1 && chimes.length <= INVENTORY_TUNING.clawChimesPerNight, 'claws work, capped');
  mod.destroy();

  // Take a normal berth: moving out resets the dwell and there is no chalk.
  const h2 = harness({ state: { simTime: NIGHT, world: { currentSectorId: INVENTORY_TUNING.sectorId } } });
  const mod2 = pl104Inventory;
  mod2.init(h2);
  const a2 = gapAnchorFor(INVENTORY_TUNING.sectorId);
  const p2 = h2.state.entities.get(7);
  p2.pos.x = a2.x;
  p2.pos.z = a2.z;
  advanceWith(h2.state, mod2, 30, 0.5);
  p2.vel = { x: 30, z: 0 }; // leaving for a normal berth
  advanceWith(h2.state, mod2, 40, 0.5);
  assert.equal(eventsOf(h2.bus, PL_104_CHALK_EVENT).length, 0, 'no number for a normal berth');
  assert.equal(p2.data.plantsPl104StockNumber, undefined);
  mod2.destroy();
  assertNoListeners(h2.bus);
});

// ---------- PL-155 Fair trade ----------

test('PL-155 the slow second beacon and a weight-for-weight hatch', () => {
  const h = harness({ state: { simTime: 1, world: { currentSectorId: FAIR_TRADE_TUNING.sectorId } } });
  const mod = pl155FairTrade;
  mod.init(h);
  mod.update(0.5, h.state);
  const beacon = h.helpers.spawned.find((e) => e.data.plantsPl155Beacon === true);
  const hatch = h.helpers.spawned.find((e) => e.data.plantsPl155Hatch === true);
  assert.ok(beacon && hatch, 'second beacon and hatch staged');
  // The hatch sits OUT PAST the last lamp: beacon-to-hatch distance exceeds the beacon offset.
  const lampToHatch = Math.hypot(hatch.pos.x - beacon.pos.x, hatch.pos.z - beacon.pos.z);
  assert.ok(lampToHatch > FAIR_TRADE_TUNING.secondBeaconOffsetWu, 'the hatch is out past the last lamp');
  // The second pattern, slower: off-phase stamping flips the lamp.
  h.state.simTime = 4; // phase 4 >= slowBlinkOnS(2.2): off
  mod.update(0.5, h.state);
  assert.equal(beacon.data.lampsFlashing, false);
  h.state.simTime = 6; // phase 0 (6 % 6): on band
  mod.update(0.5, h.state);
  assert.equal(beacon.data.lampsFlashing, true);
  // Post in: a player jettison at rest inside the ring — posting cmdty_alloys.
  const pod = {
    id: 501, alive: true, type: 'payload', mass: 40, physicsBody: { mass: 40 },
    pos: { x: hatch.pos.x + 3, z: hatch.pos.z }, vel: { x: 0, z: 0 },
    data: { playerJettisonOrigin: { version: 1, ownerId: 7 }, commodityId: 'cmdty_alloys' },
  };
  h.state.entities.set(501, pod);
  mod.update(0.5, h.state);
  advance(h.state, FAIR_TRADE_TUNING.returnDelayS + 0.5, 0.5);
  mod.update(0.5, h.state);
  const trade = eventsOf(h.bus, PL_155_TRADE_EVENT)[0];
  assert.ok(trade, 'the trade happened');
  assert.equal(trade.postedPodId, 501);
  assert.equal(trade.postedMass, 40, 'the posted weight was read');
  assert.ok(h.helpers.removed.includes(501), 'the hatch swallowed the post');
  const back = h.helpers.spawned.find((e) => e.data.plantsPl155Return === true);
  assert.ok(back, 'something came back');
  assert.equal(back.physicsBody.mass, 40, 'about the same weight — physics truth');
  assert.equal(back.data.commodityId, returnCommodityFor(501, 'cmdty_alloys'), 'deterministic pick');
  assert.notEqual(back.data.commodityId, 'cmdty_alloys', 'something ELSE than what was posted in');
  // Determinism: same pod in, same junk out, every time.
  assert.equal(returnCommodityFor(501, 'cmdty_alloys'), returnCommodityFor(501, 'cmdty_alloys'));
  mod.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-248 The crossing shadow ----------

test('PL-248 at the shadow hour the window light goes out; be there and it is witnessed', () => {
  const inPass = CROSSING_SHADOW_TUNING.dayLengthS * CROSSING_SHADOW_TUNING.shadowHourFraction + 2;
  const h = harness({ state: { simTime: inPass, world: { currentSectorId: CROSSING_SHADOW_TUNING.sectorId } } });
  const mod = pl248CrossingShadow;
  mod.init(h);
  const player = h.state.entities.get(7);
  mod.update(0.5, h.state);
  const win = h.helpers.spawned.find((e) => e.data.plantsPl248Window === true);
  const cw = h.helpers.spawned.find((e) => e.data.plantsPl248Counterweight === true);
  assert.ok(win && cw, 'Slipway counterweight and Tower window staged');
  assert.equal(win.data.lampsFlashing, false, 'the light in that window goes out while it passes');
  // The counterweight is genuinely MID-CROSSING along the authored sightline.
  const layout = crossingLayoutFor(CROSSING_SHADOW_TUNING.sectorId);
  assert.ok(cw.pos.x > layout.counterweightStart.x, 'the crossing has begun');
  assert.ok(cw.pos.x < layout.counterweightEnd.x, 'the crossing has not ended');
  // Be there: the player is parked near the window.
  player.pos.x = win.pos.x + 10;
  player.pos.z = win.pos.z;
  mod.update(0.5, h.state);
  assert.equal(eventsOf(h.bus, PL_248_WITNESSED_EVENT).length, 1, 'witnessed once');
  mod.update(0.5, h.state);
  assert.equal(eventsOf(h.bus, PL_248_WITNESSED_EVENT).length, 1, 'no repeat within the day');
  // After the pass the light is back.
  h.state.simTime = CROSSING_SHADOW_TUNING.dayLengthS * CROSSING_SHADOW_TUNING.shadowHourFraction + CROSSING_SHADOW_TUNING.passS + CROSSING_SHADOW_TUNING.returnS + 5;
  mod.update(0.5, h.state);
  assert.equal(win.data.lampsFlashing, true, 'the light comes back');
  mod.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-124 The parked light ----------

test('PL-124 three beats arm the parked light; the cairn flashes once, then the race ends', () => {
  const h = harness({ state: { simTime: 10, world: { currentSectorId: PARKED_LIGHT_TUNING.sectorId } } });
  const mod = pl124ParkedLight;
  mod.init(h);
  mod.update(0.5, h.state);
  const startLight = h.helpers.spawned.find((e) => String(e.data.scanLabel || '').includes('start light'));
  const farLight = h.helpers.spawned.find((e) => String(e.data.scanLabel || '').includes('far light'));
  assert.ok(startLight && farLight, 'bypass laid');
  const player = h.state.entities.get(7);
  // Beat the light three times.
  for (let b = 1; b <= 3; b++) {
    player.pos.x = startLight.pos.x;
    player.pos.z = startLight.pos.z;
    mod.update(0.5, h.state);
    player.pos.x = farLight.pos.x;
    player.pos.z = farLight.pos.z;
    h.state.simTime += 10; // under par, and past the leg cooldown
    mod.update(0.5, h.state);
    assert.equal(eventsOf(h.bus, PL_124_BEAT_EVENT).length, b, `beat ${b}`);
  }
  // One night after the third beat, it waits at the far end, dark.
  h.state.simTime = Math.floor(h.state.simTime / DAY) * DAY + NIGHT + DAY;
  mod.update(0.5, h.state);
  const parked = h.helpers.spawned.find((e) => e.data.plantsPl124Parked === true);
  assert.ok(parked, 'the parked light waits');
  assert.equal(parked.data.lampsFlashing, false, 'dark');
  const crates = h.helpers.spawned.filter((e) => e.data.plantsPl124Cairn === true);
  assert.equal(crates.length, 5, 'a small cairn of parts — five real pods');
  for (const c of crates) assert.equal(c.flags?.persistent, true);
  assert.equal(eventsOf(h.bus, PL_124_PARKED_EVENT).length, 1);
  // Take one — it flashes once as you do.
  h.bus.emit('pickup:collected', { pickupId: crates[0].id, collectorId: 7, kind: 'cargo' });
  assert.equal(parked.data.lampsFlashing, true, 'the flash, as you take it');
  assert.equal(eventsOf(h.bus, PL_124_TAKE_EVENT).length, 1);
  h.state.simTime += PARKED_LIGHT_TUNING.flashOnceS + 0.5;
  mod.update(0.5, h.state);
  assert.equal(parked.data.lampsFlashing, false, 'the flash decays back to dark');
  // Take them all — the next run is not a race.
  for (const c of crates.slice(1)) h.bus.emit('pickup:collected', { pickupId: c.id, collectorId: 7, kind: 'cargo' });
  assert.equal(eventsOf(h.bus, PL_124_RACE_OVER_EVENT).length, 1);
  assert.ok(popups(h.bus).some((x) => x.text.includes('The next run is not a race.')));
  // ...and the bypass counts no more beats.
  const beatsBefore = eventsOf(h.bus, PL_124_BEAT_EVENT).length;
  player.pos.x = startLight.pos.x;
  player.pos.z = startLight.pos.z;
  mod.update(0.5, h.state);
  player.pos.x = farLight.pos.x;
  player.pos.z = farLight.pos.z;
  h.state.simTime += 10;
  mod.update(0.5, h.state);
  assert.equal(eventsOf(h.bus, PL_124_BEAT_EVENT).length, beatsBefore, 'no more racing');
  // The greedy-take consequence is DURABLE: a save+reload (same story flags, fresh session)
  // restores race-over — the reload cannot un-eat the cairn.
  const durableFlags = h.state.story.flags;
  assert.equal(durableFlags[PL_124_RACE_OVER_FLAG], true, 'race-over rides story flags');
  assert.equal(durableFlags[PL_124_BEATS_FLAG], 3, 'the beat count rides story flags too');
  mod.destroy();

  const h4 = harness({ state: { simTime: 10, world: { currentSectorId: PARKED_LIGHT_TUNING.sectorId } } });
  h4.state.story.flags = durableFlags; // the loaded save's bag
  const mod4 = pl124ParkedLight;
  mod4.init(h4);
  assert.equal(mod4._beats, 3, 'beats restored from the flag');
  assert.equal(mod4._raceOver, true, 'race-over restored from the flag');
  mod4.update(0.5, h4.state);
  const beatsAfterReload = eventsOf(h4.bus, PL_124_BEAT_EVENT).length;
  const start4 = h4.helpers.spawned.find((e) => String(e.data.scanLabel || '').includes('start light'));
  const far4 = h4.helpers.spawned.find((e) => String(e.data.scanLabel || '').includes('far light'));
  const p4 = h4.state.entities.get(7);
  p4.pos.x = start4.pos.x;
  p4.pos.z = start4.pos.z;
  mod4.update(0.5, h4.state);
  p4.pos.x = far4.pos.x;
  p4.pos.z = far4.pos.z;
  h4.state.simTime += 10;
  mod4.update(0.5, h4.state);
  assert.equal(eventsOf(h4.bus, PL_124_BEAT_EVENT).length, beatsAfterReload, 'a reload evades nothing');
  mod4.destroy();
  assertNoListeners(h4.bus);
});

// ---------- PL-125 Under the paint ----------

test('PL-125 a deep scrape reveals 12.4; a real repair buffs it out; the next scrape brings it back', () => {
  const h = harness({ state: { simTime: 0 } });
  const mod = pl125UnderPaint;
  mod.init(h);
  const player = h.state.entities.get(7);
  // Too shallow: nothing.
  h.bus.emit('physics:impact', { aId: 7, bId: 'rock', dp: 10 });
  assert.equal(eventsOf(h.bus, PL_125_REVEAL_EVENT).length, 0);
  // Not the player: nothing.
  h.bus.emit('physics:impact', { aId: 'npc', bId: 'rock', dp: 90 });
  assert.equal(eventsOf(h.bus, PL_125_REVEAL_EVENT).length, 0);
  // Deep enough: the scratch under the paint.
  h.bus.emit('physics:impact', { aId: 7, bId: 'rock', dp: 80 });
  assert.equal(eventsOf(h.bus, PL_125_REVEAL_EVENT).length, 1);
  assert.equal(player.data.plantsPl125UnderPaint, UNDER_PAINT_TUNING.number);
  assert.equal(UNDER_PAINT_TUNING.number, '12.4');
  assert.ok(popups(h.bus).some((x) => String(x.text).includes('12.4')));
  // Cooldown: an immediate scrape adds nothing.
  h.bus.emit('physics:impact', { aId: 7, bId: 'rock', dp: 95 });
  assert.equal(eventsOf(h.bus, PL_125_REVEAL_EVENT).length, 1);
  // Buffed out: the hull actually grew back.
  player.hull = 140;
  mod.update(0.5, h.state);
  assert.equal(eventsOf(h.bus, PL_125_BUFFED_EVENT).length, 1);
  assert.equal(player.data.plantsPl125UnderPaint, undefined);
  // It comes back with the next deep scrape.
  h.state.simTime += UNDER_PAINT_TUNING.revealCooldownS + 1;
  h.bus.emit('physics:impact', { aId: 7, bId: 'rock', dp: 85 });
  assert.equal(eventsOf(h.bus, PL_125_REVEAL_EVENT).length, 2, 'it was there first');
  mod.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-126 Keeping it ----------

test('PL-126 wear the lost hat past the bus and Benny speaks; hand it back and it rides the dash', () => {
  const h = harness({ state: { simTime: 0, world: { currentSectorId: 'sector_tethys_junction' } } });
  const mod = pl126KeepingIt;
  mod.init(h);
  mod.update(0.5, h.state);
  const bus = h.helpers.spawned.find((e) => e.data.plantsPl126Bus === true);
  const hat = h.helpers.spawned.find((e) => e.data.plantsPl126Hat === true);
  assert.ok(bus && hat, 'the bus and the lost hat staged');
  assert.equal(hat.data.masslineTetherable, true, 'the hat rides the Line');
  const player = h.state.entities.get(7);
  // Wear it (tow it while moving) past the bus.
  player.pos.x = bus.pos.x;
  player.pos.z = bus.pos.z;
  player.vel = { x: 20, z: 0 };
  hat.pos.x = bus.pos.x + 10;
  hat.pos.z = bus.pos.z;
  hat.vel = { x: 20, z: 0 };
  mod.update(0.5, h.state);
  assert.equal(eventsOf(h.bus, PL_126_KEPT_EVENT).length, 1);
  const kept = popups(h.bus).find((x) => x.text === 'Keeping it, then.');
  assert.ok(kept, 'exact copy: "Keeping it, then."');
  assert.equal(kept.sender, 'Late Benny');
  // Once.
  mod.update(0.5, h.state);
  assert.equal(eventsOf(h.bus, PL_126_KEPT_EVENT).length, 1);
  // Hand it back: stop at the bus and release the hat at rest.
  player.vel = { x: 0, z: 0 };
  hat.vel = { x: 0, z: 0 };
  mod.update(0.5, h.state);
  assert.equal(eventsOf(h.bus, PL_126_RETURNED_EVENT).length, 1, 'hand-back');
  assert.equal(hat.data.plantsPl126BennyDashRide, true);
  assert.equal(String(bus.data.scanLabel).includes('hat on the dash'), true, 'always know where the bus is');
  mod.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-175 First ----------

test('PL-175 beat J.C. to a place you both marked: your tag, J.C. small underneath', () => {
  const h = harness({ state: { simTime: 0, world: { currentSectorId: 'sector_tethys_junction' } } });
  const mod = pl175First;
  mod.init(h);
  const circuit = circuitFor('sector_tethys_junction');
  // Mark a place on J.C.'s circuit (the second waypoint).
  h.bus.emit('beacon:deployed', { id: 'beacon1', pos: { x: circuit[1].x, z: circuit[1].z } });
  const player = h.state.entities.get(7);
  // J.C. runs toward the mark; let it arm, then keep away.
  let armedTick = -1;
  for (let i = 0; i < 60 * 40; i++) {
    h.state.simTime += 1 / 60;
    mod.update(1 / 60, h.state);
    if (armedTick < 0 && h.bus.log.some((e) => e.type === PL_175_TAGGED_EVENT || e.type === PL_175_JUNO_FIRST_EVENT)) {
      armedTick = i;
      break;
    }
  }
  // With the player far away, J.C. takes the mark: no tag, one juno-first receipt.
  assert.equal(eventsOf(h.bus, PL_175_JUNO_FIRST_EVENT).length, 1, 'J.C. was first');
  assert.equal(eventsOf(h.bus, PL_175_FIRST_EVENT).length, 0);
  // Again: mark the waypoint and BE there before J.C. arrives.
  const h2 = harness({ state: { simTime: 0, world: { currentSectorId: 'sector_tethys_junction' } } });
  const mod2 = pl175First;
  mod2.init(h2);
  const c2 = circuitFor('sector_tethys_junction');
  h2.bus.emit('beacon:deployed', { id: 'beacon2', pos: { x: c2[1].x, z: c2[1].z } });
  const p2 = h2.state.entities.get(7);
  p2.pos.x = c2[1].x;
  p2.pos.z = c2[1].z;
  let done = false;
  for (let i = 0; i < 60 * 40 && !done; i++) {
    h2.state.simTime += 1 / 60;
    mod2.update(1 / 60, h2.state);
    done = eventsOf(h2.bus, PL_175_FIRST_EVENT).length > 0;
  }
  assert.ok(done, 'you beat J.C. to the place you both marked');
  const tag = h2.helpers.spawned.find((e) => e.data.plantsPl175Tag === true);
  assert.ok(tag, 'the wall reads your tag');
  assert.equal(tag.data.swarmFloorPad.label, 'First \u00b7 J.C. small under');
  assert.ok(eventsOf(h2.bus, PL_175_TAGGED_EVENT).length === 1);
  // Leave it as is; or add the plus yourself: dwell beside the tag.
  advanceWith(h2.state, mod2, 5, 0.5);
  assert.equal(tag.data.swarmFloorPad.label, 'First + \u00b7 J.C. under', 'the plus, added by dwelling');
  assert.equal(eventsOf(h2.bus, PL_175_PLUS_EVENT).length, 1);
  mod.destroy();
  mod2.destroy();
  assertNoListeners(h2.bus);
});

// ---------- PL-195 The fixed X ----------

test('PL-195 the fixed X never moves, and looking shows nothing, at first', () => {
  const h = harness({ state: { simTime: 0 } });
  const mod = pl195FixedX;
  mod.init(h);
  mod.update(0.5, h.state);
  const x = h.helpers.spawned.find((e) => e.data.plantsPl195X === true);
  assert.ok(x, 'the X stands');
  const spot = fixedXPosition('sector_tethys_junction');
  assert.equal(x.pos.x, spot.x);
  assert.equal(x.pos.z, spot.z);
  // Never moves: shove it, it returns.
  x.pos.x += 9;
  mod.update(0.5, h.state);
  assert.equal(x.pos.x, spot.x, 'snapped back — it never moves');
  // Go and look.
  const player = h.state.entities.get(7);
  player.pos.x = spot.x + 5;
  player.pos.z = spot.z;
  mod.update(0.5, h.state);
  assert.equal(eventsOf(h.bus, PL_195_LOOKED_EVENT).length, 1);
  assert.ok(popups(h.bus).some((p) => p.text === 'Nothing, at first.'));
  // Immediate re-look is silent.
  mod.update(0.5, h.state);
  assert.equal(eventsOf(h.bus, PL_195_LOOKED_EVENT).length, 1);
  // Leave and come back after the gap: you may look again.
  player.pos.x = spot.x + 400;
  mod.update(0.5, h.state);
  h.state.simTime += 25;
  player.pos.x = spot.x + 5;
  mod.update(0.5, h.state);
  assert.equal(eventsOf(h.bus, PL_195_LOOKED_EVENT).length, 2);
  mod.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-196 Ahead of you ----------

test('PL-196 the mirror rock wears your marks and one more; catch up and it owes you nothing', () => {
  const h = harness({ state: { simTime: 0, world: { currentSectorId: MIRROR_ROCK_TUNING.sectorId } } });
  const mod = pl196MirrorRock;
  mod.init(h);
  // Wear three marks.
  h.bus.emit('beacon:deployed', { id: 'b1', pos: { x: 5, z: 5 } });
  h.bus.emit('beacon:deployed', { id: 'b2', pos: { x: 6, z: 5 } });
  h.bus.emit('claim:claimed', { body: { id: 'b1', x: 0, z: 0 } });
  mod.update(0.5, h.state);
  const rock = h.helpers.spawned.find((e) => e.data.plantsPl196Mirror === true);
  assert.ok(rock, 'the mirror rock staged');
  assert.equal(rock.data.substance, 'crystal', 'honest substitute: crystal face');
  // Approach wearing your marks.
  const player = h.state.entities.get(7);
  player.pos.x = rock.pos.x;
  player.pos.z = rock.pos.z;
  mod.update(0.5, h.state);
  const mirror = eventsOf(h.bus, PL_196_MIRROR_EVENT)[0];
  assert.ok(mirror, 'the reflection beat');
  assert.equal(mirror.marks, 3);
  assert.equal(mirror.reflected, 4, 'one more you have not earned yet');
  // Exit, earn the fourth mark, come back: caught up.
  player.pos.x = rock.pos.x + MIRROR_ROCK_TUNING.mirrorRadiusWu + MIRROR_ROCK_TUNING.exitHysteresisWu + 10;
  mod.update(0.5, h.state);
  h.state.simTime += MIRROR_ROCK_TUNING.catchCooldownS + 1;
  h.bus.emit('beacon:deployed', { id: 'b3', pos: { x: 7, z: 5 } });
  player.pos.x = rock.pos.x;
  player.pos.z = rock.pos.z;
  mod.update(0.5, h.state);
  assert.equal(eventsOf(h.bus, PL_196_CAUGHT_EVENT).length, 1, 'caught up');
  assert.ok(popups(h.bus).some((p) => p.text.includes('owes you nothing')));
  // ...and it is one ahead again.
  player.pos.x = rock.pos.x + MIRROR_ROCK_TUNING.mirrorRadiusWu + MIRROR_ROCK_TUNING.exitHysteresisWu + 10;
  mod.update(0.5, h.state);
  h.state.simTime += MIRROR_ROCK_TUNING.catchCooldownS + 1;
  player.pos.x = rock.pos.x;
  player.pos.z = rock.pos.z;
  mod.update(0.5, h.state);
  const again = eventsOf(h.bus, PL_196_MIRROR_EVENT).length;
  assert.equal(again, 2, 'one more you have not earned yet, again');
  mod.destroy();
  assertNoListeners(h.bus);
});

// ---------- determinism smoke ----------

test('determinism: the same scenario yields byte-identical event streams', () => {
  const run = () => {
    const h = harness({ state: { simTime: 0 } });
    const caller = pl146FirstCaller;
    const part = pl147FirstPart;
    caller.init(h);
    part.init(h);
    h.bus.emit('claim:claimed', { body: { id: 'b1', x: 12, z: 34 } });
    h.bus.emit('claim:moduleBuilt', { bodyId: 'b1', modId: 'works_smelter' });
    h.state.simTime = NIGHT;
    caller.update(0.5, h.state);
    advance(h.state, 3, 0.5);
    part.update(0.5, h.state);
    const stream = h.bus.log.map((e) => JSON.stringify({ t: e.type, p: e.payload }));
    caller.destroy();
    part.destroy();
    return stream;
  };
  const a = run();
  const b = run();
  assert.deepEqual(b, a, 'same inputs, same outputs, no ambient randomness');
  assert.ok(a.length >= 3);
});

// ---------- destroy cleanup across the set ----------

test('destroy() leaves no listeners for every module in the set', () => {
  const mods = [
    pl146FirstCaller, pl147FirstPart, pl148TheCount, pl149SeedlingLean, pl150ItsSpot,
    pl151NoPapers, pl152TheTally, pl153TheMinute, pl252RegularsHour, pl253WallDent,
    pl104Inventory, pl155FairTrade, pl248CrossingShadow, pl124ParkedLight, pl125UnderPaint,
    pl126KeepingIt, pl175First, pl195FixedX, pl196MirrorRock,
  ];
  for (const mod of mods) {
    const h = harness({ state: { simTime: 1, world: { currentSectorId: 'sector_tethys_junction' } } });
    mod.init(h);
    assert.ok(h.bus.types().length > 0, `${mod.name} subscribed to something`);
    mod.destroy();
    assertNoListeners(h.bus);
  }
});


test('PL-151 new game resets the session and keeps its listeners alive', () => {
  const { state, bus, helpers } = harness();
  const plant = Object.create(pl151NoPapers);
  plant.init({ state, bus, helpers });
  try {
    for (const event of ['game:new', 'game:newGame']) {
      bus.emit('claim:moduleBuilt', {});
      assert.equal(plant._modulesBuilt, 1);
      bus.emit(event, {});
      assert.equal(plant._modulesBuilt, 0, `${event} clears the old session`);
      assert.equal(bus.count('claim:moduleBuilt'), 1, `${event} retains the listener`);
    }
    bus.emit('claim:moduleBuilt', {});
    state.simTime = NO_PAPERS_TUNING.firstHailDelayS + 1;
    plant.update(1 / 60, state);
    assert.equal(eventsOf(bus, PL_151_HAIL_EVENT).length, 1, 'new session still hails');
  } finally {
    plant.destroy();
  }
  assert.equal(bus.count('claim:moduleBuilt'), 0, 'real teardown unsubscribes');
});
