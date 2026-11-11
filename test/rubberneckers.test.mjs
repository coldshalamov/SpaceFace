// PL-03 Rubberneckers tests:
// 1. isCivilianShip identifies eligible civilians and rejects player, lawful, and hostiles.
// 2. Ship wreck (entity:killed) triggers two passing civilians to slow down and look.
// 3. Negative checks: wrong distance, wrong target, too soon to repeat.
// 4. Civilians slow down and aim nose toward the wreck location.
// 5. Player approaching within shoo distance (or shoving) shoos the rubbernecker: barks and flees.
// 6. (scavenger: see rubberneckers-scavenger.test.mjs)
// 7. Full traffic system integration test via traffic.init and traffic.update.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import {
  RUBBERNECKERS_TUNING,
  RUBBERNECKERS_ACTIVE_EVENT,
  RUBBERNECKERS_SHOO_EVENT,
  isCivilianShip,
  rubberneckersOps,
} from '../src/systems/rubberneckers.js';
import { traffic } from '../src/systems/traffic.js';

function makeShip(id = 'civ_1', { x = 0, z = 0, role = 'courier', team = 2, lawful = false, hostile = false } = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 7,
    occupantGeneration: 1,
    data: {
      trafficRole: role,
      intent: { strafe: 0, throttle: 1, boost: false, brake: false, fire: false, aim: 0 },
      ai: { lawful, hostile },
    },
  };
}

function makePlayer({ x = 0, z = 0 } = {}) {
  return {
    id: 'player_1',
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 6,
    occupantGeneration: 1,
    data: {},
  };
}

test('isCivilianShip identifies eligible civilians and rejects lawful, hostile, and player', () => {
  const courier = makeShip('c1', { role: 'courier' });
  assert.equal(isCivilianShip(courier), true, 'courier is civilian');

  const hauler = makeShip('h1', { role: 'hauler' });
  assert.equal(isCivilianShip(hauler), true, 'hauler is civilian');

  const miner = makeShip('m1', { role: 'miner' });
  assert.equal(isCivilianShip(miner), true, 'miner is civilian');

  const salvor = makeShip('s1', { role: 'salvor' });
  assert.equal(isCivilianShip(salvor), true, 'salvor is civilian');

  // Lawful police/patrol is not civilian
  const police = makeShip('p1', { role: 'patrol', lawful: true });
  assert.equal(isCivilianShip(police), false, 'lawful patrol is not civilian');

  // Hostile / pirate is not civilian
  const pirate = makeShip('pi1', { role: 'pirate', hostile: true, team: 1 });
  assert.equal(isCivilianShip(pirate), false, 'hostile pirate is not civilian');

  // Non-ship is not civilian
  const asteroid = { id: 'ast1', type: 'asteroid', alive: true, pos: { x: 0, z: 0 } };
  assert.equal(isCivilianShip(asteroid), false, 'asteroid is not civilian');
});

test('wreck triggers exactly up to two passing civilians to slow down and look', () => {
  const bus = createBus();
  const events = [];
  bus.on(RUBBERNECKERS_ACTIVE_EVENT, (e) => events.push(e));

  const victim = makeShip('victim_hull', { x: 0, z: 0 });
  const civ1 = makeShip('civ_1', { x: 100, z: 0, role: 'courier' });
  const civ2 = makeShip('civ_2', { x: 150, z: 50, role: 'miner' });
  const civ3 = makeShip('civ_3', { x: 200, z: 100, role: 'hauler' });

  const entities = new Map([
    [victim.id, victim],
    [civ1.id, civ1],
    [civ2.id, civ2],
    [civ3.id, civ3],
  ]);

  const state = {
    mode: 'flight',
    simTime: 10.0,
    playerId: 'player_1',
    entities,
  };

  const host = {
    bus,
    state,
    ...rubberneckersOps,
  };
  host._initRubberneckers();

  // Wreck occurs at (0, 0) - real combat.js emission shape
  host._onRubberneckersEntityKilled({
    id: victim.id,
    killerId: 'player_1',
    type: victim.type,
    pos: { x: victim.pos.x, z: victim.pos.z },
  });

  assert.equal(events.length, 1, 'emitted active event');
  assert.equal(events[0].wreckId, victim.id);
  assert.equal(events[0].rubberneckerIds.length, 2, 'exactly two civilians selected');
  assert.deepEqual(events[0].rubberneckerIds, ['civ_1', 'civ_2'], 'selected the two closest civilians');

  // Check their status:
  const mem = host._getRubberneckersMemory();
  assert.equal(mem.get('civ_1').status, 'looking');
  assert.equal(mem.get('civ_2').status, 'looking');
  assert.equal(mem.has('civ_3'), false, 'third civilian was not picked');
});

