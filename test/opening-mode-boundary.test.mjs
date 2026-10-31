import test from 'node:test';
import assert from 'node:assert/strict';
import { firstBuoyReceivingReceipt, firstBuoyReceivingItem } from '../src/missions/starterBuoyAftermath.js';

const station = { id: 42, alive: true, pos: { x: 1280, z: -420 }, data: { stationId: 'station_helios' } };
const receipt = () => ({ missionId: 'buoy-1', outcome: 'completed', source: 'starterJob', type: 'tow_recovery',
  destStationId: 'station_helios', destSectorId: 'sector_helios_prime', rewardCr: 520, at_s: 100,
  starterBuoyRecovery: { version: 1, jobId: 'starter_pelican', step: 1, completionMethod: 'tow_in' } });
const state = () => ({ mode: 'flight', simTime: 110, world: { currentSectorId: 'sector_helios_prime' }, missions: { receipts: [receipt()] } });
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function check(s, allowed) {
  const before = structuredClone(s);
  const anchor = freeze(structuredClone(station));
  freeze(s);
  const found = firstBuoyReceivingReceipt(s, 110);
  const item = firstBuoyReceivingItem(s, anchor, 110);
  if (allowed) {
    assert.strictEqual(found, s.missions.receipts[0]);
    assert.deepEqual(item, { eventId: 'sse:44c-receiving:buoy-1', kind: 'repair_drone', budget: 0,
      path: 'hull-crawl', bearing: 0, dueAt: 110, durationS: 90,
      sectorId: 'sector_helios_prime', stationId: '42', receivingMissionId: 'buoy-1' });
  } else {
    assert.equal(found, null);
    assert.equal(item, null);
  }
  assert.deepEqual(s, before, 'helpers leave all state and receipt evidence unchanged');
  assert.deepEqual(anchor, station, 'helpers leave station unchanged');
}

test('Adventure receipt with no survival run retains the existing receiving payload', () => {
  check(state(), true);
  check({ ...state(), run: null }, true);
  check({ ...state(), run: { kind: 'campaign' } }, true);
});

for (const [label, ruleset] of [['Swarm', 'swarm'], ['Crucible', 'scored']]) {
  for (const phase of ['wave_intro', 'active', 'ended']) {
    test(`${label} ${phase} cannot reuse a stale valid Adventure receipt and Helios station`, () => {
      check({ ...state(), run: { kind: 'survival', ruleset, phase } }, false);
    });
  }
}

test('survival exclusion depends on kind, not a ruleset or phase heuristic', () => {
  check({ ...state(), run: { kind: 'survival' } }, false);
  check({ ...state(), run: { kind: 'survival', ruleset: 'future-ruleset', phase: 'future-phase' } }, false);
});

test('normal owner clearing a retained ended run restores only otherwise-valid receiving', () => {
  const stale = { ...state(), run: { kind: 'survival', ruleset: 'swarm', phase: 'ended' } };
  check(stale, false);
  const cleared = structuredClone(stale);
  delete cleared.run;
  check(cleared, true);
  assert.equal(firstBuoyReceivingReceipt(cleared, 280), null, 'original expiry remains enforced');
  assert.equal(firstBuoyReceivingItem(cleared, station, 280), null);
});
