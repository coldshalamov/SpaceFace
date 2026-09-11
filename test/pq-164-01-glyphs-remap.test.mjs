// PQ-164.01 — glyphs and remap. Device-aware prompt glyphs (chips follow the last-used device)
// and gamepad remapping with conflict detection, persisted through save/profile.
//
// Done-when evidence (headless — PQ-194.01 holds the GPU): a resolved-glyph table on both device
// classes, the pad remap applied by the shipped tick, conflict detection verdicts, and the
// controls.gamepad.bindings map surviving the settings profile and an old save load.
// Fixed seed 16401. Node only.
import assert from 'node:assert/strict';
import test from 'node:test';

const SEED = 16401;
const PROFILE_KEY = 'sf.settings.profile.v1';

// --- DOM/navigator stubs (same posture as test/pq-164-00-gamepad-screens.test.mjs) --------------
function stubEl(extra = {}) {
  return {
    children: [],
    style: { display: extra.display || '' },
    dataset: extra.dataset || {},
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    className: '',
    disabled: false,
    appendChild() {},
    setAttribute() {},
    getAttribute: () => null,
    removeAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 40, height: 20, right: 40, bottom: 20 }),
    focus() {},
    click() {},
    contains: () => false,
    closest: () => null,
    parentNode: null,
  };
}

const screensRoot = stubEl();
globalThis.document = {
  getElementById: () => stubEl(),
  querySelector: () => null,
  querySelectorAll: () => [],
  head: stubEl(),
  body: stubEl(),
  documentElement: stubEl(),
  createElement: () => stubEl(),
  activeElement: null,
  addEventListener() {},
  removeEventListener() {},
};
const windowListeners = {};
globalThis.window = {
  addEventListener(type, fn) { (windowListeners[type] || (windowListeners[type] = [])).push(fn); },
  removeEventListener() {},
  SF: null,
};
globalThis.KeyboardEvent = class KeyboardEvent { constructor() {} };

let installedPad = null;
function makePad() {
  return {
    id: 'SpaceFace Synthetic Pad',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: 1,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
  };
}
Object.defineProperty(globalThis, 'navigator', {
  value: { getGamepads: () => (installedPad ? [installedPad] : []) },
  configurable: true,
});

const localStore = new Map();
globalThis.localStorage = {
  getItem: (k) => (localStore.has(String(k)) ? localStore.get(String(k)) : null),
  setItem: (k, v) => localStore.set(String(k), String(v)),
  removeItem: (k) => localStore.delete(String(k)),
  clear: () => localStore.clear(),
};

const {
  createGamepad,
  resolveGamepadBindings,
  findGamepadBindConflict,
  gamepadShareAllowed,
  GAMEPAD_DEFAULT_BINDINGS,
  GAMEPAD_BUTTON_LABELS,
} = await import('../src/systems/gamepad.js');
const {
  BINDINGS,
  promptLabel,
  setPromptDevice,
  getPromptDevice,
  setGamepadPromptBindings,
  setGamepadCaptureHandler,
  gamepadGlyphForAction,
} = await import('../src/ui/bindings.js');
const { createBus } = await import('../src/core/eventBus.js');
const { createUiInput } = await import('../src/ui/input.js');
const { createGameState } = await import('../src/core/gameState.js');
const { save } = await import('../src/save/saveSystem.js');

function padState(bindings) {
  return {
    tick: 1,
    mode: 'flight',
    playerId: 1,
    player: {},
    input: {},
    settings: { controls: { gamepad: { enabled: true, bindings } }, video: {} },
    entities: new Map([[1, { id: 1, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } }]]),
  };
}

