// NXI-023 — distinguish lip contact from successful entry.
//
// The named owner is src/systems/worldSiteRuntime.js: evaluateReceiverAcceptance
// maps the receiver's contact result — the existing feedback surface is the
// contact's scanSentence carried on the published site result and stamped onto
// the load's own record — and commitReceiverAcceptance is the only place a
// delivery is booked. A glancing lip collision (inside the intake's swept volume
// but outside the mouth) produces the contact feedback sentence and NOTHING
// delivered: no acceptedQty, no committed credit, no redirect, body untouched.
// The neighboring success is the same body a step later inside the mouth —
// it commits once, through the same rules, with no enlarged success radius.
// Seed 4242 inputs; every read here is deterministic.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  APERTURE_RECEIVER,
  aperturePoint,
  pointInsideAperture,
  pointInsideApertureMouth,
} from '../src/data/environmentalMachinery.js';
import { createBus } from '../src/core/eventBus.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import {
  commitReceiverAcceptance,
  createIndustryLedger,
  evaluateReceiverAcceptance,
} from '../src/systems/worldSiteRuntime.js';

const LOAD = {
  phase: 'open',
  entered: false,
  lipContact: true,
  relativeSpeed: 6,
  quantity: 4,
  capacity: 8,
  stored: 0,
  bodyRadius: 5,
  mouthHalfWidth: 34,
  commodityId: 'cmdty_ore_iron',
  cargoClass: 'ore',
  acceptsClasses: ['ore', 'scrap'],
  maxRelativeSpeed: 22,
  payloadPos: { x: 20, z: 5 },
};

test('NXI-023: lip contact reports the kiss on the lip and delivers nothing', () => {
  const lip = evaluateReceiverAcceptance(LOAD);
  assert.equal(lip.reason, 'lip-contact', 'a glancing lip is its own cause');
  assert.equal(lip.successCredit, false);
  assert.equal(lip.acceptedQty, 0, 'no material crosses on the wrong side of the lip');
  assert.equal(lip.recoverable, true, 'the load stays recoverable freight');
  assert.equal(lip.scanSentence, 'The load kissed the lip. It did not enter.',
    'contact feedback names the graze, not a generic miss');
  assert.equal(lip.redirect, null, 'no invisible reroute mints delivery elsewhere');
  assert.equal(lip.teleported, false);

  // The commit seam never books a delivery without successCredit.
  const ledger = createIndustryLedger({ capacity: 8 });
  const commit = commitReceiverAcceptance(ledger, lip, 'lip-load-4242');
  assert.equal(commit.committed, false);
  assert.equal(commit.credit, 0, 'no reward on the wrong side of the lip');
  assert.equal(commit.acceptedQty, 0);
  assert.equal(ledger.stored, 0, 'the receiver ledger is untouched');
  assert.deepEqual(ledger.acceptedReceipts || {}, {}, 'no receipt is minted');
});

test('NXI-023: the same load inside the mouth commits once — entry, not contact, pays', () => {
  const ledger = createIndustryLedger({ capacity: 8 });
  const entered = evaluateReceiverAcceptance({ ...LOAD, entered: true });
  assert.equal(entered.successCredit, true);
  assert.equal(entered.acceptedQty, 4);
  const committed = commitReceiverAcceptance(ledger, entered, 'lip-load-4242');
  assert.equal(committed.committed, true);
  assert.equal(committed.credit, 4);
  assert.equal(committed.ledger.stored, 4);
  const replay = commitReceiverAcceptance(committed.ledger, entered, 'lip-load-4242');
  assert.equal(replay.duplicate, true, 'one entry pays once');
  assert.equal(replay.credit, 0);
});

