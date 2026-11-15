// PRI-11f / PR #942 F18 — reach the exit: after clearing round ten the pilot may
// refit, bank, or EXTRACT — the run's first cash-out. This is the PR's behaviour
// pinned against today's master: the tenth-round bench must offer all three doors
// at once, and the walk-away ends the run exactly once with the cash-out paid.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalResults } from '../src/systems/survivalResults.js';
import { WAVE_CLEARED_SEAM, survivalRun } from '../src/systems/survivalRun.js';
import {
  canExtract,
  partialBankOffer,
  requestSurvivalExtraction,
} from '../src/systems/survivalExtraction.js';
import {
  resetCrucibleMetaForTests,
  useCrucibleMetaClock,
} from '../src/systems/survivalRecords.js';
import { refitFootLines } from '../src/ui/screens/crucibleDraft.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';

const SEED = 4242;
const ARENA = 'helios_core';
const DT = 1 / 60;

function boot() {
  resetCrucibleMetaForTests();
  useCrucibleMetaClock(() => '2026-10-28T00:00:00.000Z');
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
  const ctx = { state, bus, helpers: {} };
  runSession.init(ctx);
  survivalResults.init(ctx);
  survivalRun.init(ctx);
  return { state, bus, emitted, ctx };
}

function teardown() {
  runSession.destroy();
  survivalResults.destroy();
  survivalRun.destroy();
  resetCrucibleMetaForTests();
}

function named(h, event) {
  return h.emitted.filter((entry) => entry.event === event);
}

function latestResult(h) {
  const ready = named(h, 'run:resultsReady');
  return ready.length ? ready[ready.length - 1].payload : null;
}

/** A live swarm run benched at the given round — the same stop the cash-out tests use. */
function reachRefit(h, wave = 10) {
  h.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: SWARM_RULESET, seed: SEED, arenaId: ARENA,
  });
  h.bus.emit('run:transitionRequested', {
    expectedPhase: 'loadout', nextPhase: 'draft', reason: 't', tick: 0,
  });
  h.state.run.wave = wave;
  h.bus.emit('run:draftResolved', {});
  survivalRun.update(DT);
  assert.equal(h.state.run.phase, 'refit', `round ${wave} benches after the armory`);
  return h.state.run;
}

/** The results owner's clear ledger — the boss window only pays out on real clears. */
function clearRounds(h, upTo) {
  for (let wave = 1; wave <= upTo; wave++) {
    h.bus.emit(WAVE_CLEARED_SEAM, { wave });
  }
}

test('the tenth round benches with all three doors — refit, bank, and the run\'s first cash-out', () => {
  const h = boot();
  try {
    reachRefit(h);
    h.bus.emit('run:awardRequested', { credits: 200, reason: 'test' });
    const run = h.state.run; // award commits a fresh clone — read the live run
    assert.equal(run.credits, 200);

    // The exit is genuinely on the table here — the first ten-boundary the course reaches.
    assert.equal(canExtract(run), true, 'round ten refit is a real cash-out window');
    const offer = partialBankOffer(run);
    assert.deepEqual(offer, { amount: 100, remaining: 100, purse: 200 });

    const lines = refitFootLines(run);
    assert.equal(lines.primary, 'Launch round 11', 'the refit door launches the next round');
    assert.equal(lines.extract, 'Extract — end the run here', 'the exit stands beside it');
    assert.match(lines.extractNote, /round 10/);
    assert.equal(lines.bank, 'Bank 100 cr, keep flying', 'the middle seat is priced off the purse');
  } finally {
    teardown();
  }
});

test('the walk-away ends the run exactly once — extracted, with the boss-window payout', () => {
  const h = boot();
  try {
    reachRefit(h);
    h.bus.emit('run:awardRequested', { credits: 200, reason: 'test' });
    clearRounds(h, 10);

    requestSurvivalExtraction(h.bus);
    const ended = named(h, 'run:ended');
    assert.equal(ended.length, 1, 'one end for one ask');
    assert.equal(ended[0].payload.reason, 'extracted');

    const result = latestResult(h);
    assert.ok(result, 'the run published a result');
    assert.equal(result.outcome, 'extracted');
    // Round ten is a boss window: a clear-post-champion walk pays the whole purse.
    assert.equal(result.cashOut, true);
    assert.equal(result.bankedBounty, 200, 'the full purse comes home at the first cash-out');

    // A second ask cannot end it twice — the receipt is already spent.
    requestSurvivalExtraction(h.bus);
    assert.equal(named(h, 'run:ended').length, 1);
  } finally {
    teardown();
  }
});

test('off-window and mid-fight the exit is not on the table', () => {
  const h = boot();
  try {
    // The bench is only ever a window wave (refit cadence == extraction cadence), so the
    // off-window refusal is the window gate itself: same bench, wave walked off the mark.
    reachRefit(h);
    h.state.run.wave = 9;
    assert.equal(canExtract(h.state.run), false, 'off-window the run is not a cash-out');
    assert.equal(refitFootLines(h.state.run).extract, '', 'no dead exit is drawn');
    h.bus.emit('run:extractionRequested', {});
    assert.equal(named(h, 'run:ended').length, 0, 'off-window the run ignores the ask');
    assert.equal(h.state.run.phase, 'refit', 'the bench stays open');

    // A real window, but the round is live — you cannot leave mid-fight.
    h.state.run.wave = 10;
    h.state.run.phase = 'active';
    assert.equal(canExtract(h.state.run), false);
    h.bus.emit('run:extractionRequested', {});
    assert.equal(named(h, 'run:ended').length, 0, 'mid-fight the run ignores the ask');
    assert.equal(h.state.run.phase, 'active', 'the fight is undisturbed');
  } finally {
    teardown();
  }
});

test('the launch door still flies the next round', () => {
  const h = boot();
  try {
    reachRefit(h);
    h.bus.emit('run:refitClosed', {});
    survivalRun.update(DT);
    assert.equal(h.state.run.phase, 'wave_intro', 'closing the bench launches round eleven');
    assert.equal(h.state.run.wave, 11, 'the run counter already reads the launched round');
    assert.equal(named(h, 'run:ended').length, 0, 'nothing ended');
  } finally {
    teardown();
  }
});
