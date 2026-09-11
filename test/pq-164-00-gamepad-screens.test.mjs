// PQ-164.00b — pad verbs on the live UI route, Node only. No Chromium.
// Drives createGamepad + createUiInput (the shipped pad path every modal uses).
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function stubEl(extra = {}) {
  const el = {
    children: [],
    style: { display: extra.display || '' },
    dataset: extra.dataset || {},
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    className: extra.className || '',
    disabled: false,
    hidden: false,
    appendChild() {},
    setAttribute() {},
    getAttribute: (n) => (n === 'tabindex' ? extra.tabindex ?? null : extra[n] ?? null),
    hasAttribute: () => false,
    removeAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => extra.querySelectorResult || null,
    querySelectorAll: () => extra.querySelectorAllResult || [],
    getBoundingClientRect: () => extra.rect || { left: 0, top: 0, width: 40, height: 20, right: 40, bottom: 20 },
    focus() {},
    click() { el._clicks = (el._clicks || 0) + 1; },
    contains(node) { return node === el || (extra.kids || []).includes(node); },
    closest: () => null,
    parentNode: extra.parentNode || null,
  };
  return el;
}

const btnA = stubEl({ rect: { left: 10, top: 10, width: 40, height: 20, right: 50, bottom: 30 } });
const btnB = stubEl({ rect: { left: 80, top: 10, width: 40, height: 20, right: 120, bottom: 30 } });
const screenRoot = stubEl({
  display: 'flex',
  className: 'screen',
  dataset: { screen: 'pause' },
  querySelectorAllResult: [btnA, btnB],
});
screenRoot.contains = (node) => node === screenRoot || node === btnA || node === btnB;
btnA.parentNode = screenRoot;
btnB.parentNode = screenRoot;
const screensRoot = stubEl({ querySelectorAllResult: [screenRoot] });

const docEl = stubEl();
globalThis.document = {
  getElementById: (id) => (id === 'screens' ? screensRoot : stubEl()),
  querySelector: () => null,
  querySelectorAll: () => [],
  head: stubEl(),
  body: stubEl(),
  documentElement: docEl,
  createElement: () => stubEl(),
  activeElement: btnA,
  addEventListener() {},
  removeEventListener() {},
};
globalThis.window = { addEventListener() {}, removeEventListener() {}, SF: null };
globalThis.KeyboardEvent = class KeyboardEvent { constructor() {} };

function makePad(pressedIdx = -1) {
  const buttons = Array.from({ length: 17 }, (_, i) => ({
    pressed: i === pressedIdx,
    value: i === pressedIdx ? 1 : 0,
    touched: i === pressedIdx,
  }));
  return {
    id: 'SpaceFace Synthetic Pad',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: 1,
    axes: [0, 0, 0, 0],
    buttons,
  };
}

function installPad(pressedIdx) {
  const pad = makePad(pressedIdx);
  const getGamepads = () => [pad];
  if (!globalThis.navigator) {
    Object.defineProperty(globalThis, 'navigator', {
      value: { getGamepads },
      configurable: true,
    });
  } else {
    Object.defineProperty(globalThis.navigator, 'getGamepads', {
      value: getGamepads,
      configurable: true,
    });
  }
}

const { createGamepad } = await import('../src/systems/gamepad.js');
const { createBus } = await import('../src/core/eventBus.js');
const { createUiInput } = await import('../src/ui/input.js');

const UI_ROOT_SRC = readFileSync(fileURLToPath(new URL('../src/ui/uiRoot.js', import.meta.url)), 'utf8');
const SCREEN_IDS = [...UI_ROOT_SRC.matchAll(/name: '(\w+)Screen'/g)]
  .map((m) => (m[1] === 'asteroid' ? 'drill' : m[1]))
  .filter((id, i, all) => all.indexOf(id) === i);

function tickGamepad(pressedIdx) {
  installPad(pressedIdx);
  const gp = createGamepad({
    bus: createBus(),
    state: { tick: 1, settings: { controls: { gamepad: { enabled: true } } } },
  });
  gp.tick(0.016, { tick: 1, settings: { controls: { gamepad: { enabled: true } } } });
  return gp;
}

