import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { tickAutoTarget, toggleAutoTarget } from '../src/combat/autoTargetMode.js';
import { autoTargetAssist } from '../src/systems/autoTargetAssist.js';
import { input } from '../src/systems/input.js';
import * as flightModule from '../src/systems/flightV3.js';

function steeringState() {
  const state = createGameState(0xa07057ee);
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    data: { weapons: [] },
  };
  const hostile = {
    id: 2,
    type: 'ship',
    alive: true,
    team: 1,
    pos: { x: 300, z: 0 },
    vel: { x: 0, z: 0 },
  };
  state.playerId = player.id;
  state.player.targetId = hostile.id;
  state.entities.set(player.id, player);
  state.entities.set(hostile.id, hostile);
  state.entityList.push(player, hostile);
  state.input.autoFire = true;
  state.input.pointerScreen = { x: 700, y: 80, active: true };
  return { state, player, hostile };
}

test('auto-target joystick maps local stick axes directly, independent of weapon aim and ship heading', () => {
  const { state, player } = steeringState();
  player.rot = Math.PI / 2;
  state.input.aimWorld = { x: 300, z: 0 };
  state.input.aimAngle = 0;
  state.input.autoTargetStick = { active: true, x: 0.6, y: 0.8, magnitude: 1 };

  tickAutoTarget(state, 1 / 60, null);

  assert.equal(state.input.turnIntent, 0.6,
    'right deflection is right yaw, not an absolute world heading');
  assert.equal(state.input.moveZ, 0.8,
    'up deflection is forward thrust, so top-right behaves like a physical joystick');
  assert.equal(state.input.aimAngle, 0,
    'the locked hostile remains the independent weapon-aim authority');
});

test('a centered auto-target stick does not erase direct keyboard steering', () => {
  const { state } = steeringState();
  state.input.turnIntent = -0.65;
  state.input.autoTargetStick = { active: false, x: 0, y: 0, magnitude: 0 };

  tickAutoTarget(state, 1 / 60, null);

  assert.equal(state.input.turnIntent, -0.65,
    'center is neutral; keyboard yaw remains available without a hidden mouse demand');
});

test('stick component size directly provides granular yaw and throttle', () => {
  const { state } = steeringState();
  state.input.autoTargetStick = { active: true, x: 0.25, y: -0.4, magnitude: 0.47 };

  tickAutoTarget(state, 1 / 60, null);

  assert.equal(state.input.turnIntent, 0.25,
    'quarter-right deflection should request quarter yaw authority');
  assert.equal(state.input.moveZ, -0.4,
    'down deflection should request proportional reverse thrust');
});

test('auto-target helm mode raises yaw speed, acceleration, and reversal braking by 50 percent', () => {
  assert.equal(typeof flightModule.applyAutoTargetHelmProfile, 'function');
  const tuned = flightModule.applyAutoTargetHelmProfile({
    maxYawRate: 2,
    yawAccel: 6,
    yawBrake: 8,
    mainAccel: 40,
  });
  assert.deepEqual(tuned, {
    maxYawRate: 3,
    yawAccel: 9,
    yawBrake: 12,
    mainAccel: 40,
  });
});

