// The mid-run pact — the armory's wager row. A signature costs no credits: the counter pays
// the authored purse on the spot and folds the pact's mutator into run.arenaMutators, the
// same live contract a launch challenge or a Threat wager writes. The handicap must bind
// through the mutator's own consumer (the cradle shelf dies on the same refresh and stays
// dead), never by a side-channel flag. Deterministic: seeded state, manual phase transitions,
// no wall clock.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { TECH_NODES } from '../src/data/tech.js';
import { SWARM_PACT_ONE_HULL } from '../src/data/swarmDraft.js';
import { economy } from '../src/systems/economy.js';
import { runSession } from '../src/systems/runSession.js';
import { ships } from '../src/systems/ships.js';
import {
  CRUCIBLE_PURCHASE_SPEND_REASON,
  SWARM_HULL_OFFER_KIND,
  survivalDraft,
} from '../src/systems/survivalDraft.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { compactRunResult, resetCrucibleMetaForTests } from '../src/systems/survivalRecords.js';
import { isSwarmLadderRun, swarmArcadeSeedFor } from '../src/data/swarmLadder.js';
import {
  challengeFromRun,
  clearQueuedChallenge,
  compileChallenge,
  queueSurvivalChallenge,
} from '../src/systems/survivalMutators.js';

const SEED = 90210;
const ARENA = 'helios_core';
const PACT = SWARM_PACT_ONE_HULL;

function boot() {
  resetCrucibleMetaForTests();
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const registry = { get: (name) => ({ ships, economy, survivalDraft })[name] || null };
  const ctx = { state, bus, helpers: {}, registry };
  economy.init(ctx);
  ships.init(ctx);
  economy.newGame();
  ships.newGame();
  state.player.researchedNodes = TECH_NODES.map((node) => node.id);
  ships.buyShip({ defId: 'ship_hornet', grant: true, setActive: true });
  const player = {
    id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship',
    hull: 200, hullMax: 200,
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  runSession.init(ctx);
  survivalRun.init(ctx);
  survivalDraft.init(ctx);
  return { state, bus, emitted, player };
}

function named(h, event) {
  return h.emitted.filter((entry) => entry.event === event);
}

function transition(h, expectedPhase, nextPhase) {
  h.bus.emit('run:transitionRequested', { expectedPhase, nextPhase, reason: 't', tick: 0 });
}

function begin(h, mutators) {
  clearQueuedChallenge();
  if (Array.isArray(mutators) && mutators.length) {
    queueSurvivalChallenge({ seed: SEED, ruleset: 'swarm', mutators });
  }
  h.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA,
  });
  return h.state.run;
}

/** A between-rounds armory on `wave` — the swarm's real upgrade stop, the pact's shelf. */
function waveArmory(h, mutators, wave) {
  begin(h, mutators);
  transition(h, 'loadout', 'arena_intro');
  transition(h, 'arena_intro', 'wave_intro');
  transition(h, 'wave_intro', 'active');
  transition(h, 'active', 'cleanup');
  h.state.run.wave = wave;
  h.bus.emit('run:awardRequested', { credits: 4000, reason: 'round_loot' });
  transition(h, 'cleanup', 'draft');
  assert.equal(h.state.run.phase, 'draft');
}

function pactRow(h) {
  return survivalDraft.currentOffers().find((row) => row.id === PACT.offerId);
}

test('the pact rides the service counter — a wager row with a live quote, not stock', () => {
  const h = boot();
  waveArmory(h, null, 1);
  const row = pactRow(h);
  assert.ok(row, 'the pact is on the counter');
  assert.equal(row.kind, 'service');
  assert.equal(row.service, 'pact');
  assert.equal(row.mutatorId, 'one_hull');
  assert.equal(row.verb, 'Sign');
  assert.equal(row.name, PACT.name);
  assert.equal(row.price, 0, 'a signature is not a sale — the wallet is never asked');
  assert.equal(row.available, true, 'an unbound run may sign');
  assert.equal(row.unavailableReason, null);
  assert.ok(row.blurb && row.slotLabel, 'the card reads like its siblings');
  // The thing the wager sells is still on the shelf — the cradle rows exist to be lost.
  assert.ok(
    survivalDraft.currentOffers().some((entry) => entry.kind === SWARM_HULL_OFFER_KIND),
    'the unbound armory still sells the cradle',
  );
});

