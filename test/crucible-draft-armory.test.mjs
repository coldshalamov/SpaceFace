// The armory's Escape guard. Esc used to launch the next round on the spot, with the credits the
// player never spent; in the swarm shop, while the wallet still buys something on the shelf, the
// first Esc now only moves focus to Launch and says what is left, and the second one goes.
// Mounted over the stub DOM so the real keydown handler is what these tests press.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  affordableOfferCount,
  crucibleDraftScreen,
  launchGuardLine,
} from '../src/ui/screens/crucibleDraft.js';
import { getPromptDevice, setPromptDevice } from '../src/ui/bindings.js';
import { fakeDom, findAll } from './helpers/fake-dom.mjs';

const offer = (id, extra = {}) => ({
  id, name: `Card ${id}`, price: 50, available: true, purchased: false,
  defId: 'wpn_autocannon_s', kind: 'weapon', verb: 'Ram', blurb: 'A blunt idea.', ...extra,
});

// The inspector mounts only on a visual DOM. Its artwork and layout can stay inert here.
function enableInspector(doc) {
  const create = doc.createElement;
  doc.createElement = doc._make = (tag) => {
    const node = create(tag);
    node.ownerDocument = doc;
    let text = '';
    Object.defineProperty(node, 'textContent', {
      get: () => text + node.children.map(child => child.textContent).join(''),
      set: (next) => { text = next; node.children = []; },
    });
    Object.defineProperty(node, 'innerHTML', { set: (next) => { node.textContent = next; } });
    const detach = (child) => {
      const parent = child.parentNode;
      if (parent) parent.children = parent.children.filter(item => item !== child);
      child.parentNode = null;
    };
    for (const method of ['appendChild', 'insertBefore']) {
      const add = node[method];
      node[method] = (child, before) => { detach(child); return add.call(node, child, before); };
    }
    node.prepend = (...children) => children.reverse().forEach(child => node.insertBefore(child, node.firstChild));
    node.replaceChildren = (...children) => { node.textContent = ''; node.append(...children); };
    node.remove = () => detach(node);
    node.removeEventListener = (name, fn) => {
      node.listeners[name] = (node.listeners[name] || []).filter(listener => listener !== fn);
    };
    node.querySelectorAll = selector => findAll(node, child => child !== node && (selector.startsWith('.')
      ? child.classList.contains(selector.slice(1)) : selector === 'button:not(:disabled)'
        ? child.tagName === 'button' && !child.disabled : child.tagName === selector));
    node.querySelector = selector => node.querySelectorAll(selector)[0] || null;
    return node;
  };
  doc.createElementNS = (_namespace, tag) => doc.createElement(tag);
}

/** Mount the real draft screen over the stub DOM; `restore()` puts the global document back. */
function mountShop({ ruleset = 'swarm', wave = 3, credits = 80, offers = [offer('a')], ownedShip = null,
  slots = [], telemetry = {}, visual = false, reroll = null } = {}) {
  const savedDocument = globalThis.document;
  const doc = fakeDom();
  if (visual) enableInspector(doc);
  globalThis.document = doc;
  const root = doc._make('div');
  const emitted = [];
  const listeners = new Map();
  const owner = {
    currentOffers: () => offers,
    currentWave: () => wave,
    lastNotice: () => null,
    rerollState: () => reroll,
    recommendedOffers: () => [],
    refitRows: () => slots,
  };
  const ctx = {
    state: { run: { phase: 'draft', ruleset, wave, credits, telemetry, modifiers: [] }, player: { ownedShips: ownedShip ? [ownedShip] : [] } },
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
    if (visual) screen.dispose();
    if (savedDocument === undefined) delete globalThis.document;
    else globalThis.document = savedDocument;
  };
  return { screen, ctx, root, emitted, press, picks, focused: () => focused, restore, offers };
}

