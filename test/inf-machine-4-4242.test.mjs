// Fingerprint: classify / excepted machine / sector_veil_nebula / transit
// Seed 4242. An exception grant must not keep the witnessed contact name.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scannerMachineLabel, advanceMachineProtocol } from '../src/data/precursorMachines.js';
import { refreshMachineLabels } from '../src/systems/precursorMachines.js';

test('a veil exception renames the machine as route authority on file', () => {
  const machine = { data: { machine: { kind: 'appeals_clerk' }, name: '', scanLabel: '' } };
  const state = {
    meta: { seed: 4242 },
    simTime: 4,
    entityList: [machine],
    world: { currentSectorId: 'sector_veil_nebula' },
  };
  advanceMachineProtocol(state, 'witnessed');
  const witnessed = scannerMachineLabel('witnessed');
  advanceMachineProtocol(state, 'excepted');
  refreshMachineLabels({ state });
  const exception = scannerMachineLabel('exception');
  assert.equal(machine.data.scanLabel, exception);
  assert.equal(machine.data.name, exception);
  assert.notEqual(exception, witnessed);
  assert.match(exception, /EXCEPTION/);
});
