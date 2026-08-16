import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { save } from '../src/save/saveSystem.js';
import {
  dockingAssistHintModel,
  dockingAssistScreenGeometry,
} from '../src/ui/hud.js';

test('new careers opt into the docking vector while legacy saves remain unchanged', () => {
  const fresh = createGameState(5401);
  assert.equal(fresh.settings.gameplay.dockAssistHint, true);

  const legacy = createGameState(5402);
  save._restoreSettings.call({
    state: legacy,
    _readProfileSettings: () => null,
  }, { gameplay: { tutorialHints: true }, controls: {} });
  assert.equal(legacy.settings.gameplay.dockAssistHint, false,
    'loading a save that predates the option must not silently add a new HUD aid');

  const explicit = createGameState(5403);
  save._restoreSettings.call({
    state: explicit,
    _readProfileSettings: () => null,
  }, { gameplay: { dockAssistHint: true }, controls: {} });
  assert.equal(explicit.settings.gameplay.dockAssistHint, true,
    'an explicit per-save choice survives restoration');

  const profiled = createGameState(5404);
  save._restoreSettings.call({
    state: profiled,
    _readProfileSettings: () => ({ gameplay: { dockAssistHint: true } }),
  }, { gameplay: {}, controls: {} });
  assert.equal(profiled.settings.gameplay.dockAssistHint, true,
    'an explicit player-profile choice overrides legacy absence');
});

test('the hint reads only the authoritative active corridor and its live assist phase', () => {
  const state = createGameState(5410);
  state.dockingCorridor = {
    phase: 'approach', inCorridor: false, inCapture: false, headingOk: false,
    berth: { x: 120, z: -40 }, assist: null,
  };
  assert.deepEqual(dockingAssistHintModel(state), {
    visible: false, berth: null, assisting: false, headingOk: false, label: '',
  });

  state.dockingCorridor.inCorridor = true;
  state.dockingCorridor.headingOk = true;
  assert.deepEqual(dockingAssistHintModel(state), {
    visible: true, berth: state.dockingCorridor.berth, assisting: false,
    headingOk: true, label: 'DOCK VECTOR',
  });

  state.dockingCorridor.inCapture = true;
  state.dockingCorridor.assist = { ax: 2, az: -1 };
  assert.equal(dockingAssistHintModel(state).label, 'CAPTURE ASSIST');

  state.settings.gameplay.dockAssistHint = false;
  assert.equal(dockingAssistHintModel(state).visible, false,
    'the presentation option never mutates or second-guesses the sim readout');
});

test('the projected berth vector is bounded to honest on-screen geometry', () => {
  assert.deepEqual(
    dockingAssistScreenGeometry(
      { x: 400, y: 500, onScreen: true },
      { x: 520, y: 410, onScreen: true },
    ),
    {
      visible: true, x: 400, y: 500, dx: 120, dy: -90, length: 150,
      angleDeg: -36.86989764584402, labelDx: 69, labelDy: -38,
    },
  );
  assert.equal(dockingAssistScreenGeometry(
    { x: 400, y: 500, onScreen: true },
    { x: 520, y: 410, onScreen: false },
  ).visible, false, 'no edge-arrow fiction is invented for a berth behind the camera');
  assert.equal(dockingAssistScreenGeometry(
    { x: 400, y: 500, onScreen: true },
    { x: 405, y: 503, onScreen: true },
  ).visible, false, 'the vector retires at the berth instead of jittering over the ship');
});
