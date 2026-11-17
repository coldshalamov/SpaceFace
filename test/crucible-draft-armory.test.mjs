// Swarm launches only through its explicit forward control. Escape/controller Cancel can
// focus that control and explain the choice, but never turn a second press or an empty wallet
// into deployment. This exercises the real handlers over the stub DOM; native Enter/Space
// activation and visual hit targets are covered by check-swarm-hangar-ux.mjs.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  affordableOfferCount,
  crucibleDraftScreen,
  launchGuardLine,
} from '../src/ui/screens/crucibleDraft.js';
import { fakeDom } from './helpers/fake-dom.mjs';

const offer = (id, extra = {}) => ({
  id, name: `Card ${id}`, price: 50, available: true, purchased: false,
  defId: 'wpn_autocannon_s', kind: 'weapon', verb: 'Ram', blurb: 'A blunt idea.', ...extra,
});

/** Mount the real draft screen over the stub DOM; `restore()` puts the global document back. */
function mountShop({ ruleset = 'swarm', credits = 80, offers = [offer('a')], run = {} } = {}) {
  const savedDocument = globalThis.document;
  const doc = fakeDom();
  globalThis.document = doc;
  const root = doc._make('div');
  const emitted = [];
  const listeners = new Map();
  const owner = {
    currentOffers: () => offers,
    currentWave: () => ctx.state.run.wave,
    preparationGeneration: () => 1,
    lastNotice: () => null,
    rerollState: () => null,
    recommendedOffers: () => [],
  };
  const ctx = {
    state: { run: { kind: 'survival', phase: 'draft', ruleset, credits,
      wave: 3, wavePlanId: 'round-three', retireToken: 1, ...run }, player: { ownedShips: [] } },
    helpers: { workerReadGeneration: () => 1 },
    registry: { get: (name) => (name === 'survivalDraft' ? owner : null) },
    screenManager: { top: () => 'crucibleDraft' },
    bus: {
      emit(name, payload) {
        emitted.push([name, payload]);
        for (const fn of listeners.get(name) || []) fn(payload);
      },
      on(name, fn) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(fn);
        return () => listeners.get(name).delete(fn);
      },
      off() {},
    },
  };
  const screen = Object.create(crucibleDraftScreen);
  screen.mount(root, ctx);
  screen.refresh(ctx);
  let focused = 0;
  screen._skip.focus = () => { focused += 1; };
  const press = (key) => {
    let stopped = 0;
    const event = {
      key, target: root, defaultPrevented: false, altKey: false, ctrlKey: false, metaKey: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { stopped += 1; },
    };
    for (const fn of root.listeners.keydown || []) fn(event);
    return { event, stopped };
  };
  const picks = () => emitted.filter(([name]) => name === 'run:draftPickRequested');
  const restore = () => {
    if (savedDocument === undefined) delete globalThis.document;
    else globalThis.document = savedDocument;
  };
  return { screen, ctx, press, picks, emitted, focused: () => focused, restore, offers };
}

test('affordableOfferCount counts only what the wallet can buy now', () => {
  assert.equal(affordableOfferCount([]), 0);
  assert.equal(affordableOfferCount(null), 0);
  assert.equal(affordableOfferCount([offer('a'), offer('b')]), 2);
  assert.equal(affordableOfferCount([
    offer('poor', { available: false }),
    offer('fitted', { purchased: true }),
    offer('cradle', { kind: 'hull', _flying: true }),
    offer('switch', { kind: 'hull', _ownedIndex: 1, price: 0 }),
    offer('weld', { kind: 'service', defId: 'svc_weld' }),
  ]), 1, 'unaffordable, fitted, the flown hull and a free hull switch are not cards to buy');
});