test('PQ-164.01 seed 16401: prompt glyph chips follow the last-used device', () => {
  setPromptDevice('kbm');
  setGamepadPromptBindings(null);
  const kbm = { dock: promptLabel('dock'), codex: promptLabel('codex'), starmap: promptLabel('starmap'), drill: promptLabel('drill') };

  setPromptDevice('gamepad');
  const pad = { dock: promptLabel('dock'), codex: promptLabel('codex'), starmap: promptLabel('starmap'), drill: promptLabel('drill') };

  setPromptDevice('touch');
  const touch = { dock: promptLabel('dock'), missionLog: promptLabel('missionLog'), starmap: promptLabel('starmap') };

  console.log(`[pq-164.01] seed ${SEED} — resolved prompt chips by device class`);
  console.log('  action   | kbm      | gamepad  | touch');
  for (const a of ['dock', 'codex', 'starmap', 'drill']) {
    console.log(`  ${a.padEnd(8)} | ${(kbm[a] || '—').padEnd(8)} | ${(pad[a] || '—').padEnd(8)} | ${(touch[a] || '—').padEnd(8)}`);
  }
  console.log(`  missionLog | ${'—'.padEnd(8)} | ${'—'.padEnd(8)} | ${touch.missionLog}`);

  assert.equal(kbm.dock, `[ ${BINDINGS.dock.label} ]`, 'kbm dock chip is the live key label');
  assert.equal(pad.dock, '[ A ]', 'pad dock chip is the A glyph');
  assert.equal(pad.codex, '[ Y ]', 'pad codex chip is the Y glyph');
  assert.equal(pad.starmap, '[ View ]', 'pad star map chip is the View glyph');
  assert.equal(pad.drill, `[ ${BINDINGS.drill.label} ]`, 'pad has no drill verb — honest fallback to the key label');
  assert.equal(touch.dock, '[ Dock ]', 'touch dock chip names the overlay button');
  assert.equal(touch.missionLog, '[ Log ]', 'touch mission log chip names the overlay button');

  // A pad remap re-labels the chip: move accept/dock to a free button (D-Pad Left).
  setGamepadPromptBindings(resolveGamepadBindings(padState({ accept: ['dLeft'] }).settings));
  setPromptDevice('gamepad');
  assert.equal(promptLabel('dock'), '[ D-Pad Left ]', 'remapped pad verb re-labels the dock chip');
  assert.equal(gamepadGlyphForAction('accept'), 'D-Pad Left', 'glyph helper reads the live map');
  setPromptDevice('kbm');
  setGamepadPromptBindings(null);
  assert.equal(promptLabel('dock'), `[ ${BINDINGS.dock.label} ]`, 'kbm chip restored on device flip');
});

test('PQ-164.01: resolver merges overrides and never lets stored data beat the stock map', () => {
  assert.equal(resolveGamepadBindings(null), GAMEPAD_DEFAULT_BINDINGS, 'no settings -> frozen default map');
  assert.equal(resolveGamepadBindings(padState(null).settings), GAMEPAD_DEFAULT_BINDINGS);

  const moved = resolveGamepadBindings(padState({ fire: ['dDown'] }).settings);
  assert.deepEqual(moved.fire, ['dDown'], 'override replaces the action list on a free button');
  assert.deepEqual(moved.mine, GAMEPAD_DEFAULT_BINDINGS.mine, 'untouched actions keep defaults');
  assert.deepEqual(moved.brake, GAMEPAD_DEFAULT_BINDINGS.brake);

  // A stored same-context steal (the UI denies these at capture; only a hand-edited profile
  // produces one) loses to the default claim — corrupt data can never leave the pad worse
  // than stock.
  const steal = resolveGamepadBindings(padState({ fire: ['l1'] }).settings);
  assert.deepEqual(steal.brake, GAMEPAD_DEFAULT_BINDINGS.brake, 'brake keeps LB');
  assert.deepEqual(steal.fire, GAMEPAD_DEFAULT_BINDINGS.fire, 'illegal fire override reverts to RT');

  // Legal context-disjoint share survives: cancel (modal) may sit on fire's RT.
  const shared = resolveGamepadBindings(padState({ cancel: ['r2'] }).settings);
  assert.deepEqual(shared.cancel, ['r2']);
  assert.deepEqual(shared.fire, GAMEPAD_DEFAULT_BINDINGS.fire, 'designed share keeps both claims');

  // Corrupt entries fall back to the action default instead of leaving a dead verb.
  const corrupt = resolveGamepadBindings(padState({ fire: ['not-a-button'], pause: ['r2'] }).settings);
  assert.deepEqual(corrupt.fire, GAMEPAD_DEFAULT_BINDINGS.fire, 'invalid button name -> default restored');
  assert.deepEqual(corrupt.pause, GAMEPAD_DEFAULT_BINDINGS.pause, 'illegal share -> default restored');
  const unbound = resolveGamepadBindings(padState({ fire: [] }).settings);
  assert.deepEqual(unbound.fire, [], 'explicit empty list is a deliberate unbind');

  assert.equal(gamepadShareAllowed('cancel', 'fire'), true, 'modal verb may share a flight button');
  assert.equal(gamepadShareAllowed('accept', 'massline'), true, 'designed A/Cross arbitration kept');
  assert.equal(gamepadShareAllowed('fire', 'brake'), false, 'same-context flight verbs conflict');
  assert.equal(gamepadShareAllowed('map', 'fire'), false, 'global verb conflicts everywhere');
});

