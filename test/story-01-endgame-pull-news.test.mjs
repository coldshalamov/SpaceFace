// STORY-01 — a finished endgame pull is news, with the power hole it left named.
//
// claims resolves a completed pull into the ledger once, emits endgame:pullCompleted, and
// publishes one cited headline built from endgamePullLine. Authored pulls name the hole; an
// unlisted pull must still name the faction that lost power — "the pull is done" alone was the
// gap.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { claims } from '../src/systems/claims.js';
import { createMarketNews } from '../src/ui/marketNews.js';
import { endgamePullLine } from '../src/data/conflictReactions.js';
import { tickerEventRef } from '../src/ui/marketNews.js';

const SEED = 4242;

function makeCtx() {
  const state = createGameState(SEED);
  state.meta.seed = SEED;
  const bus = createBus();
  return { state, bus, registry: { get: () => null }, helpers: {} };
}

const pullEvent = (overrides = {}) => ({
  causeTag: 'pq170-capital-boss',
  capitalBossId: 'capital_boss_unlisted_test',
  victimFactionId: 'faction_vael',
  completionMethod: 'massline',
  ...overrides,
});

test('a completed pull publishes one cited headline through the news model', () => {
  const ctx = makeCtx();
  claims.init(ctx);
  const news = createMarketNews(ctx);

  const published = [];
  const completed = [];
  ctx.bus.on('news:publish', (p) => published.push(p));
  ctx.bus.on('endgame:pullCompleted', (p) => completed.push(p));

  ctx.bus.emit('mission:completed', pullEvent());

  assert.equal(completed.length, 1);
  assert.equal(completed[0].pullId, 'capital_boss_unlisted_test');
  assert.equal(published.length, 1, 'one pull -> one news:publish');
  assert.equal(published[0].receiptId, 'endgame-pull:capital_boss_unlisted_test');
  assert.match(published[0].text, /VAEL/i, 'the headline names the faction that lost power');

  // The news model commits it cited — the resolved ticker ref traces back to the pull receipt.
  const rec = ctx.state.ui.marketNews.log[0];
  assert.ok(rec, 'the headline lands in the rolling log');
  const ref = tickerEventRef(rec);
  assert.ok(ref, 'the record is traceable');
  assert.equal(ref.sourceRef, 'endgame-pull:capital_boss_unlisted_test');
  assert.equal(rec.kind, 'endgame_pull');
});

test('a replayed completion does not stack a second headline', () => {
  const ctx = makeCtx();
  claims.init(ctx);
  const published = [];
  ctx.bus.on('news:publish', (p) => published.push(p));
  ctx.bus.emit('mission:completed', pullEvent());
  ctx.bus.emit('mission:completed', pullEvent());
  assert.equal(published.length, 1, 'the ledger dedupes the pull');
});

test('endgamePullLine keeps authored lines and names the hole on the fallback', () => {
  assert.equal(
    endgamePullLine('capital_boss_tollman'),
    'The Tollman is down. Sker is rewriting the fee.',
  );
  const fallback = endgamePullLine('pull_without_a_line', { victim: 'faction_vael' });
  assert.match(fallback, /VAEL/i, 'the fallback names the victim faction');
  assert.notEqual(fallback, 'The pull is done.', 'a hole must be named, not generic');
  assert.equal(endgamePullLine('pull_without_a_line'), 'The pull is done. The board marks the hole it left.');
});
