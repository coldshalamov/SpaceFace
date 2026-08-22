// CRU-017 — the ten-wave refit goes through the real fitting authority, and a run's modifiers
// never reach a persistent fitting.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { TECH_NODES } from '../src/data/tech.js';
import { runSession } from '../src/systems/runSession.js';
import { ships } from '../src/systems/ships.js';
import { economy } from '../src/systems/economy.js';
import { save } from '../src/save/saveSystem.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';

const ARENA = 'helios_core';
const SEED = 7;

function boot({ seed = SEED, hullId = 'ship_hornet' } = {}) {
  const state = createGameState(seed);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const registry = {
    get(name) {
      if (name === 'ships') return ships;
      if (name === 'economy') return economy;
      if (name === 'survivalDraft') return survivalDraft;
      return null;
    },
  };
  const ctx = { state, bus, helpers: {}, registry };
  economy.init(ctx);
  ships.init(ctx);
  if (economy.newGame) economy.newGame();
  if (ships.newGame) ships.newGame();
  runSession.init(ctx);
  survivalDraft.init(ctx);

  state.player.researchPoints += TECH_NODES.reduce((s, n) => s + ((n.cost && n.cost.rp) || 0), 0) + 1000;
  const cost = TECH_NODES.reduce((s, n) => s + ((n.cost && n.cost.credits) || 0), 0);
  if (cost > 0) economy.grantCredits(cost, 'test:tech');
  for (let pass = 0; pass < TECH_NODES.length + 1; pass++) {
    let progressed = false;
    for (const node of TECH_NODES) {
      if (!state.player.researchedNodes.includes(node.id) && ships.unlockTech(node.id)) progressed = true;
    }
    if (!progressed) break;
  }
  ships.buyShip({ defId: hullId, setActive: true, grant: true });
  return { state, bus, emitted, ctx, registry };
}

function named(emitted, event) {
  return emitted.filter((entry) => entry.event === event);
}

function enterRefit(harness, wave = 10) {
  harness.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: SEED, arenaId: ARENA });
  let from = 'loadout';
  for (const next of ['arena_intro', 'wave_intro', 'active', 'cleanup', 'refit']) {
    harness.bus.emit('run:transitionRequested', { expectedPhase: from, nextPhase: next, reason: 't', tick: 0 });
    from = next;
  }
  harness.state.run.wave = wave;
  return harness.state.run;
}

function activeShip(harness) {
  const p = harness.state.player;
  return p.ownedShips[p.activeShipIndex];
}

function withSave(state, fn) {
  const prev = { state: save.state, bus: save.bus, helpers: save.helpers, registry: save.registry };
  save.state = state;
  save.bus = createBus();
  save.helpers = {};
  save.registry = { get() { return null; } };
  try {
    return fn(save);
  } finally {
    save.state = prev.state;
    save.bus = prev.bus;
    save.helpers = prev.helpers;
    save.registry = prev.registry;
  }
}

test('the refit phase opens the refit surface and announces the live loadout', () => {
  const harness = boot();
  ships.grantModule({ defId: 'wpn_railgun_m', reason: 'test' });
  const inst = harness.state.player.moduleInventory.at(-1);
  ships.fitModule({ slotIndex: 0, instanceId: inst.instanceId });

  enterRefit(harness);
  const offered = named(harness.emitted, 'run:refitOffered');
  assert.equal(offered.length, 1);
  assert.equal(offered[0].payload.loadout.hullId, 'ship_hornet');
  assert.equal(offered[0].payload.loadout.fittings[0], 'wpn_railgun_m');
  const pushed = named(harness.emitted, 'ui:pushScreen').at(-1);
  assert.equal(pushed.payload.id, 'crucibleRefit');
});

test('stripping and fitting during refit route through the real ships authority', () => {
  const harness = boot();
  ships.grantModule({ defId: 'wpn_railgun_m', reason: 'test' });
  const railgun = harness.state.player.moduleInventory.at(-1);
  ships.fitModule({ slotIndex: 0, instanceId: railgun.instanceId });
  enterRefit(harness);

  harness.bus.emit('run:refitStripRequested', { slotIndex: 0 });
  assert.equal(activeShip(harness).fittings[0], null, 'the hardpoint is empty');
  assert.equal(named(harness.emitted, 'module:unequipped').length, 1, 'the canonical receipt fired');

  const spare = harness.state.player.moduleInventory.find((m) => m.defId === 'wpn_railgun_m');
  harness.bus.emit('run:refitFitRequested', { slotIndex: 1, instanceId: spare.instanceId });
  assert.equal(activeShip(harness).fittings[1], 'wpn_railgun_m', 'it moved to the other hardpoint');
  assert.equal(named(harness.emitted, 'module:equipped').length >= 1, true);
  assert.equal(named(harness.emitted, 'run:refitChanged').length, 2);
});

