// W1-C: the one-time "this looks slow" offer. The detector must fire once after a sustained
// sub-30 fps median in live flight, never on a healthy or frame-capped machine, never on the
// software renderer (it has its own emergency profile), never while the receipt lane is quiet
// (the once-per-session latch must not be spent on a toast nobody can see), never count a paused,
// docked or screen-covered sim, and accepting must go through the same settings path the
// Settings screen uses. The receipt goes through the presentation-only route, never the bus.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { matchingQualityPreset } from '../src/render/adaptiveQuality.js';
import { admitReceipt } from '../src/ui/hudAttention.js';
import {
  SLOW_OFFER_ACTION_ID,
  SLOW_OFFER_CONFIRM_TOAST,
  SLOW_OFFER_PRESET,
  SLOW_OFFER_TOAST,
  alreadyOnPerformancePreset,
  applyPresetThroughSettings,
  createSlowFrameWatch,
  installSlowFrameOffer,
} from '../src/render/slowFrameOffer.js';

// Feed `seconds` of frames at a fixed frame time; returns the index of the first firing frame
// (1-based) or 0 when it never fired.
function feed(watch, seconds, dtMs, eligible = true) {
  const frames = Math.round((seconds * 1000) / dtMs);
  for (let i = 1; i <= frames; i++) {
    if (watch.sample(dtMs, eligible)) return i;
  }
  return 0;
}

function liveState(overrides = {}) {
  const state = createGameState(1);
  state.mode = 'flight';
  state.render = {
    ...(state.render || {}),
    firstPlayableFrameAt: 1000,
    lastPresentDtMs: 16.7,
    gpu: { renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620)', vendor: 'Google Inc.', software: false, tier: 'integrated' },
    ...(overrides.render || {}),
  };
  if (overrides.video) Object.assign(state.settings.video, overrides.video);
  if (overrides.mode) state.mode = overrides.mode;
  return state;
}

function harness({ state = liveState(), canShow, isHidden } = {}) {
  const bus = createBus();
  const toasts = [];
  const busToasts = [];
  const settings = [];
  // What simulation listeners hear: the offer must never use it.
  bus.on('toast', (p) => busToasts.push(p));
  bus.on('settings:changed', (p) => settings.push(p));
  const offer = installSlowFrameOffer({ state, bus, canShow, isHidden, present: (spec) => { toasts.push(spec); } });
  const play = (seconds, dtMs) => {
    const frames = Math.round((seconds * 1000) / dtMs);
    state.render.lastPresentDtMs = dtMs;
    for (let i = 0; i < frames; i++) offer.onPresented();
  };
  return { state, bus, toasts, busToasts, settings, offer, play };
}

// --- the detector ----------------------------------------------------------------------------

test('a steady 25 fps flight fires once the settle and the 20 s window have passed', () => {
  const watch = createSlowFrameWatch();
  const at = feed(watch, 60, 40);
  assert.ok(at > 0, 'it fired');
  const seconds = (at * 40) / 1000;
  assert.ok(seconds >= 24 && seconds <= 26, `fired at ${seconds}s, expected ~25s (5s settle + 20s window)`);
});

test('healthy, capped, and borderline machines never fire', () => {
  assert.equal(feed(createSlowFrameWatch(), 300, 16.67), 0, '60 fps');
  assert.equal(feed(createSlowFrameWatch(), 300, 22.2), 0, '45 fps');
  assert.equal(feed(createSlowFrameWatch(), 300, 33.4), 0, 'a 30 fps-locked presentation is not slow');
  assert.equal(feed(createSlowFrameWatch(), 300, 34.4), 0, 'just under the 34.5 ms line');
  assert.ok(feed(createSlowFrameWatch(), 300, 36) > 0, 'a real 28 fps does fire');
});

test('the median decides: a minority of slow frames does not fire, a majority does', () => {
  const run = (slowOfTwenty) => {
    const watch = createSlowFrameWatch();
    for (let i = 0; i < 20000; i++) {
      if (watch.sample((i % 20) < slowOfTwenty ? 60 : 16, true)) return i + 1;
    }
    return 0;
  };
  assert.equal(run(9), 0, '45% slow frames: the median frame is still fast');
  assert.ok(run(11) > 0, '55% slow frames: the median frame is slow');
});

