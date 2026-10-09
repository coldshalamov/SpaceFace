import assert from 'node:assert/strict';
import test from 'node:test';
import { save } from '../src/save/saveSystem.js';
import { encodeSavePayloadFinal, SAVE_WORKER_SOURCE, SAVE_WRITE_MAX_BYTES } from '../src/save/saveWorker.js';

const input = {
  descriptor: { fmt: 'spaceface-save', version: 1 },
  data: { entities: { player: { type: 'ship' } }, name: '界'.repeat(SAVE_WRITE_MAX_BYTES / 3) },
};
const self = { addEventListener() {}, postMessage() {} };
const workerEncode = Function('self', SAVE_WORKER_SOURCE + '\nreturn encodeSavePayloadFinal;')(self);

for (const [name, encode] of [['module', encodeSavePayloadFinal], ['browser Blob worker', workerEncode]]) {
  test(`${name}: oversized Unicode saves are refused before creating an unreadable generation`, async () => {
    assert.ok(JSON.stringify(input).length < SAVE_WRITE_MAX_BYTES);
    const result = await encode(input);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'save_size_limit');
  });
}

test('manual save applies the same UTF-8 byte ceiling before touching either stored generation', () => {
  const previous = globalThis.localStorage;
  let writes = 0;
  const stored = new Map();
  globalThis.localStorage = {
    getItem(key) { return stored.get(key) || null; },
    setItem(key, value) { writes++; stored.set(key, value); },
    removeItem(key) { stored.delete(key); },
  };
  try {
    const result = save._writeSlot.call({ ...save }, 'unicode', { ...input.descriptor, data: input.data });
    assert.equal(result.reason, 'save_size_limit');
    assert.equal(result.ok, false);
    assert.equal(writes, 0);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});
