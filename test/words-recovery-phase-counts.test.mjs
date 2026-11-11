// words-recovery-phase-counts — every recovery-prompt phase can count to one. The words-field-counts
// unit fixed the tethered phase's custody threshold; the drive-disabled and surrendered details,
// the custody/receipt/lost meta chips, and the screen-reader timer still read "1 units",
// "1 CREDITS", "1 CARGO", "tow 5 cargo", and "1 seconds remaining".
import assert from 'node:assert/strict';
import test from 'node:test';

import { recoveryCustodyView } from '../src/ui/recoveryEncounterPrompt.js';

const STATE = { simTime: 100, entityList: [] };

test('the drive-disabled and surrendered details reel inside one unit when the threshold is one', () => {
  const drive = recoveryCustodyView({
    id: 'civ:one', entityId: 1, label: 'MTS Relief Mule', recoveryKind: 'civilian_disabled',
    phase: 'awaiting_tether', deadlineAt: 200, remainingQty: 8,
    destinationStationId: 'station_tethys', secureReel_wu: 1,
  }, STATE, STATE.simTime);
  assert.match(drive.detail, /reel inside 1 unit, then tow 8 cargo units to/, `got: ${drive.detail}`);
  assert.ok(!drive.detail.includes('1 units'), 'no singular leak');

  const surrendered = recoveryCustodyView({
    id: 'surr:one', entityId: 2, label: 'Yielded Cutter', recoveryKind: 'surrendered',
    phase: 'awaiting_tether', escapeAt: 200, rewardCr: 180,
    destinationStationId: 'station_tethys', secureReel_wu: 1,
  }, STATE, STATE.simTime);
  assert.match(surrendered.detail, /reel inside 1 unit before escape/, `got: ${surrendered.detail}`);
});

test('the tow clause names the civilian cargo in whole counted words', () => {
  const many = recoveryCustodyView({
    id: 'civ:many', entityId: 3, label: 'MTS Relief Mule', recoveryKind: 'civilian_disabled',
    phase: 'awaiting_tether', deadlineAt: 200, remainingQty: 5,
    destinationStationId: 'station_tethys', secureReel_wu: 60,
  }, STATE, STATE.simTime);
  assert.match(many.detail, /tow 5 cargo units to/, `got: ${many.detail}`);
  assert.match(many.meta, /5 CARGO UNITS/);
  const one = recoveryCustodyView({
    id: 'civ:solo', entityId: 4, label: 'MTS Relief Mule', recoveryKind: 'civilian_disabled',
    phase: 'awaiting_tether', deadlineAt: 200, remainingQty: 1,
    destinationStationId: 'station_tethys', secureReel_wu: 60,
  }, STATE, STATE.simTime);
  assert.match(one.detail, /tow 1 cargo unit to/, `got: ${one.detail}`);
  assert.match(one.meta, /1 CARGO UNIT/);
  assert.ok(!one.meta.includes('1 CARGO UNITS'), 'no plural leak');
});

test('custody, receipt and lost metas count credits and cargo, and the aria counts seconds', () => {
  const custody = recoveryCustodyView({
    id: 'surr:solo', entityId: 5, label: 'Yielded Cutter', recoveryKind: 'surrendered',
    phase: 'awaiting_tether', escapeAt: 101, rewardCr: 1,
    destinationStationId: 'station_tethys', secureReel_wu: 60,
  }, STATE, STATE.simTime);
  assert.match(custody.meta, /1 CREDIT CUSTODY/, `got: ${custody.meta}`);
  assert.match(custody.ariaLabel, /1 second remaining\./, `got: ${custody.ariaLabel}`);

  const receipt = recoveryCustodyView({
    id: 'civ:done', shape: 'civilian_freight_recovery', outcome: 'recovered',
    recoveryKind: 'civilian_disabled', credits: 1, remainingQty: 1,
    stationId: 'station_tethys',
  }, STATE, STATE.simTime);
  assert.match(receipt.meta, /1 CREDIT/, `got: ${receipt.meta}`);
  assert.match(receipt.meta, /1 CARGO UNIT/, `got: ${receipt.meta}`);

  const lost = recoveryCustodyView({
    id: 'civ:lost', entityId: 6, label: 'MTS Relief Mule', recoveryKind: 'civilian_disabled',
    phase: 'lost', lostReason: 'tether_broke', remainingQty: 2,
    destinationStationId: 'station_tethys',
  }, STATE, STATE.simTime);
  assert.match(lost.meta, /2 CARGO UNITS/, `got: ${lost.meta}`);
});
