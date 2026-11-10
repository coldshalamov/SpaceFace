// Seed 4242 — a hollow-hall core that faults on its first watch says so, and the lens does not call it idle.
import test from 'node:test';
import assert from 'node:assert/strict';

import { generateDrillField, tileIndex } from '../src/systems/drill.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { machineStatusRow } from '../src/ui/asteroid/inspector.js';
import { COMMODITIES } from '../src/data/commodities.js';

const EMPTY = () => ({ type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 });
const POCKET = [[14, 2], [14, 0], [14, 1], [13, 2], [15, 2], [13, 1], [15, 1], [13, 3], [14, 3]];
const RING = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

function harness() {
  const toasts = [];
  const bus = {
    on() { return () => {}; },
    emit(name, payload) { if (name === 'toast') toasts.push(payload); },
  };
  const entities = new Map();
  const state = {
    simTime: 4,
    tick: 240,
    meta: { seed: 4242 },
    entities,
    playerId: 1,
    player: {
      cargo: {
        items: {
          cmdty_regocrete: 400,
          cmdty_control_unit: 80,
          cmdty_refined_metals: 120,
          cmdty_electronics: 80,
          cmdty_purified_silica: 60,
        },
        usedVolume: 0,
        usedMass: 0,
        capVolume: 9000,
        capMass: 14000,
      },
    },
    world: { currentSectorId: 'sector_ashfall_reach' },
    content: { commodities: COMMODITIES },
    rng: { next() { return 0.42; } },
  };
  let nextId = 100;
  const helpers = {
    spawnEntity(spec) {
      const ent = { id: nextId++, alive: true, ...spec, data: spec.data || {} };
      entities.set(ent.id, ent);
      return ent;
    },
  };
  const sys = Object.create(asteroidSites);
  sys.init({ state, bus, helpers, registry: { get() { return null; } } });
  entities.set(42, {
    id: 42, type: 'asteroid', alive: true, pos: { x: 40, z: 12 }, radius: 9,
    data: { typeId: 'ast_common_rock', yieldU: 18, drillCleared: [], fieldId: 'field_ash' },
  });
  const field = generateDrillField(42);
  for (const [c, r] of POCKET) field[c][r] = EMPTY();
  entities.get(42).data.drillCleared = POCKET.map(([c, r]) => tileIndex(c, r));
  state.drill = { active: true, asteroidId: 42, field, avatar: { col: 14, row: 2 } };
  const core = sys.installMachine({ asteroidId: 42, defId: 'sm_massline_core', col: 14, row: 1 });
  assert.equal(core.ok, true, core.reason || 'core installs');
  const site = sys.getSite(core.siteId);
  for (const [dc, dr] of RING) {
    const id = tileIndex(14 + dc, 1 + dr);
    if (!site.cleared.includes(id)) site.cleared.push(id);
  }
  const rt = sys._rt && sys._rt.get(site.id);
  if (rt) rt.fieldDirty = true;
  return { sys, state, site, toasts };
}

test('a hollow Ashfall core cuts output and the claim says so on the first watch', () => {
  const { sys, state, site, toasts } = harness();
  sys._tickSite(site, 1, state);
  const core = site.machines.find((m) => m.defId === 'sm_massline_core');
  const status = sys._runtime(site).status[core.id];
  assert.equal(status.state, 'overheat');
  assert.equal(status.limit, 'thermal');
  const line = 'Massline Core overheated — output is cut until it cools.';
  assert.equal(toasts.filter((t) => t.text === line).length, 1);
  assert.equal(site.ledger.some((entry) => entry.text === line), true);
  const lens = machineStatusRow(status);
  assert.equal(lens.body, 'Overheated — output cut');
  assert.equal(lens.tone, 'coral');
  sys._tickSite(site, 1, state);
  assert.equal(toasts.filter((t) => t.text === line).length, 1, 'the fault is said once');
});
