import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMBAT_ACTIONS,
  FLIGHT_ACTIONS,
  LOW_HULL_FRACTION,
  MAP_CONTEXT_SCREEN_IDS,
  contextActionAllowed,
  contextHelpRows,
  contextStockBindings,
  contextUiAllowed,
  inputContextFor,
  isCombatContext,
  isLowHull,
  topScreenId,
} from '../src/data/inputContexts.js';
import {
  SWARM_FLIGHT_ACTIONS,
  swarmFlightActionAllowed,
} from '../src/data/swarmControls.js';
import { resolveActionCodes, resolveActionLabel } from '../src/systems/input.js';
import { openGalaxyMap } from '../src/ui/mapAuthority.js';
import { galaxyMapScreen } from '../src/ui/galaxyMap.js';

const player = (extra = {}) => ({ id: 1, team: 0, hull: 100, hullMax: 100, ...extra });
const enemy = (extra = {}) => ({ id: 2, team: 1, alive: true, ...extra });

function state(over = {}) {
  return {
    mode: 'flight',
    playerId: 1,
    run: null,
    ui: {},
    settings: { gameplay: { controlScheme: 'pilot' }, controls: {} },
    player: { targetId: null },
    entities: { get: (id) => (id === 1 ? player() : id === 2 ? enemy() : null) },
    ...over,
  };
}

