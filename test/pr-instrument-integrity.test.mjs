import test from 'node:test';
import assert from 'node:assert/strict';
import { statisticsModel } from '../src/core/statistics.js';
import { statisticsScreen } from '../src/ui/screens/statistics.js';
import { importValidatedSave } from '../src/ui/screens/saveLoad.js';
import { recordedKitId } from '../src/ui/screens/resultsSheet.js';
import { announceBindingConflict } from '../src/ui/screens/settings.js';
import { save, slotCardFromEnvelopeData } from '../src/save/saveSystem.js';
import { sanitizeWindowState } from '../electron/windowState.cjs';
import { fakeDom, textLines } from './helpers/fake-dom.mjs';

test('statistics keeps career kills consistent with its cause rows and names current law', () => {
  const model = statisticsModel({
    career: { killsByWeapon: { kinetic: 7, explosive: 3 } },
    playerStats: { kills: 1, heat: 0, wantedTier: 'none', lifetimeProfit: 70 },
    law: { heat: 0.8, wanted: 'nets/wedges', fines: 900 },
  });
  assert.deepEqual(model.groups.find(g => g.id === 'fight').rows[0], ['Kills', '10']);
  assert.match(model.groups.find(g => g.id === 'trade').label, /this save/);
  const law = model.groups.find(g => g.id === 'law').rows;
  assert.deepEqual(law, [['Status', 'nets/wedges'], ['Heat', '80 %'], ['Outstanding fine', '900 cr']]);
});

test('cached statistics reads the current player whenever it is reopened', () => {
  const previous = globalThis.document;
  const doc = fakeDom();
  globalThis.document = doc;
  const root = doc.createElement('section');
  Object.defineProperty(root, 'innerHTML', { set() { this.children = []; } });
  const screen = { ...statisticsScreen };
  const ctx = { state: { player: { heat: 0, stats: { lifetimeProfit: 70 } } }, bus: { emit() {} } };
  try {
    screen.mount(root, ctx);
    assert.match(textLines(root).join(' '), /70 cr/);
    ctx.state.player = { heat: 0.8, stats: { lifetimeProfit: 450 } };
    screen.onShow(ctx);
    const text = textLines(root).join(' ');
    assert.match(text, /450 cr/);
    assert.match(text, /80 %/);
    assert.doesNotMatch(text, /70 cr/);
    assert.doesNotMatch(text, /No heat/);
  } finally { screen.dispose(); globalThis.document = previous; }
});

test('rejected, missing and asynchronous import authorities never fabricate success', async () => {
  const priorStorage = globalThis.localStorage;
  let writes = 0;
  globalThis.localStorage = { setItem() { writes++; } };
  try {
    assert.equal(await importValidatedSave(null, '{}', '2'), false);
    assert.equal(await importValidatedSave({ importString: async () => false }, '{}', '2'), false);
    assert.equal(await importValidatedSave({ importString: async () => { throw Error('bad checksum'); } }, '{}', '2'), false);
    assert.equal(await importValidatedSave({ importString: async (text, slot) => text === 'valid' && slot === '2' }, 'valid', '2'), true);
    assert.equal(writes, 0, 'the screen never falls back to overwriting a slot directly');
  } finally { globalThis.localStorage = priorStorage; }
});

test('recovery receipts exist before UI subscribers and survive a lazily mounted save screen', () => {
  const state = { save: {} };
  const receipt = { slot: '2', failedReason: 'checksum', recoveredVersion: 12 };
  let observed;
  save._publishRecovery.call({ state, bus: { emit(name) {
    assert.equal(name, 'save:recovered');
    observed = state.save.lastRecovery;
  } } }, receipt);
  assert.deepEqual(observed, receipt);
  assert.notEqual(observed, receipt, 'retained read model does not share a mutable event object');
});

test('imported thumbnails obey the same decoded byte bound as newly saved thumbnails', () => {
  const thumbnail = 'data:image/png;base64,' + 'a'.repeat(40 * 1024);
  const card = slotCardFromEnvelopeData('2', { fmt: 'spaceface-save', version: 1, data: { player: {}, world: {}, meta: {} }, thumbnail });
  assert.equal(card.thumbnail, undefined);
});

test('kit rows can read the starter carried by real immutable run rules', () => {
  assert.equal(recordedKitId({ recordRules: { loadoutRules: JSON.stringify({ starter: 'energy_baseline', ruleset: 'swarm' }) } }), 'energy_baseline');
  assert.equal(recordedKitId({ recordRules: { loadoutRules: '{bad' } }), null);
  assert.equal(recordedKitId({ kitId: 'shove_and_rock' }), 'shove_and_rock');
});

test('binding errors give different controls unique description targets', () => {
  const previous = globalThis.document;
  const doc = fakeDom();
  globalThis.document = doc;
  try {
    const buttons = [0, 1].map(() => { const row = doc.createElement('li'); const button = doc.createElement('button'); row.appendChild(button); return button; });
    for (const button of buttons) announceBindingConflict(button, 'In use: Boost');
    assert.notEqual(buttons[0].getAttribute('aria-describedby'), buttons[1].getAttribute('aria-describedby'));
  } finally { globalThis.document = previous; }
});

test('old borderless settings retain their maximized window behavior', () => {
  const bounds = { x: 0, y: 0, width: 1920, height: 1080 };
  assert.equal(sanitizeWindowState({ ...bounds, mode: 'borderless' }, [{ bounds, workArea: bounds }]).mode, 'maximized');
});
