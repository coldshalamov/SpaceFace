import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveTemperature, bindTemperature, setTemperature, TEMPERATURE_EVENTS } from '../src/ui/kit/temperature.js';
import { cut, settle, stamp, SETTLE_MS } from '../src/ui/kit/motion.js';
import { bindSound, cue, CUE_IDS } from '../src/ui/kit/sound.js';
import { RECIPES } from '../src/data/audioRecipes.js';

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

test('sound cues emit the mapped ids through audio:cue and nothing before binding', () => {
  const seen = [];
  assert.doesNotThrow(() => cue('confirm'));
  const dispose = bindSound({ emit(name, payload) { seen.push([name, payload]); } });
  cue('move'); cue('confirm');
  assert.deepEqual(seen, [
    ['audio:cue', { id: 'ui_tab', gain: 0.25 }],
    ['audio:cue', { id: 'ui_confirm', gain: 0.6 }],
  ]);
  assert.throws(() => cue('hover'), /unknown cue/);
  dispose(); cue('open');
  assert.equal(seen.length, 2);
  assert.deepEqual(Object.keys(CUE_IDS), ['open', 'close', 'move', 'confirm', 'deny']);
});

test('the eight UI recipes carry the sheet character: one sine, low-pass, bounded length', () => {
  const bounds = {
    sfx_ui_open: [110, 100, 500, 0.25], sfx_ui_back: [82, 74, 420, 0.25], sfx_ui_tab: [660, 640, 2400, 0.06],
    sfx_ui_confirm: [440, 440, 3000, 0.3], sfx_ui_error: [330, 247, 900, 0.3], sfx_dock_clunk: [48, 62, 600, 0.9],
    sfx_undock_release: [62, 48, 500, 0.6], sfx_wanted_alert: [196, 196, 800, 1.2],
  };
  for (const [id, [from, to, cutoff, maxS]] of Object.entries(bounds)) {
    const recipe = RECIPES.find((r) => r.id === id);
    assert.ok(recipe, id);
    assert.equal(recipe.type, 'oscillator', id);
    assert.equal(recipe.wave, 'sine', id);
    assert.equal(recipe.baseFreq, from, id);
    assert.deepEqual(recipe.freqSweep, [from, to], id);
    assert.equal(recipe.filterType, 'lowpass', id);
    assert.equal(recipe.filterFreq, cutoff, id);
    // synth.js applyEnvelope: attack ramp, a fixed 40 ms decay to the sustain *level*, then release.
    const { attack = 0.005, release = 0.05 } = recipe.gainEnvelope;
    const lengthS = attack + 0.04 + release;
    assert.ok(lengthS <= maxS + 1e-9, `${id} sounds for ${lengthS}s > ${maxS}s`);
    assert.equal(recipe.repeatCount, undefined, id);
    assert.equal(recipe.reverbMix, undefined, id);
  }
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
