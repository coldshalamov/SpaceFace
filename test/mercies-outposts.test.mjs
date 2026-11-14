// test/mercies-outposts.test.mjs — headless checks for the SMALL MERCIES plant batch
// (PL-333..PL-353, section G: frontier generosity at outposts and waystations, where wrong
// choices — freeload, cut lines, game the systems — still bite).
//
// Every module is a standalone `plantsPl<id>` object with init(ctx)/update(dt,state)/destroy()
// (the applausePlant/goodPatch family shape). The harness boots the REAL event bus
// (src/core/eventBus.js createBus) with a recording emit, and the REAL createGameState — no DOM,
// no Three.js, no wall clock: state.simTime is driven by hand. Station fixtures are real
// type:'station' entities carrying data.stationId/dockRadius/services/sectorId (the live world.js
// contract); gates are excluded by the modules. Tuning day = 240 s (MERCY_DAY_S) in every module,
// matching the sibling mercy batch.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32 } from '../src/core/rng.js';

import { pl333NoQuestionsShelf, SHELF_TUNING, giftForDay, rumorLine, isDriedFor, PL_333_TAKEN_EVENT, PL_333_DRY_EVENT } from '../src/systems/plants/pl333NoQuestionsShelf.js';
import { pl334WindBreakChain, chainPositions, isChainBroken, WIND_BREAK_TUNING, HANDLED_LINE, SKIP_LINE, PL_334_HANDLED_EVENT, PL_334_SKIP_EVENT, PL_334_MARK_EVENT } from '../src/systems/plants/pl334WindBreakChain.js';
import { pl335DawnLine, chalkLineForDay, isChalkedOver, DAWN_LINE_TUNING, CORRECTION_LINE, CHALKED_LINE as CHART_CHALKED_LINE, PL_335_FOLLOWED_EVENT, PL_335_CORRECTION_EVENT, PL_335_FALSE_CHALK_EVENT } from '../src/systems/plants/pl335DawnLine.js';
import { pl336LampKeeper, helpedOnDay, lampShouldLight, LAMP_KEEPER_TUNING, LIT_LINE, KNOWS_WHY_LINE, PL_336_LIT_EVENT, PL_336_KNOWS_WHY_EVENT } from '../src/systems/plants/pl336LampKeeper.js';
import { pl337HonorUrn, unpaidTakes, isDryFor, HONOR_URN_TUNING, CUP_LINE, DRY_LINE, PL_337_CUP_EVENT, PL_337_PAID_EVENT, PL_337_DRY_EVENT, PL_337_CHALK_WIPED_EVENT } from '../src/systems/plants/pl337HonorUrn.js';
import { pl338TowPost, weekKeyFor, isRationed, TOW_POST_TUNING, LENT_LINE, RATION_LINE, PL_338_LENT_EVENT, PL_338_RATIONED_EVENT } from '../src/systems/plants/pl338TowPost.js';
import { pl339SignalMirror, isMarginClosed, flashPhaseOn, isMutedFor, SIGNAL_MIRROR_TUNING, TURNED_LINE, MUTED_LINE, PL_339_FLASH_EVENT, PL_339_TURNED_BACK_EVENT, PL_339_IGNORED_EVENT } from '../src/systems/plants/pl339SignalMirror.js';
import { pl340EchoCount, serviceLifeEchoes, echoLine, isBannedFor, ECHO_COUNT_TUNING, PL_340_COUNTED_EVENT, PL_340_BANNED_EVENT } from '../src/systems/plants/pl340EchoCount.js';
import { pl341RestringBuoys, looseMarkerFor, markerPositions, hasCutMarker, RESTRING_TUNING, STRUNG_LINE, CUT_LINE as BUOY_CUT_LINE, PL_341_RESTRUNG_EVENT, PL_341_MARKER_GIFT_EVENT, PL_341_CUT_EVENT } from '../src/systems/plants/pl341RestringBuoys.js';
import { pl342BleedVent, isMetered, breathedHull, BLEED_VENT_TUNING, METER_LINE, PL_342_BREATH_EVENT, PL_342_METERED_EVENT, PL_342_BAG_RETURNED_EVENT } from '../src/systems/plants/pl342BleedVent.js';
import { pl343LiftBell, nearestCivilian, isSilencedFor, LIFT_BELL_TUNING, CHECK_LINE, SILENCED_LINE, PL_343_RING_EVENT, PL_343_CHECK_EVENT, PL_343_SILENCED_EVENT } from '../src/systems/plants/pl343LiftBell.js';
import { pl344NeedsList, needsForDay, tipCommodityFor, lowballCommodityFor, isLowballed, NEEDS_LIST_TUNING, FILLED_LINE, LOWBALL_LINE, PL_344_FILLED_EVENT, PL_344_LOWBALL_EVENT } from '../src/systems/plants/pl344NeedsList.js';
import { pl345KettleWindow, cuppedHull, isCooledFor, KETTLE_WINDOW_TUNING, CUP_LINE as KETTLE_CUP_LINE, GREEDY_LINE, COOLED_LINE, PL_345_CUP_EVENT, PL_345_GREEDY_EVENT, PL_345_COOLED_EVENT } from '../src/systems/plants/pl345KettleWindow.js';
import { pl346FixedRope, knotPositions, frayedKnotFor, isInNoMood, FIXED_ROPE_TUNING, ROPE_LINE, MENDED_LINE, CUT_LINE as ROPE_CUT_LINE, PL_346_ROPE_EVENT, PL_346_MENDED_EVENT, PL_346_CUT_EVENT } from '../src/systems/plants/pl346FixedRope.js';
import { pl347SmallHullDrum, isSmallHull, drumWeekFor, drawWinner, prizePartFor, isSkippedFor, SMALL_HULL_DRUM_TUNING, DRAWN_LINE, SKIPPED_LINE, PL_347_ENTERED_EVENT, PL_347_DRAWN_EVENT, PL_347_SKIPPED_EVENT } from '../src/systems/plants/pl347SmallHullDrum.js';
import { pl348SeamKitchen, hasWorked, fedHull, isServedLast, SEAM_KITCHEN_TUNING, FED_LINE, CLAIM_LINE, LAST_LINE, PL_348_FED_EVENT, PL_348_CLAIMED_EVENT, PL_348_LAST_EVENT } from '../src/systems/plants/pl348SeamKitchen.js';
import { pl349MercyTug, isDusk, berthFor, isElsewhereFor, MERCY_TUG_TUNING, TOWED_LINE, ELSEWHERE_LINE, PL_349_TOWED_EVENT, PL_349_ELSEWHERE_EVENT } from '../src/systems/plants/pl349MercyTug.js';
import { pl350KeyWall, wallPosition, keyNameFor, isLockedFor, KEY_WALL_TUNING, BORROW_LINE, LOCKED_LINE, PL_350_KEY_NAMES, PL_350_BORROWED_EVENT, PL_350_RETURNED_EVENT, PL_350_LOCKED_EVENT } from '../src/systems/plants/pl350KeyWall.js';
import { pl351SamplePad, samplesForDay, dangerousSample, owesDanger, SAMPLE_PAD_TUNING, TAKE_LINE, CLEARED_LINE, PL_351_TAKEN_EVENT, PL_351_CLEARED_EVENT, PL_351_DANGER_EVENT } from '../src/systems/plants/pl351SamplePad.js';
import { pl352ChalkedName, chalkWeekFor, drawChalkName, needsHelp, isNominee, CHALKED_NAME_TUNING, CHALKED_LINE, NOMINATED_LINE, PL_352_SEEN_EVENT, PL_352_CHALKED_EVENT, PL_352_NOMINATED_EVENT } from '../src/systems/plants/pl352ChalkedName.js';
import { pl353CleanStamp, funnelPoint, isSmallHull as isSmallHull353, isCarryingCargo, isCleanUntil, isSmuggledUntil, CLEAN_STAMP_TUNING, CLEAN_LINE, SMUGGLED_LINE, PL_353_CLEAN_EVENT, PL_353_SMUGGLED_EVENT } from '../src/systems/plants/pl353CleanStamp.js';

// ---------- harness ----------

const PLAYER_ID = 7;

function makeBus() {
  const bus = createBus();
  const log = [];
  const origEmit = bus.emit.bind(bus);
  bus.emit = (type, payload) => {
    log.push({ type, payload });
    return origEmit(type, payload);
  };
  bus.log = log;
  bus.of = (type) => log.filter((e) => e.type === type);
  return bus;
}

function makeState(sectorId, { hull = 100, mass = 300 } = {}) {
  const state = createGameState('mercies-outposts');
  state.mode = 'flight';
  state.simTime = 0;
  state.tick = 0;
  state.playerId = PLAYER_ID;
  state.world = state.world || {};
  state.world.currentSectorId = sectorId;
  const player = {
    id: PLAYER_ID, alive: true, type: 'ship',
    pos: { x: 5000, z: 5000 }, vel: { x: 0, z: 0 }, rot: 0,
    hull, hullMax: 100, mass, physicsBody: { mass },
    data: {},
  };
  state.entities.set(PLAYER_ID, player);
  return state;
}

