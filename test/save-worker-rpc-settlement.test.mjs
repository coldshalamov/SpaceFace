import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { installRealmFs, stageLaneStorage } from '../scripts/lib/simRealm.mjs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createLaneSystemFacade } from '../src/runtime/laneSystemFacades.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { installSimCommandSink, uninstallSimCommandSink, laneCommandSink } from '../src/core/simLaneCommands.js';

installRealmFs({ readFileSync, resolve });

async function boot() {
  const lane = createSimHost();
  await lane.init({ profile: 'production', seed: 4242 });
  await lane.tick({ steps: 0, commands: [{ t: 'rpc', seq: 1, p: {
    id: 'boot', op: 'newGameBoot', payload: { opts: { seed: 4242 } },
  } }] });
  return lane;
}

function slotFixture(lane, slot = 'quick') {
  const envelope = lane.host.registry.get('save').serialize(slot);
  const raw = JSON.stringify({ fmt: 'spaceface-save-gz', gz: 1, version: envelope.version,
    savedAt: envelope.savedAt, checksum: envelope.checksum,
    payload: gzipSync(JSON.stringify(envelope)).toString('base64') });
  // Owned staged worker storage, not a player's actual slot/profile. The index metadata and
  // compressed bytes both describe the real production owner's serialized envelope.
  stageLaneStorage({ [`sf.save.${slot}`]: raw, 'sf.save.index': JSON.stringify({ [slot]: {
    savedAt: envelope.savedAt, lastSavedAt: envelope.savedAt, version: envelope.version,
  } }) });
  return envelope;
}

function mainFacade(lane) {
  let seq = 10;
  const bus = createBus(), replies = [];
  const sink = async (descriptor) => {
    const previous = laneCommandSink();
    uninstallSimCommandSink(); // Separate worker realm semantics in this single-process test.
    try {
      const command = structuredClone({ t: 'rpc', seq: ++seq, p: {
        id: descriptor.id, op: descriptor.op, payload: descriptor.args,
      } });
      const reply = await lane.tick({ steps: 0, commands: [command] });
      const ack = reply.rpcAcks.find((row) => row.id === descriptor.id);
      // Finish a broken pre-fix nested restore before teardown; its Promise still cannot clone.
      if (ack?.result?.result?.then) await ack.result.result;
      const delivered = structuredClone(reply);
      replies.push(delivered);
      return delivered.rpcAcks.find((row) => row.id === descriptor.id);
    } finally { if (previous) installSimCommandSink(previous); }
  };
  installSimCommandSink(sink);
  return { save: createLaneSystemFacade({ state: createGameState(4242), bus })('save'), replies,
    release() { uninstallSimCommandSink(); } };
}

test('compressed named Load settles before the real worker reply is structured-cloned', async () => {
  const lane = await boot();
  try {
    const envelope = slotFixture(lane);
    const oldPlayer = lane.host.state.entities.get(lane.host.state.playerId);
    const reply = await lane.tick({ steps: 0, commands: [structuredClone({ t: 'rpc', seq: 2, p: {
      id: 'load', op: 'saveLoad', payload: { slot: 'quick' },
    } })] });
    const ack = reply.rpcAcks.find((row) => row.id === 'load');
    if (ack?.result?.result?.then) await ack.result.result;
    const delivered = structuredClone(reply).rpcAcks.find((row) => row.id === 'load');
    assert.equal(delivered.ok, true);
    assert.equal(delivered.result.ok, true);
    assert.equal(delivered.result.result, true);
    assert.equal(lane.host.state.world.currentSectorId, envelope.data.world.currentSectorId);
    assert.notEqual(lane.host.state.entities.get(lane.host.state.playerId), oldPlayer);
    assert.equal(lane.host.state.entities.get(lane.host.state.playerId).alive, true);
  } finally { lane.shutdown(); }
});

test('main save facade returns the settled owner refusal, not a truthy transport envelope', async () => {
  const lane = await boot();
  const main = mainFacade(lane);
  try {
    assert.equal(await main.save.load('missing-rpc-slot'), false);
    const ack = main.replies.at(-1).rpcAcks.at(-1);
    assert.equal(ack.ok, true, 'transport completion differs from owner acceptance');
    assert.equal(ack.result.ok, false);
    assert.equal(ack.result.result, false);
    assert.equal(lane.host.state.entities.get(lane.host.state.playerId)?.alive, true);
  } finally { main.release(); lane.shutdown(); }
});

test('latest Continue uses the same real gzip owner through the cloned command/reply and main facade', async () => {
  const lane = await boot();
  const envelope = slotFixture(lane);
  const main = mainFacade(lane);
  try {
    assert.equal(await main.save.load('latest'), true);
    assert.equal(main.replies.at(-1).rpcAcks.at(-1).result.result, true);
    assert.equal(lane.host.state.world.currentSectorId, envelope.data.world.currentSectorId);
    assert.equal(lane.host.state.entities.get(lane.host.state.playerId)?.alive, true);
  } finally { main.release(); lane.shutdown(); }
});

test('FileReader import callback preserves the settled owner verdict and legacy/rejected acknowledgements', async () => {
  const originalReader = globalThis.FileReader;
  const originalSink = laneCommandSink();
  const sent = [];
  globalThis.FileReader = class {
    readAsText(file) {
      this.result = file.text;
      queueMicrotask(() => this.onload());
    }
  };
  const save = createLaneSystemFacade({ state: createGameState(4242), bus: createBus() })('save');
  try {
    for (const [owner, expected] of [
      [{ ok: true, result: { ok: false, result: false } }, false],
      [{ ok: true, result: { ok: true, result: true } }, true],
      [{ ok: true, result: false }, false],
      [{ ok: true, result: true }, true],
      [{ ok: false }, false],
      [{ ok: true }, true],
      [false, false],
      [true, true],
    ]) {
      installSimCommandSink((descriptor) => {
        sent.push(structuredClone(descriptor));
        return Promise.resolve(structuredClone(owner));
      });
      const result = await new Promise((resolve) => save.importFile({ text: '{"fixture":"callback"}' }, resolve));
      assert.equal(result, expected, `callback for ${JSON.stringify(owner)}`);
      assert.equal(sent.at(-1).op, 'saveImport');
      assert.deepEqual(sent.at(-1).args, { json: '{"fixture":"callback"}', slot: 'quick' });
    }
    installSimCommandSink(() => Promise.reject(new Error('worker unavailable')));
    assert.equal(await new Promise((resolve) => save.importFile({ text: '{}' }, resolve)), false);
  } finally {
    if (originalReader === undefined) delete globalThis.FileReader;
    else globalThis.FileReader = originalReader;
    uninstallSimCommandSink();
    if (originalSink) installSimCommandSink(originalSink);
  }
});