test('NXI-023: the real aperture consumer kisses the lip without delivering, then enters honestly', () => {
  // Geometry pin: the lip position is inside the intake's swept volume but not
  // inside the mouth — this is the graze the check names.
  const lipPos = aperturePoint(-25, 10);
  assert.equal(pointInsideAperture(lipPos), true, 'the lip is inside the intake volume');
  assert.equal(pointInsideApertureMouth(lipPos), false, 'the lip is outside the mouth');

  const priorLedger = environmentalMachinery._industryLedger;
  const priorResult = environmentalMachinery._industrySiteResult;
  const priorOccupant = environmentalMachinery._apertureLastOccupant;
  const priorDelivery = environmentalMachinery._apertureDeliveryCandidate;
  try {
    environmentalMachinery._industryLedger = null;
    environmentalMachinery._industrySiteResult = null;
    environmentalMachinery._apertureLastOccupant = null;
    const body = {
      id: 'lip-load-4242',
      type: 'pickup',
      alive: true,
      pos: lipPos,
      vel: { x: 6, z: 0 },
      radius: 5,
      data: { amount: 4, commodityId: 'cmdty_ore_iron', cargoClass: 'ore' },
    };
    environmentalMachinery._apertureDeliveryCandidate = body;

    // THE GRAZE — contact feedback, zero delivered.
    environmentalMachinery._publishApertureIndustry({ simTime: 4 }, { phase: 'open', occupied: false });
    const contact = environmentalMachinery._industrySiteResult.contact;
    assert.equal(contact.reason, 'lip-contact');
    assert.equal(contact.successCredit, false);
    assert.equal(contact.acceptedQty, 0);
    assert.equal(environmentalMachinery._industryLedger.stored, 0,
      'the receiver stored nothing from a lip kiss');
    assert.equal(body.data.amount, 4, 'the load kept every unit');
    assert.equal(body.alive, true, 'the load survived the graze');
    assert.equal(body.data.scanSentence, 'The load kissed the lip. It did not enter.',
      'the load itself carries the contact feedback');
    assert.equal(environmentalMachinery._industryLedger.acceptedReceipts?.['lip-load-4242'] ?? 0, 0,
      'the lip minted no receipt');

    // THE NEIGHBORING SUCCESS — the same body inside the mouth enters through
    // the same rules: the mouth band, not an enlarged radius, is what paid.
    body.pos = aperturePoint(0, 0);
    environmentalMachinery._publishApertureIndustry({ simTime: 5 }, { phase: 'open', occupied: false });
    const entry = environmentalMachinery._industrySiteResult.contact;
    assert.equal(entry.successCredit, true);
    assert.equal(entry.acceptedQty, APERTURE_RECEIVER.capacity >= 4 ? 4 : APERTURE_RECEIVER.capacity);
    assert.equal(environmentalMachinery._industryLedger.stored, 4);
    assert.equal(environmentalMachinery._industryLedger.acceptedReceipts['lip-load-4242'], 4,
      'the receipt books the entered units once');
    assert.equal(body.data.amount, 0);
    assert.equal(body.alive, false, 'an emptied load is done');

    // A re-publish of the consumed body cannot deliver a second time.
    environmentalMachinery._publishApertureIndustry({ simTime: 6 }, { phase: 'open', occupied: false });
    assert.equal(environmentalMachinery._industryLedger.stored, 4, 'the lip body never double-books');
  } finally {
    environmentalMachinery._industryLedger = priorLedger;
    environmentalMachinery._industrySiteResult = priorResult;
    environmentalMachinery._apertureLastOccupant = priorOccupant;
    environmentalMachinery._apertureDeliveryCandidate = priorDelivery;
  }
});

