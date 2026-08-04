import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import {
  PROFILE_SETTINGS_KEY,
  bootstrapProfileSettingsBeforeRegistry,
} from '../src/core/graphicsProfileBootstrap.js';
import { input, DEFAULTS } from '../src/systems/input.js';

const DT = 1 / 60;

function makeState(settings = createGameState(47).settings) {
  const player = { id: 'p', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0 };
  const rock = { id: 'rock', alive: true, type: 'asteroid', pos: { x: 0, z: 100 }, vel: { x: 0, z: 0 } };
  return {
    mode: 'flight',
    playerId: 'p',
    simTime: 0,
    tick: 0,
    ui: { screenStack: [] },
    settings,
    nav: {},
    player: {
      tether: { active: false, targetId: null, strain: 0, load: 0, restLength: 0, phase: 'slack' },
    },
    entities: new Map([['p', player], ['rock', rock]]),
    input: {
      actions: {},
      aimWorld: { x: 0, z: 0 },
      mouseNdc: { x: 0, y: 0 },
      pointerScreen: { x: 0, y: 0, active: false },
      autoFire: false,
    },
  };
}

function makeInput(gamepad = null) {
  const host = Object.create(input);
  host._keys = Object.create(null);
  host._ndc = { x: 0, y: 0 };
  host._screen = { x: 0, y: 0, active: false };
  host._m0 = host._m1 = host._m2 = false;
  host._lastKbmMs = 0;
  host.helpers = { raycastToPlane: () => ({ x: 0, z: 0 }) };
  host.bus = { emit() {} };
  host.gamepad = gamepad;
  host.touch = null;
  return host;
}

function step(host, state, ticks = 1) {
  for (let i = 0; i < ticks; i++) {
    state.tick += 1;
    state.simTime += DT;
    host.update(DT, state);
  }
}

test('PQ-003 new profiles reserve Space for Massline, retain F as its alias, and keep defaults collision-free', () => {
  const fresh = createGameState(47);
  assert.equal(fresh.settings.controls.masslineBindingProfile, 'space-v1');
  for (const [schemeName, scheme] of Object.entries(DEFAULTS.SCHEMES)) {
    assert.deepEqual(scheme.tether, ['Space', 'KeyF'], `${schemeName} must expose Space then F`);
    for (const [action, codes] of Object.entries(scheme)) {
      if (action === 'tether' || !Array.isArray(codes)) continue;
      assert.equal(codes.includes('Space'), false, `${schemeName}.${action} must not steal Massline Space`);
    }
  }
});

test('existing profiles migrate to the same Space/F Massline binding as new profiles', () => {
  const state = createGameState(47);
  const storage = {
    getItem(key) {
      if (key !== PROFILE_SETTINGS_KEY) return null;
      return JSON.stringify({
        version: 1,
        settings: {
          gameplay: { controlScheme: 'pilot', controlSchemeV2: true },
          controls: { bindings: null },
        },
      });
    },
  };

  assert.equal(bootstrapProfileSettingsBeforeRegistry(state, storage), true);
  assert.equal(state.settings.controls.masslineBindingProfile, 'space-v1');
  assert.deepEqual(state.settings.controls.bindings.tether, ['Space', 'KeyF']);
  assert.equal(state.settings.controls.bindings.brake?.includes('Space') || false, false);
});

test('PQ-003 Space press publishes an immediate normalized latch packet', () => {
  const host = makeInput();
  const state = makeState();
  host._keys.Space = true;
  step(host, state);

  assert.ok(state.input.actions.massline, 'input must publish the normalized Massline packet');
  assert.equal(state.input.actions.massline.latch, true);
  assert.equal(state.input.actions.massline.phase, 'preview');
  assert.equal(state.input.actions.tetherFire, true, 'legacy latch consumer stays bridged');
  assert.equal(state.input.brake, false, 'Space does not also brake on the new profile');
});

test('PQ-003 quick attached tap cuts on release while a hold enters line control without cutting', () => {
  const host = makeInput();
  const state = makeState();
  state.player.tether.active = true;
  state.player.tether.targetId = 'rock';

  host._keys.Space = true;
  step(host, state);
  assert.ok(state.input.actions.massline, 'input must publish the normalized Massline packet');
  assert.equal(state.input.actions.massline.cut, false);
  host._keys.Space = false;
  step(host, state);
  assert.equal(state.input.actions.massline.cut, true, 'quick release is the cut edge');
  assert.equal(state.input.actions.massline.source, 'keyboard', 'release keeps one-tick provenance');
  step(host, state);
  assert.equal(state.input.actions.massline.source, null, 'idle packets do not retain stale device provenance');

  host._keys.Space = true;
  host._keys.KeyW = true;
  step(host, state, 14);
  assert.equal(state.input.actions.massline.lineControl, true);
  host._keys.Space = false;
  host._keys.KeyW = false;
  step(host, state);
  assert.equal(state.input.actions.massline.cut, false, 'release after line control never cuts');
});

test('an attached Massline held without a line command still disconnects on release', () => {
  const host = makeInput();
  const state = makeState();
  state.player.tether.active = true;
  state.player.tether.targetId = 'rock';

  host._keys.Space = true;
  step(host, state, 30);
  assert.equal(state.input.actions.massline.lineControl, false,
    'holding the Massline key alone must not silently enter another control mode');
  host._keys.Space = false;
  step(host, state);
  assert.equal(state.input.actions.massline.cut, true,
    'release must remain a dependable disconnect when no reel/orbit command occurred');
});

