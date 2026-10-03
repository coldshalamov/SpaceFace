// FB-046 — the session sinks read as ledger entries and roll up into "where the money went".
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { economy, fileSessionSink, SESSION_SINK_LEDGER_MAX } from '../src/systems/economy.js';
import { buildShipLedger, sessionSinkRollup } from '../src/systems/shipLedger.js';

function boot() {
  const sim = createSimulation({ seed: 4242, systems: [economy] });
  const { state } = sim;
  state.mode = 'flight';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 8 });
  state.playerId = player.id;
  return { sim, state };
}

const TEN_SINKS = [
  { kind: 'repair', amount: 400, cause: 'hull scar' },
  { kind: 'repair', amount: 260, cause: 'hull scar' },
  { kind: 'fine', amount: 300, cause: 'restricted cargo' },
  { kind: 'insurance', amount: 120, cause: 'hull deductible' },
  { kind: 'restitution', amount: 80, cause: 'spilled cargo' },
  { kind: 'impound', amount: 500, cause: 'wanted hull' },
  { kind: 'toll', amount: 40, cause: 'berth plate' },
  { kind: 'toll', amount: 55, cause: 'berth plate' },
  { kind: 'fine', amount: 150, cause: 'restricted cargo' },
  { kind: 'repair', amount: 220, cause: 'hull scar' },
];

test('ten scripted sinks produce ten ledger entries naming what was paid for', () => {
  const { state } = boot();
  for (const sink of TEN_SINKS) fileSessionSink(state, sink);
  const page = buildShipLedger(state, { page: 0, pageSize: 24 });
  const sinkEntries = page.entries.filter((e) => e.sourceKind === 'player.sessionSinks');
  assert.equal(sinkEntries.length, 10, 'every sink files a ledger row');
  assert.ok(sinkEntries.every((e) => /^Paid \S+ cr for /.test(e.text)),
    `entries name the debit: ${sinkEntries[0] && sinkEntries[0].text}`);
  assert.ok(sinkEntries.some((e) => e.text.includes('a repair')), 'kind is phrased, not a raw id');
});

test('the roll-up totals per kind from the same records', () => {
  const { state } = boot();
  for (const sink of TEN_SINKS) fileSessionSink(state, sink);
  const roll = sessionSinkRollup(state);
  assert.equal(roll.count, 10);
  assert.equal(roll.total, 2125);
  const repair = roll.byKind.find((k) => k.kind === 'repair');
  const fine = roll.byKind.find((k) => k.kind === 'fine');
  const toll = roll.byKind.find((k) => k.kind === 'toll');
  assert.equal(repair.amount, 880);
  assert.equal(repair.count, 3);
  assert.equal(fine.amount, 450);
  assert.equal(toll.amount, 95);
  // biggest first
  assert.equal(roll.byKind[0].kind, 'repair');
});

test('the 48-cap still binds; an empty record reports nothing', () => {
  const { state } = boot();
  assert.equal(sessionSinkRollup(state), null);
  for (let i = 0; i < SESSION_SINK_LEDGER_MAX + 12; i++) {
    fileSessionSink(state, { kind: 'toll', amount: 10, cause: 'berth plate' });
  }
  assert.equal(state.player.sessionSinks.length, SESSION_SINK_LEDGER_MAX);
  const roll = sessionSinkRollup(state);
  assert.equal(roll.count, SESSION_SINK_LEDGER_MAX);
  assert.equal(roll.total, SESSION_SINK_LEDGER_MAX * 10);
});
