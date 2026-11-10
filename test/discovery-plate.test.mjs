import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { setReceiptPresenter } from '../src/core/receiptPresenter.js';
import { createDiscoveryPlate } from '../src/ui/discoveryPlate.js';

function fixture() {
  const bus = createBus();
  const ship = { vel: { x: 0, z: 0 } };
  const state = { mode: 'flight', ui: {}, input: {}, playerId: 1,
    player: { tether: { active: false } }, entities: new Map([[1, ship]]),
    world: { sectors: { belt: { name: 'Belt', pois: [{ id: 'vault', name: 'The Vault', type: 'site' }] } } } };
  const shown = [];
  const dispose = setReceiptPresenter(spec => { shown.push(spec); return true; });
  const plate = createDiscoveryPlate({ bus, state });
  return { bus, state, ship, shown, dispose, plate };
}

test('discovery waits for a quiet flight and uses the existing receipt presenter', () => {
  const f = fixture();
  try {
    f.ship.vel.x = 80;
    f.bus.emit('discovery:plateUnlocked', { sectorId: 'belt', poiId: 'vault' });
    f.plate.tick(); assert.equal(f.shown.length, 0);
    f.ship.vel.x = 0; f.state.player.tether.active = true;
    f.plate.tick(); assert.equal(f.shown.length, 0);
    f.state.player.tether.active = false; f.state.input.moveZ = 1;
    f.plate.tick(); assert.equal(f.shown.length, 0);
    f.state.input.moveZ = 0; f.plate.tick();
    assert.equal(f.shown.length, 1);
    assert.equal(f.shown[0].text, 'Discovery: The Vault · saved to Codex');
    f.bus.emit('discovery:plateUnlocked', { sectorId: 'belt', poiId: 'vault' });
    f.plate.tick(); assert.equal(f.shown.length, 1);
  } finally { f.plate.destroy(); f.dispose(); }
});

test('discovery remains queued when receipt lane is unavailable and respects danger', () => {
  const f = fixture();
  const previous = globalThis.document;
  try {
    globalThis.document = { body: { dataset: { sfHudJob: 'fight' } } };
    f.bus.emit('aceMemory:transition', { transition: 'encountered', aceId: 'a', aceName: 'Vora' });
    f.plate.tick(); assert.equal(f.shown.length, 0);
    globalThis.document.body.dataset.sfHudJob = 'cruise';
    f.dispose(); f.plate.tick(); assert.equal(f.shown.length, 0);
    const restore = setReceiptPresenter(spec => { f.shown.push(spec); return true; });
    f.plate.tick(); assert.match(f.shown[0].text, /Vora/);
    restore();
  } finally { f.plate.destroy(); f.dispose(); globalThis.document = previous; }
});

test('queue stays bounded, drains in order, and destroy removes its listeners', () => {
  const f = fixture();
  const originalNow = performance.now;
  let now = 0;
  try {
    performance.now = () => now;
    f.ship.vel.x = 100;
    for (const title of ['one', 'two', 'three', 'four']) f.plate.push({ key: title, title });
    f.ship.vel.x = 0; f.plate.tick();
    assert.match(f.shown[0].text, /two/);
    f.plate.tick(); assert.equal(f.shown.length, 1);
    now += 3500; f.plate.tick(); assert.match(f.shown[1].text, /three/);
    now += 3500; f.plate.tick(); assert.match(f.shown[2].text, /four/);
    f.plate.destroy();
    f.bus.emit('discovery:plateUnlocked', { sectorId: 'belt', poiId: 'vault' });
    now += 3500; f.plate.tick(); assert.equal(f.shown.length, 3);
  } finally { performance.now = originalNow; f.plate.destroy(); f.dispose(); }
});
