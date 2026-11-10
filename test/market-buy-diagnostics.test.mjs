import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { installMarketBuyObservation } from '../scripts/lib/marketBuyDiagnostics.mjs';

function harness(options = {}) {
  const listeners = new Map(), mutations = [], timings = [];
  let now = 100, removed = 0, failRead = false;
  const purse = { textContent: '5,000' }, toastRoot = { textContent: '' };
  const state = { tick: 2, simTime: 0.1, ui: { dockedStationId: 'yard' },
    player: { credits: 5000, cargo: { capVolume: 20, usedVolume: 0, items: {} } },
    economy: { markets: { yard: { ore: { stock: 10 } } } } };
  const market = { querySelector(selector) {
    if (selector.includes('is-active')) return { getAttribute: () => 'ore' };
    if (selector.includes('is-on')) return { getAttribute: () => 'buy' };
    if (selector.includes('sx-qty')) return { value: '1' };
    if (selector.includes('sx-trade__go')) return { disabled: false, textContent: 'BUY' };
    return null;
  } };
  const document = { visibilityState: 'visible', querySelector(selector) {
    if (failRead) throw new Error('read failed');
    if (selector.endsWith('.sx-mkt')) return market;
    if (selector.includes('sxb-purse')) return purse;
    if (selector === '#toasts') return toastRoot;
    return null;
  }, querySelectorAll() { return options.toasts || []; } };
  const context = { window: { SF: { state, bus: { on(name, callback) {
    listeners.set(name, callback);
    return () => { listeners.delete(name); removed++; };
  } } } }, document, performance: { now: () => now } };
  if (!options.noObservers) {
    context.MutationObserver = class {
      constructor(callback) { this.callback = callback; this.disconnected = false; mutations.push(this); }
      observe(root, config) { this.root = root; this.config = config; if (options.failObserve) throw new Error('observe failed'); }
      disconnect() { this.disconnected = true; }
    };
    context.PerformanceObserver = class {
      constructor(callback) { this.callback = callback; this.disconnected = false; timings.push(this); }
      observe(config) { this.config = config; }
      disconnect() { this.disconnected = true; }
    };
  }
  const create = () => vm.runInNewContext(`(${installMarketBuyObservation.toString()})()`, context);
  return { state, context, purse, toastRoot, listeners, mutations, timings, create,
    setNow: value => { now = value; }, failRead: () => { failRead = true; }, removed: () => removed,
    plain: value => JSON.parse(JSON.stringify(value)) };
}

test('captures actual state and visible purse before/after without changing them', () => {
  const h = harness(), observer = h.create();
  h.state.player.credits = 4970; h.state.player.cargo.items.ore = 1; h.purse.textContent = '4,970';
  h.setNow(180); h.listeners.get('economy:tradeCompleted')({ total: 30, quantity: 1 });
  const result = observer.finish({ baselineCredits: 5000, outcome: 'rejected', waitEndedMs: 15001 });
  assert.equal(result.before.credits, 5000); assert.equal(result.before.visibleCredits, '5,000');
  assert.equal(result.after.credits, 4970); assert.equal(result.after.visibleCredits, '4,970');
  assert.equal(result.events[0].elapsedMs, 80); assert.equal(result.hostTiming.outcome, 'rejected');
  assert.equal(h.state.player.credits, 4970); assert.equal(h.state.player.cargo.items.ore, 1);
  assert.match(result.clockNote, /not proof of paint/);
});

test('records stale visible purse separately from a settled transaction', () => {
  const h = harness(), observer = h.create(); h.state.player.credits = 4990;
  h.listeners.get('economy:tradeCompleted')({ total: 10 });
  const result = observer.finish();
  assert.equal(result.after.credits, 4990); assert.equal(result.after.visibleCredits, '5,000');
});

test('state replacement is evidence, not a repaired or accepted predicate', () => {
  const h = harness(), observer = h.create();
  h.context.window.SF.state = { ...h.state, player: { ...h.state.player, credits: 4900 } };
  const result = observer.finish();
  assert.equal(result.before.sameStateObject, true); assert.equal(result.after.sameStateObject, false);
  assert.equal(h.state.player.credits, 5000);
});

