import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { captureHeapSnapshot } from '../scripts/lib/releaseSoakProbe.mjs';

const CHUNK_EVENT = 'HeapProfiler.addHeapSnapshotChunk';

class FakeCdp extends EventEmitter {
  constructor({ chunks = [], takeError = null } = {}) {
    super();
    this.chunks = chunks;
    this.takeError = takeError;
    this.commands = [];
    this.detached = false;
  }

  async send(method) {
    this.commands.push(method);
    if (method !== 'HeapProfiler.takeHeapSnapshot') return {};
    for (const chunk of this.chunks) this.emit(CHUNK_EVENT, { chunk });
    if (this.takeError) throw this.takeError;
    return {};
  }

  async detach() {
    this.detached = true;
  }
}

function fakePage(cdp) {
  return { context: () => ({ newCDPSession: async () => cdp }) };
}

async function withTempDir(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'spaceface-heap-snapshot-'));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('heap snapshot capture writes each CDP chunk incrementally with byte fidelity', async () => {
  await withTempDir(async (dir) => {
    // Split a supplementary Unicode code point across events as well as the JSON text. The
    // writer must preserve the same UTF-8 bytes as one joined snapshot without retaining it.
    const chunks = ['{"nodes":["alpha ', '\uD83D', '\uDE80', ' omega"]}'];
    const cdp = new FakeCdp({ chunks });
    const filePath = path.join(dir, 'heap.heapsnapshot');

    await captureHeapSnapshot(fakePage(cdp), filePath);

    assert.deepEqual(await readFile(filePath), Buffer.from(chunks.join(''), 'utf8'));
    assert.deepEqual(cdp.commands, ['HeapProfiler.enable', 'HeapProfiler.takeHeapSnapshot']);
    assert.equal(cdp.listenerCount(CHUNK_EVENT), 0, 'chunk listener is removed after success');
    assert.equal(cdp.detached, true, 'CDP session is detached after success');
  });
});

test('rejected CDP capture surfaces the requested error and cleans partial output/session', async () => {
  await withTempDir(async (dir) => {
    const cdp = new FakeCdp({
      chunks: ['{"partial":true}'],
      takeError: new Error('HeapProfiler.takeHeapSnapshot failed'),
    });
    const filePath = path.join(dir, 'heap.heapsnapshot');

    await assert.rejects(
      captureHeapSnapshot(fakePage(cdp), filePath),
      (error) => error instanceof Error
        && error.message.includes('Heap snapshot capture failed')
        && error.message.includes('HeapProfiler.takeHeapSnapshot failed'),
    );
    assert.equal(existsSync(filePath), false, 'partial snapshot is removed after rejection');
    assert.equal(cdp.listenerCount(CHUNK_EVENT), 0, 'chunk listener is removed after rejection');
    assert.equal(cdp.detached, true, 'CDP session is detached after rejection');
  });
});

test('a successful CDP command with zero chunks fails instead of accepting an empty snapshot', async () => {
  await withTempDir(async (dir) => {
    const cdp = new FakeCdp();
    const filePath = path.join(dir, 'heap.heapsnapshot');

    await assert.rejects(
      captureHeapSnapshot(fakePage(cdp), filePath),
      (error) => error instanceof Error
        && error.message.includes('returned no snapshot bytes')
        && error.message.includes('chunks=0'),
    );
    assert.equal(existsSync(filePath), false, 'empty snapshot is removed after zero-byte capture');
    assert.equal(cdp.listenerCount(CHUNK_EVENT), 0, 'chunk listener is removed after zero-byte capture');
    assert.equal(cdp.detached, true, 'CDP session is detached after zero-byte capture');
  });
});

test('output open failure still detaches the CDP session and reports the IO error', async () => {
  await withTempDir(async (dir) => {
    const cdp = new FakeCdp();
    const filePath = path.join(dir, 'missing-parent', 'heap.heapsnapshot');

    await assert.rejects(
      captureHeapSnapshot(fakePage(cdp), filePath),
      (error) => error instanceof Error
        && error.message.includes('Heap snapshot capture failed')
        && /ENOENT|no such file/i.test(error.message),
    );
    assert.equal(existsSync(filePath), false, 'failed output path remains absent');
    assert.equal(cdp.listenerCount(CHUNK_EVENT), 0, 'no chunk listener remains after IO failure');
    assert.equal(cdp.detached, true, 'CDP session is detached after IO failure');
  });
});

test('output open failure preserves a pre-existing target that this capture never opened', async () => {
  await withTempDir(async (dir) => {
    const cdp = new FakeCdp();
    const filePath = path.join(dir, 'heap.heapsnapshot');
    await mkdir(filePath);

    await assert.rejects(
      captureHeapSnapshot(fakePage(cdp), filePath),
      (error) => error instanceof Error
        && error.message.includes('Heap snapshot capture failed')
        && /EISDIR|EPERM|EACCES|illegal operation/i.test(error.message),
    );
    assert.equal((await stat(filePath)).isDirectory(), true, 'pre-existing target remains intact');
    assert.equal(cdp.listenerCount(CHUNK_EVENT), 0, 'no chunk listener remains after open failure');
    assert.equal(cdp.detached, true, 'CDP session is detached after open failure');
  });
});
