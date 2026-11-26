// SIM-RATE-TIERS-BREADTH — the bus collects presentation-only emits inside the sim-step
// window and delivers them once at drainStepDeferred (after the last system, before the
// lifetime sweep): the physics:impact receipt pattern at bus level. Contracts under test:
// emit order, same-step vs out-of-step delivery, the player-bypass, the per-tick cap with
// carry-over, and that 'toast' stays synchronous (a sim-side listener exists).
// Run: node --test test/event-bus-step-deferral.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createBus,
  STEP_DEFERRED_EVENTS,
  STEP_DEFERRED_DRAIN_CAP,
} from '../src/core/eventBus.js';

test('deferred-set emits inside a step queue and drain once, in emit order', () => {
  const bus = createBus();
  const seen = [];
  bus.on('audio:cue', (p) => seen.push(`cue:${p.id}`));
  bus.on('comms:log', (p) => seen.push(`log:${p.from}`));
  bus.on('comms:popup', (p) => seen.push(`popup:${p.text}`));
  bus.on('presentation:caption', (p) => seen.push(`caption:${p.text}`));

  bus.beginStep('player-1');
  // Payload shapes copied from real emitters (alienEcology/asteroidSites/voice fallbacks).
  bus.emit('audio:cue', { id: 'scan_resolve', position: { x: 12, z: -4 } });
  bus.emit('comms:log', { from: 'Field contact', kind: 'ecology', text: 'first' });
  bus.emit('comms:popup', { text: 'popup one', kind: 'info' });
  bus.emit('presentation:caption', { text: 'caption', ttl: 2 });
  assert.deepEqual(seen, [], 'nothing delivers mid-step');
  assert.equal(bus.pendingStepDeferredCount(), 4);

  bus.drainStepDeferred();
  assert.deepEqual(seen, ['cue:scan_resolve', 'log:Field contact', 'popup:popup one', 'caption:caption'],
    'the drain delivers every collected emit in order');
  bus.endStep();
});

test('emits outside the step window stay synchronous', () => {
  const bus = createBus();
  const seen = [];
  bus.on('comms:popup', (p) => seen.push(p.text));
  bus.emit('comms:popup', { text: 'outside' });
  assert.deepEqual(seen, ['outside']);
  assert.equal(bus.pendingStepDeferredCount(), 0);
});

test("a payload naming the live player never defers ('touching the player goes now')", () => {
  const bus = createBus();
  const seen = [];
  bus.on('audio:cue', (p) => seen.push(p.id));
  bus.beginStep('player-9');
  bus.emit('audio:cue', { id: 'ambient', position: { x: 0, z: 0 } });
  bus.emit('audio:cue', { id: 'player_cue', entityId: 'player-9' });
  assert.deepEqual(seen, ['player_cue'], 'the player-named cue delivered inline');
  assert.equal(bus.pendingStepDeferredCount(), 1);
  bus.drainStepDeferred();
  assert.deepEqual(seen, ['player_cue', 'ambient']);
  bus.endStep();
});

test("'toast' stays synchronous even inside the step window (sim listener exists)", () => {
  const bus = createBus();
  const seen = [];
  bus.on('toast', (p) => seen.push(p.text));
  bus.beginStep('player-1');
  bus.emit('toast', { text: 'Knitbots patching the hull', kind: 'info', ttl: 1.6 });
  assert.deepEqual(seen, ['Knitbots patching the hull']);
  assert.equal(bus.pendingStepDeferredCount(), 0);
  bus.endStep();
});

test('the per-tick cap carries overflow in order to the next drain', () => {
  const bus = createBus();
  const seen = [];
  bus.on('audio:cue', (p) => seen.push(p.id));
  bus.beginStep('player-1');
  const total = STEP_DEFERRED_DRAIN_CAP + 5;
  for (let i = 0; i < total; i++) bus.emit('audio:cue', { id: `c${i}` });
  assert.equal(bus.drainStepDeferred(), STEP_DEFERRED_DRAIN_CAP);
  assert.equal(bus.pendingStepDeferredCount(), 5);
  assert.equal(bus.drainStepDeferred(), 5, 'the carry delivers next drain, order kept');
  for (let i = 0; i < total; i++) assert.equal(seen[i], `c${i}`);
  bus.endStep();
});

test('a listener emit of a deferred name inside the drain joins the same drain', () => {
  const bus = createBus();
  const seen = [];
  bus.on('comms:log', (p) => {
    seen.push(p.from);
    if (p.from === 'first') bus.emit('comms:popup', { text: 'chained' });
  });
  bus.on('comms:popup', (p) => seen.push(p.text));
  bus.beginStep('player-1');
  bus.emit('comms:log', { from: 'first', text: 'x' });
  bus.drainStepDeferred();
  assert.deepEqual(seen, ['first', 'chained']);
  bus.endStep();
});

test('endStep cannot strand queued items (aborted step)', () => {
  const bus = createBus();
  const seen = [];
  bus.on('comms:popup', (p) => seen.push(p.text));
  bus.beginStep('player-1');
  bus.emit('comms:popup', { text: 'pending' });
  bus.endStep();
  assert.deepEqual(seen, ['pending']);
  assert.equal(bus.pendingStepDeferredCount(), 0);
});

test('economy events are not in the deferred set (separate intents-queue change)', () => {
  assert.equal(STEP_DEFERRED_EVENTS.has('economy:grantCredits'), false);
  assert.equal(STEP_DEFERRED_EVENTS.has('economy:chargeCredits'), false);
  assert.equal(STEP_DEFERRED_EVENTS.has('toast'), false);
});