test('launchGuardLine explains available purchases without advertising Cancel as deployment', () => {
  for (const count of [0, 1, 2]) {
    const line = launchGuardLine(count);
    assert.ok(line.length > 0, 'Cancel provides a useful explanation even at zero credits.');
    if (count > 0) assert.ok(line.includes(String(count)), 'The available-purchase count remains truthful.');
    assert.doesNotMatch(line, /\b(?:Esc(?:ape)?|Cancel) again\b/i);
  }
});

test('affordable equipment and repeated Escape never deploy or spend the wallet', () => {
  const m = mountShop({ credits: 80, offers: [offer('a'), offer('b', { available: false, price: 500 })] });
  try {
    for (let press = 0; press < 4; press++) {
      const key = m.press('Escape');
      assert.equal(key.event.defaultPrevented, true, 'the key is owned end to end');
      assert.equal(key.stopped, 1, 'Cancel never reaches the flight handler');
      assert.deepEqual(m.picks(), [], 'Repeated Cancel is never consent to deploy.');
      assert.equal(m.focused(), press + 1, 'Cancel points to the explicit forward control.');
      assert.ok(m.screen._note.textContent.length > 0);
      assert.equal(m.screen._note.attributes.role, 'status', 'The explanation is announced.');
      assert.equal(m.ctx.state.run.credits, 80);
      assert.equal(m.ctx.state.run.phase, 'draft');
    }
  } finally { m.restore(); }
});

test('zero starting credits do not turn Escape into a deployment shortcut', () => {
  const m = mountShop({ credits: 0, offers: [offer('a', { available: false }), offer('b', { available: false })] });
  try {
    m.press('Escape'); m.press('Escape');
    assert.deepEqual(m.picks(), []);
    assert.equal(m.focused(), 2);
    assert.equal(m.ctx.state.run.phase, 'draft');
  } finally { m.restore(); }
});

test('pad cancel uses the Escape guard and only the visible armory answers', () => {
  const m = mountShop();
  try {
    m.screen.onShow();
    const focusedBefore = m.focused();
    m.ctx.bus.emit('ui:cancel', {});
    assert.equal(m.picks().length, 0, 'first B warns without launching');
    assert.equal(m.focused(), focusedBefore + 1);
    assert.ok(m.screen._note.textContent.length > 0);
    m.ctx.bus.emit('ui:cancel', {});
    assert.deepEqual(m.picks(), [], 'A second controller Cancel also cannot deploy.');
    const beforeCovered = m.focused();
    m.ctx.screenManager.top = () => 'crucibleRefit';
    m.ctx.bus.emit('ui:cancel', {});
    assert.equal(m.focused(), beforeCovered, 'A covering screen owns its Cancel.');
    m.screen.onHide();
    m.ctx.screenManager.top = () => 'crucibleDraft';
    m.ctx.bus.emit('ui:cancel', {});
    assert.equal(m.focused(), beforeCovered, 'Hidden armory unsubscribes.');
    assert.deepEqual(m.picks(), []);
  } finally { m.screen.dispose(); m.restore(); }
});

test('controller Cancel remains non-deploying with no affordable equipment', () => {
  const m = mountShop({ credits: 0, offers: [offer('a', { available: false })] });
  try {
    m.screen.onShow();
    m.ctx.bus.emit('ui:cancel', {}); m.ctx.bus.emit('ui:cancel', {});
    assert.deepEqual(m.picks(), []);
  } finally { m.screen.dispose(); m.restore(); }
});

test('an empty equipment shelf still requires explicit deployment', () => {
  const m = mountShop({ credits: 900, offers: [] });
  try {
    m.press('Escape'); m.press('Escape');
    assert.deepEqual(m.picks(), []);
    m.screen._skip.click();
    assert.deepEqual(m.picks(), [['run:draftPickRequested', { offerId: null }]]);
  } finally { m.restore(); }
});