test('one ineligible frame restarts the window: sustained means one unbroken stretch', () => {
  const watch = createSlowFrameWatch();
  assert.equal(feed(watch, 22, 40), 0);
  assert.equal(watch.sample(40, false), false);
  assert.equal(watch.filledSeconds, 0, 'the ring was cleared');
  assert.equal(feed(watch, 23, 40), 0, 'still inside the new settle + window');
  assert.ok(feed(watch, 5, 40) > 0, 'fires once a full 25 s has passed since the break');
});

test('a clamped 250 ms frame carries no timing: skipped, neither counted nor a reset', () => {
  assert.equal(feed(createSlowFrameWatch(), 300, 250), 0, 'a throttled pane reporting only clamped frames never fires');
  const watch = createSlowFrameWatch();
  let fired = 0;
  for (let i = 0; i < 4000 && !fired; i++) {
    // 24 genuine slow frames, then one clamped sample, repeating.
    fired = watch.sample(i % 25 === 24 ? 250 : 41, true) ? i + 1 : 0;
  }
  assert.ok(fired > 0, 'sporadic clamped frames inside a slow stretch do not hide it');
});

test('a gap of a second or more (suspend, tab switch) restarts the window', () => {
  const watch = createSlowFrameWatch();
  assert.equal(feed(watch, 22, 40), 0);
  assert.equal(watch.sample(1500, true), false);
  assert.equal(watch.filledSeconds, 0);
  assert.equal(watch.sample(NaN, true), false);
  assert.equal(watch.sample(0, true), false);
  assert.equal(watch.sample(-5, true), false);
});

// --- the wiring ------------------------------------------------------------------------------

test('a slow flight emits exactly one offer toast, with the Switch action, and never a second', () => {
  const h = harness();
  h.play(20, 40);
  assert.equal(h.toasts.length, 0, 'not inside the settle + window');
  h.play(10, 40);
  assert.equal(h.toasts.length, 1);
  assert.deepEqual(h.toasts[0], SLOW_OFFER_TOAST);
  assert.notEqual(h.toasts[0], SLOW_OFFER_TOAST, 'a fresh copy: a listener that writes to it must not hit the frozen constant');
  assert.equal(Object.isFrozen(h.toasts[0]), false);
  assert.equal(Object.isFrozen(h.toasts[0].action), false);
  assert.equal(h.toasts[0].action.id, SLOW_OFFER_ACTION_ID);
  assert.equal(h.toasts[0].action.label, 'Switch');
  assert.equal(h.offer.offered, true);
  h.play(300, 40);
  assert.equal(h.toasts.length, 1, 'once per session');
  assert.equal(h.settings.length, 0, 'the offer never applies anything on its own');
  assert.equal(h.state.settings.video.qualityPreset, 'medium');
  assert.equal(h.busToasts.length, 0, 'wall-clock notice: nothing on the bus, where sim listeners would hear it');
});

test('a healthy 60 fps flight never gets the offer', () => {
  const h = harness();
  h.play(300, 16.67);
  assert.equal(h.toasts.length, 0);
});

test('the software renderer is never offered (it has its own emergency profile and toast)', () => {
  for (const gpu of [
    { renderer: 'llvmpipe', vendor: 'Mesa', software: true, tier: 'software' },
    { renderer: 'SwiftShader', vendor: 'Google', software: false, tier: 'software' },
  ]) {
    const h = harness({ state: liveState({ render: { gpu } }) });
    h.play(120, 60);
    assert.equal(h.toasts.length, 0, gpu.renderer);
  }
});

test('a player already on a performance-class preset is not offered what they have', () => {
  for (const qualityPreset of ['low', 'integrated', 'igpu60']) {
    const h = harness({ state: liveState({ video: { qualityPreset } }) });
    h.play(120, 60);
    assert.equal(h.toasts.length, 0, qualityPreset);
  }
  const matching = liveState();
  applyPresetThroughSettings(matching, createBus(), 'low');
  assert.equal(alreadyOnPerformancePreset(matching.settings.video), true);
  assert.equal(alreadyOnPerformancePreset(liveState().settings.video), false);
  assert.equal(alreadyOnPerformancePreset(null), false);
});

