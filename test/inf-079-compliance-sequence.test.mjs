// INF-079 — scan facts arrive after the decision owner has resolved the scan. The UI reports
// the result but does not offer stale submit/bribe/run choices over an already-settled outcome.
import test from 'node:test';
import assert from 'node:assert/strict';

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

function boot() {
  const state = { simTime: 50, tick: 100, playerId: 'player', player: { credits: 5000 }, ui: {} };
  const bus = makeBus();
  const offers = [];
  setPromptDeck({
    offers,
    offerDecision(spec) { offers.push(spec); return true; },
    updateDecision() { return true; },
    resolveDecision() { return true; },
  });
  const prompt = Object.create(customsPrompt);
  prompt.init({ state, bus });
  return { state, bus, offers, prompt };
}

test('a late scan fact cannot open a decision deck even without shared economy state', () => {
  const h = boot();
  try {
    h.bus.emit('player:scannedByPatrol', {
      hasContraband: true, factionId: 'faction_scn', patrolId: 'patrol-3',
    });
    assert.equal(h.state.ui.customsPrompt, undefined, 'a fact never installs actionable UI state');
    assert.equal(h.offers.length, 0, 'the resolved scan opens no stale deck');
    assert.equal(h.bus.emitLog.some((row) => row.evt === 'contraband:bribe'), false);
  } finally {
    h.prompt.destroy();
    setPromptDeck(null);
  }
});

test('a bust receipt names the exact fine and seizure without retaining a panel', () => {
  const h = boot();
  try {
    h.bus.emit('contraband:scanned', {
      found: true, fine: 1200, confiscated: [{ commodityId: 'cmdty_narcotics', qty: 4 }],
      factionId: 'faction_scn', units: 4,
    });
    const receipt = h.bus.emitLog.find((e) => e.evt === 'toast' && /CUSTOMS BUST/.test(e.payload.text));
    assert.ok(receipt, 'the scan result remains visible');
    assert.match(receipt.payload.text, /1200/);
    assert.match(receipt.payload.text, /4 units seized/);
    assert.equal(h.state.ui.customsPrompt, undefined);
  } finally {
    h.prompt.destroy();
    setPromptDeck(null);
  }
});

test('correlated lawful-inspection results stay with their case owner', () => {
  const h = boot();
  try {
    h.bus.emit('contraband:scanned', {
      found: true, fine: 1200, confiscated: [], factionId: 'faction_scn',
      lawfulInspectionCaseId: 'lawful-inspection:x:1',
    });
    assert.equal(h.bus.emitLog.some((e) => e.evt === 'toast' && /CUSTOMS BUST/.test(e.payload.text)), false);
  } finally {
    h.prompt.destroy();
    setPromptDeck(null);
  }
});
