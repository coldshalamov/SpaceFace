// NXB-003: one sampled press or release means the same verb no matter how many pictures
// were drawn around it, and no matter how the sim catches up. Drives the shipped input owner.
import test from 'node:test';
import assert from 'node:assert/strict';
import { input, applyFlightKeyEvent } from '../src/systems/input.js';
import { createBus } from '../src/core/eventBus.js';
import { createUiInput } from '../src/ui/input.js';
import { MASSLINE_HOLD_S } from '../src/systems/masslineInputGrammar.js';

function flightState() {
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, data: {},
    tether: { active: false },
  };
  const state = {
    mode: 'flight', simTime: 0, tick: 0,
    entities: new Map([[1, player]]), playerId: 1, player,
    settings: {
      gameplay: { controlScheme: 'pilot' },
      controls: {
        bindings: {},
        gamepad: { enabled: false },
        touch: { enabled: false },
      },
    },
    input: {
      autoFire: false, actions: {}, aimWorld: { x: 0, z: 0 },
      pointerScreen: { active: false }, mouseNdc: { x: 0, y: 0 },
    },
    ui: {},
  };
  return { state, player };
}

function boot() {
  const { state, player } = flightState();
  const owner = Object.create(input);
  owner.init({
    state,
    bus: createBus(),
    helpers: { raycastToPlane: () => ({ x: 0, z: 0 }) },
  });
  return { state, player, owner };
}

function key(owner, code, pressed, extra = {}) {
  return applyFlightKeyEvent(owner, { code, pressed, ...extra });
}

function step(owner, state, dt = 1 / 60) {
  state.simTime += dt;
  state.tick += 1;
  owner.update(dt, state);
  const actions = state.input.actions;
  return {
    beacon: actions.deployBeacon === true,
    detonate: actions.chargeDetonate === true,
    bomb: actions.dropBomb === true,
    cut: actions.tetherCut === true,
    latch: actions.tetherFire === true,
    moveZ: state.input.moveZ,
  };
}

function countTrue(samples, field) {
  return samples.reduce((n, sample) => n + (sample[field] ? 1 : 0), 0);
}

test('one press schedule counts the same verbs at 30, 60 and 120 Hz catch-up', () => {
  const events = [
    ['KeyU', true],
    ['KeyR', true],
    ['KeyU', false],
    ['KeyR', false],
    ['KeyU', true],
    ['KeyR', true],
  ];
  const rates = [1 / 30, 1 / 60, 1 / 120];
  const totals = [];
  for (const dt of rates) {
    const collapsed = boot();
    for (const [code, pressed] of events) key(collapsed.owner, code, pressed);
    const collapsedSteps = [];
    for (let i = 0; i < events.length; i += 1) collapsedSteps.push(step(collapsed.owner, collapsed.state, dt));

    const split = boot();
    const splitSteps = [];
    for (const [code, pressed] of events) {
      key(split.owner, code, pressed);
      splitSteps.push(step(split.owner, split.state, dt));
    }
    const collapsedCount = {
      beacon: countTrue(collapsedSteps, 'beacon'),
      detonate: countTrue(collapsedSteps, 'detonate'),
    };
    const splitCount = {
      beacon: countTrue(splitSteps, 'beacon'),
      detonate: countTrue(splitSteps, 'detonate'),
    };
    assert.deepEqual(collapsedCount, splitCount);
    totals.push(collapsedCount);
    collapsed.owner.destroy();
    split.owner.destroy();
  }
  assert.deepEqual(totals[0], totals[1]);
  assert.deepEqual(totals[1], totals[2]);
  assert.equal(totals[0].beacon, 2);
  assert.equal(totals[0].detonate, 2);
});

test('a second catch-up step does not repeat one press, and a second press is not lost', () => {
  const once = boot();
  key(once.owner, 'KeyU', true);
  const onceSteps = [];
  for (let i = 0; i < 4; i += 1) onceSteps.push(step(once.owner, once.state));
  assert.equal(countTrue(onceSteps, 'beacon'), 1);
  assert.equal(onceSteps[0].beacon, true);
  assert.equal(onceSteps[1].beacon, false, 'catch-up must not fire the same press again');

  const twice = boot();
  key(twice.owner, 'KeyU', true);
  key(twice.owner, 'KeyU', false);
  key(twice.owner, 'KeyU', true);
  const first = step(twice.owner, twice.state);
  const second = step(twice.owner, twice.state);
  const third = step(twice.owner, twice.state);
  assert.equal(first.beacon, true);
  assert.equal(second.beacon, true, 'the press sampled behind the first one still fires');
  assert.equal(third.beacon, false);
  assert.equal(first.beacon === true && second.beacon === true, true);
  once.owner.destroy();
  twice.owner.destroy();
});

