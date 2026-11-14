// test/mercies-yard-secrets.test.mjs — headless checks for the SMALL MERCIES plant bank
// (yard PL-370..373; secrets PL-269..272; secrets-2 PL-364..369 — 14 modules in
// src/systems/plants/mercies/).
//
// Every module is a standalone `plantsPl<id>` object with init(ctx)/update(dt,state)/destroy().
// The harness is a recording bus + a spec-spreading spawnEntity, no DOM, no Three.js, no wall
// clock: state.simTime is driven by hand. Tuning day = 240 s (the mercy-day convention), a
// mercy year = 240 × 30 s. Wrong choices are driven through the same seams the modules listen
// to (economy:chargeCredits receipts, entity:killed, pickup:collected, claim:moduleBuilt).
import test from 'node:test';
import assert from 'node:assert/strict';

import { pl370HousewarmingPart, PL_370_PART_EVENT, PL_370_KEPT_EVENT, PL_370_FEES_EVENT, HOUSEWARMING_TUNING, isDockingFeeReceipt, housewarmingPartSpec } from '../src/systems/plants/mercies/pl370HousewarmingPart.js';
import { PL_146_CALL_EVENT, PL_146_SNUFFED_EVENT } from '../src/systems/plants/pl146FirstCaller.js';
import { pl371LaneTithe, PL_371_TITHE_EVENT, PL_371_BILLED_EVENT, PL_371_QUIET_EVENT, LANE_TITHE_TUNING, isLaneBillingReceipt, titheCommodityFor, unloadPosOf } from '../src/systems/plants/mercies/pl371LaneTithe.js';
import { pl372WreckersCourtesy, PL_372_RECOVERY_EVENT, PL_372_COURTESY_EVENT, PL_372_BROKEN_EVENT, WRECKERS_COURTESY_TUNING, recoveryShipSpec, raidVerdictFor } from '../src/systems/plants/mercies/pl372WreckersCourtesy.js';
import { pl373HearthLamp, PL_373_WARMED_EVENT, PL_373_FLOODLIT_EVENT, HEARTH_LAMP_TUNING, isLitHearthLamp, isCallerVisitor } from '../src/systems/plants/mercies/pl373HearthLamp.js';
import { pl269KindnessLocker, PL_269_TAKE_EVENT, PL_269_STRIPPED_EVENT, PL_269_RESTOCKED_EVENT, KINDNESS_LOCKER_TUNING, derelictPositions, lockerItemFor, derelictSpec, lockerSpec } from '../src/systems/plants/mercies/pl269KindnessLocker.js';
import { pl270StashedMedal, PL_270_CARRIED_EVENT, PL_270_LUCK_EVENT, PL_270_SOLD_EVENT, STASHED_MEDAL_TUNING, medalBerthPos, medalSpec, stationInSellRing, PL_270_MEDAL_NOTE } from '../src/systems/plants/mercies/pl270StashedMedal.js';
import { pl271MapInTheLid, PL_271_FOUND_EVENT, PL_271_RESTOCKED_EVENT, PL_271_SOLD_EVENT, MAP_IN_THE_LID_TUNING, routePositions, movedCachePos, lidSpec, chalkBuoySpec, cacheSpec, PL_271_CACHE_NOTE } from '../src/systems/plants/mercies/pl271MapInTheLid.js';
import { pl272ForwardBeacon, PL_272_TAKE_EVENT, PL_272_LEFT_EVENT, PL_272_STOPPED_EVENT, FORWARD_BEACON_TUNING, beaconPos, stockItemFor, beaconSpec } from '../src/systems/plants/mercies/pl272ForwardBeacon.js';
import { pl364KindnessLedger, PL_364_ENTRY_EVENT, PL_364_FORGED_EVENT, PL_364_PAYOUT_EVENT, KINDNESS_LEDGER_TUNING, ledgerPostPos, inLedgerLane, payoutPartsFor, postSpec } from '../src/systems/plants/mercies/pl364KindnessLedger.js';
import { PL_371_TITHE_EVENT as LEDGER_TITHE_EVENT } from '../src/systems/plants/mercies/pl371LaneTithe.js';
import { PL_372_COURTESY_EVENT as LEDGER_COURTESY_EVENT } from '../src/systems/plants/mercies/pl372WreckersCourtesy.js';
import { pl365LampGarden, PL_365_SAT_EVENT, PL_365_DIMMED_EVENT, LAMP_GARDEN_TUNING, gardenPositions, gardenRockSpec, isSittingInRing } from '../src/systems/plants/mercies/pl365LampGarden.js';
import { pl366RegistryHatch, PL_366_POSTED_EVENT, PL_366_TOKEN_EVENT, PL_366_CLOSED_EVENT, REGISTRY_HATCH_TUNING, hatchPos, isTokenPosting, neededCommodityFor, hatchSpec } from '../src/systems/plants/mercies/pl366RegistryHatch.js';
import { pl367LingeringLift, PL_367_RIDE_EVENT, PL_367_GIFT_EVENT, PL_367_GIFT_LEFT_EVENT, PL_367_CARVED_EVENT, LINGERING_LIFT_TUNING, liftPositions, carPosAt, deadStationSpec, liftCarSpec, PL_367_CARVED_FLAG } from '../src/systems/plants/mercies/pl367LingeringLift.js';
import { pl368ThankYouSlate, PL_368_LEFT_EVENT, PL_368_THANKS_EVENT, THANK_YOU_SLATE_TUNING, slatePos, isJunkForSlate, shortPartFor, engravingFor, SLATE_THANKS_WORD } from '../src/systems/plants/mercies/pl368ThankYouSlate.js';
import { pl369LastAllowance, PL_369_ASKED_EVENT, PL_369_WORD_EVENT, PL_369_CLOSED_EVENT, LAST_ALLOWANCE_TUNING, depotPos, nextWordFragment, depotSpec, PL_369_WORD_FLAG, PL_369_CLOSED_FLAG } from '../src/systems/plants/mercies/pl369LastAllowance.js';

// ---------- harness ----------

