// The window's middle seat — bank half the purse, keep flying the rest.
//
// At a ten-wave boundary the run used to offer only the binary: lock everything and walk,
// or risk it all. The partial bank spends half the purse out of the run wallet and stamps
// it on run.telemetry.securedBounty — settled the moment the spend lands. Every later
// ending then pays its ordinary fraction on only the remainder: death halves what is left,
// a post-boss cash-out takes all of it, and the secured part comes home whole on top —
// never paid twice, never lost.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalResults } from '../src/systems/survivalResults.js';
import {
  SURVIVAL_WAVE_INTRO_TICKS,
  WAVE_CLEARED_SEAM,
  survivalRun,
} from '../src/systems/survivalRun.js';
import {
  canExtract,
  partialBankOffer,
  requestSurvivalPartialBank,
  securedBountyOf,
} from '../src/systems/survivalExtraction.js';
import {
  resetCrucibleMetaForTests,
  settleCrucibleRun,
  useCrucibleMetaClock,
} from '../src/systems/survivalRecords.js';
import { extractionPreviewLines, refitFootLines } from '../src/ui/screens/crucibleDraft.js';
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

/** A live swarm run benched at the round-ten window — the same stop the cash-out tests use. */
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
  assert.equal(h.state.run.phase, 'refit', 'the tenth round benches after the armory');
  return h.state.run;
}

function clearRounds(h, upTo) {
  for (let wave = 1; wave <= upTo; wave++) {
    h.bus.emit(WAVE_CLEARED_SEAM, { wave });
  }
}

test('a partial bank secures half the purse and the run keeps flying', () => {
  const h = boot();
  try {
    reachRefit(h);
    h.bus.emit('run:awardRequested', { credits: 100, reason: 'test' });
    assert.equal(h.state.run.credits, 100);

    requestSurvivalPartialBank(h.bus);
    assert.equal(h.state.run.credits, 50, 'half the purse left the wallet');
    assert.equal(h.state.run.telemetry.securedBounty, 50, 'the banked half is stamped');
    assert.equal(h.state.run.phase, 'refit', 'banking is not an ending — the run is still benched');
    const receipt = named(h, 'run:partialBanked');
    assert.equal(receipt.length, 1, 'one bank receipt for the one ask');
    assert.deepEqual(
      { credits: receipt[0].payload.credits, secured: receipt[0].payload.secured,
        remaining: receipt[0].payload.remaining },
      { credits: 50, secured: 50, remaining: 50 },
    );
    assert.equal(named(h, 'run:ended').length, 0, 'no end was ever asked for');

    // The window's other doors still stand beside it: launch, and the full walk-away.
    const lines = refitFootLines(h.state.run);
    assert.equal(lines.primary, 'Launch round 11');
    assert.equal(lines.extract, 'Extract — end the run here');
    assert.equal(lines.bank, 'Bank 25 cr, keep flying', 'the offer re-prices off the live purse');

    // Closing the bench launches the next round — the banked salvage is already home.
    h.bus.emit('run:refitClosed', {});
    survivalRun.update(DT);
    assert.equal(h.state.run.phase, 'wave_intro', 'the run flies on with the remainder');
  } finally {
    teardown();
  }
});

test('a later death banks the secured half plus half the remainder — never the same credit twice', () => {
  const h = boot();
  try {
    reachRefit(h);
    h.bus.emit('run:awardRequested', { credits: 100, reason: 'test' });
    requestSurvivalPartialBank(h.bus);
    assert.equal(h.state.run.credits, 50);
    assert.equal(securedBountyOf(h.state.run), 50);

    clearRounds(h, 10);
    h.bus.emit('run:awardRequested', { credits: 60, reason: 'test' });
    assert.equal(h.state.run.credits, 110);
    h.bus.emit('run:endRequested', { outcome: 'defeat', reason: 'hull_lost', tick: 1 });

    const result = latestResult(h);
    assert.equal(result.outcome, 'defeat');
    assert.equal(result.credits, 110, 'the remainder is what the ending sees');
    // 50 already home + the death law's half of the 110 still at risk.
    assert.equal(result.bankedBounty, 50 + 55);
    assert.equal(result.cashOut, false);
  } finally {
    teardown();
  }
});

test('a later cash-out banks the secured part plus the whole remainder', () => {
  const h = boot();
  try {
    reachRefit(h);
    h.bus.emit('run:awardRequested', { credits: 100, reason: 'test' });
    requestSurvivalPartialBank(h.bus);
    assert.equal(h.state.run.credits, 50);

    // The run flies on and the purse grows; at the next window the seat is on offer again
    // and banks against the LIVE purse, accumulating on the one stamp.
    h.bus.emit('run:awardRequested', { credits: 150, reason: 'test' });
    assert.equal(h.state.run.credits, 200);
    h.state.run.wave = 20;
    requestSurvivalPartialBank(h.bus);
    assert.equal(h.state.run.credits, 100, 'the second bank halves what is on the table now');
    assert.equal(h.state.run.telemetry.securedBounty, 150, 'secured adds up, it never resets');

    clearRounds(h, 20);
    h.bus.emit('run:extractionRequested', {});
    const ended = named(h, 'run:ended');
    assert.equal(ended.length, 1, 'the walk-away still ends the run exactly once');
    assert.equal(ended[0].payload.reason, 'extracted');

    const result = latestResult(h);
    assert.equal(result.outcome, 'extracted');
    // Boss cleared: the whole remainder comes home on top of the 150 already banked.
    assert.equal(result.bankedBounty, 150 + 100);
    assert.equal(result.cashOut, true);
  } finally {
    teardown();
  }
});

