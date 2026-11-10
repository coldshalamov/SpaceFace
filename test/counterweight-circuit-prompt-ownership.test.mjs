import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createRegistry } from '../src/core/registry.js';
import { createPresentationRegistry } from '../src/runtime/presentationRegistry.js';
import { mountProExperiencesBrowser } from '../src/features/proExperiencesBrowser.js';

function trackedBus() {
  const bus = createBus(), on = bus.on.bind(bus), counts = new Map();
  bus.on = (name, fn) => {
    counts.set(name, (counts.get(name) || 0) + 1);
    const off = on(name, fn);
    return () => { counts.set(name, counts.get(name) - 1); off(); };
  };
  return { bus, count: name => counts.get(name) || 0 };
}

for (const lane of ['main', 'worker']) test(`${lane} registry and UI mount share each registered prompt owner`, () => {
  const tracked = trackedBus(), ctx = { state: createGameState(), bus: tracked.bus, helpers: {},
    simLane: lane, applyRuntimeFeatures: false };
  ctx.registry = lane === 'worker' ? createPresentationRegistry(ctx) : createRegistry(ctx);
  const circuit = ctx.registry.get('counterweightCircuitPrompt'), tender = ctx.registry.get('salvageTenderPrompt');
  assert.ok(circuit && tender);
  let circuitCalls = 0, tenderCalls = 0;
  const circuitOffer = circuit.offer, tenderOffer = tender.offer;
  circuit.offer = function (value) { circuitCalls++; return circuitOffer.call(this, value); };
  tender.offer = function (value) { tenderCalls++; return tenderOffer.call(this, value); };
  // uiRoot mounts before the registry reaches these two owners in init order.
  const mount = mountProExperiencesBrowser(ctx);
  assert.equal(tracked.count('counterweightCircuit:offer'), 1, 'only the mirror observer exists before owner init');
  circuit.init(ctx); tender.init(ctx);
  assert.equal(tracked.count('counterweightCircuit:offer'), 2, 'one prompt listener plus one mirror observer');
  assert.equal(tracked.count('salvageTender:offer'), 2);
  tracked.bus.emit('counterweightCircuit:offer', { id: 'a', choices: [] });
  tracked.bus.emit('salvageTender:offer', { id: 'b', choices: [] });
  assert.equal(circuitCalls, 1); assert.equal(tenderCalls, 1);
  mount.destroy();
  assert.equal(tracked.count('counterweightCircuit:offer'), 1, 'UI teardown does not destroy its borrowed owner');
  assert.equal(tracked.count('salvageTender:offer'), 1);
  circuit.destroy(); tender.destroy();
  assert.equal(tracked.count('counterweightCircuit:offer'), 0);
  assert.equal(tracked.count('salvageTender:offer'), 0);
});

test('standalone mount owns and releases one prompt of each kind', () => {
  const tracked = trackedBus(), ctx = { state: createGameState(), bus: tracked.bus, helpers: {} };
  const mount = mountProExperiencesBrowser(ctx);
  assert.equal(tracked.count('counterweightCircuit:offer'), 2);
  assert.equal(tracked.count('salvageTender:offer'), 2);
  mount.destroy();
  assert.equal(tracked.count('counterweightCircuit:offer'), 0);
  assert.equal(tracked.count('salvageTender:offer'), 0);
});