test('a hand-tuned video block that already equals the preset is not offered it', () => {
  const state = liveState();
  applyPresetThroughSettings(state, createBus(), 'low');
  state.settings.video.qualityPreset = 'custom'; // a stray id, but every preset key matches low
  assert.equal(alreadyOnPerformancePreset(state.settings.video), true);
  const h = harness({ state });
  h.play(120, 60);
  assert.equal(h.toasts.length, 0);
});

test('only live flight past the opening counts', () => {
  for (const [label, state] of [
    ['paused', liveState({ mode: 'paused' })],
    ['menu', liveState({ mode: 'menu' })],
    ['docked', liveState({ mode: 'docked' })],
    ['loading', liveState({ mode: 'loading' })],
    ['no first playable frame', liveState({ render: { firstPlayableFrameAt: null } })],
  ]) {
    const h = harness({ state });
    h.play(120, 60);
    assert.equal(h.toasts.length, 0, label);
  }
  const hidden = harness({ isHidden: () => true });
  hidden.play(120, 60);
  assert.equal(hidden.toasts.length, 0, 'a hidden tab');
});

test('leaving flight mid-window restarts it', () => {
  const h = harness();
  h.play(20, 40);
  h.state.mode = 'paused';
  h.play(1, 40);
  h.state.mode = 'flight';
  h.play(20, 40);
  assert.equal(h.toasts.length, 0, 'the 20 s before the pause no longer count');
  h.play(10, 40);
  assert.equal(h.toasts.length, 1);
});

test('a quiet receipt lane holds the offer; the once-per-session latch is spent only when it shows', () => {
  let quiet = false;
  const h = harness({ canShow: () => !quiet });
  quiet = true; // a fight is on
  h.play(60, 40);
  assert.equal(h.toasts.length, 0);
  assert.equal(h.offer.offered, false, 'not spent while nobody could see it');
  quiet = false;
  h.play(3, 40);
  assert.equal(h.toasts.length, 1, 'the next bucket closing re-asks and shows it');
  h.play(120, 40);
  assert.equal(h.toasts.length, 1);
});

