import test from 'node:test';
import assert from 'node:assert/strict';
import { recordDeed, markTold } from '../src/systems/deedRecord.js';
import { buildShipLedger } from '../src/systems/shipLedger.js';
import { buildReply, generateContacts, getChoices } from '../src/ui/station/barContacts.js';
import { infStoryScenario, STORY_SECTOR } from './helpers/infStoryScenario.mjs';

test('STORY-11 [4242] two ledger histories make different barkeep lines at the same station', () => {
  const h = infStoryScenario();
  try {
    const stationId = 'station_helios';
    const rescue = recordDeed(h.state, { id: 'cited-rescue', kind: 'pod_rescued', sectorId: STORY_SECTOR, stationId });
    const raider = recordDeed(h.state, { id: 'cited-raider', kind: 'kill_outlaw', sectorId: STORY_SECTOR, stationId, subject: 'Red Latch raider' });
    const contacts = generateContacts(stationId, h.state);
    const barkeep = contacts.find((row) => row.role === 'barkeep');
    assert.ok(barkeep);
    assert.ok(getChoices('barkeep', barkeep).some((row) => row.id === 'word'), 'the live barkeep offers the reply');
    assert.equal(buildShipLedger(h.state).mostCitedDeed, null, 'untold deeds have no invented citations');
    markTold(h.state, rescue.id, { by: 'bar:station_forge' });
    markTold(h.state, rescue.id, { by: 'bar:station_ceres' });
    markTold(h.state, raider.id, { by: 'bar:station_forge' });
    const before = JSON.stringify(h.state.story);
    const first = buildReply('barkeep', 'word', h, stationId, barkeep);
    assert.equal(first.ledgerDeed.sourceId, rescue.id);
    assert.equal(first.ledgerDeed.citations, 2);
    assert.equal(first.ledgerDeed.text, buildShipLedger(h.state).mostCitedDeed.text);
    assert.equal(JSON.stringify(h.state.story), before, 'the reader does not write a new reputation or citation');
    h.state.story = JSON.parse(before);
    markTold(h.state, raider.id, { by: 'bar:station_ceres' });
    markTold(h.state, raider.id, { by: 'bar:station_forge' });
    const second = buildReply('barkeep', 'word', h, stationId, barkeep);
    assert.equal(second.ledgerDeed.sourceId, raider.id);
    assert.notEqual(second.text, first.text);
    assert.equal(buildReply('barkeep', 'word', h, stationId, barkeep).text, second.text);
    console.log(`STORY-11 first: ${first.text}`);
    console.log(`STORY-11 second: ${second.text}`);
  } finally { h.dispose(); }
});
