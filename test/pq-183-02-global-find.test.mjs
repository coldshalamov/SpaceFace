// PQ-183.02 — global find and chart notes. One key finds every entity class; notes the player
// writes on the chart round-trip through the same save lane as bookmarks.
import assert from 'node:assert/strict';
import test from 'node:test';

import { searchEntities, resolveEntity, entityExists } from '../src/ui/entityResolver.js';
import { createScreenMemory } from '../src/ui/screenMemory.js';
import { createBus } from '../src/core/eventBus.js';
import galaxyMapScreen from '../src/ui/galaxyMap.js';

function makeState() {
  return {
    simTime: 500,
    ui: {},
    factions: {},
    missions: {
      active: [{ id: 'msn_ferry_1', title: 'Ferry the Envoy', deadline_s: 900 }],
      boards: { station_helios: { slots: [{ id: 'msn_board_1', title: 'Ore to the Forge' }] } },
    },
    entities: new Map(),
  };
}

test('find reaches every entity class the resolver can open', () => {
  const state = makeState();
  const found = (q) => searchEntities(state, q, { limit: 50 });

  assert.ok(found('Meridian').some((r) => r.type === 'faction'));
  assert.ok(found('Iron Ore').some((r) => r.type === 'commodity'));
  assert.ok(found('Helios Station').some((r) => r.type === 'station'));
  assert.ok(found('Pelican').some((r) => r.type === 'hull'));
  assert.ok(found('Shield Booster').some((r) => r.type === 'module'));
  assert.ok(found('Cade').some((r) => r.type === 'captain'));
  assert.ok(found('Helios Prime').some((r) => r.type === 'sector'));
  assert.ok(found('Ferry the Envoy').some((r) => r.type === 'contract'));
  assert.ok(found('Ore to the Forge').some((r) => r.type === 'contract'));

  // One broad query reaches many kinds — the point of a global find, not a per-screen filter.
  const classes = new Set(searchEntities(state, 'a', { limit: 400 }).map((r) => r.type));
  for (const t of ['faction', 'commodity', 'station', 'hull', 'module', 'captain', 'sector']) {
    assert.ok(classes.has(t), `class ${t} missing from a broad query`);
  }
});

test('find never returns an unresolvable ref — live contract in, dead contract out', () => {
  const state = makeState();
  assert.ok(searchEntities(state, 'Ferry').some((r) => r.ref === 'contract:msn_ferry_1'));
  for (const r of searchEntities(state, 'a', { limit: 400 })) {
    assert.ok(entityExists(r.ref), `unresolvable result ${r.ref}`);
    assert.ok(resolveEntity(state, r.ref), `dossier refused ${r.ref}`);
  }
  state.missions.active = [];
  assert.ok(!searchEntities(state, 'Ferry').some((r) => r.type === 'contract'));
  assert.equal(searchEntities(state, '').length, 0);
});

test('prefix matches outrank substring matches', () => {
  const state = makeState();
  const rows = searchEntities(state, 'Helios', { limit: 50 });
  assert.ok(rows.length > 0);
  assert.ok(rows[0].label.toLowerCase().startsWith('helios'));
});

test('chart notes round-trip through the galaxyMap screenMemory bag', () => {
  const state = makeState();
  const mem = createScreenMemory(state);
  const screen = galaxyMapScreen;
  const prevCtx = screen._ctx;
  const prevNotes = screen._notes;
  screen._ctx = { screenMemory: mem, state };

  screen._notes = new Map([['sector:sector_helios_prime', 'sell the ore here first']]);
  screen._rememberScreenState();

  const bag = createScreenMemory(state).get('galaxyMap');
  assert.deepEqual(bag.notes, [{ ref: 'sector:sector_helios_prime', text: 'sell the ore here first' }]);

  // Restore into a clean screen state — the note comes back; a save without notes clears stale ones.
  screen._notes = new Map([['sector:stale', 'leak']]);
  screen._restoreScreenState();
  assert.equal(screen._notes.get('sector:sector_helios_prime'), 'sell the ore here first');
  assert.equal(screen._notes.get('sector:stale'), undefined);

  screen._ctx = prevCtx;
  screen._notes = prevNotes;
});

test('chart sweep verb fires world:requestSectorScan only for the sector the ship is in', () => {
  const state = makeState();
  state.mode = 'flight';
  state.world = { currentSectorId: 'sector_helios_prime' };
  const bus = createBus();
  const emitted = [];
  bus.on('world:requestSectorScan', (p) => emitted.push(p));

  const screen = galaxyMapScreen;
  const prevCtx = screen._ctx;
  const prevTarget = screen._selectedTarget;
  screen._ctx = { bus, state };

  screen._selectedTarget = { kind: 'sector', id: 'sector_helios_prime' };
  assert.equal(screen._activatePlaceAction('sweep-sector'), true);
  assert.equal(emitted.length, 1, 'the verb emits the shipped sector-scan intent');

  // A remote sector refuses — the ship's sensors cannot reach it, and the control says so.
  screen._selectedTarget = { kind: 'sector', id: 'sector_ceres_belt' };
  assert.equal(screen._activatePlaceAction('sweep-sector'), false);
  assert.equal(emitted.length, 1);

  // Docked is not flying — the sweep is a flight instrument.
  state.mode = 'docked';
  screen._selectedTarget = { kind: 'sector', id: 'sector_helios_prime' };
  assert.equal(screen._activatePlaceAction('sweep-sector'), false);
  assert.equal(emitted.length, 1);

  screen._ctx = prevCtx;
  screen._selectedTarget = prevTarget;
});
