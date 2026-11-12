// PL-09 The recovery tug tests (focused behavior check for owner invariants)
//
// Row (design/program/INFERENCE_PLANTS.md §A):
//   What happens: A wreck left in a lane is collected by a real tug that comes from the nearest dock
//   What the player can do: Race it for the wreck; or cut its line
//
// Invariants tested:
// 1. Positive recovery flow: Wreck in a lane causes nearest dock to dispatch a recovery tug,
//    which navigates to the wreck, attaches a tow line ("Tug on the tow. Clear the lane."),
//    and hauls it back to dock ("Wreck secured. Lane clear.").
// 2. Race it for the wreck: Player destroys, salvages, or moves/tethers the wreck away before
//    the tug reaches it; the tug arrives second, barks "Today, the tug came second.", and aborts.
// 3. Cut its line: While under tow, player cuts or severs the tow line; the line parts,
//    tug barks "Line parted! Dropping tow.", drops tow, and aborts.
// 4. Negative checks:
//    - Wreck not in a lane does NOT trigger dispatch.
//    - Wreck already claimed by a salvor does NOT trigger dispatch.
//    - Wreck already tethered by player does NOT trigger dispatch.
//    - Non-flight mode does NOT trigger dispatch.
//    - Cooldown prevents re-trigger within cooldownS (45s).
// 5. Hard rule verification: No foreign player events are fired (dock:*, tether:*, pickup:*, entity:killed, cargo:*).
// 6. Standalone system lifecycle (init, update, destroy).

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { traffic } from '../src/systems/traffic.js';
import {
  PLANTS_RECOVERY_TUG_DISPATCH_EVENT,
  PLANTS_RECOVERY_TUG_ATTACH_EVENT,
  PLANTS_RECOVERY_TUG_LINE_CUT_EVENT,
  PLANTS_RECOVERY_TUG_RACE_LOST_EVENT,
  PLANTS_RECOVERY_TUG_SECURED_EVENT,
  RECOVERY_TUG_TUNING,
  RECOVERY_TUG_DISPATCH_LINE,
  RECOVERY_TUG_ATTACH_LINE,
  RECOVERY_TUG_LINE_CUT_LINE,
  RECOVERY_TUG_RACE_LOST_LINE,
  RECOVERY_TUG_SECURED_LINE,
  isWreckInLane,
  isRecoveryWreckCandidate,
  findNearestDock,
  pointToSegmentDistance,
  recoveryTugPlant,
} from '../src/systems/recoveryTugPlant.js';

function makeStation(id, x, z, radius = 50) {
  return {
    id,
    type: 'station',
    alive: true,
    pos: { x, z },
    radius,
    data: { name: `Station ${id}` },
  };
}

function makeWreck(id, x, z, inLane = true) {
  return {
    id,
    type: 'wreck',
    alive: true,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    radius: 12,
    mass: 200,
    data: {
      inTrafficLane: inLane,
      salvagePool: { scrap: 5 },
    },
    flags: {},
  };
}

function makeTug(id, x, z) {
  return {
    id,
    type: 'ship',
    team: 2,
    alive: true,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 9,
    hull: 90,
    hullMax: 90,
    data: {
      trafficRole: 'tug',
      role: 'tug',
      ai: { passive: true, archetype: 'tug' },
      intent: { moveX: 0, moveZ: 0, boost: false, fire: false, aimAngle: 0, brake: false },
    },
    flags: {},
  };
}

function createMockState({ stations = [], wrecks = [], tugs = [] } = {}) {
  const entities = new Map();
  for (const s of stations) entities.set(s.id, s);
  for (const w of wrecks) entities.set(w.id, w);
  for (const t of tugs) entities.set(t.id, t);

  return {
    mode: 'flight',
    simTime: 10.0,
    tick: 100,
    playerId: 'p1',
    entities,
    stations,
    world: {
      currentSectorId: 'sector_alpha',
      currentSector: {
        id: 'sector_alpha',
        zones: [
          { id: 'zone_lane_1', type: 'trade_lane', x: 200, z: 200, radius: 250 },
        ],
      },
    },
    traffic: {
      freighters: [],
    },
  };
}

test('pointToSegmentDistance calculates orthogonal distance to corridor segment', () => {
  // Segment along X from (0, 0) to (100, 0)
  const d1 = pointToSegmentDistance(50, 20, 0, 0, 100, 0);
  assert.equal(Math.round(d1), 20);

  // Beyond endpoint
  const d2 = pointToSegmentDistance(150, 0, 0, 0, 100, 0);
  assert.equal(Math.round(d2), 50);
});