test('R17: Escape never starts a round — it only puts focus on Launch', () => {
  for (const credits of [0, 100000]) {
    const m = mountShop({ credits });
    try {
      m.press('Escape');
      m.press('Escape');
      assert.equal(m.picks().length, 0, 'R17 (2026-11-20): "Esc must never start a round" — Enter or a click launches');
    } finally { m.restore?.(); }
  }
});

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

test('launchGuardLine reads in plain words and agrees with the count', () => {
  assert.equal(launchGuardLine(2), 'You can still afford 2 cards — Esc again or Launch to go');
  assert.equal(launchGuardLine(1), 'You can still afford 1 card — Esc again or Launch to go');
});

test('wallet that affords a card: first Escape spares the credits, second Escape launches once', () => {
  const m = mountShop({ credits: 80, offers: [offer('a'), offer('b', { available: false, price: 500 })] });
  try {
    assert.equal(m.screen._skip.dataset.label, 'Launch round 4', 'the shop button is the launch');
    const first = m.press('Enter');
    assert.equal(first.event.defaultPrevented, true, 'the key is still owned end to end');
    assert.equal(first.stopped, 1, 'and still never reaches the flight handler');
    assert.equal(m.picks().length, 0, 'the first Escape launches nothing');
    assert.equal(m.focused(), 1, 'it moves focus to Launch');
    assert.equal(m.screen._note.textContent, 'You can still afford 1 card — Esc again or Launch to go');
    assert.equal(m.screen._note.attributes.role, 'status', 'announced politely to a screen reader');

    m.press('Enter');
    assert.deepEqual(m.picks(), [['run:draftPickRequested', { offerId: null }]], 'the second Escape resolves as ever');
  } finally { m.restore(); }
});

test('nothing affordable: the first Escape launches at once, exactly as before', () => {
  const m = mountShop({ credits: 0, offers: [offer('a', { available: false }), offer('b', { available: false })] });
  try {
    m.press('Enter');
    assert.equal(m.picks().length, 1);
    assert.equal(m.focused(), 0, 'no detour through the warning');
    assert.doesNotMatch(m.screen._note.textContent, /afford/);
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
    assert.equal(m.screen._note.textContent, launchGuardLine(1));
    m.ctx.bus.emit('ui:cancel', {});
    assert.deepEqual(m.picks(), [['run:draftPickRequested', { offerId: null }]], 'second B launches once');
    m.ctx.screenManager.top = () => 'crucibleRefit';
    m.ctx.bus.emit('ui:cancel', {});
    assert.equal(m.screen._launchWarned, false, 'a covering screen owns its cancel');
    m.screen.onHide();
    m.ctx.screenManager.top = () => 'crucibleDraft';
    m.ctx.bus.emit('ui:cancel', {});
    assert.equal(m.screen._launchWarned, false, 'hidden armory unsubscribes');
  } finally { m.screen.dispose(); m.restore(); }
});

test('pad cancel with no affordable card launches immediately', () => {
  const m = mountShop({ credits: 0, offers: [offer('a', { available: false })] });
  try {
    m.screen.onShow();
    m.ctx.bus.emit('ui:cancel', {});
    assert.deepEqual(m.picks(), [['run:draftPickRequested', { offerId: null }]]);
  } finally { m.screen.dispose(); m.restore(); }
});

test('an empty shelf launches at once too', () => {
  const m = mountShop({ credits: 900, offers: [] });
  try {
    m.press('Enter');
    assert.equal(m.picks().length, 1);
  } finally { m.restore(); }
});

test('the Gauntlet keeps its loadout on the first Escape, whatever the wallet', () => {
  const m = mountShop({ ruleset: 'scored', credits: 900, offers: [offer('a'), offer('b'), offer('c')] });
  try {
    assert.equal(m.screen._skip.dataset.label, 'Keep current loadout');
    m.press('Enter');
    assert.deepEqual(m.picks(), [['run:draftPickRequested', { offerId: null }]]);
    assert.equal(m.focused(), 0);
  } finally { m.restore(); }
});

