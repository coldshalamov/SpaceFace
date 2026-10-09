// Dumping nothing, or a sealed lot, has to say why the pod never left.
import test from 'node:test';
import assert from 'node:assert/strict';

import { cargo } from '../src/systems/cargo.js';

function press(items, extra = {}) {
  const events = [];
  const state = {
    playerId: 1,
    simTime: 1,
    input: { actions: { jettisonLot: true } },
    player: { cargo: { items, selectedId: extra.selectedId || '', capVolume: 80 } },
    entities: { get() { return null; } },
    ...extra.state,
  };
  const sys = Object.assign(Object.create(cargo), {
    state,
    bus: { emit(name, payload) { events.push({ name, payload }); } },
  });
  if (extra.jettison) sys.jettison = extra.jettison;
  sys.update(1 / 60, state);
  return { events, state };
}

test('an empty hold says so when dump is pressed', () => {
  const { events, state } = press({});
  assert.equal(state.input.actions.jettisonLot, false);
  assert.equal(events.find((event) => event.name === 'toast').payload.text, 'Hold is empty');
});

test('a sealed selected lot stays aboard and says so', () => {
  const { events } = press(
    { cmdty_ore_iron: 4 },
    { selectedId: 'cmdty_ore_iron', state: { fixtureSealed: ['cmdty_ore_iron'] } },
  );
  assert.equal(events.find((event) => event.name === 'toast').payload.text, 'That lot is sealed — it stays aboard');
});

test('a free lot dumps and does not claim the hold is empty', () => {
  let dumped = null;
  const { events } = press(
    { cmdty_ore_iron: 3 },
    { jettison(id) { dumped = id; return 1; } },
  );
  assert.equal(dumped, 'cmdty_ore_iron');
  assert.equal(events.some((event) => event.name === 'toast'), false);
});