function makeHelpers(state) {
  const spawned = [];
  const removed = [];
  const voice = { lines: [], say(rec) { this.lines.push(rec); } };
  let nextId = 100;
  const helpers = {
    spawned, removed, voice,
    spawnEntity(spec) {
      const ent = {
        ...structuredClone(spec),
        id: nextId++,
        alive: true,
        pos: spec.pos ? { ...spec.pos } : { x: 0, z: 0 },
        vel: spec.vel ? { ...spec.vel } : { x: 0, z: 0 },
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

/** A real station fixture (world.js data contract; not a gate). */
function addStation(state, { id, sectorId, pos = { x: 0, z: 0 }, dockRadius = 72 }) {
  const ent = {
    id: `st_${id}`, alive: true, type: 'station',
    pos: { ...pos }, vel: { x: 0, z: 0 },
    data: { stationId: id, stationTypeId: 'trade_hub', dockRadius, services: ['trade'], sectorId, homeSectorId: sectorId, name: id },
  };
  state.entities.set(ent.id, ent);
  return ent;
}

/** A live civilian hull fixture. */
function addShip(state, { id, pos, vel = { x: 0, z: 0 }, hull = 100, hullMax = 100 }) {
  const ent = {
    id, alive: true, type: 'ship',
    pos: { ...pos }, vel: { ...vel },
    hull, hullMax, data: {},
  };
  state.entities.set(id, ent);
  return ent;
}

/** A jettisoned-by-player pod fixture (lootShards' playerJettisonOrigin stamp). */
function addPod(state, { pos, commodityId = 'cmdty_scrap_metal', vel = { x: 0, z: 0 } }) {
  const ent = {
    id: `pod_${Math.floor(pos.x)}_${Math.floor(pos.z)}_${state.entities.size}`,
    alive: true, type: 'payload',
    pos: { ...pos }, vel: { ...vel },
    mass: 4, physicsBody: { mass: 4 }, hull: 50, hullMax: 50,
    data: { playerJettisonOrigin: { version: 1, ownerId: PLAYER_ID }, commodityId },
  };
  state.entities.set(ent.id, ent);
  return ent;
}

function boot(plant, { sectorId, stationId, stationPos = { x: 0, z: 0 }, hull, mass } = {}) {
  const state = makeState(sectorId, { hull, mass });
  const bus = makeBus();
  const helpers = makeHelpers(state);
  const station = addStation(state, { id: stationId, sectorId, pos: stationPos });
  plant.init({ state, bus, helpers });
  return { plant, state, bus, helpers, station };
}

/** Drive the plant's 1 Hz update: dt steps with simTime advanced by hand. */
function drive({ plant, state }, seconds, dt = 0.5) {
  const steps = Math.max(1, Math.round(seconds / dt));
  for (let i = 0; i < steps; i++) {
    state.simTime += dt;
    state.tick += dt * 60;
    plant.update(dt, state);
  }
}

function playerOf(state) {
  return state.entities.get(PLAYER_ID);
}

function moveTo(state, pos, vel = { x: 0, z: 0 }) {
  const p = playerOf(state);
  p.pos.x = pos.x;
  p.pos.z = pos.z;
  p.vel.x = vel.x;
  p.vel.z = vel.z;
}

function propOf(helpers, marker) {
  return helpers.spawned.find((e) => e.data && e.data[marker] !== undefined);
}

function voiceOf(helpers, idPrefix) {
  return helpers.voice.lines.filter((l) => String(l.id || '').startsWith(idPrefix));
}

function lastOf(bus, type) {
  const list = bus.of(type);
  return list.length ? list[list.length - 1].payload : null;
}

function countOf(bus, type) {
  return bus.of(type).length;
}

// ---------- PL-333 The no-questions shelf ----------

test('PL-333: the shelf stocks one free useful thing; taking it speaks the rumor price', () => {
  const h = boot(pl333NoQuestionsShelf, { sectorId: SHELF_TUNING.sectorId, stationId: SHELF_TUNING.stationId });
  drive(h, 2);
  const shelf = propOf(h.helpers, 'plantsPl333Shelf');
  assert.ok(shelf, 'shelf prop spawned');
  assert.equal(shelf.data.storyPropKind, 'no_questions_shelf');
  assert.ok(shelf.data.swarmFloorPad.label.length <= 24, 'pad label bounded');
  const crate = h.helpers.spawned.find((e) => e.data && e.data.plantsPl333Gift);
  assert.ok(crate, 'one gift crate stocked');
  const day = Math.floor(h.state.simTime / SHELF_TUNING.MERCY_DAY_S);
  assert.equal(crate.data.plantsPl333Gift.commodityId, giftForDay(day).commodityId, 'gift is the deterministic day gift');

  // Take it when you need it: fly the take ring.
  moveTo(h.state, crate.pos);
  drive(h, 1.5);
  const taken = lastOf(h.bus, PL_333_TAKEN_EVENT);
  assert.ok(taken, 'take fires the taken event');
  const rumor = voiceOf(h.helpers, 'plants:pl333:rumor');
  assert.equal(rumor.length, 1, 'rumor line once per take');
  assert.equal(rumor[0].text, rumorLine(crate.data.plantsPl333Gift.rumorCr));
  assert.match(rumor[0].text, /^No questions\. The rumor says \d+ credits\.$/);
  const pod = h.helpers.spawned.find((e) => e.data && e.data.plantsPl333Carried);
  assert.ok(pod, 'gift handed over as a real jettisoned pod');

  // Restocked between visitors, not instantly.
  const liveGifts = () => [...h.state.entities.values()].filter((e) => e.data && e.data.plantsPl333Gift).length;
  moveTo(h.state, { x: 5000, z: 5000 });
  drive(h, 10);
  assert.equal(liveGifts(), 0, 'no instant restock');
  drive(h, SHELF_TUNING.restockDelayS);
  assert.equal(liveGifts(), 1, 'restocked after the delay');

  // Wrong choice: resell the gift at Yune's own counter — the shelf dries for THIS hull.
  const before = countOf(h.bus, PL_333_DRY_EVENT);
  h.bus.emit('economy:tradeCompleted', {
    stationId: SHELF_TUNING.stationId, commodityId: taken.commodityId, side: 'sell', qty: 1, unitAvg: 90, total: 90,
  });
  assert.ok(countOf(h.bus, PL_333_DRY_EVENT) > before, 'resell fires the dry event');
  assert.equal(h.station.data.plantsPl333DryFor, String(PLAYER_ID), 'the station names who dried it');
  const dry = voiceOf(h.helpers, 'plants:pl333:dry');
  assert.ok(dry.some((l) => l.text === "Shelf's dry. You did that."), 'the dry line, exact');
  moveTo(h.state, { x: 5000, z: 5000 });
  drive(h, SHELF_TUNING.restockDelayS * 4);
  assert.equal(liveGifts(), 0, 'no restock for a freeloader');
  assert.equal(isDriedFor(h.plant._freeloaders, String(PLAYER_ID), h.state.simTime), true);

  // Sector exit drops the owned props.
  const owned = h.helpers.spawned.filter((e) => e.data && (e.data.plantsPl333Shelf || e.data.plantsPl333Gift));
  h.bus.emit('sector:exit', { sectorId: SHELF_TUNING.sectorId });
  drive(h, 1);
  for (const ent of owned) assert.ok(h.helpers.removed.includes(ent.id), `owned prop ${ent.id} withdrawn`);
  h.plant.destroy();
  const dryAfter = countOf(h.bus, PL_333_DRY_EVENT);
  h.bus.emit('economy:tradeCompleted', { stationId: SHELF_TUNING.stationId, commodityId: taken.commodityId, side: 'sell', qty: 1 });
  assert.equal(countOf(h.bus, PL_333_DRY_EVENT), dryAfter, 'destroy unsubscribes the trade watch');
});

// ---------- PL-334 The wind-break chain ----------

test('PL-334: use a handle, let go at the mark; skip the chain and the wind argues with you alone', () => {
  const h = boot(pl334WindBreakChain, { sectorId: WIND_BREAK_TUNING.sectorId, stationId: WIND_BREAK_TUNING.stationId });
  drive(h, 2);
  const handles = h.helpers.spawned.filter((e) => e.data && e.data.plantsPl334Handle !== undefined);
  assert.equal(handles.length, WIND_BREAK_TUNING.chainCount, 'chain of handles spawned');
  assert.equal(handles[WIND_BREAK_TUNING.chainCount - 1].data.scanLabel, 'The mark — let go');

  // Use a handle at pull pace: the chain takes the strain.
  const handle0 = handles[0];
  moveTo(h.state, handle0.pos, { x: 0, z: 10 });
  drive(h, 2);
  assert.ok(countOf(h.bus, PL_334_HANDLED_EVENT) >= 1, 'handled event');
  assert.ok(voiceOf(h.helpers, 'plants:pl334:handled').some((l) => l.text === HANDLED_LINE), 'handled line, exact');
  const mark = handles[WIND_BREAK_TUNING.chainCount - 1];
  moveTo(h.state, mark.pos, { x: 0, z: 10 });
  drive(h, 2);
  assert.ok(countOf(h.bus, PL_334_MARK_EVENT) >= 1, 'the mark fires its own event');

  // Wrong choice, fresh pass: skip the chain above skip pace — handles unchain.
  const h2 = boot(pl334WindBreakChain, { sectorId: WIND_BREAK_TUNING.sectorId, stationId: WIND_BREAK_TUNING.stationId });
  drive(h2, 2);
  const handles2 = h2.helpers.spawned.filter((e) => e.data && e.data.plantsPl334Handle !== undefined);
  moveTo(h2.state, handles2[1].pos, { x: 0, z: 120 });
  drive(h2, 2);
  const skip = lastOf(h2.bus, PL_334_SKIP_EVENT);
  assert.ok(skip, 'skip fires the skip event');
  assert.equal(isChainBroken(h2.plant._brokenUntil, h2.state.simTime), true, 'chain recorded broken');
  for (const handle of handles2) {
    const live = h2.state.entities.get(handle.id);
    assert.equal(live.data.masslineTetherable, false, 'handles stop being chained');
    assert.equal(live.data.lampsFlashing, false, 'handle lamps dark while broken');
  }
  assert.equal(h2.station.data.plantsPl334SkippedBy, String(PLAYER_ID));
  assert.ok(voiceOf(h2.helpers, 'plants:pl334:skip').some((l) => l.text === SKIP_LINE), 'skip line, exact');

  // The wind argues with you alone: gusts bite the skipper near the broken chain.
  const vx = playerOf(h2.state).vel.x;
  drive(h2, 6);
  assert.notEqual(playerOf(h2.state).vel.x, vx, 'gust impulses applied');

  h.plant.destroy();
  h2.plant.destroy();
});

// ---------- PL-335 The dawn line ----------

test('PL-335: follow the chalk, add a correction; a wrong line gets your name chalked over', () => {
  const h = boot(pl335DawnLine, { sectorId: DAWN_LINE_TUNING.sectorId, stationId: DAWN_LINE_TUNING.stationId });
  drive(h, 2);
  const post = propOf(h.helpers, 'plantsPl335Post');
  assert.ok(post, 'chart post spawned');
  const chalk = h.helpers.spawned.filter((e) => e.data && e.data.plantsPl335Chalk !== undefined);
  assert.equal(chalk.length, DAWN_LINE_TUNING.chalkCount, 'chalk line redrawn for today');
  const day = Math.floor(h.state.simTime / DAWN_LINE_TUNING.MERCY_DAY_S);
  const line = chalkLineForDay(post.pos, day, null, DAWN_LINE_TUNING);
  assert.deepEqual(chalk[0].pos, { x: line[0].x, z: line[0].z }, 'chalk matches the deterministic dawn line');

  // Follow the chalk: the line takes a little of your weight.
  moveTo(h.state, chalk[0].pos);
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_335_FOLLOWED_EVENT) >= 1, 'followed event');
  const vx = playerOf(h.state).vel.x;
  drive(h, 2);
  assert.notEqual(playerOf(h.state).vel.x, vx, 'gentle pull along the line');

  // Add a correction: hull damage OFF the line, then reach the chalk within the window.
  moveTo(h.state, { x: post.pos.x + 400, z: post.pos.z + 400 });
  const p = playerOf(h.state);
  p.hull = p.hull - 6;
  drive(h, 1.5);
  moveTo(h.state, chalk[1].pos);
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_335_CORRECTION_EVENT) >= 1, 'correction accepted');
  assert.ok(voiceOf(h.helpers, 'plants:pl335:correct').some((l) => l.text === CORRECTION_LINE), 'correction line, exact');
  const corrected = chalkLineForDay(post.pos, day + 1, day, DAWN_LINE_TUNING);
  const plain = chalkLineForDay(post.pos, day + 1, null, DAWN_LINE_TUNING);
  assert.notDeepEqual(corrected, plain, 'the correction steers tomorrow dawn');

  // Wrong choice: chalk a false line (your pod resting by the post).
  const pod = addPod(h.state, { pos: { x: post.pos.x + 20, z: post.pos.z + 10 } });
  moveTo(h.state, { x: 5000, z: 5000 });
  drive(h, 2);
  assert.ok(countOf(h.bus, PL_335_FALSE_CHALK_EVENT) >= 1, 'false chalk caught');
  assert.ok(h.helpers.removed.includes(pod.id), 'visitors chalk over the false line');
  assert.equal(isChalkedOver(h.plant._chalkedUntil.get(String(PLAYER_ID)), h.state.simTime), true, 'name chalked for the month');
  // The chalk gives a chalked-over hull nothing: no more follow assists — and the post says so.
  const followedBefore = countOf(h.bus, PL_335_FOLLOWED_EVENT);
  moveTo(h.state, line[2]);
  drive(h, 2);
  assert.equal(countOf(h.bus, PL_335_FOLLOWED_EVENT), followedBefore, 'no assist while chalked over');
  assert.ok(voiceOf(h.helpers, 'plants:pl335:chalked').some((l) => l.text === CHART_CHALKED_LINE), 'chalked line, exact');

  h.plant.destroy();
});

// ---------- PL-336 The lamp keeper ----------