test('a tap sampled before the next update is one edge, repeats add none, and movement stays held', () => {
  const host = boot();
  key(host.owner, 'KeyW', true);
  key(host.owner, 'KeyU', true);
  key(host.owner, 'KeyU', false);
  for (let i = 0; i < 6; i += 1) key(host.owner, 'KeyU', true, { repeat: true });
  const tapped = step(host.owner, host.state);
  const quiet = step(host.owner, host.state);
  assert.equal(tapped.beacon, true);
  assert.equal(quiet.beacon, false, 'the release sampled in the same gap must not stick');
  assert.ok(tapped.moveZ > 0.5);
  assert.ok(quiet.moveZ > 0.5, 'held movement lasts through the deploy edge');
  key(host.owner, 'KeyW', false);
  const released = step(host.owner, host.state);
  assert.equal(released.moveZ, 0);
  assert.equal(released.beacon, false);
  key(host.owner, 'KeyW', true);
  assert.equal(host.owner._kbmActivityPending, true);
  const moved = step(host.owner, host.state);
  assert.ok(moved.moveZ > 0.5);
  assert.equal(host.owner._kbmActivityPending, false);
  assert.ok(host.owner._lastKbmTick >= host.state.tick - 1);
  key(host.owner, 'KeyW', true, { repeat: true });
  assert.equal(host.owner._kbmActivityPending, true, 'a held movement key keeps the keyboard live');
  assert.equal(step(host.owner, host.state).beacon, false);
  host.owner.destroy();
});

test('a key that went down under a screen does not drop a bomb after the screen is gone', () => {
  const host = boot();
  assert.equal(key(host.owner, 'Digit9', true, { blocked: true }), false);
  assert.equal(key(host.owner, 'Digit9', false), false);
  for (let i = 0; i < 3; i += 1) {
    assert.equal(step(host.owner, host.state).bomb, false);
  }
  key(host.owner, 'Digit9', true);
  const live = step(host.owner, host.state);
  const held = step(host.owner, host.state);
  assert.equal(live.bomb, true, 'a press that starts after the screen is gone still deploys');
  assert.equal(held.bomb, false);
  key(host.owner, 'Digit9', false);
  assert.equal(step(host.owner, host.state).bomb, false);

  const prior = boot();
  key(prior.owner, 'Digit9', true);
  assert.equal(step(prior.owner, prior.state).bomb, true);
  assert.equal(step(prior.owner, prior.state).bomb, false);
  key(prior.owner, 'Digit9', false, { blocked: true });
  const ended = step(prior.owner, prior.state);
  assert.equal(ended.bomb, false, 'a hold that started in flight ends on its keyup');
  assert.equal(step(prior.owner, prior.state).bomb, false);
  host.owner.destroy();
  prior.owner.destroy();
});

test('a tap sampled as a screen opens does not fire on the way out', () => {
  const host = boot();
  key(host.owner, 'Digit9', true);
  key(host.owner, 'Digit9', false);
  key(host.owner, 'KeyU', true);
  host.state.ui.screenStack = ['pause'];
  assert.equal(step(host.owner, host.state).bomb, false);
  assert.equal(step(host.owner, host.state).beacon, false);
  host.state.ui.screenStack = [];
  const back = step(host.owner, host.state);
  assert.equal(back.bomb, false, 'the bomb tap must not drop as the screen closes');
  assert.equal(back.beacon, false, 'a beacon key still held through the screen is not a new press');
  key(host.owner, 'KeyU', false);
  key(host.owner, 'Digit9', true);
  assert.equal(step(host.owner, host.state).bomb, true);
  host.owner.destroy();
});

