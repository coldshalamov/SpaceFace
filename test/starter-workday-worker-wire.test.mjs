import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomainDiffer, applyDomainPathUpdate, configureDomainMirroring, createDomainMirroringProfile } from '../scripts/lib/simReadModel.mjs';
import { projectBridgeEvent } from '../scripts/lib/simEventBridge.mjs';
import { kesslerStarterWorkReply } from '../src/ui/station/starterWorkdayConversation.js';
import { firstBuoyReceivingReceipt } from '../src/missions/starterBuoyAftermath.js';

test('production worker mirror preserves receipt provenance and real next-ticket conversation inputs', () => {
  configureDomainMirroring(createDomainMirroringProfile('station'));
  const receipt = { missionId: 'buoy-1', outcome: 'completed', source: 'starterJob', type: 'tow_recovery',
    destStationId: 'station_helios', destSectorId: 'sector_helios_prime', rewardCr: 520, at_s: 100,
    starterBuoyRecovery: { version: 1, jobId: 'starter_pelican', step: 1, completionMethod: 'tow_in' } };
  const offer = { id: 'buoy-2', source: 'starterJob', type: 'tow_recovery', title: 'Actual board title',
    brief: 'Actual board instructions', destStationId: 'station_helios', destSectorId: 'sector_helios_prime',
    params: { starterJobId: 'starter_pelican', starterStep: 2, requiredModule: 'mod_winch_hd' } };
  const state = { simTime: 110, world: { currentSectorId: 'sector_helios_prime' },
    ui: { docked: true, dockedStationId: 'station_helios' },
    player: { ownedShips: [{ defId: 'ship_pelican', fittings: ['mod_winch_hd'] }] },
    missions: { receipts: [receipt], starterJobStep: { starter_pelican: 1 }, active: [],
      boards: { station_helios: { slots: [offer] } } } };
  const domains = new Map();
  const differ = createDomainDiffer();
  for (const update of structuredClone(differ.diff(state, 0).updates)) applyDomainPathUpdate(domains, update);
  const mirrored = { missions: domains.get('missions'), player: domains.get('player'),
    ui: { docked: domains.get('ui.docked'), dockedStationId: domains.get('ui.dockedStationId') },
    world: { currentSectorId: domains.get('world.currentSectorId') } };
  assert.deepEqual(firstBuoyReceivingReceipt(mirrored, 110), receipt);
  const reply = kesslerStarterWorkReply(mirrored, 'station_helios', 'helios_local_work');
  assert.equal(reply.missionOffer?.id, offer.id);
  assert.match(reply.text, /ticket 1 is settled/);
  assert.match(reply.text, /Actual board instructions/);
  assert.notEqual(mirrored.missions.receipts, state.missions.receipts);
});

test('production worker event bridge preserves receiving scene for existing presentation consumers', () => {
  const payload = { eventId: 'sse:44c-receiving:buoy-1', kind: 'repair_drone', sectorId: 'sector_helios_prime',
    stationId: '7', path: 'hull-crawl', durationS: 90, budget: 0, bearing: 0,
    from: { x: 1320, z: -420 }, to: { x: 1322, z: -420 }, entityIds: [],
    contextLabel: '44-C receiving check — berth intake', receivingMissionId: 'buoy-1' };
  const result = projectBridgeEvent('station:sideEvent', payload);
  assert.equal(result.dropped, false);
  assert.deepEqual(structuredClone(result.flat), payload);
});