test('the default hold reads the HUD job the receipt lane itself consults', () => {
  const previous = globalThis.document;
  try {
    globalThis.document = { hidden: false, body: { dataset: { sfHudJob: 'fight' } } };
    const h = harness();
    h.play(60, 40);
    assert.equal(h.toasts.length, 0, 'fight');
    globalThis.document.body.dataset.sfHudJob = 'hurt';
    h.play(5, 40);
    assert.equal(h.toasts.length, 0, 'hurt');
    globalThis.document.body.dataset.sfHudJob = 'cruise';
    h.play(3, 40);
    assert.equal(h.toasts.length, 1, 'cruise');
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});

// A paused sim keeps state.mode 'flight' (Pause goes through timeEffects, so timeScale is 0), and a
// dock or an open screen keeps drawing frames too. Those frames say nothing about flight: they must
// restart the window, and the once-per-session offer must not fire hidden under an open screen.
test('a paused sim, a docked ship or an open screen never feeds the window or spends the offer', () => {
  const cases = [
    ['paused (timeScale 0)', (state) => { state.timeScale = 0; }, (state) => { state.timeScale = 1; }],
    ['docked', (state) => { state.ui.docked = true; }, (state) => { state.ui.docked = false; }],
    ['a screen is open', (state) => { state.ui.screenStack = ['pause']; }, (state) => { state.ui.screenStack = []; }],
    ['a fulfillment blackout', (state) => { state.ui.fulfillmentBlackoutActive = true; }, (state) => { state.ui.fulfillmentBlackoutActive = false; }],
  ];
  for (const [label, interrupt, resume] of cases) {
    const h = harness();
    interrupt(h.state);
    h.play(120, 60);
    assert.equal(h.toasts.length, 0, `${label}: nothing shown`);
    assert.equal(h.offer.offered, false, `${label}: the once-per-session offer is not spent unseen`);
    assert.equal(h.offer.watch.filledSeconds, 0, `${label}: the window stays empty`);
    resume(h.state);
    h.play(20, 60);
    assert.equal(h.toasts.length, 0, `${label}: the paused minutes do not count; the window starts over`);
    h.play(10, 60);
    assert.equal(h.toasts.length, 1, `${label}: a full fresh window of real flight still earns the offer`);
  }
});

test('opening Pause mid-window restarts it', () => {
  const h = harness();
  h.play(22, 40);
  h.state.timeScale = 0;
  h.play(1, 40);
  h.state.timeScale = 1;
  h.play(20, 40);
  assert.equal(h.toasts.length, 0, 'the flight before the pause no longer counts');
  h.play(10, 40);
  assert.equal(h.toasts.length, 1);
});

test('slow-motion is still flight: a scaled but running sim keeps counting', () => {
  const h = harness();
  h.state.timeScale = 0.4;
  h.play(30, 40);
  assert.equal(h.toasts.length, 1);
});

test('the default hold also reads the open-screen class that hides the receipt lane', () => {
  const previous = globalThis.document;
  try {
    const classes = new Set(['ui-modal-open']);
    globalThis.document = { hidden: false, body: { dataset: {}, classList: { contains: (c) => classes.has(c) } } };
    const h = harness();
    h.play(60, 40);
    assert.equal(h.toasts.length, 0, 'screen open: held');
    assert.equal(h.offer.offered, false, 'and not spent');
    classes.clear();
    h.play(3, 40);
    assert.equal(h.toasts.length, 1, 'screen closed: shown');
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});

test('a presenter that cannot show the receipt (lane not up) does not spend the offer', () => {
  const state = liveState();
  const shown = [];
  let ready = false;
  const offer = installSlowFrameOffer({
    state, bus: createBus(), canShow: () => true, isHidden: () => false,
    present: (spec) => { if (!ready) return false; shown.push(spec); return true; },
  });
  state.render.lastPresentDtMs = 40;
  for (let i = 0; i < 750; i++) offer.onPresented();
  assert.equal(shown.length, 0);
  assert.equal(offer.offered, false);
  ready = true;
  for (let i = 0; i < 100; i++) offer.onPresented();
  assert.equal(shown.length, 1);
  assert.equal(offer.offered, true);
});

// --- accepting --------------------------------------------------------------------------------

test('Switch applies High performance through settings:changed, one event per key that moved', () => {
  const h = harness();
  const before = { ...h.state.settings.video };
  const applied = h.offer.accept();
  assert.ok(applied);
  assert.equal(applied.preset, SLOW_OFFER_PRESET);
  assert.equal(h.state.settings.video.qualityPreset, 'low');
  assert.equal(matchingQualityPreset(h.state.settings.video), 'low');
  assert.equal(h.state.settings.video.renderScale, 0.75);
  assert.equal(h.state.settings.video.pixelRatioCap, 1);
  assert.deepEqual(h.settings.map((e) => e.key).sort(), [...applied.changed].sort());
  assert.ok(h.settings.length >= 4, 'the picture keys moved');
  for (const event of h.settings) {
    assert.equal(event.section, 'video');
    assert.equal(event.value, h.state.settings.video[event.key], event.key);
    assert.notEqual(event.value, before[event.key], `${event.key} was really changed`);
  }
  assert.deepEqual(h.toasts.at(-1), SLOW_OFFER_CONFIRM_TOAST);
  assert.equal(Object.isFrozen(h.toasts.at(-1)), false);
  assert.equal(h.busToasts.length, 0, 'the confirmation stays off the bus too');
  // A second press (or a second route to the same handler) is inert.
  const eventsAfter = h.settings.length;
  assert.equal(h.offer.accept(), null);
  assert.equal(h.settings.length, eventsAfter);
});

test('accepting from a state already off Balanced still lands exactly on the preset', () => {
  const state = liveState({ video: { qualityPreset: 'high', renderGraph: true, shadows: true, particleQuality: 'high', frameCap: 60 } });
  const h = harness({ state });
  h.offer.accept();
  assert.equal(matchingQualityPreset(state.settings.video), 'low');
  assert.equal(state.settings.video.frameCap, 0);
  assert.ok(h.settings.some((e) => e.key === 'frameCap' && e.value === 0), 'the frame cap change is published too');
});

test('the offer and its confirmation are both admitted by the receipt lane', () => {
  assert.equal(admitReceipt({ text: SLOW_OFFER_TOAST.text, kind: SLOW_OFFER_TOAST.kind }).admit, true);
  assert.equal(admitReceipt({ text: SLOW_OFFER_CONFIRM_TOAST.text, kind: SLOW_OFFER_CONFIRM_TOAST.kind }).admit, true);
  // The confirmation survives a fight; the offer does not, which is why the install holds it.
  assert.equal(admitReceipt({ text: SLOW_OFFER_CONFIRM_TOAST.text, kind: SLOW_OFFER_CONFIRM_TOAST.kind, combat: true }).admit, true);
  assert.equal(admitReceipt({ text: SLOW_OFFER_TOAST.text, kind: SLOW_OFFER_TOAST.kind, combat: true }).admit, false);
});

test('the confirmation names the label the player finds in Settings', () => {
  assert.match(SLOW_OFFER_CONFIRM_TOAST.text, /High performance/);
  assert.match(SLOW_OFFER_CONFIRM_TOAST.text, /Settings → Video/);
  assert.match(SLOW_OFFER_TOAST.action.ariaLabel, /High performance/);
});

test('the toast payload is plain data, so it can ride the bus across the sim lane', () => {
  const round = JSON.parse(JSON.stringify(SLOW_OFFER_TOAST));
  assert.deepEqual(round, JSON.parse(JSON.stringify(round)));
  assert.equal(typeof SLOW_OFFER_TOAST.action.id, 'string');
  for (const value of Object.values(SLOW_OFFER_TOAST.action)) assert.notEqual(typeof value, 'function');
});

test('main.js feeds the offer from the presentation runner and registers the button', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /from '\.\/ui\/toastAction\.js'/);
  assert.match(main, /installSlowFrameOffer\(\{ state, bus \}\)/);
  assert.match(main, /registerToastAction\(SLOW_OFFER_ACTION_ID,\s*\(\)\s*=>\s*slowFrameOffer\.accept\(\)\)/);
  assert.match(main, /onPresented\(\)\s*\{[^}]*slowFrameOffer\.onPresented\(\)/);
});