test('clicking Launch after the warning resolves, and a click alone never needs the warning', () => {
  const warned = mountShop({ offers: [offer('a'), offer('b')] });
  try {
    warned.press('Enter');
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

test('a rebuilt shelf re-reads: spending the last credits turns the next Escape into a launch', () => {
  const m = mountShop({ credits: 80, offers: [offer('a')] });
  try {
    m.press('Enter');
    assert.equal(m.picks().length, 0);
    // The player buys the card: the owner's shelf now has nothing buyable, and the screen repaints.
    m.offers[0].purchased = true;
    m.offers[0].available = false;
    m.ctx.state.run.credits = 30;
    m.screen.refresh(m.ctx);
    assert.doesNotMatch(m.screen._note.textContent, /afford/, 'the old count is not left on the line');
    m.press('Enter');
    assert.equal(m.picks().length, 1, 'nothing left to spend: one Escape goes');
  } finally { m.restore(); }
});

test('a repaint with cards still affordable warns again instead of launching on a stale second press', () => {
  const m = mountShop({ credits: 200, offers: [offer('a'), offer('b')] });
  try {
    m.press('Enter');
    m.offers[0].purchased = true;
    m.offers[0].available = false;
    m.ctx.state.run.credits = 150;
    m.screen.refresh(m.ctx);
    m.press('Enter');
    assert.equal(m.picks().length, 0, 'the shelf changed since the warning, so it is read fresh');
    assert.equal(m.screen._note.textContent, 'You can still afford 1 card — Esc again or Launch to go');
    m.press('Enter');
    assert.equal(m.picks().length, 1);
  } finally { m.restore(); }
});

test('featured cards inspect on click or digit and only Install requests a purchase', () => {
  const m = mountShop({ credits: 900, offers: [
    offer('a', { dealt: true }), offer('b', { dealt: true, slotIndex: 0 }), offer('c', { dealt: true }),
  ] });
  try {
    // This DOM fixture has no SVG inspector. Capture the real screen's selected offer at its
    // presentation boundary and exercise the same purchase handler that the Install button calls.
    m.screen._reading = { offerId: null };
    const initialQuote = { price: 50, slotIndex: 0, replaces: null, replacesTrial: false };
    m.screen._paintReading = (_ctx, item) => {
      m.screen._reading.offerId = item.id;
      m.screen._reading.price = item.price;
      m.screen._reading.quoteKey = item.id === 'b' ? JSON.stringify(initialQuote) : 'null';
    };
    assert.match(m.screen._hint.textContent, /inspect/i);
    const onKey = (key, target = m.screen._root) =>
      m.screen.onKey({ key, target, defaultPrevented: false, altKey: false, ctrlKey: false, metaKey: false });
    m.screen._digitCards[0].click();
    assert.equal(m.screen._reading.offerId, 'a');
    assert.equal(onKey('2'), true);
    assert.equal(m.screen._reading.offerId, 'b');
    assert.deepEqual(m.picks(), [], 'looking at two items sends no purchase intent');
    assert.equal(m.ctx.state.run.credits, 900);
    m.screen.refresh = () => {};
    m.offers[1].replaces = 'wpn_pulse_laser_s';
    m.screen._purchaseSelected(m.ctx);
    assert.deepEqual(m.picks(), [], 'a changed replacement quote needs a fresh confirmation');
    assert.match(m.screen._note.textContent, /offer changed/);
    const updatedQuote = { ...initialQuote, replaces: 'wpn_pulse_laser_s' };
    m.screen._reading.quoteKey = JSON.stringify(updatedQuote);
    m.screen._purchaseSelected(m.ctx);
    m.screen._purchaseSelected(m.ctx);
    assert.deepEqual(m.picks(), [['run:draftPickRequested', { offerId: 'b', quote: updatedQuote }]]);
    // Typing digits in the search field filters the shelf — it never picks.
    m.screen.refresh(m.ctx);
    assert.equal(onKey('1', m.screen._search), false, 'search owns its own digits');
    assert.equal(m.picks().length, 1);
    // A key the footer never advertised is not consumed.
    assert.equal(onKey('4'), false);
    assert.equal(onKey('r'), false, 'onKey leaves R to the root handler');
  } finally { m.restore(); }
});

test('the Swarm opening presents the catalog and loan-eligible guns at zero credits', () => {
  const m = mountShop({ wave: 0, credits: 0, offers: [
    offer('a', { category: 'Weapons', dealt: true, slotIndex: 0, available: false, borrowAvailable: true }),
  ] });
  try {
    assert.equal(m.screen._cards.hidden, false);
    assert.equal(m.screen._dealt.hidden, true);
    assert.equal(m.screen._category, 'Weapons');
    assert.match(m.screen._sub.textContent, /Borrow one gun for round 1 at no cost/);
    assert.deepEqual(m.picks(), []);
  } finally { m.restore(); }
});

test('Equipment shows the free starting gun, its slot and an explicit launch without it', () => {
  const installed = { defId: 'ship_hornet', fittings: [] };
  const mount = { slotType: 'weapon', defId: null };
  const starter = offer('autocannon', { name: 'Autocannon S', price: 0, slotIndex: 0,
    category: 'Weapons', startingEquipment: true, demoAvailable: false });
  const m = mountShop({ wave: 0, credits: 0, offers: [starter], ownedShip: installed, slots: [mount],
    telemetry: { zeroScrapOpening: true } });
  try {
    const card = m.screen._cards.children.find(node => node.classList.contains('sf-cru-card'));
    assert.match(card.getAttribute('aria-label'), /Free.*slot 1/i);
    const head = card.children.find(node => node.classList.contains('sf-cru-cardhead'));
    assert.equal(head.children.find(node => node.classList.contains('sf-cru-price')).textContent, 'Free');
    assert.match(m.screen._sub.textContent, /keep it for this run/i);
    assert.match(m.screen._launchSummary.textContent, /0 Scrap left/);
    assert.equal(m.screen._skip.dataset.label, 'Launch round 1 without a gun');
    assert.deepEqual(m.picks(), [], 'mounting Equipment does not choose a starter');
    m.press('Enter');
    m.press('Enter');
    assert.equal(m.focused(), 2);
    assert.match(m.screen._note.textContent, /choose Launch round 1 without a gun/);
    assert.deepEqual(m.picks(), []);
    card.click();
    assert.deepEqual(m.picks(), [['run:draftPickRequested', { offerId: 'autocannon', quote: {
      price: 0, slotIndex: 0, replaces: null, replacesTrial: false,
    } }]]);
    m.screen._skip.click();
    assert.deepEqual(m.picks()[1], ['run:draftPickRequested', { offerId: null }], 'only the explicit button requests bare launch');
  } finally { m.restore(); }
});

test('ordinary zero-Scrap Equipment lets the pilot compare, fit and find a spare starter gun', () => {
  const priorDevice = getPromptDevice();
  const ownedShip = { defId: 'ship_hornet', fittings: [] };
  const slots = [{ slotType: 'weapon', slotIndex: 0, defId: null, spares: [] }];
  const autocannon = offer('sidearm', { name: 'Autocannon S', price: 0, slotIndex: 0,
    category: 'Weapons', startingEquipment: true, demoAvailable: false, dealt: true });
  const concussion = offer('concussion', { name: 'Concussion Cannon S', defId: 'wpn_concussion_cannon_s',
    price: 0, slotIndex: 0, category: 'Weapons', startingEquipment: true, demoAvailable: false });
  const paid = offer('market-gun', { price: 180, available: false, category: 'Weapons', dealt: true });
  const m = mountShop({ wave: 0, credits: 0, ownedShip, slots,
    telemetry: { zeroScrapOpening: true }, visual: true,
    reroll: { open: true, price: 50, available: false, note: 'A re-roll costs 50 cr.' },
    offers: [autocannon, concussion, paid, offer('owned-hull', { kind: 'hull', price: 0 })] });
  try {
    const { screen, root } = m;
    const cards = () => screen._cards.querySelectorAll('.sf-cru-card').map(card => card.dataset.offerId);
    const inspected = screen._reading.parts;
    assert.deepEqual(cards(), ['sidearm', 'concussion']);
    assert.equal(screen._armoryHeading.textContent, 'Starting guns');
    assert.equal(root.querySelector('.orr-wallet-caption').textContent, 'Run Scrap');
    assert.equal(screen._filters.hidden, true);
    assert.equal(screen._browseBtn.hidden, true);
    assert.equal(screen._rerollBtn.hidden, true);
    assert.equal(screen._note.textContent, '');
    assert.equal(screen._refitBtn.hidden, true);
    assert.equal(inspected.more.hidden, true);
    assert.equal(screen._skip.dataset.label, 'Launch round 1 without a gun');
    assert.equal(screen._skip.classList.contains('k-word--primary'), false);
    assert.ok(!screen._skip.hidden && !screen._skip.disabled, 'launching bare is still an explicit action');
    assert.equal(screen._circuit.options.parentNode, screen._briefing);
    assert.equal(screen._briefing.hidden, false);
    assert.equal(screen._circuit.options.getAttribute('name'), null);
    assert.ok(!screen._briefing.open && !screen._circuit.options.open, 'secondary choices start collapsed');
    m.press('R');
    m.press('B');
    assert.ok(!m.emitted.some(([name]) => name === 'run:draftRerollRequested'));

    assert.equal(inspected.name.textContent, 'Autocannon S');
    const comparison = inspected.compare.textContent;
    assert.match(comparison, /FIRE.*IMPACT/);
    m.press('2');
    assert.equal(inspected.name.textContent, 'Concussion Cannon S');
    assert.notEqual(inspected.compare.textContent, comparison);
    const plottedStats = () => findAll(inspected.compare, bar => bar.getAttribute('class') === 'orr-armory-compare__fill')
      .map(bar => bar.getAttribute('d'));
    const concussionBars = plottedStats();
    assert.equal(concussionBars.length, 2);
    assert.deepEqual(m.picks(), [], 'inspecting the two starter guns spends nothing');
    assert.equal(screen._visualArmory.buy.textContent, 'Fit free');
    assert.equal(screen._visualArmory.buy.disabled, false);
    screen._visualArmory.buy.click();
    assert.deepEqual(m.picks(), [['run:draftPickRequested', { offerId: concussion.id,
      quote: { price: 0, slotIndex: 0, replaces: null, replacesTrial: false } }]]);
    assert.equal(screen._skip.classList.contains('k-word--primary'), false, 'a request alone has not fitted the gun');

    m.ctx.state.run.modifiers.push({ startingEquipment: true, offerId: concussion.id,
      defId: concussion.defId, instanceId: 'starter-1', slotIndex: 0 });
    ownedShip.fittings[0] = concussion.defId;
    Object.assign(slots[0], { defId: concussion.defId, name: concussion.name, startingEquipment: true });
    Object.assign(concussion, { purchased: true, purchaseStatus: 'Fitted', startingEquipment: false, available: false, price: 18 });
    Object.assign(autocannon, { startingEquipment: false, available: false, price: 18 });
    m.offers.push(offer('same-model', { defId: concussion.defId, purchased: true, purchaseStatus: 'Purchased' }));
    screen.refresh(m.ctx);
    assert.deepEqual(cards(), [concussion.id]);
    assert.equal(screen._visualArmory.buy.textContent, 'Already fitted');
    assert.equal(inspected.name.textContent, 'Concussion Cannon S');
    assert.deepEqual(plottedStats(), concussionBars, 'fitting the gun keeps both stat bars on their original scales');
    assert.equal(inspected.act.textContent, 'Primary fire — LMB · Fitted in slot 1.');
    const fittedCard = screen._cards.querySelectorAll('.sf-cru-card')[0];
    const fittedControls = m.ctx.state.settings = { controls: {
      bindings: { fire: ['KeyP'] }, gamepad: { enabled: true, bindings: { fire: ['l1'] } },
    } };
    setPromptDevice('kbm');
    screen.refresh(m.ctx, { periodic: true });
    assert.equal(inspected.act.textContent, 'Primary fire — P · Fitted in slot 1.');
    setPromptDevice('gamepad');
    screen.refresh(m.ctx, { periodic: true });
    assert.equal(inspected.act.textContent, 'Primary fire — LB · Fitted in slot 1.');
    fittedControls.controls.gamepad.bindings.fire = [];
    screen.refresh(m.ctx, { periodic: true });
    assert.equal(inspected.act.textContent, 'Primary fire — unbound · Fitted in slot 1.');
    setPromptDevice('kbm');
    fittedControls.controls.bindings.fire = [];
    screen.refresh(m.ctx, { periodic: true });
    assert.equal(inspected.act.textContent, 'Primary fire — LMB · Fitted in slot 1.');
    assert.equal(screen._cards.querySelectorAll('.sf-cru-card')[0], fittedCard, 'prompt-only refresh keeps the fitted card mounted');
    assert.equal(screen._refitBtn.hidden, false);
    assert.equal(screen._skip.dataset.label, 'Launch round 1');
    assert.equal(screen._skip.classList.contains('k-word--primary'), true, 'the confirmed fit hands priority to Launch');
    assert.doesNotMatch(screen._launchSummary.textContent, /No gun within budget/);

    ownedShip.fittings[0] = null;
    Object.assign(slots[0], { defId: null, startingEquipment: false, spares: [{ instanceId: 'starter-1' }] });
    concussion.purchaseStatus = 'In spares';
    screen.refresh(m.ctx);
    assert.deepEqual(cards(), [concussion.id]);
    assert.equal(screen._visualArmory.buy.textContent, 'In spares');
    assert.equal(screen._refitBtn.hidden, false);
    assert.equal(screen._skip.dataset.label, 'Launch round 1 without a gun');
    screen._refitBtn.click();
    assert.ok(m.emitted.some(([name, value]) => name === 'ui:pushScreen' && value.id === 'crucibleRefit'));

    screen._briefing.open = true;
    screen._circuit.options.open = true;
    screen._circuit.choices.querySelector('button').click();
    assert.match(m.picks().at(-1)[1].offerId, /^circuit_start_/);
  } finally { setPromptDevice(priorDevice); m.restore(); }
});

test('round-one launch summary follows the owner from empty mounts to a fitted gun', () => {
  const ownedShip = { defId: 'ship_hornet', fittings: [] };
  const slots = [{ slotType: 'weapon', defId: null }, { slotType: 'weapon', defId: null }];
  const buy = offer('a', { price: 18 });
  const m = mountShop({ wave: 0, credits: 64, offers: [buy], ownedShip, slots });
  try {
    const summary = m.screen._launchSummary;
    assert.equal(m.screen._skip.dataset.label, 'Launch round 1');
    assert.equal(m.screen._skip.getAttribute('aria-describedby'), summary.id);
    assert.match(summary.textContent, /Hornet · No guns fitted · 2 empty weapon slots/);
    assert.match(summary.textContent, /Turning & braking \d+\/10 · 64 cr left · Guns from 18 Scrap · Tether and throw debris to fight/);
    assert.deepEqual(m.picks(), []);

    ownedShip.fittings[0] = buy.defId;
    slots[0].defId = buy.defId;
    slots[0].name = 'Autocannon S';
    m.ctx.state.run.credits = 46;
    buy.available = false;
    buy.purchased = true;
    m.screen.refresh(m.ctx);
    assert.match(summary.textContent, /Hornet · Autocannon S · 1 empty weapon slot/);
    assert.match(summary.textContent, /46 cr left/);
    assert.doesNotMatch(summary.textContent, /No guns fitted|Tether and throw/);
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
    assert.equal(m.screen._launchWarned, false);
  } finally { m.restore(); }
});