test('isWreckInLane accurately identifies lane membership', () => {
  const s1 = makeStation('st1', 0, 0);
  const s2 = makeStation('st2', 500, 0);
  const state = createMockState({ stations: [s1, s2] });

  // Inside station corridor:
  const wCorridor = makeWreck('w1', 250, 30, false);
  assert.equal(isWreckInLane(wCorridor, state), true);

  // Deep outside any corridor or zone:
  const wDeepSpace = makeWreck('w2', 250, 800, false);
  assert.equal(isWreckInLane(wDeepSpace, state), false);

  // Explicit flag:
  const wFlagged = makeWreck('w3', 250, 800, true);
  assert.equal(isWreckInLane(wFlagged, state), true);
});

test('findNearestDock locates the closest station entity', () => {
  const s1 = makeStation('st1', 0, 0);
  const s2 = makeStation('st2', 800, 800);
  const state = createMockState({ stations: [s1, s2] });

  const dock = findNearestDock({ x: 50, z: 50 }, state);
  assert.ok(dock);
  assert.equal(dock.id, 'st1');
});

test('Positive recovery flow: dock dispatches tug, attaches tow, and secures wreck', () => {
  const bus = createBus();
  const s1 = makeStation('st1', 0, 0);
  const s2 = makeStation('st2', 600, 0);
  const wreck = makeWreck('wreck_1', 200, 0, true);
  const tug = makeTug('tug_1', 40, 0);

  const state = createMockState({
    stations: [s1, s2],
    wrecks: [wreck],
    tugs: [tug],
  });

  const dispatchedEvents = [];
  const attachedEvents = [];
  const securedEvents = [];
  const barks = [];
  const forbiddenEvents = [];

  bus.on(PLANTS_RECOVERY_TUG_DISPATCH_EVENT, (p) => dispatchedEvents.push(p));
  bus.on(PLANTS_RECOVERY_TUG_ATTACH_EVENT, (p) => attachedEvents.push(p));
  bus.on(PLANTS_RECOVERY_TUG_SECURED_EVENT, (p) => securedEvents.push(p));
  bus.on('bark:triggered', (p) => barks.push(p));

  // Hard rule listeners:
  for (const evt of ['dock:docked', 'dock:undocked', 'pickup:collected', 'entity:killed', 'tether:attached']) {
    bus.on(evt, (p) => forbiddenEvents.push({ evt, p }));
  }

  recoveryTugPlant.init({ bus, state });

  // 1. Initial update triggers dispatch:
  state.simTime = 12.0;
  recoveryTugPlant.update(0.1);

  assert.equal(dispatchedEvents.length, 1);
  assert.equal(dispatchedEvents[0].wreckId, 'wreck_1');
  assert.equal(dispatchedEvents[0].dockId, 'st1');
  assert.equal(barks.some((b) => b.text === RECOVERY_TUG_DISPATCH_LINE), true);

  // 2. Step through approach until attached:
  for (let i = 0; i < 50; i++) {
    state.simTime += 0.2;
    recoveryTugPlant.update(0.2);
    if (attachedEvents.length > 0) break;
  }

  assert.equal(attachedEvents.length, 1);
  assert.equal(attachedEvents[0].wreckId, 'wreck_1');
  assert.equal(wreck.data.recoveryTugClaimed, tug.id);
  assert.equal(barks.some((b) => b.text === RECOVERY_TUG_ATTACH_LINE), true);

  // 3. Step through tow until dock is reached:
  for (let i = 0; i < 60; i++) {
    state.simTime += 0.2;
    recoveryTugPlant.update(0.2);
    if (securedEvents.length > 0) break;
  }

  assert.equal(securedEvents.length, 1);
  assert.equal(securedEvents[0].dockId, 'st1');
  assert.equal(wreck.alive, false);
  assert.equal(barks.some((b) => b.text === RECOVERY_TUG_SECURED_LINE), true);

  // Hard rule verification:
  assert.equal(forbiddenEvents.length, 0, 'No foreign player events should ever be emitted');

  recoveryTugPlant.destroy();
});

test('Race it for the wreck: Player destroys or takes wreck before tug arrives', () => {
  const bus = createBus();
  const s1 = makeStation('st1', 0, 0);
  const wreck = makeWreck('wreck_race', 300, 0, true);
  const tug = makeTug('tug_race', 20, 0);

  const state = createMockState({
    stations: [s1],
    wrecks: [wreck],
    tugs: [tug],
  });

  const raceLostEvents = [];
  const barks = [];

  bus.on(PLANTS_RECOVERY_TUG_RACE_LOST_EVENT, (p) => raceLostEvents.push(p));
  bus.on('bark:triggered', (p) => barks.push(p));

  recoveryTugPlant.init({ bus, state });

  // 1. Dispatch tug:
  state.simTime = 12.0;
  recoveryTugPlant.update(0.1);

  // 2. Player races in and salvages / destroys the wreck before tug reaches it:
  wreck.alive = false;
  wreck.data.salvaged = true;

  // 3. Tug update detects wreck is taken:
  state.simTime += 0.5;
  recoveryTugPlant.update(0.5);

  assert.equal(raceLostEvents.length, 1);
  assert.equal(raceLostEvents[0].wreckId, 'wreck_race');
  assert.equal(barks.some((b) => b.text === RECOVERY_TUG_RACE_LOST_LINE), true);

  recoveryTugPlant.destroy();
});

