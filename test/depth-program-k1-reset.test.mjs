import test from 'node:test';
import assert from 'node:assert/strict';

import { resetFreshRunSystems } from '../src/core/runReset.js';

test('fresh-run reset invokes K1 state owners exactly once through the real reset list', () => {
  const calls = [];
  const systems = new Map([
    ['world', { newGame() { calls.push('world'); } }],
    ['lossLedger', { newGame() { calls.push('lossLedger'); } }],
    ['factionPresence', { newGame() { calls.push('factionPresence'); } }],
  ]);
  resetFreshRunSystems({ get(name) { return systems.get(name) || null; } });
  assert.equal(calls.filter((name) => name === 'lossLedger').length, 1);
  assert.equal(calls.filter((name) => name === 'factionPresence').length, 1);
  assert.ok(calls.indexOf('lossLedger') < calls.indexOf('factionPresence'));
});
