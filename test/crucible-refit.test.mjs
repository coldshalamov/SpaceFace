// CRU-017 — the ten-wave refit goes through the real fitting authority, reaches EVERY spare the
// run has earned (not just the newest), says why a fit was refused, and a run's modifiers never
// reach a persistent fitting.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { TECH_NODES } from '../src/data/tech.js';
import { runSession } from '../src/systems/runSession.js';
import { ships } from '../src/systems/ships.js';
import { economy } from '../src/systems/economy.js';
import { save } from '../src/save/saveSystem.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';
import { refitRowLines } from '../src/ui/screens/crucibleDraft.js';

const ARENA = 'helios_core';
const SEED = 7;
const REFIT_SCREEN_SOURCE = readFileSync(
  fileURLToPath(new URL('../src/ui/screens/crucibleDraft.js', import.meta.url)),
  'utf8',
);
/** The same source with comment lines dropped — the header describes the old bug by name. */
const REFIT_SCREEN_CODE = REFIT_SCREEN_SOURCE
  .split('\n')
  .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
  .join('\n');

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

// ── CRU-017b: every spare is reachable, and a refusal is spoken ──────────────

test('the refit reaches a spare that is not the newest', () => {
  const harness = boot();
  // Three drafted weapons, oldest first. The surface used to offer only the last one.
  for (const defId of ['wpn_railgun_m', 'wpn_missile_rack_m', 'wpn_autocannon_m']) {
    ships.grantModule({ defId, reason: 'crucible:draft' });
  }
  const inventory = harness.state.player.moduleInventory;
  const oldest = inventory.find((m) => m.defId === 'wpn_railgun_m');
  const newest = inventory.at(-1);
  assert.notEqual(oldest.instanceId, newest.instanceId, 'the oldest spare is not the newest');

  enterRefit(harness);
  const rows = survivalDraft.refitRows();
  const empty = rows.find((row) => !row.defId && row.spares.length > 0);
  assert.ok(empty, 'an empty hardpoint is offered spares');
  assert.ok(empty.spares.length >= 3, `all ${empty.spares.length} compatible spares are reachable`);
  assert.ok(
    empty.spares.some((spare) => spare.instanceId === oldest.instanceId),
    'including the OLDEST — the whole run inventory, not just the last card drafted',
  );

  // And the screen renders every one of them as a choice.
  const lines = refitRowLines(empty);
  assert.equal(lines.action, 'Fit');
  assert.equal(lines.disabled, false);
  assert.equal(lines.options.length, empty.spares.length);
  assert.ok(lines.options.some((option) => option.instanceId === oldest.instanceId));

  // Fitting the one that is NOT newest actually lands.
  harness.bus.emit('run:refitFitRequested', { slotIndex: empty.slotIndex, instanceId: oldest.instanceId });
  assert.equal(activeShip(harness).fittings[empty.slotIndex], 'wpn_railgun_m');
  assert.equal(named(harness.emitted, 'run:refitChanged').at(-1).payload.ok, true);
});

test('a spare that cannot enter a hardpoint is never offered for it', () => {
  const harness = boot({ hullId: 'ship_kestrel' });
  ships.grantModule({ defId: 'wpn_railgun_m', reason: 'test' });   // size M
  enterRefit(harness);
  const weaponRow = survivalDraft.refitRows().find((row) => row.slotType === 'weapon');
  assert.ok(weaponRow, 'the Kestrel has a weapon hardpoint');
  assert.equal(weaponRow.slotSize, 'S');
  assert.ok(
    !weaponRow.spares.some((spare) => spare.defId === 'wpn_railgun_m'),
    'an M weapon is not listed for an S hardpoint',
  );
});

test('a refused fit is reported in plain words, not by a button that does nothing', () => {
  const harness = boot({ hullId: 'ship_kestrel' });
  ships.grantModule({ defId: 'wpn_railgun_m', reason: 'test' });
  const railgun = harness.state.player.moduleInventory.at(-1);
  enterRefit(harness);

  harness.bus.emit('run:refitFitRequested', { slotIndex: 0, instanceId: railgun.instanceId });

  const changed = named(harness.emitted, 'run:refitChanged').at(-1);
  assert.equal(changed.payload.ok, false);
  assert.equal(typeof changed.payload.reason, 'string');
  assert.ok(changed.payload.reason.length > 0, 'the refusal carries a reason');
  assert.match(changed.payload.reason, /fit/i);
  // The surface reads that same sentence back — this is the line the player sees.
  assert.equal(survivalDraft.lastNotice(), changed.payload.reason);
});

test('a refused strip is reported too', () => {
  const harness = boot();
  enterRefit(harness);
  const emptyIndex = activeShip(harness).fittings.findIndex((defId) => !defId);
  assert.ok(emptyIndex >= 0, 'the hull has an empty hardpoint');

  harness.bus.emit('run:refitStripRequested', { slotIndex: emptyIndex });

  const changed = named(harness.emitted, 'run:refitChanged').at(-1);
  assert.equal(changed.payload.ok, false);
  assert.match(changed.payload.reason, /already empty/);
  assert.equal(survivalDraft.lastNotice(), changed.payload.reason);
});

test('an empty hardpoint with nothing to put in it says so', () => {
  const lines = refitRowLines({ slotIndex: 2, defId: null, name: null, spares: [] });
  assert.equal(lines.label, 'Hardpoint 3');
  assert.equal(lines.disabled, true);
  assert.match(lines.value, /no spare/i);
  assert.deepEqual(lines.options, []);

  const filled = refitRowLines({ slotIndex: 0, defId: 'wpn_railgun_m', name: 'Railgun M', spares: [] });
  assert.equal(filled.action, 'Strip');
  assert.equal(filled.value, 'Railgun M');
  assert.equal(refitRowLines(null), null);
});

test('the refit surface asks the owner for spares and never reaches for the newest one', () => {
  assert.equal(typeof survivalDraft.refitRows, 'function');
  assert.match(REFIT_SCREEN_SOURCE, /owner\.refitRows/, 'the screen draws rows from the owner');
  assert.ok(
    !/spares\[\s*spares\.length\s*-\s*1\s*\]/.test(REFIT_SCREEN_CODE),
    'the newest-spare-only reach is gone from the code',
  );
  assert.match(REFIT_SCREEN_SOURCE, /run:refitFitRequested/, 'fits still go out as the run intent');
  assert.match(REFIT_SCREEN_SOURCE, /run:refitStripRequested/, 'and so do strips');
  assert.match(REFIT_SCREEN_SOURCE, /owner\.lastNotice/, 'a refusal is rendered, not swallowed');
  assert.match(REFIT_SCREEN_SOURCE, /aria-live/, 'and it is announced');
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
