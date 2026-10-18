import test from 'node:test';
import assert from 'node:assert/strict';
import { readBombBayModel, readRailModel } from '../src/ui/powerRail.js';
import { readOrdnanceModel } from '../src/ui/orrery/hudAdapter.js';
import { BOMB_DRIFT } from '../src/data/bombs.js';
import { createGameState } from '../src/core/gameState.js';

function setupState({ seed = 4242, playerBombs = 0, worldOtherBombs = 0 } = {}) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.playerId = 1;
  const playerEntity = {
    id: 1,
    type: 'ship',
    alive: true,
    flags: { docked: false },
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    hull: 100,
    hullMax: 100,
    shield: 50,
    shieldMax: 50,
    armorHp: 20,
    armorMax: 20,
    cap: 50,
    capMax: 50,
    maxSpeed: 100,
    boost: { energy: 10, max: 10 },
    data: { weapons: [], impulseCharges: { throwCdT: 0 } },
  };
  state.entities.set(1, playerEntity);
  state.entityList.push(playerEntity);
  state.player = { cargo: { items: {} } };
  state.fields = {};
  state.bombs = { selectedId: 'bomb_concussion', cooldownUntil: 0, cooldowns: {} };

  // Deploy bombs owned by player
  for (let i = 0; i < playerBombs; i++) {
    const bomb = {
      id: 100 + i,
      type: 'bomb',
      alive: true,
      data: { ownerId: 1, phase: 'drift', armedAt: 0 },
    };
    state.entities.set(bomb.id, bomb);
    state.entityList.push(bomb);
  }

  // Deploy bombs owned by other ships
  for (let i = 0; i < worldOtherBombs; i++) {
    const bomb = {
      id: 500 + i,
      type: 'bomb',
      alive: true,
      data: { ownerId: 99, phase: 'drift', armedAt: 0 },
    };
    state.entities.set(bomb.id, bomb);
    state.entityList.push(bomb);
  }

  return state;
}

test('SFQ-I013: with deployed === 0 and worldCount >= BOMB_DRIFT.maxWorldActive, rail why and ordnance tip report field full', () => {
  const state = setupState({
    seed: 4242,
    playerBombs: 0,
    worldOtherBombs: BOMB_DRIFT.maxWorldActive,
  });

  const rail = readRailModel(state, state.simTime);
  const ord = readOrdnanceModel(state);
  const bay = readBombBayModel(state, state.simTime);

  const expectedWhy = 'Field is full of armed ordnance — wait for one to finish';

  assert.equal(bay.deployed, 0);
  assert.equal(bay.why, expectedWhy, 'readBombBayModel must distinguish full field from full player bay');
  assert.equal(rail[9].why, expectedWhy, 'readRailModel[9].why must say field is full');
  assert.match(ord[9].tip, /Field is full of armed ordnance — wait for one to finish/, 'readOrdnanceModel[9].tip must include field is full phrase');
  assert.equal(rail[9].state, 'locked');
  assert.equal(ord[9].state, 'locked');
});

test('SFQ-I013: with deployed >= BOMB_DRIFT.maxActive, rail why and ordnance tip keep bay is full', () => {
  const state = setupState({
    seed: 4242,
    playerBombs: BOMB_DRIFT.maxActive,
    worldOtherBombs: 0,
  });

  const rail = readRailModel(state, state.simTime);
  const ord = readOrdnanceModel(state);
  const bay = readBombBayModel(state, state.simTime);

  const expectedWhy = 'Bay is full — trigger armed ordnance';

  assert.equal(bay.deployed, BOMB_DRIFT.maxActive);
  assert.equal(bay.why, expectedWhy);
  assert.equal(rail[9].why, expectedWhy);
  assert.match(ord[9].tip, /Bay is full — trigger armed ordnance/);
  assert.equal(rail[9].state, 'locked');
  assert.equal(ord[9].state, 'locked');
});

test('SFQ-I013: when both player bay and world active caps are reached, bay full takes precedence', () => {
  const state = setupState({
    seed: 4242,
    playerBombs: BOMB_DRIFT.maxActive,
    worldOtherBombs: BOMB_DRIFT.maxWorldActive,
  });

  const rail = readRailModel(state, state.simTime);
  const ord = readOrdnanceModel(state);

  assert.equal(rail[9].why, 'Bay is full — trigger armed ordnance');
  assert.match(ord[9].tip, /Bay is full — trigger armed ordnance/);
});

test('SFQ-I013: quiet/negative branch when neither cap is reached', () => {
  const state = setupState({
    seed: 4242,
    playerBombs: 2,
    worldOtherBombs: 3,
  });

  const rail = readRailModel(state, state.simTime);
  const ord = readOrdnanceModel(state);
  const bay = readBombBayModel(state, state.simTime);

  assert.equal(bay.deployed, 2);
  assert.equal(bay.why, 'Ready');
  assert.equal(rail[9].why, 'Ready');
  assert.equal(rail[9].state, 'ready');
  assert.equal(ord[9].state, 'ready');
  assert.doesNotMatch(rail[9].why, /full/i);
  assert.doesNotMatch(ord[9].tip, /full/i);
});
