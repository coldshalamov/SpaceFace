// A controller can change Settings sliders and dropdowns (src/ui/input.js moveFocus).
//
// Before this, Settings' native <input type=range> (Audio buses, Text scale, Stick deadzone, the
// sensitivities) and native <select> (Language, Autosave, Flight scheme, ...) were reachable on a
// pad but unchangeable: D-pad Left/Right was spatial focus only, so the highlight hopped to another
// row. Now Left/Right on a focused slider/dropdown steps its value and fires `input` + `change`
// the way an arrow key does (the screen's own handlers preview then persist unchanged); Up/Down
// still walk away; the keyboard path never touches this code.
//
// Node only, DOM stubs. The pane is built by the real paneBuilder and the persistence by the real
// settingsScreen._set; the presses travel the shipped route: createGamepad -> createUiInput.tick
// -> handleGamepadUi -> moveFocus.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { fakeDom } from './helpers/fake-dom.mjs';

// ---- DOM stub ------------------------------------------------------------------------------------
const doc = fakeDom();
const docListeners = {};
doc.addEventListener = (type, fn) => { (docListeners[type] = docListeners[type] || []).push(fn); };
doc.removeEventListener = () => {};
doc.activeElement = null;
doc.documentElement = {
  dataset: {},
  lang: '',
  setAttribute() {},
  getAttribute: () => null,
  classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
};
doc.body = doc._make('body');
doc.querySelector = () => null;
doc.querySelectorAll = () => [];

const screenRoot = doc._make('div');
screenRoot.style.display = 'flex';
screenRoot.dataset.screen = 'settings';
const screensRoot = doc._make('div');
screensRoot.querySelectorAll = () => [screenRoot];
screensRoot.querySelector = () => null;
doc.getElementById = (id) => (id === 'screens' ? screensRoot : null);
screenRoot.parentNode = screensRoot;

const pane = doc._make('div');
pane.parentNode = screenRoot;
screenRoot.children.push(pane);

globalThis.document = doc;
globalThis.window = { addEventListener() {}, removeEventListener() {}, SF: null };
globalThis.KeyboardEvent = class KeyboardEvent { constructor() {} };

const CONTROL_TAGS = new Set(['input', 'select', 'button']);
function walk(node, out = []) {
  for (const child of node.children || []) {
    if (CONTROL_TAGS.has(child.tagName)) out.push(child);
    walk(child, out);
  }
  return out;
}
function inTree(root, target) {
  if (root === target) return true;
  return (root.children || []).some((child) => inTree(child, target));
}
screenRoot.querySelectorAll = () => walk(screenRoot);
screenRoot.contains = (node) => inTree(screenRoot, node);

/** Give every control real-DOM-ish behavior: focus, dispatchEvent, a row rect. */
function dress(control, rect) {
  control.focus = () => { doc.activeElement = control; };
  control.dispatchEvent = (ev) => { for (const fn of control.listeners[ev.type] || []) fn(ev); return true; };
  control.getBoundingClientRect = () => rect;
  control.closest = () => control;
  return control;
}

/** value is always a string, like the DOM's. */
function stringValue(control) {
  let raw = String(control.value ?? '');
  Object.defineProperty(control, 'value', { get: () => raw, set: (v) => { raw = String(v); }, configurable: true });
}

/** Real <select> semantics over fake-dom options. */
function selectSemantics(sel) {
  Object.defineProperty(sel, 'options', { get: () => sel.children, configurable: true });
  Object.defineProperty(sel, 'selectedIndex', {
    get: () => {
      const at = sel.children.findIndex((o) => o.selected);
      return at < 0 ? 0 : at;
    },
    set: (i) => { sel.children.forEach((o, k) => { o.selected = k === i; }); },
    configurable: true,
  });
  Object.defineProperty(sel, 'value', {
    get: () => (sel.children[sel.selectedIndex] || {}).value ?? '',
    set: (v) => { sel.selectedIndex = sel.children.findIndex((o) => o.value === v); },
    configurable: true,
  });
}

/** Stack every control in the pane in its own row (the Settings layout: one control per row). */
function layOut(controls) {
  controls.forEach((control, i) => {
    dress(control, { left: 0, top: i * 40, width: 240, height: 30, right: 240, bottom: i * 40 + 30 });
    if (control.tagName === 'select') selectSemantics(control);
    else if (control.tagName === 'input') stringValue(control);
  });
}

