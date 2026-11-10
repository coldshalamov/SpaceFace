// NXI-018 — a full receiver refuses, and a zero-unit contact grants no success credit.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mulberry32 } from '../src/core/rng.js';
import {
  commitReceiverAcceptance,
  createIndustryLedger,
  evaluateReceiverAcceptance,
} from '../src/systems/worldSiteRuntime.js';

const SEED = 4242;

function entry(extra) {
  return {
    phase: 'open',
    entered: true,
    relativeSpeed: 5,
    capacity: 8,
    mouthHalfWidth: 34,
    bodyRadius: 4,
    commodityId: 'cmdty_ore_iron',
    cargoClass: 'ore',
    acceptsClasses: ['ore'],
    payloadPos: { x: 3, z: 4 },
    ...extra,
  };
}

test('zero units and a full receiver both refuse, and a neighbor load still fits in the remaining room', () => {
  const simTime = mulberry32(SEED)() * 15;
  const ledger = createIndustryLedger({ capacity: 8, simTime });
  const emptyOffer = evaluateReceiverAcceptance(entry({ quantity: 0, stored: ledger.stored, simTime }));
  assert.equal(emptyOffer.successCredit, false);
  assert.equal(emptyOffer.acceptedQty, 0);
  assert.equal(emptyOffer.reason, 'zero-unit');
  const emptyCommit = commitReceiverAcceptance(ledger, emptyOffer, 'zero');
  assert.equal(emptyCommit.credit, 0);
  assert.equal(emptyCommit.ledger, ledger);
  assert.equal(ledger.stored, 0);

  const first = evaluateReceiverAcceptance(entry({ quantity: 3, stored: 0 }));
  assert.equal(first.successCredit, true);
  assert.equal(first.acceptedQty, 3);
  const afterFirst = commitReceiverAcceptance(ledger, first, 'lot-a');
  assert.equal(afterFirst.credit, 3);
  assert.equal(afterFirst.ledger.stored, 3);

  const second = evaluateReceiverAcceptance(entry({ quantity: 4, stored: afterFirst.ledger.stored }));
  const afterSecond = commitReceiverAcceptance(afterFirst.ledger, second, 'lot-b');
  assert.equal(afterSecond.credit, 4);
  assert.equal(afterSecond.ledger.stored, 7);

  const overflowContact = evaluateReceiverAcceptance(entry({ quantity: 5, stored: afterSecond.ledger.stored }));
  assert.equal(overflowContact.acceptedQty, 1);
  assert.equal(overflowContact.successCredit, true);
  assert.equal(overflowContact.redirect.qty, 4);
  const afterOverflow = commitReceiverAcceptance(afterSecond.ledger, overflowContact, 'lot-c');
  assert.equal(afterOverflow.acceptedQty, 1);
  assert.equal(afterOverflow.ledger.stored, 8);

  const full = evaluateReceiverAcceptance(entry({ quantity: 2, stored: afterOverflow.ledger.stored }));
  assert.equal(full.reason, 'capacity-full');
  assert.equal(full.successCredit, false);
  assert.equal(full.acceptedQty, 0);
  assert.equal(full.redirect.qty, 2);
  assert.match(full.scanSentence, /full/i);
  const fullCommit = commitReceiverAcceptance(afterOverflow.ledger, full, 'lot-d');
  assert.equal(fullCommit.credit, 0);
  assert.equal(fullCommit.ledger, afterOverflow.ledger);
  assert.equal(afterOverflow.ledger.stored, 8);

  const replay = commitReceiverAcceptance(afterOverflow.ledger, first, 'lot-a');
  assert.equal(replay.duplicate, true);
  assert.equal(replay.credit, 0);
  assert.equal(replay.ledger.stored, 8);

  const forced = commitReceiverAcceptance(afterOverflow.ledger, { ...overflowContact, acceptedQty: 50, successCredit: true }, 'lot-forced');
  assert.equal(forced.acceptedQty, 0);
  assert.equal(forced.credit, 0);
  assert.equal(forced.reason, 'capacity-full');
  assert.ok(afterOverflow.ledger.stored <= afterOverflow.ledger.capacity);
});