test('negative checks: wrong distance, wrong target, too soon to repeat', () => {
  const bus = createBus();
  const events = [];
  bus.on(RUBBERNECKERS_ACTIVE_EVENT, (e) => events.push(e));

  // Check 1: Wrong distance (> 420 wu away)
  const victim1 = makeShip('v1', { x: 0, z: 0 });
  const farCiv = makeShip('far_civ', { x: 800, z: 800, role: 'hauler' }); // ~1131 wu away
  const entities1 = new Map([[victim1.id, victim1], [farCiv.id, farCiv]]);
  const state1 = { mode: 'flight', simTime: 10.0, playerId: 'player_1', entities: entities1 };
  const host1 = { bus, state: state1, ...rubberneckersOps };
  host1._initRubberneckers();

  host1._onRubberneckersEntityKilled({
    id: victim1.id,
    killerId: 'player_1',
    type: victim1.type,
    pos: { x: victim1.pos.x, z: victim1.pos.z },
  });
  assert.equal(events.length, 0, 'wrong distance does not trigger rubberneckers');

  // Check 2: Wrong target (non-ship killed: asteroid or missile)
  const asteroid = { id: 'ast_kill', type: 'asteroid', alive: true, pos: { x: 0, z: 0 } };
  const nearCiv = makeShip('near_civ', { x: 100, z: 0, role: 'courier' });
  const entities2 = new Map([[asteroid.id, asteroid], [nearCiv.id, nearCiv]]);
  const state2 = { mode: 'flight', simTime: 20.0, playerId: 'player_1', entities: entities2 };
  const host2 = { bus, state: state2, ...rubberneckersOps };
  host2._initRubberneckers();

  host2._onRubberneckersEntityKilled({
    id: asteroid.id,
    killerId: 'player_1',
    type: asteroid.type,
    pos: { x: asteroid.pos.x, z: asteroid.pos.z },
  });
  assert.equal(events.length, 0, 'non-ship death does not trigger rubbernecking');

  // Check 2b: Hostile or lawful ships do not rubberneck
  const police = makeShip('patrol_1', { x: 100, z: 0, role: 'patrol', lawful: true });
  const pirate = makeShip('raider_1', { x: 120, z: 0, role: 'pirate', hostile: true, team: 1 });
  const entities2b = new Map([[victim1.id, victim1], [police.id, police], [pirate.id, pirate]]);
  const state2b = { mode: 'flight', simTime: 30.0, playerId: 'player_1', entities: entities2b };
  const host2b = { bus, state: state2b, ...rubberneckersOps };
  host2b._initRubberneckers();

  host2b._onRubberneckersEntityKilled({
    id: victim1.id,
    killerId: 'player_1',
    type: victim1.type,
    pos: { x: victim1.pos.x, z: victim1.pos.z },
  });
  assert.equal(events.length, 0, 'hostile and lawful ships do not rubberneck');

  // Check 3: Too soon to repeat (second wreck within 60 s cooldown)
  const victim2a = makeShip('v2a', { x: 0, z: 0 });
  const victim2b = makeShip('v2b', { x: 50, z: 50 });
  const civA = makeShip('civ_a', { x: 100, z: 0 });
  const entities3 = new Map([[victim2a.id, victim2a], [victim2b.id, victim2b], [civA.id, civA]]);
  const state3 = { mode: 'flight', simTime: 100.0, playerId: 'player_1', entities: entities3 };
  const host3 = { bus, state: state3, ...rubberneckersOps };
  host3._initRubberneckers();

  host3._onRubberneckersEntityKilled({
    id: victim2a.id,
    killerId: 'player_1',
    type: victim2a.type,
    pos: { x: victim2a.pos.x, z: victim2a.pos.z },
  });
  assert.equal(events.length, 1, 'first wreck triggers incident');

  // Second wreck 15 s later (cooldown is 60 s):
  state3.simTime = 115.0;
  host3._onRubberneckersEntityKilled({
    id: victim2b.id,
    killerId: 'player_1',
    type: victim2b.type,
    pos: { x: victim2b.pos.x, z: victim2b.pos.z },
  });
  assert.equal(events.length, 1, 'second wreck during cooldown does NOT trigger new incident');
});