test('signing pays the purse now and binds the mutator — the cradle dies on the same refresh', () => {
  const h = boot();
  waveArmory(h, null, 1);
  const credits = h.state.run.credits;

  assert.equal(survivalDraft.resolvePick({ offerId: PACT.offerId }), true, 'the signature lands');
  assert.deepEqual(h.state.run.arenaMutators, ['one_hull'], 'the mutator folded into the run');
  assert.equal(
    compileChallenge(h.state.run.seed, h.state.run.arenaMutators, h.state.run.ruleset).hullLocked,
    true,
    'the compiled contract carries the bound rule',
  );
  assert.equal(h.state.run.credits, credits + PACT.purse, 'the purse paid through the wallet');
  const awards = named(h, 'run:awardRequested').filter((e) => e.payload.reason === 'crucible:pact');
  assert.equal(awards.length, 1, 'one purse asked');
  assert.equal(awards[0].payload.credits, PACT.purse);
  assert.equal(
    named(h, 'run:spendRequested').filter((e) => e.payload.reason === CRUCIBLE_PURCHASE_SPEND_REASON).length,
    0,
    'the wallet was never charged — the signature is the price',
  );

  // The mutator's own consumer is the verdict: the shelf the player is standing in front of
  // drops every cradle row, while the rest of the counter still deals.
  const shelf = survivalDraft.currentOffers();
  assert.ok(shelf.length > 0, 'the armory is still open');
  assert.ok(
    shelf.every((entry) => entry.kind !== SWARM_HULL_OFFER_KIND),
    'no hull can be swapped into after signing',
  );
  const after = pactRow(h);
  assert.ok(after, 'the pact row stays on the shelf as its own receipt');
  assert.equal(after.purchased, true);
  assert.equal(after.available, false);
  assert.equal(after.unavailableReason, 'Done');

  const buys = named(h, 'run:shopPurchased').filter((e) => e.payload.offerId === PACT.offerId);
  assert.equal(buys.length, 1);
  assert.equal(buys[0].payload.price, 0, 'the receipt prices a signature, not a sale');
  const records = (h.state.run.modifiers || []).filter((m) => m && m.kind === 'pact');
  assert.equal(records.length, 1, 'the run ledger keeps the signature');
  assert.equal(records[0].mutatorId, 'one_hull');
  assert.equal(records[0].purse, PACT.purse);
  assert.match(survivalDraft.lastNotice(), /signed/);
  const receipt = survivalDraft.preparationReceipt();
  assert.ok(receipt, 'the armory receipt went out');
  assert.equal(receipt.outcome, 'accepted');
  assert.equal(receipt.charged, false, 'nothing was charged');

  // One signature per visit — a second press signs nothing and pays nothing.
  const mutators = h.state.run.arenaMutators.slice();
  const wallet = h.state.run.credits;
  assert.equal(survivalDraft.resolvePick({ offerId: PACT.offerId }), false);
  assert.deepEqual(h.state.run.arenaMutators, mutators);
  assert.equal(h.state.run.credits, wallet);
  assert.equal(
    named(h, 'run:awardRequested').filter((e) => e.payload.reason === 'crucible:pact').length,
    1,
    'no second purse',
  );
});

test('the bound contract holds into the next armory — the row refuses honestly, the shelf still deals', () => {
  const h = boot();
  waveArmory(h, null, 1);
  assert.equal(survivalDraft.resolvePick({ offerId: PACT.offerId }), true);
  const wallet = h.state.run.credits;

  // Fight the next round and come back: the armory re-opens because one_hull strikes the
  // cradle, not the counter — that distinction is the wager the player read.
  transition(h, 'draft', 'wave_intro');
  transition(h, 'wave_intro', 'active');
  transition(h, 'active', 'cleanup');
  h.state.run.wave = 2;
  transition(h, 'cleanup', 'draft');
  assert.equal(h.state.run.phase, 'draft');
  const dealt = named(h, 'run:draftOffered');
  assert.ok(dealt.length >= 2, 'the next armory still deals');
  assert.ok(dealt[dealt.length - 1].payload.offers.length > 0, 'stock reached the surface');
  assert.deepEqual(h.state.run.arenaMutators, ['one_hull'], 'the signature survived the commit chain');

  const shelf = survivalDraft.currentOffers();
  assert.ok(shelf.length > 0, 'the shelf still lists');
  assert.ok(
    shelf.every((entry) => entry.kind !== SWARM_HULL_OFFER_KIND),
    'the cradle stays closed on the fresh stock',
  );
  const row = pactRow(h);
  assert.ok(row, 'the row still shows, plainly dead');
  assert.equal(row.available, false);
  assert.match(row.unavailableReason, /already closed/i);

  assert.equal(survivalDraft.resolvePick({ offerId: PACT.offerId }), false, 'cannot sign twice');
  assert.equal(h.state.run.credits, wallet, 'the refusal moved no credits');
  assert.equal(
    named(h, 'run:awardRequested').filter((e) => e.payload.reason === 'crucible:pact').length,
    1,
    'the wallet was never asked again',
  );
});

