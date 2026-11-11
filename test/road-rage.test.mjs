// PL-05 road rage tests:
// 1. one shove -> nothing
// 2. two shoves 10 s apart -> ram then flee
// 3. two shoves 40 s apart -> nothing
// 4. a third pair within 5 minutes -> nothing
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import {
  ROAD_RAGE_TUNING,
  isCivilianShip,
  recordRoadRageShove,
  stepRoadRage,
  roadRageOps,
  roadRage,
} from '../src/systems/roadRage.js';
import { traffic } from '../src/systems/traffic.js';

function makeCivilian(id = 'civ_1', { x = 100, z = 0, role = 'hauler', team = 2 } = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    data: {
      trafficRole: role,
      intent: { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0, brake: false },
      ai: { passive: true },
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
    data: {},
  };
}

function makeStation({ x = 500, z = 500 } = {}) {
  return {
    id: 'station_1',
    type: 'station',
    alive: true,
    pos: { x, z },
    radius: 50,
    data: {},
  };
}

function makeState(simTime = 0) {
  const player = makePlayer();
  const civ = makeCivilian();
  const station = makeStation();
  const entities = new Map([
    [player.id, player],
    [civ.id, civ],
    [station.id, station],
  ]);
  const entityList = [player, civ, station];
  return {
    mode: 'flight',
    tick: Math.round(simTime * 60),
    simTime,
    playerId: player.id,
    entities: {
      get: (id) => entities.get(id) || null,
      has: (id) => entities.has(id),
      set: (id, ent) => { entities.set(id, ent); if (!entityList.includes(ent)) entityList.push(ent); },
    },
    entityList,
    traffic: {
      freighters: [{ id: civ.id, role: 'hauler' }],
    },
    world: { currentSectorId: 'sector_test' },
  };
}

test('isCivilianShip identifies neutral civilians and excludes player, lawful, and hostiles', () => {
  const civ = makeCivilian('civ_1');
  assert.equal(isCivilianShip(civ), true, 'team 2 hauler is civilian');

  const player = makePlayer();
  assert.equal(isCivilianShip(player), false, 'player is not civilian');

  const patrol = makeCivilian('patrol_1', { role: 'patrol' });
  patrol.data.ai = { lawful: true };
  assert.equal(isCivilianShip(patrol), false, 'lawful patrol is not civilian');

  const pirate = makeCivilian('pirate_1', { role: 'raider', team: 1 });
  pirate.data.ai = { hostile: true };
  assert.equal(isCivilianShip(pirate), false, 'team 1 hostile is not civilian');
});

test('check 1: one shove -> nothing', () => {
  const state = makeState(0);
  const memory = new Map();
  const civ = state.entities.get('civ_1');
  const player = state.entities.get('player_1');

  // One shove at t = 0
  const triggered = recordRoadRageShove(state, civ, player.id, 0, memory);
  assert.equal(triggered, false, 'one shove does not trigger road rage');

  // Step road rage
  const active = stepRoadRage(civ, state, player, 1 / 60, memory);
  assert.equal(active, false, 'civilian does not act on one shove');
  assert.equal(civ.data.intent.moveZ, 0, 'intent untouched');
});

test('check 2: two shoves 10 s apart -> ram then flee', () => {
  const state = makeState(0);
  const memory = new Map();
  const civ = state.entities.get('civ_1');
  const player = state.entities.get('player_1');

  // Shove 1 at t = 0
  assert.equal(recordRoadRageShove(state, civ, player.id, 0, memory), false);

  // Shove 2 at t = 10 (10 s apart, within 30 s window)
  state.simTime = 10;
  const triggered = recordRoadRageShove(state, civ, player.id, 10, memory);
  assert.equal(triggered, true, 'two shoves 10 s apart triggers road rage');

  const row = memory.get(civ.id);
  assert.equal(row.rageState, 'ram', 'starts in ram state');

  // Step during ram phase (e.g. t = 11, 1 s into ram)
  state.simTime = 11;
  const activeRam = stepRoadRage(civ, state, player, 1 / 60, memory);
  assert.equal(activeRam, true, 'actively ramming');
  assert.equal(civ.data.intent.moveZ, 1, 'accelerating forward');
  assert.equal(civ.data.intent.boost, false, 'not boosting while clumsy ramming');
  assert.equal(civ.data.intent.fire, false, 'civilian does not fire weapons');

  // Heading is turned toward player at (0, 0) from (100, 0) -> dx = -100, dz = 0 -> aimAngle = Math.PI
  const expectedRamAngle = Math.atan2(player.pos.z - civ.pos.z, player.pos.x - civ.pos.x);
  assert.ok(Math.abs(civ.data.intent.aimAngle - expectedRamAngle) < 1e-6, 'turned toward player');

  // After 3 s of ramming (t = 13.1), ram expires and switches to flee
  state.simTime = 13.1;
  const activeFlee = stepRoadRage(civ, state, player, 1 / 60, memory);
  assert.equal(activeFlee, true, 'actively fleeing');
  assert.equal(row.rageState, 'flee', 'switched to flee state');
  assert.equal(civ.data.intent.moveZ, 1, 'accelerating at top speed');
  assert.equal(civ.data.intent.boost, true, 'boosting directly away from player');
  assert.equal(civ.data.intent.fire, false, 'does not fire weapons');

  // Heading is turned directly away from player -> dx = 100, dz = 0 -> aimAngle = 0
  const expectedFleeAngle = Math.atan2(civ.pos.x - player.pos.x, 0); // away
  assert.ok(Math.abs(civ.data.intent.aimAngle - 0) < 1e-6, 'aimed directly away from player');

  // Flees for 15 seconds (from t = 13.1 to t = 28.1)
  state.simTime = 25; // 11.9 s into flee
  assert.equal(stepRoadRage(civ, state, player, 1 / 60, memory), true, 'still fleeing');

  state.simTime = 28.2; // > 15 s after flee started
  const finished = stepRoadRage(civ, state, player, 1 / 60, memory);
  assert.equal(finished, false, 'flee finished after 15 s');
  assert.equal(row.rageState, null, 'rage state cleared; returns to normal');
});

