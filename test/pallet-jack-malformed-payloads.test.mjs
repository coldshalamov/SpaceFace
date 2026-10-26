// Regression pin: bus listeners whose guard is `entity?.id === p?.field` must not open
// when the payload omits the field — undefined === undefined used to slip the guard and
// deref the null lookup, throwing inside dispatch on every matching emit. The unique-wreck
// salvage grant emits pickup:collected with NO pickupId, so any pilot salvage while no
// pallet incident was live logged a handler fault per pickup.
// Run: node --test test/pallet-jack-malformed-payloads.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { busFaultSummary } from '../src/core/eventBus.js';
import { palletJack } from '../src/systems/palletJack.js';

const WATCHED = new Set(['pickup:collected', 'combat:damage', 'palletJack:trail']);
function watchedFaults() {
  const byEvent = new Map();
  for (const row of busFaultSummary(64)) {
    if (WATCHED.has(row.event)) byEvent.set(row.event, (byEvent.get(row.event) || 0) + row.faults);
  }
  return byEvent;
}
function faultDelta(before, after) {
  const out = new Map();
  for (const [ev, n] of after) out.set(ev, n - (before.get(ev) || 0));
  return out;
}

test('malformed pickups and hits with no live incident never fault the pallet-jack listeners', async () => {
  const sim = createSimulation({ seed: 79, systems: [palletJack] });
  try {
    sim.state.mode = 'flight';
    const before = watchedFaults();
    // The real uniqueWrecks salvage-grant shape: no pickupId at all.
    sim.bus.emit('pickup:collected', {
      collectorId: 'player', kind: 'cargo', amount: 2,
      commodityId: 'cmdty_ore_iron', source: 'unique_wreck', wreckId: 'w1', pos: { x: 0, z: 0 },
    });
    // Same hole in the sibling guards: no targetId, no incidentId.
    sim.bus.emit('combat:damage', { amount: 10 });
    sim.bus.emit('palletJack:trail', {});
    sim.runTicks(5);

    const delta = faultDelta(before, watchedFaults());
    for (const [ev, n] of delta) {
      assert.equal(n, 0, `${ev} listener faulted ${n}× on a payload missing its correlation field`);
    }
    const jack = sim.registry.get('palletJack');
    assert.equal(jack._pendingCollection, null, 'no cargo was bound from an id-less payload');
  } finally { sim.dispose(); }
});
