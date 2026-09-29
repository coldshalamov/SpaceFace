// NXI-097 — an explicit sealed selection does not dump a different lot.
import test from 'node:test';
import assert from 'node:assert/strict';

import { cargo, selectedJettisonLot } from '../src/systems/cargo.js';
import { COMMODITIES } from '../src/data/commodities.js';

const CHIPS = 'cmdty_microchips';
const IRON = 'cmdty_ore_iron';
const WATER = 'cmdty_water';
const STORY = 'cmdty_story_core';

function commodity(id) {
  const row = COMMODITIES.find((entry) => entry.id === id);
  assert.ok(row, id);
  return row;
}

function boot(items, { selectedId = '', uiId = '', persistent = [] } = {}) {
  let usedVolume = 0;
  let usedMass = 0;
  for (const [id, qty] of Object.entries(items)) {
    const row = COMMODITIES.find((entry) => entry.id === id);
    if (!row) continue;
    usedVolume += qty * row.volPerU;
    usedMass += qty * row.massPerU;
  }
  const state = {
    simTime: 0,
    tick: 1,
    playerId: 1,
    story: { persistentCargo: persistent },
    missions: {
      active: [{
        id: 'sealed-delivery',
        status: 'active',
        preloadedCargo: true,
        params: { cmdtyId: CHIPS },
      }],
    },
    player: {
      cargo: {
        selectedId,
        items: { ...items },
        capVolume: 80,
        usedVolume,
        usedMass,
      },
    },
    ui: { selectedCommodityId: uiId },
    input: { actions: { jettisonLot: false } },
    entities: new Map([[1, {
      id: 1,
      pos: { x: 0, z: 0 },
      rot: 0,
      vel: { x: 0, z: 0 },
      radius: 6,
      factionId: 'player',
    }]]),
  };
  const pods = [];
  const system = Object.create(cargo);
  system.init({
    state,
    bus: { on() { return () => {}; }, emit() {} },
    helpers: {
      spawnEntity(spec) {
        pods.push(spec);
        return { id: pods.length, ...spec };
      },
    },
  });
  return { state, system, pods };
}

function press(system, state) {
  state.input.actions.jettisonLot = true;
  system.update(0, state);
}

test('a selected sealed lot dumps nothing else', () => {
  const iron = commodity(IRON);
  const { state, system, pods } = boot(
    { [CHIPS]: 4, [IRON]: 3, [WATER]: 2 },
    { selectedId: CHIPS },
  );
  const massBefore = state.player.cargo.usedMass;

  assert.equal(selectedJettisonLot(state), null);
  press(system, state);

  assert.equal(state.player.cargo.items[CHIPS], 4);
  assert.equal(state.player.cargo.items[IRON], 3);
  assert.equal(state.player.cargo.items[WATER], 2);
  assert.equal(state.player.cargo.usedMass, massBefore);
  assert.equal(pods.length, 0);
  assert.equal(state.input.actions.jettisonLot, false);
});

test('a selected ordinary lot dumps only that lot', () => {
  const iron = commodity(IRON);
  const { state, system, pods } = boot(
    { [CHIPS]: 4, [IRON]: 3, [WATER]: 2 },
    { selectedId: IRON },
  );
  const massBefore = state.player.cargo.usedMass;

  assert.equal(selectedJettisonLot(state), IRON);
  press(system, state);

  assert.equal(state.player.cargo.items[IRON], 2);
  assert.equal(state.player.cargo.items[CHIPS], 4);
  assert.equal(state.player.cargo.items[WATER], 2);
  assert.equal(state.player.cargo.usedMass, massBefore - iron.massPerU);
  assert.equal(pods.length, 1);
  assert.equal(pods[0].data.commodityId, IRON);
});

test('a sealed lot chosen on the hold screen is also a refusal', () => {
  const { state, system, pods } = boot(
    { [CHIPS]: 4, [IRON]: 3 },
    { selectedId: '', uiId: CHIPS },
  );

  assert.equal(selectedJettisonLot(state), null);
  press(system, state);

  assert.equal(state.player.cargo.items[CHIPS], 4);
  assert.equal(state.player.cargo.items[IRON], 3);
  assert.equal(pods.length, 0);
});

test('with no held focus, dump uses the first ordinary lot and skips the sealed one', () => {
  const iron = commodity(IRON);
  const { state, system } = boot(
    { [CHIPS]: 4, [IRON]: 3, [WATER]: 2 },
    { selectedId: '', uiId: '' },
  );
  const massBefore = state.player.cargo.usedMass;

  assert.equal(selectedJettisonLot(state), IRON);
  press(system, state);

  assert.equal(state.player.cargo.items[IRON], 2);
  assert.equal(state.player.cargo.items[CHIPS], 4);
  assert.equal(state.player.cargo.items[WATER], 2);
  assert.equal(state.player.cargo.usedMass, massBefore - iron.massPerU);
});

test('a selected persistent story lot stays aboard and does not dump the other good', () => {
  const { state, system, pods } = boot(
    { [STORY]: 1, [IRON]: 3 },
    { selectedId: STORY, persistent: [STORY] },
  );

  assert.equal(selectedJettisonLot(state), null);
  press(system, state);
  assert.equal(state.player.cargo.items[STORY], 1);
  assert.equal(state.player.cargo.items[IRON], 3);
  assert.equal(pods.length, 0);
  assert.equal(system.jettison(STORY, 1), 0);
  assert.equal(state.player.cargo.items[STORY], 1);
  assert.equal(state.player.cargo.items[IRON], 3);
});