function clearPane() { pane.children.length = 0; }

// ---- shipped modules (after the globals exist) ---------------------------------------------------
function installPad(pressedIdx) {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: i === pressedIdx, value: i === pressedIdx ? 1 : 0, touched: i === pressedIdx }));
  const pad = { id: 'SpaceFace Synthetic Pad', index: 0, connected: true, mapping: 'standard', timestamp: 1, axes: [0, 0, 0, 0], buttons };
  const getGamepads = () => [pad];
  if (!globalThis.navigator) Object.defineProperty(globalThis, 'navigator', { value: { getGamepads }, configurable: true });
  else Object.defineProperty(globalThis.navigator, 'getGamepads', { value: getGamepads, configurable: true });
}
const DPAD = { up: 12, down: 13, left: 14, right: 15 };

const { createGamepad } = await import('../src/systems/gamepad.js');
const { createBus } = await import('../src/core/eventBus.js');
const { createUiInput, stepPadValueControl, padValueControlKind } = await import('../src/ui/input.js');
const { paneBuilder } = await import('../src/ui/views/settingsControls.js');
const { settingsScreen } = await import('../src/ui/screens/settings.js');

function makeRig() {
  installPad(-1);
  const bus = createBus();
  const settingsEvents = [];
  bus.on('settings:changed', (payload) => settingsEvents.push(payload));
  const state = {
    mode: 'flight', timeScale: 0, tick: 1, ui: {},
    settings: { controls: { gamepad: { enabled: true } }, audio: { master: 1, music: 0.7 }, gameplay: { autosaveIntervalS: 0 } },
    entities: new Map(), player: {},
  };
  const gp = createGamepad({ bus, state });
  const screenManager = {
    isOpen: () => true,
    top: () => 'settings',
    getActiveScreenDef: () => ({ id: 'settings', data: { locked: false } }),
    locked: () => false,
    popScreen() {},
    pushScreen() {},
  };
  const input = createUiInput({ bus, state, gamepad: gp, registry: null }, screenManager);
  const ctx = { state, bus };
  // One press = pad down for a tick, up for a tick (edge-triggered, like a thumb).
  const press = (dir) => {
    installPad(DPAD[dir]);
    input.tick(0.016);
    installPad(-1);
    input.tick(0.016);
  };
  // Hold a direction: the first tick is the press, then dt advances through the repeat delay.
  const hold = (dir, dts) => {
    installPad(DPAD[dir]);
    for (const dt of dts) input.tick(dt);
    installPad(-1);
    input.tick(0.016);
  };
  return { bus, state, ctx, input, press, hold, settingsEvents };
}

function buildAudioPane(rig) {
  clearPane();
  const build = paneBuilder(pane);
  const pct = (v) => Math.round(v * 100) + '%';
  const a = rig.state.settings.audio;
  build.slider('Master', () => a.master, 0, 1, 0.01, pct, (v, persist) => settingsScreen._set(rig.ctx, 'audio', 'master', v, persist));
  build.slider('Music', () => a.music, 0, 1, 0.01, pct, (v, persist) => settingsScreen._set(rig.ctx, 'audio', 'music', v, persist));
  const controls = walk(pane);
  layOut(controls);
  return { master: controls[0], music: controls[1], controls };
}

// ---- tests ---------------------------------------------------------------------------------------

test('five pad Rights on the Music slider raise it five steps and persist like a mouse drag', () => {
  const rig = makeRig();
  const { music } = buildAudioPane(rig);
  music.focus();
  for (let i = 0; i < 5; i++) rig.press('right');
  assert.equal(Number(music.value), 0.75, 'exactly 0.70 + 5 x 0.01, no float drift');
  assert.equal(music.value, '0.75');
  assert.equal(rig.state.settings.audio.music, 0.75, 'the settings handler saw the new value');
  assert.equal(doc.activeElement, music, 'focus stays on the slider; it is not hopping to another row');
  // Each step is the browser's arrow-key pair: a preview (input) then a commit (change).
  assert.equal(rig.settingsEvents.length, 10);
  rig.settingsEvents.forEach((ev, i) => {
    assert.deepEqual([ev.section, ev.key], ['audio', 'music']);
    if (i % 2 === 0) assert.equal(ev.persist, false, 'input previews without persisting');
    else assert.equal(ev.persist, undefined, 'change persists');
  });
  assert.equal(rig.settingsEvents.at(-1).value, 0.75);
  // The control's own readouts follow, because the real handlers ran.
  assert.equal(music.getAttribute('aria-valuenow'), '0.75');
  assert.equal(music.getAttribute('aria-valuetext'), '75%');
  rig.input.dispose();
});