test('auto-target keeps the visible joystick separate while target overlays show weapon lock', () => {
  const source = readFileSync(new URL('../src/ui/uiRoot.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /if \(autoTarget\) \{[\s\S]{0,500}projectLockedReticle/,
    'the only software cursor must not disappear onto the independently aimed hostile');
  assert.match(source, /auto-target-stick-base/,
    'auto-target needs a visible neutral/base so the moving puck cannot read as another target');
});

test('auto-target activation explains the captured gesture control', () => {
  const state = createGameState(0xa0707ea5);
  const bus = createBus();
  const toasts = [];
  bus.on('toast', (toast) => toasts.push(toast));

  toggleAutoTarget(state, bus);

  assert.match(toasts.at(-1).text, /trackpad joystick/i);
});

test('G acquires canvas pointer lock for bounded steering and releases it when disabled', async () => {
  const previous = installPointerLockBrowser();
  try {
    const state = createGameState(0xa07010c0);
    const bus = createBus();
    const subject = Object.create(autoTargetAssist);
    subject.init({ state, bus, helpers: {} });

    const keydown = globalThis.__autoTargetListeners.get('keydown')[0];
    const keyup = globalThis.__autoTargetListeners.get('keyup')[0];
    const event = keyEvent();
    keydown(event);
    await Promise.resolve();

    assert.equal(state.input.autoFire, true);
    assert.equal(globalThis.__autoTargetCanvas.lockRequests, 1,
      'enabling auto-target must capture relative trackpad/mouse motion inside the game window');

    keyup(event);
    keydown(keyEvent());
    assert.equal(state.input.autoFire, false);
    assert.equal(globalThis.__autoTargetDocument.exitRequests, 1,
      'disabling auto-target must return the OS pointer immediately');

    subject.destroy();
  } finally {
    previous();
  }
});

test('losing pointer lock or leaving flight cancels auto-target instead of restoring edge escape', async () => {
  const previous = installPointerLockBrowser();
  try {
    const state = createGameState(0xa070e5ca);
    state.mode = 'flight';
    const bus = createBus();
    const subject = Object.create(autoTargetAssist);
    subject.init({ state, bus, helpers: {} });
    const keydown = globalThis.__autoTargetListeners.get('keydown')[0];
    const keyup = globalThis.__autoTargetListeners.get('keyup')[0];

    keydown(keyEvent());
    await Promise.resolve();
    assert.equal(state.input.autoFire, true);
    const pointerLockListeners = globalThis.__autoTargetListeners.get('document:pointerlockchange') || [];
    assert.equal(pointerLockListeners.length, 1,
      'auto-target must observe Escape or platform pointer-lock loss');
    globalThis.__autoTargetDocument.pointerLockElement = null;
    pointerLockListeners[0]();
    assert.equal(state.input.autoFire, false,
      'pointer-lock loss must cancel the steering mode that depended on it');

    keyup(keyEvent());
    keydown(keyEvent());
    await Promise.resolve();
    assert.equal(state.input.autoFire, true);
    bus.emit('mode:changed', { mode: 'menu', previousMode: 'flight' });
    assert.equal(state.input.autoFire, false,
      'leaving flight must cancel auto-target and release its pointer capture');

    subject.destroy();
  } finally {
    previous();
  }
});

test('locked trackpad motion drives a bounded virtual stick from window center', () => {
  const restore = installInputBrowser();
  try {
    const state = createGameState(0xa070571c);
    const bus = createBus();
    const player = {
      id: 1,
      type: 'ship',
      alive: true,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      rot: 0,
      data: { weapons: [] },
    };
    state.playerId = player.id;
    state.entities.set(player.id, player);
    state.entityList.push(player);
    state.mode = 'flight';
    state.input.autoFire = true;
    const subject = Object.create(input);
    subject.init({
      state,
      bus,
      helpers: {
        raycastToPlane(ndc) {
          // Perspective projection expands horizontal NDC by the viewport aspect ratio.
          return { x: ndc.x * (innerWidth / innerHeight) * 100, z: ndc.y * 100 };
        },
      },
    });

    subject.update(1 / 60, state);
    const center = { x: innerWidth / 2, y: innerHeight / 2 };
    assert.deepEqual(subject._screen, { ...center, active: true },
      'enabling auto-target starts the virtual stick at neutral');

    const mousemove = globalThis.__inputListeners.get('mousemove')[0];
    mousemove({ type: 'mousemove', clientX: center.x, clientY: center.y, movementX: 120, movementY: -120 });
    subject.update(1 / 60, state);

    assert(subject._screen.x > center.x && subject._screen.y < center.y,
      'a top-right trackpad swipe deflects the virtual stick top-right');
    assert.equal(state.input.autoTargetStick.active, true);
    assert(state.input.autoTargetStick.x > 0 && state.input.autoTargetStick.y > 0,
      'top-right screen deflection maps to right-yaw plus forward-thrust axes');
    assert(state.input.autoTargetStick.magnitude > 0 && state.input.autoTargetStick.magnitude <= 1,
      'virtual stick magnitude is normalized and bounded');

    globalThis.__setInputNow(1200);
    subject.update(1 / 60, state);
    assert(subject._screen.x > center.x && subject._screen.y < center.y,
      'lifting a finger must preserve held joystick deflection so the ship has time to turn');
    assert.equal(state.input.autoTargetStick.active, true);

    globalThis.__setInputNow(1210);
    mousemove({ type: 'mousemove', clientX: center.x, clientY: center.y, movementX: -60, movementY: 60 });
    subject.update(1 / 60, state);
    assert(subject._screen.x < center.x && subject._screen.y > center.y,
      'the next opposite swipe starts from neutral and flips direction immediately');
  } finally {
    restore();
  }
});

function keyEvent() {
  return {
    code: 'KeyG',
    target: { closest: () => null },
    preventDefault() {},
    stopImmediatePropagation() {},
  };
}

function installPointerLockBrowser() {
  const saved = {
    addEventListener: globalThis.addEventListener,
    removeEventListener: globalThis.removeEventListener,
    document: globalThis.document,
    window: globalThis.window,
  };
  const listeners = new Map();
  const canvas = {
    lockRequests: 0,
    requestPointerLock() {
      this.lockRequests += 1;
      doc.pointerLockElement = this;
      return Promise.resolve();
    },
  };
  const doc = {
    pointerLockElement: null,
    exitRequests: 0,
    getElementById: (id) => id === 'gl-canvas' ? canvas : null,
    addEventListener(type, fn) {
      const list = listeners.get(`document:${type}`) || [];
      list.push(fn);
      listeners.set(`document:${type}`, list);
    },
    removeEventListener(type, fn) {
      const key = `document:${type}`;
      const list = listeners.get(key) || [];
      listeners.set(key, list.filter((item) => item !== fn));
    },
    exitPointerLock() {
      this.exitRequests += 1;
      this.pointerLockElement = null;
    },
    body: { classList: { contains: () => false } },
  };
  globalThis.__autoTargetListeners = listeners;
  globalThis.__autoTargetCanvas = canvas;
  globalThis.__autoTargetDocument = doc;
  globalThis.addEventListener = (type, fn) => {
    const list = listeners.get(type) || [];
    list.push(fn);
    listeners.set(type, list);
  };
  globalThis.removeEventListener = (type, fn) => {
    const list = listeners.get(type) || [];
    listeners.set(type, list.filter((item) => item !== fn));
  };
  globalThis.document = doc;
  globalThis.window = globalThis;
  return () => {
    globalThis.addEventListener = saved.addEventListener;
    globalThis.removeEventListener = saved.removeEventListener;
    globalThis.document = saved.document;
    globalThis.window = saved.window;
    delete globalThis.__autoTargetListeners;
    delete globalThis.__autoTargetCanvas;
    delete globalThis.__autoTargetDocument;
  };
}

function installInputBrowser() {
  const saved = {
    addEventListener: globalThis.addEventListener,
    removeEventListener: globalThis.removeEventListener,
    document: globalThis.document,
    window: globalThis.window,
    navigator: globalThis.navigator,
    innerWidth: globalThis.innerWidth,
    innerHeight: globalThis.innerHeight,
    performance: globalThis.performance,
  };
  const listeners = new Map();
  const canvas = {
    addEventListener(type, fn) {
      const list = listeners.get(`canvas:${type}`) || [];
      list.push(fn);
      listeners.set(`canvas:${type}`, list);
    },
  };
  const doc = {
    pointerLockElement: canvas,
    getElementById: (id) => id === 'gl-canvas' ? canvas : null,
    body: { classList: { contains: () => false } },
  };
  globalThis.__inputListeners = listeners;
  globalThis.addEventListener = (type, fn) => {
    const list = listeners.get(type) || [];
    list.push(fn);
    listeners.set(type, list);
  };
  globalThis.removeEventListener = () => {};
  globalThis.document = doc;
  globalThis.window = globalThis;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { getGamepads: () => [], maxTouchPoints: 0 },
  });
  globalThis.innerWidth = 800;
  globalThis.innerHeight = 600;
  let now = 1000;
  Object.defineProperty(globalThis, 'performance', {
    configurable: true,
    value: { now: () => now },
  });
  globalThis.__setInputNow = (value) => { now = value; };
  return () => {
    globalThis.addEventListener = saved.addEventListener;
    globalThis.removeEventListener = saved.removeEventListener;
    globalThis.document = saved.document;
    globalThis.window = saved.window;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: saved.navigator });
    globalThis.innerWidth = saved.innerWidth;
    globalThis.innerHeight = saved.innerHeight;
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: saved.performance });
    delete globalThis.__inputListeners;
    delete globalThis.__setInputNow;
  };
}
