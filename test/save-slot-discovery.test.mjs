import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

import { save, selectLatestOccupiedSlot } from '../src/save/saveSystem.js';
import { fnv1a } from '../src/save/checksum.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { mainMenuScreen } from '../src/ui/screens/mainMenu.js';
import { ACHIEVEMENTS_FMT, ACHIEVEMENTS_STORAGE_KEY } from '../src/systems/achievements.js';
import { CRUCIBLE_META_STORAGE_KEY } from '../src/systems/survivalRecords.js';

const LEGACY = readFileSync(new URL('./fixtures/fb-save-v01.json', import.meta.url), 'utf8');
const PROFILE = JSON.stringify({ fmt: ACHIEVEMENTS_FMT, schemaVersion: 1, unlocked: {} });
const WHEN = '2026-10-15T10:00:00.000Z';

function currentEnvelope() {
  const prepared = save._prepareEnvelopeString(LEGACY);
  assert.equal(prepared.ok, true, 'the existing v1 fixture is playable through real migrations');
  return JSON.stringify({ fmt: 'spaceface-save', version: CURRENT_VERSION,
    savedAt: WHEN, playtimeS: 3600, data: prepared.data,
    checksum: fnv1a(JSON.stringify(prepared.data)) });
}

function compressedEnvelope() {
  const raw = currentEnvelope();
  return JSON.stringify({ fmt: 'spaceface-save-gz', gz: 1, version: CURRENT_VERSION,
    savedAt: WHEN, payload: gzipSync(raw).toString('base64') });
}

function storageFor(t, entries = {}) {
  const before = globalThis.localStorage;
  const values = new Map(Object.entries(entries));
  const storage = {
    get length() { return values.size; },
    key: i => [...values.keys()][i] ?? null,
    getItem: key => values.get(String(key)) ?? null,
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: key => values.delete(String(key)),
  };
  globalThis.localStorage = storage;
  t.after(() => {
    if (before === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = before;
  });
  return storage;
}

function publicContinue(facade = { name: 'save', slots: [] }) {
  const events = [];
  const screen = Object.create(mainMenuScreen);
  screen._latestSave = undefined;
  screen._showContinueFade = () => { events.push({ name: 'fade' }); };
  screen._render = () => {};
  screen._pick({ registry: { get: name => name === 'save' ? facade : null },
    bus: { emit: (name, payload) => events.push({ name, payload }) } }, 'continue');
  return events;
}

function saveOwner() {
  const owner = Object.create(save);
  owner._slotIndexCache = null;
  owner._restoreFrameYield = async () => {};
  owner.state = { ui: {}, mode: 'menu', save: {} };
  owner.events = [];
  owner.restores = [];
  owner.bus = { emit: (name, payload) => owner.events.push({ name, payload }) };
  owner._hasPlayerEntity = () => false;
  owner._restore = (data, slot, options) => {
    owner.restores.push({ data, slot, options });
    return { restored: true, slot };
  };
  return owner;
}

test('worker title Continue never loads profile records when the save index is absent', t => {
  const storage = storageFor(t, {
    [ACHIEVEMENTS_STORAGE_KEY]: PROFILE,
    [CRUCIBLE_META_STORAGE_KEY]: JSON.stringify({ fmt: 'spaceface-crucible-meta' }),
    'sf.save.other_profile': JSON.stringify({ fmt: 'other-profile', savedAt: WHEN, playtimeS: 9000 }),
  });
  assert.deepEqual(publicContinue(), [], 'no load intent or fade without a game save');
  assert.equal(storage.getItem(ACHIEVEMENTS_STORAGE_KEY), PROFILE, 'earned profile data stays intact');
});

for (const [name, raw] of [['current', currentEnvelope()], ['legacy v1', LEGACY],
  ['compressed', compressedEnvelope()]]) {
  test(`worker title discovers a ${name} save under a custom slot without an index`, async t => {
    storageFor(t, { [ACHIEVEMENTS_STORAGE_KEY]: PROFILE, 'sf.save.my-expedition': raw,
      'sf.save.index': '{truncated' });
    assert.deepEqual(publicContinue(), [
      { name: 'fade' }, { name: 'game:load', payload: { slot: 'my-expedition' } },
    ]);
    assert.equal(saveOwner()._latestSlot(), 'my-expedition');
    assert.equal(await saveOwner()._latestSlotAsync(), 'my-expedition');
  });
}

test('title index and facade metadata cannot advertise reserved profile names as slots', t => {
  const polluted = { achievements: { savedAt: '2099-01-01', playtimeS: 99999 },
    crucible_meta: { savedAt: '2099-01-01', playtimeS: 99999 },
    'custom-route': { savedAt: WHEN, playtimeS: 1 } };
  storageFor(t, { 'sf.save.index': JSON.stringify(polluted) });
  const expected = [{ name: 'fade' },
    { name: 'game:load', payload: { slot: 'custom-route' } }];
  assert.deepEqual(publicContinue(), expected);
  assert.deepEqual(publicContinue({ listSlotsIndexCards: () => Object.entries(polluted)
    .map(([slot, meta]) => ({ slot, ...meta })) }), expected);
  assert.equal(selectLatestOccupiedSlot(polluted), 'custom-route');
  assert.equal(selectLatestOccupiedSlot({ achievements: polluted.achievements,
    crucible_meta: polluted.crucible_meta }), null);
});

test('sync and async save discovery reject even hash-matching profile index cards', async t => {
  const raw = currentEnvelope();
  const index = { achievements: { savedAt: '2099-01-01', playtimeS: 99999,
    _blobHash: fnv1a(PROFILE), _recoveryBlobHash: fnv1a(PROFILE),
    _recoveryCard: { slot: 'achievements', savedAt: '2099-01-01', playtimeS: 99999 } },
    'custom-route': { savedAt: WHEN, playtimeS: 3600 } };
  storageFor(t, { [ACHIEVEMENTS_STORAGE_KEY]: PROFILE, 'sf.recovery.achievements': PROFILE,
    'sf.save.custom-route': raw, 'sf.save.index': JSON.stringify(index) });
  const owner = saveOwner();
  assert.deepEqual(Object.keys(owner.listSlotsIndexCards()), ['custom-route']);
  await owner._slotIndexValidationInFlight?.promise;
  assert.deepEqual(Object.keys(owner.listSlots()), ['custom-route']);
  assert.equal(owner._latestSlot(), 'custom-route');
  const asyncOwner = saveOwner();
  assert.equal(await asyncOwner._latestSlotAsync(), 'custom-route');
  assert.equal(owner.load('latest'), true);
  assert.equal(owner.restores[0].slot, 'custom-route');
  assert.equal(owner.restores[0].options.skippedNewer, undefined, 'profile records are not corrupt game saves');
});

test('latest still diagnoses a corrupt newer game save while ignoring profile records', t => {
  storageFor(t, { [ACHIEVEMENTS_STORAGE_KEY]: PROFILE, 'sf.save.my-expedition': LEGACY,
    'sf.save.auto': '{truncated', 'sf.save.index': JSON.stringify({
      achievements: { savedAt: '2099-01-01', playtimeS: 99999 },
      'my-expedition': { savedAt: '2026-01-15T10:00:00.000Z', playtimeS: 3600 },
      auto: { savedAt: WHEN, playtimeS: 4000 },
    }) });
  const owner = saveOwner();
  assert.equal(owner.load('latest'), true);
  assert.equal(owner.restores[0].slot, 'my-expedition');
  assert.equal(owner.restores[0].options.skippedNewer.slot, 'auto');
  assert.equal(owner.restores[0].options.skippedNewer.reason, 'parse_failed');
});
