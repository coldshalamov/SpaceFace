import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { fnv1a } from '../src/save/checksum.js';
import { save } from '../src/save/saveSystem.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import {
  cardDataFromEnvelope, cardEnvFromEnvelope, handleSaveWorkerRequestAsync, SAVE_WORKER_SOURCE,
} from '../src/save/saveWorker.js';
import { buildSavePortrait } from '../src/ui/screens/saveLoad.js';

// A stored war save: the factions system serializes { factions: repBag, conflicts: pairBag }
// (src/systems/factions.js serialize()). The Save/Load card's lazy fill reads the slot through
// the card projection, not the full envelope — so the projection must keep what STANDING reads.
const PAIR = 'faction_dmc:faction_mts';
const EMPTY = 'No house stands with you';

function warData() {
  return {
    player: { activeShipIndex: 0, credits: 900, ownedShips: [{ defId: 'ship_kestrel', fittings: [] }] },
    story: { titles: { byId: {} } },
    missions: {},
    aceMemory: {},
    meta: {},
    world: { currentSectorId: 'sector_tethys', sectors: {} },
    entities: { player: { type: 'ship', x: 0, y: 0 } },
    factions: {
      factions: {
        faction_dmc: { rep: 220, history: [{ t: 1, delta: 40, why: 'convoy' }], notes: 'x'.repeat(256) },
        faction_mts: { rep: 20, history: [] },
      },
      conflicts: {
        [PAIR]: { tension: 80, state: 'war', playerLean: 0.2, momentum: 30 },
        'faction_scn:faction_vxr': { tension: 5, state: 'cold', playerLean: 0, momentum: 0 },
      },
    },
  };
}

function warSave({ gzip = false } = {}) {
  const data = warData();
  const envelope = { fmt: 'spaceface-save', version: CURRENT_VERSION, savedAt: '2026-11-10T00:00:00.000Z',
    playtimeS: 600, slot: '1', label: 'WAR', checksum: fnv1a(JSON.stringify(data)), data };
  const plain = JSON.stringify(envelope);
  return gzip ? JSON.stringify({ fmt: 'spaceface-save-gz', gz: 1, version: envelope.version,
    savedAt: envelope.savedAt, checksum: envelope.checksum, payload: gzipSync(plain).toString('base64') }) : plain;
}

// What the live run / full envelope reads — the card must read the same line.
const FULL_LINE = buildSavePortrait({ data: warData() }).standing.line;

function assertWarStanding(cardData, where) {
  assert.ok(cardData, `${where}: card data exists`);
  const standing = buildSavePortrait({ data: cardData }).standing;
  assert.notEqual(standing.line, EMPTY, `${where}: a war save's card must not read "${EMPTY}"`);
  assert.equal(standing.line, FULL_LINE, `${where}: card STANDING matches the full save's reading`);
  assert.match(standing.line, /Drift · Foreman/);
  assert.match(standing.line, /front at Tethys Junction still burns/);
  assert.equal(standing.factionId, 'faction_dmc');
  assert.equal(standing.warPair, PAIR);
  // Only what STANDING reads rides the card — no faction history/notes or conflict tension.
  assert.deepEqual(cardData.factions, {
    factions: { faction_dmc: { rep: 220 }, faction_mts: { rep: 20 } },
    conflicts: { [PAIR]: { state: 'war' }, 'faction_scn:faction_vxr': { state: 'cold' } },
  }, `${where}: the card keeps rep/state only`);
}

test('sanity: the full war save reads its house and its front', () => {
  assert.notEqual(FULL_LINE, EMPTY);
  assert.match(FULL_LINE, /Drift and Meridian front at Tethys Junction still burns/);
});

test('cardDataFromEnvelope keeps the war save STANDING (plain envelope and bare data)', () => {
  assertWarStanding(cardDataFromEnvelope(JSON.parse(warSave())), 'envelope');
  assertWarStanding(cardDataFromEnvelope(warData()), 'bare data');
});

test('a legacy flat rep bag still projects and reads', () => {
  const data = warData(); data.factions = { faction_scn: { rep: -420, history: [1, 2, 3] } };
  const card = cardDataFromEnvelope({ data });
  assert.deepEqual(card.factions, { faction_scn: { rep: -420 } });
  assert.equal(buildSavePortrait({ data: card }).standing.line, buildSavePortrait({ data }).standing.line);
  const none = cardDataFromEnvelope({ data: { ...warData(), factions: undefined } });
  assert.equal(buildSavePortrait({ data: none }).standing.line, EMPTY, 'a save with no houses stays honest');
});

function blobWorkerRequest(request) {
  return new Promise(resolve => {
    let receive;
    const self = { addEventListener(type, handler) { if (type === 'message') receive = handler; }, postMessage: resolve };
    Function('self', SAVE_WORKER_SOURCE)(self);
    receive({ data: request });
  });
}

for (const [label, request] of [['module worker', handleSaveWorkerRequestAsync], ['self-contained Blob worker', blobWorkerRequest]]) {
  test(`${label}: peek_card_data keeps a war save STANDING (plain + gzip)`, async () => {
    for (const gzip of [false, true]) {
      const reply = await request({ id: 1, type: 'peek_card_data', payload: { raw: warSave({ gzip }) } });
      assert.equal(reply.result.ok, true, reply.result.reason);
      assertWarStanding(reply.result.cardData, `${label} peek gzip=${gzip}`);
    }
  });
  test(`${label}: slot-index cardEnv → cardDatas projection keeps a war save STANDING`, async () => {
    // The module lane's meta verdict is the plain-text twin; the Blob worker also decodes gzip.
    for (const gzip of label === 'module worker' ? [false] : [false, true]) {
      const reply = await request({ id: 2, type: 'restore_prepare_meta',
        payload: { raw: warSave({ gzip }), currentVersion: CURRENT_VERSION } });
      assert.equal(reply.result.ok, true, reply.result.reason);
      assert.ok(reply.result.cardEnv, 'the meta verdict carries its card projection');
      // saveSystem's slot-index consult stores exactly cardDataFromEnvelope(v.cardEnv) for slotCardData.
      assertWarStanding(cardDataFromEnvelope(reply.result.cardEnv), `${label} cardDatas gzip=${gzip}`);
    }
  });
}

test('host cardEnvFromEnvelope carries the same slim standing', () => {
  assertWarStanding(cardDataFromEnvelope(cardEnvFromEnvelope(JSON.parse(warSave()))), 'host cardEnv');
});

test('public peekSaveCardData (no worker) keeps a war save STANDING', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  Object.defineProperty(globalThis, 'Worker', { configurable: true, writable: true, value: undefined });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'Worker', descriptor);
    else delete globalThis.Worker;
  });
  const owner = Object.create(save);
  assertWarStanding(await owner.peekSaveCardData(warSave({ gzip: true })), 'peekSaveCardData');
});