test('PQ-003 200 ms history joins turn-before-press and press-before-turn into one line-control intent', () => {
  for (const order of ['turn-first', 'press-first']) {
    const host = makeInput();
    const state = makeState();
    state.player.tether.active = true;
    state.player.tether.targetId = 'rock';

    if (order === 'turn-first') {
      host._keys.ArrowLeft = true;
      step(host, state, 4);
      host._keys.ArrowLeft = false;
      host._keys.Space = true;
    } else {
      host._keys.Space = true;
      step(host, state, 4);
      host._keys.ArrowRight = true;
      step(host, state);
      host._keys.ArrowRight = false;
    }
    step(host, state, 10);

    assert.ok(state.input.actions.massline, 'input must publish the normalized Massline packet');
    assert.equal(state.input.actions.massline.lineControl, true, `${order} reaches line control`);
    assert.equal(
      state.input.actions.massline.orbitDirection,
      order === 'turn-first' ? -1 : 1,
      `${order} retains the nearby ship-local orbit intent`,
    );
    assert.equal(state.input.turnIntent, 0,
      'remembered line intent must not manufacture yaw after the physical key is released');
  }
});

test('PQ-003 line-control publishes orbit intent without letting Helm Assist become the orbit controller', () => {
  const settings = createGameState(47).settings;
  settings.gameplay.controlScheme = 'helm-assist';
  const host = makeInput();
  const state = makeState(settings);
  state.player.tether.active = true;
  state.player.tether.targetId = 'rock';
  state.entities.get('p').rot = 1;
  host._screen.active = true;
  host._keys.Space = true;
  host._keys.ArrowRight = true;
  step(host, state, 14);

  assert.equal(state.input.actions.massline.lineControl, true);
  assert.equal(state.input.actions.massline.orbitDirection, 1);
  assert.equal(state.input.turnIntent, 1,
    'the orbit detector observes direct pilot yaw instead of suppressing it at input');
});

test('a loaded tether does not make Helm Assist face the anchor', () => {
  const settings = createGameState(47).settings;
  settings.gameplay.controlScheme = 'helm-assist';
  const host = makeInput();
  const state = makeState(settings);
  state.player.tether = { active: true, targetId: 'rock', phase: 'loaded', load: 0.8 };
  host._screen.active = true;
  host._lastKbmTick = 0;
  host._lastKbmSeq = 0;
  host.helpers.raycastToPlane = () => ({ x: 100, z: 0 });

  step(host, state);

  assert.equal(state.input.turnIntent, 0,
    'Helm Assist follows the cursor exactly as it does in open flight; the anchor owns no yaw');
});

test('PQ-003 line-control maps forward/reverse/turn/boost and clears on modal focus loss', () => {
  const host = makeInput();
  const state = makeState();
  state.player.tether.active = true;
  state.player.tether.targetId = 'rock';
  host._keys.Space = true;
  host._keys.ArrowDown = true;
  host._keys.ArrowRight = true;
  host._keys.ShiftLeft = true;
  step(host, state, 14);

  assert.ok(state.input.actions.massline, 'input must publish the normalized Massline packet');
  assert.equal(state.input.actions.massline.lineLength, 1, 'reverse pays line out');
  assert.equal(state.input.actions.massline.payOut, 1);
  assert.equal(state.input.actions.massline.orbitDirection, 1);
  assert.equal(state.input.actions.massline.pump, true);

  state.ui.screenStack.push('pause');
  step(host, state);
  assert.deepEqual(state.input.actions.massline, {
    phase: 'idle', latch: false, cut: false, lineControl: false,
    lineLength: 0, reelIn: 0, payOut: 0, orbitDirection: 0, pump: false,
    buffered: false, source: null,
  });
});

test('PQ-003 modal reset blocks held-through input but accepts the first fresh post-modal press', () => {
  const host = makeInput();
  const state = makeState();
  state.ui.screenStack.push('pause');
  step(host, state);

  state.ui.screenStack.pop();
  host._keys.Space = true;
  step(host, state);
  assert.equal(state.input.actions.massline.latch, true, 'a fresh press after closing UI is not swallowed');

  state.ui.screenStack.push('pause');
  step(host, state);
  state.ui.screenStack.pop();
  step(host, state);
  assert.equal(state.input.actions.massline.latch, false, 'a held-through press cannot leak out of the modal');
});

test('PQ-003 gamepad A/Cross reaches the same grammar in open flight but yields to a dock prompt', () => {
  const gp = {
    axes: { leftX: -0.75, leftY: -0.8, rightX: 0, rightY: 0 },
    actions: {
      massline: { held: true, pressed: true, released: false, value: 1 },
      boost: { held: true }, fire: { held: false }, mine: { held: false },
      brake: { held: false }, countermeasure: { held: false },
    },
    lastActiveMs: 1,
    tick() {},
    isConnected() { return true; },
  };
  const host = makeInput(gp);
  const state = makeState();
  state.player.tether.active = true;
  state.player.tether.targetId = 'rock';
  step(host, state, 14);

  assert.ok(state.input.actions.massline, 'input must publish the normalized Massline packet');
  assert.equal(state.input.actions.massline.lineControl, true);
  assert.ok(state.input.actions.massline.lineLength < -0.7, 'stick forward reels in');
  assert.ok(state.input.actions.massline.orbitDirection < -0.7, 'stick left requests counterclockwise orbit');
  assert.equal(state.input.actions.massline.pump, true);

  const dockHost = makeInput(gp);
  const dockState = makeState();
  dockState.ui.dockInRange = true;
  step(dockHost, dockState);
  assert.ok(dockState.input.actions.massline);
  assert.equal(dockState.input.actions.massline.latch, false, 'dock/accept wins the contextual A press');
});
