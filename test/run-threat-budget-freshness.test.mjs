import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDomainPathUpdate,
  configureDomainMirroring,
  createDomainDiffer,
  DOMAIN_CADENCE,
} from '../scripts/lib/simReadModel.mjs';

test('an active wave budget change reaches the domain facade on the next pass', () => {
  configureDomainMirroring({});
  assert.equal(DOMAIN_CADENCE['run.threatBudget'], 1);

  const state = {
    run: {
      kind: 'survival', ruleset: 'swarm', phase: 'active', wave: 1,
      threatBudget: 0, spawnedThreat: 0, resolvedThreat: 0, score: 0,
    },
  };
  const domains = new Map();
  const touched = new Set();
  const differ = createDomainDiffer();
  const accept = (tick) => {
    touched.clear();
    const reply = differ.diff(state, tick);
    for (const update of reply.updates) applyDomainPathUpdate(domains, update, touched);
    return reply;
  };

  accept(0);
  state.run = { ...state.run, threatBudget: 6 };
  const reply = accept(1);
  assert.ok(reply.updates.some((update) => update.segs.join('.') === 'run.threatBudget'));
  assert.equal(domains.get('run').threatBudget, 6);
});
