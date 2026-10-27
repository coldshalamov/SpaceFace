// The player-truth route must read the terminal startup pane, not wait out its timeout over it.
// The captured Swarm active failure presented "The first world picture could not be presented.
// Retry Launch." while routes.mjs polled for 600 s and reported a generic "flight did not become
// active" timeout, hiding the cause the running game had already shown. No browser is started here:
// the pane's recorded fields and the reader's decision are exercised directly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readStartupFailure, startupFailureQuote } from '../scripts/player-truth/routes.mjs';
import { quoteLoadError } from '../scripts/player-truth/environment.mjs';

// Fields exactly as the frozen capture presented them (loadingPresenter.showStartupFailure).
const capturedPane = () => ({
  found: true,
  overlayVisible: true,
  paneVisible: true,
  stage: 'opening-flight-paint',
  code: 'OPENING_PAINT_DEADLINE',
  headline: 'Startup could not finish',
  detail: 'The first world picture could not be presented. Retry Launch.',
  text: 'STOPPED DURING OPENING FLIGHT PAINT Startup could not finish The launch stopped during opening-flight-paint. The first world picture could not be presented. Retry Launch. Retry Back to menu',
});

test('the terminal startup pane quotes its own stage and cause', () => {
  assert.equal(startupFailureQuote(capturedPane()),
    'startup failed during opening-flight-paint (OPENING_PAINT_DEADLINE): The first world picture could not be presented. Retry Launch.');
});

test('a terminal pane is quoted even when its detail alone would read as a known load sentence', () => {
  // This is why the thrown error carries a marker: run.mjs must not whitelist a pane the game
  // itself presented as terminal. The reader still names the stage.
  const sentence = 'The game could not start. Retry Launch; saved games are unchanged.';
  assert.notEqual(quoteLoadError(sentence), null, 'fixture: the sentence is on the environment whitelist');
  assert.equal(startupFailureQuote({ ...capturedPane(), detail: sentence }),
    `startup failed during opening-flight-paint (OPENING_PAINT_DEADLINE): ${sentence}`);
});

test('an empty detail falls back to the pane text and then the headline', () => {
  assert.match(startupFailureQuote({ ...capturedPane(), detail: '', text: 'STOPPED DURING ARMORY' }), /STOPPED DURING ARMORY$/);
  assert.match(startupFailureQuote({ ...capturedPane(), detail: '', text: '' }), /Startup could not finish$/);
});

test('a pane left behind by a retry or a hidden overlay is not a live failure', () => {
  assert.equal(startupFailureQuote({ ...capturedPane(), paneVisible: false }), null);
  assert.equal(startupFailureQuote({ ...capturedPane(), overlayVisible: false }), null);
  assert.equal(startupFailureQuote({ found: false }), null);
  assert.equal(startupFailureQuote(), null);
});

test('readStartupFailure reads the pane facts and survives a page that cannot answer', async () => {
  const page = { evaluate: async () => capturedPane() };
  assert.match(await readStartupFailure(page), /^startup failed during opening-flight-paint/);
  const gone = { evaluate: async () => { throw new Error('page closed'); } };
  assert.equal(await readStartupFailure(gone), null);
});

test('ordinary active flight with no pane reports no startup failure', async () => {
  const page = { evaluate: async () => ({ found: false }) };
  assert.equal(await readStartupFailure(page), null);
});

test("the boot shell's failed import is quoted with the module cause, and a scheduled retry is not", async () => {
  // Captured on 2026-10-27 from a published-master candidate that could not boot: the shell
  // marked the overlay "failed" and put the missing-export error in the loading detail, while the
  // route only recognised the loadingPresenter pane and reported "main menu did not appear".
  const shell = {
    found: true, overlayVisible: true, paneVisible: true,
    stage: 'boot import', code: 'BOOT_IMPORT',
    headline: 'Startup could not finish',
    detail: 'Reload to retry. Your saved games have not been changed. (The requested module '
      + "'./masslinePresentation.js' does not provide an export named 'resolveMasslineCableRadiance')",
    text: '',
  };
  assert.equal(startupFailureQuote(shell),
    'startup failed during boot import (BOOT_IMPORT): Reload to retry. Your saved games have not been changed. '
    + "(The requested module './masslinePresentation.js' does not provide an export named 'resolveMasslineCableRadiance')");
  // A hidden shell (already reloading/back) is not a live failure.
  assert.equal(startupFailureQuote({ ...shell, overlayVisible: false }), null);
  // The presenter's own reader must accept the shell shape too, not only the pane shape.
  const page = { evaluate: async () => shell };
  assert.match(await readStartupFailure(page), /^startup failed during boot import/);
});