test('no purse, no offer — and a bank ask off-window or mid-fight moves nothing', () => {
  const h = boot();
  try {
    reachRefit(h);
    assert.equal(h.state.run.credits, 0);
    assert.equal(partialBankOffer(h.state.run), null, 'an empty purse is an honest refusal');
    assert.equal(refitFootLines(h.state.run).bank, '', 'no dead button is drawn');
    assert.equal(canExtract(h.state.run), true, 'the full walk-away is still on the table');
    requestSurvivalPartialBank(h.bus);
    assert.equal(named(h, 'run:spent').length, 0, 'nothing was spent');
    assert.equal(named(h, 'run:partialBanked').length, 0, 'nothing was banked');
    assert.equal(h.state.run.telemetry.securedBounty, undefined, 'nothing was stamped');

    // A purse too thin to halve into a whole credit refuses the same way.
    h.bus.emit('run:awardRequested', { credits: 1, reason: 'test' });
    assert.equal(partialBankOffer(h.state.run), null);
    requestSurvivalPartialBank(h.bus);
    assert.equal(h.state.run.credits, 1, 'the single credit stays put');

    // Off the ten-wave boundary the seat is not for sale even with money on the table.
    h.bus.emit('run:awardRequested', { credits: 99, reason: 'test' });
    h.state.run.wave = 9;
    assert.equal(partialBankOffer(h.state.run), null);
    requestSurvivalPartialBank(h.bus);
    assert.equal(h.state.run.credits, 100, 'off-window asks are refused whole');
    assert.equal(h.state.run.telemetry.securedBounty, undefined);

    // And mid-fight — the window is real (wave set back to ten) but the phase is live.
    h.state.run.wave = 10;
    h.state.run.phase = 'active';
    requestSurvivalPartialBank(h.bus);
    assert.equal(h.state.run.credits, 100, 'you cannot bank while the round is live');
    assert.equal(h.state.run.telemetry.securedBounty, undefined);
  } finally {
    teardown();
  }
});

test('the foot words and the extract preview price the seat and name the banked salvage', () => {
  const run = {
    kind: 'survival', phase: 'refit', ruleset: 'swarm', wave: 10,
    score: 3040, credits: 212, telemetry: {},
  };
  const lines = refitFootLines(run);
  assert.equal(lines.bank, 'Bank 106 cr, keep flying');
  assert.match(lines.bankNote, /106 cr moves to the hangar chest/);
  assert.match(lines.bankNote, /106 cr stays in the purse/);
  assert.match(lines.bankNote, /death still halves it/);
  // The extract row is untouched — same words, same settlement preview.
  assert.equal(lines.extract, 'Extract — end the run here');
  assert.match(lines.extractNote, /212/);
  assert.match(lines.primaryNote, /round 11/);

  // Once salvage is banked, the preview says so — the confirmed settlement matches it.
  run.telemetry.securedBounty = 106;
  const preview = extractionPreviewLines(run);
  assert.match(preview.amounts, /106 cr already sits in the hangar chest/);
  assert.match(preview.amounts, /never campaign credits/);
});

/* -------- the settle law, pinned directly on the bank input -------- */

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(key); },
  };
}

function settle(storage, fields) {
  return settleCrucibleRun({
    result: {
      seed: SEED,
      arenaId: 'helios_core',
      wave: fields.wavesCleared,
      wavesCleared: fields.wavesCleared,
      credits: fields.credits,
      securedCredits: fields.resultSecured,
      outcome: fields.outcome,
      cashOut: fields.cashOut === true,
      runId: fields.runId,
      score: 0,
      kills: 0,
      xp: 0,
      picks: [],
    },
    run: {
      kind: 'survival',
      ruleset: 'swarm',
      seed: SEED,
      wave: fields.wavesCleared,
      telemetry: fields.secured != null ? { securedBounty: fields.secured } : {},
    },
    storage,
  });
}

test('settlement composes secured salvage with whatever the ending pays on the remainder', () => {
  resetCrucibleMetaForTests();
  useCrucibleMetaClock(() => '2026-10-28T00:00:00.000Z');
  const storage = memoryStorage();

  // Death after banking half: the stamp comes home whole, the remainder pays the death law.
  const died = settle(storage, {
    outcome: 'defeat', wavesCleared: 10, credits: 110, secured: 50, runId: 'died-after-bank',
  });
  assert.equal(died.result.bankedBounty, 105);
  assert.equal(died.result.cashOut, false);

  // Walking away after a boss: secured + the whole remainder.
  const walked = settle(storage, {
    outcome: 'extracted', cashOut: true, wavesCleared: 10, credits: 200, secured: 50,
    runId: 'walked-after-bank',
  });
  assert.equal(walked.result.bankedBounty, 250);
  assert.equal(walked.result.cashOut, true);

  // An early cash-out (no boss cleared) halves only the remainder — the stamp is untouched.
  const early = settle(storage, {
    outcome: 'extracted', cashOut: true, wavesCleared: 9, credits: 200, secured: 50,
    runId: 'early-walk-after-bank',
  });
  assert.equal(early.result.bankedBounty, 150);

  // An ending that pays nothing on the purse still cannot lose what was already banked.
  const aborted = settle(storage, {
    outcome: 'aborted', wavesCleared: 14, credits: 300, secured: 50, runId: 'aborted-after-bank',
  });
  assert.equal(aborted.result.bankedBounty, 50);

  // And a result that carries the figure flat — no live run in hand — banks it the same.
  const flat = settle(storage, {
    outcome: 'defeat', wavesCleared: 10, credits: 40, resultSecured: 30, runId: 'flat-stamp',
  });
  assert.equal(flat.result.bankedBounty, 50);
});
