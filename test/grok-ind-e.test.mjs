// PB-IND-E — SF-098 stall redirect, SF-099/116 outage remedy, SF-104 kill-machine collateral.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mulberry32 } from '../src/core/rng.js';
import { KILL_MACHINES, pointInsideKillMachine } from '../src/data/environmentalMachinery.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import {
  closeOutage,
  createIndustryLedger,
  evaluateReceiverAcceptance,
  judgeKillMachineCollateral,
  openOutage,
  redirectFullDepot,
} from '../src/systems/worldSiteRuntime.js';

const SEED = 4242;

test('a full receiver takes only the room it has and redirects the rest with the same hauler', () => {
  const partial = evaluateReceiverAcceptance({
    phase: 'open',
    entered: true,
    relativeSpeed: 5,
    quantity: 5,
    capacity: 8,
    stored: 6,
    commodityId: 'cmdty_ore_iron',
    cargoClass: 'ore',
    acceptsClasses: ['ore'],
    alternateDestinationId: 'station_ceres',
    mouthHalfWidth: 34,
    bodyRadius: 4,
  });
  assert.equal(partial.successCredit, true);
  assert.equal(partial.acceptedQty, 2);
  assert.equal(partial.storedAfter, 8);
  assert.equal(partial.redirect.qty, 3);
  const full = evaluateReceiverAcceptance({
    phase: 'open',
    entered: true,
    relativeSpeed: 5,
    quantity: 4,
    capacity: 8,
    stored: 8,
    commodityId: 'cmdty_ore_iron',
    cargoClass: 'ore',
    acceptsClasses: ['ore'],
    alternateDestinationId: 'station_ceres',
  });
  assert.equal(full.successCredit, false);
  assert.equal(full.reason, 'capacity-full');
  assert.equal(full.acceptedQty, 0);
  assert.equal(full.redirect.qty, 4);
  const ledger = redirectFullDepot(createIndustryLedger({ capacity: 8 }), full).ledger;
  assert.equal(ledger.worker.stage, 'redirect');
  assert.equal(ledger.worker.destinationId, 'station_ceres');
  assert.equal(ledger.worker.qty, 4);
  assert.equal(ledger.worker.ownerNotCalled, 'src/systems/traffic.js');
  assert.equal(ledger.stored, 0);
  const wrong = evaluateReceiverAcceptance({
    phase: 'open',
    entered: true,
    relativeSpeed: 5,
    quantity: 4,
    capacity: 8,
    stored: 0,
    commodityId: 'cmdty_scrap',
    cargoClass: 'scrap',
    acceptsClasses: ['ore'],
  });
  assert.equal(wrong.reason, 'wrong-class');
  assert.equal(wrong.acceptedQty, 0);
  assert.equal(wrong.successCredit, false);
});

test('an outage names the missing good and the remedy, and recovery closes once', () => {
  const simTime = mulberry32(SEED)() * 20;
  let ledger = createIndustryLedger({ simTime });
  const opened = openOutage(ledger, {
    cause: 'refinery-halted',
    missingCommodity: 'cmdty_refined_ore',
    remedy: 'deliver-repair-parts',
  });
  ledger = opened.ledger;
  assert.equal(opened.contract.missingCommodity, 'cmdty_refined_ore');
  assert.equal(opened.contract.remedy, 'deliver-repair-parts');
  assert.equal(opened.contract.marketOwnerNotCalled, 'src/systems/economy.js');
  const duplicate = openOutage(ledger, {
    cause: 'refinery-halted',
    missingCommodity: 'cmdty_refined_ore',
    remedy: 'deliver-repair-parts',
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.ledger, ledger);
  const closed = closeOutage(ledger);
  assert.equal(closed.closed, true);
  assert.equal(closed.ledger.shortage.status, 'closed');
  const again = closeOutage(closed.ledger);
  assert.equal(again.duplicate, true);
  assert.equal(again.ledger.shortage.status, 'closed');
});

test('a kill machine names collateral inside its volume and pays nothing for the contact', () => {
  const machine = KILL_MACHINES[0];
  const center = { x: machine.globalPos.x, z: machine.globalPos.z };
  assert.equal(pointInsideKillMachine(machine, center), true);
  const surge = judgeKillMachineCollateral({
    phase: 'surge',
    occupants: [
      { id: 'player', role: 'player', inside: true },
      { id: 'raider', role: 'attacker', inside: true },
      { id: 'hauler', role: 'worker', inside: true },
      { id: 'crate', role: 'cargo', inside: true },
      { id: 'bystander', role: 'worker', inside: false },
    ],
  });
  assert.equal(surge.contact, true);
  assert.equal(surge.credit, 0);
  assert.equal(surge.scriptedKill, false);
  assert.equal(surge.usesExistingVolume, true);
  assert.deepEqual(surge.attackerIds, ['raider']);
  assert.deepEqual(surge.collateral.map((row) => row.id), ['hauler', 'crate']);
  assert.equal(surge.collateral.every((row) => row.kept === true), true);
  const warning = judgeKillMachineCollateral({
    phase: 'warning',
    occupants: [{ id: 'raider', role: 'attacker', inside: true }],
  });
  assert.equal(warning.contact, false);
  assert.equal(warning.dangerWindow, true);
  assert.equal(warning.credit, 0);
  const calm = judgeKillMachineCollateral({
    phase: 'calm',
    occupants: [{ id: 'raider', role: 'attacker', inside: true }],
  });
  assert.equal(calm.contact, false);
  assert.equal(calm.credit, 0);
  const outside = judgeKillMachineCollateral({
    phase: 'surge',
    occupants: [{ id: 'raider', role: 'attacker', inside: false }],
  });
  assert.equal(outside.contact, false);
  const prior = environmentalMachinery._killCollateral;
  try {
    environmentalMachinery._killCollateral = new Map();
    environmentalMachinery._noteKillCollateral(
      { simTime: mulberry32(SEED)() * 8, playerId: 'pilot' },
      machine,
      { id: 'pilot', alive: true, pos: center, type: 'ship' },
      { phase: 'surge' },
    );
    const live = environmentalMachinery._killCollateral.get(machine.id);
    assert.equal(live.playerExposed, true);
    assert.equal(live.credit, 0);
    assert.equal(live.scriptedKill, false);
  } finally {
    environmentalMachinery._killCollateral = prior;
  }
});
