import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { createFloatingText } from '../src/ui/floatingText.js';

function setupFloatingText(t) {
  const previousDocument = globalThis.document;
  const elements = [];
  const doc = {
    createElement() {
      const el = {
        id: '',
        style: {},
        className: '',
        textContent: '',
        children: [],
        appendChild(child) { this.children.push(child); return child; },
      };
      elements.push(el);
      return el;
    },
    getElementById(id) { return elements.find(el => el.id === id) || null; },
  };
  doc.head = doc.createElement();
  doc.body = doc.createElement();
  globalThis.document = doc;
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });

  const player = makeEntity({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 100, hullMax: 100 });
  player.id = 1;
  const enemy = makeEntity({ type: 'ship', team: 1, pos: { x: 20, z: 0 }, hull: 50, hullMax: 50 });
  enemy.id = 2;

  const state = {
    playerId: 1,
    entities: new Map([[1, player], [2, enemy]]),
    settings: {
      showDamageNumbers: true,
      gameplay: { damageNumbers: true },
    },
  };
  const bus = createBus();
  const floating = createFloatingText({
    state,
    bus,
    helpers: {
      worldToScreen(pos) {
        return { x: 100 + pos.x, y: 100 + pos.z, onScreen: true };
      },
    },
  });

  return { state, bus, enemy, floating, elements };
}

test('INST-14: combat:damage with brokeShield does NOT spawn "SHIELD DOWN" floater', (t) => {
  const { bus, enemy, elements } = setupFloatingText(t);

  // Emit damage breaking shield
  bus.emit('combat:damage', {
    targetId: enemy.id,
    attackerId: 1,
    amount: 20,
    brokeShield: true,
    pos: { x: 20, z: 0 },
  });

  // Verify damage number (20) was spawned
  const damageNode = elements.find(el => el.textContent === '20');
  assert.ok(damageNode, 'damage number 20 should appear as floating text');

  // Verify "SHIELD DOWN" floater was NOT spawned
  const shieldDownNode = elements.find(el => el.textContent === 'SHIELD DOWN');
  assert.equal(shieldDownNode, undefined, 'INST-14: "SHIELD DOWN" must not float over the fight');

  const shieldDownClass = elements.find(el => typeof el.className === 'string' && el.className.includes('sf-ft--shielddown'));
  assert.equal(shieldDownClass, undefined, 'INST-14: sf-ft--shielddown class must not be assigned to any active element');
});

test('INST-14: ordinary combat floaters (damage numbers, destroyed) still spawn correctly', (t) => {
  const { bus, enemy, elements } = setupFloatingText(t);

  bus.emit('combat:damage', {
    targetId: enemy.id,
    attackerId: 1,
    amount: 15,
    pos: { x: 20, z: 0 },
  });
  const dmg = elements.find(el => el.textContent === '15');
  assert.ok(dmg, 'damage floater spawns');

  bus.emit('entity:killed', {
    id: enemy.id,
    pos: { x: 20, z: 0 },
  });
  const killed = elements.find(el => el.textContent === 'DESTROYED');
  assert.ok(killed, 'DESTROYED floater spawns');
});
