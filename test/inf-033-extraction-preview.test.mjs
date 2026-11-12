// INF-033 — extraction shows what is secured and what is at risk.
//
// A compact settlement preview beside the Extract offer: the figures leaving secures, what
// flying on risks, and which amounts are run-only. The confirmed settlement must match the
// preview exactly — run credits never become campaign credits.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { requestSurvivalExtraction } from '../src/systems/survivalExtraction.js';
import { survivalResults } from '../src/systems/survivalResults.js';
import {
  SURVIVAL_ARENA_INTRO_TICKS,
  SURVIVAL_CLEANUP_TICKS,
  SURVIVAL_WAVE_INTRO_TICKS,
  WAVE_CLEARED_SEAM,
  survivalRun,
} from '../src/systems/survivalRun.js';
import { extractionPreviewLines } from '../src/ui/screens/crucibleDraft.js';

const SEED = 47;
const ARENA = 'helios_core';
const DT = 1 / 60;

function boot() {
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
  survivalRun.init(ctx);
  survivalResults.init(ctx);
  return { state, bus, emitted, ctx };
}

/** Drive a scored run to the wave-10 extraction window, the way the 10b test does. */
function reachExtractionWindow(h) {
  h.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: SEED, arenaId: ARENA });
  h.bus.emit('run:loadoutReady', {});
  survivalRun.update(DT);
  for (let i = 0; i < SURVIVAL_ARENA_INTRO_TICKS + 2; i++) survivalRun.update(DT);
  for (let wave = 1; wave <= 10; wave++) {
    for (let i = 0; i < SURVIVAL_WAVE_INTRO_TICKS + 2; i++) survivalRun.update(DT);
    h.bus.emit(WAVE_CLEARED_SEAM, { wave });
    survivalRun.update(DT);
    for (let i = 0; i < SURVIVAL_CLEANUP_TICKS + 2; i++) survivalRun.update(DT);
    if (wave === 10) break;
    h.bus.emit('run:draftResolved', {});
    survivalRun.update(DT);
  }
}

function teardown(h) {
  runSession.destroy();
  survivalRun.destroy();
  survivalResults.destroy();
}

test('INF-033: the preview names the secured figures, the risk, and run-only amounts', () => {
  const lines = extractionPreviewLines({ kind: 'survival', score: 1250, credits: 340, wave: 10 });
  assert.match(lines.secured, /1250/);
  assert.match(lines.secured, /340/);
  assert.match(lines.secured, /wave 10/);
  assert.match(lines.secured, /final result/i);
  assert.match(lines.risk, /wave 11/);
  assert.match(lines.risk, /shop spends salvage/i);
  assert.match(lines.risk, /death ends the run/i);
  assert.match(lines.amounts, /run-only/i);
  assert.match(lines.amounts, /never campaign credits/i);
});

test('INF-033: no survival run means no preview', () => {
  assert.equal(extractionPreviewLines(null), null);
  assert.equal(extractionPreviewLines({ kind: 'adventure', score: 5, credits: 5, wave: 1 }), null);
});

test('INF-033: the confirmed settlement matches the preview exactly', () => {
  const h = boot();
  reachExtractionWindow(h);
  // Real earnings through the run wallet and the score ledger — the preview reads these.
  h.bus.emit('run:awardRequested', { score: 1250, reason: 'kill', wave: 10 });
  h.bus.emit('run:awardRequested', { credits: 340, reason: 'chip_scooped', wave: 10 });
  const lines = extractionPreviewLines(h.state.run);
  requestSurvivalExtraction(h.bus);
  survivalRun.update(DT);
  const ready = h.emitted.filter((row) => row.event === 'run:resultsReady');
  assert.ok(ready.length >= 1);
  const result = ready[ready.length - 1].payload;
  assert.equal(result.outcome, 'extracted');
  assert.match(lines.secured, new RegExp(String(result.score)), 'preview score is the settled score');
  assert.match(lines.secured, new RegExp(String(result.credits)), 'preview salvage is the settled salvage');
  assert.match(lines.secured, new RegExp(`wave ${result.wave}`), 'preview wave is the settled wave');
  teardown(h);
});
