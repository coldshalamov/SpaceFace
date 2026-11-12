import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { save, SAVE_IMPORT_MAX_BYTES } from '../src/save/saveSystem.js';
import { gzipSync } from 'node:zlib';
import { fnv1a } from '../src/save/checksum.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { decodeSaveEnvelopeText, gzipEnvelopeJson, restorePrepareSaveJsonAsync } from '../src/save/saveWorker.js';

const station = JSON.parse(fs.readFileSync(new URL('./fixtures/deep-state-ladder/artifacts/first-station.spaceface-save.json', import.meta.url), 'utf8'));
function envelope(slot = 'quick', credits = 5000) {
  const env = structuredClone(station);
  env.version = CURRENT_VERSION;
  env.slot = slot;
  env.data.player.credits = credits;
  env.checksum = fnv1a(JSON.stringify(env.data));
  return env;
}
function quotaStorage(limit) {
  const values = new Map(), removed = [];
  return {
    values, removed,
    get length() { return values.size; },
    key(i) { return [...values.keys()][i] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) {
      value = String(value);
      const bytes = [...values].reduce((sum, [k, v]) => sum + (k === key ? 0 : 2 * (k.length + v.length)), 0)
        + 2 * (key.length + value.length);
      if (bytes > limit) throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
      values.set(key, value);
    },
    removeItem(key) { removed.push(key); values.delete(key); },
  };
}
function harness(t, storage) {
  const prior = globalThis.localStorage;
  globalThis.localStorage = storage;
  t.after(() => { if (prior === undefined) delete globalThis.localStorage; else globalThis.localStorage = prior; });
  return { ...save, state: { world: {}, meta: {}, player: {}, save: {}, mode: 'flight', simTime: 1, tick: 60 },
    bus: { emit() {} }, _queueSharedStoreMirror() {} };
}

test('strict quota: exit autosave fits beside several large primaries without losing their data', async t => {
  const storage = quotaStorage(5 * 1024 * 1024);
  const expected = new Map();
  for (const slot of ['quick', '1', '2', '3', '4']) {
    const prior = envelope(slot);
    if (slot === 'quick') prior.version = station.version;
    const raw = JSON.stringify(prior);
    storage.setItem(`sf.save.${slot}`, raw);
    expected.set(`sf.save.${slot}`, raw);
  }
  const sys = harness(t, storage);
  const next = envelope('auto', 6123);
  const result = sys._writeSlot('auto', next);
  assert.equal(result.ok, true, JSON.stringify(result));
  for (const [key, raw] of expected) {
    const decoded = await decodeSaveEnvelopeText(storage.getItem(key));
    assert.equal(decoded.ok, true);
    assert.ok(decoded.text === raw, `${key} retains its exact envelope`);
  }
  assert.equal((await restorePrepareSaveJsonAsync(storage.getItem('sf.save.auto'), CURRENT_VERSION)).ok, true);
  assert.equal(storage.removed.some(key => key.startsWith('sf.save.') && key !== 'sf.save.index'), false);
});

test('quota compaction skips damaged primaries and rolls back a truncated replacement', async t => {
  const storage = quotaStorage(5 * 1024 * 1024), sys = harness(t, storage);
  const prior = new Map();
  for (const slot of ['quick', '1', '2', '3', '4']) {
    const env = envelope(slot);
    if (slot === 'quick') env.data.player.credits = -1; // keep the old checksum: never compact it
    const raw = JSON.stringify(env);
    storage.setItem(`sf.save.${slot}`, raw); prior.set(`sf.save.${slot}`, raw);
  }
  const setItem = storage.setItem;
  let truncated = false;
  storage.setItem = (key, value) => {
    if (!truncated && key === 'sf.save.1' && value.includes('spaceface-save-gz')) {
      truncated = true; value = value.slice(0, 100);
    }
    setItem(key, value);
  };
  assert.equal(sys._writeSlot('auto', envelope('auto', 1234)).ok, true);
  assert.equal(truncated, true);
  assert.equal(storage.getItem('sf.save.quick'), prior.get('sf.save.quick'), 'damaged primary remains byte-for-byte untouched');
  assert.equal(storage.getItem('sf.save.1'), prior.get('sf.save.1'), 'a truncated compaction restores its exact prior primary');
  for (const [key, raw] of prior) assert.equal((await decodeSaveEnvelopeText(storage.getItem(key))).text, raw);
});

test('large synchronous overwrite keeps a loadable compressed previous generation', async t => {
  const storage = quotaStorage(3 * 1024 * 1024), sys = harness(t, storage);
  storage.setItem('sf.save.quick', await gzipEnvelopeJson(JSON.stringify(envelope('quick', 5000))));
  const old = storage.getItem('sf.save.quick');
  assert.equal(sys._writeSlot('quick', envelope('quick', 7000)).ok, true);
  assert.ok(storage.getItem('sf.recovery.quick') === old, 'the valid compressed primary becomes the exact recovery generation');
  for (const key of ['sf.save.quick', 'sf.recovery.quick']) {
    assert.equal((await restorePrepareSaveJsonAsync(storage.getItem(key), CURRENT_VERSION)).ok, true);
  }
});

