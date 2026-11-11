// S5 — the Swarm arcade set (design/program/finish/swarm/PLANS.md S5).
// Every action in the set resolves; every Adventure-only action resolves to nothing in a live
// Swarm run and still resolves normally in Adventure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveActionCodes } from '../src/systems/input.js';
import {
  isSwarmControls, swarmFlightActionAllowed, SWARM_FLIGHT_ACTIONS,
  SWARM_RAIL_SLOTS, swarmRailSlotAllowed, SWARM_HELP_ROWS,
} from '../src/data/swarmControls.js';

const SWARM_RUN = {
  mode: 'flight',
  settings: { gameplay: { controlScheme: 'pilot' }, controls: {} },
  run: { kind: 'survival', phase: 'active', ruleset: 'swarm', wave: 3 },
};
const ADVENTURE = {
  mode: 'flight',
  settings: { gameplay: { controlScheme: 'pilot' }, controls: {} },
  run: { kind: 'adventure', phase: 'active' },
};
// Adventure-only flight verbs — the ones a live Swarm run must make inert.
const ADVENTURE_ONLY = [
  'cruise', 'autoFire', 'countermeasure', 'scanPulse', 'siteBeam',
  'deployBeacon', 'deployShieldPylon', 'cycleBomb', 'bulletTime',
  'cloak', 'gyreSnare', 'travelBurn',
];

test('isSwarmControls fires only on a live swarm run', () => {
  assert.equal(isSwarmControls(SWARM_RUN), true);
  assert.equal(isSwarmControls(ADVENTURE), false);
  assert.equal(isSwarmControls({ run: { kind: 'survival', phase: 'inactive', ruleset: 'swarm' } }), false);
  assert.equal(isSwarmControls({}), false);
});

test('every action in the Swarm set resolves to a binding', () => {
  for (const action of SWARM_FLIGHT_ACTIONS) {
    assert.equal(swarmFlightActionAllowed(SWARM_RUN, action), true, action);
  }
  for (const action of ['pull', 'shove', 'pin', 'bomb', 'rig']) {
    const codes = resolveActionCodes(SWARM_RUN, action);
    assert.ok(codes.length > 0, `${action} resolves`);
  }
});

test('the five powers stay on 1–5', () => {
  assert.equal(resolveActionCodes(SWARM_RUN, 'pull')[0], 'Digit1');
  assert.equal(resolveActionCodes(SWARM_RUN, 'shove')[0], 'Digit2');
  assert.equal(resolveActionCodes(SWARM_RUN, 'pin')[0], 'Digit3');
  assert.equal(resolveActionCodes(SWARM_RUN, 'bomb')[0], 'Digit4');
  assert.equal(resolveActionCodes(SWARM_RUN, 'rig')[0], 'Digit5');
});

test('Space is the boost in Swarm and the tether leaves the keyboard', () => {
  assert.deepEqual(resolveActionCodes(SWARM_RUN, 'boost'), ['Space']);
  assert.deepEqual(resolveActionCodes(SWARM_RUN, 'tether'), []);
});

test('every Adventure-only action resolves to nothing in a live Swarm run', () => {
  for (const action of ADVENTURE_ONLY) {
    assert.equal(swarmFlightActionAllowed(SWARM_RUN, action), false, action);
    assert.deepEqual(resolveActionCodes(SWARM_RUN, action), [], `${action} inert in swarm`);
  }
});

test('the same Adventure-only actions still resolve normally in Adventure', () => {
  for (const action of ADVENTURE_ONLY) {
    assert.equal(swarmFlightActionAllowed(ADVENTURE, action), true, action);
    // G18-02: the Adventure verbs carry no keyboard seat — they are wheel slices and
    // rebindable rows, so an empty code list is correct here, not a broken binding.
    assert.deepEqual(resolveActionCodes(ADVENTURE, action), [], `${action} ships on the wheel in adventure`);
  }
  // And the unified seats hold in Adventure: Space is the boost, the Line is RMB (no key).
  assert.deepEqual(resolveActionCodes(ADVENTURE, 'boost'), ['Space']);
  assert.deepEqual(resolveActionCodes(ADVENTURE, 'tether'), []);
  assert.deepEqual(resolveActionCodes(ADVENTURE, 'contextWheel'), ['KeyQ']);
});

test('saved rebinds still apply to keys inside the Swarm set', () => {
  const rebound = {
    ...SWARM_RUN,
    settings: {
      ...SWARM_RUN.settings,
      controls: { bindings: { boost: ['KeyB'] } },
    },
  };
  assert.deepEqual(resolveActionCodes(rebound, 'boost'), ['KeyB']);
});

test('the Swarm rail is the six power icons and the Help card is the compact set', () => {
  assert.deepEqual(SWARM_RAIL_SLOTS, [1, 2, 3, 4, 5, 6]);
  for (const i of [0, 7, 8]) assert.equal(swarmRailSlotAllowed(SWARM_RUN, i), false, `slot ${i} off`);
  for (const i of [0, 7, 8]) assert.equal(swarmRailSlotAllowed(ADVENTURE, i), true, `slot ${i} on`);
  assert.equal(SWARM_HELP_ROWS.length, 10);
});
