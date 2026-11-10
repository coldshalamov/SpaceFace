// RC-473: the first-light offer asks once — the calm accessibility preset is offered, never
// applied, and the "asked" marker survives a save/profile round-trip so a returning player
// never sees it again.

import assert from 'node:assert/strict';
import test from 'node:test';

import { mainMenuScreen, FIRST_LIGHT_OFFER } from '../src/ui/screens/mainMenu.js';
import { shouldOfferFirstLight, applyFirstLightPreset, FIRST_LIGHT_PRESET } from '../src/ui/accessibility.js';
import { save } from '../src/save/saveSystem.js';
import { PROFILE_SETTINGS_KEY } from '../src/core/graphicsProfileBootstrap.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));

function makeBus() {
  const events = [];
  const handlers = new Map();
  return {
    events,
    emit(key, payload) { events.push([key, payload]); for (const fn of handlers.get(key) || []) fn(payload); },
    on(key, fn) {
      const set = handlers.get(key) || new Set();
      set.add(fn); handlers.set(key, set);
      return () => set.delete(fn);
    },
  };
}

function makeCtx(settings, { top = 'mainMenu' } = {}) {
  const bus = makeBus();
  const state = { settings };
  return {
    bus,
    state,
    screenManager: { top: () => top, hasScreen: () => true },
  };
}

function resetOfferState() {
  mainMenuScreen._shown = false;
  mainMenuScreen._showToken = 0;
  mainMenuScreen._firstLightPending = null;
  mainMenuScreen._firstLightConfirm = false;
  mainMenuScreen._offBus = [];
  mainMenuScreen._confirmFirstLight = (options) => Promise.resolve(options && options.confirmLabel);
}

test.beforeEach(resetOfferState);
test.after(() => { resetOfferState(); delete mainMenuScreen._confirmFirstLight; });

test('first launch offers the calm preset once and records the asked marker up front', async () => {
  const settings = {};
  const ctx = makeCtx(settings);
  let asked = 0;
  mainMenuScreen._confirmFirstLight = (options) => {
    asked += 1;
    assert.equal(options, FIRST_LIGHT_OFFER, 'the offer is the authored First light copy');
    assert.equal(settings.accessibility.firstLightOffered, true,
      'the marker is written before the dialog answers — a reload mid-dialog cannot ask twice');
    return Promise.resolve('calm');
  };
  mainMenuScreen._shown = true;

  assert.equal(mainMenuScreen._maybeOfferFirstLight(ctx), true, 'the offer opens');
  await tick(); await tick();

  assert.equal(asked, 1);
  const access = settings.accessibility;
  assert.equal(access.firstLightChoice, 'applied');
  assert.equal(access.motionPreference, 'reduce');
  assert.equal(access.motionAsked, true, 'the preset also settles the motion question');
  assert.equal(access.flashReduce, FIRST_LIGHT_PRESET.flashReduce);
  assert.equal(access.highContrast, FIRST_LIGHT_PRESET.highContrast);
  assert.equal(access.textScale, FIRST_LIGHT_PRESET.textScale);
  assert.equal(access.captions, FIRST_LIGHT_PRESET.captions);
  assert.equal(access.captionSize, FIRST_LIGHT_PRESET.captionSize);
  assert.equal(access.captionBackground, FIRST_LIGHT_PRESET.captionBackground);
  assert.equal(settings.video.motionReduce, true, 'the runtime contract follows the reduce answer');
  assert.ok(ctx.bus.events.some(([k, p]) => k === 'settings:changed' && p && p.key === 'firstLightChoice'),
    'the settled choice publishes its own receipt so the profile owner writes it');

  // The gate is latched: any later call — a second loading-hidden receipt, a refresh, a remount —
  // can never ask again.
  assert.equal(mainMenuScreen._maybeOfferFirstLight(ctx), false, 'the offer never repeats');
  assert.equal(shouldOfferFirstLight(settings), false);
  assert.equal(asked, 1);
});