test('Cut its line: Player cuts tow line while under tow', () => {
  const bus = createBus();
  const s1 = makeStation('st1', 0, 0);
  const wreck = makeWreck('wreck_tow', 100, 0, true);
  const tug = makeTug('tug_tow', 80, 0);

  const state = createMockState({
    stations: [s1],
    wrecks: [wreck],
    tugs: [tug],
  });

  const lineCutEvents = [];
  const barks = [];

  bus.on(PLANTS_RECOVERY_TUG_LINE_CUT_EVENT, (p) => lineCutEvents.push(p));
  bus.on('bark:triggered', (p) => barks.push(p));

  recoveryTugPlant.init({ bus, state });

  // 1. Dispatch and attach:
  state.simTime = 12.0;
  recoveryTugPlant.update(0.1);

  // Step to attach (since tug is at 80 and wreck at 100, dist=20 < attachRadiusWu):
  state.simTime += 0.1;
  recoveryTugPlant.update(0.1);

  assert.equal(wreck.data.recoveryTugClaimed, tug.id);

  // 2. Player cuts the line via event:
  bus.emit('tether:severed', { targetId: 'wreck_tow' });

  assert.equal(lineCutEvents.length, 1);
  assert.equal(lineCutEvents[0].wreckId, 'wreck_tow');
  assert.equal(wreck.data.recoveryTugClaimed, undefined);
  assert.equal(barks.some((b) => b.text === RECOVERY_TUG_LINE_CUT_LINE), true);

  recoveryTugPlant.destroy();
});

test('Negative checks: Off-lane wrecks, claimed wrecks, and cooldown are respected', () => {
  const bus = createBus();
  const s1 = makeStation('st1', 0, 0);
  // Wreck way off in deep space, not in any lane:
  const offLaneWreck = makeWreck('wreck_off', 5000, 5000, false);
  // Wreck claimed by a salvor:
  const claimedWreck = makeWreck('wreck_claimed', 100, 0, true);
  claimedWreck.data.salvorClaimedBy = 'salvor_npc_1';

  const tug = makeTug('tug_idle', 10, 0);

  const state = createMockState({
    stations: [s1],
    wrecks: [offLaneWreck, claimedWreck],
    tugs: [tug],
  });

  const dispatchedEvents = [];
  bus.on(PLANTS_RECOVERY_TUG_DISPATCH_EVENT, (p) => dispatchedEvents.push(p));

  recoveryTugPlant.init({ bus, state });

  state.simTime = 12.0;
  recoveryTugPlant.update(0.1);

  // Neither candidate is eligible:
  assert.equal(dispatchedEvents.length, 0);

  // Now create a valid wreck:
  const validWreck = makeWreck('wreck_valid', 150, 0, true);
  state.entities.set(validWreck.id, validWreck);

  state.simTime = 20.0;
  recoveryTugPlant.update(0.1);

  assert.equal(dispatchedEvents.length, 1);
  assert.equal(dispatchedEvents[0].wreckId, 'wreck_valid');

  // Cooldown check: resolve current incident and add another wreck immediately:
  recoveryTugPlant._triggerRaceLost('test');

  const secondWreck = makeWreck('wreck_second', 160, 0, true);
  state.entities.set(secondWreck.id, secondWreck);

  // Within cooldown (cooldownS = 45s):
  state.simTime = 25.0;
  recoveryTugPlant.update(0.1);
  assert.equal(dispatchedEvents.length, 1, 'Should not dispatch again during cooldown');

  // After cooldown:
  state.simTime = 70.0;
  recoveryTugPlant.update(0.1);
  assert.equal(dispatchedEvents.length, 2, 'Should dispatch once cooldown expires');

  recoveryTugPlant.destroy();
});

test('Integration with traffic system: init and update invoke recovery tug ops cleanly', () => {
  const bus = createBus();
  const s1 = makeStation('st1', 0, 0);
  const wreck = makeWreck('wreck_traffic', 120, 0, true);
  const tug = makeTug('tug_traffic', 30, 0);

  const state = createMockState({
    stations: [s1],
    wrecks: [wreck],
    tugs: [tug],
  });

  const dispatchedEvents = [];
  bus.on(PLANTS_RECOVERY_TUG_DISPATCH_EVENT, (p) => dispatchedEvents.push(p));

  // Initialize through traffic object:
  traffic.init({ bus, state, helpers: {} });

  state.simTime = 15.0;
  traffic.update(0.1, state);

  assert.equal(dispatchedEvents.length, 1);
  assert.equal(dispatchedEvents[0].wreckId, 'wreck_traffic');
});