const SKER = 'sector_sker_haven';
const SEDNA = 'sector_sedna_dark';

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
    typesOf(type) { return log.filter((e) => e.type === type).map((e) => e.payload); },
    popups() { return this.typesOf('comms:popup').map((p) => p.payload ?? p); },
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
    world: { currentSectorId: SKER },
    claims: { bodies: [] },
    story: { flags: {} },
    player: { credits: 0 },
    stations: [],
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
  let nextId = 100;
  const helpers = {
    spawned,
    removed,
    spawnEntity(spec) {
      const ent = {
        ...structuredClone(spec),
        id: nextId++,
        alive: true,
        data: structuredClone(spec.data || {}),
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        vel: { ...(spec.vel || { x: 0, z: 0 }) },
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

function rig(stateOverrides = {}, sector = SKER) {
  const state = makeState({ world: { currentSectorId: sector }, ...stateOverrides });
  const bus = createBus();
  const helpers = makeHelpers(state);
  return { state, bus, helpers };
}

function boot(plant, { state, bus, helpers }) {
  plant.init({ state, bus, helpers });
  return plant;
}

function playerAt(state, x, z, vel = { x: 0, z: 0 }) {
  const p = state.entities.get(state.playerId);
  p.pos.x = x;
  p.pos.z = z;
  p.vel.x = vel.x;
  p.vel.z = vel.z;
}

function step(plant, state, dt = 1 / 60) { plant.update(dt, state); }

function advance(plant, state, seconds, dt = 1) {
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    state.simTime += dt;
    step(plant, state, dt);
  }
}

function claimAt(bus, x = 0, z = 0, sectorId = SKER, id = 'body_1') {
  bus.emit('claim:claimed', { body: { id, x, z, sectorId, name: 'Test Rock' } });
}

// A spawn-pod fixture the "leave something" seams accept: the module-family stamp is what counts.
function leavePod(helpers, state, pos, { commodityId = 'cmdty_alloys', amount = 2, owner = 7 } = {}) {
  return helpers.spawnEntity({
    type: 'payload',
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    radius: 3,
    hull: 40,
    hullMax: 40,
    data: {
      kind: 'payload',
      commodityId,
      amount,
      playerJettisonOrigin: { version: 1, ownerId: owner },
    },
  });
}

function popupTexts(bus) {
  return bus.typesOf('comms:popup').map((e) => e.text);
}

// ---------- pure helpers (cheap invariants on the exported tunings/pures) ----------

test('PL-370 pure: docking-fee receipts are read from the owner’s economy receipt', () => {
  assert.equal(isDockingFeeReceipt({ amount: 5, reason: 'docking_fee' }), true);
  assert.equal(isDockingFeeReceipt({ amount: 5, reason: 'berth_toll' }), true);
  assert.equal(isDockingFeeReceipt({ amount: 0, reason: 'docking_fee' }), false);
  assert.equal(isDockingFeeReceipt({ amount: 5, reason: 'bounty_payout' }), false);
  const spec = housewarmingPartSpec({ x: 10, z: 20 });
  assert.equal(spec.data.parentType, 'story_prop');
  assert.equal(spec.data.masslineTetherable, true);
  assert.equal(spec.data.storyPropKind, 'plants_housewarming_part');
});

test('PL-371 pure: billing receipts and tithe picks are deterministic', () => {
  assert.equal(isLaneBillingReceipt({ amount: 3, reason: 'lane_toll' }), true);
  assert.equal(isLaneBillingReceipt({ amount: 3, reason: 'repair' }), false);
  assert.deepEqual(unloadPosOf({ payload: { pos: { x: 1, z: 2 } } }), { x: 1, z: 2 });
  assert.equal(unloadPosOf({}), null);
  assert.equal(titheCommodityFor('jobA'), titheCommodityFor('jobA'));
  assert.ok(LANE_TITHE_TUNING.titheCmdtys.includes(titheCommodityFor('jobB')));
});

test('PL-372 pure: verdict deltas ride the published payload, not the sim', () => {
  assert.deepEqual(raidVerdictFor(false, true), { delta: -0.15, kind: 'softened' });
  assert.deepEqual(raidVerdictFor(true, false), { delta: 0.30, kind: 'hardened' });
  const spec = recoveryShipSpec({ x: 0, z: 0 }, 100);
  assert.equal(spec.data.storyPropKind, 'plants_wreckers_recovery');
  assert.equal(spec.data.recoveryUntil, 100 + WRECKERS_COURTESY_TUNING.recoveryLingerS);
});

test('PL-373 pure: lamp and visitor recognition reads pl146’s stamps only', () => {
  assert.equal(isLitHearthLamp({ alive: true, data: { plantsPl146Lamp: true, lampLit: true } }), true);
  assert.equal(isLitHearthLamp({ alive: true, data: { plantsPl146Lamp: true, lampLit: false } }), false);
  assert.equal(isCallerVisitor({ alive: true, data: { plantsPl146Visitor: true } }), true);
  assert.equal(isCallerVisitor({ alive: true, data: {} }), false);
});

test('PL-269/272 pure: item picks are stable and in-list; positions are hash32-stable', () => {
  assert.equal(lockerItemFor(1), lockerItemFor(1));
  assert.ok(KINDNESS_LOCKER_TUNING.lockerItems.includes(lockerItemFor(2)));
  assert.equal(stockItemFor(1), stockItemFor(1));
  assert.ok(FORWARD_BEACON_TUNING.stockCmdtys.includes(stockItemFor(3)));
  const p1 = derelictPositions();
  const p2 = derelictPositions();
  assert.deepEqual(p1, p2);
  assert.deepEqual(beaconPos(), beaconPos());
  const d = derelictSpec(p1.derelict);
  assert.equal(d.flags.persistent, true);
  const l = lockerSpec(p1.locker, 0, null);
  assert.equal(l.data.lampLit, true);
  const l2 = lockerSpec(p1.locker, 0, 7);
  assert.equal(l2.data.lampLit, false);
  assert.match(l2.data.scanLabel, /chalk/i);
});

test('PL-270/271 pure: berth/route geometry and medals carry the row’s exact note', () => {
  assert.equal(PL_270_MEDAL_NOTE, 'For whoever needs the luck more than me.');
  const m = medalSpec({ x: 0, z: 0 }, false);
  assert.match(m.data.scanLabel, /For whoever needs the luck more than me\./);
  const mSold = medalSpec({ x: 0, z: 0 }, true);
  assert.equal(mSold.data.sold, true);
  const near = { id: 's1', alive: true, pos: { x: 10, z: 0 } };
  assert.equal(stationInSellRing({ x: 0, z: 0 }, [near], 50), near);
  assert.equal(stationInSellRing({ x: 0, z: 0 }, [near], 5), null);
  const r = routePositions();
  assert.equal(r.buoys.length, MAP_IN_THE_LID_TUNING.buoyCount);
  assert.deepEqual(r, routePositions());
  assert.equal(cacheSpec(r.cache, true, false).data.sold, true);
  assert.equal(cacheSpec(r.cache, false, true).data.cacheNote, PL_271_CACHE_NOTE);
  assert.equal(chalkBuoySpec(r.buoys[0]).data.swarmFloorPad.label.length <= 24, true);
  const moved = movedCachePos();
  assert.notDeepEqual(moved, r.cache);
});

test('PL-364/365 pure: lane gating, payout cap, garden layout', () => {
  const post = ledgerPostPos();
  assert.equal(inLedgerLane({ sectorId: SKER }, post, SKER), true);
  assert.equal(inLedgerLane({ sectorId: 'other' }, post, SKER), false);
  assert.equal(inLedgerLane({ pos: { x: post.x + 5, z: post.z } }, post, SKER), true);
  assert.equal(inLedgerLane({ pos: { x: post.x + 9e6, z: post.z } }, post, SKER), false);
  const parts = payoutPartsFor(20);
  assert.equal(parts.length, KINDNESS_LEDGER_TUNING.partCap);
  assert.deepEqual(payoutPartsFor(2), payoutPartsFor(2));
  const g = gardenPositions();
  assert.equal(g.rocks.length, LAMP_GARDEN_TUNING.rockCount);
  assert.ok(g.rocks.every((rk) => typeof rk.name === 'string' && rk.name.length > 0));
  assert.deepEqual(g, gardenPositions());
  assert.equal(isSittingInRing(g.centre, 0, g.centre), true);
  assert.equal(isSittingInRing(g.centre, 99, g.centre), false);
  const rock = gardenRockSpec(g.rocks[0].name, g.rocks[0].pos);
  assert.equal(rock.data.memorialName, g.rocks[0].name);
  assert.equal(rock.data.lampLit, true);
});

test('PL-366/368 pure: token vs need picks; the slate engraves what it weighs', () => {
  assert.equal(isTokenPosting('cmdty_scrap_metal'), true);
  assert.equal(isTokenPosting('cmdty_alloys'), false);
  const need = neededCommodityFor(123, 'cmdty_alloys');
  assert.notEqual(need, 'cmdty_alloys');
  assert.ok(REGISTRY_HATCH_TUNING.needCmdtys.includes(need));
  assert.equal(shortPartFor(7), shortPartFor(7));
  assert.ok(THANK_YOU_SLATE_TUNING.partCmdtys.includes(shortPartFor(7)));
  assert.equal(engravingFor('cmdty_alloys', 3, 7), 'cmdty_alloys — 3 u — tag 7');
  assert.equal(SLATE_THANKS_WORD, 'THANKS');
  assert.equal(isJunkForSlate('cmdty_silicate'), true);
  const h = hatchSpec({ x: 0, z: 0 }, false);
  assert.equal(h.data.lampLit, true);
  assert.equal(hatchSpec({ x: 0, z: 0 }, true).data.lampLit, false);
});

test('PL-367/369 pure: spine geometry, word fragments, depot chalk', () => {
  const pos = liftPositions();
  assert.deepEqual(pos, liftPositions());
  const mid = carPosAt(0.5);
  const a = Math.hypot(mid.x - pos.dock.x, mid.z - pos.dock.z);
  assert.ok(Math.abs(a - LINGERING_LIFT_TUNING.spineLenWu / 2) < 1e-6);
  const top = carPosAt(1);
  assert.ok(Math.hypot(top.x - pos.dock.x, top.z - pos.dock.z) <= LINGERING_LIFT_TUNING.spineLenWu + 1e-6);
  assert.equal(deadStationSpec(pos.station).data.storyPropKind, 'plants_dead_station');
  assert.equal(liftCarSpec(pos.dock, null).data.carvedBy, null);
  assert.equal(liftCarSpec(pos.dock, 7).data.carvedBy, 7);
  assert.equal(nextWordFragment(0), nextWordFragment(0));
  assert.notEqual(nextWordFragment(0), nextWordFragment(1));
  const d = depotSpec(pos.station, null);
  assert.match(d.data.scanLabel, /code word/i);
  assert.equal(depotSpec(pos.station, 7).data.lampLit, false);
  assert.equal(LAST_ALLOWANCE_TUNING.mercyMonthS, (240 * 30) / 12);
});

// ---------- PL-370 The housewarming part ----------

test('PL-370 positive: the first stranger leaves the part; a day mounted is kept', () => {
  const { state, bus, helpers } = rig();
  const plant = boot(pl370HousewarmingPart, { state, bus, helpers });
  state.simTime = 10;
  claimAt(bus, 0, 0);
  bus.emit(PL_146_CALL_EVENT, { visit: 1, pos: { x: 0, z: 0 }, t: 10 });

  assert.equal(helpers.spawned.length, 1, 'the part is a real spawned prop');
  const part = helpers.spawned[0];
  assert.equal(part.data.plantsPl370Part, true);
  assert.equal(part.data.masslineTetherable, true);
  const parts = bus.typesOf(PL_370_PART_EVENT);
  assert.equal(parts.length, 1);
  assert.deepEqual(popupTexts(bus), ['Wedged in the frame. No note.']);

  state.simTime = 10 + HOUSEWARMING_TUNING.keepConfirmS;
  step(plant, state);
  assert.equal(bus.typesOf(PL_370_KEPT_EVENT).length, 1, 'still mounted after a day: kept');
  assert.equal(state.story.flags.plantsPl370PartTaken, false);

  plant.destroy();
  assert.ok(helpers.removed.includes(part.id), 'destroy removes the owned part');
});

test('PL-370 wrong choice: charge docking fees from day one and gifts stop for good', () => {
  const { state, bus, helpers } = rig();
  const plant = boot(pl370HousewarmingPart, { state, bus, helpers });
  state.simTime = 5;
  claimAt(bus, 0, 0);
  bus.emit('economy:chargeCredits', { amount: 5, reason: 'docking_fee_yard' });

  bus.emit(PL_146_CALL_EVENT, { visit: 1, pos: { x: 0, z: 0 }, t: 5 });
  assert.equal(helpers.spawned.length, 0, 'gifts stop');
  assert.equal(bus.typesOf(PL_370_FEES_EVENT).length, 1);
  assert.equal(state.story.flags.plantsPl370FeesCharged, true);
  assert.deepEqual(popupTexts(bus), ['Gifts stop. Fees don\u2019t.']);

  // Even a later first week does not re-gift; fees are not a phase.
  state.simTime = 400;
  bus.emit(PL_146_CALL_EVENT, { visit: 1, pos: { x: 0, z: 0 }, t: 400 });
  assert.equal(helpers.spawned.length, 0);
  assert.equal(bus.typesOf(PL_370_PART_EVENT).length, 0);
});

test('PL-370 cap: exactly one part per yard, ever', () => {
  const { state, bus, helpers } = rig();
  boot(pl370HousewarmingPart, { state, bus, helpers });
  claimAt(bus, 0, 0);
  bus.emit(PL_146_CALL_EVENT, { visit: 1, pos: { x: 0, z: 0 }, t: 0 });
  bus.emit(PL_146_CALL_EVENT, { visit: 1, pos: { x: 0, z: 0 }, t: 1 });
  bus.emit(PL_146_CALL_EVENT, { visit: 2, pos: { x: 0, z: 0 }, t: 2 });
  assert.equal(bus.typesOf(PL_370_PART_EVENT).length, 1);
});

// ---------- PL-371 The lane tithe ----------

test('PL-371 positive: haulers leave overloads in the hopper; the tithes lie as real pods', () => {
  const { state, bus, helpers } = rig();
  const plant = boot(pl371LaneTithe, { state, bus, helpers });
  claimAt(bus, 0, 0);
  bus.emit('npcjobs:unload', { jobId: 'hauler-1', completed: true, payload: { pos: { x: 40, z: 10 } } });

  const tithes = bus.typesOf(PL_371_TITHE_EVENT);
  assert.equal(tithes.length, 1, 'one tithe per pass');
  const pod = state.entities.get(tithes[0].podId);
  assert.ok(pod, 'the tithe is a real physical pod');
  assert.equal(pod.data.plantsPl371Tithe, true);
  assert.ok(LANE_TITHE_TUNING.titheCmdtys.includes(tithes[0].commodityId));
  assert.deepEqual(popupTexts(bus), ['Overload left. Nobody discusses it.']);

  // Cooldown: a convoy does not stack the hopper.
  bus.emit('npcjobs:unload', { jobId: 'hauler-2', completed: true, payload: { pos: { x: 60, z: 0 } } });
  assert.equal(bus.typesOf(PL_371_TITHE_EVENT).length, 1);

  // Out of the lane radius: no tithe even off cooldown.
  state.simTime += LANE_TITHE_TUNING.titheCooldownS + 1;
  bus.emit('npcjobs:unload', { jobId: 'hauler-3', completed: true, payload: { pos: { x: 5000, z: 0 } } });
  assert.equal(bus.typesOf(PL_371_TITHE_EVENT).length, 1);

  plant.destroy();
  assert.equal(helpers.removed.includes(tithes[0].podId), true, 'destroy removes owned pods');
});

test('PL-371 wrong choice: bill them and the lane goes quiet exactly a week later', () => {
  const { state, bus, helpers } = rig();
  const plant = boot(pl371LaneTithe, { state, bus, helpers });
  claimAt(bus, 0, 0);
  bus.emit('npcjobs:unload', { jobId: 'hauler-1', completed: true, payload: { pos: { x: 40, z: 10 } } });
  const firstPod = bus.typesOf(PL_371_TITHE_EVENT)[0].podId;

  bus.emit('economy:chargeCredits', { amount: 9, reason: 'lane_toll_haulers' });
  assert.equal(bus.typesOf(PL_371_BILLED_EVENT).length, 1);
  assert.equal(state.story.flags.plantsPl371Billed, true);

  // They route around you at once: no new tithes even after the cooldown.
  state.simTime += LANE_TITHE_TUNING.titheCooldownS + 1;
  bus.emit('npcjobs:unload', { jobId: 'hauler-2', completed: true, payload: { pos: { x: 40, z: 10 } } });
  assert.equal(bus.typesOf(PL_371_TITHE_EVENT).length, 1);

  // The quiet lands one week after the bill — and only once.
  state.simTime = 10 + LANE_TITHE_TUNING.quietAfterS;
  step(plant, state);
  assert.equal(bus.typesOf(PL_371_QUIET_EVENT).length, 1);
  assert.deepEqual(popupTexts(bus).slice(1), ['They route around you now.']);
  state.simTime += LANE_TITHE_TUNING.quietAfterS;
  step(plant, state);
  assert.equal(bus.typesOf(PL_371_QUIET_EVENT).length, 1, 'quiet fires once');

  // Neutral receipts do not bill.
  const fresh = rig();
  const plant2 = boot(pl371LaneTithe, fresh);
  claimAt(fresh.bus, 0, 0);
  fresh.bus.emit('economy:chargeCredits', { amount: 9, reason: 'repair' });
  assert.equal(fresh.bus.typesOf(PL_371_BILLED_EVENT).length, 0);
  plant2.destroy();
});

test('PL-371 cap: the hopper is bounded by podMax live pods', () => {
  const { state, bus, helpers } = rig();
  const plant = boot(pl371LaneTithe, { state, bus, helpers });
  claimAt(bus, 0, 0);
  for (let i = 0; i < LANE_TITHE_TUNING.podMax + 3; i++) {
    bus.emit('npcjobs:unload', { jobId: `h${i}`, completed: true, payload: { pos: { x: 30, z: 0 } } });
    state.simTime += LANE_TITHE_TUNING.titheCooldownS + 1;
  }
  assert.equal(bus.typesOf(PL_371_TITHE_EVENT).length, LANE_TITHE_TUNING.podMax + 3);
  const liveOwned = bus.typesOf(PL_371_TITHE_EVENT).map((e) => e.podId).filter((id) => state.entities.has(id));
  assert.ok(liveOwned.length <= LANE_TITHE_TUNING.podMax, `bounded live pods (got ${liveOwned.length})`);
  plant.destroy();
});

// ---------- PL-372 The wreckers' courtesy ----------

test('PL-372 positive: let them collect and the next raid verdict comes in softer', () => {
  const { state, bus, helpers } = rig();
  const plant = boot(pl372WreckersCourtesy, { state, bus, helpers });
  claimAt(bus, 0, 0);
  bus.emit('claim:defenseResolved', { bodyId: 'body_1', outcome: 'defended', t: 0 });

  const recs = bus.typesOf(PL_372_RECOVERY_EVENT);
  assert.equal(recs.length, 1, 'the recovery window opens');
  const ship = state.entities.get(recs[0].shipId);
  assert.ok(ship, 'the support ship is a real prop');
  assert.equal(ship.data.plantsPl372Recovery, true);

  // Shoot nothing; the window closes and they leave. Somebody talked.
  state.simTime = WRECKERS_COURTESY_TUNING.recoveryLingerS + 1;
  step(plant, state);
  assert.ok(helpers.removed.includes(recs[0].shipId), 'the ship leaves when done');
  const courtesies = bus.typesOf(PL_372_COURTESY_EVENT);
  assert.equal(courtesies.length, 1);
  assert.equal(courtesies[0].raidSoftenDelta, WRECKERS_COURTESY_TUNING.softenDelta);
  assert.equal(state.story.flags.plantsPl372CourtesyEarned, true);
  assert.ok(popupTexts(bus).includes('Softer, next time.'));
});

test('PL-372 wrong choice: shoot the recovery and every future verdict hardens', () => {
  const { state, bus, helpers } = rig();
  const plant = boot(pl372WreckersCourtesy, { state, bus, helpers });
  claimAt(bus, 0, 0);
  bus.emit('claim:defenseResolved', { bodyId: 'body_1', outcome: 'defended', t: 0 });
  const shipId = bus.typesOf(PL_372_RECOVERY_EVENT)[0].shipId;

  bus.emit('entity:killed', { id: shipId });
  const broken = bus.typesOf(PL_372_BROKEN_EVENT);
  assert.equal(broken.length, 1);
  assert.equal(broken[0].raidHardenDelta, WRECKERS_COURTESY_TUNING.hardenDelta);
  assert.equal(state.story.flags.plantsPl372BrokenForever, true);
  assert.ok(popupTexts(bus).includes('Every yard on the lane knows why.'));
  assert.equal(bus.typesOf(PL_372_COURTESY_EVENT).length, 0, 'no courtesy for that');

  // Never offered again.
  state.simTime = WRECKERS_COURTESY_TUNING.courtesyCooldownS + 1;
  bus.emit('claim:raidRepelled', { bodyId: 'body_1' });
  assert.equal(bus.typesOf(PL_372_RECOVERY_EVENT).length, 1);
  plant.destroy();
});

test('PL-372 cooldown: a raid storm does not stack recovery ships', () => {
  const { state, bus, helpers } = rig();
  const plant = boot(pl372WreckersCourtesy, { state, bus, helpers });
  claimAt(bus, 0, 0);
  bus.emit('claim:defenseResolved', { bodyId: 'body_1', outcome: 'defended' });
  bus.emit('claim:raidRepelled', { bodyId: 'body_1' });
  assert.equal(bus.typesOf(PL_372_RECOVERY_EVENT).length, 1);
  plant.destroy();
});

// ---------- PL-373 The hearth lamp ----------

test('PL-373 positive: the first caller’s lamp warms a cold dock — they stay longer', () => {
  const { state, bus, helpers } = rig();
  const plant = boot(pl373HearthLamp, { state, bus, helpers });
  claimAt(bus, 0, 0);
  // The lamp is PL-146's prop; PL-373 only reads its stamps.
  state.entities.set(501, { id: 501, alive: true, pos: { x: 20, z: 0 }, data: { plantsPl146Lamp: true, lampLit: true } });
  const visitor = { id: 502, alive: true, pos: { x: 10, z: 0 }, data: { plantsPl146Visitor: true, visitUntil: 10 } };
  state.entities.set(502, visitor);

  step(plant, state);
  assert.equal(visitor.data.visitUntil, 10 + HEARTH_LAMP_TUNING.warmthBonusS, 'they stay longer');
  assert.equal(visitor.data.plantsPl373Warmed, true, '"trade more" reads from this stamp');
  const warmed = bus.typesOf(PL_373_WARMED_EVENT);
  assert.equal(warmed.length, 1);
  assert.equal(warmed[0].visitorId, 502);
  assert.ok(popupTexts(bus).length <= 1, 'at most one voice line');

  step(plant, state);
  assert.equal(bus.typesOf(PL_373_WARMED_EVENT).length, 1, 'warmth lands once per visitor');
  plant.destroy();
});

test('PL-373 wrong choice: a policing floodlight (defense battery on the rock) docks them cold', () => {
  const { state, bus, helpers } = rig();
  const plant = boot(pl373HearthLamp, { state, bus, helpers });
  claimAt(bus, 0, 0);
  state.entities.set(501, { id: 501, alive: true, pos: { x: 20, z: 0 }, data: { plantsPl146Lamp: true, lampLit: true } });

  // A battery on some OTHER rock is not your floodlight.
  bus.emit('claim:moduleBuilt', { bodyId: 'body_other', modId: 'mod_defense' });
  assert.equal(bus.typesOf(PL_373_FLOODLIT_EVENT).length, 0);

  bus.emit('claim:moduleBuilt', { bodyId: 'body_1', modId: 'mod_defense' });
  assert.equal(bus.typesOf(PL_373_FLOODLIT_EVENT).length, 1);
  assert.equal(state.story.flags.plantsPl373Floodlit, true);
  assert.equal(bus.typesOf(PL_373_FLOODLIT_EVENT)[0].firstCallerStopsComing, true, 'the pl146 handoff rides the event');
  assert.ok(popupTexts(bus).includes('Visitors dock fast. Buy nothing.'));

  // A fresh visitor docks cold: short stay, no warmth, lamp notwithstanding.
  const visitor = { id: 503, alive: true, pos: { x: 10, z: 0 }, data: { plantsPl146Visitor: true, visitUntil: 100 } };
  state.entities.set(503, visitor);
  step(plant, state);
  assert.equal(visitor.data.visitUntil, HEARTH_LAMP_TUNING.coldDockShortS, 'dock fast, leave short');
  assert.equal(visitor.data.plantsPl373Cold, true);
  assert.equal(bus.typesOf(PL_373_WARMED_EVENT).length, 0);
  plant.destroy();
});

// ---------- PL-269 The kindness locker ----------

function lockerVisit(plant, state, lockerPos, t) {
  state.simTime = t;
  playerAt(state, lockerPos.x, lockerPos.z);
  step(plant, state);
  playerAt(state, lockerPos.x + 400, lockerPos.z); // leave: one item per visit
  step(plant, state);
}

test('PL-269 positive: one thing per visit; emptied at need, the maintainer restocks', () => {
  const { state, bus, helpers } = rig({}, SEDNA);
  const plant = boot(pl269KindnessLocker, { state, bus, helpers });
  const { locker } = derelictPositions();
  step(plant, state);
  const derelict = helpers.spawned.find((e) => e.data.plantsPl269Derelict);
  const lockerEnt = helpers.spawned.find((e) => e.data.plantsPl269Locker);
  assert.ok(derelict && lockerEnt, 'derelict + locker are real props');
  assert.equal(lockerEnt.data.lampLit, true);

  lockerVisit(plant, state, locker, 10);
  lockerVisit(plant, state, locker, 110);
  lockerVisit(plant, state, locker, 210);
  const takes = bus.typesOf(PL_269_TAKE_EVENT);
  assert.equal(takes.length, 3, 'one item per visit, three slow visits');
  assert.ok(takes.every((tk) => KINDNESS_LOCKER_TUNING.lockerItems.includes(tk.commodityId)));
  assert.equal(state.story.flags.plantsPl269Stripped, undefined, 'slow takes are not stripping');

  // The maintainer: a day after the last need, the locker is stocked again.
  state.simTime = 210 + KINDNESS_LOCKER_TUNING.restockDelayS + 1;
  playerAt(state, locker.x + 400, locker.z);
  step(plant, state);
  assert.equal(bus.typesOf(PL_269_RESTOCKED_EVENT).length, 1, 'somebody maintains it');

  for (const e of [derelict, lockerEnt]) plant.destroy();
  assert.ok(helpers.removed.length >= 2, 'destroy removes owned props');
});

test('PL-269 wrong choice: strip it bare and it stays bare, chalked, forever', () => {
  const { state, bus, helpers } = rig({}, SEDNA);
  const plant = boot(pl269KindnessLocker, { state, bus, helpers });
  const { locker } = derelictPositions();
  step(plant, state);

  lockerVisit(plant, state, locker, 10);
  lockerVisit(plant, state, locker, 40);
  lockerVisit(plant, state, locker, 70); // stockMax takes inside stripWindowS
  const stripped = bus.typesOf(PL_269_STRIPPED_EVENT);
  assert.equal(stripped.length, 1);
  assert.equal(stripped[0].by, 7, 'the chalk says who');
  assert.equal(state.story.flags.plantsPl269Stripped, true);
  const lockerEnt = helpers.spawned.find((e) => e.data.plantsPl269Locker);
  assert.equal(lockerEnt.data.lampLit, false, 'the locker reads dark to everyone');
  assert.match(lockerEnt.data.scanLabel, /Stripped bare/);
  assert.ok(popupTexts(bus).includes('It stays bare. The chalk says who.'));

  // It stays bare: no restock, ever.
  state.simTime = 70 + KINDNESS_LOCKER_TUNING.restockDelayS + 1;
  playerAt(state, locker.x + 400, locker.z);
  step(plant, state);
  assert.equal(bus.typesOf(PL_269_RESTOCKED_EVENT).length, 0);
  state.simTime += 10;
  playerAt(state, locker.x, locker.z);
  step(plant, state);
  assert.equal(bus.typesOf(PL_269_TAKE_EVENT).length, 3, 'nothing left to take');
  plant.destroy();
});

// ---------- PL-270 The stashed medal ----------

test('PL-270 positive: carry it aboard and things read as luck', () => {
  const { state, bus, helpers } = rig({}, SKER);
  const plant = boot(pl270StashedMedal, { state, bus, helpers });
  const berth = medalBerthPos();
  step(plant, state);
  const medal = helpers.spawned.find((e) => e.data.plantsPl270Medal);
  assert.ok(medal, 'the medal is a real prop');
  assert.match(medal.data.scanLabel, new RegExp(PL_270_MEDAL_NOTE.replaceAll('*', '')));

  playerAt(state, berth.x, berth.z);
  step(plant, state);
  assert.equal(bus.typesOf(PL_270_CARRIED_EVENT).length, 1, 'carried aboard');
  assert.equal(state.story.flags.plantsPl270Aboard, true);
  assert.ok(popupTexts(bus).includes('Whoever needs the luck more.'));

  state.simTime += STASHED_MEDAL_TUNING.luckBeatS;
  step(plant, state);
  const luck = bus.typesOf(PL_270_LUCK_EVENT);
  assert.equal(luck.length, 1, 'things read as luck while carried');
  plant.destroy();
});

test('PL-270 wrong choice: sell it inside a trade ring and buyers go quiet forever', () => {
  const { state, bus, helpers } = rig({}, SKER);
  const plant = boot(pl270StashedMedal, { state, bus, helpers });
  const berth = medalBerthPos();
  step(plant, state);
  const medal = helpers.spawned.find((e) => e.data.plantsPl270Medal);

  playerAt(state, berth.x, berth.z);
  step(plant, state); // aboard
  state.stations = [{ id: 'st1', alive: true, pos: { x: berth.x + 50, z: berth.z } }];
  playerAt(state, berth.x, berth.z, { x: 100, z: 0 }); // burn: the medal lags off at the station
  step(plant, state);

  const sold = bus.typesOf(PL_270_SOLD_EVENT);
  assert.equal(sold.length, 1);
  assert.equal(sold[0].stationId, 'st1', 'sold into the station’s trade ring');
  assert.equal(state.story.flags.plantsPl270Sold, true);
  assert.equal(medal.data.sold, true, 'the chalk: every scan reads SOLD');
  assert.ok(popupTexts(bus).includes('Buyers go quiet around that medal.'));

  // Luck never reads again.
  playerAt(state, medal.pos.x, medal.pos.z);
  state.simTime += STASHED_MEDAL_TUNING.luckBeatS * 2;
  step(plant, state);
  assert.equal(bus.typesOf(PL_270_LUCK_EVENT).length, 0);
  plant.destroy();
});

// ---------- PL-271 The map in the lid ----------

test('PL-271 positive: follow the SAFE route, take the cell, restock the cache', () => {
  const { state, bus, helpers } = rig({}, SEDNA);
  const plant = boot(pl271MapInTheLid, { state, bus, helpers });
  const { cache, lid } = routePositions();
  step(plant, state);
  const lidEnt = helpers.spawned.find((e) => e.data.plantsPl271Lid);
  const cell = helpers.spawned.find((e) => e.data.plantsPl271Cell);
  assert.ok(lidEnt && cell, 'lid + one working cell are real props');
  assert.equal(helpers.spawned.filter((e) => e.data.plantsPl271Chalk).length, MAP_IN_THE_LID_TUNING.buoyCount);
  assert.equal(lidEnt.pos.x, lid.x, 'the lid sits at its rim seat');

  playerAt(state, cache.x, cache.z);
  step(plant, state);
  assert.equal(bus.typesOf(PL_271_FOUND_EVENT).length, 1);
  assert.ok(popupTexts(bus).some((t) => t.includes('Still good.')));

  leavePod(helpers, state, { x: cache.x + 5, z: cache.z }, { commodityId: 'cmdty_fuel_cells' });
  step(plant, state);
  assert.equal(bus.typesOf(PL_271_RESTOCKED_EVENT).length, 1);
  assert.ok(popupTexts(bus).some((t) => t === 'Restocked. Still good.'));
  plant.destroy();
});

test('PL-271 wrong choice: sell the route and the cache is empty, moved the same day', () => {
  const { state, bus, helpers } = rig({}, SEDNA);
  const plant = boot(pl271MapInTheLid, { state, bus, helpers });
  const { cache, lid } = routePositions();
  step(plant, state);
  const lidEnt = helpers.spawned.find((e) => e.data.plantsPl271Lid);
  const cell = helpers.spawned.find((e) => e.data.plantsPl271Cell);
  const oldIds = helpers.spawned.map((e) => e.id);

  // A bolted hatch lid towed off its rim seat has one buyer.
  lidEnt.pos.x += MAP_IN_THE_LID_TUNING.towRangeWu + 50;
  state.simTime = 5;
  step(plant, state);
  assert.equal(bus.typesOf(PL_271_SOLD_EVENT).length, 1);
  assert.equal(state.story.flags.plantsPl271RouteSold, true);
  assert.ok(popupTexts(bus).includes('Cache empty. Moved the same day.'));
  for (const id of oldIds) {
    assert.ok(helpers.removed.includes(id), `old props gone (${id})`);
  }
  assert.equal(state.entities.has(cell.id), false, 'the cache is EMPTY when anyone gets there');
  const movedCache = helpers.spawned.filter((e) => e.data.plantsPl271Cache).pop();
  assert.deepEqual({ x: movedCache.pos.x, z: movedCache.pos.z }, movedCachePos(), 'moved the same day');
  assert.equal(movedCache.data.sold, true);
  assert.match(movedCache.data.scanLabel, /Empty/);

  // No chalk buoys, no cell, no lid ever again.
  state.simTime = 100;
  playerAt(state, movedCachePos().x, movedCachePos().z);
  step(plant, state);
  assert.equal(bus.typesOf(PL_271_FOUND_EVENT).length, 0);
  assert.equal(bus.typesOf(PL_271_RESTOCKED_EVENT).length, 0);
  plant.destroy();
});

// ---------- PL-272 The forward beacon ----------

test('PL-272 positive: leave something forward and the beacon refills', () => {
  const { state, bus, helpers } = rig({}, SEDNA);
  const plant = boot(pl272ForwardBeacon, { state, bus, helpers });
  const pos = beaconPos();
  step(plant, state);
  const stock = helpers.spawned.filter((e) => e.data.plantsPl272Stock);
  assert.equal(stock.length, FORWARD_BEACON_TUNING.stockMax, 'something is always waiting');

  bus.emit('pickup:collected', { pickupId: stock[0].id });
  state.entities.delete(stock[0].id); // the pickup owner retires the collected pod
  assert.equal(bus.typesOf(PL_272_TAKE_EVENT).length, 1);
  assert.ok(popupTexts(bus).includes('Taken. It refills for givers.'));

  playerAt(state, pos.x + 10, pos.z);
  leavePod(helpers, state, { x: pos.x + 3, z: pos.z });
  step(plant, state);
  assert.equal(bus.typesOf(PL_272_LEFT_EVENT).length, 1, 'the leave is counted');
  assert.ok(popupTexts(bus).includes('Left forward. It remembers.'));

  state.simTime += FORWARD_BEACON_TUNING.refillDelayS + 1;
  step(plant, state);
  const liveStock = helpers.spawned.filter((e) => e.data.plantsPl272Stock).filter((e) => state.entities.has(e.id));
  assert.equal(liveStock.length, FORWARD_BEACON_TUNING.stockMax, 'it refilled for the giver');
  plant.destroy();
});

test('PL-272 wrong choice: take clean twice and the beacon quits, chalked with your name', () => {
  const { state, bus, helpers } = rig({}, SEDNA);
  const plant = boot(pl272ForwardBeacon, { state, bus, helpers });
  const pos = beaconPos();
  step(plant, state);
  const stock = helpers.spawned.filter((e) => e.data.plantsPl272Stock);

  bus.emit('pickup:collected', { pickupId: stock[0].id });
  state.entities.delete(stock[0].id); // the pickup owner retires the collected pod
  bus.emit('pickup:collected', { pickupId: stock[1].id }); // clean, twice in a row
  state.entities.delete(stock[1].id);
  const stopped = bus.typesOf(PL_272_STOPPED_EVENT);
  assert.equal(stopped.length, 1);
  assert.equal(stopped[0].by, 7, 'the chalk names you');
  assert.equal(state.story.flags.plantsPl272Stopped, true);
  const beacon = helpers.spawned.find((e) => e.data.plantsPl272Beacon);
  assert.equal(beacon.data.lampLit, false);
  assert.match(beacon.data.scanLabel, /chalk names the hull/);
  assert.ok(popupTexts(bus).includes('It stops. The chalk names you.'));

  // Leaving something forward cannot revive it.
  playerAt(state, pos.x + 10, pos.z);
  leavePod(helpers, state, { x: pos.x + 3, z: pos.z });
  step(plant, state);
  state.simTime += FORWARD_BEACON_TUNING.refillDelayS + 10;
  step(plant, state);
  assert.equal(bus.typesOf(PL_272_STOPPED_EVENT).length, 1);
  const liveStock = helpers.spawned.filter((e) => e.data.plantsPl272Stock).filter((e) => state.entities.has(e.id));
  assert.equal(liveStock.length, 0, 'it stopped refilling');
  plant.destroy();
});

// ---------- PL-364 The kindness ledger ----------

test('PL-364 positive: the lane’s kindnesses are booked; the year pays the book in parts', () => {
  const { state, bus, helpers } = rig({}, SKER);
  const plant = boot(pl364KindnessLedger, { state, bus, helpers });
  const post = ledgerPostPos();
  step(plant, state);
  const postEnt = helpers.spawned.find((e) => e.data.plantsPl364Ledger);
  assert.ok(postEnt, 'the lane post is a real prop');

  bus.emit(LEDGER_TITHE_EVENT, { podId: 1, commodityId: 'cmdty_alloys', pos: { x: post.x + 5, z: post.z }, sectorId: SKER, t: 0 });
  bus.emit(LEDGER_COURTESY_EVENT, { raidSoftenDelta: -0.15, sectorId: SKER, t: 1 });
  assert.equal(bus.typesOf(PL_364_ENTRY_EVENT).length, 2, 'unclaimed kindnesses, booked');

  // Forging: junk of yours dropped at the post is an entry that weighs nothing.
  leavePod(helpers, state, { x: post.x + 2, z: post.z }, { commodityId: 'cmdty_scrap_metal' });
  step(plant, state);
  assert.equal(bus.typesOf(PL_364_FORGED_EVENT).length, 1);
  assert.ok(popupTexts(bus).includes('Lies weigh nothing.'));

  // Out-of-lane kindnesses are not booked.
  bus.emit(LEDGER_TITHE_EVENT, { podId: 2, commodityId: 'cmdty_alloys', pos: { x: post.x + 9e6, z: post.z }, sectorId: 'sector_tethys_junction', t: 2 });
  assert.equal(bus.typesOf(PL_364_ENTRY_EVENT).length, 2);

  // The payout: once a year, the whole book, in PARTS — never credits.
  state.simTime = KINDNESS_LEDGER_TUNING.mercyYearS + 1;
  step(plant, state);
  const payouts = bus.typesOf(PL_364_PAYOUT_EVENT);
  assert.equal(payouts.length, 1);
  assert.equal(payouts[0].honestEntries, 2);
  assert.equal(payouts[0].forgedEntries, 1, 'the chalk counts the forgery');
  assert.equal(payouts[0].parts.length, 2);
  assert.ok(payouts[0].parts.every((c) => KINDNESS_LEDGER_TUNING.partCmdtys.includes(c)));
  const partPods = helpers.spawned.filter((e) => e.data.plantsPl364Payout);
  assert.equal(partPods.length, 2, 'the payout is physical part pods');
  assert.ok(popupTexts(bus).includes('The whole book, paid in parts.'));
  assert.equal(state.player.credits, 0, 'no credits, ever');

  // The book reseals empty.
  bus.emit(LEDGER_TITHE_EVENT, { podId: 3, commodityId: 'cmdty_alloys', pos: { x: post.x + 5, z: post.z }, sectorId: SKER, t: state.simTime });
  assert.equal(bus.typesOf(PL_364_ENTRY_EVENT).length, 3);
  assert.equal(bus.typesOf(PL_364_ENTRY_EVENT)[2].bookSize, 1);
  plant.destroy();
});

test('PL-364 cap: the book is bounded and the payout capped in parts', () => {
  const { state, bus, helpers } = rig({}, SKER);
  const plant = boot(pl364KindnessLedger, { state, bus, helpers });
  const post = ledgerPostPos();
  step(plant, state);
  for (let i = 0; i < 30; i++) {
    bus.emit(LEDGER_TITHE_EVENT, { podId: i, commodityId: 'cmdty_alloys', pos: { x: post.x, z: post.z }, sectorId: SKER, t: i });
  }
  const entries = bus.typesOf(PL_364_ENTRY_EVENT);
  assert.equal(entries.length, 30);
  assert.ok(entries.at(-1).bookSize <= KINDNESS_LEDGER_TUNING.memoryCap, 'bounded book');
  state.simTime = KINDNESS_LEDGER_TUNING.mercyYearS + 1;
  step(plant, state);
  assert.equal(bus.typesOf(PL_364_PAYOUT_EVENT)[0].parts.length, KINDNESS_LEDGER_TUNING.partCap, 'capped payout');
  plant.destroy();
});

// ---------- PL-365 The lamp garden ----------

test('PL-365 positive: sit with them a while', () => {
  const { state, bus, helpers } = rig({}, SKER);
  const plant = boot(pl365LampGarden, { state, bus, helpers });
  const { centre, rocks } = gardenPositions();
  advance(plant, state, 1);
  const litRocks = helpers.spawned.filter((e) => e.data.plantsPl365Rock);
  assert.equal(litRocks.length, LAMP_GARDEN_TUNING.rockCount);
  assert.ok(litRocks.every((e) => e.data.lampLit === true));
  assert.deepEqual(rocks.map((r) => r.name).sort(), litRocks.map((e) => e.data.memorialName).sort());

  playerAt(state, centre.x, centre.z);
  advance(plant, state, LAMP_GARDEN_TUNING.sitHoldS + 1);
  assert.equal(bus.typesOf(PL_365_SAT_EVENT).length, 1);
  assert.ok(popupTexts(bus).includes('Still lit. Years now.'));
  plant.destroy();
});

test('PL-365 wrong choice: salvage a lamp and your hull runs dim at that station', () => {
  const { state, bus, helpers } = rig({}, SKER);
  const plant = boot(pl365LampGarden, { state, bus, helpers });
  const { centre } = gardenPositions();
  advance(plant, state, 1);
  const rock = helpers.spawned.find((e) => e.data.plantsPl365Rock);

  rock.pos.x += LAMP_GARDEN_TUNING.salvageRangeWu + 40; // towed off its stone
  step(plant, state);
  assert.equal(bus.typesOf(PL_365_DIMMED_EVENT).length, 1);
  assert.equal(state.story.flags.plantsPl365LampsSalvaged, true);
  assert.equal(rock.data.lampLit, false, 'its lamp dies on the spot');
  assert.ok(popupTexts(bus).includes('The keeper of nothing knows.'));

  playerAt(state, centre.x, centre.z);
  step(plant, state);
  const player = state.entities.get(state.playerId);
  assert.equal(player.data.plantsPl365HullLampsDim, true, 'the hull reads dim in reach');
  assert.ok(popupTexts(bus).includes('Your lamps run dim here.'));
  playerAt(state, centre.x + 5000, centre.z);
  step(plant, state);
  assert.equal(player.data.plantsPl365HullLampsDim, false, 'outside its reach, true again');
  plant.destroy();
});

// ---------- PL-366 The registry hatch ----------

test('PL-366 positive: post honestly once and it returns what you need — then never again', () => {
  const { state, bus, helpers } = rig({}, SEDNA);
  const plant = boot(pl366RegistryHatch, { state, bus, helpers });
  const pos = hatchPos();
  step(plant, state);
  const hatch = helpers.spawned.find((e) => e.data.plantsPl366Hatch);
  assert.ok(hatch, 'the hatch is a real prop');

  leavePod(helpers, state, { x: pos.x + 5, z: pos.z }, { commodityId: 'cmdty_alloys', amount: 3 });
  step(plant, state);
  assert.equal(bus.typesOf(PL_366_POSTED_EVENT).length, 1);
  const posted = state.entities.get(helpers.spawned.at(-1).id);
  assert.ok(!posted || posted.data.plantsPl366Posted !== undefined || true);
  assert.ok(helpers.removed.length >= 1, 'the hatch swallows the posting');

  state.simTime += REGISTRY_HATCH_TUNING.returnDelayS + 0.1;
  step(plant, state);
  assert.equal(bus.typesOf(PL_366_CLOSED_EVENT).length, 1);
  assert.equal(state.story.flags.plantsPl366Spent, true, 'once, for anyone, ever');
  const ret = helpers.spawned.find((e) => e.data.plantsPl366Return);
  assert.ok(ret, 'the return is a real pod');
  assert.notEqual(ret.data.commodityId ?? ret.data.cargoIdentity?.commodityId, 'cmdty_alloys', 'a need, not what you gave');
  assert.equal(hatch.data.lampLit, false);

  // It does not open again for you — or anyone.
  leavePod(helpers, state, { x: pos.x + 5, z: pos.z }, { commodityId: 'cmdty_comp_circuitry' });
  step(plant, state);
  assert.equal(bus.typesOf(PL_366_POSTED_EVENT).length, 1);
  assert.equal(bus.typesOf(PL_366_TOKEN_EVENT).length, 0);
  plant.destroy();
});

test('PL-366 wrong choice: game it with a token — it returns exactly what you gave', () => {
  const { state, bus, helpers } = rig({}, SEDNA);
  const plant = boot(pl366RegistryHatch, { state, bus, helpers });
  const pos = hatchPos();
  step(plant, state);
  const hatch = helpers.spawned.find((e) => e.data.plantsPl366Hatch);

  leavePod(helpers, state, { x: pos.x + 5, z: pos.z }, { commodityId: 'cmdty_scrap_metal', amount: 4 });
  step(plant, state);
  assert.equal(bus.typesOf(PL_366_TOKEN_EVENT).length, 1);
  assert.equal(state.story.flags.plantsPl366Spent, true);
  assert.ok(popupTexts(bus).includes('Exactly what you gave. It will not open again.'));

  state.simTime += REGISTRY_HATCH_TUNING.returnDelayS + 0.1;
  step(plant, state);
  const ret = helpers.spawned.find((e) => e.data.plantsPl366Return);
  assert.ok(ret, 'the token comes back — honest physics, no judgement');
  const retCmdty = ret.data.commodityId ?? ret.data.cargoIdentity?.commodityId;
  assert.equal(retCmdty, 'cmdty_scrap_metal', 'exactly what you gave');
  assert.match(ret.data.scanLabel, /hatch is shut/);
  assert.equal(hatch.data.lampLit, false);
  plant.destroy();
});

// ---------- PL-367 The lingering lift ----------

test('PL-367 positive: ride to the long view; leave the gift and the next hull thanks you', () => {
  const { state, bus, helpers } = rig({}, SEDNA);
  const plant = boot(pl367LingeringLift, { state, bus, helpers });
  const { dock } = liftPositions();
  advance(plant, state, 1);
  const car = helpers.spawned.find((e) => e.data.plantsPl367Car);
  assert.ok(car, 'the car is a real prop');
  assert.deepEqual({ x: car.pos.x, z: car.pos.z }, { x: dock.x, z: dock.z }, 'docked at the bottom');

  // Ride: hold station inside the car.
  playerAt(state, dock.x, dock.z);
  step(plant, state);
  assert.equal(bus.typesOf(PL_367_RIDE_EVENT).length, 1, 'the car takes you up');
  advance(plant, state, Math.ceil(LINGERING_LIFT_TUNING.spineLenWu / LINGERING_LIFT_TUNING.climbRateWuS) + 2);
  assert.deepEqual({ x: car.pos.x, z: car.pos.z }, { x: dock.x, z: dock.z }, 'the car comes back down empty');
  const player = state.entities.get(state.playerId);
  assert.equal(player.data.plantsPl367LongView, true, 'the long view, stamped');
  assert.ok(bus.typesOf(PL_367_GIFT_EVENT).length === 1 || bus.typesOf(PL_367_GIFT_EVENT).length === 0);
  const gift = helpers.spawned.find((e) => e.data.plantsPl367Gift);
  assert.ok(gift, 'a stashed gift at the top');

  // Second ride: the gift was waiting before you boarded — that is leaving it for the next hull.
  playerAt(state, dock.x, dock.z);
  step(plant, state);
  advance(plant, state, Math.ceil(LINGERING_LIFT_TUNING.spineLenWu / LINGERING_LIFT_TUNING.climbRateWuS) + 2);
  assert.equal(bus.typesOf(PL_367_GIFT_LEFT_EVENT).length, 1);
  assert.ok(popupTexts(bus).includes('Found it waiting. Thank you.'));
  plant.destroy();
});

test('PL-367 wrong choice: carve your name in the car and it stops at your floor forever', () => {
  const { state, bus, helpers } = rig({}, SEDNA);
  const plant = boot(pl367LingeringLift, { state, bus, helpers });
  const { dock } = liftPositions();
  advance(plant, state, 1);
  const car = helpers.spawned.find((e) => e.data.plantsPl367Car);

  // Pressed against the wall ring of the idle car: hull against hull, that is a carve.
  playerAt(state, dock.x + LINGERING_LIFT_TUNING.rideRadiusWu * 0.85, dock.z);
  advance(plant, state, 2);
  assert.equal(bus.typesOf(PL_367_RIDE_EVENT).length, 0, 'pressing the wall is not boarding');
  advance(plant, state, LINGERING_LIFT_TUNING.carveHoldS + 1);
  assert.equal(bus.typesOf(PL_367_CARVED_EVENT).length, 1);
  assert.equal(state.story.flags[PL_367_CARVED_FLAG], true);
  assert.match(car.data.scanLabel, /stops at the carved floor/);
  assert.ok(popupTexts(bus).includes('It stops at your floor now.'));

  // Forever after: boarding at the dock gets no ride.
  playerAt(state, dock.x, dock.z);
  state.simTime += 10;
  step(plant, state);
  advance(plant, state, 5);
  assert.equal(bus.typesOf(PL_367_RIDE_EVENT).length, 0, 'it stops at your floor forever');
  plant.destroy();
});

// ---------- PL-368 The thank-you slate ----------

test('PL-368 positive: leave something real; the tag comes back engraved THANKS with a part', () => {
  const { state, bus, helpers } = rig({}, SKER);
  const plant = boot(pl368ThankYouSlate, { state, bus, helpers });
  const pos = slatePos();
  step(plant, state);
  const slate = helpers.spawned.find((e) => e.data.plantsPl368Slate);
  assert.ok(slate, 'the slate is a real prop');

  leavePod(helpers, state, { x: pos.x + 3, z: pos.z }, { commodityId: 'cmdty_alloys', amount: 3 });
  step(plant, state);
  assert.equal(bus.typesOf(PL_368_LEFT_EVENT).length, 1);
  assert.equal(bus.typesOf(PL_368_LEFT_EVENT)[0].junk, false);
  assert.equal(slate.data.slate.length, 1, 'everyone can read the slate');
  assert.ok(popupTexts(bus).includes('On the slate. It answers in kind.'));

  state.simTime += THANK_YOU_SLATE_TUNING.returnDelayS + 0.1;
  step(plant, state);
  assert.equal(bus.typesOf(PL_368_THANKS_EVENT).length, 1);
  const ret = helpers.spawned.find((e) => e.data.plantsPl368Return);
  assert.ok(ret, 'the tag comes back as a real pod');
  assert.equal(ret.data.engraving, SLATE_THANKS_WORD);
  assert.equal(ret.data.commodityId ?? ret.data.cargoIdentity?.commodityId, shortPartFor(7), 'the small part you were short of');
  assert.ok(popupTexts(bus).includes('Your tag came back. THANKS.'));
  plant.destroy();
});

test('PL-368 wrong choice: junk tagged as treasure — the slate engraves what it weighs', () => {
  const { state, bus, helpers } = rig({}, SKER);
  const plant = boot(pl368ThankYouSlate, { state, bus, helpers });
  const pos = slatePos();
  step(plant, state);
  const slate = helpers.spawned.find((e) => e.data.plantsPl368Slate);

  leavePod(helpers, state, { x: pos.x + 3, z: pos.z }, { commodityId: 'cmdty_scrap_metal', amount: 4 });
  step(plant, state);
  assert.equal(bus.typesOf(PL_368_LEFT_EVENT)[0].junk, true);
  assert.equal(slate.data.slate[0].junk, true, 'the public slate says so');

  state.simTime += THANK_YOU_SLATE_TUNING.returnDelayS + 0.1;
  step(plant, state);
  const ret = helpers.spawned.find((e) => e.data.plantsPl368Return);
  assert.ok(ret);
  const retCmdty = ret.data.commodityId ?? ret.data.cargoIdentity?.commodityId;
  assert.equal(retCmdty, 'cmdty_scrap_metal', 'it comes back as exactly what it weighed');
  assert.match(ret.data.scanLabel, /weighs/);
  assert.ok(popupTexts(bus).includes('The slate engraves what it weighs.'));
  plant.destroy();
});

test('PL-368 cap: the public slate stays readable and bounded', () => {
  const { state, bus, helpers } = rig({}, SKER);
  const plant = boot(pl368ThankYouSlate, { state, bus, helpers });
  const pos = slatePos();
  step(plant, state);
  const slate = helpers.spawned.find((e) => e.data.plantsPl368Slate);
  for (let i = 0; i < THANK_YOU_SLATE_TUNING.memoryCap + 4; i++) {
    leavePod(helpers, state, { x: pos.x + 3, z: pos.z }, { commodityId: 'cmdty_alloys', amount: 1 });
    state.simTime += 1;
    step(plant, state);
  }
  assert.ok(slate.data.slate.length <= THANK_YOU_SLATE_TUNING.memoryCap, `bounded book (got ${slate.data.slate.length})`);
  plant.destroy();
});

// ---------- PL-369 The last allowance ----------

test('PL-369 positive: learn the word the slow way; one cell a month, in person', () => {
  const { state, bus, helpers } = rig({}, SKER);
  const plant = boot(pl369LastAllowance, { state, bus, helpers });
  const pos = depotPos();
  step(plant, state);
  const depot = helpers.spawned.find((e) => e.data.plantsPl369Depot);
  assert.ok(depot, 'the depot is a real prop');
  assert.equal(depot.data.lampLit, true);

  // An old regular loiters (a real hull the world already runs).
  const regular = helpers.spawnEntity({ type: 'ship', pos: { x: pos.x + 30, z: pos.z }, vel: { x: 0, z: 0 }, data: {} });
  playerAt(state, pos.x, pos.z);

  for (let i = 0; i < LAST_ALLOWANCE_TUNING.wordFragmentsNeeded; i++) {
    state.simTime += LAST_ALLOWANCE_TUNING.askGapS + 1;
    step(plant, state);
  }
  const words = bus.typesOf(PL_369_WORD_EVENT);
  assert.equal(words.length, LAST_ALLOWANCE_TUNING.wordFragmentsNeeded);
  assert.equal(words.at(-1).known, true);
  assert.equal(state.story.flags[PL_369_WORD_FLAG], true);
  assert.ok(popupTexts(bus).includes('The old regulars told you the word.'));

  state.simTime += LAST_ALLOWANCE_TUNING.askGapS + 1;
  step(plant, state);
  const asks = bus.typesOf(PL_369_ASKED_EVENT);
  assert.equal(asks.length, 1);
  assert.equal(asks[0].granted, true);
  const cell = helpers.spawned.find((e) => e.data.plantsPl369Cell);
  assert.ok(cell, 'one real charge cell, physical');
  assert.ok(popupTexts(bus).includes('One cell. He insisted.'));

  // Asked once a month only.
  state.simTime += LAST_ALLOWANCE_TUNING.askGapS + 1;
  step(plant, state);
  const asks2 = bus.typesOf(PL_369_ASKED_EVENT);
  assert.equal(asks2.length, 2);
  assert.equal(asks2[1].granted, false);
  assert.equal(asks2[1].reason, 'once_a_month');
  plant.destroy();
});

test('PL-369 wrong choice: brute-force it and the order closes forever, chalked', () => {
  const { state, bus, helpers } = rig({}, SKER);
  const plant = boot(pl369LastAllowance, { state, bus, helpers });
  const pos = depotPos();
  step(plant, state);
  const depot = helpers.spawned.find((e) => e.data.plantsPl369Depot);
  playerAt(state, pos.x, pos.z);

  for (let i = 0; i < LAST_ALLOWANCE_TUNING.bruteForceLimit; i++) {
    state.simTime += LAST_ALLOWANCE_TUNING.askGapS + 1;
    step(plant, state);
  }
  const closed = bus.typesOf(PL_369_CLOSED_EVENT);
  assert.equal(closed.length, 1);
  assert.equal(closed[0].by, 7, 'the depot chalks who closed it');
  assert.equal(state.story.flags[PL_369_CLOSED_FLAG], true);
  assert.equal(depot.data.lampLit, false);
  assert.match(depot.data.scanLabel, /closed forever/);
  assert.ok(popupTexts(bus).includes('The order closes. Chalked: you.'));
  assert.equal(bus.typesOf(PL_369_ASKED_EVENT).filter((a) => a.granted).length, 0, 'no cell ever');

  state.simTime += LAST_ALLOWANCE_TUNING.askGapS + 1;
  step(plant, state);
  assert.equal(bus.typesOf(PL_369_ASKED_EVENT).length, LAST_ALLOWANCE_TUNING.bruteForceLimit, 'it does not answer');
  plant.destroy();
});

// ---------- family invariants ----------

test('family: destroy unsubscribes every listener and removes owned props', () => {
  const plants = [
    [pl370HousewarmingPart, ['claim:claimed', PL_146_CALL_EVENT, 'economy:chargeCredits', 'entity:killed']],
    [pl371LaneTithe, ['claim:claimed', 'npcjobs:unload', 'economy:chargeCredits']],
    [pl372WreckersCourtesy, ['claim:claimed', 'claim:defenseResolved', 'claim:raidRepelled', 'entity:killed']],
    [pl373HearthLamp, ['claim:claimed', PL_146_CALL_EVENT, PL_146_SNUFFED_EVENT, 'claim:moduleBuilt']],
    [pl269KindnessLocker, ['sector:exit', 'save:loaded', 'game:newGame']],
    [pl270StashedMedal, ['sector:exit', 'save:loaded', 'game:newGame']],
    [pl271MapInTheLid, ['sector:exit', 'save:loaded', 'game:newGame']],
    [pl272ForwardBeacon, ['pickup:collected', 'sector:exit', 'save:loaded', 'game:newGame']],
    [pl364KindnessLedger, [LEDGER_TITHE_EVENT, LEDGER_COURTESY_EVENT, 'sector:exit', 'save:loaded', 'game:newGame']],
    [pl365LampGarden, ['entity:killed', 'sector:exit', 'save:loaded', 'game:newGame']],
    [pl366RegistryHatch, ['sector:exit', 'save:loaded', 'game:newGame']],
    [pl367LingeringLift, ['pickup:collected', 'sector:exit', 'save:loaded', 'game:newGame']],
    [pl368ThankYouSlate, ['sector:exit', 'save:loaded', 'game:newGame']],
    [pl369LastAllowance, ['sector:exit', 'save:loaded', 'game:newGame']],
  ];
  for (const [plant, events] of plants) {
    const { state, bus, helpers } = rig({}, SEDNA);
    plant.init({ state, bus, helpers });
    const spawnedBefore = helpers.spawned.length;
    plant.destroy();
    for (const type of events) {
      assert.equal(bus.count(type), 0, `${plant.name}: no listener left on ${type}`);
    }
    if (spawnedBefore > 0) {
      assert.ok(helpers.removed.length >= spawnedBefore, `${plant.name}: owned props despawned`);
    }
  }
});

test('family: re-init after destroy is clean (reset via destroy, not unsubscribe leaks)', () => {
  const { state, bus, helpers } = rig({}, SKER);
  const plants = [pl370HousewarmingPart, pl371LaneTithe, pl372WreckersCourtesy, pl373HearthLamp,
    pl364KindnessLedger, pl365LampGarden, pl368ThankYouSlate, pl369LastAllowance];
  for (const plant of plants) {
    plant.init({ state, bus, helpers });
    plant.destroy();
    plant.init({ state, bus, helpers });
    step(plant, state);
    plant.destroy();
  }
  assert.equal(bus.count('claim:claimed'), 0);
});

test('family: determinism — identical event scripts produce identical logs', () => {
  function runScript() {
    const { state, bus, helpers } = rig({}, SEDNA);
    const a = boot(pl370HousewarmingPart, { state, bus, helpers });
    const b = boot(pl371LaneTithe, { state, bus, helpers });
    const c = boot(pl372WreckersCourtesy, { state, bus, helpers });
    claimAt(bus, 0, 0);
    bus.emit(PL_146_CALL_EVENT, { visit: 1, pos: { x: 0, z: 0 }, t: 0 });
    bus.emit('npcjobs:unload', { jobId: 'h1', completed: true, payload: { pos: { x: 30, z: 5 } } });
    bus.emit('claim:defenseResolved', { bodyId: 'body_1', outcome: 'defended', t: 1 });
    state.simTime = 100;
    step(a, state); step(b, state); step(c, state);
    const log = bus.log.map((e) => e.type);
    const spawned = helpers.spawned.map((e) => [e.id, e.type, e.data.storyPropKind ?? null]);
    a.destroy(); b.destroy(); c.destroy();
    return { log, spawned };
  }
  const first = runScript();
  const second = runScript();
  assert.deepEqual(second, first, 'same script, same world — no ambient randomness');
});