test('PQ-164.01: conflict detection names the holder and honors designed shares', () => {
  const live = resolveGamepadBindings(padState(null).settings);
  const tentative = (action) => ({ ...live, [action]: [] });
  assert.equal(findGamepadBindConflict(tentative('fire'), 'fire', 'l1'), 'brake', 'fire on LB conflicts with brake');
  assert.equal(findGamepadBindConflict(tentative('cancel'), 'cancel', 'r2'), null, 'cancel may share RT with fire');
  assert.equal(findGamepadBindConflict(tentative('pause'), 'pause', 'view'), 'map', 'pause cannot take View from map');
  assert.equal(findGamepadBindConflict(tentative('massline'), 'massline', 'accept'), null, 'massline may re-share the accept button');
  assert.equal(findGamepadBindConflict(tentative('tabNext'), 'tabNext', 'r2'), null, 'station tab may share a flight trigger');
  assert.equal(findGamepadBindConflict(tentative('codex'), 'codex', 'r2'), 'fire', 'codex acts in flight and cannot sit on RT');
});

test('PQ-164.01: shipped tick honours the remap; capture queue and captureMode work', () => {
  installedPad = makePad();
  const state = padState({ fire: ['dDown'] });
  const gp = createGamepad({ bus: createBus(), state });
  gp.tick(0.016, state);
  assert.equal(gp.connected, true);

  // D-Pad Down (index 13) now fires; RT (index 7) does not.
  installedPad.buttons[13] = { pressed: true, value: 1, touched: true };
  state.tick += 1;
  gp.tick(0.016, state);
  assert.equal(gp.actions.fire.held, true, 'remapped D-Pad Down drives fire');
  installedPad.buttons[13] = { pressed: false, value: 0, touched: false };
  installedPad.buttons[7] = { pressed: true, value: 1, touched: true };
  state.tick += 1;
  gp.tick(0.016, state);
  assert.equal(gp.actions.fire.held, false, 'default RT no longer fires after remap');

  // Raw press edges queue for the capture flow even for unbound buttons.
  gp.drainButtonPresses(); // clear edges from the presses above
  installedPad.buttons[7] = { pressed: false, value: 0, touched: false };
  state.tick += 1;
  gp.tick(0.016, state);
  installedPad.buttons[16] = { pressed: true, value: 1, touched: true };
  state.tick += 1;
  gp.tick(0.016, state);
  assert.deepEqual(gp.drainButtonPresses(), ['home'], 'edges recorded for a never-bound button');
  assert.deepEqual(gp.drainButtonPresses(), [], 'drain empties the queue');
  assert.equal(gp.lastButton, 'home');

  // captureMode leaves every action inert while still recording edges.
  gp.captureMode = true;
  installedPad.buttons[16] = { pressed: false, value: 0, touched: false };
  state.tick += 1;
  gp.tick(0.016, state);
  installedPad.buttons[0] = { pressed: true, value: 1, touched: true };
  state.tick += 1;
  gp.tick(0.016, state);
  assert.equal(gp.actions.accept.held, false, 'captureMode keeps actions inert');
  assert.equal(gp.actions.accept.pressed, false);
  assert.deepEqual(gp.drainButtonPresses(), ['accept'], 'capture still receives the pressed button');
  gp.captureMode = false;
});

