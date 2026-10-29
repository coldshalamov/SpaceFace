import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { ENCOUNTER_SCRIPTS } from '../src/systems/encounterScripts.js';
import { economy } from '../src/systems/economy.js';
import { customsPrompt } from '../src/ui/customsPrompt.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';

const NARCOTICS = {
  commodityId: 'cmdty_narcotics',
  qty: 2,
  holdQty: 2,
  bayQty: 0,
  cacheQty: 0,
  def: { name: 'Narcotics', basePrice: 220, legality: 'contraband', fineMult: 1.2 },
};

function boot() {
  const state = createGameState(0x51ca);
  state.mode = 'flight';
  state.tick = 50;
  state.simTime = 120;
  state.player.credits = 5000;
  const bus = createBus();
  const offers = [];
  setPromptDeck({
    offerDecision(spec) { offers.push(spec); return true; },
    updateDecision() { return true; },
    resolveDecision() { return true; },
  });

  const econ = Object.create(economy);
  econ.state = state;
  econ.bus = bus;
  econ.illicitCargo = () => [NARCOTICS];
  econ._deadDropScanCoverage = () => null;
  econ.scannerCloak = () => 0;
  econ.auditorScanChance = () => 0.5;
  econ.currentSecurity = () => 0;
  econ.scanningFaction = () => 'faction_scn';
  econ._rng = () => 0.99; // aboard, but this scan misses the hold
  econ._markFactionGatesHot = () => {};
  econ.registryGet = () => null;
  bus.on('contraband:bribe', payload => { payload.result = econ.payBribe(payload); });

  const prompt = Object.create(customsPrompt);
  prompt.init({
    state,
    bus,
    helpers: { voice: { say() { return true; } } },
    registry: { get: () => econ },
  });
  return { state, bus, econ, offers, prompt };
}

function patrolDecision(state, bus) {
  const resolved = [];
  const rep = [];
  const despawned = [];
  const live = { id: 'patrol-scan:1', phase: 'offer', vars: {}, data: {} };
  const d = {
    fineEstimate: () => 1000,
    emit: (event, payload) => bus.emit(event, payload),
    rep: (...args) => rep.push(args),
    despawnAll: (...args) => despawned.push(args),
    resolve: (_live, result) => resolved.push(result),
  };
  return { live, d, rep, despawned, resolved };
}

test('a resolved scan opens no dead deck; the same-tick patrol offer bribe still commits', () => {
  const h = boot();
  try {
    const scan = h.econ.runScan({ source: 'patrol', patrolId: 77 });
    assert.deepEqual(scan, { found: false, evaded: true });
    assert.equal(h.state.ui.customsPrompt, undefined,
      'the patrol encounter already owned its pre-scan choice; no post-scan deck appears');
    assert.equal(h.offers.length, 0);

    // Worker transports can deliver the fact after runScan has returned. The UI must not depend
    // on a private economy stack marker being shared with this host.
    h.bus.emit('player:scannedByPatrol', {
      hasContraband: true, factionId: 'faction_scn', patrolId: 77,
    });
    assert.equal(h.state.ui.customsPrompt, undefined, 'a delayed fact still creates no stale deck');
    assert.equal(h.offers.length, 0);

    const patrol = patrolDecision(h.state, h.bus);
    ENCOUNTER_SCRIPTS.patrolScan.choose(patrol.d, patrol.live, h.state, 'bribe');
    assert.equal(h.state.player.credits, 4700, 'economy alone charges the accepted bribe');
    assert.deepEqual(patrol.resolved, ['bribed']);
    assert.deepEqual(patrol.rep, [['faction_scn', -2, 'bribe']]);
    assert.equal(patrol.despawned.length, 1);
  } finally {
    h.prompt.destroy();
    setPromptDeck(null);
  }
});

test('patrol does not resolve a bribe when the economy writer rejects its receipt', () => {
  const state = createGameState(0x51cb);
  state.player.credits = 5000;
  const patrol = patrolDecision(state, {
    emit(_event, payload) { payload.result = { ok: false, reason: 'rejected' }; },
  });

  ENCOUNTER_SCRIPTS.patrolScan.choose(patrol.d, patrol.live, state, 'bribe');
  assert.deepEqual(patrol.resolved, [], 'a failed debit leaves the pre-scan offer live');
  assert.deepEqual(patrol.rep, [], 'a rejected payment does not buy standing');
  assert.deepEqual(patrol.despawned, [], 'a rejected payment does not dismiss the patrol');
  assert.equal(patrol.live.phase, 'offer');
});


test('an accepted bribe stays accepted when a synchronous credit receipt awards money', () => {
  const h = boot();
  try {
    h.bus.on('credits:changed', p => {
      if (p.reason === 'bribe:contraband') h.econ.grantCredits(10, 'test:receipt-reward');
    });
    const patrol = patrolDecision(h.state, h.bus);
    ENCOUNTER_SCRIPTS.patrolScan.choose(patrol.d, patrol.live, h.state, 'bribe');
    assert.equal(h.state.player.credits, 4710);
    assert.deepEqual(patrol.resolved, ['bribed'], 'the exact debit receipt survives a separate credit award');
    assert.equal(patrol.despawned.length, 1);
  } finally {
    h.prompt.destroy();
    setPromptDeck(null);
  }
});