test('the refit refuses an illegal fit through the same validation every other caller gets', () => {
  const harness = boot({ hullId: 'ship_kestrel' });
  ships.grantModule({ defId: 'wpn_railgun_m', reason: 'test' });   // size M
  const railgun = harness.state.player.moduleInventory.at(-1);
  enterRefit(harness);
  // Kestrel's only weapon hardpoint is S. The fitting authority says no; the run does not
  // work around it.
  harness.bus.emit('run:refitFitRequested', { slotIndex: 0, instanceId: railgun.instanceId });
  assert.notEqual(activeShip(harness).fittings[0], 'wpn_railgun_m');
  const changed = named(harness.emitted, 'run:refitChanged');
  assert.equal(changed.at(-1).payload.ok, false);
});

test('refit edits are refused outside the refit phase', () => {
  const harness = boot();
  ships.grantModule({ defId: 'wpn_railgun_m', reason: 'test' });
  const spare = harness.state.player.moduleInventory.at(-1);
  harness.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: SEED, arenaId: ARENA });
  harness.bus.emit('run:refitFitRequested', { slotIndex: 0, instanceId: spare.instanceId });
  assert.equal(activeShip(harness).fittings[0], null);
  assert.equal(named(harness.emitted, 'run:refitChanged').length, 0);
});

test('closing the refit emits the receipt survivalRun waits on', () => {
  const harness = boot();
  enterRefit(harness);
  harness.bus.emit('run:refitCloseRequested', {});
  const closed = named(harness.emitted, 'run:refitClosed');
  assert.equal(closed.length, 1);
  assert.equal(closed[0].payload.wave, 10);
});

test('a run\'s fittings are the run\'s own ephemeral hull and never reach the Adventure save', () => {
  const harness = boot();
  // A campaign autosave must be refused for the whole live run — that is what keeps a drafted
  // weapon out of the Adventure slot. This is the real boundary, not a rule about live arrays.
  withSave(harness.state, (s) => {
    assert.equal(s._campaignAutosaveSuppressed(), false, 'inactive run: campaign saves normally');
  });
  enterRefit(harness);
  ships.grantModule({ defId: 'wpn_railgun_m', reason: 'crucible:draft' });
  const spare = harness.state.player.moduleInventory.at(-1);
  harness.bus.emit('run:refitFitRequested', { slotIndex: 0, instanceId: spare.instanceId });
  assert.equal(activeShip(harness).fittings[0], 'wpn_railgun_m');
  withSave(harness.state, (s) => {
    assert.equal(s._campaignAutosaveSuppressed(), true, 'a live run cannot autosave over Adventure');
    // state.run itself is never serialized, so no run modifier can ride a save out either.
    const data = s.serializeData();
    assert.ok(!Object.prototype.hasOwnProperty.call(data, 'run'));
    assert.ok(!s._saveCapturePlan().map(([key]) => key).includes('run'));
  });

  // Ending the run releases the gate again, so Adventure resumes saving normally afterwards.
  harness.bus.emit('run:endRequested', { outcome: 'defeat', reason: 'test', tick: 1 });
  harness.bus.emit('save:restoring', { slot: 'manual' });
  withSave(harness.state, (s) => {
    assert.equal(s._campaignAutosaveSuppressed(), false);
  });
});

test('the modifier record stays a note: no live reference into fittings, no stat delta', () => {
  const harness = boot();
  harness.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: SEED, arenaId: ARENA });
  const fittings = activeShip(harness).fittings;
  harness.bus.emit('run:modifierRecordRequested', {
    record: { kind: 'weapon', defId: 'wpn_railgun_m', slotIndex: 0, verb: 'Pierce' },
    wave: 10,
  });
  const record = harness.state.run.modifiers[0];
  assert.notEqual(record, fittings);
  assert.equal(activeShip(harness).fittings, fittings, 'the fittings array identity is untouched');
  for (const value of Object.values(record)) {
    assert.notEqual(typeof value, 'function');
  }
});
