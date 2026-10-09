// PB-IND-A — SF-091 speed window, SF-093 jam occupancy, SF-100 damaged envelope.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mulberry32 } from '../src/core/rng.js';
import { aperturePoint } from '../src/data/environmentalMachinery.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import {
  clearJamByShape,
  evaluateReceiverAcceptance,
} from '../src/systems/worldSiteRuntime.js';

const SEED = 4242;
const OPEN = {
  phase: 'open',
  entered: true,
  relativeSpeed: 6,
  quantity: 4,
  capacity: 8,
  stored: 0,
  bodyRadius: 8,
  mouthHalfWidth: 34,
  commodityId: 'cmdty_ore_iron',
  cargoClass: 'ore',
  acceptsClasses: ['ore', 'scrap'],
  maxRelativeSpeed: 22,
  payloadPos: { x: 12, z: -4 },
};

test('a slow entry during the open window accepts, and the same body is not teleported', () => {
  const simTime = mulberry32(SEED)() * 100;
  const slow = evaluateReceiverAcceptance({ ...OPEN, relativeSpeed: 0, simTime });
  const timed = evaluateReceiverAcceptance({ ...OPEN, relativeSpeed: 21.5 });
  assert.equal(slow.successCredit, true);
  assert.equal(slow.acceptedQty, 4);
  assert.equal(timed.successCredit, true);
  assert.equal(timed.teleported, false);
  assert.deepEqual(timed.payloadPos, { x: 12, z: -4 });
  assert.equal(OPEN.payloadPos.x, 12);
});

test('a closed intake says closed, a lip kiss delivers nothing, and a fast miss stays recoverable', () => {
  const closed = evaluateReceiverAcceptance({ ...OPEN, phase: 'locked' });
  const closing = evaluateReceiverAcceptance({ ...OPEN, phase: 'closing' });
  const lip = evaluateReceiverAcceptance({ ...OPEN, entered: false, lipContact: true });
  const fast = evaluateReceiverAcceptance({ ...OPEN, relativeSpeed: 40 });
  const miss = evaluateReceiverAcceptance({ ...OPEN, entered: false, lipContact: false });
  assert.equal(closed.reason, 'closed');
  assert.equal(closed.successCredit, false);
  assert.equal(closed.acceptedQty, 0);
  assert.equal(closing.reason, 'closed');
  assert.notEqual(closed.reason, 'invalid-target');
  assert.equal(lip.reason, 'lip-contact');
  assert.equal(lip.acceptedQty, 0);
  assert.equal(lip.recoverable, true);
  assert.deepEqual(lip.payloadPos, OPEN.payloadPos);
  assert.equal(fast.reason, 'speed-window');
  assert.equal(fast.recoverable, true);
  assert.equal(miss.reason, 'not-entered');
  assert.equal(miss.successCredit, false);
});

test('jam occupancy preserves the load, and rotation, withdrawal, or a cut portion clears it', () => {
  const held = { inputs: 4 };
  const jammed = evaluateReceiverAcceptance({ ...OPEN, phase: 'jam', occupied: true });
  const during = evaluateReceiverAcceptance({ ...OPEN, phase: 'jam', quantity: 9, commodityId: 'cmdty_ore_nickel' });
  assert.equal(jammed.reason, 'jam-occupied');
  assert.equal(jammed.acceptedQty, 0);
  assert.equal(during.acceptedQty, 0);
  assert.equal(held.inputs, 4);
  assert.ok(jammed.sortingJob);
  assert.deepEqual(jammed.sortingJob.actions, ['remove', 'redirect']);
  const spun = clearJamByShape({ action: 'rotate', bodyRadius: 20, mouthHalfWidth: 34 });
  const tooWide = clearJamByShape({ action: 'rotate', bodyRadius: 40, mouthHalfWidth: 34 });
  const pulled = clearJamByShape({ action: 'withdraw', bodyRadius: 40, mouthHalfWidth: 34 });
  const cut = clearJamByShape({ action: 'salvage', bodyRadius: 40, mouthHalfWidth: 34, damaged: true });
  assert.equal(spun.cleared, true);
  assert.equal(spun.inputsPreserved, true);
  assert.equal(tooWide.cleared, false);
  assert.equal(tooWide.inputsPreserved, true);
  assert.equal(pulled.cleared, true);
  assert.equal(pulled.inputsPreserved, true);
  assert.equal(cut.cleared, true);
  assert.equal(cut.inputsPreserved, false);
  assert.ok(cut.parts.radius < 40);
  const after = evaluateReceiverAcceptance({
    ...OPEN,
    phase: 'open',
    occupied: false,
    bodyRadius: cut.parts.radius,
    damaged: true,
    damagedHalfWidthScale: 0.55,
  });
  assert.equal(after.successCredit, true);
  assert.equal(after.acceptedQty, 4);
});

