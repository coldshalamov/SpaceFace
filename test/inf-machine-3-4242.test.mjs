// Fingerprint: name / fault contact / sector_ashfall_reach / scanner
// Seed 4242. A broken directive and a pulled route must not scan as strangers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scannerMachineLabel, advanceMachineProtocol } from '../src/data/precursorMachines.js';
import { refreshMachineLabels } from '../src/systems/precursorMachines.js';

test('ashfall fault standings rename the machine contact', () => {
  const machine = { data: { machine: { kind: 'boundary_walker' }, name: '', scanLabel: '' } };
  const state = {
    meta: { seed: 4242 },
    simTime: 0,
    entityList: [machine],
    world: { currentSectorId: 'sector_ashfall_reach' },
  };
  const world = { state };
  advanceMachineProtocol(state, 'violated');
  refreshMachineLabels(world);
  const violation = scannerMachineLabel('violation');
  assert.equal(machine.data.scanLabel, violation);
  assert.equal(machine.data.name, violation);
  assert.notEqual(violation, scannerMachineLabel('unknown'));
  advanceMachineProtocol(state, 'revoked');
  refreshMachineLabels(world);
  const revoked = scannerMachineLabel('revoked');
  assert.equal(machine.data.name, revoked);
  assert.notEqual(revoked, violation);
  assert.notEqual(revoked, scannerMachineLabel('unknown'));
});
