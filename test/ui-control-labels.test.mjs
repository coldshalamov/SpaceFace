import assert from 'node:assert/strict';
import test from 'node:test';

import {
  input,
  resolveActionCodes,
  resolveActionLabel,
  shouldNeutralizeFlightInput,
  TAUGHT_FLIGHT_ACTIONS,
} from '../src/systems/input.js';
import { BINDINGS } from '../src/ui/bindings.js';
import { resolveDrillControlMap } from '../src/ui/screens/drill.js';
import { controlPrompt, setPromptScheme } from '../src/ui/controlPrompts.js';

function pilotState(bindings = null) {
  return {
    mode: 'flight',
    playerId: 1,
    ui: { screenStack: [] },
    input: { blocked: false, actions: {}, pointerScreen: { x: 0, y: 0, active: false } },
    settings: {
      gameplay: { controlScheme: 'pilot' },
      controls: { bindings },
    },
  };
}

test('every taught PILOT action labels a bound key, and that key produces the action', () => {
  const state = pilotState();
  const host = Object.create(input);
  for (const action of TAUGHT_FLIGHT_ACTIONS) {
    const codes = resolveActionCodes(state, action);
    const label = resolveActionLabel(state, action);
    if (action === 'fire') {
      assert.equal(label, 'LMB', 'empty fire binding is the left mouse button');
      continue;
    }
    assert.ok(codes.length > 0, `${action} must have a keyboard code on PILOT`);
    assert.ok(label.length > 0, `${action} must print a label`);
    host._keys = Object.create(null);
    host._keys[codes[0]] = true;
    assert.equal(host._held(state, action), true, `${label} must produce ${action}`);
  }
});

test('a remap re-labels HUD, rover, and prompts, and the new key is the one that fires', () => {
  const state = pilotState();
  const before = resolveActionLabel(state, 'forward');
  assert.match(before, /^W\//);

  state.settings.controls.bindings = { forward: ['KeyY'] };
  assert.equal(resolveActionLabel(state, 'forward'), 'Y');

  const host = Object.create(input);
  host._keys = { KeyY: true };
  assert.equal(host._held(state, 'forward'), true);
  host._keys = { KeyW: true };
  assert.equal(host._held(state, 'forward'), false, 'the old W binding must not still fly after remap');

  const rover = resolveDrillControlMap(state);
  assert.ok(rover.up.includes('KeyY'), 'rover movement follows the remapped forward key');
  assert.match(rover.movementLabel, /\bY\b/);

  setPromptScheme('pilot');
  const prompt = controlPrompt('firstFlight', 'kbm', state);
  assert.match(prompt, /\bY thrusts\b/, 'onboarding copy follows the remapped forward key');
  assert.doesNotMatch(prompt, /^W thrusts/);
  const tutorial = controlPrompt('tutorialFlight', 'kbm', state);
  assert.match(tutorial, /\bY thrusts\b/);
  assert.doesNotMatch(tutorial, /\bUp\b/, 'a missing second bind must not invent an Up key');
});

test('focus loss and a flight→rover→flight handoff keep the same labelled keys', () => {
  const state = pilotState({ forward: ['KeyY'] });
  assert.equal(shouldNeutralizeFlightInput(state, false), false);

  state.input.blocked = true;
  assert.equal(shouldNeutralizeFlightInput(state, false), true, 'a blocked input fence drops flight keys');
  state.input.blocked = false;

  state.ui = { screenStack: ['drill'] };
  assert.equal(shouldNeutralizeFlightInput(state, false), true, 'rover overlay fences flight');
  const rover = resolveDrillControlMap(state);
  assert.equal(resolveActionLabel(state, 'forward'), 'Y');
  assert.ok(rover.up.includes('KeyY'), 'the rover still names the remapped key');

  state.ui = { screenStack: [] };
  assert.equal(shouldNeutralizeFlightInput(state, false), false, 'leaving the rover restores flight');
  assert.equal(resolveActionLabel(state, 'forward'), 'Y');
});

test('interface keys stay on the UI registry and do not drift from README-facing labels', () => {
  assert.equal(BINDINGS.dock.label, 'E');
  assert.equal(BINDINGS.localmap.label, 'M');
  assert.equal(BINDINGS.starmap.label, 'N');
  assert.equal(BINDINGS.codex.label, 'K');
  assert.equal(BINDINGS.missionLog.label, 'J');
});
