// INF-079 — make compliance a clear sequence, not a guessing game. The customs panel
// offered submit/bribe/run, but the engine resolves every scan synchronously in the
// signal tick: a panel that outlives the tick means the scan PASSED with no bust, and
// its bribe bought nothing — yet the 30% was still charged, then a later bust charged
// the full fine too. Submission's result was equally invisible: the fine vanished with
// no receipt. Now a later-tick bribe is declined loudly, every bust posts its exact
// cost, and each choice states what it really does.
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

function makeState() {
  return {
    simTime: 50,
    tick: 100,
    player: { credits: 5000 },
    ui: {},
  };
}

function econStub() {
  return {
    illicitCargo() {
      return [{
        commodityId: 'cmdty_narcotics',
        qty: 4,
        def: { name: 'Narcotics', basePrice: 220, legality: 'contraband', fineMult: 1.2 },
      }];
    },
    scanningFaction() { return 'faction_scn'; },
  };
}

function boot() {
  const state = makeState();
  const bus = makeBus();
  const offers = [];
  const deck = {
    offers,
    offerDecision(o) { offers.push(o); return true; },
    updateDecision() { return true; },
    resolveDecision() { return true; },
  };
  setPromptDeck(deck);
  const prompt = Object.create(customsPrompt);
  prompt.init({
    state,
    bus,
    helpers: { voice: { say() { return true; } } },
    registry: { get() { return econStub(); } },
  });
  return { state, bus, offers, prompt };
}

function signal(harness) {
  harness.bus.emit('player:scannedByPatrol', { hasContraband: true, factionId: 'faction_scn' });
}

test('a same-tick bribe still routes the single intent (pin-compat)', () => {
  const harness = boot();
  try {
    signal(harness);
    assert.ok(harness.state.ui.customsPrompt, 'panel surfaced');
    harness.prompt.choose('bribe');
    const bribes = harness.bus.emitLog.filter((e) => e.evt === 'contraband:bribe');
    assert.equal(bribes.length, 1, 'exactly one bribe intent');
    assert.equal(harness.state.player.credits, 5000, 'choosing charges nothing itself');
  } finally { setPromptDeck(null); }
});

test('a later-tick bribe after a passed scan is declined, never charged', () => {
  const harness = boot();
  try {
    signal(harness);
    assert.ok(harness.state.ui.customsPrompt, 'panel surfaced');
    harness.state.tick = 105; // a human acts ticks after the synchronous resolution
    harness.state.simTime = 55;
    harness.prompt.choose('bribe');
    const bribes = harness.bus.emitLog.filter((e) => e.evt === 'contraband:bribe');
    assert.equal(bribes.length, 0, 'no bribe intent after resolution');
    assert.equal(harness.state.player.credits, 5000, 'no double-charge on a passed scan');
    const decline = harness.bus.emitLog.find((e) => e.evt === 'toast' && /bribe declined/i.test(e.payload.text));
    assert.ok(decline, 'the decline is loud, not silent');
    assert.equal(harness.state.ui.customsPrompt, undefined, 'stale panel dismissed');
  } finally { setPromptDeck(null); }
});

test('a bust posts its exact cost as the visible result', () => {
  const harness = boot();
  try {
    signal(harness);
    harness.bus.emit('contraband:scanned', {
      found: true, fine: 1200, confiscated: [{ commodityId: 'cmdty_narcotics', qty: 4 }],
      factionId: 'faction_scn', units: 4,
    });
    const receipt = harness.bus.emitLog.find((e) => e.evt === 'toast' && /CUSTOMS BUST/.test(e.payload.text));
    assert.ok(receipt, 'compliance result is reported');
    assert.match(receipt.payload.text, /1200/, 'exact fine named');
    assert.match(receipt.payload.text, /4 units seized/, 'exact seizure named');
    assert.equal(harness.state.ui.customsPrompt, undefined, 'no stale prompt after the bust');
  } finally { setPromptDeck(null); }
});

test('a correlated lawful-inspection bust stays off the legacy surface', () => {
  const harness = boot();
  try {
    harness.bus.emit('contraband:scanned', {
      found: true, fine: 1200, confiscated: [], factionId: 'faction_scn',
      lawfulInspectionCaseId: 'lawful-inspection:x:1',
    });
    const receipt = harness.bus.emitLog.find((e) => e.evt === 'toast' && /CUSTOMS BUST/.test(e.payload.text));
    assert.equal(receipt, undefined, 'the durable route owns its own receipt');
  } finally { setPromptDeck(null); }
});

test('submit and run keep their seams and state their exact action', () => {
  const harness = boot();
  try {
    signal(harness);
    assert.equal(harness.offers.length, 1, 'one deck decision');
    const choices = Object.fromEntries(harness.offers[0].choices.map((c) => [c.id, c]));
    assert.match(choices.submit.title, /charges nothing/i, 'submit names its non-charge');
    assert.match(choices.bribe.title, /declined/i, 'bribe names its post-resolution limit');
    assert.match(choices.run.title, /does not move your ship/i, 'run names the physical act required');
    harness.prompt.choose('submit');
    assert.ok(harness.bus.emitLog.some((e) => e.evt === 'customs:submit'), 'submit seam kept');
    assert.equal(harness.state.player.credits, 5000, 'submit charges nothing');
  } finally { setPromptDeck(null); }
});

test('a declined bribe does not suppress a later real bust', () => {
  const harness = boot();
  try {
    signal(harness);
    harness.state.tick = 110;
    harness.prompt.choose('bribe'); // declined: scan had passed
    harness.state.simTime = 70;
    harness.state.tick = 200;
    signal(harness); // a fresh scan starts a fresh sequence
    harness.bus.emit('contraband:scanned', {
      found: true, fine: 800, confiscated: [{ commodityId: 'cmdty_narcotics', qty: 2 }],
      factionId: 'faction_scn', units: 2,
    });
    const receipt = harness.bus.emitLog.find((e) => e.evt === 'toast' && /CUSTOMS BUST/.test(e.payload.text));
    assert.ok(receipt, 'the later bust still reports');
    assert.match(receipt.payload.text, /800/, 'the later fine is the one named');
  } finally { setPromptDeck(null); }
});
