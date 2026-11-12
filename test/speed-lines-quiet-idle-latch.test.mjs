// Quiet latch for idle feel._updateSpeedLines residual under prepareFrame.
// Soft-GPU fps not claimed. Picture unchanged while overlay already opacity 0.

import assert from 'node:assert/strict';
import test from 'node:test';

import { feel } from '../src/render/feel.js';
import {
  VELOCITY_LANGUAGE_FLAGS,
  VL_WAKE_AT,
} from '../src/render/velocityLanguage.js';

const DT = 1 / 60;

function makeHarness(overrides = {}) {
  const player = {
    id: 1,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    maxSpeed: 120,
    combatSpeed: 120,
    flags: { boosting: false },
    _flightFrame: { governor: { physicsEarned: false } },
    ...overrides.player,
  };
  const state = {
    playerId: player.id,
    entities: new Map([[player.id, player]]),
    mode: 'flight',
    camera: { tilt: 60 },
    settings: { video: { motionReduce: false } },
    render: {},
    ...overrides.state,
  };
  const system = Object.create(feel);
  system.state = state;
  let clearCount = 0;
  system._slCanvas = { isConnected: true, style: { opacity: '0' }, width: 0, height: 0 };
  system._slCtx = {
    clearRect() { clearCount += 1; },
    createLinearGradient() { return { addColorStop() {} }; },
    createPattern() { return null; },
    save() {},
    restore() {},
    transform() {},
    translate() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fillRect() {},
    set lineCap(_) {},
    set globalCompositeOperation(_) {},
  };
  system._slOpacity = 0;
  system._slGrain = 0;
  system._streaks = [];
  system._speedLinesQuietIdle = false;
  system._speedLinesQuietMaxSpd = 1;
  return { system, state, player, getClearCount: () => clearCount };
}

test('speed-lines quiet-latches after idle silent publish and wakes on speed', () => {
  const savedBands = VELOCITY_LANGUAGE_FLAGS.bands;
  VELOCITY_LANGUAGE_FLAGS.bands = true;
  try {
    const { system, player } = makeHarness();

    for (let i = 0; i < 4; i++) system._updateSpeedLines(DT);
    assert.equal(system._speedLinesQuietIdle, true, 'idle speed-lines must quiet-latch');

    const frameBefore = system.state.render.velocityLanguage.frame;
    for (let i = 0; i < 30; i++) system._updateSpeedLines(DT);
    assert.equal(system._speedLinesQuietIdle, true, 'must stay latched while parked');
    assert.equal(
      system.state.render.velocityLanguage.frame,
      frameBefore,
      'latched path must not republish velocity language',
    );

    player.vel.x = system._speedLinesQuietMaxSpd * VL_WAKE_AT * 0.9;
    system._updateSpeedLines(DT);
    assert.equal(system._speedLinesQuietIdle, false, 'speed must wake the quiet latch');
    assert.ok(
      system.state.render.velocityLanguage.frame > frameBefore,
      'wake must publish a fresh velocity-language record',
    );

    player.vel.x = 0;
    system._slOpacity = 0;
    system._slGrain = 0;
    for (let i = 0; i < 4; i++) system._updateSpeedLines(DT);
    assert.equal(system._speedLinesQuietIdle, true, 'must re-latch after returning to idle');
  } finally {
    VELOCITY_LANGUAGE_FLAGS.bands = savedBands;
  }
});

test('speed-lines quiet latch wakes on boost and physicsEarned', () => {
  const savedBands = VELOCITY_LANGUAGE_FLAGS.bands;
  VELOCITY_LANGUAGE_FLAGS.bands = true;
  try {
    const { system, player } = makeHarness();
    for (let i = 0; i < 4; i++) system._updateSpeedLines(DT);
    assert.equal(system._speedLinesQuietIdle, true);

    player.flags.boosting = true;
    system._updateSpeedLines(DT);
    assert.equal(system._speedLinesQuietIdle, false, 'boost must wake');

    player.flags.boosting = false;
    system._slOpacity = 0;
    system._slGrain = 0;
    for (let i = 0; i < 4; i++) system._updateSpeedLines(DT);
    assert.equal(system._speedLinesQuietIdle, true);

    player._flightFrame.governor.physicsEarned = true;
    system._updateSpeedLines(DT);
    assert.equal(system._speedLinesQuietIdle, false, 'physicsEarned must wake');
  } finally {
    VELOCITY_LANGUAGE_FLAGS.bands = savedBands;
  }
});

