import test from 'node:test';
import assert from 'node:assert/strict';
import { automation } from '../src/systems/automation.js';
import { lostAssetLines, lostAssetsSummaryText } from '../src/ui/automationSummary.js';

function host() {
  const state = {
    meta: { seed: 4242 },
    simTime: 90,
    automation: { meta: { lostAssetsLog: [] } },
  };
  return {
    state,
    meta() { return state.automation.meta; },
    bus: { emit() {} },
  };
}

test('seed 4242: lost assets stay listed by kind, sector, and value from the existing log', () => {
  const box = host();
  automation._loseAsset.call(box, 'trader', { id: 'trader-4242' }, 840, 'sector_helios_prime');
  automation._loseAsset.call(box, 'outpost', { id: 'outpost-4242' }, 1200, 'sector_ceres_belt');
  const entry = box.state.automation.meta.lostAssetsLog[0];
  assert.equal(entry.kind, 'trader');
  assert.equal(entry.sectorId, 'sector_helios_prime');
  assert.equal(entry.value, 840);
  const lines = lostAssetLines(box.state);
  assert.equal(lines.length, 2);
  assert.match(lines[0].text, /trader/);
  assert.match(lines[0].text, /Helios Prime/);
  assert.match(lines[0].text, /840/);
  assert.match(lines[1].text, /outpost/);
  assert.match(lines[1].text, /1200/);
  assert.equal(lostAssetsSummaryText(box.state), lines.map((line) => line.text).join('\n'));
  const quiet = host();
  assert.equal(lostAssetsSummaryText(quiet.state), '');
  assert.deepEqual(lostAssetLines(quiet.state), []);
});
