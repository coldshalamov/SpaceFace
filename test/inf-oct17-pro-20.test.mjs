// PRO-20 — the save browser names each slot's game mode.
//
// Slot rows resolve the mode word from the envelope: an adventure save reads
// Adventure, a save holding an active authored circuit race reads Racing.
// Seed 4242 is the fixture's seed, not a score.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { slotCardFromEnvelopeData } from '../src/save/saveSystem.js';
import { slotModeLabel, slotRowSubLine } from '../src/ui/screens/saveLoad.js';

const SEED = 4242;

function envelope({ active = [] } = {}) {
  return {
    fmt: 'spaceface-save',
    version: 1,
    savedAt: '2026-10-08T12:00:00.000Z',
    playtimeS: 90,
    slot: '1',
    checksum: 'data-only',
    data: {
      player: { credits: SEED, ownedShips: [{ defId: 'ship_kestrel' }], activeShipIndex: 0 },
      world: { currentSectorId: 'sector_helios_prime' },
      missions: { boards: {}, active, completedLog: [], receipts: [], nextId: 2 },
      meta: {},
    },
  };
}

function circuitRaceMission(overrides = {}) {
  return {
    id: 'm_race_1',
    status: 'active',
    type: 'race',
    title: 'Textile Belt qualifying',
    params: { racingContractId: 'contract_textile_qual', levelId: 'level_textile_outbound' },
    ...overrides,
  };
}

test('PRO-20: an adventure save resolves the adventure mode word on its row', () => {
  const card = slotCardFromEnvelopeData('1', envelope());
  assert.equal(card.mode, 'adventure');
  assert.equal(slotModeLabel(card), 'Adventure');
  const sub = slotRowSubLine(card, '');
  assert.equal(sub.split(' · ')[0], 'Adventure');
  assert.equal(sub.includes('contract_textile_qual'), false);
});

test('PRO-20: a save holding an active circuit race resolves the racing mode word', () => {
  const card = slotCardFromEnvelopeData('2', envelope({ active: [circuitRaceMission()] }));
  assert.equal(card.mode, 'racing');
  assert.equal(slotModeLabel(card), 'Racing');
  const sub = slotRowSubLine(card, '');
  assert.equal(sub.split(' · ')[0], 'Racing');
  assert.equal(sub.includes('Adventure'), false);
  assert.equal(sub.includes('contract_textile_qual'), false, 'no raw contract id in the row');
});

test('PRO-20: quiet branches stay adventure and empty slots name no mode', () => {
  const finished = slotCardFromEnvelopeData('1', envelope({
    active: [circuitRaceMission({ status: 'completed' })],
  }));
  assert.equal(finished.mode, 'adventure');

  const sprint = slotCardFromEnvelopeData('1', envelope({
    active: [circuitRaceMission({
      id: 'offer_sprint', title: 'Sprint', storyTag: 'speed:sprint',
      params: { racingContractId: 'sprint', adventureSpeedId: 'sprint', racingKind: 'adventure' },
    })],
  }));
  assert.equal(sprint.mode, 'adventure', 'an adventure sprint is adventure content');

  assert.equal(slotModeLabel({ savedAt: '2026-10-08T12:00:00.000Z' }), 'Adventure',
    'a legacy card without a mode still names one');
  assert.equal(slotModeLabel({ savedAt: '', playtimeS: undefined }), '');
  const emptySub = slotRowSubLine({}, '');
  assert.equal(emptySub, 'Empty slot');
  assert.equal(emptySub.includes('Adventure'), false);
});
