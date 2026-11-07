import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMBAT_ACTIONS,
  FLIGHT_ACTIONS,
  contextActionAllowed,
  contextHelpRows,
  contextPadAllowed,
  contextStockBindings,
  inputContextFor,
  isCombatContext,
} from '../src/data/inputContexts.js';
import {
  SWARM_FLIGHT_ACTIONS,
  swarmFlightActionAllowed,
} from '../src/data/swarmControls.js';

const player = (extra = {}) => ({ id: 1, team: 0, hull: 100, hullMax: 100, ...extra });
const enemy = (extra = {}) => ({ id: 2, team: 1, alive: true, ...extra });

function state(over = {}) {
  return {
    mode: 'flight',
    playerId: 1,
    run: null,
    ui: {},
    player: { targetId: null },
    entities: { get: (id) => (id === 1 ? player() : id === 2 ? enemy() : null) },
    ...over,
  };
}

test('the five contexts resolve from where the player is', () => {
  assert.equal(inputContextFor(state()), 'flight');
  assert.equal(inputContextFor(state({ mode: 'station' })), 'station');
  assert.equal(inputContextFor(state({ ui: { docked: true } })), 'station');
  assert.equal(inputContextFor(state({ ui: { mapOpen: true } })), 'map');
  assert.equal(inputContextFor(state({ player: { targetId: 2 } })), 'combat');
  assert.equal(inputContextFor(state({
    run: { kind: 'survival', phase: 'active', ruleset: 'swarm' },
  })), 'swarm');
});

test('a low hull is a combat context even with no target', () => {
  const st = state({
    entities: { get: (id) => (id === 1 ? player({ hull: 10, hullMax: 100 }) : null) },
  });
  assert.equal(isCombatContext(st), true);
  assert.equal(inputContextFor(st), 'combat');
});

test('flight admits every flight verb; combat admits the fight set only', () => {
  const flight = state();
  for (const action of FLIGHT_ACTIONS) {
    assert.equal(contextActionAllowed(flight, action), true, action);
  }
  const combat = state({ player: { targetId: 2 } });
  for (const action of COMBAT_ACTIONS) {
    assert.equal(contextActionAllowed(combat, action), true, action);
  }
  for (const action of ['travelBurn', 'cruise', 'autoFire', 'siteBeam', 'deployBeacon', 'scanPulse']) {
    if (COMBAT_ACTIONS.includes(action)) continue;
    assert.equal(contextActionAllowed(combat, action), false, action);
  }
});

test('station and map have no flight verbs', () => {
  for (const st of [state({ mode: 'station' }), state({ ui: { mapOpen: true } })]) {
    for (const action of FLIGHT_ACTIONS) {
      assert.equal(contextActionAllowed(st, action), false, action);
    }
  }
});

test('the Swarm set is S5 unchanged', () => {
  const st = state({ run: { kind: 'survival', phase: 'active', ruleset: 'swarm' } });
  for (const action of FLIGHT_ACTIONS) {
    assert.equal(
      contextActionAllowed(st, action),
      swarmFlightActionAllowed(st, action),
      action,
    );
  }
  for (const action of SWARM_FLIGHT_ACTIONS) {
    assert.equal(contextActionAllowed(st, action), true, action);
  }
  assert.equal(contextActionAllowed(st, 'travelBurn'), false);
  assert.equal(contextActionAllowed(st, 'cloak'), false);
});

test('the pad reads the same gate', () => {
  const combat = state({ player: { targetId: 2 } });
  assert.equal(contextPadAllowed(combat, 'fire'), true);
  assert.equal(contextPadAllowed(combat, 'travelBurn'), false);
  assert.equal(contextPadAllowed(state({ mode: 'station' }), 'fire'), false);
});

test('stock bindings are Swarm-only; rebinds are consulted before them in input.js', () => {
  const swarm = state({ run: { kind: 'survival', phase: 'active', ruleset: 'swarm' } });
  assert.deepEqual(contextStockBindings(swarm)?.tether, []);
  assert.deepEqual(contextStockBindings(swarm)?.boost, ['Space']);
  assert.equal(contextStockBindings(state()), null);
});

test('every context has a short, non-empty Help card', () => {
  const states = [
    state(),
    state({ player: { targetId: 2 } }),
    state({ mode: 'station' }),
    state({ ui: { mapOpen: true } }),
    state({ run: { kind: 'survival', phase: 'active', ruleset: 'swarm' } }),
  ];
  for (const st of states) {
    const rows = contextHelpRows(st);
    assert.ok(rows.length > 0 && rows.length <= 10, `${inputContextFor(st)} rows ${rows.length}`);
    for (const row of rows) {
      assert.equal(row.length, 2);
      assert.ok(String(row[0]).length > 0 && String(row[1]).length > 0);
    }
  }
});
