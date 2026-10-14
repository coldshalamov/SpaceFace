import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDomainPathUpdate,
  configureDomainMirroring,
  createDomainDiffer,
  DOMAIN_CADENCE,
} from '../scripts/lib/simReadModel.mjs';

test('resolved threat reaches the facade with the same reply as cleanup phase', () => {
  configureDomainMirroring({});
  const state = {
    run: {
      kind: 'survival', ruleset: 'swarm', phase: 'active', wave: 1,
      threatBudget: 15, spawnedThreat: 15, resolvedThreat: 14, score: 0,
    },
  };
  const domains = new Map();
  const touched = new Set();
  const differ = createDomainDiffer();
  let tick = 0;
  const accept = () => {
    touched.clear();
    const reply = differ.diff(state, tick++);
    for (const update of reply.updates) applyDomainPathUpdate(domains, update, touched);
    return reply;
  };

  accept();
  assert.equal(domains.get('run').phase, 'active');
  assert.equal(domains.get('run').resolvedThreat, 14);

  // Worker order is threat receipt first, then phase transition; both belong to this reply.
  state.run = { ...state.run, resolvedThreat: 15, phase: 'cleanup' };
  const clearReply = accept();
  const shipped = new Set(clearReply.updates.map(update => update.segs.join('.')));
  assert.ok(shipped.has('run.phase'), 'cleanup phase ships on the clear reply');
  assert.ok(shipped.has('run.resolvedThreat'), 'final resolved count ships on the clear reply');
  assert.equal(domains.get('run').phase, 'cleanup');
  assert.equal(domains.get('run').resolvedThreat, 15);
  assert.equal(DOMAIN_CADENCE['run.resolvedThreat'], 1);

  // Budget and admitted totals were already stable at clear; this targeted rule does not
  // broaden the hot cadence for unrelated run fields.
  assert.equal(shipped.has('run.threatBudget'), false);
  assert.equal(shipped.has('run.spawnedThreat'), false);
});
