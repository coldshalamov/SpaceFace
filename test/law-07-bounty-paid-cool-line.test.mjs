// LAW-07 — paying a bounty says how much heat it bought off. `bounty:cleared` used to cool the
// ledger silently: the payer saw credits leave but the hunt gave no word back. heat.js now emits
// `bounty:cooled` with the MEASURED delta (never the theoretical credit — a sealed run or a
// clamped write must not make the line claim heat the ledger never lost), and barkDirector
// answers with one comms line naming the cooled percentage. Cooling rate and cap unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';

import { heat, BOUNTY_PAID_COOL_PER_CR, BOUNTY_PAID_COOL_MAX } from '../src/systems/heat.js';
import { barkDirector } from '../src/systems/barkDirector.js';

function makeBus() {
  const handlers = new Map();
  const log = [];
  return {
    emitLog: log,
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off(evt, fn) {
      const list = handlers.get(evt) || [];
      handlers.set(evt, list.filter((h) => h !== fn));
    },
    emit(evt, payload) {
      log.push({ evt, payload });
      for (const fn of handlers.get(evt) || []) fn(payload);
      return true;
    },
  };
}

function makeState(heatValue = 0.8) {
  return {
    meta: { seed: 4242 },
    simTime: 50,
    tick: 100,
    mode: 'flight',
    playerId: 'player',
    player: { credits: 50000, heat: heatValue },
    entities: new Map(),
    ui: {},
  };
}

function boot(state) {
  const bus = makeBus();
  const heatSys = Object.create(heat);
  heatSys.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  const barks = Object.create(barkDirector);
  barks.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  return { bus, heatSys, barks };
}

const cooledEvents = (bus) => bus.emitLog.filter((e) => e.evt === 'bounty:cooled');
const coolLines = (bus) => bus.emitLog.filter((e) => e.evt === 'comms:popup' && e.payload.category === 'law');

test('a fat payoff cools at the cap and the comms line names it', () => {
  const state = makeState(0.8);
  const { bus } = boot(state);
  bus.emit('bounty:cleared', { amount: 5000, source: 'economy:payBounty' });
  assert.ok(Math.abs(state.player.heat - 0.3) < 1e-9, 'cap cools 0.5 from 0.8');
  const events = cooledEvents(bus);
  assert.equal(events.length, 1, 'one measured cool receipt');
  assert.ok(Math.abs(events[0].payload.cooled - BOUNTY_PAID_COOL_MAX) < 1e-6, 'cooled pins the cap');
  assert.equal(events[0].payload.cap, BOUNTY_PAID_COOL_MAX);
  assert.equal(events[0].payload.amount, 5000);
  const lines = coolLines(bus);
  assert.equal(lines.length, 1, 'one comms line');
  assert.equal(lines[0].payload.sender, 'BOUNTY DESK');
  assert.match(lines[0].payload.text, /50%/, 'the line names the cooled amount');
});

test('a smaller payoff reports the real delta, not the cap', () => {
  const state = makeState(0.6);
  const { bus } = boot(state);
  bus.emit('bounty:cleared', { amount: 1000, source: 'economy:payBounty' });
  assert.ok(Math.abs(state.player.heat - 0.2) < 1e-9);
  const events = cooledEvents(bus);
  assert.equal(events.length, 1);
  assert.ok(Math.abs(events[0].payload.cooled - 1000 * BOUNTY_PAID_COOL_PER_CR) < 1e-6,
    'cooled pins the uncapped credit');
  const lines = coolLines(bus);
  assert.equal(lines.length, 1);
  assert.match(lines[0].payload.text, /40%/, 'line names the uncapped cool');
});

test('a payoff at zero heat stays silent', () => {
  const state = makeState(0);
  const { bus } = boot(state);
  bus.emit('bounty:cleared', { amount: 5000, source: 'economy:payBounty' });
  assert.equal(cooledEvents(bus).length, 0, 'no measured cool to report');
  assert.equal(coolLines(bus).length, 0, 'no comms line for nothing bought');
});

test('the line reports the measured write — a sealed run claims nothing', () => {
  const state = makeState(0.8);
  state.run = { kind: 'survival', phase: 'wave' };
  const { bus } = boot(state);
  bus.emit('bounty:cleared', { amount: 5000, source: 'economy:payBounty' });
  assert.equal(state.player.heat, 0.8, 'sealed run keeps campaign heat untouched');
  assert.equal(cooledEvents(bus).length, 0, 'refused write emits no receipt');
  assert.equal(coolLines(bus).length, 0, 'no false cool line');
});

test('a same-tick duplicate receipt produces one line', () => {
  const state = makeState(0.8);
  const { bus } = boot(state);
  bus.emit('bounty:cooled', { amount: 5000, cooled: 0.5, before: 0.8, after: 0.3, cap: 0.5 });
  bus.emit('bounty:cooled', { amount: 5000, cooled: 0.5, before: 0.8, after: 0.3, cap: 0.5 });
  assert.equal(coolLines(bus).length, 1, 'identical same-tick receipts collapse');
});

test('the heat writer never touches credits and destroy removes the listener', () => {
  const state = makeState(0.8);
  const { bus, barks } = boot(state);
  bus.emit('bounty:cleared', { amount: 1000, source: 'economy:payBounty' });
  assert.equal(state.player.credits, 50000, 'heat owns heat — economy already charged');
  assert.equal(coolLines(bus).length, 1);
  barks.destroy();
  bus.emit('bounty:cooled', { amount: 5000, cooled: 0.5, before: 0.3, after: 0 });
  assert.equal(coolLines(bus).length, 1, 'no listener survives destroy');
});