test('NXI-023: the lip verdict reaches the pilot on the existing receipt line, once per change', () => {
  // Player-facing path proof: src/ui/toasts.js renders `toast` bus events as the receipt
  // lane every refusal/acceptance shares. Stamping body.data.scanSentence was never the
  // visible surface — no consumer read it. The graze and the later entry must each emit
  // exactly one receipt, and a re-publish with the same verdict must not re-announce.
  const bus = createBus();
  const toasts = [];
  bus.on('toast', (payload) => toasts.push({ ...payload }));

  const priorBus = environmentalMachinery.bus;
  const priorLedger = environmentalMachinery._industryLedger;
  const priorResult = environmentalMachinery._industrySiteResult;
  const priorOccupant = environmentalMachinery._apertureLastOccupant;
  const priorDelivery = environmentalMachinery._apertureDeliveryCandidate;
  const priorWarnAt = environmentalMachinery._apertureLastWarnToastAt;
  try {
    environmentalMachinery.bus = bus;
    environmentalMachinery._industryLedger = null;
    environmentalMachinery._industrySiteResult = null;
    environmentalMachinery._apertureLastOccupant = null;
    environmentalMachinery._apertureLastWarnToastAt = null;
    const body = {
      id: 'lip-load-4242',
      type: 'pickup',
      alive: true,
      pos: aperturePoint(-25, 10),   // inside the intake volume, outside the mouth
      vel: { x: 6, z: 0 },
      radius: 5,
      data: { amount: 4, commodityId: 'cmdty_ore_iron', cargoClass: 'ore' },
    };
    environmentalMachinery._apertureDeliveryCandidate = body;

    // THE GRAZE — one warning receipt on the shared toast line.
    environmentalMachinery._publishApertureIndustry({ simTime: 4 }, { phase: 'open', occupied: false });
    assert.equal(toasts.length, 1, 'the graze reports once');
    assert.equal(toasts[0].text, 'The load kissed the lip. It did not enter.');
    assert.equal(toasts[0].kind, 'warn', 'a refusal reads as a warning receipt');

    // THE HELD LOAD — the same verdict is already the body's stamp: no repeat.
    environmentalMachinery._publishApertureIndustry({ simTime: 4.5 }, { phase: 'open', occupied: false });
    assert.equal(toasts.length, 1, 'an unchanged verdict never re-announces itself');

    // THE ENTRY — the verdict moved, so the new fact reports once as a success receipt.
    body.pos = aperturePoint(0, 0);
    environmentalMachinery._publishApertureIndustry({ simTime: 5 }, { phase: 'open', occupied: false });
    assert.equal(toasts.length, 2, 'the moved verdict reports its own line');
    assert.equal(toasts[1].text, 'Accepted 4 cmdty_ore_iron.');
    assert.equal(toasts[1].kind, 'success');
  } finally {
    environmentalMachinery.bus = priorBus;
    environmentalMachinery._industryLedger = priorLedger;
    environmentalMachinery._industrySiteResult = priorResult;
    environmentalMachinery._apertureLastOccupant = priorOccupant;
    environmentalMachinery._apertureDeliveryCandidate = priorDelivery;
    environmentalMachinery._apertureLastWarnToastAt = priorWarnAt;
  }
});

test('NXI-023: a refused repeat delivery cannot announce Accepted on the receipt line', () => {
  // L-1: the receiver's commit dedupe files one receipt per body id — a second load on
  // the same hull re-derives "Accepted N" from its fresh amount while
  // commitReceiverAcceptance refuses the repeat receipt. The success line may ride the
  // channel only when the ledger actually booked the delivery.
  const bus = createBus();
  const toasts = [];
  bus.on('toast', (payload) => toasts.push({ ...payload }));

  const priorBus = environmentalMachinery.bus;
  const priorLedger = environmentalMachinery._industryLedger;
  const priorResult = environmentalMachinery._industrySiteResult;
  const priorOccupant = environmentalMachinery._apertureLastOccupant;
  const priorDelivery = environmentalMachinery._apertureDeliveryCandidate;
  const priorWarnAt = environmentalMachinery._apertureLastWarnToastAt;
  try {
    environmentalMachinery.bus = bus;
    environmentalMachinery._industryLedger = null;
    environmentalMachinery._industrySiteResult = null;
    environmentalMachinery._apertureLastOccupant = null;
    environmentalMachinery._apertureLastWarnToastAt = null;
    const body = {
      id: 'repeat-hull-4242',
      type: 'ship',   // a hauler survives its own delivery — the same id on the next run
      alive: true,
      pos: aperturePoint(0, 0),   // inside the mouth
      vel: { x: 2, z: 0 },
      radius: 5,
      data: { amount: 4, commodityId: 'cmdty_ore_iron', cargoClass: 'ore' },
    };
    environmentalMachinery._apertureDeliveryCandidate = body;

    // First entry: the receiver books the load and announces it once.
    environmentalMachinery._publishApertureIndustry({ simTime: 10 }, { phase: 'open', occupied: false });
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].text, 'Accepted 4 cmdty_ore_iron.');
    assert.equal(toasts[0].kind, 'success');
    assert.equal(environmentalMachinery._industryLedger.stored, 4);
    assert.equal(body.data.amount, 0);

    // Second run on the same hull id: the ledger refuses the repeat receipt. The verdict
    // still computes "Accepted 3" from the new amount — but no delivery happened, so no
    // success line may leave the channel.
    body.data.amount = 3;
    environmentalMachinery._publishApertureIndustry({ simTime: 11 }, { phase: 'open', occupied: false });
    assert.equal(environmentalMachinery._industryLedger.stored, 4, 'the refused repeat stores nothing');
    assert.equal(body.data.amount, 3, 'the refused units stay with the carrier');
    assert.equal(toasts.length, 1, 'no success line for a delivery that did not happen');
    assert.equal(body.data.scanSentence, 'Accepted 3 cmdty_ore_iron.',
      'the verdict stamp still moves — the latch, not the announcement, carries it');
  } finally {
    environmentalMachinery.bus = priorBus;
    environmentalMachinery._industryLedger = priorLedger;
    environmentalMachinery._industrySiteResult = priorResult;
    environmentalMachinery._apertureLastOccupant = priorOccupant;
    environmentalMachinery._apertureDeliveryCandidate = priorDelivery;
    environmentalMachinery._apertureLastWarnToastAt = priorWarnAt;
  }
});

