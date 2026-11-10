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

test('the first admitted threat in an active wave bypasses the paced census slot', () => {
  configureDomainMirroring({});
  const state = {
    run: {
      kind: 'survival', ruleset: 'swarm', phase: 'wave_intro', wave: 1,
      threatBudget: 6, spawnedThreat: 0, resolvedThreat: 0, score: 0,
    },
  };
  const domains = new Map();
  const touched = new Set();
  const differ = createDomainDiffer();
  const accept = tick => {
    touched.clear();
    const reply = differ.diff(state, tick);
    for (const update of reply.updates) applyDomainPathUpdate(domains, update, touched);
    return reply;
  };

  accept(0);
  state.run = { ...state.run, phase: 'active', spawnedThreat: 6 };
  const opening = accept(1);
  assert.ok(opening.updates.some(update => update.segs.join('.') === 'run.spawnedThreat'));
  assert.equal(domains.get('run').spawnedThreat, 6);

  // This is a one-shot bootstrap edge: ordinary within-wave progress remains paced.
  state.run = { ...state.run, spawnedThreat: 9 };
  const progress = accept(2);
  assert.equal(progress.updates.some(update => update.segs.join('.') === 'run.spawnedThreat'), false);
  assert.equal(domains.get('run').spawnedThreat, 6);

  // A later wave gets the same initial-admission edge after its intro resets the guard.
  state.run = { ...state.run, phase: 'wave_intro', wave: 2, spawnedThreat: 0 };
  accept(3);
  state.run = { ...state.run, phase: 'active', spawnedThreat: 3 };
  const secondOpening = accept(4);
  assert.ok(secondOpening.updates.some(update => update.segs.join('.') === 'run.spawnedThreat'));
  assert.equal(domains.get('run').spawnedThreat, 3);
});