test('the Gauntlet keeps its loadout on the first Escape, whatever the wallet', () => {
  const m = mountShop({ ruleset: 'scored', credits: 900, offers: [offer('a'), offer('b'), offer('c')] });
  try {
    assert.equal(m.screen._skip.dataset.label, 'Keep current loadout');
    m.press('Escape');
    assert.deepEqual(m.picks(), [['run:draftPickRequested', { offerId: null }]]);
    assert.equal(m.focused(), 0);
  } finally { m.restore(); }
});

test('the explicit forward control deploys with or without a preceding Cancel', () => {
  const warned = mountShop({ offers: [offer('a'), offer('b')] });
  try {
    warned.press('Escape');
    assert.equal(warned.picks().length, 0);
    warned.screen._skip.click();
    assert.equal(warned.picks().length, 1, 'explicit Launch resolves as today');
  } finally { warned.restore(); }

  const direct = mountShop({ offers: [offer('a'), offer('b')] });
  try {
    direct.screen._skip.click();
    assert.equal(direct.picks().length, 1, 'a click is not guarded');
  } finally { direct.restore(); }
});

test('spending the last credits does not change the meaning of Cancel', () => {
  const m = mountShop({ credits: 80, offers: [offer('a')] });
  try {
    m.press('Escape');
    assert.equal(m.picks().length, 0);
    // The player buys the card: the owner's shelf now has nothing buyable, and the screen repaints.
    m.offers[0].purchased = true;
    m.offers[0].available = false;
    m.ctx.state.run.credits = 30;
    m.screen.refresh(m.ctx);
    assert.doesNotMatch(m.screen._note.textContent, /afford/, 'the old count is not left on the line');
    m.press('Escape');
    assert.deepEqual(m.picks(), [], 'Cancel remains non-deploying after a purchase.');
    m.screen._skip.click();
    assert.deepEqual(m.picks(), [['run:draftPickRequested', { offerId: null }]]);
  } finally { m.restore(); }
});

test('a repaint with affordable equipment cannot turn repeated Cancel into consent', () => {
  const m = mountShop({ credits: 200, offers: [offer('a'), offer('b')] });
  try {
    m.press('Escape');
    m.offers[0].purchased = true;
    m.offers[0].available = false;
    m.ctx.state.run.credits = 150;
    m.screen.refresh(m.ctx);
    m.press('Escape');
    assert.equal(m.picks().length, 0, 'the shelf changed since the warning, so it is read fresh');
    assert.ok(m.screen._note.textContent.length > 0);
    m.press('Escape');
    assert.deepEqual(m.picks(), []);
  } finally { m.restore(); }
});

test('Escape inside the search field still backs out of the field first, launching nothing', () => {
  const m = mountShop({ offers: [offer('a')] });
  try {
    m.screen._search.value = 'cannon';
    m.screen._search.blur = () => {};
    const event = {
      key: 'Escape', target: m.screen._search, defaultPrevented: false, altKey: false, ctrlKey: false, metaKey: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
    };
    for (const fn of m.screen._root.listeners.keydown || []) fn(event);
    assert.equal(m.screen._search.value, '');
    assert.equal(m.picks().length, 0);
    assert.doesNotMatch(m.screen._note.textContent, /afford/, 'the guard is the shop key, not the field key');
    assert.equal(m.ctx.state.run.phase, 'draft');
  } finally { m.restore(); }
});