test('pad Left steps back and clamps at min without another event', () => {
  const rig = makeRig();
  rig.state.settings.audio.music = 0.03;
  const { music } = buildAudioPane(rig);
  music.focus();
  for (let i = 0; i < 3; i++) rig.press('left');
  assert.equal(Number(music.value), 0);
  assert.equal(rig.state.settings.audio.music, 0);
  const before = rig.settingsEvents.length;
  for (let i = 0; i < 4; i++) rig.press('left');
  assert.equal(Number(music.value), 0, 'min is a hard floor');
  assert.equal(rig.settingsEvents.length, before, 'a press against the floor persists nothing');
  assert.equal(doc.activeElement, music, 'the spent press does not fling the highlight away');
  // And the ceiling.
  music.value = '0.99';
  rig.press('right');
  rig.press('right');
  rig.press('right');
  assert.equal(Number(music.value), 1);
  rig.input.dispose();
});

test('holding the D-pad scrubs a slider through the existing nav repeat', () => {
  const rig = makeRig();
  const { music } = buildAudioPane(rig);
  music.focus();
  // press (0.016) -> wait out the 0.36 s initial delay -> then one step per 0.12 s repeat.
  rig.hold('right', [0.016, 0.4, 0.12, 0.12, 0.12]);
  assert.ok(Number(music.value) >= 0.7 + 4 * 0.01 - 1e-9, `scrubbed at least four steps, got ${music.value}`);
  assert.equal(doc.activeElement, music);
  rig.input.dispose();
});

test('Up and Down still walk focus between slider rows and leave values alone', () => {
  const rig = makeRig();
  const { master, music } = buildAudioPane(rig);
  music.focus();
  rig.press('up');
  assert.equal(doc.activeElement, master, 'Up moves to the row above');
  rig.press('down');
  assert.equal(doc.activeElement, music, 'Down comes back');
  assert.equal(music.value, '0.7');
  assert.equal(master.value, '1');
  assert.equal(rig.settingsEvents.length, 0);
  rig.input.dispose();
});

test('a dropdown steps to the previous/next option, emits change, and clamps at its ends', () => {
  const rig = makeRig();
  clearPane();
  const build = paneBuilder(pane);
  const picked = [];
  build.select('Autosave', () => String(rig.state.settings.gameplay.autosaveIntervalS),
    [['0', 'Off'], ['60', '60s'], ['120', '120s'], ['300', '300s']],
    (v) => { picked.push(v); rig.state.settings.gameplay.autosaveIntervalS = parseInt(v, 10); });
  const [sel] = walk(pane);
  layOut([sel]);
  let inputEvents = 0;
  sel.listeners.input = [() => { inputEvents += 1; }];
  sel.focus();
  rig.press('right');
  assert.deepEqual(picked, ['60']);
  rig.press('right');
  rig.press('right');
  assert.deepEqual(picked, ['60', '120', '300']);
  assert.equal(sel.selectedIndex, 3);
  rig.press('right');
  assert.deepEqual(picked, ['60', '120', '300'], 'the last option is a wall, not a wrap');
  rig.press('left');
  assert.deepEqual(picked.at(-1), '120');
  assert.equal(rig.state.settings.gameplay.autosaveIntervalS, 120);
  assert.equal(inputEvents, 4, 'input fires with change, as a native select does');
  assert.equal(doc.activeElement, sel);
  rig.input.dispose();
});