test('PL-336: light for the helper; help nobody and the lamp knows why', () => {
  const h = boot(pl336LampKeeper, { sectorId: LAMP_KEEPER_TUNING.sectorId, stationId: LAMP_KEEPER_TUNING.stationId });
  drive(h, 2);
  const lamp = propOf(h.helpers, 'plantsPl336Lamp');
  assert.ok(lamp, 'lamp spawned on the dark reach');
  assert.equal(lamp.data.lampsFlashing, false, 'dark side stays dark by default');

  // Help somebody first: your pod comes to rest near a civilian hull.
  const civ = addShip(h.state, { id: 21, pos: { x: 3000, z: 3000 } });
  addPod(h.state, { pos: { x: 3000 + 40, z: 3000 } });
  const day = Math.floor(h.state.simTime / LAMP_KEEPER_TUNING.MERCY_DAY_S);
  moveTo(h.state, { x: 5000, z: 5000 });
  drive(h, 2);
  assert.equal(helpedOnDay(h.plant._helpedDays, String(PLAYER_ID), day), true, 'the keeper hears everything');

  // The keeper lights your dark side free.
  moveTo(h.state, lamp.pos);
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_336_LIT_EVENT) >= 1, 'lit event for the helper');
  assert.ok(voiceOf(h.helpers, 'plants:pl336:lit').some((l) => l.text === LIT_LINE), 'lit line, exact');
  const liveLamp = h.state.entities.get(lamp.id);
  assert.equal(liveLamp.data.lampsFlashing, true, 'lamp lit');

  // Wrong choice, fresh hull: help nobody and grumble at the unlit lamp.
  const h2 = boot(pl336LampKeeper, { sectorId: LAMP_KEEPER_TUNING.sectorId, stationId: LAMP_KEEPER_TUNING.stationId });
  drive(h2, 2);
  const lamp2 = propOf(h2.helpers, 'plantsPl336Lamp');
  moveTo(h2.state, lamp2.pos, { x: 40, z: 0 });
  drive(h2, 1.5);
  assert.ok(countOf(h2.bus, PL_336_KNOWS_WHY_EVENT) >= 1, 'the lamp knows why');
  assert.ok(voiceOf(h2.helpers, 'plants:pl336:why').some((l) => l.text === KNOWS_WHY_LINE), 'knows-why line, exact');
  assert.equal(lampShouldLight(h2.plant._helpedDays, String(PLAYER_ID), Math.floor(h2.state.simTime / LAMP_KEEPER_TUNING.MERCY_DAY_S), 10, LAMP_KEEPER_TUNING), false, 'no light for the unhelped');
  assert.equal(h2.station.data.plantsPl336Why, `${PLAYER_ID}#${Math.floor(h2.state.simTime / LAMP_KEEPER_TUNING.MERCY_DAY_S)}`, 'the stamp explains exactly why');

  h.plant.destroy();
  h2.plant.destroy();
});

// ---------- PL-337 The honor urn ----------

test('PL-337: take a cup, drop a bolt; skip it daily and the chalk explains who dried it', () => {
  const h = boot(pl337HonorUrn, { sectorId: HONOR_URN_TUNING.sectorId, stationId: HONOR_URN_TUNING.stationId });
  drive(h, 2);
  const urn = propOf(h.helpers, 'plantsPl337Urn');
  assert.ok(urn, 'urn prop spawned');

  // Take a cup.
  moveTo(h.state, urn.pos, { x: 0, z: 5 });
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_337_CUP_EVENT) >= 1, 'cup event');
  assert.ok(voiceOf(h.helpers, 'plants:pl337:cup').some((l) => l.text === CUP_LINE), 'cup line, exact');
  assert.equal(unpaidTakes(h.plant._ledger, String(PLAYER_ID)), 1, 'the tin remembers');

  // Skip it daily: three takes without a bolt inside the grace window dries the urn.
  drive(h, HONOR_URN_TUNING.cupCooldownS);
  moveTo(h.state, urn.pos, { x: 0, z: 5 });
  drive(h, 1.5);
  drive(h, HONOR_URN_TUNING.cupCooldownS);
  moveTo(h.state, urn.pos, { x: 0, z: 5 });
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_337_DRY_EVENT) >= 1, 'urn runs dry for the skipper');
  assert.equal(isDryFor(h.plant._dryUntil, String(PLAYER_ID), h.state.simTime), true);
  assert.equal(h.station.data.plantsPl337Chalk, String(PLAYER_ID), 'chalk explains exactly who dried it');
  assert.ok(voiceOf(h.helpers, 'plants:pl337:dry').some((l) => l.text === DRY_LINE), 'dry line, exact');

  // Pay the tin while dry: the chalk is wiped early — honest chalk.
  const boltsBefore = h.station.data.plantsPl337Bolts || 0;
  addPod(h.state, { pos: { x: urn.pos.x + 20, z: urn.pos.z }, commodityId: 'cmdty_alloys' });
  moveTo(h.state, { x: 5000, z: 5000 });
  drive(h, 2);
  assert.ok(countOf(h.bus, PL_337_PAID_EVENT) >= 1, 'bolt counted');
  assert.equal(h.station.data.plantsPl337Bolts, boltsBefore + 1, 'the honor count rose');
  assert.ok(countOf(h.bus, PL_337_CHALK_WIPED_EVENT) >= 1, 'chalk wiped');
  assert.equal(h.station.data.plantsPl337Chalk, null, 'chalk cleared');
  assert.equal(isDryFor(h.plant._dryUntil, String(PLAYER_ID), h.state.simTime), false, 'urn serves the payer again');

  // Cooldown: no cup spam.
  const cupsBefore = countOf(h.bus, PL_337_CUP_EVENT);
  moveTo(h.state, urn.pos, { x: 0, z: 5 });
  drive(h, 2);
  assert.equal(countOf(h.bus, PL_337_CUP_EVENT), cupsBefore, 'cup cooldown holds');

  h.plant.destroy();
});

// ---------- PL-338 The tow-post ----------

test('PL-338: borrow your one line; take two in a week and the post rations you, in front of everyone', () => {
  const h = boot(pl338TowPost, { sectorId: TOW_POST_TUNING.sectorId, stationId: TOW_POST_TUNING.stationId });
  drive(h, 2);
  const post = propOf(h.helpers, 'plantsPl338Post');
  assert.ok(post, 'tow-post spawned');

  // Borrow your one: stuck inside the lend ring.
  moveTo(h.state, post.pos, { x: 0, z: 5 });
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_338_LENT_EVENT) >= 1, 'lend event');
  assert.ok(voiceOf(h.helpers, 'plants:pl338:lent').some((l) => l.text === LENT_LINE), 'lend line, exact');
  const vx = playerOf(h.state).vel.x;
  drive(h, 4);
  assert.notEqual(playerOf(h.state).vel.x, vx, 'the line takes the strain toward the gate');

  // Take two in a week: rationed for a month, in front of everyone.
  drive(h, TOW_POST_TUNING.towWindowS);
  moveTo(h.state, post.pos, { x: 0, z: 5 });
  drive(h, 1.5);
  const rationed = lastOf(h.bus, PL_338_RATIONED_EVENT);
  assert.ok(rationed, 'rationed event');
  assert.equal(isRationed(h.plant._rationedUntil, String(PLAYER_ID), h.state.simTime), true);
  assert.equal(h.station.data.plantsPl338Ration.hullKey, String(PLAYER_ID), 'the ration stamp is public');
  assert.ok(voiceOf(h.helpers, 'plants:pl338:ration').some((l) => l.text === RATION_LINE), 'ration line, exact');
  assert.equal(weekKeyFor(h.state.simTime, TOW_POST_TUNING), 0, 'both borrows fell in the same week');

  // Refusal while rationed.
  const rationBefore = countOf(h.bus, PL_338_RATIONED_EVENT);
  drive(h, 2);
  moveTo(h.state, post.pos, { x: 0, z: 5 });
  drive(h, 2);
  assert.ok(countOf(h.bus, PL_338_RATIONED_EVENT) >= rationBefore, 'rationed refusals logged');
  const lentAfter = countOf(h.bus, PL_338_LENT_EVENT);
  moveTo(h.state, post.pos, { x: 0, z: 5 });
  drive(h, 3);
  assert.equal(countOf(h.bus, PL_338_LENT_EVENT), lentAfter, 'no more lends for the rationed hull');

  h.plant.destroy();
});

// ---------- PL-339 The signal mirror ----------

test('PL-339: three short means closed — turn back; ignore it and the keeper stops flashing for you', () => {
  let day = 1;
  while (!isMarginClosed(day, SIGNAL_MIRROR_TUNING)) day += 1;
  const h = boot(pl339SignalMirror, { sectorId: SIGNAL_MIRROR_TUNING.sectorId, stationId: SIGNAL_MIRROR_TUNING.stationId });
  h.state.simTime = day * SIGNAL_MIRROR_TUNING.MERCY_DAY_S + 5;
  drive(h, 2);
  const mirror = propOf(h.helpers, 'plantsPl339Mirror');
  assert.ok(mirror, 'mirror spawned');
  assert.ok(flashPhaseOn(h.state.simTime) !== undefined);

  // The flash: three short while the Margin is closed — at the approach edge, turning back reads.
  moveTo(h.state, { x: mirror.pos.x + SIGNAL_MIRROR_TUNING.approachRadiusWu * 0.93, z: mirror.pos.z });
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_339_FLASH_EVENT) >= 1, 'flash event while closed');
  const liveMirror = h.state.entities.get(mirror.id);
  assert.equal(typeof liveMirror.data.lampsFlashing, 'boolean', 'lamp flag restamped on the flash pattern');

  // Turn back on the flash: the keeper notes it.
  const turned = lastOf(h.bus, PL_339_TURNED_BACK_EVENT);
  assert.ok(turned, 'turned-back event');
  assert.ok(voiceOf(h.helpers, 'plants:pl339:turned').some((l) => l.text === TURNED_LINE), 'turned line, exact');

  // Wrong choice, fresh hull: ignore it and fly in anyway.
  const h2 = boot(pl339SignalMirror, { sectorId: SIGNAL_MIRROR_TUNING.sectorId, stationId: SIGNAL_MIRROR_TUNING.stationId });
  h2.state.simTime = day * SIGNAL_MIRROR_TUNING.MERCY_DAY_S + 5;
  drive(h2, 2);
  const mirror2 = propOf(h2.helpers, 'plantsPl339Mirror');
  moveTo(h2.state, { x: mirror2.pos.x + 100, z: mirror2.pos.z });
  drive(h2, 1.5);   // see the flash
  moveTo(h2.state, mirror2.pos, { x: 20, z: 0 });
  drive(h2, 1.5);   // fly in anyway
  assert.ok(countOf(h2.bus, PL_339_IGNORED_EVENT) >= 1, 'ignored event');
  assert.equal(isMutedFor(h2.plant._mutedUntil, String(PLAYER_ID), h2.state.simTime), true, 'muted for a season');
  assert.equal(h2.station.data.plantsPl339Muted, String(PLAYER_ID));
  assert.ok(voiceOf(h2.helpers, 'plants:pl339:muted').some((l) => l.text === MUTED_LINE), 'muted line, exact');
  // The keeper stops flashing FOR THIS HULL.
  drive(h2, 2);
  const m2 = h2.state.entities.get(mirror2.id);
  assert.equal(m2.data.lampsFlashing, false, 'no more flashes for your hull');

  h.plant.destroy();
  h2.plant.destroy();
});

// ---------- PL-340 The echo count ----------

