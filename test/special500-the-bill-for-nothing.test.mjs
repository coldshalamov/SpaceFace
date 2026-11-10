// special-500 Phase 2 — SP2-044 "The Bill For Nothing" (choice leg).
//
// The catalog entry fires once on the frontier:debtSettled receipt and the director writes flag
// special500.SP2-044; this leg is the firing's invoice. These proofs pin: unmet gates stay inert,
// a fresh firing issues the 4 cr standby-fee invoice on the comms surfaces and the decision deck,
// paying within the one-world-day window charges exactly 4 cr through the economy owner's
// exact-payment intent and delivers the pay-branch flag (Hale's mail trigger) with rep +1,
// refusing (by choice or by silence past the deadline) assesses the LATE FEE ON STANDBY FEE and
// delivers the refuse-branch flag with rep +1 either way, a short account leaves the bill open,
// one invoice never charges twice, and a stale firing recovers on the next dock.
//
// The mail rows (invoice paper, Hale's "Correct answer." letter, the late-fee bill) are the
// flags' readers in src/data/mail.js; this file pins the flags themselves, which are the rows'
// trigger contract.
import test from 'node:test';
import assert from 'node:assert/strict';

import { special500Invoice, STANDBY_FEE_CR, INVOICE_BILL_ID } from '../src/systems/special500Invoice.js';
import { createSpecial500InvoicePrompt, invoiceReceiptText } from '../src/ui/special500InvoicePrompt.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';
import { CAL_DAY_S } from '../src/data/worldCalendar.js';

const FIRED = 'special500.SP2-044';
const INVOICE_TEXT_SNIPPET = 'CONCORD TOWAGE — STANDBY FEE';
const SEED = 20261104;

function stubBus() {
  const listeners = new Map();
  const events = [];
  return {
    events,
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of listeners.get(name) || []) fn(payload);
    },
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
      return () => {
        const rows = listeners.get(name) || [];
        const i = rows.indexOf(fn);
        if (i >= 0) rows.splice(i, 1);
      };
    },
    deliver(name, payload) { for (const fn of listeners.get(name) || []) fn(payload); },
    of: (name) => events.filter((e) => e.name === name),
  };
}

function fixtureState({ simTime = 0, credits = 5000, flags = {} } = {}) {
  return {
    simTime,
    tick: Math.floor(simTime * 60),
    meta: { seed: SEED },
    story: { flags: { ...flags } },
    world: { currentSectorId: 'sector_vesta_forge' },
    player: { credits },
    ui: {},
  };
}

/** The economy owner's exact-payment contract, in miniature, standing in for the real writer. */
function installEconomyStub(bus, state) {
  bus.on('economy:chargeCredits', (p) => {
    if (!p || typeof p !== 'object') return;
    if (p.requireFull === true) {
      if (p.result === true) return;
      p.result = false;
      const live = Math.max(0, Math.round(Number(state.player.credits) || 0));
      if (live !== p.expectedCredits || live < p.amount) return;
      if (typeof p.commit === 'function' && p.commit() !== true) return;
      state.player.credits = live - p.amount;
      p.result = true;
      return;
    }
    const live = Math.max(0, Math.round(Number(state.player.credits) || 0));
    state.player.credits = Math.max(0, live - Math.max(0, Math.round(Number(p.amount) || 0)));
  });
}

function bootSystem(bus, state) {
  const system = Object.create(special500Invoice);
  system.init({ bus, state });
  system.update(0.5, state);
  return system;
}

test('without the catalog firing nothing is issued and nothing is charged', () => {
  const bus = stubBus();
  const state = fixtureState({ simTime: 5 * CAL_DAY_S });
  bootSystem(bus, state);
  assert.equal(bus.of('special500:invoice').length, 0, 'no deck offer without the fired flag');
  assert.equal(bus.of('comms:popup').length, 0, 'no comms line without the fired flag');
  assert.equal(state.story.flags.standby_fee_due, undefined);
});