test('the hot path allocates nothing: the detector keeps fixed typed arrays only', () => {
  const src = readFileSync(new URL('../src/render/slowFrameOffer.js', import.meta.url), 'utf8');
  const sampleStart = src.indexOf('sample(dtMs, eligible) {');
  const sampleEnd = src.indexOf('    reset,', sampleStart);
  assert.ok(sampleStart > 0 && sampleEnd > sampleStart, 'located the sample() body');
  const sample = src.slice(sampleStart, sampleEnd);
  assert.ok(sample.length > 300 && sample.length < 2500, `sample() body is ${sample.length} chars, not a stray slice`);
  assert.match(sample, /bucketFrames\+\+/, 'the slice really is the per-frame body');
  assert.doesNotMatch(sample, /new |\[\s*\]|\.push\(|\.map\(|\.slice\(|=>/, 'no per-frame allocation inside sample()');
  const presentedStart = src.indexOf('function onPresented() {');
  const presentedEnd = src.indexOf('function accept() {', presentedStart);
  assert.ok(presentedStart > 0 && presentedEnd > presentedStart, 'located the onPresented() body');
  const onPresented = src.slice(presentedStart, presentedEnd);
  assert.ok(onPresented.length > 200 && onPresented.length < 2500, `onPresented() body is ${onPresented.length} chars`);
  assert.match(onPresented, /detector\.sample\(/, 'the slice really is the per-present body');
  // The toast copy is allocated once, at the moment of the offer, not per frame: it sits after the
  // detector's verdict, so it is allowed; nothing before that line may allocate.
  const beforeVerdict = onPresented.slice(0, onPresented.indexOf('if (!canShow()'));
  assert.doesNotMatch(beforeVerdict, /new |\.push\(|\.map\(|\.slice\(|\{\s*\.\.\./, 'no allocation before the verdict');
  // And the allocation-free claim covers the eligibility check it calls every present.
  const eligibleStart = src.indexOf('function eligible() {');
  const eligibleBody = src.slice(eligibleStart, src.indexOf('function onPresented() {', eligibleStart));
  assert.ok(eligibleBody.length > 300, 'located eligible()');
  assert.doesNotMatch(eligibleBody, /new |\.push\(|\.map\(|\.slice\(|\{\s*\.\.\./, 'no allocation in eligible()');
});
