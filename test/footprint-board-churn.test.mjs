// The footprint board is refreshed on uiRoot's 18-frame cadence (~3x/s while open). The board's
// content is receipt data — nothing on it ticks — so refresh() now rewrites the live header and
// skips the hang/board/record/edges DOM rebuild until a cheap signature of its inputs moves.
//
// There is no jsdom in this repo, so this file proves the two halves honestly separately:
//   • BEHAVIOUR — refresh() is driven on a stubbed screen (plain objects for the DOM hosts, count-
//     ing stubs for the heavy renders) against a REAL game state, asserting the rebuild/skip split
//     and that the header still ticks on skipped passes.
//   • WIRING — scoped source slices (the pq024 technique) pin the guard's order and the mount-time
//     signature reset, so a refactor cannot silently drop the skip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createGameState } from '../src/core/gameState.js';
import { footprintScreen } from '../src/ui/screens/footprint.js';

const SCREEN_SRC = readFileSync(new URL('../src/ui/screens/footprint.js', import.meta.url), 'utf8');

function makeChain(id) {
  return {
    id,
    open: true,
    sectorId: 'sector_ceres_belt',
    rootKind: 'assault',
    outcome: 'witnessed',
    tick: 100,
    t: 33.5,
    nodes: [{ k: 'act', tick: 100, t: 33.5, factionId: 'faction_free', outcome: 'won' }],
    edges: [[-1, 0, 'caused']],
  };
}

function bootScreen(chains) {
  const state = createGameState(47);
  state.mode = 'flight';
  state.player.heat = 0;
  state.player.bounty = 0;
  state.provenance = { chains, openIncidents: {} };
  if (!state.titles || typeof state.titles !== 'object') state.titles = { history: [] };
  if (!Array.isArray(state.titles.history)) state.titles.history = [];

  const calls = { showBoard: 0, hang: 0, board: 0, record: 0, verbs: 0, edges: 0, dataState: 0 };
  const screen = Object.create(footprintScreen);
  screen._ctx = { state };
  // Plain-object DOM hosts: refresh only sets textContent / classList.toggle / .hidden on them.
  screen._titleWord = { textContent: '', classList: { toggle() {} } };
  screen._titleLine = { textContent: '' };
  screen._heatN = { textContent: '' };
  screen._heatW = { textContent: '' };
  screen._board = { hidden: true };
  screen._record = { hidden: true };
  screen._stateHost = { hidden: true };
  screen._chains = [];
  screen._selectedChainId = null;
  screen._selectedNodeIndex = null;
  screen._recordSort = 'time';
  screen._renderSig = null;
  screen._showBoard = () => {
    calls.showBoard += 1;
    screen._board.hidden = false;
    screen._record.hidden = false;
    screen._stateHost.hidden = true;
  };
  screen._showDataState = () => { calls.dataState += 1; };
  screen._renderHang = () => { calls.hang += 1; };
  screen._renderBoard = () => { calls.board += 1; };
  screen._renderRecord = () => { calls.record += 1; };
  screen._renderVerbs = () => { calls.verbs += 1; };
  screen._queueEdgeDraw = () => { calls.edges += 1; };
  return { state, screen, calls };
}

test('the board builds once and skips while its inputs are unchanged', () => {
  const { screen, calls } = bootScreen([makeChain('chain_1')]);
  screen.refresh(screen._ctx);
  assert.equal(calls.board, 1);
  assert.equal(calls.edges, 1);

  // The cadence fires again with nothing changed: no rebuild, no rect-reading edge redraw.
  screen.refresh(screen._ctx);
  assert.equal(calls.board, 1);
  assert.equal(calls.hang, 1);
  assert.equal(calls.record, 1);
  assert.equal(calls.verbs, 1);
  assert.equal(calls.edges, 1);
  assert.equal(calls.showBoard, 1);
});

test('the live header sentence is still rewritten on skipped passes', () => {
  const { screen, calls } = bootScreen([makeChain('chain_1')]);
  screen.refresh(screen._ctx);
  assert.equal(calls.board, 1);
  assert.ok(screen._titleLine.textContent.length > 0, 'the header sentence is written on the build pass');

  // The cadence fires again with nothing changed: the board skips, the live header sentence
  // (heat tier, standing, radius) is still rewritten from state.
  screen._titleLine.textContent = '';
  screen.refresh(screen._ctx);
  assert.equal(calls.board, 1, 'an unchanged state skips the rebuild');
  assert.ok(screen._titleLine.textContent.length > 0, 'the header sentence was rewritten on the skip');
});