test('PQ-164.00 seed 16400: shipped gamepad maps A to accept and B to cancel', () => {
  const accept = tickGamepad(0);
  assert.equal(accept.connected, true);
  assert.equal(accept.getAction('accept').pressed, true, 'button 0 is accept (A/Cross)');
  assert.equal(accept.getAction('cancel').pressed, false);
  const cancel = tickGamepad(1);
  assert.equal(cancel.getAction('cancel').pressed, true, 'button 1 is cancel (B/Circle)');
  assert.equal(cancel.getAction('accept').pressed, false);
});

test('PQ-164.00: the live screen catalog is real and pad UI is one shared modal route', () => {
  assert.ok(SCREEN_IDS.length >= 20, `SCREEN_MODULES too small (${SCREEN_IDS.length}): ${SCREEN_IDS.join(',')}`);
  const src = readFileSync(fileURLToPath(new URL('../src/ui/input.js', import.meta.url)), 'utf8');
  const handler = src.slice(src.indexOf('function handleGamepadUi'), src.indexOf('function getRawPad'));
  assert.match(handler, /if \(modalOpen\)/);
  assert.match(handler, /gp\.actions\.accept/);
  assert.match(handler, /gp\.actions\.cancel/);
  assert.match(handler, /rawPad\.buttons\[12\]/);
  assert.match(handler, /rawPad\.buttons\[13\]/);
  assert.match(handler, /rawPad\.buttons\[14\]/);
  assert.match(handler, /rawPad\.buttons\[15\]/);
});

function drivePad(id, locked, pressedIdx) {
  installPad(-1);
  const bus = createBus();
  const seen = { confirm: 0, cancel: 0, navigate: 0 };
  bus.on('ui:confirm', () => { seen.confirm += 1; });
  bus.on('ui:cancel', () => { seen.cancel += 1; });
  bus.on('ui:navigate', () => { seen.navigate += 1; });
  const pops = [];
  const state = {
    mode: 'flight',
    timeScale: 0,
    tick: 1,
    ui: {},
    settings: { controls: { gamepad: { enabled: true } } },
    entities: new Map(),
    player: {},
  };
  const gp = createGamepad({ bus, state });
  const screenManager = {
    isOpen: () => true,
    top: () => id,
    getActiveScreenDef: () => ({ id, data: { locked } }),
    locked: () => locked,
    popScreen() { pops.push(id); },
    pushScreen() {},
  };
  screenRoot.dataset.screen = id;
  const input = createUiInput({ bus, state, gamepad: gp, registry: null }, screenManager);
  installPad(pressedIdx);
  // One tick only: accept/cancel are edges; a second gp.tick would clear pressed.
  input.tick(0.016);
  input.dispose();
  return { seen, pops };
}

test('PQ-164.00: accept confirms on every registered screen through createUiInput', () => {
  assert.ok(SCREEN_IDS.includes('pause') && SCREEN_IDS.includes('settings'));
  for (const id of SCREEN_IDS) {
    const { seen } = drivePad(id, false, 0);
    assert.ok(seen.confirm >= 1, `${id} A/accept must emit ui:confirm`);
  }
});

test('PQ-164.00: cancel pops a normal screen and traps a locked one', () => {
  const normal = drivePad('pause', false, 1);
  assert.ok(normal.pops.includes('pause') || normal.seen.cancel >= 1, 'pause B pops');
  const locked = drivePad('gameOver', true, 1);
  assert.equal(locked.pops.includes('gameOver'), false, 'locked gameOver traps B');
  const station = drivePad('station', false, 1);
  assert.ok(station.seen.cancel >= 1, 'station B still emits ui:cancel');
});

test('PQ-164.00: dpad on a modal emits ui:navigate via the shared route', () => {
  document.activeElement = btnA;
  const { seen } = drivePad('settings', false, 13);
  assert.ok(seen.navigate >= 1, 'D-pad down must navigate inside a modal');
});
