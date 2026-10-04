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
