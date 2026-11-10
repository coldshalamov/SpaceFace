// Research P07 residual (design/program/research-2026-10-02/ADMITTED_REPAIRS.md §G): the
// Research screen's Unlock action must not narrate its own outcome. ships.unlockTech is the
// synchronous owner of the research mutation and already toasts the one terminal line itself —
// "Researched X" on success, the blocker-naming error on refusal. The screen's optimistic
// "Researching…" toast used to land AFTER that owner line on both outcomes, so a refused unlock
// read as a real error plus a false promise of work. These tests pin the live route: the real
// screen singleton emits ui:unlockTech on a real bus with the real ships owner bound, and the
// toast stream must hold exactly the owner's line — never a "Researching" line.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { economy } from '../src/systems/economy.js';
import { ships } from '../src/systems/ships.js';
import { techTreeScreen } from '../src/ui/screens/techTree.js';

const SEED = 4242;

function boot() {
  const state = createGameState(SEED);
  const bus = createBus();
  const toasts = [];
  bus.on('toast', (t) => toasts.push(t));
  const ctx = {
    state,
    bus,
    helpers: {},
    registry: { get: (name) => (name === 'ships' ? ships : name === 'economy' ? economy : null) },
  };
  economy.init(ctx);
  ships.init(ctx);
  if (economy.newGame) economy.newGame();
  if (ships.newGame) ships.newGame();
  // The real screen singleton, headless: _root stays null so refresh() early-returns, exactly
  // the slice of the screen the Unlock press runs in a live host before the repaint.
  techTreeScreen._ctx = ctx;
  techTreeScreen._root = null;
  return { state, bus, toasts };
}

/** A root tech node (no prereqs) whose gate is credits alone — the plain unaffordable press. */
function rootNode(needle) {
  const node = techTreeNodes().find((n) => !(n.prereqs && n.prereqs.length) && n.id.includes(needle));
  assert.ok(node, 'a root node matching ' + needle + ' exists');
  return node;
}

let nodeCache = null;
function techTreeNodes() {
  if (!nodeCache) nodeCache = [...techTreeScreen._nodes()];
  return nodeCache;
}

test('refused unlock reads exactly one toast — the owner error naming the blocker; no Researching line', () => {
  const { state, toasts } = boot();
  const node = rootNode('tech_combat_basics'); // prereqs: [], cost 1200 cr
  state.player.credits = 0; // close the credits gate only
  state.player.researchPoints = 50;
  assert.equal(ships.researchable(node.id), false, 'the fixture is refused before the press');

  techTreeScreen._selectedId = node.id;
  techTreeScreen._onAction('unlock');

  assert.equal(toasts.length, 1, 'exactly one toast, got: ' + JSON.stringify(toasts));
  assert.equal(toasts[0].kind, 'error', 'the one toast is the owner refusal');
  assert.match(toasts[0].text, /more cr to research/, 'the refusal names the credits blocker');
  assert.ok(toasts[0].text.includes(node.name), 'the refusal names the node');
  assert.equal(
    toasts.some((t) => /researching/i.test(String(t.text))),
    false,
    'no "Researching…" toast accompanies a settled refusal',
  );
  assert.equal(state.player.researchedNodes.includes(node.id), false, 'nothing was researched');
});

test('affordable unlock reads exactly one toast — the owner success line; none from the screen', () => {
  const { state, toasts } = boot();
  const node = rootNode('tech_deflector_theory'); // prereqs: [], cost 1100 cr
  state.player.credits = (node.cost.credits || 0) + 500;
  state.player.researchPoints = (node.cost.rp || 0) + 50;
  assert.equal(ships.researchable(node.id), true, 'the fixture is affordable before the press');

  techTreeScreen._selectedId = node.id;
  techTreeScreen._onAction('unlock');

  assert.equal(toasts.length, 1, 'exactly one toast, got: ' + JSON.stringify(toasts));
  assert.equal(toasts[0].kind, 'success', 'the one toast is the owner success');
  assert.equal(toasts[0].text, 'Researched ' + (node.name || node.id));
  assert.equal(
    toasts.some((t) => /researching/i.test(String(t.text))),
    false,
    'no "Researching…" toast rides along a settled success',
  );
  assert.ok(state.player.researchedNodes.includes(node.id), 'the owner did the research');
});

test('the Unlock action itself emits the intent only — no toast emit lives in _onAction', async () => {
  const src = await readFile(new URL('../src/ui/screens/techTree.js', import.meta.url), 'utf8');
  const start = src.indexOf('_onAction(');
  assert.ok(start > 0, '_onAction exists');
  const end = src.indexOf('_researchSignature(', start);
  assert.ok(end > start, 'the method slice is bounded');
  const body = src.slice(start, end).replace(/^\s*\/\/.*$/gm, ''); // drop comment lines
  assert.match(body, /emit\('ui:unlockTech'/, 'the action still emits the owner intent');
  assert.doesNotMatch(body, /emit\('toast'/, 'the screen adds no toast of its own');
});