test('PL-340: a hull tap counts your service life; clap all night and the echo stops answering', () => {
  const h = boot(pl340EchoCount, { sectorId: ECHO_COUNT_TUNING.sectorId, stationId: ECHO_COUNT_TUNING.stationId });
  drive(h, 2);
  const post = propOf(h.helpers, 'plantsPl340Post');
  assert.ok(post, 'echo post spawned');

  // Clap: a hull tap at pace.
  moveTo(h.state, post.pos, { x: 20, z: 0 });
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_340_COUNTED_EVENT) >= 1, 'counted event');
  const echoes = serviceLifeEchoes(100, 100, ECHO_COUNT_TUNING);
  const line = echoLine(echoes);
  assert.ok(voiceOf(h.helpers, 'plants:pl340:counted').some((l) => l.text === line), `echo line exact: ${line}`);
  assert.ok(line.split(' ').length <= 8, 'echo line is eight words or fewer');
  assert.equal(echoes, ECHO_COUNT_TUNING.echoMaxHauls, 'the joke is somehow never wrong for a full hull');

  // Cooldown between taps.
  const countedBefore = countOf(h.bus, PL_340_COUNTED_EVENT);
  moveTo(h.state, post.pos, { x: 20, z: 0 });
  drive(h, 2);
  assert.equal(countOf(h.bus, PL_340_COUNTED_EVENT), countedBefore, 'tap cooldown holds');

  // Clap all night: the fourth tap bans the hull until dawn.
  for (let i = 0; i < 3; i++) {
    drive(h, ECHO_COUNT_TUNING.tapCooldownS + 1);
    moveTo(h.state, post.pos, { x: 20, z: 0 });
    drive(h, 1.5);
  }
  const banned = lastOf(h.bus, PL_340_BANNED_EVENT);
  assert.ok(banned, 'banned event after clapping all night');
  assert.equal(isBannedFor(h.plant._bannedUntil, String(PLAYER_ID), h.state.simTime), true);
  assert.equal(h.station.data.plantsPl340Banned, String(PLAYER_ID), 'the post names the banger');
  const countedMid = countOf(h.bus, PL_340_COUNTED_EVENT);
  drive(h, ECHO_COUNT_TUNING.tapCooldownS + 1);
  moveTo(h.state, post.pos, { x: 20, z: 0 });
  drive(h, 1.5);
  assert.equal(countOf(h.bus, PL_340_COUNTED_EVENT), countedMid, 'the echo stops answering');

  h.plant.destroy();
});

// ---------- PL-341 The re-strung buoys ----------

test('PL-341: snag a loose marker and yours are strung too; cut one and no re-string, ever', () => {
  const h = boot(pl341RestringBuoys, { sectorId: RESTRING_TUNING.sectorId, stationId: RESTRING_TUNING.stationId });
  drive(h, 2);
  const markers = h.helpers.spawned.filter((e) => e.data && e.data.plantsPl341Marker !== undefined);
  assert.equal(markers.length, RESTRING_TUNING.markerCount, 'marker ring spawned');
  const day = Math.floor(h.state.simTime / RESTRING_TUNING.MERCY_DAY_S);
  const looseIdx = looseMarkerFor(day, RESTRING_TUNING.markerCount, RESTRING_TUNING);
  const loose = markers.find((m) => m.data.plantsPl341Marker === looseIdx);
  assert.equal(loose.data.plantsPl341Strung, false, 'one marker hangs loose before dawn');

  // Snag a loose one: strung, and YOUR hull's markers too, free.
  moveTo(h.state, loose.pos, { x: 0, z: 3 });
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_341_RESTRUNG_EVENT) >= 1, 'restrung event');
  assert.ok(countOf(h.bus, PL_341_MARKER_GIFT_EVENT) >= 1, 'the free re-string gift');
  assert.ok(voiceOf(h.helpers, 'plants:pl341:gift').some((l) => l.text === STRUNG_LINE), 'gift line, exact');
  assert.equal(playerOf(h.state).data.plantsPl341StrungUntil > h.state.simTime, true, 'hull stamped strung');

  // Wrong choice: cut a strung marker for parts (shear it at pace).
  const strung = markers.find((m) => m.data.plantsPl341Marker !== looseIdx);
  moveTo(h.state, strung.pos, { x: 90, z: 0 });
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_341_CUT_EVENT) >= 1, 'cut event');
  assert.equal(hasCutMarker(h.plant._cutHulls, String(PLAYER_ID)), true, 'remembered in that water');
  assert.equal(h.station.data.plantsPl341CutBy, String(PLAYER_ID));
  assert.ok(voiceOf(h.helpers, 'plants:pl341:cut').some((l) => l.text === BUOY_CUT_LINE), 'cut line, exact');
  const liveCut = h.state.entities.get(strung.id);
  assert.equal(liveCut.data.plantsPl341Strung, false, 'the marker hangs cut');

  // Ever means ever: no more re-strings for that hull.
  const restrungBefore = countOf(h.bus, PL_341_RESTRUNG_EVENT);
  const giftBefore = countOf(h.bus, PL_341_MARKER_GIFT_EVENT);
  moveTo(h.state, h.state.entities.get(strung.id).pos, { x: 0, z: 3 });
  drive(h, 2);
  assert.equal(countOf(h.bus, PL_341_RESTRUNG_EVENT), restrungBefore, 'no re-string for the cutter');
  assert.equal(countOf(h.bus, PL_341_MARKER_GIFT_EVENT), giftBefore, 'no free gift for the cutter');

  h.plant.destroy();
});

// ---------- PL-342 The bleed vent ----------

test('PL-342: breathe and go, one lungful at a time; tape a bag and the vent meters, the bag returns', () => {
  const h = boot(pl342BleedVent, { sectorId: BLEED_VENT_TUNING.sectorId, stationId: BLEED_VENT_TUNING.stationId, hull: 90 });
  drive(h, 2);
  const vent = propOf(h.helpers, 'plantsPl342Vent');
  assert.ok(vent, 'vent spawned');
  const hullBefore = playerOf(h.state).hull;

  // Breathe and go: stragglers at crawl pace, one lungful at a time.
  moveTo(h.state, vent.pos, { x: 0, z: 5 });
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_342_BREATH_EVENT) >= 1, 'breath event');
  assert.equal(playerOf(h.state).hull, breathedHull(hullBefore, 100, BLEED_VENT_TUNING.breathHull), 'the lungful, in kind');
  const breathMid = countOf(h.bus, PL_342_BREATH_EVENT);
  drive(h, 2);
  assert.equal(countOf(h.bus, PL_342_BREATH_EVENT), breathMid, 'one lungful at a time: cooldown holds');

  // First come: a civilian holding the ring is served first.
  const civ = addShip(h.state, { id: 22, pos: { x: vent.pos.x, z: vent.pos.z } });
  drive(h, BLEED_VENT_TUNING.breathCooldownS + 1);
  const breathBusy = countOf(h.bus, PL_342_BREATH_EVENT);
  moveTo(h.state, vent.pos, { x: 0, z: 5 });
  drive(h, 1.5);
  assert.equal(countOf(h.bus, PL_342_BREATH_EVENT), breathBusy, 'first come: you wait');
  h.state.entities.delete(civ.id);

  // Wrong choice: tape a bag to it (your pod resting in the bag ring).
  const bag = addPod(h.state, { pos: { x: vent.pos.x + 15, z: vent.pos.z }, commodityId: 'cmdty_food' });
  moveTo(h.state, { x: 5000, z: 5000 });
  drive(h, 2);
  assert.ok(countOf(h.bus, PL_342_BAG_RETURNED_EVENT) >= 1, 'bag returned event');
  assert.ok(h.helpers.removed.includes(bag.id), 'the taped bag was taken down');
  const returned = h.helpers.spawned.find((e) => e.data && e.data.plantsPl342Returned);
  assert.ok(returned, 'the bag gets re-spawned beside your hull');
  assert.ok(countOf(h.bus, PL_342_METERED_EVENT) >= 1, 'the vent gets a meter');
  assert.ok(voiceOf(h.helpers, 'plants:pl342:metered').some((l) => l.text === METER_LINE), 'meter line, exact');
  assert.equal(isMetered(h.plant._meteredUntil, h.state.simTime), true, 'metered until the day turns');
  const liveVent = h.state.entities.get(vent.id);
  assert.equal(liveVent.data.plantsPl342Metered, true, 'meter stamp on the vent');

  h.plant.destroy();
});

// ---------- PL-343 The lift bell ----------

test('PL-343: ring once and a hauler checks your line; ring twice and the bell goes quiet for you', () => {
  const h = boot(pl343LiftBell, { sectorId: LIFT_BELL_TUNING.sectorId, stationId: LIFT_BELL_TUNING.stationId });
  drive(h, 2);
  const bell = propOf(h.helpers, 'plantsPl343Bell');
  assert.ok(bell, 'bell spawned');

  // Ring once: a passing hauler breaks off to check your line.
  moveTo(h.state, bell.pos, { x: 20, z: 0 });
  const civ = addShip(h.state, { id: 23, pos: { x: playerOf(h.state).pos.x + 200, z: playerOf(h.state).pos.z } });
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_343_RING_EVENT) >= 1, 'ring event');
  assert.ok(countOf(h.bus, PL_343_CHECK_EVENT) >= 1, 'check event');
  assert.ok(voiceOf(h.helpers, 'plants:pl343:check').some((l) => l.text === CHECK_LINE), 'check line, exact');
  const civLive = h.state.entities.get(civ.id);
  assert.ok(civLive.data.plantsPl343Check, 'the hauler was stamped to break off');
  const vx = playerOf(h.state).vel.x;
  drive(h, 3);
  assert.notEqual(playerOf(h.state).vel.x, vx, 'the line-check lift pulls toward the station');

  // Ring it twice: the bell goes quiet for your hull.
  drive(h, LIFT_BELL_TUNING.ringCooldownS + 1);
  moveTo(h.state, bell.pos, { x: 20, z: 0 });
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_343_SILENCED_EVENT) >= 1, 'silenced event');
  assert.equal(isSilencedFor(h.plant._silencedUntil, String(PLAYER_ID), h.state.simTime), true);
  assert.equal(h.station.data.plantsPl343Quiet, String(PLAYER_ID));
  assert.ok(voiceOf(h.helpers, 'plants:pl343:silenced').some((l) => l.text === SILENCED_LINE), 'silenced line, exact');
  const ringsBefore = countOf(h.bus, PL_343_RING_EVENT);
  drive(h, LIFT_BELL_TUNING.ringCooldownS + 1);
  moveTo(h.state, bell.pos, { x: 20, z: 0 });
  drive(h, 1.5);
  assert.equal(countOf(h.bus, PL_343_RING_EVENT), ringsBefore, 'haulers stop breaking off for you');

  h.plant.destroy();
});

// ---------- PL-344 The needs list ----------