test('rubbernecking civilians slow down and aim nose toward the wreck', () => {
  const bus = createBus();
  const victim = makeShip('victim_1', { x: 0, z: 0 });
  // Civilian at (100, 0), facing north (aim: 0)
  const civ = makeShip('civ_1', { x: 100, z: 0, role: 'courier' });
  const entities = new Map([[victim.id, victim], [civ.id, civ]]);
  const state = { mode: 'flight', simTime: 10.0, playerId: 'player_1', entities };
  const host = { bus, state, ...rubberneckersOps };
  host._initRubberneckers();

  host._onRubberneckersEntityKilled({
    id: victim.id,
    killerId: 'player_1',
    type: victim.type,
    pos: { x: victim.pos.x, z: victim.pos.z },
  });

  // Call _reactRubberneckers in traffic loop:
  const reacting = host._reactRubberneckers(civ, { role: 'courier' }, [], state, null);
  assert.equal(reacting, true, 'rubbernecker reaction handles intent');

  // Target wreck is at (0, 0), civ is at (100, 0) -> dx: -100, dz: 0 -> aim is Math.PI
  const expectedAim = Math.atan2(0, -100);
  assert.equal(civ.data.intent.aim, expectedAim, 'aimed nose at wreck');
  assert.equal(civ.data.intent.brake, true, 'applied brake');
  assert.equal(civ.data.intent.throttle, RUBBERNECKERS_TUNING.slowThrottle, 'crawling at slow throttle');
  assert.equal(civ.data.civilianReaction, 'rubbernecking');
});

test('player approaching within shoo distance shoos rubberneckers away with bark and flee', () => {
  const bus = createBus();
  const shooEvents = [];
  bus.on(RUBBERNECKERS_SHOO_EVENT, (e) => shooEvents.push(e));

  const victim = makeShip('v1', { x: 0, z: 0 });
  const civ = makeShip('civ_1', { x: 100, z: 0, role: 'courier' });
  const player = makePlayer({ x: 200, z: 0 }); // Far initially (100 wu away from civ)

  const entities = new Map([[victim.id, victim], [civ.id, civ], [player.id, player]]);
  const state = { mode: 'flight', simTime: 10.0, playerId: player.id, entities };
  const host = { bus, state, ...rubberneckersOps };
  host._initRubberneckers();

  host._onRubberneckersEntityKilled({
    id: victim.id,
    killerId: 'player_1',
    type: victim.type,
    pos: { x: victim.pos.x, z: victim.pos.z },
  });

  // Civ is looking:
  host._reactRubberneckers(civ, { role: 'courier' }, [], state, player);
  assert.equal(shooEvents.length, 0, 'not shooed yet');

  // Player flies close: player moves to (130, 0) -> 30 wu from civ (inside 50 wu threshold):
  player.pos = { x: 130, z: 0 };
  state.simTime = 12.0;

  const reacting = host._reactRubberneckers(civ, { role: 'courier' }, [], state, player);
  assert.equal(reacting, true, 'handles intent while fleeing');
  assert.equal(shooEvents.length, 1, 'emitted shoo event');
  assert.equal(shooEvents[0].entityId, civ.id);
  assert.equal(shooEvents[0].barkText, 'Just looking! Moving along!');

  // Fleeing: nose points away from player (civ at 100, player at 130 -> away is -X, Math.PI):
  const expectedFleeAim = Math.atan2(0, 100 - 130);
  assert.equal(civ.data.intent.aim, expectedFleeAim, 'aims away from player');
  assert.equal(civ.data.intent.throttle, 1.0, 'full throttle fleeing');
  assert.equal(civ.data.intent.boost, true, 'boosts away');
  assert.equal(civ.data.civilianReaction, 'shooed');
});

