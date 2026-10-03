// Rows 182 / 198 / 205 — NXB-021 already-true pin, NXB-006 moving gap, NXB-023 sorting job.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mulberry32 } from '../src/core/rng.js';
import { aperturePoint } from '../src/data/environmentalMachinery.js';
import {
  deriveDrillCommitment,
  drillCellEvidence,
  drillEnergyLimitCopy,
  drillHeatLimitCopy,
  knownReturnPath,
  recoverClearedGeometry,
  tileIndex,
} from '../src/systems/drill.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import {
  createIndustryLedger,
  evaluateReceiverAcceptance,
  offerSortingJob,
  resolveSortingJob,
} from '../src/systems/worldSiteRuntime.js';

const SEED = 4242;
const HIDDEN = 'cmdty_ore_goldium';
const IRON = 'cmdty_ore_iron';
const NICKEL = 'cmdty_ore_bronzium';

function rock() {
  return { type: 'rock', hp: 8, maxHp: 8, ore: null, hazard: false, tierReq: 1, hardness: 1, surveyed: false, risk: 'low' };
}
function empty() {
  return { type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 };
}
function fieldOf(width, height) {
  return Array.from({ length: width }, () => Array.from({ length: height }, () => rock()));
}

test('NXB-021 the next drill commitment shows only known ground and does not mint yield', () => {
  const field = fieldOf(7, 8);
  field[3][0] = empty();
  field[3][1] = empty();
  field[3][2] = empty();
  field[3][3] = {
    type: 'vein', hp: 5, maxHp: 5, ore: IRON, yieldU: 4,
    hazard: false, tierReq: 1, hardness: 1, surveyed: true, risk: 'low',
  };
  field[4][1] = {
    type: 'vein', hp: 5, maxHp: 5, ore: NICKEL, yieldU: 6,
    hazard: false, tierReq: 2, hardness: 1.2, surveyed: true, risk: 'high',
  };
  field[0][7] = {
    type: 'vein', hp: 5, maxHp: 5, ore: HIDDEN, yieldU: 9,
    hazard: false, tierReq: 2, hardness: 1.4, surveyed: false, risk: 'high',
  };
  const session = {
    field,
    avatar: { col: 3, row: 2, faceDir: 'down' },
    drillEnergy: 80,
    drillTemp: 10,
    overheated: false,
    energyDepleted: false,
    rockBudget: 0,
    rockBudgetMax: 40,
  };
  const view = deriveDrillCommitment(session, { tier: 1, cargoFree: 4 });
  assert.equal(view.facing.evidence, 'known');
  assert.equal(view.facing.ore, IRON);
  assert.equal(view.nearby.ore, NICKEL);
  assert.equal(view.nearby.blocked, true);
  assert.equal(view.deeper.ore, IRON);
  assert.equal(view.deeper.blocked, false);
  assert.equal(drillCellEvidence(field, 0, 7).kind, 'unrevealed');
  assert.equal(drillCellEvidence(field, 0, 7).ore, null);
  assert.equal(JSON.stringify(view).includes(HIDDEN), false);
  assert.ok(view.returnPath.length > 0);
  for (const step of view.returnPath) assert.equal(field[step.col][step.row].type, 'empty');
  assert.equal(knownReturnPath(field, 3, 2).some((step) => field[step.col][step.row].type !== 'empty'), false);
  assert.equal(view.cargoGrant, false);
  assert.equal(view.depleted, true);
  assert.equal(field[3][3].hp, 5);
  assert.equal(session.rockBudget, 0);
  const hot = deriveDrillCommitment({ ...session, overheated: true, drillTemp: 100, rockBudget: 20 }, { tier: 1, cargoFree: 4 });
  const dry = deriveDrillCommitment({ ...session, energyDepleted: true, drillEnergy: 0, rockBudget: 20 }, { tier: 1, cargoFree: 4 });
  assert.equal(hot.limit, 'heat');
  assert.equal(dry.limit, 'energy');
  assert.notEqual(drillHeatLimitCopy(), drillEnergyLimitCopy());
  const cleared = [tileIndex(3, 2), tileIndex(3, 3)];
  assert.deepEqual(recoverClearedGeometry(cleared, 1), [tileIndex(3, 2), tileIndex(3, 3)].sort((a, b) => a - b));
});

test('NXB-006 one moving gap accepts and refuses from the same rule without moving the load', () => {
  const simTime = mulberry32(SEED)() * 40;
  const body = {
    phase: 'open',
    entered: true,
    relativeSpeed: 9,
    quantity: 3,
    capacity: 8,
    stored: 0,
    mouthHalfWidth: 34,
    bodyRadius: 5,
    commodityId: 'cmdty_ore_iron',
    payloadPos: { x: 20, z: 5 },
    simTime,
  };
  const hit = evaluateReceiverAcceptance(body);
  const miss = evaluateReceiverAcceptance({ ...body, phase: 'locked' });
  const lip = evaluateReceiverAcceptance({ ...body, entered: false, lipContact: true });
  assert.equal(hit.successCredit, true);
  assert.equal(hit.acceptedQty, 3);
  assert.equal(miss.reason, 'closed');
  assert.equal(miss.successCredit, false);
  assert.equal(miss.recoverable, true);
  assert.equal(lip.reason, 'lip-contact');
  assert.deepEqual(hit.payloadPos, body.payloadPos);
  assert.deepEqual(miss.payloadPos, body.payloadPos);
  assert.equal(hit.teleported, false);
  assert.equal(miss.teleported, false);
  const retry = evaluateReceiverAcceptance({ ...body, phase: 'open', stored: 0 });
  assert.equal(retry.successCredit, true);
  assert.equal(body.payloadPos.x, 20);
});