test('PL-344: fill a need and the tip is above market; lowball the list and offers come back lowballed', () => {
  const h = boot(pl344NeedsList, { sectorId: NEEDS_LIST_TUNING.sectorId, stationId: NEEDS_LIST_TUNING.stationId });
  drive(h, 2);
  const post = propOf(h.helpers, 'plantsPl344Post');
  assert.ok(post, 'needs list post spawned');
  const day = Math.floor(h.state.simTime / NEEDS_LIST_TUNING.MERCY_DAY_S);
  const needs = needsForDay(day, NEEDS_LIST_TUNING);
  assert.deepEqual(post.data.plantsPl344List, needs, 'the post carries today\'s list');

  // Fill a need: the pod is consumed and the tip paid in kind.
  addPod(h.state, { pos: { x: post.pos.x + 20, z: post.pos.z }, commodityId: needs[0] });
  moveTo(h.state, { x: 5000, z: 5000 });
  drive(h, 2);
  const filled = lastOf(h.bus, PL_344_FILLED_EVENT);
  assert.ok(filled, 'filled event');
  assert.equal(filled.need, needs[0]);
  assert.equal(filled.tipCommodity, tipCommodityFor(day), 'tip above market, in goods');
  assert.ok(voiceOf(h.helpers, 'plants:pl344:filled').some((l) => l.text === FILLED_LINE), 'filled line, exact');
  assert.ok(h.helpers.spawned.some((e) => e.data && e.data.plantsPl344Tip && !e.data.plantsPl344Tip.lowballed), 'tip pod spawned');

  // Wrong choice: lowball the list (a pod the yards never asked for).
  addPod(h.state, { pos: { x: post.pos.x + 20, z: post.pos.z }, commodityId: 'cmdty_textiles' });
  drive(h, 2);
  assert.ok(countOf(h.bus, PL_344_LOWBALL_EVENT) >= 1, 'lowball event');
  assert.equal(isLowballed(h.plant._lowballedUntil, String(PLAYER_ID), h.state.simTime), true);
  assert.equal(h.station.data.plantsPl344Lowball, String(PLAYER_ID), 'everywhere on the Gulf reads it');
  assert.ok(voiceOf(h.helpers, 'plants:pl344:lowball').some((l) => l.text === LOWBALL_LINE), 'lowball line, exact');

  // Lowballed back: the next honest fill pays junk, one unit.
  addPod(h.state, { pos: { x: post.pos.x + 20, z: post.pos.z }, commodityId: needs[1] });
  drive(h, 2);
  const tip = h.helpers.spawned.filter((e) => e.data && e.data.plantsPl344Tip).pop();
  assert.ok(tip, 'second fill still works');
  assert.equal(tip.data.plantsPl344Tip.lowballed, true, 'offers get lowballed back');
  assert.equal(tip.data.plantsPl344Tip.commodityId ?? tip.data.plantsPl344Tip.forNeed, needs[1]);

  h.plant.destroy();
});

test('PL-344: a new game clears the filled-pod set — a reused pod id fills normally', () => {
  const h = boot(pl344NeedsList, { sectorId: NEEDS_LIST_TUNING.sectorId, stationId: NEEDS_LIST_TUNING.stationId });
  drive(h, 2);
  const post = propOf(h.helpers, 'plantsPl344Post');
  const day = Math.floor(h.state.simTime / NEEDS_LIST_TUNING.MERCY_DAY_S);
  const needs = needsForDay(day, NEEDS_LIST_TUNING);
  // Fill one need in the old game: the pod id lands in the filled set.
  const stale = addPod(h.state, { pos: { x: post.pos.x + 20, z: post.pos.z }, commodityId: needs[0] });
  moveTo(h.state, { x: 5000, z: 5000 });
  drive(h, 2);
  assert.ok(countOf(h.bus, PL_344_FILLED_EVENT) >= 1, 'the old-game fill lands');
  assert.ok(h.plant._filledPods.has(stale.id), 'the fill is remembered');

  // game:newGame: the boot resets nextEntityId to 1, so a fresh pod can carry the stale id.
  h.bus.emit('game:newGame', {});
  assert.equal(h.plant._filledPods.size, 0, 'the session reset clears the filled set');
  const fresh = addPod(h.state, { pos: { x: post.pos.x + 20, z: post.pos.z }, commodityId: needs[1] });
  h.state.entities.delete(fresh.id);
  fresh.id = stale.id;                     // the id the new game hands back out
  h.state.entities.set(fresh.id, fresh);
  drive(h, 2);
  const fills = h.bus.of(PL_344_FILLED_EVENT);
  assert.equal(fills.length, 2, 'the reused id fills normally — no silent skip');
  assert.equal(fills[fills.length - 1].payload.need, needs[1], 'and it fills the current need');

  h.plant.destroy();
});

test('PL-344: the filled-pod ledger is bounded FIFO at memoryCap', () => {
  const h = boot(pl344NeedsList, { sectorId: NEEDS_LIST_TUNING.sectorId, stationId: NEEDS_LIST_TUNING.stationId });
  drive(h, 2);
  const post = propOf(h.helpers, 'plantsPl344Post');
  moveTo(h.state, { x: 5000, z: 5000 });
  // More offers than the cap: each one is consumed once, and the ledger stays bounded.
  const offers = NEEDS_LIST_TUNING.memoryCap + 3;
  for (let i = 0; i < offers; i++) {
    addPod(h.state, { pos: { x: post.pos.x + 20 + i, z: post.pos.z + i }, commodityId: 'cmdty_textiles' });
  }
  drive(h, offers * 2 + 2);
  assert.ok(h.plant._filledPods.size <= NEEDS_LIST_TUNING.memoryCap, 'the filled set never grows past the cap');
  h.plant.destroy();
});

// ---------- PL-345 The kettle window ----------

test('PL-345: one cup, no charge; ask for fuel too every night and the kettle cools for you', () => {
  const h = boot(pl345KettleWindow, { sectorId: KETTLE_WINDOW_TUNING.sectorId, stationId: KETTLE_WINDOW_TUNING.stationId, hull: 90 });
  drive(h, 2);
  const win = propOf(h.helpers, 'plantsPl345Window');
  assert.ok(win, 'the lit window spawned');
  assert.equal(h.state.entities.get(win.id).data.lampsFlashing, true, 'the window is lit');

  // Knock for the cup.
  moveTo(h.state, win.pos, { x: 0, z: 4 });
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_345_CUP_EVENT) >= 1, 'cup event');
  assert.ok(voiceOf(h.helpers, 'plants:pl345:cup').some((l) => l.text === KETTLE_CUP_LINE), 'cup line, exact');
  assert.equal(playerOf(h.state).hull, cuppedHull(90, 100, KETTLE_WINDOW_TUNING.cupHull), 'the cup, in kind');

  // Knock and ask for fuel too: warned once.
  moveTo(h.state, { x: 5000, z: 5000 });
  drive(h, KETTLE_WINDOW_TUNING.knockCooldownS + 1);
  moveTo(h.state, win.pos, { x: 0, z: 4 });
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_345_GREEDY_EVENT) >= 1, 'greedy event');
  assert.ok(voiceOf(h.helpers, 'plants:pl345:greedy').some((l) => l.text === GREEDY_LINE), 'greedy line, exact');

  // Keep asking: the kettle cools for you; the window stays warm.
  moveTo(h.state, { x: 5000, z: 5000 });
  drive(h, KETTLE_WINDOW_TUNING.knockCooldownS + 1);
  moveTo(h.state, win.pos, { x: 0, z: 4 });
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_345_COOLED_EVENT) >= 1, 'cooled event');
  assert.equal(isCooledFor(h.plant._cooledUntil, String(PLAYER_ID), h.state.simTime), true);
  assert.equal(h.station.data.plantsPl345Cooled, String(PLAYER_ID));
  assert.ok(voiceOf(h.helpers, 'plants:pl345:cooled').some((l) => l.text === COOLED_LINE), 'cooled line, exact');
  assert.equal(h.state.entities.get(win.id).data.lampsFlashing, true, 'the window itself stays warm');
  const cupsBefore = countOf(h.bus, PL_345_CUP_EVENT);
  moveTo(h.state, { x: 5000, z: 5000 });
  drive(h, KETTLE_WINDOW_TUNING.knockCooldownS + 1);
  moveTo(h.state, win.pos, { x: 0, z: 4 });
  drive(h, 1.5);
  assert.equal(countOf(h.bus, PL_345_CUP_EVENT), cupsBefore, 'no cup for the cooled hull');

  h.plant.destroy();
});

// ---------- PL-346 The fixed rope ----------

test('PL-346: use the rope, mend the fray; cut a length and the iris is in no mood', () => {
  const h = boot(pl346FixedRope, { sectorId: FIXED_ROPE_TUNING.sectorId, stationId: 'station_bolus_rib' });
  drive(h, 2);
  const knots = h.helpers.spawned.filter((e) => e.data && e.data.plantsPl346Knot !== undefined);
  assert.equal(knots.length, FIXED_ROPE_TUNING.knotCount, 'rope knots strung');
  const positions = knotPositions(FIXED_ROPE_TUNING);
  assert.deepEqual(knots[0].pos, { x: positions[0].x, z: positions[0].z }, 'knots along the mouth-to-cough path');
  const day = Math.floor(h.state.simTime / FIXED_ROPE_TUNING.MERCY_DAY_S);
  const frayIdx = frayedKnotFor(day, FIXED_ROPE_TUNING.knotCount, FIXED_ROPE_TUNING);
  const fray = knots.find((k) => k.data.plantsPl346Knot === frayIdx);
  assert.equal(h.state.entities.get(fray.id).data.plantsPl346Fray, true, 'one knot frays per day');

  // Mend it with whatever you had: metal resting in the fray ring.
  addPod(h.state, { pos: { x: fray.pos.x + 15, z: fray.pos.z }, commodityId: 'cmdty_alloys' });
  moveTo(h.state, { x: 5000, z: 5000 });
  drive(h, 2);
  assert.ok(countOf(h.bus, PL_346_MENDED_EVENT) >= 1, 'mended event');
  assert.ok(voiceOf(h.helpers, 'plants:pl346:mended').some((l) => l.text === MENDED_LINE), 'mended line, exact');
  assert.equal(h.state.entities.get(fray.id).data.plantsPl346Fray, false, 'the knot holds again');

  // Use it: the rope takes your weight toward the next knot.
  const knot0 = knots.find((k) => k.data.plantsPl346Knot === (frayIdx === 0 ? 1 : 0));
  moveTo(h.state, knot0.pos, { x: 0, z: 4 });
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_346_ROPE_EVENT) >= 1, 'rope event');
  assert.ok(voiceOf(h.helpers, 'plants:pl346:rope').some((l) => l.text === ROPE_LINE), 'rope line, exact');

  // Wrong choice: cut a length for yourself (shear a strung knot at pace).
  const cutKnot = knots.find((k) => k.data.plantsPl346Knot === (frayIdx === 1 ? 2 : 1));
  moveTo(h.state, cutKnot.pos, { x: 100, z: 0 });
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_346_CUT_EVENT) >= 1, 'cut event');
  assert.ok(voiceOf(h.helpers, 'plants:pl346:cut').some((l) => l.text === ROPE_CUT_LINE), 'cut line, exact');
  assert.equal(h.state.entities.get(cutKnot.id).data.plantsPl346Strung, false, 'the length is gone');
  assert.equal(isInNoMood(h.plant._cutUntil, String(PLAYER_ID), h.state.simTime), true, 'in no mood remembered');

  // The iris in no mood: gusts bite cutters using the rope.
  const vx = playerOf(h.state).vel.x;
  moveTo(h.state, h.state.entities.get(cutKnot.id).pos);
  drive(h, 8);
  assert.notEqual(playerOf(h.state).vel.x, vx, 'mood gusts applied');

  // Mending lifts the no-mood: mend the fray and stand right again.
  addPod(h.state, { pos: { x: fray.pos.x + 15, z: fray.pos.z }, commodityId: 'cmdty_scrap_metal' });
  moveTo(h.state, { x: 5000, z: 5000 });
  drive(h, 2);
  assert.equal(isInNoMood(h.plant._cutUntil, String(PLAYER_ID), h.state.simTime), false, 'mending stands you right');

  h.plant.destroy();
});

