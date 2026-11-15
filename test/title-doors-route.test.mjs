// TITLE-01: the title is two doors; New Game stays reachable with and without a save, and the tooling
// helper presses it the same way in both states.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { pressNewGame, pressTitleAction } from '../scripts/lib/titleRoute.mjs';

const MENU = readFileSync(new URL('../src/ui/screens/mainMenu.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../src/ui/orrery/titleDoorsLayouts.js', import.meta.url), 'utf8');

function fakePage({ moreVisible = false } = {}) {
  const log = [];
  const state = { moreOpen: moreVisible };
  const loc = (sel) => ({
    first: () => loc(sel),
    isVisible: async () => (sel.includes('data-title-more') ? true : !sel.includes('[data-action="circuits"]') || state.moreOpen),
    click: async () => { log.push(['click', sel]); if (sel.includes('data-title-more')) state.moreOpen = true; },
  });
  return { log, locator: loc, waitForSelector: async (sel, opts) => { log.push(['wait', sel, opts.state]); } };
}

test('pressNewGame presses the New Game hook and waits for the New Game screen', async () => {
  const page = fakePage();
  await pressNewGame(page);
  assert.deepEqual(page.log[0], ['click', '[data-screen="mainMenu"] [data-action="newGame"]']);
  assert.equal(page.log[1][0], 'wait');
  assert.deepEqual(page.log[page.log.length - 1], ['wait', '[data-screen="newGame"]', 'visible']);
});

test('pressNewGame answers the "Start a new game?" ask that a save on disk puts first', async () => {
  const page = fakePage();
  const base = page.locator;
  page.locator = (sel) => (sel.includes('sf-confirm__ok')
    ? { first: () => ({ isVisible: async () => true, click: async () => { page.log.push(['click', sel]); } }) }
    : base(sel));
  await pressNewGame(page);
  assert.ok(page.log.some((e) => e[0] === 'click' && e[1].includes('sf-confirm__ok')));
});

test('pressTitleAction opens More first for an action that lives behind it', async () => {
  const page = fakePage();
  await pressTitleAction(page, 'circuits');
  assert.ok(page.log[0][1].includes('data-title-more'));
  assert.ok(page.log[1][1].includes('[data-action="circuits"]'));
});

test('with a save the Adventure door is Continue and New Game stays a visible key on it, never behind More', () => {
  assert.match(MENU, /hasSave \? cont : ng/);
  assert.match(MENU, /of-title-door-secondary/);
  assert.match(CSS, /li\.of-title-door-secondary/);
  // New Game is not one of the actions folded behind More
  assert.match(CSS, /const MORE_ACTIONS = \['load', 'crucible', 'archive', 'circuits', 'sandbox', 'physics'\]/);
  // the button's own text is the core copy, so the door's word is drawn from data-door-label
  assert.match(MENU, /doorLabel = 'Adventure'/);
  assert.match(MENU, /Start a new game\?/);
});
