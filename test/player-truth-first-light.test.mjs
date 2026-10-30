import test from 'node:test';
import assert from 'node:assert/strict';
import { isFirstLightPrompt, installFirstLightPromptHandler } from '../scripts/player-truth/routes.mjs';

test('the public settings actor only accepts the known First light choices', () => {
  assert.equal(isFirstLightPrompt('First light','Keep my settings'),true);
  assert.equal(isFirstLightPrompt(' First light ','KEEP MY SETTINGS\n'),true);
  assert.equal(isFirstLightPrompt('First light','Keep my settingsESC'),true);
  assert.equal(isFirstLightPrompt('First light','Keep my settings ESC'),true);
  assert.equal(isFirstLightPrompt('First light','Use first light ESC','Play'),true);
  assert.equal(isFirstLightPrompt('First light','Use first light ESC','Buy'),false);
  assert.equal(isFirstLightPrompt('Abandon the ship?','Keep my settings'),false);
  assert.equal(isFirstLightPrompt('First light','Confirm purchase'),false);
});

function fixture({ title = 'First light', visible = true, cancel = 'Use first light', confirm = 'Play',
  cancelVisible = true, confirmText = confirm, clickError = null } = {}) {
  const clicks = [], events = [];
  let handler, handlerOptions, registrations = 0;
  const control = (name, raw, shown = true) => ({
    name, raw, shown,
    first() { return this; },
    async waitFor() { if (!shown) throw new Error('cancel precondition unavailable'); },
    async textContent() { return raw; },
    async click(options) {
      assert.equal(options, undefined, 'trusted default click; no force or dispatch bypass');
      if (clickError && name === 'Play') throw clickError;
      clicks.push(name);
    },
  });
  const cancelControl = control(cancel, `${cancel} ESC`, cancelVisible);
  const confirmControl = control(confirm, confirmText);
  const controls = [cancelControl, confirmControl];
  const titleLocator = { first() { return this; }, filter() { return this; },
    async isVisible() { return visible; }, async textContent() { return title; } };
  const dialog = {
    getByRole(role, options = {}) {
      assert.equal(role, 'button');
      const matches = controls.filter(button => button.shown && (!options.name
        || (options.name instanceof RegExp ? options.name.test(button.name) : options.name === button.name)));
      return { async count() { return matches.length; },
        async allTextContents() { return matches.map(button => button.raw); },
        async click(options) { assert.equal(matches.length, 1); return matches[0].click(options); } };
    },
  };
  const page = {
    locator(selector) { return selector.includes('__cancel') ? cancelControl : selector.includes('__ok') ? confirmControl : titleLocator; },
    getByRole(role, options) {
      assert.equal(role, 'dialog');
      assert.deepEqual(options, { name: 'First light', exact: true });
      return dialog;
    },
    async addLocatorHandler(_locator, callback, options) {
      registrations++;
      handlerOptions = options;
      handler = callback;
    },
  };
  return { page, clicks, events, get registrations() { return registrations; },
    get handlerOptions() { return handlerOptions; },
    install: () => installFirstLightPromptHandler(page, (...row) => events.push(row)),
    answer: () => handler() };
}

test('visible known First light clicks Play without a cancel-control precondition', async () => {
  const f = fixture({ cancelVisible: false });
  await f.install(); await f.install();
  assert.equal(f.registrations, 1, 'late prompt handler registers once');
  await f.answer();
  assert.deepEqual(f.clicks, ['Play']);
  assert.match(f.events[0][2], /Play.*shipped settings/);
});

test('the actor selects the accessible Play name rather than decorated raw text', async () => {
  const f = fixture({ confirmText: 'Play ENTER' });
  await f.install(); await f.answer();
  assert.deepEqual(f.clicks, ['Play']);
});

test('the locator handler does not wait for its title to hide inside another action deadline', async () => {
  const f = fixture();
  await f.install();
  await f.answer();
  assert.deepEqual(f.clicks, ['Play']);
  assert.deepEqual(f.handlerOptions, { noWaitAfter: true });
  assert.equal(f.events.length, 1, 'the settings choice is recorded once');
});

test('Play takes precedence when legacy Keep my settings is also present', async () => {
  const f = fixture({ cancel: 'Keep my settings' });
  await f.install(); await f.answer();
  assert.deepEqual(f.clicks, ['Play']);
});

test('legacy Keep my settings is clicked by its accessible name despite the ESC keycap', async () => {
  const f = fixture({ cancel: 'Keep my settings', confirm: 'Use first light' });
  await f.install(); await f.answer();
  assert.deepEqual(f.clicks, ['Keep my settings']);
  assert.match(f.events[0][2], /Keep my settings.*shipped settings/);
});

test('another confirmation title is never answered even when it offers Play', async () => {
  const f = fixture({ title: 'Confirm purchase' });
  await f.install(); await f.answer();
  assert.deepEqual(f.clicks, []);
});

test('an absent prompt is left alone', async () => {
  const f = fixture({ visible: false });
  await f.install(); await f.answer();
  assert.deepEqual(f.clicks, []);
});

test('unsupported controls on a visible known dialog fail explicitly', async () => {
  const f = fixture({ cancel: 'Cancel', confirm: 'Buy' });
  await f.install();
  await assert.rejects(f.answer(), /First light.*supported.*Play.*Keep my settings/);
  assert.deepEqual(f.clicks, []);
  assert.deepEqual(f.events, [], 'no false successful answer');
});

test('a failed Play action remains a gate error and never falls back to a settings change', async () => {
  const error = new Error('Play did not become actionable');
  const f = fixture({ cancel: 'Keep my settings', clickError: error });
  await f.install();
  await assert.rejects(f.answer(), actual => actual === error);
  assert.deepEqual(f.clicks, []);
  assert.deepEqual(f.events, []);
});