test('a fresh firing issues the invoice once: comms surfaces plus one deck offer with a one-day deadline', () => {
  const bus = stubBus();
  const firedAt = 3 * CAL_DAY_S;
  const state = fixtureState({ simTime: firedAt + 0.2, flags: { [FIRED]: firedAt } });
  const system = bootSystem(bus, state);
  const popups = bus.of('comms:popup').filter((e) => (e.payload.text || '').includes(INVOICE_TEXT_SNIPPET));
  assert.equal(popups.length, 1, 'the invoice line goes out once');
  assert.equal(popups[0].payload.sender, 'CONCORD TOWAGE');
  const offers = bus.of('special500:invoice');
  assert.equal(offers.length, 1, 'the deck gets one offer');
  assert.equal(offers[0].payload.amount, STANDBY_FEE_CR);
  assert.equal(offers[0].payload.dueAt, firedAt + 0.2 + CAL_DAY_S, 'the deadline is one world day, simTime only');
  assert.equal(state.story.flags.standby_fee_due, firedAt + 0.2, 'the due stamp is save-carried');
  system.update(0.5, state);
  assert.equal(bus.of('special500:invoice').length, 1, 'no duplicate offer while the window runs');
});

test('paying inside the window charges exactly 4 cr, pays Concord rep +1, and writes the pay flag', () => {
  const bus = stubBus();
  const firedAt = 3 * CAL_DAY_S;
  const state = fixtureState({ simTime: firedAt + 0.2, credits: 5000, flags: { [FIRED]: firedAt } });
  installEconomyStub(bus, state);
  const system = bootSystem(bus, state);
  state.simTime = firedAt + 100; // well inside the one-day window
  bus.emit('ui:standbyFeeChoose', { billId: INVOICE_BILL_ID, choice: 'pay' });
  const charges = bus.of('economy:chargeCredits');
  assert.equal(charges.length, 1, 'one charge intent');
  assert.equal(charges[0].payload.amount, STANDBY_FEE_CR, 'the bill is 4 cr');
  assert.equal(charges[0].payload.result, true, 'the exact-payment request settles');
  assert.equal(state.player.credits, 5000 - STANDBY_FEE_CR, 'the account is out 4 cr');
  assert.equal(state.story.flags.standby_fee_paid > 0, true, 'the pay flag is written (Hale\'s mail trigger)');
  const rep = bus.of('faction:repDelta');
  assert.equal(rep.length, 1, 'one rep intent');
  assert.equal(rep[0].payload.factionId, 'faction_scn', 'Hale files for Concord');
  assert.equal(rep[0].payload.delta, 1);
  assert.equal(bus.of('special500:invoiceReceipt').some((e) => e.payload.outcome === 'paid'), true, 'the deck gets its receipt');
  // One invoice never charges twice.
  bus.emit('ui:standbyFeeChoose', { billId: INVOICE_BILL_ID, choice: 'pay' });
  state.simTime = firedAt + CAL_DAY_S * 5;
  system.update(0.5, state);
  assert.equal(bus.of('economy:chargeCredits').length, 1, 'a resolved invoice is inert');
  assert.equal(bus.of('faction:repDelta').length, 1, 'no second rep tick');
});

test('refusing assesses the LATE FEE ON STANDBY FEE: 4 cr out either way, rep +1, refuse flag written', () => {
  const bus = stubBus();
  const firedAt = 3 * CAL_DAY_S;
  const state = fixtureState({ simTime: firedAt + 0.2, credits: 5000, flags: { [FIRED]: firedAt } });
  installEconomyStub(bus, state);
  bootSystem(bus, state);
  bus.emit('ui:standbyFeeChoose', { billId: INVOICE_BILL_ID, choice: 'refuse' });
  assert.equal(state.story.flags.standby_fee_refused > 0, true, 'the refuse flag is written (the second bill\'s mail trigger)');
  assert.equal(state.story.flags.standby_fee_paid, undefined, 'a refusal is not a payment');
  assert.equal(state.player.credits, 5000 - STANDBY_FEE_CR, 'the account is out 4 cr either way');
  const charges = bus.of('economy:chargeCredits');
  assert.equal(charges.length, 1);
  assert.equal(charges[0].payload.amount, STANDBY_FEE_CR, 'the late fee is 4 cr');
  const rep = bus.of('faction:repDelta');
  assert.equal(rep.length, 1 && rep[0].payload.delta === 1 ? 1 : 0, 'Concord rep +1 on the refusal branch too');
  const log = bus.of('comms:log').filter((e) => /LATE FEE ON STANDBY FEE/.test(e.payload.text || ''));
  assert.equal(log.length, 1, 'the assessment lands on the log');
});

