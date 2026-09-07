import test from 'node:test';
import assert from 'node:assert/strict';
import { KIT_SOUND_PALETTE, installKitPalette } from './palette.js';
import { deriveTemperature, bindTemperature, setTemperature, TEMPERATURE_EVENTS } from './temperature.js';
import { cut, settle, stamp, SETTLE_MS } from './motion.js';

function registry() {
  return KIT_SOUND_PALETTE.map(({ recipe }) => ({
    id: recipe.id, category: 'ui', type: 'noise_burst', repeatCount: 2,
    reverbMix: 0.4, reverbDecay: 0.8, freqMod: 0.5,
    gainEnvelope: { attack: 0.1, sustain: 0.3, release: 0.4 },
  }));
}

function eventBus() {
  const handlers = new Map();
  return {
    on(name, fn) {
      const entries = handlers.get(name) || new Set(); entries.add(fn); handlers.set(name, entries);
      return () => entries.delete(fn);
    },
    emit(name, payload) { for (const fn of handlers.get(name) || []) fn(payload); },
    count() { return [...handlers.values()].reduce((sum, values) => sum + values.size, 0); },
  };
}

test('temperature uses real run, dock and heat state with Works precedence', () => {
  const state = { mode: 'flight', player: { heat: 0 }, ui: { docked: false } };
  assert.equal(deriveTemperature(state, ''), 'flight');
  assert.equal(deriveTemperature(state, 'settings'), 'menu');
  assert.equal(deriveTemperature({ ...state, mode: 'menu' }, 'mainMenu'), 'flight');
  state.ui.docked = true;
  assert.equal(deriveTemperature(state, 'station'), 'docked');
  state.player.heat = 0.14999;
  assert.equal(deriveTemperature(state, ''), 'docked');
  state.player.heat = 0.15;
  assert.equal(deriveTemperature(state, ''), 'wanted');
  state.run = { kind: 'survival', phase: 'active' };
  assert.equal(deriveTemperature(state, ''), 'crucible');
  assert.equal(deriveTemperature(state, 'drill'), 'works');
  assert.equal(deriveTemperature(state, 'asteroid'), 'works');
  state.run.phase = 'ended';
  assert.equal(deriveTemperature(state, ''), 'wanted');
  assert.equal(deriveTemperature(state, 'crucibleResults'), 'crucible');
});

test('temperature writes only edges and unsubscribes the complete state seam', () => {
  const root = { dataset: {} }, bus = eventBus(), state = { mode: 'flight' };
  const apply = bindTemperature(bus, state, { root });
  assert.equal(root.dataset.kTemp, 'flight');
  assert.equal(apply(), false);
  assert.equal(bus.count(), TEMPERATURE_EVENTS.length + 1);
  bus.emit('ui:screenTop', { id: 'settings' });
  assert.equal(root.dataset.kTemp, 'menu');
  bus.emit('ui:screenTop', { id: '' });
  assert.equal(root.dataset.kTemp, 'flight');
  state.player = { heat: 0.8 }; bus.emit('heat:changed');
  assert.equal(root.dataset.kTemp, 'wanted');
  apply.dispose(); apply.dispose(); assert.equal(bus.count(), 0);
  state.player.heat = 0; assert.equal(apply(), false);
  assert.equal(root.dataset.kTemp, 'wanted');
  assert.throws(() => setTemperature('amber', root), RangeError);
  assert.throws(() => bindTemperature({}, state), TypeError);
});

test('the palette is exactly eight finite low-pass sine envelopes', () => {
  assert.equal(KIT_SOUND_PALETTE.length, 8);
  assert.equal(new Set(KIT_SOUND_PALETTE.map(entry => entry.recipe.id)).size, 8);
  for (const entry of KIT_SOUND_PALETTE) {
    assert.equal(entry.recipe.type, 'oscillator');
    assert.equal(entry.recipe.wave, 'sine');
    assert.equal(entry.recipe.filterType, 'lowpass');
    assert.ok(entry.recipe.filterFreq <= 3000);
    assert.ok(entry.envelopeMs <= entry.maxMs, entry.name);
    assert.equal(entry.cleanupMs, 20);
    assert.ok(entry.recipe.gainMult > 0 && entry.recipe.gainMult <= 0.6);
    assert.equal(entry.recipe.repeatCount, undefined);
    assert.equal(entry.recipe.reverbMix, undefined);
    assert.deepEqual(entry.recipe.pitchRange, [1, 1]);
  }
  assert.equal(KIT_SOUND_PALETTE.find(entry => entry.name === 'move').envelopeMs, 51);
});

