import test from 'node:test';
import assert from 'node:assert/strict';
import { answerFirstRunPrompt, isFirstLightPrompt, installFirstLightPromptHandler } from '../scripts/player-truth/routes.mjs';

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
  cancelVisible = true, confirmText = confirm, clickError = null, reenterHandlerDuringPlay = false,
  closePageOnClickError = false } = {}) {
  const clicks = [], events = [];
  const locatorClicks = [], mouseClicks = [];
  let handler, handlerOptions, handlerSelector, registrations = 0;
  let handlerInvocations = 0;
  let active = visible;
  let pageClosed = false;
  let reentered = false;
  let beforeFirstCount = null;
  const control = (name, raw, shown = true) => ({
    name, raw, shown,
    first() { return this; },
    async isVisible() { return active && this.shown; },
    async isEnabled() { return true; },
    async boundingBox() { return active && this.shown ? { x: 100, y: 200, width: 80, height: 30 } : null; },
    async waitFor() { if (!shown) throw new Error('cancel precondition unavailable'); },
    async textContent() { return raw; },
    async click(options) {
      locatorClicks.push(name);
      assert.equal(options, undefined, 'trusted default click; no force or dispatch bypass');
      if (reenterHandlerDuringPlay && name === 'Play' && handler && !reentered) {
        reentered = true;
        await handler();
      }
      return this.activate();
    },
    async activate() {
      if (clickError && name === 'Play') {
        if (closePageOnClickError) pageClosed = true;
        throw clickError;
      }
      clicks.push(name);
      active = false;
      cancelControl.shown = false;
      confirmControl.shown = false;
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
      const matches = () => controls.filter(button => active && button.shown && (!options.name
        || (options.name instanceof RegExp ? options.name.test(button.name) : options.name === button.name)));
      const selected = () => matches()[0];
      return { async count() { return matches().length; },
        async allTextContents() { return matches().map(button => button.raw); },
        async isVisible() { return matches().length === 1; },
        async isEnabled() { return matches().length === 1; },
        async boundingBox() { return selected()?.boundingBox() || null; },
        async click(options) { const current = matches(); assert.equal(current.length, 1); return current[0].click(options); } };
    },
  };
  const page = {
    locator(selector) { handlerSelector = selector; return selector.includes('__cancel') ? cancelControl : selector.includes('__ok') ? confirmControl : titleLocator; },
    async evaluate() { return active && title.trim() === 'First light'; },
    getByRole(role, options) {
      assert.equal(role, 'dialog');
      assert.deepEqual(options, { name: 'First light', exact: true });
      return dialog;
    },
    mouse: { async click(x, y) {
      assert.equal(x, 140, 'public coordinate input clicks the center of the actual visible control');
      assert.equal(y, 215, 'public coordinate input clicks the center of the actual visible control');
      const choice = controls.find((button) => active && button.shown && button.name === 'Play')
        || controls.find((button) => active && button.shown && button.name === 'Keep my settings');
      assert.ok(choice, 'the selected public prompt control is still present at click time');
      mouseClicks.push(choice.name);
      await choice.activate();
    } },
    async waitForFunction(_fn, _arg, _options) {
      assert.equal(active, false, 'the trusted click dismissed the active prompt');
    },
    async addLocatorHandler(locator, callback, options) {
      registrations++;
      handlerSelector = locator.selector || handlerSelector;
      handlerOptions = options;
      handler = async () => { handlerInvocations++; return callback(); };
    },
    isClosed() { return pageClosed; },
  };
  const dialogButtons = dialog.getByRole.bind(dialog);
  dialog.getByRole = (role, options = {}) => {
    const locator = dialogButtons(role, options);
    if (role === 'button' && options.name instanceof RegExp) {
      const originalCount = locator.count;
      locator.count = async () => {
        if (beforeFirstCount) {
          const close = beforeFirstCount;
          beforeFirstCount = null;
          close();
        }
        return originalCount();
      };
    }
    return locator;
  };
  return { page, clicks, events, get registrations() { return registrations; },
    locatorClicks, mouseClicks, get handlerInvocations() { return handlerInvocations; },
    get handlerOptions() { return handlerOptions; }, get handlerSelector() { return handlerSelector; },
    closeBeforeCounts() { beforeFirstCount = () => { active = false; cancelControl.shown = false; confirmControl.shown = false; }; },
    install: () => installFirstLightPromptHandler(page, (...row) => events.push(row)),
    answer: () => handler(),
    answerDirect: () => answerFirstRunPrompt(page, (...row) => events.push(row)) };
}

test('visible known First light clicks Play without a cancel-control precondition', async () => {
  const f = fixture({ cancelVisible: false });
  await f.install(); await f.install();
  assert.equal(f.registrations, 1, 'late prompt handler registers once');
  await f.answer();
  assert.deepEqual(f.clicks, ['Play']);
  assert.deepEqual(f.mouseClicks, ['Play']);
  assert.deepEqual(f.locatorClicks, [], 'the handler never asks Playwright to run its own locator handler');
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
  assert.match(f.handlerSelector, /#sf-confirm-root\.sf-confirm--in #sf-confirm-title/,
    'the handler only owns an actively presented confirm, not its closing fade');
  assert.equal(f.events.length, 1, 'the settings choice is recorded once');
});

test('the public locator handler answers with trusted coordinates and never nests its own actionability handler', async () => {
  const f = fixture({ reenterHandlerDuringPlay: true });
  await f.install();
  await f.answer();
  assert.deepEqual(f.clicks, ['Play']);
  assert.deepEqual(f.mouseClicks, ['Play']);
  assert.deepEqual(f.locatorClicks, []);
  assert.equal(f.handlerInvocations, 1, 'the Play activation did not recursively invoke the prompt handler');
  assert.equal(f.events.length, 1, 'the public choice is recorded exactly once');
});

test('a direct public answer shares the trusted-coordinate path when a locator handler is installed', async () => {
  const f = fixture({ reenterHandlerDuringPlay: true });
  await f.install();
  await f.answerDirect();
  assert.deepEqual(f.clicks, ['Play']);
  assert.deepEqual(f.mouseClicks, ['Play']);
  assert.deepEqual(f.locatorClicks, [], 'direct answer shares the reentrancy-safe coordinate path');
  assert.equal(f.events.length, 1, 'the direct answer is recorded exactly once');
});

test('a prompt dismissed between active read and accessible controls is treated as dismissed', async () => {
  const f = fixture();
  await f.install();
  f.closeBeforeCounts();
  await f.answer();
  assert.deepEqual(f.clicks, [], 'the actor never clicks after the prompt has started closing');
  assert.deepEqual(f.events, [], 'a stale callback is not reported as a settings choice');
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

test('page-close rejection during handler teardown does not escape as an unhandled actor error', async () => {
  const error = new Error('Target page, context or browser has been closed');
  const f = fixture({ clickError: error, closePageOnClickError: true });
  await f.install();
  await f.answer();
  assert.deepEqual(f.clicks, []);
  assert.deepEqual(f.events, [], 'teardown never reports a choice that did not complete');
});