test('a change handler that rebuilds the pane keeps the pad on the same row (Language, hardware preset)', () => {
  const rig = makeRig();
  clearPane();
  let language = 'en-US';
  const options = [['en-US', 'English'], ['fr-FR', 'Francais'], ['de-DE', 'Deutsch']];
  const render = () => {
    clearPane();
    const build = paneBuilder(pane);
    build.slider('Master', () => 1, 0, 1, 0.01, (v) => String(v), () => {});
    build.select('Language', () => language, options, (v) => { language = v; render(); });
    build.slider('Music', () => 0.7, 0, 1, 0.01, (v) => String(v), () => {});
    layOut(walk(pane));
  };
  render();
  const first = walk(pane)[1];
  first.focus();
  rig.press('right');
  assert.equal(language, 'fr-FR');
  const rebuilt = walk(pane)[1];
  assert.notEqual(rebuilt, first, 'the row really was rebuilt');
  assert.equal(doc.activeElement, rebuilt, 'focus follows to the same row instead of being lost');
  rig.press('right');
  assert.equal(language, 'de-DE', 'the next press keeps stepping Language, not jumping to the first control');
  rig.input.dispose();
});

test('at a limit, only a control in the same row may take the press (compound rows stay reachable)', () => {
  const rig = makeRig();
  clearPane();
  const build = paneBuilder(pane);
  build.select('Spare', () => 'b', [['a', 'A'], ['b', 'B']], () => {});
  const sel = walk(pane)[0];
  const apply = dress(doc._make('button'), { left: 300, top: 0, width: 60, height: 30, right: 360, bottom: 30 });
  apply.parentNode = pane;
  pane.children.push(apply);
  const below = dress(doc._make('button'), { left: 300, top: 80, width: 60, height: 30, right: 360, bottom: 110 });
  below.parentNode = pane;
  pane.children.push(below);
  dress(sel, { left: 0, top: 0, width: 240, height: 30, right: 240, bottom: 30 });
  selectSemantics(sel);
  sel.focus();
  rig.press('right'); // 'b' is the last option; Apply shares its row
  assert.equal(doc.activeElement, apply, 'the compound row neighbor takes the press');
  sel.focus();
  rig.press('left'); // steps to 'a'
  assert.equal(sel.value, 'a');
  assert.equal(doc.activeElement, sel);
  rig.press('left'); // at the floor with nothing to the left in this row: spent, not flung
  assert.equal(doc.activeElement, sel);
  assert.notEqual(doc.activeElement, below);
  rig.input.dispose();
});

test('plain buttons keep spatial Left/Right focus movement', () => {
  const rig = makeRig();
  clearPane();
  const a = dress(doc._make('button'), { left: 0, top: 0, width: 60, height: 30, right: 60, bottom: 30 });
  const b = dress(doc._make('button'), { left: 100, top: 0, width: 60, height: 30, right: 160, bottom: 30 });
  for (const btn of [a, b]) { btn.parentNode = pane; pane.children.push(btn); }
  a.focus();
  rig.press('right');
  assert.equal(doc.activeElement, b);
  rig.press('left');
  assert.equal(doc.activeElement, a);
  rig.input.dispose();
});

