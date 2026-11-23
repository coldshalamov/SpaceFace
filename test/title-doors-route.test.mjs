// TITLE-02: the title is two doors; New Game stays reachable with and without a save, and the tooling
// helper presses it the same way in both states. Practice and test modes are off a player's title.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { pressNewGame, pressTitleAction } from '../scripts/lib/titleRoute.mjs';

const MENU = readFileSync(new URL('../src/ui/screens/mainMenu.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../src/ui/orrery/titleDoorsLayouts.js', import.meta.url), 'utf8');

function fakePage({ labVisible = false } = {}) {
  const log = [];
  const loc = (sel) => ({
    first: () => loc(sel),
    isVisible: async () => (sel.includes('[data-action="circuits"]') ? labVisible : true),
    click: async () => { log.push(['click', sel]); },
    evaluate: async () => { log.push(['dom-click', sel]); },
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

test('pressTitleAction reaches a hidden lab verb through its own handler, and a shown one by a click', async () => {
  const hidden = fakePage();
  await pressTitleAction(hidden, 'circuits');
  assert.ok(hidden.log.some((e) => e[0] === 'dom-click' && e[1].includes('[data-action="circuits"]')));
  const shown = fakePage({ labVisible: true });
  await pressTitleAction(shown, 'circuits');
  assert.deepEqual(shown.log[0], ['click', '[data-screen="mainMenu"] [data-action="circuits"]']);
});

test('with a save the Adventure door is Continue and New Game steps into the small row as its plain word', () => {
  assert.match(MENU, /const adventure = hasSave \? cont : ng/);
  assert.match(MENU, /ng\.classList\.add\('of-title-row-item'\)/);
  assert.match(CSS, /of-title-row-item > button\.of-door > \.of-door__plain \{ display:inline !important; \}/);
  assert.match(MENU, /Start a new game\?/);
});

test('the doors are the composition at every size, and the lab verbs are hidden unless the dev switch is on', () => {
  assert.match(MENU, /rootEl\.classList\.add\(phone \? 'orr-title--phone' : 'orr-title', 'orr-title--doors'\)/);
  assert.doesNotMatch(MENU, /createArcRail\(/, 'the dial is retired from the title');
  assert.match(MENU, /const labOpen = titleLabOpen\(\);/);
  assert.match(MENU, /for \(const li of aside\.children\) li\.hidden = !labOpen;/);
  assert.match(MENU, /if \(!IS_DEV\) return false;/);
});