test('palette leases preserve cached object identity, clear old layers and restore originals', () => {
  const recipes = registry();
  const unrelated = { id: 'sfx_station_hum', type: 'continuous_oscillator' }; recipes.push(unrelated);
  const before = structuredClone(recipes), cached = new Map(recipes.map(recipe => [recipe.id, recipe]));
  const first = installKitPalette(recipes), second = installKitPalette(recipes);
  for (const entry of KIT_SOUND_PALETTE) {
    const object = cached.get(entry.recipe.id);
    assert.equal(recipes.find(recipe => recipe.id === object.id), object);
    assert.equal(object.type, 'oscillator');
    assert.equal(object.repeatCount, undefined); assert.equal(object.reverbMix, undefined);
    assert.equal(object.freqMod, undefined);
  }
  assert.equal(unrelated.type, 'continuous_oscillator');
  first(); first(); assert.equal(recipes[0].type, 'oscillator');
  second(); second(); assert.deepEqual(recipes, before);
});

test('palette installation validates the entire registry before any change', () => {
  const missing = registry().slice(0, -1), before = structuredClone(missing);
  assert.throws(() => installKitPalette(missing), /sfx_wanted_alert/);
  assert.deepEqual(missing, before);
  const immutable = registry(); Object.freeze(immutable.at(-1));
  const frozenBefore = structuredClone(immutable);
  assert.throws(() => installKitPalette(immutable), /immutable/);
  assert.deepEqual(immutable, frozenBefore);
  const duplicate = registry(); duplicate.push({ ...duplicate[0] });
  assert.throws(() => installKitPalette(duplicate), /exactly one/);
});

function motionEnvironment() {
  const original = Object.fromEntries(['document', 'matchMedia', 'requestAnimationFrame', 'cancelAnimationFrame']
    .map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const frames = new Map(); let frameId = 0, reduction = false;
  const element = () => {
    const classes = new Set(), properties = new Map(), events = new Map();
    return {
      dataset: {}, hidden: false, isConnected: true,
      classList: { add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)), contains: name => classes.has(name) },
      style: { setProperty: (name, value) => properties.set(name, value), removeProperty: name => properties.delete(name) },
      addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name),
      classes, events,
    };
  };
  const html = element(); globalThis.document = { documentElement: html };
  globalThis.matchMedia = () => ({ matches: reduction });
  globalThis.requestAnimationFrame = fn => { const id = ++frameId; frames.set(id, fn); return id; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  return { element, frames, html, reduce: value => { reduction = value; },
    frame() { const pending = [...frames.entries()]; frames.clear(); pending.forEach(([, fn]) => fn()); },
    restore() {
      for (const [name, descriptor] of Object.entries(original)) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
      }
    },
  };
}

test('reduced motion is a named synchronous cut with no scheduled work', () => {
  const env = motionEnvironment();
  try {
    env.reduce(true);
    const previous = env.element(), next = env.element(); next.hidden = true;
    cut(previous, next, { state: 'ui:screenTop' });
    settle(next, { state: 'ui:screenTop', from: 'right' });
    assert.equal(previous.hidden, true); assert.equal(next.hidden, false);
    assert.equal(next.dataset.kMotionState, 'ui:screenTop');
    assert.equal(next.classes.size, 0); assert.equal(env.frames.size, 0);
    env.reduce(false); env.html.classList.add('sf-reduce-motion');
    settle(next, { state: 'dock:undocked' }); assert.equal(env.frames.size, 0);
  } finally { env.restore(); }
});

test('motion replacement, cancellation and cleanup cannot leave a hidden stale arrival', () => {
  const env = motionEnvironment();
  try {
    assert.ok(SETTLE_MS <= 160);
    const target = env.element();
    assert.throws(() => settle(target), /named state/);
    assert.throws(() => cut(null, target), /named state/);
    assert.throws(() => settle(target, { state: 'test', from: 'diagonal' }), RangeError);
    const oldCancel = settle(target, { state: 'dock:docked' });
    const newCancel = settle(target, { state: 'dock:undocked', from: 'right' });
    oldCancel(); assert.equal(target.classes.has('k-in--right'), true);
    env.frame(); env.frame(); assert.equal(target.classes.has('k-in--go'), true);
    newCancel(); assert.equal(target.classes.size, 0); assert.equal(target.events.size, 0);
    settle(target, { state: 'test:interrupt' });
    cut(target, null, { state: 'test:close' });
    assert.equal(env.frames.size, 0); assert.equal(target.classes.size, 0); assert.equal(target.hidden, true);
    assert.throws(() => stamp(Array.from({ length: 20 }, () => env.element()), { state: 'test', gap: 60 }), /budget/);
  } finally { env.restore(); }
});