test('releasing a tether alias does not drop a different key that is still held', () => {
  const tick = MASSLINE_HOLD_S / 4;
  assert.ok(tick > 0 && tick < MASSLINE_HOLD_S);
  const host = boot();
  host.player.tether.active = true;
  key(host.owner, 'Space', true);
  const started = step(host.owner, host.state, tick);
  assert.equal(started.cut, false);
  key(host.owner, 'KeyF', true);
  key(host.owner, 'KeyF', false);
  const alias = step(host.owner, host.state, tick);
  assert.equal(alias.cut, false, 'tapping F while Space is held must not cut');
  assert.equal(alias.latch, false);
  key(host.owner, 'Space', false);
  const letGo = step(host.owner, host.state, tick);
  assert.equal(letGo.cut, true, 'letting go of the key that is actually held still cuts');
  assert.equal(letGo.latch, false);
  host.owner.destroy();
});

test('focus loss cancels an unreleased hold and keeps a tap that already finished', () => {
  const held = boot();
  key(held.owner, 'KeyU', true);
  key(held.owner, 'Space', true);
  held.owner.releaseHeldControls('window-blur');
  const afterBlur = step(held.owner, held.state);
  assert.equal(afterBlur.beacon, false);
  assert.equal(afterBlur.latch, false);
  assert.equal(step(held.owner, held.state).beacon, false);

  const tapped = boot();
  key(tapped.owner, 'KeyU', true);
  key(tapped.owner, 'KeyU', false);
  key(tapped.owner, 'Space', true);
  key(tapped.owner, 'Space', false);
  tapped.owner.releaseHeldControls('window-blur');
  const first = step(tapped.owner, tapped.state);
  const second = step(tapped.owner, tapped.state);
  assert.equal(first.beacon, true, 'a finished beacon tap still arrives after focus loss');
  assert.equal(first.latch, true, 'a finished tether tap still arrives after focus loss');
  assert.equal(second.beacon, false);
  assert.equal(second.latch, false);
  held.owner.destroy();
  tapped.owner.destroy();
});

test('a direct key-map harness still gets one rising edge', () => {
  const host = boot();
  host.owner._keys.KeyU = true;
  assert.equal(step(host.owner, host.state).beacon, true);
  assert.equal(step(host.owner, host.state).beacon, false);
  host.owner._keys.KeyU = false;
  assert.equal(step(host.owner, host.state).beacon, false);
  host.owner.destroy();
});

test('tether release is consumed before the next latch and never shares its command', () => {
  const tick = MASSLINE_HOLD_S / 4;
  assert.ok(tick > 0 && tick < MASSLINE_HOLD_S);
  const host = boot();
  host.player.tether.active = true;
  key(host.owner, 'Space', true);
  const held = step(host.owner, host.state, tick);
  assert.equal(held.cut, false);
  assert.equal(held.latch, false);
  key(host.owner, 'Space', false);
  key(host.owner, 'Space', true);
  const released = step(host.owner, host.state, tick);
  assert.equal(released.cut, true);
  assert.equal(released.latch, false);
  host.player.tether.active = false;
  const again = step(host.owner, host.state, tick);
  assert.equal(again.latch, true);
  assert.equal(again.cut, false);
  const quiet = step(host.owner, host.state, tick);
  assert.equal(quiet.latch, false);
  assert.equal(quiet.cut, false);
  host.owner.destroy();
});

test('reversed wall-clock stamps do not reorder sampled verbs', () => {
  function play(stamps) {
    const host = boot();
    const pairs = [
      ['KeyU', true],
      ['KeyU', false],
      ['KeyR', true],
      ['KeyR', false],
      ['KeyU', true],
      ['Digit9', true],
    ];
    pairs.forEach(([code, pressed], index) => {
      key(host.owner, code, pressed, { timeStamp: stamps[index] });
    });
    const seen = [];
    for (let i = 0; i < pairs.length; i += 1) {
      const sample = step(host.owner, host.state);
      seen.push({ beacon: sample.beacon, detonate: sample.detonate, bomb: sample.bomb });
    }
    host.owner.destroy();
    return seen;
  }
  const forward = play([10, 20, 30, 40, 50, 60]);
  const reversed = play([900, 10, 5, 800, 1, 400]);
  assert.deepEqual(reversed, forward);
  assert.equal(forward.filter((sample) => sample.beacon).length, 2);
  assert.equal(forward.filter((sample) => sample.detonate).length, 1);
  assert.equal(forward.filter((sample) => sample.bomb).length, 1);
  const bombSteps = forward.map((sample) => sample.bomb);
  assert.deepEqual(bombSteps, reversed.map((sample) => sample.bomb));
  assert.equal(bombSteps.filter(Boolean).length, 1);
});

