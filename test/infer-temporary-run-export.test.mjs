import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { save } from '../src/save/saveSystem.js';

function host(kind) {
  const owner = Object.create(save);
  owner.state = createGameState(301);
  if (kind === 'racing') owner._ephemeralRacing = true;
  else owner.state.run = { kind, phase: 'active' };
  owner.bus = createBus();
  owner.errors = [];
  owner.bus.on('save:error', receipt => owner.errors.push(receipt));
  owner.serialized = 0;
  owner.serialize = () => { owner.serialized++; return { data: { arena: true } }; };
  owner._serializeDataFrozenAsync = async () => { owner.serialized++; return { arena: true }; };
  owner._attachProfileToExport = json => json;
  owner._cachedPreparedEnvelope = () => null;
  owner._prepareEnvelopeString = () => ({ ok: false, reason: 'no_save' });
  owner._prepareEnvelopeStringAsync = async () => ({ ok: false, reason: 'no_save' });
  return owner;
}

for (const kind of ['survival', 'lab', 'racing']) {
  test(`${kind} export cannot fabricate an Adventure save when the named slot is missing`, async () => {
    const owner = host(kind);
    assert.equal(owner.exportSlot('quick'), null);
    assert.equal(await owner.exportSlotAsync('quick'), null);
    assert.equal(owner.serialized, 0);
    assert.ok(owner.errors.every(receipt => receipt.reason === 'temporary_session'));
  });
}

test('an existing Adventure envelope can still be exported during a temporary run', async () => {
  const owner = host('survival');
  const raw = JSON.stringify({ data: { campaign: true } });
  const prior = globalThis.localStorage;
  globalThis.localStorage = { getItem: key => key === 'sf.save.quick' ? raw : null };
  owner._prepareEnvelopeString = () => ({ ok: true });
  owner._prepareEnvelopeStringAsync = async () => ({ ok: true });
  try {
    assert.equal(owner.exportSlot('quick'), raw);
    assert.equal(await owner.exportSlotAsync('quick'), raw);
    assert.equal(owner.serialized, 0);
    assert.deepEqual(owner.errors, []);
  } finally {
    if (prior === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = prior;
  }
});

test('an async live export refuses a transition into temporary flight during capture', async () => {
  const owner = host('adventure');
  owner._runEpoch = 1;
  owner._serializeDataFrozenAsync = async () => {
    owner._runEpoch++;
    owner.state.run = { kind: 'survival', phase: 'active' };
    return { arena: true };
  };
  assert.equal(await owner._finishExportJsonAsync(null, 'quick'), null);
  assert.equal(owner.errors.at(-1)?.reason, 'temporary_session');
});

test('an async live export refuses a superseded Adventure capture', async () => {
  const owner = host('adventure');
  owner._runEpoch = 1;
  owner._serializeDataFrozenAsync = async () => {
    owner._runEpoch++;
    return { mixedCampaign: true };
  };
  assert.equal(await owner._finishExportJsonAsync(null, 'quick'), null);
  assert.equal(owner.errors.at(-1)?.reason, 'superseded');
});

test('an async live export refuses a capture crossed by Continue restore', async () => {
  const owner = host('adventure');
  owner._restoreSequence = 1;
  owner._serializeDataFrozenAsync = async () => {
    owner._restoreSequence++;
    return { crossedRestore: true };
  };
  assert.equal(await owner._finishExportJsonAsync(null, 'quick'), null);
  assert.equal(owner.errors.at(-1)?.reason, 'superseded');
});