test('ram connects early with player -> transitions immediately to flee', () => {
  const state = makeState(0);
  const memory = new Map();
  const civ = state.entities.get('civ_1');
  const player = state.entities.get('player_1');

  // Trigger road rage at t = 10
  recordRoadRageShove(state, civ, player.id, 0, memory);
  recordRoadRageShove(state, civ, player.id, 10, memory);

  const row = memory.get(civ.id);
  assert.equal(row.rageState, 'ram');

  // 1 second into ram attempt, civ connects with player (moves to contact distance)
  state.simTime = 11;
  civ.pos.x = player.pos.x + 5; // close contact within radii
  stepRoadRage(civ, state, player, 1 / 60, memory);

  assert.equal(row.rageState, 'flee', 'connected ram transitions immediately to flee');
  assert.equal(row.ramConnected, true, 'marked as connected');
});

test('check 3: two shoves 40 s apart -> nothing', () => {
  const state = makeState(0);
  const memory = new Map();
  const civ = state.entities.get('civ_1');
  const player = state.entities.get('player_1');

  // Shove 1 at t = 0
  assert.equal(recordRoadRageShove(state, civ, player.id, 0, memory), false);

  // Shove 2 at t = 40 (40 s later, > 30 s window)
  state.simTime = 40;
  const triggered = recordRoadRageShove(state, civ, player.id, 40, memory);
  assert.equal(triggered, false, 'two shoves 40 s apart do not trigger road rage');

  const row = memory.get(civ.id);
  assert.equal(row.rageState, null, 'rage state remains null');
  assert.equal(row.shoves.length, 1, 'shove at t=0 was pruned; only t=40 remains');
});

test('check 4: a third pair within 5 minutes -> nothing', () => {
  const state = makeState(0);
  const memory = new Map();
  const civ = state.entities.get('civ_1');
  const player = state.entities.get('player_1');

  // Pair 1: t = 0 and t = 10 -> triggers road rage at t = 10
  recordRoadRageShove(state, civ, player.id, 0, memory);
  state.simTime = 10;
  assert.equal(recordRoadRageShove(state, civ, player.id, 10, memory), true, 'pair 1 triggers');

  // Complete the ram and flee (t = 10 to t = 28)
  state.simTime = 13;
  stepRoadRage(civ, state, player, 1 / 60, memory); // transitions to flee
  state.simTime = 29;
  stepRoadRage(civ, state, player, 1 / 60, memory); // rage ends
  assert.equal(memory.get(civ.id).rageState, null, 'rage finished');

  // Pair 2 (or third pair) within 5 minutes:
  // e.g. at t = 60 (shove 1) and t = 70 (shove 2, 10 s apart)
  state.simTime = 60;
  assert.equal(recordRoadRageShove(state, civ, player.id, 60, memory), false, 'shove 1 within 5m ignored');

  state.simTime = 70;
  const triggered = recordRoadRageShove(state, civ, player.id, 70, memory);
  assert.equal(triggered, false, 'pair within 5 minutes never triggers road rage');
  assert.equal(memory.get(civ.id).rageState, null, 'remains null');

  // After 5 minutes (300 s from trigger at t = 10 -> t > 310)
  // At t = 320 and t = 330:
  state.simTime = 320;
  assert.equal(recordRoadRageShove(state, civ, player.id, 320, memory), false);

  state.simTime = 330;
  assert.equal(recordRoadRageShove(state, civ, player.id, 330, memory), true, 'pair after 5 minutes triggers again');
});

