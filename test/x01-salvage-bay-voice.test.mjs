// X-01 (row 559): the salvage bay loop already pays — the first fill and the first cash-in now
// say so once each, the restricted toast stops pointing at an unreachable black market, and the
// 344 defended comms tail names the bay. Copy-only: no numbers move.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { cargo } from '../src/systems/cargo.js';
import { onboarding } from '../src/systems/onboarding.js';
import { addSalvage } from '../src/systems/cargo.js';
import { firstUseLine } from '../src/ui/hudAttention.js';

const SEED = 4242;

function rig() {
  const state = createGameState(SEED);
  COMBAT_FLAGS.salvageBay = true;
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  cargo.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  onboarding.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  const firstUse = () => emitted.filter((e) => e.event === 'hud:firstUse');
  const toasts = () => emitted.filter((e) => e.event === 'toast');
  return { state, bus, emitted, firstUse, toasts };
}

// The bay cash-in is flag-gated in production; restore the flag after each test run.
test.afterEach(() => { COMBAT_FLAGS.salvageBay = false; });

function rail(state, active) {
  state.onboarding = { active, finished: !active };
}

test('X-01 first bay fill speaks once', () => {
  const h = rig();
  rail(h.state, false);
  addSalvage(h.state, 'cmdty_scrap_metal', 4);
  const hints = h.firstUse().filter((e) => e.payload.verbId === 'firstSalvageBay');
  assert.equal(hints.length, 1, 'one firstSalvageBay hint on the first fill');
  assert.equal(hints[0].payload.text, firstUseLine('firstSalvageBay'));
  assert.equal(h.state.player.hints.firstSalvageBay, true);
  addSalvage(h.state, 'cmdty_scrap_metal', 4);
  assert.equal(h.firstUse().filter((e) => e.payload.verbId === 'firstSalvageBay').length, 1,
    'the second fill stays silent');
});

test('X-01 a live rail defers the fill hint to the next post-rail fill', () => {
  const h = rig();
  rail(h.state, true);
  addSalvage(h.state, 'cmdty_scrap_metal', 4);
  assert.equal(h.firstUse().length, 0, 'the rail owns the voice');
  assert.equal(h.state.player.hints && h.state.player.hints.firstSalvageBay, undefined,
    'no stamp while deferred');
  rail(h.state, false);
  addSalvage(h.state, 'cmdty_scrap_metal', 4);
  const hints = h.firstUse().filter((e) => e.payload.verbId === 'firstSalvageBay');
  assert.equal(hints.length, 1, 'the deferred lesson speaks once the rail is done');
});

test('X-01 the first dock cash-in speaks once', () => {
  const h = rig();
  rail(h.state, false);
  addSalvage(h.state, 'cmdty_scrap_metal', 4);
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  const cashed = h.firstUse().filter((e) => e.payload.verbId === 'firstSalvageCashIn');
  assert.equal(cashed.length, 1, 'firstSalvageCashIn on the first payout');
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.firstUse().filter((e) => e.payload.verbId === 'firstSalvageCashIn').length, 1,
    'the second dock stays silent');
  const h2 = rig();
  rail(h2.state, false);
  h2.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h2.firstUse().filter((e) => e.payload.verbId === 'firstSalvageCashIn').length, 0,
    'an empty bay earns no cash-in line');
});

test('X-01 restricted salvage toast names the lawful truth, not a black market', () => {
  const h = rig();
  rail(h.state, false);
  addSalvage(h.state, 'cmdty_munitions', 2);
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  const warn = h.toasts().map((e) => e.payload.text).find((t) => /Restricted salvage/.test(t));
  assert.ok(warn, 'the restricted toast fires');
  assert.match(warn, /Lawful docks won't buy it/);
  assert.doesNotMatch(warn, /black market/i);
});

test('X-01 the 344 defended comms keeps the pinned line and names the bay', () => {
  const src = readFileSync('src/data/encounters/344-opening-hauler-raid.js', 'utf8');
  assert.match(src, /Hazard pay transferred\./);
  assert.match(src, /in your bay/);
});