test('a bulky body is refused by the opening, and mass is not a second inventory cap', () => {
  const bulky = evaluateReceiverAcceptance({ ...OPEN, bodyRadius: 40, mass: 9000, quantity: 2 });
  const damagedFit = evaluateReceiverAcceptance({
    ...OPEN,
    bodyRadius: 16,
    damaged: true,
    damagedHalfWidthScale: 0.55,
    mass: 9000,
  });
  const damagedWide = evaluateReceiverAcceptance({
    ...OPEN,
    bodyRadius: 30,
    damaged: true,
    damagedHalfWidthScale: 0.55,
  });
  assert.equal(bulky.reason, 'envelope');
  assert.equal(bulky.acceptedQty, 0);
  assert.equal(bulky.inventoryCapApplied, false);
  assert.equal(bulky.handlingMass, 9000);
  assert.equal(damagedFit.successCredit, true);
  assert.equal(damagedFit.inventoryCapApplied, false);
  assert.equal(damagedWide.reason, 'envelope');
});

test('the hangar mouth commits a real entry once and will not take the next load past capacity', () => {
  const priorLedger = environmentalMachinery._industryLedger;
  const priorResult = environmentalMachinery._industrySiteResult;
  const priorOccupant = environmentalMachinery._apertureLastOccupant;
  const priorDelivery = environmentalMachinery._apertureDeliveryCandidate;
  try {
    environmentalMachinery._industryLedger = null;
    environmentalMachinery._industrySiteResult = null;
    environmentalMachinery._apertureLastOccupant = null;
    const body = {
      id: 'ore-seed-4242',
      alive: true,
      pos: aperturePoint(0, 0),
      vel: { x: 4, z: 0 },
      radius: 6,
      mass: 80,
      data: { amount: 5, commodityId: 'cmdty_ore_iron', cargoClass: 'ore' },
    };
    environmentalMachinery._apertureDeliveryCandidate = body;
    environmentalMachinery._publishApertureIndustry({ simTime: 12 }, { phase: 'open', occupied: false });
    assert.equal(environmentalMachinery._industryLedger.stored, 5);
    environmentalMachinery._publishApertureIndustry({ simTime: 12.1 }, { phase: 'open', occupied: false });
    assert.equal(environmentalMachinery._industryLedger.stored, 5);
    environmentalMachinery._apertureDeliveryCandidate = {
      id: 'ore-overflow',
      alive: true,
      pos: aperturePoint(0, 0),
      vel: { x: 3, z: 0 },
      radius: 6,
      mass: 40,
      data: { amount: 10, commodityId: 'cmdty_ore_iron', cargoClass: 'ore' },
    };
    environmentalMachinery._publishApertureIndustry({ simTime: 13 }, { phase: 'open', occupied: false });
    assert.equal(environmentalMachinery._industryLedger.stored, 8);
    const contact = environmentalMachinery._industrySiteResult.contact;
    assert.equal(contact.acceptedQty, 3);
    assert.equal(contact.successCredit, true);
    assert.equal(contact.redirect.qty, 7);
    environmentalMachinery._apertureDeliveryCandidate = {
      id: 'ore-past-full',
      alive: true,
      pos: aperturePoint(0, 0),
      vel: { x: 3, z: 0 },
      radius: 6,
      data: { amount: 1, commodityId: 'cmdty_ore_iron', cargoClass: 'ore' },
    };
    environmentalMachinery._publishApertureIndustry({ simTime: 14 }, { phase: 'open', occupied: false });
    assert.equal(environmentalMachinery._industryLedger.stored, 8);
    assert.equal(environmentalMachinery._industrySiteResult.contact.successCredit, false);
    assert.equal(environmentalMachinery._industrySiteResult.contact.reason, 'capacity-full');
  } finally {
    environmentalMachinery._industryLedger = priorLedger;
    environmentalMachinery._industrySiteResult = priorResult;
    environmentalMachinery._apertureLastOccupant = priorOccupant;
    environmentalMachinery._apertureDeliveryCandidate = priorDelivery;
  }
});