// The scavenger half (a real salvor hull commissioned and flown to the wreck) is covered by
// test/rubberneckers-scavenger.test.mjs.

test('traffic system integration via update loop and bus', () => {
  const bus = createBus();
  const victim = makeShip('target_wreck', { x: 0, z: 0 });
  const civ1 = makeShip('traffic_civ1', { x: 120, z: 0, role: 'courier' });
  const civ2 = makeShip('traffic_civ2', { x: 160, z: 0, role: 'miner' });
  // Player at (200, 0): within near AI range (80 wu from civ1) but outside shoo threshold (> 50 wu)
  const player = makePlayer({ x: 200, z: 0 });
  const station = { id: 'station_alpha', type: 'station', alive: true, pos: { x: 500, z: 500 }, radius: 50, data: {} };

  const entities = new Map([
    [player.id, player],
    [victim.id, victim],
    [civ1.id, civ1],
    [civ2.id, civ2],
    [station.id, station],
  ]);

  const state = {
    mode: 'flight',
    simTime: 50.0,
    tick: 3000,
    playerId: player.id,
    entities: {
      get: (id) => entities.get(id) || null,
      has: (id) => entities.has(id),
      values: () => entities.values(),
    },
    entityList: [player, victim, civ1, civ2, station],
    traffic: {
      freighters: [
        { id: civ1.id, role: 'courier', pos: { x: civ1.pos.x, z: civ1.pos.z }, vel: { x: 0, z: 0 }, rot: 0 },
        { id: civ2.id, role: 'miner', pos: { x: civ2.pos.x, z: civ2.pos.z }, vel: { x: 0, z: 0 }, rot: 0 },
      ],
    },
    world: { currentSectorId: 'sector_test' },
  };

  traffic.init({ bus, state });

  let incidentFired = false;
  bus.on(RUBBERNECKERS_ACTIVE_EVENT, () => {
    incidentFired = true;
  });

  // Emit entity:killed to simulate ship wreck using real combat emitter shape
  bus.emit('entity:killed', {
    id: victim.id,
    killerId: player.id,
    type: victim.type,
    pos: { x: victim.pos.x, z: victim.pos.z },
  });

  assert.equal(incidentFired, true, 'rubberneckers incident activated on entity:killed');

  // Run traffic update:
  traffic.update(1 / 60, state);

  // Assert civ1 is slowed down and looking toward wreck (0, 0):
  assert.equal(civ1.data.civilianReaction, 'rubbernecking');
  assert.equal(civ1.data.intent.brake, true);
  assert.equal(civ1.data.intent.moveZ, RUBBERNECKERS_TUNING.slowThrottle);
});

test('rubberneckers start when victim entity is already gone from state.entities', () => {
  const bus = createBus();
  const events = [];
  bus.on(RUBBERNECKERS_ACTIVE_EVENT, (e) => events.push(e));

  const civ1 = makeShip('civ_1', { x: 100, z: 0, role: 'courier' });
  const civ2 = makeShip('civ_2', { x: 150, z: 50, role: 'miner' });

  // Victim is NOT in entities map:
  const entities = new Map([
    [civ1.id, civ1],
    [civ2.id, civ2],
  ]);

  const state = {
    mode: 'flight',
    simTime: 10.0,
    playerId: 'player_1',
    entities,
  };

  const host = {
    bus,
    state,
    ...rubberneckersOps,
  };
  host._initRubberneckers();

  // Wreck occurs at (0, 0) with real combat emitter payload and entity gone
  host._onRubberneckersEntityKilled({
    id: 'already_deleted_ship',
    killerId: 'player_1',
    type: 'ship',
    pos: { x: 0, z: 0 },
  });

  assert.equal(events.length, 1, 'emitted active event despite victim entity gone');
  assert.equal(events[0].wreckId, 'already_deleted_ship');
  assert.deepEqual(events[0].rubberneckerIds, ['civ_1', 'civ_2']);
});
