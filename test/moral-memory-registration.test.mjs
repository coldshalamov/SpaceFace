// R-3a9d5dc registration fix: moralMemorySystem was exported but never registered, so the
// whole consequence layer (30s-bucketed tick escalation, offer expiry, witness souring,
// moralMemory:* action verbs) was inert in production. These proofs pin the manifest rows,
// both lookup tables, and — the load-bearing one — a vengeful debt hardening inside a
// booted production runtime stepped past MORAL_PRESSURE_PERIOD_S without touching the
// module's functions directly.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRODUCTION_INIT_ORDER,
  PRODUCTION_UPDATE_ORDER,
  getDeclaredSystemClock,
  validateSystemClockDeclarations,
} from '../src/runtime/authoritativeSystemManifest.js';
import { getNodeSystemFactoryTable } from '../src/runtime/nodeSystemFactoryTable.js';
import { resolveRuntimeManifest } from '../src/runtime/resolveRuntimeManifest.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { createRegistry } from '../src/core/registry.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { MORAL_PRESSURE_PERIOD_S } from '../src/systems/moralMemory.js';

const count = (list, id) => list.filter((x) => x === id).length;

test('manifest carries moralMemory once in both orders on the calendar clock', () => {
  assert.equal(count(PRODUCTION_INIT_ORDER, 'moralMemory'), 1);
  assert.equal(count(PRODUCTION_UPDATE_ORDER, 'moralMemory'), 1);
  // system.name is 'moralMemory' — the id matches directly, no clockLookupId alias needed.
  assert.equal(getDeclaredSystemClock('moralMemory'), 'calendar',
    'the 30s self-gated consequence pass is seconds-scale calendar work, not a 60 Hz join');
  assert.deepEqual(validateSystemClockDeclarations(), [],
    'the new clock declaration leaves the coverage assertion clean');
});

test('both lookup tables resolve the id — materialization cannot throw a missing-system', () => {
  const nodeLookup = getNodeSystemFactoryTable();
  assert.equal(nodeLookup.get('moralMemory')?.name, 'moralMemory', 'Node factory table resolves it');
  const resolved = resolveRuntimeManifest({ profileId: 'production', systemLookup: nodeLookup, nodeSafeOnly: true });
  assert.ok(resolved.authoritativeSystems.some((s) => s && s.name === 'moralMemory'),
    'the materialized init cohort carries the ledger runtime');
  assert.ok(resolved.authoritativeUpdateOrder.some((s) => s && s.name === 'moralMemory'),
    'the materialized update order ticks it');
  const registry = createRegistry({ state: createGameState(11), bus: createBus(), helpers: {}, applyRuntimeFeatures: false });
  assert.equal(registry.get('moralMemory')?.name, 'moralMemory', 'browser registry lookup resolves it');
});

test('a booted production runtime ticks the ledger: a vengeful debt hardens past the pressure period', () => {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 4242 });
  try {
    const { state, bus } = runtime;
    const system = runtime.getSystem('moralMemory');
    assert.ok(system && system.name === 'moralMemory', 'the system is registered and materialized');
    // The ledger slice is created by init (ensureMoralMemory) — not by a test poke.
    assert.ok(state.story && state.story.moralMemory && Array.isArray(state.story.moralMemory.order),
      'init created the save-riding state.story.moralMemory slice');
    // The debt feed rides the production bus wiring (encounterDirector owns
    // 'moralMemory:remember'); the escalation watch is what the fix switched on.
    const escalated = [];
    bus.on('moralMemory:escalated', (p) => escalated.push(p));
    bus.emit('moralMemory:remember', {
      id: 'd_booted_runtime', name: 'Booted Debtor', cause: 'spared',
      factionId: 'faction_reach', disposition: 'vengeful',
    });
    const debt = state.story.moralMemory.debts.d_booted_runtime;
    assert.ok(debt && debt.status === 'pending' && debt.disposition === 'vengeful',
      'the production bus feed wrote the vengeful debt');
    const tierBefore = debt.escalationTier | 0;
    // Drive real fixed steps past MORAL_PRESSURE_PERIOD_S (480 s): each step advances
    // simTime through core.preStep, and the calendar cohort ticks the registered system.
    // No call into moralMemory.js — the whole pass must come from the host's step.
    runtime.runTicks(Math.ceil((MORAL_PRESSURE_PERIOD_S + 60) / 1) /* seconds */, 1.0);
    assert.ok(state.simTime - debt.recordedAt >= MORAL_PRESSURE_PERIOD_S,
      `simTime ${state.simTime} carried the debt past one pressure period`);
    assert.ok((debt.escalationTier | 0) > tierBefore,
      `the registered tick hardened the debt (tier ${tierBefore} -> ${debt.escalationTier})`);
    assert.equal(debt.pressureEscalations, 1);
    assert.equal(escalated.length, 1, 'the tick announced the hardening on the bus');
    assert.equal(escalated[0].debtId, 'd_booted_runtime');
    // The same tick path is the bus-verb layer too: emit a verb only the registered
    // system's init subscribes.
    bus.emit('moralMemory:offer', { debtId: 'd_booted_runtime' });
    assert.ok(debt.offer && debt.offer.status === 'open',
      'moralMemory:offer is a live verb in the booted runtime');
  } finally {
    runtime.dispose();
  }
});