test('traffic system integration via event bus', () => {
  const bus = createBus();
  const state = makeState(0);
  const civ = state.entities.get('civ_1');
  const player = state.entities.get('player_1');

  traffic.init({ state, bus, helpers: {}, registry: null });

  // Emit shove 1 at t = 0
  bus.emit('combat:hitstunImpulse', {
    attackerId: player.id,
    victimId: civ.id,
    deltaV: 20,
    source: 'weapon',
    tick: 0,
  });

  traffic.update(1 / 60, state);
  assert.notEqual(civ.data.civilianReaction, 'road_rage_ram', 'one shove does nothing in traffic');

  // Emit shove 2 at t = 10
  state.simTime = 10;
  state.tick = 600;
  bus.emit('combat:hitstunImpulse', {
    attackerId: player.id,
    victimId: civ.id,
    deltaV: 25,
    source: 'collision',
    tick: 600,
  });

  // Next traffic update drives the ram!
  traffic.update(1 / 60, state);
  assert.equal(civ.data.civilianReaction, 'road_rage_ram', 'traffic reacts with road rage ram');
  assert.equal(civ.data.intent.moveZ, 1, 'civilian accelerating at player');
  assert.equal(civ.data.intent.fire, false, 'civilian does not shoot');

  // Connection impact switches to flee
  bus.emit('physics:impact', { aId: player.id, bId: civ.id });
  traffic.update(1 / 60, state);
  assert.equal(civ.data.civilianReaction, 'road_rage_flee', 'impact switches traffic to flee');
  assert.equal(civ.data.intent.boost, true, 'civilian flees at top speed');
});

test('held shove: real 0.25 s cadence for 2 s counts as one shove', () => {
  const state = makeState(0);
  const memory = new Map();
  const civ = state.entities.get('civ_1');
  const player = state.entities.get('player_1');

  // One field deployment held for 2 seconds (emitted every 0.25 s: 9 pulses from t = 0 to 2.0)
  for (let t = 0; t <= 2.0; t += 0.25) {
    state.simTime = t;
    const triggered = recordRoadRageShove(state, civ, player.id, t, memory, {
      fieldId: 'repulsor_field_alpha',
      deploymentId: 'repulsor_field_alpha',
    });
    assert.equal(triggered, false, `pulse at t=${t}s must not trigger road rage from a single held field`);
  }

  const row = memory.get(civ.id);
  assert.equal(row.shoves.length, 1, 'sustained 2 s repulsor deployment counts as exactly one shove');
  assert.equal(row.rageState, null, 'civilian is not in road rage');

  // A second distinct field deployment at t = 3.0 s triggers road rage
  state.simTime = 3.0;
  const triggeredSecond = recordRoadRageShove(state, civ, player.id, 3.0, memory, {
    fieldId: 'repulsor_field_beta',
    deploymentId: 'repulsor_field_beta',
  });
  assert.equal(triggeredSecond, true, 'second distinct field deployment triggers road rage');
  assert.equal(row.rageState, 'ram', 'civilian enters ram state on second distinct shove');
});

test('held shove without deployment id: receipts within 1.0 s count as one shove', () => {
  const state = makeState(0);
  const memory = new Map();
  const civ = state.entities.get('civ_1');
  const player = state.entities.get('player_1');

  // Receipts from same attacker at 0.25 s cadence without deployment ID
  for (let t = 0; t <= 2.0; t += 0.25) {
    state.simTime = t;
    const triggered = recordRoadRageShove(state, civ, player.id, t, memory);
    assert.equal(triggered, false, `receipt at t=${t}s within 1.0s window must not trigger road rage`);
  }

  const row = memory.get(civ.id);
  assert.equal(row.shoves.length, 1, 'held shove without deployment id counts as one shove');

  // After a gap > 1.0 s (e.g. at t = 4.0 s), the next receipt counts as the second shove
  state.simTime = 4.0;
  const triggeredSecond = recordRoadRageShove(state, civ, player.id, 4.0, memory);
  assert.equal(triggeredSecond, true, 'second shove after > 1.0s gap triggers road rage');
  assert.equal(row.rageState, 'ram');
});

test('gun hits and bomb blasts are not shoves (real hitstun sources)', () => {
  const bus = createBus();
  const state = makeState(0);
  const civ = state.entities.get('civ_1');
  const player = state.entities.get('player_1');
  traffic.init({ state, bus, helpers: {}, registry: null });
  for (const [t, source] of [[0, 'gun'], [5, 'gun'], [10, 'bomb'], [15, 'gun']]) {
    state.simTime = t;
    state.tick = t * 60;
    bus.emit('combat:hitstunImpulse', { attackerId: player.id, victimId: civ.id, deltaV: 12, source, tick: state.tick });
    traffic.update(1 / 60, state);
  }
  assert.notEqual(civ.data.civilianReaction, 'road_rage_ram', 'gunfire never starts road rage');
});