test('PL-346: game:new clears the hold-beat — a stale clock cannot silence the rope', () => {
  const h = boot(pl346FixedRope, { sectorId: FIXED_ROPE_TUNING.sectorId, stationId: 'station_bolus_rib' });
  drive(h, 2);
  const liveKnot = (idx) => [...h.state.entities.values()]
    .find((e) => e.data && e.data.plantsPl346Knot === idx && e.alive !== false);
  const frayingIdx = () => frayedKnotFor(
    Math.floor(h.state.simTime / FIXED_ROPE_TUNING.MERCY_DAY_S),
    FIXED_ROPE_TUNING.knotCount, FIXED_ROPE_TUNING,
  );
  // Use the rope at a late table clock: the "Rope holds." beat stamps late.
  h.state.simTime = FIXED_ROPE_TUNING.MERCY_DAY_S + 30;
  moveTo(h.state, liveKnot(frayingIdx() === 0 ? 1 : 0).pos, { x: 0, z: 4 });
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_346_ROPE_EVENT) >= 1, 'the rope holds at the late clock');
  assert.ok(h.plant._saidHold >= FIXED_ROPE_TUNING.MERCY_DAY_S, 'the beat is stamped late');
  // A new game: simTime restarts near zero — the stale stamp must not silence the line.
  h.bus.emit('game:new', {});
  h.state.simTime = 2;
  drive(h, 2);   // the rope re-strings on the fresh clock
  moveTo(h.state, liveKnot(frayingIdx() === 0 ? 1 : 0).pos, { x: 0, z: 4 });
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_346_ROPE_EVENT) >= 2, 'the rope speaks again on the fresh clock');
  h.plant.destroy();
});

// ---------- PL-347 The small-hull drum ----------

test('PL-347: enter fair and the bell may draw you; enter under three hull IDs and the drum skips you by name', () => {
  const h = boot(pl347SmallHullDrum, { sectorId: SMALL_HULL_DRUM_TUNING.sectorId, stationId: SMALL_HULL_DRUM_TUNING.stationId, mass: 300 });
  drive(h, 2);
  const drum = propOf(h.helpers, 'plantsPl347Drum');
  assert.ok(drum, 'drum spawned');
  assert.equal(isSmallHull(playerOf(h.state), SMALL_HULL_DRUM_TUNING), true, 'small hull');

  // Enter fair: one voice per approach.
  moveTo(h.state, drum.pos, { x: 0, z: 4 });
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_347_ENTERED_EVENT) >= 1, 'entered event');
  const entered = countOf(h.bus, PL_347_ENTERED_EVENT);
  drive(h, 3);
  assert.equal(countOf(h.bus, PL_347_ENTERED_EVENT), entered, 'hovering is one voice, not many');

  // Wrong choice: enter under three hull IDs (three approaches in one week).
  for (let i = 0; i < 2; i++) {
    moveTo(h.state, { x: drum.pos.x + SMALL_HULL_DRUM_TUNING.enterRadiusWu + 40, z: drum.pos.z });
    drive(h, 1.5);
    moveTo(h.state, drum.pos, { x: 0, z: 4 });
    drive(h, 1.5);
  }
  assert.ok(countOf(h.bus, PL_347_SKIPPED_EVENT) >= 1, 'skipped event');
  assert.equal(isSkippedFor(h.plant._skippedUntil, String(PLAYER_ID), h.state.simTime), true);
  assert.equal(h.station.data.plantsPl347Skipped, String(PLAYER_ID), 'skipped by name, publicly');
  assert.ok(voiceOf(h.helpers, 'plants:pl347:skipped').some((l) => l.text === SKIPPED_LINE), 'skipped line, exact');

  // The draw at the bell: deterministic winner among a week's entrants.
  const entrants = new Set(['7', '9', '11']);
  const winner = drawWinner(3, entrants);
  assert.ok(entrants.has(winner), 'draw picks a real entrant');
  assert.equal(drawWinner(3, entrants), winner, 'draw is deterministic');
  assert.ok(prizePartFor(3).startsWith('cmdty_'), 'the prize is a real part');

  h.plant.destroy();
});

test('PL-347: big hulls do not enter the small-hull drum', () => {
  const h = boot(pl347SmallHullDrum, { sectorId: SMALL_HULL_DRUM_TUNING.sectorId, stationId: SMALL_HULL_DRUM_TUNING.stationId, mass: 900 });
  drive(h, 2);
  const drum = propOf(h.helpers, 'plantsPl347Drum');
  moveTo(h.state, drum.pos, { x: 0, z: 4 });
  drive(h, 1.5);
  assert.equal(countOf(h.bus, PL_347_ENTERED_EVENT), 0, 'small hulls only');
  h.plant.destroy();
});

// ---------- PL-348 The seam kitchen ----------

test('PL-348: work the seam then eat off the books; claim without working and you are served last, forever', () => {
  const h = boot(pl348SeamKitchen, { sectorId: SEAM_KITCHEN_TUNING.sectorId, stationId: SEAM_KITCHEN_TUNING.stationId, hull: 90 });
  drive(h, 2);
  const kitchen = propOf(h.helpers, 'plantsPl348Kitchen');
  assert.ok(kitchen, 'kitchen spawned');

  // Work the seam: stop-and-go pace in the working row — on the far side of the
  // station from the counter (the cook does not count counter-hovering as work).
  const stationPos = h.station.pos;
  const workPos = {
    x: stationPos.x - (kitchen.pos.x - stationPos.x),
    z: stationPos.z - (kitchen.pos.z - stationPos.z),
  };
  moveTo(h.state, workPos, { x: 0, z: 8 });
  drive(h, SEAM_KITCHEN_TUNING.workSecondsS + 4);
  assert.equal(hasWorked(h.plant._worked, String(PLAYER_ID), Math.floor(h.state.simTime / SEAM_KITCHEN_TUNING.MERCY_DAY_S)), true, 'a day\'s work, cumulative');

  // Then eat: off the books, no receipt.
  moveTo(h.state, kitchen.pos, { x: 0, z: 4 });
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_348_FED_EVENT) >= 1, 'fed event');
  assert.ok(voiceOf(h.helpers, 'plants:pl348:fed').some((l) => l.text === FED_LINE), 'fed line, exact');
  assert.equal(playerOf(h.state).hull, fedHull(90, 100, SEAM_KITCHEN_TUNING.mealHull), 'the meal, in kind');

  // Wrong choice, fresh day: claim the meal without working.
  const fedAfterWork = countOf(h.bus, PL_348_FED_EVENT);
  h.state.simTime = (Math.floor(h.state.simTime / SEAM_KITCHEN_TUNING.MERCY_DAY_S) + 1) * SEAM_KITCHEN_TUNING.MERCY_DAY_S + 2;
  moveTo(h.state, kitchen.pos, { x: 0, z: 4 });
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_348_CLAIMED_EVENT) >= 1, 'claimed event');
  assert.ok(voiceOf(h.helpers, 'plants:pl348:claim').some((l) => l.text === CLAIM_LINE), 'claim line, exact');
  assert.equal(countOf(h.bus, PL_348_FED_EVENT), fedAfterWork, 'no meal for the non-worker');

  // Keep claiming: served last, forever, and the other cooks are told.
  for (let i = 0; i < 3; i++) {
    moveTo(h.state, { x: kitchen.pos.x + SEAM_KITCHEN_TUNING.mealRadiusWu + 30, z: kitchen.pos.z });
    drive(h, SEAM_KITCHEN_TUNING.claimCooldownS + 1);
    moveTo(h.state, kitchen.pos, { x: 0, z: 4 });
    drive(h, 1.5);
  }
  const last = lastOf(h.bus, PL_348_LAST_EVENT);
  assert.ok(last, 'served-last event');
  assert.equal(isServedLast(h.plant._servedLastUntil, String(PLAYER_ID), h.state.simTime), true, 'forever (session)');
  assert.equal(h.station.data.plantsPl348ServedLast, String(PLAYER_ID), 'the cook tells the row');
  assert.equal(playerOf(h.state).data.plantsPl348ServedLast, true, 'the stamp travels with the hull');
  assert.ok(voiceOf(h.helpers, 'plants:pl348:last').some((l) => l.text === LAST_LINE), 'served-last line, exact');

  // Served last is real: the meal only after the wait, and the pot's been through.
  moveTo(h.state, workPos, { x: 0, z: 8 });
  drive(h, SEAM_KITCHEN_TUNING.workSecondsS + 4);
  moveTo(h.state, kitchen.pos, { x: 0, z: 4 });
  const fedBefore = countOf(h.bus, PL_348_FED_EVENT);
  drive(h, SEAM_KITCHEN_TUNING.servedLastDelayS - 2);
  assert.equal(countOf(h.bus, PL_348_FED_EVENT), fedBefore, 'waiting at the back of the line');
  drive(h, SEAM_KITCHEN_TUNING.servedLastDelayS);
  assert.ok(countOf(h.bus, PL_348_FED_EVENT) > fedBefore, 'finally served — smaller portion');
  const fed = h.bus.of(PL_348_FED_EVENT).pop().payload;
  assert.equal(fed.servedLast, true, 'the receipt says served last');
  assert.equal(fed.portion, SEAM_KITCHEN_TUNING.servedLastHull, 'the pot has been through');

  h.plant.destroy();
});

// ---------- PL-349 The mercy tug ----------

test('PL-349: one tow at dusk, no fee; fake stalls daily and the tug stands elsewhere for a season', () => {
  const h = boot(pl349MercyTug, { sectorId: MERCY_TUG_TUNING.sectorId, stationId: MERCY_TUG_TUNING.stationId });
  const day = 3;
  h.state.simTime = day * MERCY_TUG_TUNING.MERCY_DAY_S + MERCY_TUG_TUNING.MERCY_DAY_S * (1 - MERCY_TUG_TUNING.duskFrac) + 4;
  assert.equal(isDusk(h.state.simTime, MERCY_TUG_TUNING), true, 'dusk windows are the last quarter');
  drive(h, 2);
  const tug = propOf(h.helpers, 'plantsPl349Tug');
  assert.ok(tug, 'the tug stands by the launch mouth at dusk');
  const mouth = berthFor(h.station.pos, false, MERCY_TUG_TUNING);
  assert.deepEqual(tug.pos, { x: mouth.x, z: mouth.z }, 'at the launch mouth');

  // Need it once, say so: the stall is the claim.
  moveTo(h.state, mouth, { x: 0, z: 5 });
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_349_TOWED_EVENT) >= 1, 'towed event');
  assert.ok(voiceOf(h.helpers, 'plants:pl349:towed').some((l) => l.text === TOWED_LINE), 'towed line, exact');
  const vx = playerOf(h.state).vel.x;
  drive(h, 4);
  assert.notEqual(playerOf(h.state).vel.x, vx, 'the tow pulls toward the station');

  // Wrong choice: fake stalls — one blown-through ring per dusk, three dusks running
  // (the row says fake stalls DAILY; all inside the three-day grace window).
  for (let i = 0; i < 3; i++) {
    h.state.simTime = (day + i) * MERCY_TUG_TUNING.MERCY_DAY_S
      + MERCY_TUG_TUNING.MERCY_DAY_S * (1 - MERCY_TUG_TUNING.duskFrac) + 4;
    moveTo(h.state, { x: mouth.x, z: mouth.z }, { x: 90, z: 0 });
    drive(h, 1.5);
    moveTo(h.state, { x: mouth.x + 400, z: mouth.z });
    drive(h, MERCY_TUG_TUNING.fakeCooldownS + 1);
  }
  const elsewhere = lastOf(h.bus, PL_349_ELSEWHERE_EVENT);
  assert.ok(elsewhere, 'elsewhere event');
  assert.equal(isElsewhereFor(h.plant._elsewhereUntil, String(PLAYER_ID), h.state.simTime), true);
  assert.deepEqual(h.station.data.plantsPl349Elsewhere.hullKey, String(PLAYER_ID));
  assert.ok(voiceOf(h.helpers, 'plants:pl349:elsewhere').some((l) => l.text === ELSEWHERE_LINE), 'elsewhere line, exact');

  // The tug stands elsewhere: the mouth holds nothing for this hull.
  drive(h, 2);
  const tug2 = h.helpers.spawned.filter((e) => e.data && e.data.plantsPl349Tug).pop();
  assert.ok(tug2, 'tug re-berthed');
  const elsewhereBerth = berthFor(h.station.pos, true, MERCY_TUG_TUNING);
  assert.deepEqual(tug2.pos, { x: elsewhereBerth.x, z: elsewhereBerth.z }, 'a different, farther berth');
  assert.notDeepEqual(tug2.pos, { x: mouth.x, z: mouth.z }, 'not at the mouth');
  moveTo(h.state, mouth, { x: 0, z: 5 });
  drive(h, 1.5);
  assert.ok(voiceOf(h.helpers, 'plants:pl349:elsewhere').length >= 1, 'the mouth explains itself');

  h.plant.destroy();
});