test('Play or an away-dismiss keeps the shipped settings and still counts as answered', async () => {
  for (const answer of [true, 'play', false]) {
    resetOfferState();
    const settings = {};
    const ctx = makeCtx(settings);
    mainMenuScreen._confirmFirstLight = () => Promise.resolve(answer);
    mainMenuScreen._shown = true;

    assert.equal(mainMenuScreen._maybeOfferFirstLight(ctx), true);
    await tick(); await tick();

    const access = settings.accessibility;
    assert.equal(access.firstLightOffered, true, `answer ${answer} still marks the offer shown`);
    assert.equal(access.firstLightChoice, 'kept', `answer ${answer} keeps the player's settings`);
    assert.equal(access.textScale, undefined, 'the preset is never partially applied');
    assert.equal(access.highContrast, undefined);
    assert.equal(mainMenuScreen._maybeOfferFirstLight(ctx), false);
  }
});

test('the offer waits for an unobstructed title — overlay up, menu away, or a pending ask', () => {
  const priorDocument = globalThis.document;
  try {
    // The loading shell still owns the screen: display:flex, not yet display:none.
    globalThis.document = {
      getElementById: (id) => (id === 'boot-overlay'
        ? { style: { display: 'flex' }, classList: { contains: () => false } }
        : null),
      documentElement: null,
    };
    const settings = {};
    const ctx = makeCtx(settings);
    let asked = 0;
    mainMenuScreen._confirmFirstLight = () => { asked += 1; return Promise.resolve('calm'); };
    mainMenuScreen._shown = true;

    assert.equal(mainMenuScreen._maybeOfferFirstLight(ctx), false, 'the shell still blocks the offer');
    assert.equal(settings.accessibility, undefined, 'a blocked try does not spend the once flag');
    assert.equal(asked, 0);

    // Another screen on top: the title exists but is not current.
    const awayCtx = makeCtx(settings, { top: 'settings' });
    assert.equal(mainMenuScreen._maybeOfferFirstLight(awayCtx), false);
    assert.equal(asked, 0);

    // The offer is already live: a second receipt must not stack a second dialog.
    globalThis.document = { getElementById: () => null, documentElement: null };
    mainMenuScreen._firstLightPending = 7;
    assert.equal(mainMenuScreen._maybeOfferFirstLight(ctx), false);
    assert.equal(asked, 0);
  } finally {
    if (priorDocument === undefined) delete globalThis.document;
    else globalThis.document = priorDocument;
  }
});

test('the loading-hidden receipt is what actually opens the offer', () => {
  const settings = {};
  const ctx = makeCtx(settings);
  mainMenuScreen._bindLoadingHidden(ctx);
  let asked = 0;
  mainMenuScreen._confirmFirstLight = () => { asked += 1; return Promise.resolve('play'); };
  mainMenuScreen._shown = true;

  ctx.bus.emit('ui:loadingHidden', { mode: 'menu' });
  assert.equal(asked, 1, 'the shell-gone receipt raises the offer');
  assert.equal(settings.accessibility.firstLightOffered, true);
});

test('a save/profile round-trip keeps the asked flag and the settled choice', async () => {
  const priorStorage = globalThis.localStorage;
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
  };
  try {
    const settings = { video: {}, accessibility: {} };
    applyFirstLightPreset(settings, null);
    settings.accessibility.firstLightOffered = true;
    settings.accessibility.firstLightChoice = 'applied';

    save._writeProfileSettings.call({
      state: { settings },
      bus: { emit() {} },
      _queueSharedStoreMirror() {},
    });
    assert.ok(mem.has(PROFILE_SETTINGS_KEY), 'the profile was written');

    const restored = { settings: {} };
    save._loadProfileSettings.call({
      state: restored,
      _readProfileSettings: save._readProfileSettings,
    });
    const access = restored.settings.accessibility;
    assert.equal(access.firstLightOffered, true, 'a returning player is never re-offered');
    assert.equal(access.firstLightChoice, 'applied');
    assert.equal(access.textScale, FIRST_LIGHT_PRESET.textScale);
    assert.equal(access.motionPreference, 'reduce');
    assert.equal(restored.settings.video.motionReduce, true);
    assert.equal(shouldOfferFirstLight(restored.settings), false);
  } finally {
    if (priorStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = priorStorage;
  }
});