test('a corrupt compressed primary cannot replace a valid recovery generation', async t => {
  const storage = quotaStorage(3 * 1024 * 1024), sys = harness(t, storage);
  const old = await gzipEnvelopeJson(JSON.stringify(envelope('quick', 5000)));
  const corrupt = envelope('quick', 7000);
  corrupt.data.player.credits = 1; // deliberately leave the old checksum attached
  storage.setItem('sf.recovery.quick', old);
  storage.setItem('sf.save.quick', await gzipEnvelopeJson(JSON.stringify(corrupt)));
  assert.equal(sys._writeSlot('quick', envelope('quick', 9000)).ok, true);
  assert.ok(storage.getItem('sf.recovery.quick') === old, 'last good recovery survives an invalid compressed primary');
  storage.setItem('sf.save.quick', await gzipEnvelopeJson(JSON.stringify(corrupt)));
  const setItem = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === 'sf.save.quick') throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
    setItem(key, value);
  };
  const error = console.error; console.error = () => {};
  try { assert.equal(sys._writeSlot('quick', envelope('quick', 9500)).reason, 'quota'); }
  finally { console.error = error; }
  assert.equal(storage.getItem('sf.recovery.quick'), old, 'failed incoming writes must neither evict nor replace the surviving good recovery');
});

test('write-only gzip validation enforces CRC, preflight and the inflate ceiling even with a forged trailer', t => {
  const sys = harness(t, quotaStorage(3 * 1024 * 1024));
  const wrap = bytes => JSON.stringify({ fmt:'spaceface-save-gz', gz:1, version:CURRENT_VERSION, payload:bytes.toString('base64') });
  const valid = gzipSync(JSON.stringify(envelope()));
  assert.equal(sys._prepareEnvelopeString(wrap(valid)).reason, 'compressed_envelope', 'normal synchronous reads never start inflating');
  assert.equal(sys._prepareEnvelopeForWriter(wrap(valid)).ok, true);
  const corrupt = Buffer.from(valid); corrupt[corrupt.length - 8] ^= 1;
  assert.equal(sys._prepareEnvelopeForWriter(wrap(corrupt)).reason, 'gz_decode_failed', 'CRC damage cannot become a recovery generation');
  const tailed = Buffer.concat([valid.subarray(0, -8), Buffer.from([0, 0, 0, 0]), valid.subarray(-8)]);
  assert.equal(sys._prepareEnvelopeForWriter(wrap(tailed)).reason, 'gz_decode_failed', 'ignored deflate tails cannot masquerade as a readable gzip');
  assert.equal(sys._prepareEnvelopeForWriter(wrap(Buffer.concat([valid, valid]))).reason, 'gz_decode_failed', 'concatenated generations never rotate as one valid envelope');
  const oversized = gzipSync(JSON.stringify({ fmt:'spaceface-save',version:CURRENT_VERSION,data:{ padding:'x'.repeat(SAVE_IMPORT_MAX_BYTES) } }));
  oversized.writeUInt32LE(1, oversized.length - 4);
  assert.equal(sys._prepareEnvelopeForWriter(wrap(oversized)).reason, 'import_too_large', 'actual output is bounded independently of the forged ISIZE');
  const deep = envelope(); let cursor = deep;
  for (let i = 0; i < 70; i++) { cursor.branch = {}; cursor = cursor.branch; }
  assert.equal(sys._prepareEnvelopeForWriter(wrap(gzipSync(JSON.stringify(deep)))).reason, 'import_depth_limit');
});

test('paired exit events save once, a resumed flight saves again, and destroy removes listeners', t => {
  const prior = globalThis.window, host = new EventTarget();
  globalThis.window = host;
  t.after(() => { if (prior === undefined) delete globalThis.window; else globalThis.window = prior; });
  const sys = harness(t, quotaStorage(1024));
  let writes = 0;
  sys.save = () => { writes++; return true; };
  sys._installUnloadExitSave();
  sys._installUnloadExitSave();
  host.dispatchEvent(new Event('beforeunload'));
  host.dispatchEvent(new Event('pagehide'));
  assert.equal(writes, 1);
  host.dispatchEvent(new Event('pageshow'));
  host.dispatchEvent(new Event('beforeunload'));
  assert.equal(writes, 2);
  sys.destroy();
  host.dispatchEvent(new Event('focus'));
  host.dispatchEvent(new Event('pagehide'));
  assert.equal(writes, 2);
});