test('the stepper: grid snap, float drift, defaults, and what it refuses', () => {
  const range = (props) => {
    const el = dress(doc._make('input'), { left: 0, top: 0, width: 1, height: 1, right: 1, bottom: 1 });
    Object.assign(el, { type: 'range' }, props);
    stringValue(el);
    return el;
  };
  const events = [];
  const watch = (el) => { for (const t of ['input', 'change']) (el.listeners[t] = el.listeners[t] || []).push(() => events.push(t)); return el; };

  const drift = watch(range({ min: '0', max: '1', step: '0.01', value: '0.7' }));
  for (let i = 0; i < 5; i++) assert.equal(stepPadValueControl(drift, 'right'), true);
  assert.equal(drift.value, '0.75');

  const sens = watch(range({ min: '0.25', max: '3', step: '0.05', value: '1' }));
  stepPadValueControl(sens, 'right');
  assert.equal(sens.value, '1.05', 'the grid is anchored at min');
  stepPadValueControl(sens, 'left');
  stepPadValueControl(sens, 'left');
  assert.equal(sens.value, '0.95');

  const bare = watch(range({ value: '50' }));
  stepPadValueControl(bare, 'right');
  assert.equal(bare.value, '51', 'no attributes: min 0, max 100, step 1');

  const any = watch(range({ min: '0', max: '10', step: 'any', value: '5' }));
  stepPadValueControl(any, 'right');
  assert.equal(any.value, '5.1', 'step="any" falls back to a hundredth of the span');

  events.length = 0;
  const top = watch(range({ min: '0', max: '1', step: '0.1', value: '1' }));
  assert.equal(stepPadValueControl(top, 'right'), false);
  assert.equal(top.value, '1');
  assert.deepEqual(events, [], 'a press at the limit dispatches nothing');

  // The browser may snap a write back onto its own grid; that is not a change.
  const snapping = watch(range({ min: '0', max: '1', step: '0.3', value: '0.9' }));
  Object.defineProperty(snapping, 'value', { get: () => '0.9', set() {}, configurable: true });
  assert.equal(stepPadValueControl(snapping, 'right'), false);
  assert.deepEqual(events, []);

  assert.equal(stepPadValueControl(drift, 'up'), false, 'only Left/Right step a value');
  assert.equal(stepPadValueControl(drift, 'down'), false);

  const button = dress(doc._make('button'), { left: 0, top: 0, width: 1, height: 1, right: 1, bottom: 1 });
  const text = Object.assign(dress(doc._make('input'), { left: 0, top: 0, width: 1, height: 1, right: 1, bottom: 1 }), { type: 'text', value: 'x' });
  assert.equal(padValueControlKind(button), null);
  assert.equal(padValueControlKind(text), null, 'a text field is not a slider');
  assert.equal(stepPadValueControl(text, 'right'), false);
  assert.equal(padValueControlKind(null), null);
  const disabled = range({ value: '5' });
  disabled.disabled = true;
  assert.equal(padValueControlKind(disabled), null, 'a disabled slider is not steppable');

  // Dropdown: skips disabled/hidden options, refuses a one-option list.
  const sel = watch(dress(doc._make('select'), { left: 0, top: 0, width: 1, height: 1, right: 1, bottom: 1 }));
  for (const [value, extra] of [['a', {}], ['b', { disabled: true }], ['c', { hidden: true }], ['d', {}]]) {
    sel.appendChild(Object.assign(doc._make('option'), { value }, extra));
  }
  selectSemantics(sel);
  events.length = 0;
  assert.equal(stepPadValueControl(sel, 'right'), true);
  assert.equal(sel.value, 'd', 'steps over the disabled and hidden options');
  assert.equal(stepPadValueControl(sel, 'right'), false);
  assert.equal(stepPadValueControl(sel, 'left'), true);
  assert.equal(sel.value, 'a');
  assert.deepEqual(events, ['input', 'change', 'input', 'change']);
  const lone = dress(doc._make('select'), { left: 0, top: 0, width: 1, height: 1, right: 1, bottom: 1 });
  lone.appendChild(Object.assign(doc._make('option'), { value: 'only' }));
  selectSemantics(lone);
  assert.equal(stepPadValueControl(lone, 'right'), false);
});

test('keyboard arrows on a focused slider never reach the pad stepper', () => {
  const rig = makeRig();
  const { music } = buildAudioPane(rig);
  music.focus();
  let prevented = false;
  const keydown = {
    key: 'ArrowRight', code: 'ArrowRight', target: music,
    preventDefault() { prevented = true; }, stopPropagation() {},
  };
  assert.ok((docListeners.keydown || []).length > 0, 'the UI keydown handler is installed');
  for (const fn of docListeners.keydown) fn(keydown);
  assert.equal(music.value, '0.7', 'the UI layer leaves the native control to the browser');
  assert.equal(prevented, false, 'the browser still gets the arrow key');
  assert.equal(rig.settingsEvents.length, 0);
  rig.input.dispose();

  const src = readFileSync(fileURLToPath(new URL('../src/ui/input.js', import.meta.url)), 'utf8');
  const callSites = [...src.matchAll(/stepPadValueControl\(/g)].length;
  assert.equal(callSites, 2, 'one definition and one call (moveFocus); nothing on the keyboard path');
  const handler = src.slice(src.indexOf('function handleGamepadUi'), src.indexOf('function getRawPad'));
  const keyHandler = src.slice(src.indexOf('function onKeyDown'), src.indexOf('function onBlackoutKeyDown') > 0 ? src.indexOf('function onBlackoutKeyDown') : undefined);
  assert.ok(handler.includes('moveFocus('), 'moveFocus is the pad route');
  assert.equal(keyHandler.includes('moveFocus('), false, 'onKeyDown never calls moveFocus');
  assert.equal(keyHandler.includes('stepPadValueControl('), false);
});
