import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { loadingKeyCapTokens } from '../src/ui/loadingPresenter.js';
import {
  playerFacingContractTitle,
  playerFacingObjectiveSummary,
} from '../src/ui/sim/missionRecap.js';
import { pauseStatusLines } from '../src/ui/screens/pause.js';
import { slotObjectiveSummary } from '../src/ui/screens/saveLoad.js';

test('Line keys paint two chips with a slash, not a third "/" key', () => {
  assert.deepEqual(loadingKeyCapTokens('F / RMB'), [
    { kind: 'kbd', text: 'F' },
    { kind: 'sep', text: '/' },
    { kind: 'kbd', text: 'RMB' },
  ]);
});

test('Pause names the 47-A job, not the filing title', () => {
  const mission = {
    id: 'mission-47a',
    title: 'Contract 47-A: Mass Variance Sample',
    type: 'salvage_retrieval',
    status: 'active',
    storyTag: 'campaign47a:b0:recovery',
    objectiveProgress: 0,
    objectiveTarget: 1,
    params: { contractId: '47-A', sampleRecovered: false },
  };
  const lines = pauseStatusLines({
    run: null,
    missions: { active: [mission] },
    ui: { trackedMissionId: 'mission-47a' },
    simTime: 30,
  });
  assert.match(lines.objective, /TRACKED · Recover the 47-A sample/);
  assert.doesNotMatch(lines.objective, /Mass Variance Sample/);
  assert.equal(playerFacingContractTitle({ ...mission, params: { ...mission.params, sampleRecovered: true } }),
    'Deliver the 47-A sample');
});

test('Load rewrites a saved filing title to the job the player is flying', () => {
  assert.equal(playerFacingObjectiveSummary('Mission: Contract 47-A: Mass Variance Sample'),
    'Mission: Recover the 47-A sample');
  assert.equal(slotObjectiveSummary({ objectiveSummary: 'Mission: Contract 47-A: Mass Variance Sample' }),
    'Mission: Recover the 47-A sample');
  assert.equal(playerFacingObjectiveSummary('Mission: Contract 47-A: Mass Variance Sample', { params: { sampleRecovered: true } }),
    'Mission: Deliver the 47-A sample');
  assert.equal(slotObjectiveSummary({ objectiveSummary: 'Mission: Contract 47-A: Mass Variance Sample', sampleRecovered: true }),
    'Mission: Deliver the 47-A sample');
  assert.equal(playerFacingObjectiveSummary('Mission: Deliver the 47-A sample'),
    'Mission: Deliver the 47-A sample');
  assert.equal(slotObjectiveSummary({ objectiveSummary: 'Mission: Deliver the 47-A sample' }),
    'Mission: Deliver the 47-A sample');
});

test('save cards and Load share the live-mission reader, not a second 47-A rule', () => {
  const save = readFileSync(new URL('../src/save/saveSystem.js', import.meta.url), 'utf8');
  assert.match(save, /import \{ playerFacingContractTitle \} from '\.\.\/ui\/sim\/missionRecap\.js'/);
  assert.doesNotMatch(save, /function playerFacingSaveMissionTitle/);
  assert.equal(playerFacingContractTitle({
    title: 'Contract 47-A: Mass Variance Sample',
    storyTag: 'campaign47a:b0:recovery',
    params: { contractId: '47-A', sampleRecovered: true },
  }), 'Deliver the 47-A sample');
});