test('silence past the one-day deadline is the refusal: the expiry resolves it without a choice', () => {
  const bus = stubBus();
  const firedAt = 3 * CAL_DAY_S;
  const state = fixtureState({ simTime: firedAt + 0.2, credits: 5000, flags: { [FIRED]: firedAt } });
  installEconomyStub(bus, state);
  const system = bootSystem(bus, state);
  state.simTime = firedAt + 0.2 + CAL_DAY_S - 10; // a moment before the deadline: still open
  system.update(0.5, state);
  assert.equal(state.story.flags.standby_fee_refused, undefined, 'inside the window nothing resolves');
  state.simTime = firedAt + 0.2 + CAL_DAY_S + 1;
  system.update(0.5, state);
  assert.equal(state.story.flags.standby_fee_refused > 0, true, 'the deadline expiry is the refusal');
  assert.equal(state.player.credits, 5000 - STANDBY_FEE_CR, 'the late fee charged on expiry');
});

test('a short account cannot pay: the bill stays open, and the refusal path still stands', () => {
  const bus = stubBus();
  const firedAt = 3 * CAL_DAY_S;
  const state = fixtureState({ simTime: firedAt + 0.2, credits: 1, flags: { [FIRED]: firedAt } });
  installEconomyStub(bus, state);
  bootSystem(bus, state);
  bus.emit('ui:standbyFeeChoose', { billId: INVOICE_BILL_ID, choice: 'pay' });
  assert.equal(state.story.flags.standby_fee_paid, undefined, 'a short account pays nothing');
  assert.equal(bus.of('special500:invoiceReceipt').some((e) => e.payload.outcome === 'short'), true, 'the deck gets the short receipt');
  assert.equal(state.player.credits, 1, 'no partial charge');
  // The window is still open: settle later, or refuse.
  state.player.credits = 5000;
  state.simTime = firedAt + 200;
  bus.emit('ui:standbyFeeChoose', { billId: INVOICE_BILL_ID, choice: 'pay' });
  assert.equal(state.story.flags.standby_fee_paid > 0, true, 'the bill stayed open and payable');
  assert.equal(state.player.credits, 5000 - STANDBY_FEE_CR);
});

test('a stale firing never issues mid-space; the next dock finds the player and issues once', () => {
  const bus = stubBus();
  const firedAt = 2 * CAL_DAY_S;
  const state = fixtureState({ simTime: 9 * CAL_DAY_S + 30, credits: 5000, flags: { [FIRED]: firedAt } });
  const system = bootSystem(bus, state);
  system.update(0.5, state);
  assert.equal(bus.of('special500:invoice').length, 0, 'an old firing does not pop the bill out of nowhere');
  system._onDocked();
  assert.equal(bus.of('special500:invoice').length, 1, 'the next dock issues the invoice');
  assert.equal(state.story.flags.standby_fee_due, 9 * CAL_DAY_S + 30, 'the due stamp is the dock moment');
  system._onDocked();
  assert.equal(bus.of('special500:invoice').length, 1, 'no duplicate issue on further docks');
});

test('a save taken inside the response window resumes with the same deadline and still resolves', () => {
  const bus = stubBus();
  const firedAt = 4 * CAL_DAY_S;
  const dueAt = firedAt + 0.2;
  const state = fixtureState({
    simTime: firedAt + 100,
    credits: 5000,
    flags: { [FIRED]: firedAt, standby_fee_due: dueAt },
  });
  installEconomyStub(bus, state);
  bootSystem(bus, state);
  bus.emit('ui:standbyFeeChoose', { billId: INVOICE_BILL_ID, choice: 'pay' });
  assert.equal(state.story.flags.standby_fee_paid > 0, true, 'the resumed window still accepts payment');
});

