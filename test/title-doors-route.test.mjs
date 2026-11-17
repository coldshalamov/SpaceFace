// Title player routes: campaign recovery remains available; Swarm opens its hangar before flight.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pressNewGame, pressTitleAction } from '../scripts/lib/titleRoute.mjs';

import { mainMenuScreen, titleVerbOrder } from '../src/ui/screens/mainMenu.js';
import { consumeSwarmPlayEntry } from '../src/ui/crucibleLaunch.js';

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

test('older Crucible probe calls use the same visible Swarm control', async () => {
  const page = fakePage();
  await pressTitleAction(page, 'crucible');
  assert.deepEqual(page.log, [['click', '[data-screen="mainMenu"] [data-action="swarm"]']]);
});

test('Swarm opens the normal setup screen without arming a quick-play bypass', () => {
  consumeSwarmPlayEntry();
  const screens = [];
  const events = [];
  const ctx = {
    screenManager: { hasScreen: () => true, syncVisibility() {}, pushScreen: (id) => screens.push(id) },
    bus: { emit: (...event) => events.push(event) },
  };
  mainMenuScreen._pick(ctx, 'swarm');
  assert.deepEqual(screens, ['crucible']);
  assert.equal(consumeSwarmPlayEntry(), false, 'entering Swarm must not hide ship/loadout setup');
  assert.deepEqual(events, [], 'the title must not emit game:new before setup');
});

test('the title has distinct campaign, hangar, recovery, help and settings actions', () => {
  const actions = titleVerbOrder();
  for (const action of ['continue', 'newGame', 'swarm', 'load', 'settings', 'help']) {
    assert.ok(actions.includes(action), `${action} remains reachable`);
  }
  assert.equal(actions.filter((action) => action === 'swarm').length, 1);
  assert.equal(actions.includes('crucible'), false, 'do not duplicate Swarm as an unexplained second entry');
});