test('NXB-023 a congested receiver offers a sort, resumes one worker, and will not pay the wrong class twice', () => {
  let ledger = createIndustryLedger({ capacity: 8 });
  const offered = offerSortingJob(ledger, {
    workerId: 'hauler-7',
    obstructClass: 'scrap',
    validClass: 'ore',
    obstructionId: 'bale-1',
  });
  ledger = offered.ledger;
  assert.equal(offered.job.status, 'open');
  assert.equal(ledger.worker.stage, 'waiting-sort');
  const wrong = resolveSortingJob(ledger, { action: 'remove', cargoClass: 'ore', receiptId: 'bad-1' });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.credit, 0);
  assert.equal(wrong.identityKept, true);
  assert.equal(wrong.job.obstructionId, 'bale-1');
  assert.equal(wrong.job.obstructionAlive, true);
  assert.equal(wrong.job.status, 'open');
  const cleared = resolveSortingJob(wrong.ledger, { action: 'remove', cargoClass: 'scrap', receiptId: 'good-1' });
  assert.equal(cleared.ok, true);
  assert.equal(cleared.credit, 1);
  assert.equal(cleared.throughput, 'resumed');
  assert.equal(cleared.worker.stage, 'resume-delivery');
  assert.equal(cleared.worker.id, 'hauler-7');
  assert.equal(cleared.worker.ownerNotCalled, 'src/systems/traffic.js');
  assert.equal(cleared.salvage.interactable, true);
  assert.equal(cleared.salvage.id, 'bale-1');
  const replay = resolveSortingJob(cleared.ledger, { action: 'remove', cargoClass: 'scrap', receiptId: 'good-1' });
  assert.equal(replay.duplicate, true);
  assert.equal(replay.credit, 0);
  const jammed = evaluateReceiverAcceptance({
    phase: 'jam',
    entered: true,
    quantity: 4,
    capacity: 8,
    stored: 0,
    commodityId: 'cmdty_ore_iron',
  });
  assert.equal(jammed.successCredit, false);
  const resumed = evaluateReceiverAcceptance({
    phase: 'open',
    entered: true,
    relativeSpeed: 4,
    quantity: 4,
    capacity: 8,
    stored: 0,
    commodityId: 'cmdty_ore_iron',
    cargoClass: 'ore',
    acceptsClasses: ['ore', 'scrap'],
    mouthHalfWidth: 34,
    bodyRadius: 4,
  });
  assert.equal(resumed.successCredit, true);
  assert.equal(resumed.acceptedQty, 4);
});

test('clearing the hangar jam resumes the same waiting worker once', () => {
  const priorLedger = environmentalMachinery._industryLedger;
  const priorResult = environmentalMachinery._industrySiteResult;
  const priorOccupant = environmentalMachinery._apertureLastOccupant;
  const priorDelivery = environmentalMachinery._apertureDeliveryCandidate;
  try {
    environmentalMachinery._industryLedger = null;
    environmentalMachinery._industrySiteResult = null;
    environmentalMachinery._apertureDeliveryCandidate = null;
    environmentalMachinery._apertureLastOccupant = {
      id: 'bale-live',
      alive: true,
      pos: aperturePoint(0, 0),
      vel: { x: 0, z: 0 },
      radius: 10,
      data: {},
    };
    environmentalMachinery._publishApertureIndustry({ simTime: 3 }, { phase: 'jam', occupied: true });
    assert.equal(environmentalMachinery._industryLedger.worker.stage, 'waiting-sort');
    environmentalMachinery._apertureLastOccupant = null;
    environmentalMachinery._publishApertureIndustry({ simTime: 4 }, { phase: 'open', occupied: false });
    assert.equal(environmentalMachinery._industryLedger.worker.stage, 'resume-delivery');
    assert.equal(environmentalMachinery._industryLedger.salvage.interactable, true);
    environmentalMachinery._publishApertureIndustry({ simTime: 5 }, { phase: 'open', occupied: false });
    assert.equal(environmentalMachinery._industryLedger.sorting.status, 'cleared');
    assert.equal(environmentalMachinery._industryLedger.sorting.receipts['occupancy-cleared'].ok, true);
  } finally {
    environmentalMachinery._industryLedger = priorLedger;
    environmentalMachinery._industrySiteResult = priorResult;
    environmentalMachinery._apertureLastOccupant = priorOccupant;
    environmentalMachinery._apertureDeliveryCandidate = priorDelivery;
  }
});