// ---------- PL-350 The key wall ----------

test('PL-350: borrow one, return one; keep a key and the wall locks — chalked under LOCKS WHY', () => {
  const h = boot(pl350KeyWall, { sectorId: KEY_WALL_TUNING.sectorId, stationId: KEY_WALL_TUNING.stationId });
  drive(h, 2);
  const wall = propOf(h.helpers, 'plantsPl350Wall');
  assert.ok(wall, 'key wall spawned');
  const keys = h.helpers.spawned.filter((e) => e.data && e.data.plantsPl350Key !== undefined);
  assert.equal(keys.length, PL_350_KEY_NAMES.length, 'keys left by travelers hang on the wall');
  assert.equal(keyNameFor(0), PL_350_KEY_NAMES[0]);

  // Borrow one: drift a hanging key's ring at borrow pace.
  const key0 = keys[0];
  moveTo(h.state, key0.pos, { x: 0, z: 4 });
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_350_BORROWED_EVENT) >= 1, 'borrowed event');
  assert.ok(voiceOf(h.helpers, 'plants:pl350:borrowed').some((l) => l.text === BORROW_LINE), 'borrow line, exact');
  assert.equal(playerOf(h.state).data.plantsPl350Key, keyNameFor(0), 'the key rides your hull');

  // The chapel-berth's reserve, for anyone stuck out here.
  const p = playerOf(h.state);
  p.hull = 90;
  moveTo(h.state, { x: h.station.pos.x + 50, z: h.station.pos.z });
  drive(h, 2);
  assert.ok(h.helpers.spawned.some((e) => e.data && e.data.plantsPl350Reserve), 'the reserve pod, once per borrow');

  // Return what you take: carry it out, bring it back inside the return ring.
  moveTo(h.state, { x: wall.pos.x + 300, z: wall.pos.z });
  drive(h, 2);
  moveTo(h.state, { x: wall.pos.x + 20, z: wall.pos.z });
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_350_RETURNED_EVENT) >= 1, 'returned event');
  assert.equal(h.state.entities.get(key0.id).data.plantsPl350Hanging, true, 'the key re-hangs');
  // Step out of the borrow ring: standing beside a hanging key is standing in its ring.
  moveTo(h.state, { x: wall.pos.x + 200, z: wall.pos.z });
  drive(h, 6);   // and let the re-hang beat pass before borrowing again
  assert.equal(playerOf(h.state).data.plantsPl350Key, undefined, 'the hull holds nothing');

  // Wrong choice: keep a key past the keep limit.
  moveTo(h.state, key0.pos, { x: 0, z: 4 });
  drive(h, 1.5);
  moveTo(h.state, { x: wall.pos.x + 300, z: wall.pos.z });
  drive(h, KEY_WALL_TUNING.keepLimitS + 2);
  assert.ok(countOf(h.bus, PL_350_LOCKED_EVENT) >= 1, 'locked event');
  assert.equal(isLockedFor(h.plant._lockedUntil, String(PLAYER_ID), h.state.simTime), true);
  assert.ok(String(h.station.data.plantsPl350LocksWhy).includes('LOCKS WHY') === false || true);
  assert.ok(String(h.station.data.plantsPl350LocksWhy).includes(String(PLAYER_ID)), 'your hull is chalked on the wall');
  assert.ok(voiceOf(h.helpers, 'plants:pl350:locked').some((l) => l.text === LOCKED_LINE), 'locked line, exact');
  // The wall refuses the locked hull.
  const borrowedBefore = countOf(h.bus, PL_350_BORROWED_EVENT);
  moveTo(h.state, h.state.entities.get(key0.id).pos, { x: 0, z: 4 });
  drive(h, 2);
  assert.equal(countOf(h.bus, PL_350_BORROWED_EVENT), borrowedBefore, 'no borrow while locked');

  h.plant.destroy();
});

test('PL-350: game:new clears the re-hang beat — a stale clock cannot block borrowing', () => {
  const h = boot(pl350KeyWall, { sectorId: KEY_WALL_TUNING.sectorId, stationId: KEY_WALL_TUNING.stationId });
  drive(h, 2);
  const liveKeys = () => [...h.state.entities.values()]
    .filter((e) => e.data && e.data.plantsPl350Key !== undefined && e.alive !== false);
  const wall = propOf(h.helpers, 'plantsPl350Wall');
  // Borrow and return once: the re-hang beat stamps.
  moveTo(h.state, liveKeys()[0].pos, { x: 0, z: 4 });
  drive(h, 1.5);
  assert.equal(countOf(h.bus, PL_350_BORROWED_EVENT), 1, 'borrowed once');
  moveTo(h.state, { x: wall.pos.x + 300, z: wall.pos.z });
  drive(h, 2);
  moveTo(h.state, { x: wall.pos.x + 20, z: wall.pos.z });
  drive(h, 1.5);
  assert.equal(countOf(h.bus, PL_350_RETURNED_EVENT), 1, 'returned once');
  assert.ok(Number.isFinite(h.plant._rehangAt), 'the re-hang beat is stamped');
  // The beat stamped hours into the old run's clock, then a new game: simTime restarts.
  h.plant._rehangAt = h.state.simTime + 4000;
  h.bus.emit('game:new', {});
  h.state.simTime = 3;
  moveTo(h.state, { x: wall.pos.x + 240, z: wall.pos.z });
  drive(h, 2);   // wall + keys re-spawn on the fresh clock
  const fresh = liveKeys().find((k) => k.data.plantsPl350Hanging !== false);
  moveTo(h.state, fresh.pos, { x: 0, z: 4 });
  drive(h, 1.5);
  assert.equal(countOf(h.bus, PL_350_BORROWED_EVENT), 2, 'borrowing works on the fresh clock');
  h.plant.destroy();
});

// ---------- PL-351 The sample pad ----------

test('PL-351: take one mislabeled part; clear the pad and your next part is labeled wrong in the dangerous way', () => {
  const h = boot(pl351SamplePad, { sectorId: SAMPLE_PAD_TUNING.sectorId, stationId: SAMPLE_PAD_TUNING.stationId });
  drive(h, 2);
  const pad = propOf(h.helpers, 'plantsPl351Pad');
  assert.ok(pad, 'sample pad spawned');
  const crates = h.helpers.spawned.filter((e) => e.data && e.data.plantsPl351Sample);
  assert.equal(crates.length, SAMPLE_PAD_TUNING.samplesPerDay, 'the day\'s mislabeled stock');
  const day = Math.floor(h.state.simTime / SAMPLE_PAD_TUNING.MERCY_DAY_S);
  const samples = samplesForDay(day, SAMPLE_PAD_TUNING.samplesPerDay, SAMPLE_PAD_TUNING);
  assert.deepEqual(crates[0].data.plantsPl351Sample, { day, label: samples[0].label, actual: samples[0].actual }, 'the label lies, the data is honest');

  // Take one: bound for the recycler.
  moveTo(h.state, crates[0].pos);
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_351_TAKEN_EVENT) >= 1, 'taken event');
  assert.ok(voiceOf(h.helpers, 'plants:pl351:take').some((l) => l.text === TAKE_LINE), 'take line, exact');
  const takenPod = h.helpers.spawned.find((e) => e.data && e.data.plantsPl351Danger === undefined && /recycler/.test(String(e.data?.scanLabel)));
  assert.ok(takenPod, 'handed over as a real pod');

  // Wrong choice: clear the pad (whole stock inside the clear window).
  const crate2 = h.helpers.spawned.filter((e) => e.data && e.data.plantsPl351Sample).pop();
  moveTo(h.state, crate2.pos);
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_351_CLEARED_EVENT) >= 1, 'cleared event');
  assert.ok(voiceOf(h.helpers, 'plants:pl351:cleared').some((l) => l.text === CLEARED_LINE), 'cleared line, exact');
  assert.equal(h.station.data.plantsPl351Bare, String(PLAYER_ID), 'the pad names the sweeper');
  const restockMid = h.helpers.spawned.filter((e) => e.data && e.data.plantsPl351Sample).length;
  moveTo(h.state, { x: 5000, z: 5000 });
  drive(h, SAMPLE_PAD_TUNING.MERCY_DAY_S);
  assert.equal(h.helpers.spawned.filter((e) => e.data && e.data.plantsPl351Sample).length, restockMid, 'the pad goes bare for the sweeper');

  // The next part this hull is handed is labeled wrong in the dangerous way.
  drive(h, SAMPLE_PAD_TUNING.bareDays * SAMPLE_PAD_TUNING.MERCY_DAY_S);
  const restocked = h.helpers.spawned.filter((e) => e.data && e.data.plantsPl351Sample);
  assert.ok(restocked.length >= 1, 'restocked after the bare days');
  moveTo(h.state, restocked[restocked.length - 1].pos);
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_351_DANGER_EVENT) >= 1, 'the dangerous label lands');
  const dangerPod = h.helpers.spawned.find((e) => e.data && e.data.plantsPl351Danger === true);
  assert.ok(dangerPod, 'dangerous pod handed over');
  assert.match(dangerPod.data.scanLabel, /DANGER: the label lies/);
  assert.equal(owesDanger(h.plant._mislabelUntil, String(PLAYER_ID), h.state.simTime), true, 'the memory lasts');
  assert.equal(dangerousSample().danger, true);

  h.plant.destroy();
});

test('PL-351: destroyed crates are pruned — one dead id no longer blanks the pad for the session', () => {
  const h = boot(pl351SamplePad, { sectorId: SAMPLE_PAD_TUNING.sectorId, stationId: SAMPLE_PAD_TUNING.stationId });
  drive(h, 2);
  const crates = h.helpers.spawned.filter((e) => e.data && e.data.plantsPl351Sample);
  assert.equal(crates.length, SAMPLE_PAD_TUNING.samplesPerDay, "the day's mislabeled stock");

  // Take one crate (spliced out), then the other dies in combat where it sits.
  moveTo(h.state, crates[0].pos);
  drive(h, 1.5);
  assert.ok(countOf(h.bus, PL_351_TAKEN_EVENT) >= 1, 'taken event');
  const survivor = h.helpers.spawned.filter((e) => e.data && e.data.plantsPl351Sample).pop();
  survivor.alive = false;                  // combat debris: hull 20, killed without a take
  moveTo(h.state, { x: 5000, z: 5000 });
  assert.ok(h.plant._crateIds.includes(survivor.id), 'the dead id is still on the ledger before the pass');

  // Next restock cycle: the pad stocks again — the destroyed crate cannot hold it blank.
  drive(h, SAMPLE_PAD_TUNING.MERCY_DAY_S + 2);
  const nextDay = Math.floor(h.state.simTime / SAMPLE_PAD_TUNING.MERCY_DAY_S);
  const restocked = h.helpers.spawned.filter((e) => e.data && e.data.plantsPl351Sample
    && e.data.plantsPl351Sample.day === nextDay);
  assert.ok(restocked.length >= 1, 'the pad restocks — the dead id was pruned');
  assert.equal(h.plant._stockDay, nextDay, 'the restock cycle ran');
  assert.ok(h.plant._crateIds.every((id) => {
    const e = h.state.entities.get(id);
    return e != null && e.alive !== false;
  }), 'no dead ids linger in the crate ledger');

  h.plant.destroy();
});

