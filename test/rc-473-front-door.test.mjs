// RC-473, revised 2026-11-18 (design/overhaul/08_INTERFACE.md §2): the first-light offer no longer
// interrupts the title. The calm accessibility preset stays whole and available in Settings › Access,
// and its markers still survive a save/profile round-trip.

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

// design/overhaul/08_INTERFACE.md §2 (director, 2026-11-18): the title never stops a new player with a
// modal. The calm preset is still one press away in Settings › Access (applyFirstLightPreset), and the
// OS reduced-motion question (screens/motionAsk.js) still asks when the system requests reduced motion.
test('a fresh profile is never interrupted at the title by the first-light offer', async () => {
  const settings = {};
  const ctx = makeCtx(settings);
  let asked = 0;
  mainMenuScreen._confirmFirstLight = () => { asked += 1; return Promise.resolve('calm'); };
  mainMenuScreen._shown = true;
  assert.equal(shouldOfferFirstLight(settings), false, 'no new player is stopped at the title');
  assert.equal(mainMenuScreen._maybeOfferFirstLight(ctx), false, 'the offer never opens');
  await tick(); await tick();
  assert.equal(asked, 0);
  assert.equal(settings.accessibility, undefined, "nothing is written on the player's behalf");
});

test('the calm preset still applies whole when the player chooses it in Settings › Access', () => {
  const settings = { video: {}, accessibility: {} };
  applyFirstLightPreset(settings, null);
  const access = settings.accessibility;
  assert.equal(access.motionPreference, 'reduce');
  assert.equal(access.flashReduce, FIRST_LIGHT_PRESET.flashReduce);
  assert.equal(access.highContrast, FIRST_LIGHT_PRESET.highContrast);
  assert.equal(access.textScale, FIRST_LIGHT_PRESET.textScale);
  assert.equal(access.captions, FIRST_LIGHT_PRESET.captions);
  assert.equal(settings.video.motionReduce, true, 'the runtime contract follows the reduce answer');
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

test('the loading-hidden receipt never opens an offer: the title is never interrupted', () => {
  const settings = {};
  const ctx = makeCtx(settings);
  mainMenuScreen._bindLoadingHidden(ctx);
  let asked = 0;
  mainMenuScreen._confirmFirstLight = () => { asked += 1; return Promise.resolve('play'); };
  mainMenuScreen._shown = true;

  ctx.bus.emit('ui:loadingHidden', { mode: 'menu' });
  assert.equal(asked, 0, 'the shell-gone receipt goes straight to the title');
  assert.equal(settings.accessibility, undefined);
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