function lowHullState(over = {}) {
  return state({
    entities: { get: (id) => (id === 1 ? player({ hull: 10, hullMax: 100 }) : id === 2 ? enemy() : null) },
    ...over,
  });
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

test('X5 #8: the map wins over the station it is opened on top of', () => {
  const dockedWithChart = state({ ui: { docked: true, mapOpen: true } });
  assert.equal(inputContextFor(dockedWithChart), 'map');
  assert.equal(inputContextFor(state({ mode: 'station', ui: { mapOpen: true } })), 'map');
});

test('X5 #7: the live screen stack resolves the map context', () => {
  assert.deepEqual([...MAP_CONTEXT_SCREEN_IDS], ['galaxyMap', 'localmap', 'starmap']);
  const stackState = state({ ui: { screenStack: ['station', 'galaxyMap'] } });
  assert.equal(topScreenId(stackState), 'galaxyMap');
  assert.equal(inputContextFor(stackState), 'map');
  // A non-map modal over flight keeps the flight context: the lifecycle owns modal freeze.
  assert.equal(inputContextFor(state({ ui: { screenStack: ['station'] } })), 'flight');
  assert.equal(inputContextFor(state({ ui: { screenStack: [] } })), 'flight');
  // objects with an id are accepted too
  assert.equal(topScreenId(state({ ui: { screenStack: [{ id: 'starmap' }] } })), 'starmap');
});

test('X5 #7 live route: the real map opener writes the latch and the map owner clears it', () => {
  const st = state();
  const bus = { emit() {} };
  assert.equal(openGalaxyMap({ state: st, bus }, { focus: 'galaxy', source: 'keyboard' }), true);
  assert.equal(st.ui.mapOpen, true, 'openGalaxyMap must set ui.mapOpen');
  assert.equal(inputContextFor(st), 'map', 'the opened map resolves Map from live state');
  // The screen manager calls onHide when the map pops; the map owner owns the clear.
  galaxyMapScreen._ctx = { state: st, bus };
  galaxyMapScreen.onHide();
  assert.equal(st.ui.mapOpen, false, 'map hide must clear ui.mapOpen');
  assert.equal(inputContextFor(st), 'flight');
});

test('a low hull is a combat context even with no target', () => {
  const st = lowHullState();
  assert.equal(isLowHull(st), true);
  assert.equal(isCombatContext(st), true);
  assert.equal(inputContextFor(st), 'combat');
  assert.equal(LOW_HULL_FRACTION, 0.25);
});

test('flight admits every flight verb; combat admits the fight set plus the low-hull flee', () => {
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
  // X5 #10: a targeted fight is not a low hull, so the long burn stays the fight's hostage.
  assert.equal(contextActionAllowed(combat, 'travelBurn'), false);
  // ... but a pilot under the line can always run.
  const wounded = lowHullState({ player: { targetId: 2 } });
  assert.equal(contextActionAllowed(wounded, 'travelBurn'), true, 'low-hull flee');
  assert.equal(contextActionAllowed(wounded, 'cruise'), false, 'the flee is one verb, not the flight set');
});

test('station and map have no flight verbs', () => {
  for (const st of [state({ mode: 'station' }), state({ ui: { mapOpen: true } })]) {
    for (const action of FLIGHT_ACTIONS) {
      assert.equal(contextActionAllowed(st, action), false, action);
    }
  }
  // The station's E is the UI's undock, not a flight verb.
  const station = state({ mode: 'station' });
  assert.equal(contextActionAllowed(station, 'undock'), false);
  assert.equal(contextUiAllowed(station, 'undock'), true, 'the station card teaches E Undock');
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

test('stock bindings are Swarm-only; rebinds are consulted before them in input.js', () => {
  const swarm = state({ run: { kind: 'survival', phase: 'active', ruleset: 'swarm' } });
  assert.deepEqual(contextStockBindings(swarm)?.tether, []);
  assert.deepEqual(contextStockBindings(swarm)?.boost, ['Space']);
  assert.equal(contextStockBindings(state()), null);
});

test('X5 #6: the UI letter layer is gated — combat cannot open the chart, tech or codex', () => {
  const combat = state({ player: { targetId: 2 } });
  for (const action of ['map', 'localmap', 'starmap', 'techTree', 'codex', 'fleetCommand', 'claimBase', 'drill', 'ship']) {
    assert.equal(contextUiAllowed(combat, action), false, action);
  }
  for (const action of ['pause', 'help', 'missionLog', 'cargo', 'comms', 'find']) {
    assert.equal(contextUiAllowed(combat, action), true, action);
  }
  // Out of the fight every instrument stays reachable; station and map screens keep their verbs.
  for (const st of [state(), state({ mode: 'station' }), state({ ui: { mapOpen: true } })]) {
    for (const action of ['pause', 'help', 'map', 'techTree', 'codex', 'missionLog', 'cargo', 'comms', 'undock']) {
      assert.equal(contextUiAllowed(st, action), true, action);
    }
  }
  assert.equal(contextUiAllowed(combat, 'not-a-verb'), false);
});

test('X5 P0: labels stay live in every context — the sheet never blanks a real verb', () => {
  const contexts = [
    state(),
    state({ player: { targetId: 2 } }),
    lowHullState(),
    state({ mode: 'station' }),
    state({ ui: { mapOpen: true } }),
  ];
  for (const st of contexts) {
    const ctx = inputContextFor(st);
    for (const action of ['forward', 'reverse', 'boost', 'travelBurn', 'cruise']) {
      const label = resolveActionLabel(st, action);
      assert.ok(label.length > 0, `${ctx}: ${action} label is blank`);
      assert.ok(resolveActionCodes(st, action).length > 0, `${ctx}: ${action} codes are empty`);
    }
    // Fire is the left mouse button: no KeyboardEvent code, but never a blank label.
    assert.equal(resolveActionLabel(st, 'fire'), 'LMB');
  }
});

test('X5 #5: every context has a short Help card, and the card is derived from live keys', () => {
  const states = [
    state(),
    state({ player: { targetId: 2 } }),
    lowHullState(),
    state({ mode: 'station' }),
    state({ ui: { mapOpen: true } }),
    state({ run: { kind: 'survival', phase: 'active', ruleset: 'swarm' } }),
  ];
  for (const st of states) {
    const rows = contextHelpRows(st, (action) => resolveActionLabel(st, action, { sep: ' ' }));
    assert.ok(rows.length > 0 && rows.length <= 10, `${inputContextFor(st)} rows ${rows.length}`);
    for (const row of rows) {
      assert.equal(row.length, 2);
      assert.ok(String(row[0]).length > 0 && String(row[1]).length > 0);
    }
  }
  // The fight card teaches the target keys and hides the flee until the hull is low.
  const combat = state({ player: { targetId: 2 } });
  const combatCard = contextHelpRows(combat, (a) => resolveActionLabel(combat, a));
  assert.ok(combatCard.some(([keys, verb]) => /Tab/.test(keys) && /Target/.test(verb)), 'Tab target row');
  assert.ok(combatCard.some(([keys]) => /Backspace/.test(keys)), 'Backspace clear row');
  assert.ok(!combatCard.some(([, verb]) => /Flee/.test(verb)), 'no flee while healthy');
  const wounded = lowHullState({ player: { targetId: 2 } });
  assert.ok(contextHelpRows(wounded, (a) => resolveActionLabel(wounded, a)).some(([, verb]) => /Flee/.test(verb)));
});

test('X5 #5: a saved rebind moves the Help card', () => {
  const rebound = state({
    settings: { gameplay: { controlScheme: 'pilot' }, controls: { bindings: { forward: ['KeyI'] } } },
  });
  const rows = contextHelpRows(rebound, (action) => resolveActionLabel(rebound, action, { sep: '' }));
  const move = rows.find(([, verb]) => verb === 'Move');
  assert.ok(move, 'Move row present');
  assert.match(move[0], /I/, `Move row reads ${move[0]}`);
  assert.doesNotMatch(move[0], /W/, `Move row still teaches W: ${move[0]}`);
});

test('without a resolver the card prints action ids, never blanks', () => {
  const rows = contextHelpRows(state());
  const move = rows.find(([, verb]) => verb === 'Move');
  assert.ok(move);
  assert.equal(move[0], 'forward yawLeft reverse yawRight');
});