test('a credits move rebuilds so the pay/bribe gates cannot go stale', () => {
  const { state, screen, calls } = bootScreen([makeChain('chain_1')]);
  screen.refresh(screen._ctx);
  assert.equal(calls.board, 1);

  // Passive income accrues while the board sits open; the "Pay bounty"/"Bribe" gate text reads
  // live credits, so the signature samples it.
  state.player.credits = (state.player.credits || 0) + 5000;
  screen.refresh(screen._ctx);
  assert.equal(calls.board, 2, 'a credits change moves the signature');
  screen.refresh(screen._ctx);
  assert.equal(calls.board, 2, 'and the next cadence tick skips again');
});

test('an ace returnsBigger flip rebuilds the record', () => {
  const { state, screen, calls } = bootScreen([makeChain('chain_1')]);
  state.provenance.chains[0].nodes.push({ k: 'standing', tick: 120, t: 36, aceId: 'ace_test', factionId: 'faction_free', reason: 'first_contact' });
  state.aceMemory = { ace_test: { name: 'Test Ace', encounterCount: 1, fleeCount: 0, flungCount: 0, returnTier: 0, returnsBigger: true } };
  screen.refresh(screen._ctx);
  assert.equal(calls.board, 1);

  // aceMemory._transition('defeated') flips returnsBigger without moving any counter.
  state.aceMemory.ace_test.returnsBigger = false;
  screen.refresh(screen._ctx);
  assert.equal(calls.board, 2, 'the returnsBigger flag is part of the signature');
});

test('a matching signature must not skip while the board is hidden', () => {
  const { screen, calls } = bootScreen([makeChain('chain_1')]);
  screen.refresh(screen._ctx);
  screen.refresh(screen._ctx);
  assert.equal(calls.board, 1);

  // Any path that hides the board (a data-state taking over, a future close/open) must force the
  // next refresh to rebuild even though the signature still matches.
  screen._board.hidden = true;
  screen.refresh(screen._ctx);
  assert.equal(calls.showBoard, 2, 'the visibility clause re-shows the board');
  assert.equal(calls.board, 2);
});

test('a new receipt node moves the signature and rebuilds', () => {
  const { state, screen, calls } = bootScreen([makeChain('chain_1')]);
  screen.refresh(screen._ctx);
  assert.equal(calls.board, 1);

  state.provenance.chains[0].nodes.push({ k: 'incident', tick: 140, t: 40, text: 'patrol responded' });
  screen.refresh(screen._ctx);
  assert.equal(calls.board, 2);
  assert.equal(calls.edges, 2);
});

test('a selection or sort move rebuilds exactly once', () => {
  const { screen, calls } = bootScreen([makeChain('chain_1'), makeChain('chain_2')]);
  screen.refresh(screen._ctx);
  screen._recordSort = 'delta';
  screen.refresh(screen._ctx);
  assert.equal(calls.board, 2, 'the sort word is part of the signature');
  screen.refresh(screen._ctx);
  assert.equal(calls.board, 2, 'and the next cadence tick skips again');
});

test('the guards are wired: skip-before-rebuild, mount reset, data-state guard', () => {
  // Scoped slices (pq024 technique): assert order inside refresh(), not strings somewhere.
  const refreshFrom = SCREEN_SRC.indexOf('  refresh(ctx) {');
  assert.notEqual(refreshFrom, -1, 'refresh() found');
  const refreshTo = SCREEN_SRC.indexOf('  _showDataState(', refreshFrom);
  const refreshBody = SCREEN_SRC.slice(refreshFrom, refreshTo);
  const sigCall = refreshBody.indexOf('this._boardSignature(chains, bounty, state)');
  const guard = refreshBody.indexOf('this._renderSig === signature');
  const rebuild = refreshBody.indexOf('this._renderBoard()');
  assert.notEqual(sigCall, -1, 'refresh computes the board signature');
  assert.notEqual(guard, -1, 'refresh guards on the signature');
  assert.notEqual(rebuild, -1, 'refresh rebuilds the board');
  assert.ok(guard < rebuild, 'the skip happens BEFORE the heavy rebuild');
  assert.ok(sigCall < guard, 'the signature is computed before the guard');

  const mountFrom = SCREEN_SRC.indexOf('  mount(rootEl, ctx) {');
  const mountTo = SCREEN_SRC.indexOf('  onShow(ctx) {', mountFrom);
  const mountBody = SCREEN_SRC.slice(mountFrom, mountTo);
  assert.ok(mountBody.includes('this._renderSig = null'), 'mount() resets the signature with its fresh DOM');

  const dataFrom = SCREEN_SRC.indexOf('  _showDataState(kind, opts) {');
  const dataTo = SCREEN_SRC.indexOf('  _boardSignature(', dataFrom);
  const dataBody = SCREEN_SRC.slice(dataFrom, dataTo);
  const dataGuard = dataBody.indexOf('this._renderSig === sig');
  const dataMount = dataBody.indexOf('mountDataState(');
  assert.notEqual(dataGuard, -1, 'the data-state path guards on its own signature');
  assert.ok(dataGuard < dataMount, 'the data-state guard runs before its DOM mount');
});
