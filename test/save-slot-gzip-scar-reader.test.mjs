import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { fnv1a } from '../src/save/checksum.js';
import { save } from '../src/save/saveSystem.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { handleSaveWorkerRequestAsync, SAVE_WORKER_SOURCE } from '../src/save/saveWorker.js';
import { buildSavePortrait } from '../src/ui/screens/saveLoad.js';

// Bounded, sanitized version of the public Ring export shape: gzip wrapper ->
// envelope.data.player.ownedShips[activeShipIndex].livingHull.scars. No capture dependency.
function ringExport({ gzip = true, scars = true, version = CURRENT_VERSION } = {}) {
  const marks = [
    ['port bow', 'crushing', 'debris'], ['port beam', 'hard', 'debris'],
    ['starboard bow', 'graze', 'craft'], ['port bow', 'crushing', 'craft'],
    ['bow', 'graze', 'craft'], ['port bow', 'hard', 'craft'],
  ].map(([facing, band, surface], index) => ({ id: `slam:${index + 1}:${facing}`,
    cause: 'slam', surface, band, facing, atT: index + 1, tick: index + 1, patchedAtT: null }));
  const livingHull = { schema: 'spaceface.livingHull.v1', killTally: 0, repairPatches: 0,
    heatScorch: 0, lastWashAtT: 0, washCount: 0, graffitiLine: null, graffitiAuthor: null, updatedAtT: 6,
    ...(scars ? { scars: marks, historyVersion: 2 } : {}) };
  const data = {
    player: { activeShipIndex: 0, ownedShips: [{ defId: 'ship_kestrel', fittings: [], livingHull }] },
    lossLedger: { impound: { livingHull: { ...livingHull, scars: [marks[0]] },
      scarSentence: 'It carries a heavy weapon mark on the starboard bow.' } },
  };
  const envelope = { fmt: 'spaceface-save', version,
    savedAt: '2026-11-04T00:00:00.000Z', playtimeS: 70, slot: '2', label: 'RING4242',
    checksum: fnv1a(JSON.stringify(data)), data };
  const plain = JSON.stringify(envelope);
  return gzip ? JSON.stringify({ fmt: 'spaceface-save-gz', gz: 1, version: envelope.version,
    savedAt: envelope.savedAt, checksum: envelope.checksum, payload: gzipSync(plain).toString('base64') }) : plain;
}

function assertSixScars(cardData) {
  assert.ok(cardData, 'compressed saved portrait data is available');
  const portrait = buildSavePortrait({ data: cardData });
  assert.equal(portrait.scars.count, 6, 'title portrait reads all active owned-hull scars, not impound or a clean fallback');
  assert.equal(portrait.scars.open, 6);
  assert.equal(portrait.scars.patched, 0);
  assert.match(portrait.scars.line, /port bow, crushing/);
  assert.match(portrait.scars.line, /bow, graze/);
  assert.match(portrait.scars.line, /and 3 more/);
  assert.doesNotMatch(portrait.scars.line, /Clean plates/);
}

function blobWorkerRequest(request) {
  return new Promise(resolve => {
    let receive;
    const self = { addEventListener(type, handler) { if (type === 'message') receive = handler; }, postMessage: resolve };
    Function('self', SAVE_WORKER_SOURCE)(self);
    receive({ data: request });
  });
}

for (const [label, request] of [['module worker', handleSaveWorkerRequestAsync], ['self-contained Blob worker', blobWorkerRequest]]) {
  test(`${label}: public gzip export yields the saved six-scar title portrait`, async () => {
    const raw = ringExport(), unchanged = raw;
    const reply = await request({ id: 1, type: 'peek_card_data', payload: { raw } });
    assert.equal(reply.result.ok, true, reply.result.reason);
    assertSixScars(reply.result.cardData);
    assert.equal(raw, unchanged, 'reading never rewrites public export bytes');
  });
  test(`${label}: legacy plain saves stay readable and malformed gzip is refused`, async () => {
    const plain = await request({ id: 2, type: 'peek_card_data', payload: { raw: ringExport({ gzip: false }) } });
    assert.equal(plain.result.ok, true); assertSixScars(plain.result.cardData);
    const clean = await request({ id: 3, type: 'peek_card_data', payload: { raw: ringExport({ gzip: false, scars: false, version: 1 }) } });
    assert.equal(buildSavePortrait({ data: clean.result.cardData }).scars.line, 'Clean plates');
    const bad = JSON.parse(ringExport()); bad.payload = 'invalid gzip';
    const malformed = await request({ id: 4, type: 'peek_card_data', payload: { raw: JSON.stringify(bad) } });
    assert.equal(malformed.result.ok, false);
    assert.equal(malformed.result.cardData, undefined);
  });
}

function workerAvailability(t, available) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  Object.defineProperty(globalThis, 'Worker', { configurable: true, writable: true,
    value: available ? function UnusedWorker() {} : undefined });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'Worker', descriptor);
    else delete globalThis.Worker;
  });
}

test('public save card API reads gzip without a worker and preserves old clean saves', async t => {
  workerAvailability(t, false);
  const owner = Object.create(save);
  assertSixScars(await owner.peekSaveCardData(ringExport()));
  const old = await owner.peekSaveCardData(ringExport({ gzip: false, scars: false, version: 1 }));
  assert.equal(buildSavePortrait({ data: old }).scars.line, 'Clean plates');
  const bad = JSON.parse(ringExport()); bad.payload = 'invalid gzip';
  assert.equal(await owner.peekSaveCardData(JSON.stringify(bad)), null);
});

test('public save card API uses the real worker projection and identical unavailable/failure fallback', async t => {
  workerAvailability(t, true);
  for (const request of [
    (type, payload, complete) => { handleSaveWorkerRequestAsync({ type, payload }).then(complete); return true; },
    () => false,
    (_type, _payload, _complete, fail) => { fail(); return true; },
    (_type, _payload, complete) => { complete({ result: { ok: false, reason: 'bad_format' } }); return true; },
  ]) {
    const owner = Object.create(save); owner._requestSaveWorker = request;
    assertSixScars(await owner.peekSaveCardData(ringExport()));
  }
});
