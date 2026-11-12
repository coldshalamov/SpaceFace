// Fingerprint: preserve / nursery recorder / sector_charon_expanse / protocol
// Seed 4242. The cinder nursery black box is a sighting, not a pardon.
import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceMachineProtocol } from '../src/data/precursorMachines.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { handleAlienEcologyEvent } from '../src/systems/alienEcology.js';

function makeState() {
  return {
    meta: { seed: 4242 },
    simTime: 3,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    player: { cargo: { items: {} } },
    world: { currentSectorId: 'sector_charon_expanse' },
    story: {},
  };
}

test('recovering the charon nursery recorder does not erase machine standing', () => {
  const faulted = makeState();
  assert.equal(advanceMachineProtocol(faulted, 'violated'), 'violation');
  assert.equal(advanceMachineProtocol(faulted, 'seen'), 'violation');
  handleAlienEcologyEvent(
    { state: faulted, bus: { emit() {} } },
    'alienEcology:blackBoxRecovered',
    { siteId: 'cinder_nursery' },
  );
  const ae = ensureAlienEcologyState(faulted);
  assert.equal(ae.machineProtocol, 'violation');
  assert.equal(ae.taxonomy.filamentousContamination, true);
  assert.equal(ae.sites.cinder_nursery.objectiveDone, true);

  const fresh = makeState();
  handleAlienEcologyEvent(
    { state: fresh, bus: { emit() {} } },
    'alienEcology:blackBoxRecovered',
    { siteId: 'cinder_nursery' },
  );
  assert.equal(ensureAlienEcologyState(fresh).machineProtocol, 'observed');
});