test('PQ-164.01: UI tick routes captured presses and flips the prompt device on pad edges', () => {
  installedPad = makePad();
  const bus = createBus();
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
  let confirms = 0;
  bus.on('ui:confirm', () => { confirms += 1; });
  const screenManager = {
    isOpen: () => true,
    top: () => 'settings',
    getActiveScreenDef: () => ({ id: 'settings' }),
    locked: () => false,
    popScreen() {},
    pushScreen() {},
  };
  const input = createUiInput({ bus, state, gamepad: gp, registry: null }, screenManager);

  // A pad edge flips the prompt device.
  setPromptDevice('kbm');
  installedPad.buttons[12] = { pressed: true, value: 1, touched: true };
  input.tick(0.016);
  assert.equal(getPromptDevice(), 'gamepad', 'pad activity edge flips the prompt device');
  assert.equal(promptLabel('dock'), '[ A ]', 'dock chip reads as the pad glyph');

  // Capture: registered handler receives the raw button and the press cannot activate UI.
  const captured = [];
  setGamepadCaptureHandler((name) => captured.push(name));
  installedPad.buttons[12] = { pressed: false, value: 0, touched: false };
  state.tick += 1;
  input.tick(0.016);
  installedPad.buttons[0] = { pressed: true, value: 1, touched: true };
  state.tick += 1;
  input.tick(0.016);
  assert.deepEqual(captured, ['accept'], 'capture handler receives the std button name');
  assert.equal(confirms, 0, 'captured press never reaches UI accept');
  assert.equal(gp.captureMode, true, 'capture flag applied to the pad layer');

  setGamepadCaptureHandler(null);
  input.tick(0.016);
  assert.equal(gp.captureMode, false, 'capture flag clears with the handler');
  input.dispose();
  setPromptDevice('kbm');
});

test('PQ-164.01: pad remap persists through the settings profile and an old save load', () => {
  const first = createGameState(11);
  const firstBus = createBus();
  save.init({ state: first, bus: firstBus, helpers: {}, registry: { get: () => null } });
  first.settings.controls.gamepad.bindings = { fire: ['dDown'], cancel: ['r2'] };
  firstBus.emit('settings:changed', { section: 'controls', key: 'gamepad', value: first.settings.controls.gamepad });

  const stored = JSON.parse(localStore.get(PROFILE_KEY));
  assert.deepEqual(stored.settings.controls.gamepad.bindings, { fire: ['dDown'], cancel: ['r2'] },
    'profile store persists the pad remap');

  const booted = createGameState(22);
  save.init({ state: booted, bus: createBus(), helpers: {}, registry: { get: () => null } });
  assert.deepEqual(booted.settings.controls.gamepad.bindings, { fire: ['dDown'], cancel: ['r2'] },
    'boot loads the pad remap from the profile');
  const live = resolveGamepadBindings(booted.settings);
  assert.deepEqual(live.fire, ['dDown'], 'the resolved live map reflects the persisted remap');

  // An old save that never carried the map does not wipe the profile choice (save is the same
  // singleton bound to `booted` by init above).
  save._restoreSettings({
    settings: { controls: { gamepad: { enabled: true, deadzone: 0.2, invertY: true } } },
  });
  assert.deepEqual(booted.settings.controls.gamepad.bindings, { fire: ['dDown'], cancel: ['r2'] },
    'profile pad remap survives an old save load');
});