test('the signature stamps provenance — the record keeps the clean contract AND the bound flight', () => {
  const h = boot();
  waveArmory(h, null, 1);
  assert.equal(survivalDraft.resolvePick({ offerId: PACT.offerId }), true);

  // The wager-seam stamp: which mutator bound, and the wave the signature landed.
  assert.deepEqual(h.state.run.telemetry.pacts, [{ mutatorId: 'one_hull', wave: 1 }]);

  // Settle the way survivalResults hands the records a finished run: the bound mutator
  // rides the result's own list, because the mechanics really ran under it.
  const settle = (run) => compactRunResult({
    outcome: 'defeat', seed: run.seed, arenaId: run.arenaId,
    wave: 3, deepestWave: 3, wavesCleared: 2, kills: 12, score: 400,
    mutators: challengeFromRun(run).mutators.slice(),
  }, run, []);

  const compact = settle(h.state.run);
  // The launch contract was clean — a mid-run signature never relabels the climb it joined.
  assert.deepEqual(compact.mutators, [],
    'the signed mutator stays out of the launch contract the record fingerprints');
  // …while the row still says the ship really flew bound — and from which wave.
  assert.deepEqual(compact.pacts, [{ mutatorId: 'one_hull', wave: 1 }]);
  assert.equal(compact.trialId, null, 'a swarm run keeps its ruleset — never a trial identity');
  assert.deepEqual(compact.recordRules.mutators, ['one_hull'],
    'the comparison class still knows the run flew under one_hull');

  // The same mechanics launched as the contract still file as a mutator run — the two
  // provenances stay separable instead of fingerprinting identically.
  const bound = boot();
  waveArmory(bound, ['one_hull'], 1);
  assert.equal(bound.state.run.telemetry.pacts, undefined, 'a launch challenge signs nothing');
  const boundCompact = settle(bound.state.run);
  assert.deepEqual(boundCompact.mutators, ['one_hull'],
    'a launch one_hull contract still labels itself');
  assert.equal(boundCompact.pacts, undefined, 'no signature was ever made');

  // And the climb itself: on the arena's own seed the signed run stays a ladder run while
  // the launched mutator run is the custom contract it always was.
  const ladderSeed = swarmArcadeSeedFor(ARENA);
  const ladderFacts = {
    outcome: 'defeat', seed: ladderSeed, arenaId: ARENA,
    wave: 3, deepestWave: 3, wavesCleared: 2, kills: 12, score: 400,
  };
  assert.equal(
    isSwarmLadderRun(compactRunResult({ ...ladderFacts, mutators: ['one_hull'] }, h.state.run, [])),
    true,
    'the signed run keeps the ladder it launched onto',
  );
  assert.equal(
    isSwarmLadderRun(compactRunResult({ ...ladderFacts, mutators: ['one_hull'] }, bound.state.run, [])),
    false,
    'the launched mutator contract was never the ladder',
  );
});

test('a run launched already bound lists the row dead — the refusal spends nothing', () => {
  const h = boot();
  waveArmory(h, ['one_hull'], 1);
  assert.deepEqual(h.state.run.arenaMutators, ['one_hull'], 'the queued challenge reached the run');
  const credits = h.state.run.credits;

  const row = pactRow(h);
  assert.ok(row, 'the counter still shows the wager it cannot sell');
  assert.equal(row.available, false);
  assert.match(row.unavailableReason, /already closed/i);

  assert.equal(survivalDraft.resolvePick({ offerId: PACT.offerId }), false);
  assert.equal(h.state.run.credits, credits, 'not a credit moved');
  assert.deepEqual(h.state.run.arenaMutators, ['one_hull'], 'no second signature landed');
  assert.equal(
    named(h, 'run:awardRequested').filter((e) => e.payload.reason === 'crucible:pact').length,
    0,
    'no purse was ever asked',
  );
  assert.equal(
    named(h, 'run:shopPurchased').filter((e) => e.payload.offerId === PACT.offerId).length,
    0,
    'no receipt was printed for a refusal',
  );
});
