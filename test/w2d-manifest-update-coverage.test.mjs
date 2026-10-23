// O39: eight faction systems (gardens, fulfillment trains, Pitborn cull, Vael liens, archive
// redaction, choir resonance, Verge court, frontier homesteads) were in PRODUCTION_INIT_ORDER but not
// PRODUCTION_UPDATE_ORDER, so their update() - real per-tick work - never ran in the shipped game while
// focused hosts passed. Review R-04fe464 put them in; this pins the whole class: an owner that is
// initialised and has an update() must be in the update order exactly once, or be named below.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRegistry } from '../src/core/registry.js';
import {
  PRODUCTION_INIT_ORDER,
  PRODUCTION_UPDATE_ORDER,
  SYSTEM_CLOCK,
  getSystemClock,
} from '../src/runtime/authoritativeSystemManifest.js';

// Owners that have an update() and are deliberately NOT stepped by the sim loop.
const NOT_STEPPED = Object.freeze({
  ships: 'update() is an empty stub: an event-only system (cargo owns the per-tick mass boundary)',
  swarmSupply: 'update() is an empty stub; supply drops are event-driven',
  provenanceLedger: 'update() is an empty stub; the ledger is written by events',
  spawnBudget: 'update() is "intentionally inert" (src/systems/spawnBudget.js); it is a budget service',
  economyContracts: 'update() only drains mass-scale notices, which ride the economy:tick event instead '
    + '(see the comment in economyContracts.init)',
  vfx: 'presentation host: stepped once per rendered frame by core/renderUpdatePhase.js, not per sim tick',
  audio: 'presentation host: update() is a documented no-op, the audio layer drives itself from _frame()',
  survivalAnnounce: 'KNOWN GAP: update() only emits the arena/wave intro-complete receipts. survivalRun keeps '
    + 'its own tick floor of the same length, so phase timing does not depend on it. Wiring it in moves '
    + 'Crucible phase timing and the pinned order length - a separate change.',
});

const FACTION_STRANGE = Object.freeze([
  'understoryGardens', 'fulfillmentRoutes', 'pitbornCull', 'vaelLiens',
  'archiveRedaction', 'choirResonance', 'vergeCourt', 'frontierHomesteads',
]);

function registryOwners() {
  const registry = createRegistry({ state: createGameState(7), bus: createBus(), helpers: {} });
  return (id) => registry.get(id);
}

test('every initialised owner with an update() is in the update order exactly once, or named as not stepped', () => {
  const owner = registryOwners();
  const counts = new Map();
  for (const id of PRODUCTION_UPDATE_ORDER) counts.set(id, (counts.get(id) || 0) + 1);

  const dupes = [...counts].filter(([, n]) => n > 1).map(([id]) => id);
  assert.deepEqual(dupes, [], `ids listed more than once in the update order: ${dupes.join(', ')}`);

  const unstepped = [];
  for (const id of PRODUCTION_INIT_ORDER) {
    const system = owner(id);
    if (!system || typeof system.update !== 'function') continue;
    if (counts.get(id) === 1 || Object.hasOwn(NOT_STEPPED, id)) continue;
    unstepped.push(id);
  }
  assert.deepEqual(unstepped, [],
    `owners with an update() that production never steps (add to PRODUCTION_UPDATE_ORDER + a clock, or to NOT_STEPPED with a reason): ${unstepped.join(', ')}`);
});

test('the not-stepped list is honest: each entry still exists, still has update(), and is still unstepped', () => {
  const owner = registryOwners();
  for (const id of Object.keys(NOT_STEPPED)) {
    assert.ok(PRODUCTION_INIT_ORDER.includes(id), `${id} is no longer initialised - drop it from NOT_STEPPED`);
    assert.equal(typeof owner(id)?.update, 'function', `${id} lost its update() - drop it from NOT_STEPPED`);
    assert.ok(!PRODUCTION_UPDATE_ORDER.includes(id), `${id} is stepped now - drop it from NOT_STEPPED`);
  }
});

test('the eight faction-strange systems each update once per tick, between factions and sectorSim', () => {
  const owner = registryOwners();
  const factions = PRODUCTION_UPDATE_ORDER.indexOf('factions');
  const sectorSim = PRODUCTION_UPDATE_ORDER.indexOf('sectorSim');
  assert.ok(factions >= 0 && sectorSim > factions);
  for (const id of FACTION_STRANGE) {
    assert.equal(PRODUCTION_UPDATE_ORDER.filter((entry) => entry === id).length, 1, `${id} appears once`);
    const at = PRODUCTION_UPDATE_ORDER.indexOf(id);
    assert.ok(at > factions && at < sectorSim, `${id} sits after factions and before sectorSim`);
    assert.equal(typeof owner(id)?.update, 'function', `${id} has an update()`);
    assert.equal(getSystemClock(id), SYSTEM_CLOCK.TABLE, `${id} declares the per-step table clock`);
  }
});
