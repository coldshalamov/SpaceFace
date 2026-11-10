// FB-138 — the wingman radial explains a refused/converted order on the slot, in the moment.
//
// Drives the real wiring: the radial emits ui:wingOrder, automation.handleWingOrder answers
// wingOrder:blocked / :status synchronously, and wingmen.js's wingOrder:converted shape is
// replayed on the bus. Scripted refusal runs on seed 4242.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDom, findAll } from './helpers/fake-dom.mjs';
import { createWingmanRadial } from '../src/ui/wingmanRadial.js';
import { automation } from '../src/systems/automation.js';

// The radial needs a little more document than the kit screens: ui-root, document-level
// keydown, querySelector on the hub, and insertAdjacentHTML for the printed dial.
function radialDom() {
  const doc = fakeDom();
  doc.addEventListener = () => {};
  doc.removeEventListener = () => {};
  doc.activeElement = null;
  const make = doc._make;
  const wrapped = (tag) => {
    const node = make(tag);
    node._qsCache = {};
    node.querySelector = (sel) => node._qsCache[sel] || (node._qsCache[sel] = make('span'));
    node.querySelectorAll = () => [];
    node.insertAdjacentHTML = () => {};
    node.removeEventListener = () => {};
    node.isConnected = true;
    return node;
  };
  doc.createElement = wrapped;
  const uiRoot = wrapped('div');
  uiRoot.id = 'ui-root';
  doc.head.appendChild(uiRoot);
  return doc;
}

function makeBus() {
  const handlers = new Map();
  const emitted = [];
  return {
    emitted,
    on(evt, fn) { (handlers.get(evt) || handlers.set(evt, []).get(evt)).push(fn); return () => {}; },
    emit(evt, payload) { emitted.push({ event: evt, payload }); for (const fn of handlers.get(evt) || []) fn(payload); },
  };
}

function mount() {
  const previousDocument = globalThis.document;
  const doc = radialDom();
  globalThis.document = doc;
  const bus = makeBus();
  const state = {
    mode: 'flight',
    meta: { seed: 4242 },
    tick: 120,
    simTime: 12,
    playerId: 'player',
    entities: new Map(),
    world: { currentSectorId: 'sector_helios' },
    automation: { fleet: [{ id: 'wing-a', _liveId: null }] },
    ui: {},
    player: { targetId: 'hostile-1' },
  };
  automation.state = state;
  automation.bus = bus;
  automation.helpers = {};
  bus.on('ui:wingOrder', (p) => automation.handleWingOrder(p));
  const radial = createWingmanRadial({ bus, state });
  const overlay = doc.getElementById('sf-wingman-radial');
  return { doc, bus, state, radial, overlay, previousDocument };
}

// The module keys receipts by order; creation order is OPTIONS order —
// attack (top), screen (right), regroup (bottom), hold (left).
function receiptByOrder(overlay) {
  const names = ['attack', 'screen', 'regroup', 'hold'];
  const out = {};
  findAll(overlay, (n) => n.classList && n.classList.contains('sf-wradial__receipt'))
    .forEach((el, i) => { out[names[i]] = el; });
  return out;
}

function wedgeFor(overlay, key) {
  return findAll(overlay, (n) => n.attributes && n.attributes['aria-keyshortcuts'] === key)[0];
}

function unmount(env) {
  globalThis.document = env.previousDocument;
}

test('wingOrder:blocked puts the reason word on the issued slot and holds the dial (seed 4242)', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const env = mount();
  try {
    const { radial, overlay, bus } = env;
    radial.toggle();                       // fleet has one member → dial opens
    assert.equal(radial.isOpen, true);
    const receipts = receiptByOrder(overlay);
    // Press the attack wedge: scope ALL with the only wingman not deployed blocks it.
    wedgeFor(overlay, '1').click();
    assert.equal(receipts.attack.textContent, 'NOT DEPLOYED',
      'the attack slot names why the order was refused');
    assert.equal(receipts.screen.textContent, '', 'only the issued slot carries the receipt');
    assert.equal(receipts.regroup.textContent, '');
    assert.equal(receipts.hold.textContent, '');
    assert.equal(radial.isOpen, true, 'a refused order holds the dial open to be read');
    t.mock.timers.tick(2100);
    assert.equal(radial.isOpen, false, 'the hold expires after the receipt window');
    assert.equal(receipts.attack.textContent, '', 'the receipt clears with the window');
    assert.ok(bus.emitted.some((e) => e.event === 'wingOrder:blocked'));
    assert.ok(bus.emitted.some((e) => e.event === 'wingOrder:status'));
  } finally {
    unmount(env);
    t.mock.timers.reset();
  }
});

test('wingOrder:converted shows the new order on the issued slot while closed', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const env = mount();
  try {
    const { overlay, bus } = env;
    const receipts = receiptByOrder(overlay);
    // wingmen.js shape: an ATTACK that lost its target becomes REGROUP.
    bus.emit('wingOrder:converted', { recipientId: 'wing-a', from: 'attack', to: 'regroup', reason: 'target_lost', commandId: 'wing:x:0:1' });
    assert.equal(receipts.attack.textContent, 'REGROUP',
      'the slot that was issued names what the order became');
    assert.equal(receipts.regroup.textContent, '');
    assert.equal(overlay.hidden, false, 'the dial flashes to deliver the receipt');
    assert.ok(overlay.className.includes('sf-wradial--receipt'), 'the flash is non-interactive');
    t.mock.timers.tick(2100);
    assert.equal(receipts.attack.textContent, '');
    t.mock.timers.tick(200);   // the 160 ms fade-out before the overlay hides
    assert.equal(overlay.hidden, true, 'the flash closes itself');
  } finally {
    unmount(env);
    t.mock.timers.reset();
  }
});

test('wingOrder:status updates the slot on a partial block; a clean accept stays quiet', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const env = mount();
  try {
    const { overlay, bus } = env;
    const receipts = receiptByOrder(overlay);
    bus.emit('wingOrder:status', {
      commandId: 'wing:x:0:1', order: 'screen', scope: 'all',
      acceptedRecipientIds: ['wing-a'],
      blockedRecipients: [{ recipientId: 'wing-b', reason: 'not_deployed' }],
      text: 'Executing SCREEN 1/2',
    });
    assert.equal(receipts.screen.textContent, 'EXEC 1/2', 'the slot carries the batched count');
    assert.equal(receipts.attack.textContent, '');
    t.mock.timers.tick(2100);
    t.mock.timers.tick(200);   // the 160 ms fade-out before the overlay hides
    // A clean accept: automation emits status with no blocked recipients — no receipt.
    bus.emit('wingOrder:status', {
      commandId: 'wing:x:0:2', order: 'hold', scope: 'all',
      acceptedRecipientIds: ['wing-a'], blockedRecipients: [], text: 'Executing HOLD 1/1',
    });
    assert.equal(receipts.hold.textContent, '', 'no receipt on a clean accept');
    assert.equal(overlay.hidden, true, 'the dial does not flash for a clean accept');
  } finally {
    unmount(env);
    t.mock.timers.reset();
  }
});
