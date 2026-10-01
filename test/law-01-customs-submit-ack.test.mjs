// LAW-01 — submitting to a customs scan is acknowledged by the law. The customs deck emitted
// `customs:submit` into a void (zero listeners): the player clicked SUBMIT and nothing answered.
// lawSecurity now owns the seam: one lawful bark plus one compliance receipt on the incident
// ledger, and the receipt paints the law card because it carries no incidentId. The handler
// never charges, re-scans, or moves standing — acknowledgment only.
import test from 'node:test';
import assert from 'node:assert/strict';

import { lawSecurity } from '../src/systems/lawSecurity.js';
import { customsPrompt } from '../src/ui/customsPrompt.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';

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

function makeState() {
  return {
    meta: { seed: 4242 },
    simTime: 50,
    tick: 100,
    mode: 'flight',
    playerId: 'player',
    player: { credits: 5000 },
    ui: {},
  };
}

function bootLaw(state) {
  const bus = makeBus();
  const law = Object.create(lawSecurity);
  law.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  return { bus, law };
}

test('customs:submit produces one lawful bark and one compliance receipt', () => {
  const state = makeState();
  const { bus } = bootLaw(state);
  bus.emit('customs:submit', { factionId: 'faction_scn', patrolId: 'patrol-7', stationId: 'station_helios' });
  const barks = bus.emitLog.filter((e) => e.evt === 'law:voice' && e.payload.channel === 'bark');
  assert.equal(barks.length, 1, 'exactly one lawful acknowledgement bark');
  const receipts = bus.emitLog.filter((e) => e.evt === 'law:incidentReceipt');
  assert.equal(receipts.length, 1, 'one incident-ledger receipt emitted');
  const row = state.lawSecurity.receipts.at(-1);
  assert.equal(row.outcome, 'customs_complied', 'compliance recorded on the ledger');
  assert.equal(row.cause, 'customs_scan');
  assert.equal(row.patrolId, 'patrol-7', 'the receipt names the unit that took the submission');
  assert.equal(row.stationId, 'station_helios');
  assert.equal(row.incidentId, undefined, 'no incidentId — the direct-receipt lane paints it');
});

test('the ack never charges, re-scans, or moves standing', () => {
  const state = makeState();
  const { bus } = bootLaw(state);
  bus.emit('customs:submit', { factionId: 'faction_scn' });
  const forbidden = bus.emitLog.filter((e) => (
    e.evt === 'patrol:proximity' || e.evt === 'contraband:scanned'
    || e.evt === 'faction:repDelta' || e.evt === 'economy:chargeCredits'
    || e.evt === 'heat:changed' || e.evt === 'toast'
  ));
  assert.deepEqual(forbidden, [], 'no second fine, no new scan, no standing move');
  assert.equal(state.player.credits, 5000);
});

test('a duplicate same-tick submit produces no second ack', () => {
  const state = makeState();
  const { bus } = bootLaw(state);
  bus.emit('customs:submit', { factionId: 'faction_scn' });
  bus.emit('customs:submit', { factionId: 'faction_scn' });
  const barks = bus.emitLog.filter((e) => e.evt === 'law:voice');
  assert.equal(barks.length, 1, 'one bark per tick — deck double-fire is deduped');
  assert.equal(state.lawSecurity.receipts.length, 1);
});

test('the seam is live end-to-end from the deck verb', () => {
  const state = makeState();
  const { bus } = bootLaw(state);
  const offers = [];
  setPromptDeck({
    offerDecision(o) { offers.push(o); return true; },
    updateDecision() { return true; },
    resolveDecision() { return true; },
  });
  const prompt = Object.create(customsPrompt);
  try {
    prompt.init({
      state,
      bus,
      helpers: { voice: { say() { return true; } } },
      registry: {
        get() {
          return {
            illicitCargo() {
              return [{
                commodityId: 'cmdty_narcotics', qty: 2,
                def: { name: 'Narcotics', basePrice: 220, legality: 'contraband', fineMult: 1.2 },
              }];
            },
            scanningFaction() { return 'faction_scn'; },
          };
        },
      },
    });
    bus.emit('player:scannedByPatrol', {
      hasContraband: true, factionId: 'faction_scn', patrolId: 'patrol-3', stationId: 'station_helios',
    });
    assert.ok(state.ui.customsPrompt, 'panel surfaced');
    prompt.choose('submit');
    const barks = bus.emitLog.filter((e) => e.evt === 'law:voice' && e.payload.channel === 'bark');
    assert.equal(barks.length, 1, 'the deck verb reaches the law ack');
    const row = state.lawSecurity.receipts.at(-1);
    assert.equal(row.outcome, 'customs_complied');
    assert.equal(row.patrolId, 'patrol-3', 'patrol identity travels from signal to receipt');
  } finally { setPromptDeck(null); }
});

test('a submit outside flight mode is ignored and destroy removes the listener', () => {
  const state = makeState();
  const { bus, law } = bootLaw(state);
  state.mode = 'dock';
  bus.emit('customs:submit', { factionId: 'faction_scn' });
  assert.equal(state.lawSecurity.receipts.length, 0, 'no ack while docked');
  state.mode = 'flight';
  law.destroy();
  bus.emit('customs:submit', { factionId: 'faction_scn' });
  assert.equal(state.lawSecurity.receipts.length, 0, 'no listener survives destroy');
});