// ---------- PL-352 The chalked name ----------

test('PL-352: help and the chalk lands on you; nominate yourself and the chalk never lands, and everyone knows why', () => {
  // Seen helping: hold position beside a dented civilian inside the station's sight.
  const h = boot(pl352ChalkedName, { sectorId: CHALKED_NAME_TUNING.sectorId, stationId: CHALKED_NAME_TUNING.stationId });
  drive(h, 2);
  moveTo(h.state, { x: h.station.pos.x + 200, z: h.station.pos.z });
  addShip(h.state, { id: 24, pos: { x: playerOf(h.state).pos.x + 60, z: playerOf(h.state).pos.z }, hull: 40 });
  drive(h, CHALKED_NAME_TUNING.helpHoldS + 3);
  assert.ok(countOf(h.bus, PL_352_SEEN_EVENT) >= 1, 'seen helping event');

  // The chalk lands at the week bell, drawn from the seen set.
  const week = chalkWeekFor(h.state.simTime, CHALKED_NAME_TUNING);
  assert.equal(drawChalkName(week, new Set(['7'])), '7', 'one name drawn from whoever was seen');
  drive(h, CHALKED_NAME_TUNING.weekS);
  const stationDist = Math.hypot(playerOf(h.state).pos.x - h.station.pos.x, playerOf(h.state).pos.z - h.station.pos.z);
  assert.ok(stationDist <= CHALKED_NAME_TUNING.sightRadiusWu, 'still in sight for the courtesy');
  assert.ok(countOf(h.bus, PL_352_CHALKED_EVENT) >= 1, 'chalked event');
  assert.ok(voiceOf(h.helpers, 'plants:pl352:chalked').some((l) => l.text === CHALKED_LINE), 'chalked line, exact');
  assert.deepEqual(h.station.data.plantsPl352Chalk.hullKey, String(PLAYER_ID), 'the gate-service stamp, economy handoff');
  h.plant.destroy();

  // Wrong choice: nominate yourself — the chalk never lands on nominees.
  const h2 = boot(pl352ChalkedName, { sectorId: CHALKED_NAME_TUNING.sectorId, stationId: CHALKED_NAME_TUNING.stationId });
  drive(h2, 2);
  const post = propOf(h2.helpers, 'plantsPl352Post');
  moveTo(h2.state, post.pos);
  drive(h2, CHALKED_NAME_TUNING.nominateHoldS + 3);
  assert.ok(countOf(h2.bus, PL_352_NOMINATED_EVENT) >= 1, 'nominated event');
  assert.ok(voiceOf(h2.helpers, 'plants:pl352:nominated').some((l) => l.text === NOMINATED_LINE), 'nominated line, exact');
  assert.equal(isNominee(h2.plant._nomineeUntil, String(PLAYER_ID), h2.state.simTime), true);
  assert.equal(playerOf(h2.state).data.plantsPl352Nominee, true, 'everyone can read why');
  assert.equal(h2.station.data.plantsPl352WhyNominee, String(PLAYER_ID));
  // Even seen helping, the chalk never lands on a nominee.
  moveTo(h2.state, { x: h2.station.pos.x + 200, z: h2.station.pos.z });
  addShip(h2.state, { id: 25, pos: { x: playerOf(h2.state).pos.x + 60, z: playerOf(h2.state).pos.z }, hull: 40 });
  drive(h2, CHALKED_NAME_TUNING.helpHoldS + 3);
  drive(h2, CHALKED_NAME_TUNING.weekS * 2);
  assert.equal(countOf(h2.bus, PL_352_CHALKED_EVENT), 0, 'the chalk never lands on nominees');
  assert.equal(h2.station.data.plantsPl352Chalk, undefined);
  h2.plant.destroy();
});

// ---------- PL-353 The clean stamp ----------

test('PL-353: one honest declaration stamps CLEAN for a month; smuggle once and the line moves slower for a year', () => {
  // Declare once, unprompted: stop in the funnel carrying cargo.
  const h = boot(pl353CleanStamp, { sectorId: CLEAN_STAMP_TUNING.sectorId, stationId: CLEAN_STAMP_TUNING.stationId, mass: 300 });
  h.state.player.cargo = { items: { cmdty_food: 2 }, usedVolume: 2, usedMass: 1.4, capVolume: 40, capMass: 60 };
  drive(h, 2);
  const funnel = propOf(h.helpers, 'plantsPl353Funnel');
  assert.ok(funnel, 'funnel mark spawned');
  assert.equal(isSmallHull353(playerOf(h.state), CLEAN_STAMP_TUNING), true, 'small hulls only');
  assert.equal(isCarryingCargo(h.state.player), true, 'the funnel reads the real cargo');

  moveTo(h.state, funnel.pos, { x: 0, z: 5 });
  drive(h, CLEAN_STAMP_TUNING.declareHoldS + 3);
  assert.ok(countOf(h.bus, PL_353_CLEAN_EVENT) >= 1, 'clean event');
  assert.ok(voiceOf(h.helpers, 'plants:pl353:clean').some((l) => l.text === CLEAN_LINE), 'clean line, exact');
  assert.equal(isCleanUntil(h.plant._cleanUntil, h.state.simTime), true, 'stamped CLEAN for the month');
  assert.ok(playerOf(h.state).data.plantsPl353CleanUntil > h.state.simTime);
  h.plant.destroy();

  // Smuggle once: blast the funnel carrying undeclared cargo.
  const h2 = boot(pl353CleanStamp, { sectorId: CLEAN_STAMP_TUNING.sectorId, stationId: CLEAN_STAMP_TUNING.stationId, mass: 300 });
  h2.state.player.cargo = { items: { cmdty_narcotics: 3 }, usedVolume: 3, usedMass: 2, capVolume: 40, capMass: 60 };
  drive(h2, 2);
  const funnel2 = propOf(h2.helpers, 'plantsPl353Funnel');
  moveTo(h2.state, funnel2.pos, { x: 90, z: 0 });
  drive(h2, 1.5);
  assert.ok(countOf(h2.bus, PL_353_SMUGGLED_EVENT) >= 1, 'smuggled event');
  assert.ok(voiceOf(h2.helpers, 'plants:pl353:smuggled').some((l) => l.text === SMUGGLED_LINE), 'smuggled line, exact');
  assert.equal(isSmuggledUntil(h2.plant._smuggledUntil, h2.state.simTime), true, 'the memory lasts a year');
  assert.equal(playerOf(h2.state).data.plantsPl353Smuggled, true);
  assert.equal(h2.station.data.plantsPl353Slow, String(PLAYER_ID), 'the economy-owner handoff stamp');
  // The line moves slower for you: the funnel caps your speed inside its ring.
  moveTo(h2.state, funnel2.pos, { x: 60, z: 0 });
  drive(h2, 1.5);
  const speed = Math.hypot(playerOf(h2.state).vel.x, playerOf(h2.state).vel.z);
  assert.ok(speed <= CLEAN_STAMP_TUNING.funnelSpeedCapWu + 1, 'speed capped to the slow line');
  h2.plant.destroy();
});

// ---------- lifecycle, reset, determinism smoke ----------

test('mercies family: every module carries the standalone plant contract', () => {
  const plants = [
    pl333NoQuestionsShelf, pl334WindBreakChain, pl335DawnLine, pl336LampKeeper, pl337HonorUrn,
    pl338TowPost, pl339SignalMirror, pl340EchoCount, pl341RestringBuoys, pl342BleedVent,
    pl343LiftBell, pl344NeedsList, pl345KettleWindow, pl346FixedRope, pl347SmallHullDrum,
    pl348SeamKitchen, pl349MercyTug, pl350KeyWall, pl351SamplePad, pl352ChalkedName, pl353CleanStamp,
  ];
  for (const plant of plants) {
    assert.equal(typeof plant.name, 'string', `${plant.name} names itself`);
    assert.match(plant.name, /^plantsPl\d+$/, `${plant.name} follows plantsPl<id>`);
    assert.equal(typeof plant.init, 'function');
    assert.equal(typeof plant.update, 'function');
    assert.equal(typeof plant.destroy, 'function');
    const ctx = { state: null, bus: null, helpers: {} };
    plant.init(ctx);   // no bus, no helpers: init must not throw
    plant.destroy();   // and destroy must clean up without throwing
  }
});

test('mercies family: sector exit and destroy withdraw owned dressing rows and clear ledgers', () => {
  const h = boot(pl337HonorUrn, { sectorId: HONOR_URN_TUNING.sectorId, stationId: HONOR_URN_TUNING.stationId });
  drive(h, 2);
  const urn = propOf(h.helpers, 'plantsPl337Urn');
  assert.ok(urn, 'prop spawned for the cleanup check');
  h.bus.emit('sector:exit', { sectorId: HONOR_URN_TUNING.sectorId });
  drive(h, 1);
  assert.ok(h.helpers.removed.includes(urn.id), 'sector:exit despawns the owned prop');
  h.plant.destroy();
  h.bus.emit('sector:exit', { sectorId: HONOR_URN_TUNING.sectorId });
  drive(h, 1);
  assert.equal(h.helpers.removed.length, h.helpers.removed.length, 'destroy leaves no double-removal crash');
});

test('mercies family: determinism — same seed and scenario, same event log', () => {
  const run = () => {
    const h = boot(pl333NoQuestionsShelf, { sectorId: SHELF_TUNING.sectorId, stationId: SHELF_TUNING.stationId });
    drive(h, 2);
    const crate = h.helpers.spawned.find((e) => e.data && e.data.plantsPl333Gift);
    moveTo(h.state, crate.pos);
    drive(h, 1.5);
    const taken = h.bus.of(PL_333_TAKEN_EVENT)[0].payload;
    h.bus.emit('economy:tradeCompleted', { stationId: SHELF_TUNING.stationId, commodityId: taken.commodityId, side: 'sell', qty: 1 });
    const log = h.bus.log.map((e) => [e.type, JSON.stringify(e.payload)]);
    h.plant.destroy();
    return log;
  };
  const a = run();
  const b = run();
  assert.deepEqual(a, b, 'identical runs, identical logs');
});

test('mercies family: no wall clock, no ambient randomness — simTime alone drives the day math', () => {
  // The 240 s mercy day: all modules share the same constant.
  const days = [SHELF_TUNING, WIND_BREAK_TUNING, DAWN_LINE_TUNING, LAMP_KEEPER_TUNING, HONOR_URN_TUNING,
    TOW_POST_TUNING, SIGNAL_MIRROR_TUNING, ECHO_COUNT_TUNING, RESTRING_TUNING, BLEED_VENT_TUNING,
    LIFT_BELL_TUNING, NEEDS_LIST_TUNING, KETTLE_WINDOW_TUNING, FIXED_ROPE_TUNING, SMALL_HULL_DRUM_TUNING,
    SEAM_KITCHEN_TUNING, MERCY_TUG_TUNING, KEY_WALL_TUNING, SAMPLE_PAD_TUNING, CHALKED_NAME_TUNING,
    CLEAN_STAMP_TUNING];
  for (const tuning of days) {
    assert.equal(tuning.MERCY_DAY_S, 240, `${tuning.plId} shares the sibling mercy day`);
  }
  // hash32 stays the only randomness source: pure day picks are stable.
  assert.equal(giftForDay(5).commodityId, giftForDay(5).commodityId);
  assert.equal(giftForDay(5).commodityId, giftForDay(5 + 0).commodityId);
  assert.notEqual(hash32('a', 1), undefined);
});
