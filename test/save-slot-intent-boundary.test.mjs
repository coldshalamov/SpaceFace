import test from 'node:test';
import assert from 'node:assert/strict';
import { saveSlotIntent } from '../src/ui/screens/saveLoad.js';
import { SLOT_THUMB_MAX_BYTES } from '../src/save/slotStill.js';
import { flattenEventPayload } from '../scripts/lib/simEventBridge.mjs';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { save } from '../src/save/saveSystem.js';

class Canvas {
  toDataURL() { return 'data:image/png;base64,' + 'A'.repeat(48000); }
}

test('public slot intent bounds its canvas still before forwarding and native save completion', async () => {
  const source = new Canvas();
  const png = source.toDataURL();
  assert.equal(typeof flattenEventPayload({ slot: 'quick', thumbnail: png, thumbnailSource: source }), 'symbol',
    'the old screen payload loses the entire save intent at the real worker boundary');
  const priorDocument = globalThis.document;
  const priorStorage = globalThis.localStorage;
  const bytes = new Map();
  let drawn = null;
  const bounded = 'data:image/jpeg;base64,' + 'A'.repeat(128);
  globalThis.document = { createElement(type) {
    assert.equal(type, 'canvas');
    return { getContext: () => ({ drawImage(...args) { drawn = args; } }),
      toDataURL: () => bounded };
  } };
  globalThis.localStorage = {
    getItem: key => bytes.get(key) ?? null,
    setItem: (key, value) => bytes.set(key, String(value)),
    removeItem: key => bytes.delete(key),
    key: index => [...bytes.keys()][index] ?? null,
    get length() { return bytes.size; },
  };
  const owner = Object.create(save);
  try {
    const intent = saveSlotIntent('quick', { label: 'Helios route', thumbnail: png, thumbnailSource: source });
    assert.deepEqual(drawn, [source, 0, 0, 160, 90]);
    assert.deepEqual(intent, { slot: 'quick', label: 'Helios route', thumbnail: bounded });
    assert(!('thumbnailSource' in intent));
    assert(bounded.length < SLOT_THUMB_MAX_BYTES);
    const wire = flattenEventPayload({ ...intent, __laneStorage: {} });
    assert.notEqual(typeof wire, 'symbol');
    assert.deepEqual(structuredClone(wire), wire);

    const state = createGameState(4242);
    state.mode = 'paused';
    state.world.currentSectorId = 'sector_helios_prime';
    state.player.credits = 4242;
    const player = makeEntity({ type: 'ship', pos: { x: 0, z: 0 }, radius: 9, hull: 100,
      data: { defId: 'ship_kestrel' }, flags: { isPlayer: true } });
    player.id = 1;
    state.playerId = 1;
    state.entities.set(1, player);
    state.entityList.push(player);
    const bus = createBus();
    const completed = [];
    bus.on('save:completed', payload => completed.push(payload));
    owner.init({ state, bus, helpers: {}, registry: { get: () => null } });
    bus.emit('game:save', wire);
    assert.equal(completed.length, 0, 'a sent command is not a durable completion receipt');
    assert.equal(await owner._activePacedSave.promise, true);
    assert.equal(completed.length, 1);
    assert.equal(completed[0].ok, true);
    assert.equal(completed[0].reason, 'manual');
    const envelope = JSON.parse(bytes.get('sf.save.quick'));
    assert.equal(envelope.label, 'Helios route');
    assert.equal(envelope.thumbnail, bounded);
    assert.equal(envelope.data.player.credits, 4242);
    assert.equal(owner._prepareEnvelopeString(bytes.get('sf.save.quick')).ok, true);
    assert.equal(state.save.currentSlot, 'quick');
  } finally {
    owner.destroy?.();
    if (priorDocument === undefined) delete globalThis.document; else globalThis.document = priorDocument;
    if (priorStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = priorStorage;
  }
});

test('optional or unusable thumbnails cannot block the public save intent', () => {
  assert.deepEqual(saveSlotIntent('quick', { label: '' }), { slot: 'quick', label: '' });
  const intent = saveSlotIntent('2', { thumbnail: 'data:image/png;base64,' + 'A'.repeat(48000),
    thumbnailSource: new Canvas() });
  assert.deepEqual(intent, { slot: '2', label: undefined, thumbnail: null });
  assert.notEqual(typeof flattenEventPayload(intent), 'symbol');
});