test('bounds event retention, scalar payloads and text lengths', () => {
  const h = harness(), observer = h.create();
  const payload = { text: 'x'.repeat(1000), nested: { secret: 'not copied' }, total: Infinity, quantity: 1 };
  for (let i = 0; i < 40; i++) h.listeners.get('toast')(payload);
  payload.quantity = 9;
  const result = observer.finish();
  assert.equal(result.events.length, 32); assert.equal(result.dropped, 8);
  assert.equal(result.events[0].payload.text.length, 256); assert.equal(result.events[0].payload.quantity, 1);
  assert.equal(result.events[0].payload.nested, undefined); assert.equal(result.events[0].payload.total, undefined);
});

test('records purse mutations without layout reads or polling', () => {
  const h = harness(), observer = h.create();
  h.purse.textContent = '4,999'; h.setNow(150); h.mutations[0].callback();
  const event = observer.finish().events[0];
  assert.equal(event.event, 'credits:dom'); assert.equal(event.visibleCredits, '4,999');
  assert.equal(event.elapsedMs, 50);
});

test('long-task evidence is bounded and uses a separate browser clock', () => {
  const h = harness(), observer = h.create();
  assert.deepEqual(h.plain(h.timings[0].config), { type: 'longtask', buffered: false });
  h.timings[0].callback({ getEntries: () => Array.from({ length: 30 }, (_, i) => ({ startTime: 101 + i, duration: 50 })) });
  const result = observer.finish();
  assert.equal(result.longTasks.length, 16); assert.equal(result.longTasks[0].elapsedStartMs, 1);
});

test('finish releases all subscriptions and observers exactly once', () => {
  const h = harness(), observer = h.create(), callback = h.listeners.get('toast');
  const result = observer.finish(); callback({ text: 'late' });
  assert.equal(result.events.length, 0); assert.equal(h.removed(), 4); assert.equal(h.listeners.size, 0);
  assert.ok([...h.mutations, ...h.timings].every(item => item.disconnected));
  assert.equal(observer.finish(), null); assert.equal(h.removed(), 4);
});

test('snapshot failure still releases observation resources', () => {
  const h = harness(), observer = h.create(); h.failRead();
  assert.throws(() => observer.finish(), /read failed/); assert.equal(h.removed(), 4);
  assert.ok([...h.mutations, ...h.timings].every(item => item.disconnected));
});

test('partially installed observation cleans up on installation failure', () => {
  const h = harness({ failObserve: true });
  assert.throws(() => h.create(), /observe failed/); assert.equal(h.removed(), 4);
  assert.ok(h.mutations.every(item => item.disconnected));
});

test('missing optional observers does not change snapshots or state', () => {
  const h = harness({ noObservers: true }), observer = h.create();
  const result = observer.finish(); assert.equal(result.after.credits, 5000); assert.equal(result.longTasks.length, 0);
});

test('toast snapshots are bounded', () => {
  const h = harness({ toasts: Array.from({ length: 25 }, () => ({ textContent: 't'.repeat(500) })) });
  const result = h.create().finish();
  assert.equal(result.after.toasts.length, 8); assert.ok(result.after.toasts.every(value => value.length === 256));
});

test('browser acceptance predicate, timeout and failure remain unchanged', () => {
  const script = readFileSync(new URL('../scripts/check-market-first-loop-runtime.mjs', import.meta.url), 'utf8');
  assert.match(script, /const DOCK_TIMEOUT_MS = 15000;/);
  assert.ok(script.includes('page.waitForFunction((prev) => window.SF.state.player.credits !== prev, c0, { timeout: DOCK_TIMEOUT_MS })'));
  assert.ok(script.includes("throw new Error('a Market BUY should move the player\\'s credits (trade must actually execute)')"));
  assert.match(script, /assert\.ok\(c1 < c0/);
  assert.ok(script.includes("name: String(error?.name || 'Error').slice(0, 80)"));
  assert.ok(script.includes('message: String(error?.message || error).slice(0, 512)'));
  assert.equal(script.match(/endMarketBuyObservation\(buyObservation, buyTiming\)/g)?.length, 1);
});
