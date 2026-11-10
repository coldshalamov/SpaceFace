import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { attemptIndustryBuild, createIndustryScreen } from '../src/ui/station/screens/industry.js';
import { fakeDom } from './helpers/fake-dom.mjs';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Mount the real screen and its event handlers. Only the decorative production-chain SVG is
// omitted; the rendered Fabricate button, request, repaint and retirement are production code.
function harness(t, build) {
  let screen;
  const names = ['document', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'];
  const previous = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  t.after(() => {
    screen?.dispose();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  const doc = fakeDom();
  doc.documentElement = doc._make('html');
  doc.documentElement.classList.add('sf-reduce-motion');
  const root = doc._make('div');
  const list = doc._make('div');
  const stage = doc._make('div');
  const marker = doc._make('i');
  const key = doc._make('button');
  const ring = doc._make('span');
  root.querySelector = (selector) => selector === '.sx-ind__list' ? list : selector === '.sx-ind__stage' ? stage : null;
  list.querySelector = (selector) => selector === ':scope > .orr-extent' ? marker : null;
  key.querySelector = (selector) => selector === '.dp-holdring' ? ring : null;
  key.closest = (selector) => selector.includes('.sx-fab-build') || selector === '[data-build]' ? key : null;
  stage.querySelector = (selector) => selector.startsWith('.sx-fab-build') && !key.disabled ? key : null;
  let renders = 0;
  Object.defineProperty(stage, 'innerHTML', {
    set(html) {
      renders += 1;
      const button = html.match(/<button[^>]+data-build="([^"]+)"[^>]*>/);
      key.disabled = !button || /\sdisabled(?:\s|>)/.test(button[0]);
      if (button) key.setAttribute('data-build', button[1]);
    },
  });
  doc.createElement = () => root;
  const timers = new Map();
  let timerSeq = 0;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => 10_000 } });
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: undefined });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, value() {} });
  Object.defineProperty(globalThis, 'setTimeout', { configurable: true, value(fn) { timers.set(++timerSeq, fn); return timerSeq; } });
  Object.defineProperty(globalThis, 'clearTimeout', { configurable: true, value(id) { timers.delete(id); } });
  const bus = createBus();
  const events = [];
  bus.on('audio:cue', (payload) => events.push({ name: 'audio:cue', ...payload }));
  bus.on('toast', (payload) => events.push({ name: 'toast', ...payload }));
  const ctx = {
    state: {
      player: {
        researchedNodes: [], moduleInventory: [], ownedShips: [],
        cargo: { items: { cmdty_ore_iron: 30, cmdty_ore_titanium: 10 } },
      },
      ui: { docked: true, dockedStationId: 'station_ceres' },
      crafting: { queues: {} },
    },
    station: { type: 'refinery' },
    crafting: { build }, bus,
  };
  screen = createIndustryScreen(ctx);
  screen.onShow();
  return {
    screen, events, timers, bus,
    get renders() { return renders; },
    click() { for (const listener of stage.listeners.click || []) listener({ target: key }); },
    flushTimers() { const pending = [...timers.values()]; timers.clear(); for (const fn of pending) fn(); },
  };
}

const flush = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };

test('a rejected worker fabrication request resolves as a refusal', async () => {
  assert.equal(await attemptIndustryBuild({
    crafting: { build: () => Promise.reject(new Error('worker retired')) },
    bpId: 'bp_refine_metals', stationId: 'station_ceres',
  }), false);
});

test('a worker fabrication interruption restores Fabricate and explains how to recover', async (t) => {
  let calls = 0;
  const h = harness(t, () => ++calls === 1 ? Promise.reject(new Error('RPC timed out')) : Promise.resolve(true));
  h.click();
  await flush();
  assert.equal(h.events.some((event) => event.id === 'ui_accept'), false);
  assert.ok(h.events.some((event) => event.name === 'toast' && /queue.*try|queue.*retry/i.test(event.text)));
  assert.equal(h.timers.size, 0, 'a rejected request never starts the product landing');
  h.click();
  await flush();
  assert.equal(calls, 2, 'the next activation reaches the worker instead of staying held');
  assert.equal(h.events.filter((event) => event.id === 'ui_accept').length, 1);
  h.flushTimers();
});

for (const retirement of ['onHide', 'dispose']) {
  test(`an accepted worker fabrication outliving ${retirement} cannot repaint or schedule obsolete work`, async (t) => {
    const pending = deferred();
    let grants = 0;
    const h = harness(t, () => pending.promise.then(() => { grants += 1; return true; }));
    h.click();
    assert.equal(typeof h.screen[retirement], 'function');
    h.screen[retirement]();
    const rendersAtRetirement = h.renders;
    pending.resolve();
    await flush();
    assert.equal(grants, 1, 'retiring the view preserves the authoritative result');
    assert.equal(h.renders, rendersAtRetirement, 'the retired screen is not rebuilt');
    assert.equal(h.events.some((event) => event.id === 'ui_accept'), false);
    assert.equal(h.timers.size, 0, 'the retired callback cannot create a landing timer');
  });
}

test('leaving Industry cancels an already scheduled product landing', async (t) => {
  const h = harness(t, () => Promise.resolve(true));
  h.click();
  await flush();
  assert.equal(h.timers.size, 1);
  h.screen.onHide();
  assert.equal(h.timers.size, 0);
  const rendersAtHide = h.renders;
  h.flushTimers();
  assert.equal(h.renders, rendersAtHide);
  h.screen.onShow();
  h.click();
  await flush();
  assert.equal(h.events.filter((event) => event.id === 'ui_accept').length, 2, 'reopening supports a fresh build');
  h.flushTimers();
});

test('reopening Industry gives the new request ownership while the older build still completes', async (t) => {
  const old = deferred(), current = deferred();
  let calls = 0, grants = 0;
  const h = harness(t, () => (++calls === 1 ? old : current).promise.then(() => { grants += 1; return true; }));
  h.click();
  h.screen.onHide();
  const rendersAtHide = h.renders;
  h.bus.emit('craft:queueChanged', { stationId: 'station_ceres', active: true });
  assert.equal(h.renders, rendersAtHide, 'hidden stations do no fabrication repaint work');
  h.screen.onShow();
  h.click();
  old.resolve();
  await flush();
  assert.equal(grants, 1);
  assert.equal(h.events.some((event) => event.id === 'ui_accept'), false, 'the old result cannot claim the new view');
  assert.equal(h.timers.size, 0);
  current.resolve();
  await flush();
  assert.equal(grants, 2);
  assert.equal(h.events.filter((event) => event.id === 'ui_accept').length, 1);
  assert.equal(h.timers.size, 1);
  h.flushTimers();
});
