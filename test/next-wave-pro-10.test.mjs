// PRO-10: an export that falls back to the previous copy says which slot.
// Autosave events do not. The export does not write another file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBus } from '../src/core/eventBus.js';
import { fnv1a } from '../src/save/checksum.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { save } from '../src/save/saveSystem.js';
import {
  bindExportRecoveryToasts,
  exportRecoveryToast,
} from '../src/ui/toasts.js';

function makeEnvelope({ slot, savedAt = '2026-07-12T00:05:00.000Z' } = {}) {
  const data = {
    meta: { seed: 4242, playtimeS: 60, createdAt: savedAt, lastSavedAt: savedAt },
    player: {
      credits: 1200,
      activeShipIndex: 0,
      ownedShips: [{ defId: 'ship_kestrel', fittings: [] }],
    },
    cargo: { items: {}, capVolume: 40, capMass: 40 },
    economy: {},
    factions: {},
    world: {
      currentSectorId: 'sector_helios_prime',
      sectors: { sector_helios_prime: { id: 'sector_helios_prime', name: 'Helios Prime' } },
    },
    entities: {
      player: {
        id: 'saved-player', type: 'ship', defId: 'ship_kestrel',
        pos: { x: 10, z: 20 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
        hull: 100, shield: 100, cap: 100, flags: {}, data: {},
      },
      persistent: [],
      simTime: 60,
      tick: 3600,
    },
    missions: { active: [], completed: [], story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 } },
    automation: {},
    settings: { gameplay: {}, video: {}, audio: {}, controls: {} },
  };
  return {
    fmt: 'spaceface-save',
    version: CURRENT_VERSION,
    savedAt,
    playtimeS: 60,
    slot,
    checksum: fnv1a(JSON.stringify(data)),
    data,
  };
}

function makeStorage() {
  const values = new Map();
  let writes = 0;
  return {
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { writes += 1; values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    writes() { return writes; },
    resetWrites() { writes = 0; },
  };
}

test('a recovery export toasts the slot once and autosave events do not', () => {
  assert.equal(exportRecoveryToast(null), null);
  assert.equal(exportRecoveryToast({ slot: '   ' }), null);

  const storage = makeStorage();
  const previousStorage = globalThis.localStorage;
  const previousBus = save.bus;
  const previousState = save.state;
  const bus = createBus();
  const toasts = [];
  bus.on('toast', (payload) => toasts.push(payload));
  const slots = ['berth-7', 'lane-2'];
  try {
    for (const slot of slots) {
      storage.setItem(`sf.save.${slot}`, '{corrupt');
      storage.setItem(`sf.recovery.${slot}`, JSON.stringify(makeEnvelope({ slot })));
    }
    storage.setItem('sf.save.quick', JSON.stringify(makeEnvelope({ slot: 'quick' })));
    storage.resetWrites();
    globalThis.localStorage = storage;
    save.bus = bus;
    save.state = { save: { currentSlot: null } };
    bindExportRecoveryToasts(bus);

    for (const slot of slots) {
      const before = toasts.length;
      const exported = save.exportSlot(slot);
      assert.equal(typeof exported, 'string');
      assert.equal(toasts.length, before + 1);
      const spec = exportRecoveryToast({ slot });
      assert.equal(toasts.at(-1).text, spec.text);
      assert.equal(toasts.at(-1).kind, spec.kind);
      assert.equal(toasts.at(-1).text.includes(slot), true);
      for (const other of slots) {
        if (other !== slot) assert.equal(toasts.at(-1).text.includes(other), false);
      }
    }
    assert.equal(toasts.length, slots.length);

    const beforeHealthy = toasts.length;
    save.exportSlot('quick');
    assert.equal(toasts.length, beforeHealthy);
    assert.equal(storage.writes(), 0);

    bus.emit('save:completed', { autosave: true, slot: 'auto' });
    bus.emit('save:backup', { slot: 'auto', source: 'previous_generation' });
    bus.emit('save:written', { slot: 'auto' });
    bus.emit('save:saved', { slot: 'auto' });
    assert.equal(toasts.length, slots.length);

    const src = readFileSync(new URL('../src/ui/toasts.js', import.meta.url), 'utf8');
    assert.match(src, /bindExportRecoveryToasts\(bus\)/);
  } finally {
    save.bus = previousBus;
    save.state = previousState;
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
