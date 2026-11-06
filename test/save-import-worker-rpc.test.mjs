import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { installRealmFs } from '../scripts/lib/simRealm.mjs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';

test('a compressed production save import settles before its worker reply is cloned', async () => {
  installRealmFs({ readFileSync, resolve });
  const lane = createSimHost();
  try {
    await lane.init({ profile: 'production', seed: 4242 });
    await lane.tick({ steps: 0, commands: [{ t: 'rpc', seq: 1, p: {
      id: 'boot', op: 'newGameBoot', payload: { opts: { seed: 4242 } },
    } }] });
    const envelope = lane.host.registry.get('save').serialize('import-regression');
    // Independent gzip fixture: the regression concerns the RPC, not the browser encoder.
    const json = JSON.stringify({ fmt: 'spaceface-save-gz', gz: 1, version: envelope.version,
      savedAt: envelope.savedAt, checksum: envelope.checksum,
      payload: gzipSync(JSON.stringify(envelope)).toString('base64') });
    const reply = await lane.tick({ steps: 0, commands: [{ t: 'rpc', seq: 2, p: {
      id: 'import', op: 'saveImport', payload: { json, slot: 'import-regression' },
    } }] });
    const ack = reply.rpcAcks.find(row => row.id === 'import');
    // Drain a broken legacy nested promise before tearing down the host on failure.
    if (ack?.result?.result?.then) await ack.result.result;
    const delivered = structuredClone(reply).rpcAcks.find(row => row.id === 'import');
    assert.equal(delivered.ok, true);
    assert.equal(delivered.result.ok, true, 'success names the settled canonical restore');
    assert.equal(lane.host.state.world.currentSectorId, envelope.data.world.currentSectorId);
    assert.ok(lane.host.state.entities.get(lane.host.state.playerId)?.alive);
  } finally { lane.shutdown(); }
});

test('a refused compressed import returns a cloneable failure and preserves the live player', async () => {
  const lane = createSimHost();
  try {
    await lane.init({ profile: 'production', seed: 4242 });
    await lane.tick({ steps: 0, commands: [{ t: 'rpc', seq: 1, p: {
      id: 'boot', op: 'newGameBoot', payload: { opts: { seed: 4242 } },
    } }] });
    const errors = [];
    lane.host.bus.on('save:error', payload => errors.push(payload));
    const playerId = lane.host.state.playerId;
    const json = JSON.stringify({ fmt: 'spaceface-save-gz', gz: 1, version: 22, payload: 'not-gzip' });
    const reply = await lane.tick({ steps: 0, commands: [{ t: 'rpc', seq: 2, p: {
      id: 'bad-import', op: 'saveImport', payload: { json, slot: 'bad-import' },
    } }] });
    const ack = reply.rpcAcks.find(row => row.id === 'bad-import');
    if (ack?.result?.result?.then) await ack.result.result;
    const delivered = structuredClone(reply).rpcAcks.find(row => row.id === 'bad-import');
    assert.equal(delivered.ok, true, 'the RPC transport itself completes');
    assert.equal(delivered.result.ok, false, 'the owner refuses the invalid envelope');
    assert.equal(lane.host.state.playerId, playerId);
    assert.ok(errors.some(row => row.slot === 'bad-import'));
  } finally { lane.shutdown(); }
});