test('NXI-023: a flapping refusal verdict cannot retell a warning inside the embargo', () => {
  // L-2: a load dancing on the mouth edge re-derives a different refusal each few ticks,
  // and the stamp latch alone would announce every transition. Warning lines throttle to
  // the embargo gap; a committed delivery's success is a booked fact and always speaks.
  const bus = createBus();
  const toasts = [];
  bus.on('toast', (payload) => toasts.push({ ...payload }));

  const priorBus = environmentalMachinery.bus;
  const priorLedger = environmentalMachinery._industryLedger;
  const priorResult = environmentalMachinery._industrySiteResult;
  const priorOccupant = environmentalMachinery._apertureLastOccupant;
  const priorDelivery = environmentalMachinery._apertureDeliveryCandidate;
  const priorWarnAt = environmentalMachinery._apertureLastWarnToastAt;
  try {
    environmentalMachinery.bus = bus;
    environmentalMachinery._industryLedger = null;
    environmentalMachinery._industrySiteResult = null;
    environmentalMachinery._apertureLastOccupant = null;
    environmentalMachinery._apertureLastWarnToastAt = null;
    const lipPos = aperturePoint(-25, 10);
    const outPos = { x: lipPos.x + 4000, z: lipPos.z + 4000 };
    const body = {
      id: 'flap-load-4242',
      type: 'pickup',
      alive: true,
      pos: { ...lipPos },
      vel: { x: 6, z: 0 },
      radius: 5,
      data: { amount: 4, commodityId: 'cmdty_ore_iron', cargoClass: 'ore' },
    };
    environmentalMachinery._apertureDeliveryCandidate = body;

    // First refusal: announced once.
    environmentalMachinery._publishApertureIndustry({ simTime: 20 }, { phase: 'open', occupied: false });
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].kind, 'warn');

    // The verdict moves — inside the embargo each new refusal is stamped but not told.
    body.pos = { ...outPos };
    environmentalMachinery._publishApertureIndustry({ simTime: 20.5 }, { phase: 'open', occupied: false });
    body.pos = { ...lipPos };
    environmentalMachinery._publishApertureIndustry({ simTime: 21 }, { phase: 'open', occupied: false });
    body.pos = { ...outPos };
    environmentalMachinery._publishApertureIndustry({ simTime: 21.5 }, { phase: 'open', occupied: false });
    assert.equal(toasts.length, 1, 'verdict flap inside the embargo stays off the receipt line');

    // Past the embargo a moved verdict speaks again — the pilot still hears a load in
    // trouble, just not at contact frequency.
    body.pos = { ...lipPos };
    environmentalMachinery._publishApertureIndustry({ simTime: 24 }, { phase: 'open', occupied: false });
    assert.equal(toasts.length, 2, 'the embargo releases a moved verdict after the gap');
    assert.equal(toasts[1].kind, 'warn');
  } finally {
    environmentalMachinery.bus = priorBus;
    environmentalMachinery._industryLedger = priorLedger;
    environmentalMachinery._industrySiteResult = priorResult;
    environmentalMachinery._apertureLastOccupant = priorOccupant;
    environmentalMachinery._apertureDeliveryCandidate = priorDelivery;
    environmentalMachinery._apertureLastWarnToastAt = priorWarnAt;
  }
});