function installDom() {
  const originals = new Map();
  const buckets = { document: [], window: [] };
  function makeTarget(which) {
    return {
      addEventListener(type, fn, options) {
        buckets[which].push({
          type,
          fn,
          capture: options === true || !!(options && options.capture),
        });
      },
      removeEventListener(type, fn) {
        buckets[which] = buckets[which].filter((row) => row.fn !== fn || row.type !== type);
      },
    };
  }
  const doc = makeTarget('document');
  const win = makeTarget('window');
  const classes = new Set();
  doc.body = {
    classList: {
      contains: (name) => classes.has(name),
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      toggle: (name, on) => { if (on) classes.add(name); else classes.delete(name); },
    },
  };
  doc.documentElement = { classList: { add() {}, remove() {} } };
  doc.activeElement = doc.body;
  doc.getElementById = () => null;
  const replacements = {
    window: win,
    document: doc,
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener: win.addEventListener.bind(win),
    removeEventListener: win.removeEventListener.bind(win),
  };
  for (const [name, value] of Object.entries(replacements)) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  function bubble(type, ev) {
    const run = (which, capture) => {
      for (const row of buckets[which]) {
        if (row.type !== type || row.capture !== capture) continue;
        row.fn(ev);
        if (ev.immediate) return true;
      }
      return false;
    };
    if (run('window', true) || ev.stopped) return;
    if (run('document', true) || ev.stopped) return;
    if (run('document', false) || ev.stopped) return;
    run('window', false);
  }
  return {
    classes,
    bubble,
    restore() {
      for (const [name, desc] of originals) {
        if (desc) Object.defineProperty(globalThis, name, desc);
        else delete globalThis[name];
      }
    },
  };
}

test('closing a screen with a remapped bomb key does not drop the bomb', () => {
  const dom = installDom();
  const { state, owner } = boot();
  state.settings.controls.bindings.dropBomb = ['Escape'];
  const stack = ['pause'];
  dom.classes.add('ui-modal-open');
  const screenManager = {
    isOpen: () => stack.length > 0,
    pushScreen: (id) => { stack.push(id); dom.classes.add('ui-modal-open'); },
    popScreen: () => {
      stack.pop();
      if (stack.length === 0) dom.classes.delete('ui-modal-open');
    },
    top: () => stack.at(-1) || null,
    getActiveScreenDef: () => (stack.length ? { id: stack.at(-1) } : null),
    locked: () => false,
  };
  const ui = createUiInput({
    state,
    bus: createBus(),
    gamepad: { isConnected: () => false, actions: {}, axes: { leftX: 0, leftY: 0, rightX: 0, rightY: 0 } },
  }, screenManager);
  try {
    const escape = {
      key: 'Escape', code: 'Escape', target: null, shiftKey: false, repeat: false,
      preventDefault() {},
      stopPropagation() { this.stopped = true; },
      stopImmediatePropagation() { this.immediate = true; this.stopped = true; },
    };
    dom.bubble('keydown', escape);
    assert.equal(stack.length, 0);
    assert.equal(escape.stopped, true);
    const closed = step(owner, state);
    assert.equal(closed.bomb, false);
    const release = {
      key: 'Escape', code: 'Escape', target: null, shiftKey: false, repeat: false,
      preventDefault() {},
      stopPropagation() { this.stopped = true; },
      stopImmediatePropagation() { this.immediate = true; this.stopped = true; },
    };
    dom.bubble('keyup', release);
    assert.equal(step(owner, state).bomb, false);
    key(owner, 'Digit9', true);
    assert.equal(step(owner, state).bomb, false, 'Escape is the live bomb binding, not Digit9');
    key(owner, 'Escape', true);
    assert.equal(step(owner, state).bomb, true, 'the bomb key still works once the screen is gone');
    assert.equal(step(owner, state).bomb, false);
  } finally {
    ui.dispose();
    owner.destroy();
    dom.restore();
  }
});