test('Back to hangar explains discarded purchases and is available only in opening preparation', () => {
  for (const startWave of [1, 11]) {
    const m = mountShop({ run: { wave: startWave - 1, wavePlanId: null, telemetry: { startWave } } });
    try {
      m.screen.onShow();
      assert.equal(m.screen._backToHangar.hidden, false);
      assert.equal(m.screen._preparationReturnNote.hidden, false);
      assert.match(m.screen._preparationReturnNote.textContent, /purchases.*discard|discards purchases/i);
      assert.match(m.screen._preparationReturnNote.textContent, /ship choice.*run settings.*kept/i);
      assert.equal(m.screen._backToHangar.getAttribute('aria-describedby'), m.screen._preparationReturnNote.id);
      m.screen._backToHangar.click();
      m.screen._backToHangar.click();
      assert.deepEqual(m.emitted.filter(([name]) => name === 'ui:cancelSwarmPreparation'),
        [['ui:cancelSwarmPreparation', { token: 1 }]], 'one pending cancellation request');
      assert.equal(m.ctx.state.run.phase, 'draft', 'the presentation cannot end the run itself');
      assert.equal(m.screen._skip.disabled, true);
      m.screen._skip.click();
      assert.deepEqual(m.picks(), [], 'a pending return cannot also launch');
      m.ctx.bus.emit('run:preparationCancelResolved', { token: 1, ok: false, reason: 'preparation_changed' });
      assert.equal(m.screen._backToHangar.disabled, false, 'refusal releases the waiting control');
      assert.equal(m.screen._skip.disabled, false);
      m.ctx.state.run.wave = startWave;
      m.ctx.state.run.wavePlanId = 'first-completed-round';
      m.screen.refresh(m.ctx);
      assert.equal(m.screen._backToHangar.hidden, true);
      assert.equal(m.screen._preparationReturnNote.hidden, true);
    } finally { m.screen.dispose(); m.restore(); }
  }
});

test('a pending GPU warm may launch only the preparation that requested it', async () => {
  const m = mountShop({ run: { wave: 0, wavePlanId: null } });
  try {
    let finishWarm;
    m.ctx.state.render = { swarmDeferredWarm: { pending: true,
      promise: new Promise(resolve => { finishWarm = resolve; }) } };
    m.screen._skip.click();
    assert.deepEqual(m.picks(), []);
    finishWarm();
    await new Promise(resolve => queueMicrotask(() => queueMicrotask(resolve)));
    assert.equal(m.picks().length, 1, 'the original explicit launch continues after its own warm');
    assert.equal(m.screen._warmLaunchTimer, null);
  } finally { m.screen.dispose(); m.restore(); }
});

test('a late GPU warm cannot deploy a successor draft or a newer worker generation', async () => {
  for (const changed of ['run', 'worker', 'hidden']) {
    const m = mountShop({ run: { wave: 0, wavePlanId: null } });
    try {
      let finishWarm;
      m.ctx.state.render = { swarmDeferredWarm: { pending: true,
        promise: new Promise(resolve => { finishWarm = resolve; }) } };
      m.screen._skip.click();
      if (changed === 'run') m.ctx.state.run = { ...m.ctx.state.run, retireToken: 2 };
      if (changed === 'worker') m.ctx.helpers.workerReadGeneration = () => 2;
      if (changed === 'hidden') { m.screen.onHide(); m.screen.onShow(); }
      finishWarm();
      await new Promise(resolve => queueMicrotask(() => queueMicrotask(resolve)));
      assert.deepEqual(m.picks(), [], changed);
      assert.equal(m.ctx.state.run.phase, 'draft');
      assert.equal(m.screen._warmHold, false);
    } finally { m.screen.dispose(); m.restore(); }
  }
});

test('Back invalidates the pending launch even if cancellation is refused', async () => {
  const m = mountShop({ run: { wave: 0, wavePlanId: null } });
  try {
    m.screen.onShow();
    let finishWarm;
    m.ctx.state.render = { swarmDeferredWarm: { pending: true,
      promise: new Promise(resolve => { finishWarm = resolve; }) } };
    m.screen._skip.click();
    m.screen._backToHangar.click();
    m.ctx.bus.emit('run:preparationCancelResolved', { token: 1, ok: false });
    finishWarm();
    await new Promise(resolve => queueMicrotask(() => queueMicrotask(resolve)));
    assert.deepEqual(m.picks(), []);
    assert.equal(m.screen._skip.disabled, false, 'the next launch still needs an explicit press');
  } finally { m.screen.dispose(); m.restore(); }
});