// ── the deck adapter ────────────────────────────────────────────────────────────────────────

function stubDeck() {
  const cards = [];
  const toasts = [];
  return {
    cards,
    toasts,
    // The real deck replaces a same-id offer synchronously — two cards for one id never coexist.
    offerDecision(spec) {
      const i = cards.findIndex((c) => c.id === spec.id);
      if (i >= 0) cards.splice(i, 1, spec); else cards.push(spec);
      return true;
    },
    updateDecision() { return true; },
    resolveDecision() { cards.length = 0; return true; },
    toast(payload) { toasts.push(payload); return true; },
  };
}

function stubUiBus() {
  const listeners = new Map();
  const events = [];
  return {
    events,
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of listeners.get(name) || []) fn(payload);
    },
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
      return () => {};
    },
    of: (name) => events.filter((e) => e.name === name),
  };
}

test('the deck adapter renders the bill with both choices and forwards the answer to the leg', () => {
  const deck = stubDeck();
  setPromptDeck(deck);
  try {
    const bus = stubUiBus();
    const prompt = createSpecial500InvoicePrompt({ state: {}, bus });
    const dueAt = 10 * CAL_DAY_S;
    bus.emit('special500:invoice', {
      billId: INVOICE_BILL_ID, title: 'STANDBY FEE', amount: 4, dueAt,
      memo: 'NO TOW PERFORMED. READINESS IS THE SERVICE.',
    });
    assert.equal(deck.cards.length, 1, 'one card');
    assert.equal(deck.cards[0].headline, 'STANDBY FEE · 4 CR');
    assert.equal(deck.cards[0].deadlineAt, dueAt, 'the card shows the sim-owned deadline');
    assert.deepEqual(deck.cards[0].choices.map((c) => c.id), ['pay', 'refuse']);
    deck.cards[0].onChoose('pay', 'pointer');
    const chooses = bus.of('ui:standbyFeeChoose');
    assert.equal(chooses.length, 1, 'the choice crosses to the sim');
    assert.deepEqual(chooses[0].payload, { billId: INVOICE_BILL_ID, choice: 'pay', source: 'pointer' });
    bus.emit('special500:invoiceReceipt', { billId: INVOICE_BILL_ID, outcome: 'paid', amount: 4 });
    assert.equal(deck.cards.length, 0, 'the receipt resolves the card');
    assert.equal(bus.of('toast').length, 1, 'the receipt reads once on the toast surface');
    assert.equal(invoiceReceiptText({ outcome: 'paid', amount: 4 }), 'PAID · 4 cr transferred · the file closes clean');
    assert.equal(invoiceReceiptText({ outcome: 'refused', amount: 4 }), 'ASSESSMENT · LATE FEE ON STANDBY FEE · 4 cr charged · consistency noted');
    prompt.destroy();
  } finally {
    setPromptDeck(null);
  }
});

test('a short receipt keeps the card up; an offer that arrived docked re-offers on undock', () => {
  const deck = stubDeck();
  setPromptDeck(deck);
  try {
    const bus = stubUiBus();
    const prompt = createSpecial500InvoicePrompt({ state: {}, bus });
    bus.emit('special500:invoice', { billId: INVOICE_BILL_ID, title: 'STANDBY FEE', amount: 4, dueAt: 10 * CAL_DAY_S, memo: 'm' });
    bus.emit('special500:invoiceReceipt', { billId: INVOICE_BILL_ID, outcome: 'short', amount: 4 });
    assert.equal(deck.cards.length, 1, 'a short account is not a resolution');
    assert.equal(deck.toasts.length, 0, 'no receipt toast while the bill is open');
    // Docked arrival: the deck could not take it, the undock re-offers the same bill.
    bus.emit('special500:invoice', { billId: INVOICE_BILL_ID, title: 'STANDBY FEE', amount: 4, dueAt: 10 * CAL_DAY_S, memo: 'm' });
    bus.emit('dock:undocked', {});
    assert.equal(deck.cards.length, 1, 'the held bill is on the deck after undock');
    prompt.destroy();
  } finally {
    setPromptDeck(null);
  }
});