test('loading mode clears quiet latch so band-0 still publishes', () => {
  const savedBands = VELOCITY_LANGUAGE_FLAGS.bands;
  VELOCITY_LANGUAGE_FLAGS.bands = true;
  try {
    const { system, state } = makeHarness();
    for (let i = 0; i < 4; i++) system._updateSpeedLines(DT);
    assert.equal(system._speedLinesQuietIdle, true);
    const frameBefore = state.render.velocityLanguage.frame;

    state.mode = 'loading';
    system._updateSpeedLines(DT);
    assert.equal(system._speedLinesQuietIdle, false);
    assert.ok(state.render.velocityLanguage.frame > frameBefore);
  } finally {
    VELOCITY_LANGUAGE_FLAGS.bands = savedBands;
  }
});

test('hidden HUD idles speed-lines without stopping velocity publication', () => {
  const savedBands = VELOCITY_LANGUAGE_FLAGS.bands;
  VELOCITY_LANGUAGE_FLAGS.bands = true;
  try {
    const { system, state, player, getClearCount } = makeHarness({
      state: { ui: { docked: true } },
      player: { vel: { x: 100, z: 0 }, flags: { boosting: true } },
    });
    system._slOpacity = 0.8;
    system._slGrain = 0.4;
    system._streaks = [{ uv: 1 }];
    const frameBefore = state.render.velocityLanguage?.frame || 0;

    system._updateSpeedLines(DT);

    assert.ok(
      state.render.velocityLanguage.frame > frameBefore,
      'hidden HUD must still publish the retained velocity-language record',
    );
    assert.equal(getClearCount(), 0, 'hidden HUD must not clear the full canvas');
    assert.equal(system._slOpacity, 0, 'hidden HUD must reset visible opacity');
    assert.equal(system._slGrain, 0, 'hidden HUD must reset grain opacity');
    assert.deepEqual(system._streaks, [], 'hidden HUD must release the active streak walk');
    assert.equal(system._speedLinesQuietIdle, false, 'resume must recompute from live speed');
    assert.equal(player.flags.boosting, true, 'the hidden gate must not mutate gameplay state');
  } finally {
    VELOCITY_LANGUAGE_FLAGS.bands = savedBands;
  }
});

test('speed-lines resume after a modal without inheriting stale presentation state', () => {
  const savedBands = VELOCITY_LANGUAGE_FLAGS.bands;
  const savedWindow = globalThis.window;
  VELOCITY_LANGUAGE_FLAGS.bands = true;
  globalThis.window = { innerWidth: 1280, innerHeight: 720 };
  try {
    const { system, state, player } = makeHarness({
      state: { ui: { screenStack: ['pause'] } },
      player: { vel: { x: 100, z: 0 } },
    });
    system._slOpacity = 0.8;
    system._slGrain = 0.4;
    system._streaks = [{ uv: 1 }];
    system._updateSpeedLines(DT);
    assert.equal(system._slOpacity, 0);
    assert.deepEqual(system._streaks, []);

    state.ui.screenStack.length = 0;
    // The resume path reaches the existing quiet/visibility logic; it must not remain suppressed
    // by the modal reset when the player is still moving.
    system._updateSpeedLines(DT);
    assert.equal(system._speedLinesQuietIdle, false);
    assert.ok(system._slOpacity > 0, 'visible resume must restore the active speed-line envelope');
    assert.equal(player.vel.x, 100, 'resume must read the unchanged live velocity');
  } finally {
    VELOCITY_LANGUAGE_FLAGS.bands = savedBands;
    if (savedWindow === undefined) delete globalThis.window;
    else globalThis.window = savedWindow;
  }
});
